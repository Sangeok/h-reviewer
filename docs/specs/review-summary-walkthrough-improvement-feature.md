# 요약/변경 사항 상세 개선

> **Status**: `TODO`
> **Created**: 2026-04-09
> **대상 파일**: `review-schema.ts`, `review-prompt.ts`, `review-formatter.ts`, `review-detail.tsx`, `inngest/functions/review.ts`, `prisma/schema.prisma`

---

## 배경

### 현재 문제

PR 리뷰의 **요약**과 **변경 사항 상세** 섹션이 diff를 한국어로 재서술하는 수준에 그치고 있다.

| 항목 | 현재 | 있어야 할 것 |
|------|------|-------------|
| 요약 | PR 제목 반복 ("useQuery를 useSuspenseQuery로 변경") | 리스크 수준 + 리뷰어 주의사항 + 영향도 |
| 변경 사항 상세 | 비구조화 텍스트 벽 | 파일별 구조화 목록 (변경 유형 + 이유 + 영향) |
| 가독성 | 모든 섹션이 동일한 prose 렌더링 | 시각적 계층 (리스크 배지, 파일 태그, 변경 유형 아이콘) |

### 원인 체인

```
z.string() 스키마 → 분석 관점 프롬프트 지시 부재 → AI가 diff 요약만 생성 → 포맷터가 원시 텍스트 그대로 출력 → 가독성 실패
```

### 구체적 근거

1. **스키마**: `summary`는 `z.string()`, `walkthrough`는 `z.string().nullable()` — suggestions/issues 대비 구조화 수준 격차
2. **프롬프트**: suggestions에 12줄 지시 vs summary/walkthrough에 0줄 지시
3. **포맷터**: issues는 emoji+severity 후처리, summary/walkthrough는 raw dump
4. **렌더링**: `ReactMarkdown`으로 전체를 단일 prose 블록 렌더링 — 섹션 간 시각적 구분 없음

---

## Phase 1: 스키마 구조화

> **⚠️ 배포 제약**: Phase 1(스키마)과 Phase 3(포맷터)는 **반드시 같은 배포 단위**로 나가야 한다.
> Phase 1만 적용하면 `review-formatter.ts`에서 `output.summary`가 object가 되어 `[object Object]`가 마크다운에 출력된다.
> TypeScript 컴파일 에러 없이 런타임에서만 발생하므로 CI에서 잡히지 않는다.

### 코드 변경: `module/ai/lib/review-schema.ts`

```typescript
// ── 현재 ──
export const structuredReviewSchema = z.object({
  summary: z.string().describe("Brief PR overview in 2-3 sentences"),
  walkthrough: z.string().nullable().describe(
    "File-by-file markdown explanation of changes. null if review mode is tiny."
  ),
  // ...나머지 동일
});

// ── 변경 ──
/** reviewData JSON의 스키마 버전. 스키마 구조가 변경될 때마다 증가시킨다.
 *  page.tsx에서 safeParse 실패 시 마크다운 fallback으로 전환되므로,
 *  버전별 마이그레이션 로직 대신 버전 불일치를 로깅하여 모니터링한다. */
export const REVIEW_SCHEMA_VERSION = 1;

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

export const structuredReviewSchema = z.object({
  summary: summarySchema,
  walkthrough: z.array(walkthroughEntrySchema).nullable().describe(
    "File-by-file breakdown. null if review mode is tiny."
  ),
  // ...나머지 동일 (strengths, issues, suggestions, sequenceDiagram)
});
```

### Barrel Export 추가: `module/ai/index.ts`

```typescript
// Types 섹션에 추가
export type { StructuredReviewOutput } from "./lib/review-schema";
export { REVIEW_SCHEMA_VERSION } from "./lib/review-schema";
```

> **설계 근거**: `review-detail.tsx`(클라이언트 컴포넌트)에서 `import type`으로 사용한다. 내부 경로(`module/ai/lib/review-schema`)를 직접 import하면 barrel export 패턴을 위반하므로, barrel을 통해 노출한다.

### 타입 영향

