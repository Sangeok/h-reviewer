# One-Click Fix Feature Spec

> **Status**: SUPERSEDED → [`structured-inline-review-feature.md`](structured-inline-review-feature.md)에 통합
> **Created**: 2026-03-24
> **Branch**: `oneclickEdit`

---

## 1. 개요

### 1.1 목적

PR 리뷰에서 AI가 제안하는 코드 개선 사항을 **원클릭으로 적용**할 수 있는 기능. CodeRabbit, GitHub Copilot의 suggestion 기능과 유사하게, 사용자가 제안을 검토한 후 클릭 한 번으로 PR 브랜치에 커밋한다.

### 1.2 인터랙션 Surface

| Surface | 설명 | 적용 방식 |
|---------|------|-----------|
| **GitHub PR** | PR Review API로 인라인 `` ```suggestion `` 블록 포스팅 | GitHub 네이티브 "Commit suggestion" 버튼 사용 |
| **Dashboard** | hreviewer 대시보드에서 제안 카드 + "Apply Fix" 버튼 | GitHub API로 PR 브랜치에 직접 커밋 |

### 1.3 현재 상태 vs 목표

| 항목 | 현재 | 목표 |
|------|------|------|
| AI 출력 형식 | 비구조화 마크다운 텍스트 | 구조화 JSON (Zod 스키마) + 마크다운 폴백 |
| GitHub 포스팅 | 단일 issue comment | 인라인 suggestion 블록 (PR Review API) |
| 제안 저장 | 없음 (review 텍스트에 포함) | 독립 Suggestion 모델 |
| 대시보드 UI | 리뷰 목록 (텍스트 미리보기) | 리뷰 상세 + 제안 카드 + Apply/Dismiss |
| 코드 적용 | 불가능 | PR 브랜치 직접 커밋 |

---

## 2. 아키텍처 개요

### 2.1 전체 데이터 흐름

```
PR Opened/Synced
    |
    v
Webhook Handler (app/api/webhooks/github/route.ts)
    |
    v
Inngest Event: "pr.review.requested"
    |
    v
┌──────────────────────────────────────────────────────────┐
│ generateReview (inngest/functions/review.ts)              │
│                                                           │
│  Step 1: fetch-pr-data (+ headSha, headBranch, state)    │
│  Step 2: 인라인 분류 (sizeMode, langCode, topK) 변경없음 │
│  Step 3: generate-context (RAG - Pinecone) 변경없음      │
│  Step 4: generate-ai-review                               │
│          ├─ parseDiffToChangedFiles() 내부 호출            │
│          ├─ experimental_output + Zod → 구조화 경로       │
│          └─ 실패 시 → 기존 마크다운 폴백 경로             │
│  Step 5: validate-review (Mermaid 검증)                   │
│          └─ 구조화 경로: sequenceDiagram 필드도 검증      │
│  Step 6: post-review (기존 post-comment에서 이름 변경)    │
│          ├─ 구조화: postPRReviewWithSuggestions()          │
│          └─ 폴백: postReviewComment() (기존)              │
│  Step 7: save-review ($transaction 적용)                  │
│          ├─ Review 레코드 생성 (headSha 포함)             │
│          └─ Suggestion 레코드 batch 생성                  │
└──────────────────────────────────────────────────────────┘
    |
    v
┌──────────────┐    ┌─────────────────────────┐
│ GitHub PR    │    │ Dashboard                │
│ (inline      │    │ /dashboard/reviews/[id]  │
│  suggestion  │    │                          │
│  blocks)     │    │ SuggestionCard           │
│              │    │   [Apply Fix] [Dismiss]  │
└──────────────┘    └────────────┬────────────┘
                                 |
                                 v (Apply Fix 클릭)
                    ┌─────────────────────────┐
                    │ applySuggestion()        │
                    │                          │
                    │ 1. 파일 내용 조회         │
                    │ 2. 충돌 감지             │
                    │ 3. 코드 교체             │
                    │ 4. PR 브랜치 커밋        │
                    │ 5. Suggestion 상태 갱신  │
                    └─────────────────────────┘
```

### 2.2 핵심 설계 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| AI 구조화 출력 | Vercel AI SDK `Output.object()` + Zod | 타입 안전, 자동 검증, 기존 `generateText` 호환. **필수**: `experimental_output`은 불안정 API — `ai` 패키지 마이너 업데이트 시 인터페이스 변경 가능. `package.json`에서 `ai` 버전을 **반드시 exact(`"ai": "5.0.115"`, caret `^` 제거)**로 고정할 것. 업데이트 전 호환성 확인 필수 |
| 제안 저장 | 독립 `Suggestion` 모델 | 개별 상태 추적, 쿼리 독립성, 적용 이력 기록 |
| 커밋 전략 | PR 브랜치 직접 커밋 | CodeRabbit/GitHub 네이티브와 동일한 UX |
| 폴백 전략 | 구조화 실패 시 기존 마크다운 경로 | 기존 기능 무중단 보장 |

---

## 3. DB 스키마 변경

### 3.1 신규: `Suggestion` 모델

**파일**: `prisma/schema.prisma`

```prisma
enum SuggestionStatus {
  PENDING
  APPLIED
  DISMISSED
  CONFLICTED
}

enum SuggestionSeverity {
  CRITICAL
  WARNING
  SUGGESTION
  INFO
}

model Suggestion {
  id            String              @id @default(cuid())
  reviewId      String
  review        Review              @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  filePath      String              // "src/api/users.ts"
  lineNumber    Int                 // diff 기준 added line 번호
  beforeCode    String   @db.Text   // 현재 코드
  afterCode     String   @db.Text   // 제안 코드
  explanation   String   @db.Text   // 변경 이유
  severity      SuggestionSeverity  @default(SUGGESTION)

  status        SuggestionStatus    @default(PENDING)
  appliedAt     DateTime?
  appliedCommitSha String?          // 적용 커밋 SHA
  dismissedAt   DateTime?

  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  @@index([reviewId])
  @@index([status])
  @@index([appliedCommitSha])
  @@map("suggestion")
}
```

### 3.2 수정: `Review` 모델

```prisma
model Review {
  id            String       @id @default(cuid())
  repositoryId  String
  repository    Repository   @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  prNumber      Int
  prTitle       String
  prUrl         String
  review        String       @db.Text
  reviewType    ReviewType   @default(FULL_REVIEW)
  status        String       @default("completed")
  headSha       String?      // 리뷰 시점 PR head commit SHA (NEW)
  suggestions   Suggestion[] // Suggestion 관계 (NEW)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  @@index([repositoryId])
  @@map("review")
}
```

### 3.3 마이그레이션

```bash
npx prisma migrate dev --name add-suggestion-model
npx prisma generate
```

---

## 4. 타입 정의

### 4.1 `module/ai/types/suggestion.ts` (신규)

```typescript
export type SuggestionSeverity = "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";

export interface CodeSuggestion {
  file: string;       // diff에서 추출한 정확한 상대 파일 경로
  line: number;       // new file 기준 라인 번호
  before: string;     // 현재 코드 (여러 줄 가능)
  after: string;      // 제안 코드 (여러 줄 가능)
  explanation: string; // 변경 이유
  severity: SuggestionSeverity;
}

export interface StructuredReview {
  summary: string;
  walkthrough: string | null;  // tiny 모드에서는 null
  strengths: string[];          // tiny 모드에서는 빈 배열
  issues: string[];
  suggestions: CodeSuggestion[];
  sequenceDiagram: string | null;
}
```

### 4.2 `module/suggestion/types/index.ts` (신규)

```typescript
import type { SuggestionStatus, SuggestionSeverity } from "@/lib/generated/prisma/client";

export interface ApplySuggestionResult {
  success: boolean;
  commitSha?: string;
  error?: string;
  reason?: "conflict" | "not_found" | "pr_merged" | "unauthorized" | "api_error" | "fork_no_access";
}

export interface SuggestionWithReview {
  id: string;
  filePath: string;
  lineNumber: number;
  beforeCode: string;
  afterCode: string;
  explanation: string;
  severity: SuggestionSeverity;
  status: SuggestionStatus;
  appliedAt: Date | null;
  appliedCommitSha: string | null;
  review: {
    id: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
    headSha: string | null;
    repository: {
      owner: string;
      name: string;
    };
  };
}
```

---

## 5. AI 파이프라인 수정

### 5.1 Zod 스키마: `module/ai/lib/review-schema.ts` (신규)

**의존성 추가**: `package.json`에 `zod` 직접 추가 필요

```bash
npm install zod
```

```typescript
import { z } from "zod";

// MAINTENANCE NOTE: severity 값이 다음 4곳에서 독립적으로 정의된다:
// 1. prisma/schema.prisma — enum SuggestionSeverity (source of truth)
// 2. 여기 (Zod 스키마) — z.enum([...])
// 3. module/ai/types/suggestion.ts — type SuggestionSeverity
// 4. module/suggestion/constants/index.ts — SEVERITY_CONFIG 키
// 5. module/github/lib/pr-review.ts — formatSuggestionComment emoji 매핑
// 새 severity 추가 시 5곳 모두 업데이트 필요. Zod만 누락하면 AI가 새 값을
// 생성해도 validation에서 거부되어 구조화 출력이 실패하고 마크다운 폴백으로 빠진다.
// 향후 Prisma 생성 타입에서 Zod enum을 자동 파생하는 유틸리티 도입을 고려할 것.
export const codeSuggestionSchema = z.object({
  file: z.string().describe("Exact relative file path from the diff"),
  line: z.number().describe("Line number in the new file (added line from diff)"),
  before: z.string().describe("Current code at that location (exact match required)"),
  after: z.string().describe("Suggested replacement code"),
  explanation: z.string().describe("Why this change improves the code"),
  severity: z.enum(["CRITICAL", "WARNING", "SUGGESTION", "INFO"]),
});

