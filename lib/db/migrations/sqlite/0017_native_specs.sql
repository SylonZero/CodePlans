CREATE TABLE `spec_events` (
	`id` text PRIMARY KEY NOT NULL,
	`spec_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`kind` text NOT NULL,
	`spec_title` text NOT NULL,
	`spec_type` text NOT NULL,
	`from_version` integer,
	`to_version` integer NOT NULL,
	`plan_id` text,
	`work_item_id` text,
	`note_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`spec_id`) REFERENCES `specs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `code_plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`note_id`) REFERENCES `asset_design_log`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `spec_events_asset_idx` ON `spec_events` (`asset_id`);--> statement-breakpoint
CREATE TABLE `spec_links` (
	`id` text PRIMARY KEY NOT NULL,
	`spec_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`relationship_type` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`spec_id`) REFERENCES `specs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spec_links_target_idx` ON `spec_links` (`spec_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `spec_links_lookup_idx` ON `spec_links` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `specs` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`spec_type` text NOT NULL,
	`area` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`supersedes` text,
	`superseded_by` text,
	`source_type` text DEFAULT 'native' NOT NULL,
	`source_url` text,
	`needs_review` integer DEFAULT false NOT NULL,
	`author_type` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supersedes`) REFERENCES `specs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`superseded_by`) REFERENCES `specs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `specs_product_idx` ON `specs` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `specs_import_url_idx` ON `specs` (`product_id`,`source_url`) WHERE "specs"."source_type" = 'git_import' AND "specs"."supersedes" IS NULL;--> statement-breakpoint
ALTER TABLE `asset_capabilities` ADD `source_spec_id` text REFERENCES specs(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `asset_capabilities` ADD `source_spec_version` integer;