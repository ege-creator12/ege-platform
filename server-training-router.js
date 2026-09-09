'use strict';

const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const database = require('./src/db');
const biologyExamRegistry = require('./content/biology/exam-lines.json');
const chemistryExamRegistry = require('./content/chemistry/exam-lines');
const { row, rows, run } = database;

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.TRAINING_UPSTREAM_PORT || (PORT + 1));
const trainingModes = new Set(['adaptive', 'mixed', 'new', 'review', 'mistakes', 'errors', 'hard', 'infinite', 'topic']);
const subjectSlugs = new Set(['biology', 'chemistry']);

const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
};

const numericId = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1024 * 1024) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row(
    'SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

async function auth(req, res) {
  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return null;
  }
  return user;
}

function isCorrect(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function dueAt(value) {
  if (!value) return false;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) && time <= Date.now();
}

async function recentPresentedIds(userId) {
  const recent = await rows(
    `SELECT tsq.question_id
     FROM training_session_questions tsq
     JOIN training_sessions s ON s.id=tsq.session_id
     WHERE s.user_id=? AND tsq.presented_at IS NOT NULL
     ORDER BY tsq.presented_at DESC, tsq.session_id DESC, tsq.position DESC
     LIMIT 10`,
    userId,
  );
  return new Set(recent.map(x => Number(x.question_id)));
}

function emptyMessage(mode) {
  if (mode === 'new') return 'Новых заданий сейчас нет — выберите другой режим.';
  if (mode === 'review') return 'Заданий, срок повторения которых наступил, сейчас нет.';
  if (mode === 'mistakes' || mode === 'errors') return 'Ошибок для повторения пока нет.';
  return 'Для выбранной тренировки пока нет заданий.';
}

async function subjectId(slug) {
  const subject = await row('SELECT id FROM subjects WHERE slug=? AND published=1', slug);
  return Number(subject?.id || 0);
}

function biologyLineRule(line) {
  const info = biologyExamRegistry.lines.find(item => Number(item.line) === Number(line));
  if (!info) return null;
  const refs = Array.isArray(info.questionRefs) ? info.questionRefs.map(String).filter(Boolean) : [];
  return {
    refs,
    patterns: [
      `biology-bank-v4-line${line}-%`,
      `biology-bank-v5-extra-line${line}-%`,
    ],
  };
}

