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
  await ensureExamLineBank(database,{minimum:15});
  require('./server-admin');
})().catch(error=>{console.error('startup',error);process.exit(1)});
