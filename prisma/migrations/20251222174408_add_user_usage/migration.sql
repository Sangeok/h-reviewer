/*
  Warnings:

  - You are about to drop the `Review` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_repositoryId_fkey";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "subscriptionStatus" TEXT,
ADD COLUMN     "subscriptionTier" TEXT NOT NULL DEFAULT 'FREE';

-- DropTable
DROP TABLE "Review";

-- CreateTable
CREATE TABLE "review" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prTitle" TEXT NOT NULL,
    "prUrl" TEXT NOT NULL,
    "review" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCounts" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_repositoryId_idx" ON "review"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "user_usage_userId_key" ON "user_usage"("userId");

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
