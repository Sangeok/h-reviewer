-- AlterTable
ALTER TABLE "review" ADD COLUMN     "langCode" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "reviewData" JSONB;
