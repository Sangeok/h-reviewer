import type { LanguageCode } from "@/shared/types/language";

export const MAX_SUGGESTION_CAP = 15;

export const SECTION_HEADERS = {
  en: {
    walkthrough: "Walkthrough",
    sequenceDiagram: "Sequence Diagram",
    summary: "Summary",
    strengths: "Strengths",
    issues: "Issues",
    suggestions: "Suggestions",
    poem: "Poem",
    reviewFocus: "Review Focus",
  },
  ko: {
    walkthrough: "변경 사항 상세",
    sequenceDiagram: "시퀀스 다이어그램",
    summary: "요약",
    strengths: "강점",
    issues: "발견된 문제점",
    suggestions: "개선 제안",
    poem: "마무리 시",
    reviewFocus: "리뷰 포인트",
  },
} as const;

/** 이슈 필드 라벨. LanguageCode 추가 시 여기도 추가 필수. */
export const ISSUE_FIELD_LABELS = {
  en: { impact: "Impact", recommendation: "Recommendation" },
  ko: { impact: "영향", recommendation: "권장 조치" },
} as const satisfies Record<LanguageCode, { impact: string; recommendation: string }>;

/** 반복 지적 배지 라벨. LanguageCode 추가 시 여기도 추가 필수. */
export const REPEAT_BADGE_LABELS = {
  en: { badge: "Repeat issue", context: "The same issue was raised in" },
  ko: { badge: "반복 지적", context: "같은 지적을 받았던 PR:" },
} as const satisfies Record<LanguageCode, { badge: string; context: string }>;

/** Mermaid 검증 실패 시 현지화된 fallback 텍스트. LanguageCode 추가 시 여기도 추가 필수. */
export const DIAGRAM_FALLBACK_TEXT: Record<LanguageCode, string> = {
  en: "Sequence diagram omitted due to Mermaid safety validation.",
  ko: "Mermaid 검증으로 인해 시퀀스 다이어그램이 생략되었습니다.",
};

/** 2차 리뷰어 라벨. LanguageCode 추가 시 여기도 추가 필수. */
export const SECOND_REVIEWER_LABELS = {
  en: {
    title: "Second Reviewer",
    badge: "Verified by second reviewer",
    summary: "reviewed {reviewed} findings, excluded {excluded}",
    skipped: "Second review was skipped",
    excluded: "Excluded findings",
  },
  ko: {
    title: "2차 리뷰어",
    badge: "2차 리뷰어 검증됨",
    summary: "{reviewed}개 검토, {excluded}개 제외",
    skipped: "2차 검증이 생략되었습니다",
    excluded: "제외된 항목",
  },
} as const satisfies Record<
  LanguageCode,
  { title: string; badge: string; summary: string; skipped: string; excluded: string }
>;
