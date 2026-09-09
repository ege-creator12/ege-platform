/* Shared, short-lived JSON reads for widgets. Never persists personal data. */
'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {
    const data = factory({ fetch: root.fetch.bind(root), origin: root.location.origin });
    root.OsnovaData = data;
    root.addEventListener('hashchange', data.invalidate);
    root.addEventListener('focus', data.invalidate);
  }
})(typeof window === 'undefined' ? globalThis : window, function createStudyData({ fetch, origin, now = Date.now, ttl = 8000 }) {
  const cache = new Map();
  let generation = 0;
  const copy = value => JSON.parse(JSON.stringify(value));
  const shareable = url => url.origin === origin && (
    ['/api/me','/api/topics','/api/subjects'].includes(url.pathname) && !url.search ||
    url.pathname === '/api/attempts' && url.search === '?limit=100' ||
    url.pathname === '/api/ai-pro/plan' && /^\?subject=(biology|chemistry)$/.test(url.search) ||
    /^\/api\/subjects\/(biology|chemistry)\/exam-lines$/.test(url.pathname) && !url.search
  );
  function invalidate() { generation++; cache.clear(); }
  async function read(path, options) {
    const response = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...options });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('Сервер временно недоступен. Попробуйте ещё раз.'); }
    if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
    return data;
  }
  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    if (!['GET','HEAD'].includes(method)) {
      invalidate();
      try { return await read(path, options); }
      finally { invalidate(); }
    }
    const url = new URL(path, origin);
    const headers = new Headers(options.headers);
    if (method !== 'GET' || options.signal || options.body || headers.has('authorization') ||
        (options.credentials && options.credentials !== 'same-origin') || !shareable(url)) return read(path, options);
    const key = url.href;
    const previous = cache.get(key);
    if (previous && (previous.pending || previous.expires > now())) return copy(await previous.promise);
    const version = generation;
    const record = { pending: true, expires: 0, promise: null };
    record.promise = read(path, options).then(data => {
      record.pending = false;
      record.expires = now() + ttl;
      if (generation !== version && cache.get(key) === record) cache.delete(key);
      return data;
    }, error => {
      if (cache.get(key) === record) cache.delete(key);
      throw error;
    });
    cache.set(key, record);
    return copy(await record.promise);
  }
  return { request, invalidate };
});
