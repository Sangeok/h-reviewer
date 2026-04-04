# Dashboard 모듈 리팩토링 명세

## 개요

`module/dashboard/` 모듈에 대해 아래 7개 컨벤션 기준으로 분석한 결과, 12건의 리팩토링 대상을 식별했다.

**분석 기준**:
- typescript-clean-code (VAR-04, VAR-07, VAR-09)
- frontend-predictability (원칙 1, 2, 3, 7)
- frontend-cohesion (섹션 1, 4, 5)
- naming-conventions (Enum-like 객체, 상수)
- frontend-readability (1-1 매직 넘버, 1-3 Boolean)
- frontend-coupling (섹션 2 책임 분리)
- frontend-file-naming (kebab-case)

**대상 모듈 구조**:
```
module/dashboard/
├── index.ts
├── actions/
│   ├── index.ts
│   ├── get-dashboard-stats.ts
│   ├── get-contribution-stats.ts
│   └── get-monthly-activity.ts
├── lib/
│   ├── get-dashboard-github-context.ts
│   └── parse-contribution-calendar.ts
├── types/
│   └── index.ts
└── ui/
    ├── stats-overview.tsx
    └── parts/
        └── contribution-graph.tsx
```

**file-naming 검증 결과**: 모든 파일명이 kebab-case 규칙을 준수하고 있어 **위반 사항 없음**.

---

## 이슈 목록

| # | 이슈 | 심각도 | 컨벤션 근거 | 파일 |
|---|------|--------|------------|------|
| 1 | 중복 GitHub API 호출 | HIGH | cohesion 5, coupling 2 | `actions/*.ts`, `ui/stats-overview.tsx` |
| 2 | 에러 반환 타입 불일치 | HIGH | predictability 원칙 3 | `actions/*.ts` |
| 3 | getDashboardGithubContext 숨은 부수효과 | MEDIUM | predictability 원칙 1, 2 | `lib/get-dashboard-github-context.ts` |
| 4 | getMonthlyActivity dead code | MEDIUM | cohesion 1 | `actions/get-monthly-activity.ts` |
| 5 | 타입 정의 위치 불일치 | MEDIUM | cohesion 4 | `lib/get-dashboard-github-context.ts`, `types/index.ts` |
| 6 | github 모듈과 auth 패턴 중복 | MEDIUM | coupling 1 (DRY) | `lib/get-dashboard-github-context.ts` |
| 7 | CONTRIBUTION_LEVEL_MAP 네이밍 | LOW | naming-conventions (Enum-like), clean-code VAR-09 | `actions/get-contribution-stats.ts` |
| 8 | contribution-graph 매직 넘버 | LOW | readability 1-1, clean-code VAR-04 | `ui/parts/contribution-graph.tsx` |
| 9 | statCards 인라인 타입 | LOW | clean-code VAR-07 | `ui/stats-overview.tsx` |
| 10 | 테마 설정 중복 | LOW | readability (DRY) | `ui/parts/contribution-graph.tsx` |
| 11 | colorScheme 하드코딩 | LOW | predictability 원칙 5 | `ui/parts/contribution-graph.tsx` |

---

## Phase 1: 핵심 데이터 구조 (HIGH)

### 이슈 1: 중복 GitHub API 호출

**현황**: `stats-overview.tsx:9`에서 두 액션을 병렬 호출한다.

```typescript
// ui/stats-overview.tsx
const [stats, contributionStats] = await Promise.all([
  getDashboardStats(),
  getContributionStats(),
]);
```

두 액션 모두 내부에서 동일한 호출 체인을 독립적으로 실행한다:

