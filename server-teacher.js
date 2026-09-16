'use strict';

const { randomBytes } = require('node:crypto');
const database = require('./src/db');
const { rows, row, run } = database;

const MAX_BODY = 96 * 1024;
const SUBJECTS = new Set(['biology', 'chemistry']);
const AI_TIMEOUT_MS = Math.max(5000, Number(process.env.GEMINI_TIMEOUT_MS) || 15000);

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
const cleanText = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const bool = value => value === true || value === 1 || value === '1' || value === 'true';

async function ensureSchema() {
  const idType = database.dialect === 'postgresql' ? 'BIGINT' : 'INTEGER';
  const serialType = database.dialect === 'postgresql' ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY';
  const timeType = database.dialect === 'postgresql' ? 'TIMESTAMP' : 'TEXT';

  await run(`CREATE TABLE IF NOT EXISTS teacher_users (
    user_id ${idType} PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    assigned_by ${idType} REFERENCES users(id) ON DELETE SET NULL,
    created_at ${timeType} NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS teacher_classes (
    id ${serialType},
    teacher_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    created_at ${timeType} NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS teacher_class_students (
    class_id ${idType} NOT NULL REFERENCES teacher_classes(id) ON DELETE CASCADE,
    user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at ${timeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(class_id,user_id)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS teacher_assignments (
    id ${serialType},
    teacher_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id ${idType} NOT NULL REFERENCES teacher_classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject_slug TEXT NOT NULL,
    exam_line INTEGER NOT NULL,
    question_count INTEGER NOT NULL,
    instruction_text TEXT NOT NULL DEFAULT '',
    question_ids_json TEXT NOT NULL DEFAULT '[]',
    due_at ${timeType},
    created_at ${timeType} NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS teacher_assignment_students (
    assignment_id ${idType} NOT NULL REFERENCES teacher_assignments(id) ON DELETE CASCADE,
    user_id ${idType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    training_session_id ${idType},
    started_at ${timeType},
    PRIMARY KEY(assignment_id,user_id)
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher ON teacher_classes(teacher_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_teacher_class_students_user ON teacher_class_students(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class ON teacher_assignments(class_id,created_at)');
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row('SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP', token);
}

async function teacherRecord(userId) {
  if (!userId) return null;
  return row('SELECT user_id,assigned_by,created_at FROM teacher_users WHERE user_id=?', userId);
}

async function requireTeacher(req, res) {
  const user = await userFor(req);
  if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return null; }
  const record = await teacherRecord(user.id);
  if (!record && user.role !== 'admin') { json(res, 403, { error: 'Кабинет доступен только учителю' }); return null; }
  return user;
}

async function requireUser(req, res) {
  const user = await userFor(req);
  if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return null; }
  return user;
}

async function insertWithId(sql, ...params) {
  if (database.dialect === 'postgresql') {
    const created = await row(`${sql} RETURNING id`, ...params);
    return Number(created.id);
  }
  const created = await run(sql, ...params);
  return Number(created.lastInsertRowid);
}

function joinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(7);
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
}

async function uniqueJoinCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = joinCode();
    if (!(await row('SELECT id FROM teacher_classes WHERE join_code=?', code))) return code;
  }
  throw new Error('Не удалось создать код класса');
}

async function teacherClass(teacherId, classId) {
  return row('SELECT id,teacher_id,name,join_code,created_at FROM teacher_classes WHERE id=? AND teacher_id=?', classId, teacherId);
}

async function classesForTeacher(teacherId) {
  return rows(`SELECT c.id,c.name,c.join_code,c.created_at,COUNT(cs.user_id) student_count
    FROM teacher_classes c LEFT JOIN teacher_class_students cs ON cs.class_id=c.id
    WHERE c.teacher_id=? GROUP BY c.id,c.name,c.join_code,c.created_at ORDER BY c.created_at,c.id`, teacherId);
}

async function studentsForClass(classId) {
  return rows(`SELECT u.id,u.name,u.xp,cs.joined_at,
      (SELECT COUNT(*) FROM attempts a WHERE a.user_id=u.id) solved,
      COALESCE((SELECT ROUND(AVG(a.correct)*100) FROM attempts a WHERE a.user_id=u.id),0) accuracy,
      COALESCE((SELECT ROUND(AVG(tp.mastery)) FROM topic_progress tp WHERE tp.user_id=u.id),0) mastery,
      (SELECT MAX(a.created_at) FROM attempts a WHERE a.user_id=u.id) last_activity_at
    FROM teacher_class_students cs JOIN users u ON u.id=cs.user_id
    WHERE cs.class_id=? ORDER BY u.name,u.id`, classId);
}

async function assignmentsForTeacher(teacherId) {
  return rows(`SELECT a.id,a.class_id,a.title,a.subject_slug,a.exam_line,a.question_count,a.instruction_text,a.due_at,a.created_at,c.name class_name,
      COUNT(tas.user_id) student_count,
      COALESCE(SUM(CASE WHEN ts.status='completed' THEN 1 ELSE 0 END),0) completed_count,
      COALESCE(SUM(CASE WHEN ts.status='active' THEN 1 ELSE 0 END),0) active_count
    FROM teacher_assignments a
    JOIN teacher_classes c ON c.id=a.class_id
    LEFT JOIN teacher_assignment_students tas ON tas.assignment_id=a.id
    LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    WHERE a.teacher_id=?
    GROUP BY a.id,a.class_id,a.title,a.subject_slug,a.exam_line,a.question_count,a.instruction_text,a.due_at,a.created_at,c.name
    ORDER BY a.created_at DESC,a.id DESC`, teacherId);
}

async function teacherDashboard(teacherId) {
  const classes = await classesForTeacher(teacherId);
  const students = [];
  for (const item of classes) {
    const classStudents = await studentsForClass(item.id);
    students.push(...classStudents.map(student => ({ ...student, classId: Number(item.id), className: item.name })));
  }
  const assignments = await assignmentsForTeacher(teacherId);
  const accuracyValues = students.map(x => Number(x.accuracy || 0)).filter(Number.isFinite);
  return {
    classes: classes.map(x => ({ ...x, id: Number(x.id), student_count: Number(x.student_count || 0) })),
    students: students.map(x => ({ ...x, id: Number(x.id), xp: Number(x.xp || 0), solved: Number(x.solved || 0), accuracy: Number(x.accuracy || 0), mastery: Number(x.mastery || 0) })),
    assignments: assignments.map(x => ({ ...x, id: Number(x.id), class_id: Number(x.class_id), exam_line: Number(x.exam_line), question_count: Number(x.question_count), student_count: Number(x.student_count || 0), completed_count: Number(x.completed_count || 0), active_count: Number(x.active_count || 0) })),
    metrics: {
      classes: classes.length,
      students: students.length,
      assignments: assignments.length,
      averageAccuracy: accuracyValues.length ? Math.round(accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length) : 0,
    },
  };
}

function normalizeSubject(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'biology' || /биолог|генет|эволю|эколог|клетк|анатом/.test(text)) return 'biology';
  if (text === 'chemistry' || /хими|органик|неорганик|реакц|кислот|щелоч|оксид/.test(text)) return 'chemistry';
  return null;
}

function fallbackPlan(prompt) {
  const text = String(prompt || '');
  const subject = normalizeSubject(text);
  const lineMatch = text.match(/(?:лини(?:я|и|ю|е)|задани(?:е|я)\s*(?:№|номер)?|номер\s+задания)\s*(?:№|номер)?\s*(\d{1,2})/i)
    || text.match(/(\d{1,2})\s*(?:-?я\s+)?лини/i);
  const countMatch = text.match(/(\d{1,2})\s*(?:штук|вопрос(?:ов|а)?|задани(?:й|я))/i);
  const examLine = lineMatch ? Number(lineMatch[1]) : null;
  let count = countMatch ? Number(countMatch[1]) : 10;
  if (count === examLine && /задани(?:е|я)\s*(?:№|номер)?\s*\d/i.test(text)) count = 10;
  return { subject, examLine, count: Math.min(50, Math.max(1, count || 10)), dueDate: null, title: '' };
}

function extractJson(text) {
  const clean = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function aiPlan(prompt) {
  if (!process.env.GEMINI_API_KEY) return { ...fallbackPlan(prompt), interpretedByAi: false };
  const models = [...new Set([process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL, 'gemini-2.5-flash-lite'].filter(Boolean))];
  const currentDate = new Date().toISOString().slice(0, 10);
  const instruction = `Ты разбираешь короткую команду учителя для платформы подготовки к ЕГЭ. Верни ТОЛЬКО JSON без markdown.
Формат: {"subject":"biology|chemistry|null","examLine":число|null,"count":число,"dueDate":"YYYY-MM-DD|null","title":"короткое название"}.
Определи предмет по смыслу: генетика/эволюция/клетка — biology; органика/неорганика/реакции — chemistry. examLine — номер линии/задания ЕГЭ, которую просит учитель. count — сколько заданий нужно, от 1 до 50. Если количество не названо, 10. Если срок не назван, dueDate=null. Сегодня ${currentDate}.
Команда учителя: ${String(prompt).slice(0, 1000)}`;

  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: instruction }] }], generationConfig: { maxOutputTokens: 350, temperature: 0.1 } }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const data = await response.json();
      const text = (data?.candidates || []).flatMap(x => x?.content?.parts || []).map(x => x?.text || '').join('\n');
      const parsed = extractJson(text);
      if (!parsed) continue;
      const fallback = fallbackPlan(prompt);
      const subject = normalizeSubject(parsed.subject) || fallback.subject;
      const examLine = Number(parsed.examLine) || fallback.examLine;
      const count = Math.min(50, Math.max(1, Number(parsed.count) || fallback.count || 10));
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.dueDate || '')) ? String(parsed.dueDate) : null;
      return { subject, examLine, count, dueDate, title: cleanText(parsed.title, 100), interpretedByAi: true };
    } catch {}
  }
  return { ...fallbackPlan(prompt), interpretedByAi: false };
}

async function selectQuestions(teacherId, subject, examLine, count) {
  if (!SUBJECTS.has(subject)) throw Object.assign(new Error('Уточните предмет: биология или химия'), { status: 400 });
  const line = Number(examLine);
  if (!Number.isInteger(line) || line < 1 || line > 40) throw Object.assign(new Error('Укажите номер линии ЕГЭ'), { status: 400 });
  const requested = Math.min(50, Math.max(1, Number(count) || 10));
  const pool = await rows(`SELECT q.id,q.prompt,q.difficulty,q.exam_line,t.title topic
    FROM questions q JOIN topics t ON t.id=q.topic_id JOIN subjects s ON s.id=t.subject_id
    WHERE s.slug=? AND q.active=1 AND q.exam_line=? ORDER BY RANDOM() LIMIT 300`, subject, line);
  if (!pool.length) throw Object.assign(new Error(`В базе пока нет заданий для линии ${line} по выбранному предмету`), { status: 404 });

  const previous = await rows('SELECT question_ids_json FROM teacher_assignments WHERE teacher_id=? AND subject_slug=? AND exam_line=? ORDER BY id DESC LIMIT 20', teacherId, subject, line);
  const used = new Set();
  for (const item of previous) {
    try { for (const id of JSON.parse(item.question_ids_json || '[]')) used.add(Number(id)); } catch {}
  }
  const fresh = pool.filter(item => !used.has(Number(item.id)));
  const repeated = pool.filter(item => used.has(Number(item.id)));
  const selected = [...fresh, ...repeated].slice(0, Math.min(requested, pool.length));
  return { selected, available: pool.length, requested };
}

function defaultTitle(plan) {
  const subject = plan.subject === 'chemistry' ? 'Химия' : 'Биология';
  return `${subject} · линия ${plan.examLine} · ${plan.count} заданий`;
}

async function previewAssignment(teacherId, prompt) {
  const plan = await aiPlan(prompt);
  if (!plan.subject) throw Object.assign(new Error('Не понял предмет. Напишите, например: «по биологии, линия 4, 10 заданий»'), { status: 400 });
  if (!plan.examLine) throw Object.assign(new Error('Не понял номер линии. Укажите его прямо в сообщении'), { status: 400 });
  const picked = await selectQuestions(teacherId, plan.subject, plan.examLine, plan.count);
  const count = picked.selected.length;
  const normalized = {
    subject: plan.subject,
    examLine: Number(plan.examLine),
    count,
    requestedCount: picked.requested,
    dueDate: plan.dueDate,
    title: plan.title || defaultTitle({ ...plan, count }),
    interpretedByAi: Boolean(plan.interpretedByAi),
    questionIds: picked.selected.map(x => Number(x.id)),
  };
  return {
    plan: normalized,
    available: picked.available,
    samples: picked.selected.slice(0, 3).map(x => ({ id: Number(x.id), prompt: x.prompt, difficulty: Number(x.difficulty || 1), topic: x.topic })),
  };
}

async function publishAssignment(teacher, payload) {
  const classId = idOf(payload.classId);
  const klass = classId ? await teacherClass(teacher.id, classId) : null;
  if (!klass) throw Object.assign(new Error('Класс не найден'), { status: 404 });
  const sourcePlan = payload.plan || {};
  const subject = normalizeSubject(sourcePlan.subject);
  const examLine = Number(sourcePlan.examLine);
  const count = Math.min(50, Math.max(1, Number(sourcePlan.count) || 10));
  const picked = await selectQuestions(teacher.id, subject, examLine, count);
  const questionIds = picked.selected.map(x => Number(x.id));
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(sourcePlan.dueDate || '')) ? String(sourcePlan.dueDate) : null;
  const dueAt = dueDate ? `${dueDate} 23:59:59` : null;
  const title = cleanText(sourcePlan.title, 120) || defaultTitle({ subject, examLine, count: questionIds.length });
  const instructionText = cleanText(payload.prompt, 1000);
  const assignmentId = await insertWithId(
    'INSERT INTO teacher_assignments(teacher_id,class_id,title,subject_slug,exam_line,question_count,instruction_text,question_ids_json,due_at) VALUES(?,?,?,?,?,?,?,?,?)',
    teacher.id, classId, title, subject, examLine, questionIds.length, instructionText, JSON.stringify(questionIds), dueAt,
  );
  await run(`INSERT INTO teacher_assignment_students(assignment_id,user_id)
    SELECT ?,user_id FROM teacher_class_students WHERE class_id=? ON CONFLICT(assignment_id,user_id) DO NOTHING`, assignmentId, classId);
  return row('SELECT id,class_id,title,subject_slug,exam_line,question_count,instruction_text,due_at,created_at FROM teacher_assignments WHERE id=?', assignmentId);
}

async function studentPayload(userId) {
  const memberships = await rows(`SELECT c.id,c.name,c.join_code,u.name teacher_name,cs.joined_at
    FROM teacher_class_students cs JOIN teacher_classes c ON c.id=cs.class_id JOIN users u ON u.id=c.teacher_id
    WHERE cs.user_id=? ORDER BY cs.joined_at DESC`, userId);
  const assignments = await rows(`SELECT a.id,a.title,a.subject_slug,a.exam_line,a.question_count,a.due_at,a.created_at,c.name class_name,u.name teacher_name,
      tas.training_session_id,ts.status training_status,ts.answered_count,ts.correct_count
    FROM teacher_class_students cs
    JOIN teacher_assignments a ON a.class_id=cs.class_id
    JOIN teacher_classes c ON c.id=a.class_id
    JOIN users u ON u.id=a.teacher_id
    LEFT JOIN teacher_assignment_students tas ON tas.assignment_id=a.id AND tas.user_id=cs.user_id
    LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    WHERE cs.user_id=? ORDER BY a.created_at DESC,a.id DESC`, userId);
  return {
    memberships: memberships.map(x => ({ ...x, id: Number(x.id) })),
    assignments: assignments.map(x => ({
      ...x,
      id: Number(x.id),
      exam_line: Number(x.exam_line),
      question_count: Number(x.question_count),
      training_session_id: x.training_session_id ? Number(x.training_session_id) : null,
      answered_count: Number(x.answered_count || 0),
      correct_count: Number(x.correct_count || 0),
      status: x.training_status === 'completed' ? 'completed' : x.training_status === 'active' ? 'active' : 'assigned',
    })),
  };
}

async function joinClass(user, codeValue) {
  const code = cleanText(codeValue, 16).toUpperCase().replace(/\s+/g, '');
  if (!code) throw Object.assign(new Error('Введите код класса'), { status: 400 });
  const klass = await row('SELECT id,name,teacher_id FROM teacher_classes WHERE join_code=?', code);
  if (!klass) throw Object.assign(new Error('Класс с таким кодом не найден'), { status: 404 });
  if (Number(klass.teacher_id) === Number(user.id)) throw Object.assign(new Error('Учителю не нужно вступать в свой класс'), { status: 400 });
  await run('INSERT INTO teacher_class_students(class_id,user_id) VALUES(?,?) ON CONFLICT(class_id,user_id) DO NOTHING', klass.id, user.id);
  await run(`INSERT INTO teacher_assignment_students(assignment_id,user_id)
    SELECT id,? FROM teacher_assignments WHERE class_id=? ON CONFLICT(assignment_id,user_id) DO NOTHING`, user.id, klass.id);
  return { id: Number(klass.id), name: klass.name };
}

async function startAssignment(user, assignmentId) {
  const assignment = await row(`SELECT a.* FROM teacher_assignments a
    JOIN teacher_class_students cs ON cs.class_id=a.class_id AND cs.user_id=?
    WHERE a.id=?`, user.id, assignmentId);
  if (!assignment) throw Object.assign(new Error('Задание не найдено или не назначено вам'), { status: 404 });

  let link = await row('SELECT training_session_id FROM teacher_assignment_students WHERE assignment_id=? AND user_id=?', assignmentId, user.id);
  if (!link) {
    await run('INSERT INTO teacher_assignment_students(assignment_id,user_id) VALUES(?,?) ON CONFLICT(assignment_id,user_id) DO NOTHING', assignmentId, user.id);
    link = { training_session_id: null };
  }
  if (link.training_session_id) {
    const existing = await row('SELECT id,status FROM training_sessions WHERE id=? AND user_id=?', link.training_session_id, user.id);
    if (existing?.status === 'active') return { sessionId: Number(existing.id), resumed: true };
    if (existing?.status === 'completed') return { sessionId: Number(existing.id), completed: true };
  }

  let questionIds = [];
  try { questionIds = JSON.parse(assignment.question_ids_json || '[]').map(Number).filter(Number.isFinite); } catch {}
  if (!questionIds.length) throw Object.assign(new Error('В задании нет вопросов'), { status: 409 });
  const created = await insertWithId('INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,?,?,?)', user.id, null, 'adaptive', Math.min(100, questionIds.length));
  for (const [position, questionId] of questionIds.slice(0, 100).entries()) {
    await run('INSERT INTO training_session_questions(session_id,question_id,position) VALUES(?,?,?)', created, questionId, position);
  }
  await run('UPDATE teacher_assignment_students SET training_session_id=?,started_at=CURRENT_TIMESTAMP WHERE assignment_id=? AND user_id=?', created, assignmentId, user.id);
  return { sessionId: created, resumed: false };
}

async function handle(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/teacher')) return false;

  if (path === '/api/teacher/status' && req.method === 'GET') {
    const user = await requireUser(req, res); if (!user) return true;
    json(res, 200, { teacher: Boolean(await teacherRecord(user.id)), admin: user.role === 'admin' });
    return true;
  }

  if (path === '/api/teacher-admin/list' && req.method === 'GET') {
    const user = await requireUser(req, res); if (!user) return true;
    if (user.role !== 'admin') { json(res, 403, { error: 'Недостаточно прав' }); return true; }
    json(res, 200, { userIds: (await rows('SELECT user_id FROM teacher_users ORDER BY created_at')).map(x => Number(x.user_id)) });
    return true;
  }

  let match = path.match(/^\/api\/teacher-admin\/users\/(\d+)$/);
  if (match && req.method === 'PATCH') {
    const user = await requireUser(req, res); if (!user) return true;
    if (user.role !== 'admin') { json(res, 403, { error: 'Недостаточно прав' }); return true; }
    const targetId = idOf(match[1]), payload = await readJson(req);
    if (!targetId || !(await row('SELECT id FROM users WHERE id=?', targetId))) { json(res, 404, { error: 'Пользователь не найден' }); return true; }
    if (bool(payload.enabled)) {
      await run('DELETE FROM moderator_users WHERE user_id=?', targetId).catch(() => {});
      await run('INSERT INTO teacher_users(user_id,assigned_by) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET assigned_by=excluded.assigned_by', targetId, user.id);
    } else await run('DELETE FROM teacher_users WHERE user_id=?', targetId);
    json(res, 200, { ok: true, enabled: bool(payload.enabled) });
    return true;
  }

  if (path === '/api/teacher/dashboard' && req.method === 'GET') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    json(res, 200, await teacherDashboard(teacher.id)); return true;
  }

  if (path === '/api/teacher/classes' && req.method === 'GET') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    json(res, 200, { classes: await classesForTeacher(teacher.id) }); return true;
  }

  if (path === '/api/teacher/classes' && req.method === 'POST') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    const payload = await readJson(req), name = cleanText(payload.name, 80);
    if (name.length < 2) { json(res, 400, { error: 'Введите название класса' }); return true; }
    const code = await uniqueJoinCode();
    const id = await insertWithId('INSERT INTO teacher_classes(teacher_id,name,join_code) VALUES(?,?,?)', teacher.id, name, code);
    json(res, 201, { class: { id, name, join_code: code, student_count: 0 } }); return true;
  }

  if (path === '/api/teacher/assignments/preview' && req.method === 'POST') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    const payload = await readJson(req), prompt = cleanText(payload.prompt, 1000), classId = idOf(payload.classId);
    if (!classId || !(await teacherClass(teacher.id, classId))) { json(res, 404, { error: 'Сначала выберите класс' }); return true; }
    if (prompt.length < 3) { json(res, 400, { error: 'Опишите, какое задание нужно выдать' }); return true; }
    json(res, 200, await previewAssignment(teacher.id, prompt)); return true;
  }

  if (path === '/api/teacher/assignments' && req.method === 'POST') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    const payload = await readJson(req);
    json(res, 201, { assignment: await publishAssignment(teacher, payload) }); return true;
  }

  if (path === '/api/teacher/student' && req.method === 'GET') {
    const user = await requireUser(req, res); if (!user) return true;
    json(res, 200, await studentPayload(user.id)); return true;
  }

  if (path === '/api/teacher/join' && req.method === 'POST') {
    const user = await requireUser(req, res); if (!user) return true;
    const payload = await readJson(req);
    json(res, 200, { class: await joinClass(user, payload.code) }); return true;
  }

  match = path.match(/^\/api\/teacher\/assignments\/(\d+)\/start$/);
  if (match && req.method === 'POST') {
    const user = await requireUser(req, res); if (!user) return true;
    json(res, 200, await startAssignment(user, idOf(match[1]))); return true;
  }

  json(res, 404, { error: 'Раздел учителя не найден' });
  return true;
}

module.exports = { ensureSchema, handle, teacherDashboard, previewAssignment };
