---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-08-12"
completed-at: null
owners: []
related: []
approved-by: null
approved-at: null
approval-scope: null
verification-summary: "원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다."
closed-at: null
closed-by: null
closed-reason: null
legacy-record: true
migrated-at: "2026-09-06"
migrated-from: "docs/archive/2026-08-verification-card-excluded-only.md"
migration-note: "원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다."
---

> 이관 메모 (2026-09-06): 원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다. 경로·메타데이터 변경 전의 hash와 검토 영수증은 당시 기록이며 새 검증 결과가 아니다.

# 검수자 카드를 제외 항목 전용으로 축소 (개발 문서)

> 보관 상태: **역사 기록 / 구현 완료** (PR #72, `733d59f`) · 작성일 2026-08-12
>
> 본문의 라인 번호는 모두 **구현 전** 좌표다. 위치는 심볼명(`buildVerificationTrace`, `post-verification-review` 등)으로 찾을 것.

## 1. 배경/동기

**관측된 실패 (2026-08-12):** 프로덕션 리뷰 상단과 검수자 카드에 다음 문장이 렌더됐다.

```
🛡️ 리뷰 검증 — 지적·제안 2개 중 0개는 diff와 달라 걸러냄
```

제품 개발자 본인이 이 문장을 읽고 의미를 파악하지 못했다. 같은 자리의 문구를 네 번 바꿨으나(`제외` → `오탐으로 제외` → `걸러냄` → `제외`) 전부 같은 반응이 나왔다.

**근본 원인:** 문구가 아니라 정보의 종류가 문제다. 이 줄은 **사용자가 본 적 없는 항목의 개수**를 보고한다. 제외된 지적은 이미 `applyVerification`(`verify-review.ts:153-194`)이 본문에서 제거한 뒤이므로, 독자는 사라진 것을 본 적이 없다. 없는 것을 세는 문장은 어떤 단어를 써도 "그래서 뭘?"이 된다.

**두 번째 원인:** 검수자 카드(`buildVerificationReviewBody`, `verify-review.ts:209-250`)의 대부분이 **생존 이슈 명부**다.

```
## 🛡️ 리뷰 검증
> 지적·제안 7개 중 2개는 diff와 달라 걸러냄

- ✅ CONFIRMED — 재시도 루프에 상한이 없음      ← 본문에서 방금 읽은 지적
- ⚪ UNCERTAIN — 에러 로깅 누락                 ← 또
- ⚪ UNCERTAIN — 타입 단언 남용                 ← 또

▸ 제외된 항목 (2)                              ← 유일한 새 정보. 접혀 있음
```

유일하게 새로운 정보인 제외 내역이 **이미 읽은 것들의 목록 아래, 접힌 채로** 놓여 있다. 접힘을 푸는 것만으로는 부족하다 — 명부 자체가 그 자리를 가린다.

**명부가 중복인 근거 (코드 확인):** 생존 항목의 판정은 이미 두 곳에서 더 나은 형태로 전달되고 있다.

| 전달 경로 | 위치 | 내용 |
|---|---|---|
| 인라인 배지 | `pr-review.ts:151-152` — `if (issue.verifierConfirmed)` → `> ✅ **diff 대조 검증됨**` | 해당 지적을 **읽는 코멘트 안에서** 검증 여부 표시 |
| 대시보드 패널 | `verification-panel.tsx:47-62` — `CONFIRMED`/`UNCERTAIN` 색 구분 | 이슈별 판정 전체 열람 |

이는 우연이 아니라 원설계다. 2026-07 스펙(`docs/proposals/completed/2026-07-second-reviewer-verification-feature.md:21`)에 명시돼 있다:

> **배지** | CONFIRMED에만 GitHub 인라인 배지. **UNCERTAIN은 대시보드에서만 구분**

즉 판정 열람의 제자리는 처음부터 대시보드였고, GitHub 카드의 명부는 그것을 열등한 형태로 복제한 것이다. **명부와 요약줄을 지워도 정보 손실이 없다.**

## 2. 목표 상태

### 목표

- 검수자 카드는 **제외된 항목이 있을 때만** 게시된다. 제외가 0개면 카드가 생성되지 않는다.
- 카드 본문은 **제외 항목만** 담는다. 각 항목은 접힘 없이 펼쳐진 상태로, 위치(`파일:줄`) · 원래 제목(취소선) · 검수자 사유를 표시한다.
- 리뷰 본문 상단의 검증 요약 1줄(`buildVerificationTrace`)을 제거한다.
- 생존 항목의 판정 전달은 현행 유지 — 인라인 `✅` 배지와 대시보드 패널을 건드리지 않는다.
- `reviewData.verification`에 저장되는 판정 데이터는 변경 없다 (Step 7 저장 경로 무수정).

### 비목표

- **본문 이슈에 판정 인라인 표시** — `line === null` 이슈는 본문에 렌더되며(`review-formatter.ts:109`) 현재 배지가 없다. 인라인 이슈만 배지를 받는 불일치가 존재하나, 포매터와 코멘트 경로를 함께 손봐야 하므로 별건이다.
- **두 리뷰 엔트리 병합** — Step 6.5는 "1차 리뷰와 독립, 실패해도 리뷰 흐름을 막지 않는다"(`review.ts:757-758`)는 의도된 격리다. 병합하면 검수 본문 생성 실패가 리뷰 게시를 깨뜨릴 수 있다.
- **대시보드 패널 개편** — 명부의 제자리이므로 유지한다.
- 검수자 판정 정책(`CONFIRMED`/`UNCERTAIN`/`REJECTED`) 변경.

### 성공 기준

1. `npx tsc --noEmit` 0 errors, `npm run lint` 0 errors, `npm test` 기존 103개 유지 + 신규 5개 = 108 passed (별도로 env 게이트된 skip 1개는 기존과 동일).
2. 제외 0개 경로: 검수자 카드가 게시되지 않고, 리뷰 본문 상단에 검증 관련 줄이 없다.
3. 제외 1개 이상 경로: 카드가 제외 항목만 담고 접힘이 없다.
4. `buildVerificationReviewBody` 단위 테스트 신규 추가 — 현재 이 함수는 테스트가 0개다(`verify-review.test.ts`의 3개는 모두 다른 함수).
5. 대시보드 검증 패널의 렌더 결과가 변경 전과 동일하다(`labels.excluded` 문구 제외).

## 3. 대안 분석

### Option A: 카드를 제외 전용으로 축소 (선택)

- 장점: 정보 손실 0(명부는 인라인 배지+대시보드와 중복). 코드가 **줄어든다**. 제외가 0인 흔한 경우 PR에서 코멘트 하나가 사라져 소음이 준다. 문제의 문장이 렌더될 자리 자체가 없어진다.
- 단점: 제외가 0이고 모든 지적이 `UNCERTAIN`이면 GitHub에 검증 흔적이 남지 않는다(§7 참조).

### Option B: 본문 이슈에도 판정 인라인 표시 후 명부 삭제

- 장점: 정보 손실이 이론적으로도 0. 판정을 읽는 자리에서 본다.
- 단점: `formatStructuredReviewToMarkdown`과 인라인 코멘트 경로를 함께 수정해야 하고, `SYNC:formatIssueBody`로 묶인 세 곳(`pr-review.ts:158` 주석 참조)이 연동된다. A보다 범위가 크고, A가 해결하려는 문제(제외 항목 인지)를 직접 풀지는 않는다. **A 이후 별건으로 권장.**

### Option C: 요약 문구만 다시 수정

- 이미 네 번 시도해 네 번 실패했다. 보이지 않는 것의 개수라는 정보 종류가 바뀌지 않는 한 결과가 같다. 기각.

### Option D: 두 리뷰 엔트리 병합

- 장점: 제외 내역이 리뷰 본문 안에 들어가 상호 참조가 불필요해진다.
- 단점: `review.ts:757-758`의 의도된 실패 격리와 `checkLengthAlignment` 기반 degradation 경로를 잃는다. 기각.

## 4. 구현 상세

### 4-1. `shared/constants/index.ts` — `VERIFICATION_LABELS` (67-86행)

`summary` 키를 삭제하고 `excludedHeading`·`excludedIntro`를 추가한다.

**`excluded`를 카드 문구로 덮어쓰지 않는다.** 이 키는 대시보드 패널의 `<details><summary>` 라벨이고(`verification-panel.tsx:68`), 카드에서는 카운트가 붙는 H2 헤더로 쓰인다. 두 표면은 서로 다른 이유로 바뀌므로 키를 분리해 각자 소유하게 한다 — 카드 헤더를 손볼 때 대시보드 문구가 조용히 따라 바뀌는 경로를 없앤다.

```ts
/** 리뷰 검증(검수자) 라벨. LanguageCode 추가 시 여기도 추가 필수.
 *  excluded        — 대시보드 패널의 <summary> 라벨 (VerificationPanel)
 *  excludedHeading — GitHub 검수자 카드의 H2 헤더 (buildVerificationReviewBody)
 *  두 소비처가 독립적으로 바뀔 수 있도록 의도적으로 분리한 키다. 합치지 말 것. */
export const VERIFICATION_LABELS = {
  en: {
    title: "Review Verification",
    badge: "Verified against the diff",
    skipped: "Verification was skipped",
    excluded: "Excluded findings",
    excludedHeading: "Findings excluded by the verifier",
    excludedIntro:
      "The first reviewer raised these, but the diff contradicts them, so they were removed from the review.",
  },
  ko: {
    title: "리뷰 검증",
    badge: "diff 대조 검증됨",
    skipped: "검증이 생략되었습니다",
    excluded: "제외된 지적",
    excludedHeading: "검수자가 제외한 지적",
    excludedIntro: "1차 리뷰어가 낸 지적 중 diff와 맞지 않아 리뷰에서 뺀 항목입니다.",
  },
} as const satisfies Record<
  LanguageCode,
  {
    title: string;
    badge: string;
    skipped: string;
    excluded: string;
    excludedHeading: string;
    excludedIntro: string;
  }
>;
```

> `summary` 소비처는 `buildVerificationTrace`와 `buildVerificationReviewBody` 둘뿐이며 양쪽 다 이번에 변경된다. `verification-panel.tsx`는 `title`·`skipped`·`excluded`만 쓴다(21·28·42·68행 확인).
>
> 패널 문구는 "걸러낸 항목" → "제외된 지적"으로 한 번 바뀐다. 카드 프레이밍이 새는 것이 아니라, 사용자가 지적한 "걸러냄"이라는 비유를 제거하는 **의도된 최소 변경**이다. 이후로는 두 표면이 독립적으로 움직인다.

### 4-2. `features/ai/lib/verify-review.ts`

**(a) `buildVerificationTrace` 삭제 (196-207행 전체)**

**(b) `buildVerificationReviewBody` 교체 (209-250행 전체)**

```ts
/** 제외 항목 수. 게시 게이트(review.ts Step 6.5)와 카드 헤더가 같은 정의를 쓰도록 한 곳에 둔다.
 *  대시보드 패널(verification-panel.tsx:34-35)의 자체 계산은 건드리지 않는다 —
 *  features/review/ui가 features/ai/lib를 import하게 만드는 것은 2항 덧셈에 비해 비싼 결합이다. */
export function countExcluded(
  v: Pick<AppliedVerification, "rejectedIssues" | "rejectedSuggestions">,
): number {
  return v.rejectedIssues.length + v.rejectedSuggestions.length;
}

/** 검수자 명의의 별도 GitHub 리뷰 엔트리 본문 (body-only, 동일 계정).
 *  제외한 항목만 담는다 — 생존 항목의 판정은 인라인 배지(`formatIssueComment`의
 *  `issue.verifierConfirmed` 분기)와 대시보드 패널(`VerificationPanel`)이 이미
 *  전달하므로 여기서 반복하지 않는다.
 *  제외가 0개면 null을 반환한다 — 호출부는 게시를 건너뛴다. */
export function buildVerificationReviewBody(params: {
  rejectedIssues: (StructuredIssue & { reason: string })[];
  rejectedSuggestions: (CodeSuggestion & { reason: string })[];
  langCode: LanguageCode;
}): string | null {
  const { rejectedIssues, rejectedSuggestions, langCode } = params;
  const excludedCount = countExcluded(params);
  if (excludedCount === 0) return null;

  const labels = VERIFICATION_LABELS[langCode];

  const items = [
    ...rejectedIssues.map((issue) => {
      const location = issue.file
        ? `\`${issue.file}${issue.line !== null ? `:${issue.line}` : ""}\` · `
        : "";
      const title = (issue.title ?? "").trim();
      const reason = (issue.reason ?? "").trim();
      const heading = `**~~${location}${title}~~**`;
      return reason ? `${heading}\n\n${reason}` : heading;
    }),
    ...rejectedSuggestions.map((s) => {
      const reason = (s.reason ?? "").trim();
      const heading = `**~~\`${s.file}:${s.line}\`~~**`;
      return reason ? `${heading}\n\n${reason}` : heading;
    }),
  ];

  return [
    `## 🛡️ ${labels.excludedHeading} (${excludedCount})`,
    "",
    labels.excludedIntro,
    "",
    items.join("\n\n"),
    "",
    "---",
    "*Generated by HReviewer*",
  ].join("\n");
}
```

변경 요지:
- 파라미터에서 `keptIssues`, `keptIssueVerdicts`, `reviewedCount` 제거
- 명부 렌더 블록 삭제
- `<details>` 접힘 제거 — 항상 펼침
- 항목마다 `파일:줄` 위치 추가 (기존 이슈 항목엔 제목만 있었다)
- **반환 타입 `string | null`** — 빈 입력에서 `(0)` 헤더와 "뺀 항목입니다" 안내문만 남은 자기모순 카드가 나오지 않도록, 빈 경우를 시그니처가 표현한다. 삭제되는 `buildVerificationTrace`도 같은 계약을 `string | null`로 표현하고 있었다(`verify-review.ts:200-201`). 이 함수는 배럴 2곳으로 재노출되므로(§4-3) 호출부 주석만으로는 계약이 전달되지 않는다.
  `""`가 아니라 `null`이어야 한다 — `""`는 `postVerificationReview`의 `body: string`에 그대로 대입되어 빈 카드가 게시될 수 있지만, `null`은 타입 검사에서 걸린다.
- `reason` 빈 값 방어 — 검수자 LLM이 `verdict: "REJECTED"`에 `reason: ""`를 반환할 수 있다. 스키마가 맨 `z.string()`이라 빈 문자열을 허용한다(`verify-review.ts:43`, `review-schema.ts:126`). 빈 값을 실제로 처리하는 것은 `?? ""`가 아니라 `reason ? … : heading` 삼항이다.
  `?? ""`는 형제 함수 `formatIssueComment`(`pr-review.ts:132-136`, "방어적 기본값 — in-flight resume + 빈 값 대응")의 관례를 따른 것으로, 타입상 도달 불가하지만 파일 내 일관성을 위해 유지한다.

> `alignVerdicts`가 누락 index를 채우는 경로는 이 함수와 무관하다 — 기본값은 `UNCERTAIN`이고(`verify-review.ts:108-111`), `applyVerification`은 `REJECTED`일 때만 `rejected*` 배열에 넣으므로(`165`, `179`) 기본 채움 항목은 여기 도달하지 않는다.

### 4-3. 배럴 export 2곳

```ts
// features/ai/lib/index.ts:24
export { verifyReview, applyVerification, buildVerificationReviewBody, countExcluded } from "./verify-review";

