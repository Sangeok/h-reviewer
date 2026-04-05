# Auth 모듈 소규모 리팩토링 명세

## 개요

`module/auth/` 모듈에 대해 아래 7개 컨벤션 기준으로 분석한 결과, 4건의 리팩토링 대상을 식별했다.

**분석 기준**:
- typescript-clean-code (VAR-04)
- frontend-predictability (원칙 1, 2)
- frontend-cohesion (섹션 1, 4)
- naming-conventions
- frontend-readability (1-1 매직 스트링)
- frontend-coupling (배럴 익스포트)
- frontend-file-naming (kebab-case)

**대상 모듈 구조**:
```
module/auth/
├── index.ts
├── constants/
│   └── index.ts
├── types/
│   └── index.ts
├── lib/
│   └── auth-utils.ts
└── ui/
    ├── login-ui.tsx
    └── parts/
        ├── login-card.tsx
        ├── login-header.tsx
        ├── login-features.tsx
        └── login-footer.tsx
```

**file-naming 검증 결과**: 모든 파일명이 kebab-case 규칙을 준수하고 있어 **위반 사항 없음**.

---

## 이슈 목록

| # | 이슈 | 심각도 | 컨벤션 근거 | 파일 |
|---|------|--------|------------|------|
| 1 | 에러 메시지 하드코딩 | LOW | readability 1-1, cohesion 4 | `ui/login-ui.tsx` |
| 2 | 인라인 SVG Data URI | LOW | clean-code VAR-04, readability 1-1 | `ui/login-ui.tsx` |
| 3 | 와일드카드 배럴 익스포트 | LOW | predictability, coupling | `index.ts` |
| 4 | auth guard에 불필요한 `"use server"` | LOW | predictability 원칙 1, CLAUDE.md 규칙 | `lib/auth-utils.ts` |

---

## 이슈 1: 에러 메시지 하드코딩

**현황**: `login-ui.tsx:22`에 한국어 에러 메시지가 컴포넌트에 직접 기입되어 있다.

```typescript
// ui/login-ui.tsx:22
toast.error("GitHub 로그인에 실패했습니다. 다시 시도해주세요.");
```

모듈 내 다른 모든 UI 문자열(`brandName`, `welcomeTitle`, `githubLoginButton` 등)은 `constants/index.ts`의 `LOGIN_STRINGS`에 추출되어 있다. 에러 메시지만 유일하게 컴포넌트에 인라인되어 모듈 자체의 패턴 일관성을 깨뜨린다.

**컨벤션 근거**: 
- readability 1-1: 매직 스트링에 이름 붙이기
- cohesion 4: 관련 파일(상수-컴포넌트) 코로케이션 원칙

**개선 방안**:

`constants/index.ts`에 에러 메시지 추가:
```typescript
export const LOGIN_STRINGS = {
  // ... 기존 키 유지
  loginError: "GitHub 로그인에 실패했습니다. 다시 시도해주세요.",
} as const;
```

`login-ui.tsx`에서 상수 참조:
```typescript
import { LOGIN_ANIMATION, LOGIN_STRINGS } from "../constants";
// ...
toast.error(LOGIN_STRINGS.loginError);
```

**변경 파일**: `constants/index.ts`, `ui/login-ui.tsx`

---

## 이슈 2: 인라인 SVG Data URI

**현황**: `login-ui.tsx:33`에 200+ 문자 길이의 noise pattern SVG data URI가 JSX에 인라인되어 있다.

```typescript
// ui/login-ui.tsx:31-35
<div
  className="pointer-events-none absolute inset-0 opacity-[0.015]"
  style={{
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
  }}
/>
```

긴 data URI 문자열이 JSX 내부에 있어 코드 스캔 시 가독성을 저해한다.

**컨벤션 근거**:
- clean-code VAR-04: 검색 가능한 이름 사용 (매직 문자열 금지)
- readability 1-1: 의미 없는 값에 명확한 이름 부여

**개선 방안**:

`constants/index.ts`에 배경 상수 추가:
```typescript
export const LOGIN_BACKGROUND = {
  noiseSvg: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
} as const;
```

