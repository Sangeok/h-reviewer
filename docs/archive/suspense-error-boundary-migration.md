# Suspense + ErrorBoundary Migration

`useQuery` Early Return 패턴을 `useSuspenseQuery` + `ErrorBoundary` 선언적 패턴으로 전환. 프로젝트 전체 5개 데이터 페칭 컴포넌트 일괄 마이그레이션.

**스택**: React 19.2 + Next.js 16 + React Query v5.90 — 모두 Suspense stable API 지원.

---

## 현재 문제

### 1. 모든 데이터 페칭 컴포넌트가 3중 분기 반복

```tsx
// 5개 컴포넌트 전부 이 패턴
if (isPending) return <Skeleton />;  // 로딩 UI
if (isError) return <Error />;       // 에러 UI
return <Success />;                  // 성공 UI
```

- 컴포넌트가 데이터 페칭 상태 관리 + UI 렌더링 두 가지 책임을 동시에 가짐 (SRP 위반)
- `isPending`/`isLoading` 네이밍이 파일마다 불일치
- 런타임 에러(렌더링 중 예외)는 포착하지 못함 — 화면 전체 크래시

### 2. 영향받는 컴포넌트 전체 목록

| 컴포넌트 | 훅 | 쿼리 타입 | Early Return |
|----------|-----|----------|--------------|
| `module/settings/ui/parts/profile-form.tsx` | `useUserProfile` | `useQuery` | isPending + isError |
| `module/settings/ui/parts/repository-list.tsx` | `useConnectedRepositories` | `useQuery` | isPending + isError |
| `module/repository/ui/repository-list.tsx` | `useRepositories` | `useInfiniteQuery` | isLoading + isError |
| `module/review/ui/review-list.tsx` | 인라인 `useQuery` | `useQuery` | isLoading |
| `app/dashboard/subscription/page.tsx` | 인라인 `useQuery` | `useQuery` | isLoading + error + !data |

---

## 목표 패턴

### Before (명령적)

```tsx
function RepositoryList() {
  const { repositories, isPending, isError, error, refetch } = useConnectedRepositories();

  if (isPending) return <SkeletonCard />;
  if (isError) return <ErrorCard error={error} onRetry={refetch} />;

  return <Card>{/* success */}</Card>;
}
```

### After (선언적)

```tsx
// 부모: 상태 관리 담당
<QueryBoundary fallback={<RepositorySkeleton />}>
  <RepositoryList />
</QueryBoundary>

// 자식: success 렌더링만 담당
function RepositoryList() {
  const { repositories } = useConnectedRepositories();
  // data가 항상 존재 — isPending/isError 체크 불필요
  return <Card>{/* success */}</Card>;
}
```

---

## 수정 계획

### Phase 1: 인프라 (신규 2파일)

#### 1-1. `react-error-boundary` 설치

```bash
npm install react-error-boundary
```

**선택 근거**: 직접 class 컴포넌트로 ErrorBoundary를 작성할 수도 있지만, `react-error-boundary`는 `resetErrorBoundary` + `fallbackRender` 패턴을 제공하며 React Query의 `QueryErrorResetBoundary`와 공식 연동된다.

#### 1-2. `QueryBoundary` 래퍼 컴포넌트 생성

```
components/error-boundary/query-error-boundary.tsx  (신규)
```

```tsx
"use client";

import { type ReactNode } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/utils";

interface QueryBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  title?: string;
  description?: string;
}

export function QueryBoundary({ children, fallback, title, description }: QueryBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ resetErrorBoundary, error }) => (
            <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
              <CardHeader className="relative z-10">
                {title && (
                  <CardTitle className="text-lg font-medium text-foreground">{title}</CardTitle>
                )}
                <CardDescription className="font-light text-muted-foreground">
                  {description ?? "Failed to load data"}
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-10 space-y-3">
                <p className="text-sm font-light text-muted-foreground">
                  {getErrorMessage(error, "An unexpected error occurred")}
                </p>
                <Button
                  variant="outline"
                  className="border-ring/30 bg-secondary text-secondary-foreground transition-all duration-300 hover:bg-accent hover:text-foreground"
                  onClick={resetErrorBoundary}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}
        >
          <Suspense fallback={fallback}>
            {children}
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
```

**`title`/`description`이 선택적인 이유**: 에러 폴백에서 Card UI를 쓰지 않는 컴포넌트도 있음 (repository 모듈의 `repository-list.tsx`는 Card 없이 div 구조). 범용성을 위해 선택적으로 제공하되, 기본 에러 UI는 Card 스타일로 통일.

