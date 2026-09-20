'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const builders=require('../src/chemistry-line-bank');
const {CHEMISTRY_FORMATS,isChemistryFipiFormat}=require('../src/ege-fipi-format');

test('all chemistry line builders obey the official FIPI 2026/2027 response mechanics',()=>{
  assert.deepEqual(Object.keys(CHEMISTRY_FORMATS).map(Number),Array.from({length:34},(_,i)=>i+1));
  for(let line=1;line<=34;line++){
    assert.equal(typeof builders[line],'function',`line ${line}: builder missing`);
    for(let n=1;n<=25;n++){
      const q=builders[line](n);
      assert.equal(isChemistryFipiFormat(line,q),true,
        `line ${line}, item ${n}: wrong control/answer shape: ${q?.type}/${q?.questionType}`);
    }
  }
});

test('chemistry line 2 is an ordered three-position task, never a one-answer comparison',()=>{
  for(let n=1;n<=25;n++){
    const q=builders[2](n);
    assert.equal(q.type,'sequence');
    assert.equal(q.options.length,5);
    assert.equal(q.answer.length,3);
    assert.doesNotMatch(q.prompt,/какой элемент имеет .* сильнее|выберите один верный ответ/i);
  }
});

test('FIPI correspondence lines are rendered as correspondences, not generic multiple choice',()=>{
  for(const line of [5,6,7,8,9,10,14,15,16,17,19,20,22,23,24,25]){
    for(let n=1;n<=10;n++)assert.equal(builders[line](n).type,'matching',`line ${line}, item ${n}`);
  }
});

test('extended chemistry lines remain multi-criterion manual-review tasks',()=>{
  for(let line=29;line<=34;line++)for(let n=1;n<=20;n++){
    const q=builders[line](n);
    assert.equal(q.questionType,'extended_answer',`line ${line}, item ${n}`);
    assert(Array.isArray(q.scoringPoints)&&q.scoringPoints.length===q.maxScore,`line ${line}, item ${n}: scoring criteria`);
  }
});
