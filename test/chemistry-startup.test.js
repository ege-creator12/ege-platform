const test = require('node:test');
const assert = require('node:assert/strict');
const builders = require('../src/chemistry-line-bank');
const { mediumVariant } = require('../src/chemistry-medium-bank');
const { BANK_VERSION, MEDIUM_BANK_VERSION } = require('../src/chemistry-line-bank-runner');

test('chemistry generated banks use stable namespaces', () => {
  assert.equal(BANK_VERSION, 'v2');
  assert.equal(MEDIUM_BANK_VERSION, 'v1');
});

test('every chemistry line can build the full startup bank', () => {
  for (let line = 1; line <= 34; line++) {
    assert.equal(typeof builders[line], 'function', `line ${line}`);
    for (let n = 1; n <= 20; n++) {
      const question = builders[line](n);
      assert.ok(question.prompt && question.explanation, `line ${line}, item ${n}`);
      assert.ok(question.answer.length, `line ${line}, item ${n}`);
    }
  }
});

test('every chemistry line has twenty valid medium variants', () => {
  for (let line = 1; line <= 34; line++) {
    for (let n = 1; n <= 20; n++) {
      const question = mediumVariant(line, n, builders[line](n));
      assert.equal(question.difficulty, 2, `line ${line}, medium ${n}: difficulty`);
      assert.ok(question.prompt && question.explanation, `line ${line}, medium ${n}: content`);
      assert.ok(Array.isArray(question.answer) && question.answer.length, `line ${line}, medium ${n}: answer`);
      if (Array.isArray(question.options) && question.options.length) {
        const values = new Set(question.options.map(option => String(option.value)));
        assert.equal(values.size, question.options.length, `line ${line}, medium ${n}: option values`);
        assert.ok(question.answer.every(value => values.has(String(value))), `line ${line}, medium ${n}: answer mapping`);
      }
      if (question.type === 'matching' && Array.isArray(question.content?.right)) {
        assert.ok(question.answer.every(value => Number(value) >= 0 && Number(value) < question.content.right.length), `line ${line}, medium ${n}: matching mapping`);
      }
    }
  }
});

test('line 30 keeps the selected molecular and ionic equations in the model answer', () => {
  const question = builders[30](1);
  assert.match(question.answer[0], /Молекулярное:/);
  assert.match(question.answer[0], /Сокращённое ионное:/);
  assert.doesNotMatch(question.answer[0], /undefined/);
});