// features/ai/index.ts:46
export { verifyReview, applyVerification, buildVerificationReviewBody, countExcluded, storedReviewDataSchema } from "./lib";
```

`buildVerificationTrace`를 제거하고 `countExcluded`를 추가한다.

### 4-4. `inngest/functions/review.ts`

**(a) import (12행)** — `buildVerificationTrace` 제거, `countExcluded` 추가

```ts
verifyReview, applyVerification, buildVerificationReviewBody, countExcluded, VERIFIER_MODEL_ID,
```

`countExcluded`는 §4-4(c)의 게이트에서 쓰인다. 빠뜨리면 `tsc`가 `Cannot find name 'countExcluded'`로 실패한다.

**(b) Step 6 직전 본문 조립 (670-680행)**

```ts
// Before
let finalReview = review;
if (verified) {
  const reviewedCount =
    (verification?.issueVerdicts.length ?? 0) + (verification?.suggestionVerdicts.length ?? 0);
  const excludedCount = verified.rejectedIssues.length + verified.rejectedSuggestions.length;
  const trace = buildVerificationTrace({ reviewedCount, excludedCount }, langCode);
  const markdown = formatStructuredReviewToMarkdown(verified.keptOutput, langCode);
  finalReview = sanitizeMermaidSequenceDiagrams(trace ? `${trace}\n\n${markdown}` : markdown, langCode);
}

