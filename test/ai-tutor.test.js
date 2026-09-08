const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const server = readFileSync(join(root, 'server-ai.js'), 'utf8');
const client = readFileSync(join(root, 'public/ai-helper.js'), 'utf8');
const entry = readFileSync(join(root, 'server-entry.js'), 'utf8');

test('AI tutor retries provider failures across server-side model candidates', () => {
  assert.match(server, /MODEL_CANDIDATES/);
  assert.match(server, /for \(const model of MODEL_CANDIDATES\)/);
  assert.match(server, /code: 'GEMINI_RATE_LIMIT',[\s\S]*retryable: true/);
  assert.match(server, /code: 'GEMINI_UPSTREAM',[\s\S]*retryable: true/);
  assert.match(server, /code: 'AI_TIMEOUT',[\s\S]*retryable: true/);
});

test('student chat never exposes provider infrastructure errors or duplicates a submitted question', () => {
  assert.doesNotMatch(client, /Gemini временно недоступен/);
  assert.doesNotMatch(client, /GEMINI_/);
  assert.match(client, /loading\.remove\(\)/);
  assert.match(client, /input\.value=message/);
  assert.doesNotMatch(client, /for\(let attempt=0;attempt<2/);
});

test('daily AI request counter is persistent and initialized before the AI server starts', () => {
  assert.match(entry, /CREATE TABLE IF NOT EXISTS ai_daily_usage/);
  assert.match(entry, /await ensureAiUsageStorage\(\)/);
  assert.ok(entry.indexOf('await ensureAiUsageStorage()') < entry.indexOf("require('./server-ai')"));
  assert.match(server, /SELECT request_count FROM ai_daily_usage/);
  assert.match(server, /UPDATE ai_daily_usage SET request_count=request_count-1/);
});
