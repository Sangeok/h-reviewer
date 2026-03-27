# 프론트엔드 코드 가독성 가이드

> 이 문서는 React 기반의 프론트엔드 코드를 작성할 때 가독성을 높이기 위한 원칙과 실천법을 다룹니다.

## 핵심 원칙: 읽는 사람의 인지 부담을 줄여라

사람의 작업 기억은 제한적이다. 코드를 읽을 때 동시에 고려해야 하는 맥락이 많아질수록 읽기 어려운 코드가 된다.

가독성이 높은 코드란 읽는 사람이 **적은 맥락으로 빠르게 의도를 파악**할 수 있는 코드다.

가독성을 높이는 3가지 실천법:

1. **이름 붙이기** — 의미 없는 값이나 조건에 명확한 이름을 부여하여, 의도를 즉시 파악할 수 있게 한다
2. **분리하기** — 하나의 단위가 담당하는 맥락을 최소화하여, 한 번에 읽어야 할 양을 줄인다
3. **단순하게 표현하기** — 읽는 흐름을 자연스럽게 유지하여, 코드를 따라가는 부담을 줄인다

---

## 1. 이름 붙이기

이름이 없는 값이나 조건은 읽는 사람이 직접 의미를 해석해야 하므로 인지 부담이 커진다. 명확한 이름을 부여하면 해석 과정 없이 의도를 파악할 수 있다.

### 1-1. 매직 넘버에 이름 붙이기

의미를 밝히지 않고 코드에 직접 넣은 숫자를 **매직 넘버**라고 한다. 상수 이름만으로 의도를 밝히면 컴포넌트의 생명주기나 타이머 등 동작에 대해 추측할 필요가 없어진다.

**Before** — `3000`이 무엇을 의미하는지 읽는 사람이 추측해야 한다
```tsx
function ToastMessage({ message, onClose }: { message: string, onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000); // 3000이 왜 쓰였는지 문맥을 보고 추측해야 한다
    return () => clearTimeout(timer);
  }, [onClose]);

  return <div className="toast">{message}</div>;
}
```

**After** — 상수 이름만으로 의도가 컴포넌트 상단에 명확히 드러난다
```tsx
const TOAST_DURATION_MS = 3000;

function ToastMessage({ message, onClose }: { message: string, onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onClose]);

  return <div className="toast">{message}</div>;
}
```

> 숫자에 이름을 붙이면 읽는 사람이 의미를 추측할 필요가 없어진다.

### 1-2. 복잡한 조건에 이름 붙이기

React 컴포넌트의 렌더링 여부를 결정하는 조건이 중첩되면, 읽는 사람이 모든 조건을 머릿속에 담아야 전체 의미를 파악할 수 있다. 분리된 조건에 이름을 붙이면 JSX 조건부 렌더링이 간결해진다.

**Before** — 중첩된 조건을 모두 따라가야 `결제하기` 버튼이 렌더링되는 조건을 알 수 있다
```tsx
function CheckoutButton({ user, cart }: CheckoutProps) {
  if (user.role === 'MEMBER' && user.age >= 19 && cart.items.length > 0 && cart.items.every(item => item.isAvailable)) {
    return <Button>결제하기</Button>;
  }
  return <Button disabled>결제 불가</Button>;
}
```

**After** — 각 조건에 이름이 있어 조건식의 목적이 직관적으로 드러난다
```tsx
function CheckoutButton({ user, cart }: CheckoutProps) {
  const isAdultMember = user.role === 'MEMBER' && user.age >= 19;
  const isCartValid = cart.items.length > 0 && cart.items.every(item => item.isAvailable);
  const canCheckout = isAdultMember && isCartValid;

  if (canCheckout) {
    return <Button>결제하기</Button>;
  }
  return <Button disabled>결제 불가</Button>;
}
```

> 조건에 이름을 붙이면 렌더링 여부를 해석하는 부담이 줄어든다.

### 1-3. Boolean 변수에 의도를 드러내는 이름 붙이기

Boolean 변수나 Props 이름이 모호하면, `true`와 `false`가 각각 어떤 상태를 뜻하는지 컴포넌트 내부를 읽고 추측해야 한다. `is`, `has`, `can`, `should` 같은 접두어를 사용하면 Props나 State의 의미가 즉시 드러난다.

