'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../content/biology/exam-lines.json');
const {build}=require('../src/biology-line-bank');
const {buildExtra,EXTENDED}=require('../src/biology-extra-bank');
const {fingerprint}=require('../src/biology-line-bank-runner');

function validate(item,line){
  assert.equal(typeof item.prompt,'string',`line ${line}: prompt`);
  assert(item.prompt.trim().length>20,`line ${line}: prompt too short`);
  assert(Array.isArray(item.answer)&&item.answer.length,`line ${line}: answer missing`);
  if(item.type==='matching'){
    assert(Array.isArray(item.content?.left)&&item.content.left.length,`line ${line}: matching left`);
    assert(Array.isArray(item.content?.right)&&item.content.right.length,`line ${line}: matching right`);
  }
  if(item.type==='multiple'||item.type==='sequence')assert(Array.isArray(item.options)&&item.options.length,`line ${line}: options`);
  if(item.questionType==='extended_answer'){
    assert.equal(item.content?.manualReview,true,`line ${line}: extended manual review`);
    assert.equal(item.content.criteria.length,item.maxScore,`line ${line}: scoring criteria count`);
  }
}

test('expanded biology generator has at least 24 distinct visible tasks for every EGE line',()=>{
  for(const info of registry.lines){
    const line=Number(info.line),seen=new Set();
    for(let n=1;n<=60;n++){
      const item=build(line,n);validate(item,line);seen.add(fingerprint(item));
    }
    for(let n=1;n<=48;n++){
      const item=buildExtra(line,n);validate(item,line);seen.add(fingerprint(item));
    }
    assert(seen.size>=24,`line ${line}: only ${seen.size} distinct visible tasks`);
  }
});

test('the first ten supplemental variants on every biology line are exact-duplicate free',()=>{
  for(const info of registry.lines){
    const line=Number(info.line),seen=new Set();
    for(let n=1;n<=10;n++){
      const item=buildExtra(line,n),key=fingerprint(item);
      assert(!seen.has(key),`line ${line}: duplicate supplemental variant ${n}`);
      seen.add(key);
    }
    assert.equal(seen.size,10);
  }
});

test('second-part supplemental biology tasks cover ten original scenarios per line',()=>{
  for(let line=22;line<=28;line++){
    assert.equal(EXTENDED[line].length,10,`line ${line}: expected ten extra scenarios`);
    const prompts=new Set(EXTENDED[line].map(item=>item.prompt.trim().toLocaleLowerCase('ru-RU')));
    assert.equal(prompts.size,10,`line ${line}: duplicate extended prompt`);
  }
});