// NOTE: 구조화 출력 스키마에는 poem 필드를 포함하지 않는다.
// 기존 마크다운 경로에서는 getSectionPolicy에 따라 poem 섹션이 포함되지만,
// 구조화 경로에서는 actionable한 섹션(summary, walkthrough, suggestions 등)에 집중한다.
// poem은 폴백 마크다운 경로에서만 생성된다.
// NOTE: sizeMode에 따라 일부 섹션이 제외될 수 있다 (getSectionPolicy 참조).
// tiny 모드에서는 walkthrough, strengths, sequenceDiagram이 비활성화된다.
// 이 필드들을 nullable/optional로 정의하여, AI가 sizeMode에 따라 생략할 수 있도록 한다.
// 프롬프트(buildStructuredPrompt)에서 sizeMode별 지시를 내리면
// AI는 해당 필드를 null/빈배열로 반환한다.
export const structuredReviewSchema = z.object({
  summary: z.string().describe("Brief PR overview in 2-3 sentences"),
  walkthrough: z.string().nullable().describe(
    "File-by-file markdown explanation of changes. null if review mode is tiny."
  ),
  strengths: z.array(z.string()).describe(
    "List of positive aspects found. Empty array if review mode is tiny."
  ),
  issues: z.array(z.string()).describe("List of problems or concerns found"),
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
```

### 5.2 프롬프트 빌더: `module/ai/lib/review-prompt.ts` (신규)

diff를 파싱하여 AI에게 정확한 파일/라인 정보를 제공하는 프롬프트를 생성한다.

```typescript
import type { ReviewSizeMode } from "./review-size-policy";
import type { LanguageCode } from "@/module/settings/constants";
import { getLanguageName } from "@/module/settings/constants";
import { SECTION_HEADERS } from "@/shared/constants";
import { getSectionPolicy } from "./review-size-policy";

/**
 * 기존 review.ts에서 이동한 함수.
 * size 모드별 프롬프트 섹션 지시문을 생성한다.
 */
export function buildSectionInstruction(
  mode: ReviewSizeMode,
  headers: (typeof SECTION_HEADERS)[LanguageCode],
): string {
  const policy = getSectionPolicy(mode);
  const sections: string[] = [];
  let idx = 1;

  if (policy.summary) {
    const extra = mode === "tiny" ? " (2-3 sentences only)" : mode === "large" ? " (focus on key changed files)" : "";
    sections.push(`${idx++}. **${headers.summary}**${extra}`);
  }
  if (policy.walkthrough) {
    const extra = mode === "small" ? " (brief, one line per file)" : mode === "large" ? " (top 10 changed files only)" : "";
    sections.push(`${idx++}. **${headers.walkthrough}**${extra}`);
  }
  if (policy.sequenceDiagram) {
    sections.push(`${idx++}. **${headers.sequenceDiagram}**: Use \`\`\`mermaid block.`);
  }
  if (policy.strengths) {
    sections.push(`${idx++}. **${headers.strengths}**`);
  }
  if (policy.issues) {
    const extra = mode === "tiny" ? " (max 1 issue unless critical)" : mode === "large" ? " (prioritized by severity)" : "";
    sections.push(`${idx++}. **${headers.issues}**${extra}`);
  }
  if (policy.suggestions) {
    const extra = mode === "tiny" ? " (max 2 suggestions)" : mode === "large" ? " (top 5 only)" : "";
    sections.push(`${idx++}. **${headers.suggestions}**${extra}`);
  }
  if (policy.poem) {
    sections.push(`${idx++}. **${headers.poem}**: A short creative poem.`);
  }

  return `Provide the review with these sections:\n${sections.join("\n")}`;
}

interface PromptParams {
  title: string;
  description: string;
  diff: string;
  context: string[];
  langCode: LanguageCode;
  sizeMode: ReviewSizeMode;
  changedFilesSummary: string; // parse-diff로 추출한 파일별 added line 정보
}

export function buildStructuredPrompt(params: PromptParams): string {
  const { title, description, diff, context, langCode, sizeMode, changedFilesSummary } = params;

  const languageInstruction = langCode !== "en"
    ? `\n\nIMPORTANT: Write summary, walkthrough, strengths, issues, and suggestion explanations in ${getLanguageName(langCode)}. Keep code in the before/after fields in the original programming language.`
    : "";

  const suggestionLimit = getSuggestionLimit(sizeMode);

  return `You are an expert code reviewer. Analyze this PR and provide structured feedback.${languageInstruction}

## PR Information
- Title: ${title}
- Description: ${description || "No description provided"}

## Changed Files (with added line numbers)
${changedFilesSummary}

${context.length > 0 ? `## Codebase Context\n${context.join("\n\n")}` : ""}

## Code Changes
\`\`\`diff
${diff}
\`\`\`

## Review Instructions
- Review Mode: ${sizeMode.toUpperCase()}
- Provide up to ${suggestionLimit} code suggestions, prioritized by severity
- For each suggestion:
  - file: must be an exact file path from the diff
  - line: must be a valid added line number from that file
  - before: must exactly match the current code at that location (copy from diff)
  - after: the improved version of that code
  - explanation: why this change is an improvement
  - severity: CRITICAL for bugs/security, WARNING for potential issues, SUGGESTION for improvements, INFO for style/convention
- Only suggest changes for added/modified lines (+ lines in the diff)
- The before field must be an exact substring of the current file content`;
}

function getSuggestionLimit(mode: ReviewSizeMode): number {
  switch (mode) {
    case "tiny": return 2;
    case "small": return 3;
    case "normal": return 5;
    case "large": return 5;
  }
}

/**
 * 구조화 출력 실패 시 기존 마크다운 프롬프트를 생성한다.
 * 기존 review.ts의 프롬프트 로직을 그대로 재사용한다.
 */
interface FallbackPromptParams {
  title: string;
  description: string;
  diff: string;
  context: string[];
  langCode: LanguageCode;
  sizeMode: ReviewSizeMode;
  headers: (typeof SECTION_HEADERS)[LanguageCode];
}

export function buildFallbackPrompt(params: FallbackPromptParams): string {
  const { title, description, diff, context, langCode, sizeMode, headers } = params;

  const languageInstruction = langCode !== "en"
    ? `\n\nIMPORTANT: Write the entire review in ${getLanguageName(langCode)}. All section headers must be exactly as specified below. However, keep technical terms in English where appropriate.`
    : "";

  const mermaidInstruction = getSectionPolicy(sizeMode).sequenceDiagram
    ? `\nIf you include a Mermaid sequence diagram, follow these rules STRICTLY:
- Use ONLY sequenceDiagram type.
- participant ids must match [a-zA-Z0-9_]+ only.
- In message/note/label text: NEVER use backticks, quotes, braces, brackets, semicolons, or angle brackets. Parentheses are OK. Unicode letters (Korean, etc.) are allowed.
- Allowed control structures: loop/end, alt/else/end, opt/end, autonumber.
- Do NOT use activate/deactivate or +/- on arrows.
- If you are uncertain about the validity, output "Diagram omitted" instead.`
    : "";

  const sectionInstruction = buildSectionInstruction(sizeMode, headers);

  return `You are an expert code reviewer.${languageInstruction}

PR Title: ${title}
PR Description: ${description || "No description provided"}

${context.length > 0 ? `Context from Codebase:\n${context.join("\n\n")}` : ""}

Code Changes:
\`\`\`diff
${diff}
\`\`\`

Review Mode: ${sizeMode.toUpperCase()}
${sectionInstruction}
${mermaidInstruction}

Format your response in markdown.`;
}
```

> **참고**: `buildFallbackPrompt`는 기존 `review.ts`에 있던 프롬프트 로직을 함수로 추출한 것이다. 기존 `review.ts`에서 인라인으로 구성하던 프롬프트를 이 함수로 대체하여, 구조화 경로와 폴백 경로 모두에서 일관된 프롬프트 관리가 가능하다.
>
> **`buildSectionInstruction` 이동**: 기존 `review.ts`에서 non-export 내부 함수였던 `buildSectionInstruction`을 이 파일(`review-prompt.ts`)로 이동하여 export한다. `review.ts`에서는 해당 함수를 삭제하고 `review-prompt.ts`에서 import하여 사용한다. 이렇게 하면 순환 의존성 없이 양쪽에서 공유할 수 있다.

### 5.3 구조화 출력 → 마크다운 변환: `module/ai/lib/review-formatter.ts` (신규)

구조화된 JSON 출력을 기존 마크다운 형식으로 변환하여 `review` 텍스트 필드에 저장한다.

> **출력 일관성 주의**: 구조화 경로에서는 poem 섹션이 **생략**되지만, 폴백 마크다운 경로에서는 `getSectionPolicy`에 따라 poem이 **포함**된다. 같은 PR이라도 어떤 경로를 탔느냐에 따라 저장되는 리뷰 텍스트 구조가 달라진다. 이는 의도된 트레이드오프이며 (구조화 경로는 actionable 섹션에 집중), 사용자에게 혼란을 줄 수 있으므로 향후 폴백 경로에서도 poem을 제거하거나 구조화 스키마에 poem을 추가하여 일관성을 확보하는 것을 고려할 것.

```typescript
import type { StructuredReviewOutput } from "./review-schema";
import type { LanguageCode } from "@/module/settings/constants";
import { SECTION_HEADERS } from "@/shared/constants";

export function formatStructuredReviewToMarkdown(
  output: StructuredReviewOutput,
  langCode: LanguageCode
): string {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  // Summary
  sections.push(`## ${headers.summary}\n\n${output.summary}`);

  // Walkthrough
  if (output.walkthrough) {
    sections.push(`## ${headers.walkthrough}\n\n${output.walkthrough}`);
  }

  // Sequence Diagram
  if (output.sequenceDiagram) {
    sections.push(`## ${headers.sequenceDiagram}\n\n\`\`\`mermaid\n${output.sequenceDiagram}\n\`\`\``);
  }

  // Strengths
  if (output.strengths.length > 0) {
    const items = output.strengths.map(s => `- ${s}`).join("\n");
    sections.push(`## ${headers.strengths}\n\n${items}`);
  }

  // Issues
  if (output.issues.length > 0) {
    const items = output.issues.map(i => `- ${i}`).join("\n");
    sections.push(`## ${headers.issues}\n\n${items}`);
  }

  // Suggestions (텍스트 형태로도 포함)
  if (output.suggestions.length > 0) {
    const items = output.suggestions.map(s =>
      `- **${s.file}:${s.line}** [${s.severity}]: ${s.explanation}`
    ).join("\n");
    sections.push(`## ${headers.suggestions}\n\n${items}`);
  }

  return sections.join("\n\n");
}
```

### 5.4 Inngest 파이프라인 수정: `inngest/functions/review.ts`

기존 7단계 → 7단계 (내부 로직 변경). 기존 `step.run()` 구조를 최대한 유지하되 내부에서 구조화 경로를 분기한다. `parse-diff`는 별도 step이 아니라 generate-ai-review 내부에서 호출한다.

> **`buildSectionInstruction` 삭제**: 기존 `review.ts` 내부의 `buildSectionInstruction` 함수를 삭제하고, `review-prompt.ts`에서 import한다. 이 함수는 `review-prompt.ts`로 이동된 상태이다 (Section 5.2 참조).

> **Step 이름 변경 주의 (배포 체크리스트)**:
> 기존 `"post-comment"` step을 `"post-review"`로 변경한다. Inngest는 step name을 idempotency key로 사용하므로, 진행 중인 이벤트가 있으면 renamed step이 "새 step"으로 인식되어 **리뷰가 이중 포스팅**될 수 있다.
>
> **배포 전 필수 체크리스트**:
> 1. Inngest 대시보드에서 `generate-review` 함수의 in-flight 이벤트가 **0건**인지 확인
> 2. 0건이 아니면 모든 이벤트가 완료될 때까지 대기 (또는 Inngest 큐 drain)
> 3. 배포 후 첫 PR 리뷰가 이중 포스팅되지 않는지 모니터링
> 4. 롤백 시에도 step name이 다시 바뀌므로 동일한 리스크 존재 — 롤백 전에도 in-flight 확인 필요

> **전체 Step 매핑** (기존 → 변경):
> | # | 기존 Step | 변경 후 Step | 변경 내용 |
> |---|-----------|-------------|-----------|
> | 1 | `fetch-pr-data` | `fetch-pr-data` | headSha, headBranch, state, merged 추가 |
> | 2 | 인라인 분류 (step.run 아님) | 인라인 분류 (변경 없음) | sizeMode, langCode, topK 계산 유지 |
> | 3 | `generate-context` | `generate-context` | 변경 없음 |
> | 4 | `generate-ai-review` | `generate-ai-review` | 구조화 출력 + Zod, diff 파싱, 폴백 |
> | 5 | `validate-review` | `validate-review` | 구조화 경로 Mermaid 검증 추가 |
> | 6 | `post-comment` | `post-review` | **이름 변경**, 구조화/폴백 분기 |
> | 7 | `save-review` | `save-review` | headSha 저장, Suggestion batch 생성 |

#### Step 1: fetch-pr-data (수정)

`headSha` 추가:

```typescript
// getPullRequestDiff 반환에 headSha 추가
const { diff, title, description, token, additions, deletions, changedFiles, headSha } =
  await step.run("fetch-pr-data", async () => {
    // ... 기존 코드 ...
    const data = await getPullRequestDiff(account.accessToken, owner, repo, prNumber);
    return { ...data, token: account.accessToken };
  });
```

#### Step 2-3: 인라인 분류 + generate-context (변경 없음)

기존 코드의 인라인 분류 로직(`classifyPRSize`, `langCode`, `topK`)과 `generate-context` step은 **변경 없이 유지**한다. Step 4에서 사용하는 `sizeMode`, `langCode`, `context` 변수는 이 단계에서 생성된다.

#### Step 4: generate-ai-review (수정 - 핵심)

```typescript
import { generateText, Output } from "ai";
import { structuredReviewSchema } from "@/module/ai/lib/review-schema";
// NOTE: buildSectionInstruction는 buildFallbackPrompt 내부에서 사용되므로 여기서 직접 import 불필요
import { buildStructuredPrompt, buildFallbackPrompt } from "@/module/ai/lib/review-prompt";
import { formatStructuredReviewToMarkdown } from "@/module/ai/lib/review-formatter";
import { parseDiffToChangedFiles } from "@/module/github/lib/diff-parser";

// BREAKING CHANGE: 기존 step은 plain string (text)을 반환했으나, 변경 후 { rawReview, structuredOutput } 객체를 반환한다.
// 이후 step(validate-review, post-review, save-review)에서 이 필드명을 참조하므로
// 모든 step을 한 번에 변경해야 한다. 부분 변경 시 undefined 참조 에러 발생.
const { rawReview, structuredOutput } = await step.run("generate-ai-review", async () => {
  const headers = SECTION_HEADERS[langCode];
  const changedFilesSummary = parseDiffToChangedFiles(diff);

  // 구조화 출력 시도
  try {
    const prompt = buildStructuredPrompt({
      title, description, diff, context, langCode, sizeMode, changedFilesSummary,
    });

    const { experimental_output } = await generateText({
      model: google("gemini-2.5-flash"),
      experimental_output: Output.object({ schema: structuredReviewSchema }),
      prompt,
    });

    if (experimental_output) {
      const markdown = formatStructuredReviewToMarkdown(experimental_output, langCode);
      return { rawReview: markdown, structuredOutput: experimental_output };
    }
  } catch (error) {
    console.warn("Structured output failed, falling back to markdown:", error);
  }

  // 폴백: 기존 마크다운 경로 (buildSectionInstruction 등 기존 로직 재사용)
  const fallbackPrompt = buildFallbackPrompt({
    title, description, diff, context, langCode, sizeMode, headers,
  });
  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    prompt: fallbackPrompt,
  });

  return { rawReview: text, structuredOutput: null };
});
```

#### Step 5: validate-review (수정)

기존 Mermaid sanitization 로직을 유지하되, **구조화 경로에서도 `sequenceDiagram` 필드를 검증**한다.

```typescript
import { sanitizeMermaidSequenceDiagrams } from "@/module/github/lib/github-markdown";

