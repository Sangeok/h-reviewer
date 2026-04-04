# AI 모듈 리팩토링 명세

## 개요

`module/ai/` 모듈을 7가지 코드 품질 기준으로 분석하여 9건의 리팩토링 대상을 식별했다.

**분석 기준**: typescript-clean-code, frontend-predictability, frontend-cohesion, naming-conventions, frontend-readability, frontend-coupling, frontend-file-naming

**file-naming 검증 결과**: 모든 파일명 kebab-case 준수 — **위반 없음**.

---

## 이슈 목록

| # | 이슈 | 심각도 | 컨벤션 근거 | 핵심 파일 |
|---|------|--------|------------|----------|
| 1 | Barrel Export 누락 — deep import | HIGH | coupling | `index.ts`, `lib/index.ts` |
| 2 | 액션 반환 타입 불일치 | HIGH | predictability 원칙 3 | `actions/generate-pr-summary.ts` |
| 3 | SuggestionSeverity Zod 미파생 | HIGH | clean-code VAR-09 | `types/suggestion.ts`, `lib/review-schema.ts` |
| 4 | Emoji 상수 약한 타이핑 | MEDIUM | clean-code VAR-09 | `constants/review-emoji.ts` |
| 5 | 함수가 constants 파일에 위치 | MEDIUM | predictability | `constants/index.ts` |
| 6 | 모듈 내 절대경로 import | MEDIUM | cohesion | `lib/review-formatter.ts`, `types/suggestion.ts` |
| 7 | utils/ 배럴 파일 누락 | MEDIUM | cohesion | `utils/` |
| 8 | 프로덕션 console.log | LOW | readability | `lib/index-codebase.ts` |
| 9 | Emoji 크로스 모듈 결합 | LOW | coupling | `constants/review-emoji.ts` |

---

## Phase 1: 핵심 타입 안전성 (HIGH)

### 이슈 1: Barrel Export 누락

**현황**: `inngest/functions/review.ts`가 배럴을 우회하여 6개 deep import.

```typescript
// inngest/functions/review.ts — 현재 (deep import)
import { classifyPRSize, getTopKForSizeMode } from "@/module/ai/lib/review-size-policy";
import { structuredReviewSchema } from "@/module/ai/lib/review-schema";
import { buildStructuredPrompt, buildFallbackPrompt, getIssueLimit } from "@/module/ai/lib/review-prompt";
import { formatStructuredReviewToMarkdown } from "@/module/ai/lib/review-formatter";
import type { ReviewSizeMode } from "@/module/ai/lib/review-size-policy";
```

`module/github/lib/pr-review.ts`도 deep import:

```typescript
import type { CodeSuggestion, StructuredIssue } from "@/module/ai/types/suggestion";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/module/ai/constants/review-emoji";
```

**위반**: 모듈 Public API 경계가 무의미. 내부 구조 변경 시 외부 소비자가 깨진다.

**제안**:

```typescript
// module/ai/lib/index.ts — 추가
export { structuredReviewSchema } from "./review-schema";
export type { StructuredReviewOutput } from "./review-schema";
export { buildStructuredPrompt, buildFallbackPrompt, getSuggestionLimit, getIssueLimit } from "./review-prompt";
export { formatStructuredReviewToMarkdown } from "./review-formatter";
```

```typescript
// module/ai/index.ts — 추가
export {
  structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt,
  getSuggestionLimit, getIssueLimit, formatStructuredReviewToMarkdown,
} from "./lib";
export type { StructuredReviewOutput } from "./lib";
export { CATEGORY_EMOJI, SEVERITY_EMOJI } from "./constants/review-emoji";
export type { CodeSuggestion, StructuredIssue, SuggestionSeverity, IssueCategory } from "./types";
```

```typescript
// inngest/functions/review.ts — 변경 후
import {
  retrieveContext, classifyPRSize, getTopKForSizeMode,
  structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt,
  getIssueLimit, formatStructuredReviewToMarkdown,
} from "@/module/ai";
import type { ReviewSizeMode } from "@/module/ai";
```

```typescript
// module/github/lib/pr-review.ts — 변경 후
import type { CodeSuggestion, StructuredIssue } from "@/module/ai";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/module/ai";
```

**영향 파일**: `module/ai/lib/index.ts`, `module/ai/index.ts`, `inngest/functions/review.ts`, `module/github/lib/pr-review.ts`

---

### 이슈 2: 액션 반환 타입 불일치

