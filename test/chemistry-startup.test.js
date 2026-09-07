const test = require('node:test');
const assert = require('node:assert/strict');
const builders = require('../src/chemistry-line-bank');

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

test('line 30 keeps the selected molecular and ionic equations in the model answer', () => {
  const question = builders[30](1);
  assert.match(question.answer[0], /Молекулярное:/);
  assert.match(question.answer[0], /Сокращённое ионное:/);
  assert.doesNotMatch(question.answer[0], /undefined/);
});
