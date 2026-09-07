'use strict';
const registry=require('../content/biology/exam-lines.json');
const {build}=require('./biology-line-bank');

async function ensureBiologyLineBank(db,{minimum=15}={}){
  const subject=await db.row("SELECT id FROM subjects WHERE slug='biology'");
  if(!subject)return {ok:false,inserted:0,lines:[]};
  let inserted=0;const lines=[];
  for(const info of registry.lines){
    const line=Number(info.line);
    let count=Number((await db.row('SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line=? AND active=1 AND published=1',subject.id,line))?.n||0);
    const marks=info.lessonRefs.map(()=>'?').join(',');
    const lesson=await db.row(`SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND l.slug IN (${marks}) ORDER BY l.id LIMIT 1`,subject.id,...info.lessonRefs);
    if(!lesson){lines.push({line,count,added:0,warning:'lesson-not-found'});continue;}
    let added=0;
    for(let n=1;count<minimum&&n<=60;n++){
      const key=`biology-bank-v4-line${line}-${n}`;
      if(await db.row('SELECT id FROM questions WHERE external_key=?',key))continue;
      const item=build(line,n),maxScore=item.maxScore||info.maxScore||1;
      const result=await db.run(`INSERT INTO questions(
        subject_id,topic_id,lesson_id,external_key,type,question_type,prompt,instruction,explanation,difficulty,
        answer_json,answer_data_json,explanation_json,content_json,media_json,source,source_type,exam_line,points,estimated_seconds,
        active,published,exam_year,solution_steps_json,max_score,content_status
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,TRUE,?,?,?,?)`,
        subject.id,lesson.topic_id,lesson.id,key,item.type,item.questionType,item.prompt,item.instruction,item.explanation,item.difficulty,
        JSON.stringify(item.answer),JSON.stringify({correct:item.answer,acceptedVariants:item.acceptedVariants||[],content:item.content||{}}),
        JSON.stringify({short:item.explanation,fullSolution:item.explanation,scoringPoints:item.content?.criteria||[]}),JSON.stringify(item.content||{}),'{}',
        'Оригинальный банк ОСНОВА','original',line,maxScore,line>=22?360:120,2027,JSON.stringify(item.solutionSteps||[]),maxScore,'review');
      const questionId=Number(result.lastInsertRowid);
      for(const [i,opt] of (item.options||[]).entries())await db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',questionId,String(opt.value),String(opt.label),i);
      count++;added++;inserted++;
    }
    lines.push({line,count,added});
  }
  const ok=lines.every(x=>x.count>=minimum);
  if(ok)console.log(`Biology line bank ready: >=${minimum} active questions on all 28 lines; generated ${inserted}.`);
  else console.warn('Biology line bank incomplete:',lines.filter(x=>x.count<minimum));
  return {ok,inserted,lines};
}
module.exports={ensureBiologyLineBank};
