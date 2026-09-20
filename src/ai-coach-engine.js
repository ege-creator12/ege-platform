'use strict';

const planner = require('./ai-study-planner');
const digitalTutor = require('./digital-tutor');

const isCorrect = value => value === true || value === 1 || value === '1' || value === 'true';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value || '{}') : (value || {}); } catch { return {}; } };
const DAY = 86400000;

async function subjectId(db, subjectSlug) {
  const subject = await db.row('SELECT id,title FROM subjects WHERE slug=? AND published=1', subjectSlug);
  if (!subject) throw Object.assign(new Error('Предмет не найден'), { status: 404 });
  return { id: Number(subject.id), title: subject.title };
}

async function loadMemory(db, userId, subjectSlug) {
  const row = await db.row('SELECT memory_json,updated_at FROM ai_coach_memory WHERE user_id=? AND subject_slug=?', userId, subjectSlug);
  const memory = parse(row?.memory_json);
  return {
    notes: Array.isArray(memory.notes) ? memory.notes.slice(-20) : [],
    photoLines: Array.isArray(memory.photoLines) ? memory.photoLines.slice(-20) : [],
    actions: Array.isArray(memory.actions) ? memory.actions.slice(-20) : [],
    preferences: memory.preferences && typeof memory.preferences === 'object' ? memory.preferences : {},
    updatedAt: row?.updated_at || null,
  };
}

async function saveMemory(db, userId, subjectSlug, memory) {
  const clean = {
    notes: Array.isArray(memory.notes) ? memory.notes.slice(-20) : [],
    photoLines: Array.isArray(memory.photoLines) ? memory.photoLines.slice(-20) : [],
    actions: Array.isArray(memory.actions) ? memory.actions.slice(-20) : [],
    preferences: memory.preferences && typeof memory.preferences === 'object' ? memory.preferences : {},
  };
  await db.run(`INSERT INTO ai_coach_memory(user_id,subject_slug,memory_json) VALUES(?,?,?)
    ON CONFLICT(user_id,subject_slug) DO UPDATE SET memory_json=excluded.memory_json,updated_at=CURRENT_TIMESTAMP`, userId, subjectSlug, JSON.stringify(clean));
  return clean;
}

async function remember(db, userId, subjectSlug, event) {
  const memory = await loadMemory(db, userId, subjectSlug);
  const now = new Date().toISOString();
  if (event?.type === 'photo_line' && Number(event.line) > 0) memory.photoLines.push({ line: Number(event.line), title: String(event.title || ''), at: now });
  else if (event?.type === 'preference') memory.preferences[String(event.key || '')] = event.value;
  else if (event?.type === 'note') memory.notes.push({ text: String(event.text || '').slice(0, 500), at: now });
  else memory.actions.push({ type: String(event?.type || 'action'), detail: event?.detail || null, at: now });
  return saveMemory(db, userId, subjectSlug, memory);
}

function statsForWindow(attempts, from, to) {
  const list = attempts.filter(item => {
    const time = Date.parse(item.created_at || '');
    return Number.isFinite(time) && time >= from && time < to;
  });
  const correct = list.filter(item => isCorrect(item.correct)).length;
  const wrong = list.length - correct;
  const minutes = Math.round(list.reduce((sum, item) => sum + Math.max(0, Number(item.duration_seconds) || 0), 0) / 60);
  const rushedWrong = list.filter(item => !isCorrect(item.correct) && Number(item.duration_seconds) > 0 && Number(item.duration_seconds) <= 25).length;
  return { solved: list.length, correct, wrong, accuracy: list.length ? Math.round(correct / list.length * 100) : 0, minutes, rushedWrong };
}

function repeatedMistakes(attempts) {
  const map = new Map();
  for (const item of attempts.slice(0, 180)) {
    if (isCorrect(item.correct)) continue;
    const key = String(item.prompt || '').replace(/\s+/g, ' ').trim();
    if (!key) continue;
    const state = map.get(key) || { count: 0, prompt: key, line: Number(item.exam_line || 0), topic: item.topic || '' };
    state.count += 1;
    map.set(key, state);
  }
  return [...map.values()].filter(item => item.count >= 2).sort((a, b) => b.count - a.count).slice(0, 5);
}

