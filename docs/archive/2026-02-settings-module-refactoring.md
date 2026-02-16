# Settings 모듈 리팩토링 명세 (완료)

## 문서 상태

- 상태: `COMPLETED` (2026-02-16)
- 원본 위치: `docs/specs/settings-module-refactoring.md`
- 아카이브 위치: `docs/archive/2026-02-settings-module-refactoring.md`
- 구현 범위: 본 문서의 이슈 `#1` ~ `#14` 반영 완료

---

## 개요

`module/settings/` 전체 코드를 분석한 결과, 버그 3건, 프로젝트 아키텍처 위반 2건, 프론트엔드 모범 사례 미준수 3건, 가독성/유지보수성 이슈 6건을 발견함.

**직접 수정 대상 파일 (9개)**:

| 파일 | 경로 |
|------|------|
| root layout | `app/layout.tsx` |
| global theme tokens | `app/globals.css` |
| barrel export | `module/settings/index.ts` |
| server actions | `module/settings/actions/index.ts` |
| constants | `module/settings/constants/index.ts` |
| settings page | `module/settings/ui/settings-page.tsx` |
| profile form | `module/settings/ui/parts/profile-form.tsx` |
| language selector | `module/settings/ui/parts/language-selector.tsx` |
| repository list | `module/settings/ui/parts/repository-list.tsx` |

---

## 1. [BUG] 잘못된 mutation 참조

**파일**: `repository-list.tsx:136-138`

"Disconnect All" 다이얼로그의 확인 버튼에서 `disconnectAllMutation`이 아닌 `disconnectMutation`의 `isPending` 상태를 확인하고 있음. 이로 인해 전체 연결 해제 중 로딩 표시가 안 되고, 개별 삭제 중일 때 전체 연결 해제 버튼이 비활성화되는 버그 발생.

```typescript
// ❌ 현재 (잘못됨)
<AlertDialogAction
  onClick={() => disconnectAllMutation.mutate()}
  disabled={disconnectMutation.isPending}  // 잘못된 mutation
>
  {disconnectMutation.isPending ? <Loader2 ... /> : "Disconnect"}  // 잘못된 mutation
</AlertDialogAction>

// ✅ 수정
<AlertDialogAction
  onClick={() => disconnectAllMutation.mutate()}
  disabled={disconnectAllMutation.isPending}
>
  {disconnectAllMutation.isPending ? <Loader2 ... /> : "Disconnect"}
</AlertDialogAction>
```

---

## 2. [BUG] AlertDialog 구조 오류

**파일**: `repository-list.tsx:212-228`

개별 리포지토리 삭제 다이얼로그에서 `AlertDialogFooter`가 `AlertDialogHeader` 내부에 중첩되어 있음. Radix UI AlertDialog의 올바른 구조 위반.

```tsx
// ❌ 현재 (잘못됨)
<AlertDialogContent>
  <AlertDialogHeader>
    <AlertDialogTitle>...</AlertDialogTitle>
    <AlertDialogDescription>...</AlertDialogDescription>
    <AlertDialogFooter>  {/* Header 안에 중첩 */}
      ...
    </AlertDialogFooter>
  </AlertDialogHeader>
</AlertDialogContent>

// ✅ 수정
<AlertDialogContent>
  <AlertDialogHeader>
    <AlertDialogTitle>...</AlertDialogTitle>
    <AlertDialogDescription>...</AlertDialogDescription>
  </AlertDialogHeader>
  <AlertDialogFooter>  {/* Header와 동일 레벨 */}
    ...
  </AlertDialogFooter>
</AlertDialogContent>
```

---

## 3. [CONVENTION] parts 컴포넌트 외부 노출

**파일**: `module/settings/index.ts`

프로젝트 컨벤션(`docs/conventions/component-parts.md`)에 따르면 `parts/` 디렉토리의 컴포넌트는 해당 메인 컴포넌트 내부에서만 사용해야 하며, 외부에서 직접 import하면 안 됨. 현재 barrel export에서 `ProfileForm`과 `SettingsRepositoryList`를 외부에 노출하고 있음.

```typescript
// ❌ 현재
export { default as SettingsPage } from "./ui/settings-page";
export { default as ProfileForm } from "./ui/parts/profile-form";
export { default as SettingsRepositoryList } from "./ui/parts/repository-list";

// ✅ 수정: SettingsPage만 외부 노출
export { default as SettingsPage } from "./ui/settings-page";
```

