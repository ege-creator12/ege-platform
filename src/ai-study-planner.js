'use strict';

const biologyRegistry=require('../content/biology/exam-lines.json');
const chemistryRegistry=require('../content/chemistry/exam-lines');

const registries={biology:biologyRegistry,chemistry:chemistryRegistry};
const titles={biology:'Биология',chemistry:'Химия'};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value}catch{return null}};
const asBool=value=>value===true||value===1||value==='1'||value==='true';

function registryFor(subjectSlug){
 const registry=registries[subjectSlug];
 if(!registry)throw Object.assign(new Error('Выберите биологию или химию'),{status:400});
 return registry;
}

function settingsFrom(body={}){
 const subjectSlug=String(body.subjectSlug||'').trim();
 registryFor(subjectSlug);
 const targetScore=clamp(Math.round(Number(body.targetScore)||0),40,100);
 const daysPerWeek=clamp(Math.round(Number(body.daysPerWeek)||0),1,7);
 const minutesPerDay=clamp(Math.round(Number(body.minutesPerDay)||0),20,300);
 const examDate=String(body.examDate||'').trim();
 const examTime=Date.parse(`${examDate}T12:00:00`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(examDate)||!Number.isFinite(examTime)||examTime<=Date.now()){
  throw Object.assign(new Error('Укажите будущую дату экзамена'),{status:400});
 }
 return{subjectSlug,targetScore,daysPerWeek,minutesPerDay,examDate};
}

async function collectAnalytics(db,userId,subjectSlug){
 const registry=registryFor(subjectSlug);
 const subject=await db.row('SELECT id,title FROM subjects WHERE slug=? AND published=1',subjectSlug);
 if(!subject)throw Object.assign(new Error('Предмет не найден'),{status:404});
 const attempts=await db.rows(`SELECT q.exam_line,t.title topic,a.correct,a.duration_seconds,a.created_at
   FROM attempts a JOIN questions q ON q.id=a.question_id JOIN topics t ON t.id=q.topic_id
   WHERE a.user_id=? AND q.subject_id=? ORDER BY a.id DESC LIMIT 250`,userId,subject.id);
 const lines=new Map(registry.lines.map(info=>[Number(info.line),{
  line:Number(info.line),title:String(info.title||`Линия ${info.line}`),total:0,correct:0,duration:0,accuracy:null,risk:55
 }]));
 let correct=0,duration=0;
 for(const attempt of attempts){
  const line=Number(attempt.exam_line||0),ok=asBool(attempt.correct);
  if(ok)correct++;
  duration+=Number(attempt.duration_seconds||0);
  if(!lines.has(line))continue;
  const item=lines.get(line);item.total++;item.correct+=ok?1:0;item.duration+=Number(attempt.duration_seconds||0);
 }
 for(const item of lines.values()){
  if(item.total){
   item.accuracy=Math.round(item.correct/item.total*100);
   item.risk=clamp((100-item.accuracy)*0.78+Math.min(item.total,6)*2.2,0,100);
  }
 }
 const accuracy=attempts.length?Math.round(correct/attempts.length*100):null;
 const scoreEstimate=attempts.length>=15?clamp(Math.round(accuracy),0,100):null;
 const weakLines=[...lines.values()].sort((a,b)=>b.risk-a.risk||a.accuracy-b.accuracy||b.total-a.total).slice(0,8);
 return{
  subjectId:Number(subject.id),subjectSlug,subjectTitle:titles[subjectSlug]||subject.title,
  attempts:attempts.length,accuracy,scoreEstimate,
  averageSeconds:attempts.length?Math.round(duration/attempts.length):0,
  confidence:attempts.length>=60?'высокая':attempts.length>=24?'средняя':'низкая',
  lines:[...lines.values()],weakLines
 };
}

