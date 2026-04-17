# Implementation Plan: Growth Archive + Repeat Mistake Detection

> Companion document to [growth-archive-repeat-mistake-detection-feature.md](./growth-archive-repeat-mistake-detection-feature.md).
>
> Spec 의 design intent (문제 정의, target user, narrowest wedge, The Assignment 등) 는 원본 spec 에 있고, 이 파일은 **2026-04-17 grilled session 에서 lock 한 11개 구현 결정** 과 그에 따르는 schema/pipeline/config 세부를 담는다.

Generated: 2026-04-17
Branch: develop
Status: DECISIONS LOCKED

---

## Decision Summary

| # | Topic | Decision | Spec 원안 대비 |
|---|-------|----------|----------------|
| Q0 | Category enum 처리 | **Dual field**: `category` 유지 + `mistakeType` 신규 추가 | 원안은 category 를 mistakeType 으로 교체. 교체 대신 둘 다 유지. |
| Q1 | Embedding template | `title + body + Fix: recommendation` | 원안은 `[category][issue][code:500]`. Code 제외, recommendation 추가. |
| Q2 | Pipeline 위치 | Inngest **Step 5.5 sync** + 3s timeout + best-effort | 원안 미정. Step 5.5 (validate 와 publish 사이) 에 삽입. |
| Q3 | Matching chain 의미 | `matchedIssueId` = root + 신규 `repeatCount` 필드 | 원안 미정. Root-based + O(1) lookup. |
| Q4 | Top-K 다중 match 선택 | **Root-grouping** (frequency → max cosine → recency) | 원안 미정. |
| Q5 | Dismiss 처리 | 최소 dismiss 버튼 + Pinecone filter 에 반영 | 원안 없음. 신규 기능. |
| Q6-1 | Spec/impl 문서 분리 | 원본 spec 은 design intent 유지, 이 파일에 구현 결정 | 단일 파일 → 분리. |
| Q6-2 | Workspace 도입 | **Logical workspace**: `workspaceId` 필드만 v1 에 심음 (값은 userId) | 원안은 `userId` 직접 사용. |
| Q6-3 | Config 값 위치 | 중앙 `lib/config.ts` + env override | 원안 모호. |
| Q6-4 | Calibration fixture source | Hybrid 30쌍 (different 15 from repo + same 15 synthetic) | 원안 30쌍만 명시, source 미정. |
| Q6-5 | `repeatCount` race condition | **v1 무시** (solo dev target), v1.1 에 advisory lock | 원안 미인지. |
| Q6-6 | Pinecone 인덱스 전략 | 기존 `hreviewer` 인덱스 재사용 + namespace 격리 | 원안과 일치하지만 namespace 는 `user:` → `workspace:` 로 변경. |

---

## 용어 정의 (구현 관점)

- **Issue** = PR 리뷰에서 AI 가 생성한 단일 지적. **두 개의 독립 분류 필드**(`category` + `mistakeType`), 코드 범위(file + line 또는 null), title/body/impact/recommendation 텍스트를 가진다. 기존 리뷰 출력의 suggestion + inline comment 를 `ReviewIssue` 행 하나당 하나로 저장 (1 Issue = 1 row 원칙).
- **category** (기존 필드 유지) = issue 의 *성격* 분류 (`bug | design | security | performance | testing | general`). UI sort/filter, severity 해석용. `module/ai/lib/review-schema.ts` 의 `issueCategorySchema` 그대로.
- **mistakeType** (신규 필드) = issue 의 *실수 패턴* 분류 (`naming | error-handling | type-safety | duplication | readability | other`). 반복 실수 감지의 pre-filter 전용.
- **root issue** = 어떤 실수 유형의 최초 발생. `matchedIssueId` 가 null 인 Issue. 이후 같은 실수 재발생은 모두 이 root 를 가리킨다.
- **repeat count** = 자신이 같은 실수의 몇 번째 반복인가 (0 = root, 1 = 2번째 발생, 2 = 3번째 ...). UI 표시 시 `repeatCount + 1` 로 1-based 변환.
- **workspace** = v1 에서는 "1 user = 1 workspace" 의 논리적 별칭. `workspaceId` 필드는 v1 에서 userId 값을 담는다. v1.1 에 실제 `Workspace` 테이블 도입 시 schema rewrite 없이 의미 승격 (Q6-2).

---

## Q0. Dual Field: category + mistakeType

