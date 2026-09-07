-- One-time safe owner bootstrap for an existing production database.
-- If the site has no administrator yet, the oldest registered account becomes the owner.
UPDATE users
SET role='admin'
WHERE id=(SELECT MIN(id) FROM users)
  AND NOT EXISTS (SELECT 1 FROM users WHERE role='admin');
