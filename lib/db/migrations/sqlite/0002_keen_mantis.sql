CREATE TABLE `code_plan_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`code_plan_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`branch` text,
	`pr_url` text,
	`pr_status` text DEFAULT 'none' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`code_plan_id`) REFERENCES `code_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `code_plan_assets_plan_asset_idx` ON `code_plan_assets` (`code_plan_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `code_plan_assignees` (
	`code_plan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`code_plan_id`, `user_id`),
	FOREIGN KEY (`code_plan_id`) REFERENCES `code_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`auth_ref` text,
	`config` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_sync_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`event` text NOT NULL,
	`actor_id` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sync_log_org_created_idx` ON `sync_log` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_item_code_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`work_item_id` text NOT NULL,
	`code_plan_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`code_plan_id`) REFERENCES `code_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_item_code_plans_item_plan_idx` ON `work_item_code_plans` (`work_item_id`,`code_plan_id`);--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`asset_id` text,
	`area` text,
	`parent_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`reporter_id` text,
	`source` text DEFAULT 'native' NOT NULL,
	`connection_id` text,
	`external_id` text,
	`external_key` text,
	`external_url` text,
	`external_data` text DEFAULT '{}' NOT NULL,
	`external_deleted` integer DEFAULT false NOT NULL,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`connection_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_items_connection_external_idx` ON `work_items` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `work_items_product_idx` ON `work_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `work_items_asset_idx` ON `work_items` (`asset_id`);--> statement-breakpoint
ALTER TABLE `assets` ADD `repo_path` text;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `source` text DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `connection_id` text REFERENCES integrations(id);--> statement-breakpoint
ALTER TABLE `code_plans` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `external_key` text;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `external_url` text;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `external_data` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `external_deleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `code_plans` ADD `synced_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `code_plans_connection_external_idx` ON `code_plans` (`connection_id`,`external_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `source` text DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `connection_id` text REFERENCES integrations(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `external_key` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `external_url` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `external_data` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `external_deleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `synced_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_connection_external_idx` ON `tasks` (`connection_id`,`external_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `code_plan_assets` (`id`, `code_plan_id`, `asset_id`, `pr_status`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), cp.id, je.value, 'none', unixepoch(), unixepoch()
FROM `code_plans` cp, json_each(cp.target_asset_ids) je
WHERE EXISTS (SELECT 1 FROM `assets` a WHERE a.id = je.value);--> statement-breakpoint
INSERT OR IGNORE INTO `code_plan_assignees` (`code_plan_id`, `user_id`, `created_at`)
SELECT cp.id, je.value, unixepoch()
FROM `code_plans` cp, json_each(cp.assignee_ids) je
WHERE EXISTS (SELECT 1 FROM `users` u WHERE u.id = je.value);