**확인 완료**: 외부에서 직접 import하는 곳 없음. `settings-page.tsx` 내부에서만 상대 경로로 사용 중. 안전하게 제거 가능.

---

## 4. [CONVENTION] 불필요한 "use client" 디렉티브

**파일**: `settings-page.tsx`

`SettingsPage` 컴포넌트는 자체적으로 클라이언트 기능(state, effects, event handlers)을 전혀 사용하지 않음. 단순히 `ProfileForm`과 `RepositoryList`를 합성(compose)하는 역할만 수행. 하위 컴포넌트들이 이미 개별적으로 `"use client"`를 선언하고 있으므로, 상위 컴포넌트에서는 불필요.

```tsx
// ❌ 현재
"use client";

import ProfileForm from "./parts/profile-form";
import RepositoryList from "./parts/repository-list";

export default function SettingsPage() { ... }

// ✅ 수정: "use client" 제거 → Server Component로 유지
import ProfileForm from "./parts/profile-form";
import RepositoryList from "./parts/repository-list";

export default function SettingsPage() { ... }
```

---

## 5. [BEST-PRACTICE] alert() 대신 toast 사용

**파일**: `profile-form.tsx`, `repository-list.tsx`

프로젝트에 이미 Sonner(`sonner@2.0.7`)가 설치되어 있고, `components/ui/sonner.tsx`에 커스텀 `Toaster` 컴포넌트가 구현되어 있음. 그러나 settings 모듈 전체에서 브라우저 네이티브 `alert()`를 사용 중.

`alert()`는 UI 스레드를 블로킹하고, 스타일링 불가능하며, 2026년 기준 프론트엔드에서 사용하지 않는 패턴.

**변경 대상 (9개소)**:

| 파일 | 라인 | 현재 | 변경 |
|------|------|------|------|
| `profile-form.tsx` | 48 | `alert("Profile updated successfully")` | `toast.success("Profile updated successfully")` |
| `profile-form.tsx` | 50 | `alert(result?.message \|\| "Failed to update profile")` | `toast.error(result?.message \|\| "Failed to update profile")` |
| `profile-form.tsx` | 53 | `alert("Failed to update profile")` | `toast.error("Failed to update profile")` |
| `repository-list.tsx` | 43 | `alert("Repository disconnected successfully")` | `toast.success("Repository disconnected successfully")` |
| `repository-list.tsx` | 45 | `alert(result?.message)` | `toast.error(result?.message)` |
| `repository-list.tsx` | 50 | `alert("Failed to disconnect repository")` | `toast.error("Failed to disconnect repository")` |
| `repository-list.tsx` | 62 | `alert("All repositories disconnected successfully")` | `toast.success("All repositories disconnected successfully")` |
| `repository-list.tsx` | 64 | `alert(result?.message)` | `toast.error(result?.message)` |
| `repository-list.tsx` | 69 | `alert("Failed to disconnect all repositories")` | `toast.error("Failed to disconnect all repositories")` |

---

## 6. [BEST-PRACTICE] Toaster 컴포넌트 미마운트 (선행 작업)

**파일**: `app/layout.tsx`

Sonner의 `Toaster` 컴포넌트가 root layout에 마운트되어 있지 않아 toast 호출이 화면에 렌더링되지 않음. 5번 항목의 선행 조건.

```tsx
// ❌ 현재
<QueryProvider>
  <ThemeProvider ...>
    {children}
  </ThemeProvider>
</QueryProvider>

// ✅ 수정
import { Toaster } from "@/components/ui/sonner";

<QueryProvider>
  <ThemeProvider ...>
    {children}
    <Toaster />
  </ThemeProvider>
</QueryProvider>
```

---

## 7. [BEST-PRACTICE] 하드코딩된 색상값 → CSS 변수 / Tailwind 시맨틱 클래스

**파일**: `settings-page.tsx`, `profile-form.tsx`, `repository-list.tsx`

프로젝트 `globals.css`에 dark 테마 CSS 변수가 정의되어 있으나, settings 모듈 전체에서 hex 값을 직접 사용하고 있음. 테마 변경 시 모든 파일을 수동 수정해야 하며, 일관성 유지 불가.

> 범위 원칙: 본 문서에서는 **settings 모듈 + 최소한의 토큰 추가(`app/globals.css`)**까지만 다룬다.  
> 프로젝트 전체 색상 일괄 치환은 별도 스펙으로 분리한다.

**매핑 테이블**:

