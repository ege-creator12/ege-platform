process.env.PRESERVE_ADMIN_CONTENT = process.env.PRESERVE_ADMIN_CONTENT || '1';
const database = require('./src/db');
const { fastContentReady, BIOLOGY_MINIMUM, CHEMISTRY_MINIMUM } = require('./src/startup-readiness');
const { ensureContentQuality2027 } = require('./src/content-quality-2027');
const originalRun = database.run;
database.run = (sql, ...params) => originalRun(
  sql.replace('updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'),
  ...params
);

async function ensureAiUsageStorage(){
  const userIdType=database.dialect==='postgresql'?'BIGINT':'INTEGER';
  const dateType=database.dialect==='postgresql'?'DATE':'TEXT';
  await database.run(`CREATE TABLE IF NOT EXISTS ai_daily_usage (
    user_id ${userIdType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usage_date ${dateType} NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
    PRIMARY KEY(user_id, usage_date)
  )`);
  await database.run('CREATE INDEX IF NOT EXISTS idx_ai_daily_usage_date ON ai_daily_usage(usage_date)');
}

async function ensureAiCoachStorage(){
  const userIdType=database.dialect==='postgresql'?'BIGINT':'INTEGER';
  const timestampType=database.dialect==='postgresql'?'TIMESTAMP':'TEXT';
  await database.run(`CREATE TABLE IF NOT EXISTS ai_coach_memory (
    user_id ${userIdType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_slug TEXT NOT NULL,
    memory_json TEXT NOT NULL DEFAULT '{}',
    updated_at ${timestampType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, subject_slug)
  )`);
  await database.run('CREATE INDEX IF NOT EXISTS idx_ai_coach_memory_updated ON ai_coach_memory(updated_at)');
}

async function deepContentRepair(){
  const {ensureExamLineBank}=require('./src/exam-line-bank');
  const {ensureBiologyLineBank}=require('./src/biology-line-bank-runner');
  const {ensureChemistryCourse}=require('./src/chemistry-course-upgrade');
  const {ensureChemistryLineBank}=require('./src/chemistry-line-bank-runner');
  await ensureExamLineBank(database,{minimum:15});
  const biology=await ensureBiologyLineBank(database,{minimum:BIOLOGY_MINIMUM});
  if(!biology.ok)throw new Error(`Biology question bank did not reach ${BIOLOGY_MINIMUM} unique visible questions on every exam line`);
  await ensureChemistryCourse(database);
  const chemistry=await ensureChemistryLineBank(database,{minimum:CHEMISTRY_MINIMUM,mediumMinimum:CHEMISTRY_MINIMUM});
  if(!chemistry.ok)throw new Error(`Chemistry question bank did not reach ${CHEMISTRY_MINIMUM} core + ${CHEMISTRY_MINIMUM} medium questions on every line`);
}

(async()=>{
  await database.migrate();
  await Promise.all([ensureAiUsageStorage(),ensureAiCoachStorage()]);
  await ensureContentQuality2027(database);
  const ready=await fastContentReady(database);
  if(ready) console.log('Fast startup: student content is clean and line banks are healthy; deep rebuild skipped.');
  else await deepContentRepair();
  await require('./server-performance').start();
})().catch(error=>{console.error('startup',error);process.exit(1)});
