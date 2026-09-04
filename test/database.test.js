const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ege-')), 'test.sqlite');
process.env.PORT = '32117';
const db = require('../src/db');
const { start } = require('../server');
let server;
let cookie;
const base='http://127.0.0.1:32117';
async function request(path, options={}) {
  options.headers={ 'content-type':'application/json', ...(cookie?{cookie}:{}), ...options.headers };
  const response=await fetch(base+path,options);
  if(response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
  return { status:response.status, body:await response.json() };
}
before(async()=>{ server=await start(); await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve)); });
after(async()=>{ await new Promise(resolve=>server.close(resolve)); await db.close(); });

test('migrations are repeatable and create complete schema', async()=>{
  await db.migrate();
  const required=['users','sessions','subjects','topics','questions','attempts','skills','question_skills','lesson_progress','training_sessions','training_session_questions'];
  for(const name of required) assert.ok(await db.row("SELECT name FROM sqlite_master WHERE type='table' AND name=?",name));
  assert.equal((await db.row('SELECT COUNT(*) count FROM schema_migrations')).count,3);
  await db.migrate();
  assert.equal((await db.row('SELECT COUNT(*) count FROM schema_migrations')).count,3);
});

test('registration, login and persistent session work', async()=>{
  let result=await request('/api/register',{method:'POST',body:JSON.stringify({name:'Ученик',email:'student@test.local',password:'StrongPass123!'})});
  assert.equal(result.status,200); assert.ok(cookie);
  result=await request('/api/me'); assert.equal(result.body.user.email,'student@test.local');
  cookie=''; result=await request('/api/login',{method:'POST',body:JSON.stringify({email:'student@test.local',password:'StrongPass123!'})});
  assert.equal(result.status,200); result=await request('/api/me'); assert.equal(result.status,200);
  assert.match((await db.row('SELECT password_hash FROM users WHERE email=?','student@test.local')).password_hash,/^[a-f0-9]+:[a-f0-9]+$/);
});

test('lesson and full training result persist with XP and statistics', async()=>{
  const lesson=await db.row("SELECT id FROM topics WHERE kind='lesson' ORDER BY id LIMIT 1");
  let result=await request(`/api/lesson-progress/${lesson.id}`,{method:'POST',body:JSON.stringify({theoryRead:true})}); assert.equal(result.status,200);
  result=await request('/api/training/sessions',{method:'POST',body:JSON.stringify({topicId:lesson.id,targetQuestions:1,mode:'adaptive'})}); assert.equal(result.status,201);
  const sessionId=result.body.session.id;
  result=await request(`/api/training/sessions/${sessionId}/next`); const question=result.body.question;
  const expected=JSON.parse((await db.row('SELECT answer_json FROM questions WHERE id=?',question.id)).answer_json);
  result=await request(`/api/training/sessions/${sessionId}/answer`,{method:'POST',body:JSON.stringify({questionId:question.id,answer:expected,duration:5})});
  assert.equal(result.status,200); assert.equal(result.body.correct,true); assert.equal(result.body.done,true);
  const user=await db.row('SELECT id,xp FROM users WHERE email=?','student@test.local'); assert.ok(user.xp>=20);
  assert.equal((await db.row('SELECT COUNT(*) n FROM attempts WHERE user_id=?',user.id)).n,1);
  assert.equal((await db.row('SELECT status FROM training_sessions WHERE id=?',sessionId)).status,'completed');
  assert.equal((await db.row('SELECT theory_read FROM lesson_progress WHERE user_id=? AND lesson_id=?',user.id,lesson.id)).theory_read,1);
});

test('bootstrap adds content without changing user data', async()=>{
  const user=await db.row('SELECT id,xp FROM users WHERE email=?','student@test.local');
  await db.migrate();
  assert.deepEqual(await db.row('SELECT id,xp FROM users WHERE id=?',user.id),user);
});

test('health endpoint reports database without secrets',async()=>{
  const result=await request('/api/health'); assert.deepEqual(result.body,{ok:true,database:'sqlite'});
});
