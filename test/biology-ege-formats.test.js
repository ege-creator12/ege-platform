'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildStrictV7}=require('../src/biology-strict-line-bank-v7');
const {build:buildHardLine26}=require('../src/biology-line26-hard-bank');
const {BIOLOGY_FORMATS,isBiologyFipiFormat}=require('../src/ege-fipi-format');
const {variantQuestions}=require('../content/biology/mock-variants');

test('all biology strict builders obey FIPI 2026/2027 response mechanics',()=>{
  assert.deepEqual(Object.keys(BIOLOGY_FORMATS).map(Number),Array.from({length:28},(_,i)=>i+1));
  for(let line=1;line<=28;line++){
    for(let n=1;n<=25;n++){
      const q=line===26?buildHardLine26(n):buildStrictV7(line,n);
      assert.equal(isBiologyFipiFormat(line,q),true,
        `line ${line}, item ${n}: wrong control/answer shape: ${q?.type}/${q?.questionType}`);
      assert(Array.isArray(q.solutionSteps)&&q.solutionSteps.length>=1,
        `line ${line}, item ${n}: missing solution steps`);
    }
  }
});

test('biology line 2 is experiment multiple choice, never old change matching',()=>{
  for(let n=1;n<=30;n++){
    const q=buildStrictV7(2,n);
    assert.equal(q.type,'multiple');
    assert.equal(q.options.length,5);
    assert.equal(q.answer.length,3);
    assert.match(q.prompt,/эксперимент|исследователь/i);
    assert.doesNotMatch(q.prompt,/для каждого показателя выберите|цифры могут повторяться/i);
  }
});

test('biology line 8 remains FIPI correspondence without image',()=>{
  for(let n=1;n<=25;n++){
    const q=buildStrictV7(8,n);
    assert.equal(q.type,'matching');
    assert(!q.imageUrl);
    assert(q.content?.left?.length>=2);
    assert(q.content?.right?.length>=2);
  }
});

test('all biology mock variants keep FIPI mechanics and worked steps',()=>{
  for(let variant=1;variant<=3;variant++){
    for(const q of variantQuestions(variant)){
      assert.equal(isBiologyFipiFormat(q.line,q),true,`mock v${variant} line ${q.line}`);
      assert(Array.isArray(q.solutionSteps)&&q.solutionSteps.length>=1,`mock v${variant} line ${q.line}: steps`);
    }
  }
});
