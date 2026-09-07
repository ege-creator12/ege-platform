-- Keep the local SQLite owner recovery aligned with production.
-- Demo accounts must never retain administrator privileges.
UPDATE users
SET role='student'
WHERE lower(email) IN ('admin@ege.local','student@ege.local');

-- Grant administrator access to the first real registered account.
UPDATE users
SET role='admin'
WHERE id=(
  SELECT MIN(id)
  FROM users
  WHERE lower(email) NOT LIKE '%@ege.local'
);
