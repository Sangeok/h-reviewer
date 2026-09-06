---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-09-06"
completed-at: null
owners: []
related: []
approved-by: null
approved-at: null
approval-scope: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
legacy-record: true
migrated-at: "2026-09-06"
migrated-from: "docs/proposals/unused-code-cleanup-implementation-plan.md"
migration-note: "원문의 작업 범위와 상태를 보존한다. 이관은 후속 제품 구현의 자동 착수를 뜻하지 않는다."
---

> 이관 메모 (2026-09-06): 원문의 작업 범위와 상태를 보존한다. 이관은 후속 제품 구현의 자동 착수를 뜻하지 않는다. 경로·메타데이터 변경 전의 hash와 검토 영수증은 당시 기록이며 새 검증 결과가 아니다.

# 미사용 코드 정리 조사 및 구현 계획

- 작성일: 2026-09-06 (Asia/Seoul)
- 상태: Proposed — 코드베이스 재대조·문서 보완 완료, 코드 수정 미실행
- 위험도: STANDARD — 여러 모듈의 공개 export와 공통 UI를 함께 정리
- 재검토 기준: `develop`, `ba54c5eb8fe26df67e28d2e52fa2dd0d3c22b7e6`
- 최초 조사 기준: `b21436e720b2039607c567229270eb169465d792`. 첫 재검토 HEAD `62f403285fcdd207364061f303d8a5a9d0614c8c`와는 tracked tree 차이가 없었다. 최종 확인 중 현재 HEAD로 바뀌었으며 추가 변경은 P0 문서 2개의 provider binding 기록 방식뿐이다. 정리 대상 코드·T08 계약·T09 상태와 §11의 입력 해시는 동일하다.
- 조사 시작 시 `git status --short`: 출력 없음
- 현재 권한: 이 제안서 검토·수정. 아래 구현 작업은 후속 코드 수정 요청의 범위다.

## 1. 결론과 핵심 규칙

**실제 소비자가 없는 선언만 삭제하고, 내부 호출·프레임워크 진입점·호환성 계약이 있는 코드는 보존한다.**

현재 코드에서 바로 정리할 수 있는 항목은 아래 A01–A09다. 의존성 교체, 구독 분기 단순화, 공개 정적 파일 삭제는 B01–B03으로 분리했다. 우선순위는 유지보수 가치와 검증 범위를 뜻하며, 현재 장애의 심각도를 뜻하지 않는다.

**재검토 판정: Phase CLEAN의 A01–A09는 구현 착수 가능하다.** 기존 문서에는 테스트 실행 환경, 후속 테스트 준비 데이터, 검증 완료 조건의 누락·모호함이 있었으며 이번 재검토에서 보완했다. B01–B03의 실행 조건은 그대로 별도 적용한다. READY는 코드 변경이나 회귀 검증의 완료를 뜻하지 않는다.

| ID | 판정 | 대상 | 변경 요약 | 우선순위 |
| --- | --- | --- | --- | --- |
| A01 | 미사용 함수 | `decrementRepositoryCount` | 기존 단독 카운터 차감 함수 삭제 | 높음 |
| A02 | 미사용 파일 | `build-pr-url.ts` | 파일 1개와 재수출 2개 삭제 | 중간 |
| A03 | 미사용 함수·바인딩 | `getAuthUser`, `signUp` | 함수·주석과 구조분해 항목 삭제 | 중간 |
| A04 | 미사용 타입 묶음 | `SuggestionItem`, `SuggestionsData` | 타입·전용 import·재수출 삭제 | 중간 |
| A05 | 미사용 객체 멤버 | `REVIEW_QUERY_KEYS.DETAIL` | 상세 쿼리 키 팩토리 삭제 | 중간 |
| A06 | 미사용 객체 멤버 | `PLAN_PRICING.*.price` | 숫자 가격 2개 삭제, 표시용 label 유지 | 낮음 |
| A07 | 미사용 UI 선언 | Card 2개, Select 3개 | 구현과 export 삭제 | 중간 |
| A08 | 미사용 CSS | float 애니메이션 2종 | keyframes 2개와 class 2개 삭제 | 중간 |
| A09 | 불필요한 외부 공개 | 내부 헬퍼 4개, UI 내부 선언 5개 | 구현을 유지하고 export만 축소 | 낮음 |
| B01 | 대체 후 제거 가능 | `radix-ui` 직접 의존성 | Badge를 기존 개별 Slot 패키지로 전환 | 후속 |
| B02 | 논리적으로 중복 | 구독 동기화의 중첩 active 검사 | 분기 삭제 전 동작 테스트 보강 | 후속 |
| B03 | 저장소 내 참조 없음 | `public` 기본 SVG 5개 | 외부 URL 사용 여부 확인 후 삭제 | 후속 |

최소 예시: `buildPRUrl`은 정의와 두 배럴의 재수출만 검색되므로 세 위치를 함께 삭제한다. 반대로 `getRepositoryFileTree`는 객체에 함수로 주입된 뒤 호출되므로 유지한다.

대표 안티 패턴: **“다른 파일에서 함수 이름을 직접 호출하지 않는다” 또는 “테스트에서만 import한다”는 이유로 구현을 삭제하지 않는다.** 객체 shorthand, 주입된 콜백, 같은 파일 내부 사용, 자동 등록도 소비 경로다.

## 2. 조사 범위와 증거의 한계

### 확인한 내용

- Observed: Git이 추적하는 `.ts`, `.tsx`, `.mjs` 241개를 TypeScript Compiler API로 읽어 모듈 import·재수출·문자열 리터럴 동적 import 및 export 참조 후보를 조사했다.
- Observed: 후보별로 `app`, `components`, `features`, `inngest`, `lib`, `shared`, `scripts`를 명시해 이름과 호출부를 재검색했다. 배럴만 연결되는 경우와 실제 소비를 구분했다.
- Observed: `public` 파일, `app/globals.css`, package manifest·lockfile, Prisma schema·생성 client, Next/Vitest/ESLint/Prisma 설정, 관련 테스트와 기존 proposal을 확인했다.
- Contracted: [AGENTS.md](../../../AGENTS.md), [문서 작성 규칙](../../conventions/writing-docs.md), [TypeScript 규칙](../../conventions/typescript-clean-code-guide.md), [QueryBoundary 규칙](../../conventions/query-boundary.md)을 포함한 `docs/conventions/` 9개 문서를 확인했다. 내부 parts와 import 경계도 유지한다.
- Inferred: A01–A08은 기준 commit의 소비 경로를 기준으로 제거해도 현재 기능을 바꾸지 않는다는 판단이다. A09는 사용 중인 구현의 공개 범위만 줄인다.

### 한계

- AST 참조 분석은 후보 생성 수단이다. 객체 shorthand·동적 프로퍼티·문자열 기반 파일 접근을 단독으로 완전하게 판정하지 않는다. 최종 목록은 해당 파일 본문과 소비 경로를 추가 확인한 항목으로 제한했다.
- Git에서 제외한 생성물·외부 호출자·배포 서버 로그를 전체 분석한 것은 아니다. 공개 SVG의 외부 링크 사용 여부는 미확인이다.
- 라이브 GitHub·Polar·Google AI API, 운영 DB, 실제 로그인 UI를 호출하지 않았다. 번들 크기나 성능 개선량도 측정하지 않았다.
- 미사용 지역 변수 검사가 통과해도 미사용 export나 객체 멤버가 없다는 뜻은 아니다.
- `docs/`는 `.gitignore:4`의 `/docs/` 규칙으로 무시된다. 제안서가 디스크에 존재하는지와 Git 추적 여부는 별도로 확인해야 한다.

