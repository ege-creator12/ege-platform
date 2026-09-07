-- Production owner recovery and demo-account hardening.
-- Demo accounts must never keep administrator privileges in a real database.
UPDATE users
SET role='student'
WHERE lower(email) IN ('admin@ege.local','student@ege.local');

-- The first real registered account is the platform owner.
UPDATE users
SET role='admin'
WHERE id=(
  SELECT MIN(id)
  FROM users
  WHERE lower(email) NOT LIKE '%@ege.local'
);
