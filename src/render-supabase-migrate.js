'use strict';

const database = require('./db');

const TABLES = [
  'users','subjects','sections','topics','lessons','lesson_blocks','content_sources','skills','questions','question_options','question_skills',
  'exam_spec_items','content_coverage','media_assets','mock_exams','mock_exam_questions','schema_migrations','site_settings','chemistry_upgrade_state',
  'ai_daily_usage','ai_usage_daily','ai_study_plans','activity_days','topic_progress','lesson_progress','training_sessions','attempts','training_session_questions',
  'mock_exam_attempts','biology_mock_exam_attempts','biology_mock_exam_items','chemistry_mock_exam_attempts','chemistry_mock_exam_items','sessions'
];

const ORDER = {
  users:'id', subjects:'id', sections:'id', topics:'id', lessons:'id', lesson_blocks:'id', content_sources:'id', skills:'id', questions:'id', question_options:'id',
  question_skills:'question_id,skill_id', exam_spec_items:'id', content_coverage:'id', media_assets:'id', mock_exams:'id', mock_exam_questions:'mock_exam_id,question_id',
  schema_migrations:'name', site_settings:'key', chemistry_upgrade_state:'version', ai_daily_usage:'user_id,usage_date', ai_usage_daily:'user_id,usage_date',
  ai_study_plans:'user_id,subject_slug', activity_days:'user_id,day', topic_progress:'user_id,topic_id', lesson_progress:'user_id,lesson_id',
  training_sessions:'id', attempts:'id', training_session_questions:'session_id,position', mock_exam_attempts:'id', biology_mock_exam_attempts:'id',
  biology_mock_exam_items:'id', chemistry_mock_exam_attempts:'id', chemistry_mock_exam_items:'id', sessions:'token'
};

function batchSize(table){
  if(table==='lesson_blocks' || table==='questions') return 100;
  if(table==='content_coverage') return 1000;
  return 500;
}

async function postBatch(url, token, table, rows){
  const response = await fetch(url, {
    method:'POST',
    headers:{'content-type':'application/json','x-migration-token':token},
    body:JSON.stringify({table,rows})
  });
  const text=await response.text();
  if(!response.ok) throw new Error(`${table}: ${response.status} ${text.slice(0,500)}`);
  let parsed;
  try{parsed=JSON.parse(text)}catch{parsed={ok:false,error:text}}
  if(!parsed.ok) throw new Error(`${table}: ${parsed.error||'unknown import error'}`);
  return parsed.count||0;
}

module.exports = async function migrateRenderToSupabase(){
  const url=process.env.SUPABASE_MIGRATION_URL;
  const token=process.env.SUPABASE_MIGRATION_TOKEN;
  if(!url || !token) throw new Error('SUPABASE_MIGRATION_URL/TOKEN missing');
  console.log('[supabase-migration] start');
  const totals={};
  for(const table of TABLES){
    const countRow=await database.row(`SELECT COUNT(*)::int AS n FROM ${table}`);
    const total=Number(countRow?.n||0);
    totals[table]=total;
    if(!total){console.log(`[supabase-migration] ${table}: 0`);continue;}
    const size=batchSize(table);
    let sent=0;
    for(let offset=0;offset<total;offset+=size){
      const rows=await database.rows(`SELECT * FROM ${table} ORDER BY ${ORDER[table]} LIMIT ? OFFSET ?`,size,offset);
      sent+=await postBatch(url,token,table,rows);
      if(sent===total || sent%5000===0) console.log(`[supabase-migration] ${table}: ${sent}/${total}`);
    }
    if(sent!==total) throw new Error(`${table}: sent ${sent}, expected ${total}`);
  }
  console.log('[supabase-migration] complete', JSON.stringify(totals));
  return totals;
};
