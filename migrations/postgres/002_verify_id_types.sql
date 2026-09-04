-- PostgreSQL does not implicitly compare numeric identifiers with text.  Keep
-- this check as a migration guard so a schema imported from SQLite cannot run
-- with silently incompatible relationship columns.  It is read-only and is
-- therefore safe for an existing production database.
DO $$
DECLARE
  relation RECORD;
  parent_type TEXT;
  child_type TEXT;
BEGIN
  FOR relation IN
    SELECT * FROM (VALUES
      ('users', 'id', 'sessions', 'user_id'),
      ('users', 'id', 'attempts', 'user_id'),
      ('users', 'id', 'topic_progress', 'user_id'),
      ('users', 'id', 'activity_days', 'user_id'),
      ('users', 'id', 'lesson_progress', 'user_id'),
      ('users', 'id', 'training_sessions', 'user_id'),
      ('subjects', 'id', 'topics', 'subject_id'),
      ('subjects', 'id', 'skills', 'subject_id'),
      ('topics', 'id', 'topics', 'parent_id'),
      ('topics', 'id', 'questions', 'topic_id'),
      ('topics', 'id', 'topic_progress', 'topic_id'),
      ('topics', 'id', 'lesson_progress', 'lesson_id'),
      ('topics', 'id', 'training_sessions', 'topic_id'),
      ('questions', 'id', 'question_options', 'question_id'),
      ('questions', 'id', 'attempts', 'question_id'),
      ('questions', 'id', 'question_skills', 'question_id'),
      ('questions', 'id', 'training_session_questions', 'question_id'),
      ('skills', 'id', 'question_skills', 'skill_id'),
      ('training_sessions', 'id', 'training_session_questions', 'session_id'),
      ('attempts', 'id', 'training_session_questions', 'attempt_id')
    ) AS links(parent_table, parent_column, child_table, child_column)
  LOOP
    SELECT data_type INTO parent_type FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name=relation.parent_table AND column_name=relation.parent_column;
    SELECT data_type INTO child_type FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name=relation.child_table AND column_name=relation.child_column;
    IF parent_type IS NULL OR child_type IS NULL OR parent_type <> child_type THEN
      RAISE EXCEPTION 'Incompatible id types: %.% (%) and %.% (%)',
        relation.parent_table, relation.parent_column, parent_type,
        relation.child_table, relation.child_column, child_type;
    END IF;
  END LOOP;
END $$;
