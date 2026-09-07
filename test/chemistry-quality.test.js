'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../content/chemistry/exam-lines');
const {THEORY,blocksFor}=require('../content/chemistry/theory');
const curriculum=require('../content/chemistry/curriculum-v2');
const organic=require('../content/chemistry/curriculum-organic-v2');
const tail=require('../content/chemistry/curriculum-processes-calcs-v2');
const {course}=require('../src/chemistry-course-upgrade');
const builders=require('../src/chemistry-line-bank');
const controls=require('../public/question-controls');

const nonEmptyString=value=>typeof value==='string'&&value.trim().length>0;
const badText=/\b(?:undefined|NaN|null)\b/i;

function collectText(value,out=[]){
 if(typeof value==='string')out.push(value);
 else if(Array.isArray(value))for(const item of value)collectText(item,out);
 else if(value&&typeof value==='object')for(const item of Object.values(value))collectText(item,out);
 return out;
}

test('chemistry registry fully describes the 2027 34-line exam model',()=>{
 assert.equal(registry.subject,'chemistry');
 assert.equal(registry.examYear,2027);
 assert.equal(registry.durationMinutes,210);
 assert.equal(registry.primaryScoreMax,56);
 assert.equal(registry.part1Count,28);
 assert.equal(registry.part2Count,6);
 assert.equal(registry.lines.length,34);
 assert.deepEqual(registry.lines.map(x=>x.line),Array.from({length:34},(_,i)=>i+1));
 assert.equal(registry.lines.reduce((sum,x)=>sum+x.maxScore,0),56);
 for(const info of registry.lines){
  assert(nonEmptyString(info.title),`line ${info.line}: title`);
  assert(nonEmptyString(info.answerFormat),`line ${info.line}: answer format`);
  assert(nonEmptyString(info.shortDescription),`line ${info.line}: short description`);
  assert(Array.isArray(info.skills)&&info.skills.length>=3,`line ${info.line}: skills`);
  assert(Array.isArray(info.strategy)&&info.strategy.length>=3,`line ${info.line}: strategy`);
  assert(Array.isArray(info.commonTraps)&&info.commonTraps.length>=2,`line ${info.line}: traps`);
  assert(Array.isArray(info.lessonRefs)&&info.lessonRefs.length>=2,`line ${info.line}: lesson refs`);
  assert(info.lessonRefs.every(ref=>ref.startsWith('chem-v2-')),`line ${info.line}: v2 lesson refs only`);
  assert.equal(info.part,info.line<=28?1:2,`line ${info.line}: part`);
  assert.equal(info.extended,info.line>=29,`line ${info.line}: extended flag`);
 }
});

test('all 34 legacy line theory lessons retain the complete learning scaffold',()=>{
 assert.deepEqual(Object.keys(THEORY).map(Number).sort((a,b)=>a-b),Array.from({length:34},(_,i)=>i+1));
 const requiredBlockTypes=['heading','definition','remember','table','algorithm','ege_example','deep_dive','summary','quiz'];
 for(let line=1;line<=34;line++){
  const theory=THEORY[line];
  assert(nonEmptyString(theory.title),`line ${line}: title`);
  assert(nonEmptyString(theory.definition),`line ${line}: definition`);
  assert(Array.isArray(theory.core)&&theory.core.length>=2&&theory.core.every(nonEmptyString),`line ${line}: core`);
  assert(Array.isArray(theory.facts)&&theory.facts.length>=2&&theory.facts.every(nonEmptyString),`line ${line}: facts`);
  assert(Array.isArray(theory.table)&&theory.table.length>=2&&theory.table.every(Array.isArray),`line ${line}: table`);
  assert(Array.isArray(theory.algorithm)&&theory.algorithm.length>=3&&theory.algorithm.every(nonEmptyString),`line ${line}: algorithm`);
  assert(nonEmptyString(theory.example),`line ${line}: worked example`);
  assert(Array.isArray(theory.traps)&&theory.traps.length>=2&&theory.traps.every(nonEmptyString),`line ${line}: traps`);
  assert(nonEmptyString(theory.deep),`line ${line}: deep dive`);
  assert(Array.isArray(theory.quiz)&&theory.quiz.length===2&&theory.quiz.every(nonEmptyString),`line ${line}: quiz`);
  const blocks=blocksFor(line);
  for(const type of requiredBlockTypes)assert(blocks.some(block=>block.type===type),`line ${line}: missing ${type}`);
  assert(blocks.filter(block=>block.type==='text').length>=theory.core.length,`line ${line}: core blocks`);
  const allText=collectText(blocks).join(' ');
  assert(!badText.test(allText),`line ${line}: broken rendered content`);
 }
});

