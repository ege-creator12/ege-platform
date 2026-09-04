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
  const required=['users','sessions','subjects','topics','questions','attempts','skills','question_skills','lesson_progress','training_sessions','training_session_questions','sections','lessons','lesson_blocks','content_sources'];
  for(const name of required) assert.ok(await db.row("SELECT name FROM sqlite_master WHERE type='table' AND name=?",name));
  assert.equal((await db.row('SELECT COUNT(*) count FROM schema_migrations')).count,4);
  await db.migrate();
  assert.equal((await db.row('SELECT COUNT(*) count FROM schema_migrations')).count,4);
});

test('registration, login and persistent session work', async()=>{
  let result=await request('/api/register',{method:'POST',body:JSON.stringify({name:'Ученик',email:'student@test.local',password:'StrongPass123!'})});
  assert.equal(result.status,200); assert.ok(cookie);
  result=await request('/api/me'); assert.equal(result.body.user.email,'student@test.local');
  cookie=''; result=await request('/api/login',{method:'POST',body:JSON.stringify({email:'student@test.local',password:'StrongPass123!'})});
  assert.equal(result.status,200); result=await request('/api/me'); assert.equal(result.status,200);
  assert.match((await db.row('SELECT password_hash FROM users WHERE email=?','student@test.local')).password_hash,/^[a-f0-9]+:[a-f0-9]+$/);
});

test('POST session answer saves correct and incorrect attempts, progress, XP and statistics', async()=>{
  let result=await request('/api/subjects/biology'); assert.equal(result.status,200); assert.ok(result.body.sections.length);
  result=await request(`/api/sections/${result.body.sections[0].id}`); assert.equal(result.status,200); assert.ok(result.body.topics.length);
  result=await request(`/api/topics/${result.body.topics[0].id}`); assert.equal(result.status,200); assert.ok(result.body.lessons.length);
  const lesson=await db.row('SELECT id,topic_id FROM lessons WHERE id=?',result.body.lessons[0].id);
  result=await request(`/api/lessons/${lesson.id}`); assert.equal(result.status,200); assert.ok(result.body.blocks.length);
  result=await request(`/api/lesson-progress/${lesson.id}`,{method:'POST',body:JSON.stringify({theoryRead:true})}); assert.equal(result.status,200);
  result=await request('/api/training/sessions',{method:'POST',body:JSON.stringify({topicId:lesson.topic_id,targetQuestions:2,mode:'adaptive'})}); assert.equal(result.status,201);
  const sessionId=result.body.session.id;
  result=await request(`/api/training/sessions/${sessionId}/next`); const question=result.body.question;
  const expected=JSON.parse((await db.row('SELECT answer_json FROM questions WHERE id=?',question.id)).answer_json);
  result=await request(`/api/training/sessions/${sessionId}/answer`,{method:'POST',body:JSON.stringify({questionId:question.id,answer:expected,duration:5})});
  assert.equal(result.status,200); assert.equal(result.body.correct,true); assert.equal(result.body.done,false); assert.equal(typeof result.body.explanation,'string');
  result=await request(`/api/training/sessions/${sessionId}/next`); const nextQuestion=result.body.question; assert.notEqual(nextQuestion.id,question.id);
  result=await request(`/api/training/sessions/${sessionId}/answer`,{method:'POST',body:JSON.stringify({questionId:nextQuestion.id,answer:['definitely-wrong'],duration:3})});
  assert.equal(result.status,200); assert.equal(result.body.correct,false); assert.equal(result.body.done,true); assert.equal(typeof result.body.explanation,'string'); assert.ok(result.body.expected.length);
  assert.equal(result.body.stats.solved,2); assert.equal(typeof result.body.stats.solved,'number');
  const user=await db.row('SELECT id,xp FROM users WHERE email=?','student@test.local'); assert.ok(user.xp>=20);
  assert.equal(user.xp,25); assert.equal((await db.row('SELECT COUNT(*) n FROM attempts WHERE user_id=?',user.id)).n,2);
  assert.equal((await db.row('SELECT solved FROM activity_days WHERE user_id=?',user.id)).solved,2);
  assert.equal((await db.row('SELECT status FROM training_sessions WHERE id=?',sessionId)).status,'completed');
  const completed=await db.row('SELECT answered_count,correct_count FROM training_sessions WHERE id=?',sessionId); assert.equal(completed.answered_count,2); assert.equal(completed.correct_count,1);
  assert.equal((await db.row('SELECT theory_read FROM lesson_progress WHERE user_id=? AND lesson_id=?',user.id,lesson.id)).theory_read,1);
});

