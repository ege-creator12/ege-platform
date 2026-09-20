'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {biologyLinesPayload,biologyLinePayload}=require('../src/biology-line-service');

function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE subjects(id INTEGER,slug TEXT,title TEXT,published INTEGER);
    CREATE TABLE sections(id INTEGER,title TEXT);
    CREATE TABLE topics(id INTEGER,subject_id INTEGER,section_id INTEGER,title TEXT);
    CREATE TABLE lessons(id INTEGER,slug TEXT,title TEXT,topic_id INTEGER,published INTEGER,position INTEGER);
    CREATE TABLE lesson_progress(lesson_id INTEGER,user_id INTEGER,reading_progress INTEGER,status TEXT);
    CREATE TABLE questions(id INTEGER,subject_id INTEGER,topic_id INTEGER,exam_line INTEGER,external_key TEXT,
      active INTEGER,published INTEGER,type TEXT,question_type TEXT,prompt TEXT,instruction TEXT,content_json TEXT,
      media_json TEXT,image_url TEXT,difficulty INTEGER,points INTEGER,max_score INTEGER,estimated_seconds INTEGER);
    CREATE TABLE attempts(id INTEGER,user_id INTEGER,question_id INTEGER,correct INTEGER,created_at TEXT);
    INSERT INTO subjects VALUES(1,'biology','Биология',1),(2,'chemistry','Химия',1);
    INSERT INTO sections VALUES(1,'Раздел');
    INSERT INTO topics VALUES(1,1,1,'Биология'),(2,2,1,'Химия');
    INSERT INTO lessons VALUES(1,'lesson-one','Урок',1,1,1);
  `);
  const add=sqlite.prepare('INSERT INTO questions (id,subject_id,topic_id,exam_line,external_key,active,published,type,prompt,difficulty) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const questions=[
    [1,1,1,1,'biology-bank-v9-line1-valid',1,1,'multiple','Первый',1],
    [2,1,1,1,'biology-bank-v9-line1-fixed',1,1,'multiple','Второй',1],
    [3,1,1,2,'biology-bank-v9-line2-valid',1,1,'multiple','Третий',1],
    [4,2,2,1,'biology-bank-v9-line1-other-subject',1,1,'multiple','Химия',1],
    [5,1,1,1,'biology-bank-v7-line1-old',1,1,'multiple','Старый',1],
    [6,1,1,1,'biology-bank-v9-line10-mismatch',1,1,'multiple','Другая линия',1],
    [7,1,1,1,'biology-bank-v9-line1-inactive',0,1,'multiple','Неактивный',1],
    [8,1,1,2,'biology-bank-v9-line2-hidden',1,0,'multiple','Скрытый',1],
    [9,1,1,28,'biology-bank-v9-line28-valid',1,1,'multiple','Последний',1],
  ];
  questions.forEach(q=>add.run(...q));
  const attempt=sqlite.prepare('INSERT INTO attempts VALUES(?,?,?,?,?)');
  [[1,1,1,0],[2,1,2,0],[3,1,2,1],[4,1,3,1],[5,1,4,0],[6,1,5,0],[7,1,6,0],
   [8,1,7,0],[9,1,8,0],[10,2,1,1],[11,2,3,0]].forEach(a=>attempt.run(...a,`2026-09-09 10:00:${String(a[0]).padStart(2,'0')}`));
  let queryCount=0;
  const db={row:async(sql,...params)=>{queryCount++;return sqlite.prepare(sql).get(...params)},rows:async(sql,...params)=>{queryCount++;return sqlite.prepare(sql).all(...params)}};
  const registry={examYear:2027,sourceStatus:'fixture',lines:Array.from({length:28},(_,i)=>({line:i+1,title:'Линия '+(i+1),part:1,answerFormat:'multiple',shortDescription:'Кратко',lessonRefs:['lesson-one']}))};
  return {sqlite,db,registry,queries:()=>queryCount};
}

test('28-line summary uses four queries while preserving detail progress and strict bank isolation',async()=>{
  const f=fixture();
  try {
    const result=await biologyLinesPayload(f.db,f.registry,1);
    assert.equal(f.queries(),4);
    assert.equal(result.lines.length,28);
    assert.equal(result.lines[0].questionCount,2);
    assert.equal(result.lines[0].progress.attempted,4);
    assert.equal(result.lines[0].progress.correct,1);
    assert.equal(result.lines[0].progress.accuracy,25);
    assert.deepEqual(result.lines[0].progress.wrongQuestionRefs,['biology-bank-v9-line1-inactive','biology-bank-v9-line1-valid']);
    for(const summary of result.lines) {
      const detail=await biologyLinePayload(f.db,f.registry,summary.line,1);
      assert.deepEqual(summary.progress,detail.progress);
      assert.equal(summary.questionCount,detail.questionCount);
      assert.equal('lessons' in summary,false);
      assert.equal('examples' in summary,false);
    }
    assert.equal(f.queries()-4,168,'the old list called these 28 full detail payloads');
    const other=await biologyLinesPayload(f.db,f.registry,2);
    assert.equal(other.lines[0].progress.attempted,1);
    assert.equal(other.lines[0].progress.correct,1);
    assert.deepEqual(other.lines[0].progress.wrongQuestionRefs,[]);
    assert.deepEqual(other.lines[1].progress.wrongQuestionRefs,['biology-bank-v9-line2-valid']);
    assert.equal(result.strictBank,true);
    assert.equal(result.bankVersion,9);
  } finally { f.sqlite.close(); }
});

test('unpublished subjects and empty registries do not query question details',async()=>{
  const f=fixture();
  try {
    f.sqlite.exec("UPDATE subjects SET published=0 WHERE slug='biology'");
    assert.deepEqual((await biologyLinesPayload(f.db,f.registry,1)).lines,[]);
    assert.equal(f.queries(),1);
    f.sqlite.exec("UPDATE subjects SET published=1 WHERE slug='biology'");
    assert.deepEqual((await biologyLinesPayload(f.db,{...f.registry,lines:[]},1)).lines,[]);
    assert.equal(f.queries(),2);
  } finally { f.sqlite.close(); }
});
