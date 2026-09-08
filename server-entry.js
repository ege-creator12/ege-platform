process.env.PRESERVE_ADMIN_CONTENT = process.env.PRESERVE_ADMIN_CONTENT || '1';
const database = require('./src/db');
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

(async()=>{
  await database.migrate();
  await ensureAiUsageStorage();
  const {ensureExamLineBank}=require('./src/exam-line-bank');
  const {ensureBiologyLineBank}=require('./src/biology-line-bank-runner');
  const {ensureChemistryCourse}=require('./src/chemistry-course-upgrade');
  const {ensureChemistryLineBank}=require('./src/chemistry-line-bank-runner');
  await ensureExamLineBank(database,{minimum:15});
  await ensureBiologyLineBank(database,{minimum:15});
  await ensureChemistryCourse(database);
  const chemistry=await ensureChemistryLineBank(database,{minimum:20,mediumMinimum:20});
  if(!chemistry.ok)throw new Error('Chemistry question bank did not reach 20 core + 20 medium questions on every line');
  require('./server-ai-pro');
})().catch(error=>{console.error('startup',error);process.exit(1)});
