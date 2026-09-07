'use strict';
const registry=require('../content/chemistry/exam-lines');
const builders=require('./chemistry-line-bank');
async function ensureChemistryLineBank(db,{minimum=20}={}){
 const subject=await db.row("SELECT id FROM subjects WHERE slug='chemistry'");
 if(!subject)return {ok:false,inserted:0,lines:[]};
 let inserted=0;const lines=[];
 for(const info of registry.lines){
   const line=Number(info.line),build=builders[line];
   if(typeof build!=='function'){lines.push({line,count:0,added:0,warning:'builder-not-found'});continue;}
   let count=Number((await db.row('SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line=? AND active=1 AND published=1',subject.id,line))?.n||0);
   const lessonSlug=`chemistry-line-${String(line).padStart(2,'0')}-lesson`;
   const lesson=await db.row('SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND l.slug=? AND l.published=1',subject.id,lessonSlug);
   if(!lesson){lines.push({line,count,added:0,warning:'lesson-not-found'});continue;}
   let added=0;
   for(let n=1;count<minimum&&n<=80;n++){
     const key=`chemistry-bank-v1-line${line}-${n}`;
     if(await db.row('SELECT id FROM questions WHERE external_key=?',key))continue;
     const item=build(n),maxScore=Number(item.maxScore||info.maxScore||1);
     const result=await db.run(`INSERT INTO questions(
       subject_id,topic_id,lesson_id,external_key,type,question_type,prompt,instruction,explanation,difficulty,
       answer_json,answer_data_json,explanation_json,content_json,media_json,source,source_type,exam_line,points,estimated_seconds,
       active,published,exam_year,solution_steps_json,max_score,content_status
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,TRUE,?,?,?,?)`,
       subject.id,lesson.topic_id,lesson.id,key,item.type,item.questionType,item.prompt,item.instruction||'',item.explanation,item.difficulty||1,
       JSON.stringify(item.answer||[]),JSON.stringify({correct:item.answer||[],acceptedVariants:item.acceptedVariants||[],content:item.content||{}}),
       JSON.stringify({short:item.explanation,fullSolution:item.explanation,scoringPoints:item.scoringPoints||item.content?.criteria||[]}),JSON.stringify(item.content||{}),'{}',
       'Оригинальный банк ОСНОВА · химия ЕГЭ-2027','original',line,maxScore,line>=29?600:line>=23?240:150,2027,JSON.stringify(item.solutionSteps||[]),maxScore,'review');
     const questionId=Number(result.lastInsertRowid);
     for(const [i,opt] of (item.options||[]).entries())await db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',questionId,String(opt.value),String(opt.label),i);
     count++;added++;inserted++;
   }
   lines.push({line,count,added});
 }
 const ok=lines.length===34&&lines.every(x=>x.count>=minimum);
 if(ok)console.log(`Chemistry line bank ready: >=${minimum} active questions on all 34 lines; generated ${inserted}.`);
 else console.warn('Chemistry line bank incomplete:',lines.filter(x=>x.count<minimum));
 return {ok,inserted,lines};
}
module.exports={ensureChemistryLineBank};
