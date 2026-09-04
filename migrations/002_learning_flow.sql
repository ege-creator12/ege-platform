ALTER TABLE topics ADD COLUMN kind TEXT NOT NULL DEFAULT 'topic'
  CHECK(kind IN ('section','topic','subtopic','lesson'));
ALTER TABLE topics ADD COLUMN published INTEGER NOT NULL DEFAULT 1;

ALTER TABLE questions ADD COLUMN content_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE questions ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN exam_line INTEGER;
ALTER TABLE questions ADD COLUMN points INTEGER NOT NULL DEFAULT 1;

ALTER TABLE attempts ADD COLUMN review_stage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN result_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_topics_parent_position ON topics(parent_id,position);
CREATE INDEX IF NOT EXISTS idx_attempts_user_created ON attempts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_due ON attempts(user_id,next_review_at);

-- Skills are deliberately separate from the curriculum tree: one question can
-- train several transferable skills and a skill can occur in many lessons.
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
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK(status IN ('not_started','in_progress','completed')),
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