// After
let finalReview = review;
if (verified) {
  const markdown = formatStructuredReviewToMarkdown(verified.keptOutput, langCode);
  finalReview = sanitizeMermaidSequenceDiagrams(markdown, langCode);
}
```

> 이 아래의 `buildReviewNotice` 블록(682-691행)은 **그대로 둔다**. 생성 파일 제외 고지와 축소 리뷰 고지는 이번 변경 대상이 아니다.

**(c) Step 6.5 (760-790행)**

```ts
// ── Step 6.5: 검수자가 제외한 항목 게시 (제외가 있을 때만) ──
// 1차 리뷰(Step 6)와 독립 — 실패해도 리뷰 흐름을 막지 않는다.
// 생존 항목의 판정은 인라인 배지와 대시보드가 전달하므로 여기서 반복하지 않는다.
await step.run("post-verification-review", async () => {
  if (!verified) return false;
  if (countExcluded(verified) === 0) return false;

  const body = buildVerificationReviewBody({
    rejectedIssues: verified.rejectedIssues,
    rejectedSuggestions: verified.rejectedSuggestions,
    langCode,
  });
  // string | null 좁히기 — 위 게이트는 타입을 좁히지 못한다. 생략하면 tsc가 실패한다.
  if (body === null) return false;

  try {
    await postVerificationReview({ token, owner, repo, prNumber, headSha, body });
    return true;
  } catch (error) {
    console.warn("Verification review entry failed (main review was already posted):", error);
    return false;
  }
});
```

`countExcluded`는 `@/features/ai`에서 import한다(§4-3에 export 추가).

제거되는 것:
- `if (!verified || !verification)` → `if (!verified)` (이 스텝에서 `verification`을 더 쓰지 않는다. 단, Step 7 저장 경로는 계속 사용하므로 변수 자체는 유지). `verified`가 truthy면 `verification`은 항상 존재한다 — `applyVerification`은 `status: "verified"`인 non-null 결과를 받았을 때만 값을 반환한다(`verify-review.ts:157`).
- `keptIssues` / `issueCount` 지역 변수
- `checkLengthAlignment("post-verification-review", ...)` 호출 (766행) — 명부가 없어져 index 정렬에 의존하지 않는다. **함수 자체는 유지**한다. 나머지 호출부 4곳(219 래퍼, 725 `post-review`, 810·813 `save-review`)은 그대로다.
- `reviewedCount` 계산 및 `reviewedCount === 0` 게이트 → `countExcluded(verified) === 0` 게이트로 대체

**(d) `checkLengthAlignment`의 scope 유니온 정리 (195행)**

이 호출부를 지우면 `"post-verification-review"` 리터럴을 넘기는 호출자가 하나도 남지 않는다. 유니온에 남겨두면 존재하지 않는 가드 경로를 광고하게 되므로 함께 좁힌다.

```ts
// Before
scope: "post-review" | "post-verification-review" | "save-review",