**`fallback`이 필수인 이유**: 각 컴포넌트의 스켈레톤 UI가 다르므로 (Card 스켈레톤, 리스트 스켈레톤 등) 공통화할 수 없음. 호출부에서 주입.

---

### Phase 2: 훅 수정 (3파일)

`useMutation`은 변경하지 않는다. mutation의 `isPending`은 버튼 로딩 상태이므로 Suspense와 무관.

#### 2-1. `module/settings/hooks/use-user-profile.ts`

**변경**: `useQuery` -> `useSuspenseQuery`

```tsx
// Before
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
const { data: profile, isLoading, isError, error, refetch } = useQuery({...});
return { profile, isLoading, isError, error, refetch, updateMutation };

// After
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
const { data: profile } = useSuspenseQuery({...});
return { profile, updateMutation };
```

**제거되는 반환값**: `isLoading`, `isError`, `error`, `refetch` — Suspense/ErrorBoundary가 대체.

**`staleTime`, `refetchOnWindowFocus` 등 옵션**: 그대로 유지. `useSuspenseQuery`도 동일 옵션 지원.

#### 2-2. `module/settings/hooks/use-connected-repositories.ts`

**변경**: `useQuery` -> `useSuspenseQuery`

```tsx
// Before
const { data: repositories = [], isPending, isFetching, isError, error, refetch } = useQuery({...});
return { repositories, isPending, isFetching, isError, error, refetch, disconnectMutation, disconnectAllMutation };

// After
const { data: repositories, isFetching } = useSuspenseQuery({...});
return { repositories, isFetching, disconnectMutation, disconnectAllMutation };
```

**`isFetching` 유지 이유**: 성공 상태에서 백그라운드 리페치 시 "Updating..." 인디케이터 표시에 사용 (`repository-list.tsx:84-89`). Suspense는 초기 로딩만 처리하고, 백그라운드 리페치는 Suspense를 트리거하지 않으므로 `isFetching`이 여전히 필요.

**`data`의 기본값**: `useSuspenseQuery`는 `data`가 항상 존재하므로 `= []` 기본값 불필요. 단, `queryFn`(`getConnectedRepositories`)이 빈 배열을 반환할 수 있으므로 타입은 `Repository[]`로 유지.

#### 2-3. `module/repository/hooks/use-repositories.ts`

**변경**: `useInfiniteQuery` -> `useSuspenseInfiniteQuery`

```tsx
// Before
import { useInfiniteQuery } from "@tanstack/react-query";
const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({...});

// After
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery({...});
```

**제거되는 반환값**: `isLoading`, `isError`

**`isFetchingNextPage` 유지 이유**: 무한 스크롤 시 다음 페이지 로딩 인디케이터 표시에 사용. 이것은 Suspense 대상이 아님 (초기 로딩만 Suspense 처리).

---

### Phase 3: 컴포넌트 단순화 (5파일)

각 컴포넌트에서 `if (isPending) return ...`과 `if (isError) return ...` 블록을 삭제하고, success 렌더링만 남긴다.

#### 3-1. `module/settings/ui/parts/profile-form.tsx`

**삭제**: 45-60행 (isLoading early return), 62-83행 (isError early return)

```tsx
// Before (13행)
const { profile, isLoading, isError, error, refetch, updateMutation } = useUserProfile();

// After
const { profile, updateMutation } = useUserProfile();
```

나머지 success 렌더링 (85-169행)은 그대로 유지. `updateMutation.isPending` 체크도 그대로.

#### 3-2. `module/settings/ui/parts/repository-list.tsx`

**삭제**: 27-44행 (isPending early return), 46-69행 (isError early return)

```tsx
// Before (24행)
const { repositories, isPending, isFetching, isError, error, refetch, disconnectMutation, disconnectAllMutation } =
  useConnectedRepositories();

// After
const { repositories, isFetching, disconnectMutation, disconnectAllMutation } =
  useConnectedRepositories();
```

success 렌더링 (71-158행)에서 `isFetching` 인디케이터, `disconnectMutation.isPending`, `disconnectAllMutation.isPending` 체크는 그대로 유지.

#### 3-3. `module/repository/ui/repository-list.tsx`

**삭제**: 58-68행 (isLoading early return), 70-79행 (isError early return), 83-87행 (success 렌더링 내 헤더)