async function buildProfile(db, userId, subjectSlug, plan = null) {
  const subject = await subjectId(db, subjectSlug);
  const attempts = await db.rows(`SELECT a.id,a.correct,a.duration_seconds,a.created_at,a.next_review_at,a.result_json,q.exam_line,q.prompt,t.title topic
    FROM attempts a JOIN questions q ON q.id=a.question_id LEFT JOIN topics t ON t.id=q.topic_id
    WHERE a.user_id=? AND q.subject_id=? ORDER BY a.id DESC LIMIT 1200`, userId, subject.id);
  const analytics = await planner.collectAnalytics(db, userId, subjectSlug);
  const now = Date.now(), current = statsForWindow(attempts, now - 7 * DAY, now + DAY), previous = statsForWindow(attempts, now - 14 * DAY, now - 7 * DAY);
  const repeated = repeatedMistakes(attempts);
  const memory = await loadMemory(db, userId, subjectSlug);
  const weak = analytics.weakLines.slice(0, 6).map(item => ({ line: item.line, title: item.title, accuracy: item.accuracy, mastery: item.mastery, total: item.total, reason: item.reason, maxScore: item.maxScore }));
  const patterns = [];
  if (repeated.length) patterns.push(`${repeated.length} повторяющихся ошибок: одно и то же место уже ошибочно решалось несколько раз.`);
  if (current.wrong >= 3 && current.rushedWrong / Math.max(1, current.wrong) >= .3) patterns.push(`${current.rushedWrong} из ${current.wrong} ошибок за 7 дней сделаны быстрее чем за 25 секунд — есть риск спешки.`);
  if (weak[0]?.accuracy != null && weak[0].accuracy < 60) patterns.push(`Главная зона риска — линия ${weak[0].line} «${weak[0].title}», точность ${weak[0].accuracy}%.`);
  if (analytics.dueReviewCount > 0) patterns.push(`${analytics.dueReviewCount} заданий уже пора вернуть в повторение.`);
  if (!patterns.length) patterns.push('Явного повторяющегося провала пока нет — полезнее расширять покрытие программы и удерживать точность.');
  return {
    subjectSlug,
    subjectTitle: subject.title,
    attempts: analytics.attempts,
    overallAccuracy: analytics.accuracy,
    readiness: analytics.readiness,
    coverage: analytics.coverage,
    scoreRange: analytics.scoreRange,
    confidence: analytics.confidence,
    dueReviewCount: analytics.dueReviewCount,
    weak,
    repeated,
    patterns: patterns.slice(0, 4),
    current7: current,
    previous7: previous,
    delta7: { solved: current.solved - previous.solved, accuracy: current.accuracy - previous.accuracy, minutes: current.minutes - previous.minutes },
    plan: plan ? { targetScore: plan.targetScore, daysPerWeek: plan.daysPerWeek, minutesPerDay: plan.minutesPerDay, examDate: plan.examDate } : null,
    memory,
  };
}

function reportFromProfile(profile) {
  const c = profile.current7, d = profile.delta7;
  const headline = !c.solved ? 'За последние 7 дней пока нет решённых заданий.' : `За 7 дней решено ${c.solved} заданий с точностью ${c.accuracy}%.`;
  const insights = [...profile.patterns];
  if (d.accuracy >= 5) insights.unshift(`Точность выросла на ${d.accuracy} п.п. относительно предыдущей недели.`);
  else if (d.accuracy <= -5) insights.unshift(`Точность снизилась на ${Math.abs(d.accuracy)} п.п. — план стоит сделать чуть более повторительным.`);
  if (d.solved > 0) insights.push(`Объём вырос на ${d.solved} заданий.`);
  return { headline, metrics: { solved: c.solved, accuracy: c.accuracy, minutes: c.minutes, deltaSolved: d.solved, deltaAccuracy: d.accuracy, deltaMinutes: d.minutes }, insights: insights.slice(0, 4), weak: profile.weak.slice(0, 3) };
}

