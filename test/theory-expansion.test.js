'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {expand,additions}=require('../scripts/expand-biology-foundations');
const {validateCourse}=require('../src/bootstrap');
const course=JSON.parse(fs.readFileSync(path.join(__dirname,'../content/biology/course.json'),'utf8'));
const lessons=course.sections.flatMap(s=>s.topics.flatMap(t=>t.lessons||[t.lesson].filter(Boolean)));

test('foundation expansion preserves valid course structure and lesson identities',()=>{
 assert.equal(validateCourse(course),true);
 assert.equal(lessons.length,203);
 assert.equal(new Set(lessons.map(l=>l.slug)).size,203);
 assert.equal(course.sections.flatMap(s=>s.topics.flatMap(t=>t.questions||[])).length,1226);
});
test('expansion is idempotent, with every supplement before the summary',()=>{
 assert.deepEqual(expand(structuredClone(course)),course);
 for(const [slug,blocks] of Object.entries(additions)){
  const l=lessons.find(l=>l.slug===slug);
  const start=l.blocks.findIndex(b=>b.type==='heading'&&b.content.text===blocks[0].content.text);
  const summary=l.blocks.findIndex(b=>b.type==='summary');
  assert(start>=0&&start+blocks.length<=summary,slug);
  assert.deepEqual(l.blocks.slice(start,start+blocks.length),blocks);
  assert(blocks.some(b=>b.type==='ege_example'),slug+' needs an applied example');
  assert.equal(l.contentStatus,'review');
 }
});
test('diploidy is two sets, not two pairs',()=>{
 const cycle=lessons.find(l=>l.slug==='bio-cell-3-lesson');
 const corpus=JSON.stringify(cycle);
 assert(!corpus.includes('две пары гомологов'));
 assert(corpus.includes('два набора гомологичных хромосом'));
 assert(corpus.includes('Теломеры'));
 assert(corpus.includes('апоптоз'));
});
test('polymeria probabilities follow enumeration, not a memorized ratio',()=>{
 const gametes=['AB','Ab','aB','ab'];
 const frequencies=Array(5).fill(0);
 for(const a of gametes)for(const b of gametes)frequencies[[...a,...b].filter(x=>x==='A'||x==='B').length]++;
 assert.deepEqual(frequencies,[1,4,6,4,1]);
 assert.equal(frequencies[2]/16,3/8);
 assert(JSON.stringify(additions['bio-genetics-1-lesson-3']).includes('3/8'));
});
test('non-allelic examples use their stated phenotype grouping',()=>{
 const gametes=['AB','Ab','aB','ab'];
 const epistasis=[0,0,0];let complementary=0;
 for(const a of gametes)for(const b of gametes){
  const A=a[0]==='A'||b[0]==='A', B=a[1]==='B'||b[1]==='B';
  if(A&&B)complementary++;
  epistasis[!A?2:B?0:1]++;
 }
 assert.equal(complementary,9);
 assert.deepEqual(epistasis,[9,3,4]);
});
test('five alleles yield 15 unordered diploid genotypes',()=>{
 let count=0;for(let a=0;a<5;a++)for(let b=a;b<5;b++)count++;
 assert.equal(count,15);
});
