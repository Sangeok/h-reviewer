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
// constants/index.ts — 하단에 추가 (배럴 체인 필수 — 이 단계 누락 시 빌드 실패)
export { CATEGORY_EMOJI, SEVERITY_EMOJI } from "./review-emoji";
```

```typescript
// module/ai/lib/index.ts — 추가
export { structuredReviewSchema } from "./review-schema";
export { buildStructuredPrompt, buildFallbackPrompt, getIssueLimit } from "./review-prompt";
export { formatStructuredReviewToMarkdown } from "./review-formatter";
```

> `getSuggestionLimit`은 `review-prompt.ts` 내부(`buildStructuredPrompt`)에서만 호출되며 외부 소비자가 없으므로 barrel에 노출하지 않는다.
> `StructuredReviewOutput`도 `review-formatter.ts`에서만 내부 import하며 외부 소비자가 없으므로 barrel에 노출하지 않는다.

```typescript
// module/ai/types/index.ts — 추가 (suggestion.ts 타입을 배럴로 노출)
export type { CodeSuggestion, StructuredIssue, SuggestionSeverity, IssueCategory } from "./suggestion";
```

```typescript
// module/ai/index.ts — 추가 (기존 export 유지, 아래 내용을 append)
export {
  structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt,
  getIssueLimit, formatStructuredReviewToMarkdown,
} from "./lib";
export { CATEGORY_EMOJI, SEVERITY_EMOJI } from "./constants";
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
// ⚠️ 기존 deep import 6줄(review-size-policy, review-schema, review-prompt, review-formatter)을 삭제하고 위 2줄로 교체
```

```typescript
// module/github/lib/pr-review.ts — 변경 후
import type { CodeSuggestion, StructuredIssue } from "@/module/ai";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/module/ai";
```

**영향 파일**: `module/ai/constants/index.ts`, `module/ai/types/index.ts`, `module/ai/lib/index.ts`, `module/ai/index.ts`, `inngest/functions/review.ts`, `module/github/lib/pr-review.ts`

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
// actions/generate-pr-summary.ts — import 추가 + 반환 타입 명시
import { type GeneratePRSummaryResult } from "../types";

export async function generatePRSummary(
  owner: string, repo: string, prNumber: number
): Promise<GeneratePRSummaryResult> {
  // success:
  return { success: true, message: "Summary Queued" };
  // catch:
  return { success: false, message: "Error Queueing Summary", reason: "internal_error" };
}
```

> ⚠️ 현재 에러 반환에 `reason` 필드가 없으므로 런타임 shape이 변경된다.
> 소비자(`app/api/webhooks/github/route.ts`)는 `summaryResult.reason`을 읽지 않으므로 즉시 에러는 없으나,
> `reviewPullRequest`와 달리 `reason` 기반 분기 처리가 없는 비대칭이 남는다.
> 현시점에서는 소비자 수정 불필요하나, 향후 `plan_restricted` 등 reason을 추가할 때 webhook route 업데이트 필요.

```typescript
// module/ai/index.ts — Types 섹션 변경
export type { EmbeddingTaskType, PRCommand, ReviewPullRequestResult, GeneratePRSummaryResult } from "./types";
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
// lib/review-schema.ts — severitySchema export 추가 (codeSuggestionSchema 위에 배치)
export const severitySchema = z.enum(["CRITICAL", "WARNING", "SUGGESTION", "INFO"]);

// codeSuggestionSchema 내부 (severity 필드) — severitySchema 참조로 교체
severity: severitySchema,

// structuredReviewSchema.issues 내부 (severity 필드) — severitySchema 참조로 교체
severity: severitySchema,
```

> ⚠️ `severitySchema` 삽입으로 이후 라인 번호가 ~2줄 밀린다. 교체 대상은 라인 번호가 아닌 **스키마 이름**(`codeSuggestionSchema` 내부, `structuredReviewSchema.issues` 내부)으로 찾을 것.

