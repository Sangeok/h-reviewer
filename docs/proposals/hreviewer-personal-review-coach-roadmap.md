# HReviewer 개인 코드 리뷰 코치 실행 제안서

> 상태: **Proposed — 다음 task T02**
>
> 작성일: `2026-08-17`
>
> 제품 목표: CodeRabbit의 기능 수를 복제하지 않고, 1인 개발자의 반복 실수를 기억하고 줄여 주는 개인 코드 리뷰 코치를 완성한다.

## 1. 결론

HReviewer의 최적 우선순위는 다음과 같다.

1. 리뷰 파이프라인의 신뢰성과 무료 첫 경험을 완성한다.
2. 사용자 피드백이 반복 실수 감지와 다음 리뷰 규칙으로 이어지는 학습 루프를 만든다.
3. 저장소 규칙과 기존 GitHub Checks를 읽어 정확도를 높인다.
4. 마지막 리뷰 이후 변경분만 다루는 증분 리뷰 경험을 제공한다.

멀티 플랫폼, 대규모 정적 분석 도구 모음, 엔터프라이즈 기능은 이 로드맵에서 제외한다.

## 2. 제품 포지셔닝

### 핵심 사용자

- 리뷰해 줄 시니어가 없는 1인 개발자
- GitHub Pull Request를 개발 기록과 품질 점검 수단으로 사용하는 사용자
- 많은 기능보다 오탐이 적고 과거 실수를 기억하는 리뷰를 원하는 사용자

### 핵심 가치

> “지난 PR에서 고친 실수를 다시 만들었는지 알려 주고, 고친 경험을 다음 리뷰 규칙으로 바꿔 준다.”

### 경쟁 기준

CodeRabbit은 증분 리뷰, 경로별 지침, 코드 지식, GitHub Checks, 다수의 린터와 보안 도구, pre-merge checks, IDE/CLI, 다중 플랫폼, 조직 분석을 제공한다. HReviewer는 이 범위를 전부 따라가지 않는다.

HReviewer가 먼저 이겨야 하는 지점은 다음 세 가지다.

- 동일 PR과 동일 커밋에 중복되거나 오래된 리뷰를 남기지 않는다.
- 사용자가 리뷰 의견을 평가하면 그 결과가 반복 실수와 개인 규칙에 반영된다.
- 개인의 실수 재발률이 실제로 줄고 있는지 30일·90일 단위로 보여 준다.

비교 기준일은 `2026-08-17`이며, 세부 경쟁 기능은 문서 마지막의 공식 자료를 기준으로 한다.

## 3. 현재 구현에서 보존할 강점

다음 기능은 새로 만들지 않고 기존 구현을 확장한다.

- PR `opened`, `synchronize` 이벤트의 자동 리뷰
- PR head SHA를 기준으로 한 결정적 컨텍스트 생성
- 변경 파일, 관련 테스트, 직접 상대 import를 포함하는 제한된 on-demand 컨텍스트
- 구조화 리뷰, 위험도, walkthrough, sequence diagram, issue와 suggestion 분리
- GitHub native suggestion과 one-click 적용
- 두 번째 LLM 검수자의 `CONFIRMED`, `UNCERTAIN`, `REJECTED` 판정
- 90일 내 과거 issue를 이용한 반복 지적 배지
- `ADDRESSED_STRONG`, `ADDRESSED_WEAK`, `IGNORED` 해결 상태 추적
- 구조화 출력이나 컨텍스트 생성 실패 시 사용자에게 열화 상태 고지

영구 코드 인덱스는 다시 도입하지 않는다. 컨텍스트 확장은 항상 현재 PR의 정확한 head SHA에서 필요한 파일만 읽는 방식으로 유지한다.

## 4. 현재 확인된 핵심 문제

| 문제 | 현재 근거 | 영향 |
| --- | --- | --- |
| 수동 전체 리뷰 명령이 무시됨 | `parseCommand()`는 `review`를 반환하지만 GitHub webhook route는 `summary`만 처리 | 사용자는 명령이 성공한 것으로 오해하지만 아무 일도 일어나지 않음 |
| GitHub delivery 중복 방지 없음 | webhook route가 `X-GitHub-Delivery`를 읽거나 저장하지 않음 | redelivery가 중복 AI 비용과 중복 코멘트를 만들 수 있음 |
| 오래된 head 작업 제어 없음 | worker는 fetch한 `headSha`로 게시하지만 최신 head 재확인과 supersede 상태가 없음 | 빠른 연속 push에서 오래된 리뷰가 늦게 게시될 수 있음 |
| 큐 이후 상태 추적이 불완전함 | `Review`는 worker 마지막 단계에서만 생성되고 terminal failure callback이 없음 | 게시 성공 후 저장 실패, 생성 실패, 재시도 상태를 사용자와 운영자가 확인하기 어려움 |
| summary 명령 권한·중복 제한 없음 | 저장소를 연결한 계정의 token으로 요청하지만 댓글 작성자의 권한을 검사하지 않음 | 공개 저장소에서 비용 유발 명령이 남용될 수 있음 |
| 인라인 issue 유실 가능 | 두 번째 inline issue 게시 실패를 경고만 남기며 해당 issue가 본문에도 포함되지 않음 | 유효한 리뷰 의견이 사용자에게 전달되지 않음 |
| 무료 사용자는 핵심 기능을 체험하지 못함 | Free의 `reviewsPerRepo`가 `0` | 전환 전에 제품 가치를 확인할 방법이 없음 |
| 반복 실수 기능의 피드백 루프가 없음 | repeat 배지와 해결 상태는 있지만 helpful·오탐·의도적 무시 입력이 없음 | wedge가 알림에서 끝나며 다음 리뷰가 개인화되지 않음 |
| 고급 분석 표기와 실제 화면이 다름 | Pro 기능표는 Advanced analytics를 포함하지만 dashboard는 총계 중심 | 상품 신뢰 저하 |
| 품질 평가가 현재 모델과 불일치 | 평가 영수증은 이전 verifier와 차단된 A/C/F 실행을 기준으로 함 | 현재 정확도와 cross-file miss를 판단할 근거가 부족함 |
| 큰 PR의 구조화 실패가 차별점을 제거 | markdown fallback에서는 suggestion, issue 검수, repeat 처리가 사라짐 | 큰 PR에서 핵심 기능이 가장 먼저 사라짐 |

## 5. 확정 제품 결정

### 5.1 무료 체험

- Free 계정에는 전체 리뷰 **5회**의 일회성 체험 크레딧을 제공한다.
- 크레딧은 저장소별이 아니라 계정 전체에서 공유한다.
- summary는 전체 리뷰 크레딧을 소비하지 않지만 동일 PR head당 한 번만 생성한다.
- 실패하거나 최신 head에 의해 supersede된 전체 리뷰는 크레딧을 반환한다.
- GitHub에 메인 리뷰가 게시되었거나 동일 marker로 게시 사실이 확인되면 크레딧을 소비한다.
- 운영 활성화는 `FREE_REVIEW_TRIAL_ENABLED` 플래그와 비용 상한 확인 후 진행한다.

### 5.2 명령 권한

- `@hreviewer summary`, `@hreviewer review`는 해당 저장소에 `write` 이상 권한이 있는 사용자만 실행할 수 있다.
- GitHub의 repository collaborator permission API 결과를 권한의 기준으로 사용한다.
- 권한이 없는 요청은 AI event, Review row, 크레딧 예약을 만들지 않는다.

### 5.3 학습 안전성

- 기존 `IssueResolutionStatus.IGNORED`는 “PR merge까지 코드가 바뀌지 않음”이라는 의미를 유지한다.
- 사용자 피드백의 `INTENTIONAL_IGNORE`와 기존 `IGNORED`를 합치지 않는다.
- 사용자 피드백만으로 다음 리뷰 동작을 자동 변경하지 않는다.
- 학습 결과는 규칙 후보로 제안하고 사용자가 활성화해야 다음 리뷰에 반영한다.
- 저장소 문서와 설정은 리뷰 문맥으로만 취급하며 시스템 제약이나 출력 schema를 덮어쓸 수 없다.

### 5.4 플랫폼과 팀 범위

- 이 로드맵은 GitHub와 개인 계정 모델만 다룬다.
- `Repository.githubId @unique`를 변경하는 조직·다중 사용자 소유 모델은 범위 밖이다.
- merge blocking, request changes, approve 자동화는 범위 밖이다.

## 6. task 단위 실행 순서

### 6.1 실행 규칙