**Before** — 변수명이 모호해 `true`일 때의 상태를 유추하기 힘들다
```tsx
function SubmitForm({ items, validateResult }: FormProps) {
  const login = user.token !== null;
  const empty = items.length === 0;

  if (login && !empty && validateResult) {
    return <Button>제출</Button>;
  }
  return null;
}
```

**After** — 이름만으로 상태와 렌더링 조건이 언어적으로 자연스럽게 읽힌다
```tsx
function SubmitForm({ items, isValid }: FormProps) {
  const isLoggedIn = user.token !== null;
  const hasItems = items.length > 0;

  if (isLoggedIn && hasItems && isValid) {
    return <Button>제출</Button>;
  }
  return null;
}
```

> Boolean 변수에 접두어를 붙이면, 조건문을 자연어처럼 읽을 수 있다. `if (isLoggedIn && hasItems)`는 "로그인했고 요소가 있으면"으로 쉽게 해석된다.

### 1-4. 이벤트 핸들러에 일관된 이름 붙이기

React 컴포넌트에서 이벤트 핸들러 이름이 일관되지 않으면(`clickAction`, `deleteCallback`, `doSomething` 등), 읽는 사람이 그 함수가 외부에서 전달받은 콜백 Props인지 컴포넌트 내부에서 정의한 핸들러인지 구분할 수 없다. `on*`(Props 콜백) / `handle*`(내부 핸들러) 규칙을 적용하면 이름만으로 역할이 드러난다.

**Before** — 이름만으로는 외부 콜백인지 내부 핸들러인지 알 수 없다
```tsx
interface ProductCardProps {
  id: string;
  deleteCallback: () => void;
  clickAction: (id: string) => void;
}

function ProductCard({ id, deleteCallback, clickAction }: ProductCardProps) {
  const doSomething = () => {
    analytics.track("delete");
    deleteCallback();
  };

  return (
    <Card>
      <Button onClick={() => clickAction(id)}>상세 보기</Button>
      <Button onClick={doSomething}>삭제</Button>
    </Card>
  );
}
```

**After** — `on*`은 외부에서 받은 콜백 Props, `handle*`은 내부에서 정의한 핸들러임이 즉시 드러난다
```tsx
interface ProductCardProps {
  id: string;
  onDelete: () => void;
  onClick: (id: string) => void;
}

function ProductCard({ id, onDelete, onClick }: ProductCardProps) {
  const handleDelete = () => {
    analytics.track("delete");
    onDelete();
  };

  return (
    <Card>
      <Button onClick={() => onClick(id)}>상세 보기</Button>
      <Button onClick={handleDelete}>삭제</Button>
    </Card>
  );
}
```

> `on*`은 "이 컴포넌트가 외부에 알리는 이벤트", `handle*`은 "이 컴포넌트 내부에서 처리하는 로직"으로 일관되게 읽혀야 한다.

---

## 2. 분리하기

하나의 함수나 컴포넌트가 여러 맥락을 동시에 담고 있으면, 한 번에 파악해야 할 내용이 증가한다. 맥락별, 기능별로 단위를 분리하면 가독성이 높아진다.

### 2-1. 구현 상세 추상화하기

React에서 비즈니스 로직 상세 구현이 뷰 렌더링과 섞여 있으면 코드를 파악하기 어렵다. 컴포넌트나 커스텀 훅으로 추상화하면 한 눈에 읽어야 할 맥락이 줄어든다.

**Before** — 인증 확인 로직의 세부 사항을 모두 뷰와 섞여 읽어야 한다
```tsx
function LoginStartPage() {
  const router = useRouter();

  useCheckLogin({
    onChecked: (status) => {
      if (status === "LOGGED_IN") {
        router.push("/home");
      }
    }
  });

  return <div>{/* ... 로그인 폼 컴포넌트 ... */}</div>;
}
```

**After** — `GuestGuard`라는 래퍼(Wrapper) 렌더링 컴포넌트로 선언적으로 분리한다
```tsx
function App() {
  return (
    <GuestGuard>
      <LoginStartPage />
    </GuestGuard>
  );
}

function LoginStartPage() {
  return <div>{/* ... 로그인 폼 컴포넌트 ... */}</div>;
}
```

