# One-Click Code Fix Suggestion Feature

> **Status**: `TODO`
> **Priority**: High (Phase 1.2)
> **Last Updated**: 2026-01-12

---

## Overview

AI 리뷰에서 제안한 수정사항을 GitHub에서 한 번의 클릭으로 커밋할 수 있는 기능.

**참고**: CodeRabbit의 "committable fixes" 기능

---

## Requirements

### Functional

1. AI가 코드 수정 제안 시 GitHub suggestion 형식 사용
2. 파일별/라인별 정확한 위치에 제안 배치
3. 사용자가 "Commit suggestion" 버튼으로 즉시 적용 가능
4. 다중 파일 수정 제안 지원

### Non-Functional

1. JSON 파싱 실패 시 기존 마크다운 방식으로 fallback
2. 단일 라인 제안만 지원 (MVP)
3. 제안 데이터 DB 저장 (Review.suggestions JSON 필드)

---

## Technical Design

### Architecture

```
GitHub PR Event
    |
    v
Webhook Handler (route.ts)
    |
    v
Inngest Function (review.ts)
    |
    +-- fetch-pr-data (+ headSha)
    |
    +-- parse-diff (NEW)
    |
    +-- generate-context (RAG)
    |
    +-- generate-ai-review (structured JSON)
    |
    +-- post-suggestions (PR Review API)
    |
    +-- save-review (+ suggestions field)
    |
    v
GitHub PR Review Comments
```

### Key Components

#### 1. Diff Parser (`module/github/lib/diff-parser.ts`)

```typescript
interface ParsedChange {
  type: "add" | "del" | "normal";
  content: string;
  newLine?: number;
  oldLine?: number;
}

interface ParsedChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: ParsedChange[];
}

interface ParsedFile {
  path: string;
  fromPath?: string;
  additions: number;
  deletions: number;
  chunks: ParsedChunk[];
  isNew: boolean;
  isDeleted: boolean;
}

function parseUnifiedDiff(diffString: string): ParsedFile[];
function getAddedLines(file: ParsedFile): number[];
```

#### 2. Suggestion Types (`module/ai/types/suggestion.ts`)

```typescript
type SuggestionSeverity = "critical" | "warning" | "suggestion" | "info";

interface CodeSuggestion {
  file: string;
  line: number;
  before: string;
  after: string;
  explanation: string;
  severity: SuggestionSeverity;
}

interface StructuredReview {
  summary: string;
  walkthrough: string;
  strengths: string[];
  issues: string[];
  suggestions: CodeSuggestion[];
  sequenceDiagram?: string;
}
```

#### 3. PR Review API (`module/github/lib/pr-review.ts`)

```typescript
function postPRReviewWithSuggestions(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  summary: string,
  suggestions: CodeSuggestion[],
  parsedDiff: ParsedFile[]
): Promise<{ success: boolean; commentCount: number }>;

function postSimpleReview(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void>;
```

#### 4. AI Prompt (`module/ai/lib/review-prompt.ts`)

- `buildStructuredPrompt()`: JSON 출력 강제 프롬프트
- `parseAIResponse()`: JSON 파싱 + validation
- `structuredReviewToMarkdown()`: fallback용 마크다운 변환

---

## File Changes

### New Files (6)

| File | Purpose |
|------|---------|
| `module/github/lib/diff-parser.ts` | Unified diff 파싱 |
| `module/github/lib/pr-review.ts` | PR Review API 래퍼 |
| `module/ai/types/suggestion.ts` | 타입 정의 |
| `module/ai/constants/severity.ts` | Severity 공통 상수 |
| `module/ai/lib/review-prompt.ts` | 프롬프트 + 파서 |
| `docs/specs/one-click-fix-feature.md` | 본 문서 |

### Modified Files (4)

| File | Changes |
|------|---------|
| `module/github/lib/github.ts` | `getPullRequestDiff()`에 `headSha` 추가 |
| `inngest/functions/review.ts` | 파이프라인 재구성 |
| `prisma/schema.prisma` | `Review.suggestions` 필드 추가 |
| `package.json` | `parse-diff` 의존성 추가 |

---

## Implementation Steps

```
1. npm install parse-diff
2. Create module/ai/types/suggestion.ts
3. Create module/ai/constants/severity.ts
4. Create module/github/lib/diff-parser.ts
5. Modify module/github/lib/github.ts (add headSha, use Promise.all)
6. Create module/ai/lib/review-prompt.ts
7. Create module/github/lib/pr-review.ts
8. Modify prisma/schema.prisma + migrate
9. Modify inngest/functions/review.ts
10. Test locally with ngrok
```