**Dual field 접근**: 기존 `category` enum 을 교체하지 않고 **별도 `mistakeType` 필드를 추가**. 두 필드는 목적이 직교하므로 독립 유지.

- `category` (기존 유지): `bug | design | security | performance | testing | general`
  - 용도: issue 의 **성격** 분류. UI sort/filter, severity 해석.
  - `module/ai/lib/review-schema.ts` 의 `issueCategorySchema` 변경 없음.

- `mistakeType` (신규): `naming | error-handling | type-safety | duplication | readability | other`
  - 용도: **반복 실수 감지**의 pre-filter 전용. Pinecone query 시 `filter: { mistakeType }` hard scope.
  - 신규 Zod 스키마 `mistakeTypeSchema` 를 `review-schema.ts` 에 추가.

**왜 dual field 인가** (교체하지 않는 이유):
- 두 분류 목적이 직교. "이게 bug 냐?" 와 "어떤 실수 패턴이냐?" 는 독립 정보.
- enum 합치면 11개 → 태깅 정확도 붕괴 (동일 LLM, 2배 카디널리티).
- 교체하면 기존 category 기반 UI/분석 전부 재작업. Dual field 는 기존 데이터 보존 + clean add.

**LLM 프롬프트 변경**:
- `buildStructuredPrompt` (in `module/ai/lib/review-prompt.ts`) 에 mistakeType 태깅 지시 추가. category 설명 뒤에 별도 섹션.
- 2단계 reasoning 권장: "먼저 category 선택, 그다음 mistakeType 선택".
- 출력 Zod 스키마 (`review-schema.ts`): 기존 `category` 필드 옆에 `mistakeType: mistakeTypeSchema` 추가.
- 유효성 실패 시 `mistakeType` 은 `other` 로 fallback, 로그 (`console.warn` with issue title).

**정확도 벤치마크** (ship 전 1회, 프롬프트 바뀔 때마다):
- 10개 PR fixture. 각 issue 에 사람이 `(category, mistakeType)` 둘 다 라벨링.
- LLM 출력 vs 사람 라벨 각 필드 독립 측정. **두 필드 각각 70%+ 일치** ship 기준.
- Fixture: `test/fixtures/category-tagging/` 에 JSONL. 별도 node 스크립트로 회귀 체크 (test runner 없음).
- `other` 비율 모니터링: 20% 초과 시 mistakeType enum 추가 검토 (v1.1).

---

## Q1. Embedding Template

**결정**: 각 Issue 의 embedding 텍스트는 `title + body + recommendation` 세 필드의 결합.

**템플릿** (recommendation 이 empty string 이면 마지막 줄 생략):

```
{title}

{body}

Fix: {recommendation}
```

**선택 이유**:
- **Title 은 LLM 이 "specific headline, ≤15 words" 로 생성** (prompt 제약). Semantic dense.
- **Body 는 "WHAT 만, 2-4 문장, ≤80 words"** (prompt 제약). Mistake 의 맥락 담음.
- **Recommendation 은 "imperative verb 로 시작, 1-2 문장"** (prompt 제약). **Mistake 의 invariant identity** 가장 잘 포착 (같은 실수 → 같은 recommendation 경향).
- Code snippet 제외: 변수명/파일명 variance 가 vector 를 dominate 해 cosine 신호 왜곡.
- `mistakeType` 은 embedding 에 포함 안 함: Postgres/Pinecone filter 로 hard scope 하는 게 효율적.

**호출 방식**:
- `module/ai/lib/generate-embedding.ts` 에 **batch 함수 신규 추가** (현재는 single `embed()` 만 지원).
- `embedMany()` 사용. 20 issue = 1 API call, 평균 1-2s.
- Task type: `SEMANTIC_SIMILARITY`.

**호출 코드 예시**:
```typescript
import { embedMany } from "ai";
import { google } from "@ai-sdk/google";
import { EMBEDDING_MODEL_ID, EMBEDDING_OUTPUT_DIMENSION } from "../constants";

export async function generateEmbeddings(
  texts: string[],
  taskType: EmbeddingTaskType,
) {
  const { embeddings } = await embedMany({
    model: google.textEmbeddingModel(EMBEDDING_MODEL_ID),
    values: texts,
    providerOptions: {
      google: { taskType, outputDimensionality: EMBEDDING_OUTPUT_DIMENSION },
    },
  });
  return embeddings;
}

export function buildEmbeddingText(issue: {
  title: string;
  body: string;
  recommendation?: string | null;
}): string {
  const parts = [issue.title, issue.body];
  if (issue.recommendation?.trim()) {
    parts.push(`Fix: ${issue.recommendation}`);
  }
  return parts.join("\n\n");
}
```

