# Review Module 리팩토링 명세

> **Status**: `TODO`
> **Created**: 2026-04-02
> **Updated**: 2026-04-03
> **대상**: `module/review/` (6개 파일, ~330줄)
> **분석 스킬**: typescript-clean-code, frontend-predictability, frontend-readability, frontend-coupling, frontend-cohesion, frontend-file-naming, naming-conventions

---

## 요약

`module/review/`는 다른 모듈(repository, settings, dashboard)에 비해 구조적 성숙도가 낮다.
`types/` 디렉토리 부재, 인라인 타입 정의, 26개 하드코딩 hex 색상, 163줄 단일 컴포넌트, Badge 잘못된 import 등 **총 18건**의 이슈가 발견되었다.

### 이슈 요약 테이블

| ID | 심각도 | 제목 | 스킬 | 영향 파일 |
|----|--------|------|------|-----------|
| C-1 | Critical | 인라인 30줄 ReviewWithSuggestions 타입 | clean-code | ui/review-detail.tsx |
| C-2 | Critical | types/ 디렉토리 부재 | cohesion, file-naming | (신규 생성) |
| C-3 | Critical | 26개 하드코딩 hex 색상값 | readability | ui/review-list.tsx, ui/review-detail.tsx |
| I-1 | Important | ReviewsData 타입 중복 정의 | clean-code | hooks/use-reviews.ts, ui/review-list.tsx |
| I-2 | Important | review.review.substring(0, 300) null 안전성 | clean-code | ui/review-list.tsx |
| I-3 | Important | getReviews 함수명이 user-scoping 미표현 | predictability | actions/index.ts 외 4개 |
| I-4 | Important | 일관성 없는 null 처리 패턴 | predictability | ui/review-list.tsx |
| I-5 | Important | ui/parts/ 디렉토리 부재 (163줄 단일 컴포넌트) | cohesion, file-naming | ui/review-list.tsx |
| I-6 | Important | suggestion 모듈 barrel 우회 import | cohesion, coupling | ui/review-detail.tsx |
| I-7 | Important | Badge를 lucide-react에서 잘못 import | naming | ui/review-list.tsx |
| I-8 | Important | 반복적 status badge 렌더링 (3개 유사 블록) | readability | ui/review-list.tsx |
| I-9 | Important | 116줄 map callback 깊은 JSX 중첩 | readability | ui/review-list.tsx |
| I-10 | Important | [id]/page.tsx barrel 우회 내부 경로 import | coupling | app/dashboard/reviews/[id]/page.tsx |
| I-11 | Important | ReviewWithSuggestions 수동 타입이 Suggestion에 밀결합 | coupling | ui/review-detail.tsx |
| N-1 | Nice | getReviewById 입력 검증 부재 | clean-code | actions/index.ts |
| N-2 | Nice | ReviewList(default) vs ReviewDetail(named) export 불일치 | predictability, naming | ui/*.tsx |
| N-3 | Nice | 매직 넘버 300 (preview 자르기) | readability | ui/review-list.tsx |
| N-4 | Nice | useReviewDetail hook 부재 | cohesion | (미래 필요 시) |

### 심각도 분포

- **Critical**: 3건 (C-1, C-2, C-3)
- **Important**: 11건 (I-1 ~ I-11)
- **Nice-to-Have**: 4건 (N-1 ~ N-4)

---

## 현재 구조 vs 목표 구조

### 현재

```
module/review/
├── index.ts                  (barrel — ReviewDetail 미포함)
├── actions/index.ts          (getReviews, getReviewById)
├── constants/index.ts        (REVIEW_QUERY_KEYS, REVIEWS_STALE_TIME_MS)
├── hooks/use-reviews.ts      (ReviewsData 타입 로컬 정의)
└── ui/
    ├── review-list.tsx       (163줄, 인라인 타입, 하드코딩 색상)
    └── review-detail.tsx     (95줄, 30줄 인라인 타입)
```

### 목표

```
module/review/
├── index.ts                  (barrel — 모든 public API 포함)
├── actions/index.ts          (getUserReviews, getUserReviewById)
├── constants/index.ts        (+ REVIEW_PREVIEW_MAX_CHARS)
├── types/index.ts            (ReviewsData, ReviewListItem, ReviewDetailData, ReviewStatus)
├── hooks/use-reviews.ts      (타입을 types/에서 import)
└── ui/
    ├── review-list.tsx       (~35줄, parts 합성)
    ├── review-detail.tsx     (~80줄, semantic token, barrel import)
    └── parts/
        ├── review-card.tsx
        ├── review-empty-state.tsx
        └── review-status-badge.tsx
```

---

## Critical

### C-1. 인라인 30줄 ReviewWithSuggestions 타입

**스킬**: typescript-clean-code

**현재 문제**:

`ui/review-detail.tsx:11-41`에 30줄짜리 인터페이스가 UI 컴포넌트 파일에 인라인 정의되어 있다.
Prisma의 `Review`, `Suggestion` 모델과 `SuggestionSeverity`, `SuggestionStatus` enum을 수동으로 재선언한다.

```typescript
// ui/review-detail.tsx:11-41 — 현재
interface ReviewWithSuggestions {
  id: string;
  prTitle: string;
  // ... 30줄의 수동 타입 선언
  suggestions: Array<{
    severity: "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO"; // Prisma enum 수동 복제
    status: "PENDING" | "APPLIED" | "DISMISSED" | "CONFLICTED"; // Prisma enum 수동 복제
    // ... 14개 필드
  }>;
}
```

**문제점**:

1. `severity`, `status` 필드가 Prisma enum(`SuggestionSeverity`, `SuggestionStatus`)을 문자열 리터럴로 수동 복제
2. `review.status`가 `string`으로 선언 — 실제로는 `"completed" | "failed" | "pending"`만 가능
3. Prisma 스키마 변경 시 이 타입을 수동으로 동기화해야 함

**해결안**:

`getReviewById`의 반환 타입에서 자동 파생한다.

```typescript
// types/index.ts — 개선
import type { getReviewById } from "../actions";

export type ReviewDetailData = NonNullable<Awaited<ReturnType<typeof getReviewById>>>;
```

```typescript
// ui/review-detail.tsx — 개선
import type { ReviewDetailData } from "../types";

interface Props {
  review: ReviewDetailData;
}
```

---

### C-2. types/ 디렉토리 부재

**스킬**: frontend-cohesion, frontend-file-naming

**현재 문제**:

프로젝트의 다른 모듈은 모두 `types/index.ts`를 가지고 있다:

| 모듈 | types/ 존재 | 타입 수 |
|------|------------|---------|
| repository | ✅ | 3 |
| settings | ✅ | 2 |
| dashboard | ✅ | 7 |
| suggestion | ✅ | 2 |
| **review** | **❌** | **0** |

review 모듈의 타입은 3곳에 흩어져 있다:
- `hooks/use-reviews.ts:7` — `ReviewsData`
- `ui/review-list.tsx:11` — `ReviewsData` (중복)
- `ui/review-detail.tsx:11-41` — `ReviewWithSuggestions`

**해결안**:

```typescript
// types/index.ts (신규 생성)
import type { getReviews, getReviewById } from "../actions";

/** 리뷰 목록 조회 결과 (getReviews 반환 타입) */
export type ReviewsData = Awaited<ReturnType<typeof getReviews>>;

