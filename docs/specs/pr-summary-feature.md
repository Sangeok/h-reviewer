# PR Summary Feature Implementation Guide(완료)

## Overview

GitHub PR 댓글로 `/hreviewer summary` 명령어를 입력하면 AI가 **코드베이스 컨텍스트(RAG)**를 활용하여 해당 PR의 내용을 간결하게 요약해주는 기능의 구현 가이드입니다.

**핵심 특징:**

- ✅ RAG 사용 (Pinecone 벡터 검색, topK: 3)
- ✅ 기존 코드베이스와의 연관성 분석
- ✅ 빠른 실행 (20-25초)
- ✅ 간결한 포맷 (~200 words)

---

## Architecture

### Event Flow

```
GitHub PR Comment ("/hreviewer summary")
       ↓
GitHub Webhook (issue_comment event)
       ↓
POST /api/webhooks/github
       ↓
parseCommand() → 명령어 파싱
       ↓
generatePRSummary() → Inngest 이벤트 발송
       ↓
Inngest: generateSummary()
  ├─ Step 1: fetch-pr-data (PR diff, title, description 조회)
  ├─ Step 2: generate-ai-summary
  │   ├─ RAG: searchSimilarCode() - Pinecone에서 관련 코드 검색 (topK: 3)
  │   └─ Gemini로 요약 생성 (코드베이스 컨텍스트 포함)
  ├─ Step 3: post-comment (GitHub PR에 댓글 게시)
  └─ Step 4: save-summary (DB에 저장)
```

### Key Components

| Component        | File Path                           | Purpose                            |
| ---------------- | ----------------------------------- | ---------------------------------- |
| Database Schema  | `prisma/schema.prisma`              | **CRITICAL**: ReviewType enum 정의 |
| Command Parser   | `module/ai/utils/command-parser.ts` | 댓글에서 명령어 파싱               |
| Summary Action   | `module/ai/actions/summary.ts`      | Inngest 이벤트 발송                |
| Inngest Function | `inngest/functions/summary.ts`      | 백그라운드 요약 생성 (RAG 포함)    |
| Webhook Handler  | `app/api/webhooks/github/route.ts`  | GitHub 웹훅 수신                   |

### Full Review vs Summary 비교

| 항목        | Full Review               | Summary                    |
| ----------- | ------------------------- | -------------------------- |
| 트리거      | PR opened/synchronized    | 사용자 댓글 명령어         |
| RAG Context | 사용 (Pinecone, topK: 10) | 사용 (Pinecone, topK: 3-5) |
| 프롬프트    | 상세 분석 요청            | 간결한 요약 요청           |
| 분량        | ~500+ words               | ~200 words                 |
| 실행 시간   | ~30초                     | ~20-25초                   |

---

## Implementation Steps

### Step 0: Database Schema Migration

**CRITICAL: 다른 단계 진행 전에 반드시 먼저 실행**

#### 0-1. Prisma Schema 수정

**File:** `prisma/schema.prisma`

**추가할 내용:**

```prisma
// Review 모델 위에 enum 추가
enum ReviewType {
  SUMMARY
  FULL_REVIEW
}

// Review 모델 수정
model Review {
  id           String     @id @default(cuid())
  repositoryId String
  prNumber     Int
  prTitle      String
  prUrl        String
  review       String     @db.Text
  reviewType   ReviewType @default(FULL_REVIEW) // 이 줄 추가
  status       String
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  repository Repository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)

  @@index([repositoryId, reviewType]) // 이 줄 추가
  @@index([repositoryId, prNumber])
}
```

#### 0-2. Migration 생성 및 적용

```bash
# Migration 생성
npx prisma migrate dev --name add_review_type

# Prisma Client 재생성 (자동으로 실행되지만 명시적으로 확인)
npx prisma generate
```

#### 0-3. 기존 Full Review 함수 수정

**File:** `inngest/functions/review.ts`

`prisma.review.create()` 호출 부분에 `reviewType` 추가:

```typescript
await prisma.review.create({
  data: {
    repositoryId: repository.id,
    prNumber,
    prTitle: title,
    prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
    review: reviewText,
    reviewType: "FULL_REVIEW", // 이 줄 추가
    status: "completed",
  },
});
```

---

### Step 1: Command Parser

**File:** `module/ai/utils/command-parser.ts` (신규 생성)