---

## Q2. Detection Pipeline — Step 5.5 Sync + Timeout

**결정**: detect-repeats 로직을 Inngest Step 5.5 (validate-review 와 post-review 사이) 에 **sync 하게** 삽입. 3s timeout + try/catch 로 best-effort.

**왜 sync 인가** (async follow-up edit 대신):
- UX: 한 번 publish, 한 번 알림. 사용자 관점에서 리뷰 = 완성된 리뷰.
- GitHub API 제약 회피: PR review body edit API 복잡도 + rate limit.
- 기존 파이프라인이 이미 sequential Inngest step 구조.

**Latency 비용**: 추가 2-3s. 전체 리뷰 10-30s 대비 +7-20%. 체감 미미.

**Step 5.5 구현**:
```typescript
const repeatFlags = await step.run("detect-repeats", async () => {
  const issues = validatedStructuredOutput?.issues ?? [];
  if (issues.length === 0) return new Map();

  try {
    return await Promise.race([
      detectRepeats(issues, workspaceId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), config.repeatDetection.timeoutMs)
      ),
    ]);
  } catch (error) {
    console.warn("[detect-repeats] skipped:", error);
    return new Map(); // graceful skip — step 자체는 성공 반환
  }
});
```

**핵심**: Step 내부에서 `Promise.race` timeout. Inngest step 자체는 항상 성공 반환 → retry 루프 방지. 실패 시 리뷰는 flag 없이 publish.

---

## 반복 감지 알고리즘 (Q1 + Q2 + Q4 + Q5 통합)

각 신규 Issue 에 대해:

1. **Pre-filter** (Postgres):
   - `workspaceId` + `mistakeType` 일치
   - `createdAt > now - windowDays` (기본 90)
   - `reviewId != currentReviewId` (self-exclude)
   - 0건이면 건너뜀 (root 로 저장, `isRepeat=false`).

2. **Embedding 생성** (Q1): 위 템플릿으로 `embedMany()` 배치 1회.

3. **Pinecone query** (Q6-6):
   - namespace: `workspace:{workspaceId}:issues`
   - filter: `{ mistakeType, dismissed: { $ne: true } }` (Q5)
   - topK: 5

4. **Threshold filter**: `cosine >= config.repeatDetection.similarityThreshold` 인 hit 만 남김.

5. **Root-grouping + tie-break** (Q4):
   - 각 hit 의 root id = `metadata.matchedIssueId ?? hit.id`
   - root 별 grouping. 정렬 기준:
     1. frequency desc (같은 root 에 몇 hit)
     2. max cosine desc
     3. latest createdAt desc
   - Winner 의 rootId 를 새 Issue 의 `matchedIssueId` 로 세팅.
   - `repeatCount = COUNT(*) WHERE matchedIssueId = rootId` (기존 occurrence 수). 새 Issue 는 `repeatCount + 1` 번째.

**Pseudo-code**:
```typescript
async function findMatchForNewIssue(
  newIssue: Issue,
  workspaceId: string,
  embedding: number[],
): Promise<{ rootId: string; repeatCount: number } | null> {
  const result = await pineconeIndex
    .namespace(config.repeatDetection.pineconeNamespace(workspaceId))
    .query({
      vector: embedding,
      topK: config.repeatDetection.topK,
      includeMetadata: true,
      filter: {
        mistakeType: newIssue.mistakeType,
        dismissed: { $ne: true },
      },
    });

  const threshold = config.repeatDetection.similarityThreshold;
  const passed = result.matches.filter(m => m.score >= threshold);
  if (passed.length === 0) return null;

  // Root-grouping with tie-break
  const byRoot = new Map<string, { count: number; maxSim: number; latestAt: Date }>();
  for (const hit of passed) {
    const rootId = hit.metadata.matchedIssueId ?? hit.id;
    const entry = byRoot.get(rootId) ?? { count: 0, maxSim: 0, latestAt: new Date(0) };
    entry.count++;
    entry.maxSim = Math.max(entry.maxSim, hit.score);
    const hitAt = new Date(hit.metadata.createdAt);
    if (hitAt > entry.latestAt) entry.latestAt = hitAt;
    byRoot.set(rootId, entry);
  }

  const winner = [...byRoot.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    if (b[1].maxSim !== a[1].maxSim) return b[1].maxSim - a[1].maxSim;
    return b[1].latestAt.getTime() - a[1].latestAt.getTime();
  })[0];

  const rootId = winner[0];
  const prevCount = await prisma.reviewIssue.count({
    where: { matchedIssueId: rootId },
  });

  return { rootId, repeatCount: prevCount + 1 };
}
```

