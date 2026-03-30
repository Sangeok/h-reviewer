# Review Output 개선

> **Status**: `TODO`
> **Created**: 2026-03-28
> **Branch**: `oneclickEdit`
> **Supersedes**: 기존 "인접 Suggestion 병합" 스펙 (범위 확장)

---

## 배경

인접 라인 suggestion이 개별 분리되는 문제를 조사하면서, 업계 서비스 5개(CodeRabbit, GitHub Copilot, Qodo PR-Agent, Sourcery, SonarCloud)를 분석한 결과:

1. **인접 suggestion 병합은 업계에서 하지 않음** — 5개 중 4개가 미병합, Copilot만 같은 패턴 클러스터링
2. **suggestion 개수 자체가 소수** — 업계 기본값 4~15개, 최대 30개
3. **핵심 패턴**: "소수 정예 inline suggestion + 나머지는 summary에서 구체적 언급"

### hreviewer 현재 갭

| 항목 | 현재 | 업계 표준 |
|------|------|----------|
| suggestion 개수 | 2-5개 (하드코딩) | 4-15개 (설정 가능, max cap 존재) |
| 인접 라인 처리 | AI가 개별 분리 | 프롬프트로 묶기 유도 |
| issues 구조 | `string[]` (텍스트만) | 파일/라인/severity 포함 |
| 개수 설정 | 불가 | 사용자/팀 단위 설정 가능 |

---

## Phase 1: 프롬프트 수정 (즉시)

인접 라인 분리 문제를 프롬프트 한 줄로 해결. 후처리 코드 불필요.

### 근거

- 후처리 병합 코드는 불필요 — suggestion 최대 5개에서 인접 케이스는 드묾
- AI가 100% 따르지 않아도, 소수 suggestion에서 실패 영향 미미
- GitHub "Add suggestion to batch" 기능으로 사용자가 수동 병합 가능

### 코드 변경: `module/ai/lib/review-prompt.ts`

`buildStructuredPrompt()` 의 Review Instructions 마지막에 1줄 추가:

```typescript
// 현재 (line 83-94)
return `...
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

// 변경: 마지막에 인접 라인 병합 지시 추가
return `...
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
- The before field must be an exact substring of the current file content
- If adjacent lines need the same type of change, combine them into a SINGLE suggestion with multi-line before/after fields`;
```

---

## Phase 2: issues 구조화 (중기)

suggestion에 선택되지 못한 나머지 이슈를 actionable하게 만든다.
Qodo PR-Agent의 two-tier 구조(General suggestions + Code feedback)를 참고.

### 업계 참고: Qodo PR-Agent 방식

```markdown
## PR Review

### General suggestions:         ← line: null (아키텍처/설계/테스트 수준)
| Category | Suggestion |
|----------|-----------|
| 🔀 Design | Repository 패턴이 일관되지 않음 |
| 🧪 Testing | edge case 테스트 누락 |

### Code feedback:               ← line: number (특정 라인)
| Category | File | Suggestion |
|----------|------|-----------|
| 🐛 Bug | src/api.ts [42-45] | Null 체크 누락 |
```

핵심: **라인을 특정할 수 없는 이슈는 review body에, 특정할 수 있는 이슈는 inline comment로** 명시적 분리.

### line: null 처리 규칙

| 조건 | 포스팅 위치 | 예시 |
|------|-----------|------|
| `file` + `line` 있음 | inline comment (Files changed 탭) | "이 변수에 null 체크 누락" |
| `file` 있고 `line: null` | review body 테이블 | "이 파일에 에러 핸들링 누락" |
| `file: null` + `line: null` | review body 테이블 | "테스트 커버리지 부족" |

> **`file + line: null`이 inline comment가 아닌 이유**: GitHub PR Review API는 `line`이 diff 범위 내여야 한다. file-level issue에 `line: 1`을 넣으면 해당 파일의 line 1이 diff에 없을 때 API 422 에러 발생. 안전하게 review body에 포함.

### GitHub 포스팅 전략 (Qodo 스타일 two-tier)

```
┌─ Review Body (Conversation 탭) ──────────────┐
│                                               │
│  ## AI Code Review                            │
│  summary + walkthrough                        │
│                                               │
│  ### General Issues     ← line: null인 issues │
│  | Category | Severity | Description |        │
│  |----------|----------|-------------|        │
│  | 🧪 Testing | ⚠️ | 테스트 커버리지 부족  │
│  | 🔀 Design  | ⚠️ | 에러 핸들링 불일치    │
│                                               │
└───────────────────────────────────────────────┘

┌─ Inline Comments (Files changed 탭) ─────────┐
│                                               │
│  suggestions (2-5개): ```suggestion 블록 포함  │
│    → "Commit suggestion" 버튼 노출            │
│                                               │
│  line-specific issues: 텍스트 코멘트만         │
│    → 위치 지적만, 수정은 개발자가 직접         │
│                                               │
└───────────────────────────────────────────────┘
```

**포스팅 구현**: `octokit.rest.pulls.createReview()` 2회 분리 호출

- **1차 호출 (suggestions)**: `body`에 summary + walkthrough + general issues 테이블 (`line: null`인 것들) 포함, `comments[]`에 suggestions (`suggestion` 코드 블록) 포함
- **2차 호출 (inline issues)**: `comments[]`에 line-specific issues (`file` + `line` 둘 다 있는 것만) 포함. 실패 시 로그만 남기고 무시 (line-specific issues는 review body에 미포함이므로 유실됨 — general issues만 body 테이블에 보존)

> **분리 이유**: inline issue의 line number가 diff 범위 밖이면 GitHub API 422 에러가 발생하며, 단일 호출 시 정상 suggestions까지 모두 실패한다. suggestions는 `before` 필드로 diff 검증이 가능하지만, issues는 검증 수단이 없다.

### issue 개수 제한

| PR 크기 | suggestions | inline issues | general issues |
|---------|:-:|:-:|:-:|
| tiny | 2 | 2 | 1 |
| small | 3 | 4 | 2 |
| normal | 5 | 6 | 3 |
| large | 5 | 8 | 4 |

### 코드 변경 1: `module/ai/types/suggestion.ts`

> **참고**: `StructuredReview` interface는 코드베이스 어디에서도 import되지 않는 dead type이다.
> 실제 런타임에 사용되는 타입은 `review-schema.ts`의 `StructuredReviewOutput` (Zod 추론 타입).
> 이 변경에서 `StructuredReview`를 삭제하고, 새 타입만 추가한다.

