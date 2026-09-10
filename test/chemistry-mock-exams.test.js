'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const registry=require('../content/chemistry/exam-lines');
const {variantQuestions,VARIANT_COUNT}=require('../content/chemistry/mock-variants');

const root=join(__dirname,'..');

test('chemistry has twelve complete 34-line, 56-point mock variants',()=>{
 assert.equal(VARIANT_COUNT,12);
 const selectors=new Map();
 for(let variant=1;variant<=VARIANT_COUNT;variant++){
  const items=variantQuestions(variant);
  assert.equal(items.length,34,`variant ${variant}: 34 tasks`);
  assert.deepEqual(items.map(x=>x.line),Array.from({length:34},(_,i)=>i+1),`variant ${variant}: all lines in order`);
  assert.equal(items.reduce((sum,x)=>sum+x.maxScore,0),56,`variant ${variant}: 56 primary points`);
  assert.equal(new Set(items.map(x=>x.key)).size,34,`variant ${variant}: unique keys`);
  for(const item of items){
   assert(item.prompt&&item.answer?.length,`variant ${variant}, line ${item.line}: usable question`);
   assert.equal(item.maxScore,registry.lines[item.line-1].maxScore,`variant ${variant}, line ${item.line}: official line score`);
   if(item.line<=28)assert.equal(item.manualReview,false,`variant ${variant}, line ${item.line}: part 1 is auto-scored`);
   else{
    assert.equal(item.manualReview,true,`variant ${variant}, line ${item.line}: part 2 manual review`);
    assert.equal(item.scoringPoints.length,item.maxScore,`variant ${variant}, line ${item.line}: criteria per point`);
   }
   const signature=`${item.line}:${item.key.split('-q').pop()}`;
   const lineSet=selectors.get(item.line)||new Set();lineSet.add(signature);selectors.set(item.line,lineSet);
  }
 }
 for(const [line,set] of selectors)assert.equal(set.size,VARIANT_COUNT,`line ${line}: all mock variants use different authored tasks`);
});

test('chemistry mock UI is loaded after stable chemistry and has no observer loop',()=>{
 const html=readFileSync(join(root,'public/index.html'),'utf8'),source=readFileSync(join(root,'public/chemistry-mocks.js'),'utf8');
 assert(html.indexOf('/chemistry-mocks.js')>html.indexOf('/chemistry-stable.js'),'mock UI must load after stable chemistry');
 assert.doesNotMatch(source,/MutationObserver/);
 for(const route of ['chemistry/mocks','chemistry/mocks/exam/','chemistry/mocks/result/'])assert(source.includes(route),`missing UI route ${route}`);
 assert.match(source,/QuestionControls\.render/);assert.match(source,/QuestionControls\.read/);assert.match(source,/SaveQueue\.create/);
});

test('chemistry mock service creates a complete persistent attempt in a clean database',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ege-chem-mock-'));
 process.env.DATABASE_PATH=join(dir,'mock.sqlite');delete process.env.DATABASE_URL;
 const db=require('../src/db');
 const {createChemistryMockExamService}=require('../src/chemistry-mock-exams');
 try{
  await db.migrate();
  let user=await db.row('SELECT id FROM users ORDER BY id LIMIT 1');
  if(!user){const made=await db.run("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",'Chem Mock Test','chem-mock@example.test','test:test','student');user={id:Number(made.lastInsertRowid)}}
  const service=createChemistryMockExamService(db,registry),id=await service.create(Number(user.id),'untimed',1);
  assert(Number.isSafeInteger(id)&&id>0,'attempt id');
  const attempt=await db.row('SELECT * FROM chemistry_mock_exam_attempts WHERE id=?',id),payload=await service.payload(attempt,false);
  assert.equal(payload.variant,1);assert.equal(payload.mode,'untimed');assert.equal(payload.status,'in_progress');assert.equal(payload.primaryScoreMax,56);assert.equal(payload.items.length,34);
  assert.deepEqual(payload.items.map(x=>x.line),Array.from({length:34},(_,i)=>i+1));
  assert.equal(payload.items.filter(x=>x.part===2).length,6);
  assert(payload.items.every(x=>x.question?.prompt&&x.maxScore===registry.lines[x.line-1].maxScore));
 }finally{await db.close();rmSync(dir,{recursive:true,force:true})}
});
