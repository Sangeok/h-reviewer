export type ReviewSizeMode = "tiny" | "small" | "normal" | "large";

export interface PRSizeInfo {
  additions: number;
  deletions: number;
  changedFiles: number;
}

/**
 * PR 크기에 따른 리뷰 모드를 결정한다.
 * changed_lines = additions + deletions
 */
export function classifyPRSize(info: PRSizeInfo): ReviewSizeMode {
  const changedLines = (info.additions ?? 0) + (info.deletions ?? 0);
  const files = info.changedFiles ?? 1;

  if (!Number.isFinite(changedLines)) return "normal";

  if (changedLines <= 5 && files <= 2) return "tiny";
  if (changedLines <= 30) return "small";
  if (changedLines <= 500) return "normal";
  return "large";
}

/**
 * size 모드에 따른 RAG topK 값을 반환한다.
 * tiny는 RAG를 건너뛰므로 0 반환.
 */
export function getTopKForSizeMode(mode: ReviewSizeMode): number {
  switch (mode) {
    case "tiny":
      return 0;
    case "small":
      return 2;
    case "normal":
    case "large":
      return 5;
  }
}

/**
 * size 모드별 포함할 섹션 목록을 반환한다.
 */
export function getSectionPolicy(mode: ReviewSizeMode) {
  switch (mode) {
    case "tiny":
      return {
        summary: true,
        walkthrough: false,
        sequenceDiagram: false,
        strengths: false,
        issues: true,
        suggestions: true,
        poem: false,
      };
    case "small":
      return {
        summary: true,
        walkthrough: true,
        sequenceDiagram: false,
        strengths: false,
        issues: true,
        suggestions: true,
        poem: false,
      };
    case "normal":
      return {
        summary: true,
        walkthrough: true,
        sequenceDiagram: true,
        strengths: true,
        issues: true,
        suggestions: true,
        poem: true,
      };
    case "large":
      return {
        summary: true,
        walkthrough: true,
        sequenceDiagram: false,
        strengths: true,
        issues: true,
        suggestions: true,
        poem: false,
      };
  }
}