```
getDashboardStats()        getContributionStats()
  ↓                          ↓
getDashboardGithubContext()  getDashboardGithubContext()   ← 2회 중복
  ↓                          ↓
requireAuthSession()         requireAuthSession()          ← 2회 중복
prisma.account.findFirst()   prisma.account.findFirst()    ← 2회 중복
octokit.users.getAuth()      octokit.users.getAuth()       ← 2회 중복
  ↓                          ↓
fetchUserContribution()      fetchUserContribution()       ← 2회 중복 (GitHub GraphQL)
parseContributionCalendar()  parseContributionCalendar()   ← 2회 중복
```

**결과**: 대시보드 로드 시 동일한 GitHub API 호출이 최소 4회(REST 2회 + GraphQL 2회) 중복 발생.

**위반 컨벤션**:
- `frontend-cohesion` 섹션 5: 데이터 요청을 기능 단위로 통합 배치
- `frontend-coupling` 섹션 2: 하나의 책임으로 분리

**제안**: 단일 오케스트레이터 액션으로 통합

```typescript
// actions/get-dashboard-data.ts
"use server";

import prisma from "@/lib/db";
import { fetchUserContribution } from "@/module/github";
import { getDashboardGithubContext } from "../lib/get-dashboard-github-context";
import { parseContributionCalendar } from "../lib/parse-contribution-calendar";
import type { ContributionStats, DashboardStats } from "../types";

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  totalRepos: 0,
  totalContributions: 0,
  totalPRs: 0,
  totalReviews: 0,
};

const EMPTY_CONTRIBUTION_STATS: ContributionStats = {
  contributions: [],
  totalContributions: 0,
};

const ContributionLevel = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
} as const;

interface DashboardData {
  stats: DashboardStats;
  contributionStats: ContributionStats;
}

export async function getDashboardData(): Promise<DashboardData> {
  try {
    const { userId, accessToken, username, octokit } =
      await getDashboardGithubContext();

    // 1회만 호출
    const [totalRepos, totalReviews, rawCalendar, prsResult] =
      await Promise.all([
        prisma.repository.count({ where: { userId } }),
        prisma.review.count({ where: { repository: { userId } } }),
        fetchUserContribution(accessToken, username),
        octokit.rest.search.issuesAndPullRequests({
          q: `author:${username} type:pr`,
          per_page: 1,
        }),
      ]);

    const calendar = parseContributionCalendar(rawCalendar);
    const totalContributions = calendar?.totalContributions ?? 0;
    const totalPRs = prsResult.data.total_count;

    const stats: DashboardStats = {
      totalRepos,
      totalContributions,
      totalPRs,
      totalReviews,
    };

    const contributions = calendar
      ? calendar.weeks.flatMap((week) =>
          week.contributionDays.map((day) => ({
            date: day.date,
            count: day.contributionCount,
            level:
              ContributionLevel[
                (day.contributionLevel ?? "NONE") as keyof typeof ContributionLevel
              ] ?? 0,
          }))
        )
      : [];

    const contributionStats: ContributionStats = {
      contributions,
      totalContributions,
    };

    return { stats, contributionStats };
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return {
      stats: EMPTY_DASHBOARD_STATS,
      contributionStats: EMPTY_CONTRIBUTION_STATS,
    };
  }
}
```

```typescript
// ui/stats-overview.tsx (변경 후)
const { stats, contributionStats } = await getDashboardData();
```

**효과**: GitHub API 호출 4회 → 2회 (REST 1회 + GraphQL 1회). DB 쿼리 4회 → 3회.

---

### 이슈 2: 에러 반환 타입 불일치

**현황**: 동일 레이어(server actions)의 3개 함수가 에러 시 서로 다른 타입을 반환한다.

| 액션 | 에러 반환값 | 타입 |
|------|-----------|------|
| `getDashboardStats()` | `EMPTY_DASHBOARD_STATS` | `DashboardStats` (유효 객체) |
| `getContributionStats()` | `null` | `ContributionStats \| null` |
| `getMonthlyActivity()` | `[]` | `MonthlyActivity[]` (빈 배열) |

**위반 컨벤션**: `frontend-predictability` 원칙 3 — "같은 레이어의 반환 타입 통일하기"

