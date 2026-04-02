# 모듈 간 의존성 정리 명세

> **Status**: `TODO`
> **Created**: 2026-04-03
> **기반**: 코드 리뷰 피드백 (2026-04-03)
> **관련 문서**: `docs/specs/settings-module-refactoring.md` (NEW-5, I-7, I-11, I-1)

---

## 요약

코드 리뷰에서 식별된 모듈 간 의존성 문제 중 실질적으로 유효한 4건을 정리한다.
기존 `settings-module-refactoring.md`에 이미 명세된 항목이 있으나, **I-7의 import 대상이 다르므로** 본 문서에서 수정된 방향을 확정한다.

### 이슈 요약

| ID | 심각도 | 제목 | 기존 명세 | 상태 |
|----|--------|------|-----------|------|
| D-1 | Warning | `LanguageCode` import 경로 정규화 | I-7 (방향 수정) | TODO |
| D-2 | Warning | `MAX_SUGGESTION_CAP` 공유 상수화 | NEW-5 (동일) | TODO |
| D-3 | Warning | 저장소 disconnect 로직 위임 | I-11 (동일) | TODO |
| D-4 | Suggestion | `getUserLanguageByUserId` 반환 타입 명시 | I-1 (동일) | TODO |

---

## D-1. LanguageCode import 경로 정규화

**심각도**: Warning
**기존 명세와의 차이**: `settings-module-refactoring.md` I-7은 `@/module/settings` (barrel export)로 변경을 명세했으나, 본 건은 `@/shared/types/language`로 직접 import를 권장한다.

### 현재 문제

`module/ai/lib/review-formatter.ts:2`와 `module/ai/lib/review-prompt.ts:2`가 `LanguageCode` 타입을 `@/module/settings/constants`에서 가져온다.

```typescript
// module/ai/lib/review-formatter.ts:2
import type { LanguageCode } from "@/module/settings/constants";

// module/ai/lib/review-prompt.ts:2
import type { LanguageCode } from "@/module/settings/constants";
```

`LanguageCode`는 `shared/types/language.ts`에 정의된 공유 타입이다. `settings/constants`는 이를 re-export할 뿐이며, ai 모듈이 settings 모듈에 의존할 이유가 없다.

### barrel export(`@/module/settings`)가 아닌 `@/shared/types/language`를 선택하는 이유

1. **`LanguageCode`는 settings 도메인의 타입이 아니다.** `shared/types/`에 정의된 프로젝트 공용 타입이며, `shared/constants/index.ts`도 이미 `@/shared/types/language`에서 직접 import한다.
2. **ai → settings 의존 방향 자체가 불필요.** ai 모듈이 settings barrel을 import하면 settings 모듈의 내부 변경이 ai 모듈 빌드에 영향을 줄 수 있다. 공유 타입은 공유 위치에서 가져오는 것이 결합도를 낮춘다.
3. **기존 패턴과 일치.** `shared/constants/index.ts:1`이 이미 `import type { LanguageCode } from "@/shared/types/language"` 패턴을 사용한다.

### 해결안

```typescript
// module/ai/lib/review-formatter.ts — 변경 전
import type { LanguageCode } from "@/module/settings/constants";
// 변경 후
import type { LanguageCode } from "@/shared/types/language";

// module/ai/lib/review-prompt.ts — 변경 전
import type { LanguageCode } from "@/module/settings/constants";
// 변경 후
import type { LanguageCode } from "@/shared/types/language";
```

**참고**: `review-prompt.ts:6`의 `getLanguageName` import(`@/module/settings`)는 settings 도메인 함수이므로 유지한다. `LanguageCode` 타입 import만 변경 대상.

### 영향 파일

- `module/ai/lib/review-formatter.ts` — import 경로 변경
- `module/ai/lib/review-prompt.ts` — import 경로 변경

---

## D-2. MAX_SUGGESTION_CAP 공유 상수화

**심각도**: Warning
**기존 명세**: `settings-module-refactoring.md` NEW-5와 동일.

### 현재 문제

`MAX_SUGGESTION_CAP`이 `module/ai/constants/index.ts:7`에 정의되어 있고, `module/settings/actions/index.ts:9`가 이를 import한다.

```
settings/actions → ai/constants (MAX_SUGGESTION_CAP)
ai/lib          → settings     (LanguageCode, getLanguageName)
```

양방향 의존이 형성된다. 현재는 빌드 에러를 유발하는 직접 순환은 아니지만(타입 import + 런타임 import가 분리되어 있어), 모듈 경계가 모호해지는 설계상 문제다.

