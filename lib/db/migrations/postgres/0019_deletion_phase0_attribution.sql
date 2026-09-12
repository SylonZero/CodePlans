ALTER TABLE "organizations" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "asset_owners" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "asset_owners" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "asset_owners" ADD CONSTRAINT "asset_owners_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset_dependencies" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "asset_dependencies" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "asset_dependencies" ADD CONSTRAINT "asset_dependencies_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_code_plans" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "work_item_code_plans" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "work_item_code_plans" ADD CONSTRAINT "work_item_code_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by_kind" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "updated_by_kind" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
