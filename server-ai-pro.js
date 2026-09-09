'use strict';

const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const database = require('./src/db');
const planner = require('./src/ai-study-planner');
const digitalTutor = require('./src/digital-tutor');
const coachEngine = require('./src/ai-coach-engine');
const { row, rows, run } = database;

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.AI_PRO_UPSTREAM_PORT || (PORT + 1));
const COACH_TOTAL_TIMEOUT_MS = Math.max(8000, Number(process.env.GEMINI_COACH_TIMEOUT_MS) || 18000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY || '';
const COACH_MODELS = [...new Set([
  process.env.GEMINI_PLANNER_MODEL,
  process.env.GEMINI_MODEL,
  process.env.GEMINI_FALLBACK_MODEL,
  'gemini-2.5-flash-lite',
].filter(Boolean))];

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 4 * 1024 * 1024) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row('SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP', token);
}

async function auth(req, res) {
  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return null;
  }
  return user;
}

function validSubject(slug) {
  if (!['biology', 'chemistry'].includes(slug)) throw Object.assign(new Error('Выберите биологию или химию'), { status: 400 });
  return slug;
}

async function subjectId(slug) {
  validSubject(slug);
  const subject = await row('SELECT id FROM subjects WHERE slug=? AND published=1', slug);
  if (!subject) throw Object.assign(new Error('Предмет не найден'), { status: 404 });
  return Number(subject.id);
}

async function saveSession(userId, ids, mode = 'adaptive') {
  const unique = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!unique.length) throw Object.assign(new Error('Не удалось подобрать задания'), { status: 409 });
  const created = await run('INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,?,?,?)', userId, null, mode, unique.length);
  const sessionId = Number(created.lastInsertRowid);
  for (const [position, questionId] of unique.entries()) {
    await run('INSERT INTO training_session_questions(session_id,question_id,position,state) VALUES(?,?,?,?)', sessionId, questionId, position, 'pending');
  }
  return row('SELECT * FROM training_sessions WHERE id=?', sessionId);
}

const isoDay = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};

async function currentPlan(userId, subjectSlug) {
  let plan = await planner.loadPlan(database, userId, subjectSlug);
  if (!plan) return null;
  const examTime = Date.parse(`${plan.examDate}T12:00:00`);
  if (!Number.isFinite(examTime) || examTime <= Date.now()) return { ...plan, expired: true };
  const analytics = await planner.collectAnalytics(database, userId, subjectSlug);
  const needsRefresh = Number(plan.version || 0) < Number(planner.PLAN_VERSION || 2)
    || Number(plan.attempts || 0) !== Number(analytics.attempts || 0)
    || isoDay(plan.generatedAt) !== isoDay();
  if (needsRefresh) {
    plan = await planner.buildPlan(database, userId, {
      subjectSlug,
      targetScore: plan.targetScore,
      examDate: plan.examDate,
      daysPerWeek: plan.daysPerWeek,
      minutesPerDay: plan.minutesPerDay,
    }, { useAi: false, previousPlan: plan, analytics });
  }
  return plan;
}

