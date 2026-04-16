# Documentation Index

프로젝트 문서 인덱스. Claude Code, Codex는 작업 전 관련 문서를 확인할 것.

---

## 📋 Conventions (must follow)

코드 작성 시 반드시 따라야 할 규칙:

| 문서 | 설명 |
|------|------|
| `conventions/component-parts.md` | 컴포넌트 parts/ 패턴 |
| `conventions/component-props.md` | 컴포넌트 Props 설계 규칙 |
| `conventions/file-naming.md` | 파일 네이밍 규칙 |
| `conventions/folder-structure.md` | 컴포넌트 폴더 구조 |
| `conventions/writing-docs.md` | 문서 작성 가이드 |
| `conventions/type-guard-over-assertion.md` | 타입 가드 사용 규칙 |
| `conventions/query-boundary.md` | QueryBoundary 사용 규칙 |
---

## 📝 Specs (to implement)

구현 예정/진행 중인 기능 명세:

| 문서 | 상태 | 설명 |
|------|------|------|
| `specs/settings-module-refactoring-feature.md` | `TODO` | Settings 모듈 리팩토링 (7개 스킬 기준) |
| `specs/ai-module-refactoring.md` | `TODO` | AI 모듈 리팩토링 명세 |
| `specs/structured-inline-review-feature.md` | `TODO` | 구조화 인라인 리뷰 (원클릭 수정 + 라인별 코멘트 통합) |
| `specs/one-click-fix-feature.md` | `SUPERSEDED` | → `structured-inline-review-feature.md`에 통합 |
| `specs/inline-line-level-review.md` | `SUPERSEDED` | → `structured-inline-review-feature.md`에 통합 |
| `specs/auto-pr-description.md` | `TODO` | PR 설명 자동 생성 |
| `specs/review-analytics-dashboard.md` | `TODO` | 리뷰 분석 대시보드 |
| `specs/adaptive-learning-feedback.md` | `TODO` | 사용자 피드백 기반 적응형 학습 |
| `specs/pr-risk-scoring.md` | `TODO` | PR 리스크 점수 및 리뷰 깊이 자동 조절 |
| `specs/competitive-feature-adoption.md` | `APPROVED` | 경쟁사 분석 기반 차별화 전략: Learning Engine (학습 피드백 루프 + 품질 벤치마킹 대시보드) |
| `specs/merge-adjacent-suggestions.md` | `TODO` | Review output 개선 (프롬프트 수정 + issues 구조화 + suggestion 개수 설정) |
| `specs/suggestion-ui-improvement-feature.md` | `TODO` | Suggestion 카드 UI 개선 (시각적 계층, 코드 하이라이팅, 파일 그룹핑) |
| `specs/review-summary-walkthrough-improvement-feature.md` | `TODO` | 요약/변경 사항 상세 구조화 (리스크 배지, 파일별 walkthrough, 가독성 개선) |
| `specs/walkthrough-table-encoding-fix.md` | `TODO` | 변경 사항 상세 테이블 컬럼 폭 붕괴 + 한글 파일명 mojibake 수정 |
| `specs/growth-archive-repeat-mistake-detection-feature.md` | `APPROVED` | 1인 개발자 타겟 wedge. 카테고리 태깅 + 반복 실수 감지 (Pre-build gate 인터뷰 5명 필수) |

---

## 📚 Archive (reference only)

완료된 분석/리뷰 문서 (참고용):

| 문서 | 날짜 | 설명 |
|------|------|------|
| `archive/2026-02-auth-module-refactoring.md` | 2026-02 | auth 모듈 리팩토링 구현 기록 |
| `archive/2026-02-dashboard-refactoring-feature.md` | 2026-02 | dashboard 모듈 리팩토링 구현 기록 |
| `archive/2026-02-pr-summary-feature.md` | 2026-02 | PR 요약 기능 구현 기록 |
| `archive/2026-02-review-language-feature.md` | 2026-02 | PR 리뷰 언어 설정 기능 구현 기록 |
| `archive/2026-02-remove-rag-from-summary.md` | 2026-02 | Summary 경로 RAG 제거 구현 기록 |
| `archive/2024-12-folder-structure-review.md` | 2024-12 | 폴더 구조 리뷰 |
| `archive/2024-12-frontend-review.md` | 2024-12 | 프론트엔드 구조 리뷰 |
| `archive/2024-12-refactoring-recommendations.md` | 2024-12 | 리팩토링 권장사항 |

---

## For Claude Code

### 기능 구현 시
1. `conventions/` 확인 → 코딩 표준 준수
2. `specs/` 확인 → 구현 명세 참조
3. `archive/` → 참고용, 규칙 아님

### 문서 추가 시

#### 1. 폴더 선택
| 유형 | 폴더 | 기준 |
|------|------|------|
| 코딩 규칙 | `conventions/` | 코드 작성 시 반드시 따라야 할 규칙 |
| 구현 명세 | `specs/` | 구현 예정/진행 중인 기능 설계 + 구체적 코드 변경 포함 |
| 분석/리뷰 | `archive/` | 완료된 분석, 일회성 리뷰 결과 |

#### 2. 파일명 규칙
- **형식**: `kebab-case.md`
- **conventions/**: `[주제].md` (예: `component-parts.md`)
- **specs/**: `[기능명]-feature.md` (예: `pr-summary-feature.md`)
- **archive/**: `YYYY-MM-[주제].md` (예: `2024-12-refactoring-recommendations.md`)

#### 3. 필수 작업
1. 적절한 폴더에 파일 생성
2. **이 README.md 테이블에 항목 추가**
3. `conventions/writing-docs.md` 규칙 준수 (200줄 이내)

#### 4. 내용 작성 규칙
`conventions/writing-docs.md` 참조:
- 길이보다 복잡도 관리 — 섹션별 역할과 메시지가 단순하면 길어도 OK
- 구조: 규칙 → 예시 1개 → (선택) 안티패턴 1개
- 불필요한 설명, 중복 예시 금지

#### 5. Specs 작성 규칙
- 배경/설계 결정 + **구체적 코드 변경**까지 포함
- 수정 대상 파일별로 현재 코드 → 변경 후 코드를 명시
- 구현자가 스펙만 보고 바로 코딩 가능한 수준으로 작성
