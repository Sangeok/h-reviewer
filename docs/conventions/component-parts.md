# Component Parts Pattern

**적용 범위**: `module/*/ui/`, `components/*/ui/`

---

## 기본 구조

```
module/[domain]/
└── ui/
    ├── main-component.tsx       # 메인 컴포넌트
    └── parts/                   # 서브 컴포넌트
        └── sub-component.tsx
```

**실제 예시**:
```
module/repository/
└── ui/
    ├── repository-list.tsx
    └── parts/
        └── repository-card-skeleton.tsx

module/dashboard/
└── ui/
    ├── stats-overview.tsx
    └── parts/
        └── contribution-graph.tsx
```

---

## 파일명 규칙

- **파일명**: `kebab-case` (repository-list.tsx)
- **컴포넌트명**: `PascalCase` (RepositoryList)

```typescript
// ✅ 파일명: repository-list.tsx
export default function RepositoryList() {
  return <div>...</div>;
}
```

---

## 배치 기준

### 메인 컴포넌트 (`ui/`)
- 페이지에서 직접 사용
- 여러 곳에서 재사용
- 독립적 기능

### Parts (`ui/parts/`)
- 특정 메인 컴포넌트에서만 사용
- 메인 컴포넌트의 일부분
- 다른 곳에서 재사용 안 함

**간단한 질문:**
> "이 컴포넌트를 다른 모듈에서도 쓸까?"
> - 예 → `ui/`
> - 아니오 → `ui/parts/`

---

## Import 규칙

### 메인 → Parts (상대 경로)
```typescript
// module/repository/ui/repository-list.tsx
import { RepositoryCardSkeleton } from "./parts/repository-card-skeleton";
```

### Parts → 모듈 내부 (상대 경로)
```typescript
// module/dashboard/ui/parts/contribution-graph.tsx
import { getContributionStats } from "../../actions";
```

### 외부 모듈 (절대 경로)
```typescript
import { Button } from "@/components/ui/button";
```

---

## 안티 패턴

### ❌ Parts를 외부에서 직접 Import
```typescript
// ❌ 잘못됨
import { RepositoryCardSkeleton } from "@/module/repository/ui/parts/repository-card-skeleton";
```

**해결책**: Parts가 여러 곳에서 필요하면 공통 컴포넌트로 승격

### ❌ Parts 과도한 중첩
```typescript
// ❌ 잘못됨
module/dashboard/ui/parts/graph/parts/tooltip.tsx

// ✅ 올바름
module/dashboard/ui/parts/graph-tooltip.tsx
```

**원칙**: Parts 안에 parts/ 중첩 금지

---

## 도메인별 서브그룹

부모 컴포넌트가 **여러 독립 도메인**을 포함할 때, `parts/` 내부를 도메인별로 그룹화한다.

### 판단 기준
> "parts/ 안의 파일들이 2개 이상의 독립된 관심사에 속하는가?"
> - 예 → 도메인별 서브폴더
> - 아니오 → flat 유지

### 예시
```
# ✅ 여러 도메인 → 서브그룹
module/settings/ui/
├── settings-page.tsx
└── parts/
    ├── profile/
    │   ├── profile-form.tsx
    │   ├── profile-skeleton.tsx
    │   └── language-selector.tsx
    └── repository/
        ├── repository-list.tsx
        ├── repository-item.tsx
        └── repository-skeleton.tsx

# ✅ 단일 도메인 → flat 유지
components/app-sidebar/ui/
├── app-sidebar.tsx
└── parts/
    ├── logo.tsx
    ├── navigation.tsx
    └── footer.tsx
```

### Import 규칙
```typescript
// settings-page.tsx → 도메인 서브폴더 경로
import ProfileForm from "./parts/profile/profile-form";
import { RepositorySkeleton } from "./parts/repository/repository-skeleton";
```

### ⚠️ 주의
- 서브폴더 안에 다시 `parts/`를 만들지 않는다 (최대 1단계 그룹)
- 단일 도메인이면 불필요한 서브폴더를 만들지 않는다

---

## 빠른 예시

```typescript
// module/dashboard/ui/stats-overview.tsx
import ContributionGraph from "./parts/contribution-graph";

export default function StatsOverview() {
  return (
    <div>
      <h1>Dashboard</h1>
      <ContributionGraph />
    </div>
  );
}

// module/dashboard/ui/parts/contribution-graph.tsx
import { getContributionStats } from "../../actions";

export default function ContributionGraph() {
  const { data } = useQuery({
    queryFn: getContributionStats,
  });
  return <ActivityCalendar data={data} />;
}
```

---

**관련 문서**: [파일명 규칙](./file-naming-convention.md)
