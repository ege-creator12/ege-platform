const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ege-')), 'test.sqlite');
const { migrate, row } = require('../src/db');
const { ensureBaseData } = require('../src/bootstrap');

test('migration creates the complete learning schema', () => {
  migrate();
  const required = ['users','subjects','topics','questions','question_options','attempts','topic_progress','mock_exams','mock_exam_attempts'];
  for (const name of required) assert.ok(row("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name));
});

test('production bootstrap creates a four-level biology tree idempotently', () => {
  migrate();
  ensureBaseData();
  const first = row("SELECT COUNT(*) count FROM topics").count;
  ensureBaseData();
  const second = row("SELECT COUNT(*) count FROM topics").count;
  assert.equal(first, second);
  assert.equal(row("SELECT COUNT(*) count FROM topics WHERE kind='section'").count, 9);
  assert.ok(row("SELECT COUNT(*) count FROM topics WHERE kind='lesson' AND depth=3").count >= 40);
  assert.equal(row("SELECT COUNT(*) count FROM subjects WHERE slug='biology'").count, 1);
});

test('question and review metadata is available after migrations', () => {
  const columns = name => new Set(require('../src/db').rows(`PRAGMA table_info(${name})`).map(x => x.name));
  for (const name of ['source','is_original','skill_tags_json','generator_key','generator_params_json']) assert.ok(columns('questions').has(name));
  for (const name of ['ease_factor','repetition','lapse_count']) assert.ok(columns('attempts').has(name));
});
