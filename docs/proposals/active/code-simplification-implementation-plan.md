---
status: "pending"
stage: "awaiting-approval"
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
migrated-from: "docs/proposals/code-simplification-implementation-plan.md"
migration-note: "원문의 작업 범위와 상태를 보존한다. 이관은 후속 제품 구현의 자동 착수를 뜻하지 않는다."
---

> 이관 메모 (2026-09-06): 원문의 작업 범위와 상태를 보존한다. 이관은 후속 제품 구현의 자동 착수를 뜻하지 않는다. 경로·메타데이터 변경 전의 hash와 검토 영수증은 당시 기록이며 새 검증 결과가 아니다.

# 과도한 코드 복잡도 조사 및 단순화 구현 계획

- 작성일: 2026-09-06 (KST)
- 기준 저장소: `C:/Users/hamso/OneDrive/Desktop/git/hreviewer`
- 기준 브랜치 / HEAD: `develop` / `3d3b6d88f883c933147347d945a035626153ca94`
- 최초 작성 시 시작 상태: `git status --short` 출력 없음. 직전 미사용 코드 정리 커밋이 반영된 상태다.
- 검토 위험도: HIGH-RISK (`reconciling-proposals-with-codebase` 기준). 수정 자체는 국소적이지만 S02의 외부 요청 결과, S04의 자동 리뷰 생략, S06의 유료 권한 갱신을 보존해야 한다. 변경 범위를 확대하지 않고 해당 경계의 반환값·호출 인자·순서·실패 처리를 검증한다.
- 상태: **구현 명세 정리 완료 — 최종 준비 판정은 저장 후 수정 없는 전체 재검증 결과로 확정한다. 제품 구현과 V01–V06의 구현 후 검증은 미실행.**
- 이번 작업의 산출물: 이 Markdown 파일 하나. 소스·테스트·설정·의존성·DB·Git 이력은 변경하지 않는다.

## 1. 결론과 우선순위

현재 코드에서 동작을 유지하면서 단순화할 수 있는 항목 **6개**를 확정했다. 줄 수 자체보다 같은 결정을 여러 곳에서 수정해야 하거나, 이미 확정된 조건을 다시 검사하거나, 단순한 변환에 별도 상태와 분기를 유지하는 비용을 기준으로 선정했다.

| ID | 기능 / 현재 복잡도 | 단순화 방향 | 우선순위 / 검증 주의점 |
| --- | --- | --- | --- |
| S01 | GitHub 리뷰 본문과 웹 리뷰 상세의 이슈 Markdown 생성이 중복 | 동일한 본문 이슈 포맷만 순수 함수 한 곳으로 이동 | 높음 / 출력 문자열과 웹 렌더링 보존 |
| S02 | 리뷰 요청과 요약 요청에서 같은 결과 분류·메타데이터 조립을 반복 | 공통 결과 변환 함수, 요청 생성과 예외 처리는 각 진입점에 유지 | 높음 / 실패 reason과 webhook 응답 의미 보존 |
| S03 | 기여도 JSON 파서가 레코드 검사·일/주 배열 순회·실패 전파를 수동 구현 | 기존 Zod로 구조 검증, 선택 필드 정규화와 합계 fallback은 명시 | 중간 / 부분 성공으로 바꾸지 않기 |
| S04 | suggestion 매칭 후 거의 같은 결과 객체를 네 번 구성 | `skipReview`와 `reason`을 결정하고 결과 한 번 반환 | 중간 / ambiguous 우선순위·빈 입력 보존 |
| S05 | 프로필 네 필드에 같은 draft 초기화·병합 코드를 반복 | 컴포넌트 내부의 타입 안전한 필드 갱신 함수 | 중간 / 최초 편집·실패 후 draft·캐시 갱신 보존 |
| S06 | active 구독이 없다는 분기 안에서 다시 active 여부 검사 | 중복 조건과 중첩 한 단계 제거 | 낮음 / 요금제 갱신 호출 수·상태 매핑 보존 |

우선순위는 장애의 심각도를 뜻하지 않는다. S06은 [미사용 코드 정리 계획](./unused-code-cleanup-implementation-plan.md)의 B02를 현재 코드와 다시 대조해 이 문서의 구현 범위로 구체화한 항목이다. 앞선 cleanup의 A01–A09를 재수행하지 않는다.

단순화의 기본 규칙은 **같은 의미를 가진 중복만 합치는 것**이다. 예를 들어 `pr-review.ts`의 인라인 포맷은 본문 포맷과 문장 경계 정규식이 다르다. 세 포맷을 무조건 통합하거나, 긴 worker를 공통 `runStep` 함수로 감싸는 방식은 이 계획에 포함하지 않는다.

## 2. 조사 범위와 근거

### 확인한 범위

- **Observed**: `app`, `features`, `lib`, `inngest`, `shared`, `scripts`의 파일 목록과 함수·조건·호출 참조를 검색했다. `features`·`lib`·`inngest`의 비테스트 TS/TSX 파일 크기도 후보 탐색에 사용했다. 생성된 Prisma client는 단순화 후보에서 제외했다.
- **Observed**: 확정 6개 항목의 구현 본문과 직접 소비자, 관련 테스트를 읽었다. AI 요청 facade, 본문/인라인 포맷터, dashboard 파서와 화면, suggestion matcher와 webhook 소비자, settings 폼·hook·action, payment sync·테스트가 상세 검토 범위다.
- **Observed**: `review.ts`, `summary.ts`, `review-request.ts`, `review-trial.ts`, `repository-disconnect.ts`, GitHub delivery 코드의 실행 경계·lease·transaction·복구 참조를 확인했다. 긴 파일의 모든 분기까지 검증한 감사는 아니다.
- **Contracted**: 루트 [AGENTS.md](../../../AGENTS.md)와 `docs/conventions/`의 문서 9개(README 포함)를 필수 정책으로 읽었다. 모듈 내부 배치, kebab-case, 명시적 반환 타입, 부모 QueryBoundary, 자식에게 콜백/상태만 전달, 순서 의존 작업의 무분별한 병렬화 금지를 적용한다. 문서의 상태·배치·완료 처리는 [docs 안내](../../README.md)와 [Proposal 규칙](../README.md)을 따른다.
- **Observed**: `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`를 기준으로 기존 도구를 사용한다. 설치본은 TypeScript `5.9.3`, Zod `4.3.6`; manifest는 Next `16.0.10`, React `19.2.1`, Vitest `^2.1.9`, `strict: true`, `@/*` alias다. Vitest 환경은 `node`이며 기존 UI 테스트는 `renderToStaticMarkup`을 사용한다.
- **Inferred**: 아래 단순화 효과는 호출부·동일 코드·분기 불변식에 근거한 유지보수 판단이다. 번들 크기나 실행 성능 개선을 측정한 결과가 아니다.

### 기존 문서와의 관계

| 근거 | 이 문서에 적용하는 계약 | 범위 |
| --- | --- | --- |
| [문서 작성 규칙](../../conventions/writing-docs.md) | 길이보다 명확성, 최소 예시와 실행 가능한 규칙 | 이 문서 전체 |
| [TypeScript 규칙](../../conventions/typescript-clean-code-guide.md) | 불필요한 중복·중첩 제거, 외부 입력 검증·에러 처리 유지 | S01–S06 |
| [Settings 선행 제안](./settings-module-refactoring-feature.md)의 N-5 | 반복 필드 갱신 helper의 참고 근거 | S05만 편입. 현재는 필수 규약이 아닌 `proposals/active/`의 제안이며, 다른 과거 변경 지시나 hooks 분리를 재수행하지 않음 |
| [QueryBoundary 규칙](../../conventions/query-boundary.md) | Suspense와 오류 재시도 경계 유지 | S05 및 전체 회귀 확인 |
| [P0 상세 계획](../completed/2026-09-06-hreviewer-personal-review-coach-p0-implementation-plan.md)의 T07/T08 | 게시 복구·lease·trial credit·연결 해제 원자성 보존 | 보호 대상 식별에만 사용 |
| [P0 release receipt](../../test-reports/completed/2026-09-06-p0-personal-review-coach-release-receipt.md) | 현재 기록된 `COMPLETED BY USER RISK ACCEPTANCE`, `releaseGate: accepted-with-unverified-external-gates`, front matter의 `status: completed` / `result: blocked`를 함께 보존 | 사용자 위험 인수에 따른 문서 종결과 미확인 외부 gate를 구분하며, 품질 평가·production readiness 통과 증거로 바꾸지 않음 |

