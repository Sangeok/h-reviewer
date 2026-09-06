---
status: "completed"
created-at: "2025-12-31"
completed-at: "2025-12-31"
owners: []
related: []
primary-area: "frontend/code-quality"
observed-environments: ["historical checkout | source review | TypeScript/React | reviewer"]
conclusion-summary: "원문에 결론과 권고가 정리된 과거 정적 조사 기록이다. 조사 완료가 권고한 코드 변경의 완료를 뜻하지 않는다."
follow-up: []
legacy-record: true
migrated-at: "2026-09-06"
migrated-from: "docs/archive/2024-12-refactoring-recommendations.md"
migration-note: "원문에 결론과 권고가 정리된 과거 정적 조사 기록이다. 조사 완료가 권고한 코드 변경의 완료를 뜻하지 않는다."
---

# HReviewer 리팩토링 권장사항

> 작성일: 2025-12-31
> 버전: 1.0
> 분석 범위: 전체 코드베이스

## 📋 목차

1. [개요](#개요)
2. [코드 조직 및 모듈 구조](#1-코드-조직-및-모듈-구조)
3. [중복 코드 패턴](#2-중복-코드-패턴)
4. [네이밍 컨벤션 불일치](#3-네이밍-컨벤션-불일치)
5. [에러 핸들링 누락](#4-에러-핸들링-누락)
6. [타입 안전성 문제](#5-타입-안전성-문제)
7. [컴포넌트 구조 및 재사용성](#6-컴포넌트-구조-및-재사용성)
8. [API 라우트 조직](#7-api-라우트-조직)
9. [데이터베이스 쿼리 패턴](#8-데이터베이스-쿼리-패턴)
10. [누락된 추상화 및 유틸리티](#9-누락된-추상화-및-유틸리티)
11. [코드 품질 및 유지보수성](#10-코드-품질-및-유지보수성)
12. [요약 및 우선순위](#요약-및-우선순위)

---

## 개요

본 문서는 HReviewer 프로젝트의 코드베이스를 전체적으로 분석하여 리팩토링이 필요한 영역을 식별하고 구체적인 개선 방안을 제시합니다. 총 **10개 카테고리**에서 **60개 이상의 개선 기회**를 발견했습니다.

### 분석 대상

- `/app` 디렉토리 구조
- `/module` 디렉토리 조직
- `/components` 구조
- `/lib` 유틸리티
- `/prisma` 스키마
- API 라우트
- 서버 액션 패턴
- 훅 패턴
- TypeScript 사용

---

## 1. 코드 조직 및 모듈 구조

### 🔴 문제점

#### 1.1 모듈 액션 내 혼재된 관심사

**파일**: `module/repository/ui/repository-list.tsx` (10-20라인)

- `Repository` 인터페이스를 로컬에 정의 → 공유 타입 파일로 이동 필요
- 7개의 서로 다른 소스에서 import → 일관성 부족

**파일**: `module/dashboard/actions/index.ts` (9-106라인)

- 3개 함수가 하나의 파일에 ~150라인
- 반복되는 인증 로직 (10-16, 61-66, 111-116라인) - 3곳에서 동일한 인증 체크
- 혼재된 책임: 기여 통계, 대시보드 통계, 월별 활동

### ✅ 개선 방안

### 📊 영향도

- **심각도**: 중간
- **작업량**: 2-3시간
- **우선순위**: 2

## 4. 에러 핸들링 누락

### 🔴 심각도: 높음

#### 4.1 웹훅 핸들러의 조용한 실패

**파일**: `app/api/webhooks/github/route.ts:21-23`

```typescript
// ❌ 문제: await 없이 비동기 작업, 처리되지 않은 프로미스
reviewPullRequest(onwer, repoName, prNumber)
  .then(() => console.log(...))
  .catch((error) => console.error(...));
// 호출자에게 에러 전파 없음
```

#### 4.2 API 에러 처리 누락

**위치**:

- `module/github/lib/github.ts:70` - `response: any`로 검증 없음
- `module/github/lib/github.ts:84-92` - GitHub API 호출에 에러 핸들링 없음
- `module/ai/lib/rag.ts:62` - 검증 없는 `as string` 캐스팅

#### 4.3 검증 누락

**위치**:

- `module/repository/ui/repository-list.tsx:58-62` - 필터링된 repos에 타입 가드 없음
- `module/github/lib/github.ts:175-205` - 깊이 제한이나 크기 보호 장치 없는 재귀 파일 가져오기

#### 4.4 조용한 catch 블록

**위치**:

- `module/ai/lib/rag.ts:33-35` - 임베딩 에러를 조용히 건너뛰고 계속 진행
- `module/github/lib/github.ts:153-156` - 세부 로깅 없이 웹훅 삭제 에러에 대해 false 반환

### ✅ 개선 방안

```typescript
// 1. 커스텀 에러 클래스 생성
// lib/errors.ts
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class GitHubAPIError extends Error {
  constructor(message: string, public statusCode?: number, public response?: unknown) {
    super(message);
    this.name = "GitHubAPIError";
  }
}

// 2. 웹훅 핸들러 개선
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const [owner, repoName] = payload.repository.full_name.split("/");
    const prNumber = payload.pull_request.number;

    // await 사용하여 적절한 에러 처리
    await reviewPullRequest(owner, repoName, prNumber);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    // 적절한 상태 코드 반환
    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
  }
}

// 3. 재귀 깊이 제한 추가
async function fetchRepositoryContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string = "",
  depth: number = 0,
  maxDepth: number = 10 // 최대 깊이 제한
): Promise<FileContent[]> {
  if (depth > maxDepth) {
    throw new Error(`Max depth ${maxDepth} exceeded`);
  }
  // ... 구현
}

// 4. 타입 가드 추가
function isValidRepository(repo: unknown): repo is Repository {
  return typeof repo === "object" && repo !== null && "id" in repo && "fullName" in repo;
}
```

### 📊 영향도

- **심각도**: 높음
- **작업량**: 4-5시간
- **우선순위**: 1
- **예상 효과**: 런타임 에러 ~40% 감소, 디버깅 시간 단축

---

## 5. 타입 안전성 문제

### 🔴 심각도: 높음

#### 5.1 코드베이스 전반의 `any` 타입

**위치**:

- `module/github/lib/github.ts:28` - `repo: any`
- `module/github/lib/github.ts:70` - `response: any`
- `module/github/lib/github.ts:108, 140` - `hook: any`
- `module/dashboard/actions/index.ts:39, 40, 145-146, 190-191` - 다수의 `any` 캐스팅
- `module/ai/lib/rag.ts:62` - `match.metadata?.content as string`

#### 5.2 타입 정의 누락

**문제**:

- GitHub API 응답에 대한 타입 없음
- `Repository` 인터페이스가 컴포넌트에만 존재, 공유되지 않음
- Octokit 응답에 대한 타입 없음

#### 5.3 안전하지 않은 타입 단언

**위치**:

- `module/github/lib/github.ts:239` - `diff as unknown as string`
- `module/ai/lib/rag.ts:62` - 타입 가드 없는 Map

### ✅ 개선 방안

```typescript
// 1. GitHub API 타입 정의
// types/github.ts
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
    avatar_url: string;
  };
  description: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  language: string | null;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: "open" | "closed";
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  diff_url: string;
}

// 2. any 제거 및 적절한 타입 사용
// module/github/lib/github.ts
export async function getRepositories(token: string): Promise<GitHubRepository[]> {
  const octokit = new Octokit({ auth: token });

  // ❌ Before
  const { data: repositories } = await octokit.rest.repos.listForAuthenticatedUser();
  return repositories as any;

  // ✅ After
  const { data: repositories } = await octokit.rest.repos.listForAuthenticatedUser();
  return repositories.map((repo) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    // ... 타입 안전한 매핑
  }));
}

// 3. 공유 타입 생성
// types/database.ts
import type { Repository, Review, User } from "@/lib/generated/prisma/client";

export type RepositoryWithReviews = Repository & {
  reviews: Review[];
};

export type ReviewWithRepository = Review & {
  repository: Repository;
};

// 4. 타입 가드 구현
function isGitHubRepository(obj: unknown): obj is GitHubRepository {
  return typeof obj === "object" && obj !== null && "id" in obj && "full_name" in obj && "owner" in obj;
}
```

### 📊 영향도

- **심각도**: 높음
- **작업량**: 5-6시간
- **우선순위**: 1
- **예상 효과**: 타입 안전성 90%+ 확보, 런타임 에러 사전 방지

---

## 6. 컴포넌트 구조 및 재사용성

### 🔴 문제점

#### 6.1 거대한 모놀리식 컴포넌트

**파일**: `module/repository/ui/repository-list.tsx` (217라인)

**처리하는 기능**:

- 무한 스크롤 로직 (32-54라인)
- 검색 필터링 (58-62라인)
- 레포지토리 렌더링 (125-202라인)

**분리 필요**: `RepositoryList` (컨테이너) + `RepositoryCard` (표현)

#### 6.2 반복되는 카드 컴포넌트

**파일**: `module/review/ui/review-list.tsx:61-158` (100+라인)

동일한 그라디언트, 호버 효과, 레이아웃이 3개 이상 컴포넌트에서 반복됨

#### 6.3 복잡한 인라인 스타일링

**위치**:

- `module/repository/ui/repository-list.tsx:118` - 150+ 문자 className
- `components/layouts/app-sidebar/ui/app-sidebar.tsx:79-92` - 간단한 애니메이션을 위한 스타일 JSX

### ✅ 개선 방안

```typescript
// 1. RepositoryCard 추출
// module/repository/ui/parts/repository-card.tsx
interface RepositoryCardProps {
  repository: Repository;
  onConnect: (repo: Repository) => void;
  onDisconnect: (repo: Repository) => void;
}

export function RepositoryCard({ repository, onConnect, onDisconnect }: RepositoryCardProps) {
  return <GradientCard>{/* 카드 내용 */}</GradientCard>;
}

// 2. 재사용 가능한 GradientCard 래퍼
// components/ui/gradient-card.tsx
interface GradientCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "hover" | "active";
}

export function GradientCard({ children, className, variant = "default" }: GradientCardProps) {
  const variants = {
    default: "bg-gradient-to-br from-white/5 to-white/10",
    hover: "hover:from-white/10 hover:to-white/15 transition-all",
    active: "from-white/15 to-white/20",
  };

  return <div className={cn(variants[variant], className)}>{children}</div>;
}

// 3. RepositoryList 간소화
// module/repository/ui/repository-list.tsx
export default function RepositoryList() {
  const { repositories, loading } = useRepositories();
  const { searchQuery } = useSearch();
  const filteredRepos = useFilteredRepositories(repositories, searchQuery);

  return (
    <InfiniteScroll onLoadMore={loadMore}>
      {filteredRepos.map((repo) => (
        <RepositoryCard key={repo.id} repository={repo} />
      ))}
    </InfiniteScroll>
  );
}
```

### 📊 영향도

- **심각도**: 중간
- **작업량**: 4-5시간
- **우선순위**: 2
- **예상 효과**: 컴포넌트 재사용성 50% 증가, 코드 중복 감소

---

## 7. API 라우트 조직

### 🔴 문제점

#### 7.1 에러 핸들링 불일치

**파일**: `app/api/webhooks/github/route.ts`

**문제**:

- 모든 경우에 200 반환 (27라인: "Event Processes")
- 에러에 대해 4xx/5xx 반환해야 함
- 웹훅 서명 검증 없음

#### 7.2 요청 검증 누락

**문제**:

- GitHub에서 온 요청인지 검증 없음
- GitHub 웹훅 서명 확인 없음
- 18라인: 구조 분해 시 오타 `[onwer, repoName]`

#### 7.3 Fire-and-forget 비동기 작업

**문제**:

- 21라인: 적절한 에러 핸들링이나 타임아웃 없는 비동기 작업
- 실패한 리뷰에 대한 재시도 로직 없음

### ✅ 개선 방안

```typescript
// 1. GitHub 웹훅 서명 검증 미들웨어
// lib/middleware/verify-github-webhook.ts
import crypto from "crypto";

export function verifyGitHubWebhook(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(payload).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

// 2. 개선된 웹훅 핸들러
// app/api/webhooks/github/route.ts
export async function POST(request: Request) {
  try {
    // 서명 검증
    const signature = request.headers.get("x-hub-signature-256");
    const payload = await request.text();

    if (!signature || !verifyGitHubWebhook(payload, signature, process.env.GITHUB_WEBHOOK_SECRET!)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const data = JSON.parse(payload);
    const [owner, repoName] = data.repository.full_name.split("/");
    const prNumber = data.pull_request.number;

    // await로 적절한 에러 처리
    await reviewPullRequest(owner, repoName, prNumber);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);

    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// 3. 재시도 로직 추가 (Inngest 통합)
// app/api/inngest/functions/review-pr.ts
export const reviewPullRequest = inngest.createFunction(
  {
    id: "review-pull-request",
    retries: 3, // 재시도 3회
    timeout: "5m", // 타임아웃 5분
  },
  { event: "github/pull_request.opened" },
  async ({ event, step }) => {
    const { owner, repo, prNumber } = event.data;

    await step.run("review-code", async () => {
      return await performCodeReview(owner, repo, prNumber);
    });
  }
);
```

### 📊 영향도

- **심각도**: 중간
- **작업량**: 3-4시간
- **우선순위**: 2
- **예상 효과**: 보안 강화, 신뢰성 향상

---

## 8. 데이터베이스 쿼리 패턴

### 🔴 문제점

#### 8.1 N+1 쿼리 패턴

**위치**:

- `module/review/actions/index.ts:16-28` - 단일 쿼리에 repository 포함 (좋음)
- `module/ai/actions/index.ts:7-23` - 단일 쿼리 대신 여러 repository 조회

#### 8.2 비효율적인 데이터 가져오기

**파일**: `module/repository/actions/index.ts:18-31`

**문제**:

- 클라이언트에서 `isConnected` 체크를 위해 모든 연결된 repos 가져옴
- 서버에서 `connectedIds` 전달해야 함

**파일**: `module/ai/lib/rag.ts:50-62`

- RAG 결과에 페이지네이션이나 제한 없음

#### 8.3 누락된 데이터베이스 제약조건

**파일**: `prisma/schema.prisma`

**문제**:

- 97라인: Status 필드가 enum 대신 `String`
- 110라인: ReviewCounts가 타입 안전성 없이 JSON으로 저장됨
- 자주 쿼리되는 필드에 인덱스 없음

#### 8.4 수동 데이터 집계

**파일**: `module/dashboard/actions/index.ts:131-196`

**문제**:

- Prisma의 `group_by`나 데이터베이스 집계 대신 앱에서 수동으로 월별 데이터 집계

### ✅ 개선 방안

```typescript
// 1. Prisma 스키마에 enum 추가
// prisma/schema.prisma
enum ReviewStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
}

model Review {
  id           String       @id @default(cuid())
  status       ReviewStatus @default(PENDING) // String 대신 enum
  // ... 기타 필드

  @@index([userId, status]) // 복합 인덱스 추가
  @@index([createdAt])
}

// 2. 효율적인 쿼리 헬퍼
// lib/query-builders.ts
export function buildRepositoryQuery(userId: string) {
  return {
    where: { userId },
    select: {
      id: true,
      fullName: true,
      description: true,
      language: true,
      isConnected: true,
      _count: {
        select: { reviews: true }
      }
    },
    orderBy: { updatedAt: "desc" as const }
  };
}

// 3. 데이터베이스 집계 사용
// module/dashboard/actions/getMonthlyActivity.ts
export async function getMonthlyActivity(userId: string) {
  const monthlyData = await prisma.review.groupBy({
    by: ["createdAt"],
    where: {
      userId,
      createdAt: {
        gte: new Date(new Date().setMonth(new Date().getMonth() - 6))
      }
    },
    _count: {
      id: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  // 월별로 그룹화
  const grouped = monthlyData.reduce((acc, item) => {
    const month = new Date(item.createdAt).toLocaleString("default", { month: "short" });
    acc[month] = (acc[month] || 0) + item._count.id;
    return acc;
  }, {} as Record<string, number>);

  return grouped;
}

// 4. 페이지네이션 추가
// module/ai/lib/rag.ts
export async function searchSimilarCode(
  query: string,
  topK: number = 5,
  maxChars: number = 8000
): Promise<string[]> {
  // ... 임베딩 생성

  const results = await index.query({
    vector: embedding,
    topK, // 결과 수 제한
    includeMetadata: true,
  });

  return results.matches
    .slice(0, topK) // 추가 제한
    .map(match => {
      const content = match.metadata?.content as string;
      return content?.slice(0, maxChars) || "";
    })
    .filter(Boolean);
}
```

### 📊 영향도

- **심각도**: 중간
- **작업량**: 4-5시간
- **우선순위**: 3
- **예상 효과**: 쿼리 성능 30-50% 개선

---

## 9. 누락된 추상화 및 유틸리티

### 🔴 필요한 추상화

#### 9.1 인증 유틸리티

```typescript
// lib/server-utils.ts
export async function requireAuthSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    throw new UnauthorizedError();
  }
  return session;
}

export async function getAuthUser() {
  const session = await requireAuthSession();
  return session.user;
}

export async function getGithubToken(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "github" },
    select: { accessToken: true },
  });

  if (!account?.accessToken) {
    throw new Error("GitHub token not found");
  }

  return account.accessToken;
}
```

#### 9.2 에러 핸들링

```typescript
// lib/errors.ts
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = "NotFoundError";
  }
}

export class GitHubAPIError extends Error {
  constructor(message: string, public statusCode?: number, public response?: unknown) {
    super(message);
    this.name = "GitHubAPIError";
  }
}

export class RateLimitError extends Error {
  constructor(public resetAt: Date, public limit: number) {
    super(`Rate limit exceeded. Resets at ${resetAt.toISOString()}`);
    this.name = "RateLimitError";
  }
}
```

#### 9.3 쿼리 빌더

```typescript
// lib/query-builders.ts
export function buildRepositoryQuery(userId: string) {
  return {
    where: { userId },
    select: {
      id: true,
      fullName: true,
      description: true,
      language: true,
      isConnected: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { reviews: true },
      },
    },
    orderBy: { updatedAt: "desc" as const },
  };
}

export function buildReviewQuery(
  userId: string,
  filters?: {
    status?: ReviewStatus;
    repositoryId?: string;
  }
) {
  return {
    where: {
      userId,
      ...(filters?.status && { status: filters.status }),
      ...(filters?.repositoryId && { repositoryId: filters.repositoryId }),
    },
    include: {
      repository: {
        select: {
          id: true,
          fullName: true,
          language: true,
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
  };
}
```

#### 9.4 상수 중앙화

**현재 문제**:

- 컴포넌트 전반에 하드코딩된 색상 값: `#e0e0e0`, `#2d3e2d`, `#0a0a0a`
- `SIDEBAR_STYLES`는 `components/layouts/app-sidebar/constants/styles.ts`에 존재하지만 다른 곳에는 없음

```typescript
// lib/theme.ts
export const THEME_COLORS = {
  gradient: {
    card: {
      from: "from-white/5",
      to: "to-white/10",
      hoverFrom: "hover:from-white/10",
      hoverTo: "hover:to-white/15",
    },
    primary: {
      from: "from-blue-500",
      to: "to-purple-600",
    },
  },
  status: {
    success: "#10b981",
    error: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
  },
} as const;

// lib/constants.ts
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  INFINITE_SCROLL_THRESHOLD: 0.1,
} as const;

export const RAG = {
  MAX_CONTENT_LENGTH: 8000,
  BATCH_SIZE: 100,
  DEFAULT_TOP_K: 5,
} as const;

export const SAMPLE_DATA = {
  REVIEW_COUNT: 45,
  CONNECTED_REPOS: 30,
  AI_REVIEWS: 44,
} as const;
```

#### 9.5 타입 정의

```typescript
// types/github.ts
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  // ... 전체 타입 정의
}

// types/database.ts
import type { Repository, Review, User } from "@/lib/generated/prisma/client";

export type RepositoryWithReviews = Repository & {
  reviews: Review[];
  _count: { reviews: number };
};

export type ReviewWithRepository = Review & {
  repository: Pick<Repository, "id" | "fullName" | "language">;
};

// types/ui.ts
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export interface CardProps extends BaseComponentProps {
  variant?: "default" | "gradient" | "outlined";
  padding?: "sm" | "md" | "lg";
}
```

### 📊 영향도

- **심각도**: 중간
- **작업량**: 6-8시간
- **우선순위**: 2
- **예상 효과**: 코드 재사용성 60% 증가, 유지보수성 향상

---

## 10. 코드 품질 및 유지보수성

### 🔴 문제점

#### 10.1 주석 처리된 코드

**파일**: `module/github/lib/github.ts:6-19`

**문제**: 대량의 주석 처리된 TypeScript 타입 정의

**조치**: 제거하거나 존재 이유 문서화

#### 10.2 프로덕션 코드의 TODO 항목

**위치 및 내용**:

- `module/dashboard/actions/index.ts:76` - "TODO : FETCH TOTAL CONNTEDD REPO FROM DB"
- `module/dashboard/actions/index.ts:90` - "TODO: COUNT AI REVIEWS FROM DB"
- `module/dashboard/actions/index.ts:158` - "TODO : REVIEWS'S REAL DATA"

**문제**: 모두 하드코딩된 플레이스홀더 값 사용 (30, 44, 랜덤 생성)

#### 10.3 프로덕션의 디버깅 코드

**문제**:

- 구조화된 로깅 없이 여러 `console.error()` 호출
- 에러 추적 또는 모니터링 설정 없음

#### 10.4 일관성 없는 반환 타입

**문제**:

- `module/review/actions/index.ts` - `success`와 `message`가 있는 객체 반환
- 다른 액션들은 데이터를 직접 반환하거나 에러를 throw
- 표준화된 API 응답 형식 없음

#### 10.5 매직 넘버

**위치**:

- `module/ai/lib/rag.ts:20` - 하드코딩된 8000자 자르기
- `module/ai/lib/rag.ts:39` - 하드코딩된 100 배치 크기
- `module/repository/ui/repository-list.tsx:40` - 하드코딩된 0.1 임계값
- `module/repository/hooks/use-repositories.ts:9` - 하드코딩된 페이지당 10개
- `module/dashboard/actions/index.ts:164` - 하드코딩된 45개 샘플 리뷰

### ✅ 개선 방안

```typescript
// 1. TODO 완료 및 실제 데이터 사용
// module/dashboard/actions/getDashboardStats.ts
export async function getDashboardStats(userId: string) {
  const session = await getAuthSession();

  // ✅ 실제 DB 쿼리 사용
  const totalRepos = await prisma.repository.count({
    where: { userId, isConnected: true },
  });

  const aiReviews = await prisma.review.count({
    where: { userId, status: "COMPLETED" },
  });

  const avgReviewTime = await prisma.review.aggregate({
    where: { userId },
    _avg: { reviewTime: true },
  });

  return {
    totalRepos,
    aiReviews,
    avgReviewTime: avgReviewTime._avg.reviewTime || 0,
  };
}

// 2. 구조화된 로깅
// lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
    },
  },
});

// 사용
logger.error({ err, context: { userId, repoId } }, "Failed to fetch repository");

// 3. 표준화된 API 응답
// types/api.ts
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

// lib/api-response.ts
export function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function error(message: string, code?: string): ApiResponse {
  return {
    success: false,
    error: { message, code },
  };
}

// 4. 상수로 매직 넘버 대체
// lib/constants.ts
export const RAG_CONFIG = {
  MAX_CONTENT_LENGTH: 8000,
  BATCH_SIZE: 100,
  DEFAULT_TOP_K: 5,
} as const;

export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  SCROLL_THRESHOLD: 0.1,
} as const;

// 사용
const truncated = content.slice(0, RAG_CONFIG.MAX_CONTENT_LENGTH);
```

### 📊 영향도

- **심각도**: 중간
- **작업량**: 3-4시간
- **우선순위**: 2
- **예상 효과**: 코드 품질 향상, 디버깅 용이성 증가

---

## 요약 및 우선순위

### 📊 카테고리별 요약

| 카테고리          | 심각도 | 개수 | 우선순위 | 예상 작업량 |
| ----------------- | ------ | ---- | -------- | ----------- |
| 중복 코드         | 높음   | 15+  | 1        | 3-4시간     |
| 타입 안전성       | 높음   | 10+  | 1        | 5-6시간     |
| 에러 핸들링 누락  | 높음   | 8    | 1        | 4-5시간     |
| 누락된 추상화     | 중간   | 5    | 2        | 6-8시간     |
| 컴포넌트 크기     | 중간   | 3    | 2        | 4-5시간     |
| 네이밍 불일치     | 중간   | 6    | 3        | 1-2시간     |
| TODO/미완성 코드  | 중간   | 3    | 2        | 3-4시간     |
| API 라우트 문제   | 중간   | 3    | 2        | 3-4시간     |
| 데이터베이스 패턴 | 중간   | 4    | 3        | 4-5시간     |
| 코드 품질         | 낮음   | 5    | 4        | 3-4시간     |

**총 예상 작업량**: 37-47시간

### 🎯 빠른 개선 (Quick Wins)

다음 항목들은 적은 노력으로 큰 효과를 볼 수 있습니다:

1. **오타 수정**: `onwer` → `owner` (`app/api/webhooks/github/route.ts:18`)
2. **색상 상수화**: Tailwind config로 색상 값 이동
3. **카드 스타일 추출**: 재사용 가능한 컴포넌트로 추출
4. **인증 헬퍼 생성**: `lib/server-utils.ts`에 `requireAuthSession()` 생성
5. **주석 처리된 코드 제거**: `github.ts`의 주석 처리된 TypeScript 타입 정의 제거
6. **매직 넘버 상수화**: 상수 파일 생성

**예상 작업량**: 2-3시간
**예상 효과**: 즉각적인 코드 품질 향상

### 📋 우선순위별 실행 계획

#### Phase 1: 긴급 (우선순위 1) - 12-15시간

1. **중복 코드 제거**

   - `lib/server-utils.ts` 생성 및 인증 로직 통합
   - Octokit 싱글톤/팩토리 생성
   - 카드 스타일 컴포넌트 추출

2. **타입 안전성 강화**

   - `types/github.ts`, `types/database.ts` 생성
   - 모든 `any` 타입을 적절한 타입으로 교체
   - 타입 가드 구현

3. **에러 핸들링 개선**
   - `lib/errors.ts` 생성
   - 웹훅 핸들러 에러 처리 개선
   - 재귀 함수에 깊이 제한 추가

#### Phase 2: 중요 (우선순위 2) - 16-21시간

4. **누락된 추상화 생성**

   - 쿼리 빌더, 유틸리티 함수 생성
   - 상수 파일 중앙화
   - 공유 타입 정의

5. **컴포넌트 구조 개선**

   - 대형 컴포넌트 분리
   - 재사용 가능한 UI 컴포넌트 추출

6. **TODO 완료 및 품질 개선**

   - 플레이스홀더 데이터를 실제 DB 쿼리로 교체
   - 구조화된 로깅 구현
   - API 응답 형식 표준화

7. **API 라우트 개선**
   - 웹훅 서명 검증 추가
   - 적절한 HTTP 상태 코드 반환
   - 재시도 로직 구현

#### Phase 3: 개선 (우선순위 3-4) - 9-11시간

8. **네이밍 표준화**

   - 오타 수정
   - 일관된 네이밍 컨벤션 적용

9. **데이터베이스 최적화**

   - Prisma enum 추가
   - 인덱스 생성
   - 쿼리 최적화

10. **코드 정리**
    - 주석 처리된 코드 제거
    - 매직 넘버 상수화
    - 디버깅 코드 제거

---

## 💡 추가 권장사항

### 1. 성능 모니터링

```typescript
// lib/monitoring.ts
import { logger } from "./logger";

export function withTiming<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  return fn().finally(() => {
    const duration = Date.now() - start;
    logger.info({ name, duration }, "Operation completed");
  });
}
```

### 2. 문서화

각 모듈에 README.md 추가:

```markdown
# Repository Module

## Overview

레포지토리 관리 기능을 담당하는 모듈입니다.

## Structure

- `actions/` - 서버 액션
- `ui/` - UI 컴포넌트
- `hooks/` - React 훅
- `types/` - TypeScript 타입 정의
- `constants/` - 상수 정의

## Usage

...
```

---

## 결론

본 리팩토링 계획을 단계적으로 실행하면 다음과 같은 효과를 기대할 수 있습니다:

- ✅ **코드 중복 30% 감소**
- ✅ **타입 안전성 90% 이상 확보**
- ✅ **런타임 에러 40% 감소**
- ✅ **쿼리 성능 30-50% 개선**
- ✅ **컴포넌트 재사용성 50% 증가**
- ✅ **유지보수성 대폭 향상**

**총 예상 작업량**: 37-47시간 (약 1주일)

각 단계를 완료한 후 테스트와 검증을 거쳐 안전하게 진행하시기 바랍니다.
