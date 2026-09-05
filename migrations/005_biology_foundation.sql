-- Additive content-governance migration. No learner-owned row is updated or removed.
CREATE TABLE lesson_blocks_v2 (
  id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('text','heading','definition','remember','important','example','exam_example','ege_example','exam_trap','formula','reaction','table','list','image','diagram','comparison','algorithm','experiment','deep_dive','note','quiz','summary')),
  content_json TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0, UNIQUE(lesson_id,position)
);
INSERT INTO lesson_blocks_v2(id,lesson_id,type,content_json,position) SELECT id,lesson_id,type,content_json,position FROM lesson_blocks;
DROP TABLE lesson_blocks;
ALTER TABLE lesson_blocks_v2 RENAME TO lesson_blocks;
CREATE INDEX idx_lesson_blocks_lesson ON lesson_blocks(lesson_id,position);
ALTER TABLE lessons ADD COLUMN codifier_code TEXT;
ALTER TABLE lessons ADD COLUMN exam_lines_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE lessons ADD COLUMN skills_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE lessons ADD COLUMN content_status TEXT NOT NULL DEFAULT 'draft' CHECK(content_status IN ('draft','review','verified'));
ALTER TABLE lessons ADD COLUMN is_ege_required INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lessons ADD COLUMN is_beyond_ege INTEGER NOT NULL DEFAULT 0;

ALTER TABLE questions ADD COLUMN codifier_code TEXT;
ALTER TABLE questions ADD COLUMN skills_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE questions ADD COLUMN solution_steps_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE questions ADD COLUMN max_score INTEGER NOT NULL DEFAULT 1;
ALTER TABLE questions ADD COLUMN content_status TEXT NOT NULL DEFAULT 'draft' CHECK(content_status IN ('draft','review','verified','legacy'));
ALTER TABLE questions ADD COLUMN image_url TEXT;

CREATE TABLE exam_spec_items (
  id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_year INTEGER NOT NULL, codifier_code TEXT NOT NULL, title TEXT NOT NULL,
  parent_code TEXT, exam_lines_json TEXT NOT NULL DEFAULT '[]', skills_json TEXT NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL DEFAULT 'base', is_ege_required INTEGER NOT NULL DEFAULT 1,
  source_version TEXT NOT NULL, content_status TEXT NOT NULL DEFAULT 'draft' CHECK(content_status IN ('draft','review','verified')),
  UNIQUE(subject_id,exam_year,codifier_code)
);
CREATE TABLE content_coverage (
  id INTEGER PRIMARY KEY, spec_item_id INTEGER NOT NULL REFERENCES exam_spec_items(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('topic','lesson','block','question')),
  entity_id INTEGER NOT NULL, coverage_kind TEXT NOT NULL CHECK(coverage_kind IN ('theory','practice')),
  UNIQUE(spec_item_id,entity_type,entity_id,coverage_kind)
);
CREATE TABLE media_assets (
  id INTEGER PRIMARY KEY, external_key TEXT NOT NULL UNIQUE, path TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/svg+xml','image/png','image/webp')),
  alt_text TEXT NOT NULL, width INTEGER, height INTEGER, metadata_json TEXT NOT NULL DEFAULT '{}',
  content_status TEXT NOT NULL DEFAULT 'draft' CHECK(content_status IN ('draft','review','verified'))
);
CREATE INDEX idx_exam_spec_year_code ON exam_spec_items(subject_id,exam_year,codifier_code);
CREATE INDEX idx_coverage_spec_kind ON content_coverage(spec_item_id,coverage_kind);
CREATE INDEX idx_questions_codifier ON questions(subject_id,exam_year,codifier_code,content_status);