```typescript
export interface PRCommand {
  type: "summary" | "review" | null;
  args?: string[];
}

export function parseCommand(comment: string): PRCommand | null {
  const normalizedComment = comment.trim().toLowerCase();
  const commandPattern = /^[/@]hreviewer\s+(summary|review)/;
  const match = normalizedComment.match(commandPattern);

  if (!match) {
    return null;
  }

  return {
    type: match[1] === "summary" ? "summary" : "review",
    args: [],
  };
}
```

**Export 추가:** `module/ai/utils/index.ts` 생성

```typescript
export { parseCommand } from "./command-parser";
export type { PRCommand } from "./command-parser";
```

---

### Step 2: Summary Action

**File:** `module/ai/actions/summary.ts` (신규 생성)

```typescript
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";

export async function generatePRSummary(owner: string, repo: string, prNumber: number) {
  try {
    const repository = await prisma.repository.findFirst({
      where: {
        owner,
        name: repo,
      },
      include: {
        user: {
          include: {
            accounts: {
              where: {
                providerId: "github",
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const githubAccount = repository.user.accounts[0];

    if (!githubAccount?.accessToken) {
      throw new Error("Github access token not found");
    }

    await inngest.send({
      name: "pr.summary.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
      },
    });

    return { success: true, message: "Summary Queued" };
  } catch (error) {
    console.error("Error queueing PR summary:", error);
    return { success: false, message: "Error Queueing Summary" };
  }
}
```

**Export 추가:** `module/ai/actions/index.ts` 수정

```typescript
// 기존 export 유지
export { reviewPullRequest } from "./review-pull-request";

// 신규 추가
export { generatePRSummary } from "./summary";
```

---

### Step 3-1: RAG 타입 정의

**File:** `module/ai/types/index.ts` (기존 파일 수정)

**추가할 내용:**

```typescript
export interface SearchResult {
  metadata?: {
    file?: string;
    code?: string;
    path?: string;
    repoId?: string;
  };
  score?: number;
}

export interface SearchOptions {
  topK?: number;
  namespace?: string;
}
```

**설명:**

- `SearchResult`: Pinecone 검색 결과의 타입 정의

  - `metadata.file`: 파일 경로
  - `metadata.code`: 코드 스니펫
  - `metadata.path`: 파일 경로 (file과 동일)
  - `metadata.repoId`: 레포지토리 ID
  - `score`: 유사도 점수

- `SearchOptions`: searchSimilarCode 함수 옵션
  - `topK`: 반환할 최대 결과 수 (기본값: 5)
  - `namespace`: Pinecone namespace (형식: `owner/repo`)

---

### Step 3-2: searchSimilarCode 함수 구현

**File:** `module/ai/lib/rag.ts` (기존 파일 수정)

**Import 추가 (파일 상단):**

```typescript
import type { SearchResult, SearchOptions } from "@/module/ai/types";
```

**함수 추가 (retrieveContext 함수 다음, 파일 끝에):**

```typescript
export async function searchSimilarCode(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const { topK = 5, namespace } = options;

  // Generate embedding for query
  const embedding = await generateEmbedding(query);

  // Query Pinecone with namespace
  const results = await pineconeIndex.namespace(namespace || "").query({
    vector: embedding,
    topK,
    includeMetadata: true,
  });

  // Return results with metadata
  return results.matches.map((match) => ({
    metadata: {
      file: match.metadata?.path as string,
      code: match.metadata?.content as string,
      path: match.metadata?.path as string,
      repoId: match.metadata?.repoId as string,
    },
    score: match.score,
  }));
}
```

**함수 설명:**

- **Parameters:**

  - `query`: 검색할 텍스트 (PR diff)
  - `options.topK`: 반환할 최대 결과 수 (기본값: 5)
  - `options.namespace`: Pinecone namespace (형식: `owner/repo`)

- **Return:** `SearchResult[]` - 파일 정보와 코드 스니펫을 포함한 검색 결과

- **기존 retrieveContext와의 차이:**
  - `repoId` 필터 대신 Pinecone namespace 사용
  - 단순 string[] 대신 메타데이터 포함한 객체 배열 반환
  - GitHub owner/repo 구조와 일치하는 namespace 방식

**타입 import 추가:**

`inngest/functions/summary.ts` 파일에도 타입 import 추가:

```typescript
import type { SearchResult } from "@/module/ai/types";
```

---

### Step 3-3: Inngest Summary Function

**File:** `inngest/functions/summary.ts` (신규 생성)

