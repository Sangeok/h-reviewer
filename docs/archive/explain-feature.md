# `/hreviewer explain` 기능 구현 가이드

## Overview

GitHub PR 댓글로 `/hreviewer explain` 명령어를 입력하면 AI가 해당 코드의 동작 방식, 의도, 로직을 상세히 설명해주는 기능입니다.

---

## 기존 명령어와의 차이

| 명령어 | 목적 | 분량 | RAG | 실행 시간 |
|--------|------|------|-----|-----------|
| `/hreviewer review` | 코드 리뷰 (버그, 보안, 개선점) | ~500+ words | ✅ | ~30초 |
| `/hreviewer summary` | PR 요약 | ~200 words | ❌ | ~10-15초 |
| `/hreviewer explain` | 코드 설명 (교육적) | ~300-500 words | ✅ | ~15-20초 |

### explain 기능의 특징

- **교육적 목적**: 코드가 "무엇을 하는지", "왜 이렇게 작성했는지" 설명
- **맥락 기반**: RAG로 프로젝트 컨텍스트를 활용한 설명
- **타겟 지정**: 특정 파일, 함수, 또는 코드 블록 지정 가능

---

## Command Syntax

### 기본 형식

```
/hreviewer explain [target]
@hreviewer explain [target]
```

### 사용 예시

```bash
# 전체 PR 변경사항 설명
/hreviewer explain

# 특정 파일 설명
/hreviewer explain src/utils/auth.ts

# 특정 함수/클래스 설명
/hreviewer explain validateToken
/hreviewer explain UserAuthService

# 특정 라인 범위 설명
/hreviewer explain src/utils/auth.ts:10-50

# 인라인 댓글 (코드 블록에 직접)
# → GitHub Review Comment로 특정 라인에 댓글 작성 시
/hreviewer explain
```

---

## Architecture

### Event Flow

```
GitHub PR Comment ("/hreviewer explain [target]")
       ↓
GitHub Webhook (issue_comment / pull_request_review_comment event)
       ↓
POST /api/webhooks/github
       ↓
parseCommand() → 명령어 및 타겟 파싱
       ↓
explainCode() → Inngest 이벤트 발송
       ↓
Inngest: generateExplanation()
  ├─ Step 1: fetch-pr-data (PR diff, 파일 내용 조회)
  ├─ Step 2: identify-target (타겟 코드 식별)
  ├─ Step 3: retrieve-context (RAG로 관련 코드 검색)
  ├─ Step 4: generate-explanation (Gemini로 설명 생성)
  └─ Step 5: post-comment (GitHub PR에 댓글 게시)
```

### Key Components

| Component | File Path | Purpose |
|-----------|-----------|---------|
| Command Parser | `module/ai/utils/command-parser.ts` | 명령어 및 타겟 파싱 |
| Explain Action | `module/ai/actions/explain.ts` | Inngest 이벤트 발송 |
| Inngest Function | `inngest/functions/explain.ts` | 백그라운드 설명 생성 |
| Webhook Handler | `app/api/webhooks/github/route.ts` | GitHub 웹훅 수신 |

---

## Implementation Steps

### Step 1: Command Parser 확장

**File:** `module/ai/utils/command-parser.ts`

**변경 사항:**
- `explain` 명령어 타입 추가
- 타겟 파라미터 파싱 로직 추가

```typescript
export type CommandType = "summary" | "review" | "explain" | null;

export interface PRCommand {
  type: CommandType;
  target?: string;        // 파일 경로, 함수명, 라인 범위
  lineRange?: {           // 라인 범위 (선택적)
    start: number;
    end: number;
  };
}

export function parseCommand(comment: string): PRCommand | null {
  const normalizedComment = comment.trim();

  // 명령어 패턴: /hreviewer <command> [target]
  // 대소문자 무관, @도 지원
  const commandPattern = /^[/@]hreviewer\s+(summary|review|explain)(?:\s+(.+))?$/i;
  const match = normalizedComment.match(commandPattern);

  if (!match) {
    return null;
  }

  const commandType = match[1].toLowerCase() as CommandType;
  const rawTarget = match[2]?.trim();

  // explain 명령어의 타겟 파싱
  if (commandType === "explain" && rawTarget) {
    // 라인 범위 파싱: file.ts:10-50
    const lineRangePattern = /^(.+):(\d+)-(\d+)$/;
    const lineMatch = rawTarget.match(lineRangePattern);

    if (lineMatch) {
      return {
        type: commandType,
        target: lineMatch[1],
        lineRange: {
          start: parseInt(lineMatch[2], 10),
          end: parseInt(lineMatch[3], 10),
        },
      };
    }

    return {
      type: commandType,
      target: rawTarget,
    };
  }

  return {
    type: commandType,
  };
}

// 유틸리티: 타겟이 파일 경로인지 확인
export function isFilePath(target: string): boolean {
  return /\.[a-zA-Z0-9]+$/.test(target) || target.includes("/");
}

// 유틸리티: 타겟이 함수/클래스명인지 확인
export function isIdentifier(target: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(target);
}
```

