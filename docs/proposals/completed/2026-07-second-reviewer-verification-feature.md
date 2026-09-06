---
status: "completed"
stage: null
proposal-size: "standard"
created-at: null
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
migrated-from: "docs/archive/2026-07-second-reviewer-verification-feature.md"
migration-note: "원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다."
---

> 이관 메모 (2026-09-06): 원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다. 경로·메타데이터 변경 전의 hash와 검토 영수증은 당시 기록이며 새 검증 결과가 아니다.

# 2차 리뷰어 검증 (Second Reviewer Verification) 기능 개발 문서

> 보관 상태: **역사 기록 / 구현 완료** — 이 문서는 2026-07 구현 당시의 결정과 코드 예시를 보존하며 현재 구현 지침이 아니다. 이후 설정 이름은 `reviewerCount`에서 `verificationEnabled`로 변경되었다. 현재 명명과 동작의 source of truth는 코드와 `docs/proposals/active/2026-08-remove-codebase-rag-and-build-deterministic-pr-context.md`다.

## 1. 배경/동기

**비즈니스 맥락** (grill-me 세션에서 확정): AI 코드 리뷰의 최대 약점은 recall이 아니라 오탐(false positive)으로 인한 신뢰 붕괴다. 1인 개발자는 리뷰를 중재할 동료가 없으므로 "정제된 리뷰 하나"의 가치가 크다. 이에 1차 리뷰어(기존 파이프라인)의 산출물을 게시 전에 검증하는 **2차 리뷰어(Second Reviewer)** 를 도입한다. 역할은 검증자(오탐 필터)로 한정하며, 별도 의견 산출(비평가)·이슈 추가(보완자)·품질 채점은 배제한다.

**기술 맥락** (코드베이스 확인): 현재 리뷰는 `inngest/functions/review.ts`의 `generateReview` 함수가 단일 LLM 호출(`gemini-2.5-flash`)로 생성하고, 기계적 검증 게이트(Step 5: 경로/라인 해결, encoding guard, dedup, count-trim)를 거쳐 GitHub 게시 + DB 저장한다. 의미적 검증(이슈가 실제로 맞는지)은 존재하지 않는다. 검증자 모델은 상관 오류(같은 모델이 같은 맹점을 공유) 회피를 위해 `gemini-2.5-pro`로 확정되었다.

**확정된 12개 결정 요약** (grill-me):

| 항목 | 확정 내용 |
|---|---|
| 역할 | 검증자(오탐 필터) + 검증 흔적 노출 |
| 실행 조건 | User 설정 `reviewerCount`(1/2). 2면 전 리뷰 자동, 1이면 현행 유지 |
| 검증 범위 | issues + suggestions (summary/walkthrough/strengths 제외) |
| 판정 정책 | 보수적 3단계: CONFIRMED / UNCERTAIN / REJECTED — **REJECTED만 제거** |
| 검증자 모델 | `gemini-2.5-pro` |
| 흔적 노출 | REJECTED는 사유와 함께 저장 + 대시보드 접기 열람. GitHub은 요약 1줄 + **2차 리뷰어 명의 별도 리뷰 엔트리**(동일 계정 — 2026-07-17 후속 결정) |
| 배지 | CONFIRMED에만 GitHub 인라인 배지. UNCERTAIN은 대시보드에서만 구분 |
| 실패 처리 | fail-open + 대시보드 "생략됨" 표시 |
| 명칭 | "2차 리뷰어" / "Second Reviewer" |
| 설정 단위 | 사용자 전역 (`User` 컬럼 + 설정 페이지) |
| 파이프라인 위치 | Step 5(검증 게이트)와 Step 5.5(반복 감지) 사이 |
| 플랜/쿼터 | 영향 없음 (리뷰가 이미 Pro 전용·무제한) |

## 2. 목표 상태

### 목표

- `reviewerCount = 2`인 사용자의 모든 PR 리뷰에서, 1차 리뷰 검증 게이트 통과 산출물(issues + suggestions)을 `gemini-2.5-pro`가 판정한다.
- REJECTED 판정 항목은 GitHub 게시·`Suggestion`/`ReviewIssue` 행 생성·반복 감지에서 제외되고, 거부 사유와 함께 `Review.reviewData` JSON에 보존된다.
- CONFIRMED 판정 인라인 이슈 코멘트에는 "2차 리뷰어 검증됨" 배지가 붙고, 리뷰 본문 상단에 검증 요약 1줄(`N개 검토, M개 제외`)이 추가된다.
- 검증이 실제 수행된 경우(`status: "verified"` + 검토 대상 1개 이상), 1차 리뷰와 분리된 **2차 리뷰어 명의의 별도 리뷰 엔트리**(body-only, 동일 GitHub 계정)가 PR Conversation 탭에 추가 게시된다 — 이슈별 판정 목록 + 제외 내역 접기 포함.
- 대시보드 리뷰 상세에 검증 패널이 추가되어 이슈별 판정(CONFIRMED/UNCERTAIN)과 걸러진 항목(사유 포함)을 열람할 수 있다.
- 검증 LLM 호출이 실패하면 리뷰는 미검증 상태로 정상 게시되고, 대시보드에 "2차 검증 생략됨"이 표시된다(fail-open).
- `reviewerCount = 1`(기본값)이면 파이프라인 동작과 산출물이 현재와 완전히 동일하다.

### 비목표

- 저장소별 설정, 3인 이상 리뷰어 체인.
- 별도 봇 정체성(GitHub App)으로 2차 리뷰 게시 — 별도 아바타/이름이 필요해지면 미래 트랙(앱 등록·설치 플로우·앱 토큰 인증 인프라 필요). 이번 범위는 동일 계정 명의의 별도 리뷰 엔트리까지다.
- 검증자의 이슈 추가·severity 조정·리뷰 문구 수정 (필터링만 수행).
- suggestion 인라인 코멘트의 GitHub 배지 (배지는 이슈 코멘트만). 생존 suggestion의 판정(CONFIRMED/UNCERTAIN) UI 표시도 범위 외 — 대시보드 열람은 REJECTED suggestion(사유 포함)에 한한다(§4-17 패널). 판정 데이터 자체는 `reviewData.verification`에 모두 저장되므로 추후 노출 가능.
- REJECTED로 비워진 자리를 count-trim에서 잘린 이슈로 백필.
- 비구조화(마크다운 fallback) 경로의 검증 — 구조화 출력 실패 시 검증 대상 자체가 없으므로 건너뛴다.
- 검증자에 RAG 컨텍스트 제공 — 입력은 diff + 1차 산출물만.
- 검증 결과 기반 통계/학습 기능.

### 성공 기준

1. `reviewerCount = 1` 사용자의 리뷰에서 `reviewData`에 `verification` 키가 존재하지 않고, GitHub 코멘트가 기존과 동일하다.
2. `reviewerCount = 2` + 검증 성공 시: REJECTED 항목이 GitHub에 게시되지 않고, 대시보드 검증 패널에서 사유와 함께 열람 가능하며, CONFIRMED 인라인 이슈에 배지가 표시되고, PR Conversation 탭에 2차 리뷰어 명의의 별도 리뷰 엔트리(판정 목록 + 제외 접기)가 생성된다.
3. `reviewerCount = 2` + 검증 실패 시: 리뷰가 미검증 상태로 정상 게시되고 패널에 "생략됨"이 표시된다.
4. `npm run test`로 `applyVerification` 파티션 불변식 테스트가 통과한다 (8. 검증 전략의 테스트 코드).
5. `npm run build` 통과.

## 3. 대안 분석

역할·정책·모델 등 제품 결정은 grill-me 세션에서 확정되었다(§1 표). 설계상 남은 핵심 분기는 **검증 결과의 저장 방식**이다.

### Option A: Row 기반 — `ReviewIssue`/`Suggestion`에 verdict 컬럼 추가, REJECTED도 행으로 저장

- 장점: 판정이 정규화되어 추후 분석 쿼리 용이.
- 단점: REJECTED 행이 기존 소비자 전체에 누출된다 — `SuggestionList`(원클릭 적용 UI), 반복 감지 후보 쿼리(`detectRepeatIssues`의 `prisma.reviewIssue.findMany`), 이슈 해결 추적(`reconcile-issue-resolutions.ts`)이 모두 REJECTED 제외 필터를 추가해야 한다. 마이그레이션 3개 이상 필요 — Neon DB 체크섬 드리프트로 `migrate dev`가 리셋을 요구하는 현 상황에서 마이그레이션 수는 곧 리스크다.

### Option B: JSON 기반 — `Review.reviewData`에 optional `verification` 블록 추가, 행은 생존 항목만 생성

- 장점: `Suggestion`/`ReviewIssue` 행은 생존(kept) 항목만 생성되므로 기존 소비자(원클릭 적용, 반복 감지, 해결 추적)가 **무변경**. DB 마이그레이션이 `User.reviewerCount` 단 1개. `verification`이 optional 필드이므로 기존 v2 `reviewData`도 그대로 파싱되어 `REVIEW_SCHEMA_VERSION` 버전 범프 불필요(`app/dashboard/reviews/[id]/page.tsx:23`의 strict equality 체크가 구 리뷰를 마크다운 fallback으로 강등시키는 회귀 방지).
- 단점: REJECTED 항목이 SQL로 직접 조회 불가(JSON 내부). 추후 분석 기능이 생기면 마이그레이션 필요.

### 선택: Option B

- 근거: 영향 반경 최소화(기존 소비자 3곳 무변경), 마이그레이션 리스크 최소화(드리프트 우회 절차 1회), 스키마 버전 회귀 없음. 분석 요구는 현재 비목표이며 JSON에 데이터가 보존되므로 추후 이관 가능.