```typescript
// types/suggestion.ts — Zod 파생으로 변경
import { issueCategorySchema, severitySchema } from "../lib/review-schema";

export type SuggestionSeverity = z.infer<typeof severitySchema>;
```

```typescript
// lib/review-schema.ts — MAINTENANCE NOTE 갱신 (기존 NOTE 교체)
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
```

동기화 위치가 5곳 → 3곳(Prisma enum, Zod source, SEVERITY_CONFIG 키)으로 감소.

**영향 파일**: `lib/review-schema.ts`, `types/suggestion.ts`

> `lib/index.ts`는 변경 불필요 — `severitySchema`는 `types/suggestion.ts`에서 직접 경로(`../lib/review-schema`)로 import하므로 `lib/index.ts` barrel에 추가하지 않는다.

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
};

export const SEVERITY_EMOJI: Record<SuggestionSeverity, string> = {
  CRITICAL: "🚨", WARNING: "⚠️", SUGGESTION: "💡", INFO: "ℹ️",
};
```

> `as const`는 명시적 `Record<X, string>` 타입 어노테이션이 있으면 리터럴 추론이 무시되어 효과가 없다. 타입 어노테이션만으로 충분.

> 타입 강화 후 소비자의 `?? ""` / `?? "📋"` fallback 연산자 4곳이 dead code가 된다. 프로젝트에 `noUncheckedIndexedAccess`가 미설정이므로 `Record<K, string>` 접근은 항상 `string` 반환. **fallback을 제거하여 dead code를 정리한다.**

```typescript
// review-formatter.ts:34 — 변경
const sev = `${SEVERITY_EMOJI[i.severity]} **${i.severity}**`;       // ?? "" 제거
// review-formatter.ts:35 — 변경
const cat = `${CATEGORY_EMOJI[i.category]} ${i.category}`;           // ?? "📋" 제거

// pr-review.ts:104 (formatSuggestionComment 내부) — 변경
return `${SEVERITY_EMOJI[suggestion.severity]} **${suggestion.severity}**: ${suggestion.explanation}
// pr-review.ts:112 (formatIssueComment 내부) — 변경
return `${CATEGORY_EMOJI[issue.category]} ${SEVERITY_EMOJI[issue.severity]} **${issue.severity}** | ${issue.category}\n\n${issue.description}`;
```

**영향 파일**: `constants/review-emoji.ts`, `lib/review-formatter.ts`, `module/github/lib/pr-review.ts`

---

### 이슈 5: 함수가 constants 파일에 위치

**현황**: `constants/index.ts`에 `buildPRUrl()` 함수가 상수와 함께 정의.

**위반**: constants 파일에 함수가 있으면 모듈 역할 예측이 어려움.

**제안**:

1. `utils/build-pr-url.ts` 신규 파일로 함수 이동
2. `constants/index.ts`에서 함수 제거
3. `utils/index.ts`(이슈 7)에서 re-export
4. `module/ai/index.ts` 수정 — Constants에서 `buildPRUrl` 제거 + Utils 섹션 교체:

```typescript
// module/ai/index.ts — Constants 섹션 (buildPRUrl 제거)
export {
  DEFAULT_TOP_K, EMBEDDING_CONTENT_MAX_LENGTH, EMBEDDING_MODEL_ID,
  EMBEDDING_OUTPUT_DIMENSION, GITHUB_PROVIDER_ID, PINECONE_BATCH_SIZE,
} from "./constants";

// module/ai/index.ts — Utils 섹션 (기존 2줄 삭제 후 1줄로 교체)
// ❌ 삭제:
//   export { parseCommand } from "./utils/command-parser";
//   export { stripFencedCodeBlocks } from "./utils/text-sanitizer";
// ✅ 교체:
export { parseCommand, stripFencedCodeBlocks, buildPRUrl } from "./utils";
```

> ⚠️ 기존 Utils 섹션의 직접 파일 import 2줄을 **삭제하고** barrel 경유 1줄로 **교체**해야 한다. 단순 추가 시 중복 export 에러.

5. `actions/review-pull-request.ts`의 import를 `"../utils"` 또는 `"../utils/build-pr-url"`로 변경

