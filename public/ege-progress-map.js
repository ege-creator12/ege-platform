(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[c]);
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const route = () => location.hash.slice(1) || 'dashboard';

  async function getJson(path) {
    if (window.OsnovaData) return window.OsnovaData.request('/api' + path);
    const response = await fetch('/api' + path, { headers: { accept: 'application/json' }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить прогресс');
    return data;
  }

  async function loadSubject(slug) {
    return getJson('/subjects/' + slug + '/exam-lines');
  }

  function normalizeLine(line) {
    const attempted = num(line?.progress?.attempted);
    const correct = num(line?.progress?.correct);
    const accuracy = attempted ? Math.max(0, Math.min(100, num(line?.progress?.accuracy))) : 0;
    const maxScore = Math.max(1, num(line.maxScore) || 1);
    let status = 'untouched';
    if (attempted > 0 && accuracy < 55) status = 'weak';
    else if (attempted > 0 && (attempted < 5 || accuracy < 80)) status = 'learning';
    else if (attempted >= 5 && accuracy >= 80) status = 'mastered';
    return { ...line, attempted, correct, accuracy, maxScore, status };
  }

  function stats(linesRaw) {
    const lines = (linesRaw || []).map(normalizeLine);
    const totalPrimary = lines.reduce((sum, line) => sum + line.maxScore, 0) || lines.length || 1;
    let weighted = 0;
    let certaintyWeight = 0;
    let attemptedLines = 0;
    for (const line of lines) {
      if (line.attempted) attemptedLines += 1;
      const sampleConfidence = Math.min(1, line.attempted / 5);
      const effectiveAccuracy = line.attempted
        ? (line.accuracy / 100) * (0.72 + 0.28 * sampleConfidence)
        : 0;
      weighted += line.maxScore * effectiveAccuracy;
      certaintyWeight += line.maxScore * sampleConfidence;
    }
    const readiness = Math.round(weighted / totalPrimary * 100);
    const coverage = Math.round(attemptedLines / Math.max(1, lines.length) * 100);
    const certainty = certaintyWeight / totalPrimary;
    const forecastReady = coverage >= 40 && attemptedLines >= 8 && certainty >= 0.18;
    const uncertainty = Math.max(6, Math.round((1 - certainty) * 16 + 4));
    const low = forecastReady ? Math.max(0, readiness - Math.ceil(uncertainty * 0.55)) : null;
    const high = forecastReady ? Math.min(100, readiness + uncertainty) : null;
    const counts = { mastered: 0, learning: 0, weak: 0, untouched: 0 };
    lines.forEach(line => counts[line.status]++);
    const risk = [...lines]
      .filter(line => line.status !== 'mastered')
      .sort((a, b) => {
        const riskA = a.maxScore * (100 - (a.attempted ? a.accuracy : 20));
        const riskB = b.maxScore * (100 - (b.attempted ? b.accuracy : 20));
        return riskB - riskA || b.maxScore - a.maxScore || a.line - b.line;
      });
    return { lines, totalPrimary, readiness, coverage, certainty, forecastReady, low, high, counts, risk };
  }

  const statusText = {
    mastered: 'Освоено', learning: 'В работе', weak: 'Слабая', untouched: 'Не начато'
  };

  function subjectLabel(slug) { return slug === 'chemistry' ? 'Химия' : 'Биология'; }

  function summaryCard(slug, data) {
    const s = stats(data.lines);
    const firstRisk = s.risk[0];
    const forecast = s.forecastReady ? `${s.low}–${s.high}` : 'Мало данных';
    return `<article class="ege-map-summary" data-map-open="${slug}">
      <div class="ege-map-summary-top"><span>${subjectLabel(slug)}</span><b>${forecast}</b></div>
      <h3>${s.forecastReady ? 'Модельный диапазон' : 'Сначала расширим диагностику'}</h3>
      <div class="ege-map-meter"><i style="width:${s.readiness}%"></i></div>
      <div class="ege-map-summary-meta"><span>${s.coverage}% линий проверено</span><span>${s.readiness}% готовность</span></div>
      <p>${firstRisk ? `Сейчас выгоднее всего подтянуть линию ${firstRisk.line}: ${esc(firstRisk.title)}.` : 'Начните диагностику, чтобы построить прогноз.'}</p>
      <button class="btn ghost" type="button">Открыть карту →</button>
    </article>`;
  }

  function lineCard(slug, line) {
    return `<article class="ege-line-tile ${line.status}">
      <div class="ege-line-tile-head"><span class="ege-line-num">${line.line}</span><span class="ege-line-status">${statusText[line.status]}</span></div>
      <h3>${esc(line.title)}</h3>
      <div class="ege-line-meta"><span>${line.maxScore} ${line.maxScore === 1 ? 'первичный балл' : 'перв. балла'}</span><span>${line.attempted ? `${line.accuracy}% · ${line.attempted} реш.` : 'Нет попыток'}</span></div>
      <div class="ege-line-progress"><i style="width:${line.accuracy}%"></i></div>
      <button class="btn ghost" data-open-line="${slug}" data-line="${line.line}">${line.attempted ? 'Тренировать' : 'Начать'}</button>
    </article>`;
  }

  function forecastHtml(s) {
    const confidence = s.coverage >= 75 ? 'высокая' : s.coverage >= 40 ? 'средняя' : 'низкая';
    if (!s.forecastReady) {
      return `<section class="ege-forecast-card">
        <div><span class="eyebrow">Прогноз по реальным ответам</span><h2>Недостаточно данных для прогноза</h2><p>Проверено ${s.coverage}% линий. Сайт специально не показывает широкий диапазон вроде «0–24»: сначала нужно решить задания из большего числа линий.</p></div>
        <div class="ege-forecast-stats"><div><b>${s.readiness}%</b><span>текущая готовность</span></div><div><b>${s.coverage}%</b><span>покрытие линий</span></div><div><b>${confidence}</b><span>уверенность данных</span></div></div>
      </section>`;
    }
    return `<section class="ege-forecast-card">
      <div><span class="eyebrow">Прогноз по реальным ответам</span><h2>${s.low}–${s.high} из 100</h2><p>Это модельный ориентир готовности, а не официальный перевод первичных баллов. Чем больше разных линий решено, тем уже становится диапазон.</p></div>
      <div class="ege-forecast-stats"><div><b>${s.readiness}%</b><span>текущая готовность</span></div><div><b>${s.coverage}%</b><span>покрытие линий</span></div><div><b>${confidence}</b><span>уверенность прогноза</span></div></div>
    </section>`;
  }

  function mapPage(slug, payload) {
    const s = stats(payload.lines);
    const mastered = s.counts.mastered;
    const weak = s.counts.weak;
    const untouched = s.counts.untouched;
    const topRisk = s.risk.slice(0, 4);
    return `<div class="ege-map-page">
      <header class="ege-map-hero"><div><div class="eyebrow">Карта ЕГЭ · ${subjectLabel(slug)}</div><h1>Все линии перед глазами</h1><p class="subtitle">Сразу видно, что уже освоено, где теряются баллы и какую линию тренировать следующей.</p></div><button class="btn" data-map-diagnostic="${slug}">Диагностика · 24 задания</button></header>
      <div class="ege-map-tabs"><button data-map-subject="biology" class="${slug === 'biology' ? 'active' : ''}">Биология</button><button data-map-subject="chemistry" class="${slug === 'chemistry' ? 'active' : ''}">Химия</button></div>
      ${forecastHtml(s)}
      <div class="ege-map-metrics"><div class="card"><span>Освоено</span><b>${mastered}</b><small>из ${s.lines.length} линий</small></div><div class="card"><span>В работе</span><b>${s.counts.learning}</b><small>нужно закрепление</small></div><div class="card"><span>Слабые</span><b>${weak}</b><small>приоритет на баллы</small></div><div class="card"><span>Не начато</span><b>${untouched}</b><small>ещё не проверено</small></div></div>
      ${topRisk.length ? `<section class="ege-priority"><div class="section-head"><h2>Что даст больше всего сейчас</h2><span class="pill">Приоритет</span></div><div class="ege-priority-list">${topRisk.map((line, i) => `<button data-open-line="${slug}" data-line="${line.line}"><span>${i + 1}</span><div><b>Линия ${line.line}. ${esc(line.title)}</b><small>${line.attempted ? `Точность ${line.accuracy}% · ${line.maxScore} перв. балл${line.maxScore > 1 ? 'а' : ''}` : `Ещё не проверена · ${line.maxScore} перв. балл${line.maxScore > 1 ? 'а' : ''}`}</small></div><strong>→</strong></button>`).join('')}</div></section>` : ''}
      <div class="section-head"><h2>Карта линий</h2><span class="pill">${s.lines.length} заданий ЕГЭ</span></div>
      <div class="ege-line-map-grid">${s.lines.map(line => lineCard(slug, line)).join('')}</div>
      <p class="ege-map-note">Статус «освоено» ставится после достаточного числа попыток и устойчивой точности. Одна удачная попытка не считается освоением.</p>
    </div>`;
  }

  function bindMap(root) {
    root.querySelectorAll('[data-map-subject]').forEach(button => {
      button.onclick = () => { location.hash = 'progress-map/' + button.dataset.mapSubject; };
    });
    root.querySelectorAll('[data-open-line]').forEach(button => {
      button.onclick = () => go(`${button.dataset.openLine}/line/${button.dataset.line}`);
    });
    root.querySelectorAll('[data-map-diagnostic]').forEach(button => {
      button.onclick = async () => {
        const slug = button.dataset.mapDiagnostic;
        const original = button.textContent;
        button.disabled = true; button.textContent = 'Подбираем…';
        try {
          const response = await fetch('/api/ai-pro/diagnostic', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ subjectSlug: slug, count: 24 })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Не удалось начать диагностику');
          sessionStorage.trainingSession = data.session.id;
          sessionStorage.trainingSubject = slug;
          location.hash = 'training';
        } catch (error) {
          if (typeof notify === 'function') notify(error.message);
          button.disabled = false; button.textContent = original;
        }
      };
    });
  }

  async function renderMapRoute() {
    const parts = route().split('/');
    const slug = parts[1] === 'chemistry' ? 'chemistry' : 'biology';
    loading();
    try {
      const data = await loadSubject(slug);
      if (route() !== 'progress-map/' + slug && !(slug === 'biology' && route() === 'progress-map')) return;
      app.innerHTML = shell(mapPage(slug, data));
      bindShell();
      injectNav();
      bindMap(app);
    } catch (error) {
      if (route() !== 'progress-map/' + slug && !(slug === 'biology' && route() === 'progress-map')) return;
      console.error('ege-progress-map', error);
      errorState(renderMapRoute);
    }
  }

  function injectNav() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    let button = nav.querySelector('[data-ege-map-nav]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.egeMapNav = '1';
      button.innerHTML = '<span class="nav-icon">▦</span>Карта ЕГЭ';
      const mocks = nav.querySelector('[data-nav="mocks"]');
      if (mocks) nav.insertBefore(button, mocks);
      else nav.appendChild(button);
      button.onclick = () => go('progress-map/biology');
    }
    button.classList.toggle('active', route().startsWith('progress-map'));
  }

  async function mountDashboardSnapshot() {
    if (route() !== 'dashboard') return;
    const main = document.querySelector('.app main');
    if (!main || main.querySelector('#ege-progress-snapshot')) return;
    const hero = main.querySelector('.hero-row');
    if (!hero) return;
    const host = document.createElement('section');
    host.id = 'ege-progress-snapshot';
    host.className = 'ege-progress-snapshot';
    host.innerHTML = `<div class="section-head"><div><h2>Карта подготовки</h2><p>Готовность и слабые линии по каждому предмету.</p></div><button class="btn ghost" data-open-map-all>Открыть карту</button></div><div class="ege-map-summary-grid">${['biology','chemistry'].map(slug=>`<div data-summary-slot="${slug}" class="card" role="status" aria-live="polite"><span class="eyebrow">${subjectLabel(slug)}</span><p>Загружаем прогресс…</p></div>`).join('')}</div>`;
    hero.insertAdjacentElement('afterend', host);
    host.querySelector('[data-open-map-all]').onclick = () => go('progress-map/biology');
    async function fill(slug) {
      const slot = host.querySelector('[data-summary-slot="' + slug + '"]');
      if (!slot) return;
      try {
        const data = await loadSubject(slug);
        if (!host.isConnected || route() !== 'dashboard') return;
        slot.className = 'ege-summary-slot';
        slot.removeAttribute('role');
        slot.innerHTML = summaryCard(slug, data);
        slot.querySelector('[data-map-open]').onclick = () => go('progress-map/' + slug);
      } catch {
        if (!host.isConnected || route() !== 'dashboard') return;
        slot.innerHTML = `<span class="eyebrow">${subjectLabel(slug)}</span><p>Не удалось загрузить прогресс.</p><button class="btn ghost" data-retry-summary>Повторить</button>`;
        slot.querySelector('[data-retry-summary]').onclick = event => { event.currentTarget.disabled = true; fill(slug); };
      }
    }
    await Promise.allSettled(['biology','chemistry'].map(fill));
  }

  const previousRender = render;
  render = async function() {
    if (state.user && route().startsWith('progress-map')) return renderMapRoute();
    const result = await previousRender();
    queueMicrotask(() => { injectNav(); mountDashboardSnapshot(); });
    return result;
  };

  const observer = new MutationObserver(() => {
    injectNav();
    if (route() === 'dashboard') queueMicrotask(mountDashboardSnapshot);
  });
  const appRoot = document.querySelector('#app');
  if (appRoot) observer.observe(appRoot, { childList: true, subtree: true });
  addEventListener('hashchange', () => setTimeout(() => { injectNav(); mountDashboardSnapshot(); }, 0));
  setTimeout(() => { injectNav(); mountDashboardSnapshot(); }, 0);
})();