const { review, validatedStructuredOutput, validationMeta } = await step.run("validate-review", async () => {
  // 마크다운 리뷰 텍스트 sanitize (기존 로직 유지)
  const sanitized = sanitizeMermaidSequenceDiagrams(rawReview, langCode);

  const hadMermaidBlock = /```mermaid/i.test(rawReview);
  const hasFallback =
    sanitized.includes(DIAGRAM_FALLBACK_TEXT.en) ||
    sanitized.includes(DIAGRAM_FALLBACK_TEXT.ko);

  // 구조화 출력의 sequenceDiagram도 검증
  let validatedOutput = structuredOutput;
  if (structuredOutput?.sequenceDiagram) {
    const wrappedDiagram = `\`\`\`mermaid\n${structuredOutput.sequenceDiagram}\n\`\`\``;
    const sanitizedDiagram = sanitizeMermaidSequenceDiagrams(wrappedDiagram, langCode);
    const diagramFailed =
      sanitizedDiagram.includes(DIAGRAM_FALLBACK_TEXT.en) ||
      sanitizedDiagram.includes(DIAGRAM_FALLBACK_TEXT.ko);

    if (diagramFailed) {
      validatedOutput = { ...structuredOutput, sequenceDiagram: null };
    }
  }

  return {
    review: sanitized,
    validatedStructuredOutput: validatedOutput,
    validationMeta: {
      diagramPresent: hadMermaidBlock,
      diagramValidationPassed: hadMermaidBlock ? !hasFallback : null,
      diagramFailureReason: hasFallback ? "diagram replaced with fallback" : null,
      sanitizerApplied: true,
      sizeMode,
    },
  };
});
```

#### Step 6: post-review (수정)

> **주의**: `review`는 Step 5(validate-review)에서 sanitize된 마크다운 텍스트, `validatedStructuredOutput`은 검증된 구조화 출력이다.
>
> **HEAD SHA 일관성**: `postPRReviewWithSuggestions`에 전달하는 `headSha`는 Step 1(`fetch-pr-data`)에서 가져온 값이다. Step 1과 Step 6 사이에 새 커밋이 push되면, suggestion의 line 번호가 새 HEAD와 맞지 않아 PR Review API가 422를 반환할 수 있다. 이 경우 try-catch의 `postReviewComment` 폴백으로 처리된다. Suggestion 레코드는 DB에 저장되므로 대시보드 Apply Fix는 정상 동작한다.

```typescript
import { postPRReviewWithSuggestions } from "@/module/github/lib/pr-review";
import { postReviewComment } from "@/module/github/lib/github";

