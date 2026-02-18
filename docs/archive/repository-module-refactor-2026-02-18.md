# Repository 모듈 리팩토링 명세 (2026-02-18)
> Status: Implemented
> Scope: `module/repository`
> Authoring Date: 2026-02-18
> Completed Date: 2026-02-18

## 목적

`module/repository`의 가독성, 아키텍처 정합성, 최신 프론트엔드 관행 적합성, 응집도/결합도를 개선한다.

## 구현 결과 요약

요청된 Phase 1~4를 모두 반영했다.

- Phase 1: 타입 경계 강화, DTO 매핑 도입, 공유 에러 유틸 추출
- Phase 2: 모듈 내부 self-barrel import 제거, `ui/parts` public export 제거, 서버 액션 선언 패턴 통일
- Phase 3: 연결 플로우 멱등/트랜잭션/보상 처리 반영, `alert` -> `toast` 전환
- Phase 4: UI 책임 분리(카드/검색/무한스크롤 감지)

## Phase별 완료 내역

### Phase 1 완료

- GitHub DTO 및 도메인 타입 분리
  - `module/repository/types/index.ts`
- 타입 가드 + DTO -> 도메인 매핑 추가
  - `module/repository/lib/map-github-repository.ts`
- `any` 제거 및 매핑 적용
  - `module/repository/actions/index.ts`
- 공유 에러 메시지 유틸 추출
  - `lib/utils.ts`
- settings 모듈에서 공용 유틸 재사용
  - `module/settings/ui/parts/repository-list.tsx`

### Phase 2 완료

- 모듈 내부 self-barrel import 제거
  - `module/repository/hooks/use-repositories.ts`
  - `module/repository/hooks/use-connect-repository.ts`
  - `module/repository/ui/repository-list.tsx`
- `ui/parts` public export 제거
  - `module/repository/index.ts`
- 서버 액션 선언 통일
  - `module/repository/actions/index.ts` (`export async function`)

### Phase 3 완료

- `connectRepository` 멱등 처리 추가 (`already_connected`)
  - `module/repository/actions/index.ts`
- `repository.create + incrementRepositoryCount` 트랜잭션 처리
  - `module/repository/actions/index.ts`
  - `module/payment/lib/subscription.ts`
- DB 실패 시 webhook 보상 처리(best-effort) 반영
  - `module/repository/actions/index.ts`
- non-critical Inngest 큐잉 실패 의도 문서화
  - `module/repository/actions/index.ts`
- `alert` -> `toast` 전환 및 공용 에러 메시지 적용
  - `module/repository/hooks/use-connect-repository.ts`

### Phase 4 완료

- 무한 스크롤 감지 훅 분리
  - `module/repository/hooks/use-infinite-scroll-trigger.ts`
- 검색 입력 컴포넌트 분리
  - `module/repository/ui/parts/repository-search-input.tsx`
- 저장소 카드 컴포넌트 분리
  - `module/repository/ui/parts/repository-card.tsx`
- 메인 리스트 컴포넌트 책임 축소
  - `module/repository/ui/repository-list.tsx`

## 완료 기준 충족 여부

- [x] `module/repository` 내 `any` 제거
- [x] 모듈 내부 self-barrel import 0건
- [x] `ui/parts` public export 0건
- [x] Connect 플로우 멱등/실패 처리 정책 반영
- [x] 사용자 피드백 UI `toast` 일관화

## 검증 결과

실행일: 2026-02-18

- 통과: `npx.cmd eslint module/repository`
- 통과: `npx.cmd tsc --noEmit`
- 실패(기존 이슈): `npm.cmd run lint`
  - 실패 원인은 repository 모듈 외 기존 파일들(`components/layouts/app-sidebar/*`, `module/github/lib/github.ts` 등)의 선행 lint 오류

## 영향 범위

- 외부 소비자(`app/dashboard/repository/page.tsx`)의 `RepositoryList` 사용 방식은 유지됨
- repository 모듈 내부 구조 개선 위주 변경으로 blast radius는 낮음

## 비고

- 본 문서는 구현 완료 상태로 갱신되었으며, `docs/archive/`로 아카이브 대상이다.