| 하드코딩 | CSS 변수 | Tailwind 클래스 |
|----------|----------|-----------------|
| `#000000` | `--background` | `bg-background` |
| `#e0e0e0` | `--foreground` | `text-foreground` |
| `#0a0a0a` | `--card` | `bg-card` |
| `#4a6a4a` | `--primary` | `text-primary`, `bg-primary` |
| `#1a1a1a` | `--secondary` / `--border` | `bg-secondary`, `border-border` |
| `#d0d0d0` | `--secondary-foreground` | `text-secondary-foreground` |
| `#707070` | `--muted-foreground` | `text-muted-foreground` |
| `#ff6b6b` | `--destructive` | `text-destructive` |
| `#2d3e2d` | `--ring` | `ring-ring`, `focus:border-ring` |
| `#3d523d` | `--chart-2` | 해당 변수 사용 |
| `#606060` | `--chart-4` (근사값) | 해당 변수 사용 |

**변경 예시** (`settings-page.tsx`):

```tsx
// ❌ 현재
<h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Settings</h1>
<p className="text-[#707070] font-light mt-1">...</p>

// ✅ 수정
<h1 className="text-3xl font-medium tracking-tight text-foreground">Settings</h1>
<p className="text-muted-foreground font-light mt-1">...</p>
```

**변경 예시** (`profile-form.tsx` Card):

```tsx
// ❌ 현재
<Card className="relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">

// ✅ 수정
<Card className="relative overflow-hidden bg-gradient-to-b from-card to-background border-border">
```

**gradient 색상 처리 방침**:

기존 CSS 변수가 있는 색상은 해당 변수를 사용하고, 다수 파일에서 공통 사용되나 변수가 없는 색상 2개만 커스텀 변수를 추가한다.

| 하드코딩 | 처리 | Tailwind 사용 |
|----------|------|---------------|
| `#2d3e2d` (56회/16파일) | 기존 `--ring` | `from-ring/3` |
| `#4a6a4a` (35회/14파일) | 기존 `--primary` | `from-primary` |
| `#3d523d` (11회/8파일) | 기존 `--chart-2` | `to-chart-2` |
| `#5a7a5a` (6회/5파일) | **신규 `--primary-hover`** | `hover:from-primary-hover` |
| `#3a1a1a` (8회/4파일) | **신규 `--destructive-bg`** | `bg-destructive-bg` |
| `#4d624d` (2회/2파일) | 기존 변수 조합 | `to-primary/80` 등 근사값 |
| `#2d1515` (3회/1파일) | 기존 변수 조합 | `to-destructive-bg/80` 등 |
| `#4a2020` (3회/1파일) | 기존 변수 조합 | `hover:from-destructive-bg` 등 |

`globals.css`에 추가할 변수:

```css
.dark {
  --primary-hover: #5a7a5a;
  --destructive-bg: #3a1a1a;
}
```

`@theme inline`에 추가:

```css
--color-primary-hover: var(--primary-hover);
--color-destructive-bg: var(--destructive-bg);
```

---

## 8. [READABILITY] normalizeLanguageCode 이중 호출

**파일**: `profile-form.tsx:34`, `profile-form.tsx:63`

- `getUserProfile()` 서버 액션이 이미 `normalizeLanguageCode()`를 적용하여 정규화된 `preferredLanguage`를 반환함 (`actions/index.ts:32`)
- 그런데 `getInitialFormState()`에서 다시 `normalizeLanguageCode(profile?.preferredLanguage)`를 호출
- `handleSubmit()`에서도 `currentFormState.preferredLanguage`가 이미 `LanguageCode` 타입임에도 다시 `normalizeLanguageCode()` 호출

```typescript
// ❌ 현재
const getInitialFormState = () => ({
  preferredLanguage: normalizeLanguageCode(profile?.preferredLanguage) ?? DEFAULT_LANGUAGE,
});

const handleSubmit = () => {
  updateMutation.mutate({
    preferredLanguage: normalizeLanguageCode(currentFormState.preferredLanguage) ?? DEFAULT_LANGUAGE,
  });
};

// ✅ 수정: 서버에서 이미 정규화됨, 타입 시스템 신뢰
const getInitialFormState = () => ({
  preferredLanguage: profile?.preferredLanguage ?? DEFAULT_LANGUAGE,
});

const handleSubmit = () => {
  updateMutation.mutate({
    preferredLanguage: currentFormState.preferredLanguage,
  });
};
```

---

