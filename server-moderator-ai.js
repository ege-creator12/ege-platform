'use strict';

const database = require('./src/db');
const { row, rows, run, transaction } = database;

const DAILY_LIMIT = Math.max(10, Number(process.env.MODERATOR_AI_DAILY_LIMIT) || 60);
const MINUTE_LIMIT = Math.max(2, Number(process.env.MODERATOR_AI_MINUTE_LIMIT) || 10);
const TIMEOUT_MS = Math.max(5000, Number(process.env.GEMINI_TIMEOUT_MS) || 15000);
const MODEL_CANDIDATES = [...new Set([
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  process.env.GEMINI_FALLBACK_MODEL,
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
].filter(Boolean))];
const minuteUsage = new Map();

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function ensureSchema() {
  await run(`CREATE TABLE IF NOT EXISTS moderator_ai_usage (
    user_id BIGINT NOT NULL,
    usage_date TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, usage_date)
  )`);
}

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 128 * 1024) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row("SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP", token);
}

async function canUse(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Boolean(await row('SELECT user_id FROM moderator_users WHERE user_id=?', user.id));
}

function dayKey() { return new Date().toISOString().slice(0, 10); }
async function reserveQuota(userId) {
  const now = Date.now();
  const recent = (minuteUsage.get(userId) || []).filter(ts => now - ts < 60000);
  if (recent.length >= MINUTE_LIMIT) throw Object.assign(new Error('Слишком много запросов подряд. Подожди немного.'), { status: 429 });
  const day = dayKey();
  let count = 0;
  await transaction(async tx => {
    await tx.run(`INSERT INTO moderator_ai_usage(user_id,usage_date,request_count) VALUES(?,?,1)
      ON CONFLICT(user_id,usage_date) DO UPDATE SET request_count=moderator_ai_usage.request_count+1`, userId, day);
    const state = await tx.row('SELECT request_count FROM moderator_ai_usage WHERE user_id=? AND usage_date=?', userId, day);
    count = Number(state?.request_count || 0);
    if (count > DAILY_LIMIT) {
      await tx.run('UPDATE moderator_ai_usage SET request_count=request_count-1 WHERE user_id=? AND usage_date=?', userId, day);
      throw Object.assign(new Error(`Лимит AI-помощника на сегодня исчерпан (${DAILY_LIMIT}).`), { status: 429 });
    }
  });
  recent.push(now);
  minuteUsage.set(userId, recent);
  return Math.max(0, DAILY_LIMIT - count);
}

function parseJson(value) { try { return JSON.parse(value || '{}'); } catch { return value || ''; } }
function clip(value, limit = 18000) { return String(value ?? '').slice(0, limit); }

