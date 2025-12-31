# 파일명 규칙

**표준**: **kebab-case** (소문자 + 하이픈)

---

## 기본 원칙

```
✅ 올바름:
- repository-list.tsx
- use-repositories.ts
- auth-utils.ts

❌ 잘못됨:
- RepositoryList.tsx      (PascalCase)
- repositoryList.tsx      (camelCase)
- repository_list.tsx     (snake_case)
```

**파일명과 컴포넌트명 분리**:
```typescript
// ✅ 파일명: repository-list.tsx (kebab-case)
export default function RepositoryList() { }  // PascalCase
```

---

## 타입별 규칙

### React 컴포넌트 (`.tsx`)
```
✅ kebab-case.tsx
repository-list.tsx
contribution-graph.tsx
profile-form.tsx
```

### Hooks (`.ts`)
```
✅ use-[feature].ts
use-repositories.ts
use-connect-repository.ts
use-session.ts
```

### 유틸리티 (`.ts`)
```
✅ [feature]-utils.ts 또는 utils.ts
auth-utils.ts
date-utils.ts
utils.ts
```

### Server Actions
```
✅ actions/index.ts (디렉토리로 그룹화)
module/repository/actions/index.ts
module/dashboard/actions/index.ts
```

### Next.js 특수 파일 (예외)
```
✅ Next.js 규약 준수
page.tsx
layout.tsx
route.ts
error.tsx
loading.tsx
```

---

## 네이밍 패턴

### 컴포넌트
```
[feature]-[type].tsx

repository-list.tsx        # 목록
repository-card.tsx        # 카드
profile-form.tsx           # 폼
stats-overview.tsx         # 개요
```

### Hook
```
use-[feature].ts

use-repositories.ts
use-auth.ts
```

### Parts (서브 컴포넌트)
```
[feature]-[type].tsx

repository-card-skeleton.tsx
contribution-graph.tsx
stat-card.tsx
```

---

## 안티 패턴

### ❌ PascalCase 파일명
```typescript
// ❌ 잘못됨
// 파일명: RepositoryList.tsx
export default function RepositoryList() {}

// ✅ 올바름
// 파일명: repository-list.tsx
export default function RepositoryList() {}
```

### ❌ 혼재된 규칙
```
❌ 한 디렉토리에 여러 규칙:
module/repository/ui/
├── RepositoryList.tsx      # PascalCase
├── repository-card.tsx     # kebab-case
└── repositoryForm.tsx      # camelCase

✅ 일관된 규칙:
module/repository/ui/
├── repository-list.tsx
├── repository-card.tsx
└── repository-form.tsx
```

---

## 리팩토링

### 파일명 변경
```bash
# Git 사용 (권장)
git mv RepositoryList.tsx repository-list.tsx
```

### Import 업데이트
```typescript
// Before:
import RepositoryList from "@/module/repository/ui/RepositoryList";

// After:
import RepositoryList from "@/module/repository/ui/repository-list";
```

### 검증
```bash
npx tsc --noEmit    # 타입 체크
npm run build       # 빌드 테스트
```

---

## 빠른 예시

```typescript
// ✅ 컴포넌트
// 파일명: repository-list.tsx
export default function RepositoryList() {}

// ✅ Hook
// 파일명: use-repositories.ts
export function useRepositories() {}

// ✅ 유틸리티
// 파일명: auth-utils.ts
export async function requireAuth() {}

// ✅ 타입
// 파일명: types/index.ts
export interface Repository {}
```

---

## 왜 kebab-case?

1. **가독성**: 단어 구분 명확
2. **URL 친화적**: `/repository-list` ✅
3. **대소문자 문제 없음**: Windows/Linux 호환
4. **표준**: React/Next.js 권장

---

**관련 문서**: [Component Parts Pattern](./component-parts-pattern.md)