---

## Fallback Strategy

```
AI Response
    |
    +-- JSON parse success --> PR Review API (suggestion blocks)
    |
    +-- JSON parse failure --> Issue Comment API (markdown)
```

---

## GitHub Suggestion Format

```markdown
**warning SUGGESTION**

설명 텍스트

\`\`\`suggestion
수정된 코드 라인
\`\`\`
```

---

## Constraints

1. **GitHub API Limit**: ~100 comments per review recommended
2. **Line Mapping**: Suggestions only on added lines (+)
3. **Commit SHA**: Must use PR head's latest commit
4. **Single Line**: MVP supports single-line suggestions only

---

## Dependencies

- `parse-diff`: ^0.11.1 (unified diff parser)
- `octokit`: existing (PR Review API)

---

## Database Schema Change

```prisma
model Review {
  // existing fields...
  suggestions Json?  // CodeSuggestion[]
}
```

---

## Testing Checklist

- [ ] parse-diff parses various diff formats
- [ ] AI outputs valid JSON
- [ ] Fallback works on JSON parse failure
- [ ] GitHub PR Review Comments created
- [ ] "Commit suggestion" button works
- [ ] suggestions saved to DB

---

## Implementation Code

### 0. `module/ai/constants/severity.ts`

```typescript
import type { SuggestionSeverity } from "@/module/ai/types/suggestion";

/**
 * Emoji mapping for suggestion severity levels
 * Centralized constant to maintain DRY principle
 */
export const SEVERITY_EMOJI: Record<SuggestionSeverity, string> = {
  critical: "🚨",
  warning: "⚠️",
  suggestion: "💡",
  info: "ℹ️",
} as const;
```

---

### 1. `module/ai/types/suggestion.ts`

```typescript
/**
 * Severity levels for code suggestions
 */
export type SuggestionSeverity = "critical" | "warning" | "suggestion" | "info";

/**
 * Individual code suggestion from AI review
 */
export interface CodeSuggestion {
  /** Relative file path (e.g., "src/api.ts") */
  file: string;
  /** Line number in the new file */
  line: number;
  /** Original code to be replaced */
  before: string;
  /** Suggested replacement code */
  after: string;
  /** Explanation of why this change is suggested */
  explanation: string;
  /** Severity level of the suggestion */
  severity: SuggestionSeverity;
}

/**
 * Structured AI review response
 */
export interface StructuredReview {
  summary: string;
  walkthrough: string;
  strengths: string[];
  issues: string[];
  suggestions: CodeSuggestion[];
  sequenceDiagram?: string;
}
```

---

### 2. `module/github/lib/diff-parser.ts`

```typescript
import parseDiff from "parse-diff";

/**
 * Parsed change from diff
 */
export interface ParsedChange {
  type: "add" | "del" | "normal";
  content: string;
  /** Line number in new file (for 'add' type) */
  newLine?: number;
  /** Line number in old file (for 'del' type) */
  oldLine?: number;
}

/**
 * Parsed chunk (hunk) from diff
 */
export interface ParsedChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: ParsedChange[];
}

/**
 * Parsed file from diff
 */
export interface ParsedFile {
  /** File path (uses 'to' for new/modified files) */
  path: string;
  /** Original file path (for renames) */
  fromPath?: string;
  additions: number;
  deletions: number;
  chunks: ParsedChunk[];
  /** Whether file was newly created */
  isNew: boolean;
  /** Whether file was deleted */
  isDeleted: boolean;
}

/**
 * Parse unified diff string into structured format
 */
export function parseUnifiedDiff(diffString: string): ParsedFile[] {
  const files = parseDiff(diffString);

  return files.map((file) => ({
    path: file.to ?? file.from ?? "unknown",
    fromPath: file.from !== file.to ? file.from : undefined,
    additions: file.additions,
    deletions: file.deletions,
    isNew: file.new ?? false,
    isDeleted: file.deleted ?? false,
    chunks: file.chunks.map((chunk) => ({
      oldStart: chunk.oldStart,
      oldLines: chunk.oldLines,
      newStart: chunk.newStart,
      newLines: chunk.newLines,
      changes: chunk.changes.map((change) => ({
        type: change.type === "add" ? "add" : change.type === "del" ? "del" : "normal",
        content: change.content,
        newLine: change.type === "add" ? change.ln : change.type === "normal" ? change.ln2 : undefined,
        oldLine: change.type === "del" ? change.ln : change.type === "normal" ? change.ln1 : undefined,
      })),
    })),
  }));
}

/**
 * Get all added line numbers for a specific file
 */
export function getAddedLines(file: ParsedFile): number[] {
  const lines: number[] = [];

  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      if (change.type === "add" && change.newLine !== undefined) {
        lines.push(change.newLine);
      }
    }
  }

  return lines;
}
```