async function sourceContext(type, id) {
  const targetId = Number(id);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) return '';
  if (type === 'subjects') {
    const x = await row('SELECT id,title,description,exam_year,published FROM subjects WHERE id=?', targetId);
    return x ? `ПРЕДМЕТ #${x.id}\nНазвание: ${x.title}\nОписание: ${x.description}\nГод: ${x.exam_year}\nОпубликован: ${x.published}` : '';
  }
  if (type === 'sections') {
    const x = await row('SELECT s.id,s.title,s.description,s.exam_year,s.published,sub.title subject_title FROM sections s JOIN subjects sub ON sub.id=s.subject_id WHERE s.id=?', targetId);
    return x ? `РАЗДЕЛ #${x.id}\nПредмет: ${x.subject_title}\nНазвание: ${x.title}\nОписание: ${x.description}\nГод: ${x.exam_year}\nОпубликован: ${x.published}` : '';
  }
  if (type === 'topics') {
    const x = await row('SELECT t.id,t.title,t.description,t.theory,t.exam_year,t.published,s.title subject_title,sec.title section_title FROM topics t JOIN subjects s ON s.id=t.subject_id LEFT JOIN sections sec ON sec.id=t.section_id WHERE t.id=?', targetId);
    return x ? clip(`ТЕМА #${x.id}\nПредмет: ${x.subject_title}\nРаздел: ${x.section_title || '—'}\nНазвание: ${x.title}\nОписание: ${x.description}\nТеория:\n${x.theory || '—'}\nГод: ${x.exam_year}\nОпубликована: ${x.published}`) : '';
  }
  if (type === 'lessons') {
    const x = await row('SELECT l.id,l.title,l.summary,l.exam_year,l.difficulty,l.published,t.title topic_title,s.title subject_title FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN subjects s ON s.id=t.subject_id WHERE l.id=?', targetId);
    if (!x) return '';
    const blocks = await rows('SELECT type,content_json,position FROM lesson_blocks WHERE lesson_id=? ORDER BY position,id', targetId);
    const body = blocks.map((b, i) => `Блок ${i + 1} [${b.type}]: ${JSON.stringify(parseJson(b.content_json))}`).join('\n');
    return clip(`УРОК #${x.id}\nПредмет: ${x.subject_title}\nТема: ${x.topic_title}\nНазвание: ${x.title}\nКратко: ${x.summary}\nСложность: ${x.difficulty}\nГод: ${x.exam_year}\nОпубликован: ${x.published}\n\nСодержимое:\n${body || '—'}`);
  }
  if (type === 'questions') {
    const q = await row('SELECT q.id,q.prompt,q.instruction,q.explanation,q.answer_json,q.type,q.question_type,q.difficulty,q.exam_line,q.points,q.max_score,t.title topic_title,s.title subject_title FROM questions q JOIN topics t ON t.id=q.topic_id LEFT JOIN subjects s ON s.id=q.subject_id WHERE q.id=?', targetId);
    if (!q) return '';
    const options = await rows('SELECT value,label FROM question_options WHERE question_id=? ORDER BY position,id', targetId);
    return clip(`ЗАДАНИЕ #${q.id}\nПредмет: ${q.subject_title || '—'}\nТема: ${q.topic_title}\nЛиния ЕГЭ: ${q.exam_line || '—'}\nТип: ${q.question_type || q.type}\nСложность: ${q.difficulty}\nБаллы: ${q.max_score || q.points || 1}\nИнструкция: ${q.instruction || '—'}\nУсловие: ${q.prompt}\nВарианты: ${options.map(o => `${o.value}) ${o.label}`).join(' | ') || '—'}\nОтвет: ${q.answer_json}\nОбъяснение: ${q.explanation || '—'}`);
  }
  return '';
}

const actionInstruction = {
  chat: 'Отвечай как рабочий помощник модератора. Помогай с задачами по платформе: контентом, структурой курса, формулировками, приоритизацией, разбором найденных ошибок, идеями интерфейса, организацией проверки материалов и рабочими решениями. На обычный вопрос отвечай обычным человеческим ответом без искусственного шаблона.',
  audit: 'Проверь материал на фактические ошибки, противоречия, двусмысленности, пропуски важных пунктов и плохие формулировки. Коротко перечисли проблемы и предложи исправление.',
  improve: 'Улучши текст: сделай его точным, понятным школьнику, компактным и естественным. Дай готовую улучшенную версию без лишней воды.',
  ege: 'Оцени пригодность материала для ЕГЭ: что обязательно знать, чего не хватает, что лишнее или может запутать. Если нужны свежие требования ФИПИ, прямо отметь необходимость ручной сверки.',
  question: 'Проверь задание как методист: однозначность условия, корректность вариантов, правильность ответа, объяснение, сложность и соответствие школьной программе/ЕГЭ.',
  explanation: 'Составь качественное объяснение ответа: понятно, по шагам, без воды, с причиной ключевого вывода и типичной ошибкой ученика.',
  variants: 'Предложи 3 новых варианта задания по той же проверяемой идее. Не копируй исходный текст. Для каждого укажи однозначный правильный ответ и короткое объяснение.',
};

function historyContext(payload) {
  if (!Array.isArray(payload.history)) return '';
  const items = payload.history.slice(-8).map(item => {
    const role = item?.role === 'assistant' ? 'AI' : 'Модератор';
    const body = clip(item?.text, 1800).trim();
    return body ? `${role}: ${body}` : '';
  }).filter(Boolean);
  return clip(items.join('\n\n'), 9000);
}

