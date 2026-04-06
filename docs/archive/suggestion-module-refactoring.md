# suggestion 모듈 리팩토링 명세

## 개요

`module/suggestion/`을 7가지 코드 품질 기준으로 분석하여 11건의 리팩토링 대상을 식별했다.

**분석 기준**: typescript-clean-code, frontend-predictability, frontend-cohesion, naming-conventions, frontend-readability, frontend-coupling, frontend-file-naming

---

## 이슈 목록

| # | 이슈 | 심각도 | 컨벤션 근거 | 핵심 파일 |
|---|------|--------|------------|----------|
| 01 | 쿼리 키 매직 스트링 — `SUGGESTION_QUERY_KEYS` 상수 없음 | HIGH | predictability, clean-code | `hooks/use-apply-suggestion.ts`, `components/suggestion-list.tsx` |
| 02 | 훅 파일 하나에 훅 두 개 — 파일명 불일치 | MEDIUM | cohesion, file-naming | `hooks/use-apply-suggestion.ts` |
| 03 | `components/` 사용 — 다른 모든 모듈은 `ui/` | MEDIUM | cohesion, file-naming | `module/suggestion/` 디렉토리 |
| 04 | `interface Props` — `[ComponentName]Props` 패턴 위반 | MEDIUM | naming-conventions, readability | `suggestion-card.tsx`, `suggestion-list.tsx` |
| 05 | Props 타입에 `keyof typeof SEVERITY_CONFIG` — `SuggestionSeverity` enum 사용해야 함 | MEDIUM | clean-code, coupling | `suggestion-card.tsx` |
| 06 | `SuggestionWithReview` 미사용 타입 | LOW | clean-code | `types/index.ts` |
| 07 | 뮤테이션 훅에 `onError` 없음 | HIGH | predictability | `hooks/use-apply-suggestion.ts` |
| 08 | `staleTime: 60 * 1000` 인라인 매직 넘버 | LOW | clean-code, readability | `components/suggestion-list.tsx` |
| 09 | `applySuggestion` 143줄 God Function | MEDIUM | clean-code | `actions/index.ts` |
| 10 | 배럴 섹션 주석 없음 | LOW | cohesion, naming-conventions | `index.ts` |
| 11 | `useDismissSuggestion`의 `result.error` 미전달 | MEDIUM | predictability | `hooks/use-apply-suggestion.ts` |

---

## Phase 1: 예측 가능성 붕괴 (HIGH)

### 이슈 01: 쿼리 키 매직 스트링

**현황**: 쿼리 키가 파일마다 문자열 리터럴로 흩어져 있다.

```typescript
// hooks/use-apply-suggestion.ts
queryClient.invalidateQueries({ queryKey: ["suggestions"] });  // 18번째 줄
queryClient.invalidateQueries({ queryKey: ["reviews"] });      // 19번째 줄

// components/suggestion-list.tsx
queryKey: ["suggestions", reviewId],                           // 14번째 줄
```

**위반**: `["reviews"]`는 `module/review/constants`의 `REVIEW_QUERY_KEYS.LIST`와 동일해야 하는 크로스 모듈 의존성이지만 타입 없이 문자열만 존재한다. `["suggestions"]`와 `["suggestions", reviewId]`가 하나라도 오타나면 invalidation이 무음으로 실패한다. `module/review`의 `use-reviews.ts`는 `REVIEW_QUERY_KEYS.LIST`를 참조하는 반면 이 모듈은 raw string을 쓴다.

**제안**:

```typescript
// constants/index.ts — 추가
export const SUGGESTION_QUERY_KEYS = {
  DETAIL: (reviewId: string) => ["suggestions", reviewId] as const,
  LIST: ["suggestions"] as const,
} as const;

export const SUGGESTIONS_STALE_TIME_MS = 60 * 1000;
```

```typescript
// hooks/use-apply-suggestion.ts — 수정
import { SUGGESTION_QUERY_KEYS } from "../constants";
import { REVIEW_QUERY_KEYS } from "@/module/review/constants";

onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: SUGGESTION_QUERY_KEYS.LIST });
  queryClient.invalidateQueries({ queryKey: REVIEW_QUERY_KEYS.LIST });
},
```

```typescript
// components/suggestion-list.tsx — 수정
import { SUGGESTION_QUERY_KEYS, SUGGESTIONS_STALE_TIME_MS } from "../constants";

queryKey: SUGGESTION_QUERY_KEYS.DETAIL(reviewId),
staleTime: SUGGESTIONS_STALE_TIME_MS,
```

---

### 이슈 07: 뮤테이션 훅에 `onError` 없음