헤더는 Phase 4-2에서 페이지로 이동하므로 컴포넌트에서 제거해야 함. 제거하지 않으면 **헤더가 중복 렌더링**됨.

```tsx
// Before (13행)
const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useRepositories();

// After
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useRepositories();
```

```tsx
// Before (success 렌더링 81-87행) — 헤더 포함
return (
  <div className="space-y-6">
    <div>
      <h2 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Repositories</h2>
      <p className="text-[#707070] font-light mt-1">Manage and view your github repositories</p>
    </div>
    <RepositorySearchInput ... />
    ...

// After — 헤더만 제거, <div className="space-y-6"> 래퍼 유지
return (
  <div className="space-y-6">
    <RepositorySearchInput ... />
    <div className="grid gap-4">...</div>
    <div ref={observerTarget}>...</div>
  </div>
```

**`space-y-6` 래퍼 유지 이유**: 검색 입력, 리포지토리 그리드, 무한 스크롤 옵저버 사이의 간격 담당. 페이지의 `space-y-6`는 QueryBoundary 외부에 있으므로 내부 자식에 영향을 주지 못함. 프래그먼트(`<>`)로 바꾸면 간격 소실.

#### 3-4. `module/review/ui/review-list.tsx`

**변경 1**: 인라인 `useQuery`를 `useSuspenseQuery`로 변경

```tsx
// Before (11행)
const { data: reviews, isLoading } = useQuery({
  queryKey: ["reviews"],
  queryFn: async () => await getReviews(),
});

// After
const { data: reviews } = useSuspenseQuery({
  queryKey: ["reviews"],
  queryFn: async () => await getReviews(),
});
```

**변경 2**: 16-30행 isLoading early return 삭제

**변경 3**: 33-38행 success 렌더링 내 헤더 삭제. 헤더는 Phase 4-3에서 페이지로 이동하므로 컴포넌트에서 제거해야 함. 제거하지 않으면 **헤더가 중복 렌더링**됨.

```tsx
// Before (success 렌더링 32-38행) — 헤더 포함
return (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Review History</h1>
      <p className="text-[#707070] font-light mt-1">View your AI-powered code reviews</p>
    </div>
    ...

// After — 헤더 제거, 리뷰 목록만 렌더링
return (
  <>
    {reviews?.length === 0 && ( ... )}
    {reviews && reviews.length > 0 && ( ... )}
  </>
```

**별도 훅 분리 여부**: 현재 인라인 useQuery가 단순하고 mutation이 없으므로, 이 마이그레이션에서는 `useSuspenseQuery`로만 교체. 훅 분리는 별도 리팩터링 범위.

#### 3-5. `app/dashboard/subscription/page.tsx` (특수 케이스)

이 파일은 **페이지 컴포넌트에 직접 `useQuery`가 있고**, `useSearchParams` + `useEffect`도 함께 사용. 컴포넌트를 분리해야 한다.

**현재 구조**:
```
subscription/page.tsx (320줄)
  └── useQuery + useSearchParams + useEffect + 3개 early return + UI 전부
```

**변경 후 구조**:
```
subscription/
  page.tsx                  → QueryBoundary 래핑 + searchParams 전달
  subscription-content.tsx  → useSuspenseQuery + useEffect + UI (신규)
```

**page.tsx (변경 후)**:
```tsx
"use client";

import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { SplinePointer } from "lucide-react";
import SubscriptionContent from "./subscription-content";

export default function SubscriptionPage() {
  return (
    <QueryBoundary
      fallback={<SubscriptionSkeleton />}
      title="Subscription Plans"
      description="Failed to load subscription data"
    >
      <SubscriptionContent />
    </QueryBoundary>
  );
}

function SubscriptionSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <SplinePointer />
      <p className="text-sm text-[#707070] font-light">Loading subscription data...</p>
    </div>
  );
}
```

**`"use client"` 유지 이유**: `SubscriptionSkeleton`이 `SplinePointer`(lucide-react)를 사용. 서버 컴포넌트로 바꿀 이점 없음.

**subscription-content.tsx (신규)**: 기존 page.tsx의 37-321행을 이동. `useQuery` -> `useSuspenseQuery`로 변경, 3개 early return 삭제.

**`useSearchParams` 처리**: `subscription-content.tsx`에서 그대로 사용. `useSuspenseQuery`와 `useSearchParams`는 독립적으로 동작.

