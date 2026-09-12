'use strict';

const database = require('./src/db');
const { rows, row, run, transaction } = database;
const MAX_BODY = 2 * 1024 * 1024;

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
const bool = value => value === true || value === 1 || value === '1' || value === 'true';
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value, fallback = '') => value == null ? fallback : String(value);

async function ensureSchema() {
  await run(`CREATE TABLE IF NOT EXISTS moderator_users (
    user_id BIGINT PRIMARY KEY,
    assigned_by BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row("SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP", token);
}

async function moderatorRecord(userId) {
  if (!userId) return null;
  return row('SELECT user_id,assigned_by,created_at FROM moderator_users WHERE user_id=?', userId);
}

async function contentSnapshot() {
  const [subjects, sections, topics, lessons] = await Promise.all([
    rows('SELECT id,slug,title,description,icon,exam_year,published,position,updated_at FROM subjects ORDER BY position,id'),
    rows('SELECT s.id,s.subject_id,s.slug,s.title,s.description,s.position,s.published,s.exam_year,s.updated_at,sub.title subject_title FROM sections s JOIN subjects sub ON sub.id=s.subject_id ORDER BY sub.position,s.position,s.id'),
    rows('SELECT t.id,t.subject_id,t.section_id,t.parent_id,t.slug,t.title,t.description,t.theory,t.position,t.published,t.exam_year,t.updated_at,s.title subject_title,sec.title section_title,p.title parent_title FROM topics t JOIN subjects s ON s.id=t.subject_id LEFT JOIN sections sec ON sec.id=t.section_id LEFT JOIN topics p ON p.id=t.parent_id ORDER BY s.position,COALESCE(sec.position,0),t.position,t.id'),
    rows('SELECT l.id,l.topic_id,l.slug,l.title,l.summary,l.estimated_minutes,l.difficulty,l.exam_year,l.published,l.position,l.updated_at,t.title topic_title FROM lessons l JOIN topics t ON t.id=l.topic_id ORDER BY t.position,l.position,l.id')
  ]);
  return { subjects, sections, topics, lessons };
}

async function questionDetail(id) {
  const question = await row('SELECT q.*,t.title topic_title FROM questions q JOIN topics t ON t.id=q.topic_id WHERE q.id=?', id);
  if (!question) return null;
  question.options = await rows('SELECT id,value,label,position FROM question_options WHERE question_id=? ORDER BY position,id', id);
  try { question.answer = JSON.parse(question.answer_json || '[]'); } catch { question.answer = []; }
  return question;
}

async function handleModeratorConsole(req, res, path, user) {
  if (path === '/api/admin-console/overview' && req.method === 'GET') {
    const counts = await row(`SELECT
      (SELECT COUNT(*) FROM users WHERE role='student') students,
      (SELECT COUNT(*) FROM subjects) subjects,
      (SELECT COUNT(*) FROM sections) sections,
      (SELECT COUNT(*) FROM topics) topics,
      (SELECT COUNT(*) FROM lessons) lessons,
      (SELECT COUNT(*) FROM questions) questions,
      (SELECT COUNT(*) FROM attempts) attempts`);
    json(res, 200, { counts, users: [], settings: {}, moderator: true }); return true;
  }

  if (path === '/api/admin-console/content' && req.method === 'GET') {
    json(res, 200, await contentSnapshot()); return true;
  }

  if (path === '/api/admin-console/settings' || path.startsWith('/api/admin-console/users/')) {
    json(res, 403, { error: 'У модератора нет доступа к пользователям и настройкам сайта' }); return true;
  }

  let match = path.match(/^\/api\/admin-console\/(subjects|sections|topics|lessons)\/(\d+)$/);
  if (match && req.method === 'PATCH') {
    const kind = match[1], id = idOf(match[2]), b = await readJson(req);
    if (!id) { json(res, 400, { error: 'Некорректный ID' }); return true; }
    if (kind === 'subjects') await run('UPDATE subjects SET title=?,description=?,icon=?,exam_year=?,published=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', text(b.title), text(b.description), text(b.icon, 'dna'), number(b.examYear, 2027), bool(b.published), number(b.position), id);
    if (kind === 'sections') await run('UPDATE sections SET title=?,description=?,exam_year=?,published=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', text(b.title), text(b.description), number(b.examYear, 2027), bool(b.published), number(b.position), id);
    if (kind === 'topics') await run('UPDATE topics SET title=?,description=?,theory=?,section_id=?,parent_id=?,exam_year=?,published=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', text(b.title), text(b.description), text(b.theory), idOf(b.sectionId), idOf(b.parentId), number(b.examYear, 2027), bool(b.published), number(b.position), id);
    if (kind === 'lessons') await run('UPDATE lessons SET title=?,summary=?,estimated_minutes=?,difficulty=?,exam_year=?,published=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', text(b.title), text(b.summary), Math.max(1, number(b.estimatedMinutes, 15)), text(b.difficulty, 'base'), number(b.examYear, 2027), bool(b.published), number(b.position), id);
    json(res, 200, { ok: true }); return true;
  }

  if (path === '/api/admin-console/topics' && req.method === 'POST') {
    const b = await readJson(req), subjectId = idOf(b.subjectId);
    if (!subjectId || !text(b.slug).trim() || !text(b.title).trim()) { json(res, 400, { error: 'Нужны предмет, slug и название' }); return true; }
    const result = await run('INSERT INTO topics(subject_id,section_id,parent_id,slug,title,description,theory,position,exam_year,published) VALUES(?,?,?,?,?,?,?,?,?,?)', subjectId, idOf(b.sectionId), idOf(b.parentId), text(b.slug).trim(), text(b.title).trim(), text(b.description), text(b.theory), number(b.position), number(b.examYear, 2027), bool(b.published));
    json(res, 201, { id: Number(result.lastInsertRowid) }); return true;
  }

  if (path === '/api/admin-console/sections' && req.method === 'POST') {
    const b = await readJson(req), subjectId = idOf(b.subjectId);
    if (!subjectId || !text(b.slug).trim() || !text(b.title).trim()) { json(res, 400, { error: 'Нужны предмет, slug и название' }); return true; }
    const result = await transaction(tx => tx.run('INSERT INTO sections(subject_id,slug,title,description,position,published,exam_year) VALUES(?,?,?,?,?,?,?)', subjectId, text(b.slug).trim(), text(b.title).trim(), text(b.description), number(b.position), bool(b.published), number(b.examYear, 2027)));
    json(res, 201, { id: Number(result.lastInsertRowid) }); return true;
  }

  if (path === '/api/admin-console/lessons' && req.method === 'POST') {
    const b = await readJson(req), topicId = idOf(b.topicId);
    if (!topicId || !text(b.slug).trim() || !text(b.title).trim()) { json(res, 400, { error: 'Нужны тема, slug и название' }); return true; }
    const result = await transaction(tx => tx.run('INSERT INTO lessons(topic_id,slug,title,summary,estimated_minutes,difficulty,exam_year,published,position) VALUES(?,?,?,?,?,?,?,?,?)', topicId, text(b.slug).trim(), text(b.title).trim(), text(b.summary), Math.max(1, number(b.estimatedMinutes, 15)), text(b.difficulty, 'base'), number(b.examYear, 2027), bool(b.published), number(b.position)));
    json(res, 201, { id: Number(result.lastInsertRowid) }); return true;
  }

  match = path.match(/^\/api\/admin-console\/lessons\/(\d+)\/blocks$/);
  if (match && req.method === 'GET') {
    const lessonId = idOf(match[1]);
    const lesson = await row('SELECT id,title FROM lessons WHERE id=?', lessonId);
    if (!lesson) { json(res, 404, { error: 'Урок не найден' }); return true; }
    json(res, 200, { lesson, blocks: await rows('SELECT id,lesson_id,type,content_json,position FROM lesson_blocks WHERE lesson_id=? ORDER BY position,id', lessonId) }); return true;
  }

  if (path === '/api/admin-console/blocks' && req.method === 'POST') {
    const b = await readJson(req), lessonId = idOf(b.lessonId);
    if (!lessonId || !text(b.type).trim()) { json(res, 400, { error: 'Нужны урок и тип блока' }); return true; }
    const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || { text: '' });
    try { JSON.parse(content); } catch { json(res, 400, { error: 'Содержимое блока должно быть корректным JSON' }); return true; }
    const result = await transaction(tx => tx.run('INSERT INTO lesson_blocks(lesson_id,type,content_json,position) VALUES(?,?,?,?)', lessonId, text(b.type), content, number(b.position)));
    json(res, 201, { id: Number(result.lastInsertRowid) }); return true;
  }

  match = path.match(/^\/api\/admin-console\/blocks\/(\d+)$/);
  if (match && req.method === 'PATCH') {
    const id = idOf(match[1]), b = await readJson(req);
    const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || {});
    try { JSON.parse(content); } catch { json(res, 400, { error: 'Некорректный JSON блока' }); return true; }
    await run('UPDATE lesson_blocks SET type=?,content_json=?,position=? WHERE id=?', text(b.type), content, number(b.position), id);
    json(res, 200, { ok: true }); return true;
  }
  if (match && req.method === 'DELETE') {
    json(res, 403, { error: 'Модератор не может удалять блоки уроков' }); return true;
  }

  match = path.match(/^\/api\/admin-console\/questions\/(\d+)$/);
  if (match && req.method === 'GET') {
    const q = await questionDetail(idOf(match[1]));
    if (q) json(res, 200, { question: q }); else json(res, 404, { error: 'Задание не найдено' });
    return true;
  }
  if (match && req.method === 'PATCH') {
    const id = idOf(match[1]), b = await readJson(req), topicId = idOf(b.topicId);
    if (!id || !topicId || !text(b.prompt).trim()) { json(res, 400, { error: 'Заполните тему и условие' }); return true; }
    const answers = Array.isArray(b.answer) ? b.answer.map(String) : [text(b.answer)].filter(Boolean);
    await transaction(async tx => {
      await tx.run('UPDATE questions SET topic_id=?,type=?,prompt=?,explanation=?,difficulty=?,answer_json=?,active=?,published=? WHERE id=?', topicId, text(b.type, 'single'), text(b.prompt), text(b.explanation), Math.min(3, Math.max(1, number(b.difficulty, 1))), JSON.stringify(answers), bool(b.active), bool(b.published), id);
      await tx.run('DELETE FROM question_options WHERE question_id=?', id);
      for (const [i, label] of (Array.isArray(b.options) ? b.options : []).entries()) await tx.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)', id, String(i), text(label), i);
    });
    json(res, 200, { ok: true, question: await questionDetail(id) }); return true;
  }

  json(res, 403, { error: 'Это действие недоступно модератору' });
  return true;
}

async function handleLegacyQuestionApi(req, res, path, user) {
  if (path === '/api/admin/questions' && req.method === 'GET') {
    json(res, 200, { questions: await rows('SELECT q.id,q.prompt,q.type,q.difficulty,q.active,t.title topic FROM questions q JOIN topics t ON t.id=q.topic_id ORDER BY q.id DESC') });
    return true;
  }
  if (path === '/api/admin/questions' && req.method === 'POST') {
    const b = await readJson(req), topicId = idOf(b.topicId);
    if (!b.prompt || !b.explanation || !Array.isArray(b.answer) || !topicId) { json(res, 400, { error: 'Заполните обязательные поля' }); return true; }
    const x = await run('INSERT INTO questions(topic_id,type,prompt,explanation,difficulty,answer_json) VALUES(?,?,?,?,?,?)', topicId, b.type || 'single', b.prompt, b.explanation, Math.min(3, Math.max(1, Number(b.difficulty) || 1)), JSON.stringify(b.answer));
    for (const [i, label] of (b.options || []).entries()) await run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)', Number(x.lastInsertRowid), String(i), label, i);
    json(res, 201, { id: Number(x.lastInsertRowid) }); return true;
  }
  if (path.match(/^\/api\/admin\/questions\/\d+$/) && req.method === 'DELETE') {
    json(res, 403, { error: 'Модератор не может удалять задания' }); return true;
  }
  return false;
}

async function handle(req, res, url) {
  const path = url.pathname;

  if (path === '/api/moderator/status' && req.method === 'GET') {
    const user = await userFor(req);
    if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return true; }
    const record = await moderatorRecord(user.id);
    json(res, 200, { moderator: Boolean(record), admin: user.role === 'admin' });
    return true;
  }

  if (path === '/api/moderator-admin/list' && req.method === 'GET') {
    const user = await userFor(req);
    if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return true; }
    if (user.role !== 'admin') { json(res, 403, { error: 'Недостаточно прав' }); return true; }
    json(res, 200, { userIds: (await rows('SELECT user_id FROM moderator_users ORDER BY created_at')).map(x => Number(x.user_id)) });
    return true;
  }

  let match = path.match(/^\/api\/moderator-admin\/users\/(\d+)$/);
  if (match && req.method === 'PATCH') {
    const user = await userFor(req);
    if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return true; }
    if (user.role !== 'admin') { json(res, 403, { error: 'Недостаточно прав' }); return true; }
    const targetId = idOf(match[1]), payload = await readJson(req);
    if (!targetId) { json(res, 400, { error: 'Некорректный пользователь' }); return true; }
    const target = await row('SELECT id,role FROM users WHERE id=?', targetId);
    if (!target) { json(res, 404, { error: 'Пользователь не найден' }); return true; }
    if (bool(payload.enabled)) {
      if (target.role === 'admin') { json(res, 400, { error: 'Администратору роль модератора не нужна' }); return true; }
      await run('INSERT INTO moderator_users(user_id,assigned_by,created_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET assigned_by=excluded.assigned_by,created_at=CURRENT_TIMESTAMP', targetId, user.id);
    } else {
      await run('DELETE FROM moderator_users WHERE user_id=?', targetId);
    }
    json(res, 200, { ok: true, moderator: bool(payload.enabled) });
    return true;
  }

  const isProtectedAdminPath = path.startsWith('/api/admin-console/') || path === '/api/admin/questions' || /^\/api\/admin\/questions\/\d+$/.test(path);
  if (!isProtectedAdminPath) return false;

  const user = await userFor(req);
  if (!user || user.role === 'admin') return false;
  const record = await moderatorRecord(user.id);
  if (!record) return false;

  if (path.startsWith('/api/admin-console/')) return handleModeratorConsole(req, res, path, user);
  return handleLegacyQuestionApi(req, res, path, user);
}

module.exports = { ensureSchema, handle };
