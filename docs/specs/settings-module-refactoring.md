# Settings Module 리팩토링 명세

> **Status**: `TODO`
> **Created**: 2026-03-30
> **기반 분석**: `docs/conventions/settings-module-refactoring-feature.md` (22건 중 10건 완료)
> **분석 스킬**: typescript-clean-code, frontend-predictability, frontend-readability, frontend-coupling, frontend-cohesion, frontend-file-naming, naming-conventions

---

## 요약

이전 리팩토링에서 C-1, I-5, I-6, I-8, I-9, I-10, I-12, I-13, N-1, N-4가 완료되었다.
본 문서는 미완료 12건 + 신규 발견 5건 = **총 17건**의 이슈를 정리하고 실행 순서를 명세한다.

### 이슈 요약 테이블

| ID | 심각도 | 제목 | 스킬 | 상태 |
|----|--------|------|------|------|
| C-2 | Critical | 서버 액션 에러 처리 불일치 | clean-code, predictability | 미완료 |
| C-3 | Critical | updateUserProfile Zod 검증 부재 | clean-code | 미완료 |
| NEW-5 | Critical | settings ↔ ai 양방향 의존 순환 | coupling | 신규 |
| I-1 | Important | getUserLanguageByUserId 반환 타입 | clean-code | 미완료 |
| I-2 | Important | 서버 액션 반환 타입 미명시 | clean-code | 미완료 |
| I-3 | Important | deleteRepository → disconnectRepository | predictability, naming | 미완료 |
| I-4 | Important | disconnectAllRepositories 숨은 부수효과 | predictability | 미완료 |
| I-7 | Important | 외부 2파일 import 경로 미변경 | cohesion | 부분완료 |
| I-11 | Important | 저장소 disconnect 로직 중복 | coupling | 부분완료 |
| NEW-1 | Important | UpdateProfileResult 타입 불일치 | clean-code | 신규 |
| NEW-2 | Important | UserProfile 타입에 maxSuggestions 누락 | clean-code | 신규 |
| NEW-3 | Important | useUserProfile 훅 React Query 안티패턴 | predictability | 신규 |
| NEW-4 | Nice | profile-form.tsx 초기화 패턴 복잡도 | readability | 신규 |
| N-2 | Nice | disconnectAllRepositories 이름 간결화 | naming | 미완료 |
| N-3 | Nice | getUserLanguageByUserId 이름 간결화 | naming | 미완료 |
| N-5 | Nice | setFormState 반복 패턴 헬퍼 추출 | readability | 미완료 |
| N-6 | Nice | Card className 반복 | readability | 미완료 |

---

## Critical

### C-2. 서버 액션 에러 처리 불일치

**스킬**: typescript-clean-code, frontend-predictability

**현재 문제**:

6개 서버 액션이 3가지 에러 패턴을 혼용한다:

| 함수 | 현재 패턴 | 문제점 |
|------|-----------|--------|
| `getUserProfile` | `null` 반환 | `useSuspenseQuery`에서 에러가 전파되지 않아 QueryBoundary 에러 UI 미작동 |
| `updateUserProfile` | `{ success: false, message }` 반환 | 의도적 설계 (검증 에러 메시지 표시용) |
| `deleteRepository` | throw | 정상 |
| `getConnectedRepositories` | throw | 정상 |
| `disconnectAllRepositories` | throw | 정상 |
| `getUserLanguageByUserId` | `DEFAULT_LANGUAGE` 반환 | AI 모듈 소비자용 graceful fallback, 유지 |

**해결안**:

`getUserProfile`의 catch 블록에서 `return null` → throw로 변경한다.
`settings-page.tsx`에서 `QueryBoundary`로 감싸고 있어 throw된 에러가 자동으로 에러 UI에 표시된다.

```typescript
// actions/index.ts — getUserProfile
export async function getUserProfile(): Promise<UserProfile> {
  const session = await requireAuthSession();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, email: true, image: true,
      createdAt: true, preferredLanguage: true, maxSuggestions: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return {
    ...user,
    preferredLanguage: normalizeLanguageCode(user.preferredLanguage) ?? DEFAULT_LANGUAGE,
  };
}
```

