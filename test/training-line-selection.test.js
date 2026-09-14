'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { semanticFamily, selectExamLineQuestionIds } = require('../src/training-line-selection');

const q = (id, difficulty, prompt, content = {}, answer = ['1']) => ({
  id,
  difficulty,
  prompt,
  content_json: JSON.stringify(content),
  answer_json: JSON.stringify(answer),
  image_url: null,
  attempt_id: null,
  correct: null,
  next_review_at: null,
});

test('semantic family ignores cosmetic v6 prefixes and transient variant metadata', () => {
  const base = q(1, 2, 'Определите процесс по условию.', { strictFipi2027: true, strictExamLine: 2, strictBankVersion: 6, variant: 1, value: 42 });
  const cosmetic = q(2, 3, 'Выполните ещё один вариант этого типа. Определите процесс по условию.', { strictFipi2027: true, strictExamLine: 2, strictBankVersion: 6, variant: 25, value: 42 });
  assert.equal(semanticFamily(base), semanticFamily(cosmetic));
});

test('exam-line selector exhausts unseen semantic families before repeats', () => {
  const candidates = [
    q(1, 3, 'Задача A', { value: 1 }),
    q(2, 3, 'Выполните ещё один вариант этого типа. Задача A', { value: 1, variant: 13 }),
    q(3, 2, 'Задача B', { value: 2 }),
    q(4, 1, 'Задача C', { value: 3 }),
  ];
  const exposure = new Map([
    [1, { assignedCount: 1, presentedCount: 1, lastAssignedAt: '2026-09-10T10:00:00Z', lastPresentedAt: '2026-09-10T10:00:00Z' }],
  ]);
  const ids = selectExamLineQuestionIds(candidates, exposure, { mode: 'adaptive', limit: 2, now: Date.parse('2026-09-15T00:00:00Z') });
  assert.deepEqual(new Set(ids), new Set([3, 4]));
});

test('exam-line selector prefers harder tasks when exposure is equal', () => {
  const candidates = [
    q(11, 1, 'Лёгкая задача', { value: 11 }),
    q(12, 3, 'Сложная задача', { value: 12 }),
    q(13, 2, 'Средняя задача', { value: 13 }),
  ];
  const ids = selectExamLineQuestionIds(candidates, new Map(), { mode: 'adaptive', limit: 3 });
  assert.deepEqual(ids, [12, 13, 11]);
});

test('exam-line selector never returns two cosmetic copies of one family in one session', () => {
  const candidates = [
    q(21, 2, 'По новой серии измерений: Рассчитайте показатель.', { x: 7, variant: 21 }),
    q(22, 3, 'Рассчитайте показатель.', { x: 7, variant: 1 }),
    q(23, 2, 'Рассчитайте другой показатель.', { x: 8 }),
  ];
  const ids = selectExamLineQuestionIds(candidates, new Map(), { limit: 3 });
  assert.equal(ids.length, 2);
  assert.ok(ids.includes(23));
  assert.ok(ids.includes(21) || ids.includes(22));
});
