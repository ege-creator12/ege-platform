'use strict';

const database = require('./src/db');
const teacherBatch = require('./server-teacher-batch');
const relaxed = require('./server-teacher-homework-relaxed');
const { row } = database;

const inFlight = new Map();

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row(
    'SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

async function drainBody(req) {
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
  }
}

async function finalizeOnce(user, sessionId) {
  const key = `${Number(user.id)}:${Number(sessionId)}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const work = (async () => {
    const existing = await row(
      'SELECT session_id FROM teacher_homework_batch_reviews WHERE session_id=? AND user_id=?',
      sessionId,
      user.id,
    );
    if (!existing) {
      await relaxed.upgradeLegacyAnswers(user.id, sessionId);
      await relaxed.fillUnanswered(user.id, sessionId);
    }
    return teacherBatch.finalizeBatch(user, sessionId);
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, work);
  return work;
}

async function handle(req, res, url) {
  const match = url.pathname.match(/^\/api\/teacher\/homework\/sessions\/(\d+)\/finalize$/);
  if (!match || req.method !== 'POST') return false;

  try {
    const user = await userFor(req);
    if (!user) {
      json(res, 401, { error: 'Войдите в аккаунт' });
      return true;
    }
    await drainBody(req);
    const sessionId = Number(match[1]);
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
      json(res, 400, { error: 'Некорректная домашняя работа' });
      return true;
    }

    const result = await finalizeOnce(user, sessionId);
    json(res, 200, result);
  } catch (error) {
    json(res, Number(error?.status || 500), {
      error: error?.message || 'Ошибка проверки домашней работы',
      code: error?.code || null,
    });
  }
  return true;
}

module.exports = { handle, finalizeOnce };