// IMPORTANT: postedAsReview는 반드시 step.run()의 반환값으로 캡처해야 한다.
// Inngest는 step.run()의 반환값만 memoize하므로, 클로저 side-effect로 외부 변수를 변경하면
// step replay(이후 step 실패 → 함수 재시도) 시 해당 값이 복원되지 않는다.
const postedAsReview = await step.run("post-review", async () => {
  if (validatedStructuredOutput?.suggestions?.length) {
    try {
      // 구조화 경로: 인라인 suggestion 포스팅
      await postPRReviewWithSuggestions(
        token, owner, repo, prNumber, review, validatedStructuredOutput.suggestions, headSha
      );
      return true;
    } catch (error) {
      // createReview API는 comments 중 하나라도 유효하지 않은 line을 참조하면
      // 전체 요청을 422로 거부한다 (atomic). AI가 diff에 없는 line을 참조하면
      // 이 경로로 진입한다. 리뷰 자체가 손실되지 않도록 단일 코멘트로 폴백한다.
      console.warn("PR Review API failed, falling back to comment:", error);
      await postReviewComment(token, owner, repo, prNumber, review);
      return false;
    }
  } else {
    // 폴백 경로: 기존 단일 코멘트
    await postReviewComment(token, owner, repo, prNumber, review);
    return false;
  }
});
```

#### Step 7: save-review (수정)

> **트랜잭션 필수**: Review 생성과 Suggestion batch 생성을 `prisma.$transaction()`으로 감싸서 원자성을 보장한다. Suggestion 생성 실패 시 Review만 남는 데이터 불일치를 방지한다.

```typescript
await step.run("save-review", async () => {
  const repository = await prisma.repository.findFirst({
    where: { owner, name: repo },
  });

  if (!repository) throw new Error("Repository not found");

  await prisma.$transaction(async (tx) => {
    const createdReview = await tx.review.create({
      data: {
        repositoryId: repository.id,
        prNumber,
        prTitle: title,
        prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        review,
        reviewType: "FULL_REVIEW",
        status: "completed",
        headSha, // NEW
      },
    });

    // Suggestion 레코드 batch 생성
    // NOTE: postedAsReview가 false이면 PR Review API 실패로 코멘트 폴백된 경우이다.
    // postedAsReview는 step.run()의 반환값으로 캡처되어 Inngest replay에서도 정확히 복원된다.
    // PR Review API 실패 여부와 관계없이 Suggestion 레코드는 항상 저장하여
    // 대시보드에서 Apply Fix를 사용할 수 있도록 한다.
    if (validatedStructuredOutput?.suggestions?.length) {
      await tx.suggestion.createMany({
        data: validatedStructuredOutput.suggestions.map((s) => ({
          reviewId: createdReview.id,
          filePath: s.file,
          lineNumber: s.line,
          beforeCode: s.before,
          afterCode: s.after,
          explanation: s.explanation,
          severity: s.severity,
          status: "PENDING",
        })),
      });
    }
  });
});
```

---

## 6. GitHub API 신규 함수

### 6.1 `module/github/lib/github.ts` 수정

#### `createOctokitClient` export 추가 (수정)

기존 `createOctokitClient`는 `function`으로 선언되어 모듈 외부에서 사용 불가. `pr-review.ts`에서 재사용하기 위해 `export` 추가:

```typescript
export function createOctokitClient(token: string): Octokit {
  return new Octokit({ auth: token });
}
```

#### `getPullRequestDiff` 수정 - headSha 추가

```typescript
export async function getPullRequestDiff(
  token: string, owner: string, repo: string, prNumber: number
) {
  const octokit = createOctokitClient(token);

  const { data: pr } = await octokit.rest.pulls.get({
    owner, repo, pull_number: prNumber,
  });

  const { data: diff } = await octokit.rest.pulls.get({
    owner, repo, pull_number: prNumber,
    mediaType: { format: "diff" },
  });

  return {
    title: pr.title,
    diff: diff as unknown as string,
    description: pr.body || "",
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    headSha: pr.head.sha,        // NEW
    headBranch: pr.head.ref,     // NEW
    state: pr.state,             // NEW: "open" | "closed"
    merged: pr.merged,           // NEW
  };
}
```

#### `getFileContent` (신규)

```typescript
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<{ content: string; sha: string } | null> {
  const octokit = createOctokitClient(token);

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path, ref,
    });

    if (Array.isArray(data) || data.type !== "file" || !data.content) {
      return null;
    }

    return {
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha,
    };
  } catch (error: any) {
    if (error.status === 404) return null;
    throw error;
  }
}
```

#### `commitFileUpdate` (신규)

```typescript
export async function commitFileUpdate(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  fileSha: string,
  message: string,
  branch: string
): Promise<{ commitSha: string }> {
  const octokit = createOctokitClient(token);

  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    sha: fileSha,
    branch,
  });

  return { commitSha: data.commit.sha };
}
```

#### `getPullRequestBranch` (신규)

> **Fork PR 지원**: `pr.head.repo`가 base repo와 다를 수 있다. Fork PR의 경우 커밋 대상은 fork repo이므로 `headRepoOwner`와 `headRepoName`을 반환한다.

```typescript
export async function getPullRequestBranch(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{
  branch: string;
  headSha: string;
  state: string;
  merged: boolean;
  headRepoOwner: string;
  headRepoName: string;
  isFork: boolean;
}> {
  const octokit = createOctokitClient(token);

  const { data: pr } = await octokit.rest.pulls.get({
    owner, repo, pull_number: prNumber,
  });

  const headRepo = pr.head.repo;
  const isFork = headRepo ? headRepo.full_name !== `${owner}/${repo}` : false;

  return {
    branch: pr.head.ref,
    headSha: pr.head.sha,
    state: pr.state,
    merged: pr.merged,
    headRepoOwner: headRepo?.owner?.login ?? owner,
    headRepoName: headRepo?.name ?? repo,
    isFork,
  };
}
```

### 6.2 Webhook 무한 루프 방지: `app/api/webhooks/github/route.ts` (수정)

Apply Fix로 생성된 커밋이 `synchronize` 이벤트를 발생시켜 무한 리뷰 루프가 발생하는 것을 방지한다.

```typescript
// 파일 상단에 import 추가:
import prisma from "@/lib/db";

// pull_request 이벤트 핸들러 내부, reviewPullRequest 호출 전에 추가:
if (action === "opened" || action === "synchronize") {
  // Apply Fix 커밋으로 인한 무한 루프 방지
  // NOTE: pull_request의 synchronize 이벤트에는 head_commit 필드가 없다.
  // (head_commit은 push 이벤트 전용 필드)
  // 대신 synchronize 이벤트의 "after" SHA를 DB의 Suggestion.appliedCommitSha와 비교한다.
  if (action === "synchronize") {
    const afterSha = isRecord(body) ? (body as Record<string, unknown>)["after"] : undefined;

    if (typeof afterSha === "string") {
      const appliedSuggestion = await prisma.suggestion.findFirst({
        where: { appliedCommitSha: afterSha },
      });

      if (appliedSuggestion) {
        console.info(`Skipping review for ${repoInfo.fullName} #${prNumber}: commit ${afterSha} is from HReviewer apply fix`);
        return NextResponse.json({ message: "Skipped: HReviewer commit" }, { status: 200 });
      }
    }
  }

  const reviewResult = await reviewPullRequest(...);
  // ... 기존 코드
}
```

> **주의**: `pull_request` 이벤트의 `synchronize` 액션에는 `head_commit` 필드가 존재하지 않는다 (`head_commit`은 `push` 이벤트 전용). 따라서 커밋 메시지 기반 필터링은 사용 불가하며, DB 기반 SHA 매칭이 가장 정확한 방법이다. `synchronize` 이벤트의 `after` 필드가 새 head commit SHA를 제공하므로, 이를 `Suggestion.appliedCommitSha`와 비교한다. 향후 봇 계정을 사용하게 되면 `sender.login` 기반 필터링으로 전환하여 DB 조회를 생략할 수 있다.
>
> **성능 참고**: 이 DB 조회는 **모든 `synchronize` 이벤트**에서 실행되며, 대부분은 HReviewer 커밋이 아닌 일반 push이다. `appliedCommitSha`에 `@@index`가 설정되어 있으므로 쿼리 자체는 빠르지만 (index scan), 불필요한 호출이 대부분을 차지한다. 봇 계정 전환 시 `sender.login` 기반 필터링으로 DB 조회 자체를 제거할 수 있어 개선 효과가 크다.

### 6.3 `module/github/lib/diff-parser.ts` (신규)

> **참고**: `parse-diff`는 이미 `package.json`에 설치되어 있다 (`^0.11.1`). 추가 설치 불필요.

```typescript
import parseDiff from "parse-diff";

export interface ChangedFileInfo {
  filePath: string;
  addedLines: number[];  // new file 기준 라인 번호
}

/**
 * unified diff를 파싱하여 파일별 added line 정보를 추출한다.
 */
export function parseDiffFiles(diffText: string): ChangedFileInfo[] {
  const files = parseDiff(diffText);

  return files
    .filter((f) => f.to && f.to !== "/dev/null")
    .map((f) => {
      const addedLines: number[] = [];
      for (const chunk of f.chunks) {
        for (const change of chunk.changes) {
          if (change.type === "add" && "ln" in change) {
            addedLines.push(change.ln);
          }
        }
      }
      return {
        filePath: f.to!,
        addedLines,
      };
    });
}

/**
 * AI 프롬프트에 포함할 파일별 변경 라인 요약 문자열을 생성한다.
 */
export function parseDiffToChangedFiles(diffText: string): string {
  const files = parseDiffFiles(diffText);

  return files
    .map((f) => {
      const lineRanges = summarizeLineRanges(f.addedLines);
      return `- ${f.filePath}: added lines [${lineRanges}]`;
    })
    .join("\n");
}

function summarizeLineRanges(lines: number[]): string {
  if (lines.length === 0) return "none";
  if (lines.length <= 10) return lines.join(", ");

  // 10개 초과 시 범위로 압축
  const sorted = [...lines].sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[sorted.length - 1]} (${sorted.length} lines)`;
}
```

### 6.4 `module/github/lib/pr-review.ts` (신규)

GitHub PR Review API를 사용하여 인라인 suggestion 블록을 포스팅한다.

```typescript
import { createOctokitClient } from "./github";
import type { CodeSuggestion } from "@/module/ai/types/suggestion";

interface ReviewComment {
  path: string;
  line: number;
  startLine?: number; // 멀티라인 suggestion 지원
  body: string;
}

/**
 * PR Review API로 인라인 suggestion 코멘트를 포스팅한다.
 * 전체 리뷰 요약은 review body에, 개별 제안은 inline comment로.
 */
export async function postPRReviewWithSuggestions(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  reviewBody: string,
  suggestions: CodeSuggestion[],
  headSha: string, // Step 1에서 가져온 headSha를 전달받아 중복 API 호출 방지
): Promise<void> {
  const octokit = createOctokitClient(token);

  const comments: ReviewComment[] = suggestions.map((s) => {
    const beforeLineCount = s.before.split("\n").length;
    const comment: ReviewComment = {
      path: s.file,
      line: s.line + beforeLineCount - 1, // suggestion 끝 라인
      body: formatSuggestionComment(s),
    };
    // 멀티라인인 경우 start_line 추가
    if (beforeLineCount > 1) {
      comment.startLine = s.line;
    }
    return comment;
  });

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    body: `## AI Code Review\n\n${reviewBody}\n\n---\n*Generated by HReviewer*`,
    event: "COMMENT",
    comments: comments.map(({ startLine, ...c }) => ({
      ...c,
      ...(startLine ? { start_line: startLine } : {}),
    })),
  });
}

/**
 * CodeSuggestion을 GitHub suggestion 블록 형식으로 변환한다.
 */
function formatSuggestionComment(suggestion: CodeSuggestion): string {
  const severityEmoji = {
    CRITICAL: "🚨",
    WARNING: "⚠️",
    SUGGESTION: "💡",
    INFO: "ℹ️",
  }[suggestion.severity];

  return `${severityEmoji} **${suggestion.severity}**: ${suggestion.explanation}

\`\`\`suggestion
${suggestion.after}
\`\`\``;
}
```

---

## 7. 신규 모듈: `module/suggestion/`

### 7.1 디렉토리 구조

```
module/suggestion/
├── actions/
│   └── index.ts              # Server Actions
├── components/
│   ├── suggestion-card.tsx    # 개별 제안 카드
│   └── suggestion-list.tsx    # 제안 목록 컨테이너
├── constants/
│   └── index.ts              # severity/status 상수
├── hooks/
│   └── use-apply-suggestion.ts  # React Query mutation
├── types/
│   └── index.ts              # 타입 정의
└── index.ts                  # barrel export
```

### 7.2 Server Actions: `module/suggestion/actions/index.ts`

```typescript
"use server";

import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";
import { getFileContent, commitFileUpdate, getPullRequestBranch } from "@/module/github/lib/github";
import type { ApplySuggestionResult } from "../types";

/**
 * 특정 리뷰의 모든 suggestion을 조회한다.
 */
export async function getSuggestionsByReviewId(reviewId: string) {
  const session = await requireAuthSession();

  return prisma.suggestion.findMany({
    where: {
      reviewId,
      review: {
        repository: { userId: session.user.id },
      },
    },
    // NOTE: PostgreSQL에서 enum은 선언 순서로 정렬된다.
    // SuggestionSeverity 선언: CRITICAL(0), WARNING(1), SUGGESTION(2), INFO(3)
    // 따라서 asc = CRITICAL이 먼저 → 의도대로 심각도 높은 순서.
    // MySQL 등 다른 DB에서는 알파벳순 정렬되므로 이 가정이 깨진다.
    orderBy: [
      { severity: "asc" },
      { lineNumber: "asc" },
    ],
  });
}

/**
 * suggestion을 PR 브랜치에 적용한다.
 *
 * 1. 인증 확인
 * 2. Suggestion + Review + Repository + Account 로드
 * 3. PR 상태 확인 (open 여부)
 * 4. 파일 내용 조회 (PR 브랜치 기준)
 * 5. 충돌 감지 (beforeCode가 파일에 존재하는지)
 * 6. 코드 교체
 * 7. PR 브랜치에 커밋
 * 8. Suggestion 상태 갱신
 */
