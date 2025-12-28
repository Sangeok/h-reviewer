# 프로젝트 폴더 구조 평가 및 개선 제안

**평가일**: 2025-12-23
**평가 대상**: hreviewer 프로젝트
**종합 점수**: **75/100**

---

## 📊 평가 요약

| 카테고리 | 점수 | 비고 |
|---------|------|------|
| 아키텍처 구조 | 18/20 | Domain-driven 설계 우수 |
| 코드 조직화 | 15/20 | 일부 중복 및 불일치 |
| 일관성 | 12/20 | 파일명 규칙 혼재 |
| 확장성 | 16/20 | 모듈화 잘 되어 있음 |
| 문서화 | 6/10 | 기본 문서만 존재 |
| 테스트 구조 | 0/10 | 테스트 인프라 부재 |
| **총점** | **75/100** | **양호** |

---

## ✅ 강점 (Strengths)

### 1. **Domain-Driven Module 구조** ⭐⭐⭐⭐⭐
```
module/
├── auth/          # 인증 도메인
├── repository/    # 저장소 관리
├── review/        # 코드 리뷰
├── settings/      # 설정
├── dashboard/     # 대시보드
├── ai/            # AI 기능
└── github/        # GitHub 연동
```

**장점**:
- 비즈니스 로직 기반 구조 (기술적 레이어가 아닌)
- 도메인별 관심사 명확히 분리
- 새로운 기능 추가 시 위치 파악 용이
- 팀원 간 작업 영역 구분 명확

### 2. **Component Hierarchy Pattern** ⭐⭐⭐⭐⭐
```
components/app-sidebar/
├── ui/
│   ├── app-sidebar.tsx
│   └── parts/           # 하위 컴포넌트 명확히 구분
│       ├── logo.tsx
│       ├── navigation.tsx
│       └── footer.tsx
├── hooks/               # 컴포넌트 전용 훅
├── constants/           # 컴포넌트 상수
└── types/               # 타입 정의
```

**장점**:
- 부모-자식 관계 시각적으로 명확
- 네임스페이스 충돌 방지
- 컴포넌트 독립성 유지
- 재사용 가능한 단위로 구조화

### 3. **명확한 관심사 분리** ⭐⭐⭐⭐

**장점**:
각 모듈 내부 구조가 일관됨:
- `actions/` - Server Actions
- `hooks/` - React Hooks
- `ui/` or `components/` - UI 컴포넌트
- `constants/` - 상수
- `utils/` - 유틸리티 함수
- `lib/` - 핵심 로직

**왜 5점이 아닌 4점인가?**

두 가지 일관성 문제로 1점 감점:

1. **UI 디렉토리 역할 혼란** (-0.5점)
   ```
   components/ui/         # 공통 UI?
   module/*/ui/           # 도메인 UI?
   shared/ui/             # 공유 UI?
   ```
   → 새 컴포넌트 배치 위치 결정 시 혼란 발생
   → 상세 내용은 "약점 #1" 참조

2. **모듈 구조 불일치** (-0.5점)
   ```
   module/ai/lib/action/      # ❌ 표준은 actions/
   module/auth/api/           # ❌ 표준은 actions/
   module/github/lib/         # ✅ lib는 맞지만 actions 없음
   ```
   → 일관된 패턴 부재로 팀원마다 다른 구조 사용 가능
   → 상세 내용은 "약점 #6" 참조

**개선 시 5점 달성 가능**: UI 디렉토리 역할 명확화 + 모듈 구조 통일

### 4. **기타 장점**
- ✅ TypeScript strict mode 사용
- ✅ Path alias (`@/*`) 일관되게 사용
- ✅ Next.js App Router 패턴 준수
- ✅ Prisma 커스텀 경로 잘 문서화됨
- ✅ 환경변수 관리 명확

---

## ⚠️ 약점 및 개선 사항 (Weaknesses & Improvements)

### 1. **UI 디렉토리 중복 및 역할 불명확** ❌ (-5점)