// After
scope: "post-review" | "save-review",
```

`tsc`는 미사용 유니온 멤버를 잡아주지 않으므로 직접 확인해야 한다. 단, **단순 문자열 검색은 오탐이 난다** — 같은 문자열이 Inngest 스텝 이름으로도 쓰이기 때문이다(`review.ts:760`, `step.run("post-verification-review", ...)`). 이 스텝 이름은 유지된다.

확인 대상은 `checkLengthAlignment`의 **첫 번째 인자**로 쓰인 곳뿐이다:

```bash
grep -n "checkLengthAlignment(" -A 1 inngest/functions/review.ts
```

결과에 `"post-verification-review"`가 인자로 남아 있지 않으면 된다.

## 5. 산출물 Before/After

### 케이스 1 — 제외 0개 (대부분)

**Before**

```
[메인 리뷰]
> 🛡️ **리뷰 검증** — 지적·제안 2개 중 0개는 diff와 달라 걸러냄

## 요약
...

[검수자 카드 — 별도 코멘트]
## 🛡️ 리뷰 검증
> 지적·제안 2개 중 0개는 diff와 달라 걸러냄

- ⚪ `UNCERTAIN` — 검증 메시지 문자열에 대한 테스트 부재

---
*Generated by HReviewer*
```

**After**

```
[메인 리뷰]
## 요약
...