**현황**: 두 훅 모두 `onError` 콜백이 없다.

```typescript
// hooks/use-apply-suggestion.ts — 현재
return useMutation({
  mutationFn: async (suggestionId: string) => { ... },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    queryClient.invalidateQueries({ queryKey: ["reviews"] });
  },
  // onError 없음
});
```

**위반**: 코드베이스의 모든 뮤테이션 훅은 `onError`에서 `toast.error` + `console.error`를 처리한다.

```typescript
// module/repository/hooks/use-connect-repository.ts — 참조 패턴
onError: (error) => {
  toast.error(getErrorMessage(error, "Failed to connect repository"));
  console.error(error);
},

// module/settings/hooks/use-connected-repositories.ts — 참조 패턴
onError: (error) => {
  console.error(error);
  toast.error(getErrorMessage(error, "Failed to disconnect repository"));
},
```

`SuggestionCard`가 인라인 에러(`applyMutation.isError`)를 렌더링하고 있지만 이는 보조 수단일 뿐이다. `onError` 없이는 서버 로그 연계(`console.error`)가 누락되고, 컴포넌트가 에러를 렌더링하지 않는 미래 사용 맥락에서 에러가 완전히 소실된다.

> ⚠️ **사전 확인**: `getErrorMessage`가 `@/lib/utils`에 존재하는지 확인한다. `module/repository/hooks/use-connect-repository.ts`와 `module/settings/hooks/use-connected-repositories.ts`가 이 함수를 사용하므로 존재할 가능성이 높으나, 없으면 import 오류가 발생한다.

**제안**:

```typescript
// hooks/use-apply-suggestion.ts — 수정
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { SUGGESTION_QUERY_KEYS } from "../constants";
import { REVIEW_QUERY_KEYS } from "@/module/review/constants";

export function useApplySuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => { ... },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUGGESTION_QUERY_KEYS.LIST });
      queryClient.invalidateQueries({ queryKey: REVIEW_QUERY_KEYS.LIST });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to apply suggestion"));
      console.error(error);
    },
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => { ... },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUGGESTION_QUERY_KEYS.LIST });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to dismiss suggestion"));
      console.error(error);
    },
  });
}
```

---

## Phase 2: 구조·타입 일관성 (MEDIUM)

### 이슈 02: 훅 파일 하나에 훅 두 개

**현황**: `use-apply-suggestion.ts` 파일이 `useApplySuggestion`과 `useDismissSuggestion`을 모두 export한다.

```
hooks/
└── use-apply-suggestion.ts  ← useApplySuggestion + useDismissSuggestion 모두 존재
```

**위반**: 코드베이스 전 모듈이 파일 1개 = 훅 1개 규칙을 따른다.

```
module/repository/hooks/use-repositories.ts          ← useRepositories
module/repository/hooks/use-connect-repository.ts    ← useConnectRepository
module/settings/hooks/use-connected-repositories.ts  ← useConnectedRepositories
module/settings/hooks/use-user-profile.ts            ← useUserProfile
```

`useDismissSuggestion`을 검색할 때 `use-apply-suggestion.ts`를 열어야 한다는 사실은 직관에 반한다.

**제안**:

```
hooks/
├── use-apply-suggestion.ts    ← useApplySuggestion만
└── use-dismiss-suggestion.ts  ← useDismissSuggestion만 (신규)
```

```typescript
// index.ts — 수정
export { useApplySuggestion } from "./hooks/use-apply-suggestion";
export { useDismissSuggestion } from "./hooks/use-dismiss-suggestion";
```

```typescript
// components/suggestion-card.tsx — import 수정 (이슈 02와 함께)
// useDismissSuggestion이 별도 파일로 분리되었으므로 import 경로를 2개로 나눈다.
import { useApplySuggestion } from "../hooks/use-apply-suggestion";
import { useDismissSuggestion } from "../hooks/use-dismiss-suggestion";
```

> ⚠️ **배럴 동시 업데이트 필수**: `index.ts`의 `useDismissSuggestion` 경로 수정을 이 단계에서 함께 처리해야 한다. 구현 순서상 배럴 수정이 이슈 10으로 분리되어 있으나, 이슈 02 완료 시점에 배럴이 `"./hooks/use-apply-suggestion"`에서 더 이상 존재하지 않는 export를 참조하게 되어 빌드가 깨진다. `suggestion-card.tsx` import 분리 + `index.ts` 경로 수정을 하나의 커밋으로 묶는다.

---

### 이슈 03: `components/` 디렉토리 — 다른 모든 모듈은 `ui/`

**현황**: `module/suggestion/`만 `components/`를 사용한다.

