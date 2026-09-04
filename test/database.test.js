const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ege-')), 'test.sqlite');
const { migrate, row, rows } = require('../src/db');

test('migration creates the complete learning schema', () => {
  migrate();
  const required = ['users','subjects','topics','questions','question_options','attempts','topic_progress','mock_exams','mock_exam_attempts','skills','question_skills','lesson_progress','training_sessions','training_session_questions'];
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
  for (const column of ['instruction','media_json','tags_json','estimated_seconds']) {
    assert.ok(rows('PRAGMA table_info(questions)').some(item => item.name === column));
  }
  assert.equal(row('SELECT COUNT(*) count FROM schema_migrations').count, 3);
});

test('adaptive learning data can be connected to a persistent training session', () => {
  migrate();
  const { run } = require('../src/db');
  const insertedUser = run("INSERT INTO users(name,email,password_hash) VALUES('Тест','session-test@ege.local','unused')");
  const user = { id: Number(insertedUser.lastInsertRowid) };
  const question = row('SELECT id,topic_id FROM questions ORDER BY id LIMIT 1');
  const skill = row('SELECT id FROM skills ORDER BY id LIMIT 1');
  assert.ok(user && question && skill);
  assert.ok(row('SELECT 1 ok FROM question_skills WHERE question_id=? AND skill_id=?', question.id, skill.id));
  const session = run('INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,?,?,?)', user.id, question.topic_id, 'adaptive', 5);
  run('INSERT INTO training_session_questions(session_id,question_id,position) VALUES(?,?,0)', Number(session.lastInsertRowid), question.id);
  assert.equal(row('SELECT status FROM training_sessions WHERE id=?', Number(session.lastInsertRowid)).status, 'active');
});
