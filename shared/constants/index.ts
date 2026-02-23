import type { LanguageCode } from "@/module/settings/constants";

export const SECTION_HEADERS = {
  en: {
    walkthrough: "Walkthrough",
    sequenceDiagram: "Sequence Diagram",
    summary: "Summary",
    strengths: "Strengths",
    issues: "Issues",
    suggestions: "Suggestions",
    poem: "Poem",
  },
  ko: {
    walkthrough: "변경 사항 상세",
    sequenceDiagram: "시퀀스 다이어그램",
    summary: "요약",
    strengths: "강점",
    issues: "발견된 문제점",
    suggestions: "개선 제안",
    poem: "마무리 시",
  },
} as const;

/** Mermaid 검증 실패 시 현지화된 fallback 텍스트. LanguageCode 추가 시 여기도 추가 필수. */
export const DIAGRAM_FALLBACK_TEXT: Record<LanguageCode, string> = {
  en: "Sequence diagram omitted due to Mermaid safety validation.",
  ko: "Mermaid 검증으로 인해 시퀀스 다이어그램이 생략되었습니다.",
};
