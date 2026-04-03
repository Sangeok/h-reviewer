# Repository 모듈 리팩토링 명세

## 개요

`module/repository/` 디렉토리(11개 파일, 6개 디렉토리)를 대상으로 7개 프론트엔드 품질 스킬을 적용한 종합 분석 결과이다.

### 분석 대상 파일

```
module/repository/
├── index.ts
├── types/index.ts
├── actions/index.ts
├── lib/map-github-repository.ts
├── hooks/
│   ├── use-connect-repository.ts
│   ├── use-repositories.ts
│   └── use-infinite-scroll-trigger.ts
└── ui/
    ├── repository-list.tsx
    └── parts/
        ├── repository-card.tsx
        ├── repository-card-skeleton.tsx
        └── repository-search-input.tsx
```

### 적용 스킬

| 스킬 | 검토 관점 |
|------|----------|
| typescript-clean-code | 클린 코드 원칙 (변수, 함수, 에러 처리, 비동기, 타입) |
| frontend-predictability | 예측 가능성 (숨은 로직, 이름-동작 일치, 불가능 상태 차단) |
| frontend-cohesion | 응집도 (디렉토리 구조, 상태 코로케이션, 데이터 요청 코로케이션) |
| naming-conventions | 네이밍 컨벤션 (함수, 변수, 파일, 타입, 상수) |
| frontend-readability | 가독성 (매직 넘버, 복잡한 조건, 이름 붙이기) |
| frontend-coupling | 결합도 (불필요한 공통화, 책임 분리, 의존성 관리) |
| frontend-file-naming | 파일명 규칙 (kebab-case, 타입별 규칙) |

---

## 분석 결과

### Critical (반드시 수정)

#### C-1. constants 디렉토리 부재 및 쿼리 키 하드코딩

**스킬**: frontend-cohesion, frontend-readability
**규칙**: 응집도 가이드 5항 (데이터 요청 코로케이션), 가독성 가이드 1-1항 (매직 넘버에 이름 붙이기)

**현상**:

review 모듈은 `constants/index.ts`에 쿼리 키, stale time, 매직 넘버를 상수로 관리하고 있으나, repository 모듈에는 `constants/` 디렉토리 자체가 없다.

```typescript
// module/review/constants/index.ts (기존 패턴)
export const REVIEW_QUERY_KEYS = {
  LIST: ["reviews"],
  DETAIL: (id: string) => ["reviews", id],
} as const;

export const REVIEWS_STALE_TIME_MS = 1000 * 60 * 2;
export const REVIEW_PREVIEW_MAX_CHARS = 300;
```

repository 모듈에서는 쿼리 키가 문자열 리터럴로 직접 사용된다:

```typescript
// hooks/use-repositories.ts:7
queryKey: ["repositories"],

// hooks/use-connect-repository.ts:24
queryClient.invalidateQueries({ queryKey: ["repositories"] });
```

**문제점**:

- 쿼리 키 문자열이 2곳에서 독립적으로 하드코딩되어 하나만 변경 시 캐시 무효화 실패 위험
- 매직 넘버 `10`(페이지 사이즈), `0.1`(스크롤 threshold), `5`(스켈레톤 카운트)가 의미 없이 흩어져 있음
- 프로젝트 모듈 구조 컨벤션(CLAUDE.md의 constants/ 패턴) 미준수

**개선**:

```typescript
// module/repository/constants/index.ts (신규 생성)
export const REPOSITORY_QUERY_KEYS = {
  LIST: ["repositories"],
} as const;

export const REPOSITORY_PAGE_SIZE = 10;

export const SKELETON_COUNT = 5;
```

> `SCROLL_OBSERVER_THRESHOLD`는 이 파일에 포함하지 않는다. `useInfiniteScrollTrigger`가 범용 훅이므로 repository 모듈의 constants에 두면 훅의 이식성이 저하된다. 대신 훅 파라미터에 `threshold`를 추가하고 기본값 `0.1`을 부여하는 방식을 권장한다.

```typescript
// hooks/use-infinite-scroll-trigger.ts — threshold를 파라미터로 추출
interface UseInfiniteScrollTriggerParams {
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  threshold?: number;
}

const DEFAULT_SCROLL_THRESHOLD = 0.1;

export function useInfiniteScrollTrigger({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  threshold = DEFAULT_SCROLL_THRESHOLD,
}: UseInfiniteScrollTriggerParams) {
  // ... IntersectionObserver에 threshold 전달
}
```

