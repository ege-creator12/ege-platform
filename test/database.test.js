const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ege-')), 'test.sqlite');
process.env.PORT = '32117';
const db = require('../src/db');
const { coverageReport, getTheoryForExamLine } = require('../src/coverage');
const { validateCourse, importCourse } = require('../src/bootstrap');
const { phase2Report } = require('../scripts/audit-phase2');
const { start } = require('../server');
const migrationCount=readdirSync(join(__dirname,'../migrations')).filter(name=>/^\d+.*\.sql$/.test(name)).length;
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
  const required=['users','sessions','subjects','topics','questions','attempts','skills','question_skills','lesson_progress','training_sessions','training_session_questions','sections','lessons','lesson_blocks','content_sources','exam_spec_items','content_coverage','media_assets','biology_mock_exam_attempts','biology_mock_exam_items','chemistry_mock_exam_attempts','chemistry_mock_exam_items','ai_study_plans'];
  for(const name of required) assert.ok(await db.row("SELECT name FROM sqlite_master WHERE type='table' AND name=?",name));
  assert.equal((await db.row('SELECT COUNT(*) count FROM schema_migrations')).count,migrationCount);
  await db.migrate();
  assert.equal((await db.row('SELECT COUNT(*) count FROM schema_migrations')).count,migrationCount);
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
  result=await request('/api/training/sessions',{method:'POST',body:JSON.stringify({topicId:lesson.topic_id,examLine:2,targetQuestions:2,mode:'adaptive'})}); assert.equal(result.status,201);
  const sessionId=result.body.session.id;
  result=await request(`/api/training/sessions/${sessionId}/next`); const question=result.body.question;
  const expected=JSON.parse((await db.row('SELECT answer_json FROM questions WHERE id=?',question.id)).answer_json);
  result=await request(`/api/training/sessions/${sessionId}/answer`,{method:'POST',body:JSON.stringify({questionId:question.id,answer:expected,duration:5})});
  assert.equal(result.status,200); assert.equal(result.body.correct,true); assert.equal(result.body.done,false); assert.equal(typeof result.body.explanation,'string');
  result=await request(`/api/training/sessions/${sessionId}/next`); const nextQuestion=result.body.question; assert.notEqual(nextQuestion.id,question.id);
  result=await request(`/api/training/sessions/${sessionId}/answer`,{method:'POST',body:JSON.stringify({questionId:nextQuestion.id,answer:['definitely-wrong'],duration:3})});
  assert.equal(result.status,200); assert.equal(result.body.correct,false); assert.equal(result.body.done,true); assert.equal(typeof result.body.explanation,'string'); assert.ok(result.body.expected.length); assert.equal(typeof result.body.reviewAnswer.examAnswer,'string');
  assert.equal(result.body.stats.solved,2); assert.equal(typeof result.body.stats.solved,'number');
  const user=await db.row('SELECT id,xp FROM users WHERE email=?','student@test.local'); assert.ok(user.xp>=20);
  assert.equal(user.xp,25); assert.equal((await db.row('SELECT COUNT(*) n FROM attempts WHERE user_id=?',user.id)).n,2);
  assert.equal((await db.row('SELECT solved FROM activity_days WHERE user_id=?',user.id)).solved,2);
  assert.equal((await db.row('SELECT status FROM training_sessions WHERE id=?',sessionId)).status,'completed');
  const completed=await db.row('SELECT answered_count,correct_count FROM training_sessions WHERE id=?',sessionId); assert.equal(completed.answered_count,2); assert.equal(completed.correct_count,1);
  assert.equal((await db.row('SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?',user.id,lesson.id)).status,'completed');
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
  assert.equal(result.status,200);assert.equal(result.body.correct,false);assert.equal(result.body.xp,0);assert.equal(result.body.resolutionType,'revealed');assert.ok(result.body.expected.length);assert.equal(typeof result.body.explanation,'string');assert.ok(Array.isArray(result.body.solutionSteps));assert.equal(typeof result.body.reviewAnswer.examAnswer,'string');
  const attempt=await db.row('SELECT correct,result_json,review_stage,next_review_at FROM attempts WHERE id=?',result.body.attemptId);
  assert.equal(attempt.correct,0);assert.equal(JSON.parse(attempt.result_json).resolutionType,'revealed');assert.equal(attempt.review_stage,0);assert.ok(attempt.next_review_at);
  assert.equal((await db.row('SELECT xp FROM users WHERE id=?',user.id)).xp,user.xp);
  assert.equal(Number((await db.row('SELECT COUNT(*) n FROM attempts WHERE user_id=?',user.id)).n),attemptsBefore+1);
  assert.equal(result.body.stats.solved,attemptsBefore+1);assert.ok(result.body.stats.accuracy<100);
  const duplicate=await request(`/api/training/sessions/${sessionId}/reveal`,{method:'POST',body:JSON.stringify({questionId:question.id})});
  assert.equal(duplicate.status,200);assert.equal(duplicate.body.alreadySaved,true);assert.deepEqual(duplicate.body.reviewAnswer,result.body.reviewAnswer);assert.equal(Number((await db.row('SELECT COUNT(*) n FROM attempts WHERE user_id=?',user.id)).n),attemptsBefore+1);
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
  const result=await request('/api/health'); assert.equal(result.body.status,'ok'); assert.equal(result.body.database,'connected'); assert.equal(result.body.migrations,migrationCount);
});

