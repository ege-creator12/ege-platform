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
