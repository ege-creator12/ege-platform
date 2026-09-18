'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { actionSuggestions } = require('../src/ai-coach-engine');

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