- 한 구현 주기와 한 PR에서는 **하나의 task만** 수행한다. 같은 파일을 후속 task도 수정하더라도 현재 task의 완료 조건에 필요한 동작만 변경한다.
- 상태는 `NEXT`, `WAITING`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`만 사용한다.
- `NEXT` 또는 `IN_PROGRESS`는 전체 로드맵에서 하나만 존재한다. 현재 `NEXT`는 T02다.
- task를 시작할 때 상태를 `NEXT -> IN_PROGRESS`로 바꾸고, 현재 코드의 실제 owner, public API, import consumer, 테스트와 생성 artifact를 다시 inventory한다.
- 완료 조건과 섹션 15의 검증을 모두 통과해야 `COMPLETED`로 바꿀 수 있다. 실패한 검증이나 미결정 사항이 있으면 `BLOCKED`로 기록하고 다음 task를 열지 않는다.
- 완료 시 바로 다음 task만 `WAITING -> NEXT`로 바꾼다. 후속 task의 구현을 현재 task로 당겨오지 않는다.
- task 경계를 바꿔야 할 만큼 새 요구사항이나 제품 결정이 발견되면 구현을 멈추고 이 문서의 관련 task, 런타임 불변식, 검증과 Definition of Done을 먼저 함께 수정한다.
- 현재 `.gitignore`가 `/docs/`를 무시하므로 T01에서 이 로드맵과 P0 구현 계획 두 경로만 `git add -f -- <exact paths>`로 최초 추적하고 `git ls-files --error-unmatch`로 확인한다. `docs/` 전체를 force-add하거나 ignore를 넓게 해제하지 않는다. T09의 신규 release receipt도 생성 직후 그 한 경로만 같은 방식으로 추적한다.
- P1, P2, P3로 넘어가기 전에는 각각 P0, P1, P2 release gate를 통과한다. phase gate는 별도 구현 task가 아니라 직전 task의 종료 gate다.
- 외부 GitHub write, 유료 AI 평가, production migration·deployment, production feature flag 활성화는 `Approval-after`로 유지한다. 승인이 없어도 로컬 코드와 비외부 테스트는 완료할 수 있다. 다만 T09의 현재 모델 유료 평가처럼 release gate가 실제 실행 증거를 요구하면 승인을 받기 전까지 task는 `BLOCKED`이며 다음 phase를 열지 않는다. production 배포·flag 활성화처럼 task 완료 범위 밖인 운영 작업만 완료 기록에 `pending approval`로 남길 수 있다.

### 6.2 선형 task queue

아래 `직전 완료 gate`는 누적 조건이다. 예를 들어 T06은 T05뿐 아니라 T01-T05가 모두 `COMPLETED`여야 시작할 수 있다.

| 순서 | Task | 단계 | 상태 | 목표 주차 | 직전 완료 gate |
| ---: | --- | --- | --- | --- | --- |
| 1 | T01. 파이프라인 기준선과 테스트 하네스 | P0 | `COMPLETED` | 1주차 | 없음 |
| 2 | T02. Review 실행 상태와 webhook delivery 영속화 | P0 | `NEXT` | 1주차 | T01 |
| 3 | T03. 단일 리뷰 요청 coordinator | P0 | `WAITING` | 1주차 | T02 |
| 4 | T04. GitHub webhook idempotency | P0 | `WAITING` | 1주차 | T03 |
| 5 | T05. 명령 권한 검사와 `review` 라우팅 | P0 | `WAITING` | 1주차 | T04 |
| 6 | T06. head supersede, debounce, stale-post 방지 | P0 | `WAITING` | 2주차 | T05 |
| 7 | T07. 실패 복구와 lossless GitHub 게시 | P0 | `WAITING` | 2주차 | T06 |
| 8 | T08. 무료 5회 체험과 상품 UI 정합성 | P0 | `WAITING` | 2주차 | T07 |
| 9 | T09. generation 모델 마이그레이션·품질 평가와 P0 release gate | P0 | `WAITING` | 2주차 | T08 |
| 10 | T10. issue 피드백 데이터 모델과 API | P1 | `WAITING` | 3주차 | T09 + P0 gate |
| 11 | T11. 리뷰 상세 피드백 UI | P1 | `WAITING` | 3주차 | T10 |
| 12 | T12. 개인 리뷰 코치 지표와 dashboard | P1 | `WAITING` | 4주차 | T11 |
| 13 | T13. 개인 규칙 후보 생성과 승인 흐름 | P1 | `WAITING` | 4-5주차 | T12 |
| 14 | T14. 활성 규칙의 다음 리뷰 반영과 export | P1 | `WAITING` | 5주차 | T13 |
| 15 | T15. `.hreviewer.yml` 경로 규칙 | P2 | `WAITING` | 6주차 | T14 + P1 gate |
| 16 | T16. AGENTS·CLAUDE·convention 문맥 | P2 | `WAITING` | 6주차 | T15 |
| 17 | T17. 기존 GitHub Checks 실패 문맥 | P2 | `WAITING` | 7주차 | T16 |
| 18 | T18. 큰 PR의 부분 구조화 chunking | P2 | `WAITING` | 7주차 | T17 |
| 19 | T19. PR별 마지막 리뷰 head 상태 | P3 | `WAITING` | 8주차 | T18 + P2 gate |
| 20 | T20. 증분 diff와 finding continuity | P3 | `WAITING` | 8주차 | T19 |
| 21 | T21. `review full`, `pause`, `resume` 명령 | P3 | `WAITING` | 8주차 | T20 |

주차는 순서를 설명하는 목표값이며 고정 납기일이 아니다. T01에서 측정한 실패율과 테스트 작성 난이도를 기준으로 한 번만 재산정한다.

### 6.3 task 경계

| Task | 이번 task의 완료 산출물 | 이번 task에서 제외하고 다음으로 넘길 범위 |
| --- | --- | --- |
| T01 | 외부 경계를 주입할 수 있는 webhook·worker 테스트 seam, 현재 동작 fixture와 기준선 | DB schema·상태 전이(T02), 통합 요청 생성(T03), delivery dedup(T04) |
| T02 | Review·delivery·trial 상태 schema, migration, 상태 전이 helper와 기존 UI 호환 | 요청 enqueue 경로 변경(T03), delivery 처리 정책(T04) |
| T03 | `createReviewRequest()`와 semantic request dedup, queue 전 Review 생성, worker의 기존 row 갱신 | delivery dedup(T04), 명령 권한·라우팅(T05), debounce·supersede(T06), retry 복구(T07) |
| T04 | signature 이후 delivery row lease·redelivery 멱등성과 transport dedup 테스트 | collaborator 권한과 command 의미(T05), semantic request dedup 변경(T03) |
| T05 | collaborator 권한 검사, `review`·`summary` dispatch와 비허용 응답 | debounce·stale head(T06), 추가 명령 grammar(T21) |
| T06 | 자동 요청 debounce, supersede, cancelOn 보조 제어와 게시 직전 head guard | marker 기반 게시 복구와 lossless body(T07) |
| T07 | DB-before-post, deterministic marker, stage-aware retry, stale execution reconciliation | 무료 체험 entitlement와 UI(T08) |
| T08 | 계정 단위 5회 체험의 원자적 예약·소비·반환과 상품 UI 정합성 | 유료 평가와 production flag 활성화(T09·Approval-after) |
| T09 | `gemini-3.1-flash-lite` generation migration, role별 모델 품질 영수증, P0 회귀 corpus와 P0 release gate 결과 | P1 피드백·학습 기능(T10 이후) |
| T10 | feedback schema·migration·ownership API와 query invalidation | feedback UI(T11), 지표(T12), 규칙 생성(T13) |
| T11 | review detail 피드백 컨트롤, optimistic rollback과 접근성 | coach 지표(T12), 규칙 생성(T13) |
| T12 | 30일·90일 user-scoped coach metric과 dashboard | 규칙 후보·승인(T13) |
| T13 | 규칙·evidence schema, 후보 생성과 사용자 상태 전환 | prompt 반영·export(T14) |
| T14 | ACTIVE 규칙의 bounded prompt 반영, 적용 rule 추적, 안전한 export와 P1 gate | 저장소 규칙·guideline 문맥(T15-T16) |
| T15 | exact-head `.hreviewer.yml` parser, path rule 적용과 안전한 오류 notice | AGENTS·CLAUDE·convention 로딩(T16) |
| T16 | exact-head guideline 우선순위, bounded manifest와 prompt guard | GitHub Checks 문맥(T17) |
| T17 | exact-head completed check run의 bounded 실패 문맥 | large PR chunking(T18) |
| T18 | 최대 4개 chunk의 부분 구조화 보존, deterministic merge와 P2 gate | 증분 review baseline(T19) |
| T19 | PR별 last completed head·pause 상태 schema와 migration | 증분 compare·finding continuity(T20), command UX(T21) |
| T20 | incremental diff fallback과 finding continuity·중복 방지 | `full`·`pause`·`resume` command grammar(T21) |
| T21 | incremental·full·pause·resume 명령, idempotent acknowledgement와 P3 gate | 멀티 플랫폼·조직·IDE/CLI 등 섹션 17의 Out of scope |

### 6.4 task 완료 기록

task를 `COMPLETED`로 바꿀 때 아래 형식의 행을 이 표에 추가한다. 외부 승인이 필요한 검증은 로컬 완료 증거와 분리한다.

| Task | 완료일 | 변경 경로 | migration·env | 자동 검증 | 수동·외부 검증 | 남은 위험 | 다음 task |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | 2026-08-25 | <code>vitest.config.ts</code>, <code>app/api/webhooks/github/route.ts</code>, <code>app/api/webhooks/github/github-webhook-handler.ts</code>, <code>app/api/webhooks/github/github-webhook-handler.test.ts</code>, <code>app/api/webhooks/github/route.test.ts</code>, <code>inngest/functions/review.ts</code>, <code>inngest/functions/review.test.ts</code>, <code>inngest/functions/summary.ts</code>, <code>inngest/functions/summary.test.ts</code>, <code>features/review/ui/parts/review-status-badge.test.tsx</code>, <code>docs/proposals/hreviewer-personal-review-coach-p0-implementation-plan.md</code>, <code>docs/proposals/hreviewer-personal-review-coach-roadmap.md</code> | migration·env 변경 없음 | T01 전용 17개 통과; 전체 135개 통과·1개 환경 의존 calibration 스킵; lint 오류 0개·기존 경고 1개; typecheck·build 통과 | 실제 GitHub·Google AI 요청 없음; 외부 경계를 주입한 fixture로 검증 | 현재 결함인 <code>review</code> command 미dispatch는 T05, delivery 미영속화는 T04, 실행 상태 schema는 T02 소유로 의도적으로 보존; 목표 주차는 재산정 없이 유지 | T02 |

## 7. P0 — 신뢰성과 첫 경험

> 코드 수준 구현 계약, Prisma migration 순서, event payload, 상태 CAS, marker·credit 처리와 task별 파일은 [P0 구현 상세 계획](./hreviewer-personal-review-coach-p0-implementation-plan.md)을 따른다. 이 문서는 제품 범위, task 상태, release gate의 source of truth다.

### T01. 파이프라인 기준선과 테스트 하네스

목표는 외부 side effect를 만들지 않고 webhook부터 queue 요청까지 검증할 수 있는 경계를 만드는 것이다.

작업:

- webhook payload 파싱, signature 결과, delivery 처리 경계, command dispatch를 `route.ts`에서 route-private `github-webhook-handler.ts`로 분리한다.
- GitHub API, Inngest send, Prisma를 외부 경계로 주입할 수 있는 테스트 가능한 coordinator를 `app/api/webhooks/github/github-webhook-handler.ts`에 둔다. 이 composition 모듈은 `lib/github` public barrel로 export하지 않는다.
- 현재 존재하지 않는 webhook과 review worker orchestration 테스트를 추가한다.
- 현재 성공·실패·fallback 경로의 기준 로그와 Review row 상태를 fixture 기대값으로 기록한다.
- `vitest.config.ts`가 `*.test.ts`와 `*.test.tsx`를 모두 수집하도록 확장하되 기본 환경은 `node`로 유지한다. DOM이 필요한 후속 컴포넌트 테스트는 테스트 파일 단위 환경 지시자를 사용한다.
- 이 task에서는 T02의 schema·상태 전이, T03의 `createReviewRequest()`, T04의 delivery 영속화·dedup 동작을 구현하지 않는다.

완료 조건:

- `opened`, `synchronize`, `closed`, `issue_comment` fixture가 서로 독립된 테스트를 가진다.
- 테스트는 GitHub, Inngest, Google AI에 실제 요청을 보내지 않는다.
- `route.ts`는 HTTP adapter로 coordinator에 위임하고, `lib/github/index.ts`는 route composition handler를 export하지 않는다.
- Vitest discovery 검사에서 `*.test.ts`와 `*.test.tsx`가 모두 수집된다.
- 기존 순수 라이브러리 테스트와 전체 필수 검증이 통과한다.

### T02. Review 실행 상태와 webhook delivery 영속화

목표는 AI 호출 전에 실행을 영속화하고 모든 terminal 상태를 남기는 것이다.

작업:

- `Review.status`를 `PENDING`, `RUNNING`, `POSTING`, `COMPLETED`, `FAILED`, `SUPERSEDED` 상태로 제한한다. 기존 `pending`, `completed`, `failed` 데이터는 migration에서 명시적으로 매핑한다.
- `Review`에 unique `requestKey`, `requestSource`, `reviewMode`, `failureStage`, `failureMessage`, `lastCompletedStage`, `attemptCount`, `githubMainReviewId`, `githubMainPostedAt`, `trialCreditState`, `executionLeaseExpiresAt`을 추가한다.
- request key 형식은 `{reviewType}:{reviewMode}:{repositoryId}:{prNumber}:{headSha}:{nonce}`로 고정한다. 일반 요청의 nonce는 `default`, 명시적 full rerun의 nonce는 GitHub comment id다.
- `GithubWebhookDelivery` 모델을 추가해 delivery id, payload hash, event, action, 상태, 시도 수, lease owner token, `leaseExpiresAt`, 마지막 오류와 처리 시각을 저장한다.
- `UserUsage`에 계정 단위 `trialReviewCreditsUsed`를 추가한다.
- 실행 상태를 보여 주는 기존 Review badge와 상세 화면을 새 상태에 맞춘다.
- migration은 `npx.cmd prisma migrate dev --name add_review_execution_state`로 생성하고 알 수 없는 기존 status가 발견되면 migration을 중단한다.

완료 조건:

- migration 전 알 수 없는 기존 `Review.status` 값이 없는지 검사한다.
- 동일 request key로 Review row가 두 개 생성되지 않는다.
- 상태 전이는 아래 상태 머신 밖으로 벗어나지 않는다.

```text
PENDING -> RUNNING -> POSTING -> COMPLETED
    |          |          |
    +----------+----------+-> FAILED
    +----------+------------> SUPERSEDED