```
module/suggestion/components/   ← 이 모듈만
module/review/ui/               ← review
module/repository/ui/           ← repository
module/auth/ui/                 ← auth
module/settings/ui/             ← settings
```

**위반**: 개발자가 `module/suggestion/ui/`를 탐색하면 아무것도 찾지 못한다. 모듈 간 구조 일관성이 깨진다.

**제안**: `components/` → `ui/`로 rename, 모든 상대경로 import 수정.

```typescript
// index.ts — 수정
export { SuggestionCard } from "./ui/suggestion-card";
export { SuggestionList } from "./ui/suggestion-list";
```

---

### 이슈 04: `interface Props` — `[ComponentName]Props` 패턴 위반

**현황**: 두 컴포넌트 파일이 모두 `interface Props`를 사용한다.

```typescript
// suggestion-card.tsx:9
interface Props {
  suggestion: { ... };
}

// suggestion-list.tsx:7
interface Props {
  reviewId: string;
  initialData?: ...;
}
```

**위반**: 코드베이스 컨벤션은 `[ComponentName]Props`다.

```typescript
// module/repository/ui/ 참조 패턴 예시
interface RepositoryCardProps { ... }
interface RepositorySearchInputProps { ... }
```

스택 트레이스, 타입 에러 메시지, IDE 검색에서 `Props`는 의미가 없다.

**제안**:

```typescript
// suggestion-card.tsx
interface SuggestionCardProps {
  suggestion: { ... };
}
export function SuggestionCard({ suggestion }: SuggestionCardProps) { ... }
```

```typescript
// suggestion-list.tsx
interface SuggestionListProps {
  reviewId: string;
  initialData?: ...;
}
export function SuggestionList({ reviewId, initialData }: SuggestionListProps) { ... }
```

---

### 이슈 05: Props 타입에 `keyof typeof SEVERITY_CONFIG`

**현황**: 컴포넌트 Props가 Prisma enum 대신 내부 UI 상수의 키 타입을 참조한다.

```typescript
// suggestion-card.tsx:17-18
interface Props {
  suggestion: {
    severity: keyof typeof SEVERITY_CONFIG;   // ← UI 상수 의존
    status: keyof typeof STATUS_CONFIG;       // ← UI 상수 의존
  };
}
```

**위반**: `keyof typeof SEVERITY_CONFIG`는 `SEVERITY_CONFIG`에 모든 enum 값이 있는 경우에만 `SuggestionSeverity`와 동일하다. 새로운 severity 값이 Prisma enum에 추가되었으나 `SEVERITY_CONFIG`가 업데이트되지 않으면 타입이 무음으로 분기된다. 컴포넌트의 공개 API 계약이 내부 UI 설정 상수에 결합된다.

**제안**:

```typescript
// suggestion-card.tsx
import type { SuggestionSeverity, SuggestionStatus } from "@/lib/generated/prisma/client";

interface SuggestionCardProps {
  suggestion: {
    severity: SuggestionSeverity;
    status: SuggestionStatus;
    // ...
  };
}
```

> ⚠️ **사전 확인**: `prisma/schema.prisma`의 `SuggestionSeverity` enum 값이 `SEVERITY_CONFIG` 키(`CRITICAL | WARNING | SUGGESTION | INFO`)와, `SuggestionStatus` enum 값이 `STATUS_CONFIG` 키(`PENDING | APPLIED | DISMISSED | CONFLICTED`)와 정확히 일치해야 한다. 불일치 시 `SEVERITY_CONFIG[suggestion.severity]` 인덱싱에서 TypeScript 컴파일 에러 발생. 작업 전 `prisma/schema.prisma`를 확인한다.

---

### 이슈 09: `applySuggestion` 143줄 God Function

**현황**: `actions/index.ts:31-173`의 `applySuggestion`이 6가지 책임을 혼재한다.

```
1. 인증 + 소유권 검증 (32-56줄)
2. GitHub 계정 토큰 조회 (58-64줄)
3. PR 상태 검증 — merged/closed/fork (70-78줄)
4. 파일 콘텐츠 조회 + 공백 정규화 (82-104줄)
5. 코드 교체 전략 — exact match → flex regex (107-143줄)
6. GitHub 커밋 + DB 업데이트 + 낙관적 잠금 (146-172줄)
```

인라인 `normalizeWhitespace` 람다(92줄)가 `let updatedContent`(111줄) 전에 선언되어 있어 읽는 흐름이 단절된다.

**제안**:

```typescript
// actions/index.ts — 분리 예시

// 책임 3을 분리
type PrStatus = Awaited<ReturnType<typeof getPullRequestBranch>>;

function validatePrStatus(prInfo: PrStatus): ApplySuggestionResult | null {
  if (prInfo.merged) return { success: false, error: "PR is already merged", reason: "pr_merged" };
  if (prInfo.state !== "open") return { success: false, error: "PR is closed", reason: "conflict" };
  return null;
}

// 책임 4+5를 분리 (교체 실패 시 originalContent 그대로 반환)
function applyCodeChange(
  fileContent: string,
  beforeCode: string,
  afterCode: string,
  lineNumber: number,
): string {
  const normalize = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
  // ... exact match + flex regex 로직
}

// applySuggestion은 20~30줄 오케스트레이션 함수로
export async function applySuggestion(suggestionId: string): Promise<ApplySuggestionResult> {
  // 1. 인증 + 조회
  // 2. 계정 토큰
  // 3. validatePrStatus(prInfo)
  // 4. applyCodeChange(...)
  // 5. commitFileUpdate(...)
  // 6. updateMany(...)
}
```

> ⚠️ **DB 사이드이펙트 위치 주의**: 현재 코드에는 충돌 감지 후 DB를 직접 업데이트하는 로직이 `applySuggestion` 내부에 인라인으로 존재한다.
>
> ```typescript
> if (!normalizedContent.includes(normalizedBefore)) {
>   await prisma.suggestion.update({ where: { id: suggestionId }, data: { status: "CONFLICTED" } });
>   return { success: false, error: "Code has changed since review", reason: "conflict" };
> }
> ```
>
> `applyCodeChange`는 순수 문자열 변환 함수(`string` 반환)로 설계해야 하므로, 이 DB 업데이트는 반드시 `applySuggestion` 오케스트레이션 함수에 남겨야 한다. `applyCodeChange`를 호출하기 전 충돌 여부를 먼저 확인하고, 충돌 시 DB 업데이트 후 early return하는 기존 흐름을 유지한다.

---

### 이슈 11: `useDismissSuggestion`의 `result.error` 미전달

**현황**: 두 훅의 에러 처리가 비대칭이다.

```typescript
// useApplySuggestion — 서버 에러 전달 ✅
throw new Error(result.error ?? "Failed to apply suggestion");

// useDismissSuggestion — 서버 에러 버림 ❌
throw new Error("Failed to dismiss suggestion");
```

서버가 `{ success: false, error: "Suggestion not found or already processed" }` 를 반환해도 클라이언트는 제네릭 메시지만 받는다.

**제안**:

```typescript
// useDismissSuggestion — 수정
mutationFn: async (suggestionId: string) => {
  const result = await dismissSuggestion(suggestionId);
  if (!result.success) {
    throw new Error(result.error ?? "Failed to dismiss suggestion");
  }
  return result;
},
```

---

## Phase 3: 마무리 정리 (LOW)

### 이슈 06: `SuggestionWithReview` 미사용 타입

**현황**: `types/index.ts:10-32`에 `SuggestionWithReview` 인터페이스가 정의되어 있으나 코드베이스 어디서도 import하지 않는다.

```typescript
// types/index.ts — 사용처 없음
export interface SuggestionWithReview {
  id: string;
  filePath: string;
  // ...
}
```

`SuggestionList`는 이 타입 대신 `Awaited<ReturnType<typeof getSuggestionsByReviewId>>`를 인라인으로 사용한다. `SuggestionCard`는 별도 인라인 타입을 Props에 정의한다.

**제안**: `SuggestionWithReview`를 삭제하고 `module/review/types/index.ts` 패턴으로 교체한다.

```typescript
// module/review/types/index.ts — 참조 패턴
export type ReviewsData = Awaited<ReturnType<typeof getUserReviews>>;
export type ReviewListItem = ReviewsData[number];
```

```typescript
// module/suggestion/types/index.ts — 제안
import type { Suggestion } from "@/lib/generated/prisma/client";

export type SuggestionItem = Suggestion;
export type SuggestionsData = SuggestionItem[];
```

> **주의**: `Awaited<ReturnType<typeof getSuggestionsByReviewId>>`를 `types/index.ts`에서 사용하면 `actions/index.ts` ↔ `types/index.ts` 순환 타입 의존성이 발생한다 (`actions`는 이미 `ApplySuggestionResult`를 `types`에서 import). Prisma 모델 타입에서 직접 파생하여 이를 회피한다.

---

### 이슈 08: `staleTime: 60 * 1000` 인라인 매직 넘버

**현황**: `suggestion-list.tsx:17`에 staleTime이 인라인 산술식으로 하드코딩되어 있다.

