const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const client = readFileSync(resolve(__dirname, '../public/app.js'), 'utf8');

test('training route does not trigger the hashchange dashboard race', () => {
  assert.doesNotMatch(client, /location\.hash\s*=\s*['"]training['"]/);
  assert.match(client, /history\.replaceState\(null,'','#training'\)/);
  assert.match(client, /state\.route==='training'.*startTraining/);
});

test('finishing a session renders persisted result summary', () => {
  assert.match(client, /async function finishTraining/);
  assert.match(client, /state\.route='training-result'/);
  assert.match(client, /Результат занятия/);
  assert.match(client, /Прогресс и расписание повторений сохранены/);
});
