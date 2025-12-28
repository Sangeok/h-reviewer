# Components 디렉토리 구조 가이드

**목적**: `components/` 하위 디렉토리의 역할과 배치 기준 정의

---

## 📁 디렉토리 구조

```
components/
├── ui/                 # UI 프리미티브 (shadcn/ui)
├── layouts/            # 앱 레이아웃
├── common/             # 공통 비즈니스 컴포넌트
└── providers/          # Context Providers
```

---

## 1️⃣ `components/ui/` - UI 프리미티브

### 역할
순수 UI 컴포넌트, 비즈니스 로직 없음, Props로 완전 제어

### 특징
- ❌ 비즈니스 로직 없음
- ✅ shadcn/ui, Radix UI 기반
- ✅ Controlled Component (상태를 스스로 관리 안 함)
- ✅ 프로젝트 전체에서 재사용

### 예시
```typescript
// Button, Input, Card, Dialog, Select
<Button variant="primary" onClick={handleClick}>Submit</Button>
<Input value={value} onChange={onChange} />
<Card>
  <CardHeader><CardTitle>Title</CardTitle></CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

### 판단 기준
```typescript
// ✅ ui/에 배치
- shadcn/ui에서 가져온 것
- Props만으로 완전히 제어 가능
- 순수 UI, 비즈니스 로직 없음

// ❌ ui/에 속하지 않음
- API 호출, 데이터 fetching 포함
- 특정 도메인 전용 (RepositoryCard 등)
- 앱 레이아웃 컴포넌트
```

---

## 2️⃣ `components/layouts/` - 앱 레벨 레이아웃

### 역할
앱의 전체 구조를 구성하는 레이아웃 컴포넌트

### 특징
- ✅ 여러 페이지에서 공유
- ✅ 인증/세션 의존 가능
- ✅ 복잡한 상태 관리 가능 (사이드바 토글 등)
- ✅ 전역 네비게이션

### 예시
```typescript
// Sidebar, Header, Footer
components/layouts/
├── app-sidebar/
│   ├── ui/app-sidebar.tsx
│   └── parts/           # 하위 컴포넌트
├── header.tsx
└── footer.tsx

// 사용
export default function AppSidebar() {
  const { data: session } = useSession();
  return (
    <aside>
      <Navigation />
      <UserProfile user={session?.user} />
      <ThemeToggle />
    </aside>
  );
}
```

### 판단 기준
```typescript
// ✅ layouts/에 배치
- 여러 페이지에서 사용되는 구조
- 전역 네비게이션
- 페이지 레이아웃 래퍼

// ❌ layouts/에 속하지 않음
- 단일 도메인 전용 (module/repository/components/)
- 순수 UI 컴포넌트 (ui/)
- 페이지 컨텐츠 (module/)
```

---

## 3️⃣ `components/common/` - 공통 비즈니스 컴포넌트

### 역할
**3개 이상의 도메인 모듈**에서 사용되는 비즈니스 로직 포함 컴포넌트

### 특징
- ✅ 비즈니스 로직 포함
- ✅ 3개 이상 모듈에서 재사용
- ✅ 프로젝트 특화 구현
- ⚠️ **Rule of Three** 준수 (남용 방지)

### 예시
```typescript
// LoadingSpinner, EmptyState, DataTable
components/common/
├── loading-spinner.tsx    # 사용처: repository, review, settings
├── empty-state.tsx        # 사용처: 모든 리스트 화면
├── data-table.tsx         # 사용처: repository, review, user list
└── confirm-dialog.tsx     # 사용처: 삭제, 중요 작업 확인

// 구현 예시
export function LoadingSpinner({ size, message }) {
  return (
    <div>
      <Loader2 className={sizes[size]} />  // ui/ 활용
      {message && <p>{message}</p>}        // 비즈니스 로직
    </div>
  );
}
```

### 판단 기준 - Rule of Three
```typescript
// 1단계: 1개 모듈에서만 사용
module/review/components/filter.tsx

// 2단계: 2개 모듈에서 사용 → 아직 유지 (중복 허용)
module/repository/components/filter.tsx

// 3단계: 3개 모듈에서 사용 → common/으로 이동
components/common/filter.tsx
```

### ⚠️ 주의사항
```typescript
// ❌ 과도한 추상화
function UniversalComponent({ ...10개 props }) { ... }