async function askAiPriorities(analytics,settings){
 if(!process.env.GEMINI_API_KEY)return null;
 const model=process.env.GEMINI_MODEL||process.env.GEMINI_FALLBACK_MODEL||'gemini-2.5-flash-lite';
 const compact=analytics.lines.map(x=>({line:x.line,accuracy:x.accuracy,total:x.total,title:x.title}));
 const prompt=`Ты — куратор подготовки к ЕГЭ по ${analytics.subjectTitle.toLowerCase()}. На основе статистики выбери приоритетные линии для ближайших занятий.
Цель: ${settings.targetScore} баллов. До экзамена: ${settings.examDate}. Занятий в неделю: ${settings.daysPerWeek}, минут за занятие: ${settings.minutesPerDay}.
Текущий ориентир: ${analytics.scoreEstimate==null?'диагностики пока недостаточно':analytics.scoreEstimate}. Статистика линий: ${JSON.stringify(compact)}
Верни ТОЛЬКО JSON без markdown вида {"priorityLines":[1,2,3],"coachNote":"2-4 коротких предложения по-русски"}. priorityLines — максимум 6 существующих линий, сначала самые важные.`;
 try{
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
   method:'POST',headers:{'content-type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},
   body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:700}}),
   signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)return null;
  const data=await response.json();
  const text=(data?.candidates||[]).flatMap(x=>x?.content?.parts||[]).map(x=>x?.text||'').join('\n').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
  const parsed=JSON.parse(text);
  const allowed=new Set(analytics.lines.map(x=>x.line));
  const priorityLines=[...new Set((parsed.priorityLines||[]).map(Number).filter(x=>allowed.has(x)))].slice(0,6);
  const coachNote=String(parsed.coachNote||'').trim().slice(0,1200);
  return priorityLines.length||coachNote?{priorityLines,coachNote,model}:null;
 }catch(error){
  console.warn('ai-study-planner-gemini',error?.name||error?.message||error);
  return null;
 }
}

