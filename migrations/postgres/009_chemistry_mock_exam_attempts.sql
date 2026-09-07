CREATE TABLE chemistry_mock_exam_attempts (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_year INTEGER NOT NULL, source_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('timed','untimed')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted','expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, submitted_at TIMESTAMPTZ, duration_seconds INTEGER,
  variant_seed TEXT NOT NULL, auto_primary_score INTEGER, self_primary_score INTEGER NOT NULL DEFAULT 0,
  primary_score_total INTEGER, primary_score_max INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE chemistry_mock_exam_items (
  id BIGSERIAL PRIMARY KEY, attempt_id BIGINT NOT NULL REFERENCES chemistry_mock_exam_attempts(id) ON DELETE CASCADE,
  question_id BIGINT REFERENCES questions(id) ON DELETE SET NULL, position INTEGER NOT NULL, exam_line INTEGER NOT NULL,
  part INTEGER NOT NULL, answer_format TEXT NOT NULL, max_score INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL, answer_json TEXT, flagged BOOLEAN NOT NULL DEFAULT FALSE,
  auto_score INTEGER, self_score INTEGER, answered_at TIMESTAMPTZ,
  UNIQUE(attempt_id,position)
);
CREATE INDEX idx_chem_mock_attempt_user_status ON chemistry_mock_exam_attempts(user_id,status,started_at DESC);
CREATE INDEX idx_chem_mock_item_attempt ON chemistry_mock_exam_items(attempt_id,position);
