# HReviewer 개인 리뷰 코치 P0 구현 상세 계획

> 상태: **T01-T08 완료 — T09 NEXT; generation target 결정 완료, lifecycle·품질 release gate 유지**
>
> 기준일: <code>2026-08-25</code>
>
> 코드 기준: <code>897ffec8cb64d3dc1c3071e8edd161210b0d336e</code>
>
> 재조정 기준: <code>2026-08-26 Asia/Seoul</code>. 직접 source bundle은 이 문서, 상위 로드맵(<code>SHA-256 777735cad6fb7bf62336eaaf154e3a61351c0936b8f944594b2e37c751d3c990</code>), 기존 RAG 제거 평가(<code>SHA-256 eabb894aa36a1d6bdeac72c8dd1cbad88788bda64ee3a8e69c4b90f2dbd72b0a</code>)다.
>
> candidate inventory는 <code>git ls-files -- app components features inngest lib prisma scripts package.json package-lock.json vitest.config.ts tsconfig.json next.config.ts eslint.config.mjs .gitignore</code> 결과를 ordinal 정렬하고 각 repository-relative path를 LF로 연결한 뒤 마지막 LF를 붙인 UTF-8 bytes다. T06 시작 commit에서 <code>228</code>개, <code>SHA-256 e8b0117fd649acb79445d2e5704649f15470f9c502fac6be2f7db57a00f8f5d9</code>이며 task 시작 시 같은 방식으로 다시 계산한다.
>
> 상위 문서: [HReviewer 개인 코드 리뷰 코치 실행 제안서](./hreviewer-personal-review-coach-roadmap.md)
>
> 범위: 상위 문서의 <code>T01-T09</code>. 제품 범위와 task 상태는 상위 문서가, P0의 코드 계약과 파일별 구현 순서는 이 문서가 우선한다. 따라서 상위 문서 P0 절의 예전 event field·migration command·후보 파일 목록과 이 문서가 다르면 이 문서의 최신 계약을 적용하며, 상위 문서의 상세 예를 별도 구현 source로 합성하지 않는다.

Windows PowerShell이 native process stdout을 재인코딩해 inventory hash를 바꾸지 않도록 다음 Node command를 anchor 계산 authority로 사용한다. 이 command는 Git stdout을 UTF-8로 직접 decode하고 JavaScript 기본 ordinal sort, LF join, final LF 순서로 계산하며 기준 commit에서 위 count와 hash를 출력해야 한다.

~~~powershell
node.exe -e "const {execFileSync}=require('node:child_process');const {createHash}=require('node:crypto');const args=['-c','core.quotepath=false','ls-files','--','app','components','features','inngest','lib','prisma','scripts','package.json','package-lock.json','vitest.config.ts','tsconfig.json','next.config.ts','eslint.config.mjs','.gitignore'];const paths=execFileSync('git',args).toString('utf8').trimEnd().split(/\r?\n/).sort();const inventory=Buffer.from(paths.join('\n')+'\n','utf8');console.log(JSON.stringify({count:paths.length,sha256:createHash('sha256').update(inventory).digest('hex')}));"
if ($LASTEXITCODE -ne 0) { throw "Failed to calculate the P0 candidate inventory anchor" }
~~~

## 1. 이 문서를 사용하는 방법

P0를 한 번에 구현하지 않는다. 상위 문서의 queue에 따라 <code>T01</code>부터 <code>T09</code>까지 한 task씩 수행한다. 다만 각 task의 검증·commit 단위가 곧 production 배포 단위라는 뜻은 아니다. T02의 enum migration과 T03/T07의 Inngest event·step 결과 변경은 구버전 runtime과 동시 실행할 수 없으므로, T01-T09 중간 산출물은 섹션 6.6의 cutover gate를 통과하기 전 production에 승격하지 않는다.

각 task를 시작할 때:

1. <code>git rev-parse HEAD</code>가 이 문서의 코드 기준과 다른지 확인한다. 다르면 현재 코드를 source of truth로 최소 영향 재검증한 뒤 시작한다.
2. 상위 문서의 현재 task를 <code>NEXT -> IN_PROGRESS</code>로 바꾼다.
3. <code>docs/conventions/</code> 전체와 이 문서의 공통 불변식, 해당 task 절을 다시 읽는다.
4. 해당 task의 “수정 파일”만 변경한다. 후속 task의 동작을 선반영하지 않는다.
5. task 전용 테스트를 먼저 통과시킨 뒤 공통 검증을 수행한다.
6. 상위 문서의 완료 기록을 채우고 현재 task를 <code>COMPLETED</code>, 바로 다음 task만 <code>NEXT</code>로 바꾼다.

수정 대상 TypeScript/TSX에는 같은 task에서 현재 필수 규약을 적용한다. 새로 만들거나 시그니처를 바꾸는 export 함수는 반환 타입을 명시하고, 위치 인자가 3개 이상이면 입력 객체로 묶으며, 수정하는 컴포넌트의 generic <code>Props</code> 이름은 <code>[Component]Props</code>로 구체화한다. 기존 호환성 때문에 규약 위반 시그니처를 그대로 둘 필요가 있으면 조용히 예외를 만들지 말고 adapter owner와 제거 task를 이 문서에 먼저 기록한다.

현재 repository의 <code>.gitignore</code>는 <code>/docs/</code>를 무시하고 있으며, 이 구현 계획과 상위 로드맵은 아직 Git index에 없다. 따라서 T01의 첫 변경에는 두 문서만 경로를 정확히 지정해 추적하는 다음 durability preflight를 포함한다. <code>docs/</code> 전체를 force-add하거나 ignore 규칙을 넓게 해제하지 않는다.

~~~powershell
git add -f -- "docs/proposals/hreviewer-personal-review-coach-p0-implementation-plan.md" "docs/proposals/hreviewer-personal-review-coach-roadmap.md"
if ($LASTEXITCODE -ne 0) { throw "Failed to stage the P0 source bundle" }

git ls-files --error-unmatch -- "docs/proposals/hreviewer-personal-review-coach-p0-implementation-plan.md" "docs/proposals/hreviewer-personal-review-coach-roadmap.md"
if ($LASTEXITCODE -ne 0) { throw "The P0 source bundle is not tracked" }
~~~

T09에서 새 release receipt를 만든 직후에도 그 한 경로만 <code>git add -f -- "docs/evaluations/p0-personal-review-coach-release-receipt.md"</code>로 추가하고 <code>git ls-files --error-unmatch</code>로 추적 여부를 확인한다. T01 이후 이미 추적된 두 proposal 문서의 상태·완료 기록 변경은 일반 <code>git add</code>로 stage한다.

이 문서의 TypeScript와 Prisma 조각은 목표 계약이다. worker의 긴 AI 생성 본문을 그대로 복사하라는 뜻은 아니며, 함수명·입출력·상태 전이·side effect 순서는 그대로 지켜야 한다.

## 2. 현재 코드 기준선