test('chemistry v2 is a full six-section subject course while preserving all 34 line anchors',()=>{
 const data=course();
 assert.equal(data.subject.slug,'chemistry');
 assert.equal(data.subject.examYear,2027);
 assert.match(data.subject.sourceVersion,/chemistry v2/i);
 assert.equal(data.sections.length,6);
 assert.deepEqual(data.sections.map(s=>s.slug),[
  'chemistry-foundations','chemistry-inorganic','chemistry-organic',
  'chemistry-processes','chemistry-calculations','chemistry-applied'
 ]);
 const topics=data.sections.flatMap(section=>section.topics);
 const lineTopics=topics.filter(topic=>/^chemistry-line-\d{2}$/.test(topic.slug));
 const richTopics=topics.filter(topic=>topic.slug.startsWith('chem-v2-'));
 assert.equal(lineTopics.length,34,'all line anchors must remain for bank compatibility');
 assert.equal(new Set(lineTopics.map(topic=>topic.slug)).size,34);
 assert.deepEqual(lineTopics.flatMap(topic=>topic.examLines).sort((a,b)=>a-b),Array.from({length:34},(_,i)=>i+1));
 assert.equal(richTopics.length,24,'full v2 must contain twenty-four subject topics');
 const richLessons=richTopics.flatMap(topic=>topic.lessons||[]);
 assert.equal(richLessons.length,97,'depth-complete v2 must contain ninety-seven proper subject lessons');
 assert.equal(new Set(richLessons.map(l=>l.slug)).size,97,'all rich lesson slugs must be unique');
 const richLessonSlugs=new Set(richLessons.map(l=>l.slug));
 const required=['heading','definition','remember','table','algorithm','ege_example','deep_dive','summary','quiz'];
 for(const topic of richTopics){
  assert(Array.isArray(topic.examLines)&&topic.examLines.length>=1,`${topic.slug}: exam line mapping`);
  assert(Array.isArray(topic.skills)&&topic.skills.length>=1,`${topic.slug}: skills`);
  assert.deepEqual(topic.questions,[],`${topic.slug}: line bank owns practice`);
  for(const l of topic.lessons){
   assert.equal(l.contentStatus,'verified',`${l.slug}: verified`);
   assert(nonEmptyString(l.title)&&nonEmptyString(l.summary),`${l.slug}: title/summary`);
   assert(Array.isArray(l.blocks)&&l.blocks.length>=12,`${l.slug}: rich lesson blocks`);
   for(const type of required)assert(l.blocks.some(block=>block.type===type),`${l.slug}: missing ${type}`);
   const text=collectText(l.blocks).join(' ');
   assert(text.length>=750,`${l.slug}: lesson is too thin (${text.length})`);
   assert(!badText.test(text),`${l.slug}: broken rendered content`);
  }
 }
 for(const info of registry.lines){
  for(const ref of info.lessonRefs)assert(richLessonSlugs.has(ref),`line ${info.line}: unknown v2 lesson ref ${ref}`);
 }
});

test('chemistry v2 source modules have the expected editorial coverage',()=>{
 assert.deepEqual(curriculum.sections.map(s=>s.slug),['chemistry-foundations','chemistry-inorganic']);
 const baseLessons=curriculum.sections.flatMap(s=>s.topics).flatMap(t=>t.lessons);
 assert.equal(baseLessons.length,30);
 assert.equal(organic.slug,'chemistry-organic');
 assert.equal(organic.topics.flatMap(t=>t.lessons).length,20,'FIPI organic block 3.1-3.20');
 assert.deepEqual(tail.map(s=>s.slug),['chemistry-processes','chemistry-calculations','chemistry-applied']);
 assert.equal(tail[0].topics.flatMap(t=>t.lessons).length,11);
 assert.equal(tail[1].topics.flatMap(t=>t.lessons).length,8,'FIPI calculation block 5.1-5.8');
 assert.equal(tail[2].topics.flatMap(t=>t.lessons).length,4,'FIPI applied block 4.1-4.4');
});