## 9. [READABILITY] queryFn/mutationFn 불필요한 async/await 래핑

**파일**: `profile-form.tsx:27`, `repository-list.tsx:31,36,55`

서버 액션이 이미 Promise를 반환하므로 `async () => await fn()`으로 감쌀 필요 없음.

```typescript
// ❌ 현재
queryFn: async () => await getUserProfile(),
mutationFn: async (data) => await updateUserProfile(data),
mutationFn: async (repositoryId: string) => await deleteRepository(repositoryId),
mutationFn: async () => await disconnectAllRepositories(),

// ✅ 수정
queryFn: getUserProfile,
mutationFn: updateUserProfile,
mutationFn: deleteRepository,
mutationFn: disconnectAllRepositories,
```

---

## 10. [READABILITY] 인라인 SVG → lucide-react 아이콘

**파일**: `repository-list.tsx:150-163`

빈 상태 아이콘으로 인라인 SVG(14줄)를 사용 중. 프로젝트에 이미 `lucide-react`가 설치되어 있으므로 `FolderOpen` 아이콘으로 대체 가능.

```tsx
// ❌ 현재 (14줄)
<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#4a6a4a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
</svg>

// ✅ 수정 (1줄)
import { FolderOpen } from "lucide-react";
<FolderOpen className="h-8 w-8 text-primary" />
```

---

## 11. [READABILITY] 불필요한 Fragment 및 변수명 오타

**파일**: `repository-list.tsx`

### 11-1. 불필요한 Fragment

`repository-list.tsx:93,238` - `<>...</>`로 감싸고 있지만 단일 `<Card>` 컴포넌트만 반환하므로 Fragment 불필요.

```tsx
// ❌ 현재
return (
  <>
    <Card>...</Card>
  </>
);

// ✅ 수정
return (
  <Card>...</Card>
);
```

### 11-2. 변수명 오타

`repository-list.tsx:26` - `disconnectedAllOpen` → `disconnectAllOpen`

state는 다이얼로그의 현재 열림 상태를 나타내므로 과거분사(`disconnected`)가 아닌 동사원형(`disconnect`)이 적절.

```typescript
// ❌ 현재
const [disconnectedAllOpen, setDisconnectedAllOpen] = useState(false);

// ✅ 수정
const [disconnectAllOpen, setDisconnectAllOpen] = useState(false);
```

---

## 12. [READABILITY] SupportedLanguage 타입 안전성

**파일**: `constants/index.ts:2`

`SupportedLanguage` 인터페이스의 `code` 필드가 `string`으로 정의되어 있어 `LanguageCode`와의 타입 불일치 발생. `language-selector.tsx:17`에서 `val as LanguageCode` 타입 캐스팅이 필요해지는 원인.

```typescript
// ❌ 현재
export interface SupportedLanguage {
  code: string;  // 너무 넓은 타입
  name: string;
  nativeName: string;
}

// ✅ 수정
export interface SupportedLanguage {
  code: LanguageCode;  // 정확한 타입
  name: string;
  nativeName: string;
}
```

**참고**: TypeScript 타입 별칭은 선언 순서 강제 조건이 없음. 다만 가독성을 위해 `LanguageCode`를 위에 두는 것은 권장 사항임.

---

## 13. [READABILITY] repository-list.tsx의 불필요한 refetchSession() 호출

**파일**: `repository-list.tsx:41,59`

Better-Auth의 `useSession()`이 반환하는 세션 데이터는 `Session` 모델(`id`, `token`, `expiresAt`, `userId` 등)과 `User` 기본 정보(`id`, `name`, `email`, `image` 등)만 포함. `Repository`는 별도 테이블에서 `userId`로 관계만 맺고 있을 뿐, 세션 응답에 포함되지 않음.

리포지토리 삭제/연결 해제 후 `refetchSession()`을 호출해도 세션 데이터에 변화 없음 → 불필요한 네트워크 요청.

```typescript
// ❌ 현재
const { refetch: refetchSession } = useSession();
// ... onSuccess 내부:
await refetchSession();

// ✅ 수정: useSession import 및 refetchSession 호출 모두 제거
```

---

## 14. [BUG] Repository 해제 시 usage.repositoryCount 미동기화

**파일**: `module/settings/actions/index.ts`

