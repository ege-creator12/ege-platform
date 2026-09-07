const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const db = require('./src/db');
const registry = require('./content/biology/exam-lines.json');

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.LINE_UPSTREAM_PORT || (PORT + 1));
const APP_INTERNAL_PORT = Number(process.env.INTERNAL_APP_PORT || (PORT + 2));
const MIN_PER_LINE = 15;
const MAX_PER_LINE = 30;
const MAX_BODY = 1024 * 1024;

const json = (res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||min));

const preferredTypes={
  1:['short_answer','multiple_answer','text_analysis'],
  2:['matching','experiment','table'],
  3:['calculation','short_answer'],
  4:['genetics_problem','calculation','short_answer'],
  5:['image','diagram','short_answer'],
  6:['matching','image','diagram'],
  7:['multiple_answer','biological_process_analysis'],
  8:['sequence'],
  9:['image','diagram','short_answer'],
 10:['matching'],
 11:['multiple_answer'],
 12:['sequence'],
 13:['image','diagram','short_answer'],
 14:['matching'],
 15:['multiple_answer'],
 16:['sequence'],
 17:['text_analysis','multiple_answer','biological_process_analysis'],
 18:['multiple_answer','biological_process_analysis'],
 19:['matching'],
 20:['table','matching'],
 21:['graph','table','experiment','text_analysis'],
 22:['experiment','extended_answer'],
 23:['experiment','extended_answer'],
 24:['image','diagram','extended_answer'],
 25:['biological_process_analysis','extended_answer','text_analysis'],
 26:['biological_process_analysis','text_analysis','extended_answer'],
 27:['calculation','biological_process_analysis','extended_answer'],
 28:['genetics_problem','calculation','extended_answer']
};

async function readBody(req){let data='';for await(const c of req){data+=c;if(data.length>MAX_BODY)throw Object.assign(new Error('Слишком большой запрос'),{status:413});}try{return JSON.parse(data||'{}')}catch{throw Object.assign(new Error('Некорректный JSON'),{status:400})}}
async function sessionUser(req){const token=(req.headers.cookie||'').match(/(?:^|; )session=([^;]+)/)?.[1];if(!token)return null;return db.row("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP",token)}

function addUnique(target,seen,rows){for(const r of rows){const id=Number(r.id);if(!seen.has(id)){seen.add(id);target.push(id)}}}
async function linePool(line,cap=MAX_PER_LINE){
  const item=registry.lines.find(x=>x.line===Number(line));
  if(!item)return [];
  const result=[],seen=new Set();
  const exact=await db.rows("SELECT q.id FROM questions q JOIN subjects s ON s.id=q.subject_id WHERE s.slug='biology' AND q.active=1 AND q.published=1 AND q.exam_line=? ORDER BY q.difficulty,q.id",line);
  addUnique(result,seen,exact);
  const lessons=item.lessonRefs?.length?await db.rows(`SELECT l.id,t.section_id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE l.slug IN (${item.lessonRefs.map(()=>'?').join(',')})`,...item.lessonRefs):[];
  const lessonIds=lessons.map(x=>Number(x.id));
  const sectionIds=[...new Set(lessons.map(x=>Number(x.section_id)).filter(Boolean))];
  const types=preferredTypes[line]||[];
  if(result.length<cap&&lessonIds.length){
    const q=await db.rows(`SELECT id FROM questions WHERE active=1 AND published=1 AND lesson_id IN (${lessonIds.map(()=>'?').join(',')}) ORDER BY difficulty,id`,...lessonIds);
    addUnique(result,seen,q);
  }
  if(result.length<cap&&sectionIds.length&&types.length){
    const q=await db.rows(`SELECT q.id FROM questions q JOIN topics t ON t.id=q.topic_id WHERE q.active=1 AND q.published=1 AND t.section_id IN (${sectionIds.map(()=>'?').join(',')}) AND q.question_type IN (${types.map(()=>'?').join(',')}) ORDER BY q.difficulty,q.id`,...sectionIds,...types);
    addUnique(result,seen,q);
  }
  if(result.length<MIN_PER_LINE&&sectionIds.length){
    const q=await db.rows(`SELECT q.id FROM questions q JOIN topics t ON t.id=q.topic_id WHERE q.active=1 AND q.published=1 AND t.section_id IN (${sectionIds.map(()=>'?').join(',')}) ORDER BY q.difficulty,q.id`,...sectionIds);
    addUnique(result,seen,q);
  }
  if(result.length<MIN_PER_LINE&&types.length){
    const subject=await db.row("SELECT id FROM subjects WHERE slug='biology'");
    const q=await db.rows(`SELECT id FROM questions WHERE subject_id=? AND active=1 AND published=1 AND question_type IN (${types.map(()=>'?').join(',')}) ORDER BY difficulty,id`,subject.id,...types);
    addUnique(result,seen,q);
  }
  return result.slice(0,Math.max(MIN_PER_LINE,cap));
}

