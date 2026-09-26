CREATE TABLE `spec_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`spec_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`spec_type` text NOT NULL,
	`area` text,
	`status` text NOT NULL,
	`change_summary` text,
	`created_by_id` text,
	`created_by_kind` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`spec_id`) REFERENCES `specs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spec_revisions_version_idx` ON `spec_revisions` (`spec_id`,`version`);--> statement-breakpoint
-- Seed each existing spec's current version. Earlier bodies were never stored and cannot be recovered.
INSERT INTO `spec_revisions` (`id`, `spec_id`, `version`, `title`, `body`, `spec_type`, `area`, `status`, `change_summary`, `created_by_id`, `created_by_kind`, `created_at`)
SELECT lower(hex(randomblob(16))), `id`, `version`, `title`, `body`, `spec_type`, `area`, `status`, 'Snapshot taken when revision history was enabled', `updated_by_id`, `updated_by_kind`, `updated_at` FROM `specs`;