/** 리뷰 목록의 단일 항목 */
export type ReviewListItem = ReviewsData[number];

/** 리뷰 상세 조회 결과 (getReviewById 반환 타입, null 제외) */
export type ReviewDetailData = NonNullable<Awaited<ReturnType<typeof getReviewById>>>;

/** 리뷰 상태 */
export type ReviewStatus = "completed" | "failed" | "pending";
```

---

### C-3. 26개 하드코딩 hex 색상값

**스킬**: frontend-readability

**현재 문제**:

`globals.css`의 dark theme에 이미 CSS 변수가 정의되어 있지만, review 모듈은 동일한 값을 hex로 하드코딩한다.

| 하드코딩 hex | CSS 변수 | Tailwind 토큰 | 사용 횟수 |
|-------------|----------|---------------|-----------|
| `#0a0a0a` | `--card` | `bg-card` | 5 |
| `black` | `--background` | `bg-background` | 2 |
| `#1a1a1a` | `--border`, `--secondary` | `border-border`, `bg-secondary` | 8 |
| `#2d3e2d` | `--ring` | `ring` | 5 |
| `#4a6a4a` | `--primary` | `text-primary` | 3 |
| `#e0e0e0` | `--foreground` | `text-foreground` | 3 |
| `#d0d0d0` | `--secondary-foreground` | `text-secondary-foreground` | 1 |
| `#707070` | `--muted-foreground` | `text-muted-foreground` | 4 |
| `#606060` | `--chart-4` (의미 불일치) | hex 유지 또는 별도 변수 필요 | 2 |
| `#ff6b6b` | `--destructive` | `text-destructive` | 1 |
| `#3a1a1a` | (≈ destructive-bg) | — | 2 |
| `#3a3020` | (매핑 없음) | — | 2 |
| `#d4a574` | (매핑 없음) | — | 1 |