`StructuredReviewOutput`은 `z.infer`로 파생되므로 자동 반영. 다만 아래 파일에서 `output.summary` (string → object), `output.walkthrough` (string → array) 접근 방식 변경 필요:

- `review-formatter.ts` (Phase 3에서 처리 — **Phase 1과 같은 배포 단위 필수**)
- `inngest/functions/review.ts` (Step 7 — summary 텍스트 접근 없음, 영향 없음)

---

## Phase 2: 프롬프트 개선

### 코드 변경: `module/ai/lib/review-prompt.ts`

#### 2-1. diff 메타데이터 사전 추출 (AI 신뢰성 개선)

walkthrough의 `file`과 `changeType`을 AI가 추론하게 하면 enum 위반·파일 경로 할루시네이션 위험이 있다. diff 헤더에서 미리 파싱하여 프롬프트에 주입하면 AI는 `summary` 작성에만 집중할 수 있다.

```typescript
// review-prompt.ts 내부에 private 함수로 추가
function extractFileMeta(diff: string): { file: string; changeType: string }[] {
  return diff
    .split(/^diff --git /m)
    .filter(Boolean)
    .map((block) => {
      // quoted paths 처리: git은 공백·특수문자 포함 경로를 "a/path" "b/path" 형태로 출력
      const quotedMatch = block.match(/^"?a\/.+"?\s+"?b\/(.+?)"?\s*$/m);
      const simpleMatch = block.match(/^a\/.+ b\/(.+)/);
      const fileMatch = quotedMatch ?? simpleMatch;
      if (!fileMatch) return null;
      const file = fileMatch[1];
      const changeType = block.includes("new file mode")
        ? "added"
        : block.includes("deleted file mode")
          ? "deleted"
          : block.includes("rename from")
            ? "renamed"
            : "modified";
      return { file, changeType };
    })
    .filter(Boolean) as { file: string; changeType: string }[];
}
```

> **엣지 케이스**: 공백 포함 경로(`"a/path with space/file.ts" "b/path with space/file.ts"`)를 quoted match로 우선 처리한다. binary 파일은 diff 헤더가 동일하므로 파싱은 되지만, changeType이 항상 "modified"로 분류될 수 있다 (프롬프트 보조 데이터이므로 허용).

#### 2-2. `buildStructuredPrompt()` Review Instructions 확장

`buildStructuredPrompt()`의 Review Instructions 끝에 summary/walkthrough 지시 추가:

```typescript
// 현재 (line 86-105): suggestions/issues 지시만 존재

// 추가할 블록 (line 105 이후):

// diff 메타데이터를 프롬프트에 주입 — AI가 file/changeType을 추론할 필요 없음
const fileMeta = extractFileMeta(diff);
const fileContext = fileMeta
  .map((f) => `- ${f.file} (${f.changeType})`)
  .join("\n");

// Review Instructions 끝에 추가:
- For summary:
  - overview: Describe the PR's purpose and approach. Do NOT restate the PR title.
  - riskLevel: "low" for cosmetic/docs/config changes, "medium" for logic changes with test coverage, "high" for breaking changes, security-sensitive code, missing tests, or changes affecting >5 files
  - keyPoints: What should the reviewer verify? What could break? What assumptions does this PR make?
- For walkthrough:
  - The following files were changed in this PR:
${fileContext}
  - Use EXACTLY these file paths and changeType values in your walkthrough entries
  - Only write the "summary" field: explain WHY this file was changed, its intent, side effects, and relationships to other files
  - Do NOT describe WHAT changed (the diff already shows that)
  - If a file's change depends on another file's change, mention the dependency
```

#### 2-3. `buildSectionInstruction()` 개선

```typescript
// 현재 (line 20-23)
if (policy.summary) {
  const extra = mode === "tiny" ? " (2-3 sentences only)" : "";
  sections.push(`${idx++}. **${headers.summary}**${extra}`);
}

// 변경
if (policy.summary) {
  const extra = mode === "tiny"
    ? " (overview + risk level only, 2-3 sentences, skip keyPoints)"
    : mode === "large"
      ? " (overview + risk level + key review points, focus on key changed files)"
      : " (overview + risk level + key review points)";
  sections.push(`${idx++}. **${headers.summary}**${extra}`);
}
```