**수정 대상 파일**:

| 파일 | 변경 내용 |
|------|----------|
| `constants/index.ts` | 신규 생성 (`REPOSITORY_QUERY_KEYS`, `REPOSITORY_PAGE_SIZE`, `SKELETON_COUNT`) |
| `hooks/use-repositories.ts` | `["repositories"]` → `REPOSITORY_QUERY_KEYS.LIST`, `10` → `REPOSITORY_PAGE_SIZE` |
| `hooks/use-connect-repository.ts` | `["repositories"]` → `REPOSITORY_QUERY_KEYS.LIST` |
| `hooks/use-infinite-scroll-trigger.ts` | `0.1` → 파라미터 기본값으로 추출 (모듈 상수가 아닌 훅 내부 상수) |
| `ui/parts/repository-card-skeleton.tsx` | `5` → `SKELETON_COUNT` |
| `index.ts` | constants re-export 추가 |

---

#### C-2. 예상 가능한 에러를 throw로 처리

**스킬**: typescript-clean-code
**규칙**: ERR-05 (Result 패턴 — 타입 안전한 에러 처리)

**현상**:

`actions/index.ts`의 `connectRepository`에서 예상 가능한 비즈니스 에러를 `throw`로 처리하고 있다:

```typescript
// actions/index.ts:53-55
if (existingRepository) {
  throw new Error("Repository is already connected by another user");
}

// actions/index.ts:59-61
if (!canConnect) {
  throw new Error("You have reached the maximum number of repositories");
}
```

**문제점**:

- `throw`는 함수 시그니처에 드러나지 않아 호출부가 어떤 에러가 발생하는지 예측할 수 없음
- 클라이언트에서 `getErrorMessage(error, "Failed to connect repository")`로 일괄 처리하여 사용자에게 구체적인 에러 메시지 전달 불가
- 프로젝트의 기존 패턴(`module/settings/types`의 `UpdateProfileResult` discriminated union)과 불일치

**개선**:

```typescript
// types/index.ts — 기존 ConnectRepositoryResult를 discriminated union으로 확장
export type ConnectRepositoryResult =
  | { status: "connected" }
  | { status: "already_connected" }
  | { status: "error"; error: "ALREADY_CONNECTED_BY_OTHER" | "QUOTA_EXCEEDED" };
```

```typescript
// actions/index.ts
if (existingRepository) {
  return { status: "error", error: "ALREADY_CONNECTED_BY_OTHER" };
}

if (!canConnect) {
  return { status: "error", error: "QUOTA_EXCEEDED" };
}
```

```typescript
// hooks/use-connect-repository.ts — onSuccess에서 에러 분기 처리
onSuccess: async (result) => {
  switch (result.status) {
    case "connected":
      toast.success("Repository connected successfully");
      break;
    case "already_connected":
      toast.info("Repository is already connected");
      break;
    case "error":
      if (result.error === "QUOTA_EXCEEDED") {
        toast.error("You have reached the maximum number of repositories");
      } else {
        toast.error("Repository is already connected by another user");
      }
      return; // 캐시 무효화 및 세션 리프레시 스킵
  }

  queryClient.invalidateQueries({ queryKey: REPOSITORY_QUERY_KEYS.LIST });
  await refetchSession();
},
```

**수정 대상 파일**:

| 파일 | 변경 내용 |
|------|----------|
| `types/index.ts` | `ConnectRepositoryResult` discriminated union 확장 |
| `actions/index.ts` | throw → return { status: "error", error: ... } |
| `hooks/use-connect-repository.ts` | onSuccess 분기 처리, onError는 시스템 에러 전용으로 유지 |

---

#### C-3. connectRepository 함수 인자 3개 초과

**스킬**: typescript-clean-code
**규칙**: FN-01 (인자 최대 2개)

**현상**:

```typescript
// actions/index.ts:29-33
export async function connectRepository(
  owner: string,
  repo: string,
  githubId: number
): Promise<ConnectRepositoryResult> {
```

**문제점**:

- 인자 3개로, 클린 코드 규칙(FN-01: 인자 최대 2개)을 위반
- 호출부에서 인자 순서에 의존하므로 순서를 바꿔 호출할 위험 존재

**개선**:

