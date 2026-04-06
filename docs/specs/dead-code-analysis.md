# Dead Code 분석 및 정리 명세

> **Status**: `TODO`  
> **Created**: 2026-04-06  
> **분석 기준일**: 2026-04-06 (develop 브랜치)

---

## 요약

프로젝트 전체 코드베이스를 대상으로 미사용 의존성, Dead 모델, Dead CSS, 불필요 export, Dead 환경변수를 분석했다. 총 **11건**의 dead code를 식별했으며, 번들 크기 감소(의존성 4건)와 스키마 정리(Test 모델 1건)가 가장 높은 우선순위다.

### 요약 테이블

| ID | 카테고리 | 대상 | 위치 | 우선순위 | 위험도 |
|----|----------|------|------|----------|--------|
| DC-1 | 미사용 의존성 | `or` | `package.json:40` | HIGH | 낮음 |
| DC-2 | 미사용 의존성 | `recharts` | `package.json:49` | HIGH | 낮음 |
| DC-3 | 미사용 의존성 | `lucide` | `package.json:35` | HIGH | 낮음 |
| DC-4 | 미사용 의존성 | `tsx` (npm 패키지) | `package.json:53` | MEDIUM | 낮음 |
| DC-5 | Dead 모델 | `Test` | `prisma/schema.prisma:11-14` | HIGH | 중간 |
| DC-6 | Dead CSS | `gridSlide` + `.animate-grid-slide` | `app/globals.css` | LOW | 낮음 |
| DC-7 | Dead CSS | `float-slow` + `.animate-float-slow` | `app/globals.css` | LOW | 낮음 |
| DC-8 | Dead CSS | `shimmer` + `.animate-shimmer` | `app/globals.css` | LOW | 낮음 |
| DC-9 | 불필요 export | `codeSuggestionSchema` | `module/ai/lib/review-schema.ts:16` | LOW | 낮음 |
| DC-10 | 불필요 export | `getSectionPolicy` barrel | `module/ai/index.ts:17` | LOW | 낮음 |
| DC-11 | Dead 환경변수 | `NEXT_PUBLIC_APP_LOCALHOST_URL` | `.env:12` | LOW | 낮음 |

---

## 삭제 금지 항목

분석 과정에서 dead code로 오인할 수 있으나 **실제로는 사용 중**인 항목. 절대 삭제하지 않는다.

| 항목 | 이유 |
|------|------|
| `dotenv` (package.json) | `prisma.config.ts:3`에서 `import "dotenv/config"` 사용 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `@ai-sdk/google` SDK가 환경변수를 자동 읽기 |
| `cn()` (lib/utils.ts) | badge, alert, select, button 등 10+ UI 컴포넌트에서 사용 |
| `getUserLanguageByUserId` | `module/ai/actions/review-pull-request.ts`, `generate-pr-summary.ts`에서 사용 |
| `@polar-sh/*` 관련 코드 전체 | 기획 중인 결제 기능. 절대 삭제 금지 |
| `animate-float`, `animate-float-delayed` | `login-ui.tsx`, `app-sidebar.tsx`에서 사용 |
| `animate-fade-in`, `animate-pulse-slow` | `login-features.tsx`, `app-sidebar.tsx`에서 사용 |

---

## 카테고리 1: 미사용 의존성

### DC-1. `or` (^0.2.0)

- **우선순위**: HIGH
- **위치**: `package.json:40`
- **근거**: 소스 코드 전체에서 `from 'or'` / `require('or')` 검색 결과 0건
- **조치**: `package.json`에서 삭제 후 `npm install`

### DC-2. `recharts` (^3.6.0)

- **우선순위**: HIGH
- **위치**: `package.json:49`
- **근거**: `from 'recharts'` 검색 결과 0건. 소스 코드에서 직접 import하는 곳 없음
- **조치**: `package.json`에서 삭제 후 `npm install`
- **참고**: `recharts`는 `@polar-sh/better-auth` → `@polar-sh/checkout` → `@polar-sh/ui`의 transitive dependency로 남아 있음. `package.json`에서 직접 의존성을 제거해도 npm이 transitive로 자동 설치하므로 빌드에 영향 없음

### DC-3. `lucide` (^0.561.0)

- **우선순위**: HIGH
- **위치**: `package.json:35`
- **근거**: `from 'lucide'` 검색 결과 0건. 실제 사용은 `lucide-react`(26개 파일에서 import)
- **조치**: `package.json`에서 `lucide` 삭제 후 `npm install`. `lucide-react`는 유지

### DC-4. `tsx` npm 패키지 (^4.21.0)

> `.tsx` 파일 확장자가 아닌, TypeScript 파일을 직접 실행하는 CLI 도구 패키지다.

- **우선순위**: MEDIUM
- **위치**: `package.json:53`
- **근거**: 소스 코드에서 import 0건, npm scripts에서 사용 0건. Prisma 7.x는 `jiti`(c12 경유)로 `.ts` 설정 파일을 로드하므로 `tsx` 패키지 불필요
- **조치**: `package.json`에서 삭제 후 `npm install`
- **주의**: 삭제 후 `npx prisma generate` 정상 동작 확인 필수

