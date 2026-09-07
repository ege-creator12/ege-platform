process.env.PRESERVE_ADMIN_CONTENT = process.env.PRESERVE_ADMIN_CONTENT || '1';
const database = require('./src/db');
const originalRun = database.run;
database.run = (sql, ...params) => originalRun(
  sql.replace('updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'),
  ...params
);

(async()=>{
  await database.migrate();
  const {ensureExamLineBank}=require('./src/exam-line-bank');
  const {ensureBiologyLineBank}=require('./src/biology-line-bank-runner');
  const {ensureChemistryCourse}=require('./src/chemistry-course-upgrade');
  const {ensureChemistryLineBank}=require('./src/chemistry-line-bank-runner');
  await ensureExamLineBank(database,{minimum:15});
  await ensureBiologyLineBank(database,{minimum:15});
  await ensureChemistryCourse(database);
  const chemistry=await ensureChemistryLineBank(database,{minimum:20});
  if(!chemistry.ok)throw new Error('Chemistry question bank did not reach 20 questions on every line');
  require('./server-admin');
})().catch(error=>{console.error('startup',error);process.exit(1)});
