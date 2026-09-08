'use strict';

const biologyRegistry = require('../content/biology/exam-lines.json');
const chemistryRegistry = require('../content/chemistry/exam-lines');

const PLAN_VERSION = 2;
const DAY_MS = 86400000;
const registries = { biology: biologyRegistry, chemistry: chemistryRegistry };
const titles = { biology: 'Биология', chemistry: 'Химия' };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const asBool = value => value === true || value === 1 || value === '1' || value === 'true';
const rounded = (value, digits = 0) => Number(Number(value || 0).toFixed(digits));

function registryFor(subjectSlug) {
  const registry = registries[subjectSlug];
  if (!registry) throw Object.assign(new Error('Выберите биологию или химию'), { status: 400 });
  return registry;
}

function settingsFrom(body = {}) {
  const subjectSlug = String(body.subjectSlug || '').trim();
  registryFor(subjectSlug);
  const targetScore = clamp(Math.round(Number(body.targetScore) || 0), 40, 100);
  const daysPerWeek = clamp(Math.round(Number(body.daysPerWeek) || 0), 1, 7);
  const minutesPerDay = clamp(Math.round(Number(body.minutesPerDay) || 0), 20, 300);
  const examDate = String(body.examDate || '').trim();
  const examTime = Date.parse(`${examDate}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || !Number.isFinite(examTime) || examTime <= Date.now()) {
    throw Object.assign(new Error('Укажите будущую дату экзамена'), { status: 400 });
  }
  return { subjectSlug, targetScore, daysPerWeek, minutesPerDay, examDate };
}

function ageDays(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value || '');
  if (!Number.isFinite(time)) return 365;
  return Math.max(0, (Date.now() - time) / DAY_MS);
}

function recencyWeight(createdAt) {
  return Math.pow(0.5, ageDays(createdAt) / 75);
}

function lineReason(item) {
  if (!item.total) return `Линия ещё не проверена · до ${item.maxScore} перв. ${item.maxScore === 1 ? 'балла' : 'баллов'}`;
  if (item.weightedAccuracy < 55) return `Низкая точность ${item.accuracy}% · высокий риск потери баллов`;
  if (item.stalenessDays >= 45) return `Давно не повторялась · ${Math.round(item.stalenessDays)} дн. без практики`;
  if (item.sampleConfidence < 0.55) return `Мало данных · всего ${item.total} ${item.total === 1 ? 'ответ' : 'ответов'}`;
  if (item.weightedAccuracy < 80) return `Точность ${item.accuracy}% · нужно закрепление`;
  return `Нужно удержать результат · точность ${item.accuracy}%`;
}

async function collectAnalytics(db, userId, subjectSlug) {
  const registry = registryFor(subjectSlug);
  const subject = await db.row('SELECT id,title FROM subjects WHERE slug=? AND published=1', subjectSlug);
  if (!subject) throw Object.assign(new Error('Предмет не найден'), { status: 404 });

  const attempts = await db.rows(`SELECT a.id,a.correct,a.duration_seconds,a.created_at,a.next_review_at,a.review_stage,q.exam_line
    FROM attempts a JOIN questions q ON q.id=a.question_id
    WHERE a.user_id=? AND q.subject_id=? ORDER BY a.id DESC LIMIT 1200`, userId, subject.id);

  const dueRow = await db.row(`WITH latest AS (
      SELECT a.*,ROW_NUMBER() OVER(PARTITION BY a.question_id ORDER BY a.id DESC) rn
      FROM attempts a WHERE a.user_id=?
    )
    SELECT COUNT(*) due_count FROM latest l JOIN questions q ON q.id=l.question_id
    WHERE l.rn=1 AND q.subject_id=? AND q.active=1 AND q.published=1
      AND (l.correct=0 OR l.next_review_at<=CURRENT_TIMESTAMP)`, userId, subject.id);

  const lines = new Map(registry.lines.map(info => {
    const line = Number(info.line);
    return [line, { line, title: String(info.title || `Линия ${line}`), maxScore: Math.max(1, Number(info.maxScore) || 1), total: 0, correct: 0, duration: 0, weightedTotal: 0, weightedCorrect: 0, accuracy: null, weightedAccuracy: null, sampleConfidence: 0, mastery: 0, latestAt: null, stalenessDays: 365, priorityScore: 0, status: 'untouched' }];
  }));

  let totalCorrect = 0;
  let totalDuration = 0;
  for (const attempt of attempts) {
    const line = Number(attempt.exam_line || 0), ok = asBool(attempt.correct);
    if (ok) totalCorrect += 1;
    totalDuration += Math.max(0, Number(attempt.duration_seconds) || 0);
    const item = lines.get(line);
    if (!item) continue;
    const weight = recencyWeight(attempt.created_at);
    item.total += 1; item.correct += ok ? 1 : 0; item.duration += Math.max(0, Number(attempt.duration_seconds) || 0);
    item.weightedTotal += weight; item.weightedCorrect += ok ? weight : 0;
    if (!item.latestAt || new Date(attempt.created_at) > new Date(item.latestAt)) item.latestAt = attempt.created_at;
  }

  let attemptedPrimary = 0, weightedObserved = 0, readinessPrimary = 0, confidencePrimary = 0, recencyPrimary = 0;
  const totalPrimary = [...lines.values()].reduce((sum, item) => sum + item.maxScore, 0) || 1;
  for (const item of lines.values()) {
    if (item.total) {
      item.accuracy = Math.round(item.correct / item.total * 100);
      const priorWeight = 1.5, priorAccuracy = 0.55;
      const posterior = (item.weightedCorrect + priorWeight * priorAccuracy) / (item.weightedTotal + priorWeight);
      item.weightedAccuracy = clamp(Math.round(posterior * 100), 0, 100);
      item.sampleConfidence = clamp(item.weightedTotal / 5, 0, 1);
      item.stalenessDays = ageDays(item.latestAt);
      const freshness = clamp(1 - item.stalenessDays / 120, 0, 1);
      const masteryFactor = 0.72 + 0.28 * item.sampleConfidence;
      item.mastery = clamp(Math.round(item.weightedAccuracy * masteryFactor * (0.92 + 0.08 * freshness)), 0, 100);
      attemptedPrimary += item.maxScore;
      weightedObserved += item.maxScore * item.weightedAccuracy / 100;
      readinessPrimary += item.maxScore * item.mastery / 100;
      confidencePrimary += item.maxScore * item.sampleConfidence;
      recencyPrimary += item.maxScore * freshness;
      if (item.weightedAccuracy < 55) item.status = 'weak';
      else if (item.sampleConfidence < 0.7 || item.weightedAccuracy < 80) item.status = 'learning';
      else if (item.stalenessDays >= 45) item.status = 'stale';
      else item.status = 'mastered';
    }
    const weakness = item.total ? (100 - item.weightedAccuracy) / 100 : 0.68;
    const uncertainty = 1 - item.sampleConfidence;
    const stale = item.total ? clamp(item.stalenessDays / 75, 0, 1) : 0.35;
    const errorBoost = item.total && item.weightedAccuracy < 60 ? 1 : 0;
    item.priorityScore = rounded(item.maxScore * 100 * (0.55 * weakness + 0.25 * uncertainty + 0.12 * stale + 0.08 * errorBoost), 2);
    item.reason = lineReason(item);
    item.averageSeconds = item.total ? Math.round(item.duration / item.total) : 0;
  }

  const attemptedLines = [...lines.values()].filter(item => item.total > 0).length;
  const coverage = Math.round(attemptedPrimary / totalPrimary * 100);
  const observedPerformance = attemptedPrimary ? Math.round(weightedObserved / attemptedPrimary * 100) : null;
  const readiness = Math.round(readinessPrimary / totalPrimary * 100);
  const sampleConfidence = attemptedPrimary ? confidencePrimary / attemptedPrimary : 0;
  const recencyConfidence = attemptedPrimary ? recencyPrimary / attemptedPrimary : 0;
  const confidenceScore = clamp(Math.round(coverage * 0.55 + sampleConfidence * 100 * 0.35 + recencyConfidence * 100 * 0.10), 0, 100);
  const enoughForForecast = attempts.length >= 18 && coverage >= 35;
  const scoreEstimate = enoughForForecast ? clamp(Math.round(observedPerformance * (0.75 + 0.25 * coverage / 100)), 0, 100) : null;
  const margin = scoreEstimate == null ? null : clamp(Math.round(18 - confidenceScore * 0.13), 6, 18);
  const scoreRange = scoreEstimate == null ? null : { low: clamp(scoreEstimate - margin, 0, 100), high: clamp(scoreEstimate + margin, 0, 100) };
  const confidence = confidenceScore >= 72 ? 'высокая' : confidenceScore >= 45 ? 'средняя' : 'низкая';
  const accuracy = attempts.length ? Math.round(totalCorrect / attempts.length * 100) : null;
  const priorityLines = [...lines.values()].sort((a, b) => b.priorityScore - a.priorityScore || b.maxScore - a.maxScore || a.line - b.line);

  return { subjectId: Number(subject.id), subjectSlug, subjectTitle: titles[subjectSlug] || subject.title, attempts: attempts.length, accuracy, observedPerformance, readiness, scoreEstimate, scoreRange, coverage, attemptedLines, totalLines: lines.size, totalPrimary, confidence, confidenceScore, averageSeconds: attempts.length ? Math.round(totalDuration / attempts.length) : 0, dueReviewCount: Number(dueRow?.due_count || 0), lines: [...lines.values()], weakLines: priorityLines.slice(0, 10) };
}

function deterministicPriorities(analytics, limit = 8) {
  return analytics.lines.slice().sort((a, b) => b.priorityScore - a.priorityScore || b.maxScore - a.maxScore || a.line - b.line).slice(0, limit).map(item => item.line);
}

const plannerSchema = { type: 'object', properties: { priorityLines: { type: 'array', items: { type: 'integer' }, maxItems: 6 }, coachNote: { type: 'string' }, studyStyle: { type: 'string', enum: ['diagnostic', 'repair', 'consolidation', 'exam-mode'] } }, required: ['priorityLines', 'coachNote', 'studyStyle'] };
function plannerModels() { return [...new Set([process.env.GEMINI_PLANNER_MODEL, 'gemini-3.8-flash', process.env.GEMINI_MODEL, 'gemini-3.7-flash', 'gemini-3.6-flash', process.env.GEMINI_FALLBACK_MODEL].filter(Boolean))]; }
function geminiText(data) { return (data?.candidates || []).flatMap(candidate => candidate?.content?.parts || []).map(part => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim(); }
function parsePlannerJson(text) { const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim(); const parsed = JSON.parse(clean); return parsed && typeof parsed === 'object' ? parsed : null; }

async function requestPlannerModel(model, prompt, structured = true) {
  const generationConfig = { maxOutputTokens: 900 };
  if (structured) generationConfig.responseFormat = { text: { mimeType: 'application/json', schema: plannerSchema } };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }), signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data?.error?.message || `Gemini ${response.status}`)), { status: response.status, retryable: response.status === 400 || response.status === 403 || response.status === 429 || response.status >= 500 });
  const text = geminiText(data);
  if (!text) throw Object.assign(new Error('Gemini вернул пустой ответ'), { retryable: true });
  return parsePlannerJson(text);
}

async function askAiPriorities(analytics, settings) {
  if (!process.env.GEMINI_API_KEY) return null;
  const candidates = analytics.lines.slice().sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 12).map(item => ({ line: item.line, title: item.title, maxScore: item.maxScore, attempts: item.total, accuracy: item.accuracy, weightedAccuracy: item.weightedAccuracy, mastery: item.mastery, status: item.status, stalenessDays: Math.round(item.stalenessDays), priorityScore: item.priorityScore, reason: item.reason }));
  const allowed = new Set(candidates.map(item => item.line));
  const prompt = `Ты — персональный куратор подготовки к ЕГЭ по ${analytics.subjectTitle.toLowerCase()} на платформе ОСНОВА.\nТвоя задача — не считать баллы заново, а уточнить стратегию поверх уже рассчитанной статистики.\nЦель ученика: ${settings.targetScore}+. Экзамен: ${settings.examDate}. Режим: ${settings.daysPerWeek} дней в неделю по ${settings.minutesPerDay} минут.\nМодельный ориентир: ${analytics.scoreEstimate == null ? 'недостаточно данных' : `${analytics.scoreEstimate}, диапазон ${analytics.scoreRange.low}-${analytics.scoreRange.high}`}.\nПокрытие: ${analytics.coverage}%. Готовность: ${analytics.readiness}%. Уверенность: ${analytics.confidence} (${analytics.confidenceScore}/100). Повторов к сроку: ${analytics.dueReviewCount}.\nКандидаты приоритетов уже рассчитаны системой: ${JSON.stringify(candidates)}\nВыбери максимум 6 priorityLines ТОЛЬКО из кандидатов. Не придумывай новые номера и не обещай конкретный официальный балл.\ncoachNote: 2-4 коротких конкретных предложения по-русски: что делать первым, почему и как распределить усилия. Без воды и мотивационных клише.\nstudyStyle: diagnostic, если данных мало; repair, если много слабых линий; consolidation, если база средняя и надо закреплять; exam-mode, если покрытие и готовность уже высокие.`;
  for (const model of plannerModels()) {
    for (const structured of [true, false]) {
      try {
        const parsed = await requestPlannerModel(model, prompt, structured);
        const priorityLines = [...new Set((parsed?.priorityLines || []).map(Number).filter(line => allowed.has(line)))].slice(0, 6);
        const coachNote = String(parsed?.coachNote || '').trim().slice(0, 1200);
        const studyStyle = ['diagnostic', 'repair', 'consolidation', 'exam-mode'].includes(parsed?.studyStyle) ? parsed.studyStyle : null;
        if (priorityLines.length || coachNote) return { priorityLines, coachNote, studyStyle, model };
      } catch (error) {
        console.warn('ai-study-planner-gemini', { model, structured, status: error?.status || 0, message: error?.message || String(error) });
        if (!error?.retryable) return null;
        if (structured === false) break;
      }
    }
  }
  return null;
}

function dayLabel(date) { return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }); }
function distributeDays(daysPerWeek) { const result = []; for (let i = 0; i < daysPerWeek; i += 1) result.push(Math.min(6, Math.floor(i * 7 / daysPerWeek))); return [...new Set(result)]; }
function sessionSplit(item, minutesPerDay) {
  let theoryShare = 0.22, practiceShare = 0.58;
  if (!item?.total) theoryShare = 0.32; else if (item.weightedAccuracy < 55) theoryShare = 0.30; else if (item.status === 'stale') theoryShare = 0.12; else if (item.status === 'mastered') theoryShare = 0.10;
  const theoryMinutes = Math.max(5, Math.round(minutesPerDay * theoryShare));
  const practiceMinutes = Math.max(10, Math.round(minutesPerDay * practiceShare));
  const reviewMinutes = Math.max(5, minutesPerDay - theoryMinutes - practiceMinutes);
  const seconds = clamp(Number(item?.averageSeconds || 0) || 180, 90, 360);
  const questions = clamp(Math.round(practiceMinutes * 60 / seconds), 4, 20);
  return { theoryMinutes, practiceMinutes, reviewMinutes, questions };
}

function scheduleFor(settings, analytics, priorities) {
  const selected = distributeDays(settings.daysPerWeek);
  const priorityItems = priorities.map(line => analytics.lines.find(item => item.line === line)).filter(Boolean);
  const focus = priorityItems.length ? priorityItems : analytics.weakLines;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const schedule = []; let studyIndex = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(today); date.setDate(today.getDate() + offset);
    if (!selected.includes(offset)) { schedule.push({ date: date.toISOString().slice(0, 10), label: dayLabel(date), rest: true, title: analytics.dueReviewCount ? 'Отдых / короткое повторение по сроку' : 'Отдых / восстановление', minutes: 0 }); continue; }
    const item = focus[studyIndex % Math.max(1, focus.length)] || { line: 1, title: 'Базовая диагностика', total: 0 }; studyIndex += 1;
    const split = sessionSplit(item, settings.minutesPerDay);
    const mode = !item.total ? 'diagnostic' : item.weightedAccuracy < 55 ? 'repair' : item.status === 'stale' ? 'review' : 'practice';
    schedule.push({ date: date.toISOString().slice(0, 10), label: dayLabel(date), rest: false, line: item.line, title: `Линия ${item.line}: ${item.title}`, accuracy: item.accuracy, mastery: item.mastery, reason: item.reason, mode, minutes: settings.minutesPerDay, theoryMinutes: split.theoryMinutes, practiceMinutes: split.practiceMinutes, reviewMinutes: split.reviewMinutes, questions: split.questions });
  }
  return schedule;
}

function deriveStudyStyle(analytics) { if (analytics.scoreEstimate == null || analytics.coverage < 45) return 'diagnostic'; const weak = analytics.lines.filter(item => item.total && item.weightedAccuracy < 55).length; if (weak >= 4) return 'repair'; if (analytics.coverage >= 80 && analytics.readiness >= 70) return 'exam-mode'; return 'consolidation'; }
function feasibility(settings, analytics) {
  const exam = new Date(`${settings.examDate}T12:00:00`), daysLeft = Math.max(1, Math.ceil((exam - new Date()) / DAY_MS)), weeks = Math.max(1, daysLeft / 7), weeklyMinutes = settings.daysPerWeek * settings.minutesPerDay, weeklyHours = weeklyMinutes / 60;
  if (analytics.scoreEstimate == null) return { daysLeft, weeks: rounded(weeks, 1), weeklyHours: rounded(weeklyHours, 1), weeklyMinutes, recommendedWeeklyMinutes: null, status: 'Нужна диагностика', gap: null };
  const gap = Math.max(0, settings.targetScore - analytics.scoreEstimate), recommendedWeeklyMinutes = clamp(Math.round(120 + gap * 4 + Math.max(0, 75 - analytics.coverage) * 1.5), 120, 900), ratio = weeklyMinutes / recommendedWeeklyMinutes;
  let status = 'Нужно увеличить нагрузку'; if (gap <= 5) status = 'Очень реалистично'; else if (ratio >= 1.15) status = 'Реалистично с запасом'; else if (ratio >= 0.9) status = 'Реалистично'; else if (ratio >= 0.7) status = 'Напряжённо';
  return { daysLeft, weeks: rounded(weeks, 1), weeklyHours: rounded(weeklyHours, 1), weeklyMinutes, recommendedWeeklyMinutes, status, gap };
}
function deterministicCoachNote(analytics, priorityLines) { if (analytics.scoreEstimate == null) return `Сейчас важнее расширить диагностику: проверено ${analytics.coverage}% программы. Начни с линий ${priorityLines.slice(0, 4).join(', ')}, затем план станет точнее.`; const range = analytics.scoreRange ? `${analytics.scoreRange.low}–${analytics.scoreRange.high}` : String(analytics.scoreEstimate); return `Модельный диапазон сейчас ${range}. Больше всего результата дадут линии ${priorityLines.slice(0, 4).join(', ')}; сначала закрывай высокий риск, затем закрепляй повторением.`; }

async function buildPlan(db, userId, body, options = {}) {
  const settings = settingsFrom(body), analytics = options.analytics || await collectAnalytics(db, userId, settings.subjectSlug), deterministic = deterministicPriorities(analytics, 10), useAi = options.useAi !== false;
  const ai = useAi ? await askAiPriorities(analytics, settings) : null, allowed = new Set(deterministic), aiPriorityLines = ai?.priorityLines?.filter(line => allowed.has(line)) || [], priorityLines = [...new Set([...aiPriorityLines, ...deterministic])].slice(0, 6), previous = options.previousPlan || null;
  const aiPowered = Boolean(ai) || Boolean(previous?.aiPowered && !useAi), aiModel = ai?.model || (aiPowered ? previous?.aiModel || null : null), aiRefreshedAt = ai ? new Date().toISOString() : (aiPowered ? previous?.aiRefreshedAt || previous?.generatedAt || null : null), studyStyle = ai?.studyStyle || deriveStudyStyle(analytics), feasibilityInfo = feasibility(settings, analytics);
  const plan = { version: PLAN_VERSION, generatedAt: new Date().toISOString(), subjectSlug: settings.subjectSlug, subjectTitle: analytics.subjectTitle, targetScore: settings.targetScore, examDate: settings.examDate, daysPerWeek: settings.daysPerWeek, minutesPerDay: settings.minutesPerDay, scoreEstimate: analytics.scoreEstimate, scoreRange: analytics.scoreRange, readiness: analytics.readiness, coverage: analytics.coverage, attemptedLines: analytics.attemptedLines, totalLines: analytics.totalLines, confidenceScore: analytics.confidenceScore, accuracy: analytics.accuracy, attempts: analytics.attempts, confidence: analytics.confidence, dueReviewCount: analytics.dueReviewCount, diagnosticRecommended: analytics.scoreEstimate == null || analytics.coverage < 55, priorityLines, weakLines: analytics.weakLines.slice(0, 6), schedule: scheduleFor(settings, analytics, priorityLines), feasibility: feasibilityInfo, studyStyle, aiPowered, aiModel, aiRefreshedAt, adaptationMode: ai ? 'ai+statistics' : 'statistics', coachNote: ai?.coachNote || deterministicCoachNote(analytics, priorityLines) };
  await db.run(`INSERT INTO ai_study_plans(user_id,subject_slug,target_score,exam_date,days_per_week,minutes_per_day,plan_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,subject_slug) DO UPDATE SET target_score=excluded.target_score,exam_date=excluded.exam_date,days_per_week=excluded.days_per_week,minutes_per_day=excluded.minutes_per_day,plan_json=excluded.plan_json,updated_at=CURRENT_TIMESTAMP`, userId, settings.subjectSlug, settings.targetScore, settings.examDate, settings.daysPerWeek, settings.minutesPerDay, JSON.stringify(plan));
  return plan;
}
async function loadPlan(db, userId, subjectSlug) { registryFor(subjectSlug); const saved = await db.row('SELECT * FROM ai_study_plans WHERE user_id=? AND subject_slug=?', userId, subjectSlug); if (!saved) return null; const plan = parse(saved.plan_json) || {}; return { ...plan, savedAt: saved.updated_at }; }
async function diagnosticQuestionIds(db, userId, subjectSlug, count = 24) {
  const registry = registryFor(subjectSlug), subject = await db.row('SELECT id FROM subjects WHERE slug=? AND published=1', subjectSlug); if (!subject) throw Object.assign(new Error('Предмет не найден'), { status: 404 });
  const lines = registry.lines.map(item => Number(item.line)).filter(Boolean), wanted = clamp(Number(count) || 24, 12, 40), picked = [], selected = [];
  for (let i = 0; i < Math.min(wanted, lines.length); i += 1) selected.push(lines[Math.floor(i * lines.length / Math.min(wanted, lines.length))]);
  for (const line of selected) { const question = await db.row(`SELECT q.id FROM questions q WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 ORDER BY RANDOM() LIMIT 1`, subject.id, line); if (question?.id && !picked.includes(Number(question.id))) picked.push(Number(question.id)); }
  if (picked.length < wanted) { const extras = await db.rows('SELECT q.id FROM questions q WHERE q.subject_id=? AND q.active=1 AND q.published=1 ORDER BY RANDOM() LIMIT ?', subject.id, Math.max(wanted * 3, 60)); for (const question of extras) { if (!picked.includes(Number(question.id))) picked.push(Number(question.id)); if (picked.length >= wanted) break; } }
  return picked.slice(0, wanted);
}

module.exports = { PLAN_VERSION, buildPlan, loadPlan, diagnosticQuestionIds, collectAnalytics, settingsFrom, deterministicPriorities, deriveStudyStyle };