function geminiText(data) {
  return (data?.candidates || [])
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function modeInstruction(mode) {
  const map = {
    teach: 'Режим «Научи меня»: объясняй маленькими порциями. Дай только один логический кусок темы, короткий пример и в конце ОДИН проверочный вопрос. Не переходи к следующей части, пока ученик не ответит.',
    ege90: 'Режим «90+»: объясняй строго через требования ЕГЭ — алгоритм решения, ловушки, формулировки, что нужно написать для полного балла. Не упрощай до потери экзаменационной точности.',
    quiz: 'Режим «Проверь меня»: задай ОДИН вопрос по самой приоритетной слабой теме. Не давай ответ и подсказку. Дождись следующей реплики.',
    hint: 'Режим «Только подсказка»: не сообщай готовый ответ. Дай минимальную наводку, которая поможет сделать следующий шаг самостоятельно.',
    check: 'Режим «Проверь объяснение»: оцени текст ученика. Сначала что верно, затем конкретные ошибки и чего не хватает, затем короткий улучшенный вариант.',
    coach: 'Обычный режим куратора: принимай решение, что ученику выгоднее делать дальше, и объясняй его коротко и конкретно.',
  };
  return map[mode] || map.coach;
}

function fallbackCoachReply(plan, tutor, message, profile, mode = 'coach') {
  const q = String(message || '').toLowerCase();
  const subject = plan.subjectSlug === 'chemistry' ? 'химии' : 'биологии';
  const week = Array.isArray(plan.schedule) ? plan.schedule : [];
  const studyDays = week.filter(day => !day.rest).slice(0, Math.max(1, Number(plan.daysPerWeek) || 5));
  const weak = profile?.weak || plan.weakLines || [];
  if (mode === 'quiz') {
    const item = weak[0];
    return item ? `Проверим линию ${item.line} «${item.title}». Без подсказки: объясни ключевой принцип этой темы так, как написал бы его в развёрнутом ответе ЕГЭ.` : 'Сначала пройди несколько заданий, чтобы я выбрал вопрос именно по слабому месту.';
  }
  if (mode === 'hint') return weak[0] ? `Подсказка: сначала вспомни базовый признак, который отличает «${weak[0].title}» от похожих случаев. Не ищи готовый ответ — выпиши признак и проверь условие по нему.` : 'Сначала выдели, что именно дано в условии и какой факт из теории связывает данные с ответом.';
  if (/недел|план|расписан/.test(q) && studyDays.length) {
    const lines = studyDays.map(day => {
      const minutes = Number(day.theoryMinutes || 0) + Number(day.practiceMinutes || 0) + Number(day.reviewMinutes || 0);
      const tasks = Number(day.questions || 0) ? `, ${day.questions} заданий` : '';
      return `• ${day.label || 'День'}: ${day.title || 'занятие'} — ${minutes || plan.minutesPerDay} мин${tasks}.`;
    });
    return `Твой план на ближайшие учебные дни по ${subject}:\n${lines.join('\n')}\n\nЯ буду менять следующие дни после новых ответов, а не держать расписание статичным.`;
  }
  if (/завтра|следующ/.test(q)) {
    const next = studyDays[1] || studyDays[0];
    if (next) return `Завтра: ${next.title}. ${next.theoryMinutes || 0} мин теории, ${next.practiceMinutes || 0} мин практики, ${next.reviewMinutes || 0} мин повторения${next.questions ? `, около ${next.questions} заданий` : ''}. Причина: ${next.reason || 'это следующий приоритет по статистике.'}`;
  }
  if (/ошиб|повтор|закреп/.test(q) && weak.length) {
    return `Сейчас повторяй в таком порядке:\n${weak.slice(0, 3).map(item => `• линия ${item.line}: ${item.title}${item.accuracy == null ? '' : ` — точность ${item.accuracy}%`}`).join('\n')}\n\nНе перечитывай всё подряд: теория → 6–10 заданий → возврат ошибок через 1–3 дня.`;
  }
  if (profile?.patterns?.length) return `Я бы сейчас не давал тебе общий совет. По твоим данным видно:\n${profile.patterns.map(x => `• ${x}`).join('\n')}\n\nСледующий шаг: ${tutor?.nextStep?.title || 'персональная тренировка по слабым линиям'}.`;
  return `Я вижу твой план по ${subject}: цель ${plan.targetScore}+, ${plan.daysPerWeek} дн./нед. по ${plan.minutesPerDay} мин. Могу составить неделю по дням, провести мини-урок, устроить проверку или собрать тренировку по твоим ошибкам.`;
}

async function coachReply(userId, subjectSlug, message, history = [], mode = 'coach') {
  const plan = await currentPlan(userId, subjectSlug);
  if (!plan) throw Object.assign(new Error('Сначала заполни анкету и создай план'), { status: 409 });
  const { profile, tutor, report } = await coachEngine.fullContext(database, userId, subjectSlug, plan);
  const q = String(message || '').trim().slice(0, 1500);
  if (!q) throw Object.assign(new Error('Напиши вопрос'), { status: 400 });
  const selectedMode = ['coach', 'teach', 'ege90', 'quiz', 'hint', 'check'].includes(mode) ? mode : 'coach';
  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-10)
    .filter(item => item && (item.role === 'assistant' || item.role === 'user') && String(item.text || '').trim())
    .map(item => `${item.role === 'assistant' ? 'Куратор' : 'Ученик'}: ${String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 700)}`)
    .join('\n');
  const context = {
    plan: {
      targetScore: plan.targetScore, examDate: plan.examDate, daysPerWeek: plan.daysPerWeek, minutesPerDay: plan.minutesPerDay,
      readiness: plan.readiness, coverage: plan.coverage, scoreRange: plan.scoreRange, priorityLines: plan.priorityLines,
      schedule: (plan.schedule || []).slice(0, 7), studyStyle: plan.studyStyle,
    },
    today: tutor,
    profile: {
      overallAccuracy: profile.overallAccuracy, current7: profile.current7, previous7: profile.previous7, delta7: profile.delta7,
      weak: profile.weak, repeatedMistakes: profile.repeated, patterns: profile.patterns, dueReviewCount: profile.dueReviewCount,
      rememberedPhotoLines: profile.memory.photoLines, preferences: profile.memory.preferences,
    },
    weeklyReport: report,
  };
  const prompt = `Ты — персональный AI-репетитор и куратор ОСНОВА для ЕГЭ. Ты не просто отвечаешь в чате: ты управляешь подготовкой на основе реальных данных ученика.\n\n${modeInstruction(selectedMode)}\n\nПравила:\n- используй историю ошибок, слабые линии, темп, повторения и недельную динамику;\n- замечай повторяющиеся паттерны, например спешку или одну и ту же ошибку;\n- если пользователь просит план, дай конкретно по дням с минутами и типом работы;\n- если просит изменить нагрузку, объясни последствия и предложи применимое изменение;\n- если учишь теме, не вываливай простыню — веди диалог шагами;\n- не выдумывай статистику, действия ученика или официальный будущий балл;\n- не повторяй мотивационные клише;\n- отвечай по-русски, живо, конкретно;\n- важные формулы и списки делай читаемыми на телефоне.\n\nРеальные данные: ${JSON.stringify(context)}\n${safeHistory ? `\nПредыдущий диалог:\n${safeHistory}\n` : ''}\nУченик: ${q}`;
  const actions = coachEngine.actionSuggestions(q, plan, tutor, profile);
  const fallback = fallbackCoachReply(plan, tutor, q, profile, selectedMode);
  await coachEngine.remember(database, userId, subjectSlug, { type: 'preference', key: 'lastMode', value: selectedMode }).catch(() => {});
  if (!GEMINI_API_KEY || !COACH_MODELS.length) return { text: fallback, subjectSlug, source: 'plan-fallback', aiAvailable: false, actions };
  const startedAt = Date.now();
  let lastError = null;
  for (const model of COACH_MODELS) {
    const remaining = COACH_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
    if (remaining < 1500) break;
    const attemptTimeout = Math.max(1200, Math.min(8000, remaining));
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1100, temperature: selectedMode === 'quiz' ? 0.2 : 0.35 } }),
        signal: AbortSignal.timeout(attemptTimeout),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || `Gemini ${response.status}`);
      const text = geminiText(data);
      if (text) return { text, subjectSlug, source: 'gemini', aiAvailable: true, model, actions };
      lastError = new Error('Gemini вернул пустой ответ');
    } catch (error) {
      lastError = error;
      console.warn('ai-pro-coach-model', model, error?.message || 'unknown error');
    }
  }
  console.warn('ai-pro-coach-fallback', lastError?.message || 'no response');
  return { text: fallback, subjectSlug, source: 'plan-fallback', aiAvailable: false, actions };
}