function buildPrompt(payload, source) {
  const mode = actionInstruction[payload.action] ? payload.action : 'chat';
  const instruction = actionInstruction[mode];
  const message = clip(payload.message, 12000).trim();
  const history = historyContext(payload);
  const structureRule = mode === 'chat'
    ? 'Отвечай естественно и по делу. Не используй обязательные разделы вроде «Вердикт / Что исправить», если они не нужны.'
    : 'Структурируй ответ только настолько, насколько это помогает быстро применить результат.';
  return `Ты — рабочий AI-помощник модератора образовательной платформы ОСНОВА для подготовки к ЕГЭ.\n\nТекущий режим: ${instruction}\n\nПравила:\n- Ты помогаешь модератору с рабочими задачами платформы, а не только с биологией и химией.\n- Можно обсуждать контент, структуру курса, задания, оформление, пользовательские жалобы, найденные ошибки, план работы и идеи улучшения интерфейса.\n- У тебя НЕТ доступа к пользователям, их личным данным, ролям, настройкам сайта, базе данных, GitHub, Render, ключам API и серверной инфраструктуре. Никогда не утверждай обратное.\n- Не выполняй и не обещай системные изменения сам: предлагай решение, текст, чек-лист или понятный следующий шаг.\n- Для биологии и химии соблюдай фактическую точность и школьную программу.\n- Не выдумывай свежие требования ФИПИ и не утверждай, что проверял интернет. Если актуальность важна — попроси сверить официальный документ.\n- Учитывай предыдущий диалог как контекст, но текущий запрос важнее.\n- Пиши по-русски, конкретно, нормальным рабочим языком.\n- ${structureRule}\n\n${history ? `Предыдущий диалог:\n${history}\n\n` : ''}${source ? `Прикреплённый материал с сайта:\n${source}\n\n` : ''}${message ? `Сообщение модератора:\n${message}` : ''}`;
}

async function askGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error('AI временно не настроен'), { status: 503 });
  let lastError;
  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2600, temperature: modeTemperature(prompt) },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = Object.assign(new Error(data?.error?.message || `Gemini ${response.status}`), { status: response.status === 429 ? 429 : 502 });
        if (response.status === 401) break;
        continue;
      }
      const answer = (data?.candidates || []).flatMap(c => c?.content?.parts || []).map(p => p?.text || '').join('\n').trim();
      if (answer) return { answer, model };
      lastError = Object.assign(new Error('AI вернул пустой ответ'), { status: 502 });
    } catch (error) { lastError = error; }
  }
  if (lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError') throw Object.assign(new Error('AI слишком долго отвечает. Попробуй ещё раз.'), { status: 504 });
  throw Object.assign(new Error('AI-помощник временно недоступен'), { status: Number(lastError?.status || 503) });
}

function modeTemperature(prompt) {
  return prompt.includes('Текущий режим: Отвечай как рабочий помощник') ? 0.45 : 0.25;
}

async function handle(req, res, url) {
  if (url.pathname !== '/api/moderator-ai') return false;
  const user = await userFor(req);
  if (!user) { json(res, 401, { error: 'Войди в аккаунт' }); return true; }
  if (!(await canUse(user))) { json(res, 403, { error: 'AI-помощник доступен только модератору и владельцу' }); return true; }
  if (req.method !== 'POST') { json(res, 405, { error: 'Метод не поддерживается' }); return true; }
  const payload = await readJson(req);
  const source = await sourceContext(String(payload.targetType || ''), payload.targetId);
  if (!source && !String(payload.message || '').trim()) { json(res, 400, { error: 'Напиши сообщение или прикрепи материал' }); return true; }
  const remaining = await reserveQuota(user.id);
  const result = await askGemini(buildPrompt(payload, source));
  json(res, 200, { ...result, remaining, sourceAttached: Boolean(source) });
  return true;
}

module.exports = { ensureSchema, handle };