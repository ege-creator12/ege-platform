'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

require('../server-release-security-preload');

async function withServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  try { return await callback(`http://127.0.0.1:${port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('teacher API HTTP responses never expose email fields', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      name: 'Ученик',
      email: 'teacher-visible@example.invalid',
      rows: [{ student_email: 'student@example.invalid', score: 8, nested: { studentEmail: 'hidden@example.invalid' } }],
    }));
  }, async base => {
    const response = await fetch(`${base}/api/teacher/results`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.name, 'Ученик');
    assert.equal(body.email, undefined);
    assert.equal(body.rows[0].student_email, undefined);
    assert.equal(body.rows[0].nested.studentEmail, undefined);
    assert.equal(body.rows[0].score, 8);
  });
});

test('legacy owner-claim HTTP route is blocked before application handler', async () => {
  let reached = false;
  await withServer((req, res) => {
    reached = true;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ elevated: true }));
  }, async base => {
    const response = await fetch(`${base}/api/owner-claim/release-probe`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.code, 'ROUTE_NOT_FOUND');
    assert.equal(reached, false);
  });
});

test('non-teacher API responses are not stripped by teacher privacy guard', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ email: 'self@example.invalid', ok: true }));
  }, async base => {
    const response = await fetch(`${base}/api/me`);
    const body = await response.json();
    assert.equal(body.email, 'self@example.invalid');
    assert.equal(body.ok, true);
  });
});
