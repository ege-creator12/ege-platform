'use strict';

const database = require('./src/db');
const { row, rows } = database;

const clients = new Set();
const POLL_MS = 650;
const HEARTBEAT_MS = 20000;
let pollTimer = null;
let heartbeatTimer = null;
let polling = false;
let lastId = 0;

const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
};

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row(
    'SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

function stopLoops() {
  if (pollTimer) clearTimeout(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  pollTimer = null;
  heartbeatTimer = null;
  polling = false;
}

function writeEvent(client, event, data) {
  if (!client || client.closed || client.res.destroyed || client.res.writableEnded) return false;
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    client.closed = true;
    return false;
  }
}

function cleanupClient(client) {
  if (!client || client.closed) return;
  client.closed = true;
  clients.delete(client);
  if (!clients.size) stopLoops();
}

function schedulePoll(delay = POLL_MS) {
  if (!clients.size || pollTimer) return;
  pollTimer = setTimeout(() => {
    pollTimer = null;
    void pollMessages();
  }, delay);
  pollTimer.unref?.();
}

async function pollMessages() {
  if (!clients.size || polling) return schedulePoll();
  polling = true;
  try {
    const fresh = await rows(`SELECT m.id,m.user_id,m.body,m.created_at,u.name,u.role,
        CASE WHEN mu.user_id IS NULL THEN 0 ELSE 1 END is_moderator,
        COALESCE(cp.prefix,'') chat_prefix
      FROM community_chat_messages m
      JOIN users u ON u.id=m.user_id
      LEFT JOIN moderator_users mu ON mu.user_id=u.id
      LEFT JOIN community_chat_prefixes cp ON cp.user_id=u.id
      WHERE m.id>?
      ORDER BY m.id ASC
      LIMIT 60`, lastId);

    for (const item of fresh) {
      const id = Number(item.id || 0);
      if (!id || id <= lastId) continue;
      lastId = id;
      const prefix = String(item.chat_prefix || '').trim();
      const plainName = String(item.name || 'Ученик');
      const base = {
        id,
        senderId: Number(item.user_id || 0),
        body: String(item.body || ''),
        createdAt: item.created_at,
        name: prefix ? `[${prefix}] ${plainName}` : plainName,
        prefix,
        badge: item.role === 'admin' ? 'Админ' : Number(item.is_moderator || 0) === 1 ? 'Модератор' : '',
      };
      for (const client of [...clients]) {
        if (!writeEvent(client, 'chat-message', {
          ...base,
          mine: Number(client.userId) === Number(base.senderId),
        })) cleanupClient(client);
      }
    }
  } catch (error) {
    console.warn('community-chat-live-poll', error?.message || error);
  } finally {
    polling = false;
    schedulePoll();
  }
}

function startLoops() {
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      for (const client of [...clients]) {
        if (client.closed || client.res.destroyed || client.res.writableEnded) {
          cleanupClient(client);
          continue;
        }
        try { client.res.write(`: heartbeat ${Date.now()}\n\n`); }
        catch { cleanupClient(client); }
      }
    }, HEARTBEAT_MS);
    heartbeatTimer.unref?.();
  }
  schedulePoll(0);
}

async function baseline() {
  const current = await row('SELECT COALESCE(MAX(id),0) id FROM community_chat_messages');
  lastId = Math.max(0, Number(current?.id || 0));
}

async function handle(req, res, url) {
  if (url.pathname !== '/api/community-chat/stream') return false;
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Недоступное действие' });
    return true;
  }

  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return true;
  }

  if (!clients.size) await baseline();

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
  });
  res.flushHeaders?.();

  const client = { res, userId: Number(user.id), closed: false };
  clients.add(client);
  writeEvent(client, 'ready', { ok: true, lastId });
  startLoops();

  const cleanup = () => cleanupClient(client);
  req.once('aborted', cleanup);
  req.once('close', cleanup);
  res.once('close', cleanup);
  return true;
}

function close() {
  stopLoops();
  for (const client of [...clients]) {
    client.closed = true;
    try { client.res.end(); } catch {}
  }
  clients.clear();
}

module.exports = { handle, close, pollMessages };