test('content import is idempotent and coverage links question, lesson, topic and exam line',async()=>{
  const before=await db.row("SELECT COUNT(*) questions FROM questions WHERE subject_id=(SELECT id FROM subjects WHERE slug='biology')");
  await db.migrate();
  const after=await db.row("SELECT COUNT(*) questions FROM questions WHERE subject_id=(SELECT id FROM subjects WHERE slug='biology')");
  assert.equal(after.questions,before.questions);
  const linked=await db.row(`SELECT q.exam_line,q.codifier_code,l.id lesson_id,t.id topic_id FROM questions q JOIN lessons l ON l.id=q.lesson_id JOIN topics t ON t.id=q.topic_id JOIN content_coverage c ON c.entity_type='question' AND c.entity_id=q.id JOIN exam_spec_items e ON e.id=c.spec_item_id AND e.codifier_code=q.codifier_code WHERE q.external_key='biology-2027-reviewed-v1-line27'`);
  assert.ok(linked.lesson_id); assert.ok(linked.topic_id); assert.equal(linked.exam_line,27);
});

test('coverage counts only reviewed content, including completed human theory',async()=>{
  const report=await coverageReport(db,'biology',2027);
  const sample=report.find(item=>item.title==='Нуклеиновые кислоты и реализация генетической информации');
  const human=report.find(item=>item.title==='Ткани и опорно-двигательная система');
  assert.equal(sample.theory_covered,true); assert.ok(sample.question_count>=2);
  assert.equal(human.theory_covered,true); assert.ok(human.question_count>=2); assert.equal(human.needs_content,false);
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
  const original=questions.filter(question=>/^bio-(50|60|70|80|90|100|110)-/.test(question.key));
  assert.equal(topics.length,7);
  assert.equal(original.length,105);
  assert.deepEqual(Object.fromEntries([1,2,3].map(level=>[level,original.filter(q=>q.difficulty===level).length])),{1:28,2:49,3:28});
  assert.ok(new Set(original.map(question=>question.type)).size>=12);
  for(const topic of topics) {
    const lessons=topic.lessons||[topic.lesson];
    const types=new Set(lessons.flatMap(lesson=>lesson.blocks).map(block=>block.type));
    for(const required of ['definition','table','algorithm','exam_trap','ege_example','summary']) assert.ok(types.has(required),`${topic.slug}: ${required}`);
    assert.ok(topic.questions.length>=15,topic.slug);
  }
  const byKey=Object.fromEntries(questions.map(question=>[question.key,question]));
  assert.equal(byKey['bio-70-004'].answer[0],'5′-УГЦ-ААУ-ЦГУ-3′');
  assert.equal(byKey['bio-70-010'].answer[0],'520');
  assert.equal(byKey['bio-80-009'].answer[0],'9 глюкоз и 18 АТФ');
  assert.equal(byKey['bio-110-010'].answer[0],'16 хромосом и 16 молекул ДНК');
  assert.equal(byKey['bio-110-013'].answer[0],'4 хромосомы и 8 молекул ДНК');
});