---

### Step 2: Explain Action 생성

**File:** `module/ai/actions/explain.ts` (신규 생성)

```typescript
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";

export interface ExplainParams {
  owner: string;
  repo: string;
  prNumber: number;
  target?: string;
  lineRange?: {
    start: number;
    end: number;
  };
  commentId?: number;  // 인라인 댓글의 경우 해당 댓글 ID
}

export async function explainCode(params: ExplainParams) {
  const { owner, repo, prNumber, target, lineRange, commentId } = params;

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
      name: "pr.explain.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
        target,
        lineRange,
        commentId,
      },
    });

    return { success: true, message: "Explanation Queued" };
  } catch (error) {
    console.error("Error queueing code explanation:", error);
    return { success: false, message: "Error Queueing Explanation" };
  }
}
```

---

### Step 3: Inngest Function 생성

**File:** `inngest/functions/explain.ts` (신규 생성)

```typescript
import prisma from "@/lib/db";
import { inngest } from "../client";
import {
  getPullRequestDiff,
  postReviewComment,
  getFileContent,
} from "@/module/github/lib/github";
import { retrieveContext } from "@/module/ai/lib/rag";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { isFilePath } from "@/module/ai/utils/command-parser";

export const generateExplanation = inngest.createFunction(
  { id: "generate-explanation" },
  { event: "pr.explain.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId, target, lineRange, commentId } =
      event.data;

    // Step 1: Fetch PR data and access token
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

    // Step 2: Identify and extract target code
    const targetCode = await step.run("identify-target", async () => {
      // 타겟이 없으면 전체 diff 사용
      if (!target) {
        return {
          type: "full-pr",
          code: diff,
          description: "전체 PR 변경사항",
        };
      }

      // 파일 경로인 경우
      if (isFilePath(target)) {
        // diff에서 해당 파일 부분만 추출
        const filePattern = new RegExp(
          `diff --git a/${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*?(?=diff --git|$)`,
          "s"
        );
        const fileMatch = diff.match(filePattern);

        if (fileMatch) {
          let code = fileMatch[0];

          // 라인 범위가 지정된 경우
          if (lineRange) {
            const lines = code.split("\n");
            code = lines
              .filter((_, idx) => idx >= lineRange.start && idx <= lineRange.end)
              .join("\n");
          }

          return {
            type: "file",
            code,
            description: lineRange
              ? `${target} (라인 ${lineRange.start}-${lineRange.end})`
              : target,
          };
        }

        // diff에 없으면 파일 전체 조회
        try {
          const fileContent = await getFileContent(token, owner, repo, target);
          return {
            type: "file",
            code: fileContent,
            description: target,
          };
        } catch {
          return {
            type: "not-found",
            code: diff,
            description: `${target} (파일을 찾을 수 없어 전체 diff 사용)`,
          };
        }
      }

      // 함수/클래스명인 경우 diff에서 검색
      const identifierPattern = new RegExp(
        `(function|class|const|let|var|export)\\s+${target}[\\s\\S]*?(?=\\n(?:function|class|const|let|var|export|$))`,
        "gm"
      );
      const identifierMatch = diff.match(identifierPattern);

      if (identifierMatch) {
        return {
          type: "identifier",
          code: identifierMatch[0],
          description: `${target} 정의`,
        };
      }

      // 찾지 못한 경우 전체 diff에서 검색 컨텍스트 제공
      return {
        type: "search",
        code: diff,
        description: `"${target}" 관련 변경사항`,
        searchTerm: target,
      };
    });

    // Step 3: Retrieve context from RAG
    const context = await step.run("retrieve-context", async () => {
      const query = target
        ? `${target} ${title}`
        : `${title}\n\n${description}`;

      return await retrieveContext(query, `${owner}/${repo}`);
    });

    // Step 4: Generate AI explanation
    const explanation = await step.run("generate-explanation", async () => {
      const prompt = buildExplainPrompt(
        title,
        description,
        targetCode,
        context
      );

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });

      return text;
    });

    // Step 5: Post comment to GitHub
    await step.run("post-comment", async () => {
      const header = `## 📖 Code Explanation\n\n> **Target:** ${targetCode.description}\n\n`;
      const footer = `\n\n---\n*Generated by HReviewer*`;

      await postReviewComment(
        token,
        owner,
        repo,
        prNumber,
        header + explanation + footer
      );
    });

    return { success: true };
  }
);

