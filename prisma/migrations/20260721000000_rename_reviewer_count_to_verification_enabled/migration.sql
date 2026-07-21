-- reviewerCount(Int 1|2) → verificationEnabled(Boolean) 개명.
-- 기존 마이그레이션은 이미 DB에 적용됨(체크섬 기록) — 수정하지 않고 새 마이그레이션으로 전환한다.
ALTER TABLE "user" ADD COLUMN "verificationEnabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "user" SET "verificationEnabled" = true WHERE "reviewerCount" = 2;
ALTER TABLE "user" DROP COLUMN "reviewerCount";