**예시** (`ui/review-list.tsx:24`):

```tsx
// ❌ 현재
<Card className="bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">

// ✅ 개선
<Card className="bg-gradient-to-b from-card to-background border-border">
```

**해결안**:

1. 1:1 매핑 가능한 색상 → Tailwind semantic token으로 교체
2. 매핑 불가능한 색상은 아래 분류에 따라 처리:

| 색상 | 분류 | 처리 방법 |
|------|------|-----------|
| `#606060` | `--muted-foreground`(`#707070`)와 ~15% 밝기 차이 | hex 유지 또는 `globals.css`에 `--muted-foreground-dim: #606060` 추가 |
| `#3d523d` | completed badge gradient 끝점, `--chart-2`에 정의되나 의미 불일치 | I-8에서 gradient를 `bg-primary/10`으로 대체하면 자연 해소 |
| `#3a1a1a` | `--destructive-bg`(`#3a1a1a`)와 정확히 일치 | `bg-destructive-bg` 토큰 사용 |
| `#3a3020`, `#d4a574` | 매핑 없음 (warning 계열) | hex 유지 또는 `globals.css`에 `--warning`, `--warning-foreground` 추가 |

> **주의**: `#606060`을 `text-muted-foreground`로 단순 치환하면 timestamp·terminal header 텍스트가 눈에 띄게 밝아져 의도된 시각적 계층이 무너진다. 반드시 별도 변수를 사용하거나 hex를 유지해야 한다.

---

## Important

### I-1. ReviewsData 타입 중복 정의

**스킬**: typescript-clean-code

**현재 문제**:

동일한 타입이 두 파일에 각각 정의되어 있다:

```typescript
// hooks/use-reviews.ts:7
type ReviewsData = Awaited<ReturnType<typeof getReviews>>;

// ui/review-list.tsx:11
type ReviewsData = Awaited<ReturnType<typeof getReviews>>;
```

**해결안**: C-2에서 생성하는 `types/index.ts`에 통합하고, 두 파일에서 import한다.

---

### I-2. review.review.substring(0, 300) null 안전성

**스킬**: typescript-clean-code

**현재 문제** (`ui/review-list.tsx:123`):

```tsx
<pre>{review.review.substring(0, 300)}...</pre>
```

Prisma 스키마에서 `review String @db.Text`는 non-nullable이지만, 프론트엔드 코드에서 방어적 코딩이 필요하다.
또한 `review.review`라는 접근 패턴이 혼란을 줄 수 있다.

**해결안**:

```tsx
<pre>{(review.review ?? "").substring(0, REVIEW_PREVIEW_MAX_CHARS)}...</pre>
```

---

### I-3. getReviews 함수명이 user-scoping 미표현

**스킬**: frontend-predictability

**현재 문제** (`actions/index.ts:6, 26`):

```typescript
export async function getReviews() {
  const session = await requireAuthSession();
  // 실제로는 현재 사용자의 리뷰만 조회
}

export async function getReviewById(reviewId: string) {
  const session = await requireAuthSession();
  // 실제로는 현재 사용자 소유 리뷰만 조회
}
```

함수명이 전체 리뷰를 조회하는 것처럼 보이지만, 실제로는 인증된 사용자의 리뷰만 반환한다.
repository 모듈의 `getUserRepositories`와 비교하면 일관성이 떨어진다.

**해결안**:

```typescript
// actions/index.ts — 개선
export async function getUserReviews() { ... }
export async function getUserReviewById(reviewId: string) { ... }
```

**영향 범위**:

