-- RELEASE SECURITY: intentionally no-op.
-- Administrator privileges must never be granted based on registration order.
-- Existing production databases already record this migration as applied; this file
-- only ensures a fresh install cannot promote an arbitrary first user.
SELECT 1;
