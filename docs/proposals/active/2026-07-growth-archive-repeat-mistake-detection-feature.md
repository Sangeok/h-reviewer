---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: null
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
migrated-from: "docs/archive/2026-07-growth-archive-repeat-mistake-detection-feature.md"
migration-note: "원문의 Core 구현 완료와 미완료 수용 테스트·release gate를 함께 보존한다. 미확인 외부 검증을 완료로 바꾸지 않는다."
---

> 이관 메모 (2026-09-06): 원문의 Core 구현 완료와 미완료 수용 테스트·release gate를 함께 보존한다. 미확인 외부 검증을 완료로 바꾸지 않는다. 경로·메타데이터 변경 전의 hash와 검토 영수증은 당시 기록이며 새 검증 결과가 아니다.

# 반복 실수 감지 (wedge) + addressed 추적 기능 개발 문서

> 보관 상태: **역사 기록** — 이 문서는 2026-07 구현 당시의 결정과 코드 예시를 보존하며 현재 구현 지침이 아니다. 기존 `IMPLEMENTED` 상태와 남은 수동 수용 테스트 기록은 아래에 그대로 보존한다. 현재 구현과 RAG 제거 경계의 source of truth는 코드와 `docs/proposals/active/2026-08-remove-codebase-rag-and-build-deterministic-pr-context.md`다.

> 상태: `IMPLEMENTED` (코드) · 2026-07-13 · 정적 검증 전부 통과(unit test 2/2, tsc, eslint, next build), DB 마이그레이션 `20260713131500_add_review_issue` 적용됨. 남은 것은 런타임 수동 수용 테스트(§5 각 Phase 검증 — 라이브 PR + ngrok + inngest-dev 필요).

## 1. 배경/동기

**비즈니스 맥락** (전략 논의에서 확정):

- HReviewer의 wedge는 "같은 실수, 지난 PR에서도 지적했는데 또 하고 있어요" 알림(반복 실수 감지) 하나로 고정되어 있다. 1인 개발자에게 시니어 리뷰어의 "기억"을 제공하는 것이 차별점.
- 반복 배지의 오탐은 두 층이다: **매칭 오탐**(Track A 캘리브레이션에서 threshold 0.90 기준 ~5%로 검증) × **원본 지적 자체가 오탐일 확률**(미측정). addressed 추적은 두 번째 층을 구조적으로 줄이는 장치다 — "사용자가 실제로 고쳤던 지적"에 라벨을 붙여, 장기적으로 배지가 검증된 이력만 참조하게 한다.
- addressed 라벨은 출시 시점에는 0건이므로(콜드 스타트), v1에서 배지는 라벨 없이 작동하고 addressed는 **수집만** 시작한다. 라벨 기반 가중치는 데이터 축적 후 적용한다.

**기술적 현재 상태** (코드베이스 확인):

- Issue는 DB row가 아니다. `structuredReviewSchema`(`features/ai/lib/review-schema.ts`)의 `issues` 배열로 생성되어 `Review.reviewData Json`에만 저장된다. category(`bug|design|security|performance|testing|general`)와 severity는 이미 스키마에 있다.
- Suggestion은 별도 모델(`prisma/schema.prisma`의 `Suggestion`)로 존재하며, `status(APPLIED/DISMISSED)` + `appliedSource(INTERNAL_APPLY_FIX/GITHUB_NATIVE)`로 **addressed 추적이 이미 구현되어 있다** (`features/suggestion/lib/reconcile-native-suggestions.ts`, 웹훅 `synchronize`에서 호출).
- 인라인 이슈 코멘트는 `postPRReviewWithSuggestions`(`features/review/lib/pr-review.ts`)가 2차 `pulls.createReview` 호출로 게시한다.
- 임베딩 인프라 존재: `generateEmbedding`(`features/ai/lib/generate-embedding.ts`), `gemini-embedding-001` 768d (`features/ai/constants/index.ts`).
- 웹훅(`app/api/webhooks/github/route.ts`)은 `pull_request`의 `opened`/`synchronize`만 처리하며, `synchronize`에서 `beforeSha`/`afterSha`를 이미 파싱한다. `closed` 액션은 처리하지 않는다.

**Track A 캘리브레이션이 확정한 구현 제약** (필수 반영):

1. embeddings-only 매칭 금지 (FP 60~92%) → **category-primary 필터 필수** (같은 카테고리 내에서만 유사도 비교, ≥0.88에서 FP 18.9%)
2. 빈/짧은 텍스트 이슈는 임베딩 전 제외 (sim=1.0 인공물 방지)
3. threshold 시작점 0.88~0.90

> **임베딩 텍스트 범위 결정**: 2차 캘리브레이션 결론은 "코드 포함 임베딩"을 프로덕션 설계안으로 제시했으나, 검증-PASS(FP 18.9%) 구성은 issues 코퍼스(카테고리 有 / **코드 無**)에서 얻은 text+category-primary 조합이었다. 또한 `StructuredIssue`에는 코드 스니펫 필드가 없다(`file`/`line`/`title`/`body`/`impact`/`recommendation`만 존재 — `features/ai/types/suggestion.ts` 확인). 따라서 v1은 **검증된 text-only(title+body) 임베딩**을 사용한다. 코드 포함은 file:line 코드 인출이 필요한 별도 enhancement이며 Open Questions로 이관.

## 2. 목표 상태

### 목표

1. 리뷰 생성 시 각 Issue가 `ReviewIssue` row로 영속화된다 (1 Issue = 1 row, 임베딩 포함).
2. 새 Issue가 같은 사용자의 90일 이내 과거 Issue와 (같은 category + 유사도 ≥ threshold)로 매칭되면, 인라인 코멘트에 `⚠️ 반복 지적` 배지(과거 PR 링크 + 날짜)가 붙는다. cross-repo로 작동한다.
3. `synchronize` 시 Issue가 가리킨 라인이 수정되면 시맨틱 판정을 거쳐 `ADDRESSED_STRONG`/`ADDRESSED_WEAK` 라벨이 붙는다. PR이 **머지**되면 잔여 `PENDING` Issue는 `IGNORED`로 확정된다.
4. 반복 감지 후보에서 `IGNORED` Issue는 제외된다 (라벨이 쌓일수록 배지 노이즈가 줄어드는 구조).

### 비목표

- Resolve conversation 클릭 신호 (GraphQL 필요) — v2
- addressed 라벨 기반 배지 가중치/게이팅 — 라벨 축적 후
- `line: null` 이슈의 배지 노출 (review body 테이블 마커) — 감지·저장은 하되 배지는 인라인 코멘트만
- backfill 온보딩 (신규 사용자 과거 PR 소급 이력 구축)
- 대시보드 "성장 기록"/addressed rate UI
- Apply Fix 커밋 경로(웹훅 early return)에서의 이슈 해결 감지
- 팀/조직 단위 학습

