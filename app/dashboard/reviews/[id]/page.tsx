import { getUserReviewById, ReviewDetail } from "@/module/review";
import { structuredReviewSchema, REVIEW_SCHEMA_VERSION } from "@/module/ai";
import { isValidLanguageCode } from "@/module/settings";
import type { LanguageCode } from "@/shared/types/language";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const review = await getUserReviewById(id);

  if (!review) notFound();

  // 서버 컴포넌트에서 Zod 파싱 — 클라이언트 번들에 Zod 미포함
  let structuredData = null;
  if (review.reviewData && typeof review.reviewData === "object") {
    const raw = review.reviewData as Record<string, unknown>;

    // 스키마 버전 불일치 시 로그 + 마크다운 fallback
    if (raw.schemaVersion !== REVIEW_SCHEMA_VERSION) {
      console.warn(
        `Review ${review.id}: schemaVersion ${raw.schemaVersion} !== ${REVIEW_SCHEMA_VERSION}, falling back to markdown`
      );
    } else {
      const parsed = structuredReviewSchema.safeParse(raw);
      structuredData = parsed.success ? parsed.data : null;
    }
  }

  // langCode 검증 — String 컬럼이므로 잘못된 값이 저장될 수 있음
  const langCode: LanguageCode = isValidLanguageCode(review.langCode)
    ? review.langCode
    : "en";

  return <ReviewDetail review={review} structuredData={structuredData} langCode={langCode} />;
}
