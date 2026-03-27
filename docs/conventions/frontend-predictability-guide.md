# 프론트엔드 예측 가능성 가이드

## 왜 중요한가

예측 가능한 코드는 **이름, 입력, 반환 타입만 보고 동작을 이해할 수 있는 코드**다.
이 기준이 지켜지면 버그, 리뷰 비용, 온보딩 비용, 리팩토링 위험이 줄어든다.

핵심 질문:

> 이 함수/컴포넌트를 처음 본 동료가 내부 구현을 보지 않고도 올바르게 사용할 수 있는가?

## 목차

1. [숨은 로직 드러내기](#원칙-1-숨은-로직-드러내기)
2. [이름이 동작을 설명하게 만들기](#원칙-2-이름이-동작을-설명하게-만들기)
3. [같은 레이어의 반환 타입 통일하기](#원칙-3-같은-레이어의-반환-타입-통일하기)
4. [Boolean 파라미터 줄이기](#원칙-4-boolean-파라미터-줄이기)
5. [컴포넌트 의존성 명시하기](#원칙-5-컴포넌트-의존성-명시하기)
6. [불가능한 상태를 타입으로 차단하기](#원칙-6-불가능한-상태를-타입으로-차단하기)
7. [에러 처리 전략을 시그니처에 반영하기](#원칙-7-에러-처리-전략을-시그니처에-반영하기)
8. [파생 가능한 값을 상태로 관리하지 않기](#원칙-8-파생-가능한-값을-상태로-관리하지-않기)

---

## 원칙 1: 숨은 로직 드러내기

함수 내부에 시그니처로 보이지 않는 부수효과(로깅, 추적, 전역 갱신)를 숨기지 않는다.

```typescript
// Before
async function fetchBalance(): Promise<number> {
  const balance = await http.get<number>("...");
  logging.log("balance_fetched");
  return balance;
}

// After (명시적인 파사드 패턴 활용)
// 부수효과가 비즈니스 로직상 필수라면, 이름에 드러내 책임을 명확히 합니다.
async function fetchBalanceAndLog(): Promise<number> {
  const balance = await http.get<number>("...");
  logging.log("balance_fetched");
  return balance;
}

// (또는 전역적인 관심사라면 HTTP 인터셉터 단계로 위임하여 호출부의 책임을 줄입니다.)
```

체크:

- 이름만 보고 동작(부수효과 포함)을 예측할 수 있는가?
- 부수효과가 꼭 필요한 경우, 호출부가 이를 누락할 위험은 없는가?

---

## 원칙 2: 이름이 동작을 설명하게 만들기

동작이 다르면 이름도 달라야 한다. 특히 라이브러리 이름과 내부 래퍼 이름을 구분한다.

```typescript
// Before
export const http = {
  async get(url: string) {
    const token = await fetchToken();
    return httpLibrary.get(url, { headers: { Authorization: `Bearer ${token}` } });
  },
};

// After
export const httpService = {
  async getWithAuth(url: string) {
    const token = await fetchToken();
    return httpLibrary.get(url, { headers: { Authorization: `Bearer ${token}` } });
  },
};
```

체크:

- 이름만 봐도 인증/캐시/재시도 같은 부가 동작을 알 수 있는가?
- 같은 접두사의 함수들이 같은 규칙을 따르는가?

---

## 원칙 3: 같은 레이어의 반환 타입 통일하기

같은 역할의 함수/Hook이 반환 타입이 다르면 호출부가 매번 분기된다.

```typescript
// Before
function useUser() {
  return useQuery({ queryKey: ["user"], queryFn: fetchUser });
}

function useServerTime() {
  return useQuery({ queryKey: ["serverTime"], queryFn: fetchServerTime }).data;
}

// After (팀 규칙 예시: 동일 레이어에서 반환 형태를 맞춤)
function useUser() {
  return useQuery({ queryKey: ["user"], queryFn: fetchUser });
}

function useServerTime() {
  return useQuery({ queryKey: ["serverTime"], queryFn: fetchServerTime });
}
```

체크:

- 같은 레이어의 API가 팀에서 정한 형태로 일관되게 응답하는가?
- 호출부에서 반환 형태를 추측하지 않아도 되는가?

---

## 원칙 4: Boolean 파라미터 줄이기

`true/false`는 의미를 숨긴다. 동작을 이름으로 드러내거나 옵션 객체를 쓴다.

```typescript
// Before
toggleSidebar(true);
toggleSidebar(false);

// After
openSidebar();
closeSidebar();
```

```typescript
// 여러 플래그는 옵션 객체로 명시
formatDate(date, { includeTime: true, includeTimezone: false });
```

체크:

- 호출부만 보고 의도가 보이는가?
- Boolean 개수가 늘어나며 조합 복잡도가 커지지 않는가?

---

## 원칙 5: 컴포넌트 의존성 명시하기

컴포넌트 의존성은 가능하면 Props와 명시적 Context로 드러내고, 전역 접근은 경계를 분명히 둔다.

```tsx
// Before
function UserGreeting() {
  const user = globalStore.getState().user;
  return <div>{user.name}님</div>;
}

// After (선택 가능한 패턴: 컨테이너/프리젠테이셔널 분리)
type UserGreetingProps = { userName: string; primaryColor: string };

// 순수 프리젠테이셔널 컴포넌트: Props만으로 렌더링 결정
function UserGreeting({ userName, primaryColor }: UserGreetingProps) {
  return <div style={{ color: primaryColor }}>{userName}님</div>;
}

// 컨테이너 컴포넌트: Context 등의 외부 의존성을 주입
function UserGreetingContainer() {
  const theme = useTheme();
  // ... userName을 가져오는 로직 (생략)
  return <UserGreeting userName="홍길동" primaryColor={theme.primaryColor} />;
}
```

> 예측 가능성을 높이려면 외부 의존성(Context/store)을 컴포넌트 경계에서 드러내는 편이 좋다. 컨테이너/프리젠테이셔널 분리는 유용한 선택지 중 하나이며, 팀 규모와 복잡도에 따라 적용 범위를 조절할 수 있다. `useTheme()` 같은 Hook을 컴포넌트 내부에서 직접 사용해도 되지만, 테스트/Storybook에서 필요한 Provider/Mock을 함께 명시해 의존성을 드러내는 것이 중요하다.

체크:

- 같은 Props와 같은 외부 의존성(Context/store)에서는 같은 결과가 나오는가?
- 샌드박스(Storybook/테스트)에서 필요한 Provider/Mock을 명시해 재현 가능한가?

---

## 원칙 6: 불가능한 상태를 타입으로 차단하기

상태 필드를 나열하면 모순 조합이 생긴다. 상태를 합집합(Discriminated Union)으로 모델링한다.

```typescript
// Before
type State = {
  isLoading: boolean;
  error: Error | null;
  data: User | null;
};

// After
type State =
  | { type: "loading" }
  | { type: "error"; error: Error }
  | { type: "success"; data: User };
```

exhaustive check를 적용하면, 새로운 상태가 추가되었을 때 처리되지 않은 분기를 컴파일 타임에 발견할 수 있다.

```typescript
function getStatusMessage(state: State): string {
  switch (state.type) {
    case "loading":
      return "로딩 중...";
    case "error":
      return state.error.message;
    case "success":
      return `${state.data.name}님, 환영합니다!`;
    default:
      // State에 새 타입이 추가되면 여기서 컴파일 에러 발생
      const _exhaustive: never = state;
      throw new Error(`Unhandled state: ${_exhaustive}`);
  }
}
```

체크:

- 동시에 존재할 수 없는 상태가 타입에서 배제되는가?
- 새 상태 추가 시 미처리 분기를 컴파일 단계에서 잡는가?

---

## 원칙 8: 파생 가능한 값을 상태로 관리하지 않기

Props나 기존 상태에서 계산 가능한 값을 별도 `useState`로 관리하면, 그 값이 독립적인 상태인지 파생 값인지 시그니처만으로는 알 수 없다. 파생 가능한 값은 렌더링 중에 직접 계산하여 데이터 관계를 드러낸다.

```tsx
// Before — total이 독립 상태인지 items에서 파생된 값인지 알 수 없다
const [total, setTotal] = useState(0);
useEffect(() => {
  setTotal(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
}, [items]);

// After — items로부터 파생된 값임이 명확하다
const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
```

체크:

- 이 값이 다른 상태/Props에서 계산 가능한가?
- `useState`로 관리되는 값의 출처를 코드만 보고 예측할 수 있는가?