test('phase 1 biology has complete lessons, balanced practice and key biological answers',async()=>{
  const course=require('../content/biology/course.json');
  const topics=course.sections.filter(section=>['biology-reproduction','biology-genetics'].includes(section.slug)).flatMap(section=>section.topics);
  const questions=topics.flatMap(topic=>topic.questions);
  assert.equal(topics.length,7); assert.equal(questions.filter(q=>!q.key.startsWith('biology-')).length,64);
  assert.deepEqual(Object.fromEntries([1,2,3].map(level=>[level,questions.filter(q=>!q.key.startsWith('biology-')&&q.difficulty===level).length])),{1:14,2:30,3:20});
  for(const topic of topics) {
    assert.ok((topic.lessons||[topic.lesson]).every(lesson=>lesson.contentStatus==='review')); assert.ok(topic.questions.length>=8,topic.slug);
    const lessons=topic.lessons||[topic.lesson];
    const types=new Set(lessons.flatMap(lesson=>lesson.blocks).map(block=>block.type));
    for(const required of ['definition','table','algorithm','exam_trap','ege_example','summary']) assert.ok(types.has(required),`${topic.slug}: ${required}`);
  }
  const byKey=Object.fromEntries(questions.map(question=>[question.key,question]));
  assert.equal(byKey['phase1-bio-reproduction-2-04'].answer[0],'144');
  assert.equal(byKey['phase1-bio-genetics-1-03'].answer[0],'3/16');
  assert.equal(byKey['phase1-bio-genetics-2-02'].answer[0],'AB — 42%, ab — 42%, Ab — 8%, aB — 8%');
  assert.equal(byKey['phase1-bio-genetics-4-08'].answer[0],'тотипотентность');
  const lineTheory=await getTheoryForExamLine(db,28);
  assert.ok(lineTheory.some(lesson=>lesson.slug==='bio-genetics-1-lesson'));
  assert.ok(lineTheory.every(lesson=>lesson.exam_lines.includes(28)));
});

test('phase 2 diversity has complete reviewed theory, practice and biological assertions',()=>{
  const course=require('../content/biology/course.json');
  const report=phase2Report(course);
  assert.equal(report.topics,29);
  assert.equal(report.subtopics,24);
  assert.equal(report.lessons,64);
  // Theory deepening may add connected explanatory blocks; guard against loss,
  // rather than freezing the editorial structure at the Phase 2 baseline.
  assert.ok(report.blocks>=451);
  assert.ok(report.questions>=228);
  assert.equal(report.questionsLost,0);
  for(const level of [1,2,3])assert.ok(report.byDifficulty[level]>0);
  assert.equal(Object.keys(report.byType).length,14);
  assert.equal(report.assets,18);
  assert.deepEqual(report.codifierCodes,['19.0','20.0','21.0','22.0','23.0']);
});

test('phase 2 subtopics import under plant and animal parents and remain visible by exam line',async()=>{
  const plantChildren=await db.row("SELECT COUNT(*) n FROM topics WHERE parent_id=(SELECT id FROM topics WHERE slug='bio-diversity-4')");
  const animalChildren=await db.row("SELECT COUNT(*) n FROM topics WHERE parent_id=(SELECT id FROM topics WHERE slug='bio-diversity-5')");
  assert.equal(plantChildren.n,12); assert.equal(animalChildren.n,12);
  const theory=await getTheoryForExamLine(db,23);
  assert.ok(theory.some(lesson=>lesson.slug==='bio-diversity-4-plant-root-lesson'));
  // Diversity theory belongs to the dedicated zoology line, not the old
  // catch-all cytology line 3.
  const animalTheory=await getTheoryForExamLine(db,11);
  assert.ok(animalTheory.some(lesson=>lesson.slug==='bio-diversity-5-animal-birds-lesson'));
  const section=await db.row("SELECT id FROM sections WHERE slug='biology-diversity'");
  const response=await request(`/api/sections/${section.id}`);
  assert.equal(response.body.topics.length,5);
  assert.ok(response.body.topics.every(topic=>topic.parent_id===null));
});