### 성공 기준

- 과거 PR과 같은 실수가 있는 PR에서 인라인 코멘트에 반복 배지가 노출된다 (수동 확인).
- 리뷰 완료 후 `review_issue` 테이블에 이슈 수만큼 row + embedding이 생성된다.
- 이슈 라인을 고치는 커밋 푸시 → 해당 row가 `ADDRESSED_STRONG` 또는 `ADDRESSED_WEAK`로 전환된다.
- PR 머지 → 잔여 `PENDING` row가 `IGNORED`로 전환된다.
- `extractPatchOldSideTouchedLines` 유닛 테스트(§8)가 `npm run test`로 통과한다.
- `repeatSimilarity`가 저장되어 사후 threshold 재조정이 가능하다.

## 3. 대안 분석

### 결정 1: 이슈 임베딩 저장소

**Option A: Pinecone** (기존 코드 인덱싱 인프라 재사용)
- 장점: 벡터 검색 인프라 존재
- 단점: 후보 조회가 본질적으로 관계형(userId + category + 90일 + resolutionStatus + 같은 PR 제외)이라 metadata 필터가 복잡. 원격 의존성 추가. 코드 인덱스와 이슈 데이터의 수명주기가 다름.

**Option B: pgvector**
- 장점: SQL 한 방 쿼리
- 단점: Postgres 확장 설치 + Prisma `Unsupported` 타입 — 운영 복잡도 추가

**Option C: `embedding Json` 컬럼 + 앱 사이드 코사인 계산**
- 장점: 마이그레이션만으로 끝. 후보 집합이 작아(사용자당 90일 이슈 수백 건 이하) 768d 코사인을 JS로 돌려도 무시 가능한 비용. 캘리브레이션 스파이크도 같은 방식으로 검증됨.
- 단점: 후보가 수만 건 규모가 되면 재설계 필요 (1인 개발자 타겟에서는 도달하지 않는 규모)

**선택: Option C** — 근거: 쿼리의 지배 조건이 관계형 필터이고 벡터 연산은 잔여 후보에 대한 후처리에 불과. 규모가 문제되는 시점은 제품이 성공한 시점이므로 그때 재설계가 정당화된다.

### 결정 2: 수동 수정(addressed) 감지 방식

**Option A: GitHub 코멘트 ID 저장 + outdated/resolve 추적**
- 장점: GitHub이 라인 이동을 추적해줌
- 단점: `pulls.createReview` 응답에 개별 코멘트 ID가 없어 게시 후 `listCommentsForReview` + 매칭 로직 필요. 리뷰가 사용자 본인 토큰으로 게시되므로 봇 코멘트 식별도 body 패턴에 의존.

**Option B: `synchronize`에서 compare patch의 old-side 라인 교차 검사** (suggestion reconciliation과 같은 앵커 패턴)
- 장점: `reconcileNativeSuggestions`가 이미 쓰는 `headSha: beforeSha` 앵커와 `getCompareFiles`를 재사용. 코멘트 ID 불필요. 좌표 문제 없음(이슈 라인은 리뷰 시점 headSha 좌표 = 다음 sync의 beforeSha 좌표).
- 단점: 각 리뷰의 이슈는 바로 다음 sync에서만 평가됨. 이후 sync에서 고친 경우 그 리뷰의 row는 PENDING으로 남는다 (단, 매 sync마다 재리뷰가 돌므로 새 리뷰의 이슈 copy가 평가를 이어받는다 — §7 리스크 참조).

**선택: Option B + 시맨틱 판정** — 근거: 기존 reconciliation 패턴과 대칭이라 코드/개념 모두 저비용. "라인이 바뀜 ≠ 지적 때문에 고침"은 Gemini Flash 1회 판정으로 STRONG/WEAK 등급 분리.

## 4. 구현 계획

### 신규 코드

| 파일 | 역할 |
|------|------|
| `features/ai/lib/repeat-detection.ts` | `detectRepeatIssues` — 이슈 임베딩 + category-primary 반복 매칭 |
| `features/review/lib/reconcile-issue-resolutions.ts` | `reconcileIssueResolutions` — 라인 교차 + 시맨틱 판정으로 addressed 라벨링 (신규 디렉토리 `features/review/lib/`) |
| `lib/github/diff-parser.test.ts` | `extractPatchOldSideTouchedLines` 유닛 테스트 (§8) |

### 기존 코드 수정

**`prisma/schema.prisma`** — `ReviewIssue` 모델 + enum 추가, `Review`에 relation 추가

Before (Review 모델, 현재):

```prisma
model Review {
  id  String @id @default(cuid())
  repositoryId  String
  repository Repository @relation(fields: [repositoryId], references:[id], onDelete: Cascade)
  prNumber  Int
  prTitle   String
  prUrl     String
  review    String  @db.Text
  reviewData Json?     // 구조화 출력 JSON (웹 UI 렌더링용) — AI 출력 + schemaVersion만 저장
  langCode  String  @default("en")  // 리뷰 생성 시점의 언어 코드
  reviewType ReviewType @default(FULL_REVIEW)
  status    String  @default("completed") // completed, failed, pending
  headSha   String?
  suggestions Suggestion[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([repositoryId])
  @@map("review")
}
```

After (Review에 한 줄 추가 + 신규 모델/enum):

```prisma
model Review {
  id  String @id @default(cuid())
  repositoryId  String
  repository Repository @relation(fields: [repositoryId], references:[id], onDelete: Cascade)
  prNumber  Int
  prTitle   String
  prUrl     String
  review    String  @db.Text
  reviewData Json?     // 구조화 출력 JSON (웹 UI 렌더링용) — AI 출력 + schemaVersion만 저장
  langCode  String  @default("en")  // 리뷰 생성 시점의 언어 코드
  reviewType ReviewType @default(FULL_REVIEW)
  status    String  @default("completed") // completed, failed, pending
  headSha   String?
  suggestions Suggestion[]
  issues    ReviewIssue[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([repositoryId])
  @@map("review")
}

enum IssueResolutionStatus {
  PENDING           // 관찰 중 (PR 미종료)
  ADDRESSED_STRONG  // 라인 수정 + 시맨틱 판정 통과
  ADDRESSED_WEAK    // 라인 수정만 (판정 불통과/실패)
  IGNORED           // PR 머지까지 무변경
}

model ReviewIssue {
  id       String @id @default(cuid())
  reviewId String
  review   Review @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  userId   String // Review→Repository→userId 비정규화 — 90일 cross-repo 후보 조회용

  filePath   String?
  lineNumber Int?
  title      String
  body       String @db.Text
  severity   SuggestionSeverity
  category   String // source of truth: issueCategorySchema (features/ai/lib/review-schema.ts)

  embedding Json? // gemini-embedding-001 768d float[], taskType: SEMANTIC_SIMILARITY

  resolutionStatus IssueResolutionStatus @default(PENDING)
  resolvedAt       DateTime?
  resolvedBySha    String?

  isRepeat         Boolean      @default(false)
  repeatOfIssueId  String?
  repeatOf         ReviewIssue? @relation("IssueRepeatChain", fields: [repeatOfIssueId], references: [id], onDelete: SetNull)
  repeats          ReviewIssue[] @relation("IssueRepeatChain")
  repeatSimilarity Float?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([reviewId])
  @@index([userId, category, createdAt])
  @@map("review_issue")
}
```