**Threshold calibration** (Q6-4):
- Ship 전 30쌍 라벨링 (same-mistake 15 + different-mistake 15).
- Source:
  - **different-mistake 15쌍**: hreviewer 자기 repo PR 에서 자연 수확.
  - **same-mistake 15쌍**: 자기 repo 코드 기반 의도적 재현 (같은 실수 패턴의 변형 코드 → LLM 리뷰 돌려서 issue 생성 → pair).
- Fixture: `test/fixtures/repeat-detection/pairs.jsonl` + `calibrate.ts` 스크립트.
- Cosine 0.70-0.95 범위에서 P/R 곡선, FP ≤ 20% 최소 threshold 채택.
- 결정값은 `config.repeatDetection.similarityThreshold` 기본값으로 커밋. `REPEAT_DETECTION_THRESHOLD` env var 로 production override (Q6-3).

**Pinecone metadata 스키마** (Step 8 upsert 시):
```typescript
{
  workspaceId: string,
  category: string,           // 기존 enum
  mistakeType: string,        // 신규 enum — filter 용
  matchedIssueId: string | null,  // root 역추적용
  createdAt: string,          // ISO — recency tie-break
  dismissed: boolean,         // Q5 — filter 용, 초기값 false
}
```

---

## Q5. Dismiss Flow

**결정**: v1 에 최소 dismiss 버튼 + Pinecone filter 반영. Structured reason 은 v1.1.

**UI (PR inline comment)**:
```
⚠️ 반복 실수 (N번째) — 지난 PR #{n} 에서 처음 지적됨

{기존 issue body 내용}

[↩️ 이건 같은 실수 아님](https://{host}/api/issues/{issueId}/dismiss)
```

- N번째: `repeatCount + 1` (1-based 변환).
- 지난 PR 링크: root issue 의 PR 번호. 기존 웹 대시보드 페이지로 이동.

**Dismiss 엔드포인트**:
- API route: `app/api/issues/[id]/dismiss/route.ts` (Better-Auth protected).
- 동작:
  1. Session 검증 + issue 소유자 확인 (`issue.workspaceId === session.userId`).
  2. Prisma: `userDismissedMatch=true`, `dismissedAt=now()`.
  3. Pinecone: 해당 vector 의 metadata 를 `dismissed: true` 로 update.
- 확인 페이지: `app/issues/[id]/dismissed/page.tsx` — "Dismissed. 이 패턴은 이후 matching 에서 제외됩니다." + 뒤로 링크.

**v1 제외**:
- Dismiss reason (wrong_match / wrong_category / already_resolved) → v1.1.
- Dismiss 후 같은 root cluster 의 `repeatCount` 재계산 → v1.1.
- Dismiss 취소 (unmark) → v1.1.

---

## Q6-2. Logical Workspace

**결정**: `Workspace` 테이블은 만들지 않음. `workspaceId: String` 필드만 `ReviewIssue` 에 추가. v1 값은 userId.

**왜**:
- 완전한 Workspace 테이블 도입 = v1 scope 증가.
- 미래 team 전환 시 `userId → workspaceId` 대규모 migration 부담.
- Logical workspace = 두 부담 모두 회피. 필드 naming 만 바꾸는 수준.

**v1 구현**:
```typescript
// lib/workspace.ts (신규, 또는 module/auth/utils 에)
// v1: 단순 alias. v1.1 에 실제 workspace lookup 으로 교체.
export function resolveWorkspaceId(userId: string): string {
  return userId;
}
```

`workspaceId` 필드 주석:
```prisma
workspaceId String   // v1: equals userId. v1.1: Workspace.id (미리 심은 식별자 레이어)
```

**v1.1 migration 시**:
1. `Workspace` 테이블 생성.
2. 기존 User 마다 Workspace row seed (`workspace.id = user.id` 초기값).
3. `resolveWorkspaceId` 함수만 실제 lookup 으로 교체.
4. 기존 `ReviewIssue.workspaceId` 값 변경 0.
5. Pinecone namespace 값 변경 0 (re-upsert 불필요).

---

## Q6-3. Config Management

**결정**: 중앙 `lib/config.ts` 신규 파일 + env override.

