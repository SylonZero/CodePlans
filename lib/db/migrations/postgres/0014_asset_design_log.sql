CREATE TABLE "asset_design_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"release_id" uuid,
	"code_plan_id" uuid,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author_kind" text DEFAULT 'user' NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD CONSTRAINT "asset_design_log_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD CONSTRAINT "asset_design_log_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD CONSTRAINT "asset_design_log_code_plan_id_code_plans_id_fk" FOREIGN KEY ("code_plan_id") REFERENCES "public"."code_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD CONSTRAINT "asset_design_log_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_design_log_asset_idx" ON "asset_design_log" USING btree ("asset_id");
