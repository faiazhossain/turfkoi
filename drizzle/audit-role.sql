-- H2: INSERT-only audit role.
--
-- The audit_logs table must be append-only in production. Drizzle can't
-- express row-level grants, so we apply them as raw SQL after the first
-- migration. Apply this in production against the role your app uses for
-- audit-log writes (NOT the app's main DDL role).
--
-- Usage:
--   psql $DATABASE_DIRECT_URL -f drizzle/audit-role.sql
--
-- The role name + password come from secrets manager. Granting is intentionally
-- narrow: SELECT is allowed (for admin audit readers) but UPDATE and DELETE
-- are REVOKE'd.

-- 1. Create the role (idempotent-ish; run once).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_app') THEN
    CREATE ROLE audit_app LOGIN PASSWORD :'audit_app_password';
  END IF;
END
$$;

-- 2. Revoke everything on audit_logs, then grant INSERT + SELECT only.
REVOKE ALL ON audit_logs FROM PUBLIC;
REVOKE ALL ON audit_logs FROM audit_app;

GRANT INSERT, SELECT ON audit_logs TO audit_app;

-- 3. Block UPDATE / DELETE explicitly (defense in depth — revokes any default).
REVOKE UPDATE, DELETE ON audit_logs FROM audit_app;

-- 4. Grant sequence usage if audit_logs has a serial/bigserial id column
--    (currently it uses uuid defaultRandom, so this is a no-op — kept for
--    forward-compat if a sequence is ever added).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO audit_app;
