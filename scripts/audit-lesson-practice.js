'use strict';

const db=require('../src/db');
const {auditLessonPractice,MIN_LESSON_QUESTIONS}=require('../src/lesson-practice');

(async()=>{
  await db.migrate();
  const report=await auditLessonPractice(db,{minimum:MIN_LESSON_QUESTIONS});
  console.log(`Lesson practice audit: ${report.total} lessons; direct>=${report.minimum}: ${report.directReady}; topic fallback: ${report.topicReady}; section/codifier fallback: ${report.fallbackReady}`);
  if(report.failures.length){
    console.error(`Lessons with fewer than ${report.minimum} resolvable questions: ${report.failures.length}`);
    for(const item of report.failures)console.error(`- [${item.subject}] ${item.slug} — ${item.title}; direct=${item.direct}; topic=${item.sameTopic}; resolved=${item.resolved}`);
    process.exitCode=1;
  }else{
    console.log(`OK: every published lesson resolves at least ${report.minimum} practice questions.`);
  }
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
}).finally(async()=>{try{await db.close()}catch{}});