> 같은 역할의 함수/Hook이 반환 타입이 다르면 호출부가 매번 분기된다.

**제안**: 모든 액션이 에러 시 해당 타입의 빈(empty) 기본값을 반환하는 패턴으로 통일한다.

이슈 1의 오케스트레이터 방식 채택 시, 단일 에러 경계에서 통일된 기본값을 반환하므로 자연스럽게 해결된다.

개별 액션 유지 시:

```typescript
// get-contribution-stats.ts — Before
catch (error) {
  console.error("Error fetching contribution stats:", error);
  return null;  // ← null 반환
}

// get-contribution-stats.ts — After
const EMPTY_CONTRIBUTION_STATS: ContributionStats = {
  contributions: [],
  totalContributions: 0,
};

catch (error) {
  console.error("Error fetching contribution stats:", error);
  return EMPTY_CONTRIBUTION_STATS;  // ← 유효한 빈 객체 반환
}
```

**효과**: UI 컴포넌트에서 null 체크 분기 제거 가능. `ContributionGraph` props에서 `stats: ContributionStats | null` → `stats: ContributionStats`로 단순화.

---

## Phase 2: 크로스커팅 관심사 (MEDIUM)

### 이슈 3: getDashboardGithubContext 숨은 부수효과

**현황**: `lib/get-dashboard-github-context.ts`

```typescript
export async function getDashboardGithubContext(): Promise<DashboardGithubContext> {
  const session = await requireAuthSession();        // 1. auth 검증 (실패 시 redirect)
  const userId = session.user.id;

  const account = await prisma.account.findFirst({   // 2. DB 조회
    where: { userId, providerId: "github" },
    select: { accessToken: true },
  });

  if (!account?.accessToken) {
    throw new Error("Github access token not found"); // 3. 예외 발생
  }

  const octokit = new Octokit({ auth: accessToken });
  const { data: user } = await octokit.rest.users.getAuthenticated(); // 4. GitHub API 호출

  return { userId, accessToken, username: user.login, octokit };
}
```

**위반 컨벤션**: `frontend-predictability` 원칙 1 ("숨은 로직 드러내기"), 원칙 2 ("이름이 동작을 설명하게 만들기")

함수명 `getDashboardGithubContext`는 단순 데이터 조회를 시사하지만, 실제로는:
- 인증 세션 검증 (실패 시 redirect 부수효과)
- DB 쿼리 실행
- GitHub REST API 호출 (네트워크 I/O)
- 예외 발생 가능

**제안**:

1. **함수명 변경**: `resolveAuthenticatedGithubContext()` — auth 검증 + API 호출이 포함됨을 이름으로 드러낸다.

2. **불필요한 API 호출 제거 검토**: `octokit.rest.users.getAuthenticated()`는 username을 얻기 위해서만 호출된다. DB에서 직접 조회할 수 있다면 API 호출을 제거할 수 있다.

   **단, 현재 `Account` 모델에 `username` 필드가 없다.** Prisma 스키마 확인 결과:
   ```prisma
   model Account {
     id, accountId, providerId, userId, accessToken, refreshToken,
     idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope,
     password, createdAt, updatedAt
     // ← username 필드 없음
   }
   ```

   이 최적화를 적용하려면 **사전 작업이 필요**하다:
   - `prisma/schema.prisma`의 `Account` 모델에 `username String?` 필드 추가
   - `npx prisma migrate dev --name add-account-username` 마이그레이션 실행
   - OAuth 가입 플로우에서 GitHub username을 Account에 저장하도록 수정

   **사전 작업 없이 적용 가능한 대안**: `getAuthenticated()` 호출을 유지하되, 이슈 1의 오케스트레이터 패턴으로 호출 횟수를 1회로 제한한다. 현재 구조에서는 이것이 가장 현실적인 접근이다.

---

### 이슈 4: getMonthlyActivity dead code

