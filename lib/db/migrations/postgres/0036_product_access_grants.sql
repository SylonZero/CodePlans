CREATE TABLE "product_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_access_grants" ADD CONSTRAINT "product_access_grants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_access_grants" ADD CONSTRAINT "product_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_access_grants" ADD CONSTRAINT "product_access_grants_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_access_grants_product_user_idx" ON "product_access_grants" USING btree ("product_id","user_id");--> statement-breakpoint
CREATE INDEX "product_access_grants_user_idx" ON "product_access_grants" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "access_restricted" boolean DEFAULT false NOT NULL;
