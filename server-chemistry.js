'use strict';
const http=require('node:http');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {join}=require('node:path');
const database=require('./src/db');
const registry=require('./content/chemistry/exam-lines');
const {createChemistryMockExamService}=require('./src/chemistry-mock-exams');
const {CHEMISTRY_BANK_VERSION}=require('./src/chemistry-bank-version');
const {rows,row,run}=database;
const chemistryMocks=createChemistryMockExamService(database,registry);
const PORT=Number(process.env.PORT||3000),UPSTREAM_PORT=Number(process.env.CHEMISTRY_UPSTREAM_PORT||(PORT+1));
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
async function readJson(req){let data='';for await(const c of req){data+=c;if(data.length>1e6)throw Object.assign(new Error('Слишком большой запрос'),{status:413});}try{return JSON.parse(data||'{}')}catch{throw Object.assign(new Error('Некорректный JSON'),{status:400});}}
async function userFor(req){const token=(req.headers.cookie||'').match(/(?:^|; )session=([^;]+)/)?.[1];if(!token)return null;return row("SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP",token);}
async function auth(req,res){const u=await userFor(req);if(!u){json(res,401,{error:'Войдите в аккаунт'});return null;}return u;}
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{}}catch{return {}}};
const textFrom=value=>{if(value==null)return'';if(typeof value==='string')return value;if(Array.isArray(value))return value.map(textFrom).join(' ');if(typeof value==='object')return Object.values(value).map(textFrom).join(' ');return String(value);};

async function chemistryLinePayload(line,userId){
 const info=registry.lines.find(x=>Number(x.line)===Number(line));if(!info)return null;
 const subject=await row("SELECT id FROM subjects WHERE slug='chemistry'");if(!subject)return null;
 const lessonMarks=info.lessonRefs.map(()=>'?').join(',');
 const lessons=info.lessonRefs.length?await rows(`SELECT l.id,l.slug,l.title,t.title topic_title,s.title section_title,COALESCE(lp.reading_progress,0) progress,COALESCE(lp.status,'not_started') progress_status FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN sections s ON s.id=t.section_id LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=? WHERE t.subject_id=? AND t.published=1 AND l.slug IN (${lessonMarks}) AND l.published=1 ORDER BY l.id`,userId,subject.id,...info.lessonRefs):[];
 const pattern=`chemistry-bank-${CHEMISTRY_BANK_VERSION}-line${line}-%`;
 const count=await row('SELECT COUNT(*) n FROM questions WHERE subject_id=? AND active=1 AND published=1 AND exam_line=? AND external_key LIKE ?',subject.id,line,pattern);
 const stat=await row('SELECT COUNT(*) attempted,COALESCE(SUM(a.correct),0) correct,MAX(a.created_at) last_attempt_at FROM attempts a JOIN questions q ON q.id=a.question_id WHERE a.user_id=? AND q.subject_id=? AND q.exam_line=? AND q.external_key LIKE ?',userId,subject.id,line,pattern);
 const wrong=await rows(`WITH latest AS (SELECT a.*,ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY id DESC) rn FROM attempts a WHERE user_id=?) SELECT q.external_key FROM latest a JOIN questions q ON q.id=a.question_id WHERE a.rn=1 AND a.correct=FALSE AND q.subject_id=? AND q.exam_line=? AND q.external_key LIKE ? ORDER BY a.created_at DESC`,userId,subject.id,line,pattern);
 const examples=await rows('SELECT q.id,q.type,q.question_type,q.prompt,q.instruction,q.content_json,q.media_json,q.difficulty,q.points,q.max_score,t.title topic FROM questions q JOIN topics t ON t.id=q.topic_id WHERE q.subject_id=? AND q.active=1 AND q.published=1 AND q.exam_line=? AND q.external_key LIKE ? ORDER BY q.difficulty,q.id LIMIT 3',subject.id,line,pattern);
 const attempted=Number(stat?.attempted||0),correct=Number(stat?.correct||0);
 return {...info,questionCount:Number(count?.n||0),lessons,examples:examples.map(q=>({id:q.id,type:q.type,questionType:q.question_type,prompt:q.prompt,instruction:q.instruction,difficulty:q.difficulty,maxScore:q.max_score,topic:q.topic})),progress:{attempted,correct,accuracy:attempted?Math.round(correct/attempted*100):0,lastAttemptAt:stat?.last_attempt_at||null,wrongQuestionRefs:wrong.map(x=>x.external_key)}};
}

