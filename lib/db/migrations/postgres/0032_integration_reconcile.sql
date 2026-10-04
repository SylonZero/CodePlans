ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "last_reconciled_at" timestamp with time zone;