**`!data?.user` 체크**: `useSuspenseQuery`에서는 `data`가 항상 존재하지만, `data.user`가 `null`일 수 있음. 이 체크는 early return이 아닌 조건부 UI로 변환:

```tsx
// Before
if (!data?.user) return <div>Please sign in...</div>;

// After (success 렌더링 내부)
if (!data.user) return <div>Please sign in...</div>;
// 또는 인라인 조건부 렌더링
```

**`!data.user`는 early return으로 유지해도 무방**: 이것은 데이터 페칭 상태가 아닌 비즈니스 로직 분기이므로 Suspense/ErrorBoundary 대상이 아님.

---

### Phase 4: 부모에서 래핑 (4파일)

#### 4-1. `module/settings/ui/settings-page.tsx`

```tsx
// Before
import ProfileForm from "./parts/profile-form";
import RepositoryList from "./parts/repository-list";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1>Settings</h1>
        <p>Manage your account and preferences</p>
      </div>
      <ProfileForm />
      <RepositoryList />
    </div>
  );
}

// After
import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import ProfileForm from "./parts/profile-form";
import RepositoryList from "./parts/repository-list";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1>Settings</h1>
        <p>Manage your account and preferences</p>
      </div>
      <QueryBoundary
        fallback={<ProfileSkeleton />}
        title="Profile Settings"
        description="Failed to load profile"
      >
        <ProfileForm />
      </QueryBoundary>
      <QueryBoundary
        fallback={<RepositorySkeleton />}
        title="Connected Repository"
        description="Failed to load connected GitHub repositories"
      >
        <RepositoryList />
      </QueryBoundary>
    </div>
  );
}
```

**독립 래핑 이유**: ProfileForm과 RepositoryList가 서로 다른 쿼리를 사용. 하나가 에러나도 다른 하나는 정상 렌더링되어야 함.

**스켈레톤 컴포넌트**: 기존 early return에서 사용하던 스켈레톤 UI를 `parts/` 디렉토리에 별도 컴포넌트로 추출.

```
module/settings/ui/parts/profile-skeleton.tsx       (신규)
module/settings/ui/parts/repository-skeleton.tsx    (신규)
```

**`profile-skeleton.tsx`** — `profile-form.tsx` 45-59행에서 추출:
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ProfileSkeleton() {
  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
      <CardHeader className="relative z-10">
        <CardTitle className="text-lg font-medium text-foreground">Profile Settings</CardTitle>
        <CardDescription className="font-light text-muted-foreground">Update your profile information</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="space-y-4">
          <div className="h-10 animate-pulse rounded-lg bg-secondary" />
          <div className="h-10 animate-pulse rounded-lg bg-secondary" />
        </div>
      </CardContent>
    </Card>
  );
}
```

**`repository-skeleton.tsx`** — `repository-list.tsx` 29-43행에서 추출:
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RepositorySkeleton() {
  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
      <CardHeader className="relative z-10">
        <CardTitle className="text-lg font-medium text-foreground">Connected Repository</CardTitle>
        <CardDescription className="font-light text-muted-foreground">
          Manage your connected GitHub repositories
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-lg bg-secondary" />
          <div className="h-16 animate-pulse rounded-lg bg-secondary" />
        </div>
      </CardContent>
    </Card>
  );
}
```

**`settings-page.tsx`에서 import**:
```tsx
import { ProfileSkeleton } from "./parts/profile-skeleton";
import { RepositorySkeleton } from "./parts/repository-skeleton";
```

**`"use client"` 지시어**: `settings-page.tsx`는 현재 서버 컴포넌트. `QueryBoundary`가 이미 `"use client"`이고, 서버 컴포넌트에서 클라이언트 컴포넌트를 children으로 렌더링하는 것은 React 19에서 유효. `settings-page.tsx`는 서버 컴포넌트로 유지 가능. `ProfileForm`과 `RepositoryList`는 이미 `"use client"` 컴포넌트.

#### 4-2. `app/dashboard/repository/page.tsx`

```tsx
// Before
import { RepositoryList } from "@/module/repository";
export default function RepositoryPage() {
  return (
    <div>
      <RepositoryList />
    </div>
  );
}

// After
import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { RepositoryList, RepositoryListSkeleton } from "@/module/repository";

export default function RepositoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Repositories</h1>
        <p className="text-[#707070] font-light mt-1">Manage and view your github repositories</p>
      </div>
      <QueryBoundary fallback={<RepositoryListSkeleton />}>
        <RepositoryList />
      </QueryBoundary>
    </div>
  );
}
```