### 해결안

`MAX_SUGGESTION_CAP`을 `shared/constants/index.ts`로 이동한다. `shared/constants`는 이미 `SECTION_HEADERS`, `DIAGRAM_FALLBACK_TEXT` 등 모듈 간 공유 상수를 관리하는 위치이므로 적합하다.

```typescript
// shared/constants/index.ts — 추가
export const MAX_SUGGESTION_CAP = 15;
```

```typescript
// module/settings/actions/index.ts:9 — 변경
// 변경 전
import { MAX_SUGGESTION_CAP } from "@/module/ai/constants";
// 변경 후
import { MAX_SUGGESTION_CAP } from "@/shared/constants";

// module/ai/lib/review-prompt.ts:5 — 변경
// 변경 전
import { MAX_SUGGESTION_CAP } from "@/module/ai/constants";
// 변경 후
import { MAX_SUGGESTION_CAP } from "@/shared/constants";
```

`module/ai/constants/index.ts`에서 `MAX_SUGGESTION_CAP`을 **제거**한다. re-export로 유지하면 이중 경로가 발생하여 혼란을 준다. ai 모듈 내부에서 이 상수를 사용하는 곳이 `review-prompt.ts` 1곳뿐이므로 re-export 없이 직접 shared에서 import하는 것이 깔끔하다.

### 변경 후 의존 방향

```
settings/actions → shared/constants (MAX_SUGGESTION_CAP)  ← 단방향
ai/lib           → shared/constants (MAX_SUGGESTION_CAP)  ← 단방향
ai/lib           → settings         (getLanguageName)     ← 기존 단방향 유지
```

### 영향 파일

| 파일 | 변경 내용 |
|------|----------|
| `shared/constants/index.ts` | `MAX_SUGGESTION_CAP` 추가 |
| `module/ai/constants/index.ts` | `MAX_SUGGESTION_CAP` 제거 |
| `module/settings/actions/index.ts` | import 경로 변경 |
| `module/ai/lib/review-prompt.ts` | import 경로 변경 |

---

## D-3. 저장소 disconnect 로직 위임

**심각도**: Warning
**기존 명세**: `settings-module-refactoring.md` I-11과 동일.

### 현재 문제

`module/repository/actions/index.ts`에 이미 동일 로직이 존재한다:
- `disconnectRepository(repositoryId, userId)` (127-149행)
- `disconnectAllRepositoriesInternal(userId)` (151-177행)

그러나 `module/settings/actions/index.ts`의 `deleteRepository` (123-160행)와 `disconnectAllRepositories` (162-209행)가 동일한 비즈니스 로직(webhook 삭제 → DB 삭제 → 사용량 차감)을 **중복 구현**한다.

이로 인해:
1. 비즈니스 로직 2곳 중복 → 한쪽만 수정 시 불일치 위험
2. settings 모듈이 `module/github` (`deleteWebhook`)와 `module/payment` (`decrementRepositoryCount`)에 직접 의존
3. settings 모듈의 관심사가 "사용자 설정 관리"를 넘어 "저장소 인프라 관리"로 확장

### 해결안

settings 모듈의 서버 액션이 repository 모듈의 기존 함수에 위임한다.

```typescript
// module/settings/actions/index.ts

// 변경 전
import { deleteWebhook } from "@/module/github";
import { decrementRepositoryCount } from "@/module/payment/lib/subscription";

// 변경 후
import {
  disconnectRepository as disconnectRepositoryInternal,
  disconnectAllRepositoriesInternal,
} from "@/module/repository/actions";
```

```typescript
// deleteRepository → disconnectRepository로 이름 변경 (I-3 연계)
export async function disconnectRepository(repositoryId: string) {
  const session = await requireAuthSession();
  try {
    await disconnectRepositoryInternal(repositoryId, session.user.id);
    return { success: true, message: "Repository disconnected successfully" };
  } catch (error) {
    console.error("Error disconnecting repository:", error);
    throw error instanceof Error ? error : new Error("Failed to disconnect repository");
  }
}

export async function disconnectAllRepositories() {
  const session = await requireAuthSession();
  try {
    await disconnectAllRepositoriesInternal(session.user.id);
    return { success: true, message: "All repositories disconnected successfully" };
  } catch (error) {
    console.error("Error disconnecting all repositories:", error);
    throw error instanceof Error ? error : new Error("Failed to disconnect all repositories");
  }
}
```

### 주의: 에러 로깅 유지 필수

