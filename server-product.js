'use strict';

const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const database = require('./src/db');
const planner = require('./src/ai-study-planner');
const { normalizeOnboarding, chooseDiagnosticQuestions, collectAnalytics } = require('./src/product-analytics');

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.PRODUCT_UPSTREAM_PORT || (PORT + 1));

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 32768) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return database.row(
    'SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

async function auth(req, res) {
  const user = await userFor(req);
  if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return null; }
  return user;
}

async function logEvent(userId, eventName, route = '', metadata = {}) {
  const name = String(eventName || '').trim().toLowerCase();
  if (!/^[a-z0-9_.-]{1,64}$/.test(name)) return;
  const safeRoute = String(route || '').slice(0, 120);
  let safeMeta = '{}';
  try {
    const source = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
    safeMeta = JSON.stringify(source).slice(0, 1500);
    JSON.parse(safeMeta);
  } catch { safeMeta = '{}'; }
  await database.run('INSERT INTO product_events(user_id,event_name,route,metadata_json) VALUES(?,?,?,?)', userId, name, safeRoute, safeMeta);
}

async function onboardingState(userId) {
  const onboarding = await database.row('SELECT * FROM user_onboarding WHERE user_id=?', userId);
  const history = await database.row(`SELECT
      (SELECT COUNT(*) FROM attempts WHERE user_id=?) attempts,
      (SELECT COUNT(*) FROM ai_study_plans WHERE user_id=?) plans`, userId, userId);
  let diagnostic = null;
  if (onboarding?.diagnostic_session_id) {
    diagnostic = await database.row('SELECT id,status,answered_count,target_questions,started_at,finished_at FROM training_sessions WHERE id=? AND user_id=?', onboarding.diagnostic_session_id, userId);
    if (diagnostic?.status === 'completed' && !onboarding.completed_at) {
      await database.run('UPDATE user_onboarding SET completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?', userId);
      onboarding.completed_at = new Date().toISOString();
      await logEvent(userId, 'onboarding_completed', 'diagnostic', { automatic: true }).catch(() => {});
    }
  }
  const hasHistory = Number(history?.attempts || 0) > 0 || Number(history?.plans || 0) > 0;
  return {
    needsOnboarding: !onboarding?.completed_at && !hasHistory,
    legacyUser: !onboarding && hasHistory,
    onboarding: onboarding ? {
      subjectSlug: onboarding.subject_slug,
      currentScore: Number(onboarding.current_score || 0),
      targetScore: Number(onboarding.target_score || 0),
      examDate: onboarding.exam_date,
      daysPerWeek: Number(onboarding.days_per_week || 0),
      minutesPerDay: Number(onboarding.minutes_per_day || 0),
      completedAt: onboarding.completed_at || null,
    } : null,
    diagnostic: diagnostic ? {
      id: Number(diagnostic.id), status: diagnostic.status,
      answered: Number(diagnostic.answered_count || 0), target: Number(diagnostic.target_questions || 0),
      startedAt: diagnostic.started_at || null, finishedAt: diagnostic.finished_at || null,
    } : null,
  };
}

async function saveOnboarding(userId, payload) {
  const input = normalizeOnboarding(payload);
  const plan = await planner.buildPlan(database, userId, {
    subjectSlug: input.subjectSlug,
    targetScore: input.targetScore,
    examDate: input.examDate,
    daysPerWeek: input.daysPerWeek,
    minutesPerDay: input.minutesPerDay,
  }, { useAi: false });
  await database.run(`INSERT INTO user_onboarding(user_id,subject_slug,current_score,target_score,exam_date,days_per_week,minutes_per_day,updated_at)
    VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      subject_slug=excluded.subject_slug,current_score=excluded.current_score,target_score=excluded.target_score,
      exam_date=excluded.exam_date,days_per_week=excluded.days_per_week,minutes_per_day=excluded.minutes_per_day,
      updated_at=CURRENT_TIMESTAMP`, userId, input.subjectSlug, input.currentScore, input.targetScore, input.examDate, input.daysPerWeek, input.minutesPerDay);
  await logEvent(userId, 'onboarding_profile_saved', 'onboarding', { subjectSlug: input.subjectSlug, targetScore: input.targetScore, daysPerWeek: input.daysPerWeek, minutesPerDay: input.minutesPerDay }).catch(() => {});
  return { input, plan };
}

async function startDiagnostic(userId) {
  const onboarding = await database.row('SELECT * FROM user_onboarding WHERE user_id=?', userId);
  if (!onboarding) throw Object.assign(new Error('Сначала заполни короткую анкету'), { status: 409 });
  const slug = onboarding.subject_slug;
  const subject = await database.row('SELECT id FROM subjects WHERE slug=? AND published=1', slug);
  if (!subject) throw Object.assign(new Error('Предмет не найден'), { status: 404 });
  const prefix = slug === 'biology' ? 'biology-bank-v6-line%' : 'chemistry-bank-v2-line%';
  const candidates = await database.rows(`SELECT q.id,q.exam_line FROM questions q
      WHERE q.subject_id=? AND q.active=1 AND q.published=1 AND q.exam_line IS NOT NULL AND q.external_key LIKE ?
      ORDER BY RANDOM() LIMIT 100`, subject.id, prefix);
  let picked = chooseDiagnosticQuestions(candidates, 6);
  if (picked.length < 6) {
    const fallback = await database.rows(`SELECT q.id,q.exam_line FROM questions q
      WHERE q.subject_id=? AND q.active=1 AND q.published=1 AND q.exam_line IS NOT NULL
      ORDER BY RANDOM() LIMIT 100`, subject.id);
    picked = chooseDiagnosticQuestions([...picked, ...fallback], 6);
  }
  if (picked.length < 4) throw Object.assign(new Error('Пока не хватает заданий для диагностики'), { status: 409 });

  const created = await database.run('INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,?,?,?)', userId, null, 'adaptive', picked.length);
  const sessionId = Number(created.lastInsertRowid);
  for (const [position, question] of picked.entries()) {
    await database.run('INSERT INTO training_session_questions(session_id,question_id,position,state) VALUES(?,?,?,?)', sessionId, question.id, position, 'pending');
  }
  await database.run('UPDATE user_onboarding SET diagnostic_session_id=?,diagnostic_started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?', sessionId, userId);
  await logEvent(userId, 'diagnostic_started', 'onboarding', { subjectSlug: slug, questions: picked.length }).catch(() => {});
  return { id: sessionId, subjectSlug: slug, targetQuestions: picked.length };
}