| 현재 surface | 현재 owner와 동작 | P0에서 바뀌는 책임 |
| --- | --- | --- |
| GitHub webhook | <code>app/api/webhooks/github/route.ts</code>가 signature, payload, Prisma, GitHub, queue를 모두 처리 | T01에서 HTTP adapter와 주입 가능한 handler를 분리하고 T04에서 delivery lease를 감싼다 |
| 자동 review 요청 | <code>features/ai/actions/review-pull-request.ts</code>가 plan 확인, PR diff preflight, Inngest send, 사용되지 않는 <code>reviewCounts</code> 증가를 수행 | T03에서 <code>createReviewRequest()</code>로 통합하고 비원자적 legacy count 증가는 제거한다 |
| summary 요청 | <code>features/ai/actions/generate-pr-summary.ts</code>가 별도 Inngest event만 전송 | T03에서 같은 coordinator를 사용한다 |
| review worker | <code>inngest/functions/review.ts</code>가 GitHub 게시 후 마지막 step에서 Review를 생성 | T03에서 기존 Review를 갱신하고 T07에서 DB-before-post로 뒤집는다 |
| summary worker | <code>inngest/functions/summary.ts</code>가 GitHub comment 후 Review를 생성 | T03에서 기존 Review를 갱신하고 T07에서 DB-before-post와 marker를 적용한다 |
| Review 상태 | <code>Review.status String</code>, 소문자 <code>pending/completed/failed</code> | T02에서 Prisma enum 상태 머신으로 바꾼다 |
| webhook dedup | 없음. <code>X-GitHub-Delivery</code>를 읽지 않음 | T04에서 DB unique key와 lease를 사용한다 |
| 수동 command | parser는 <code>review</code>를 반환하지만 route는 <code>summary</code>만 dispatch | T05에서 권한 검사 후 두 command를 모두 dispatch한다 |
| stale head 제어 | 최초 fetch의 head를 사용하고 게시 직전 재확인하지 않음 | T06에서 debounce, supersede, cancelOn, head guard를 함께 적용한다 |
| PR metadata helper | <code>lib/github/github.ts</code>의 private <code>PullRequestSnapshot</code>은 stable diff 응답 shape이고, public <code>getPullRequestHeadInfo()</code>는 위치 인자 4개를 받으며 <code>features/suggestion/actions/index.ts</code>가 유일한 현재 consumer | T03에서 request용 snapshot API와 기존 private type 이름을 분리하고, T06에서 head helper와 유일한 consumer를 객체 입력으로 함께 migration한다 |
| worker token 전달 | 두 worker의 <code>fetch-pr-data</code> step 결과가 OAuth token을 반환해 이후 step으로 전달 | T03에서 durable result의 token을 제거하고 각 GitHub step이 persisted author binding으로 다시 조회한다 |
| 이전 review reconciliation | issue·native suggestion helper가 repository/PR/head만으로 최신 Review를 찾아 같은 head의 SUMMARY가 FULL_REVIEW를 가릴 수 있음 | T03에서 두 selector를 FULL_REVIEW로 제한한다 |
| GitHub 게시 복구 | marker와 artifact lookup이 없고 inline issue 실패 시 정보가 일부 유실 | T07에서 persisted body, marker, lookup, stale reconciliation을 추가한다 |
| Free review | <code>reviewsPerRepo: 0</code> | T08에서 flag 뒤 계정 단위 5회 체험으로 바꾼다 |
| repository disconnect | 단일·전체 연결 해제가 Review 상태 guard 없이 webhook 삭제 후 Repository를 cascade delete하고 GitHub 오류를 <code>false</code>로 삼킴 | T08에서 lock·active execution guard·bounded webhook mutation·보상을 가진 단일 use case로 통합한다 |
| 모델 평가 | 영수증은 이전 verifier와 실행되지 않은 A/C/F를 기록 | T09에서 generation을 <code>gemini-3.1-flash-lite</code>로 전환하고 세 role binding과 ground-truth corpus를 다시 평가한다 |
| 테스트 | Vitest가 <code>**/*.test.ts</code>만 수집하고 기본 환경은 node | T01에서 TSX도 수집하되 node 기본값은 유지한다 |

현재 보존해야 하는 동작:

- invalid signature에서는 DB, GitHub, Inngest side effect가 0회다.
- <code>synchronize</code>의 HReviewer 적용 commit 및 native suggestion commit skip은 유지한다.
- <code>synchronize</code>의 suggestion·issue resolution reconciliation은 유지한다.
- merged PR은 남은 <code>ReviewIssue.PENDING</code>을 <code>IGNORED</code>로 수렴시킨다.
- structured generation 실패 시 markdown fallback을 시도한다.
- verification과 repeat detection의 fail-open 정책을 유지한다.
- <code>Repository.githubId @unique</code>와 개인 소유 모델은 바꾸지 않는다.

## 3. 목표 실행 구조

~~~text
GitHub webhook
  -> route.ts: raw body/headers 수집
  -> github-webhook-handler.ts: signature 검증
  -> GithubWebhookDelivery lease 획득
  -> event별 handler
      -> automatic/command/summary
      -> createReviewRequest()
          -> exact PR snapshot
          -> semantic requestKey
          -> Review(PENDING) + 선택적 trial RESERVED
          -> typed Inngest event
              -> automatic: 15s debounce scheduler
              -> manual/summary: direct worker
  -> worker
      -> Review claim + current head guard
      -> fetch/generate/verify/repeat
      -> Review body/issues/suggestions transaction 저장
      -> Review(POSTING)
      -> current head/status 재확인
      -> marker lookup
      -> GitHub main/inline/verification post
      -> Review(COMPLETED) + trial CONSUMED
  -> onFailure 또는 10분 cron
      -> marker 확인
      -> COMPLETED, retryable FAILED, SUPERSEDED 중 하나로 수렴
~~~

중복 방지는 네 층이다.

| 층 | key | 지속 시간 | 막는 것 |
| --- | --- | --- | --- |
| transport delivery | <code>GithubWebhookDelivery.deliveryId</code> | DB row가 존재하는 동안 | 동일 GitHub delivery의 handler 재실행 |
| semantic request | <code>Review.requestKey</code> | DB row가 존재하는 동안 | delivery가 달라도 동일 PR head와 동일 의미의 review/summary 중복 |
| Inngest event ID | event 종류 + Review ID + attempt | Inngest가 제공하는 24시간 | 전송 재시도의 보조 중복 방지 |
| GitHub artifact marker | Review ID + part | GitHub artifact가 존재하는 동안 | timeout·프로세스 종료 뒤 같은 comment/review 재게시 |

Inngest event ID는 24시간 보조 수단이며 DB unique key를 대체하지 않는다.

## 4. P0 공통 불변식

1. signature 검증 전에는 delivery row를 포함해 어떤 DB write도 하지 않는다.
2. verified webhook의 payload 원문, signature, OAuth token은 DB와 로그에 저장하지 않는다. OAuth token은 Inngest event나 내구성 step의 입력·반환값에도 포함하지 않으며, GitHub 호출이 필요한 각 step 안에서 persisted <code>githubAuthorId</code>와 일치하는 Account로 다시 조회해 사용한 뒤 반환하지 않는다.
3. Review worker를 부르기 전에 정확한 <code>headSha</code>를 가진 Review row가 존재해야 한다.
4. 새 request 생성과 retry는 같은 <code>features/review/lib/review-request.ts</code> use case를 통과한다.
5. worker는 Review를 새로 만들지 않고 event의 <code>reviewId</code>만 갱신한다.
6. GitHub main post 전에 wrapper-free canonical review content, issues, suggestions가 DB transaction으로 보존되어야 한다. 제목·marker·generated footer를 포함한 실제 outbound body는 이 persisted content에서 공용 builder로 결정적으로 재구성한다.
7. 모든 외부 body에는 deterministic marker가 있어야 한다.
8. generation 전과 각 GitHub post 직전에 Review 상태와 current PR head를 확인한다.
9. <code>cancelOn</code>과 concurrency는 보조 제어다. correctness는 DB CAS와 head guard가 보장한다.
10. GitHub post 결과가 모호하면 무료 크레딧을 즉시 반환하지 않는다. marker 확인 후 소비 또는 반환한다.
11. terminal Review는 <code>COMPLETED</code>, <code>FAILED</code>, <code>SUPERSEDED</code> 중 하나이며 FAILED에는 <code>failureStage</code>와 안전한 <code>failureMessage</code>가 있다.
12. <code>COMPLETED</code>만 이후 증분 review baseline 후보가 된다.
13. Review worker와 reconciler의 모든 상태 write와 외부 post 직전 guard는 event의 <code>attempt</code>, 현재 execution lease token, lease owner를 함께 fence로 사용한다.
14. webhook delivery가 만든 exact <code>requestKey</code>는 delivery lease CAS와 Review 생성·기존 Review 연결을 같은 DB transaction에서 확정한다.
15. closed 또는 merged PR은 Review·event·credit를 만들지 않으며, 실행 중 PR이 닫히거나 merge되면 외부 post 없이 SUPERSEDED로 수렴한다.
16. main review/comment body만 남아도 accepted issue와 suggestion의 수정 정보가 복구 가능해야 한다. native inline·fallback 성공 여부가 정보량을 줄이면 안 된다.
17. Inngest dispatch 결과를 기록하는 producer는 exact attempt와 QUEUE lease fence를 사용한다. event가 먼저 worker를 깨워 fence를 잃었다면 현재 WORKER 또는 이후 상태를 사실로 받아들이고, 늦은 QUEUED checkpoint·dispatch 실패·credit 반환으로 덮어쓰지 않는다.
18. SUMMARY와 FULL_REVIEW가 같은 head SHA를 공유해도 기존 FULL_REVIEW를 찾는 issue·suggestion reconciliation selector는 <code>reviewType=FULL_REVIEW</code>를 명시해 더 늦은 SUMMARY에 가려지지 않는다.
19. Repository cascade delete는 PENDING/RUNNING/POSTING, RECONCILER lease, RESERVED credit가 있는 Review를 지우지 않는다. 연결 해제는 exact repository row lock과 Review guard를 통과해야 하며 GitHub webhook 삭제 실패나 보상 실패를 성공으로 보고하지 않는다.

Review 실행 lifecycle은 repository/token과 exact PR snapshot 확인이 성공해 request row를 만든 시점부터 시작한다. 그 전의 lookup 실패는 AI를 호출하거나 불완전한 Review를 만들지 않고 안전한 request 오류와 FAILED delivery로 남긴다. Review row가 생긴 뒤의 모든 terminal failure에는 11번 불변식을 적용한다.

## 5. 영속 모델과 migration 계약

### 5.1 enum 의미

| enum | 값 | 의미 |
| --- | --- | --- |
| <code>ReviewStatus</code> | <code>PENDING</code>, <code>RUNNING</code>, <code>POSTING</code>, <code>COMPLETED</code>, <code>FAILED</code>, <code>SUPERSEDED</code> | Review 실행 상태 |
| <code>ReviewRequestSource</code> | <code>LEGACY</code>, <code>AUTOMATIC</code>, <code>COMMAND</code> | 최초 요청의 출처. retry는 원 요청 출처를 바꾸지 않는다 |
| <code>ReviewMode</code> | <code>FULL</code>, <code>INCREMENTAL</code> | P0는 FULL만 만들고 P3가 INCREMENTAL을 사용한다 |
| <code>ReviewFailureStage</code> | <code>LEGACY</code>, <code>QUEUE</code>, <code>FETCH</code>, <code>GENERATE</code>, <code>VERIFY</code>, <code>PERSIST</code>, <code>POST</code>, <code>RECONCILE</code> | 실패한 책임 단계 |
| <code>ReviewExecutionStage</code> | <code>QUEUED</code>, <code>FETCHED</code>, <code>GENERATED</code>, <code>VERIFIED</code>, <code>PERSISTED</code>, <code>MAIN_POSTED</code>, <code>INLINE_POSTED</code>, <code>VERIFICATION_POSTED</code> | 마지막으로 완료된 복구 checkpoint |
| <code>ReviewExecutionLeaseOwner</code> | <code>QUEUE</code>, <code>WORKER</code>, <code>RECONCILER</code> | 현재 lease token을 사용할 수 있는 실행 주체 |
| <code>TrialCreditState</code> | <code>NOT_APPLICABLE</code>, <code>RESERVED</code>, <code>CONSUMED</code>, <code>RELEASED</code> | 무료 전체 review 한 건의 credit 상태 |
| <code>GithubWebhookDeliveryStatus</code> | <code>PROCESSING</code>, <code>PROCESSED</code>, <code>FAILED</code> | transport delivery 처리 상태 |

<code>requestSource</code>에 RETRY를 넣지 않는다. retry는 같은 Review의 <code>attemptCount</code>를 증가시키며 최초 요청 출처를 보존한다.

### 5.2 Prisma 목표 조각

<code>prisma/schema.prisma</code>의 관련 부분을 다음 계약으로 맞춘다.

~~~prisma
enum ReviewStatus {
  PENDING
  RUNNING
  POSTING
  COMPLETED
  FAILED
  SUPERSEDED
}

enum ReviewRequestSource {
  LEGACY
  AUTOMATIC
  COMMAND
}

enum ReviewMode {
  FULL
  INCREMENTAL
}

enum ReviewFailureStage {
  LEGACY
  QUEUE
  FETCH
  GENERATE
  VERIFY
  PERSIST
  POST
  RECONCILE
}

enum ReviewExecutionStage {
  QUEUED
  FETCHED
  GENERATED
  VERIFIED
  PERSISTED
  MAIN_POSTED
  INLINE_POSTED
  VERIFICATION_POSTED
}

enum ReviewExecutionLeaseOwner {
  QUEUE
  WORKER
  RECONCILER
}

enum TrialCreditState {
  NOT_APPLICABLE
  RESERVED
  CONSUMED
  RELEASED
}

enum GithubWebhookDeliveryStatus {
  PROCESSING
  PROCESSED
  FAILED
}

model Review {
  id           String     @id @default(cuid())
  repositoryId String
  repository   Repository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  prNumber     Int
  prTitle      String
  prUrl        String
  review       String     @db.Text
  reviewData   Json?
  langCode     String     @default("en")
  maxSuggestions Int?
  verificationEnabled Boolean @default(false)
  reviewType   ReviewType @default(FULL_REVIEW)
  headSha      String?

  requestKey       String              @unique @db.VarChar(255)
  requestSource    ReviewRequestSource @default(LEGACY)
  reviewMode       ReviewMode          @default(FULL)
  status           ReviewStatus        @default(PENDING)
  failureStage     ReviewFailureStage?
  failureMessage   String?             @db.VarChar(1000)
  lastCompletedStage ReviewExecutionStage?
  attemptCount     Int                 @default(1)
  executionLeaseExpiresAt DateTime?
  executionLeaseToken     String?      @db.VarChar(64)
  executionLeaseOwner     ReviewExecutionLeaseOwner?

  githubMainReviewId String?   @db.VarChar(64)
  githubMainPostedAt DateTime?
  githubAuthorId     String?   @db.VarChar(64)
  artifactLookupMissedAt DateTime?
  trialCreditState   TrialCreditState @default(NOT_APPLICABLE)

  suggestions Suggestion[]
  issues      ReviewIssue[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([repositoryId])
  @@index([repositoryId, prNumber, headSha])
  @@index([status, executionLeaseExpiresAt])
  @@map("review")
}

model GithubWebhookDelivery {
  id            String @id @default(cuid())
  deliveryId    String @unique @db.VarChar(64)
  payloadSha256 String @db.Char(64)
  event         String @db.VarChar(64)
  action        String? @db.VarChar(64)
  requestKey    String? @db.VarChar(255)

  status         GithubWebhookDeliveryStatus @default(PROCESSING)
  attemptCount   Int @default(1)
  leaseToken     String? @db.VarChar(64)
  leaseExpiresAt DateTime?

  lastErrorCode    String? @db.VarChar(64)
  lastErrorMessage String? @db.VarChar(1000)
  processedAt      DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([status, leaseExpiresAt])
  @@map("github_webhook_delivery")
}

model UserUsage {
  id                     String @id @default(cuid())
  userId                 String @unique
  user                   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  repositoryCount        Int @default(0)
  reviewCounts           Json @default("{}")
  trialReviewCreditsUsed Int @default(0)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  @@map("user_usage")
}
~~~

<code>headSha</code>와 <code>githubAuthorId</code>는 historical row 때문에 schema에서는 nullable을 유지한다. <code>createReviewRequest()</code>가 만드는 신규 row에는 non-empty SHA와 요청 시점의 GitHub <code>Account.accountId</code>를 런타임에서 강제한다. historical null row는 trusted marker 복구와 재게시 대상에서 제외하고 안전한 RECONCILE 실패로 남긴다.

### 5.3 request key

~~~text
{reviewType}:{reviewMode}:{repositoryId}:{prNumber}:{headSha}:{nonce}
~~~

- 자동 review, P0의 <code>@hreviewer review</code>, summary: <code>nonce=default</code>
- P3의 명시적 <code>review full</code>: GitHub comment ID
- retry: request key를 바꾸지 않음
- migration으로 backfill한 기존 row만 <code>legacy:{reviewId}</code> 예외를 사용

<code>ReviewType</code>이 SUMMARY와 FULL_REVIEW를 구분하므로 summary의 <code>reviewMode</code>는 FULL이다.

### 5.4 migration 순서

T02에서 다음 순서를 지킨다.

1. production과 같은 데이터 snapshot에서 현재 status를 조회한다.

~~~sql
SELECT status, COUNT(*)
FROM review
GROUP BY status
ORDER BY status;
~~~

2. <code>pending</code>, <code>completed</code>, <code>failed</code> 이외의 값이 있으면 migration을 중단하는 <code>DO</code> guard를 migration SQL 맨 앞에 둔다.
3. 새 enum과 nullable/default column을 추가한다.
4. 기존 row를 다음처럼 backfill한다.

| 기존 값 | 새 값 |
| --- | --- |
| <code>pending</code> | <code>PENDING</code> |
| <code>completed</code> | <code>COMPLETED</code> |
| <code>failed</code> | <code>FAILED</code>, <code>failureStage=LEGACY</code>, 안전한 고정 failureMessage |
| 모든 기존 row | <code>requestKey=legacy:{id}</code>, <code>requestSource=LEGACY</code>, <code>reviewMode=FULL</code>, <code>attemptCount=1</code>, <code>trialCreditState=NOT_APPLICABLE</code>; historical <code>githubAuthorId</code>와 lease fencing field는 null |

5. status default를 제거한 뒤 <code>UPPER(status)::"ReviewStatus"</code>로 type을 바꾸고 default를 <code>PENDING</code>으로 설정한다.
6. backfill 완료 후 <code>requestKey</code>를 NOT NULL과 UNIQUE로 바꾼다.
7. delivery table과 index를 만든다.
8. <code>UserUsage.trialReviewCreditsUsed</code>를 NOT NULL DEFAULT 0으로 추가한다.
9. T03 전에도 T02가 독립적으로 build 가능하도록 현재 세 <code>review.create</code> 지점에 Node <code>crypto.randomUUID()</code>로 만든 <code>legacy-runtime:{uuid}</code> request key와 나머지 필수 실행 필드를 명시한다. 이 값은 migration backfill용 <code>legacy:{id}</code>와 구분되는 임시 호환 key다.
10. 현재 실패 기록의 raw <code>error.message</code> 저장을 중단하고 <code>FAILED/LEGACY</code>와 안전한 고정 메시지만 저장한다.
11. 생성된 SQL을 사람이 검토한 뒤에만 local DB에 적용한다.

T03에서는 위 <code>legacy-runtime:</code> 호환 write를 모두 제거하고 semantic request key를 유일한 신규 row 생성 경로로 만든다. 이 임시 write를 빠뜨리면 T02의 NOT NULL 전환 직후 현재 action과 두 worker가 typecheck 또는 runtime에서 실패하므로, T02와 T03 각각에서 부재·존재 검사를 수행한다.

명령:

~~~powershell
npx.cmd prisma migrate dev --name add_review_execution_state --create-only
# 생성된 migration.sql의 guard, backfill, enum cast, 제약 순서를 검토·수정한다.
npx.cmd prisma migrate dev
npx.cmd prisma validate
npx.cmd prisma generate
npx.cmd tsc --noEmit
~~~

Prisma가 생성한 status cast가 guard와 backfill 순서를 보장하지 않으면 migration SQL을 수정한다. migration 파일명 timestamp는 Prisma가 생성한 값을 사용하며 수동으로 예측하지 않는다.

## 6. 공용 TypeScript 계약

### 6.1 typed Inngest events

T03에서 <code>inngest/events.ts</code>를 만들고 <code>inngest/client.ts</code>가 <code>EventSchemas</code>를 사용하게 한다.

~~~ts
import { EventSchemas, Inngest } from "inngest";

type ReviewRunEventData = {
  reviewId: string;
  attempt: number;
  debounceKey: string;
};

type SummaryRunEventData = Pick<ReviewRunEventData, "reviewId" | "attempt">;

export type SupersededReviewEventData = Pick<
  ReviewRunEventData,
  "reviewId" | "attempt"
>;

export type HReviewerEvents = {
  "pr.review.auto-requested": { data: ReviewRunEventData };
  "pr.review.requested": { data: ReviewRunEventData };
  "pr.review.superseded": { data: SupersededReviewEventData };
  "pr.summary.requested": { data: SummaryRunEventData };
};

export const inngest = new Inngest({
  id: "hreviewer",
  schemas: new EventSchemas().fromRecord<HReviewerEvents>(),
});
~~~

event ID:

~~~text
hreviewer:review-auto:{reviewId}:{attempt}
hreviewer:review-run:{reviewId}:{attempt}
hreviewer:review-cancel:{reviewId}:{attempt}
hreviewer:summary-run:{reviewId}:{attempt}
~~~

<code>ReviewRunEventData.debounceKey</code>는 repository lookup 뒤의 immutable DB ID와 PR 번호로 <code>{repositoryId}:{prNumber}</code>를 계산한다. head SHA, owner/name, request source는 넣지 않는다. 따라서 같은 PR의 자동 head A/B와 수동 FULL_REVIEW는 같은 concurrency group을 사용하고, 서로 다른 repository row 또는 PR은 분리된다. 이 값은 T03부터 자동·수동 FULL_REVIEW event에 동일하게 저장하되 T06 전까지 자동 요청은 DIRECT로 dispatch하며, SUMMARY event에는 넣지 않는다.

같은 Inngest function/step ID는 배포가 바뀌어도 기존 run의 memoized step 결과를 재사용할 수 있다. T03의 event payload와 T07의 step 순서·반환 shape 변경을 step ID 보존만으로 호환 가능하다고 간주하지 않는다. 이 P0는 섹션 6.6의 intake 중지와 기존 <code>generate-review</code>/<code>generate-summary</code> queued·running run 0개 증거를 필수 cutover 전략으로 고정한다. 0개를 증명할 수 없으면 배포하지 않고 별도 versioned function/event migration 계획을 먼저 만든다.

event는 실행 identity를 중복 저장하는 source가 아니다. worker는 <code>reviewId</code>와 <code>attempt</code>로 Review를 claim한 뒤 repository owner/name/user, PR number/head, language, maxSuggestions, verificationEnabled, githubAuthorId를 Review와 Repository relation에서 읽는다. <code>debounceKey</code>는 scheduler grouping 힌트일 뿐 worker의 DB/GitHub identity에 사용하지 않는다. retry도 persisted option을 재사용하며 event payload의 owner/repo/user/head/config를 신뢰하는 우회 경로를 만들지 않는다.

### 6.2 review request use case

최종 public contract는 다음과 같다.

~~~ts
import type { GithubWebhookTransportBinding } from "@/lib/github/github-webhook-delivery";

export type CreateReviewRequestInput = {
  owner: string;
  repo: string;
  prNumber: number;
  reviewType: "FULL_REVIEW" | "SUMMARY";
  reviewMode: "FULL";
  requestSource: "AUTOMATIC" | "COMMAND";
  nonce?: string;
  dispatchMode: "DIRECT" | "DEBOUNCED";
  transportBinding?: GithubWebhookTransportBinding;
};

export type CreateReviewRequestResult =
  | {
      kind: "created";
      reviewId: string;
      requestKey: string;
      status: ReviewStatus;
    }
  | {
      kind: "existing";
      reviewId: string;
      requestKey: string;
      status: ReviewStatus;
    }
  | {
      kind: "dispatch-failed";
      reviewId: string;
      requestKey: string;
      status: "FAILED";
      failureStage: "QUEUE" | "POST" | "RECONCILE";
      message: string;
    }
  | {
      kind: "rejected";
      reason: "PLAN_RESTRICTED" | "TRIAL_EXHAUSTED" | "PR_NOT_REVIEWABLE";
      message: string;
    };

export async function createReviewRequest(
  input: CreateReviewRequestInput,
  dependencies?: ReviewRequestDependencies,
): Promise<CreateReviewRequestResult>;

export async function retryReviewRequest(
  reviewId: string,
  dependencies?: ReviewRequestDependencies,
): Promise<CreateReviewRequestResult>;

export async function resumeReviewRequest(
  requestKey: string,
  dependencies?: ReviewRequestDependencies,
): Promise<CreateReviewRequestResult>;
~~~

<code>dispatch-failed</code>는 send promise가 reject되었다는 사실만이 아니라 producer가 exact queue fence로 실패 보상을 먼저 commit해, 이후 도착할 같은 attempt event가 PENDING claim을 할 수 없게 만든 결과다. 최초 생성과 일반 pre-post retry는 <code>failureStage=QUEUE</code>이고, T08의 POST/RECONCILE ambiguity retry는 marker 확인을 보존하기 위해 원래 stage로 복원할 수 있다. send promise가 reject되어도 worker claim이나 supersede 같은 적법한 전이가 먼저 fence를 회전했다면 이 variant를 반환하지 않는다.

두 AI action의 최종 입력도 위치 인자 세 개를 유지하지 않고 <code>features/ai/types/index.ts</code>가 소유하는 객체로 통일한다.

~~~ts
import type { GithubWebhookTransportBinding } from "@/lib/github/github-webhook-delivery";

export type PullRequestIdentityInput = {
  owner: string;
  repo: string;
  prNumber: number;
  transportBinding?: GithubWebhookTransportBinding;
};

export type ReviewPullRequestInput = PullRequestIdentityInput & {
  requestSource: "AUTOMATIC" | "COMMAND";
};

export async function reviewPullRequest(
  input: ReviewPullRequestInput,
): Promise<ReviewPullRequestResult>;

export async function generatePRSummary(
  input: PullRequestIdentityInput,
): Promise<GeneratePRSummaryResult>;
~~~

<code>GithubWebhookTransportBinding</code>은 T04부터 <code>features/ai/types/index.ts</code>가 type-only import해 두 action의 객체 입력에 선택적으로 전달한다. T01의 route-private handler dependency도 같은 객체 shape를 받는다. T03은 default composition과 handler test를 함께 수정해 positional wrapper를 제거하며, T04는 default composition이 binding을 두 action을 거쳐 coordinator까지 전달하는지 고정하고 세 위치 인자를 받는 compatibility overload나 binding 무시 branch를 남기지 않는다. 외부 결과의 top-level <code>success</code>, <code>message</code>, <code>reason</code> contract는 아래 규칙대로 유지한다.

위 조각은 P0 최종 shape다. T03의 최초 <code>CreateReviewRequestInput</code>에는 아직 owner helper가 없는 <code>transportBinding</code>을 넣지 않고, T04가 delivery helper와 request coordinator를 같은 task에서 수정하며 이 optional field와 atomic binding을 추가한다. T04 이후 binding을 받았는데 무시하는 compatibility branch는 허용하지 않는다.

<code>ReviewRequestDependencies</code>는 Prisma transaction, repository/token lookup, PR snapshot, language lookup, Inngest send, clock을 주입한다. production 기본값은 같은 파일 하단의 composition에서 만든다. 테스트는 전역 module mock 대신 이 port를 우선 사용한다.

<code>reviewPullRequest()</code>와 <code>generatePRSummary()</code>의 기존 top-level <code>success</code>, <code>message</code>, <code>reason</code> 필드는 유지한다. 다만 route-private handler가 delivery와 semantic request를 연결할 수 있도록 Review를 만들거나 찾은 결과에는 직렬화하지 않는 내부 metadata인 <code>reviewId</code>, <code>requestKey</code>, <code>status</code>, 선택적 <code>failureStage</code>를 함께 전달한다. HTTP response body에는 이 metadata를 노출하지 않는다.

action과 webhook은 <code>existing</code>을 무조건 “queued” 성공으로 바꾸지 않는다. 문자열 비교가 아니라 result kind/status metadata로 다음처럼 번역한다.

| coordinator 결과 | public 결과 | webhook delivery |
| --- | --- | --- |
| created/existing PENDING, RUNNING, POSTING | 성공. queued 또는 already in progress라는 사실 기반 메시지 | PROCESSED |
| created/existing COMPLETED | 성공. 이미 완료되었다는 사실 기반 메시지 | PROCESSED |
| created/existing FAILED | 실패. 안전한 retry 안내와 <code>review_failed</code> | PROCESSED |
| created/existing SUPERSEDED | 실패. 최신 head 요청 안내와 <code>review_superseded</code> | PROCESSED |
| rejected PLAN_RESTRICTED/TRIAL_EXHAUSTED/PR_NOT_REVIEWABLE | 실패. 각각 <code>plan_restricted</code>/<code>trial_exhausted</code>/<code>pr_not_reviewable</code> | PROCESSED |
| dispatch-failed 또는 운영 예외 | 실패. <code>internal_error</code>와 내부 metadata | FAILED/500 |

lease 상수는 <code>features/review/constants/index.ts</code>가 소유한다.

~~~ts
export const REVIEW_QUEUE_LEASE_MS = 30 * 60 * 1000;
export const REVIEW_EXECUTION_LEASE_MS = 15 * 60 * 1000;
export const GITHUB_POST_TIMEOUT_MS = 60 * 1000;
export const REVIEW_ARTIFACT_ABSENCE_GRACE_MS = 5 * 60 * 1000;
~~~

T02는 상태 claim과 만료 fencing에 필요한 <code>REVIEW_EXECUTION_LEASE_MS</code>를 먼저 추가한다. T03은 request queue가 생길 때 <code>REVIEW_QUEUE_LEASE_MS</code>를 추가하고, GitHub timeout과 absence grace 상수는 그 소비자가 생기는 T07에서 같은 파일에 추가한다.

PENDING row 생성 시 QUEUE owner의 token과 queue lease를 반드시 설정한다. worker claim은 token을 새 WORKER token으로 회전하고, 각 장기 외부 단계 직전에는 exact token으로 execution lease를 갱신한다. COMPLETED와 일반 FAILED·SUPERSEDED 전이에서는 lease token/owner/expiry를 모두 null로 지운다. T07부터 marker ambiguity가 남은 FAILED·SUPERSEDED만 RECONCILER owner의 새 token으로 같은 column을 due lease로 다시 획득할 수 있다. 이렇게 해야 T07 reconciler가 queue 전송 뒤 실행되지 않은 PENDING도 회수하고 terminal ambiguity를 중복 조회 없이 수렴시키며, lease가 만료된 이전 worker가 뒤늦게 post하거나 완료 상태를 덮어쓰지 못한다.

생성 순서:

1. repository와 GitHub access token, 그 token의 non-empty <code>Account.accountId</code>를 함께 찾는다.
2. <code>getPullRequestSnapshot()</code> 한 번으로 title, URL, current head SHA, state, merged를 얻는다. 전체 diff는 worker가 가져온다. <code>state !== "open"</code> 또는 <code>merged=true</code>면 <code>PR_NOT_REVIEWABLE</code>로 종료하고 Review·event·credit를 만들지 않는다.
3. request key를 계산한다.
4. T08 이전에는 Review create, T08 이후에는 Review create와 credit reservation을 하나의 serializable transaction으로 수행한다. 현재 schema에서 <code>Review.review</code>는 필수이므로 신규 PENDING row는 snapshot의 title·URL·head SHA, <code>githubAuthorId</code>, 요청 시점의 <code>langCode</code>/<code>maxSuggestions</code>/<code>verificationEnabled</code>와 함께 <code>review: ""</code>를 명시하고 QUEUE token/owner/expiry를 기록한다. <code>transportBinding</code>이 있으면 같은 transaction 안에서 delivery row의 ID, PROCESSING, lease token, null 또는 동일 requestKey를 CAS해 exact requestKey를 먼저 결합한다. CAS가 1이 아니면 transaction 전체를 rollback한다. 빈 문자열은 생성 전 placeholder일 뿐이며 UI는 COMPLETED 전 body로 렌더링하지 않는다.
5. unique 충돌이면 기존 Review를 읽고, transport binding이 있으면 별도 짧은 transaction에서 같은 lease CAS로 그 exact requestKey를 결합한 뒤 <code>existing</code>을 반환하며 event를 보내지 않는다.
6. 새 row에만 event를 보낸다. <code>inngest.send()</code>의 완료와 matching worker 실행은 producer의 후속 DB write와 직렬화되지 않으므로, send promise가 settle한 뒤에도 worker가 먼저 QUEUE fence를 회전할 수 있음을 전제로 한다.
7. send 성공 시 <code>acknowledgeReviewDispatch()</code>로 exact attempt·QUEUE token/owner의 PENDING row만 <code>lastCompletedStage=QUEUED</code>로 바꾼다. CAS가 0이면 같은 attempt의 row를 다시 읽고, worker가 RUNNING 또는 이후 상태로 전진했거나 같은 fence에서 이미 QUEUED이면 그 현재 status를 <code>created</code> 결과에 담아 성공으로 처리한다. PENDING인데 attempt/token/owner가 설명되지 않게 달라졌거나 row가 없으면 state conflict다. 늦은 producer가 WORKER lease나 더 뒤 checkpoint를 덮어쓰지 않는다.
8. send promise가 실패해도 HTTP timeout 같은 ambiguous acceptance를 배제하지 않는다. exact PENDING/QUEUE fence의 <code>FAILED/QUEUE</code> CAS가 성공한 경우에만 lease를 지우고 <code>dispatch-failed</code>를 반환한다. CAS를 잃었다면 현재 row를 다시 읽어 같은 attempt가 RUNNING 이후 상태로 전진했거나 SUPERSEDED 같은 적법한 전이로 fence를 잃었는지 확인하고 그 factual status를 반환한다. attempt가 달라졌거나 PENDING fence 손실을 설명할 수 없으면 운영 오류로 남기되 현재 상태·lease·credit를 덮어쓰지 않는다. 이미 FAILED가 된 row를 <code>created/PENDING</code>로 반환하거나 안전한 내부 오류만 던져 <code>requestKey</code>를 잃지 않는다.

<code>resumeReviewRequest()</code>는 T04 delivery takeover 전용 재진입점이다. exact request key로 persisted Review만 읽고 repository lookup이나 PR snapshot을 호출하지 않는다. <code>FAILED/QUEUE</code>는 <code>retryReviewRequest()</code>로 같은 row의 attempt만 증가시키고, <code>PENDING</code>이면서 <code>lastCompletedStage !== QUEUED</code>이면 현재 QUEUE fence를 사용해 같은 attempt와 event ID를 다시 전송한다. 이때 QUEUE lease가 만료되었으면 ID·status·attempt·기존 token·QUEUE owner·만료 조건을 모두 건 <code>updateMany()</code> CAS로 token과 lease만 회전하고 attempt와 event ID는 유지한다. CAS를 잃은 호출은 factual row를 다시 읽어 이미 QUEUED이거나 worker가 claim한 상태를 덮어쓰지 않는다. 그 밖의 PENDING/QUEUED, RUNNING, POSTING, COMPLETED, SUPERSEDED, queue 이외 FAILED는 event 없이 factual <code>existing</code> 결과를 반환하며 row가 없으면 안전한 <code>DELIVERY_REQUEST_NOT_FOUND</code> 오류를 낸다.

### 6.3 Review 상태 CAS

<code>features/review/lib/review-execution-state.ts</code>는 직접적인 <code>review.update()</code> 남발을 막는다.

~~~ts
export type TransitionReviewExecutionInput = {
  reviewId: string;
  attempt: number;
  leaseToken: string;
  leaseOwner: "QUEUE" | "WORKER" | "RECONCILER";
  now: Date;
  from: readonly ReviewStatus[];
  to: ReviewStatus;
  failure?: {
    stage: ReviewFailureStage;
    message: string;
  };
  lastCompletedStage?: ReviewExecutionStage;
  leaseExpiresAt?: Date | null;
};

export async function transitionReviewExecution(
  input: TransitionReviewExecutionInput,
  client: ReviewExecutionClient = prisma,
): Promise<void>;

export async function claimReviewExecution(
  input: { reviewId: string; attempt: number; now: Date },
  client?: ReviewExecutionClient,
): Promise<{ leaseToken: string }>;

export async function acknowledgeReviewDispatch(
  input: {
    reviewId: string;
    attempt: number;
    queueLeaseToken: string;
  },
  client?: ReviewExecutionClient,
): Promise<ReviewStatus>;

export async function renewReviewExecutionLease(
  input: {
    reviewId: string;
    attempt: number;
    leaseToken: string;
    leaseOwner: "WORKER" | "RECONCILER";
    allowedStatuses: readonly ReviewStatus[];
    now: Date;
  },
  client?: ReviewExecutionClient,
): Promise<void>;

export async function recordGithubMainArtifact(
  input: {
    reviewId: string;
    attempt: number;
    leaseToken: string;
    leaseOwner: "WORKER" | "RECONCILER";
    from: readonly ("POSTING" | "FAILED" | "SUPERSEDED")[];
    artifactId: string;
    postedAt: Date;
  },
  client: ReviewExecutionClient = prisma,
): Promise<void>;
~~~

구현은 <code>updateMany()</code>의 where에 ID, allowed status, <code>attemptCount</code>, <code>executionLeaseToken</code>, <code>executionLeaseOwner</code>와 <code>executionLeaseExpiresAt &gt; now</code>를 모두 넣는 fencing CAS를 사용하고 count가 1이 아니면 <code>ReviewStateConflictError</code>를 던진다. claim은 PENDING의 event attempt가 현재 <code>attemptCount</code>와 같을 때만 WORKER token으로 회전한다. <code>acknowledgeReviewDispatch()</code>는 exact PENDING/QUEUE fence에서만 QUEUED checkpoint를 쓰며, CAS miss이면 같은 attempt의 factual status를 읽어 worker 선행 claim인지 idempotent acknowledgement인지 분류하고 설명되지 않는 PENDING fence만 conflict로 거절한다. reconciler acquire는 만료 조건과 현재 token을 CAS해 RECONCILER token으로 회전한다. <code>to=FAILED</code>인데 failure가 없거나 허용하지 않은 상태 전이면 DB query 전에 거절한다. P0 최종 계약에서 <code>recordGithubMainArtifact()</code>는 trusted GitHub 응답 또는 marker lookup 결과의 non-empty ID·postedAt과 <code>lastCompletedStage=MAIN_POSTED</code>를 즉시 기록한다. 이후 <code>to=COMPLETED</code> CAS는 persisted <code>Review.review</code>가 non-empty이고 <code>githubMainReviewId</code>, <code>githubMainPostedAt</code>, <code>MAIN_POSTED</code> 또는 이후 checkpoint가 모두 있는 row만 대상으로 삼아 status와 lease 정리를 기록한다. worker 정상 경로는 main 게시 직후 artifact를 먼저 보존하고 optional post 뒤 완료하며, reconciler는 artifact 기록과 완료 전이를 같은 DB transaction에서 수행한다. 두 helper를 우회해 GitHub 필드나 COMPLETED를 직접 update하는 경로를 만들지 않는다.

T02의 최초 helper surface는 <code>transitionReviewExecution()</code>, <code>claimReviewExecution()</code>, <code>renewReviewExecutionLease()</code>와 <code>ReviewStateConflictError</code>다. 이 단계에서 claim만 <code>PENDING -> RUNNING</code>과 새 WORKER token 회전을 소유하고, 일반 transition은 현재 lease가 있는 <code>PENDING -> FAILED | SUPERSEDED</code>, <code>RUNNING -> POSTING | FAILED | SUPERSEDED</code>, <code>POSTING -> COMPLETED | FAILED | SUPERSEDED</code>만 허용한다. terminal 전이는 lease를 지우므로, 새 attempt·QUEUE lease를 한 transaction에서 만드는 <code>FAILED -> PENDING</code>은 T03의 retry helper와 함께 추가한다. 아직 GitHub posting 함수가 ID를 반환하지 않는 T03-T06 호환을 위해 <code>POSTING -> COMPLETED</code>의 artifact 강제는 활성화하지 않는다. <code>acknowledgeReviewDispatch()</code>는 T03, reconciler lease acquire와 <code>recordGithubMainArtifact()</code>, completion guard, <code>FAILED -> COMPLETED</code> 복구 전이는 T07이 각각 consumer와 같은 task에서 추가한다. T02에서 terminal row의 null lease를 임시 token으로 되살리거나 T07의 GitHub artifact·reconciler 동작을 선반영하지 않고, T07 이후에도 임시 무-artifact 완료 분기를 남기지 않는다.

P0 최종 허용 전이:

~~~text
PENDING -> RUNNING | FAILED | SUPERSEDED
RUNNING -> POSTING | FAILED | SUPERSEDED
POSTING -> COMPLETED | FAILED | SUPERSEDED
FAILED -> PENDING | COMPLETED
COMPLETED -> terminal
SUPERSEDED -> terminal
~~~

retry의 <code>FAILED -> PENDING</code>은 <code>attemptCount</code> 증가, failure field 초기화, 새 lease 설정과 같은 transaction에서 수행한다.
<code>FAILED -> COMPLETED</code>는 T07 reconciler가 persisted non-empty review body와 trusted main marker를 모두 확인하고 <code>recordGithubMainArtifact()</code>와 완료 CAS를 같은 transaction에서 수행하는 경우에만 허용한다. 일반 retry나 <code>onFailure</code>는 이 전이를 사용할 수 없다.

### 6.4 webhook delivery lease

<code>lib/github/github-webhook-delivery.ts</code>의 계약:

~~~ts
export type GithubWebhookTransportBinding = {
  kind: "GITHUB_WEBHOOK";
  deliveryRowId: string;
  leaseToken: string;
};

export type AcquireGithubWebhookDeliveryResult =
  | {
      kind: "acquired";
      deliveryRowId: string;
      leaseToken: string;
      attempt: number;
      requestKey: string | null;
    }
  | { kind: "processed" }
  | { kind: "processing" };

export async function acquireGithubWebhookDelivery(
  input: {
    deliveryId: string;
    payloadSha256: string;
    event: string;
    action: string | null;
    now: Date;
  },
  client?: GithubWebhookDeliveryClient,
): Promise<AcquireGithubWebhookDeliveryResult>;

export async function completeGithubWebhookDelivery(
  input: {
    deliveryRowId: string;
    leaseToken: string;
    requestKey?: string;
    now: Date;
  },
  client?: GithubWebhookDeliveryClient,
): Promise<void>;

export async function failGithubWebhookDelivery(
  input: {
    deliveryRowId: string;
    leaseToken: string;
    requestKey?: string;
    errorCode: string;
    errorMessage: string;
  },
  client?: GithubWebhookDeliveryClient,
): Promise<void>;

export async function bindGithubWebhookDeliveryRequest(
  input: {
    deliveryRowId: string;
    leaseToken: string;
    requestKey: string;
  },
  client: GithubWebhookDeliveryTransactionClient,
): Promise<void>;
~~~

규칙:

- 최초 create는 random <code>leaseToken</code>과 <code>now + 5분</code> lease를 갖는다.
- unique 충돌 시 row를 읽는다.
- 같은 delivery ID인데 payload SHA-256이 다르면 <code>DELIVERY_PAYLOAD_MISMATCH</code>로 거절한다.
- PROCESSED면 <code>processed</code>, 유효한 PROCESSING lease면 <code>processing</code>이다.
- FAILED 또는 만료된 PROCESSING은 <code>updateMany</code> CAS로 한 호출만 takeover한다.
- complete/fail도 row ID, PROCESSING, lease token을 모두 조건으로 삼는다. count 0이면 이전 lease 소유자가므로 상태를 덮어쓰지 않는다.
- request coordinator는 Review를 만들거나 기존 row를 반환하는 transaction 안에서 <code>bindGithubWebhookDeliveryRequest()</code>를 호출한다. Review commit 뒤 complete/fail에서 처음 requestKey를 쓰는 crash window를 두지 않는다. 이미 다른 non-null request key가 있으면 덮어쓰지 않고 전체 transaction을 무결성 오류로 rollback한다.
- takeover 결과의 <code>requestKey</code>가 non-null이면 새 snapshot으로 새 request key를 계산하지 않는다. exact request key의 Review를 조회한다. <code>FAILED/QUEUE</code>면 <code>retryReviewRequest(reviewId)</code>로 같은 row의 attempt만 증가시킨다. PENDING인데 <code>lastCompletedStage !== QUEUED</code>이면 같은 attempt와 동일 event ID로 재전송하고 성공 시 QUEUED CAS를 한다. PENDING/QUEUED, RUNNING, POSTING, COMPLETED, SUPERSEDED 또는 queue 이외 FAILED는 새 Review나 event를 만들지 않고 delivery만 완료한다. row가 없으면 <code>DELIVERY_REQUEST_NOT_FOUND</code>로 실패시킨다.
- GitHub는 실패한 webhook delivery를 자동 재전송하지 않으며 UI/API redelivery도 현재 최근 3일 delivery만 허용한다. 이 lease는 그 eligibility window 안에서 GitHub UI/API의 수동 또는 별도 승인된 운영 redelivery가 들어왔을 때 안전하게 재개하기 위한 계약이다. 3일 밖의 누락분은 lease takeover만으로 복구 가능하다고 기록하지 않고 별도 승인된 semantic replay/운영 복구 계획이 없으면 BLOCKED로 남긴다. P0 Core는 webhook 관리 credential을 추가하거나 자동 redelivery scheduler를 만들지 않는다.

<code>GithubWebhookTransportBinding</code>의 canonical owner는 delivery lease와 CAS를 구현하는 <code>lib/github/github-webhook-delivery.ts</code>다. <code>review-request.ts</code>와 <code>review-trial.ts</code>는 이 타입을 <code>@/</code> alias의 <code>import type</code>으로만 사용한다. <code>review-trial.ts</code>가 <code>review-request.ts</code>의 입력 타입을 역참조하거나 payment와 review feature 사이에 runtime import cycle을 만드는 구현은 허용하지 않는다.

### 6.5 GitHub marker

<code>features/review/lib/review-artifact-marker.ts</code>:

~~~ts
export type ReviewArtifactPart =
  | "main"
  | "verification"
  | "summary"
  | { kind: "issue"; id: string }
  | { kind: "suggestion"; id: string };

export function buildReviewArtifactMarker(
  reviewId: string,
  part: ReviewArtifactPart,
): string;
~~~

형식:

~~~text
<!-- hreviewer:review:{reviewId}:main -->
<!-- hreviewer:review:{reviewId}:issue:{reviewIssueId} -->
<!-- hreviewer:review:{reviewId}:suggestion:{suggestionId} -->
<!-- hreviewer:review:{reviewId}:verification -->
<!-- hreviewer:review:{reviewId}:summary -->
~~~

marker는 body 마지막 generated footer 앞에 한 번만 넣는다. 사용자 입력을 marker part에 넣지 않고 DB ID만 사용한다.

<code>lib/github/github-review-artifacts.ts</code>는 <code>octokit.paginate()</code>로 다음 세 endpoint를 모두 검색한다.

- <code>pulls.listReviews</code>: main, verification review body
- <code>pulls.listReviewComments</code>: issue와 suggestion inline body
- <code>issues.listComments</code>: fallback main comment와 summary

첫 page만 검색하지 않는다. 반환값에는 artifact kind, GitHub ID를 문자열로 정규화한 값, commit ID, body, GitHub 응답의 <code>submitted_at</code> 또는 <code>created_at</code>을 유효한 <code>Date</code>로 정규화한 <code>postedAt</code>, 작성자의 numeric GitHub user ID를 문자열로 정규화한 값이 포함된다. 필수 timestamp가 없거나 유효하지 않으면 현재 시각을 꾸며 넣지 않고 artifact 정규화 오류로 처리한다.

marker 문자열만으로 artifact를 신뢰하지 않는다. 요청 생성 시 Review에 저장한 <code>githubAuthorId</code>를 <code>expectedAuthorId</code>로 lookup에 전달하고, worker는 같은 <code>accountId</code>에 속한 token만 사용한다. 현재 Account binding이 바뀌었거나 persisted author가 null이면 post·lookup·credit 정산을 중단한다. <code>String(artifact.user.id) === expectedAuthorId</code>인 결과만 HReviewer artifact로 인정한다. pull-request review와 review comment는 non-null commit ID가 persisted <code>Review.headSha</code>와도 같아야 한다. issue comment인 summary와 main fallback은 commit ID가 없으므로 author ID와 marker를 검사하고, 게시 직전 head/state guard를 그대로 적용한다. 작성자 ID가 없거나 일치하지 않는 marker는 trusted match가 아니며, token·login·원문 body는 로그에 남기지 않는다. 이 검증은 다른 사용자가 복사한 marker나 사후 account 재연결이 중복 방지와 trial credit 정산을 오염시키지 못하게 하는 trust boundary다.

같은 trust boundary는 token의 내구성 저장에도 적용한다. token 조회는 GitHub를 호출하는 각 Inngest step 안에서 수행하고 token을 event, step 입력·반환값, DB, 오류 또는 로그로 내보내지 않는다.

### 6.6 production cutover와 webhook 응답 gate

production deployment와 flag 활성화 자체는 별도 승인 대상이지만, T09 receipt가 다음 조건을 증명하지 못하면 P0를 release-ready로 표시하지 않는다.

1. 새 webhook/review intake를 중지하고 현재 배포의 <code>generate-review</code>, <code>generate-summary</code> queued·running run이 모두 0임을 시각과 redacted run count로 기록한다. 같은 step ID의 memoized 구버전 결과를 신버전 handler가 이어받지 않는 유일한 P0 cutover 전략이다.
2. production read-only preflight로 실제 Review status 집합이 migration guard와 맞는지 확인한다. T02 migration SQL과 새 application image를 한 maintenance window에 적용하며, 구 application이 enum 전환 뒤 write하는 구간을 허용하지 않는다.
3. schema 적용, application health, registry exact-membership, test smoke를 확인한 뒤 intake를 재개한다. 중지 중 놓친 GitHub delivery는 승인된 UI/API redelivery 목록으로만 복구하고 자동 재전송을 가정하지 않는다. 누락 delivery가 0개인지, 아니면 모두 GitHub의 최근 3일 redelivery eligibility 안에 있는지를 확인 시각과 함께 기록한다. 하나라도 window 밖이면 임의의 새 delivery ID나 payload replay를 만들지 않고 별도 운영 복구 계획이 승인될 때까지 release를 차단한다.
4. webhook fixture의 signature 검증부터 HTTP response 완료까지를 실제와 같은 DB/GitHub latency 조건에서 측정한다. <code>GITHUB_WEBHOOK_RESPONSE_BUDGET_MS=8_000</code>을 넘는 정상 경로가 하나라도 있으면 GitHub의 10초 제한에 안전 여유가 없으므로 T09를 차단하고, verified normalized payload를 별도 durable async processor로 분리하는 후속 설계를 먼저 승인한다. raw body나 signature를 durable payload로 저장하지 않는다.
5. drain, production query, migration, deploy, redelivery, 외부 latency 측정은 모두 Approval-after다. 승인이 없거나 0-run·응답 예산을 증명하지 못하면 receipt는 BLOCKED로 남는다.

acknowledgement는 P3의 T21 소유다. T21에서 같은 marker builder의 union과 lookup endpoint를 확장하며, P0는 후속 command artifact를 미리 만들지 않는다.

## 7. task별 구현

### T01. 파이프라인 기준선과 테스트 하네스

#### 수정 파일

- 수정: <code>vitest.config.ts</code>
- 수정: <code>app/api/webhooks/github/route.ts</code>
- 수정: <code>inngest/functions/review.ts</code>
- 수정: <code>inngest/functions/summary.ts</code>
- 생성: <code>app/api/webhooks/github/github-webhook-handler.ts</code>
- 생성: <code>app/api/webhooks/github/github-webhook-handler.test.ts</code>
- 생성: <code>app/api/webhooks/github/route.test.ts</code>
- 생성: <code>inngest/functions/review.test.ts</code>
- 생성: <code>inngest/functions/summary.test.ts</code>
- 생성: <code>features/review/ui/parts/review-status-badge.test.tsx</code>
- 수정·최초 추적: <code>docs/proposals/hreviewer-personal-review-coach-p0-implementation-plan.md</code>, <code>docs/proposals/hreviewer-personal-review-coach-roadmap.md</code>

#### 구현 형태

<code>route.ts</code>는 Next.js adapter만 남긴다.

~~~ts
export async function POST(
  request: NextRequest,
): Promise<NextResponse<GithubWebhookResponse["body"]>> {
  const response = await handleGithubWebhook({
    event: request.headers.get("x-github-event"),
    deliveryId: request.headers.get("x-github-delivery"),
    signature: request.headers.get("x-hub-signature-256"),
    rawBody: await request.text(),
    secret: process.env.GITHUB_WEBHOOK_SECRET,
  });

  return NextResponse.json(response.body, { status: response.status });
}
~~~

handler contract:

~~~ts
export type GithubWebhookInput = {
  event: string | null;
  deliveryId: string | null;
  signature: string | null;
  rawBody: string;
  secret: string | undefined;
};

export type GithubWebhookResponse = {
  status: number;
  body: { message?: string; error?: string };
};

export type PullRequestIdentity = {
  owner: string;
  repo: string;
  prNumber: number;
};

export type GithubWebhookHandlerDependencies = {
  verifySignature(input: {
    rawBody: string;
    signature: string | null;
    secret: string;
  }): boolean;
  queueReview(input: PullRequestIdentity): Promise<ReviewPullRequestResult>;
  queueSummary(input: PullRequestIdentity): Promise<GeneratePRSummaryResult>;
  handleSynchronize(input: SynchronizeInput): Promise<SynchronizeResult>;
  finalizeMergedPullRequest(input: PullRequestIdentity): Promise<void>;
};

export function createGithubWebhookHandler(
  dependencies: GithubWebhookHandlerDependencies,
): (input: GithubWebhookInput) => Promise<GithubWebhookResponse>;
~~~

T01에서는 <code>deliveryId</code>를 input에 전달하지만 누락을 거절하거나 DB에 저장하지 않는다. 그 동작은 T04 소유다. <code>review</code> command가 조용히 무시되는 현재 동작도 T05 전까지 fixture로 고정한다.

worker는 등록 wrapper와 실행 handler를 분리한다.

~~~ts
export function createGenerateReviewHandler(
  dependencies: ReviewWorkerDependencies,
): ReviewWorkerHandler;

export const generateReview = inngest.createFunction(
  { id: "generate-review" },
  { event: "pr.review.requested" },
  createGenerateReviewHandler(defaultReviewWorkerDependencies),
);
~~~

summary도 같은 형태를 사용한다. AI SDK, GitHub, Prisma, clock을 dependency로 주입해 테스트에서 실제 외부 요청을 막는다. 기존 step ID는 in-flight run 호환을 위해 T01에서 바꾸지 않는다.

Vitest:

~~~ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
});
~~~

TSX discovery는 React DOM server renderer를 사용하는 status badge smoke test로 증명한다. 전용 T01 명령과 공통 <code>npm.cmd run test</code> 결과 모두에 해당 test file과 test name이 실제 수집되었는지 확인하며, “No test files found”나 0-test 성공을 통과로 보지 않는다. jsdom과 Testing Library는 이 task에 추가하지 않는다.

현재 <code>server-only@0.0.1</code>의 기본 entry는 일반 Node 조건에서 의도적으로 throw하므로, <code>lib/db.ts</code> 같은 server composition을 import하는 Vitest 파일은 static import보다 먼저 hoist되는 <code>vi.mock("server-only", () =&gt; ({}))</code>를 명시한다. production의 <code>import "server-only"</code>를 삭제하거나 client barrel로 우회하지 않는다. handler factory의 주입 테스트와 default composition import smoke test를 분리해 이 mock이 외부 dependency 주입을 대체하지 않게 한다.

#### 필수 fixture

- <code>pull_request/opened</code>: review queue 1회
- <code>pull_request/synchronize</code>: normal, HReviewer commit skip, native suggestion skip
- <code>pull_request/closed</code>: merged만 pending issue를 IGNORED로 변경
- <code>issue_comment/created</code>: summary dispatch, review 미dispatch라는 현재 기준선
- invalid signature: <code>verifySignature</code> 1회, queue·synchronize·merge finalize를 포함한 side-effect dependency 0회
- review worker: structured 성공, markdown fallback, GitHub review API fallback, save row shape
- summary worker: generate, post, save 순서
- server composition import: Vitest의 명시적 <code>server-only</code> mock 아래 module import가 성공하고 production source의 marker import는 그대로 존재

#### task 경계

- DB enum, delivery row, request coordinator를 만들지 않는다.
- 기존 step ID와 외부 응답 문구를 불필요하게 바꾸지 않는다. 이는 T01 단독 regression 보호일 뿐 T03/T07 이후 production in-flight 호환성 증거가 아니며, 최종 배포는 섹션 6.6의 drain gate를 따른다.
- T01 완료 시 baseline 테스트가 현재 결함도 의도적으로 기록하고 있음을 완료 기록에 남긴다.
- 두 proposal 문서가 Git index에 정확히 등록됐는지 섹션 1의 durability preflight로 확인한다.

### T02. Review 실행 상태와 webhook delivery 영속화

#### 수정 파일

- 수정: <code>prisma/schema.prisma</code>
- 생성: <code>prisma/migrations/20260825110650_add_review_execution_state/migration.sql</code>
- 생성: <code>features/review/lib/review-execution-state.ts</code>
- 생성: <code>features/review/lib/review-execution-state.test.ts</code>
- 생성: <code>features/review/lib/review-execution-migration.integration.test.ts</code>
- 수정: <code>features/review/constants/index.ts</code>
- 수정: <code>features/review/types/index.ts</code>
- 수정: <code>features/review/ui/parts/review-status-badge.tsx</code>
- 수정: <code>features/review/ui/parts/review-status-badge.test.tsx</code>
- 수정: <code>features/review/ui/parts/review-card.tsx</code>
- 생성: <code>features/review/ui/parts/review-card.test.tsx</code>
- 수정: <code>features/review/ui/review-detail.tsx</code>
- 생성: <code>features/review/ui/review-detail.test.tsx</code>
- 수정: 현재 Review를 쓰는 <code>features/ai/actions/review-pull-request.ts</code>, <code>inngest/functions/review.ts</code>, <code>inngest/functions/summary.ts</code>
- 수정: 기존 worker 저장 계약을 검증하는 <code>inngest/functions/review.test.ts</code>, <code>inngest/functions/summary.test.ts</code>
- 생성: <code>lib/test/create-test-prisma-client.ts</code>
- 생성: <code>lib/test/create-test-prisma-client.test.ts</code>
- 생성: <code>scripts/prepare-p0-test-database.mjs</code>

#### 구현

- 섹션 5의 schema와 migration을 적용한다.
- 생성 Prisma enum을 frontend type의 source로 쓴다. <code>features/review/types/index.ts</code>는 기존 review data type을 보존하면서, Prisma generated module에서는 <code>@/lib/generated/prisma/enums</code>의 <code>ReviewStatus</code> type만 재수출한다. client component가 Node용 Prisma client entry를 import하지 않게 하고 별도 string union을 중복 정의하지 않는다.
- badge에 여섯 상태를 모두 표시한다.
- PENDING, RUNNING, POSTING의 card와 detail은 빈 markdown/preview 대신 상태 설명을 렌더링한다. FAILED와 SUPERSEDED도 빈 body를 markdown에 넘기지 않고 안전한 상태 안내만 보이며, COMPLETED만 persisted review body를 렌더링한다.
- FAILED는 sanitized failureMessage와 retry 가능 여부를 보여 주고 raw stack을 표시하지 않는다.
- SUPERSEDED는 최신 head review가 별도로 실행되었거나 PR이 더 이상 review 가능한 open 상태가 아니라는 안전한 설명을 보여 준다.
- 수정 대상인 <code>review-detail.tsx</code>의 generic <code>Props</code>는 <code>ReviewDetailProps</code>로, <code>review-status-badge.tsx</code>의 inline props type은 <code>ReviewStatusBadgeProps</code>로 바꾼다. <code>review-card.tsx</code>의 기존 <code>ReviewCardProps</code>는 유지한다.
- 기존 write 지점을 모두 대문자 enum 값으로 바꿔 typecheck를 통과시킨다.
- T03 전 호환을 위해 현재 Review create 세 곳은 <code>legacy-runtime:</code> random UUID request key와 필수 enum/실패 metadata를 명시한다. schema default로 request key 누락을 숨기지 않는다.
- T02의 초기 execution helper는 섹션 6.3의 phase-specific surface와 전이만 구현한다. terminal 상태의 null lease를 재사용하는 retry adapter나 RECONCILER lease acquire를 만들지 않는다.
- <code>lib/test/create-test-prisma-client.ts</code>는 <code>TEST_DATABASE_URL</code>만 허용하고, URL의 database 이름이 <code>_test</code>로 끝나며 <code>DATABASE_URL</code>/<code>DIRECT_URL</code>과 다름을 확인한다. 공통 request/delivery/trial integration test의 migration 대상과 query 대상을 일치시키기 위해 URL의 schema가 없으면 <code>public</code>으로 정규화하고, non-empty이면서 <code>public</code>이 아닌 schema는 write 전에 거부한다. 정규화한 URL과 <code>new PrismaPg({ connectionString }, { schema: "public" })</code>로 direct Prisma client를 만들며 production barrel에서 export하지 않는다.
- <code>scripts/prepare-p0-test-database.mjs</code>도 같은 database·URL·schema 검사를 수행한 뒤, 검증된 URL에 <code>schema=public</code>을 명시한 값으로만 <code>prisma migrate deploy</code>를 실행한다. migration 성공 뒤 같은 정규화 URL에서 <code>current_schema() = 'public'</code>, <code>_prisma_migrations</code>, T02까지 필요한 base table과 신규 table의 존재를 read-only로 확인한 다음에만 성공 종료한다. production·development DB를 통합 테스트 대상으로 재사용하지 않는다.
- 현재 <code>prisma.config.ts</code>는 <code>DIRECT_URL ?? DATABASE_URL</code> 순서로 datasource를 선택한다. 따라서 준비 스크립트는 shell을 거치지 않는 child process에만 정규화한 <code>TEST_DATABASE_URL</code>을 <code>DATABASE_URL</code>과 <code>DIRECT_URL</code> 양쪽으로 명시해 <code>prisma migrate deploy</code>를 실행하고, 부모 process 환경은 바꾸지 않는다. 기존 <code>DIRECT_URL</code>을 상속해 다른 DB로 우회하는 경로와 URL schema와 adapter schema가 달라지는 경로를 테스트한다.
- 현재 존재하지 않는 <code>lib/test/</code> parent를 T02에서 먼저 만들고 <code>create-test-prisma-client.ts</code>와 같은 계약의 URL 안전 검사를 고정하는 co-located unit test만 배치한다. 이 test helper를 production barrel에서 export하지 않는다.
- migration transition integration test만 공통 <code>public</code> client를 사용하지 않는다. test database 안에 검증된 실행 ID로 격리 schema를 만들고 session의 <code>search_path</code>를 그 exact schema로 고정한 뒤 target T02 이전의 모든 migration SQL을 timestamp 순으로 replay해 실제 pre-T02 구조와 FK를 만든다. exact User, Repository, Review, UserUsage fixture를 삽입한 뒤 같은 session·schema에서 target migration SQL만 적용한다. 손으로 만든 <code>review</code>/<code>user_usage</code> 축약 DDL은 금지한다. 정상 세 status의 cast·backfill과 알 수 없는 status의 guard 중단·transaction rollback을 각각 실제 PostgreSQL에서 검증하고, 시작 전에 생성·기록한 exact schema 하나만 정리한다. 공통 integration fixture는 실행별 고유 ID로 자신이 만든 row만 삭제하며 database 또는 <code>public</code> schema 전체를 정리하지 않는다.
- <code>npx.cmd prisma generate</code>가 다시 만드는 <code>lib/generated/prisma/**</code>는 <code>.gitignore</code> 대상인 derived verification artifact이지 T02의 commit source가 아니다. generate 전후에 <code>rg --files lib/generated/prisma | Sort-Object</code>로 exact manifest를 기록하고, 최소한 <code>enums.ts</code>, <code>models/Review.ts</code>, <code>models/UserUsage.ts</code>, 신규 <code>models/GithubWebhookDelivery.ts</code>, <code>models.ts</code>, <code>client.ts</code>가 존재하며 새 enum·field·model을 노출하는지 확인한다. 생성물을 force-add하지 않고 schema, migration, generate 결과와 typecheck를 task 완료 기록에 함께 남긴다.

#### 테스트

- T02 단계에서 허용한 claim·현재-lease 전이 전부 성공
- 금지 전이와 terminal 상태 재전이 실패
- FAILED인데 failure metadata가 없는 호출 실패
- migration fixture의 세 기존 status 매핑
- 알 수 없는 기존 status에서 migration guard 실패
- historical request key가 row마다 unique
- T02 종료 시 <code>legacy-runtime:</code> + <code>randomUUID()</code> production write가 현재 세 Review create 파일에 정확히 하나씩 있고 다른 non-test source 위치에는 0개
- badge 여섯 상태와 card/detail의 PENDING/RUNNING/POSTING empty-body guard, FAILED/SUPERSEDED 안내, COMPLETED body 렌더링
- execution lease의 attempt/token/owner/expiry fencing, lease 만료 뒤 이전 worker write 거절, 동시 worker claim 중 token owner 한 명만 획득
- 격리된 PostgreSQL snapshot에서 migration guard, enum cast, NOT NULL·UNIQUE 제약을 실제 적용해 검증
- 준비 script와 공통 Prisma client가 모두 전용 <code>_test</code> database의 <code>public</code> schema를 가리키며, migration 뒤 <code>current_schema()</code>·<code>_prisma_migrations</code>·필수 table 확인 전 fixture write 0회
- migration transition test의 격리 schema와 공통 integration test의 <code>public</code> schema가 섞이지 않고, cleanup은 실행 ID로 소유권을 증명한 schema 또는 row만 대상으로 함

### T03. 단일 review 요청 coordinator

#### 수정 파일

- 생성: <code>inngest/events.ts</code>
- 수정: <code>inngest/client.ts</code>
- 생성: <code>features/review/lib/review-request.ts</code>
- 생성: <code>features/review/lib/review-request.test.ts</code>
- 생성: <code>features/review/lib/review-request.integration.test.ts</code>
- 수정: <code>features/review/lib/review-execution-state.ts</code>
- 수정: <code>features/review/lib/review-execution-state.test.ts</code>
- 수정: <code>features/review/lib/reconcile-issue-resolutions.ts</code>
- 생성: <code>features/review/lib/reconcile-issue-resolutions.test.ts</code>
- 수정: <code>features/suggestion/lib/reconcile-native-suggestions.ts</code>
- 생성: <code>features/suggestion/lib/reconcile-native-suggestions.test.ts</code>
- 수정: <code>features/ai/actions/review-pull-request.ts</code>
- 생성: <code>features/ai/actions/review-pull-request.test.ts</code>
- 수정: <code>features/ai/actions/generate-pr-summary.ts</code>
- 생성: <code>features/ai/actions/generate-pr-summary.test.ts</code>
- 수정: <code>features/ai/index.ts</code>
- 수정: <code>features/ai/types/index.ts</code>
- 수정: <code>features/ai/lib/get-repository-with-token.ts</code>
- 수정: <code>features/payment/lib/subscription.ts</code>
- 수정: <code>features/review/constants/index.ts</code>
- 수정: <code>app/api/webhooks/github/github-webhook-handler.ts</code>
- 수정: <code>app/api/webhooks/github/github-webhook-handler.test.ts</code>
- 수정: <code>lib/github/github.ts</code>
- 수정: <code>lib/github/github.test.ts</code>
- 수정: <code>inngest/functions/review.ts</code>
- 수정: <code>inngest/functions/review.test.ts</code>
- 수정: <code>inngest/functions/summary.ts</code>
- 수정: <code>inngest/functions/summary.test.ts</code>

#### 구현

- <code>getPullRequestSnapshot()</code>을 아래 object-input·explicit-return contract로 추가한다. <code>pulls.get</code> 한 번으로 title, canonical GitHub HTML URL, head SHA, state, merged를 반환하고 diff는 가져오지 않는다.

~~~ts
export type GetPullRequestSnapshotInput = {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
};

export type PullRequestSnapshotResult = {
  title: string;
  url: string;
  headSha: string;
  state: string;
  merged: boolean;
};

export async function getPullRequestSnapshot(
  input: GetPullRequestSnapshotInput,
): Promise<PullRequestSnapshotResult>;
~~~

<code>GetPullRequestSnapshotInput</code>, <code>PullRequestSnapshotResult</code>, 함수의 owner는 <code>lib/github/github.ts</code>다. 같은 파일에서 stable diff 매핑에 쓰는 기존 private <code>PullRequestSnapshot</code>은 <code>GithubPullRequestDiffSnapshot</code>으로 이름을 바꿔 두 의미를 합치지 않는다. 기존 <code>getPullRequestDiff()</code>의 public input·result와 before/diff/after 안정성 검사는 그대로 유지한다.
- repository token lookup은 token과 정확히 대응하는 non-empty GitHub <code>Account.accountId</code>를 함께 반환한다. coordinator는 이를 <code>Review.githubAuthorId</code>에 저장하고, worker는 동일 accountId의 token만 다시 선택한다.
- 두 기존 action은 섹션 6.2의 객체 입력으로 바꾸고 route-private default composition도 함께 갱신하되, 외부 결과 contract는 유지하고 내부에서는 <code>createReviewRequest()</code>만 호출한다.
- 두 action의 public <code>success</code>/<code>message</code>/<code>reason</code> contract는 유지하고, 내부 판별용 <code>reviewId</code>/<code>requestKey</code>/<code>status</code>/<code>failureStage</code> metadata의 owner는 <code>features/ai/types/index.ts</code>로 둔다. producer가 exact queue fence로 확정한 <code>dispatch-failed</code>를 성공 또는 <code>created/PENDING</code>으로 번역하지 않는다.
- coordinator와 두 action은 섹션 6.2의 status mapping table을 구현한다. newly created row라도 dispatch 직후 worker가 먼저 claim해 factual status가 RUNNING 이후라면 stale PENDING으로 꾸미지 않고, FAILED/SUPERSEDED를 queued 성공으로 표시하지 않는다. closed/merged snapshot의 <code>PR_NOT_REVIEWABLE</code>은 Review·event·credit 0회의 정상 거절로 번역한다.
- T02의 <code>legacy-runtime:</code> 임시 write와 실패 row 별도 생성 경로를 삭제한다. 신규 Review row는 coordinator만 생성한다.
- 현재 <code>incrementReviewCount()</code>와 repository별 count를 읽는 <code>canCreateReview()</code>는 제거한다. T03의 FULL_REVIEW gate는 coordinator dependency로 주입한 <code>getUserTier()</code>의 PRO 여부만 사용해 기존 Pro-only 동작을 보존하고, SUMMARY는 허용한다. T08이 이 gate를 Free trial reservation으로 교체한다. <code>reviewCounts</code> DB column과 기존 subscription response shape는 호환을 위해 유지하되 실제 요청 side effect와 entitlement에는 사용하지 않고, 향후 통계는 Review row에서 계산한다.
- T03의 자동 review는 아직 <code>dispatchMode=DIRECT</code>다. T06이 DEBOUNCED로 바꾼다.
- Review와 summary worker event를 섹션 6.1의 최소 payload로 바꾼다. worker identity와 generation option은 event가 아니라 claimed Review/Repository row에서 읽는다.
- 현재 두 worker의 <code>fetch-pr-data</code> step 결과에서 <code>token</code>을 제거한다. PR snapshot·diff처럼 비밀이 아닌 데이터만 내구성 step 결과로 반환하고, 각 GitHub fetch/post/lookup step은 step 내부에서 persisted <code>githubAuthorId</code>와 일치하는 Account token을 다시 조회해 사용한 뒤 token을 반환하거나 로그에 남기지 않는다. step 간 token 전달을 위해 closure나 event field를 추가하지 않는다.
- T03에서 SUMMARY도 <code>headSha</code>를 영속화하므로 <code>reconcile-issue-resolutions.ts</code>와 <code>reconcile-native-suggestions.ts</code>의 이전 review 조회에는 <code>reviewType: "FULL_REVIEW"</code>를 명시한다. 같은 repository/PR/head의 더 늦은 SUMMARY가 기존 FULL_REVIEW의 issue·suggestion reconciliation baseline을 가리는 현재 <code>findFirst</code> 모호성을 제거한다.
- worker 시작의 <code>claim-review</code> step에서 event attempt까지 검사해 <code>PENDING -> RUNNING</code> CAS를 하고 새 WORKER lease token을 받는다.
- PENDING 생성 시 QUEUE token/owner/lease를, claim과 각 장기 단계 전에는 exact WORKER token으로 execution lease를 설정·갱신한다. 모든 unambiguous terminal 전이는 token/owner/expiry를 null로 지운다.
- worker가 fetch한 head가 persisted head와 다르면 T03에서는 외부 post 없이 FAILED/FETCH로 종료한다. T06이 이 임시 실패 처리를 SUPERSEDED와 공용 head guard로 교체한다.
- worker의 마지막 transaction은 <code>review.create</code>가 아니라 전달받은 ID의 <code>review.update</code>와 child create를 사용한다.
- T07 전까지 기존 post-before-save 순서는 유지하되 상태는 RUNNING -> POSTING -> COMPLETED를 거친다.

#### race 처리

- 두 호출이 같은 request key를 만들면 하나의 create만 성공한다.
- P2002를 모든 unique 충돌로 간주하지 않는다. Prisma error의 target이 requestKey인지 검사한 뒤 기존 row를 조회한다.
- 기존 row를 반환한 호출은 Inngest event와 usage side effect를 만들지 않는다.
- event send 성공 뒤 QUEUED acknowledgement와 worker claim이 경합하면 exact QUEUE fence를 얻은 한 write만 성공한다. worker가 먼저 claim했으면 producer는 factual RUNNING 이후 상태를 반환하고 status, checkpoint, lease를 쓰지 않는다.
- event send promise 실패는 exact PENDING/QUEUE fence를 아직 가진 새 row만 FAILED/QUEUE로 바꾼다. ambiguous acceptance 뒤 worker가 먼저 claim했다면 failure 보상은 CAS miss로 끝나고 factual worker 상태를 성공 dispatch로 반환한다.

#### 테스트

- 자동 review와 summary가 coordinator만 사용
- 같은 head 동시 호출에서 Review 1개, event 1개
- review와 summary는 서로 다른 request key
- exact queue fence에서 event send 실패가 확정되면 <code>dispatch-failed</code>와 내부 <code>reviewId</code>/<code>requestKey</code>/<code>FAILED</code>/<code>QUEUE</code> metadata를 반환하고, 이미 실패한 row를 <code>created/PENDING</code>으로 보고하지 않음
- send promise가 resolve 또는 reject되기 직전 worker가 claim한 race에서 producer의 QUEUED/FAILED write와 lease·checkpoint overwrite가 0회이고, 반환 status와 webhook public 결과가 현재 RUNNING 또는 이후 상태와 일치
- event ID prefix의 전역 충돌 없음
- 같은 repository ID·PR 번호의 자동·수동 FULL_REVIEW는 head와 request source가 달라도 같은 <code>{repositoryId}:{prNumber}</code> debounceKey를 사용하고, 다른 repository row 또는 PR은 다른 key를 사용하며 SUMMARY payload에는 debounceKey가 없음
- exact queue fence에서 확정된 dispatch 실패는 FAILED/QUEUE
- worker가 event reviewId를 갱신하고 새 Review를 만들지 않음
- worker가 persisted repository/PR/head/language/generation option/githubAuthorId만 사용하고 event의 중복 identity/config field가 존재하지 않음
- event, 직렬화한 Inngest step 입력·반환값, 저장된 failure와 로그에 OAuth token 또는 <code>accessToken</code>이 없고 각 GitHub step이 exact <code>githubAuthorId</code> binding으로 token을 다시 조회함
- 같은 repository/PR/head에 FULL_REVIEW보다 늦게 생성된 SUMMARY가 있어도 issue resolution과 native suggestion reconciliation이 FULL_REVIEW만 baseline으로 선택함
- retry helper가 같은 row의 attempt만 증가
- 실제 PostgreSQL에서 같은 request key 동시 create가 Review 1개와 event 1개로 수렴
- 두 action이 기존 public 결과 shape를 유지하면서 coordinator에만 위임하고, 확정된 dispatch 실패를 성공 또는 <code>created/PENDING</code>으로 보고하지 않음
- 두 action과 route-private default composition이 <code>PullRequestIdentityInput</code> 객체를 사용하고 세 위치 인자 overload가 남지 않음
- <code>getPullRequestSnapshot()</code>이 <code>pulls.get</code>을 정확히 한 번 호출하고 canonical HTML URL·head SHA·state·merged를 정규화하며 diff media type을 요청하지 않고 API 실패를 숨기지 않음
- stable diff의 private <code>GithubPullRequestDiffSnapshot</code>과 request용 public <code>PullRequestSnapshotResult</code>가 별도 symbol이고 기존 <code>getPullRequestDiff()</code> contract·stability retry가 유지됨
- created와 existing의 PENDING/RUNNING/POSTING/COMPLETED/FAILED/SUPERSEDED 각각이 섹션 6.2의 사실 기반 public 결과와 내부 metadata로 번역됨
- closed/merged PR은 <code>PR_NOT_REVIEWABLE</code>, Review/event/credit 0회
- persisted <code>githubAuthorId</code>와 다른 Account token밖에 없으면 worker가 외부 post 없이 안전하게 실패
- 두 action과 두 worker의 직접 <code>review.create</code> source 검색 결과 0건
- <code>legacy-runtime:</code> source 검색 결과 0건, <code>incrementReviewCount</code> 호출 결과 0건
- <code>canCreateReview</code> 정의·호출 결과 0건

### T04. GitHub webhook idempotency

#### 수정 파일

- 생성: <code>lib/github/github-webhook-delivery.ts</code>
- 생성: <code>lib/github/github-webhook-delivery.test.ts</code>
- 생성: <code>lib/github/github-webhook-delivery.integration.test.ts</code>
- 수정: <code>features/ai/types/index.ts</code>
- 수정: <code>features/ai/actions/review-pull-request.test.ts</code>
- 수정: <code>features/ai/actions/generate-pr-summary.test.ts</code>
- 수정: <code>features/review/lib/review-request.ts</code>
- 수정: <code>features/review/lib/review-request.test.ts</code>
- 수정: <code>features/review/lib/review-request.integration.test.ts</code>
- 수정: <code>app/api/webhooks/github/github-webhook-handler.ts</code>
- 수정: <code>app/api/webhooks/github/github-webhook-handler.test.ts</code>
- 수정: <code>app/api/webhooks/github/route.test.ts</code>

#### handler 순서

~~~text
event header 확인
-> raw body signature 검증
-> delivery header 확인
-> JSON parse와 action 추출
-> payload SHA-256 계산
-> delivery lease acquire
   -> processed: 200
   -> processing: 202
   -> acquired + requestKey 없음: event handler 실행
   -> acquired + requestKey 있음: exact Review 조회, 필요한 경우 같은 row QUEUE retry
-> 성공: delivery complete, 200
-> 실패: 알고 있는 requestKey와 safe error로 delivery fail, 500
~~~

missing delivery ID는 signature가 유효한 경우 <code>400</code>이다. invalid signature는 이전과 같이 <code>401</code>이며 delivery query를 호출하지 않는다.

event handler 결과가 Review request라면 handler가 delivery row ID와 lease token을 coordinator의 <code>transportBinding</code>으로 전달한다. coordinator는 Review 생성 또는 기존 exact Review 연결 transaction에서 requestKey를 delivery에 결합하며, <code>completeGithubWebhookDelivery()</code>는 이미 결합된 동일 key만 확인하고 PROCESSED로 바꾼다. ping, unknown event, 단순 ignored payload도 side effect가 정상 종료되었으므로 PROCESSED가 된다.

<code>dispatch-failed</code> 결과는 delivery를 FAILED로 남기되 <code>requestKey</code>를 함께 저장한다. 단, ambiguous send 뒤 worker가 먼저 exact queue fence를 회전한 경우는 dispatch 성공으로 분류해 delivery를 PROCESSED로 끝내고 현재 Review 상태를 덮어쓰지 않는다. 승인된 manual/API redelivery가 들어오면 새 Review를 만들지 않고 같은 Review의 QUEUE retry만 수행한다. active PROCESSING에 대한 <code>202</code>는 현재 lease owner가 계속 처리 중이라는 응답일 뿐 자동 재전송 예약을 뜻하지 않는다.

#### 테스트

- 동일 delivery 순차 재전송
- 동일 delivery 동시 acquire
- PROCESSING lease 미만 재전송
- lease 만료 takeover
- FAILED 재시도
- queue send 실패 뒤 requestKey가 FAILED delivery에 남고 manual redelivery가 같은 Review ID의 attempt만 증가시킴
- send promise가 resolve 또는 reject되기 전에 worker가 먼저 claim한 race에서는 delivery가 PROCESSED이고 Review의 WORKER fence·현재 status·checkpoint를 producer가 덮어쓰지 않음
- Review create와 delivery requestKey bind 사이 crash window가 없고 lease CAS 실패 시 둘 다 rollback
- bind 뒤 queue send 전 종료된 PENDING takeover가 새 snapshot/Review 없이 동일 attempt·event ID를 재전송하고, QUEUE lease가 만료됐으면 exact fence CAS로 token·lease만 회전한 뒤 QUEUED로 수렴
- route-private default composition이 delivery binding을 두 action의 객체 입력으로 넘기고 두 action이 이를 coordinator에 그대로 전달하며 binding 무시 branch가 없음
- requestKey가 있는 delivery retry에서 새 PR snapshot·새 Review create 0회
- 같은 delivery ID와 다른 payload hash 거절
- lease를 잃은 이전 handler가 PROCESSED/FAILED를 덮어쓰지 못함
- 24시간 이후에도 DB unique로 event, Review, resolution update가 한 번
- 실제 PostgreSQL unique 제약과 lease CAS에서 동시 acquire가 정확히 한 번만 <code>acquired</code>를 반환

### T05. command 권한과 review 라우팅

#### 수정 파일

- 수정: <code>features/ai/utils/command-parser.ts</code>
- 수정: <code>features/ai/types/index.ts</code>
- 수정: <code>features/ai/index.ts</code>
- 생성: <code>features/ai/utils/command-parser.test.ts</code>
- 수정: <code>features/ai/actions/review-pull-request.ts</code>
- 수정: <code>features/ai/actions/review-pull-request.test.ts</code>
- 수정: <code>lib/github/github.ts</code>
- 수정: <code>lib/github/github.test.ts</code>
- 수정: <code>app/api/webhooks/github/github-webhook-handler.ts</code>
- 수정: <code>app/api/webhooks/github/github-webhook-handler.test.ts</code>

#### 권한 helper

~~~ts
export type RepositoryBasePermission =
  | "admin"
  | "write"
  | "read"
  | "none";

export async function getRepositoryPermissionForUser(input: {
  token: string;
  owner: string;
  repo: string;
  username: string;
}): Promise<RepositoryBasePermission>;

export function canRunReviewCommand(
  permission: RepositoryBasePermission,
): boolean {
  return permission === "write" || permission === "admin";
}
~~~

구현은 <code>octokit.rest.repos.getCollaboratorPermissionLevel()</code>의 legacy <code>permission</code>을 사용한다. GitHub는 maintain을 write, triage를 read로 매핑하므로 별도 maintain branch를 만들지 않는다.

permission endpoint의 404는 권한 없음으로 처리한다. 401, 403, 429, 5xx와 네트워크 오류는 권한 없음으로 위장하지 않고 handler 실패로 처리해 delivery가 안전하게 재시도되게 한다.

#### command 처리

1. <code>issue_comment.created</code>와 PR comment인지 확인한다.
2. comment body, comment ID, comment author login을 파싱한다.
3. command가 아니면 ignored로 종료한다.
4. repository owner의 저장된 GitHub token으로 author permission을 조회한다.
5. read/none이면 <code>200</code> unauthorized 결과를 반환하고 delivery는 PROCESSED로 끝낸다.
6. write/admin이면 review 또는 summary를 <code>createReviewRequest()</code>로 dispatch한다. <code>pull_request/opened</code>·<code>synchronize</code>의 review action input은 <code>requestSource=AUTOMATIC</code>, issue comment의 review command input은 <code>requestSource=COMMAND</code>를 명시하며 action이 이를 coordinator에 그대로 전달한다.

P0의 <code>@hreviewer review</code>는 <code>FULL_REVIEW/FULL/nonce=default</code>다. 같은 head의 기존 자동 review가 있으면 그 row를 반환하며 재생성하지 않는다. 명시적 rerun은 P3의 <code>review full</code>이 comment ID nonce로 제공한다.

#### 테스트

- write, admin 허용
- maintain 응답의 legacy write 허용
- triage/read/none/404 거절
- permission API transient error에서 event 0회, delivery FAILED
- unauthorized에서 Review, event, credit reservation 0회
- parser가 반환하는 review와 summary가 모두 dispatch branch를 가짐
- 자동 review와 수동 review command가 각각 <code>AUTOMATIC</code>, <code>COMMAND</code> source를 action과 coordinator에 전달하고 같은 head의 semantic request key는 공유함
- malformed comment author와 unsupported command가 명시적 결과를 가짐

### T06. head supersede, debounce, stale-post 방지

#### 수정 파일

- 생성: <code>inngest/functions/schedule-automatic-review.ts</code>
- 생성: <code>inngest/functions/schedule-automatic-review.test.ts</code>
- 수정: <code>app/api/inngest/route.ts</code>
- 생성: <code>app/api/inngest/route.test.ts</code>
- 수정: <code>features/review/lib/review-request.ts</code>
- 수정: <code>features/review/lib/review-request.test.ts</code>
- 수정: <code>features/review/lib/review-request.integration.test.ts</code>
- 생성: <code>features/review/lib/review-head-guard.ts</code>
- 생성: <code>features/review/lib/review-head-guard.test.ts</code>
- 수정: <code>features/review/lib/pr-review.ts</code>
- 생성: <code>features/review/lib/pr-review.test.ts</code>
- 수정: <code>features/ai/actions/review-pull-request.ts</code>
- 수정: <code>features/ai/actions/review-pull-request.test.ts</code>
- 수정: <code>inngest/functions/review.ts</code>
- 수정: <code>inngest/functions/review.test.ts</code>
- 수정: <code>inngest/functions/summary.ts</code>
- 수정: <code>inngest/functions/summary.test.ts</code>
- 수정: <code>lib/github/github.ts</code>
- 수정: <code>lib/github/github.test.ts</code>
- 수정: <code>features/suggestion/actions/index.ts</code>

#### scheduler

~~~ts
export const scheduleAutomaticReview = inngest.createFunction(
  {
    id: "schedule-automatic-review",
    debounce: {
      key: "event.data.debounceKey",
      period: "15s",
    },
  },
  { event: "pr.review.auto-requested" },
  async ({ event, step }) => {
    await step.sendEvent("dispatch-review", {
      id:
        "hreviewer:review-run:" +
        event.data.reviewId +
        ":" +
        event.data.attempt,
      name: "pr.review.requested",
      data: event.data,
    });
  },
);
~~~

함수 내부 event 전달에는 <code>inngest.send()</code>가 아니라 <code>step.sendEvent()</code>를 사용한다.

#### review worker option

~~~ts
const generateReviewFunctionOptions = {
  id: "generate-review",
  concurrency: {
    key: "event.data.debounceKey",
    limit: 1,
  },
  cancelOn: [
    {
      event: "pr.review.superseded",
      if:
        "async.data.reviewId == event.data.reviewId && " +
        "async.data.attempt == event.data.attempt",
    },
  ],
};
~~~

summary worker도 concurrency 설정 없이 같은 exact reviewId/attempt <code>cancelOn</code> predicate를 사용한다. FULL_REVIEW와 SUMMARY supersede event는 같은 typed data를 쓰지만 각 run은 자신의 exact identity만 취소한다.

Inngest concurrency는 active step 수를 제한할 뿐 실행 전체를 mutex로 만들지 않는다. 각 critical step에서 DB 상태를 다시 확인한다.

<code>onFailure</code> 등록은 복구 contract를 구현하는 T07에서 이 option에 <code>onFailure: handleReviewFailure</code>를 추가한다.

#### supersede 순서

새 head Review create와 같은 request 흐름에서 같은 repository/PR, 같은 <code>reviewType</code>, 다른 head의 이전 PENDING, RUNNING, main post 미확인 POSTING을 CAS로 SUPERSEDED 처리한다. FULL_REVIEW와 SUMMARY는 서로를 취소하지 않는다. transaction에서 변경한 각 Review의 exact <code>{ reviewId, attempt }</code>를 반환하고 그 identity로 cancel event를 보낸다. commit 뒤 attempt를 재조회해 cancel identity를 조립하지 않는다.

- PENDING/RUNNING의 RESERVED credit는 T08에서 즉시 release 가능하다.
- POSTING인데 <code>githubMainPostedAt</code>가 null인 경우 post 결과가 모호할 수 있으므로 SUPERSEDED로 바꾸되 credit를 즉시 release하지 않는다. T07 reconciler가 marker를 찾아 consume 또는 release한다.
- SUPERSEDED로 바꾼 row의 execution lease는 지운다. 단, marker 확인이 필요한 RESERVED POSTING row는 T07 reconciler가 별도 대상 조건으로 조회한다.

#### head guard

~~~ts
export async function assertCurrentReviewHead(input: {
  reviewId: string;
  attempt: number;
  leaseToken: string;
  expectedHeadSha: string;
  allowedStatuses: readonly ReviewStatus[];
}): Promise<void>;
~~~

현재 public helper도 같은 task에서 다음 object-input·explicit-return contract로 바꾼다.

~~~ts
export type GetPullRequestHeadInfoInput = {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
};

export type PullRequestHeadInfo = {
  branch: string;
  headSha: string;
  state: string;
  merged: boolean;
  headRepoOwner: string;
  headRepoName: string;
  isFork: boolean;
};

export async function getPullRequestHeadInfo(
  input: GetPullRequestHeadInfoInput,
): Promise<PullRequestHeadInfo>;
~~~

<code>assertCurrentReviewHead()</code>는 Review 상태와 attempt/lease fence를 조회하고 이 helper를 객체 입력으로 사용해 SHA, <code>state === "open"</code>, <code>merged === false</code>를 함께 검사한다. 현재 유일한 consumer인 <code>features/suggestion/actions/index.ts</code>도 같은 task에서 객체 입력으로 바꾸며, 위치 인자 compatibility overload나 adapter는 남기지 않는다. 현재 <code>lib/github/github.test.ts</code>에는 이 helper의 직접 단위 테스트가 없으므로 T06에서 <code>pulls.get</code> 응답의 head SHA·state·merged·fork 정규화와 API 실패 전파 테스트를 추가한다. SHA 불일치나 closed/merged면 Review를 SUPERSEDED로 CAS하고 <code>SupersededReviewError</code>를 던진다.

상태와 head 검사는 각 외부 게시와 같은 <code>step.run()</code> 안에서 게시 직전에 수행한다. Inngest cancellation은 실행 중 step을 중단하지 않으므로 guard와 post를 서로 다른 step으로 분리하지 않는다. guard 통과 뒤에는 execution lease를 갱신한다.

호출 위치:

- full review generation 전
- summary generation 전
- main review/comment 직전
- inline issue/suggestion batch 직전
- verification review 직전
- summary comment 직전

#### 테스트

- head A, B가 15초 안에 들어오면 scheduler가 B event만 전달
- 수동 command는 scheduler를 거치지 않음
- head A Review가 SUPERSEDED, cancel event가 transaction에서 반환한 A의 exact ID와 attempt를 가지며 같은 Review ID의 다른 attempt run은 취소하지 않음
- generation 전 변경과 post 직전 변경 모두 외부 post 0회
- 같은 head redelivery는 semantic dedup으로 Review 1개
- <code>getPullRequestHeadInfo()</code>가 GitHub 응답의 head SHA·state·merged·fork를 그대로 정규화하고 API 실패를 숨기지 않음
- <code>getPullRequestHeadInfo()</code>의 public type이 object input과 <code>Promise&lt;PullRequestHeadInfo&gt;</code>를 고정하고, <code>features/suggestion/actions/index.ts</code>의 유일한 기존 호출과 head guard가 같은 contract를 사용하며 위치 인자 호출·overload가 0개
- <code>app/api/inngest/route.ts</code>가 <code>inngestFunctions</code> 배열을 export하고 <code>serve()</code>도 같은 배열을 사용하며, route test가 T06 시점의 exact 세 function identity와 concurrency/cancelOn config를 고정

### T07. 실패 복구와 lossless GitHub 게시

#### 수정 파일

- 생성: <code>features/review/lib/review-artifact-marker.ts</code>
- 생성: <code>features/review/lib/review-artifact-marker.test.ts</code>
- 생성: <code>features/review/lib/review-on-failure.ts</code>
- 생성: <code>features/review/lib/review-on-failure.test.ts</code>
- 생성: <code>lib/github/github-artifact-body.ts</code>
- 생성: <code>lib/github/github-artifact-body.test.ts</code>
- 생성: <code>lib/github/github-review-artifacts.ts</code>
- 생성: <code>lib/github/github-review-artifacts.test.ts</code>
- 생성: <code>features/review/actions/retry-review.ts</code>
- 생성: <code>features/review/actions/retry-review.test.ts</code>
- 생성: <code>features/review/lib/retry-review-request.test.ts</code>
- 생성: <code>features/review/ui/parts/review-retry-button.tsx</code>
- 생성: <code>features/review/ui/parts/review-retry-button.test.tsx</code>
- 수정: <code>features/review/actions/index.ts</code>
- 수정: <code>features/review/ui/review-detail.tsx</code>
- 수정: <code>features/review/ui/review-detail.test.tsx</code>
- 수정: <code>features/review/lib/pr-review.ts</code>
- 생성: <code>features/review/lib/pr-review.test.ts</code>
- 수정: <code>features/ai/lib/review-formatter.ts</code>
- 수정: <code>features/ai/lib/review-formatter.test.ts</code>
- 수정: <code>features/ai/lib/suggestion-format.ts</code>
- 생성: <code>features/ai/lib/suggestion-format.test.ts</code>
- 수정: <code>features/review/ui/parts/structured-review-body.tsx</code>
- 생성: <code>features/review/ui/parts/structured-review-body.test.tsx</code>
- 수정: <code>lib/github/github.ts</code>
- 수정: <code>lib/github/github.test.ts</code>
- 수정: <code>features/review/lib/review-execution-state.ts</code>
- 수정: <code>features/review/lib/review-execution-state.test.ts</code>
- 수정: <code>features/review/lib/review-request.ts</code>
- 수정: <code>features/review/constants/index.ts</code>
- 수정: <code>inngest/events.ts</code>
- 수정: <code>inngest/functions/review.ts</code>
- 수정: <code>inngest/functions/review.test.ts</code>
- 수정: <code>inngest/functions/summary.ts</code>
- 수정: <code>inngest/functions/summary.test.ts</code>
- 생성: <code>inngest/functions/reconcile-stale-review-executions.ts</code>
- 생성: <code>inngest/functions/reconcile-stale-review-executions.test.ts</code>
- 수정: <code>app/api/inngest/route.ts</code>
- 수정: <code>app/api/inngest/route.test.ts</code>

#### DB-before-post

review worker 순서를 다음으로 바꾼다.

1. fetch, generation, validation, verification, repeat detection 후 wrapper-free canonical review content를 만든다. 이 content와 main marker·title을 공용 builder에 넣어 generated footer까지 포함한 최종 main request body 후보를 조립하고 body budget을 검증한다.
2. transaction:
   - 검증을 통과한 wrapper-free canonical review content를 Review.review에 저장하고 reviewData, langCode, headSha 저장
   - 기존 attempt의 child가 있으면 안전하게 교체
   - Suggestion과 ReviewIssue create
   - status POSTING, lastCompletedStage PERSISTED, lease 갱신
3. 저장한 Review와 child를 DB에서 다시 읽음
4. head/status guard
5. marker lookup
6. main post
7. T07에서는 <code>recordGithubMainArtifact()</code>로 GitHub main ID, postedAt, MAIN_POSTED checkpoint를 저장한다. T08 이후 RESERVED review는 같은 fence를 받은 <code>consumeTrialCredit()</code>가 artifact 기록과 credit 소비를 한 transaction으로 수행하고, NOT_APPLICABLE review만 <code>recordGithubMainArtifact()</code>를 직접 호출한다.
8. inline post와 optional verification post
9. COMPLETED

main artifact만 완료 필수 조건이다. 모든 accepted issue는 main body에 이미 포함되므로 inline issue는 best-effort 표현이며, verification body는 rejected finding을 설명하는 advisory artifact다. inline 또는 verification 게시 실패는 안전하게 기록하되 COMPLETED를 막거나 main을 재게시하지 않는다. 반대로 main 게시가 확인되지 않으면 절대 COMPLETED로 전이하지 않는다.

summary worker도 같은 순서를 축약해 적용한다. 생성한 wrapper-free canonical summary content와 summary marker·title을 공용 builder에 넣어 최종 outbound 후보와 body budget을 먼저 검증하고, 통과한 content만 기존 SUMMARY Review.review에 저장해 POSTING/PERSISTED로 전이한 뒤 head/status guard, summary marker lookup, <code>issues.createComment</code>, GitHub ID/postedAt 저장, COMPLETED 순으로 처리한다. summary는 child row와 trial credit가 없으며, 외부 comment보다 DB content가 항상 먼저다.

<code>review-formatter.ts</code>와 <code>structured-review-body.tsx</code>는 모든 issue를 main body에 표시한다. inline issue도 file:line, title뿐 아니라 body 핵심, impact, recommendation이 보존되어야 한다. <code>suggestion-format.ts</code>는 accepted suggestion의 file/line, severity, explanation과 실제 replacement(<code>after</code>)를 fenced code block으로 main body에 보존하고, 기존 “Files changed 탭에서만 확인” hint를 실제 렌더링과 맞는 문구로 교체한다. replacement가 fence를 깨지 않도록 backtick run을 안전하게 감싸거나 indent-code 형식으로 정규화한다. 현재 formatter처럼 replacement를 inline artifact에만 두는 형식은 lossless가 아니다. inline API 또는 native suggestion 성공 여부와 fallback 경로가 main body의 정보량을 바꾸지 않는다.

수정 대상인 <code>structured-review-body.tsx</code>의 generic <code>Props</code>는 같은 task에서 <code>StructuredReviewBodyProps</code>로 구체화한다. 신규 <code>review-retry-button.tsx</code>도 <code>ReviewRetryButtonProps</code>를 사용한다.

GitHub REST 문서가 review/comment body의 안정적인 최대 길이를 계약으로 노출하지 않으므로 P0는 더 작은 application-owned budget을 둔다. 순수 모듈 <code>lib/github/github-artifact-body.ts</code>가 <code>GITHUB_ARTIFACT_BODY_BUDGET_BYTES = 60_000</code>, object-input <code>buildGithubArtifactBody()</code>, <code>assertGithubArtifactBodyBudget()</code>을 소유한다. lookup 모듈이 <code>lib/github/github.ts</code>를 참조하는 현재 방향과 posting wrapper의 runtime cycle을 만들지 않도록 body 조립 책임을 <code>github-review-artifacts.ts</code>에 넣지 않는다.

<code>Review.review</code>에는 제목·marker·generated footer가 없는 wrapper-free canonical content만 저장한다. builder만 이 content, deterministic marker, 선택적 title을 받아 title -> content -> marker -> generated footer 순서의 실제 request body를 만들고, <code>TextEncoder</code>로 계산한 UTF-8 byte 수를 검사한 뒤 반환한다. 입력 content에 전달된 exact marker가 이미 있으면 double wrapping으로 간주해 거절한다. worker의 DB-before-post preflight와 posting wrapper는 persisted content 및 동일한 marker/title tuple로 각각 builder를 호출하고, posting wrapper는 이미 조립된 final body를 입력으로 받거나 자체 문자열을 덧붙이지 않는다. 테스트는 preflight 결과와 Octokit request spy의 body가 byte-for-byte 같은지 고정한다. 이 계약으로 UI와 retry의 source는 wrapper-free persisted content이고, 최종 GitHub body의 유일한 조립 owner는 builder가 된다.

main review, summary, main fallback 후보는 DB-before-post transaction 전에 모두 검증하며 초과 시 내용을 자르거나 일부 issue/suggestion을 버리지 않고 GitHub 호출 0회, <code>FAILED/PERSIST</code>로 종료한다. T08 이후 RESERVED credit는 외부 게시가 시작되지 않았으므로 같은 terminal transaction에서 RELEASED로 전이한다. retry는 저장된 초과 content를 POST 단계부터 반복하지 않고 generation부터 다시 시작한다. inline issue/suggestion과 verification처럼 완료 필수가 아닌 artifact도 각 actual content와 marker를 builder로 조립해 게시 직전에 검사하며, 초과한 advisory artifact만 안전한 실패로 기록하고 main body의 정보를 줄이거나 main을 재게시하지 않는다.

GitHub posting 함수는 void가 아니라 생성한 primary artifact ID를 반환한다.

~~~ts
export type PostedGithubArtifact = {
  id: string;
  kind: "pull-request-review" | "review-comment" | "issue-comment";
  commitId: string | null;
  postedAt: Date;
};
~~~

<code>PostedGithubArtifact</code>의 owner는 <code>lib/github/github-review-artifacts.ts</code>다. body 조립 모듈의 public contract는 다음과 같다.

~~~ts
export const GITHUB_ARTIFACT_BODY_BUDGET_BYTES = 60_000;

export function buildGithubArtifactBody(input: {
  content: string;
  marker: string;
  title?: string;
}): string;

export function assertGithubArtifactBodyBudget(input: {
  body: string;
}): void;
~~~

T07에서 수정하는 posting export는 기존 positional 호출을 남기지 않고 다음 object-input·explicit-return contract로 통일한다. 3개 이상 positional parameter를 받는 호환 overload는 만들지 않는다.

~~~ts
export type PostReviewCommentInput = {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  content: string;
  marker: string;
  title?: string;
};

export async function postReviewComment(
  input: PostReviewCommentInput,
): Promise<PostedGithubArtifact>;

export async function postPRReviewWithSuggestions(
  input: PostPRReviewParams,
): Promise<PostedGithubArtifact>;

export async function postVerificationReview(
  input: PostVerificationReviewInput,
): Promise<PostedGithubArtifact>;
~~~

<code>PostReviewCommentInput</code>은 <code>lib/github/github.ts</code>, <code>PostPRReviewParams</code>와 <code>PostVerificationReviewInput</code>은 <code>features/review/lib/pr-review.ts</code>가 소유한다. <code>PostPRReviewParams</code>는 현재 <code>reviewBody</code>를 <code>reviewContent</code>로 바꾸고 <code>mainMarker</code>를 필수로 받으며, <code>PostVerificationReviewInput</code>은 <code>content</code>와 <code>marker</code>를 필수로 받는다. 세 posting wrapper는 이 wrapper-free content와 marker/title을 <code>buildGithubArtifactBody()</code>에 정확히 한 번 전달한 반환값만 Octokit body로 사용한다. review worker의 fallback과 summary worker를 포함한 모든 call site를 같은 task에서 객체 입력으로 바꾸고, positional compatibility layer나 prebuilt-body compatibility branch로 규약 위반과 이중 조립을 숨기지 않는다. issue comment는 <code>issues.createComment</code>, review 두 함수는 <code>pulls.createReview</code>의 실제 응답 ID와 API timestamp를 정규화해 반환하며 locally generated ID나 호출 시각을 성공 artifact로 꾸며 내지 않는다.

main review와 suggestion은 한 <code>pulls.createReview</code>에 포함할 수 있지만 main body와 각 suggestion body에 각각 marker를 넣는다. 이 API 응답은 main review ID만 반환하므로 <code>PostedGithubArtifact</code>는 main ID를 기록하고, suggestion별 artifact ID는 응답에서 꾸며 내지 않는다. suggestion 복구 검증은 <code>pulls.listReviewComments</code>의 marker·author·commit match를 사용한다. inline issues는 별도 step에서 persisted ReviewIssue별 marker를 사용하고 그 createReview 응답의 review ID를 기록할 필요는 없다. 모든 GitHub create/lookup 호출은 <code>GITHUB_POST_TIMEOUT_MS</code> 이하의 bounded abort signal을 사용한다. known validation 422처럼 서버가 artifact를 만들지 않았음이 확정된 오류만 head/state guard 뒤 fallback main comment로 전환한다. timeout, network disconnect, 5xx와 분류되지 않은 응답은 성공 가능성이 모호하므로 즉시 fallback·repost하지 않고 FAILED/POST와 reconciliation due lease로 넘긴다. fallback comment 자체의 timeout도 같은 ambiguity 규칙을 따른다.

#### retry

<code>retryReview</code> server action은 <code>requireAuthSession()</code> 뒤 Review -> Repository의 userId를 함께 조건으로 조회한다. 다른 사용자의 Review ID는 not-found 결과로 통일한다.

- retryable stage: QUEUE, FETCH, GENERATE, VERIFY, PERSIST, POST, RECONCILE
- COMPLETED와 SUPERSEDED는 retry 불가
- POST 또는 RECONCILE failure이고 <code>lastCompletedStage</code>가 <code>PERSISTED</code>, <code>MAIN_POSTED</code>, <code>INLINE_POSTED</code>, <code>VERIFICATION_POSTED</code> 중 하나이며 persisted <code>Review.review</code>가 non-empty이면 marker lookup과 posting 단계부터 재개한다. <code>reviewData</code>는 optional 구조화 projection이므로 markdown fallback의 <code>reviewData=null</code>을 generation 재실행 조건으로 사용하지 않는다.
- 그 외 실패는 같은 row를 PENDING으로 되돌리고 새 attempt event를 전송
- retry button은 FAILED이면서 retry 가능한 row에만 보인다

#### onFailure

Inngest <code>onFailure</code>에서 원 event는 <code>event.data.event</code>에 있다. 여기서 <code>reviewId</code>를 안전하게 파싱한다.

T07에서 <code>features/review/lib/review-on-failure.ts</code>를 원 event parsing, attempt/token/owner fencing, safe error normalization의 공용 owner로 만들고 review worker option에 <code>onFailure: handleReviewFailure</code>를 등록한다. summary worker에는 같은 owner로 구성하되 SUMMARY의 상태 전이만 처리하는 별도 handler를 등록한다.

- 이미 FAILED, COMPLETED 또는 SUPERSEDED면 아무것도 쓰지 않는다.
- PENDING은 QUEUE owner, RUNNING/POSTING은 WORKER owner일 때만 원 event의 <code>attempt</code>가 현재 attempt와 같은지 확인하고, 읽은 exact lease token을 CAS 조건으로 현재 stage를 FAILED로 바꾼다. reconciler가 이미 token을 회전했거나 새 retry attempt가 시작된 경우 아무것도 쓰지 않는다.
- 오류는 name, numeric status, allowlisted internal code만 최대 1,000자로 정규화한다.
- raw response, token, prompt, diff, stack은 저장하지 않는다.
- POST stage의 RESERVED credit는 marker 확인 전 release하지 않는다.
- QUEUE/FETCH/GENERATE/VERIFY/PERSIST 단계에서 terminal FAILED로 바꿀 때는 T08 이후 같은 transaction에서 RESERVED credit를 RELEASED로 바꾼다. 상태만 실패시키고 credit를 남기는 경로를 허용하지 않는다.

#### stale reconciler

~~~ts
export const reconcileStaleReviewExecutions = inngest.createFunction(
  { id: "reconcile-stale-review-executions" },
  { cron: "*/10 * * * *" },
  async ({ step }) => {
    // 한 run에서 updatedAt 오름차순 최대 50개 처리
  },
);
~~~

