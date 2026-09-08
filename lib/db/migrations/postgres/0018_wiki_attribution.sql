ALTER TABLE "assets" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "code_plans" ADD CONSTRAINT "code_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "code_plans" ADD CONSTRAINT "code_plans_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD CONSTRAINT "asset_design_log_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "asset_design_log" ADD CONSTRAINT "asset_design_log_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD CONSTRAINT "asset_capabilities_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "asset_capabilities" ADD CONSTRAINT "asset_capabilities_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "specs" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "specs" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "specs" ADD CONSTRAINT "specs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "specs" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "specs" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "specs" ADD CONSTRAINT "specs_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
