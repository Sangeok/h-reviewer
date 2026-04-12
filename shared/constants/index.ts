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

/** Mermaid 검증 실패 시 현지화된 fallback 텍스트. LanguageCode 추가 시 여기도 추가 필수. */
export const DIAGRAM_FALLBACK_TEXT: Record<LanguageCode, string> = {
  en: "Sequence diagram omitted due to Mermaid safety validation.",
  ko: "Mermaid 검증으로 인해 시퀀스 다이어그램이 생략되었습니다.",
};