// 프롬프트 빌더 함수
function buildExplainPrompt(
  title: string,
  description: string | null,
  targetCode: {
    type: string;
    code: string;
    description: string;
    searchTerm?: string;
  },
  context: string[]
): string {
  return `You are an expert software engineer and educator. Your task is to explain code in a clear, educational manner.

**PR Title:** ${title}
**PR Description:** ${description || "No description provided"}

**Target:** ${targetCode.description}
${targetCode.searchTerm ? `**Search Term:** ${targetCode.searchTerm}` : ""}

**Code to Explain:**
\`\`\`
${targetCode.code.substring(0, 8000)}
\`\`\`

**Related Code from Codebase (for context):**
${context.slice(0, 3).join("\n\n---\n\n")}

---

Please provide a comprehensive explanation including:

## 1. 개요 (Overview)
- 이 코드가 무엇을 하는지 2-3문장으로 요약

## 2. 상세 설명 (Detailed Explanation)
- 주요 로직과 동작 방식
- 중요한 함수/변수의 역할
- 데이터 흐름

## 3. 왜 이렇게 작성했는가? (Design Decisions)
- 이 접근 방식을 선택한 이유
- 대안적인 접근 방식과 비교

## 4. 주의사항 (Considerations)
- 이 코드를 수정할 때 주의할 점
- 관련된 다른 코드와의 의존성

## 5. 예시 (Example)
- 이 코드가 실제로 어떻게 사용되는지 간단한 예시

---

**Important:**
- 한국어로 작성해주세요
- 초보 개발자도 이해할 수 있도록 설명해주세요
- 코드 블록을 활용하여 가독성을 높여주세요
- 300-500 단어 내외로 작성해주세요`;
}
```

---

### Step 4: GitHub 유틸리티 함수 추가

**File:** `module/github/lib/github.ts`

**추가할 함수:**

```typescript
// 단일 파일 내용 조회
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string  // 브랜치/커밋 (선택적)
): Promise<string> {
  const octokit = new Octokit({
    auth: token,
  });

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ...(ref && { ref }),
    });

    if (Array.isArray(data)) {
      throw new Error("Path is a directory, not a file");
    }

    if (data.type !== "file" || !data.content) {
      throw new Error("Unable to read file content");
    }

    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch (error) {
    console.error(`Error fetching file content for ${path}:`, error);
    throw error;
  }
}
```

**Export 추가:** `module/github/index.ts` (있다면)에 export 추가

---

### Step 5: Webhook Handler 확장

**File:** `app/api/webhooks/github/route.ts`

**변경 사항:**
- `explain` 명령어 핸들링 추가
- `pull_request_review_comment` 이벤트 핸들링 (인라인 댓글)

```typescript
import { reviewPullRequest } from "@/module/ai";
import { generatePRSummary } from "@/module/ai/actions/summary";
import { explainCode } from "@/module/ai/actions/explain";
import { parseCommand } from "@/module/ai/utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = request.headers.get("x-github-event");

    if (event === "ping") {
      return NextResponse.json({ message: "Pong" }, { status: 200 });
    }

    // 기존: pull_request 이벤트
    if (event === "pull_request") {
      const action = body.action;
      const repo = body.repository.full_name;
      const prNumber = body.number;
      const [owner, repoName] = repo.split("/");

      if (action === "opened" || action === "synchronize") {
        reviewPullRequest(owner, repoName, prNumber)
          .then(() => console.log(`Review completed for ${repo} #${prNumber}`))
          .catch((error) =>
            console.error(`Review failed for ${repo} #${prNumber}:`, error)
          );
      }
    }

    // 기존: issue_comment 이벤트 (PR 일반 댓글)
    if (event === "issue_comment") {
      const action = body.action;

      if (action === "created") {
        const comment = body.comment.body;
        const repo = body.repository.full_name;
        const prNumber = body.issue.number;
        const isPullRequest = body.issue.pull_request !== undefined;

        if (!isPullRequest) {
          return NextResponse.json(
            { message: "Not a PR comment" },
            { status: 200 }
          );
        }

        const command = parseCommand(comment);
        const [owner, repoName] = repo.split("/");

        if (command?.type === "summary") {
          generatePRSummary(owner, repoName, prNumber)
            .then(() => console.log(`Summary generated for ${repo} #${prNumber}`))
            .catch((error) =>
              console.error(`Summary failed for ${repo} #${prNumber}:`, error)
            );
        }

        // 신규: explain 명령어 처리
        if (command?.type === "explain") {
          explainCode({
            owner,
            repo: repoName,
            prNumber,
            target: command.target,
            lineRange: command.lineRange,
          })
            .then(() =>
              console.log(`Explanation generated for ${repo} #${prNumber}`)
            )
            .catch((error) =>
              console.error(`Explanation failed for ${repo} #${prNumber}:`, error)
            );
        }
      }
    }

    // 신규: pull_request_review_comment 이벤트 (인라인 댓글)
    if (event === "pull_request_review_comment") {
      const action = body.action;

      if (action === "created") {
        const comment = body.comment.body;
        const repo = body.repository.full_name;
        const prNumber = body.pull_request.number;
        const filePath = body.comment.path;        // 댓글이 달린 파일
        const line = body.comment.line;            // 댓글이 달린 라인
        const commentId = body.comment.id;

        const command = parseCommand(comment);
        const [owner, repoName] = repo.split("/");

        // 인라인 댓글에서 explain 명령어 처리
        if (command?.type === "explain") {
          // 타겟이 지정되지 않은 경우 댓글이 달린 파일과 라인 사용
          const target = command.target || filePath;
          const lineRange = command.lineRange || (line ? { start: Math.max(1, line - 10), end: line + 10 } : undefined);

          explainCode({
            owner,
            repo: repoName,
            prNumber,
            target,
            lineRange,
            commentId,
          })
            .then(() =>
              console.log(`Inline explanation generated for ${repo} #${prNumber}`)
            )
            .catch((error) =>
              console.error(
                `Inline explanation failed for ${repo} #${prNumber}:`,
                error
              )
            );
        }
      }
    }

    return NextResponse.json({ message: "Event Processed" }, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Error processing webhook" },
      { status: 500 }
    );
  }
}
```

---

### Step 6: Inngest 함수 등록

**File:** `app/api/inngest/route.ts`

```typescript
import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { indexRepository } from "@/inngest/functions";
import { generateReview } from "@/inngest/functions/review";
import { generateSummary } from "@/inngest/functions/summary";
import { generateExplanation } from "@/inngest/functions/explain"; // 추가

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    indexRepository,
    generateReview,
    generateSummary,
    generateExplanation, // 추가
  ],
});
```

---

### Step 7: GitHub Webhook 이벤트 추가

**File:** `module/github/lib/github.ts`

`createWebhook` 함수에서 events 배열 수정:

```typescript
// 수정 전
events: ["pull_request"]

