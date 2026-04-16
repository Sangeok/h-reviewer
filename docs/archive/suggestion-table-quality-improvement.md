# Suggestion 테이블 품질 개선 기능 개발 문서

> 브리프 기반으로 작성됨 — 검토 후 보완 필요

## 1. 배경/동기

AI 코드 리뷰 결과의 "개선 제안"(suggestions) 테이블에서 4가지 품질 문제가 발견되었다.
실제 GitHub PR에 게시된 리뷰 스크린샷을 분석한 결과, 다음 증상이 확인되었다:

1. **라인 번호 부정확**: `usePlayUrl.ts`의 `useEffect` 관련 suggestion이 Line 2로 표시됨. Line 2는 import 구문이므로 AI가 잘못된 라인 번호를 생성한 것이다. 현재 시스템은 suggestion의 `line` 값을 diff의 실제 added lines와 대조 검증하지 않아, 엉뚱한 라인에 인라인 코멘트가 달리거나 GitHub API 422 에러로 전체 suggestion 게시가 실패한다.

2. **컬럼 너비 불균형**: 긴 파일 경로(`ai-podcast-clipper-frontend/src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx` — 89자)가 테이블 공간을 과도하게 차지하여 "Line" 헤더가 글자별로 세로 렌더링되는 등 가독성이 심각하게 저하된다.

3. **Severity 과대 평가**: "isLoading이 잠시 false로 남아있을 수 있음" 같은 UI 미세 이슈가 WARNING으로 분류됨. SUGGESTION 또는 INFO가 적절하다. 프롬프트의 severity 가이드가 단순하고, post-generation 검증이 없다.

4. **Line 컬럼 다중 값 표시**: Line 컬럼에 "7, 13" 같은 다중 값이 표시됨. 스키마는 `z.number()`로 단일 숫자만 허용하지만, Gemini의 `experimental_output`에 대한 명시적 재검증이 없어 비정상 값이 그대로 렌더링될 수 있다.

---

## 2. 목표 상태

### 목표

- **라인 번호 검증**: AI가 생성한 suggestion의 `line`이 해당 파일의 diff added lines에 포함되는지 검증하고, 범위 밖 suggestion은 drop한다
- **파일 경로 축약**: suggestion 테이블에서 긴 파일 경로를 45자 이내로 축약하여 컬럼 너비 균형을 개선한다
- **Severity 정확도 향상**: 프롬프트에 severity 분류 기준을 강화하여 과대 평가를 줄인다
- **Line 값 방어적 검증**: `experimental_output`에 대한 Zod 재검증을 추가하고, 렌더링 시 비정상 line 값을 방어적으로 처리한다

### 비목표

- 개선 제안 테이블에 `before`/`after` 코드 블록을 추가하는 것은 이번 범위에서 제외한다
- 테이블 컬럼 헤더의 다국어 처리(Severity → 심각도 등)는 이번 범위에서 제외한다
- suggestion 스키마 구조 변경이나 DB 마이그레이션은 수행하지 않는다
- `extractDiffFileSet()` 함수의 제거나 리팩토링은 하지 않는다

### 성공 기준

- diff의 added lines에 없는 `line` 값을 가진 suggestion이 GitHub에 게시되지 않는다
- 45자 초과 파일 경로가 `…/` 접두사로 축약되어 테이블에 표시된다
- AI가 생성하는 suggestion에서 style/naming 관련 항목이 CRITICAL/WARNING으로 분류되는 빈도가 감소한다
- `typeof s.line !== "number"` 인 suggestion이 렌더링 전에 필터링된다
- 기존 테스트 통과 + `npm run build` 성공

---

## 3. 대안 분석

### 문제 1: 라인 번호 검증 방식

#### Option A: strict added-line 검증

`s.line`이 `addedLines` Set에 정확히 포함되는지만 확인한다.

