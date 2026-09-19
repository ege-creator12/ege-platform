'use strict';
const registry=require('../content/biology/exam-lines.json');
const {buildStrictV7}=require('./biology-strict-line-bank-v7');
const {build:buildCore}=require('./biology-line-bank');
const {build:buildSupplement}=require('./biology-line-unique-supplement');
const {build:buildHardLine26}=require('./biology-line26-hard-bank');
const {semanticFingerprint,nearDuplicate}=require('./question-semantic-quality');

const { BIOLOGY_BANK_VERSION: BANK_VERSION }=require('./biology-bank-version');

function parseJson(value){
  if(!value)return {};
  if(typeof value==='object')return value;
  try{return JSON.parse(value);}catch{return {};}
}
function fingerprint(item){return semanticFingerprint({...item,content:item.content||parseJson(item.content_json)});}
const generatedKey=key=>/^biology-bank-/i.test(String(key||''));

function lineRule(info){
  const line=Number(info.line);
  if(line===26)return {line,patterns:[`biology-bank-v${BANK_VERSION}-line26-hard-%`],refs:[]};
  return {line,patterns:[`biology-bank-v${BANK_VERSION}-line${line}-%`],refs:[]};
}
function trustedWhere(rule){
  const parts=rule.patterns.map(()=>`external_key LIKE ?`),params=[...rule.patterns];
  return {sql:`(${parts.join(' OR ')})`,params};
}
function prepareItem(line,item){
  if(!item)return null;
  const difficulty=Math.max(1,Math.min(3,Number(item.difficulty)||1));
  return {
    ...item,
    difficulty,
    content:{
      ...(item.content||{}),
      strictFipi2027:true,
      strictExamLine:line,
      strictBankVersion:BANK_VERSION,
      qualityTier:difficulty>=3?'hard':'medium'
    }
  };
}
function candidateItems(line,seed){
  if(Number(line)===26){
    try{return [prepareItem(26,buildHardLine26(seed))].filter(Boolean);}catch{return [];}
  }
  const result=[];
  try{result.push(prepareItem(line,buildStrictV7(line,seed)));}catch{}
  try{result.push(prepareItem(line,buildCore(line,seed)));}catch{}
  try{
    const extra=buildSupplement(line,seed);
    if(extra)result.push(prepareItem(line,extra));
  }catch{}
  return result.filter(Boolean);
}

async function retireOldGeneratedBanks(db,subjectId){
  const row=await db.row(
    `SELECT COUNT(*) n FROM questions
     WHERE subject_id=? AND external_key LIKE 'biology-bank-%'
       AND external_key NOT LIKE ? AND active=1`,
    subjectId,`biology-bank-v${BANK_VERSION}-line%`
  );
  const retired=Number(row?.n||0);
  if(retired)await db.run(
    `UPDATE questions SET active=FALSE,published=FALSE,exam_line=NULL
     WHERE subject_id=? AND external_key LIKE 'biology-bank-%'
       AND external_key NOT LIKE ?`,
    subjectId,`biology-bank-v${BANK_VERSION}-line%`
  );
  return retired;
}

async function sanitizeExamLineAssignments(db,subjectId){
  let detached=0;
  for(const info of registry.lines){
    const rule=lineRule(info),trusted=trustedWhere(rule);
    const bad=await db.row(
      `SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line=? AND NOT ${trusted.sql}`,
      subjectId,rule.line,...trusted.params
    );
    const count=Number(bad?.n||0);
    if(!count)continue;
    await db.run(
      `UPDATE questions SET exam_line=NULL WHERE subject_id=? AND exam_line=? AND NOT ${trusted.sql}`,
      subjectId,rule.line,...trusted.params
    );
    detached+=count;
  }
  if(detached)console.log(`Biology exam-line cleanup: detached ${detached} non-v${BANK_VERSION} questions from strict line routing.`);
  return detached;
}

async function visibleQuestions(db,subjectId){
  const result=await db.rows(`SELECT q.id,q.external_key,q.exam_line,q.prompt,q.content_json,q.image_url,q.type,q.question_type,
    qo.value option_value,qo.label option_label,qo.position option_position
    FROM questions q LEFT JOIN question_options qo ON qo.question_id=q.id
    WHERE q.subject_id=? AND q.active=1 AND q.published=1
    ORDER BY q.id,qo.position`,subjectId);
  const map=new Map();
  for(const row of result){
    let item=map.get(Number(row.id));
    if(!item){
      item={
        id:Number(row.id),external_key:row.external_key,exam_line:Number(row.exam_line||0),
        prompt:row.prompt,content_json:row.content_json,image_url:row.image_url,
        type:row.type,questionType:row.question_type,options:[]
      };
      map.set(item.id,item);
    }
    if(row.option_value!==null&&row.option_value!==undefined)item.options.push({value:row.option_value,label:row.option_label});
  }
  return [...map.values()];
}

async function removeSemanticGeneratedDuplicates(db,subjectId){
  const items=await visibleQuestions(db,subjectId),seen=new Map();
  let hidden=0;
  for(const item of items){
    if(!generatedKey(item.external_key))continue;
    const fp=fingerprint(item),previous=seen.get(fp);
    if(!previous){seen.set(fp,item);continue;}
    await db.run('UPDATE questions SET active=0,published=0 WHERE id=?',item.id);
    hidden++;
  }
  const kept=(await visibleQuestions(db,subjectId)).filter(item=>generatedKey(item.external_key));
  return {hidden,fingerprints:new Set(kept.map(fingerprint))};
}