```typescript
// lib/config.ts
function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  repeatDetection: {
    // 운영 튜닝 대상 (env override 가능, default fallback)
    similarityThreshold: envNumber("REPEAT_DETECTION_THRESHOLD", 0.80),
    timeoutMs: envNumber("REPEAT_DETECTION_TIMEOUT_MS", 3000),
    windowDays: envNumber("REPEAT_DETECTION_WINDOW_DAYS", 90),

    // 코드 결정 (hardcoded)
    topK: 5,
    pineconeNamespace: (workspaceId: string) => `workspace:${workspaceId}:issues`,
  },
  categoryTagging: {
    benchmarkAccuracyThreshold: 0.70,
  },
} as const;
```

**규칙**:
- Secrets (API key, DB URL) 은 `process.env` 직접 read. Config 에 넣지 않음 (security 분리).
- Feature 특화 "고정 상수" (embedding dimension, model id) 는 기존 `module/ai/constants/index.ts` 유지.
- 새 feature 의 튜닝 가능 값은 `config.{feature}.{key}` 네임스페이스로 추가.

**`.env.example` 에 선택 override 예시** (모두 주석 처리, default 로 동작):
```
# Repeat Detection (optional — defaults work in development)
# REPEAT_DETECTION_THRESHOLD=0.82    # calibration 결과 반영
# REPEAT_DETECTION_TIMEOUT_MS=3000
# REPEAT_DETECTION_WINDOW_DAYS=90
```

---

## Q6-4. Calibration Fixture

**결정**: Hybrid 30쌍 (different 15 from self repo + same 15 synthetic).

상세 내용은 "반복 감지 알고리즘 § Threshold calibration" 참조.

**Fixture 파일 구조** (계획):
```
test/fixtures/
├── category-tagging/
│   ├── pr-01.json         # 10 PR, 각 issue 에 (category, mistakeType) 라벨
│   ├── pr-02.json
│   ├── ...
│   └── README.md          # 라벨링 기준
└── repeat-detection/
    ├── pairs.jsonl        # 30 pair (same 15, different 15)
    ├── calibrate.ts       # 단독 node 스크립트: embedding → cosine → P/R → optimal threshold
    └── README.md          # 구성 설명, same-mistake 합성 방법
```

**pairs.jsonl 포맷**:
```json
{"label": "same", "a": {"title": "...", "body": "...", "recommendation": "...", "mistakeType": "error-handling"}, "b": {...}, "source": "self_repo"}
{"label": "different", "a": {...}, "b": {...}, "source": "self_repo"}
{"label": "same", "a": {...}, "b": {...}, "source": "synthetic"}
```

**calibrate.ts 실행**:
```bash
node --experimental-strip-types test/fixtures/repeat-detection/calibrate.ts
# Output: optimal threshold, FP rate, ROC curve data
```

---

## Q6-5. repeatCount Race Condition

**결정**: v1 에서 무시. v1.1 에 Postgres advisory lock.

**영향 평가**:
- Race 발생 시나리오: 두 PR 이 같은 root 를 거의 동시에 repeat → 둘 다 같은 `prevCount` 읽어서 같은 `repeatCount` 저장.
- Solo dev 타겟 발생 빈도: 월 1회 미만.
- Damage: "N번째 반복" 숫자 중복 표시. Core detection (isRepeat, matchedIssueId) 은 정확.

**v1 구현**:
```typescript
// Race condition 가능: v1.1 에서 advisory lock 으로 교체 예정 (Q6-5)
const prevCount = await prisma.reviewIssue.count({
  where: { matchedIssueId: rootId },
});
await prisma.reviewIssue.create({
  data: { ..., matchedIssueId: rootId, repeatCount: prevCount + 1 },
});
```

**v1.1 upgrade trigger**:
- Team workspace 도입 시.
- 또는 사용자 리포트 발생 시.