test('biology exam-line mode lists every line, deep-links safely and filters practice',async()=>{
  let result=await request('/api/subjects/biology/exam-lines');
  assert.equal(result.status,200);assert.equal(result.body.lines.length,28);
  assert.deepEqual(result.body.lines.map(x=>x.line),Array.from({length:28},(_,i)=>i+1));
  assert.ok(result.body.lines.every(x=>x.questionCount>0));
  result=await request('/api/subjects/biology/exam-lines/11');
  assert.equal(result.status,200);assert.ok(result.body.line.lessons.length);
  assert.ok(result.body.line.examples.length);assert.equal(Object.hasOwn(result.body.line.examples[0],'expected'),false);
  assert.equal(Object.hasOwn(result.body.line.examples[0],'explanation'),false);
  const created=await request('/api/training/sessions',{method:'POST',body:JSON.stringify({examLine:11,targetQuestions:5,mode:'adaptive'})});
  assert.equal(created.status,201);assert.ok(created.body.session.questions.length<=5);
  const ids=created.body.session.questions.map(x=>x.id),mapped=await db.rows(`SELECT DISTINCT exam_line FROM questions WHERE id IN (${ids.map(()=>'?').join(',')})`,...ids);
  assert.deepEqual(mapped.map(x=>x.exam_line),[11]);
  result=await request('/api/subjects/biology/exam-lines/99');assert.equal(result.status,404);assert.equal(result.body.code,'EXAM_LINE_NOT_FOUND');
});

test('biology navigation exposes seven hierarchy levels without root duplicates',async()=>{
  const root=await request('/api/subjects/biology/navigation');
  assert.equal(root.status,200); assert.equal(root.body.groups.length,7);
  assert.equal(new Set(root.body.groups.map(group=>group.title)).size,7);
  assert.ok(root.body.groups.every(group=>group.childCount>0&&group.questionCount>=0));
  const diversity=root.body.groups.find(group=>group.slug==='diversity');
  const section=await request('/api/subjects/biology/groups/diversity');
  assert.equal(section.status,200); assert.equal(section.body.topics.length,5);
  assert.ok(section.body.topics.every(topic=>topic.parent_id===null));
  assert.equal(section.body.group.questionCount,diversity.questionCount);
  const plants=section.body.topics.find(topic=>/Растения/.test(topic.title));
  const animals=section.body.topics.find(topic=>/Животные/.test(topic.title));
  for(const parent of [plants,animals]){const page=await request('/api/topics/'+parent.id);assert.equal(page.body.children.length,12);assert.deepEqual(page.body.breadcrumbs.map(x=>x.id),[parent.id]);}
  const plantPage=await request('/api/topics/'+plants.id),child=plantPage.body.children[0];
  const childPage=await request('/api/topics/'+child.id);
  assert.deepEqual(childPage.body.breadcrumbs.map(x=>x.id),[plants.id,child.id]);
  const lesson=await request('/api/lessons/'+childPage.body.lessons[0].id);
  assert.equal(lesson.status,200); assert.deepEqual(lesson.body.breadcrumbs.map(x=>x.id),[plants.id,child.id]);
});

