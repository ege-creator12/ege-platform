'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildStrictV7}=require('../src/biology-strict-line-bank-v7');
const chemistry=require('../src/chemistry-line-bank');
const {semanticFingerprint,nearDuplicate}=require('../src/question-semantic-quality');

function assertDistinct(items,label){
 const seen=new Set();
 for(let i=0;i<items.length;i++){
  const fp=semanticFingerprint(items[i]);
  assert(!seen.has(fp),`${label}: semantic duplicate at item ${i+1}`);
  seen.add(fp);
  for(let j=0;j<i;j++)assert(!nearDuplicate(items[j],items[i]),`${label}: near duplicate items ${j+1} and ${i+1}`);
 }
}

test('biology v7 exposes at least 12 semantically distinct medium/hard tasks on every line',()=>{
 for(let line=1;line<=28;line++){
  const items=Array.from({length:12},(_,index)=>buildStrictV7(line,index+1));
  assertDistinct(items,`biology line ${line}`);
  assert(items.every(item=>Number(item.difficulty)>=2),`biology line ${line}: basic task leaked into strict v7 pool`);
  assert(items.every(item=>Number(item.content?.strictBankVersion)===7),`biology line ${line}: wrong bank version`);
  assert(items.filter(item=>Number(item.difficulty)>=3).length>=4,`biology line ${line}: hard-task share is too low`);
 }
});

test('chemistry v3 source pool starts with 10 semantically distinct medium/hard tasks on every line',()=>{
 for(let line=1;line<=34;line++){
  const build=chemistry[line];
  assert.equal(typeof build,'function',`chemistry line ${line}: missing builder`);
  const items=Array.from({length:10},(_,index)=>{
   const raw=build(index+1);
   return {...raw,difficulty:line>=29?3:Math.max(Number(raw.difficulty)||1,(index+1)%3===0?3:2)};
  });
  assertDistinct(items,`chemistry line ${line}`);
  assert(items.every(item=>Number(item.difficulty)>=2),`chemistry line ${line}: basic task leaked into v3 pool`);
  assert(items.filter(item=>Number(item.difficulty)>=3).length>=3,`chemistry line ${line}: hard-task share is too low`);
 }
});

test('semantic fingerprint ignores cosmetic prefixes and option ordering',()=>{
 const a={type:'multiple',prompt:'Средний тренировочный вариант. Выберите два вещества.',options:[{value:'0',label:'H2O'},{value:'1',label:'NaCl'}],content:{strictExamLine:1,variant:1}};
 const b={type:'multiple',prompt:'Выберите два вещества.',options:[{value:'0',label:'NaCl'},{value:'1',label:'H2O'}],content:{strictExamLine:1,variant:99}};
 assert.equal(semanticFingerprint(a),semanticFingerprint(b));
});
