const http = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { extname, join, normalize } = require('node:path');
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { migrate, rows, row, run } = require('./src/db');
migrate();

const PORT=Number(process.env.PORT||3000), PUBLIC=join(__dirname,'public');
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const body=async req=>{let data='';for await(const chunk of req){data+=chunk;if(data.length>1e6)throw Error('Слишком большой запрос');}try{return JSON.parse(data||'{}')}catch{throw Error('Некорректный JSON')}};
const hash=p=>{const s=randomBytes(16).toString('hex');return `${s}:${scryptSync(p,s,64).toString('hex')}`};
const verify=(p,h)=>{const [s,v]=h.split(':');const a=Buffer.from(v,'hex'),b=scryptSync(p,s,64);return a.length===b.length&&timingSafeEqual(a,b)};
function userFor(req){const token=(req.headers.cookie||'').match(/(?:^|; )session=([^;]+)/)?.[1];if(!token)return null;return row("SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now')",token)||null;}
function auth(req,res,admin=false){const u=userFor(req);if(!u){json(res,401,{error:'Войдите в аккаунт'});return null}if(admin&&u.role!=='admin'){json(res,403,{error:'Недостаточно прав'});return null}return u;}
const safeUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,xp:u.xp,level:Math.floor(u.xp/500)+1});
function stats(uid){
 const total=row('SELECT COUNT(*) n, COALESCE(ROUND(AVG(correct)*100),0) accuracy FROM attempts WHERE user_id=?',uid);
 const activity=rows("SELECT day,solved FROM activity_days WHERE user_id=? ORDER BY day DESC LIMIT 30",uid);
 let streak=0,d=new Date(); const set=new Set(activity.map(a=>a.day)); while(set.has(d.toISOString().slice(0,10))){streak++;d.setUTCDate(d.getUTCDate()-1)}
 const progress=rows(`WITH RECURSIVE tree(root,id) AS (SELECT id,id FROM topics WHERE parent_id IS NULL UNION ALL SELECT tree.root,t.id FROM topics t JOIN tree ON t.parent_id=tree.id) SELECT root.id,root.slug,root.title,COALESCE(ROUND(AVG(tp.mastery)),0) mastery,COUNT(DISTINCT q.id) questions FROM topics root JOIN tree ON tree.root=root.id LEFT JOIN topic_progress tp ON tp.topic_id=tree.id AND tp.user_id=? LEFT JOIN questions q ON q.topic_id=tree.id WHERE root.parent_id IS NULL GROUP BY root.id ORDER BY root.position`,uid);
 const recent=rows(`SELECT a.correct,a.created_at,q.prompt,t.title topic FROM attempts a JOIN questions q ON q.id=a.question_id JOIN topics t ON t.id=q.topic_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT 5`,uid);
 return {solved:total.n,accuracy:total.accuracy,streak,activity,progress,recent,mastery:Math.round(progress.reduce((s,p)=>s+p.mastery,0)/(progress.length||1))};
}
const trainingModes=new Set(['adaptive','new','review','mistakes','topic']);
function questionPool(userId,topicId,mode,limit){
 const scope=`WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT t.id FROM topics t JOIN tree ON t.parent_id=tree.id),
 latest AS (SELECT a.*,ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY id DESC) rn FROM attempts a WHERE user_id=?)`;
 const filter=mode==='new'?'a.id IS NULL':mode==='review'?"a.id IS NOT NULL AND a.next_review_at<=datetime('now')":mode==='mistakes'?'a.id IS NOT NULL AND a.correct=0':'1=1';
 return rows(`${scope} SELECT q.id FROM questions q LEFT JOIN latest a ON a.question_id=q.id AND a.rn=1
   WHERE q.active=1 AND (?=0 OR q.topic_id IN tree) AND ${filter}
   ORDER BY CASE
     WHEN a.id IS NOT NULL AND a.correct=0 THEN 0
     WHEN a.id IS NOT NULL AND a.next_review_at<=datetime('now') THEN 1
     WHEN a.id IS NULL THEN 2 ELSE 3 END,
     COALESCE(a.next_review_at,'1970-01-01'),q.difficulty,RANDOM() LIMIT ?`,topicId,userId,topicId,limit).map(x=>x.id);
}
function sessionPayload(sessionId,userId){
 const session=row('SELECT * FROM training_sessions WHERE id=? AND user_id=?',sessionId,userId);
 if(!session)return null;
 const questions=rows(`SELECT tsq.position,tsq.state,tsq.attempt_id,q.id,q.type,q.prompt,q.instruction,q.content_json,q.media_json,q.difficulty,q.points,q.estimated_seconds,t.title topic
   FROM training_session_questions tsq JOIN questions q ON q.id=tsq.question_id JOIN topics t ON t.id=q.topic_id
   WHERE tsq.session_id=? ORDER BY tsq.position`,sessionId);
 return {...session,questions};
}
function recordAnswer(userId,q,b){
 const expected=JSON.parse(q.answer_json),given=Array.isArray(b.answer)?b.answer.map(String):[String(b.answer??'')],norm=a=>a.map(x=>x.trim().toLowerCase());
 const correct=q.type==='sequence'?JSON.stringify(norm(given))===JSON.stringify(norm(expected)):norm(given).sort().join('|')===norm(expected).sort().join('|');
 const previous=row('SELECT review_stage FROM attempts WHERE user_id=? AND question_id=? ORDER BY id DESC LIMIT 1',userId,q.id),stage=correct?Math.min(5,(previous?.review_stage||0)+1):0,interval=[1,2,4,7,14,30][stage];
 const xp=correct?20:5,result={correct,expected,explanation:q.explanation,xp};
 const attempt=run("INSERT INTO attempts(user_id,question_id,answer_json,correct,duration_seconds,next_review_at,interval_days,review_stage,result_json) VALUES(?,?,?,?,?,datetime('now',?),?,?,?)",userId,q.id,JSON.stringify(given),correct?1:0,Math.max(0,Number(b.duration)||0),`+${interval} days`,interval,stage,JSON.stringify(result));
 run("INSERT INTO activity_days(user_id,day,solved) VALUES(?,date('now'),1) ON CONFLICT(user_id,day) DO UPDATE SET solved=solved+1",userId);run('UPDATE users SET xp=xp+? WHERE id=?',xp,userId);
 const topicStats=row('SELECT COUNT(*) n,AVG(correct)*100 score FROM attempts a JOIN questions q ON q.id=a.question_id WHERE a.user_id=? AND q.topic_id=?',userId,q.topic_id),mastery=Math.min(100,Math.round(topicStats.score*Math.min(1,topicStats.n/5)));
 run("INSERT INTO topic_progress(user_id,topic_id,mastery) VALUES(?,?,?) ON CONFLICT(user_id,topic_id) DO UPDATE SET mastery=excluded.mastery,updated_at=CURRENT_TIMESTAMP",userId,q.topic_id,mastery);
 run(`INSERT INTO lesson_progress(user_id,lesson_id,status,questions_solved,correct_answers,last_activity_at)
   VALUES(?,?,'in_progress',1,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,lesson_id) DO UPDATE SET
   status=CASE WHEN lesson_progress.questions_solved+1>=5 THEN 'completed' ELSE 'in_progress' END,
   questions_solved=lesson_progress.questions_solved+1,correct_answers=lesson_progress.correct_answers+excluded.correct_answers,
   last_activity_at=CURRENT_TIMESTAMP,completed_at=CASE WHEN lesson_progress.questions_solved+1>=5 THEN CURRENT_TIMESTAMP ELSE completed_at END`,userId,q.topic_id,correct?1:0);
 return {...result,attemptId:Number(attempt.lastInsertRowid),nextReviewInDays:interval};
}
async function api(req,res,path){
 try{
  if(path==='/api/register'&&req.method==='POST'){const b=await body(req);if(!b.name?.trim()||!/^[^@]+@[^@]+\.[^@]+$/.test(b.email||'')||(b.password||'').length<8)return json(res,400,{error:'Укажите имя, корректную почту и пароль от 8 символов'});try{const x=run('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)',b.name.trim(),b.email.toLowerCase(),hash(b.password));return login(res,Number(x.lastInsertRowid));}catch{return json(res,409,{error:'Эта почта уже зарегистрирована'})}}
  if(path==='/api/login'&&req.method==='POST'){const b=await body(req),u=row('SELECT * FROM users WHERE email=?',(b.email||'').toLowerCase());if(!u||!verify(b.password||'',u.password_hash))return json(res,401,{error:'Неверная почта или пароль'});return login(res,u.id)}
  if(path==='/api/logout'&&req.method==='POST'){const token=(req.headers.cookie||'').match(/session=([^;]+)/)?.[1];if(token)run('DELETE FROM sessions WHERE token=?',token);res.setHeader('set-cookie','session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');return json(res,200,{ok:true})}
  if(path==='/api/me'){const u=auth(req,res);if(u)return json(res,200,{user:safeUser(u),stats:stats(u.id),examDate:process.env.EXAM_DATE||'2027-06-05'})}
  if(path==='/api/subjects'){const u=auth(req,res);if(u)return json(res,200,{subjects:rows('SELECT * FROM subjects ORDER BY id')})}
  if(path==='/api/topics'){const u=auth(req,res);if(!u)return;return json(res,200,{topics:rows(`WITH RECURSIVE descendants(root,id) AS (SELECT id,id FROM topics UNION ALL SELECT descendants.root,t.id FROM topics t JOIN descendants ON t.parent_id=descendants.id) SELECT t.*,COALESCE(ROUND(AVG(tp.mastery)),0) mastery,COUNT(DISTINCT q.id) question_count FROM topics t JOIN descendants d ON d.root=t.id LEFT JOIN topic_progress tp ON tp.topic_id=d.id AND tp.user_id=? LEFT JOIN questions q ON q.topic_id=d.id WHERE t.published=1 GROUP BY t.id ORDER BY t.position,t.id`,u.id)})}
  if(path.match(/^\/api\/topics\/\d+$/)){const u=auth(req,res);if(!u)return;const id=Number(path.split('/').pop()),topic=row(`SELECT t.*,s.title subject,COALESCE(tp.mastery,0) mastery FROM topics t JOIN subjects s ON s.id=t.subject_id LEFT JOIN topic_progress tp ON tp.topic_id=t.id AND tp.user_id=? WHERE t.id=? AND t.published=1`,u.id,id);if(!topic)return json(res,404,{error:'Тема не найдена'});const stat=row(`WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT t.id FROM topics t JOIN tree ON t.parent_id=tree.id) SELECT COUNT(*) attempted,COALESCE(SUM(correct),0) correct FROM attempts a JOIN questions q ON q.id=a.question_id WHERE a.user_id=? AND q.topic_id IN tree`,id,u.id);return json(res,200,{topic,children:rows('SELECT * FROM topics WHERE parent_id=? AND published=1 ORDER BY position',id),stat})}
  if(path==='/api/attempts'){const u=auth(req,res);if(!u)return;const url=new URL(req.url,'http://x'),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||30));return json(res,200,{attempts:rows('SELECT a.id,a.answer_json,a.correct,a.duration_seconds,a.created_at,a.next_review_at,a.interval_days,a.review_stage,a.result_json,q.prompt,q.type,t.title topic FROM attempts a JOIN questions q ON q.id=a.question_id JOIN topics t ON t.id=q.topic_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT ?',u.id,limit)})}
  if(path==='/api/skills'){const u=auth(req,res);if(!u)return;return json(res,200,{skills:rows(`SELECT s.*,COUNT(DISTINCT qs.question_id) question_count,COALESCE(ROUND(AVG(a.correct)*100),0) accuracy
    FROM skills s LEFT JOIN question_skills qs ON qs.skill_id=s.id LEFT JOIN attempts a ON a.question_id=qs.question_id AND a.user_id=? GROUP BY s.id ORDER BY s.position,s.id`,u.id)})}
  if(path==='/api/lesson-progress'){const u=auth(req,res);if(!u)return;return json(res,200,{lessons:rows('SELECT lp.*,t.title,t.slug FROM lesson_progress lp JOIN topics t ON t.id=lp.lesson_id WHERE lp.user_id=? ORDER BY lp.last_activity_at DESC',u.id)})}
  if(path.match(/^\/api\/lesson-progress\/\d+$/)&&req.method==='POST'){const u=auth(req,res);if(!u)return;const lessonId=Number(path.split('/').pop()),lesson=row("SELECT id FROM topics WHERE id=? AND kind='lesson' AND published=1",lessonId);if(!lesson)return json(res,404,{error:'Урок не найден'});const b=await body(req),theoryRead=b.theoryRead?1:0,status=b.status==='completed'?'completed':'in_progress';run(`INSERT INTO lesson_progress(user_id,lesson_id,status,theory_read,last_activity_at,completed_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP END)
    ON CONFLICT(user_id,lesson_id) DO UPDATE SET status=excluded.status,theory_read=MAX(lesson_progress.theory_read,excluded.theory_read),last_activity_at=CURRENT_TIMESTAMP,completed_at=CASE WHEN excluded.status='completed' THEN CURRENT_TIMESTAMP ELSE lesson_progress.completed_at END`,u.id,lessonId,status,theoryRead,status);return json(res,200,{progress:row('SELECT * FROM lesson_progress WHERE user_id=? AND lesson_id=?',u.id,lessonId)})}
  if(path==='/api/training/sessions'&&req.method==='POST'){
   const u=auth(req,res);if(!u)return;const b=await body(req),mode=trainingModes.has(b.mode)?b.mode:'adaptive',topicId=Math.max(0,Number(b.topicId)||0),target=Math.min(100,Math.max(1,Number(b.targetQuestions)||10));
   let ids=questionPool(u.id,topicId,mode,target);if(!ids.length&&mode!=='adaptive')ids=questionPool(u.id,topicId,'adaptive',target);
   if(!ids.length)return json(res,404,{error:'Для выбранной тренировки пока нет заданий'});
   const created=run('INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,?,?,?)',u.id,topicId||null,mode,target),sessionId=Number(created.lastInsertRowid);
   ids.forEach((id,position)=>run('INSERT INTO training_session_questions(session_id,question_id,position) VALUES(?,?,?)',sessionId,id,position));
   return json(res,201,{session:sessionPayload(sessionId,u.id)});
  }
  if(path==='/api/training/sessions/current'){const u=auth(req,res);if(!u)return;const active=row("SELECT id FROM training_sessions WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1",u.id);return json(res,200,{session:active?sessionPayload(active.id,u.id):null})}
  if(path.match(/^\/api\/training\/sessions\/\d+$/)&&req.method==='GET'){const u=auth(req,res);if(!u)return;const session=sessionPayload(Number(path.split('/').pop()),u.id);return session?json(res,200,{session}):json(res,404,{error:'Тренировка не найдена'})}
  if(path.match(/^\/api\/training\/sessions\/\d+\/next$/)&&req.method==='GET'){
   const u=auth(req,res);if(!u)return;const id=Number(path.split('/')[4]),session=row("SELECT * FROM training_sessions WHERE id=? AND user_id=? AND status='active'",id,u.id);if(!session)return json(res,404,{error:'Активная тренировка не найдена'});
   const item=row(`SELECT tsq.position,q.* FROM training_session_questions tsq JOIN questions q ON q.id=tsq.question_id WHERE tsq.session_id=? AND tsq.state='pending' ORDER BY tsq.position LIMIT 1`,id);
   if(!item){run("UPDATE training_sessions SET status='completed',finished_at=CURRENT_TIMESTAMP WHERE id=?",id);return json(res,200,{done:true,session:sessionPayload(id,u.id)})}
   run("UPDATE training_session_questions SET presented_at=COALESCE(presented_at,CURRENT_TIMESTAMP) WHERE session_id=? AND position=?",id,item.position);delete item.answer_json;
   return json(res,200,{session:{id,mode:session.mode,answeredCount:session.answered_count,targetQuestions:session.target_questions},question:item,options:rows('SELECT value,label FROM question_options WHERE question_id=? ORDER BY position',item.id)})
  }
  if(path.match(/^\/api\/training\/sessions\/\d+\/answer$/)&&req.method==='POST'){
   const u=auth(req,res);if(!u)return;const id=Number(path.split('/')[4]),b=await body(req),item=row(`SELECT tsq.position,tsq.state,q.* FROM training_session_questions tsq JOIN training_sessions s ON s.id=tsq.session_id JOIN questions q ON q.id=tsq.question_id WHERE s.id=? AND s.user_id=? AND s.status='active' AND q.id=?`,id,u.id,Number(b.questionId));
   if(!item||item.state!=='pending')return json(res,409,{error:'Задание уже отвечено или не входит в тренировку'});const result=recordAnswer(u.id,item,b);
   run("UPDATE training_session_questions SET state='answered',attempt_id=?,answered_at=CURRENT_TIMESTAMP WHERE session_id=? AND position=?",result.attemptId,id,item.position);
   run('UPDATE training_sessions SET answered_count=answered_count+1,correct_count=correct_count+? WHERE id=?',result.correct?1:0,id);
   const left=row("SELECT COUNT(*) n FROM training_session_questions WHERE session_id=? AND state='pending'",id).n;if(!left)run("UPDATE training_sessions SET status='completed',finished_at=CURRENT_TIMESTAMP WHERE id=?",id);
   return json(res,200,{...result,done:!left,session:sessionPayload(id,u.id),stats:stats(u.id)});
  }
  if(path.match(/^\/api\/training\/sessions\/\d+\/finish$/)&&req.method==='POST'){const u=auth(req,res);if(!u)return;const id=Number(path.split('/')[4]);run("UPDATE training_sessions SET status=CASE WHEN answered_count>=target_questions THEN 'completed' ELSE 'abandoned' END,finished_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='active'",id,u.id);const session=sessionPayload(id,u.id);return session?json(res,200,{session}):json(res,404,{error:'Тренировка не найдена'})}
  if(path.match(/^\/api\/training\/result\/\d+$/)){const u=auth(req,res);if(!u)return;const id=Number(path.split('/').pop()),result=row('SELECT a.id,a.answer_json,a.correct,a.duration_seconds,a.created_at,a.next_review_at,a.interval_days,a.review_stage,a.result_json,q.prompt,q.explanation,q.answer_json expected_json,t.title topic FROM attempts a JOIN questions q ON q.id=a.question_id JOIN topics t ON t.id=q.topic_id WHERE a.id=? AND a.user_id=?',id,u.id);return result?json(res,200,{result}):json(res,404,{error:'Результат не найден'})}
  if(path==='/api/training/next'){const u=auth(req,res);if(!u)return;const url=new URL(req.url,'http://x'),topic=Number(url.searchParams.get('topic'));let q=row(`WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT t.id FROM topics t JOIN tree ON t.parent_id=tree.id), last_attempt AS (SELECT a.*,ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY id DESC) rn FROM attempts a WHERE user_id=?) SELECT q.* FROM questions q LEFT JOIN last_attempt a ON a.question_id=q.id AND a.rn=1 WHERE q.active=1 AND (?=0 OR q.topic_id IN tree) AND (a.id IS NULL OR a.next_review_at<=datetime('now')) ORDER BY CASE WHEN a.id IS NULL THEN 0 ELSE 1 END,a.next_review_at,q.difficulty,RANDOM() LIMIT 1`,topic,u.id,topic);if(!q)q=row(`WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT t.id FROM topics t JOIN tree ON t.parent_id=tree.id) SELECT q.* FROM questions q WHERE q.active=1 AND (?=0 OR q.topic_id IN tree) ORDER BY RANDOM() LIMIT 1`,topic,topic);if(!q)return json(res,404,{error:'Для этой темы пока нет заданий'});delete q.answer_json;return json(res,200,{question:q,options:rows('SELECT value,label FROM question_options WHERE question_id=? ORDER BY position',q.id)})}
  if(path==='/api/training/answer'&&req.method==='POST'){
   const u=auth(req,res);if(!u)return;const b=await body(req),q=row('SELECT * FROM questions WHERE id=? AND active=1',Number(b.questionId));if(!q)return json(res,404,{error:'Задание не найдено'});
   return json(res,200,{...recordAnswer(u.id,q,b),stats:stats(u.id)});
  }
  if(path==='/api/admin/stats'){const u=auth(req,res,true);if(u)return json(res,200,{users:rows(`SELECT u.id,u.name,u.email,u.xp,COUNT(a.id) solved,COALESCE(ROUND(AVG(a.correct)*100),0) accuracy FROM users u LEFT JOIN attempts a ON a.user_id=u.id WHERE u.role='student' GROUP BY u.id ORDER BY solved DESC`),counts:row('SELECT (SELECT COUNT(*) FROM users WHERE role="student") students,(SELECT COUNT(*) FROM questions) questions,(SELECT COUNT(*) FROM attempts) attempts')})}
  if(path==='/api/admin/questions'&&req.method==='GET'){const u=auth(req,res,true);if(u)return json(res,200,{questions:rows('SELECT q.id,q.prompt,q.type,q.difficulty,q.active,t.title topic FROM questions q JOIN topics t ON t.id=q.topic_id ORDER BY q.id DESC')})}
  if(path==='/api/admin/questions'&&req.method==='POST'){const u=auth(req,res,true);if(!u)return;const b=await body(req);if(!b.prompt||!b.explanation||!Array.isArray(b.answer)||!b.topicId)return json(res,400,{error:'Заполните обязательные поля'});const x=run('INSERT INTO questions(topic_id,type,prompt,explanation,difficulty,answer_json) VALUES(?,?,?,?,?,?)',b.topicId,b.type||'single',b.prompt,b.explanation,Math.min(3,Math.max(1,Number(b.difficulty)||1)),JSON.stringify(b.answer));(b.options||[]).forEach((label,i)=>run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',Number(x.lastInsertRowid),String(i),label,i));return json(res,201,{id:Number(x.lastInsertRowid)})}
  if(path.match(/^\/api\/admin\/questions\/\d+$/)&&req.method==='DELETE'){const u=auth(req,res,true);if(u){run('DELETE FROM questions WHERE id=?',Number(path.split('/').pop()));return json(res,200,{ok:true})}}
  json(res,404,{error:'Маршрут не найден'});
 }catch(e){console.error(e);json(res,500,{error:'Внутренняя ошибка сервера'})}
}
function login(res,userId){const token=randomBytes(32).toString('hex');run("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))",token,userId);res.setHeader('set-cookie',`session=${token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${process.env.NODE_ENV==='production'?'; Secure':''}`);json(res,200,{ok:true});}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
http.createServer((req,res)=>{const path=new URL(req.url,'http://x').pathname;if(path.startsWith('/api/'))return api(req,res,path);let file=normalize(join(PUBLIC,path==='/'?'index.html':path));if(!file.startsWith(PUBLIC)||!existsSync(file))file=join(PUBLIC,'index.html');res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(readFileSync(file));}).listen(PORT,()=>console.log(`EGE Platform: http://localhost:${PORT}`));