- `severity`는 기존 `SuggestionSeverity` enum 재사용 (`review-schema.ts`의 severitySchema와 값 동일 — 동기화 지점 증가 없음).
- `category`는 String — Prisma enum을 추가하면 `review-schema.ts` 상단 MAINTENANCE NOTE의 동기화 지점이 늘어나므로 Zod를 source of truth로 유지.

**`features/ai/types/index.ts`** — EmbeddingTaskType 확장

Before:

```typescript
export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
```

After:

```typescript
export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";
```

(소비자는 `generateEmbedding`의 파라미터 타입뿐 — 유니온 확장은 기존 호출부에 영향 없음. 캘리브레이션이 SEMANTIC_SIMILARITY로 수행되었으므로 프로덕션도 동일 taskType 사용.)

**`features/ai/constants/index.ts`** — 반복 감지 상수 추가

After (기존 상수 뒤에 추가):

```typescript
export const REPEAT_SIMILARITY_THRESHOLD = 0.9; // Track A: 0.90에서 FP 5.1%. category-primary 2차 결과(0.88 PASS) 확인 후 하향 검토
export const REPEAT_WINDOW_DAYS = 90;
export const REPEAT_MIN_TEXT_LENGTH = 20; // 빈/짧은 텍스트 임베딩 방지 (sim=1.0 인공물)
```

**`shared/constants/index.ts`** — 배지 라벨 추가 (ISSUE_FIELD_LABELS 패턴 미러링)

After (기존 `ISSUE_FIELD_LABELS` 아래 추가):

```typescript
/** 반복 지적 배지 라벨. LanguageCode 추가 시 여기도 추가 필수. */
export const REPEAT_BADGE_LABELS = {
  en: { badge: "Repeat issue", context: "The same issue was raised in" },
  ko: { badge: "반복 지적", context: "같은 지적을 받았던 PR:" },
} as const satisfies Record<LanguageCode, { badge: string; context: string }>;
```

**`features/ai/lib/repeat-detection.ts`** — 신규

```typescript
import prisma from "@/lib/db";
import { generateEmbedding } from "./generate-embedding";
import {
  REPEAT_MIN_TEXT_LENGTH,
  REPEAT_SIMILARITY_THRESHOLD,
  REPEAT_WINDOW_DAYS,
} from "../constants";
import type { StructuredIssue } from "../types";

export interface RepeatBadgeInfo {
  prUrl: string;
  date: string; // YYYY-MM-DD
}

export interface RepeatAnnotation {
  embedding: number[] | null;
  isRepeat: boolean;
  repeatOfIssueId: string | null;
  repeatSimilarity: number | null;
  repeat: RepeatBadgeInfo | null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildIssueEmbeddingText(issue: StructuredIssue): string {
  return [issue.title, issue.body].filter(Boolean).join("\n").trim();
}

/**
 * 새 이슈들을 같은 사용자의 90일 이내 과거 이슈와 비교해 반복 여부를 판정한다.
 * 캘리브레이션 제약: category-primary 필터(같은 카테고리만 비교) + 짧은 텍스트 제외.
 * 후보에서 IGNORED(사용자가 무시한 지적)와 같은 PR의 이슈는 제외한다.
 */
export async function detectRepeatIssues(params: {
  issues: StructuredIssue[];
  userId: string;
  repositoryId: string;
  prNumber: number;
}): Promise<RepeatAnnotation[]> {
  const { issues, userId, repositoryId, prNumber } = params;

  if (issues.length === 0) return [];

  const windowStart = new Date(Date.now() - REPEAT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.reviewIssue.findMany({
    where: {
      userId,
      createdAt: { gte: windowStart },
      resolutionStatus: { not: "IGNORED" },
      NOT: { review: { repositoryId, prNumber } }, // 같은 PR 재리뷰 이슈로 자기 자신에 배지 방지
    },
    select: {
      id: true,
      category: true,
      embedding: true,
      createdAt: true,
      review: { select: { prUrl: true } },
    },
  });

  const annotations: RepeatAnnotation[] = [];

  for (const issue of issues) {
    const text = buildIssueEmbeddingText(issue);

    if (text.length < REPEAT_MIN_TEXT_LENGTH) {
      annotations.push({
        embedding: null, isRepeat: false, repeatOfIssueId: null,
        repeatSimilarity: null, repeat: null,
      });
      continue;
    }

    const embedding = await generateEmbedding(text, "SEMANTIC_SIMILARITY");

    let best: { id: string; similarity: number; prUrl: string; createdAt: Date } | null = null;
    for (const candidate of candidates) {
      if (candidate.category !== issue.category) continue; // category-primary
      if (!Array.isArray(candidate.embedding)) continue;

      const similarity = cosineSimilarity(embedding, candidate.embedding as number[]);
      if (similarity >= REPEAT_SIMILARITY_THRESHOLD && (!best || similarity > best.similarity)) {
        best = {
          id: candidate.id,
          similarity,
          prUrl: candidate.review.prUrl,
          createdAt: candidate.createdAt,
        };
      }
    }

    annotations.push({
      embedding,
      isRepeat: best !== null,
      repeatOfIssueId: best?.id ?? null,
      repeatSimilarity: best?.similarity ?? null,
      repeat: best
        ? { prUrl: best.prUrl, date: new Date(best.createdAt).toISOString().slice(0, 10) }
        : null,
    });
  }

  return annotations;
}
```

**`features/ai/lib/index.ts` / `features/ai/index.ts`** — barrel export 추가

```typescript
// features/ai/lib/index.ts 에 추가
export { detectRepeatIssues } from "./repeat-detection";
export type { RepeatAnnotation, RepeatBadgeInfo } from "./repeat-detection";

// features/ai/index.ts Library Functions 줄에 detectRepeatIssues 추가, Types에 RepeatAnnotation/RepeatBadgeInfo 추가
```

**`lib/github/diff-parser.ts`** — old-side 라인 추출 함수 추가 (기존 함수는 무변경)

After (파일 끝에 추가):