FAILED --retryable + explicit retry--> PENDING
FAILED --marker-confirmed reconciliation--> COMPLETED
```

<code>FAILED -> COMPLETED</code>는 T07 reconciler가 persisted body와 main marker를 모두 확인한 경우에만 허용한다.

### T03. 단일 리뷰 요청 coordinator

목표는 자동 webhook과 summary가 하나의 요청 생성 경로를 사용하고, 이후 수동 명령과 retry도 같은 경로에 연결할 수 있게 하는 것이다.

작업:

- `reviewPullRequest()`와 `generatePRSummary()`의 중복 조회·queue 로직을 `createReviewRequest()` use case로 모은다.
- 요청 시점에 PR snapshot과 정확한 `headSha`를 얻고 `Review(PENDING)`를 먼저 생성한다. 필수 필드는 snapshot의 title·URL·headSha와 `review: ""`로 채우며, UI는 `COMPLETED` 전 빈 body를 렌더링하지 않는다.
- 전체 리뷰 Inngest event에는 `reviewId`, `repositoryId`, `headSha`, `attempt`, `debounceKey`를 포함한다. summary event는 `debounceKey`가 필요하지 않다.
- Inngest event id는 전역 범위에서 충돌하지 않도록 `hreviewer:review-auto:{reviewId}:{attempt}`, `hreviewer:review-run:{reviewId}:{attempt}`, `hreviewer:summary-run:{reviewId}:{attempt}` prefix를 사용한다.
- worker는 owner·repo·prNumber로 새 Review를 만들지 않고 전달받은 `reviewId`를 갱신한다.
- summary도 동일 head에서 request key로 중복 방지하되 무료 전체 리뷰 크레딧은 사용하지 않는다.
- 수동 `review` command adapter는 T05에서, 실패 retry adapter는 T07에서 연결한다. 두 task는 별도 요청 생성 경로를 만들지 않고 `createReviewRequest()`를 재사용한다.

완료 조건:

- 이 시점에 활성화된 자동 review와 summary 진입점이 `createReviewRequest()`만 호출한다.
- Inngest send 실패 시 Review는 `FAILED`와 `failureStage=QUEUE`를 남긴다.
- retry는 같은 Review row의 attempt만 증가시키며 새 Review를 만들지 않는다.
- 두 기존 action은 public 결과 contract를 유지하고, 두 action과 두 worker의 직접 `review.create`는 0건이다.

### T04. GitHub webhook idempotency

목표는 동일 GitHub delivery가 여러 번 도착해도 side effect가 한 번만 발생하게 하는 것이다.

작업:

- signature 검증 후 `X-GitHub-Delivery`가 없으면 `400`을 반환한다.
- delivery row를 side effect보다 먼저 생성한다.
- `PROCESSED` delivery의 redelivery는 `200`으로 종료하고 아무 작업도 다시 실행하지 않는다.
- `FAILED` delivery는 동일 request key를 재사용해 안전하게 재시도한다.
- `PROCESSING` delivery는 새 작업을 만들지 않고 현재 처리 상태를 반환한다.
- `PROCESSING`의 lease가 만료되면 attempt를 증가시키고 같은 delivery row와 request key로 처리를 재개한다.
- request coordinator 이후 실패한 delivery는 확인된 request key를 FAILED row에 남긴다. redelivery는 새 PR snapshot이나 새 Review를 만들지 않고 exact request key의 Review를 조회해 필요한 경우 같은 row의 QUEUE retry만 수행한다.
- delivery를 `PROCESSED`로 바꾸는 시점은 필요한 Review request enqueue 또는 이벤트별 DB 작업이 성공한 뒤다.
- raw webhook body, signature, OAuth token은 delivery row에 저장하지 않는다.
- GitHub는 실패한 webhook을 자동 재전송하지 않으므로 P0 lease takeover는 GitHub UI/API의 수동 또는 별도 승인된 운영 redelivery가 들어왔을 때 동작한다. webhook 관리 credential과 자동 redelivery scheduler는 P0 Core에 추가하지 않는다.

완료 조건:

- 동일 delivery fixture를 두 번 처리해도 Review, Inngest event, 해결 상태 변경이 각각 한 번만 발생한다.
- 24시간이 지난 뒤에도 DB unique key로 중복이 차단된다.
- GitHub delivery id와 Inngest event id의 역할이 테스트에서 분리되어 있다.
- queue send 실패 뒤 승인된 manual/API redelivery가 새 Review를 만들지 않고 같은 Review ID의 attempt만 증가시킨다.

### T05. 명령 권한 검사와 `review` 라우팅

목표는 현재 조용히 무시되는 수동 리뷰를 동작시키고 비용 유발 명령을 보호하는 것이다.

작업:

- issue comment의 GitHub login을 파싱한다.
- 저장소 collaborator permission을 조회해 `write` 또는 `admin` 권한만 허용한다. GitHub의 `maintain` 역할은 API의 legacy `write` 권한으로 처리한다.
- `@hreviewer review`를 전체 리뷰 요청 coordinator로 연결한다.
- `@hreviewer summary`도 같은 권한과 request-key 중복 정책을 적용한다.
- malformed, unauthorized, unsupported command는 구분된 결과를 반환하고 AI event를 만들지 않는다.

완료 조건:

- authorized `review`가 Review row와 event를 한 번 만든다.
- unauthorized public comment는 Review row, event, 크레딧 사용을 만들지 않는다.
- parser가 반환하는 모든 command type은 dispatch branch 또는 명시적 unsupported 응답을 가진다.

### T06. head supersede, debounce, stale-post 방지

목표는 빠른 연속 push에서 마지막 head만 리뷰하도록 만드는 것이다.

작업:

- 자동 `opened`와 `synchronize` 요청은 `Review(PENDING)` 생성 후 `pr.review.auto-requested` event로 보낸다. event data의 `debounceKey`는 `{repositoryId}:{prNumber}` 문자열이다.
- 신규 `scheduleAutomaticReview` Inngest 함수가 `event.data.debounceKey` 기준 15초 debounce를 적용한 뒤 마지막 event만 `pr.review.requested`로 전달한다. 이 함수는 `app/api/inngest/route.ts`에 등록한다.
- 수동 명령은 `pr.review.requested`를 직접 보내 debounce를 우회한다.
- 새 head의 Review가 만들어질 때 이전 `PENDING`, `RUNNING`, 또는 메인 게시가 확인되지 않은 `POSTING` Review를 `SUPERSEDED`로 바꾸고 취소 event를 보낸다.
- 취소 event 이름은 `pr.review.superseded`이고 data에 취소 대상 `reviewId`를 넣는다. worker의 `cancelOn` 조건은 `async.data.reviewId == event.data.reviewId`다.
- worker에는 `event.data.debounceKey` 기준 concurrency `1`과 위 `cancelOn`을 설정한다.
- generation 전과 모든 GitHub post 직전에 현재 PR head를 다시 조회한다.
- 현재 head와 Review.headSha가 다르면 외부 게시 없이 `SUPERSEDED`로 종료한다.
- T06은 supersede 상태 전이와 취소 대상 ID만 확정한다. 예약된 무료 크레딧의 반환과 새 head 예약을 같은 transaction으로 묶는 작업은 T08이 소유하며, 그 전에는 무료 체험 flag를 활성화하지 않는다.

완료 조건:

- head A 이후 head B fixture에서 A는 게시되지 않고 B만 게시된다.
- 동일 head synchronize redelivery는 새 Review를 만들지 않는다.
- GitHub post 직전 head 변경을 모사한 테스트가 외부 post 호출 0회를 보장한다.

Inngest cancellation은 실행 중인 `step.run()` 외부 side effect를 되돌리지 못한다. 따라서 `cancelOn`만 신뢰하지 않고 게시 직전 head 검사와 DB 상태 검사를 함께 사용한다.

### T07. 실패 복구와 lossless GitHub 게시

목표는 어떤 게시 경로가 실패해도 리뷰 내용과 복구 정보를 잃지 않는 것이다.

작업:

- 생성·검증 완료 결과와 issue·suggestion을 하나의 DB transaction으로 먼저 저장하고 Review를 `POSTING`으로 바꾼다.
- review body에 general issue뿐 아니라 모든 inline issue의 위치·제목·핵심 내용을 포함한다. 인라인 게시가 실패해도 본문이 source of truth가 된다.
- GitHub body에 `<!-- hreviewer:review:{reviewId}:{part} -->` marker를 넣는다.
- 메인 review, inline issue, verification review, summary의 모든 body에 part별 marker를 넣는다. acknowledgement marker와 중복 방지는 명령 범위를 소유하는 T21에서 같은 marker helper를 확장해 구현한다.
- 외부 post 재시도 전 `octokit.paginate()`와 `pulls.listReviews`, `pulls.listReviewComments`, `issues.listComments`를 사용해 해당 part marker를 조회하고 중복 생성을 피한다.
- 메인 review, inline issue, verification review, summary post를 독립된 Inngest step으로 분리한다.
- `onFailure`에서 Review를 `FAILED`로 바꾸고 마지막 성공 단계와 안전한 오류 요약을 남긴다.
- `onFailure`는 compare-and-set으로 현재 상태가 `PENDING`, `RUNNING`, `POSTING`일 때만 `FAILED`를 기록한다. 이미 `FAILED`, `COMPLETED`, `SUPERSEDED`인 상태는 덮어쓰지 않는다.
- 저장 오류는 이름, status code, 허용된 내부 failure code만 최대 1,000자로 정규화하고 token, raw response body, prompt, diff를 저장하지 않는다.
- `failureStage=POST` retry는 저장된 reviewData를 재사용하며 AI 생성을 다시 실행하지 않는다.
- 각 주요 단계는 `executionLeaseExpiresAt`을 갱신한다. 신규 `reconcileStaleReviewExecutions` 함수는 `*/10 * * * *` cron으로 실행하고 `app/api/inngest/route.ts`에 등록한다. 만료된 `PENDING`, `RUNNING`, `POSTING` Review의 marker를 확인해 게시 완료면 `COMPLETED`, 미게시면 retry 가능한 `FAILED`로 수렴시킨다. GitHub 확인 자체가 실패하면 상태를 추측하지 않고 다음 주기로 미룬다.

완료 조건:

- inline issue API 실패 fixture에서도 모든 issue가 review body에 존재한다.
- 최종 GitHub 요청 body는 main·suggestion·inline·verification·summary·fallback marker를 정확히 한 번 포함하고 게시 함수는 artifact ID를 반환한다.
- 네트워크 timeout 후 retry가 같은 marker의 GitHub artifact를 두 개 만들지 않는다.
- retry server action은 미인증과 타 사용자 Review에서 event·DB write를 만들지 않으며 retry UI는 허용 상태에서만 보인다.
- 게시 성공 후 후속 단계 실패는 크레딧을 반환하지 않고 stage-aware retry가 가능하다.
- 생성·검증·저장 단계의 terminal failure는 사용자에게 실패 상태와 retry 가능 여부를 보여 준다.
- 강제 프로세스 종료 fixture에서 lease 만료 후 Review가 영구 비종료 상태로 남지 않는다.

### T08. 무료 5회 체험과 상품 UI 정합성

목표는 결제 전에 HReviewer의 핵심 가치를 경험하게 하고 표시 내용과 실제 권한을 맞추는 것이다.

작업:

- Free 전체 리뷰 한도를 계정당 5회로 변경한다.
- Review request 생성과 크레딧 예약을 PostgreSQL serializable transaction으로 묶고 serialization conflict를 최대 3회 재시도한다.
- `trialReviewCreditsUsed`는 예약과 소비를 포함하며, `FAILED` 또는 `SUPERSEDED` release를 idempotent하게 감소시킨다.
- subscription usage UI에 `사용 / 5`와 남은 횟수를 표시한다.
- 무료 기능표의 “No AI reviews”를 제거하고 5회 체험을 명시한다.
- T12가 배포되기 전에는 Pro의 “Advanced analytics” 문구를 제거하거나 “Review history”로 낮춘다.
- `FREE_REVIEW_TRIAL_ENABLED=false`에서는 현재 Pro-only 동작을 유지한다.

완료 조건:

- 동시 요청 fixture에서도 다섯 개만 예약되고 여섯 번째는 거절된다.
- 실패·supersede release가 두 번 호출되어도 카운트는 한 번만 감소한다.
- 플래그 on/off의 서버 권한과 UI 문구가 일치한다.
- server action이 Free flag off/on/exhausted와 Pro의 계산된 trial usage를 client에 전달한다.
- 운영 활성화 전 비밀값이 아닌 AI 비용 상한과 활성화 승인 기록을 남긴다.

### T09. generation 모델 마이그레이션·품질 평가와 P0 release gate

목표는 generation을 `gemini-3.1-flash-lite`로 전환하고 확정된 role별 모델 조합이 실제로 동작하는지 확인하며, ground-truth 품질 baseline과 기존 repeat false-positive gate를 남기는 것이다. 비교 가능한 pre-P0 고정 output이 없으므로 P0에서는 품질 비저하를 단정하지 않는다.

작업:

- 현재 source의 generation `gemini-2.5-flash`를 `gemini-3.1-flash-lite`로 전환하고, generation `gemini-3.1-flash-lite`, verification `gemini-3.1-flash-lite`, embedding `gemini-embedding-001`의 세 role binding으로 평가 영수증을 갱신한다.
- generation과 verification이 같은 exact model을 사용하는 비용 우선 결정을 독립 검증으로 표현하지 않으며, 상관된 blind spot과 사람 adjudication 보완 증거를 영수증에 기록한다.
- `gemini-3.1-flash-lite`의 공식 shutdown `2027-05-07` 전에 예정된 P0 운영·rollback 기간이 끝나는지 계산하고, 충족하지 못하면 release gate를 차단한다.
- 기존 A/C/F fixture 또는 같은 목적의 fresh fixture로 actionable precision, known-defect recall, unsupported claim, stale claim, cross-file miss를 다시 측정한다.
- production repeat candidate selector를 같은 ground-truth corpus의 historical finding에 적용해 repeat false-positive rate를 측정하고, 평가 script에 별도 알고리즘을 복제하지 않는다.
- duplicate delivery, stale head, inline failure, terminal failure fixture를 운영 회귀 corpus에 추가한다.
- 외부 write, credential, 배포 identity가 필요한 실행은 별도 승인을 받은 뒤 수행한다.

P0 release gate:

- repeat detection false positive rate `20% 이하`
- actionable precision, known-defect recall, repeat false-positive rate가 모두 계산 가능하고 분자·분모가 영수증에 존재
- duplicate review와 알려진 stale-head post fixture `0건`
- terminal failure의 Review 상태 누락 `0건`
- inline issue 정보 손실 `0건`
- 세 production role binding의 exact availability와 품질 평가 완료
- generator·verifier exact-model 공유의 비독립성 및 `2027-05-07` lifecycle window가 영수증에 기록됨
- 필수 build, typecheck, lint, test 통과

## 8. P1 — 반복 실수 학습 루프

### T10. issue 피드백 데이터 모델과 API

목표는 사용자가 각 issue를 평가할 수 있는 독립 도메인을 만드는 것이다.

작업:

- `ReviewIssueFeedback` 모델과 `HELPFUL`, `FALSE_POSITIVE`, `INTENTIONAL_IGNORE` verdict를 추가한다. ReviewIssue 또는 User 삭제 시 feedback도 cascade한다.
- issue당 사용자당 하나의 현재 피드백을 upsert하고 변경 이력을 위한 updatedAt을 유지한다.
- authenticated user가 자신의 repository에 속한 issue만 평가할 수 있게 한다.
- 기존 `IssueResolutionStatus`는 변경하지 않는다.
- 피드백 저장 성공 후 coach metrics query만 invalidate한다.
- migration은 `npx.cmd prisma migrate dev --name add-review-coach-feedback`로 생성한다.

완료 조건:

- 다른 사용자의 issue id로 요청하면 저장되지 않는다.
- 동일 verdict 재전송은 idempotent하다.
- `INTENTIONAL_IGNORE`가 `ReviewIssue.resolutionStatus`를 `IGNORED`로 바꾸지 않는다.

### T11. 리뷰 상세 피드백 UI

목표는 리뷰 문맥을 벗어나지 않고 한 번의 클릭으로 피드백을 남기게 하는 것이다.

작업:

- review detail의 각 issue에 도움됨, 오탐, 의도적 무시 컨트롤을 배치한다.
- optimistic state와 서버 확정 state를 구분한다.
- 실패 시 원래 상태로 되돌리고 재시도 가능한 오류를 표시한다.
- verification과 repeat badge 옆에서 의미가 혼동되지 않도록 별도 “내 평가” 영역을 사용한다.
- 컴포넌트 테스트를 위해 `@testing-library/react`, `@testing-library/user-event`, `jsdom`을 dev dependency로 추가하고 해당 `*.test.tsx`에 jsdom 환경을 명시한다. 프로젝트 전체 Vitest 기본 환경은 `node`로 유지한다.

완료 조건:

- 세 verdict의 선택, 변경, 실패 rollback을 컴포넌트 테스트로 검증한다.
- keyboard와 screen reader로 컨트롤 이름과 선택 상태를 확인할 수 있다.
- review detail 데이터 query의 loading과 error 경계가 독립적으로 동작한다.

### T12. 개인 리뷰 코치 지표와 dashboard

목표는 “리뷰를 몇 번 받았는가”가 아니라 “실수가 줄고 있는가”를 보여 주는 것이다.

지표 정의:

- helpful rate: `HELPFUL / (HELPFUL + FALSE_POSITIVE)`
- false-positive rate: `FALSE_POSITIVE / (HELPFUL + FALSE_POSITIVE)`
- suggestion apply rate: terminal suggestion 중 `APPLIED / (APPLIED + DISMISSED + CONFLICTED)`
- repeat rate: 기간 내 embedding이 있는 issue 중 `isRepeat=true` 비율
- recurrence trend: 최근 30일 repeat rate와 직전 30일 repeat rate 비교
- weakness category: repeat 수 내림차순, 그다음 `HELPFUL + ADDRESSED_STRONG` 수 내림차순

표시 규칙:

- 분모가 0이면 `0%`가 아니라 데이터 부족으로 표시한다.
- 기간 내 eligible issue가 5개 미만이면 trend를 단정하지 않는다.
- 30일과 90일 필터를 제공한다.
- Pro 기능표의 “Advanced analytics”는 이 task가 배포된 뒤에만 다시 활성화한다.

완료 조건:

- 각 지표의 분모 0, 기간 경계, timezone 경계, 데이터 5개 미만 테스트가 있다.
- dashboard에서 category별 반복 횟수와 과거 PR 링크를 확인할 수 있다.
- 집계 query가 사용자 경계를 넘지 않는다.

### T13. 개인 규칙 후보 생성과 승인 흐름

목표는 반복된 경험을 자동 강제가 아닌 검토 가능한 규칙 후보로 바꾸는 것이다.

작업:

- `ReviewRule`과 `ReviewRuleEvidence` 모델을 추가한다.
- 기존 settings parts의 도메인 그룹 규칙에 맞춰 `features/settings/ui/parts/review-rule/` 디렉터리를 만들고 규칙 UI를 그 안에 배치한다.
- 90일 내 같은 category와 `REPEAT_SIMILARITY_THRESHOLD` 이상인 issue cluster가 두 번 이상 나타날 때 후보를 만든다.
- mistake-prevention 후보는 최소 한 개의 `HELPFUL`과 `ADDRESSED_STRONG` 근거를 요구한다.
- false-positive suppression 후보는 같은 cluster의 `FALSE_POSITIVE`가 두 번 이상이고 `HELPFUL` 반례가 없을 때만 만든다.
- `INTENTIONAL_IGNORE`는 후보 생성 근거에서 제외한다.
- 규칙 상태는 `PROPOSED`, `ACTIVE`, `DISABLED`로 관리하고 사용자가 직접 전환한다.
- migration은 `npx.cmd prisma migrate dev --name add-review-rules`로 생성한다.
- repository disconnect로 evidence issue가 삭제되면 해당 evidence도 cascade한다. 남은 evidence가 0개인 규칙은 같은 disconnect transaction에서 `DISABLED`로 바꾸고 다음 리뷰와 export에서 제외한다.

완료 조건:

- 근거 issue와 feedback 없이 규칙 후보가 생성되지 않는다.
- 상충하는 helpful·false-positive cluster는 자동 활성화되지 않고 후보 생성도 보류한다.
- 규칙 화면에서 근거 PR과 issue를 추적할 수 있다.

### T14. 활성 규칙의 다음 리뷰 반영과 export

목표는 승인된 개인 규칙이 실제 다음 리뷰에 반영되도록 루프를 닫는 것이다.

작업:

- 현재 사용자의 `ACTIVE` 규칙만 review prompt의 별도 personal-rules section에 포함한다.
- 최대 10개, 합계 4,000자로 제한하고 category와 최근 근거를 우선한다.
- 규칙은 모델의 안전 제약, diff 근거 요구, 출력 schema보다 낮은 우선순위를 갖는다.
- reviewData에 적용된 rule id 목록을 저장해 결과를 추적한다.
- 활성 규칙을 `.hreviewer.yml` 조각 또는 `AGENTS.md` 조각으로 다운로드할 수 있게 한다.
- 첫 단계에서는 GitHub repository에 자동 commit하지 않는다.

완료 조건:

- 다른 사용자의 규칙이 prompt에 포함되지 않는다.
- 비활성 규칙과 10개 초과 규칙이 포함되지 않는다.
- export 결과가 secret, 내부 DB id, 원문 embedding을 포함하지 않는다.
- 적용 규칙별 helpful·false-positive 결과를 이후 dashboard에서 비교할 수 있다.

## 9. P2 — 낮은 비용의 정확도 향상

### T15. `.hreviewer.yml` 경로 규칙

목표는 저장소마다 리뷰 범위와 경로별 지침을 제어하게 하는 것이다.

지원 schema v1:

```yaml
version: 1
autoReview:
  enabled: true