대상:

- non-null lease가 만료된 PENDING, RUNNING, POSTING
- <code>failureStage</code>가 POST 또는 RECONCILE이고, persisted body 또는 RESERVED credit 때문에 marker 확인이 필요하며 reconciliation lease가 null이거나 만료된 FAILED
- POSTING에서 supersede되어 RESERVED가 남고 reconciliation lease가 null이거나 만료된 SUPERSEDED

FAILED와 SUPERSEDED는 일반 terminal 전이에서 execution lease를 null로 지우지만 marker ambiguity가 남은 row는 같은 column을 reconciliation due lease로 재사용한다. cron은 대상 row를 처리하기 전에 만료 조건과 기존 token을 CAS해 새 RECONCILER token을 획득함으로써 같은 row의 동시 lookup을 한 번으로 제한한다. marker 확인으로 수렴하면 token/owner/expiry를 null로 지우고, GitHub 조회 자체가 실패하면 exact token으로 다음 허용 시각까지 연장한다. 따라서 terminal row의 lease 연장이 대상 query에서 무시되어 매 cron마다 GitHub를 호출하는 경로를 두지 않는다.

수렴:

| 확인 결과 | 상태 |
| --- | --- |
| main marker 존재, 현재 POSTING/FAILED | trusted artifact와 non-empty DB body를 확인하고 artifact 기록, COMPLETED CAS, RESERVED의 CONSUMED를 같은 transaction에서 수행 |
| main marker 존재, 현재 SUPERSEDED | GitHub ID/postedAt 기록, credit CONSUMED, SUPERSEDED 유지 |
| PENDING/RUNNING이며 PERSISTED 이전 | 외부 main post가 시작되지 않았으므로 즉시 FAILED/RECONCILE, RESERVED이면 RELEASED |
| marker 검색 첫 성공, main marker 없음, ambiguity row | <code>artifactLookupMissedAt=now</code>, credit RESERVED와 상태 유지, grace 이후 due lease 설정 |
| grace 이후 두 번째 독립 검색도 main marker 없음, 현재 PENDING/RUNNING/POSTING/FAILED | FAILED/POST 또는 FAILED/RECONCILE, credit RELEASED, missedAt 정리 |
| grace 이후 두 번째 독립 검색도 main marker 없음, 현재 SUPERSEDED | credit RELEASED, SUPERSEDED 유지, missedAt 정리 |
| GitHub 조회 자체 실패 | 상태 추측 금지, lease만 다음 주기로 연장 |
| persisted body 없음 | FAILED/RECONCILE, generation retry 가능 |