**v1.1 구현 (future)**:
```typescript
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`repeat:${rootId}`}, 0))
  `;
  const count = await tx.reviewIssue.count({ where: { matchedIssueId: rootId } });
  await tx.reviewIssue.create({ data: { ..., repeatCount: count + 1 } });
});
```

---

## Q6-6. Pinecone Index Strategy

**결정**: 기존 `hreviewer` 인덱스 재사용 + namespace 격리.

**구조**:
```
Pinecone Index: "hreviewer"  (dimension 768, gemini-embedding-001)
├── default namespace (기존 유지, 변경 0)
│   └── code chunk vectors (metadata.repoId 로 격리)
├── namespace "workspace:{workspaceId}:issues" (NEW)
│   └── issue vectors
└── (사용자마다 별도 namespace)
```

**왜 재사용**:
- Dimension 일치 (768) → 기술적 호환.
- Namespace 는 Pinecone native isolation → metadata filter 보다 query 빠름.
- 추가 인덱스 = 추가 과금 요소.
- `workspace:{id}:issues` 는 Q6-2 workspace 개념과 자연 결합.

**구현** (`module/ai/lib/issue-embedding-store.ts` 신규):
```typescript
import { pineconeIndex } from "@/lib/pinecone";
import { config } from "@/lib/config";

type IssueMetadata = {
  workspaceId: string;
  category: string;
  mistakeType: string;
  matchedIssueId: string | null;
  createdAt: string;
  dismissed: boolean;
};

export async function upsertIssueEmbedding(params: {
  workspaceId: string;
  issueId: string;
  vector: number[];
  metadata: IssueMetadata;
}) {
  const ns = config.repeatDetection.pineconeNamespace(params.workspaceId);
  await pineconeIndex.namespace(ns).upsert([
    { id: `issue:${params.issueId}`, values: params.vector, metadata: params.metadata },
  ]);
}

export async function queryIssueEmbedding(params: {
  workspaceId: string;
  vector: number[];
  mistakeType: string;
  topK?: number;
}) {
  const ns = config.repeatDetection.pineconeNamespace(params.workspaceId);
  return await pineconeIndex.namespace(ns).query({
    vector: params.vector,
    topK: params.topK ?? config.repeatDetection.topK,
    includeMetadata: true,
    filter: {
      mistakeType: params.mistakeType,
      dismissed: { $ne: true },
    },
  });
}

export async function markIssueDismissed(workspaceId: string, issueId: string) {
  const ns = config.repeatDetection.pineconeNamespace(workspaceId);
  await pineconeIndex.namespace(ns).update({
    id: `issue:${issueId}`,
    metadata: { dismissed: true },
  });
}
```

---

## Data Model (Prisma)

`prisma/schema.prisma` 에 `ReviewIssue` 모델 추가:

```prisma
model ReviewIssue {
  id              String   @id @default(cuid())
  reviewId        String
  review          Review   @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspaceId     String   // Q6-2: v1 에서는 userId 값과 동일. v1.1 에 Workspace.id 로 의미 승격.
  repositoryId    String?
  repository      Repository? @relation(fields: [repositoryId], references: [id], onDelete: SetNull)

  // Dual category (Q0)
  category        String   // enum: bug | design | security | performance | testing | general (기존)
  mistakeType     String   // enum: naming | error-handling | type-safety | duplication | readability | other (신규)

  // Issue content (Q1 embedding source)
  title           String   @db.Text
  body            String   @db.Text
  impact          String?  @db.Text
  recommendation  String?  @db.Text
  codeSnippet     String?  @db.Text
  severity        String   // enum: CRITICAL | WARNING | SUGGESTION | INFO

  // Location
  filePath        String?
  lineStart       Int?
  lineEnd         Int?

  // Repeat tracking (Q3 root-based + Q4 root-grouping)
  isRepeat        Boolean  @default(false)
  matchedIssueId  String?  // root issue id (자기 자신이 root 면 null)
  matchedIssue    ReviewIssue?   @relation("IssueRepeats", fields: [matchedIssueId], references: [id], onDelete: SetNull)
  repeatedBy      ReviewIssue[]  @relation("IssueRepeats")
  repeatCount     Int      @default(0)  // 0 = root, 1 = 2번째 발생, 2 = 3번째 ...

  // Dismiss (Q5)
  userDismissedMatch  Boolean   @default(false)
  dismissedAt         DateTime?

  createdAt       DateTime @default(now())

  @@index([workspaceId, mistakeType, createdAt])  // Pre-filter (Postgres 후보 조회)
  @@index([reviewId])
  @@index([matchedIssueId])                        // repeatCount 조회용
}
```

**역방향 relation 추가 필요**: `Review.reviewIssues ReviewIssue[]`, `User.reviewIssues ReviewIssue[]`, `Repository.reviewIssues ReviewIssue[]`.

**마이그레이션 이름**: `add_review_issue_with_repeat_detection`.

---

## Inngest Pipeline (Full)

기존 `inngest/functions/review.ts` 의 7-step pipeline 에 **2개 step 신규 삽입**.

```
Step 1: fetch-pr-data
Step 2: (inline) size 분류
Step 3: generate-context
Step 4: generate-ai-review          ← mistakeType 태깅 포함 (LLM prompt 변경)
Step 5: validate-review

