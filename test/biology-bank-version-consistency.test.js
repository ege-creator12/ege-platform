'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BIOLOGY_BANK_VERSION, BIOLOGY_BANK_VERSION_TAG } = require('../src/biology-bank-version');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('all server-side biology line routes share one bank version', () => {
  assert.equal(BIOLOGY_BANK_VERSION, 9);
  assert.equal(BIOLOGY_BANK_VERSION_TAG, 'v9');
  for (const file of [
    'src/biology-line-service.js',
    'src/biology-line-bank-runner.js',
    'src/startup-readiness.js',
    'server-training-router.js',
  ]) {
    assert.match(read(file), /biology-bank-version/);
  }
});

test('browser accepts and stores the strict bank version returned by the server', () => {
  const guard = read('public/training-line-guard.js');
  assert.match(guard, /const bankVersion=Number\(data\.bankVersion\)/);
  assert.match(guard, /trainingBankVersion=String\(bankVersion\)/);
  assert.doesNotMatch(guard, /bankVersion\)!==\d+/);
  assert.doesNotMatch(guard, /trainingBankVersion='\d+'/);
});