```typescript
import prisma from "@/lib/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/module/github/lib/github";
import { searchSimilarCode } from "@/module/ai/lib/rag";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export const generateSummary = inngest.createFunction(
  { id: "generate-summary" },
  { event: "pr.summary.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId } = event.data;

    // Step 1: Fetch PR data
    const { diff, title, description, token } = await step.run("fetch-pr-data", async () => {
      const account = await prisma.account.findFirst({
        where: {
          userId,
          providerId: "github",
        },
      });

      if (!account?.accessToken) {
        throw new Error("Github access token not found");
      }

      const data = await getPullRequestDiff(account.accessToken, owner, repo, prNumber);

      return { ...data, token: account.accessToken };
    });

    // Step 2: Generate AI summary with RAG context
    const summary = await step.run("generate-ai-summary", async () => {
      // RAG: PR diff 기반으로 관련 코드베이스 컨텍스트 검색
      const relevantContext = await searchSimilarCode(diff, {
        topK: 3, // Summary는 적은 수의 컨텍스트만 사용 (Full Review는 10)
        namespace: `${owner}/${repo}`,
      });

      const contextSection =
        relevantContext.length > 0
          ? `**Related Codebase Context:**
${relevantContext
  .map(
    (ctx) => `
- **File:** ${ctx.metadata?.file || "Unknown"}
- **Code:** \`\`\`
${ctx.metadata?.code || ""}
\`\`\`
`
  )
  .join("\n")}`
          : "**Related Codebase Context:** No related code found in the indexed codebase.";

      const prompt = `You are an expert code reviewer analyzing a pull request in the context of the existing codebase.

**PR Title:** ${title}
**PR Description:** ${description || "No description provided"}

**Code Changes:**
\`\`\`diff
${diff}
\`\`\`

${contextSection}

Provide a brief summary considering the existing codebase:
1. **Overview** (2-3 sentences): What does this PR accomplish in the context of the project?
2. **Key Changes** (bullet points): Files modified and their relationship to existing code
3. **Impact**: Which parts of the codebase are affected based on usage patterns
4. **Risk Level**: LOW/MEDIUM/HIGH (considering existing dependencies)

Format in markdown. Maximum 200 words.`;

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });

      return text;
    });

    // Step 3: Post comment to GitHub
    await step.run("post-comment", async () => {
      await postReviewComment(token, owner, repo, prNumber, summary);
    });

    // Step 4: Save to database
    await step.run("save-summary", async () => {
      const repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      await prisma.review.create({
        data: {
          repositoryId: repository.id,
          prNumber,
          prTitle: title,
          prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          review: summary,
          reviewType: "SUMMARY", // Summary 타입 명시
          status: "completed",
        },
      });
    });

    return { success: true };
  }
);
```

---

### Step 4: Webhook Handler 수정

**File:** `app/api/webhooks/github/route.ts` (기존 파일 수정)

**변경사항:**

1. Line 18 오타 수정: `onwer` → `owner`
2. `issue_comment` 이벤트 핸들러 추가

```typescript
import { reviewPullRequest } from "@/module/ai";
import { generatePRSummary } from "@/module/ai/actions";
import { parseCommand } from "@/module/ai/utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = request.headers.get("x-github-event");

    if (event === "ping") {
      return NextResponse.json({ message: "Pong" }, { status: 200 });
    }

    if (event === "pull_request") {
      const action = body.action;
      const repo = body.repository.full_name;
      const prNumber = body.number;

      const [owner, repoName] = repo.split("/"); // 오타 수정됨

      if (action === "opened" || action === "synchronize") {
        reviewPullRequest(owner, repoName, prNumber)
          .then(() => console.log(`Review completed for ${repo} #${prNumber}`))
          .catch((error) => console.error(`Review failed for ${repo} #${prNumber}:`, error));
      }
    }

    // 신규: issue_comment 이벤트 처리
    if (event === "issue_comment") {
      const action = body.action;

      if (action === "created") {
        const comment = body.comment.body;
        const repo = body.repository.full_name;
        const prNumber = body.issue.number;
        const isPullRequest = body.issue.pull_request !== undefined;

        // Issue 댓글은 무시, PR 댓글만 처리
        if (!isPullRequest) {
          return NextResponse.json({ message: "Not a PR comment" }, { status: 200 });
        }

        const command = parseCommand(comment);

        if (command?.type === "summary") {
          const [owner, repoName] = repo.split("/");

          generatePRSummary(owner, repoName, prNumber)
            .then(() => console.log(`Summary generated for ${repo} #${prNumber}`))
            .catch((error) => console.error(`Summary failed for ${repo} #${prNumber}:`, error));
        }
      }
    }

    return NextResponse.json({ message: "Event Processed" }, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ error: "Error processing webhook" }, { status: 500 });
  }
}
```

---

### Step 5: Inngest 함수 등록

**File:** `app/api/inngest/route.ts` (기존 파일 수정)

```typescript
import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { indexRepository } from "@/inngest/functions";
import { generateReview } from "@/inngest/functions/review";
import { generateSummary } from "@/inngest/functions/summary"; // 추가

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    indexRepository,
    generateReview,
    generateSummary, // 추가
  ],
});
```

---

### Step 6: GitHub Webhook 이벤트 추가

**File:** `module/github/lib/github.ts` (기존 파일 수정)

`createWebhook` 함수 (Line 121)에서 events 배열 수정:

```typescript
// 수정 전
events: ["pull_request"];

