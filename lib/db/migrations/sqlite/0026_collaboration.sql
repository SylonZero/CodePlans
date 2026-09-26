CREATE TABLE `comment_mentions` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_mentions_pk` ON `comment_mentions` (`comment_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `comment_mentions_user_idx` ON `comment_mentions` (`user_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`subject_version` integer,
	`parent_id` text,
	`review_id` text,
	`anchor` text,
	`body` text NOT NULL,
	`kind` text DEFAULT 'comment' NOT NULL,
	`author_id` text,
	`author_type` text DEFAULT 'user' NOT NULL,
	`resolved_at` integer,
	`resolved_by_id` text,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comments_subject_idx` ON `comments` (`subject_type`,`subject_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_parent_idx` ON `comments` (`parent_id`);--> statement-breakpoint
CREATE TABLE `org_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`workflow_default` text DEFAULT 'open' NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `product_settings` (
	`product_id` text PRIMARY KEY NOT NULL,
	`workflow_level` text,
	`updated_at` integer NOT NULL,
	`updated_by_id` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `review_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	`decided_at` integer,
	`decided_at_version` integer,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_participants_user_idx` ON `review_participants` (`review_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `review_participants_pending_idx` ON `review_participants` (`user_id`,`decision`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`subject_version` integer NOT NULL,
	`approved_version` integer,
	`requested_by_id` text,
	`requested_by_kind` text DEFAULT 'user' NOT NULL,
	`note` text,
	`due_at` text,
	`state` text DEFAULT 'open' NOT NULL,
	`requested_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reviews_subject_idx` ON `reviews` (`subject_type`,`subject_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `reviews_product_state_idx` ON `reviews` (`product_id`,`state`);--> statement-breakpoint
ALTER TABLE `code_plans` ADD `revision` integer DEFAULT 1 NOT NULL;