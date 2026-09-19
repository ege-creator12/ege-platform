'use strict';
const registry=require('../content/chemistry/exam-lines');
const builders=require('./chemistry-line-bank');
const {semanticFingerprint,nearDuplicate}=require('./question-semantic-quality');
const {diversifyQuestion}=require('./question-bank-diversify');
const BANK_VERSION='v3';
const MEDIUM_BANK_VERSION='retired-v1';

function parseJson(value){
 if(!value)return {};
 if(typeof value==='object')return value;
 try{return JSON.parse(value);}catch{return {};}
}
function fingerprint(item){return semanticFingerprint({...item,content:item.content||parseJson(item.content_json)});}

async function insertQuestion(db,{subject,lesson,line,info,key,item,source}){
 const maxScore=Number(item.maxScore||info.maxScore||1);
 const content={...(item.content||{}),qualityBankVersion:BANK_VERSION,qualityExamLine:line,qualityTier:Number(item.difficulty)>=3?'hard':'medium'};
 const result=await db.run(`INSERT INTO questions(
   subject_id,topic_id,lesson_id,external_key,type,question_type,prompt,instruction,explanation,difficulty,
   answer_json,answer_data_json,explanation_json,content_json,media_json,source,source_type,exam_line,points,estimated_seconds,
   active,published,exam_year,solution_steps_json,max_score,content_status
 ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,TRUE,?,?,?,?)`,
   subject.id,lesson.topic_id,lesson.id,key,item.type,item.questionType,item.prompt,item.instruction||'',item.explanation,item.difficulty||2,
   JSON.stringify(item.answer||[]),JSON.stringify({correct:item.answer||[],acceptedVariants:item.acceptedVariants||[],content}),
   JSON.stringify({short:item.explanation,fullSolution:item.explanation,scoringPoints:item.scoringPoints||item.content?.criteria||[]}),JSON.stringify(content),'{}',
   source,'original',line,maxScore,line>=29?600:line>=23?240:150,2027,JSON.stringify(item.solutionSteps||[]),maxScore,'review');
 const questionId=Number(result.lastInsertRowid);
 for(const [i,opt] of (item.options||[]).entries())await db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',questionId,String(opt.value),String(opt.label),i);
 return questionId;
}

async function retireOldGeneratedBanks(db,subjectId){
 const old=await db.row("SELECT COUNT(*) n FROM questions WHERE subject_id=? AND active=1 AND ((external_key LIKE 'chemistry-bank-%' AND external_key NOT LIKE 'chemistry-bank-v3-line%') OR external_key LIKE 'chemistry-medium-%')",subjectId);
 const retired=Number(old?.n||0);
 if(retired)await db.run("UPDATE questions SET active=FALSE,published=FALSE,exam_line=NULL WHERE subject_id=? AND ((external_key LIKE 'chemistry-bank-%' AND external_key NOT LIKE 'chemistry-bank-v3-line%') OR external_key LIKE 'chemistry-medium-%')",subjectId);
 return retired;
}

async function sanitizeExamLineAssignments(db,subjectId){
 const row=await db.row("SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line BETWEEN 1 AND 34 AND (external_key IS NULL OR external_key NOT LIKE 'chemistry-bank-v3-line%')",subjectId);
 const detached=Number(row?.n||0);
 if(detached)await db.run("UPDATE questions SET exam_line=NULL WHERE subject_id=? AND exam_line BETWEEN 1 AND 34 AND (external_key IS NULL OR external_key NOT LIKE 'chemistry-bank-v3-line%')",subjectId);
 return detached;
}

async function bankItems(db,subjectId,line){
 const prefix=`chemistry-bank-${BANK_VERSION}-line${line}-%`;
 const rows=await db.rows(`SELECT q.id,q.external_key,q.prompt,q.content_json,q.type,q.question_type,
   qo.value option_value,qo.label option_label,qo.position option_position
   FROM questions q LEFT JOIN question_options qo ON qo.question_id=q.id
   WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 AND q.external_key LIKE ?
   ORDER BY q.id,qo.position`,subjectId,line,prefix);
 const map=new Map();
 for(const row of rows){
  let item=map.get(Number(row.id));
  if(!item){item={id:Number(row.id),external_key:row.external_key,prompt:row.prompt,content_json:row.content_json,type:row.type,questionType:row.question_type,options:[]};map.set(item.id,item);}
  if(row.option_value!==null&&row.option_value!==undefined)item.options.push({value:row.option_value,label:row.option_label});
 }
 return [...map.values()];
}

