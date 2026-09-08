const test=require('node:test');
const assert=require('node:assert/strict');
const {PLAN_VERSION,settingsFrom,deterministicPriorities,deriveStudyStyle}=require('../src/ai-study-planner');

test('AI PRO planner accepts biology and chemistry goals',()=>{
 const future=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const biology=settingsFrom({subjectSlug:'biology',targetScore:85,examDate:future,daysPerWeek:5,minutesPerDay:60});
 assert.equal(biology.subjectSlug,'biology');
 assert.equal(biology.targetScore,85);
 const chemistry=settingsFrom({subjectSlug:'chemistry',targetScore:90,examDate:future,daysPerWeek:6,minutesPerDay:80});
 assert.equal(chemistry.subjectSlug,'chemistry');
 assert.equal(chemistry.daysPerWeek,6);
});

test('AI PRO planner rejects a past exam date',()=>{
 assert.throws(()=>settingsFrom({subjectSlug:'biology',targetScore:80,examDate:'2020-01-01',daysPerWeek:5,minutesPerDay:60}),/будущую дату/);
});

test('AI PRO v2 ranks deterministic priorities by calculated risk',()=>{
 assert.equal(PLAN_VERSION,2);
 const analytics={lines:[
  {line:1,priorityScore:15,maxScore:1},
  {line:2,priorityScore:90,maxScore:2},
  {line:3,priorityScore:55,maxScore:2},
 ]};
 assert.deepEqual(deterministicPriorities(analytics,3),[2,3,1]);
});

test('AI PRO v2 chooses a study style from coverage and weak-line state',()=>{
 assert.equal(deriveStudyStyle({scoreEstimate:null,coverage:20,lines:[],readiness:10}),'diagnostic');
 assert.equal(deriveStudyStyle({scoreEstimate:60,coverage:70,readiness:55,lines:[1,2,3,4].map(line=>({line,total:3,weightedAccuracy:40}))}),'repair');
 assert.equal(deriveStudyStyle({scoreEstimate:82,coverage:90,readiness:78,lines:[{line:1,total:6,weightedAccuracy:90}]}),'exam-mode');
 assert.equal(deriveStudyStyle({scoreEstimate:70,coverage:65,readiness:62,lines:[{line:1,total:6,weightedAccuracy:72}]}),'consolidation');
});

test('AI PRO automatic refresh does not spend a Gemini call',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../server-ai-pro.js'),'utf8');
 assert.match(source,/useAi:\s*false/);
 assert.match(source,/previousPlan:\s*plan/);
});

test('AI PRO planner has modern Gemini strategy fallback and structured JSON request',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/ai-study-planner.js'),'utf8');
 assert.match(source,/gemini-3\.8-flash/);
 assert.match(source,/responseFormat/);
 assert.match(source,/application\/json/);
});
