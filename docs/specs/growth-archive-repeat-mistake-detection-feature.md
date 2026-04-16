# Design: Growth Archive + Repeat Mistake Detection

Generated on 2026-04-16
Branch: develop
Repo: Sangeok/hreviewer
Status: APPROVED
Mode: Startup

## Problem Statement

hreviewer는 기능은 쌓여 있지만 "누구의 어떤 pain을 어떻게 푸는가"가 흐릿한 상태. 현재 specs 폴더에 14개 넘는 기능 아이디어가 TODO로 쌓여 있고, 결제는 비활성화, 사용자 0명. 이 상태에서 기능을 더 추가해도 시장에서 의미 있는 자리를 못 잡는다. 경쟁자(CodeRabbit, Greptile, Qodo, Cursor BugBot, Graphite Diamond)가 포화 상태인 팀용 코드 리뷰 SaaS 시장에서 정면 승부는 불가능.

문제 재정의: **"혼자 개발할 때 리뷰해줄 시니어가 없는 사람"**을 위한 AI 시니어 멘토 포지션으로 제품을 다시 세운다. 첫 기능은 이 포지션을 가장 뾰족하게 증명하는 것.

## Demand Evidence

현재는 외부 사용자 demand 증거 없음. 대신 내부 신호 2개:

1. **1인 개발자 self pain (founder가 본인 경험 고백)**: "혼자 개발할 때 리뷰해줄 사람이 없다"는 founder 본인의 pain이 제품 시작점. 이건 demand 증거 중에선 약한 편이지만, false positive 위험이 낮다.

2. **부분 해결 중인 status quo 존재**: Cursor, Claude Code, ChatGPT 복붙 리뷰. 즉 시장은 이미 이 pain을 해결하려고 돈/시간을 쓰고 있음. 0 → 1 수요 증명이 필요한 상태는 아님. status quo 대비 차별적 가치만 증명하면 됨.

**부족한 것**: 실제 1인 개발자 3~5명에게 "지금 Cursor로 리뷰받는데 뭐가 아쉬운가?" 인터뷰. 이 인터뷰 없이 만드는 건 founder 자기 가설 검증이지 시장 검증이 아님. → The Assignment 섹션 참고.

## Status Quo

현재 1인 개발자가 코드 리뷰를 받는 방법:

- **Cursor/Claude Code에 복붙**: 변경 diff 또는 특정 파일만 붙여넣고 "리뷰해줘" → 즉시 답. 세션 단위라 반복 실수 추적 안 됨.
- **ChatGPT 웹**: 복붙. 모델은 코드베이스 전체 모름. 세션 끝나면 히스토리 날아감.
- **GitHub Copilot Review**: PR에 자동 리뷰. 변경분만 보고, 프로젝트 맥락 약함.
- **Linter + Type checker**: 정적 규칙 기반. 설계/네이밍/패턴 일관성 지적 못 함.

대부분은 **Cursor + Linter 조합**으로 해결. 이 조합이 **진짜 경쟁자**. CodeRabbit이 아님.

Cursor가 못 하는 2가지:

1. 세션 reset → 같은 실수를 두 번째로 해도 알 수 없음
2. 변경분만 보고 답해서 "이 함수 비슷한 거 2개 파일에 이미 있다" 같은 코드베이스 전체 지적 불가

## Target User & Narrowest Wedge

**타겟**: 리뷰해줄 시니어가 없는 개발자.

- 사이드 프로젝트 / 인디해커 / 혼자 SaaS 만드는 사람
- 주니어이지만 독학하거나 팀 내에 시니어가 없는 사람
- 초기 스타트업 1~3인 엔지니어 팀

**아닌 타겟** (이번 버전에서는):

- 10명 이상 엔지니어 팀 (CodeRabbit/Greptile 영역)
- 엔터프라이즈 컴플라이언스 중심 (보안 스캔 SaaS 영역)
- 팀 워크플로우 통합 필요한 곳 (Graphite 영역)

**Narrowest wedge**: **"같은 실수 지난 PR에서도 지적했는데 또 하고 있어요"** 알림이 PR 리뷰 코멘트에 붙는다. 이 한 feature만 돌아가도 제품의 존재 이유가 생긴다. 대시보드, 분석 리포트 같은 건 v1에서 포기.