async function removeSemanticDuplicates(db,subjectId){
 let hidden=0;
 for(const info of registry.lines){
  const items=await bankItems(db,subjectId,Number(info.line)),seen=new Map();
  for(const item of items){
   const fp=fingerprint(item);
   if(!seen.has(fp)){seen.set(fp,item);continue;}
   await db.run('UPDATE questions SET active=FALSE,published=FALSE WHERE id=?',item.id);hidden++;
  }
 }
 return hidden;
}

async function resolveLineLesson(db,subjectId,info){
 const line=Number(info.line);
 const anchorSlug=`chemistry-line-${String(line).padStart(2,'0')}-lesson`;
 let lesson=await db.row('SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND l.slug=? AND l.published=1',subjectId,anchorSlug);
 if(lesson)return lesson;
 const refs=Array.isArray(info.lessonRefs)?info.lessonRefs.filter(Boolean):[];
 if(!refs.length)return null;
 const marks=refs.map(()=>'?').join(',');
 lesson=await db.row(`SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id
   WHERE t.subject_id=? AND l.slug IN (${marks}) AND l.published=1
   ORDER BY l.id LIMIT 1`,subjectId,...refs);
 return lesson||null;
}

async function ensureChemistryLineBank(db,{minimum=25}={}){
 const subject=await db.row("SELECT id FROM subjects WHERE slug='chemistry'");
 if(!subject)return {ok:false,inserted:0,lines:[],bankVersion:BANK_VERSION,mediumBankVersion:MEDIUM_BANK_VERSION};

 const retired=await retireOldGeneratedBanks(db,subject.id);
 const detached=await sanitizeExamLineAssignments(db,subject.id);
 const deduplicated=await removeSemanticDuplicates(db,subject.id);
 let inserted=0;const lines=[];

 for(const info of registry.lines){
   const line=Number(info.line),build=builders[line];
   if(typeof build!=='function'){
     lines.push({line,count:0,added:0,warning:'builder-not-found'});
     continue;
   }
   const prefix=`chemistry-bank-${BANK_VERSION}-line${line}-`;
   let existing=await bankItems(db,subject.id,line),count=existing.length;
   const accepted=existing.map(item=>({...item,content:parseJson(item.content_json)}));
   const fingerprints=new Set(accepted.map(fingerprint));
   const lesson=await resolveLineLesson(db,subject.id,info);
   if(!lesson){lines.push({line,count,added:0,warning:'lesson-not-found'});continue;}

   let added=0,skippedDuplicates=0;
   for(let n=1;count<minimum&&n<=160;n++){
     const key=`${prefix}${n}`;
     if(await db.row('SELECT id FROM questions WHERE external_key=?',key))continue;
     const raw=diversifyQuestion(build(n),{n,line,subject:'chemistry'});
     const item={...raw,difficulty:line>=29?3:Math.max(Number(raw.difficulty)||1,n%3===0?3:2)};
     const fp=fingerprint(item);
     if(fingerprints.has(fp)||accepted.some(previous=>nearDuplicate(previous,item))){skippedDuplicates++;continue;}
     await insertQuestion(db,{subject,lesson,line,info,key,item,source:'Оригинальный банк ОСНОВА · химия ЕГЭ-2027 · v3 · без смысловых дублей'});
     fingerprints.add(fp);accepted.push(item);count++;added++;inserted++;
   }
   existing=await bankItems(db,subject.id,line);count=existing.length;
   const hard=existing.filter(item=>parseJson(item.content_json)?.qualityTier==='hard').length;
   lines.push({line,count,hard,added,skippedDuplicates});
 }
 const ok=lines.length===34&&lines.every(x=>x.count>=minimum);
 if(retired)console.log(`Chemistry bank cleanup: retired ${retired} old/core-medium generated questions.`);
 if(detached)console.log(`Chemistry line cleanup: detached ${detached} non-v3 questions from strict line routing.`);
 if(deduplicated)console.log(`Chemistry semantic duplicate cleanup: hidden ${deduplicated} v3 duplicates.`);
 if(ok)console.log(`Chemistry v3 bank ready: >=${minimum} semantically distinct questions on all 34 lines; generated ${inserted}.`);
 else console.warn('Chemistry v3 line bank incomplete:',lines.filter(x=>x.count<minimum));
 return {ok,inserted,lines,bankVersion:BANK_VERSION,mediumBankVersion:MEDIUM_BANK_VERSION,retiredOldBank:retired,detachedMisclassified:detached,deduplicated};
}
module.exports={ensureChemistryLineBank,BANK_VERSION,MEDIUM_BANK_VERSION,fingerprint,sanitizeExamLineAssignments,resolveLineLesson};
