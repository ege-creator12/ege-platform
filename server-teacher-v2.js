'use strict';

const database = require('./src/db');
const { rows, row, run } = database;

const MAX_BODY = 96 * 1024;
const SUBJECTS = new Set(['biology', 'chemistry']);

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

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row('SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP', token);
}

async function requireTeacher(req, res) {
  const user = await userFor(req);
  if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return null; }
  const teacher = await row('SELECT user_id FROM teacher_users WHERE user_id=?', user.id);
  if (!teacher && user.role !== 'admin') { json(res, 403, { error: 'Кабинет доступен только учителю' }); return null; }
  return user;
}

async function teacherClass(teacherId, classId) {
  return row('SELECT id,teacher_id,name,join_code FROM teacher_classes WHERE id=? AND teacher_id=?', classId, teacherId);
}

async function insertWithId(sql, ...params) {
  if (database.dialect === 'postgresql') {
    const created = await row(`${sql} RETURNING id`, ...params);
    return Number(created.id);
  }
  const created = await run(sql, ...params);
  return Number(created.lastInsertRowid);
}

async function staffRecord(userId) {
  const user = await row('SELECT id,role FROM users WHERE id=?', userId);
  if (!user) return { exists: false, staff: false };
  if (user.role === 'admin') return { exists: true, staff: true };
  try {
    if (await row('SELECT user_id FROM teacher_users WHERE user_id=?', userId)) return { exists: true, staff: true };
  } catch {}
  try {
    if (await row('SELECT user_id FROM moderator_users WHERE user_id=?', userId)) return { exists: true, staff: true };
  } catch {}
  return { exists: true, staff: false };
}

async function classStudents(teacherId, classId) {
  const klass = await teacherClass(teacherId, classId);
  if (!klass) throw Object.assign(new Error('Класс не найден'), { status: 404 });
  const students = await rows(`SELECT u.id,u.name,u.email,u.xp,cs.joined_at,
      (SELECT COUNT(*) FROM attempts a WHERE a.user_id=u.id) solved,
      COALESCE((SELECT ROUND(AVG(a.correct)*100) FROM attempts a WHERE a.user_id=u.id),0) accuracy
    FROM teacher_class_students cs JOIN users u ON u.id=cs.user_id
    WHERE cs.class_id=? ORDER BY u.name,u.id`, classId);
  return { klass, students: students.map(s => ({ ...s, id: Number(s.id), xp: Number(s.xp || 0), solved: Number(s.solved || 0), accuracy: Number(s.accuracy || 0) })) };
}

async function addStudent(teacher, classId, emailValue) {
  const klass = await teacherClass(teacher.id, classId);
  if (!klass) throw Object.assign(new Error('Класс не найден'), { status: 404 });
  const email = cleanText(emailValue, 180).toLowerCase();
  if (!email || !email.includes('@')) throw Object.assign(new Error('Введите почту ученика, зарегистрированного на сайте'), { status: 400 });
  const student = await row('SELECT id,name,email,role,xp FROM users WHERE LOWER(email)=LOWER(?)', email);
  if (!student) throw Object.assign(new Error('Пользователь с такой почтой не найден. Сначала ученик должен зарегистрироваться на сайте.'), { status: 404 });
  if (Number(student.id) === Number(teacher.id)) throw Object.assign(new Error('Нельзя добавить себя в свой класс'), { status: 400 });
  const staff = await staffRecord(student.id);
  if (staff.staff) throw Object.assign(new Error('В класс можно добавлять только учеников'), { status: 400 });

  await run('INSERT INTO teacher_class_students(class_id,user_id) VALUES(?,?) ON CONFLICT(class_id,user_id) DO NOTHING', classId, student.id);
  await run(`INSERT INTO teacher_assignment_students(assignment_id,user_id)
    SELECT id,? FROM teacher_assignments WHERE class_id=? ON CONFLICT(assignment_id,user_id) DO NOTHING`, student.id, classId);

  return { id: Number(student.id), name: student.name, email: student.email, xp: Number(student.xp || 0), classId: Number(classId), className: klass.name };
}