- 장점: 구현 단순, 프롬프트 의도("line: must be a valid added line number")에 정확히 부합
- 단점: multi-line `before` 필드가 context line에서 시작하는 경우 유효한 suggestion도 drop될 수 있음

#### Option B: range-based 검증 (multi-line before 고려)

`[s.line, s.line + beforeLineCount - 1]` 범위 내 어떤 라인이라도 `addedLines`에 포함되면 허용한다.

- 장점: multi-line suggestion의 시작점이 context line이어도 허용하여 유효한 suggestion 보존
- 단점: 구현이 약간 복잡하지만, `s.before.split("\n").length` 계산만 추가됨

#### 선택: Option B

- 근거: `pr-review.ts:43-51`에서 이미 `beforeLineCount`를 계산하여 `startLine`/`line`을 설정하고 있으므로, range 기반 검증이 GitHub API의 실제 동작과 일치한다. AI가 multi-line suggestion의 시작점을 context line으로 잡는 경우는 실제로 발생하며, 이를 무조건 drop하면 유효한 제안을 잃는다.

### 문제 2: 파일 경로 축약 방식

#### Option A: basename만 표시

`UploadedFileCard.tsx`처럼 파일명만 표시한다.

- 장점: 가장 짧음
- 단점: 동명 파일 구분 불가 (예: `components/Button.tsx`와 `ui/Button.tsx`)

#### Option B: 마지막 2-3 세그먼트 + 말줄임

`…/_component/UploadedFileCard.tsx`처럼 마지막 2개 경로 세그먼트를 유지하고 앞을 `…/`로 축약한다.

- 장점: 파일명 + 상위 디렉토리로 충분한 식별 가능, 동명 파일 구분 가능
- 단점: 극단적으로 긴 파일명에서는 여전히 길 수 있지만 현실적으로 드묾

#### 선택: Option B

- 근거: 마지막 2개 세그먼트는 대부분의 경우 파일을 고유하게 식별할 수 있으며, 원래 89자 경로가 약 35-40자로 줄어든다. GitHub PR과 프론트엔드 양쪽에서 동일하게 작동한다.

### 문제 3: Severity 과대 평가 대응 방식

#### Option A: 프롬프트 개선만

severity 가이드를 구체적인 예시/반례와 함께 확장한다.

- 장점: 근본 원인(AI 가이드 부족) 해결, 유지보수 간단
- 단점: AI 모델의 준수 여부를 보장할 수 없음

#### Option B: 프롬프트 + post-generation 키워드 기반 severity 다운그레이드

프롬프트 개선에 더해, `explanation`에서 style/naming 관련 키워드를 감지하면 severity를 자동 다운그레이드한다.

- 장점: 이중 안전장치
- 단점: 키워드 매칭이 오탐/미탐 발생 가능. 정당한 WARNING도 다운그레이드될 위험. 유지보수 부담 증가

#### 선택: Option A

- 근거: 키워드 기반 severity 조정은 false positive 위험이 높다. 예를 들어 "naming collision causes data loss" 같은 실제 WARNING을 키워드 "naming"으로 잘못 다운그레이드할 수 있다. 프롬프트에 구체적 예시와 counter-example을 추가하는 것이 더 안전하고 유지보수가 쉽다.

### 문제 4: Line 값 방어 방식

#### Option A: Zod safeParse 재검증

`experimental_output` 수신 후 `structuredReviewSchema.safeParse()`로 재검증한다.

- 장점: 스키마 전체를 재검증하므로 line뿐 아니라 다른 필드의 비정상 값도 catch
- 단점: 이미 SDK 레벨에서 검증된 데이터를 한 번 더 검증하는 중복. 하지만 SDK 검증이 완벽하지 않을 수 있으므로 안전장치로서 가치가 있음

#### 선택: Option A + Step 5 방어적 필터링

