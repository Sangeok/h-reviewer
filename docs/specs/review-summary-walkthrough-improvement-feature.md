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
  keyPoints: z.array(z.string()).describe(
    "Top 2-3 things the reviewer must pay attention to. " +
    "Examples: missing error handling, Suspense boundary requirements, API contract changes."
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

### 타입 영향

`StructuredReviewOutput`은 `z.infer`로 파생되므로 자동 반영. 다만 아래 파일에서 `output.summary` (string → object), `output.walkthrough` (string → array) 접근 방식 변경 필요:

- `review-formatter.ts` (Phase 3에서 처리)
- `inngest/functions/review.ts` (Step 7 — summary 텍스트 접근 없음, 영향 없음)

---

## Phase 2: 프롬프트 개선

### 코드 변경: `module/ai/lib/review-prompt.ts`

`buildStructuredPrompt()`의 Review Instructions 끝에 summary/walkthrough 지시 추가:

```typescript
// 현재 (line 86-105): suggestions/issues 지시만 존재

// 추가할 블록 (line 105 이후):
- For summary:
  - overview: Describe the PR's purpose and approach. Do NOT restate the PR title.
  - riskLevel: "low" for cosmetic/docs/config changes, "medium" for logic changes with test coverage, "high" for breaking changes, security-sensitive code, missing tests, or changes affecting >5 files
  - keyPoints: What should the reviewer verify? What could break? What assumptions does this PR make?
- For walkthrough:
  - Each entry must explain WHY this file was changed, not WHAT was changed (the diff shows what)
  - Focus on intent, side effects, and relationships between files
  - If a file's change depends on another file's change, mention the dependency
```

### `buildSectionInstruction()` 개선

```typescript
// 현재 (line 20-23)
if (policy.summary) {
  const extra = mode === "tiny" ? " (2-3 sentences only)" : "";
  sections.push(`${idx++}. **${headers.summary}**${extra}`);
}

// 변경
if (policy.summary) {
  const extra = mode === "tiny"
    ? " (overview only, 2-3 sentences)"
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
  reviewData    Json?     // 구조화 출력 JSON (웹 UI 렌더링용)
  // ...
}
```

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

// 변경: reviewData 추가 (langCode 포함 — 웹 UI 렌더링 시 섹션 헤더 다국어 지원용)
// Prisma Json 필드는 plain object를 자동 직렬화하므로 이중 변환 불필요
const createdReview = await tx.review.create({
  data: {
    // ...
    review,
    reviewData: validatedStructuredOutput
      ? { ...validatedStructuredOutput, langCode }
      : null,
    // ...
  },
});
```

### 4-3. 서버 컴포넌트에서 파싱 + ReviewDetail 분리

> **주의:** `review-detail.tsx`는 `"use client"` 컴포넌트다. `structuredReviewSchema`(Zod)를 직접 import하면 Zod 라이브러리와 AI 스키마 전체가 클라이언트 번들에 포함된다. 따라서 **서버 컴포넌트(`page.tsx`)에서 파싱**하고, 결과만 props로 전달한다.

#### `app/dashboard/reviews/[id]/page.tsx` 변경

```tsx
import { getUserReviewById, ReviewDetail } from "@/module/review";
import { structuredReviewSchema } from "@/module/ai/lib/review-schema";
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
  const parsed = review.reviewData
    ? structuredReviewSchema.safeParse(review.reviewData)
    : null;

  const structuredData = parsed?.success ? parsed.data : null;

  // reviewData JSON에 포함된 langCode 추출 (리뷰 생성 시점의 언어)
  const langCode = review.reviewData &&
    typeof review.reviewData === "object" &&
    "langCode" in review.reviewData
    ? (review.reviewData.langCode as LanguageCode)
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
// Zod import 없음 — 타입만 사용
import type { StructuredReviewOutput } from "@/module/ai/lib/review-schema";
import type { LanguageCode } from "@/shared/types/language";

interface Props {
  review: ReviewDetailData;
  structuredData: StructuredReviewOutput | null;
  langCode: LanguageCode;
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

import type { StructuredReviewOutput } from "@/module/ai/lib/review-schema";
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
          review.review(포맷터가 생성한 전체 마크다운)에서 파싱하지 않는다. */}
      <RemainingMarkdownSections data={data} langCode={langCode} />
    </div>
  );
}

/**
 * strengths, issues, suggestions, sequenceDiagram 등
 * 아직 구조화 렌더링이 불필요한 섹션은 reviewData의 원시 값을 마크다운으로 변환하여 렌더링.
 *
 * NOTE: SECTION_HEADERS[langCode]를 사용하여 다국어 헤더 지원.
 * 하드코딩된 한국어 헤더를 사용하면 영어 사용자에게도 한국어가 표시되는 문제가 발생한다.
 */
function RemainingMarkdownSections({ data, langCode }: { data: StructuredReviewOutput; langCode: LanguageCode }) {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  if (data.strengths && data.strengths.length > 0) {
    const items = data.strengths.map((s) => `- ${s}`).join("\n");
    sections.push(`## ${headers.strengths}\n\n${items}`);
  }
  if (data.issues && data.issues.length > 0) {
    const issueLines = data.issues.map(
      (issue) => `- **[${issue.severity}]** ${issue.description}`
    );
    sections.push(`## ${headers.issues}\n\n${issueLines.join("\n")}`);
  }
  if (data.suggestions && data.suggestions.length > 0) {
    const sugLines = data.suggestions.map(
      (s) => `- ${s.description}`
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
| 1 | Phase 1 | `review-schema.ts` | 스키마 변경 → 타입 자동 반영 |
| 2 | Phase 2 | `review-prompt.ts` | 스키마와 독립적으로 적용 가능 |
| 3 | Phase 3 | `shared/constants/index.ts` → `review-formatter.ts` | Phase 1 필수 선행. **상수 추가 먼저** (`as const` 타입 추론으로 인해 `headers.reviewFocus` 컴파일 에러 방지) |
| 4 | Phase 4 | `schema.prisma`, `review.ts`, `review-detail.tsx`, 새 컴포넌트 | Phase 1-3 완료 후 |

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