test('all 13 human topics lead through the API to exactly 63 reachable lessons',async()=>{
  const expected=['Организм, ткани и гомеостаз','Опорно-двигательная система','Внутренняя среда, кровь и иммунитет','Сердце и кровообращение','Дыхательная система','Пищеварение и обмен веществ','Выделение, кожа и терморегуляция','Нервная система','Эндокринная регуляция','Анализаторы и органы чувств','Высшая нервная деятельность','Размножение и развитие человека','Здоровье, эксперименты и интеграция'];
  const sectionRow=await db.row("SELECT id FROM sections WHERE slug='biology-human'");
  const section=await request(`/api/sections/${sectionRow.id}`);
  assert.equal(section.status,200);assert.deepEqual(section.body.topics.map(topic=>topic.title),expected);
  const reachable=new Map();
  for(const topic of section.body.topics){
    const page=await request(`/api/topics/${topic.id}`);assert.equal(page.status,200);
    assert.equal(page.body.children.length,0);assert.ok(page.body.lessons.length>0,`${topic.title} renders an empty page`);
    for(const lesson of page.body.lessons){assert.equal(reachable.has(lesson.id),false,`duplicate lesson route ${lesson.slug}`);reachable.set(lesson.id,{topicId:topic.id,slug:lesson.slug});const opened=await request(`/api/lessons/${lesson.id}`);assert.equal(opened.status,200);assert.ok(opened.body.blocks.length>0);}
  }
  assert.equal(reachable.size,63);
  const questions=await db.rows("SELECT q.id,q.topic_id,q.lesson_id FROM questions q JOIN topics t ON t.id=q.topic_id JOIN sections s ON s.id=t.section_id WHERE s.slug='biology-human' AND q.active=1");
  assert.equal(questions.length,require('../content/biology/course.json').sections.find(s=>s.slug==='biology-human').topics.flatMap(t=>t.questions).filter(q=>q.contentStatus!=='draft'&&q.contentStatus!=='legacy').length);assert.ok(questions.every(q=>reachable.has(q.lesson_id)&&reachable.get(q.lesson_id).topicId===q.topic_id));
});

test('all evolution topics expose 17 unique lessons and valid question routes',async()=>{
  const sectionRow=await db.row("SELECT id FROM sections WHERE slug='biology-evolution'");
  const section=await request(`/api/sections/${sectionRow.id}`);
  assert.equal(section.status,200);assert.equal(section.body.topics.length,17);
  const reachable=new Map();
  for(const topic of section.body.topics){
    const page=await request(`/api/topics/${topic.id}`);assert.equal(page.status,200);
    assert.equal(page.body.children.length,0);assert.ok(page.body.lessons.length>0,`${topic.title} renders an empty page`);
    for(const lesson of page.body.lessons){assert.equal(reachable.has(lesson.id),false,`duplicate evolution lesson ${lesson.slug}`);reachable.set(lesson.id,topic.id);const opened=await request(`/api/lessons/${lesson.id}`);assert.equal(opened.status,200);assert.ok(opened.body.blocks.length>=10);}
  }
  assert.equal(reachable.size,17);
  const questions=await db.rows("SELECT q.lesson_id,q.topic_id FROM questions q JOIN topics t ON t.id=q.topic_id JOIN sections s ON s.id=t.section_id WHERE s.slug='biology-evolution' AND q.active=1");
  assert.equal(questions.length,require('../content/biology/course.json').sections.find(s=>s.slug==='biology-evolution').topics.flatMap(t=>t.questions).filter(q=>q.contentStatus!=='draft'&&q.contentStatus!=='legacy').length);assert.ok(questions.every(question=>reachable.get(question.lesson_id)===question.topic_id));
});