## Constraints

- **Solo 개발 리소스**. feature scope 크게 잡으면 ship 못 함.
- **결제 시스템 꺼져 있음**. monetization은 별도 트랙. 이번 feature는 무료로 돌리면서 사용자 반응 보는 단계.
- **기존 인프라 재사용 필수**. Prisma `Review` 테이블, Pinecone 임베딩 파이프라인(`module/ai/lib/rag.ts`), Inngest 백그라운드 잡, Better-Auth 그대로 올라탐. 새로운 인프라 도입 안 함.
- **한국어 리뷰 이미 지원**. 포지셔닝상 한국/한국어 개발자 friction 낮음.

## Premises

1. 타겟은 1인 개발자, 사이드 프로젝트, 소규모 초기 스타트업 개발자다. 엔터프라이즈 팀 시장은 이번 버전에서 포기한다.
2. hreviewer의 차별화 한 줄은 "코드베이스 전체 맥락 + 리뷰 누적 히스토리"다. Cursor/Claude가 변경분만 보고 세션 단위로 리셋되는 것과 정반대.
3. 기능 선정 기준은 "이 타겟의 pain을 더 뾰족하게 해결하는가." 종합 리뷰 완성도 경쟁 안 함.
4. 팀 협업 기능, 엔터프라이즈 보안 컴플라이언스, 커스텀 룰 정교화 같은 건 이번 track에서 빼놓는다.

User 동의: O (2026-04-16).

## Approaches Considered

### Approach A: 성장 아카이브 + 반복 실수 감지 (선택)

- v1은 tagging + repeat detection + inline PR 코멘트 flag만. 대시보드는 v1.1로 미룸.
- 2~4주 내 v1 ship. 기존 인프라 재사용. 차별화 포인트 명확.
- 리스크 낮음. "반복 실수 감지" 품질이 유일한 기술적 위험 → calibration phase에서 관리.

### Approach B: 개인 지식그래프 기반 시니어 멘토

- 장기적으로 제일 큰 moat. 사용자별 컨텍스트 벡터스토어를 별도로 유지, 오래 쓸수록 점점 더 맞춤화되는 AI 멘토.
- 6~10주 예상. Cold start 문제. 증명 지표 애매함.
- **지금은 포기**. 단, **Approach A의 `user:{userId}:issues` Pinecone namespace가 Approach B의 foothold**다. A의 반복 감지가 잘 돌아가면 그 데이터를 넓혀서 B로 확장 가능.

### Approach C: Pre-PR 실시간 리뷰 (CLI/extension)

- Cursor status quo 정면 돌파. CLI 또는 VSCode extension으로 PR 없이도 리뷰받게.
- 재밌지만 scope 큼. Cursor와 직접 경쟁은 자원 싸움에서 이길 수 없음.
- **지금은 포기**. 제품 증명 이후 2차 확장으로 고려.

## Recommended Approach

**Approach A v1: 카테고리 태깅 + 반복 실수 감지 + 인라인 PR 코멘트 flag**

핵심 가치 한 줄: **"혼자 개발해도 같은 실수 또 하지 않게 잡아주는 AI 시니어."**

v1에서 제외되는 것: 성장 대시보드(통계, 추이 차트, Top N), 월별 리포트. → v1.1에서 데이터 쌓이고 사용자가 요구하면 추가.

### 0. 용어 정의

- **Issue** = PR 리뷰에서 AI가 생성한 단일 지적. 카테고리 1개, 코드 범위(file + line 또는 null), 텍스트를 가진다. 기존 리뷰 출력은 suggestion과 inline comment로 나뉘어 있는데, v1에서는 이 둘을 `ReviewIssue` 행 **하나당 하나**로 저장한다. 매핑 기준: **suggestion = file-level** (`filePath` 채우고 `lineStart/lineEnd` null), **inline comment = line-level** (`filePath` + `lineStart/lineEnd` 다 채움). 1 Issue = 1 row 원칙.

### 1. Issue 카테고리 자동 태깅

v1 카테고리 = **5개 실질 카테고리 + `other` fallback = 6개 enum 값**:

- `naming` - 네이밍 일관성, 변수/함수명
- `error-handling` - 에러 처리, try/catch, Result 패턴
- `type-safety` - any 사용, 타입 guard, null 체크
- `duplication` - 중복 코드, DRY 위반
- `readability` - 복잡도, 가독성, 네스팅
- `other` - 위에 해당 안 되는 것 (fallback)

