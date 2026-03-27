# TypeScript Clean Code Guide for AI Coding Assistants

> AI 코딩 어시스턴트(Claude Code, Codex 등)가 TypeScript 코드를 생성할 때 준수해야 할 클린 코드 규칙 모음입니다.
> Robert C. Martin의 *Clean Code* 원칙을 **2026년 현재 TypeScript 표준**에 맞게 재정리한 실행 지침서입니다.

---

## 목차

1. [AI 지침 개요](#ai-지침-개요)
2. [변수 (VAR)](#변수-var)
3. [함수 (FN)](#함수-fn)
4. [객체와 자료구조 (OBJ)](#객체와-자료구조-obj)
5. [에러 처리 (ERR)](#에러-처리-err)
6. [비동기 (ASYNC)](#비동기-async)
7. [포맷팅 (FMT)](#포맷팅-fmt)
8. [주석 (CMT)](#주석-cmt)
9. [TypeScript 특화 규칙 (TS)](#typescript-특화-규칙-ts)
10. [테스팅 (TEST)](#테스팅-test)
11. [FP vs OOP 선택 가이드](#fp-vs-oop-선택-가이드)
12. [AI 코드 생성 체크리스트](#ai-코드-생성-체크리스트)

---

## AI 지침 개요

AI 코딩 어시스턴트는 코드를 생성하기 전에 다음 우선순위를 따르십시오:

```
1순위: 가독성 (Readability)
2순위: 유지보수성 (Maintainability)
3순위: 재사용성 (Reusability)
4순위: 성능 (Performance)
```

> **AI 주의사항**: 성능 최적화를 이유로 가독성을 희생하지 마십시오. 현대 런타임은 대부분의 마이크로 최적화를 자동으로 처리합니다.

---

## 변수 (VAR)

### VAR-01: 의미 있는 변수명 사용

변수명만 읽어도 역할이 명확해야 합니다.

```ts
// ❌ Bad
function between<T>(a1: T, a2: T, a3: T): boolean {
  return a2 <= a1 && a1 <= a3;
}

// ✅ Good
function between<T>(value: T, left: T, right: T): boolean {
  return left <= value && value <= right;
}
```

### VAR-02: 발음 가능한 변수명 사용

코드 리뷰 시 말로 설명할 수 있는 이름을 사용하십시오.

```ts
// ❌ Bad
type DtaRcrd102 = {
  genymdhms: Date;
  modymdhms: Date;
  pszqint: number;
};

// ✅ Good
type Customer = {
  generationTimestamp: Date;
  modificationTimestamp: Date;
  recordId: number;
};
```

### VAR-03: 동일 개념에는 동일 어휘 사용

같은 역할을 하는 함수/변수는 동일한 단어를 사용하십시오.

```ts
// ❌ Bad — 동일한 반환 타입에 세 가지 이름
function getUserInfo(): User;
function getUserDetails(): User;
function getUserData(): User;

// ✅ Good
function getUser(): User;
```

### VAR-04: 검색 가능한 이름 사용 (매직 넘버/문자열 금지)

```ts
// ❌ Bad
setTimeout(restart, 86400000);

// ✅ Good
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
setTimeout(restart, MILLISECONDS_PER_DAY);
```

### VAR-05: 설명 변수 활용

```ts
// ❌ Bad
declare const users: Map<string, User>;
for (const keyValue of users) { /* ... */ }

// ✅ Good
declare const users: Map<string, User>;
for (const [id, user] of users) { /* ... */ }
```

### VAR-06: 멘탈 매핑 회피 (명시적 > 암묵적)

```ts
// ❌ Bad
const u = getUser();
const s = getSubscription();
const t = charge(u, s);

// ✅ Good
const user = getUser();
const subscription = getSubscription();
const transaction = charge(user, subscription);
```

### VAR-07: 불필요한 컨텍스트 반복 금지

타입/클래스 이름이 이미 설명하는 내용을 필드명에서 반복하지 마십시오.

```ts
// ❌ Bad
type Car = {
  carMake: string;
  carModel: string;
  carColor: string;
};

// ✅ Good
type Car = {
  make: string;
  model: string;
  color: string;
};
```

### VAR-08: 기본값 인자 활용 (short-circuit 대신)

```ts
// ❌ Bad
function loadPages(count?: number) {
  const loadCount = count !== undefined ? count : 10;
}

// ✅ Good
function loadPages(count: number = 10) {
  // ...
}
```

### VAR-09: `as const` + type 패턴 사용 (enum 지양)

TypeScript `enum`은 트리셰이킹 불가, 런타임 객체 생성, 역방향 매핑 등의 문제가 있습니다.
`as const` 객체 + type 추출 패턴을 권장합니다.

```ts
// ❌ Bad — enum 사용
enum Genre {
  Romantic,
  Drama,
  Comedy,
  Documentary,
}

// ✅ Good — as const + type 패턴
const GENRE = {
  Romantic: 'romantic',
  Drama: 'drama',
  Comedy: 'comedy',
  Documentary: 'documentary',
} as const;

// 객체 value를 리터럴 유니온 타입으로 추출
type Genre = (typeof GENRE)[keyof typeof GENRE];
// → 'romantic' | 'drama' | 'comedy' | 'documentary'

// 사용 예시
function getGenreLabel(genre: Genre): string {
  const labels: Record<Genre, string> = {
    [GENRE.Romantic]: '로맨스',
    [GENRE.Drama]: '드라마',
    [GENRE.Comedy]: '코미디',
    [GENRE.Documentary]: '다큐멘터리',
  };
  return labels[genre];
}
```

> 문법이 다소 복잡해 보일 수 있지만, 타입 안정성과 런타임 비용 절감을 위한 패턴입니다.
> 팀 숙련도나 도메인 복잡도가 낮다면 아래 단순 대안을 함께 사용해도 됩니다.

```ts
// 대안 — 배열 기반 (입문자 친화)
const GENRES = ['romantic', 'drama', 'comedy', 'documentary'] as const;
type Genre = (typeof GENRES)[number];

const genreLabels: Record<Genre, string> = {
  romantic: '로맨스',
  drama: '드라마',
  comedy: '코미디',
  documentary: '다큐멘터리',
};
```

> **예외**: 외부 라이브러리/SDK가 enum 타입을 공개 API로 강제하는 경우에 한해 사용 가능합니다.
>
> **컴파일러 지원**: TypeScript 5.8+의 `--erasableSyntaxOnly` 옵션을 활성화하면 `enum`, `namespace`, parameter properties 등 타입 제거만으로는 처리할 수 없는 구문을 사용할 때 컴파일 에러가 발생합니다. 이 옵션은 Node.js의 네이티브 TypeScript 실행(`--experimental-strip-types`)과의 호환을 위해 도입되었으며, "enum 지양" 원칙을 컴파일러 수준에서 강제할 수 있습니다. 단, 이 옵션은 parameter properties(`constructor(private x: number)`)도 금지하므로 parameter properties 기반 스타일과 상충할 수 있습니다 — 팀 상황에 맞게 판단하십시오.

### 변수 체크리스트

```
□ 이름만 읽어도 역할을 알 수 있는가?
□ 매직 넘버/문자열 대신 상수를 사용했는가?
□ 동일 개념에 동일 단어를 사용했는가?
□ enum 대신 as const + type 패턴을 사용했는가?
□ 기본값 인자를 활용했는가?
```

---

## 함수 (FN)

### FN-01: 함수 인자는 최대 2개 (3개 초과 시 객체로 묶기)

```ts
// ❌ Bad
function createMenu(title: string, body: string, buttonText: string, cancellable: boolean) {
  // ...
}

// ✅ Good — type alias와 구조분해 활용
type MenuOptions = {
  title: string;
  body: string;
  buttonText: string;
  cancellable: boolean;
};

function createMenu({ title, body, buttonText, cancellable }: MenuOptions) {
  // ...
}
```

### FN-02: 함수는 한 가지 일만 한다 (Single Responsibility)

```ts
// ❌ Bad
function emailActiveClients(clients: Client[]) {
  clients.forEach((client) => {
    const clientRecord = database.lookup(client);
    if (clientRecord.isActive()) {
      email(client);
    }
  });
}

// ✅ Good
function emailActiveClients(clients: Client[]) {
  clients.filter(isActiveClient).forEach(email);
}

function isActiveClient(client: Client): boolean {
  return database.lookup(client).isActive();
}
```

### FN-03: 함수명은 동작을 명확히 설명해야 함

```ts
// ❌ Bad
function addToDate(date: Date, month: number): Date { /* ... */ }
addToDate(date, 1); // 무엇을 추가하는지 불명확

// ✅ Good
function addMonthToDate(date: Date, month: number): Date { /* ... */ }
addMonthToDate(date, 1);
```

### FN-04: 함수는 하나의 추상화 수준만 가져야 함

```ts
// ❌ Bad — 토크나이징, 파싱, AST 순회를 한 함수에서
function parseCode(code: string) {
  const REGEXES = [/* ... */];
  const tokens = [];
  REGEXES.forEach((regex) => { /* ... */ });
  const ast: any[] = [];
  tokens.forEach((token) => { /* lex... */ });
  ast.forEach((node) => { /* parse... */ });
}

// ✅ Good — 각 추상화 수준을 분리
function parseCode(code: string) {
  const tokens = tokenize(code);
  const syntaxTree = parse(tokens);
  syntaxTree.forEach((node) => { /* ... */ });
}

function tokenize(code: string): Token[] { /* ... */ }
function parse(tokens: Token[]): SyntaxTree { /* ... */ }
```

### FN-05: 중복 코드 제거 (DRY)

공통 로직은 추상화하여 하나의 함수로 관리하십시오.
단, 과도한 추상화보다 약간의 중복이 나을 수 있습니다 — "3번 반복되면 추상화"를 기준으로 삼으십시오.

```ts
// ❌ Bad — 거의 동일한 로직이 반복
function renderAdminPage(user: User) {
  const header = `<h1>Admin: ${user.name}</h1>`;
  const nav = '<nav>Dashboard | Users | Settings</nav>';
  const footer = `<footer>© 2026 Corp</footer>`;
  return `${header}${nav}<main>Admin Content</main>${footer}`;
}

function renderUserPage(user: User) {
  const header = `<h1>Welcome: ${user.name}</h1>`;
  const nav = '<nav>Home | Profile</nav>';
  const footer = `<footer>© 2026 Corp</footer>`;
  return `${header}${nav}<main>User Content</main>${footer}`;
}

// ✅ Good — 공통 레이아웃을 추상화
type PageConfig = {
  title: string;
  navItems: string[];
  content: string;
};

function renderPage({ title, navItems, content }: PageConfig): string {
  const header = `<h1>${title}</h1>`;
  const nav = `<nav>${navItems.join(' | ')}</nav>`;
  const footer = `<footer>© 2026 Corp</footer>`;
  return `${header}${nav}<main>${content}</main>${footer}`;
}
```

### FN-06: 부수 효과(Side Effect) 최소화 및 불변성 선호

순수 함수를 기본으로 하되, 부수 효과가 필요한 경우 명확히 격리하십시오.
배열/객체 파라미터는 원본을 변경하지 말고 새 값을 반환하십시오.

```ts
// ❌ Bad — 전역 변수를 직접 변경
let name = 'Robert C. Martin';
function toBase64() {
  name = btoa(name); // side effect!
}

// ✅ Good — 입력을 받아 새 값 반환
function toBase64(text: string): string {
  return btoa(text);
}
```

```ts
// ❌ Bad — 원본 배열을 변경
function addItemToCart(cart: CartItem[], item: Item): void {
  cart.push({ item, date: Date.now() });
}

// ✅ Good — 새 배열을 반환
function addItemToCart(cart: readonly CartItem[], item: Item): CartItem[] {
  return [...cart, { item, date: Date.now() }];
}
```

> **불변성 예외**: React state 업데이터, 데이터베이스 트랜잭션, 성능 크리티컬 루프 등에서는 의도적인 변경이 허용됩니다. 이 경우 함수명이나 주석으로 의도를 명시하십시오.

### FN-07: 플래그(boolean) 파라미터 사용 금지

boolean 파라미터는 함수가 두 가지 일을 하고 있다는 신호입니다.

```ts
// ❌ Bad
function createFile(name: string, temp: boolean) {
  if (temp) {
    fs.create(`./temp/${name}`);
  } else {
    fs.create(name);
  }
}

// ✅ Good
function createTempFile(name: string) {
  createFile(`./temp/${name}`);
}

function createFile(name: string) {
  fs.create(name);
}
```

### FN-08: 조건문은 함수로 캡슐화

```ts
// ❌ Bad
if (subscription.isTrial || account.balance > 0) { /* ... */ }

// ✅ Good
function canActivateService(subscription: Subscription, account: Account): boolean {
  return subscription.isTrial || account.balance > 0;
}

if (canActivateService(subscription, account)) { /* ... */ }
```

### FN-09: 부정 조건 회피

```ts
// ❌ Bad
function isEmailNotUsed(email: string): boolean { /* ... */ }
if (isEmailNotUsed(email)) { /* ... */ }

// ✅ Good
function isEmailUsed(email: string): boolean { /* ... */ }
if (!isEmailUsed(email)) { /* ... */ }
```

### FN-10: 함수형 프로그래밍 스타일 선호

데이터 변환 파이프라인에는 함수형 스타일이 적합합니다.
상황에 따라 적합한 방식을 선택하십시오.

```ts
// ❌ Bad — 인덱스 기반 for 루프
let totalOutput = 0;
for (let i = 0; i < contributions.length; i++) {
  totalOutput += contributions[i].linesOfCode;
}

// ✅ Good — method chaining (필터링 + 변환에 가장 적합)
const activeEmails = users
  .filter((user) => user.isActive)
  .map((user) => user.email);

// ✅ Good — reduce (단순 집계에 적합)
const totalOutput = contributions.reduce(
  (total, output) => total + output.linesOfCode,
  0,
);

// ✅ Good — for...of (복잡한 축적 로직에서 가독성이 좋음)
let totalOutput = 0;
for (const contribution of contributions) {
  totalOutput += contribution.linesOfCode;
}
```

> **선택 기준**: `.filter().map()` 같은 method chaining은 변환 파이프라인에서 의도가 가장 명확합니다. `reduce`는 단순 집계에 적합하지만, 축적 로직이 복잡해지면 `for...of`가 더 읽기 쉬울 수 있습니다. 핵심은 **가독성**입니다.

### FN-11: 이터레이터/제너레이터 활용 (대용량 데이터 스트림)

```ts
// ✅ Good — 무한 스트림을 메모리 효율적으로 처리
function* fibonacci(): IterableIterator<number> {
  let [a, b] = [0, 1];
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}
```

### 함수 체크리스트

```
□ 함수가 한 가지 일만 하는가?
□ 인자가 2개 이하인가? (초과 시 객체로 묶었는가?)
□ 부수 효과(side effect)가 없는가? (있다면 격리되었는가?)
□ boolean 파라미터를 사용하지 않았는가?
□ 함수명이 동작을 명확히 설명하는가?
□ 하나의 추상화 수준만 다루는가?
```

---

## 객체와 자료구조 (OBJ)

### OBJ-01: 불변성(Immutability) 선호

```ts
// ✅ Good — as const 활용

const config = {
  host: 'localhost',
  port: 5432,
  db: 'mydb',
} as const;
```

### OBJ-02: type vs interface 사용 기준

**기본적으로 `type`을 사용하고, declaration merging이 필요한 경우에만 `interface`를 사용하십시오.**

| 상황 | 권장 |
|------|------|
| 객체 형태 정의 | `type` (기본) |
| Union / Intersection / Mapped / Conditional 타입 | `type` (유일한 선택) |
| Declaration merging 필요 (라이브러리 확장 등) | `interface` |
| `extends` / `implements` 사용 (클래스 기반) | `interface` |

> **참고 — `interface` 기본 사용 관점**: TypeScript 핵심 팀(Ryan Cavanaugh 등)은 객체 형태 정의에 `interface`를 기본으로 권장합니다. 이유는: (1) **성능** — `interface` 간 관계는 캐싱되지만 intersection type(`type A = B & C`)은 캐싱되지 않아 대규모 코드베이스에서 타입 체킹 속도에 영향을 줄 수 있음, (2) **에러 메시지** — `interface`가 더 명확한 에러 메시지를 생성, (3) **의도 표현** — "이 형태를 구현/확장할 수 있다"는 의도가 명시적. 반면 `type` 기본 사용은 유니온/인터섹션과의 일관성, 더 간결한 문법 등의 장점이 있습니다. **두 접근 모두 유효하므로 팀 컨벤션으로 통일하는 것이 중요합니다.**

```ts
// ✅ type — 기본 객체 정의
type User = {
  id: string;
  name: string;
  email: string;
};

// ✅ type — Union 타입
type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// ✅ type — Mapped 타입
type Readonly<T> = { readonly [K in keyof T]: T[K] };

// ✅ interface — Declaration merging이 필요한 경우
// 예: 외부 라이브러리의 타입을 확장할 때
declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

// ✅ interface — 클래스가 구현할 계약 정의
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

class UserRepository implements Repository<User> {
  async findById(id: string): Promise<User | null> { /* ... */ }
  async save(user: User): Promise<User> { /* ... */ }
  async delete(id: string): Promise<void> { /* ... */ }
}
```

### 객체/자료구조 체크리스트

```
□ 불변성이 가능한 곳에 as const를 적용했는가?
□ type과 interface를 적절히 구분해서 사용했는가?
```

---

## 에러 처리 (ERR)

### ERR-01: Error 객체를 항상 throw (문자열 throw 금지)

```ts
// ❌ Bad
throw 'Out of memory';

// ✅ Good
throw new Error('Out of memory');
```

### ERR-02: catch는 절대 무시하지 말 것

```ts
// ❌ Bad
try {
  functionThatMightThrow();
} catch (error) {
  // 아무것도 하지 않음 — 매우 위험!
}

// ✅ Good
try {
  functionThatMightThrow();
} catch (error) {
  console.error(error);
  notifyUserOfError(error);
  reportErrorToService(error);
}
```

### ERR-03: Promise 거부도 처리할 것

```ts
// ❌ Bad
fetchData().then((data) => functionThatMightThrow(data));

// ✅ Good — async/await 사용
async function fetchAndProcess() {
  try {
    const data = await fetchData();
    await functionThatMightThrow(data);
  } catch (error) {
    console.error(error);
  }
}
```

### ERR-04: 커스텀 에러 클래스와 Error.cause 체인 활용

커스텀 에러 클래스로 에러 유형을 구분하고, `Error.cause`로 원인 체인을 유지하십시오.

```ts
// ✅ Good — 커스텀 에러 + cause 체인
class ValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ValidationError';
  }
}

class NetworkError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NetworkError';
  }
}

// cause 체인으로 원인 추적
async function fetchUser(id: string): Promise<User> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      throw new NetworkError('Failed to fetch user', response.status);
    }
    return await response.json();
  } catch (error) {
    // 원본 에러를 cause로 보존
    throw new ValidationError(`Invalid user data for id: ${id}`, {
      cause: error,
    });
  }
}

// 에러 처리
try {
  await fetchUser('123');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.message);
    console.error('Caused by:', error.cause); // 원본 에러 접근
  } else if (error instanceof NetworkError) {
    handleNetworkIssue(error.statusCode);
  } else {
    throw error; // 알 수 없는 에러는 상위로 전파
  }
}
```

### 에러 처리 체크리스트

```
□ catch 블록이 비어 있지 않은가?
□ Error 객체를 throw하는가? (문자열 throw 금지)
□ Promise rejection을 처리했는가?
□ 커스텀 에러에 Error.cause를 활용하고 있는가?
□ 알 수 없는 에러를 상위로 전파하는가?
```

---

## 비동기 (ASYNC)

### ASYNC-01: async/await 사용 (콜백/체이닝 대신)

```ts
// ❌ Bad — 콜백 지옥
getData((err, data) => {
  parseData(data, (err, parsed) => {
    saveData(parsed, (err, result) => {
      // ...
    });
  });
});

// ❌ Okay — Promise 체이닝
getData()
  .then(parseData)
  .then(saveData)
  .catch(handleError);

// ✅ Best — async/await
async function process(): Promise<void> {
  try {
    const data = await getData();
    const parsed = await parseData(data);
    await saveData(parsed);
  } catch (error) {
    handleError(error);
  }
}
```

### ASYNC-02: 병렬 처리 가능한 작업은 Promise.all 활용

```ts
// ❌ Bad — 순차 실행으로 불필요한 지연
const user = await getUser(userId);
const orders = await getOrders(userId); // user와 독립적

// ✅ Good — 병렬 실행
const [user, orders] = await Promise.all([
  getUser(userId),
  getOrders(userId),
]);
```

### ASYNC-03: Promise.allSettled로 부분 실패 허용

```ts
// ✅ Good — 일부 실패해도 나머지 결과를 활용
const results = await Promise.allSettled([
  fetchUserProfile(userId),
  fetchUserOrders(userId),
  fetchUserRecommendations(userId),
]);

const profile = results[0].status === 'fulfilled' ? results[0].value : null;
const orders = results[1].status === 'fulfilled' ? results[1].value : [];
const recommendations = results[2].status === 'fulfilled' ? results[2].value : [];
```

### ASYNC-04: `using` / `await using`으로 리소스 관리 (Explicit Resource Management)

ECMAScript 2025 표준 기능인 Explicit Resource Management를 활용하여 리소스를 자동으로 정리하십시오.

```ts
// ❌ Bad — 수동 정리 (정리를 빼먹을 수 있음)
const connection = await getConnection();
try {
  await connection.query('SELECT * FROM users');
} finally {
  await connection.close(); // 수동으로 닫아야 함
}

// ✅ Good — await using으로 자동 정리
await using connection = await getConnection();
await connection.query('SELECT * FROM users');
// 스코프 종료 시 자동으로 connection[Symbol.asyncDispose]() 호출

// ✅ 동기 버전
using file = openFile('data.txt');
const content = file.read();
// 스코프 종료 시 자동으로 file[Symbol.dispose]() 호출
```

> **참고**: ECMAScript 2025(ES16) 정식 표준으로, TypeScript 5.2+에서 지원됩니다. Chrome, Node.js, Deno에서 네이티브 지원하며, `tsconfig.json`에 `"lib": ["ES2025"]` 또는 `"ESNext"`가 필요합니다.

### 비동기 체크리스트

```
□ 콜백 대신 async/await를 사용했는가?
□ 독립적인 비동기 작업을 Promise.all로 병렬화했는가?
□ 부분 실패 허용이 필요한 곳에 Promise.allSettled를 사용했는가?
□ 리소스 정리가 필요한 곳에 using/await using을 고려했는가?
```

---

## 포맷팅 (FMT)

### FMT-01: 일관된 들여쓰기 (팀 컨벤션 준수)

AI는 프로젝트의 기존 들여쓰기 스타일을 따라야 합니다.

```ts
// ❌ Bad — 들여쓰기 혼합
function foo() {
    const a = 1;  // 4 spaces
  const b = 2;    // 2 spaces
}

// ✅ Good — 일관된 2-space
function foo() {
  const a = 1;
  const b = 2;
}
```

### FMT-02: 관련 코드는 가깝게, 다른 개념은 빈 줄로 분리

함수를 호출하는 코드와 호출되는 함수는 가능한 가까이 배치하십시오.
다른 개념의 코드 블록 사이에는 빈 줄로 구분하십시오.

```ts
// ❌ Bad — 관련 코드가 흩어져 있음
function processOrder(order: Order) {
  const total = calculateTotal(order);

  sendNotification(order.userId);

  const tax = calculateTax(total);
  return total + tax;
}

// ✅ Good — 관련 코드를 묶음
function processOrder(order: Order) {
  const total = calculateTotal(order);
  const tax = calculateTax(total);
  const finalAmount = total + tax;

  sendNotification(order.userId);

  return finalAmount;
}
```

### FMT-03: import 정렬 규칙

```ts
// ✅ Good — import 순서
import 'reflect-metadata';                        // 1. Polyfills / side-effects

import fs from 'node:fs';                         // 2. Node built-in (node: 프로토콜)
import path from 'node:path';

import { Container } from 'inversify';            // 3. External modules
import React from 'react';

import { UserService } from '@services/UserService'; // 4. Internal (path alias)

import { ApiHelper } from '../utils/api';          // 5. Parent directory
import type { Config } from '../types';            // 6. type-only import

import { localHelper } from './helper';            // 7. Same directory
```

### FMT-04: 모던 경로 별칭 (Node.js Subpath Imports) 사용

상대 경로의 지옥(`../../../`)에서 벗어나기 위해 경로 별칭을 사용하십시오.
과거에는 `tsconfig.json`의 `paths`를 주로 사용했으나, **현재(2026년 기준)는 Node.js 네이티브 기능인 `package.json`의 `imports` 필드(Subpath Imports) 사용이 새로운 표준입니다.**
이 방식은 런타임/빌드타임 모두 호환되며 별도의 라이브러리(`tsconfig-paths` 등) 없이도 동작합니다.

```ts
// ❌ Bad — 상대 경로 지옥
import { UserService } from '../../../services/UserService';

// △ Legacy — tsconfig.json paths 방식 (런타임 변환기가 필요할 수 있음)
// Next.js(create-next-app 기본값)에서는 여전히 기본 설정
import { UserService } from '@services/UserService';

// ✅ Recommended — package.json imports 방식 (Node.js/Vite 네이티브 지원)
import { UserService } from '#services/UserService';
```

```json
// package.json
{
  "imports": {
    "#services/*": "./src/services/*",
    "#utils/*": "./src/utils/*",
    "#types/*": "./src/types/*"
  }
}
```

> **참고**: TypeScript에서는 `tsconfig.json`에 환경에 맞는 `moduleResolution` (예: `Bundler` 또는 `NodeNext`)이 설정되어 있어야 이 기능을 원활하게 인식합니다.
>
> **프레임워크별 참고**: Next.js(`create-next-app` 기본값)는 `tsconfig.json` `paths`(`@/` 패턴)를 기본 설정으로 사용합니다. Next.js 프로젝트에서는 기본 `paths` 방식을 따르는 것이 실용적입니다. Node.js/Vite 중심 프로젝트에서는 subpath imports를 권장합니다.

### 포맷팅 체크리스트

```
□ 프로젝트의 기존 들여쓰기 스타일을 따르고 있는가?
□ 관련 코드가 가까이 배치되어 있는가?
□ import 순서가 정렬 규칙을 따르는가?
□ 경로 별칭을 활용하고 있는가?
```

---

## 주석 (CMT)

### CMT-01: 코드 자체가 문서가 되도록 작성

주석은 코드가 설명하지 못하는 **"왜(Why)"**에만 사용하십시오.
**"무엇(What)"**은 코드로 표현하십시오.

```ts
// ❌ Bad — "What"을 주석으로 설명
// 구독이 활성화되어 있는지 확인
if (subscription.endDate > Date.now()) { /* ... */ }

// ✅ Good — 코드가 스스로 설명
const isSubscriptionActive = subscription.endDate > Date.now();
if (isSubscriptionActive) { /* ... */ }

// ✅ Good — "Why"를 주석으로 설명
// 프로모션 기간에는 만료된 구독도 접근 허용 (마케팅팀 요청, JIRA-1234)
if (isSubscriptionActive || isPromotionPeriod) { /* ... */ }
```

### CMT-02: 주석 처리된 코드 남기지 말 것

버전 관리 시스템(Git)이 있으므로 주석 처리된 코드는 삭제하십시오.

```ts
// ❌ Bad
type User = {
  name: string;
  email: string;
  // age: number;
  // jobPosition: string;
};

// ✅ Good
type User = {
  name: string;
  email: string;
};
```

### CMT-03: 변경 이력 주석 금지 (git log 활용)

```ts
// ❌ Bad
/**
 * 2024-01-15: 버그 수정 (홍길동)
 * 2024-01-01: 기능 추가 (김철수)
 */
function combine(a: number, b: number): number {
  return a + b;
}

// ✅ Good
function combine(a: number, b: number): number {
  return a + b;
}
```

### CMT-04: TODO 주석 형식 준수

```ts
// ✅ Good — 이유와 담당자를 명시
function getActiveSubscriptions(): Promise<Subscription[]> {
  // TODO(@kimdev): dueDate 컬럼에 인덱스 추가 필요 — 1000건 이상에서 느림
  return db.subscriptions.find({ dueDate: { $lte: new Date() } });
}
```

### 주석 체크리스트

```
□ 주석 처리된 코드가 없는가?
□ 코드로 표현 가능한 내용을 주석으로 달지 않았는가?
□ 주석이 "Why"를 설명하고 있는가?
□ TODO 주석이 있다면 이유와 담당자가 명확한가?
```

---

## TypeScript 특화 규칙 (TS)

### TS-01: `any` 타입 사용 금지

```ts
// ❌ Bad
function process(data: any) { /* ... */ }

// ✅ Good — 제네릭 또는 유니온 타입 사용
function process<T extends Record<string, unknown>>(data: T) { /* ... */ }

// 또는 unknown + 타입 가드
function process(data: unknown) {
  if (isValidData(data)) { /* ... */ }
}
```

### TS-02: 타입 가드(Type Guard) 활용

TypeScript 5.5부터 도입된 **추론된 타입 가드(Inferred Type Predicates)**를 적극 활용하십시오.
단순한 조건의 경우 명시적인 반환 타입(`value is Type`) 없이도 TypeScript가 자동으로 타입 가드로 인식합니다.
명시적인 타입 가드는 복잡한 객체 검증이나 타입 좁히기에서만 사용하십시오.

```ts
// ✅ Good — TS 5.5+에서는 명시적 반환 타입 없이도 자동으로 타입 가드로 추론됨
function isString(value: unknown) {
  return typeof value === 'string';
}

// ✅ Good — 복잡한 검증 로직에서는 여전히 명시적 타입 가드 사용
function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'email' in value
  );
}

// ✅ Good — TS 5.5+ 실전 패턴: .filter()에서 자동 타입 좁히기
const mixed = [1, null, 2, undefined, 3];

// TS 5.5 이전: (number | null | undefined)[] — 타입이 좁혀지지 않음
// TS 5.5+: number[] — 자동으로 타입 가드가 추론됨
const numbers = mixed.filter((x) => x != null);

// 객체 배열에서도 동일하게 동작
const users: (User | null)[] = await fetchUsers();
const validUsers = users.filter((u) => u != null); // User[]
```

### TS-03: Utility Types 적극 활용

```ts
// ✅ Good — TypeScript 내장 유틸리티 타입 사용
type PartialUser = Partial<User>;                        // 모든 필드를 optional로
type RequiredUser = Required<User>;                      // 모든 필드를 required로
type ReadonlyUser = Readonly<User>;                      // 모든 필드를 readonly로
type UserPreview = Pick<User, 'name' | 'email'>;         // 필드 선택
type UserWithoutPassword = Omit<User, 'password'>;       // 필드 제외
type UserRecord = Record<string, User>;                  // 키-값 매핑
type NonNullUser = NonNullable<User | null | undefined>; // null/undefined 제거
```

### TS-04: strictNullChecks 활성화 (tsconfig)

```jsonc
{
  "compilerOptions": {
    "strict": true,              // strictNullChecks 포함
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,  // undefined 명시 강제
    "erasableSyntaxOnly": true   // TS 5.8+ enum/namespace/parameter properties 금지
  }
}
```

> **참고**: `erasableSyntaxOnly`(TS 5.8+)는 Node.js 네이티브 TypeScript 실행과의 호환을 위한 옵션입니다. 활성화하면 `enum`, `namespace`, parameter properties(`constructor(private x: number)`) 사용 시 컴파일 에러가 발생합니다. Node.js `--experimental-strip-types`를 사용하거나 enum을 금지하려는 프로젝트에 권장합니다.

### TS-05: 옵셔널 체이닝과 Nullish Coalescing 활용

```ts
// ❌ Bad
const streetName = user && user.address && user.address.street
  ? user.address.street.name
  : 'Unknown';

// ✅ Good
const streetName = user?.address?.street?.name ?? 'Unknown';
```

### TS-06: 반환 타입 — export 함수는 명시, 내부 함수는 추론 허용

**public API(export 함수/메서드)에는 반환 타입을 명시**하여 계약을 명확히 하십시오.
모듈 내부 함수는 TypeScript의 타입 추론에 맡겨도 됩니다.

```ts
// ✅ Good — export 함수는 반환 타입 명시
export function processUser(user: User): ProcessedUser | null {
  if (!user.isActive) return null;
  return transform(user);
}

// ✅ Good — 내부 함수는 추론 허용
function transform(user: User) {
  return { id: user.id, name: user.name };
}
```

> **항상 명시해야 하는 경우**: 재귀 함수, 오버로드 함수, 복잡한 조건부 반환.

### TS-07: as 타입 단언 최소화

```ts
// ❌ Bad
const user = data as User; // 런타임 안전성 없음

// ✅ Good — 타입 가드로 안전하게 처리
function assertIsUser(data: unknown): asserts data is User {
  if (!isUser(data)) {
    throw new TypeError('Data is not a valid User');
  }
}

assertIsUser(data);
// 이후 data는 User 타입으로 안전하게 사용
```

### TS-08: 제네릭으로 재사용 가능한 코드 작성

```ts
// ❌ Bad — 타입별로 중복 함수 작성
function firstNumber(arr: number[]): number | undefined {
  return arr[0];
}
function firstString(arr: string[]): string | undefined {
  return arr[0];
}

// ✅ Good — 제네릭 활용
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}
```

### TS-09: `satisfies` 연산자 활용

`satisfies`는 타입 호환성을 검증하면서도 리터럴 타입을 보존합니다.

```ts
type ColorConfig = Record<string, string | { r: number; g: number; b: number }>;

// ❌ Bad — as const는 타입 검증 없음, 타입 단언은 리터럴 손실
const colors1 = { primary: '#ff0000', secondary: '#00ff00' } as const;
const colors2: ColorConfig = { primary: '#ff0000', secondary: '#00ff00' };

// ✅ Good — satisfies로 타입 검증 + 리터럴 보존
const colors = {
  primary: '#ff0000',
  secondary: { r: 0, g: 255, b: 0 },
} satisfies ColorConfig;

// colors.primary의 타입은 '#ff0000' (리터럴)
// colors.secondary의 타입은 { r: number; g: number; b: number }
```

### TS-10: `NoInfer<T>` 유틸리티 활용

TypeScript 5.4+에서 제공되는 `NoInfer<T>`로 특정 위치에서의 타입 추론을 방지합니다.

```ts
// ❌ Bad — default에서 타입이 추론되어 의도하지 않은 타입 확장
function createFSM<S extends string>(config: {
  initial: S;
  states: S[];
  default: S;
}) { /* ... */ }

// 'idle' | 'loading' | 'error' | 'unknown' 으로 추론됨 (의도하지 않음)
createFSM({
  initial: 'idle',
  states: ['idle', 'loading', 'error'],
  default: 'unknown', // 타입 에러가 발생해야 하지만 S에 포함되어 버림
});

// ✅ Good — NoInfer로 default에서의 추론 방지
function createFSM<S extends string>(config: {
  initial: S;
  states: S[];
  default: NoInfer<S>; // 여기서는 S를 추론하지 않음
}) { /* ... */ }

createFSM({
  initial: 'idle',
  states: ['idle', 'loading', 'error'],
  default: 'unknown', // ✅ 타입 에러! 'unknown'은 'idle' | 'loading' | 'error'에 없음
});
```

### TypeScript 체크리스트

```
□ any 타입을 사용하지 않았는가?
□ export 함수의 반환 타입을 명시했는가?
□ 필요한 곳에 readonly를 사용했는가?
□ 타입 단언(as) 대신 타입 가드를 사용했는가?
□ satisfies를 적절히 활용했는가?
□ 제네릭으로 중복을 제거했는가?
```

---

## 테스팅 (TEST)

### TEST-01: 테스트 이름은 "무엇을, 어떤 조건에서, 어떻게" 형식으로

```ts
// ❌ Bad — 무엇을 테스트하는지 불명확
it('works', () => { /* ... */ });
it('test 1', () => { /* ... */ });

// ✅ Good — 의도가 명확한 테스트 이름
it('should return null when user is not active', () => { /* ... */ });
it('should throw ValidationError when email format is invalid', () => { /* ... */ });

// ✅ Good — describe로 맥락을 구성
describe('UserService.findById', () => {
  it('should return user when valid id is provided', () => { /* ... */ });
  it('should return null when user does not exist', () => { /* ... */ });
  it('should throw when id is empty string', () => { /* ... */ });
});
```

### TEST-02: AAA 패턴 (Arrange-Act-Assert)

```ts
// ✅ Good — AAA 패턴
it('should calculate total price with tax', () => {
  // Arrange
  const items: CartItem[] = [
    { name: 'Book', price: 10_000 },
    { name: 'Pen', price: 2_000 },
  ];
  const taxRate = 0.1;

  // Act
  const total = calculateTotalWithTax(items, taxRate);

  // Assert
  expect(total).toBe(13_200);
});
```

### TEST-03: 테스트당 하나의 동작만 검증

```ts
// ❌ Bad — 여러 동작을 하나의 테스트에서 검증
it('should handle user operations', () => {
  const user = createUser('test@email.com');
  expect(user).toBeDefined();
  expect(user.email).toBe('test@email.com');

  const updated = updateUser(user.id, { name: 'New Name' });
  expect(updated.name).toBe('New Name');

  deleteUser(user.id);
  expect(findUser(user.id)).toBeNull();
});

// ✅ Good — 각 동작을 별도 테스트로 분리
it('should create user with given email', () => {
  const user = createUser('test@email.com');
  expect(user.email).toBe('test@email.com');
});

it('should update user name', () => {
  const user = createUser('test@email.com');
  const updated = updateUser(user.id, { name: 'New Name' });
  expect(updated.name).toBe('New Name');
});
```

### TEST-04: 모킹은 최소한으로, 경계에서만

```ts
// ❌ Bad — 내부 구현을 모킹 (리팩토링에 취약)
it('should call validateEmail and then saveToDb', () => {
  const validateSpy = vi.spyOn(utils, 'validateEmail');
  const saveSpy = vi.spyOn(db, 'save');
  createUser('test@email.com');
  expect(validateSpy).toHaveBeenCalledOnce();
  expect(saveSpy).toHaveBeenCalledOnce();
});

// ✅ Good — 외부 경계(DB, API)만 모킹
it('should persist user to database', () => {
  const mockDb: Database = {
    save: vi.fn().mockResolvedValue({ id: '1', email: 'test@email.com' }),
    find: vi.fn(),
    delete: vi.fn(),
  };
  const service = new UserService(mockDb);

  const user = await service.createUser('test@email.com');

  expect(user.email).toBe('test@email.com');
  expect(mockDb.save).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'test@email.com' }),
  );
});
```

### TEST-05: 테스트 데이터 빌더 / Factory 패턴 활용

```ts
// ❌ Bad — 매 테스트마다 전체 객체를 수동 생성
it('should activate user', () => {
  const user: User = {
    id: '1',
    name: 'Test',
    email: 'test@test.com',
    role: 'member',
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  // ...
});

// ✅ Good — Factory로 기본값 제공, 필요한 것만 오버라이드
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: crypto.randomUUID(),
    name: 'Test User',
    email: 'test@test.com',
    role: 'member',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

it('should activate user', () => {
  const user = createTestUser({ isActive: false });
  const activated = activateUser(user);
  expect(activated.isActive).toBe(true);
});
```

### 테스팅 체크리스트

```
□ 테스트 이름이 "무엇을, 어떤 조건에서, 어떻게"를 설명하는가?
□ AAA(Arrange-Act-Assert) 패턴을 따르는가?
□ 테스트당 하나의 동작만 검증하는가?
□ 모킹이 외부 경계에서만 이루어지는가?
□ 테스트 데이터 Factory를 활용하고 있는가?
□ 엣지 케이스(null, 빈 배열, 경계값)를 테스트했는가?
```

---

## FP vs OOP 선택 가이드

React/Next.js에서는 함수형 접근(함수 컴포넌트 + Hooks + 순수 유틸리티)이 기본입니다.
클래스 기반 OOP는 예외적인 상황에서만 제한적으로 사용하십시오.

### FP(함수형)가 적합한 경우

| 상황 | 이유 |
|------|------|
| 데이터 변환 파이프라인 | `map`, `filter`, `reduce` 체인이 의도를 명확히 표현 |
| 순수 계산 로직 | 입력→출력이 명확하고 부수 효과가 없음 |
| 유틸리티/헬퍼 함수 | 상태가 불필요, 독립적으로 테스트 가능 |
| React 컴포넌트 | 함수 컴포넌트 + Hooks가 표준 |
| Next.js 서버 로직 | Server Actions/Route Handler에서 함수 단위 구성이 자연스러움 |
| 불변 상태 관리 | Redux, Zustand 등의 상태 관리 패턴 |

```ts
// ✅ FP 스타일 — 데이터 변환
const activeUserEmails = users
  .filter((user) => user.isActive)
  .map((user) => user.email)
  .filter((email) => email.endsWith('@company.com'));
```

### 혼합 사용 (실용적 접근)

대부분의 React/Next.js 프로젝트에서는 FP와 상태 모듈을 함께 사용합니다:

```ts
const orderService = createOrderService({ orderRepo, paymentGateway });

async function CheckoutPage() {
  const cart = await getCart();
  const order = await orderService.placeOrder(cart);
  return <OrderSummary order={order} />;
}
```

**판단 기준 요약**: 기본은 함수/훅/모듈 조합을 우선하고, 클래스는 예외 상황에서만 사용하십시오.
확실하지 않다면 **함수부터 시작**하고, 상태/수명주기 요구가 명확할 때 모듈을 도입하십시오.

---

## AI 코드 생성 체크리스트

AI 코딩 어시스턴트는 코드를 생성한 후 다음을 최종 확인하십시오:

```
변수/함수명 (VAR, FN)
□ 이름만 읽어도 역할을 알 수 있는가?
□ 매직 넘버/문자열 대신 상수를 사용했는가?
□ 동일 개념에 동일 단어를 사용했는가?

함수 설계 (FN)
□ 함수가 한 가지 일만 하는가?
□ 인자가 2개 이하인가? (초과 시 객체로 묶었는가?)
□ 부수 효과(side effect)가 격리되어 있는가?
□ boolean 파라미터를 사용하지 않았는가?

타입 시스템 (TS)
□ any 타입을 사용하지 않았는가?
□ export 함수의 반환 타입을 명시했는가?
□ 필요한 곳에 readonly를 사용했는가?
□ 타입 단언(as) 대신 타입 가드를 사용했는가?
□ enum 대신 as const + type 패턴을 사용했는가?

모듈 설계 (OBJ)
□ 모듈/훅의 책임이 하나로 유지되는가?
□ 상속보다 컴포지션(함수/훅 조합)을 선택했는가?
□ 함수 컴포넌트 + Hooks를 우선 사용했는가?
□ 클래스는 예외 상황에서만 사용했는가?

에러 처리 (ERR)
□ catch 블록이 비어 있지 않은가?
□ Error 객체를 throw하는가? (문자열 throw 금지)
□ Promise rejection을 처리했는가?
□ Error.cause로 원인 체인을 유지하는가?

비동기 (ASYNC)
□ async/await를 사용했는가?
□ 독립적인 작업을 Promise.all로 병렬화했는가?

테스팅 (TEST)
□ 테스트 이름이 의도를 명확히 설명하는가?
□ AAA 패턴을 따르는가?
□ 모킹이 외부 경계에서만 이루어지는가?

포맷팅/주석 (FMT, CMT)
□ import 순서가 정렬 규칙을 따르는가?
□ 주석이 "Why"만 설명하는가?
□ 주석 처리된 코드가 없는가?
```

---

## 참고 자료

- [clean-code-typescript (원본)](https://github.com/labs42io/clean-code-typescript)
- [Clean Code (Robert C. Martin)](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)
- [TypeScript 공식 문서](https://www.typescriptlang.org/docs/)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [TypeScript 5.x Release Notes](https://devblogs.microsoft.com/typescript/)