```typescript
// types/index.ts
export interface ConnectRepositoryParams {
  owner: string;
  repo: string;
  githubId: number;
}

// actions/index.ts
export async function connectRepository({
  owner,
  repo,
  githubId,
}: ConnectRepositoryParams): Promise<ConnectRepositoryResult> {
```

```typescript
// hooks/use-connect-repository.ts — 호출부도 객체 전달로 변경
mutationFn: async (params: ConnectRepositoryParams) => {
  return await connectRepository(params);
},
```

**수정 대상 파일**:

| 파일 | 변경 내용 |
|------|----------|
| `types/index.ts` | `ConnectRepositoryParams` 인터페이스 추가 |
| `actions/index.ts` | 함수 시그니처를 객체 구조분해로 변경 |
| `hooks/use-connect-repository.ts` | mutationFn 인자를 `ConnectRepositoryParams`로 변경 |
| `ui/repository-list.tsx` | handleConnect의 connectRepository 호출부 확인 (이미 객체로 전달 중이므로 변경 없음) |

---

### Important (권장 수정)

#### I-1. 매직 넘버 산재

**스킬**: frontend-readability
**규칙**: 가독성 가이드 1-1항 (매직 넘버에 이름 붙이기)

**현상 및 개선**: C-1에서 생성하는 상수로 교체

| 파일:라인 | 매직 넘버 | 상수명 | 비고 |
|-----------|----------|--------|------|
| `hooks/use-repositories.ts:9` | `10` | `REPOSITORY_PAGE_SIZE` | constants에서 import |
| `hooks/use-repositories.ts:13` | `10` | `REPOSITORY_PAGE_SIZE` | constants에서 import |
| `hooks/use-infinite-scroll-trigger.ts:34` | `0.1` | `DEFAULT_SCROLL_THRESHOLD` | 훅 내부 상수 (C-1 주의사항 참조) |
| `ui/parts/repository-card-skeleton.tsx:37` | `5` | `SKELETON_COUNT` | constants에서 import |

---

#### I-2. normalizedSearchQuery의 useMemo 비효율

**스킬**: frontend-predictability
**규칙**: 예측 가능성 가이드 8항 (파생 가능한 값)

**현상**:

```typescript
// ui/repository-list.tsx:30-39
const normalizedSearchQuery = searchQuery.toLowerCase();
const filteredRepositories = useMemo(
  () =>
    allRepositories.filter(
      (repo: Repository) =>
        repo.name.toLowerCase().includes(normalizedSearchQuery) ||
        repo.fullName.toLowerCase().includes(normalizedSearchQuery)
    ),
  [allRepositories, normalizedSearchQuery]
);
```

**문제점**:

`normalizedSearchQuery`가 `useMemo` 외부에서 매 렌더링마다 새로 계산된다. JavaScript 문자열은 원시 타입이라 값이 같으면 참조가 동일하므로 useMemo 자체는 정상 동작하지만, **의도가 불명확**하다. 파생값을 외부에 선언하면 독립 상태처럼 보여 혼란을 줄 수 있다.

**개선**:

```typescript
const filteredRepositories = useMemo(() => {
  const normalized = searchQuery.toLowerCase();
  return repositories.filter(
    (repo) =>
      repo.name.toLowerCase().includes(normalized) ||
      repo.fullName.toLowerCase().includes(normalized)
  );
}, [repositories, searchQuery]);
```

**수정 대상 파일**: `ui/repository-list.tsx`

---

#### I-3. localConnectingId 변수명 모호

**스킬**: naming-conventions
**규칙**: 네이밍 컨벤션 변수 네이밍 1항 (의미 있는 이름)

**현상**:

```typescript
// ui/repository-list.tsx:16
const [localConnectingId, setLocalConnectingId] = useState<number | null>(null);
```

**문제점**:

`local` 접두사가 "무엇에 대해 로컬"인지 불명확. 서버 상태와 구분하려는 의도이나, 이름에서 "연결 중인 레포지토리의 ID"라는 의미가 드러나지 않는다.

**개선**:

```typescript
const [connectingRepositoryId, setConnectingRepositoryId] = useState<number | null>(null);
```

**수정 대상 파일**: `ui/repository-list.tsx`

---

#### I-4. allRepositories 변수명 불필요한 접두사

**스킬**: naming-conventions
**규칙**: 네이밍 컨벤션 배열/컬렉션 3항 (복수형 사용, 불필요한 접두사 제거)

