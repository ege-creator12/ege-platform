const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ege-')), 'test.sqlite');
const { migrate, row, rows, run } = require('../src/db');
const { normalizeSession, selectQuestions } = require('../src/training');

test('migration creates the complete learning schema', () => {
  migrate();
  const required = ['users','subjects','topics','questions','question_options','attempts','topic_progress','mock_exams','mock_exam_attempts'];
  for (const name of required) assert.ok(row("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name));
});

test('production bootstrap creates the biology course hierarchy', () => {
  migrate();
  const biology = row("SELECT id FROM subjects WHERE slug='biology'");
  assert.ok(biology);
  const path = row(`SELECT section.kind section_kind,theme.kind theme_kind,subtopic.kind subtopic_kind,lesson.kind lesson_kind
    FROM topics lesson
    JOIN topics subtopic ON subtopic.id=lesson.parent_id
    JOIN topics theme ON theme.id=subtopic.parent_id
    JOIN topics section ON section.id=theme.parent_id
    WHERE lesson.subject_id=? AND lesson.kind='lesson' LIMIT 1`, biology.id);
  assert.deepEqual({...path}, { section_kind:'section', theme_kind:'topic', subtopic_kind:'subtopic', lesson_kind:'lesson' });
});

test('extended learning fields and migration history are available', () => {
  migrate();
  for (const column of ['content_json','source','exam_line','points']) {
    assert.ok(rows('PRAGMA table_info(questions)').some(item => item.name === column));
  }
  for (const column of ['review_stage','result_json','next_review_at','interval_days']) {
    assert.ok(rows('PRAGMA table_info(attempts)').some(item => item.name === column));
  }
  assert.equal(row('SELECT COUNT(*) count FROM schema_migrations').count, 3);
});

test('demo bank contains ten original tasks in each featured lesson', () => {
  for (const slug of ['cell-organelles','mendel-laws']) {
    assert.equal(row('SELECT COUNT(*) count FROM questions q JOIN topics t ON t.id=q.topic_id WHERE t.slug=?',slug).count,10);
  }
  assert.ok(row('SELECT COUNT(DISTINCT type) count FROM questions').count >= 4);
  assert.equal(row('SELECT COUNT(*) count FROM skills').count,8);
});

test('new selection avoids attempted questions and mixed selection prioritizes unseen tasks', () => {
  const user=run('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)','Test','select@test.local','x:y');
  const userId=Number(user.lastInsertRowid),topicId=row("SELECT id FROM topics WHERE slug='cell-organelles'").id;
  const first=selectQuestions({rows},userId,normalizeSession({topicId,mode:'new',count:10}));
  assert.equal(first.length,10);
  run("INSERT INTO attempts(user_id,question_id,answer_json,correct,next_review_at) VALUES(?,?,?,1,datetime('now','+2 days'))",userId,first[0],'[]');
  const onlyNew=selectQuestions({rows},userId,normalizeSession({topicId,mode:'new',count:10}));
  assert.ok(!onlyNew.includes(first[0]));
  const mixed=selectQuestions({rows},userId,normalizeSession({topicId,mode:'mixed',count:10}));
  assert.equal(mixed.at(-1),first[0],'recently solved item must follow every unseen item');
});

test('wrong questions return to an error session and progress persists', () => {
  const userId=row("SELECT id FROM users WHERE email='select@test.local'").id,questionId=row("SELECT q.id FROM questions q JOIN topics t ON t.id=q.topic_id WHERE t.slug='mendel-laws' LIMIT 1").id,topicId=row("SELECT id FROM topics WHERE slug='mendel-laws'").id;
  run("INSERT INTO attempts(user_id,question_id,answer_json,correct,next_review_at,review_stage) VALUES(?,?,?,0,datetime('now','+1 day'),0)",userId,questionId,'["wrong"]');
  const errors=selectQuestions({rows},userId,normalizeSession({topicId,mode:'errors',count:10}));
  assert.ok(errors.includes(questionId));
  run('INSERT INTO lesson_progress(user_id,topic_id,reading_progress,completed_at) VALUES(?,?,100,CURRENT_TIMESTAMP)',userId,topicId);
  assert.equal(row('SELECT reading_progress FROM lesson_progress WHERE user_id=? AND topic_id=?',userId,topicId).reading_progress,100);
});

test('training session can be completed with a durable question queue', () => {
  const userId=row("SELECT id FROM users WHERE email='select@test.local'").id,topicId=row("SELECT id FROM topics WHERE slug='cell-organelles'").id;
  const session=run("INSERT INTO training_sessions(user_id,topic_id,mode,target_count) VALUES(?,?,?,10)",userId,topicId,'mixed'),sessionId=Number(session.lastInsertRowid),ids=selectQuestions({rows},userId,normalizeSession({topicId,mode:'mixed',count:10}));
  ids.forEach((id,index)=>run('INSERT INTO training_session_questions(session_id,question_id,position) VALUES(?,?,?)',sessionId,id,index+1));
  assert.equal(row('SELECT COUNT(*) count FROM training_session_questions WHERE session_id=?',sessionId).count,10);
  run("UPDATE training_sessions SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?",sessionId);
  assert.equal(row('SELECT status FROM training_sessions WHERE id=?',sessionId).status,'completed');
});