기존 문서의 과거 파일 위치나 구현 전 상태는 현재 코드의 사실로 재사용하지 않는다. 외부 API의 최신 계약을 새로 주장하지 않으며, 설치된 코드와 현재 응답 처리 계약을 보존한다. 현재 요청은 조사·문서 작성이므로 API 호출, 제품 test/lint/build, 로그인·결제·GitHub 쓰기는 수행하지 않았다.

위 receipt와 P0 상세 계획의 현재 상태는 HEAD에 커밋되지 않은 작업 트리 변경까지 읽은 결과다. 참조 문서의 상태가 달라지면 이 표도 함께 재대조한다. 이 단순화 작업에서 P0 문서나 release gate를 수정하지 않는다.

## 3. 보존할 동작과 제약

### REQ-SIMPLE-001: 리뷰 본문 표시 보존

WHEN 같은 구조화 이슈와 언어가 입력되면, 시스템은 GitHub 본문과 웹 상세에서 기존 제목·본문·영향·권장 조치·위치·심각도·카테고리 및 공백/개행을 동일하게 표시해야 한다. 인라인 코멘트의 별도 문장 경계·반복 배지·검증 배지는 유지한다.

### REQ-SIMPLE-002: 요청 결과와 실패 의미 보존

WHEN 리뷰 또는 요약 요청 coordinator가 결과를 반환하거나 예외를 던지면, 해당 facade는 기존 `success`, `message`, `reason`, 메타데이터의 값과 필드 존재 여부를 동일하게 반환해야 한다. 자동 리뷰의 DEBOUNCED, 명령의 DIRECT, 요약의 SUMMARY/COMMAND 설정도 유지한다.

### REQ-SIMPLE-003: 기여도 파싱의 허용·거부·fallback 보존

WHEN 기여도 데이터가 입력되면, 시스템은 올바른 전체 구조를 변환하고 일/주 구조가 하나라도 잘못되면 `null`을 반환해야 한다. 유한한 숫자 합계는 그대로 사용하고, 합계가 없거나 유효하지 않으면 각 일의 count를 합산해야 한다. 레벨이 문자열이 아니면 해당 필드를 생략해야 한다.

### REQ-SIMPLE-004: suggestion 적용 감지 결과 보존

WHEN 비교 파일과 대기 suggestion이 입력되면, 시스템은 기존 ID·경로 순서, 실패/모호함 분류, `skipReview`를 동일하게 반환해야 한다. 매칭 하나 이상이고 미해명 파일과 모호한 파일이 모두 없을 때만 `skipReview: true`를 반환한다.

### REQ-SIMPLE-005: 프로필 draft와 저장 동작 보존

WHEN 사용자가 프로필 필드 하나를 편집하면, 시스템은 다른 필드와 현재 draft를 보존하며 최초 편집 시 최신 profile 기본값으로 draft를 초기화해야 한다. 저장 성공 시 draft를 해제하고 세션을 갱신하며, 검증 실패나 요청 실패 시 입력을 유지해야 한다.

### REQ-SIMPLE-006: 구독 동기화의 상태 갱신 보존

WHEN 구독 동기화를 요청하면, 시스템은 active가 있으면 PRO/ACTIVE, active가 없고 첫 유효 구독이 canceled이면 FREE/CANCELLED, 그 외 상태면 FREE/EXPIRED를 기존과 동일하게 한 번 갱신해야 한다. 고객 없음·빈 결과·API 오류 및 DB 갱신 실패의 기존 실패 응답도 보존해야 한다.

### INV-SIMPLE-001: 데이터·권한·실행 계약 유지

Prisma schema/migration, 인증·소유권 검사, Review 상태/lease/credit, webhook signature/delivery, Inngest event·step 이름/순서, 외부 게시 순서는 변경하지 않는다. `reviewCounts` 호환성 필드도 유지한다. helper 추출은 외부 호출을 이동·추가·병렬화하는 근거가 아니다. P0의 사용자 위험 인수에 따른 종결과 미확인 외부 gate는 §2의 최신 기록 그대로 보존한다.

### CON-SIMPLE-001: 최소 변경과 경계 유지

§5에서 지정한 파일과 테스트만 수정한다. 새 helper는 소유 feature 내부에 놓고 직접 import한다. `features/ai/index.ts`나 `lib/index.ts` 배럴을 늘리거나 전역 범용 formatter/action/form 프레임워크를 만들지 않는다. UI가 사용하는 S01 helper에는 `server-only`, Prisma, Octokit, AI SDK, Node 내장 런타임 import를 추가하지 않는다. 타입 import는 `import type`을 사용한다.

### CON-SIMPLE-002: 검증과 범위 통제

현재 동작을 고정한 테스트를 먼저 준비하고 수정 후 같은 검증을 통과시킨다. 새 테스트 인프라·패키지는 추가하지 않는다. 제품 전체 검사는 §7의 환경 사전 확인을 통과한 환경에서 수행하고, 외부 쓰기·유료 AI·DB fixture 실행을 일반 테스트와 혼동하지 않는다. 실패나 미실행을 통과로 기록하지 않는다.

## 4. Phase SIMPLIFY: 동작을 보존하는 6개 국소 단순화

- status: Proposed
- satisfies: REQ-SIMPLE-001, REQ-SIMPLE-002, REQ-SIMPLE-003, REQ-SIMPLE-004, REQ-SIMPLE-005, REQ-SIMPLE-006
- preserves: INV-SIMPLE-001
- governed-by: CON-SIMPLE-001, CON-SIMPLE-002
- verifies: REQ-SIMPLE-001, REQ-SIMPLE-002, REQ-SIMPLE-003, REQ-SIMPLE-004, REQ-SIMPLE-005, REQ-SIMPLE-006
- 진입 조건: 구현 요청이 있을 때 HEAD·작업 트리·정책·직접 소비자를 재확인한다. 변경이 있으면 아래 line 번호 대신 명시한 심볼로 범위를 찾고 새 diff를 대조한다.
- 검증 범위: V01–V06의 테스트 작성과 수동 확인은 구현 작업에 포함된다. 이전 지적 사항과 이번 재검증 내용은 §9에 기록한다. 문서 검증 통과와 제품 구현 완료를 구분한다.
- 권장 순서: S01 → S02 → S03 → S04 → S05 → S06. 서로 의존하지 않으므로 작은 커밋으로 나눌 수 있다.
- 완료 조건: Phase 전체는 S01–S06 여섯 항목의 변경, V01–V06, 전체 필수 검사와 필요한 UI 확인까지 완료해야 한다. 개별 항목 완료만으로 Phase를 완료 처리하지 않는다. UI나 검증 환경이 없어 수행하지 못한 경우 `구현 완료 / 검증 대기`로 기록하고 Phase 전체를 Complete로 쓰지 않는다. 모두 충족한 뒤 §8의 metadata 갱신·완료 폴더 이동·문서 검증까지 같은 작업에서 마친다.
- 실행 경계: 현재 요청으로 수행하는 것은 이 계획 작성까지다. 이후 이 문서의 구현을 요청하면 위 여섯 항목을 수행할 수 있다. §6의 보류 항목은 이 Phase에 포함하지 않는다.

## 5. 항목별 바로 적용할 수정 명세

### TASK-SIMPLIFY-01: S01 — 본문 이슈 Markdown 중복 제거

- satisfies: REQ-SIMPLE-001
- preserves: INV-SIMPLE-001
- governed-by: CON-SIMPLE-001, CON-SIMPLE-002
- 구현 위치: `features/ai/lib/review-formatter.ts:147`의 `formatBodyIssues`; `features/review/ui/parts/structured-review-body.tsx:217`의 `bodyIssues.map`.
- 생성: `features/ai/lib/issue-format.ts` (신규, 순수 함수).
- 검증 위치: V01, 기존 `features/ai/lib/review-formatter.test.ts`, `features/review/ui/parts/structured-review-body.test.tsx`, `features/review/lib/pr-review.test.ts`.
- 중단 조건: 문장 제거 규칙·본문 섹션 순서·인라인 규칙까지 바꾸어야 한다면 해당 확장을 중단한다.

**문제와 단순화 효과**