- 근거: safeParse가 실패하면 markdown fallback으로 전환하여 깨진 structured output이 시스템을 오염시키지 않는다. 추가로 Step 5에서 `typeof s.line === "number"` 가드를 추가하여 이중 방어한다.

---

## 4. 구현 계획

### 4.1 신규 함수: `extractDiffAddedLinesMap()` — diff-parser.ts

`module/github/lib/diff-parser.ts`에 추가. 기존 `parseDiffFiles()`를 재사용하여 파일별 added lines Map을 반환한다.

```typescript
/**
 * diff에 포함된 파일별 added line 번호 Set을 반환한다.
 * suggestion line 검증에 사용. rename의 old/new 경로 둘 다 매핑한다.
 */
export function extractDiffAddedLinesMap(
  diffText: string,
): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const f of parseDiffFiles(diffText)) {
    const lineSet = new Set(f.addedLines);
    map.set(f.filePath, lineSet);
    if (f.originalPath) map.set(f.originalPath, lineSet);
  }
  return map;
}
```

### 4.2 신규 유틸리티: `shortenFilePath()` — review-formatter.ts

`module/ai/lib/review-formatter.ts`에 추가하고 export. `structured-review-body.tsx`에서도 import하여 사용한다.

```typescript
/**
 * 긴 파일 경로를 maxLength 이내로 축약한다.
 * 마지막 2개 세그먼트를 유지하고 앞을 '…/'로 대체한다.
 * 축약 후에도 초과하면 마지막 세그먼트만 유지한다.
 */
export function shortenFilePath(
  filePath: string,
  maxLength: number = 45,
): string {
  if (filePath.length <= maxLength) return filePath;
  const segments = filePath.split("/");
  if (segments.length <= 2) return filePath;

  const twoSegments = `…/${segments.slice(-2).join("/")}`;
  if (twoSegments.length <= maxLength) return twoSegments;

  return `…/${segments[segments.length - 1]}`;
}
```

### 4.3 기존 코드 수정

#### 4.3.1 `inngest/functions/review.ts` — Step 4: Zod 재검증 추가

**Before:**

```typescript
// ── Step 4: AI 리뷰 생성 ──
const { rawReview, structuredOutput } = await step.run("generate-ai-review", async () => {
  const headers = SECTION_HEADERS[langCode];
  const changedFilesSummary = parseDiffToChangedFiles(diff);

  // 구조화 출력 시도
  try {
    const prompt = buildStructuredPrompt({
      title, description, diff, context, langCode, sizeMode, changedFilesSummary, maxSuggestions,
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

  // ... fallback ...
});
```

**After:**

```typescript
// ── Step 4: AI 리뷰 생성 ──
const { rawReview, structuredOutput } = await step.run("generate-ai-review", async () => {
  const headers = SECTION_HEADERS[langCode];
  const changedFilesSummary = parseDiffToChangedFiles(diff);

  // 구조화 출력 시도
  try {
    const prompt = buildStructuredPrompt({
      title, description, diff, context, langCode, sizeMode, changedFilesSummary, maxSuggestions,
    });

    const { experimental_output } = await generateText({
      model: google("gemini-2.5-flash"),
      experimental_output: Output.object({ schema: structuredReviewSchema }),
      prompt,
    });

    if (experimental_output) {
      // SDK 레벨 검증을 신뢰하지 않고 Zod로 재검증 — 비정상 line 값 등 방어
      const parsed = structuredReviewSchema.safeParse(experimental_output);
      if (!parsed.success) {
        console.warn("Structured output re-validation failed:", parsed.error.message);
        // fallback으로 진행
      } else {
        const markdown = formatStructuredReviewToMarkdown(parsed.data, langCode);
        return { rawReview: markdown, structuredOutput: parsed.data };
      }
    }
  } catch (error) {
    console.warn("Structured output failed, falling back to markdown:", error);
  }

  // ... fallback 동일 ...
});
```

