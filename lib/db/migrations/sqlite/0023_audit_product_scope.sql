ALTER TABLE `sync_log` ADD `actor_kind` text;--> statement-breakpoint
ALTER TABLE `sync_log` ADD `product_id` text;--> statement-breakpoint
CREATE INDEX `sync_log_product_created_idx` ON `sync_log` (`product_id`,`created_at`);--> statement-breakpoint
UPDATE `sync_log` SET `actor_kind` = CASE WHEN `actor_id` IS NOT NULL THEN 'user' WHEN `connection_id` IS NOT NULL THEN 'connector' END WHERE `actor_kind` IS NULL;--> statement-breakpoint
UPDATE `sync_log` SET `product_id` = `entity_id` WHERE `product_id` IS NULL AND `entity_type` = 'product';--> statement-breakpoint
UPDATE `sync_log` SET `product_id` = (SELECT `product_id` FROM `assets` WHERE `assets`.`id` = `sync_log`.`entity_id`) WHERE `product_id` IS NULL AND `entity_type` = 'asset';--> statement-breakpoint
UPDATE `sync_log` SET `product_id` = (SELECT `product_id` FROM `code_plans` WHERE `code_plans`.`id` = `sync_log`.`entity_id`) WHERE `product_id` IS NULL AND `entity_type` = 'code_plan';--> statement-breakpoint
UPDATE `sync_log` SET `product_id` = (SELECT `product_id` FROM `work_items` WHERE `work_items`.`id` = `sync_log`.`entity_id`) WHERE `product_id` IS NULL AND `entity_type` = 'work_item';--> statement-breakpoint
UPDATE `sync_log` SET `product_id` = (SELECT `product_id` FROM `releases` WHERE `releases`.`id` = `sync_log`.`entity_id`) WHERE `product_id` IS NULL AND `entity_type` = 'release';--> statement-breakpoint
UPDATE `sync_log` SET `product_id` = (SELECT `code_plans`.`product_id` FROM `tasks` JOIN `code_plans` ON `code_plans`.`id` = `tasks`.`code_plan_id` WHERE `tasks`.`id` = `sync_log`.`entity_id`) WHERE `product_id` IS NULL AND `entity_type` = 'task';