| 파일 | 변경 내용 |
|------|-----------|
| `actions/index.ts` | 함수명 변경 |
| `types/index.ts` | `import type { getReviews, getReviewById }` → `import type { getUserReviews, getUserReviewById }` 및 `ReturnType<typeof ...>` 참조 변경 |
| `hooks/use-reviews.ts:4` | import 변경 |
| `index.ts` | re-export 자동 반영 (`export *`) |
| `app/dashboard/reviews/page.tsx:2` | import 변경 |
| `app/dashboard/reviews/[id]/page.tsx:1` | import 변경 |

> **참고**: Phase 1에서 `types/index.ts`가 생성된 후에는 `ui/review-list.tsx`가 더 이상 actions에서 직접 import하지 않으므로 영향 범위에서 제외된다.

---

### I-4. 일관성 없는 null 처리 패턴

**스킬**: frontend-predictability

**현재 문제** (`ui/review-list.tsx`):

```tsx
// line 23 — optional chaining
{reviews?.length === 0 && ( ... )}

// line 40 — explicit null guard
{reviews && reviews.length > 0 && ( ... )}
```

`useSuspenseQuery`는 데이터가 준비될 때까지 Suspense를 트리거하므로, `reviews`는 항상 정의된 상태다.
두 가지 다른 방어 패턴을 혼용하고 있으며, 둘 다 불필요하다.

**해결안**:

```tsx
// 개선 — useSuspenseQuery 보장에 따라 직접 접근
{reviews.length === 0 && ( ... )}
{reviews.length > 0 && ( ... )}
```

---

### I-5. ui/parts/ 디렉토리 부재

**스킬**: frontend-cohesion, frontend-file-naming

**현재 문제**:

`review-list.tsx`가 163줄이며, map callback만 116줄(line 42-158)이다.
내부에 empty state, status badge, terminal preview, action buttons 등 독립적 관심사가 혼재한다.

참조 모듈:
- `repository/ui/parts/` — repository-card.tsx, repository-card-skeleton.tsx, repository-search-input.tsx
- `settings/ui/parts/profile/`, `settings/ui/parts/repository/`
- `dashboard/ui/parts/` — contribution-graph.tsx

**해결안**:

```
ui/parts/
├── review-card.tsx           # map callback 전체 추출 (~80줄)
├── review-empty-state.tsx    # empty state 카드 (~20줄)
└── review-status-badge.tsx   # status badge config map (~25줄)
```

---

### I-6. suggestion 모듈 barrel 우회 import

**스킬**: frontend-cohesion, frontend-coupling

**현재 문제** (`ui/review-detail.tsx:5`):

```typescript
import { SuggestionList } from "@/module/suggestion/components/suggestion-list";
```

`module/suggestion/index.ts:5`에서 `SuggestionList`를 barrel export하고 있으므로 내부 경로를 사용할 필요가 없다.
내부 파일 구조에 결합되어, suggestion 모듈이 `components/` → `ui/`로 리팩토링되면 깨진다.

**해결안**:

```typescript
import { SuggestionList } from "@/module/suggestion";
```

---

### I-7. Badge를 lucide-react에서 잘못 import

**스킬**: naming-conventions

**현재 문제** (`ui/review-list.tsx:5`):

```typescript
import { Badge, ExternalLink, FileCode, Lightbulb } from "lucide-react";
```

lucide-react의 `Badge`는 방패 모양 **아이콘 SVG** 컴포넌트다.
그러나 JSX에서는 텍스트 children을 감싸는 **UI Badge 컨테이너**로 사용하고 있다 (line 60-80):

```tsx
<Badge className="bg-gradient-to-r from-[#2d3e2d]/30 ...">
  Completed
</Badge>
```

프로젝트의 다른 모듈(`repository/ui/parts/repository-card.tsx`)은 `@/components/ui/badge`에서 올바르게 import한다.

**해결안**:

```typescript
import { Badge } from "@/components/ui/badge";
import { ExternalLink, FileCode, Lightbulb } from "lucide-react";
```

