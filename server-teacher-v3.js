'use strict';

const database = require('./src/db');
const answerExpert = require('./server-answer-expert');
const { needsManualReview } = require('./src/question-answer');
const { rows, row, run, transaction } = database;

const MAX_BODY = 128 * 1024;
const gradeTimes = new Map();

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
const cleanText = (value, max = 10000) => String(value ?? '').trim().slice(0, max);
const parseJson = (value, fallback = null) => {
  try { return value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value; }
  catch { return fallback; }
};
const asArray = value => Array.isArray(value) ? value : value == null ? [] : [value];
const valueText = value => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join('; ');
  if (typeof value === 'object') return Object.values(value).map(valueText).filter(Boolean).join('; ');
  return String(value).trim();
};

async function ensureSchema() {
  const idType = database.dialect === 'postgresql' ? 'BIGINT' : 'INTEGER';
  const timeType = database.dialect === 'postgresql' ? 'TIMESTAMP' : 'TEXT';
  await run(`CREATE TABLE IF NOT EXISTS teacher_homework_reviews (
    session_id ${idType} NOT NULL,
    assignment_id ${idType} NOT NULL REFERENCES teacher_assignments(id) ON DELETE CASCADE,
    user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id ${idType} NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    attempt_id ${idType},
    score INTEGER NOT NULL DEFAULT 0,
    max_score INTEGER NOT NULL DEFAULT 1,
    review_json TEXT NOT NULL DEFAULT '{}',
    created_at ${timeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at ${timeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(session_id,question_id)
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_teacher_homework_reviews_assignment ON teacher_homework_reviews(assignment_id,user_id)');
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

async function requireTeacher(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  const record = await row('SELECT user_id FROM teacher_users WHERE user_id=?', user.id).catch(() => null);
  if (!record && user.role !== 'admin') { json(res, 403, { error: 'Кабинет доступен только учителю' }); return null; }
  return user;
}

async function teacherClass(teacherId, classId) {
  return row('SELECT id,teacher_id,name,join_code FROM teacher_classes WHERE id=? AND teacher_id=?', classId, teacherId);
}

async function isStaff(userId) {
  const user = await row('SELECT id,role FROM users WHERE id=?', userId);
  if (!user) return { exists: false, staff: false };
  if (user.role === 'admin') return { exists: true, staff: true };
  const teacher = await row('SELECT user_id FROM teacher_users WHERE user_id=?', userId).catch(() => null);
  if (teacher) return { exists: true, staff: true };
  const moderator = await row('SELECT user_id FROM moderator_users WHERE user_id=?', userId).catch(() => null);
  return { exists: true, staff: Boolean(moderator) };
}

async function addStudentV3(teacher, classId, emailValue) {
  const klass = await teacherClass(teacher.id, classId);
  if (!klass) throw Object.assign(new Error('Класс не найден'), { status: 404 });
  const email = cleanText(emailValue, 180).toLowerCase();
  if (!email || !email.includes('@')) throw Object.assign(new Error('Введите почту ученика, зарегистрированного на сайте'), { status: 400 });
  const student = await row('SELECT id,name,email,xp FROM users WHERE LOWER(email)=LOWER(?)', email);
  if (!student) throw Object.assign(new Error('Пользователь с такой почтой не найден. Сначала ученик должен зарегистрироваться на сайте.'), { status: 404 });
  if (Number(student.id) === Number(teacher.id)) throw Object.assign(new Error('Нельзя добавить себя в свой класс'), { status: 400 });
  const staff = await isStaff(student.id);
  if (staff.staff) throw Object.assign(new Error('В класс можно добавлять только учеников'), { status: 400 });

  const existing = await row('SELECT user_id FROM teacher_class_students WHERE class_id=? AND user_id=?', classId, student.id);
  if (!existing) await run('INSERT INTO teacher_class_students(class_id,user_id) VALUES(?,?)', classId, student.id);

  // A newly added student receives only homework that is still current. Historical/expired work stays historical.
  await run(`INSERT INTO teacher_assignment_students(assignment_id,user_id)
    SELECT id,? FROM teacher_assignments
    WHERE class_id=? AND (due_at IS NULL OR due_at>=CURRENT_TIMESTAMP)
    ON CONFLICT(assignment_id,user_id) DO NOTHING`, student.id, classId);

  return { id: Number(student.id), name: student.name, email: student.email, xp: Number(student.xp || 0), classId: Number(classId), className: klass.name, alreadyInClass: Boolean(existing) };
}

async function removeStudentV3(teacher, classId, studentId) {
  const klass = await teacherClass(teacher.id, classId);
  if (!klass) throw Object.assign(new Error('Класс не найден'), { status: 404 });
  const membership = await row('SELECT user_id FROM teacher_class_students WHERE class_id=? AND user_id=?', classId, studentId);
  if (!membership) throw Object.assign(new Error('Ученик не состоит в этом классе'), { status: 404 });
  // Preserve teacher_assignment_students: completed/started homework is part of the class history.
  await run('DELETE FROM teacher_class_students WHERE class_id=? AND user_id=?', classId, studentId);
  return { ok: true, historyPreserved: true };
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

function maxForQuestion(item) {
  const result = parseJson(item?.result_json, {}) || {};
  const raw = Number(result.homeworkMaxScore ?? result.maxScore ?? item?.max_score ?? item?.points ?? 1);
  return Math.max(1, Number.isFinite(raw) ? Math.round(raw) : 1);
}

function scoreForQuestion(item) {
  const result = parseJson(item?.result_json, {}) || {};
  const max = maxForQuestion(item);
  if (result.resolutionType === 'revealed') return { score: 0, max, result };
  const stored = Number(result.homeworkScore ?? result.score);
  const score = Number.isFinite(stored) ? Math.max(0, Math.min(max, Math.round(stored))) : item?.correct ? max : 0;
  return { score, max, result };
}

async function sessionGrade(sessionId) {
  const session = await row('SELECT id,user_id,status,answered_count,correct_count,target_questions,started_at,finished_at FROM training_sessions WHERE id=?', sessionId);
  if (!session) return null;
  const items = await rows(`SELECT tsq.position,tsq.state,tsq.answered_at,tsq.attempt_id,q.id question_id,q.prompt,q.points,q.max_score,
      a.correct,a.answer_json,a.duration_seconds,a.result_json
    FROM training_session_questions tsq
    JOIN questions q ON q.id=tsq.question_id
    LEFT JOIN attempts a ON a.id=tsq.attempt_id
    WHERE tsq.session_id=? ORDER BY tsq.position`, sessionId);
  let earned = 0, maximum = 0;
  const details = items.map(item => {
    const { score, max, result } = scoreForQuestion(item);
    maximum += max; earned += score;
    return {
      position: Number(item.position) + 1,
      questionId: Number(item.question_id),
      prompt: item.prompt,
      state: item.state,
      answeredAt: item.answered_at || null,
      score,
      maxScore: max,
      correct: Boolean(item.correct),
      durationSeconds: Number(item.duration_seconds || 0),
      verdict: result?.autoReview?.verdict || result?.verdict || '',
      missing: asArray(result?.autoReview?.missing || result?.missing).map(String).slice(0, 8),
      mistakes: asArray(result?.autoReview?.mistakes || result?.mistakes).map(String).slice(0, 8),
      resolutionType: result?.resolutionType || null,
    };
  });
  return {
    session: { ...session, id: Number(session.id), answered_count: Number(session.answered_count || 0), correct_count: Number(session.correct_count || 0), target_questions: Number(session.target_questions || 0) },
    earnedPoints: earned,
    maxPoints: maximum || Math.max(1, Number(session.target_questions || 1)),
    percent: maximum ? Math.round(earned / maximum * 100) : 0,
    items: details,
  };
}

async function assignmentMaxPoints(questionIdsJson) {
  const ids = asArray(parseJson(questionIdsJson, [])).map(idOf).filter(Boolean);
  if (!ids.length) return 0;
  const marks = ids.map(() => '?').join(',');
  const questions = await rows(`SELECT id,points,max_score FROM questions WHERE id IN (${marks})`, ...ids);
  return questions.reduce((sum, q) => sum + Math.max(1, Number(q.max_score || q.points || 1)), 0);
}

function lateState(dueAt, finishedAt, status) {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return false;
  const compare = status === 'completed' && finishedAt ? new Date(finishedAt).getTime() : Date.now();
  return Number.isFinite(compare) && compare > due;
}

async function resultsForTeacherV3(teacherId) {
  const base = await rows(`SELECT a.id assignment_id,a.title,a.subject_slug,a.exam_line,a.question_count,a.question_ids_json,a.due_at,a.created_at,
      c.id class_id,c.name class_name,u.id user_id,u.name student_name,u.email student_email,
      tas.training_session_id,tas.started_at,ts.status training_status,ts.answered_count,ts.correct_count,ts.started_at session_started_at,ts.finished_at
    FROM teacher_assignments a
    JOIN teacher_classes c ON c.id=a.class_id
    JOIN teacher_assignment_students tas ON tas.assignment_id=a.id
    JOIN users u ON u.id=tas.user_id
    LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    WHERE a.teacher_id=?
    ORDER BY a.created_at DESC,a.id DESC,u.name,u.id`, teacherId);

  const gradeCache = new Map();
  const maxCache = new Map();
  const output = [];
  for (const item of base) {
    const sessionId = item.training_session_id ? Number(item.training_session_id) : null;
    let grade = null;
    if (sessionId) {
      if (!gradeCache.has(sessionId)) gradeCache.set(sessionId, await sessionGrade(sessionId));
      grade = gradeCache.get(sessionId);
    }
    const assignmentId = Number(item.assignment_id);
    if (!maxCache.has(assignmentId)) maxCache.set(assignmentId, await assignmentMaxPoints(item.question_ids_json));
    const maxPoints = grade?.maxPoints || maxCache.get(assignmentId) || Number(item.question_count || 0);
    const earnedPoints = grade?.earnedPoints || 0;
    const status = item.training_status === 'completed' ? 'completed' : item.training_status === 'active' ? 'active' : 'assigned';
    output.push({
      ...item,
      assignment_id: assignmentId,
      class_id: Number(item.class_id),
      user_id: Number(item.user_id),
      exam_line: Number(item.exam_line),
      question_count: Number(item.question_count),
      training_session_id: sessionId,
      answered_count: Number(item.answered_count || 0),
      correct_count: Number(item.correct_count || 0),
      score_points: earnedPoints,
      max_points: maxPoints,
      accuracy: maxPoints ? Math.round(earnedPoints / maxPoints * 100) : 0,
      status,
      late: lateState(item.due_at, item.finished_at, status),
    });
  }
  return output;
}

async function studentPayloadV3(userId) {
  const memberships = await rows(`SELECT c.id,c.name,c.join_code,u.name teacher_name,cs.joined_at
    FROM teacher_class_students cs JOIN teacher_classes c ON c.id=cs.class_id JOIN users u ON u.id=c.teacher_id
    WHERE cs.user_id=? ORDER BY cs.joined_at DESC`, userId);
  const assignments = await rows(`SELECT a.id,a.title,a.subject_slug,a.exam_line,a.question_count,a.question_ids_json,a.due_at,a.created_at,c.name class_name,u.name teacher_name,
      tas.training_session_id,ts.status training_status,ts.answered_count,ts.correct_count,ts.finished_at
    FROM teacher_class_students cs
    JOIN teacher_assignments a ON a.class_id=cs.class_id
    JOIN teacher_classes c ON c.id=a.class_id
    JOIN users u ON u.id=a.teacher_id
    LEFT JOIN teacher_assignment_students tas ON tas.assignment_id=a.id AND tas.user_id=cs.user_id
    LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    WHERE cs.user_id=? AND tas.user_id IS NOT NULL
    ORDER BY CASE WHEN ts.status='completed' THEN 1 ELSE 0 END,a.due_at NULLS LAST,a.created_at DESC,a.id DESC`, userId).catch(async () => rows(`SELECT a.id,a.title,a.subject_slug,a.exam_line,a.question_count,a.question_ids_json,a.due_at,a.created_at,c.name class_name,u.name teacher_name,
      tas.training_session_id,ts.status training_status,ts.answered_count,ts.correct_count,ts.finished_at
    FROM teacher_class_students cs
    JOIN teacher_assignments a ON a.class_id=cs.class_id
    JOIN teacher_classes c ON c.id=a.class_id
    JOIN users u ON u.id=a.teacher_id
    LEFT JOIN teacher_assignment_students tas ON tas.assignment_id=a.id AND tas.user_id=cs.user_id
    LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    WHERE cs.user_id=? AND tas.user_id IS NOT NULL
    ORDER BY a.created_at DESC,a.id DESC`, userId));

  const output = [];
  for (const item of assignments) {
    const sessionId = item.training_session_id ? Number(item.training_session_id) : null;
    const grade = sessionId ? await sessionGrade(sessionId) : null;
    const maxPoints = grade?.maxPoints || await assignmentMaxPoints(item.question_ids_json) || Number(item.question_count || 0);
    const earnedPoints = grade?.earnedPoints || 0;
    const status = item.training_status === 'completed' ? 'completed' : item.training_status === 'active' ? 'active' : 'assigned';
    output.push({
      ...item,
      id: Number(item.id), exam_line: Number(item.exam_line), question_count: Number(item.question_count),
      training_session_id: sessionId, answered_count: Number(item.answered_count || 0), correct_count: Number(item.correct_count || 0),
      status, score_points: earnedPoints, max_points: maxPoints,
      grade_percent: maxPoints ? Math.round(earnedPoints / maxPoints * 100) : 0,
      late: lateState(item.due_at, item.finished_at, status),
    });
  }
  return { memberships: memberships.map(x => ({ ...x, id: Number(x.id) })), assignments: output };
}

function enforceGradeRate(userId) {
  const now = Date.now();
  const fresh = (gradeTimes.get(userId) || []).filter(ts => now - ts < 60_000);
  if (fresh.length >= 8) throw Object.assign(new Error('Слишком много автоматических проверок подряд. Подождите минуту.'), { status: 429 });
  fresh.push(now); gradeTimes.set(userId, fresh);
}

function normalizeReview(raw, maxScore) {
  const score = Math.max(0, Math.min(maxScore, Math.round(Number(raw?.score) || 0)));
  return {
    score,
    maxScore,
    verdict: cleanText(raw?.verdict || 'Ответ проверен автоматически.', 1200),
    found: asArray(raw?.found).map(x => cleanText(x, 600)).filter(Boolean).slice(0, 12),
    missing: asArray(raw?.missing).map(x => cleanText(x, 600)).filter(Boolean).slice(0, 12),
    mistakes: asArray(raw?.mistakes).map(x => cleanText(x, 600)).filter(Boolean).slice(0, 12),
    improvedAnswer: cleanText(raw?.improvedAnswer, 6000),
    confidence: ['high','medium','low'].includes(raw?.confidence) ? raw.confidence : 'low',
  };
}

async function geminiFallbackGrade(payload, maxScore) {
  if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error('Автопроверка развёрнутого ответа временно недоступна'), { status: 503 });
  const models = [...new Set([process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL, 'gemini-2.5-flash-lite'].filter(Boolean))];
  const prompt = `Ты — строгая система автоматической проверки домашней работы по ЕГЭ. Верни ТОЛЬКО JSON без markdown: {"score":0,"verdict":"","found":[],"missing":[],"mistakes":[],"improvedAnswer":"","confidence":"high|medium|low"}.\nМаксимум баллов: ${maxScore}. Оценивай по смыслу и критериям, не требуй дословного совпадения. Не придумывай факты.\nПредмет: ${payload.subject}\nЛиния: ${payload.line}\nУсловие: ${payload.question}\nКритерии: ${payload.criteria || 'нет отдельных критериев'}\nЭталон: ${payload.referenceAnswer}\nОтвет ученика: ${payload.answer}`;
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1000, temperature: 0.05 } }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) continue;
      const data = await response.json();
      const text = (data?.candidates || []).flatMap(c => c?.content?.parts || []).map(p => p?.text || '').join('\n').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      return normalizeReview(JSON.parse(match[0]), maxScore);
    } catch {}
  }
  throw Object.assign(new Error('Автопроверка развёрнутого ответа временно недоступна'), { status: 503 });
}

async function automaticReview(payload, maxScore) {
  try {
    const result = await answerExpert.evaluate({ ...payload, maxScore });
    return normalizeReview(result, maxScore);
  } catch (error) {
    if (![429, 503].includes(Number(error?.status || 0))) console.warn('homework-answer-expert-fallback', error?.message || error);
    return geminiFallbackGrade(payload, maxScore);
  }
}

async function gradeExtendedHomework(user, sessionId, body) {
  const context = await homeworkContext(sessionId, user.id);
  if (!context) throw Object.assign(new Error('Эта тренировка не является домашним заданием'), { status: 404, code: 'NOT_HOMEWORK' });
  if (context.session_status !== 'active') throw Object.assign(new Error('Домашнее задание уже завершено'), { status: 409 });
  const questionId = idOf(body.questionId);
  if (!questionId) throw Object.assign(new Error('Некорректное задание'), { status: 400 });
  const q = await row(`SELECT tsq.position,tsq.state,q.*,t.title topic,s.slug subject_slug
    FROM training_session_questions tsq
    JOIN questions q ON q.id=tsq.question_id
    JOIN topics t ON t.id=q.topic_id
    JOIN subjects s ON s.id=t.subject_id
    WHERE tsq.session_id=? AND q.id=?`, sessionId, questionId);
  if (!q || q.state !== 'pending') throw Object.assign(new Error('Задание уже проверено или не входит в эту работу'), { status: 409 });
  if (!needsManualReview(q)) throw Object.assign(new Error('Это задание проверяется обычным алгоритмом ОСНОВЫ'), { status: 400 });
  const answer = asArray(body.answer).map(x => cleanText(x, 7000)).filter(Boolean).join('\n');
  if (!answer) throw Object.assign(new Error('Введите ответ'), { status: 400 });
  enforceGradeRate(user.id);

  const meta = parseJson(q.explanation_json, {}) || {};
  const scoring = asArray(meta.scoringPoints || meta.criteria || meta.scoringCriteria).map(valueText).filter(Boolean);
  const expected = valueText(parseJson(q.answer_json, []));
  const maxScore = Math.max(1, Number(q.max_score || q.points || scoring.length || 1));
  const review = await automaticReview({
    subject: context.subject_slug || q.subject_slug,
    line: Number(q.exam_line || context.exam_line || 0),
    question: `${q.prompt || ''}${q.instruction ? `\n${q.instruction}` : ''}`,
    answer,
    criteria: scoring.join('\n'),
    referenceAnswer: [expected, q.explanation || ''].filter(Boolean).join('\n'),
  }, maxScore);

  const correct = review.score >= maxScore;
  const duration = Math.max(0, Math.min(7200, Number(body.duration) || 0));
  const saved = await transaction(async tx => {
    const current = await tx.row(`SELECT tsq.position,tsq.state,q.topic_id,q.lesson_id,q.answer_json,q.explanation,q.solution_steps_json,q.points,q.max_score
      FROM training_session_questions tsq JOIN questions q ON q.id=tsq.question_id
      JOIN training_sessions s ON s.id=tsq.session_id
      WHERE tsq.session_id=? AND s.user_id=? AND q.id=?`, sessionId, user.id, questionId);
    if (!current || current.state !== 'pending') throw Object.assign(new Error('Задание уже проверено'), { status: 409 });
    const claimed = await tx.run("UPDATE training_session_questions SET state='answered',answered_at=CURRENT_TIMESTAMP WHERE session_id=? AND position=? AND state='pending'", sessionId, current.position);
    if (!claimed.changes) throw Object.assign(new Error('Задание уже проверено'), { status: 409 });

    const previous = await tx.row('SELECT review_stage FROM attempts WHERE user_id=? AND question_id=? ORDER BY id DESC LIMIT 1', user.id, questionId);
    const stage = correct ? Math.min(5, Number(previous?.review_stage || 0) + 1) : 0;
    const interval = [1,2,4,7,14,30][stage] || 1;
    const nextReviewAt = new Date(Date.now() + interval * 86400000).toISOString();
    const xp = review.score <= 0 ? 5 : Math.max(5, Math.min(20, Math.round(20 * review.score / maxScore)));
    const result = {
      correct,
      expected: parseJson(current.answer_json, []),
      reviewAnswer: { label: 'Автопроверка ОСНОВЫ', examAnswer: `${review.score}/${maxScore} балл.` },
      explanation: current.explanation || '',
      solutionSteps: asArray(parseJson(current.solution_steps_json, [])),
      maxScore,
      score: review.score,
      homeworkScore: review.score,
      homeworkMaxScore: maxScore,
      resolutionType: 'auto_graded',
      xp,
      nextReviewInDays: interval,
      homeworkAutoGrade: true,
      autoReview: review,
    };
    const attempt = await tx.run('INSERT INTO attempts(user_id,question_id,answer_json,correct,duration_seconds,next_review_at,interval_days,review_stage,result_json) VALUES(?,?,?,?,?,?,?,?,?)',
      user.id, questionId, JSON.stringify(asArray(body.answer).map(String)), correct, duration, nextReviewAt, interval, stage, JSON.stringify(result));
    const attemptId = Number(attempt.lastInsertRowid);
    await tx.run('UPDATE training_session_questions SET attempt_id=? WHERE session_id=? AND position=?', attemptId, sessionId, current.position);
    await tx.run('UPDATE training_sessions SET answered_count=answered_count+1,correct_count=correct_count+? WHERE id=?', correct ? 1 : 0, sessionId);
    await tx.run('INSERT INTO activity_days(user_id,day,solved) VALUES(?,CURRENT_DATE,1) ON CONFLICT(user_id,day) DO UPDATE SET solved=activity_days.solved+1', user.id);
    await tx.run('UPDATE users SET xp=xp+? WHERE id=?', xp, user.id);
    const topicStats = await tx.row('SELECT COUNT(*) n,AVG(correct)*100 score FROM attempts a JOIN questions q ON q.id=a.question_id WHERE a.user_id=? AND q.topic_id=?', user.id, current.topic_id);
    const attemptCount = Number(topicStats?.n || 0), mastery = Math.min(100, Math.round(Number(topicStats?.score || 0) * Math.min(1, attemptCount / 5)));
    await tx.run('INSERT INTO topic_progress(user_id,topic_id,mastery) VALUES(?,?,?) ON CONFLICT(user_id,topic_id) DO UPDATE SET mastery=excluded.mastery,updated_at=CURRENT_TIMESTAMP', user.id, current.topic_id, mastery);
    await tx.run(`INSERT INTO teacher_homework_reviews(session_id,assignment_id,user_id,question_id,attempt_id,score,max_score,review_json)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(session_id,question_id) DO UPDATE SET attempt_id=excluded.attempt_id,score=excluded.score,max_score=excluded.max_score,review_json=excluded.review_json,updated_at=CURRENT_TIMESTAMP`,
      sessionId, context.assignment_id, user.id, questionId, attemptId, review.score, maxScore, JSON.stringify(review));
    const left = Number((await tx.row("SELECT COUNT(*) n FROM training_session_questions WHERE session_id=? AND state='pending'", sessionId)).n || 0);
    if (left === 0) await tx.run("UPDATE training_sessions SET status='completed',finished_at=CURRENT_TIMESTAMP WHERE id=?", sessionId);
    return { result, left };
  });

  const session = await row('SELECT * FROM training_sessions WHERE id=? AND user_id=?', sessionId, user.id);
  return { ...saved.result, attemptId: null, done: saved.left === 0, session, homework: true };
}

async function detailForTeacher(teacherId, assignmentId, userId) {
  const link = await row(`SELECT a.id assignment_id,a.title,a.subject_slug,a.exam_line,a.due_at,c.name class_name,u.name student_name,u.email student_email,
      tas.training_session_id,ts.status training_status,ts.started_at,ts.finished_at
    FROM teacher_assignments a JOIN teacher_classes c ON c.id=a.class_id
    JOIN teacher_assignment_students tas ON tas.assignment_id=a.id
    JOIN users u ON u.id=tas.user_id LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    WHERE a.id=? AND a.teacher_id=? AND tas.user_id=?`, assignmentId, teacherId, userId);
  if (!link) throw Object.assign(new Error('Результат не найден'), { status: 404 });
  const grade = link.training_session_id ? await sessionGrade(Number(link.training_session_id)) : null;
  return {
    ...link,
    assignment_id: Number(link.assignment_id), user_id: Number(userId),
    status: link.training_status === 'completed' ? 'completed' : link.training_status === 'active' ? 'active' : 'assigned',
    earnedPoints: grade?.earnedPoints || 0,
    maxPoints: grade?.maxPoints || 0,
    percent: grade?.percent || 0,
    late: lateState(link.due_at, link.finished_at, link.training_status === 'completed' ? 'completed' : 'active'),
    items: grade?.items || [],
  };
}

async function handle(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/teacher')) return false;
  try {
    if (path === '/api/teacher/results' && req.method === 'GET') {
      const teacher = await requireTeacher(req, res); if (!teacher) return true;
      json(res, 200, { results: await resultsForTeacherV3(teacher.id) }); return true;
    }
    if (path === '/api/teacher/student' && req.method === 'GET') {
      const user = await requireUser(req, res); if (!user) return true;
      json(res, 200, await studentPayloadV3(user.id)); return true;
    }

    let match = path.match(/^\/api\/teacher\/classes\/(\d+)\/students$/);
    if (match && req.method === 'POST') {
      const teacher = await requireTeacher(req, res); if (!teacher) return true;
      const payload = await readJson(req);
      json(res, 201, { student: await addStudentV3(teacher, idOf(match[1]), payload.email) }); return true;
    }
    match = path.match(/^\/api\/teacher\/classes\/(\d+)\/students\/(\d+)$/);
    if (match && req.method === 'DELETE') {
      const teacher = await requireTeacher(req, res); if (!teacher) return true;
      json(res, 200, await removeStudentV3(teacher, idOf(match[1]), idOf(match[2]))); return true;
    }

    match = path.match(/^\/api\/teacher\/homework\/sessions\/(\d+)\/meta$/);
    if (match && req.method === 'GET') {
      const user = await requireUser(req, res); if (!user) return true;
      const context = await homeworkContext(idOf(match[1]), user.id);
      json(res, 200, context ? { homework: true, assignment: { id: Number(context.assignment_id), title: context.title, className: context.class_name, teacherName: context.teacher_name, dueAt: context.due_at } } : { homework: false });
      return true;
    }

    match = path.match(/^\/api\/teacher\/homework\/sessions\/(\d+)\/grade-extended$/);
    if (match && req.method === 'POST') {
      const user = await requireUser(req, res); if (!user) return true;
      const payload = await readJson(req);
      json(res, 200, await gradeExtendedHomework(user, idOf(match[1]), payload)); return true;
    }

    match = path.match(/^\/api\/teacher\/homework\/sessions\/(\d+)\/summary$/);
    if (match && req.method === 'GET') {
      const user = await requireUser(req, res); if (!user) return true;
      const sessionId = idOf(match[1]), context = await homeworkContext(sessionId, user.id);
      if (!context) { json(res, 404, { error: 'Это не домашнее задание' }); return true; }
      const grade = await sessionGrade(sessionId);
      json(res, 200, {
        homework: true,
        assignment: { id: Number(context.assignment_id), title: context.title, className: context.class_name, teacherName: context.teacher_name, dueAt: context.due_at },
        ...grade,
        late: lateState(context.due_at, grade?.session?.finished_at, grade?.session?.status),
      }); return true;
    }

    match = path.match(/^\/api\/teacher\/results\/(\d+)\/(\d+)$/);
    if (match && req.method === 'GET') {
      const teacher = await requireTeacher(req, res); if (!teacher) return true;
      json(res, 200, { result: await detailForTeacher(teacher.id, idOf(match[1]), idOf(match[2])) }); return true;
    }
  } catch (error) {
    json(res, Number(error?.status || 500), { error: error?.message || 'Ошибка системы домашних заданий', code: error?.code || null });
    return true;
  }
  return false;
}

module.exports = { ensureSchema, handle, resultsForTeacherV3, studentPayloadV3, sessionGrade };