두 본문 경로가 심각도·카테고리·위치 조합, legacy `description` fallback, 제목 접두어 제거, 영향/권장 조치 조립을 동일하게 수행한다. 같은 출력 규칙을 수정할 때 약 40행씩 두 군데를 함께 고쳐야 한다. 이미 suggestion은 `suggestion-format.ts`의 순수 함수를 공유하므로 같은 소유권과 import 방향을 따른다.

**수정 순서**

1. 새 파일에 아래 함수를 추가한다. 기존 두 map callback의 본문만 옮긴 형태다.
2. `review-formatter.ts`의 `formatBodyIssues`를 삭제하고 기존 호출을 `output.issues.map((issue) => formatReviewBodyIssue(issue, langCode)).join("\n\n")`로 대체한다. 이 함수 때문에만 쓰던 `CATEGORY_EMOJI`, `ISSUE_FIELD_LABELS` import를 제거한다. 결론 줄에서 쓰는 `SEVERITY_EMOJI`는 유지한다.
3. `structured-review-body.tsx`의 `RemainingMarkdownSections`에서 map 바로 위의 `const labels = ISSUE_FIELD_LABELS[langCode];` 선언을 삭제한다. 이어 map을 `const issueLines = bodyIssues.map((issue) => formatReviewBodyIssue(issue, langCode));`로 바꾸고 불필요해진 `CATEGORY_EMOJI`, `SEVERITY_EMOJI`, `ISSUE_FIELD_LABELS` import를 제거한다. 라벨 조회는 새 helper 내부에만 남긴다.
4. 두 파일은 각각 `./issue-format`, `@/features/ai/lib/issue-format`에서 직접 import한다. 섹션 제목·개수·힌트·순서·ReactMarkdown 옵션은 각 소비자에 남긴다.
5. `pr-review.ts` 실행 코드는 유지한다. 두 본문과 같다고 주장하는 `SYNC:formatIssueBody` 주석은 실제 차이가 있음을 설명하는 짧은 주석으로 고친다. 새 helper를 인라인에 적용하지 않는다.

```ts
import { ISSUE_FIELD_LABELS } from "@/shared/constants";
import type { LanguageCode } from "@/shared/types/language";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "../constants/review-emoji";
import type { StructuredIssue } from "../types";

export function formatReviewBodyIssue(
  issue: StructuredIssue,
  langCode: LanguageCode,
): string {
  const labels = ISSUE_FIELD_LABELS[langCode];
  const severity = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
  const category = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;
  const lineTag = issue.line === null ? "" : `:${issue.line}`;
  const fileTag = issue.file ? ` · \`${issue.file}${lineTag}\`` : "";
  const title = (issue.title ?? "").trim();
  const rawBody = (issue.body ?? (issue as { description?: string }).description ?? "").trim();
  const impact = (issue.impact ?? "").trim();
  const recommendation = (issue.recommendation ?? "").trim();
  const titleSuffix = title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
  const body =
    titleSuffix !== null && (titleSuffix === "" || /^[\s.,:;-]/.test(titleSuffix))
      ? titleSuffix.replace(/^[\s.,:;-]+/, "")
      : rawBody;
  const lines = [`### ${severity} · ${category}${fileTag}${title ? ` - ${title}` : ""}`];
  if (body) lines.push("", body);
  if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
  if (recommendation) lines.push("", `**${labels.recommendation}:** ${recommendation}`);
  return lines.join("\n");
}
```

**보존해야 하는 실제 차이**

| 제목 `Title`, raw body | 본문 두 경로 | 인라인 `pr-review.ts:234` |
| --- | --- | --- |
| `Title more` | `more` | `Title more` |
| `Title—more` | `Title—more` | `more` |
| `Title: more` | `more` | `more` |
| `TitleCase` | `TitleCase` | `TitleCase` |
| `Title` | 빈 본문 | 빈 본문 |

현재 `StructuredIssue` 타입에 `body`가 필수여도 인라인 코드에 in-flight 재개와 legacy fallback 근거가 있으므로 `description` 호환 분기를 이 작업에서 제거하지 않는다. 여기서 단언은 기존 호환 읽기를 그대로 옮기는 것이며 새로운 입력 검증 우회를 도입하지 않는다.

### TASK-SIMPLIFY-02: S02 — 요청 결과 변환 한 곳으로 모으기

- satisfies: REQ-SIMPLE-002
- preserves: INV-SIMPLE-001
- governed-by: CON-SIMPLE-001, CON-SIMPLE-002
- 수정: `features/ai/actions/review-pull-request.ts:22–81`, `features/ai/actions/generate-pr-summary.ts:20–79`, `features/ai/types/index.ts:48`.
- 생성: `features/ai/lib/review-request-result.ts` (신규, 순수 결과 변환).
- 검증 위치: V02, 두 action의 기존 `*.test.ts`, `app/api/webhooks/github/github-webhook-handler.test.ts`.
- 중단 조건: `CreateReviewRequestResult`의 kind/status가 바뀌었거나 새 반환 정책을 결정해야 한다면 매핑을 임의로 만들지 않는다.

**문제와 단순화 효과**

두 action은 `createReviewRequest`에 전달하는 설정이 다르지만 그 이후 rejected·dispatch 실패·FAILED·SUPERSEDED 처리와 성공 메시지 분류는 동일하다. 메타데이터 조립도 복제되어 있다. 신규 상태를 한쪽에만 반영하면 webhook에서 실패를 처리하는 의미까지 달라질 수 있다.

**수정 순서**

1. `GeneratePRSummaryResult`는 이름을 보존한 채 `export type GeneratePRSummaryResult = ReviewPullRequestResult;`로 정의한다. 기존 export와 외부 import 이름은 유지한다.
2. 두 action은 현재 try/catch와 coordinator 호출을 그대로 유지하고, 호출 이후를 각각 `return formatReviewRequestResult(result, "Review");`, `return formatReviewRequestResult(result, "Summary");`로 바꾼다.
3. helper의 coordinator 의존성은 **type import만** 허용한다. `createReviewRequest` 실행이나 권한/dispatch 설정은 helper로 옮기지 않는다.
4. 새 helper는 아래 구현으로 시작한다. 외부 payload가 아닌 coordinator의 닫힌 반환 타입을 소비한다.

```ts
import type { CreateReviewRequestResult } from "@/features/review/lib/review-request";
import type { ReviewPullRequestResult } from "../types";

export function formatReviewRequestResult(
  result: CreateReviewRequestResult,
  subject: "Review" | "Summary",
): ReviewPullRequestResult {
  if (result.kind === "rejected") {
    const reasons = {
      PLAN_RESTRICTED: "plan_restricted",
      TRIAL_EXHAUSTED: "trial_exhausted",
      PR_NOT_REVIEWABLE: "pr_not_reviewable",
    } as const;
    return { success: false, message: result.message, reason: reasons[result.reason] };
  }

  const metadata = {
    reviewId: result.reviewId,
    requestKey: result.requestKey,
    status: result.status,
    ...(result.kind === "dispatch-failed" ? { failureStage: result.failureStage } : {}),
  };
  if (result.kind === "dispatch-failed") {
    return { success: false, message: result.message, reason: "internal_error", ...metadata };
  }
  if (result.status === "FAILED") {
    return {
      success: false,
      message: `The ${subject.toLowerCase()} failed. Retry it from the pull request page.`,
      reason: "review_failed",
      ...metadata,
    };
  }
  if (result.status === "SUPERSEDED") {
    return {
      success: false,
      message: `A newer pull request head superseded this ${subject.toLowerCase()}.`,
      reason: "review_superseded",
      ...metadata,
    };
  }

  const messages = {
    COMPLETED: `${subject} already completed`,
    RUNNING: `${subject} already in progress`,
    POSTING: `${subject} already in progress`,
    PENDING: result.kind === "existing" ? `${subject} already queued` : `${subject} Queued`,
  } satisfies Record<typeof result.status, string>;
  return { success: true, message: messages[result.status], ...metadata };
}
```

예외 발생 시 문구도 변경하지 않는다. `reviewPullRequest`는 `Error Reviewing Pull Request`, `generatePRSummary`는 `Error Queueing Summary`와 `internal_error`를 반환한다. rejected와 예외 결과에 원래 없던 `reviewId: undefined` 같은 키를 추가하지 않는다. result 객체는 `toStrictEqual`로 비교하고, 없어야 하는 키는 `not.toHaveProperty`로도 확인한다.

### TASK-SIMPLIFY-03: S03 — 기여도 파서의 수동 구조 검사 제거

- satisfies: REQ-SIMPLE-003
- preserves: INV-SIMPLE-001
- governed-by: CON-SIMPLE-001, CON-SIMPLE-002
- 수정: `features/dashboard/lib/parse-contribution-calendar.ts:3–83` 전체 구현. 기존 export 함수명·시그니처 유지.
- 생성: `features/dashboard/lib/parse-contribution-calendar.test.ts` (신규, 입력/출력 계약 테스트).
- 검증 위치: V03. 소비자 `get-dashboard-data.ts:42–69`, `stats-overview.tsx`, `contribution-graph.tsx`는 회귀 확인만 한다.
- 중단 조건: 설치 Zod가 아래 필드 생략/유한 숫자 동작을 재현하지 못하거나, JSON 외 특수 객체 소비자가 새로 발견되면 변환을 확대하지 않는다.

**문제와 단순화 효과**

83행에서 `isRecord`, day 파서, week 파서, calendar 파서가 같은 실패 전파를 반복한다. JSON 구조 검증은 이미 사용 중인 Zod에 맡기고 도메인 정책인 선택 필드 생략과 합계 fallback만 눈에 보이게 남긴다. schema를 별도 디렉터리로 옮기거나 dashboard 조회 자체를 바꾸지 않는다.

**교체할 파일 본문**

```ts
import { z } from "zod";
import type { ContributionCalendar } from "../types";

