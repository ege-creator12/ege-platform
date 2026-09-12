'use strict';

const database = require('./src/db');
const { row, rows, run } = database;

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 256 * 1024) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

async function currentUser(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP', token);
}

function sqlUtc(date) {
  return new Date(date).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function dateValue(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value).includes('T') ? value : String(value).replace(' ', 'T') + 'Z');
  return Number.isFinite(d.getTime()) ? d : null;
}

function publicRow(subscription) {
  if (!subscription) return null;
  const expires = dateValue(subscription.expires_at);
  const active = subscription.expires_at == null || (expires && expires.getTime() > Date.now());
  return {
    userId: Number(subscription.user_id),
    plan: subscription.plan || 'pro',
    active: Boolean(active),
    permanent: subscription.expires_at == null,
    expiresAt: expires ? expires.toISOString() : null,
    grantedBy: subscription.granted_by == null ? null : Number(subscription.granted_by),
    updatedAt: subscription.updated_at || null,
  };
}

async function ensureSchema() {
  await run(`CREATE TABLE IF NOT EXISTS user_subscriptions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'pro',
    expires_at TIMESTAMP NULL,
    granted_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires ON user_subscriptions(expires_at)');
}

async function subscriptionForUser(userId) {
  return publicRow(await row('SELECT * FROM user_subscriptions WHERE user_id=?', Number(userId)));
}

async function hasActiveSubscription(userOrId, role) {
  const userId = typeof userOrId === 'object' ? Number(userOrId?.id) : Number(userOrId);
  const userRole = typeof userOrId === 'object' ? userOrId?.role : role;
  if (userRole === 'admin') return true;
  if (!Number.isSafeInteger(userId) || userId < 1) return false;
  return Boolean((await subscriptionForUser(userId))?.active);
}

async function grant(adminId, userId, body) {
  userId = Number(userId);
  if (!Number.isSafeInteger(userId) || userId < 1) throw Object.assign(new Error('Некорректный пользователь'), { status: 400 });
  const target = await row('SELECT id,name,email,role FROM users WHERE id=?', userId);
  if (!target) throw Object.assign(new Error('Пользователь не найден'), { status: 404 });

  if (body.enabled === false) {
    await run('DELETE FROM user_subscriptions WHERE user_id=?', userId);
    return { user: target, subscription: null };
  }

  const existing = await subscriptionForUser(userId);
  let expiresAt = null;
  if (!body.permanent) {
    if (body.expiresAt) {
      const exact = new Date(body.expiresAt);
      if (!Number.isFinite(exact.getTime()) || exact.getTime() <= Date.now()) throw Object.assign(new Error('Дата окончания должна быть в будущем'), { status: 400 });
      expiresAt = exact;
    } else {
      const days = Number(body.days || 30);
      if (!Number.isInteger(days) || days < 1 || days > 3650) throw Object.assign(new Error('Срок подписки должен быть от 1 до 3650 дней'), { status: 400 });
      // A quick "+N days" action must never silently turn permanent PRO into a timed plan.
      if (existing?.active && existing.permanent) return { user: target, subscription: existing };
      const base = existing?.active && existing.expiresAt ? Math.max(Date.now(), new Date(existing.expiresAt).getTime()) : Date.now();
      expiresAt = new Date(base + days * 86400000);
    }
  }

  await run(`INSERT INTO user_subscriptions(user_id,plan,expires_at,granted_by,created_at,updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,expires_at=excluded.expires_at,granted_by=excluded.granted_by,updated_at=CURRENT_TIMESTAMP`,
    userId, 'pro', expiresAt ? sqlUtc(expiresAt) : null, Number(adminId));

  return { user: target, subscription: await subscriptionForUser(userId) };
}

async function handle(req, res, url) {
  if (!url.pathname.startsWith('/api/subscription')) return false;
  const user = await currentUser(req);
  if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return true; }

  if (url.pathname === '/api/subscription/status' && req.method === 'GET') {
    const own = await subscriptionForUser(user.id);
    const adminAccess = user.role === 'admin';
    json(res, 200, {
      active: adminAccess || Boolean(own?.active),
      plan: adminAccess ? 'pro' : (own?.plan || null),
      permanent: adminAccess || Boolean(own?.permanent),
      expiresAt: adminAccess ? null : (own?.expiresAt || null),
      source: adminAccess ? 'admin' : own?.active ? 'manual' : 'none',
    });
    return true;
  }

  if (!url.pathname.startsWith('/api/subscription-admin')) return false;
  if (user.role !== 'admin') { json(res, 403, { error: 'Подписками управляет только администратор' }); return true; }

  if (url.pathname === '/api/subscription-admin/list' && req.method === 'GET') {
    const list = await rows('SELECT * FROM user_subscriptions ORDER BY updated_at DESC');
    json(res, 200, { subscriptions: list.map(publicRow) });
    return true;
  }

  const match = url.pathname.match(/^\/api\/subscription-admin\/users\/(\d+)$/);
  if (match && req.method === 'PATCH') {
    const result = await grant(user.id, Number(match[1]), await readJson(req));
    json(res, 200, { ok: true, ...result });
    return true;
  }

  json(res, 404, { error: 'Маршрут подписки не найден' });
  return true;
}

module.exports = { ensureSchema, handle, subscriptionForUser, hasActiveSubscription, grant };
