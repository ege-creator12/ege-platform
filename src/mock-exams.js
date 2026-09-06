const { createHash } = require('node:crypto');

const CONFIG={
  durationSeconds:null,
  variantCount:3,
  sourceVersion:'Проект ФИПИ ЕГЭ-2027 / конфигурация платформы'
};
const parse=(value,fallback=[])=>{try{return value==null?fallback:typeof value==='string'?JSON.parse(value):value}catch{return fallback}};
const normalize=value=>String(value??'').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ');
const hashNumber=text=>Number.parseInt(createHash('sha256').update(text).digest('hex').slice(0,12),16);
const extended=q=>q.question_type==='extended_answer';
const variantSeed=n=>`biology-ege-2027-v${n}`;
const variantFromSeed=seed=>{const m=String(seed||'').match(/^biology-ege-2027-v([1-9]\d*)$/);return m?Number(m[1]):null};

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

function isMockEligible(q){
  const prompt=normalize(q.prompt);
  if(!prompt)return false;
  const junk=[
    /что сделать перед ответом по теме/,
    /какой шаг сделать перед ответом по теме/,
    /какой принцип использовать перед ответом по теме/,
    /перед ответом по теме «?.+»? следует/,
  ];
  return !junk.some(re=>re.test(prompt));
}

function makeSnapshot(q,options){
  const explanationData=parse(q.explanation_json,{});
  return {
    questionKey:q.external_key,
    questionId:Number(q.id),
    type:q.type,
    questionType:q.question_type||q.type,
    prompt:q.prompt,
    instruction:q.instruction,
    contentJson:q.content_json,
    mediaJson:q.media_json,
    imageUrl:q.image_url,
    options,
    difficulty:q.difficulty,
    topic:q.topic,
    lessonSlug:q.lesson_slug,
    answerJson:q.answer_json,
    explanation:q.explanation,
    solutionSteps:parse(q.solution_steps_json),
    scoringPoints:explanationData.scoringPoints||[],
    commonMistakes:explanationData.commonMistakes||[],
    maxScore:Number(q.max_score||q.points||1),
    extended:extended(q),
    help:{hintCount:0,revealed:false,checkCorrect:null,checkedAt:null}
  };
}

function safeHint(snapshot,lineInfo,index=0){
  const strategies=Array.isArray(lineInfo?.strategy)?lineInfo.strategy.filter(Boolean):[];
  if(strategies.length)return strategies[Math.min(index,strategies.length-1)];
  if(snapshot.extended)return 'Разбейте ответ на короткие причинно-следственные пункты: факт → механизм → следствие.';
  if(snapshot.type==='matching')return 'Начните с самой очевидной пары, затем исключайте уже использованные варианты.';
  if(snapshot.type==='sequence')return 'Определите первый и последний этапы, затем восстановите промежуточные по причинной связи.';
  if(snapshot.type==='multiple')return 'Проверяйте каждый вариант отдельно по условию, а не выбирайте по общему впечатлению.';
  return 'Вернитесь к ключевым словам условия, определите проверяемый процесс и только потом формулируйте ответ.';
}

