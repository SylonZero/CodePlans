ALTER TABLE `products` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `archived_by_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `products` ADD `archived_by_kind` text;