**현황**: 동일 레이어(actions)의 두 함수가 서로 다른 반환 형태를 사용.

| 액션 | 반환 타입 | 형태 |
|------|----------|------|
| `reviewPullRequest` | `ReviewPullRequestResult` | discriminated union (reason 필드) |
| `generatePRSummary` | `{ success: boolean, message: string }` | 미명명 인라인 |

**위반**: `frontend-predictability` 원칙 3 — 같은 레이어의 반환 타입 통일

**제안**:

```typescript
// types/index.ts — 추가
export type GeneratePRSummaryResult =
  | { success: true; message: "Summary Queued" }
  | { success: false; message: string; reason: "internal_error" };
```

```typescript
// actions/generate-pr-summary.ts — 반환 타입 명시
export async function generatePRSummary(
  owner: string, repo: string, prNumber: number
): Promise<GeneratePRSummaryResult> {
  // success:
  return { success: true, message: "Summary Queued" };
  // catch:
  return { success: false, message: "Error Queueing Summary", reason: "internal_error" };
}
```

**영향 파일**: `types/index.ts`, `actions/generate-pr-summary.ts`, `module/ai/index.ts`

---

### 이슈 3: SuggestionSeverity Zod 미파생

**현황**: `types/suggestion.ts`에서 수동 정의. MAINTENANCE NOTE가 5곳 동기화 위험을 경고.

```typescript
// types/suggestion.ts — 현재
export type SuggestionSeverity = "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO"; // 수동
export type IssueCategory = z.infer<typeof issueCategorySchema>;                 // Zod 파생 ✓
```

**위반**: `typescript-clean-code` VAR-09 — `IssueCategory`와 불일치. Zod schema가 단일 소스여야 함.

**제안**:

```typescript
// lib/review-schema.ts — severitySchema export 추가
export const severitySchema = z.enum(["CRITICAL", "WARNING", "SUGGESTION", "INFO"]);

// codeSuggestionSchema, structuredReviewSchema 내부의 인라인 z.enum을 severitySchema 참조로 교체
severity: severitySchema,
```

```typescript
// types/suggestion.ts — Zod 파생으로 변경
import { issueCategorySchema, severitySchema } from "../lib/review-schema";

export type SuggestionSeverity = z.infer<typeof severitySchema>;
```

동기화 위치가 5곳 → 3곳(Prisma enum, Zod source, SEVERITY_CONFIG 키)으로 감소.

**영향 파일**: `lib/review-schema.ts`, `types/suggestion.ts`, `lib/index.ts`

---

## Phase 2: 구조 일관성 (MEDIUM)

### 이슈 4: Emoji 상수 약한 타이핑

**현황**:

```typescript
// constants/review-emoji.ts
export const CATEGORY_EMOJI: Record<string, string> = { bug: "🐛", ... };
export const SEVERITY_EMOJI: Record<string, string> = { CRITICAL: "🚨", ... };
```

**위반**: `Record<string, string>`이 임의 키를 허용. 유효하지 않은 키 접근을 타입이 잡지 못함.

**제안** (이슈 3 선행 필수):

```typescript
import type { IssueCategory, SuggestionSeverity } from "../types/suggestion";

export const CATEGORY_EMOJI: Record<IssueCategory, string> = {
  bug: "🐛", design: "🔀", security: "🛡️",
  performance: "⚡", testing: "🧪", general: "📋",
} as const;

export const SEVERITY_EMOJI: Record<SuggestionSeverity, string> = {
  CRITICAL: "🚨", WARNING: "⚠️", SUGGESTION: "💡", INFO: "ℹ️",
} as const;
```

**영향 파일**: `constants/review-emoji.ts`

---

### 이슈 5: 함수가 constants 파일에 위치

**현황**: `constants/index.ts`에 `buildPRUrl()` 함수가 상수와 함께 정의.

**위반**: constants 파일에 함수가 있으면 모듈 역할 예측이 어려움.

**제안**:

1. `utils/build-pr-url.ts` 신규 파일로 함수 이동
2. `constants/index.ts`에서 함수 제거
3. `utils/index.ts`(이슈 7)에서 re-export
4. `module/ai/index.ts`의 export 경로를 `"./utils"`로 변경
5. `actions/review-pull-request.ts`의 import를 `"../utils"` 또는 `"../utils/build-pr-url"`로 변경

**영향 파일**: `constants/index.ts`, `utils/build-pr-url.ts`(신규), `actions/review-pull-request.ts`, `module/ai/index.ts`

