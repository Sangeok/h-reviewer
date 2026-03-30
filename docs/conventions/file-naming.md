# 파일명 규칙 (React)

**기본 표준**: **kebab-case** (소문자 + 하이픈)

> 이 문서는 React 공통 규칙이다. Next.js 전용 파일 규칙은 하단 부록에서 분리해 다룬다.

---

## 기본 원칙

```
✅ 기본 표준에 맞음:
- repository-list.tsx
- use-repositories.ts
- auth-utils.ts

❌ 피해야 함:
- repositoryList.tsx      (camelCase)
- repository_list.tsx     (snake_case)
```

**파일명과 컴포넌트명은 분리한다**:
```typescript
// 파일명: repository-list.tsx (kebab-case)
export default function RepositoryList() {} // 컴포넌트명: PascalCase
```

---

## 컴포넌트 파일 전략

React 생태계에서는 컴포넌트 파일에 `kebab-case`와 `PascalCase`를 모두 사용한다.

### 전략 A (권장): kebab-case
```
repository-list.tsx
profile-form.tsx
contribution-graph.tsx
```

### 전략 B (대안): PascalCase
```
RepositoryList.tsx
ProfileForm.tsx
ContributionGraph.tsx
```

### 공통 원칙
- 한 디렉토리/모듈 내에서는 **하나의 전략만** 사용한다.
- 새 프로젝트는 기본적으로 전략 A(`kebab-case`)를 사용한다.

---

## 타입별 규칙 (전략 A 기준)

### React 컴포넌트 (`.tsx`)
```
[feature]-[type].tsx
repository-list.tsx
repository-card.tsx
profile-form.tsx
```

### Hooks (`.ts`)
```
use-[feature].ts
use-repositories.ts
use-connect-repository.ts
use-session.ts
```

### 유틸리티 (`.ts`)
```
[feature]-utils.ts 또는 utils.ts
auth-utils.ts
date-utils.ts
utils.ts
```

### 상수 (`.ts`)
```
constants.ts 또는 [feature]-constants.ts
constants.ts
api-constants.ts
route-constants.ts
```

### 스키마 (`.ts`)
```
[feature]-schema.ts
repository-schema.ts
login-schema.ts
```

### 타입 정의 (`.ts` / `.d.ts`)
```
모듈 내부 타입:
types.ts
[feature]-types.ts          # repository-types.ts

전역 타입 선언:
global.d.ts
```

### 테스트 (`.test.ts` / `.test.tsx`)
```
[원본 파일명].test.ts(x)
repository-list.test.tsx
use-repositories.test.ts
auth-utils.test.ts
```

### Storybook (`.stories.tsx`)
```
[원본 파일명].stories.tsx
repository-list.stories.tsx
profile-form.stories.tsx
```

---

## 안티 패턴

### ❌ 디렉토리 내 규칙 혼용
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

### ❌ 맥락 없는 일반 이름
```
temp.ts
new-file.ts
```

`index.tsx`는 아래처럼 역할이 명확할 때는 사용 가능하다.
- 폴더 엔트리 컴포넌트 (`ui/index.tsx`)
- 재수출용 엔트리 (`index.ts`)
- 라우팅 규약상 엔트리 파일 (프레임워크 규약)

---

## 리팩토링 체크리스트

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
npx tsc --noEmit
npm run build
```

---

## 빠른 예시

```typescript
// 컴포넌트
// 파일명: repository-list.tsx
export default function RepositoryList() {}

// Hook
// 파일명: use-repositories.ts
export function useRepositories() {}

// 유틸리티
// 파일명: auth-utils.ts
export async function requireAuth() {}

// 타입
// 파일명: repository-types.ts
export interface Repository {}

// 상수
// 파일명: constants.ts
export const MAX_ITEMS = 50;

// 스키마
// 파일명: repository-schema.ts
export const repositorySchema = z.object({ ... });

// 테스트
// 파일명: repository-list.test.tsx
describe("RepositoryList", () => { ... });
```

---

## 왜 kebab-case?

1. 단어 경계가 명확해 검색/스캔이 쉽다.
2. URL/라우트 명명과 자연스럽게 맞는다.
3. 대소문자 차이로 인한 OS 간 충돌 가능성이 낮다.
4. 파일명이 길어져도 읽기 부담이 적다.

---

## 부록: Next.js 프로젝트에서만 적용

아래 항목은 React 공통 규칙이 아니라 **Next.js 규약**이다.

### App Router 특수 파일
```
page.tsx
layout.tsx
route.ts
error.tsx
loading.tsx
not-found.tsx
template.tsx
default.tsx
global-error.tsx
opengraph-image.tsx
sitemap.ts
robots.ts
```

### 루트/설정 파일
```
middleware.ts
next.config.ts
tailwind.config.ts
postcss.config.js
.env.local
```