async function chemistryLinesPayload(userId){
 const subject=await row("SELECT id FROM subjects WHERE slug='chemistry'");
 if(!subject)return null;
 const strictPattern=`chemistry-bank-${CHEMISTRY_BANK_VERSION}-line%`;
 const [counts,stats]=await Promise.all([
  rows('SELECT exam_line,COUNT(*) n FROM questions WHERE subject_id=? AND active=1 AND published=1 AND exam_line BETWEEN 1 AND 34 AND external_key LIKE ? GROUP BY exam_line',subject.id,strictPattern),
  rows('SELECT q.exam_line,COUNT(*) attempted,COALESCE(SUM(a.correct),0) correct,MAX(a.created_at) last_attempt_at FROM attempts a JOIN questions q ON q.id=a.question_id WHERE a.user_id=? AND q.subject_id=? AND q.exam_line BETWEEN 1 AND 34 AND q.external_key LIKE ? GROUP BY q.exam_line',userId,subject.id,strictPattern)
 ]);
 const countByLine=new Map(counts.map(x=>[Number(x.exam_line),Number(x.n||0)]));
 const statByLine=new Map(stats.map(x=>[Number(x.exam_line),x]));
 const lines=registry.lines.map(info=>{
  const stat=statByLine.get(Number(info.line));
  const attempted=Number(stat?.attempted||0),correct=Number(stat?.correct||0);
  return {line:info.line,title:info.title,part:info.part,maxScore:info.maxScore,answerFormat:info.answerFormat,shortDescription:info.shortDescription,questionCount:countByLine.get(Number(info.line))||0,progress:{attempted,correct,accuracy:attempted?Math.round(correct/attempted*100):0,lastAttemptAt:stat?.last_attempt_at||null,wrongQuestionRefs:[]}};
 });
 return {examYear:registry.examYear,sourceStatus:registry.sourceStatus,durationMinutes:registry.durationMinutes,primaryScoreMax:registry.primaryScoreMax,lines};
}