```typescript
// 현재
export interface StructuredReview {
  summary: string;
  walkthrough: string | null;
  strengths: string[];
  issues: string[];
  suggestions: CodeSuggestion[];
  sequenceDiagram: string | null;
}

// 변경: StructuredReview 삭제 + 새 타입 추가
// ⚠️ IssueCategory는 review-schema.ts의 Zod enum에서 derive하여 이중 정의 방지
import { z } from "zod";
import { issueCategorySchema } from "@/module/ai/lib/review-schema";
export type IssueCategory = z.infer<typeof issueCategorySchema>;

export interface StructuredIssue {
  file: string | null;
  line: number | null;
  description: string;
  severity: SuggestionSeverity;
  category: IssueCategory;
}

// StructuredReview 삭제 — 사용처 없음 (StructuredReviewOutput이 실제 타입)
```

### 코드 변경 2: `module/ai/lib/review-schema.ts`

> **MAINTENANCE NOTE 업데이트 필요**: 기존 severity 5곳 중복 관리 주석에 `IssueCategory`도 `review-schema.ts`(Zod enum, single source of truth) + `suggestion.ts`(z.infer derive)에서 관리됨을 추가한다.

```typescript
// 현재 (line 29)
issues: z.array(z.string()).describe("List of problems or concerns found"),

// 변경: 구조화된 issue 스키마
// ⚠️ issueCategorySchema를 export하여 suggestion.ts에서 z.infer로 derive 가능하게 함
export const issueCategorySchema = z.enum(["bug", "design", "security", "performance", "testing", "general"]);

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
```

### 코드 변경 3: `module/ai/lib/review-prompt.ts`

issue 개수 제한 함수 추가 + `buildStructuredPrompt()` 에 issues 관련 지시 추가:

```typescript
// 추가: issue 개수 제한 함수 (getSuggestionLimit 아래에)
// ⚠️ export 필수 — review.ts Step 5에서 count-trimming에 사용
export function getIssueLimit(mode: ReviewSizeMode): { inline: number; general: number } {
  const limits: Record<ReviewSizeMode, { inline: number; general: number }> = {
    tiny: { inline: 2, general: 1 },
    small: { inline: 4, general: 2 },
    normal: { inline: 6, general: 3 },
    large: { inline: 8, general: 4 },
  };
  return limits[mode];
}
```

```typescript
// buildStructuredPrompt 내부에서 issueLimit 계산 추가 (suggestionLimit 아래)
const suggestionLimit = getSuggestionLimit(sizeMode);
const issueLimit = getIssueLimit(sizeMode);  // 추가
```

```typescript
// 현재 return문의 Review Instructions 끝부분 (line 93-94)
- Only suggest changes for added/modified lines (+ lines in the diff)
- The before field must be an exact substring of the current file content
- If adjacent lines need the same type of change, combine them into a SINGLE suggestion with multi-line before/after fields`;

// 변경: issues 생성 지시 + 개수 제한 추가
- Only suggest changes for added/modified lines (+ lines in the diff)
- The before field must be an exact substring of the current file content
- If adjacent lines need the same type of change, combine them into a SINGLE suggestion with multi-line before/after fields
- For each issue:
  - file: exact file path from the diff, or null for project-level issues (architecture, testing strategy)
  - line: line number in new file, or null for file-level or project-level issues
  - category: bug, design, security, performance, testing, or general
  - severity: CRITICAL for blocking issues, WARNING for important concerns, SUGGESTION for improvements, INFO for observations
- Provide up to ${issueLimit.inline} code-level issues (with file and line) and up to ${issueLimit.general} project-level issues (without line), prioritized by severity`;
```

### 코드 변경 4: `module/ai/constants/review-emoji.ts` (신규)

emoji 매핑이 `review-formatter.ts`, `pr-review.ts`에서 중복되므로 공통 상수로 추출:

```typescript
export const CATEGORY_EMOJI: Record<string, string> = {
  bug: "🐛", design: "🔀", security: "🛡️",
  performance: "⚡", testing: "🧪", general: "📋",
};

export const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: "🚨", WARNING: "⚠️", SUGGESTION: "💡", INFO: "ℹ️",
};
```

### 코드 변경 5: `module/ai/lib/review-formatter.ts`

issues를 markdown으로 렌더링할 때 general issues(line: null)는 테이블로, line-specific issues는 목록으로 분리:

```typescript
// 추가 import
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/module/ai/constants/review-emoji";

// 현재 (line 27-30)
if (output.issues.length > 0) {
  const items = output.issues.map(i => `- ${i}`).join("\n");
  sections.push(`## ${headers.issues}\n\n${items}`);
}

// 변경: line이 없는 issues(project-level + file-level)만 review body에 테이블로 포함
// line-specific issues는 inline comment로만 포스팅 (pr-review.ts에서 처리)
const bodyIssues = output.issues.filter(i => i.line === null);

if (bodyIssues.length > 0) {
  const rows = bodyIssues.map(i => {
    const cat = `${CATEGORY_EMOJI[i.category] ?? "📋"} ${i.category}`;
    const sev = `${SEVERITY_EMOJI[i.severity] ?? ""} ${i.severity}`;
    const filePrefix = i.file ? `\`${i.file}\`: ` : "";
    return `| ${cat} | ${sev} | ${filePrefix}${i.description} |`;
  }).join("\n");
  sections.push(`## ${headers.issues}\n\n| Category | Severity | Description |\n|----------|----------|-------------|\n${rows}`);
}
// ⚠️ Known limitation: AI가 description에 | 문자를 포함하면 markdown table 깨짐.
// 현재 단계에서는 허용 (발생 빈도 낮음). 필요 시 description.replace(/\|/g, '\\|') 추가.
```

### 코드 변경 6: `module/github/lib/pr-review.ts`

line-specific issues를 inline comment로 포스팅하도록 변경. **positional 파라미터 7개 이상은 실수에 취약하므로 params 객체로 변경**:

```typescript
// 추가 import
import type { CodeSuggestion, StructuredIssue } from "@/module/ai/types/suggestion";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/module/ai/constants/review-emoji";

// 현재 함수 시그니처 (line 15-23) — positional 7개
export async function postPRReviewWithSuggestions(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  reviewBody: string,
  suggestions: CodeSuggestion[],
  headSha: string,
): Promise<void> {

// 변경: params 객체 패턴으로 전환 + issues 추가
interface PostPRReviewParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  reviewBody: string;
  suggestions: CodeSuggestion[];
  issues: StructuredIssue[];
  headSha: string;
}

