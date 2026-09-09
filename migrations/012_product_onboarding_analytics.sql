CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subject_slug TEXT NOT NULL DEFAULT 'biology' CHECK(subject_slug IN ('biology','chemistry')),
  current_score INTEGER NOT NULL DEFAULT 40 CHECK(current_score BETWEEN 0 AND 100),
  target_score INTEGER NOT NULL DEFAULT 80 CHECK(target_score BETWEEN 40 AND 100),
  exam_date TEXT,
  days_per_week INTEGER NOT NULL DEFAULT 5 CHECK(days_per_week BETWEEN 1 AND 7),
  minutes_per_day INTEGER NOT NULL DEFAULT 60 CHECK(minutes_per_day BETWEEN 20 AND 300),
  diagnostic_session_id INTEGER,
  diagnostic_started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  route TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_events_user_created ON product_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_name_created ON product_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_user_created_analytics ON attempts(user_id, created_at DESC);
