'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server-training-router.js'), 'utf8');

test('general training never falls back to an all-subject pool', () => {
  assert.match(source, /const subjectSlugs = new Set\(\['biology', 'chemistry'\]\)/);
  assert.match(source, /resolvedSubject = 'biology';\s*onlySubjectId = await subjectId\('biology'\);/s);
  assert.match(source, /subjectId: onlySubjectId/);
  assert.doesNotMatch(source, /const biologyId = examLine \? await subjectId\('biology'\) : 0/);
});

test('topic training resolves the subject from the topic', () => {
  assert.match(source, /SELECT subject_id FROM topics WHERE id=\?/);
  assert.match(source, /if \(!onlySubjectId\) return json\(res, 404,/);
});
