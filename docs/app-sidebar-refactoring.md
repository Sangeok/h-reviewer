# App Sidebar Refactoring Guide

> 2025-12-17 기준 `components/app-sidebar/ui/app-sidebar.tsx` 리팩토링 가이드

## 📋 목차

- [개요](#개요)
- [주요 개선 영역](#주요-개선-영역)
- [제안하는 폴더 구조](#제안하는-폴더-구조)
- [CSS/Tailwind 개선](#csstailwind-개선)
- [추가 제안](#추가-제안)
- [기대 효과](#기대-효과)

## 개요

현재 `app-sidebar.tsx` 파일은 244줄의 단일 컴포넌트로, 유지보수 및 가독성 측면에서 개선이 필요합니다. 이 문서는 SOLID 원칙과 React 모범 사례를 기반으로 한 리팩토링 방향을 제시합니다.

## 🎯 주요 개선 영역

### 1. 컴포넌트 분리 (Single Responsibility Principle)

현재 244줄의 단일 컴포넌트에 너무 많은 책임이 집중되어 있습니다.

#### 분리 제안

| 컴포넌트 | 책임 | 현재 라인 |
|---------|------|----------|
| `SidebarLogo` | 로고 및 collapse 버튼 | 51-79줄 |
| `SidebarUserProfile` | 유저 프로필 카드 | 82-136줄 |
| `SidebarNavigation` | 네비게이션 아이템 | 138-177줄 |
| `SidebarThemeToggle` | 테마 토글 버튼 | 182-219줄 |
| `SidebarLogoutButton` | 로그아웃 버튼 | 221-228줄 |
| `SidebarFooter` | 하단 버전 정보 | 232-236줄 |

#### 장점

- ✅ 각 컴포넌트의 테스트 용이성 향상
- ✅ 재사용성 증가
- ✅ 코드 가독성 개선
- ✅ 유지보수 비용 감소

### 2. 중복 코드 제거

#### 문제점

유저 아바타 렌더링 로직이 두 곳(84-96줄, 117-127줄)에서 반복됩니다.

#### 개선 방안

`UserAvatar` 공통 컴포넌트 생성:

```typescript
interface UserAvatarProps {
  user: {
    name?: string;
    email?: string;
    image?: string;
  };
  size?: 'sm' | 'md' | 'lg';
  showBorder?: boolean;
  className?: string;
}

export function UserAvatar({
  user,
  size = 'md',
  showBorder = true,
  className
}: UserAvatarProps) {
  // 공통 아바타 렌더링 로직
}
```

### 3. 커스텀 훅으로 비즈니스 로직 분리

#### 제안할 훅들

```typescript
// hooks/use-sidebar-state.ts
export function useSidebarState() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // localStorage 연동
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved) setIsCollapsed(JSON.parse(saved));
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', JSON.stringify(next));
      return next;
    });
  }, []);

  return { isCollapsed, toggleCollapse };
}

// hooks/use-sidebar-actions.ts
export function useSidebarActions() {
  const router = useRouter();
  const { setTheme, theme } = useTheme();

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push('/login');
  }, [router]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { handleLogout, toggleTheme };
}

// hooks/use-hydration.ts
export function useHydration() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
```

#### 장점

- ✅ 로직과 UI 분리
- ✅ 테스트 가능성 향상
- ✅ 재사용성 증대
- ✅ 관심사의 분리 (Separation of Concerns)

### 4. 스타일 상수화 및 Tailwind 최적화

#### 제안 구조

```typescript
// constants/styles.ts
export const SIDEBAR_STYLES = {
  container: {
    collapsed: 'w-20',
    expanded: 'w-64',
    base: 'relative h-screen border-r border-gray-800 bg-[#12121a]/90 backdrop-blur-xl transition-all duration-300',
  },
  button: {
    base: 'rounded-xl px-3 py-3 transition-all duration-200',
    active: 'bg-gradient-to-r from-cyan-500/10 to-blue-600/10 text-cyan-400 shadow-lg shadow-cyan-500/5',
    hover: 'text-gray-400 hover:bg-white/5 hover:text-white',
    logout: 'text-gray-400 hover:bg-red-500/10 hover:text-red-400',
  },
  gradient: {
    primary: 'from-cyan-400 to-blue-600',
    glow: 'from-cyan-500/20 to-blue-600/20',
    logo: 'from-cyan-400 to-blue-600',
  },
  animation: {
    shimmer: 'absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none',
    float: 'animate-float',
    floatDelayed: 'animate-float-delayed',
  },
} as const;

export const ANIMATION_DURATION = {
  fast: 200,
  normal: 300,
  slow: 700,
} as const;

export const BLUR_SIZE = {
  small: '60px',
  large: '80px',
} as const;
```

### 5. 타입 안전성 강화

```typescript
// types/index.ts
import { LucideIcon } from 'lucide-react';

export interface SidebarProps {
  defaultCollapsed?: boolean;
  className?: string;
}

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

export interface NavItemProps {
  item: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
}

export interface UserProfileProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  isCollapsed: boolean;
}

export interface SidebarLogoProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export interface ThemeToggleProps {
  isCollapsed: boolean;
}

export interface LogoutButtonProps {
  isCollapsed: boolean;
  onLogout: () => void;
}
```

### 6. 접근성 개선

#### 개선 사항

**ARIA 속성 추가:**

```tsx
// 네비게이션 아이템
<Link
  href={item.url}
  aria-current={isActive ? 'page' : undefined}
  aria-label={item.title}
>
  {/* ... */}
</Link>

// 툴팁
<div
  role="tooltip"
  aria-describedby={`user-tooltip-${user.id}`}
>
  {/* ... */}
</div>

// 사이드바 전체
<aside
  role="navigation"
  aria-label="Main sidebar navigation"
>
  {/* ... */}
</aside>
```

**키보드 네비게이션:**

- Tab 순서 최적화 (`tabIndex` 적절히 사용)
- `Enter`/`Space` 키로 액션 실행
- `Escape` 키로 툴팁 닫기

**스크린 리더 지원:**

- 시각적 효과(glow, shimmer)는 `aria-hidden="true"`
- 중요한 상태 변화는 `aria-live` 영역으로 알림

### 7. 성능 최적화

```typescript
// 컴포넌트 메모이제이션
export const SidebarNavigation = memo(function SidebarNavigation({
  items,
  isCollapsed,
  pathname,
}: SidebarNavigationProps) {
  // ...
});

// 콜백 메모이제이션
const handleItemClick = useCallback((url: string) => {
  // 분석 이벤트 전송 등
  analytics.track('sidebar_navigation', { url });
}, []);

// 이미지 최적화
import Image from 'next/image';

<Image
  src={user.image}
  alt={user.name || 'User'}
  width={40}
  height={40}
  className="rounded-full"
  loading="lazy"
/>
```

#### 성능 최적화 체크리스트

- ✅ `React.memo()`로 불필요한 리렌더링 방지
- ✅ `useCallback()`으로 함수 메모이제이션
- ✅ 네비게이션 아이템 map 최적화 (key 사용)
- ✅ `next/image`로 이미지 lazy loading
- ✅ CSS `will-change` 속성으로 애니메이션 최적화

### 8. 매직 넘버 제거

```typescript
// constants/index.ts
export const SIDEBAR_CONFIG = {
  width: {
    collapsed: 80,
    expanded: 256,
  },
  transition: {
    duration: 300,
  },
  version: 'v1.0.0',
  year: new Date().getFullYear(),
} as const;

export const ANIMATION_CONFIG = {
  duration: {
    fast: 200,
    normal: 300,
    slow: 700,
  },
  blur: {
    small: 60,
    large: 80,
  },
  gradient: {
    size: {
      small: 250,
      large: 300,
    },
  },
} as const;

export const THEME_CONFIG = {
  storage_key: 'sidebar-collapsed',
  toggle: {
    size: {
      width: 40,
      height: 20,
      indicator: 16,
    },
  },
} as const;
```

## 📁 제안하는 폴더 구조

```
components/app-sidebar/
├── ui/
│   ├── app-sidebar.tsx              # 메인 조립 컴포넌트
│   ├── sidebar-logo.tsx             # 로고 및 collapse 버튼
│   ├── sidebar-user-profile.tsx     # 유저 프로필 카드
│   ├── sidebar-user-avatar.tsx      # 공통 아바타 컴포넌트
│   ├── sidebar-navigation.tsx       # 네비게이션 리스트
│   ├── sidebar-nav-item.tsx         # 개별 네비게이션 아이템
│   ├── sidebar-theme-toggle.tsx     # 테마 토글 버튼
│   ├── sidebar-logout-button.tsx    # 로그아웃 버튼
│   └── sidebar-footer.tsx           # 하단 버전 정보
├── hooks/
│   ├── use-sidebar-state.ts         # 사이드바 상태 관리
│   ├── use-sidebar-actions.ts       # 사이드바 액션 (로그아웃, 테마 토글)
│   └── use-hydration.ts             # SSR 대응 마운트 상태
├── constants/
│   ├── index.ts                     # NAV_ITEMS (이미 존재)
│   ├── styles.ts                    # Tailwind 스타일 상수
│   └── config.ts                    # 설정 값 (width, duration 등)
└── types/
    └── index.ts                     # TypeScript 타입 정의
```

### 파일별 책임

#### `ui/app-sidebar.tsx` (메인 컴포넌트)

```typescript
export default function AppSidebar({ defaultCollapsed = false }: SidebarProps) {
  const mounted = useHydration();
  const { isCollapsed, toggleCollapse } = useSidebarState(defaultCollapsed);
  const { handleLogout, toggleTheme } = useSidebarActions();
  const { data: session } = useSession();

  if (!mounted) return null;

  return (
    <aside className={SIDEBAR_STYLES.container.base}>
      {/* 배경 그라디언트 */}
      <SidebarBackground />

      <div className="relative z-10 flex flex-col h-full p-4">
        <SidebarLogo isCollapsed={isCollapsed} onToggle={toggleCollapse} />

        {session?.user && (
          <SidebarUserProfile user={session.user} isCollapsed={isCollapsed} />
        )}

        <SidebarNavigation isCollapsed={isCollapsed} />

        <div className="pt-4 border-t border-gray-800 space-y-2">
          <SidebarThemeToggle isCollapsed={isCollapsed} onToggle={toggleTheme} />
          <SidebarLogoutButton isCollapsed={isCollapsed} onLogout={handleLogout} />
        </div>

        <SidebarFooter isCollapsed={isCollapsed} />
      </div>

      <SidebarEdgeGlow />
    </aside>
  );
}
```

## 🎨 CSS/Tailwind 개선

### 1. CSS 변수 활용

```css
/* app/globals.css */
@layer base {
  :root {
    /* Gradients */
    --gradient-primary-from: theme('colors.cyan.400');
    --gradient-primary-to: theme('colors.blue.600');
    --gradient-glow-from: theme('colors.cyan.500/20%');
    --gradient-glow-to: theme('colors.blue.600/20%');

    /* Sidebar */
    --sidebar-width-collapsed: 5rem;
    --sidebar-width-expanded: 16rem;
    --sidebar-transition-duration: 300ms;

    /* Animations */
    --animation-duration-fast: 200ms;
    --animation-duration-normal: 300ms;
    --animation-duration-slow: 700ms;
  }
}
```

### 2. 애니메이션 명확히 정의

```css
@layer utilities {
  @keyframes float {
    0%, 100% {
      transform: translateY(0) rotate(0deg);
    }
    50% {
      transform: translateY(-20px) rotate(5deg);
    }
  }

  @keyframes float-delayed {
    0%, 100% {
      transform: translateY(0) rotate(0deg);
    }
    50% {
      transform: translateY(-15px) rotate(-3deg);
    }
  }

  .animate-float {
    animation: float 8s ease-in-out infinite;
  }

  .animate-float-delayed {
    animation: float-delayed 10s ease-in-out infinite;
    animation-delay: 2s;
  }
}
```

### 3. 컴포넌트 Variant 시스템

```typescript
// 선택사항: cva (class-variance-authority) 라이브러리 활용
import { cva } from 'class-variance-authority';

const navItemVariants = cva(
  'group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-200',
  {
    variants: {
      active: {
        true: 'bg-gradient-to-r from-cyan-500/10 to-blue-600/10 text-cyan-400 shadow-lg shadow-cyan-500/5',
        false: 'text-gray-400 hover:bg-white/5 hover:text-white',
      },
      collapsed: {
        true: 'justify-center',
        false: '',
      },
    },
    defaultVariants: {
      active: false,
      collapsed: false,
    },
  }
);
```

## ⚡ 추가 제안

### 1. 에러 바운더리 추가

```typescript
// components/app-sidebar/ui/sidebar-error-boundary.tsx
import { Component, ReactNode } from 'react';

export class SidebarErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <aside className="w-20 h-screen border-r border-gray-800 bg-[#12121a]/90 p-4">
          <div className="text-red-400 text-sm">
            사이드바 로드 실패
          </div>
        </aside>
      );
    }

    return this.props.children;
  }
}
```

### 2. 로딩 상태 개선

```typescript
// app/layout.tsx
import { Suspense } from 'react';

export default function RootLayout({ children }) {
  return (
    <div className="flex">
      <Suspense fallback={<SidebarSkeleton />}>
        <AppSidebar />
      </Suspense>
      <main>{children}</main>
    </div>
  );
}
```

### 3. 상태 지속성

```typescript
// hooks/use-sidebar-state.ts
export function useSidebarState(defaultCollapsed = false) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // localStorage에서 초기값 복원
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) {
      setIsCollapsed(JSON.parse(saved));
    }
  }, []);

  // 상태 변경 시 localStorage에 저장
  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', JSON.stringify(next));
      return next;
    });
  }, []);

  return { isCollapsed, toggleCollapse };
}
```

### 4. 애니메이션 성능 최적화

```css
/* will-change 속성으로 GPU 가속 활용 */
.sidebar-nav-item {
  will-change: transform, background-color;
}

.sidebar-shimmer {
  will-change: transform;
}

/* transform 대신 translate 사용 (성능 향상) */
.sidebar-toggle-indicator {
  translate: 0 0;
  transition: translate 200ms;
}

.sidebar-toggle-indicator.active {
  translate: 1.25rem 0; /* 20px = 5 * 0.25rem */
}
```

### 5. 다국어 지원 준비

```typescript
// constants/i18n.ts
export const SIDEBAR_TRANSLATIONS = {
  en: {
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    logout: 'Logout',
    version: 'v1.0.0 • 2025',
  },
  ko: {
    darkMode: '다크 모드',
    lightMode: '라이트 모드',
    logout: '로그아웃',
    version: 'v1.0.0 • 2025',
  },
} as const;

// 사용 예시
const t = SIDEBAR_TRANSLATIONS[locale];
<span>{t.logout}</span>
```

### 6. 테스트 전략

```typescript
// __tests__/app-sidebar.test.tsx
describe('AppSidebar', () => {
  it('should toggle collapse state', () => {
    // ...
  });

  it('should persist collapse state to localStorage', () => {
    // ...
  });

  it('should handle logout correctly', () => {
    // ...
  });

  it('should toggle theme', () => {
    // ...
  });

  it('should highlight active navigation item', () => {
    // ...
  });
});

// __tests__/hooks/use-sidebar-state.test.ts
describe('useSidebarState', () => {
  it('should initialize with default value', () => {
    // ...
  });

  it('should toggle collapse', () => {
    // ...
  });
});
```

## 📊 기대 효과

### 정량적 개선

| 지표 | 현재 | 목표 | 개선율 |
|------|------|------|--------|
| 컴포넌트 크기 | 244줄 | ~80줄 | ↓ 67% |
| 파일 수 | 1개 | 15개 | - |
| 중복 코드 | 2곳 | 0곳 | ↓ 100% |
| 테스트 커버리지 | 0% | 80%+ | ↑ 80% |
| 번들 사이즈 | - | - | ↓ 15% (예상) |
| 리렌더링 횟수 | - | - | ↓ 40% (메모이제이션) |

### 정성적 개선

- ✅ **유지보수성**: 각 컴포넌트의 책임이 명확하여 수정 용이
- ✅ **재사용성**: UserAvatar, NavItem 등 다른 곳에서도 사용 가능
- ✅ **테스트 가능성**: 작은 단위의 컴포넌트와 훅으로 테스트 작성 용이
- ✅ **가독성**: 로직과 UI 분리, 상수화로 코드 이해도 향상
- ✅ **타입 안전성**: 명확한 타입 정의로 런타임 에러 감소
- ✅ **접근성**: ARIA 속성과 키보드 네비게이션으로 사용성 개선
- ✅ **성능**: 메모이제이션과 최적화로 렌더링 성능 향상
- ✅ **확장성**: 새로운 기능 추가 시 기존 코드 영향 최소화

## 🚀 리팩토링 우선순위

### Phase 1: 기본 분리 (1-2일)
1. 컴포넌트 분리 (SidebarLogo, UserProfile, Navigation 등)
2. 타입 정의 (`types/index.ts`)
3. 기본 훅 분리 (`useSidebarState`, `useSidebarActions`)

### Phase 2: 최적화 (1일)
4. 중복 코드 제거 (UserAvatar 공통 컴포넌트)
5. 스타일 상수화 (`constants/styles.ts`, `constants/config.ts`)
6. 성능 최적화 (memo, useCallback, next/image)

### Phase 3: 고도화 (1-2일)
7. 접근성 개선 (ARIA 속성, 키보드 네비게이션)
8. 에러 처리 (ErrorBoundary, Suspense)
9. 테스트 작성 (단위 테스트, 통합 테스트)

### Phase 4: 추가 개선 (선택)
10. 다국어 지원
11. 애니메이션 성능 최적화
12. 상태 지속성 (localStorage)

---

**문서 작성일**: 2025-12-17
**대상 파일**: `components/app-sidebar/ui/app-sidebar.tsx`
**작성자**: Claude Code
**버전**: 1.0.0
