CREATE TABLE IF NOT EXISTS ai_study_plans (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_slug TEXT NOT NULL CHECK(subject_slug IN ('biology','chemistry')),
  target_score INTEGER NOT NULL CHECK(target_score BETWEEN 40 AND 100),
  exam_date TEXT NOT NULL,
  days_per_week INTEGER NOT NULL CHECK(days_per_week BETWEEN 1 AND 7),
  minutes_per_day INTEGER NOT NULL CHECK(minutes_per_day BETWEEN 20 AND 300),
  plan_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, subject_slug)
);
CREATE INDEX IF NOT EXISTS idx_ai_study_plans_user ON ai_study_plans(user_id);
