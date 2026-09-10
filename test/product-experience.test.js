'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {normalizeOnboarding,chooseDiagnosticQuestions,fillDailySeries,streakFromSeries}=require('../src/product-analytics');

const root=join(__dirname,'..');

test('onboarding settings are validated and bounded',()=>{
 const future=new Date(Date.now()+120*86400000).toISOString().slice(0,10);
 const value=normalizeOnboarding({subjectSlug:'chemistry',currentScore:38,targetScore:92,examDate:future,daysPerWeek:6,minutesPerDay:75});
 assert.equal(value.subjectSlug,'chemistry');
 assert.equal(value.currentScore,38);
 assert.equal(value.targetScore,92);
 assert.equal(value.daysPerWeek,6);
 assert.equal(value.minutesPerDay,75);
 assert.throws(()=>normalizeOnboarding({examDate:'2020-01-01'}),/будущую дату/);
});

test('diagnostic selector takes distinct exam lines',()=>{
 const picked=chooseDiagnosticQuestions([
  {id:1,exam_line:1},{id:2,exam_line:1},{id:3,exam_line:2},{id:4,exam_line:3},{id:5,exam_line:4},{id:6,exam_line:5},{id:7,exam_line:6},
 ],6);
 assert.equal(picked.length,6);
 assert.equal(new Set(picked.map(x=>x.line)).size,6);
 assert.deepEqual(picked.map(x=>x.id),[1,3,4,5,6,7]);
});

test('diagnostic selector spreads questions across the program and keeps lines unique',()=>{
 const rows=Array.from({length:32},(_,index)=>({id:index+1,exam_line:index+1,difficulty:index%3+1,estimated_seconds:60+index}));
 const picked=chooseDiagnosticQuestions(rows,8);
 assert.equal(picked.length,8);
 assert.equal(new Set(picked.map(item=>item.line)).size,8);
 for(let bucket=0;bucket<8;bucket++)assert.ok(picked[bucket].line>=bucket*4+1&&picked[bucket].line<=(bucket+1)*4);
});
test('daily analytics fills empty dates and computes current streak',()=>{
 const now=new Date('2026-09-09T12:00:00Z');
 const series=fillDailySeries([
  {day:'2026-09-07',attempts:2,correct:1,seconds:120},
  {day:'2026-09-08',attempts:3,correct:3,seconds:180},
  {day:'2026-09-09',attempts:1,correct:1,seconds:60},
 ],5,now);
 assert.equal(series.length,5);
 assert.equal(series[0].day,'2026-09-05');
 assert.equal(series.at(-1).accuracy,100);
 assert.equal(streakFromSeries(series),3);
});

test('product UI and server routes are wired without replacing learning logic',()=>{
 const server=readFileSync(join(root,'server-product.js'),'utf8');
 const client=readFileSync(join(root,'public/product-experience.js'),'utf8');
 const settings=readFileSync(join(root,'public/product-settings.js'),'utf8');
 const html=readFileSync(join(root,'public/index.html'),'utf8');
 assert.doesNotThrow(()=>new Function(server));
 assert.doesNotThrow(()=>new Function(client));
 assert.doesNotThrow(()=>new Function(settings));
 for(const route of ['/api/product/onboarding','/api/product/onboarding/diagnostic','/api/product/analytics','/api/product/event']) assert.match(server,new RegExp(route.replaceAll('/','\\/')));
 assert.match(server,/planner\.buildPlan/);
 assert.match(server,/biology-bank-v6-line%/);
 assert.match(server,/chemistry-bank-v2-line%/);
 assert.match(client,/8 заданий/);
 assert.match(client,/data-diagnostic-answer/);
 assert.match(client,/стартовый срез/i);
 assert.match(server,/extended_answer/);
 assert.match(server,/needsManualReview/);
 assert.match(server,/restart/);
 assert.match(client,/data-product-analytics/);
 assert.match(settings,/data-analytics-settings/);
 assert.match(settings,/Сохранить и перестроить/);
 assert.match(html,/product-experience\.css/);
 assert.match(html,/product-experience\.js/);
 assert.match(html,/product-settings\.js/);
});

test('both database dialects receive product migrations',()=>{
 const sqlite=readFileSync(join(root,'migrations/012_product_onboarding_analytics.sql'),'utf8');
 const postgres=readFileSync(join(root,'migrations/postgres/012_product_onboarding_analytics.sql'),'utf8');
 for(const source of [sqlite,postgres]){
  assert.match(source,/CREATE TABLE IF NOT EXISTS user_onboarding/);
  assert.match(source,/CREATE TABLE IF NOT EXISTS product_events/);
  assert.match(source,/idx_product_events_user_created/);
 }
});