## 4. 구현 계획

### 신규 코드

| 파일 | 역할 |
|------|------|
| `features/ai/lib/verify-review.ts` | 검증자 프롬프트, `gemini-2.5-pro` 호출(`verifySecondReviewer`), 판정 적용 순수 함수(`applyVerification`), 검증 요약 1줄(`buildVerificationTrace`)·2차 리뷰 엔트리 본문(`buildSecondReviewerReviewBody`) 생성 |
| `features/ai/lib/verify-review.test.ts` | `applyVerification` 파티션 불변식 vitest 테스트 |
| `features/review/ui/parts/verification-panel.tsx` | 대시보드 검증 패널 (판정 목록 + 걸러진 항목 접기 + 생략 상태) |
| `features/settings/ui/parts/profile/reviewer-count-selector.tsx` | 리뷰어 인원(1/2) 선택 UI |
| `prisma/migrations/20260717000000_add_reviewer_count/migration.sql` | `user.reviewerCount` 컬럼 추가 |

### 기존 코드 수정

#### 4-1. `prisma/schema.prisma` — User에 reviewerCount 추가

Before (`prisma/schema.prisma:31-32`):

```prisma
  preferredLanguage String @default("en")
  maxSuggestions    Int?   // null = PR 크기별 기본값 사용, 1-15 범위
```

After:

```prisma
  preferredLanguage String @default("en")
  maxSuggestions    Int?   // null = PR 크기별 기본값 사용, 1-15 범위
  reviewerCount     Int    @default(1) // 1 = 단독 리뷰(현행), 2 = 2차 리뷰어 검증 활성화
```

마이그레이션 SQL (`prisma/migrations/20260717000000_add_reviewer_count/migration.sql`):

```sql
ALTER TABLE "user" ADD COLUMN "reviewerCount" INTEGER NOT NULL DEFAULT 1;
```

> ⚠️ Neon DB 체크섬 드리프트로 `npx prisma migrate dev`는 리셋을 요구한다. §5 Phase 1의 비파괴 절차(`db execute` + `migrate resolve`)로 적용할 것.

#### 4-2. `features/ai/constants/index.ts` — 검증자 모델 상수

Before (전체 파일):

```ts
export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_OUTPUT_DIMENSION = 768;
export const EMBEDDING_CONTENT_MAX_LENGTH = 8000;
export const PINECONE_BATCH_SIZE = 100;
export const DEFAULT_TOP_K = 5;
export const GITHUB_PROVIDER_ID = "github";

// 반복 실수 감지 (wedge) — Track A 캘리브레이션 결과 반영
export const REPEAT_SIMILARITY_THRESHOLD = 0.9; // Track A: 0.90에서 FP 5.1%. category-primary 2차 결과(0.88 PASS) 확인 후 하향 검토
export const REPEAT_WINDOW_DAYS = 90;
export const REPEAT_MIN_TEXT_LENGTH = 20; // 빈/짧은 텍스트 임베딩 방지 (sim=1.0 인공물)

export { CATEGORY_EMOJI, SEVERITY_EMOJI } from "./review-emoji";
```

After:

```ts
export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_OUTPUT_DIMENSION = 768;
export const EMBEDDING_CONTENT_MAX_LENGTH = 8000;
export const PINECONE_BATCH_SIZE = 100;
export const DEFAULT_TOP_K = 5;
export const GITHUB_PROVIDER_ID = "github";

// 반복 실수 감지 (wedge) — Track A 캘리브레이션 결과 반영
export const REPEAT_SIMILARITY_THRESHOLD = 0.9; // Track A: 0.90에서 FP 5.1%. category-primary 2차 결과(0.88 PASS) 확인 후 하향 검토
export const REPEAT_WINDOW_DAYS = 90;
export const REPEAT_MIN_TEXT_LENGTH = 20; // 빈/짧은 텍스트 임베딩 방지 (sim=1.0 인공물)

// 2차 리뷰어 검증 — 1차(gemini-2.5-flash)와 다른 모델로 상관 오류(공유 맹점) 회피
export const VERIFIER_MODEL_ID = "gemini-2.5-pro";

export { CATEGORY_EMOJI, SEVERITY_EMOJI } from "./review-emoji";
```

#### 4-3. `features/ai/lib/review-schema.ts` — 이슈 스키마 추출 + verification 스키마 추가

`structuredReviewSchema.issues`의 인라인 객체를 `structuredIssueSchema`로 추출하고(REJECTED 항목 저장 스키마에서 재사용), 파일 하단에 verification/저장용 스키마를 추가한다.

**동작 불변식**: `structuredReviewSchema`의 파싱 결과(LLM 출력 검증 + `page.tsx` 구 데이터 파싱)는 추출 전후 동일해야 한다 — 필드·describe·기본값을 그대로 옮기기만 한다.

Before (`features/ai/lib/review-schema.ts:62-114`):

```ts
// NOTE: 구조화 출력 스키마에는 poem 필드를 포함하지 않는다.
// tiny 모드에서는 walkthrough, strengths, sequenceDiagram이 null/빈배열이다.
export const structuredReviewSchema = z.object({
  summary: summarySchema,
  walkthrough: z.array(walkthroughEntrySchema).nullable().describe(
    "File-by-file breakdown. null if review mode is tiny."
  ),
  strengths: z.array(z.string()).describe(
    "List of positive aspects found. Empty array if review mode is tiny."
  ),
  issues: z.array(z.object({
    file: z.string().nullable().describe(
      "File path from diff. Use null ONLY when the issue spans 2+ files " +
      "or concerns cross-cutting architecture. Default to attaching the " +
      "most relevant single file."
    ),
    line: z.number().nullable().describe(
      "Line number in new file, or null for file/project-level issues"
    ),
    title: z.string().min(1).describe(
      "One-sentence headline (<=15 words, no trailing period). " +
      "Will be rendered as the issue's visual title. Do NOT duplicate this in body."
    ),
    body: z.string().min(1).describe(
      "Supporting explanation of the issue (2-4 sentences, <=80 words). " +
      "Describes WHAT the problem is. Do NOT include impact or recommendation here. " +
      "Do NOT pack multiple paragraphs into a single run-on sentence."
    ),
    impact: z.string().default("").describe(
      "Concrete consequence if unaddressed (1-2 sentences). " +
      "Who/what breaks, what regressions occur. " +
      "Empty string allowed for INFO-level observations where impact is self-evident."
    ),
    recommendation: z.string().default("").describe(
      "Actionable next step (1-2 sentences). " +
      "Start with an imperative verb (Add, Remove, Refactor, ...). " +
      "Empty string allowed when no concrete action applies (pure observation)."
    ),
    severity: severitySchema,
    category: issueCategorySchema,
  })).describe(
    "List of issues found. Use file+line for specific code issues, " +
    "file only for file-level issues, null for both for architectural/design issues."
  ),
  suggestions: z.array(codeSuggestionSchema).describe(
    "Specific, actionable code fix suggestions. " +
    "Only reference files and added lines from the diff. " +
    "before field must exactly match the current code."
  ),
  sequenceDiagram: z.string().nullable().describe(
    "Optional Mermaid sequenceDiagram block. null if not applicable or review mode is tiny."
  ),
});

export type StructuredReviewOutput = z.infer<typeof structuredReviewSchema>;
```

After:

```ts
// 2차 리뷰어 검증에서 REJECTED 항목 저장 스키마로 재사용하기 위해 추출
const structuredIssueSchema = z.object({
  file: z.string().nullable().describe(
    "File path from diff. Use null ONLY when the issue spans 2+ files " +
    "or concerns cross-cutting architecture. Default to attaching the " +
    "most relevant single file."
  ),
  line: z.number().nullable().describe(
    "Line number in new file, or null for file/project-level issues"
  ),
  title: z.string().min(1).describe(
    "One-sentence headline (<=15 words, no trailing period). " +
    "Will be rendered as the issue's visual title. Do NOT duplicate this in body."
  ),
  body: z.string().min(1).describe(
    "Supporting explanation of the issue (2-4 sentences, <=80 words). " +
    "Describes WHAT the problem is. Do NOT include impact or recommendation here. " +
    "Do NOT pack multiple paragraphs into a single run-on sentence."
  ),
  impact: z.string().default("").describe(
    "Concrete consequence if unaddressed (1-2 sentences). " +
    "Who/what breaks, what regressions occur. " +
    "Empty string allowed for INFO-level observations where impact is self-evident."
  ),
  recommendation: z.string().default("").describe(
    "Actionable next step (1-2 sentences). " +
    "Start with an imperative verb (Add, Remove, Refactor, ...). " +
    "Empty string allowed when no concrete action applies (pure observation)."
  ),
  severity: severitySchema,
  category: issueCategorySchema,
});

// NOTE: 구조화 출력 스키마에는 poem 필드를 포함하지 않는다.
// tiny 모드에서는 walkthrough, strengths, sequenceDiagram이 null/빈배열이다.
export const structuredReviewSchema = z.object({
  summary: summarySchema,
  walkthrough: z.array(walkthroughEntrySchema).nullable().describe(
    "File-by-file breakdown. null if review mode is tiny."
  ),
  strengths: z.array(z.string()).describe(
    "List of positive aspects found. Empty array if review mode is tiny."
  ),
  issues: z.array(structuredIssueSchema).describe(
    "List of issues found. Use file+line for specific code issues, " +
    "file only for file-level issues, null for both for architectural/design issues."
  ),
  suggestions: z.array(codeSuggestionSchema).describe(
    "Specific, actionable code fix suggestions. " +
    "Only reference files and added lines from the diff. " +
    "before field must exactly match the current code."
  ),
  sequenceDiagram: z.string().nullable().describe(
    "Optional Mermaid sequenceDiagram block. null if not applicable or review mode is tiny."
  ),
});

export type StructuredReviewOutput = z.infer<typeof structuredReviewSchema>;

// ── 2차 리뷰어 검증 ──
// verificationVerdictSchema는 여기(review-schema)가 source of truth.
// verify-review.ts가 import하여 LLM 출력 스키마에 재사용한다 (순환 import 방지 방향: verify-review → review-schema).
export const verificationVerdictSchema = z.enum(["CONFIRMED", "UNCERTAIN", "REJECTED"]);

const verdictRecordSchema = z.object({
  verdict: verificationVerdictSchema,
  reason: z.string(),
});

/** reviewData에 저장되는 검증 블록. issueVerdicts/suggestionVerdicts는
 *  저장된 (생존) issues/suggestions 배열과 index 정렬이다. */
export const reviewVerificationSchema = z.object({
  status: z.enum(["verified", "skipped"]),
  model: z.string(),
  issueVerdicts: z.array(verdictRecordSchema),
  suggestionVerdicts: z.array(verdictRecordSchema),
  rejectedIssues: z.array(structuredIssueSchema.extend({ reason: z.string() })),
  rejectedSuggestions: z.array(codeSuggestionSchema.extend({ reason: z.string() })),
});

/** reviewData 파싱용 스키마. verification은 optional이므로 기존 v2 데이터도
 *  그대로 파싱된다 — REVIEW_SCHEMA_VERSION 버전 범프 불필요(하위 호환 추가). */
export const storedReviewDataSchema = structuredReviewSchema.extend({
  verification: reviewVerificationSchema.optional(),
});

export type VerificationVerdict = z.infer<typeof verificationVerdictSchema>;
export type ReviewVerification = z.infer<typeof reviewVerificationSchema>;
export type StoredReviewData = z.infer<typeof storedReviewDataSchema>;
```