5개로 시작하는 이유: 태깅 정확도 쉽게 70%+ 낼 수 있고, 3개월 데이터 쌓인 뒤 세분화해도 늦지 않음. 9개는 over-engineering.

**LLM 프롬프트 변경**:
- 기존 리뷰 생성 프롬프트에 "각 issue에 위 6개 카테고리 중 **정확히 하나** 태그하라"는 지시 추가.
- 출력 Zod 스키마: `category: z.enum(['naming', 'error-handling', 'type-safety', 'duplication', 'readability', 'other'])`.
- 유효성 실패 시 `other`로 fallback, 로그.

**카테고리 정확도 벤치마크** (ship 전 1회, 이후 프롬프트 바뀔 때마다):
- 10개 PR을 손으로 리뷰 돌리고, 결과 issue 각각 카테고리 라벨링.
- LLM이 뽑은 카테고리 vs 사람 라벨 비교. 70% 일치가 ship 기준.
- 벤치마크 fixture를 `test/fixtures/category-tagging/` 에 커밋. CI에서 리뷰 생성 프롬프트 변경 시 회귀 체크.

### 2. 반복 실수 감지 (the wedge)

**감지 로직 (category-primary + embedding-secondary)**:

1. 새 PR 리뷰 생성 후, 각 Issue에 대해:
   - `userId`와 `category`가 같은 과거 Issue 중 `createdAt > now - 90d`인 것들을 DB에서 조회 (Pinecone 아님, Postgres).
   - 과거 Issue가 0개면 **repeat 후보 없음**. 건너뜀.
2. 후보가 1개 이상이면 embedding 기반 유사도 체크:
   - 현재 Issue 텍스트 + 코드 스니펫을 임베딩.
   - 같은 `(userId, category)` namespace의 과거 Issue 임베딩과 cosine similarity 계산 (Pinecone query, top-5).
   - similarity ≥ **threshold** 가 있으면 repeat로 판정.
3. repeat 판정 시 PR 리뷰 코멘트에 `⚠️ 반복 지적` 배지 + "지난 [PR #N - 제목]에서도 같은 지적이 있었어요" 링크 첨부.

**threshold는 calibration phase에서 결정** (지금 코드에 0.85 하드코딩 안 함):
- ship 전에 샘플 30쌍 (same-mistake 15, different-mistake 15) 손 라벨링.
- cosine 0.70~0.95 범위에서 precision/recall 그려보고, false positive ≤ 20% 되는 가장 낮은 threshold 선택.
- 결정된 threshold는 env var로 빼서 튜닝 가능하게.

**embedding 타겟 템플릿** (결정):
```
[category] {category}
[issue] {issue_text}
[code] {code_snippet[:500]}
```
한 번에 한 Issue당 한 embedding 호출. 토큰 truncation은 code snippet 500자 cut으로 처리.

**Pinecone namespace**: `user:{userId}:issues`. 인덱스는 기존 `hreviewer` 그대로.

**에러 처리 (best-effort)**:
- Pinecone 또는 embedding API 실패 시 repeat detection 스킵하되, 리뷰 자체는 정상 생성되어야 함.
- 실패는 Inngest 재시도 없이 로그만 남김 (`console.warn` 또는 observability hook).
- 사용자는 에러를 보지 않음. `REPEATED_ISSUE` flag 없는 일반 리뷰로 나감.

**셀프 제외**: 같은 PR 내에서 생성된 Issue는 과거 Issue로 취급 안 함 (`reviewId != currentReviewId` 필터).

### 3. PR 코멘트 내 인라인 flag (유일한 UI 변경)

- repeat로 판정된 Issue 옆에 `⚠️ 반복 지적` 배지 렌더.
- 배지 누르면 hreviewer 웹 대시보드의 과거 리뷰 페이지로 이동 (기존 페이지 재사용).
- 대시보드에 신규 페이지 추가 안 함. v1에서는 없음.

### 4. Cold-start UX 결정

