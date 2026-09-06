const { createHash } = require('node:crypto');
const hardBank = require('../content/biology/mock-hard-questions.json');

const CONFIG={
  durationSeconds:Number(process.env.BIOLOGY_MOCK_DURATION_SECONDS)||12600,
  sourceVersion:'Проект ФИПИ ЕГЭ-2027 / конфигурация платформы',
  variantCount:3,
  defaultMode:'untimed'
};
const parse=(value,fallback=[])=>{try{return value==null?fallback:typeof value==='string'?JSON.parse(value):value}catch{return fallback}};
const normalize=value=>String(value??'').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ');
const hashNumber=text=>Number.parseInt(createHash('sha256').update(text).digest('hex').slice(0,12),16);
const isExtended=q=>(q.question_type||q.questionType)==='extended_answer';
const variantFromSeed=seed=>Math.min(CONFIG.variantCount,Math.max(1,Number(String(seed||'').match(/^variant:(\d+)/)?.[1])||1));

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
  const lineByNumber=new Map(registry.lines.map(line=>[Number(line.line),line]));
  const virtualByLine=new Map();
  for(const q of hardBank.questions||[]){const line=Number(q.line);if(!virtualByLine.has(line))virtualByLine.set(line,[]);virtualByLine.get(line).push(q)}

  async function expire(attempt){
    if(attempt.status==='in_progress'&&attempt.mode==='timed'&&Date.now()>=new Date(attempt.started_at).getTime()+attempt.duration_seconds*1000){
      await finalize(attempt,'expired');
      return db.row('SELECT * FROM biology_mock_exam_attempts WHERE id=?',attempt.id);
    }
    return attempt;
  }

  async function finalize(attempt,status='submitted'){
    const items=await db.rows('SELECT * FROM biology_mock_exam_items WHERE attempt_id=? ORDER BY position',attempt.id);let auto=0,max=0;
    for(const item of items){
      const snap=parse(item.snapshot_json,{});max+=Number(item.max_score||0);
      const score=snap.extended?null:scoreAnswer(snap,parse(item.answer_json,[]));
      if(score!==null)auto+=score;
      await db.run('UPDATE biology_mock_exam_items SET auto_score=? WHERE id=?',score,item.id);
    }
    await db.run("UPDATE biology_mock_exam_attempts SET status=?,submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),auto_primary_score=?,primary_score_total=?,primary_score_max=? WHERE id=? AND status='in_progress'",status,auto,auto+Number(attempt.self_primary_score||0),max,attempt.id);
  }

  async function owned(id,userId){
    let a=await db.row('SELECT * FROM biology_mock_exam_attempts WHERE id=? AND user_id=?',id,userId);
    return a?expire(a):null;
  }

  async function dbCandidates(subjectId,line){
    return db.rows("SELECT q.*,t.title topic,l.slug lesson_slug FROM questions q JOIN topics t ON t.id=q.topic_id LEFT JOIN lessons l ON l.id=q.lesson_id WHERE q.subject_id=? AND q.active=1 AND q.published=1 AND q.content_status IN ('review','verified') AND q.exam_line=? AND q.answer_json IS NOT NULL ORDER BY q.id",subjectId,line);
  }

  function virtualCandidate(v){
    return {
      id:null,
      external_key:v.key,
      type:v.type||'text',
      question_type:v.questionType||v.type||'text',
      prompt:v.prompt,
      instruction:v.instruction||'',
      content_json:null,
      media_json:null,
      image_url:null,
      difficulty:Number(v.difficulty||3),
      topic:'Сложный авторский вариант',
      lesson_slug:null,
      answer_json:v.answer,
      explanation:v.explanation||'',
      solution_steps_json:v.solutionSteps||[],
      max_score:Number(v.maxScore||1),
      points:Number(v.maxScore||1),
      options:v.options||[],
      hint:v.hint||'',
      scoringPoints:v.scoringPoints||[],
      commonMistakes:v.commonMistakes||[],
      virtual:true
    };
  }

  async function makeSnapshot(q,line,reader=db){
    const options=q.virtual?q.options:await reader.rows('SELECT value,label FROM question_options WHERE question_id=? ORDER BY position',q.id);
    const explanationData=q.virtual?{}:parse(q.explanation_json,{});
    return {
      questionKey:q.external_key,
      questionId:q.id==null?null:Number(q.id),
      type:q.type,
      questionType:q.question_type||q.type,
      prompt:q.prompt,
      instruction:q.instruction,
      contentJson:q.content_json,
      mediaJson:q.media_json,
      imageUrl:q.image_url,
      options,
      difficulty:Number(q.difficulty||1),
      topic:q.topic,
      lessonSlug:q.lesson_slug,
      answerJson:q.answer_json,
      explanation:q.explanation||'',
      solutionSteps:parse(q.solution_steps_json,[]),
      scoringPoints:q.scoringPoints||explanationData.scoringPoints||[],
      commonMistakes:q.commonMistakes||explanationData.commonMistakes||[],
      hint:q.hint||line.strategy?.[0]||'Разбейте условие на данные, биологический механизм и требуемый вывод.',
      strategy:line.strategy||[],
      lineTraps:line.commonTraps||[],
      maxScore:Number(q.max_score||q.points||1),
      extended:isExtended(q),
      source:q.virtual?'Авторское задание ОСНОВЫ по механике ФИПИ':'Проверенный банк ОСНОВЫ'
    };
  }

  async function create(userId,mode='untimed',variant=1){
    if(!['timed','untimed'].includes(mode))throw Object.assign(new Error('Неизвестный режим пробника'),{status:400,code:'INVALID_MODE'});
    variant=Number(variant||1);
    if(!Number.isInteger(variant)||variant<1||variant>CONFIG.variantCount)throw Object.assign(new Error('Неизвестный вариант пробника'),{status:400,code:'INVALID_VARIANT'});
    const seed=`variant:${variant}:biology-2027-v3`,subject=await db.row("SELECT id FROM subjects WHERE slug='biology'");
    if(!subject)throw Object.assign(new Error('Предмет биология не найден'),{status:500,code:'BIOLOGY_NOT_FOUND'});
    const selected=[];
    for(const line of registry.lines){
      const base=await dbCandidates(subject.id,line.line);
      const extras=variant===1?[]:(virtualByLine.get(Number(line.line))||[]).map(virtualCandidate);
      const pool=[...base,...extras];
      if(!pool.length)throw Object.assign(new Error(`Нет проверенных заданий для линии ${line.line}`),{status:409,code:'INCOMPLETE_BANK'});
      const targetDifficulty=variant===1?2:variant===2?2.65:3;
      const ranked=pool.map(q=>{
        const difficultyPenalty=Math.abs(Number(q.difficulty||1)-targetDifficulty)*1e12;
        const authoredPriority=q.virtual?(variant===3?-2e10:-1e10):0;
        const jitter=hashNumber(`${seed}:${q.external_key||q.id}`)%1e9;
        return {q,key:difficultyPenalty+authoredPriority+jitter};
      }).sort((a,b)=>a.key-b.key);
      selected.push({line,q:ranked[0].q});
    }
    return db.transaction(async tx=>{
      const made=await tx.run('INSERT INTO biology_mock_exam_attempts(user_id,exam_year,source_version,mode,duration_seconds,variant_seed) VALUES(?,?,?,?,?,?)',userId,registry.examYear,CONFIG.sourceVersion,mode,mode==='timed'?CONFIG.durationSeconds:null,seed),id=Number(made.lastInsertRowid);let max=0;
      for(const [index,{line,q}] of selected.entries()){
        const snapshot=await makeSnapshot(q,line,tx);max+=snapshot.maxScore;
        await tx.run('INSERT INTO biology_mock_exam_items(attempt_id,question_id,position,exam_line,part,answer_format,max_score,snapshot_json) VALUES(?,?,?,?,?,?,?,?)',id,q.id==null?null:q.id,index+1,line.line,line.part,line.answerFormat,snapshot.maxScore,JSON.stringify(snapshot));
      }
      await tx.run('UPDATE biology_mock_exam_attempts SET primary_score_max=? WHERE id=?',max,id);
      return id;
    });
  }

  function remaining(a){return a.mode==='timed'?Math.max(0,a.duration_seconds-Math.floor((Date.now()-new Date(a.started_at).getTime())/1000)):null}
  const reviewOf=s=>({answer:parse(s.answerJson),explanation:s.explanation,solutionSteps:s.solutionSteps||[],scoringPoints:s.scoringPoints||[],commonMistakes:s.commonMistakes||[],lessonSlug:s.lessonSlug,extended:Boolean(s.extended)});

  async function payload(a,reveal=false){
    const items=await db.rows('SELECT * FROM biology_mock_exam_items WHERE attempt_id=? ORDER BY position',a.id);
    return {
      id:Number(a.id),variant:variantFromSeed(a.variant_seed),mode:a.mode,status:a.status,examYear:a.exam_year,sourceVersion:a.source_version,startedAt:a.started_at,submittedAt:a.submitted_at,durationSeconds:a.duration_seconds,remainingSeconds:remaining(a),primaryScoreMax:Number(a.primary_score_max),
      items:items.map(i=>{
        const s=parse(i.snapshot_json,{}),base={id:Number(i.id),position:i.position,line:i.exam_line,part:i.part,answerFormat:i.answer_format,maxScore:i.max_score,answer:parse(i.answer_json,[]),flagged:Boolean(i.flagged),autoScore:i.auto_score,selfScore:i.self_score,question:{type:s.type,questionType:s.questionType,prompt:s.prompt,instruction:s.instruction,contentJson:s.contentJson,mediaJson:s.mediaJson,imageUrl:s.imageUrl,options:s.options,topic:s.topic,difficulty:s.difficulty,source:s.source}};
        if(reveal)return {...base,review:reviewOf(s)};
        return base;
      })
    };
  }

  async function history(userId){
    const list=await db.rows("SELECT id,mode,status,started_at,submitted_at,duration_seconds,auto_primary_score,self_primary_score,primary_score_total,primary_score_max,variant_seed FROM biology_mock_exam_attempts WHERE user_id=? ORDER BY id DESC LIMIT 30",userId);
    const checked=await Promise.all(list.map(expire));
    return checked.map(a=>({...a,variant:variantFromSeed(a.variant_seed)}));
  }

  async function helpFor(attempt,itemId,action='hint'){
    const item=await db.row('SELECT * FROM biology_mock_exam_items WHERE id=? AND attempt_id=?',itemId,attempt.id);
    if(!item)throw Object.assign(new Error('Задание не входит в вариант'),{status:400,code:'ITEM_NOT_FOUND'});
    const s=parse(item.snapshot_json,{}),line=lineByNumber.get(Number(item.exam_line));
    const hint={
      hint:s.hint||line?.strategy?.[0]||'Выделите данные условия и сначала назовите проверяемый биологический механизм.',
      strategy:s.strategy?.length?s.strategy:(line?.strategy||[]),
      commonTraps:[...(s.lineTraps||line?.commonTraps||[]),...(s.commonMistakes||[])].filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,6)
    };
    if(action==='hint')return hint;
    const review=reviewOf(s),answer=parse(item.answer_json,[]);
    if(action==='reveal')return {...hint,revealed:true,review};
    if(action==='check'){
      if(s.extended)return {...hint,manual:true,review,message:'Развёрнутый ответ сверяется по смысловым критериям — автоматический балл здесь был бы ненадёжным.'};
      if(!answer.some(v=>String(v??'').trim()))throw Object.assign(new Error('Сначала введите или выберите ответ'),{status:400,code:'EMPTY_ANSWER'});
      const score=scoreAnswer(s,answer);
      return {...hint,correct:score===Number(item.max_score),score,maxScore:Number(item.max_score),review};
    }
    throw Object.assign(new Error('Неизвестный тип помощи'),{status:400,code:'INVALID_HELP_ACTION'});
  }

  async function handle(req,res,path,user,json,body){
    const base='/api/subjects/biology/mock-exams';
    if(!path.startsWith(base))return false;
    const send=(status,data)=>{if(!res.headersSent)json(res,status,data);return true};
    try{
      const tail=path.slice(base.length),parts=tail.split('/').filter(Boolean),id=parts[0]&&Number(parts[0]);
      if(!parts.length&&req.method==='GET'){
        const attempts=await history(user.id),active=attempts.find(a=>a.status==='in_progress');
        return send(200,{config:{examYear:registry.examYear,sourceVersion:CONFIG.sourceVersion,durationSeconds:CONFIG.durationSeconds,lineCount:registry.lines.length,variantCount:CONFIG.variantCount,defaultMode:CONFIG.defaultMode,sourceLabel:hardBank.source},activeAttempt:active?await payload(active):null,attempts});
      }
      if(!parts.length&&req.method==='POST'){
        const b=await body(req),active=await db.row("SELECT id FROM biology_mock_exam_attempts WHERE user_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1",user.id);
        if(active&&!b.confirmNew)return send(409,{error:'Есть незавершённый пробник',code:'ACTIVE_ATTEMPT',attemptId:Number(active.id)});
        if(active)await finalize(await owned(active.id,user.id),'submitted');
        const created=await create(user.id,b.mode||CONFIG.defaultMode,b.variant||1);
        return send(201,{attempt:await payload(await owned(created,user.id))});
      }
      if(!Number.isSafeInteger(id)||id<1)return send(400,{error:'Некорректный идентификатор'});
      const attempt=await owned(id,user.id);if(!attempt)return send(404,{error:'Пробник не найден'});
      if(parts.length===1&&req.method==='GET')return send(200,{attempt:await payload(attempt,attempt.status!=='in_progress')});
      if(parts[1]==='answers'&&req.method==='PATCH'){
        if(attempt.status!=='in_progress')return send(409,{error:'Завершённый пробник нельзя изменить',code:'ATTEMPT_IMMUTABLE'});
        const b=await body(req),itemId=Number(b.itemId),item=await db.row('SELECT id FROM biology_mock_exam_items WHERE id=? AND attempt_id=?',itemId,id);
        if(!item)return send(400,{error:'Задание не входит в вариант'});
        if(b.answer!==undefined&&!Array.isArray(b.answer))return send(400,{error:'Ответ должен быть массивом'});
        if(b.answer!==undefined)await db.run('UPDATE biology_mock_exam_items SET answer_json=?,answered_at=CURRENT_TIMESTAMP WHERE id=?',JSON.stringify(b.answer),itemId);
        if(b.flagged!==undefined)await db.run('UPDATE biology_mock_exam_items SET flagged=? WHERE id=?',Boolean(b.flagged),itemId);
        return send(200,{saved:true,savedAt:new Date().toISOString()});
      }
      if(parts[1]==='help'&&req.method==='POST'){
        if(attempt.status!=='in_progress')return send(409,{error:'Помощь доступна во время прохождения пробника',code:'ATTEMPT_IMMUTABLE'});
        const b=await body(req),itemId=Number(b.itemId);
        return send(200,await helpFor(attempt,itemId,b.action||'hint'));
      }
      if(parts[1]==='submit'&&req.method==='POST'){
        if(attempt.status==='in_progress')await finalize(attempt);
        return send(200,{attempt:await payload(await owned(id,user.id),true)});
      }
      if(parts[1]==='result'&&req.method==='GET'){
        if(attempt.status==='in_progress')return send(409,{error:'Результат доступен после сдачи'});
        return send(200,{attempt:await payload(attempt,true)});
      }
      if(parts[1]==='self-score'&&req.method==='PATCH'){
        if(attempt.status==='in_progress')return send(409,{error:'Самопроверка доступна после сдачи'});
        const b=await body(req),item=await db.row('SELECT * FROM biology_mock_exam_items WHERE id=? AND attempt_id=?',Number(b.itemId),id),snap=parse(item?.snapshot_json,{}),score=Number(b.score);
        if(!item||!snap.extended)return send(400,{error:'Это не развёрнутый ответ'});
        if(!Number.isInteger(score)||score<0||score>item.max_score)return send(400,{error:`Баллы должны быть от 0 до ${item.max_score}`});
        await db.run('UPDATE biology_mock_exam_items SET self_score=? WHERE id=?',score,item.id);
        const sum=await db.row('SELECT COALESCE(SUM(self_score),0) n FROM biology_mock_exam_items WHERE attempt_id=?',id);
        await db.run('UPDATE biology_mock_exam_attempts SET self_primary_score=?,primary_score_total=auto_primary_score+? WHERE id=?',Number(sum.n),Number(sum.n),id);
        return send(200,{attempt:await payload(await owned(id,user.id),true)});
      }
      return send(404,{error:'Маршрут пробника не найден'});
    }catch(error){
      const status=Number(error.status)||500;
      console.error(JSON.stringify({scope:'biology-mock-exams',route:`${req.method} ${path}`,message:error.message,code:error.code||null}));
      return send(status,{error:status===500?'Не удалось обработать пробник. Попробуйте ещё раз.':error.message,code:error.code||'MOCK_EXAM_ERROR'});
    }
  }

  return {handle,create,payload,scoreAnswer,CONFIG};
}

module.exports={createMockExamService,scoreAnswer,CONFIG};
