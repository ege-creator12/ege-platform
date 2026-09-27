'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {lineTheorySections}=require('../src/line-theory');

test('line theory returns every non-quiz theory block in lesson order',async()=>{
 const db={rows:async()=>[
  {lesson_id:2,type:'text',content_json:'{"text":"B"}',position:1},
  {lesson_id:1,type:'heading',content_json:'{"text":"A"}',position:0},
  {lesson_id:1,type:'definition',content_json:'{"text":"D"}',position:1},
  {lesson_id:1,type:'quiz',content_json:'{"question":"Q"}',position:2},
  {lesson_id:2,type:'summary',content_json:'{"text":"S"}',position:2}
 ]};
 const lessons=[
  {id:2,slug:'l2',title:'L2',topic_title:'T2',section_title:'S2',progress:20},
  {id:1,slug:'l1',title:'L1',topic_title:'T1',section_title:'S1',progress:0}
 ];
 const sections=await lineTheorySections(db,lessons);
 assert.deepEqual(sections.map(x=>x.lessonId),[2,1]);
 assert.deepEqual(sections[0].blocks.map(x=>x.type),['text','summary']);
 assert.deepEqual(sections[1].blocks.map(x=>x.type),['heading','definition']);
 assert.equal(sections.flatMap(x=>x.blocks).some(x=>x.type==='quiz'),false);
});