- 신규 유저 첫 PR: `ReviewIssue` 행 0개 → repeat 후보 없음 → flag 아예 안 뜸. 빈 상태 UI 불필요.
- 두 번째 PR부터 매칭 로직 동작. 2~3회 PR부터 자연스럽게 작동.
- v1에서는 "성장 아카이브" 문구 노출 안 함. 순수하게 repeat detection 한 feature로만 팔아봄.

## Data Model (Prisma)

`prisma/schema.prisma` 추가:

```prisma
model ReviewIssue {
  id          String   @id @default(cuid())
  reviewId    String
  review      Review   @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  repositoryId String?
  repository  Repository? @relation(fields: [repositoryId], references: [id], onDelete: SetNull)

  category    String   // enum values: naming | error-handling | type-safety | duplication | readability | other
  text        String   @db.Text
  codeSnippet String?  @db.Text
  filePath    String?
  lineStart   Int?
  lineEnd     Int?

  isRepeat         Boolean  @default(false)
  matchedIssueId   String?  // repeat 판정 시 매칭된 과거 Issue의 id
  matchedIssue     ReviewIssue? @relation("IssueRepeats", fields: [matchedIssueId], references: [id], onDelete: SetNull)
  repeatedBy       ReviewIssue[] @relation("IssueRepeats")

  createdAt   DateTime @default(now())

  @@index([userId, category, createdAt])
  @@index([reviewId])
}
```

`Review`와 `User`, `Repository` 모델에 역방향 relation 추가 필요.

**마이그레이션 이름**: `add_review_issue_categorization`.

## Open Questions

1. **기존 Review 백필**: 이미 DB에 쌓인 과거 Review들의 issue를 `ReviewIssue`로 역생성할지. v1은 **안 함**. 과거 리뷰는 재처리 비용 크고 가치 불투명. 신규 리뷰부터 누적.
2. **결제 타이밍**: v1은 무료. 사용자 5명 확보 + repeat detection 반응 확인 후 Pro 재활성화. 결제 feature는 이 spec과 분리.
3. **category fallback 품질**: `other` 비율이 20% 넘으면 카테고리가 부족하다는 신호. 모니터링만 하고, 초과 시 v1.1에서 카테고리 추가.

## Success Criteria

이번 feature 성공 여부 판단 기준. **순서는 The Assignment → build → ship → 반응 측정**:

1. **Pre-build gate** (인터뷰 5명): 1인 개발자 5명 인터뷰 중 3명 이상이 "같은 실수 지난번에도 지적했어요 알림이 있으면 쓸 것 같다"고 답해야 build 승인. 여기서 3명 미만이면 feature 재설계 또는 Approach 재선택.
2. **Ship 기준** (build → ship): 2~4주 내 main 배포. 카테고리 태깅 정확도 70%+ (10 PR 벤치마크). Repeat detection false positive ≤ 20% (30쌍 calibration).
3. **Post-ship 반응** (ship 후 4주 내): 타겟 유저 5명 이상에게 설치/사용 요청. 그 중 3명 이상이 실제로 "반복 지적" 배지를 본 경험 있음. 1명 이상이 "오 이건 Cursor는 못 하네"류 반응 → 차별화 증명.
4. **Kill criteria**: repeat detection false positive 30% 이상 또는 반응 측정 시 5명 중 0명이 가치 못 느끼면 feature kill. Approach 재검토.

매출/전환 지표는 아직 목표 아님. **"이 product direction이 맞는가"** 증명이 목표.

## Distribution Plan

기존 배포 파이프라인 활용. 별도 패키지/릴리스 필요 없음.

- **웹 앱**: Vercel 기존 파이프라인 (main merge → auto deploy).
- **DB 마이그레이션**: `npx prisma migrate dev --name add_review_issue_categorization` → PR에서 migration 파일 review → merge → prod에서 `npx prisma migrate deploy`.
- **Pinecone namespace**: 런타임에 `user:{userId}:issues` namespace upsert. 기존 인덱스 그대로.
- **Config**: similarity threshold, category list, embedding truncation 길이는 env var 또는 `lib/config.ts`에 모음.
- **onboarding**: 기존 로그인/repo 연결 플로우 변경 없음. 새 사용자는 첫 PR 리뷰부터 자동 태깅, 두 번째부터 repeat 검사.

CI/CD: 기존 GitHub Actions 그대로. 카테고리 태깅 회귀 체크 fixture 추가.

## Dependencies

