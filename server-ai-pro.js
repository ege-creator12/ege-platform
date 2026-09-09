'use strict';

const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const database = require('./src/db');
const planner = require('./src/ai-study-planner');
const digitalTutor = require('./src/digital-tutor');
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
    if (data.length > 256 * 1024) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
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
  const created = await run('INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,?,?,?)', userId, null, mode, ids.length);
  const sessionId = Number(created.lastInsertRowid);
  for (const [position, questionId] of ids.entries()) {
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

function safePlanContext(plan, tutor) {
  return {
    subject: plan.subjectSlug,
    targetScore: plan.targetScore,
    examDate: plan.examDate,
    daysPerWeek: plan.daysPerWeek,
    minutesPerDay: plan.minutesPerDay,
    readiness: plan.readiness,
    coverage: plan.coverage,
    scoreRange: plan.scoreRange,
    priorityLines: Array.isArray(plan.priorityLines) ? plan.priorityLines.slice(0, 8) : [],
    weakLines: Array.isArray(plan.weakLines) ? plan.weakLines.slice(0, 8).map(item => ({
      line: item.line,
      title: item.title,
      reason: item.reason,
      accuracy: item.accuracy,
      total: item.total,
    })) : [],
    week: Array.isArray(plan.schedule) ? plan.schedule.slice(0, 7).map(day => ({
      label: day.label,
      title: day.title,
      rest: Boolean(day.rest),
      line: day.line || null,
      theoryMinutes: Number(day.theoryMinutes || 0),
      practiceMinutes: Number(day.practiceMinutes || 0),
      reviewMinutes: Number(day.reviewMinutes || 0),
      questions: Number(day.questions || 0),
      reason: day.reason || '',
    })) : [],
    today: tutor ? {
      title: tutor.title,
      totalMinutes: tutor.totalMinutes,
      reason: tutor.reason,
      line: tutor.line || null,
      steps: Array.isArray(tutor.steps) ? tutor.steps.map(step => ({
        key: step.key,
        title: step.title,
        description: step.description,
        minutes: step.minutes,
        status: step.status,
        line: step.line || null,
        count: step.count || null,
      })) : [],
    } : null,
  };
}

function fallbackCoachReply(plan, tutor, message) {
  const q = String(message || '').toLowerCase();
  const subject = plan.subjectSlug === 'chemistry' ? 'химии' : 'биологии';
  const week = Array.isArray(plan.schedule) ? plan.schedule : [];
  const studyDays = week.filter(day => !day.rest).slice(0, Math.max(1, Number(plan.daysPerWeek) || 5));
  const weak = Array.isArray(plan.weakLines) ? plan.weakLines : [];

  if (/недел|план|расписан/.test(q) && studyDays.length) {
    const lines = studyDays.map(day => {
      const minutes = Number(day.theoryMinutes || 0) + Number(day.practiceMinutes || 0) + Number(day.reviewMinutes || 0);
      const tasks = Number(day.questions || 0) ? `, ${day.questions} заданий` : '';
      return `• ${day.label || 'День'}: ${day.title || 'занятие'} — ${minutes || plan.minutesPerDay} мин${tasks}.`;
    });
    return `План на ближайшие учебные дни по ${subject}:\n${lines.join('\n')}\n\nДержи темп ${plan.daysPerWeek} дн./нед. по ${plan.minutesPerDay} мин. После решений план сам пересчитается по твоим ошибкам.`;
  }

  if (/завтра|следующ/.test(q)) {
    const next = studyDays[1] || studyDays[0];
    if (next) {
      const minutes = Number(next.theoryMinutes || 0) + Number(next.practiceMinutes || 0) + Number(next.reviewMinutes || 0);
      return `Завтра: ${next.title || 'занятие по плану'}. Ориентир — ${minutes || plan.minutesPerDay} минут${next.questions ? ` и ${next.questions} заданий` : ''}. ${next.reason || 'После занятия я учту результат и скорректирую следующий шаг.'}`;
    }
  }

  if (/ошиб|повтор|закреп/.test(q)) {
    if (weak.length) {
      const items = weak.slice(0, 3).map(item => `• задание ${item.line}: ${item.title}${item.accuracy == null ? '' : ` — точность ${item.accuracy}%`}`);
      return `Сейчас в первую очередь повтори:\n${items.join('\n')}\n\nНачни с самой слабой линии, затем реши 6–10 заданий без подсказок. Ошибки верни в повторение через 1–3 дня.`;
    }
    return 'Пока мало ошибок для точного разбора. Пройди диагностическую тренировку, и я расставлю приоритеты по конкретным линиям ЕГЭ.';
  }

  if (/нагруз|больше|меньше|минут|дней/.test(q)) {
    const weekly = (Number(plan.daysPerWeek) || 0) * (Number(plan.minutesPerDay) || 0);
    const suggestedMinutes = Math.min(180, Math.max(30, Number(plan.minutesPerDay) + (weekly < 300 ? 10 : 0)));
    return `Сейчас у тебя ${plan.daysPerWeek} дн./нед. × ${plan.minutesPerDay} мин. Я бы не повышал нагрузку резко: следующий безопасный шаг — ${plan.daysPerWeek} дн./нед. × ${suggestedMinutes} мин. Если две недели держишь точность и не пропускаешь занятия, можно добавить ещё 10–15 минут.`;
  }

  if (tutor?.steps?.length) {
    const steps = tutor.steps.filter(step => step.status !== 'done').slice(0, 3).map(step => `• ${step.title}${step.minutes ? ` — ${step.minutes} мин` : ''}`);
    return `По твоему текущему плану сейчас лучше сделать так:\n${steps.join('\n')}\n\nЦель — ${plan.targetScore}+; текущий план рассчитан на ${plan.daysPerWeek} дн./нед. по ${plan.minutesPerDay} мин.`;
  }

  return `Я вижу твой план по ${subject}: цель ${plan.targetScore}+, ${plan.daysPerWeek} дн./нед. по ${plan.minutesPerDay} мин. Спроси «составь план на неделю», «что учить завтра», «разбери мои ошибки» или «нужно ли увеличить нагрузку».`;
}

async function coachReply(userId, subjectSlug, message, history = []) {
  const plan = await currentPlan(userId, subjectSlug);
  if (!plan) throw Object.assign(new Error('Сначала заполни анкету и создай план'), { status: 409 });
  const tutor = await digitalTutor.buildTutorDay(database, userId, subjectSlug, plan);
  const q = String(message || '').trim().slice(0, 1500);
  if (!q) throw Object.assign(new Error('Напиши вопрос'), { status: 400 });

  const context = safePlanContext(plan, tutor);
  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-10)
    .filter(item => item && (item.role === 'assistant' || item.role === 'user') && String(item.text || '').trim())
    .map(item => `${item.role === 'assistant' ? 'Куратор' : 'Ученик'}: ${String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 700)}`)
    .join('\n');

  const prompt = `Ты — персональный AI-куратор ОСНОВА для подготовки к ЕГЭ. У тебя есть реальный учебный план ученика и его статистика.\n\nТвоя задача:\n- отвечать как нормальный живой куратор, а не как справочник;\n- по запросу составлять конкретный план на сегодня, завтра или неделю по дням;\n- объяснять, почему выбрана тема и что приоритетнее;\n- советовать, как менять нагрузку, но не выдумывать выполненные действия;\n- разбирать слабые линии и план повторения ошибок;\n- если данных мало, прямо сказать, каких данных не хватает и предложить диагностику;\n- не обещать официальный балл и не выдумывать статистику;\n- отвечать по-русски, конкретно, без мотивационной воды;\n- использовать короткие абзацы и списки, когда это делает план понятнее.\n\nДанные ученика: ${JSON.stringify(context)}\n${safeHistory ? `\nПредыдущий диалог:\n${safeHistory}\n` : ''}\nТекущий вопрос ученика: ${q}`;

  const fallback = fallbackCoachReply(plan, tutor, q);
  if (!GEMINI_API_KEY || !COACH_MODELS.length) {
    console.warn('ai-pro-coach: Gemini key/model is not configured; using plan fallback');
    return { text: fallback, subjectSlug, source: 'plan-fallback', aiAvailable: false };
  }

  const startedAt = Date.now();
  let lastError = null;
  for (const model of COACH_MODELS) {
    const elapsed = Date.now() - startedAt;
    const remaining = COACH_TOTAL_TIMEOUT_MS - elapsed;
    if (remaining < 1500) break;
    const attemptTimeout = Math.max(1200, Math.min(8000, remaining));
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 900, temperature: 0.35 },
        }),
        signal: AbortSignal.timeout(attemptTimeout),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || `Gemini ${response.status}`);
      const text = geminiText(data);
      if (text) return { text, subjectSlug, source: 'gemini', aiAvailable: true, model };
      lastError = new Error('Gemini вернул пустой ответ');
    } catch (error) {
      lastError = error;
      console.warn('ai-pro-coach-model', model, error?.message || 'unknown error');
    }
  }

  console.warn('ai-pro-coach-fallback', lastError?.message || 'no response');
  return { text: fallback, subjectSlug, source: 'plan-fallback', aiAvailable: false };
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
    const body = await readJson(req);
    const previousPlan = body?.subjectSlug ? await planner.loadPlan(database, user.id, String(body.subjectSlug)) : null;
    json(res, 200, { plan: await planner.buildPlan(database, user.id, body, { useAi: true, previousPlan }), openBeta: true, paidFeature: true });
    return true;
  }
  if (path === '/api/ai-pro/tutor/today' && req.method === 'GET') {
    const subjectSlug = validSubject(String(url.searchParams.get('subject') || 'biology'));
    const plan = await currentPlan(user.id, subjectSlug);
    const tutor = await digitalTutor.buildTutorDay(database, user.id, subjectSlug, plan);
    json(res, 200, { tutor, plan });
    return true;
  }
  if (path === '/api/ai-pro/coach' && req.method === 'POST') {
    const body = await readJson(req);
    const subjectSlug = validSubject(String(body.subjectSlug || ''));
    json(res, 200, await coachReply(user.id, subjectSlug, body.message, body.history));
    return true;
  }
  if (path === '/api/ai-pro/diagnostic' && req.method === 'POST') {
    const body = await readJson(req);
    const subjectSlug = validSubject(String(body.subjectSlug || ''));
    const ids = await planner.diagnosticQuestionIds(database, user.id, subjectSlug, Number(body.count) || 24);
    if (ids.length < 10) throw Object.assign(new Error('Недостаточно заданий для диагностики'), { status: 409 });
    json(res, 201, { session: await saveSession(user.id, ids, 'adaptive'), questionCount: ids.length, subjectSlug });
    return true;
  }
  if (path === '/api/ai-pro/review-status' && req.method === 'GET') {
    const subjectSlug = validSubject(String(url.searchParams.get('subject') || 'biology'));
    const list = await reviewCandidates(user.id, subjectSlug, 250);
    const wrong = list.filter(item => !(item.correct === true || item.correct === 1 || item.correct === '1' || item.correct === 'true')).length;
    json(res, 200, { subjectSlug, dueCount: list.length, wrongCount: wrong, ready: list.length > 0, recommendedCount: Math.min(12, list.length) });
    return true;
  }
  if (path === '/api/ai-pro/smart-review' && req.method === 'POST') {
    const body = await readJson(req);
    const subjectSlug = validSubject(String(body.subjectSlug || 'biology'));
    const wanted = Math.max(3, Math.min(30, Number(body.count) || 12));
    const candidates = await reviewCandidates(user.id, subjectSlug, Math.max(80, wanted * 6));
    const ids = [...new Set(candidates.map(item => Number(item.id)).filter(Boolean))].slice(0, wanted);
    if (!ids.length) throw Object.assign(new Error('Повторений на сегодня нет'), { status: 404 });
    json(res, 201, { session: await saveSession(user.id, ids, 'review'), questionCount: ids.length, subjectSlug });
    return true;
  }
  json(res, 404, { error: 'AI PRO endpoint не найден' });
  return true;
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` };
  const upstream = http.request({ hostname: '127.0.0.1', port: UPSTREAM_PORT, path: req.url, method: req.method, headers }, upstreamResponse => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.on('error', error => {
    if (!res.headersSent) json(res, 503, { error: 'Сервис временно запускается' });
    else res.end();
    console.warn('ai-pro-upstream-error', error?.code || 'UNKNOWN');
  });
  req.pipe(upstream);
}

function waitForUpstream(left = 180) {
  return new Promise((resolve, reject) => {
    const test = attemptsLeft => {
      const socket = net.createConnection({ host: '127.0.0.1', port: UPSTREAM_PORT });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (attemptsLeft <= 0) reject(new Error('AI PRO upstream did not start'));
        else setTimeout(() => test(attemptsLeft - 1), 100);
      });
    };
    test(left);
  });
}

async function start() {
  const child = spawn(process.execPath, [join(__dirname, 'server-training-router.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(UPSTREAM_PORT), TRAINING_UPSTREAM_PORT: String(UPSTREAM_PORT + 1) },
    stdio: 'inherit',
  });
  child.on('exit', code => { if (code) console.error('ai-pro upstream exit', code); });
  await waitForUpstream();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (await handleApi(req, res, url)) return;
      proxy(req, res);
    } catch (error) {
      console.error('ai-pro-api', error);
      if (!res.headersSent) json(res, error?.status || 500, { error: error?.status ? error.message : 'Не удалось выполнить AI PRO запрос' });
    }
  });
  server.listen(PORT, () => console.log(`EGE platform + AI PRO: http://localhost:${PORT}`));
  const stop = () => {
    child.kill('SIGTERM');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