### 2-2. 동시에 실행되지 않는 코드 분리하기

서로 다른 도메인의 코드가 하나의 컴포넌트에 섞여 있으면, 조건 분기가 교차되어 코드가 길어진다.

**Before** — 권한별 뷰 렌더링이 하나의 컴포넌트에 섞여 읽기 피곤하다
```tsx
function SubmitButton() {
  const isViewer = useRole() === "viewer";

  useEffect(() => {
    if (isViewer) return;
    showButtonAnimation();
  }, [isViewer]);

  return isViewer ? (
    <TextButton disabled>Submit</TextButton>
  ) : (
    <Button type="submit">Submit</Button>
  );
}
```

**After** — 권한별로 렌더링 컴포넌트를 분리하면 각 컴포넌트별로 흐름이 나뉜다
```tsx
function SubmitButton() {
  const isViewer = useRole() === "viewer";
  return isViewer ? <ViewerSubmitButton /> : <AdminSubmitButton />;
}

function ViewerSubmitButton() {
  return <TextButton disabled>Submit</TextButton>;
}

function AdminSubmitButton() {
  useEffect(() => {
    showButtonAnimation();
  }, []);

  return <Button type="submit">Submit</Button>;
}
```

### 2-3. 책임별로 Hook 분리하기

하나의 커스텀 Hook에 모든 상태가 모여있으면, 책임이 비대해져 역할 파악에 어려움을 겪는다. 검색, 필터, 페이징 등 책임을 나누어 Hook을 정의하면 선언적 사용이 가능해진다.

**Before** — 데이터 로딩(로컬 useEffect), 검색 파라미터, 필터 상태가 하나의 커스텀 훅에 강하게 결합되어 재사용이 불가능하다.
```tsx
function useProducts() {
  const [items, setItems] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("ALL");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    fetchProducts({ keyword, category })
      .then(setItems)
      .finally(() => setIsLoading(false));
  }, [keyword, category]);

  return { items, isLoading, keyword, setKeyword, category, setCategory };
}
```

**After (1)** — 최신 React 생태계 권장: UI 상태(필터 등)를 관리하는 훅과 서버 상태(데이터 패칭)를 관리하는 훅을 분리하여 각자의 책임에 집중한다.
```tsx
// 1. UI 상태(필터)만 관리하는 Hook
function useProductFilters() {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("ALL");
  return { keyword, setKeyword, category, setCategory };
}

// 2. 서버 상태(데이터 패칭)만 책임지는 Hook (React Query, SWR 등 활용)
function useProductsQuery({ keyword, category }) {
  return useQuery({
    queryKey: ['products', { keyword, category }],
    queryFn: () => fetchProducts({ keyword, category }),
  });
}

// 컴포넌트에서의 조합 및 사용
function ProductList() {
  const { keyword, setKeyword, category, setCategory } = useProductFilters();
  const { data: items, isLoading } = useProductsQuery({ keyword, category });
  
  // ...
}
```

> 최신 React 생태계(2026년 기준)에서는 비동기 데이터 로딩(서버 상태)을 `useEffect`로 직접 다루기보다 React Query(@tanstack/react-query)나 SWR 같은 전용 라이브러리를 사용하는 것이 표준입니다. 클라이언트 UI 상태(필터 등)와 서버 상태(데이터) 관리 책임을 명확하게 분리하는 것이 핵심입니다.

**After (2)** — 외부 라이브러리(React Query 등)를 사용하지 않는 환경: 데이터 패칭 로직을 별도의 커스텀 훅으로 분리하고, 의존성 배열에 원시값을 직접 주입하여 관리한다.
```tsx
function useProductFilters() {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("ALL");
  return { keyword, setKeyword, category, setCategory };
}

// 데이터 로딩 로직만 따로 분리하여 책임 최소화
function useProducts({ keyword, category }) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    setIsLoading(true);
    fetchProducts({ keyword, category })
      .then(setItems)
      .finally(() => setIsLoading(false));
  }, [keyword, category]);

  return { items, isLoading };
}

function ProductList() {
  const { keyword, setKeyword, category, setCategory } = useProductFilters();
  const { items, isLoading } = useProducts({ keyword, category });
  
  // ...
}
```

