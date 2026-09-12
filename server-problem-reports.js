'use strict';

const database = require('./src/db');
const { row, rows, run } = database;

const MAX_BODY = 24 * 1024;
const CATEGORIES = new Set(['question','theory','image','technical','other']);
const STATUSES = new Set(['new','in_progress','resolved','dismissed']);

const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
};

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > MAX_BODY) {
      throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
    }
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row(
    'SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

async function isStaff(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const record = await row('SELECT user_id FROM moderator_users WHERE user_id=?', user.id);
  return Boolean(record);
}

async function ensureSchema() {
  if (database.dialect === 'postgresql') {
    await run(`CREATE TABLE IF NOT EXISTS problem_reports (
      id BIGSERIAL PRIMARY KEY,
      reporter_user_id BIGINT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      route TEXT NOT NULL DEFAULT '',
      context_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new',
      moderator_note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMPTZ
    )`);
  } else {
    await run(`CREATE TABLE IF NOT EXISTS problem_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      route TEXT NOT NULL DEFAULT '',
      context_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new',
      moderator_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    )`);
  }
  await run('CREATE INDEX IF NOT EXISTS idx_problem_reports_status_created ON problem_reports(status,created_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_problem_reports_reporter ON problem_reports(reporter_user_id,status)');
}

function cleanContext(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const result = {};
  for (const key of ['pageTitle','heading','questionText','questionId','lessonId','topicId']) {
    const value = source[key];
    if (value == null) continue;
    if (['questionId','lessonId','topicId'].includes(key)) {
      const id = Number(value);
      if (Number.isSafeInteger(id) && id > 0) result[key] = id;
    } else {
      const text = String(value).trim();
      if (text) result[key] = text.slice(0, key === 'questionText' ? 900 : 180);
    }
  }
  return result;
}

function parseReport(record) {
  let context = {};
  try { context = JSON.parse(record.context_json || '{}'); } catch {}
  return {
    id: Number(record.id),
    category: record.category,
    message: record.message,
    route: record.route,
    context,
    status: record.status,
    moderatorNote: record.moderator_note || '',
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    resolvedAt: record.resolved_at || null,
  };
}

async function createReport(req, res, user) {
  const payload = await readJson(req);
  const category = CATEGORIES.has(String(payload.category)) ? String(payload.category) : 'other';
  const message = String(payload.message || '').trim().slice(0, 2000);
  const route = String(payload.route || '').trim().slice(0, 280);
  const context = cleanContext(payload.context);

  if (message.length < 3) {
    json(res, 400, { error: 'Опиши проблему чуть подробнее' });
    return true;
  }

  const open = await row(
    "SELECT COUNT(*) n FROM problem_reports WHERE reporter_user_id=? AND status IN ('new','in_progress')",
    user.id,
  );
  if (Number(open?.n || 0) >= 8) {
    json(res, 429, { error: 'У тебя уже есть несколько открытых сообщений. Дождись их проверки.' });
    return true;
  }

  const duplicate = await row(
    "SELECT id FROM problem_reports WHERE reporter_user_id=? AND route=? AND message=? AND status IN ('new','in_progress') ORDER BY id DESC LIMIT 1",
    user.id,
    route,
    message,
  );
  if (duplicate) {
    json(res, 200, { ok: true, id: Number(duplicate.id), duplicate: true });
    return true;
  }

  let result;
  if (database.dialect === 'postgresql') {
    result = await run(
      "INSERT INTO problem_reports(reporter_user_id,category,message,route,context_json,status) VALUES(?,?,?,?,?,'new') RETURNING id",
      user.id,
      category,
      message,
      route,
      JSON.stringify(context),
    );
  } else {
    result = await run(
      "INSERT INTO problem_reports(reporter_user_id,category,message,route,context_json,status) VALUES(?,?,?,?,?,'new')",
      user.id,
      category,
      message,
      route,
      JSON.stringify(context),
    );
  }

  json(res, 201, { ok: true, id: Number(result.lastInsertRowid) });
  return true;
}

async function listReports(res, url) {
  const requested = String(url.searchParams.get('status') || '').trim();
  const params = [];
  let where = '';
  if (STATUSES.has(requested)) {
    where = 'WHERE status=?';
    params.push(requested);
  }
  const list = await rows(
    `SELECT id,category,message,route,context_json,status,moderator_note,created_at,updated_at,resolved_at
     FROM problem_reports
     ${where}
     ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
              created_at DESC
     LIMIT 150`,
    ...params,
  );
  json(res, 200, { reports: list.map(parseReport) });
  return true;
}

async function updateReport(req, res, id) {
  const payload = await readJson(req);
  const current = await row('SELECT id,status,moderator_note FROM problem_reports WHERE id=?', id);
  if (!current) {
    json(res, 404, { error: 'Сообщение не найдено' });
    return true;
  }
  const status = STATUSES.has(String(payload.status)) ? String(payload.status) : String(current.status);
  const note = payload.note == null ? String(current.moderator_note || '') : String(payload.note).trim().slice(0, 2000);
  if (status === 'resolved' || status === 'dismissed') {
    await run(
      'UPDATE problem_reports SET status=?,moderator_note=?,updated_at=CURRENT_TIMESTAMP,resolved_at=CURRENT_TIMESTAMP WHERE id=?',
      status,
      note,
      id,
    );
  } else {
    await run(
      'UPDATE problem_reports SET status=?,moderator_note=?,updated_at=CURRENT_TIMESTAMP,resolved_at=NULL WHERE id=?',
      status,
      note,
      id,
    );
  }
  const updated = await row(
    'SELECT id,category,message,route,context_json,status,moderator_note,created_at,updated_at,resolved_at FROM problem_reports WHERE id=?',
    id,
  );
  json(res, 200, { ok: true, report: parseReport(updated) });
  return true;
}

async function handle(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/problem-reports')) return false;

  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return true;
  }

  if (path === '/api/problem-reports' && req.method === 'POST') {
    return createReport(req, res, user);
  }

  if (!(await isStaff(user))) {
    json(res, 403, { error: 'Журнал проблем доступен только модератору' });
    return true;
  }

  if (path === '/api/problem-reports' && req.method === 'GET') {
    return listReports(res, url);
  }

  const match = path.match(/^\/api\/problem-reports\/(\d+)$/);
  if (match && req.method === 'PATCH') {
    return updateReport(req, res, Number(match[1]));
  }

  json(res, 405, { error: 'Недоступное действие' });
  return true;
}

module.exports = { ensureSchema, handle };