---

## Phase 3: 포맷터 개선 (가독성)

### 코드 변경: `module/ai/lib/review-formatter.ts`

```typescript
// ── 현재 ──
sections.push(`## ${headers.summary}\n\n${output.summary}`);

if (output.walkthrough) {
  sections.push(`## ${headers.walkthrough}\n\n${output.walkthrough}`);
}

// ── 변경 ──
// Summary: 리스크 배지 + 개요 + 핵심 포인트
const RISK_BADGE: Record<string, string> = {
  low: "🟢 Low Risk",
  medium: "🟡 Medium Risk",
  high: "🔴 High Risk",
};
const summaryLines = [
  `## ${headers.summary}`,
  "",
  `> **${RISK_BADGE[output.summary.riskLevel]}**`,
  "",
  output.summary.overview,
];
if (output.summary.keyPoints.length > 0) {
  summaryLines.push(
    "",
    `**${headers.reviewFocus}**`,
    "",
    ...output.summary.keyPoints.map(p => `- ${p}`),
  );
}
sections.push(summaryLines.join("\n"));

// Walkthrough: 파일별 구조화 목록
const CHANGE_EMOJI: Record<string, string> = {
  added: "🆕", modified: "✏️", deleted: "🗑️", renamed: "📝",
};
if (output.walkthrough && output.walkthrough.length > 0) {
  const walkthroughLines = [`## ${headers.walkthrough}`, ""];
  for (const entry of output.walkthrough) {
    const emoji = CHANGE_EMOJI[entry.changeType];
    walkthroughLines.push(
      `${emoji} **\`${entry.file}\`**`,
      `> ${entry.summary}`,
      "",
    );
  }
  sections.push(walkthroughLines.join("\n"));
}
```

### SECTION_HEADERS 추가: `shared/constants/index.ts` (Phase 3 포맷터보다 반드시 선행)

```typescript
// 추가 필드
export const SECTION_HEADERS = {
  en: {
    // ...기존 동일
    reviewFocus: "Review Focus",
  },
  ko: {
    // ...기존 동일
    reviewFocus: "리뷰 포인트",
  },
} as const;
```

---

## Phase 4: 웹 UI 가독성 개선

현재 `review-detail.tsx`는 전체 리뷰를 단일 `ReactMarkdown` 블록으로 렌더링한다. Phase 3까지의 마크다운 개선만으로도 GitHub 표시는 충분하지만, **웹 UI에서는 구조화 데이터를 직접 렌더링**하는 것이 가독성에 훨씬 유리하다.

### 4-1. DB 스키마 변경: `prisma/schema.prisma`

```prisma
model Review {
  // ...기존 필드 동일
  review        String    @db.Text
  reviewData    Json?     // 구조화 출력 JSON (웹 UI 렌더링용) — AI 출력 + schemaVersion만 저장
  langCode      String    @default("en")  // 리뷰 생성 시점의 언어 코드 — 별도 컬럼으로 분리
  // ...
}
```

> **설계 근거**: `langCode`는 AI 출력이 아닌 리뷰 메타데이터다. `reviewData` JSON에 섞으면 (1) `safeParse` 시 Zod가 unknown key를 strip하여 별도 추출 로직이 필요하고 (2) DB에서 언어별 쿼리가 불가능하다. 별도 컬럼으로 분리하면 `reviewData`는 순수 AI 출력만 담고, `langCode`는 Prisma 타입으로 직접 접근 가능하다.

> **스키마 버전 관리**: `reviewData`에 `schemaVersion` 필드를 포함하여 저장한다 (Phase 4-2 참조). 향후 스키마 구조가 변경되면 `REVIEW_SCHEMA_VERSION`을 증가시키고, `page.tsx`에서 `safeParse` 실패 시 마크다운 fallback으로 전환된다. 버전 불일치는 로그로 추적하여, 필요 시 마이그레이션 스크립트를 작성할 수 있다.

### 4-2. Inngest Step 7 변경: `inngest/functions/review.ts`

```typescript
// 현재 (line 205-214)
const createdReview = await tx.review.create({
  data: {
    // ...
    review,
    // ...
  },
});