function createMockExamService(db,registry){
  async function subjectId(){const subject=await db.row("SELECT id FROM subjects WHERE slug='biology'");if(!subject)throw Object.assign(new Error('Биология не найдена'),{status:500});return subject.id}

  async function selectVariant(number=1){
    const variant=Math.max(1,Math.min(CONFIG.variantCount,Number(number)||1));
    const sid=await subjectId(),selected=[];
    for(const line of registry.lines){
      const pool=await db.rows("SELECT q.*,t.title topic,l.slug lesson_slug FROM questions q JOIN topics t ON t.id=q.topic_id LEFT JOIN lessons l ON l.id=q.lesson_id WHERE q.subject_id=? AND q.active=1 AND q.exam_line=? AND q.answer_json IS NOT NULL ORDER BY q.id",sid,line.line);
      const eligible=pool.filter(isMockEligible);
      if(!eligible.length)throw Object.assign(new Error(`Нет пригодных заданий для линии ${line.line}`),{status:409,code:'INCOMPLETE_BANK'});
      const refs=new Set(Array.isArray(line.questionRefs)?line.questionRefs:[]);
      const curated=eligible.filter(q=>refs.has(q.external_key));
      const source=curated.length?curated:eligible;
      const ordered=[...source].sort((a,b)=>hashNumber(`${line.line}:${a.external_key||a.id}`)-hashNumber(`${line.line}:${b.external_key||b.id}`));
      selected.push({line,q:ordered[(variant-1)%ordered.length]});
    }
    return selected;
  }

  async function writeVariantItems(tx,id,number){
    const selected=await selectVariant(number);let max=0;
    for(const [index,{line,q}] of selected.entries()){
      const options=await tx.rows('SELECT value,label FROM question_options WHERE question_id=? ORDER BY position',q.id),snapshot=makeSnapshot(q,options);
      max+=snapshot.maxScore;
      await tx.run('INSERT INTO biology_mock_exam_items(attempt_id,question_id,position,exam_line,part,answer_format,max_score,snapshot_json) VALUES(?,?,?,?,?,?,?,?)',id,q.id,index+1,line.line,line.part,line.answerFormat,snapshot.maxScore,JSON.stringify(snapshot));
    }
    await tx.run('UPDATE biology_mock_exam_attempts SET primary_score_max=? WHERE id=?',max,id);
    return max;
  }

  async function rebuildLegacyAttempt(attempt,number=1){
    const variant=Math.max(1,Math.min(CONFIG.variantCount,Number(number)||1));
    await db.transaction(async tx=>{
      await tx.run('DELETE FROM biology_mock_exam_items WHERE attempt_id=?',attempt.id);
      await tx.run("UPDATE biology_mock_exam_attempts SET mode='untimed',duration_seconds=NULL,variant_seed=?,auto_primary_score=NULL,self_primary_score=0,primary_score_total=NULL,submitted_at=NULL,status='in_progress' WHERE id=?",variantSeed(variant),attempt.id);
      await writeVariantItems(tx,attempt.id,variant);
    });
  }

  async function normalizeActive(attempt){
    if(!attempt||attempt.status!=='in_progress')return attempt;
    const variant=variantFromSeed(attempt.variant_seed);
    if(!variant){await rebuildLegacyAttempt(attempt,1);return db.row('SELECT * FROM biology_mock_exam_attempts WHERE id=?',attempt.id)}
    if(attempt.mode!=='untimed'||attempt.duration_seconds!=null){await db.run("UPDATE biology_mock_exam_attempts SET mode='untimed',duration_seconds=NULL WHERE id=?",attempt.id);return db.row('SELECT * FROM biology_mock_exam_attempts WHERE id=?',attempt.id)}
    return attempt;
  }

  async function finalize(attempt,status='submitted'){
    const items=await db.rows('SELECT * FROM biology_mock_exam_items WHERE attempt_id=? ORDER BY position',attempt.id);let auto=0,max=0;
    for(const item of items){
      const snap=parse(item.snapshot_json,{}),revealed=Boolean(snap.help?.revealed);max+=item.max_score;
      const score=revealed?0:(snap.extended?null:scoreAnswer(snap,parse(item.answer_json,[])));
      if(score!==null)auto+=score;
      await db.run('UPDATE biology_mock_exam_items SET auto_score=?,self_score=CASE WHEN ? THEN 0 ELSE self_score END WHERE id=?',score,revealed,item.id);
    }
    await db.run("UPDATE biology_mock_exam_attempts SET status=?,submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),auto_primary_score=?,primary_score_total=?,primary_score_max=? WHERE id=? AND status='in_progress'",status,auto,auto,max,attempt.id);
  }

  async function owned(id,userId){
    let attempt=await db.row('SELECT * FROM biology_mock_exam_attempts WHERE id=? AND user_id=?',id,userId);
    if(attempt)attempt=await normalizeActive(attempt);
    return attempt;
  }

  async function create(userId,mode='untimed',variant=1){
    const number=Number(variant);
    if(!Number.isInteger(number)||number<1||number>CONFIG.variantCount)throw Object.assign(new Error('Неизвестный вариант пробника'),{status:400,code:'INVALID_VARIANT'});
    const seed=variantSeed(number);
    return db.transaction(async tx=>{
      const made=await tx.run('INSERT INTO biology_mock_exam_attempts(user_id,exam_year,source_version,mode,duration_seconds,variant_seed) VALUES(?,?,?,?,?,?)',userId,registry.examYear,CONFIG.sourceVersion,'untimed',null,seed),id=Number(made.lastInsertRowid);
      await writeVariantItems(tx,id,number);
      return id;
    });
  }

  async function payload(a,reveal=false){
    const items=await db.rows('SELECT * FROM biology_mock_exam_items WHERE attempt_id=? ORDER BY position',a.id),variantNumber=variantFromSeed(a.variant_seed)||1;
    return {id:Number(a.id),variantNumber,mode:'untimed',status:a.status,examYear:a.exam_year,sourceVersion:a.source_version,startedAt:a.started_at,submittedAt:a.submitted_at,durationSeconds:null,remainingSeconds:null,primaryScoreMax:Number(a.primary_score_max),items:items.map(i=>{
      const s=parse(i.snapshot_json,{}),help=s.help||{},base={id:Number(i.id),position:i.position,line:i.exam_line,part:i.part,answerFormat:i.answer_format,maxScore:i.max_score,answer:parse(i.answer_json,[]),flagged:Boolean(i.flagged),autoScore:i.auto_score,selfScore:i.self_score,help:{hintCount:Number(help.hintCount||0),revealed:Boolean(help.revealed),checkCorrect:help.checkCorrect===true?true:help.checkCorrect===false?false:null,checkedAt:help.checkedAt||null},question:{type:s.type,questionType:s.questionType,prompt:s.prompt,instruction:s.instruction,contentJson:s.contentJson,mediaJson:s.mediaJson,imageUrl:s.imageUrl,options:s.options,topic:s.topic}};
      if(reveal||help.revealed)base.review={answer:parse(s.answerJson),explanation:s.explanation,solutionSteps:s.solutionSteps,scoringPoints:s.scoringPoints,commonMistakes:s.commonMistakes,lessonSlug:s.lessonSlug,extended:s.extended};
      return base;
    })};
  }

  async function history(userId){
    const list=await db.rows("SELECT id,mode,status,started_at,submitted_at,duration_seconds,variant_seed,auto_primary_score,self_primary_score,primary_score_total,primary_score_max FROM biology_mock_exam_attempts WHERE user_id=? ORDER BY id DESC LIMIT 30",userId);
    const out=[];for(const row of list)out.push(row.status==='in_progress'?await normalizeActive(row):row);return out;
  }

  async function updateSnapshot(item,mutator){
    const snap=parse(item.snapshot_json,{});mutator(snap);await db.run('UPDATE biology_mock_exam_items SET snapshot_json=? WHERE id=?',JSON.stringify(snap),item.id);return snap;
  }

  async function handle(req,res,path,user,json,body){
    const base='/api/subjects/biology/mock-exams';if(!path.startsWith(base))return false;
    const send=(status,data)=>{json(res,status,data);return true},tail=path.slice(base.length),parts=tail.split('/').filter(Boolean),id=parts[0]&&Number(parts[0]);

    if(!parts.length&&req.method==='GET'){
      const attempts=await history(user.id),active=attempts.find(a=>a.status==='in_progress');
      return send(200,{config:{examYear:registry.examYear,sourceVersion:CONFIG.sourceVersion,lineCount:registry.lines.length,unlimited:true,variantCount:CONFIG.variantCount,variants:Array.from({length:CONFIG.variantCount},(_,i)=>({number:i+1,title:`Вариант ${i+1}`}))},activeAttempt:active?await payload(await owned(active.id,user.id)):null,attempts:attempts.map(a=>({...a,variantNumber:variantFromSeed(a.variant_seed)||1}))});
    }
    if(!parts.length&&req.method==='POST'){
      const b=await body(req),active=await db.row("SELECT id FROM biology_mock_exam_attempts WHERE user_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1",user.id);
      if(active&&!b.confirmNew)return send(409,{error:'Есть незавершённый пробник',code:'ACTIVE_ATTEMPT',attemptId:Number(active.id)});
      if(active)await finalize(await owned(active.id,user.id),'submitted');
      const created=await create(user.id,'untimed',b.variant||1);return send(201,{attempt:await payload(await owned(created,user.id))});
    }

    if(!Number.isSafeInteger(id)||id<1)return send(400,{error:'Некорректный идентификатор'});
    const attempt=await owned(id,user.id);if(!attempt)return send(404,{error:'Пробник не найден'});
    if(parts.length===1&&req.method==='GET')return send(200,{attempt:await payload(attempt,attempt.status!=='in_progress')});

    if(parts[1]==='answers'&&req.method==='PATCH'){
      if(attempt.status!=='in_progress')return send(409,{error:'Завершённый пробник нельзя изменить',code:'ATTEMPT_IMMUTABLE'});
      const b=await body(req),itemId=Number(b.itemId),item=await db.row('SELECT id,snapshot_json FROM biology_mock_exam_items WHERE id=? AND attempt_id=?',itemId,id);if(!item)return send(400,{error:'Задание не входит в вариант'});
      if(b.answer!==undefined&&!Array.isArray(b.answer))return send(400,{error:'Ответ должен быть массивом'});
      await db.run('UPDATE biology_mock_exam_items SET answer_json=COALESCE(?,answer_json),flagged=COALESCE(?,flagged),answered_at=CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE answered_at END WHERE id=?',b.answer===undefined?null:JSON.stringify(b.answer),b.flagged===undefined?null:Boolean(b.flagged),b.answer===undefined?null:1,itemId);
      return send(200,{saved:true,savedAt:new Date().toISOString()});
    }

    const itemAction=parts[1]==='items'&&Number(parts[2])&&parts[3];
    if(itemAction&&req.method==='POST'){
      if(attempt.status!=='in_progress')return send(409,{error:'Пробник уже завершён'});
      const item=await db.row('SELECT * FROM biology_mock_exam_items WHERE id=? AND attempt_id=?',Number(parts[2]),id);if(!item)return send(404,{error:'Задание не найдено'});
      const snap=parse(item.snapshot_json,{}),lineInfo=registry.lines.find(x=>Number(x.line)===Number(item.exam_line));
      if(itemAction==='hint'){
        const count=Number(snap.help?.hintCount||0),hint=safeHint(snap,lineInfo,count);
        await updateSnapshot(item,s=>{s.help=s.help||{};s.help.hintCount=count+1;s.help.hintUsed=true});
        return send(200,{hint,hintCount:count+1});
      }
      if(itemAction==='check'){
        if(snap.extended)return send(200,{checkable:false,message:'Развёрнутый ответ нельзя честно проверить автоматически. Сверьте его с критериями через «Не знаю — показать разбор».'});
        if(snap.help?.revealed)return send(200,{checkable:true,correct:false,revealed:true,score:0,maxScore:Number(item.max_score),message:'Разбор уже открыт — за это задание начисляется 0 баллов.'});
        const b=await body(req);if(b.answer!==undefined){if(!Array.isArray(b.answer))return send(400,{error:'Ответ должен быть массивом'});await db.run('UPDATE biology_mock_exam_items SET answer_json=?,answered_at=CURRENT_TIMESTAMP WHERE id=?',JSON.stringify(b.answer),item.id);item.answer_json=JSON.stringify(b.answer)}
        const answer=parse(item.answer_json,[]);if(!answer.some(x=>normalize(x)))return send(400,{error:'Сначала выберите или введите ответ'});
        const score=scoreAnswer(snap,answer),correct=score>=Number(item.max_score);
        await updateSnapshot(item,s=>{s.help=s.help||{};s.help.checkCorrect=correct;s.help.checkedAt=new Date().toISOString()});
        return send(200,{checkable:true,correct,score,maxScore:Number(item.max_score),message:correct?'Верно. Можно идти дальше.':score>0?`Частично верно: ${score} из ${item.max_score}. Проверьте порядок и состав ответа.`:'Пока неверно. Попробуйте ещё раз или возьмите подсказку.'});
      }
      if(itemAction==='reveal'){
        await updateSnapshot(item,s=>{s.help=s.help||{};s.help.revealed=true;s.help.revealedAt=new Date().toISOString()});
        return send(200,{revealed:true,score:0,maxScore:Number(item.max_score),review:{answer:parse(snap.answerJson),explanation:snap.explanation,solutionSteps:snap.solutionSteps,scoringPoints:snap.scoringPoints,commonMistakes:snap.commonMistakes,lessonSlug:snap.lessonSlug,extended:snap.extended}});
      }
    }

    if(parts[1]==='submit'&&req.method==='POST'){if(attempt.status==='in_progress')await finalize(attempt);return send(200,{attempt:await payload(await owned(id,user.id),true)})}
    if(parts[1]==='result'&&req.method==='GET'){if(attempt.status==='in_progress')return send(409,{error:'Результат доступен после сдачи'});return send(200,{attempt:await payload(attempt,true)})}
    if(parts[1]==='self-score'&&req.method==='PATCH'){
      if(attempt.status==='in_progress')return send(409,{error:'Самопроверка доступна после сдачи'});const b=await body(req),item=await db.row('SELECT * FROM biology_mock_exam_items WHERE id=? AND attempt_id=?',Number(b.itemId),id),snap=parse(item?.snapshot_json,{}),score=Number(b.score);
      if(!item||!snap.extended)return send(400,{error:'Это не развёрнутый ответ'});if(snap.help?.revealed)return send(409,{error:'Ответ был открыт во время пробника — задание оценивается в 0 баллов'});if(!Number.isInteger(score)||score<0||score>item.max_score)return send(400,{error:`Баллы должны быть от 0 до ${item.max_score}`});
      await db.run('UPDATE biology_mock_exam_items SET self_score=? WHERE id=?',score,item.id);const sum=await db.row('SELECT COALESCE(SUM(self_score),0) n FROM biology_mock_exam_items WHERE attempt_id=?',id);await db.run('UPDATE biology_mock_exam_attempts SET self_primary_score=?,primary_score_total=auto_primary_score+? WHERE id=?',Number(sum.n),Number(sum.n),id);return send(200,{attempt:await payload(await owned(id,user.id),true)});
    }
    return send(404,{error:'Маршрут пробника не найден'});
  }
  return {handle,create,payload,scoreAnswer,selectVariant,CONFIG};
}
module.exports={createMockExamService,scoreAnswer,CONFIG};
