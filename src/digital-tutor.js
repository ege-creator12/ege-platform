'use strict';

const TIME_ZONE = process.env.AI_TIMEZONE || 'Europe/Moscow';
const isCorrect = value => value === true || value === 1 || value === '1' || value === 'true';

function dayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function missionFromPlan(plan) {
  if (!plan || !Array.isArray(plan.schedule)) return null;
  const today = dayKey();
  return plan.schedule.find(item => item.date === today)
    || plan.schedule.find(item => !item.rest && String(item.date || '') >= today)
    || plan.schedule.find(item => !item.rest)
    || plan.schedule[0]
    || null;
}

async function subjectId(db, subjectSlug) {
  const subject = await db.row('SELECT id FROM subjects WHERE slug=? AND published=1', subjectSlug);
  return Number(subject?.id || 0);
}

async function lessonForLine(db, sid, line) {
  if (!sid || !line) return null;
  return db.row(`SELECT l.id,l.title,t.title topic_title,COUNT(q.id) question_count
    FROM questions q
    JOIN lessons l ON l.id=q.lesson_id
    JOIN topics t ON t.id=l.topic_id
    WHERE q.subject_id=? AND q.exam_line=? AND q.active=1 AND q.published=1 AND l.published=1
    GROUP BY l.id,l.title,t.title
    ORDER BY COUNT(q.id) DESC,l.id ASC
    LIMIT 1`, sid, line);
}

async function theoryState(db, userId, lesson) {
  if (!lesson?.id) return { done: true, available: false };
  const progress = await db.row('SELECT theory_read,status,updated_at FROM lesson_progress WHERE user_id=? AND lesson_id=?', userId, lesson.id);
  return {
    done: Boolean(progress && (isCorrect(progress.theory_read) || progress.status === 'completed')),
    available: true,
    updatedAt: progress?.updated_at || null,
  };
}

async function recentLineSessions(db, userId, sid, line) {
  if (!sid || !line) return [];
  return db.rows(`SELECT ts.id,ts.status,ts.mode,ts.created_at,COUNT(DISTINCT tsq.question_id) question_count
    FROM training_sessions ts
    JOIN training_session_questions tsq ON tsq.session_id=ts.id
    JOIN questions q ON q.id=tsq.question_id
    WHERE ts.user_id=? AND q.subject_id=? AND q.exam_line=?
    GROUP BY ts.id,ts.status,ts.mode,ts.created_at
    ORDER BY ts.id DESC LIMIT 30`, userId, sid, line);
}

async function recentReviewSessions(db, userId, sid) {
  if (!sid) return [];
  return db.rows(`SELECT ts.id,ts.status,ts.mode,ts.created_at,COUNT(DISTINCT tsq.question_id) question_count
    FROM training_sessions ts
    JOIN training_session_questions tsq ON tsq.session_id=ts.id
    JOIN questions q ON q.id=tsq.question_id
    WHERE ts.user_id=? AND q.subject_id=? AND ts.mode='review'
    GROUP BY ts.id,ts.status,ts.mode,ts.created_at
    ORDER BY ts.id DESC LIMIT 30`, userId, sid);
}

function sessionState(list) {
  const today = dayKey();
  const todaySessions = list.filter(item => dayKey(item.created_at) === today);
  const completed = todaySessions.find(item => item.status === 'completed');
  const active = todaySessions.find(item => item.status === 'active');
  return {
    done: Boolean(completed),
    started: Boolean(completed || active),
    sessionId: Number((completed || active)?.id || 0) || null,
    questionCount: Number((completed || active)?.question_count || 0),
  };
}

async function reviewDue(db, userId, sid) {
  const latest = await db.rows(`WITH latest AS (
      SELECT a.*,ROW_NUMBER() OVER(PARTITION BY a.question_id ORDER BY a.id DESC) rn
      FROM attempts a WHERE a.user_id=?
    )
    SELECT l.correct,l.next_review_at
    FROM latest l JOIN questions q ON q.id=l.question_id
    WHERE l.rn=1 AND q.subject_id=? AND q.active=1 AND q.published=1
      AND (l.correct=0 OR l.next_review_at<=CURRENT_TIMESTAMP)
    LIMIT 250`, userId, sid);
  return {
    count: latest.length,
    wrong: latest.filter(item => !isCorrect(item.correct)).length,
  };
}