표의 “main marker”는 FULL_REVIEW에서는 <code>main</code>, SUMMARY에서는 <code>summary</code> primary marker를 뜻한다. reconciler는 <code>reviewType</code>으로 endpoint와 marker를 선택하고 SUMMARY에는 credit transition을 수행하지 않는다. 첫 negative lookup은 post timeout 직후의 read-after-write 지연이나 아직 완료 중인 요청을 “artifact 없음”으로 확정하지 않는다. 새 post attempt를 시작하거나 trusted marker를 찾으면 <code>artifactLookupMissedAt</code>를 null로 지운다. manual retry도 ambiguity row는 reconciler lookup부터 시작하며 두 번의 spaced absence 확인 전 재게시하지 않는다.

PENDING은 T03에서 생성 시 queue lease를 받으므로 event send 성공 뒤 worker가 시작되지 않은 row도 이 대상에 포함된다. reconciler가 먼저 FAILED로 바꾼 뒤 늦은 event가 도착하면 worker의 <code>PENDING -> RUNNING</code> CAS가 실패하고 외부 side effect 없이 종료해야 한다. RUNNING/POSTING은 각 장기 단계가 execution lease를 갱신한다. 수렴이 끝난 terminal 상태는 lease를 null로 지우되, marker 조회 실패처럼 아직 모호성이 남은 FAILED·SUPERSEDED는 다음 조회 시각의 reconciliation due lease를 유지한다.

