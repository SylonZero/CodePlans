CREATE TABLE `release_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`version` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_assets_release_asset_idx` ON `release_assets` (`release_id`,`asset_id`);--> statement-breakpoint
CREATE INDEX `release_assets_asset_idx` ON `release_assets` (`asset_id`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`shipped_at` integer,
	`creator_id` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
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
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_connection_external_idx` ON `releases` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `releases_product_idx` ON `releases` (`product_id`);--> statement-breakpoint
ALTER TABLE `code_plans` ADD `release_id` text REFERENCES releases(id) ON DELETE SET NULL;