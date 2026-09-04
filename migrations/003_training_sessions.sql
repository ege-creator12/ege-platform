ALTER TABLE questions ADD COLUMN difficulty_level TEXT NOT NULL DEFAULT 'basic'
  CHECK(difficulty_level IN ('basic','medium','high','ege'));
ALTER TABLE topics ADD COLUMN lesson_content_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS question_skills (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY(question_id,skill_id)
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  reading_progress INTEGER NOT NULL DEFAULT 0 CHECK(reading_progress BETWEEN 0 AND 100),
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,topic_id)
);
CREATE TABLE IF NOT EXISTS training_sessions (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK(mode IN ('mixed','new','errors','hard','infinite')),
  target_count INTEGER NOT NULL DEFAULT 10, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS training_session_questions (
  session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id), position INTEGER NOT NULL,
  attempt_id INTEGER REFERENCES attempts(id),
  PRIMARY KEY(session_id,position), UNIQUE(session_id,question_id)
);
CREATE INDEX IF NOT EXISTS idx_question_skills_skill ON question_skills(skill_id,question_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_user ON training_sessions(user_id,status,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_session_queue ON training_session_questions(session_id,position);
