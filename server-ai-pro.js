'use strict';

const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const database = require('./src/db');
const planner = require('./src/ai-study-planner');
const { row, rows, run } = database;

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.AI_PRO_UPSTREAM_PORT || (PORT + 1));

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

function isoDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

async function currentPlan(userId, subjectSlug) {
  let plan = await planner.loadPlan(database, userId, subjectSlug);
  if (!plan) return null;

  const examTime = Date.parse(`${plan.examDate}T12:00:00`);
  if (!Number.isFinite(examTime) || examTime <= Date.now()) {
    return { ...plan, expired: true };
  }

  const analytics = await planner.collectAnalytics(database, userId, subjectSlug);
  const needsRefresh =
    Number(plan.version || 0) < Number(planner.PLAN_VERSION || 2) ||
    Number(plan.attempts || 0) !== Number(analytics.attempts || 0) ||
    isoDay(plan.generatedAt) !== isoDay();

  if (needsRefresh) {
    // Auto-adaptation is statistical and free: Gemini is reserved for an explicit plan rebuild.
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

function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function dateKey(date) { return new Date(date).toISOString().slice(0, 10); }
function weekLabel(date) { return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); }

async function progressHistory(userId, subjectSlug) {
  const sid = await subjectId(subjectSlug);
  const [attempts, analytics] = await Promise.all([
    rows(`SELECT a.correct,a.duration_seconds,a.created_at,q.exam_line
      FROM attempts a JOIN questions q ON q.id=a.question_id
      WHERE a.user_id=? AND q.subject_id=? ORDER BY a.id DESC LIMIT 1200`, userId, sid),
    planner.collectAnalytics(database, userId, subjectSlug),
  ]);
  const nowStart = weekStart(new Date());
  const weeks = [];
  for (let i = 7; i >= 0; i -= 1) {
    const start = new Date(nowStart);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    weeks.push({ start, date: dateKey(start), label: weekLabel(start), end, solved: 0, correct: 0, seconds: 0, lines: new Set() });
  }
  for (const attempt of attempts) {
    const when = new Date(attempt.created_at);
    if (!Number.isFinite(when.getTime())) continue;
    const bucket = weeks.find(week => when >= week.start && when < week.end);
    if (!bucket) continue;
    bucket.solved += 1;
    bucket.correct += (attempt.correct === true || attempt.correct === 1 || attempt.correct === '1' || attempt.correct === 'true') ? 1 : 0;
    bucket.seconds += Math.max(0, Number(attempt.duration_seconds) || 0);
    if (Number(attempt.exam_line) > 0) bucket.lines.add(Number(attempt.exam_line));
  }

  let totalSolved = 0;
  let totalCorrect = 0;
  const seenLines = new Set();
  const totalLines = Math.max(1, Number(analytics.totalLines || 0));
  const history = weeks.map((week, index) => {
    totalSolved += week.solved;
    totalCorrect += week.correct;
    week.lines.forEach(line => seenLines.add(line));
    const accuracy = week.solved ? Math.round(week.correct / week.solved * 100) : 0;
    const rollingAccuracy = totalSolved ? Math.round(totalCorrect / totalSolved * 100) : 0;
    const coverage = Math.round(seenLines.size / totalLines * 100);
    const readiness = totalSolved ? Math.max(0, Math.min(100, Math.round(rollingAccuracy * (0.45 + 0.55 * coverage / 100)))) : 0;
    return {
      week: index + 1,
      date: week.date,
      label: week.label,
      solved: week.solved,
      accuracy,
      minutes: Math.round(week.seconds / 60),
      coverage,
      readiness,
      estimatedScore: readiness,
    };
  });
  const current = history.at(-1) || { solved: 0, accuracy: 0, minutes: 0, readiness: 0, estimatedScore: 0 };
  const previous = history.at(-2) || { solved: 0, accuracy: 0, minutes: 0, readiness: 0, estimatedScore: 0 };
  return {
    subjectSlug,
    history,
    current,
    delta: {
      solved: current.solved - previous.solved,
      accuracy: current.accuracy - previous.accuracy,
      score: current.readiness - previous.readiness,
      readiness: current.readiness - previous.readiness,
    },
  };
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

async function reviewStatus(userId, subjectSlug) {
  const list = await reviewCandidates(userId, subjectSlug, 250);
  const wrong = list.filter(item => !(item.correct === true || item.correct === 1 || item.correct === '1' || item.correct === 'true')).length;
  return { subjectSlug, dueCount: list.length, wrongCount: wrong, ready: list.length > 0, recommendedCount: Math.min(12, list.length) };
}

async function handleApi(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/ai-pro/')) return false;
  const user = await auth(req, res);
  if (!user) return true;

  if (path === '/api/ai-pro/plan' && req.method === 'GET') {
    const subjectSlug = validSubject(String(url.searchParams.get('subject') || 'biology'));
    const plan = await currentPlan(user.id, subjectSlug);
    json(res, 200, { plan, openBeta: true, paidFeature: true });
    return true;
  }
  if (path === '/api/ai-pro/plan' && req.method === 'POST') {
    const body = await readJson(req);
    const previousPlan = body?.subjectSlug ? await planner.loadPlan(database, user.id, String(body.subjectSlug)) : null;
    const plan = await planner.buildPlan(database, user.id, body, { useAi: true, previousPlan });
    json(res, 200, { plan, openBeta: true, paidFeature: true });
    return true;
  }
  if (path === '/api/ai-pro/diagnostic' && req.method === 'POST') {
    const body = await readJson(req);
    const subjectSlug = validSubject(String(body.subjectSlug || ''));
    const ids = await planner.diagnosticQuestionIds(database, user.id, subjectSlug, Number(body.count) || 24);
    if (ids.length < 10) throw Object.assign(new Error('Недостаточно заданий для диагностики'), { status: 409 });
    const session = await saveSession(user.id, ids, 'adaptive');
    json(res, 201, { session, questionCount: ids.length, subjectSlug });
    return true;
  }
  if (path === '/api/ai-pro/progress' && req.method === 'GET') {
    const subjectSlug = validSubject(String(url.searchParams.get('subject') || 'biology'));
    json(res, 200, await progressHistory(user.id, subjectSlug));
    return true;
  }
  if (path === '/api/ai-pro/review-status' && req.method === 'GET') {
    const subjectSlug = validSubject(String(url.searchParams.get('subject') || 'biology'));
    json(res, 200, await reviewStatus(user.id, subjectSlug));
    return true;
  }
  if (path === '/api/ai-pro/smart-review' && req.method === 'POST') {
    const body = await readJson(req);
    const subjectSlug = validSubject(String(body.subjectSlug || 'biology'));
    const wanted = Math.max(3, Math.min(30, Number(body.count) || 12));
    const candidates = await reviewCandidates(user.id, subjectSlug, Math.max(80, wanted * 6));
    const ids = [...new Set(candidates.map(item => Number(item.id)).filter(Boolean))].slice(0, wanted);
    if (!ids.length) throw Object.assign(new Error('Повторений на сегодня нет — всё актуальное уже закрыто'), { status: 404 });
    const session = await saveSession(user.id, ids, 'review');
    json(res, 201, { session, questionCount: ids.length, subjectSlug });
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
  const stop = () => { child.kill('SIGTERM'); server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

start().catch(error => { console.error(error); process.exit(1); });