ignore:
  - "**/*.generated.ts"
pathInstructions:
  - paths:
      - "app/api/**"
    instructions: "인증, 입력 검증, idempotency를 우선 검토한다."
conventions:
  include:
    - "docs/conventions/*.md"
```

작업:

- exact head SHA에서 root `.hreviewer.yml`만 읽는다.
- YAML은 safe schema로 파싱하고 alias 폭증, custom tag, executable type을 허용하지 않는다.
- glob은 repository-relative POSIX path에만 적용하고 `..` 경로를 거부한다.
- 잘못된 설정은 리뷰를 중단하지 않고 사용자-visible notice와 구조화 로그를 남긴다.
- `yaml`과 `picomatch`를 직접 dependency로 추가하고 lockfile을 갱신한다.

완료 조건:

- valid, invalid, oversized, path traversal, overlapping rule fixture가 있다.
- ignore된 파일은 diff context, issue, suggestion 대상에서 제외된다.
- path instruction은 일치하는 변경 파일에만 적용된다.

### T16. AGENTS·CLAUDE·convention 문맥

목표는 영구 인덱스 없이 저장소의 실제 규칙을 리뷰에 반영하는 것이다.

우선순위:

1. HReviewer 안전 제약과 출력 schema
2. `.hreviewer.yml`의 명시적 path instruction
3. 변경 파일에 가장 가까운 `AGENTS.md`
4. repository root `AGENTS.md`
5. repository root `CLAUDE.md`
6. `.hreviewer.yml`이 opt-in한 convention 문서
7. 사용자가 활성화한 personal rule
8. 일반 모델 지침

작업:

- `buildDeterministicPrContext()` manifest source에 `repository-guideline`을 추가한다.
- 모든 문서는 Review.headSha에서 읽고 변경 파일별 적용 범위를 기록한다.
- root guideline 총 8,000자, nearest guideline 파일당 4,000자, convention 총 12,000자로 제한한다.
- 문서 안의 명령은 실행하지 않고 코드 리뷰 기준으로만 전달한다.
- context notice와 manifest identity에 guideline 포함·생략·truncation을 기록한다.

완료 조건:

- head가 바뀌면 guideline identity도 바뀐다.
- nested AGENTS가 root 규칙을 범위 내에서 덮지만 HReviewer 안전 제약은 덮지 못한다.
- unchanged guideline만을 근거로 negative finding을 만들지 않는 기존 prompt guard를 유지한다.

### T17. 기존 GitHub Checks 실패 문맥

목표는 별도 50개 도구 sandbox를 만들지 않고 이미 실행된 결정적 신호를 리뷰에 활용하는 것이다.

작업:

- Review.headSha의 completed check run을 조회한다.
- 실패, 취소, timed-out check의 이름, conclusion, output title과 summary만 총 8,000자 bounded context로 포함한다.
- 원문 log 전체와 annotation 전체는 첫 단계에서 가져오지 않는다.
- check 기반 issue는 check 이름을 근거로 표시하고 diff와 관계없는 추측을 금지한다.
- Checks API 조회 실패는 리뷰를 중단하지 않고 notice와 로그를 남긴다.

완료 조건:

- 성공 check만 있는 PR에서는 추가 negative finding 근거가 생기지 않는다.
- 실패 check fixture는 이름과 bounded summary만 prompt에 포함한다.
- 다른 SHA의 check 결과가 섞이지 않는다.

### T18. 큰 PR의 부분 구조화 chunking

목표는 한 chunk의 구조화 생성 실패가 전체 리뷰를 markdown fallback으로 떨어뜨리지 않게 하는 것이다.

작업:

- `large` PR을 변경 파일과 dependency locality 기준 최대 4개 chunk로 나눈다.
- chunk별 structured output을 독립 생성하고 성공한 결과만 합친다.
- 합친 issue와 suggestion에 기존 path, added-line, encoding, verifier, repeat gate를 동일하게 적용한다.
- 중복 finding은 file+line+category와 embedding similarity로 제거한다.
- 실패 chunk는 해당 범위만 markdown summary로 축소하고 전체 review notice에 누락 범위를 명시한다.
- 비용 상한은 chunk 4개와 최종 aggregation 1회로 고정한다.
- 최종 aggregation 호출이 실패해도 성공 chunk의 구조화 issue와 suggestion은 deterministic merge로 보존한다.

완료 조건:

- 한 chunk timeout fixture에서도 다른 chunk의 suggestion, verification, repeat가 유지된다.
- 동일 finding이 두 chunk에서 나와도 한 번만 게시·저장된다.
- 4개 chunk 예산을 넘는 파일은 notice와 manifest에서 식별할 수 있다.

## 10. P3 — 증분 리뷰 경험

### T19. PR별 마지막 리뷰 head 상태

목표는 현재 PR이 어디까지 리뷰되었는지 영속적으로 추적하는 것이다.

작업:

- `PullRequestReviewState` 모델을 추가한다.
- repositoryId+prNumber를 unique key로 사용하고 `lastCompletedHeadSha`, `isPaused`, `pausedAt`, `updatedAt`을 저장한다.
- Repository relation은 `onDelete: Cascade`로 설정한다.
- `Review(COMPLETED)` 이후에만 last completed head를 갱신한다.
- force push나 compare 불가능 상태를 기록하고 full review fallback을 선택한다.
- migration은 `npx.cmd prisma migrate dev --name add-pull-request-review-state`로 생성한다.

완료 조건:

- failed와 superseded Review는 baseline을 이동시키지 않는다.
- PR별 상태가 다른 repository 또는 PR과 섞이지 않는다.
- repository disconnect cascade 정책이 migration과 테스트에 명시된다.

### T20. 증분 diff와 finding continuity

목표는 마지막 완료 리뷰 이후 새로 생긴 문제만 우선 전달하는 것이다.

작업:

- `lastCompletedHeadSha...currentHeadSha` compare 결과를 증분 diff로 사용한다.
- compare가 불가능하거나 baseline이 없으면 현재 full PR diff로 fallback한다.
- 이전 unresolved issue와 새 issue를 category, file, line 이동, embedding으로 대조한다.
- 동일 issue는 새 코멘트를 만들지 않고 `still-open` 상태로 review body에 요약한다.
- 해결된 issue는 기존 reconciliation 결과를 유지하고 재발하면 repeat로 새 issue를 만든다.
- 모든 context 파일은 여전히 current head에서 읽는다.

완료 조건:

- 이전 리뷰와 같은 finding은 새 inline comment를 만들지 않는다.
- 새로 추가된 finding과 재발 finding은 구분된다.
- compare 실패가 조용히 리뷰 누락으로 이어지지 않고 full review notice를 남긴다.

### T21. `review full`, `pause`, `resume` 명령

목표는 자동 리뷰 동작을 GitHub conversation 안에서 제어하게 하는 것이다.

명령 의미:

- `@hreviewer review`: 현재 head의 증분 리뷰. 같은 request key가 있으면 기존 상태를 반환한다.
- `@hreviewer review full`: 현재 head 전체를 명시적으로 재검토한다. comment id를 request nonce로 사용하며 무료 크레딧을 소비한다.
- `@hreviewer pause`: 현재 PR의 이후 자동 리뷰를 중지한다.
- `@hreviewer resume`: pause를 해제하고 현재 head의 증분 리뷰를 한 번 요청한다.
- `@hreviewer summary`: 현재 head summary. 동일 head 중복 생성은 하지 않는다.

작업:

- parser grammar와 command union을 확장한다.
- 모든 명령에 T05 권한 검사를 재사용한다.
- pause 중 synchronize는 issue resolution reconciliation을 수행하지만 AI review는 queue하지 않는다.
- PR의 `isPaused=true`는 `.hreviewer.yml`의 `autoReview.enabled=true`보다 우선한다. config가 `false`이면 `resume`은 pause를 해제하고 명시적 리뷰 한 번만 요청하며 이후 자동 리뷰를 켜지는 않는다.
- 명령 결과는 marker가 있는 짧은 acknowledgement comment로 한 번만 게시한다.

완료 조건:

- pause, synchronize, resume 순서에서 resume 이후 한 번만 리뷰된다.
- 동일 comment delivery redelivery가 acknowledgement를 중복 생성하지 않는다.
- full과 incremental request key가 충돌하지 않는다.

## 11. 예상 변경 영역

아래 목록은 phase 전체의 후보 inventory이며 한 task에서 모두 수정하는 목록이 아니다. 각 task 시작 시 섹션 6.3의 경계와 해당 task 본문을 기준으로 현재 owner, public API와 import consumer를 다시 확인하고, 완료 기록에는 실제 변경 경로만 남긴다. 후속 task 전용 파일을 미리 만들거나 동작을 선반영하지 않는다.

### P0 기존 파일

- `docs/proposals/hreviewer-personal-review-coach-p0-implementation-plan.md`
- `docs/proposals/hreviewer-personal-review-coach-roadmap.md`
- `vitest.config.ts`
- `app/api/webhooks/github/route.ts`
- `features/ai/actions/review-pull-request.ts`
- `features/ai/actions/generate-pr-summary.ts`
- `features/ai/utils/command-parser.ts`
- `features/ai/types/index.ts`
- `features/review/lib/pr-review.ts`
- `features/review/ui/review-detail.tsx`
- `features/review/ui/parts/structured-review-body.tsx`
- `features/review/types/index.ts`
- `features/review/constants/index.ts`
- `features/review/ui/parts/review-status-badge.tsx`
- `features/ai/lib/review-formatter.ts`
- `features/ai/lib/review-formatter.test.ts`
- `features/ai/lib/repeat-detection.ts`
- `features/ai/lib/repeat-detection.test.ts`
- `features/payment/lib/subscription.ts`
- `features/payment/constants/index.ts`
- `features/payment/constants/flags.ts`
- `features/payment/actions/config.ts`
- `features/payment/ui/subscription-page.tsx`
- `features/payment/ui/parts/plan-card.tsx`
- `features/payment/ui/parts/usage-card.tsx`
- `lib/github/github.ts`
- `app/api/inngest/route.ts`
- `inngest/functions/review.ts`
- `inngest/functions/summary.ts`
- `prisma/schema.prisma`
- `prisma/migrations/` 아래 Prisma가 생성한 `add_review_execution_state` migration

### P0 신규 파일

- `app/api/webhooks/github/github-webhook-handler.ts`
- `app/api/webhooks/github/github-webhook-handler.test.ts`
- `features/review/ui/parts/review-status-badge.test.tsx`
- `features/review/ui/review-detail.test.tsx`
- `features/review/lib/review-execution-state.test.ts`
- `features/review/lib/review-execution-migration.integration.test.ts`
- `lib/test/create-test-prisma-client.ts`
- `scripts/prepare-p0-test-database.mjs`
- `lib/github/github-webhook-delivery.ts`
- `lib/github/github-webhook-delivery.test.ts`
- `lib/github/github-webhook-delivery.integration.test.ts`
- `lib/github/github-review-artifacts.ts`
- `lib/github/github-review-artifacts.test.ts`
- `features/review/lib/review-request.ts`
- `features/review/lib/review-request.test.ts`
- `features/review/lib/review-request.integration.test.ts`
- `features/ai/actions/review-pull-request.test.ts`
- `features/ai/actions/generate-pr-summary.test.ts`
- `features/ai/utils/command-parser.test.ts`
- `features/review/lib/review-execution-state.ts`
- `features/review/lib/review-artifact-marker.ts`
- `features/review/lib/review-artifact-marker.test.ts`
- `features/review/actions/retry-review.ts`
- `features/review/actions/retry-review.test.ts`
- `features/review/lib/retry-review-request.test.ts`
- `features/review/ui/parts/review-retry-button.tsx`
- `features/review/ui/parts/review-retry-button.test.tsx`
- `features/review/lib/pr-review.test.ts`
- `features/review/ui/parts/structured-review-body.test.tsx`
- `features/payment/lib/review-trial.ts`
- `features/payment/lib/review-trial.test.ts`
- `features/payment/lib/review-trial.integration.test.ts`
- `features/payment/actions/config.test.ts`
- `features/payment/ui/parts/plan-card.test.tsx`
- `features/payment/ui/parts/usage-card.test.tsx`
- `inngest/events.ts`
- `inngest/functions/schedule-automatic-review.ts`
- `inngest/functions/schedule-automatic-review.test.ts`
- `inngest/functions/reconcile-stale-review-executions.ts`
- `inngest/functions/reconcile-stale-review-executions.test.ts`
- `inngest/functions/review.test.ts`
- `inngest/functions/summary.test.ts`
- `app/api/webhooks/github/route.test.ts`
- `scripts/p0-review-quality-evaluation.test.ts`
- `scripts/fixtures/p0-review-quality-cases.json`
- `scripts/fixtures/p0-review-quality-adjudications.json`
- `docs/evaluations/p0-personal-review-coach-release-receipt.md`

### P1 기존·신규 파일

- `prisma/schema.prisma`
- `prisma/migrations/` 아래 Prisma가 생성한 `add_review_coach_feedback` migration
- `prisma/migrations/` 아래 Prisma가 생성한 `add_review_rules` migration
- `features/review/actions/submit-issue-feedback.ts`
- `features/review/hooks/use-issue-feedback.ts`
- `features/review/lib/issue-feedback.ts`
- `features/review/ui/parts/issue-feedback-controls.tsx`
- `features/review/ui/parts/issue-feedback-controls.test.tsx`
- `features/review/ui/review-detail.tsx`
- `features/dashboard/actions/get-review-coach-metrics.ts`
- `features/dashboard/lib/review-coach-metrics.ts`
- `features/dashboard/lib/review-coach-metrics.test.ts`
- `features/dashboard/ui/review-coach-overview.tsx`
- `features/dashboard/ui/stats-overview.tsx`
- `features/settings/actions/update-review-rule.ts`
- `features/settings/ui/settings-page.tsx`
- `features/settings/ui/parts/review-rule/review-rule-list.tsx`
- `features/ai/lib/get-active-review-rules.ts`
- `package.json`
- `package-lock.json`

### P2 기존·신규 파일

- `features/ai/lib/repository-review-config.ts`
- `features/ai/lib/repository-review-config.test.ts`
- `features/ai/lib/build-deterministic-pr-context.ts`
- `features/ai/lib/build-deterministic-pr-context.test.ts`
- `features/ai/lib/build-github-checks-context.ts`
- `features/ai/lib/build-github-checks-context.test.ts`
- `features/ai/lib/chunk-large-review.ts`
- `features/ai/lib/chunk-large-review.test.ts`
- `features/ai/lib/review-prompt.ts`
- `features/ai/lib/review-prompt.test.ts`
- `inngest/functions/review.ts`
- `lib/github/github.ts`
- `package.json`
- `package-lock.json`

### P3 기존·신규 파일

- `prisma/schema.prisma`
- `prisma/migrations/` 아래 Prisma가 생성한 `add_pull_request_review_state` migration
- `app/api/webhooks/github/route.ts`
- `features/ai/utils/command-parser.ts`
- `features/ai/lib/build-incremental-review-context.ts`
- `features/ai/lib/build-incremental-review-context.test.ts`
- `features/review/lib/finding-continuity.ts`
- `features/review/lib/finding-continuity.test.ts`
- `features/review/lib/pull-request-review-state.ts`
- `inngest/functions/review.ts`

구현 중 실제 책임이 기존 모듈과 다르면 새 feature를 즉시 만들지 말고 현재 public API와 import consumer를 먼저 inventory한다. 새 파일명은 모두 kebab-case를 사용한다.

## 12. 런타임 불변식

- signature 검증 전에는 delivery row를 포함한 어떤 DB write도 하지 않는다.
- delivery dedup과 semantic request dedup은 서로 다른 계층으로 유지한다.
- AI 호출 전에 Review row와 정확한 head SHA가 존재해야 한다.
- GitHub에 게시하기 전에 current head와 Review 상태를 다시 확인한다.
- DB에 보존되지 않은 review body를 GitHub에 먼저 게시하지 않는다.
- 외부 post에는 deterministic marker가 있어야 한다.
- 무료 크레딧 예약, 소비, 반환은 각각 최대 한 번만 일어난다.
- `COMPLETED` Review만 증분 리뷰 baseline이 된다.
- user feedback과 personal rule query는 항상 repository ownership으로 범위를 제한한다.
- guideline과 config는 current head에서만 읽고 AI system constraint를 변경하지 않는다.

## 13. 최종 artifact와 검증 위치

| Artifact | 최종 source | 사용자에게 보이는 결과 | 검증 위치 |
| --- | --- | --- | --- |
| Webhook delivery 상태 | `GithubWebhookDelivery`와 lease CAS | 중복 delivery 처리 결과와 운영 redelivery 상태 | requestKey 보존, manual/API redelivery, PostgreSQL lease test |
| GitHub 메인 리뷰 | 저장된 `Review.review`와 `reviewData` | PR Conversation과 Files changed review | marker 검색, body 내용, commit id |
| Inline issue·suggestion | 저장된 `ReviewIssue`, `Suggestion` | Files changed inline comment | line/path와 body fallback 동시 검사 |
| 실행 상태 | `Review.status`, failure fields | dashboard review 상태 | DB row와 status badge |
| 무료 체험 | `UserUsage.trialReviewCreditsUsed`, Review credit state | subscription usage와 queue 허용 여부 | 동시 요청 테스트와 UI 표시 |
| 사용자 피드백 | `ReviewIssueFeedback` | review detail의 “내 평가” | ownership API와 selected state |
| 개인 규칙 | `ReviewRule`, `ReviewRuleEvidence` | settings 규칙 목록과 다음 리뷰 | prompt 적용 rule ids와 export body |
| 코치 지표 | feedback, issue, suggestion 집계 | dashboard 30일·90일 insight | metric unit test와 user-scoped query |
| 저장소 규칙 | `.hreviewer.yml`, exact-head guideline manifest | review notice와 결과 | parsed config, manifest identity, prompt section |
| GitHub Checks 문맥 | Review.headSha의 check runs | 근거가 표시된 review finding | check name·SHA·bounded summary |
| 증분 리뷰 | `PullRequestReviewState.lastCompletedHeadSha` | 새 finding 중심 review | compare range, fallback notice, dedup result |
| Prisma client | `prisma/schema.prisma`와 각 migration | 서버가 사용하는 생성 타입과 query API | `lib/generated/prisma`, validate, generate, typecheck |
| Inngest 함수 registry | `app/api/inngest/route.ts` | debounce·review·summary 실행 가능 상태 | serve 함수 목록과 local Inngest fixture |
| 구현 source bundle과 완료 기록 | 두 proposal 문서와 phase release receipt | task 상태와 검증·승인 증거 | exact-path `git ls-files --error-unmatch`와 PR diff |

## 14. 단계별 release gate

phase gate의 실행 시점은 P0=T09, P1=T14 완료 직후, P2=T18 완료 직후, P3=T21 완료 직후다. gate가 실패하면 직전 task를 `BLOCKED`로 유지하고 다음 phase의 첫 task를 `NEXT`로 바꾸지 않는다.

### P0 gate

- 중복 delivery와 동일 request fixture에서 외부 게시 1회
- stale head fixture에서 외부 게시 0회
- 모든 terminal failure에 Review 상태와 failure stage 존재
- 무료 한도 동시성 테스트 통과
- request key, delivery lease, 무료 한도의 격리 PostgreSQL integration test 통과
- repeat false-positive rate 20% 이하이며 precision·recall·repeat metric의 분자·분모가 계산 가능
- 확정된 generation migration과 세 production role binding의 품질 평가 완료
- generator·verifier exact-model 공유의 비독립성과 lifecycle window가 release receipt에 기록됨

### P1 gate

- 피드백 ownership 위반 0건
- repeat false positive rate 20% 이하 유지
- 규칙은 사용자 승인 없이 `ACTIVE`가 되지 않음
- recurrence metric의 분모와 기간 경계 테스트 통과

### P2 gate

- invalid config와 guideline injection이 리뷰 안전 제약을 바꾸지 않음
- 다른 SHA의 guideline과 check result 혼입 0건
- large PR에서 일부 chunk 실패가 전체 structured output을 제거하지 않음

### P3 gate

- 동일 finding의 중복 inline comment 0건
- failed·superseded review가 baseline을 이동시키지 않음
- pause 상태에서 자동 AI event 0건
- compare 불가 시 full review fallback과 사용자 notice 존재

## 15. 검증 명령과 수동 시나리오

각 task는 현재 task와 직접 관련된 `*.test.ts` 또는 `*.test.tsx`를 먼저 통과한 뒤 아래 전체 필수 검증을 실행한다. 일부 명령만 통과한 상태에서는 task를 `COMPLETED`로 바꾸지 않는다.

```powershell
npm.cmd run test
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

