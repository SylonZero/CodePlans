-- Imported specs awaiting a check now simply sit in review; the flag goes away.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'specs' AND column_name = 'needs_review') THEN
    UPDATE "specs" SET "status" = 'in_review' WHERE "needs_review" = true AND "status" IN ('draft', 'active');
    ALTER TABLE "specs" DROP COLUMN "needs_review";
  END IF;
END $$;
