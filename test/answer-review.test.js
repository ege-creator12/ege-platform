const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatAnswerForReview, presentationIndexes, seedOf, displayedOptionNumber } = require('../src/answer-review');

const question=(questionType,answer,content={},id=101)=>({id,type:questionType==='multiple_answer'?'multiple':questionType==='single_choice'?'single':'text',question_type:questionType,answer_json:JSON.stringify(answer),answer_data_json:JSON.stringify({correct:answer,content}),content_json:JSON.stringify(content),prompt:`test-${questionType}-${id}`});
const options=labels=>labels.map((label,value)=>({value:String(value),label}));

test('matching review replaces internal indexes with textual pairs',()=>{
  const q=question('matching',['0-0','1-1','2-2','3-3'],{},111);
  const result=formatAnswerForReview(q,options(['Коллаген — структурная функция','Гемоглобин — транспортная функция','Антитело — защитная функция','Амилаза — каталитическая функция']));
  assert.deepEqual(result.items,['Коллаген → структурная функция','Гемоглобин → транспортная функция','Антитело → защитная функция','Амилаза → каталитическая функция']);
  assert.doesNotMatch(JSON.stringify(result),/0-0/);
});

test('structured matching uses labels from content and visible shuffled numbering',()=>{
  const content={left:['AA','Aa','aa'],right:['рецессивная гомозигота','гетерозигота','доминантная гомозигота']};
  const q=question('matching',['2','1','0'],content,112);
  const order=presentationIndexes(content.right.length,seedOf(q)+7919);
  const expected=['2','1','0'].map(value=>String(order.indexOf(Number(value))+1)).join('');
  const result=formatAnswerForReview(q);
  assert.equal(result.examAnswer,expected);
  assert.deepEqual(result.items,['AA → доминантная гомозигота','Aa → гетерозигота','aa → рецессивная гомозигота']);
});

test('sequence preserves semantic order while exam notation follows visible option order',()=>{
  const opts=options(['выход иРНК','транскрипция','трансляция','сплайсинг']);
  const q=question('sequence',['1','3','0','2'],{},113);
  const result=formatAnswerForReview(q,opts);
  assert.equal(result.examAnswer,['1','3','0','2'].map(value=>displayedOptionNumber(q,opts,value)).join(''));
  assert.deepEqual(result.items,['1. транскрипция','2. сплайсинг','3. выход иРНК','4. трансляция']);
});

test('multiple answer includes visible exam numbers and option labels',()=>{
  const opts=options(['A','мембрана','C','рибосомы','ДНК']);
  const q=question('multiple_answer',['1','3','4'],{},114);
  const result=formatAnswerForReview(q,opts);
  const expected=['1','3','4'].map(value=>displayedOptionNumber(q,opts,value));
  assert.equal(result.examAnswer,expected.join(''));
  assert.deepEqual(result.items,expected.map((number,index)=>`${number} — ${['мембрана','рибосомы','ДНК'][index]}`));
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
