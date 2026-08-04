CREATE TABLE "asset_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"area" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'graduated' NOT NULL,
	"origin_work_item_id" uuid,
	"origin_code_plan_id" uuid,
	"origin_release_id" uuid,
	"origin_summary" text DEFAULT '' NOT NULL,
	"verified_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD CONSTRAINT "asset_capabilities_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD CONSTRAINT "asset_capabilities_origin_work_item_id_work_items_id_fk" FOREIGN KEY ("origin_work_item_id") REFERENCES "public"."work_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD CONSTRAINT "asset_capabilities_origin_code_plan_id_code_plans_id_fk" FOREIGN KEY ("origin_code_plan_id") REFERENCES "public"."code_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD CONSTRAINT "asset_capabilities_origin_release_id_releases_id_fk" FOREIGN KEY ("origin_release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_capabilities_asset_idx" ON "asset_capabilities" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_capabilities_origin_item_idx" ON "asset_capabilities" USING btree ("origin_work_item_id") WHERE "asset_capabilities"."origin_work_item_id" IS NOT NULL;
