const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ege-')), 'test.sqlite');
process.env.PORT = '32117';
const db = require('../src/db');
const { coverageReport } = require('../src/coverage');
const { validateCourse } = require('../src/bootstrap');
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
  const required=['users','sessions','subjects','topics','questions','attempts','skills','question_skills','lesson_progress','training_sessions','training_session_questions','sections','lessons','lesson_blocks','content_sources','exam_spec_items','content_coverage','media_assets'];
  for(const name of required) assert.ok(await db.row("SELECT name FROM sqlite_master WHERE type='table' AND name=?",name));
  assert.equal((await db.row('SELECT COUNT(*) count FROM schema_migrations')).count,5);
  await db.migrate();
  assert.equal((await db.row('SELECT COUNT(*) count FROM schema_migrations')).count,5);
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

test('reveal is a zero-XP incorrect attempt, exposes the solution once, and feeds adaptive mistakes',async()=>{
  const user=await db.row('SELECT id,xp FROM users WHERE email=?','student@test.local');
  const topic=await db.row('SELECT topic_id id FROM questions WHERE active=1 ORDER BY id LIMIT 1');
  let result=await request('/api/training/sessions',{method:'POST',body:JSON.stringify({topicId:topic.id,targetQuestions:1,mode:'adaptive'})});
  assert.equal(result.status,201);const sessionId=result.body.session.id;
  result=await request(`/api/training/sessions/${sessionId}/next`);assert.equal(result.status,200);const question=result.body.question;
  for(const secret of ['answer_json','answer_data_json','explanation','explanation_json','solution_steps_json']) assert.equal(Object.hasOwn(question,secret),false,`${secret} leaked`);
  const attemptsBefore=Number((await db.row('SELECT COUNT(*) n FROM attempts WHERE user_id=?',user.id)).n);
  result=await request(`/api/training/sessions/${sessionId}/reveal`,{method:'POST',body:JSON.stringify({questionId:question.id,duration:4})});
  assert.equal(result.status,200);assert.equal(result.body.correct,false);assert.equal(result.body.xp,0);assert.equal(result.body.resolutionType,'revealed');assert.ok(result.body.expected.length);assert.equal(typeof result.body.explanation,'string');assert.ok(Array.isArray(result.body.solutionSteps));
  const attempt=await db.row('SELECT correct,result_json,review_stage,next_review_at FROM attempts WHERE id=?',result.body.attemptId);
  assert.equal(attempt.correct,0);assert.equal(JSON.parse(attempt.result_json).resolutionType,'revealed');assert.equal(attempt.review_stage,0);assert.ok(attempt.next_review_at);
  assert.equal((await db.row('SELECT xp FROM users WHERE id=?',user.id)).xp,user.xp);
  assert.equal(Number((await db.row('SELECT COUNT(*) n FROM attempts WHERE user_id=?',user.id)).n),attemptsBefore+1);
  assert.equal(result.body.stats.solved,attemptsBefore+1);assert.ok(result.body.stats.accuracy<100);
  const duplicate=await request(`/api/training/sessions/${sessionId}/reveal`,{method:'POST',body:JSON.stringify({questionId:question.id})});
  assert.equal(duplicate.status,200);assert.equal(duplicate.body.alreadySaved,true);assert.equal(Number((await db.row('SELECT COUNT(*) n FROM attempts WHERE user_id=?',user.id)).n),attemptsBefore+1);
  const answerAfterReveal=await request(`/api/training/sessions/${sessionId}/answer`,{method:'POST',body:JSON.stringify({questionId:question.id,answer:result.body.expected})});
  assert.equal(answerAfterReveal.status,409);assert.equal((await db.row('SELECT xp FROM users WHERE id=?',user.id)).xp,user.xp);
  const mistakes=await request('/api/training/sessions',{method:'POST',body:JSON.stringify({topicId:topic.id,targetQuestions:20,mode:'mistakes'})});
  assert.equal(mistakes.status,201);assert.ok(mistakes.body.session.questions.some(item=>item.id===question.id));
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
  const result=await request('/api/health'); assert.equal(result.body.status,'ok'); assert.equal(result.body.database,'connected'); assert.equal(result.body.migrations,5);
});

test('content import is idempotent and coverage links question, lesson, topic and exam line',async()=>{
  const before=await db.row("SELECT COUNT(*) questions FROM questions WHERE subject_id=(SELECT id FROM subjects WHERE slug='biology')");
  await db.migrate();
  const after=await db.row("SELECT COUNT(*) questions FROM questions WHERE subject_id=(SELECT id FROM subjects WHERE slug='biology')");
  assert.equal(after.questions,before.questions);
  const linked=await db.row(`SELECT q.exam_line,q.codifier_code,l.id lesson_id,t.id topic_id FROM questions q JOIN lessons l ON l.id=q.lesson_id JOIN topics t ON t.id=q.topic_id JOIN content_coverage c ON c.entity_type='question' AND c.entity_id=q.id JOIN exam_spec_items e ON e.id=c.spec_item_id AND e.codifier_code=q.codifier_code WHERE q.external_key='bio-dna-calc-001'`);
  assert.ok(linked.lesson_id); assert.ok(linked.topic_id); assert.equal(linked.exam_line,27);
});