```typescript
/**
 * compare API per-file patch에서 old side(변경 전 파일 좌표) 기준으로
 * 삭제/수정된 라인 번호 집합을 추출한다.
 * 순수 추가(+만 있는) patch는 빈 Set을 반환한다 — 삽입은 기존 라인을 건드리지 않으므로.
 */
export function extractPatchOldSideTouchedLines(patch: string): Set<number> {
  const touched = new Set<number>();
  let oldLine = 0;

  for (const line of patch.split("\n")) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1]);
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      touched.add(oldLine);
      oldLine++;
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      // new side 전용 — old 좌표 증가 없음
    } else if (line !== "" && !line.startsWith("\\")) {
      // context 라인 (blank context는 " "이므로 여기 포함).
      // "" (split의 trailing-newline 아티팩트)와 "\ No newline..."은 카운트 제외 — old 좌표 오증가 방지.
      oldLine++;
    }
  }

  return touched;
}
```

**`features/review/lib/reconcile-issue-resolutions.ts`** — 신규

```typescript
import prisma from "@/lib/db";
import { getCompareFiles } from "@/lib/github/github";
import { extractPatchOldSideTouchedLines } from "@/lib/github/diff-parser";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

type ReconcileIssueParams = {
  token: string;
  headOwner: string;
  headRepoName: string;
  baseRepositoryId: string;
  prNumber: number;
  beforeSha: string;
  afterSha: string;
};

export type ReconcileIssueResult =
  | { strong: number; weak: number }
  | { skipped: true; reason: "no_matching_review" | "no_pending_inline_issues" | "compare_api_failed" };

const judgeSchema = z.object({
  verdicts: z.array(
    z.object({
      issueIndex: z.number(),
      addressed: z.boolean(),
    }),
  ),
});

/**
 * synchronize 시 push된 커밋이 리뷰 이슈가 가리킨 라인을 수정했는지 검사하고,
 * 시맨틱 판정으로 "지적을 실제로 해결했는가"를 구분해 라벨을 붙인다.
 * 앵커는 reconcileNativeSuggestions와 동일: headSha === beforeSha 인 리뷰.
 */
export async function reconcileIssueResolutions(
  params: ReconcileIssueParams,
): Promise<ReconcileIssueResult> {
  const { token, headOwner, headRepoName, baseRepositoryId, prNumber, beforeSha, afterSha } = params;

  const review = await prisma.review.findFirst({
    where: { repositoryId: baseRepositoryId, prNumber, headSha: beforeSha },
    orderBy: { createdAt: "desc" },
  });
  if (!review) return { skipped: true, reason: "no_matching_review" };

  const pendingIssues = await prisma.reviewIssue.findMany({
    where: {
      reviewId: review.id,
      resolutionStatus: "PENDING",
      filePath: { not: null },
      lineNumber: { not: null },
    },
    select: { id: true, filePath: true, lineNumber: true, title: true, body: true },
  });
  if (pendingIssues.length === 0) return { skipped: true, reason: "no_pending_inline_issues" };

  let compareFiles: Awaited<ReturnType<typeof getCompareFiles>>;
  try {
    compareFiles = await getCompareFiles({
      token, owner: headOwner, repo: headRepoName, base: beforeSha, head: afterSha,
    });
  } catch (error) {
    console.error(
      `reconcileIssueResolutions: compare_api_failed ${headOwner}/${headRepoName} ${beforeSha}..${afterSha}`,
      error,
    );
    return { skipped: true, reason: "compare_api_failed" };
  }

  const touchedByFile = new Map<string, Set<number>>();
  for (const file of compareFiles) {
    if (!file.patch) continue; // 대용량 파일 등 patch 미제공 → 판정 불가, PENDING 유지
    touchedByFile.set(file.path, extractPatchOldSideTouchedLines(file.patch));
  }

  const candidates = pendingIssues.filter((issue) => {
    const touched = touchedByFile.get(issue.filePath as string);
    return touched?.has(issue.lineNumber as number) ?? false;
  });
  if (candidates.length === 0) return { strong: 0, weak: 0 };

  // 시맨틱 판정 — "라인이 바뀜"과 "지적이 해결됨"을 구분 (리팩토링 휩쓸림 → WEAK)
  let strongIds: string[] = [];
  let weakIds: string[] = [];
  try {
    const candidateBlocks = candidates
      .map((issue, index) => {
        const patch = compareFiles.find((f) => f.path === issue.filePath)?.patch ?? "";
        return `[${index}] ${issue.filePath}:${issue.lineNumber}\nIssue: ${issue.title}\n${issue.body}\nPatch:\n${patch}`;
      })
      .join("\n\n---\n\n");

    const { experimental_output } = await generateText({
      model: google("gemini-2.5-flash"),
      experimental_output: Output.object({ schema: judgeSchema }),
      prompt:
        "For each review issue below, decide whether the code change in the patch actually resolves that issue " +
        "(not merely touches the same lines). Return a verdict for every index.\n\n" +
        candidateBlocks,
    });

    const verdictMap = new Map(
      (experimental_output?.verdicts ?? []).map((v) => [v.issueIndex, v.addressed]),
    );
    candidates.forEach((issue, index) => {
      if (verdictMap.get(index) === true) strongIds.push(issue.id);
      else weakIds.push(issue.id);
    });
  } catch (error) {
    console.warn("reconcileIssueResolutions: judge failed, downgrading all to WEAK", error);
    strongIds = [];
    weakIds = candidates.map((c) => c.id);
  }

  const resolvedAt = new Date();
  if (strongIds.length > 0) {
    await prisma.reviewIssue.updateMany({
      where: { id: { in: strongIds } },
      data: { resolutionStatus: "ADDRESSED_STRONG", resolvedAt, resolvedBySha: afterSha },
    });
  }
  if (weakIds.length > 0) {
    await prisma.reviewIssue.updateMany({
      where: { id: { in: weakIds } },
      data: { resolutionStatus: "ADDRESSED_WEAK", resolvedAt, resolvedBySha: afterSha },
    });
  }

  return { strong: strongIds.length, weak: weakIds.length };
}
```

**`inngest/functions/review.ts`** — Step 5.5 추가 + Step 6/7 수정

import 변경 (변경 줄만):

```typescript
import {
  retrieveContext, classifyPRSize, getTopKForSizeMode,
  structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt,
  getIssueLimit, formatStructuredReviewToMarkdown, REVIEW_SCHEMA_VERSION, guardTextFeedback,
  detectRepeatIssues,
} from "@/features/ai";
```

Before (Step 6 · Step 7, 현재 코드):