export async function applySuggestion(suggestionId: string): Promise<ApplySuggestionResult> {
  const session = await requireAuthSession();

  // 1. Suggestion + 관련 데이터 로드
  const suggestion = await prisma.suggestion.findFirst({
    where: {
      id: suggestionId,
      review: {
        repository: { userId: session.user.id },
      },
    },
    include: {
      review: {
        include: {
          repository: true,
        },
      },
    },
  });

  if (!suggestion) {
    return { success: false, error: "Suggestion not found", reason: "not_found" };
  }

  if (suggestion.status !== "PENDING") {
    return { success: false, error: `Suggestion already ${suggestion.status.toLowerCase()}`, reason: "conflict" };
  }

  // 2. GitHub 토큰 조회
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "github" },
  });

  if (!account?.accessToken) {
    return { success: false, error: "GitHub access token not found", reason: "unauthorized" };
  }

  const { owner, name: repo } = suggestion.review.repository;
  const { prNumber } = suggestion.review;

  try {
    // 3. PR 상태 확인
    const prInfo = await getPullRequestBranch(account.accessToken, owner, repo, prNumber);

    if (prInfo.merged) {
      return { success: false, error: "PR is already merged", reason: "pr_merged" };
    }
    if (prInfo.state !== "open") {
      return { success: false, error: "PR is closed", reason: "conflict" };
    }

    // Fork PR의 경우: 커밋 대상은 fork repo
    const targetOwner = prInfo.headRepoOwner;
    const targetRepo = prInfo.headRepoName;

    // 4. 현재 파일 내용 조회 (fork repo 기준)
    const fileData = await getFileContent(
      account.accessToken, targetOwner, targetRepo,
      suggestion.filePath, prInfo.branch
    );

    if (!fileData) {
      return { success: false, error: "File not found on PR branch", reason: "not_found" };
    }

    // 5. 충돌 감지: beforeCode가 파일에 존재하는지 확인
    // 공백 정규화는 비교 전용 — 실제 교체는 원본 content에서 수행한다.
    // normalizedContent에서 교체하면 파일 전체의 trailing whitespace가 변경되어
    // 의도하지 않은 diff가 발생한다.
    const normalizeWhitespace = (s: string) =>
      s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");

    const normalizedContent = normalizeWhitespace(fileData.content);
    const normalizedBefore = normalizeWhitespace(suggestion.beforeCode);

    if (!normalizedContent.includes(normalizedBefore)) {
      await prisma.suggestion.update({
        where: { id: suggestionId },
        data: { status: "CONFLICTED" },
      });
      return { success: false, error: "Code has changed since review", reason: "conflict" };
    }

    // 6. 코드 교체 (라인 proximity 기반 매칭)
    // IMPORTANT: 교체는 항상 원본 fileData.content 기반으로 수행한다.
    // normalizedContent에서 교체하면 파일 전체의 trailing whitespace가 제거되어
    // 대상 라인 이외에도 대량의 불필요한 diff가 발생한다.
    //
    // 전략:
    //   a. 원본 content에서 beforeCode가 그대로 매칭 → 원본 기준 직접 교체
    //   b. 정규화 후에만 매칭 → beforeCode를 regex로 변환하여 원본에서 유연 매칭
    //      (trailing whitespace 차이를 허용하되, 파일 나머지 부분은 변경하지 않음)
    const originalContent = fileData.content.replace(/\r\n/g, "\n"); // CRLF만 통일
    const originalBefore = suggestion.beforeCode.replace(/\r\n/g, "\n");
    const originalAfter = suggestion.afterCode.replace(/\r\n/g, "\n");

    // NOTE: var 대신 let을 사용한다. TypeScript strict mode + ESLint no-var 규칙에서
    // var는 빌드 에러를 유발한다. if/else 양쪽에서 할당하기 위해 블록 밖에 선언한다.
    let updatedContent: string;

    if (originalContent.includes(originalBefore)) {
      // Case a: 원본에서 정확히 매칭 — 공백 변경 없이 교체
      updatedContent = replaceNearestOccurrence(
        originalContent,
        originalBefore,
        originalAfter,
        suggestion.lineNumber,
      );
    } else {
      // Case b: 정규화 후에만 매칭 — regex로 원본에서 유연 매칭
      // beforeCode의 각 라인 끝에 optional trailing whitespace를 허용하는 패턴 생성
      // LIMITATION: trailing whitespace 차이만 허용한다. indentation 차이
      // (탭 vs 스페이스, indent 수 변경)는 처리하지 못하며 CONFLICTED가 된다.
      const escaped = normalizedBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flexPattern = escaped.split('\n').map(line => line + '[ \\t]*').join('\\n');
      const regex = new RegExp(flexPattern, 'g');

      // 원본에서 모든 매칭 위치를 찾아 lineNumber에 가장 가까운 것을 선택
      const matches: { index: number; length: number }[] = [];
      let match: RegExpExecArray | null;
      while ((match = regex.exec(originalContent)) !== null) {
        matches.push({ index: match.index, length: match[0].length });
        regex.lastIndex = match.index + 1; // overlapping 방지
      }

      if (matches.length === 0) {
        // shouldn't happen (normalizedContent.includes 통과했으므로)
        updatedContent = originalContent;
      } else {
        const lineOfIndex = (idx: number) => originalContent.slice(0, idx).split("\n").length;
        let best = matches[0];
        let bestDist = Math.abs(lineOfIndex(best.index) - suggestion.lineNumber);
        for (let i = 1; i < matches.length; i++) {
          const dist = Math.abs(lineOfIndex(matches[i].index) - suggestion.lineNumber);
          if (dist < bestDist) { bestDist = dist; best = matches[i]; }
        }
        updatedContent = originalContent.slice(0, best.index) + originalAfter + originalContent.slice(best.index + best.length);
      }
    }

    // 7. PR 브랜치에 커밋 (fork repo 대상)
    const commitMessage = `refactor: ${truncate(suggestion.explanation, 72)}\n\nApplied via HReviewer one-click fix`;
    const { commitSha } = await commitFileUpdate(
      account.accessToken, targetOwner, targetRepo,
      suggestion.filePath, updatedContent, fileData.sha,
      commitMessage, prInfo.branch
    );

    // 8. Suggestion 상태 갱신 (optimistic lock)
    // 동시 Apply 요청 방지: status가 여전히 PENDING인 경우에만 갱신한다.
    // 다른 요청이 먼저 APPLIED로 바꿨다면 updateMany는 0건 갱신하여 중복 커밋을 감지한다.
    const { count } = await prisma.suggestion.updateMany({
      where: { id: suggestionId, status: "PENDING" },
      data: {
        status: "APPLIED",
        appliedAt: new Date(),
        appliedCommitSha: commitSha,
      },
    });

    if (count === 0) {
      // 다른 요청이 먼저 처리함 — 커밋은 이미 생성되었지만 상태 불일치 방지
      return { success: false, error: "Suggestion was already processed by another request", reason: "conflict" };
    }

    return { success: true, commitSha };
  } catch (error: any) {
    console.error("Failed to apply suggestion:", error);
    return { success: false, error: error.message, reason: "api_error" };
  }
}

/**
 * suggestion을 무시(dismiss) 처리한다.
 */
export async function dismissSuggestion(suggestionId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuthSession();

  // NOTE: Prisma의 updateMany는 관계 필터(review.repository.userId)를 지원하지 않는다.
  // previewFeatures에 별도 플래그가 없으면 TypeScript 컴파일 에러 또는 런타임 에러 발생.
  // 따라서 findFirst로 소유권 확인 후 updateMany로 상태를 변경하는 2단계 패턴을 사용한다.
  const suggestion = await prisma.suggestion.findFirst({
    where: {
      id: suggestionId,
      status: "PENDING",
      review: {
        repository: { userId: session.user.id },
      },
    },
  });

  if (!suggestion) {
    return { success: false, error: "Suggestion not found or already processed" };
  }

  // Optimistic lock: applySuggestion과 동일하게 status=PENDING 조건으로 갱신.
  // findFirst와 updateMany 사이에 다른 요청이 상태를 변경했으면 count=0으로 감지.
  // update (not updateMany)를 사용하면 APPLIED 상태를 DISMISSED로 덮어쓰는 race condition 발생.
  const { count } = await prisma.suggestion.updateMany({
    where: { id: suggestionId, status: "PENDING" },
    data: {
      status: "DISMISSED",
      dismissedAt: new Date(),
    },
  });

  if (count === 0) {
    return { success: false, error: "Suggestion was already processed by another request" };
  }

  return { success: true };
}

function truncate(text: string, maxLength: number): string {
  // 줄바꿈을 공백으로 치환하여 git commit subject line이 여러 줄로 분리되는 것을 방지
  const singleLine = text.replace(/\n/g, " ").trim();
  return singleLine.length <= maxLength ? singleLine : singleLine.slice(0, maxLength - 3) + "...";
}

/**
 * beforeCode가 파일 내 여러 곳에 존재할 경우, lineNumber에 가장 가까운 occurrence를 교체한다.
 * 단일 occurrence면 그냥 교체한다.
 *
 * PERF NOTE: lineOfIndex()가 매 occurrence마다 content.slice().split()을 호출하므로
 * O(occurrences * fileSize). `return null;` 등 공통 패턴이 수백 번 등장하는 대형 파일에서는
 * 비용이 클 수 있다. 필요 시 줄바꿈 위치를 한 번만 인덱싱하여 이진 탐색으로 최적화 가능.
 */
function replaceNearestOccurrence(
  content: string,
  before: string,
  after: string,
  targetLine: number,
): string {
  const indices: number[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = content.indexOf(before, searchFrom);
    if (idx === -1) break;
    indices.push(idx);
    searchFrom = idx + 1;
  }

  if (indices.length === 0) return content; // shouldn't happen (checked above)
  if (indices.length === 1) {
    return content.slice(0, indices[0]) + after + content.slice(indices[0] + before.length);
  }

  // 각 occurrence의 라인 번호를 계산하여 targetLine에 가장 가까운 것을 선택
  const lineOfIndex = (idx: number) => content.slice(0, idx).split("\n").length;
  let bestIdx = indices[0];
  let bestDist = Math.abs(lineOfIndex(indices[0]) - targetLine);

  for (let i = 1; i < indices.length; i++) {
    const dist = Math.abs(lineOfIndex(indices[i]) - targetLine);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = indices[i];
    }
  }

  return content.slice(0, bestIdx) + after + content.slice(bestIdx + before.length);
}
```

### 7.3 Constants: `module/suggestion/constants/index.ts`

```typescript
export const SEVERITY_CONFIG = {
  CRITICAL: { emoji: "🚨", color: "text-red-400", bgColor: "bg-red-950/50", borderColor: "border-red-800/30" },
  WARNING:  { emoji: "⚠️", color: "text-amber-400", bgColor: "bg-amber-950/50", borderColor: "border-amber-800/30" },
  SUGGESTION: { emoji: "💡", color: "text-blue-400", bgColor: "bg-blue-950/50", borderColor: "border-blue-800/30" },
  INFO: { emoji: "ℹ️", color: "text-gray-400", bgColor: "bg-gray-950/50", borderColor: "border-gray-800/30" },
} as const;