export async function postPRReviewWithSuggestions(params: PostPRReviewParams): Promise<void> {
  const { token, owner, repo, prNumber, reviewBody, suggestions, issues, headSha } = params;
  const octokit = createOctokitClient(token);

  // suggestion comments (기존 로직 유지)
  const suggestionComments: ReviewComment[] = suggestions.map((s) => {
    const beforeLineCount = s.before.split("\n").length;
    const comment: ReviewComment = {
      path: s.file,
      line: s.line + beforeLineCount - 1,
      body: formatSuggestionComment(s),
    };
    if (beforeLineCount > 1) {
      comment.startLine = s.line;
    }
    return comment;
  });

  // issue comments (file+line 둘 다 있는 issues만 inline comment로)
  // file-level issues (line: null)는 review body 테이블에 포함됨
  // ⚠️ type predicate 사용 — plain .filter()는 TypeScript narrowing 불가
  const inlineIssues = issues.filter(
    (i): i is StructuredIssue & { file: string; line: number } =>
      i.file !== null && i.line !== null
  );
  const issueComments: ReviewComment[] = inlineIssues.map((i) => ({
    path: i.file,
    line: i.line,
    body: formatIssueComment(i),
  }));

  // ⚠️ suggestions와 issues를 분리 포스팅:
  // 잘못된 issue line number가 suggestion 전체를 실패시키는 것을 방지
  const reviewComments = suggestionComments;

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    body: `## AI Code Review\n\n${reviewBody}\n\n---\n*Generated by HReviewer*`,
    event: "COMMENT",
    comments: reviewComments.map(({ startLine, ...c }) => ({
      ...c,
      ...(startLine ? { start_line: startLine } : {}),
    })),
  });

  // inline issues는 별도 호출 — 실패해도 suggestions에 영향 없음
  if (issueComments.length > 0) {
    try {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: headSha,
        // body 필드 생략 — body: "" 사용 시 GitHub PR Conversation 탭에 빈 review entry 생성됨
        event: "COMMENT",
        // issueComments는 startLine이 없으므로 (single-line만) 직접 전달
        comments: issueComments.map(({ body, path, line }) => ({
          path,
          line,
          body,
        })),
      });
    } catch (error) {
      // inline issue 포스팅 실패는 로그만 남기고 무시
      // ⚠️ line-specific issues(file+line)는 review body에 미포함 — 2차 호출 실패 시 유실됨
      // general issues(line: null)만 review body 테이블에 포함되어 보존됨
      console.warn("Inline issue comments failed (suggestions were posted successfully):", error);
    }
  }
}

// 기존 formatSuggestionComment도 공통 상수로 전환
function formatSuggestionComment(suggestion: CodeSuggestion): string {
  return `${SEVERITY_EMOJI[suggestion.severity] ?? ""} **${suggestion.severity}**: ${suggestion.explanation}

\`\`\`suggestion
${suggestion.after}
\`\`\``;
}

// 새 함수 추가 — 공통 emoji 상수 사용
function formatIssueComment(issue: StructuredIssue): string {
  return `${CATEGORY_EMOJI[issue.category] ?? "📋"} ${SEVERITY_EMOJI[issue.severity] ?? ""} **${issue.severity}** | ${issue.category}\n\n${issue.description}`;
}
```

> **설계 결정: 분리 포스팅**
> inline issues를 suggestions와 같은 `createReview()` 호출에 넣으면, AI가 diff 범위 밖 line number를 생성한 경우 **전체 호출이 422로 실패**하여 정상 suggestions까지 손실된다. suggestions는 `before` 필드로 diff 정합성을 검증할 수 있지만, issues는 검증 수단이 없다. 따라서 **suggestions 먼저 포스팅 → issues 별도 포스팅(실패 허용)** 전략을 사용한다.

### issues DB 저장

Phase 2에서는 issues를 DB에 별도 저장하지 않는다. 현재 `Suggestion` 모델만 존재하며, issues는 GitHub 포스팅(review body + inline comment)으로만 전달된다. 대시보드에서 issues 이력 조회가 필요해지면 별도 `Issue` 모델 추가를 검토.

### 코드 변경 7: `inngest/functions/review.ts`

#### Step 5 확장: issue line number 검증 추가

AI가 diff 범위 밖의 line number를 생성하면 GitHub API 422 에러가 발생한다.
suggestions는 `before` 필드로 diff 정합성을 검증할 수 있지만, issues는 검증 수단이 없으므로 **diff 파일 목록으로 사전 필터링**한다:

```typescript
// 현재 Step 5 끝부분 (return 직전)에 issues 검증 추가
// parseDiffToChangedFiles의 결과를 Step 4에서 이미 사용 중이므로,
// diff 파일 목록을 Step 4 → Step 5로 전달하거나, Step 5에서 재파싱
// ⚠️ 기존 import에 merge (line 15에 이미 parseDiffToChangedFiles import 존재)
// 변경 전: import { parseDiffToChangedFiles } from "@/module/github/lib/diff-parser";
// 변경 후: import { parseDiffToChangedFiles, extractDiffFileSet } from "@/module/github/lib/diff-parser";
//
// ⚠️ getIssueLimit import 추가 (line 13에 이미 buildStructuredPrompt, buildFallbackPrompt import 존재)
// 변경 전: import { buildStructuredPrompt, buildFallbackPrompt } from "@/module/ai/lib/review-prompt";
// 변경 후: import { buildStructuredPrompt, buildFallbackPrompt, getIssueLimit } from "@/module/ai/lib/review-prompt";

// Step 5 validate-review 내부에 추가:
if (validatedOutput?.issues) {
  const diffFiles = extractDiffFileSet(diff);
  validatedOutput = {
    ...validatedOutput,
    issues: validatedOutput.issues.filter(issue => {
      // project-level issues (file: null)는 항상 유효
      if (issue.file === null) return true;
      // file이 diff에 존재하는지 검증
      if (!diffFiles.has(issue.file)) return false;
      // line-specific issue의 line이 양수인지만 기본 검증
      // (정확한 diff hunk 범위 검증은 비용 대비 효과가 낮음)
      if (issue.line !== null && issue.line < 1) return false;
      return true;
    }),
  };

  // ⚠️ AI가 prompt limit을 초과할 수 있으므로 count-trimming 적용
  // (Zod schema에는 동적 .max() 불가 — sizeMode 기반이므로 런타임 필터링)
  const { inline: maxInline, general: maxGeneral } = getIssueLimit(sizeMode);
  let inlineCount = 0, generalCount = 0;
  validatedOutput = {
    ...validatedOutput,
    issues: validatedOutput.issues.filter(issue => {
      if (issue.line !== null) return ++inlineCount <= maxInline;
      return ++generalCount <= maxGeneral;
    }),
  };
}
```

> **`extractDiffFileSet` 함수**: `diff-parser.ts`에 추가 필요. `parseDiffFiles`가 이미 diff를 파싱하여 `ChangedFileInfo[]`를 반환하므로, 파일 경로 Set을 반환하는 유틸 함수를 추출한다.

```typescript
// module/github/lib/diff-parser.ts에 추가
export function extractDiffFileSet(diffText: string): Set<string> {
  return new Set(parseDiffFiles(diffText).map(f => f.filePath));
}
```

#### Step 6 변경: params 객체 패턴으로 호출

```typescript
// 현재 Step 6 (line 121-137)
const postedAsReview = await step.run("post-review", async () => {
  if (validatedStructuredOutput?.suggestions?.length) {
    try {
      await postPRReviewWithSuggestions(
        token, owner, repo, prNumber, review, validatedStructuredOutput.suggestions, headSha
      );
      return true;
    } catch (error) {
      console.warn("PR Review API failed, falling back to comment:", error);
      await postReviewComment(token, owner, repo, prNumber, review);
      return false;
    }
  } else {
    await postReviewComment(token, owner, repo, prNumber, review);
    return false;
  }
});

