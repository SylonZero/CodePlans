CREATE TABLE `asset_owners` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_owners_asset_user_idx` ON `asset_owners` (`asset_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `asset_owners_user_idx` ON `asset_owners` (`user_id`);