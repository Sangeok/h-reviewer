# Settings Module Refactoring

7개 프론트엔드 스킬 기준 `module/settings` 분석 결과. 22건 이슈 (Critical 3, Important 13, Nice-to-Have 6).

**분석 기준**: typescript-clean-code, frontend-predictability, frontend-cohesion, naming-conventions, frontend-readability, frontend-coupling, frontend-file-naming

---

## Critical

### C-1. 커스텀 훅 미분리 (cohesion, file-naming)

`profile-form.tsx`, `repository-list.tsx`에 `useQuery`/`useMutation` 로직 인라인 정의. `hooks/` 디렉토리 부재.

```
# 생성 파일
module/settings/hooks/use-user-profile.ts        — 프로필 조회/수정
module/settings/hooks/use-connected-repositories.ts — 저장소 목록/삭제
```

### C-2. 에러 처리 전략 불일치 (clean-code, predictability)

6개 서버 액션이 3가지 에러 패턴 혼용:

| 함수 | 현재 패턴 | 사용처 |
|------|-----------|--------|
| `getUserProfile` | `null` 반환 | queryFn |
| `updateUserProfile` | `{ success: false, message }` 반환 | mutationFn |
| `deleteRepository` | 성공=반환, 실패=throw | mutationFn |
| `getConnectedRepositories` | throw | queryFn |
| `disconnectAllRepositories` | throw | mutationFn |
| `getUserLanguageByUserId` | `DEFAULT_LANGUAGE` 반환 | 서버 사이드 직접 호출 |

**⚠️ React Query 제약**: throw된 에러만 `isError`/`onError`로 전환. `ActionResult` 일괄 적용 시 에러 UI 미동작.

**통일 전략** (하이브리드):
- **queryFn/mutationFn 함수**: 에러 시 throw 유지. `getUserProfile`은 `null` → throw로 변경
- **`updateUserProfile`**: 검증 실패 시 `{ success: false, message }` 반환 유지 (UI 에러 메시지 필요)
- **`getUserLanguageByUserId`**: graceful fallback 유지 (AI 모듈 2파일이 반환값 직접 소비)

**⚠️ `getUserProfile` throw 전환 시 에러 UI 필수**: 현재 `profile-form.tsx`는 `useQuery`에서 `isError`/`error`를 구조분해하지 않음. throw 전환 후 React Query가 에러 상태를 활성화하지만 에러 UI가 없어 사용자에게 빈 폼만 노출됨. C-1에서 생성하는 `use-user-profile.ts` 훅이 `isError`, `error`, `refetch`를 반환하고, `profile-form.tsx`에 에러 상태 UI를 추가해야 함 (`repository-list.tsx`의 `isError` 처리 패턴 참고).

### C-3. `updateUserProfile` 입력 검증 부재 (clean-code)

이메일 형식, 이름 길이 미검증. `typeof` 체크만 존재. Zod 활용 (이미 설치됨: `^4.3.6`).

**⚠️ Zod v4 문법 주의**: `import * as z from "zod"` 사용. `z.string().email()`은 v4에서 deprecated → `z.email()` 사용.

**⚠️ 프로젝트 첫 Zod 사용**: 소스 코드에서 Zod를 처음 도입하므로 구현 전 import 구문과 `z.email()` API 가용성을 반드시 검증할 것. Zod v4는 `import { z } from "zod/v4"`가 공식 권장일 수 있음. 빌드 전 `node -e "const z = require('zod'); console.log(typeof z.email)"` 등으로 확인.

```ts
import * as z from "zod";

const updateProfileSchema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  preferredLanguage: z.string().optional(),
});
```

**⚠️ 동작 변경 주의**: 현재 빈 문자열 name 허용됨. `.min(1)` 추가 시 빈 이름 거부로 변경되므로 `.min(1)` 미적용.

**⚠️ email 빈 문자열 주의**: `z.email()`은 빈 문자열 `""`을 거부하지만, 현재 코드는 사용자가 이메일 필드를 비워도 허용함 (`typeof` 체크 + `trim()` 만 수행). `z.union([z.email(), z.literal("")])` 으로 빈 문자열 호환 유지.

---

## Important

### I-1. `getUserLanguageByUserId` 반환 타입 (clean-code)
`Promise<string>` → `Promise<LanguageCode>`. 항상 `LanguageCode` 반환하므로 타입 정확히 명시.
**영향**: `module/ai/actions/` 2파일

### I-2. export 함수 반환 타입 미명시 (clean-code)
`getUserProfile`, `updateUserProfile`, `getConnectedRepositories`, `deleteRepository`, `disconnectAllRepositories` 5개 함수에 명시적 반환 타입 추가.

### I-3. `deleteRepository` → `disconnectRepository` (predictability, naming)
웹훅 삭제 + DB 삭제 + 사용량 차감 수행. UI에서도 "Disconnect" 사용. 비즈니스 동사로 변경.

### I-4. `disconnectAllRepositories` 숨은 부수효과 (predictability)
`repositoryCount` 초기화가 함수명에 미반영. `disconnectRepositoriesAndResetUsage` 또는 주석으로 명시.

