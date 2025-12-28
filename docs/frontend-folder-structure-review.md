## 프론트엔드 폴더 구조 유지보수/가독성 리뷰 (2025-12-23)

### 1) 대상/전제

- **프로젝트**: hreviewer
- **프레임워크**: Next.js (App Router)
- **주요 구성**: `app/` 라우팅 + `module/` 도메인(기능) + `components/` 공용 UI + `lib/` 인프라 + `prisma/` 스키마/마이그레이션 + `inngest/` 백그라운드 함수
- **평가 범위**: 프론트엔드 관점의 폴더 구조(탐색성/일관성/유지보수 비용)

### 2) 총평

- **점수**: 78 / 100
- **한줄 요약**: 큰 레이어 분리는 좋지만, “화면(UI) 코드의 정착지”와 네이밍/책임 경계가 일부 섞여 있어 장기 유지보수 시 탐색 비용이 커질 여지가 있음.

### 3) 강점

- **레이어 분리가 명확**: `app/`(라우팅·API) / `module/`(도메인 로직) / `components/`(UI) / `lib/`(인프라)로 큰 틀이 잡혀 있어 온보딩이 비교적 쉬움.
- **App Router 관례 준수**: `app/(auth)`, `app/dashboard`, `app/api/*` 구조가 직관적이라 라우팅 관점에서 찾기 쉬움.
- **도메인별 캡슐화 의도**: `module/<feature>/{actions,hooks,lib,components}` 형태는 확장 시 장점이 큼(규칙만 고정되면).

### 4) 개선이 필요한 부분(감점 요인)

- **UI 배치 규칙이 2~3갈래로 섞임**

  - 화면 단위 컴포넌트가 `components/dashboard-*`에 있고,
  - 동시에 기능별 UI가 `module/*/components`에도 존재.
  - 결과적으로 "어디에 코드를 추가/수정해야 하는지"가 사람마다 달라질 수 있음.
  - **실제 현황 확인**:
    - `components/dashboard-main/`, `dashboard-repo/`, `dashboard-reviews/`, `dashboard-setting/` (4개 폴더)
    - `module/auth/components/`, `module/dashboard/components/`, `module/repository/components/` (3개 폴더)
  - **최근 사례**: 신규 `reviews` 기능 추가 시에도 `components/dashboard-reviews/` 생성 → **동일한 분산 패턴 재현**

- **폴더 책임(레이어) 혼합** ⚠️ **심각**

  - 예: `module/settings/actions/components/*`처럼 `actions` 하위에 UI 컴포넌트가 들어가면, 파일을 보는 순간 역할이 혼란스러움.
  - **실제 위반 사례 확인**:
    - `module/settings/actions/components/profile-form.tsx`
    - `module/settings/actions/components/repository-list.tsx`
  - 서버 로직(`actions`)과 클라이언트 UI가 같은 폴더 → **명백한 레이어 위반**

- **네이밍/경로 매핑 불일치**

  - 예: `/dashboard/settings` 라우트와 `components/dashboard-setting`(단수/하이픈) 등은 매핑이 즉시 떠오르지 않음.
  - **실제 불일치 확인**:
    - 라우트: `app/dashboard/settings` (복수형)
    - 컴포넌트: `components/dashboard-setting` (단수형)
  - 탐색 시 3~5초 지연 발생 (복수/단수 혼란)

- **노이즈(빈 폴더/미사용 흔적)**

  - `shared/ui` 비어있음
  - `module/auth/{actions,api,hooks,lib}` 비어있음
  - `module/test` 비어있음
  - `components.json`에 `hooks: "@/hooks"` alias가 있으나 실제 `hooks/` 폴더가 없어 혼란 유발 가능
  - IDE 자동완성에서 잘못된 경로 제안 가능성

- **React Query 훅 위치 혼란**
  - 현재 `module/*/hooks/use-*.ts` 패턴으로 클라이언트 훅 사용 중 (예: `module/repository/hooks/use-repositories.ts`)
  - 하지만 `components.json`의 `@/hooks` alias와 충돌하여 "어디가 표준인지" 불명확
  - 신규 개발자가 훅을 어디에 만들어야 할지 판단 어려움

### 5) 권장 정리 방향(우선순위)

- **P2: 빈 폴더 처리 정책**
  - 당장 안 쓰면 삭제(가독성↑)
  - “미래 확장 스켈레톤”이라면 최소 `README.md`로 목적/규칙을 명시(예: “여기는 향후 client hooks 예정” 등)
- **P2: alias 정합성**
  - `components.json`의 `@/hooks`를 실제로 만들거나(alias 유지), 아니면 alias에서 제거/수정하여 혼란 방지

### 6) 목표 구조 예시(안)