test('all 680 startup chemistry tasks have usable answers, controls and clean content',()=>{
 let count=0;
 for(let line=1;line<=34;line++){
  const build=builders[line];
  assert.equal(typeof build,'function',`line ${line}: builder`);
  for(let n=1;n<=20;n++){
   const q=build(n);count++;
   assert(nonEmptyString(q.prompt),`line ${line}, item ${n}: prompt`);
   assert(nonEmptyString(q.instruction),`line ${line}, item ${n}: instruction`);
   assert(nonEmptyString(q.explanation),`line ${line}, item ${n}: explanation`);
   assert(Array.isArray(q.answer)&&q.answer.length>=1&&q.answer.every(nonEmptyString),`line ${line}, item ${n}: answer`);
   assert(Number.isInteger(q.difficulty)&&q.difficulty>=1&&q.difficulty<=3,`line ${line}, item ${n}: difficulty`);
   const allText=collectText(q).join(' ');
   assert(!badText.test(allText),`line ${line}, item ${n}: broken content`);
   if(q.type==='single'||q.type==='multiple'||q.type==='sequence'){
    assert(Array.isArray(q.options)&&q.options.length>=2,`line ${line}, item ${n}: options`);
    const values=new Set(q.options.map(option=>String(option.value)));
    assert.equal(values.size,q.options.length,`line ${line}, item ${n}: duplicate option values`);
    assert(q.options.every(option=>nonEmptyString(String(option.label))),`line ${line}, item ${n}: option labels`);
    assert(q.answer.every(answer=>values.has(String(answer))),`line ${line}, item ${n}: answer points to option`);
   }
   if(q.type==='matching'){
    assert(Array.isArray(q.content?.left)&&q.content.left.length>=2,`line ${line}, item ${n}: matching left`);
    assert(Array.isArray(q.content?.right)&&q.content.right.length>=2,`line ${line}, item ${n}: matching right`);
    assert.equal(q.answer.length,q.content.left.length,`line ${line}, item ${n}: matching answer length`);
    assert(q.answer.every(answer=>Number.isInteger(Number(answer))&&Number(answer)>=0&&Number(answer)<q.content.right.length),`line ${line}, item ${n}: matching answer index`);
   }
   const html=controls.render({...q,contentJson:q.content||{},mediaJson:{}},q.answer);
   assert(nonEmptyString(html),`line ${line}, item ${n}: rendered control`);
   if(q.questionType==='extended_answer'){
    assert.equal(q.manualReview,true,`line ${line}, item ${n}: manual review`);
    assert(Array.isArray(q.scoringPoints)&&q.scoringPoints.length===q.maxScore,`line ${line}, item ${n}: scoring criteria`);
   }
  }
 }
 assert.equal(count,680);
});

test('foundation lines follow their EGE-style answer families',()=>{
 for(let line=1;line<=4;line++)for(let n=1;n<=20;n++){
  const q=builders[line](n);
  assert.equal(q.type,'multiple',`line ${line}, item ${n}: expected positional multiple choice`);
  assert.equal(q.answer.length,2,`line ${line}, item ${n}: exactly two positions`);
  assert.equal(q.options.length,5,`line ${line}, item ${n}: five-position row`);
 }
 for(let n=1;n<=20;n++){
  const q=builders[5](n);
  assert.equal(q.type,'matching',`line 5, item ${n}: matching format`);
  assert.equal(q.content.left.length,3,`line 5, item ${n}: three formulas`);
  assert(q.content.right.length>=4,`line 5, item ${n}: answer list`);
 }
});

test('core chemistry lines use positional and sequence controls instead of generic single-choice',()=>{
 for(const line of [6,7,8,14,15])for(let n=1;n<=20;n++){
  const q=builders[line](n);
  assert.equal(q.type,'multiple',`line ${line}, item ${n}: multiple positions`);
  assert.equal(q.answer.length,2,`line ${line}, item ${n}: exactly two correct positions`);
  assert.equal(q.options.length,5,`line ${line}, item ${n}: five choices`);
 }
 for(const line of [9,16])for(let n=1;n<=20;n++){
  const q=builders[line](n);
  assert.equal(q.type,'sequence',`line ${line}, item ${n}: ordered sequence`);
  assert(q.answer.length>=2,`line ${line}, item ${n}: ordered answers`);
  assert(q.options.length>=4,`line ${line}, item ${n}: reagent bank`);
 }
});