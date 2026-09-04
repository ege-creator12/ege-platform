ALTER TABLE subjects ADD COLUMN exam_year INTEGER NOT NULL DEFAULT 2027;
ALTER TABLE subjects ADD COLUMN published INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subjects ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subjects ADD COLUMN source_version TEXT NOT NULL DEFAULT 'osnova-2027-draft';
ALTER TABLE subjects ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subjects ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE sections (
  id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1, exam_year INTEGER NOT NULL DEFAULT 2027,
  source_version TEXT NOT NULL DEFAULT 'osnova-2027-draft', content_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(subject_id,slug)
);
CREATE TABLE lessons (
  id INTEGER PRIMARY KEY, topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', estimated_minutes INTEGER NOT NULL DEFAULT 15,
  difficulty TEXT NOT NULL DEFAULT 'base', exam_year INTEGER NOT NULL DEFAULT 2027, published INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0, source_version TEXT NOT NULL DEFAULT 'osnova-2027-draft',
  content_version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(topic_id,slug)
);
CREATE TABLE lesson_blocks (
  id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('text','heading','definition','remember','important','example','exam_example','exam_trap','formula','reaction','table','list','image','diagram','comparison','algorithm','note','quiz','summary')),
  content_json TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0, UNIQUE(lesson_id,position)
);
CREATE TABLE content_sources (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, source_type TEXT NOT NULL,
  source_version TEXT NOT NULL, exam_year INTEGER NOT NULL DEFAULT 2027, url TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE topics ADD COLUMN section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE topics ADD COLUMN exam_year INTEGER NOT NULL DEFAULT 2027;
ALTER TABLE topics ADD COLUMN source_version TEXT NOT NULL DEFAULT 'osnova-2027-draft';
ALTER TABLE topics ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE topics ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE questions ADD COLUMN subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE;
ALTER TABLE questions ADD COLUMN lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN external_key TEXT;
ALTER TABLE questions ADD COLUMN question_type TEXT NOT NULL DEFAULT 'single_choice';
ALTER TABLE questions ADD COLUMN answer_data_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE questions ADD COLUMN explanation_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE questions ADD COLUMN source_type TEXT NOT NULL DEFAULT 'original';
ALTER TABLE questions ADD COLUMN exam_year INTEGER NOT NULL DEFAULT 2027;
ALTER TABLE questions ADD COLUMN published INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lesson_progress ADD COLUMN reading_progress INTEGER NOT NULL DEFAULT 0 CHECK(reading_progress BETWEEN 0 AND 100);
ALTER TABLE lesson_progress ADD COLUMN last_opened_at TEXT;
CREATE UNIQUE INDEX idx_questions_external_key ON questions(external_key);
CREATE INDEX idx_sections_subject ON sections(subject_id,published,position);
CREATE INDEX idx_topics_section ON topics(section_id,published,position);
CREATE INDEX idx_lessons_topic ON lessons(topic_id,published,position);
CREATE INDEX idx_lesson_blocks_lesson ON lesson_blocks(lesson_id,position);