// 변경: reviewData + langCode 추가
// reviewData: AI 구조화 출력 + schemaVersion 저장 (langCode 미포함)
// langCode: 별도 컬럼으로 분리 — DB 쿼리 가능, safeParse 간섭 없음
import { REVIEW_SCHEMA_VERSION } from "@/module/ai";

const createdReview = await tx.review.create({
  data: {
    // ...
    review,
    reviewData: validatedStructuredOutput
      ? { ...validatedStructuredOutput, schemaVersion: REVIEW_SCHEMA_VERSION }
      : null,
    langCode,
    // ...
  },
});
```

### 4-3. 서버 컴포넌트에서 파싱 + ReviewDetail 분리

> **주의:** `review-detail.tsx`는 `"use client"` 컴포넌트다. `structuredReviewSchema`(Zod)를 직접 import하면 Zod 라이브러리와 AI 스키마 전체가 클라이언트 번들에 포함된다. 따라서 **서버 컴포넌트(`page.tsx`)에서 파싱**하고, 결과만 props로 전달한다.

#### `app/dashboard/reviews/[id]/page.tsx` 변경

```tsx
import { getUserReviewById, ReviewDetail } from "@/module/review";
import { structuredReviewSchema, REVIEW_SCHEMA_VERSION } from "@/module/ai";
import { isValidLanguageCode } from "@/module/settings";
import type { LanguageCode } from "@/shared/types/language";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const review = await getUserReviewById(id);

  if (!review) notFound();

  // 서버 컴포넌트에서 Zod 파싱 — 클라이언트 번들에 Zod 미포함
  let structuredData = null;
  if (review.reviewData && typeof review.reviewData === "object") {
    const raw = review.reviewData as Record<string, unknown>;

    // 스키마 버전 불일치 시 로그 + 마크다운 fallback
    if (raw.schemaVersion !== REVIEW_SCHEMA_VERSION) {
      console.warn(
        `Review ${review.id}: schemaVersion ${raw.schemaVersion} !== ${REVIEW_SCHEMA_VERSION}, falling back to markdown`
      );
    } else {
      const parsed = structuredReviewSchema.safeParse(raw);
      structuredData = parsed.success ? parsed.data : null;
    }
  }

  // langCode 검증 — String 컬럼이므로 잘못된 값이 저장될 수 있음
  const langCode: LanguageCode = isValidLanguageCode(review.langCode)
    ? review.langCode
    : "en";

  return <ReviewDetail review={review} structuredData={structuredData} langCode={langCode} />;
}
```

#### `module/review/ui/review-detail.tsx` 변경

```tsx
// 현재: 단일 ReactMarkdown 블록
<CardContent className="prose prose-invert prose-sm max-w-none">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {review.review}
  </ReactMarkdown>
</CardContent>

// 변경: structuredData + langCode를 서버에서 props로 수신
// Zod import 없음 — 타입만 사용 (barrel export 경유)
import type { StructuredReviewOutput } from "@/module/ai";
import type { LanguageCode } from "@/shared/types/language";

// ⚠️ 모든 props는 required — optional로 만들면 page.tsx 수정 누락 시 컴파일 에러가 발생하지 않아 버그가 숨는다.
// structuredData가 null인 경우(기존 리뷰, 파싱 실패)는 타입으로 표현.
interface Props {
  review: ReviewDetailData;
  structuredData: StructuredReviewOutput | null;  // required, null 허용
  langCode: LanguageCode;                          // required
}

<CardContent>
  {structuredData ? (
    <StructuredReviewBody data={structuredData} langCode={langCode} />
  ) : (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {review.review}
      </ReactMarkdown>
    </div>
  )}