```typescript
    // ── Step 6: GitHub에 리뷰 게시 ──
    // IMPORTANT: postedAsReview는 반드시 step.run()의 반환값으로 캡처해야 한다.
    const postedAsReview = await step.run("post-review", async () => {
      const suggestions = validatedStructuredOutput?.suggestions ?? [];
      const issues = validatedStructuredOutput?.issues ?? [];
      const inlineIssues = issues.filter(i => i.file !== null && i.line !== null);
      const hasInlineContent = suggestions.length > 0 || inlineIssues.length > 0;

      if (hasInlineContent) {
        try {
          await postPRReviewWithSuggestions({
            token, owner, repo, prNumber, reviewBody: review, suggestions, issues, headSha, langCode,
          });
          return true;
        } catch (error) {
          console.warn("PR Review API failed, falling back to comment:", error);
          await postReviewComment(token, owner, repo, prNumber, review);
          return false;
        }
      } else {
        await postReviewComment(token, owner, repo, prNumber, review);
        return false;
      }
    });

    // ── Step 7: DB에 리뷰 저장 ──
    await step.run("save-review", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      await prisma.$transaction(async (tx) => {
        const createdReview = await tx.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: title,
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review,
            reviewData: validatedStructuredOutput
              ? (() => {
                  // shape guard: 배포 경쟁 상태에서 구 shape(description-only)이
                  // memoize되어 resume될 때 schemaVersion이 실제 shape과 불일치하는 것을 방지.
                  // issues가 빈 배열이면 .every()는 true → 정상적으로 v2 저장.
                  const hasNewIssueShape = (validatedStructuredOutput.issues ?? []).every(
                    (i) => typeof (i as { title?: unknown }).title === "string",
                  );
                  const storedSchemaVersion = hasNewIssueShape ? REVIEW_SCHEMA_VERSION : 1;
                  return { ...validatedStructuredOutput, schemaVersion: storedSchemaVersion };
                })()
              : Prisma.DbNull,
            langCode,
            reviewType: "FULL_REVIEW",
            status: "completed",
            headSha,
          },
        });

        if (validatedStructuredOutput?.suggestions?.length) {
          await tx.suggestion.createMany({
            data: validatedStructuredOutput.suggestions.map((s) => ({
              reviewId: createdReview.id,
              filePath: s.file,
              lineNumber: s.line,
              beforeCode: s.before,
              afterCode: s.after,
              explanation: s.explanation,
              severity: s.severity,
              status: "PENDING",
            })),
          });
        }
      });

      // postedAsReview 참조로 Inngest replay 경고 방지
      void postedAsReview;
    });

    return { success: true };
```

After (Step 5.5 신설 + Step 6/7 수정 — Step 1~5는 무변경):

```typescript
    // ── Step 5.5: 반복 실수 감지 (wedge) ──
    // 실패해도 리뷰 흐름을 막지 않는다 — 배지 없는 리뷰로 진행.
    const repeatAnnotations = await step.run("detect-repeat-issues", async () => {
      const issues = validatedStructuredOutput?.issues ?? [];
      if (issues.length === 0) return [];

      const repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
      });
      if (!repository) return [];

      try {
        return await detectRepeatIssues({
          issues,
          userId,
          repositoryId: repository.id,
          prNumber,
        });
      } catch (error) {
        console.warn("Repeat detection failed, continuing without badges:", error);
        return [];
      }
    });

    // ── Step 6: GitHub에 리뷰 게시 ──
    // IMPORTANT: postedAsReview는 반드시 step.run()의 반환값으로 캡처해야 한다.
    const postedAsReview = await step.run("post-review", async () => {
      const suggestions = validatedStructuredOutput?.suggestions ?? [];
      const issues = validatedStructuredOutput?.issues ?? [];
      const issuesWithRepeat = issues.map((issue, index) => {
        const annotation = repeatAnnotations[index];
        return annotation?.repeat ? { ...issue, repeat: annotation.repeat } : issue;
      });
      const inlineIssues = issuesWithRepeat.filter(i => i.file !== null && i.line !== null);
      const hasInlineContent = suggestions.length > 0 || inlineIssues.length > 0;

      if (hasInlineContent) {
        try {
          await postPRReviewWithSuggestions({
            token, owner, repo, prNumber, reviewBody: review,
            suggestions, issues: issuesWithRepeat, headSha, langCode,
          });
          return true;
        } catch (error) {
          console.warn("PR Review API failed, falling back to comment:", error);
          await postReviewComment(token, owner, repo, prNumber, review);
          return false;
        }
      } else {
        await postReviewComment(token, owner, repo, prNumber, review);
        return false;
      }
    });

    // ── Step 7: DB에 리뷰 저장 ──
    await step.run("save-review", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      await prisma.$transaction(async (tx) => {
        const createdReview = await tx.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: title,
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review,
            reviewData: validatedStructuredOutput
              ? (() => {
                  // shape guard: 배포 경쟁 상태에서 구 shape(description-only)이
                  // memoize되어 resume될 때 schemaVersion이 실제 shape과 불일치하는 것을 방지.
                  // issues가 빈 배열이면 .every()는 true → 정상적으로 v2 저장.
                  const hasNewIssueShape = (validatedStructuredOutput.issues ?? []).every(
                    (i) => typeof (i as { title?: unknown }).title === "string",
                  );
                  const storedSchemaVersion = hasNewIssueShape ? REVIEW_SCHEMA_VERSION : 1;
                  return { ...validatedStructuredOutput, schemaVersion: storedSchemaVersion };
                })()
              : Prisma.DbNull,
            langCode,
            reviewType: "FULL_REVIEW",
            status: "completed",
            headSha,
          },
        });

        if (validatedStructuredOutput?.suggestions?.length) {
          await tx.suggestion.createMany({
            data: validatedStructuredOutput.suggestions.map((s) => ({
              reviewId: createdReview.id,
              filePath: s.file,
              lineNumber: s.line,
              beforeCode: s.before,
              afterCode: s.after,
              explanation: s.explanation,
              severity: s.severity,
              status: "PENDING",
            })),
          });
        }

        if (validatedStructuredOutput?.issues?.length) {
          await tx.reviewIssue.createMany({
            data: validatedStructuredOutput.issues.map((issue, index) => {
              const annotation = repeatAnnotations[index];
              return {
                reviewId: createdReview.id,
                userId,
                filePath: issue.file,
                lineNumber: issue.line,
                title: issue.title,
                body: issue.body,
                severity: issue.severity,
                category: issue.category,
                embedding: annotation?.embedding ?? Prisma.DbNull,
                isRepeat: annotation?.isRepeat ?? false,
                repeatOfIssueId: annotation?.repeatOfIssueId ?? null,
                repeatSimilarity: annotation?.repeatSimilarity ?? null,
              };
            }),
          });
        }
      });

      // postedAsReview 참조로 Inngest replay 경고 방지
      void postedAsReview;
    });

    return { success: true };
```

