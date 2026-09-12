-- Data-only migration: no schema change. Backfills created_by_id for rows
-- that predate the createdBy attribution columns (see spec "Delete
-- Authorization Rules" / "Metadata Standardization & Audit Log Design").
--
-- products/code_plans/releases already have a reliable, always-populated
-- legacy creator_id column predating createdById — copy it directly rather
-- than approximating from the org owner.
UPDATE `products` SET `created_by_id` = `creator_id`, `created_by_kind` = 'user' WHERE `created_by_id` IS NULL;
--> statement-breakpoint
UPDATE `code_plans` SET `created_by_id` = `creator_id`, `created_by_kind` = 'user' WHERE `created_by_id` IS NULL;
--> statement-breakpoint
UPDATE `releases` SET `created_by_id` = `creator_id`, `created_by_kind` = 'user' WHERE `created_by_id` IS NULL;
--> statement-breakpoint

-- work_items.reporter_id is nullable (unset for externally-synced items) but
-- reliable where present — copy it first.
UPDATE `work_items` SET `created_by_id` = `reporter_id`, `created_by_kind` = 'user' WHERE `created_by_id` IS NULL AND `reporter_id` IS NOT NULL;
--> statement-breakpoint

-- Remaining work_items (reporter_id also null — externally-synced) and every
-- task (no creator-equivalent field exists at all) fall back to the owning
-- organization's owner, or the product's own creator for org-less (personal)
-- products, since there's no "org owner" concept to fall back to there. This
-- is an explicit approximation for legacy rows, not a claim of fact.
UPDATE `work_items`
SET `created_by_id` = (
  SELECT COALESCE(o.owner_id, p.creator_id)
  FROM `products` p
  LEFT JOIN `organizations` o ON o.id = p.organization_id
  WHERE p.id = `work_items`.product_id
),
`created_by_kind` = 'user'
WHERE `created_by_id` IS NULL;
--> statement-breakpoint

UPDATE `tasks`
SET `created_by_id` = (
  SELECT COALESCE(o.owner_id, p.creator_id)
  FROM `code_plans` cp
  JOIN `products` p ON p.id = cp.product_id
  LEFT JOIN `organizations` o ON o.id = p.organization_id
  WHERE cp.id = `tasks`.code_plan_id
),
`created_by_kind` = 'user'
WHERE `created_by_id` IS NULL;