- **기존 인프라**: Review 테이블 (Prisma), Pinecone 클라이언트 (`module/ai/lib/rag.ts`), AI 리뷰 생성 (`module/review/`), Inngest 백그라운드 잡.
- **LLM 프롬프트 변경**: Zod 스키마 업데이트, 출력에 `category` 추가.
- **차단 요소 없음**. 외부 API 추가 없고, 새 벤더 붙이지 않음.

관련 기존 specs 중 이번 feature에 녹는 것:

- `review-analytics-dashboard.md` (v1에서는 미흡수. v1.1 후보).
- `adaptive-learning-feedback.md` (반복 실수 감지 부분만 v1 흡수).

**Performance/Cost 노트**: 20-issue PR 기준 embedding + Pinecone query 최대 40 round-trips. 리뷰 생성 시간 ~2~5s 증가 예상. **구현 주의**: Google AI embedding API는 배열 입력(batch) 지원. 20개 Issue를 **serial loop 말고 단일 batch 호출**로 임베딩해야 함. Pinecone query도 top-k batch 가능. 이 두 개만 지키면 실제 추가 지연은 ~1-2s로 떨어진다. free tier에선 무시 가능, 유료 전환 시점에 추가 최적화.

## The Assignment

**이번 주 안에 이거 하나만 해라. 코드는 한 줄도 치지 말고**:

1인 개발자 5명에게 이 message 보내라 (친구, 커뮤니티, 트위터 DM 어디든):

> "나 혼자 개발할 때 코드 리뷰받는 방법 리서치 중이야. 지금 Cursor/Claude로 리뷰받고 있는 사람이면 5분만 얘기 나눌 수 있어? 뭐가 아쉬운지, 뭐를 더 바라는지."

받아낼 것 3개:

1. 지금 어떻게 리뷰받고 있는가 (정확한 툴, 워크플로우)
2. **가장 최근에 "아 이거 누가 봐줬으면" 느꼈던 순간** (구체적 사례)
3. "같은 실수 지난번에도 지적했어요" 알림 오는 도구가 있으면 쓸 것 같은가

5명 인터뷰 끝내고, 3명 이상이 3번 질문에 yes 하면 그때 Approach A v1 구현 시작. 3명 미만이면 spec 다시 씀. 인터뷰 스킵하고 바로 코드 치면 자기 가설 검증하러 혼자 터널 들어가는 거다 (지난 6개월 specs 14개 쌓인 것처럼).

이게 spec 15번째 아니라 실제로 살아있는 기능으로 바뀌는 유일한 방법이다.

## What I noticed about how you think

본인이 직접 말한 대답들:

- **"아직 사용자 없음"** → 인정하는 걸 어려워하지 않음. 많은 founder가 이 단계에서 "친구들이 관심있어 해요"로 대답함. 거짓말 안 한 게 이 세션 품질을 결정함.
- **"혼자 개발할 때 리뷰해줄 사람이 없음"** → product 시작점이 founder 본인의 pain에서 온다는 걸 숨기지 않음. 이건 실제로 best case. 이걸 잊지 말고 계속 이 사용자에 맞춰서 타협 없이 뾰족하게 가라.
- **"코드베이스 전체를 보고 리뷰한다"** → 처음 "타겟 유저가 누군가" 질문엔 모르겠다고 했는데, "왜 Cursor 대신 이거 쓰냐"에는 즉답 나옴. feature 관점으로는 이미 생각을 많이 해봤음. 반대로 유저/비즈니스 관점 사고가 상대적으로 덜 훈련됐을 가능성. 다음 3개월은 코드 치는 시간 절반, 잠재 유저 만나서 얘기 듣는 시간 절반 비율로 가는 게 좋겠음.
- **specs 14개 쌓인 상태** → 기능 아이디어가 부족한 사람이 아니라 넘쳐서 고르지 못하는 사람. 이건 "무엇을 할지"보다 "무엇을 하지 않을지"를 결정하는 훈련이 더 필요하다는 신호.

---

> **Implementation details**: 2026-04-17 grilled session 에서 lock 한 11개 구현 결정(Q0-Q5, Q6-1~Q6-6) 은 [growth-archive-repeat-mistake-detection-implementation.md](./growth-archive-repeat-mistake-detection-implementation.md) 참조.