// 수정 후
events: ["pull_request", "issue_comment"];
```

**기존 연결된 레포지토리의 경우:**

- GitHub 레포지토리 Settings → Webhooks에서 직접 `issue_comment` 이벤트 추가
- 또는 hreviewer에서 레포지토리 연결 해제 후 재연결

---

## Files Summary

### 신규 생성 파일 (4개)

| File                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| `module/ai/utils/command-parser.ts` | 명령어 파서                        |
| `module/ai/utils/index.ts`          | utils 배럴 export                  |
| `module/ai/actions/summary.ts`      | Summary 액션 함수                  |
| `inngest/functions/summary.ts`      | Inngest 백그라운드 함수 (RAG 포함) |

### 수정 파일 (9개)

| File                               | Changes                                                                |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `prisma/schema.prisma`             | **CRITICAL**: ReviewType enum 추가, Review 모델에 reviewType 필드 추가 |
| `inngest/functions/review.ts`      | reviewType: "FULL_REVIEW" 추가                                         |
| `module/ai/types/index.ts`         | SearchResult, SearchOptions 타입 추가                                  |
| `module/ai/lib/rag.ts`             | searchSimilarCode 함수 추가, 타입 import 추가                          |
| `inngest/functions/summary.ts`     | SearchResult 타입 import 추가                                          |
| `app/api/webhooks/github/route.ts` | issue_comment 핸들러 추가, 오타 수정                                   |
| `app/api/inngest/route.ts`         | generateSummary 함수 등록                                              |
| `module/github/lib/github.ts`      | webhook events에 issue_comment 추가                                    |
| `module/ai/actions/index.ts`       | generatePRSummary export 추가                                          |

### Migration 파일 (자동 생성)

| File                                                     | Description                       |
| -------------------------------------------------------- | --------------------------------- |
| `prisma/migrations/XXXXXX_add_review_type/migration.sql` | reviewType 필드 추가 마이그레이션 |

---

## Command Syntax

**지원 형식:**

```
/hreviewer summary
@hreviewer summary
/HREVIEWER SUMMARY  (대소문자 무관)
```

**무시되는 경우:**

- 일반 댓글 (명령어가 아닌 경우)
- Issue 댓글 (PR이 아닌 경우)
- 알 수 없는 명령어

---

## Deployment

### 배포 순서

**⚠️ CRITICAL: 순서 반드시 준수**

1. **Database Migration** (가장 먼저!):

   ```bash
   npx prisma migrate deploy  # 프로덕션 환경
   npx prisma generate
   ```

2. **코드 배포**: Step 0-6 파일 생성/수정 후 배포

   - `prisma/schema.prisma` 수정
   - `inngest/functions/review.ts` 수정
   - 나머지 신규/수정 파일 배포

3. **Inngest 함수 확인**: Inngest 대시보드에서 `generate-summary` 함수 등록 확인

4. **Webhook 업데이트**: 기존 레포지토리의 webhook에 `issue_comment` 이벤트 추가

### Webhook 업데이트 방법

**Option A: 수동 (권장)**

1. GitHub 레포지토리 → Settings → Webhooks
2. hreviewer webhook 선택
3. Events에서 `Issue comments` 체크 추가
4. Save

**Option B: 스크립트**

```typescript
// scripts/update-webhooks.ts
import prisma from "@/lib/db";
import { Octokit } from "octokit";