```typescript
// suggestion-list.tsx
staleTime: 60 * 1000,
```

```typescript
// 다른 모듈의 패턴
export const REVIEWS_STALE_TIME_MS = 1000 * 60 * 2;       // review
export const REPOSITORIES_STALE_TIME_MS = 1000 * 60 * 2;  // settings
```

**제안**: 이슈 01 작업 시 함께 추가한다.

```typescript
// constants/index.ts — 추가 (이슈 01과 함께)
export const SUGGESTIONS_STALE_TIME_MS = 60 * 1000;
```

---

### 이슈 10: 배럴 섹션 주석 없음

**현황**: `index.ts`에 섹션 주석이 없다.

```typescript
// index.ts — 현재
export * from "./actions";
export * from "./types";
export * from "./constants";
export { SuggestionCard } from "./components/suggestion-card";
export { SuggestionList } from "./components/suggestion-list";
export { useApplySuggestion, useDismissSuggestion } from "./hooks/use-apply-suggestion";
```

**위반**: `module/review/index.ts`의 섹션 주석 패턴을 따르지 않는다.

```typescript
// module/review/index.ts — 참조 패턴
// ===== Actions =====
export * from "./actions";
// ===== Types =====
export * from "./types";
// ===== UI Components =====
export { default as ReviewList } from "./ui/review-list";
// ===== Hooks =====
export { useReviews } from "./hooks/use-reviews";
// ===== Constants =====
export { REVIEW_QUERY_KEYS, REVIEWS_STALE_TIME_MS } from "./constants";
```

**제안**:

```typescript
// index.ts — 수정 (이슈 02, 03 완료 후)
// ===== Actions =====
export { getSuggestionsByReviewId, applySuggestion, dismissSuggestion } from "./actions";

// ===== Types =====
export type { ApplySuggestionResult, SuggestionsData, SuggestionItem } from "./types";

// ===== Constants =====
export { SEVERITY_CONFIG, STATUS_CONFIG, SUGGESTION_QUERY_KEYS, SUGGESTIONS_STALE_TIME_MS } from "./constants";

// ===== UI Components =====
export { SuggestionCard } from "./ui/suggestion-card";
export { SuggestionList } from "./ui/suggestion-list";

// ===== Hooks =====
export { useApplySuggestion } from "./hooks/use-apply-suggestion";
export { useDismissSuggestion } from "./hooks/use-dismiss-suggestion";
```

---

## 구현 순서

의존성 기준 순서:

1. **ISSUE-01 + ISSUE-08**: `constants/index.ts`에 `SUGGESTION_QUERY_KEYS`, `SUGGESTIONS_STALE_TIME_MS` 추가 — 순수 추가, 다른 변경 언블로킹
2. **ISSUE-11 + ISSUE-07**: 훅 1줄 수정 + `onError` 추가 — 낮은 위험
3. **ISSUE-04 + ISSUE-05**: Props 인터페이스 이름 변경 + 타입 교체
4. **ISSUE-02**: `use-dismiss-suggestion.ts` 파일 분리 + `suggestion-card.tsx` import 분리 + `index.ts`의 `useDismissSuggestion` 경로 수정 — **세 파일을 하나의 작업 단위로 처리** (배럴 업데이트를 이슈 10으로 미루면 빌드 오류 발생)
5. **ISSUE-03**: `components/` → `ui/` rename → 모든 상대 import 수정
6. **ISSUE-09**: `applySuggestion` 헬퍼 추출
7. **ISSUE-10 + ISSUE-06**: 배럴 섹션 주석 추가, 미사용 타입 제거 및 교체

## 변경 파일 목록

| 파일 | 작업 | 관련 이슈 |
|------|------|----------|
| `module/suggestion/constants/index.ts` | 상수 추가 | 01, 08 |
| `module/suggestion/hooks/use-apply-suggestion.ts` | 수정 (onError, error 전달) | 07, 11 |
| `module/suggestion/hooks/use-dismiss-suggestion.ts` | 신규 생성 | 02 |
| `module/suggestion/components/suggestion-card.tsx` → `ui/suggestion-card.tsx` | rename + hook import 분리 + 타입 수정 | 02, 03, 04, 05 |
| `module/suggestion/components/suggestion-list.tsx` → `ui/suggestion-list.tsx` | rename + 상수 적용 | 03, 04, 08 |
| `module/suggestion/types/index.ts` | 미사용 타입 교체 | 06 |
| `module/suggestion/actions/index.ts` | 헬퍼 추출 | 09 |
| `module/suggestion/index.ts` | 섹션 주석 + import 경로 수정 | 02, 03, 10 |
