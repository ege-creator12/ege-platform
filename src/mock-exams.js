const { randomBytes, createHash } = require('node:crypto');

const CONFIG={durationSeconds:Number(process.env.BIOLOGY_MOCK_DURATION_SECONDS)||12600,sourceVersion:'Проект ФИПИ ЕГЭ-2027 / конфигурация платформы'};
const parse=(value,fallback=[])=>{try{return value==null?fallback:typeof value==='string'?JSON.parse(value):value}catch{return fallback}};
const normalize=value=>String(value??'').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ');
const hashNumber=text=>Number.parseInt(createHash('sha256').update(text).digest('hex').slice(0,12),16);
const extended=q=>q.question_type==='extended_answer';

function scoreAnswer(snapshot,answer){
 const expected=parse(snapshot.answerJson),given=Array.isArray(answer)?answer:[answer];
 const a=given.map(normalize).filter(Boolean),e=(Array.isArray(expected)?expected:[expected]).map(normalize);
 if(!a.length)return 0;
 if(snapshot.type==='matching'||snapshot.type==='sequence'){
  let hits=0;for(let i=0;i<e.length;i++)if(a[i]===e[i])hits++;
  return Math.min(snapshot.maxScore,Math.floor(hits/Math.max(1,e.length)*snapshot.maxScore));
 }
 const exact=snapshot.type==='multiple'?[...a].sort().join('|')===[...e].sort().join('|'):a.join('|')===e.join('|');
 return exact?snapshot.maxScore:0;
}

