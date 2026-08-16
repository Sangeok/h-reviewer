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

/**
 * 리뷰가 온전하지 않을 때 본문 상단에 붙는 고지 라벨.
 * 열화를 로그에만 남기면 조용히 묻힌다(2026-08-10 사고) — 사용자가 보는 곳에 적는다.
 * LanguageCode 추가 시 여기도 추가 필수.
 */
export const REVIEW_NOTICE_LABELS = {
  en: {
    skippedFiles: "Skipped generated files:",
    limitedReview:
      "This PR was too large for a full structured review — inline suggestions and per-issue verification are unavailable.",
  },
  ko: {
    skippedFiles: "생성 파일 제외:",
    limitedReview:
      "PR이 너무 커서 전체 구조화 리뷰를 만들지 못했습니다 — 인라인 제안과 이슈별 검증이 제공되지 않습니다.",
  },
} as const satisfies Record<
  LanguageCode,
  { skippedFiles: string; limitedReview: string }
>;

/** 리뷰 최상단 결론 줄 라벨. LanguageCode 추가 시 여기도 추가 필수.
 *  결론 줄은 판단 문장이 아니라 사실 조립이다 — 배지(기존 riskLevel) + 카운트(산술).
 *  권장행동("병합 가능" 등)은 넣지 않는다: severity는 검수자가 조정하지 않는 미검증
 *  값이고, 파생 지시는 배지와 모순될 수 있으며, 결정권은 사용자에게 있다. */
export const VERDICT_LINE_LABELS = {
  en: { issues: "{n} issues", suggestions: "{n} suggestions" },
  ko: { issues: "지적 {n}건", suggestions: "제안 {n}건" },
} as const satisfies Record<LanguageCode, { issues: string; suggestions: string }>;

/** 발견된 문제점 섹션의 인라인 연결 안내.
 *  개선 제안 섹션의 SUGGESTION_SECTION_HINT(suggestion-format.ts)와 동형 패턴. */
export const ISSUE_SECTION_HINT = {
  en: "> Items with a file and line map 1:1 to inline comments in the Files changed tab.",
  ko: "> 파일·줄이 있는 항목은 Files changed 탭의 인라인 코멘트와 1:1로 연결됩니다.",
} as const satisfies Record<LanguageCode, string>;

/** 리뷰 검증(검수자) 라벨. LanguageCode 추가 시 여기도 추가 필수.
 *  excluded        — 대시보드 패널의 <summary> 라벨 (VerificationPanel)
 *  excludedHeading — GitHub 검수자 카드의 H2 헤더 (buildVerificationReviewBody)
 *  두 소비처가 독립적으로 바뀔 수 있도록 의도적으로 분리한 키다. 합치지 말 것. */
export const VERIFICATION_LABELS = {
  en: {
    title: "Review Verification",
    badge: "Verified against the diff",
    skipped: "Verification was skipped",
    excluded: "Excluded findings",
    excludedHeading: "Findings excluded by the verifier",
    excludedIntro:
      "The first reviewer raised these, but the diff contradicts them, so they were removed from the review.",
  },
  ko: {
    title: "리뷰 검증",
    badge: "diff 대조 검증됨",
    skipped: "검증이 생략되었습니다",
    excluded: "제외된 지적",
    excludedHeading: "검수자가 제외한 지적",
    excludedIntro: "1차 리뷰어가 낸 지적 중 diff와 맞지 않아 리뷰에서 뺀 항목입니다.",
  },
} as const satisfies Record<
  LanguageCode,
  {
    title: string;
    badge: string;
    skipped: string;
    excluded: string;
    excludedHeading: string;
    excludedIntro: string;
  }
>;
