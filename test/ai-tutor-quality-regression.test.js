'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const p=fs.readFileSync(require('node:path').join(__dirname,'../public/ai-tutor-practice.js'),'utf8');
const ai=fs.readFileSync(require('node:path').join(__dirname,'../server-ai.js'),'utf8');
const router=fs.readFileSync(require('node:path').join(__dirname,'../server-training-router.js'),'utf8');
test('AI practice never passes unchecked LLM JSON as EGE tasks',()=>{
 assert.doesNotMatch(p,/const instruction=`Создай ровно/);
 assert.match(p,/startRealLinePractice\(modal/);
 assert.match(p,/Тематические запросы без номера линии/);
});
test('manual-review tasks never count as automatically correct',()=>{
 assert.match(p,/const correct=!manual&&!skipped&&isCorrect\(given,task\)/);
});
test('bank includes rich question content',()=>{
 assert.match(router,/\bcontent,\s*type:String\(question.type/);
 assert.match(router,/imageUrl:String\(content.imageUrl/);
});
test('AI request has a total model fallback budget',()=>{
 assert.match(ai,/AI_TOTAL_TIMEOUT_MS/);
 assert.match(ai,/const remaining = AI_TOTAL_TIMEOUT_MS -/);
 assert.doesNotMatch(ai,/gemini-3\.6-flash/);
});
