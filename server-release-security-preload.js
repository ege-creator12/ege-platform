'use strict';

const http = require('node:http');

if (!global.__OSNOVA_RELEASE_SECURITY_PRELOAD__) {
  global.__OSNOVA_RELEASE_SECURITY_PRELOAD__ = true;
  const originalCreateServer = http.createServer;
  const PRIVATE_TEACHER_KEYS = /^(?:email|student_email|studentEmail)$/i;

  function pathnameOf(req) {
    try { return new URL(req.url || '/', 'http://localhost').pathname; }
    catch { return '/'; }
  }

  function blockedPrivilegedPath(pathname) {
    return /^\/api\/owner-claim(?:\/|$)/.test(String(pathname || ''));
  }

  function sanitizeTeacherPayload(value) {
    if (Array.isArray(value)) return value.map(sanitizeTeacherPayload);
    if (value && typeof value === 'object') {
      const clean = {};
      for (const [key, item] of Object.entries(value)) {
        if (PRIVATE_TEACHER_KEYS.test(key)) continue;
        clean[key] = sanitizeTeacherPayload(item);
      }
      return clean;
    }
    return value;
  }

  function installTeacherResponseSanitizer(res) {
    const originalWriteHead = res.writeHead.bind(res);
    const originalEnd = res.end.bind(res);
    let statusCode = 200;
    let statusMessage = null;
    let headers = {};
    let total = 0;
    let overflow = false;
    const chunks = [];
    const MAX = 4 * 1024 * 1024;

    res.writeHead = (code, second, third) => {
      statusCode = Number(code) || 200;
      if (typeof second === 'string') {
        statusMessage = second;
        headers = { ...(third || {}) };
      } else {
        headers = { ...(second || {}) };
      }
      return res;
    };

    res.write = (chunk, encoding, callback) => {
      const cb = typeof encoding === 'function' ? encoding : callback;
      if (!overflow) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ''), typeof encoding === 'string' ? encoding : undefined);
        total += buf.length;
        if (total > MAX) {
          overflow = true;
          chunks.length = 0;
        } else {
          chunks.push(buf);
        }
      }
      if (typeof cb === 'function') queueMicrotask(cb);
      return true;
    };

    res.end = (chunk, encoding, callback) => {
      const cb = typeof encoding === 'function' ? encoding : callback;
      if (chunk != null && !overflow) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : undefined);
        total += buf.length;
        if (total > MAX) {
          overflow = true;
          chunks.length = 0;
        } else {
          chunks.push(buf);
        }
      }

      if (overflow) {
        const safe = Buffer.from(JSON.stringify({ error: 'Ответ кабинета учителя слишком большой', code: 'TEACHER_RESPONSE_TOO_LARGE' }));
        originalWriteHead(500, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': safe.length,
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'same-origin',
        });
        return originalEnd(safe, cb);
      }

      let body = Buffer.concat(chunks);
      const currentHeaders = typeof res.getHeaders === 'function' ? res.getHeaders() : {};
      const contentType = String(headers['content-type'] || headers['Content-Type'] || currentHeaders['content-type'] || '');
      if (/json/i.test(contentType) || /^\s*[\[{]/.test(body.toString('utf8'))) {
        try { body = Buffer.from(JSON.stringify(sanitizeTeacherPayload(JSON.parse(body.toString('utf8'))))); }
        catch { /* Non-JSON responses are passed through unchanged. */ }
      }
      const outputHeaders = { ...currentHeaders, ...headers };
      for (const key of Object.keys(outputHeaders)) if (/^(?:content-length|transfer-encoding)$/i.test(key)) delete outputHeaders[key];
      outputHeaders['content-length'] = body.length;
      outputHeaders['x-content-type-options'] = outputHeaders['x-content-type-options'] || 'nosniff';
      outputHeaders['referrer-policy'] = outputHeaders['referrer-policy'] || 'same-origin';
      if (statusMessage) originalWriteHead(statusCode, statusMessage, outputHeaders); else originalWriteHead(statusCode, outputHeaders);
      return originalEnd(body, cb);
    };
  }

  function wrapListener(listener) {
    return function releaseGuardedListener(req, res) {
      const pathname = pathnameOf(req);
      if (blockedPrivilegedPath(pathname)) {
        res.writeHead(404, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'same-origin',
        });
        res.end(JSON.stringify({ error: 'Маршрут не найден', code: 'ROUTE_NOT_FOUND' }));
        return;
      }
      if (pathname.startsWith('/api/teacher/')) installTeacherResponseSanitizer(res);
      return listener.call(this, req, res);
    };
  }

  http.createServer = function patchedCreateServer(options, requestListener) {
    if (typeof options === 'function') return originalCreateServer.call(http, wrapListener(options));
    if (typeof requestListener === 'function') return originalCreateServer.call(http, options, wrapListener(requestListener));
    return originalCreateServer.call(http, options);
  };

  module.exports = { blockedPrivilegedPath, sanitizeTeacherPayload };
} else {
  module.exports = {
    blockedPrivilegedPath: pathname => /^\/api\/owner-claim(?:\/|$)/.test(String(pathname || '')),
    sanitizeTeacherPayload(value) {
      if (Array.isArray(value)) return value.map(module.exports.sanitizeTeacherPayload);
      if (value && typeof value === 'object') {
        const clean = {};
        for (const [key, item] of Object.entries(value)) if (!/^(?:email|student_email|studentEmail)$/i.test(key)) clean[key] = module.exports.sanitizeTeacherPayload(item);
        return clean;
      }
      return value;
    },
  };
}