`module/repository/actions`에서 연결 시 `incrementRepositoryCount()`를 호출하지만, settings 모듈에서 단건 삭제/전체 해제 시 카운트 감소가 없음.  
결과적으로 실제 연결 리포지토리는 0개인데도 `user_usage.repositoryCount`가 높은 값으로 남아, FREE 플랜 사용자가 재연결 제한에 걸리는 기능 버그 발생.

```typescript
// ❌ 현재: deleteRepository / disconnectAllRepositories 에 카운트 동기화 없음
await prisma.repository.delete({ ... });
// ...
await prisma.repository.deleteMany({ ... });

// ✅ 수정 (권장)
import { decrementRepositoryCount } from "@/module/payment/lib/subscription";

// 단건 해제 후
await prisma.repository.delete({ ... });
await decrementRepositoryCount(session.user.id);

// 전체 해제 후: N번 decrement 대신 0으로 동기화
await prisma.repository.deleteMany({ ... });
await prisma.userUsage.upsert({
  where: { userId: session.user.id },
  create: { userId: session.user.id, repositoryCount: 0, reviewCounts: {} },
  update: { repositoryCount: 0 },
});
```

---

## 변경 파일 요약

| 파일 | 변경 항목 | 관련 이슈 |
|------|-----------|-----------|
| `app/layout.tsx` | Toaster 마운트 추가 | #6 |
| `app/globals.css` | `--primary-hover`, `--destructive-bg` CSS 변수 추가 | #7 |
| `module/settings/index.ts` | parts export 제거 | #3 |
| `module/settings/actions/index.ts` | 리포지토리 해제 시 usage 카운트 동기화(단건 decrement, 전체 해제 reset) | #14 |
| `module/settings/constants/index.ts` | `SupportedLanguage.code` 타입 수정, 선언 순서 조정 | #12 |
| `module/settings/ui/settings-page.tsx` | `"use client"` 제거, 하드코딩 색상 → CSS 변수 | #4, #7 |
| `module/settings/ui/parts/profile-form.tsx` | alert→toast, 색상 CSS 변수화, normalizeLanguageCode 이중호출 제거, queryFn/mutationFn 단순화 | #5, #7, #8, #9 |
| `module/settings/ui/parts/language-selector.tsx` | `as LanguageCode` 캐스팅 제거 (#12 반영 후 자동 해결) | #12 |
| `module/settings/ui/parts/repository-list.tsx` | mutation 참조 버그 수정, AlertDialog 구조 수정, alert→toast, 색상 CSS 변수화, SVG→lucide, Fragment 제거, 변수명 오타, queryFn 단순화, 불필요한 refetchSession 제거 | #1, #2, #5, #7, #9, #10, #11, #13 |

---

## 실행 순서

1. **#6** `app/layout.tsx` - Toaster 마운트 (선행 조건)
2. **#12** `constants/index.ts` - 타입 수정 (의존성 없음)
3. **#3** `index.ts` - barrel export 정리
4. **#14** `actions/index.ts` - usage 카운트 동기화 버그 수정
5. **#4** `settings-page.tsx` - `"use client"` 제거 + 색상
6. **#1, #2, #5, #7, #9, #10, #11, #13** `repository-list.tsx` - 버그 수정 + 리팩토링
7. **#5, #7, #8, #9** `profile-form.tsx` - toast + 색상 + 중복 제거
8. **#12 반영 확인** `language-selector.tsx` - 캐스팅 제거
9. **#7 최종 반영** `app/globals.css` - 토큰 추가 및 스타일 점검

---

## 검증 체크리스트

### 정적 검사

```bash
npm run lint
npx tsc --noEmit
```

실행 결과:
- `npx tsc --noEmit` 통과
- `npm run lint` 실패 (본 작업 범위 외 기존 이슈 다수 존재)
  - 예: `components/layouts/app-sidebar/hooks/use-hydration.ts` (`react-hooks/set-state-in-effect`)
  - 예: `module/github/lib/github.ts` (`@typescript-eslint/no-explicit-any`)

### 기능 검증 (수동)

1. settings 페이지 진입 시 프로필/리포지토리 데이터가 정상 로딩되는지 확인
2. 단건 Disconnect 후 성공 toast 노출 및 리스트 갱신 확인
3. Disconnect All 후 성공 toast 노출 및 리스트 0건 확인
4. FREE 계정에서 리포지토리 해제 후 재연결이 가능해졌는지 확인 (`repositoryCount` 동기화 검증)
5. 다이얼로그 구조(헤더/푸터)와 버튼 pending 상태가 각 mutation에 맞게 동작하는지 확인

## 미해결 질문

없음.