**현상**:

```typescript
// ui/repository-list.tsx:28
const allRepositories = useMemo(() => data?.pages.flatMap((page) => page) || [], [data]);
```

**문제점**:

컴포넌트 내에 단일 레포지토리 컬렉션만 존재하므로 `all` 접두사가 불필요하다.

**개선**:

```typescript
const repositories = useMemo(() => data?.pages.flatMap((page) => page) ?? [], [data]);
```

`||` 대신 `??` 사용으로 nullish coalescing 적용 (빈 배열은 falsy가 아니므로 동작 동일하나, 의도가 더 명확).

**변경 시 주의**: `allRepositories`는 선언부(line 28) 외에 **line 79에서도 참조**된다. 모든 참조를 `repositories`로 변경해야 한다:

```typescript
// ui/repository-list.tsx:79 — 이 참조도 함께 변경 필요
{!hasNextPage && repositories.length > 0 && (
```

**수정 대상 파일**: `ui/repository-list.tsx` (line 28, line 79)

---

#### I-5. 중첩 삼항 연산자

**스킬**: frontend-readability
**규칙**: 가독성 가이드 1-2항 (복잡한 조건에 이름 붙이기)

**현상**:

```typescript
// ui/parts/repository-card.tsx:66
{isConnecting ? "Connecting..." : repository.isConnected ? "Connected" : "Connect"}
```

**문제점**:

삼항 연산자가 중첩되어 우선순위를 머릿속에서 파싱해야 한다.

**개선**:

```typescript
function getConnectButtonLabel(isConnecting: boolean, isConnected: boolean): string {
  if (isConnecting) return "Connecting...";
  if (isConnected) return "Connected";
  return "Connect";
}

// JSX에서
{getConnectButtonLabel(isConnecting, repository.isConnected)}
```

**수정 대상 파일**: `ui/parts/repository-card.tsx`

---

#### I-6. queryFn 불필요한 중간 변수

**스킬**: typescript-clean-code
**규칙**: FN-10 (함수형 스타일 선호)

**현상**:

```typescript
// hooks/use-repositories.ts:8-10
queryFn: async ({ pageParam = 1 }) => {
  const repositories = await getUserRepositories(pageParam, 10);
  return repositories;
},
```

**문제점**:

중간 변수 `repositories`가 반환만 하고 다른 용도로 사용되지 않는다.

**개선**:

```typescript
queryFn: async ({ pageParam = 1 }) => {
  return getUserRepositories(pageParam, REPOSITORY_PAGE_SIZE);
},
```

또는 더 간결하게:

```typescript
queryFn: ({ pageParam = 1 }) => getUserRepositories(pageParam, REPOSITORY_PAGE_SIZE),
```

**수정 대상 파일**: `hooks/use-repositories.ts`

---

#### I-7. Barrel export 서버/클라이언트 혼재

**스킬**: frontend-coupling
**규칙**: typescript-clean-code FMT-05 (Barrel Export 사용 지침)

**현상**:

```typescript
// index.ts
export * from "./actions";           // "use server" 코드
export * from "./hooks/use-connect-repository"; // "use client" 코드
export * from "./hooks/use-repositories";       // "use client" 코드
export { default as RepositoryList } from "./ui/repository-list"; // "use client" 코드
```

**문제점**:

서버 전용 코드(`actions`)와 클라이언트 전용 코드(`hooks`, `ui`)가 하나의 barrel export에 혼재되어 있다. Next.js의 tree shaking이 이를 처리하지만, 의도가 불명확하다.

**개선**:

주석으로 경계를 명시하고, 서버 액션 중 내부 전용 함수(`disconnectAllRepositoriesInternal`)는 barrel export에서 제외:

```typescript
// ===== Server Actions =====
export { getUserRepositories, connectRepository, disconnectRepository } from "./actions";

// ===== Client Hooks =====
export { useConnectRepository } from "./hooks/use-connect-repository";
export { useRepositories } from "./hooks/use-repositories";

// ===== Client Components =====
export { default as RepositoryList } from "./ui/repository-list";
export { RepositoryListSkeleton } from "./ui/parts/repository-card-skeleton";

// ===== Constants =====
export { REPOSITORY_QUERY_KEYS, REPOSITORY_PAGE_SIZE, SKELETON_COUNT } from "./constants";

// ===== Types =====
export type {
  Repository,
  GitHubRepositoryDto,
  GitHubRepositoryOwnerDto,
  ConnectRepositoryResult,
  ConnectRepositoryParams,
} from "./types";
```