#### 테스트

- inline API 전부 실패해도 main body에 모든 issue 전문과 모든 accepted suggestion의 explanation/replacement
- formatter와 최종 structured body가 모든 inline/general issue의 body 핵심·impact·recommendation 및 accepted suggestion의 path/line/explanation/<code>after</code>를 보존
- wrapper-free persisted content와 동일 marker/title tuple로 preflight와 posting wrapper가 만든 최종 outbound body가 byte-for-byte 같고 marker를 정확히 한 번 포함하며, prebuilt body 또는 exact marker가 이미 든 content는 거절
- marker·title·footer까지 조립한 최종 outbound body의 UTF-8 크기가 60,000 bytes이면 허용하고 60,001 bytes이면 GitHub 호출 전에 거절하며, main/summary 초과는 절단 없이 FAILED/PERSIST와 RESERVED release, advisory artifact 초과는 main 재게시 없이 해당 artifact 실패로 수렴
- main·suggestion·inline·verification·summary·fallback의 최종 GitHub 요청 body가 해당 marker를 정확히 한 번 포함하고, main/verification/summary wrapper가 해당 primary artifact의 ID, commit ID, API timestamp의 <code>postedAt</code>을 정규화해 반환하며 suggestion별 ID는 lookup 결과에서만 얻음
- <code>postReviewComment()</code>, <code>postPRReviewWithSuggestions()</code>, <code>postVerificationReview()</code>와 review/summary worker의 모든 call site가 object input과 explicit <code>Promise&lt;PostedGithubArtifact&gt;</code> contract를 사용하고 3개 이상 positional parameter overload가 0개
- main post timeout 후 marker 존재 시 재게시 0회
- main post timeout 후 첫 marker miss에서는 repost/release 0회, grace 뒤 marker 발견 시 COMPLETED/CONSUMED, 두 번째 독립 miss에서만 RELEASED
- deterministic validation 422만 fallback comment 1회, timeout/network/5xx/unknown은 즉시 fallback 0회
- marker가 page 2 이후에 있어도 발견
- 같은 marker라도 작성자 GitHub user ID가 다르면 무시하고, 같은 작성자여도 pull-request artifact의 commit ID가 Review.headSha와 다르면 무시
- post 성공 뒤 DB 응답 유실을 reconciler가 COMPLETED로 수렴
- COMPLETED인데 non-empty GitHub artifact가 없거나 persisted review body가 빈 row의 전이 실패
- 정상 POSTING 경로는 main post 직후 GitHub ID/postedAt과 <code>MAIN_POSTED</code>를 즉시 기록하고, 완료 CAS는 persisted body와 그 artifact를 필수 조건으로 검사
- marker-confirmed FAILED 복구는 artifact 기록, <code>lastCompletedStage</code>, COMPLETED, lease 정리를 하나의 transaction으로 기록
- process 종료 뒤 stale PENDING/RUNNING/POSTING이 비종료 상태로 남지 않음
- queue 뒤 worker 미시작 PENDING이 lease 만료 후 FAILED/RECONCILE로 수렴하고 늦은 event의 외부 post는 0회
- onFailure가 terminal 상태를 덮어쓰지 않음
- 이전 attempt의 onFailure가 새 attempt나 RECONCILER token owner를 덮어쓰지 않음
- lease 만료 후 token을 잃은 worker가 GitHub post·artifact 기록·COMPLETED 전이를 수행하지 못하고, 동시 reconciler 중 token owner만 수렴
- retry action의 미인증·타 사용자 Review 접근은 not-found로 수렴하고 event·DB write 0회
- retry button은 FAILED이면서 retry 가능한 row에만 표시
- POST retry에서 AI 호출 0회
- markdown fallback으로 <code>reviewData=null</code>인 POST/RECONCILE retry도 persisted <code>Review.review</code>만 사용하고 AI 호출 0회
- FAILED/RECONCILE/RESERVED ambiguity가 due lease 대상에 포함되고 marker 조회 실패 시 lease 전까지 중복 lookup 0회
- summary comment timeout 뒤 summary marker가 있으면 재게시 0회, 두 번의 spaced absence 확인 뒤에만 저장된 summary body로 재시도

### T08. 무료 5회 체험과 상품 UI 정합성

#### 파일 인벤토리

- 수정: <code>features/payment/constants/flags.ts</code>
- 수정: <code>features/payment/constants/index.ts</code>
- 생성: <code>features/payment/lib/review-trial.ts</code>
- 생성: <code>features/payment/lib/review-trial.test.ts</code>
- 생성: <code>features/payment/lib/review-trial.integration.test.ts</code>
- 수정: <code>features/payment/lib/subscription.ts</code>
- 수정: <code>features/payment/actions/config.ts</code>
- 생성: <code>features/payment/actions/config.test.ts</code>
- 수정: <code>features/payment/ui/subscription-page.tsx</code>
- 수정: <code>features/payment/ui/parts/plan-card.tsx</code>
- 생성: <code>features/payment/ui/parts/plan-card.test.tsx</code>
- 수정: <code>features/payment/ui/parts/usage-card.tsx</code>
- 생성: <code>features/payment/ui/parts/usage-card.test.tsx</code>
- 수정: <code>features/review/lib/review-request.ts</code>
- 수정: <code>features/review/lib/review-request.test.ts</code>
- 수정: <code>features/review/lib/review-request.integration.test.ts</code>
- 수정: <code>features/review/lib/retry-review-request.test.ts</code>
- 수정: <code>features/review/actions/retry-review.ts</code>
- 수정: <code>features/review/actions/retry-review.test.ts</code>
- 수정: <code>features/review/lib/review-execution-state.ts</code>
- 수정: <code>features/review/lib/review-execution-state.test.ts</code>
- 수정: <code>features/review/lib/review-on-failure.ts</code>
- 수정: <code>features/review/lib/review-on-failure.test.ts</code>
- 기존 계약 확인(변경 없음): <code>features/ai/types/index.ts</code>
- 기존 계약 확인(변경 없음): <code>features/ai/actions/review-pull-request.ts</code>
- 수정: <code>features/ai/actions/review-pull-request.test.ts</code>
- 기존 계약 확인(변경 없음): <code>app/api/webhooks/github/github-webhook-handler.ts</code>
- 수정: <code>app/api/webhooks/github/github-webhook-handler.test.ts</code>
- 수정: <code>inngest/functions/review.ts</code>
- 수정: <code>inngest/functions/reconcile-stale-review-executions.ts</code>
- 수정: <code>inngest/functions/reconcile-stale-review-executions.test.ts</code>
- 수정: <code>features/repository/actions/index.ts</code>
- 수정: <code>features/repository/constants/index.ts</code>
- 생성: <code>features/repository/lib/repository-disconnect.ts</code>
- 생성: <code>features/repository/lib/repository-disconnect.test.ts</code>
- 생성: <code>features/repository/lib/repository-disconnect.integration.test.ts</code>
- 수정: <code>features/settings/actions/index.ts</code>
- 생성: <code>features/settings/actions/index.test.ts</code>
- 수정: <code>lib/github/github.ts</code>
- 수정: <code>lib/github/github.test.ts</code>
- 수정: <code>docs/proposals/hreviewer-personal-review-coach-p0-implementation-plan.md</code>
- 수정: <code>docs/proposals/hreviewer-personal-review-coach-roadmap.md</code>

#### 상수와 flag

체험 관련 신규 상수 중 client-safe limit는 <code>features/payment/constants/index.ts</code>가 소유한다. 이 파일의 기존 query key, 가격, 기능표는 보존하고 T08의 상품 copy만 같은 task에서 수정한다.

~~~ts
export const FREE_REVIEW_TRIAL_LIMIT = 5;
~~~

환경 변수 기반 server-only flag는 <code>features/payment/constants/flags.ts</code>가 소유한다. 기존 <code>PRO_UPGRADE_ENABLED</code>와 공용 <code>TRUE_VALUES</code>를 보존하고 같은 파일에 체험 flag를 추가한다.

~~~ts
import "server-only";

export const FREE_REVIEW_TRIAL_ENABLED = TRUE_VALUES.has(
  (process.env.FREE_REVIEW_TRIAL_ENABLED ?? "")
    .trim()
    .toLowerCase(),
);
~~~

flag가 false이면 Free의 current Pro-only 동작을 유지한다. summary는 flag와 무관하게 허용하되 동일 head의 semantic dedup을 적용한다.

flag와 tier는 신규 생성 또는 RESERVED가 아닌 FULL_REVIEW retry의 reservation transaction에서 entitlement를 결정한다. 이미 RESERVED인 실행은 이후 flag off 또는 tier 변경으로 취소·반환하지 않고 marker 결과에 따라 CONSUMED/RELEASED로 끝낸다. 따라서 요청 당시 Free로 예약한 review는 완료 전에 Pro로 업그레이드되어도 trial 1회를 소비한다. 반대로 Pro일 때 NOT_APPLICABLE로 생성된 실패 review를 Free 전환 뒤 retry하면 현재 flag와 체험 한도를 다시 적용하며, 이 두 정책을 테스트와 UI 도움말에 고정한다.

<code>flags.ts</code>는 <code>import "server-only"</code>를 사용한다. <code>FREE_REVIEW_TRIAL_LIMIT</code>만 client-safe constants에서 공유하고, 환경 변수 기반 flag는 client-facing barrel에서 재수출하지 않는다.

#### atomic reservation

<code>review-trial.ts</code>는 Prisma <code>Serializable</code> transaction과 P2034 최대 3회 재시도, 즉 최초 시도를 포함한 최대 4회 attempt를 캡슐화한다.

~~~ts
import type { GithubWebhookTransportBinding } from "@/lib/github/github-webhook-delivery";

type TrialTransactionRunner = Pick<typeof prisma, "$transaction">;

type TrialMutationClient = Pick<
  Prisma.TransactionClient,
  "review" | "user" | "userUsage" | "githubWebhookDelivery"
>;

type CreatePendingReviewInput = {
  userId: string;
  repositoryId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  headSha: string;
  githubAuthorId: string;
  reviewType: "FULL_REVIEW" | "SUMMARY";
  reviewMode: "FULL";
  requestSource: "AUTOMATIC" | "COMMAND";
  requestKey: string;
  langCode: LanguageCode;
  maxSuggestions: number | null;
  verificationEnabled: boolean;
  queueLeaseToken: string;
  queueLeaseExpiresAt: Date;
  transportBinding?: GithubWebhookTransportBinding;
};

export type CreateReviewWithTrialReservationResult =
  | {
      kind: "created";
      review: Review;
      supersededReviewRuns: Array<{ reviewId: string; attempt: number }>;
    }
  | {
      kind: "rejected";
      reason: "PLAN_RESTRICTED" | "TRIAL_EXHAUSTED";
    };

export async function createReviewWithTrialReservation(
  input: CreatePendingReviewInput,
  runner?: TrialTransactionRunner,
): Promise<CreateReviewWithTrialReservationResult>;

export type TrialCreditExecutionFence = {
  reviewId: string;
  attempt: number;
  leaseToken: string;
  leaseOwner: "QUEUE" | "WORKER" | "RECONCILER";
  allowedStatuses: readonly ReviewStatus[];
};

export async function consumeTrialCredit(
  input: TrialCreditExecutionFence & {
    githubMainReviewId: string;
    postedAt: Date;
  },
  client: TrialMutationClient,
): Promise<boolean>;

export async function releaseTrialCredit(
  input: TrialCreditExecutionFence,
  client: TrialMutationClient,
): Promise<boolean>;

export type PrepareTrialCreditForRetryResult =
  | {
      kind: "ready";
      trialCreditState: "NOT_APPLICABLE" | "RESERVED";
    }
  | {
      kind: "rejected";
      reason: "PLAN_RESTRICTED" | "TRIAL_EXHAUSTED";
    }
  | { kind: "conflict"; reason: "INVALID_CREDIT_STATE" };

export async function prepareTrialCreditForRetry(
  reviewId: string,
  client: TrialMutationClient,
): Promise<PrepareTrialCreditForRetryResult>;
~~~

transaction을 여는 root runner와 transaction 안에서 mutation만 수행하는 client를 같은 타입으로 합치지 않는다. 신규 생성은 <code>createReviewWithTrialReservation()</code>이 serializable root transaction을 소유한다. webhook transport binding이 있으면 Review create/credit reservation과 <code>bindGithubWebhookDeliveryRequest()</code>를 그 같은 transaction client에서 실행한다. retry는 <code>retryReviewRequest()</code>가 같은 P2034 retry policy의 serializable root transaction을 열고, <code>prepareTrialCreditForRetry()</code>와 FAILED -> PENDING 상태 전이를 같은 transaction client로 호출한다. consume/release는 artifact·Review credit·UserUsage·상태 전이의 root transaction을 소유한 worker, reconciler, failure 또는 supersede call site가 넘긴 transaction client를 필수로 받으며, default <code>prisma</code>나 optional client로 transaction 밖의 두 write를 허용하지 않는다. consume/release와 execution-state helper는 그 transaction 안에서 nested transaction 없이 실행한다. <code>rejected</code> 결과는 <code>createReviewRequest()</code> 또는 retry action의 같은 reason으로 전달하며 예외 문자열 파싱으로 entitlement 결과를 구분하지 않는다.

