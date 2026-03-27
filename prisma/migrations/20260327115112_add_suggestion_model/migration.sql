-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED', 'CONFLICTED');

-- CreateEnum
CREATE TYPE "SuggestionSeverity" AS ENUM ('CRITICAL', 'WARNING', 'SUGGESTION', 'INFO');

-- AlterTable
ALTER TABLE "review" ADD COLUMN     "headSha" TEXT;

-- CreateTable
CREATE TABLE "suggestion" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "beforeCode" TEXT NOT NULL,
    "afterCode" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "severity" "SuggestionSeverity" NOT NULL DEFAULT 'SUGGESTION',
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3),
    "appliedCommitSha" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suggestion_reviewId_idx" ON "suggestion"("reviewId");

-- CreateIndex
CREATE INDEX "suggestion_status_idx" ON "suggestion"("status");

-- CreateIndex
CREATE INDEX "suggestion_appliedCommitSha_idx" ON "suggestion"("appliedCommitSha");

-- AddForeignKey
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