(검수자 카드 없음)
```

### 케이스 2 — 제외 2개

**After**

```
[메인 리뷰]
## 요약
...

[검수자 카드]
## 🛡️ 검수자가 제외한 지적 (2)

1차 리뷰어가 낸 지적 중 diff와 맞지 않아 리뷰에서 뺀 항목입니다.

**~~`lib/db.ts:15` · connection 널 체크 누락~~**

15번 줄에 이미 `connection?.query(...)`가 있습니다. 지적이 코드를 잘못 읽었습니다.

**~~`lib/api.ts:33` · before 동작 불일치~~**

before 코드가 지적한 대로 동작하지 않습니다.

---
*Generated by HReviewer*
```

> 위 두 항목은 모두 **제외된 이슈**(`rejectedIssues`)다. 제외된 **제안**(`rejectedSuggestions`)은 `CodeSuggestion`에 title이 없어 `**~~\`파일:줄\`~~**`로만 렌더된다 — 제목 부분(`· …`)이 붙지 않는다.

### 변경되지 않는 것

- 인라인 이슈 코멘트의 `> ✅ **diff 대조 검증됨**` 배지 (`pr-review.ts:151-152`)
- 리뷰 본문 상단의 `생성 파일 제외:` / 축소 리뷰 고지 (`buildReviewNotice`)
- 대시보드 검증 패널의 판정 목록과 접힘 블록 구조 (`labels.excluded` 문구만 "제외된 지적"으로 1회 변경. 카드는 별도 키 `excludedHeading`을 쓰므로 이후 두 표면이 독립적으로 움직인다)
- `reviewData.verification` 저장 내용

