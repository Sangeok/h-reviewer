# 설계: Suggestion UI Improvement

Generated: 2026-04-18
Branch: develop
Repo: Sangeok/hreviewer
Status: Implemented

## 한 줄 결론

GitHub review body의 `개선 제안` 섹션은 Markdown table이 아니라 **summary list**로 렌더링하고, 실제 수정 surface는 기존처럼 GitHub inline suggestion과 웹앱 `SuggestionCard`가 담당한다.

## 문제 정의

현재 GitHub PR review body의 `개선 제안` 섹션은 Markdown table로 렌더링된다. 이 구조는 이미 여러 차례 보정되었다.

- Severity 셀에서 emoji와 텍스트가 줄바꿈되어 `⚠️` 와 `WARNING` 이 분리되었다.
- 긴 파일 경로가 폭을 먹어 `Line` 헤더가 세로로 꺾였다.
- explanation 내부 줄바꿈, pipe escape, path shortening 같은 테이블 전용 보정 로직이 누적되었다.

하지만 GitHub GFM table은 컬럼 폭을 우리가 통제할 수 없고, 긴 code span, 한글/영문 혼합, 좁은 화면, 모바일 뷰에서 같은 문제가 다른 형태로 반복된다. 이 문제는 "테이블을 더 잘 만들기"로 풀리는 종류가 아니다.

또한 현재 제품에는 이미 suggestion 상세를 보여주는 별도 surface가 있다.

- GitHub `Files changed` 탭에는 inline suggestion comment가 달린다.
- 웹앱 리뷰 상세 페이지에는 `module/suggestion/ui/suggestion-list.tsx`의 `SuggestionCard`가 별도 렌더링된다.

즉 review body의 `개선 제안`은 diff viewer가 아니라, **빠르게 스캔되는 summary/index 역할**이 더 적합하다.

## 현재 구현 기준선

### 1. GitHub review body formatter

대상: `module/ai/lib/review-formatter.ts`

현재는 `formatStructuredReviewToMarkdown()` 내부에서 `output.suggestions`를 GFM table로 렌더링한다.

```ts
if (output.suggestions.length > 0) {
  const rows = output.suggestions.map(s => {
    const safeExplanation = s.explanation.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
    const displayPath = shortenFilePath(s.file);
    const safeLine = typeof s.line === "number" && Number.isFinite(s.line) ? s.line : "–";
    return `| ${SEVERITY_EMOJI[s.severity]}\u00A0${s.severity} | \`${displayPath}\` | ${safeLine} | ${safeExplanation} |`;
  });
  const table = [
    `| Severity | File | Line | Description |`,
    `|----------|------|------|-------------|`,
    ...rows,
  ].join("\n");
  sections.push(`## ${headers.suggestions}\n\n${table}`);
}
```

이 formatter는 현재 table 전용 보정 책임까지 같이 갖고 있다.

- `shortenFilePath()` 로 폭을 줄인다.
- `\u00A0` 로 severity 줄바꿈을 막는다.
- `|` escape를 강제한다.
- line 범위는 단일 숫자만 보여줘 multi-line suggestion 정보를 잃는다.

### 2. Prompt 단계의 explanation 제약이 약함

대상: `module/ai/lib/review-prompt.ts`

현재 prompt는 suggestion의 explanation에 대해 사실상 아래 한 줄만 강제한다.

```ts
- explanation: why this change is an improvement
```

이 수준이면 모델이 아래 같은 출력을 만들 수 있다.

- 너무 일반적인 문장
- 줄바꿈이 포함된 설명
- 불필요하게 긴 문장
- file path나 severity를 explanation 안에서 다시 반복하는 문장

table일 때도 품질 문제가 있었지만, summary list로 바뀌면 explanation이 곧 body item의 핵심 문장이므로 제약을 더 명확히 해야 한다.

### 3. 웹앱 structured body가 suggestion을 다시 렌더링함

대상: `module/review/ui/parts/structured-review-body.tsx`

현재 `RemainingMarkdownSections()` 는 structured data의 suggestions를 다시 markdown table로 재구성한다.

```ts
if (data.suggestions && data.suggestions.length > 0) {
  const rows = data.suggestions.map((s) => {
    const safeExplanation = s.explanation.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
    const displayPath = shortenFilePath(s.file);
    const safeLine = typeof s.line === "number" && Number.isFinite(s.line) ? s.line : "–";
    return `| ${SEVERITY_EMOJI[s.severity]}\u00A0${s.severity} | \`${displayPath}\` | ${safeLine} | ${safeExplanation} |`;
  });
  const table = [
    `| Severity | File | Line | Description |`,
    `|----------|------|------|-------------|`,
    ...rows,
  ].join("\n");
  sections.push(`## ${headers.suggestions}\n\n${table}`);
}
```

### 4. 리뷰 상세 페이지에는 이미 SuggestionList가 있음

대상: `module/review/ui/review-detail.tsx`

현재 리뷰 상세 페이지는 review body 아래에서 이미 `SuggestionList` 를 별도로 렌더링한다.

```tsx
{structuredData ? (
  <StructuredReviewBody data={structuredData} langCode={langCode} />
) : (
  <ReactMarkdown>{review.review}</ReactMarkdown>
)}

