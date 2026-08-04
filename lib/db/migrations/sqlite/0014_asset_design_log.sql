CREATE TABLE `asset_design_log` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`release_id` text,
	`code_plan_id` text,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`author_kind` text DEFAULT 'user' NOT NULL,
	`author_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`code_plan_id`) REFERENCES `code_plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `asset_design_log_asset_idx` ON `asset_design_log` (`asset_id`);