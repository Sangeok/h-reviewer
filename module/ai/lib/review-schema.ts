import { z } from "zod";

// MAINTENANCE NOTE: severity 값이 다음 4곳에서 독립적으로 정의된다:
// 1. prisma/schema.prisma — enum SuggestionSeverity (source of truth)
// 2. 여기 (Zod 스키마) — z.enum([...])
// 3. module/ai/types/suggestion.ts — type SuggestionSeverity
// 4. module/suggestion/constants/index.ts — SEVERITY_CONFIG 키
// 5. module/github/lib/pr-review.ts — SEVERITY_EMOJI 상수 (review-emoji.ts에서 import)
// 새 severity 추가 시 5곳 모두 업데이트 필요.
//
// IssueCategory는 여기(Zod enum, single source of truth)에서 정의되며,
// module/ai/types/suggestion.ts에서 z.infer로 derive된다.
export const codeSuggestionSchema = z.object({
  file: z.string().describe("Exact relative file path from the diff"),
  line: z.number().describe("Line number in the new file (added line from diff)"),
  before: z.string().describe("Current code at that location (exact match required)"),
  after: z.string().describe("Suggested replacement code"),
  explanation: z.string().describe("Why this change improves the code"),
  severity: z.enum(["CRITICAL", "WARNING", "SUGGESTION", "INFO"]),
});

// issueCategorySchema를 export하여 suggestion.ts에서 z.infer로 derive 가능하게 함
export const issueCategorySchema = z.enum(["bug", "design", "security", "performance", "testing", "general"]);

// NOTE: 구조화 출력 스키마에는 poem 필드를 포함하지 않는다.
// tiny 모드에서는 walkthrough, strengths, sequenceDiagram이 null/빈배열이다.
export const structuredReviewSchema = z.object({
  summary: z.string().describe("Brief PR overview in 2-3 sentences"),
  walkthrough: z.string().nullable().describe(
    "File-by-file markdown explanation of changes. null if review mode is tiny."
  ),
  strengths: z.array(z.string()).describe(
    "List of positive aspects found. Empty array if review mode is tiny."
  ),
  issues: z.array(z.object({
    file: z.string().nullable().describe("File path from diff, or null for project-level issues"),
    line: z.number().nullable().describe("Line number in new file, or null for file/project-level issues"),
    description: z.string().describe("Clear description of the issue"),
    severity: z.enum(["CRITICAL", "WARNING", "SUGGESTION", "INFO"]),
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
