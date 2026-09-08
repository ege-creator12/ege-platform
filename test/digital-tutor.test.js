const test=require('node:test');
const assert=require('node:assert/strict');
const {dayKey,missionFromPlan,buildTutorDay}=require('../src/digital-tutor');

test('digital tutor picks a study mission from the current plan',()=>{
  const future=new Date();future.setDate(future.getDate()+1);
  const plan={schedule:[{date:dayKey(future),rest:false,line:7,title:'Линия 7',theoryMinutes:12,practiceMinutes:30,reviewMinutes:8,questions:10}]};
  assert.equal(missionFromPlan(plan).line,7);
});

test('digital tutor builds theory then practice from real progress',async()=>{
  const db={
    row:async(sql)=>{
      if(sql.includes('FROM subjects'))return{id:1};
      if(sql.includes('FROM questions q')&&sql.includes('JOIN lessons'))return{id:21,title:'Генетика',topic_title:'Наследственность',question_count:12};
      if(sql.includes('FROM lesson_progress'))return null;
      return null;
    },
    rows:async(sql)=>{
      if(sql.includes('FROM latest l JOIN questions'))return[];
      if(sql.includes('FROM training_sessions'))return[];
      return[];
    }
  };
  const plan={subjectSlug:'biology',targetScore:85,readiness:40,coverage:50,scoreRange:null,schedule:[{date:dayKey(),rest:false,line:7,title:'Линия 7: генетика',reason:'Слабая линия',theoryMinutes:12,practiceMinutes:30,reviewMinutes:8,questions:10}]};
  const tutor=await buildTutorDay(db,2,'biology',plan);
  assert.equal(tutor.line,7);
  assert.deepEqual(tutor.steps.map(x=>x.key),['theory','practice']);
  assert.equal(tutor.steps[0].lessonId,21);
  assert.equal(tutor.nextStep.key,'theory');
  assert.equal(tutor.progress,0);
});

test('digital tutor endpoint is wired into AI PRO server',()=>{
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../server-ai-pro.js'),'utf8');
  assert.match(source,/\/api\/ai-pro\/tutor\/today/);
  assert.match(source,/digitalTutor\.buildTutorDay/);
});

test('dashboard continues the first unfinished tutor step',()=>{
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/dashboard-focus.js'),'utf8');
  assert.match(source,/data-tutor-continue/);
  assert.match(source,/tutor\.nextStep/);
  assert.match(source,/lesson\/\$\{step\.lessonId\}/);
  assert.match(source,/smart-review/);
});