> 객체 전체(`filters`)를 의존성으로 두면 참조 변경으로 effect가 반복될 수 있습니다. 가능하면 실제로 사용하는 원시값(`keyword`, `category`) 단위로 의존성을 명시합니다.

### 2-4. Early Return으로 핵심 조건 드러내기

컴포넌트 렌더링 초반에 `isLoading`, `error` 등 예외를 처리하고 `return`으로 빠져나오면, 핵심 JSX 반환부가 가장 바깥 레벨(Top level)에 자연스럽게 자리하게 된다.

**Before** — 핵심 컴포넌트 렌더링이 들여쓰기 3단계 이상으로 깊게 파묻혀 있다
```tsx
function UserProfile({ user, isLoading }: UserProfileProps) {
  if (!isLoading) {
    if (user) {
      if (user.hasProfile) {
        return <ProfileView user={user} />;
      } else {
        return <EmptyProfileView />;
      }
    } else {
      return <ErrorView />;
    }
  } else {
    return <Spinner />;
  }
}
```

**After** — 예외와 로딩을 먼저 걸러내어, 들여쓰기 깊이가 줄고 위에서 아래로 읽힌다
```tsx
function UserProfile({ user, isLoading }: UserProfileProps) {
  if (isLoading) return <Spinner />;
  if (!user) return <ErrorView />;
  if (!user.hasProfile) return <EmptyProfileView />;

  return <ProfileView user={user} />;
}
```

### 2-5. 연관된 상태를 묶어 파편화 방지하기

관련된 로컬 상태가 여러 개의 `useState`로 분할되어 있으면, 렌더링 업데이트 시점이 파편화되고 수많은 `set*` 함수들로 인해 가독성이 떨어진다. 관련된 상태와 로직을 묶어 커스텀 훅이나 `useReducer`로 응집시키면 더 적은 코드로 명확히 관리할 수 있다.

> [!WARNING]
> 상태를 묶을 때에는 **리렌더링의 트레이드오프**도 고려해야 한다. 하나의 필드가 변경될 때 무관한(의존성이 묶인) 다른 자식 컴포넌트까지 불필요한 리렌더링이 일어날 수 있다. 따라서 폼(Form)처럼 입력 빈도가 높은 영역에서는 상태 응집과 분리의 균형을 맞추고, 팀에서 사용하는 상태 관리 방식 안에서 일관된 패턴을 유지하는 것이 중요하다.

**Before** — 컴포넌트 상단에 시각적 노이즈가 강하다
```tsx
function RegistrationForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // ...
}
```

**After** — 관련된 입력 폼 상태와 핸들러들을 커스텀 훅으로 추상화하여 시각적 노이즈를 제거한다
```tsx
function useRegistrationForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    phone: ""
  });
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  return { formData, handleChange };
}

function RegistrationForm() {
  const { formData, handleChange } = useRegistrationForm();
  // ...
}
```

### 2-6. 거대한 JSX 반환부를 작은 단위로 분리하기

`return`문에 수많은 JSX 태그가 중첩되어 100줄 이상을 차지하게 되면 화면 구조를 이해하기 힘들다. 작은 컴포넌트로 분리하고 조립(Composition)하는 형태를 우선 검토하는 것이 좋다.

**Before** — 하나의 큰 덩어리로 구성된 렌더링 레이아웃
```tsx
function Dashboard() {
  return (
    <div className="dashboard">
      <header className="header">
         {/* 수십 줄의 복잡한 헤더 내용 */}
      </header>
      <main className="content">
         <div className="primary-content">
           {/* 수십 줄의 메인 컨텐츠 컴포넌트들 */}
         </div>
         <aside className="sidebar">
           {/* 수십 줄의 사이드바 내용 */}
         </aside>
      </main>
    </div>
  );
}
```

**After** — 구조를 명확히 보여주는 작은 단위의 컴포넌트들의 조합
```tsx
function Dashboard() {
  return (
    <div className="dashboard">
      <DashboardHeader />
      <main className="content">
        <MainContent />
        <Sidebar />
      </main>
    </div>
  );
}
```