Prisma schema를 변경한 task는 추가로 실행한다.

```powershell
npx.cmd prisma validate
npx.cmd prisma generate
```

Prisma migration을 소유하는 task는 T02, T10, T13, T19다. 이 task들은 생성된 migration의 구조와 기존 데이터 전이도 검토하고, migration·Prisma client·typecheck 결과를 같은 완료 기록에 남긴다.

수동 GitHub fixture 검증:

1. T04: 같은 `X-GitHub-Delivery`를 재전송해 review와 comment가 한 번만 생기는지 확인하고, queue send 실패 뒤 승인된 manual/API redelivery가 새 Review 없이 같은 Review ID의 queue attempt만 증가시키는지 확인한다.
2. T06: head A 직후 head B를 push해 A가 superseded되고 B만 게시되는지 확인한다.
3. T05: 권한 없는 사용자가 public PR에 summary와 review 명령을 남겨도 event가 생성되지 않는지 확인한다.
4. T08: Free 계정의 5회 성공, 6회 거절, 실패·supersede 크레딧 반환을 확인한다.
5. T07: inline issue API를 실패시켜도 메인 body에 모든 finding이 남는지 확인한다.
6. T10-T14: feedback, rule 승인, 다음 review 적용, dashboard metric까지 한 사용자 흐름으로 확인한다. 전체 흐름의 최종 확인은 T14의 P1 gate에서 수행한다.
7. T15-T17: invalid `.hreviewer.yml`, nested `AGENTS.md`, 실패 GitHub Check를 각각 current head에서 확인한다. 각 항목은 소유 task에서 개별 확인하고 T18의 P2 gate에서 함께 회귀 확인한다.
8. T21: pause, synchronize, resume, incremental, full 명령 순서를 확인한다.