async function reviewCandidates(userId, subjectSlug, limit = 100) {
  const sid = await subjectId(subjectSlug);
  return rows(`WITH latest AS (
      SELECT a.*,ROW_NUMBER() OVER(PARTITION BY a.question_id ORDER BY a.id DESC) rn
      FROM attempts a WHERE a.user_id=?
    )
    SELECT q.id,q.exam_line,l.correct,l.next_review_at,l.review_stage,l.created_at
    FROM latest l JOIN questions q ON q.id=l.question_id
    WHERE l.rn=1 AND q.subject_id=? AND q.active=1 AND q.published=1
      AND (l.correct=0 OR l.next_review_at<=CURRENT_TIMESTAMP)
    ORDER BY CASE WHEN l.correct=0 THEN 0 ELSE 1 END,COALESCE(l.review_stage,0),l.next_review_at ASC,l.created_at ASC
    LIMIT ?`, userId, sid, limit);
}

async function executeCoachAction(userId, subjectSlug, action, payload = {}) {
  const plan = await currentPlan(userId, subjectSlug);
  if (!plan) throw Object.assign(new Error('Сначала создай план'), { status: 409 });
  if (action === 'adjust_load') {
    const daysPerWeek = Math.max(1, Math.min(7, Number(payload.daysPerWeek) || Number(plan.daysPerWeek)));
    const minutesPerDay = Math.max(20, Math.min(300, Number(payload.minutesPerDay) || Number(plan.minutesPerDay)));
    const next = await planner.buildPlan(database, userId, { subjectSlug, targetScore: plan.targetScore, examDate: plan.examDate, daysPerWeek, minutesPerDay }, { useAi: false, previousPlan: plan });
    await coachEngine.remember(database, userId, subjectSlug, { type: 'load_change', detail: { daysPerWeek, minutesPerDay } });
    return { ok: true, plan: next, message: `План перестроен: ${daysPerWeek} дн./нед. × ${minutesPerDay} мин.` };
  }
  if (action === 'diagnostic') {
    const ids = await coachEngine.adaptiveDiagnosticIds(database, userId, subjectSlug, Number(payload.count) || 24);
    return { ok: true, session: await saveSession(userId, ids, 'adaptive'), subjectSlug, message: 'Диагностика собрана по непроверенным и слабым линиям.' };
  }
  if (action === 'review') {
    const wanted = Math.max(3, Math.min(30, Number(payload.count) || 12));
    const list = await reviewCandidates(userId, subjectSlug, Math.max(80, wanted * 6));
    const ids = [...new Set(list.map(item => Number(item.id)).filter(Boolean))].slice(0, wanted);
    if (!ids.length) throw Object.assign(new Error('Повторений на сегодня нет'), { status: 404 });
    return { ok: true, session: await saveSession(userId, ids, 'review'), subjectSlug, message: 'Собрал повторение по ошибкам и заданиям, которые пора вернуть.' };
  }
  if (action === 'personal_practice') {
    const ids = await coachEngine.personalPracticeIds(database, userId, subjectSlug, Number(payload.count) || 10);
    return { ok: true, session: await saveSession(userId, ids, 'adaptive'), subjectSlug, message: 'Персональная тренировка собрана по повторным ошибкам, слабым линиям и недавним пробелам.' };
  }
  if (action === 'start_line') {
    const line = Number(payload.line), ids = await coachEngine.linePracticeIds(database, userId, subjectSlug, line, Number(payload.count) || 8);
    if (!ids.length) throw Object.assign(new Error(`Для линии ${line} не удалось подобрать задания`), { status: 404 });
    return { ok: true, session: await saveSession(userId, ids, 'adaptive'), subjectSlug, message: `Тренировка по линии ${line} готова.` };
  }
  if (action === 'today_next') {
    const tutor = await digitalTutor.buildTutorDay(database, userId, subjectSlug, plan), step = tutor?.nextStep;
    if (!step) return { ok: true, message: 'План на сегодня уже выполнен.' };
    if (step.key === 'theory' && step.lessonId) return { ok: true, route: `lesson/${step.lessonId}`, message: 'Открываю нужную теорию.' };
    if (step.key === 'review') return executeCoachAction(userId, subjectSlug, 'review', { count: step.count || 10 });
    if (step.key === 'practice') return executeCoachAction(userId, subjectSlug, 'start_line', { line: step.line || tutor.line, count: step.count || 8 });
  }
  throw Object.assign(new Error('Неизвестное действие куратора'), { status: 400 });
}

