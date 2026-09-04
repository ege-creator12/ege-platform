const VALID_MODES = new Set(['mixed','new','errors','hard','infinite']);

function normalizeSession(input = {}) {
  const mode = VALID_MODES.has(input.mode) ? input.mode : 'mixed';
  const allowedCounts = new Set([10,20]);
  const count = mode === 'infinite' ? 0 : (allowedCounts.has(Number(input.count)) ? Number(input.count) : 10);
  return { mode, count, topicId: Math.max(0, Number(input.topicId) || 0) };
}

function candidateSql(mode) {
  const filters = {
    new: 'AND history.tries IS NULL',
    errors: 'AND history.wrong > 0',
    hard: "AND q.difficulty_level IN ('high','ege')",
    mixed: '', infinite: ''
  };
  return `WITH RECURSIVE tree(id) AS (
    SELECT ? UNION ALL SELECT t.id FROM topics t JOIN tree ON t.parent_id=tree.id
  ), history AS (
    SELECT question_id,COUNT(*) tries,SUM(correct=0) wrong,MAX(created_at) last_try,
      MAX(CASE WHEN correct=0 THEN 1 ELSE 0 END) has_error,MAX(next_review_at) next_review
    FROM attempts WHERE user_id=? GROUP BY question_id
  ), weak AS (
    SELECT qs.question_id,COALESCE(AVG(a.correct),0.5) skill_score
    FROM question_skills qs LEFT JOIN attempts a ON a.question_id=qs.question_id AND a.user_id=? GROUP BY qs.question_id
  )
  SELECT q.id FROM questions q LEFT JOIN history ON history.question_id=q.id LEFT JOIN weak ON weak.question_id=q.id
  WHERE q.active=1 AND (?=0 OR q.topic_id IN tree) ${filters[mode]}
  ORDER BY CASE WHEN history.tries IS NULL THEN 0 WHEN history.has_error=1 AND history.next_review<=datetime('now') THEN 1 ELSE 2 END,
    COALESCE(weak.skill_score,0.5),COALESCE(history.last_try,'1970-01-01'),RANDOM() LIMIT ?`;
}

function selectQuestions(db, userId, config, exclude = []) {
  const limit = config.count || 1;
  const selected = db.rows(candidateSql(config.mode), config.topicId, userId, userId, config.topicId, Math.max(limit + exclude.length, limit));
  return selected.map(item => item.id).filter(id => !exclude.includes(id)).slice(0, limit);
}

module.exports = { normalizeSession, selectQuestions };