**현황**: `actions/get-monthly-activity.ts` (134줄)

- `actions/index.ts`에서 barrel export
- `module/dashboard/index.ts`에서 모듈 public API로 재export
- `MonthlyActivity` 타입도 `types/index.ts`에서 export

**grep 검증 결과**: `getMonthlyActivity`를 import하거나 호출하는 파일이 정의/문서 파일 외에 없음.

```
Found 3 files:
  docs/conventions/naming-conventions.md        ← 예시 코드
  module/dashboard/actions/get-monthly-activity.ts  ← 정의 파일
  docs/archive/2024-12-refactoring-recommendations.md  ← 아카이브
```

**위반 컨벤션**: `frontend-cohesion` 섹션 1 — 사용되지 않는 코드가 모듈 표면적을 넓힘

**제안**:
- git log로 마지막 사용 시점 확인
- dead code 확인 시 파일 삭제 및 barrel export에서 제거
- `MonthlyActivity` 타입은 다른 곳에서 미사용 시 함께 제거
- 향후 기능으로 보류할 경우: barrel export에서 제거하고 TODO 주석 추가

---

### 이슈 5: 타입 정의 위치 불일치

**현황**:

| 타입 | 정의 위치 | 사용 범위 |
|------|----------|----------|
| `DashboardStats`, `ContributionStats` 등 7개 | `types/index.ts` | 모듈 전체 |
| `DashboardGithubContext` | `lib/get-dashboard-github-context.ts` | 3개 액션 파일 |
| `MonthlyStats`, `MonthBucket` | `actions/get-monthly-activity.ts` | 해당 파일 내부만 |

`DashboardGithubContext`는 모듈 내 3개 액션 파일에서 공유되는 타입이지만, `types/index.ts`가 아닌 `lib/` 파일에 정의되어 있다.

**위반 컨벤션**: `frontend-cohesion` 섹션 4 — 타입 파일 코로케이션

> 관련 파일이 같은 디렉토리에 있어야 수정 범위가 한눈에 보인다.

**제안**: `DashboardGithubContext`를 `types/index.ts`로 이동.

```typescript
// types/index.ts에 추가
import type { Octokit } from "octokit";

export interface DashboardGithubContext {
  userId: string;
  accessToken: string;
  username: string;
  octokit: Octokit;
}
```

```typescript
// lib/get-dashboard-github-context.ts 변경
import type { DashboardGithubContext } from "../types";
```

---

### 이슈 6: github 모듈과 auth 패턴 중복

**현황**: 두 함수가 동일한 auth + DB 조회 패턴을 독립적으로 구현한다.

```typescript
// module/github/lib/github.ts (lines 5-20)
export const getGithubAccessToken = async () => {
  const session = await requireAuthSession();
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "github" },
  });
  if (!account?.accessToken) throw new Error("Github access token not found");
  return account.accessToken;
};

// module/dashboard/lib/get-dashboard-github-context.ts (lines 12-28)
export async function getDashboardGithubContext() {
  const session = await requireAuthSession();
  const userId = session.user.id;
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "github" },
    select: { accessToken: true },
  });
  if (!account?.accessToken) throw new Error("Github access token not found");
  // ... 추가로 Octokit 생성 + getAuthenticated() 호출
}
```

**위반 컨벤션**: `frontend-coupling` 섹션 1 (DRY 원칙)

**제안**: 공통 auth+DB 로직을 저수준 함수로 추출하여 양쪽 모듈이 재사용하도록 변경.

**단순 재사용이 불가능한 이유**: `getGithubAccessToken()`은 내부에서 `requireAuthSession()`을 호출한 뒤 `accessToken`만 반환한다. dashboard는 `userId`도 필요하므로, `getGithubAccessToken()`을 그대로 호출하면 `requireAuthSession()`이 2회 중복 실행된다.