async function completeOnboarding(userId, skippedDiagnostic = false) {
  const current = await database.row('SELECT user_id FROM user_onboarding WHERE user_id=?', userId);
  if (!current) throw Object.assign(new Error('Сначала заполни анкету'), { status: 409 });
  await database.run('UPDATE user_onboarding SET completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?', userId);
  await logEvent(userId, 'onboarding_completed', 'onboarding', { skippedDiagnostic: Boolean(skippedDiagnostic) }).catch(() => {});
  return onboardingState(userId);
}

async function analyticsPayload(userId, subjectSlug) {
  const data = await collectAnalytics(database, userId, subjectSlug);
  const planSubject = data.subject === 'all' ? (data.onboarding?.subjectSlug || 'biology') : data.subject;
  const plan = await planner.loadPlan(database, userId, planSubject).catch(() => null);
  return {
    ...data,
    forecast: plan ? {
      subjectSlug: plan.subjectSlug,
      targetScore: Number(plan.targetScore || 0),
      scoreEstimate: plan.scoreEstimate ?? null,
      scoreRange: plan.scoreRange || null,
      readiness: Number(plan.readiness || 0),
      coverage: Number(plan.coverage || 0),
      confidence: plan.confidence || 'низкая',
      coachNote: plan.coachNote || '',
    } : null,
  };
}

async function handleProductApi(req, res, url) {
  if (!url.pathname.startsWith('/api/product/')) return false;
  const user = await auth(req, res);
  if (!user) return true;

  if (req.method === 'GET' && url.pathname === '/api/product/onboarding') {
    json(res, 200, await onboardingState(user.id)); return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/product/onboarding') {
    const result = await saveOnboarding(user.id, await readJson(req));
    json(res, 200, { ok: true, onboarding: result.input, plan: result.plan }); return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/product/onboarding/diagnostic') {
    json(res, 200, { ok: true, session: await startDiagnostic(user.id) }); return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/product/onboarding/complete') {
    const payload = await readJson(req);
    json(res, 200, { ok: true, ...(await completeOnboarding(user.id, payload.skippedDiagnostic)) }); return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/product/analytics') {
    const subject = String(url.searchParams.get('subject') || '').trim();
    json(res, 200, await analyticsPayload(user.id, subject));
    await logEvent(user.id, 'analytics_opened', 'analytics', { subject: subject || 'all' }).catch(() => {});
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/product/event') {
    const payload = await readJson(req);
    await logEvent(user.id, payload.eventName, payload.route, payload.metadata);
    json(res, 200, { ok: true }); return true;
  }
  json(res, 404, { error: 'Маршрут продукта не найден' });
  return true;
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` };
  const upstream = http.request({ hostname: '127.0.0.1', port: UPSTREAM_PORT, path: req.url, method: req.method, headers }, upstreamResponse => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.on('error', error => {
    if (!res.headersSent) json(res, 503, { error: 'Сервис временно запускается' }); else res.end();
    console.warn('product-upstream-error', error?.code || 'UNKNOWN');
  });
  req.pipe(upstream);
}

function waitForUpstream(left = 220) {
  return new Promise((resolve, reject) => {
    const test = attemptsLeft => {
      const socket = net.createConnection({ host: '127.0.0.1', port: UPSTREAM_PORT });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (attemptsLeft <= 0) reject(new Error('Product upstream did not start'));
        else setTimeout(() => test(attemptsLeft - 1), 100);
      });
    };
    test(left);
  });
}

async function start() {
  const child = spawn(process.execPath, [join(__dirname, 'server-biology-lines.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(UPSTREAM_PORT) },
    stdio: 'inherit',
  });
  child.on('exit', code => { if (code) console.error('product upstream exit', code); });
  await waitForUpstream();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (await handleProductApi(req, res, url)) return;
      proxy(req, res);
    } catch (error) {
      console.error('product-api', error);
      if (!res.headersSent) json(res, Number(error?.status || 500), { error: error?.message || 'Не удалось выполнить запрос' });
    }
  });
  server.listen(PORT, () => console.log(`EGE platform + product layer: http://localhost:${PORT}`));
  const stop = () => { child.kill('SIGTERM'); server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

if (require.main === module) start().catch(error => { console.error(error); process.exit(1); });
module.exports = { start, handleProductApi, onboardingState, analyticsPayload, startDiagnostic, completeOnboarding };