async function removeStudent(teacher, classId, studentId) {
  const klass = await teacherClass(teacher.id, classId);
  if (!klass) throw Object.assign(new Error('Класс не найден'), { status: 404 });
  const membership = await row('SELECT user_id FROM teacher_class_students WHERE class_id=? AND user_id=?', classId, studentId);
  if (!membership) throw Object.assign(new Error('Ученик не состоит в этом классе'), { status: 404 });
  await run(`DELETE FROM teacher_assignment_students WHERE user_id=? AND assignment_id IN (
    SELECT id FROM teacher_assignments WHERE class_id=?
  )`, studentId, classId);
  await run('DELETE FROM teacher_class_students WHERE class_id=? AND user_id=?', classId, studentId);
  return { ok: true };
}

async function resultsForTeacher(teacherId) {
  const data = await rows(`SELECT a.id assignment_id,a.title,a.subject_slug,a.exam_line,a.question_count,a.due_at,a.created_at,
      c.id class_id,c.name class_name,u.id user_id,u.name student_name,u.email student_email,
      tas.training_session_id,tas.started_at,ts.status training_status,ts.answered_count,ts.correct_count,ts.started_at session_started_at,ts.finished_at
    FROM teacher_assignments a
    JOIN teacher_classes c ON c.id=a.class_id
    JOIN teacher_assignment_students tas ON tas.assignment_id=a.id
    JOIN users u ON u.id=tas.user_id
    LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    WHERE a.teacher_id=?
    ORDER BY a.created_at DESC,a.id DESC,u.name,u.id`, teacherId);

  return data.map(item => {
    const answered = Number(item.answered_count || 0);
    const correct = Number(item.correct_count || 0);
    const status = item.training_status === 'completed' ? 'completed' : item.training_status === 'active' ? 'active' : 'assigned';
    return {
      ...item,
      assignment_id: Number(item.assignment_id),
      class_id: Number(item.class_id),
      user_id: Number(item.user_id),
      exam_line: Number(item.exam_line),
      question_count: Number(item.question_count),
      training_session_id: item.training_session_id ? Number(item.training_session_id) : null,
      answered_count: answered,
      correct_count: correct,
      accuracy: answered ? Math.round(correct / answered * 100) : 0,
      status,
    };
  });
}

async function validatedQuestionIds(plan) {
  const subject = String(plan.subject || '').toLowerCase();
  if (!SUBJECTS.has(subject)) throw Object.assign(new Error('Уточните предмет: биология или химия'), { status: 400 });
  const examLine = Number(plan.examLine);
  if (!Number.isInteger(examLine) || examLine < 1 || examLine > 40) throw Object.assign(new Error('Укажите корректную линию ЕГЭ'), { status: 400 });
  const count = Math.min(50, Math.max(1, Number(plan.count) || 10));
  const requestedIds = Array.isArray(plan.questionIds) ? plan.questionIds.map(idOf).filter(Boolean) : [];
  let selected = [];

  if (requestedIds.length) {
    const marks = requestedIds.map(() => '?').join(',');
    const valid = await rows(`SELECT q.id FROM questions q JOIN topics t ON t.id=q.topic_id JOIN subjects s ON s.id=t.subject_id
      WHERE q.id IN (${marks}) AND s.slug=? AND q.exam_line=? AND q.active=1`, ...requestedIds, subject, examLine);
    const validSet = new Set(valid.map(x => Number(x.id)));
    selected = requestedIds.filter(id => validSet.has(Number(id)));
  }

  if (selected.length < count) {
    const pool = await rows(`SELECT q.id FROM questions q JOIN topics t ON t.id=q.topic_id JOIN subjects s ON s.id=t.subject_id
      WHERE s.slug=? AND q.exam_line=? AND q.active=1 ORDER BY RANDOM() LIMIT 300`, subject, examLine);
    const seen = new Set(selected.map(Number));
    for (const item of pool) {
      const id = Number(item.id);
      if (!seen.has(id)) { selected.push(id); seen.add(id); }
      if (selected.length >= count) break;
    }
  }

  selected = selected.slice(0, count);
  if (!selected.length) throw Object.assign(new Error(`Для линии ${examLine} по выбранному предмету пока нет заданий`), { status: 404 });
  return { subject, examLine, count: selected.length, questionIds: selected };
}

