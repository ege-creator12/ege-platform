'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const controls=require('../public/question-controls');
const {formatAnswerForReview,presentationIndexes}=require('../src/answer-review');

test('presentation order is deterministic and never identity for selectable lists',()=>{
  for(let length=2;length<=8;length++){
    for(let id=1;id<=40;id++){
      const first=controls.presentationIndexes(length,id);
      const second=presentationIndexes(length,id);
      assert.deepEqual(first,second);
      assert.equal(first.every((value,index)=>value===index),false,`identity order for len=${length}, id=${id}`);
      assert.deepEqual([...first].sort((a,b)=>a-b),Array.from({length},(_,i)=>i));
    }
  }
});

test('sequence answer numbering follows the visible shuffled order',()=>{
  const question={
    id:42,
    type:'sequence',
    question_type:'sequence',
    answer_json:JSON.stringify(['s0','s1','s2','s3']),
    answer_data_json:'{}',
    content_json:'{}',
  };
  const options=[0,1,2,3].map(i=>({value:`s${i}`,label:`Этап ${i+1}`}));
  const order=controls.presentationIndexes(options.length,question.id);
  const expected=['s0','s1','s2','s3'].map(value=>String(order.indexOf(options.findIndex(o=>o.value===value))+1)).join('');
  const review=formatAnswerForReview(question,options);
  assert.equal(review.examAnswer,expected);
  assert.notEqual(review.examAnswer,'1234');
});

test('matching identity key is displayed as a non-1234 answer',()=>{
  const content={
    left:['Коллаген','Гемоглобин','Антитело','Амилаза'],
    right:['структурная','транспортная','защитная','ферментативная'],
    answerEncoding:'pairs',
  };
  const question={
    id:101,
    type:'matching',
    question_type:'matching',
    answer_json:JSON.stringify(['0-0','1-1','2-2','3-3']),
    answer_data_json:JSON.stringify({content}),
    content_json:JSON.stringify(content),
  };
  const review=formatAnswerForReview(question,[]);
  assert.notEqual(review.examAnswer,'1234');
  assert.equal(review.examAnswer.length,4);
  assert.equal(new Set(review.examAnswer).size,4);
});

test('single and multiple review use visible numbering instead of canonical indexes',()=>{
  const options=[0,1,2,3].map(i=>({value:String(i),label:`Вариант ${i+1}`}));
  const single={id:77,type:'single',question_type:'single_choice',answer_json:'["0"]',answer_data_json:'{}',content_json:'{}'};
  const multiple={id:78,type:'multiple',question_type:'multiple_answer',answer_json:'["0","1"]',answer_data_json:'{}',content_json:'{}'};
  assert.notEqual(formatAnswerForReview(single,options).examAnswer,'0');
  assert.match(formatAnswerForReview(single,options).examAnswer,/^[1-4]$/);
  assert.match(formatAnswerForReview(multiple,options).examAnswer,/^[1-4]{2}$/);
});
