const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const database = require('./src/db');

const { rows, row, run, transaction, migrate } = database;
const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.INTERNAL_APP_PORT || (PORT + 1));
const MAX_BODY = 2 * 1024 * 1024;
const OWNER_CLAIM_PATH = '/api/owner-claim/r14Rkgvw--GM39H0rZEnYidMVrCJ6ZIfsCxIvTlLIII';

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

async function adminUser(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row("SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP", token);
}
async function requireAdmin(req, res) {
  const user = await adminUser(req);
  if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return null; }
  if (user.role !== 'admin') { json(res, 403, { error: 'Недостаточно прав' }); return null; }
  return user;
}

const defaultSettings = {
  siteName: 'ОСНОВА',
  siteSuffix: 'ЕГЭ',
  pageTitle: 'Основа — подготовка к ЕГЭ',
  authTitle: 'Знания, которые остаются с тобой.',
  authSubtitle: 'Персональная подготовка к биологии и химии без хаоса: понятная теория, умные повторения и честная картина прогресса.',
  backgroundUrl: 'https://images.unsplash.com/photo-1704494941230-ddd0175eb3fd?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=82&w=2400',
  overlayOpacity: 0.78,
  accent: '#8fd0ae'
};

async function ensureAdminSchema() {
  await run(`CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const [key, value] of Object.entries(defaultSettings)) {
    await run('INSERT INTO site_settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO NOTHING', key, JSON.stringify(value));
  }
}
async function getSettings() {
  const found = await rows('SELECT key,value_json FROM site_settings ORDER BY key');
  const out = { ...defaultSettings };
  for (const item of found) {
    try { out[item.key] = JSON.parse(item.value_json); }
    catch { out[item.key] = item.value_json; }
  }
  return out;
}
async function saveSettings(values) {
  const allowed = new Set(Object.keys(defaultSettings));
  for (const [key, value] of Object.entries(values || {})) {
    if (!allowed.has(key)) continue;
    let normalized = value;
    if (key === 'overlayOpacity') normalized = Math.min(0.94, Math.max(0.35, number(value, 0.78)));
    if (key === 'accent' && !/^#[0-9a-f]{6}$/i.test(String(value))) continue;
    await run('INSERT INTO site_settings(key,value_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=CURRENT_TIMESTAMP', key, JSON.stringify(normalized));
  }
  return getSettings();
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

async function handleAdmin(req, res, path) {
  if (path === '/api/site-settings' && req.method === 'GET') { json(res, 200, { settings: await getSettings() }); return true; }

  if (path === OWNER_CLAIM_PATH && req.method === 'GET') {
    const user = await adminUser(req);
    if (!user) { json(res, 401, { error: 'Сначала войдите в свой аккаунт на сайте' }); return true; }
    const claimed = await row("SELECT value_json FROM site_settings WHERE key='owner_claim_used'");
    if (claimed?.value_json === 'true' || claimed?.value_json === '1') {
      json(res, 410, { error: 'Ссылка владельца уже использована' }); return true;
    }
    await transaction(async tx => {
      await tx.run("UPDATE users SET role='student' WHERE email='admin@ege.local'");
      await tx.run("UPDATE users SET role='admin' WHERE id=?", user.id);
      await tx.run("INSERT INTO site_settings(key,value_json,updated_at) VALUES('owner_claim_used','true',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value_json='true',updated_at=CURRENT_TIMESTAMP");
    });
    res.writeHead(302, { location: '/#admin', 'cache-control': 'no-store' });
    res.end();
    return true;
  }

  if (!path.startsWith('/api/admin-console/')) return false;
  const admin = await requireAdmin(req, res);
  if (!admin) return true;

  if (path === '/api/admin-console/overview' && req.method === 'GET') {
    const [counts, users] = await Promise.all([
      row(`SELECT
        (SELECT COUNT(*) FROM users WHERE role='student') students,
        (SELECT COUNT(*) FROM subjects) subjects,
        (SELECT COUNT(*) FROM sections) sections,
        (SELECT COUNT(*) FROM topics) topics,
        (SELECT COUNT(*) FROM lessons) lessons,
        (SELECT COUNT(*) FROM questions) questions,
        (SELECT COUNT(*) FROM attempts) attempts`),
      rows(`SELECT u.id,u.name,u.email,u.role,u.xp,COUNT(a.id) solved,COALESCE(ROUND(AVG(a.correct)*100),0) accuracy
        FROM users u LEFT JOIN attempts a ON a.user_id=u.id GROUP BY u.id ORDER BY u.role DESC,u.id`)
    ]);
    json(res, 200, { counts, users, settings: await getSettings() }); return true;
  }
  if (path === '/api/admin-console/content' && req.method === 'GET') { json(res, 200, await contentSnapshot()); return true; }
  if (path === '/api/admin-console/settings' && req.method === 'PATCH') { json(res, 200, { settings: await saveSettings(await readJson(req)) }); return true; }

  let match = path.match(/^\/api\/admin-console\/(subjects|sections|topics|lessons)\/(\d+)$/);
  if (match && req.method === 'PATCH') {
    const kind = match[1], id = idOf(match[2]);
    const b = await readJson(req);
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
    await run('DELETE FROM lesson_blocks WHERE id=?', idOf(match[1]));
    json(res, 200, { ok: true }); return true;
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

  match = path.match(/^\/api\/admin-console\/users\/(\d+)$/);
  if (match && req.method === 'PATCH') {
    const id = idOf(match[1]), b = await readJson(req);
    if (!id) { json(res, 400, { error: 'Некорректный ID' }); return true; }
    if (id === admin.id && b.role && b.role !== 'admin') { json(res, 400, { error: 'Нельзя снять права администратора у текущего аккаунта' }); return true; }
    const role = b.role === 'admin' ? 'admin' : 'student';
    await run('UPDATE users SET name=?,xp=?,role=? WHERE id=?', text(b.name), Math.max(0, number(b.xp)), role, id);
    json(res, 200, { ok: true }); return true;
  }

  json(res, 404, { error: 'Маршрут админ-панели не найден' }); return true;
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` };
  const upstream = http.request({ hostname: '127.0.0.1', port: UPSTREAM_PORT, path: req.url, method: req.method, headers }, response => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', error => {
    if (!res.headersSent) json(res, 503, { error: 'Основной сервер запускается', detail: error.code || 'UPSTREAM_ERROR' });
    else res.end();
  });
  req.pipe(upstream);
}

function waitForUpstream(attempts = 60) {
  return new Promise((resolve, reject) => {
    const tryConnect = left => {
      const socket = net.createConnection({ host: '127.0.0.1', port: UPSTREAM_PORT });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (left <= 0) return reject(new Error('Upstream server did not start'));
        setTimeout(() => tryConnect(left - 1), 100);
      });
    };
    tryConnect(attempts);
  });
}

async function start() {
  await migrate();
  await ensureAdminSchema();
  const child = spawn(process.execPath, [join(__dirname, 'server.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(UPSTREAM_PORT) },
    stdio: 'inherit'
  });
  child.on('exit', code => { if (code && code !== 0) console.error(`Основной сервер завершился с кодом ${code}`); });
  await waitForUpstream();
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      const handled = await handleAdmin(req, res, path);
      if (handled === false) proxy(req, res);
    } catch (error) {
      console.error('admin-proxy', error);
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Ошибка админ-панели' });
    }
  });
  server.listen(PORT, () => console.log(`EGE platform + admin proxy: http://localhost:${PORT}`));
  const stop = () => { child.kill('SIGTERM'); server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

start().catch(error => { console.error(error); process.exit(1); });