<code>CreatePendingReviewInput</code>은 <code>review-trial.ts</code>가 소유하는 feature-internal type이며 public barrel에서 재수출하지 않는다. coordinator가 GitHub·repository·user lookup을 끝낸 뒤 검증된 snapshot과 queue lease만 전달하고, trial helper는 GitHub를 다시 조회하거나 event를 보내지 않는다. <code>status=PENDING</code>, <code>attemptCount=1</code>, <code>executionLeaseOwner=QUEUE</code>, <code>review=""</code>와 entitlement별 credit state는 helper가 위 입력에서 파생한다. supersede 후보와 현재 tier/usage는 stale caller 값이 아니라 serializable transaction 안에서 다시 읽는다.

<code>consumeTrialCredit()</code>와 <code>releaseTrialCredit()</code>는 Review의 credit state를 쓰는 실행 helper이므로 ID만 받아 최신 row의 lease를 다시 읽어 대신 사용하지 않는다. 두 helper의 Review <code>updateMany()</code> where에는 <code>reviewId</code>, <code>attemptCount</code>, <code>executionLeaseToken</code>, <code>executionLeaseOwner</code>, 허용 status와 기존 credit state를 모두 넣는다. fence가 일치하지 않으면 <code>ReviewStateConflictError</code>를 던지고 UserUsage를 바꾸지 않는다. <code>false</code>는 같은 fence 아래 이미 목표 credit state여서 idempotent no-op인 경우에만 사용한다. worker와 reconciler는 자신이 획득한 token을 전달하고, supersede coordinator는 transaction 안에서 읽은 이전 Review의 exact attempt/token/owner를 전달한다. 호출자가 status만 보고 현재 token을 재조회하거나, token을 잃은 이전 attempt가 새 reservation을 consume/release하는 경로를 허용하지 않는다.

transaction 내부:

T08의 신규 request transaction은 먼저 exact Repository parent row를 <code>SELECT ... FOR UPDATE</code>로 lock하고 그 뒤 UserUsage, Review 순서로 접근한다. repository disconnect도 같은 <code>Repository -> UserUsage -> Review</code> lock order를 사용한다. retry·worker·reconciler처럼 Repository를 쓰지 않는 경로는 Review만 lock한 뒤 Repository/UserUsage lock을 역방향으로 추가하지 않는다.

1. locked repository의 user tier를 다시 읽고, 필요한 UserUsage를 lock/upsert한 뒤 같은 repository/PR·같은 <code>reviewType</code>·다른 head의 supersede 후보를 ID 오름차순으로 transaction 안에서 다시 읽고 lock한다.
2. SUMMARY는 credit가 NOT_APPLICABLE, Pro FULL_REVIEW는 NOT_APPLICABLE로 결정한다. Free FULL_REVIEW에서 flag가 false면 어떤 Review나 supersede write도 하기 전에 PLAN_RESTRICTED로 거절한다.
3. Free FULL_REVIEW는 1번에서 lock/upsert한 UserUsage의 현재 count와 이전 PENDING/RUNNING 후보 중 RELEASE 가능한 RESERVED 수를 함께 계산한다. 같은 transaction에서 UserUsage를 다시 upsert하지 않는다. <code>effectiveUsed = trialReviewCreditsUsed - releasableReservedCount</code>가 5 이상이면 이전 Review를 건드리지 않고 TRIAL_EXHAUSTED로 반환한다. POSTING/ambiguity RESERVED는 releasable 수에 포함하지 않는다.
4. entitlement가 새 row 생성을 허용한 뒤에만 같은 type의 이전 PENDING/RUNNING을 SUPERSEDED로 전이한다. RESERVED이면 RELEASED와 count 감소를 같은 transaction에서 수행한다. main post 미확인 POSTING도 SUPERSEDED로 전이하되 credit는 반환하지 않고 T07 marker reconciliation에 맡긴다. SUMMARY와 Pro도 같은 type/different-head supersede를 이 순서로 수행한다.
5. Free FULL_REVIEW는 조건부 usage update와 Serializable/P2034 retry로 count가 5 미만일 때만 1 증가시키고 새 Review를 RESERVED로 만든다. SUMMARY/Pro는 count 변경 없이 NOT_APPLICABLE Review를 만든다.
6. webhook transport binding이 있으면 같은 transaction에서 delivery requestKey도 CAS한다.
7. requestKey unique 충돌, delivery binding conflict, conditional usage update 실패면 transaction 전체가 rollback된다. 밖에서 unique requestKey만 기존 Review로 해석하며, quota conflict는 retry 후에도 지속될 때 TRIAL_EXHAUSTED로 반환한다. rejected 결과가 이전 Review 상태나 count를 부분 commit하는 경로를 두지 않는다.
8. commit 뒤 transaction이 반환한 <code>supersededReviewRuns</code>의 exact <code>reviewId</code>와 <code>attempt</code>마다 cancel event를 보낸다. event 전송 실패는 DB 원자성을 되돌리지 않으며 head guard가 최종 안전장치다. commit 뒤 attempt를 다시 읽어 event ID를 조립하지 않는다.

T06의 supersede coordinator는 T08에서 이 transaction으로 상태 전이와 credit 반환을 옮긴다. 따라서 Free 사용량이 이미 5인 계정도 아직 게시하지 않은 이전 head를 새 head로 교체할 수 있다.

consume:

- Review의 RESERVED -> CONSUMED CAS와 <code>recordGithubMainArtifact()</code>를 한 transaction에서 수행
- WORKER 또는 RECONCILER owner와 POSTING/FAILED/SUPERSEDED 중 호출 목적에 맞는 status만 허용하고, 두 write에 동일한 attempt/token/owner fence를 사용
- UserUsage count는 이미 reserved+consumed 수이므로 증가시키지 않음

release:

- RESERVED -> RELEASED CAS가 성공한 경우에만 UserUsage count를 1 감소
- count가 0 아래로 내려가지 않게 조건부 update
- 같은 fence와 허용 status가 유지된 transaction context에서 helper만 두 번 호출하면 두 번째는 false이며 count를 바꾸지 않음. release와 terminal status 전이를 commit한 뒤 lease가 정리된 row에 이전 fence로 다시 호출하는 것은 idempotent no-op이 아니라 stale writer이므로 <code>ReviewStateConflictError</code>
- RELEASED Review retry는 새 reservation transaction을 통과해야 함
- QUEUE/FETCH/GENERATE/VERIFY/PERSIST failure와 PENDING/RUNNING supersede처럼 외부 main post가 시작되지 않았거나, reconciler가 두 번째 독립 marker miss를 확정한 경로에서만 호출. POST ambiguity에는 호출하지 않음

retry reservation:

- SUMMARY의 NOT_APPLICABLE은 count 변경 없이 ready다.
- FULL_REVIEW의 NOT_APPLICABLE은 현재 사용자가 Pro일 때만 count 변경 없이 ready다. 현재 사용자가 Free이면 flag와 <code>trialReviewCreditsUsed &lt; 5</code>를 검사해 허용 시 count 증가와 NOT_APPLICABLE -> RESERVED를 FAILED -> PENDING, attempt 증가, failure 초기화, 새 queue lease와 같은 transaction에 묶는다. flag off 또는 exhausted이면 Review를 FAILED/NOT_APPLICABLE로 그대로 두고 entitlement rejection을 반환한다.
- POST 또는 RECONCILE ambiguity 때문에 RESERVED를 유지한 Review는 count를 다시 올리지 않고 persisted body와 marker lookup부터 재개한다. 그 밖의 stage에서 RESERVED가 남아 있으면 invariant conflict로 거절하고 reconciler에 맡긴다.
- RELEASED를 retry할 때 현재 사용자가 Pro이면 RELEASED -> NOT_APPLICABLE로 바꾸고 count를 증가시키지 않는다.
- RELEASED를 retry할 때 현재 사용자가 Free이면 flag와 <code>trialReviewCreditsUsed < 5</code>를 다시 검사한다. 허용되면 count 증가와 RELEASED -> RESERVED, FAILED -> PENDING, attempt 증가, failure 초기화, 새 queue lease를 한 transaction에 묶고, flag off 또는 exhausted이면 Review를 FAILED로 그대로 둔다.
- CONSUMED는 retry reservation 대상이 아니다. marker가 확인된 terminal 결과는 reconciler가 COMPLETED 또는 SUPERSEDED로 수렴시킨다.
- retry transaction commit 뒤에만 event를 보내며 최초 생성과 같은 fence-aware dispatch finalize를 사용한다. send 성공 acknowledgement는 exact PENDING/QUEUE fence에서만 QUEUED를 쓰고, send promise 실패 보상도 그 fence가 남아 있을 때만 commit한다. 보상이 이기면 일반 pre-post retry는 FAILED/QUEUE 전이와 방금 확보한 RESERVED credit release를 한 transaction에서 수행하고, 기존 POST/RECONCILE ambiguity를 재개하던 retry는 원래 failureStage를 복원하고 RESERVED를 유지해 marker 확인 전 credit를 반환하지 않는다. worker claim이 먼저 이겨 fence를 잃었다면 producer는 실패 보상·credit 변경을 하지 않고 현재 factual status를 반환한다.

실패·supersede·retry와 credit 정산은 다음처럼 고정한다.

| 실행 사건 | 같은 DB transaction의 credit 처리 |
| --- | --- |
| QUEUE/FETCH/GENERATE/VERIFY/PERSIST terminal FAILED | RESERVED이면 RELEASED와 count 감소 |
| PENDING/RUNNING SUPERSEDED | RESERVED이면 RELEASED와 count 감소 |
| main 게시 결과가 모호한 POSTING/FAILED/SUPERSEDED | RESERVED 유지 |
| marker 존재 확인 | CONSUMED와 GitHub ID/postedAt 기록 |
| grace 뒤 두 번째 독립 marker 검색도 main marker 없음 | RELEASED와 count 감소 |
| RELEASED Review retry | 새 reservation에 성공한 뒤 PENDING 전이 |

각 failure call site는 <code>releaseTrialCredit()</code>과 <code>transitionReviewExecution()</code>을 하나의 <code>prisma.$transaction()</code>에서 호출한다. release는 전이 전의 exact fence로 먼저 CAS하고, 뒤따르는 status 전이가 실패하면 transaction 전체를 rollback한다. marker-confirmed consume은 <code>recordGithubMainArtifact()</code>와 credit CAS에 같은 fence를 전달하고 둘 중 하나라도 실패하면 모두 rollback한다. POST ambiguity는 release helper를 호출하지 않고 reconciler에 맡긴다. status만 바뀌거나 artifact/credit/count 중 일부만 바뀐 중간 상태가 commit되지 않음을 unit test와 PostgreSQL integration test에서 모두 검증한다.

<code>ReviewPullRequestResult</code>는 T03에서 정한 top-level shape와 status mapping을 유지하면서 T08에서 failure reason에 <code>trial_exhausted</code>를 추가한다. coordinator의 <code>PLAN_RESTRICTED</code>와 <code>TRIAL_EXHAUSTED</code>는 각각 <code>plan_restricted</code>와 <code>trial_exhausted</code>로 번역한다. route-private webhook handler는 두 entitlement 거절을 정상 처리된 <code>200</code> 결과로 보고 delivery를 PROCESSED로 끝낸다. queue, DB, GitHub 같은 운영 실패만 <code>500</code>과 FAILED delivery가 된다. 따라서 한도 소진이 redelivery 대상 운영 장애로 오인되지 않는다.

<code>reviewCounts</code> JSON은 schema 호환을 위해 유지하지만 T03부터 더 이상 증가시키지 않는다. entitlement와 UI 표시에는 사용하지 않으며, 이후 통계가 필요하면 Review row를 source로 계산한다.

#### repository disconnect와 cascade 안전성

현재 <code>Repository -> Review</code> 관계는 <code>onDelete: Cascade</code>이고 <code>disconnectRepository()</code>/<code>disconnectAllRepositoriesInternal()</code>은 Review 상태를 검사하지 않은 채 webhook 삭제 뒤 Repository를 지운다. PENDING/RUNNING/POSTING 실행, RECONCILER가 조사 중인 ambiguity, RESERVED credit가 이 경로로 사라지면 GitHub artifact·Review·사용량의 source가 분리된다. T08은 <code>features/repository/lib/repository-disconnect.ts</code>를 단일 disconnect owner로 만들고 두 action이 이 use case만 호출하게 한다.

- 단일·전체 연결 해제는 Prisma interactive <code>Serializable</code> transaction에서 대상 Repository를 사용자 소유권과 함께 다시 조회하고, ID 오름차순의 exact row에 <code>SELECT ... FOR UPDATE</code>를 건다. 그 뒤 UserUsage, 대상 Review ID 오름차순의 공통 <code>Repository -> UserUsage -> Review</code> 순서로 lock한다. T08의 신규 request reservation도 exact Repository를 먼저 lock해 같은 순서를 지킨다. parent row lock은 concurrent 신규 Review insert를, Review row lock은 retry·worker·reconciler 상태 변경을 transaction 종료까지 직렬화한다.
- lock 뒤 Review 중 status가 PENDING/RUNNING/POSTING이거나 <code>executionLeaseOwner=RECONCILER</code>이거나 <code>trialCreditState=RESERVED</code>인 row가 하나라도 있으면 GitHub 호출과 DB delete를 모두 0회로 두고 안전한 <code>ACTIVE_REVIEW</code> domain error를 반환한다. COMPLETED/FAILED/SUPERSEDED이며 RECONCILER·RESERVED가 아닌 terminal history만 cascade delete할 수 있고 CONSUMED credit는 이미 사용된 값으로 유지한다.
- guard를 통과한 뒤 같은 bounded transaction 안에서 각 대상의 webhook을 ID 순으로 삭제하고, 모든 delete가 <code>deleted</code> 또는 <code>absent</code>로 확인된 경우에만 Repository delete와 <code>UserUsage.repositoryCount</code> 갱신을 같은 commit에 묶는다. 단일·전체 경로 모두 기존 별도 <code>decrementRepositoryCount()</code>나 transaction 밖 <code>deleteMany()</code>를 사용하지 않는다. 전체 연결 해제는 모든 row와 Review를 먼저 lock·preflight한 뒤 첫 외부 호출을 시작해 일부 대상만 사전 삭제하는 경로를 만들지 않는다.
- <code>features/repository/constants/index.ts</code>가 transaction과 GitHub webhook work의 명시적 timeout을 소유한다. <code>deleteWebhook()</code>은 오류를 <code>false</code>로 삼키지 않고 object input을 받아 <code>"deleted" | "absent"</code>를 반환하며 timeout/network/5xx/권한 오류를 safe typed error로 던진다. create/delete의 webhook 탐색은 첫 page에 의존하지 않고 <code>octokit.paginate()</code>로 exact callback URL의 모든 match를 찾는다. delete는 matching hook ID를 정렬해 모두 제거하고, 일부 ID 삭제 뒤 실패한 typed error에는 비밀 없는 <code>mutationOccurred=true</code>를 남겨 caller가 보상 대상으로 분류한다. list와 delete 모두 bounded abort signal을 사용한다.
- webhook delete가 하나 이상 성공한 뒤 후속 GitHub 호출 또는 DB commit이 실패하면 transaction rollback 후 이번 시도에서 실제 <code>deleted</code>였던 exact repository에만 idempotent <code>createWebhook()</code> 보상을 수행한다. 원래 <code>absent</code>였던 hook은 만들지 않는다. P2034를 포함한 retryable DB 실패도 이 보상이 모두 성공한 뒤에만 새 transaction attempt를 시작하며, 보상 전 같은 external delete를 재실행하지 않는다. 보상까지 실패하면 retry 없이 <code>RECOVERY_REQUIRED</code>를 반환하고 affected owner/name의 비밀 없는 식별자와 운영 복구 필요성을 안전하게 기록하며, 어떤 action/UI도 연결 해제 성공을 표시하지 않는다.
- <code>features/settings/actions/index.ts</code>는 <code>ACTIVE_REVIEW</code>와 <code>RECOVERY_REQUIRED</code>를 일반 성공이나 raw GitHub error로 바꾸지 않는다. 로그에는 allowlisted code만 남기고 token, request headers, raw response를 남기지 않는다. 기존 mutation의 success callback은 use case가 정상 commit한 경우에만 실행된다.

실제 PostgreSQL integration test는 (1) parent lock 뒤 concurrent 신규 request insert, (2) Review lock 뒤 retry/reconciler 전이, (3) disconnect와 terminal transition의 순서를 각각 반대로 실행한다. 어떤 interleaving에서도 active/ambiguous Review의 cascade delete, orphan RESERVED count, untracked GitHub artifact가 0개이고 disconnect 또는 실행 중 정확히 한 쪽만 먼저 완료한 뒤 다른 쪽이 최신 상태를 재평가해야 한다.

#### UI data

<code>UserLimits</code>에 계정 단위 필드를 추가한다.

~~~ts
trialReviews: {
  enabled: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  canReview: boolean;
};
~~~

기존 repository별 <code>UserLimits.reviews</code> map은 제거한다. <code>getRemainingLimits()</code>도 <code>reviewCounts</code>를 읽어 per-repository review allowance를 만들지 않으며, client에 내려가는 review entitlement와 usage의 유일한 source는 위 <code>trialReviews</code>다. DB의 <code>reviewCounts</code> column만 schema 호환을 위해 남긴다.

- Free + flag on: “AI code review trial”, <code>사용 / 5</code>, remaining 표시
- Free + flag off: 현재처럼 review 불가 문구
- Pro: unlimited
- Free plan feature: “5 AI code reviews, one-time”
- Pro feature의 “Advanced analytics”는 T12 전까지 “Review history”로 변경

client component는 <code>process.env</code>를 직접 읽지 않는다. <code>getSubscriptionData()</code>가 flag와 계산된 usage를 내려 준다.

#### 테스트

- 서로 다른 requestKey의 6개 동시 reservation에서 정확히 5개 성공
- P2034 세 번 후 네 번째 attempt 성공
- 네 번의 attempt가 모두 P2034면 안전한 실패
- duplicate requestKey에서 credit 1개
- webhook delivery bind, Review create, credit reservation이 한 serializable transaction으로 commit/rollback
- exhausted이며 releasable prior Review가 없는 요청은 기존 Review·credit를 전혀 변경하지 않고, releasable PENDING/RESERVED replacement가 있을 때만 supersede/release/new reservation이 함께 commit
- SUMMARY와 Pro FULL_REVIEW도 같은 type/different-head prior run만 supersede하며 FULL_REVIEW와 SUMMARY가 서로를 취소하지 않음
- 신규 PENDING Review가 필수 <code>review: ""</code>를 포함하고 COMPLETED 전 UI body로 노출되지 않음
- used=5이고 이전 PENDING/RESERVED head가 있을 때 이전 release와 새 reservation이 한 transaction에서 성공
- 같은 fence/status 아래 release helper 두 번에서 decrement 1회와 두 번째 false, paired terminal 전이 commit 뒤 이전 fence 재호출에서는 conflict와 decrement 0회
- consume/release가 명시적 transaction client 없이는 호출될 수 없고 artifact·credit·count·terminal 상태 중 일부만 commit되는 경로가 없음
- consume과 release race에서 한 전이만 성공
- RELEASED retry가 Free capacity에서 count 증가와 PENDING 전이를 한 번만 commit하고, exhausted/flag off에서는 FAILED와 count를 그대로 유지
- RELEASED retry 시 현재 Pro이면 NOT_APPLICABLE로 전이하고 count 증가 0회
- Pro에서 생성되어 NOT_APPLICABLE인 FAILED FULL_REVIEW를 Free 전환 뒤 retry하면 flag/capacity를 다시 적용해 허용 시 RESERVED가 되고, flag off/exhausted에서는 event·count·상태 전이 0회
- NOT_APPLICABLE SUMMARY retry는 tier와 flag에 관계없이 count 증가 0회
- POST/RECONCILE ambiguity retry의 queue send 실패가 원래 failureStage와 RESERVED를 보존하고 marker 확인 전 decrement 0회
- 신규·pre-post·POST/RECONCILE retry 모두 send promise settle 전에 worker가 claim하면 producer의 QUEUED/FAILED 보상과 credit release·failureStage 복원이 0회이고 현재 WORKER fence와 factual status가 보존됨
- POST timeout은 marker 확인 전 RESERVED 유지
- marker 확인 시 CONSUMED
- supersede 전/후 post ambiguity에 따른 release/consume
- flag on/off server 권한과 UI copy 일치
- <code>getSubscriptionData()</code>가 Free flag off/on/exhausted와 Pro 각각에 대해 계산된 <code>trialReviews</code>를 반환하고 client가 환경 변수를 직접 해석하지 않음
- webhook handler가 <code>plan_restricted</code>와 <code>trial_exhausted</code>를 200/PROCESSED로, 운영 실패를 500/FAILED로 구분
- reservation 뒤 flag off 또는 Pro upgrade에도 해당 row는 marker 결과로만 CONSUMED/RELEASED
- 이전 attempt 또는 takeover 전 token으로 consume/release하면 state conflict이고, 현재 Review·artifact·credit·UserUsage가 모두 변하지 않음
- active/RECONCILER/RESERVED Review가 있는 단일·전체 disconnect는 webhook·Repository delete 0회이며, terminal safe row만 exact lock 아래 cascade delete되고 repositoryCount가 같은 transaction에서 갱신됨
- webhook delete 뒤 transaction 실패는 이번 시도에서 삭제한 hook만 idempotent하게 복구하고, 보상 실패는 <code>RECOVERY_REQUIRED</code>로 성공 UI를 차단하며 raw GitHub error·token을 로그에 남기지 않음
- 실제 PostgreSQL에서 disconnect와 신규 request/retry/reconciler 경합이 active Review cascade·orphan RESERVED·untracked artifact 0개로 수렴
- 실제 PostgreSQL에서 서로 다른 requestKey를 가진 6개 별도 connection의 동시 reservation 중 정확히 5개만 commit
- PostgreSQL에서 consume/release와 status/credit transaction race가 허용된 한 전이로만 수렴
- plan-card와 usage-card가 flag off, Free trial, exhausted, Pro copy를 TSX test로 모두 렌더링

### T09. generation 모델 마이그레이션·품질 평가와 P0 release gate

#### 확정된 model migration 계약

현재 source의 generation baseline은 <code>gemini-2.5-flash</code>이고 T09 production target은 <code>gemini-3.1-flash-lite</code>로 확정한다. T01-T08에서는 baseline을 유지하고, T09의 첫 network-free 변경에서 <code>GENERATOR_MODEL_ID</code>와 해당 상수의 현재형 lifecycle 주석을 target으로 갱신한다. 그 뒤의 승인 후 model availability probe, quality capture·score와 release receipt는 반드시 갱신된 source에서 실행한다. 별도 model migration 제안은 더 이상 T09 선행 조건이 아니다.

generation과 verification이 같은 <code>gemini-3.1-flash-lite</code>를 사용하는 것은 비용을 우선한 P0 제품 결정이다. 이 조합은 독립 검증 또는 cross-model 검증이 아니며, 같은 모델 계열의 상관된 blind spot이 남는다. release receipt와 사용자 문구에서 독립 검증으로 표현하지 않고, 사람이 판정한 ground-truth corpus로 generation 품질과 verifier의 거부·통과 결과를 함께 기록한다. 기존 verifier calibration 결과는 generation 품질 근거로 재사용하지 않는다.

<code>gemini-3.1-flash-lite</code>의 공식 shutdown은 <code>2027-05-07</code>이다. T09 release 시점에 예정 운영·rollback 기간이 이 날짜 전에 끝나는지 계산하며, 충족하지 못하면 T09를 <code>BLOCKED</code>로 유지하고 공식 replacement를 포함한 후속 target으로 다시 migration·평가한다. 이 lifecycle gate는 T01-T08 구현을 막지 않는다.

#### 수정·생성 파일

- 수정: <code>features/ai/constants/index.ts</code>
- 검증만 수행: <code>scripts/check-model-availability.mjs</code>
- 수정: <code>scripts/verify-calibration.test.ts</code>
- 수정: <code>features/ai/lib/repeat-detection.ts</code>
- 수정: <code>features/ai/lib/repeat-detection.test.ts</code>
- 수정: <code>features/ai/lib/build-deterministic-pr-context.ts</code>
- 수정: <code>features/ai/lib/build-deterministic-pr-context.test.ts</code>
- 생성: <code>scripts/p0-review-quality-evaluation.test.ts</code>
- 생성: <code>scripts/fixtures/p0-review-quality-cases.json</code>
- 생성: <code>scripts/fixtures/p0-review-quality-adjudications.json</code>
- 생성: <code>docs/evaluations/p0-personal-review-coach-release-receipt.md</code>
- 수정: <code>docs/evaluations/remove-codebase-rag-context-evaluation.md</code>에는 대체 영수증 링크와 historical 표시만 추가

신규 release receipt는 현재 <code>/docs/</code> ignore 규칙 때문에 자동으로 stage되지 않는다. 생성 직후 <code>git add -f -- "docs/evaluations/p0-personal-review-coach-release-receipt.md"</code>를 실행하고, <code>git ls-files --error-unmatch -- "docs/evaluations/p0-personal-review-coach-release-receipt.md"</code>가 성공한 뒤에만 T09를 완료한다.

#### corpus 계약

기존 merge fixture 네 개는 repository에 실제 존재한다.

- <code>c902f229a179b36399f8179382a45c08083c1f62</code>
- <code>cf41f00676214b5b9f1fe8cbfd306217d0340db7</code>
- <code>6dc7eda06154c0e05747d2320164939ab3c7b93a</code>
- <code>a240c85319dbcf9eacf910ed990dae4ba19d57d7</code>

각 fixture는 현재 checkout이나 현재 filesystem을 평가 입력으로 사용하지 않는다. merge commit의 첫 번째 parent를 base tip, 두 번째 parent를 PR head로 고정하고 <code>git merge-base &lt;parent1&gt; &lt;parent2&gt;</code>로 merge base를 계산한다. unified diff는 <code>git diff --find-renames --find-copies &lt;mergeBase&gt;..&lt;parent2&gt; --</code>의 stdout을 그대로 사용한다. tree와 파일 내용은 두 번째 parent에서만 <code>git ls-tree -r -z --name-only &lt;parent2&gt;</code>, <code>git show &lt;parent2&gt;:&lt;path&gt;</code>로 읽고, 이 local adapter를 통해 production <code>buildDeterministicPrContext()</code>의 selection·budget·formatting을 그대로 실행한다. 이를 위해 T09에서 해당 helper에 GitHub 구현을 기본값으로 갖는 명시적 <code>DeterministicPrContextRepositoryReader</code> port를 추가하고 production worker는 기본값을, 평가 harness는 local Git adapter를 주입한다. module mock이나 평가 전용 selection 복제품을 만들지 않는다. 모든 Git 명령은 Node <code>execFile()</code>의 argument array로 호출하며 shell interpolation, checkout/worktree 변경, network fetch를 금지한다.

