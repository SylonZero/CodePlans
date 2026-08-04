CREATE TABLE `asset_capabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`area` text,
	`status` text DEFAULT 'active' NOT NULL,
	`source` text DEFAULT 'graduated' NOT NULL,
	`origin_work_item_id` text,
	`origin_code_plan_id` text,
	`origin_release_id` text,
	`origin_summary` text DEFAULT '' NOT NULL,
	`verified_at` integer,
	`removed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`origin_work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`origin_code_plan_id`) REFERENCES `code_plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`origin_release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `asset_capabilities_asset_idx` ON `asset_capabilities` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_capabilities_origin_item_idx` ON `asset_capabilities` (`origin_work_item_id`) WHERE "asset_capabilities"."origin_work_item_id" IS NOT NULL;