#### 4-4. `features/ai/lib/verify-review.ts` — 신규: 검증 엔진

```ts
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { VERIFIER_MODEL_ID } from "../constants";
import { verificationVerdictSchema } from "./review-schema";
import type { StructuredReviewOutput, VerificationVerdict } from "./review-schema";
import type { CodeSuggestion, StructuredIssue } from "../types";
import type { LanguageCode } from "@/shared/types/language";
import { SECOND_REVIEWER_LABELS } from "@/shared/constants";

export interface VerdictEntry {
  verdict: VerificationVerdict;
  reason: string;
}

export interface VerificationResult {
  status: "verified" | "skipped";
  /** 입력 issues 배열과 index 정렬 */
  issueVerdicts: VerdictEntry[];
  /** 입력 suggestions 배열과 index 정렬 */
  suggestionVerdicts: VerdictEntry[];
}

export interface AppliedVerification {
  keptOutput: StructuredReviewOutput;
  /** keptOutput.issues와 index 정렬 (CONFIRMED | UNCERTAIN만 포함) */
  keptIssueVerdicts: VerdictEntry[];
  /** keptOutput.suggestions와 index 정렬 */
  keptSuggestionVerdicts: VerdictEntry[];
  rejectedIssues: (StructuredIssue & { reason: string })[];
  rejectedSuggestions: (CodeSuggestion & { reason: string })[];
}

// LLM 출력용 스키마 — index 기반이라 배열 길이 불일치에 관대하다.
const verdictEntryOutputSchema = z.object({
  index: z.number().int().min(0).describe("Index of the finding in the numbered list"),
  verdict: verificationVerdictSchema.describe(
    "REJECTED only when the diff itself provides concrete evidence the finding is wrong. " +
    "UNCERTAIN when plausible but not confirmable from the diff alone. " +
    "CONFIRMED when the diff clearly supports the finding."
  ),
  reason: z.string().describe("1-2 sentence justification citing the diff"),
});

const verifierOutputSchema = z.object({
  issueVerdicts: z.array(verdictEntryOutputSchema),
  suggestionVerdicts: z.array(verdictEntryOutputSchema),
});

const REASON_LANGUAGE: Record<LanguageCode, string> = {
  en: "English",
  ko: "Korean",
};

function buildVerificationPrompt(params: {
  diff: string;
  issues: StructuredIssue[];
  suggestions: CodeSuggestion[];
  langCode: LanguageCode;
}): string {
  const { diff, issues, suggestions, langCode } = params;

  const issueList = issues
    .map((issue, i) => {
      const location = issue.file
        ? `${issue.file}${issue.line !== null ? `:${issue.line}` : ""}`
        : "project-level";
      return `[${i}] (${issue.severity}/${issue.category}) ${location}\nTitle: ${issue.title}\nBody: ${issue.body}`;
    })
    .join("\n\n");

  const suggestionList = suggestions
    .map(
      (s, i) =>
        `[${i}] ${s.file}:${s.line} (${s.severity})\nBEFORE:\n${s.before}\nAFTER:\n${s.after}\nWHY: ${s.explanation}`,
    )
    .join("\n\n");

  return `You are a senior engineer acting as the SECOND REVIEWER.
A first AI reviewer analyzed the pull request diff below and produced findings.
Your ONLY job is to verify each finding against the diff. You must NOT add new findings.

Verdict policy (be conservative):
- REJECTED: only when the diff gives concrete evidence the finding is wrong
  (e.g. the claimed missing guard actually exists in the diff, the "before" code
  does not behave as the finding claims, the issue misreads the change).
- CONFIRMED: the diff clearly supports the finding.
- UNCERTAIN: plausible but not verifiable from the diff alone. When in doubt, use UNCERTAIN — never REJECTED.

Return a verdict for EVERY index listed. Write each "reason" in ${REASON_LANGUAGE[langCode]}.

## Pull Request Diff
${diff}

## Issues to verify
${issueList.length > 0 ? issueList : "(none)"}

