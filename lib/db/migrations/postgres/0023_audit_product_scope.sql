ALTER TABLE "sync_log" ADD COLUMN "actor_kind" text;
--> statement-breakpoint
ALTER TABLE "sync_log" ADD COLUMN "product_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_log_product_created_idx" ON "sync_log" USING btree ("product_id","created_at");
--> statement-breakpoint
UPDATE "sync_log" SET "actor_kind" = CASE WHEN "actor_id" IS NOT NULL THEN 'user' WHEN "connection_id" IS NOT NULL THEN 'connector' END WHERE "actor_kind" IS NULL;
--> statement-breakpoint
UPDATE "sync_log" SET "product_id" = "entity_id" WHERE "product_id" IS NULL AND "entity_type" = 'product';
--> statement-breakpoint
UPDATE "sync_log" s SET "product_id" = a."product_id" FROM "assets" a WHERE s."product_id" IS NULL AND s."entity_type" = 'asset' AND a."id" = s."entity_id";
--> statement-breakpoint
UPDATE "sync_log" s SET "product_id" = p."product_id" FROM "code_plans" p WHERE s."product_id" IS NULL AND s."entity_type" = 'code_plan' AND p."id" = s."entity_id";
--> statement-breakpoint
UPDATE "sync_log" s SET "product_id" = w."product_id" FROM "work_items" w WHERE s."product_id" IS NULL AND s."entity_type" = 'work_item' AND w."id" = s."entity_id";
--> statement-breakpoint
UPDATE "sync_log" s SET "product_id" = r."product_id" FROM "releases" r WHERE s."product_id" IS NULL AND s."entity_type" = 'release' AND r."id" = s."entity_id";
--> statement-breakpoint
UPDATE "sync_log" s SET "product_id" = p."product_id" FROM "tasks" t JOIN "code_plans" p ON p."id" = t."code_plan_id" WHERE s."product_id" IS NULL AND s."entity_type" = 'task' AND t."id" = s."entity_id";
