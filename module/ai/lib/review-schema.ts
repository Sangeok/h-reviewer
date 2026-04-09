import { z } from "zod";

// MAINTENANCE NOTE: severity 값의 독립 동기화 지점은 3곳이다:
// 1. prisma/schema.prisma — enum SuggestionSeverity (source of truth, Zod 파생 불가)
// 2. 여기 — severitySchema (Zod single source)
// 3. module/suggestion/constants/index.ts — SEVERITY_CONFIG 키
//
// 다음은 위 소스에서 파생되어 컴파일 타임에 검증된다:
// - module/ai/types/suggestion.ts — z.infer<typeof severitySchema>
// - module/ai/constants/review-emoji.ts — Record<SuggestionSeverity, string>
//
// 새 severity 추가 시 위 3곳 업데이트 + Prisma migrate 필요.
// IssueCategory는 issueCategorySchema(Zod)에서 정의, suggestion.ts에서 z.infer로 derive.

/** reviewData JSON의 스키마 버전. 스키마 구조가 변경될 때마다 증가시킨다.
 *  page.tsx에서 safeParse 실패 시 마크다운 fallback으로 전환되므로,
 *  버전별 마이그레이션 로직 대신 버전 불일치를 로깅하여 모니터링한다. */
export const REVIEW_SCHEMA_VERSION = 1;

export const severitySchema = z.enum(["CRITICAL", "WARNING", "SUGGESTION", "INFO"]);

const codeSuggestionSchema = z.object({
  file: z.string().describe("Exact relative file path from the diff"),
  line: z.number().describe("Line number in the new file (added line from diff)"),
  before: z.string().describe("Current code at that location (exact match required)"),
  after: z.string().describe("Suggested replacement code"),
  explanation: z.string().describe("Why this change improves the code"),
  severity: severitySchema,
});

// issueCategorySchema를 export하여 suggestion.ts에서 z.infer로 derive 가능하게 함
export const issueCategorySchema = z.enum(["bug", "design", "security", "performance", "testing", "general"]);

const walkthroughEntrySchema = z.object({
  file: z.string().describe("Exact relative file path from the diff"),
  changeType: z.enum(["added", "modified", "deleted", "renamed"])
    .describe("Type of change to this file"),
  summary: z.string().describe(
    "1-2 sentences explaining WHY this file was changed and its impact. " +
    "Do NOT describe WHAT changed (the diff already shows that)."
  ),
});

const summarySchema = z.object({
  overview: z.string().describe(
    "2-3 sentence overview of the PR's purpose and approach. " +
    "Focus on intent and impact, not file-level details."
  ),
  riskLevel: z.enum(["low", "medium", "high"]).describe(
    "low: cosmetic/docs/config. medium: logic changes with existing tests. " +
    "high: breaking changes, security-sensitive, no tests, or wide blast radius."
  ),
  keyPoints: z.array(z.string()).default([]).describe(
    "Top 2-3 things the reviewer must pay attention to. " +
    "Examples: missing error handling, Suspense boundary requirements, API contract changes. " +
    "Empty array is acceptable for tiny/trivial PRs."
  ),
});

// NOTE: 구조화 출력 스키마에는 poem 필드를 포함하지 않는다.
// tiny 모드에서는 walkthrough, strengths, sequenceDiagram이 null/빈배열이다.
export const structuredReviewSchema = z.object({
  summary: summarySchema,
  walkthrough: z.array(walkthroughEntrySchema).nullable().describe(
    "File-by-file breakdown. null if review mode is tiny."
  ),
  strengths: z.array(z.string()).describe(
    "List of positive aspects found. Empty array if review mode is tiny."
  ),
  issues: z.array(z.object({
    file: z.string().nullable().describe("File path from diff, or null for project-level issues"),
    line: z.number().nullable().describe("Line number in new file, or null for file/project-level issues"),
    description: z.string().describe("Clear description of the issue"),
    severity: severitySchema,
    category: issueCategorySchema,
  })).describe(
    "List of issues found. Use file+line for specific code issues, " +
    "file only for file-level issues, null for both for architectural/design issues."
  ),
  suggestions: z.array(codeSuggestionSchema).describe(
    "Specific, actionable code fix suggestions. " +
    "Only reference files and added lines from the diff. " +
    "before field must exactly match the current code."
  ),
  sequenceDiagram: z.string().nullable().describe(
    "Optional Mermaid sequenceDiagram block. null if not applicable or review mode is tiny."
  ),
});

export type StructuredReviewOutput = z.infer<typeof structuredReviewSchema>;