## Suggestions to verify
${suggestionList.length > 0 ? suggestionList : "(none)"}`;
}

/** index 기반 verdict를 입력 배열 길이에 정렬. 누락 index는 UNCERTAIN(보수적 기본값), 범위 밖 index는 무시. */
function alignVerdicts(
  entries: { index: number; verdict: VerificationVerdict; reason: string }[],
  length: number,
): VerdictEntry[] {
  const aligned: VerdictEntry[] = Array.from({ length }, () => ({
    verdict: "UNCERTAIN" as const,
    reason: "",
  }));
  for (const entry of entries) {
    if (entry.index >= 0 && entry.index < length) {
      aligned[entry.index] = { verdict: entry.verdict, reason: entry.reason };
    }
  }
  return aligned;
}

/** 2차 리뷰어 LLM 호출. 실패 시 throw — 호출부(Inngest step)에서 fail-open 처리한다. */
export async function verifySecondReviewer(params: {
  diff: string;
  issues: StructuredIssue[];
  suggestions: CodeSuggestion[];
  langCode: LanguageCode;
}): Promise<VerificationResult> {
  const prompt = buildVerificationPrompt(params);

  const { experimental_output } = await generateText({
    model: google(VERIFIER_MODEL_ID),
    experimental_output: Output.object({ schema: verifierOutputSchema }),
    prompt,
  });

  // SDK 레벨 검증을 신뢰하지 않고 Zod로 재검증 (generate-ai-review와 동일 패턴)
  const parsed = verifierOutputSchema.safeParse(experimental_output);
  if (!parsed.success) {
    throw new Error(`Verifier output re-validation failed: ${parsed.error.message}`);
  }

  return {
    status: "verified",
    issueVerdicts: alignVerdicts(parsed.data.issueVerdicts, params.issues.length),
    suggestionVerdicts: alignVerdicts(parsed.data.suggestionVerdicts, params.suggestions.length),
  };
}

/**
 * 판정을 1차 산출물에 적용해 생존/제외 항목으로 분할하는 순수 함수.
 * - result가 null(검증 미실행)이거나 skipped(검증 실패)면 null 반환 — 호출부는 원본을 그대로 사용.
 * - REJECTED만 제거한다. CONFIRMED/UNCERTAIN은 원래 순서 그대로 유지 (보수적 필터).
 */
export function applyVerification(
  output: StructuredReviewOutput,
  result: VerificationResult | null,
): AppliedVerification | null {
  if (!result || result.status === "skipped") return null;

  const keptIssues: StructuredIssue[] = [];
  const keptIssueVerdicts: VerdictEntry[] = [];
  const rejectedIssues: (StructuredIssue & { reason: string })[] = [];

  output.issues.forEach((issue, index) => {
    const entry = result.issueVerdicts[index] ?? { verdict: "UNCERTAIN" as const, reason: "" };
    if (entry.verdict === "REJECTED") {
      rejectedIssues.push({ ...issue, reason: entry.reason });
    } else {
      keptIssues.push(issue);
      keptIssueVerdicts.push(entry);
    }
  });

  const keptSuggestions: CodeSuggestion[] = [];
  const keptSuggestionVerdicts: VerdictEntry[] = [];
  const rejectedSuggestions: (CodeSuggestion & { reason: string })[] = [];

  output.suggestions.forEach((suggestion, index) => {
    const entry = result.suggestionVerdicts[index] ?? { verdict: "UNCERTAIN" as const, reason: "" };
    if (entry.verdict === "REJECTED") {
      rejectedSuggestions.push({ ...suggestion, reason: entry.reason });
    } else {
      keptSuggestions.push(suggestion);
      keptSuggestionVerdicts.push(entry);
    }
  });

  return {
    keptOutput: { ...output, issues: keptIssues, suggestions: keptSuggestions },
    keptIssueVerdicts,
    keptSuggestionVerdicts,
    rejectedIssues,
    rejectedSuggestions,
  };
}

/** GitHub 리뷰 본문 상단에 붙는 검증 요약 1줄. 검토 대상이 0개면 null. */
export function buildVerificationTrace(
  counts: { reviewedCount: number; excludedCount: number },
  langCode: LanguageCode,
): string | null {
  if (counts.reviewedCount === 0) return null;
  const labels = SECOND_REVIEWER_LABELS[langCode];
  const summary = labels.summary
    .replace("{reviewed}", String(counts.reviewedCount))
    .replace("{excluded}", String(counts.excludedCount));
  return `> 🛡️ **${labels.title}** — ${summary}`;
}

/** 2차 리뷰어 명의의 별도 GitHub 리뷰 엔트리 본문 (body-only, 동일 계정).
 *  이슈별 판정 목록 + 제외 내역 접기. 검토 대상이 0개면 호출하지 않는다 (호출부 가드). */
export function buildSecondReviewerReviewBody(params: {
  keptIssues: StructuredIssue[];
  keptIssueVerdicts: VerdictEntry[];
  rejectedIssues: (StructuredIssue & { reason: string })[];
  rejectedSuggestions: (CodeSuggestion & { reason: string })[];
  reviewedCount: number;
  langCode: LanguageCode;
}): string {
  const { keptIssues, keptIssueVerdicts, rejectedIssues, rejectedSuggestions, reviewedCount, langCode } = params;
  const labels = SECOND_REVIEWER_LABELS[langCode];
  const excludedCount = rejectedIssues.length + rejectedSuggestions.length;
  const summary = labels.summary
    .replace("{reviewed}", String(reviewedCount))
    .replace("{excluded}", String(excludedCount));

  const sections: string[] = [`## 🛡️ ${labels.title}`, "", `> ${summary}`];

  if (keptIssues.length > 0) {
    const items = keptIssues.map((issue, index) => {
      const verdict = keptIssueVerdicts[index]?.verdict ?? "UNCERTAIN";
      const mark = verdict === "CONFIRMED" ? "✅" : "⚪";
      return `- ${mark} \`${verdict}\` — ${issue.title}`;
    });
    sections.push("", ...items);
  }

  if (excludedCount > 0) {
    const rejectedLines = [
      ...rejectedIssues.map((issue) => `- ~~${issue.title}~~ — ${issue.reason}`),
      ...rejectedSuggestions.map((s) => `- ~~${s.file}:${s.line}~~ — ${s.reason}`),
    ];
    sections.push(
      "",
      `<details>\n<summary>${labels.excluded} (${excludedCount})</summary>\n\n${rejectedLines.join("\n")}\n\n</details>`,
    );
  }

  sections.push("", "---", "*Generated by HReviewer*");
  return sections.join("\n");
}
```

#### 4-5. `shared/constants/index.ts` — 2차 리뷰어 라벨 추가

기존 파일 하단(`DIAGRAM_FALLBACK_TEXT` 뒤)에 추가 (After, 신규 블록만):

```ts
/** 2차 리뷰어 라벨. LanguageCode 추가 시 여기도 추가 필수. */
export const SECOND_REVIEWER_LABELS = {
  en: {
    title: "Second Reviewer",
    badge: "Verified by second reviewer",
    summary: "reviewed {reviewed} findings, excluded {excluded}",
    skipped: "Second review was skipped",
    excluded: "Excluded findings",
  },
  ko: {
    title: "2차 리뷰어",
    badge: "2차 리뷰어 검증됨",
    summary: "{reviewed}개 검토, {excluded}개 제외",
    skipped: "2차 검증이 생략되었습니다",
    excluded: "제외된 항목",
  },
} as const satisfies Record<
  LanguageCode,
  { title: string; badge: string; summary: string; skipped: string; excluded: string }
>;
```

#### 4-6. `features/ai/lib/index.ts` + `features/ai/index.ts` — export 추가

`features/ai/lib/index.ts` Before (전체 파일):

```ts
export { generateEmbedding } from "./generate-embedding";
export { getRepositoryWithToken } from "./get-repository-with-token";
export { indexCodebase } from "./index-codebase";
export { retrieveContext } from "./retrieve-context";
export { classifyPRSize, getTopKForSizeMode } from "./review-size-policy";
export type { ReviewSizeMode, PRSizeInfo } from "./review-size-policy";
export { guardTextFeedback } from "./guard-text-feedback";
export { structuredReviewSchema } from "./review-schema";
export { buildStructuredPrompt, buildFallbackPrompt, getIssueLimit } from "./review-prompt";
export { formatStructuredReviewToMarkdown } from "./review-formatter";
export { detectRepeatIssues } from "./repeat-detection";
export type { RepeatAnnotation, RepeatBadgeInfo } from "./repeat-detection";
```

After:

```ts
export { generateEmbedding } from "./generate-embedding";
export { getRepositoryWithToken } from "./get-repository-with-token";
export { indexCodebase } from "./index-codebase";
export { retrieveContext } from "./retrieve-context";
export { classifyPRSize, getTopKForSizeMode } from "./review-size-policy";
export type { ReviewSizeMode, PRSizeInfo } from "./review-size-policy";
export { guardTextFeedback } from "./guard-text-feedback";
export { structuredReviewSchema, storedReviewDataSchema } from "./review-schema";
export type { StoredReviewData, ReviewVerification, VerificationVerdict } from "./review-schema";
export { buildStructuredPrompt, buildFallbackPrompt, getIssueLimit } from "./review-prompt";
export { formatStructuredReviewToMarkdown } from "./review-formatter";
export { detectRepeatIssues } from "./repeat-detection";
export type { RepeatAnnotation, RepeatBadgeInfo } from "./repeat-detection";
export { verifySecondReviewer, applyVerification, buildVerificationTrace, buildSecondReviewerReviewBody } from "./verify-review";
export type { VerificationResult, AppliedVerification, VerdictEntry } from "./verify-review";
```

`features/ai/index.ts` — 변경 줄만:

```ts
// 기존 줄 유지 + 아래 추가
export { VERIFIER_MODEL_ID } from "./constants";
export { verifySecondReviewer, applyVerification, buildVerificationTrace, buildSecondReviewerReviewBody, storedReviewDataSchema } from "./lib";
export type { VerificationResult, AppliedVerification, VerdictEntry, StoredReviewData, ReviewVerification, VerificationVerdict } from "./lib";
```

#### 4-7. `features/ai/actions/review-pull-request.ts` — 이벤트에 reviewerCount 전달

Before (`reviewPullRequest` 함수 내 `inngest.send` 호출, 31-41행):

```ts
    await inngest.send({
      name: "pr.review.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
        preferredLanguage,
        maxSuggestions: repository.user.maxSuggestions ?? null,
      },
    });
```

After:

```ts
    await inngest.send({
      name: "pr.review.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
        preferredLanguage,
        maxSuggestions: repository.user.maxSuggestions ?? null,
        reviewerCount: repository.user.reviewerCount,
      },
    });
```

(함수의 나머지 부분은 무변경. `repository.user`는 `getRepositoryWithToken`이 `include: { user: ... }`로 로드하므로 마이그레이션 + `prisma generate` 후 `reviewerCount` 필드가 타입에 포함된다.)

#### 4-8. `inngest/functions/review.ts` — 검증 스텝 삽입 + 하류 배선

**동작 불변식**: `reviewerCount = 1`(또는 이벤트에 필드 부재)이면 `verification = null` → `verified = null` → `finalOutput === validatedStructuredOutput`, `finalReview === review`로 모든 하류 스텝이 현행과 동일하게 동작한다 (신설 Step 6.5는 no-op으로 `false`만 반환 — GitHub 부수효과 없음).

(a) import 변경 — 변경 줄만:

```ts
import { postPRReviewWithSuggestions, postSecondReviewerReview } from "@/features/review/lib/pr-review";
import {
  retrieveContext, classifyPRSize, getTopKForSizeMode,
  structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt,
  getIssueLimit, formatStructuredReviewToMarkdown, REVIEW_SCHEMA_VERSION, guardTextFeedback,
  detectRepeatIssues,
  verifySecondReviewer, applyVerification, buildVerificationTrace, buildSecondReviewerReviewBody, VERIFIER_MODEL_ID,
} from "@/features/ai";
import type { ReviewSizeMode, VerificationResult } from "@/features/ai";
```

(b) 이벤트 destructure — Before (71행):

```ts
    const { owner, repo, prNumber, userId, preferredLanguage = "en", maxSuggestions = null } = event.data;
```

After:

```ts
    const { owner, repo, prNumber, userId, preferredLanguage = "en", maxSuggestions = null, reviewerCount = 1 } = event.data;