{review.suggestions.length > 0 && (
  <SuggestionList reviewId={review.id} initialData={review.suggestions} />
)}
```

즉 structuredData 경로에서는 suggestion이 두 번 보인다.

- review body 내부의 markdown table
- review body 아래의 `SuggestionList`

### 5. Inline suggestion comment는 이미 좋은 action surface다

대상: `module/github/lib/pr-review.ts`

현재 `formatSuggestionComment()` 는 suggestion explanation + GitHub `suggestion` code block을 만들어 inline comment로 포스팅한다.

```ts
function formatSuggestionComment(suggestion: CodeSuggestion): string {
  return `${SEVERITY_EMOJI[suggestion.severity]} **${suggestion.severity}**: ${suggestion.explanation}

\`\`\`suggestion
${suggestion.after}
\`\`\``;
}
```

이 경로는 실제 수정 가능한 surface이므로 유지하는 것이 맞다.

## 목표

- GitHub review body에서 suggestion table을 제거한다.
- 사용자가 여전히 `무엇이 문제인지`, `어디를 봐야 하는지`, `얼마나 중요한지`를 빠르게 파악할 수 있게 한다.
- 실제 수정 가능한 코드는 inline suggestion을 primary action surface로 유지한다.
- 웹앱에서는 기존 `SuggestionCard` 기반 경험을 유지하여 상품 가치를 떨어뜨리지 않는다.
- table 전용 보정 로직(`\u00A0`, pipe escape, path shortening dependency)을 줄인다.

## 비목표

- Prisma schema나 suggestion DB 구조를 변경하지 않는다.
- `Apply Fix` / `Dismiss` 동작을 변경하지 않는다.
- severity 체계를 새로 정의하지 않는다.
- inline suggestion comment의 GitHub API 포스팅 전략을 바꾸지 않는다.
- 웹앱 `SuggestionCard`의 시각 디자인을 이번 스펙에서 리디자인하지 않는다.
- `StructuredReviewOutput` 스키마를 바꾸지 않는다.
- structured output 생성 실패 시 자유형 markdown에서 suggestion 객체를 재구성하거나 inline suggestion을 복원하지 않는다.

## 외부 패턴에서 얻은 결론

CodeRabbit는 walkthrough comment를 inline code comment와 분리된 상단 summary로 운영한다. Qodo는 low-noise 원칙 아래 `what / why / how to move forward`를 명확히 전달하는 쪽에 무게를 둔다. GitHub Copilot은 inline suggested change를 실제 action surface로 사용한다. SonarQube는 summary decoration과 inline annotation을 분리한다. Augment도 high-impact issue와 적은 comment 수를 강조한다.

공통점은 하나다.

- 상단 comment는 **스캔용 요약**
- inline comment는 **실행 가능한 액션**
- 상세 UI는 별도 surface에서 제공

따라서 HReviewer도 `개선 제안` body를 "표 형태의 데이터 뷰"가 아니라 "inline suggestion의 요약 인덱스"로 재정의하는 것이 맞다.

## 선택지 비교

### Option A. 테이블 유지 + 추가 보정

- 장점: 현재 포맷과 가장 유사하다.
- 단점: GitHub 렌더링 제약이 근본 원인이라 재발을 막지 못한다.
- 결론: 기각.

### Option B. Markdown pseudo-card

- 예: blockquote, bold label, divider를 이용해 카드처럼 보이게 만들기.
- 장점: table보다 유연하다.
- 단점: body가 과도하게 길어지고, inline suggestion과 정보가 중복된다.
- 결론: 기각.

### Option C. Flat summary list + inline-first

- 한 항목이 한 suggestion과 1:1 대응한다.
- body는 위치와 의미를 빠르게 스캔하게 돕고, 실제 코드는 inline suggestion이 담당한다.
- 웹앱은 기존 `SuggestionCard`가 상세 surface를 유지한다.
- 결론: 채택.

## 최종 UX 결정

### GitHub review body

`개선 제안` 섹션은 아래 형태의 summary list로 렌더링한다.

```md
## 개선 제안