test('PostgreSQL answer upsert qualifies solved and COUNT results are normalized', async()=>{
  const source=require('node:fs').readFileSync(join(__dirname,'../server.js'),'utf8');
  assert.match(source,/DO UPDATE SET solved=activity_days\.solved\+1/);
  assert.doesNotMatch(source,/DO UPDATE SET solved=solved\+1/);
  const result=await request('/api/me');
  assert.equal(typeof result.body.stats.solved,'number');
  assert.ok(result.body.stats.progress.every(topic=>typeof topic.questions==='number'));
});

test('numeric topic ids in recursive queries cannot become PostgreSQL text', async()=>{
  const lesson=await db.row('SELECT id,topic_id FROM lessons ORDER BY id LIMIT 1');
  const result=await request(`/api/training/next?topic=${String(lesson.topic_id)}`);
  assert.equal(result.status,200);
  assert.ok(result.body.question.id);
  const invalid=await request('/api/training/next?topic=not-a-number');
  assert.equal(invalid.status,400);
  const source=require('node:fs').readFileSync(join(__dirname,'../server.js'),'utf8');
  assert.doesNotMatch(source,/tree\(id\) AS \(SELECT \?/);
  assert.match(source,/tree\(id\) AS \(SELECT CAST\(\? AS BIGINT\)/);
});

test('bootstrap adds content without changing user data', async()=>{
  const user=await db.row('SELECT id,xp FROM users WHERE email=?','student@test.local');
  await db.migrate();
  assert.deepEqual(await db.row('SELECT id,xp FROM users WHERE id=?',user.id),user);
});

test('health endpoint reports database without secrets',async()=>{
  const result=await request('/api/health'); assert.equal(result.body.status,'ok'); assert.equal(result.body.database,'connected'); assert.equal(result.body.migrations,4);
});


test('content API exposes both subjects and structured lessons',async()=>{
  let result=await request('/api/subjects'); assert.equal(result.status,200); assert.deepEqual(result.body.subjects.map(x=>x.slug),['biology','chemistry']);
  result=await request('/api/subjects/chemistry'); assert.equal(result.status,200); assert.equal(result.body.sections.length,6);
  const section=result.body.sections[0]; result=await request('/api/sections/'+section.id); assert.ok(result.body.topics.length);
  const topic=result.body.topics[0]; result=await request('/api/topics/'+topic.id); assert.ok(result.body.lessons.length);
  result=await request('/api/lessons/'+result.body.lessons[0].id); assert.equal(result.status,200); assert.ok(result.body.blocks.length>=8);
});

test('invalid input returns safe 4xx and logout revokes auth',async()=>{
  let result=await request('/api/training/sessions/not-a-number/next'); assert.equal(result.status,404);
  result=await request('/api/lesson-progress/999999',{method:'POST',body:'{}'}); assert.equal(result.status,404);
  result=await request('/api/logout',{method:'POST'}); assert.equal(result.status,200);
  result=await request('/api/me'); assert.equal(result.status,401);
  cookie=''; result=await request('/api/login',{method:'POST',body:JSON.stringify({email:'student@test.local',password:'StrongPass123!'})}); assert.equal(result.status,200);
});

test('database transaction rolls back all writes',async()=>{
  const before=(await db.row('SELECT COUNT(*) n FROM users')).n;
  await assert.rejects(db.transaction(async tx=>{await tx.run('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)','Rollback','rollback@test.local','not-a-real-password');throw Error('rollback')}));
  assert.equal((await db.row('SELECT COUNT(*) n FROM users')).n,before);
});
