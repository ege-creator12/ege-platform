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
const { isChemistryFipiFormat, isBiologyFipiFormat } = require('./src/ege-fipi-format');
const { BIOLOGY_BANK_VERSION } = require('./src/biology-bank-version');
const { CHEMISTRY_BANK_VERSION } = require('./src/chemistry-bank-version');

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

function formatBankAnswer(question, options, content = {}) {
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
    if (raw.every(value => /^\d+$/.test(value)) && Array.isArray(content?.right)) {
      const sequence = raw.map(value => String(Number(value) + 1)).join('');
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

    const prefix = subjectSlug === 'chemistry'
      ? `chemistry-bank-${CHEMISTRY_BANK_VERSION}-line${line}-%`
      : line === 26 ? `biology-bank-v${BIOLOGY_BANK_VERSION}-line26-hard-%` : `biology-bank-v${BIOLOGY_BANK_VERSION}-line${line}-%`;

    const candidates = await database.rows(
      `SELECT id,prompt,instruction,answer_json,answer_data_json,explanation,question_type,type,content_json,difficulty,external_key,image_url
       FROM questions
       WHERE subject_id=? AND exam_line=? AND active=1 AND published=1 AND external_key LIKE ?
       ORDER BY RANDOM()
       LIMIT ?`,
      subject.id,
      line,
      prefix,
      Math.max(count * 5, 30),
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

    const validate = subjectSlug === 'chemistry' ? isChemistryFipiFormat : isBiologyFipiFormat;
    const tasks = [];
    const seen = new Set();
    for (const question of candidates) {
      if (tasks.length >= count) break;
      const prompt = String(question.prompt || '').trim();
      if (!prompt) continue;
      const promptKey = prompt.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(promptKey)) continue;

      const options = optionsByQuestion.get(Number(question.id)) || [];
      const content = parseQuestionJson(question.content_json, {}) || {};
      const rawAnswer = parseQuestionJson(question.answer_json, []);
      const item = {
        ...question,
        questionType: String(question.question_type || ''),
        content,
        answer: Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer],
        options,
        imageUrl: question.image_url || null,
        manualReview: Boolean(content.manualReview || question.question_type === 'extended_answer'),
      };
      if (!validate(line, item)) {
        console.warn('strict-line-task-rejected', { subject: subjectSlug, line, id: question.id, key: question.external_key });
        continue;
      }

      const formatted = formatBankAnswer(question, options, content);
      if (!formatted.answer) continue;
      seen.add(promptKey);

      tasks.push({
        id: Number(question.id),
        prompt,
        instruction: String(question.instruction || ''),
        options: options.map(option => String(option.label)),
        content,
        imageUrl: question.image_url || null,
        answer: formatted.answer,
        acceptedAnswers: formatted.accepted,
        explanation: String(question.explanation || ''),
        difficulty: Number(question.difficulty || 1),
        manualReview: item.manualReview,
        questionType: String(question.question_type || ''),
        type: String(question.type || ''),
        externalKey: String(question.external_key || ''),
        generated: false,
        strictFipiFormat: true,
      });
    }

    if (tasks.length < Math.min(1, count)) {
      json(res, 404, {
        error: `Для линии ${line} сейчас нет заданий, прошедших строгую проверку формата ФИПИ. Банк перестраивается.`,
        code: 'STRICT_LINE_BANK_BUILDING',
      });
      return true;
    }

    json(res, 200, {
      subject: subjectSlug,
      line,
      count: tasks.length,
      tasks,
      source: 'OSNOVA_STRICT_FIPI_FORMAT_BANK',
      generated: false,
      strictFipiFormat: true,
    });
    return true;
  } catch (error) {
    console.error('ai-line-tasks', {
      subject: subjectSlug,
      line,
      code: error?.code || 'LINE_TASKS_ERROR',
      message: String(error?.message || error).slice(0, 500),
    });
    json(res, 500, {
      error: 'Не удалось загрузить проверенные задания этой линии. Попробуй ещё раз после обновления банка.',
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