**배럴 export 추가 필요**: `RepositoryListSkeleton`이 현재 `module/repository/index.ts`에 export되어 있지 않음. 배럴에 추가:

```tsx
// module/repository/index.ts 에 추가
export { RepositoryListSkeleton } from "./ui/parts/repository-card-skeleton";
```

**헤더 위치 변경**: 현재 `RepositoryList` 컴포넌트 내부에 헤더(`<h1>Repositories</h1>`)가 있는데, 이것이 early return에서도 반복됨. 헤더를 페이지로 올리고, `RepositoryList`는 리스트만 렌더링하도록 변경. 이렇게 하면 로딩/에러 상태에서도 헤더가 항상 표시됨.

#### 4-3. `app/dashboard/reviews/page.tsx`

```tsx
// Before
import { ReviewList } from "@/module/review";
export default function ReviewsPage() {
  return (
    <div>
      <ReviewList />
    </div>
  );
}

// After
import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { ReviewList } from "@/module/review";
import { Loader2 } from "lucide-react";

export default function ReviewsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Review History</h1>
        <p className="text-[#707070] font-light mt-1">View your AI-powered code reviews</p>
      </div>
      <QueryBoundary fallback={<ReviewSkeleton />}>
        <ReviewList />
      </QueryBoundary>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 rounded-lg border border-[#1a1a1a] bg-gradient-to-b from-[#0a0a0a] to-black">
      <Loader2 className="h-6 w-6 text-[#4a6a4a] animate-spin" />
      <p className="text-sm text-[#707070] font-light">Loading reviews...</p>
    </div>
  );
}
```

4-2와 동일 패턴. 헤더를 페이지로 올리고 `ReviewList`를 `QueryBoundary`로 래핑. `ReviewSkeleton`은 `review-list.tsx` 18-29행에서 추출하여 페이지 파일 하단에 정의.

#### 4-4. `app/dashboard/subscription/page.tsx`

Phase 3-5에서 설명한 대로 컴포넌트 분리 + `QueryBoundary` 래핑.

---

## 수정 대상 파일 총정리

| 파일 | 변경 유형 |
|------|----------|
| `package.json` | `react-error-boundary` 추가 |
| `components/error-boundary/query-error-boundary.tsx` | **신규** — QueryBoundary 래퍼 |
| `module/settings/hooks/use-user-profile.ts` | `useQuery` -> `useSuspenseQuery`, 반환값 축소 |
| `module/settings/hooks/use-connected-repositories.ts` | `useQuery` -> `useSuspenseQuery`, 반환값 축소 |
| `module/repository/hooks/use-repositories.ts` | `useInfiniteQuery` -> `useSuspenseInfiniteQuery`, 반환값 축소 |
| `module/settings/ui/parts/profile-form.tsx` | early return 2개 삭제, 구조분해 축소 |
| `module/settings/ui/parts/repository-list.tsx` | early return 2개 삭제, 구조분해 축소 |
| `module/settings/ui/parts/profile-skeleton.tsx` | **신규** — ProfileForm 스켈레톤 |
| `module/settings/ui/parts/repository-skeleton.tsx` | **신규** — RepositoryList 스켈레톤 |
| `module/repository/ui/repository-list.tsx` | early return 2개 삭제, 헤더 제거 (페이지로 이동) |
| `module/repository/index.ts` | `RepositoryListSkeleton` 배럴 export 추가 |
| `module/review/ui/review-list.tsx` | `useQuery` -> `useSuspenseQuery`, early return 삭제, 헤더 제거 |
| `app/dashboard/subscription/page.tsx` | `"use client"` 유지, 컴포넌트 분리 + QueryBoundary 래핑 |
| `app/dashboard/subscription/subscription-content.tsx` | **신규** — 기존 page.tsx에서 분리 |
| `module/settings/ui/settings-page.tsx` | QueryBoundary 래핑 추가 |
| `app/dashboard/repository/page.tsx` | QueryBoundary 래핑 추가, 헤더 이동, 배럴 import 유지 |
| `app/dashboard/reviews/page.tsx` | QueryBoundary 래핑 추가, 헤더 이동, ReviewSkeleton 정의 |

**총 17파일** (신규 5 + 수정 12)

---

## 변경하지 않는 것