export const STATUS_CONFIG = {
  PENDING:    { label: { en: "Pending", ko: "대기 중" }, color: "text-[#707070]" },
  APPLIED:    { label: { en: "Applied", ko: "적용됨" }, color: "text-[#4a6a4a]" },
  DISMISSED:  { label: { en: "Dismissed", ko: "무시됨" }, color: "text-[#606060]" },
  CONFLICTED: { label: { en: "Conflict", ko: "충돌" }, color: "text-red-400" },
} as const;
```

### 7.4 Hook: `module/suggestion/hooks/use-apply-suggestion.ts`

```typescript
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applySuggestion, dismissSuggestion } from "../actions";

export function useApplySuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const result = await applySuggestion(suggestionId);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to apply suggestion");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const result = await dismissSuggestion(suggestionId);
      if (!result.success) {
        throw new Error("Failed to dismiss suggestion");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });
}
```

---

## 8. UI 컴포넌트

### 8.1 리뷰 상세 페이지: `app/dashboard/reviews/[id]/page.tsx` (신규)

```typescript
import { getReviewById } from "@/module/review/actions";
import { ReviewDetail } from "@/module/review/ui/review-detail";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const review = await getReviewById(id);

  if (!review) notFound();

  return <ReviewDetail review={review} />;
}
```

### 8.2 리뷰 상세 컴포넌트: `module/review/ui/review-detail.tsx` (신규)

서버에서 받은 리뷰 데이터와 suggestion 목록을 렌더링하는 클라이언트 컴포넌트.

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SuggestionList } from "@/module/suggestion/components/suggestion-list";
import { ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ReviewWithSuggestions {
  id: string;
  prTitle: string;
  prNumber: number;
  prUrl: string;
  review: string;
  status: string;
  headSha: string | null;
  createdAt: Date;
  repository: {
    fullName: string;
    owner: string;
    name: string;
  };
  suggestions: Array<{
    id: string;
    reviewId: string;
    filePath: string;
    lineNumber: number;
    beforeCode: string;
    afterCode: string;
    explanation: string;
    severity: "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";
    status: "PENDING" | "APPLIED" | "DISMISSED" | "CONFLICTED";
    appliedAt: Date | null;
    appliedCommitSha: string | null;
    dismissedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

interface Props {
  review: ReviewWithSuggestions;
}

export function ReviewDetail({ review }: Props) {
  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="space-y-3">
        <Link
          href="/dashboard/reviews"
          className="inline-flex items-center gap-1 text-sm text-[#707070] hover:text-[#e0e0e0] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reviews
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-medium text-[#e0e0e0]">{review.prTitle}</h1>
            <p className="text-sm text-[#707070] mt-1">
              {review.repository.fullName} • PR #{review.prNumber}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-1" />
              GitHub
            </a>
          </Button>
        </div>
      </div>

      {/* Review Body */}
      {/* NOTE: review.review는 마크다운 텍스트이므로 마크다운 렌더러를 사용한다.
          의존성 추가 필요: npm install react-markdown remark-gfm @tailwindcss/typography
          IMPORTANT: @tailwindcss/typography는 prose 클래스 동작에 필수.
          Tailwind CSS v4에서는 app/globals.css에 다음 선언 추가 필요:
            @plugin "@tailwindcss/typography";
          미설치 시 prose 클래스가 아무 효과 없어 마크다운이 스타일 없이 렌더링됨 */}
      <Card className="border-[#1a1a1a] bg-[#0a0a0a]">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-[#e0e0e0]">Review</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {review.review}
          </ReactMarkdown>
        </CardContent>
      </Card>

      {/* Suggestions */}
      {review.suggestions.length > 0 && (
        <SuggestionList reviewId={review.id} initialData={review.suggestions} />
      )}
    </div>
  );
}
```

### 8.3 제안 목록: `module/suggestion/components/suggestion-list.tsx` (신규)

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { getSuggestionsByReviewId } from "../actions";
import { SuggestionCard } from "./suggestion-card";

interface Props {
  reviewId: string;
  initialData?: Awaited<ReturnType<typeof getSuggestionsByReviewId>>;
}

export function SuggestionList({ reviewId, initialData }: Props) {
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["suggestions", reviewId],
    queryFn: () => getSuggestionsByReviewId(reviewId),
    initialData, // 서버에서 이미 가져온 데이터로 초기화
    staleTime: 60 * 1000, // 1분간 fresh 유지 — initialData 전달 직후 불필요한 재요청 방지
  });

  if (isLoading) return <div>Loading suggestions...</div>;
  if (!suggestions?.length) return null;

  const pending = suggestions.filter(s => s.status === "PENDING").length;
  const applied = suggestions.filter(s => s.status === "APPLIED").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-medium text-[#e0e0e0]">Suggestions</h2>
        <span className="text-sm text-[#707070]">
          {pending} pending, {applied} applied
        </span>
      </div>

      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} />
        ))}
      </div>
    </div>
  );
}
```

### 8.4 제안 카드: `module/suggestion/components/suggestion-card.tsx` (신규)

각 제안을 표시하는 카드 컴포넌트. 주요 요소:

- **심각도 뱃지** (CRITICAL/WARNING/SUGGESTION/INFO 컬러 코딩)
- **파일 경로 + 라인 번호**
- **코드 diff 뷰** (before → after, `<pre>` 블록)
- **설명 텍스트**
- **상태 표시** (PENDING/APPLIED/DISMISSED/CONFLICTED)
- **액션 버튼**:
  - "Apply Fix" - PENDING일 때만 활성화, 클릭 시 `useApplySuggestion` mutation 실행
  - "Dismiss" - PENDING일 때만 활성화

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useApplySuggestion, useDismissSuggestion } from "../hooks/use-apply-suggestion";
import { SEVERITY_CONFIG, STATUS_CONFIG } from "../constants";
import { Check, X, Loader2, AlertTriangle } from "lucide-react";

interface Props {
  suggestion: {
    id: string;
    filePath: string;
    lineNumber: number;
    beforeCode: string;
    afterCode: string;
    explanation: string;
    severity: keyof typeof SEVERITY_CONFIG;
    status: keyof typeof STATUS_CONFIG;
  };
}

export function SuggestionCard({ suggestion }: Props) {
  const applyMutation = useApplySuggestion();
  const dismissMutation = useDismissSuggestion();

  const severityConfig = SEVERITY_CONFIG[suggestion.severity];
  const isPending = suggestion.status === "PENDING";
  const isApplying = applyMutation.isPending;

  return (
    <Card className={`border-[#1a1a1a] bg-[#0a0a0a] ${severityConfig.borderColor}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header: severity + file path + status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={severityConfig.color}>
              {severityConfig.emoji} {suggestion.severity}
            </span>
            <span className="text-sm text-[#707070] font-mono">
              {suggestion.filePath}:{suggestion.lineNumber}
            </span>
          </div>
          <span className={`text-xs ${STATUS_CONFIG[suggestion.status].color}`}>
            {STATUS_CONFIG[suggestion.status].label.en}
          </span>
        </div>

        {/* Explanation */}
        <p className="text-sm text-[#d0d0d0]">{suggestion.explanation}</p>

        {/* Code diff */}
        <div className="rounded border border-[#1a1a1a] overflow-hidden">
          <div className="bg-red-950/20 p-3 border-b border-[#1a1a1a]">
            <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap">{`- ${suggestion.beforeCode}`}</pre>
          </div>
          <div className="bg-green-950/20 p-3">
            <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap">{`+ ${suggestion.afterCode}`}</pre>
          </div>
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => applyMutation.mutate(suggestion.id)}
              disabled={isApplying}
              className="bg-[#2d3e2d] hover:bg-[#3d523d] text-[#e0e0e0]"
            >
              {isApplying ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Check className="w-3 h-3 mr-1" />
              )}
              Apply Fix
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismissMutation.mutate(suggestion.id)}
              disabled={dismissMutation.isPending || isApplying}
              className="text-[#707070] hover:text-[#e0e0e0]"
            >
              {dismissMutation.isPending ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <X className="w-3 h-3 mr-1" />
              )}
              Dismiss
            </Button>
          </div>
        )}

        {/* Error display */}
        {applyMutation.isError && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle className="w-3 h-3" />
            {applyMutation.error?.message || "Failed to apply suggestion"}
          </div>
        )}
        {dismissMutation.isError && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle className="w-3 h-3" />
            {dismissMutation.error?.message || "Failed to dismiss suggestion"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### 8.5 기존 수정: `module/review/ui/review-list.tsx`

변경 사항:
- `Link` import 추가 (내부 네비게이션)
- `Lightbulb` 아이콘 import 추가 (suggestion 뱃지)
- 각 리뷰 카드에 suggestion 카운트 뱃지 추가
- "View Full Review on GitHub" 버튼 외에 "View Details" 버튼 추가 → `/dashboard/reviews/[id]`로 이동
- `getReviews()`에서 `_count.suggestions` 포함 (Section 8.6 참조)

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getReviews } from "@/module/review";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2, FileCode, Lightbulb } from "lucide-react";
import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import Link from "next/link";