// 수정 후
events: ["pull_request", "issue_comment", "pull_request_review_comment"]
```

---

### Step 8: Action Export 추가

**File:** `module/ai/actions/index.ts`

```typescript
// 기존 export
export { reviewPullRequest } from "./review-pull-request";

// summary 기능 (이미 추가됨)
export { generatePRSummary } from "./summary";

// explain 기능 추가
export { explainCode } from "./explain";
export type { ExplainParams } from "./explain";
```

---

## Files Summary

### 신규 생성 파일 (2개)

| File | Description |
|------|-------------|
| `module/ai/actions/explain.ts` | Explain 액션 함수 |
| `inngest/functions/explain.ts` | Inngest 백그라운드 함수 |

### 수정 파일 (5개)

| File | Changes |
|------|---------|
| `module/ai/utils/command-parser.ts` | `explain` 명령어 및 타겟 파싱 추가 |
| `module/github/lib/github.ts` | `getFileContent` 함수 추가, webhook events 수정 |
| `app/api/webhooks/github/route.ts` | `explain` 및 인라인 댓글 핸들러 추가 |
| `app/api/inngest/route.ts` | `generateExplanation` 함수 등록 |
| `module/ai/actions/index.ts` | `explainCode` export 추가 |

---

## 의존성

### 기존 의존성 (변경 없음)

- `inngest`: 백그라운드 작업 처리
- `@ai-sdk/google`: Gemini AI 모델
- `ai`: AI SDK
- `octokit`: GitHub API
- `@prisma/client`: 데이터베이스

### 신규 의존성 없음

---

## 테스트 시나리오

### 1. 기본 explain 테스트

```bash
# PR 댓글에 작성
/hreviewer explain
```

**예상 결과:** 전체 PR 변경사항에 대한 설명 댓글 생성

### 2. 파일 지정 테스트

```bash
/hreviewer explain src/utils/auth.ts
```

**예상 결과:** 해당 파일의 변경사항에 대한 설명

### 3. 라인 범위 지정 테스트

```bash
/hreviewer explain src/utils/auth.ts:10-50
```

**예상 결과:** 해당 라인 범위의 코드 설명

### 4. 함수명 지정 테스트

```bash
/hreviewer explain validateToken
```

**예상 결과:** 해당 함수 정의 및 동작 설명

### 5. 인라인 댓글 테스트

1. PR의 Files changed 탭에서 특정 라인에 리뷰 댓글 작성
2. 댓글 내용: `/hreviewer explain`
3. **예상 결과:** 해당 라인 주변 코드에 대한 설명

---

## 출력 예시

```markdown
## 📖 Code Explanation

