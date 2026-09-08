'use strict';

const http=require('node:http');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {join}=require('node:path');
const database=require('./src/db');
const planner=require('./src/ai-study-planner');
const {row,run}=database;

const PORT=Number(process.env.PORT||3000);
const UPSTREAM_PORT=Number(process.env.AI_PRO_UPSTREAM_PORT||(PORT+1));

const json=(res,status,data)=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
 res.end(JSON.stringify(data));
};

async function readJson(req){
 let data='';for await(const chunk of req){data+=chunk;if(data.length>256*1024)throw Object.assign(new Error('Слишком большой запрос'),{status:413});}
 try{return JSON.parse(data||'{}')}catch{throw Object.assign(new Error('Некорректный JSON'),{status:400});}
}

async function userFor(req){
 const token=(req.headers.cookie||'').match(/(?:^|; )session=([^;]+)/)?.[1];
 if(!token)return null;
 return row('SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',token);
}
async function auth(req,res){const user=await userFor(req);if(!user){json(res,401,{error:'Войдите в аккаунт'});return null;}return user;}

async function saveDiagnosticSession(userId,ids){
 const created=await run('INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,?,?,?)',userId,null,'adaptive',ids.length);
 const sessionId=Number(created.lastInsertRowid);
 for(const [position,questionId] of ids.entries())await run('INSERT INTO training_session_questions(session_id,question_id,position,state) VALUES(?,?,?,?)',sessionId,questionId,position,'pending');
 return row('SELECT * FROM training_sessions WHERE id=?',sessionId);
}

async function handleApi(req,res,url){
 const path=url.pathname;
 if(!path.startsWith('/api/ai-pro/'))return false;
 const user=await auth(req,res);if(!user)return true;
 if(path==='/api/ai-pro/plan'&&req.method==='GET'){
  const subjectSlug=String(url.searchParams.get('subject')||'biology');
  const plan=await planner.loadPlan(database,user.id,subjectSlug);
  json(res,200,{plan,openBeta:true,paidFeature:true});return true;
 }
 if(path==='/api/ai-pro/plan'&&req.method==='POST'){
  const body=await readJson(req);
  const plan=await planner.buildPlan(database,user.id,body);
  json(res,200,{plan,openBeta:true,paidFeature:true});return true;
 }
 if(path==='/api/ai-pro/diagnostic'&&req.method==='POST'){
  const body=await readJson(req),subjectSlug=String(body.subjectSlug||'');
  const ids=await planner.diagnosticQuestionIds(database,user.id,subjectSlug,Number(body.count)||24);
  if(ids.length<10)throw Object.assign(new Error('Недостаточно заданий для диагностики'),{status:409});
  const session=await saveDiagnosticSession(user.id,ids);
  json(res,201,{session,questionCount:ids.length,subjectSlug});return true;
 }
 json(res,404,{error:'AI PRO endpoint не найден'});return true;
}

function proxy(req,res){
 const headers={...req.headers,host:`127.0.0.1:${UPSTREAM_PORT}`};
 const upstream=http.request({hostname:'127.0.0.1',port:UPSTREAM_PORT,path:req.url,method:req.method,headers},upstreamResponse=>{
  res.writeHead(upstreamResponse.statusCode||502,upstreamResponse.headers);upstreamResponse.pipe(res);
 });
 upstream.on('error',error=>{if(!res.headersSent)json(res,503,{error:'Сервис временно запускается'});else res.end();console.warn('ai-pro-upstream-error',error?.code||'UNKNOWN');});
 req.pipe(upstream);
}

function waitForUpstream(left=180){return new Promise((resolve,reject)=>{const test=n=>{const socket=net.createConnection({host:'127.0.0.1',port:UPSTREAM_PORT});socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',()=>{socket.destroy();if(n<=0)reject(new Error('AI PRO upstream did not start'));else setTimeout(()=>test(n-1),100);});};test(left);});}

async function start(){
 const child=spawn(process.execPath,[join(__dirname,'server-training-router.js')],{cwd:__dirname,env:{...process.env,PORT:String(UPSTREAM_PORT),TRAINING_UPSTREAM_PORT:String(UPSTREAM_PORT+1)},stdio:'inherit'});
 child.on('exit',code=>{if(code)console.error('ai-pro upstream exit',code);});
 await waitForUpstream();
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  try{if(await handleApi(req,res,url))return;proxy(req,res);}catch(error){console.error('ai-pro-api',error);if(!res.headersSent)json(res,error?.status||500,{error:error?.status?error.message:'Не удалось построить персональный план'});}
 });
 server.listen(PORT,()=>console.log(`EGE platform + AI PRO: http://localhost:${PORT}`));
 const stop=()=>{child.kill('SIGTERM');server.close(()=>process.exit(0));};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}

start().catch(error=>{console.error(error);process.exit(1);});
