CREATE TABLE IF NOT EXISTS "product_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"responsibility" text NOT NULL,
	"area" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_by_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_members_unique_idx" ON "product_members" USING btree ("product_id","user_id","responsibility","area");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_members_user_idx" ON "product_members" USING btree ("user_id");