async function upstreamJson(path,headers={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:UPSTREAM_PORT,path,method:'GET',headers:{cookie:headers.cookie||'',accept:'application/json'}},r=>{let data='';r.setEncoding('utf8');r.on('data',c=>data+=c);r.on('end',()=>{try{resolve({status:r.statusCode||500,body:JSON.parse(data||'{}')})}catch(e){reject(e)}})});req.on('error',reject);req.end();
  });
}

async function patchedLines(req,res,path){
  if(req.method!=='GET')return false;
  if(path==='/api/subjects/biology/exam-lines'){
    const upstream=await upstreamJson(path,req.headers);if(upstream.status>=400){json(res,upstream.status,upstream.body);return true;}
    await Promise.all((upstream.body.lines||[]).map(async item=>{item.questionCount=(await linePool(item.line)).length}));
    json(res,200,upstream.body);return true;
  }
  const m=path.match(/^\/api\/subjects\/biology\/exam-lines\/(\d+)$/);
  if(m){
    const upstream=await upstreamJson(path,req.headers);if(upstream.status>=400){json(res,upstream.status,upstream.body);return true;}
    if(upstream.body.line)upstream.body.line.questionCount=(await linePool(Number(m[1]))).length;
    json(res,200,upstream.body);return true;
  }
  return false;
}

async function createLineTraining(req,res,path){
  if(path!=='/api/training/sessions'||req.method!=='POST')return false;
  const body=await readBody(req);
  const line=Number(body.examLine||0);if(!line)return false;
  const user=await sessionUser(req);if(!user){json(res,401,{error:'Войдите в аккаунт'});return true;}
  let pool=await linePool(line,MAX_PER_LINE);
  if(!pool.length){json(res,400,{error:'Для этой линии пока нет заданий'});return true;}
  const marks=pool.map(()=>'?').join(',');
  const attempts=await db.rows(`SELECT a.question_id,a.correct,a.next_review_at,a.id FROM attempts a WHERE a.user_id=? AND a.question_id IN (${marks}) ORDER BY a.id DESC`,user.id,...pool);
  const latest=new Map();for(const a of attempts)if(!latest.has(Number(a.question_id)))latest.set(Number(a.question_id),a);
  if(body.mode==='mistakes')pool=pool.filter(id=>latest.get(id)&&!latest.get(id).correct);
  else pool.sort((a,b)=>{const A=latest.get(a),B=latest.get(b);const rank=x=>!x?2:!x.correct?0:(x.next_review_at&&new Date(x.next_review_at)<=new Date()?1:3);return rank(A)-rank(B)||Math.random()-.5});
  const target=clamp(body.targetQuestions||10,1,Math.min(100,pool.length));pool=pool.slice(0,target);
  if(!pool.length){json(res,400,{error:'Ошибок по этой линии пока нет'});return true;}
  const result=await db.transaction(async tx=>{
    const s=await tx.run('INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,NULL,?,?)',user.id,body.mode==='mistakes'?'mistakes':'adaptive',pool.length);
    const sessionId=Number(s.lastInsertRowid);
    for(let i=0;i<pool.length;i++)await tx.run('INSERT INTO training_session_questions(session_id,question_id,position) VALUES(?,?,?)',sessionId,pool[i],i+1);
    return sessionId;
  });
  json(res,201,{session:{id:result,user_id:Number(user.id),mode:body.mode==='mistakes'?'mistakes':'adaptive',target_questions:pool.length,status:'active',answered_count:0,correct_count:0,examLine:line}});return true;
}

function proxy(req,res){
  const upstream=http.request({hostname:'127.0.0.1',port:UPSTREAM_PORT,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${UPSTREAM_PORT}`}},r=>{res.writeHead(r.statusCode||502,r.headers);r.pipe(res)});upstream.on('error',()=>{if(!res.headersSent)json(res,503,{error:'Сервис запускается'});else res.end()});req.pipe(upstream);
}
function wait(port,attempts=100){return new Promise((resolve,reject)=>{const go=n=>{const s=net.createConnection({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve()});s.once('error',()=>{s.destroy();if(n<=0)reject(new Error('Upstream did not start'));else setTimeout(()=>go(n-1),100)})};go(attempts)})}

async function start(){
  const child=spawn(process.execPath,[join(__dirname,'server-entry.js')],{cwd:__dirname,env:{...process.env,PORT:String(UPSTREAM_PORT),INTERNAL_APP_PORT:String(APP_INTERNAL_PORT)},stdio:'inherit'});
  child.on('exit',code=>{if(code)console.error('admin upstream exited',code)});
  await wait(UPSTREAM_PORT);
  const server=http.createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;try{if(await patchedLines(req,res,path))return;if(await createLineTraining(req,res,path))return;proxy(req,res)}catch(e){console.error('line-proxy',e);if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Ошибка линии заданий'})}});
  server.listen(PORT,()=>console.log(`EGE line pool proxy: http://localhost:${PORT}`));
  const stop=()=>{child.kill('SIGTERM');server.close(()=>process.exit(0))};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
start().catch(e=>{console.error(e);process.exit(1)});