## 3. 구현 시 보존할 계약

### REQ-CLEAN-001: 사용자 화면과 접근 제어 보존

WHEN 사용자가 로그인·대시보드·저장소·리뷰·설정·구독 화면을 이용하면, 시스템은 정리 전과 동일한 접근 제어, 표시 정보, 로딩·빈 결과·실패 처리 및 사용자 동작을 제공해야 한다.

### REQ-CLEAN-002: 저장소 연결 해제의 원자성 보존

WHEN 저장소 연결 해제가 성공하면, 시스템은 기존 transaction 안에서 삭제된 저장소 수만큼 사용량을 반영해야 하며, IF 활성 리뷰 때문에 해제가 거부되면, THEN 저장소와 사용량을 변경하지 않아야 한다.

### INV-CLEAN-001: 영속 데이터와 실행 계약 유지

Prisma schema·migration, 기존 데이터, Review 상태·lease·trial credit, Inngest event·step 계약은 이 정리에서 변경하지 않는다. `reviewCounts`는 호환성 필드로 유지한다.

### CON-CLEAN-001: 최소 수정과 재확인

A01–A09에서 명시한 선언·export·CSS만 수정한다. 함수명 일괄 변경, 폴더 재구성, 배럴 전체 제거, 새 정적 분석 패키지 도입, `tsconfig` 강화는 포함하지 않는다. 구현 직전에 규약과 Git 상태를 다시 확인하고 새 소비자가 있으면 해당 항목의 삭제를 중단한다.

### CON-CLEAN-002: 기존 P0 계획의 상태 보존

[P0 상세 계획](../completed/2026-09-06-hreviewer-personal-review-coach-p0-implementation-plan.md)의 T09 상태는 현재 `BLOCKED`다. 이 정리의 검증으로 P0 release gate를 통과했다고 판단하거나 기존 proposal·release receipt의 상태를 갱신하지 않는다. B01–B03은 Phase CLEAN 완료 조건에 포함하지 않는다.

이 문서가 P0 계획에서 가져오는 계약은 T08의 연결 해제 transaction, `reviewCounts` 호환성 보존, T09 상태 보존뿐이다. P0의 나머지 구현 queue·배포·유료 평가 지시는 이 정리의 실행 범위가 아니다.

## 4. 확정 정리 항목과 파일별 수정 명세

아래 줄 번호는 기준 commit의 위치다. 구현 시에는 줄 번호보다 심볼과 검색 결과를 우선한다. 각 항목의 “완료 기준”은 구현 후 확인할 조건이며, 이번 조사에서 수행한 회귀 검증 결과가 아니다.

### A01. 사용되지 않는 독립 카운터 차감 함수

**근거**

- `features/payment/lib/subscription.ts:109`의 `decrementRepositoryCount`는 소스·테스트 전체에서 정의만 존재한다.
- 현재 연결 해제는 `features/repository/actions/index.ts:114,118` → `disconnectRepositories`로 위임한다.
- 실제 카운터 갱신은 `features/repository/lib/repository-disconnect.ts:241`에서 Repository 삭제와 같은 transaction 안에 있다.
- P0 상세 계획의 T08 계약(현재 1800행)은 기존 독립 `decrementRepositoryCount`를 사용하지 않도록 명시한다. 오래된 함수를 남기면 후속 구현이 transaction 밖 경로를 다시 사용할 여지가 생긴다.

**수정**

1. `features/payment/lib/subscription.ts`에서 `decrementRepositoryCount` 함수 전체를 삭제한다.
2. `getUserUsage`, `incrementRepositoryCount`, `getRemainingLimits`, `getUserTier`는 유지한다. 같은 파일의 현재 기능에서 사용한다.
3. repository disconnect 구현과 DB schema는 수정하지 않는다.

**완료 기준**: production·test 검색에서 함수명 0건. 기존 repository disconnect 단위 테스트가 통과하고 연결 해제 수동 검증에서 사용량이 이중 차감되지 않는다. 통합 테스트는 전용 test DB가 준비된 환경에서 별도로 실행한다.

### A02. 소비자가 없는 PR URL 유틸리티

**근거**: `features/ai/utils/build-pr-url.ts:1`의 `buildPRUrl`은 정의, `features/ai/utils/index.ts:3`, `features/ai/index.ts:58`의 재수출만 존재한다. 실제 호출과 테스트는 없다.

**수정**

1. `features/ai/utils/build-pr-url.ts`를 삭제한다.
2. `features/ai/utils/index.ts`에서 해당 re-export 한 줄을 삭제한다.
3. `features/ai/index.ts`의 Utils export 목록에서 `buildPRUrl`만 제거한다.
4. `parseCommand`, `stripFencedCodeBlocks`와 두 배럴 파일은 유지한다. 다른 곳의 URL 구성 로직을 이 함수로 통합하는 작업으로 확장하지 않는다.

**완료 기준**: 파일이 없고 소스·테스트에서 `buildPRUrl`과 `build-pr-url` 참조 0건. typecheck 성공.

### A03. 사용되지 않는 인증 wrapper와 client 바인딩

**근거**

- `lib/server-utils.ts:26`의 `getAuthUser`는 정의만 존재한다. 실제 서버 호출자는 `requireAuthSession`을 사용한다.
- `lib/auth-client.ts:4`의 `signUp`은 구조분해 export만 존재한다. 로그인은 `features/auth/ui/parts/login-card.tsx`의 `signIn.social` 경로다.

**수정**

1. `lib/server-utils.ts`에서 `getAuthUser`와 바로 앞의 해당 JSDoc만 삭제한다.
2. `lib/auth-client.ts`의 구조분해에서 `signUp`만 삭제한다.
3. `requireAuthSession`, `server-only`, `createAuthClient`, `polarClient` plugin, `signIn`, `useSession`, `signOut`, `customer`, `checkout`은 유지한다. 서버의 OAuth 가입 동작을 비활성화하는 변경은 하지 않는다.

**완료 기준**: 두 심볼의 소스·테스트 참조 0건. `/login`의 GitHub 로그인과 dashboard 로그아웃이 기존 경로로 동작한다.

### A04. 재수출만 남은 Suggestion 타입 묶음

**근거**: `features/suggestion/types/index.ts:11–12`의 `SuggestionItem`은 `Suggestion`의 별칭이고 `SuggestionsData`에서만 사용한다. `SuggestionsData`도 소비자가 없다. 둘 다 `features/suggestion/index.ts:5`에서 재수출만 한다. 실제 UI는 액션 반환 타입 등을 사용한다.

**수정**

1. `features/suggestion/types/index.ts`의 `SuggestionItem`, `SuggestionsData` 선언을 삭제한다.
2. 이 둘만을 위한 첫 줄의 `Suggestion` type import도 삭제한다.
3. `features/suggestion/index.ts`의 type export 목록을 `ApplySuggestionResult`만 남기도록 수정한다.
4. `ApplySuggestionResult`와 types 파일은 유지한다. Prisma `Suggestion` 모델과 실제 액션·UI 타입은 변경하지 않는다.

