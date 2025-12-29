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

**원칙**: Parts는 1단계만 (`ui/parts/`)

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
