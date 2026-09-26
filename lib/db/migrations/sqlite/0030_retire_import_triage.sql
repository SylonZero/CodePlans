-- Imported specs awaiting a check now simply sit in review; the flag goes away.
UPDATE `specs` SET `status` = 'in_review' WHERE `needs_review` = 1 AND `status` IN ('draft', 'active');
--> statement-breakpoint
ALTER TABLE `specs` DROP COLUMN `needs_review`;