#### 4.3.2 `inngest/functions/review.ts` — Step 5: suggestion line 검증 추가

import 추가:

```typescript
// 변경 전
import { parseDiffToChangedFiles, extractDiffFileSet, unescapeGitPath } from "@/module/github/lib/diff-parser";

// 변경 후
import { parseDiffToChangedFiles, extractDiffFileSet, extractDiffAddedLinesMap, unescapeGitPath } from "@/module/github/lib/diff-parser";
```

Step 5의 suggestion 검증 부분 — 기존 파일 경로 검증 직후에 line 검증을 추가:

**Before:**

```typescript
// ── 5. suggestions 경로 해결 ──
if (validatedOutput?.suggestions) {
  validatedOutput = {
    ...validatedOutput,
    suggestions: validatedOutput.suggestions
      .map((s) => resolveEntryFile(s, diffFiles, diffArray, "suggestions"))
      .filter((s): s is NonNullable<typeof s> => s !== null),
  };
}
```

**After:**

```typescript
// ── 5. suggestions 경로 해결 ──
if (validatedOutput?.suggestions) {
  validatedOutput = {
    ...validatedOutput,
    suggestions: validatedOutput.suggestions
      .map((s) => resolveEntryFile(s, diffFiles, diffArray, "suggestions"))
      .filter((s): s is NonNullable<typeof s> => s !== null),
  };
}

// ── 5-1. suggestions line 검증: diff added lines 범위 체크 ──
if (validatedOutput?.suggestions && validatedOutput.suggestions.length > 0) {
  const addedLinesMap = extractDiffAddedLinesMap(diff);
  validatedOutput = {
    ...validatedOutput,
    suggestions: validatedOutput.suggestions.filter((s) => {
      // 타입 가드: line이 유효한 양의 정수인지 확인
      if (typeof s.line !== "number" || !Number.isFinite(s.line) || s.line < 1) {
        console.warn("[suggestions] dropped entry", {
          file: s.file, line: s.line, reason: "invalid_line_type",
        });
        return false;
      }

      const fileAddedLines = addedLinesMap.get(s.file);
      if (!fileAddedLines || fileAddedLines.size === 0) return true; // 삭제 파일 등 예외

      // range-based 검증: before 필드의 라인 수만큼 범위 확장
      const beforeLineCount = s.before.split("\n").length;
      for (let i = 0; i < beforeLineCount; i++) {
        if (fileAddedLines.has(s.line + i)) return true;
      }

      console.warn("[suggestions] dropped entry", {
        file: s.file, line: s.line, reason: "line_not_in_diff_added_lines",
      });
      return false;
    }),
  };
}
```

#### 4.3.3 `module/ai/lib/review-formatter.ts` — 경로 축약 + 방어적 line 처리

**Before:**

```typescript
if (output.suggestions.length > 0) {
  const rows = output.suggestions.map(s => {
    const safeExplanation = s.explanation.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
    return `| ${SEVERITY_EMOJI[s.severity]}\u00A0${s.severity} | \`${s.file}\` | ${s.line} | ${safeExplanation} |`;
  });
  const table = [
    `| Severity | File | Line | Description |`,
    `|----------|------|------|-------------|`,
    ...rows,
  ].join("\n");
  sections.push(`## ${headers.suggestions}\n\n${table}`);
}
```

**After:**

```typescript
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

#### 4.3.4 `module/review/ui/parts/structured-review-body.tsx` — 경로 축약 + 방어적 line 처리

import 추가:

```typescript
// 추가
import { shortenFilePath } from "@/module/ai/lib/review-formatter";
```

suggestion 테이블 생성 부분:

**Before:**

