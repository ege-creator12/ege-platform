'use strict';
const registry=require('../content/biology/exam-lines.json');
const {buildStrictV6}=require('./biology-strict-line-bank-v6');

const normalize=value=>String(value??'').toLocaleLowerCase('ru-RU').replace(/\s+/g,' ').trim();
function canonicalJson(value){
  try{return JSON.stringify(typeof value==='string'?JSON.parse(value||'{}'):(value||{}));}
  catch{return normalize(value);}
}
function fingerprint(item){
  const options=(item.options||[]).map(o=>[String(o.value??''),normalize(o.label)]);
  return [normalize(item.prompt),canonicalJson(item.content||item.content_json||{}),JSON.stringify(options),String(item.imageUrl||item.image_url||'')].join('|');
}
const generatedKey=key=>/^biology-bank-/i.test(String(key||''));

function lineRule(info){
  const line=Number(info.line);
  return {line,patterns:[`biology-bank-v6-line${line}-%`],refs:[]};
}
function trustedWhere(rule){
  const parts=rule.patterns.map(()=>`external_key LIKE ?`),params=[...rule.patterns];
  return {sql:`(${parts.join(' OR ')})`,params};
}

async function sanitizeExamLineAssignments(db,subjectId){
  let detached=0;
  for(const info of registry.lines){
    const rule=lineRule(info),trusted=trustedWhere(rule);
    const bad=await db.row(`SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line=? AND NOT ${trusted.sql}`,subjectId,rule.line,...trusted.params);
    const count=Number(bad?.n||0);
    if(!count)continue;
    await db.run(`UPDATE questions SET exam_line=NULL WHERE subject_id=? AND exam_line=? AND NOT ${trusted.sql}`,subjectId,rule.line,...trusted.params);
    detached+=count;
  }
  if(detached)console.log(`Biology exam-line cleanup: detached ${detached} non-v6 questions from strict line routing.`);
  return detached;
}

async function visibleQuestions(db,subjectId){
  const result=await db.rows(`SELECT q.id,q.external_key,q.exam_line,q.prompt,q.content_json,q.image_url,
    qo.value option_value,qo.label option_label,qo.position option_position
    FROM questions q LEFT JOIN question_options qo ON qo.question_id=q.id
    WHERE q.subject_id=? AND q.active=1 AND q.published=1
    ORDER BY q.id,qo.position`,subjectId);
  const map=new Map();
  for(const row of result){
    let item=map.get(Number(row.id));
    if(!item){item={id:Number(row.id),external_key:row.external_key,exam_line:Number(row.exam_line||0),prompt:row.prompt,content_json:row.content_json,image_url:row.image_url,options:[]};map.set(item.id,item);}
    if(row.option_value!==null&&row.option_value!==undefined)item.options.push({value:row.option_value,label:row.option_label});
  }
  return [...map.values()];
}

async function removeExactGeneratedDuplicates(db,subjectId){
  const items=await visibleQuestions(db,subjectId),seen=new Map();
  let hidden=0,authoredDuplicatesHidden=0;
  for(const item of items){
    const fp=fingerprint(item),previous=seen.get(fp);
    if(!previous){seen.set(fp,item);continue;}
    const currentGenerated=generatedKey(item.external_key),previousGenerated=generatedKey(previous.external_key);
    if(currentGenerated){await db.run('UPDATE questions SET active=0,published=0 WHERE id=?',item.id);hidden++;}
    else if(previousGenerated){await db.run('UPDATE questions SET active=0,published=0 WHERE id=?',previous.id);hidden++;seen.set(fp,item);}
    else{await db.run('UPDATE questions SET active=0,published=0 WHERE id=?',item.id);hidden++;authoredDuplicatesHidden++;}
  }
  const kept=(await visibleQuestions(db,subjectId)).map(item=>fingerprint(item));
  return {hidden,authoredDuplicatesHidden,fingerprints:new Set(kept)};
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
    'ОСНОВА · строгий авторский банк по формату ФИПИ ЕГЭ-2027','original',line,maxScore,line>=22?360:120,2027,JSON.stringify(item.solutionSteps||[]),maxScore,'review',item.imageUrl||null);
  const questionId=Number(result.lastInsertRowid);
  for(const [i,opt] of (item.options||[]).entries())await db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',questionId,String(opt.value),String(opt.label),i);
}

async function trustedLineCount(db,subjectId,info){
  const rule=lineRule(info),trusted=trustedWhere(rule);
  const result=await db.row(`SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line=? AND active=1 AND published=1 AND ${trusted.sql}`,subjectId,rule.line,...trusted.params);
  return Number(result?.n||0);
}

async function ensureBiologyLineBank(db,{minimum=24}={}){
  const subject=await db.row("SELECT id FROM subjects WHERE slug='biology'");
  if(!subject)return {ok:false,inserted:0,lines:[]};
  const detached=await sanitizeExamLineAssignments(db,subject.id);
  const cleanup=await removeExactGeneratedDuplicates(db,subject.id);
  const fingerprints=cleanup.fingerprints;
  const keyRows=await db.rows('SELECT external_key FROM questions WHERE subject_id=? AND external_key IS NOT NULL',subject.id);
  const existingKeys=new Set(keyRows.map(x=>String(x.external_key)));
  let inserted=0;const lines=[];

  for(const info of registry.lines){
    const line=Number(info.line);
    let count=await trustedLineCount(db,subject.id,info);
    const marks=info.lessonRefs.map(()=>'?').join(',');
    const lesson=await db.row(`SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND l.slug IN (${marks}) ORDER BY l.id LIMIT 1`,subject.id,...info.lessonRefs);
    if(!lesson){lines.push({line,count,added:0,warning:'lesson-not-found'});continue;}

    let added=0,skippedDuplicates=0;
    for(let n=1;n<=96&&count<minimum;n++){
      const key=`biology-bank-v6-line${line}-${n}`;
      if(existingKeys.has(key))continue;
      const item=buildStrictV6(line,n),fp=fingerprint(item);
      if(fingerprints.has(fp)){skippedDuplicates++;continue;}
      await insertQuestion(db,{subjectId:subject.id,lesson,line,info,key,item});
      existingKeys.add(key);fingerprints.add(fp);count++;added++;inserted++;
    }
    count=await trustedLineCount(db,subject.id,info);
    lines.push({line,count,added,skippedDuplicates});
  }

  const ok=lines.every(x=>x.count>=minimum);
  if(cleanup.hidden)console.log(`Biology duplicate cleanup: hidden ${cleanup.hidden} exact visible duplicates.`);
  if(ok)console.log(`Biology strict v6 line bank ready: >=${minimum} unique tasks on all 28 lines; generated ${inserted}.`);
  else console.warn('Biology strict v6 bank incomplete:',lines.filter(x=>x.count<minimum));
  return {ok,inserted,lines,deduplicated:cleanup.hidden,authoredDuplicatesHidden:cleanup.authoredDuplicatesHidden,detachedMisclassified:detached};
}
module.exports={ensureBiologyLineBank,fingerprint,sanitizeExamLineAssignments,lineRule};