---

### 3. `module/github/lib/github.ts` (수정 부분)

```typescript
// 기존 getPullRequestDiff 함수를 다음으로 교체

export async function getPullRequestDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
) {
  const octokit = createOctokitClient(token);

  // Parallel API calls for better performance
  const [{ data: pr }, { data: diff }] = await Promise.all([
    octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    }),
    octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: {
        format: "diff",
      },
    }),
  ]);

  return {
    title: pr.title,
    diff: diff as unknown as string,
    description: pr.body || "",
    headSha: pr.head.sha,  // 추가: PR의 최신 커밋 SHA
  };
}
```

---

### 4. `module/github/lib/pr-review.ts`

```typescript
import { Octokit } from "octokit";
import type { CodeSuggestion } from "@/module/ai/types/suggestion";
import type { ParsedFile } from "./diff-parser";
import { getAddedLines } from "./diff-parser";
import { SEVERITY_EMOJI } from "@/module/ai/constants/severity";

/**
 * Format a single suggestion as GitHub suggestion markdown
 */
export function formatSuggestionBody(suggestion: CodeSuggestion): string {
  const emoji = SEVERITY_EMOJI[suggestion.severity];
  const severityLabel = suggestion.severity.toUpperCase();

  return `**${emoji} ${severityLabel}**

${suggestion.explanation}

\`\`\`suggestion
${suggestion.after}
\`\`\``;
}

/**
 * Build review comment object for GitHub API
 */
interface ReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

/**
 * Convert suggestions to GitHub review comments
 * Performance optimized: O(n) instead of O(n*m*k)
 */
export function buildReviewComments(
  suggestions: CodeSuggestion[],
  parsedDiff: ParsedFile[]
): ReviewComment[] {
  // Step 1: Build file map for O(1) lookup (O(m))
  const fileMap = new Map<string, ParsedFile>();
  for (const file of parsedDiff) {
    const normalized = file.path.replace(/\\/g, "/");
    fileMap.set(normalized, file);

    // Also try without "a/" or "b/" prefix for git diffs
    if (normalized.startsWith("a/") || normalized.startsWith("b/")) {
      fileMap.set(normalized.slice(2), file);
    }
  }

  // Step 2: Cache added lines per file (O(m*k))
  const addedLinesCache = new Map<string, Set<number>>();
  for (const file of parsedDiff) {
    const lines = new Set(getAddedLines(file));
    addedLinesCache.set(file.path, lines);
  }

  // Step 3: Build comments with cached lookups (O(n))
  const comments: ReviewComment[] = [];

  for (const suggestion of suggestions) {
    const normalizedPath = suggestion.file.replace(/\\/g, "/");
    const file = fileMap.get(normalizedPath);

    if (!file) {
      console.warn(`File not found in diff: ${suggestion.file}`);
      continue;
    }

    const addedLines = addedLinesCache.get(file.path);
    if (!addedLines || !addedLines.has(suggestion.line)) {
      console.warn(`Line ${suggestion.line} is not an added line in ${suggestion.file}`);
      continue;
    }

    comments.push({
      path: file.path,
      line: suggestion.line,
      side: "RIGHT",
      body: formatSuggestionBody(suggestion),
    });
  }

  return comments;
}

/**
 * Post PR review with inline suggestions
 */
export async function postPRReviewWithSuggestions(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  reviewSummary: string,
  suggestions: CodeSuggestion[],
  parsedDiff: ParsedFile[]
): Promise<{ success: boolean; commentCount: number }> {
  const octokit = new Octokit({ auth: token });

  // Early return if no suggestions - post summary only
  if (suggestions.length === 0) {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      body: reviewSummary,
      event: "COMMENT",
    });
    return { success: true, commentCount: 0 };
  }

  // Convert suggestions to review comments
  const comments = buildReviewComments(suggestions, parsedDiff);

  // GitHub limits: ~100 comments per review is safe
  const MAX_COMMENTS = 50;
  const limitedComments = comments.slice(0, MAX_COMMENTS);

  if (comments.length > MAX_COMMENTS) {
    console.warn(`Truncated ${comments.length - MAX_COMMENTS} suggestions due to GitHub limits`);
  }

  try {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      body: reviewSummary,
      comments: limitedComments,
      event: "COMMENT",
    });

    return { success: true, commentCount: limitedComments.length };
  } catch (error) {
    console.error("Failed to post PR review:", error);
    throw error;
  }
}

