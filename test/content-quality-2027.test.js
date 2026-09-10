'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {isMetaPrompt,CELL_THEORY_TASKS}=require('../src/content-quality-2027');
const biology=require('../content/biology/mock-variants-expanded');
const chemistry=require('../content/chemistry/mock-variants');

test('student quality gate rejects meta-instructions instead of subject questions',()=>{
  for(const prompt of [
    'Что нужно сделать перед тем как решить задания по теме клеточная теория?',
    'Что следует повторить перед решением заданий по клетке?',
    'Какой алгоритм нужно использовать перед решением задания?'
  ])assert.equal(isMetaPrompt(prompt),true,prompt);
  for(const prompt of [
    'Почему зрелый эритроцит не опровергает клеточную теорию?',
    'Что нужно сделать, чтобы проверить влияние температуры на фотосинтез?',
    'Установите соответствие между органоидами и функциями.'
  ])assert.equal(isMetaPrompt(prompt),false,prompt);
});

test('cell theory supplemental bank contains only substantive unique tasks',()=>{
  assert.equal(CELL_THEORY_TASKS.length,16);
  const keys=new Set(),prompts=new Set();
  for(const q of CELL_THEORY_TASKS){
    assert(q.key&&q.prompt&&q.explanation,q.key);
    assert(!isMetaPrompt(q.prompt),q.prompt);
    assert(!keys.has(q.key),q.key);keys.add(q.key);
    const prompt=q.prompt.toLocaleLowerCase('ru-RU').replace(/\s+/g,' ').trim();
    assert(!prompts.has(prompt),q.prompt);prompts.add(prompt);
    assert(Array.isArray(q.answer)&&q.answer.length,q.key);
    if(q.type==='multiple')assert(q.options.length>=5,q.key);
    if(q.type==='matching')assert.equal(q.answer.length,q.content.left.length,q.key);
  }
});

test('biology exposes 12 complete visibly distinct mock variants with correct lines',()=>{
  assert.equal(biology.VARIANT_COUNT,12);
  const keys=new Set(),perLine=Array.from({length:28},()=>new Set());
  for(let variant=1;variant<=biology.VARIANT_COUNT;variant++){
    const questions=biology.variantQuestions(variant);
    assert.equal(questions.length,28,`variant ${variant}`);
    questions.forEach((q,index)=>{
      const line=index+1;
      assert.equal(Number(q.line),line,q.key);
      assert.equal(Number(q.maxScore),Number(biology.MAX[index]),q.key);
      assert(!keys.has(q.key),q.key);keys.add(q.key);
      const fp=biology.visibleFingerprint(q);
      assert(!perLine[index].has(fp),`biology line ${line} repeats visibly in variant ${variant}`);
      perLine[index].add(fp);
    });
  }
  assert.equal(keys.size,12*28);
  for(const [index,set] of perLine.entries())assert.equal(set.size,12,`biology line ${index+1}`);
});

test('chemistry exposes 12 complete variants and never reuses a line task across them',()=>{
  assert.equal(chemistry.VARIANT_COUNT,12);
  const keys=new Set(),numbers=Array.from({length:34},()=>new Set());
  for(let variant=1;variant<=chemistry.VARIANT_COUNT;variant++){
    const questions=chemistry.variantQuestions(variant);
    assert.equal(questions.length,34,`variant ${variant}`);
    questions.forEach((q,index)=>{
      const line=index+1;
      assert.equal(Number(q.line),line,q.key);
      assert(!keys.has(q.key),q.key);keys.add(q.key);
      const n=chemistry.itemNumber(line,variant);
      assert(!numbers[index].has(n),`chemistry line ${line} repeats item ${n}`);
      numbers[index].add(n);
    });
  }
  assert.equal(keys.size,12*34);
  for(const [index,set] of numbers.entries())assert.equal(set.size,12,`chemistry line ${index+1}`);
});

test('mock selector is driven by server variantCount instead of hardcoded three',()=>{
  const ui=fs.readFileSync(require.resolve('../public/mock-variants-enhancer.js'),'utf8');
  assert.match(ui,/variantCount/);
  assert.match(ui,/Array\.from\(\{length:count\}/);
});
