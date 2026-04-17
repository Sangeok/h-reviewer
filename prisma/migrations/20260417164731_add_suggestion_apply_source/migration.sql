-- CreateEnum
CREATE TYPE "SuggestionApplySource" AS ENUM ('INTERNAL_APPLY_FIX', 'GITHUB_NATIVE');

-- AlterTable
ALTER TABLE "suggestion" ADD COLUMN     "appliedSource" "SuggestionApplySource";

-- Backfill existing APPLIED rows as INTERNAL_APPLY_FIX
UPDATE "suggestion"
SET "appliedSource" = 'INTERNAL_APPLY_FIX'
WHERE "status" = 'APPLIED' AND "appliedSource" IS NULL;
