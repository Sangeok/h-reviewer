-- CreateEnum
CREATE TYPE "IssueResolutionStatus" AS ENUM ('PENDING', 'ADDRESSED_STRONG', 'ADDRESSED_WEAK', 'IGNORED');

-- CreateTable
CREATE TABLE "review_issue" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filePath" TEXT,
    "lineNumber" INTEGER,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "SuggestionSeverity" NOT NULL,
    "category" TEXT NOT NULL,
    "embedding" JSONB,
    "resolutionStatus" "IssueResolutionStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBySha" TEXT,
    "isRepeat" BOOLEAN NOT NULL DEFAULT false,
    "repeatOfIssueId" TEXT,
    "repeatSimilarity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_issue_reviewId_idx" ON "review_issue"("reviewId");

-- CreateIndex
CREATE INDEX "review_issue_userId_category_createdAt_idx" ON "review_issue"("userId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "review_issue" ADD CONSTRAINT "review_issue_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_issue" ADD CONSTRAINT "review_issue_repeatOfIssueId_fkey" FOREIGN KEY ("repeatOfIssueId") REFERENCES "review_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