// ✅ 명확한 목적
function DataTable<T>({ columns, data }) { ... }

// 이동 체크리스트
- [ ] 3개 이상 서로 다른 도메인에서 사용?
- [ ] 비즈니스 로직이 범용적인가?
- [ ] 추상화 레벨이 적절한가?
```

---

## 4️⃣ `components/providers/` - Context Providers

### 역할
앱 전역 상태, 설정, 서비스 제공

### 특징
- ✅ `app/layout.tsx`에서 사용
- ✅ React Context API 기반
- ✅ Third-party 래퍼 (React Query, Theme 등)
- ✅ 서비스 초기화 (Analytics, Sentry 등)

### 예시
```typescript
// QueryProvider, ThemeProvider, ToastProvider
components/providers/
├── query-provider.tsx
├── theme-provider.tsx
├── toast-provider.tsx
└── index.tsx             # 조합 패턴

// 구현
export function QueryProvider({ children }) {
  const [queryClient] = useState(() => new QueryClient({...}));
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// 조합 (index.tsx)
export function Providers({ children }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        {children}
        <ToastProvider />
      </QueryProvider>
    </ThemeProvider>
  );
}

// 사용 (app/layout.tsx)
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 판단 기준
```typescript
// ✅ providers/에 배치
- React Context Provider
- Third-party Provider 래퍼
- 앱 전역 서비스 초기화

// ❌ providers/에 속하지 않음
- 일반 컴포넌트 (layouts/)
- 특정 모듈 전용 Provider (module/[feature]/providers/)
- Hook만 제공 (lib/hooks/)
```

---

## 📊 종합 비교표

| 디렉토리 | 비즈니스 로직 | 재사용 범위 | 상태 관리 | 예시 |
|---------|--------------|-----------|----------|------|
| **ui/** | ❌ 없음 | 전체 | ❌ Props만 | Button, Card |
| **layouts/** | ✅ 있음 | 여러 페이지 | ✅ 가능 | Sidebar, Header |
| **common/** | ✅ 있음 | 3개 이상 모듈 | ✅ 가능 | LoadingSpinner, DataTable |
| **providers/** | ✅ 있음 | 앱 전역 | ✅ Context | QueryProvider, ThemeProvider |

---

## 🎯 의사결정 플로우

```
새 컴포넌트 배치:

1. React Context Provider? → providers/
2. 앱 레이아웃/구조? (여러 페이지) → layouts/
3. 순수 UI? (비즈니스 로직 없음) → ui/
4. 3개 이상 도메인에서 사용? → common/
5. 그 외 → module/[feature]/components/
```

---

## 💡 실전 예시

| 컴포넌트 | 위치 | 이유 |
|---------|------|------|
| 로딩 스피너 | `common/loading-spinner.tsx` | 비즈니스 로직 + 여러 모듈 사용 |
| 사용자 프로필 | `layouts/app-sidebar/ui/parts/user-profile.tsx` | 사이드바 일부 + 인증 의존 |
| 데이터 테이블 | `common/data-table.tsx` | 정렬/필터링 로직 + 여러 곳 사용 |
| 테마 Provider | `providers/theme-provider.tsx` | React Context + 앱 전역 |
| 버튼 | `ui/button.tsx` | 순수 UI + shadcn/ui |

---

## 🔍 FAQ

**Q: `ui/`와 `common/` 구분이 애매한데?**
- 비즈니스 로직 있음 → `common/`
- Props로만 제어 → `ui/`
- shadcn/ui에서 가져옴 → `ui/`

**Q: `common/`이 너무 많아지면?**
```
components/common/
├── feedback/        # LoadingSpinner, EmptyState
├── data-display/    # DataTable, Pagination
└── interactive/     # ConfirmDialog, CopyButton
```

**Q: 1개 모듈에서 사용하다 3개로 늘어나면?**
```typescript
// 처음
module/review/components/badge.tsx

// 3개 이상 사용 시
components/common/badge.tsx
// import 경로 일괄 수정
```

---

## ✅ 체크리스트

- [ ] 비슷한 컴포넌트가 이미 있는지 확인
- [ ] 플로우차트로 적절한 디렉토리 선택
- [ ] 파일명: `kebab-case.tsx`
- [ ] 컴포넌트명: `PascalCase`
- [ ] Props 타입 정의
- [ ] 필요시 JSDoc 주석

---

**작성일**: 2025-12-24