---

## 카테고리 2: Dead Prisma 모델

### DC-5. `Test` 모델

- **우선순위**: HIGH
- **위치**: `prisma/schema.prisma:11-14`
- **현재 코드**:
  ```prisma
  model Test {
    id   String @id @default(cuid())
    name String
  }
  ```
- **근거**: `prisma.test.` 검색 결과 0건 (auto-generated 타입 파일 제외). CLAUDE.md에도 "Example model (can be removed in production)" 명시
- **조치**:
  1. production/staging DB에서 `SELECT COUNT(*) FROM "Test"` 실행하여 데이터 존재 여부 확인
  2. `prisma/schema.prisma`에서 모델 삭제
  3. `npx prisma migrate dev --name remove-test-model`
  4. `npx prisma generate`
- **주의**: DB 마이그레이션 필요. `prisma migrate deploy`는 `DROP TABLE "Test"`를 실행하므로 데이터 복구 불가. production 배포 전 반드시 데이터 존재 여부 확인 필수

---

## 카테고리 3: Dead CSS

### DC-6. `@keyframes gridSlide` + `.animate-grid-slide`

- **우선순위**: LOW
- **위치**: `app/globals.css:167-174` (keyframes), `app/globals.css:232-234` (class)
- **근거**: `animate-grid-slide` 검색 결과 0건 (모든 `.tsx`, `.ts` 파일 대상)
- **조치**: 해당 keyframes 정의 + 클래스 정의 삭제

### DC-7. `@keyframes float-slow` + `.animate-float-slow`

- **우선순위**: LOW
- **위치**: `app/globals.css:194-201` (keyframes), `app/globals.css:244-246` (class)
- **근거**: `animate-float-slow` 검색 결과 0건
- **조치**: 해당 keyframes 정의 + 클래스 정의 삭제

### DC-8. `@keyframes shimmer` + `.animate-shimmer`

- **우선순위**: LOW
- **위치**: `app/globals.css:223-230` (keyframes), `app/globals.css:257-259` (class)
- **근거**: `animate-shimmer` 검색 결과 0건
- **조치**: 해당 keyframes 정의 + 클래스 정의 삭제

---

## 카테고리 4: 불필요 Export

### DC-9. `codeSuggestionSchema` export 키워드

- **우선순위**: LOW
- **위치**: `module/ai/lib/review-schema.ts:16`
- **근거**: 동일 파일 내(line 48, `structuredReviewSchema`)에서만 사용. 외부 파일에서 import 0건
- **조치**: `export const codeSuggestionSchema` → `const codeSuggestionSchema`로 변경
- **참고**: 기능 영향 없음. 모듈 public API 축소 효과

### DC-10. `getSectionPolicy` barrel export

- **우선순위**: LOW
- **위치**: `module/ai/index.ts:17`, `module/ai/lib/index.ts`
- **근거**: 실제 사용은 `module/ai/lib/review-prompt.ts`(동일 모듈 내부)에서만. 외부 모듈에서 import 0건
- **조치**:
  1. `module/ai/index.ts`에서 `getSectionPolicy` 제거
  2. `module/ai/lib/index.ts`에서도 export 제거
- **참고**: 내부 import 경로(`./review-size-policy`)는 유지. `review-prompt.ts`의 import문은 변경 불필요

---

## 카테고리 5: Dead 환경변수

### DC-11. `NEXT_PUBLIC_APP_LOCALHOST_URL`

- **우선순위**: LOW
- **위치**: `.env:12`
- **근거**: 소스 코드에서 `NEXT_PUBLIC_APP_LOCALHOST_URL` 검색 결과 0건
- **조치**: `.env` 파일에서 해당 줄 삭제
- **참고**: Vercel 환경변수에도 설정되어 있다면 함께 삭제

---

## 실행 계획

### Phase 1: 의존성 정리 (HIGH)

1. `package.json`에서 DC-1~DC-4 패키지 4개 삭제
2. `npm install` 실행
3. `npm run build` 성공 확인

### Phase 2: DB 모델 정리 (HIGH)

1. DC-5: `Test` 모델 삭제 + migration 생성
2. `npx prisma generate` 실행
3. 로컬 dev 서버 정상 동작 확인

### Phase 3: CSS + Export + Env 정리 (LOW)

1. DC-6~DC-8: `globals.css`에서 3개 keyframes + 3개 animation class 삭제
2. DC-9: `codeSuggestionSchema`의 `export` 키워드 제거
3. DC-10: barrel export에서 `getSectionPolicy` 제거
4. DC-11: `.env.local`에서 미사용 변수 삭제

### 검증 체크리스트

- [ ] `npm run build` 성공
- [ ] `npx prisma generate` 성공
- [ ] `npx prisma migrate dev` 성공 (DC-5 적용 시)
- [ ] 로컬 dev 서버 정상 동작
- [ ] 로그인 페이지 CSS 애니메이션 정상 렌더링