**주의**: `useUserProfile` 훅에서 `useSuspenseQuery`를 사용하므로, throw된 에러는 React Suspense boundary의 ErrorBoundary(`QueryBoundary`)에 전파된다. 추가 에러 UI 코드는 불필요하다.

**영향 파일**:
- `module/settings/actions/index.ts`

---

### C-3. updateUserProfile Zod 검증 부재

**스킬**: typescript-clean-code

**현재 문제**: `typeof` 체크만 수행. 이메일 형식, 이름 길이 미검증.

**해결안**:

프로젝트에서 Zod가 이미 사용 중이며 (`module/ai/types/suggestion.ts`, `module/ai/lib/review-schema.ts`) `import { z } from "zod"` 패턴을 따른다.

```typescript
// actions/index.ts 상단에 추가
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().max(100).trim().optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  preferredLanguage: z.string().optional(),
  maxSuggestions: z
    .union([z.number().int().min(1).max(MAX_SUGGESTION_CAP), z.null()])
    .optional(),
});

// I-2에서 사용하는 함수 파라미터 타입 — 스키마에서 파생
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

**⚠ Zod import 주의**: 기존 convention 문서에서 `import * as z from "zod"` (v4 문법)을 안내했으나, 프로젝트 실제 코드는 `import { z } from "zod"`를 사용한다. 실제 코드 패턴을 따를 것.

**⚠ 빈 문자열 이메일 호환**: 현재 코드는 빈 이메일을 허용한다. `z.union([z.string().email(), z.literal("")])`로 빈 문자열 호환을 유지한다.

**⚠ 동작 변경 주의**: 현재 빈 문자열 name 허용됨. `.min(1)` 미적용으로 기존 동작 유지.

**⚠ `.trim()` 체인 순서 주의**: Zod v4 v3-compat 모드(`import { z } from "zod"`)에서 `.trim()`이 `ZodEffects`를 반환할 수 있어 `.max()` 체인이 불가할 수 있다. `z.string().max(100).trim()` 순서로 작성하거나, `.trim()` 제거 후 기존 수동 `.trim()` 유지를 권장한다. 구현 전 빌드 확인 필수.

**통합 패턴**:

`safeParse`를 사용하여 기존 `typeof` 체크와 `maxSuggestions` 수동 검증을 교체한다:

```typescript
// updateUserProfile 함수 상단에서 즉시 검증
const parseResult = updateProfileSchema.safeParse(data);

if (!parseResult.success) {
  return {
    success: false,
    message: parseResult.error.issues[0]?.message ?? "Validation failed",
  };
}

const validated = parseResult.data;
const updateData: {
  name?: string;
  email?: string;
  preferredLanguage?: LanguageCode;
  maxSuggestions?: number | null;
} = {};

if (validated.name !== undefined) {
  updateData.name = validated.name; // .trim()은 Zod에서 이미 적용됨
}

if (validated.email !== undefined) {
  updateData.email = validated.email;
}

// ❌ normalizeLanguageCode는 Zod로 대체 불가 — 별도 유지
if (validated.preferredLanguage !== undefined) {
  const normalized = normalizeLanguageCode(validated.preferredLanguage);
  if (!normalized) {
    return { success: false, message: "Invalid language code" };
  }
  updateData.preferredLanguage = normalized;
}

