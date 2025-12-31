# PR Summary Feature Implementation Guide

## Overview

GitHub PR 댓글로 `/hreviewer summary` 명령어를 입력하면 AI가 해당 PR의 내용을 요약해주는 기능의 구현 가이드입니다.

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
  ├─ Step 2: generate-ai-summary (Gemini로 요약 생성)
  ├─ Step 3: post-comment (GitHub PR에 댓글 게시)
  └─ Step 4: save-summary (DB에 저장)
```

### Key Components

| Component | File Path | Purpose |
|-----------|-----------|---------|
| Command Parser | `module/ai/utils/command-parser.ts` | 댓글에서 명령어 파싱 |
| Summary Action | `module/ai/actions/summary.ts` | Inngest 이벤트 발송 |
| Inngest Function | `inngest/functions/summary.ts` | 백그라운드 요약 생성 |
| Webhook Handler | `app/api/webhooks/github/route.ts` | GitHub 웹훅 수신 |

### Full Review vs Summary 비교

| 항목 | Full Review | Summary |
|------|-------------|---------|
| 트리거 | PR opened/synchronized | 사용자 댓글 명령어 |
| RAG Context | 사용 (Pinecone) | 미사용 (더 빠름) |
| 분량 | ~500+ words | ~200 words |
| 실행 시간 | ~30초 | ~10-15초 |

---

## Implementation Steps

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

export async function generatePRSummary(
  owner: string,
  repo: string,
  prNumber: number
) {
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

### Step 3: Inngest Summary Function

**File:** `inngest/functions/summary.ts` (신규 생성)

```typescript
import prisma from "@/lib/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/module/github/lib/github";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export const generateSummary = inngest.createFunction(
  { id: "generate-summary" },
  { event: "pr.summary.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId } = event.data;

    // Step 1: Fetch PR data
    const { diff, title, description, token } = await step.run(
      "fetch-pr-data",
      async () => {
        const account = await prisma.account.findFirst({
          where: {
            userId,
            providerId: "github",
          },
        });

        if (!account?.accessToken) {
          throw new Error("Github access token not found");
        }

        const data = await getPullRequestDiff(
          account.accessToken,
          owner,
          repo,
          prNumber
        );

        return { ...data, token: account.accessToken };
      }
    );

    // Step 2: Generate AI summary (RAG 미사용)
    const summary = await step.run("generate-ai-summary", async () => {
      const prompt = `You are an expert code reviewer. Provide a concise summary of this pull request.

**PR Title:** ${title}
**PR Description:** ${description || "No description provided"}

**Code Changes:**
\`\`\`diff
${diff}
\`\`\`

Provide a brief summary with:
1. **Overview** (2-3 sentences): What does this PR accomplish?
2. **Key Changes** (bullet points): Main files/components modified
3. **Impact**: Areas of codebase affected
4. **Risk Level**: LOW/MEDIUM/HIGH

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
events: ["pull_request"]

// 수정 후
events: ["pull_request", "issue_comment"]
```

**기존 연결된 레포지토리의 경우:**
- GitHub 레포지토리 Settings → Webhooks에서 직접 `issue_comment` 이벤트 추가
- 또는 hreviewer에서 레포지토리 연결 해제 후 재연결

---

## Files Summary

### 신규 생성 파일 (4개)

| File | Description |
|------|-------------|
| `module/ai/utils/command-parser.ts` | 명령어 파서 |
| `module/ai/utils/index.ts` | utils 배럴 export |
| `module/ai/actions/summary.ts` | Summary 액션 함수 |
| `inngest/functions/summary.ts` | Inngest 백그라운드 함수 |

### 수정 파일 (4개)

| File | Changes |
|------|---------|
| `app/api/webhooks/github/route.ts` | issue_comment 핸들러 추가, 오타 수정 |
| `app/api/inngest/route.ts` | generateSummary 함수 등록 |
| `module/github/lib/github.ts` | webhook events에 issue_comment 추가 |
| `module/ai/actions/index.ts` | generatePRSummary export 추가 |

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

1. **코드 배포**: 위 Step 1-6 파일 생성/수정 후 배포
2. **Inngest 함수 확인**: Inngest 대시보드에서 `generate-summary` 함수 등록 확인
3. **Webhook 업데이트**: 기존 레포지토리의 webhook에 `issue_comment` 이벤트 추가

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

| 증상 | 원인 | 해결 방법 |
|------|------|----------|
| 댓글 후 반응 없음 | Webhook에 issue_comment 누락 | GitHub webhook 설정 확인 |
| "Not a PR comment" 응답 | Issue에 댓글 작성 | PR에 댓글 작성 필요 |
| Inngest 작업 실패 | GitHub 토큰 만료 | 사용자 재로그인 필요 |
| 요약 품질 문제 | 프롬프트 조정 필요 | `summary.ts` 프롬프트 수정 |

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

**스키마 변경 불필요** - 기존 `Review` 모델 사용:

```prisma
model Review {
  id           String   @id @default(cuid())
  repositoryId String
  prNumber     Int
  prTitle      String
  prUrl        String
  review       String   @db.Text  // summary 또는 full review 저장
  status       String   // "completed", "failed"
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  repository Repository @relation(...)
}
```

Summary와 Full Review는 같은 테이블에 저장되며, 내용 길이로 구분 가능합니다.

---

**Document Version:** 1.1
**Last Updated:** 2025-12-31