> **⚠️ 실행 제약: I-7과 I-8은 반드시 동시에 실행해야 한다.**
>
> shadcn Badge는 `cn(badgeVariants({ variant }), className)` 구조로, default variant가 `bg-primary text-primary-foreground`를 적용한다. 현재 코드의 `bg-gradient-to-r from-[#2d3e2d]/30 ...` className은 **background-image** 속성이고, default variant의 `bg-primary`는 **background-color** 속성이다. `tailwind-merge`는 이 둘을 다른 속성으로 인식하여 **둘 다 적용**하므로, `bg-primary`(`#4a6a4a`)가 30% opacity gradient 뒤로 비쳐 의도하지 않은 배경색이 나타난다.
>
> I-8의 `ReviewStatusBadge`는 gradient 대신 `bg-primary/10`(background-color)을 사용하므로 이 충돌이 발생하지 않는다. 따라서 I-7 단독 실행 시 시각적 깨짐이 발생한다.

---

### I-8. 반복적 status badge 렌더링

**스킬**: frontend-readability

**현재 문제** (`ui/review-list.tsx:59-73`):

```tsx
{review.status === "completed" && (
  <Badge className="bg-gradient-to-r from-[#2d3e2d]/30 to-[#3d523d]/20 text-[#4a6a4a] border border-[#2d3e2d]/30 ...">
    Completed
  </Badge>
)}
{review.status === "failed" && (
  <Badge className="bg-[#3a1a1a]/30 text-[#ff6b6b] border border-[#3a1a1a]/50 ...">
    Failed
  </Badge>
)}
{review.status === "pending" && (
  <Badge className="bg-[#3a3020]/30 text-[#d4a574] border border-[#3a3020]/50 ...">
    Pending
  </Badge>
)}
```

3개의 거의 동일한 조건부 렌더링 블록이 반복된다.

**해결안**:

config map 기반 `ReviewStatusBadge` 컴포넌트로 추출:

> **⚠️ 타입 주의**: Prisma 스키마에서 `status`는 enum이 아닌 `String` 타입이므로, `ReviewListItem`의 `status`는 TypeScript에서 `string`으로 추론된다. `ReviewStatusBadge`의 props를 `ReviewStatus`로 받으면 호출부에서 `string`을 `ReviewStatus`에 할당할 수 없어 **컴파일 에러**가 발생한다. 따라서 props는 `string`으로 받고 내부에서 타입 가드를 적용한다.

```typescript
// ui/parts/review-status-badge.tsx
import { Badge } from "@/components/ui/badge";
import type { ReviewStatus } from "../../types";

const STATUS_CONFIG: Record<ReviewStatus, { label: string; className: string }> = {
  completed: {
    label: "Completed",
    className: "bg-primary/10 text-primary border-primary/30",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  pending: {
    label: "Pending",
    className: "bg-[#3a3020]/30 text-[#d4a574] border-[#3a3020]/50",
  },
};

function isReviewStatus(value: string): value is ReviewStatus {
  return value in STATUS_CONFIG;
}

export function ReviewStatusBadge({ status }: { status: string }) {
  if (!isReviewStatus(status)) return null;

  const config = STATUS_CONFIG[status];
  return <Badge className={config.className}>{config.label}</Badge>;
}
```

---

### I-9. 116줄 map callback 깊은 JSX 중첩

**스킬**: frontend-readability

**현재 문제**:

`review-list.tsx`의 map callback (line 42-158)이 116줄이며 7+ 레벨의 JSX 중첩을 포함한다.
단일 카드 안에 header, badges, description, timestamp, terminal preview, action buttons가 모두 포함되어 있다.

**해결안**:

`ReviewCard` 컴포넌트로 추출하여 `review-list.tsx`를 ~35줄로 줄인다:

```typescript
// ui/review-list.tsx — 개선 후
export default function ReviewList({ initialData }: ReviewListProps) {
  const { reviews } = useReviews(initialData);

  if (reviews.length === 0) return <ReviewEmptyState />;

  return (
    <div className="grid gap-4">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}
```

---

### I-10. [id]/page.tsx barrel 우회 내부 경로 import

**스킬**: frontend-coupling

**현재 문제** (`app/dashboard/reviews/[id]/page.tsx:1-2`):

```typescript
import { getReviewById } from "@/module/review/actions";
import { ReviewDetail } from "@/module/review/ui/review-detail";
```

barrel(`module/review/index.ts`)을 우회하여 내부 경로에 직접 접근한다.
현재 barrel에 `ReviewDetail`이 export되지 않아 우회가 불가피했다.