**완료 기준**: 삭제한 두 타입의 소스·테스트 참조 0건. suggestion 액션·UI typecheck 성공.

### A05. 등록도 소비도 없는 리뷰 상세 쿼리 키

**근거**: `features/review/constants/index.ts:3`의 `REVIEW_QUERY_KEYS.DETAIL`은 사용되지 않는다. 목록 쿼리는 `features/review/hooks/use-reviews.ts:10`에서 `LIST`를 쓰고, 상세 페이지는 `app/dashboard/reviews/[id]/page.tsx`가 서버에서 조회한다.

**수정**: `REVIEW_QUERY_KEYS`에서 `DETAIL`만 제거하고 `LIST`는 유지한다. `features/suggestion/hooks/use-apply-suggestion.ts:23`의 리뷰 목록 invalidate도 유지한다.

**주의**: `SUGGESTION_QUERY_KEYS.LIST`는 `DETAIL(reviewId)` 쿼리를 prefix로 무효화하는 현재 mutation 경로에서 사용된다. “LIST를 queryFn이 직접 등록하지 않는다”는 이유로 함께 삭제하면 안 된다.

**완료 기준**: `REVIEW_QUERY_KEYS`가 `LIST`만 가진다. 리뷰 목록·상세와 suggestion 적용 후 캐시 갱신 동작이 유지된다.

### A06. 표시 코드에서 읽지 않는 숫자 가격

**근거**: `features/payment/constants/index.ts:8–9`의 `price`는 읽는 곳이 없다. `features/payment/ui/parts/plan-card.tsx:36,78`은 `PLAN_PRICING.FREE.label`, `PLAN_PRICING.PRO.label`만 표시한다. checkout은 `subscription-page.tsx`에서 `slug: "pro"`로 시작한다.

**수정**: 다음과 같이 `price` 프로퍼티 2개만 제거한다.

```ts
export const PLAN_PRICING = {
  FREE: { label: "$0" },
  PRO: { label: "$99.99" },
} as const;
```

**완료 기준**: PlanCard의 기존 가격 문자열이 그대로 출력되고 기존 plan-card 테스트가 통과한다. 기존 테스트는 기능 설명 문구를 검사하며 가격을 직접 assert하지 않으므로, V-UI에서 Free `$0`·Pro `$99.99`를 따로 확인한다. Polar 상품 가격·product id·checkout 설정은 변경하지 않는다. 이 숫자가 실제 결제 금액의 기준이라는 주장을 하지 않는다.

### A07. 사용하지 않는 공통 UI 프리미티브 5개