test('coverage reports gaps and counts only reviewed content',async()=>{
  const report=await coverageReport(db,'biology',2027);
  const sample=report.find(item=>item.title==='Нуклеиновые кислоты и реализация генетической информации');
  const draft=report.find(item=>item.title==='Вирусы');
  assert.equal(sample.theory_covered,true); assert.ok(sample.question_count>=2);
  assert.equal(draft.theory_covered,false); assert.equal(draft.needs_content,true);
});

test('missing image is rejected and nullable question images remain safe',async()=>{
  const invalid={subject:{slug:'biology'},sections:[{topics:[{slug:'x',codifierCode:'x',lesson:{blocks:[]},questions:[{key:'x',type:'image',prompt:'x',answer:['x'],image:'/missing.svg'}]}]}]};
  assert.throws(()=>validateCourse(invalid),/missing image/);
  assert.ok(await db.row("SELECT id FROM questions WHERE image_url IS NULL AND content_status='verified' LIMIT 1"));
});

test('molecular biology and cytology content meets editorial coverage targets',()=>{
  const course=require('../content/biology/course.json');
  const sections=course.sections.filter(section=>['biology-molecular','biology-cell'].includes(section.slug));
  const topics=sections.flatMap(section=>section.topics);
  const questions=topics.flatMap(topic=>topic.questions);
  const original=questions.filter(question=>question.contentStatus==='review');
  assert.equal(topics.length,7);
  assert.equal(original.length,105);
  assert.deepEqual(Object.fromEntries([1,2,3].map(level=>[level,original.filter(q=>q.difficulty===level).length])),{1:28,2:49,3:28});
  assert.ok(new Set(original.map(question=>question.type)).size>=12);
  for(const topic of topics) {
    const types=new Set(topic.lesson.blocks.map(block=>block.type));
    for(const required of ['definition','table','algorithm','exam_trap','ege_example','deep_dive','summary','quiz']) assert.ok(types.has(required),`${topic.slug}: ${required}`);
    assert.ok(topic.questions.length>=15,topic.slug);
  }
  const byKey=Object.fromEntries(questions.map(question=>[question.key,question]));
  assert.equal(byKey['bio-70-004'].answer[0],'5′-УГЦ-ААУ-ЦГУ-3′');
  assert.equal(byKey['bio-70-010'].answer[0],'520');
  assert.equal(byKey['bio-80-009'].answer[0],'9 глюкоз и 18 АТФ');
  assert.equal(byKey['bio-110-010'].answer[0],'16 хромосом и 16 молекул ДНК');
  assert.equal(byKey['bio-110-013'].answer[0],'4 хромосомы и 8 молекул ДНК');
});

test('content validator rejects incomplete solutions, invalid metadata and duplicate prompts',()=>{
  const base={subject:{slug:'biology'},codifier:[{code:'5.0',examLines:[1]}],sections:[{topics:[{slug:'quality-check',codifierCode:'5.0',lesson:{slug:'lesson',contentStatus:'review',blocks:[]},questions:[]}]}]};
  const question={key:'quality-1',type:'calculation',prompt:'Рассчитайте число молекул по условию опыта',answer:['2'],explanation:'Подробное объяснение результата.',difficulty:3,contentStatus:'review',examLine:29};
  base.sections[0].topics[0].questions=[question,{...question,key:'quality-2'}];
  assert.throws(()=>validateCourse(base),/invalid examLine 29/);
  assert.throws(()=>validateCourse(base),/missing solutionSteps/);
  assert.throws(()=>validateCourse(base),/probable duplicate prompt/);
});

test('legacy questions remain trainable without entering verified coverage',async()=>{
  const topic=await db.row('SELECT id FROM topics ORDER BY id LIMIT 1');
  await db.run(`INSERT INTO questions(topic_id,external_key,type,question_type,prompt,explanation,difficulty,answer_json,content_status,active) VALUES(?,?,'text','short_answer','Архивный вопрос','Архивное объяснение',1,'["ответ"]','legacy',TRUE)`,topic.id,'test-legacy-question');
  const q=await db.row("SELECT * FROM questions WHERE external_key='test-legacy-question' AND content_status='legacy' AND active=1");
  assert.ok(q); // active keeps it compatible with adaptive training
  assert.equal((await db.row("SELECT COUNT(*) n FROM content_coverage WHERE entity_type='question' AND entity_id=?",q.id)).n,0);
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