현재 settings 모듈의 `deleteRepository`와 `disconnectAllRepositories`는 try-catch로 에러를 `console.error`에 로깅한 후 re-throw한다. 반면 repository 모듈의 `disconnectRepository`와 `disconnectAllRepositoriesInternal`은 로깅 없이 직접 throw한다.

위임 시 래퍼에 try-catch를 **반드시 유지**해야 한다. 제거하면 webhook 삭제 실패, DB 에러 등이 서버 로그에 기록되지 않아 운영 환경에서 디버깅이 어려워진다.

### 변경 후 효과

- `deleteWebhook`, `decrementRepositoryCount` import 제거 → `module/github`, `module/payment` 직접 의존 해소
- 비즈니스 로직 단일 소스 (repository 모듈)
- settings 모듈은 인증 + 위임 + 에러 로깅만 담당

### 영향 파일

| 파일 | 변경 내용 |
|------|----------|
| `module/settings/actions/index.ts` | 로직 위임, import 정리, 함수명 변경 |
| `module/settings/hooks/use-connected-repositories.ts` | `deleteRepository` → `disconnectRepository` 호출 변경 |

---

## D-4. getUserLanguageByUserId 반환 타입 명시

**심각도**: Suggestion
**기존 명세**: `settings-module-refactoring.md` I-1과 동일.

### 현재 문제

```typescript
// module/settings/actions/index.ts:211
export async function getUserLanguageByUserId(userId: string): Promise<string> {
```

함수는 항상 `LanguageCode` 값(`"en"` 또는 `"ko"`)만 반환한다:
- 유효한 언어코드가 있으면 그대로 반환 (222행)
- 없으면 `DEFAULT_LANGUAGE` (`"en"`) 반환 (226, 229행)

그러나 반환 타입이 `Promise<string>`으로 선언되어 있어, 호출처에서 `LanguageCode`로 좁히기 위해 별도 타입 단언이 필요하다.

### 해결안

```typescript
// 변경 전
export async function getUserLanguageByUserId(userId: string): Promise<string> {
// 변경 후
export async function getUserLanguageByUserId(userId: string): Promise<LanguageCode> {
```

`LanguageCode`는 이미 같은 파일 상단에서 import되어 있으므로 (`actions/index.ts:8`) 추가 import 불필요.

### 영향 파일

- `module/settings/actions/index.ts` — 반환 타입 변경

호출처(`module/ai/actions/review-pull-request.ts`, `module/ai/actions/generate-pr-summary.ts`)는 타입이 자동으로 좁혀지므로 변경 불필요.

---

## 실행 순서

4건 모두 독립적이므로 병렬 진행 가능하나, D-1과 D-2를 먼저 처리하면 ai ↔ settings 간 의존이 정리되어 이후 작업이 깔끔하다.

```
Phase 1 (병렬 가능):
├── D-1: LanguageCode import 경로 정규화 (2파일)
├── D-2: MAX_SUGGESTION_CAP 공유 상수화 (4파일)
└── D-4: getUserLanguageByUserId 반환 타입 (1파일)

Phase 2:
└── D-3: disconnect 로직 위임 (2파일)
        D-2 완료 후 진행 권장 (같은 파일 수정 충돌 방지)
```

## 수정 대상 파일 종합

| 파일 | 관련 이슈 |
|------|----------|
| `module/ai/lib/review-formatter.ts` | D-1 |
| `module/ai/lib/review-prompt.ts` | D-1, D-2 |
| `module/ai/constants/index.ts` | D-2 |
| `module/settings/actions/index.ts` | D-2, D-3, D-4 |
| `module/settings/hooks/use-connected-repositories.ts` | D-3 |
| `shared/constants/index.ts` | D-2 |

---

## 검증

1. `npx tsc --noEmit` — 타입 에러 없음
2. `npm run lint` — lint 통과
3. `npm run build` — 빌드 성공
4. import 의존성 확인:
   - `module/ai`가 `@/module/settings/constants`를 import하지 않음 (D-1 검증)
   - `module/settings`가 `@/module/ai/constants`를 import하지 않음 (D-2 검증)
   - `module/settings`가 `@/module/github`, `@/module/payment`를 import하지 않음 (D-3 검증)

---

## 기존 명세와의 관계

본 문서의 항목들은 `settings-module-refactoring.md`의 해당 이슈를 대체하지 않는다. D-2, D-3, D-4는 기존 명세(NEW-5, I-11, I-1)와 동일하며, **D-1만 기존 I-7의 방향을 수정**한다.

구현 시 `settings-module-refactoring.md`의 I-7을 본 문서의 D-1 방향(`@/shared/types/language` 직접 import)으로 적용할 것.
