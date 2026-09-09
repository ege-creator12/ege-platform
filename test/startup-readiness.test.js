'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fastContentReady,completeLineSet,CHEMISTRY_COURSE_VERSION}=require('../src/startup-readiness');

const counts=(lines,minimum,shortLine=0)=>Array.from({length:lines},(_,i)=>({exam_line:i+1,n:i+1===shortLine?minimum-1:minimum}));

function dbFixture({bioShort=0,coreShort=0,mediumShort=0,missingUpgrade=false,throwUpgrade=false}={}){
 let rowsCalls=0,rowCalls=0;
 return {
  stats:()=>({rowsCalls,rowCalls}),
  row:async(sql,param)=>{
   rowCalls++;
   if(sql.includes("slug='biology'"))return{id:1};
   if(sql.includes("slug='chemistry'"))return{id:2};
   if(sql.includes('chemistry_upgrade_state')){
    if(throwUpgrade)throw new Error('missing table');
    return missingUpgrade?undefined:{version:param};
   }
   throw new Error('unexpected row query');
  },
  rows:async(sql,_subjectId,pattern)=>{
   rowsCalls++;
   if(pattern==='biology-bank-v6-line%')return counts(28,24,bioShort);
   if(pattern==='chemistry-bank-v2-line%')return counts(34,20,coreShort);
   if(pattern==='chemistry-medium-v1-line%')return counts(34,20,mediumShort);
   throw new Error(`unexpected rows query: ${sql}`);
  }
 };
}

test('completeLineSet requires every expected line at or above minimum',()=>{
 assert.equal(completeLineSet(counts(28,24),28,24),true);
 assert.equal(completeLineSet(counts(28,24,18),28,24),false);
 assert.equal(completeLineSet(counts(27,24),28,24),false);
});

test('healthy production content uses only the cheap readiness queries',async()=>{
 const db=dbFixture();
 assert.equal(await fastContentReady(db),true);
 assert.deepEqual(db.stats(),{rowCalls:3,rowsCalls:3});
 assert.equal(CHEMISTRY_COURSE_VERSION,'chemistry-2027-subject-course-v2-fipi-mastery-complete');
});

test('any incomplete generated bank falls back to deep repair',async()=>{
 assert.equal(await fastContentReady(dbFixture({bioShort:18})),false);
 assert.equal(await fastContentReady(dbFixture({coreShort:30})),false);
 assert.equal(await fastContentReady(dbFixture({mediumShort:11})),false);
 assert.equal(await fastContentReady(dbFixture({missingUpgrade:true})),false);
});

test('missing readiness state never blocks startup and safely requests repair',async()=>{
 assert.equal(await fastContentReady(dbFixture({throwUpgrade:true})),false);
});
