# 프로젝트 네이밍 컨벤션

## 목차

1. [개요](#개요)
2. [기본 원칙](#기본-원칙)
3. [함수 네이밍 규칙](#함수-네이밍-규칙)
4. [파일 및 폴더 네이밍](#파일-및-폴더-네이밍)
5. [변수 네이밍](#변수-네이밍)
6. [상수 네이밍](#상수-네이밍)
7. [타입 및 인터페이스 네이밍](#타입-및-인터페이스-네이밍)
8. [실제 예제](#실제-예제)

---

## 개요

이 문서는 코드 요소의 **네이밍 규칙**을 정의합니다.
라우팅 동작, 아키텍처 폴더 구조, 렌더링 전략 같은 비네이밍 규칙은 별도 문서에서 관리합니다.

### 핵심 목표

- **일관성**: 프로젝트 전체에서 동일한 네이밍 패턴 사용
- **명확성**: 이름만으로 함수/변수의 역할을 파악 가능
- **예측 가능성**: 유사한 기능은 유사한 네이밍 패턴 사용
- **범위 명확화**: 네이밍 규칙과 비네이밍 규칙을 분리하여 혼동 방지

---

## 기본 원칙

### 케이스 스타일

| 항목 | 케이스 | 예시 |
|------|--------|------|
| 파일명 | kebab-case | `user-profile.tsx`, `get-dashboard-stats.ts` |
| 폴더명 | kebab-case | `app-sidebar/`, `user-settings/` |
| 함수/변수 | camelCase | `getUserRepositories`, `totalRepos` |
| 컴포넌트 | PascalCase | `RepositoryList`, `AppSidebar` |
| 타입/인터페이스 | PascalCase | `DashboardStats`, `Repository` |
| 상수 | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE`, `DEFAULT_TIMEOUT` |
| 데이터베이스 테이블/필드 | snake_case | `created_at`, `user_id` |

### 서버/클라이언트 컴포넌트 파일명 패턴 (팀 기본값)

Next.js App Router 환경에서는 기본적으로 파일명에 환경 접미사를 붙이지 않고 일반 컴포넌트 네이밍 패턴을 따릅니다.
다만 마이그레이션이나 외부 도구 연동 등 사유가 명확하면 `.server.tsx`, `.client.tsx` 접미사를 예외적으로 사용할 수 있습니다.

```typescript
// ✅ 권장 예 (기본값)
// user-profile.tsx
// counter.tsx

// ⚠️ 예외 허용 예 (사유가 명확할 때)
// user-profile.server.tsx
// counter.client.tsx
```

### 명명 원칙

1. **의미 있는 이름**: 약어 사용 최소화, 명확한 의미 전달
2. **동사 우선**: 함수는 동작을 표현하는 동사로 시작
3. **일관된 어휘**: 같은 개념에는 같은 단어 사용
4. **간결함**: 불필요하게 길지 않게 (2-4 단어 권장)

---

## 함수 네이밍 규칙

### 1. React 훅 (Hooks)

**규칙**: `use` 접두사 사용

```typescript
// ✅ 좋은 예
function useRepositories() { ... }
function useConnectRepository() { ... }
function useSession() { ... }
function useDashboardStats() { ... }

// ❌ 나쁜 예
function repositories() { ... }          // use- 접두사 누락
function getRepositories() { ... }       // 훅이 아닌 일반 함수 네이밍
function hookRepositories() { ... }      // 비표준 접두사
```

#### React 19 새로운 훅 패턴

React 19에서 추가된 훅들의 변수 네이밍 패턴:

```typescript
// ✅ useActionState — 폼 액션 상태 관리
const [state, action, isPending] = useActionState(submitForm, initialState);

// ✅ useFormStatus — 부모 <form>의 제출 상태
const { pending, data, method, action } = useFormStatus();

// ✅ useOptimistic — 낙관적 UI 업데이트
const [optimisticMessages, addOptimisticMessage] = useOptimistic(
  messages,
  (currentMessages, newMessage) => [...currentMessages, newMessage]
);

// ✅ use() — 프로미스 또는 컨텍스트 읽기
const theme = use(ThemeContext);
const data = use(fetchDataPromise);

// ⚠️ 주의 예
const [formState, formAction, loading] = useActionState(fn, init);  // loading보다 isPending 선호
const [optimistic, setOptimistic] = useOptimistic(state, fn);       // setOptimistic도 가능하지만 add/update 같은 도메인 동사명을 우선 권장
```

### 2. 서버 액션 (Server Actions)

#### 2.1 데이터 조회 (Read)

**규칙**: `get` 또는 `fetch` 중 하나를 팀 단위로 선택해 일관되게 사용

```typescript
// ✅ 좋은 예
export async function getUserRepositories(page: number, perPage: number) { ... }
export async function getDashboardStats() { ... }
export async function getRepositoryById(id: string) { ... }
export async function getMonthlyActivity() { ... }
export async function fetchUserContribution(token: string, username: string) { ... } // 팀 표준이 fetch일 때

// ⚠️ 주의 예
export async function fetchRepositories() { ... }      // 팀 표준이 get이면 혼용하지 않기
export async function repositories() { ... }           // 동사 누락
export async function retrieveRepositories() { ... }   // 팀 표준 어휘와 불일치
```

#### 2.2 데이터 생성 (Create)

**규칙**: `create`를 기본으로 사용하고, 도메인 의미가 더 명확할 때만 `add` 허용

```typescript
// ✅ 좋은 예
export async function createReview(data: ReviewInput) { ... }
export async function createWebhook(owner: string, repo: string) { ... }
export async function createRepository(data: RepositoryInput) { ... }
export async function addMemberToTeam(teamId: string, userId: string) { ... } // 관계 추가 의미가 명확할 때

// ⚠️ 주의 예
export async function addReview() { ... }          // 팀 표준이 create라면 혼용하지 않기
export async function newReview() { ... }          // new 대신 create 사용
export async function insertReview() { ... }       // DB 용어 노출
```

#### 2.3 데이터 수정 (Update)

**규칙**: `update`를 기본으로 사용하고, 도메인 맥락상 더 정확한 동사가 있으면 허용

```typescript
// ✅ 좋은 예
export async function updateReview(id: string, data: Partial<Review>) { ... }
export async function updateUserSettings(settings: UserSettings) { ... }
export async function editDraft(draftId: string, content: string) { ... } // "초안 편집"처럼 의미가 더 분명할 때

// ⚠️ 주의 예
export async function modifyReview() { ... }       // 팀 표준 어휘와 불일치
export async function changeReview() { ... }       // 팀 표준 어휘와 불일치
```

#### 2.4 데이터 삭제 (Delete)

**규칙**: `delete`를 기본으로 사용하고, UI/도메인 의미에 맞을 때 `remove` 허용

```typescript
// ✅ 좋은 예
export async function deleteReview(id: string) { ... }
export async function deleteWebhook(hookId: number) { ... }
export async function removeTag(postId: string, tagId: string) { ... } // 관계 제거 의미가 분명할 때

// ⚠️ 주의 예
export async function removeReview() { ... }       // 팀 표준이 delete라면 혼용하지 않기
export async function destroyReview() { ... }      // destroy 대신 delete 사용
```

#### 2.5 비즈니스 로직 (Business Logic)

**규칙**: 명확한 동사 사용

```typescript
// ✅ 좋은 예
export async function connectRepository(owner: string, repo: string) { ... }
export async function disconnectRepository(id: string) { ... }
export async function reviewPullRequest(owner: string, repo: string, prNumber: number) { ... }
export async function syncRepositoryData(repoId: string) { ... }

// ❌ 나쁜 예
export async function repository() { ... }         // 동사 누락
export async function doConnect() { ... }          // 불필요한 do 접두사
export async function handleRepository() { ... }   // handle은 이벤트 핸들러용
```

### 3. 이벤트 핸들러

**규칙**: `handle` 또는 `on` 접두사 사용

```typescript
// ✅ 좋은 예
function handleClick() { ... }
function handleSubmit(event: FormEvent) { ... }
function onConnect(repo: Repository) { ... }
function onDisconnect(repo: Repository) { ... }

// ❌ 나쁜 예
function click() { ... }                    // handle/on 접두사 누락
function doClick() { ... }                  // do 대신 handle 사용
function clickHandler() { ... }             // 접미사 대신 접두사 사용
```

### 4. 유틸리티 함수

**규칙**: 명확한 동사 사용

```typescript
// ✅ 좋은 예
function formatDate(date: Date): string { ... }
function validateEmail(email: string): boolean { ... }
function parseGitHubUrl(url: string): { owner: string; repo: string } { ... }
function generateRandomId(): string { ... }

// ❌ 나쁜 예
function date(d: Date) { ... }              // 동사 누락
function checkEmail(email: string) { ... }  // check 대신 validate 사용
function utils() { ... }                    // 의미 없는 이름
```

### 5. Helper 함수 (내부 전용)

**규칙**: 명확한 의미의 이름을 부여

```typescript
// ✅ 좋은 예
function initializeMonthlyData(): Record<string, MonthlyStats> { ... }
function generateSampleReviews(): { createdAt: Date }[] { ... }
function aggregateContributions(weeks: ContributionWeek[]): number { ... }

// ❌ 나쁜 예
const helper = () => { ... }                // 의미 없는 이름
function _privateHelper() { ... }           // 불필요한 언더스코어 접두사 사용
```

### 6. API 라우트 핸들러

**규칙**: HTTP 메서드명 사용 (대문자)

```typescript
// ✅ 좋은 예 (app/api/webhooks/github/route.ts)
export async function POST(request: Request) { ... }
export async function GET(request: Request) { ... }
export async function PUT(request: Request) { ... }
export async function DELETE(request: Request) { ... }

// ❌ 나쁜 예
export async function handler() { ... }    // 메서드명 대신 handler 사용
export async function post() { ... }       // 소문자 사용
```

### 7. Next.js 예약 함수

**규칙**: Next.js App Router에서 **정확한 함수명**이 강제되는 예약 함수

```typescript
// ✅ 동적 메타데이터 생성 (app/**/page.tsx 또는 layout.tsx)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(params.id);
  return { title: product.name };
}

// ✅ 정적 경로 생성 (app/**/page.tsx)
export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

// ✅ 뷰포트 설정 (app/**/page.tsx 또는 layout.tsx)
export async function generateViewport({ params }: Props): Promise<Viewport> {
  return { themeColor: '#000000' };
}

// ❌ 나쁜 예
export async function getMetadata() { ... }       // generateMetadata 사용 필수
export async function createStaticParams() { ... } // generateStaticParams 사용 필수
export async function metadata() { ... }           // generate 접두사 필수
```

**주의**: 이 함수명들은 Next.js 프레임워크가 인식하는 예약어이므로, 정확하게 사용해야 합니다.

---

## 파일 및 폴더 네이밍

### 1. 파일명

#### 컴포넌트 파일

```
// ✅ 좋은 예
app-sidebar.tsx
repository-list.tsx
user-profile.tsx

// ❌ 나쁜 예
AppSidebar.tsx              // PascalCase 대신 kebab-case 사용
repositoryList.tsx          // camelCase 대신 kebab-case 사용
```

#### 서버 액션 파일

```
// ✅ 좋은 예
get-dashboard-stats.ts
get-monthly-activity.ts
create-review.ts

// ❌ 나쁜 예
getDashboardStats.ts        // camelCase 대신 kebab-case 사용
dashboard_stats.ts          // snake_case 대신 kebab-case 사용
```

#### 훅 파일

```
// ✅ 좋은 예
use-repositories.ts
use-connect-repository.ts

// ❌ 나쁜 예
useRepositories.ts          // camelCase 대신 kebab-case 사용
repositories-hook.ts        // 접미사 대신 접두사 사용
```

### 2. 폴더명

#### 모듈 구조

```
module/
├── auth/                   ✅ kebab-case
├── repository/            ✅ 단수형
├── dashboard/             ✅ 명확한 의미
└── user-settings/         ✅ 복합어는 하이픈으로 연결

❌ 나쁜 예:
├── Auth/                  // PascalCase
├── repositories/          // 복수형
├── dash/                  // 불명확한 약어
```

#### 폴더 구조 관련 범위

이 문서는 폴더 구조 자체를 강제하지 않습니다.
다만 폴더명을 정할 때는 kebab-case를 유지합니다.

### 3. Next.js App Router 특수 파일

Next.js App Router에서 **정확한 이름이 강제**되는 특수 파일:

```
.
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── loading.tsx
│   ├── error.tsx
│   ├── not-found.tsx
│   ├── route.ts
│   ├── template.tsx
│   └── default.tsx
└── middleware.ts
```

**규칙:**
- 위 파일명은 Next.js 프레임워크가 인식하는 **예약어**이므로 정확하게 사용
- 확장자는 `.tsx` (JSX 포함) 또는 `.ts` (API 라우트, 미들웨어)

```
// ❌ 나쁜 예
app/dashboard/
├── dashboard-page.tsx       // page.tsx 사용 필수
├── dashboard-layout.tsx     // layout.tsx 사용 필수
├── loading-spinner.tsx      // loading.tsx 사용 필수 (로딩 UI용)
```

### 4. Next.js 라우트 폴더 명명 패턴 (요약)

App Router에서 자주 쓰는 네이밍 패턴:

```
(groupName)     # 라우트 그룹
@slotName       # 병렬 라우트 슬롯
[slug]          # 동적 세그먼트
[...slug]       # 캐치올 세그먼트
[[...slug]]     # 선택적 캐치올 세그먼트
(.) (..) (...)  # 인터셉팅 라우트 패턴
```

라우팅 동작 규칙은 이 문서 범위를 벗어나므로 Next.js 공식 문서를 참고합니다.

---

## 변수 네이밍

### 1. 일반 변수

**규칙**: camelCase, 명확한 의미

```typescript
// ✅ 좋은 예
const totalRepos = 30;
const userName = "john_doe";
const isConnected = true;
const createdAt = new Date();

// ❌ 나쁜 예
const total = 30;                   // 불명확
const name = "john_doe";            // 너무 일반적
const connected = true;             // is 접두사 누락
const created = new Date();         // 불완전
```

### 2. Boolean 변수

**규칙**: `is`, `has`, `should`, `can` 접두사 사용

```typescript
// ✅ 좋은 예
const isLoading = false;
const hasError = false;
const shouldUpdate = true;
const canConnect = true;
const isConnected = repo.status === 'connected';

// ❌ 나쁜 예
const loading = false;              // 접두사 누락
const error = false;                // 접두사 누락
const update = true;                // 접두사 누락
```

### 3. 배열/컬렉션

**규칙**: 복수형 사용

```typescript
// ✅ 좋은 예
const repositories = [];
const users = [];
const reviewItems = [];
const connectedRepoIds = new Set();

// ❌ 나쁜 예
const repository = [];              // 단수형
const userList = [];                // List 접미사 불필요
const repoArray = [];               // Array 접미사 불필요
```

### 4. 함수 매개변수

**규칙**: camelCase, 간결하고 명확하게

```typescript
// ✅ 좋은 예
function getUserRepositories(page: number, perPage: number) { ... }
function createReview(owner: string, repo: string, prNumber: number) { ... }

// ❌ 나쁜 예
function getUserRepositories(p: number, pp: number) { ... }      // 약어
function createReview(repoOwner: string, repoName: string) { ... } // 중복 접두사
```

---

## 상수 네이밍

### 1. 전역 상수

**규칙**: 원시값(숫자/문자열/불리언) 상수는 UPPER_SNAKE_CASE

```typescript
// ✅ 좋은 예 (lib/constants.ts)
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_TIMEOUT = 5000;
export const API_BASE_URL = "https://api.example.com";
export const SAMPLE_REVIEW_COUNT = 45;

// ❌ 나쁜 예
export const maxPageSize = 100;         // camelCase
export const MaxPageSize = 100;         // PascalCase
export const max_page_size = 100;       // lowercase snake_case
```

### 2. Enum-like 객체

**규칙**: 객체명은 PascalCase, 키는 UPPER_SNAKE_CASE

```typescript
// ✅ 좋은 예
const ContributionLevel = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
} as const;

const MonthNames = {
  JANUARY: "Jan",
  FEBRUARY: "Feb",
  MARCH: "Mar",
} as const;

// ❌ 나쁜 예
const CONTRIBUTION_LEVEL = { ... }      // 전부 대문자
const contributionLevel = { ... }       // camelCase
```

### 3. 모듈 내부 상수

**규칙**: UPPER_SNAKE_CASE

```typescript
// ✅ 좋은 예 (module/dashboard/actions/get-monthly-activity.ts)
const MONTH_NAMES = ["Jan", "Feb", "Mar", ...];
const SAMPLE_REVIEW_COUNT = 45;
const DAYS_RANGE = 180;

// ❌ 나쁜 예
const monthNames = ["Jan", "Feb", ...];     // camelCase
const MONTHS = ["Jan", "Feb", ...];         // 불명확한 이름
```

---

## 타입 및 인터페이스 네이밍

### 1. 인터페이스

**규칙**: PascalCase, 명확한 명사

```typescript
// ✅ 좋은 예
interface DashboardStats { ... }
interface ContributionData { ... }
interface Repository { ... }
interface User { ... }

// ❌ 나쁜 예
interface IDashboardStats { ... }      // I 접두사 불필요
interface dashboardStats { ... }       // camelCase
interface Stats { ... }                // 불명확
```

### 2. Type Alias

**규칙**: PascalCase

```typescript
// ✅ 좋은 예
type RepositoryWithReviews = Repository & { reviews: Review[] };
type ReviewStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
type ApiResponse<T> = { success: boolean; data?: T };

// ❌ 나쁜 예
type repositoryWithReviews = ...;      // camelCase
type RepoReviews = ...;                // 불명확한 약어
```

### 3. Props 인터페이스

**규칙**: `[Component]Props` 형식

```typescript
// ✅ 좋은 예
interface RepositoryListProps {
  repositories: Repository[];
  onConnect: (repo: Repository) => void;
}

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// ❌ 나쁜 예
interface IRepositoryListProps { ... }     // I 접두사 불필요
interface RepositoryListProperties { ... } // Props 대신 Properties
interface Props { ... }                     // 너무 일반적
```

### 4. Enum

**규칙**: PascalCase (Enum명), UPPER_SNAKE_CASE (값)

```typescript
// ✅ 좋은 예
enum ReviewStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

// ❌ 나쁜 예
enum reviewStatus { ... }              // camelCase
enum REVIEW_STATUS { ... }             // 전부 대문자
enum ReviewStatus {
  pending = "pending",                 // lowercase
}
```

### 5. Zod 스키마

**규칙**: 서버 액션 검증에 사용되는 Zod 스키마의 네이밍 패턴

```typescript
// ✅ 스키마: [Action]Schema (camelCase)
const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50),
  bio: z.string().max(200).optional(),
});

// ✅ 추론 타입: [Action]Input (PascalCase)
type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ✅ 서버 액션에서 사용
export async function createUser(data: CreateUserInput) {
  const validated = createUserSchema.parse(data);
  // ...
}

// ❌ 나쁜 예
const UserSchema = z.object({ ... });          // PascalCase 대신 camelCase 사용
const createUserZod = z.object({ ... });       // Zod 대신 Schema 접미사 사용
type CreateUserSchema = z.infer<typeof ...>;   // Schema 대신 Input 접미사 사용
const schema = z.object({ ... });              // 의미 없는 이름
```

---

## 실제 예제

### 예제 1: Repository 모듈

```typescript
// ✅ module/repository/actions/index.ts
export async function getUserRepositories(page: number, perPage: number) { ... }
export async function connectRepository(owner: string, repo: string) { ... }
export async function disconnectRepository(id: string) { ... }

// ✅ module/repository/hooks/use-repositories.ts
export function useRepositories() { ... }
export function useConnectRepository() { ... }

// ✅ module/repository/ui/repository-list.tsx
export default function RepositoryList({ repositories }: RepositoryListProps) { ... }

// ✅ module/repository/types/index.ts
export interface Repository { ... }
export interface RepositoryWithReviews extends Repository { ... }
export type RepositoryStatus = "connected" | "disconnected";
```

### 예제 2: Dashboard 모듈

```typescript
// ✅ module/dashboard/actions/get-dashboard-stats.ts
const SAMPLE_REPO_COUNT = 30;
const SAMPLE_REVIEW_COUNT = 44;

export interface DashboardStats {
  totalRepos: number;
  totalContributions: number;
  totalPRs: number;
  totalReviews: number;
}

export async function getDashboardStats(): Promise<DashboardStats> { ... }

// ✅ module/dashboard/actions/get-monthly-activity.ts
const MONTH_NAMES = ["Jan", "Feb", "Mar", ...];

function initializeMonthlyData(): Record<string, MonthlyStats> { ... }
function generateSampleReviews(): { createdAt: Date }[] { ... }

export async function getMonthlyActivity(): Promise<MonthlyActivity[]> { ... }
```

### 예제 3: GitHub 모듈

```typescript
// ✅ module/github/lib/github.ts
function createOctokitClient(token: string): Octokit { ... }

export async function getGitHubAccessToken() { ... }
export async function getRepositories(page: number, perPage: number) { ... }
export async function createWebhook(owner: string, repo: string) { ... }
export async function deleteWebhook(owner: string, repo: string, hookId: number) { ... }
export async function getUserContribution(token: string, username: string) { ... }
```

### 예제 4: 컴포넌트

```typescript
// ✅ components/app-sidebar/ui/app-sidebar.tsx
interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleToggle = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <aside className={...}>
      <Logo />
      <Navigation onItemClick={handleNavigationClick} />
      <UserProfile />
    </aside>
  );
}
```

---

## 체크리스트

코드 작성 시 다음 항목을 확인하세요:

### 함수
- [ ] React 훅은 `use` 접두사 사용
- [ ] React 19 훅 (`useActionState`, `useFormStatus`, `useOptimistic`) 변수명 패턴 준수
- [ ] 조회/CRUD 함수명 어휘(`get`/`fetch`, `create`/`add`, `delete`/`remove`)를 팀 기준으로 통일
- [ ] 이벤트 핸들러는 `handle` 또는 `on` 접두사 사용
- [ ] Next.js 예약 함수명 정확히 사용 (`generateMetadata`, `generateStaticParams`)

### 변수
- [ ] Boolean 변수는 `is`, `has`, `should`, `can` 접두사 사용
- [ ] 배열/컬렉션은 복수형 사용
- [ ] 의미 있는 이름 사용 (약어 최소화)

### 파일/폴더
- [ ] 파일명은 kebab-case 사용
- [ ] 폴더명은 kebab-case 사용
- [ ] Next.js 특수 파일명 정확히 사용 (`page.tsx`, `layout.tsx`, `loading.tsx` 등)
- [ ] 라우트 관련 폴더는 공식 패턴(`(groupName)`, `@slotName`, `[slug]` 등) 사용

### 타입
- [ ] 인터페이스/타입은 PascalCase 사용
- [ ] Props 인터페이스는 `[Component]Props` 형식
- [ ] Enum 값은 UPPER_SNAKE_CASE 사용
- [ ] Zod 스키마는 `[action]Schema` (camelCase), 추론 타입은 `[Action]Input` (PascalCase)

### 상수
- [ ] 원시값 전역 상수는 UPPER_SNAKE_CASE 사용
- [ ] Enum-like 객체 키는 UPPER_SNAKE_CASE 사용

### 서버/클라이언트 환경 파일명
- [ ] 기본은 `.server.tsx` / `.client.tsx` 접미사 미사용, 예외 사용 시 사유 명시

---

## 참고 자료

- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [React Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
- [Next.js Documentation](https://nextjs.org/docs)