</CardContent>
```

### 4-4. 새 컴포넌트: `module/review/ui/parts/structured-review-body.tsx`

```tsx
// Summary 섹션: 리스크 배지 카드 + 개요 + 핵심 포인트 리스트
// Walkthrough 섹션: 파일별 카드 (변경 유형 배지 + 파일 경로 + 설명)
// Strengths/Issues: 기존 마크다운 유지
// 나머지 섹션: ReactMarkdown fallback

import type { StructuredReviewOutput } from "@/module/ai";
import type { LanguageCode } from "@/shared/types/language";
import { SECTION_HEADERS } from "@/shared/constants";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  data: StructuredReviewOutput;
  langCode: LanguageCode;
}

export function StructuredReviewBody({ data, langCode }: Props) {
  return (
    <div className="space-y-6">
      <SummarySection summary={data.summary} />
      {data.walkthrough && <WalkthroughSection entries={data.walkthrough} />}
      {/* strengths, issues, suggestions 등 나머지 섹션:
          reviewData에 포함된 구조화 데이터를 마크다운으로 재구성하여 렌더링.
          review.review(포맷터가 생성한 전체 마크다운)에서 파싱하지 않는다.
          issues: line-specific issues는 GitHub inline comment로만 게시되므로,
          웹 UI에서도 동일하게 project/file-level issues만 표시한다. */}
      <RemainingMarkdownSections data={data} langCode={langCode} />
    </div>
  );
}

/**
 * strengths, issues, suggestions, sequenceDiagram 등
 * 아직 구조화 렌더링이 불필요한 섹션은 reviewData의 원시 값을 마크다운으로 변환하여 렌더링.
 *
 * NOTE: SECTION_HEADERS[langCode]를 사용하여 다국어 헤더 지원.
 * langCode는 Review 모델의 별도 컬럼에서 가져오며, page.tsx에서 props로 전달된다.
 * 하드코딩된 한국어 헤더를 사용하면 영어 사용자에게도 한국어가 표시되는 문제가 발생한다.
 */
function RemainingMarkdownSections({ data, langCode }: { data: StructuredReviewOutput; langCode: LanguageCode }) {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  if (data.strengths && data.strengths.length > 0) {
    const items = data.strengths.map((s) => `- ${s}`).join("\n");
    sections.push(`## ${headers.strengths}\n\n${items}`);
  }
  // ⚠️ line-specific issues는 GitHub inline comment로만 게시되므로 웹 UI에서도 제외.
  // review-formatter.ts와 동일한 필터링 로직을 적용한다.
  const bodyIssues = (data.issues ?? []).filter((i) => i.line === null);
  if (bodyIssues.length > 0) {
    const issueLines = bodyIssues.map(
      (issue) => {
        const fileTag = issue.file ? ` · \`${issue.file}\`` : "";
        return `- **[${issue.severity}]** ${issue.category}${fileTag}  \n  ${issue.description}`;
      }
    );
    sections.push(`## ${headers.issues}\n\n${issueLines.join("\n\n")}`);
  }
  if (data.suggestions && data.suggestions.length > 0) {
    const sugLines = data.suggestions.map(
      (s) => `- **${s.file}:${s.line}** [${s.severity}]: ${s.explanation}`
    );
    sections.push(`## ${headers.suggestions}\n\n${sugLines.join("\n")}`);
  }
  if (data.sequenceDiagram) {
    sections.push(`## ${headers.sequenceDiagram}\n\n\`\`\`mermaid\n${data.sequenceDiagram}\n\`\`\``);
  }

  if (sections.length === 0) return null;

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {sections.join("\n\n")}
      </ReactMarkdown>
    </div>
  );
}
```

**SummarySection 렌더링 구조**:
- 리스크 배지: `low`=green, `medium`=amber, `high`=red 배경의 인라인 배지
- 개요: 일반 텍스트
- 리뷰 포인트: `⚡` bullet list

**WalkthroughSection 렌더링 구조**:
- 파일별 행: `[변경유형 배지] [파일 경로 모노스페이스] — [설명]`
- 변경 유형 배지: added=green, modified=blue, deleted=red, renamed=purple

---

## 구현 순서

| 순서 | Phase | 변경 범위 | 비고 |
|------|-------|----------|------|
| 1 | Phase 1 | `review-schema.ts`, `module/ai/index.ts` | 스키마 변경 + barrel export 추가 + `REVIEW_SCHEMA_VERSION` 도입. **Phase 3과 같은 배포 단위 필수** |
| 2 | Phase 2 | `review-prompt.ts` | `extractFileMeta()` 추가 + 프롬프트 지시 확장. 스키마와 독립적으로 적용 가능 |
| 3 | Phase 3 | `shared/constants/index.ts` → `review-formatter.ts` | Phase 1 필수 선행. **상수 추가 먼저** (`as const` 타입 추론으로 인해 `headers.reviewFocus` 컴파일 에러 방지) |
| 4 | Phase 4 | `schema.prisma`, `review.ts`, `review-detail.tsx`, `page.tsx`, 새 컴포넌트 | Phase 1-3 완료 후. `review-detail.tsx`와 `page.tsx`는 **반드시 같은 커밋**에서 수정 (required props이므로 한쪽만 변경하면 컴파일 에러) |

### 배포 제약

```
⚠️ Phase 1 + Phase 3 = 같은 배포 단위 (필수)
   Phase 1만 배포 시: output.summary가 object가 되어 포맷터에서 [object Object] 출력.
   TypeScript 컴파일 에러 없이 런타임에서만 발생 → CI에서 미검출.