if (validated.maxSuggestions !== undefined) {
  updateData.maxSuggestions = validated.maxSuggestions;
}
```

**교체 범위**:
- ✅ `typeof data.name === "string"` + 수동 `.trim()` → Zod `z.string().max(100).trim()` 로 대체
- ✅ `typeof data.email === "string"` → Zod `z.union([z.string().email(), z.literal("")])`로 대체
- ✅ `maxSuggestions` 수동 범위 체크 → Zod `z.number().int().min(1).max(...)` 로 대체
- ❌ `normalizeLanguageCode` 검증 → Zod 스키마로 대체 불가, 통합 코드에서 별도 유지

**영향 파일**:
- `module/settings/actions/index.ts`

**의존**: NEW-5 해결 후 진행 (`MAX_SUGGESTION_CAP` import 경로가 변경될 수 있음)

---

### NEW-5. settings ↔ ai 양방향 의존 순환

**스킬**: frontend-coupling

**현재 문제**:
- `module/ai` → `module/settings`: `getUserLanguageByUserId`, `LanguageCode`, `getLanguageName` import
- `module/settings` → `module/ai`: `MAX_SUGGESTION_CAP` import (`actions/index.ts:8`)

양방향 의존은 모듈 간 결합도를 높이고 순환 참조 위험을 만든다.

**해결안**:

`MAX_SUGGESTION_CAP`을 `shared/constants/index.ts`로 이동한다. `shared/constants`는 이미 `SECTION_HEADERS`, `DIAGRAM_FALLBACK_TEXT` 등 모듈 간 공유 상수를 관리하고 있어 적합하다.

```typescript
// shared/constants/index.ts에 추가
export const MAX_SUGGESTION_CAP = 15;
```

이후 양방향 의존이 해소된다:
- settings → shared (단방향)
- ai → shared (단방향)
- ai → settings (기존 단방향 유지)

**영향 파일**:
- `shared/constants/index.ts` — 상수 추가
- `module/settings/actions/index.ts` — import 경로 변경: `@/module/ai/constants` → `@/shared/constants`
- `module/ai/constants/index.ts` — `MAX_SUGGESTION_CAP` 제거 또는 re-export
- `module/ai/lib/review-prompt.ts` — import 경로 변경: `@/module/ai/constants` → `@/shared/constants`

---

## Important

### I-1. getUserLanguageByUserId 반환 타입

**스킬**: typescript-clean-code

**현재**: `Promise<string>` (`actions/index.ts:248`)
**해결**: `Promise<LanguageCode>`로 변경. 항상 `LanguageCode` 값만 반환하므로 타입을 정확히 명시.

```typescript
export async function getUserLanguageByUserId(userId: string): Promise<LanguageCode> {
```

**영향 파일**:
- `module/settings/actions/index.ts`
- `module/ai/actions/review-pull-request.ts` (반환값 소비 — 타입 자동 좁혀짐)
- `module/ai/actions/generate-pr-summary.ts` (동일)

---

### I-2. 서버 액션 반환 타입 미명시

**스킬**: typescript-clean-code

**현재**: `getUserProfile`, `updateUserProfile`, `getConnectedRepositories`, `deleteRepository`, `disconnectAllRepositories` 5개 함수에 명시적 반환 타입 없음.

**해결**:

```typescript
export async function getUserProfile(): Promise<UserProfile> { ... }
export async function updateUserProfile(data: UpdateProfileInput): Promise<UpdateProfileResult> { ... }
export async function getConnectedRepositories(): Promise<ConnectedRepository[]> { ... }
export async function disconnectRepository(repositoryId: string): Promise<ActionSuccess> { ... }
export async function disconnectAllRepositories(): Promise<ActionSuccess> { ... }
```

`ConnectedRepository` 타입을 `types/index.ts`에 추가:

```typescript
export interface ConnectedRepository {
  id: string;
  name: string;
  fullName: string;
  url: string;
  createdAt: Date;
}

export interface ActionSuccess {
  success: true;
  message: string;
}
```

**참고**: `UpdateProfileInput`은 C-3에서 정의한 `updateProfileSchema`에서 `z.infer<typeof updateProfileSchema>`로 파생된다. 별도 수동 타입 정의 불필요.

**의존**: C-2 (getUserProfile 반환 타입 변경), C-3 (`UpdateProfileInput` 타입 정의), NEW-1/NEW-2 (타입 수정) 완료 후 최종 반환 타입 확정.

**영향 파일**:
- `module/settings/actions/index.ts`
- `module/settings/types/index.ts`

---

### I-3. deleteRepository → disconnectRepository 이름 변경

**스킬**: frontend-predictability, naming-conventions

**현재 문제**: `deleteRepository`는 웹훅 삭제 + DB 삭제 + 사용량 차감을 수행한다. UI에서는 "Disconnect"로 표시된다.

**해결**: I-11과 연계 처리. settings 모듈의 `deleteRepository`를 `disconnectRepository`로 이름 변경 + repository 모듈에 위임.

```typescript
// hooks/use-connected-repositories.ts
import { ..., disconnectRepository, ... } from "../actions";

const disconnectMutation = useMutation({
  mutationFn: disconnectRepository,
  // ...
});
```

**영향 파일**:
- `module/settings/actions/index.ts`
- `module/settings/hooks/use-connected-repositories.ts`

---

### I-4. disconnectAllRepositories 숨은 부수효과

**스킬**: frontend-predictability

**현재 문제**: `repositoryCount`를 0으로 리셋하는 부수효과가 함수명에 반영되지 않음.

**해결**: I-11과 연계. settings 모듈의 함수가 repository 모듈의 `disconnectAllRepositoriesInternal`에 위임하면, 부수효과는 repository 모듈 내부 구현이 된다. JSDoc 주석으로 부수효과를 명시한다.

```typescript
/**
 * 모든 연결된 저장소를 해제한다.
 * 내부적으로 웹훅 삭제, DB 레코드 삭제, repositoryCount 초기화를 수행한다.
 */
export async function disconnectAllRepositories(): Promise<ActionSuccess> {
  const session = await requireAuthSession();
  await disconnectAllRepositoriesInternal(session.user.id);
  return { success: true, message: "All repositories disconnected successfully" };
}
```

**영향 파일**:
- `module/settings/actions/index.ts`

---

### I-7. 외부 2파일 import 경로 미변경 (부분완료)

**스킬**: frontend-cohesion

**현재 문제**: barrel export가 설정되었으나 2파일이 여전히 `@/module/settings/constants`에서 직접 import:

- `module/ai/lib/review-formatter.ts:2` — `import type { LanguageCode } from "@/module/settings/constants"`
- `module/ai/lib/review-prompt.ts:2` — `import type { LanguageCode } from "@/module/settings/constants"`

**해결**:

```typescript
import type { LanguageCode } from "@/module/settings";
```

**영향 파일**:
- `module/ai/lib/review-formatter.ts`
- `module/ai/lib/review-prompt.ts`

---

### I-11. 저장소 disconnect 로직 중복 (부분완료)

**스킬**: frontend-coupling

**현재 문제**: `module/repository/actions/index.ts`에 이미 `disconnectRepository(repositoryId, userId)`와 `disconnectAllRepositoriesInternal(userId)`가 존재한다. 그러나 settings 모듈의 `deleteRepository`와 `disconnectAllRepositories`가 동일한 로직(`deleteWebhook`, `prisma.repository.delete`, `decrementRepositoryCount`)을 직접 수행하고 있다.

이로 인해:
1. 비즈니스 로직이 2곳에 중복
2. `module/github`와 `module/payment`에 대한 settings의 직접 의존 유지
3. 로직 변경 시 양쪽 수정 필요

**해결안**: settings 모듈의 서버 액션이 repository 모듈 함수에 위임하도록 변경.

```typescript
// module/settings/actions/index.ts
import {
  disconnectRepository as disconnectRepositoryInternal,
  disconnectAllRepositoriesInternal,
} from "@/module/repository";

export async function disconnectRepository(repositoryId: string): Promise<ActionSuccess> {
  const session = await requireAuthSession();
  await disconnectRepositoryInternal(repositoryId, session.user.id);
  return { success: true, message: "Repository disconnected successfully" };
}

export async function disconnectAllRepositories(): Promise<ActionSuccess> {
  const session = await requireAuthSession();
  await disconnectAllRepositoriesInternal(session.user.id);
  return { success: true, message: "All repositories disconnected successfully" };
}
```

이렇게 하면 `deleteWebhook`, `decrementRepositoryCount` import가 settings에서 제거되고, `module/github` 및 `module/payment` 의존도 제거된다.

**영향 파일**:
- `module/settings/actions/index.ts` — 로직 위임, import 정리

---

### NEW-1. UpdateProfileResult 타입 불일치

**스킬**: typescript-clean-code

**현재 문제**: `types/index.ts`의 `UpdateProfileResult` success 케이스에서 `maxSuggestions` 필드가 누락되었다. `actions/index.ts:112-117`에서 `maxSuggestions: true`를 select하고 있으나 타입에 반영되지 않음.

**해결**:

```typescript
export type UpdateProfileResult =
  | {
      success: true;
      user: {
        id: string;
        name: string | null;
        email: string | null;
        preferredLanguage: string | null;
        maxSuggestions: number | null;
      };
    }
  | { success: false; message: string };
```

**참고**: `preferredLanguage`는 Prisma select 결과가 `string | null`이므로 현재 타입 유지. DB 컬럼 타입과 일치시킨다.

**영향 파일**:
- `module/settings/types/index.ts`

---

### NEW-2. UserProfile 타입에 maxSuggestions 누락

**스킬**: typescript-clean-code

**현재 문제**: `getUserProfile`은 `maxSuggestions: true`를 select하지만 (`actions/index.ts:26`), `UserProfile` 인터페이스에 `maxSuggestions` 필드가 없다.

**해결**:

```typescript
export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  preferredLanguage: LanguageCode;
  maxSuggestions: number | null;
}
```

**영향 파일**:
- `module/settings/types/index.ts`

---

### NEW-3. useUserProfile 훅 React Query 안티패턴

**스킬**: frontend-predictability

**현재 문제**: `updateUserProfile` 서버 액션이 검증 실패 시 `{ success: false, message }` 반환. React Query는 이를 성공으로 취급하여 `onSuccess`가 호출된다. `onSuccess` 내부에서 `result.success`를 수동 체크하여 성공/실패를 분기한다.

이는 React Query의 `onSuccess`/`onError` 패턴에 익숙한 개발자에게 혼란을 줄 수 있다.

**해결안**:

이 패턴은 검증 에러 메시지를 사용자에게 표시하기 위한 의도적 설계이다. 현재 동작하는 코드를 변경하는 위험 대비 이점이 크지 않으므로, 의도를 명시하는 주석을 추가한다.

```typescript
const updateMutation = useMutation({
  mutationFn: updateUserProfile,
  // updateUserProfile은 검증 실패 시 throw 대신 { success: false, message } 반환.
  // React Query는 이를 성공으로 처리하므로 onSuccess에서 result.success를 확인한다.
  // 이 패턴은 검증 에러 메시지를 toast로 표시하기 위한 의도적 설계.
  onSuccess: async (result) => { ... },
  onError: () => { ... },  // 네트워크/서버 에러만 처리
});
```

**영향 파일**:
- `module/settings/hooks/use-user-profile.ts`

---

## Nice-to-Have

### NEW-4. profile-form.tsx 초기화 패턴 복잡도

**스킬**: frontend-readability

**현재 문제**: `getInitialFormState`가 `profile`을 캡처하는 클로저로 매 렌더마다 재생성된다. `formState: State | null` + `currentFormState = formState ?? getInitialFormState()` 패턴은 lazy initialization이지만 인지 복잡도를 높인다.

**해결안**:

`useSuspenseQuery`를 사용하므로 `profile`은 항상 존재한다. C-2에서 throw 방식으로 변경되면 이 보장이 더 강해진다.

**방안 A (권장)** — 현재 `null` 기반 lazy init 유지, 인지 복잡도만 개선:

```typescript
// profile을 non-null로 취급 (useSuspenseQuery 보장)
const getInitialFormState = () => ({
  name: profile.name || "",
  email: profile.email || "",
  preferredLanguage: profile.preferredLanguage ?? DEFAULT_LANGUAGE,
});