```

(c) Step 5(validate-review)와 Step 5.5(detect-repeat-issues) 사이에 삽입 — 신규:

```ts
    // ── Step 5.3: 2차 리뷰어 검증 (reviewerCount=2 && 구조화 출력 존재 시) ──
    // 실패해도 리뷰 흐름을 막지 않는다 — status: "skipped"로 미검증 게시 (fail-open).
    const verification = await step.run("second-reviewer-verify", async (): Promise<VerificationResult | null> => {
      if (reviewerCount !== 2 || !validatedStructuredOutput) return null;

      const { issues, suggestions } = validatedStructuredOutput;
      if (issues.length === 0 && suggestions.length === 0) {
        return { status: "verified", issueVerdicts: [], suggestionVerdicts: [] };
      }

      try {
        return await verifySecondReviewer({ diff, issues, suggestions, langCode });
      } catch (error) {
        console.warn("Second reviewer verification failed, continuing unverified:", error);
        return { status: "skipped", issueVerdicts: [], suggestionVerdicts: [] };
      }
    });

    // ── Step 5.3 적용: 순수 함수 — 입력이 모두 step 반환값이므로 Inngest replay-safe ──
    const verified = validatedStructuredOutput
      ? applyVerification(validatedStructuredOutput, verification)
      : null;
    const finalOutput = verified ? verified.keptOutput : validatedStructuredOutput;

    let finalReview = review;
    if (verified) {
      const reviewedCount =
        (verification?.issueVerdicts.length ?? 0) + (verification?.suggestionVerdicts.length ?? 0);
      const excludedCount = verified.rejectedIssues.length + verified.rejectedSuggestions.length;
      const trace = buildVerificationTrace({ reviewedCount, excludedCount }, langCode);
      const markdown = formatStructuredReviewToMarkdown(verified.keptOutput, langCode);
      finalReview = sanitizeMermaidSequenceDiagrams(trace ? `${trace}\n\n${markdown}` : markdown, langCode);
    }
