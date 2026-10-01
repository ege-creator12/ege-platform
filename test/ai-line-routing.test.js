'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { actionSuggestions } = require('../src/ai-coach-engine');
const { tutorExamContext, buildTutorPrompt } = require('../server-ai');

const plan={minutesPerDay:60,daysPerWeek:5};
const tutor={};
const profile={dueReviewCount:0};

test('biology explicit line request uses exact line action, not generic practice',()=>{
  const actions=actionSuggestions('дай 5 заданий по линии 27',plan,tutor,profile,'biology');
  assert.equal(actions.some(a=>a.type==='personal_practice'),false);
  const line=actions.find(a=>a.type==='start_line');
  assert.ok(line);
  assert.equal(line.payload.line,27);
  assert.equal(line.payload.count,5);
});

test('chemistry supports lines above 28',()=>{
  const actions=actionSuggestions('дай 6 заданий 33 линии',plan,tutor,profile,'chemistry');
  const line=actions.find(a=>a.type==='start_line');
  assert.ok(line);
  assert.equal(line.payload.line,33);
  assert.equal(line.payload.count,6);
});

test('biology rejects chemistry-only line numbers',()=>{
  const actions=actionSuggestions('дай задания по линии 33',plan,tutor,profile,'biology');
  assert.equal(actions.some(a=>a.type==='start_line'),false);
  assert.equal(actions.some(a=>a.type==='personal_practice'),false);
});

test('topic practice without line remains personal practice',()=>{
  const actions=actionSuggestions('дай задания по генетике',plan,tutor,profile,'biology');
  assert.equal(actions.some(a=>a.type==='personal_practice'),true);
});


test('AI tutor explanation request binds chemistry task number to exact FIPI line',()=>{
  const context=tutorExamContext('научи решать 4 задание ЕГЭ по химии');
  assert.ok(context);
  assert.equal(context.subject,'chemistry');
  assert.equal(context.line,4);
  assert.match(context.item.title,/связ|решет|кристалл/i);
  const prompt=buildTutorPrompt('научи решать 4 задание ЕГЭ по химии',context);
  assert.match(prompt,/Номер задания: 4/);
  assert.match(prompt,/Не выдавай случайное новое задание вместо объяснения/);
});

test('AI tutor explanation request binds biology task number to exact FIPI line',()=>{
  const context=tutorExamContext('объясни как решать 26 задание егэ биология');
  assert.ok(context);
  assert.equal(context.subject,'biology');
  assert.equal(context.line,26);
  assert.match(context.item.title,/Общая биология/i);
  const prompt=buildTutorPrompt('объясни как решать 26 задание егэ биология',context);
  assert.match(prompt,/Номер задания: 26/);
  assert.match(prompt,/точную механику распознанной линии/i);
});

test('AI tutor does not guess subject for shared line numbers',()=>{
  const context=tutorExamContext('как решать 18 задание ЕГЭ');
  assert.ok(context);
  assert.equal(context.line,18);
  assert.equal(context.subject,null);
  assert.equal(context.needsSubject,true);
});

test('AI tutor infers chemistry for lines 29-34',()=>{
  const context=tutorExamContext('объясни 33 задание ЕГЭ');
  assert.ok(context);
  assert.equal(context.subject,'chemistry');
  assert.equal(context.line,33);
});