행동 불변식: 반복 감지/영속화가 실패하거나 이슈가 0건이어도 Step 6의 게시 동작(리뷰 본문·suggestion·이슈 코멘트)은 Before와 동일해야 한다 — `repeatAnnotations`가 빈 배열이면 `issuesWithRepeat`은 원본 `issues`와 요소 단위로 동일하다.

**`features/review/lib/pr-review.ts`** — 배지 렌더링 (변경 단위 전체)

import 변경 (변경 줄만):

```typescript
import type { CodeSuggestion, StructuredIssue, RepeatBadgeInfo } from "@/features/ai";
import { ISSUE_FIELD_LABELS, REPEAT_BADGE_LABELS } from "@/shared/constants";
```

Before (인터페이스 + 이슈 코멘트 매핑 + formatIssueComment, 현재 코드):

```typescript
interface PostPRReviewParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  reviewBody: string;
  suggestions: CodeSuggestion[];
  issues: StructuredIssue[];
  headSha: string;
  langCode: LanguageCode;
}
```

```typescript
  // issue comments (file+line 둘 다 있는 issues만 inline comment로)
  // file-level issues (line: null)는 review body 테이블에 포함됨
  // ⚠️ type predicate 사용 — plain .filter()는 TypeScript narrowing 불가
  const inlineIssues = issues.filter(
    (i): i is StructuredIssue & { file: string; line: number } =>
      i.file !== null && i.line !== null
  );
  const issueComments: ReviewComment[] = inlineIssues.map((i) => ({
    path: i.file,
    line: i.line,
    body: formatIssueComment(i, labels),
  }));
```

```typescript
function formatIssueComment(
  issue: StructuredIssue,
  labels: { impact: string; recommendation: string },
): string {
  const sev = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
  const cat = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;

  // 방어적 기본값 — in-flight resume + 빈 값 대응
  const title = (issue.title ?? "").trim();
  const rawBody = (issue.body ?? (issue as { description?: string }).description ?? "").trim();
  const impact = (issue.impact ?? "").trim();
  const recommendation = (issue.recommendation ?? "").trim();

  // 문장 경계 검사 + body 빈값 skip guard
  const titleSuffix = title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
  const body =
    titleSuffix !== null && (titleSuffix === "" || /^[.,:;—\-]/.test(titleSuffix))
      ? titleSuffix.replace(/^[\s.,:;—\-]+/, "")
      : rawBody;

  const lines: string[] = [
    `### ${sev} · ${cat}${title ? ` — ${title}` : ""}`,
  ];
  if (body) lines.push("", body);
  if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
  if (recommendation) lines.push("", `**${labels.recommendation}:** ${recommendation}`);
  return lines.join("\n");
  // SYNC:formatIssueBody — review-formatter.ts · structured-review-body.tsx 와 동일 로직 유지
}
```

After:

```typescript
type RepeatAnnotatedIssue = StructuredIssue & { repeat?: RepeatBadgeInfo | null };

interface PostPRReviewParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  reviewBody: string;
  suggestions: CodeSuggestion[];
  issues: RepeatAnnotatedIssue[];
  headSha: string;
  langCode: LanguageCode;
}
```

```typescript
  // issue comments (file+line 둘 다 있는 issues만 inline comment로)
  // file-level issues (line: null)는 review body 테이블에 포함됨
  // ⚠️ type predicate 사용 — plain .filter()는 TypeScript narrowing 불가
  const inlineIssues = issues.filter(
    (i): i is RepeatAnnotatedIssue & { file: string; line: number } =>
      i.file !== null && i.line !== null
  );
  const issueComments: ReviewComment[] = inlineIssues.map((i) => ({
    path: i.file,
    line: i.line,
    body: formatIssueComment(i, labels, REPEAT_BADGE_LABELS[langCode]),
  }));
```

```typescript
function formatIssueComment(
  issue: RepeatAnnotatedIssue,
  labels: { impact: string; recommendation: string },
  repeatLabels: { badge: string; context: string },
): string {
  const sev = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
  const cat = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;

  // 방어적 기본값 — in-flight resume + 빈 값 대응
  const title = (issue.title ?? "").trim();
  const rawBody = (issue.body ?? (issue as { description?: string }).description ?? "").trim();
  const impact = (issue.impact ?? "").trim();
  const recommendation = (issue.recommendation ?? "").trim();

  // 문장 경계 검사 + body 빈값 skip guard
  const titleSuffix = title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
  const body =
    titleSuffix !== null && (titleSuffix === "" || /^[.,:;—\-]/.test(titleSuffix))
      ? titleSuffix.replace(/^[\s.,:;—\-]+/, "")
      : rawBody;

  const lines: string[] = [
    `### ${sev} · ${cat}${title ? ` — ${title}` : ""}`,
  ];
  if (issue.repeat) {
    lines.push("", `> ⚠️ **${repeatLabels.badge}** — ${repeatLabels.context} ${issue.repeat.prUrl} (${issue.repeat.date})`);
  }
  if (body) lines.push("", body);
  if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
  if (recommendation) lines.push("", `**${labels.recommendation}:** ${recommendation}`);
  return lines.join("\n");
  // SYNC:formatIssueBody — review-formatter.ts · structured-review-body.tsx 와 동일 로직 유지
}
```

행동 불변식: `issue.repeat`이 없는 이슈의 코멘트 출력은 Before와 바이트 단위로 동일해야 한다.

**`app/api/webhooks/github/route.ts`** — synchronize에 이슈 reconcile 추가 + `closed` 액션 처리

import 변경 (변경 줄만):

```typescript
import { reconcileNativeSuggestions } from "@/features/suggestion/lib/reconcile-native-suggestions";
import { reconcileIssueResolutions } from "@/features/review/lib/reconcile-issue-resolutions";
```

Before (`pull_request` 분기 중 synchronize 내부의 reconcile 블록 + 분기 마지막, 현재 코드):

```typescript
                if (account?.accessToken) {
                  const reconcileResult = await reconcileNativeSuggestions({
                    token: account.accessToken,
                    headOwner,
                    headRepoName,
                    baseRepositoryId: baseRepository.id,
                    prNumber,
                    beforeSha,
                    afterSha,
                  });

                  if (reconcileResult.matchedSuggestionIds.length > 0) {
                    await prisma.suggestion.updateMany({
                      where: {
                        id: { in: reconcileResult.matchedSuggestionIds },
                        status: "PENDING",
                      },
                      data: {
                        status: "APPLIED",
                        appliedAt: new Date(),
                        appliedCommitSha: afterSha,
                        appliedSource: "GITHUB_NATIVE",
                      },
                    });
                  }

                  if (reconcileResult.skipReview) {
                    console.info(
                      `Skipping review for ${repoInfo.fullName} #${prNumber}: native suggestion commit`,
                    );
                    return NextResponse.json(
                      { message: "Skipped: native suggestion commit" },
                      { status: 200 },
                    );
                  }
                }