> `disconnectAllRepositoriesInternal`은 settings 모듈에서 직접 import(`@/module/repository/actions`)하므로 barrel에서 제외해도 무방.

**수정 대상 파일**: `index.ts`

---

### Nice-to-have (선택적)

#### N-1. disconnectAllRepositoriesInternal 네이밍 — 적용 보류

**스킬**: naming-conventions
**규칙**: 네이밍 컨벤션 비즈니스 로직 2.5항

**현상**:

```typescript
// actions/index.ts:151
export async function disconnectAllRepositoriesInternal(userId: string): Promise<void> {
```

**문제점**:

`Internal` 접미사가 프로젝트 네이밍 컨벤션에 정의되지 않은 비표준 패턴이다.

**~~개선안~~**: ~~`disconnectAllRepositories`로 변경~~

**적용 보류 사유 — 네이밍 충돌**:

`module/settings/actions/index.ts`에 이미 **동일한 이름의 함수가 존재**한다:

```typescript
// module/settings/actions/index.ts
import {
  disconnectRepository as disconnectRepositoryInternal,
  disconnectAllRepositoriesInternal,              // ← 현재 import
} from "@/module/repository/actions";

export async function disconnectAllRepositories() {  // ← line 136, 이미 존재
  const session = await requireAuthSession();
  await disconnectAllRepositoriesInternal(session.user.id);
  // ...
}
```

repository 모듈의 함수를 `disconnectAllRepositories`로 변경하면, settings 모듈에서 **import 이름과 로컬 함수명이 충돌**하여 컴파일 에러가 발생한다. 해결하려면 settings에서 별칭 import(`import { disconnectAllRepositories as ... }`)가 필요하며, 이는 현재보다 가독성이 떨어진다.

**결론**: `Internal` 접미사가 이상적이지는 않지만, 현재 settings 모듈의 래퍼 패턴(`Internal` → public 함수)과 일관되게 동작하고 있으므로 **현재 이름을 유지**한다. 변경하려면 settings 모듈의 래퍼 함수 네이밍까지 함께 재설계해야 하며, 이는 이 명세의 범위를 벗어난다.

---

#### N-2. lib 파일명 개선

**스킬**: frontend-file-naming
**규칙**: 파일명 규칙 유틸리티 항목

**현상**:

```
lib/map-github-repository.ts
```

**문제점**:

파일명이 단일 함수(`mapGitHubRepositoryDtoToRepository`)를 암시하지만, 실제로는 type guard 함수(`isGitHubRepositoryDto`, `isGitHubRepositoryOwnerDto`, `isObjectRecord`, `isStringArray`)도 포함하고 있다.

**개선안**:

```
lib/github-repository-mapper.ts
```

또는 현재 이름을 유지하되, 파일 내부 export 구조를 명확하게 유지하는 것도 수용 가능.

---

#### N-3. 하드코딩된 색상값 반복

**스킬**: frontend-readability

**현상**:

다음 색상값이 `repository-card.tsx`, `repository-search-input.tsx`, `repository-card-skeleton.tsx`에서 반복 사용:

| 색상 코드 | 용도 | 출현 횟수 |
|-----------|------|----------|
| `#0a0a0a` | 기본 배경 | 3 |
| `#1a1a1a` | 보조 배경/테두리 | 8 |
| `#2d3e2d` | 녹색 악센트 | 9 |
| `#4a6a4a` | 활성 녹색 | 5 |
| `#606060` | 뮤트 텍스트 | 3 |
| `#707070` | 밝은 뮤트 | 3 |
| `#e0e0e0` | 기본 텍스트 | 2 |

**문제점**:

프로젝트 전체적으로 63곳에서 동일한 패턴이 발견되며, repository 모듈만의 이슈가 아니다.

**권장**: 별도 이슈로 분리하여 프로젝트 전체 디자인 토큰(CSS 변수 또는 Tailwind 테마)으로 관리하는 것을 권장. 이 명세의 범위에서는 제외.

---

#### N-4. useConnectRepository의 숨은 부수효과

**스킬**: frontend-predictability
**규칙**: 예측 가능성 가이드 1항 (숨은 로직 드러내기)

**현상**:

```typescript
// hooks/use-connect-repository.ts:25
await refetchSession();
```

**문제점**:

`useConnectRepository` 이름만으로는 세션 리프레시가 일어나는지 예측할 수 없다. 레포지토리 연결 시 구독 카운트가 변경되므로 세션 갱신이 필요하지만, 이 부수효과가 이름에 드러나지 않는다.

**개선안**: JSDoc 주석으로 부수효과를 명시

```typescript
/**
 * Repository 연결 mutation hook.
 * 성공 시 repositories 쿼리 캐시 무효화 및 세션 리프레시를 수행한다.
 */
export const useConnectRepository = () => {
```

---

#### N-5. useConnectRepository와 useSession 결합

**스킬**: frontend-coupling

**현상**: `useConnectRepository`가 `useSession`에 직접 의존하여 세션 리프레시를 수행.

**평가**: 현재 사용처가 1곳뿐이고, 세션 리프레시가 레포지토리 연결의 필수 부수효과이므로 결합이 합리적이다. 분리 시 오히려 복잡도가 증가할 수 있어 **현재 상태 유지**를 권장.

---

#### N-6. repository-card-skeleton.tsx "use client" 누락

**스킬**: typescript-clean-code
**규칙**: REACT-01 (Server/Client Component 분리)

**현상**: `repository-card-skeleton.tsx`에만 `"use client"` 지시어가 없고, 같은 `parts/` 디렉토리의 다른 파일들은 모두 포함하고 있다.

**평가**: 스켈레톤 컴포넌트는 인터랙티브 요소가 없어 서버 컴포넌트로 동작 가능. 다만 `RepositoryList`("use client" 컴포넌트) 내에서 import되므로 자동으로 클라이언트 번들에 포함된다. **일관성을 위해 추가**하거나, 현재 상태를 유지해도 기능적 문제는 없다.

---

## 구현 순서

```
Phase 1: C-1 (constants 생성)
    ↓
Phase 2: C-2 + C-3 (Server Action 개선) — types/index.ts, actions/index.ts 동시 수정
    ↓
Phase 3: I-1 ~ I-7 (병렬 작업 가능)
    ↓
Phase 4: N-1 ~ N-6 (선택적, 독립 작업)
```

### Phase 의존 관계

- Phase 2는 Phase 1의 상수를 사용 (REPOSITORY_QUERY_KEYS)
- Phase 3의 I-1은 Phase 1의 상수를 참조
- Phase 3의 나머지는 서로 독립

## 영향 범위

### 내부 파일 (안전)

| 파일 | Phase |
|------|-------|
| `module/repository/constants/index.ts` (신규) | 1 |
| `module/repository/types/index.ts` | 2 |
| `module/repository/actions/index.ts` | 2 |
| `module/repository/hooks/use-connect-repository.ts` | 2, 3 |
| `module/repository/hooks/use-repositories.ts` | 3 |
| `module/repository/hooks/use-infinite-scroll-trigger.ts` | 3 |
| `module/repository/ui/repository-list.tsx` | 3 |
| `module/repository/ui/parts/repository-card.tsx` | 3 |
| `module/repository/ui/parts/repository-card-skeleton.tsx` | 3 |
| `module/repository/index.ts` | 3 |

### 외부 파일 (주의)

| 파일 | 변경 이유 | Phase |
|------|----------|-------|
| `module/settings/actions/index.ts` | N-1 적용 보류로 변경 불필요 | - |
| `app/dashboard/repository/page.tsx` | barrel export 변경 시 확인 필요 (변경 없을 가능성 높음) | - |

## 검증 방법

```bash
# 1. 타입 검사
npx tsc --noEmit

# 2. 린트
npm run lint

# 3. 빌드
npm run build

# 4. 수동 테스트
# - /dashboard/repository 페이지 접속
# - 레포지토리 검색 기능 확인
# - 무한 스크롤 동작 확인
# - 레포지토리 연결 성공/실패 시나리오 확인
# - 이미 연결된 레포지토리 재연결 시도 확인
```

## 미해결 질문

- 하드코딩된 색상값(N-3)을 디자인 토큰으로 전환하는 별도 이슈를 생성할 것인가?
- `useInfiniteScrollTrigger` 훅을 향후 다른 모듈에서도 사용할 계획이 있는가? (있다면 `hooks/` 공용 디렉토리로 이동 검토)