**해결안**:

1. barrel에 `ReviewDetail` export 추가:
```typescript
// index.ts
export { ReviewDetail } from "./ui/review-detail";
```

2. page에서 barrel import으로 변경:
```typescript
import { getUserReviewById, ReviewDetail } from "@/module/review";
```

---

### I-11. ReviewWithSuggestions 수동 타입이 Suggestion에 밀결합

**스킬**: frontend-coupling

**현재 문제**:

`ui/review-detail.tsx:25-40`에서 Suggestion의 14개 필드를 수동으로 타입 정의한다.
Prisma 스키마가 변경되면 이 타입을 수동으로 동기화해야 한다.

이 이슈는 C-1의 해결안(타입을 `getReviewById` 반환 타입에서 파생)으로 함께 해결된다.

---

## Nice-to-Have

### N-1. getReviewById 입력 검증 부재

**스킬**: typescript-clean-code

**현재 문제** (`actions/index.ts:26`):

```typescript
export async function getReviewById(reviewId: string) {
  // reviewId가 빈 문자열이어도 Prisma 쿼리 실행
```

**해결안**:

```typescript
export async function getUserReviewById(reviewId: string) {
  if (!reviewId.trim()) return null;
  // ...
}
```

---

### N-2. ReviewList(default) vs ReviewDetail(named) export 불일치

**스킬**: frontend-predictability, naming-conventions

**현재 문제**:

| 컴포넌트 | export 방식 | 파일 |
|----------|------------|------|
| ReviewList | `export default` | ui/review-list.tsx:17 |
| ReviewDetail | `export function` (named) | ui/review-detail.tsx:47 |

같은 모듈의 같은 레벨(ui/) 컴포넌트인데 export 방식이 다르다.

**해결안**: 둘 다 default export로 통일하고 barrel에서 named re-export.

---

### N-3. 매직 넘버 300

**스킬**: frontend-readability

**현재 문제** (`ui/review-list.tsx:123`):

```tsx
{review.review.substring(0, 300)}...
```

**해결안**:

```typescript
// constants/index.ts
export const REVIEW_PREVIEW_MAX_CHARS = 300;
```

---

### N-4. useReviewDetail hook 부재

**스킬**: frontend-cohesion

**현재 문제**:

`getReviews`에는 `useReviews` hook이 있지만, `getReviewById`에는 대응하는 hook이 없다.
현재 detail 페이지가 Server Component라서 hook이 불필요하지만, 클라이언트에서 refetch가 필요해지면 추가해야 한다.

**해결안**: 현재 상태 유지. 필요 시 `hooks/use-review-detail.ts` 생성.

---

## 실행 계획

### Phase 1: Foundation — 타입 및 상수 정리

**선행 조건**: 없음
**해결 이슈**: C-1, C-2, I-1, N-3

| 순서 | 작업 | 대상 파일 |
|------|------|-----------|
| 1-1 | `types/index.ts` 생성 (ReviewsData, ReviewListItem, ReviewDetailData, ReviewStatus) | types/index.ts (신규) |
| 1-2 | `REVIEW_PREVIEW_MAX_CHARS` 상수 추가 | constants/index.ts |
| 1-3 | `index.ts` barrel에 types export 추가 | index.ts |
| 1-4 | `hooks/use-reviews.ts`에서 로컬 ReviewsData 삭제, types/ import | hooks/use-reviews.ts |
| 1-5 | `ui/review-list.tsx`에서 로컬 ReviewsData 삭제, types/ import | ui/review-list.tsx |
| 1-6 | `ui/review-detail.tsx`에서 인라인 ReviewWithSuggestions 삭제, ReviewDetailData import | ui/review-detail.tsx |

---

### Phase 2: 구조 분해 — parts 추출 및 semantic token 적용

**선행 조건**: Phase 1 완료
**해결 이슈**: C-3, I-4, I-5, I-7, I-8, I-9

> **⚠️ 원자적 실행 제약**: 2-1(ReviewStatusBadge 생성)과 2-4(review-list.tsx Badge import 수정)는 **반드시 동시에 적용**해야 한다. Badge import만 변경하고 className을 유지하면 shadcn Badge의 default variant와 기존 gradient className이 충돌하여 시각적 깨짐이 발생한다. 상세 내용은 I-7 참조.