case의 <code>title</code>과 <code>description</code>은 fixture에 명시하고 commit message에서 실행 시점에 추론하지 않는다. capture/score가 모델에 전달한 canonical input identity는 merge commit, parent pair, merge base, title, description, exact diff bytes, production size mode, rendered deterministic context와 ordered manifest를 길이-prefix된 UTF-8 serialization으로 조립한 SHA-256이다. 이 input SHA-256과 각 구성요소의 SHA-256을 output·receipt에 기록해 같은 merge commit을 다른 parent/diff/context로 평가한 결과를 재사용하지 못하게 한다.

단순 verifier verdict count는 actionable precision이나 known-defect recall의 ground truth가 아니다. <code>p0-review-quality-cases.json</code>은 각 case에 사람이 검토한 다음 값을 갖는다.

~~~json
{
  "schemaVersion": 1,
  "cases": [
    {
      "caseId": "stable-id",
      "mergeCommit": "full-commit-sha",
      "title": "fixed PR title",
      "description": "fixed PR description or empty string",
      "expectedFindings": [
        {
          "findingId": "stable-finding-id",
          "file": "repository-relative-path",
          "lineRange": [1, 1],
          "category": "schema-category",
          "claim": "short ground-truth description",
          "crossFile": false
        }
      ],
      "historicalFindings": [
        {
          "findingId": "stable-historical-finding-id",
          "category": "schema-category",
          "claim": "short historical finding used by repeat detection"
        }
      ]
    }
  ]
}
~~~

fixture 작성 시 원문 diff, prompt, model response를 docs 영수증에 넣지 않는다. corpus에는 평가에 필요한 repository-relative 좌표와 짧은 ground-truth만 저장한다.

평가는 두 단계로 실행한다. 첫 실행은 model output과 production repeat 판정 결과를 로컬 임시 결과로 만들고 SHA-256을 출력한다. 사람이 그 고정 output을 검토해 다음 adjudication 파일을 작성한다. 두 번째 scoring 실행은 output SHA-256 일치 여부와 output/adjudication의 finding ID 집합이 정확히 같은지 먼저 확인한 뒤 metric을 계산한다. 현재 존재하지 않는 <code>scripts/fixtures/</code> parent는 T09에서 먼저 만들고 두 JSON만 배치한다.

평가 test의 mode는 <code>P0_QUALITY_MODE=validate|capture|score</code>다. mode가 없으면 비용과 network side effect가 없는 <code>validate</code>를 기본값으로 사용해 필수 <code>npm.cmd run test</code>에 포함하고, 알 수 없는 값은 실패한다. <code>validate</code>는 network와 model을 호출하지 않고 fixture schema, non-empty title과 string description, merge commit이 lowercase 40자리 full SHA인지, commit 존재, exact parent 2개, 계산 가능한 merge base, non-empty canonical diff, stable ID 중복, expected file이 head tree에 존재하는지, line range가 해당 head file의 실제 line 수 안인지, historical finding 참조와 adjudication 참조 무결성을 검사한다. 또한 같은 local adapter로 deterministic context를 두 번 생성해 content·ordered manifest·input SHA-256이 byte-for-byte 같은지 확인한다. 조용히 skip하는 mode는 두지 않는다.

초기 adjudication fixture는 다음 pending 상태를 허용한다. <code>validate</code>는 이를 통과시키지만 <code>score</code>와 P0 gate는 통과시키지 않는다.

~~~json
{
  "schemaVersion": 1,
  "status": "pending",
  "outputSha256": null,
  "findings": []
}
~~~

사람 판정이 끝나면 같은 파일을 다음 complete shape로 바꾼다.

~~~json
{
  "schemaVersion": 1,
  "status": "complete",
  "outputSha256": "sha256-of-fixed-evaluation-output",
  "findings": [
    {
      "findingId": "generated-finding-id",
      "actionable": true,
      "supported": true,
      "stale": false,
      "expectedFindingId": null,
      "repeatExpected": false,
      "reviewer": "redacted-reviewer-id"
    }
  ]
}
~~~

<code>features/ai/lib/repeat-detection.ts</code>에서는 다음 순수 helper를 export하고 production <code>detectRepeatIssues()</code>가 같은 helper를 사용하게 한다.

~~~ts
export type RepeatCandidateEmbedding = {
  id: string;
  category: string;
  embedding: unknown;
};

export function findBestRepeatCandidate(input: {
  category: string;
  embedding: readonly number[];
  candidates: readonly RepeatCandidateEmbedding[];
}): { id: string; similarity: number } | null;
~~~

평가 harness는 <code>@/features/ai/lib/repeat-detection</code>에서 이 helper를 직접 import하고 production <code>REPEAT_SIMILARITY_THRESHOLD</code>를 내부 구현을 통해 공유한다. feature public barrel에는 평가 전용 노출을 추가하지 않는다. owner, production consumer, evaluation consumer, 기존 repeat-detection unit test가 모두 같은 symbol을 가리켜야 하며 repeat 알고리즘을 scripts 아래에 복제하지 않는다. <code>capture</code> output에는 각 generated finding의 <code>isRepeat</code>, candidate finding ID, similarity를 고정하며, <code>score</code>는 adjudication의 <code>repeatExpected</code>와 비교한다.

#### 측정 정의

| metric | 계산 |
| --- | --- |
| actionable precision | 사람이 유효하고 수정 가능한 finding으로 판정한 수 / 생성 finding 수 |
| known-defect recall | expectedFinding과 match된 수 / expectedFinding 수 |
| unsupported claim | diff와 bounded context 어느 쪽에도 근거가 없는 finding 수 |
| stale claim | 현재 fixture head에는 더 이상 성립하지 않는 finding 수 |
| cross-file miss | crossFile expectedFinding 중 match되지 않은 수 |
| repeat false-positive rate | repeat로 표시된 finding 중 ground truth상 repeat가 아닌 수 / repeat 표시 수 |

match 규칙은 case-insensitive file path exact match, 겹치는 line range, 동일 category, 사람이 승인한 의미 match를 함께 기록한다. 자동 문자열 유사도만으로 정답 판정을 만들지 않는다.

각 case의 <code>historicalFindings</code>를 generated finding과 함께 production repeat helper에 통과시켜 false-positive 분모를 만든다. 모든 adjudicated finding은 nullable <code>expectedFindingId</code> 필드와 <code>repeatExpected</code>를 가져야 하고, non-null expected ID는 같은 case의 ground truth에 정확히 존재해야 한다. 이 필드들 또는 adjudication output digest가 없으면 actionable precision, recall, repeat metric을 계산하지 않고 평가를 실패시킨다. actionable precision, known-defect recall, repeat false-positive rate 중 분모가 0인 metric은 <code>0%</code>로 통과시키지 않고 <code>not-evaluable</code>로 기록해 P0 gate를 차단한다.

actionable precision, known-defect recall, unsupported/stale/cross-file 수치는 P0의 ground-truth baseline 영수증이며 이 문서에서 임의 threshold를 만들지 않는다. 비교 가능한 pre-P0 고정 output이 없으므로 “품질이 낮아지지 않았다”고 단정하지 않는다. P0의 품질 pass/fail 수치 gate는 기존 제품 결정인 repeat false-positive rate 20% 이하이고, 나머지 metric은 계산 가능하고 분자·분모가 영수증에 남는 것을 요구한다.

#### 현재 source와 T09 target model

현재 source baseline:

- generation: <code>gemini-2.5-flash</code>
- verification: <code>gemini-3.1-flash-lite</code>
- embedding: <code>gemini-embedding-001</code>

T09 production target:

- generation: <code>gemini-3.1-flash-lite</code>
- verification: <code>gemini-3.1-flash-lite</code>
- embedding: <code>gemini-embedding-001</code>

<code>features/ai/constants/index.ts</code>의 <code>GENERATOR_MODEL_ID</code>를 T09의 첫 변경으로 갱신하고, generator를 설명하는 현재형 주석도 같은 target에 맞춘다. 호출부는 이 단일 상수를 계속 사용하며 평가 전용 inline model literal이나 임시 production override를 추가하지 않는다. <code>scripts/verify-calibration.test.ts</code>의 기본 generator·verifier 목록과 100초 주석도 production role binding과 150초 timeout에 맞춘다.

2026-08-25 Google 공식 lifecycle 기준은 다음과 같다.

| 역할 | model | 공식 shutdown | 공식 replacement |
| --- | --- | --- | --- |
| generation | <code>gemini-3.1-flash-lite</code> | <code>2027-05-07</code> | <code>gemini-3.5-flash-lite</code> |
| verification | <code>gemini-3.1-flash-lite</code> | <code>2027-05-07</code> | <code>gemini-3.5-flash-lite</code> |
| embedding | <code>gemini-embedding-001</code> | <code>2028-05-14</code> | <code>gemini-embedding-2</code> |

기준일의 Google Gemini Developer API Standard paid tier list price에서 <code>gemini-3.1-flash-lite</code>의 text input은 1M token당 <code>$0.25</code>, thinking token을 포함한 output은 <code>$1.50</code>다. 이는 선택 근거를 설명하는 가격 snapshot이지 실행 비용 상한이 아니다. T09 receipt에는 canonical pricing URL, 확인 시각, 실제 input/output token과 계산 비용을 함께 기록한다.

공식 lifecycle·pricing 페이지는 갱신되는 외부 source이므로 위 값은 기준일의 canonical URL 응답일 뿐이다. T09 실행 시 canonical URL, 페이지의 last-updated 값, 실제 source constant와 <code>npm.cmd run check-models</code>의 API 가용성 결과를 같은 receipt에 다시 기록한다. release 날짜부터 예정된 P0 운영·rollback 기간이 <code>2027-05-07</code> 전에 끝나는지를 명시적으로 계산하고, 기간을 충족하지 못하면 T09를 통과시키지 않는다. “shutdown 발표 없음”도 영구 지원 보장으로 해석하지 않는다.

<code>gemini-3.1-flash-lite</code>의 공식 capability에는 structured output과 text generation이 포함되므로 현재 <code>Output.object</code> 및 markdown fallback 호출 방식과 surface상 호환된다. 다만 capability 표는 application 품질 증거가 아니다. 같은 exact model이 생성과 검증을 모두 담당하는 target에서는 <code>scripts/check-model-availability.mjs</code>가 두 role binding을 별도로 probe하고 세 constant binding 결과를 출력하는 현재 동작을 유지한다. 두 probe가 성공해도 독립 검증을 증명하지 않으므로, 같은 corpus의 사람 adjudication과 self-verification 잔여 위험 기록이 별도로 필요하다.

#### 승인 후 실행

유료 평가와 외부 GitHub fixture write는 별도 승인을 받은 후에만 실행한다. PowerShell 예:

<code>scripts/check-model-availability.mjs</code>의 일반 build 정책은 API key 부재를 <code>SKIP</code>, 429·5xx·network·timeout·auth 문제를 warning과 exit 0으로 처리하고 <code>CHECK_MODELS_SOFT</code> escape hatch도 제공한다. 이는 일상 build 정책일 뿐 P0 release readiness의 증거로는 충분하지 않다. 승인된 source-bearing 환경에서 다음 strict wrapper를 통과해 세 production role probe가 모두 exact <code>OK</code>일 때만 model availability를 완료로 기록한다. generation과 verification의 ID가 같아도 constant binding별 두 probe를 모두 요구한다.

~~~powershell
if (-not [string]::IsNullOrWhiteSpace($env:CHECK_MODELS_SOFT)) {
  throw "CHECK_MODELS_SOFT must be unset for the P0 model availability gate"
}

$p0Utf8Encoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $p0Utf8Encoding
$OutputEncoding = $p0Utf8Encoding

$p0ExpectedModels = @(
  @{ Constant = "GENERATOR_MODEL_ID"; Id = "gemini-3.1-flash-lite" },
  @{ Constant = "VERIFIER_MODEL_ID"; Id = "gemini-3.1-flash-lite" },
  @{ Constant = "EMBEDDING_MODEL_ID"; Id = "gemini-embedding-001" }
)

$p0ModelAvailabilityOutput = (& npm.cmd run check-models 2>&1 | Out-String)
$p0ModelAvailabilityExitCode = $LASTEXITCODE
$p0ModelAvailabilityOutput

if ($p0ModelAvailabilityExitCode -ne 0) {
  throw "The P0 model availability command failed"
}
if (
  $p0ModelAvailabilityOutput.Contains("[check-models] SKIP") -or
  $p0ModelAvailabilityOutput.Contains("[check-models] FAIL") -or
  $p0ModelAvailabilityOutput.Contains("[check-models] ❌") -or
  $p0ModelAvailabilityOutput.Contains("[check-models] ⚠") -or
  $p0ModelAvailabilityOutput.Contains("개 경고")
) {
  throw "SKIP, FAIL, or WARN is not acceptable for the P0 model availability gate"
}

foreach ($p0ExpectedModel in $p0ExpectedModels) {
  $p0ExpectedOkLine = "[check-models] ✅ $($p0ExpectedModel.Constant) = $($p0ExpectedModel.Id)"
  if (-not $p0ModelAvailabilityOutput.Contains($p0ExpectedOkLine)) {
    throw "Missing exact successful model probe: $p0ExpectedOkLine"
  }
}
if (-not $p0ModelAvailabilityOutput.Contains("[check-models] 통과 — 3개 확인")) {
  throw "The model probe did not confirm exactly three production role bindings"
}

$p0ModelAvailabilityHasher = [System.Security.Cryptography.SHA256]::Create()
try {
  $p0ModelAvailabilitySha256 = [BitConverter]::ToString(
    $p0ModelAvailabilityHasher.ComputeHash($p0Utf8Encoding.GetBytes($p0ModelAvailabilityOutput))
  ).Replace("-", "").ToLowerInvariant()
} finally {
  $p0ModelAvailabilityHasher.Dispose()
}
$p0ModelAvailabilitySha256
~~~

위 wrapper의 exit code, exact 세 <code>OK</code> line, output SHA-256을 release receipt에 기록한다. <code>SKIP</code>, warning, auth·billing·network 미확인, soft-pass는 모두 <code>BLOCKED</code>이며 성공으로 수동 번역하지 않는다. model availability 확인은 quality capture/score를 대신하지 않는다.

~~~powershell
$p0QualityOutput = Join-Path ([System.IO.Path]::GetTempPath()) ("hreviewer-p0-quality-output-" + [guid]::NewGuid().ToString("N") + ".json")
$env:CALIBRATION = "1"
$env:GENERATOR_MODEL = "gemini-3.1-flash-lite"
$env:VERIFIER_MODELS = "gemini-3.1-flash-lite"
$env:P0_QUALITY_MODE = "capture"
$env:P0_QUALITY_OUTPUT_PATH = $p0QualityOutput
& npx.cmd vitest run scripts/p0-review-quality-evaluation.test.ts
if ($LASTEXITCODE -ne 0) { throw "The P0 quality capture failed" }
if (-not (Test-Path -LiteralPath $p0QualityOutput -PathType Leaf)) {
  throw "The P0 quality capture did not create its output file"
}
if ((Get-Item -LiteralPath $p0QualityOutput).Length -le 0) {
  throw "The P0 quality capture output is empty"
}

$p0QualityOutput
(Get-FileHash -Algorithm SHA256 -LiteralPath $p0QualityOutput).Hash.ToLowerInvariant()
~~~

고정 output의 path와 SHA-256을 receipt 후보에 먼저 기록하고 사람이 판정해 adjudication fixture를 작성한다. capture가 성공했다는 사실만으로 score gate를 실행하거나 통과 처리하지 않는다. 판정이 끝난 뒤 같은 격리 세션에서 다음 scoring block을 별도로 실행한다.

~~~powershell
$p0QualityOutput = $env:P0_QUALITY_OUTPUT_PATH
if ([string]::IsNullOrWhiteSpace($p0QualityOutput)) {
  throw "P0_QUALITY_OUTPUT_PATH must refer to the adjudicated capture"
}
if (-not (Test-Path -LiteralPath $p0QualityOutput -PathType Leaf)) {
  throw "The adjudicated P0 quality capture does not exist: $p0QualityOutput"
}

$env:CALIBRATION = "1"
$env:GENERATOR_MODEL = "gemini-3.1-flash-lite"
$env:VERIFIER_MODELS = "gemini-3.1-flash-lite"
$env:P0_QUALITY_MODE = "score"
& npx.cmd vitest run scripts/p0-review-quality-evaluation.test.ts
if ($LASTEXITCODE -ne 0) { throw "The P0 quality scoring gate failed" }
~~~

위 환경 변수는 격리된 PowerShell 세션에서 설정하고 scoring 뒤 세션을 종료하거나 원래 값으로 복원한다. 특히 <code>CALIBRATION=1</code> 또는 <code>P0_QUALITY_MODE=capture|score</code>가 남은 상태로 공통 <code>npm.cmd run test</code>를 실행해 유료 평가를 의도하지 않게 반복하지 않는다.

실행 전 각 source-bearing Google AI 환경에 대해 다음 비밀 없는 항목을 확인한다.

- 일관된 방식으로 계산한 API key fingerprint
- Google Cloud project ID
- API key Plan: Paid
- active billing 연결
- non-Free billing tier와 billing plan
- billing readiness

secret 값과 account balance는 기록하지 않는다.

#### release receipt

<code>p0-personal-review-coach-release-receipt.md</code>에는 다음을 기록한다.

- source commit SHA, lockfile SHA-256, corpus SHA-256, case별 merge parent·merge-base·diff·deterministic context·canonical input SHA-256
- generation·verification·embedding의 세 role별 model binding, 두 unique model ID, canonical lifecycle·pricing URL, 페이지 last-updated 값과 확인 시각
- generation·verification의 exact-model 공유가 독립 검증이 아니라는 판정, 상관된 blind spot 잔여 위험과 이를 보완한 사람 adjudication 증거
- release 예정일, <code>2027-05-07</code>까지 남은 기간, 예정 운영·rollback 종료일과 lifecycle window 충족 여부
- 평가 실행의 role별 input/output token, 기준일 list price와 계산 비용
- strict model availability wrapper의 exit code, exact 세 <code>OK</code> line, output SHA-256과 <code>SKIP/WARN/soft-pass</code> 0건 판정
- 비밀 없는 provider binding 항목
- case 수와 metric 분자·분모·비율
- reliability test file과 test name
- 격리된 PostgreSQL database 식별자의 비밀 없는 digest, 공통 <code>public</code> schema와 migration transition용 실행별 schema의 분리 증거, <code>current_schema()</code>·적용 migration·필수 table 확인, request/delivery/trial concurrency test 결과
- test, lint, typecheck, build 결과
- 외부 GitHub fixture 좌표의 redacted identity와 cleanup 상태
- failed delivery 자동 재전송 부재, 사용한 manual/API redelivery 방식과 승인 상태
- cutover 누락 delivery 수, 가장 오래된 delivery의 시각·age, 최근 3일 redelivery eligibility 판정과 window 밖 항목의 별도 복구 승인 상태
- production Review status read-only preflight, migration create-only SQL digest와 검토자, 구 runtime write가 없는 coupled cutover 결과
- 기존 <code>generate-review</code>/<code>generate-summary</code> queued·running run 0개를 확인한 시각과 redacted 증거; 확인 불가 시 BLOCKED
- webhook 정상 fixture별 end-to-end response duration, 최대값, 8초 budget 판정과 10초 제한 source 확인 시각
- Inngest registry exact member test와 event/step result compatibility drain 판정
- 승인자, 승인 시각, 실행자, 실행 시각
- P0 gate pass 또는 blocked와 정확한 이유

#### P0 gate

- duplicate delivery와 동일 semantic request에서 main artifact 1개
- delivery requestKey bind와 Review/credit 생성 사이 부분 commit 0개
- stale head fixture에서 외부 post 0개
- closed/merged PR fixture에서 Review·event·credit·GitHub post 0개
- terminal failure의 status/failureStage 누락 0개
- expired execution lease 또는 이전 attempt의 DB/GitHub side effect 0개
- inline issue와 accepted suggestion 정보 손실 0개
- 모든 실제 GitHub outbound body가 application-owned 60,000 UTF-8 byte budget 이하이고, 초과 fixture는 외부 post·절단 0개로 수렴
- ambiguous GitHub post의 첫 negative lookup 뒤 repost·credit release 0개
- active/RECONCILER/RESERVED Review를 가진 Repository cascade delete와 orphan credit/artifact 0개
- repository disconnect의 webhook delete/DB commit 실패가 보상되거나 명시적 <code>RECOVERY_REQUIRED</code>로 차단되고 성공으로 표시된 부분 실패 0개
- 서로 다른 requestKey의 6개 concurrent Free request에서 reservation 5개
- request key, delivery lease, trial reservation PostgreSQL integration test 통과
- repeat false-positive rate 20% 이하
- actionable precision, known-defect recall, repeat false-positive rate가 모두 계산 가능하고 분자·분모가 0으로 숨겨지지 않음
- strict wrapper에서 세 production role binding이 모두 exact <code>OK</code>이고 <code>SKIP/WARN/soft-pass</code>가 0건이며 quality 평가도 완료
- generation·verification exact-model 공유를 독립 검증으로 표현하지 않고, 상관된 blind spot과 사람 adjudication 보완 증거가 receipt에 존재
- 예정 운영·rollback 종료일이 <code>2027-05-07</code> 전이며 계산 근거가 receipt에 존재
- Inngest old queued·running run 0개와 webhook 최대 응답 8초 이하
- cutover 누락 delivery가 0개이거나 모두 GitHub의 최근 3일 redelivery window 안에서 승인된 방식으로 수렴
- 필수 test, lint, typecheck, build 통과

유료 평가와 섹션 6.6의 cutover/외부 검증 승인이 없거나 필수 증거를 만들 수 없으면 T09는 BLOCKED이며 T10을 NEXT로 열지 않는다.

## 8. fixture와 assertion matrix

| ID | 최초 상태 | 자극 | 기대 DB | 기대 event | 기대 GitHub |
| --- | --- | --- | --- | --- | --- |
| W01 | delivery 없음 | valid opened | delivery PROCESSED, Review PENDING | auto/direct 1 | 0 |
| W02 | 동일 delivery PROCESSED | redelivery | row 변화 없음 | 0 | 0 |
| W03 | delivery PROCESSING, lease 유효 | concurrent redelivery | attempt 유지 | 0 | 0 |
| W04 | delivery PROCESSING, lease 만료 | redelivery | attempt +1, 새 lease token | handler 1 | 0 |
| W05 | delivery FAILED/QUEUE, requestKey 있음 | 승인된 manual/API redelivery | 같은 Review ID의 queue attempt +1, 새 Review 없음 | 1 | 0 |
| W06 | delivery requestKey bind, Review PENDING/not QUEUED | handler 종료 뒤 takeover | 같은 Review와 delivery key 유지, QUEUED | 동일 attempt ID 1 | 0 |
| W07 | delivery lease 상실 | Review create + bind transaction | 둘 다 rollback | 0 | 0 |
| R01 | request 없음 | 같은 head 동시 요청 2개 | Review 1, queue lease 1 | 1 | 0 |
| R01A | Review PENDING, queue lease 만료 | worker 미시작 | FAILED/RECONCILE, lease null | 0 | 0 |
| R01B | Review PENDING/QUEUE, event가 Inngest에 accepted | send promise settle 전 worker claim | RUNNING 또는 이후 factual status와 WORKER fence 보존, producer checkpoint·실패 보상 0회 | 1 | 0 |
| R02 | Review PENDING head A attempt N | head B 요청 | A SUPERSEDED, B PENDING | cancel A의 exact ID/N, request B | 0 |
| R03 | Review RUNNING head A | generation 전 current B | A SUPERSEDED | 필요 시 cancel | 0 |
| R04 | Review POSTING head A | post 직전 current B | A SUPERSEDED | 0 | 0 |
| R05 | request 전 또는 실행 중 PR closed/merged | request/head guard | 생성 전이면 Review 없음, 실행 중이면 SUPERSEDED | 0 | 0 |
| R06 | old WORKER token, lease takeover 완료 | old worker post/complete | 상태·artifact 변화 없음 | 0 | 0 |
| P01 | persisted Review POSTING | main post 성공 | github ID/postedAt, COMPLETED | 0 | 1 |
| P02 | persisted Review POSTING | timeout이나 marker 존재 | reconciler COMPLETED | 0 | 추가 post 0 |
| P03 | persisted Review POSTING | inline API 실패 | COMPLETED, issue 전부 DB | 0 | main body에 전부 존재 |
| P04 | 생성·검증 완료, 최종 outbound body 60,001 UTF-8 bytes | DB-before-post body preflight | FAILED/PERSIST, RESERVED이면 RELEASED, wrapper-free canonical content와 outbound body 절단 없음 | 0 | 0 |
| F01 | Review RUNNING/RESERVED | generation terminal failure | FAILED/GENERATE, credit RELEASED | 0 | 0 |
| F02 | Review POSTING RESERVED | ambiguous timeout | FAILED/POST, RESERVED 유지 | 0 | marker 확인 전 재게시 0 |
| F03 | Review FAILED/POST, body 저장됨 | main marker 확인 | COMPLETED, credit CONSUMED | 0 | 추가 post 0 |
| F04 | Review FAILED/GENERATE, credit RELEASED | Free capacity에서 retry | 같은 Review PENDING/RESERVED, attempt +1 | 1 | 0 |
| F05 | Review FAILED/POST/RESERVED | retry event send promise 실패 | producer 보상이 이기면 FAILED/POST와 RESERVED 유지, worker claim이 먼저면 현재 실행 상태 보존 | 미수락 0 또는 accepted 뒤 claim 거절/선행 claim 1 | marker 확인 전 0 |
| F06 | Review FAILED/POST, persisted review non-empty, reviewData null | markdown fallback retry | 같은 body로 posting 재개, AI 호출 0 | 1 | marker 확인 전 0 |
| F07 | Review FAILED/RECONCILE/RESERVED, due lease | stale reconciliation | trusted marker면 COMPLETED/CONSUMED, 조회 실패면 lease 연장 | 0 | 중복 lookup 0 |
| F08 | ambiguous post, marker 첫 miss | grace 전 reconciliation/retry | RESERVED와 상태 유지, missedAt 기록 | 0 | repost 0 |
| F09 | ambiguous post, grace 뒤 두 번째 miss | reconciliation | FAILED/RECONCILE, RELEASED | 0 | repost 0 |
| F10 | attempt N onFailure, 현재 attempt N+1 또는 RECONCILER owner | failure callback | 상태·credit·lease 변화 없음 | 0 | 0 |
| S01 | Review SUPERSEDED/RESERVED | grace 뒤 두 번째 marker 없음 확인 | SUPERSEDED, credit RELEASED | 0 | 0 |
| C01 | Free used=4 | 서로 다른 requestKey의 full 2개 동시 요청 | 하나 RESERVED, 하나 rejected | 1 | 0 |
| C02 | Review RESERVED | release 두 번 | RELEASED, used -1 한 번 | 0 | 0 |
| C03 | Free trial exhausted | signed review request | delivery PROCESSED, Review/credit 없음 | 0 | 0 |
| C04 | Pro 생성 FAILED/NOT_APPLICABLE FULL_REVIEW, 현재 Free | retry | flag/capacity 허용 시 PENDING/RESERVED, 아니면 원 상태 유지 | 0 또는 1 | 0 |
| D01 | Repository에 PENDING/RUNNING/POSTING, RECONCILER 또는 RESERVED Review 존재 | 단일·전체 disconnect | Repository·Review·usage 변화 없음 | 0 | webhook delete 0 |
| D02 | terminal safe Review만 존재 | disconnect와 신규 request/retry/reconciler 경합 | lock 순서에 따라 정확히 한 쪽이 먼저 commit하고 다른 쪽은 최신 row 재평가, active cascade·orphan credit 0 | 실행이 이기면 계약상 event만 | delete 또는 post 중 계약상 한 경로만 |
| D03 | 첫 webhook delete 성공, 후속 GitHub/DB 실패 | transaction rollback과 보상 | Repository·Review 유지, 성공 표시 0 | 0 | 실제 삭제한 hook만 재생성; 보상 실패면 RECOVERY_REQUIRED |
| G01 | 다른 GitHub user가 같은 marker 게시 | artifact lookup | Review/credit 변화 없음 | 0 | trusted artifact 0 |
| A01 | public PR, read user | review command | Review/credit 없음 | 0 | 0 |
| A02 | public PR, write user | review command | Review 1, requestSource COMMAND | 1 | 0 |

