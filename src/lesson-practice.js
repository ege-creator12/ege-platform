'use strict';

const MIN_LESSON_QUESTIONS = 5;

const isCorrect=value=>value===true||value===1||value==='1'||value==='true';
function dueAt(value){
  if(!value)return false;
  const time=value instanceof Date?value.getTime():Date.parse(value);
  return Number.isFinite(time)&&time<=Date.now();
}

async function recentPresentedIds(db,userId){
  if(!userId)return new Set();
  const recent=await db.rows(`SELECT tsq.question_id FROM training_session_questions tsq JOIN training_sessions s ON s.id=tsq.session_id WHERE s.user_id=? AND tsq.presented_at IS NOT NULL ORDER BY tsq.presented_at DESC,tsq.session_id DESC,tsq.position DESC LIMIT 10`,userId);
  return new Set(recent.map(x=>Number(x.question_id)));
}

async function lessonPracticePool(db,{userId=0,lessonId,limit=MIN_LESSON_QUESTIONS}={}){
  const id=Number(lessonId);
  const target=Math.max(MIN_LESSON_QUESTIONS,Math.min(30,Number(limit)||MIN_LESSON_QUESTIONS));
  if(!Number.isSafeInteger(id)||id<=0)return {lesson:null,ids:[],candidates:[]};

  const lesson=await db.row(`SELECT l.id,l.topic_id,l.codifier_code,l.exam_lines_json,t.section_id,t.subject_id,s.slug subject_slug FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN subjects s ON s.id=t.subject_id WHERE l.id=? AND l.published=1 AND t.published=1 AND s.published=1`,id);
  if(!lesson)return {lesson:null,ids:[],candidates:[]};

  const candidateLimit=Math.min(500,Math.max(target*30,120));
  const codifier=String(lesson.codifier_code||'');
  const candidates=await db.rows(`WITH latest AS (
      SELECT a.*,ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY id DESC) rn
      FROM attempts a WHERE user_id=?
    )
    SELECT q.id,q.external_key,q.difficulty,q.lesson_id,q.topic_id,q.codifier_code,
      a.id attempt_id,a.correct,a.next_review_at,
      CASE
        WHEN q.lesson_id=? THEN 0
        WHEN q.topic_id=? THEN 1
        WHEN ?<>'' AND q.codifier_code=? THEN 2
        WHEN qt.section_id=? THEN 3
        ELSE 9
      END relevance
    FROM questions q
    JOIN topics qt ON qt.id=q.topic_id
    LEFT JOIN latest a ON a.question_id=q.id AND a.rn=1
    WHERE q.subject_id=? AND q.active=1 AND q.published=1
      AND (q.lesson_id=? OR q.topic_id=? OR (?<>'' AND q.codifier_code=?) OR qt.section_id=?)
    ORDER BY relevance,RANDOM()
    LIMIT ?`,userId,id,lesson.topic_id,codifier,codifier,lesson.section_id,lesson.subject_id,id,lesson.topic_id,codifier,codifier,lesson.section_id,candidateLimit);

  const recent=await recentPresentedIds(db,userId);
  const scored=candidates.map((candidate,randomIndex)=>{
    let learningPriority=2;
    if(candidate.attempt_id&&!isCorrect(candidate.correct))learningPriority=0;
    else if(candidate.attempt_id&&dueAt(candidate.next_review_at))learningPriority=1;
    else if(!candidate.attempt_id)learningPriority=2;
    else learningPriority=3;
    return {...candidate,recentPenalty:recent.has(Number(candidate.id))?1:0,learningPriority,randomIndex};
  });
  scored.sort((a,b)=>Number(a.relevance)-Number(b.relevance)||a.recentPenalty-b.recentPenalty||a.learningPriority-b.learningPriority||Number(a.difficulty||1)-Number(b.difficulty||1)||a.randomIndex-b.randomIndex);
  const ids=[...new Set(scored.map(x=>Number(x.id)))].slice(0,target);
  return {lesson,ids,candidates:scored};
}

async function auditLessonPractice(db,{minimum=MIN_LESSON_QUESTIONS}={}){
  const lessons=await db.rows(`SELECT l.id,l.slug,l.title,t.title topic,s.slug subject FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN subjects s ON s.id=t.subject_id WHERE l.published=1 AND t.published=1 AND s.published=1 ORDER BY s.slug,l.id`);
  const failures=[];
  let directReady=0,topicReady=0,fallbackReady=0;
  for(const lesson of lessons){
    const direct=Number((await db.row('SELECT COUNT(*) n FROM questions WHERE lesson_id=? AND active=1 AND published=1',lesson.id))?.n||0);
    const sameTopic=Number((await db.row(`SELECT COUNT(*) n FROM questions q JOIN lessons l ON l.id=? WHERE q.topic_id=l.topic_id AND q.active=1 AND q.published=1`,lesson.id))?.n||0);
    const resolved=await lessonPracticePool(db,{lessonId:lesson.id,limit:minimum});
    if(resolved.ids.length<minimum)failures.push({...lesson,direct,sameTopic,resolved:resolved.ids.length});
    else if(direct>=minimum)directReady++;
    else if(sameTopic>=minimum)topicReady++;
    else fallbackReady++;
  }
  return {minimum,total:lessons.length,directReady,topicReady,fallbackReady,failures};
}

module.exports={MIN_LESSON_QUESTIONS,lessonPracticePool,auditLessonPractice};