function createMockExamService(db,registry){
 async function expire(attempt){
  if(attempt.status==='in_progress'&&attempt.mode==='timed'&&Date.now()>=new Date(attempt.started_at).getTime()+attempt.duration_seconds*1000){await finalize(attempt,'expired');return db.row('SELECT * FROM biology_mock_exam_attempts WHERE id=?',attempt.id)}return attempt;
 }
 async function finalize(attempt,status='submitted'){
  const items=await db.rows('SELECT * FROM biology_mock_exam_items WHERE attempt_id=? ORDER BY position',attempt.id);let auto=0,max=0;
  for(const item of items){const snap=parse(item.snapshot_json,{});max+=item.max_score;const score=snap.extended?null:scoreAnswer(snap,parse(item.answer_json,[]));if(score!==null)auto+=score;await db.run('UPDATE biology_mock_exam_items SET auto_score=? WHERE id=?',score,item.id)}
  await db.run("UPDATE biology_mock_exam_attempts SET status=?,submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),auto_primary_score=?,primary_score_total=?,primary_score_max=? WHERE id=? AND status='in_progress'",status,auto,auto+Number(attempt.self_primary_score||0),max,attempt.id);
 }
 async function owned(id,userId){let a=await db.row('SELECT * FROM biology_mock_exam_attempts WHERE id=? AND user_id=?',id,userId);return a?expire(a):null}
 async function create(userId,mode='timed'){
  if(!['timed','untimed'].includes(mode))throw Object.assign(new Error('Неизвестный режим пробника'),{status:400,code:'INVALID_MODE'});
  const seed=randomBytes(12).toString('hex'),subject=await db.row("SELECT id FROM subjects WHERE slug='biology'");
  const recent=await db.rows("SELECT mi.question_id FROM biology_mock_exam_items mi JOIN biology_mock_exam_attempts ma ON ma.id=mi.attempt_id WHERE ma.user_id=? ORDER BY ma.id DESC LIMIT 112",userId),recentIds=new Set(recent.map(x=>Number(x.question_id)));
  const selected=[];
  for(const line of registry.lines){const pool=await db.rows("SELECT q.*,t.title topic,l.slug lesson_slug FROM questions q JOIN topics t ON t.id=q.topic_id LEFT JOIN lessons l ON l.id=q.lesson_id WHERE q.subject_id=? AND q.active=1 AND q.exam_line=? AND q.answer_json IS NOT NULL ORDER BY q.id",subject.id,line.line);if(!pool.length)throw Object.assign(new Error(`Нет пригодных заданий для линии ${line.line}`),{status:409,code:'INCOMPLETE_BANK'});const ranked=pool.map(q=>({q,key:(recentIds.has(Number(q.id))?1e15:0)+Math.abs((q.difficulty||1)-2)*1e12+hashNumber(`${seed}:${q.external_key||q.id}`)})).sort((a,b)=>a.key-b.key);selected.push({line,q:ranked[0].q})}
  return db.transaction(async tx=>{const made=await tx.run('INSERT INTO biology_mock_exam_attempts(user_id,exam_year,source_version,mode,duration_seconds,variant_seed) VALUES(?,?,?,?,?,?)',userId,registry.examYear,CONFIG.sourceVersion,mode,mode==='timed'?CONFIG.durationSeconds:null,seed),id=Number(made.lastInsertRowid);let max=0;
   for(const [index,{line,q}] of selected.entries()){const options=await tx.rows('SELECT value,label FROM question_options WHERE question_id=? ORDER BY position',q.id),explanationData=parse(q.explanation_json,{}),snapshot={questionKey:q.external_key,questionId:Number(q.id),type:q.type,questionType:q.question_type||q.type,prompt:q.prompt,instruction:q.instruction,contentJson:q.content_json,mediaJson:q.media_json,imageUrl:q.image_url,options,difficulty:q.difficulty,topic:q.topic,lessonSlug:q.lesson_slug,answerJson:q.answer_json,explanation:q.explanation,solutionSteps:parse(q.solution_steps_json),scoringPoints:explanationData.scoringPoints||[],commonMistakes:explanationData.commonMistakes||[],maxScore:Number(q.max_score||q.points||1),extended:extended(q)};max+=snapshot.maxScore;await tx.run('INSERT INTO biology_mock_exam_items(attempt_id,question_id,position,exam_line,part,answer_format,max_score,snapshot_json) VALUES(?,?,?,?,?,?,?,?)',id,q.id,index+1,line.line,line.part,line.answerFormat,snapshot.maxScore,JSON.stringify(snapshot))}
   await tx.run('UPDATE biology_mock_exam_attempts SET primary_score_max=? WHERE id=?',max,id);return id});
 }
 function remaining(a){return a.mode==='timed'?Math.max(0,a.duration_seconds-Math.floor((Date.now()-new Date(a.started_at).getTime())/1000)):null}
 async function payload(a,reveal=false){const items=await db.rows('SELECT * FROM biology_mock_exam_items WHERE attempt_id=? ORDER BY position',a.id);return {id:Number(a.id),mode:a.mode,status:a.status,examYear:a.exam_year,sourceVersion:a.source_version,startedAt:a.started_at,submittedAt:a.submitted_at,durationSeconds:a.duration_seconds,remainingSeconds:remaining(a),primaryScoreMax:Number(a.primary_score_max),items:items.map(i=>{const s=parse(i.snapshot_json,{}),base={id:Number(i.id),position:i.position,line:i.exam_line,part:i.part,answerFormat:i.answer_format,maxScore:i.max_score,answer:parse(i.answer_json,[]),flagged:Boolean(i.flagged),autoScore:i.auto_score,selfScore:i.self_score,question:{type:s.type,questionType:s.questionType,prompt:s.prompt,instruction:s.instruction,contentJson:s.contentJson,mediaJson:s.mediaJson,imageUrl:s.imageUrl,options:s.options,topic:s.topic}};if(reveal)return {...base,review:{answer:parse(s.answerJson),explanation:s.explanation,solutionSteps:s.solutionSteps,scoringPoints:s.scoringPoints,commonMistakes:s.commonMistakes,lessonSlug:s.lessonSlug,extended:s.extended}};return base})}}
 async function history(userId){const list=await db.rows("SELECT id,mode,status,started_at,submitted_at,duration_seconds,auto_primary_score,self_primary_score,primary_score_total,primary_score_max FROM biology_mock_exam_attempts WHERE user_id=? ORDER BY id DESC LIMIT 30",userId);return Promise.all(list.map(expire))}
 async function handle(req,res,path,user,json,body){
  const base='/api/subjects/biology/mock-exams';if(!path.startsWith(base))return false;
  const send=(status,data)=>{json(res,status,data);return true};const tail=path.slice(base.length),parts=tail.split('/').filter(Boolean),id=parts[0]&&Number(parts[0]);
  if(!parts.length&&req.method==='GET'){const attempts=await history(user.id),active=attempts.find(a=>a.status==='in_progress');return send(200,{config:{examYear:registry.examYear,sourceVersion:CONFIG.sourceVersion,durationSeconds:CONFIG.durationSeconds,lineCount:registry.lines.length},activeAttempt:active?await payload(active):null,attempts})}
  if(!parts.length&&req.method==='POST'){const b=await body(req),active=await db.row("SELECT id FROM biology_mock_exam_attempts WHERE user_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1",user.id);if(active&&!b.confirmNew)return send(409,{error:'Есть незавершённый пробник',code:'ACTIVE_ATTEMPT',attemptId:Number(active.id)});if(active)await finalize(await owned(active.id,user.id),'submitted');const created=await create(user.id,b.mode);return send(201,{attempt:await payload(await owned(created,user.id))})}
  if(!Number.isSafeInteger(id)||id<1)return send(400,{error:'Некорректный идентификатор'});const attempt=await owned(id,user.id);if(!attempt)return send(404,{error:'Пробник не найден'});
  if(parts.length===1&&req.method==='GET')return send(200,{attempt:await payload(attempt,attempt.status!=='in_progress')});
  if(parts[1]==='answers'&&req.method==='PATCH'){if(attempt.status!=='in_progress')return send(409,{error:'Завершённый пробник нельзя изменить',code:'ATTEMPT_IMMUTABLE'});const b=await body(req),itemId=Number(b.itemId),item=await db.row('SELECT id FROM biology_mock_exam_items WHERE id=? AND attempt_id=?',itemId,id);if(!item)return send(400,{error:'Задание не входит в вариант'});if(b.answer!==undefined&&!Array.isArray(b.answer))return send(400,{error:'Ответ должен быть массивом'});await db.run('UPDATE biology_mock_exam_items SET answer_json=COALESCE(?,answer_json),flagged=COALESCE(?,flagged),answered_at=CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE answered_at END WHERE id=?',b.answer===undefined?null:JSON.stringify(b.answer),b.flagged===undefined?null:Boolean(b.flagged),b.answer===undefined?null:1,itemId);return send(200,{saved:true,savedAt:new Date().toISOString()})}
  if(parts[1]==='submit'&&req.method==='POST'){if(attempt.status==='in_progress')await finalize(attempt);return send(200,{attempt:await payload(await owned(id,user.id),true)})}
  if(parts[1]==='result'&&req.method==='GET'){if(attempt.status==='in_progress')return send(409,{error:'Результат доступен после сдачи'});return send(200,{attempt:await payload(attempt,true)})}
  if(parts[1]==='self-score'&&req.method==='PATCH'){if(attempt.status==='in_progress')return send(409,{error:'Самопроверка доступна после сдачи'});const b=await body(req),item=await db.row('SELECT * FROM biology_mock_exam_items WHERE id=? AND attempt_id=?',Number(b.itemId),id),snap=parse(item?.snapshot_json,{}),score=Number(b.score);if(!item||!snap.extended)return send(400,{error:'Это не развёрнутый ответ'});if(!Number.isInteger(score)||score<0||score>item.max_score)return send(400,{error:`Баллы должны быть от 0 до ${item.max_score}`});await db.run('UPDATE biology_mock_exam_items SET self_score=? WHERE id=?',score,item.id);const sum=await db.row('SELECT COALESCE(SUM(self_score),0) n FROM biology_mock_exam_items WHERE attempt_id=?',id);await db.run('UPDATE biology_mock_exam_attempts SET self_primary_score=?,primary_score_total=auto_primary_score+? WHERE id=?',Number(sum.n),Number(sum.n),id);return send(200,{attempt:await payload(await owned(id,user.id),true)})}
  return send(404,{error:'Маршрут пробника не найден'});
 }
 return {handle,create,payload,scoreAnswer,CONFIG};
}
module.exports={createMockExamService,scoreAnswer,CONFIG};
