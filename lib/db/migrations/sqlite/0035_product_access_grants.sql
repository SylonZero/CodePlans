CREATE TABLE `product_access_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_access_grants_product_user_idx` ON `product_access_grants` (`product_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `product_access_grants_user_idx` ON `product_access_grants` (`user_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `access_restricted` integer DEFAULT false NOT NULL;