**문제점**:
```
components/ui/              # Radix UI 기반 공통 컴포넌트?
module/repository/ui/       # 저장소 UI?
module/review/ui/           # 리뷰 UI?
module/settings/ui/         # 설정 UI?
module/dashboard/ui/        # 대시보드 UI?
shared/ui/                  # 공유 UI?
```

**혼란 요소**:
- `components/ui`와 `module/*/ui`의 차이가 불분명
- `shared/ui`의 역할과 사용처가 불명확
- 새 컴포넌트 작성 시 어디에 배치할지 혼란

**개선 제안**:
```
# 제안 1: 역할 기반 명확한 구분
components/
├── ui/              # 순수 UI 프리미티브 (Button, Input 등)
└── layouts/         # 레이아웃 컴포넌트 (Sidebar, Header 등)

module/[feature]/
├── components/      # 해당 도메인 전용 컴포넌트 (기존 ui/ 제거)
└── widgets/         # 복잡한 기능 단위 컴포넌트

shared/
├── components/      # 여러 모듈에서 사용하는 공통 컴포넌트
└── hooks/           # 공통 hooks
```

**명명 규칙 제안**:
- `components/ui/` → 순수 UI 라이브러리 (Radix, shadcn/ui)
- `module/*/components/` → 도메인 전용 컴포넌트 (`ui/` 제거)
- `shared/components/` → 크로스 도메인 재사용 컴포넌트

### 2. **파일명 규칙 불일치** ❌ (-5점)

**문제점**:
```typescript
// PascalCase
module/repository/components/RepositoryCardSkeleton.tsx

// kebab-case
module/repository/ui/repository-list.tsx
module/settings/ui/profile-form.tsx
module/review/ui/review-list.tsx
```

**개선 제안**:
```
# 제안: kebab-case 통일 (React 커뮤니티 권장)
module/repository/
├── components/
│   ├── repository-card-skeleton.tsx  ✅
│   └── repository-list.tsx           ✅
```

**규칙 정의**:
- 파일명: `kebab-case` (repository-list.tsx)
- 컴포넌트명: `PascalCase` (RepositoryList)
- 디렉토리명: `kebab-case`
- 예외: `app/` 디렉토리 내 Next.js 규칙 (page.tsx, layout.tsx)

### 3. **테스트 구조 완전 부재** ❌ (-5점)

**문제점**:
- 테스트 파일이 전혀 없음
- `module/test/` 디렉토리는 있지만 비어있음
- CI/CD 파이프라인에서 테스트 불가능

**개선 제안**:
```
# 제안 1: Colocated 테스트 (권장)
module/repository/
├── actions/
│   ├── index.ts
│   └── index.test.ts           # 같은 위치에 테스트
├── hooks/
│   ├── use-repositories.ts
│   └── use-repositories.test.tsx
└── components/
    ├── repository-list.tsx
    └── repository-list.test.tsx

# 제안 2: 통합 테스트 디렉토리
__tests__/
├── unit/
│   ├── repository/
│   └── review/
├── integration/
│   ├── api/
│   └── workflows/
└── e2e/
    └── user-flows/
```

**테스트 도구 제안**:
- Unit: Vitest (빠른 단위 테스트)
- Component: React Testing Library
- E2E: Playwright (이미 언급됨)
- Coverage: 최소 70% 목표

### 4. **inngest 디렉토리 위치 부적절** ❌ (-3점)

**문제점**:
```
inngest/             # 루트에 위치
└── functions/       # 백그라운드 작업
```

**개선 제안**:
```
# 제안 1: module로 이동
module/jobs/
├── functions/
│   ├── code-review.ts
│   └── repository-sync.ts
├── types/
└── utils/

# 제안 2: lib로 이동
lib/jobs/
├── inngest-client.ts
├── functions/
└── types/
```

**이유**:
- 백그라운드 작업도 비즈니스 로직이므로 module이 적합
- 또는 인프라 레벨이면 lib가 적합
- 루트는 설정 파일만 두는 것이 일반적

### 5. **shared 디렉토리 역할 불명확** ❌ (-3점)

**문제점**:
```
shared/
└── ui/              # 무엇을 위한 shared?
```

**개선 제안**:
```
shared/
├── components/      # 크로스 도메인 컴포넌트
├── hooks/           # 공통 hooks
├── utils/           # 공통 유틸리티
├── types/           # 공통 타입
└── constants/       # 전역 상수
```

