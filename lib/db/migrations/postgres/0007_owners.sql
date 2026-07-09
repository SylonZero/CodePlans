ALTER TABLE "code_plans" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "code_plans" ADD CONSTRAINT "code_plans_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