## 6. 검증 전략

### 신규 테스트 — `features/ai/lib/verify-review.test.ts`

`buildVerificationReviewBody`는 현재 테스트가 0개다. 최소 5개를 추가한다.

먼저 import를 넓힌다 — 현재 2행은 `{ applyVerification }`만 가져온다.

```ts
import { applyVerification, buildVerificationReviewBody } from "./verify-review";
```

기존 팩토리(`makeIssue`/`makeSuggestion`, 7-19행)를 재사용한다. `as never` 단언은 쓰지 않는다 — 단언은 형상 검사를 통째로 끄기 때문에, 나중에 이 함수가 `severity` 같은 필드를 읽도록 바뀌어도 `undefined`가 조용히 주입되어 **깨진 함수 위에서 테스트가 통과**한다.

```ts
describe("buildVerificationReviewBody", () => {
  const rejectedIssue = {
    ...makeIssue("널 체크 누락"),
    file: "lib/db.ts",
    line: 15,
    reason: "이미 옵셔널 체이닝이 있음",
  };

  it("제외 이슈의 파일·줄·제목·사유를 모두 렌더한다", () => {
    const body = buildVerificationReviewBody({
      rejectedIssues: [rejectedIssue],
      rejectedSuggestions: [],
      langCode: "ko",
    });
    // 취소선은 위치 앞에서 열린다 — `~~널 체크 누락~~`은 부분문자열로 존재하지 않는다.
    expect(body).toContain("**~~`lib/db.ts:15` · 널 체크 누락~~**");
    expect(body).toContain("이미 옵셔널 체이닝이 있음");
    expect(body).toContain("(1)");
  });

  it("제외가 0개면 null을 반환한다", () => {
    expect(
      buildVerificationReviewBody({
        rejectedIssues: [],
        rejectedSuggestions: [],
        langCode: "ko",
      }),
    ).toBeNull();
  });

  it("생존 항목 판정 명부를 포함하지 않는다", () => {
    const body = buildVerificationReviewBody({
      rejectedIssues: [rejectedIssue],
      rejectedSuggestions: [],
      langCode: "ko",
    });
    expect(body).not.toContain("CONFIRMED");
    expect(body).not.toContain("UNCERTAIN");
  });

  it("접힘(<details>)을 쓰지 않는다", () => {
    const body = buildVerificationReviewBody({
      rejectedIssues: [rejectedIssue],
      rejectedSuggestions: [],
      langCode: "ko",
    });
    expect(body).not.toContain("<details>");
  });

  it("reason이 빈 문자열이어도 제목 줄은 렌더한다", () => {
    // 검수자 LLM이 REJECTED에 reason:"" 를 반환하는 경로 방어 (스키마가 빈 문자열 허용)
    const body = buildVerificationReviewBody({
      rejectedIssues: [{ ...rejectedIssue, reason: "" }],
      rejectedSuggestions: [],
      langCode: "ko",
    });
    expect(body).toContain("**~~`lib/db.ts:15` · 널 체크 누락~~**");
    expect(body).not.toContain("\n\n\n");
  });
});
```