function briefingFrom(profile, tutor, plan) {
  if (!plan) return { title: 'Сначала настроим план', text: 'Укажи цель, дату ЕГЭ и реальную нагрузку — после этого куратор сможет управлять подготовкой.' };
  if (!profile.current7.solved && plan.diagnosticRecommended) return { title: 'Начни с диагностики', text: `Покрытие сейчас ${plan.coverage || 0}%. Диагностика даст данные, чтобы перестать гадать и нормально расставить приоритеты.`, action: { type: 'diagnostic', label: 'Начать диагностику' } };
  const next = tutor?.nextStep;
  const weak = profile.weak[0];
  let text = tutor?.reason || 'План уже пересчитан по твоим последним ответам.';
  if (weak && weak.accuracy != null) text += ` Главный риск сейчас — линия ${weak.line}, точность ${weak.accuracy}%.`;
  if (profile.dueReviewCount) text += ` К повторению готовы ${profile.dueReviewCount} заданий.`;
  const action = next ? { type: 'today_next', label: next.key === 'theory' ? 'Открыть теорию' : next.key === 'review' ? 'Повторить ошибки' : 'Начать задания' } : null;
  return { title: tutor?.completed ? 'План на сегодня закрыт' : `Сегодня: ${tutor?.title || 'занятие по плану'}`, text, action };
}

function extractLoad(message, plan) {
  const q = String(message || '').toLowerCase();
  if (!/(нагруз|занима|минут|дн|день|дней)/.test(q)) return null;
  const minuteMatch = q.match(/(?:по|на|до|примерно|около)?\s*(\d{2,3})\s*мин/);
  const dayMatch = q.match(/(\d)\s*(?:дн|день|дня|дней)/);
  const minutesPerDay = minuteMatch ? clamp(Number(minuteMatch[1]), 20, 300) : Number(plan?.minutesPerDay || 60);
  const daysPerWeek = dayMatch ? clamp(Number(dayMatch[1]), 1, 7) : Number(plan?.daysPerWeek || 5);
  if (!minuteMatch && !dayMatch) return null;
  return { minutesPerDay, daysPerWeek };
}

function requestedExamLine(message) {
  const q = String(message || '').toLowerCase().replace(/ё/g, 'е');
  let match = q.match(/(?:лини(?:я|и|ю|е)?|задани(?:е|я|й))\s*№?\s*(\d{1,2})/);
  if (!match) match = q.match(/(\d{1,2})\s*(?:-?(?:я|й)\s*)?лини(?:я|и|ю|е)?/);
  const line = Number(match?.[1] || 0);
  return Number.isInteger(line) && line > 0 ? line : 0;
}

function actionSuggestions(message, plan, tutor, profile, subjectSlug = '') {
  const q = String(message || '').toLowerCase();
  const actions = [];
  const load = extractLoad(q, plan);
  if (load && (load.minutesPerDay !== Number(plan.minutesPerDay) || load.daysPerWeek !== Number(plan.daysPerWeek))) actions.push({ type: 'adjust_load', label: `Применить ${load.daysPerWeek} дн. × ${load.minutesPerDay} мин`, payload: load });
  if (/диагност|провер.*уров|с чего начать/.test(q)) actions.push({ type: 'diagnostic', label: 'Начать адаптивную диагностику' });
  if (/ошиб|повтор|закреп/.test(q) && profile.dueReviewCount) actions.push({ type: 'review', label: `Повторить ${Math.min(12, profile.dueReviewCount)} заданий` });

  const line = requestedExamLine(q);
  const maxLine = subjectSlug === 'chemistry' ? 34 : 28;
  if (line && line <= maxLine) {
    const countMatch = q.match(/\b(\d{1,2})\s*(?:задан|вопрос|тест)/);
    const count = clamp(Number(countMatch?.[1] || 8), 1, 30);
    actions.push({ type: 'start_line', label: `Тренировать линию ${line} · ${count} заданий`, payload: { line, count } });
  } else if (!line && /тренир|задани|практик|проверь меня/.test(q)) {
    actions.push({ type: 'personal_practice', label: 'Собрать персональную тренировку' });
  }

  if (/сегодня|что делать/.test(q) && tutor?.nextStep) actions.push({ type: 'today_next', label: tutor.nextStep.key === 'theory' ? 'Открыть теорию' : tutor.nextStep.key === 'review' ? 'Повторить ошибки' : 'Начать следующий шаг' });
  return actions.slice(0, 3);
}

