DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "review"
    WHERE "status" NOT IN ('pending', 'completed', 'failed')
  ) THEN
    RAISE EXCEPTION 'Unsupported legacy review status found';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'RUNNING', 'POSTING', 'COMPLETED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReviewRequestSource" AS ENUM ('LEGACY', 'AUTOMATIC', 'COMMAND');

-- CreateEnum
CREATE TYPE "ReviewMode" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "ReviewFailureStage" AS ENUM ('LEGACY', 'QUEUE', 'FETCH', 'GENERATE', 'VERIFY', 'PERSIST', 'POST', 'RECONCILE');

-- CreateEnum
CREATE TYPE "ReviewExecutionStage" AS ENUM ('QUEUED', 'FETCHED', 'GENERATED', 'VERIFIED', 'PERSISTED', 'MAIN_POSTED', 'INLINE_POSTED', 'VERIFICATION_POSTED');

-- CreateEnum
CREATE TYPE "ReviewExecutionLeaseOwner" AS ENUM ('QUEUE', 'WORKER', 'RECONCILER');

-- CreateEnum
CREATE TYPE "TrialCreditState" AS ENUM ('NOT_APPLICABLE', 'RESERVED', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "GithubWebhookDeliveryStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "review"
ADD COLUMN "maxSuggestions" INTEGER,
ADD COLUMN "verificationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requestKey" VARCHAR(255),
ADD COLUMN "requestSource" "ReviewRequestSource" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN "reviewMode" "ReviewMode" NOT NULL DEFAULT 'FULL',
ADD COLUMN "failureStage" "ReviewFailureStage",
ADD COLUMN "failureMessage" VARCHAR(1000),
ADD COLUMN "lastCompletedStage" "ReviewExecutionStage",
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "executionLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "executionLeaseToken" VARCHAR(64),
ADD COLUMN "executionLeaseOwner" "ReviewExecutionLeaseOwner",
ADD COLUMN "githubMainReviewId" VARCHAR(64),
ADD COLUMN "githubMainPostedAt" TIMESTAMP(3),
ADD COLUMN "githubAuthorId" VARCHAR(64),
ADD COLUMN "artifactLookupMissedAt" TIMESTAMP(3),
ADD COLUMN "trialCreditState" "TrialCreditState" NOT NULL DEFAULT 'NOT_APPLICABLE';

UPDATE "review"
SET
  "requestKey" = 'legacy:' || "id",
  "requestSource" = 'LEGACY',
  "reviewMode" = 'FULL',
  "failureStage" = CASE
    WHEN "status" = 'failed' THEN 'LEGACY'::"ReviewFailureStage"
    ELSE NULL
  END,
  "failureMessage" = CASE
    WHEN "status" = 'failed' THEN 'Legacy review execution failed.'
    ELSE NULL
  END,
  "lastCompletedStage" = NULL,
  "attemptCount" = 1,
  "executionLeaseExpiresAt" = NULL,
  "executionLeaseToken" = NULL,
  "executionLeaseOwner" = NULL,
  "githubMainReviewId" = NULL,
  "githubMainPostedAt" = NULL,
  "githubAuthorId" = NULL,
  "artifactLookupMissedAt" = NULL,
  "trialCreditState" = 'NOT_APPLICABLE';

ALTER TABLE "review" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "review"
ALTER COLUMN "status" TYPE "ReviewStatus"
USING (UPPER("status")::"ReviewStatus");
ALTER TABLE "review" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "review" ALTER COLUMN "requestKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_usage"
ADD COLUMN "trialReviewCreditsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "github_webhook_delivery" (
  "id" TEXT NOT NULL,
  "deliveryId" VARCHAR(64) NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "event" VARCHAR(64) NOT NULL,
  "action" VARCHAR(64),
  "requestKey" VARCHAR(255),
  "status" "GithubWebhookDeliveryStatus" NOT NULL DEFAULT 'PROCESSING',
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "leaseToken" VARCHAR(64),
  "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(64),
  "lastErrorMessage" VARCHAR(1000),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "github_webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_requestKey_key" ON "review"("requestKey");

-- CreateIndex
CREATE INDEX "review_repositoryId_prNumber_headSha_idx" ON "review"("repositoryId", "prNumber", "headSha");

-- CreateIndex
CREATE INDEX "review_status_executionLeaseExpiresAt_idx" ON "review"("status", "executionLeaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "github_webhook_delivery_deliveryId_key" ON "github_webhook_delivery"("deliveryId");

-- CreateIndex
CREATE INDEX "github_webhook_delivery_status_leaseExpiresAt_idx" ON "github_webhook_delivery"("status", "leaseExpiresAt");