```

(d) Step 5.5(detect-repeat-issues) — 대상 이슈를 생존 이슈로 변경. Before(스텝 본문 첫 줄):

```ts
    const repeatAnnotations = await step.run("detect-repeat-issues", async () => {
      const issues = validatedStructuredOutput?.issues ?? [];
```

After:

```ts
    const repeatAnnotations = await step.run("detect-repeat-issues", async () => {
      const issues = finalOutput?.issues ?? [];
```

(스텝 본문 나머지는 무변경.)

(e) Step 6(post-review) — 전체 스텝 After (`validatedStructuredOutput`→`finalOutput`, `review`→`finalReview`, CONFIRMED 배지 부착):

```ts
    // ── Step 6: GitHub에 리뷰 게시 ──
    // IMPORTANT: postedAsReview는 반드시 step.run()의 반환값으로 캡처해야 한다.
    const postedAsReview = await step.run("post-review", async () => {
      const suggestions = finalOutput?.suggestions ?? [];
      const issues = finalOutput?.issues ?? [];
      const issuesWithRepeat = issues.map((issue, index) => {
        const annotation = repeatAnnotations[index];
        const confirmed = verified?.keptIssueVerdicts[index]?.verdict === "CONFIRMED";
        return {
          ...issue,
          ...(annotation?.repeat ? { repeat: annotation.repeat } : {}),
          ...(confirmed ? { secondReviewerConfirmed: true } : {}),
        };
      });
      const inlineIssues = issuesWithRepeat.filter(i => i.file !== null && i.line !== null);
      const hasInlineContent = suggestions.length > 0 || inlineIssues.length > 0;

      if (hasInlineContent) {
        try {
          await postPRReviewWithSuggestions({
            token, owner, repo, prNumber, reviewBody: finalReview,
            suggestions, issues: issuesWithRepeat, headSha, langCode,
          });
          return true;
        } catch (error) {
          console.warn("PR Review API failed, falling back to comment:", error);
          await postReviewComment(token, owner, repo, prNumber, finalReview);
          return false;
        }
      } else {
        await postReviewComment(token, owner, repo, prNumber, finalReview);
        return false;
      }
    });
```

(f) Step 6(post-review)와 Step 7(save-review) 사이에 삽입 — 신규 Step 6.5:

```ts
    // ── Step 6.5: 2차 리뷰어 별도 리뷰 엔트리 게시 (검증 수행 시에만) ──
    // 1차 리뷰(Step 6)와 독립 — 실패해도 리뷰 흐름을 막지 않는다.
    // reviewerCount=1이거나 검증 생략(skipped)·검토 대상 0개면 no-op.
    await step.run("post-second-reviewer-review", async () => {
      if (!verified || !verification) return false;

      const reviewedCount =
        verification.issueVerdicts.length + verification.suggestionVerdicts.length;
      if (reviewedCount === 0) return false;

      const body = buildSecondReviewerReviewBody({
        keptIssues: finalOutput?.issues ?? [],
        keptIssueVerdicts: verified.keptIssueVerdicts,
        rejectedIssues: verified.rejectedIssues,
        rejectedSuggestions: verified.rejectedSuggestions,
        reviewedCount,
        langCode,
      });

      try {
        await postSecondReviewerReview({ token, owner, repo, prNumber, headSha, body });
        return true;
      } catch (error) {
        console.warn("Second reviewer review entry failed (main review was already posted):", error);
        return false;
      }
    });
```

(g) Step 7(save-review) — 전체 스텝 After (`review`→`finalReview`, `validatedStructuredOutput`→`finalOutput`, verification 블록 저장):

```ts
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
            review: finalReview,
            reviewData: finalOutput
              ? (() => {
                  // shape guard: 배포 경쟁 상태에서 구 shape(description-only)이
                  // memoize되어 resume될 때 schemaVersion이 실제 shape과 불일치하는 것을 방지.
                  // issues가 빈 배열이면 .every()는 true → 정상적으로 v2 저장.
                  const hasNewIssueShape = (finalOutput.issues ?? []).every(
                    (i) => typeof (i as { title?: unknown }).title === "string",
                  );
                  const storedSchemaVersion = hasNewIssueShape ? REVIEW_SCHEMA_VERSION : 1;
                  // verification 블록은 optional 추가 필드 — 버전 범프 불필요 (storedReviewDataSchema 참조)
                  const verificationBlock = verification
                    ? {
                        status: verification.status,
                        model: VERIFIER_MODEL_ID,
                        issueVerdicts: verified?.keptIssueVerdicts ?? [],
                        suggestionVerdicts: verified?.keptSuggestionVerdicts ?? [],
                        rejectedIssues: verified?.rejectedIssues ?? [],
                        rejectedSuggestions: verified?.rejectedSuggestions ?? [],
                      }
                    : null;
                  // 인터페이스 타입 배열(VerdictEntry[] 등)은 인덱스 시그니처가 없어
                  // Prisma InputJsonValue에 구조적으로 미할당 — 값은 순수 JSON이므로 캐스트.
                  return {
                    ...finalOutput,
                    ...(verificationBlock ? { verification: verificationBlock } : {}),
                    schemaVersion: storedSchemaVersion,
                  } as unknown as Prisma.InputJsonValue;
                })()
              : Prisma.DbNull,
            langCode,
            reviewType: "FULL_REVIEW",
            status: "completed",
            headSha,
          },
        });

        if (finalOutput?.suggestions?.length) {
          await tx.suggestion.createMany({
            data: finalOutput.suggestions.map((s) => ({
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

        if (finalOutput?.issues?.length) {
          await tx.reviewIssue.createMany({
            data: finalOutput.issues.map((issue, index) => {
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
```

(Step 1~5 및 `resolveToDiffPath`/`resolveEntryFile` 헬퍼는 무변경.)

#### 4-9. `features/review/lib/pr-review.ts` — CONFIRMED 배지

(a) 타입 + import — Before (2-8행):

```ts
import type { CodeSuggestion, StructuredIssue, RepeatBadgeInfo } from "@/features/ai";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/features/ai";
import { normalizeSuggestionExplanation } from "@/features/ai/lib/suggestion-format";
import type { LanguageCode } from "@/shared/types/language";
import { ISSUE_FIELD_LABELS, REPEAT_BADGE_LABELS } from "@/shared/constants";

type RepeatAnnotatedIssue = StructuredIssue & { repeat?: RepeatBadgeInfo | null };
```

After:

```ts
import type { CodeSuggestion, StructuredIssue, RepeatBadgeInfo } from "@/features/ai";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/features/ai";
import { normalizeSuggestionExplanation } from "@/features/ai/lib/suggestion-format";
import type { LanguageCode } from "@/shared/types/language";
import { ISSUE_FIELD_LABELS, REPEAT_BADGE_LABELS, SECOND_REVIEWER_LABELS } from "@/shared/constants";

type RepeatAnnotatedIssue = StructuredIssue & {
  repeat?: RepeatBadgeInfo | null;
  secondReviewerConfirmed?: boolean;
};
```

(b) 호출부 — Before (65-69행):

```ts
  const issueComments: ReviewComment[] = inlineIssues.map((i) => ({
    path: i.file,
    line: i.line,
    body: formatIssueComment(i, labels, REPEAT_BADGE_LABELS[langCode]),
  }));
```

After:

```ts
  const issueComments: ReviewComment[] = inlineIssues.map((i) => ({
    path: i.file,
    line: i.line,
    body: formatIssueComment(i, labels, REPEAT_BADGE_LABELS[langCode], SECOND_REVIEWER_LABELS[langCode]),
  }));
```

(c) `formatIssueComment` — 전체 함수 After (반복 배지 아래에 검증 배지 추가):

**동작 불변식**: `secondReviewerConfirmed`가 없는 이슈의 출력 마크다운은 변경 전과 byte 동일해야 한다.

```ts
function formatIssueComment(
  issue: RepeatAnnotatedIssue,
  labels: { impact: string; recommendation: string },
  repeatLabels: { badge: string; context: string },
  secondReviewerLabels: { badge: string },
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
  if (issue.secondReviewerConfirmed) {
    lines.push("", `> ✅ **${secondReviewerLabels.badge}**`);
  }
  if (body) lines.push("", body);
  if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
  if (recommendation) lines.push("", `**${labels.recommendation}:** ${recommendation}`);
  return lines.join("\n");
  // SYNC:formatIssueBody — review-formatter.ts · structured-review-body.tsx 와 동일 로직 유지
}
```

(d) `postSecondReviewerReview` — 신규 함수 (파일 하단에 추가):

```ts
/** 2차 리뷰어 명의(동일 계정)의 body-only 리뷰 엔트리 게시.
 *  인라인 코멘트 없음 — body가 있는 review는 PR Conversation 탭에 별도 리뷰 카드로 나타난다
 *  (위 postPRReviewWithSuggestions 2차 호출의 "body 필드 생략" 주석과 동일 근거의 역방향 활용). */
export async function postSecondReviewerReview(params: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  body: string;
}): Promise<void> {
  const { token, owner, repo, prNumber, headSha, body } = params;
  const octokit = createOctokitClient(token);
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    body,
    event: "COMMENT",
  });
}
```

#### 4-10. `features/settings/constants/profile-schema.ts` — 설정 스키마

Before (전체 파일):

```ts
import { z } from "zod";
import { MAX_SUGGESTION_CAP } from "@/shared/constants";
import { LANGUAGE_BY_CODE, type LanguageCode } from "./index";

const LANGUAGE_CODES = Object.keys(LANGUAGE_BY_CODE) as [LanguageCode, ...LanguageCode[]];

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    email: z.union([z.string().email(), z.literal("")]).optional(),
    preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
    maxSuggestions: z
      .union([z.number().int().min(1).max(MAX_SUGGESTION_CAP), z.null()])
      .optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "No profile fields were provided",
  });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
```

After:

```ts
import { z } from "zod";
import { MAX_SUGGESTION_CAP } from "@/shared/constants";
import { LANGUAGE_BY_CODE, type LanguageCode } from "./index";

const LANGUAGE_CODES = Object.keys(LANGUAGE_BY_CODE) as [LanguageCode, ...LanguageCode[]];

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    email: z.union([z.string().email(), z.literal("")]).optional(),
    preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
    maxSuggestions: z
      .union([z.number().int().min(1).max(MAX_SUGGESTION_CAP), z.null()])
      .optional(),
    reviewerCount: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "No profile fields were provided",
  });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
```

#### 4-11. `features/settings/types/index.ts` — UserProfile 타입

Before (3-24행):

```ts
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  preferredLanguage: LanguageCode;
  maxSuggestions: number | null;
}

export type UpdateProfileResult =
  | {
      success: true;
      user: {
        id: string;
        name: string;
        email: string;
        preferredLanguage: string;
        maxSuggestions: number | null;
      };
    }
  | { success: false; message: string };
```

After:

```ts
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  preferredLanguage: LanguageCode;
  maxSuggestions: number | null;
  reviewerCount: number;
}

export type UpdateProfileResult =
  | {
      success: true;
      user: {
        id: string;
        name: string;
        email: string;
        preferredLanguage: string;
        maxSuggestions: number | null;
        reviewerCount: number;
      };
    }
  | { success: false; message: string };
```

#### 4-12. `features/settings/actions/index.ts` — select에 reviewerCount 추가

`getUserProfile`의 select — Before (22-30행):

```ts
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        preferredLanguage: true,
        maxSuggestions: true,
      },
```

After:

```ts
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        preferredLanguage: true,
        maxSuggestions: true,
        reviewerCount: true,
      },
```

`updateUserProfile`의 select — Before (60-67행):

```ts
      select: {
        id: true,
        name: true,
        email: true,
        preferredLanguage: true,
        maxSuggestions: true,
      },
```

After:

```ts
      select: {
        id: true,
        name: true,
        email: true,
        preferredLanguage: true,
        maxSuggestions: true,
        reviewerCount: true,
      },
```

(두 함수의 나머지 본문은 무변경.)

#### 4-13. `features/settings/ui/parts/profile/reviewer-count-selector.tsx` — 신규

```tsx
"use client";

import { Button } from "@/components/ui/button";

interface ReviewerCountSelectorProps {
  value: 1 | 2;
  onChange: (value: 1 | 2) => void;
  disabled?: boolean;
}

const OPTIONS = [
  { value: 1, label: "1 Reviewer" },
  { value: 2, label: "2 Reviewers (Verified)" },
] as const;

export default function ReviewerCountSelector({ value, onChange, disabled }: ReviewerCountSelectorProps) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
```

#### 4-14. `features/settings/ui/parts/profile/profile-form.tsx` — 필드 추가

전체 컴포넌트 After (name/email 필드 JSX는 변경 전과 byte 동일하여 마커로 생략):

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { DEFAULT_LANGUAGE } from "../../../constants";
import type { ProfileUpdateInput } from "../../../constants/profile-schema";
import { useUserProfile } from "../../../hooks/use-user-profile";
import LanguageSelector from "./language-selector";
import ReviewerCountSelector from "./reviewer-count-selector";

type ProfileFormState = Required<
  Pick<ProfileUpdateInput, "name" | "email" | "preferredLanguage" | "reviewerCount">
>;

export default function ProfileForm() {
  const { profile, updateMutation } = useUserProfile();
  const { refetch: refetchSession } = useSession();

  const [formState, setFormState] = useState<ProfileFormState | null>(null);

  const getInitialFormState = (): ProfileFormState => ({
    name: profile?.name || "",
    email: profile?.email || "",
    preferredLanguage: profile?.preferredLanguage ?? DEFAULT_LANGUAGE,
    // DB Int 컬럼 방어적 정규화 — 2가 아니면 전부 1로 취급
    reviewerCount: profile?.reviewerCount === 2 ? 2 : 1,
  });

  const currentFormState = formState ?? getInitialFormState();

  const isDirty = formState !== null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateMutation.mutate(
      {
        name: currentFormState.name,
        email: currentFormState.email,
        preferredLanguage: currentFormState.preferredLanguage,
        reviewerCount: currentFormState.reviewerCount,
      },
      {
        onSuccess: async (result) => {
          if (result.success) {
            setFormState(null);
            await refetchSession();
          }
        },
      }
    );
  };

  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ring/3 to-transparent" />

      <CardHeader className="relative z-10">
        <CardTitle className="text-lg font-medium text-foreground">Profile Settings</CardTitle>
        <CardDescription className="font-light text-muted-foreground">Update your profile information</CardDescription>
      </CardHeader>

      <CardContent className="relative z-10">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* ... Full Name 필드 (unchanged) ... */}
          {/* ... Email 필드 (unchanged) ... */}

          <div className="flex flex-col gap-2">
            <label htmlFor="language" className="text-sm font-medium text-secondary-foreground">
              Review Language
            </label>
            <LanguageSelector
              value={currentFormState.preferredLanguage}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...(prev ?? getInitialFormState()),
                  preferredLanguage: value,
                }))
              }
              disabled={updateMutation.isPending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-secondary-foreground">
              Reviewers
            </label>
            <p className="text-xs text-muted-foreground">
              With 2 reviewers, a second reviewer verifies findings before they are posted.
            </p>
            <ReviewerCountSelector
              value={currentFormState.reviewerCount}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...(prev ?? getInitialFormState()),
                  reviewerCount: value,
                }))
              }
              disabled={updateMutation.isPending}
            />
          </div>

          <Button
            type="submit"
            disabled={updateMutation.isPending || !isDirty}
            className="bg-gradient-to-r from-primary to-chart-2 font-medium text-primary-foreground shadow-lg shadow-ring/10 transition-all duration-300 hover:from-primary-hover hover:to-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

#### 4-15. `app/dashboard/reviews/[id]/page.tsx` — 저장 스키마로 파싱

전체 컴포넌트 Before:

```tsx
import { getUserReviewById, ReviewDetail } from "@/features/review";
import { structuredReviewSchema, REVIEW_SCHEMA_VERSION } from "@/features/ai";
import { isValidLanguageCode } from "@/features/settings";
import type { LanguageCode } from "@/shared/types/language";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const review = await getUserReviewById(id);

  if (!review) notFound();

  // 서버 컴포넌트에서 Zod 파싱 — 클라이언트 번들에 Zod 미포함
  let structuredData = null;
  if (review.reviewData && typeof review.reviewData === "object") {
    const raw = review.reviewData as Record<string, unknown>;

    // 스키마 버전 불일치 시 로그 + 마크다운 fallback
    if (raw.schemaVersion !== REVIEW_SCHEMA_VERSION) {
      console.warn(
        `Review ${review.id}: schemaVersion ${raw.schemaVersion} !== ${REVIEW_SCHEMA_VERSION}, falling back to markdown`
      );
    } else {
      const parsed = structuredReviewSchema.safeParse(raw);
      structuredData = parsed.success ? parsed.data : null;
    }
  }

  // langCode 검증 — String 컬럼이므로 잘못된 값이 저장될 수 있음
  const langCode: LanguageCode = isValidLanguageCode(review.langCode)
    ? review.langCode
    : "en";

  return <ReviewDetail review={review} structuredData={structuredData} langCode={langCode} />;
}
```

전체 컴포넌트 After:

**동작 불변식**: `verification` 키가 없는 기존 v2 `reviewData`는 `storedReviewDataSchema`(optional 확장)로도 동일하게 파싱 성공해야 한다.

```tsx
import { getUserReviewById, ReviewDetail } from "@/features/review";
import { storedReviewDataSchema, REVIEW_SCHEMA_VERSION } from "@/features/ai";
import type { StoredReviewData } from "@/features/ai";
import { isValidLanguageCode } from "@/features/settings";
import type { LanguageCode } from "@/shared/types/language";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const review = await getUserReviewById(id);

  if (!review) notFound();

  // 서버 컴포넌트에서 Zod 파싱 — 클라이언트 번들에 Zod 미포함
  // storedReviewDataSchema = structuredReviewSchema + optional verification (구 v2 데이터도 파싱됨)
  let structuredData: StoredReviewData | null = null;
  if (review.reviewData && typeof review.reviewData === "object") {
    const raw = review.reviewData as Record<string, unknown>;

    // 스키마 버전 불일치 시 로그 + 마크다운 fallback
    if (raw.schemaVersion !== REVIEW_SCHEMA_VERSION) {
      console.warn(
        `Review ${review.id}: schemaVersion ${raw.schemaVersion} !== ${REVIEW_SCHEMA_VERSION}, falling back to markdown`
      );
    } else {
      const parsed = storedReviewDataSchema.safeParse(raw);
      structuredData = parsed.success ? parsed.data : null;
    }
  }

  // langCode 검증 — String 컬럼이므로 잘못된 값이 저장될 수 있음
  const langCode: LanguageCode = isValidLanguageCode(review.langCode)
    ? review.langCode
    : "en";

  return <ReviewDetail review={review} structuredData={structuredData} langCode={langCode} />;
}
```

#### 4-16. `features/review/ui/review-detail.tsx` — 검증 패널 렌더

변경 부분 After (Props 타입 확장 + 패널 렌더; 나머지 JSX 무변경):

```tsx
// import 변경 줄만 — 기존 `import type { StructuredReviewOutput } from "@/features/ai";` 줄을
// 아래 StoredReviewData import로 교체한다 (유일한 사용처가 Props 타입이므로 잔존 시 unused import가 된다).
import type { StoredReviewData } from "@/features/ai";
import { VerificationPanel } from "./parts/verification-panel";