외부 fixture 생성, GitHub write, 유료 AI 호출, production migration과 feature flag 활성화는 각각 별도 운영 승인 후 실행한다.

## 16. 성공 지표

### 신뢰성

- review completion rate
- duplicate delivery와 duplicate review 비율
- superseded 이후 stale post 비율
- failure stage가 없는 terminal failure 수
- inline finding 보존율

### 리뷰 품질

- helpful rate
- false-positive rate
- suggestion apply rate
- known-defect recall
- cross-file miss
- structured review 유지율, 특히 large PR

### wedge와 유지

- repeat finding precision
- 30일·90일 recurrence rate
- 활성 personal rule 수와 rule별 helpful rate
- 첫 리뷰 완료율
- 두 번째·세 번째 PR 리뷰 재사용률

초기에는 목표 수치를 임의로 만들지 않고 T01과 T09에서 baseline을 수집한다. 단, 기존 wedge gate인 repeat false positive rate 20% 이하는 계속 강제한다.

## 17. 범위 분류

### Core

- T01-T14
- 신뢰성, 무료 체험, 피드백, 코치 분석, 승인 기반 개인 규칙

### Phase 2

- T15-T21
- 저장소 규칙, GitHub Checks, large PR chunking, 증분 리뷰와 명령 UX

### Approval-after