### I-5. 데드 코드 제거 (cohesion, coupling)
`repository-list.tsx`의 `queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })` — 프로젝트 전체에 해당 쿼리 키 사용처 없음. 제거.

### I-6. `types/` 디렉토리 생성 (cohesion)
서버 액션 반환 타입(`UserProfile`, `UpdateProfileResult`), 폼 상태 타입을 `types/index.ts`에 정의.

### I-7. 배럴에서 constants re-export (cohesion)
`index.ts`에 `export * from "./constants"` 추가. 외부 4개 파일의 import 경로 변경.

### I-8. 쿼리 키 상수화 (naming, readability)
```ts
export const SETTINGS_QUERY_KEYS = {
  USER_PROFILE: ["user-profile"],
  CONNECTED_REPOSITORIES: ["connected-repositories"],
} as const;
```

### I-9. `staleTime` 매직 넘버 (readability)
`1000 * 60 * 5` → `PROFILE_STALE_TIME_MS`, `1000 * 60 * 2` → `REPOSITORIES_STALE_TIME_MS`.

### I-10. `repository-list.tsx` 254줄 분리 (readability)
각 저장소 행 + AlertDialog를 `ui/parts/repository-item.tsx`로 추출.

### I-11. 저장소 삭제 로직 module/repository로 이동 (coupling)
`deleteWebhook`, `decrementRepositoryCount` 호출을 `module/repository/actions/`로 위임. settings 액션은 repository 액션 호출만 수행.

**⚠️ `disconnectAllRepositories` 배치 로직 주의**: 현재 `deleteMany` + `upsert(count:0)` 배치 처리. 개별 `disconnectRepository`를 루프 호출하면 N번 DB 쿼리 발생. 배치 전용 함수(`disconnectAllRepositoriesInternal`)를 repository 모듈에 별도 생성하여 배치 로직 유지.

### I-12. `profile-form.tsx` import 경로 불일치 (coupling)
actions는 절대경로(`@/module/settings/actions`), constants는 상대경로(`../../constants`). 모듈 내부는 상대경로로 통일.

### I-13. naming-conventions 누락 항목 추가
`docs/conventions/naming-conventions.md`에 server action naming 가이드가 있으므로 해당 컨벤션 문서에 `naming-conventions` 항목 추가.

---

## Nice-to-Have

- **N-1.** `disconnectMutation.onSuccess`에서 불필요한 `setDisconnectAllOpen(false)` 제거
- **N-2.** `disconnectAllRepositories` → `disconnectRepositories` 간결화
- **N-3.** `getUserLanguageByUserId` → `getUserLanguage` 간결화
- **N-4.** `repository-list.tsx` parts가 배럴 import → 상대 경로로 변경
- **N-5.** `profile-form.tsx` 반복 `setFormState` 패턴 → `updateField` 헬퍼 추출
- **N-6.** Card className 반복 → 공통 상수 또는 래퍼
- ~~**N-7.** `deleteRepository` 내 독립 작업 `Promise.all` 병렬화~~ → **삭제**: 순서 의존적 작업 (webhook→DB→count). 병렬화 시 부분 실패로 고아 webhook/카운트 불일치 발생

---

## 수정 대상 파일

| 파일 | 변경 유형 |
|------|----------|
| `module/settings/actions/index.ts` | 에러 처리 통일, 반환 타입, 네이밍, Zod 검증 |
| `module/settings/ui/parts/profile-form.tsx` | 훅 추출, 매직 넘버, import 경로 |
| `module/settings/ui/parts/repository-list.tsx` | 훅 추출, 데드 코드 제거, 컴포넌트 분리 |
| `module/settings/hooks/use-user-profile.ts` | **신규** |
| `module/settings/hooks/use-connected-repositories.ts` | **신규** |
| `module/settings/types/index.ts` | **신규** |
| `module/settings/ui/parts/repository-item.tsx` | **신규** |
| `module/settings/constants/index.ts` | 쿼리 키 상수 추가 |
| `module/settings/index.ts` | constants re-export |
| `module/repository/actions/index.ts` | 저장소 삭제 로직 수용 |
| `module/ai/actions/review-pull-request.ts` | 반환 타입 변경 대응 |
| `module/ai/actions/generate-pr-summary.ts` | 반환 타입 변경 대응 |
| `inngest/functions/summary.ts` | I-7: import 경로 `@/module/settings/constants` → `@/module/settings` |
| `inngest/functions/review.ts` | I-7: import 경로 `@/module/settings/constants` → `@/module/settings` |
| `shared/constants/index.ts` | I-7: import 경로 `@/module/settings/constants` → `@/module/settings` |
| `module/github/lib/github-markdown.ts` | I-7: import 경로 `@/module/settings/constants` → `@/module/settings` |
| `package.json` | 변경 불필요 (`zod` `^4.3.6` 이미 설치됨) |

## 검증

1. `npx tsc --noEmit` — 타입 에러 없음
2. `npm run lint` — lint 통과
3. `npm run build` — 빌드 성공
4. Settings 페이지에서 프로필 수정, 저장소 연결 해제 수동 테스트