```typescript
if (data.suggestions && data.suggestions.length > 0) {
  const rows = data.suggestions.map((s) => {
    const safeExplanation = s.explanation.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
    return `| ${SEVERITY_EMOJI[s.severity]}\u00A0${s.severity} | \`${s.file}\` | ${s.line} | ${safeExplanation} |`;
  });
  const table = [
    `| Severity | File | Line | Description |`,
    `|----------|------|------|-------------|`,
    ...rows,
  ].join("\n");
  sections.push(`## ${headers.suggestions}\n\n${table}`);
}
```

**After:**

```typescript
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

#### 4.3.5 `module/ai/lib/review-prompt.ts` — Severity 분류 가이드 강화 + Line 지침 강화

**Line 지침 강화 (Line 122 근처):**

기존의 `line: must be a valid added line number from that file` 지침을 더 구체적으로 확장한다.

**Before (Line 122):**

```typescript
  - line: must be a valid added line number from that file
```

**After (Line 122):**

```typescript
  - line: MUST be one of the added line numbers listed in the "Changed Files" section above. Do NOT guess or infer line numbers. If you cannot identify the exact added line number, do NOT generate the suggestion.
```

**Severity 분류 가이드 강화:**

프롬프트에 severity 정의가 **2곳** 존재한다:
- **Line 126** (suggestions 컨텍스트): `severity: CRITICAL for bugs/security, WARNING for potential issues, SUGGESTION for improvements, INFO for style/convention`
- **Line 148** (issues 컨텍스트): `severity: CRITICAL for blocking, WARNING for important, SUGGESTION for improvements, INFO for observations`

두 곳 모두 동일한 확장 가이드로 교체하여 suggestions와 issues에 일관된 severity 기준을 적용한다.

**Before (Line 126, suggestions 컨텍스트):**

```typescript
  - severity: CRITICAL for bugs/security, WARNING for potential issues, SUGGESTION for improvements, INFO for style/convention
```

**Before (Line 148, issues 컨텍스트):**

```typescript
- severity: CRITICAL for blocking, WARNING for important, SUGGESTION for improvements, INFO for observations
```

**After (Line 126, suggestions 컨텍스트):**

```typescript
  - Severity classification (apply strictly):
    - CRITICAL: Bugs that break functionality, security vulnerabilities, data loss risks.
      Examples: SQL injection, null pointer crash in production path, race condition causing data corruption.
      NOT CRITICAL: missing loading state, suboptimal variable naming, missing aria-label.
    - WARNING: Issues that could cause incorrect behavior under specific conditions.
      Examples: unhandled edge case affecting user data, missing null check on external input, potential memory leak under load.
      NOT WARNING: code style preferences, minor UX polish items, accessibility enhancements, variable renaming.
    - SUGGESTION: Code improvements that enhance quality, readability, or maintainability.
      Examples: extracting duplicate logic, better variable naming, adding error handling, improving accessibility.
    - INFO: Style/convention observations with no functional impact.
      Examples: inconsistent naming convention, unused import, formatting preference.
    - When uncertain between two severity levels, ALWAYS choose the lower one.
    - Expected distribution: most suggestions should be SUGGESTION or INFO. Use CRITICAL at most once per review. Use WARNING at most twice per review.
```

**After (Line 148, issues 컨텍스트):**

```typescript
- severity: CRITICAL (bugs/security only), WARNING (behavior-affecting under conditions), SUGGESTION (improvements), INFO (style/convention). When uncertain, choose the lower level.
```

---

## 5. 실행 순서

### Phase 1: diff-parser 확장 + review.ts line 검증 (문제 1, 4)

- **작업 내용**:
  1. `module/github/lib/diff-parser.ts`에 `extractDiffAddedLinesMap()` 함수 추가
  2. `inngest/functions/review.ts` Step 4에 Zod `safeParse` 재검증 추가
  3. `inngest/functions/review.ts` Step 5에 suggestion line 검증 로직 추가 (타입 가드 + range-based added line 체크)
- **검증**:
  - `npm run build` 성공
  - 수동 테스트: 잘못된 line 번호가 포함된 structured output을 시뮬레이션하여 drop 로직 확인
  - 기존 suggestion 게시 flow에 영향 없음 확인