// formState가 null이면 서버 데이터 기반 초기값 사용 (lazy init)
const [formState, setFormState] = useState<FormState | null>(null);
const currentFormState = formState ?? getInitialFormState();
```

이 방안은 mutation 성공 시 `setFormState(null)` → 다음 렌더에서 `getInitialFormState()`가 refetch된 최신 `profile` 참조 → 항상 최신 데이터를 표시한다. 현재 동작을 정확히 보존하면서 optional chaining만 제거하여 가독성을 개선한다.

**방안 B (대안)** — `key` prop으로 컴포넌트 remount:

```typescript
// settings-page.tsx에서 — profile 변경 시 ProfileForm remount
<ProfileForm key={profile?.id} />
```

```typescript
// profile-form.tsx 내부 — 단순한 useState 사용 가능
const [formState, setFormState] = useState({
  name: profile.name || "",
  email: profile.email || "",
  preferredLanguage: profile.preferredLanguage ?? DEFAULT_LANGUAGE,
});
```

key 변경 시 React가 컴포넌트를 새로 mount하므로 `useState` 초기값이 최신 `profile`을 참조한다. 단, `settings-page.tsx`에서 `ProfileForm`이 `QueryBoundary` 내부에 있어 `profile` 접근이 불가할 수 있으므로 key 생성 전략을 검토해야 한다.

**⚠ 사용 금지 패턴**: `useMemo` + `useState(initialFormState)` 조합은 mutation 성공 후 stale 데이터를 표시하는 regression을 유발한다. `useState`는 초기값 변경에 반응하지 않으므로, `invalidateQueries` → refetch 완료 전 시점의 구 데이터가 폼에 남는다.

**영향 파일**:
- `module/settings/ui/parts/profile/profile-form.tsx`

---

### N-2. disconnectAllRepositories → disconnectRepositories 간결화

**스킬**: naming-conventions

"All"이 불필요 (인자로 개별/전체를 구분하는 것이 아니라 별도 함수이므로).

**영향 파일**:
- `module/settings/actions/index.ts`
- `module/settings/hooks/use-connected-repositories.ts`

---

### N-3. getUserLanguageByUserId → getUserLanguage 간결화

**스킬**: naming-conventions

`ByUserId` 접미사 제거. userId 매개변수를 받는 것은 함수 시그니처로 충분히 표현됨.

**영향 파일**:
- `module/settings/actions/index.ts`
- `module/settings/index.ts` (re-export)
- `module/ai/actions/review-pull-request.ts`
- `module/ai/actions/generate-pr-summary.ts`

---

### N-5. setFormState 반복 패턴 헬퍼 추출

**스킬**: frontend-readability

**현재**: 동일 패턴이 3회 반복 (`profile-form.tsx`):

```typescript
setFormState((prev) => ({ ...(prev ?? getInitialFormState()), [field]: value }))
```

**해결**:

```typescript
const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
  setFormState((prev) => ({ ...(prev ?? getInitialFormState()), [field]: value }));
};
```

**의존**: NEW-4와 동시 진행 가능. NEW-4에서 초기화 패턴이 변경되면 헬퍼 내부도 조정.

**영향 파일**:
- `module/settings/ui/parts/profile/profile-form.tsx`

---

### N-6. Card className 반복

**스킬**: frontend-readability

**현재**: `"relative overflow-hidden border-border bg-gradient-to-b from-card to-background"`가 4개 파일에서 반복:
- `profile-form.tsx`, `profile-skeleton.tsx`, `repository-list.tsx`, `repository-skeleton.tsx`

**해결안**: settings 모듈 내부 상수로 추출.

**⚠ 범위 한정**: 동일 className이 `components/error-boundary/query-error-boundary.tsx`, `module/dashboard/ui/stats-overview.tsx`에서도 사용된다. settings 모듈 상수로 추출하면 해당 모듈 내 4파일만 개선된다. 프로젝트 전체 중복 해소가 필요하면 `shared/constants`로 이동을 검토할 것.

```typescript
// constants/index.ts에 추가
export const SETTINGS_CARD_CLASS =
  "relative overflow-hidden border-border bg-gradient-to-b from-card to-background";