| 파일 | 삭제할 구현 | 같이 삭제할 항목 | 보존할 구현 |
| --- | --- | --- | --- |
| `components/ui/card.tsx` | `CardAction`(51행), `CardFooter`(74행) | 하단 export의 두 항목; `CardHeader` 23행의 `has-data-[slot=card-action]:grid-cols-[1fr_auto]` 클래스만 | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` |
| `components/ui/select.tsx` | `SelectGroup`(15행), `SelectLabel`(90행), `SelectSeparator`(130행) | 하단 export의 세 항목 | Root·Trigger·Value·Content·Item 및 두 scroll button |

**근거**: 다섯 이름은 각 정의와 하단 export에만 나타난다. `card-action` slot을 수동 지정하는 다른 JSX도 없다. 실제 언어 선택 UI는 `features/settings/ui/parts/profile/language-selector.tsx:3`의 다섯 컴포넌트만 사용한다.

**수정 범위**: 해당 함수 블록과 연결된 export만 삭제한다. `card.tsx`, `select.tsx` 파일 전체 또는 Radix select 패키지를 삭제하지 않는다. 남는 함수의 서식·시그니처를 일괄 변경하지 않는다.

**완료 기준**: 다섯 선언과 `card-action` 관련 잔여 참조 0건. typecheck·build 및 V-UI 검증 통과. 새로운 삭제 전용 단위 테스트는 만들지 않는다.

### A08. 로그인에서 더 이상 쓰지 않는 float CSS

**근거**: `app/globals.css:178,187,216,220`의 `@keyframes float`, `@keyframes float-delayed`, `.animate-float`, `.animate-float-delayed`는 이 CSS 안에서만 참조한다. 현재 `features/auth/ui/login-ui.tsx:29,35`는 `.animate-pulse-slow`를 사용한다.

**수정**: 위 keyframes 2개와 class rule 2개만 삭제한다.

**보존**

- `.animate-fade-in`과 `fadeIn`: `login-features.tsx:9`에서 사용한다.
- 전역 `.animate-pulse-slow`와 `pulseSlow`: 로그인 배경에서 사용한다.
- `app-sidebar.tsx`의 scoped `pulse-slow`: 전역 애니메이션과 opacity 값이 다르다. 같은 class 이름이라는 이유로 합치거나 삭제하지 않는다.
- chart/sidebar 등의 theme token: 이번에 전체 제거 가능성을 확정하지 않았으므로 유지한다.

**완료 기준**: 삭제한 두 class와 keyframes 참조 0건. 로그인 feature 등장 효과와 배경 pulse, sidebar 배경이 유지된다.

### A09. 내부에서 사용하지만 외부 공개가 필요 없는 선언

**이 항목은 구현 삭제가 아니라 export 축소다.** 다음 9개 선언은 같은 파일에서 사용되며 외부 소스·테스트의 소비자는 확인되지 않았다.

| 파일 | 외부 공개를 제거할 이름 | 내부 사용 근거 | 정확한 수정 |
| --- | --- | --- | --- |
| `features/ai/lib/review-prompt.ts` | `buildSectionInstruction`, `getSuggestionLimit` | 289행, 136행 | 함수 앞 `export`만 제거 |
| `features/ai/lib/suggestion-format.ts` | `formatSuggestionLocation` | 32행 | 함수 앞 `export`만 제거 |
| `features/suggestion/lib/apply-code-change.ts` | `replaceNearestOccurrence` | 26행 | 함수 앞 `export`만 제거 |
| `components/ui/alert-dialog.tsx` | `AlertDialogPortal`, `AlertDialogOverlay` | Content의 52–62행 | 하단 export 목록에서만 제거 |
| `components/ui/select.tsx` | `SelectScrollUpButton`, `SelectScrollDownButton` | Content의 74행, 84행 | 하단 export 목록에서만 제거 |
| `components/ui/badge.tsx` | `badgeVariants` | Badge의 타입과 42행 | 하단 export를 `export { Badge }`로 변경 |

**완료 기준**: 함수 본문·내부 호출·타입 표현은 그대로이고 외부 export만 사라진다. 기존 review-prompt·suggestion-format 테스트 및 typecheck 통과. 함수 반환 타입의 구성 요소인 공개 타입이나 테스트에서 직접 import하는 다른 helper까지 일괄 비공개 처리하지 않는다.

## 5. 후속 검증을 거쳐 처리할 항목

### B01. Badge의 Slot 경로 통일 후 `radix-ui` 직접 의존성 제거

**관찰**: 앱 소스의 `radix-ui` import는 `components/ui/badge.tsx:3` 한 곳이다. Button은 이미 `@radix-ui/react-slot`을 사용한다. 로컬 `radix-ui` 1.4.3은 Slot 모듈을 재수출하며 자체 dependency에 Slot 1.2.3을 지정한다. 프로젝트의 직접 Slot 설치본은 1.2.4다. 따라서 교체는 import 철자만의 변경이 아니며 버전 차이 검증이 필요하다.

**구현안**

1. Badge의 import를 `import { Slot } from "@radix-ui/react-slot"`으로 변경한다.
2. `const Comp = asChild ? Slot.Root : "span"`을 `const Comp = asChild ? Slot : "span"`으로 변경한다. namespace와 컴포넌트 export의 형태 차이를 반드시 함께 수정한다.
3. 기존 `@radix-ui/react-slot` 직접 의존성은 유지한다.
4. `npm.cmd uninstall radix-ui --ignore-scripts`로 `package.json`과 `package-lock.json`을 함께 갱신한다. 잠금 파일을 수동 편집하거나 무관한 패키지 업그레이드를 섞지 않는다.
5. `components/ui/badge.test.tsx`를 추가해 기존 `react-dom/server` 패턴으로 일반 span, `asChild` anchor의 단일 루트·`href`·`data-slot`, Badge와 자식의 class 병합을 검증한다. 교체 전 테스트 통과를 먼저 확인한 뒤 교체 후에도 같은 테스트를 실행한다. SSR은 이벤트·ref 동작을 검증하지 못하므로 기존 Slot forwarding 본문도 대조하고, 차이가 발견되면 B01을 보류한다. 제거 여부만 검사하는 테스트는 만들지 않는다.

**완료 기준**: 앱 import와 root dependency에서 `radix-ui`가 사라지고 Badge 동작·전체 필수 검사 통과. 다른 패키지의 전이 의존성 때문에 lockfile에 남는 `radix-ui`를 강제로 없애지 않는다. 번들 절감량은 별도 측정 전 수치화하지 않는다.

### B02. 구독 동기화의 중복 active 조건

**관찰**: `features/payment/actions/config.ts:109–124`에서 먼저 전체 배열의 active 항목을 찾고, active가 없는 `else if (lastestSubscription)`에서 다시 `lastestSubscription.status !== "active"`를 검사한다. 같은 배열을 동기적으로 확인하므로 이 안쪽 조건은 항상 참이다.

**구현안**: 안쪽 `if`와 대응 주석만 제거하고 기존 `updateUserTier(user.id, "FREE", status)` 및 성공 반환을 한 단계 올린다. 별도 버그 수정으로 확대하지 않도록 정렬 정책, 첫 구독 선택, status 매핑, 외부 API 호출 순서를 유지한다.

**검증 보강**: 기존 `features/payment/actions/config.test.ts`는 `getSubscriptionData`를 검증하며 sync 분기 자체는 검증하지 않는다. 이 파일의 기존 mock에 `subscriptions.list`, `updateUserTier` 참조를 노출하고 다음 사례를 추가한 뒤 분기를 단순화한다.

테스트 준비는 다음으로 고정한다. 현재 `USER.polarCustomerId`는 `null`이므로 그대로 쓰면 구독 조회 분기에 도달하지 못한다.

1. `vi.hoisted`의 `mocks`에 `subscriptionsList`, `updateUserTier`를 추가하고 기존 두 module mock의 `list`, `updateUserTier`에 각각 연결한다. `syncSubscriptionStatus`도 같은 파일에서 import한다.
2. 새 describe의 `beforeEach`에서 네 mock(`requireAuthSession`, `findUnique`, `subscriptionsList`, `updateUserTier`)을 `mockReset()`한 뒤 session을 `{ user: { id: "user-1" } }`, user를 `{ ...USER, polarCustomerId: "customer-1" }`, tier 갱신 결과를 `undefined`로 설정한다. 기존 `getSubscriptionData` 테스트와 fixture를 일괄 변경하지 않는다.
3. 조회 성공 응답은 `{ result: { items: [...] } }`로 만든다. 유효한 각 항목에는 문자열 `id`, `status`가 모두 있어야 한다. 이 shape가 아니면 type guard에서 제거되어 의도한 분기를 검증하지 못한다.

| 사례 | 기대 결과·호출 |
| --- | --- |
| `[canceled, active]` | `{ success: true, status: "ACTIVE" }`, `updateUserTier("user-1", "PRO", "ACTIVE")` 정확히 1회 |
| active 없음, 첫 유효 항목 canceled | `{ success: true, status: "CANCELLED" }`, FREE/CANCELLED 갱신 정확히 1회 |
| active 없음, 첫 유효 항목 expired·trialing 등 다른 문자열 | `{ success: true, status: "EXPIRED" }`, FREE/EXPIRED 갱신 정확히 1회. 기존 status 매핑 유지 |
| 빈 items 또는 id/status가 잘못된 항목만 있음 | `{ success: false, message: "No active subscription found" }`, tier 갱신 0회 |
| `subscriptionsList` reject | `{ success: false, message: "Failed to sync with Polar" }`, tier 갱신 0회 |
| user 없음 또는 customer id 없음 | `{ success: false, message: "No Polar customer Id found" }`, list·tier 갱신 0회 |

조회에 도달하는 사례에서는 `subscriptionsList({ customerId: "customer-1" })`도 정확히 1회인지 확인한다. 인증·user 조회는 기존처럼 `try` 밖에 두고, tier 갱신 실패의 catch 동작도 유지한다. 에러 로그를 spy하면 각 테스트 후 복원한다.

**완료 기준**: 위 테스트 통과와 기존 응답 shape 유지. 결제/구독 로직을 건드리므로 A 항목과 별도 변경 단위로 수행한다.

### B03. 기본 정적 SVG 5개

**관찰**: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`의 파일명 참조가 앱 코드·CSS·README에서 발견되지 않았다. 파일 import 없이 URL로 외부에서 접근하는지는 확인하지 않았다.

**진행 조건**: 유지해야 하는 외부 링크·임베드가 없다는 프로젝트 사용 범위 확인 또는 해당 정적 URL 폐기에 대한 명시적 결정이 필요하다. 이를 확인하기 전에는 그대로 둔다.

**조건 충족 후 수정**: 다섯 경로만 삭제한다. `public/` 전체와 자동 인식되는 `app/favicon.ico`는 삭제하지 않는다. 로그인·대시보드에서 깨진 이미지 요청이 없는지 확인한다.

## 6. 삭제하면 안 되는 오탐 목록