async function questionPool(userId, topicId, mode, limit, options = {}) {
  const examLine = Number(options.examLine || 0);
  const onlySubjectId = Number(options.subjectId || 0);
  const publishedOnly = Boolean(options.publishedOnly);
  const strictBiologyLine = Boolean(options.strictBiologyLine && examLine);
  const filter = mode === 'new'
    ? 'a.id IS NULL'
    : mode === 'review'
      ? 'a.id IS NOT NULL AND a.next_review_at<=CURRENT_TIMESTAMP'
      : ['mistakes', 'errors'].includes(mode)
        ? 'a.id IS NOT NULL AND a.correct=0'
        : mode === 'hard'
          ? 'q.difficulty>=2'
          : '1=1';

  let strictClause = '';
  const strictParams = [];
  if (strictBiologyLine) {
    const rule = biologyLineRule(examLine);
    if (!rule) return [];
    const parts = rule.patterns.map(() => 'q.external_key LIKE ?');
    strictParams.push(...rule.patterns);
    if (rule.refs.length) {
      parts.push(`q.external_key IN (${rule.refs.map(() => '?').join(',')})`);
      strictParams.push(...rule.refs);
    }
    strictClause = ` AND (${parts.join(' OR ')})`;
  }

  const candidateLimit = Math.min(700, Math.max(limit * 24, 140));
  const candidates = await rows(
    `WITH RECURSIVE tree(id) AS (
       SELECT CAST(? AS BIGINT)
       UNION ALL SELECT t.id FROM topics t JOIN tree ON t.parent_id=tree.id
     ), latest AS (
       SELECT a.*,ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY id DESC) rn
       FROM attempts a WHERE user_id=?
     )
     SELECT q.id,q.difficulty,a.id attempt_id,a.correct,a.next_review_at
     FROM questions q
     LEFT JOIN latest a ON a.question_id=q.id AND a.rn=1
     WHERE q.active=1
       AND (?=0 OR q.topic_id IN (SELECT id FROM tree))
       AND (?=0 OR q.exam_line=?)
       AND (?=0 OR q.subject_id=?)
       AND (?=0 OR q.published=1)
       ${strictClause}
       AND ${filter}
     ORDER BY RANDOM()
     LIMIT ?`,
    topicId,
    userId,
    topicId,
    examLine,
    examLine,
    onlySubjectId,
    onlySubjectId,
    publishedOnly ? 1 : 0,
    ...strictParams,
    candidateLimit,
  );

  if (!candidates.length) return [];

  const recent = await recentPresentedIds(userId);
  const adaptive = ['adaptive', 'mixed', 'infinite', 'topic', 'hard'].includes(mode);
  const scored = candidates.map((candidate, randomIndex) => {
    let learningPriority = 0;
    if (adaptive) {
      if (candidate.attempt_id && !isCorrect(candidate.correct)) learningPriority = 0;
      else if (candidate.attempt_id && dueAt(candidate.next_review_at)) learningPriority = 1;
      else if (!candidate.attempt_id) learningPriority = 2;
      else learningPriority = 3;
    }
    return {
      ...candidate,
      recentPenalty: recent.has(Number(candidate.id)) ? 1 : 0,
      learningPriority,
      randomIndex,
    };
  });

  scored.sort((a, b) =>
    a.recentPenalty - b.recentPenalty ||
    a.learningPriority - b.learningPriority ||
    Number(a.difficulty || 1) - Number(b.difficulty || 1) ||
    a.randomIndex - b.randomIndex
  );

  return scored.slice(0, limit).map(x => Number(x.id));
}

async function saveSession(userId, topicId, mode, target, ids) {
  const storedMode = mode === 'errors'
    ? 'mistakes'
    : ['mixed', 'hard', 'infinite'].includes(mode)
      ? 'adaptive'
      : mode;
  const created = await run(
    'INSERT INTO training_sessions(user_id,topic_id,mode,target_questions) VALUES(?,?,?,?)',
    userId,
    topicId || null,
    storedMode,
    Math.min(target, ids.length),
  );
  const sessionId = Number(created.lastInsertRowid);
  for (const [position, questionId] of ids.entries()) {
    await run(
      'INSERT INTO training_session_questions(session_id,question_id,position,state) VALUES(?,?,?,?)',
      sessionId,
      questionId,
      position,
      'pending',
    );
  }
  return row('SELECT * FROM training_sessions WHERE id=?', sessionId);
}