// 변경: suggestions 또는 line-specific issues가 있으면 Review API 사용
const postedAsReview = await step.run("post-review", async () => {
  const suggestions = validatedStructuredOutput?.suggestions ?? [];
  const issues = validatedStructuredOutput?.issues ?? [];
  const inlineIssues = issues.filter(i => i.file !== null && i.line !== null);
  const hasInlineContent = suggestions.length > 0 || inlineIssues.length > 0;

  if (hasInlineContent) {
    try {
      await postPRReviewWithSuggestions({
        token, owner, repo, prNumber, reviewBody: review, suggestions, issues, headSha,
      });
      return true;
    } catch (error) {
      console.warn("PR Review API failed, falling back to comment:", error);
      await postReviewComment(token, owner, repo, prNumber, review);
      return false;
    }
  } else {
    await postReviewComment(token, owner, repo, prNumber, review);
    return false;
  }
});
```

---

## Phase 3: Suggestion 개수 설정 (장기)

### 업계 참고 수치

| 서비스 | 기본값 | 최대 |
|--------|:------:|:----:|
| Qodo PR-Agent | 4-5 | ~12 |
| Sourcery | 5-20 | ~20 |
| GitHub Copilot | 5-15 | ~30 |
| CodeRabbit | 15-30 | ~50 |

### 설정 단위: per-user

**결론**: per-user(계정 단위 설정)로 구현. per-repo(저장소별 설정)는 불필요.

| 근거 | 설명 |
|------|------|
| 기존 패턴 일관성 | `preferredLanguage`도 per-user — 설정 인프라가 per-user 기준 |
| PR 크기 동적 조절 | `getSuggestionLimit()`가 PR size별로 이미 조절 → repo 특성 차이 흡수 |
| 구현 비용 | per-user는 User 필드 1개 추가, per-repo는 Repository 모델 확장 + UI 재설계 + 조회 로직 추가 |
| 서비스 단계 | 초기 서비스에서 복잡한 설정보다 단순함 우선 |

업계(CodeRabbit, Qodo, Sourcery)는 per-repo config 파일 방식이나, self-hosted/엔터프라이즈 타겟이라 상황이 다름. 사용자 피드백으로 per-repo 수요 확인 시 확장.

### 설계

```
effectiveLimit = min(sizeBasedDefault, userPreference ?? sizeBasedDefault, MAX_SUGGESTION_CAP)
```

> **설계 결정: userPreference는 상한(cap)으로 적용**
> userPreference가 sizeBasedDefault를 초과하더라도, PR 크기 기본값이 우선한다.
> 예: user=10, tiny PR(default=2) → 2개. user=3, large PR(default=5) → 3개.
> 이유: tiny PR에 10개 suggestion을 생성하면 의미 있는 변경 범위를 초과하여 품질이 저하된다.
> userPreference는 "이 이상은 보고 싶지 않다"는 의미이며, PR 크기를 무시하는 override가 아니다.

| 항목 | 값 | 근거 |
|------|:--:|------|
| `MAX_SUGGESTION_CAP` | **15** | Sourcery 상한과 동일, Copilot 중간값 |
| `sizeBasedDefault` | 2/3/5/5 | 현재 값 유지 (PR 크기별) |
| `userPreference` | 1-15 | null이면 sizeBasedDefault 사용 |

max를 15로 잡은 이유:
- Qodo(12)보다 여유 있되, Copilot(30)/CodeRabbit(50)처럼 과도하지 않음
- suggestion이 많을수록 개별 품질 하락 — 15개가 품질/양 균형점
- GitHub PR에서 inline suggestion 15개 이상은 리뷰어 경험 저하

### 코드 변경 1: `prisma/schema.prisma`

```prisma
// 현재 User 모델 (line 36)
preferredLanguage String @default("en")

// 변경: maxSuggestions 필드 추가 (preferredLanguage 아래)
preferredLanguage String @default("en")
maxSuggestions    Int?   // null = PR 크기별 기본값 사용, 1-15 범위
```

마이그레이션: `npx prisma migrate dev --name add-max-suggestions`

### 코드 변경 2: `module/ai/constants/index.ts`

```typescript
// 현재 파일 끝에 추가
export const MAX_SUGGESTION_CAP = 15;
```

### 코드 변경 3: `module/ai/lib/review-prompt.ts`

```typescript
// 현재 (line 97-104)
function getSuggestionLimit(mode: ReviewSizeMode): number {
  switch (mode) {
    case "tiny": return 2;
    case "small": return 3;
    case "normal": return 5;
    case "large": return 5;
  }
}

// 변경: export + userPreference 파라미터 + max cap 적용
import { MAX_SUGGESTION_CAP } from "@/module/ai/constants";

export function getSuggestionLimit(
  mode: ReviewSizeMode,
  userPreference: number | null = null,
): number {
  const sizeDefault: Record<ReviewSizeMode, number> = {
    tiny: 2, small: 3, normal: 5, large: 5,
  };
  const base = sizeDefault[mode];
  // ⚠️ userPreference는 상한(cap)으로 적용, PR 크기 기본값을 초과하지 않음
  // 예: user=10, tiny PR(default=2) → min(2, 10, 15) = 2
  // 예: user=3, large PR(default=5) → min(5, 3, 15) = 3
  const effective = userPreference !== null ? Math.min(base, userPreference) : base;
  return Math.min(effective, MAX_SUGGESTION_CAP);
}
```

`buildStructuredPrompt()` 호출부도 변경:

```typescript
// 현재 (line 48-56)
interface PromptParams {
  title: string;
  description: string;
  diff: string;
  context: string[];
  langCode: LanguageCode;
  sizeMode: ReviewSizeMode;
  changedFilesSummary: string;
}

