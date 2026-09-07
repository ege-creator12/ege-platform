-- Local/SQLite equivalent of the production owner recovery.
UPDATE users
SET role='student'
WHERE lower(email) IN ('admin@ege.local','student@ege.local');

UPDATE users
SET role='admin'
WHERE id=(
  SELECT MIN(id)
  FROM users
  WHERE lower(email) NOT LIKE '%@ege.local'
);
