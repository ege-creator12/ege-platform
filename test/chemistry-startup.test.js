const test = require('node:test');
const assert = require('node:assert/strict');
const builders = require('../src/chemistry-line-bank');
const { BANK_VERSION, MEDIUM_BANK_VERSION } = require('../src/chemistry-line-bank-runner');
const { semanticFingerprint } = require('../src/question-semantic-quality');

test('chemistry generated banks use duplicate-free stable namespaces', () => {
  assert.equal(BANK_VERSION, 'v3');
  assert.equal(MEDIUM_BANK_VERSION, 'retired-v1');
});

test('every chemistry line builds ten distinct startup questions', () => {
  for (let line = 1; line <= 34; line++) {
    assert.equal(typeof builders[line], 'function', `line ${line}`);
    const fingerprints = new Set();
    for (let n = 1; n <= 10; n++) {
      const question = builders[line](n);
      assert.ok(question.prompt && question.explanation, `line ${line}, item ${n}`);
      assert.ok(question.answer.length, `line ${line}, item ${n}`);
      const fp = semanticFingerprint(question);
      assert.equal(fingerprints.has(fp), false, `line ${line}, item ${n}: duplicate`);
      fingerprints.add(fp);
    }
    assert.equal(fingerprints.size, 10, `line ${line}: expected ten unique tasks`);
  }
});

test('legacy medium clone namespace is retired from startup bank', () => {
  assert.equal(MEDIUM_BANK_VERSION, 'retired-v1');
  assert.notEqual(BANK_VERSION, 'v2');
});

test('line 30 keeps the selected molecular and ionic equations in the model answer', () => {
  const question = builders[30](1);
  assert.match(question.answer[0], /Молекулярное:/);
  assert.match(question.answer[0], /Сокращённое ионное:/);
  assert.doesNotMatch(question.answer[0], /undefined/);
});