`login-ui.tsx`에서 상수 참조:
```typescript
import { LOGIN_ANIMATION, LOGIN_BACKGROUND } from "../constants";
// ...
<div
  className="pointer-events-none absolute inset-0 opacity-[0.015]"
  style={{ backgroundImage: LOGIN_BACKGROUND.noiseSvg }}
/>
```

**변경 파일**: `constants/index.ts`, `ui/login-ui.tsx`

---

## 이슈 3: 와일드카드 배럴 익스포트

**현황**: `index.ts`에서 와일드카드 re-export를 사용한다.

```typescript
// index.ts
export * from "./constants";       // LOGIN_FEATURES, LOGIN_STRINGS, LOGIN_ANIMATION 전체 노출
export * from "./lib/auth-utils";  // requireAuth, requireUnAuth 노출
```

**문제 분석**:

모듈 외부 소비자 분석 (grep 검증 완료):

| export | 외부 사용처 |
|--------|-----------|
| `requireAuth` | `app/page.tsx`, `app/dashboard/layout.tsx` |
| `requireUnAuth` | `app/(auth)/login/page.tsx` |
| `LoginUI` | `app/(auth)/login/page.tsx` |
| `LoginFeature` (type) | 없음 |
| `LOGIN_FEATURES` | 없음 (모듈 내부 전용) |
| `LOGIN_STRINGS` | 없음 (모듈 내부 전용) |
| `LOGIN_ANIMATION` | 없음 (모듈 내부 전용) |

`LOGIN_FEATURES`, `LOGIN_STRINGS`, `LOGIN_ANIMATION`은 모듈 내부(`ui/parts/*`)에서만 사용되지만, 와일드카드 export로 인해 모듈 공개 API에 불필요하게 노출된다. 향후 `constants/index.ts`에 새 상수를 추가하면 의도치 않게 외부에 공개된다.

**컨벤션 근거**:
- predictability: 모듈 공개 API가 명시적이지 않음
- coupling: 내부 전용 상수가 외부에 자동 노출

**개선 방안**:

```typescript
// index.ts
// ===== Constants =====
// LOGIN_FEATURES, LOGIN_STRINGS, LOGIN_ANIMATION은 모듈 내부 전용 (외부 export 불필요)

// ===== Types =====
export type { LoginFeature } from "./types";

// ===== Auth Guards =====
export { requireAuth, requireUnAuth } from "./lib/auth-utils";

// ===== UI Components =====
export { default as LoginUI } from "./ui/login-ui";
```

**변경 파일**: `index.ts`

---

## 이슈 4: auth guard에 불필요한 `"use server"` 지시어

**현황**: `lib/auth-utils.ts`에 `"use server"` 지시어가 있다.

```typescript
// lib/auth-utils.ts
"use server";

import { requireAuthSession } from "@/lib/server-utils";
import { redirect } from "next/navigation";

export async function requireAuth() { ... }
export async function requireUnAuth() { ... }
```

**문제 분석**:

`"use server"` 지시어는 **클라이언트 컴포넌트에서 호출 가능한 서버 액션**을 선언하는 용도다. 그러나 `requireAuth`/`requireUnAuth`의 호출부 3곳은 모두 서버 컴포넌트다:

| 호출부 | 파일 유형 |
|--------|----------|
| `app/page.tsx` | 서버 컴포넌트 |
| `app/(auth)/login/page.tsx` | 서버 컴포넌트 |
| `app/dashboard/layout.tsx` | 서버 컴포넌트 |

서버 컴포넌트 간 함수 호출에는 `"use server"` 지시어가 불필요하다. 또한 이 함수들은 데이터 변경(mutation)이 아닌 세션 검증 + 리다이렉트를 수행하는 **auth guard** 유틸리티로, 의미적으로도 서버 액션이 아니다.

추가로 CLAUDE.md에서 "Server Actions Pattern: Each module's server-side operations are in `actions/` directories"로 정의하고 있어, `"use server"` 파일이 `lib/`에 위치하는 것 자체가 규칙 불일치다. 단, 이전 리팩토링(2026-02)에서 의도적으로 `lib/`에 배치한 결정이 있으므로 **파일 위치는 유지**하고 `"use server"` 지시어만 제거한다.