interface Props {
  review: ReviewDetailData;
  structuredData: StoredReviewData | null;
  langCode: LanguageCode;
}
```

`StructuredReviewBody`는 `data: StructuredReviewOutput`을 받는데 `StoredReviewData`는 그 구조적 상위 집합(optional 필드 추가)이므로 할당 호환 — `structured-review-body.tsx`는 무변경.

Review Body 카드 아래에 패널 추가 (JSX 변경 부분):

```tsx
      {/* Second Reviewer Verification */}
      {structuredData?.verification && (
        <VerificationPanel
          issues={structuredData.issues}
          verification={structuredData.verification}
          langCode={langCode}
        />
      )}

      {/* Suggestions — 기존 블록 (unchanged) */}
```

#### 4-17. `features/review/ui/parts/verification-panel.tsx` — 신규

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { StoredReviewData, ReviewVerification, VerificationVerdict } from "@/features/ai";
import type { LanguageCode } from "@/shared/types/language";
import { SECOND_REVIEWER_LABELS } from "@/shared/constants";

interface Props {
  issues: StoredReviewData["issues"];
  verification: ReviewVerification;
  langCode: LanguageCode;
}

// REJECTED verdicts never survive into kept findings, so this map omits it.
// (satisfies는 좁은 타입을 유지해 full-union 인덱싱이 불가 — Partial 주석으로 키 검사 + string|undefined 인덱싱)
const VERDICT_STYLE: Partial<Record<VerificationVerdict, string>> = {
  CONFIRMED: "text-green-500",
  UNCERTAIN: "text-muted-foreground",
};

export function VerificationPanel({ issues, verification, langCode }: Props) {
  const labels = SECOND_REVIEWER_LABELS[langCode];

  if (verification.status === "skipped") {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <ShieldAlert className="w-4 h-4" />
          {labels.skipped}
        </CardContent>
      </Card>
    );
  }

  const rejectedCount =
    verification.rejectedIssues.length + verification.rejectedSuggestions.length;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-medium text-foreground">
          <ShieldCheck className="w-5 h-5 text-green-500" />
          {labels.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 생존 이슈별 판정 — verification.issueVerdicts는 issues와 index 정렬 */}
        {issues.length > 0 && (
          <ul className="space-y-1">
            {issues.map((issue, index) => {
              const entry = verification.issueVerdicts[index];
              if (!entry) return null;
              return (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className={`shrink-0 font-mono text-xs ${VERDICT_STYLE[entry.verdict] ?? ""}`}>
                    {entry.verdict}
                  </span>
                  <span className="text-foreground">{issue.title}</span>
                </li>
              );
            })}
          </ul>
        )}

        {/* 걸러진 항목 — 접기 */}
        {rejectedCount > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {labels.excluded} ({rejectedCount})
            </summary>
            <ul className="mt-2 space-y-2 border-l border-border pl-3">
              {verification.rejectedIssues.map((issue, index) => (
                <li key={`issue-${index}`}>
                  <p className="text-foreground line-through">{issue.title}</p>
                  <p className="text-xs text-muted-foreground">{issue.reason}</p>
                </li>
              ))}
              {verification.rejectedSuggestions.map((suggestion, index) => (
                <li key={`suggestion-${index}`}>
                  <p className="text-foreground line-through">
                    {suggestion.file}:{suggestion.line}
                  </p>
                  <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
```

## 5. 실행 순서

### Phase 1: 데이터 모델 + 설정

- 작업: 4-1(schema + 마이그레이션), 4-10, 4-11, 4-12, 4-13, 4-14.
- 마이그레이션 적용 (Neon 드리프트 비파괴 절차 — `migrate dev` 금지):
  ```bash
  # 1. prisma/migrations/20260717000000_add_reviewer_count/migration.sql 수동 생성 (4-1의 SQL)
  # Prisma 7: db execute는 --schema/--url 옵션 없이 prisma.config.ts에서 datasource를 읽는다
  npx prisma db execute --file prisma/migrations/20260717000000_add_reviewer_count/migration.sql
  npx prisma migrate resolve --applied 20260717000000_add_reviewer_count
  npx prisma generate
  ```
- 검증: `npm run build` 통과. 설정 페이지에서 Reviewers를 2로 저장 → 새로고침 후 2 유지 확인 (DB 왕복).

### Phase 2: 검증 엔진 (파이프라인 미연결)

- 작업: 4-2, 4-3, 4-4, 4-5, 4-6 + `features/ai/lib/verify-review.test.ts` (§8 코드).
- 검증: `npm run test` 통과 (파티션 불변식), `npm run build` 통과. 이 시점에는 런타임 동작 변화 없음 (export만 추가).

### Phase 3: 파이프라인 통합

- 작업: 4-7, 4-8, 4-9.
- 검증: `npm run dev` + `npm run inngest-dev` + `npm run ngrok`로 로컬 기동.
  - `reviewerCount=1` 사용자로 테스트 PR 리뷰 트리거 → GitHub 코멘트가 기존과 동일하고 Inngest 대시보드에 `second-reviewer-verify` 스텝이 null 반환하는지 확인.
  - `reviewerCount=2`로 변경 후 재트리거 → 리뷰 본문 상단 trace 1줄, CONFIRMED 인라인 이슈 배지, PR Conversation 탭의 "🛡️ Second Reviewer" 별도 리뷰 엔트리(판정 목록 + 제외 접기), `reviewData.verification` 블록 저장 확인.

### Phase 4: 대시보드 노출

- 작업: 4-15, 4-16, 4-17.
- 검증: Phase 3에서 생성된 리뷰 상세 페이지에서 검증 패널(판정 목록 + 걸러진 항목 접기) 렌더 확인. `verification` 없는 과거 리뷰 상세가 기존과 동일하게 렌더되는지 확인 (회귀 체크).

## 6. 영향 범위

- **직접 수정 대상**: §4의 수정 파일 15개(4-1~4-3, 4-5~4-12, 4-14~4-16 — 4-6은 barrel 2개 파일) + 신규 파일 5개(4-4, 4-13, 4-17, 테스트, 마이그레이션 SQL).
- **import 변경 필요**: `inngest/functions/review.ts`, `features/review/lib/pr-review.ts`, `app/dashboard/reviews/[id]/page.tsx`, `features/review/ui/review-detail.tsx`, `features/settings/ui/parts/profile/profile-form.tsx`.
- **외부 의존성**: 신규 패키지 없음. `ai`(generateText/Output), `@ai-sdk/google`, `zod`, `vitest` 모두 기존 의존성. `gemini-2.5-pro`는 기존 `GOOGLE_GENERATIVE_AI_API_KEY`로 호출 — 환경 변수 추가 없음.
- **소비자/사용처 영향** (grep으로 역검색 확인):
  - `structuredReviewSchema` 소비자 2곳: `inngest/functions/review.ts`(LLM 출력 검증 — **유지**, 검증자에게 verification 필드를 생성시키면 안 되므로 확장하지 않음), `app/dashboard/reviews/[id]/page.tsx`(→ `storedReviewDataSchema`로 교체).
  - `StructuredReviewOutput` 소비자: `review-detail.tsx`(Props 타입 → `StoredReviewData`로 확장), `structured-review-body.tsx`(구조적 할당 호환 — 무변경), `review-formatter.ts`(무변경).
  - `reviewPullRequest` 소비자 1곳: `app/api/webhooks/github/route.ts:195` — 무변경 (`reviewerCount`는 액션 내부에서 조회).
  - `pr.review.requested` 이벤트 소비자 1곳: `inngest/functions/review.ts` — 4-8에서 수정.
  - `Suggestion`/`ReviewIssue` 행 소비자(원클릭 적용, `detectRepeatIssues` 후보 쿼리, `reconcile-issue-resolutions.ts`): 생존 항목만 행으로 생성되므로 **무변경**. REJECTED 이슈는 행이 없어 반복 감지 후보·해결 추적에서 자연히 제외된다(의도된 동작 — 오탐이 반복 배지 후보가 되면 안 됨).
  - 위 목록은 import-graph + 심볼/이벤트 문자열 grep 기준이며, 동적 참조(리플렉션 등)는 별도로 열거하지 않았다 — 이 코드베이스에서 해당 패턴은 관찰되지 않았다.
