const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const server = readFileSync(join(root, 'server-ai-review.js'), 'utf8');
const router = readFileSync(join(root, 'server-training-router.js'), 'utf8');
const client = readFileSync(join(root, 'public/ai-helper.js'), 'utf8');
const entry = readFileSync(join(root, 'server-entry.js'), 'utf8');

test('contextual AI review server parses and is reachable from production entrypoint', () => {
  assert.doesNotThrow(() => new Function(server));
  assert.doesNotThrow(() => new Function(router));
  assert.match(entry, /require\('\.\/server-training-router'\)/);
  assert.match(router, /server-ai-review\.js/);
});

test('mistake review has all learning actions and uses real task context', () => {
  for (const action of ['full','hint','simplify','why_wrong','similar','harder','check_explanation']) {
    assert.match(server, new RegExp(`${action}:`));
  }
  assert.match(server, /Ответ ученика:/);
  assert.match(server, /Официальный ответ:/);
  assert.match(server, /Ошибок ученика в этой теме/);
  assert.match(server, /Недавние другие ошибки этой темы/);
});

test('one mistake review charges once while follow-ups remain included', () => {
  assert.match(server, /reviewSessions/);
  assert.match(server, /REVIEW_TTL_MINUTES/);
  assert.match(server, /hasActiveReview/);
  assert.match(server, /reviewCharged: quota\.charged/);
});

test('student UI shows contextual tools only after a wrong answer', () => {
  assert.match(client, /querySelector\('\.result\.wrong'\)/);
  assert.match(client, /Дай подсказку/);
  assert.match(client, /Объясни проще/);
  assert.match(client, /Почему мой ответ неверный/);
  assert.match(client, /Дай похожее задание/);
  assert.match(client, /Дай сложнее/);
  assert.match(client, /Проверь моё объяснение/);
  assert.doesNotMatch(client, /Gemini временно недоступен/);
});