/**
 * Post a simple review without inline comments (fallback)
 */
export async function postSimpleReview(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: `## AI Code Review\n\n${body}\n\n---\n*Generated by HReviewer*`,
  });
}
```

---

### 5. `module/ai/lib/review-prompt.ts`

```typescript
import type { StructuredReview, CodeSuggestion } from "@/module/ai/types/suggestion";
import type { ParsedFile } from "@/module/github/lib/diff-parser";
import {
  SECTION_HEADERS,
  type LanguageCode,
  getLanguageName,
} from "@/module/settings/constants";
import { SEVERITY_EMOJI } from "@/module/ai/constants/severity";

/**
 * Build available files info for AI context
 */
function buildFileContext(parsedFiles: ParsedFile[]): string {
  return parsedFiles
    .map((f) => `- ${f.path} (${f.additions} additions, ${f.deletions} deletions)`)
    .join("\n");
}

/**
 * Build structured prompt for AI review with JSON output
 */
export function buildStructuredPrompt(params: {
  title: string;
  description: string;
  diff: string;
  context: string[];
  langCode: LanguageCode;
  parsedFiles: ParsedFile[];
}): string {
  const { title, description, diff, context, langCode, parsedFiles } = params;
  const headers = SECTION_HEADERS[langCode];

  const languageInstruction =
    langCode !== "en"
      ? `\n\nIMPORTANT: Write all text content in ${getLanguageName(langCode)}. Keep code, file paths, and technical terms in English.`
      : "";

  return `You are an expert code reviewer. Analyze the following pull request and provide a structured review.${languageInstruction}

## PR Information
- **Title**: ${title}
- **Description**: ${description || "No description provided"}

## Codebase Context
${context.join("\n\n")}

## Changed Files
${buildFileContext(parsedFiles)}

## Code Changes
\`\`\`diff
${diff}
\`\`\`

## Response Format
You MUST respond with ONLY a valid JSON object. No markdown, no explanation outside JSON.

CRITICAL: For the "suggestions" array, you MUST:
1. Only reference files that appear in the "Changed Files" list above
2. Only use line numbers that correspond to ADDED lines (lines starting with +) in the diff
3. The "before" field should contain the current code at that line
4. The "after" field should contain your suggested replacement

JSON Schema:
{
  "summary": "Brief PR overview (2-3 sentences)",
  "walkthrough": "File-by-file explanation of changes",
  "strengths": ["Good thing 1", "Good thing 2"],
  "issues": ["Issue 1", "Issue 2"],
  "suggestions": [
    {
      "file": "exact/path/from/diff.ts",
      "line": 42,
      "before": "const x = fetch(url)",
      "after": "const x = await fetch(url)",
      "explanation": "Missing await for async operation",
      "severity": "warning"
    }
  ]
}

Section headers for your response:
- summary → ${headers.summary}
- walkthrough → ${headers.walkthrough}
- strengths → ${headers.strengths}
- issues → ${headers.issues}
- suggestions → ${headers.suggestions}

Provide 3-5 specific, actionable suggestions if applicable. If no suggestions are needed, return an empty array.`;
}

/**
 * Type guard for validating CodeSuggestion objects
 */
function isValidCodeSuggestion(s: unknown): s is CodeSuggestion {
  if (typeof s !== "object" || s === null) return false;

  const obj = s as Record<string, unknown>;

  return (
    typeof obj.file === "string" &&
    typeof obj.line === "number" &&
    typeof obj.before === "string" &&
    typeof obj.after === "string" &&
    typeof obj.explanation === "string" &&
    typeof obj.severity === "string" &&
    ["critical", "warning", "suggestion", "info"].includes(obj.severity)
  );
}

/**
 * Parse AI response as JSON with error handling
 */
