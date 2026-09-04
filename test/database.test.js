const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ege-')), 'test.sqlite');
const { migrate, row, rows } = require('../src/db');

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
  assert.equal(row('SELECT COUNT(*) count FROM schema_migrations').count, 2);
});
