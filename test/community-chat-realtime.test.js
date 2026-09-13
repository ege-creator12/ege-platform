'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('community chat realtime stream is wired into production startup', () => {
  const entry = read('server-entry.js');
  const patch = read('server-community-chat-live-patch.js');
  const live = read('server-community-chat-live.js');

  assert.match(entry, /server-community-chat-live-patch/);
  assert.match(patch, /live\.handle\(req, res, url\)/);
  assert.match(live, /\/api\/community-chat\/stream/);
  assert.match(live, /text\/event-stream/);
  assert.match(live, /event: \$\{event\}/);
  assert.match(live, /POLL_MS = 650/);
  assert.doesNotMatch(live, /req\.once\('close'/, 'request close must not kill an SSE stream immediately');
});

test('community chat notification client opens realtime stream and shows incoming popup', () => {
  const notifications = read('public/community-chat-notifications.js');
  const index = read('public/index.html');

  assert.match(notifications, /new EventSource\('\/api\/community-chat\/stream'/);
  assert.match(notifications, /addEventListener\('chat-message'/);
  assert.match(notifications, /popup\(message,1\)/);
  assert.match(notifications, /osnova:community-chat-message/);
  assert.doesNotMatch(notifications, /if\(!message\|\|isChatOpen\(\)\)return/,
    'incoming messages should still surface while the chat is open');
  assert.match(index, /community-chat-notifications\.js\?v=20260913-5/);
});
