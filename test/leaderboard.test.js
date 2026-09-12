'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const directory = mkdtempSync(join(tmpdir(), 'ege-leaderboard-'));
process.env.DATABASE_URL = '';
process.env.DATABASE_PATH = join(directory, 'test.sqlite');
process.env.PORT = '0';
const db = require('../src/db');
const { start } = require('../server');
let server, base, viewerId, outsiderId;

async function request(cookie = 'session=leaderboard-viewer') {
  const response = await fetch(base + '/api/leaderboard?limit=100', { headers: { cookie } });
  return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
}

before(async () => {
  server = await start();
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  const students = [
    ['Айгюль', 300], ['Саид', 500], ['Магомед', 300], ['Амина', 100],
    ['Мурад', 200], ['Заира', 50], ['Руслан', 0],
  ];
  for (const [index, [name, xp]] of students.entries()) {
    const result = await db.run('INSERT INTO users(name,email,password_hash,xp) VALUES(?,?,?,?)', name, `leader${index}@test.local`, 'test-only', xp);
    if (index === 0) viewerId = Number(result.lastInsertRowid);
    if (index === 5) outsiderId = Number(result.lastInsertRowid);
  }
  const admin = await db.run("INSERT INTO users(name,email,password_hash,xp,role) VALUES(?,?,?,?,'admin')", 'Администратор', 'leader-admin@test.local', 'test-only', 99999);
  for (const [token, id] of [['leaderboard-viewer', viewerId], ['leaderboard-admin', Number(admin.lastInsertRowid)]]) {
    await db.run('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)', token, id, new Date(Date.now() + 3600000).toISOString());
  }
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.close();
  rmSync(directory, { recursive: true, force: true });
});

test('leaderboard requires a valid session', async () => {
  for (const cookie of ['', 'session=invalid']) {
    const result = await request(cookie);
    assert.equal(result.status, 401);
    assert.equal(result.body.leaders, undefined);
  }
});

test('leaderboard returns only five students, ordered by XP with stable ties and no private fields', async () => {
  const result = await request();
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'no-store');
  assert.deepEqual(result.body.leaders, [
    { rank: 1, name: 'Саид', xp: 500, isYou: false },
    { rank: 2, name: 'Айгюль', xp: 300, isYou: true },
    { rank: 3, name: 'Магомед', xp: 300, isYou: false },
    { rank: 4, name: 'Мурад', xp: 200, isYou: false },
    { rank: 5, name: 'Амина', xp: 100, isYou: false },
  ]);
});

test('new XP promotes a student into the top five on the next read', async () => {
  await db.run('UPDATE users SET xp=600 WHERE id=?', outsiderId);
  const result = await request();
  assert.equal(result.body.leaders.length, 5);
  assert.equal(result.body.leaders[0].name, 'Заира');
  assert.equal(result.body.leaders[0].xp, 600);
  assert.equal(result.body.leaders.some(leader => leader.name === 'Амина'), false);
});

test('small and empty leaderboards do not invent participants', async () => {
  await db.run("DELETE FROM users WHERE role='student' AND id NOT IN (?,?)", viewerId, outsiderId);
  let result = await request('session=leaderboard-admin');
  assert.equal(result.body.leaders.length, 2);
  assert.equal(result.body.leaders.some(leader => leader.isYou), false);
  await db.run("DELETE FROM users WHERE role='student'");
  result = await request('session=leaderboard-admin');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.leaders, []);
});
