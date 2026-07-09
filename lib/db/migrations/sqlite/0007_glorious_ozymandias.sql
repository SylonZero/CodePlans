ALTER TABLE `code_plans` ADD `owner_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `work_items` ADD `owner_id` text REFERENCES users(id);