async function searchChemistry(query,userId){
 const terms=String(query||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').split(/[^a-zа-я0-9+\-]+/i).filter(x=>x.length>1).slice(0,8);if(!terms.length)return[];
 const subject=await row("SELECT id FROM subjects WHERE slug='chemistry'");if(!subject)return[];
 const lessons=await rows(`SELECT l.id,l.slug,l.title,t.title topic_title,s.title section_title,COALESCE(lp.reading_progress,0) progress FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN sections s ON s.id=t.section_id LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=? WHERE t.subject_id=? AND l.published=1 AND t.published=1 AND s.published=1 ORDER BY s.position,t.position,l.position`,userId,subject.id);
 const blocks=await rows(`SELECT l.id lesson_id,b.type,b.content_json FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id JOIN topics t ON t.id=l.topic_id JOIN sections s ON s.id=t.section_id WHERE t.subject_id=? AND l.published=1 AND t.published=1 AND s.published=1`,subject.id);
 const byLesson=new Map();for(const b of blocks){const arr=byLesson.get(Number(b.lesson_id))||[];arr.push(textFrom(parse(b.content_json)));byLesson.set(Number(b.lesson_id),arr);}
 return lessons.map(l=>{const hay=[l.title,l.topic_title,l.section_title,...(byLesson.get(Number(l.id))||[])].join(' ').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');const score=terms.reduce((s,t)=>s+(hay.includes(t)?1:0),0);const first=(byLesson.get(Number(l.id))||[]).find(x=>terms.some(t=>x.toLocaleLowerCase('ru-RU').includes(t)))||'';return{lessonId:Number(l.id),lessonSlug:l.slug,title:l.title,topic:l.topic_title,section:l.section_title,progress:Number(l.progress||0),score,snippet:first.slice(0,360)};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.lessonId-b.lessonId).slice(0,20);
}

async function createChemistryTraining(userId,b){
 const subject=await row("SELECT id FROM subjects WHERE slug='chemistry'");if(!subject)throw Object.assign(new Error('Химия не найдена'),{status:404});
 const line=Number(b.examLine),info=registry.lines.find(x=>x.line===line);if(!info)throw Object.assign(new Error('Некорректный номер задания'),{status:400});
 const pattern=`chemistry-bank-${CHEMISTRY_BANK_VERSION}-line${line}-%`;
 const target=Math.min(100,Math.max(1,Number(b.targetQuestions)||10));const mode=['adaptive','new','review','mistakes','errors','hard'].includes(b.mode)?b.mode:'adaptive';
 const latest=`LEFT JOIN (SELECT * FROM (SELECT a.*,ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY id DESC) rn FROM attempts a WHERE user_id=?) z WHERE rn=1) a ON a.question_id=q.id`;
 const filter=mode==='new'?'a.id IS NULL':mode==='review'?"a.id IS NOT NULL AND a.next_review_at<=CURRENT_TIMESTAMP":['mistakes','errors'].includes(mode)?'a.id IS NOT NULL AND a.correct=FALSE':mode==='hard'?'q.difficulty>=2':'1=1';
 let ids=(await rows(`SELECT q.id FROM questions q ${latest} WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 AND q.external_key LIKE ? AND ${filter} ORDER BY CASE WHEN a.id IS NOT NULL AND a.correct=FALSE THEN 0 WHEN a.id IS NULL THEN 1 ELSE 2 END,q.difficulty,RANDOM() LIMIT ?`,userId,subject.id,line,pattern,target)).map(x=>Number(x.id));
 if(!ids.length&&mode!=='adaptive')ids=(await rows(`SELECT q.id FROM questions q WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 AND q.external_key LIKE ? ORDER BY q.difficulty,RANDOM() LIMIT ?`,subject.id,line,pattern,target)).map(x=>Number(x.id));
 if(!ids.length)throw Object.assign(new Error('Для этой линии пока нет заданий'),{status:404});
 const stored=['mistakes','errors'].includes(mode)?'mistakes':mode==='new'?'new':mode==='review'?'review':'adaptive';
 const made=await run('INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,NULL,?,?)',userId,stored,ids.length),sessionId=Number(made.lastInsertRowid);
 for(const [position,id] of ids.entries())await run('INSERT INTO training_session_questions(session_id,question_id,position,state) VALUES(?,?,?,?)',sessionId,id,position,'pending');
 return row('SELECT * FROM training_sessions WHERE id=?',sessionId);
}

async function handleChemistry(req,res,path){
 if(!path.startsWith('/api/subjects/chemistry/'))return false;
 const u=await auth(req,res);if(!u)return true;
 if(path.startsWith('/api/subjects/chemistry/mock-exams'))return chemistryMocks.handle(req,res,path,u,json,readJson);
 if(path==='/api/subjects/chemistry/exam-lines'&&req.method==='GET'){
   const payload=await chemistryLinesPayload(u.id);
   payload?json(res,200,payload):json(res,404,{error:'Химия не найдена'});return true;
 }
 let m=path.match(/^\/api\/subjects\/chemistry\/exam-lines\/(\d+)$/);if(m&&req.method==='GET'){const p=await chemistryLinePayload(Number(m[1]),u.id);p?json(res,200,{line:p}):json(res,404,{error:'Линия задания не найдена'});return true;}
 if(path==='/api/subjects/chemistry/search'&&req.method==='GET'){const q=new URL(req.url,'http://localhost').searchParams.get('q')||'';json(res,200,{hits:await searchChemistry(q,u.id)});return true;}
 if(path==='/api/subjects/chemistry/training/sessions'&&req.method==='POST'){const session=await createChemistryTraining(u.id,await readJson(req));json(res,201,{session});return true;}
 return false;
}

function proxy(req,res){const headers={...req.headers,host:`127.0.0.1:${UPSTREAM_PORT}`};const upstream=http.request({hostname:'127.0.0.1',port:UPSTREAM_PORT,path:req.url,method:req.method,headers},r=>{res.writeHead(r.statusCode||502,r.headers);r.pipe(res)});upstream.on('error',e=>{if(!res.headersSent)json(res,503,{error:'Сервер запускается',detail:e.code||'UPSTREAM'});else res.end()});req.pipe(upstream);}
function waitForUpstream(left=80){return new Promise((resolve,reject)=>{const test=n=>{const s=net.createConnection({host:'127.0.0.1',port:UPSTREAM_PORT});s.once('connect',()=>{s.destroy();resolve()});s.once('error',()=>{s.destroy();if(n<=0)reject(new Error('Admin upstream did not start'));else setTimeout(()=>test(n-1),100)});};test(left);});}
async function start(){const child=spawn(process.execPath,[join(__dirname,'server-admin.js')],{cwd:__dirname,env:{...process.env,PORT:String(UPSTREAM_PORT),INTERNAL_APP_PORT:String(UPSTREAM_PORT+1)},stdio:'inherit'});child.on('exit',code=>{if(code)console.error('admin upstream exit',code)});await waitForUpstream();const server=http.createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;try{if(await handleChemistry(req,res,path))return;proxy(req,res);}catch(e){console.error('chemistry-api',e);if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Ошибка химии'});}});server.listen(PORT,()=>console.log(`EGE platform + chemistry: http://localhost:${PORT}`));const stop=()=>{child.kill('SIGTERM');server.close(()=>process.exit(0));};process.on('SIGTERM',stop);process.on('SIGINT',stop);}
start().catch(e=>{console.error(e);process.exit(1)});
