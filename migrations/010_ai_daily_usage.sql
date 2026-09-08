CREATE TABLE ai_daily_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
  PRIMARY KEY(user_id, usage_date)
);
CREATE INDEX idx_ai_daily_usage_date ON ai_daily_usage(usage_date);
