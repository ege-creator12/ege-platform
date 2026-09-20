'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../content/biology/exam-lines.json');
const { biologyLinePayload, strictPattern } = require('../src/biology-line-service');

const root = path.join(__dirname, '..');

test('strict biology line patterns are unique for every EGE line', () => {
  assert.equal(registry.lines.length, 28);
  const patterns = registry.lines.map(info => strictPattern(info.line));
  assert.equal(new Set(patterns).size, 28);
  registry.lines.forEach(info => {
    assert.equal(strictPattern(info.line), `biology-bank-v9-line${info.line}-%`);
  });
});

test('biology line payload scopes count, progress, mistakes and examples to biology v9', async () => {
  const queries = [];
  const db = {
    async row(sql, ...params) {
      queries.push({ kind: 'row', sql, params });
      if (/FROM subjects/.test(sql)) return { id: 77, title: 'Биология' };
      if (/COUNT\(\*\) n FROM questions/.test(sql)) return { n: 12 };
      if (/COUNT\(\*\) attempted/.test(sql)) return { attempted: 5, correct: 4, last_attempt_at: null };
      return {};
    },
    async rows(sql, ...params) {
      queries.push({ kind: 'rows', sql, params });
      return [];
    },
  };

  const payload = await biologyLinePayload(db, registry, 19, 123);
  assert.equal(payload.subjectSlug, 'biology');
  assert.equal(payload.strictBank, true);
  assert.equal(payload.bankVersion, 9);
  assert.equal(payload.questionCount, 12);

  const questionQueries = queries.filter(item => /questions q|FROM questions/.test(item.sql));
  assert.ok(questionQueries.length >= 4);
  for (const item of questionQueries) {
    assert.match(item.sql, /q\.subject_id=\?/);
    assert.match(item.sql, /q\.exam_line=\?/);
    assert.match(item.sql, /q\.external_key LIKE \?/);
    assert.ok(item.params.includes(77), 'biology subject id must be passed');
    assert.ok(item.params.includes(19), 'requested line must be passed');
    assert.ok(item.params.includes('biology-bank-v9-line19-%'), 'strict v9 prefix must be passed');
  }
});

test('production entry reaches strict biology router through performance and product gateways', () => {
  const entry = fs.readFileSync(path.join(root, 'server-entry.js'), 'utf8');
  const performance = fs.readFileSync(path.join(root, 'server-performance.js'), 'utf8');
  const product = fs.readFileSync(path.join(root, 'server-product.js'), 'utf8');
  assert.match(entry, /require\('\.\/server-performance'\)/);
  assert.match(performance, /server-product\.js/);
  assert.match(product, /server-biology-lines\.js/);
  execFileSync(process.execPath, ['--check', path.join(root, 'server-performance.js')]);
  execFileSync(process.execPath, ['--check', path.join(root, 'server-product.js')]);
  execFileSync(process.execPath, ['--check', path.join(root, 'server-biology-lines.js')]);
});