// 변경: maxSuggestions 추가
interface PromptParams {
  title: string;
  description: string;
  diff: string;
  context: string[];
  langCode: LanguageCode;
  sizeMode: ReviewSizeMode;
  changedFilesSummary: string;
  maxSuggestions: number | null;
}

// buildStructuredPrompt 내부 destructuring (line 59)
// 현재
const { title, description, diff, context, langCode, sizeMode, changedFilesSummary } = params;

// 변경
const { title, description, diff, context, langCode, sizeMode, changedFilesSummary, maxSuggestions } = params;

// buildStructuredPrompt 내부 (line 65)
// 현재
const suggestionLimit = getSuggestionLimit(sizeMode);

// 변경
const suggestionLimit = getSuggestionLimit(sizeMode, maxSuggestions);
```

### 코드 변경 4: `inngest/functions/review.ts`

Step 4(generate-ai-review)에서 사용자 설정 조회 후 전달:

```typescript
// 현재 event.data destructuring (line 23)
const { owner, repo, prNumber, userId, preferredLanguage = "en" } = event.data;

// 변경: maxSuggestions 추가 (line 23)
const { owner, repo, prNumber, userId, preferredLanguage = "en", maxSuggestions = null } = event.data;
// ... (line 45-47의 langCode, sizeMode, topK는 변경 없음)

// Step 4 내부에서 buildStructuredPrompt 호출 시 (line 65-67)
// 현재
const prompt = buildStructuredPrompt({
  title, description, diff, context, langCode, sizeMode, changedFilesSummary,
});

// 변경
const prompt = buildStructuredPrompt({
  title, description, diff, context, langCode, sizeMode, changedFilesSummary, maxSuggestions,
});
```

`module/ai/actions/review-pull-request.ts`에서 이벤트 발송 시 사용자 설정 포함:

```typescript
// 현재 (line 29-40)
const preferredLanguage = await getUserLanguageByUserId(repository.user.id);

await inngest.send({
  name: "pr.review.requested",
  data: {
    owner,
    repo,
    prNumber,
    userId: repository.user.id,
    preferredLanguage,
  },
});

// 변경: repository.user.maxSuggestions 추가
// (getRepositoryWithToken이 user를 include하므로 별도 쿼리 불필요)
const preferredLanguage = await getUserLanguageByUserId(repository.user.id);

await inngest.send({
  name: "pr.review.requested",
  data: {
    owner,
    repo,
    prNumber,
    userId: repository.user.id,
    preferredLanguage,
    maxSuggestions: repository.user.maxSuggestions ?? null,
  },
});
```

### 코드 변경 5: `module/settings/actions/index.ts`

`getUserProfile`과 `updateUserProfile`에 `maxSuggestions` 필드 추가:

```typescript
// getUserProfile — select에 maxSuggestions 추가 (line 17-24)
// 현재
select: {
  id: true,
  name: true,
  email: true,
  image: true,
  createdAt: true,
  preferredLanguage: true,
},