| 대상 | 유지 근거 |
| --- | --- |
| `prisma/schema.prisma:315`의 `reviewCounts` | P0 상세 계획 1033·1792·1821행이 schema 호환 목적으로 유지하도록 명시. 읽히지 않는다는 이유로 migration을 만들지 않는다. |
| `getRepositoryFileTree` | `build-deterministic-pr-context.ts:143–145`의 reader 객체에 함수 주입, 590행에서 호출. 실제 경로가 있다. |
| `createGenerateReviewHandler`, `createGenerateSummaryHandler`, 실패 handler, scheduler·reconciler | 테스트 외부 import뿐 아니라 각 파일의 실제 Inngest 등록/생성 경로에서 소비한다. |
| `app/**/page.tsx`, `layout.tsx`, `route.ts`, metadata·HTTP method export | 프레임워크 진입점이다. 파일 간 import가 없을 수 있다. |
| `QueryBoundary`, repository/suggestion skeleton 내부 컴포넌트 | 실제 부모 fallback과 list skeleton에서 사용. 초기 데이터 전달만으로 실패/재조회 경계가 불필요해지지 않는다. |
| `SUGGESTION_QUERY_KEYS.LIST` | 적용·dismiss 성공 시 query invalidation에 사용. |
| `@prisma/client` | Git 제외된 생성 client가 `@prisma/client/runtime/client`를 import. 추적 소스의 직접 import 검색만으로 판단하면 놓친다. |
| `@tailwindcss/typography`, `tw-animate-css` | `app/globals.css:2–3`에서 plugin/import로 사용. |
| `@types/pg` | 직접 문자열 import 대신 TypeScript의 ambient/type resolution으로 소비할 수 있는 타입 패키지. 직접 import 없음은 제거 근거가 아니다. |
| `FREE_REVIEW_TRIAL_ENABLED`, `PRO_UPGRADE_ENABLED`와 관련 분기 | 환경별로 켜지는 현재 기능. 로컬에서 false여도 dead code가 아니다. |
| `scripts/check-model-availability.mjs`, 평가·DB 준비 스크립트 | package scripts·테스트·P0 검증 절차가 진입점이다. 이번 조사에서 라이브 실행하지 않았다. |
| `lib/formatDistanceToNow.ts` | 파일명 규약 정리는 가능하지만 실제 소비자가 있는 파일이므로 미사용 삭제 대상이 아니다. |

## 7. Phase CLEAN: 확정 항목 A01–A09 정리

- status: Proposed
- readiness: READY — 기준 commit에서 삭제·수정 범위가 확정됨. 실행 전 소비자 재검색은 필수다.
- satisfies: REQ-CLEAN-001, REQ-CLEAN-002
- preserves: INV-CLEAN-001
- governed-by: CON-CLEAN-001, CON-CLEAN-002
- verifies: REQ-CLEAN-001, REQ-CLEAN-002
- 진입 조건: 후속 코드 수정 요청, 작업 트리 겹침 없음, 삭제 후보의 새 소비자 없음.
- 종료 조건: A01–A09 완료, V-STATIC·V-REGRESSION·V-UI 및 V-DISCONNECT의 단위·수동·통합 검증 통과 증거 기록. 필요한 UI 계정이나 test DB가 없어 미실행한 경우 코드를 작성할 수는 있지만 상태는 `구현 완료 / 검증 대기`로 남기고 Phase CLEAN 완료로 표시하지 않는다. skip은 해당 검증의 통과가 아니다.
- 범위: A 항목에 명시한 파일만 수정/삭제. 이 단계의 schema·env·migration·package 변경은 0개.

구현 diff의 허용 경로는 아래 **18개(17개 수정, 1개 삭제)**다. 작업 시작 시 사용자 변경을 별도로 기록하고, 종료 시 이 정리가 만든 diff만 대조한다. 기존 테스트 파일은 읽기·실행 대상이며 A 단계에서 수정하지 않는다.

| 작업 | 정확한 경로 | 변경 |
| --- | --- | --- |
| A01 | `features/payment/lib/subscription.ts` | 수정 |
| A02 | `features/ai/utils/build-pr-url.ts` | 삭제 |
| A02 | `features/ai/utils/index.ts` | 수정 |
| A02 | `features/ai/index.ts` | 수정 |
| A03 | `lib/server-utils.ts` | 수정 |
| A03 | `lib/auth-client.ts` | 수정 |
| A04 | `features/suggestion/types/index.ts` | 수정 |
| A04 | `features/suggestion/index.ts` | 수정 |
| A05 | `features/review/constants/index.ts` | 수정 |
| A06 | `features/payment/constants/index.ts` | 수정 |
| A07 | `components/ui/card.tsx` | 수정 |
| A07·A09 | `components/ui/select.tsx` | 수정 |
| A08 | `app/globals.css` | 수정 |
| A09 | `features/ai/lib/review-prompt.ts` | 수정 |
| A09 | `features/ai/lib/suggestion-format.ts` | 수정 |
| A09 | `features/suggestion/lib/apply-code-change.ts` | 수정 |
| A09 | `components/ui/alert-dialog.tsx` | 수정 |
| A09 | `components/ui/badge.tsx` | 수정 |

### TASK-CLEAN-01: 미사용 함수·타입·객체 멤버 제거

- satisfies: REQ-CLEAN-001, REQ-CLEAN-002
- preserves: INV-CLEAN-001
- governed-by: CON-CLEAN-001, CON-CLEAN-002
- 구현 대상: A01–A06의 파일과 정확한 심볼. 삭제할 파일은 `features/ai/utils/build-pr-url.ts` 1개다.
- 순서: 소비자 재검색 → 정의와 연결된 재수출 동시 제거 → 잔여 참조 검사.
- 검증: V-STATIC, V-REGRESSION, V-UI, V-DISCONNECT.
- 중단 조건: 새 caller, 외부 계약, 작업 트리 충돌이 발견되거나 삭제에 schema/동작 변경이 필요해지는 경우.

### TASK-CLEAN-02: 미사용 UI·CSS 제거와 내부 export 축소

- satisfies: REQ-CLEAN-001
- preserves: INV-CLEAN-001
- governed-by: CON-CLEAN-001, CON-CLEAN-002
- 구현 대상: A07–A09의 파일과 정확한 선언·CSS rule.
- 순서: UI 정의와 export 동시 삭제 → 불필요한 selector 삭제 → 내부 helper의 export만 제거.
- 검증: V-STATIC, V-REGRESSION, V-UI.
- 중단 조건: 삭제 대상의 동적 사용·외부 import가 발견되거나 기존 UI의 배치·스크롤·애니메이션이 달라지는 경우.

## 8. 재현 명령과 검증 계획

### V-STATIC: 소비자와 연결 관계 확인

- verifies: REQ-CLEAN-001, REQ-CLEAN-002
- 역할: 누락 import·잔여 export를 발견하는 보조 검증. 실제 화면·DB 동작의 증명은 아래 수동·회귀 검증과 함께 한다.
- state: Planned — 구현 후 실행. 조사 시 동일 범위의 검색과 아래 강화 typecheck는 실행했다.

PowerShell, 저장소 root에서 실행한다. `rg` exit 1은 검색 결과 없음이며 exit 2는 검색 실패다. 명령 오류를 “미사용”으로 해석하지 않는다.

```powershell
git status --short
git rev-parse HEAD
rg --files docs/conventions

$cleanupRoots = @('app', 'components', 'features', 'inngest', 'lib', 'shared', 'scripts')
rg -n 'decrementRepositoryCount|buildPRUrl|build-pr-url|getAuthUser|\bsignUp\b|SuggestionItem|SuggestionsData' $cleanupRoots
rg -n 'REVIEW_QUERY_KEYS|PLAN_PRICING' $cleanupRoots
rg -n 'CardAction|CardFooter|card-action|SelectGroup|SelectLabel|SelectSeparator' $cleanupRoots
rg -n 'animate-float|@keyframes float' app components features
rg -n 'buildSectionInstruction|getSuggestionLimit|formatSuggestionLocation|replaceNearestOccurrence|AlertDialogPortal|AlertDialogOverlay|SelectScrollUpButton|SelectScrollDownButton|badgeVariants' $cleanupRoots
npx.cmd tsc --noEmit --incremental false --noUnusedLocals --noUnusedParameters --pretty false
```

