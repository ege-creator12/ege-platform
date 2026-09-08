const test=require('node:test');
const assert=require('node:assert/strict');
const {settingsFrom}=require('../src/ai-study-planner');

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
