# HReviewer Frontend Refactoring Analysis

> 분석일: 2026-04-06
> 분석 대상: 85+ TypeScript/TSX 파일 (module/, components/, app/, lib/, shared/)
> 적용 Skill: typescript-clean-code, frontend-predictability, frontend-cohesion, naming-conventions, frontend-readability, frontend-coupling, frontend-file-naming

---

## Executive Summary

| 심각도 | 건수 | 설명 |
|--------|------|------|
| **Critical** | 2 | 구조적 개선 필요 — 즉시 착수 권장 |
| **High** | 7 | 유지보수성/일관성 저해 — 단기 개선 (6.1 하향 포함) |
| **Medium** | 7 | 컨벤션 위반 — 점진적 개선 |
| **Low** | 4 | 사소한 이슈 — 기회 있을 때 수정 |
| ~~삭제~~ | 4 | 검증 결과 사실과 다름 (6.4, 4.1-⚠️4, 6.1-LogoutButton, 4.1-`success:"info"`) |
| **합계** | **19** | (5차 검증 반영) |

**Top 3 시스템적 이슈:**
1. 하드코딩 hex 컬러 21개 파일 — 테마 호환성 저해 (라이트 모드 미대응 주의)
2. 서버 액션 에러 처리 패턴 3종 혼용 — 예측 불가능한 API 계약 (mutation 전용 Result, read는 throw 유지)
3. sidebar `isCollapsed` 7개 컴포넌트 동일 prop — props breadth 이슈 (drilling depth는 최대 2단계)

### 런타임 리스크 경고 (빌드 통과, 런타임 실패 유형)

> **이 섹션의 3가지 항목은 TypeScript 빌드를 통과하지만 런타임에 실패하는 유형이다. 각 Phase 실행 시 반드시 사전 확인할 것.**