예상 결과: 첫 심볼 검색과 UI 삭제 검색 및 float 검색은 0건. 객체 검색에서는 제거할 멤버가 없어야 한다. A09 검색에는 정의와 내부 호출이 남아야 하며 export만 없어야 한다. 추가로 TS/JS의 namespace import·객체/배열 동적 사용이 새로 생겼는지 확인한다.

검색만으로 완료 판정을 내리지 않는다. A05는 `REVIEW_QUERY_KEYS`의 키가 `LIST` 하나인지, A06은 두 plan에 `label`만 남았는지 파일 본문을 확인한다. A09의 9개 선언은 표에 지정된 각 파일에서 선언·본문·내부 호출이 보존되고 `export` modifier와 named export 양쪽에 공개 항목이 없는지 확인한다. `git diff --check`와 `git diff --name-status`로 위 18개 경로 및 A 항목 외의 수정이 섞이지 않았는지도 확인한다.

### V-REGRESSION: 기존 테스트와 필수 검사

- verifies: REQ-CLEAN-001, REQ-CLEAN-002
- state: Planned
- 목적: 기존 UI 출력·권한 경계·연결 해제·AI 포맷 계약의 회귀 확인과 build 가능성 확인.

현재 `vitest.config.ts`는 모든 `*.test.ts(x)`를 포함한다. `scripts/verify-calibration.test.ts:59–60,200`은 `.env.local`·`.env`를 읽은 뒤 `CALIBRATION`이 비어 있지 않으면 실제 Google AI 호출과 결과 파일 쓰기를 실행한다. 문자열 `"0"`도 실행 조건이다. P0 평가도 `P0_QUALITY_MODE=capture`이면 유료 호출·파일 쓰기로 이어진다. 따라서 아래 읽기 전용 사전 점검을 **같은 shell에서 검사 직전에** 실행하고 실패하면 멈춘다. 환경값이나 비밀값을 출력하지 않는다.

```powershell
@'
const fs = require("node:fs");
const dotenv = require("dotenv");
const cleanupEnv = { ...process.env };
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) {
    dotenv.populate(cleanupEnv, dotenv.parse(fs.readFileSync(file)), { override: false });
  }
}
if (cleanupEnv.DOTENV_KEY) throw new Error("Use a cleanup test environment without dotenv vault loading.");
if (cleanupEnv.CALIBRATION) throw new Error("Cleanup tests require CALIBRATION to be empty or absent.");
if (cleanupEnv.P0_QUALITY_MODE !== undefined && cleanupEnv.P0_QUALITY_MODE !== "validate") {
  throw new Error("Cleanup tests require P0_QUALITY_MODE=validate or absent.");
}
if (cleanupEnv.TEST_DATABASE_URL) throw new Error("Run database integration tests separately under V-DISCONNECT.");
console.log("Cleanup test environment preflight passed.");
'@ | node.exe
if ($LASTEXITCODE -ne 0) { throw 'Cleanup test preflight failed; do not run the following tests.' }
```

이 사전 점검은 설정을 변경하지 않는다. 실패하면 live 평가 설정을 상속하지 않는 검증 환경에서 다시 실행한다. 단순히 shell의 변수를 지우는 것만으로 `.env`의 설정을 무효화할 수 있다고 가정하지 않는다. 다른 설정 경로가 열리지 않도록 `DOTENV_KEY`가 있는 환경도 사전 점검에서 중단한다.

빠른 확인이 필요하면 기존 Vitest에서 아래 파일을 대상으로 실행할 수 있다. 최종 PR 전에는 그 아래 네 가지 필수 검사를 모두 실행한다. 빠른 확인을 생략하고 전체 테스트부터 실행해도 된다. 각 명령의 exit code를 따로 기록하고 하나라도 실패하면 완료로 표시하지 않는다.