function dayLabel(date){return date.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'});}
function distributeDays(daysPerWeek){
 const result=[];
 for(let i=0;i<daysPerWeek;i++)result.push(Math.min(6,Math.floor(i*7/daysPerWeek)));
 return [...new Set(result)];
}

function scheduleFor(settings,analytics,priorities){
 const selected=distributeDays(settings.daysPerWeek);
 const priorityItems=priorities.map(line=>analytics.lines.find(x=>x.line===line)).filter(Boolean);
 const fallback=analytics.weakLines;
 const focus=priorityItems.length?priorityItems:fallback;
 const today=new Date();today.setHours(12,0,0,0);
 const schedule=[];let studyIndex=0;
 for(let offset=0;offset<7;offset++){
  const date=new Date(today);date.setDate(today.getDate()+offset);
  if(!selected.includes(offset)){
   schedule.push({date:date.toISOString().slice(0,10),label:dayLabel(date),rest:true,title:'Отдых / лёгкое повторение',minutes:0});
   continue;
  }
  const item=focus[studyIndex%Math.max(1,focus.length)]||{line:1,title:'Базовая диагностика',accuracy:null};studyIndex++;
  const theory=Math.max(10,Math.round(settings.minutesPerDay*0.28));
  const practice=Math.max(15,Math.round(settings.minutesPerDay*0.57));
  const review=Math.max(5,settings.minutesPerDay-theory-practice);
  const questions=clamp(Math.round(practice/3),5,25);
  schedule.push({
   date:date.toISOString().slice(0,10),label:dayLabel(date),rest:false,line:item.line,title:`Линия ${item.line}: ${item.title}`,
   accuracy:item.accuracy,minutes:settings.minutesPerDay,theoryMinutes:theory,practiceMinutes:practice,reviewMinutes:review,questions
  });
 }
 return schedule;
}

function feasibility(settings,analytics){
 const exam=new Date(`${settings.examDate}T12:00:00`),now=new Date();
 const daysLeft=Math.max(1,Math.ceil((exam-now)/86400000));
 const weeks=Math.max(1,daysLeft/7),weeklyHours=settings.daysPerWeek*settings.minutesPerDay/60;
 if(analytics.scoreEstimate==null)return{daysLeft,weeks:Math.round(weeks*10)/10,weeklyHours:Math.round(weeklyHours*10)/10,status:'Нужна диагностика',gap:null};
 const gap=Math.max(0,settings.targetScore-analytics.scoreEstimate);
 const capacity=weeks*weeklyHours*0.7;
 const status=gap<=5?'Очень реалистично':gap<=capacity?'Реалистично':gap<=capacity*1.35?'Напряжённо':'Нужно увеличить нагрузку';
 return{daysLeft,weeks:Math.round(weeks*10)/10,weeklyHours:Math.round(weeklyHours*10)/10,status,gap};
}

async function buildPlan(db,userId,body){
 const settings=settingsFrom(body),analytics=await collectAnalytics(db,userId,settings.subjectSlug);
 const ai=await askAiPriorities(analytics,settings);
 const priorityLines=ai?.priorityLines?.length?ai.priorityLines:analytics.weakLines.slice(0,6).map(x=>x.line);
 const feasibilityInfo=feasibility(settings,analytics);
 const plan={
  version:1,generatedAt:new Date().toISOString(),subjectSlug:settings.subjectSlug,subjectTitle:analytics.subjectTitle,
  targetScore:settings.targetScore,examDate:settings.examDate,daysPerWeek:settings.daysPerWeek,minutesPerDay:settings.minutesPerDay,
  scoreEstimate:analytics.scoreEstimate,accuracy:analytics.accuracy,attempts:analytics.attempts,confidence:analytics.confidence,
  priorityLines,weakLines:analytics.weakLines.slice(0,6),schedule:scheduleFor(settings,analytics,priorityLines),feasibility:feasibilityInfo,
  aiPowered:Boolean(ai),aiModel:ai?.model||null,
  coachNote:ai?.coachNote||(
   analytics.scoreEstimate==null
    ? 'Сначала пройди диагностику: после неё план точнее расставит линии по приоритету и даст ориентир по баллам.'
    : `Сейчас важнее всего закрывать линии ${priorityLines.slice(0,4).join(', ')}. План будет перестраиваться после новых ответов.`
  )
 };
 await db.run(`INSERT INTO ai_study_plans(user_id,subject_slug,target_score,exam_date,days_per_week,minutes_per_day,plan_json)
  VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,subject_slug) DO UPDATE SET target_score=excluded.target_score,exam_date=excluded.exam_date,days_per_week=excluded.days_per_week,minutes_per_day=excluded.minutes_per_day,plan_json=excluded.plan_json,updated_at=CURRENT_TIMESTAMP`,
  userId,settings.subjectSlug,settings.targetScore,settings.examDate,settings.daysPerWeek,settings.minutesPerDay,JSON.stringify(plan));
 return plan;
}

async function loadPlan(db,userId,subjectSlug){
 registryFor(subjectSlug);
 const saved=await db.row('SELECT * FROM ai_study_plans WHERE user_id=? AND subject_slug=?',userId,subjectSlug);
 if(!saved)return null;
 const plan=parse(saved.plan_json)||{};
 return{...plan,savedAt:saved.updated_at};
}

async function diagnosticQuestionIds(db,userId,subjectSlug,count=24){
 const registry=registryFor(subjectSlug),subject=await db.row('SELECT id FROM subjects WHERE slug=? AND published=1',subjectSlug);
 if(!subject)throw Object.assign(new Error('Предмет не найден'),{status:404});
 const lines=registry.lines.map(x=>Number(x.line)).filter(Boolean),wanted=clamp(Number(count)||24,12,40),picked=[];
 const selected=[];
 for(let i=0;i<Math.min(wanted,lines.length);i++)selected.push(lines[Math.floor(i*lines.length/Math.min(wanted,lines.length))]);
 for(const line of selected){
  const q=await db.row(`SELECT q.id FROM questions q WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 ORDER BY RANDOM() LIMIT 1`,subject.id,line);
  if(q?.id&&!picked.includes(Number(q.id)))picked.push(Number(q.id));
 }
 if(picked.length<wanted){
  const extras=await db.rows('SELECT q.id FROM questions q WHERE q.subject_id=? AND q.active=1 AND q.published=1 ORDER BY RANDOM() LIMIT ?',subject.id,Math.max(wanted*3,60));
  for(const q of extras){if(!picked.includes(Number(q.id)))picked.push(Number(q.id));if(picked.length>=wanted)break;}
 }
 return picked.slice(0,wanted);
}

module.exports={buildPlan,loadPlan,diagnosticQuestionIds,collectAnalytics,settingsFrom};