async function publishAssignmentV2(teacher, payload) {
  const classId = idOf(payload.classId);
  const klass = classId ? await teacherClass(teacher.id, classId) : null;
  if (!klass) throw Object.assign(new Error('Класс не найден'), { status: 404 });
  const members = await rows('SELECT user_id FROM teacher_class_students WHERE class_id=? ORDER BY joined_at,user_id', classId);
  if (!members.length) throw Object.assign(new Error('В этом классе пока нет учеников. Сначала добавьте хотя бы одного ученика.'), { status: 400 });

  const plan = payload.plan || {};
  const validated = await validatedQuestionIds(plan);
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(plan.dueDate || '')) ? String(plan.dueDate) : null;
  const dueAt = dueDate ? `${dueDate} 23:59:59` : null;
  const subjectTitle = validated.subject === 'chemistry' ? 'Химия' : 'Биология';
  const title = cleanText(plan.title, 120) || `${subjectTitle} · линия ${validated.examLine} · ${validated.count} заданий`;
  const instruction = cleanText(payload.prompt, 1000);

  const assignmentId = await insertWithId(
    'INSERT INTO teacher_assignments(teacher_id,class_id,title,subject_slug,exam_line,question_count,instruction_text,question_ids_json,due_at) VALUES(?,?,?,?,?,?,?,?,?)',
    teacher.id, classId, title, validated.subject, validated.examLine, validated.count, instruction, JSON.stringify(validated.questionIds), dueAt,
  );

  await run(`INSERT INTO teacher_assignment_students(assignment_id,user_id)
    SELECT ?,user_id FROM teacher_class_students WHERE class_id=? ON CONFLICT(assignment_id,user_id) DO NOTHING`, assignmentId, classId);
  const assignment = await row('SELECT id,class_id,title,subject_slug,exam_line,question_count,instruction_text,due_at,created_at FROM teacher_assignments WHERE id=?', assignmentId);
  return { ...assignment, id: Number(assignment.id), class_id: Number(assignment.class_id), assignedStudents: members.length };
}

async function handle(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/teacher')) return false;

  if (path === '/api/teacher/results' && req.method === 'GET') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    json(res, 200, { results: await resultsForTeacher(teacher.id) });
    return true;
  }

  let match = path.match(/^\/api\/teacher\/classes\/(\d+)\/students$/);
  if (match && req.method === 'GET') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    const data = await classStudents(teacher.id, idOf(match[1]));
    json(res, 200, { class: { ...data.klass, id: Number(data.klass.id) }, students: data.students });
    return true;
  }
  if (match && req.method === 'POST') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    const payload = await readJson(req);
    json(res, 201, { student: await addStudent(teacher, idOf(match[1]), payload.email) });
    return true;
  }

  match = path.match(/^\/api\/teacher\/classes\/(\d+)\/students\/(\d+)$/);
  if (match && req.method === 'DELETE') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    json(res, 200, await removeStudent(teacher, idOf(match[1]), idOf(match[2])));
    return true;
  }

  if (path === '/api/teacher/assignments-v2' && req.method === 'POST') {
    const teacher = await requireTeacher(req, res); if (!teacher) return true;
    const payload = await readJson(req);
    json(res, 201, { assignment: await publishAssignmentV2(teacher, payload) });
    return true;
  }

  return false;
}

module.exports = { handle, resultsForTeacher, publishAssignmentV2 };