### 2-7. Props Drilling 완화와 명확한 전달

Props를 자식 컴포넌트의 자식 영역까지 계속 전달하게 되면(Props Drilling), 중간 경유지 수준의 컴포넌트들이 불필요한 의존성을 갖게 되어 코드 시야가 흐려진다. 문제의 범위에 따라 `children` 합성, Context, 커스텀 훅 등 적절한 전달 방식을 선택해 완화할 수 있다.

**Before** — `Layout`은 자신이 사용하지도 않는 `user`나 `onLogout`을 받아 넘겨준다
```tsx
function Layout({ user, onLogout }) {
  return (
    <div>
      <Header user={user} onLogout={onLogout} />
      <Main />
    </div>
  );
}

function App() {
  return <Layout user={user} onLogout={handleLogout} />;
}
```

**After** — `Layout`은 레이아웃에만 집중하고, 필요한 컴포넌트는 합성(Composition)으로 넘긴다
```tsx
function Layout({ children }) {
  return <div className="layout">{children}</div>;
}

function App() {
  return (
    <Layout>
      <Header user={user} onLogout={handleLogout} />
      <Main />
    </Layout>
  );
}
```

---

## 3. 단순하게 표현하기

논리적으로 동일하더라도 표현 방식에 따라 가독성이 달라진다. 컴포넌트의 렌더링 로직이나 JSX를 자연스럽게 흐르도록 작성하면 이해 속도를 높일 수 있다.

### 3-1. 수치 범위 비교 시 일관된 컨벤션 유지하기

특정 수치를 기반으로 렌더링 조건을 분기할 때, 수학 부등식처럼 작성(`1 <= count && count <= 9`)하면 직관적으로 보일 수 있지만, 변수(주체)의 위치에 대한 논쟁(Yoda 조건식)이 발생하기도 한다.
가장 중요한 것은 팀 내에서 "비교 대상(주체)을 먼저(왼쪽에) 둔다(`count >= 1 && count <= 9`)"와 같이 **합의된 컨벤션을 채택하여 코드 전체의 일관성을 맞추는 것**이다.

**Before** — 비교 주체의 위치와 방향이 일관되지 않아 흐름이 끊긴다
```tsx
function AlertBadge({ count }: { count: number }) {
  // 변수가 왼쪽/오른쪽 혼재됨
  if (count >= 1 && 9 >= count) {
    return <Badge>{count}</Badge>;
  }
  return <Badge>10+</Badge>;
}
```

**After** — 일관된 규칙(예: 변수를 항상 왼쪽에)을 통일하여 예상대로 읽힌다
```tsx
function AlertBadge({ count }: { count: number }) {
  if (count >= 1 && count <= 9) {
    return <Badge>{count}</Badge>;
  }
  return <Badge>10+</Badge>;
}
```

### 3-2. 중첩 삼항 연산자 단순화하기

리액트 JSX 내부에서는 `if`문을 쓸 수 없어 삼항 연산자가 중첩되기 쉽다. 조건 구조가 한눈에 들어오지 않으므로, 외부의 헬퍼 함수나 초기 반환구로 분리한다.

**Before**
```tsx
function StatusBadge({ isNew, isPopular }: StatusProps) {
  return (
    <Badge>
      {isNew && isPopular ? "Hot & New" : isNew || isPopular ? (isNew ? "New" : "Hot") : "Normal"}
    </Badge>
  );
}
```

**After** — 렌더 함수 밖의 조건 블록으로 분리하면 흐름이 명확하다
```tsx
function getStatusLabel(isNew: boolean, isPopular: boolean) {
  if (isNew && isPopular) return "Hot & New";
  if (isNew) return "New";
  if (isPopular) return "Hot";
  return "Normal";
}

function StatusBadge({ isNew, isPopular }: StatusProps) {
  return <Badge>{getStatusLabel(isNew, isPopular)}</Badge>;
}
```

### 3-3. 시점 이동 최소화하기 (Colocation)

상태나 변수의 정의부와 실제 사용되는 JSX 렌더링 뷰가 멀리 떨어져 있으면 스크롤을 여러 번 오르내려야 한다(시점 이동). 우선 관련 상태와 UI를 가까운 위치에 배치하고, 문맥 단위가 커질 때만 자식 컴포넌트로 분리한다.