```

**영향 파일**:
- `module/settings/constants/index.ts`
- `module/settings/ui/parts/profile/profile-form.tsx`
- `module/settings/ui/parts/profile/profile-skeleton.tsx`
- `module/settings/ui/parts/repository/repository-list.tsx`
- `module/settings/ui/parts/repository/repository-skeleton.tsx`

---

## 실행 순서

의존 관계에 따른 권장 순서:

```
Phase 1 (독립적, 병렬 가능):
├── NEW-5: MAX_SUGGESTION_CAP shared로 이동
├── I-7:   외부 2파일 import 경로 수정
├── I-1:   getUserLanguageByUserId 반환 타입
├── NEW-1 + NEW-2: types/index.ts 타입 수정
└── NEW-3: useUserProfile 주석 추가

Phase 2 (Phase 1 완료 후):
├── C-2:   getUserProfile throw 전환
├── C-3:   Zod 검증 추가 (NEW-5 완료 후 import 경로 확정)
├── I-3 + I-11: disconnectRepository 이름 변경 + 위임
├── I-4:   disconnectAllRepositories JSDoc 추가
└── I-2:   반환 타입 명시 (타입 확정 후)

Phase 3 (Phase 2 완료 후):
├── NEW-4 + N-5: profile-form.tsx 초기화 패턴 + 헬퍼 추출
├── N-2:   disconnectAllRepositories 이름 간결화
├── N-3:   getUserLanguageByUserId 이름 간결화
└── N-6:   Card className 상수 추출
```

---

## 수정 대상 파일 종합

| 파일 | 관련 이슈 |
|------|----------|
| `module/settings/actions/index.ts` | C-2, C-3, I-1, I-2, I-3, I-4, I-11, NEW-5, N-2, N-3 |
| `module/settings/types/index.ts` | I-2, NEW-1, NEW-2 |
| `module/settings/hooks/use-user-profile.ts` | NEW-3 |
| `module/settings/hooks/use-connected-repositories.ts` | I-3, N-2 |
| `module/settings/constants/index.ts` | N-6 |
| `module/settings/ui/parts/profile/profile-form.tsx` | NEW-4, N-5 |
| `module/settings/ui/parts/profile/profile-skeleton.tsx` | N-6 |
| `module/settings/ui/parts/repository/repository-list.tsx` | N-6 |
| `module/settings/ui/parts/repository/repository-skeleton.tsx` | N-6 |
| `module/ai/lib/review-formatter.ts` | I-7 |
| `module/ai/lib/review-prompt.ts` | I-7, NEW-5 |
| `module/ai/constants/index.ts` | NEW-5 |
| `module/ai/actions/review-pull-request.ts` | I-1, N-3 |
| `module/ai/actions/generate-pr-summary.ts` | I-1, N-3 |
| `shared/constants/index.ts` | NEW-5 |

---

## 검증

1. `npx tsc --noEmit` — 타입 에러 없음
2. `npm run lint` — lint 통과
3. `npm run build` — 빌드 성공
4. Settings 페이지 수동 테스트:
   - 프로필 수정 (이름, 이메일, 언어 변경) 후 저장
   - 유효하지 않은 이메일 입력 시 에러 메시지 표시
   - 저장소 개별 연결 해제
   - 전체 저장소 연결 해제
5. 에러 시나리오 테스트:
   - 네트워크 에러 시 QueryBoundary 에러 UI 표시 (C-2)
   - Zod 검증 실패 시 toast 에러 메시지 표시 (C-3)

---

## 미해결 질문

- `MAX_SUGGESTION_CAP`을 `shared/constants`로 이동 시 `module/ai/constants/index.ts`에서 제거할 것인가, re-export로 유지할 것인가?
- N-2, N-3 네이밍 간결화를 적용하면 외부 소비자(ai 모듈 2파일) import명도 변경 필요 — 한 번에 적용할 것인가, 단계적으로 할 것인가?