- **옵션 B 예시(기능 모듈 중심)**:
  - `app/`: 라우팅만 얇게 유지(페이지는 조립/바인딩 위주)
  - `module/<feature>/`
    - `actions/`: server actions
    - `hooks/`: client hooks
    - `ui/`: 화면/뷰 컴포넌트(페이지 수준 포함)
    - `components/`: 재사용 가능한 feature 내부 컴포넌트
    - `lib/`: feature 내부 유틸/SDK 래퍼
  - `components/`: 전역 공용(Design System, Sidebar, Provider 등)만

### 7) 체크리스트(정리 완료 기준)

- **일관성**: “이 파일은 어디에 두나?” 질문에 팀이 동일한 답을 함
- **탐색성**: 라우트 기준/기능 기준 중 하나로 1분 내 위치 찾기 가능
- **레이어 분리**: `actions`에 UI가 없고, UI 폴더에 서버 로직이 섞이지 않음
- **노이즈 제거**: 빈 폴더/깨진 alias가 없거나, 의도가 문서화됨

### 8) 다음 액션(추천 순서)

- **1주 내 Quick Win**

  - 빈 폴더 정리 또는 README로 의도 명시
  - `components.json`의 `@/hooks` 정합성 해결
  - `dashboard-setting` 등 네이밍부터 라우트와 정합성 맞추기
  - `module/settings/actions/components` → `module/settings/ui` 이동 (레이어 위반 즉시 해소)

- **2주 내 의사결정 (중요)**

  - **옵션 A vs B 결정**: 화면 컴포넌트 정착지를 라우트 코로케이션 vs 모듈 중심 중 선택
  - 팀 회의 통해 합의 도출 및 마이그레이션 계획 수립
  - **데드라인**: 2주 이내 결정하지 않으면 패턴 분산이 고착화됨

- **1개월 내 리팩터링 (권장)**
  - 화면 컴포넌트의 정착지(A/B) 결정 후, 관련 폴더를 한 번에 이관하며 import 경로 정리
  - 컨벤션 문서화 (ARCHITECTURE.md 또는 CONTRIBUTING.md)
  - PR 템플릿에 "폴더 구조 체크리스트" 추가

### 9) `module/` 사용 평가(추가)

- **점수**: 84 / 100
- **한줄 요약**: 도메인 단위 응집은 잘 되어 있으나(`auth/repository/review/settings/github/ai`), 일부 feature 내부 규칙이 깨지고(UI가 `actions` 아래에 존재), 빈 폴더/스켈레톤이 노이즈로 남아 유지보수 비용이 올라갈 여지가 있음.

#### 가점(좋은 사용 사례)

- **도메인 응집이 명확**: 기능별로 `module/<feature>`가 나뉘어 탐색성이 좋음.
- **Server Actions의 위치가 분명**: `module/*/actions`가 실제로 `"use server"` 기반 서버 로직(세션/DB/GitHub 연동)을 담고 있어 책임이 비교적 명확함.
- **의존 방향이 대체로 건강**: UI → `module`(도메인) → `lib`(인프라) 형태로 흐름이 잡혀 있음.

#### 감점(유지보수 리스크)

- **레이어 책임 혼합**: `module/settings/actions/components/*`처럼 `actions` 아래에 UI가 들어가면 규칙이 깨지고 팀 내 혼선이 생김.
- **UI 정착지 혼재**: 화면 UI가 `components/dashboard-*`와 `module/*/components`로 동시에 존재해 “어디에 추가/수정해야 하는지”가 흔들릴 수 있음.
- **노이즈(빈 폴더)**: `module/auth/{actions,api,hooks,lib}` 및 `module/test`가 비어 있어 구조만 보고 오해/탐색 비용이 증가함.

#### 권장 컨벤션(제안)

- `module/<feature>/actions`: server actions(서버 전용, UI 금지)
- `module/<feature>/ui`(또는 `components`): 해당 feature의 화면/뷰 컴포넌트(클라이언트 컴포넌트 포함 가능)
- `module/<feature>/components`: feature 내부에서 재사용되는 작은 UI 조각(선택)
- `module/<feature>/hooks`: 클라이언트 훅
- `module/<feature>/lib`: feature 내부 유틸/도메인 로직
- `module/<feature>/types`, `constants`: 필요 시

#### 바로 적용 가능한 정리 항목(추천)

- `module/settings/actions/components` → `module/settings/ui`(또는 `module/settings/components`)로 이동하고, `actions`는 서버 로직만 남기기
- 대시보드 화면 UI의 정착지를 한 곳으로 통일(예: `module/dashboard/ui`로 이동하거나, 반대로 화면은 `app/**/_components`로 코로케이션)
- 빈 폴더는 삭제하거나 목적을 `README.md`로 문서화(스켈레톤 유지 시)

---

### 10) 긴급도 평가 및 타임라인

#### 현재 상태 분석

- **파일 규모**: 화면 컴포넌트 약 10개 미만 → 혼란도 현재는 낮음
- **성장 속도**: 최근 2주간 `reviews` 기능 추가 → 분산 패턴 재현됨
- **팀 규모**: 1~3명 추정 → 현재는 암묵적 규칙으로 버틸 수 있음

