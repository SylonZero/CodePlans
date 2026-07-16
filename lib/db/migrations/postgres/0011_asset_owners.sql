CREATE TABLE "asset_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_owners" ADD CONSTRAINT "asset_owners_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_owners" ADD CONSTRAINT "asset_owners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_owners_asset_user_idx" ON "asset_owners" USING btree ("asset_id","user_id");--> statement-breakpoint
CREATE INDEX "asset_owners_user_idx" ON "asset_owners" USING btree ("user_id");
