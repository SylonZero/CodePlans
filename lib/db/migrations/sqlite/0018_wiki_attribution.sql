ALTER TABLE `asset_capabilities` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `asset_capabilities` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `asset_capabilities` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `asset_capabilities` ADD `updated_by_kind` text;--> statement-breakpoint
ALTER TABLE `asset_design_log` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `asset_design_log` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `asset_design_log` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `asset_design_log` ADD `updated_by_kind` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `updated_by_kind` text;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `updated_by_kind` text;--> statement-breakpoint
ALTER TABLE `releases` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `releases` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `releases` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `releases` ADD `updated_by_kind` text;--> statement-breakpoint
ALTER TABLE `specs` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `specs` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `specs` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `specs` ADD `updated_by_kind` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `created_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `created_by_kind` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `updated_by_kind` text;
