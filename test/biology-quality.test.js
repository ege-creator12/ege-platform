'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const {resolve}=require('node:path');
const {variantQuestions}=require('../content/biology/mock-variants');
const {scoreAnswer}=require('../src/mock-exams');
const {finalize}=require('../scripts/finalize-biology-quality');
const controls=require('../public/question-controls');
const {needsManualReview,isCorrectAnswer}=require('../src/question-answer');
const course=require('../content/biology/course.json');
const {isBiologyFipiFormat}=require('../src/ege-fipi-format');
const snapshot=q=>({...q,answerJson:JSON.stringify(q.answer)});

test('all 84 reviewed exam tasks have usable controls, media, score modes and complete answer keys',()=>{
 const keys=new Set();
 for(let v=1;v<=3;v++){
  const qs=variantQuestions(v);
  assert.equal(qs.length,28);
  assert.equal(qs.slice(0,21).reduce((sum,q)=>sum+scoreAnswer(snapshot(q),q.answer),0),35);
  assert.equal(qs.slice(21).reduce((sum,q)=>sum+q.maxScore,0),22);
  for(const q of qs){
   assert(!keys.has(q.key));keys.add(q.key);
   assert.equal(isBiologyFipiFormat(q.line,q),true,`line ${q.line}, variant ${v}: FIPI format mismatch`);
   const html=controls.render({...q,contentJson:q.content,mediaJson:q.image?{path:q.image}:{}},q.answer);
   if(q.type==='matching'){
    assert.equal((html.match(/data-match=/g)||[]).length,q.content.left.length);
    assert.equal(q.answer.length,q.content.left.length);
    assert(q.answer.every(a=>Number(a)>=0&&Number(a)<q.content.right.length));
   }else if(q.type==='sequence'){
    assert.match(html,/data-ordered/);assert.equal(q.answer.length,q.options.length);
    assert.deepEqual([...q.answer].sort(),q.options.map(o=>o.value).sort());
   }else if(q.type==='multiple'){
    assert.match(html,/checkbox/);assert.equal(new Set(q.answer).size,q.answer.length);
    assert(q.answer.every(a=>q.options.some(o=>o.value===a)));
   }else assert.match(html,/data-text-answer/);
   if([5,6,9,13,24].includes(q.line)){assert(q.image);assert(existsSync(resolve(__dirname,'../public',q.image.slice(1))));assert.match(html,/<img/)}
   if(q.line>=22){assert.equal(scoreAnswer(snapshot(q),q.answer),null);assert.equal(q.scoringPoints.length,q.maxScore)}
  }
  assert.equal(qs[21].prompt.slice(0,150),qs[22].prompt.slice(0,150),'experiment pair must share the same evidence');
  assert.match(controls.render({...qs[20],contentJson:qs[20].content}),/<table>/);
 }
 assert.equal(keys.size,84);
});
test('partial credit follows position, unordered selection and sequence rules separately',()=>{
 const q={scoringMode:'position',type:'matching',answerJson:'["0","1","0","1"]',maxScore:2};
 assert.equal(scoreAnswer(q,['0','1','0','1']),2);
 assert.equal(scoreAnswer(q,['0','0','0','1']),1);
 assert.equal(scoreAnswer(q,['1','0','0','1']),0);
 assert.equal(scoreAnswer(q,['0','1','0','1','0']),0);
 assert.equal(scoreAnswer(q,['0','1','0']),0);
 const m={...q,type:'multiple',scoringMode:'selection',answerJson:'["0","2","4"]'};
 for(const a of [['4','0','2'],['0','2','4']])assert.equal(scoreAnswer(m,a),2);
 for(const a of [['0','2'],['0','2','3'],['0','2','4','5'],['0','2','4','4']])assert.equal(scoreAnswer(m,a),1);
 assert.equal(scoreAnswer(m,['0','1','3']),0);
 const s={...q,type:'sequence',scoringMode:'sequence',answerJson:'["0","1","2","3","4"]'};
 assert.equal(scoreAnswer(s,['1','0','2','3','4']),1);
 assert.equal(scoreAnswer(s,['1','0','3','2','4']),0);
 assert.equal(scoreAnswer(s,['0','1','2','3','4','5']),1);
 assert.equal(scoreAnswer(s,[]),0);
});
test('the one-point data-analysis task needs both exact selected statements',()=>{
 const q=snapshot(variantQuestions(1)[20]);
 assert.equal(scoreAnswer(q,['1','0']),1);
 assert.equal(scoreAnswer(q,['0']),0);
 assert.equal(scoreAnswer(q,['0','1','2']),0);
});
test('editorial migration preserves every lesson and is repeatable',()=>{
 assert.deepEqual(finalize(structuredClone(course)),course);
 const lessons=course.sections.flatMap(s=>s.topics.flatMap(t=>t.lessons||[t.lesson].filter(Boolean)));
 assert.equal(new Set(lessons.map(l=>l.slug)).size,203);
 const humans=lessons.filter(l=>l.slug.startsWith('bio-human-'));
 assert.equal(humans.length,63);
 for(const l of humans)assert(l.blocks.some(b=>b.type==='table'&&b.content.columns?.[0]==='Структура или процесс'),l.slug);
 const questions=course.sections.flatMap(s=>s.topics.flatMap(t=>t.questions||[]));
 assert.equal(questions.filter(q=>q.contentStatus==='draft').length,315);
 assert.equal(questions.filter(q=>q.key.startsWith('biology-lesson-check-')).length,191);
 assert.equal(questions.filter(q=>q.examLine!=null).length,84);
 for(const q of questions.filter(q=>q.contentStatus!=='draft')){
  if(q.type==='matching')assert(q.content?.left?.length,q.key);
  if(q.type==='sequence'){assert(q.options?.length,q.key);assert(q.answer.every(a=>/^\d+$/.test(a)&&Number(a)<q.options.length),q.key)}
 }
});
test('genetic-code reference contains all 64 RNA codons exactly once',()=>{
 const lesson=course.sections.flatMap(s=>s.topics.flatMap(t=>t.lessons||[t.lesson].filter(Boolean))).find(l=>l.slug==='bio-molecular-3-lesson-3');
 const table=lesson.blocks.find(b=>b.type==='table'&&b.content.columns?.[0]==='Аминокислота или сигнал').content;
 const codons=table.rows.flatMap(row=>row[1].split(', '));
 assert.equal(codons.length,64);assert.equal(new Set(codons).size,64);
 assert(codons.every(c=>/^[АУГЦ]{3}$/.test(c)));
 assert.deepEqual(table.rows.find(r=>r[0]==='Стоп')[1].split(', '),['УАА','УАГ','УГА']);
 assert.equal(table.rows.find(r=>r[0]==='Метионин')[1],'АУГ');
});
test('free-form reasoning is self-reviewed, while factual keys retain automatic checking',()=>{
 assert(needsManualReview({type:'text',question_type:'extended_answer',answer_json:'["ответ"]'}));
 assert(needsManualReview({type:'text',answer_json:JSON.stringify(['Давление в желудочке возрастает и закрывает клапан, препятствуя обратному току крови.'])}));
 assert(!needsManualReview({type:'text',answer_json:'["митохондрия"]'}));
 assert(isCorrectAnswer({type:'text',answer_json:'["митохондрия"]'},[' МИТОХОНДРИЯ. ']));
 assert(!isCorrectAnswer({type:'text',answer_json:'["первая часть","вторая часть"]',acceptedVariants:[]},['первая часть']));
});
