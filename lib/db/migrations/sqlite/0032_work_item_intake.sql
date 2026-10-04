ALTER TABLE `work_items` ADD `origin` text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `triage_state` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `decline_reason` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `triage_note` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `triaged_by_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `work_items` ADD `triaged_by_kind` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `triaged_at` integer;--> statement-breakpoint
CREATE INDEX `work_items_product_external_key_idx` ON `work_items` (`product_id`,`external_key`);