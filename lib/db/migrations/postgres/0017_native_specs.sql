
CREATE TABLE "specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"spec_type" text NOT NULL,
	"area" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes" uuid,
	"superseded_by" uuid,
	"source_type" text DEFAULT 'native' NOT NULL,
	"source_url" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"author_type" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "specs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "specs_supersedes_specs_id_fk" FOREIGN KEY ("supersedes") REFERENCES "public"."specs"("id") ON UPDATE no action ON DELETE set null,
	CONSTRAINT "specs_superseded_by_specs_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."specs"("id") ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE "spec_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spec_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"spec_title" text NOT NULL,
	"spec_type" text NOT NULL,
	"from_version" integer,
	"to_version" integer NOT NULL,
	"plan_id" uuid,
	"work_item_id" uuid,
	"note_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spec_events_spec_id_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "public"."specs"("id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "spec_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "spec_events_plan_id_code_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."code_plans"("id") ON UPDATE no action ON DELETE set null,
	CONSTRAINT "spec_events_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE no action ON DELETE set null,
	CONSTRAINT "spec_events_note_id_asset_design_log_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."asset_design_log"("id") ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint

CREATE INDEX "spec_events_asset_idx" ON "spec_events" USING btree ("asset_id");--> statement-breakpoint

CREATE TABLE "spec_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spec_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"relationship_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spec_links_spec_id_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "public"."specs"("id") ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE UNIQUE INDEX "spec_links_target_idx" ON "spec_links" USING btree ("spec_id","target_type","target_id");--> statement-breakpoint

CREATE INDEX "spec_links_lookup_idx" ON "spec_links" USING btree ("target_type","target_id");--> statement-breakpoint

CREATE INDEX "specs_product_idx" ON "specs" USING btree ("product_id");--> statement-breakpoint

CREATE UNIQUE INDEX "specs_import_url_idx" ON "specs" USING btree ("product_id","source_url") WHERE "specs"."source_type" = 'git_import' AND "specs"."supersedes" IS NULL;--> statement-breakpoint

ALTER TABLE "asset_capabilities" ADD "source_spec_id" uuid;--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD CONSTRAINT "asset_capabilities_source_spec_id_specs_id_fk" FOREIGN KEY ("source_spec_id") REFERENCES "public"."specs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "asset_capabilities" ADD "source_spec_version" integer;
