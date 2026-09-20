'use strict';

const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createReadStream, existsSync, statSync } = require('node:fs');
const { join, resolve, extname, sep } = require('node:path');
const database = require('./src/db');
const moderator = require('./server-moderator');
const moderatorAi = require('./server-moderator-ai');
const problemReports = require('./server-problem-reports');
const communityChat = require('./server-community-chat');
const adminUserDelete = require('./server-admin-user-delete');
const answerExpert = require('./server-answer-expert');
const subscriptions = require('./server-subscriptions');

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.PERFORMANCE_UPSTREAM_PORT || (PORT + 1));
const PUBLIC = resolve(__dirname, 'public');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
};

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return database.row(
    'SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

function isStudentAiPath(pathname) {
  return pathname.startsWith('/api/ai/')
    || pathname.startsWith('/api/ai-pro/')
    || pathname.startsWith('/api/answer-expert/');
}

async function requireProForAi(req, res, pathname) {
  if (!isStudentAiPath(pathname)) return false;
  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт', code: 'AUTH_REQUIRED' });
    return true;
  }
  if (!(await subscriptions.hasActiveSubscription(user))) {
    json(res, 403, { error: 'Эта AI-функция доступна по подписке ОСНОВА PRO', code: 'PRO_REQUIRED' });
    return true;
  }
  return false;
}

function shouldSanitizeAi(pathname) {
  return isStudentAiPath(pathname) || pathname === '/api/moderator-ai';
}

function sanitizeAiString(value) {
  return String(value ?? '')
    .replace(/\b(?:google\s+)?gemini(?:[-\s]?\d+(?:\.\d+)*)?(?:[-\s]?(?:flash|pro|lite|ultra))?\b/gi, 'ОСНОВА AI')
    .replace(/\bcerebras\b/gi, 'ОСНОВА AI')
    .replace(/\bgpt[-\s]?oss(?:[-\s]?\d+[a-z]?)?\b/gi, 'ОСНОВА AI')
    .replace(/\bdeepseek(?:[-\s]?[\w.]+){0,3}\b/gi, 'ОСНОВА AI')
    .replace(/\bchatgpt(?:[-\s]?[\w.]+)?\b|\bopenai\b/gi, 'ОСНОВА AI')
    .replace(/\bclaude(?:[-\s]?[\w.]+)?\b|\banthropic\b/gi, 'ОСНОВА AI')
    .replace(/\bgoogle(?:\s+deepmind|\s+ai)?\b/gi, 'ОСНОВА AI');
}

function sanitizeAiPayload(value) {
  if (Array.isArray(value)) return value.map(sanitizeAiPayload);
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [key, item] of Object.entries(value)) {
      if (/^(model|modelUsed|aiModel|provider|providerName|source)$/i.test(key)) continue;
      clean[key] = sanitizeAiPayload(item);
    }
    return clean;
  }
  return typeof value === 'string' ? sanitizeAiString(value) : value;
}

function chunkBuffer(chunk, encoding) {
  if (chunk == null) return null;
  if (Buffer.isBuffer(chunk)) return chunk;
  const enc = typeof encoding === 'string' ? encoding : undefined;
  return Buffer.from(String(chunk), enc);
}

