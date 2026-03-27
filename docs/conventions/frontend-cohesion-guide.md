# React 프론트엔드 응집도 가이드

> **원칙**: 함께 변경되는 코드는 물리적으로 가까이 둔다.

응집도(Cohesion)란 **함께 수정되어야 하는 코드가 얼마나 가까이 위치하는가**를 뜻한다. 응집도가 낮으면 한쪽만 수정하고 다른 쪽을 놓쳐 서비스가 조용히 깨질 수 있다.

이 가이드는 React 프론트엔드 코드에서 응집도를 높이는 **6가지 핵심 기법**을 다룬다.

## 적용 범위와 해석 원칙

- 이 문서는 **React(TypeScript) 프로젝트**를 대상으로 한다.
- 예시 코드는 이해를 돕기 위한 샘플이며, 팀의 아키텍처(예: CSR, SSR, RSC)에 맞게 변형한다.
- 핵심은 도구 선택이 아니라 **함께 바뀌는 코드가 함께 보이고 함께 수정되는 구조**를 만드는 것이다.

---

## 목차

1. [디렉토리 구조 — 도메인/기능별 분류](#1-디렉토리-구조--도메인기능별-분류)
2. [커스텀 훅 — 관련 로직의 응집](#2-커스텀-훅--관련-로직의-응집)
3. [상태 코로케이션 — 사용처 가까이에 상태 배치](#3-상태-코로케이션--사용처-가까이에-상태-배치)
4. [파일 코로케이션 — 타입·스타일·테스트를 함께 두기](#4-파일-코로케이션--타입스타일테스트를-함께-두기)
5. [데이터 요청 코로케이션 — 데이터 의존성을 기능 단위로 배치](#5-데이터-요청-코로케이션--데이터-의존성을-기능-단위로-배치)
6. [폼 검증 스키마 코로케이션 — 타입과 검증의 단일 원천](#6-폼-검증-스키마-코로케이션--타입과-검증의-단일-원천)

---

## 1. 디렉토리 구조 — 도메인/기능별 분류

### 문제: 종류별 분류

```text
└─ src
   ├─ components
   ├─ constants
   ├─ containers
   ├─ hooks
   ├─ utils
   └─ ...
```

파일을 **종류별**로 나누면 코드 간 의존 관계를 파악하기 어렵다. 특정 기능을 삭제할 때 연관 파일을 놓쳐 사용되지 않는 코드가 남게 된다.

### 개선: 도메인/기능별 분류

```text
└─ src
   ├─ components       // 전체 공용
   ├─ hooks
   ├─ utils
   └─ domains
      ├─ UserProfile       // UserProfile 도메인
      │     ├─ UserProfile.tsx
      │     ├─ useUserProfile.ts
      │     └─ UserProfile.module.css
      └─ Payment           // Payment 도메인
            ├─ PaymentForm.tsx
            ├─ usePayment.ts
            └─ paymentUtils.ts
```

함께 수정되는 파일을 같은 디렉토리에 두면:

- **의존 관계가 명확해진다** — 다른 도메인을 참조하는 `import`를 즉시 인지할 수 있다.
- **삭제가 깔끔해진다** — 디렉토리 하나를 삭제하면 관련 코드가 모두 제거된다.

```typescript
// 잘못된 참조를 쉽게 발견할 수 있다
import { usePayment } from "../../../Payment/usePayment";
```

### 판단 기준

| 질문 | "예"라면 |
|------|---------|
| 이 파일은 특정 도메인에서만 쓰이는가? | 해당 도메인 디렉토리로 이동 |
| 2개 이상의 도메인에서 공유되는가? | 공용 디렉토리(`src/components` 등)에 유지 |
| 도메인 디렉토리를 삭제하면 관련 코드가 모두 사라지는가? | 응집도가 높은 상태 |

---

## 2. 커스텀 훅 — 관련 로직의 응집

### 문제: 컴포넌트 안에 흩어진 로직

```typescript
function ProductPage({ id }: { id: string }) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchProduct(id)
      .then(setProduct)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  function addToCart(item) {
    setCart((prev) => [...prev, item]);
  }

  function toggleModal() {
    setIsModalOpen((prev) => !prev);
  }

  // ... 렌더링 로직
}
```

상품 조회, 장바구니, 모달 등 **서로 다른 관심사**가 한 컴포넌트에 섞여 있다. 상품 조회 로직을 수정할 때 장바구니 코드까지 읽어야 한다.

### 개선: 관심사별 커스텀 훅 분리

```typescript
function useProduct(id: string) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProduct(id)
      .then(setProduct)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  return { product, loading, error };
}

function useCart() {
  const [cart, setCart] = useState([]);

  function addToCart(item) {
    setCart((prev) => [...prev, item]);
  }

  return { cart, addToCart };
}
```

```typescript
function ProductPage({ id }: { id: string }) {
  const { product, loading, error } = useProduct(id);
  const { cart, addToCart } = useCart();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 컴포넌트는 조합만 담당한다
}
```

커스텀 훅으로 분리하면:

- **관련 상태 + Effect + 핸들러**가 하나의 단위로 묶인다.
- 훅 내부를 수정해도 **다른 관심사에 영향이 없다**.
- 훅 단위로 **테스트와 재사용**이 가능하다.

### 분리 판단 기준

| 질문 | "예"라면 |
|------|---------|
| `useState`와 `useEffect`가 논리적으로 한 묶음인가? | 커스텀 훅으로 추출 |
| 이 로직이 다른 컴포넌트에서도 쓰일 수 있는가? | 커스텀 훅으로 추출 |
| 상태/이펙트가 많아져 한 번에 이해하기 어려운가? | 관심사별 커스텀 훅 분리 검토 |

---

## 3. 상태 코로케이션 — 사용처 가까이에 상태 배치

### 문제: 불필요하게 높은 위치의 상태

```typescript
function App() {
  const [searchQuery, setSearchQuery] = useState(""); // App 전체에서 관리

  return (
    <Layout>
      <Header />
      <SearchPage query={searchQuery} onQueryChange={setSearchQuery} />
      <Footer />
    </Layout>
  );
}
```

`searchQuery`는 `SearchPage`에서만 사용되지만, 상위 컴포넌트인 `App`에 선언되어 있다. 핵심 문제는 함께 바뀌는 상태(`searchQuery`)와 사용처(`SearchInput`, `SearchResults`)가 멀어져 수정 시 탐색 범위가 넓어진다는 점이다. 리렌더링 범위 확대는 부가적으로 따라올 수 있는 문제다.

### 개선: 사용처로 상태 이동

```typescript
function App() {
  return (
    <Layout>
      <Header />
      <SearchPage />
      <Footer />
    </Layout>
  );
}

function SearchPage() {
  const [searchQuery, setSearchQuery] = useState(""); // 사용처에 배치

  return (
    <>
      <SearchInput value={searchQuery} onChange={setSearchQuery} />
      <SearchResults query={searchQuery} />
    </>
  );
}
```

상태를 실제 사용처 가까이에 두면:

- **함께 수정되는 코드가 가까워진다** — 상태와 사용처가 붙어 있어 변경 지점을 한 번에 파악할 수 있다.
- **데이터 흐름이 명확해진다** — 상태의 출처와 소비 위치를 같은 문맥에서 이해할 수 있다.
- **컴포넌트 독립성이 높아진다** — 해당 컴포넌트를 이동하거나 삭제할 때 상위 컴포넌트를 수정할 필요가 없다.
- **리렌더링 영향 범위가 줄 수 있다(부수 효과)** — 상태 변경이 관련 컴포넌트에 국한될 가능성이 높다.

> 주의: 이 항목은 응집도의 정의 자체가 아니라, 상태 코로케이션을 적용할 때 함께 나타날 수 있는 성능 측면의 효과다.

### 상태 배치 판단 기준

```text
이 상태를 사용하는 컴포넌트가 어디인가?
  ├─ 하나의 컴포넌트 → 그 컴포넌트 내부에 선언
  ├─ 형제 컴포넌트들 → 가장 가까운 공통 부모에 선언
  └─ 앱 전체 → 전역 상태 관리 (Context, Store)
```

---

## 4. 파일 코로케이션 — 타입·스타일·테스트를 함께 두기

### 문제: 관련 파일이 멀리 떨어져 있다

```text
└─ src
   ├─ components
   │     └─ UserProfile.tsx
   ├─ styles
   │     └─ UserProfile.module.css
   ├─ types
   │     └─ UserProfile.types.ts
   └─ __tests__
         └─ UserProfile.test.tsx
```

`UserProfile`을 수정하면 타입, 스타일, 테스트를 **각기 다른 디렉토리**에서 찾아야 한다. 파일이 많아질수록 연관 파일을 놓칠 위험이 커진다.

### 개선: 기능 단위로 파일을 모아 두기

```text
└─ src
   └─ components
         └─ UserProfile
               ├─ UserProfile.tsx
               ├─ UserProfile.module.css
               ├─ UserProfile.types.ts
               ├─ UserProfile.test.tsx
               └─ index.ts
```

관련 파일을 같은 디렉토리에 두면:

- **수정 범위가 한눈에 보인다** — 하나의 디렉토리만 보면 된다.
- **삭제가 안전하다** — 디렉토리 삭제로 관련 코드가 모두 제거된다.
- **구조 일관성 유지에 도움이 된다** — 새 기능 추가 시 동일한 배치 규칙을 재사용하기 쉽다.

### 코로케이션 적용 순서

```text
1단계: 타입 파일을 컴포넌트 옆으로 이동 (.types.ts)
2단계: 스타일 파일을 컴포넌트 옆으로 이동 (.module.css)
3단계: 테스트 파일을 컴포넌트 옆으로 이동 (.test.tsx)
4단계: index.ts로 외부 인터페이스를 정리
```

### 아키텍처별 유의사항

파일 코로케이션은 기본적으로 응집도를 높이는 훌륭한 접근이지만, **실제 적용은 채택한 프론트엔드 아키텍처나 프레임워크의 규칙에 따라 조금씩 달라질 수 있다.**

- **Next.js (App Router) 등 프레임워크**: `page.tsx`, `layout.tsx`와 같은 라우팅 환경이나 특별한 디렉토리 제약이 존재할 수 있으므로, 프레임워크가 강제하는 규칙 안에서 유연하게 코로케이션을 적용해야 한다.
- **FSD (Feature-Sliced Design)**: 도메인과 기능(`app`, `processes`, `pages`, `widgets`, `features`, `entities`, `shared`)의 계층을 엄격하게 분리하는 철학을 가지므로, 단순 코로케이션을 넘어 아키텍처에서 규정한 계층별 의존성 및 응집도 규칙을 우선해야 한다.
- **Atomic Design**: `atoms`, `molecules`, `organisms` 등 UI 단위의 추상화 단계별로 디렉토리를 분리하므로, 거대한 기능 스코프보다는 해당 UI 컴포넌트 단위의 코로케이션이 우선시될 수 있다.

따라서 맹목적으로 물리적 거리를 좁히는 것에 집착하기보다는, **팀이 도입한 아키텍처 및 프레임워크의 설계 철학을 훼손하지 않는 선에서** 실용적으로 코로케이션을 적용하는 것이 중요하다.

---

## 5. 데이터 요청 코로케이션 — 데이터 의존성을 기능 단위로 배치

### 문제: 데이터 요청 코드가 기능과 분리되어 있다

```text
└─ src
   ├─ api
   │     ├─ users-api.ts
   │     ├─ products-api.ts
   │     └─ cache-keys.ts
   └─ features
         └─ user-profile
               └─ UserProfile.tsx  // ../../api/users-api에서 import
```

요청 함수, 캐시 키, 갱신 규칙이 중앙 디렉토리에만 모이면 기능을 수정할 때 탐색 범위가 넓어진다. 기능을 삭제해도 중앙 `api/`에 관련 코드가 남기 쉽다.

### 개선: 기능 디렉토리 안에 데이터 계층을 함께 두기

```text
└─ src
   └─ features
         └─ user-profile
               ├─ data
               │     ├─ request.ts      // fetchUserProfile
               │     ├─ cache-keys.ts   // userProfileKeys
               │     └─ update.ts       // updateUserProfile + cache invalidation
               ├─ UserProfile.tsx
               └─ UserProfile.test.tsx
```

```typescript
// features/user-profile/data/request.ts
export async function fetchUserProfile(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  if (!response.ok) throw new Error("Failed to load user profile");
  return response.json();
}
```

```typescript
// features/user-profile/data/cache-keys.ts
export const userProfileKeys = {
  all: ["user-profile"] as const,
  detail: (id: string) => [...userProfileKeys.all, id] as const,
};
```

```typescript
// features/user-profile/data/update.ts
import { userProfileKeys } from "./cache-keys";

export async function updateUserProfile(data: Record<string, unknown>) {
  await fetch("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

type CacheClient = {
  invalidate: (key: readonly string[]) => void;
};

export function invalidateUserProfile(cache: CacheClient) {
  cache.invalidate(userProfileKeys.all);
}
```

데이터 계층을 기능 단위로 배치하면:

- **요청 변경 시 수정 지점이 좁아진다** — 관련 파일이 기능 폴더에 모여 있어 찾기 쉽다.
- **기능 삭제가 깔끔하다** — 기능 디렉토리를 제거하면 데이터 의존성도 함께 제거된다.
- **캐시 키/갱신 규칙이 기능 문맥 안에서 관리된다** — 기능별로 키를 정의하므로 다른 기능과의 관계가 명확해진다.

### 아키텍처별 적용 (요약)

요청을 실제로 실행하는 위치는 프로젝트별로 다르다.
응집도 관점에서 중요한 점은 다음 하나다:

- **실행 위치와 무관하게 요청 함수/캐시 키/갱신 규칙은 기능 단위로 함께 둔다.**

### 적용 판단 기준

| 질문 | "예"라면 |
|------|---------|
| 기능별 변경이 잦은 데이터 요청 코드가 중앙 `api/`에만 모여 있는가? | 기능 디렉토리로 이동 검토 |
| 캐시 키/갱신 규칙을 전역 파일 하나에서만 관리하고 있는가? | 기능별 파일로 분리 |
| 기능 삭제 시 중앙 `api/` 디렉토리 수동 정리가 반복되는가? | 데이터 계층 코로케이션 도입 |

---

## 6. 폼 검증 스키마 코로케이션 — 타입과 검증의 단일 원천

### 문제: 타입 정의와 검증 로직이 분리되어 있다

```typescript
// types/user.ts
interface CreateUserInput {
  name: string;
  email: string;
  age: number;
}

// validators/userValidator.ts
function validateCreateUser(data: CreateUserInput) {
  if (!data.name || data.name.length < 2) throw new Error("이름은 2자 이상");
  if (!data.email?.includes("@")) throw new Error("유효하지 않은 이메일");
  if (data.age < 18) throw new Error("18세 이상만 가능");
}

// components/CreateUserForm.tsx
import { CreateUserInput } from "../types/user";
import { validateCreateUser } from "../validators/userValidator";
```

타입 정의와 검증 규칙이 **별도 파일에 분산**되어 있다. 필드가 추가되면 `interface`, 검증 함수, 폼 컴포넌트 세 곳을 모두 수정해야 한다. 한 곳이라도 놓치면 런타임 에러가 발생한다.

### 개선: Zod 스키마를 단일 원천으로 사용

```typescript
// features/create-user/schema.ts
import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2, "이름은 2자 이상이어야 합니다"),
  email: z.string().email("유효하지 않은 이메일입니다"),
  age: z.number().min(18, "18세 이상만 가입할 수 있습니다"),
});

// 스키마에서 타입을 자동 추론 — 별도의 interface가 필요 없다
export type CreateUserInput = z.infer<typeof createUserSchema>;
```

```typescript
// features/create-user/CreateUserForm.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, type CreateUserInput } from "./schema";

export function CreateUserForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("name")} />
      {errors.name && <span>{errors.name.message}</span>}
      {/* ... */}
    </form>
  );
}
```

스키마를 폼 컴포넌트와 같은 공간에 배치하면:

- **검증 규칙 변경 시 수정 지점이 좁아진다** — 폼 필드 추가나 규칙 변경 시 컴포넌트 바로 옆의 스키마 파일만 수정하면 된다.
- **타입과 검증의 물리적 거리가 가까워진다** — 스키마에서 추론된 타입과 검증 규칙이 폼 컴포넌트와 같은 기능 하위 디렉토리에 응집된다.
- **기능 삭제가 깔끔하다** — 폼 기능을 삭제할 때 검증 스키마도 함께 안전하게 제거된다.

> Zod 외에 Yup, Valibot 등도 동일한 원칙으로 사용할 수 있다. 핵심은 특정 라이브러리가 아니라 **폼 컴포넌트가 의존하는 스키마/타입/검증 로직을 기능 디렉토리 안에 함께 배치**하는 구조다.

### 적용 판단 기준

| 질문 | "예"라면 |
|------|---------|
| 폼의 타입 정의와 검증 로직이 별도 파일(`types/`, `validators/`)로 흩어져 있는가? | 컴포넌트 옆 스키마 파일로 통합하여 이동 |
| 폼 필드가 변경될 때 여러 파일의 위치를 찾아가야 하는가? | 스키마 파일을 기능 디렉토리 내부로 코로케이션 |
---

## 핵심 정리

| # | 기법 | 낮은 응집도 | 높은 응집도 |
|---|------|-----------|-----------|
| 1 | 디렉토리 구조 | 종류별 분류 (`components/`, `hooks/`) | 도메인/기능별 분류 (`UserProfile/`, `Payment/`) |
| 2 | 로직 구성 | 컴포넌트에 모든 로직 혼재 | 관심사별 커스텀 훅 분리 |
| 3 | 상태 배치 | 상위 컴포넌트에 불필요하게 끌어올림 | 사용처 가까이에 배치 |
| 4 | 파일 배치 | 타입·스타일·테스트 별도 디렉토리 | 기능 단위로 코로케이션 |
| 5 | 데이터 요청 | 데이터 의존성이 기능과 분리된 중앙 디렉토리에 집중 | 기능 디렉토리 안에 데이터 계층 코로케이션 |
| 6 | 폼 검증 | 타입 정의와 검증 로직이 중앙 디렉토리에 분산 | 검증 스키마를 폼 컴포넌트 디렉토리에 코로케이션 |

---

## 체크리스트

코드 리뷰 시 다음을 확인한다.

- [ ] 특정 도메인 전용 파일이 공용 디렉토리에 있지 않은가?
- [ ] 하나의 컴포넌트에 서로 다른 관심사의 `useState`/`useEffect`가 섞여 있지 않은가?
- [ ] 한 컴포넌트에서만 쓰는 상태가 상위 컴포넌트에 선언되어 있지 않은가?
- [ ] 컴포넌트와 관련된 타입·스타일·테스트 파일이 같은 위치에 있는가?
- [ ] 데이터 요청 함수·캐시 키·갱신 규칙이 기능 디렉토리에 함께 있는가?
- [ ] 폼의 타입 정의와 검증 로직이 별도 파일에 분산되어 있지 않은가?

> **기억할 것**: 응집도의 핵심은 _"이 코드를 수정할 때, 함께 수정해야 하는 코드를 놓치지 않는가?"_ 이다.
