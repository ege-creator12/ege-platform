'use strict';

const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const database = require('./src/db');
const registry = require('./content/biology/exam-lines.json');
const { biologyLinePayload, biologyLinesPayload } = require('./src/biology-line-service');

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.BIOLOGY_LINES_UPSTREAM_PORT || (PORT + 1));

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
  return database.row(
    'SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

async function auth(req, res) {
  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return null;
  }
  return user;
}

async function handleStrictBiologyLines(req, res, path) {
  if (req.method !== 'GET') return false;

  if (path === '/api/subjects/biology/exam-lines') {
    const user = await auth(req, res);
    if (!user) return true;
    const payload = await biologyLinesPayload(database, registry, user.id);
    json(res, 200, payload);
    return true;
  }

  const match = path.match(/^\/api\/subjects\/biology\/exam-lines\/(\d+)$/);
  if (!match) return false;
  const user = await auth(req, res);
  if (!user) return true;
  const line = Number(match[1]);
  if (!Number.isInteger(line) || line < 1 || line > 28) {
    json(res, 400, { error: 'Некорректный номер задания', code: 'INVALID_EXAM_LINE' });
    return true;
  }
  const payload = await biologyLinePayload(database, registry, line, user.id);
  if (!payload) {
    json(res, 404, { error: 'Линия задания не найдена', code: 'EXAM_LINE_NOT_FOUND' });
    return true;
  }
  json(res, 200, { line: payload });
  return true;
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` };
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: UPSTREAM_PORT,
    path: req.url,
    method: req.method,
    headers,
  }, upstreamResponse => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.on('error', error => {
    if (!res.headersSent) json(res, 503, { error: 'Сервис временно запускается' });
    else res.end();
    console.warn('biology-lines-upstream-error', error?.code || 'UNKNOWN');
  });
  req.pipe(upstream);
}

function waitForUpstream(left = 220) {
  return new Promise((resolve, reject) => {
    const test = attemptsLeft => {
      const socket = net.createConnection({ host: '127.0.0.1', port: UPSTREAM_PORT });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (attemptsLeft <= 0) reject(new Error('Biology line upstream did not start'));
        else setTimeout(() => test(attemptsLeft - 1), 100);
      });
    };
    test(left);
  });
}

async function start() {
  const child = spawn(process.execPath, [join(__dirname, 'server-ai-pro.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(UPSTREAM_PORT) },
    stdio: 'inherit',
  });
  child.on('exit', code => { if (code) console.error('biology lines upstream exit', code); });

  await waitForUpstream();
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (await handleStrictBiologyLines(req, res, path)) return;
      proxy(req, res);
    } catch (error) {
      console.error('biology-lines-api', error);
      if (!res.headersSent) json(res, 500, { error: 'Не удалось загрузить линию биологии' });
    }
  });

  server.listen(PORT, () => console.log(`EGE platform + strict biology lines: http://localhost:${PORT}`));
  const stop = () => {
    child.kill('SIGTERM');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
