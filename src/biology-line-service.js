'use strict';

const strictPattern = line => `biology-bank-v6-line${Number(line)}-%`;

function safeJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function publicExample(q) {
  return {
    id: Number(q.id),
    type: q.type,
    questionType: q.question_type || q.type,
    manualReview: q.question_type === 'extended_answer' || Number(q.max_score || q.points || 1) > 1,
    prompt: q.prompt,
    instruction: q.instruction,
    contentJson: q.content_json,
    mediaJson: q.media_json,
    imageUrl: q.image_url || null,
    difficulty: Number(q.difficulty || 1),
    points: Number(q.points || 1),
    maxScore: Number(q.max_score || q.points || 1),
    estimatedSeconds: Number(q.estimated_seconds || 0),
    topic: q.topic,
  };
}

async function biologySubject(db) {
  return db.row("SELECT id,title FROM subjects WHERE slug='biology' AND published=1");
}

async function biologyLinePayload(db, registry, line, userId) {
  line = Number(line);
  const item = registry.lines.find(x => Number(x.line) === line);
  if (!item) return null;

  const subject = await biologySubject(db);
  if (!subject) return null;
  const subjectId = Number(subject.id);
  const pattern = strictPattern(line);

  const refs = Array.isArray(item.lessonRefs) ? item.lessonRefs.filter(Boolean) : [];
  let lessons = [];
  if (refs.length) {
    const marks = refs.map(() => '?').join(',');
    lessons = await db.rows(`SELECT l.id,l.slug,l.title,t.title topic_title,sec.title section_title,
      COALESCE(lp.reading_progress,0) progress,COALESCE(lp.status,'not_started') progress_status
      FROM lessons l
      JOIN topics t ON t.id=l.topic_id
      JOIN sections sec ON sec.id=t.section_id
      LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=?
      WHERE t.subject_id=? AND l.slug IN (${marks}) AND l.published=1
      ORDER BY l.position,l.id`, userId, subjectId, ...refs);
  }
  const lessonBySlug = new Map(lessons.map(x => [x.slug, x]));

  const count = await db.row(`SELECT COUNT(*) n FROM questions q
    WHERE q.subject_id=? AND q.active=1 AND q.published=1 AND q.exam_line=? AND q.external_key LIKE ?`,
    subjectId, line, pattern);

  const stat = await db.row(`SELECT COUNT(*) attempted,COALESCE(SUM(a.correct),0) correct,MAX(a.created_at) last_attempt_at
    FROM attempts a JOIN questions q ON q.id=a.question_id
    WHERE a.user_id=? AND q.subject_id=? AND q.exam_line=? AND q.external_key LIKE ?`,
    userId, subjectId, line, pattern);

  const wrong = await db.rows(`WITH latest AS (
      SELECT a.*,ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY id DESC) rn
      FROM attempts a WHERE user_id=?
    )
    SELECT q.external_key
    FROM latest a JOIN questions q ON q.id=a.question_id
    WHERE a.rn=1 AND a.correct=0 AND q.subject_id=? AND q.exam_line=? AND q.external_key LIKE ?
    ORDER BY a.created_at DESC`, userId, subjectId, line, pattern);

  const examples = await db.rows(`SELECT q.id,q.type,q.question_type,q.prompt,q.instruction,q.content_json,q.media_json,q.image_url,
      q.difficulty,q.points,q.max_score,q.estimated_seconds,t.title topic
    FROM questions q JOIN topics t ON t.id=q.topic_id
    WHERE q.subject_id=? AND q.active=1 AND q.published=1 AND q.exam_line=? AND q.external_key LIKE ?
    ORDER BY q.difficulty,q.id LIMIT 3`, subjectId, line, pattern);

  const attempted = Number(stat?.attempted || 0);
  const correct = Number(stat?.correct || 0);
  return {
    ...item,
    questionCount: Number(count?.n || 0),
    lessons: refs.map(slug => lessonBySlug.get(slug)).filter(Boolean),
    examples: examples.map(publicExample),
    progress: {
      attempted,
      correct,
      accuracy: attempted ? Math.round(correct / attempted * 100) : 0,
      lastAttemptAt: stat?.last_attempt_at || null,
      wrongQuestionRefs: wrong.map(x => x.external_key),
    },
    strictBank: true,
    bankVersion: 6,
    subjectSlug: 'biology',
  };
}

async function biologyLinesPayload(db, registry, userId) {
  const lines = [];
  for (const item of registry.lines) {
    const payload = await biologyLinePayload(db, registry, item.line, userId);
    if (!payload) continue;
    lines.push({
      line: Number(item.line),
      title: item.title,
      part: item.part,
      answerFormat: item.answerFormat,
      shortDescription: item.shortDescription,
      questionCount: payload.questionCount,
      progress: payload.progress,
      strictBank: true,
      bankVersion: 6,
    });
  }
  return {
    examYear: registry.examYear,
    sourceStatus: registry.sourceStatus,
    subjectSlug: 'biology',
    strictBank: true,
    bankVersion: 6,
    lines,
  };
}

module.exports = { biologyLinePayload, biologyLinesPayload, strictPattern, publicExample, safeJson };
