'use strict';
const {variantQuestions,SOURCE,VARIANT_COUNT}=require('../content/chemistry/mock-variants');
const {scoreAnswer}=require('./mock-exams');
const {formatAnswerForReview}=require('./answer-review');

const CONFIG={durationSeconds:12600,sourceVersion:'Проект ФИПИ ЕГЭ-2027 / химия / ОСНОВА',variantCount:VARIANT_COUNT,defaultMode:'untimed'};
const parse=(value,fallback=[])=>{try{return value==null?fallback:typeof value==='string'?JSON.parse(value):value}catch{return fallback}};
const variantFromSeed=seed=>Math.min(CONFIG.variantCount,Math.max(1,Number(String(seed||'').match(/^variant:(\d+)/)?.[1])||1));

function createChemistryMockExamService(db,registry){
 const lineByNumber=new Map(registry.lines.map(line=>[Number(line.line),line]));
 const attemptTable='chemistry_mock_exam_attempts',itemTable='chemistry_mock_exam_items';
 const insertAttemptSql=db.dialect==='postgresql'
  ?`INSERT INTO ${attemptTable}(user_id,exam_year,source_version,mode,duration_seconds,variant_seed) VALUES(?,?,?,?,?,?) RETURNING id`
  :`INSERT INTO ${attemptTable}(user_id,exam_year,source_version,mode,duration_seconds,variant_seed) VALUES(?,?,?,?,?,?)`;

 function snapshotFor(v,line){
  return {
   questionKey:v.key,questionId:null,type:v.type,questionType:v.questionType,prompt:v.prompt,instruction:v.instruction,
   contentJson:JSON.stringify(v.content||{}),mediaJson:null,imageUrl:null,options:v.options||[],difficulty:v.difficulty,
   topic:`Задание ${v.line} ЕГЭ по химии`,lessonSlug:null,answerJson:v.answer,acceptedVariants:v.acceptedVariants||[],
   scoringMode:v.scoringMode||null,explanation:v.explanation||'',solutionSteps:v.solutionSteps||[],
   scoringPoints:v.scoringPoints||[],commonMistakes:v.commonMistakes||[],hint:v.hint||line.strategy?.[0]||'',
   strategy:line.strategy||[],lineTraps:line.commonTraps||[],maxScore:Number(v.maxScore||line.maxScore||1),
   extended:Boolean(v.manualReview||v.questionType==='extended_answer'),source:'Авторский вариант ОСНОВЫ по структуре проекта ФИПИ ЕГЭ-2027'
  };
 }

 async function finalize(attempt,status='submitted'){
  const items=await db.rows(`SELECT * FROM ${itemTable} WHERE attempt_id=? ORDER BY position`,attempt.id);let auto=0,max=0;
  for(const item of items){
   const snap=parse(item.snapshot_json,{});max+=Number(item.max_score||0);
   const score=snap.extended?null:scoreAnswer(snap,parse(item.answer_json,[]));
   if(score!==null)auto+=Number(score||0);
   await db.run(`UPDATE ${itemTable} SET auto_score=? WHERE id=?`,score,item.id);
  }
  await db.run(`UPDATE ${attemptTable} SET status=?,submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),auto_primary_score=?,primary_score_total=?,primary_score_max=? WHERE id=? AND status='in_progress'`,status,auto,auto+Number(attempt.self_primary_score||0),max,attempt.id);
 }

 async function expire(attempt){
  if(attempt.status==='in_progress'&&attempt.mode==='timed'&&Date.now()>=new Date(attempt.started_at).getTime()+Number(attempt.duration_seconds||0)*1000){
   await finalize(attempt,'expired');return db.row(`SELECT * FROM ${attemptTable} WHERE id=?`,attempt.id);
  }
  return attempt;
 }
 async function owned(id,userId){const a=await db.row(`SELECT * FROM ${attemptTable} WHERE id=? AND user_id=?`,id,userId);return a?expire(a):null;}
 function remaining(a){return a.mode==='timed'?Math.max(0,Number(a.duration_seconds)-Math.floor((Date.now()-new Date(a.started_at).getTime())/1000)):null;}

 async function create(userId,mode='untimed',variant=1){
  if(!['timed','untimed'].includes(mode))throw Object.assign(new Error('Неизвестный режим пробника'),{status:400,code:'INVALID_MODE'});
  variant=Number(variant||1);if(!Number.isInteger(variant)||variant<1||variant>CONFIG.variantCount)throw Object.assign(new Error('Неизвестный вариант пробника'),{status:400,code:'INVALID_VARIANT'});
  const selected=variantQuestions(variant),seed=`variant:${variant}:chemistry-2027-reviewed-v1`;
  return db.transaction(async tx=>{
   const made=await tx.run(insertAttemptSql,userId,registry.examYear,CONFIG.sourceVersion,mode,mode==='timed'?CONFIG.durationSeconds:null,seed),id=Number(made.lastInsertRowid);let max=0;
   if(!id)throw new Error('Не удалось создать пробник химии');
   for(const [index,v] of selected.entries()){
    const line=lineByNumber.get(Number(v.line)),snapshot=snapshotFor(v,line);max+=snapshot.maxScore;
    await tx.run(`INSERT INTO ${itemTable}(attempt_id,question_id,position,exam_line,part,answer_format,max_score,snapshot_json) VALUES(?,NULL,?,?,?,?,?,?)`,id,index+1,line.line,line.part,line.answerFormat,snapshot.maxScore,JSON.stringify(snapshot));
   }
   await tx.run(`UPDATE ${attemptTable} SET primary_score_max=? WHERE id=?`,max,id);return id;
  });
 }

 const reviewOf=s=>({answer:parse(s.answerJson),reviewAnswer:formatAnswerForReview({type:s.type,question_type:s.questionType,answer_json:s.answerJson,content_json:s.contentJson},s.options||[]),explanation:s.explanation,solutionSteps:s.solutionSteps||[],scoringPoints:s.scoringPoints||[],commonMistakes:s.commonMistakes||[],extended:Boolean(s.extended)});
 async function payload(a,reveal=false){
  const items=await db.rows(`SELECT * FROM ${itemTable} WHERE attempt_id=? ORDER BY position`,a.id);
  return {id:Number(a.id),variant:variantFromSeed(a.variant_seed),mode:a.mode,status:a.status,examYear:a.exam_year,sourceVersion:a.source_version,startedAt:a.started_at,submittedAt:a.submitted_at,durationSeconds:a.duration_seconds,remainingSeconds:remaining(a),primaryScoreMax:Number(a.primary_score_max),autoPrimaryScore:a.auto_primary_score,selfPrimaryScore:a.self_primary_score,primaryScoreTotal:a.primary_score_total,
   items:items.map(i=>{const s=parse(i.snapshot_json,{}),base={id:Number(i.id),position:Number(i.position),line:Number(i.exam_line),part:Number(i.part),answerFormat:i.answer_format,maxScore:Number(i.max_score),answer:parse(i.answer_json,[]),flagged:Boolean(i.flagged),autoScore:i.auto_score,selfScore:i.self_score,question:{type:s.type,questionType:s.questionType,prompt:s.prompt,instruction:s.instruction,contentJson:s.contentJson,mediaJson:s.mediaJson,imageUrl:s.imageUrl,options:s.options||[],topic:s.topic,difficulty:s.difficulty,source:s.source}};return reveal?{...base,review:{...reviewOf(s),givenAnswer:formatAnswerForReview({type:s.type,question_type:s.questionType,answer_json:i.answer_json,content_json:s.contentJson},s.options||[])}}:base;})};
 }
 async function history(userId){const list=await db.rows(`SELECT * FROM ${attemptTable} WHERE user_id=? ORDER BY id DESC LIMIT 30`,userId),checked=await Promise.all(list.map(expire));return checked.map(a=>({...a,variant:variantFromSeed(a.variant_seed)}));}

 async function helpFor(attempt,itemId,action='hint'){
  const item=await db.row(`SELECT * FROM ${itemTable} WHERE id=? AND attempt_id=?`,itemId,attempt.id);if(!item)throw Object.assign(new Error('Задание не входит в вариант'),{status:400});
  const s=parse(item.snapshot_json,{}),line=lineByNumber.get(Number(item.exam_line)),hint={hint:s.hint||line?.strategy?.[0]||'Запишите вещества, условия и определите проверяемую закономерность.',strategy:s.strategy?.length?s.strategy:(line?.strategy||[]),commonTraps:[...(s.lineTraps||line?.commonTraps||[]),...(s.commonMistakes||[])].filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,6)};
  if(action==='hint')return hint;const review=reviewOf(s),answer=parse(item.answer_json,[]);if(action==='reveal')return {...hint,revealed:true,review};
  if(action==='check'){if(s.extended)return {...hint,manual:true,review,message:'Развёрнутый ответ оценивается по критериям.'};if(!answer.some(v=>String(v??'').trim()))throw Object.assign(new Error('Сначала введите или выберите ответ'),{status:400});const score=scoreAnswer(s,answer);return {...hint,correct:Number(score)===Number(item.max_score),score,maxScore:Number(item.max_score),review};}
  throw Object.assign(new Error('Неизвестный тип помощи'),{status:400});
 }

 async function handle(req,res,path,user,json,body){
  const base='/api/subjects/chemistry/mock-exams';if(!path.startsWith(base))return false;const send=(status,data)=>{if(!res.headersSent)json(res,status,data);return true};
  try{
   const tail=path.slice(base.length),parts=tail.split('/').filter(Boolean),id=parts[0]&&Number(parts[0]);
   if(!parts.length&&req.method==='GET'){const attempts=await history(user.id),active=attempts.find(a=>a.status==='in_progress');return send(200,{config:{examYear:registry.examYear,sourceVersion:CONFIG.sourceVersion,durationSeconds:CONFIG.durationSeconds,lineCount:34,primaryScoreMax:56,variantCount:CONFIG.variantCount,defaultMode:CONFIG.defaultMode,sourceLabel:SOURCE},activeAttempt:active?await payload(active):null,attempts});}
   if(!parts.length&&req.method==='POST'){const b=await body(req),active=await db.row(`SELECT * FROM ${attemptTable} WHERE user_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1`,user.id);if(active&&!b.confirmNew)return send(409,{error:'Есть незавершённый пробник',code:'ACTIVE_ATTEMPT',attemptId:Number(active.id)});if(active)await finalize(await owned(active.id,user.id),'submitted');const created=await create(user.id,b.mode||CONFIG.defaultMode,b.variant||1);return send(201,{attempt:await payload(await owned(created,user.id))});}
   if(!Number.isSafeInteger(id)||id<1)return send(400,{error:'Некорректный идентификатор'});const attempt=await owned(id,user.id);if(!attempt)return send(404,{error:'Пробник не найден'});
   if(parts.length===1&&req.method==='GET')return send(200,{attempt:await payload(attempt,attempt.status!=='in_progress')});
   if(parts[1]==='answers'&&req.method==='PATCH'){if(attempt.status!=='in_progress')return send(409,{error:'Завершённый пробник нельзя изменить'});const b=await body(req),item=await db.row(`SELECT id FROM ${itemTable} WHERE id=? AND attempt_id=?`,Number(b.itemId),id);if(!item)return send(400,{error:'Задание не входит в вариант'});if(b.answer!==undefined&&!Array.isArray(b.answer))return send(400,{error:'Ответ должен быть массивом'});if(b.answer!==undefined)await db.run(`UPDATE ${itemTable} SET answer_json=?,answered_at=CURRENT_TIMESTAMP WHERE id=?`,JSON.stringify(b.answer),item.id);if(b.flagged!==undefined)await db.run(`UPDATE ${itemTable} SET flagged=? WHERE id=?`,Boolean(b.flagged),item.id);return send(200,{saved:true,savedAt:new Date().toISOString()});}
   if(parts[1]==='help'&&req.method==='POST')return send(403,{error:'Во время пробника подсказки и разбор недоступны',code:'MOCK_HELP_DISABLED'});
   if(parts[1]==='submit'&&req.method==='POST'){if(attempt.status==='in_progress')await finalize(attempt);return send(200,{attempt:await payload(await owned(id,user.id),true)});}
   if(parts[1]==='result'&&req.method==='GET'){if(attempt.status==='in_progress')return send(409,{error:'Результат доступен после сдачи'});return send(200,{attempt:await payload(attempt,true)});}
   if(parts[1]==='self-score'&&req.method==='PATCH'){if(attempt.status==='in_progress')return send(409,{error:'Самопроверка доступна после сдачи'});const b=await body(req),item=await db.row(`SELECT * FROM ${itemTable} WHERE id=? AND attempt_id=?`,Number(b.itemId),id),snap=parse(item?.snapshot_json,{}),score=Number(b.score);if(!item||!snap.extended)return send(400,{error:'Это не развёрнутый ответ'});if(!Number.isInteger(score)||score<0||score>Number(item.max_score))return send(400,{error:`Баллы должны быть от 0 до ${item.max_score}`});await db.run(`UPDATE ${itemTable} SET self_score=? WHERE id=?`,score,item.id);const sum=await db.row(`SELECT COALESCE(SUM(self_score),0) n FROM ${itemTable} WHERE attempt_id=?`,id),self=Number(sum.n||0);await db.run(`UPDATE ${attemptTable} SET self_primary_score=?,primary_score_total=COALESCE(auto_primary_score,0)+? WHERE id=?`,self,self,id);return send(200,{attempt:await payload(await owned(id,user.id),true)});}
   return send(404,{error:'Маршрут пробника не найден'});
  }catch(error){const status=Number(error.status)||500;console.error(JSON.stringify({scope:'chemistry-mock-exams',route:`${req.method} ${path}`,message:error.message,code:error.code||null}));return send(status,{error:status===500?'Не удалось обработать пробник химии. Попробуйте ещё раз.':error.message,code:error.code||'CHEM_MOCK_ERROR'});}
 }
 return {handle,create,payload,CONFIG};
}

module.exports={createChemistryMockExamService,CONFIG};