async function insertQuestion(db,{subjectId,lesson,line,info,key,item}){
  const maxScore=item.maxScore||info.maxScore||1;
  const result=await db.run(`INSERT INTO questions(
    subject_id,topic_id,lesson_id,external_key,type,question_type,prompt,instruction,explanation,difficulty,
    answer_json,answer_data_json,explanation_json,content_json,media_json,source,source_type,exam_line,points,estimated_seconds,
    active,published,exam_year,solution_steps_json,max_score,content_status,image_url
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,TRUE,?,?,?,?,?)`,
    subjectId,lesson.topic_id,lesson.id,key,item.type,item.questionType,item.prompt,item.instruction,item.explanation,item.difficulty,
    JSON.stringify(item.answer),JSON.stringify({correct:item.answer,acceptedVariants:item.acceptedVariants||[],content:item.content||{}}),
    JSON.stringify({short:item.explanation,fullSolution:item.explanation,scoringPoints:item.content?.criteria||[]}),JSON.stringify(item.content||{}),'{}',
    `ОСНОВА · авторский уникальный банк по формату ФИПИ ЕГЭ-2027 · v${BANK_VERSION}`,'original',line,maxScore,line>=22?360:120,2027,
    JSON.stringify(item.solutionSteps||[]),maxScore,'review',item.imageUrl||null
  );
  const questionId=Number(result.lastInsertRowid);
  for(const [i,opt] of (item.options||[]).entries()){
    await db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',questionId,String(opt.value),String(opt.label),i);
  }
}

async function trustedLineItems(db,subjectId,info){
  const rule=lineRule(info),trusted=trustedWhere(rule);
  const rows=await db.rows(`SELECT q.id,q.external_key,q.prompt,q.content_json,q.image_url,q.type,q.question_type,
    qo.value option_value,qo.label option_label,qo.position option_position
    FROM questions q LEFT JOIN question_options qo ON qo.question_id=q.id
    WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 AND ${trusted.sql}
    ORDER BY q.id,qo.position`,subjectId,rule.line,...trusted.params);
  const map=new Map();
  for(const row of rows){
    let item=map.get(Number(row.id));
    if(!item){
      item={id:Number(row.id),external_key:row.external_key,prompt:row.prompt,content_json:row.content_json,image_url:row.image_url,type:row.type,questionType:row.question_type,options:[]};
      map.set(item.id,item);
    }
    if(row.option_value!==null&&row.option_value!==undefined)item.options.push({value:row.option_value,label:row.option_label});
  }
  return [...map.values()];
}

async function ensureBiologyLineBank(db,{minimum=25}={}){
  const subject=await db.row("SELECT id FROM subjects WHERE slug='biology'");
  if(!subject)return {ok:false,inserted:0,lines:[],bankVersion:BANK_VERSION};

  const retired=await retireOldGeneratedBanks(db,subject.id);
  const detached=await sanitizeExamLineAssignments(db,subject.id);
  const cleanup=await removeSemanticGeneratedDuplicates(db,subject.id);
  const fingerprints=cleanup.fingerprints;
  const keyRows=await db.rows('SELECT external_key FROM questions WHERE subject_id=? AND external_key IS NOT NULL',subject.id);
  const existingKeys=new Set(keyRows.map(x=>String(x.external_key)));
  let inserted=0;
  const lines=[];

  for(const info of registry.lines){
    const line=Number(info.line);
    let kept=await trustedLineItems(db,subject.id,info),count=kept.length;
    const accepted=kept.map(item=>({...item,content:parseJson(item.content_json)}));
    const marks=info.lessonRefs.map(()=>'?').join(',');
    const lesson=await db.row(
      `SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id
       WHERE t.subject_id=? AND l.slug IN (${marks}) ORDER BY l.id LIMIT 1`,
      subject.id,...info.lessonRefs
    );
    if(!lesson){lines.push({line,count,added:0,warning:'lesson-not-found'});continue;}

    let added=0,skippedDuplicates=0,serial=1;
    for(let seed=1;seed<=420&&count<minimum;seed++){
      for(const item of candidateItems(line,seed)){
        if(count>=minimum)break;
        const key=line===26
          ? `biology-bank-v${BANK_VERSION}-line26-hard-${serial++}`
          : `biology-bank-v${BANK_VERSION}-line${line}-${serial++}`;
        if(existingKeys.has(key))continue;
        const fp=fingerprint(item);
        if(fingerprints.has(fp)||accepted.some(previous=>nearDuplicate(previous,item))){
          skippedDuplicates++;
          continue;
        }
        await insertQuestion(db,{subjectId:subject.id,lesson,line,info,key,item});
        existingKeys.add(key);
        fingerprints.add(fp);
        accepted.push(item);
        count++;
        added++;
        inserted++;
      }
    }

    kept=await trustedLineItems(db,subject.id,info);
    count=kept.length;
    const hard=kept.filter(item=>parseJson(item.content_json)?.qualityTier==='hard').length;
    lines.push({line,count,added,hard,skippedDuplicates});
  }

  const ok=lines.every(x=>x.count>=minimum);
  if(retired)console.log(`Biology bank cleanup: retired ${retired} older generated questions.`);
  if(cleanup.hidden)console.log(`Biology semantic duplicate cleanup: hidden ${cleanup.hidden} generated duplicates.`);
  if(ok)console.log(`Biology v${BANK_VERSION} bank ready: >=${minimum} genuinely distinct tasks on all 28 lines; generated ${inserted}.`);
  else console.warn(`Biology v${BANK_VERSION} bank incomplete:`,lines.filter(x=>x.count<minimum));
  return {
    ok,inserted,lines,deduplicated:cleanup.hidden,retiredOldBank:retired,
    detachedMisclassified:detached,bankVersion:BANK_VERSION
  };
}

module.exports={ensureBiologyLineBank,fingerprint,sanitizeExamLineAssignments,lineRule,BANK_VERSION};