**Before** — 변수 선언과 사용 위치가 떨어져 있어 스크롤을 오르내려야 한다
```tsx
function UserSettings() {
  const [theme, setTheme] = useState("light");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // ... 중간에 수십 줄의 거대한 타 로직과 변수 선언 ...

  return (
    <div>
      <ThemeSelector theme={theme} onChange={setTheme} />
      <NotificationToggle 
        enabled={notificationsEnabled} 
        onToggle={setNotificationsEnabled} 
      />
    </div>
  );
}
```

**After** — 문맥 단위가 큰 섹션만 분리해 시점 이동을 줄이고, 공유 상태는 필요한 레벨에 유지한다
```tsx
function ThemeSection() {
  const [theme, setTheme] = useState("light");
  return <ThemeSelector theme={theme} onChange={setTheme} />;
}

function NotificationSection() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  return (
    <NotificationToggle 
      enabled={notificationsEnabled} 
      onToggle={setNotificationsEnabled} 
    />
  );
}

function UserSettings() {
  // ... 다른 로직들 ...

  return (
    <div>
      <ThemeSection />
      <NotificationSection />
    </div>
  );
}
```

> 상태를 분리할 때는 공유/동기화 요구를 먼저 확인한다. 여러 섹션에서 함께 쓰는 상태는 상위에 두고, 독립적인 상태만 분리한다.

### 3-4. 부정 조건 단순화하기

컴포넌트의 Props나 부정 조건을 복잡하게 연결하면, 시각적으로나 논리적으로 의미를 반전시켜 해석해야 하는 오버헤드를 발생시킨다.

**Before** — 부정형 이름과 부정 연산자가 결합되면 의미를 여러 번 뒤집어야 이해할 수 있다
```tsx
function SubmitModal({ isNotVisible, disableSubmit }: ModalProps) {
  // "보이지 않는 상태라면 렌더링하지 않음"
  if (isNotVisible) {
    return null;
  }
  
  // "제출 불가를 활성화" -> "제출 불가능"
  return <Button disabled={disableSubmit}>제출</Button>;
}
```

**After** — 긍정형 이름으로 한 번에 의미가 읽힌다
```tsx
function SubmitModal({ isVisible, canSubmit }: ModalProps) {
  if (!isVisible) {
    return null;
  }
  
  return <Button disabled={!canSubmit}>제출</Button>;
}
```

### 3-5. 메모이제이션 필요성 점검하기

`useMemo`, `useCallback`, `React.memo`는 성능 최적화 도구이지만, 의존성 배열과 래퍼 코드로 인해 가독성을 낮출 수 있다. 성능 측정 근거가 없거나 계산 비용이 작다면 단순한 구현을 우선하고, 병목 구간이나 참조 안정성이 필요한 지점에서만 메모이제이션을 유지하는 것이 좋다.

**Before** — 단순한 연산과 함수에 의미 없이 `useMemo`와 `useCallback`이 감싸져 있어 코드가 복잡해 보인다
```tsx
function UserList({ users, filterKeyword }: UserListProps) {
  const filteredUsers = useMemo(() => {
    return users.filter(user => user.name.includes(filterKeyword));
  }, [users, filterKeyword]);

  const handleUserClick = useCallback((userId: string) => {
    console.log("Clicked:", userId);
  }, []);

  return (
    <ul>
      {filteredUsers.map(user => (
        <li key={user.id} onClick={() => handleUserClick(user.id)}>
          {user.name}
        </li>
      ))}
    </ul>
  );
}
```

**After** — 필요 없다고 판단된 메모이제이션을 제거하면 핵심 로직이 더 선명해진다
```tsx
function UserList({ users, filterKeyword }: UserListProps) {
  const filteredUsers = users.filter(user => user.name.includes(filterKeyword));

  const handleUserClick = (userId: string) => {
    console.log("Clicked:", userId);
  };

  return (
    <ul>
      {filteredUsers.map(user => (
        <li key={user.id} onClick={() => handleUserClick(user.id)}>
          {user.name}
        </li>
      ))}
    </ul>
  );
}
```