async function updateAllWebhooks() {
  const repositories = await prisma.repository.findMany({
    include: {
      user: {
        include: {
          accounts: { where: { providerId: "github" } },
        },
      },
    },
  });

  for (const repo of repositories) {
    const token = repo.user.accounts[0]?.accessToken;
    if (!token) continue;

    const octokit = new Octokit({ auth: token });
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/webhooks/github`;

    const { data: hooks } = await octokit.rest.repos.listWebhooks({
      owner: repo.owner,
      repo: repo.name,
    });

    const hook = hooks.find((h: any) => h.config.url === webhookUrl);

    if (hook) {
      await octokit.rest.repos.updateWebhook({
        owner: repo.owner,
        repo: repo.name,
        hook_id: hook.id,
        events: ["pull_request", "issue_comment"],
      });
      console.log(`Updated: ${repo.owner}/${repo.name}`);
    }
  }
}

updateAllWebhooks();
```

---

## Troubleshooting

| 증상                                    | 원인                         | 해결 방법                                          |
| --------------------------------------- | ---------------------------- | -------------------------------------------------- |
| 댓글 후 반응 없음                       | Webhook에 issue_comment 누락 | GitHub webhook 설정 확인                           |
| "Not a PR comment" 응답                 | Issue에 댓글 작성            | PR에 댓글 작성 필요                                |
| Inngest 작업 실패                       | GitHub 토큰 만료             | 사용자 재로그인 필요                               |
| 요약 품질 문제                          | 프롬프트 조정 필요           | `summary.ts` 프롬프트 수정                         |
| "No related code found"                 | Pinecone 인덱스 미생성       | 레포지토리 인덱싱 실행 필요                        |
| RAG 검색 실패                           | Pinecone API 키 누락/만료    | 환경변수 `PINECONE_DB_API_KEY` 확인                |
| 컨텍스트 부족                           | topK 값 너무 낮음            | topK를 3 → 5로 증가                                |
| Prisma 에러: Unknown field `reviewType` | Migration 미실행             | `npx prisma migrate deploy && npx prisma generate` |
| TypeScript 에러: ReviewType 타입 없음   | Prisma Client 미재생성       | `npx prisma generate`                              |
| 기존 Review 조회 안 됨                  | reviewType 필드 누락         | Migration 확인, 기본값 FULL_REVIEW 적용됨          |

### Rollback

기능 비활성화가 필요한 경우:

```typescript
// app/api/webhooks/github/route.ts
if (event === "issue_comment") {
  return NextResponse.json({ message: "Feature disabled" }, { status: 200 });
}
```

---

## Database

### ⚠️ Prisma 스키마 수정 필수

Summary와 Full Review를 구분하기 위해 `reviewType` 필드를 추가합니다.

### 1. Enum 추가

**File:** `prisma/schema.prisma`

```prisma
enum ReviewType {
  SUMMARY
  FULL_REVIEW
}
```

### 2. Review 모델 수정

```prisma
model Review {
  id           String     @id @default(cuid())
  repositoryId String
  prNumber     Int
  prTitle      String
  prUrl        String
  review       String     @db. Text
  reviewType   ReviewType @default(FULL_REVIEW) // 추가
  status       String
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  repository Repository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)

  @@index([repositoryId, reviewType])
  @@index([repositoryId, prNumber])
}
```

### 3. Migration 실행

```bash
# Migration 생성 및 적용
npx prisma migrate dev --name add_review_type

# Prisma Client 재생성
npx prisma generate
```

**변경사항:**

- ✅ `reviewType` 필드 추가 (ENUM: SUMMARY | FULL_REVIEW)
- ✅ 기존 데이터는 자동으로 `FULL_REVIEW`로 설정 (default 값)
- ✅ Index 추가: `(repositoryId, reviewType)` for query optimization
- ✅ TypeScript 타입 안전성 자동 생성

---

## Version History

| Version | Date       | Changes                                                                  |
| ------- | ---------- | ------------------------------------------------------------------------ |
| 1.3     | 2026-01-01 | **BREAKING**: Prisma 스키마 수정 추가 (ReviewType enum, reviewType 필드) |
| 1.2     | 2026-01-01 | Summary 기능에 RAG 추가, topK: 3 사용, 실행시간 20-25초로 업데이트       |
| 1.1     | 2025-12-31 | 초기 스펙 작성                                                           |

**Document Version:** 1.3
**Last Updated:** 2026-01-01
