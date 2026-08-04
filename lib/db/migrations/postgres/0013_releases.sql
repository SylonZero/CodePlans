CREATE TYPE "public"."release_status" AS ENUM('planned', 'in_progress', 'shipped', 'abandoned');--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "release_status" DEFAULT 'planned' NOT NULL,
	"shipped_at" timestamp with time zone,
	"creator_id" uuid NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source" text DEFAULT 'native' NOT NULL,
	"connection_id" uuid,
	"external_id" text,
	"external_key" text,
	"external_url" text,
	"external_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_deleted" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_connection_id_integrations_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_assets" ADD CONSTRAINT "release_assets_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_assets" ADD CONSTRAINT "release_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "releases_connection_external_idx" ON "releases" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "releases_product_idx" ON "releases" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_assets_release_asset_idx" ON "release_assets" USING btree ("release_id","asset_id");--> statement-breakpoint
CREATE INDEX "release_assets_asset_idx" ON "release_assets" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "code_plans" ADD COLUMN "release_id" uuid;--> statement-breakpoint
ALTER TABLE "code_plans" ADD CONSTRAINT "code_plans_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;
