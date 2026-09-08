CREATE TABLE ai_usage_daily (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, usage_date)
);
CREATE INDEX idx_ai_usage_daily_date ON ai_usage_daily(usage_date);