```

After (issue reconcile 삽입 — skipReview 조기 반환보다 앞에 두어 native suggestion 커밋에서도 이슈 라벨링이 수행되게 함):

```typescript
                if (account?.accessToken) {
                  const reconcileResult = await reconcileNativeSuggestions({
                    token: account.accessToken,
                    headOwner,
                    headRepoName,
                    baseRepositoryId: baseRepository.id,
                    prNumber,
                    beforeSha,
                    afterSha,
                  });

                  if (reconcileResult.matchedSuggestionIds.length > 0) {
                    await prisma.suggestion.updateMany({
                      where: {
                        id: { in: reconcileResult.matchedSuggestionIds },
                        status: "PENDING",
                      },
                      data: {
                        status: "APPLIED",
                        appliedAt: new Date(),
                        appliedCommitSha: afterSha,
                        appliedSource: "GITHUB_NATIVE",
                      },
                    });
                  }

                  // addressed 추적: 실패해도 리뷰 흐름을 막지 않는다
                  try {
                    await reconcileIssueResolutions({
                      token: account.accessToken,
                      headOwner,
                      headRepoName,
                      baseRepositoryId: baseRepository.id,
                      prNumber,
                      beforeSha,
                      afterSha,
                    });
                  } catch (error) {
                    console.warn(
                      `reconcileIssueResolutions failed for ${repoInfo.fullName} #${prNumber}:`,
                      error,
                    );
                  }

                  if (reconcileResult.skipReview) {
                    console.info(
                      `Skipping review for ${repoInfo.fullName} #${prNumber}: native suggestion commit`,
                    );
                    return NextResponse.json(
                      { message: "Skipped: native suggestion commit" },
                      { status: 200 },
                    );
                  }
                }
```

Before (`pull_request` 분기의 opened/synchronize 블록 종료 직후, 현재 코드):

```typescript
        console.log(`Review queued for ${repoInfo.fullName} #${prNumber}`);
      }

      return NextResponse.json({ message: "Event Processed" }, { status: 200 });
    }
```

After (`closed` 분기 추가 — 머지된 PR만 잔여 PENDING을 IGNORED로 확정):

```typescript
        console.log(`Review queued for ${repoInfo.fullName} #${prNumber}`);
      }

      if (action === "closed") {
        const pullRequest = body["pull_request"];
        const merged = isRecord(pullRequest) && pullRequest["merged"] === true;

        if (merged) {
          const baseRepository = await prisma.repository.findFirst({
            where: { owner: repoInfo.owner, name: repoInfo.repoName },
          });

          if (baseRepository) {
            // 코드베이스 표준 패턴: review id 목록 조회 → reviewId in 으로 updateMany
            // (기존 suggestion.updateMany({ where: { id: { in } } })와 정렬, updateMany 관계필터 의존 제거)
            const reviews = await prisma.review.findMany({
              where: { repositoryId: baseRepository.id, prNumber },
              select: { id: true },
            });

            if (reviews.length > 0) {
              const { count } = await prisma.reviewIssue.updateMany({
                where: {
                  reviewId: { in: reviews.map((r) => r.id) },
                  resolutionStatus: "PENDING",
                },
                data: { resolutionStatus: "IGNORED", resolvedAt: new Date() },
              });
              console.info(
                `Finalized ${count} pending issues as IGNORED for ${repoInfo.fullName} #${prNumber}`,
              );
            }
          }
        }
      }

      return NextResponse.json({ message: "Event Processed" }, { status: 200 });
    }