function parseJsonText(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(clean); } catch { return null; }
}

async function analyzePhoto(userId, subjectSlug, dataUrl) {
  if (!GEMINI_API_KEY) throw Object.assign(new Error('Анализ фото временно недоступен'), { status: 503 });
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw Object.assign(new Error('Прикрепи JPG, PNG или WebP'), { status: 400 });
  const mime = match[1], imageData = match[2];
  if (imageData.length > 2.8 * 1024 * 1024) throw Object.assign(new Error('Фото слишком большое'), { status: 413 });
  const prompt = `Проанализируй фотографию школьного задания по ${subjectSlug === 'chemistry' ? 'химии' : 'биологии'} ЕГЭ. Верни ТОЛЬКО JSON без markdown: {"line":число_или_null,"title":"краткая тема","answer":"ответ","explanation":"краткий разбор по шагам","confidence":"high|medium|low","whatToStudy":"что повторить"}. Если текст частично неразборчив, не выдумывай — отметь это в explanation. Номер line указывай только если уверен в линии ЕГЭ.`;
  let lastError;
  for (const model of COACH_MODELS) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: imageData } }] }], generationConfig: { maxOutputTokens: 1000, temperature: 0.15 } }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || `Gemini ${response.status}`);
      const parsed = parseJsonText(geminiText(data));
      if (!parsed) throw new Error('Не удалось разобрать ответ модели');
      const line = Number(parsed.line) > 0 ? Number(parsed.line) : null;
      if (line) await coachEngine.remember(database, userId, subjectSlug, { type: 'photo_line', line, title: parsed.title });
      const text = `${parsed.title ? `${parsed.title}\n\n` : ''}${parsed.answer ? `Ответ: ${parsed.answer}\n\n` : ''}${parsed.explanation || 'Разбор готов.'}${parsed.whatToStudy ? `\n\nЧто повторить: ${parsed.whatToStudy}` : ''}`;
      return { text, line, title: parsed.title || '', confidence: parsed.confidence || 'medium', actions: line ? [{ type: 'start_line', label: `Потренировать линию ${line}`, payload: { line, count: 8 } }] : [] };
    } catch (error) { lastError = error; console.warn('ai-pro-photo-model', model, error?.message || 'unknown'); }
  }
  throw Object.assign(new Error(lastError?.message || 'Не удалось разобрать фото'), { status: 503 });
}

