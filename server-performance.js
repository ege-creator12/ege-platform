'use strict';

const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createReadStream, existsSync, statSync } = require('node:fs');
const { join, resolve, extname, sep } = require('node:path');
const database = require('./src/db');
const moderator = require('./server-moderator');
const moderatorAi = require('./server-moderator-ai');
const problemReports = require('./server-problem-reports');
const adminUserDelete = require('./server-admin-user-delete');
const answerExpert = require('./server-answer-expert');

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.PERFORMANCE_UPSTREAM_PORT || (PORT + 1));
const PUBLIC = resolve(__dirname, 'public');

const mime = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

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

async function fastTopics(userId) {
  return database.rows(`SELECT t.*,
      COALESCE(tp.mastery,0) mastery,
      COALESCE(q.question_count,0) question_count
    FROM topics t
    LEFT JOIN topic_progress tp ON tp.topic_id=t.id AND tp.user_id=?
    LEFT JOIN (
      SELECT topic_id,COUNT(*) question_count
      FROM questions
      WHERE active=1 AND published=1
      GROUP BY topic_id
    ) q ON q.topic_id=t.id
    WHERE t.published=1
    ORDER BY t.position,t.id`, userId);
}

async function handleFastApi(req, res, pathname) {
  if (req.method !== 'GET' || pathname !== '/api/topics') return false;
  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return true;
  }
  json(res, 200, { topics: await fastTopics(user.id), fastPath: true });
  return true;
}

function staticCandidate(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.includes('\0')) return null;
  const extension = extname(decoded).toLowerCase();
  if (!mime[extension]) return null;
  const file = resolve(PUBLIC, '.' + decoded);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return null;
  if (!existsSync(file)) return null;
  const stat = statSync(file);
  return stat.isFile() ? { file, stat, extension } : null;
}

function cacheControl(url, extension) {
  if (url.searchParams.has('v')) return 'public, max-age=31536000, immutable';
  if (['.png','.webp','.jpg','.jpeg','.svg','.ico','.woff2'].includes(extension)) return 'public, max-age=86400, stale-while-revalidate=604800';
  return 'public, max-age=600, stale-while-revalidate=86400';
}

function serveStatic(req, res, url) {
  if (!['GET','HEAD'].includes(req.method || 'GET')) return false;
  const candidate = staticCandidate(url.pathname);
  if (!candidate) return false;
  const etag = `W/\"${candidate.stat.size}-${Math.floor(candidate.stat.mtimeMs)}\"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, {
      etag,
      'cache-control': cacheControl(url, candidate.extension),
    });
    res.end();
    return true;
  }
  res.writeHead(200, {
    'content-type': mime[candidate.extension],
    'content-length': candidate.stat.size,
    'cache-control': cacheControl(url, candidate.extension),
    etag,
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(candidate.file).pipe(res);
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
    console.warn('performance-upstream-error', error?.code || 'UNKNOWN');
  });
  req.pipe(upstream);
}

function waitForUpstream(left = 220) {
  return new Promise((resolvePromise, reject) => {
    const test = attemptsLeft => {
      const socket = net.createConnection({ host: '127.0.0.1', port: UPSTREAM_PORT });
      socket.once('connect', () => { socket.destroy(); resolvePromise(); });
      socket.once('error', () => {
        socket.destroy();
        if (attemptsLeft <= 0) reject(new Error('Performance upstream did not start'));
        else setTimeout(() => test(attemptsLeft - 1), 100);
      });
    };
    test(left);
  });
}

async function start() {
  await moderator.ensureSchema();
  await moderatorAi.ensureSchema();
  await problemReports.ensureSchema();
  const child = spawn(process.execPath, [join(__dirname, 'server-product.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(UPSTREAM_PORT) },
    stdio: 'inherit',
  });
  child.on('exit', code => { if (code) console.error('performance upstream exit', code); });

  await waitForUpstream();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (await problemReports.handle(req, res, url)) return;
      if (await moderatorAi.handle(req, res, url)) return;
      if (await answerExpert.handle(req, res, url)) return;
      if (await adminUserDelete.handle(req, res, url)) return;
      if (await moderator.handle(req, res, url)) return;
      if (await handleFastApi(req, res, url.pathname)) return;
      if (serveStatic(req, res, url)) return;
      proxy(req, res);
    } catch (error) {
      console.error('performance-api', error);
      if (!res.headersSent) json(res, Number(error?.status || 500), { error: error?.message || 'Не удалось загрузить данные' });
    }
  });

  server.listen(PORT, () => console.log(`EGE platform + performance gateway: http://localhost:${PORT}`));
  const stop = () => {
    child.kill('SIGTERM');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) start().catch(error => {
  console.error(error);
  process.exit(1);
});

module.exports = { start, fastTopics, handleFastApi, staticCandidate, cacheControl };