**영향 파일** (5개 — 원자적 수정 필수):

| # | 파일 | 변경 내용 |
|---|------|----------|
| 1 | `utils/build-pr-url.ts` | 신규 생성 (함수 이동) |
| 2 | `utils/index.ts` | 신규 생성 — 이슈 7 참조 |
| 3 | `constants/index.ts` | `buildPRUrl` 함수 정의 제거 |
| 4 | `module/ai/index.ts` | Constants에서 `buildPRUrl` 제거 + Utils 섹션 2줄 삭제 → 1줄 교체 |
| 5 | `actions/review-pull-request.ts` | import 경로 `"../constants"` → `"../utils"` |

> ⚠️ 5개 파일을 **반드시 하나의 커밋**으로 작성할 것. 부분 적용 시 컴파일 에러.

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
```

> `types/suggestion.ts`는 이슈 3(Phase 1)에서 import를 `import { issueCategorySchema, severitySchema } from "../lib/review-schema"`로 변경하므로, 이슈 6 시점에서 이미 상대경로로 전환 완료. 추가 작업 불필요.

**영향 파일**: `lib/review-formatter.ts`

---

### 이슈 7: utils/ 배럴 파일 누락

**현황**: `actions/`, `constants/`, `lib/`, `types/` 모두 `index.ts`가 있으나 `utils/`만 없음.

> ⚠️ 이슈 5(buildPRUrl 이동)와 **반드시 같은 커밋으로 원자적 구현** 필수.
> 이슈 7만 먼저 구현하면 `build-pr-url.ts`가 없어 컴파일 에러. 이슈 5만 먼저 구현하면 barrel이 없어 `module/ai/index.ts`의 `from "./utils"` 경로가 실패.

**제안**:

```typescript
// utils/index.ts — 신규 생성
export { parseCommand } from "./command-parser";
export { stripFencedCodeBlocks } from "./text-sanitizer";
export { buildPRUrl } from "./build-pr-url"; // 이슈 5에서 이동
```

`module/ai/index.ts`의 Utils 섹션 교체는 이슈 5에서 기술.

**영향 파일**: `utils/index.ts`(신규)

---

## Phase 3: 코드 품질 (LOW)

### 이슈 8: 프로덕션 console.log

**현황**: `lib/index-codebase.ts:39` — `console.log("indexing complete")`

**제안**: line 39의 `console.log("indexing complete")` 삭제. line 30의 `console.error(...)` 는 에러 로깅이므로 **유지**.

**영향 파일**: `lib/index-codebase.ts`

---

### 이슈 9: Emoji 크로스 모듈 결합

**현황**: `CATEGORY_EMOJI`/`SEVERITY_EMOJI`가 `module/ai`와 `module/github` 양쪽에서 소비.

**결론**: 현재 소비자 2개 모듈. 이슈 1 배럴 정비로 import 경로 안정성 확보. 3개 이상 모듈 사용 시 `@/shared/constants`로 이동 재검토. **현시점 추가 작업 없음.**

> 참고: `buildPRUrl`과 동일한 URL 구성 로직이 `inngest/functions/review.ts:210`과 `inngest/functions/summary.ts:104`에 인라인으로 중복되어 있다. 이 명세의 `module/ai/` 범위 밖이므로 다루지 않으나, 향후 `buildPRUrl`을 `@/shared/utils`로 승격할 때 함께 정리할 후보.

---

## 실행 순서

```
Phase 1 (HIGH)
  ├── 이슈 3: severitySchema export + SuggestionSeverity Zod 파생
  ├── 이슈 2: GeneratePRSummaryResult 타입 추가 + 반환 타입 명시
  └── 이슈 1: 배럴 체인 정비 + 소비자 import 경로 전환

Phase 2 (MEDIUM)
  ├── 이슈 5+7: buildPRUrl → utils/ 이동 + utils/index.ts 생성 (원자적 구현)
  ├── 이슈 6: 절대경로 → 상대경로 (review-formatter.ts만 — suggestion.ts는 이슈 3에서 완료)
  └── 이슈 4: Emoji 상수 타입 강화 (이슈 3 선행 필수)

