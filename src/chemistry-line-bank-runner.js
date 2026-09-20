'use strict';
const registry=require('../content/chemistry/exam-lines');
const strictFipi=require('./chemistry-bank-fipi-2027');
const {isChemistryFipiFormat}=require('./ege-fipi-format');
const sourceModules=[
  strictFipi,
  require('./chemistry-bank-foundations'),
  require('./chemistry-bank-inorganic'),
  require('./chemistry-bank-organic'),
  require('./chemistry-bank-processes'),
  require('./chemistry-bank-calculations'),
  require('./chemistry-bank-extended'),
  require('./chemistry-bank-foundations-ege'),
  require('./chemistry-bank-core-ege'),
  require('./chemistry-bank-first-part-ege'),
  require('./chemistry-bank-diverse-v3'),
  require('./chemistry-bank-diversity-final'),
  require('./chemistry-bank-line33-diverse')
];
const {build:buildSupplement}=require('./chemistry-bank-unique-supplement');
const {semanticFingerprint,nearDuplicate}=require('./question-semantic-quality');
const {CHEMISTRY_BANK_VERSION}=require('./chemistry-bank-version');

const BANK_VERSION=CHEMISTRY_BANK_VERSION;
const MEDIUM_BANK_VERSION='retired-v1';

function parseJson(value){
 if(!value)return {};
 if(typeof value==='object')return value;
 try{return JSON.parse(value);}catch{return {};}
}
function fingerprint(item){return semanticFingerprint({...item,content:item.content||parseJson(item.content_json)});}
function buildersFor(line){
 const builds=sourceModules.map(module=>module?.[line]).filter(fn=>typeof fn==='function');
 builds.push(seed=>buildSupplement(line,seed));
 return builds;
}
function prepareItem(line,raw,seed){
 if(!raw||!isChemistryFipiFormat(line,raw))return null;
 return {
   ...raw,
   difficulty:line>=29?3:Math.max(Number(raw.difficulty)||1,seed%3===0?3:2),
   content:{
     ...(raw.content||{}),
     strictFipi2027:true,
     strictExamLine:Number(line),
     strictFormatValidated:true,
     qualityBankVersion:BANK_VERSION
   }
 };
}

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
 for(const [i,opt] of (item.options||[]).entries()){
   await db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',questionId,String(opt.value),String(opt.label),i);
 }
 return questionId;
}

async function retireOldGeneratedBanks(db,subjectId){
 const currentPattern=`chemistry-bank-${BANK_VERSION}-line%`;
 const old=await db.row(
   `SELECT COUNT(*) n FROM questions
    WHERE subject_id=? AND active=1
      AND ((external_key LIKE 'chemistry-bank-%' AND external_key NOT LIKE ?) OR external_key LIKE 'chemistry-medium-%')`,
   subjectId,currentPattern
 );
 const retired=Number(old?.n||0);
 if(retired)await db.run(
   `UPDATE questions SET active=FALSE,published=FALSE,exam_line=NULL
    WHERE subject_id=?
      AND ((external_key LIKE 'chemistry-bank-%' AND external_key NOT LIKE ?) OR external_key LIKE 'chemistry-medium-%')`,
   subjectId,currentPattern
 );
 return retired;
}

async function sanitizeExamLineAssignments(db,subjectId){
 const pattern=`chemistry-bank-${BANK_VERSION}-line%`;
 const row=await db.row(
   `SELECT COUNT(*) n FROM questions
    WHERE subject_id=? AND exam_line BETWEEN 1 AND 34
      AND (external_key IS NULL OR external_key NOT LIKE ?)`,
   subjectId,pattern
 );
 const detached=Number(row?.n||0);
 if(detached)await db.run(
   `UPDATE questions SET exam_line=NULL
    WHERE subject_id=? AND exam_line BETWEEN 1 AND 34
      AND (external_key IS NULL OR external_key NOT LIKE ?)`,
   subjectId,pattern
 );
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
  if(!item){
    item={id:Number(row.id),external_key:row.external_key,prompt:row.prompt,content_json:row.content_json,type:row.type,questionType:row.question_type,options:[]};
    map.set(item.id,item);
  }
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
   await db.run('UPDATE questions SET active=FALSE,published=FALSE WHERE id=?',item.id);
   hidden++;
  }
 }
 return hidden;
}