async function handleApi(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/ai-pro/')) return false;
  const user = await auth(req, res);
  if (!user) return true;

  if (path === '/api/ai-pro/plan' && req.method === 'GET') {
    const subjectSlug = validSubject(String(url.searchParams.get('subject') || 'biology'));
    json(res, 200, { plan: await currentPlan(user.id, subjectSlug), openBeta: true, paidFeature: true });
    return true;
  }
  if (path === '/api/ai-pro/plan' && req.method === 'POST') {
    const body = await readJson(req), previousPlan = body?.subjectSlug ? await planner.loadPlan(database, user.id, String(body.subjectSlug)) : null;
    json(res, 200, { plan: await planner.buildPlan(database, user.id, body, { useAi: true, previousPlan }), openBeta: true, paidFeature: true });
    return true;
  }
  if (path === '/api/ai-pro/tutor/today' && req.method === 'GET') {
    const subjectSlug = validSubject(String(url.searchParams.get('subject') || 'biology')), plan = await currentPlan(user.id, subjectSlug), tutor = await digitalTutor.buildTutorDay(database, user.id, subjectSlug, plan);
    json(res, 200, { tutor, plan }); return true;
  }
  if (path === '/api/ai-pro/context' && req.method === 'GET') {
    const subjectSlug = validSubject(String(url.searchParams.get('subject') || 'biology')), plan = await currentPlan(user.id, subjectSlug);
    if (!plan) { json(res, 200, { plan: null, briefing: null, report: null }); return true; }
    const context = await coachEngine.fullContext(database, user.id, subjectSlug, plan);
    json(res, 200, { plan, ...context }); return true;
  }
  if (path === '/api/ai-pro/coach' && req.method === 'POST') {
    const body = await readJson(req), subjectSlug = validSubject(String(body.subjectSlug || ''));
    json(res, 200, await coachReply(user.id, subjectSlug, body.message, body.history, body.mode)); return true;
  }
  if (path === '/api/ai-pro/action' && req.method === 'POST') {
    const body = await readJson(req), subjectSlug = validSubject(String(body.subjectSlug || ''));
    json(res, 200, await executeCoachAction(user.id, subjectSlug, String(body.action || ''), body.payload || {})); return true;
  }
  if (path === '/api/ai-pro/photo' && req.method === 'POST') {
    const body = await readJson(req), subjectSlug = validSubject(String(body.subjectSlug || ''));
    json(res, 200, await analyzePhoto(user.id, subjectSlug, body.dataUrl)); return true;
  }
  if (path === '/api/ai-pro/diagnostic' && req.method === 'POST') {
    const body = await readJson(req), subjectSlug = validSubject(String(body.subjectSlug || '')),
      ids = await coachEngine.adaptiveDiagnosticIds(database, user.id, subjectSlug, Number(body.count) || 24);
    if (ids.length < 10) throw Object.assign(new Error('Недостаточно заданий для диагностики'), { status: 409 });
    json(res, 201, { session: await saveSession(user.id, ids, 'adaptive'), questionCount: ids.length, subjectSlug }); return true;
  }
  if (path === '/api/ai-pro/review-status' && req.method === 'GET') {
    const subjectSlug = validSubject(String(url.searchParams.get('subject') || 'biology')), list = await reviewCandidates(user.id, subjectSlug, 250), wrong = list.filter(item => ![true,1,'1','true'].includes(item.correct)).length;
    json(res, 200, { subjectSlug, dueCount: list.length, wrongCount: wrong, ready: list.length > 0, recommendedCount: Math.min(12, list.length) }); return true;
  }
  if (path === '/api/ai-pro/smart-review' && req.method === 'POST') {
    const body = await readJson(req), subjectSlug = validSubject(String(body.subjectSlug || 'biology')), wanted = Math.max(3, Math.min(30, Number(body.count) || 12)), candidates = await reviewCandidates(user.id, subjectSlug, Math.max(80, wanted * 6)), ids = [...new Set(candidates.map(item => Number(item.id)).filter(Boolean))].slice(0, wanted);
    if (!ids.length) throw Object.assign(new Error('Повторений на сегодня нет'), { status: 404 });
    json(res, 201, { session: await saveSession(user.id, ids, 'review'), questionCount: ids.length, subjectSlug }); return true;
  }
  json(res, 404, { error: 'AI PRO endpoint не найден' }); return true;
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` };
  const upstream = http.request({ hostname: '127.0.0.1', port: UPSTREAM_PORT, path: req.url, method: req.method, headers }, upstreamResponse => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers); upstreamResponse.pipe(res);
  });
  upstream.on('error', error => { if (!res.headersSent) json(res, 503, { error: 'Сервис временно запускается' }); else res.end(); console.warn('ai-pro-upstream-error', error?.code || 'UNKNOWN'); });
  req.pipe(upstream);
}

function waitForUpstream(left = 180) {
  return new Promise((resolve, reject) => {
    const test = attemptsLeft => {
      const socket = net.createConnection({ host: '127.0.0.1', port: UPSTREAM_PORT });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => { socket.destroy(); if (attemptsLeft <= 0) reject(new Error('AI PRO upstream did not start')); else setTimeout(() => test(attemptsLeft - 1), 100); });
    };
    test(left);
  });
}

async function start() {
  const child = spawn(process.execPath, [join(__dirname, 'server-training-router.js')], { cwd: __dirname, env: { ...process.env, PORT: String(UPSTREAM_PORT), TRAINING_UPSTREAM_PORT: String(UPSTREAM_PORT + 1) }, stdio: 'inherit' });
  child.on('exit', code => { if (code) console.error('ai-pro upstream exit', code); });
  await waitForUpstream();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try { if (await handleApi(req, res, url)) return; proxy(req, res); }
    catch (error) { console.error('ai-pro-api', error); if (!res.headersSent) json(res, error?.status || 500, { error: error?.status ? error.message : 'Не удалось выполнить AI PRO запрос' }); }
  });
  server.listen(PORT, () => console.log(`EGE platform + AI PRO: http://localhost:${PORT}`));
  const stop = () => { child.kill('SIGTERM'); server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

start().catch(error => { console.error(error); process.exit(1); });