async function createGeneralTraining(req, res) {
  const user = await auth(req, res);
  if (!user) return;
  const body = await readJson(req);
  const mode = trainingModes.has(body.mode) ? body.mode : 'adaptive';
  const topicId = body.topicId === undefined || body.topicId === null || Number(body.topicId) === 0 ? 0 : numericId(body.topicId);
  const examLine = body.examLine === undefined || body.examLine === null || Number(body.examLine) === 0 ? 0 : numericId(body.examLine);
  const target = Math.min(100, Math.max(1, Number(body.targetQuestions) || 10));
  const requestedSubject = String(body.subjectSlug || '').trim();

  if (topicId === null) return json(res, 400, { error: 'Некорректный идентификатор темы' });
  if (requestedSubject && !subjectSlugs.has(requestedSubject)) {
    return json(res, 400, { error: 'Некорректный предмет', code: 'INVALID_SUBJECT' });
  }
  if (examLine === null || examLine > 28 || (examLine && !biologyExamRegistry.lines.some(x => x.line === examLine))) {
    return json(res, 400, { error: 'Некорректный номер задания', code: 'INVALID_EXAM_LINE' });
  }

  let onlySubjectId = 0;
  let resolvedSubject = requestedSubject;

  if (examLine) {
    resolvedSubject = 'biology';
    onlySubjectId = await subjectId('biology');
  } else if (requestedSubject) {
    onlySubjectId = await subjectId(requestedSubject);
  } else if (topicId) {
    const topic = await row('SELECT subject_id FROM topics WHERE id=?', topicId);
    onlySubjectId = Number(topic?.subject_id || 0);
    if (onlySubjectId) {
      const subject = await row('SELECT slug FROM subjects WHERE id=? AND published=1', onlySubjectId);
      resolvedSubject = String(subject?.slug || '');
    }
  } else {
    resolvedSubject = 'biology';
    onlySubjectId = await subjectId('biology');
  }

  if (!onlySubjectId) return json(res, 404, { error: 'Предмет тренировки не найден', code: 'TRAINING_SUBJECT_NOT_FOUND' });

  const ids = await questionPool(user.id, topicId, mode, target, {
    examLine,
    subjectId: onlySubjectId,
    publishedOnly: Boolean(examLine),
    strictBiologyLine: Boolean(examLine),
  });
  if (!ids.length) return json(res, 404, { error: examLine ? `В проверенном банке линии ${examLine} пока нет подходящих заданий` : emptyMessage(mode), code: 'TRAINING_POOL_EMPTY' });

  const session = await saveSession(user.id, topicId, mode, target, ids);
  json(res, 201, { session, subjectSlug: resolvedSubject || null, examLine: examLine || null, strictLinePool: Boolean(examLine) });
}

async function createChemistryTraining(req, res) {
  const user = await auth(req, res);
  if (!user) return;
  const body = await readJson(req);
  const line = numericId(body.examLine);
  const target = Math.min(100, Math.max(1, Number(body.targetQuestions) || 10));
  const mode = trainingModes.has(body.mode) ? body.mode : 'adaptive';

  if (!line || !chemistryExamRegistry.lines.some(x => Number(x.line) === line)) {
    return json(res, 400, { error: 'Некорректный номер задания', code: 'INVALID_EXAM_LINE' });
  }
  const chemistryId = await subjectId('chemistry');
  if (!chemistryId) return json(res, 404, { error: 'Химия не найдена' });

  const ids = await questionPool(user.id, 0, mode, target, {
    examLine: line,
    subjectId: chemistryId,
    publishedOnly: true,
  });
  if (!ids.length) return json(res, 404, { error: emptyMessage(mode), code: 'TRAINING_POOL_EMPTY' });

  const session = await saveSession(user.id, 0, mode, target, ids);
  json(res, 201, { session, subjectSlug: 'chemistry' });
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` };
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: UPSTREAM_PORT,
    path: req.url,
    method: req.method,
    headers,
  }, upstreamResponse => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.on('error', error => {
    if (!res.headersSent) json(res, 503, { error: 'Сервис временно запускается' });
    else res.end();
    console.warn('training-upstream-error', error?.code || 'UNKNOWN');
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
        if (attemptsLeft <= 0) reject(new Error('Training upstream did not start'));
        else setTimeout(() => test(attemptsLeft - 1), 100);
      });
    };
    test(left);
  });
}

async function start() {
  const child = spawn(process.execPath, [join(__dirname, 'server-ai-review.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(UPSTREAM_PORT) },
    stdio: 'inherit',
  });
  child.on('exit', code => { if (code) console.error('training upstream exit', code); });

  await waitForUpstream();
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (path === '/api/training/sessions' && req.method === 'POST') return await createGeneralTraining(req, res);
      if (path === '/api/subjects/chemistry/training/sessions' && req.method === 'POST') return await createChemistryTraining(req, res);
      proxy(req, res);
    } catch (error) {
      console.error('training-api', error);
      if (!res.headersSent) json(res, error?.status || 500, { error: error?.status ? error.message : 'Не удалось начать тренировку' });
    }
  });

  server.listen(PORT, () => console.log(`EGE platform + training router: http://localhost:${PORT}`));
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
