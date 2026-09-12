const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const hardBank=require('../content/biology/mock-hard-questions.json');
const { CONFIG }=require('../src/mock-exams');

test('biology mock upgrade exposes twelve variants with untimed default',()=>{
  assert.equal(CONFIG.variantCount,12);
  assert.equal(CONFIG.defaultMode,'untimed');
});

test('hard mock supplement is original, difficult and has teaching help',()=>{
  assert.match(hardBank.source,/не копии банка ФИПИ/i);
  assert.ok(hardBank.questions.length>=10);
  const keys=new Set();
  for(const q of hardBank.questions){
    assert.ok(Number.isInteger(q.line)&&q.line>=1&&q.line<=28,q.key);
    assert.equal(q.difficulty,3,q.key);
    assert.ok(q.prompt.length>=80,q.key);
    assert.ok(Array.isArray(q.answer)&&q.answer.length,q.key);
    assert.ok(q.hint&&q.hint.length>=30,q.key);
    assert.ok(q.explanation&&q.explanation.length>=50,q.key);
    assert.equal(keys.has(q.key),false,`duplicate ${q.key}`);keys.add(q.key);
    if(q.questionType==='extended_answer'){
      assert.ok(q.maxScore>=2,q.key);
      assert.ok(Array.isArray(q.scoringPoints)&&q.scoringPoints.length>=3,q.key);
      assert.ok(Array.isArray(q.commonMistakes)&&q.commonMistakes.length>=2,q.key);
    }
  }
  for(const line of [2,3,4,21,22,23,24,25,26,27,28])assert.ok(hardBank.questions.some(q=>q.line===line),`missing hard line ${line}`);
});

test('each reviewed source variant has all 28 lines, 57 maximum points and seven manual answers',()=>{
  const {variantQuestions}=require('../content/biology/mock-variants');
  for(let v=1;v<=3;v++){
    const questions=variantQuestions(v);
    assert.deepEqual(questions.map(q=>q.line),Array.from({length:28},(_,i)=>i+1));
    assert.equal(questions.reduce((n,q)=>n+q.maxScore,0),57);
    assert.equal(questions.filter(q=>q.questionType==='extended_answer').length,7);
    assert.equal(questions[20].maxScore,1);assert.equal(questions[25].maxScore,4);
    assert.ok(questions.every(q=>q.answer.length&&q.explanation.length>=30));
  }
});

test('browser biology upgrade script parses and contains required controls',()=>{
  const source=readFileSync(join(__dirname,'../public/biology-upgrades.js'),'utf8');
  assert.doesNotThrow(()=>new Function(source));
  for(const phrase of ['Проверить ответ','Подсказка','Не знаю — показать разбор','Следующее задание →','Поиск по биологии','Без таймера','mock-ordered'])assert.ok(source.includes(phrase),phrase);
});