| # | 위험 | 증상 | 관련 Phase | 방어 수단 |
|---|------|------|-----------|----------|
| **R-1** | `useSuspenseQuery` + `ServerActionResult` 조합 | `queryFn`이 `{ success, data }` 래퍼 객체를 반환 → `profile.name`이 `undefined` → UI 빈 상태 렌더링 | Phase 3 (#2) | **read 계열 서버 액션(Step 1, 3)은 절대 Result 전환 금지** (4.1 참조) |
| **R-2** | `onSuccess`에서 `result.success` 분기 누락 | 서버 액션이 `{ success: false }` 반환 시 `onSuccess` 콜백으로 진입 → 에러가 성공 토스트로 표시 | Phase 3 (#2) | **Step 4-5 실행 시 반드시 `onSuccess(result)` 파라미터 추가 + `if (!result.success)` 분기 선행** (4.1 체크리스트 참조) |
| **R-3** | barrel export wildcard 제거 시 inngest 함수 누락 | `isValidLanguageCode`, `getLanguageName` export 누락 → 프로덕션 리뷰/요약 잡 런타임 실패 | Phase 4 (#14) | **settings barrel 전환 후 `npm run build` + inngest 함수 import 경로 수동 확인** (2.5 체크리스트 참조) |

---

## 1. File Naming Consistency (frontend-file-naming)

### 1.1 디렉토리명 단수/복수 불일치 [Medium]

**위치:** `module/payment/action/` vs 나머지 모든 모듈의 `actions/`

| 모듈 | 디렉토리명 | 일관성 |
|------|-----------|--------|
| repository | `actions/` | O |
| review | `actions/` | O |
| settings | `actions/` | O |
| suggestion | `actions/` | O |
| dashboard | `actions/` | O |
| ai | `actions/` | O |
| **payment** | **`action/`** | **X — 단수형** |

**개선:** `module/payment/action/` → `module/payment/actions/`로 rename. 임포트 경로 일괄 변경 필요.

> **✅ 확정 실행 계획 — 2개 rename을 단일 커밋으로 처리:**
>
> **변경 1:** `module/payment/action/` → `module/payment/actions/`
> **변경 2:** `module/payment/config/` → `module/payment/constants/`
>
> **import 경로 수정 체크리스트 (모두 동일 커밋):**
>
> | # | 파일 | 변경 전 import 경로 | 변경 후 import 경로 |
> |---|------|-------------------|-------------------|
> | 1 | `lib/auth.ts` | `@/module/payment/config/flags` | `@/module/payment/constants/flags` |
> | 2 | `lib/auth.ts` | `@/module/payment/config/polar` | `@/module/payment/constants/polar` |
> | 3 | `lib/auth.ts` | `@/module/payment/lib/subscription` | (경로 변동 없음) |
> | 4 | `app/dashboard/subscription/subscription-content.tsx` | `@/module/payment/action/config` | `@/module/payment/actions/config` |
> | 5 | `module/ai/actions/review-pull-request.ts` | `@/module/payment/lib/subscription` | (경로 변동 없음) |
> | 6 | `module/repository/actions/index.ts` | `@/module/payment/lib/subscription` | (경로 변동 없음) |
>
> **실행 순서:**
> 1. `git mv module/payment/action module/payment/actions`
> 2. `git mv module/payment/config module/payment/constants`
> 3. 위 체크리스트 #1, #2, #4의 import 경로 수정
> 4. `npm run build` — **반드시 통과 확인 후 커밋**
> 5. 실패 시 `git stash`로 즉시 롤백 가능하도록 준비
>
> **🚨 리스크 — `lib/auth.ts` 인증 시스템 진입점 의존:** `lib/auth.ts`는 `payment/config/flags`와 `payment/config/polar` 2개 경로에 의존한다. import 경로 1개라도 누락 시 **앱 전체의 인증이 깨진다** (로그인, 세션 체크, OAuth 콜백 전부 실패). 빌드 실패로 즉시 발견 가능하지만, **반드시 2개 경로(#1, #2)를 동일 커밋에서 동시 변경**할 것. 부분 커밋 금지.
>
> **검증 명령:**
> ```bash
> # rename 후 auth.ts import 경로가 올바른지 확인
> grep -n "payment/config\|payment/constants" lib/auth.ts
> # 예상 결과: payment/constants/flags, payment/constants/polar (2줄)
> npm run build
> ```

### 1.2 파일명 camelCase 위반 [Medium]

**위치:** `lib/formatDistanceToNow.ts`

프로젝트의 모든 lib 파일이 kebab-case를 사용:
- `lib/auth-client.ts`, `lib/server-utils.ts`, `lib/db.ts`, `lib/utils.ts`

**개선:** `lib/formatDistanceToNow.ts` → `lib/format-distance-to-now.ts`

### 1.3 `config/` vs `constants/` 디렉토리명 불일치 [Medium]

**위치:** `module/payment/config/` (flags.ts, polar.ts)

다른 모든 모듈은 설정/상수를 `constants/`에 저장:
- `module/review/constants/`, `module/repository/constants/`, `module/settings/constants/`

payment 모듈만 `config/`를 사용. 역할이 동일한 데이터(플래그, 설정값)를 다른 디렉토리명으로 관리.

**개선:** `module/payment/config/` → `module/payment/constants/`로 통합하거나, `config/`의 사용 목적이 다르다면 `CLAUDE.md`에 문서화.

---

## 2. Naming Conventions (naming-conventions)

### 2.1 쿼리키 상수 미추출 — subscription [High]

**위치:** `app/dashboard/subscription/subscription-content.tsx:46`

```typescript
// 현재 — 인라인 문자열
const { data, refetch, isLoading } = useQuery({
  queryKey: ["subscription-data"],  // 상수 미추출
  queryFn: () => getSubscriptionData(),
});
```

다른 모든 모듈은 쿼리키를 상수로 관리:
- `REPOSITORY_QUERY_KEYS.LIST` (`module/repository/constants/`)
- `REVIEW_QUERY_KEYS.LIST` (`module/review/constants/`)
- `SUGGESTION_QUERY_KEYS.LIST` (`module/suggestion/constants/`)
- `SETTINGS_QUERY_KEYS.USER_PROFILE` (`module/settings/constants/`)

**개선:** `module/payment/constants/`에 `SUBSCRIPTION_QUERY_KEYS` 추출.

### 2.2 타입 접미사 불일치 [Low]

프로젝트 전반에서 타입 접미사가 통일되지 않음:

| 접미사 | 사용처 | 예시 |
|--------|--------|------|
| `Dto` | repository | `GitHubRepositoryDto`, `GitHubRepositoryOwnerDto` |
| `Data` | review, suggestion | `ReviewsData`, `ReviewDetailData`, `SuggestionsData` |
| `Result` | repository, suggestion, ai, settings | `ConnectRepositoryResult`, `ApplySuggestionResult`, `UpdateProfileResult` |
| `Stats` | dashboard | `DashboardStats`, `ContributionStats` |
| `Item` | review, suggestion | `ReviewListItem`, `SuggestionItem` |

**개선:** 팀 내 접미사 규칙 합의 필요. 권장:
- 외부 API 응답: `Dto`
- 서버 액션 반환: `Result`
- 리스트 아이템: `Item`
- 집계 데이터: `Stats`

### 2.3 `NavItem` 인터페이스 중복 정의 [High]

**위치:**
1. `components/layouts/app-sidebar/types/index.ts:8` — `NavItem` 정의
2. `components/layouts/app-sidebar/constants/index.ts:4` — `NavItem` 재정의

동일한 인터페이스가 두 파일에 별도로 정의됨. constants 파일은 types 파일의 `NavItem`을 import해야 함.

```typescript
// constants/index.ts — 현재
export interface NavItem {  // 중복 정의
  title: string;
  url: string;
  icon: LucideIcon;
}

// 개선: types/index.ts의 NavItem을 import
import type { NavItem } from "../types";
```

### 2.4 Export 패턴 불일치 [Low]

| 패턴 | 사용 위치 | 비율 |
|------|----------|------|
| `export default function` | ReviewList, RepositoryList, LoginUI, SettingsPage, AppSidebar, LoginCard, LoginHeader, LoginFeatures, LoginFooter, ContributionGraph, ProfileForm, LanguageSelector, RepositoryCardSkeleton | ~60% |
| `export function` (named) | ReviewCard, ReviewEmptyState, ReviewStatusBadge, RepositoryCard, RepositorySearchInput, SuggestionCard, SuggestionList, RepositoryItem, ProfileSkeleton, RepositorySkeleton | ~40% |

`parts/` 하위 컴포넌트에서도 default와 named export가 혼용됨.

**개선:** 규칙 통일 — 모듈 진입점 UI 컴포넌트는 `default`, parts/ 하위는 `named export`.

### 2.5 Barrel Export 와일드카드 vs 명시적 선언 불일치 [Medium]

**위치:**
- `module/review/index.ts:2` — `export * from "./actions"` (와일드카드)
- `module/suggestion/index.ts:2` — 명시적 named export

와일드카드는 모듈의 public API 경계를 불명확하게 만듦.

**개선:** 모든 barrel export를 명시적 named export로 통일 (suggestion 모듈 패턴 따르기).

> **✅ 확정 마이그레이션 계획 — 모듈별 명시적 export 전환:**
>
> **원칙:** 각 모듈의 `index.ts`를 suggestion 모듈 패턴(명시적 named export)으로 통일. 모듈 1개씩 전환하고 빌드 확인.
>
> **settings 모듈 (최고 위험 — 9개 외부 소비자, 4차 검증 보정):**
> ```typescript
> // module/settings/index.ts — 변경 후
> // actions
> export { getUserProfile, updateUserProfile } from "./actions";
> export { getConnectedRepositories } from "./actions";
> export { disconnectRepository, disconnectAllRepositories } from "./actions";
> export { getUserLanguageByUserId } from "./actions";
> // constants
> export { SETTINGS_QUERY_KEYS, PROFILE_STALE_TIME_MS, REPOSITORIES_STALE_TIME_MS } from "./constants";
> export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_BY_CODE } from "./constants";
> // lib/language — inngest 백그라운드 잡 의존 (누락 시 리뷰 잡 실패)
> export { isValidLanguageCode, getLanguageName } from "./lib/language";
> // types
> export type { LanguageCode } from "./constants";
> // ui
> export { default as SettingsPage } from "./ui/settings-page";
> ```
>
> **review 모듈 (3개 외부 소비자):**
> ```typescript
> // module/review/index.ts — 변경 후
> // actions (getReviewById → 실제 함수명은 getUserReviewById — 5차 검증 보정)
> export { getUserReviews, getUserReviewById } from "./actions";
> // types
> export type { ReviewsData, ReviewDetailData, ReviewListItem } from "./types";
> // ui
> export { default as ReviewList } from "./ui/review-list";
> export { default as ReviewDetail } from "./ui/review-detail";
> // hooks
> export { useReviews } from "./hooks/use-reviews";
> // constants
> export { REVIEW_QUERY_KEYS, REVIEWS_STALE_TIME_MS } from "./constants";
> ```
>
> **⚠️ 5차 검증 보정:**
> - ~~`getReviewById`~~ → 실제 함수명은 `getUserReviewById`. 코드에 `getReviewById`는 존재하지 않음
> - 기존 barrel의 `export * from "./types"`, `ReviewList`, `ReviewDetail`, `useReviews`, `REVIEWS_STALE_TIME_MS` export가 누락되어 있었음. 위 코드에 전체 반영 완료
>
> **dashboard 모듈 (1개 외부 소비자):**
> ```typescript
> // module/dashboard/index.ts — 변경 후
> // actions
> export { getDashboardData } from "./actions";
> // ui
> export { default as StatsOverview } from "./ui/stats-overview";
> // types
> export type { ContributionStats, DashboardStats } from "./types";
> ```
>
> **⚠️ 5차 검증 보정:** 기존 barrel에 `StatsOverview` UI 컴포넌트와 `ContributionStats`, `DashboardStats` 타입 export가 존재. 누락 시 빌드 실패.
>
> **github 모듈 (0개 외부 소비자 — barrel import 없음):**
> 외부에서 barrel import를 사용하지 않으므로 wildcard 유지해도 무방. 일관성을 위해 전환 권장.
>
> **실행 순서:** dashboard(가장 안전) → review → settings(가장 위험) 순으로 진행. 각 모듈 전환 후 `npm run build` 확인.
>
> **[런타임 리스크 R-3] settings 모듈 전환 후 inngest 함수 필수 검증:**
>
> settings barrel 전환은 빌드 실패로 대부분 잡히지만, **inngest 함수는 런타임 시점에 동적 import될 수 있으므로** 아래 2개 파일의 import가 정상 동작하는지 추가 확인 필수:
>
> ```bash
> # 빌드 확인 (기본)
> npm run build
>
> # inngest 함수 import 경로 수동 확인 (빌드 후에도 반드시 실행)
> grep -n "from.*@/module/settings" inngest/functions/review.ts inngest/functions/summary.ts
> ```
>
> 위 grep 결과에서 `isValidLanguageCode`, `getLanguageName`, `LanguageCode` 3개가 모두 resolve되는지 확인할 것. 하나라도 누락 시 **프로덕션 리뷰/요약 잡이 런타임에 실패**한다.
>
> **외부 소비자 전수 조사 결과 (2차 검증):**
>
> | 모듈 | wildcard 수 | 외부 소비자 수 | 주요 소비자 |
> |------|------------|--------------|------------|
> | settings | 3개 | **9개 파일** (4차 검증 보정) | inngest(2), ai(3), github(1), app(1), 기타 |
> | review | 2개 | 3개 파일 | app/dashboard/reviews |
> | dashboard | 1개 | 1개 파일 | app/dashboard/page |
> | github | 1개 | 0개 | (직접 barrel import 없음) |
>
> **4차 검증 — settings 외부 소비자 전체 목록 (9개):**
> 1. `app/dashboard/settings/page.tsx` — `SettingsPage`
> 2. `inngest/functions/review.ts` — `isValidLanguageCode`, `LanguageCode`
> 3. `inngest/functions/summary.ts` — `getLanguageName`, `isValidLanguageCode`
> 4. `module/github/lib/github-markdown.ts` — `LanguageCode` (type)
> 5. `module/ai/lib/review-prompt.ts` — `getLanguageName`
> 6. `module/ai/actions/review-pull-request.ts` — `getUserLanguageByUserId`
> 7. `module/ai/actions/generate-pr-summary.ts` — `getUserLanguageByUserId`
> 8. `module/settings/hooks/use-user-profile.ts` — 내부 소비 (barrel 경유)
> 9. `module/settings/hooks/use-connected-repositories.ts` — 내부 소비 (barrel 경유)
>
> **inngest 잡 2개**(`review.ts`, `summary.ts`)가 포함되어 있어, barrel export 전환 시 누락하면 **프로덕션 리뷰/요약 잡이 런타임에 실패**한다. 빌드 타임에 잡히므로 빌드 확인 필수.

---

## 3. Readability (frontend-readability)

### 3.1 하드코딩 Hex 컬러 — 21개 파일 [Critical]

**영향 범위:** sidebar 전체(UI + constants/styles.ts), repository 카드/리스트, review 카드, suggestion 카드/상수, dashboard 페이지, subscription 페이지

**반복 사용되는 주요 컬러:**

| Hex 값 | 사용 빈도 | 의미 |
|--------|----------|------|
| `#707070` | 15+ | muted text |
| `#1a1a1a` | 20+ | border, background |
| `#0a0a0a` | 10+ | deep background |
| `#2d3e2d` | 15+ | accent green |
| `#4a6a4a` | 12+ | primary green |
| `#e0e0e0` | 8+ | foreground text |
| `#606060` | 8+ | secondary text |
| `#d0d0d0` | 4+ | light text |
| `#3d523d` | 6+ | green variant |

**대조군 — 올바른 패턴 (CSS 변수 사용):**
- `module/dashboard/ui/stats-overview.tsx` — `text-foreground`, `text-muted-foreground`
- `module/review/ui/parts/review-status-badge.tsx` — `bg-primary`, `text-primary-foreground`
- `module/settings/ui/settings-page.tsx` — `border-border`, `bg-card`

**하드코딩 hex 파일 목록:**

```
components/layouts/app-sidebar/ui/app-sidebar.tsx
components/layouts/app-sidebar/ui/parts/logo.tsx
components/layouts/app-sidebar/ui/parts/nav-item.tsx
components/layouts/app-sidebar/ui/parts/user-profile.tsx
components/layouts/app-sidebar/ui/parts/user-avatar.tsx
components/layouts/app-sidebar/ui/parts/theme-toggle.tsx
components/layouts/app-sidebar/ui/parts/logout-button.tsx
components/layouts/app-sidebar/constants/styles.ts
module/repository/ui/parts/repository-card.tsx
module/repository/ui/parts/repository-card-skeleton.tsx
module/repository/ui/parts/repository-search-input.tsx
module/repository/ui/repository-list.tsx
module/review/ui/parts/review-card.tsx
module/review/ui/parts/review-empty-state.tsx
module/suggestion/ui/suggestion-card.tsx
module/suggestion/ui/suggestion-list.tsx
module/suggestion/constants/index.ts
app/dashboard/repository/page.tsx
app/dashboard/reviews/page.tsx
app/dashboard/subscription/page.tsx
app/dashboard/subscription/subscription-content.tsx
```

**개선:** `globals.css`의 dark 테마에 **이미 동일한 값의 CSS 변수가 존재**하므로, 새 변수를 추가하지 말고 기존 변수를 활용하여 Tailwind 토큰으로 마이그레이션:

| 하드코딩 Hex | 이미 존재하는 CSS 변수 | Tailwind 클래스 |
|-------------|----------------------|----------------|
| `#4a6a4a` | `--primary` | `text-primary`, `bg-primary` |
| `#707070` | `--muted-foreground` | `text-muted-foreground` |
| `#1a1a1a` | `--border`, `--secondary` | `border-border`, `bg-secondary` |
| `#0a0a0a` | `--sidebar` | `bg-sidebar` |
| `#e0e0e0` | `--sidebar-foreground` | `text-sidebar-foreground` |
| `#2d3e2d` | `--ring`, `--sidebar-ring` | `ring-ring` |
| `#606060` | — | 신규 변수 `--muted-foreground-alt` 필요 (아래 참조) |
| `#d0d0d0` | `--secondary-foreground` | `text-secondary-foreground` |
| `#3d523d` | — | 신규 변수 `--primary-muted` 필요 (아래 참조) |

> **⚠️ 실행 주의 (1) — 미매핑 색상 2건 해결:**
>
> `#606060`과 `#3d523d`는 기존 CSS 변수에 대응하지 않는다. `globals.css`에 신규 변수를 추가한다:
>
> ```css
> /* globals.css — :root (라이트 모드) */
> --muted-foreground-alt: oklch(0.45 0 0);
> --primary-muted: oklch(0.35 0.04 145);
>
> /* globals.css — .dark */
> --muted-foreground-alt: #606060;
> --primary-muted: #3d523d;
> ```
>
> Tailwind 매핑: `text-muted-foreground-alt`, `from-primary-muted/10` 등.
>
> **⚠️ 실행 주의 (2) — `sidebar/constants/styles.ts`의 Tailwind arbitrary value 문법:**
>
> `styles.ts`의 값들(`border-[#1a1a1a]`, `from-[#2d3e2d]/20` 등)은 Tailwind arbitrary value 문법으로 되어 있다. 대부분은 시맨틱 클래스로 치환 가능하나, opacity modifier 조합(`from-[#2d3e2d]/20`)은 `from-ring/20` 형태로 전환해야 한다. 이 파일의 모든 hex를 Tailwind 시맨틱 토큰으로 일괄 전환한다.
>
> **⚠️ 실행 주의 (3) — 라이트 모드 색상 불일치 (4차 검증 추가):**
>
> 위 매핑 테이블의 hex 값은 `globals.css`의 `.dark` 섹션과 일치하지만, `:root` (라이트 모드)에서는 완전히 다른 색상이다:
> - `.dark`의 `--primary: #4a6a4a` (녹색) vs `:root`의 `--primary: oklch(0.205 0 0)` (거의 검정)
> - `.dark`의 `--muted-foreground: #707070` vs `:root`의 `--muted-foreground: oklch(0.556 0 0)` (다른 톤)
>
> 현재 하드코딩 hex는 **다크 모드 전용 값**이므로, Tailwind 토큰으로 교체 시 라이트 모드에서 의도치 않은 색상이 표시된다.
>
> **✅ 확정 해결 전략:** Tailwind 토큰 마이그레이션을 진행한다. 단, **라이트 모드 대응은 별도 Phase로 분리**한다:
> - Phase 3에서 hex → Tailwind 토큰 일괄 교체 (다크 모드 기준 검증)
> - 라이트 모드 디자인 확정 후 `:root` CSS 변수 값을 조정하는 후속 Phase 추가
>
> **⚠️ 실행 주의 (4) — ThemeToggle이 실제로 작동한다 (7차 검증 추가):**
>
> `components/layouts/app-sidebar/ui/parts/theme-toggle.tsx`에서 `next-themes`의 `useTheme()`을 사용하여 **라이트/다크 모드 전환이 실제로 가능**하다. "다크 모드 전용"이 아닌, **라이트 모드 디자인이 미확정인 상태**이다.
>
> **마이그레이션 후 라이트 모드 영향:**
> - 현재(하드코딩 hex): 라이트 모드에서도 다크 모드 색상이 강제 표시됨 (깨진 상태)
> - 마이그레이션 후(Tailwind 토큰): 라이트 모드에서 `:root` CSS 변수 값이 적용됨 (다크 모드와 다른 색상)
>
> 현재 라이트 모드가 이미 깨져 있으므로 마이그레이션이 퇴보는 아니지만, **시각적 변화가 발생**한다. Phase 3 실행 전 다음 중 하나를 선택할 것:
> - (A) 라이트 모드에서 `:root` CSS 변수 값이 적절한지 사전 검증 후 진행
> - (B) Phase 3 기간 동안 ThemeToggle을 다크 모드 고정으로 임시 변경 (`useTheme()`의 `setTheme("dark")` 강제), 라이트 모드 Phase에서 해제
>
> **✅ 확정 해결 — `radial-gradient` inline style → CSS 변수 적용:**
>
> `oklch(from ...)` 상대 색상 구문은 Firefox 128 미만에서 미지원되어 그라디언트가 완전히 사라지는 문제가 있다. **CSS 변수 방식을 기본 전략으로 확정**한다:
>
> ```css
> /* globals.css — :root */
> --gradient-accent: rgba(180, 180, 180, 0.4);
> --gradient-bg: rgba(200, 200, 200, 0.3);
>
> /* globals.css — .dark */
> --gradient-accent: rgba(45, 62, 45, 0.4);
> --gradient-bg: rgba(30, 30, 40, 0.3);
> ```
>
> ```typescript
> // 변경 전
> background: "radial-gradient(circle, rgba(45, 62, 45, 0.4) 0%, transparent 70%)"
> background: "radial-gradient(circle, rgba(30, 30, 40, 0.3) 0%, transparent 70%)"
>
> // 변경 후 — CSS 변수 직접 사용 (모든 브라우저 지원)
> background: "radial-gradient(circle, var(--gradient-accent) 0%, transparent 70%)"
> background: "radial-gradient(circle, var(--gradient-bg) 0%, transparent 70%)"
> ```
>
> ~~`oklch(from ...)` 상대 색상 구문~~ → **사용하지 않음**. 브라우저 호환성 리스크 회피.

### 3.2 매직넘버 [Medium]

| 위치 | 값 | 맥락 |
|------|---|------|
| `subscription-content.tsx:217` | `$0` | Free plan 가격 |
| `subscription-content.tsx:250` | `$99.99` | Pro plan 가격 |
| `subscription-content.tsx:67` | `min-h-[400px]` | 로딩 컨테이너 높이 |
| `suggestion/actions/index.ts:106` | `72` | commit message truncation 길이 |

**개선:**
```typescript
// module/payment/constants/index.ts
export const PLAN_PRICING = {
  FREE: { price: 0, label: "$0" },
  PRO: { price: 99.99, label: "$99.99" },
} as const;

// suggestion/constants/index.ts
export const COMMIT_MESSAGE_MAX_LENGTH = 72;
```

### 3.3 오타 3건 [Low]

| 위치 | 현재 | 수정 |
|------|------|------|
| `subscription-content.tsx:168` | `"Your current plan limts and usage"` | `"limits"` |
| `subscription-content.tsx:291` | `"Loading Checking out..."` | `"Checking out..."` |
| `module/payment/action/config.ts:138` | `"Failed t o sync with Polar"` | `"Failed to sync"` |

> **⚠️ 4차 검증 추가 — 실행 순서 의존성:** 3번째 오타 경로(`module/payment/action/config.ts`)는 항목 1.1의 rename(`action/` → `actions/`)이 선행되면 `module/payment/actions/config.ts`로 변경된다. **Phase 1에서 rename과 오타 수정을 동일 커밋으로 처리**하면 경로 혼동을 방지할 수 있다.

### 3.4 복잡한 조건부 렌더링 [High]

**위치:** `subscription-content.tsx` (303줄)

이 컴포넌트에 5가지 관심사가 혼합:
1. 3개 loading state 관리 (checkout, portal, sync)
2. 구독 데이터 페칭
3. URL 파라미터 기반 동기화
4. 사용량 표시 UI
5. 플랜 비교 UI

return 문 전에 3개 early return + main return에 중첩 조건:

```typescript
// 라인 268-297: 3단 중첩
{isPro && isActive ? (
  <Button onClick={handleManageSubscription}>
    {portalLoading ? (<>...</>) : (<>...</>)}
  </Button>
) : (
  <Button onClick={handleUpgrade}>
    {checkoutLoading ? (<>...</>) : (
      canUpgrade ? "Upgrade to Pro" : "Upgrade Temporarily Unavailable"
    )}
  </Button>
)}
```

**개선:** `module/payment/ui/` 디렉토리 생성 후 분해:
- `subscription-page.tsx` — 메인 컨테이너
- `parts/usage-card.tsx` — 사용량 표시
- `parts/plan-card.tsx` — 플랜 카드 (free/pro)
- `parts/plan-action-button.tsx` — 조건부 버튼 렌더링
- `constants/` — PLAN_FEATURES, PLAN_PRICING

---

## 4. Predictability (frontend-predictability)

### 4.1 서버 액션 에러 처리 패턴 3종 혼용 [Critical]

프로젝트 내 서버 액션이 3가지 다른 에러 처리 패턴을 사용:

**패턴 A — throw + return null (에러 삼키기):**
```typescript
// module/settings/actions/index.ts — getUserProfile()
export async function getUserProfile() {
  try { ... }
  catch (error) {
    console.error("Error fetching user profile:", error);
    return null;  // 에러 정보 소실
  }
}
```

**패턴 B — throw Error (예외 전파):**
```typescript
// module/settings/actions/index.ts — getConnectedRepositories()
export async function getConnectedRepositories() {
  try { ... }
  catch (error) {
    throw error instanceof Error ? error : new Error("Failed to fetch");
  }
}

// module/settings/actions/index.ts — disconnectRepository()
export async function disconnectRepository(repositoryId: string) {
  try {
    await disconnectRepositoryInternal(repositoryId, session.user.id);
    return { success: true, message: "..." };  // 성공은 객체
  } catch (error) {
    throw error;  // 실패는 throw — 비대칭
  }
}
```

**패턴 C — Result 객체 (discriminated union):**
```typescript
// module/suggestion/actions/index.ts — applySuggestion()
return { success: true, commitSha };
return { success: false, error: "...", reason: "conflict" };

// module/repository/actions/index.ts — connectRepository()
return { success: true, repository };
return { success: false, error: "...", reason: "plan_restricted" };
```

**동일 파일 내 혼용 사례:**
`module/settings/actions/index.ts`에서:
- `getUserProfile()` → 패턴 A (return null)
- `updateUserProfile()` → 패턴 C (Result 객체)
- `getConnectedRepositories()` → 패턴 B (throw)
- `disconnectRepository()` → 패턴 B+C 혼합 (성공: 객체, 실패: throw)

**개선:** 통합 `ServerActionResult<T>` 타입 도입 (mutation 전용):

```typescript
// shared/types/server-action.ts
export type ServerActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; reason?: string };
```

> **⚠️ 4차 검증 추가 — 적용 범위 제한 규칙:**
>
> `ServerActionResult<T>`는 **mutation 계열 서버 액션에만** 적용한다. **read(query) 계열 서버 액션은 throw 패턴을 유지**해야 한다.
>
> **이유:** `useReviews` (`useSuspenseQuery` + `getUserReviews`), `useConnectedRepositories` (`useSuspenseQuery` + `getConnectedRepositories`)는 queryFn이 throw해야만 React Query의 에러 상태(`isError`, Error Boundary, `QueryBoundary`)가 작동한다. Result 객체를 반환하면 React Query가 에러를 인식하지 못하고, 에러 데이터가 정상 데이터처럼 컴포넌트에 전달된다.
>
> **적용 규칙:**
> | 서버 액션 유형 | 에러 처리 패턴 | 이유 |
> |--------------|--------------|------|
> | **Read (query)** — `useSuspenseQuery`/`useQuery`에서 호출 | **throw 유지** | React Query 에러 상태 + ErrorBoundary 의존 |
> | **Mutation** — `useMutation`에서 호출 | **`ServerActionResult<T>`** | 호출부에서 성공/실패 분기 필요 |
> | **Read (query)** — `return null` 패턴 (getUserProfile) | **throw 유지** | ~~`ServerActionResult<T>` 전환~~ [5차 검증에서 취소] — `useSuspenseQuery`에서 호출하므로 Result 전환 불가 |
>
> **수정 대상 변경:**
> - 🚫 **Step 1: `getUserProfile()` — Result 전환 금지** [런타임 리스크 R-1] — `use-user-profile.ts:11`에서 `useSuspenseQuery`의 `queryFn`으로 호출됨. Result 전환 시 `profile` 변수가 `{ success, data }` 래퍼 객체가 되어 `profile.name` 등이 `undefined` 반환 (빌드 통과, 런타임 UI 깨짐). 에러 정보 소실 문제는 `return null` → `throw` 전환으로 해결할 것
> - 🚫 **Step 3: `getConnectedRepositories()` — Result 전환 금지** [런타임 리스크 R-1] — `useSuspenseQuery` 의존. Result 전환 시 React Query 에러 상태 소실
> - Step 2, 4-5, 6, 7: mutation 계열 — Result 전환 유지

> **⚠️ 실행 주의 (1) — 클라이언트 Hook 연쇄 파손:** 기존에 `throw`하던 서버 액션을 `{ success: false }` 반환으로 변경하면, 클라이언트의 `try/catch` 또는 `onError` 콜백이 더 이상 동작하지 않아 **에러가 조용히 무시됨**. 서버 액션 + 해당 클라이언트 Hook을 반드시 **atomic 단위**로 동시 수정할 것. 영향 범위:
> - `module/settings/hooks/use-connected-repositories.ts` (disconnect mutation들이 throw 기반)
> - `module/settings/hooks/use-user-profile.ts` (updateMutation onError)
> - 기타 throw 패턴 B를 사용하는 모든 서버 액션의 호출부
>
> **확정 수정 순서 — 1:1 쌍 단위 체크리스트:**
>
> **Step 0.** `shared/types/server-action.ts`에 `ServerActionResult<T>` 타입 정의 → `npm run build` 확인
>
> | Step | 서버 액션 (throw→Result) | 클라이언트 Hook (catch→분기) | 주의사항 |
> |------|------------------------|---------------------------|---------|
> | **🚫 1** | **삭제 — `getUserProfile()` Result 전환 금지** | — | **[런타임 리스크 R-1]** `use-user-profile.ts:11`에서 `useSuspenseQuery`로 호출. Result 전환 시 `profile` 데이터가 `{ success, data }` 래퍼 객체가 되어 `profile.name` → `undefined` (빌드 통과, 런타임 UI 깨짐). read 계열이므로 null → throw 전환으로 에러 정보 소실만 해결할 것 |
> | 2 | `settings/actions` → `updateUserProfile()` (이미 패턴C — 시그니처만 통일) | `settings/hooks/use-user-profile.ts` → `onError` 콜백 제거, `onSuccess`에서 `result.success` 분기 | 이미 Result 객체 사용 중이므로 타입 시그니처만 정렬 |
> | **🚫 3** | **삭제 — `getConnectedRepositories()` Result 전환 금지** | — | **[런타임 리스크 R-1]** `useSuspenseQuery` 의존. Result 전환 시 React Query 에러 상태(`isError`, ErrorBoundary) 소실. throw 유지 |
> | 4 | `settings/actions` → `disconnectRepository()` (패턴B+C 혼합 → Result) | `settings/hooks/use-connected-repositories.ts` → 아래 필수 패턴 적용 | **[런타임 리스크 R-2]** 현재 `onSuccess`가 `result` 파라미터를 사용하지 않음. 반드시 아래 코드 블록의 패턴으로 동시 수정. 누락 시 에러가 성공 토스트로 표시됨 |
> | 5 | `settings/actions` → `disconnectAllRepositories()` | 위와 동일 Hook — `disconnectAllMutation`도 동일 패턴 적용 | Step 4와 같은 커밋에서 처리 |
> | 6 | `repository/actions` → `connectRepository()` (status 3-state → `ServerActionResultWithInfo<T>`) | `repository/hooks/use-connect-repository.ts` → `if/in` 분기로 전환 | 4차 검증 재설계 참조 — `info` 필드 방식. **action 내부 + 타입 + Hook 3곳 동시 수정** (5차 검증 참조) |
> | 7 | `payment/action/config.ts` → `getSubscriptionData()`, `syncSubscriptionStatus()` | `subscription-content.tsx` | 인증 가드 통일(4.2)과 동시 처리 |
>
> **Step 4-5 필수 적용 패턴 (런타임 리스크 R-2 방어):**
>
> ```typescript
> // use-connected-repositories.ts — disconnectMutation / disconnectAllMutation
> // 변경 전 (throw 기반):
> onSuccess: async () => { toast.success("..."); await queryClient.invalidateQueries(...); }
> onError: (error) => { toast.error(error.message); }
>
> // 변경 후 (Result 기반) — onError 제거, onSuccess에서 분기:
> onSuccess: async (result) => {
>   if (!result.success) {
>     toast.error(result.error);
>     return;  // 이 return이 없으면 에러 시에도 아래 성공 로직 실행
>   }
>   toast.success("...");
>   await queryClient.invalidateQueries(...);
> }
> // onError 콜백 삭제 — Result 패턴에서는 throw가 발생하지 않으므로 호출되지 않음
> ```
>
> **각 Step 완료 후:** `npm run build` 통과 확인 → 다음 Step 진행.
> **전체 완료 후:** E2E 동작 확인 (로그인 → 설정 → 리포지토리 연결/해제 → 구독 플로우).
>
> **⚠️ 4차 검증 추가 — mutation Hook의 Result→throw 재변환 패턴:**
>
> `use-apply-suggestion.ts`, `use-dismiss-suggestion.ts`는 서버 액션의 Result 객체를 받은 직후 `if (!result.success) throw new Error(result.error)`로 재변환한다. 이 패턴은 Result의 `reason` 등 구조화된 에러 정보를 `Error.message` 문자열로 축소시킨다.
>
> **확정 방침:** 이 두 Hook은 현재 `reason` 필드를 활용하지 않으므로, 기존 패턴을 유지한다. `ServerActionResult<T>` 도입 후에도 동일 패턴으로 작동하므로 추가 수정 불필요. 단, 향후 `reason` 기반 분기가 필요할 경우 throw 대신 `onSuccess` 내 `result.success` 분기로 전환할 것.
>
> **⚠️ 실행 주의 (2) — `connectRepository` 반환 타입 비호환:** `connectRepository()`는 `success` 필드가 아닌 `status` 기반 discriminated union(`"connected" | "already_connected" | "error"`)을 사용. `ServerActionResult<T>`로 통일 시 `useConnectRepository` Hook의 `result.status` 체크 분기 로직이 모두 깨짐. Hook의 분기 로직을 `success` 기반으로 동시 수정 필요.
>
> ~~**해결됨 (3) — `success: "info"` 3-state 확장**~~ [4차 검증에서 재설계]
>
> **⚠️ 4차 검증 결과 — `success: "info"` truthy 버그 발견:**
>
> `"info"`는 JavaScript에서 **truthy** 값이다. `if (result.success)` 시 `true`와 `"info"` 모두 진입하여, 기존 코드와 미래 코드에서 잘못된 분기 실행 위험이 있다. `switch`로만 올바르게 분기 가능하지만 `if` 사용을 강제할 수 없으므로, 3-state를 `success` 필드가 아닌 **별도 `status` 필드**로 분리한다:
>
> ```typescript
> // shared/types/server-action.ts
> export type ServerActionResult<T> =
>   | { success: true; data: T }
>   | { success: false; error: string; reason?: string };
>
> // connectRepository 전용 — 정보성 상태가 필요한 경우에만 확장
> export type ServerActionResultWithInfo<T> =
>   | ServerActionResult<T>
>   | { success: true; data: T; info: string };  // success는 boolean 유지
> ```
>
> **`connectRepository` 매핑:**
> - `status: "connected"` → `{ success: true, data: { repository } }`
> - `status: "already_connected"` → `{ success: true, data: { repository }, info: "이미 연결된 리포지토리입니다" }`
> - `status: "error"` → `{ success: false, error: "...", reason: "ALREADY_CONNECTED_BY_OTHER" | "QUOTA_EXCEEDED" }`
>
> **`useConnectRepository` Hook 수정:**
> ```typescript
> if (!result.success) {
>   // false 케이스 — 에러 처리
>   if (result.reason === "QUOTA_EXCEEDED") {
>     toast.error("Maximum repositories reached");
>   } else {
>     toast.error(result.error);
>   }
>   return;
> }
> // success: true 케이스 — info 필드 유무로 분기
> if ("info" in result) {
>   toast.info(result.info);
> } else {
>   toast.success("Repository connected successfully");
> }
> ```
>
> **장점:** `success`가 항상 `boolean`이므로 `if (result.success)` 분기가 안전. `info` 필드 존재 여부로 정보성 상태 구분.
> **수정 파일:** `shared/types/server-action.ts`, `module/repository/actions/index.ts`, `module/repository/types/index.ts`(`ConnectRepositoryResult` 타입 제거 또는 deprecated), `module/repository/hooks/use-connect-repository.ts`
>
> **⚠️ 5차 검증 추가 — `connectRepository` action 내부 로직 변경 필요:**
>
> 현재 `ConnectRepositoryResult` 타입은 `{ status: "connected" }` 형태로 **repository 데이터를 반환하지 않음**. `ServerActionResultWithInfo<Repository>` 전환 시 `{ success: true, data: { repository } }` 형태로 변경해야 하므로, action 함수 내부에서 연결 완료된 repository 객체를 조회/생성하여 반환하도록 로직 수정이 필요하다. 단순 타입 변경이 아닌 **action 구현 + 타입 + Hook 3곳 동시 수정**임을 인지할 것.
>
> **필수 수정 사항:**
> 1. `module/repository/actions/index.ts` — `connectRepository()` 내부에서 `prisma.repository.create()` 또는 `findUnique()` 결과를 반환값에 포함
> 2. `module/repository/types/index.ts` — `ConnectRepositoryResult` 타입을 `ServerActionResultWithInfo<Repository>`로 교체
> 3. `module/repository/hooks/use-connect-repository.ts` — `switch(result.status)` → `if (result.success)` 분기로 전체 재작성
> 4. `module/repository/index.ts` — barrel export에서 `ConnectRepositoryResult` 타입 제거 또는 새 타입으로 교체
>
> ~~**⚠️ 실행 주의 (4) (2차 검증) — AI 모듈 서버 액션 silent failure**~~ [삭제]
>
> **3차 검증 결과:** `app/api/webhooks/github/route.ts`는 `reviewPullRequest()` 반환값을 line ~107에서 `reviewResult.success` 체크 + `plan_restricted` reason 분기 처리하고, `generatePRSummary()` 반환값을 line ~154에서 `summaryResult.success` 체크 + HTTP 500 반환 처리함. **webhook handler는 이미 반환값을 올바르게 검증하고 있으므로**, silent failure 주장은 사실과 다름. 추가 조치 불필요.

### 4.2 인증 가드 불일치 [High]

| 서버 액션 | 인증 방식 | 미인증 시 동작 |
|----------|----------|--------------|
| `getUserReviews()` | `requireAuthSession()` | throw Error |
| `getUserRepositories()` | `requireAuthSession()` | throw Error |
| `applySuggestion()` | `requireAuthSession()` | throw Error |
| `updateUserProfile()` | `requireAuthSession()` | throw Error |
| **`getSubscriptionData()`** | **`auth.api.getSession()`** | **return null** |
| **`syncSubscriptionStatus()`** | **`auth.api.getSession()`** | **throw Error** |

`module/payment/action/config.ts`의 두 함수만 `requireAuthSession()` 대신 `auth.api.getSession()`을 직접 호출. `getSubscriptionData()`는 미인증 시 조용히 null 반환하지만, `syncSubscriptionStatus()`는 throw.

**개선:** 모든 서버 액션에서 `requireAuthSession()` 사용으로 통일.

### 4.3 `syncSubscriptionStatus` 반환 필드 불일치 [High]

**위치:** `module/payment/action/config.ts:90-140`

```typescript
// 성공 + active → message 필드
return { success: true, message: "ACTIVE" };

// 성공 + cancelled/expired → status 필드 (message 아님!)
return { success: true, status };

// 실패 → message 필드
return { success: false, message: "No active subscription found" };
```

호출부(`subscription-content.tsx:95`)는 `result.success`만 확인하므로 현재는 문제가 표면화되지 않지만, `message`/`status` 필드 차이는 잠재적 버그.

**개선:** 반환 타입을 통일된 discriminated union으로 리팩토링.

### 4.4 Hook 반환형 비일관 [Medium]

| Hook | 반환 형태 | 패턴 |
|------|----------|------|
| `useReviews()` | `{ reviews }` | 래핑된 데이터 |
| `useRepositories()` | Raw `useInfiniteQuery` result | React Query 직접 노출 |
| `useApplySuggestion()` | Raw `useMutation` result | React Query 직접 노출 |
| `useDismissSuggestion()` | Raw `useMutation` result | React Query 직접 노출 |
| `useUserProfile()` | `{ profile, updateMutation }` | 쿼리+뮤테이션 혼합 |
| `useConnectedRepositories()` | `{ repositories, isFetching, disconnectMutation, disconnectAllMutation, disconnectingId }` | 쿼리+2개 뮤테이션+파생상태 |

**개선:** 일관된 반환 패턴 합의. 권장: 도메인 의미를 담은 래핑 반환.

### 4.5 `useSidebarState` 숨은 부수효과 [Low]

**위치:** `components/layouts/app-sidebar/hooks/use-sidebar-state.ts`

`toggleCollapse` 함수가 `localStorage`에 쓰는 부수효과를 이름에 드러내지 않음. 시그니처상 단순 토글로 보이지만 실제로는 영속화 동작 포함.

**개선:** 경미한 이슈. 필요 시 `toggleCollapseAndPersist`로 이름 변경하거나, 커멘트로 명시.

---

## 5. Cohesion (frontend-cohesion)

### 5.1 `subscription-content.tsx` 위치 및 관심사 혼합 [High]

**위치:** `app/dashboard/subscription/subscription-content.tsx`

이 303줄 컴포넌트는:
- `app/` 디렉토리에 위치 (다른 모든 feature UI는 `module/*/ui/`에 위치)
- `PLAN_FEATURES` 상수가 컴포넌트 파일 내부에 인라인 정의
- 체크아웃, 포털 관리, 상태 동기화, 사용량 표시, 플랜 비교 등 5개 관심사 혼합

**개선:** `module/payment/ui/` 생성 후 이동 및 분해. 상수는 `module/payment/constants/`로 추출.

### 5.2 Sidebar 상수 3파일 분산 [High]

**위치:** `components/layouts/app-sidebar/constants/`

```
constants/
├── config.ts   — SIDEBAR_CONFIG, ANIMATION_CONFIG, THEME_CONFIG
├── styles.ts   — SIDEBAR_STYLES
└── index.ts    — NAV_ITEMS + NavItem 인터페이스(중복)
```

3개 파일이 각각 독립적으로 import됨. `index.ts`가 barrel 역할을 하지 않고 자체 데이터를 정의.

**개선:** 단일 `constants/index.ts`로 통합. `NavItem` 인터페이스는 `types/index.ts`에서만 정의.

### 5.3 Repository 관리 로직 모듈 간 분산 [Medium]

Repository disconnect 기능이 두 모듈에 걸쳐 존재:

```
module/repository/actions/index.ts
  └── disconnectRepository()           — 실제 구현
  └── disconnectAllRepositoriesInternal() — 실제 구현

module/settings/actions/index.ts
  └── disconnectRepository()           — repository 모듈 위임 래퍼
  └── disconnectAllRepositories()      — repository 모듈 위임 래퍼
```

settings 모듈의 래퍼가 `disconnectRepositoryInternal`이라는 Internal 접미사 함수를 import하여 사용.

**✅ 확정 해결 방안 — settings 래퍼 제거:**

settings 모듈의 래퍼 함수들은 `requireAuthSession()` 인증 가드 + repository 모듈 위임만 수행. repository 모듈의 disconnect 함수들에 직접 `requireAuthSession()`을 내장시키면 래퍼가 불필요해진다.

**실행 순서:**
1. `module/repository/actions/index.ts`의 `disconnectRepository()`, `disconnectAllRepositoriesInternal()`에 `requireAuthSession()` 가드 추가
2. `disconnectRepository()`의 시그니처를 `(repositoryId: string)` 단일 파라미터로 변경 (내부에서 `requireAuthSession()`으로 userId 획득)
3. `disconnectAllRepositoriesInternal()` → `disconnectAllRepositories()`로 rename (Internal 접미사 제거). 시그니처도 파라미터 없이 변경.
4. **`module/repository/index.ts`의 barrel export에 `disconnectAllRepositories` 추가** (현재 barrel에 `disconnectAllRepositories`가 export되지 않음 — 5차 검증 추가)
5. `module/settings/actions/index.ts`에서 `disconnectRepository()`, `disconnectAllRepositories()` 래퍼 함수 삭제
6. `module/settings/actions/index.ts`의 `import { disconnectRepository as disconnectRepositoryInternal, disconnectAllRepositoriesInternal }` 삭제
7. `module/settings/index.ts`의 barrel export에서 disconnect 관련 항목 제거 (이미 repository 모듈에서 export됨)
8. `module/settings/hooks/use-connected-repositories.ts`의 import 수정 — **현재 `../actions` (상대 경로)로 import하고 있으므로** (5차 검증 보정: `@/module/settings` barrel 경유가 아님), 아래와 같이 2개 import 문으로 분리:
   ```typescript
   // 변경 전
   import { getConnectedRepositories, disconnectRepository, disconnectAllRepositories } from "../actions";
   // 변경 후
   import { getConnectedRepositories } from "../actions";
   import { disconnectRepository, disconnectAllRepositories } from "@/module/repository";
   ```
9. `npm run build` 확인

> **⚠️ 4차 검증 추가 — 시그니처 변경 안전성 확인:**
>
> `disconnectRepository(repositoryId, userId)`에서 `userId` 파라미터를 제거하고 `requireAuthSession()` 내장으로 전환 시, **비-HTTP 컨텍스트**(Inngest 백그라운드 잡 등)에서 세션이 없어 호출이 실패할 수 있다.
>
> **검증 결과:** `inngest/functions/`에서 `disconnect` 관련 함수를 호출하지 않음 확인. 현재 `disconnectRepository`의 유일한 외부 소비자는 settings 래퍼이므로, 시그니처 변경은 안전하다.
>
> **단, 향후 배치 작업이나 관리자 기능에서 userId를 직접 전달해야 할 경우를 대비하여**, repository 모듈 내부에 `disconnectRepositoryInternal(repositoryId, userId)` 함수를 비공개(barrel export 제외)로 유지하는 것을 권장한다.

**이름 충돌 해소:** settings 모듈에서 disconnect 함수를 더 이상 export하지 않으므로 충돌 제거됨.
**연계 항목:** 6.3(Internal 함수 import)도 동시 해소.

### 5.4 `useConnectedRepositories` 다중 관심사 [Medium]

**위치:** `module/settings/hooks/use-connected-repositories.ts`

하나의 hook에서 관리하는 것:
1. 연결된 리포지토리 조회 (query)
2. 단일 리포지토리 연결 해제 (mutation #1)
3. 전체 리포지토리 연결 해제 (mutation #2)
4. 연결 해제 중인 리포지토리 ID 추적 (파생 상태)

**개선:** 쿼리와 뮤테이션을 분리:
- `useConnectedRepositories()` — 조회만
- `useDisconnectRepository()` — 단일 해제 뮤테이션
- `useDisconnectAllRepositories()` — 전체 해제 뮤테이션

---

## 6. Coupling (frontend-coupling)

### 6.1 `isCollapsed` Props Drilling — 7개 컴포넌트 [Critical → High 하향]

**위치:** `components/layouts/app-sidebar/`

> **⚠️ 4차 검증 보정:** 원래 "7단계"로 기술했으나, 실제 drilling 깊이는 **최대 2단계** (AppSidebar → Navigation → NavItem)이다. 나머지 5개 컴포넌트(Logo, UserProfile, ThemeToggle, LogoutButton, Footer)는 AppSidebar에서 **1단계 직접 전달**이다. 7개 컴포넌트가 동일 prop을 받는 것(breadth)과 7단계 drilling(depth)은 다른 문제. Context 도입의 ROI가 당초 평가보다 낮으므로 **심각도를 Critical → High로 하향 조정**한다. 8개 파일 동시 수정 리스크 대비 실질적 구조 개선이 제한적이므로, Phase 2가 아닌 **Phase 4로 이동**을 권장한다.

`AppSidebar`가 소유한 `isCollapsed` 상태가 모든 하위 컴포넌트에 prop으로 전달:

```
AppSidebar (owner: isCollapsed)
├── Logo          (prop: isCollapsed)
├── UserProfile   (prop: isCollapsed)
├── Navigation    (prop: isCollapsed)
│   └── NavItem   (prop: isCollapsed)
├── ThemeToggle   (prop: isCollapsed)
├── LogoutButton  (prop: isCollapsed)
└── Footer        (prop: isCollapsed)
```

모든 7개 하위 컴포넌트의 Props 인터페이스에 `isCollapsed: boolean`이 포함됨 (`types/index.ts` 확인).

**개선:** `SidebarContext` 도입:

```typescript
// contexts/sidebar-context.ts
const SidebarContext = createContext<{ isCollapsed: boolean }>({ isCollapsed: false });
export const useSidebarContext = () => useContext(SidebarContext);

// AppSidebar에서 Provider 래핑
<SidebarContext.Provider value={{ isCollapsed }}>
  <Logo onToggleCollapse={toggleCollapse} />
  <UserProfile user={session.user} />
  ...
</SidebarContext.Provider>
```

하위 컴포넌트들은 `useSidebarContext()`로 직접 접근. Props에서 `isCollapsed` 제거.

> **⚠️ 실행 주의:** 8개 파일 동시 수정 필요 — 하나라도 누락 시 TypeScript 빌드 실패:
> 1. `types/index.ts` — 모든 Props 인터페이스에서 `isCollapsed` 필드 제거
> 2. `app-sidebar.tsx` — 각 하위 컴포넌트에 prop 전달 코드 제거
> 3. `logo.tsx`, `user-profile.tsx`, `navigation.tsx`, `nav-item.tsx`, `theme-toggle.tsx`, `logout-button.tsx`, `footer.tsx` — `props.isCollapsed` → `useSidebarContext().isCollapsed`로 변경
> 4. `navigation.tsx → nav-item.tsx` 2단계 drilling도 제거
>
> ~~**참고 (2차 검증) — LogoutButton dead prop**~~ [삭제]
>
> **3차 검증 결과:** `logout-button.tsx` line 14에서 `{!isCollapsed && <span>Logout</span>}`로 **실제 사용 중**. dead prop이 아님. 7개 하위 컴포넌트 모두 `isCollapsed`를 능동적으로 사용하므로, Context 전환 시 모든 컴포넌트에서 `useSidebarContext()`로 교체해야 함.

### 6.2 크로스 모듈 쿼리키 Import [High]

**위치:** `module/suggestion/hooks/use-apply-suggestion.ts:8`

```typescript
import { REVIEW_QUERY_KEYS } from "@/module/review/constants";
```

suggestion 모듈이 review 모듈의 내부 상수에 직접 의존. review 모듈이 쿼리키를 변경하면 suggestion 모듈도 영향을 받음.

**개선 방안:**
- **Option A:** 공유 쿼리키를 `shared/constants/query-keys.ts`로 추출
- **Option B:** suggestion의 onSuccess에서 review 쿼리를 invalidate하는 대신, 이벤트 기반 패턴 사용
- **Option C (최소 변경):** review 모듈의 barrel export(`module/review/index.ts`)를 통해 import (이미 export됨)

### 6.3 Settings 모듈의 Internal 함수 Import [Medium]

**위치:** `module/settings/actions/index.ts:6-8`

```typescript
import {
  disconnectRepository as disconnectRepositoryInternal,
  disconnectAllRepositoriesInternal,
} from "@/module/repository/actions";
```

`Internal` 접미사 함수를 외부 모듈에서 import. 이 패턴은 repository 모듈의 내부 구현에 직접 결합.

**✅ 해결됨:** 항목 5.3의 settings 래퍼 제거와 동시 처리. repository 모듈의 disconnect 함수에 인증 가드를 내장시키고, Internal 접미사 함수를 rename하여 public API로 승격. settings 모듈의 래퍼와 import를 삭제하면 Internal 함수 외부 노출 문제도 해소. 상세 실행 순서는 5.3 참조.

### ~~6.4 Subscription 페이지의 QueryBoundary 미사용~~ [삭제]

> **검증 결과:** `app/dashboard/subscription/page.tsx:9-15`에서 이미 `<QueryBoundary>`로 래핑되어 있음. 이 항목은 사실과 다르므로 수정 대상에서 제외.

---

## 7. TypeScript Clean Code (typescript-clean-code)

### 7.1 `as` 타입 단언 6건 [High]

| 위치 | 코드 | 위험도 |
|------|------|--------|
| `subscription-content.tsx:85` | `data.user.subscriptionTier as "FREE" \| "PRO"` | `subscriptionTier`가 `string` 타입 — 런타임 불일치 가능 |
| `payment/lib/subscription.ts:47` | `user?.subscriptionTier as SubscriptionTier` | 동일 |
| `payment/lib/subscription.ts:91` | `usage.reviewCounts as Record<string, number>` | Prisma Json 필드 — 런타임 구조 미보장 |
| `payment/lib/subscription.ts:134` | `usage.reviewCounts as Record<string, number>` | 동일 |
| `payment/lib/subscription.ts:151` | `usage.reviewCounts as Record<string, number>` | 동일 |
| `github/lib/github.ts:235` | `diff as unknown as string` | Octokit mediaType diff 반환 타입 불일치 |

**개선:**
- `subscriptionTier`: Zod 스키마 또는 타입 가드 함수 도입
- `reviewCounts`: 런타임 파서 함수 도입 (`parseReviewCounts()`)
- `diff`: Octokit 타입 이슈 — 타입 가드 래퍼로 감싸기

> **✅ 확정 전략 — `parseReviewCounts()` 파싱 실패 시 빈 객체 반환:**
>
> `reviewCounts`는 사용량 집계 데이터로, 파싱 실패가 사용자 기능을 차단해서는 안 됨. throw 대신 **빈 객체 `{}` 반환** + 에러 로깅으로 처리:
>
> ```typescript
> // module/payment/lib/review-counts.ts
> export function parseReviewCounts(raw: unknown): Record<string, number> {
>   if (raw && typeof raw === "object" && !Array.isArray(raw)) {
>     return raw as Record<string, number>;
>   }
>   console.error("Invalid reviewCounts format:", raw);
>   return {};
> }
> ```
>
> `subscription.ts`의 3개 사용처(line 91, 134, 151) 모두 동시 적용 필수. 파싱 실패 시 사용량이 0으로 표시되어 사용자가 quota를 초과할 수 있지만, 이는 throw로 기능 전체가 중단되는 것보다 나은 trade-off.

### 7.2 8-parameter 함수 [High]

**위치:** `module/github/lib/github.ts:275`

```typescript
export async function commitFileUpdate(
  token: string,    // 1
  owner: string,    // 2
  repo: string,     // 3
  path: string,     // 4
  content: string,  // 5
  fileSha: string,  // 6
  message: string,  // 7
  branch: string    // 8
): Promise<{ commitSha: string }>
```

FN-01 규칙: 인자 최대 2개, 3개 초과 시 객체로 묶기.

**개선:**
```typescript
interface CommitFileUpdateParams {
  token: string;
  owner: string;
  repo: string;
  path: string;
  content: string;
  fileSha: string;
  message: string;
  branch: string;
}
export async function commitFileUpdate(params: CommitFileUpdateParams): Promise<{ commitSha: string }>
```

동일 파일의 `getFileContent` (5 params), `getPullRequestDiff` (4 params)도 마찬가지.

### 7.3 미사용 파라미터 [Medium]

**위치:** `module/payment/lib/subscription.ts:186-191`

```typescript
export async function updateUserTier(
  userId: string,
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  _polarSubscriptionId?: string,   // 미사용
  _polarCustomerId?: string,       // 미사용
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionStatus: status,
      // _polarSubscriptionId, _polarCustomerId 사용되지 않음
    },
  });
}
```

**개선:** 미사용 파라미터 제거하거나, 실제 DB 업데이트에 포함.

### 7.4 클라이언트 Hook의 불필요한 `console.error` [Medium]

**위치:** 5개 hook 파일

| 파일 | 라인 |
|------|------|
| `suggestion/hooks/use-apply-suggestion.ts` | 27 |
| `suggestion/hooks/use-dismiss-suggestion.ts` | 25 |
| `repository/hooks/use-connect-repository.ts` | 45 |
| `settings/hooks/use-connected-repositories.ts` | 26, 38 |

모든 경우에 `toast.error()`로 이미 사용자에게 에러를 표시한 후 `console.error()`를 호출. 클라이언트에서의 `console.error`는 프로덕션에서 의미 없는 로그.

**개선:** `console.error` 제거. 필요 시 에러 모니터링 서비스(Sentry 등)로 대체.

---

## Cross-Cutting Recommendations

### R1: 통합 서버 액션 Result 타입 (mutation 전용)

```typescript
// shared/types/server-action.ts
export type ServerActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; reason?: string };

// 정보성 상태가 필요한 경우에만 사용
export type ServerActionResultWithInfo<T> =
  | ServerActionResult<T>
  | { success: true; data: T; info: string };

// 사용 예 — mutation 계열
export async function connectRepository(params: ConnectRepositoryParams): Promise<ServerActionResultWithInfo<Repository>> {
  ...
  return { success: true, data: repository };
}
```

**적용 범위:** mutation 계열 서버 액션에만 적용. read(query) 계열(`getUserReviews`, `getConnectedRepositories`, `getUserProfile` 등 `useSuspenseQuery`에서 호출되는 함수)은 **throw 패턴을 유지**하여 React Query 에러 상태와 ErrorBoundary 작동을 보장한다. `getUserProfile()`은 5차 검증에서 `useSuspenseQuery` 사용이 확인되어 Result 전환 대상에서 제외됨.

### R2: 컬러 토큰 시스템 마이그레이션

1. `globals.css`에 미매핑 색상 2건(`--muted-foreground-alt: #606060`, `--primary-muted: #3d523d`)과 그라디언트 변수 2건(`--gradient-accent`, `--gradient-bg`) 추가
2. 21개 파일의 하드코딩 hex를 Tailwind 시맨틱 토큰으로 일괄 교체 (다크 모드 기준 검증)
3. `sidebar/constants/styles.ts`의 arbitrary value hex도 시맨틱 토큰으로 전환
4. ~~oklch(from ...) 상대 색상 구문~~ → CSS 변수 직접 사용으로 확정 (브라우저 호환성 확보)
5. 라이트 모드 대응은 디자인 확정 후 별도 Phase에서 `:root` CSS 변수 값 조정

### R3: SidebarContext 도입 (우선순위 하향)

`isCollapsed` prop을 Context로 전환하여 7개 컴포넌트의 props 인터페이스 단순화. 단, 실제 drilling depth가 최대 2단계이므로 ROI가 제한적. **Phase 4(컨벤션 정리)로 이동 권장**.

---

## Implementation Priority Matrix

| # | Finding | 심각도 | 노력 | 영향도 | 관련 파일 수 |
|---|---------|--------|------|--------|-------------|
| 1 | 하드코딩 hex 컬러 (3.1) | Critical | High | High | 21 |
| 2 | 서버 액션 에러 패턴 통일 (4.1) | Critical | High | High | 8+ |
| 3 | isCollapsed props breadth (6.1) | ~~Critical~~ **High** (4차 하향) | Medium | Medium | 8 |
| 4 | subscription-content 분해 (3.4, 5.1) | High | Medium | Medium | 1→5 |
| 5 | syncSubscriptionStatus 반환 통일 (4.3) | High | Low | Medium | 1 |
| 6 | NavItem 중복 + sidebar 상수 통합 (2.3, 5.2) | High | Low | Medium | 3 |
| 7 | 크로스 모듈 쿼리키 import (6.2) | High | Low | Medium | 2 |
| 8 | 8-param 함수 → 객체 (7.2) | High | Low | Low | 1 |
| 9 | as 타입 단언 제거 (7.1) | High | Medium | Medium | 3 |
| 10 | 인증 가드 통일 (4.2) | High | Low | Medium | 1 |
| 11 | payment 디렉토리명 통일 (1.1, 1.3) | Medium | Low | Low | 4+ |
| 12 | formatDistanceToNow 파일명 (1.2) | Medium | Low | Low | 1 |
| 13 | 쿼리키 상수 추출 (2.1) | Medium | Low | Low | 1 |
| 14 | Barrel export 통일 (2.5) | Medium | Low | Medium | 3 |
| 15 | Hook 반환형 통일 (4.4) | Medium | Medium | Medium | 6 |
| 16 | useConnectedRepositories 분리 (5.4) | Medium | Medium | Low | 1 |
| ~~17~~ | ~~QueryBoundary 적용 (6.4)~~ | ~~삭제~~ | — | — | — |
| 18 | 오타 수정 (3.3) | Low | Low | Low | 2 |
| 19 | 타입 접미사 통일 (2.2) | Low | Medium | Low | 8+ |
| 20 | console.error 제거 (7.4) | Medium | Low | Low | 5 |

**권장 실행 순서 (5차 검증 반영):**
1. **Phase 1 (Quick Wins):** #5, #6, #8, #10, #11(rename+오타 동시), #18, #20 — 각 1-2파일 변경, 즉시 개선
2. **Phase 2 (구조 개선):** #4, #7 — 새 컴포넌트 도입 (~~#3 Context 제거~~ → Phase 4로 이동)
3. **Phase 3 (시스템 변환):** #1(hex→토큰, 다크 모드 기준), #2(mutation만 Result 전환, read는 throw 유지), #9 — 다수 파일 일괄 변경
4. **Phase 4 (컨벤션 정리):** #3(SidebarContext — ROI 재평가 후), #12-17, #19 — 점진적 적용

**⚠️ Phase 간 의존성 (6차 검증 반영):**

| 선행 Phase | 후행 Phase | 의존 관계 | 위반 시 결과 |
|-----------|-----------|----------|------------|
| **Phase 1** (#11: payment rename) | **Phase 3** (#2: Result 전환) | `payment/action/` → `payment/actions/` rename이 선행되어야 Phase 3에서 올바른 경로 참조 가능 | Phase 3에서 import 경로 오류 → 빌드 실패 |
| **Phase 3** (#2: Result 전환) | **Phase 4** (#14: barrel export) | settings disconnect 래퍼 제거(5.3)가 Phase 3에 포함. Phase 4에서 barrel 변경 시 이미 제거된 export를 참조할 수 있음 | barrel export 목록 불일치 → 빌드 실패 |
| **Phase 3** (5.3: 래퍼 제거) | **Phase 4** (#14: settings barrel) | settings barrel에서 disconnect export 제거 + repository barrel에 `disconnectAllRepositories` 추가를 **원자적으로 처리** 필수 | 중간 상태에서 import 실패 → 빌드 실패 |
| **Phase 3** (#2 Step 4-5 + 5.3) | **Phase 4** (#16: Hook 분리) | `use-connected-repositories.ts`가 Phase 3에서 import 경로 변경(`../actions` → `@/module/repository`) + `onSuccess`/`onError` 패턴 변경됨. Phase 4에서 이 파일을 3개로 분해(5.4) 시 **Phase 3의 변경 사항을 반영한 최신 상태에서 작업** 필수 | Phase 3 변경분 누락 → 분해된 Hook에서 import 오류 또는 에러 처리 패턴 불일치 |

**절대 위반 금지 규칙:**
- Phase 1 → Phase 3 → Phase 4 순서를 역전하거나 건너뛰지 않는다
- Phase 3 (#2)에서 **read 계열 서버 액션(Step 1, 3)은 Result 전환 금지** [런타임 리스크 R-1]
- Phase 3 (#2) Step 4-5에서 **`onSuccess(result)` + `result.success` 분기 동시 추가 필수** [런타임 리스크 R-2]
- Phase 4 (#14) settings barrel 전환 후 **inngest 함수 import 수동 확인 필수** [런타임 리스크 R-3]
5. **Phase 5 (후속):** 라이트 모드 CSS 변수 값 조정 — 디자인 확정 후

---

## Unresolved Questions

- ~~hex 컬러 토큰 마이그레이션 시 라이트 모드 대응 범위?~~ → **해결됨**: 다크 모드 기준 Phase 3 진행, 라이트 모드는 디자인 확정 후 Phase 5에서 `:root` CSS 변수 조정 (본문 3.1 참조)
- ~~`ServerActionResult<T>` 도입 시 기존 클라이언트 hook의 에러 처리 일괄 수정 순서?~~ → **해결됨**: 1:1 쌍 단위 체크리스트 확정 (본문 4.1 참조)
- ~~barrel export wildcard(`export *`) 제거 시 외부 소비자 영향 범위?~~ → **해결됨**: 모듈별 명시적 export 목록 확정 + 실행 순서 dashboard→review→settings (본문 2.5 참조)
- ~~`subscription-content` 분해 시 `module/payment/ui/`로 이동 vs `app/` 내 유지?~~ → **해결됨**: `module/payment/ui/`로 이동 확정. 프로젝트의 모든 feature UI가 `module/*/ui/`에 위치하므로 일관성을 위해 `module/payment/ui/subscription-page.tsx` + `parts/` 구조로 분해한다 (본문 3.4, 5.1 참조). `app/dashboard/subscription/page.tsx`는 thin wrapper로 유지하고 `module/payment/ui/subscription-page`를 import만 한다.
- ~~**[Blocker]** `connectRepository`의 `status: "already_connected"` 정보성 상태를 `ServerActionResult<T>`로 어떻게 매핑할 것인가?~~ → **해결됨**: ~~3-state(`success: "info"`)~~ → 4차 검증에서 truthy 버그 발견. `ServerActionResultWithInfo<T>` 재설계: `success: true` + `info` 필드 방식으로 확정 (본문 4.1 참조)
- ~~`parseReviewCounts()` 파싱 실패 시 기본값 반환 vs throw 전략?~~ → **해결됨**: 빈 객체 `{}` 반환 + 에러 로깅 (본문 7.1 참조)
- ~~`disconnectRepository` 이름 충돌 해소 — settings 래퍼 제거 vs rename?~~ → **해결됨**: settings 래퍼 제거, repository 모듈에 인증 가드 내장 (본문 5.3 참조)
- ~~`radial-gradient`의 `oklch(from ...)` 상대 색상 구문 — 브라우저 지원 범위 확인 필요~~ → **해결됨**: `oklch(from ...)` 사용 안 함. CSS 변수(`--gradient-accent`, `--gradient-bg`) 직접 사용으로 확정 (본문 3.1 참조)

---

## Verification Log

> **검증일:** 2026-04-06
> **검증 방법:** 실제 코드베이스 대조 검증 (85+ 파일 탐색)
>
> | 항목 | 검증 결과 |
> |------|----------|
> | 6.4 QueryBoundary 미사용 | **오류** — 이미 `<QueryBoundary>` 사용 중. 삭제 처리 |
> | 3.1 hex 컬러 | **보완** — globals.css에 이미 동일 값 CSS 변수 존재. 중복 생성 방지 매핑 테이블 추가 |
> | 4.1 서버 액션 에러 | **보완** — 클라이언트 Hook 연쇄 파손 위험, connectRepository 비호환 주의사항 추가 |
> | 6.1 isCollapsed | **보완** — 8파일 동시 수정 체크리스트 추가 |
> | 5.3/6.3 disconnect | **보완** — 이름 충돌 + Internal 함수 제거 순서 주의사항 추가 |
> | 2.5 barrel export | **보완** — 외부 소비자 전수 조사 주의사항 추가 |
> | 1.1 payment rename | **보완** — config/ rename 연쇄 변경 주의사항 추가 |
> | 7.1 as 타입 단언 | **보완** — Prisma Json 파서 전략 주의사항 추가 |
>
> **2차 검증일:** 2026-04-06
> **2차 검증 방법:** 실제 코드베이스 import 추적 및 cross-module 의존성 분석
>
> | 항목 | 검증 결과 |
> |------|----------|
> | 1.1 payment rename | **보완** — `lib/auth.ts`(인증 핵심)가 `payment/config/flags`, `payment/config/polar`, `payment/lib/subscription` 3개 경로 의존. 영향 파일 2개 → 4+개로 보정 |
> | 2.5 barrel export | **보완** — settings 모듈의 `export * from "./lib/language"` wildcard 누락. inngest 백그라운드 잡이 의존. 모듈별 외부 소비자 수 정량 테이블 추가 |
> | 3.1 hex 컬러 | **보완** — `app-sidebar.tsx`의 `radial-gradient` inline style은 Tailwind 클래스 교체 불가. 별도 CSS 변수 처리 필요 |
> | 4.1 서버 액션 에러 | ~~**보완** — AI 모듈 silent failure 발견~~ **3차 검증에서 오류 확인** (아래 참조) |
> | 6.1 isCollapsed | ~~**보완** — LogoutButton dead prop 발견~~ **3차 검증에서 오류 확인** (아래 참조) |
>
> **3차 검증일:** 2026-04-06
> **3차 검증 방법:** 코드베이스 실행 경로 추적 및 2차 검증 주장 재검증
>
> | 항목 | 검증 결과 |
> |------|----------|
> | 4.1-⚠️4 AI 모듈 silent failure | **오류** — `app/api/webhooks/github/route.ts`는 `reviewResult.success`(line ~107)와 `summaryResult.success`(line ~154)를 이미 체크. silent failure 주장 삭제 |
> | 6.1 LogoutButton dead prop | **오류** — `logout-button.tsx` line 14에서 `{!isCollapsed && <span>Logout</span>}`로 실제 사용 중. dead prop 주장 삭제 |
> | 4.1-⚠️1 throw→Result 전환 순서 | **보완** — 1:1 쌍 단위 수정 순서 가이드 추가 (서버 액션 1개 + Hook 1개 → 빌드 확인 → 다음 쌍) |
> | 4.1-⚠️3 connectRepository 3-state | **보완** — UX 결정 미해결을 **실행 차단(Blocker)** 으로 격상. Phase 3 #2 착수 전 결정 필수 |
>
> **4차 검증일:** 2026-04-06
> **4차 검증 방법:** 코드베이스 실제 실행 경로 추적, JavaScript 의미론 분석, React Query 동작 원리 검증
>
> | 항목 | 검증 결과 |
> |------|----------|
> | 4.1-⚠️3 `success: "info"` 3-state | **오류** — `"info"`는 JavaScript truthy 값. `if (result.success)` 분기에서 true/info 구분 불가. `ServerActionResultWithInfo<T>`로 재설계: `success: boolean` 유지 + `info` 필드 방식 |
> | 4.1 Step 3 useSuspenseQuery | **오류** — `getConnectedRepositories()`, `getUserReviews()`가 `useSuspenseQuery`에서 호출됨. throw→Result 전환 시 React Query 에러 상태 소실. read 계열은 **throw 유지** 규칙 추가 |
> | 3.1 hex 컬러 라이트 모드 | **보완** — 매핑 테이블이 `.dark` 섹션에만 유효. `:root`는 oklch 값으로 완전히 다른 색상. 다크 모드 기준 Phase 3 진행 + 라이트 모드 별도 Phase 5 분리 |
> | 3.1 미매핑 색상 | **보완** — `#606060`, `#3d523d`에 대응하는 CSS 변수 없음. `--muted-foreground-alt`, `--primary-muted` 신규 변수 정의 확정 |
> | 3.1 oklch(from ...) | **보완** — Firefox 128 미만 미지원. CSS 변수(`--gradient-accent`, `--gradient-bg`) 직접 사용으로 확정. oklch 방식 폐기 |
> | 3.1 SIDEBAR_STYLES | **보완** — `styles.ts`의 Tailwind arbitrary value 내 hex도 시맨틱 토큰 전환 대상에 포함. opacity modifier 조합 처리 방법 명시 |
> | 5.3 settings 래퍼 제거 | **보완** — `disconnectRepository` 시그니처 `(repositoryId, userId)` → `(repositoryId)` 변경. inngest에서 미사용 확인으로 안전. 향후 배치 작업 대비 내부 함수 유지 권장 |
> | 6.1 isCollapsed drilling | **보정** — "7단계" → "7개 컴포넌트, 최대 2단계 depth". 심각도 Critical → High 하향. Phase 2 → Phase 4 이동 |
> | 2.5 settings 외부 소비자 | **보정** — 7개 → 9개. inngest/functions/review.ts, summary.ts 및 ai/github 모듈 포함 |
> | 3.3 오타 + 1.1 rename | **보완** — 오타 경로와 rename 실행 순서 충돌. Phase 1에서 동일 커밋으로 처리 규칙 추가 |
> | 4.1 mutation Hook Result→throw | **보완** — `use-apply-suggestion`, `use-dismiss-suggestion`의 재변환 패턴은 현재 reason 미활용이므로 유지. 향후 가이드 추가 |
>
> **5차 검증일:** 2026-04-06
> **5차 검증 방법:** 코드베이스 실행 경로 추적, 실제 import 경로 확인, 함수 존재 검증
>
> | 항목 | 검증 결과 |
> |------|----------|
> | 4.1 Step 1 getUserProfile | **오류** — 문서가 "useSuspenseQuery 미사용, 직접 호출"이라 기술했으나, `use-user-profile.ts:11`에서 `useSuspenseQuery`로 호출 중. Result 전환 시 `profile` 변수가 래퍼 객체가 되어 `profile.name` 등이 `undefined` 반환 (런타임 버그, 빌드 통과). **Step 1을 수정 대상에서 제외**, read 계열 throw 유지 규칙으로 분류 |
> | 2.5 review barrel export | **오류** — 문서 제안이 `getUserReviews`, `getReviewById`, `REVIEW_QUERY_KEYS`만 포함. 실제 barrel에는 `export * from "./types"`, `ReviewList`, `ReviewDetail`, `useReviews`, `REVIEWS_STALE_TIME_MS` 등 6개 export 라인 존재. 전체 반영 완료 |
> | 2.5 review `getReviewById` | **오류** — 코드에 `getReviewById`는 존재하지 않음. 실제 함수명은 `getUserReviewById` (`module/review/actions/index.ts:26`). 함수명 보정 완료 |
> | 2.5 dashboard barrel export | **오류** — 문서 제안이 `getDashboardData`만 포함. 실제 barrel에는 `StatsOverview` UI 컴포넌트, `ContributionStats`/`DashboardStats` 타입 export 존재. 전체 반영 완료 |
> | 5.3 실행 순서 Step 4 (barrel) | **누락** — `module/repository/index.ts`에 `disconnectAllRepositories`가 barrel export되지 않음. settings 래퍼 제거 후 repository barrel에서 import하려면 추가 필수. 실행 순서에 Step 4로 삽입 |
> | 5.3 실행 순서 Step 8 (import) | **오류** — `use-connected-repositories.ts`가 `@/module/settings` barrel이 아닌 `../actions` (상대 경로)로 import. 문서의 변경 지시를 실제 import 구조에 맞게 보정 (2개 import 문 분리) |
> | 4.1 Step 4-5 disconnect | **보완** — Step 3 삭제로 Step 4-5가 독립. 현재 `onSuccess`가 `result` 파라미터를 사용하지 않으므로, Result 전환 시 `onSuccess(result)` + `result.success` 분기 동시 추가 필수. 누락 시 에러가 성공 토스트로 표시 |
> | 4.1 connectRepository action | **누락** — `ConnectRepositoryResult`에 repository 데이터 필드 없음. `ServerActionResultWithInfo<Repository>` 전환 시 action 내부에서 repository 객체 반환 로직 추가 필요. 구체적 수정 가이드 추가 |
> | Phase 간 의존성 | **누락** — Phase 1(rename) → Phase 3(Result 전환) → Phase 4(barrel) 간 파일 경로 및 export 의존성 그래프가 명시되지 않음. 의존성 다이어그램 추가 |
>
> **6차 검증일:** 2026-04-07
> **6차 검증 방법:** 전체 문서 리스크 리뷰 — "빌드 통과, 런타임 실패" 유형의 사각지대 집중 분석
>
> | 항목 | 검증 결과 |
> |------|----------|
> | Executive Summary | **보완** — 런타임 리스크 경고 섹션(R-1, R-2, R-3) 신설. 빌드를 통과하지만 런타임에 실패하는 3가지 유형을 최상단에 명시 |
> | 4.1 Step 1, 3 취소선 표기 | **보완** — 취소선(`~~Step 1~~`)을 🚫 금지 아이콘으로 변경. 실행자가 "수정 불필요"를 "수정 가능하지만 건너뜀"으로 오독하는 위험 제거 |
> | 4.1 Step 4-5 onSuccess 패턴 | **보완** — 변경 전/후 코드 블록을 체크리스트 바로 아래에 인라인 삽입. `result` 파라미터 추가 + `if (!result.success)` 분기 + `return` 3가지 필수 요소를 명시적으로 나열 |
> | 2.5 settings barrel inngest | **보완** — `npm run build` 외에 inngest 함수 import 경로 수동 확인 명령(grep) 추가. 빌드만으로 커버되지 않는 동적 import 시나리오 대비 |
> | 1.1 `lib/auth.ts` 경로 의존 | **보완** — 경고를 ⚠️ → 🚨로 격상. 부분 커밋 금지 규칙 + 검증 명령(grep) 추가. 2개 import 경로(#1, #2)가 동일 커밋에서 변경되어야 함을 강조 |
> | Phase 간 의존성 | **보완** — 텍스트 다이어그램 → 구조화된 표 + "절대 위반 금지 규칙" 4개 항목으로 재구성. 런타임 리스크 R-1, R-2, R-3과 Phase별 매핑 명시 |
> | Unresolved Questions | **해결** — `subscription-content` 위치 결정: `module/payment/ui/`로 이동 확정. 프로젝트 전체 feature UI가 `module/*/ui/`에 위치하므로 일관성 확보 |
> | 검증 일자 동일 문제 | **인지** — 1~5차 검증이 모두 2026-04-06에 수행됨. 이후 코드 변경이 있을 경우 문서의 라인 번호, 함수명, import 경로가 실제 코드와 불일치할 수 있음. **각 Phase 착수 전에 해당 섹션의 파일 경로 및 라인 번호를 현재 코드베이스와 대조 확인할 것** |
>
> **7차 검증일:** 2026-04-07
> **7차 검증 방법:** 실제 코드베이스 전수 grep — 하드코딩 hex 컬러 파일 목록 교차 검증
>
> | 항목 | 검증 결과 |
> |------|----------|
> | 3.1 hex 파일 수 | **오류** — 문서가 19개 파일로 기술했으나 실제 21개 파일에서 하드코딩 hex 발견. 누락 2건: `components/layouts/app-sidebar/constants/styles.ts` (Tailwind arbitrary value 내 hex 8건), `module/suggestion/constants/index.ts` (suggestion status 컬러 3건). 파일 목록, Executive Summary, Implementation Priority Matrix, R2 일괄 보정 완료 |