const contributionDaySchema = z.object({
  date: z.string(),
  contributionCount: z.number().finite(),
  contributionLevel: z.unknown(),
}).transform(({ date, contributionCount, contributionLevel }) =>
  typeof contributionLevel === "string"
    ? { date, contributionCount, contributionLevel }
    : { date, contributionCount }
);

const contributionCalendarSchema = z.object({
  weeks: z.array(z.object({
    contributionDays: z.array(contributionDaySchema),
  })),
  totalContributions: z.unknown(),
});

export function parseContributionCalendar(value: unknown): ContributionCalendar | null {
  const parsed = contributionCalendarSchema.safeParse(value);
  if (!parsed.success) return null;
  const { weeks, totalContributions } = parsed.data;
  return {
    weeks,
    totalContributions:
      typeof totalContributions === "number" && Number.isFinite(totalContributions)
        ? totalContributions
        : weeks.reduce(
            (sum, week) => sum + week.contributionDays.reduce(
              (weekSum, day) => weekSum + day.contributionCount, 0,
            ), 0,
          ),
  };
}
```

`date`에 날짜 정규식, count에 정수/양수 제한, level에 enum 제한을 추가하면 기존 허용 입력이 거부된다. `contributionLevel: z.string().optional()`도 기존에 허용하던 숫자/null을 거부하므로 사용하지 않는다. 알 수 없는 필드는 기존처럼 버린다. 잘못된 day만 `.filter()`로 제거하는 부분 성공 방식도 금지한다.

허용 입력 범위는 GitHub JSON 응답과 그 실패를 나타내는 null/undefined다. 배열에 임의 프로퍼티를 붙인 객체나 getter/Proxy를 JSON 데이터와 동등하다고 주장하지 않는다. day의 유한 값 합산이 매우 커 overflow하는 경우도 기존 산술을 유지하며 새 clamp를 넣지 않는다.

### TASK-SIMPLIFY-04: S04 — 매칭 후 결과 객체를 한 번만 구성

- satisfies: REQ-SIMPLE-004
- preserves: INV-SIMPLE-001
- governed-by: CON-SIMPLE-001, CON-SIMPLE-002
- 수정: `features/suggestion/lib/match-suggestions-against-compare.ts:136–180`의 최종 결과 분류 부분.
- 생성: `features/suggestion/lib/match-suggestions-against-compare.test.ts` (신규).
- 검증 위치: V04, 기존 `reconcile-native-suggestions.test.ts`, `github-webhook-handler.test.ts`.
- 중단 조건: Stage A/B 매칭 방식, strict 적용, 정렬, 입력 정규화 또는 webhook 처리 순서를 바꿔야 한다면 범위 밖으로 분리한다.

**문제와 단순화 효과**

매칭 완료 후 `hasAnyMatch`, `hasAmbiguous`, `hasUnaccounted`를 분기하며 동일한 배열 네 개를 담은 객체를 네 번 반환한다. 실제로 달라지는 것은 `reason`과 `skipReview`다. 빈 배열을 반환하는 분기에서는 수집된 배열도 이미 비어 있다.

**기존 `const hasAnyMatch`부터 파일 끝까지 대체**

```ts
  const hasAnyMatch = matchedSuggestionIds.length > 0;
  const hasUnaccounted = unaccountedFilePaths.length > 0;
  const hasAmbiguous = ambiguousFilePaths.length > 0;
  const skipReview = hasAnyMatch && !hasUnaccounted && !hasAmbiguous;
  let reason: MatchResult["reason"] = "partial_match";
  if (hasAmbiguous) reason = "ambiguous_match";
  else if (skipReview) reason = "exact_match_all_files";

  return {
    matchedSuggestionIds,
    matchedFilePaths,
    unaccountedFilePaths,
    ambiguousFilePaths,
    skipReview,
    reason,
  };
}
```

`matchedFilePaths`에 push하는 모든 경로는 suggestion ID도 추가하므로, `hasAnyMatch === false`이면 두 배열이 모두 비어 있다. 이 불변식이 바뀌지 않았는지 구현 전에 확인한다. 반환 배열은 함수 내부에서 새로 만든 배열이며 입력 배열의 참조와 순서를 변경하지 않는다.

| 조건 | reason | skipReview |
| --- | --- | --- |
| 비교 파일이 비어 있음 | `no_changed_files` | false |
| 비교 파일은 있으나 suggestion 없음 | `no_pending_suggestions` | false |
| ambiguous 있음(다른 match 유무와 무관) | `ambiguous_match` | false |
| match 없음 또는 unaccounted 있음 | `partial_match` | false |
| match 있고 ambiguous/unaccounted 없음 | `exact_match_all_files` | true |

함수 앞의 early return 두 개는 그대로 남긴다. 마지막 분기에 합치면 빈 입력의 reason이나 unaccountedFilePaths가 바뀐다.

### TASK-SIMPLIFY-05: S05 — 프로필 필드 갱신 반복 제거

- satisfies: REQ-SIMPLE-005
- preserves: INV-SIMPLE-001
- governed-by: CON-SIMPLE-001, CON-SIMPLE-002
- 수정: `features/settings/ui/parts/profile/profile-form.tsx:76–81,96–101,113–118,132–137`의 필드 핸들러.
- 검증 위치: V05. 기존 `features/settings/actions/index.test.ts`와 실제 `/dashboard/settings` 폼 확인.
- 중단 조건: `ProfileFormState`에 필드가 추가되어 현재 입력 의미가 바뀌었거나 폼 상태 라이브러리 교체가 필요하다는 결론이면 그 확장은 보류한다.

**문제와 단순화 효과**

네 핸들러가 `prev ?? getInitialFormState()`를 반복한다. 필드 이름과 값만 다르므로 draft 초기화 규칙 한 곳을 두면 첫 입력과 후속 입력의 차이를 읽기 쉬워진다. 이를 위해 별도 custom hook이나 reducer를 도입할 필요는 없다.

`getInitialFormState` 선언 바로 뒤에 아래 로컬 함수를 추가한다.

```tsx
  function updateField<K extends keyof ProfileFormState>(
    field: K,
    value: ProfileFormState[K],
  ): void {
    setFormState((previous) => ({
      ...(previous ?? getInitialFormState()),
      [field]: value,
    }));
  }
