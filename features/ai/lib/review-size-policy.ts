export type ReviewSizeMode = "tiny" | "small" | "normal" | "large";

export type PRSizeInfo = {
  additions: number;
  deletions: number;
  changedFiles: number;
};

export type DeterministicContextBudget = {
  totalCharacters: number;
  perChangedFileCharacters: number;
  maxChangedFiles: number;
  maxRelatedFiles: number;
  changedLineRadius: number;
};

const DETERMINISTIC_CONTEXT_BUDGETS = {
  tiny: {
    totalCharacters: 12_000,
    perChangedFileCharacters: 6_000,
    maxChangedFiles: 2,
    maxRelatedFiles: 0,
    changedLineRadius: 20,
  },
  small: {
    totalCharacters: 24_000,
    perChangedFileCharacters: 8_000,
    maxChangedFiles: 4,
    maxRelatedFiles: 2,
    changedLineRadius: 20,
  },
  normal: {
    totalCharacters: 40_000,
    perChangedFileCharacters: 12_000,
    maxChangedFiles: 8,
    maxRelatedFiles: 4,
    changedLineRadius: 20,
  },
  large: {
    totalCharacters: 24_000,
    perChangedFileCharacters: 6_000,
    maxChangedFiles: 8,
    maxRelatedFiles: 2,
    changedLineRadius: 12,
  },
} satisfies Record<ReviewSizeMode, DeterministicContextBudget>;

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

export function getDeterministicContextBudget(
  mode: ReviewSizeMode,
): DeterministicContextBudget {
  return DETERMINISTIC_CONTEXT_BUDGETS[mode];
}

/**
 * size 모드별 포함할 섹션 목록을 반환한다.
 */
export function getSectionPolicy(mode: ReviewSizeMode): {
  summary: boolean;
  walkthrough: boolean;
  sequenceDiagram: boolean;
  strengths: boolean;
  issues: boolean;
  suggestions: boolean;
  poem: boolean;
} {
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
