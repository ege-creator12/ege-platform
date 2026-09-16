'use strict';

const database = require('./src/db');
const teacherV3 = require('./server-teacher-v3');
const { rows, row, run, transaction } = database;

const MAX_BODY = 256 * 1024;
const finalizeInFlight = new Map();

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
const clean = (value, max = 8000) => String(value ?? '').trim().slice(0, max);
const asArray = value => Array.isArray(value) ? value : value == null ? [] : [value];
const parseJson = (value, fallback = null) => {
  try { return value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value; }
  catch { return fallback; }
};
const valueText = value => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join('; ');
  if (typeof value === 'object') return Object.values(value).map(valueText).filter(Boolean).join('; ');
  return String(value).trim();
};

async function ensureSchema() {
  const idType = database.dialect === 'postgresql' ? 'BIGINT' : 'INTEGER';
  const timeType = database.dialect === 'postgresql' ? 'TIMESTAMP' : 'TEXT';
  await run(`CREATE TABLE IF NOT EXISTS teacher_homework_batch_reviews (
    session_id ${idType} PRIMARY KEY,
    assignment_id ${idType} NOT NULL REFERENCES teacher_assignments(id) ON DELETE CASCADE,
    user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    overall_json TEXT NOT NULL DEFAULT '{}',
    total_xp INTEGER NOT NULL DEFAULT 0,
    created_at ${timeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at ${timeType} NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_teacher_homework_batch_user ON teacher_homework_batch_reviews(user_id,assignment_id)');
}

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

async function homeworkContext(sessionId, userId) {
  return row(`SELECT tas.assignment_id,tas.user_id,a.teacher_id,a.class_id,a.title,a.subject_slug,a.exam_line,a.question_count,a.due_at,
      c.name class_name,t.name teacher_name,ts.id session_id,ts.status session_status,ts.answered_count,ts.correct_count,ts.target_questions,ts.finished_at
    FROM teacher_assignment_students tas
    JOIN teacher_assignments a ON a.id=tas.assignment_id
    JOIN teacher_classes c ON c.id=a.class_id
    JOIN users t ON t.id=a.teacher_id
    JOIN training_sessions ts ON ts.id=tas.training_session_id
    WHERE tas.training_session_id=? AND tas.user_id=? AND ts.user_id=?`, sessionId, userId, userId);
}

function maxScoreFor(question) {
  const meta = parseJson(question.explanation_json, {}) || {};
  const scoring = asArray(meta.scoringPoints || meta.criteria || meta.scoringCriteria).filter(Boolean);
  const raw = Number(question.max_score || question.points || scoring.length || 1);
  return Math.max(1, Number.isFinite(raw) ? Math.round(raw) : 1);
}

function normalizeReview(raw, maxScore) {
  const score = Math.max(0, Math.min(maxScore, Math.round(Number(raw?.score) || 0)));
  return {
    score,
    maxScore,
    verdict: clean(raw?.verdict || 'Ответ проверен.', 1400),
    found: asArray(raw?.found).map(x => clean(x, 600)).filter(Boolean).slice(0, 12),
    missing: asArray(raw?.missing).map(x => clean(x, 600)).filter(Boolean).slice(0, 12),
    mistakes: asArray(raw?.mistakes).map(x => clean(x, 600)).filter(Boolean).slice(0, 12),
    improvedAnswer: clean(raw?.improvedAnswer, 7000),
    confidence: ['high','medium','low'].includes(raw?.confidence) ? raw.confidence : 'medium',
  };
}

function normalizeOverall(raw) {
  return {
    summary: clean(raw?.summary || 'Работа проверена целиком.', 2500),
    strengths: asArray(raw?.strengths).map(x => clean(x, 700)).filter(Boolean).slice(0, 10),
    weaknesses: asArray(raw?.weaknesses).map(x => clean(x, 700)).filter(Boolean).slice(0, 10),
    nextSteps: asArray(raw?.nextSteps).map(x => clean(x, 700)).filter(Boolean).slice(0, 10),
  };
}

async function saveDeferredAnswer(user, sessionId, body) {
  const context = await homeworkContext(sessionId, user.id);
  if (!context) throw Object.assign(new Error('Эта тренировка не является домашним заданием'), { status: 404, code: 'NOT_HOMEWORK' });
  if (context.session_status !== 'active') throw Object.assign(new Error('Домашнее задание уже завершено'), { status: 409 });

  const questionId = idOf(body.questionId);
  if (!questionId) throw Object.assign(new Error('Некорректное задание'), { status: 400 });
  const answer = asArray(body.answer).map(x => clean(x, 7000)).filter(x => x.length > 0);
  if (!answer.length) throw Object.assign(new Error('Введите ответ'), { status: 400 });
  const duration = Math.max(0, Math.min(7200, Number(body.duration) || 0));

  const saved = await transaction(async tx => {
    const q = await tx.row(`SELECT tsq.position,tsq.state,q.id question_id,q.points,q.max_score,q.explanation_json
      FROM training_session_questions tsq
      JOIN training_sessions s ON s.id=tsq.session_id
      JOIN questions q ON q.id=tsq.question_id
      WHERE tsq.session_id=? AND s.user_id=? AND q.id=?`, sessionId, user.id, questionId);
    if (!q) throw Object.assign(new Error('Задание не входит в эту работу'), { status: 404 });
    if (q.state !== 'pending') throw Object.assign(new Error('Ответ на это задание уже сохранён'), { status: 409 });

    const claimed = await tx.run("UPDATE training_session_questions SET state='answered',answered_at=CURRENT_TIMESTAMP WHERE session_id=? AND position=? AND state='pending'", sessionId, q.position);
    if (!claimed.changes) throw Object.assign(new Error('Ответ на это задание уже сохранён'), { status: 409 });

    const maxScore = maxScoreFor(q);
    const pending = { pending: true, answer, duration, savedAt: new Date().toISOString() };
    await tx.run(`INSERT INTO teacher_homework_reviews(session_id,assignment_id,user_id,question_id,attempt_id,score,max_score,review_json)
      VALUES(?,?,?,?,NULL,0,?,?)
      ON CONFLICT(session_id,question_id) DO UPDATE SET attempt_id=NULL,score=0,max_score=excluded.max_score,review_json=excluded.review_json,updated_at=CURRENT_TIMESTAMP`,
      sessionId, context.assignment_id, user.id, questionId, maxScore, JSON.stringify(pending));
    await tx.run('UPDATE training_sessions SET answered_count=answered_count+1 WHERE id=?', sessionId);
    const left = Number((await tx.row("SELECT COUNT(*) n FROM training_session_questions WHERE session_id=? AND state='pending'", sessionId))?.n || 0);
    const session = await tx.row('SELECT * FROM training_sessions WHERE id=? AND user_id=?', sessionId, user.id);
    return { left, session };
  });

  return { homework: true, saved: true, pendingReview: true, done: saved.left === 0, session: saved.session };
}

async function batchInput(sessionId, userId) {
  const items = await rows(`SELECT tsq.position,tsq.state,tsq.attempt_id,q.id question_id,q.type,q.question_type,q.prompt,q.instruction,q.answer_json,q.answer_data_json,
      q.explanation,q.explanation_json,q.solution_steps_json,q.points,q.max_score,q.exam_line,q.topic_id,
      r.review_json,r.attempt_id review_attempt_id
    FROM training_session_questions tsq
    JOIN questions q ON q.id=tsq.question_id
    LEFT JOIN teacher_homework_reviews r ON r.session_id=tsq.session_id AND r.question_id=q.id AND r.user_id=?
    WHERE tsq.session_id=? ORDER BY tsq.position`, userId, sessionId);
  return items.map(item => {
    const stored = parseJson(item.review_json, {}) || {};
    const meta = parseJson(item.explanation_json, {}) || {};
    const criteria = asArray(meta.scoringPoints || meta.criteria || meta.scoringCriteria).map(valueText).filter(Boolean);
    return {
      ...item,
      stored,
      answer: asArray(stored.answer).map(String),
      duration: Number(stored.duration || 0),
      maxScore: maxScoreFor(item),
      criteria,
      expected: parseJson(item.answer_json, []),
    };
  });
}

async function callBatchAi(context, items) {
  if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error('AI-проверка домашней работы временно недоступна'), { status: 503 });
  const model = process.env.GEMINI_MODEL || process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash-lite';
  const compact = items.map((item, index) => ({
    index: index + 1,
    questionId: Number(item.question_id),
    type: item.question_type || item.type || 'text',
    line: Number(item.exam_line || context.exam_line || 0),
    maxScore: item.maxScore,
    question: clean(`${item.prompt || ''}${item.instruction ? `\n${item.instruction}` : ''}`, 5000),
    criteria: item.criteria,
    referenceAnswer: clean([valueText(item.expected), item.explanation || ''].filter(Boolean).join('\n'), 6000),
    studentAnswer: item.answer,
  }));
  const prompt = `Ты — строгий эксперт ОСНОВЫ по проверке домашней работы ЕГЭ. Проверь ВСЮ работу одним пакетом.\n
Верни ТОЛЬКО один JSON-объект без markdown строго такого вида:\n{"items":[{"questionId":1,"score":0,"verdict":"","found":[],"missing":[],"mistakes":[],"improvedAnswer":"","confidence":"high"}],"overall":{"summary":"","strengths":[],"weaknesses":[],"nextSteps":[]}}\n
Правила:\n- Для каждого questionId из входа обязательно верни ровно один элемент.\n- score — целое число от 0 до maxScore.\n- Сверяй смысл, формат, критерии и эталон. Опечатка допустима только если она не меняет термин/смысл.\n- Для заданий с точным термином, последовательностью, соответствием или выбором ответа не засчитывай фактически неверный ответ из-за похожего написания.\n- Не придумывай факты и критерии.\n- verdict кратко объясняет оценку. mistakes — конкретные ошибки, missing — что требовалось добавить. improvedAnswer — пример исправленного ответа.\n- overall анализирует работу целиком и даёт конкретные следующие шаги.\n
Предмет: ${context.subject_slug === 'chemistry' ? 'Химия' : 'Биология'}\nЛиния ЕГЭ: ${Number(context.exam_line || 0)}\nНазвание работы: ${clean(context.title, 300)}\nЗадания и ответы:\n${JSON.stringify(compact)}`;

  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.05, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (error) {
    throw Object.assign(new Error('AI-проверка не ответила. Нажмите «Повторить проверку» — ответы сохранены.'), { status: 503, cause: error });
  }
  if (!response.ok) throw Object.assign(new Error('AI-проверка временно недоступна. Ответы сохранены, попробуйте ещё раз.'), { status: 503 });
  const data = await response.json();
  const text = (data?.candidates || []).flatMap(c => c?.content?.parts || []).map(p => p?.text || '').join('\n').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    throw Object.assign(new Error('AI вернул неполную проверку. Ответы сохранены, повторите проверку.'), { status: 503 });
  }
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const byId = new Map(rawItems.map(item => [Number(item.questionId), item]));
  const reviews = items.map(item => {
    const raw = byId.get(Number(item.question_id));
    if (!raw) throw Object.assign(new Error('AI вернул неполную проверку. Ответы сохранены, повторите проверку.'), { status: 503 });
    return { questionId: Number(item.question_id), review: normalizeReview(raw, item.maxScore) };
  });
  return { reviews, overall: normalizeOverall(parsed?.overall || {}) };
}

async function persistBatchGrade(user, context, items, ai) {
  const reviewById = new Map(ai.reviews.map(x => [Number(x.questionId), x.review]));
  return transaction(async tx => {
    const existing = await tx.row('SELECT session_id,overall_json,total_xp FROM teacher_homework_batch_reviews WHERE session_id=? AND user_id=?', context.session_id, user.id);
    if (existing) {
      const session = await tx.row('SELECT * FROM training_sessions WHERE id=? AND user_id=?', context.session_id, user.id);
      return { session, overall: parseJson(existing.overall_json, {}), totalXp: Number(existing.total_xp || 0), alreadyGraded: true };
    }

    let correctCount = 0;
    let totalXp = 0;
    const touchedTopics = new Set();
    for (const item of items) {
      const review = reviewById.get(Number(item.question_id));
      if (!review) throw Object.assign(new Error('Не хватает результата проверки'), { status: 500 });
      const correct = review.score >= item.maxScore;
      if (correct) correctCount += 1;
      const previous = await tx.row('SELECT review_stage FROM attempts WHERE user_id=? AND question_id=? ORDER BY id DESC LIMIT 1', user.id, item.question_id);
      const stage = correct ? Math.min(5, Number(previous?.review_stage || 0) + 1) : 0;
      const interval = [1,2,4,7,14,30][stage] || 1;
      const nextReviewAt = new Date(Date.now() + interval * 86400000).toISOString();
      const xp = review.score <= 0 ? 0 : Math.max(5, Math.min(20, Math.round(20 * review.score / item.maxScore)));
      totalXp += xp;
      const result = {
        correct,
        expected: item.expected,
        reviewAnswer: { label: 'AI-проверка домашней работы', examAnswer: `${review.score}/${item.maxScore} балл.` },
        explanation: item.explanation || '',
        solutionSteps: asArray(parseJson(item.solution_steps_json, [])),
        maxScore: item.maxScore,
        score: review.score,
        homeworkScore: review.score,
        homeworkMaxScore: item.maxScore,
        resolutionType: 'batch_ai_graded',
        xp,
        nextReviewInDays: interval,
        homeworkAutoGrade: true,
        homeworkBatchGrade: true,
        autoReview: review,
      };
      const attempt = await tx.run('INSERT INTO attempts(user_id,question_id,answer_json,correct,duration_seconds,next_review_at,interval_days,review_stage,result_json) VALUES(?,?,?,?,?,?,?,?,?)',
        user.id, item.question_id, JSON.stringify(item.answer), correct, item.duration, nextReviewAt, interval, stage, JSON.stringify(result));
      const attemptId = Number(attempt.lastInsertRowid);
      await tx.run('UPDATE training_session_questions SET attempt_id=?,state=\'answered\',answered_at=COALESCE(answered_at,CURRENT_TIMESTAMP) WHERE session_id=? AND question_id=?', attemptId, context.session_id, item.question_id);
      await tx.run(`UPDATE teacher_homework_reviews SET attempt_id=?,score=?,max_score=?,review_json=?,updated_at=CURRENT_TIMESTAMP
        WHERE session_id=? AND user_id=? AND question_id=?`, attemptId, review.score, item.maxScore, JSON.stringify(review), context.session_id, user.id, item.question_id);
      if (item.topic_id) touchedTopics.add(Number(item.topic_id));
    }

    await tx.run("UPDATE training_sessions SET status='completed',correct_count=?,answered_count=target_questions,finished_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?", correctCount, context.session_id, user.id);
    if (items.length) await tx.run('INSERT INTO activity_days(user_id,day,solved) VALUES(?,CURRENT_DATE,?) ON CONFLICT(user_id,day) DO UPDATE SET solved=activity_days.solved+excluded.solved', user.id, items.length);
    if (totalXp) await tx.run('UPDATE users SET xp=xp+? WHERE id=?', totalXp, user.id);
    for (const topicId of touchedTopics) {
      const topicStats = await tx.row('SELECT COUNT(*) n,AVG(correct)*100 score FROM attempts a JOIN questions q ON q.id=a.question_id WHERE a.user_id=? AND q.topic_id=?', user.id, topicId);
      const attemptCount = Number(topicStats?.n || 0);
      const mastery = Math.min(100, Math.round(Number(topicStats?.score || 0) * Math.min(1, attemptCount / 5)));
      await tx.run('INSERT INTO topic_progress(user_id,topic_id,mastery) VALUES(?,?,?) ON CONFLICT(user_id,topic_id) DO UPDATE SET mastery=excluded.mastery,updated_at=CURRENT_TIMESTAMP', user.id, topicId, mastery);
    }
    await tx.run(`INSERT INTO teacher_homework_batch_reviews(session_id,assignment_id,user_id,overall_json,total_xp)
      VALUES(?,?,?,?,?)`, context.session_id, context.assignment_id, user.id, JSON.stringify(ai.overall), totalXp);
    const session = await tx.row('SELECT * FROM training_sessions WHERE id=? AND user_id=?', context.session_id, user.id);
    return { session, overall: ai.overall, totalXp, alreadyGraded: false };
  });
}

async function finalizeBatch(user, sessionId) {
  const context = await homeworkContext(sessionId, user.id);
  if (!context) throw Object.assign(new Error('Эта тренировка не является домашним заданием'), { status: 404, code: 'NOT_HOMEWORK' });

  const existing = await row('SELECT overall_json,total_xp FROM teacher_homework_batch_reviews WHERE session_id=? AND user_id=?', sessionId, user.id);
  if (existing) {
    const session = await row('SELECT * FROM training_sessions WHERE id=? AND user_id=?', sessionId, user.id);
    return { homework: true, done: true, session, overallReview: parseJson(existing.overall_json, {}), xp: Number(existing.total_xp || 0), alreadyGraded: true };
  }

  const items = await batchInput(sessionId, user.id);
  const legacyAttempts = items.filter(item => item.attempt_id || item.review_attempt_id).length;
  const deferred = items.filter(item => item.stored?.pending && item.answer.length);
  if (!deferred.length && legacyAttempts === items.length && context.session_status === 'completed') {
    const session = await row('SELECT * FROM training_sessions WHERE id=? AND user_id=?', sessionId, user.id);
    return { homework: true, done: true, session, legacy: true, alreadyGraded: true };
  }
  if (!items.length || deferred.length !== items.length) {
    throw Object.assign(new Error('Сначала ответьте на все задания домашней работы'), { status: 409, code: 'HOMEWORK_INCOMPLETE' });
  }

  const ai = await callBatchAi(context, items);
  const saved = await persistBatchGrade(user, context, items, ai);
  return { homework: true, done: true, session: saved.session, overallReview: saved.overall, xp: saved.totalXp, alreadyGraded: saved.alreadyGraded };
}

async function finalizeOnce(user, sessionId) {
  const key = `${Number(user.id)}:${Number(sessionId)}`;
  if (finalizeInFlight.has(key)) return finalizeInFlight.get(key);
  const promise = finalizeBatch(user, sessionId).finally(() => finalizeInFlight.delete(key));
  finalizeInFlight.set(key, promise);
  return promise;
}

async function summaryPayload(user, sessionId) {
  const context = await homeworkContext(sessionId, user.id);
  if (!context) return null;
  const batch = await row('SELECT overall_json,total_xp FROM teacher_homework_batch_reviews WHERE session_id=? AND user_id=?', sessionId, user.id);
  if (!batch) return null;
  const grade = await teacherV3.sessionGrade(sessionId);
  return {
    homework: true,
    assignment: { id: Number(context.assignment_id), title: context.title, className: context.class_name, teacherName: context.teacher_name, dueAt: context.due_at },
    ...grade,
    overallReview: parseJson(batch.overall_json, {}),
    batchAi: true,
    xp: Number(batch.total_xp || 0),
    late: Boolean(context.due_at && grade?.session?.finished_at && new Date(grade.session.finished_at).getTime() > new Date(context.due_at).getTime()),
  };
}

async function handle(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/teacher/homework/sessions/')) return false;
  try {
    let match = path.match(/^\/api\/teacher\/homework\/sessions\/(\d+)\/save$/);
    if (match && req.method === 'POST') {
      const user = await requireUser(req, res); if (!user) return true;
      const payload = await readJson(req);
      json(res, 200, await saveDeferredAnswer(user, idOf(match[1]), payload));
      return true;
    }

    match = path.match(/^\/api\/teacher\/homework\/sessions\/(\d+)\/finalize$/);
    if (match && req.method === 'POST') {
      const user = await requireUser(req, res); if (!user) return true;
      await readJson(req);
      json(res, 200, await finalizeOnce(user, idOf(match[1])));
      return true;
    }

    match = path.match(/^\/api\/teacher\/homework\/sessions\/(\d+)\/summary$/);
    if (match && req.method === 'GET') {
      const user = await requireUser(req, res); if (!user) return true;
      const data = await summaryPayload(user, idOf(match[1]));
      if (!data) return false;
      json(res, 200, data);
      return true;
    }
  } catch (error) {
    json(res, Number(error?.status || 500), { error: error?.message || 'Ошибка пакетной проверки домашней работы', code: error?.code || null });
    return true;
  }
  return false;
}

module.exports = { ensureSchema, handle, saveDeferredAnswer, finalizeBatch, summaryPayload };
