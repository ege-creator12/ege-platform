/* Shared, short-lived JSON reads for the app. Keeps tab navigation fast without stale writes. */
'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {
    const data = factory({ fetch: root.fetch.bind(root), origin: root.location.origin });
    root.OsnovaData = data;

    /* Re-clicking the current SPA tab used to trigger a full render and API work again. */
    root.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-nav]') : null;
      if (!target) return;
      const route = String(target.dataset.nav || '');
      if (route && root.location.hash.slice(1) === route) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }
})(typeof window === 'undefined' ? globalThis : window, function createStudyData({ fetch, origin, now = Date.now }) {
  const cache = new Map();
  let generation = 0;
  const MAX_CACHE_ENTRIES = 32;
  const copy = value => typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function ttlFor(url) {
    const p = url.pathname;
    if (p === '/api/me') return 15000;
    if (p === '/api/topics') return 300000;
    if (p === '/api/subjects/biology/navigation') return 60000;
    if (p === '/api/subjects/chemistry') return 180000;
    if (p === '/api/subjects/biology/mock-exams') return 20000;
    if (p === '/api/subjects/biology/exam-lines') return 60000;
    if (/^\/api\/subjects\/biology\/exam-lines\/\d+$/.test(p)) return 60000;
    if (/^\/api\/subjects\/biology\/groups\/[a-z0-9_-]+$/i.test(p)) return 120000;
    if (/^\/api\/(topics|sections)\/\d+$/.test(p)) return 120000;
    if (/^\/api\/lessons\/\d+$/.test(p)) return 300000;
    if (p === '/api/attempts' && url.search === '?limit=100') return 20000;
    if (p === '/api/ai-pro/plan' && /^\?subject=(biology|chemistry)$/.test(url.search)) return 30000;
    return 0;
  }

  function shareable(url) {
    return url.origin === origin && ttlFor(url) > 0;
  }

  function invalidate() {
    generation++;
    cache.clear();
  }

  function trimCache() {
    while (cache.size > MAX_CACHE_ENTRIES) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
  }

  function appError(message, status = 0, transient = false) {
    const error = new Error(message);
    error.status = Number(status) || 0;
    error.transient = Boolean(transient);
    return error;
  }

  function canRetry(path, method) {
    if (method === 'GET' || method === 'HEAD') return true;
    try {
      return method === 'POST' && new URL(path, origin).pathname === '/api/ai-pro/coach';
    } catch {
      return false;
    }
  }

  function transientStatus(status) {
    return status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504;
  }

  async function read(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const retryable = canRetry(path, method);
    const maxAttempts = retryable ? 3 : 1;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response;
      try {
        response = await fetch(path, {
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          ...options
        });
      } catch (error) {
        lastError = appError('Не удалось соединиться с сервисом.', 0, true);
        if (attempt + 1 < maxAttempts) {
          await sleep(300 * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }

      let raw = '';
      try { raw = await response.text(); }
      catch {
        lastError = appError('Ответ сервиса не удалось прочитать.', response.status, true);
        if (attempt + 1 < maxAttempts) {
          await sleep(300 * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }

      let data = {};
      if (raw) {
        try { data = JSON.parse(raw); }
        catch {
          const transient = response.status >= 500 || response.status === 0;
          lastError = appError('Сервис возвращает временный ответ.', response.status, transient);
          if (transient && attempt + 1 < maxAttempts) {
            await sleep(300 * Math.pow(2, attempt));
            continue;
          }
          throw lastError;
        }
      }

      if (!response.ok) {
        const transient = transientStatus(response.status);
        lastError = appError(data.error || `Ошибка ${response.status}`, response.status, transient);
        if (transient && attempt + 1 < maxAttempts) {
          await sleep(300 * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }

      return data;
    }

    throw lastError || appError('Не удалось выполнить запрос.', 0, true);
  }

  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();

    /* Any write invalidates every cached read before and after it. */
    if (!['GET', 'HEAD'].includes(method)) {
      invalidate();
      try { return await read(path, options); }
      finally { invalidate(); }
    }

    const url = new URL(path, origin);
    const headers = new Headers(options.headers);
    if (
      method !== 'GET' ||
      options.signal ||
      options.body ||
      headers.has('authorization') ||
      (options.credentials && options.credentials !== 'same-origin') ||
      !shareable(url)
    ) return read(path, options);

    const key = url.href;
    const previous = cache.get(key);

    /* A pending request is shared; a fresh completed request is returned immediately. */
    if (previous && (previous.pending || previous.expires > now())) {
      return copy(await previous.promise);
    }

    const version = generation;
    const record = { pending: true, expires: 0, promise: null };
    record.promise = read(path, options).then(data => {
      record.pending = false;
      record.expires = now() + ttlFor(url);
      if (generation !== version && cache.get(key) === record) cache.delete(key);
      return data;
    }, error => {
      if (cache.get(key) === record) cache.delete(key);
      throw error;
    });

    cache.delete(key);
    cache.set(key, record);
    trimCache();
    return copy(await record.promise);
  }

  return { request, invalidate };
});