```powershell
npm.cmd run test -- features/repository/lib/repository-disconnect.test.ts features/settings/actions/index.test.ts features/payment/actions/config.test.ts features/payment/ui/parts/plan-card.test.tsx features/payment/ui/parts/usage-card.test.tsx features/ai/lib/review-prompt.test.ts features/ai/lib/suggestion-format.test.ts

npm.cmd run test
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

전체 테스트에서 calibration·DB suite의 skip 건수를 별도 기록한다. P0 평가의 `validate` 실행은 로컬 corpus 검증일 뿐 유료 품질 평가 통과가 아니다. 일반 테스트의 성공으로 DB 통합 검증까지 통과했다고 쓰지 않는다. `next-build`, `vercel-build`는 모델 확인과 migration deploy를 수행하므로 이 정리의 build 검사 대신 사용하지 않는다. `npm.cmd run build`도 `.next` 생성과 build 환경 구성이 필요한 실행이므로 문서 재검토의 읽기 전용 검사와 구분한다.

### V-UI: 실제 화면의 보존 여부

- verifies: REQ-CLEAN-001
- destination: 로컬 dev의 `/login`, `/dashboard`, `/dashboard/repository`, `/dashboard/reviews`, `/dashboard/reviews/[id]`, `/dashboard/settings`, `/dashboard/subscription`.
- state: Planned
- 절차: 로그인/로그아웃 경로, 리스트의 정상·빈 결과·로딩·실패 표시, 리뷰 상세의 suggestion 적용/dismiss 후 갱신을 확인한다. 해당 외부 쓰기 동작은 후속 검증에서 허용된 test 저장소를 사용한다.
- A07 확인: 설정의 언어 선택을 키보드로 열고 선택·닫기, 연결 해제 dialog의 열기·취소, 카드 header 배치 유지.
- A08 확인: 로그인 feature 등장 효과와 배경 pulse를 확인하고 sidebar의 별도 pulse도 유지되는지 본다. light/dark 화면을 확인한다.
- A06 확인: Free/Pro 카드 가격 문자열과 사용량 표시 유지. 결제 자체를 수행할 필요는 없다.
- 결과: 오류·깨진 이미지·새 UI 차이가 없음을 기록하고 UI 변경 증거용 스크린샷을 남긴다.

### V-DISCONNECT: 연결 해제와 카운터 보존

- verifies: REQ-CLEAN-002
- state: Planned
- destination: 기존 `features/repository/lib/repository-disconnect.test.ts`, 전용 DB 환경의 `features/repository/lib/repository-disconnect.integration.test.ts`, 허용된 로컬 test 계정/저장소.
- 성공 사례: 활성 리뷰 없는 test 저장소 한 개 해제 → 해당 저장소만 사라지고 `repositoryCount`가 정확히 1 감소.
- 거부 사례: 활성 리뷰 존재 → 기존 거부 표시, 저장소와 카운터 유지.
- 전체 해제 사례: 현재 대상 수만큼만 감소, 이미 해제된 대상을 다시 조작해 이중 차감하지 않음.
- 운영 데이터를 준비하거나 migration을 실행해서 검증 환경을 만들지 않는다. 전용 DB가 없으면 통합 검증을 미실행으로 기록한다.

통합 실행은 이미 schema가 준비된 전용 PostgreSQL test DB를 사용하는 별도 환경에서 아래 한 파일로 제한한다. `TEST_DATABASE_URL`의 DB 이름은 `_test`로 끝나고 schema는 `public`이어야 하며, `DATABASE_URL`·`DIRECT_URL`과 대상 DB가 달라야 한다(`lib/test/create-test-prisma-client.ts`). 기존 fixture는 test row 생성·삭제를 수행하므로 일반 읽기 전용 검사로 취급하지 않는다. URL은 로그·문서에 기록하지 않는다.

```powershell
if (-not $env:TEST_DATABASE_URL) { throw 'A prepared dedicated TEST_DATABASE_URL is required.' }
npm.cmd run test -- features/repository/lib/repository-disconnect.integration.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Repository disconnect integration verification failed.' }
```

실행한 commit, 실제 pass/skip 수, 단일·전체 성공 및 활성 리뷰 거부 결과를 기록한다. 환경 미비 시 §7의 `검증 대기` 규칙을 적용한다.

## 9. 이번 조사에서 실제 수행한 검증

| 상태 | 명령/행위 | 결과 |
| --- | --- | --- |
| Executed | `git status --short`, `git rev-parse HEAD`, `git branch --show-current`, 최초·중간·최종 HEAD의 `git diff --stat` 및 P0 계약 diff 확인 | 시작 시 변경 없음. 최종 HEAD의 추가 변경은 P0 문서 2개, 정리 대상 코드·편입 계약·기록한 입력 해시 변경 없음 |
| Executed | 추적 TS/TSX/MJS 241개에 대한 읽기 전용 AST 후보 분석 및 후보별 `rg` 재검색 | A 항목의 정의·재수출·내부 호출과 보존 대상 확인 |
| Executed | `npx.cmd tsc --noEmit --incremental false --noUnusedLocals --noUnusedParameters --pretty false` | exit 0, 진단 없음. 설정 파일 변경·emit 없음 |
| Executed | package·설정·생성 client·CSS 및 P0 계획 대조 | CSS/Prisma 의존성과 `reviewCounts` 유지 계약 확인 |
| Executed | A01–A09를 TypeScript Compiler API·PostCSS의 메모리 사본에 적용한 가상 검증 | TS/TSX 16개 수정·1개 삭제 후 강화 typecheck 진단 0개. CSS rule 4개 제거, fadeIn·pulseSlow 보존. 디스크 쓰기·emit 없음 |
| Executed | V-REGRESSION 사전 점검 스니펫을 가상 환경값 10종으로 실행 | 일반·validate 환경 허용, `CALIBRATION=0`·`.env` 재주입·capture·DB·vault 환경 차단 확인. 실제 `.env` 읽기와 외부 호출 없음 |
| Executed | 설치된 `write-sdd-spec`의 `validate_sdd_traceability.py --strict --format json`으로 이 문서 검사 | 오류 0개, 요구사항 2개 모두 Task·검증 연결 확인 |
| Executed | 문서의 로컬 링크·코드 fence·UTF-8 검사 | 로컬 링크 5개 모두 존재, fence 짝 일치, 대체 문자 없음 |
| Not executed | product test·lint·build, UI·DB·외부 API 검증 | 문서 작성 작업이며 product 코드를 바꾸지 않음. 위 구현 후 검증 계획과 구분 |

CLI typecheck 성공은 **최초 조사 시 현재 코드 기준선** 결과다. 가상 검증은 제안된 삭제 후 타입 연결과 CSS 구조가 성립하는지 확인한 별도 결과이며, 실제 파일 적용 후 test·build·UI·DB 검증을 대체하지 않는다.

## 10. 완료·중단·복구 기준

1. 구현자는 삭제한 파일·선언과 export만 줄인 항목을 구분해 보고하고, A01–A09 각각의 완료 기준을 확인한다.
2. 새 소비자나 계약 충돌이 있으면 해당 항목만 보류하고 근거를 이 제안서에 기록한다. 실패를 회피하려고 호출부·테스트·설정을 넓게 삭제하지 않는다.
3. B01–B03은 별도의 후속 범위가 확정될 때 수행한다. Phase CLEAN을 완료해도 이 항목들이 자동 승인되지는 않는다.
4. 회귀가 발생하면 해당 작업의 diff/commit만 되돌리고 사용자 변경은 보존한다. A 항목은 데이터 변경이 없어 DB 복구 절차가 필요하지 않다. B01 복구 시 Badge와 manifest·lockfile을 함께 복구한다.
5. 문서만 작성한 현재 상태에서는 제품 구현 완료로 표시하지 않는다. 구현과 검증이 완료되면 front matter를 `status: "completed"`, `stage: null`로 갱신하고 완료일을 파일명에 붙여 같은 작업에서 `docs/proposals/completed/`로 옮긴다.

이 문서를 Git에 포함할 때는 `docs/` 전체의 ignore를 해제하지 말고 아래 파일 하나만 명시한다. 이번 작성 작업에서는 staging하지 않는다.

```powershell
git add -f -- docs/proposals/active/unused-code-cleanup-implementation-plan.md
git ls-files --error-unmatch -- docs/proposals/active/unused-code-cleanup-implementation-plan.md
```

## 11. 재검토 근거와 재확인 기준

### 발견한 문제와 문서에 반영한 해결

| 문제 | 해결 위치·내용 |
| --- | --- |
| 전체 test 명령의 실제 AI 호출·파일 쓰기 조건이 빠져 있었음 | V-REGRESSION에 dotenv 우선순위를 반영한 사전 점검 추가. P0 `validate`와 DB 통합 실행을 구분 |
| B02의 기존 user fixture는 customer id가 없어 검증할 분기에 도달하지 못함 | B02에 mock 연결, reset, customer id, Polar 응답 shape와 6가지 기대 결과 명시 |
| B01의 Slot 버전 차이를 지적하면서도 동작 테스트가 선택 사항이었음 | B01의 교체 전후 SSR 검증을 필수로 하고 이벤트·ref 검증의 한계 및 보류 조건 명시 |
| 가격 보존이 기존 plan-card 테스트로 직접 검증되는 것으로 오해할 수 있었음 | A06·V-UI에 실제 가격 문자열의 별도 확인 명시 |
| 미실행 검증을 기록하는 것만으로 Phase 완료 가능한지 모호했음 | §7·V-DISCONNECT에 `구현 완료 / 검증 대기` 상태와 실제 완료 조건 통일 |
| 최초 HEAD와 현재 HEAD가 달랐고 변경 경로가 여러 절에 흩어져 있었음 | 현재 HEAD·정리 대상 코드 동일 여부 확인, §7에 18개 허용 경로 집계 |

### 검토 범위와 동작·산출물 연결

- 구현 source: 이 문서 전체. 규약 source: `AGENTS.md` 및 `docs/conventions/*.md` 9개. P0 source는 CON-CLEAN-002에서 한정한 T08·호환성·T09 상태 계약만 편입한다.
- 검토 프로필: HIGH-RISK — 인증·카운터 보존, B02의 구독 분기, 외부 효과가 있는 검증 명령을 포함해 대조했다. 문서 상단 STANDARD는 A 정리 자체의 구현 위험도다.
- A01·A03: 소비자 검색과 가상 삭제 후 타입 검사로 unused 여부를 교차 확인했다. 실제 `requireAuthSession`·OAuth plugin·settings → repository disconnect → transaction 경로를 유지한다. 실패·재시도·보상 처리는 기존 disconnect 구현과 테스트를 검증 대상으로 연결했다.
- A02·A04·A05·A06·A09: 소유 파일, 재수출, 내부 호출, 쿼리 무효화 소비자를 대조했다. 가상 변경의 최종 타입 연결은 오류 0개이며, 구현 후에는 V-STATIC의 삭제 부재·보존 존재 조건을 각각 검사한다.
- A07·A08: 최종 UI는 기존 App Router 페이지 → feature UI → 남는 Card/Select/AlertDialog/Badge 및 `app/globals.css`가 구성한다. 언어 Select의 두 scroll button, dialog portal·overlay, 가격 label, login·sidebar animation의 본문·의존성을 보존한다. 실제 렌더링 결과의 검증 목적지는 V-UI다.
- B01·B02: 별도 구현 시 package·lockfile·Slot shape 및 sync의 기존 응답·호출 횟수를 검증한다. B03의 외부 SVG URL 소비는 저장소 분석으로 확정할 수 없어 원래의 조건부 보류를 유지한다. Core의 미결정 사항으로 전환하지 않는다.
- framework·생성물: route/metadata·Inngest 등록·Prisma schema/client 생성·CSS plugin 구성은 변경하지 않는다. 생성 client가 사용하는 Prisma runtime과 ambient 타입을 삭제 대상에서 제외했다. build 출력은 아직 생성·검증하지 않았다.
- 명령 분류: 파일 열람·심볼 검색·해시·emit 없는 가상 검증은 `safe-replay`. test/lint/build·패키지 삭제·staging은 실행 구조만 대조하는 `manifest-only`. 실제 UI 계정·DB fixture·외부 API 상태는 `volatile-non-replayable`이며 본 재검토에서 실행하지 않았다. `.env` 값·배포 로그·외부 링크 사용 여부를 준비 완료라고 주장하지 않는다.

### Minimal Replay Anchor / Durable Receipt

이 기록은 후속 구현 시 **같은 검토 근거인지 비교하기 위한 기록**이며 결함 부재·모든 외부 소비자 발견·실행 검증 통과를 증명하지 않는다. 최종 응답에 기재한 이 문서의 SHA-256과 함께 사용한다. 이 문서 또는 아래 근거가 바뀌면 새로 대조하며, Git HEAD만 같다는 이유로 기존 판정을 재사용하지 않는다.

- Repository identity: `hreviewer-cleanup-20260906`; HEAD: `ba54c5eb8fe26df67e28d2e52fa2dd0d3c22b7e6`.
- Scope: §7 Phase CLEAN의 A01–A09. §5 B01–B03의 지시·조건도 검토했으나 Core 실행 대상은 아니다.
- 수집 recipe: `git ls-files -c -o --exclude-standard -z -- app components features inngest lib shared scripts public` 결과 중 확장자 `ts|tsx|mjs|css|svg|json`을 선택한다. 여기에 `AGENTS.md`, `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `prisma.config.ts`, `prisma/schema.prisma`를 추가하고 중복 제거·경로 오름차순 정렬한다.
- SHA-256 계산: 경로 구분자는 `/`. path-set digest는 정렬된 경로를 LF로 연결한 UTF-8(끝 LF 없음)의 hash. content digest는 각 `경로 + NUL + 파일 원본 bytes의 SHA-256 소문자 hex`를 LF로 연결한 UTF-8의 hash. 무시된 규약·생성물도 같은 방식으로 계산한다. secret 파일은 이 수집 대상에 넣지 않는다.

| 근거 집합 | 파일 수 | path-set SHA-256 | content SHA-256 |
| --- | --- | --- | --- |
| 위 수집 recipe | 256 | `9377d370553d1ab74740dbb455f568255493e377cbf31ab785eb55065760269f` | `3c6805c7e4297f974181b04a1e48c833233df3c388972c6d55873d5b9813819e` |
| `docs/conventions/` 바로 아래 `.md` 전체 | 9 | `4128ed38e19e7c8006daa766ee3c35a43e6ff6b08ca5ffddcd66b241b2ed6195` | `257b746b05c6af2f6984650d1a316d36d0e71e66ec7f6084f566476f45110fe2` |
| `lib/generated/prisma/` 재귀 파일 전체 | 18 | `c0be2aaeab0b10196b55724805be3e66ee37aed3537607180bd65776a2318181` | `257956e47d4c4c4badca1ac3329a5d15d3c7486cdf1cf2a049986eaada4c698f` |
| `.next/types/` 재귀 파일 전체 | 2 | `62e765026b9a8deb1cc64d37c240a5511ce664c0a4203397bad9bca9ec52d183` | `3bb336c755de6cd213c4d86c38fd5e79c8792915b058c6c664cb03deb0df2d78` |
| `.next/dev/types/` 재귀 파일 전체 | 3 | `2e2443c185627fb6158988cb569022cbedda130452498c5ce75201e4f8c60753` | `b81a442820ee0c447a35d685cb613d55a1f276205d34e56a47d5bb13ee9790ce` |

직접 참조 문서와 로컬 생성물·설치본의 원본 bytes SHA-256은 다음과 같다. P0 문서 내용 전체의 hash는 상태·참조 변경 감지용이며, 그 전체를 이번 구현 범위로 편입하지 않는다.

| 경로 | SHA-256 |
| --- | --- |
| `docs/proposals/completed/2026-09-06-hreviewer-personal-review-coach-p0-implementation-plan.md` | `c0e969ac3f71a72177ccf7ed75cd1d931676a51c082e0e46a12dca0b26ca9682` |
| `next-env.d.ts` | `7b550dda9686c16f36a17bf9051d5dbf31e98555b30d114ac49fc49a1e712651` |
| `node_modules/typescript/package.json` | `822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6` |
| `node_modules/dotenv/lib/main.js` | `3b2fbc2d9380e853e1dbff4e33f1db0ca6293d6bba53f6234e7d51303cef8c64` |
| `node_modules/radix-ui/package.json` | `5c48cfd411dff63080cfe8f9c6b0a0ef54e53885591d14b7ae35292602476424` |
| `node_modules/radix-ui/dist/index.js` | `adba9a863d798d65476d0f83ec474d61bdd3b8976830e2d635c9f14750efdde0` |
| `node_modules/@radix-ui/react-slot/package.json` | `e0172952ed89c2f84377b9cdd7dd521909277a3f4b314edb895250992cff51a4` |
| `node_modules/@radix-ui/react-slot/dist/index.js` | `966be2f4725d098a3d600b5ed40bd7cecec6fef73fbbb460be30373b2f6010c8` |
| `node_modules/@radix-ui/react-slot/dist/index.d.ts` | `a346701ad6dcdaa58e388fe0995fc5304c09c395b8cba68ed872780f8c102004` |

가장 영향이 큰 “현재 사용자가 없고 삭제 후 연결도 성립한다”는 판단은 문자열 검색과 다른 경로인 Compiler API의 메모리 변환·타입 진단으로 교차 확인했다. 변환 명세는 §4의 정확한 삭제/비공개 목록이며 `noEmit=true`, `incremental=false`, `noUnusedLocals=true`, `noUnusedParameters=true`로 검사했다. CSS는 PostCSS AST에서 §4 A08의 네 rule만 제거해 남은 fade/pulse를 확인했다. UI·DB·외부 상태의 최신성은 보장하지 않으며 §8의 후속 검증으로 닫는다.

이 receipt는 사용자가 수정을 요청한 이 문서에 저장한다. final pass의 무수정 완료 여부와 이 문서 자체의 content identity는 최종 검토 응답에 기록한다. 이 문서의 수정·생성물 갱신·dependency 재설치·신규 소비자 추가 시 이전 receipt를 현재의 통과 결과로 취급하지 않는다.
