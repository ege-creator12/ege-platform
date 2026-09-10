'use strict';

const DAY = 86400000;
const subjects = new Set(['biology', 'chemistry']);

const num = value => Number(value || 0);
const pct = (correct, total) => total ? Math.round(correct / total * 100) : 0;
const isoDate = value => new Date(value).toISOString().slice(0, 10);
const ago = days => new Date(Date.now() - days * DAY).toISOString();

function normalizeOnboarding(input = {}) {
  const subjectSlug = subjects.has(input.subjectSlug) ? input.subjectSlug : 'biology';
  const currentScore = Math.max(0, Math.min(100, Math.round(num(input.currentScore) || 40)));
  const targetScore = Math.max(40, Math.min(100, Math.round(num(input.targetScore) || 80)));
  const daysPerWeek = Math.max(1, Math.min(7, Math.round(num(input.daysPerWeek) || 5)));
  const minutesPerDay = Math.max(20, Math.min(300, Math.round(num(input.minutesPerDay) || 60)));
  const examDate = String(input.examDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || Date.parse(`${examDate}T12:00:00`) <= Date.now()) {
    const error = new Error('Укажите будущую дату ЕГЭ');
    error.status = 400;
    throw error;
  }
  return { subjectSlug, currentScore, targetScore, examDate, daysPerWeek, minutesPerDay };
}

function chooseDiagnosticQuestions(rows=[],count=8){
  const candidates=rows.map((row,index)=>({
    id:num(row.id),line:num(row.exam_line),difficulty:Math.max(1,Math.min(3,num(row.difficulty)||1)),
    estimatedSeconds:Math.max(0,num(row.estimated_seconds)),index,
  })).filter(row=>row.id&&row.line);
  const limit=Math.max(1,Math.round(num(count)||8)),uniqueLines=[...new Set(candidates.map(row=>row.line))].sort((a,b)=>a-b);
  if(!uniqueLines.length)return [];
  const maxLine=Math.max(...uniqueLines),bucketCount=Math.min(limit,uniqueLines.length),difficultyPlan=[1,1,2,1,2,2,3,3];
  const chosen=[],usedIds=new Set(),usedLines=new Set();
  for(let bucket=0;bucket<bucketCount;bucket++){
    const from=Math.floor(bucket*maxLine/bucketCount)+1,to=Math.floor((bucket+1)*maxLine/bucketCount),target=difficultyPlan[bucket%difficultyPlan.length];
    const available=candidates.filter(row=>row.line>=from&&row.line<=to&&!usedIds.has(row.id)&&!usedLines.has(row.line))
      .sort((a,b)=>Math.abs(a.difficulty-target)-Math.abs(b.difficulty-target)||(a.estimatedSeconds||999)-(b.estimatedSeconds||999)||a.index-b.index);
    const item=available[0];if(!item)continue;chosen.push({id:item.id,line:item.line});usedIds.add(item.id);usedLines.add(item.line);
  }
  for(const item of candidates){
    if(chosen.length>=limit)break;
    if(usedIds.has(item.id)||usedLines.has(item.line))continue;
    chosen.push({id:item.id,line:item.line});usedIds.add(item.id);usedLines.add(item.line);
  }
  return chosen.slice(0,limit);
}

function fillDailySeries(rows = [], days = 14, now = new Date()) {
  const byDay = new Map(rows.map(row => [String(row.day).slice(0, 10), {
    attempts: num(row.attempts), correct: num(row.correct), seconds: num(row.seconds),
  }]));
  const result = [];
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(today.getTime() - offset * DAY);
    const day = isoDate(d);
    const item = byDay.get(day) || { attempts: 0, correct: 0, seconds: 0 };
    result.push({ day, ...item, accuracy: pct(item.correct, item.attempts), minutes: Math.round(item.seconds / 60) });
  }
  return result;
}

function streakFromSeries(series = []) {
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (num(series[i].attempts) <= 0) break;
    streak++;
  }
  return streak;
}

async function aggregateWindow(db, userId, startIso, subjectSlug = '') {
  const filter = subjectSlug ? ' AND s.slug=?' : '';
  const params = subjectSlug ? [userId, startIso, subjectSlug] : [userId, startIso];
  const row = await db.row(`SELECT COUNT(*) attempts,
      COALESCE(SUM(CASE WHEN a.correct=1 THEN 1 ELSE 0 END),0) correct,
      COALESCE(ROUND(AVG(a.correct)*100),0) accuracy,
      COALESCE(ROUND(AVG(CASE WHEN a.duration_seconds>0 THEN a.duration_seconds END)),0) avg_seconds,
      COALESCE(SUM(COALESCE(a.duration_seconds,0)),0) seconds
    FROM attempts a
    JOIN questions q ON q.id=a.question_id
    JOIN subjects s ON s.id=q.subject_id
    WHERE a.user_id=? AND a.created_at>=?${filter}`, ...params);
  return {
    attempts: num(row?.attempts), correct: num(row?.correct), accuracy: num(row?.accuracy),
    avgSeconds: num(row?.avg_seconds), minutes: Math.round(num(row?.seconds) / 60),
  };
}

