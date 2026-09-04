const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ege-')), 'test.sqlite');
const { migrate, row } = require('../src/db');

test('migration creates the complete learning schema', () => {
  migrate();
  const required = ['users','subjects','topics','questions','question_options','attempts','topic_progress','mock_exams','mock_exam_attempts'];
  for (const name of required) assert.ok(row("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name));
});
