CREATE TABLE biology_mock_exam_attempts (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT 'biology', exam_year INTEGER NOT NULL, source_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('timed','untimed')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted','expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, submitted_at TIMESTAMPTZ, duration_seconds INTEGER,
  variant_seed TEXT NOT NULL, auto_primary_score INTEGER, self_primary_score INTEGER NOT NULL DEFAULT 0,
  primary_score_total INTEGER, primary_score_max INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE biology_mock_exam_items (
  id BIGSERIAL PRIMARY KEY, attempt_id BIGINT NOT NULL REFERENCES biology_mock_exam_attempts(id) ON DELETE CASCADE,
  question_id BIGINT REFERENCES questions(id) ON DELETE SET NULL, position INTEGER NOT NULL, exam_line INTEGER NOT NULL,
  part INTEGER NOT NULL, answer_format TEXT NOT NULL, max_score INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL, answer_json TEXT, flagged BOOLEAN NOT NULL DEFAULT FALSE,
  auto_score INTEGER, self_score INTEGER, answered_at TIMESTAMPTZ,
  UNIQUE(attempt_id,position), UNIQUE(attempt_id,question_id)
);
CREATE INDEX idx_mock_attempt_user_status ON biology_mock_exam_attempts(user_id,status,started_at DESC);
CREATE INDEX idx_mock_item_attempt ON biology_mock_exam_items(attempt_id,position);