async function resolveLineLesson(db,subjectId,info){
 const line=Number(info.line);
 const anchorSlug=`chemistry-line-${String(line).padStart(2,'0')}-lesson`;
 let lesson=await db.row(
   'SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND l.slug=? AND l.published=1',
   subjectId,anchorSlug
 );
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
 const keyRows=await db.rows('SELECT external_key FROM questions WHERE subject_id=? AND external_key IS NOT NULL',subject.id);
 const existingKeys=new Set(keyRows.map(row=>String(row.external_key)));
 let inserted=0;
 const lines=[];

 for(const info of registry.lines){
   const line=Number(info.line);
   const builds=buildersFor(line);
   if(!builds.length){
     lines.push({line,count:0,added:0,warning:'builder-not-found'});
     continue;
   }

   const prefix=`chemistry-bank-${BANK_VERSION}-line${line}-`;
   let existing=await bankItems(db,subject.id,line),count=existing.length;
   const accepted=existing.map(item=>({...item,content:parseJson(item.content_json)}));
   const fingerprints=new Set(accepted.map(fingerprint));
   const lesson=await resolveLineLesson(db,subject.id,info);
   if(!lesson){lines.push({line,count,added:0,warning:'lesson-not-found'});continue;}

   let added=0,skippedDuplicates=0,serial=1;
   for(let seed=1;seed<=360&&count<minimum;seed++){
     for(const build of builds){
       if(count>=minimum)break;
       let raw=null;
       try{raw=build(seed);}catch{}
       const item=prepareItem(line,raw,seed);
       if(!item)continue;

       const key=`${prefix}${serial++}`;
       if(existingKeys.has(key))continue;
       const fp=fingerprint(item);
       if(fingerprints.has(fp)||accepted.some(previous=>nearDuplicate(previous,item))){
         skippedDuplicates++;
         continue;
       }

       await insertQuestion(db,{
         subject,lesson,line,info,key,item,
         source:`ОСНОВА · авторский уникальный банк по формату ФИПИ · химия ЕГЭ-2027 · ${BANK_VERSION}`
       });
       existingKeys.add(key);
       fingerprints.add(fp);
       accepted.push(item);
       count++;
       added++;
       inserted++;
     }
   }

   existing=await bankItems(db,subject.id,line);
   count=existing.length;
   const hard=existing.filter(item=>parseJson(item.content_json)?.qualityTier==='hard').length;
   lines.push({line,count,hard,added,skippedDuplicates});
 }

 const ok=lines.length===34&&lines.every(x=>x.count>=minimum);
 if(retired)console.log(`Chemistry bank cleanup: retired ${retired} older generated questions.`);
 if(detached)console.log(`Chemistry line cleanup: detached ${detached} non-${BANK_VERSION} questions from strict line routing.`);
 if(deduplicated)console.log(`Chemistry semantic duplicate cleanup: hidden ${deduplicated} ${BANK_VERSION} duplicates.`);
 if(ok)console.log(`Chemistry ${BANK_VERSION} bank ready: >=${minimum} genuinely distinct questions on all 34 lines; generated ${inserted}.`);
 else console.warn(`Chemistry ${BANK_VERSION} line bank incomplete:`,lines.filter(x=>x.count<minimum));

 return {
   ok,inserted,lines,bankVersion:BANK_VERSION,mediumBankVersion:MEDIUM_BANK_VERSION,
   retiredOldBank:retired,detachedMisclassified:detached,deduplicated
 };
}

module.exports={ensureChemistryLineBank,BANK_VERSION,MEDIUM_BANK_VERSION,fingerprint,sanitizeExamLineAssignments,resolveLineLesson};
