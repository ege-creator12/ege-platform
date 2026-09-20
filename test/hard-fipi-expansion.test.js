'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {build:buildBio}=require('../src/biology-hard-expansion');
const {build:buildChem}=require('../src/chemistry-hard-expansion');
const {isBiologyFipiFormat,isChemistryFipiFormat}=require('../src/ege-fipi-format');
const {semanticFingerprint}=require('../src/question-semantic-quality');

const bioLines={1:30,5:30,6:30,9:30,10:30,13:30,14:30,21:60};
const chemLines={1:30,3:30,4:30,9:18,10:30,11:30,12:24,13:18,16:18,18:22,23:30};

test('hard biology expansion is strict FIPI, hard and semantically diverse',()=>{
 for(const [lineText,minUnique] of Object.entries(bioLines)){
  const line=Number(lineText),items=[];
  for(let n=1;n<=180;n++){
   const q=buildBio(line,n);
   assert(q,'biology line '+line+': hard builder returned null');
   assert.equal(isBiologyFipiFormat(line,q),true,'biology line '+line+' seed '+n+': FIPI mechanics');
   assert.equal(Number(q.difficulty),3,'biology line '+line+' seed '+n+': must be hard');
   assert(Array.isArray(q.solutionSteps)&&q.solutionSteps.length>=2,'biology line '+line+' seed '+n+': worked steps');
   items.push(q);
  }
  assert(new Set(items.map(semanticFingerprint)).size>=minUnique,'biology line '+line+': insufficient semantic diversity');
 }
});

test('hard chemistry expansion is strict FIPI, hard and semantically diverse',()=>{
 for(const [lineText,minUnique] of Object.entries(chemLines)){
  const line=Number(lineText),items=[];
  for(let n=1;n<=220;n++){
   const q=buildChem(line,n);
   assert(q,'chemistry line '+line+': hard builder returned null');
   assert.equal(isChemistryFipiFormat(line,q),true,'chemistry line '+line+' seed '+n+': FIPI mechanics');
   assert.equal(Number(q.difficulty),3,'chemistry line '+line+' seed '+n+': must be hard');
   assert(Array.isArray(q.solutionSteps)&&q.solutionSteps.length>=2,'chemistry line '+line+' seed '+n+': worked steps');
   items.push(q);
  }
  assert(new Set(items.map(semanticFingerprint)).size>=minUnique,'chemistry line '+line+': insufficient semantic diversity');
 }
});