> 아래 항목은 인라인 suggestion과 1:1로 연결됩니다. 실제 코드 변경은 Files changed 탭에서 바로 적용할 수 있습니다.

- ⚠️ WARNING · `module/review/ui/review-detail.tsx:L42-L45`
  리뷰 상세 페이지에서 suggestion 본문이 중복 렌더링됩니다. 상세 액션은 별도 Suggestion 카드로 집중하세요.

- 💡 SUGGESTION · `module/ai/lib/review-prompt.ts:L136`
  suggestion explanation은 한 줄 요약용 문장으로 제한해 body와 inline comment 양쪽에서 스캔성을 유지하세요.
```

### GitHub `Files changed`

기존 inline suggestion comment를 그대로 유지한다. review body는 index 역할만 하고, 실제 코드는 inline suggestion이 담당한다.

### 웹앱 리뷰 상세

structuredData가 존재할 때는 review body 내부에서 suggestions markdown을 **기본적으로** 렌더링하지 않는다. suggestion 상세는 body 아래의 `SuggestionList` 가 전담한다.

다만 레거시/부분 저장 데이터로 인해 아래 조합이 생길 수 있다.

- `structuredData.suggestions` 는 존재함
- DB relation 기반 `review.suggestions` 가 비어 있거나 일부만 존재함

이 경우 review body 안에서 suggestion summary list fallback을 유지하여, 기존 리뷰의 suggestion 가시성이 사라지지 않게 한다. 즉 fallback 기준은 "relation 이 0개인가"가 아니라 "structuredData 기준 suggestion 개수보다 relation 개수가 부족한가"다.

### 생성 fallback + markdown fallback

AI structured output 생성이 실패해 `buildFallbackPrompt()` 경로로 내려가면 이 경로는 **degraded mode** 로 간주한다.

이 경로에서는 아래를 보장하지 않는다.

- structured formatter와 동일한 summary list shape
- `SUGGESTION_SECTION_HINT` 문구
- 각 항목이 inline suggestion과 1:1로 연결된다는 의미
- actionable suggestion object / `SuggestionList` / GitHub inline suggestion 복원

`buildFallbackPrompt()` 는 low-noise markdown을 유도할 수는 있지만, 제품이 이 경로의 exact shape를 전제로 동작하면 안 된다.

structuredData parse에 실패하면 `review.review` 원문 markdown을 그대로 렌더링한다. 따라서 fallback markdown은 "읽기 쉬운 텍스트 리뷰" 수준만 요구하고, structured suggestion UX와 동일성을 요구하지 않는다.

## 출력 규격

### 1. 섹션 힌트 문구

`module/ai/lib/suggestion-format.ts` 에 아래 상수를 둔다.

- 이유: 이 문구는 authoritative suggestion object가 있을 때만 쓰는 suggestion-rendering 문맥이다.
- 사용처: review body formatter, 웹앱 레거시 summary fallback
- 그래도 `shared/constants/index.ts` 로 올릴 정도의 범용 상수는 아니다.

```ts
const SUGGESTION_SECTION_HINT = {
  ko: "> 아래 항목은 인라인 suggestion과 1:1로 연결됩니다. 실제 코드 변경은 Files changed 탭에서 바로 적용할 수 있습니다.",
  en: "> Each item maps 1:1 to an inline suggestion. Apply the actual code change directly from the Files changed tab.",
} as const satisfies Record<LanguageCode, string>;
```

### 2. 항목 포맷

한 suggestion은 반드시 한 markdown list item으로 렌더링한다.

- 첫 줄: `severity + location`
- 둘째 줄: `정규화된 explanation`
- 항목 사이: 빈 줄 1개
- 항목 내부: 추가 bullet, code fence, 표 금지

정확한 출력 shape:

```md
- {emoji} {severity} · `{file}:L{startLine}`
  {explanation}
