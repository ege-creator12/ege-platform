'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const builders=require('../src/chemistry-line-bank');

test('chemistry first-part builders use the intended EGE-style control families',()=>{
 const multipleLines=[1,2,3,4,6,7,8,11,12,13,14,15,17,18,21,22,24,25];
 for(const line of multipleLines){
  for(let n=1;n<=20;n++){
   const q=builders[line](n);
   assert.equal(q.type,'multiple',`line ${line}, item ${n}: multiple control`);
   assert.equal(q.answer.length,2,`line ${line}, item ${n}: two correct positions`);
   assert.equal(q.options.length,5,`line ${line}, item ${n}: five answer positions`);
  }
 }
 for(const line of [5,10]){
  for(let n=1;n<=20;n++){
   const q=builders[line](n);
   assert.equal(q.type,'matching',`line ${line}, item ${n}: matching control`);
   assert.equal(q.answer.length,q.content.left.length,`line ${line}, item ${n}: matching answers`);
   assert(q.content.right.length>q.content.left.length,`line ${line}, item ${n}: includes distractor`);
  }
 }
 for(const line of [9,16]){
  for(let n=1;n<=20;n++){
   const q=builders[line](n);
   assert.equal(q.type,'sequence',`line ${line}, item ${n}: sequence control`);
   assert(q.answer.length>=2,`line ${line}, item ${n}: ordered answer`);
   assert(q.options.length>q.answer.length,`line ${line}, item ${n}: reagent distractors`);
  }
 }
 for(const line of [23,26,27,28]){
  for(let n=1;n<=20;n++){
   const q=builders[line](n);
   assert.equal(q.type,'text',`line ${line}, item ${n}: numeric text answer`);
   assert.equal(q.questionType,'short_answer',`line ${line}, item ${n}: short numeric answer`);
  }
 }
});

test('extended chemistry lines remain manual-review tasks with full scoring criteria',()=>{
 for(let line=29;line<=34;line++){
  for(let n=1;n<=20;n++){
   const q=builders[line](n);
   assert.equal(q.questionType,'extended_answer',`line ${line}, item ${n}: extended answer`);
   assert.equal(q.manualReview,true,`line ${line}, item ${n}: manual review`);
   assert(Array.isArray(q.scoringPoints)&&q.scoringPoints.length===q.maxScore,`line ${line}, item ${n}: scoring points`);
   assert(q.maxScore>=2,`line ${line}, item ${n}: multi-point task`);
  }
 }
});
