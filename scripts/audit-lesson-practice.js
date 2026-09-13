'use strict';

const db=require('../src/db');
const {ensureChemistryCourse}=require('../src/chemistry-course-upgrade');
const {ensureChemistryLineBank}=require('../src/chemistry-line-bank-runner');
const {auditLessonPractice,MIN_LESSON_QUESTIONS}=require('../src/lesson-practice');

(async()=>{
  await db.migrate();
  // Mirror production startup before checking lesson coverage: the visible chemistry
  // course is the v2 course and its exam-line banks are what lesson practice uses.
  await ensureChemistryCourse(db);
  const chemistry=await ensureChemistryLineBank(db,{minimum:20,mediumMinimum:20});
  if(!chemistry.ok)throw new Error('Chemistry question bank is incomplete before lesson-practice audit');

  const report=await auditLessonPractice(db,{minimum:MIN_LESSON_QUESTIONS});
  console.log(`Lesson practice audit: ${report.total} visible lessons; direct>=${report.minimum}: ${report.directReady}; topic fallback: ${report.topicReady}; EGE-line/section fallback: ${report.fallbackReady}`);
  if(report.failures.length){
    console.error(`Lessons with fewer than ${report.minimum} resolvable questions: ${report.failures.length}`);
    for(const item of report.failures)console.error(`- [${item.subject}] ${item.slug} — ${item.title}; direct=${item.direct}; topic=${item.sameTopic}; lines=${(item.examLines||[]).join(',')||'none'}; resolved=${item.resolved}`);
    process.exitCode=1;
  }else{
    console.log(`OK: every visible lesson resolves at least ${report.minimum} relevant practice questions.`);
  }
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
}).finally(async()=>{try{await db.close()}catch{}});
