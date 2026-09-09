(() => {
  'use strict';

  const ROOT_ID = 'learning-coach';
  let mounting = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);

  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const route = () => location.hash.slice(1) || 'dashboard';
  const isDashboard = () => route() === 'dashboard';
  const formatDate = value => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  function parseResult(value) {
    try { return typeof value === 'string' ? JSON.parse(value || '{}') : (value || {}); }
    catch { return {}; }
  }

  async function getJson(path, options = {}) {
    if (window.OsnovaData) return window.OsnovaData.request('/api' + path, options);
    const response = await fetch('/api' + path, {
      headers: { 'content-type': 'application/json' },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить данные');
    return data;
  }

  async function loadData() {
    const [me, topics, attempts, subjects] = await Promise.all([
      getJson('/me'),
      getJson('/topics'),
      getJson('/attempts?limit=100'),
      getJson('/subjects'),
    ]);
    return { me, topics: topics.topics || [], attempts: attempts.attempts || [], subjects: subjects.subjects || [] };
  }

  function attemptAnalytics(attempts) {
    const byTopic = new Map();
    const byPrompt = new Map();
    for (const attempt of attempts) {
      const topic = String(attempt.topic || 'Без темы');
      const item = byTopic.get(topic) || { topic, total: 0, wrong: 0, reveals: 0, duration: 0, lastAt: null };
      item.total += 1;
      item.duration += number(attempt.duration_seconds);
      if (!attempt.correct) item.wrong += 1;
      if (parseResult(attempt.result_json).resolutionType === 'revealed') item.reveals += 1;
      if (!item.lastAt) item.lastAt = attempt.created_at;
      byTopic.set(topic, item);

      const prompt = String(attempt.prompt || '').trim();
      if (prompt && !attempt.correct) {
        const repeated = byPrompt.get(prompt) || { count: 0, latest: attempt };
        repeated.count += 1;
        if (new Date(attempt.created_at) > new Date(repeated.latest.created_at)) repeated.latest = attempt;
        byPrompt.set(prompt, repeated);
      }
    }
    for (const item of byTopic.values()) {
      item.accuracy = item.total ? Math.round((item.total - item.wrong) / item.total * 100) : 0;
      item.avgDuration = item.total ? Math.round(item.duration / item.total) : 0;
    }
    return { byTopic, byPrompt };
  }

  function buildWeakTopics(data) {
    const { byTopic } = attemptAnalytics(data.attempts);
    const subjectById = new Map(data.subjects.map(subject => [String(subject.id), subject.title]));
    const candidates = data.topics
      .filter(topic => number(topic.question_count) > 0)
      .map(topic => {
        const history = byTopic.get(String(topic.title));
        const mastery = number(topic.mastery);
        const attempts = history?.total || 0;
        const accuracy = history ? history.accuracy : null;
        const risk = attempts
          ? (100 - accuracy) * 0.68 + (100 - mastery) * 0.32 + Math.min(history.wrong, 5) * 2
          : (100 - mastery) * 0.35;
        return {
          id: number(topic.id),
          title: topic.title,
          subject: subjectById.get(String(topic.subject_id)) || 'ЕГЭ',
          mastery,
          attempts,
          accuracy,
          wrong: history?.wrong || 0,
          risk,
          parentId: topic.parent_id,
          kind: topic.kind,
        };
      });

    const withHistory = candidates.filter(item => item.attempts > 0 && (item.mastery < 80 || item.accuracy < 80));
    const source = withHistory.length ? withHistory : candidates.filter(item => item.mastery < 70);
    const seen = new Set();
    return source
      .sort((a, b) => b.risk - a.risk || b.attempts - a.attempts || a.mastery - b.mastery)
      .filter(item => {
        const key = String(item.title).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  }

  function buildMistakes(attempts) {
    const seen = new Set();
    const now = Date.now();
    const mistakes = [];
    for (const attempt of attempts) {
      if (attempt.correct) continue;
      const prompt = String(attempt.prompt || '').trim();
      if (!prompt || seen.has(prompt)) continue;
      seen.add(prompt);
      const result = parseResult(attempt.result_json);
      const dueAt = attempt.next_review_at ? new Date(attempt.next_review_at).getTime() : 0;
      mistakes.push({
        topic: attempt.topic || 'Тема',
        prompt,
        revealed: result.resolutionType === 'revealed',
        due: dueAt > 0 && dueAt <= now,
        dueAt: attempt.next_review_at,
      });
      if (mistakes.length >= 5) break;
    }
    return mistakes;
  }

  function buildInsights(attempts) {
    const recent = attempts.slice(0, 40);
    if (!recent.length) return ['Пройдите первую тренировку — после неё сайт начнёт находить закономерности в ошибках.'];
    const wrong = recent.filter(item => !item.correct);
    if (!wrong.length) return ['В последних заданиях ошибок нет. Следующая цель — удержать точность на более сложных вопросах.'];

    const topicWrong = new Map();
    const promptWrong = new Map();
    let rushed = 0;
    let revealed = 0;
    for (const item of wrong) {
      const topic = item.topic || 'Без темы';
      topicWrong.set(topic, (topicWrong.get(topic) || 0) + 1);
      const prompt = String(item.prompt || '').trim();
      if (prompt) promptWrong.set(prompt, (promptWrong.get(prompt) || 0) + 1);
      if (number(item.duration_seconds) > 0 && number(item.duration_seconds) <= 25) rushed += 1;
      if (parseResult(item.result_json).resolutionType === 'revealed') revealed += 1;
    }

    const insights = [];
    const [topTopic, topWrong = 0] = [...topicWrong.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    if (topTopic && topWrong >= 2) insights.push(`Больше всего потерь сейчас в теме «${topTopic}»: ${topWrong} ошибок среди последних попыток.`);
    if (rushed >= 2 && rushed / wrong.length >= 0.3) insights.push(`${rushed} ошибок сделаны быстрее чем за 25 секунд. Похоже, часть баллов теряется из-за спешки и недочитанного условия.`);
    const repeats = [...promptWrong.values()].filter(count => count >= 2).length;
    if (repeats) insights.push(`${repeats} ${repeats === 1 ? 'задание повторно вызвало' : 'задания повторно вызвали'} ошибку — их стоит закрепить отдельным повторением.`);
    if (revealed >= 2) insights.push(`В ${revealed} заданиях ответ открывался без решения. Эти вопросы уже можно вернуть в тренировку ошибок.`);
    if (!insights.length) insights.push(`Ошибки распределены по разным темам. Сейчас полезнее системно повторить слабые темы, чем заучивать один тип задания.`);
    return insights.slice(0, 3);
  }

  function weakTopicHtml(item, index) {
    const accuracy = item.accuracy == null ? 'нет данных' : `${item.accuracy}%`;
    return `<article class="coach-weak-card">
      <div class="coach-weak-top"><span class="coach-rank">${index + 1}</span><span class="coach-subject">${esc(item.subject)}</span></div>
      <h3>${esc(item.title)}</h3>
      <div class="coach-bars"><div><span>Освоение</span><b>${item.mastery}%</b></div><div class="coach-mini-progress"><i style="width:${Math.max(0, Math.min(100, item.mastery))}%"></i></div></div>
      <div class="coach-weak-meta"><span>Точность: ${accuracy}</span><span>${item.wrong} ошибок</span></div>
      <button class="btn ghost coach-start" data-coach-mode="adaptive" data-coach-topic="${item.id}" data-coach-count="7">Закрепить тему</button>
    </article>`;
  }

  function mistakeHtml(item) {
    const status = item.due ? 'Пора повторить' : item.dueAt ? `Повторить ${formatDate(item.dueAt)}` : 'В повторении';
    return `<div class="coach-mistake">
      <div><b>${esc(item.topic)}</b><p>${esc(item.prompt.length > 150 ? item.prompt.slice(0, 147) + '…' : item.prompt)}</p></div>
      <span class="${item.due ? 'coach-due' : ''}">${item.revealed ? 'Ответ открыт · ' : ''}${esc(status)}</span>
    </div>`;
  }

  function planHtml(weak, mistakes) {
    const dueCount = mistakes.filter(item => item.due).length;
    const first = weak[0];
    const steps = [];
    if (mistakes.length) {
      steps.push({
        num: 1,
        title: dueCount ? `Повторить ошибки, которые уже пора вернуть (${dueCount})` : `Разобрать последние ошибки (${mistakes.length})`,
        text: 'Сайт подберёт вопросы, где последний ответ был неверным.',
        mode: 'mistakes', topic: 0, count: Math.min(8, Math.max(3, dueCount || mistakes.length)), label: 'Повторить ошибки',
      });
    }
    if (first) {
      steps.push({
        num: steps.length + 1,
        title: `Закрепить: ${first.title}`,
        text: first.accuracy == null ? `Освоение темы сейчас ${first.mastery}%.` : `Точность ${first.accuracy}%, освоение ${first.mastery}%.`,
        mode: 'adaptive', topic: first.id, count: 7, label: '7 заданий',
      });
      steps.push({
        num: steps.length + 1,
        title: 'Добавить новые задания',
        text: 'После повторения — несколько вопросов, которых вы ещё не решали.',
        mode: 'new', topic: first.id, count: 5, label: '5 новых',
      });
    } else {
      steps.push({
        num: steps.length + 1,
        title: 'Начать диагностику',
        text: 'Соберём первые данные и определим слабые места.',
        mode: 'adaptive', topic: 0, count: 20, label: '20 вопросов',
      });
    }
    return steps.slice(0, 3).map(step => `<div class="coach-plan-step">
      <span class="coach-step-num">${step.num}</span>
      <div><b>${esc(step.title)}</b><p>${esc(step.text)}</p></div>
      <button class="btn ghost coach-start" data-coach-mode="${step.mode}" data-coach-topic="${step.topic}" data-coach-count="${step.count}">${esc(step.label)}</button>
    </div>`).join('');
  }

  function renderCoach(host, data) {
    const weak = buildWeakTopics(data);
    const mistakes = buildMistakes(data.attempts);
    const insights = buildInsights(data.attempts);
    const totalRecent = data.attempts.slice(0, 40).length;
    const wrongRecent = data.attempts.slice(0, 40).filter(item => !item.correct).length;
    const accuracy = totalRecent ? Math.round((totalRecent - wrongRecent) / totalRecent * 100) : 0;

    host.innerHTML = `<div class="coach-head">
      <div><span class="eyebrow">Персональный тренер</span><h2>Что делать дальше</h2><p>План строится по вашим реальным ответам и обновляется после тренировок.</p></div>
      <button class="btn coach-start" data-coach-mode="adaptive" data-coach-topic="0" data-coach-count="20">Диагностика · 20 вопросов</button>
    </div>

    <div class="coach-grid">
      <section class="card coach-plan"><div class="coach-title"><h3>План на сегодня</h3><span class="pill">≈ 20–30 минут</span></div>${planHtml(weak, mistakes)}</section>
      <section class="card coach-losses"><div class="coach-title"><h3>Почему теряются баллы</h3>${totalRecent ? `<span class="pill">${accuracy}% точность</span>` : ''}</div><div class="coach-insights">${insights.map(text => `<div><span>→</span><p>${esc(text)}</p></div>`).join('')}</div></section>
    </div>

    <div class="coach-title coach-section-title"><h3>Слабые места</h3><span>${weak.length ? 'Сначала закрываем самое дорогое по баллам' : 'Данные появятся после первых ответов'}</span></div>
    <div class="coach-weak-grid">${weak.length ? weak.map(weakTopicHtml).join('') : `<div class="card coach-empty">Пока недостаточно истории. Запустите диагностику — после неё здесь появятся конкретные темы и проценты.</div>`}</div>

    <div class="coach-title coach-section-title"><h3>Лента ошибок</h3>${mistakes.length ? `<button class="btn ghost coach-start" data-coach-mode="mistakes" data-coach-topic="0" data-coach-count="${Math.min(10, mistakes.length)}">Повторить все</button>` : ''}</div>
    <div class="card coach-mistakes">${mistakes.length ? mistakes.map(mistakeHtml).join('') : `<div class="coach-empty">Ошибок для повторения пока нет.</div>`}</div>`;

    bindCoach(host);
  }

  function notify(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  async function startTraining(button) {
    const mode = button.dataset.coachMode || 'adaptive';
    const topicId = number(button.dataset.coachTopic);
    const targetQuestions = Math.max(1, Math.min(100, number(button.dataset.coachCount) || 10));
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Подбираем…';
    try {
      const data = await getJson('/training/sessions', {
        method: 'POST',
        body: JSON.stringify({ mode, topicId, targetQuestions }),
      });
      if (!data.session?.id) throw new Error('Не удалось создать тренировку');
      sessionStorage.trainingSession = data.session.id;
      location.hash = 'training';
    } catch (error) {
      notify(error.message || 'Не удалось начать тренировку');
      button.disabled = false;
      button.textContent = original;
    }
  }

  function bindCoach(host) {
    host.querySelectorAll('.coach-start').forEach(button => {
      button.addEventListener('click', () => startTraining(button));
    });
  }

  function loadingHtml() {
    return `<div class="coach-head"><div><span class="eyebrow">Персональный тренер</span><h2>Анализируем вашу подготовку…</h2><p>Смотрим темы, последние ответы и запланированные повторения.</p></div></div><div class="coach-loading"><i></i><i></i><i></i></div>`;
  }

  async function mount() {
    if (mounting || !isDashboard()) return;
    const main = document.querySelector('.app main');
    if (!main || !main.querySelector('header .eyebrow')?.textContent.includes('учебный центр')) return;
    if (main.querySelector('#' + ROOT_ID)) return;

    const host = document.createElement('section');
    host.id = ROOT_ID;
    host.className = 'learning-coach';
    host.innerHTML = loadingHtml();
    const recentHeading = [...main.querySelectorAll('.section-head h2')].find(node => node.textContent.trim() === 'Последние результаты');
    const anchor = recentHeading?.closest('.section-head');
    if (anchor) main.insertBefore(host, anchor);
    else main.appendChild(host);

    mounting = true;
    try {
      const data = await loadData();
      if (host.isConnected && isDashboard()) renderCoach(host, data);
    } catch (error) {
      if (host.isConnected) host.innerHTML = `<div class="card coach-empty">Персональный анализ временно не загрузился. Обычные тренировки продолжают работать.</div>`;
    } finally {
      mounting = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (isDashboard()) queueMicrotask(mount);
  });
  const app = document.querySelector('#app');
  if (app) observer.observe(app, { childList: true, subtree: true });
  addEventListener('hashchange', () => setTimeout(mount, 0));
  addEventListener('focus', () => {
    mount();
  });
  setTimeout(mount, 0);
})();