각 `it`은 실제 단언을 갖는다. vitest는 콜백이 throw하지 않으면 통과시키므로, 주석만 있는 본문은 아무것도 검사하지 않은 채 초록으로 뜬다.

### 수동 확인

두 경로를 실제 PR로 확인한다 — 문구 수정만으로 넘겼다가 흔한 쪽(제외 0)을 확인하지 않아 이번 문제가 발생했다.

1. **제외 0 경로**: 임의 PR을 열어 검수자 카드가 게시되지 않는지, 본문 상단에 검증 줄이 없는지 확인.
2. **제외 1개 이상 경로**: 자연 발생을 기다리기 어려우므로, `applyVerification` 결과를 임시로 강제하거나 로컬에서 `buildVerificationReviewBody`를 직접 호출해 렌더 결과를 확인한다.

### 회귀 확인

- `npx tsc --noEmit` — `summary` 키 삭제로 인한 미참조 컴파일 오류, 그리고 `string | null` 반환에 대한 호출부 좁히기 누락이 없는지
- `npm test` — 기존 103개 + 신규 5개
- `grep -n "checkLengthAlignment(" -A 1 inngest/functions/review.ts` — 인자로 `"post-verification-review"`가 남아 있지 않은지 확인. 단순 문자열 검색은 Inngest 스텝 이름(`review.ts:760`)에 걸려 오탐이 난다(§4-4(d))
- 대시보드 리뷰 상세 페이지에서 검증 패널이 정상 렌더되는지 (`labels.excluded` 참조)

## 7. 리스크/한계

**(1) 제외 0 + 전원 `UNCERTAIN`이면 GitHub에 검증 흔적이 없다.**

`✅` 인라인 배지는 `CONFIRMED`에만 붙는다(`pr-review.ts:151`). 검수자 프롬프트가 "애매하면 `UNCERTAIN`, 절대 `REJECTED` 금지"를 강제하므로(`verify-review.ts:89`) 이 조합은 드물지 않다. 실제로 PR #70이 그랬다(지적 1개, `UNCERTAIN`, 제외 0). 이 경우 검증 수행 여부는 대시보드에서만 확인 가능하다.

허용 판단의 근거: 근거 없는 배지 한 줄은 주장일 뿐이고, 판정 열람의 제자리는 원설계상 대시보드다. 다만 이것이 문제로 판명되면 **제외 0일 때 숫자 없는 배지 한 줄**(`> 🛡️ **{badge}**`)을 본문 상단에 남기는 변형이 가능하다 — `badge` 라벨은 삭제하지 않으므로 되돌리기가 한 줄이다.

**(2) 제외 항목 노출이 신뢰에 미치는 영향은 측정되지 않았다.**

"AI가 틀린 지적을 했다"가 펼쳐진 형태로 드러난다. 다만 현재도 접힌 채로 이미 노출 중이므로 신규 리스크가 아니라 가시성 변화다. 사용자 0명 상태에서 측정 불가.

**(3) 본문 이슈(`line === null`)의 배지 부재는 이번에 고치지 않는다.**

같은 검증을 거쳤는데 인라인 이슈만 `✅`를 받는 불일치가 남는다(§2 비목표, Option B).

## 8. 미해결 질문

