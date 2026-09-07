-- Ensure the platform owner account has administrator access.
-- The oldest registered account is treated as the owner; existing admins are preserved.
UPDATE users
SET role='admin'
WHERE id=(SELECT MIN(id) FROM users);
