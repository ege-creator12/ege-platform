'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

test('owner claim backdoor is not present in admin server', () => {
  const source = readFileSync(join(root, 'server-admin.js'), 'utf8');
  assert.doesNotMatch(source, /OWNER_CLAIM_PATH/);
  assert.doesNotMatch(source, /\/api\/owner-claim\//);
  assert.doesNotMatch(source, /owner_claim_used/);
});

test('common local secret files are ignored by git', () => {
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env\.\*$/m);
  assert.match(ignore, /^!\.env\.example$/m);
  assert.match(ignore, /^\*\.pem$/m);
  assert.match(ignore, /^\*\.key$/m);
});