- **generate-pr-summary(SUMMARY 경로)**: 무변경 — 검증은 `generateReview` 파이프라인에만 삽입된다.

## 7. 리스크 + 롤백 전략

### 리스크

1. **과잉 REJECT로 true positive 손실** (중간 확률 / 높은 영향): 보수적 프롬프트("의심스러우면 UNCERTAIN")와 REJECTED 항목의 대시보드 열람으로 감사 가능하게 완화. 프롬프트 실효성은 런타임에서만 확인 가능 — Phase 3 수동 테스트에서 판정 분포 관찰.
2. **검증자가 고무도장(전부 CONFIRMED/UNCERTAIN)** (중간 / 중간): 기능 무가치화. 모델을 flash가 아닌 pro로 분리한 이유. 관찰 후 프롬프트 반복 개선.
3. **Neon 마이그레이션 드리프트** (확실 / 높음): `migrate dev` 실행 시 DB 리셋 요구 — Phase 1의 `db execute` + `migrate resolve` 절차 필수. `next-build`/`vercel-build`의 `prisma migrate deploy`는 resolve된 마이그레이션을 skip하므로 배포 안전.
4. **reviewData 크기 증가** (낮음 / 낮음): REJECTED 항목 + 사유가 JSON에 추가되나 `Json` 컬럼이라 스키마 제약 없음.
5. **파싱 회귀** (낮음 / 높음): `storedReviewDataSchema`가 구 데이터를 거부하면 과거 리뷰가 마크다운 fallback으로 강등 — `verification`이 optional이므로 이론상 안전하며 Phase 4에서 과거 리뷰로 회귀 확인.
6. **검증 LLM 지연으로 리뷰 총 소요 증가** (확실 / 낮음): pro 모델 1회 호출 추가. 비동기(Inngest) 파이프라인이라 사용자 대기 UX에는 영향 제한적.
7. **`second-reviewer-verify` 스텝에서 catch로 Inngest 재시도 비활성화** (설계 선택): 기존 `detect-repeat-issues`와 동일한 fail-open 패턴. AI SDK `generateText`의 자체 재시도에 의존.
8. **2차 리뷰 엔트리 게시 실패** (낮음 / 낮음): Step 6.5는 1차 게시와 독립된 try/catch — 실패해도 1차 리뷰·DB 저장에 영향 없음(엔트리만 누락, trace 1줄과 대시보드 패널은 유지). 같은 계정 명의라 아바타/이름이 1차 리뷰와 동일한 것은 수준 1 설계의 의도된 한계(봇 정체성은 비목표).

### 롤백 전략

- **코드 롤백**: 4-7/4-8/4-9 revert만으로 검증 스텝이 제거되고 파이프라인이 현행으로 복귀한다. `reviewerCount` 컬럼과 설정 UI는 잔존해도 무해(참조 없으면 no-op).
- **데이터 롤백 불필요**: 이미 저장된 `reviewData.verification` 블록은 롤백된 코드의 `structuredReviewSchema.safeParse`에서 unknown key로 strip되어 기존 렌더링이 그대로 동작한다.
- **마이그레이션 롤백**: 필요 시 `ALTER TABLE "user" DROP COLUMN "reviewerCount";`를 `db execute`로 적용. 리뷰·사용자 핵심 데이터에는 영향 없으나, 사용자가 저장한 reviewerCount 설정값은 소실된다(재설정 필요).

## 8. 검증 전략

- **기존 테스트**: `lib/github/diff-parser.test.ts` 1개 (vitest, 소스 colocation, 불변식 기반 단언 — `npm run test`로 실행). diff 파서 외 영역의 회귀는 수동 확인에 의존.
- **추가 테스트**: `features/ai/lib/verify-review.test.ts` — `applyVerification` 파티션 불변식. 경로·스타일은 기존 `lib/github/diff-parser.test.ts`(vitest + 소스 colocation + 불변식 단언)와 `vitest.config.ts`의 `include: ["**/*.test.ts"]`를 미러링한다.
  - 참고: 테스트가 import하는 `verify-review.ts`는 top-level에서 `ai`/`@ai-sdk/google`을 import한다. 두 패키지 모두 import 시점에 API 키를 요구하지 않으므로(키는 모델 호출 시점에 읽음) node 환경 테스트에서 안전할 것으로 예상되나, 만약 import 시점 오류가 발생하면 순수 함수(`applyVerification`, `buildVerificationTrace`)를 별도 모듈로 분리해 테스트한다.

```ts
import { describe, expect, it } from "vitest";
import { applyVerification } from "./verify-review";
import type { VerificationResult } from "./verify-review";
import type { StructuredReviewOutput } from "./review-schema";
import type { CodeSuggestion, StructuredIssue } from "../types";

function makeIssue(title: string): StructuredIssue {
  return {
    file: "src/a.ts", line: 1, title, body: `${title} body`,
    impact: "", recommendation: "", severity: "WARNING", category: "bug",
  };
}

function makeSuggestion(file: string): CodeSuggestion {
  return {
    file, line: 1, before: "a", after: "b",
    explanation: "why", severity: "SUGGESTION",
  };
}

function makeOutput(issues: StructuredIssue[], suggestions: CodeSuggestion[]): StructuredReviewOutput {
  return {
    summary: { overview: "o", riskLevel: "low", keyPoints: [] },
    walkthrough: null, strengths: [], sequenceDiagram: null,
    issues, suggestions,
  };
}

describe("applyVerification", () => {
  const output = makeOutput(
    [makeIssue("i0"), makeIssue("i1"), makeIssue("i2")],
    [makeSuggestion("s0.ts"), makeSuggestion("s1.ts")],
  );

  const result: VerificationResult = {
    status: "verified",
    issueVerdicts: [
      { verdict: "CONFIRMED", reason: "" },
      { verdict: "REJECTED", reason: "guard exists" },
      { verdict: "UNCERTAIN", reason: "" },
    ],
    suggestionVerdicts: [
      { verdict: "REJECTED", reason: "wrong before" },
      { verdict: "UNCERTAIN", reason: "" },
    ],
  };

  it("REJECTED만 제거하고 나머지는 순서 유지로 분할한다 (파티션 불변식)", () => {
    const applied = applyVerification(output, result);
    expect(applied).not.toBeNull();

    // 파티션: kept + rejected = 입력 전체 (no-computation identity)
    expect(applied!.keptOutput.issues.length + applied!.rejectedIssues.length)
      .toBe(output.issues.length);
    expect(applied!.keptOutput.suggestions.length + applied!.rejectedSuggestions.length)
      .toBe(output.suggestions.length);

    // REJECTED만 rejected로, 순서 보존 (shown 구현의 filter 의미론에서 직접 도출)
    expect(applied!.keptOutput.issues.map((i) => i.title)).toEqual(["i0", "i2"]);
    expect(applied!.rejectedIssues.map((i) => i.title)).toEqual(["i1"]);
    expect(applied!.keptIssueVerdicts.every((v) => v.verdict !== "REJECTED")).toBe(true);

    // kept 판정 배열은 keptOutput.issues와 길이 정렬
    expect(applied!.keptIssueVerdicts.length).toBe(applied!.keptOutput.issues.length);
    expect(applied!.keptSuggestionVerdicts.length).toBe(applied!.keptOutput.suggestions.length);
  });

  it("검증 미실행(null)/생략(skipped)이면 null을 반환한다 (fail-open passthrough)", () => {
    expect(applyVerification(output, null)).toBeNull();
    expect(
      applyVerification(output, { status: "skipped", issueVerdicts: [], suggestionVerdicts: [] }),
    ).toBeNull();
  });

  it("verdict 누락 index는 UNCERTAIN으로 유지된다 (보수적 기본값)", () => {
    const partial: VerificationResult = {
      status: "verified",
      issueVerdicts: [{ verdict: "REJECTED", reason: "x" }], // index 1, 2 누락
      suggestionVerdicts: [],
    };
    const applied = applyVerification(output, partial);
    expect(applied!.keptOutput.issues.map((i) => i.title)).toEqual(["i1", "i2"]);
    expect(applied!.keptIssueVerdicts.every((v) => v.verdict === "UNCERTAIN")).toBe(true);
  });
});
```

- **타입/빌드 검증**: `npm run build` (`next build` — 각 Phase 종료 시). `npm run lint`.
- **수동 확인** (Phase 3~4 상세는 §5):
  1. `reviewerCount=1` 리뷰 → GitHub 코멘트 byte-수준 현행 동일 여부.
  2. `reviewerCount=2` 리뷰 → trace 1줄 + CONFIRMED 배지 + 별도 2차 리뷰 엔트리(Conversation 탭) + 대시보드 패널.
  3. `GOOGLE_GENERATIVE_AI_API_KEY`를 일시적으로 잘못된 값으로 바꿔 검증 실패 유도 → 리뷰 정상 게시 + 패널 "생략됨" 확인 (fail-open). ⚠️ 이 방법은 1차 리뷰 생성도 실패시키므로, 실제로는 `verifySecondReviewer` 내부에 임시 `throw`를 넣는 방식이 더 정확하다.
  4. 과거(기능 배포 전) 리뷰 상세 페이지 렌더 회귀 확인.

---

<!-- doc-validation-skip -->
## Open Questions

- **[리스크 1·2]** 검증 프롬프트의 REJECTED 판정 실효성(오검출률·고무도장 여부)은 정적으로 검증 불가 — Phase 3 수동 테스트에서 실제 PR 3~5건으로 판정 분포를 관찰한 뒤 프롬프트를 조정할 것을 제안.

<!-- doc-validation-restore -->