Step 5.5 (NEW): detect-repeats
  ├── batch embedding 생성 (embedMany)
  ├── Postgres pre-filter (workspaceId, mistakeType, window, self-exclude)
  ├── Pinecone query (top-5, filter dismissed)
  ├── root-grouping 으로 match 결정 (Q4)
  └── Map<issueIndex, { matchedIssueId, repeatCount, matchedRootPrNumber }> 반환
      (3s timeout + try/catch → 빈 Map 반환으로 graceful skip)

Step 6: post-review                 ← repeatFlags 반영하여 배지 + dismiss 링크 렌더
Step 7: save-review                 ← ReviewIssue 저장 (isRepeat, matchedIssueId, repeatCount, userDismissedMatch=false)

Step 8 (NEW): upsert-embeddings     ← Pinecone 에 신규 issue 벡터 저장 (Step 7 commit 후)
```

**Step 6 수정**: `postPRReviewWithSuggestions` (in `module/github/lib/pr-review.ts`) 의 issue 렌더러에 `isRepeat`, `repeatCount`, `matchedRootPrNumber`, `dismissUrl` 을 주입.

**Step 8 주의**: Step 7 transaction commit 성공 후에만 실행. 부분 실패 시 Pinecone orphan embedding 방지. Retry 는 Inngest step 기본 동작 신뢰 (idempotent upsert).

---

## 구현 순서 (4주 plan)

```
Week 1: 데이터 레이어
├─ D1-D2: Prisma schema migration (ReviewIssue + workspaceId 필드 + indexes)
├─ D3: mistakeType enum + Zod 스키마 (mistakeTypeSchema)
└─ D4-D5: LLM 프롬프트 업데이트 (2-stage reasoning) + fixture 10 PR 회귀 테스트

Week 2: Detection 파이프라인
├─ D1: generate-embedding.ts 에 embedMany batch 함수 추가
├─ D2-D3: detect-repeats 함수 (root-grouping 포함)
├─ D4: Inngest Step 5.5 + Step 8 삽입
└─ D5: issue-embedding-store.ts (Pinecone namespace helper) + config.ts

Week 3: UI + Feedback
├─ D1-D2: pr-review.ts 배지 + dismiss 링크 렌더
├─ D3: /api/issues/[id]/dismiss 엔드포인트 + 확인 페이지
├─ D4: Pinecone metadata dismiss 반영 로직
└─ D5: Calibration fixture 30쌍 라벨링 + calibrate.ts 스크립트 + threshold 결정