---

### 이슈 6: 모듈 내 절대경로 import

**현황**: 2개 파일이 모듈 내부에 절대경로 사용. 나머지 lib 파일은 모두 상대경로.

```typescript
// lib/review-formatter.ts:4 — 절대경로
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/module/ai/constants/review-emoji";

// types/suggestion.ts:2 — 절대경로
import { issueCategorySchema } from "@/module/ai/lib/review-schema";
```

**제안**:

```typescript
// lib/review-formatter.ts — 상대경로로 변경
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "../constants/review-emoji";

// types/suggestion.ts — 상대경로로 변경 (이슈 3 적용 시 함께)
import { issueCategorySchema, severitySchema } from "../lib/review-schema";
```

**영향 파일**: `lib/review-formatter.ts`, `types/suggestion.ts`

---

### 이슈 7: utils/ 배럴 파일 누락

**현황**: `actions/`, `constants/`, `lib/`, `types/` 모두 `index.ts`가 있으나 `utils/`만 없음.

**제안**:

```typescript
// utils/index.ts — 신규 생성
export { parseCommand } from "./command-parser";
export { stripFencedCodeBlocks } from "./text-sanitizer";
export { buildPRUrl } from "./build-pr-url"; // 이슈 5에서 이동
```

```typescript
// module/ai/index.ts — 변경 후
export { parseCommand, stripFencedCodeBlocks, buildPRUrl } from "./utils";
```

**영향 파일**: `utils/index.ts`(신규), `module/ai/index.ts`

---

## Phase 3: 코드 품질 (LOW)

### 이슈 8: 프로덕션 console.log

**현황**: `lib/index-codebase.ts:39` — `console.log("indexing complete")`

**제안**: 삭제.

**영향 파일**: `lib/index-codebase.ts`

---

### 이슈 9: Emoji 크로스 모듈 결합

**현황**: `CATEGORY_EMOJI`/`SEVERITY_EMOJI`가 `module/ai`와 `module/github` 양쪽에서 소비.

**결론**: 현재 소비자 2개 모듈. 이슈 1 배럴 정비로 import 경로 안정성 확보. 3개 이상 모듈 사용 시 `@/shared/constants`로 이동 재검토. **현시점 추가 작업 없음.**

---

## 실행 순서

```
Phase 1 (HIGH)
  ├── 이슈 3: severitySchema export + SuggestionSeverity Zod 파생
  ├── 이슈 2: GeneratePRSummaryResult 타입 추가 + 반환 타입 명시
  └── 이슈 1: 배럴 체인 정비 + 소비자 import 경로 전환

Phase 2 (MEDIUM)
  ├── 이슈 7: utils/index.ts 생성
  ├── 이슈 5: buildPRUrl → utils/ 이동
  ├── 이슈 6: 절대경로 → 상대경로 (이슈 3과 병합 가능)
  └── 이슈 4: Emoji 상수 타입 강화 (이슈 3 선행 필수)

Phase 3 (LOW)
  ├── 이슈 8: console.log 제거
  └── 이슈 9: 추가 작업 없음
```

### 의존 관계

| 이슈 | 선행 조건 |
|------|----------|
| 이슈 1 | 이슈 3 (severity 타입도 배럴에 추가) |
| 이슈 4 | 이슈 3 (`Record<SuggestionSeverity, string>` 사용) |
| 이슈 5 | 이슈 7 (utils/index.ts 배럴 경로) |

---

## 검증

1. `npx tsc --noEmit` — 타입 에러 0건
2. deep import 검증: `@/module/ai/lib/`, `@/module/ai/types/`, `@/module/ai/constants/review-emoji` grep — docs/ 외 0건
3. `npm run build` — 빌드 성공
4. PR 리뷰 생성 E2E 흐름 (inngest → GitHub 포스팅) 정상 동작 확인

## 주의사항

- **이슈 1**: `inngest/functions/review.ts`는 프로덕션 핵심 경로. import 경로만 변경이므로 런타임 영향 없으나 E2E 검증 필수.
- **이슈 3**: `prisma/schema.prisma`의 `enum SuggestionSeverity`는 Zod에서 파생 불가. MAINTENANCE NOTE를 5곳→3곳으로 줄이는 것이 현실적 한계.
- **이슈 5**: `actions/review-pull-request.ts`가 `"../constants"`에서 `buildPRUrl`을 import. 이동 후 `"../utils/build-pr-url"` 또는 `"../utils"`로 변경 필요.