```

네 필드의 호출을 다음과 같이 바꾼다.

```tsx
onChange={(event) => updateField("name", event.target.value)}
onChange={(event) => updateField("email", event.target.value)}
onChange={(value) => updateField("preferredLanguage", value)}
onChange={(value) => updateField("verificationEnabled", value)}
```

각 기존 Input/Selector/Toggle의 `onChange` 속성을 교체하는 예시다. 위 네 행을 연속된 JSX로 붙여 넣지 않는다.

`useState(null)`, `currentFormState = formState ?? getInitialFormState()`, `isDirty = formState !== null`은 유지한다. 단순한 초기값 방식인 `useState(profile)`로 바꾸면 캐시 재조회 시 표시가 바뀐다. 편집 전에는 새 profile을 표시하고 편집 후에는 draft를 우선하는 현재 관계를 유지한다. 값을 원래대로 되돌려도 저장 버튼이 활성화되는 기존 dirty 판정도 변경하지 않는다.

`useUserProfile`의 검증 실패 시 `{ success: false }` 처리, 성공 후 query invalidate, 폼 저장 성공 시에만 수행하는 draft reset과 session refetch, pending 중 disabled는 그대로 남긴다. 새 `useEffect`로 profile을 draft에 동기화하지 않는다.

### TASK-SIMPLIFY-06: S06 — 구독의 중복 active 검사 제거

- satisfies: REQ-SIMPLE-006
- preserves: INV-SIMPLE-001
- governed-by: CON-SIMPLE-001, CON-SIMPLE-002
- 수정: `features/payment/actions/config.ts:115–124`.
- 검증 위치: V06, 기존 `features/payment/actions/config.test.ts` 확장.
- 중단 조건: Polar 응답의 선택 순서·상태 매핑을 변경하거나 실제 결제가 필요한 검증으로 확대하지 않는다.

**문제와 단순화 효과**

`subscriptions.find(status === "active")` 결과가 없는 else 분기에서는 같은 배열의 첫 항목도 active일 수 없다. 중첩 `if (lastestSubscription.status !== "active")`는 항상 참이다. subscription 목록이 filter로 만들어진 동기 데이터라는 현재 조건에 근거한다.

아래와 같이 안쪽 조건과 불필요해진 주석만 제거한다. `lastestSubscription` 오탈자 정리는 원하면 같은 파일 안의 `latestSubscription`으로 한정할 수 있으나 필수 변경은 아니다. 첫 항목을 최신이라고 가정하는 기존 정책을 정렬 코드로 바꾸지 않는다.

```ts
    } else if (lastestSubscription) {
      const status = lastestSubscription.status === "canceled" ? "CANCELLED" : "EXPIRED";
      await updateUserTier(user.id, "FREE", status);
      return { success: true, status };
    }