// 변경
select: {
  id: true,
  name: true,
  email: true,
  image: true,
  createdAt: true,
  preferredLanguage: true,
  maxSuggestions: true,
},
```

```typescript
// updateUserProfile — 입력 타입 및 처리 로직 추가 (line 41-98)
// 현재 함수 시그니처
export async function updateUserProfile(data: { name?: string; email?: string; preferredLanguage?: string }) {
  // ...
  const updateData: { name?: string; email?: string; preferredLanguage?: LanguageCode } = {};

// 변경: maxSuggestions 추가
import { MAX_SUGGESTION_CAP } from "@/module/ai/constants";

export async function updateUserProfile(data: {
  name?: string;
  email?: string;
  preferredLanguage?: string;
  maxSuggestions?: number | null;
}) {
  // ...
  const updateData: {
    name?: string;
    email?: string;
    preferredLanguage?: LanguageCode;
    maxSuggestions?: number | null;
  } = {};

  // ... (기존 name, email, preferredLanguage 처리 코드 유지)

  // maxSuggestions 처리 추가
  // ⚠️ 반드시 Object.keys(updateData).length === 0 early return guard (line 67) **이전**에 배치
  // 그렇지 않으면 { maxSuggestions: 5 } 만 전달 시 "No profile fields" 에러 발생
  if (data.maxSuggestions !== undefined) {
    if (data.maxSuggestions === null) {
      updateData.maxSuggestions = null;
    } else if (
      Number.isInteger(data.maxSuggestions) &&
      data.maxSuggestions >= 1 &&
      data.maxSuggestions <= MAX_SUGGESTION_CAP
    ) {
      updateData.maxSuggestions = data.maxSuggestions;
    } else {
      return {
        success: false,
        message: `maxSuggestions must be between 1 and ${MAX_SUGGESTION_CAP}`,
      };
    }
  }
```

```typescript
// updateUserProfile — select에도 maxSuggestions 추가 (line 79-84)
// 현재
select: {
  id: true,
  name: true,
  email: true,
  preferredLanguage: true,
},

// 변경
select: {
  id: true,
  name: true,
  email: true,
  preferredLanguage: true,
  maxSuggestions: true,
},
```

---

## 구현 순서

```
Phase 1 (프롬프트 수정)
  → review-prompt.ts 1줄 추가
  → 단독 배포 가능, 코드 변경 최소
  → 완료 후 Phase 2 착수

Phase 2 (issues 구조화)
  → suggestion.ts → review-schema.ts → review-prompt.ts
  → review-emoji.ts (신규) → review-formatter.ts → diff-parser.ts (extractDiffFileSet 추가)
  → pr-review.ts → review.ts
  → review output의 actionability 핵심 개선
  → ⚠️ review-schema.ts와 review-formatter.ts는 반드시 동시 배포 (스키마 변경 시 포맷터가 구조적 issues 기대)
  → 완료 후 Phase 3 착수

Phase 3 (개수 설정)
  → schema.prisma → prisma migrate → constants/index.ts → review-prompt.ts → review.ts
  → settings/actions (getUserProfile, updateUserProfile) → Settings UI
  → review-pull-request.ts (이벤트에 maxSuggestions 전달)
  → Phase 2와 독립적이지만, 순서상 뒤에 배치
```

---

## 해결된 질문

- ~~Phase 3에서 per-repo 설정이 필요한가, per-user로 충분한가?~~ → **per-user로 충분**. 기존 설정 패턴 일관성 + PR 크기 동적 조절이 repo 차이 흡수. 수요 확인 시 per-repo 확장.
- ~~inline issues가 suggestion 포스팅을 실패시킬 수 있는가?~~ → **YES**. issue의 line number는 diff 범위 검증 수단이 없어 GitHub API 422 유발 가능. **suggestions와 issues를 별도 `createReview()` 호출로 분리**하여 해결. suggestions는 보호되며, inline issues 실패 시 line-specific issues는 유실되지만 general issues(line: null)는 review body에 보존됨.
- ~~`StructuredReview` interface가 필요한가?~~ → **불필요**. 코드베이스에서 import하는 곳이 없으며, 실제 런타임 타입은 `StructuredReviewOutput` (Zod 추론). Phase 2에서 삭제.
- ~~emoji 매핑이 여러 파일에 중복되어도 괜찮은가?~~ → **아니요**. `review-formatter.ts`, `pr-review.ts`에서 중복 발생. `module/ai/constants/review-emoji.ts`로 추출하여 단일 소스로 관리.

---

## 검증 결과 (2026-03-28)

2단계 검증(doc-codebase-validator + proposal-runtime-validator)을 통해 파악한 문제와 반영 내역.

### Stage 1: doc-codebase-validator (스펙 ↔ 코드베이스 정합성)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | 모든 파일 경로 (11개) | MATCH | — |
| 2 | 모든 함수/타입 이름 (20+개) | MATCH | — |
| 3 | `review-pull-request.ts` line number | MISMATCH (39→40) | **수정 완료** |
| 4 | `settings/actions/index.ts` updateUserProfile 범위 | MISMATCH (41-85→41-98) | **수정 완료** |
| 5 | `StructuredReview` dead type 여부 | MATCH (import 0건 확인) | — |
| 6 | Inngest client 미타입 여부 | MATCH (`new Inngest({ id: "hreviewer" })`) | — |
| 7 | 기타 모든 코드 스니펫 "현재" 블록 | MATCH | — |

### Stage 2: proposal-runtime-validator (제안 코드 런타임 정합성)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | Phase 1 multi-line before/after + Zod schema | OK — `z.string()`은 개행 허용 | — |
| 2 | `IssueCategory` 이중 정의 (suggestion.ts + review-schema.ts) | ISSUE — 동기화 누락 위험 | **수정 완료**: `issueCategorySchema` export 후 `z.infer`로 derive |
| 3 | `SuggestionSeverity` ↔ Zod severity enum 일치 여부 | OK — 4곳 모두 동일 | — |
| 4 | Zod inference 후 `issues` 타입 | OK — 구조화된 객체 배열로 정확히 추론됨 | — |
| 5 | `output.issues.filter(i => i.line === null)` 타입 안전성 | OK — `.line` 필드 존재 | — |
| 6 | `CATEGORY_EMOJI` 키 casing 일치 | OK — 소문자 일치 | — |
| 7 | `SEVERITY_EMOJI` 키 casing 일치 | OK — 대문자 일치 | — |
| 8 | `StructuredReviewOutput["issues"]` ↔ `StructuredIssue[]` 호환성 | OK — 구조적으로 동일 | — |
| 9 | `.filter()` TypeScript narrowing 미작동 | ISSUE — non-null assertion 필요 | **수정 완료**: type predicate `(i): i is ... =>` 패턴으로 변경 |
| 10 | `{ startLine, ...c }` destructuring 안전성 | OK — optional 필드 undefined 시 안전 | — |
| 11 | `extractDiffFileSet` 미존재 + `diff` 스코프 | OK — Step 1에서 캡처, Step 5에서 접근 가능 | — |
| 12 | `validatedOutput` 재할당 안전성 | OK — `let` 선언, spread 가능 | — |
| 13 | Step 5 → Step 6 데이터 흐름 | OK — outer closure로 전달 | — |
| 14 | `postPRReviewWithSuggestions` breaking change | OK — 호출자 1곳 (`review.ts`)만 존재 | — |
| 15 | Zod 타입 → `StructuredIssue[]` 할당 | OK | — |
| 16 | `maxSuggestions Int?` 기존 사용자 null 처리 | OK — `null ?? sizeDefault` 정상 작동 | — |
| 17 | `getRepositoryWithToken` user 관계 포함 여부 | OK — `include: { user: ... }` 확인 | — |
| 18 | `getSuggestionLimit` user preference override | ISSUE — tiny PR에 10개 가능 | **수정 완료**: userPreference를 상한(cap)으로 적용, sizeDefault 초과 방지 |
| 19 | `getSuggestionLimit` export 충돌 여부 | OK — 이름 충돌 없음 | — |
| 20 | Inngest event destructuring default value | OK — 미타입 client에서 정상 작동 | — |
| 21 | `settings` → `ai/constants` 순환 의존성 | OK (현재 안전) — `ai/constants`는 leaf 모듈 | — |
| 22 | AI 구조 오류 시 Zod 검증 | OK — AI SDK 내부 Zod 검증 + fallback 경로 | — |
| 23 | 이전 `issues: string[]` 하위 호환성 | OK — DB에 구조화 데이터 미저장, markdown만 저장 | — |
| 24 | Step 5에서 `diff` 변수 접근 | OK — outer closure 스코프 | — |

### 2차 검증 (Round 2, 2026-03-28)

1차 수정 반영 후 재검증. 수정이 도입한 새 문제와 기존 미발견 문제를 파악.

#### Stage 1: doc-codebase-validator (2차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | 모든 파일 경로 (12개) | MATCH | — |
| 2 | 모든 line number (20+개) | MATCH | — |
| 3 | 모든 "현재" 코드 블록 (17개) | MATCH | — |
| 4 | 모든 함수/타입 이름 (25+개) | MATCH | — |
| 5 | `suggestion.ts`에 `z.infer` 사용하나 `z` import 누락 | NEW ISSUE — 1차 수정이 도입한 컴파일 에러 | **수정 완료**: `import { z } from "zod"` 추가 |
| 6 | Phase 2 "현재 (line 93-94)" 가 Phase 1 적용 후 상태 참조 | INTERNAL INCONSISTENCY — Phase 순서 전제 명확 | 의도된 설계 (Phase 1 → 2 순서 구현 전제) |

#### Stage 2: proposal-runtime-validator (2차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | `z` import 누락 (suggestion.ts) | ISSUE — 컴파일 에러 | **수정 완료**: `import { z } from "zod"` 추가 |
| 2 | `review-schema.ts` → `suggestion.ts` 순환 의존성 | OK — `review-schema.ts`는 `zod`만 import | — |
| 3 | `issueCategorySchema` 배치 순서 | OK — `structuredReviewSchema` 앞에 선언 | — |
| 4 | type predicate + `StructuredIssue` import | OK — spec에 import 명시됨 | — |
| 5 | intersection type narrowing 동작 | OK — TypeScript 정상 지원 | — |
| 6 | filter 후 `i.file` 타입 추론 | OK — `string` (not `string \| null`) | — |
| 7 | `getSuggestionLimit` 수식 ↔ 설계 섹션 일치 | OK — 대수적으로 동일 | — |
| 8 | `userPreference=0` edge case | SPEC GAP (저위험) — untyped Inngest event로 0 유입 가능 | 현재 코드 경로에서 발생 불가, 보류 |
| 9 | `userPreference=15 + tiny PR` 동작 | OK — 의도된 설계 (cap 적용) | — |
| 10 | `bodyIssues` filter narrowing | OK — `.line` 미참조로 문제 없음 | — |
| 11 | `file+line:null` / `file:null+line:null` 렌더링 | OK — `filePrefix` 분기로 정상 처리 | — |
| 12 | inline issues 유실 시 주석 오류 | ISSUE — "review body에 포함됨" 주장 부정확 | **수정 완료**: line-specific issues 유실 가능성 명시 |
| 13 | `extractDiffFileSet` 구현 누락 | SPEC GAP | **수정 완료**: 구현 코드 블록 추가 |
| 14 | `parseDiffFiles` vs `parseDiffToChangedFiles` 선택 | OK — `parseDiffFiles` 사용이 적절 | spec 문구도 `parseDiffFiles`로 수정 |
| 15 | Phase 2 `buildStructuredPrompt` 호출부 변경 불필요 | OK — `getIssueLimit`은 내부 계산 | — |
| 16 | `CATEGORY_EMOJI` typing (`Record<string>` vs `Record<IssueCategory>`) | SPEC GAP (저위험) — fallback `?? "📋"`으로 안전 | 구현 시 강화 가능, 현재 보류 |

### 3차 검증 (Round 3, 2026-03-28)

2차 수정 반영 후 재검증. 이전 라운드에서 놓친 구조적/런타임 문제를 파악.

#### Stage 1: doc-codebase-validator (3차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | 모든 파일 경로 (12개) | MATCH | — |
| 2 | 모든 line number (20+개) | MATCH | — |
| 3 | 모든 "현재" 코드 블록 (17개) | MATCH | — |
| 4 | 모든 함수/타입/변수 이름 (25+개) | MATCH | — |
| 5 | Phase 3 코드 변경 4 line reference 혼동 | MISMATCH — "현재 (line 45-47)" 표시 후 "변경"이 line 23을 수정 | **수정 완료**: line 23 명시 + 기존 코드 표시 |
| 6 | Phase 2 구현 순서에서 diff-parser.ts 위치 | OK — diff-parser.ts는 review.ts보다 먼저 구현 필요 (의존성 순서 정확) | — |
| 7 | `import type { CodeSuggestion, StructuredIssue }` merge 필요 | OK (저위험) — 기존 import 존재하나 구현자가 자연스럽게 merge | — |
| 8 | `getIssueLimit` 값과 issue 개수 테이블 일치 | MATCH | — |
| 9 | Phase 2/3 구현 순서와 코드 변경 번호 일치 | MATCH | — |

#### Stage 2: proposal-runtime-validator (3차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | end-to-end 타입 흐름 (AI → Zod → Step 5 → Step 6 → posting) | OK — 구조적 호환성 유지 | — |
| 2 | `formatStructuredReviewToMarkdown` 파라미터 타입 자동 업데이트 | OK — `StructuredReviewOutput` 참조로 자동 반영 (스키마와 동시 변경 필수) | — |
| 3 | Step 5 `validatedOutput` 재할당 타입 안전성 | OK — `let` + spread, 구조적으로 동일 | — |
| 4 | Inngest step 경계 직렬화 | OK — 모든 필드 JSON-safe (string, number, null) | — |
| 5 | `formatIssueComment` `\n\n` 렌더링 | OK — template literal 개행, GitHub 마크다운 정상 | — |
| 6 | table `\|` pipe injection | SPEC GAP (저위험) | **수정 완료**: known limitation 주석 추가 |
| 7 | `issueCategorySchema` 배치 | OK — top-level const, `structuredReviewSchema` 앞 | — |
| 8 | `maxSuggestions` untyped event.data → `number \| null` | OK — Inngest client가 `any` 반환, TS 컴파일 정상 | — |
| 9 | Inngest event.data typing | OK — `any` 확인 | — |
| 10 | `extractDiffFileSet` import 중복 (ESLint 에러) | ISSUE — line 15 기존 import과 merge 필요 | **수정 완료**: merge 지시 명시 |
| 11 | empty issues edge case | OK — general issues는 review body에 포함, `postReviewComment` 경로 정상 | — |
| 12 | `formatSuggestionComment` emoji 변경 호환성 | OK — 동일 emoji 문자, 동일 출력 포맷 | — |
| 13 | `ChangedFileInfo.filePath` 존재 여부 | OK — `parseDiffFiles` → `ChangedFileInfo[]`, `.filePath: string` 확인 | — |

#### Stage 1: doc-codebase-validator (4차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | 모든 파일 경로 (12개) | MATCH | — |
| 2 | 모든 line number (20+개) | MATCH | — |
| 3 | 모든 "현재" 코드 블록 (17개) | MATCH | — |
| 4 | pr-review.ts "현재" 7 params 포맷팅 | MISMATCH — 스펙이 2줄로 압축, 실제는 각 param 별도 라인 (line 16-22) | **수정 완료**: 실제 코드와 일치하도록 포맷 복원 |
| 5 | 구현 순서에 atomic deployment 명시 | SPEC GAP — review-schema.ts ↔ review-formatter.ts 동시 배포 미명시 | **수정 완료**: Phase 2 구현 순서에 ⚠️ 동시 배포 주의사항 추가 |

#### Stage 2: proposal-runtime-validator (4차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | 2차 `createReview` 호출 `body: ""` → 빈 review entry | ISSUE (중위험) — GitHub PR Conversation 탭에 내용 없는 review entry 생성 | **수정 완료**: `body` 필드 생략 + 주석 설명 추가 |
| 2 | AI issue count 초과 가능성 | ISSUE (중위험) — prompt에서 limit 지시해도 AI가 초과 생성 가능 | **수정 완료**: Step 5에 `getIssueLimit()` 기반 count-trimming 로직 추가 |
| 3 | Step 5 count-trimming 후 타입 안전성 | OK — `.filter()` 반환 타입 동일, spread 재할당 구조적 호환 | — |
| 4 | `body` 필드 생략 시 GitHub API 호환성 | OK — `body`는 optional param, 생략 시 빈 review body 없이 inline comments만 생성 | — |

#### Stage 1: doc-codebase-validator (5차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | 모든 파일 경로 (12개) | MATCH | — |
| 2 | 모든 line number (20+개) | MATCH | — |
| 3 | 모든 "현재" 코드 블록 (17개) | MATCH | — |
| 4 | 모든 함수/타입/변수 이름 (25+개) | MATCH | — |
| 5 | `StructuredReview` dead type 확인 (import 0건) | MATCH | — |
| 6 | Inngest client untyped 확인 | MATCH | — |
| 7 | `getRepositoryWithToken` user relation include 확인 | MATCH | — |
| 8 | review-schema.ts MAINTENANCE NOTE "4곳" vs 5항목 | MATCH (소스코드 자체 불일치, 스펙 정확) | — |

#### Stage 2: proposal-runtime-validator (5차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | `getIssueLimit` export 누락 + review.ts import 미명시 | ISSUE (critical) — Phase 2에서 private 함수로 정의, review.ts에서 사용 시 컴파일 에러 | **수정 완료**: `export` 추가 + review.ts import merge 지시 추가 |
| 2 | 2차 `createReview` issueComments `{ startLine, ...c }` 불필요 | ISSUE (low) — issue comments는 startLine 없음, 불필요한 destructuring | **수정 완료**: 직접 `{ path, line, body }` 매핑으로 단순화 |
| 3 | atomic deployment 범위 (review-schema + review-formatter만?) | OK (low) — 전체 Phase 2를 한 배포로 처리하면 문제 없음, 핵심 쌍은 정확 | — |
| 4 | Phase 1 template literal 구문 안전성 | OK | — |
| 5 | Zod `z.string()` 멀티라인 처리 | OK | — |
| 6 | circular dependency (suggestion.ts ↔ review-schema.ts) | OK — 단방향 | — |
| 7 | `z.infer<typeof issueCategorySchema>` 타입 추론 | OK — 정확한 union type 생성 | — |
| 8 | `StructuredIssue` ↔ Zod output 호환성 | OK — 구조적 동일 | — |
| 9 | type predicate 유효성 | OK — TypeScript 정상 지원 | — |
| 10 | `ReviewComment` path/line 매핑 (file→path) | OK — 정확한 필드 매핑 | — |
| 11 | `formatIssueComment` 시그니처 호환성 | OK — subtype 수용 | — |
| 12 | count-trimming pre-increment `++` + `<=` 동작 | OK — 정확히 maxN개 유지 | — |
| 13 | zero suggestions + zero issues edge case | OK — `postReviewComment` fallback 정상 | — |
| 14 | all issues general (line: null) edge case | OK — 2차 호출 skip, body table 보존 | — |
| 15 | `userPreference=1` + large PR | OK — `min(5,1,15)=1` 정확 | — |
| 16 | `maxSuggestions` undefined vs null from Inngest | OK — default destructuring 정상 처리 | — |

#### Stage 1: doc-codebase-validator (6차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | 모든 파일 경로 (12개) | MATCH | — |
| 2 | 모든 line number (20+개) | MATCH | — |
| 3 | 모든 "현재" 코드 블록 (17개) | MATCH | — |
| 4 | 모든 함수/타입/변수 이름 (25+개) | MATCH | — |
| 5 | 5차 수정: `getIssueLimit` export 키워드 (Code Change 3) | MATCH — 스펙 정확 | — |
| 6 | 5차 수정: review.ts import merge 지시 (line 13, line 15) | MATCH — 실제 import과 일치 | — |
| 7 | 5차 수정: issueComments 단순화 매핑 (Code Change 6) | MATCH — 스펙 정확 | — |

#### Stage 2: proposal-runtime-validator (6차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | `updateUserProfile` maxSuggestions early return bypass | ISSUE (중위험) — `Object.keys(updateData).length === 0` guard (line 67)가 maxSuggestions 처리보다 먼저 실행되어 `{ maxSuggestions: 5 }` 만 전달 시 에러 | **수정 완료**: guard 이전 배치 지시 명시 |
| 2 | `getIssueLimit` export 안전성 (내부+외부 동시 사용) | OK — 이름 충돌 없음, 동일 sizeMode로 divergence 불가 | — |
| 3 | 2nd createReview 단순화 mapping Octokit 호환성 | OK — path(필수), body(필수), line(제공) 모두 유효 | — |
| 4 | AI가 enum 외 category 반환 시 | OK — Zod z.enum()이 파싱 시점에 거부 | — |
| 5 | AI가 음수 line number 반환 시 | OK — Step 5 `issue.line < 1` 필터 | — |
| 6 | PR 변경 파일 0개 edge case | OK — extractDiffFileSet 빈 Set, file-specific issues 전부 필터링, project-level 보존 | — |
| 7 | count-trimming이 file-validation 후 이미 감소된 경우 | OK — limit 이하면 전부 통과 | — |
| 8 | getIssueLimit prompt ↔ trimming divergence 가능성 | OK — 동일 sizeMode, 동일 closure 변수 | — |

#### Stage 1: doc-codebase-validator (7차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | 모든 파일 경로/line number/코드 블록/함수명 (12개 파일, 50+항목) | MATCH | — |
| 2 | 6차 수정: updateUserProfile early return guard (line 67) 참조 | MATCH — `if (Object.keys(updateData).length === 0)` 확인 | — |

#### Stage 2: proposal-runtime-validator (7차)

| # | 항목 | 결과 | 조치 |
|---|------|------|------|
| 1 | Phase 1-3 전체 (48항목) 종합 재검증 | OK — 전체 PASS | — |
| 2 | `buildFallbackPrompt`에 maxSuggestions 불필요 여부 | OK — fallback은 비구조화 응답용, suggestion limit 미사용 | — |
| 3 | `getIssueLimit` + `getSuggestionLimit` 동시 export 호환성 | OK — 이름 충돌 없음 | — |
| 4 | `postReviewComment` fallback 시 issues 보존 여부 | OK — review body markdown에 general issues 테이블 포함, line-specific만 유실 (설계 의도) | — |
| 5 | `validatedStructuredOutput` null 시 fallback path | OK — `?? []`로 빈 배열 처리, `postReviewComment` 경로 정상 | — |
| 6 | bodyIssues 빈 배열 시 Issues 헤더 미표시 | OK — `bodyIssues.length > 0` guard로 섹션 자체 skip | — |
| 7 | maxSuggestions Int? 하위 호환성 (기존 사용자) | OK — nullable, 기존 row는 null, default path 작동 | — |

> **7차 결론**: 새로운 issue 0건. 스펙 완전 수렴 확인. 구현 준비 완료.