테스트에서는 GitHub, Inngest Cloud, Google AI, Polar, production DB를 호출하지 않는다.

## 9. task별 파일 소유권 요약

| Task | 주요 새 owner | public consumer |
| --- | --- | --- |
| T01 | route-private <code>github-webhook-handler.ts</code>, injectable worker handler | <code>route.ts</code>, Inngest registration |
| T02 | <code>review-execution-state.ts</code>, Prisma enums와 attempt/token/owner lease, 격리 DB test harness | request coordinator, workers, reconciler, review UI, DB integration tests |
| T03 | <code>review-request.ts</code>, <code>inngest/events.ts</code>, object-input <code>getPullRequestSnapshot()</code> | AI actions, webhook, workers, request coordinator |
| T04 | <code>github-webhook-delivery.ts</code>와 transactional request binding | route-private handler, request coordinator, trial transaction |
| T05 | GitHub permission helper | route-private handler |
| T06 | <code>schedule-automatic-review.ts</code>, head guard, object-input <code>getPullRequestHeadInfo()</code> | Inngest registry, review worker, suggestion action |
| T07 | marker, pure artifact body builder·budget, artifact lookup, retry, onFailure owner, stale reconciler | posting wrapper, workers, review detail, Inngest registry |
| T08 | <code>review-trial.ts</code>, <code>repository-disconnect.ts</code> | request coordinator, retry, webhook handler, worker/reconciler/onFailure, repository/settings actions, subscription UI |
| T09 | production model constant, evaluation harness, production repeat candidate selector와 receipt | generator·verifier·P0 release gate |

boundary 규칙:

- <code>app/api/webhooks/github/github-webhook-handler.ts</code>는 <code>lib/github/index.ts</code>에서 export하지 않는다.
- <code>lib/github</code>는 <code>app/</code>을 import하지 않는다.
- <code>features/payment</code>는 <code>features/review/lib/review-request.ts</code>를 import하지 않으며, 두 feature가 공유하는 webhook transport 타입은 <code>lib/github/github-webhook-delivery.ts</code>가 소유한다.
- Inngest registry는 function을 import만 하며 business logic을 갖지 않는다.
- client UI는 server-only trial, Prisma, GitHub module을 import하지 않는다.
- 새 파일과 폴더는 kebab-case를 사용한다.

## 10. 최종 artifact map

| artifact | 최종 source | body dependency | 검증 destination |
| --- | --- | --- | --- |
| webhook 응답 | route-private handler result | verified headers, delivery state | route unit test의 status·JSON body와 release fixture의 8초 budget |
| webhook delivery 상태 | <code>GithubWebhookDelivery</code>와 lease CAS | delivery ID, payload digest, transactionally bound requestKey, 승인된 redelivery 입력 | delivery/request/trial PostgreSQL integration test와 release receipt |
| Review 실행 상태 | Review enum/fields | attempt/token/owner fencing CAS, fence-aware dispatch acknowledgement·failure compensation, onFailure, reconciler | migration fixture, send settle/worker claim race test, lease race test와 status card/detail UI |
| GitHub outbound body | wrapper-free canonical <code>Review.review</code>와 <code>github-artifact-body.ts</code>의 유일한 builder·budget | title, part marker, generated footer | preflight/request byte equality, exact-marker single occurrence, 60,000/60,001 UTF-8 byte 경계 test와 posting request spy |
| main GitHub review/comment | wrapper-free persisted Review.review에서 builder가 만든 final body | ReviewIssue, Suggestion replacement, headSha, persisted githubAuthorId, marker, two-observation absence state | reviews/comments pagination 결과의 final body, ID, commit ID, author ID와 ambiguity tests |
| inline issue/suggestion | persisted child row와 part marker | path, line, body | listReviewComments 전체 pagination |
| verification review | persisted <code>reviewData.verification</code>과 marker | rejected finding, headSha | listReviews 전체 pagination; 게시 실패는 advisory로 기록하고 main 완료를 되돌리지 않음 |
| summary comment | persisted SUMMARY Review와 marker | headSha, language | issues.listComments 전체 pagination |
| 무료 entitlement | UserUsage count와 Review credit state | flag, tier, serializable transaction | unit test, 격리 PostgreSQL 동시성 test, subscription action/UI |
| repository disconnect | <code>repository-disconnect.ts</code>의 lock·guard·compensation use case | Repository/Review state, trial credit, webhook delete result | unit test와 disconnect/request/retry/reconciler PostgreSQL race test |
| Inngest registry | <code>app/api/inngest/route.ts</code>의 exported <code>inngestFunctions</code> | typed client와 exact 네 function | <code>app/api/inngest/route.test.ts</code>의 exact identity membership와 cutover drain receipt |
| Prisma client | schema와 migration | generated client | validate, generate, typecheck |
| P0 품질 영수증 | migrated source/corpus/role별 model 결과 | 승인, provider binding, exact-model 공유 위험과 lifecycle window | docs/evaluations receipt |
| 구현 source bundle과 task 완료 기록 | 두 proposal 문서와 T09 release receipt | task 상태, 검증 증거, 승인 영수증 | exact-path <code>git ls-files --error-unmatch</code>와 PR diff |

## 11. 검증 명령

각 task는 해당 시점에 생성된 관련 test file을 먼저 실행한다. 후속 task의 아직 없는 경로는 앞당겨 실행하지 않는다.

| task | 전용 검증 |
| --- | --- |
| T01 | <code>npx.cmd vitest run app/api/webhooks/github/github-webhook-handler.test.ts app/api/webhooks/github/route.test.ts inngest/functions/review.test.ts inngest/functions/summary.test.ts features/review/ui/parts/review-status-badge.test.tsx</code> |
| T02 | <code>npx.cmd vitest run features/review/lib/review-execution-state.test.ts features/review/ui/parts/review-status-badge.test.tsx features/review/ui/parts/review-card.test.tsx features/review/ui/review-detail.test.tsx</code>와 Prisma validate/generate |
| T03 | <code>npx.cmd vitest run features/review/lib/review-request.test.ts features/review/lib/review-execution-state.test.ts features/review/lib/reconcile-issue-resolutions.test.ts features/suggestion/lib/reconcile-native-suggestions.test.ts features/ai/actions/review-pull-request.test.ts features/ai/actions/generate-pr-summary.test.ts app/api/webhooks/github/github-webhook-handler.test.ts inngest/functions/review.test.ts inngest/functions/summary.test.ts lib/github/github.test.ts</code> |
| T04 | <code>npx.cmd vitest run lib/github/github-webhook-delivery.test.ts features/review/lib/review-request.test.ts features/ai/actions/review-pull-request.test.ts features/ai/actions/generate-pr-summary.test.ts app/api/webhooks/github/github-webhook-handler.test.ts app/api/webhooks/github/route.test.ts</code> |
| T05 | <code>npx.cmd vitest run features/ai/utils/command-parser.test.ts features/ai/actions/review-pull-request.test.ts lib/github/github.test.ts app/api/webhooks/github/github-webhook-handler.test.ts</code> |
| T06 | <code>npx.cmd vitest run app/api/inngest/route.test.ts inngest/functions/schedule-automatic-review.test.ts features/review/lib/review-request.test.ts features/review/lib/review-head-guard.test.ts features/review/lib/pr-review.test.ts features/ai/actions/review-pull-request.test.ts inngest/functions/review.test.ts inngest/functions/summary.test.ts lib/github/github.test.ts</code> |
| T07 | <code>npx.cmd vitest run app/api/inngest/route.test.ts features/review/lib/review-artifact-marker.test.ts features/review/lib/review-on-failure.test.ts lib/github/github-artifact-body.test.ts lib/github/github-review-artifacts.test.ts lib/github/github.test.ts features/review/lib/pr-review.test.ts features/ai/lib/review-formatter.test.ts features/ai/lib/suggestion-format.test.ts features/review/lib/review-execution-state.test.ts features/review/lib/review-request.test.ts features/review/actions/retry-review.test.ts features/review/lib/retry-review-request.test.ts features/review/ui/review-detail.test.tsx features/review/ui/parts/review-retry-button.test.tsx features/review/ui/parts/structured-review-body.test.tsx inngest/functions/reconcile-stale-review-executions.test.ts inngest/functions/review.test.ts inngest/functions/summary.test.ts</code> |
| T08 | <code>npx.cmd vitest run features/payment/lib/review-trial.test.ts features/repository/lib/repository-disconnect.test.ts features/settings/actions/index.test.ts features/review/lib/review-execution-state.test.ts features/review/lib/review-on-failure.test.ts features/review/lib/review-request.test.ts features/review/lib/retry-review-request.test.ts features/review/actions/retry-review.test.ts features/ai/actions/review-pull-request.test.ts app/api/webhooks/github/github-webhook-handler.test.ts inngest/functions/reconcile-stale-review-executions.test.ts features/payment/actions/config.test.ts features/payment/ui/parts/plan-card.test.tsx features/payment/ui/parts/usage-card.test.tsx lib/github/github.test.ts</code> |
| T09 | 아래 network-free preflight, quality/repeat/calibration test와 calibration source contract를 먼저 실행한 뒤, 승인 후 섹션 T09의 strict model availability wrapper와 capture/score 명령을 실행 |

<code>scripts/verify-calibration.test.ts</code>는 <code>CALIBRATION</code>이 없으면 suite 전체를 skip하므로 test process가 성공했다는 사실만으로 기본 model과 timeout 수정을 검증할 수 없다. T09의 network-free gate에서 다음 source contract도 통과시킨다.

~~~powershell
if (-not [string]::IsNullOrWhiteSpace($env:CALIBRATION)) {
  throw "CALIBRATION must be unset for the network-free T09 gate"
}

$env:P0_QUALITY_MODE = "validate"
npx.cmd vitest run scripts/p0-review-quality-evaluation.test.ts features/ai/lib/build-deterministic-pr-context.test.ts features/ai/lib/repeat-detection.test.ts scripts/verify-calibration.test.ts
if ($LASTEXITCODE -ne 0) { throw "The network-free T09 tests failed" }

$p0ModelConstantsSource = Get-Content -Raw -Encoding UTF8 "features/ai/constants/index.ts"
$p0ExpectedProductionGenerator = 'export const GENERATOR_MODEL_ID = "gemini-3.1-flash-lite"'
$p0StaleProductionGenerator = 'export const GENERATOR_MODEL_ID = "gemini-2.5-flash"'
$p0StaleGeneratorComment = '생성 모델(gemini-2.5-flash)'

$p0CalibrationSource = Get-Content -Raw -Encoding UTF8 "scripts/verify-calibration.test.ts"
$p0ExpectedGeneratorDefault = 'process.env.GENERATOR_MODEL ?? "gemini-3.1-flash-lite"'
$p0ExpectedVerifierDefault = 'process.env.VERIFIER_MODELS ?? "gemini-3.1-flash-lite"'
$p0ExpectedTimeoutDefault = 'process.env.GENERATION_TIMEOUT_MS ?? "150000"'
$p0StaleGeneratorDefault = 'process.env.GENERATOR_MODEL ?? "gemini-2.5-flash"'
$p0StaleVerifierDefault = 'gemini-2.5-flash-lite,gemini-3.1-pro-preview'
$p0StaleVerifierComment = '기본: 2.5-flash-lite vs 3.1-pro-preview'
$p0StaleTimeoutComment = '프로덕션과 같은 100초 제한'

if (-not $p0ModelConstantsSource.Contains($p0ExpectedProductionGenerator)) {
  throw "The production generator constant does not match the T09 target"
}
if (
  $p0ModelConstantsSource.Contains($p0StaleProductionGenerator) -or
  $p0ModelConstantsSource.Contains($p0StaleGeneratorComment)
) {
  throw "The stale production generator binding or comment remains"
}
if (-not $p0CalibrationSource.Contains($p0ExpectedGeneratorDefault)) {
  throw "The calibration generator default does not match the T09 production target"
}
if (-not $p0CalibrationSource.Contains($p0ExpectedVerifierDefault)) {
  throw "The calibration verifier default does not match production"
}
if (-not $p0CalibrationSource.Contains($p0ExpectedTimeoutDefault)) {
  throw "The calibration generation timeout is not 150 seconds"
}
if ($p0CalibrationSource.Contains($p0StaleGeneratorDefault)) {
  throw "The stale calibration generator default remains"
}
if ($p0CalibrationSource.Contains($p0StaleVerifierDefault)) {
  throw "The stale calibration verifier default remains"
}
if ($p0CalibrationSource.Contains($p0StaleVerifierComment)) {
  throw "The stale calibration verifier comment remains"
}
if ($p0CalibrationSource.Contains($p0StaleTimeoutComment)) {
  throw "The stale 100-second calibration comment remains"
}
~~~

DB 제약과 동시성은 mock 결과로 완료 처리하지 않는다. integration test는 일반 test run에서 <code>TEST_DATABASE_URL</code>이 없으면 명시적으로 skip하되, 아래 전용 gate는 환경 변수가 없으면 시작 전에 실패한다. URL 검증, 전용 <code>_test</code> database의 <code>public</code> schema 정규화, migration 적용, <code>current_schema()</code>·migration table·필수 table 확인을 fixture write보다 먼저 수행한다. migration transition test의 실행별 격리 schema는 이 공통 준비 대상과 별개이며 exact ownership cleanup을 사용한다. <code>$p0Task</code>에는 현재 task를 넣으며, switch는 현재 task까지 실제 생성된 integration test만 누적 선택하므로 후속 task의 아직 없는 경로를 실행하지 않는다.

~~~powershell
if ([string]::IsNullOrWhiteSpace($env:TEST_DATABASE_URL)) {
  throw "TEST_DATABASE_URL is required for the P0 database gate"
}

$p0Task = "T02"
$p0DatabaseGateTests = switch ($p0Task) {
  "T02" { @("features/review/lib/review-execution-migration.integration.test.ts") }
  "T03" { @(
    "features/review/lib/review-execution-migration.integration.test.ts",
    "features/review/lib/review-request.integration.test.ts"
  ) }
  { $_ -in @("T04", "T05", "T06", "T07") } { @(
    "features/review/lib/review-execution-migration.integration.test.ts",
    "features/review/lib/review-request.integration.test.ts",
    "lib/github/github-webhook-delivery.integration.test.ts"
  ) }
  { $_ -in @("T08", "T09") } { @(
    "features/review/lib/review-execution-migration.integration.test.ts",
    "features/review/lib/review-request.integration.test.ts",
    "lib/github/github-webhook-delivery.integration.test.ts",
    "features/payment/lib/review-trial.integration.test.ts",
    "features/repository/lib/repository-disconnect.integration.test.ts"
  ) }
  default { throw "Unsupported P0 task for database gate: $p0Task" }
}

node scripts/prepare-p0-test-database.mjs
if ($LASTEXITCODE -ne 0) { throw "P0 test database preparation failed" }

& npx.cmd vitest run --no-file-parallelism @p0DatabaseGateTests
if ($LASTEXITCODE -ne 0) { throw "P0 database gate failed" }
~~~

공통:

~~~powershell
npm.cmd run test
if ($LASTEXITCODE -ne 0) { throw "The full test suite failed" }

npm.cmd run lint
if ($LASTEXITCODE -ne 0) { throw "Lint failed" }

npx.cmd tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "Type-check failed" }

npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed" }
~~~

T02:

~~~powershell
npx.cmd prisma validate
if ($LASTEXITCODE -ne 0) { throw "Prisma schema validation failed" }

npx.cmd prisma generate
if ($LASTEXITCODE -ne 0) { throw "Prisma client generation failed" }

$p0LegacyRuntimeFiles = @(
  "features/ai/actions/review-pull-request.ts",
  "inngest/functions/review.ts",
  "inngest/functions/summary.ts"
)

$p0AllLegacyRuntimeHits = @(
  rg -n `
    -g '!**/*.test.ts' `
    -g '!**/*.test.tsx' `
    -g '!**/*.integration.test.ts' `
    'legacy-runtime:' app features inngest lib
)
if ($LASTEXITCODE -ne 0) { throw "The T02 legacy-runtime writes are missing" }
if ($p0AllLegacyRuntimeHits.Count -ne 3) {
  throw "T02 must contain exactly three legacy-runtime writes"
}

foreach ($path in $p0LegacyRuntimeFiles) {
  $p0FileHits = @(rg -n 'legacy-runtime:.*randomUUID' -- $path)
  if ($LASTEXITCODE -ne 0 -or $p0FileHits.Count -ne 1) {
    throw "T02 requires one random legacy-runtime write in $path"
  }
}
~~~

등록 surface 확인은 broad text search가 아니라 exported array의 exact membership test를 authority로 사용한다. source search는 누락 진단용 보조 검사다.

~~~powershell
$p0RegistryTask = "T06"
$p0InngestFunctions = switch ($p0RegistryTask) {
  "T06" { @("generateReview", "generateSummary", "scheduleAutomaticReview") }
  { $_ -in @("T07", "T08", "T09") } { @(
    "generateReview",
    "generateSummary",
    "scheduleAutomaticReview",
    "reconcileStaleReviewExecutions"
  ) }
  default { throw "Registry gate starts at T06: $p0RegistryTask" }
}

npx.cmd vitest run app/api/inngest/route.test.ts
if ($LASTEXITCODE -ne 0) { throw "Inngest registry exact-membership test failed" }

foreach ($functionName in $p0InngestFunctions) {
  rg -n $functionName app/api/inngest/route.ts
  if ($LASTEXITCODE -ne 0) { throw "Inngest registry source is missing $functionName" }
}
~~~

금지 구조 확인:

~~~powershell
rg -n "github-webhook-handler" lib/github
if ($LASTEXITCODE -eq 0) { throw "route-private handler leaked into lib/github" }
if ($LASTEXITCODE -ne 1) { throw "handler boundary search failed" }

rg -n "review[.]create" features/ai/actions/review-pull-request.ts features/ai/actions/generate-pr-summary.ts inngest/functions/review.ts inngest/functions/summary.ts
if ($LASTEXITCODE -eq 0) { throw "legacy action or worker still creates Review rows" }
if ($LASTEXITCODE -ne 1) { throw "Review create search failed" }

rg -n "legacy-runtime:|incrementReviewCount|canCreateReview" app features inngest lib
if ($LASTEXITCODE -eq 0) { throw "temporary request key or legacy entitlement side effect remains" }
if ($LASTEXITCODE -ne 1) { throw "legacy source search failed" }

rg -n "status:.*(pending|completed|failed)" app features inngest lib
if ($LASTEXITCODE -eq 0) { throw "lowercase Review status write needs inspection" }
if ($LASTEXITCODE -ne 1) { throw "status search failed" }
~~~

기대 결과:

- route test는 T06에서 exact 세 function, T07 이후 exact 네 function identity가 exported array와 <code>serve()</code> 입력에 동일하게 존재하고 중복·추가 member가 없음을 검증한다. 보조 loop도 각 이름을 독립적으로 찾는다.
- <code>lib/github</code>의 route-private handler 검색은 결과 0건이다.
- T03 이후 두 기존 action과 두 worker의 <code>review.create</code> 검색은 결과 0건이다.
- T03 이후 <code>legacy-runtime:</code>, <code>incrementReviewCount</code>, <code>canCreateReview</code> 정의·호출 검색은 결과 0건이다.
- T02 이후 소문자 status write 검색은 결과 0건이다. 검색식은 넓은 보조 검사이므로 read-only 문구가 잡히면 write 위치인지 확인하고, false positive면 허용 위치와 근거를 완료 기록에 남긴다.

외부 수동 fixture, 유료 AI 호출, production migration/deploy, production flag 활성화는 자동 검증 명령에 포함하지 않으며 별도 승인과 receipt를 요구한다.

## 12. task 완료 체크리스트

각 task의 상위 문서 완료 기록에 다음을 남긴다.

- [ ] 실제 변경 파일이 이 task 범위를 벗어나지 않았다.
- [ ] 새 public symbol의 owner, export, consumer, test를 확인했다.
- [ ] 이동한 동작은 새 위치 존재와 이전 위치 부재를 함께 검증했다.
- [ ] state transition의 success, failure, retry/re-entry를 검증했다.
- [ ] Inngest send 결과와 worker claim의 순서를 바꾼 race에서 producer가 최신 status·checkpoint·lease·credit를 덮어쓰지 않는다.
- [ ] attempt/token/lease owner를 잃은 worker·onFailure·reconciler의 write와 GitHub post가 0회임을 검증했다.
- [ ] supersede cancel event가 transaction에서 확정한 exact reviewId/attempt를 사용하고 commit 뒤 attempt 재조회 경로가 없다.
- [ ] 외부 body는 wrapper-free persisted content와 marker/title에서 공용 builder로만 재구성되며, preflight와 actual request가 byte-for-byte 같다.
- [ ] accepted suggestion의 실제 replacement가 main body와 fallback에서도 유실되지 않는다.
- [ ] 실제 outbound body는 공용 builder의 60,000 UTF-8 byte budget을 통과하고 초과 경로는 절단·외부 post 없이 수렴한다.
- [ ] event, durable step 입력·반환값, 오류 저장과 로그에 token, signature, raw payload, prompt, diff가 없다.
- [ ] Repository disconnect가 active/RECONCILER/RESERVED Review를 cascade delete하지 않고 webhook 부분 실패를 보상하거나 RECOVERY_REQUIRED로 차단한다.
- [ ] task 전용 테스트와 전체 test/lint/typecheck/build 결과를 기록했다.
- [ ] migration/env 변경과 승인 대기 항목을 분리해 기록했다.
- [ ] production 승격 task라면 Inngest old-run 0개, coupled enum cutover, webhook 8초 budget을 receipt로 확인했다.
- [ ] T09라면 generation target migration, role별 exact model probe, 동일 generator/verifier의 비독립성, lifecycle window와 비용 계산을 receipt에 기록했다.
- [ ] 현재 task가 만든 문서 artifact와 proposal 상태 변경이 exact path로 Git index에 추적되는지 확인했다.
- [ ] 남은 위험과 다음 task를 하나만 기록했다.

## 13. P0에서 하지 않는 것

- P1 feedback, coach metric, personal rule
- P2 repository guideline, GitHub Checks context, chunking
- P3 incremental review, pause/resume, <code>review full</code> grammar
- organization·multi-owner schema
- GitHub review approve/request-changes/merge blocking
- production deployment와 flag 활성화
- webhook 관리 credential을 사용하는 failed delivery 자동 redelivery scheduler
- 승인 없는 외부 GitHub write와 유료 AI 평가

## 14. 구현 근거

- [GitHub repository collaborator permissions](https://docs.github.com/en/rest/collaborators/collaborators)
- [GitHub pull request reviews](https://docs.github.com/en/rest/pulls/reviews)
- [GitHub comments API 구분](https://docs.github.com/en/rest/guides/working-with-comments)
- [Inngest v3 createFunction](https://www.inngest.com/docs/reference/typescript/v3/functions/create)
- [Inngest debounce](https://www.inngest.com/docs/guides/debounce)
- [Inngest v3 cancelOn](https://www.inngest.com/docs/reference/typescript/v3/functions/cancel-on)
- [Inngest concurrency](https://www.inngest.com/docs/guides/concurrency)
- [Inngest event idempotency](https://www.inngest.com/docs/guides/handling-idempotency)
- [Inngest event send](https://www.inngest.com/docs/reference/typescript/v3/events/send)
- [Inngest step.sendEvent](https://www.inngest.com/docs/reference/typescript/v3/functions/step-send-event)
- [Inngest v3 failure handler](https://www.inngest.com/docs/reference/typescript/v3/functions/handling-failures)
- [Inngest function versioning과 memoized step](https://www.inngest.com/docs/learn/versioning)
- [GitHub webhook best practices와 10초 응답 제한](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- [GitHub failed delivery redelivery](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)
- [GitHub webhook redelivery의 최근 3일 제한](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks)
- [Prisma migration SQL create-only workflow](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)
- [Prisma PostgreSQL connection URL과 adapter schema option](https://www.prisma.io/docs/orm/overview/databases/postgresql)
- [Prisma transaction isolation과 P2034 retry](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [Gemini model 목록](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 3.1 Flash-Lite model details](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)
- [Gemini model deprecation](https://ai.google.dev/gemini-api/docs/deprecations)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API key와 project binding](https://ai.google.dev/gemini-api/docs/api-key)
