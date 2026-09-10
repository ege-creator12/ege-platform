'use strict';
const registry=require('../content/chemistry/exam-lines');
const builders=require('./chemistry-line-bank');
const {MEDIUM_BANK_VERSION,mediumVariant}=require('./chemistry-medium-bank');
const BANK_VERSION='v2';

async function insertQuestion(db,{subject,lesson,line,info,key,item,source}){
 const maxScore=Number(item.maxScore||info.maxScore||1);
 const result=await db.run(`INSERT INTO questions(
   subject_id,topic_id,lesson_id,external_key,type,question_type,prompt,instruction,explanation,difficulty,
   answer_json,answer_data_json,explanation_json,content_json,media_json,source,source_type,exam_line,points,estimated_seconds,
   active,published,exam_year,solution_steps_json,max_score,content_status
 ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,TRUE,?,?,?,?)`,
   subject.id,lesson.topic_id,lesson.id,key,item.type,item.questionType,item.prompt,item.instruction||'',item.explanation,item.difficulty||1,
   JSON.stringify(item.answer||[]),JSON.stringify({correct:item.answer||[],acceptedVariants:item.acceptedVariants||[],content:item.content||{}}),
   JSON.stringify({short:item.explanation,fullSolution:item.explanation,scoringPoints:item.scoringPoints||item.content?.criteria||[]}),JSON.stringify(item.content||{}),'{}',
   source,'original',line,maxScore,line>=29?600:line>=23?240:150,2027,JSON.stringify(item.solutionSteps||[]),maxScore,'review');
 const questionId=Number(result.lastInsertRowid);
 for(const [i,opt] of (item.options||[]).entries())await db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',questionId,String(opt.value),String(opt.label),i);
 return questionId;
}

async function sanitizeChemistryLineAssignments(db,subjectId){
 const core=`chemistry-bank-${BANK_VERSION}-line%`,medium=`chemistry-medium-${MEDIUM_BANK_VERSION}-line%`;
 const row=await db.row(`SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line BETWEEN 1 AND 34 AND COALESCE(external_key,'') NOT LIKE ? AND COALESCE(external_key,'') NOT LIKE ?`,subjectId,core,medium);
 const changed=Number(row?.n||0);
 if(changed)await db.run(`UPDATE questions SET exam_line=NULL WHERE subject_id=? AND exam_line BETWEEN 1 AND 34 AND COALESCE(external_key,'') NOT LIKE ? AND COALESCE(external_key,'') NOT LIKE ?`,subjectId,core,medium);
 return changed;
}

async function ensureChemistryLineBank(db,{minimum=24,mediumMinimum=24}={}){
 const subject=await db.row("SELECT id FROM subjects WHERE slug='chemistry'");
 if(!subject)return {ok:false,inserted:0,lines:[],bankVersion:BANK_VERSION,mediumBankVersion:MEDIUM_BANK_VERSION};

 await db.run("UPDATE questions SET active=FALSE,published=FALSE WHERE subject_id=? AND external_key LIKE 'chemistry-bank-v1-line%'",subject.id);
 const detached=await sanitizeChemistryLineAssignments(db,subject.id);

 let inserted=0;const lines=[];
 for(const info of registry.lines){
   const line=Number(info.line),build=builders[line];
   if(typeof build!=='function'){
     lines.push({line,count:0,bankCount:0,mediumCount:0,added:0,mediumAdded:0,warning:'builder-not-found'});
     continue;
   }
   const prefix=`chemistry-bank-${BANK_VERSION}-line${line}-`;
   const mediumPrefix=`chemistry-medium-${MEDIUM_BANK_VERSION}-line${line}-`;
   let bankCount=Number((await db.row("SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line=? AND active=1 AND published=1 AND external_key LIKE ?",subject.id,line,`${prefix}%`))?.n||0);
   let mediumCount=Number((await db.row("SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line=? AND active=1 AND published=1 AND external_key LIKE ?",subject.id,line,`${mediumPrefix}%`))?.n||0);
   let count=bankCount+mediumCount;
   const lessonSlug=`chemistry-line-${String(line).padStart(2,'0')}-lesson`;
   const lesson=await db.row('SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND l.slug=? AND l.published=1',subject.id,lessonSlug);
   if(!lesson){lines.push({line,count,bankCount,mediumCount,added:0,mediumAdded:0,warning:'lesson-not-found'});continue;}

   let added=0;
   for(let n=1;bankCount<minimum&&n<=80;n++){
     const key=`${prefix}${n}`;
     if(await db.row('SELECT id FROM questions WHERE external_key=?',key))continue;
     await insertQuestion(db,{subject,lesson,line,info,key,item:build(n),source:'Оригинальный банк ОСНОВА · химия ЕГЭ-2027'});
     bankCount++;count++;added++;inserted++;
   }

   let mediumAdded=0;
   for(let n=1;mediumCount<mediumMinimum&&n<=80;n++){
     const key=`${mediumPrefix}${n}`;
     if(await db.row('SELECT id FROM questions WHERE external_key=?',key))continue;
     const base=build(((n-1)%20)+1);
     const item=mediumVariant(line,n,base);
     await insertQuestion(db,{subject,lesson,line,info,key,item,source:'Оригинальный банк ОСНОВА · химия ЕГЭ-2027 · средний уровень · структура ФИПИ'});
     mediumCount++;count++;mediumAdded++;inserted++;
   }
   lines.push({line,count,bankCount,mediumCount,added,mediumAdded});
 }
 const ok=lines.length===34&&lines.every(x=>x.bankCount>=minimum&&x.mediumCount>=mediumMinimum);
 if(ok)console.log(`Chemistry banks ready: >=${minimum} core + >=${mediumMinimum} medium questions on all 34 lines; generated ${inserted}; detached ${detached} legacy line assignments.`);
 else console.warn('Chemistry line banks incomplete:',lines.filter(x=>x.bankCount<minimum||x.mediumCount<mediumMinimum));
 return {ok,inserted,detached,lines,bankVersion:BANK_VERSION,mediumBankVersion:MEDIUM_BANK_VERSION};
}
module.exports={ensureChemistryLineBank,sanitizeChemistryLineAssignments,BANK_VERSION,MEDIUM_BANK_VERSION};