```

인증과 user 조회는 기존처럼 try 바깥이고 Polar 조회/티어 갱신은 try 안이다. 에러 처리 범위를 넓혀 인증 실패를 성공한 동기화처럼 바꾸지 않는다. `isPolarSubscriptionLike`의 id/status 검증과 배열 순서도 유지한다.

## 6. 복잡하지만 이번에는 바꾸지 않을 코드

| 후보 / 근거 | 이번 확정 목록에서 제외한 이유 | 후속 작업의 시작 조건 |
| --- | --- | --- |
| `inngest/functions/review.ts` 1,508행, `summary.ts` 546행 | claim·persist·post·artifact 확인·재개가 durable step과 lease로 나뉜다. 파일 분할이나 두 worker 통합만으로 상태 수가 줄지 않는다. step 경계를 잘못 옮기면 재시도 시 AI/게시 중복 위험이 있다. | step ID·직렬화 결과·진행 중 실행 호환성을 고정한 별도 계획 |
| `repository-disconnect.ts:173`의 transaction/보상/재시도 | webhook 삭제, DB 삭제, usage 차감, 보상과 retry는 순서 의존적이다. 단순 Promise.all이나 deleteMany 하나로 바꾸면 복구 계약이 사라진다. | 전용 DB·외부 실패 주입·복구 검증을 갖춘 별도 변경 |
| `review-trial.ts`, `review-execution-state.ts`, GitHub delivery 상태 분기 | 중복 요청·lease 만료·credit 소모/환불의 안전성에 필요한 분기다. 길이나 반복 모양만으로 중복 판정하지 않는다. | 동시성·재진입 의미를 증명하는 별도 설계 |
| `subscription-page.tsx:31–43,60–75`의 자동/수동 sync 중복 | 자동 sync는 `success:false` 반환을 검사하지 않고 refetch하며, 수동 sync는 오류 toast를 낸다. URL `success=true`만으로 성공 Alert도 표시한다. 함수 하나로 합치면 현재 UI 동작이 달라질 수 있다. | 자동 실패 표시, 성공 Alert 기준, 중복 실행 허용 정책을 정한 별도 버그 수정 |
| `apply-code-change.ts:39–63,66–99`의 최근접 매칭 중복 | exact/flexible 매칭과 겹치는 occurrence·동거리 우선순위를 보존해야 한다. 특히 빈 before의 종료 조건을 별도로 확인해야 하므로 단순 loop 통합만으로 안전하다고 단정하지 않는다. | 빈 문자열·겹침·동거리 계약과 적용 실패 처리를 먼저 고정 |
| `verify-review.ts:172–213`의 issue/suggestion 분할 반복 | 두 짧은 루프가 kept 배열과 verdict 정렬을 명시한다. 범용 generic partition으로 바꾸는 이득보다 타입/정렬 추적 비용이 커질 수 있다. | 세 번째 같은 소비자 또는 실증된 유지보수 문제 |
| `guard-text-feedback.ts` 1,102행 | encoding evidence·위치·문맥 분류를 삭제하면 오탐 방어 의미가 바뀐다. 전체 알고리즘에 대한 완전한 검증 없이 일반 정규식 하나로 축약할 수 없다. | 대표 corpus와 오탐·누락 판정 기준을 가진 전용 분석 |

후속 후보는 “문제가 없다”는 판정이 아니다. 확정 6개와 달리 동작 결정 또는 검증 준비가 더 필요한 항목이다. 이 문서의 구현 요청만으로 후속 후보까지 수정하지 않는다.

## 7. 검증 명세

아래 V01–V06 및 제품 명령은 모두 **Planned**다. 기존 테스트가 있다는 사실을 신규 변경 검증 통과로 기록하지 않는다. 검증이 기존 구현의 현재 출력까지 고정하는지 먼저 확인하고, 변경 후 같은 테스트를 실행한다.

### V01 — 본문 출력과 인라인 차이

- verifies: REQ-SIMPLE-001
- destination: 기존 `features/ai/lib/review-formatter.test.ts`, `features/review/ui/parts/structured-review-body.test.tsx`, `features/review/lib/pr-review.test.ts`.
- setup: 기존 `makeIssue`, `makeOutput`, `REVIEW_DATA`, Octokit mock 재사용. 새 helper를 mock하지 않고 최종 Markdown/HTML/게시 인자를 관찰한다.
- 검증 사례: ko/en; file+line/file-only/project-level; 빈 impact/recommendation; 제목과 본문이 같은 경우; `Title more`, `Title—more`, `Title: more`, `TitleCase`; legacy body 누락/description 존재; 이슈 0개·여러 개 순서.
- 기대 결과: S01 표의 차이가 그대로이며 본문 두 경로의 동일 부분만 공유된다. GitHub 본문의 개수·힌트와 웹의 섹션 순서가 달라지지 않는다. 인라인 marker·repeat/verifier badge·게시 인자도 유지된다.
- 정적 확인: `RemainingMarkdownSections`에 이전 `labels` 선언과 `ISSUE_FIELD_LABELS` 참조가 남지 않고, 새 helper에 라벨 조회가 존재해야 한다. import만 삭제하고 지역 선언을 남기면 타입 검사에서 식별자 오류가 발생한다.
- legacy fixture는 타입이 허용하지 않는 과거 저장 형태를 재현하는 **테스트 입력 한 지점**에만 명시적 호환 단언을 쓰고 근거를 주석으로 남긴다. 제품 타입을 optional로 완화하지 않는다.
- UI: `/dashboard/reviews/[id]`에서 ko/en 이슈의 제목/본문/위치와 suggestion summary, Markdown fallback을 확인한다. 같은 리뷰 데이터의 변경 전/후 캡처를 남긴다. 실제 GitHub 게시 없이 mock에서 전송 본문을 검증한다.

### V02 — 요청 facade 계약

- verifies: REQ-SIMPLE-002
- destination: 기존 두 action 테스트와 `app/api/webhooks/github/github-webhook-handler.test.ts`.
- setup: 기존 `createReviewRequest` mock을 유지하고 새 formatter는 mock하지 않는다. 각 테스트에서 stub 응답을 명시한다.
- 두 facade 모두 다음을 검증: rejected 세 reason; created/PENDING; existing/PENDING·RUNNING·POSTING·COMPLETED·FAILED·SUPERSEDED; dispatch-failed의 QUEUE/POST/RECONCILE; coordinator throw.
- 기대 결과: 실패 메시지와 `reason`, 메타데이터 값·키 존재가 기존과 일치. rejected/throw에는 메타데이터 없음. dispatch 실패의 `failureStage`는 유지되고 정상/기존 실패에 임의로 추가하지 않음. S02 helper 생성 전에는 summary 테스트가 3개뿐이므로 review 쪽 분기 coverage를 summary에도 보강한다.
- 호출 인자: AUTOMATIC은 DEBOUNCED, review COMMAND는 DIRECT, summary는 SUMMARY/COMMAND/DIRECT; `transportBinding` 그대로 전달. coordinator는 facade당 1회.
- webhook 기존 테스트의 운영 실패 500과 업무상 거절 200 계약도 유지. 이번 작업에서 webhook 소스는 수정하지 않는다.

### V03 — 기여도 parser의 동등성

- verifies: REQ-SIMPLE-003
- destination: 신규 `features/dashboard/lib/parse-contribution-calendar.test.ts`; dashboard 수동 확인.
- fixture: 단일/여러 주·일, weeks 빈 배열, contributionDays 빈 배열, invalid week/day, 날짜 누락/비문자열, count 누락/null/문자열/NaN/±Infinity, count 음수/소수, level 누락/null/숫자/빈문자열/알 수 없는 문자열, 합계 누락/null/문자열/NaN/Infinity/유한 숫자, 추가 필드.
- 기대 결과: invalid 구조는 전체 null. count의 음수/소수와 level의 임의 문자열은 허용. 비문자열 level의 키는 생략. 유한 합계 `0`, 음수, 소수도 그대로 사용. 잘못된 합계만 합산. 추가 필드는 제거. 배열 순서 보존.
- 수동: 정상 dashboard의 count/heatmap과 기여도 없음 표시 확인. GitHub fetch 실패를 `null`로 바꾸는 상위 helper와 dashboard 전체 실패 카드 정책은 변경하지 않는다.
- 현재 검토 중에는 동일 초안과 원본의 반환값을 548개 입력으로 메모리 비교했다(§9). 이는 앞으로 작성할 영속 테스트를 대체하지 않는다.

### V04 — suggestion 전체/부분/모호 매칭

- verifies: REQ-SIMPLE-004
- destination: 신규 `features/suggestion/lib/match-suggestions-against-compare.test.ts`; 기존 reconciliation/webhook 테스트.
- fixture: 빈 비교 파일; suggestion 없음; 한 suggestion 정확히 일치; 한 파일의 여러 suggestion을 Stage A로 모두 적용; Stage A 실패 뒤 Stage B 한 개만 일치; 서로 같은 변경을 만드는 suggestion 2개로 Stage B ambiguity; 정확한 파일+알 수 없는 변경 파일; 정확한 파일+모호한 파일; removed/renamed; before/after null; CRLF.
- ambiguity는 `before="a\nb\n"`, `after="x\nb\n"`에 `{beforeCode:"a",afterCode:"x",lineNumber:1}`인 서로 다른 ID 두 개를 제공해 재현한다. Stage A의 두 번째 적용이 실패하고 Stage B에서 둘 다 매칭된다.
- 기대 결과: §5의 분류표, ID/경로 순서, 입력 무변경을 확인. 한 파일은 매칭했더라도 다른 파일이 모호하거나 미해명이면 자동 리뷰를 생략하지 않는다. 기존 reconciliation 테스트는 baseline 조회만 검사하므로 이 신규 함수 테스트가 필요하다.

### V05 — 폼 편집과 저장

- verifies: REQ-SIMPLE-005
- destination: `features/settings/actions/index.test.ts`, 타입 검사, `/dashboard/settings`의 수동 동작 확인.
- 실제 입력 테스트: profile 로딩 후 name→email→language→verification 순으로 입력해 앞선 필드가 사라지지 않는지 확인; 최초 필드가 email 또는 toggle이어도 다른 기본값 유지; 수정 전 profile refetch에는 새 profile 표시, 수정 후에는 draft 유지.
- 저장 테스트: 성공 시 draft reset과 최신 profile/session 표시; validation 실패 및 네트워크 실패 시 입력 보존; pending 중 모든 입력과 저장 버튼 비활성화; 원래 값으로 되돌려도 기존 dirty 정책 유지.
- 순수 SSR 테스트는 onChange·draft lifecycle을 검증하지 못한다. Node Vitest에 DOM 환경을 새로 추가하거나 helper 자체를 복제한 테스트로 수동 검증을 대신하지 않는다. 로그인 가능한 테스트 환경에서 위 절차를 실행하고 화면 증거를 남긴다. 환경이 없으면 이 V는 미실행으로 남긴다.

### V06 — 구독 sync 분기

- verifies: REQ-SIMPLE-006
- destination: 기존 `features/payment/actions/config.test.ts`.
- setup: `vi.hoisted` mocks에 `listSubscriptions`, `updateUserTier`를 추가하고 기존 Polar/subscription mock이 해당 참조를 사용하게 한다. `syncSubscriptionStatus`도 import한다. 기존 `getSubscriptionData` 테스트는 유지한다.
- 신규 `describe`의 `beforeEach`는 `vi.resetAllMocks()` 후 session `{user:{id:"user-1"}}`, USER의 `polarCustomerId:"customer-1"`, list의 기본 `{result:{items:[]}}`, update의 resolve를 명시한다. 다른 describe의 초기화에 의존하지 않는다.
- valid item은 문자열 `id`, `status`를 모두 넣어 type guard를 통과시킨다.

| 사례 | 반환 / 부수효과 |
| --- | --- |
| user 없음 또는 customer id 없음 | `No Polar customer Id found`, list 0회, update 0회 |
| `[canceled, active]` | success/ACTIVE, `updateUserTier("user-1","PRO","ACTIVE")` 1회 |
| active 없고 첫 유효 항목 canceled | success/CANCELLED, FREE/CANCELLED 1회 |
| active 없고 첫 유효 항목 expired 또는 trialing | success/EXPIRED, FREE/EXPIRED 1회 |
| 빈 items, items 누락, invalid item만 존재 | `No active subscription found`, update 0회 |
| invalid 뒤에 유효 canceled | invalid 제외 후 CANCELLED |
| list reject | `Failed to sync with Polar`, update 0회 |
| update reject | `Failed to sync with Polar`, update 시도 1회 |
| requireAuthSession 또는 findUnique reject | 기존처럼 reject, list/update 0회 |

list 호출의 인자는 `{ customerId: "customer-1" }`이며 정상 조회는 1회다. 실제 Polar API·결제·subscription 상태는 조작하지 않는다.

### 제품 회귀 검사 명령

현재 `scripts/verify-calibration.test.ts`는 `.env.local`과 `.env`를 읽고 **비어 있지 않은** `CALIBRATION`이면 유료 평가를 실행한다(`"0"`도 해당). P0 test는 `P0_QUALITY_MODE=capture`에서 외부 호출을 수행한다. 아래 읽기 전용 환경 점검을 **같은 shell에서 테스트 직전** 실행하고 실패하면 일반 회귀 명령을 실행하지 않는다. 실제 환경값은 출력하지 않는다.

Windows에서는 환경변수 이름을 대소문자 구분 없이 처리한다. 프로세스 환경과 각 파일의 키를 같은 방식으로 정규화하고, 먼저 존재한 값을 유지해 `프로세스 환경 > .env.local > .env`의 우선순위를 보존한다. 빈 문자열도 이미 설정된 값으로 취급한다. 한 파일에 대소문자만 다른 키가 함께 있으면 설치된 dotenv의 `override: false` 처리처럼 파싱 결과에서 먼저 순회한 키가 우선한다. Windows 외 환경에서는 원래의 대소문자 구분을 유지한다.

```powershell
@'
const fs = require("node:fs");
const dotenv = require("dotenv");
const simplificationEnv = Object.create(null);
function addEnvironment(values) {
  for (const [name, value] of Object.entries(values)) {
    const key = process.platform === "win32" ? name.toUpperCase() : name;
    if (!Object.hasOwn(simplificationEnv, key)) {
      simplificationEnv[key] = value;
    }
  }
}
addEnvironment(process.env);
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) {
    addEnvironment(dotenv.parse(fs.readFileSync(file)));
  }
}
if (simplificationEnv.DOTENV_KEY) throw new Error("Use an environment without dotenv vault loading.");
if (simplificationEnv.CALIBRATION) throw new Error("CALIBRATION must be empty or absent.");
if (simplificationEnv.P0_QUALITY_MODE !== undefined && simplificationEnv.P0_QUALITY_MODE !== "validate") {
  throw new Error("P0_QUALITY_MODE must be validate or absent.");
}
if (simplificationEnv.TEST_DATABASE_URL) throw new Error("Run DB integration separately in a dedicated environment.");
console.log("Simplification test preflight passed.");
'@ | node.exe
if ($LASTEXITCODE -ne 0) { throw 'Test environment preflight failed.' }
```

점검 코드 변경 시 실제 환경·파일을 바꾸지 않는 격리 fixture로 다음을 확인한다: Windows의 프로세스/각 파일에 설정한 소문자·혼합 대소문자 `CALIBRATION`, `P0_QUALITY_MODE`, `TEST_DATABASE_URL`, `DOTENV_KEY`도 차단; 빈 CALIBRATION 및 `P0_QUALITY_MODE=validate`는 허용; 키의 대소문자가 달라도 프로세스와 파일 사이의 우선순위 유지. 실제 유료 평가나 DB 연결을 실행해 차단 여부를 확인하지 않는다.

환경 점검 실패를 `.env` 덮어쓰기나 `CALIBRATION=0`으로 우회하지 않는다. 새로 제안한 테스트 파일을 만든 뒤 아래 명령을 사용한다. 항목별 진행 중에는 해당 V의 파일만 지정해도 되고, 최종 검사에서는 전체 네 명령을 모두 실행한다.

```powershell
npm.cmd run test -- features/ai/lib/review-formatter.test.ts features/review/ui/parts/structured-review-body.test.tsx features/review/lib/pr-review.test.ts features/ai/actions/review-pull-request.test.ts features/ai/actions/generate-pr-summary.test.ts features/dashboard/lib/parse-contribution-calendar.test.ts features/suggestion/lib/match-suggestions-against-compare.test.ts features/suggestion/lib/reconcile-native-suggestions.test.ts app/api/webhooks/github/github-webhook-handler.test.ts features/settings/actions/index.test.ts features/payment/actions/config.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Focused regression tests failed.' }
npm.cmd run test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
npm.cmd run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
npx.cmd tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed.' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
```

`npm.cmd run next-build`, `vercel-build`, `check-models`, migration 명령은 대체 검증으로 사용하지 않는다. 일반 suite의 DB/calibration skip 수와 이유는 따로 기록한다. 이번 Phase는 schema·DB transaction·webhook 소스를 변경하지 않으므로 실제 DB/외부 게시 통합 검증을 통과했다고 주장하지 않는다.

## 8. 허용 파일, 완료와 복구

### 구현 시 허용 파일

| 작업 | 기존 수정 파일 | 신규 파일 |
| --- | --- | --- |
| S01 | `features/ai/lib/review-formatter.ts`, `features/review/ui/parts/structured-review-body.tsx`, `features/review/lib/pr-review.ts`의 동기화 주석만, 이들의 기존 테스트 3개 | `features/ai/lib/issue-format.ts` |
| S02 | AI actions 2개, 각각의 기존 테스트, `features/ai/types/index.ts` | `features/ai/lib/review-request-result.ts` |
| S03 | `features/dashboard/lib/parse-contribution-calendar.ts` | 같은 디렉터리 `parse-contribution-calendar.test.ts` |
| S04 | `features/suggestion/lib/match-suggestions-against-compare.ts` | 같은 디렉터리 `match-suggestions-against-compare.test.ts` |
| S05 | `features/settings/ui/parts/profile/profile-form.tsx` | 없음 |
| S06 | `features/payment/actions/config.ts`, `config.test.ts` | 없음 |

기존 production 파일 **10개**, 기존 테스트 **6개**, 신규 helper **2개**, 신규 테스트 **2개**가 최대 허용 코드 쓰기 범위다. 직접 지정하지 않은 기존 테스트는 실행만 한다. 문서는 이 파일의 구현 결과 기록과 완료 시 이동을 포함한다. 이동 시에만 이 파일을 가리키는 로컬 링크·`related`/`follow-up` 경로 수정도 허용하며, 다른 문서의 요구사항·판정은 수정하지 않는다.

### 완료 조건

1. 6개 항목의 외부 동작을 유지하고, 중복 제거의 대상이 §5와 일치한다. 다른 API·상태·정규식 정책 변경이 섞이지 않는다.
2. V01–V06의 실제 수행 상태와 결과를 기록한다. test/lint/tsc/build의 종료 코드와 skip 수, UI 미실행 여부를 분리한다.
3. 새 runtime dependency 없이 기존 import 경계가 유지된다. `git diff --check`, `git diff --name-status`로 허용 경로를 확인한다.
4. 새 helper 존재·직접 소비자 수·삭제된 중복을 파일 본문으로 확인한다. `rg`에서 문자열이 사라졌다는 이유만으로 동작 보존을 확정하지 않는다.

**문서 완료 처리**: 현재는 `status: pending`, `stage: awaiting-approval`로 구현 요청을 기다리며, 이번 검증을 제품 구현 승인으로 기록하지 않는다. 이후 명시적인 구현 요청이 주어지면 같은 대화의 권한을 적용하고 실제 요청 근거로 `approved-by`, `approved-at`, `approval-scope`와 `stage: approved`를 기록한다. 이미 받은 구현 요청을 metadata 입력 때문에 다시 승인받지 않는다.

위 완료 조건과 §4를 모두 충족하면 `status: completed`, `stage: null`, 실제 완료일의 `completed-at`, 실제 결과의 `verification-summary`를 기록한다. 이어 이 파일을 `docs/proposals/completed/YYYY-MM-DD-code-simplification-implementation-plan.md`로 이동한다. `YYYY-MM-DD`는 실제 완료일이며 검토일로 미리 채우지 않는다. 이동 직전에 원본 존재, 완료 폴더 존재, 대상 파일 미존재와 양쪽 절대 경로가 이 저장소 `docs/proposals/` 안에 있음을 확인한 후 `Move-Item -LiteralPath`를 사용한다. 같은 이름의 기존 완료 기록을 덮어쓰지 않는다.

완료 경로에서 이 문서의 상대 링크·자기 경로를 갱신하고, `rg --no-ignore -n -F 'code-simplification-implementation-plan.md' docs AGENTS.md CLAUDE.md`로 발견한 실제 링크와 metadata 참조를 새 경로에 맞춘다. 현재 확인된 외부 참조는 이관 보고서 `docs/test-reports/completed/2026-09-06-docs-structure-migration.md`의 링크다. 이동 이력을 설명하는 `migrated-from`과 보고서의 과거 경로 문자열은 그대로 보존한다. 옛 active 파일의 부재, 새 completed 파일의 존재·본문·metadata를 확인하고 `node scripts/check-docs.mjs` 및 §9의 traceability 검사를 새 파일 경로로 실행한다. 미실행 검증이 남으면 active에 유지한다.

**복구**: 항목별 회귀가 있으면 해당 항목의 diff/commit만 되돌린다. 전체 working tree reset/clean을 사용하지 않고 다른 사용자 변경을 보존한다. schema 변경이 없으므로 DB rollback은 필요하지 않다. S01은 두 호출부와 helper를 같은 단위로 복구하고 S02는 facade·타입 alias·helper를 함께 복구한다.

**Git 보관**: `.gitignore`의 `/docs/` 규칙은 미추적 파일에 적용되며, 이미 추적하는 문서의 변경은 status에 나타난다. 커밋 요청이 있으면 먼저 `git ls-files --error-unmatch -- docs/proposals/active/code-simplification-implementation-plan.md`로 추적 여부를 확인한다. 추적 중이면 일반 `git add -- <문서 경로>`, 미추적이면 내용을 확인한 뒤 해당 파일에만 `git add -f -- <문서 경로>`를 사용한다. 이동 후에는 실제 completed 경로를 지정하고, 이전 active 파일이 추적 중이었다면 그 삭제도 stage한다. 이동으로 수정한 문서 참조는 관련 diff만 함께 확인하며 docs 전체 ignore를 해제하거나 다른 문서를 일괄 추가하지 않는다. 이번 검증·보완 요청에서는 문서만 저장하고 stage·commit은 수행하지 않는다.

## 9. 문서 작성·보완에서 실제 수행한 검증

앞선 검토에서 S01의 지역 `labels` 삭제 지시 누락과 Windows 환경 점검의 대소문자 처리 오류를 발견해 수정했다. 최초 가상 타입 검사는 `labels` 선언까지 암묵적으로 삭제한 코드를 사용했기 때문에 문서의 누락이 드러나지 않았다. 삭제 지시와 V01의 정적 확인을 명시한 뒤 보완 검증을 수행했다.

이관 전 전체 재대조에서는 참조 receipt의 상태가 사용자 위험 인수에 따른 종결로 바뀌었는데도 §2가 `BLOCKED 유지`를 요구하는 불일치를 발견해 고쳤다. 같은 외부 효과·권한 경계에 맞춰 검토 위험도를 HIGH-RISK로 정정하고, Phase 완료에 여섯 항목 전체가 필요함을 명시했다. 아래 메모리 검증은 제품 코드를 변경하지 않은 사전 검증이며, 수정 후 최종 준비 판정에는 저장된 문서를 다시 읽는 무수정 전체 검토가 필요하다.

2026-09-06 이관 후의 이번 재검증에서는 완료 시 metadata·`completed/` 이동·참조 갱신 절차가 빠진 점을 보완했다(§4·§8). Settings 선행 제안을 필수 규칙으로 부르던 설명도 현재 분류에 맞췄으며, P0 receipt의 문서 완료와 `result: blocked`를 명시했다. S01–S06 코드 예시는 추가 수정할 문제가 발견되지 않았다. 현재 경로의 예시로 아래 메모리 비교와 가상 타입 검사, 환경 점검 fixture를 다시 실행해 같은 결과를 확인했다. 제품 적용·브라우저 상호작용 확인은 여전히 미실행이다.

| 상태 | 수행 내용 | 결과 / 한계 |
| --- | --- | --- |
| Executed | branch·HEAD·status, 정책 9개, 설정·소스·호출부·기존 테스트 읽기 | 위 기준 커밋에서 확정 항목과 보호할 실행 경계 확인 |
| Executed | 원본 TS와 S03 초안 TS를 `typescript.transpileModule` + `vm`으로 메모리에서 실행, 로컬 Zod 사용 | 548개 입력의 직렬화된 반환 결과 동일. 파일 emit·DB·네트워크 없음 |
| Executed | 원본 S04와 최종 return만 바꾼 메모리 복사본 비교 | 2,048개 조합 결과 동일. Stage A/B는 원본 코드 사용 |
| Executed | 두 요청 facade 원본과 S02 helper를 사용하는 메모리 복사본 비교 | 두 facade 각각 created/existing × 상태 6종, rejected 3종, dispatch failure stage 3종, 예외 1종: 총 38개 반환 결과 JSON 동일. coordinator는 로컬 stub만 사용 |
| Executed | 현재 S01–S04·S06 초안을 메모리 source에 적용하고 기존 구현과 독립 실행 비교 | 전체 GitHub Markdown·React SSR HTML 204개, 파서 548개, matcher 2,048개, facade 57개, 구독 sync 18개 사례 일치. 객체는 키 존재와 `undefined`를 보존하는 구조 비교, 외부 의존성은 stub으로 호출 인자·순서와 예외 전파까지 비교. 파일 emit·실제 API·DB 호출 없음 |
| Executed | 지역 `labels` 삭제를 명시한 현재 문서의 TS/TSX 예시와 호출부 수정 지시를 가상 source 11개에 적용, TypeScript Compiler API로 프로젝트 재검사 | `noEmit: true`, `incremental: false`, `noUnusedLocals: true`, `noUnusedParameters: true`에서 진단 0개. 실제 소스·빌드 산출물·설정 쓰기 없음. 주석만 바꾸는 pr-review.ts는 가상 변경에서 제외 |
| Executed | §7의 저장된 환경 점검 코드 자체를 `vm`과 가짜 파일 입력으로 실행 | 81개 격리 사례 통과. Windows 77개 사례의 최종 값은 별도 Node 프로세스의 실제 `process.env`에 설치된 dotenv `populate(..., { override: false })`를 적용한 결과와 일치. 나머지 4개는 Windows 외 대소문자 구분 사례. 실제 환경 파일·부모 shell 변경, DB·유료 API 호출 없음 |
| Executed | 문서의 PowerShell 코드 블록을 로컬 PowerShell Parser로 검사 | 블록 3개, 구문 오류 0개. 제품 회귀 명령 실행을 뜻하지 않음 |
| Executed | 설치된 SDD validator의 `--strict --format json` 검사와 의미 대조 | 오류 0개, 요구사항 6개 모두 Phase/Task·검증 연결. 보존 계약과 수정 예시·허용 파일·테스트 기대 결과를 수동 대조 |
| Executed | 문서 링크·파일 경로·fence·인코딩 확인 | 로컬 링크 8개와 기존 소스/검증 경로 19개 존재, 제안한 신규 경로 4개는 미존재이고 부모 존재, fence 10쌍 일치, UTF-8 대체 문자 없음 |
| Not executed | V01–V06의 실제 수정 후 회귀 검증 | 위 메모리 검증은 일부 입력/타입 연결의 사전 확인이다. 영속 테스트 보강·제품 적용·브라우저 상호작용 확인을 대체하지 않음 |
| Not executed | 제품 test/lint/build 및 실제 UI·DB·외부 API | 문서 작업이며 이 턴에서 제품 소스 수정 없음. 이전 턴의 검사 결과를 새 계획의 실행 증거로 재사용하지 않음 |

메모리 비교의 재현 입력:

- 환경 점검: 차단 변수 4개 × 대문자/소문자/혼합 이름 3종 × 프로세스/각 환경 파일 3곳 = 36개; `CALIBRATION="0"` 9개; 정상·빈 값 6개; 변수별 프로세스/파일/동일 파일 내 대소문자 충돌 우선순위 24개; 완전히 같은 키의 중복 파싱 2개; Windows 외 대소문자 구분 4개. 파일 읽기는 문자열 fixture로 대체하고 코드의 허용·차단 결과, 입력 무변경, Windows 최종 값의 동등성을 확인했다. `DOTENV_KEY`와 DB URL도 실행되지 않는 fixture 값만 사용했다.
- S03: 기본 구조 입력 8개(`null`, `undefined`, `[]`, `{}`, 빈 weeks, null week, 빈 week 객체, 빈 contributionDays) + count 10종 × level 6종 × total 9종. count=`0,1,-2,1.5,NaN,Infinity,-Infinity,"2",null,undefined`; level=`undefined,null,1,"","NONE","UNKNOWN"`; total=`undefined,null,"3",0,10,-3,1.2,NaN,Infinity`. 날짜는 고정 문자열이고 여분 필드도 포함했다.
- S04: 비교 파일 후보 7개(정확 변경 a/b, removed, renamed, null content, CRLF, 관련 없는 변경)의 모든 부분집합 × suggestion 후보 4개(a의 동일 변경 ID 2개, b의 변경 1개, a의 둘째 줄 변경 1개)의 모든 부분집합 = `128 × 16`. 빈 beforeCode는 사용하지 않았다. 입력 전체에 대해 결과 JSON을 비교했으며 이 검증으로 다른 입력 전부까지 증명했다고 주장하지 않는다.

최종 문서 검증은 아래 명령으로 수행했다. 문서를 수정한 뒤에도 같은 명령으로 재검증한다. traceability 검사는 의미나 runtime 정확성을 증명하지 않으므로 코드·동작·검증 표의 수동 대조를 함께 수행한다.

```powershell
python 'C:/Users/hamso/.codex/skills/write-sdd-spec/scripts/validate_sdd_traceability.py' --strict --format json docs/proposals/active/code-simplification-implementation-plan.md
if ($LASTEXITCODE -ne 0) { throw 'Proposal traceability validation failed.' }
node scripts/check-docs.mjs
if ($LASTEXITCODE -ne 0) { throw 'Documentation validation failed.' }
```

문서의 경로·Markdown fence·UTF-8과 Git 상태를 확인한다. 최초 작성·두 지적 보완 시점에는 추적 파일 diff가 없었으나, 이번 전체 재대조 시작 시에는 기존 P0 문서 3개의 수정과 `.playwright-mcp/`가 있었다. 이 작업의 수정 대상은 이 문서 하나이며 기존 변경은 보존한다. 제품 구현에 착수할 때는 문서의 상태 표시보다 **현재 코드와의 재대조 결과**를 우선한다.