- `FREE_REVIEW_TRIAL_ENABLED=true` production 적용
- 외부 GitHub fixture write와 유료 AI 평가 실행
- webhook 관리 권한을 사용하는 failed delivery 자동 redelivery 운영
- production Prisma migration과 deployment

### Out of scope

- GitLab, Bitbucket, Azure DevOps, GitHub Enterprise Server 지원
- Jira, Linear, Slack 연동
- 50개 이상 lint·security 도구를 실행하는 자체 sandbox
- merge blocking, request changes, approve 자동화
- multi-repository knowledge base와 영구 code graph
- 조직, seat, SSO, audit log, 다중 사용자 repository ownership
- IDE extension과 CLI
- fix-all, CI 자동 수정, merge conflict 자동 해결
- review comment 대화형 `explain` 기능

Out of scope 기능은 P1 성공 지표가 확보되기 전 별도 task로 끌어오지 않는다. CLI는 두 번째·세 번째 PR 재사용률이 확인된 뒤 별도 제안서로 평가한다.

## 18. 구현 안티 패턴

- Inngest의 24시간 idempotency만으로 영구 중복 방지를 구현하지 않는다.
- webhook redelivery와 동일 PR head request를 같은 dedup key로 처리하지 않는다.
- GitHub post 성공 가능성이 있는 오류에서 무조건 무료 크레딧을 반환하지 않는다.
- inline comment가 source of truth가 되게 하지 않는다.
- `IssueResolutionStatus.IGNORED`를 사용자 피드백 의미로 재사용하지 않는다.
- false-positive 피드백 한 건으로 prompt suppression rule을 자동 활성화하지 않는다.
- guideline 전체를 예산 없이 prompt에 넣지 않는다.
- large PR 한 chunk 실패를 전체 markdown fallback으로 전파하지 않는다.
- dashboard에 분모가 없는 비율을 `0%`로 표시하지 않는다.

