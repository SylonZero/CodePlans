ALTER TABLE "products" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "archived_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "archived_by_kind" text;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_archived_by_id_users_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