```typescript
// ❌ 잘못된 접근 — requireAuthSession() 이중 호출
export async function resolveAuthenticatedGithubContext() {
  const session = await requireAuthSession();       // 1회차
  const userId = session.user.id;
  const accessToken = await getGithubAccessToken(); // 내부에서 requireAuthSession() 2회차
  // ...
}
```

**해결 방법**: github 모듈에 `userId`와 `accessToken`을 함께 반환하는 저수준 함수를 추가하고, 기존 `getGithubAccessToken`도 이를 재사용하도록 리팩토링한다.

```typescript
// module/github/lib/github.ts — 저수준 함수 추가
export async function getAuthenticatedGithubAccount() {
  const session = await requireAuthSession();
  const userId = session.user.id;

  const account = await prisma.account.findFirst({
    where: { userId, providerId: "github" },
    select: { accessToken: true },
  });

  if (!account?.accessToken) {
    throw new Error("Github access token not found");
  }

  return { userId, accessToken: account.accessToken };
}

// 기존 함수는 래퍼로 유지 (외부 호출부 변경 최소화)
export const getGithubAccessToken = async () => {
  const { accessToken } = await getAuthenticatedGithubAccount();
  return accessToken;
};
```

```typescript
// module/dashboard/lib/get-dashboard-github-context.ts — After
import { getAuthenticatedGithubAccount, createOctokitClient } from "@/module/github";
import type { DashboardGithubContext } from "../types";

export async function resolveAuthenticatedGithubContext(): Promise<DashboardGithubContext> {
  const { userId, accessToken } = await getAuthenticatedGithubAccount();
  const octokit = createOctokitClient(accessToken);
  const { data: user } = await octokit.rest.users.getAuthenticated();

  return { userId, accessToken, username: user.login, octokit };
}
```

이 방식으로 `requireAuthSession()`과 `prisma.account.findFirst()` 모두 1회만 호출된다.

---

## Phase 3: 코드 품질 (LOW)

### 이슈 7: CONTRIBUTION_LEVEL_MAP 네이밍

**현황**: `actions/get-contribution-stats.ts:8-14`

```typescript
const CONTRIBUTION_LEVEL_MAP: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};
```

**위반 컨벤션**:
- `naming-conventions` — Enum-like 객체명은 PascalCase, 키는 UPPER_SNAKE_CASE
- `typescript-clean-code` VAR-09 — `as const` 패턴 사용 (enum 지양)

현재 `CONTRIBUTION_LEVEL_MAP`은 UPPER_SNAKE_CASE이며, `Record<string, number>` 명시 타입이 `as const`의 리터럴 타입 추론을 무력화한다.

**제안**:

```typescript
// Before — 선언
const CONTRIBUTION_LEVEL_MAP: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  ...
};

// Before — 사용
level: CONTRIBUTION_LEVEL_MAP[day.contributionLevel ?? "NONE"] ?? 0,

// After — 선언
const ContributionLevel = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
} as const;

// After — 사용 (타입 캐스트 필수)
level: ContributionLevel[
  (day.contributionLevel ?? "NONE") as keyof typeof ContributionLevel
] ?? 0,
```

**주의: `as const` 적용 시 사용처 수정 필수.** `Record<string, number>`를 제거하면 임의 `string`으로 인덱싱할 수 없다. `as keyof typeof ContributionLevel` 타입 캐스트를 추가하지 않으면 TypeScript 컴파일 에러가 발생한다. Phase 1(이슈 1)의 오케스트레이터를 먼저 적용한 경우 해당 파일이 대체되므로 이 수정은 불필요하다.

---

### 이슈 8: contribution-graph 매직 넘버

**현황**: `ui/parts/contribution-graph.tsx:33-36`

```tsx
<ActivityCalendar
  data={stats.contributions}
  colorScheme="dark"
  blockSize={14}
  blockMargin={4}
  blockRadius={3}
  fontSize={11}
  showWeekdayLabels
  // ...
/>
```