| 순서 | 작업 | 대상 파일 |
|------|------|-----------|
| 2-1 | `ui/parts/review-status-badge.tsx` 생성 (config map 기반, `@/components/ui/badge` 사용) | parts/review-status-badge.tsx (신규) |
| 2-2 | `ui/parts/review-empty-state.tsx` 생성 | parts/review-empty-state.tsx (신규) |
| 2-3 | `ui/parts/review-card.tsx` 생성 (map callback 추출, ReviewStatusBadge 사용) | parts/review-card.tsx (신규) |
| 2-4 | `review-list.tsx` 리팩토링 — parts 합성, lucide Badge import 제거, null 처리 통일, hex→semantic token | ui/review-list.tsx |
| 2-5 | `review-detail.tsx` 리팩토링 — hex→semantic token, suggestion barrel import | ui/review-detail.tsx |

**색상 치환 시 주의사항**:
- `#606060` → `text-muted-foreground`로 치환 **금지** (밝기 15% 차이, 시각적 계층 파괴)
- `#3d523d` → I-8 해결안(gradient→`bg-primary/10`)으로 자연 해소, 별도 매핑 불필요
- hover/shimmer effect의 `#2d3e2d` → `ring` 토큰 사용 (`via-ring/50` 등)

---

### Phase 3: API Surface — 함수명 변경 및 consumer 업데이트

**선행 조건**: Phase 1, 2 완료
**해결 이슈**: I-3, I-6, I-10, N-1, N-2

| 순서 | 작업 | 대상 파일 |
|------|------|-----------|
| 3-1 | `getReviews` → `getUserReviews`, `getReviewById` → `getUserReviewById` 변경 + 입력 검증 | actions/index.ts |
| 3-2 | `types/index.ts`의 import 및 `ReturnType<typeof ...>` 참조를 새 함수명으로 변경 | types/index.ts |
| 3-3 | `hooks/use-reviews.ts` import 업데이트 | hooks/use-reviews.ts |
| 3-4 | `ReviewDetail` barrel export 추가, export 스타일 통일 | index.ts, ui/review-detail.tsx |
| 3-5 | `app/dashboard/reviews/page.tsx` import 업데이트 | page.tsx |
| 3-6 | `app/dashboard/reviews/[id]/page.tsx` barrel import으로 변경 | [id]/page.tsx |

---

## 미해결 질문

1. warning 색상(`#3a3020`, `#d4a574`)을 `globals.css`에 CSS 변수로 추가할지, hex 유지할지?
2. `#606060`을 `globals.css`에 `--muted-foreground-dim` 등으로 추가할지, hex 유지할지?
3. `ReviewDetail` export 스타일을 default로 통일할지, 현재 named export 유지할지?

### 해소된 질문

- ~~Phase 3의 함수명 변경(`getReviews` → `getUserReviews`)이 다른 코드(inngest 등)에도 영향을 주는지~~ → **영향 없음 확인 완료**. 전체 코드베이스 검증 결과 5개 파일에서만 참조하며, inngest/webhook은 별도 `prisma.review.create()` 로직 사용. 동적/문자열 참조 없음.
- ~~Badge import 변경 시 시각적 문제 없는지~~ → **문제 있음, 대응 완료**. I-7에 원자적 실행 제약 추가 (I-8과 동시 실행 필수).
- ~~`#606060` → `text-muted-foreground` 치환 가능한지~~ → **불가**. 밝기 15% 차이(`#606060` vs `#707070`). C-3 매핑 테이블 및 Phase 2 주의사항에 반영 완료.
- ~~Phase 3에서 `types/index.ts` 업데이트가 누락되지 않았는지~~ → **누락 발견, 대응 완료**. Phase 1에서 생성된 `types/index.ts`가 `getReviews`/`getReviewById`를 import하므로, Phase 3 작업 목록(3-2)과 I-3 영향 범위 테이블에 추가.
- ~~`ReviewStatusBadge`의 `ReviewStatus` props가 Prisma의 `string` 타입과 호환되는지~~ → **비호환 발견, 대응 완료**. Prisma `status`가 enum이 아닌 `String`이므로 props를 `string`으로 받고 타입 가드 적용하는 방식으로 I-8 해결안 수정.
