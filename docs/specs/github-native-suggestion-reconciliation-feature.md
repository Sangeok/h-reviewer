# 설계: GitHub Native Suggestion Reconciliation

Generated: 2026-04-17
Revised: 2026-04-18 (v1.3)
Branch: develop
Repo: Sangeok/hreviewer
Status: APPROVED

## v1.3 개정 요약

세 번째 dev-doc-review 결과 반영. v1.3 주요 변경:

- **Stage A no-op false-positive 수정 (P1)**: `applyCodeChange`가 `{ content, changed }`를 반환하도록 변경. Stage A 성공 조건을 "final == afterContent AND 모든 suggestion이 `changed=true`"로 강화 (§코드 변경 1, §Exact Reconciliation 알고리즘). 이전에는 `beforeCode`가 매칭 안 되는 suggestion이 no-op되어도 나머지 변경만으로 afterContent가 우연히 달성되면 no-op suggestion까지 APPLIED로 오표기될 수 있었음.
- Stage A no-op 방어 회귀 테스트 추가 (테스트 #18). 기존 I/O layer 테스트는 #19, #20으로 리넘버 (§테스트).
- §선택한 접근 핵심 흐름을 v1.1 PR-scope + v1.2 pure/I/O 분리 반영하도록 재작성. `isFork` 언급 제거 (실제 사용처 없음).
- Stage A, B 모두 실패한 파일도 `unaccountedFilePaths`에 포함된다는 규칙 명시 (§3-1).
- Vitest 셋업에 `vite-tsconfig-paths` 플러그인 추가 (§테스트 셋업). 프로젝트의 `@/*` alias가 테스트에서 해석되도록.
- `applyCodeChange` 호출부(내부 Apply Fix, pure matching function)는 새 반환 타입에 맞춰 `.content`를 사용 (§코드 변경 6, §3-1).

## v1.2 개정 요약

두 번째 dev-doc-review 결과 반영. v1.2 주요 변경:

- Reconcile helper를 pure matching function과 I/O orchestration layer로 분리 (§코드 변경 3). 테스트 대부분이 DB/API mock 없이 fixture만으로 가능해짐.
- `matchSuggestionsAgainstCompare` 반환 타입에 `matchedFilePaths`, `unaccountedFilePaths`, `ambiguousFilePaths` 명시 (§코드 변경 3-1).
- rename/removed 파일과 null content 파일의 처리 규칙 명시 — 자연히 `unaccountedFilePaths` 편입되어 `skipReview=false`로 귀결 (§코드 변경 3-1).
- fast-path 앞에 `Repository` row 조회 단계 명시 (§코드 변경 4).
- 사라진 reason variant `internal_apply_fix` 제거 (helper가 해당 경로를 반환할 수 없음).
- migration 배포 순서 규칙 추가 — 코드 배포 이전에 `prisma migrate deploy` (§구현 규칙).
- 테스트 명세를 세 파일로 재구성: `apply-code-change.test.ts` (8), `match-suggestions-against-compare.test.ts` (9, pure), `reconcile-native-suggestions.test.ts` (2, I/O).

## v1.1 개정 요약

dev-doc-review 결과를 반영한 개정. 주요 변경:

- 내부 `Apply Fix` 경로에 `appliedSource = INTERNAL_APPLY_FIX` 기록 단계 추가 (§코드 변경 6).
- 마이그레이션에 기존 `APPLIED` 레코드 backfill SQL 추가 (§데이터 모델 변경).
- fork PR에서 head repo/owner를 payload에서 추출하는 단계와 token 권한 제약 처리 명시 (§코드 변경 2, 4).
- fast-path를 `repositoryId + prNumber`로 scope (§코드 변경 4).
- reconciliation 내부 GitHub API 호출 실패 시 safe fallback 규칙 추가 (§구현 규칙).
- 매칭 review 선택 tie-break을 `createdAt DESC`로 명시 (§구현 규칙).
- v1은 webhook 응답 내 동기 reconciliation 유지. Inngest 이관은 실운영 관측 후 재검토 (§남은 질문 5).
- v1 scope에 Vitest 셋업과 pure-function unit test 스윗을 포함 (§테스트).

## 문제 정의

현재 HReviewer의 suggestion 적용 동작은 비대칭이다.

- 내부 `Apply Fix`는 HReviewer가 직접 커밋을 생성하고, 반환된 commit SHA를 `Suggestion.appliedCommitSha`에 저장한 뒤, 이후 들어오는 `pull_request.synchronize` webhook의 `after` SHA가 그 값과 일치하면 리뷰를 건너뛴다.
- 반면 GitHub native `Commit suggestion`도 PR head 브랜치에 새 커밋을 만들지만, 현재 프로젝트는 그 SHA를 어디에도 기록하지 않는다.
- 그 결과 GitHub에서 suggestion을 받아들여도 HReviewer는 이를 일반적인 PR 업데이트로 취급한다. 기존 suggestion은 `PENDING`으로 남고, 새 리뷰가 다시 큐잉되며, GitHub 상태와 HReviewer 상태가 어긋난다.

이로 인해 실제로 발생하는 문제는 두 가지다.

1. 이미 게시된 HReviewer suggestion만 적용한 커밋인데도 불필요한 재리뷰가 발생한다.
2. suggestion 테이블이 GitHub에서 이미 수락된 suggestion을 반영하지 못한다.

## 목표

GitHub native suggestion 수락이 결과적으로 HReviewer `Apply Fix`와 동일하게 동작하도록 만든다.

- 매칭된 suggestion은 `PENDING`에서 `APPLIED`로 전이되어야 한다.
- webhook의 `after` SHA를 `appliedCommitSha`에 기록해야 한다.
- 내부 apply-fix와 GitHub native 수락을 구분하기 위해 `INTERNAL_APPLY_FIX`, `GITHUB_NATIVE`를 저장해야 한다.
- synchronize 커밋이 기존 pending suggestion만으로 완전히 설명되면, internal apply-fix와 동일하게 리뷰 큐잉을 건너뛰어야 한다.
- synchronize 커밋에 suggestion 수락과 추가 수동 수정이 섞여 있으면, 매칭된 suggestion만 적용 처리하고 새 리뷰는 계속 생성해야 한다.

## 비목표

- 전용 "suggestion accepted" GitHub webhook에 의존하지 않는다. 현재 프로젝트는 그런 저장소 webhook을 사용하지 않는다.
- GitHub App 또는 봇 계정으로 전환하지 않는다.
- v1에서 GitHub review thread ID 또는 comment ID를 필수로 요구하지 않는다.
- 단순히 suggestion과 비슷해 보이는 임의의 수동 수정까지 applied suggestion으로 취급하지 않는다.
- 기존 internal `Apply Fix` 동작을 바꾸지 않는다.

## 외부 제약

- GitHub 문서상 suggested change를 적용하면 pull request compare branch에 커밋이 생성되며, 여러 suggestion을 배치로 적용해도 하나의 커밋이 생성된다.
- GitHub는 `pull_request_review_comment`, `pull_request_review`, `pull_request_review_thread` 이벤트를 제공하지만, 현재 프로젝트는 `pull_request`, `issue_comment`만 구독한다.
- `pull_request_review_thread`의 `resolved`는 신뢰할 수 있는 "suggestion accepted" 신호가 아니다. thread가 resolve되었다고 해서 정확히 그 suggestion이 commit되었다는 뜻은 아니다.

참고 자료:

- https://docs.github.com/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/incorporating-feedback-in-your-pull-request
- https://docs.github.com/en/webhooks/webhook-events-and-payloads

## 현재 동작

현재 관련 코드 경로:

- webhook 구독: `module/github/lib/github.ts`
  - `events: ["pull_request", "issue_comment"]`
- webhook 핸들러: `app/api/webhooks/github/route.ts`
  - `pull_request.opened` 처리
  - `pull_request.synchronize` 처리
  - `after`가 `Suggestion.appliedCommitSha`와 일치하는 경우에만 skip
- internal apply-fix 액션: `module/suggestion/actions/index.ts`
  - `commitFileUpdate()`로 직접 커밋 생성
  - `status = "APPLIED"` 업데이트
  - `appliedCommitSha = commitSha` 저장

현재 GitHub native 수락 경로:

1. 사용자가 GitHub에서 `Commit suggestion`을 누른다.
2. GitHub가 PR head 브랜치에 새 커밋을 만든다.
3. GitHub가 `pull_request.synchronize`를 보낸다.
4. `after` SHA가 `Suggestion.appliedCommitSha`에서 발견되지 않는다.
5. `reviewPullRequest()`가 큐잉된다.
6. 기존 suggestion은 `PENDING`으로 남는다.

## 선택한 접근

정확한 `before/after` 파일 내용 비교를 이용해 synchronize 시점에 reconciliation을 수행한다.

이 방식은 현재 webhook 모델을 유지하면서도 review-thread 기반의 애매한 휴리스틱을 피할 수 있다.

### 핵심 흐름

`pull_request.synchronize` 발생 시 webhook 핸들러의 순서는 다음과 같다. 상세 단계는 §코드 변경 4 참조.

1. payload에서 `before`, `after`, `pull_request.number`, base `repository.full_name`, 그리고 head repo 식별자(`pull_request.head.repo.owner.login`, `pull_request.head.repo.name`)를 파싱한다. compare/getContent 호출은 fork PR을 지원하기 위해 base repo가 아니라 head repo 기준으로 한다.
2. base repository를 DB에서 조회한다.
3. Fast path: `repositoryId + prNumber + appliedCommitSha == after` 조건으로 이미 HReviewer 커밋인지 확인. 매칭되면 즉시 종료.
4. 그렇지 않으면 reconciliation을 수행한다. 구현은 두 층으로 나뉜다.
   - **Pure matching function** (`matchSuggestionsAgainstCompare`): review 로드·compare fetch·content fetch로 준비된 입력에서 Stage A/B 알고리즘을 수행한다. 외부 의존성 없음.
   - **I/O orchestration** (`reconcileNativeSuggestions`): DB에서 `Review.headSha == before`인 가장 최신 review (`createdAt DESC` LIMIT 1)를 찾고, pending suggestion을 로드하고, head repo 기준 compare/content를 가져온 뒤 pure function에 넘긴다.
5. 매칭된 suggestion은 `APPLIED`로 전이시키고 `appliedCommitSha = after`, `appliedSource = GITHUB_NATIVE`를 기록한다.
6. 모든 changed file이 reconciled suggestion만으로 완전히 설명되고, 최소 1개 이상의 suggestion이 매칭되었을 때만 `reviewPullRequest()`를 skip한다. 그 외에는 기존대로 review를 큐잉한다.

## Exact Reconciliation 알고리즘

false positive를 피하기 위해 reconciliation 규칙은 강하게 제한해야 한다.

### 파일 단위 규칙

각 changed file마다 다음을 수행한다.

1. `before` SHA 기준 `beforeContent`를 가져온다.
2. `after` SHA 기준 `afterContent`를 가져온다.
3. 매칭된 review에서 해당 파일의 pending suggestion을 수집한다.
4. suggestion을 `lineNumber` **내림차순**으로 정렬한다. (뒤에서부터 치환해야 앞쪽 line 인덱스와 오프셋이 보존되어, 여러 suggestion이 인접한 영역을 건드려도 서로의 매칭을 깨뜨리지 않는다.)
5. **Stage A — 일괄 적용**: 정렬된 순서대로 모든 pending suggestion을 `strict: true`로 `beforeContent`에 순차 적용한다. `applyCodeChange`는 `{ content, changed }`를 반환하므로 각 단계에서 `changed` 플래그를 수집한다.
   - Stage A는 다음 **두 조건을 모두 만족할 때만** 성공으로 간주한다.
     1. 최종 `content`가 `afterContent`와 정확히 일치
     2. 적용한 모든 suggestion이 `changed=true`를 반환 (즉, 하나도 no-op이 아님)
   - 조건 2가 빠지면 false positive가 생긴다. 예: suggestion #1의 `beforeCode`가 하필 `beforeContent`에 없고 (AI hallucination 또는 라인 오정렬), 사용자가 #1과 같은 결과를 우연히 수동 편집하면서 #2, #3을 함께 commit한 경우. 최종 `content`는 `afterContent`와 같아지지만 #1은 실제로 "수락된" 적이 없다. 이를 APPLIED로 표기하면 §비목표 "유사 수동 수정은 applied로 취급하지 않는다"를 위반한다.
   - Stage A 실패 시 Stage B로 진행한다.
6. **Stage B — 개별 적용**: 각 suggestion을 단독으로 `beforeContent`에 `strict: true`로 적용해 `afterContent`와 비교한다. 이 때도 `{ content, changed }` 반환의 `changed=true` AND `content == afterContent`인 경우만 단독 exact match로 인정한다.
   - exact match인 suggestion이 정확히 1개면 그 suggestion만 매칭된 것으로 간주한다.
   - exact match인 suggestion이 2개 이상이면 해당 파일은 ambiguous로 간주하고 자동 reconciliation을 하지 않는다.
7. Stage A, B 모두 실패하면 해당 파일은 reconcile하지 않는다 (§3-1에서 `unaccountedFilePaths`에 편입됨).

`beforeContent`와 `afterContent`는 비교 전 `\r\n` → `\n`으로만 정규화한다. 그 외 whitespace 정규화는 하지 않는다 (shared apply helper의 `strict: true` 경로가 line ending만 정규화하는 것과 정합).

이 2단계 접근은 실제 사용자 행동(일괄 batch commit 또는 하나씩 commit) 대부분을 커버한다. 부분 subset(예: 3개 중 2개만 적용)을 다루려면 subset enumeration이 필요하지만, v1에서는 도입하지 않는다. 실운영 데이터에서 Stage A/B로 커버되지 않는 케이스가 충분히 관측되면 그때 확장한다.

### Skip-review 규칙

아래 조건을 모두 만족할 때만 `skipReview = true`로 설정한다.

- 최소 1개 이상의 suggestion이 reconciled 되었다.
- compare 결과의 모든 changed file이 정확히 reconciliation 되었다.
- reconciled suggestion 밖의 changed file이 없다.
- 어떤 파일도 ambiguous match(Stage B에서 단독 exact match가 2개 이상)를 만들지 않았다.

위 조건 중 하나라도 만족하지 않으면 `skipReview = false`를 유지한다.

이 규칙이 보장하는 동작:

- 순수한 GitHub native suggestion commit -> applied 처리 + review skip
- GitHub native suggestion commit + 추가 수동 수정 -> 매칭된 suggestion만 applied 처리 + review 계속
- suggestion과 비슷해 보이지만 exact result는 아닌 수동 수정 -> auto-apply 없음 + review 계속

## 이 접근을 선택한 이유

채택하지 않은 대안:

- `pull_request_review_thread.resolved`
  - resolve되었다고 해서 정확히 그 suggestion이 commit되었다는 보장이 없다.
- commit message 매칭
  - GitHub native suggestion 적용 시 사용자가 commit message를 직접 정할 수 있다.
- `sender.login` 또는 author 기반 필터링
  - manual commit과 native suggestion commit 모두 동일한 인간 사용자 계정으로 보일 수 있다.
- 먼저 GitHub review comment ID를 저장하고 review-thread 이벤트로 reconciliation
  - 장기적으로는 가능하지만, 올바른 v1 구현에 필수는 아니다.

현재 아키텍처에서 가장 강한 신호는 다음 세 가지다.

- 정확한 review snapshot SHA인 `before`
- 새로운 head SHA인 `after`
- 두 SHA 사이의 정확한 파일 내용 차이

## 데이터 모델 변경

`prisma/schema.prisma`를 다음과 같이 수정한다.

```prisma
enum SuggestionApplySource {
  INTERNAL_APPLY_FIX
  GITHUB_NATIVE
}

model Suggestion {
  id               String                @id @default(cuid())
  reviewId         String
  review           Review                @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  filePath         String
  lineNumber       Int
  beforeCode       String                @db.Text
  afterCode        String                @db.Text
  explanation      String                @db.Text
  severity         SuggestionSeverity    @default(SUGGESTION)
  status           SuggestionStatus      @default(PENDING)
  appliedAt        DateTime?
  appliedCommitSha String?
  appliedSource    SuggestionApplySource?
  dismissedAt      DateTime?
  createdAt        DateTime              @default(now())
  updatedAt        DateTime              @updatedAt

  @@index([reviewId])
  @@index([status])
  @@index([appliedCommitSha])
}
```

Migration 이름:

`add_suggestion_apply_source`

Migration은 다음 backfill SQL을 포함해야 한다. 기존 `APPLIED` 레코드는 모두 내부 `Apply Fix`에서 생성된 것이므로 안전하게 채울 수 있다.

```sql
UPDATE "suggestion"
SET "appliedSource" = 'INTERNAL_APPLY_FIX'
WHERE "status" = 'APPLIED' AND "appliedSource" IS NULL;
```

이 backfill이 없으면 기존 APPLIED 레코드는 영구히 NULL로 남아 이후 소스별 통계/분석에서 legacy 분기가 필요해진다.

## 코드 변경

### 1. 공통 apply helper 추출

`module/suggestion/lib/apply-code-change.ts`를 생성한다.

- `applyCodeChange()` 이동
- `replaceNearestOccurrence()` 이동
- 기존 동작은 유지하되 `strict: boolean` 파라미터를 추가한다.

현재 `applyCodeChange()`는 두 경로를 가진다.

- 경로 A: `content.includes(before)`로 정확 매칭 후 치환
- 경로 B (fallback): trailing whitespace 정규화 + flex regex로 근사 매칭 후 치환

내부 `Apply Fix`는 사용자가 직접 버튼을 누르는 상황이므로 경로 B의 근사 매칭이 유용하다. 그러나 GitHub native reconciliation은 **경로 B를 허용하면 false positive가 생긴다**. 예: suggestion의 `beforeCode`가 trailing whitespace를 포함하는데 실제 파일에는 그 공백이 없고, 유저가 해당 라인을 수동으로 바꿨을 때, 경로 B가 매칭되어 "suggestion 수락됨"으로 오인된다.

따라서 helper 시그니처를 다음과 같이 정의한다. 반환 타입은 `{ content, changed }` 튜플이다. `changed` 플래그는 Stage A no-op false positive를 방어하기 위해 필요하다 (§Exact Reconciliation 알고리즘 참조).

```ts
type ApplyCodeChangeResult = {
  content: string;     // 치환 후 파일 내용. 매칭 실패 시 정규화된 입력 그대로.
  changed: boolean;    // 실제로 치환이 일어났는지 여부.
};

applyCodeChange({
  fileContent,
  beforeCode,
  afterCode,
  lineNumber,
  strict, // true면 경로 A만 사용, false면 경로 B fallback 허용
}): ApplyCodeChangeResult;
```

- 내부 `Apply Fix` (`module/suggestion/actions/index.ts`)는 `strict: false`로 호출하여 기존 동작 유지. 반환값 중 `.content`만 사용한다 (기존 string 반환과 동등).
- GitHub native reconciliation은 `strict: true`로 호출. pure matching function은 `.content`와 `.changed` 둘 다 사용하여 no-op 단계를 감지한다.

이후 `module/suggestion/actions/index.ts`는 inline 함수 정의 대신 이 공통 helper를 import해서 사용한다. 반환 타입 변경은 extraction과 함께 이루어지므로 호환 문제는 없다.

### 2. Compare helper 추가

`module/github/lib/github.ts`를 확장한다.

다음 형태의 helper를 추가한다.

```ts
getCompareFiles({
  token,
  owner,
  repo,
  base,
  head,
})
```

기대 반환값:

- changed file path 목록
- 파일 status
- GitHub가 제공하는 경우 patch text

이 helper는 fork PR도 동작해야 하므로 base repo가 아니라 PR head repository에 대해 호출해야 한다. 호출부에서는 webhook payload의 `pull_request.head.repo.owner.login` / `pull_request.head.repo.name`을 그대로 `owner` / `repo`로 넘긴다.

fork이면서 HReviewer가 설치되지 않은 외부 사용자 소유 repo의 경우 현재 access token이 compare/content 읽기 권한을 가지지 못할 수 있다. API 호출이 401/403/404로 실패하면 reconciliation 전체를 `skipReview = false`로 끝내고 예외를 상위로 전파하지 않는다 (§구현 규칙 참조). 이 실패 경로는 `reason = "compare_api_failed"`로 로그에 남긴다.

### 3. Native reconciliation — pure matching function과 I/O orchestration 분리

테스트 용이성과 관심사 분리를 위해 두 층으로 나눈다. 매칭 알고리즘은 외부 의존성 없는 pure function으로 두고, DB/GitHub API 호출은 얇은 orchestration layer에 격리한다.

#### 3-1. Pure matching function

`module/suggestion/lib/match-suggestions-against-compare.ts`를 생성한다.

책임: DB/Network 접근 없이, 입력으로 받은 데이터만으로 Stage A/B 알고리즘을 수행하고 skip-review 조건을 결정한다.

시그니처:

```ts
type CompareFileInput = {
  path: string;
  status: "added" | "modified" | "removed" | "renamed" | "changed" | string;
  beforeContent: string | null; // null = 파일 없음 또는 content 로드 실패
  afterContent: string | null;
};

type PendingSuggestion = {
  id: string;
  filePath: string;
  lineNumber: number;
  beforeCode: string;
  afterCode: string;
};

type MatchInput = {
  compareFiles: CompareFileInput[];
  pendingSuggestions: PendingSuggestion[];
};

type MatchResult = {
  matchedSuggestionIds: string[];
  matchedFilePaths: string[];
  unaccountedFilePaths: string[];
  ambiguousFilePaths: string[];
  skipReview: boolean;
  reason:
    | "exact_match_all_files"
    | "partial_match"
    | "ambiguous_match"
    | "no_changed_files"
    | "no_pending_suggestions";
};

matchSuggestionsAgainstCompare(input: MatchInput): MatchResult;
```

파일 처리 규칙 (bucket 결정):

- `status === "removed"` 또는 `"renamed"`인 파일은 매칭 대상에서 제외하고 `unaccountedFilePaths`에 추가한다.
- `beforeContent === null` 또는 `afterContent === null` (파일 크기 초과, 외부 로드 실패)인 파일도 `unaccountedFilePaths`에 추가한다.
- Stage A 또는 Stage B에서 단독 exact match한 파일은 `matchedFilePaths`에 추가한다.
- Stage B에서 단독 exact match가 2개 이상인 파일은 `ambiguousFilePaths`에 추가한다.
- Stage A, B 모두 실패한 파일은 `unaccountedFilePaths`에 추가한다.

즉 `unaccountedFilePaths`는 "이 파일은 pending suggestion만으로 설명되지 않는다"라는 의미를 가진 포괄적 bucket이다. `unaccountedFilePaths` 혹은 `ambiguousFilePaths`가 비어있지 않으면 `skipReview=false`.

Stage A/B 내부에서는 `applyCodeChange`의 `{ content, changed }` 반환 중 `changed` 플래그를 이용해 no-op 단계를 감지해야 한다. Stage A는 "모든 suggestion이 `changed=true`이면서 최종 content가 `afterContent`와 일치"할 때만 성공으로 간주한다 (§Exact Reconciliation 알고리즘).

pure function이므로 vitest fixture만으로 모든 분기 검증이 가능하다. DB/Octokit mock 불필요.

#### 3-2. I/O orchestration layer

`module/suggestion/lib/reconcile-native-suggestions.ts`를 생성한다.

책임: DB/GitHub API 호출 orchestration. 매칭 판단 자체는 3-1에 위임한다.

시그니처:

```ts
reconcileNativeSuggestions({
  token,
  headOwner,         // payload.pull_request.head.repo.owner.login
  headRepoName,      // payload.pull_request.head.repo.name
  baseRepositoryId,  // DB Repository.id (review 조회용)
  prNumber,
  beforeSha,
  afterSha,
}): Promise<NativeSuggestionReconciliationResult>;
```

반환 타입은 `MatchResult`를 확장한다.

```ts
type NativeSuggestionReconciliationResult =
  | MatchResult
  | {
      matchedSuggestionIds: [];
      matchedFilePaths: [];
      unaccountedFilePaths: string[];
      ambiguousFilePaths: [];
      skipReview: false;
      reason:
        | "no_matching_review"
        | "no_pending_suggestions"
        | "compare_api_failed"
        | "content_api_failed";
    };
```

실행 순서:

1. `baseRepositoryId + prNumber + headSha == beforeSha` 조건으로 review 조회 (`createdAt DESC LIMIT 1`). 없으면 `reason: "no_matching_review"`로 반환.
2. 해당 review의 `PENDING` suggestion 로드. 0개면 `reason: "no_pending_suggestions"`로 반환.
3. `getCompareFiles({ token, owner: headOwner, repo: headRepoName, base: beforeSha, head: afterSha })` 호출. throw 또는 401/403/404 → `reason: "compare_api_failed"`로 반환.
4. 각 changed file에 대해:
   - `status`가 `"removed"` / `"renamed"`이면 content 로드 생략 (3-1이 unaccounted로 처리).
   - 그 외 파일은 `getFileContent`로 before/after를 각각 로드. 1MB 초과 또는 fetch 실패면 해당 파일의 content를 `null`로 설정.
   - 모든 파일에서 content fetch 호출 자체가 throw하면 `reason: "content_api_failed"`로 반환.
5. `compareFiles` 배열과 `pendingSuggestions` 배열을 3-1의 `matchSuggestionsAgainstCompare`에 넘긴다.
6. 3-1의 `MatchResult`를 그대로 반환.

이 orchestrator는 로직이 거의 없으므로 unit test 우선순위가 낮다. DB tie-break과 API 실패 fallback 2가지만 integration test로 커버한다 (§테스트 참조).

### 4. Webhook 통합

`app/api/webhooks/github/route.ts`를 수정한다.

새로운 `synchronize` 처리 순서:

1. payload에서 다음을 추출한다.
   - `before`, `after` SHA
   - `pull_request.number`
   - `pull_request.head.repo.owner.login` (headOwner)
   - `pull_request.head.repo.name` (headRepoName)
   - `repository.full_name` (base repo, DB 조회용)
2. `repository.full_name`을 `owner / repoName`으로 파싱한 뒤, `prisma.repository.findFirst({ where: { owner, name: repoName } })`로 `baseRepository` row를 조회한다. 조회 실패 시 webhook은 reconciliation 없이 기존 경로(`reviewPullRequest()` 시도)로 진행한다.
3. 기존 fast path를 유지하되 **PR scope를 추가한다**. 현재 코드(route.ts:94)는 전역 `appliedCommitSha == after` 하나로만 매칭한다.
   ```ts
   const appliedSuggestion = await prisma.suggestion.findFirst({
     where: {
       appliedCommitSha: afterSha,
       review: {
         repositoryId: baseRepository.id,
         prNumber,
       },
     },
   });
   ```
   - cross-PR cherry-pick처럼 동일 SHA가 다른 컨텍스트에 나타나는 경우의 false-positive skip을 차단한다.
4. fast path에서 매칭이 없으면 native reconciliation을 수행한다. reconcile helper에는 head repo/owner를 전달한다 (§코드 변경 3 참조).
5. 매칭된 suggestion을 `updateMany()`로 갱신하되, **optimistic lock 가드를 반드시 포함한다**:
   ```ts
   await prisma.suggestion.updateMany({
     where: { id: { in: matchedSuggestionIds }, status: "PENDING" },
     data: {
       status: "APPLIED",
       appliedAt: new Date(),
       appliedCommitSha: after,
       appliedSource: "GITHUB_NATIVE",
     },
   });
   ```
   - `status: "PENDING"` 조건은 GitHub가 같은 synchronize를 중복 전송하거나 여러 webhook이 동시 도착할 때 중복/역순 업데이트를 방지한다.
   - 내부 `Apply Fix` (`module/suggestion/actions/index.ts`)가 이미 같은 패턴을 사용하고 있다.
6. `skipReview`가 true면 즉시 반환
7. 아니면 기존대로 `reviewPullRequest()` 수행

v1은 reconciliation을 webhook 응답 내에서 **동기로** 수행한다. 대형 PR에서 10초 webhook deadline에 근접할 가능성은 존재하지만, 현재 사용 규모에서 tail case이므로 Inngest job 이관은 §남은 질문 5로 deferred. 대형 PR 관측을 위해 reconcile helper는 시작/종료 시각과 파일 수를 로그로 남긴다.

### 5. Webhook 구독 범위

v1에서는 webhook 이벤트를 확장하지 않는다.

유지:

- `pull_request`
- `issue_comment`

이 기능의 첫 구현에서는 `pull_request_review_thread`, `pull_request_review_comment`를 추가하지 않는다.

### 6. 내부 Apply Fix에 `appliedSource` 채우기 + 반환 타입 변경 흡수

`module/suggestion/actions/index.ts`에서 두 가지 변경을 동시에 적용한다.

1. inline으로 정의되어 있던 `applyCodeChange` 호출을 §코드 변경 1의 공통 helper 호출로 교체. 새 helper는 `{ content, changed }`를 반환하므로 호출부는 `.content`만 사용한다.
   ```ts
   const { content: updatedContent } = applyCodeChange({
     fileContent,
     beforeCode: suggestion.beforeCode,
     afterCode: suggestion.afterCode,
     lineNumber: suggestion.lineNumber,
     strict: false,
   });
   // 기존 로직은 updatedContent를 사용
   ```
2. 기존 `updateMany` 호출에 `appliedSource: "INTERNAL_APPLY_FIX"`를 추가한다.
   ```ts
   await prisma.suggestion.updateMany({
     where: { id: suggestionId, status: "PENDING" },
     data: {
       status: "APPLIED",
       appliedAt: new Date(),
       appliedCommitSha: commitSha,
       appliedSource: "INTERNAL_APPLY_FIX", // NEW
     },
   });
   ```

(2) 없이 enum만 추가하면 앞으로 생성되는 내부 apply 레코드가 전부 `NULL`로 남아 enum 추가의 목적이 무력화된다.

## 구현 규칙

- review 선택 기준은 `repositoryId + prNumber + headSha == beforeSha`이며, 동일 조건의 row가 여러 개면 `createdAt DESC` LIMIT 1을 적용한다.
- webhook의 `before` SHA와 맞지 않는 review에 대해 reconciliation하지 않는다.
- GitHub native flow에서 파일 reconciliation이 exact하지 않으면 suggestion을 `APPLIED`로 바꾸지 않는다.
- 이 기능에서는 unmatched suggestion을 `CONFLICTED`로 바꾸지 않는다.
- reconciled suggestion으로 설명되지 않는 추가 changed file이 있으면 review를 skip하지 않는다.
- v1에서는 Stage A(전체 일괄 적용)와 Stage B(각 suggestion 단독 적용) 외의 subset matching은 시도하지 않는다.
- 파일 equality 비교 및 reconciliation 용도의 `applyCodeChange` 호출에서는 `strict: true`를 사용하여 line ending normalization만 허용한다. 내부 `Apply Fix`는 기존대로 `strict: false` 경로를 유지한다.
- `Review.headSha`는 스키마상 nullable(`String?`)이므로 null인 review는 reconciliation 대상에서 자연히 제외된다. 구현 시 non-null을 강제하지 않는다.
- 대상 파일이 GitHub getContent API의 1MB 한도를 초과하면 `beforeContent`/`afterContent`를 신뢰할 수 없다. 이 경우 해당 파일은 reconcile 불가로 처리하고 전체 `skipReview`도 false로 유지한다. 로그에 파일 크기 초과 사실을 남긴다.
- reconcile helper 내부의 GitHub API 호출(compare, getContent)이 실패하면 예외를 상위로 전파하지 않고 `matchedSuggestionIds = []`, `skipReview = false`, 적절한 `reason`(`compare_api_failed` 또는 `content_api_failed`)으로 반환한다. webhook 핸들러는 이 결과를 받아 기존대로 `reviewPullRequest()`를 큐잉한다. fork PR에서 token 권한 부족으로 발생하는 401/403/404도 같은 경로로 처리한다.
- webhook synchronize fast-path는 `appliedCommitSha = after` 단독 조건이 아니라 `repositoryId + prNumber + appliedCommitSha` 복합 조건을 사용한다.
- Compare API가 반환하는 `status`가 `"removed"` 또는 `"renamed"`인 파일은 `match-suggestions-against-compare`에서 자동으로 `unaccountedFilePaths`에 편입되어 `skipReview=false`로 귀결된다. I/O layer는 이런 파일에 대해 `getFileContent` 호출을 생략한다.
- 매칭 알고리즘(Stage A/B)은 `matchSuggestionsAgainstCompare` pure function에만 존재해야 한다. I/O orchestration layer(`reconcileNativeSuggestions`)는 DB/GitHub API 호출과 데이터 준비만 담당하고, 매칭 판단은 pure function 호출 결과를 그대로 사용한다.
- Migration `add_suggestion_apply_source`는 새 코드 배포 이전에 `npx prisma migrate deploy`로 적용한다. 역순으로 배포되면 새 코드의 `appliedSource` 쓰기가 "column does not exist" 런타임 에러로 실패한다. backfill SQL은 이 migration 내부에 포함되므로 별도 단계가 없다.

## 테스트

현재 프로젝트에는 테스트 인프라가 없다. 이 기능은 Stage A/B 알고리즘, CRLF 정규화, strict vs flexible 경로 분기, 다중 suggestion 내림차순 적용 등 **pure function으로 검증하기 쉽고 false-positive/negative 비용이 유저 신뢰에 직결**되는 로직이 집중되어 있다. v1 scope에 Vitest 셋업과 아래 unit test 스윗을 포함한다.

### 셋업

- `vitest`, `@types/node`, `vite-tsconfig-paths` devDependency 추가.
- `vitest.config.ts` 생성 (Node 환경, `**/*.test.ts` 패턴). `vite-tsconfig-paths` 플러그인을 등록해 프로젝트 `tsconfig.json`의 `@/*` alias가 테스트에서도 해석되도록 한다. 이 플러그인 없이는 `import ... from "@/module/..."`가 `Cannot find module` 에러로 실패한다.
- `package.json`에 `"test": "vitest run"`, `"test:watch": "vitest"` 스크립트 추가.
- 테스트 파일은 대상 모듈과 동일 디렉토리의 `__tests__/` 하위에 위치한다.

### 필수 unit test (v1 scope)

`module/suggestion/lib/__tests__/apply-code-change.test.ts` (8 tests, pure function)

1. `strict: true` — 정확 매칭 happy path. `content`는 치환 결과, `changed === true`.
2. `strict: true` — `beforeCode`가 파일에 없으면 `content`는 정규화된 원본, **`changed === false`**.
3. `strict: true` — `beforeCode`가 여러 번 등장 시 `lineNumber`에 가장 가까운 것만 치환. `changed === true`.
4. `strict: true` — CRLF 혼재 입력도 `content`가 LF 기준 afterContent와 일치, `changed === true`.
5. `strict: true` — trailing whitespace 차이만 있는 라인은 매칭 **실패**. `content`는 원본 유지, **`changed === false`** (false-positive 방지 회귀 테스트, critical).
6. `strict: false` — 경로 A가 우선이며 정확 매칭 시 경로 B는 호출되지 않음. `changed === true`.
7. `strict: false` — 경로 A 실패 시 경로 B로 flex 매칭 성공. `changed === true` (기존 내부 Apply Fix 회귀 테스트, critical).
8. `strict: false` — 경로 B의 whitespace 허용 동작. `changed === true`.

`module/suggestion/lib/__tests__/match-suggestions-against-compare.test.ts` (9 tests, pure function, **mock 없이 fixture만으로 작성 가능**)

9. Stage A 성공 — 단일 파일, 단일 suggestion → `matchedSuggestionIds=[s1]`, `skipReview=true`, `reason="exact_match_all_files"`
10. Stage A 성공 — 단일 파일, 다중 suggestion, 내림차순 적용으로 line 인덱스 보존 검증
11. Stage A 성공 — 다중 파일 배치 commit → 모든 suggestion matched, `skipReview=true`
12. Stage B 성공 — 단독 exact match 1개 → 해당 suggestion만 matched
13. Stage B ambiguous — 단독 exact match 2개 이상 → `matched=[]`, `ambiguousFilePaths`에 파일 포함, `skipReview=false`, `reason="ambiguous_match"`
14. Stage A/B 모두 실패 → suggestion 변경 없음, `skipReview=false`, `reason="partial_match"`
15. Unaccounted file — reconciled suggestion 밖의 changed file이 존재 → `unaccountedFilePaths`에 파일 포함, `skipReview=false`
16. Rename/removed 파일 — `status: "renamed"` 또는 `"removed"`인 파일은 `unaccountedFilePaths`에 포함되고 `skipReview=false`
17. Null content — `beforeContent` 또는 `afterContent`가 `null`인 파일도 동일하게 `unaccountedFilePaths`에 편입되고 `skipReview=false`
18. **Stage A no-op 방어 (critical regression test, v1.3)** — 3개 suggestion 중 #1의 `beforeCode`가 beforeContent에 없는 fixture. #2, #3이 정확 매칭되어 beforeContent를 afterContent로 변환. Stage A 최종 content가 afterContent와 같더라도 #1이 `changed=false`이므로 Stage A는 실패해야 한다. Stage B 개별 적용도 #1은 단독 매칭 안 되고, #2/#3은 단독 적용해도 afterContent에 못 이르므로 Stage B도 실패. 최종 결과: `matchedSuggestionIds=[]`, 파일은 `unaccountedFilePaths`에 포함, `skipReview=false`.

`module/suggestion/lib/__tests__/reconcile-native-suggestions.test.ts` (2 tests, I/O orchestration. DB/Octokit mock 최소화 — 필요하면 `vitest-mock-extended` 또는 간단한 manual mock)

19. Review tie-break — 동일 `headSha`를 가진 review가 여러 개일 때 `createdAt DESC` LIMIT 1이 선택됨
20. API 실패 fallback — compare 호출이 throw → `reason="compare_api_failed"`, `skipReview=false`, 예외가 상위로 전파되지 않음

20개 테스트 중 18개가 pure function 대상이므로 Prisma/Octokit mock 복잡도는 I/O layer 테스트 2개에만 국한된다.

## 검증 시나리오

필수 수동/E2E 검증 (unit test 스윗 위에 추가로 수행):

1. internal `Apply Fix`는 여전히 자신의 후속 `synchronize`에서 review를 skip해야 한다.
2. GitHub native `Commit suggestion`으로 단일 suggestion을 적용하면 해당 suggestion이 `appliedSource = GITHUB_NATIVE`와 함께 `APPLIED` 처리되고 review가 skip되어야 한다.
3. 여러 파일의 suggestion을 GitHub native batch commit으로 적용하면 모든 매칭 suggestion이 `APPLIED` 처리되고 review가 skip되어야 한다.
4. GitHub native batch commit과 추가 수동 수정이 섞여 있으면 exact match된 suggestion만 `APPLIED` 처리되고, 새 review는 계속 큐잉되어야 한다.
5. suggestion과 유사하지만 exact result가 아닌 수동 수정은 suggestion을 `PENDING`으로 유지하고 새 review를 큐잉해야 한다.
6. fork PR에서의 suggestion 수락도 head repo 기준 compare/file read를 통해 정상 동작해야 한다.

필수 pre-merge 체크:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run test` (위 Vitest 스윗 전부 통과)

## 남은 질문

1. old head에 속한 unmatched pending suggestion을 나중에 `CONFLICTED` 또는 새로운 `OUTDATED` 상태로 전이할지 여부
2. 향후 GraphQL 기반 reconciliation 확장이 필요해지는 시점에 `githubReviewCommentId` / `githubReviewThreadId`를 신규 suggestion부터 저장하기 시작할지 여부 (과거 데이터 backfill은 불가하므로 전환 시점의 데이터만 활용)
3. Stage A/B로 커버되지 않는 부분 subset 케이스가 실운영에서 충분히 관측되면 full subset enumeration을 도입할지 여부
4. 큰 PR에서 changed file마다 before/after 2회 fetch하는 비용이 문제가 되면 compare API의 `patch` 필드를 활용한 content fetch 절감 최적화를 도입할지 여부
5. webhook 응답 내 동기 reconciliation이 대형 PR에서 10초 deadline에 근접하는 사례가 관측되면, reconciliation을 Inngest job으로 이관하고 webhook은 즉시 200을 반환하는 구조로 바꿀지 여부. v1은 현재 사용 규모에서 tail case로 판단하여 동기 경로 유지.

## 롤아웃 요약

이 기능은 의도적으로 범위를 좁게 잡는다.

- review 생성 방식은 바꾸지 않는다.
- GitHub webhook 권한은 바꾸지 않는다.
- GitHub App 마이그레이션은 필요 없다.
- internal `Apply Fix`와 GitHub native suggestion acceptance 사이의 동작 격차만 해소한다.

이 설계대로 구현하면, GitHub native suggestion acceptance는 기존 pending suggestion만으로 커밋이 정확히 설명되는 경우 HReviewer `Apply Fix`와 동일한 사용자 경험을 제공하게 된다. 동시에 mixed commit이나 ambiguous commit에서는 안전하게 fallback하여 기존 리뷰 흐름을 유지한다.