test('content reimport hides stale visible topics and preserves moved human lesson ids',async()=>{
  const course=require('../content/biology/course.json'),subject=await db.row("SELECT id FROM subjects WHERE slug='biology'"),section=await db.row("SELECT id FROM sections WHERE slug='biology-human'");
  const before=Object.fromEntries((await db.rows("SELECT l.slug,l.id FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN sections s ON s.id=t.section_id WHERE s.slug='biology-human'")).map(row=>[row.slug,row.id]));
  await db.run("INSERT INTO topics(subject_id,section_id,slug,title,description,theory,position,kind,published,exam_year,source_version) VALUES(?,?,?,?,?,'',99,'topic',TRUE,2027,?)",subject.id,section.id,'bio-human-stale-container','Устаревшая пустая вкладка','stale','FIPI EGE 2027 project');
  const stale=await db.row("SELECT id FROM topics WHERE slug='bio-human-stale-container'"),movedSlug=Object.keys(before)[0];
  await db.run('UPDATE lessons SET topic_id=? WHERE id=?',stale.id,before[movedSlug]);
  await importCourse(db,course);
  assert.equal((await db.row("SELECT published FROM topics WHERE slug='bio-human-stale-container'")).published,0);
  const after=Object.fromEntries((await db.rows("SELECT l.slug,l.id FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN sections s ON s.id=t.section_id WHERE s.slug='biology-human' AND t.published=1")).map(row=>[row.slug,row.id]));
  assert.deepEqual(after,before);assert.equal(Object.keys(after).length,63);
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

test('biology mock exam is fixed, leak-free, autosaved, immutable and self-scored safely',async()=>{
 let result=await request('/api/subjects/biology/mock-exams',{method:'POST',body:JSON.stringify({mode:'untimed'})});
 assert.equal(result.status,201);const attempt=result.body.attempt,id=attempt.id;
 assert.equal(attempt.items.length,28);assert.deepEqual(attempt.items.map(x=>x.line),Array.from({length:28},(_,i)=>i+1));
 assert.equal(new Set(attempt.items.map(x=>x.question.prompt)).size,28);
 for(const item of attempt.items){assert.equal(Object.hasOwn(item.question,'answer'),false);assert.equal(Object.hasOwn(item,'review'),false)}
 const fixed=(await request(`/api/subjects/biology/mock-exams/${id}`)).body.attempt;assert.deepEqual(fixed.items.map(x=>x.id),attempt.items.map(x=>x.id));
 const first=attempt.items[0];result=await request(`/api/subjects/biology/mock-exams/${id}/answers`,{method:'PATCH',body:JSON.stringify({itemId:first.id,answer:['wrong'],flagged:true})});assert.equal(result.status,200);
 result=await request(`/api/subjects/biology/mock-exams/${id}/answers`,{method:'PATCH',body:JSON.stringify({itemId:first.id,answer:['changed'],flagged:false})});assert.equal(result.status,200);
 result=await request(`/api/subjects/biology/mock-exams/${id}/submit`,{method:'POST'});assert.equal(result.status,200);assert.ok(result.body.attempt.items[0].review);
 const again=await request(`/api/subjects/biology/mock-exams/${id}/submit`,{method:'POST'});assert.equal(again.status,200);assert.equal(again.body.attempt.submittedAt,result.body.attempt.submittedAt);
 result=await request(`/api/subjects/biology/mock-exams/${id}/answers`,{method:'PATCH',body:JSON.stringify({itemId:first.id,answer:['late']})});assert.equal(result.status,409);
 const ext=again.body.attempt.items.find(x=>x.review.extended);assert.ok(ext);
 result=await request(`/api/subjects/biology/mock-exams/${id}/self-score`,{method:'PATCH',body:JSON.stringify({itemId:ext.id,score:ext.maxScore+1})});assert.equal(result.status,400);
 result=await request(`/api/subjects/biology/mock-exams/${id}/self-score`,{method:'PATCH',body:JSON.stringify({itemId:ext.id,score:ext.maxScore})});assert.equal(result.status,200);
 const history=await request('/api/subjects/biology/mock-exams');assert.ok(history.body.attempts.some(x=>Number(x.id)===id));
 result=await request('/api/subjects/biology/mock-exams',{method:'POST',body:JSON.stringify({mode:'timed'})});assert.equal(result.status,201);const timedId=result.body.attempt.id;
 await db.run("UPDATE biology_mock_exam_attempts SET started_at='2000-01-01 00:00:00',duration_seconds=1 WHERE id=?",timedId);
 result=await request(`/api/subjects/biology/mock-exams/${timedId}`);assert.equal(result.status,200);assert.equal(result.body.attempt.status,'expired');
 let otherCookie;const saved=cookie;cookie='';await request('/api/register',{method:'POST',body:JSON.stringify({name:'Другой',email:'other@test.local',password:'StrongPass123!'})});otherCookie=cookie;
 result=await request(`/api/subjects/biology/mock-exams/${id}`);assert.equal(result.status,404);cookie=saved;void otherCookie;
});

test('reasoned answers require explicit self-review and never silently fail exact-text matching',async()=>{
  let r=await request('/api/register',{method:'POST',body:JSON.stringify({name:'Проверка качества',email:'quality@test.local',password:'QualityFixture2027!'})});assert.equal(r.status,200);
  r=await request('/api/training/sessions',{method:'POST',body:JSON.stringify({examLine:25,targetQuestions:1})});assert.equal(r.status,201);const id=r.body.session.id;
  const next=await request(`/api/training/sessions/${id}/next`),q=next.body.question;assert.equal(q.manualReview,true);assert(!('answer' in q));
  r=await request(`/api/training/sessions/${id}/answer`,{method:'POST',body:JSON.stringify({questionId:q.id,answer:['Объяснение своими словами.']})});assert.equal(r.status,400);assert.equal(r.body.code,'SELF_REVIEW_REQUIRED');
  assert.equal((await db.row('SELECT state FROM training_session_questions WHERE session_id=?',id)).state,'pending');
  r=await request(`/api/training/sessions/${id}/review`,{method:'POST',body:JSON.stringify({questionId:q.id})});assert.equal(r.status,200);assert(r.body.reviewAnswer.examAnswer.length>50);assert.equal(r.body.scoringPoints.length,3);
  assert.equal((await db.row('SELECT attempt_id FROM training_session_questions WHERE session_id=?',id)).attempt_id,null);
  r=await request(`/api/training/sessions/${id}/answer`,{method:'POST',body:JSON.stringify({questionId:q.id,answer:['Объяснение своими словами.'],selfAssessment:'understood'})});assert.equal(r.status,200);assert.equal(r.body.resolutionType,'self_assessed');assert.equal(r.body.correct,true);assert.equal(r.body.xp,5);
  const again=await request(`/api/training/sessions/${id}/answer`,{method:'POST',body:JSON.stringify({questionId:q.id,answer:['Ответ'],selfAssessment:'understood'})});assert.equal(again.status,409);
});

test('reimport refreshes options and media, keeps archival exercises unavailable and does not grow coverage edges',async()=>{
  const course=require('../content/biology/course.json'),q=await db.row("SELECT id FROM questions WHERE external_key='biology-2027-reviewed-v1-line7'");
  await db.run("UPDATE question_options SET label='Устаревший вариант' WHERE question_id=? AND value='0'",q.id);
  await db.run("INSERT INTO question_options(question_id,value,label,position) VALUES(?,'99','Лишний вариант',99)",q.id);
  await importCourse(db,course);
  const opts=await db.rows('SELECT value,label FROM question_options WHERE question_id=? ORDER BY position',q.id);assert.equal(opts.length,6);assert.equal(opts[0].label,'Конъюгация гомологичных хромосом');
  const edges=await db.row("SELECT COUNT(*) n FROM content_coverage WHERE entity_type='block'");await importCourse(db,course);assert.equal((await db.row("SELECT COUNT(*) n FROM content_coverage WHERE entity_type='block'")).n,edges.n);
  const archived=await db.row("SELECT COUNT(*) n FROM questions WHERE content_status='draft' AND subject_id=(SELECT id FROM subjects WHERE slug='biology')");assert.equal(archived.n,315);
  assert.equal((await db.row("SELECT COUNT(*) n FROM questions WHERE content_status='draft' AND (active=1 OR published=1)")).n,0);
  const r=await request('/api/training/sessions',{method:'POST',body:JSON.stringify({examLine:5,targetQuestions:10})});assert.equal(r.status,201);assert.equal(r.body.session.target_questions,3);
  const next=await request(`/api/training/sessions/${r.body.session.id}/next`);assert.match(next.body.question.imageUrl,/\/exam\/organelles.svg$/);assert(!JSON.stringify(next.body.question).includes('answerJson'));
  const {render}=require('../public/lesson-renderer');
  const blocks=await db.rows("SELECT b.type,b.content_json FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id JOIN topics t ON t.id=l.topic_id JOIN subjects s ON s.id=t.subject_id WHERE s.slug='biology' AND l.published=1");
  for(const [index,block]of blocks.entries()){const html=render(block,index);assert(html.length>0);if(['image','diagram'].includes(block.type))assert(!html.includes('src=\"\"'));}
});
