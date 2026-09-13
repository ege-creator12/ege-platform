'use strict';

const communityChat = require('./server-community-chat');
const live = require('./server-community-chat-live');

if (!communityChat.__livePatched) {
  const originalHandle = communityChat.handle;
  communityChat.handle = async (req, res, url) => {
    if (await live.handle(req, res, url)) return true;
    return originalHandle(req, res, url);
  };
  Object.defineProperty(communityChat, '__livePatched', { value: true });
}

let closed = false;
function closeLive() {
  if (closed) return;
  closed = true;
  live.close();
}
process.once('SIGTERM', closeLive);
process.once('SIGINT', closeLive);

module.exports = live;