function installAiResponseGuard(res, pathname) {
  if (!shouldSanitizeAi(pathname)) return;
  const originalWriteHead = res.writeHead.bind(res);
  const originalEnd = res.end.bind(res);
  let statusCode = 200;
  let statusMessage = null;
  let responseHeaders = {};
  const chunks = [];

  res.writeHead = (code, second, third) => {
    statusCode = Number(code) || 200;
    if (typeof second === 'string') {
      statusMessage = second;
      responseHeaders = { ...(third || {}) };
    } else {
      responseHeaders = { ...(second || {}) };
    }
    return res;
  };

  res.write = (chunk, encoding, callback) => {
    const cb = typeof encoding === 'function' ? encoding : callback;
    const buffered = chunkBuffer(chunk, encoding);
    if (buffered) chunks.push(buffered);
    if (typeof cb === 'function') queueMicrotask(cb);
    return true;
  };

  res.end = (chunk, encoding, callback) => {
    const cb = typeof encoding === 'function' ? encoding : callback;
    const buffered = chunkBuffer(chunk, encoding);
    if (buffered) chunks.push(buffered);
    let body = Buffer.concat(chunks);
    const contentType = String(responseHeaders['content-type'] || responseHeaders['Content-Type'] || res.getHeader('content-type') || '');
    const text = body.toString('utf8');
    if (/json/i.test(contentType) || /^[\s]*[\[{]/.test(text)) {
      try { body = Buffer.from(JSON.stringify(sanitizeAiPayload(JSON.parse(text)))); }
      catch { body = Buffer.from(sanitizeAiString(text)); }
    } else if (text) {
      body = Buffer.from(sanitizeAiString(text));
    }

    const headers = { ...responseHeaders };
    for (const key of Object.keys(headers)) {
      if (/^(content-length|transfer-encoding)$/i.test(key)) delete headers[key];
    }
    headers['content-length'] = body.length;
    if (statusMessage) originalWriteHead(statusCode, statusMessage, headers);
    else originalWriteHead(statusCode, headers);
    return originalEnd(body, cb);
  };
}

async function fastTopics(userId) {
  return database.rows(`SELECT t.*,
      COALESCE(tp.mastery,0) mastery,
      COALESCE(q.question_count,0) question_count
    FROM topics t
    LEFT JOIN topic_progress tp ON tp.topic_id=t.id AND tp.user_id=?
    LEFT JOIN (
      SELECT topic_id,COUNT(*) question_count
      FROM questions
      WHERE active=1 AND published=1
      GROUP BY topic_id
    ) q ON q.topic_id=t.id
    WHERE t.published=1
    ORDER BY t.position,t.id`, userId);
}

function parseQuestionJson(value, fallback = []) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function formatBankAnswer(question, options) {
  const rawValue = parseQuestionJson(question.answer_json, []);
  const raw = Array.isArray(rawValue) ? rawValue.map(String) : [String(rawValue ?? '')].filter(Boolean);
  const answerData = parseQuestionJson(question.answer_data_json, {}) || {};
  const acceptedExtra = Array.isArray(answerData.acceptedVariants) ? answerData.acceptedVariants.map(String) : [];
  const type = String(question.question_type || '');
  const valueToPosition = new Map(options.map((option, index) => [String(option.value), String(index + 1)]));

  if (type === 'matching' && raw.length) {
    const pairs = raw.map(value => String(value).match(/^(\d+)-(\d+)$/)).filter(Boolean);
    if (pairs.length === raw.length) {
      pairs.sort((a, b) => Number(a[1]) - Number(b[1]));
      const sequence = pairs.map(pair => String(Number(pair[2]) + 1)).join('');
      return { answer: sequence, accepted: [sequence, sequence.split('').join(' '), sequence.split('').join(',')] };
    }
  }

  if (options.length && raw.length && raw.every(value => valueToPosition.has(String(value)))) {
    const positions = raw.map(value => valueToPosition.get(String(value)));
    const compact = positions.join('');
    return { answer: compact, accepted: [compact, positions.join(' '), positions.join(','), positions.join(';')] };
  }

  const answer = raw.join(raw.length > 1 ? ' ' : '').trim();
  return { answer, accepted: [...new Set([answer, ...acceptedExtra].filter(Boolean))] };
}

const CEREBRAS_TASK_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_TASK_MODEL = process.env.CEREBRAS_TASK_MODEL || process.env.CEREBRAS_ANSWER_MODEL || 'gpt-oss-120b';
const CEREBRAS_TASK_URL = 'https://api.cerebras.ai/v1/chat/completions';

function cleanGeneratedTask(task, index) {
  const prompt = String(task?.prompt || '').trim();
  const instruction = String(task?.instruction || '').trim();
  const explanation = String(task?.explanation || '').trim();
  const questionType = String(task?.questionType || 'short_answer').trim();
  const options = Array.isArray(task?.options) ? task.options.map(x => String(x || '').trim()).filter(Boolean).slice(0, 10) : [];
  const answer = String(task?.answer ?? '').trim();
  const acceptedAnswers = Array.isArray(task?.acceptedAnswers)
    ? task.acceptedAnswers.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 12)
    : [];
  if (!prompt || !answer) return null;
  if (options.length && /^\\d+$/.test(answer)) {
    const n = Number(answer);
    if (n < 1 || n > options.length) return null;
  }
  return {
    id: -(index + 1),
    prompt,
    instruction,
    options,
    answer,
    acceptedAnswers: [...new Set([answer, ...acceptedAnswers])],
    explanation,
    difficulty: Math.max(1, Math.min(5, Number(task?.difficulty) || 3)),
    manualReview: Boolean(task?.manualReview),
    questionType,
    externalKey: `ai-generated-${Date.now()}-${index + 1}`,
    generated: true,
  };
}

async function generateAiLineTasks(subjectSlug, line, count, examples) {
  if (!CEREBRAS_TASK_KEY) throw Object.assign(new Error('AI generator is not configured'), { code: 'AI_GENERATOR_NOT_CONFIGURED' });

  const subjectLabel = subjectSlug === 'chemistry' ? 'химии' : 'биологии';
  const maxLine = subjectSlug === 'chemistry' ? 34 : 28;
  const exemplarText = examples.slice(0, 7).map((q, i) => {
    const opts = Array.isArray(q.options) && q.options.length ? `\\nВарианты: ${q.options.map((x, j) => `${j + 1}) ${x}`).join(' | ')}` : '';
    return `ПРИМЕР ${i + 1}:\\nИнструкция: ${q.instruction || '-'}\\nУсловие: ${q.prompt}${opts}\\nТип: ${q.questionType || '-'}\\nОтвет: ${q.answer}`;
  }).join('\\n\\n');

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['tasks'],
    properties: {
      tasks: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['prompt','instruction','options','answer','acceptedAnswers','explanation','difficulty','manualReview','questionType'],
          properties: {
            prompt: { type: 'string' },
            instruction: { type: 'string' },
            options: { type: 'array', items: { type: 'string' }, maxItems: 10 },
            answer: { type: 'string' },
            acceptedAnswers: { type: 'array', items: { type: 'string' }, maxItems: 12 },
            explanation: { type: 'string' },
            difficulty: { type: 'integer', minimum: 1, maximum: 5 },
            manualReview: { type: 'boolean' },
            questionType: { type: 'string' },
          },
        },
      },
    },
  };

  const system = `Ты — методист ЕГЭ по ${subjectLabel}. Генерируй НОВЫЕ задания только для линии ${line} из ${maxLine}, строго сохраняя проверяемый навык, механику, форму ответа и уровень официального экзамена. Опирайся на переданные примеры как на шаблон формата линии, но НЕ копируй их текст, числа, наборы объектов и варианты ответа. Не утверждай, что задания официально опубликованы ФИПИ: это авторские задания ОСНОВЫ, составленные по формату ЕГЭ. Перед выдачей молча перепроверь научную корректность, однозначность условия и ответа.

ЖЁСТКИЕ ПРАВИЛА:
1) Никаких вопросов "какой сильнее/больше" без точного критерия. Используй экзаменационные формулировки.
2) Если в примерах линия имеет множественный выбор, соответствие, последовательность или расчёт — сохрани именно эту механику.
3) Для закрытого задания ответ должен однозначно следовать из условия. Для вариантов ответа поле answer содержит номер/последовательность номеров так, как ученик вводит в бланк.
4) options содержит только текст вариантов без номеров. acceptedAnswers содержит эквивалентные допустимые записи.
5) Не делай задания заметно проще примеров. Избегай школьных викторин и расплывчатых формулировок.
6) Для химии перепроверь электронные конфигурации, степени окисления, коэффициенты, формулы и расчёты. Для биологии — термины, причинно-следственные связи, генетику и цитологические расчёты.
7) Не используй факты, требующие спорной трактовки. Не добавляй подсказку в условие.
8) Сгенерируй ровно ${count} разных заданий. Каждое должно отличаться не только числами, но и объектами/контекстом.
9) explanation кратко объясняет, почему ответ верен, и служит дополнительной самопроверкой.
10) Если линия предполагает развёрнутый ответ, manualReview=true, answer — краткий эталон по смысловым элементам; иначе manualReview=false.`;

  const prompt = `Ниже примеры уже используемых заданий линии ${line}. По их структуре создай ${count} новых, не повторяющихся заданий.\\n\\n${exemplarText}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 26000);
  let response;
  try {
    response = await fetch(CEREBRAS_TASK_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${CEREBRAS_TASK_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: CEREBRAS_TASK_MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        temperature: 0.18,
        reasoning_effort: 'medium',
        max_completion_tokens: 4200,
        response_format: { type: 'json_schema', json_schema: { name: 'ege_generated_tasks', strict: true, schema } },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || 'AI generation failed'), { code: 'AI_GENERATION_FAILED', status: response.status });
  let parsed;
  try { parsed = JSON.parse(String(data?.choices?.[0]?.message?.content || '').replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/i, '')); }
  catch { throw Object.assign(new Error('AI returned invalid JSON'), { code: 'AI_INVALID_JSON' }); }

  const tasks = (Array.isArray(parsed?.tasks) ? parsed.tasks : []).map(cleanGeneratedTask).filter(Boolean);
  if (tasks.length !== count) throw Object.assign(new Error('AI generated an incomplete task set'), { code: 'AI_INCOMPLETE_SET' });
  return tasks;
}

async function handleAiLineTasks(req, res, url) {
  if (req.method !== 'GET' || url.pathname !== '/api/ai-line-tasks') return false;

  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт', code: 'AUTH_REQUIRED' });
    return true;
  }

  const subjectSlug = String(url.searchParams.get('subject') || '').trim();
  const line = Number(url.searchParams.get('line') || 0);
  const count = Math.min(10, Math.max(1, Number(url.searchParams.get('count') || 5)));
  const maxLine = subjectSlug === 'chemistry' ? 34 : subjectSlug === 'biology' ? 28 : 0;

  if (!maxLine || !Number.isInteger(line) || line < 1 || line > maxLine) {
    json(res, 400, { error: 'Некорректный предмет или номер линии', code: 'INVALID_EXAM_LINE' });
    return true;
  }

  try {
    const subject = await database.row('SELECT id FROM subjects WHERE slug=? AND published=1', subjectSlug);
    if (!subject) {
      json(res, 404, { error: 'Предмет не найден', code: 'SUBJECT_NOT_FOUND' });
      return true;
    }

    const prefix = subjectSlug === 'biology' && line === 26
      ? 'biology-bank-v8-line26-hard-%'
      : subjectSlug === 'chemistry' ? 'chemistry-bank-%' : 'biology-bank-%';
    const candidates = await database.rows(
      `SELECT id,prompt,instruction,answer_json,answer_data_json,explanation,question_type,type,content_json,difficulty,external_key
       FROM questions
       WHERE subject_id=? AND exam_line=? AND active=1 AND published=1 AND external_key LIKE ?
       ORDER BY RANDOM()
       LIMIT ?`,
      subject.id,
      line,
      prefix,
      Math.max(count * 4, 20),
    );

    const candidateIds = candidates.map(question => Number(question.id)).filter(Number.isSafeInteger);
    const optionRows = candidateIds.length
      ? await database.rows(
        `SELECT question_id,value,label
         FROM question_options
         WHERE question_id IN (${candidateIds.map(() => '?').join(',')})
         ORDER BY question_id,position`,
        ...candidateIds,
      )
      : [];
    const optionsByQuestion = new Map();
    for (const option of optionRows) {
      const questionId = Number(option.question_id);
      if (!optionsByQuestion.has(questionId)) optionsByQuestion.set(questionId, []);
      optionsByQuestion.get(questionId).push({ value: option.value, label: option.label });
    }

    const examples = [];
    const seen = new Set();
    for (const question of candidates) {
      const prompt = String(question.prompt || '').trim();
      if (!prompt) continue;
      const promptKey = prompt.toLowerCase().replace(/\\s+/g, ' ');
      if (seen.has(promptKey)) continue;
      seen.add(promptKey);
      const options = optionsByQuestion.get(Number(question.id)) || [];
      const formatted = formatBankAnswer(question, options);
      if (!formatted.answer) continue;
      examples.push({
        prompt,
        instruction: String(question.instruction || ''),
        options: options.map(option => String(option.label)),
        answer: formatted.answer,
        acceptedAnswers: formatted.accepted,
        explanation: String(question.explanation || ''),
        questionType: String(question.question_type || ''),
      });
      if (examples.length >= 7) break;
    }

    if (examples.length < 2) {
      json(res, 404, {
        error: `Недостаточно проверенных примеров линии ${line}, чтобы безопасно генерировать новые задания.`,
        code: 'LINE_EXAMPLES_MISSING',
      });
      return true;
    }

    try {
      const tasks = await generateAiLineTasks(subjectSlug, line, count, examples);
      json(res, 200, { subject: subjectSlug, line, count: tasks.length, tasks, source: 'OSNOVA_AI_GENERATED', generated: true });
      return true;
    } catch (generationError) {
      console.warn('ai-line-generation-fallback', {
        subject: subjectSlug,
        line,
        code: generationError?.code || 'AI_GENERATION_FAILED',
        message: String(generationError?.message || generationError).slice(0, 300),
      });
    }

    // Надёжный резерв: если модель/провайдер временно недоступны, ученик всё равно
    // получает корректные задания из проверенного банка этой же линии.
    const tasks = examples.slice(0, count).map((question, index) => ({
      id: Number(candidates[index]?.id || index + 1),
      prompt: question.prompt,
      instruction: question.instruction,
      options: question.options,
      answer: question.answer,
      acceptedAnswers: question.acceptedAnswers,
      explanation: question.explanation,
      difficulty: Number(candidates[index]?.difficulty || 1),
      manualReview: Boolean(parseQuestionJson(candidates[index]?.content_json, {})?.manualReview || candidates[index]?.question_type === 'extended_answer'),
      questionType: question.questionType,
      externalKey: String(candidates[index]?.external_key || ''),
      generated: false,
    }));
    json(res, 200, { subject: subjectSlug, line, count: tasks.length, tasks, source: 'OSNOVA_EXAM_BANK_FALLBACK', generated: false });
    return true;
  } catch (error) {
    console.error('ai-line-tasks', {
      subject: subjectSlug,
      line,
      code: error?.code || 'LINE_TASKS_ERROR',
      message: String(error?.message || error).slice(0, 500),
    });
    json(res, 500, {
      error: 'Не удалось подготовить задания этой линии. Попробуй ещё раз через несколько секунд.',
      code: 'LINE_TASKS_ERROR',
    });
    return true;
  }
}
async function handleFastApi(req, res, pathname) {
  if (req.method !== 'GET' || pathname !== '/api/topics') return false;
  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return true;
  }
  json(res, 200, { topics: await fastTopics(user.id), fastPath: true });
  return true;
}

function staticCandidate(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.includes('\0')) return null;
  const requested = decoded === '/' ? '/index.html' : decoded;
  const extension = extname(requested).toLowerCase();
  if (!mime[extension]) return null;
  const file = resolve(PUBLIC, '.' + requested);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return null;
  if (!existsSync(file)) return null;
  const stat = statSync(file);
  return stat.isFile() ? { file, stat, extension } : null;
}

function cacheControl(url, extension) {
  if (url.searchParams.has('v')) return 'public, max-age=31536000, immutable';
  if (['.png','.webp','.jpg','.jpeg','.svg','.ico','.woff2'].includes(extension)) return 'public, max-age=86400, stale-while-revalidate=604800';
  if (extension === '.html') return 'public, max-age=0, must-revalidate';
  // Repeated visits should not download dozens of unchanged feature files.
  // A short fresh window keeps deploys responsive while stale-while-revalidate
  // makes navigation and reloads instant on slower connections.
  if (extension === '.js' || extension === '.css') return 'public, max-age=600, stale-while-revalidate=86400';
  return 'public, max-age=60, must-revalidate';
}

function serveStatic(req, res, url) {
  if (!['GET','HEAD'].includes(req.method || 'GET')) return false;
  const candidate = staticCandidate(url.pathname);
  if (!candidate) return false;
  const etag = `W/\"${candidate.stat.size}-${Math.floor(candidate.stat.mtimeMs)}\"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, {
      etag,
      'cache-control': cacheControl(url, candidate.extension),
    });
    res.end();
    return true;
  }
  res.writeHead(200, {
    'content-type': mime[candidate.extension],
    'content-length': candidate.stat.size,
    'cache-control': cacheControl(url, candidate.extension),
    etag,
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(candidate.file).pipe(res);
  return true;
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` };
  const idempotent = req.method === 'GET' || req.method === 'HEAD';

  const attempt = (retry = 0) => {
    const upstream = http.request({
      hostname: '127.0.0.1',
      port: UPSTREAM_PORT,
      path: req.url,
      method: req.method,
      headers,
    }, upstreamResponse => {
      res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(res);
    });

    upstream.setTimeout(15000, () => {
      const error = new Error('UPSTREAM_TIMEOUT');
      error.code = 'UPSTREAM_TIMEOUT';
      upstream.destroy(error);
    });

    upstream.on('error', error => {
      const code = error?.code || 'UNKNOWN';
      const transient = ['ECONNRESET','ECONNREFUSED','EPIPE','UPSTREAM_TIMEOUT'].includes(code);
      if (idempotent && transient && retry < 1 && !res.headersSent) {
        console.warn('performance-upstream-retry', code);
        return setTimeout(() => attempt(retry + 1), 80);
      }
      if (!res.headersSent) json(res, 503, { error: 'Сервис временно недоступен. Повторите через несколько секунд.', code: 'UPSTREAM_UNAVAILABLE' });
      else res.end();
      console.warn('performance-upstream-error', code);
    });

    if (idempotent) upstream.end();
    else req.pipe(upstream);
  };

  attempt();
}

function waitForUpstream(left = 220) {
  return new Promise((resolvePromise, reject) => {
    const test = attemptsLeft => {
      const socket = net.createConnection({ host: '127.0.0.1', port: UPSTREAM_PORT });
      socket.once('connect', () => { socket.destroy(); resolvePromise(); });
      socket.once('error', () => {
        socket.destroy();
        if (attemptsLeft <= 0) reject(new Error('Performance upstream did not start'));
        else setTimeout(() => test(attemptsLeft - 1), 100);
      });
    };
    test(left);
  });
}

async function start() {
  await moderator.ensureSchema();
  await moderatorAi.ensureSchema();
  await problemReports.ensureSchema();
  await communityChat.ensureSchema();
  await subscriptions.ensureSchema();
  await answerExpert.ensureSchema();
  const child = spawn(process.execPath, [join(__dirname, 'server-product.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(UPSTREAM_PORT) },
    stdio: 'inherit',
  });
  child.on('exit', code => { if (code) console.error('performance upstream exit', code); });

  await waitForUpstream();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Static files never need authentication or a database lookup. Serving them
    // first removes the biggest source of page-load queues on Render.
    if (serveStatic(req, res, url)) return;
    installAiResponseGuard(res, url.pathname);
    try {
      if (await subscriptions.handle(req, res, url)) return;
      if (await requireProForAi(req, res, url.pathname)) return;
      if (await communityChat.handle(req, res, url)) return;
      if (await problemReports.handle(req, res, url)) return;
      if (await moderatorAi.handle(req, res, url)) return;
      if (await answerExpert.handle(req, res, url)) return;
      if (await adminUserDelete.handle(req, res, url)) return;
      if (await moderator.handle(req, res, url)) return;
      if (await handleAiLineTasks(req, res, url)) return;
      if (await handleFastApi(req, res, url.pathname)) return;
      proxy(req, res);
    } catch (error) {
      console.error('performance-api', error);
      if (!res.headersSent) json(res, Number(error?.status || 500), { error: error?.message || 'Не удалось загрузить данные' });
    }
  });

  server.listen(PORT, () => console.log(`EGE platform + performance gateway: http://localhost:${PORT}`));
  const stop = () => {
    child.kill('SIGTERM');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) start().catch(error => {
  console.error(error);
  process.exit(1);
});

module.exports = { start, fastTopics, handleFastApi, handleAiLineTasks, staticCandidate, cacheControl, requireProForAi, sanitizeAiPayload };