> **Target:** src/utils/auth.ts

## 1. 개요 (Overview)

이 파일은 사용자 인증을 처리하는 유틸리티 함수들을 포함합니다.
JWT 토큰의 검증, 세션 관리, 그리고 권한 확인을 담당합니다.

## 2. 상세 설명 (Detailed Explanation)

### `validateToken(token: string)`
JWT 토큰을 검증하고 디코딩된 페이로드를 반환합니다.

\`\`\`typescript
// 토큰 구조: header.payload.signature
const decoded = jwt.verify(token, process.env.JWT_SECRET);
\`\`\`

주요 동작:
1. 토큰 형식 검증
2. 서명 검증 (HMAC-SHA256)
3. 만료 시간 확인
4. 페이로드 반환

## 3. 왜 이렇게 작성했는가? (Design Decisions)

- **jsonwebtoken 라이브러리 사용**: 업계 표준이며 검증된 구현
- **환경 변수로 시크릿 관리**: 보안을 위해 코드에 하드코딩하지 않음

## 4. 주의사항 (Considerations)

- `JWT_SECRET` 환경 변수가 설정되지 않으면 런타임 에러 발생
- 토큰 만료 시 `TokenExpiredError` 예외 발생

## 5. 예시 (Example)

\`\`\`typescript
const token = "eyJhbGciOiJIUzI1NiIs...";
const user = await validateToken(token);
console.log(user.id); // "user_123"
\`\`\`

---
*Generated by HReviewer*
```

---

## 에러 처리

| 에러 상황 | 처리 방법 |
|----------|----------|
| 타겟 파일을 찾을 수 없음 | 전체 diff로 폴백, 메시지 표시 |
| 함수/클래스를 찾을 수 없음 | diff 전체에서 검색 컨텍스트 제공 |
| RAG 컨텍스트 없음 | 컨텍스트 없이 설명 생성 |
| GitHub API 실패 | 에러 로깅, 사용자에게 재시도 안내 |
| AI 생성 실패 | 에러 로깅, 기본 에러 메시지 댓글 |

---

## Deployment Checklist

- [ ] `module/ai/utils/command-parser.ts` 수정
- [ ] `module/ai/actions/explain.ts` 생성
- [ ] `inngest/functions/explain.ts` 생성
- [ ] `module/github/lib/github.ts`에 `getFileContent` 추가
- [ ] `module/github/lib/github.ts`에서 webhook events 수정
- [ ] `app/api/webhooks/github/route.ts` 수정
- [ ] `app/api/inngest/route.ts` 수정
- [ ] `module/ai/actions/index.ts` export 추가
- [ ] Inngest 대시보드에서 `generate-explanation` 함수 확인
- [ ] 기존 webhook에 `pull_request_review_comment` 이벤트 추가

---

## 향후 개선 사항

1. **캐싱**: 동일 타겟에 대한 반복 요청 캐싱
2. **스트리밍**: 긴 설명의 경우 스트리밍 응답
3. **다국어 지원**: 설명 언어 선택 옵션
4. **북마크**: 유용한 설명을 저장하는 기능
5. **피드백**: "도움이 되었나요?" 반응 버튼

---

**Document Version:** 1.0
**Last Updated:** 2025-12-31
**Status:** Ready for Implementation
**Prerequisites:** PR Summary Feature (`docs/archive/2026-02-pr-summary-feature.md`)