export function parseAIResponse(text: string): StructuredReview | null {
  // Try to extract JSON from response (in case AI added extra text)
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    console.warn("No JSON found in AI response");
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.walkthrough !== "string" ||
      !Array.isArray(parsed.strengths) ||
      !Array.isArray(parsed.issues) ||
      !Array.isArray(parsed.suggestions)
    ) {
      console.warn("Invalid JSON structure in AI response");
      return null;
    }

    // Validate suggestions structure using type guard
    const validSuggestions: CodeSuggestion[] = parsed.suggestions.filter(isValidCodeSuggestion);

    return {
      summary: parsed.summary,
      walkthrough: parsed.walkthrough,
      strengths: parsed.strengths,
      issues: parsed.issues,
      suggestions: validSuggestions,
      sequenceDiagram: parsed.sequenceDiagram,
    };
  } catch (error) {
    console.error("Failed to parse AI response as JSON:", error);
    return null;
  }
}

/**
 * Convert structured review to markdown (for fallback display)
 */
export function structuredReviewToMarkdown(
  review: StructuredReview,
  langCode: LanguageCode
): string {
  const headers = SECTION_HEADERS[langCode];

  let md = `## ${headers.summary}\n\n${review.summary}\n\n`;
  md += `## ${headers.walkthrough}\n\n${review.walkthrough}\n\n`;

  if (review.strengths.length > 0) {
    md += `## ${headers.strengths}\n\n${review.strengths.map(s => `- ${s}`).join("\n")}\n\n`;
  }

  if (review.issues.length > 0) {
    md += `## ${headers.issues}\n\n${review.issues.map(i => `- ${i}`).join("\n")}\n\n`;
  }

  if (review.suggestions.length > 0) {
    md += `## ${headers.suggestions}\n\n`;
    for (const s of review.suggestions) {
      const emoji = SEVERITY_EMOJI[s.severity];
      md += `### ${emoji} ${s.file}:${s.line}\n\n`;
      md += `${s.explanation}\n\n`;
      md += `\`\`\`diff\n- ${s.before}\n+ ${s.after}\n\`\`\`\n\n`;
    }
  }

  return md;
}
```

---

### 6. `inngest/functions/review.ts` (전체 수정)

```typescript
import prisma from "@/lib/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/module/github/lib/github";
import { parseUnifiedDiff } from "@/module/github/lib/diff-parser";
import { postPRReviewWithSuggestions, postSimpleReview } from "@/module/github/lib/pr-review";
import { buildStructuredPrompt, parseAIResponse, structuredReviewToMarkdown } from "@/module/ai/lib/review-prompt";
import { retrieveContext } from "@/module/ai/lib/rag";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import {
  type LanguageCode,
  isValidLanguageCode,
} from "@/module/settings/constants";

