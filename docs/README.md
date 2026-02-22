# Documentation Index

프로젝트 문서 인덱스. Claude Code, Codex는 작업 전 관련 문서를 확인할 것.

---

## 📋 Conventions (must follow)

코드 작성 시 반드시 따라야 할 규칙:

| 문서 | 설명 |
|------|------|
| `conventions/component-parts.md` | 컴포넌트 parts/ 패턴 |
| `conventions/file-naming.md` | 파일 네이밍 규칙 |
| `conventions/folder-structure.md` | 컴포넌트 폴더 구조 |
| `conventions/writing-docs.md` | 문서 작성 가이드 |
| `conventions/type-guard-over-assertion.md` | 타입 가드 사용 규칙 |
---

## 📝 Specs (to implement)

구현 예정/진행 중인 기능 명세:

| 문서 | 상태 | 설명 |
|------|------|------|
| `specs/ai-module-refactoring.md` | `TODO` | AI 모듈 리팩토링 명세 |
| `specs/one-click-fix-feature.md` | `TODO` | 원클릭 코드 수정 제안 |

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
| 구현 명세 | `specs/` | 구현 예정/진행 중인 기능 설계 |
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
- 최대 200줄, 5분 내 읽기
- 구조: 규칙 → 예시 1개 → (선택) 안티패턴 1개
- 불필요한 설명, 중복 예시 금지