**위반 컨벤션**:
- `frontend-readability` 1-1: 매직 넘버에 이름 붙이기
- `typescript-clean-code` VAR-04: 검색 가능한 이름 사용

**제안**:

```typescript
const CALENDAR_CONFIG = {
  BLOCK_SIZE: 14,
  BLOCK_MARGIN: 4,
  BLOCK_RADIUS: 3,
  FONT_SIZE: 11,
} as const;

// 사용
<ActivityCalendar
  blockSize={CALENDAR_CONFIG.BLOCK_SIZE}
  blockMargin={CALENDAR_CONFIG.BLOCK_MARGIN}
  blockRadius={CALENDAR_CONFIG.BLOCK_RADIUS}
  fontSize={CALENDAR_CONFIG.FONT_SIZE}
  // ...
/>
```

---

### 이슈 9: statCards 인라인 타입

**현황**: `ui/stats-overview.tsx:11-16`

```typescript
const statCards: Array<{
  title: string;
  value: number;
  description: string;
  icon: typeof GitBranch;
}> = [ ... ];
```

**위반 컨벤션**: `typescript-clean-code` VAR-07 — 불필요한 인라인 타입 대신 명명된 타입 사용

**제안**: 파일 상단에 named type 추출 (이 타입은 해당 파일에서만 사용되므로 `types/index.ts` 이동 불필요).

```typescript
interface StatCardConfig {
  title: string;
  value: number;
  description: string;
  icon: typeof GitBranch;
}

const statCards: StatCardConfig[] = [ ... ];
```

---

### 이슈 10 + 11: 테마 설정 중복 및 colorScheme 하드코딩

**현황**: `ui/parts/contribution-graph.tsx:32, 38-53`

```tsx
<ActivityCalendar
  colorScheme="dark"   // ← 하드코딩: light 테마 배열 미사용
  theme={{
    light: [                              // ← 실제로 사용되지 않음
      "var(--color-secondary)",           // 유일한 차이점
      "var(--color-ring)",
      "var(--color-chart-2)",
      "var(--color-primary)",
      "var(--color-primary-hover)",
    ],
    dark: [
      "var(--color-card)",                // 유일한 차이점
      "var(--color-ring)",
      "var(--color-chart-2)",
      "var(--color-primary)",
      "var(--color-primary-hover)",
    ],
  }}
/>
```

**문제**:
1. `colorScheme="dark"` 하드코딩으로 `light` 배열이 dead code
2. 두 배열에서 4/5 값이 동일 (1번째 색상만 다름)

**위반 컨벤션**:
- `frontend-readability` (DRY)
- `frontend-predictability` 원칙 5 — 컴포넌트 의존성 명시

**제안**:

```typescript
const CONTRIBUTION_THEME_COLORS = [
  "var(--color-card)",
  "var(--color-ring)",
  "var(--color-chart-2)",
  "var(--color-primary)",
  "var(--color-primary-hover)",
] as const;

// 사용
<ActivityCalendar
  colorScheme="dark"
  theme={{
    dark: [...CONTRIBUTION_THEME_COLORS],
  }}
  // ...
/>
```

앱이 라이트/다크 테마 전환을 지원한다면, `colorScheme`을 테마 context에서 읽도록 개선한다.

---

## 비이슈 판정

### statCards 설정 혼재 (원래 이슈 12)

`statCards` 배열이 `stats-overview.tsx` 컴포넌트 내부에 인라인으로 정의되어 있지만, 런타임 `stats` 값에 의존하므로 순수 상수로 분리할 수 없다. 컴포넌트와 함께 변경되는 설정이므로 현재 위치가 `frontend-cohesion`의 코로케이션 원칙에 부합한다.

**결론**: 리팩토링 불필요.

---

## 실행 순서

