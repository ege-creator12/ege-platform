'use strict';

const database = require('./src/db');
const { row, rows, run } = database;

const MAX_BODY = 8 * 1024;
const MAX_MESSAGE = 900;
const MAX_PREFIX = 24;
const recentSends = new Map();
const ALLOWED_MUTES = new Set([10, 60, 1440, 10080, 0]);
const FOREVER_MS = Date.UTC(2999, 0, 1);

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
    if (data.length > MAX_BODY) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row(
    'SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

async function staffInfo(user) {
  if (!user) return { staff: false, admin: false, moderator: false };
  if (user.role === 'admin') return { staff: true, admin: true, moderator: false };
  const record = await row('SELECT user_id FROM moderator_users WHERE user_id=?', user.id);
  return { staff: Boolean(record), admin: false, moderator: Boolean(record) };
}

async function ensureSchema() {
  if (database.dialect === 'postgresql') {
    await run(`CREATE TABLE IF NOT EXISTS community_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS community_chat_mutes (
      user_id BIGINT PRIMARY KEY,
      muted_until_ms BIGINT NOT NULL,
      muted_by BIGINT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS community_chat_prefixes (
      user_id BIGINT PRIMARY KEY,
      prefix TEXT NOT NULL,
      assigned_by BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  } else {
    await run(`CREATE TABLE IF NOT EXISTS community_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS community_chat_mutes (
      user_id INTEGER PRIMARY KEY,
      muted_until_ms INTEGER NOT NULL,
      muted_by INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS community_chat_prefixes (
      user_id INTEGER PRIMARY KEY,
      prefix TEXT NOT NULL,
      assigned_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }
  await run('CREATE INDEX IF NOT EXISTS idx_community_chat_created ON community_chat_messages(created_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_community_chat_user ON community_chat_messages(user_id,created_at)');
}

async function activeMute(userId) {
  const mute = await row('SELECT muted_until_ms FROM community_chat_mutes WHERE user_id=?', userId);
  if (!mute) return null;
  const until = Number(mute.muted_until_ms || 0);
  if (until <= Date.now()) {
    await run('DELETE FROM community_chat_mutes WHERE user_id=?', userId);
    return null;
  }
  return until;
}

function spamLimited(userId) {
  const now = Date.now();
  const recent = (recentSends.get(Number(userId)) || []).filter(t => now - t < 20000);
  if (recent.length >= 6 || (recent.length && now - recent[recent.length - 1] < 1200)) return true;
  recent.push(now);
  recentSends.set(Number(userId), recent);
  return false;
}

function canModerateTarget(actor, actorStaff, target) {
  if (!actorStaff.staff || !target) return false;
  if (Number(actor.id) === Number(target.user_id)) return false;
  if (target.role === 'admin') return false;
  if (!actorStaff.admin && Number(target.is_moderator || 0) === 1) return false;
  return true;
}

function canManageMessage(actor, actorStaff, target) {
  if (!actorStaff.staff || !target) return false;
  if (actorStaff.admin) return true;
  if (target.role === 'admin') return false;
  if (Number(target.is_moderator || 0) === 1) return false;
  return true;
}

async function listMessages(res, user) {
  const info = await staffInfo(user);
  const mutedUntil = await activeMute(user.id);
  const list = await rows(`SELECT m.id,m.user_id,m.body,m.created_at,u.name,u.role,
      CASE WHEN mu.user_id IS NULL THEN 0 ELSE 1 END is_moderator,
      COALESCE(cp.prefix,'') chat_prefix
    FROM community_chat_messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN moderator_users mu ON mu.user_id=u.id
    LEFT JOIN community_chat_prefixes cp ON cp.user_id=u.id
    ORDER BY m.id DESC
    LIMIT 120`);

  list.reverse();
  const messages = list.map(item => {
    const prefix = String(item.chat_prefix || '').trim();
    const plainName = String(item.name || 'Ученик');
    return {
      id: Number(item.id),
      body: String(item.body || ''),
      createdAt: item.created_at,
      name: prefix ? `[${prefix}] ${plainName}` : plainName,
      prefix,
      mine: Number(item.user_id) === Number(user.id),
      badge: item.role === 'admin' ? 'Админ' : Number(item.is_moderator || 0) === 1 ? 'Модератор' : '',
      moderatable: canModerateTarget(user, info, item),
      staffManageable: canManageMessage(user, info, item),
    };
  });

  json(res, 200, {
    messages,
    me: {
      staff: info.staff,
      admin: info.admin,
      mutedUntil,
    },
  });
  return true;
}

async function sendMessage(req, res, user) {
  const mutedUntil = await activeMute(user.id);
  if (mutedUntil) {
    json(res, 403, { error: 'Вам временно запрещено писать в чат', mutedUntil });
    return true;
  }
  if (spamLimited(user.id)) {
    json(res, 429, { error: 'Слишком быстро. Подождите немного.' });
    return true;
  }
  const payload = await readJson(req);
  const body = String(payload.body || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_MESSAGE);
  if (!body) {
    json(res, 400, { error: 'Напишите сообщение' });
    return true;
  }
  if (body.length < 2) {
    json(res, 400, { error: 'Сообщение слишком короткое' });
    return true;
  }

  let result;
  if (database.dialect === 'postgresql') {
    result = await run('INSERT INTO community_chat_messages(user_id,body) VALUES(?,?) RETURNING id', user.id, body);
  } else {
    result = await run('INSERT INTO community_chat_messages(user_id,body) VALUES(?,?)', user.id, body);
  }
  json(res, 201, { ok: true, id: Number(result.lastInsertRowid || 0) });
  return true;
}

async function messageTarget(messageId) {
  return row(`SELECT m.user_id,u.role,CASE WHEN mu.user_id IS NULL THEN 0 ELSE 1 END is_moderator,
      COALESCE(cp.prefix,'') chat_prefix
    FROM community_chat_messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN moderator_users mu ON mu.user_id=u.id
    LEFT JOIN community_chat_prefixes cp ON cp.user_id=u.id
    WHERE m.id=?`, messageId);
}

async function muteFromMessage(req, res, user, messageId) {
  const actor = await staffInfo(user);
  if (!actor.staff) {
    json(res, 403, { error: 'Недостаточно прав' });
    return true;
  }
  const target = await messageTarget(messageId);
  if (!target) {
    json(res, 404, { error: 'Сообщение не найдено' });
    return true;
  }
  if (!canModerateTarget(user, actor, target)) {
    json(res, 403, { error: 'Этого пользователя нельзя замутить' });
    return true;
  }

  const payload = await readJson(req);
  const minutes = Number(payload.minutes);
  if (!ALLOWED_MUTES.has(minutes)) {
    json(res, 400, { error: 'Некорректный срок мута' });
    return true;
  }
  if (!actor.admin && (minutes === 0 || minutes > 1440)) {
    json(res, 403, { error: 'Модератор может выдать мут максимум на 24 часа' });
    return true;
  }

  const until = minutes === 0 ? FOREVER_MS : Date.now() + minutes * 60000;
  const reason = String(payload.reason || '').trim().slice(0, 240);
  await run(`INSERT INTO community_chat_mutes(user_id,muted_until_ms,muted_by,reason,created_at,updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      muted_until_ms=excluded.muted_until_ms,
      muted_by=excluded.muted_by,
      reason=excluded.reason,
      updated_at=CURRENT_TIMESTAMP`,
    target.user_id,
    until,
    user.id,
    reason,
  );
  json(res, 200, { ok: true, mutedUntil: until });
  return true;
}

async function unmuteFromMessage(res, user, messageId) {
  const actor = await staffInfo(user);
  if (!actor.staff) {
    json(res, 403, { error: 'Недостаточно прав' });
    return true;
  }
  const target = await messageTarget(messageId);
  if (!target) {
    json(res, 404, { error: 'Сообщение не найдено' });
    return true;
  }
  if (!canModerateTarget(user, actor, target)) {
    json(res, 403, { error: 'Недостаточно прав' });
    return true;
  }
  await run('DELETE FROM community_chat_mutes WHERE user_id=?', target.user_id);
  json(res, 200, { ok: true });
  return true;
}

async function deleteMessage(res, user, messageId) {
  const actor = await staffInfo(user);
  if (!actor.staff) {
    json(res, 403, { error: 'Недостаточно прав' });
    return true;
  }
  const target = await messageTarget(messageId);
  if (!target) {
    json(res, 404, { error: 'Сообщение уже удалено' });
    return true;
  }
  if (!canManageMessage(user, actor, target)) {
    json(res, 403, { error: 'Это сообщение нельзя удалить' });
    return true;
  }
  await run('DELETE FROM community_chat_messages WHERE id=?', messageId);
  json(res, 200, { ok: true });
  return true;
}

async function setPrefix(req, res, user, messageId) {
  const actor = await staffInfo(user);
  if (!actor.staff) {
    json(res, 403, { error: 'Недостаточно прав' });
    return true;
  }
  const target = await messageTarget(messageId);
  if (!target) {
    json(res, 404, { error: 'Сообщение не найдено' });
    return true;
  }
  if (!canManageMessage(user, actor, target)) {
    json(res, 403, { error: 'Этому пользователю нельзя менять префикс' });
    return true;
  }

  const payload = await readJson(req);
  const prefix = String(payload.prefix || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_PREFIX);

  if (!prefix) {
    await run('DELETE FROM community_chat_prefixes WHERE user_id=?', target.user_id);
    json(res, 200, { ok: true, prefix: '' });
    return true;
  }

  await run(`INSERT INTO community_chat_prefixes(user_id,prefix,assigned_by,created_at,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      prefix=excluded.prefix,
      assigned_by=excluded.assigned_by,
      updated_at=CURRENT_TIMESTAMP`,
    target.user_id,
    prefix,
    user.id,
  );
  json(res, 200, { ok: true, prefix });
  return true;
}

async function handle(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/community-chat')) return false;

  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return true;
  }

  if (path === '/api/community-chat' && req.method === 'GET') return listMessages(res, user);
  if (path === '/api/community-chat/messages' && req.method === 'POST') return sendMessage(req, res, user);

  let match = path.match(/^\/api\/community-chat\/messages\/(\d+)\/mute$/);
  if (match && req.method === 'POST') return muteFromMessage(req, res, user, Number(match[1]));

  match = path.match(/^\/api\/community-chat\/messages\/(\d+)\/unmute$/);
  if (match && req.method === 'POST') return unmuteFromMessage(res, user, Number(match[1]));

  match = path.match(/^\/api\/community-chat\/messages\/(\d+)\/prefix$/);
  if (match && req.method === 'POST') return setPrefix(req, res, user, Number(match[1]));

  match = path.match(/^\/api\/community-chat\/messages\/(\d+)$/);
  if (match && req.method === 'DELETE') return deleteMessage(res, user, Number(match[1]));

  json(res, 405, { error: 'Недоступное действие' });
  return true;
}

module.exports = { ensureSchema, handle };