> 메모이제이션은 "쓰지 말자"가 아니라 "필요할 때만 쓰자"가 핵심이다. 팀에서 성능 측정 기준(프로파일링, 렌더 횟수, 사용자 체감)을 먼저 합의하면 판단이 일관된다.

---

## 적용 기준

이 가이드의 규칙들은 모든 코드에 기계적으로 적용하는 것이 아니라, **읽는 사람의 인지 부담이 실제로 줄어드는지**를 기준으로 판단해야 한다.

### 적용하면 좋은 경우

- 다른 사람이 읽거나 유지보수해야 하는 컴포넌트 코드
- 컴포넌트 렌더링 의도가 이름이나 구조만으로 드러나지 않는 경우
- 코드 리뷰에서 "이 코드가 어떻게 그려지는지 모르겠다"는 피드백이 나오는 경우

### 과도한 적용을 피해야 하는 경우

- **짧은 컴포넌트를 억지로 더 깊은 컴포넌트들로 쪼개는 것** — 전체 구조의 흐름 파악을 오히려 어렵게 만든다
- **팀 컨벤션과 다른 스타일을 개인 취향으로 강요하는 것** — 가독성은 읽는 사람의 익숙함도 중요하므로 컨벤션을 우선시한다

---

## 요약

| 카테고리 | 규칙 (React 관점) | 가독성 효과 |
|----------|------|------------|
| **이름 붙이기** | 매직 넘버에 이름 붙이기 | 렌더링이나 생명주기에 쓰인 숫자의 의미 파악 |
| | 복잡한 렌더링 조건 이름 붙이기 | JSX에 노출될 복잡한 조건을 위에서 미리 파악 |
| | Props/State 변수에 직관적 이름 붙이기 | 뷰를 어떻게 다뤄야 하는지 자연어로 쉽게 읽기 |
| | 이벤트 핸들러 명명 일관성 | 함수명만으로 내부 처리인지, 자식에게 넘길 Props인지 구분 |
| **분리하기** | 구현 상세 추상화하기(Hooks 등) | 화면을 그리는 뷰와 상태 조작 로직을 분리 |
| | 조건 분기별 컴포넌트 분리하기 | 한 번에 하나의 레이아웃 흐름만 읽도록 처리 |
| | Early Return | 불필요한 JSX Depth 낭비를 방지 |
| | 상태 파편화 방지하기 | 여러 `useState`를 객체나 리듀서로 응집 |
| | 컴포넌트 및 레이아웃 분리와 조합 | 거대한 반환부를 쪼개어 화면 컴파일 시각적 명확도 확보 |
| | Props Drilling 방지 (합성 응용) | 꼭 필요한 컴포넌트에만 의존성을 부과 |
| **단순하게 표현하기** | 선언적 수치 범위 비교 (JSX) | 한 눈에 들어오는 렌더링 값 범위 지정 |
| | 중첩 삼항 연산자 단순화 | JSX 내 구조 붕괴 방지 |
| | 부정 조건 Props 단순화 | 불필요한 의미 반전 해소 |
| | 메모이제이션 필요성 점검 | 필요한 최적화는 유지하고, 불필요한 래퍼만 줄임 |

모든 규칙의 공통 목표: **React 코드를 읽는 개발자가 한 번에 고려해야 하는 객체와 렌더링의 맥락을 최소화하여 가독성을 높인다.**

---

## 부록: 가독성 관점의 React 참고 사항

리액트 클라이언트 사이드 코드는 UI 요소와 데이터를 유기적으로 합성하는 것이 본질입니다. 

- **Custom Hooks 중심의 관심사 분리**: 생명주기와 부수효과를 한 번에 다루기보다, 도메인 단위의 커스텀 훅으로 분리하면 뷰 컴포넌트가 단순해질 수 있습니다.
- **도구/버전 기능은 보조 수단으로 활용**: `use()`, Suspense/Error Boundary, Compiler 같은 기능은 일부 맥락에서 가독성 개선에 도움이 될 수 있지만, 이 문서의 핵심은 특정 기술 도입 여부와 무관하게 유지되는 읽기 원칙(이름, 분리, 단순화)입니다.