```

행동 불변식: `opened`/`synchronize` 처리(리뷰 큐잉, suggestion reconcile, skip 조기 반환)는 Before와 동일해야 하며, 새 try/catch는 이슈 reconcile 실패를 리뷰 흐름에 전파하지 않아야 한다.

## 5. 실행 순서

### Phase 1: 스키마 + 상수/타입

- 작업: `prisma/schema.prisma`에 `ReviewIssue`/`IssueResolutionStatus` 추가 → `npx prisma migrate dev --name add_review_issue` → `npx prisma generate`. `EmbeddingTaskType` 확장, 상수/라벨 추가.
- 검증: 마이그레이션 적용 + `npm run build` 통과 (기존 동작 무변경).

### Phase 2: 이슈 영속화 + 반복 감지 (배지 없이)

- 작업: `repeat-detection.ts` 신규 + barrel export, `review.ts` Step 5.5/Step 7 수정 (Step 6은 아직 무변경).
- 검증: 테스트 repo에 PR 생성 → `review_issue` rows + embedding 저장 확인. 같은 실수를 가진 두 번째 PR → `isRepeat: true` + `repeatSimilarity` 기록 확인 (Prisma Studio).

### Phase 3: 반복 배지 렌더링

- 작업: `pr-review.ts` 배지 렌더링, `review.ts` Step 6 `issuesWithRepeat` 전달.
- 검증: Phase 2의 반복 케이스 재현 → GitHub 인라인 코멘트에 배지(과거 PR URL + 날짜) 노출 확인. 반복 아닌 이슈 코멘트는 기존과 동일한지 육안 비교.

### Phase 4: addressed 추적 (synchronize)

- 작업: `extractPatchOldSideTouchedLines` + 유닛 테스트, `reconcile-issue-resolutions.ts` 신규, 웹훅 synchronize 삽입.
- 검증: `npm run test` 통과. 이슈 라인을 고치는 커밋 푸시 → `ADDRESSED_STRONG` 전환 확인. 무관한 라인만 고치는 커밋 → `PENDING` 유지 확인.

### Phase 5: 머지 확정 (closed)

- 작업: 웹훅 `closed` 분기 추가.
- 검증: 이슈를 안 고친 채 PR 머지 → 해당 PR의 `PENDING` rows가 `IGNORED`로 전환. 이후 같은 실수 PR에서 그 이슈가 반복 후보에서 제외되는지 확인.

## 6. 영향 범위

- **직접 수정**: `prisma/schema.prisma`, `inngest/functions/review.ts`, `features/review/lib/pr-review.ts`, `lib/github/diff-parser.ts`, `app/api/webhooks/github/route.ts`, `features/ai/types/index.ts`, `features/ai/constants/index.ts`, `features/ai/lib/index.ts`, `features/ai/index.ts`, `shared/constants/index.ts`
- **신규**: `features/ai/lib/repeat-detection.ts`, `features/review/lib/reconcile-issue-resolutions.ts`(새 디렉토리), `lib/github/diff-parser.test.ts`
- **외부 의존성**: Gemini 임베딩 호출 +이슈당 1회(리뷰당 최대 `getIssueLimit` 개수), Gemini Flash 판정 +sync당 최대 1회, GitHub compare API +sync당 1회 (suggestion reconcile과 별도 호출 — v1은 중복 fetch 수용)
- **소비자/사용처 영향**: `postPRReviewWithSuggestions`의 유일한 호출처는 `inngest/functions/review.ts:311`(역검색으로 확인) — 파라미터 타입 확장은 해당 호출부와 함께 수정됨. `EmbeddingTaskType` 소비자는 `generateEmbedding` 파라미터뿐 — 유니온 확장은 additive. 동적 참조(문자열 라우트 등)는 별도 열거하지 않음.

## 7. 리스크 + 롤백 전략

### 리스크

- **배지 오탐**: v1은 addressed 라벨이 없어 "원본 오탐의 반복"을 차단하지 못한다. 완화: threshold 0.90 보수 시작 + `repeatSimilarity` 저장으로 사후 튜닝 + IGNORED 제외가 시간이 갈수록 작동.
- **"반복 조언 ≠ 반복 실수"** (캘리브레이션에서 확인): 좋은 조언의 반복("주석 추가")이 배지를 받으면 노이즈. severity 단독 필터는 위험(진짜 반복 중 INFO 존재). → Open Questions.
- **같은 PR 재리뷰의 통계 이중집계**: 매 synchronize마다 재리뷰가 돌아 같은 논리적 이슈가 리뷰별 row로 중복 생성된다. 반복 배지는 같은 PR 제외로 안전하지만, addressed 통계에서는 한 이슈가 ADDRESSED(새 리뷰 copy) + IGNORED(옛 리뷰 copy)로 이중 집계될 수 있다. v1 수용, 대시보드 구현 시 PR 단위 dedup 필요.
- **Inngest step 직렬화 크기**: Step 5.5 반환값에 이슈당 768 float 포함. 이슈 수는 `getIssueLimit`으로 상한이 있어 실질 문제 없음.
- **판정 실패 시 등급 하향**: judge 호출 실패는 전원 WEAK 처리 — addressed rate가 보수적으로 집계되는 방향이라 안전.
- **웹훅 인라인 LLM 판정 지연**: `reconcileIssueResolutions`가 웹훅 요청 핸들러 내에서 동기적으로 compare API + Gemini Flash 판정을 수행한다. 기존 핸들러도 `reconcileNativeSuggestions`(파일별 content fetch)를 동기 수행하므로 큰 PR에서 GitHub 웹훅 타임아웃(10초)에 근접할 수 있고, 타임아웃 시 GitHub 재전송 → `reviewPullRequest` 재실행으로 중복 리뷰가 발생할 수 있다(단, 이 재실행 리스크는 기존 코드에도 존재 — 본 변경이 새로 만드는 것이 아니라 확률을 높임). 완화: judge 대상은 "라인이 교차한 이슈"로만 한정되어 대개 0~소수. 근본 완화(Inngest 함수로 이관)는 Open Questions. try/catch로 실패가 리뷰 흐름을 막지는 않음.

### 롤백 전략

- 기능 전체가 additive. 코드 revert만으로 이전 동작 복원 (스키마는 남아도 무해 — 어떤 기존 경로도 `review_issue`를 읽지 않음).
- 배지만 끄기: `REPEAT_SIMILARITY_THRESHOLD`를 1보다 크게 올려 배포 (수집·영속화는 유지).
- 마이그레이션 롤백이 필요하면 `review_issue` 테이블/enum drop 마이그레이션 추가 (기존 테이블 무변경이므로 데이터 손실 위험 없음).

## 8. 검증 전략

- **기존 테스트**: 프로젝트에 기존 테스트 파일 없음 (vitest.config.ts만 존재, `**/*.test.ts` include · node 환경 · `@` alias 확인).
- **추가 테스트** (`lib/github/diff-parser.test.ts` — vitest 설정 미러링):

```typescript
import { describe, expect, it } from "vitest";
import { extractPatchOldSideTouchedLines } from "./diff-parser";

describe("extractPatchOldSideTouchedLines", () => {
  it("returns an empty set for an addition-only patch", () => {
    const patch = [
      "@@ -10,2 +10,3 @@",
      " const a = 1;",
      "+const inserted = 2;",
      " const b = 3;",
    ].join("\n");
    // no-computation: '-' 라인이 없으면 touched는 계약상 빈 집합이다
    expect(extractPatchOldSideTouchedLines(patch).size).toBe(0);
  });

  it("keeps every touched line within the hunk's old-side range", () => {
    const patch = [
      "@@ -5,4 +5,4 @@",
      " ctx();",
      "-removed();",
      "+added();",
      " ctx2();",
      " ctx3();",
    ].join("\n");
    const touched = extractPatchOldSideTouchedLines(patch);
    expect(touched.size).toBeGreaterThan(0);
    for (const line of touched) {
      expect(line).toBeGreaterThanOrEqual(5); // hunk old start (@@ -5,4)
      expect(line).toBeLessThan(5 + 4); // old start + old count 범위 불변식
    }
  });
});
```

- **타입/빌드 검증**: `npm run build` (next.config.ts가 비어 있어 `ignoreBuildErrors` 미설정 — 타입 에러 시 빌드 실패), `npm run lint`.
- **수동 확인**: ngrok + `npm run inngest-dev` 환경에서 §5 각 Phase의 시나리오 실행 (반복 배지 노출, ADDRESSED 전환, IGNORED 확정).

---

<!-- doc-validation-skip -->
## Open Questions

- **[구현 계획]** 시작 threshold 0.90(보수) vs 0.88(2차 캘리브레이션 category-primary PASS 하한)? — 경계쌍 founder confirm 후 하향 권장
- **[구현 계획]** INFO severity 이슈도 배지 대상 포함? ("반복 조언 ≠ 반복 실수" 노이즈 vs 진짜 INFO 반복 존재)
- **[구현 계획]** 임베딩에 코드 스니펫 포함 여부 — 2차 캘리브레이션 설계안이나 `StructuredIssue`에 코드 필드 없음. v1은 text-only(검증-PASS 구성)로 진행. file:line 코드 인출 enhancement를 v2에 검토할지?
- **[구현 계획]** `reconcileIssueResolutions`를 웹훅 인라인 대신 Inngest 함수로 이관? — 큰 PR 웹훅 타임아웃 리스크 근본 완화 vs 신규 이벤트/함수 추가 비용
- **[목표 상태]** backfill 온보딩(가입 시 과거 PR 소급 이력) v2 확정 여부
- **[리스크]** 같은 PR 재리뷰 중복 row의 addressed 통계 이중집계 — v1 수용? 대시보드 시점에 dedup?

<!-- doc-validation-restore -->
