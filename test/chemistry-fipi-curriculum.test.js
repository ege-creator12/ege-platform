'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const organic=require('../content/chemistry/curriculum-organic-v2');
const tail=require('../content/chemistry/curriculum-processes-calcs-v2');
const base=require('../content/chemistry/curriculum-v2');
const depth=require('../content/chemistry/curriculum-depth-v2');
const {course}=require('../src/chemistry-course-upgrade');

const codes=section=>new Set((section.topics||[]).flatMap(topic=>topic.lessons||[]).map(lesson=>String(lesson.title||'').match(/^(\d+\.\d+)\./)?.[1]).filter(Boolean));
const range=(major,from,to)=>Array.from({length:to-from+1},(_,i)=>`${major}.${from+i}`);
const expectCodes=(section,expected,label)=>{
 const actual=codes(section);
 for(const code of expected)assert(actual.has(code),`${label}: missing FIPI code ${code}`);
};

test('coded FIPI chemistry curriculum has no gaps in the explicit subject modules',()=>{
 const [processes,calculations,applied]=tail;
 expectCodes(processes,range(1,5,13),'reaction laws');
 expectCodes(organic,range(3,1,20),'organic chemistry');
 expectCodes(applied,range(4,1,4),'chemistry and life');
 expectCodes(calculations,range(5,1,8),'calculations');
});

test('inorganic course explicitly contains classes, metals, nonmetals, chains and identification',()=>{
 const inorganic=base.sections.find(section=>section.slug==='chemistry-inorganic');
 assert(inorganic,'inorganic section missing');
 const text=JSON.stringify(inorganic).toLowerCase();
 for(const token of ['оксид','основан','кислот','сол','металл','неметалл','качествен','цепоч'])assert(text.includes(token),`inorganic coverage missing ${token}`);
 const depthText=JSON.stringify(depth).toLowerCase();
 for(const token of ['натрий','калий','магни','кальци','алюмини','цинк','хром','желез','медь','металлург'])assert(depthText.includes(token),`depth inorganic coverage missing ${token}`);
});

test('student-facing course keeps all 34 exam lines connected to substantial subject theory',()=>{
 const data=course();
 const richLessons=data.sections.flatMap(section=>section.topics).filter(topic=>topic.slug.startsWith('chem-v2-')).flatMap(topic=>topic.lessons||[]);
 const richSlugs=new Set(richLessons.map(lesson=>lesson.slug));
 const registry=require('../content/chemistry/exam-lines');
 assert.equal(registry.lines.length,34);
 for(const line of registry.lines){
  assert(line.lessonRefs.length>=2,`line ${line.line}: too few theory links`);
  for(const ref of line.lessonRefs)assert(richSlugs.has(ref),`line ${line.line}: missing theory lesson ${ref}`);
 }
});