- 제외 0 + 전원 `UNCERTAIN` 경로에 배지 한 줄을 남길지 (§7-1) — 남기지 않는 쪽으로 작성했다
- 카드 헤더의 이모지 `🛡️` 유지 여부 — 인라인 배지와 중복 인상 가능
- `?? ""` 방어 코드 유지 여부 (§4-2) — 타입상 도달 불가하지만 형제 함수 `formatIssueComment`의 관례를 따라 유지했다. 엄격 타입 우선으로 제거하는 판단도 가능하다. 어느 쪽이든 근거 문장 수정은 별개로 필요하다

> 이전 판(§8)에 있던 "패널의 `labels.excluded` 문구가 카드 프레이밍으로 바뀌는 문제"는 `excludedHeading` 키 분리로 해소되어 목록에서 제거했다.

## 9. 리뷰 이력

2026-08-12, `frontend-clean-code-orchestrator` 5렌즈 독립 리뷰 + 중립 품질 게이트. 원본 소견 13건 → 정식 8건(Should 2, Consider 6), 기각 0.

| ID | 심각도 | 내용 | 반영 위치 |
|---|---|---|---|
| C4 | Should | 빈 입력 계약이 시그니처에 없음 → `string \| null` + 호출부 좁히기 | §4-2, §4-4(c) |
| C7 | Should | 테스트 픽스처 `as never` → 기존 팩토리 사용 | §6 |
| C1 | Consider | 공유 `excluded`가 두 표면 담당 → `excludedHeading` 분리 | §4-1, §4-2 |
| C2 | Consider | 제외 수 계산 3중복 → `countExcluded` 헬퍼 | §4-2, §4-3, §4-4(c) |
| C3 | Consider | 주석이 `pr-review.ts:151` 고정 좌표 참조 → 심볼 참조 | §4-2 |
| C5 | Consider | 빈 `reason` 근거 문장이 사실과 다름 → 실제 출처로 교정 | §4-2 |
| C6 | Consider | `"post-verification-review"` 유니온 멤버가 죽음 → 유니온 축소 | §4-4(d) |
| C8 | Consider | 스텁 테스트가 단언 없음 + import 누락 → 단언 작성 + import 추가 | §6 |

게이트가 채택하지 않은 권고 1건: `?? ""` 삭제(TS-2). 형제 함수의 방어 관례와 어긋나는 교환이라 §8 열린 질문으로 남겼다.

### 코드베이스 대조 이력 (`reconciling-proposals-with-codebase`)

2026-08-12 ~ 08-13, High-Risk 프로파일로 4회 대조. 매번 다른 폐쇄 경로를 썼다.

| 패스 | 폐쇄 경로 | 발견 |
|---|---|---|
| 1 | import 출처 전수 열거 (정적 참조 층) | blocker 2 + risk 1 — 전부 위 C-소견을 반영하다 유입된 것 |
| 2 | 빌더 로직 실행 14케이스 (런타임 값 층) | blocker 1 — §6 단언 `~~제목~~`이 실제로 실패. 취소선이 위치 앞에서 열림 |
| 3 | `tsc` + `@ts-expect-error` (타입 층) | 0 |
| 4 | 잔여 섹션 재독 · 좌표 드리프트 검사 | 0 |

**Durable Receipt — 이 문서가 clean으로 대조된 기준점**

- 코드베이스: `HEAD 6fb6e3df8cbe71f493fc2aa17a81957a38d71d2b` (`develop`, 추적 파일 clean)
- 확인된 사항: 인용 좌표 전수 무드리프트 · `summary` 키 삭제가 어떤 소비처도 고아로 만들지 않음 · 제안 코드의 타입 계약 5건 컴파일 검증 · §5 렌더 예시가 실제 출력과 일치
- **미검증 경계:** 4개 파일 변경을 실제로 적용한 통합 dry-run(`tsc` + `lint` + `test` 일괄)은 수행하지 않았다. 추적 파일을 임시 변경해야 하므로 별도 승인이 필요하다.
- 한계: 적용 가능성 증거일 뿐, 완전성·정확성·결함 부재를 증명하지 않는다.

기준점이 바뀌면(이 문서 편집, 또는 위 HEAD 이후의 커밋) 이 기록은 무효다. 그때는 전체 대조를 다시 돌려야 한다.
