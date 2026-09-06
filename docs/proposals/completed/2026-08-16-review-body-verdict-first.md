---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-08-14"
completed-at: "2026-08-16"
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
migrated-from: "docs/archive/2026-08-review-body-verdict-first.md"
migration-note: "원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다."
---

> 이관 메모 (2026-09-06): 원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다. 경로·메타데이터 변경 전의 hash와 검토 영수증은 당시 기록이며 새 검증 결과가 아니다.

# 리뷰 본문을 결론 우선으로 재배치 (개발 문서)

> 보관 상태: **역사 기록 / 구현 완료** (`0699023`, 2026-08-16) — TDD로 테스트 10개를 선작성한 뒤 구현 · 작성일 2026-08-14
>
> 본문의 라인 번호는 모두 **구현 전** 좌표다. 위치는 심볼명(`formatStructuredReviewToMarkdown`, `bodyIssues` 등)으로 찾을 것.
>
> 선행 작업: `archive/2026-08-verification-card-excluded-only.md` (PR #72, 구현 완료) — 같은 문제의식(리뷰 산출물 가독성)의 연작이다. #72가 군더더기 제거였다면 이 문서는 읽는 순서 재설계다.

## 1. 배경/동기

**관측된 실패 (2026-08-13, ApcH PR #81 실물):** HReviewer가 게시한 리뷰를 Conversation 탭에서 위에서 아래로 읽으면 이렇게 전개된다.

```
요약 (🟢 Low Risk)          → "괜찮은 PR이구나"
리뷰 포인트 3개              → (요약의 반복)
변경 사항 상세 (접힘)        → (diff의 반복)
강점 6개 (접힘)             → "잘했구나"
개선 제안 1줄               → 여기서 처음 '할 일' 등장
─── 끝 ───                  지적 2건은 본문에 없음
```

**리뷰의 핵심 산출물인 지적이 기본 뷰에 없다.** 원인은 `review-formatter.ts:109`의 필터다:

```ts
const bodyIssues = output.issues.filter((issue) => issue.line === null);
```

줄 번호가 있는 이슈는 본문에서 빠지고 인라인 코멘트(Files changed 탭)로만 간다. PR #81은 이슈 2건이 모두 줄 번호를 가져 본문 지적이 0이었고, Conversation 탭 독자에게 이 리뷰는 "문제 없음 + 칭찬 6개"로 읽혔다.

**뒷받침 조사 (2026-08-13):** AI 리뷰 도구 설계에 관한 복수 소스가 같은 방향을 가리킨다 — 판정·지적 먼저, 서사 나중("findings-first with explicit triage"), 칭찬·서사는 소음 계층(Signal Ratio 분모), 간결한 코멘트가 실행률이 높다. 수치("3배", "40%")는 검색 재인용이라 설계 근거로 쓰지 않되, 방향은 교차 지지된다.

**요구사항 (founder, 2026-08-13):** "사용자가 위에서 아래로 읽으면서 각각의 PR과 결론적으로 무엇을 이야기하고 싶은지가 명확하게 드러나야 한다."

## 2. 목표 상태

### 목표

- 본문 첫 줄이 결론이다: 리스크 배지 + 지적/제안 카운트. **전부 기존 필드의 이동이거나 산술 — 판단 문장 없음.**
- 모든 이슈가 본문에 나타난다. 줄 번호가 있는 이슈는 한 줄 요약(severity·category·`파일:줄`·제목) + 인라인 1:1 안내, `line === null` 이슈는 현행 전문 렌더 유지.
- 섹션 순서: **결론 줄 → 발견된 문제점 → 개선 제안 → 요약 → 변경 사항 상세 → 시퀀스 다이어그램 → 강점.** (현행: 요약 → 상세 → 다이어그램 → 강점 → 문제점 → 제안)
- 요약 섹션에서 배지(결론 줄로 이동)와 리뷰 포인트(`keyPoints`) 렌더를 제거한다.
- 강점은 상위 2개로 절단한다.
- `file === null && line !== null` 이슈가 본문·인라인 양쪽에서 유실되는 잠재 edge를 닫는다 (§4-2).

### 비목표

- **프롬프트·스키마 변경** — `keyPoints`와 강점 생성량은 그대로 둔다. 렌더만 끊는다. 스키마 정리는 별건(§7-1).
- **severity 보정** — 검수자의 severity 조정은 2026-07 스펙 비목표로 명시돼 있어 게이트가 없다. 프롬프트 지침은 메커니즘이 아니므로 범위에서 뺀다.
- **권장행동 지시** ("병합 가능/수정 필요") — §3 대안 B 기각.
- **대시보드 렌더러**(`structured-review-body.tsx`) — 자체 렌더러라 GitHub 본문과 순서가 달라지지만 별건으로 둔다.
- **인라인 코멘트 경로**(`pr-review.ts`) 변경 — 게시 구조는 건드리지 않는다.
- **검수자 카드** — PR #72에서 완료.

### 성공 기준

1. `npx tsc --noEmit` 0 errors, `npm run lint` 0 errors.
2. `npm test` — 기존 108개 유지 + 신규 포매터 테스트 전부 통과.
3. 이슈 2건이 모두 줄 번호를 가진 입력(PR #81 시나리오)에서, 본문에 결론 줄 카운트와 이슈 한 줄 요약 2건이 렌더된다.
4. 결론 줄이 본문 최상단 섹션이다 (열화 고지·`## AI Code Review` 래퍼 제외 — §4-4 적층 순서 참조).
5. 요약 섹션에 배지와 리뷰 포인트가 렌더되지 않는다.
6. 강점이 3개 이상인 입력에서 2개만 렌더된다.

## 3. 대안 분석 — 기각 기록

이 설계는 6턴의 반복 검증으로 수렴했다. 기각된 대안과 이유를 기록한다 — **같은 아이디어의 재상정을 막기 위해서다.**

### 기각 A: LLM 생성 결론 문장

결론 줄을 LLM에게 쓰게 하는 안. **기각** — 리뷰에서 가장 잘 보이는 자리에 새 환각 표면을 만든다. 이 제품이 검수자 요약줄("N개 중 M개")을 걷어낸 것과 같은 이유. 결론 줄은 조립만 한다.

### 기각 B: 권장행동 지시 (severity 분포 → "수정 후 병합" 등)

결정적 파생이라 환각은 없지만 **기각** — (1) 배지(`riskLevel`, LLM 판단)와 파생 지시(severity 분포)는 출처가 달라 같은 줄에서 모순될 수 있다("🟢 Low Risk — 수정 후 병합"). (2) 검수자가 severity를 조정하지 않으므로(스펙 비목표) 미검증 값 위에 지시를 얹는 격. (3) 이 도구는 일관되게 "필터링만 하고 결정권은 사용자에게"를 지켜왔다. severity 내역을 **사실로**(카운트 괄호) 전달하고 판단은 독자에게 맡긴다.

### 기각 C: 본문 → 인라인 코멘트 링크 ("[inline ↗]")

**기각** — 코멘트 URL은 게시 후에야 생기므로 본문 작성 시점엔 알 수 없다. diff 앵커(`#diff-{sha256}`)로 우회 가능하지만, 개선 제안 섹션이 이미 링크 없는 텍스트 안내("1:1로 연결됩니다")로 동작함을 실증했다. 검증된 패턴을 재사용한다.

### 기각 D: severity–서술 정합을 프롬프트로 교정

PR #81에서 `SUGGESTION` 이슈가 "브랜딩 훼손 위험"을 서술하는 불일치가 관찰됐다. **기각** — 검수자의 severity 조정 금지가 스펙에 명시돼 있어 잡아줄 게이트가 없고, 프롬프트 지침은 효과 측정이 불가능한 기대일 뿐이다. 검수자에게 severity 판정을 추가하는 것은 별도 트랙.

### 기각 E: 문서 없이 진행하지 않고 검증 풀사이클 (5렌즈 + 대조)

**기각** — 이 변경은 렌더 전용이다. 게시 게이트·외부 효과를 건드리지 않고 전부 문자열 단언으로 커버된다. `verification-card` 건은 게시 동작을 바꿔서 풀사이클이 정당했지만, 여기에 같은 무게를 태우면 절차 비용이 구현 비용을 넘는다. 이 문서는 **기록이지 게이트가 아니다** — 작성 후 바로 TDD 구현.

## 4. 구현 상세

### 4-1. `shared/constants/index.ts` — 라벨 추가

```ts
/** 리뷰 최상단 결론 줄 라벨. LanguageCode 추가 시 여기도 추가 필수.
 *  결론 줄은 판단 문장이 아니라 사실 조립이다 — 배지(기존 riskLevel) + 카운트(산술).
 *  권장행동("병합 가능" 등)은 넣지 않는다: severity는 검수자가 조정하지 않는 미검증
 *  값이고, 파생 지시는 배지와 모순될 수 있으며, 결정권은 사용자에게 있다. */
export const VERDICT_LINE_LABELS = {
  en: { issues: "{n} issues", suggestions: "{n} suggestions" },
  ko: { issues: "지적 {n}건", suggestions: "제안 {n}건" },
} as const satisfies Record<LanguageCode, { issues: string; suggestions: string }>;

/** 발견된 문제점 섹션의 인라인 연결 안내.
 *  개선 제안 섹션의 SUGGESTION_SECTION_HINT(suggestion-format.ts)와 동형 패턴. */
export const ISSUE_SECTION_HINT = {
  en: "> Items with a file and line map 1:1 to inline comments in the Files changed tab.",
  ko: "> 파일·줄이 있는 항목은 Files changed 탭의 인라인 코멘트와 1:1로 연결됩니다.",
} as const satisfies Record<LanguageCode, string>;
```

### 4-2. `features/ai/lib/review-formatter.ts` — `formatStructuredReviewToMarkdown` 재구성

import에 `VERDICT_LINE_LABELS`, `ISSUE_SECTION_HINT` 추가. `RISK_BADGE`(10-14행)는 그대로 두고 소비처만 바뀐다.

**(a) 결론 줄 — 함수 첫 섹션으로 신설**

```ts
export function formatStructuredReviewToMarkdown(
  output: StructuredReviewOutput,
  langCode: LanguageCode,
): string {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  // ── 결론 줄: 배지 + 카운트. 전부 기존 필드 이동이거나 산술 — 판단 문장 금지 ──
  // 🚨/⚠️만 괄호 내역으로 센다. 0이면 괄호 생략.
  const criticalCount = output.issues.filter((i) => i.severity === "CRITICAL").length;
  const warningCount = output.issues.filter((i) => i.severity === "WARNING").length;
  const breakdownParts = [
    criticalCount > 0 ? `${SEVERITY_EMOJI.CRITICAL} ${criticalCount}` : null,
    warningCount > 0 ? `${SEVERITY_EMOJI.WARNING} ${warningCount}` : null,
  ].filter((p): p is string => p !== null);
  const breakdown = breakdownParts.length > 0 ? ` (${breakdownParts.join(" · ")})` : "";

  const verdictLabels = VERDICT_LINE_LABELS[langCode];
  const issuesPart =
    verdictLabels.issues.replace("{n}", String(output.issues.length)) + breakdown;
  const suggestionsPart = verdictLabels.suggestions.replace(
    "{n}",
    String(output.suggestions.length),
  );
  sections.push(
    `> **${RISK_BADGE[output.summary.riskLevel]}** — ${issuesPart} · ${suggestionsPart}`,
  );
```

**(b) 발견된 문제점 — 두 번째 섹션으로 이동, 전수 표시**

분할 기준은 `pr-review.ts`의 인라인 판별(`i.file !== null && i.line !== null`, 64-67행 type predicate)과 **동일한 술어**를 쓴다. 본문 쪽은 그 여집합이다 — 기존 `line === null` 필터(109행)를 여집합으로 바꾸면 `file === null && line !== null` 이슈가 본문·인라인 양쪽에서 유실되던 잠재 edge가 닫힌다.

```ts
  if (output.issues.length > 0) {
    const inlineIssues = output.issues.filter(
      (i) => i.file !== null && i.line !== null,
    );
    // 인라인의 여집합 — line === null 필터가 놓치던 file:null·line:non-null도 포함
    const bodyIssues = output.issues.filter(
      (i) => !(i.file !== null && i.line !== null),
    );

    const parts: string[] = [`## ${headers.issues} (${output.issues.length})`];

    if (inlineIssues.length > 0) {
      parts.push("", ISSUE_SECTION_HINT[langCode], "");
      parts.push(
        ...inlineIssues.map(
          (issue) =>
            `- ${SEVERITY_EMOJI[issue.severity]} ${CATEGORY_EMOJI[issue.category]} \`${issue.file}:${issue.line}\` — ${(issue.title ?? "").trim()}`,
        ),
      );
    }

    if (bodyIssues.length > 0) {
      // 기존 111-150행의 전문 렌더 로직을 그대로 이 블록으로 옮긴다
      // (severity/category 헤더, title-suffix 중복 제거, impact/recommendation 필드)
      parts.push("", /* 기존 items 조립 결과 */);
    }

    sections.push(parts.join("\n"));
  }
```

**(c) 개선 제안 — 세 번째 섹션 (헤더에 카운트 추가 외 현행 유지)**

```ts
  // `## ${headers.suggestions}` → `## ${headers.suggestions} (${output.suggestions.length})`
```

**(d) 요약 — 네 번째 섹션으로 이동, 배지·리뷰 포인트 제거**

기존 63-80행의 summaryLines에서 배지 줄(66행)과 `keyPoints` 블록(71-78행)을 제거한다:

```ts
  sections.push(`## ${headers.summary}\n\n${output.summary.overview}`);
```

**(e) 변경 사항 상세 · 시퀀스 다이어그램 — 현행 유지, 순서만 요약 뒤로**

**(f) 강점 — 마지막 섹션, 상위 2개 절단**

```ts
  const topStrengths = output.strengths.slice(0, 2);
  if (topStrengths.length > 0) {
    const items = topStrengths.map((s) => `- ${s}`).join("\n");
    sections.push(
      `<details>\n<summary>\n\n## ${headers.strengths}\n\n</summary>\n\n${items}\n\n</details>`,
    );
  }
```

`sections` 최종 순서: 결론 줄 → 문제점 → 제안 → 요약 → 상세 → 다이어그램 → 강점.

### 4-3. 변경하지 않는 것

- `buildReviewNotice`(32-54행) — 열화 고지는 그대로 `review.ts`에서 본문 앞에 붙는다.
- `pr-review.ts` 전체 — 게시 구조·인라인 경로·`## AI Code Review` 래퍼(75-80행) 무변경.
- `RISK_BADGE`·`SECTION_HEADERS`·`ISSUE_FIELD_LABELS` — 기존 키 무변경 (추가만).
- 폴백 경로 — 구조화 실패 시 이 포매터가 호출되지 않으므로 영향 없음.

### 4-4. 최종 적층 순서 (독자가 실제로 보는 것)

```
## AI Code Review              ← pr-review.ts 래퍼
> ⚠️/ℹ️ 열화 고지 (있을 때만)   ← buildReviewNotice, review.ts에서 앞에 붙임
> **🟡 Medium Risk** — 지적 …  ← 이번에 신설되는 결론 줄
## 발견된 문제점 (N) …
```

열화 고지가 결론 줄보다 위에 오는 것은 의도된 순서다 — "이 리뷰 자체가 온전한가"는 리뷰 내용보다 먼저 알아야 한다.

## 5. 산출물 Before/After — PR #81 실데이터 기준

### Before (실제 게시됐던 것)

```
## AI Code Review
## 요약
> **🟢 Low Risk**
(개요 문단) + 리뷰 포인트 3불릿
<details>변경 사항 상세</details>
<details>강점 — 6불릿</details>
## 개선 제안
- 💡 SUGGESTION · `feature-scout.md:L183` …
                                  ← 발견된 문제점 섹션 자체가 없음
```

### After

```
## AI Code Review

> **🟢 Low Risk** — 지적 2건 · 제안 1건

## 발견된 문제점 (2)

> 파일·줄이 있는 항목은 Files changed 탭의 인라인 코멘트와 1:1로 연결됩니다.

- 💡 🔀 `.claude/agents/feature-scout.md:155` — '자기만의' 가치 평가에 대한 구체적 판단 기준 부족
- 💡 📋 `.claude/agents/feature-scout.md:183` — 경로 구분자가 Windows 전용

## 개선 제안 (1)

> 아래 항목은 각각 inline suggestion과 1:1로 연결됩니다. …

- 💡 SUGGESTION · `.claude/agents/feature-scout.md:L183` …

## 요약

(개요 문단 — 배지·리뷰 포인트 없음)

<details>변경 사항 상세</details>
<details>강점 — 2불릿</details>
```

두 이슈가 모두 `SUGGESTION` severity이므로 결론 줄 괄호 내역은 생략된다 — 🚨/⚠️가 있을 때만 `지적 3건 (🚨 1 · ⚠️ 1)` 형태.

부수 효과: 인라인 이슈의 제목이 본문에 남으므로, 2차 인라인 호출 실패 시 이슈가 통째로 유실되던 기존 실패 모드(`pr-review.ts:89` 주석 — "2차 호출 실패 시 유실됨")가 "최소 제목은 보존"으로 완화된다.

## 6. 검증 전략 — TDD

### 신규 테스트 — `features/ai/lib/review-formatter.test.ts` (새 파일)

`formatStructuredReviewToMarkdown`은 현재 테스트가 0개다(`review-notice.test.ts`는 `buildReviewNotice`만 다룬다). `verify-review.test.ts`의 팩토리(`makeIssue`/`makeSuggestion`/`makeOutput`)와 같은 형태의 로컬 팩토리를 새 파일에 둔다.

구현 전에 작성해 실패를 확인할 테스트:

1. **결론 줄 조립** — 배지 + `지적 2건 · 제안 1건`이 첫 섹션으로 렌더
2. **괄호 내역 조건** — CRITICAL 1 + WARNING 1 입력 → `(🚨 1 · ⚠️ 1)`; 전원 SUGGESTION → 괄호 없음
3. **0건 경계** — 이슈 0 + 제안 0 → `지적 0건 · 제안 0건` (사실 그대로)
4. **인라인 이슈 한 줄 요약** — file+line 이슈가 `` `파일:줄` — 제목 `` 형식으로 본문에 나타나고, 전문(impact/recommendation)은 본문에 없음
5. **`line === null` 이슈 전문 유지** — 기존 렌더 형식 그대로
6. **edge 폐쇄** — `file: null, line: 42` 이슈가 본문 전문 쪽에 나타남 (현행에서는 양쪽 유실)
7. **요약 축소** — 본문에 배지 문자열이 결론 줄 1회만, `reviewFocus` 헤더 부재
8. **강점 절단** — 4개 입력 → 2개 렌더
9. **섹션 순서** — `indexOf`로 결론 < 문제점 < 제안 < 요약 < 강점 단언

### 회귀 확인

- `npx tsc --noEmit` · `npm run lint` · `npm test` (기존 108 + 신규 9)
- 수동: 다음 실제 PR에서 Conversation 탭만 보고 지적 전체를 파악할 수 있는지 — 이 문서의 존재 이유이므로 반드시 실물로 확인

## 7. 리스크/한계

**(1) `keyPoints`가 죽은 스키마 필드로 남는다.** 생성은 되고 렌더만 끊긴다(토큰 소폭 낭비). 스키마·프롬프트 정리는 생성 경로 변경이라 별건으로 뒀다.

**(2) 강점 절단은 배열 순서 의존이다.** LLM이 중요도순으로 낸다는 보장이 없다 — 상위 2개가 아니라 "앞의 2개"다. 프롬프트에 순서 지시를 넣는 것은 측정 불가 영역이라 하지 않는다.

**(3) 대시보드와 순서가 달라진다.** `structured-review-body.tsx`는 자체 렌더러라 이번 변경의 영향 밖이고, GitHub과 대시보드의 섹션 순서 불일치가 생긴다. 실사용자가 혼란을 보고하면 그때 맞춘다.

**(4) "더 잘 읽히는가"는 분석으로 검증 불가.** 이 설계의 최종 검증은 실제 PR 리뷰가 달렸을 때 Conversation 탭에서의 실독뿐이다. 사용자 0명 상태에서 여기서 더 반복하는 것은 추측 경쟁이다.

## 8. 미해결 질문

- `keyPoints` 스키마 제거 시점 — 별건, 언제?
- 강점 상한 2 vs 완전 삭제 — 상한 2로 작성했다
- `docs/` gitignore 해제 여부 — 이 문서도 로컬 전용이다

## 9. 이력

2026-08-13 ~ 08-14, 설계 6턴 수렴. 매 턴 "최적안이야?" 재검증으로 다음이 제거됐다:

| 턴 | 제거된 것 | 이유 |
|---|---|---|
| 1 | (초안: 조사 + 4항목) | — |
| 2 | LLM 생성 결론 문장 | 최상단 환각 표면 (기각 A) |
| 2 | severity 프롬프트 교정 | 게이트 부재 (기각 D) |
| 2 | 인라인 링크 | 게시 전 URL 불가 (기각 C) |
| 2 | 문서 풀사이클 | 렌더 전용에 과함 (기각 E) |
| 3 | 권장행동 지시 | 배지와 모순 가능 + 결정권 침범 (기각 B) |
| 4 | (수렴 확인) | 남은 요소 전부 기존 데이터 이동 또는 산술 |

공통 패턴: 제거된 것은 전부 **발명 요소**였다. 남은 설계는 기존 데이터의 재배치와 셈으로만 구성된다.