```
Phase 1 (HIGH) — 핵심 데이터 구조
  ├── 이슈 1: 중복 API 호출 → getDashboardData 오케스트레이터 생성
  └── 이슈 2: 에러 반환 통일 → Phase 1에서 자연 해소

Phase 2 (MEDIUM) — 크로스커팅 관심사
  ├── 이슈 6: github 모듈 중복 패턴 → getAuthenticatedGithubAccount 저수준 함수 추출
  │   ⚠️ github 모듈 변경 수반 (module/github/lib/github.ts)
  ├── 이슈 3: 함수명 변경 → resolveAuthenticatedGithubContext
  │   ⚠️ Account 모델에 username 없음 → getAuthenticated() API 호출 유지 필수
  ├── 이슈 4: dead code 제거 → getMonthlyActivity 삭제
  └── 이슈 5: 타입 이동 → DashboardGithubContext → types/index.ts

Phase 3 (LOW) — 코드 품질
  ├── 이슈 7: ContributionLevel as const 리네이밍
  │   ⚠️ Phase 1 미적용 시 사용처에 as keyof typeof 캐스트 추가 필수
  ├── 이슈 8: CALENDAR_CONFIG 상수 추출
  ├── 이슈 9: StatCardConfig 타입 추출
  └── 이슈 10+11: 테마 설정 정리
```

### Phase 간 의존성

| 이슈 | 선행 조건 | 비고 |
|------|----------|------|
| 이슈 7 (ContributionLevel) | Phase 1 적용 시 별도 수정 불필요 | Phase 1 미적용 시 사용처 타입 캐스트 추가 필수 |
| 이슈 6 (auth 중복) | 없음 | github 모듈에 `getAuthenticatedGithubAccount` 추가 선행 |
| 이슈 3 (username DB 조회) | Account 스키마 마이그레이션 | 마이그레이션 없이는 `getAuthenticated()` 유지 |

---

## 리스크 및 주의사항

1. **Server Action 직렬화**: `getDashboardData` 반환값이 Next.js 직렬화 호환되어야 한다. 모든 반환 타입이 plain object이므로 문제없음.
2. **모듈 Public API 변경**: `getDashboardStats`/`getContributionStats` 개별 export 제거 시, 외부 소비자 유무 확인 필요. 현재 `app/dashboard/page.tsx`만 `StatsOverview`를 import하므로 영향 범위 최소.
3. **GitHub API Rate Limit**: 이슈 1 해결로 API 호출 50% 감소 → 프로덕션 안정성 직접 개선.
4. **getMonthlyActivity 삭제**: git log로 마지막 사용 시점 확인 후 삭제. 향후 기능 계획 여부 팀 확인 권장.
5. **테스트 부재**: 현재 dashboard 모듈에 테스트 파일 없음. Phase 1(데이터 구조 변경) 실행 시 통합 테스트 병행 권장.
6. **병렬 실행 유지**: 오케스트레이터 내부에서 독립적인 DB 쿼리와 API 호출은 `Promise.all`로 병렬 실행을 유지해야 한다.
7. **github 모듈 변경 수반 (이슈 6)**: `getAuthenticatedGithubAccount` 함수 추가는 github 모듈의 public API를 확장한다. github 모듈을 사용하는 다른 모듈(repository, review, suggestion 등)에는 영향 없으나, 팀 리뷰 범위가 dashboard 모듈을 넘어선다.
8. **Account 스키마에 username 없음 (이슈 3)**: `getAuthenticated()` API 호출 제거를 위해서는 DB 마이그레이션이 선행되어야 한다. 마이그레이션 없이는 현재의 API 호출 방식을 유지해야 한다.
9. **이슈 7 단독 적용 시 컴파일 에러**: `as const` 적용 후 `Record<string, number>` 제거 시, 사용처에 `as keyof typeof ContributionLevel` 타입 캐스트를 반드시 추가해야 한다. Phase 1(오케스트레이터)을 먼저 적용하면 해당 파일이 대체되므로 이 문제는 발생하지 않는다.
