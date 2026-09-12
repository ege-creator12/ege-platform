'use strict';

const database = require('./src/db');
const { row } = database;

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_MODEL = process.env.CEREBRAS_ANSWER_MODEL || 'gpt-oss-120b';
const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1024 * 1024) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row('SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP', token);
}

function clean(value, max) { return String(value || '').trim().slice(0, max); }

function parseResult(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(raw); } catch { return { verdict: raw, score: null, maxScore: null, found: [], missing: [], mistakes: [], improvedAnswer: '' }; }
}

async function evaluate(body) {
  if (!CEREBRAS_API_KEY) throw Object.assign(new Error('Эксперт ответов ещё не подключён'), { status: 503 });
  const subject = ['biology', 'chemistry'].includes(body.subject) ? body.subject : null;
  if (!subject) throw Object.assign(new Error('Выберите предмет'), { status: 400 });
  const question = clean(body.question, 6000);
  const answer = clean(body.answer, 6000);
  const criteria = clean(body.criteria, 7000);
  const referenceAnswer = clean(body.referenceAnswer, 7000);
  const maxScore = Math.max(1, Math.min(20, Number(body.maxScore) || 3));
  if (!question || !answer) throw Object.assign(new Error('Нужны условие задания и ответ ученика'), { status: 400 });

  const system = `Ты — строгий эксперт ЕГЭ по ${subject === 'biology' ? 'биологии' : 'химии'}. Проверяй развёрнутый ответ только по данному условию и критериям. Не засчитывай смысловой элемент, если он фактически не написан учеником. Не придумывай официальные критерии, которых нет во входных данных. Если критерии/эталон неполные, прямо учитывай неопределённость. Верни ТОЛЬКО валидный JSON без markdown: {"score":number,"maxScore":number,"verdict":string,"found":[string],"missing":[string],"mistakes":[string],"improvedAnswer":string,"confidence":"high|medium|low"}. score должен быть целым от 0 до maxScore.`;
  const prompt = `УСЛОВИЕ:\n${question}\n\nМАКСИМУМ: ${maxScore}\n\nКРИТЕРИИ:\n${criteria || 'Не переданы'}\n\nЭТАЛОН/ПОЯСНЕНИЕ:\n${referenceAnswer || 'Не передан'}\n\nОТВЕТ УЧЕНИКА:\n${answer}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response;
  try {
    response = await fetch(CEREBRAS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${CEREBRAS_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: CEREBRAS_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], temperature: 0.1, max_completion_tokens: 1800 }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('Эксперт отвечает слишком долго. Попробуй ещё раз'), { status: 504 });
    throw error;
  } finally { clearTimeout(timeout); }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn('cerebras-answer-expert', response.status, data?.error?.message || 'request failed');
    throw Object.assign(new Error(response.status === 429 ? 'Лимит AI временно исчерпан' : 'Не удалось проверить ответ'), { status: response.status === 429 ? 429 : 502 });
  }
  const text = data?.choices?.[0]?.message?.content || '';
  const result = parseResult(text);
  result.maxScore = maxScore;
  if (Number.isFinite(Number(result.score))) result.score = Math.max(0, Math.min(maxScore, Math.round(Number(result.score))));
  return { ...result, provider: 'cerebras', model: CEREBRAS_MODEL };
}

async function handle(req, res, url) {
  if (url.pathname !== '/api/answer-expert/check') return false;
  if (req.method !== 'POST') { json(res, 405, { error: 'Метод не поддерживается' }); return true; }
  const user = await userFor(req);
  if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return true; }
  try { json(res, 200, { ok: true, result: await evaluate(await readJson(req)) }); }
  catch (error) { json(res, Number(error?.status || 500), { error: error?.message || 'Не удалось проверить ответ' }); }
  return true;
}

module.exports = { handle, evaluate };