### Phase 2: 파일 경로 축약 (문제 2)

- **작업 내용**:
  1. `module/ai/lib/review-formatter.ts`에 `shortenFilePath()` 함수 추가 및 export
  2. `review-formatter.ts`의 suggestion 테이블 row 생성에 `shortenFilePath()` 적용
  3. `module/review/ui/parts/structured-review-body.tsx`에서 `shortenFilePath` import 및 적용
  4. 양쪽 파일에 방어적 line 렌더링(`safeLine`) 적용
- **검증**:
  - `npm run build` 성공
  - 45자 초과 경로가 `…/` 접두사로 축약되는지 확인 (예: `ai-podcast-clipper-frontend/src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx` → `…/_component/UploadedFileCard.tsx`)
  - 45자 이하 경로가 그대로 표시되는지 확인
  - 프론트엔드에서 테이블 컬럼 균형이 개선되는지 시각적 확인

### Phase 3: 프롬프트 강화 (문제 3 + line 할루시네이션 감소)

- **작업 내용**:
  1. `module/ai/lib/review-prompt.ts`의 severity 가이드를 구체적 예시/반례 포함 형태로 확장
  2. `module/ai/lib/review-prompt.ts`의 line 지침을 강화하여 AI가 added line 목록에서만 line을 선택하도록 명시적으로 지시
- **검증**:
  - `npm run build` 성공
  - 테스트 PR에 대해 리뷰를 생성하여 severity 분포가 개선되는지 확인
  - CRITICAL/WARNING 빈도가 이전 대비 감소하고, style/naming 이슈가 SUGGESTION/INFO로 분류되는지 확인
  - suggestion의 line 번호가 diff의 added lines 범위 내에 있는지 확인 (Phase 1 검증에서 drop 빈도 감소 기대)

---

## 6. 영향 범위

### 직접 수정 대상

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `module/github/lib/diff-parser.ts` | 함수 추가 | `extractDiffAddedLinesMap()` 신규 |
| `inngest/functions/review.ts` | 로직 추가 | Step 4 safeParse, Step 5 line 검증 |
| `module/ai/lib/review-formatter.ts` | 함수 추가 + 수정 | `shortenFilePath()` 신규, suggestion 테이블 렌더링 변경 |
| `module/ai/lib/review-prompt.ts` | 텍스트 수정 | severity 가이드 확장 |
| `module/review/ui/parts/structured-review-body.tsx` | 수정 | `shortenFilePath` import, suggestion 테이블 렌더링 변경 |

### import 변경

- `inngest/functions/review.ts`: `extractDiffAddedLinesMap` import 추가
- `module/review/ui/parts/structured-review-body.tsx`: `shortenFilePath` import 추가

### 외부 의존성

- 변경 없음. 기존 `parse-diff`, `zod`, `ai` 패키지만 사용

### 하위 호환성

- `extractDiffFileSet()`은 유지됨 — 기존 호출부에 영향 없음
- suggestion 테이블의 마크다운 구조(`| ... |` 형식)는 변경되지 않음
- GitHub API 호출 로직(`pr-review.ts`)은 변경되지 않음
- DB 스키마 변경 없음

---

## 7. 리스크 + 롤백 전략

### 리스크

| 리스크 | 가능성 | 영향도 | 대응 |
|--------|--------|--------|------|
| line 검증이 너무 엄격하여 유효한 suggestion이 과도하게 drop됨 | 중 | 중 | range-based 검증(Option B)으로 완화. console.warn 로그로 drop 빈도 모니터링 |
| Zod safeParse가 SDK와 미묘하게 다른 검증 결과를 반환하여 정상 출력도 fallback으로 전환됨 | 저 | 중 | safeParse 실패 시 로그에 error.message 기록. 빈도가 높으면 safeParse를 제거하고 SDK 검증에 위임 |
| severity 프롬프트 강화가 AI 출력 품질에 역효과 (다른 필드의 품질 저하) | 저 | 저 | 프롬프트 변경은 severity 섹션에만 한정. 다른 지시사항은 변경하지 않음 |
| `shortenFilePath()`의 `…/` 접두사가 GitHub 마크다운에서 비정상 렌더링 | 저 | 저 | GitHub Flavored Markdown에서 `…` (U+2026)은 정상 렌더링됨. 문제 발생 시 `...`로 대체 |

