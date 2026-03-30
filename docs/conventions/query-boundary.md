# QueryBoundary 사용 규칙

**적용 범위**: `useSuspenseQuery` 사용하는 모든 컴포넌트의 부모

---

## 왜 필요한가

`useSuspenseQuery`는 데이터 로딩 중 Suspense를 트리거하고, 에러 시 throw한다. `QueryBoundary` 없이 사용하면:

- Suspense가 상위 트리까지 버블업 → 예상치 못한 fallback 표시
- throw된 에러를 잡을 ErrorBoundary가 없음 → React 에러

`QueryBoundary`는 `QueryErrorResetBoundary` + `ErrorBoundary` + `Suspense`를 하나로 묶어 이 문제를 해결한다.

---

## 기본 사용법

```typescript
import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";

<QueryBoundary
  fallback={<Skeleton />}
  title="섹션 제목"
  description="로딩 실패 시 메시지"
>
  <DataFetchingComponent />
</QueryBoundary>
```

### Props

| Prop | 필수 | 설명 |
|------|------|------|
| `children` | O | `useSuspenseQuery` 사용하는 컴포넌트 |
| `fallback` | O | 로딩 중 표시할 스켈레톤 |
| `title` | X | 에러 카드 제목 |
| `description` | X | 에러 카드 설명 (기본값: "Failed to load data") |

---

## 적용 위치

**페이지 또는 부모 컴포넌트**에서 감싼다. 데이터를 페칭하는 자식 컴포넌트 내부가 아님.

```
page.tsx (또는 부모 컴포넌트)
└── <QueryBoundary fallback={<Skeleton />}>
    └── <DataComponent />     ← useSuspenseQuery 사용
```

---

## 실제 예시

### 단일 섹션 페이지

```typescript
// app/dashboard/repository/page.tsx
import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";

export default function RepositoryPage() {
  return (
    <div>
      <h1>Repositories</h1>
      <QueryBoundary fallback={<RepositoryListSkeleton />}>
        <RepositoryList />
      </QueryBoundary>
    </div>
  );
}
```

### 복수 섹션 페이지

각 섹션을 **개별 QueryBoundary**로 감싼다. 하나의 실패가 다른 섹션에 영향을 주지 않도록.

```typescript
// module/settings/ui/settings-page.tsx
export default function SettingsPage() {
  return (
    <div className="space-y-6">
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

---

## 스켈레톤 작성 규칙

- `fallback`에는 반드시 **스켈레톤 컴포넌트**를 전달
- 스켈레톤은 실제 컴포넌트와 동일한 레이아웃 유지
- 스켈레톤 위치: 해당 컴포넌트의 `parts/` 폴더

```
module/settings/
└── ui/
    ├── settings-page.tsx
    └── parts/
        ├── profile-form.tsx
        ├── profile-skeleton.tsx      ← ProfileForm용 스켈레톤
        ├── repository-list.tsx
        └── repository-skeleton.tsx   ← RepositoryList용 스켈레톤
```

---

## 안티 패턴

### 1. QueryBoundary 없이 useSuspenseQuery 사용

```typescript
// ❌ Suspense 경계 없음 → 상위 트리로 버블업
export default function Page() {
  return <DataComponent />;  // useSuspenseQuery 내부 사용
}
```

```typescript
// ✅ QueryBoundary로 래핑
export default function Page() {
  return (
    <QueryBoundary fallback={<Skeleton />}>
      <DataComponent />
    </QueryBoundary>
  );
}
```

### 2. 여러 섹션을 하나의 QueryBoundary로 묶기

```typescript
// ❌ 하나 실패 시 전체 에러 표시
<QueryBoundary fallback={<PageSkeleton />}>
  <ProfileForm />
  <RepositoryList />
</QueryBoundary>
```

```typescript
// ✅ 섹션별 독립적 에러 처리
<QueryBoundary fallback={<ProfileSkeleton />}>
  <ProfileForm />
</QueryBoundary>
<QueryBoundary fallback={<RepositorySkeleton />}>
  <RepositoryList />
</QueryBoundary>
```

### 3. 자식 컴포넌트 내부에서 자기 자신을 래핑

```typescript
// ❌ 데이터 페칭 컴포넌트가 자기 자신을 감쌈
export default function ProfileForm() {
  return (
    <QueryBoundary fallback={<Skeleton />}>
      <ProfileFormInner />
    </QueryBoundary>
  );
}
```

```typescript
// ✅ 부모(페이지)에서 감쌈
// settings-page.tsx
<QueryBoundary fallback={<ProfileSkeleton />}>
  <ProfileForm />
</QueryBoundary>
```

---

## 헤더/제목 배치

헤더, 제목 등 **정적 콘텐츠는 QueryBoundary 바깥**에 둔다. 데이터 로딩과 무관한 UI까지 스켈레톤으로 대체되지 않도록.

```typescript
// ✅ 헤더는 바깥, 데이터 컴포넌트만 안쪽
<div>
  <h1>Repositories</h1>
  <p>Manage your connected repositories</p>
  <QueryBoundary fallback={<RepositoryListSkeleton />}>
    <RepositoryList />
  </QueryBoundary>
</div>
```

---

## 체크리스트

- [ ] `useSuspenseQuery` 사용하는 컴포넌트는 부모에서 `QueryBoundary`로 감쌌는가?
- [ ] 독립적 섹션마다 개별 `QueryBoundary`를 사용했는가?
- [ ] `fallback`에 스켈레톤 컴포넌트를 전달했는가?
- [ ] 에러 시 사용자에게 의미 있는 `title`/`description`을 제공했는가?
- [ ] 정적 콘텐츠(헤더, 제목)는 QueryBoundary 바깥에 있는가?

---

**관련 문서**: [component-parts](./component-parts.md), [folder-structure](./folder-structure.md)
**참고**: [suspense-error-boundary-migration (archive)](../archive/suspense-error-boundary-migration.md)