## 19. 문서 수명주기

- task 시작 시 선형 queue의 현재 행을 `NEXT -> IN_PROGRESS`로 바꾼다.
- task 완료 시 현재 행을 `COMPLETED`로 바꾸고 섹션 6.4에 변경 경로, migration·env, 자동 검증, 수동·외부 검증, 남은 위험과 다음 task를 기록한다.
- 완료 증거를 기록한 뒤에만 바로 다음 행을 `WAITING -> NEXT`로 바꾼다. 여러 task를 한 번에 `COMPLETED`로 표시하지 않는다.
- 구현 또는 검증이 중단되면 현재 행을 `BLOCKED`로 바꾸고 같은 완료 기록 표에 blocker와 재개 조건을 남긴다. blocker가 해소되기 전에는 다음 task를 열지 않는다.
- 각 phase의 마지막 task에서는 섹션 14의 release gate 결과도 같은 완료 기록에 포함한다.
- 구현 중 제품 결정이 바뀌면 관련 task, 상태 머신, 검증, Definition of Done을 함께 수정한다.
- T01-T21과 모든 release gate가 완료되면 상태를 `Implemented`로 변경한다.
- `Implemented`가 되는 같은 작업에서 이 파일을 `docs/archive/`로 이동한다.

## 20. Definition of Done

- T01-T21이 의존성 순서대로 완료되었다.
- 모든 task가 한 번에 하나씩 `NEXT -> IN_PROGRESS -> COMPLETED` 순서로 진행되었고 섹션 6.4에 task별 완료 증거가 있다.
- P0-P3 release gate가 각 phase의 마지막 task 완료 기록에 연결되어 있다.
- 각 Prisma 변경에 migration 파일이 존재한다.
- 모든 외부 post가 durable Review와 deterministic marker를 가진다.
- 중복, stale head, failure recovery, quota concurrency 회귀 테스트가 있다.
- 피드백에서 규칙 후보, 사용자 승인, 다음 리뷰, dashboard까지 루프가 연결된다.
- `.hreviewer.yml`, guideline, GitHub Checks가 exact head에서 bounded context로 동작한다.
- large PR의 부분 실패가 전체 structured 기능을 제거하지 않는다.
- incremental review가 이전 finding을 중복 게시하지 않는다.
- 필수 test, lint, typecheck, build가 통과한다.
- proposal 문서, task 완료 기록, phase release receipt가 Git index에 exact path로 추적된다.
- 외부·유료·production 작업의 승인과 실행 결과가 별도 비밀 없는 영수증으로 남는다.
- 완료 시 제안서가 `docs/archive/`로 이동한다.

## 21. 공식 비교·런타임 자료

CodeRabbit 비교:

- [Code review overview](https://docs.coderabbit.ai/guides/code-review-overview)
- [Auto review and incremental controls](https://docs.coderabbit.ai/configuration/auto-review)
- [Review commands](https://docs.coderabbit.ai/reference/review-commands)
- [Path instructions](https://docs.coderabbit.ai/configuration/path-instructions)
- [Knowledge base](https://docs.coderabbit.ai/knowledge-base)
- [Static analysis tools](https://docs.coderabbit.ai/tools/index)
- [GitHub Checks](https://docs.coderabbit.ai/tools/github-checks)
- [Pre-merge checks](https://docs.coderabbit.ai/pr-reviews/pre-merge-checks)
- [Dashboard metrics](https://docs.coderabbit.ai/guides/dashboard-metrics)
- [IDE and CLI reviews](https://docs.coderabbit.ai/overview/ide-cli-review)
- [Supported platforms](https://docs.coderabbit.ai/platforms/overview)

구현 semantics:

- [GitHub webhook delivery headers](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- [GitHub repository collaborator permissions](https://docs.github.com/en/rest/collaborators/collaborators)
- [Inngest event and function idempotency](https://www.inngest.com/docs/guides/handling-idempotency)
- [Inngest debounce](https://www.inngest.com/docs/guides/debounce)
- [Inngest cancelOn](https://www.inngest.com/docs/reference/typescript/v3/functions/cancel-on)