async function adaptiveDiagnosticIds(db, userId, subjectSlug, count = 24) {
  const profile = await buildProfile(db, userId, subjectSlug);
  const subject = await subjectId(db, subjectSlug);
  const wanted = clamp(Number(count) || 24, 12, 40);
  const analytics = await planner.collectAnalytics(db, userId, subjectSlug);
  const ordered = analytics.lines.slice().sort((a, b) => {
    const aUntested = a.total ? 0 : 1, bUntested = b.total ? 0 : 1;
    if (aUntested !== bUntested) return bUntested - aUntested;
    return b.priorityScore - a.priorityScore || b.maxScore - a.maxScore;
  });
  const lines = ordered.map(item => Number(item.line)).filter(Boolean);
  for (const remembered of profile.memory.photoLines.slice().reverse()) if (remembered.line && !lines.includes(Number(remembered.line))) lines.unshift(Number(remembered.line));
  const ids = [];
  for (const line of lines) {
    if (ids.length >= wanted) break;
    const question = await db.row(`SELECT q.id FROM questions q LEFT JOIN attempts a ON a.question_id=q.id AND a.user_id=? WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 ORDER BY CASE WHEN a.id IS NULL THEN 0 ELSE 1 END,RANDOM() LIMIT 1`, userId, subject.id, line);
    if (question?.id && !ids.includes(Number(question.id))) ids.push(Number(question.id));
  }
  if (ids.length < wanted) {
    const extra = await db.rows(`SELECT q.id FROM questions q LEFT JOIN attempts a ON a.question_id=q.id AND a.user_id=? WHERE q.subject_id=? AND q.active=1 AND q.published=1 ORDER BY CASE WHEN a.id IS NULL THEN 0 ELSE 1 END,RANDOM() LIMIT ?`, userId, subject.id, wanted * 4);
    for (const item of extra) { if (!ids.includes(Number(item.id))) ids.push(Number(item.id)); if (ids.length >= wanted) break; }
  }
  return ids.slice(0, wanted);
}

async function personalPracticeIds(db, userId, subjectSlug, count = 10) {
  const subject = await subjectId(db, subjectSlug);
  const profile = await buildProfile(db, userId, subjectSlug);
  const wanted = clamp(Number(count) || 10, 4, 30);
  const priorityLines = [...new Set([
    ...profile.repeated.map(item => item.line),
    ...profile.weak.map(item => item.line),
    ...profile.memory.photoLines.slice().reverse().map(item => Number(item.line)),
  ].filter(Boolean))];
  const ids = [];
  for (const line of priorityLines) {
    if (ids.length >= wanted) break;
    const rows = await db.rows(`SELECT q.id FROM questions q LEFT JOIN attempts a ON a.question_id=q.id AND a.user_id=? WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 ORDER BY CASE WHEN a.correct=0 THEN 0 WHEN a.id IS NULL THEN 1 ELSE 2 END,RANDOM() LIMIT 4`, userId, subject.id, line);
    for (const item of rows) { if (!ids.includes(Number(item.id))) ids.push(Number(item.id)); if (ids.length >= wanted) break; }
  }
  if (ids.length < wanted) {
    const rows = await db.rows(`SELECT q.id FROM questions q LEFT JOIN attempts a ON a.question_id=q.id AND a.user_id=? WHERE q.subject_id=? AND q.active=1 AND q.published=1 ORDER BY CASE WHEN a.id IS NULL THEN 0 ELSE 1 END,RANDOM() LIMIT ?`, userId, subject.id, wanted * 3);
    for (const item of rows) { if (!ids.includes(Number(item.id))) ids.push(Number(item.id)); if (ids.length >= wanted) break; }
  }
  return ids.slice(0, wanted);
}

async function linePracticeIds(db, userId, subjectSlug, line, count = 8) {
  const subject = await subjectId(db, subjectSlug);
  const wanted = clamp(Number(count) || 8, 1, 30), examLine = Number(line);
  const rows = await db.rows(`SELECT q.id FROM questions q LEFT JOIN attempts a ON a.question_id=q.id AND a.user_id=? WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 ORDER BY CASE WHEN a.correct=0 THEN 0 WHEN a.id IS NULL THEN 1 ELSE 2 END,RANDOM() LIMIT ?`, userId, subject.id, examLine, wanted * 3);
  return [...new Set(rows.map(item => Number(item.id)).filter(Boolean))].slice(0, wanted);
}

async function fullContext(db, userId, subjectSlug, plan) {
  const [profile, tutor] = await Promise.all([buildProfile(db, userId, subjectSlug, plan), digitalTutor.buildTutorDay(db, userId, subjectSlug, plan)]);
  return { profile, tutor, report: reportFromProfile(profile), briefing: briefingFrom(profile, tutor, plan) };
}

module.exports = {
  loadMemory,
  remember,
  buildProfile,
  reportFromProfile,
  briefingFrom,
  actionSuggestions,
  adaptiveDiagnosticIds,
  personalPracticeIds,
  linePracticeIds,
  fullContext,
};