**또는 제거 고려**:
- 현재 `shared/ui`만 있다면 `components/common/`으로 통합 검토
- 실제 여러 모듈에서 공유되는 경우만 shared 사용

### 6. **모듈 내부 구조 불일치** ❌ (-2점)

**문제점**:
```
module/ai/lib/action/     # 왜 lib 안에 action?
module/auth/api/          # 왜 auth만 api?
module/github/lib/        # 일관성 없음
```

**개선 제안**:
```
# 일관된 구조 적용
module/ai/
├── actions/         # lib/action → actions로 통일
├── lib/
│   └── rag.ts       # 핵심 로직만 lib에
└── types/

module/auth/
├── actions/         # api → actions로 통일 (Next.js 패턴)
├── components/
└── utils/

module/github/
├── actions/
├── lib/
│   └── client.ts    # GitHub API 클라이언트
└── types/
```

### 7. **문서화 부족** ❌ (-2점)

**문제점**:
```
docs/                # 거의 비어있음
```

**개선 제안**:
```
docs/
├── architecture/
│   ├── overview.md           # 전체 아키텍처
│   ├── module-structure.md   # 모듈 구조 가이드
│   └── data-flow.md          # 데이터 흐름
├── api/
│   ├── server-actions.md     # Server Actions 문서
│   └── webhooks.md           # Webhook 처리
├── development/
│   ├── setup.md              # 개발 환경 설정
│   ├── conventions.md        # 코딩 규칙
│   └── testing.md            # 테스트 가이드
├── deployment/
│   └── production.md         # 프로덕션 배포
└── ADR/                      # Architecture Decision Records
    ├── 001-module-structure.md
    └── 002-authentication.md
```

---

## 🎯 우선순위별 개선 로드맵

### 🔴 **High Priority** (즉시 개선 필요)

1. **파일명 규칙 통일** (1-2일)
   - [ ] PascalCase 파일을 kebab-case로 변경
   - [ ] 컨벤션 문서화 (`docs/development/conventions.md`)
   - [ ] ESLint 규칙 추가로 강제

2. **테스트 인프라 구축** (3-5일)
   - [ ] Vitest 설정
   - [ ] 첫 번째 단위 테스트 작성 (예: `use-repositories.test.tsx`)
   - [ ] CI/CD에 테스트 추가
   - [ ] Coverage threshold 설정 (70%)

3. **UI 디렉토리 구조 정리** (2-3일)
   - [ ] `module/*/ui/` → `module/*/components/`로 변경
   - [ ] `shared/ui/` 역할 명확화 또는 제거
   - [ ] 가이드 문서 작성

### 🟡 **Medium Priority** (다음 스프린트)

4. **inngest 디렉토리 이동** (1일)
   - [ ] `inngest/` → `module/jobs/` 이동
   - [ ] Import 경로 업데이트
   - [ ] 관련 문서 수정

5. **모듈 구조 일관성 확보** (2일)
   - [ ] `module/ai/lib/action/` → `module/ai/actions/`
   - [ ] `module/auth/api/` → `module/auth/actions/`
   - [ ] 모든 모듈에 표준 구조 적용

6. **문서화 강화** (지속적)
   - [ ] Architecture overview 작성
   - [ ] API 문서 자동 생성 도구 도입
   - [ ] ADR (Architecture Decision Records) 시작

### 🟢 **Low Priority** (백로그)

7. **shared 디렉토리 재구성** (1일)
   - [ ] 역할 재정의
   - [ ] 필요시 구조 확장 (`hooks/`, `utils/` 추가)

8. **개발자 경험 개선** (지속적)
   - [ ] 코드 스니펫 추가
   - [ ] 컴포넌트 생성 스크립트
   - [ ] 모듈 생성 템플릿

---

## 📋 제안하는 최종 디렉토리 구조