export default function ReviewList() {
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["reviews"],
    queryFn: async () => await getReviews(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Review History</h1>
          <p className="text-[#707070] font-light mt-1">View your AI-powered code reviews</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 p-12 rounded-lg border border-[#1a1a1a] bg-gradient-to-b from-[#0a0a0a] to-black">
          <Loader2 className="h-6 w-6 text-[#4a6a4a] animate-spin" />
          <p className="text-sm text-[#707070] font-light">Loading reviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Review History</h1>
        <p className="text-[#707070] font-light mt-1">View your AI-powered code reviews</p>
      </div>

      {/* Empty State */}
      {reviews?.length === 0 && (
        <Card className="relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
          <CardContent className="pt-6">
            <div className="text-center py-16">
              <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-lg bg-[#1a1a1a] border border-[#2d3e2d]/30">
                <FileCode className="h-8 w-8 text-[#4a6a4a]" />
              </div>
              <p className="text-sm text-[#707070] font-light">No reviews found</p>
              <p className="text-xs text-[#606060] font-light mt-2">
                Connect a repository and create a pull request to get started
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Cards */}
      {reviews && reviews.length > 0 && (
        <div className="grid gap-4">
          {reviews.map((review) => (
            <Card
              key={review.id}
              className="group relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a] hover:border-[#2d3e2d]/50 transition-all duration-300"
            >
              {/* Subtle hover glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#2d3e2d]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <CardHeader className="relative z-10">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-lg font-medium text-[#e0e0e0]">
                        {review.prTitle}
                      </CardTitle>

                      {/* Status Badges */}
                      {review.status === "completed" && (
                        <Badge className="bg-gradient-to-r from-[#2d3e2d]/30 to-[#3d523d]/20 text-[#4a6a4a] border border-[#2d3e2d]/30 hover:bg-gradient-to-r hover:from-[#2d3e2d]/40 hover:to-[#3d523d]/30">
                          Completed
                        </Badge>
                      )}
                      {review.status === "failed" && (
                        <Badge className="bg-[#3a1a1a]/30 text-[#ff6b6b] border border-[#3a1a1a]/50 hover:bg-[#3a1a1a]/40">
                          Failed
                        </Badge>
                      )}
                      {review.status === "pending" && (
                        <Badge className="bg-[#3a3020]/30 text-[#d4a574] border border-[#3a3020]/50 hover:bg-[#3a3020]/40">
                          Pending
                        </Badge>
                      )}

                      {/* Suggestion Count Badge (NEW) */}
                      {review._count.suggestions > 0 && (
                        <Badge className="bg-blue-950/30 text-blue-400 border border-blue-800/30 hover:bg-blue-950/40">
                          <Lightbulb className="w-3 h-3 mr-1" />
                          {review._count.suggestions} suggestion{review._count.suggestions !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>

                    <CardDescription className="text-[#707070] font-light">
                      {review.repository.fullName} • PR #{review.prNumber}
                    </CardDescription>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className="hover:bg-[#1a1a1a] hover:text-[#4a6a4a] transition-all duration-300"
                  >
                    <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="relative z-10">
                <div className="space-y-4">
                  {/* Timestamp */}
                  <div className="text-xs text-[#606060] font-light">
                    {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                  </div>

                  {/* Review Preview - Terminal Style */}
                  <div className="relative rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-4 overflow-hidden">
                    {/* Terminal header */}
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#1a1a1a]">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#3a1a1a]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#3a3020]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#2d3e2d]" />
                      </div>
                      <span className="text-xs text-[#606060] font-mono">AI Review</span>
                    </div>

                    {/* Code preview */}
                    <pre className="text-xs text-[#d0d0d0] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                      {review.review.substring(0, 300)}...
                    </pre>

                    {/* Subtle gradient overlay at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />
                  </div>

                  {/* Action Buttons (MODIFIED: View Details 추가) */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      asChild
                      className="border-[#2d3e2d]/30 text-[#d0d0d0] hover:border-[#2d3e2d]/50 hover:bg-[#1a1a1a] hover:text-[#4a6a4a] transition-all duration-300"
                    >
                      <Link href={`/dashboard/reviews/${review.id}`}>
                        View Details
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      asChild
                      className="text-[#707070] hover:text-[#4a6a4a] transition-all duration-300"
                    >
                      <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1" />
                        GitHub
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>

              {/* Bottom shimmer effect on hover */}
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#2d3e2d]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 8.6 기존 수정: `module/review/actions/index.ts`

```typescript
// 기존 getReviews 수정 - suggestion count 포함
export async function getReviews() {
  const session = await requireAuthSession();

  return prisma.review.findMany({
    where: {
      repository: { userId: session.user.id },
    },
    include: {
      repository: true,
      _count: { select: { suggestions: true } }, // NEW
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

// 신규 함수
export async function getReviewById(reviewId: string) {
  const session = await requireAuthSession();

  return prisma.review.findFirst({
    where: {
      id: reviewId,
      repository: { userId: session.user.id },
    },
    include: {
      repository: true,
      suggestions: {
        orderBy: [
          { severity: "asc" },
          { lineNumber: "asc" },
        ],
      },
    },
  });
}
```

---

## 9. 에러 처리 및 엣지 케이스

| 시나리오 | 감지 방법 | 처리 |
|----------|-----------|------|
| **파일 변경 (충돌)** | `beforeCode`가 현재 파일에 없음 | Suggestion을 `CONFLICTED`로 마킹, UI에 에러 표시 |
| **PR 이미 머지됨** | `getPullRequestBranch().merged === true` | "PR is already merged" 반환, Apply 차단 |
| **PR 닫힘** | `getPullRequestBranch().state !== "open"` | "PR is closed" 반환, Apply 차단 |
| **파일 삭제됨** | `getFileContent()` 반환 null | "File not found" 반환 |
| **GitHub API Rate Limit** | 403 + rate limit headers | "API rate limited, retry later" 반환 |
| **쓰기 권한 없음** | 403 from `createOrUpdateFileContents` | "unauthorized" 반환 |
| **AI 구조화 출력 실패** | `experimental_output`이 null 또는 예외 발생 | 기존 마크다운 폴백 경로 사용 |
| **중복 적용 시도** | `status !== "PENDING"` 확인 | "already applied/dismissed" 반환 |
| **beforeCode 다중 매칭** | `content.indexOf(beforeCode)` 다중 검색 | `replaceNearestOccurrence()`로 `lineNumber`에 가장 가까운 occurrence 교체 |
| **afterCode 내 `$&` 등 특수 패턴** | — | `replaceNearestOccurrence()`는 `slice()+concat` 방식으로 교체하므로 `String.replace()`의 `$&`/`$'` 등 특수 치환 패턴 문제가 발생하지 않음 |
| **구조화 경로에서 poem 누락** | 의도된 동작 | 구조화 출력은 actionable 섹션에 집중. poem은 폴백 마크다운 경로에서만 생성 |
| **Fork PR 커밋** | `getPullRequestBranch().isFork === true` | fork repo의 owner/name을 사용하여 `getFileContent`/`commitFileUpdate` 호출. 사용자에게 fork 쓰기 권한 필요. **현재 한계**: fork 쓰기 권한 사전 검증 로직이 없어 API 에러(403) 후에야 감지됨. 향후 `isFork === true`일 때 UI에서 사전 경고 표시 또는 `repo.permissions.push` 확인 추가 권장 |
| **Webhook 무한 루프** | `synchronize` 이벤트의 `after` SHA를 DB `Suggestion.appliedCommitSha`와 비교 | 매칭되면 리뷰 재트리거 차단. `pull_request` 이벤트에는 `head_commit` 필드가 없으므로 DB 기반 방식 사용 |
| **파일 크기 1MB 초과** | GitHub Contents API 413 에러 | `api_error`로 반환. 향후 Git Data API(blob/tree) 사용으로 개선 가능 |
| **Branch protection 규칙** | GitHub API 403/422 에러 | `api_error`로 반환. 에러 메시지에 "branch protection" 포함 시 사용자에게 별도 안내 |
| **동시 Apply 요청 (Race Condition)** | GitHub API 409 Conflict (fileSha 불일치) + Prisma optimistic lock (`updateMany` where `status: PENDING`, count === 0) | GitHub 409는 `api_error`로 반환. DB 레벨 race는 optimistic lock으로 감지하여 `conflict` 반환. 커밋은 이미 생성되었을 수 있으나 Suggestion 상태 이중 갱신은 방지됨 |
| **동시 Apply+Dismiss 요청 (Race Condition)** | `dismissSuggestion`도 `updateMany` WHERE `status: PENDING` 사용 (optimistic lock) | Apply가 먼저 APPLIED로 변경하면 Dismiss의 updateMany는 count=0 반환하여 이미 처리됨 응답. 반대도 동일 |
| **CRLF/LF 공백 차이** | 정규화 후 비교 (비교 전용) | `normalizeWhitespace()`는 충돌 감지 전용. 교체는 항상 원본 content 기반: (a) 원본 직접 매칭 시 그대로 교체, (b) 정규화 후에만 매칭 시 regex 유연 매칭으로 원본에서 교체 (파일 나머지 부분 변경 없음). **한계**: trailing whitespace 차이만 허용하며, indentation 차이(탭 vs 스페이스, indent 수 변경)는 처리 불가 → CONFLICTED 처리됨 |
| **PR Review API 422 (유효하지 않은 line)** | `createReview` API가 comments 중 유효하지 않은 diff line 참조 시 전체 거부 | Step 6에서 try-catch로 `postReviewComment` 폴백. Suggestion 레코드는 DB에 여전히 저장되어 대시보드 Apply Fix 사용 가능 |

### 충돌 감지 알고리즘

```
1. PR 브랜치에서 현재 파일 내용 fetch (fork PR일 경우 fork repo 기준)
2. 공백 정규화 (비교 전용): CRLF→LF, trailing whitespace 제거
3. 정규화된 beforeCode가 정규화된 파일 내용에 존재하는지 확인
4. 미존재 → CONFLICTED 마킹, 에러 반환
5. 존재 확인 후 교체 대상 결정 (교체는 항상 원본 content 기반):
   a. 원본 content에서 beforeCode가 그대로 매칭 → 원본 기준 직접 교체 (공백 변경 없음)
   b. 정규화 후에만 매칭 → beforeCode를 regex로 변환 (trailing whitespace 허용 패턴)하여
      원본에서 유연 매칭 후 교체 (파일 나머지 부분 변경 없음)
6. 라인 proximity 매칭으로 lineNumber에 가장 가까운 occurrence 교체
```

> **라인 proximity 매칭**: `beforeCode`가 파일 내 여러 곳에 존재할 경우, `suggestion.lineNumber`에 가장 가까운 occurrence를 선택하여 교체한다. 이를 통해 `return null;` 등 공통 패턴이 반복되는 파일에서도 정확한 위치에 수정을 적용할 수 있다.

---

## 10. 구현 순서

### Phase 1: Foundation

1. `npm install zod react-markdown remark-gfm @tailwindcss/typography` 실행 + `app/globals.css`에 `@plugin "@tailwindcss/typography"` 추가
2. `prisma/schema.prisma` - Suggestion 모델 + Review.headSha 추가
3. `npx prisma migrate dev --name add-suggestion-model`
4. `module/ai/types/suggestion.ts` - 타입 정의
5. `module/ai/lib/review-schema.ts` - Zod 스키마
6. `module/github/lib/diff-parser.ts` - parse-diff 래퍼

### Phase 2: AI Pipeline

7. `module/ai/lib/review-prompt.ts` - 구조화 프롬프트 빌더
8. `module/ai/lib/review-formatter.ts` - JSON → 마크다운 변환
9. `module/github/lib/github.ts` - `createOctokitClient` export 추가, `getPullRequestDiff`에 headSha 추가, `getFileContent`, `commitFileUpdate`, `getPullRequestBranch` 추가
10. `module/github/lib/pr-review.ts` - PR Review API + inline suggestion (멀티라인 지원)
11. `inngest/functions/review.ts` - 파이프라인 수정 (`experimental_output` + Zod, validate-review 구조화 경로 추가, save-review `$transaction` 적용, Suggestion 저장)
11-1. `app/api/webhooks/github/route.ts` - Apply Fix 커밋 무한 루프 방지 필터링 추가

### Phase 3: Apply Logic

12. `module/suggestion/types/index.ts`
13. `module/suggestion/constants/index.ts`
14. `module/suggestion/actions/index.ts` - applySuggestion, dismissSuggestion, getSuggestionsByReviewId

### Phase 4: Dashboard UI

15. `module/suggestion/hooks/use-apply-suggestion.ts`
16. `module/suggestion/components/suggestion-card.tsx`
17. `module/suggestion/components/suggestion-list.tsx`
18. `module/review/ui/review-detail.tsx`
19. `app/dashboard/reviews/[id]/page.tsx`
20. `module/review/actions/index.ts` - getReviewById 추가, getReviews 수정
21. `module/review/ui/review-list.tsx` - suggestion 뱃지 + 상세 링크

### Phase 5: Polish

22. barrel export 파일 업데이트:
    - `module/suggestion/index.ts` — 신규 barrel 생성
    - `module/ai/lib/index.ts` — `review-schema.ts`, `review-prompt.ts`, `review-formatter.ts` export 추가
    - `module/ai/index.ts` — 신규 lib export 반영 (lib/index.ts 경유)
    - `module/github/index.ts` — `"./lib/pr-review"`, `"./lib/diff-parser"` export 추가
    - `module/review/index.ts` — `ReviewDetail` export 추가
23. 에러 핸들링 전체 검증
24. 실제 GitHub PR로 E2E 테스트 (ngrok 사용)
25. 구조화 출력 실패 시 폴백 경로 테스트

---

## 11. 파일 인벤토리

### 신규 파일 (15개)

| 파일 | 목적 |
|------|------|
| `module/ai/types/suggestion.ts` | CodeSuggestion, StructuredReview 타입 |
| `module/ai/lib/review-schema.ts` | Zod 구조화 출력 스키마 |
| `module/ai/lib/review-prompt.ts` | 구조화 프롬프트 빌더 + `buildSectionInstruction` (review.ts에서 이동) |
| `module/ai/lib/review-formatter.ts` | JSON → 마크다운 변환 |
| `module/github/lib/diff-parser.ts` | parse-diff 래퍼 |
| `module/github/lib/pr-review.ts` | PR Review API + inline suggestion |
| `module/suggestion/types/index.ts` | ApplySuggestionResult 타입 |
| `module/suggestion/constants/index.ts` | severity/status 상수 |
| `module/suggestion/actions/index.ts` | apply/dismiss 서버 액션 |
| `module/suggestion/hooks/use-apply-suggestion.ts` | React Query mutation |
| `module/suggestion/components/suggestion-card.tsx` | 제안 카드 UI |
| `module/suggestion/components/suggestion-list.tsx` | 제안 목록 |
| `module/suggestion/index.ts` | barrel export |
| `module/review/ui/review-detail.tsx` | 리뷰 상세 컴포넌트 |
| `app/dashboard/reviews/[id]/page.tsx` | 리뷰 상세 페이지 |

### 수정 파일 (8개)

| 파일 | 변경 내용 |
|------|-----------|
| `prisma/schema.prisma` | Suggestion 모델, SuggestionStatus/Severity enum, Review.headSha + suggestions 관계 |
| `package.json` | `zod` 직접 의존성 추가, `react-markdown` + `remark-gfm` 추가 (리뷰 마크다운 렌더링), `@tailwindcss/typography` 추가 (prose 클래스 필수), **`ai` 버전 exact 고정 필수** (`"ai": "5.0.115"`, caret `^` 제거 — `experimental_output` 불안정 API 보호) |
| `app/globals.css` | `@plugin "@tailwindcss/typography"` 선언 추가 (Tailwind CSS v4에서 플러그인 활성화 방식) |
| `module/github/lib/github.ts` | `createOctokitClient` export 추가, getPullRequestDiff에 headSha/headBranch/state/merged 추가, getFileContent, commitFileUpdate, getPullRequestBranch(fork 정보 포함) 신규 |
| `inngest/functions/review.ts` | `buildSectionInstruction` 삭제 (review-prompt.ts로 이동), `experimental_output` + Zod, diff 파싱, 분기 (구조화/폴백), validate-review에 구조화 경로 Mermaid 검증 추가, save-review에 `$transaction` 적용, Suggestion 레코드 생성 |
| `app/api/webhooks/github/route.ts` | `prisma` import 추가, Apply Fix 커밋에 의한 webhook 무한 루프 방지 필터링 추가 |
| `module/review/actions/index.ts` | getReviewById 추가, getReviews에 `_count.suggestions` 포함 |
| `module/review/ui/review-list.tsx` | suggestion 카운트 뱃지, 상세 페이지 링크 버튼 |

---

## 12. 미해결 질문

### 비즈니스/제품 결정
- Apply Fix를 구독 티어(FREE/PRO)별로 제한할 것인지? 제한한다면 월간 적용 횟수 상한은?
- "Apply All" (일괄 적용) 버튼을 제공할 것인지? (여러 파일 수정 시 개별 커밋 vs 단일 커밋)
- 커밋 author를 인증된 사용자로 할 것인지, hreviewer 봇 계정으로 할 것인지? (봇 계정 사용 시 webhook 무한 루프 방지가 `sender.login` 기반으로 단순화됨 + DB 조회 제거 가능)
- Suggestion 데이터 보존 기간? 오래된 PENDING suggestion 자동 정리?

### 기술적 결정
- Fork PR에서 사용자가 fork repo에 쓰기 권한이 없는 경우 처리 방안? (현재: API 에러 후 안내. 개선안: `isFork` + `repo.permissions.push` 사전 확인하여 UI에서 Apply 버튼 비활성화)
- `experimental_output` API가 stable로 전환되면 마이그레이션 전략? (현재 `ai` 패키지 버전 exact 고정 적용 완료)
- 1MB 초과 파일에 대한 suggestion 적용: Git Data API(blob/tree/commit) 지원 범위?
- 구조화 경로와 폴백 경로 간 poem 섹션 포함 여부 불일치를 해소할 것인지? (폴백에서 poem 제거 vs 구조화 스키마에 poem 추가)
- `replaceNearestOccurrence`의 lineOfIndex O(n*m) 비용 — 대형 파일 + 다중 occurrence 시 최적화 필요 여부?

### 배포 전략 (해결됨 — 체크리스트 Section 5.4 참조)
- ~~Inngest step name 변경(`post-comment` → `post-review`) 배포 시 다운타임 전략?~~ → 배포 체크리스트로 문서화 완료

---

## Appendix A: Validation Report (2026-03-27)

> 2단계 검증 수행: Stage 1 (doc-codebase-validator), Stage 2 (proposal-runtime-validator)

### Stage 1: Doc-Codebase Validator 결과

**CURRENT claim 정확성**: 18/18 항목 확인 — 모든 기존 코드 참조가 정확함

| 검증 항목 | 결과 |
|-----------|------|
| Inngest step 이름 (6개) | ✅ 일치 |
| `buildSectionInstruction` 비공개 함수 | ✅ 확인 |
| `createOctokitClient` 미 export | ✅ 확인 |
| `getPullRequestDiff` 반환 타입 (headSha 없음) | ✅ 현재 상태 정확 |
| `parse-diff ^0.11.1` package.json | ✅ 확인 |
| `SECTION_HEADERS`, `DIAGRAM_FALLBACK_TEXT` | ✅ shared/constants에 존재 |
| `requireAuthSession` → `lib/server-utils.ts` | ✅ export 확인 |
| `LanguageCode`, `getLanguageName` | ✅ settings/constants 확인 |
| `ReviewSizeMode`, `getSectionPolicy` | ✅ review-size-policy 확인 |
| `sanitizeMermaidSequenceDiagrams` | ✅ github-markdown.ts 확인 |
| `ai: ^5.0.115` (caret, 미고정) | ✅ 현재 상태 정확 |

**수정된 이슈:**

1. **Section 5.4 Step 4 코멘트 부정확** (수정 완료)
   - 변경 전: "기존 step은 { text }를 반환" (객체로 오해 가능)
   - 변경 후: "기존 step은 plain string (text)을 반환" (현재 코드 정확 반영)

### Stage 2: Proposal Runtime Validator 결과

**6개 차원 검증:**

| 차원 | CRITICAL | WARNING | 결과 |
|------|----------|---------|------|
| Runtime Behavior Safety | 0 | 0 | ✅ CLEAN |
| Architecture Boundary Integrity | 0 | 0 | ✅ CLEAN |
| Framework Contract Compliance | 0 | 0 | ✅ CLEAN |
| Improvement Logic Sufficiency | 0 | ~~2~~ → 0 | ✅ 수정 완료 |
| Maintenance Risk Assessment | 0 | ~~1~~ → 0 | ✅ 주석 추가 |
| Type Flow & Data Integrity | 0 | 0 | ✅ CLEAN |

**수정된 이슈:**

1. **`dismissSuggestion` race condition** (Section 7.2 — 수정 완료)
   - 문제: `findFirst` + `update`(id만 체크) 패턴에서, Apply와 Dismiss가 동시 요청되면 `update`가 APPLIED 상태를 DISMISSED로 덮어쓸 수 있었음
   - 수정: `update` → `updateMany WHERE status=PENDING` + `count` 체크로 변경. `applySuggestion`과 동일한 optimistic lock 패턴 적용
   - Section 9 에러 처리 테이블에 "동시 Apply+Dismiss 요청" 시나리오 추가

2. **`truncate()` 개행 미처리** (Section 7.2 — 수정 완료)
   - 문제: AI가 생성한 `explanation`에 `\n`이 포함되면 git commit subject line이 여러 줄로 분리됨
   - 수정: `text.replace(/\n/g, " ").trim()` 추가하여 단일 라인 보장

3. **`SuggestionSeverity` 하드코딩 drift 위험** (Section 5.1 — 주석 추가)
   - 문제: severity 값이 5곳에서 독립적으로 정의되어, 새 값 추가 시 누락 가능
   - 조치: Zod 스키마에 MAINTENANCE NOTE 주석 추가 — 5개 정의 사이트 목록 + 누락 시 동작 설명 + 향후 Prisma→Zod 자동 파생 고려 안내

### 검증 확인 항목 (이슈 없음)

- **React hook 안정성**: `useApplySuggestion`/`useDismissSuggestion` mutation은 ref-stable. `SuggestionList` useQuery는 stableTime으로 보호. 무한 리렌더 위험 없음
- **Server/Client 직렬화**: Next.js 16 RSC Flight 프로토콜이 Date/BigInt 직렬화 지원. `ReviewWithSuggestions` Date 타입 정확
- **Inngest 직렬화**: 모든 step.run 반환값 (string, object, boolean, null) JSON 직렬화 가능
- **Prisma enum ↔ string**: Zod `z.enum` 추론 타입과 Prisma 생성 enum이 구조적으로 동일한 string union
- **GitHub API**: `pulls.createReview` line/start_line 계산, `repos.getContent`/`createOrUpdateFileContents` SHA 기반 optimistic lock 정확
- **Webhook 루프 방지**: `synchronize` 이벤트의 `after` SHA와 `Suggestion.appliedCommitSha` DB 매칭 정확
- **구조화 출력 폴백**: `experimental_output` null/예외 → 기존 마크다운 경로 정상 동작, downstream steps null 안전 (`?.` 사용)

### 검증 메타

- **Stage 1**: 1회 iteration (CRITICAL 0, WARNING 5 → 모두 수정/해소)
- **Stage 2**: 1회 iteration (CRITICAL 0, WARNING 3 → 모두 수정)
- **최종 상태**: 전 차원 CRITICAL 0, WARNING 0 — **VALIDATED**
