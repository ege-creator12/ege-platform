const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatAnswerForReview } = require('../src/answer-review');

const question=(questionType,answer,content={})=>({type:questionType==='multiple_answer'?'multiple':'text',question_type:questionType,answer_json:JSON.stringify(answer),answer_data_json:JSON.stringify({correct:answer,content})});
const options=labels=>labels.map((label,value)=>({value:String(value),label}));

test('matching review replaces internal indexes with textual pairs',()=>{
  const result=formatAnswerForReview(question('matching',['0-0','1-1','2-2','3-3']),options(['Коллаген — структурная функция','Гемоглобин — транспортная функция','Антитело — защитная функция','Амилаза — каталитическая функция']));
  assert.deepEqual(result.items,['Коллаген → структурная функция','Гемоглобин → транспортная функция','Антитело → защитная функция','Амилаза → каталитическая функция']);
  assert.doesNotMatch(JSON.stringify(result),/0-0/);
});

test('structured matching uses labels from content',()=>{
  const result=formatAnswerForReview(question('matching',['2','1','0'],{left:['AA','Aa','aa'],right:['рецессивная гомозигота','гетерозигота','доминантная гомозигота']}));
  assert.equal(result.examAnswer,'321');
  assert.deepEqual(result.items,['AA → доминантная гомозигота','Aa → гетерозигота','aa → рецессивная гомозигота']);
});

test('sequence preserves exam notation and explains the order',()=>{
  const result=formatAnswerForReview(question('sequence',['1','3','0','2']),options(['выход иРНК','транскрипция','трансляция','сплайсинг']));
  assert.equal(result.examAnswer,'2413');
  assert.deepEqual(result.items,['1. транскрипция','2. сплайсинг','3. выход иРНК','4. трансляция']);
});

test('multiple answer includes exam numbers and option labels',()=>{
  const result=formatAnswerForReview(question('multiple_answer',['1','3','4']),options(['A','мембрана','C','рибосомы','ДНК']));
  assert.equal(result.examAnswer,'245');
  assert.deepEqual(result.items,['2 — мембрана','4 — рибосомы','5 — ДНК']);
});

test('short answer and calculation render plain values',()=>{
  assert.equal(formatAnswerForReview(question('short_answer',['АТФ'])).examAnswer,'АТФ');
  assert.equal(formatAnswerForReview(question('calculation',['12'])).examAnswer,'12');
});

test('extended answer is labelled as the model answer',()=>{
  const result=formatAnswerForReview(question('extended_answer',['Ключевой элемент ответа'],{criteria:['Назван процесс','Объяснена причина']}));
  assert.equal(result.label,'Эталон ответа');
  assert.equal(result.examAnswer,'Ключевой элемент ответа');
  assert.deepEqual(result.items,['Назван процесс','Объяснена причина']);
});

test('legacy malformed metadata has a safe fallback',()=>{
  assert.doesNotThrow(()=>formatAnswerForReview({type:'text',answer_json:'["ответ"]',answer_data_json:null}));
  assert.equal(formatAnswerForReview({type:'text',answer_json:'["ответ"]'}).examAnswer,'ответ');
});
