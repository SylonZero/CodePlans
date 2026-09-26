CREATE TABLE IF NOT EXISTS "spec_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spec_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"spec_type" text NOT NULL,
	"area" text,
	"status" text NOT NULL,
	"change_summary" text,
	"created_by_id" uuid,
	"created_by_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spec_revisions" ADD CONSTRAINT "spec_revisions_spec_id_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "public"."specs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "spec_revisions" ADD CONSTRAINT "spec_revisions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spec_revisions_version_idx" ON "spec_revisions" USING btree ("spec_id","version");
--> statement-breakpoint
-- Seed each existing spec's current version. Earlier bodies were never stored and cannot be recovered.
INSERT INTO "spec_revisions" ("spec_id", "version", "title", "body", "spec_type", "area", "status", "change_summary", "created_by_id", "created_by_kind", "created_at")
SELECT "id", "version", "title", "body", "spec_type", "area", "status", 'Snapshot taken when revision history was enabled', "updated_by_id", "updated_by_kind", "updated_at" FROM "specs";
