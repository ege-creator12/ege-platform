'use strict';

const database = require('./src/db');
const communityChat = require('./server-community-chat');

const MAX_BODY = 8 * 1024;
const MAX_MESSAGE = 1200;
const recentSends = new Map();
const actorCache = new Map();
const ACTOR_CACHE_MS = 30000;
let messageSnapshot = [];
let messageSnapshotAt = 0;

const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
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
  return database.row(
    'SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

async function staffInfo(user) {
  if (!user) return { staff: false, admin: false, moderator: false };
  if (user.role === 'admin') return { staff: true, admin: true, moderator: false };
  const moderator = await database.row('SELECT user_id FROM moderator_users WHERE user_id=?', user.id);
  return { staff: Boolean(moderator), admin: false, moderator: Boolean(moderator) };
}

async function requireStaff(req, res) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return null;
  }

  const cached = actorCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.actor;

  const user = await database.row(
    `SELECT u.id,u.name,u.role,mu.user_id moderator_user_id
     FROM sessions s
     JOIN users u ON u.id=s.user_id
     LEFT JOIN moderator_users mu ON mu.user_id=u.id
     WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP`,
    token,
  );
  if (!user) {
    actorCache.delete(token);
    json(res, 401, { error: 'Войдите в аккаунт' });
    return null;
  }
  const admin = user.role === 'admin';
  const moderator = !admin && Boolean(user.moderator_user_id);
  const staff = { staff: admin || moderator, admin, moderator };
  if (!staff.staff) {
    actorCache.delete(token);
    json(res, 403, { error: 'Чат доступен только модерации и администрации' });
    return null;
  }
  const actor = { user, staff };
  actorCache.set(token, { actor, expiresAt: Date.now() + ACTOR_CACHE_MS });
  if (actorCache.size > 100) {
    for (const [key, value] of actorCache) if (value.expiresAt <= Date.now()) actorCache.delete(key);
  }
  return actor;
}

function spamLimited(userId) {
  const now = Date.now();
  const recent = (recentSends.get(Number(userId)) || []).filter(t => now - t < 20000);
  if (recent.length >= 8 || (recent.length && now - recent[recent.length - 1] < 700)) return true;
  recent.push(now);
  recentSends.set(Number(userId), recent);
  return false;
}

async function ensureSchema() {
  if (database.dialect === 'postgresql') {
    await database.run(`CREATE TABLE IF NOT EXISTS staff_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  } else {
    await database.run(`CREATE TABLE IF NOT EXISTS staff_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }
  await database.run('CREATE INDEX IF NOT EXISTS idx_staff_chat_created ON staff_chat_messages(created_at)');
  await database.run('CREATE INDEX IF NOT EXISTS idx_staff_chat_user ON staff_chat_messages(user_id,created_at)');
}

async function listMessages(res, actor, since = 0) {
  const baseSelect = `SELECT m.id,m.user_id,m.body,m.created_at,u.name,u.role,
      CASE WHEN mu.user_id IS NULL THEN 0 ELSE 1 END is_moderator
    FROM staff_chat_messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN moderator_users mu ON mu.user_id=u.id`;

  try {
    let list;
    if (since > 0) {
      list = await database.rows(`${baseSelect}
        WHERE m.id>?
        ORDER BY m.id ASC
        LIMIT 150`, since);
    } else {
      list = await database.rows(`${baseSelect}
        ORDER BY m.id DESC
        LIMIT 150`);
      list.reverse();
    }

    const normalized = list.map(item => ({
      id: Number(item.id),
      body: String(item.body || ''),
      createdAt: item.created_at,
      name: String(item.name || 'Сотрудник'),
      mine: Number(item.user_id) === Number(actor.user.id),
      badge: item.role === 'admin' ? 'Администратор' : Number(item.is_moderator || 0) === 1 ? 'Модератор' : 'Персонал',
    }));

    if (since === 0) {
      messageSnapshot = normalized.slice(-150);
    } else if (normalized.length) {
      const merged = new Map(messageSnapshot.map(item => [Number(item.id), item]));
      normalized.forEach(item => merged.set(Number(item.id), item));
      messageSnapshot = [...merged.values()].sort((a,b) => Number(a.id)-Number(b.id)).slice(-150);
    }
    messageSnapshotAt = Date.now();

    json(res, 200, {
      messages: normalized,
      full: since === 0,
      stale: false,
      messagesCachedAt: messageSnapshotAt,
      me: {
        id: Number(actor.user.id),
        name: String(actor.user.name || ''),
        admin: actor.staff.admin,
        moderator: actor.staff.moderator,
      },
    });
  } catch (error) {
    if (!messageSnapshot.length) throw error;
    const fallback = since > 0
      ? messageSnapshot.filter(item => Number(item.id) > since)
      : messageSnapshot;
    json(res, 200, {
      messages: fallback,
      full: since === 0,
      stale: true,
      messagesCachedAt: messageSnapshotAt,
      me: {
        id: Number(actor.user.id),
        name: String(actor.user.name || ''),
        admin: actor.staff.admin,
        moderator: actor.staff.moderator,
      },
    });
  }
}

async function sendMessage(req, res, actor) {
  if (spamLimited(actor.user.id)) {
    json(res, 429, { error: 'Слишком быстро. Подождите немного.' });
    return;
  }
  const payload = await readJson(req);
  const body = String(payload.body || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_MESSAGE);
  if (!body) {
    json(res, 400, { error: 'Напишите сообщение' });
    return;
  }
  const result = await database.run(
    'INSERT INTO staff_chat_messages(user_id,body) VALUES(?,?)',
    actor.user.id,
    body,
  );
  json(res, 201, { ok: true, id: Number(result.lastInsertRowid || 0) });
}

async function handleStaff(req, res, url) {
  if (!url.pathname.startsWith('/api/staff-chat')) return false;
  const actor = await requireStaff(req, res);
  if (!actor) return true;

  if (url.pathname === '/api/staff-chat' && req.method === 'GET') {
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    await listMessages(res, actor, since);
    return true;
  }
  if (url.pathname === '/api/staff-chat/messages' && req.method === 'POST') {
    await sendMessage(req, res, actor);
    return true;
  }
  json(res, 405, { error: 'Недоступное действие' });
  return true;
}

if (!communityChat.__staffChatPatched) {
  const originalEnsureSchema = communityChat.ensureSchema.bind(communityChat);
  communityChat.ensureSchema = async () => {
    await originalEnsureSchema();
    await ensureSchema();
  };

  const originalHandle = communityChat.handle.bind(communityChat);
  communityChat.handle = async (req, res, url) => {
    if (await handleStaff(req, res, url)) return true;
    return originalHandle(req, res, url);
  };

  Object.defineProperty(communityChat, '__staffChatPatched', { value: true });
}

module.exports = { ensureSchema, handle: handleStaff };
