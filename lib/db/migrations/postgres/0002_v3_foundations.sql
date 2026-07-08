CREATE TYPE "public"."work_item_type" AS ENUM('feature', 'bug', 'enhancement', 'ux', 'tech_debt');--> statement-breakpoint
CREATE TYPE "public"."work_item_status" AS ENUM('open', 'planned', 'in_progress', 'resolved', 'wont_do');--> statement-breakpoint
CREATE TYPE "public"."work_item_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."pr_status" AS ENUM('none', 'draft', 'open', 'merged', 'closed');--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"auth_ref" text,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "code_plan_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_plan_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"branch" text,
	"pr_url" text,
	"pr_status" "pr_status" DEFAULT 'none' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_plan_assets" ADD CONSTRAINT "code_plan_assets_code_plan_id_code_plans_id_fk" FOREIGN KEY ("code_plan_id") REFERENCES "public"."code_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_plan_assets" ADD CONSTRAINT "code_plan_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_plan_assets_plan_asset_idx" ON "code_plan_assets" ("code_plan_id","asset_id");--> statement-breakpoint
CREATE TABLE "code_plan_assignees" (
	"code_plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_plan_assignees_code_plan_id_user_id_pk" PRIMARY KEY("code_plan_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "code_plan_assignees" ADD CONSTRAINT "code_plan_assignees_code_plan_id_code_plans_id_fk" FOREIGN KEY ("code_plan_id") REFERENCES "public"."code_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_plan_assignees" ADD CONSTRAINT "code_plan_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"asset_id" uuid,
	"area" text,
	"parent_id" uuid,
	"type" "work_item_type" NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "work_item_status" DEFAULT 'open' NOT NULL,
	"severity" "work_item_severity" DEFAULT 'medium' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"reporter_id" uuid,
	"source" text DEFAULT 'native' NOT NULL,
	"connection_id" uuid,
	"external_id" text,
	"external_key" text,
	"external_url" text,
	"external_data" jsonb DEFAULT '{}' NOT NULL,
	"external_deleted" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_parent_id_work_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."work_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_connection_id_integrations_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_connection_external_idx" ON "work_items" ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "work_items_product_idx" ON "work_items" ("product_id");--> statement-breakpoint
CREATE INDEX "work_items_asset_idx" ON "work_items" ("asset_id");--> statement-breakpoint
CREATE TABLE "work_item_code_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"code_plan_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_item_code_plans" ADD CONSTRAINT "work_item_code_plans_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_code_plans" ADD CONSTRAINT "work_item_code_plans_code_plan_id_code_plans_id_fk" FOREIGN KEY ("code_plan_id") REFERENCES "public"."code_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_code_plans_item_plan_idx" ON "work_item_code_plans" ("work_item_id","code_plan_id");--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"event" text NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_connection_id_integrations_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_log_org_created_idx" ON "sync_log" ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "repo_path" text;--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "source" text DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "external_url" text;--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "external_data" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "external_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "code_plans" ADD CONSTRAINT "code_plans_connection_id_integrations_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_plans_connection_external_idx" ON "code_plans" ("connection_id","external_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source" text DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_data" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_connection_id_integrations_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_connection_external_idx" ON "tasks" ("connection_id","external_id");--> statement-breakpoint
INSERT INTO "code_plan_assets" ("code_plan_id", "asset_id")
SELECT cp."id", t.aid
FROM "code_plans" cp
CROSS JOIN LATERAL unnest(cp."target_asset_ids") AS t(aid)
WHERE EXISTS (SELECT 1 FROM "assets" a WHERE a."id" = t.aid)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "code_plan_assignees" ("code_plan_id", "user_id")
SELECT cp."id", t.uid
FROM "code_plans" cp
CROSS JOIN LATERAL unnest(cp."assignee_ids") AS t(uid)
WHERE EXISTS (SELECT 1 FROM "users" u WHERE u."id" = t.uid)
ON CONFLICT DO NOTHING;