export const generateReview = inngest.createFunction(
  { id: "generate-review" },
  { event: "pr.review.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId, preferredLanguage = "en" } = event.data;

    // Step 1: Fetch PR data including headSha
    const prData = await step.run("fetch-pr-data", async () => {
      const account = await prisma.account.findFirst({
        where: { userId, providerId: "github" },
      });

      if (!account?.accessToken) {
        throw new Error("Github access token not found");
      }

      const data = await getPullRequestDiff(account.accessToken, owner, repo, prNumber);
      return { ...data, token: account.accessToken };
    });

    const { diff, title, description, token, headSha } = prData;

    // Step 2: Parse diff to extract file/line information
    const parsedDiff = await step.run("parse-diff", async () => {
      return parseUnifiedDiff(diff);
    });

    // Step 3: Generate RAG context
    const context = await step.run("generate-context", async () => {
      const query = `${title}\n\n${description}`;
      return await retrieveContext(query, `${owner}/${repo}`);
    });

    // Step 4: Generate AI review with structured output
    const langCode: LanguageCode = isValidLanguageCode(preferredLanguage)
      ? preferredLanguage
      : "en";

    const aiResult = await step.run("generate-ai-review", async () => {
      const prompt = buildStructuredPrompt({
        title,
        description,
        diff,
        context,
        langCode,
        parsedFiles: parsedDiff,
      });

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });

      // Try to parse as structured JSON
      const structured = parseAIResponse(text);

      return {
        raw: text,
        structured,
        isStructured: structured !== null,
      };
    });

    // Step 5: Post review to GitHub
    let reviewText: string;
    let suggestionsPosted = 0;

    if (aiResult.isStructured && aiResult.structured) {
      // Structured review: use PR Review API with inline suggestions
      const result = await step.run("post-suggestions", async () => {
        try {
          const { commentCount } = await postPRReviewWithSuggestions(
            token,
            owner,
            repo,
            prNumber,
            headSha,
            `## AI Code Review\n\n${aiResult.structured!.summary}`,
            aiResult.structured!.suggestions,
            parsedDiff
          );
          return { success: true, commentCount };
        } catch (error) {
          console.error("Failed to post structured review, falling back:", error);
          return { success: false, commentCount: 0 };
        }
      });

      if (result.success) {
        suggestionsPosted = result.commentCount;
        reviewText = structuredReviewToMarkdown(aiResult.structured, langCode);
      } else {
        // Fallback to simple review
        reviewText = structuredReviewToMarkdown(aiResult.structured, langCode);
        await step.run("post-fallback-comment", async () => {
          await postSimpleReview(token, owner, repo, prNumber, reviewText);
        });
      }
    } else {
      // Fallback: raw markdown response
      reviewText = aiResult.raw;
      await step.run("post-comment", async () => {
        await postReviewComment(token, owner, repo, prNumber, reviewText);
      });
    }

    // Step 6: Save to database
    await step.run("save-review", async () => {
      const repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      await prisma.review.create({
        data: {
          repositoryId: repository.id,
          prNumber,
          prTitle: title,
          prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          review: reviewText,
          reviewType: "FULL_REVIEW",
          status: "completed",
          // 새 필드: suggestions JSON 저장
          suggestions: aiResult.structured?.suggestions ?? null,
        },
      });
    });

    return {
      success: true,
      suggestionsPosted,
      isStructured: aiResult.isStructured,
    };
  }
);
```

---

### 7. `prisma/schema.prisma` (수정 부분)

```prisma
model Review {
  id           String     @id @default(cuid())
  repositoryId String
  repository   Repository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  prNumber     Int
  prTitle      String
  prUrl        String
  review       String     @db.Text
  reviewType   ReviewType @default(FULL_REVIEW)
  status       String     @default("completed")
  suggestions  Json?      // 추가: CodeSuggestion[] 저장
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@index([repositoryId])
  @@map("review")
}
```

**마이그레이션 명령어**:
```bash
npx prisma migrate dev --name add_suggestions_to_review
```

---

## Example Diff & AI Response

### Input Diff Example

```diff
diff --git a/src/api/users.ts b/src/api/users.ts
index abc123..def456 100644
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -10,6 +10,10 @@ export async function getUser(id: string) {
+  const response = fetch(`/api/users/${id}`);
+  const data = response.json();
+  console.log(data);
+  return data;
 }
```

> **Note**: Suggestions can only be placed on **added lines** (lines starting with `+`).
> In this example, lines 10-13 are all added lines.

### Expected AI JSON Response

```json
{
  "summary": "사용자 조회 API에 fetch 및 응답 파싱 로직이 추가되었습니다.",
  "walkthrough": "src/api/users.ts: getUser 함수에서 fetch로 사용자 데이터를 가져오고 JSON으로 파싱하여 반환하도록 수정되었습니다.",
  "strengths": ["응답 데이터 파싱 로직 추가", "디버깅용 로그 추가"],
  "issues": ["async/await 누락으로 인한 Promise 처리 오류 가능성"],
  "suggestions": [
    {
      "file": "src/api/users.ts",
      "line": 10,
      "before": "  const response = fetch(`/api/users/${id}`);",
      "after": "  const response = await fetch(`/api/users/${id}`);",
      "explanation": "fetch는 비동기 함수이므로 await로 응답을 기다려야 합니다.",
      "severity": "critical"
    },
    {
      "file": "src/api/users.ts",
      "line": 11,
      "before": "  const data = response.json();",
      "after": "  const data = await response.json();",
      "explanation": "fetch 응답의 json() 메서드는 Promise를 반환하므로 await가 필요합니다.",
      "severity": "critical"
    },
    {
      "file": "src/api/users.ts",
      "line": 12,
      "before": "  console.log(data);",
      "after": "  // console.log(data);",
      "explanation": "프로덕션 코드에서는 디버깅용 console.log를 제거하거나 주석 처리하는 것이 좋습니다.",
      "severity": "suggestion"
    }
  ]
}
```

### GitHub에 게시되는 Suggestion 형태

```markdown
**🚨 CRITICAL**

fetch 응답의 json() 메서드는 Promise를 반환하므로 await가 필요합니다.

\`\`\`suggestion
  const data = await response.json();
\`\`\`
```

---

## References

- [GitHub Pull Request Reviews API](https://docs.github.com/en/rest/pulls/reviews)
- [GitHub Suggesting Changes](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/incorporating-feedback-in-your-pull-request)
- [parse-diff npm](https://www.npmjs.com/package/parse-diff)
- [CodeRabbit Committable Fixes](https://www.coderabbit.ai/)