Phase 3 (LOW)
  ├── 이슈 8: console.log 제거
  └── 이슈 9: 추가 작업 없음
```

### 의존 관계

| 이슈 | 선행 조건 | 비고 |
|------|----------|------|
| 이슈 1 | 이슈 3 (severity 타입도 배럴에 추가) | `constants/index.ts` re-export 추가 필수 |
| 이슈 4 | 이슈 3 (`Record<SuggestionSeverity, string>` 사용) | dead code fallback 제거 포함 (review-formatter.ts, pr-review.ts) |
| 이슈 5 ⇄ 이슈 7 | 상호 의존 — 원자적 구현 필수 | 이슈 5와 7을 같은 커밋으로 |
| 이슈 6 | 이슈 3 (suggestion.ts 변경이 이슈 3에서 완료) | 이슈 6은 review-formatter.ts만 |

---

## 검증

1. `npx tsc --noEmit` — 타입 에러 0건
2. deep import 검증: `@/module/ai/lib/`, `@/module/ai/types/`, `@/module/ai/constants/review-emoji` grep — docs/ 외 0건
3. `npm run build` — 빌드 성공
4. PR 리뷰 생성 E2E 흐름 (inngest → GitHub 포스팅) 정상 동작 확인

## 주의사항

- **이슈 1**: `inngest/functions/review.ts`는 프로덕션 핵심 경로. import 경로만 변경이므로 런타임 영향 없으나 E2E 검증 필수.
- **이슈 1**: `module/ai/index.ts`, `lib/index.ts`, `types/index.ts`의 코드 블록은 모두 **"추가"** 내용이다. 기존 export(`getSectionPolicy`, `PRSizeInfo`, `generateEmbedding`, `getRepositoryWithToken`, `indexCodebase`, `retrieveContext`, `parseCommand`, `stripFencedCodeBlocks` 등)를 삭제하면 안 된다.
- **이슈 3**: `prisma/schema.prisma`의 `enum SuggestionSeverity`는 Zod에서 파생 불가. MAINTENANCE NOTE를 5곳→3곳으로 줄이는 것이 현실적 한계.
- **이슈 3**: `review-schema.ts`에서 `severitySchema`를 교체해야 할 인라인 `z.enum`이 **2곳**이다. `codeSuggestionSchema` 내부와 `structuredReviewSchema.issues` 내부 모두 교체할 것. `severitySchema` 삽입으로 라인 번호가 밀리므로 **스키마 이름**으로 위치를 찾을 것.
- **이슈 3**: MAINTENANCE NOTE(`review-schema.ts` 상단 주석)도 함께 갱신할 것 — 동기화 지점 5곳→3곳 반영.

```typescript
// review-schema.ts — severitySchema 정의 (최상단, codeSuggestionSchema 위)
export const severitySchema = z.enum(["CRITICAL", "WARNING", "SUGGESTION", "INFO"]);

// codeSuggestionSchema 내부 — 교체 (스키마 이름으로 찾을 것)
severity: severitySchema,  // z.enum([...]) 대신

// structuredReviewSchema.issues 내부 — 교체 (스키마 이름으로 찾을 것)
severity: severitySchema,  // z.enum([...]) 대신
```

- **이슈 5**: `actions/review-pull-request.ts`가 `"../constants"`에서 `buildPRUrl`을 import. 이동 후 `"../utils/build-pr-url"` 또는 `"../utils"`로 변경 필요.
- **이슈 5+7**: 상호 의존 관계. **5개 파일**(utils/build-pr-url.ts, utils/index.ts, constants/index.ts, module/ai/index.ts, actions/review-pull-request.ts)을 반드시 같은 커밋으로 원자적 구현할 것.
- **이슈 6**: `types/suggestion.ts`의 절대경로는 이슈 3(Phase 1)에서 이미 상대경로로 전환됨. 이슈 6 시점에서 `review-formatter.ts`만 변경 대상.