### 롤백 전략

모든 변경은 기존 로직의 **추가/확장**이며, 기존 코드를 삭제하지 않는다:

- **Phase 1 롤백**: `extractDiffAddedLinesMap` 호출과 line 검증 블록을 제거하면 원래 동작으로 복귀. safeParse 블록을 제거하면 기존 SDK 검증만 사용
- **Phase 2 롤백**: `shortenFilePath()` 호출을 `s.file`로 대체, `safeLine`을 `s.line`으로 대체
- **Phase 3 롤백**: severity 가이드 텍스트를 이전 1줄 버전으로 되돌림

---

## 8. 검증 전략

### 기존 테스트

- `npm run build` — TypeScript 컴파일 + Next.js 빌드 성공 확인
- `npm run lint` — ESLint 규칙 준수 확인

### 자동 테스트 (테스트 프레임워크 도입 시 우선 대상)

현재 프로젝트에 테스트 프레임워크가 없어 이번 scope에서는 수동 검증만 수행한다. 향후 vitest 등 도입 시 아래 순수 함수를 우선 테스트 대상으로 한다:

- **`extractDiffAddedLinesMap()`**: 빈 diff, 정상 파일, rename 파일, addedLines 빈 배열 케이스
- **`shortenFilePath()`**: 45자 이하(통과), 2 세그먼트 축약, 1 세그먼트 fallback, 빈 문자열, 슬래시 없는 경로

### 추가 검증 (수동)

#### Phase 1 검증

1. **정상 케이스**: diff에 `src/app.ts` 파일의 added lines `[5, 6, 7, 10, 11]`이 있을 때, `line: 6`인 suggestion이 통과하는지 확인
2. **multi-line 케이스**: `line: 4`, `before`가 3줄(lines 4-6)인 suggestion에서, line 5가 addedLines에 있으면 통과하는지 확인
3. **drop 케이스**: `line: 2`이고 addedLines에 2가 없으면 drop되고 console.warn이 출력되는지 확인
4. **Zod 재검증**: `experimental_output`의 `line`에 배열이나 문자열이 들어왔을 때 safeParse가 실패하고 markdown fallback으로 전환되는지 확인

#### Phase 2 검증

1. **축약 확인**: 89자 경로 `ai-podcast-clipper-frontend/src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx`가 `…/_component/UploadedFileCard.tsx`로 축약되는지 확인
2. **비축약 확인**: 30자 경로 `src/hooks/useProduct.ts`가 그대로 표시되는지 확인
3. **2 세그먼트도 긴 경우**: 축약 후에도 45자 초과면 `…/filename.tsx`로 표시되는지 확인
4. **GitHub 렌더링**: GitHub PR 코멘트에서 `…/` 접두사가 정상 표시되는지 확인
5. **프론트엔드 렌더링**: 대시보드 리뷰 상세 페이지에서 테이블 컬럼 균형이 개선되는지 시각적 확인

#### Phase 3 검증

1. **테스트 PR 리뷰**: 실제 PR에 대해 리뷰를 생성하여 severity 분포 확인
2. **기대 결과**: style/naming/accessibility 관련 suggestion이 SUGGESTION 또는 INFO로 분류됨
3. **비교**: 프롬프트 변경 전/후의 severity 분포를 비교하여 WARNING/CRITICAL 빈도 감소 확인