function stepStatus(done, started = false) {
  return done ? 'done' : started ? 'active' : 'pending';
}

async function buildTutorDay(db, userId, subjectSlug, plan) {
  if (!plan) return null;
  const sid = await subjectId(db, subjectSlug);
  if (!sid) return null;
  const mission = missionFromPlan(plan);
  if (!mission) return null;
  const due = await reviewDue(db, userId, sid);

  if (mission.rest) {
    const reviewSessions = sessionState(await recentReviewSessions(db, userId, sid));
    const steps = due.count ? [{
      key: 'review', title: 'Короткое повторение', description: `${due.count} заданий подошли к повторению`, minutes: Math.min(20, Math.max(8, due.count * 2)), count: Math.min(10, due.count), status: stepStatus(reviewSessions.done, reviewSessions.started), sessionId: reviewSessions.sessionId,
    }] : [];
    return {
      date: dayKey(), subjectSlug, rest: true, title: steps.length ? 'Лёгкий день: закрепляем без перегруза' : 'Сегодня восстановление', reason: steps.length ? 'Новых тяжёлых тем нет — только то, что важно не забыть.' : 'План специально оставляет день без обязательной нагрузки.', steps, progress: steps.length && steps[0].status === 'done' ? 100 : steps.length ? 0 : 100, nextStep: steps.find(step => step.status !== 'done') || null, completed: !steps.length || steps.every(step => step.status === 'done'), dueReviewCount: due.count,
    };
  }

  const lesson = await lessonForLine(db, sid, Number(mission.line));
  const [theory, practiceSessions, reviewSessions] = await Promise.all([
    theoryState(db, userId, lesson),
    recentLineSessions(db, userId, sid, Number(mission.line)),
    recentReviewSessions(db, userId, sid),
  ]);
  const practice = sessionState(practiceSessions);
  const review = sessionState(reviewSessions);
  const steps = [
    {
      key: 'theory', title: 'Разобрать основу', description: lesson ? `${lesson.topic_title} → ${lesson.title}` : `Коротко повторить теорию по линии ${mission.line}`, minutes: Number(mission.theoryMinutes || 10), status: stepStatus(theory.done), lessonId: Number(lesson?.id || 0) || null, available: theory.available,
    },
    {
      key: 'practice', title: 'Закрепить на заданиях', description: `Линия ${mission.line} · ${mission.questions || 8} заданий под текущий уровень`, minutes: Number(mission.practiceMinutes || 25), count: Number(mission.questions || 8), line: Number(mission.line), status: stepStatus(practice.done, practice.started), sessionId: practice.sessionId,
    },
  ];
  if (due.count) {
    steps.push({
      key: 'review', title: 'Вернуть ошибки в память', description: `${due.wrong} ошибок и ${due.count} заданий к повторению`, minutes: Number(mission.reviewMinutes || 10), count: Math.min(12, due.count), status: stepStatus(review.done, review.started), sessionId: review.sessionId,
    });
  }
  const doneCount = steps.filter(step => step.status === 'done').length;
  const nextStep = steps.find(step => step.status !== 'done') || null;
  return {
    date: dayKey(), subjectSlug, rest: false, line: Number(mission.line), title: mission.title || `Линия ${mission.line}`, reason: mission.reason || 'Репетитор выбрал этот блок по текущему риску потери баллов.', totalMinutes: steps.reduce((sum, step) => sum + Number(step.minutes || 0), 0), steps, progress: Math.round(doneCount / Math.max(1, steps.length) * 100), nextStep, completed: doneCount === steps.length, dueReviewCount: due.count, readiness: Number(plan.readiness || 0), coverage: Number(plan.coverage || 0), targetScore: Number(plan.targetScore || 0), scoreRange: plan.scoreRange || null,
  };
}

module.exports = { dayKey, missionFromPlan, buildTutorDay };
