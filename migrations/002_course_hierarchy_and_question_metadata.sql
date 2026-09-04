ALTER TABLE topics ADD COLUMN kind TEXT NOT NULL DEFAULT 'topic' CHECK(kind IN ('section','topic','subtopic','lesson'));
ALTER TABLE topics ADD COLUMN depth INTEGER NOT NULL DEFAULT 0 CHECK(depth BETWEEN 0 AND 3);
ALTER TABLE topics ADD COLUMN content_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE questions ADD COLUMN source TEXT NOT NULL DEFAULT 'own';
ALTER TABLE questions ADD COLUMN is_original INTEGER NOT NULL DEFAULT 1;
ALTER TABLE questions ADD COLUMN skill_tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE questions ADD COLUMN generator_key TEXT;
ALTER TABLE questions ADD COLUMN generator_params_json TEXT;
ALTER TABLE questions ADD COLUMN external_id TEXT;

ALTER TABLE attempts ADD COLUMN ease_factor REAL NOT NULL DEFAULT 2.5;
ALTER TABLE attempts ADD COLUMN repetition INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN lapse_count INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_external_id ON questions(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topics_parent_position ON topics(parent_id,position);
CREATE INDEX IF NOT EXISTS idx_attempts_review_queue ON attempts(user_id,next_review_at,question_id);