async function collectAnalytics(db, userId, subjectSlug = '') {
  const subject = subjects.has(subjectSlug) ? subjectSlug : '';
  const start30 = ago(30), start14 = ago(14), start7 = ago(7), previous14 = ago(14);
  const filter = subject ? ' AND s.slug=?' : '';
  const dailyParams = subject ? [userId, start30, subject] : [userId, start30];
  const weakParams = subject ? [userId, start30, subject] : [userId, start30];
  const sessionStart = start30;

  const [window30, current7, previous7, dailyRows, weakRows, subjectRows, sessions, onboarding] = await Promise.all([
    aggregateWindow(db, userId, start30, subject),
    aggregateWindow(db, userId, start7, subject),
    aggregateWindow(db, userId, previous14, subject).then(async fourteen => {
      const current = await aggregateWindow(db, userId, start7, subject);
      const attempts = Math.max(0, fourteen.attempts - current.attempts);
      const correct = Math.max(0, fourteen.correct - current.correct);
      return { attempts, correct, accuracy: pct(correct, attempts), minutes: Math.max(0, fourteen.minutes - current.minutes) };
    }),
    db.rows(`SELECT SUBSTR(CAST(a.created_at AS TEXT),1,10) AS "day",COUNT(*) attempts,
        COALESCE(SUM(CASE WHEN a.correct=1 THEN 1 ELSE 0 END),0) correct,
        COALESCE(SUM(COALESCE(a.duration_seconds,0)),0) seconds
      FROM attempts a JOIN questions q ON q.id=a.question_id JOIN subjects s ON s.id=q.subject_id
      WHERE a.user_id=? AND a.created_at>=?${filter}
      GROUP BY SUBSTR(CAST(a.created_at AS TEXT),1,10)
      ORDER BY "day"`, ...dailyParams),
    db.rows(`SELECT s.slug subject_slug,q.exam_line,COUNT(*) attempted,
        COALESCE(SUM(CASE WHEN a.correct=1 THEN 1 ELSE 0 END),0) correct,
        COALESCE(ROUND(AVG(a.correct)*100),0) accuracy,
        COALESCE(ROUND(AVG(CASE WHEN a.duration_seconds>0 THEN a.duration_seconds END)),0) avg_seconds
      FROM attempts a JOIN questions q ON q.id=a.question_id JOIN subjects s ON s.id=q.subject_id
      WHERE a.user_id=? AND a.created_at>=? AND q.exam_line IS NOT NULL${filter}
      GROUP BY s.slug,q.exam_line
      HAVING COUNT(*)>=2
      ORDER BY accuracy ASC,attempted DESC
      LIMIT 8`, ...weakParams),
    db.rows(`SELECT s.slug subject_slug,COUNT(*) attempts,
        COALESCE(SUM(CASE WHEN a.correct=1 THEN 1 ELSE 0 END),0) correct,
        COALESCE(ROUND(AVG(a.correct)*100),0) accuracy
      FROM attempts a JOIN questions q ON q.id=a.question_id JOIN subjects s ON s.id=q.subject_id
      WHERE a.user_id=? AND a.created_at>=?
      GROUP BY s.slug ORDER BY attempts DESC`, userId, start30),
    db.rows(`SELECT status,COUNT(*) n FROM training_sessions WHERE user_id=? AND started_at>=? GROUP BY status`, userId, sessionStart),
    db.row('SELECT * FROM user_onboarding WHERE user_id=?', userId),
  ]);

  const daily = fillDailySeries(dailyRows, 30);
  const activeDays = daily.filter(day => day.attempts > 0).length;
  const last14 = daily.slice(-14);
  const streak = streakFromSeries(daily);
  const sessionMap = Object.fromEntries(sessions.map(item => [item.status, num(item.n)]));
  const completedSessions = num(sessionMap.completed);
  const abandonedSessions = num(sessionMap.abandoned);
  const startedSessions = completedSessions + abandonedSessions + num(sessionMap.active);

  return {
    subject: subject || 'all',
    generatedAt: new Date().toISOString(),
    summary: {
      last7: current7,
      last30: window30,
      previous7,
      accuracyDelta7: current7.accuracy - previous7.accuracy,
      attemptsDelta7: current7.attempts - previous7.attempts,
      activeDays,
      consistency: Math.round(activeDays / 30 * 100),
      streak,
      avgAttemptsPerActiveDay: activeDays ? Math.round(window30.attempts / activeDays * 10) / 10 : 0,
    },
    daily: last14,
    weakLines: weakRows.map(row => ({
      subjectSlug: row.subject_slug,
      line: num(row.exam_line), attempted: num(row.attempted), correct: num(row.correct),
      accuracy: num(row.accuracy), avgSeconds: num(row.avg_seconds),
    })),
    subjects: subjectRows.map(row => ({
      subjectSlug: row.subject_slug, attempts: num(row.attempts), correct: num(row.correct), accuracy: num(row.accuracy),
    })),
    sessions: { started: startedSessions, completed: completedSessions, abandoned: abandonedSessions, active: num(sessionMap.active) },
    onboarding: onboarding ? {
      subjectSlug: onboarding.subject_slug,
      currentScore: num(onboarding.current_score), targetScore: num(onboarding.target_score), examDate: onboarding.exam_date,
      daysPerWeek: num(onboarding.days_per_week), minutesPerDay: num(onboarding.minutes_per_day),
    } : null,
  };
}

module.exports = { normalizeOnboarding, chooseDiagnosticQuestions, fillDailySeries, streakFromSeries, collectAnalytics };