⚠️ Phase 4의 review-detail.tsx + page.tsx = 같은 커밋 (필수)
   required props이므로 한쪽만 변경하면 컴파일 에러.
```

Phase 1-3은 **마크다운 품질 개선** (GitHub + 웹 UI 모두 즉시 반영).
Phase 4는 **웹 UI 전용 구조화 렌더링** (선택적, 가독성 극대화).

---

## 기대 효과 (before → after)

### 요약 섹션

```markdown
<!-- before -->
## 요약
이 PR은 여러 파일에서 useQuery를 useSuspenseQuery로 변경하는 리팩토링입니다.
React Query의 Suspense 모드를 활용하여 데이터 로딩 처리를 개선합니다.

<!-- after -->
## 요약
> **🟡 Medium Risk**

React Query의 데이터 페칭 전략을 useSuspenseQuery로 전환하여
컴포넌트 렌더링과 데이터 로딩의 동기화를 강화합니다.

**리뷰 포인트**
- 모든 useSuspenseQuery 사용처에 Suspense Boundary가 존재하는지 확인 필요
- 기존 isLoading/isError 패턴이 제거되었으므로 Error Boundary 구성 확인
- SSR 환경에서 Suspense 동작 호환성 검증 필요
```

### 변경 사항 상세 섹션

```markdown
<!-- before -->
## 변경 사항 상세
useRepositories 훅에서 useQuery를 useSuspenseQuery로 변경했습니다.
useConnectRepository 훅에서도 동일하게 변경했습니다.
review-list 컴포넌트에서 로딩 상태 처리를 제거했습니다.

<!-- after -->
## 변경 사항 상세

✏️ **`module/repository/hooks/use-repositories.ts`**
> Suspense 전환으로 컴포넌트가 데이터 준비 전까지 suspend됨. 부모에 Suspense fallback 필수.

✏️ **`module/repository/hooks/use-connect-repository.ts`**
> mutation 후 invalidation이 Suspense 모드에서도 정상 동작하는지 확인 필요.

✏️ **`module/review/ui/review-list.tsx`**
> isLoading 분기 제거됨. QueryBoundary가 로딩 UI를 대체.
```

---

## 안티 패턴

### walkthrough에서 WHAT을 서술

```
❌ "use-repositories.ts에서 useQuery를 useSuspenseQuery로 변경했습니다"
✅ "Suspense 전환으로 컴포넌트가 데이터 준비 전까지 suspend됨. 부모에 Suspense fallback 필수."
```

### summary에서 PR 제목 반복

```
❌ "이 PR은 useQuery를 useSuspenseQuery로 변경하는 리팩토링입니다."
✅ "React Query의 데이터 페칭 전략을 useSuspenseQuery로 전환하여 렌더링-로딩 동기화를 강화합니다."
```
