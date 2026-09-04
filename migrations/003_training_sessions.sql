ALTER TABLE questions ADD COLUMN instruction TEXT NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN media_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE questions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE questions ADD COLUMN estimated_seconds INTEGER NOT NULL DEFAULT 90;

-- Repeat the idempotent learning-flow tables here so databases that had the
-- original 002 migration before this feature was introduced are upgraded too.
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(subject_id, slug)
);
CREATE TABLE IF NOT EXISTS question_skills (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 1 CHECK(weight > 0),
  PRIMARY KEY(question_id, skill_id)
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','completed')),
  theory_read INTEGER NOT NULL DEFAULT 0 CHECK(theory_read IN (0,1)),
  questions_solved INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  last_activity_at TEXT,
  completed_at TEXT,
  PRIMARY KEY(user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_skills_subject_position ON skills(subject_id,position);
CREATE INDEX IF NOT EXISTS idx_question_skills_skill ON question_skills(skill_id,question_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_status ON lesson_progress(user_id,status);

CREATE TABLE IF NOT EXISTS training_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'adaptive'
    CHECK(mode IN ('adaptive','new','review','mistakes','topic')),
  target_questions INTEGER NOT NULL DEFAULT 10 CHECK(target_questions BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','completed','abandoned')),
  correct_count INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS training_session_questions (
  session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending','answered','skipped')),
  attempt_id INTEGER REFERENCES attempts(id) ON DELETE SET NULL,
  presented_at TEXT,
  answered_at TEXT,
  PRIMARY KEY(session_id, position),
  UNIQUE(session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_user_status ON training_sessions(user_id,status,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_questions_next ON training_session_questions(session_id,state,position);
