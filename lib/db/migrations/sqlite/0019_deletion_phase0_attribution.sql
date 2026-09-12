ALTER TABLE `asset_dependencies` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `asset_dependencies` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `asset_owners` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `asset_owners` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `organization_members` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `organization_members` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `updated_by_kind` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `updated_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `organizations` SET `updated_at` = `created_at` WHERE `updated_at` = 0;--> statement-breakpoint
ALTER TABLE `products` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `products` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `updated_by_kind` text;--> statement-breakpoint
ALTER TABLE `products` ADD `updated_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `products` SET `updated_at` = `created_at` WHERE `updated_at` = 0;--> statement-breakpoint
ALTER TABLE `tasks` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `updated_by_kind` text;--> statement-breakpoint
ALTER TABLE `work_item_code_plans` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `work_item_code_plans` ADD `created_by_kind` text;