- `useMutation` 관련 코드 전부 (버튼 로딩 상태, toast, `invalidateQueries`)
- `QueryProvider` (`components/provider/query-provider.tsx`)
- query key 상수, staleTime 설정
- `repository-item.tsx`의 `disconnectMutation.isPending` 체크
- `use-connect-repository.ts` (mutation만 사용)
- `module/settings/constants/index.ts`

---

## 작업 순서

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 순서 필수.
Phase 2-4는 모듈 단위로 묶어서 진행:

1. react-error-boundary 설치 + QueryBoundary 생성
2. settings 모듈: 훅 2개 수정 → 컴포넌트 2개 단순화 → settings-page.tsx 래핑
3. repository 모듈: 훅 1개 수정 → 컴포넌트 1개 단순화 → page.tsx 래핑
4. review 모듈: 컴포넌트 내 useQuery 변경 → page.tsx 래핑
5. subscription: 컴포넌트 분리 → page.tsx 래핑
```

**모듈 단위 진행 이유**: 한 모듈의 훅만 `useSuspenseQuery`로 바꾸고 부모 래핑을 안 하면, Suspense가 상위 트리까지 버블업되어 예상치 못한 fallback이 표시될 수 있음. 훅 수정 → 컴포넌트 단순화 → 부모 래핑을 한 모듈에서 한 번에 완료해야 함.

---

## 주의사항

### `useSuspenseQuery`와 조건부 호출 금지

React 훅 규칙에 따라 `useSuspenseQuery`는 조건부로 호출할 수 없음. 현재 5개 컴포넌트 모두 무조건 `useQuery`를 호출하므로 문제없음.

### Suspense 버블링

`QueryBoundary`로 래핑하지 않은 상태에서 `useSuspenseQuery`를 사용하면, Suspense가 가장 가까운 상위 `<Suspense>` 경계까지 버블업됨. 프로젝트에 현재 Suspense 경계가 없으므로, 래핑 없이 배포하면 **React가 에러를 던짐**. Phase 2와 Phase 4를 반드시 함께 진행.

### 초기 로딩 vs 백그라운드 리페치

`useSuspenseQuery`는 **초기 데이터가 없을 때만** Suspense를 트리거. `staleTime` 경과 후 백그라운드 리페치는 Suspense를 트리거하지 않음. `isFetching`으로 별도 처리 필요 (현재 `repository-list.tsx`에서 이미 하고 있음).

### `useSuspenseInfiniteQuery`의 초기 페이지

`useSuspenseInfiniteQuery`는 첫 번째 페이지 로딩 시에만 Suspense 트리거. `fetchNextPage` 호출 시에는 `isFetchingNextPage`로 처리 (현재와 동일).

### SSR / Streaming 호환

Next.js 16 App Router에서 `useSuspenseQuery`를 사용하면 서버에서 Suspense fallback이 먼저 전송되고, 클라이언트에서 데이터 로딩 후 교체됨 (Streaming SSR). 현재 프로젝트의 모든 데이터 페칭 컴포넌트가 `"use client"`이므로 클라이언트 사이드에서만 동작하며, SSR 스트리밍의 이점은 없지만 호환성 문제도 없음.

### settings-module-refactoring-feature.md와의 관계

기존 스펙의 C-1 (커스텀 훅 분리)은 이미 완료된 상태. 이 마이그레이션은 C-1에서 생성된 훅들을 `useSuspenseQuery`로 전환하는 후속 작업. C-2 (에러 처리 전략)에서 "throw 유지" 결정이 `useSuspenseQuery`와 정합 — throw된 에러가 ErrorBoundary로 전파됨.

---

## 검증

1. `npx tsc --noEmit` — 타입 에러 없음
2. `npm run lint` — lint 통과
3. `npm run build` — 빌드 성공
4. Settings 페이지: 프로필 로딩/에러/성공, 저장소 로딩/에러/성공 독립 동작 확인
5. Repository 페이지: 초기 로딩 스켈레톤 → 데이터 표시, 무한 스크롤 정상 동작
6. Review 페이지: 로딩 → 리뷰 목록 표시
7. Subscription 페이지: 로딩 → 구독 정보 표시, `?success=true` 파라미터 동작
8. 에러 시나리오: 네트워크 차단 후 각 페이지에서 에러 UI + Retry 버튼 동작 확인
9. 백그라운드 리페치: `repository-list.tsx`의 "Updating..." 인디케이터 정상 표시
