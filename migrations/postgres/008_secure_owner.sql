-- RELEASE SECURITY: intentionally no-op.
-- Historical demo/owner recovery logic previously promoted the first non-demo user.
-- Fresh installations must not grant administrator privileges implicitly.
SELECT 1;
