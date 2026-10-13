ALTER TABLE `email_verification_tokens` ADD `purpose` text DEFAULT 'email_change' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `session_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Invites were stored with the invitee's own address as new_email; email changes never are.
UPDATE `email_verification_tokens` SET `purpose` = 'invite'
  WHERE `new_email` = (SELECT `email` FROM `users` WHERE `users`.`id` = `email_verification_tokens`.`user_id`);