Week 4: 검증 + ship
├─ D1-D2: End-to-end 테스트 (자기 repo 에 PR 3-5개)
├─ D3: Observability (detect-repeats skip rate, dismiss rate 로깅)
├─ D4: Docs + migration runbook
└─ D5: Main merge → prod deploy
```

**Week 1 병렬 가능**: The Assignment (인터뷰 5명) 과 병행. 인터뷰 결과가 3명 미만 yes 면 구현 중단 후 spec 재설계.

---

## Spec 대비 design-level 추가 제안 (선택 적용)

이번 session 에서 **spec 의 design intent 에 대해서도 몇 가지 개선 제안**이 있었음. Spec 본문엔 반영하지 않았으므로 여기 별도 기록:

1. **Kill criteria 대칭화**:
   - Spec 원안: "5명 중 **0명**이 가치 못 느끼면 kill"
   - 제안: "5명 중 **2명 미만** 긍정이면 kill" (pre-build gate "3명 이상 yes" 와 대칭).
   - 이유: 원안 기준은 너무 느슨. 1명만 긍정해도 살아남음 → confirmation bias 여지.

2. **Post-ship 모니터링 지표 명시화** (Success Criteria 보강):
   - `[detect-repeats] skipped` 로그 비율 (3s timeout 또는 API 실패율). 5%+ 면 timeout 재튜닝.
   - Dismiss rate = `dismissed_count / total_repeat_flags`. 2주 이동평균. 20%+ 면 threshold 재튜닝.
   - `other` mistakeType 비율. 20% 초과 시 enum 추가 검토.

3. **End-to-end recall 참고 수치**:
   - Category 태깅 정확도 (0.70) × cosine precision (0.80) ≈ **0.56** end-to-end.
   - 이는 ship gate 아님. 모니터링 참고.

이 세 가지는 spec 본문에 명시 반영 여부가 열려 있음. Founder 판단에 따라 spec patch 또는 본 implementation.md 유지.

---

## 남은 미해결 Questions

1. **기존 Review 백필**: v1 미수행 (spec 원안 유지). 과거 리뷰는 재처리 비용 크고 가치 불투명. 신규 리뷰부터 누적.
2. **결제 타이밍**: v1 무료 (spec 원안 유지).
3. **`other` mistakeType 비율 초과 시 대응**: 20%+ 면 v1.1 에 mistakeType 추가. 구체 enum 은 데이터 보고 결정.
4. **Dismiss rate 임계값 대응**: ship 후 2주 관측. 20%+ 면 threshold 재튜닝, 30%+ 면 kill criteria 가동.
5. **Dismiss 후 `repeatCount` 재계산**: v1 미수행. Dismissed root/occurrence 가 cluster 에 있을 때 이후 `repeatCount` 부정확 가능. v1.1 후보.
6. **Workspace 완전 도입 시점**: Q6-2 logical 상태 유지. 실제 `Workspace` 테이블은 team 기능 배치 때 (v1.1 or v2).

---

## Distribution Plan (구현 부분)

- **웹 앱**: Vercel 기존 파이프라인 (main merge → auto deploy).
- **DB 마이그레이션**: `npx prisma migrate dev --name add_review_issue_with_repeat_detection` → PR review → prod `migrate deploy`.
- **Pinecone**: 기존 `hreviewer` 인덱스 재사용 (Q6-6). 런타임에 `workspace:{workspaceId}:issues` namespace 에 upsert. 추가 인프라 0.
- **Config**: `lib/config.ts` 에 기본값 + env override. Production `.env` 에 calibration threshold 만 override.
- **Onboarding**: 기존 로그인/repo 연결 플로우 변경 없음. 새 사용자는 첫 PR 리뷰부터 자동 태깅, 두 번째부터 repeat 검사.
- **Dismiss 엔드포인트**: `app/api/issues/[id]/dismiss/route.ts` 신규 API route + `app/issues/[id]/dismissed/page.tsx` 확인 페이지. Better-Auth session 보호.

CI/CD: 기존 GitHub Actions 그대로. `test/fixtures/category-tagging/` 및 `test/fixtures/repeat-detection/` 회귀 체크 스크립트 (단독 node script, test runner 불필요).

---

## Dependencies (구현 부분)

- **기존 인프라**:
  - Prisma `Review` 테이블 + 신규 `ReviewIssue` relation.
  - Pinecone 클라이언트 (`lib/pinecone.ts`), 기존 `hreviewer` 인덱스.
  - Embedding: Google `gemini-embedding-001`, 768 dim (기존 RAG 와 동일 모델 재사용).
  - AI 리뷰 생성: `inngest/functions/review.ts` (7-step pipeline 에 Step 5.5, Step 8 신규 삽입).
  - Better-Auth (dismiss 엔드포인트 인증).
- **LLM 프롬프트 변경**: `module/ai/lib/review-prompt.ts` 에 mistakeType 태깅 지시 추가. `review-schema.ts` 에 `mistakeTypeSchema` Zod 추가.
- **Embedding batch 함수 신규**: `module/ai/lib/generate-embedding.ts` 가 현재 single `embed()` 만 지원. `embedMany()` 기반 batch 함수 추가.
- **신규 파일**:
  - `lib/config.ts`
  - `module/ai/lib/issue-embedding-store.ts` (Pinecone namespace helper)
  - `app/api/issues/[id]/dismiss/route.ts`
  - `app/issues/[id]/dismissed/page.tsx`
  - `test/fixtures/category-tagging/*.json`
  - `test/fixtures/repeat-detection/pairs.jsonl`
  - `test/fixtures/repeat-detection/calibrate.ts`
- **차단 요소 없음**. 외부 API 추가 없고, 새 벤더 붙이지 않음.

**Performance/Cost 노트**: 20-issue PR 기준. Batch 처리 시 **embedding 1 call + Pinecone query top-K 병렬 호출 ≈ 2-3s**. 전체 리뷰 10-30s 대비 +7-20% 증가. **구현 주의**: `embedMany()` 배치 — serial loop 금지. Pinecone query 는 `Promise.all` 병렬. 3s timeout (Q2) 이 충분한 buffer. Free tier 에선 무시 가능, 유료 전환 시 추가 최적화 검토.