```
hreviewer/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Route groups
│   ├── dashboard/
│   └── api/
│
├── components/                   # 글로벌 컴포넌트
│   ├── ui/                       # UI 프리미티브 (Button, Input)
│   ├── layouts/                  # 레이아웃 (Sidebar, Header)
│   └── providers/                # Context Providers
│
├── module/                       # Domain modules
│   ├── auth/
│   │   ├── actions/              # Server Actions
│   │   ├── components/           # UI 컴포넌트 (ui/ 제거)
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── constants/
│   │   └── types/
│   ├── repository/
│   │   ├── actions/
│   │   ├── components/           # repository-list 등
│   │   ├── hooks/
│   │   └── types/
│   ├── review/
│   ├── settings/
│   ├── dashboard/
│   ├── ai/
│   ├── github/
│   └── jobs/                     # inngest에서 이동
│       ├── functions/
│       └── types/
│
├── lib/                          # 공통 라이브러리
│   ├── auth.ts
│   ├── db.ts
│   ├── utils.ts
│   └── generated/prisma/
│
├── shared/                       # 크로스 도메인 공유
│   ├── components/               # 여러 모듈에서 사용
│   ├── hooks/
│   ├── utils/
│   └── types/
│
├── prisma/                       # Database
│   ├── schema.prisma
│   └── migrations/
│
├── docs/                         # 문서화
│   ├── architecture/
│   ├── api/
│   ├── development/
│   └── ADR/
│
├── __tests__/                    # 통합 테스트 (선택사항)
│   ├── integration/
│   └── e2e/
│
├── public/                       # 정적 파일
└── [config files]                # 루트 설정 파일
```

---

## 🔍 체크리스트: 새 기능 추가 시

새로운 기능을 추가할 때 다음을 확인하세요:

- [ ] 적절한 `module/[feature]` 디렉토리 생성
- [ ] 표준 하위 디렉토리 구조 적용 (actions, components, hooks, types)
- [ ] 파일명은 kebab-case 사용
- [ ] 컴포넌트는 PascalCase로 export
- [ ] Server Actions는 `actions/index.ts`에 배치
- [ ] 공통 상수는 `constants/index.ts`에 정의
- [ ] 타입 정의는 `types/index.ts`에 배치
- [ ] 단위 테스트 작성 (*.test.ts)
- [ ] 문서 업데이트 (`docs/` 또는 모듈 README)

---

## 💡 모범 사례 (Best Practices)

### 1. **모듈 독립성 유지**
```typescript
// ❌ 나쁜 예: 다른 모듈 직접 참조
import { getUser } from "@/module/auth/actions";
import { getRepos } from "@/module/repository/actions";

// ✅ 좋은 예: 공통 인터페이스 사용
import { authService } from "@/lib/services/auth";
import { repositoryService } from "@/lib/services/repository";
```

### 2. **Barrel Exports 활용**
```typescript
// module/repository/index.ts
export * from "./actions";
export * from "./hooks";
export * from "./types";

// 사용처
import { useRepositories, getRepositoriesByUserId } from "@/module/repository";
```

### 3. **타입 안전성 강화**
```typescript
// module/repository/types/index.ts
export interface Repository {
  id: string;
  name: string;
  // ...
}

export type RepositoryAction = "sync" | "delete" | "archive";
```

---

## 📈 개선 후 예상 점수

| 카테고리 | 현재 | 개선 후 | 변화 |
|---------|------|---------|------|
| 아키텍처 구조 | 18/20 | 19/20 | +1 |
| 코드 조직화 | 15/20 | 19/20 | +4 |
| 일관성 | 12/20 | 18/20 | +6 |
| 확장성 | 16/20 | 18/20 | +2 |
| 문서화 | 6/10 | 9/10 | +3 |
| 테스트 구조 | 0/10 | 7/10 | +7 |
| **총점** | **75/100** | **90/100** | **+15** |

---

## 🎓 참고 자료

- [Next.js Project Structure Best Practices](https://nextjs.org/docs/app/building-your-application/routing/colocation)
- [Domain-Driven Design in TypeScript](https://khalilstemmler.com/articles/categories/domain-driven-design/)
- [React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/)
- [Testing React Components with Vitest](https://vitest.dev/guide/)

---

**평가자**: Claude Code SuperClaude
**마지막 업데이트**: 2025-12-23