**컨벤션 근거**:
- predictability 원칙 1: 함수의 실제 역할(guard)과 마커(`"use server"` = 서버 액션) 불일치
- CLAUDE.md: 서버 액션은 `actions/` 디렉토리 규칙

**개선 방안**:

```typescript
// lib/auth-utils.ts
import { requireAuthSession } from "@/lib/server-utils";
import { redirect } from "next/navigation";

export async function requireAuth() {
  try {
    return await requireAuthSession();
  } catch {
    redirect("/login");
  }
}

export async function requireUnAuth() {
  try {
    await requireAuthSession();
    redirect("/dashboard");
  } catch {
    return null;
  }
}
```

**변경 파일**: `lib/auth-utils.ts`

**주의**: `redirect()`와 `requireAuthSession()`은 서버 컴포넌트 컨텍스트에서 `"use server"` 없이도 정상 동작한다. `requireAuthSession()` 자체가 `@/lib/server-utils`에서 제공하는 서버 전용 함수이며, `redirect()`는 Next.js의 서버 전용 API다.

---

## 비이슈 판정

아래 항목은 7개 컨벤션 기준으로 검토한 결과 **위반 사항 없음**으로 판정했다.

| # | 항목 | 기준 | 판정 |
|---|------|------|------|
| 1 | 파일명 kebab-case | file-naming | ✅ 모든 파일 준수 (`login-ui.tsx`, `auth-utils.ts` 등) |
| 2 | 함수명 camelCase / PascalCase | naming-conventions | ✅ `requireAuth`, `handleGithubLogin`, `LoginUI` 등 |
| 3 | 상수 UPPER_SNAKE_CASE | naming-conventions | ✅ `LOGIN_FEATURES`, `LOGIN_STRINGS`, `LOGIN_ANIMATION` |
| 4 | Props 인터페이스 `[Component]Props` | naming-conventions | ✅ `LoginCardProps` |
| 5 | Boolean `is` 접두사 | readability 1-3 | ✅ `isLoading` |
| 6 | 이벤트 핸들러 `handle*` | readability 1-4 | ✅ `handleGithubLogin` |
| 7 | 도메인별 디렉토리 구조 | cohesion 1 | ✅ types/constants/ui/lib 코로케이션 |
| 8 | 상태 코로케이션 | cohesion 3 | ✅ `isLoading`이 사용처(`LoginUI`)에 위치 |
| 9 | parts/ 패턴 | component-parts | ✅ `ui/parts/` 하위 4개 컴포넌트 |
| 10 | 모듈 결합도 | coupling | ✅ 외부 소비자 3개 파일만, 낮은 결합도 |
| 11 | 숨은 부수효과 없음 | predictability 1 | ✅ 함수 이름이 동작을 정확히 설명 |

---

## 실행 순서

이슈 간 의존성 없음. 모든 이슈를 독립적으로 또는 단일 커밋으로 적용 가능.

```
권장 순서: 이슈 3 → 이슈 4 → 이슈 1 → 이슈 2
            (구조적 변경 먼저, 내용 변경 나중에)
```

| 순서 | 이슈 | 이유 |
|------|------|------|
| 1 | 이슈 3 (배럴 익스포트) | 모듈 공개 API 정의가 다른 변경의 기반 |
| 2 | 이슈 4 (`"use server"` 제거) | 독립적 변경, 빌드 검증 필요 |
| 3 | 이슈 1 (에러 메시지) | 상수 파일 수정 |
| 4 | 이슈 2 (SVG 추출) | 상수 파일 수정 (이슈 1과 같은 파일) |

---

## 검증 방법

```bash
npx tsc --noEmit    # 타입 체크
npm run build       # 빌드 검증
npm run lint        # 린트 검증
```

---

## 리스크 및 주의사항

1. **이슈 3**: `LOGIN_FEATURES` 등을 외부에서 직접 import하는 코드가 없음을 grep으로 확인 완료 (CLAUDE.md의 예시 코드는 런타임 코드가 아님)
2. **이슈 4**: `"use server"` 제거 후 `npx tsc --noEmit` 및 `npm run build`로 컴파일 검증 필수
3. **범위 밖**: `module/payment/lib/subscription.ts`에도 동일한 이슈 4 패턴(`"use server"` in `lib/`) 존재하나 본 명세 범위 밖
