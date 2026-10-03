-- Local (email + password) auth on Postgres: self-hosted installs on Railway,
-- Fly.io or any managed Postgres can now use built-in accounts instead of
-- Supabase Auth. Nullable: Supabase-managed users never have one.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
