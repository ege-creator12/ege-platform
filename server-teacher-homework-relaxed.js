'use strict';

const database = require('./src/db');
const teacherBatch = require('./server-teacher-batch');
const { row, transaction } = database;

const MAX_BODY = 128 * 1024;
const NO_ANSWER = 'ОТВЕТ НЕ ДАН — поставить 0 баллов';

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > MAX_BODY) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

const idOf = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const asArray = value => Array.isArray(value) ? value : value == null ? [] : [value];
const parseJson = (value, fallback = null) => {
  try { return value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value; }
  catch { return fallback; }
};

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row('SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP', token);
}

async function requireUser(req, res) {
  const user = await userFor(req);
  if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return null; }
  return user;
}

function normalizedAnswer(value) {
  const answer = asArray(value).map(x => String(x ?? '').trim()).filter(x => x && x !== 'invalid');
  return answer.length ? answer : [NO_ANSWER];
}

function maxScore(question) {
  const meta = parseJson(question.explanation_json, {}) || {};
  const criteria = asArray(meta.scoringPoints || meta.criteria || meta.scoringCriteria).filter(Boolean);
  const raw = Number(question.max_score || question.points || criteria.length || 1);
  return Math.max(1, Number.isFinite(raw) ? Math.round(raw) : 1);
}

async function fillUnanswered(userId, sessionId) {
  const context = await row(`SELECT tas.assignment_id,ts.status
    FROM teacher_assignment_students tas
    JOIN training_sessions ts ON ts.id=tas.training_session_id
    WHERE tas.training_session_id=? AND tas.user_id=? AND ts.user_id=?`, sessionId, userId, userId);
  if (!context) throw Object.assign(new Error('Эта тренировка не является домашним заданием'), { status: 404, code: 'NOT_HOMEWORK' });

  return transaction(async tx => {
    const items = await tx.rows(`SELECT tsq.position,tsq.question_id,tsq.state,q.points,q.max_score,q.explanation_json,
        r.review_json,r.attempt_id review_attempt_id
      FROM training_session_questions tsq
      JOIN questions q ON q.id=tsq.question_id
      LEFT JOIN teacher_homework_reviews r ON r.session_id=tsq.session_id AND r.question_id=tsq.question_id AND r.user_id=?
      WHERE tsq.session_id=? ORDER BY tsq.position`, userId, sessionId);

    let filled = 0;
    for (const item of items) {
      if (item.review_attempt_id) continue;
      const stored = parseJson(item.review_json, {}) || {};
      const currentAnswer = asArray(stored.answer).map(x => String(x ?? '').trim()).filter(x => x && x !== 'invalid');
      if (stored.pending && currentAnswer.length) {
        if (item.state === 'pending') {
          await tx.run("UPDATE training_session_questions SET state='answered',answered_at=COALESCE(answered_at,CURRENT_TIMESTAMP) WHERE session_id=? AND question_id=?", sessionId, item.question_id);
        }
        continue;
      }

      const pending = {
        ...stored,
        pending: true,
        skipped: true,
        answer: [NO_ANSWER],
        duration: Math.max(0, Number(stored.duration || 0)),
        savedAt: stored.savedAt || new Date().toISOString(),
      };
      await tx.run(`INSERT INTO teacher_homework_reviews(session_id,assignment_id,user_id,question_id,attempt_id,score,max_score,review_json)
        VALUES(?,?,?,?,NULL,0,?,?)
        ON CONFLICT(session_id,question_id) DO UPDATE SET attempt_id=NULL,score=0,max_score=excluded.max_score,review_json=excluded.review_json,updated_at=CURRENT_TIMESTAMP`,
        sessionId, context.assignment_id, userId, item.question_id, maxScore(item), JSON.stringify(pending));
      await tx.run("UPDATE training_session_questions SET state='answered',answered_at=COALESCE(answered_at,CURRENT_TIMESTAMP) WHERE session_id=? AND question_id=?", sessionId, item.question_id);
      filled += 1;
    }

    const counts = await tx.row(`SELECT COUNT(*) total,SUM(CASE WHEN state='answered' THEN 1 ELSE 0 END) answered
      FROM training_session_questions WHERE session_id=?`, sessionId);
    await tx.run('UPDATE training_sessions SET answered_count=? WHERE id=? AND user_id=?', Number(counts?.answered || 0), sessionId, userId);
    return { filled, total: Number(counts?.total || 0), answered: Number(counts?.answered || 0) };
  });
}

async function handle(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/teacher/homework/sessions/')) return false;
  try {
    let match = path.match(/^\/api\/teacher\/homework\/sessions\/(\d+)\/save$/);
    if (match && req.method === 'POST') {
      const user = await requireUser(req, res); if (!user) return true;
      const payload = await readJson(req);
      payload.answer = normalizedAnswer(payload.answer);
      json(res, 200, await teacherBatch.saveDeferredAnswer(user, idOf(match[1]), payload));
      return true;
    }

    match = path.match(/^\/api\/teacher\/homework\/sessions\/(\d+)\/finalize$/);
    if (match && req.method === 'POST') {
      const user = await requireUser(req, res); if (!user) return true;
      await readJson(req);
      const sessionId = idOf(match[1]);
      await fillUnanswered(user.id, sessionId);
      json(res, 200, await teacherBatch.finalizeBatch(user, sessionId));
      return true;
    }
  } catch (error) {
    json(res, Number(error?.status || 500), { error: error?.message || 'Ошибка проверки домашней работы', code: error?.code || null });
    return true;
  }
  return false;
}

module.exports = { handle, fillUnanswered, normalizedAnswer, NO_ANSWER };
