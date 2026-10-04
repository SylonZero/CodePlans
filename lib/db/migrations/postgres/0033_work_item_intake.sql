-- External intake phase 1: provenance and triage decisions on work items.
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'internal' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "triage_state" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "decline_reason" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "triage_note" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "triaged_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "triaged_by_kind" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "triaged_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "work_items" ADD CONSTRAINT "work_items_triaged_by_id_users_id_fk" FOREIGN KEY ("triaged_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_product_external_key_idx" ON "work_items" USING btree ("product_id","external_key");
--> statement-breakpoint
-- Items already imported from a tracker (or carrying an external key) become
-- external reports. Ones the team already acted on are accepted; closed ones are
-- declined; the rest wait in triage. Mirrored status is left to the tracker.
UPDATE "work_items" SET
  "origin" = 'external',
  "triage_state" = CASE
    WHEN "status" = 'wont_do' THEN 'declined'
    WHEN "status" IN ('planned', 'in_progress', 'resolved') THEN 'accepted'
    WHEN EXISTS (SELECT 1 FROM "work_item_code_plans" p WHERE p."work_item_id" = "work_items"."id") OR EXISTS (SELECT 1 FROM "spec_links" l WHERE l."target_type" = 'work_item' AND l."target_id" = "work_items"."id") THEN 'accepted'
    ELSE 'untriaged' END,
  "triage_note" = CASE
    WHEN "status" = 'wont_do' THEN 'Closed as won''t do before triage existed (set by migration).'
    WHEN "status" IN ('planned', 'in_progress', 'resolved') THEN 'Already planned, in progress or resolved when triage was introduced (set by migration).'
    WHEN EXISTS (SELECT 1 FROM "work_item_code_plans" p WHERE p."work_item_id" = "work_items"."id") OR EXISTS (SELECT 1 FROM "spec_links" l WHERE l."target_type" = 'work_item' AND l."target_id" = "work_items"."id") THEN 'Already linked to a plan or spec when triage was introduced (set by migration).'
    ELSE NULL END
WHERE ("source" <> 'native' OR "external_key" IS NOT NULL) AND "triage_state" IS NULL;
--> statement-breakpoint
UPDATE "work_items" SET "triaged_by_kind" = 'system', "triaged_at" = now()
WHERE "triage_state" IN ('accepted', 'declined') AND "triaged_at" IS NULL AND "triage_note" LIKE '%(set by migration).';