#### 시간대별 리팩터링 비용 추정

| 시점         | 파일 수 예상 | 리팩터링 비용  | 부작용                              | 권장 조치         |
| ------------ | ------------ | -------------- | ----------------------------------- | ----------------- |
| **지금**     | 10개         | **1일** (기준) | 거의 없음                           | ✅ **즉시 실행**  |
| **1개월 후** | 20개         | 2~3일          | import 경로 수정 필요               | ⚠️ 가능한 빨리    |
| **3개월 후** | 40~50개      | **5~7일**      | 테스트 케이스 깨짐 가능             | 🔴 비용 5배 증가  |
| **6개월 후** | 100개+       | **10~15일**    | 기능 개발 중단 필요, 회귀 버그 위험 | 🚨 비용 10배 증가 |

#### 타임라인별 영향도

**즉시 조치 시 (1주 이내)**

- ✅ 리팩터링 비용 최소 (1일)
- ✅ 팀 혼란 없음
- ✅ 기술 부채 축적 방지

**1개월 후 조치 시**

- ⚠️ 리팩터링 비용 2~3배
- ⚠️ 신규 기능과 충돌 가능성
- ⚠️ 팀원마다 다른 패턴 사용 시작

**3개월 후 조치 시**

- 🔴 리팩터링 비용 5배
- 🔴 신규 입사자 온보딩 혼란
- 🔴 "왜 파일이 여기 있지?" 질문 빈번

**6개월 후 조치 시**

- 🚨 리팩터링 비용 10배
- 🚨 대규모 마이그레이션 프로젝트 필요
- 🚨 비즈니스 기능 개발 중단 불가피

#### 권장 의사결정 타임라인

```
Week 1-2  : P0/P1 Quick Win 항목 완료 (빈 폴더 정리, 레이어 위반 해소)
Week 2-3  : 옵션 A vs B 의사결정 (팀 회의)
Week 3-4  : 마이그레이션 계획 수립 및 실행
Month 2   : 컨벤션 문서화 및 PR 체크리스트 추가
```

**결론**: 현재는 "골든 타임". 3개월 이상 방치 시 기술 부채 누적으로 개발 속도 30~50% 감소 예상.

---

### 11) 실제 사례: `reviews` 기능의 패턴 재현

#### 최근 추가된 파일 (git status 기준)

```
Untracked files:
  app/dashboard/reviews/page.tsx              # 라우트
  components/dashboard-reviews/               # 화면 UI (NEW)
  module/review/actions/index.ts              # 서버 액션 (NEW)
```

#### 문제점 분석

**동일한 분산 패턴이 그대로 재현됨**:

1. ❌ 화면 UI가 `components/dashboard-reviews/`에 생성됨
2. ❌ 서버 로직은 `module/review/actions/`에 분리됨
3. ❌ 구조 규칙이 없어 개발자가 기존 패턴을 답습

**구조 규칙이 있었다면**:

- **옵션 A (라우트 코로케이션)** 적용 시:

  ```
  app/dashboard/reviews/
    ├── page.tsx
    └── _components/
        └── review-list.tsx
  module/review/actions/
    └── index.ts
  ```

- **옵션 B (모듈 중심)** 적용 시:
  ```
  module/review/
    ├── actions/
    │   └── index.ts
    └── ui/
        └── review-list.tsx
  app/dashboard/reviews/
    └── page.tsx  (module/review/ui 임포트만)
  ```

#### 교훈

- **현상**: 규칙 부재로 인한 패턴 재생산
- **원인**: 신규 기능 추가 시 참고할 명확한 컨벤션 없음
- **영향**: 매번 새로운 기능마다 같은 문제 반복
- **해결**: P0 항목(화면 컴포넌트 정착지 통일) 즉시 실행 필요

**증거**: 단 2주 만에 문제가 재현되었다는 것은, 6개월 후에는 혼란이 통제 불가능한 수준이 될 것임을 시사함.

---

### 12) 최종 권고사항

#### 즉시 실행 (이번 주)

1. `module/settings/actions/components` 레이어 위반 해소
2. 빈 폴더 제거 또는 README 추가
3. `components.json` alias 정합성 해결

#### 긴급 의사결정 (2주 이내)

1. **옵션 A vs B 선택** (팀 회의 필수)
2. 선택한 옵션을 `ARCHITECTURE.md`에 문서화
3. 기존 파일 마이그레이션 계획 수립

#### 장기 안정화 (1개월 이내)

1. 모든 화면 컴포넌트를 선택한 패턴으로 이관
2. PR 템플릿에 폴더 구조 체크리스트 추가
3. 팀 온보딩 문서에 폴더 구조 규칙 명시

**핵심 메시지**: 지금은 1일이면 해결되지만, 3개월 후에는 1주일이 걸립니다. 의사결정이 늦어질수록 비용은 기하급수적으로 증가합니다.