```

multi-line suggestion이면:

```md
- {emoji} {severity} · `{file}:L{startLine}-L{endLine}`
  {explanation}
```

### 3. location 계산 규칙

location은 exact relative path를 사용한다. 축약하지 않는다.

- `file`: diff에 들어온 exact relative path 그대로 사용
- `startLine`: `suggestion.line`
- `endLine`: `suggestion.line + beforeLineCount - 1`
- `beforeLineCount`: `suggestion.before.split("\n").length`

helper 계약:

```ts
function formatSuggestionLocation(suggestion: CodeSuggestion): string {
  const hasValidLine = Number.isFinite(suggestion.line) && suggestion.line > 0;
  if (!hasValidLine) {
    return suggestion.file;
  }

  const beforeLineCount = suggestion.before.split("\n").length;
  const endLine = suggestion.line + beforeLineCount - 1;

  return beforeLineCount > 1
    ? `${suggestion.file}:L${suggestion.line}-L${endLine}`
    : `${suggestion.file}:L${suggestion.line}`;
}
```

주의:

- 새 포맷에서는 `Line` 컬럼이 없으므로 `–` placeholder를 노출할 이유가 없다.
- line이 비정상이어도 `file` 만 보여주고 깨진 location 문자열은 만들지 않는다.
- suggestion schema상 line은 원래 필수 number이므로 이 분기는 방어 로직이다.

### 4. explanation 정규화 규칙

table을 없애면 `|` escape는 더 이상 필요 없다. 대신 summary list에 맞는 한 줄 정규화가 필요하다.

정규화 규칙:

- `\r`, `\n` 은 공백 하나로 치환
- 연속 공백은 공백 하나로 축약
- 앞뒤 공백은 trim
- explanation이 비어 있으면 빈 문자열 대신 렌더링을 건너뛰지 말고, 가능한 한 prompt 단계에서 방지한다

helper 계약:

```ts
function normalizeSuggestionExplanation(explanation: string): string {
  return explanation
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
```

이 정규화는 review body 전용이 아니다.

- review body summary list
- GitHub inline suggestion comment
- one-click fix commit message subject

세 surface가 모두 같은 single-line explanation을 사용한다. commit subject는 정규화 후 truncate한다.

### 5. 항목 정렬 규칙

formatter는 `output.suggestions`의 순서를 그대로 유지한다.

- severity 기준으로 formatter 단계에서 재정렬하지 않는다.
- suggestion 우선순위는 이미 모델이 정한 순서를 신뢰한다.
- formatter 책임은 presentation뿐이다.

### 6. 섹션 생략 규칙

- `output.suggestions.length === 0` 이면 `개선 제안` 섹션 자체를 만들지 않는다.
- hint만 단독으로 렌더링하지 않는다.
- 빈 목록 placeholder도 만들지 않는다.

## 파일별 구현 계약

### 1. `module/ai/lib/suggestion-format.ts`

변경 목적:

- suggestion 관련 문자열/markdown 포맷 책임을 전용 파일로 분리한다.
- review body, 웹앱 fallback, inline comment, commit message가 같은 정규화 규칙을 공유하게 한다.

세부 계약:

1. 아래 항목을 이 파일로 이동하거나 신규 정의한다.

```ts
export const SUGGESTION_SECTION_HINT
export function normalizeSuggestionExplanation(explanation: string): string
export function formatSuggestionLocation(suggestion: CodeSuggestion): string
export function formatSuggestionSummaryItem(suggestion: CodeSuggestion): string
```

2. 이 파일은 suggestion formatting 전용이며, issue formatter 로직은 포함하지 않는다.
3. 이 파일은 `review-formatter.ts` 의 부속물이 아니라 suggestion surface 간 shared helper다.
4. import boundary를 아래처럼 고정한다.

```ts
// 허용
import type { CodeSuggestion } from "../types/suggestion";
import type { LanguageCode } from "@/shared/types/language";

// 금지
import { ... } from "@/module/ai";
import { ... } from "./index";
import prisma from "@/lib/db";
```

5. 이 파일은 pure helper만 포함한다.

- top-level side effect 금지
- Prisma / Next.js runtime helper / `server-only` / `client-only` import 금지
- 클라이언트와 서버 양쪽에서 안전하게 import 가능해야 한다

### 2. `module/ai/lib/review-formatter.ts`

변경 목적:

- suggestion table 생성 제거
- summary list formatter 적용
- `shortenFilePath()` 제거

세부 계약:

1. `shortenFilePath()` export와 구현을 삭제한다.
2. `SUGGESTION_SECTION_HINT` 와 `formatSuggestionSummaryItem()` 을 `module/ai/lib/suggestion-format.ts` 에서 import한다.
3. suggestion section 생성부를 아래 shape로 교체한다.

```ts
if (output.suggestions.length > 0) {
  const items = output.suggestions
    .map(formatSuggestionSummaryItem)
    .join("\n\n");

  sections.push(
    `## ${headers.suggestions}\n\n${SUGGESTION_SECTION_HINT[langCode]}\n\n${items}`
  );
}
```

추가 주의:

- issue formatter 로직은 건드리지 않는다.
- walkthrough, summary, sequenceDiagram, strengths의 순서도 건드리지 않는다.
- suggestion section의 위치는 지금처럼 `issues` 다음에 유지한다.

### 3. `module/ai/lib/review-prompt.ts`

변경 목적:

- explanation이 summary list와 inline comment 양쪽에 재사용될 수 있게 품질을 제한한다.
- structured output 생성 실패 시 fallback markdown의 기대 수준을 degraded mode에 맞게 제한한다.

현재:

```ts
- explanation: why this change is an improvement
```

변경 후 지시문은 최소 아래 의미를 모두 포함해야 한다.

```ts
- explanation: 1-2 short sentences describing the issue and the intended fix
- Keep explanation concise and self-contained because it is rendered in the review-body summary list and the inline suggestion comment
- Do NOT use bullet lists, markdown tables, headings, or manual line breaks inside explanation
- Do NOT repeat file paths, line numbers, severity labels, or code fences inside explanation
- Prefer this shape: problem first, action second
```

좋은 예:

- `isLoading can briefly fall back to false between chained requests. Tie the flag to the full request lifecycle.`
- `리뷰 상세에서 suggestion이 body와 카드에 중복 노출됩니다. 본문에서는 summary만 남기고 상세 액션은 카드에 집중하세요.`

나쁜 예:

- `Potential issue. Consider improving this logic.`
- `Problem:\n- state can flicker\n- controls re-enable`
- `WARNING at module/review/ui/review-detail.tsx:42`

주의:

- suggestion 수, severity 규칙, issue 규칙은 그대로 유지한다.
- explanation만 더 강하게 제약한다.
- `buildFallbackPrompt()` 에는 아래 수준의 guidance만 추가한다.

```ts
- In the "${headers.suggestions}" section, do NOT use markdown tables
- If you mention suggestions, prefer short bullets or brief prose
- Do NOT claim that fallback markdown items map 1:1 to inline suggestions
- Do NOT emit the inline-mapping hint in fallback markdown
```

- 즉 fallback markdown은 저노이즈 텍스트 리뷰를 목표로 하되, structured suggestion UX와의 exact parity를 목표로 하지 않는다.

### 4. `module/review/ui/parts/structured-review-body.tsx`

변경 목적:

- structuredData 경로에서 suggestion 중복 렌더링을 제거하되, 레거시 리뷰의 suggestion 가시성은 유지한다.

세부 계약:

1. Props에 `shouldRenderSuggestionSummary: boolean` 을 추가한다.
2. `shortenFilePath` import를 삭제하고, `formatSuggestionSummaryItem()` 및 `SUGGESTION_SECTION_HINT` 를 `module/ai/lib/suggestion-format.ts` 에서 import한다.
3. `RemainingMarkdownSections()` 내부에서 아래 규칙으로 suggestions section을 처리한다.

```ts
if (shouldRenderSuggestionSummary && data.suggestions.length > 0) {
  const items = data.suggestions.map(formatSuggestionSummaryItem).join("\n\n");
  sections.push(`## ${headers.suggestions}\n\n${SUGGESTION_SECTION_HINT[langCode]}\n\n${items}`);
}
```

4. `shouldRenderSuggestionSummary === false` 이면 structured view 안에서 suggestions markdown을 렌더링하지 않는다.
5. `sequenceDiagram` 과 `issues` 렌더링은 유지한다.
6. `ReactMarkdown` + `remarkGfm` 조합은 그대로 유지한다.

의도적으로 하지 않는 것:

- 별도 SuggestionSummarySection 컴포넌트를 만들지 않는다.
- `SuggestionList` 의 렌더 위치를 옮기지 않는다.

이유:

- DB suggestion relation이 정상적으로 존재할 때는 `ReviewDetail` 아래쪽 `SuggestionList` 가 suggestion 표시 책임을 갖는다.
- relation 데이터가 비어 있는 레거시 리뷰에서는 structuredData 기반 summary list fallback이 마지막 가시성 보루다.

### 5. `module/review/ui/review-detail.tsx`

변경 목적:

- card surface와 body fallback 중 어느 경로를 쓸지 결정한다.

세부 계약:

1. 아래 boolean을 계산한다.

```ts
const structuredSuggestionCount = structuredData?.suggestions.length ?? 0;
const persistedSuggestionCount = review.suggestions.length;
const shouldRenderSuggestionSummary =
  persistedSuggestionCount < structuredSuggestionCount;
```

2. `StructuredReviewBody` 에 이 값을 전달한다.

```tsx
<StructuredReviewBody
  data={structuredData}
  langCode={langCode}
  shouldRenderSuggestionSummary={shouldRenderSuggestionSummary}
/>
```

3. `SuggestionList` 의 기존 위치와 QueryBoundary 구조는 유지한다.

결과:

- relation count가 structured count와 같으면: 위 body에서는 suggestions 숨김, 아래 `SuggestionList` 노출
- relation count가 structured count보다 작으면: 위 body에서 summary list fallback 노출
- relation count가 structured count보다 작고 0보다 크면: 하단 `SuggestionList` 는 유지한다. 일부 중복보다 일부 suggestion 유실 방지가 우선이다.
- relation count가 0이면: 위 body에서 summary list fallback 노출, 아래 `SuggestionList` 생략

### 6. `module/github/lib/pr-review.ts`

변경 목적:

- inline suggestion comment의 action surface는 유지하되 explanation 노이즈를 줄인다.

세부 계약:

1. `formatSuggestionComment()` 에서 `normalizeSuggestionExplanation()` 을 `module/ai/lib/suggestion-format.ts` 에서 import해 사용한다.

```ts
function formatSuggestionComment(suggestion: CodeSuggestion): string {
  const explanation = normalizeSuggestionExplanation(suggestion.explanation);
  return `${SEVERITY_EMOJI[suggestion.severity]} **${suggestion.severity}**: ${explanation}

\`\`\`suggestion
${suggestion.after}
\`\`\``;
}
```

2. `suggestion` code block과 GitHub PR Review API 포스팅 전략은 그대로 유지한다.

유지 이유:

- inline suggestion comment는 실제 action surface다.
- 바꾸는 것은 explanation 문자열의 줄바꿈/공백 정규화뿐이다.
- 이번 스펙의 범위는 review body 개선이지만, 같은 explanation을 재사용하는 surface의 노이즈는 함께 줄여야 한다.

### 7. `module/suggestion/actions/index.ts`

변경 목적:

- one-click fix commit message subject도 같은 explanation 정규화 규칙을 따르게 한다.

세부 계약:

1. commit message subject 생성 전에 `normalizeSuggestionExplanation()` 을 `module/ai/lib/suggestion-format.ts` 에서 import해 적용한다.

```ts
const explanation = normalizeSuggestionExplanation(suggestion.explanation);
const commitMessage = `refactor: ${truncate(explanation, 72)}\n\nApplied via HReviewer one-click fix`;
```

2. 저장된 suggestion explanation 원문은 변경하지 않는다.
3. `Apply Fix` 동작 자체는 바꾸지 않는다.

### 8. `module/ai/lib/review-schema.ts`

변경 없음.

이유:

- suggestion 구조 자체는 그대로다.
- 바뀌는 것은 renderer와 prompt 품질 제약뿐이다.

## 구현 순서

1. `module/ai/lib/suggestion-format.ts` 를 만들어 shared helper를 분리한다.
2. `review-formatter.ts` 에서 suggestion section을 summary list로 전환한다.
3. `review-prompt.ts` 에서 explanation 제약을 강화하고 fallback markdown을 degraded mode로 정의한다.
4. `structured-review-body.tsx` 와 `review-detail.tsx` 에서 웹앱 fallback gating을 추가한다.
5. `pr-review.ts` 와 `module/suggestion/actions/index.ts` 에서 explanation 정규화를 재사용한다.
6. `shortenFilePath()` 의 남은 사용처가 없는지 확인하고 제거한다.
7. `npm run lint`
8. `npx tsc --noEmit`
9. GitHub PR 및 레거시 리뷰 수동 검증

## 수정 대상 파일

| 파일 | 변경 | 비고 |
|------|------|------|
| `docs/specs/suggestion-ui-improvement-feature.md` | 스펙 보강 | 현재 문서 |
| `module/ai/lib/suggestion-format.ts` | 필수 | suggestion formatting/normalization shared helper 신규 |
| `module/ai/lib/review-formatter.ts` | 필수 | suggestion table -> summary list, shared helper import, `shortenFilePath()` 제거 |
| `module/ai/lib/review-prompt.ts` | 필수 | explanation 제약 강화 + fallback degraded-mode guidance |
| `module/review/ui/parts/structured-review-body.tsx` | 필수 | structured view 기본 중복 제거 + 레거시 suggestion fallback |
| `module/review/ui/review-detail.tsx` | 필수 | `shouldRenderSuggestionSummary` 결정 |
| `module/github/lib/pr-review.ts` | 필수 | inline explanation 정규화 재사용 |
| `module/suggestion/actions/index.ts` | 필수 | commit subject explanation 정규화 재사용 |
| `module/ai/lib/review-schema.ts` | 변경 없음 | 스키마 변경 불필요 |

## 기대 효과

- GitHub에서 suggestion table column width 붕괴가 더 이상 발생하지 않는다.
- 긴 경로가 있어도 "구조가 깨지는 문제"가 아니라 "줄이 길어지는 문제"로 축소된다.
- multi-line suggestion이 `L42-L45` 형태로 더 정확하게 노출된다.
- 사용자는 review body에서 위치와 우선순위를 빠르게 스캔하고, 실제 수정은 inline suggestion으로 바로 이어갈 수 있다.
- 웹앱에서는 기존 `SuggestionCard` 경험이 유지되고, 레거시 리뷰에서도 suggestion 가시성이 사라지지 않는다.
- inline comment와 one-click fix commit subject가 multi-line explanation 노이즈를 덜 받는다.
- suggestion formatting 책임이 `review-formatter.ts` 밖의 전용 helper로 분리되어 후속 수정이 쉬워진다.
- shared helper의 import 경계가 명확해져 클라이언트/서버 혼입과 배럴 순환 의존 위험이 줄어든다.

## 리스크

- table 대비 한 화면에 보이는 density는 줄어든다.
- explanation 품질이 낮으면 summary list의 가치도 낮아진다.
- exact file path가 매우 길면 bullet item 첫 줄이 길어질 수 있다.

하지만 이 리스크는 "레이아웃 자체가 깨져 의미가 무너지는 리스크"보다 작다. 또한 density 감소는 inline suggestion과 dashboard card가 이미 보완한다. explanation 품질 리스크도 prompt 강화 + single-line 정규화로 blast radius를 줄일 수 있다.

## 검증

### 필수 수동 검증

1. 긴 파일 경로 suggestion 3개가 있는 PR에서 GitHub body가 table 없이 bullet list로 렌더링되는지 확인
2. multi-line suggestion이 `L42-L45` 범위로 표시되는지 확인
3. explanation에 줄바꿈이 포함돼도 body에서는 단일 문장으로 정리되는지 확인
4. exact file path가 축약되지 않고 그대로 노출되는지 확인
5. structured output 생성 실패 시 fallback markdown 경로가 GFM table에 의존하지 않고, 1:1 inline suggestion 연결을 암시하는 문구를 출력하지 않는지 확인
6. GitHub inline suggestion comment는 기존처럼 `suggestion` code block으로 포스팅되되 explanation이 단일 문장으로 정리되는지 확인
7. 웹앱 리뷰 상세에서 DB suggestion relation이 있는 리뷰는 review body 안 suggestions section이 사라지고, 하단 `SuggestionList` 만 남는지 확인
8. `structuredData.suggestions` 는 있으나 DB relation suggestion이 일부만 존재하는 레거시 리뷰에서 body summary list fallback과 하단 `SuggestionList` 가 함께 보이는지 확인
9. `structuredData.suggestions` 는 있으나 DB relation suggestion이 없는 레거시 리뷰에서 body summary list fallback이 보이는지 확인
10. structuredData parse 실패 시 markdown fallback이 raw markdown 그대로 자연스럽게 보이는지 확인
11. one-click fix commit message subject가 줄바꿈 없이 생성되는지 확인

### 정적 검증

1. `rg "shortenFilePath" module` 결과가 없어야 한다.
2. `npm run lint`
3. `npx tsc --noEmit`

### 선택 검증

테스트를 추가한다면 `module/ai/lib/suggestion-format.ts` 의 pure helper에 아래 케이스를 붙인다.

- single-line suggestion -> `file:L10`
- multi-line suggestion -> `file:L10-L12`
- explanation newline collapse
- invalid line fallback -> `file` 만 출력

## 미결정 사항

없음.

이 문서 수준이면 구현자는 아래를 추가 추측할 필요가 없다.

- summary list의 exact markdown shape
- line range 계산식
- explanation 정규화 규칙
- structured view에서 suggestion을 언제 제거하고 언제 fallback으로 남길지
- inline suggestion 경로를 변경할지 여부

즉 이 스펙은 실제 코드 수정에 바로 들어갈 수 있는 수준으로 확정되었다.

## 참고 자료

- CodeRabbit PR Walkthroughs: https://docs.coderabbit.ai/pr-reviews/walkthroughs
- GitHub Copilot code review: https://docs.github.com/en/copilot/concepts/agents/code-review
- Qodo Code Review experience: https://docs.qodo.ai/code-review
- SonarQube Cloud pull request analysis: https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/pull-request-analysis
- Augment Code Review overview: https://docs.augmentcode.com/codereview/overview
- Augment review styles: https://docs.augmentcode.com/codereview/review-style
