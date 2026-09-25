CREATE TABLE `product_members` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`responsibility` text NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`created_by_id` text,
	`created_by_kind` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_members_unique_idx` ON `product_members` (`product_id`,`user_id`,`responsibility`,`area`);--> statement-breakpoint
CREATE INDEX `product_members_user_idx` ON `product_members` (`user_id`);