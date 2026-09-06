---
status: "completed"
stage: null
result: "pass"
report-kind: "audit"
report-size: "standard"
test-levels: ["static"]
test-tools: ["Node.js","PowerShell","Git"]
created-at: "2026-09-06"
completed-at: "2026-09-06"
last-executed-at: "2026-09-06T12:38:31.026Z"
tested-revision: "3d3b6d88f883c933147347d945a035626153ca94 + documentation migration working tree"
owners: ["user:Sangeok"]
related: ["docs/README.md"]
primary-area: "documentation/structure"
observed-environments: ["local | documentation filesystem | Windows/Node.js | Codex"]
test-summary: "pass: 문서 구조 이관 — 63개 원본 문서 보존, 54개 경로 이동, lifecycle 및 로컬 링크 검사 통과"
follow-up: []
---

# 문서 폴더 이관 기록

## Summary

`hreviewer/docs` 내부를 기준 저장소 `sangeok-docs-folder`의 7개 분류에 맞춰 재구성했다. 기준 저장소 자체와 제품 구현은 변경하지 않았다.

## Scope and Criteria

- D01: 기존 63개 Markdown 문서가 모두 보존되고 54개 이동 대상에 이름 충돌·누락이 없어야 한다.
- D02: ADR, architecture, conventions, dependencies, investigations, proposals, test-reports의 분류와 active/completed metadata가 일치해야 한다.
- D03: 인라인 로컬 문서 링크가 존재하고, 이전 안내에서 사용하던 specs/archive/evaluations의 운영 지침을 새 구조로 갱신해야 한다. 역사 경로는 provenance로 보존한다.
- D04: 앞선 P0 완료 지시·미확인 검증 결과, 로컬 전용 provider 부속 자료의 bytes와 Git 비추적 상태, 기존 네 문서의 추적을 보존해야 한다.

## Target and Preconditions

이관 전 세 P0 문서에는 이전 사용자 요청의 미커밋 변경이 있었다. 이를 포함한 모든 원본 문서와 AGENTS.md·CLAUDE.md를 시스템 임시 폴더에 백업했다. 이동 전 원본 SHA-256과 destination 충돌을 전수 확인했다. 외부 서비스 자격 증명이나 모델 API는 사용하지 않았다.

## Test Matrix

| ID | 기준 | Gate | 검증 | 결과 | 증거 |
| --- | --- | --- | --- | --- | --- |
| M1 | D01 | required | 이관 manifest 63개 대상 존재, 이동 전 경로 부재, 변경 허용 범위 검사 | PASS | E1: backup manifest와 현재 파일 비교 |
| M2 | D02 | required | 분류·lifecycle metadata·완료일 검사 | PASS | E2: node scripts/check-docs.mjs, errors 0 |
| M3 | D03 | required | 상대 경로와 문서 안내 검사 | PASS | E2 및 E3: 링크 검사와 루트 안내 read-back |
| M4 | D04 | required | 기존 상태·로컬 기록·Git 추적 보존 | PASS | E4: 상태 read-back, private bytes 비교, git ls-files/check-ignore |

## Commands

| Gate | 명령 | 결과 |
| --- | --- | --- |
| required | `node scripts/check-docs.mjs` | PASS — lifecycle과 인라인 로컬 링크 errors 0 |
| required | `node --check scripts/check-docs.mjs` | PASS |
| required | `npm run lint -- scripts/check-docs.mjs` | PASS |
| required | `git diff --check` | PASS |

## Evidence Registry

| ID | 증거 | 한계 |
| --- | --- | --- |
| E1 | 아래 이동 목록, 원본 백업과 migration manifest의 63개 항목 비교 | 복사한 운영 지침·템플릿과 새 안내는 신규 문서 |
| E2 | 저장소 루트의 `node scripts/check-docs.mjs` 재실행 | 코드 블록의 가상 경로·원격 URL·제목 anchor와 제품 테스트 진위는 검사하지 않음 |
| E3 | `docs/README.md`, `AGENTS.md`, `CLAUDE.md`, 분류별 README | 과거 소스 경로·hash는 역사 기록으로 남음 |
| E4 | 기존 네 추적 문서의 새 경로, P0 completed와 보고서 result blocked, local 부속 파일 비교 | private 값·fingerprint·project ID를 보고서에 기록하지 않음 |

## Findings and Follow-up

- 이전 archive에는 TODO·초안·부분 완료 문서가 섞여 있었다. 완료 근거 없는 변경안은 pending으로 이관해 실행 전 재대조하도록 했다. 제품 완료 판정을 새로 만들지 않았다.
- conventions의 Settings 문서는 특정 리팩터링 변경안이므로 proposals/active로 옮겼다.
- `file-naming-convention.md`의 잘못된 링크 2개는 실제 `conventions/file-naming.md`로 고쳤다.
- One-Click Fix의 과거 대체 명세 `structured-inline-review-feature.md`는 이관 전부터 없었다. 원문 SUPERSEDED를 유지하고 원본 부재 메모로 표시했다.
- 커밋 준비 중 One-Click Fix의 기존 병합 충돌 3곳을 발견했다. 폐기된 명세의 두 원문안을 A·B로 구분해 보존하고 충돌 표식과 코드 블록 경계를 정리했다. 과거 문서의 trailing whitespace는 Markdown 줄바꿈 의미를 유지하는 명시적 줄바꿈으로 정리했다.
- 원문에서 알 수 없는 완료일·승인자는 null이다. 이미 완료·닫힌 역사 자료에는 `legacy-record` 예외를 적용하며 원래 제목과 설명을 보존한다.

## Data and Cleanup

Git ignore 정책을 넓히지 않았다. 최초 로컬 이관에서는 네 기존 추적 문서의 새 경로만 등록했다. 이후 사용자의 커밋·푸시·PR 요청에 따라 공개 가능한 문서·안내·템플릿·빈 폴더의 `.gitkeep`을 정확한 경로 목록으로 추적해 새 체크아웃에서도 문서 검사가 가능하도록 했다. 로컬 감사 부속 자료는 비추적으로 보존했다. 기준 저장소의 예시 proposal, Git metadata, .DS_Store는 가져오지 않았다. 비어 있는 이전 폴더와 일회성 이관 helper를 정리했다. 원본 백업은 시스템 임시 폴더에 남아 있다.

## 이동 목록

| 이전 경로 | 이관 경로 |
| --- | --- |
| `docs/archive/2024-12-folder-structure-review.md` | [docs/investigations/completed/2025-12-30-folder-structure-review.md](../../investigations/completed/2025-12-30-folder-structure-review.md) |
| `docs/archive/2024-12-frontend-review.md` | [docs/investigations/completed/2025-12-23-frontend-review.md](../../investigations/completed/2025-12-23-frontend-review.md) |
| `docs/archive/2024-12-refactoring-recommendations.md` | [docs/investigations/completed/2025-12-31-refactoring-recommendations.md](../../investigations/completed/2025-12-31-refactoring-recommendations.md) |
| `docs/archive/2026-02-ai-module-refactoring.md` | [docs/proposals/completed/2026-02-22-ai-module-refactoring.md](../../proposals/completed/2026-02-22-ai-module-refactoring.md) |
| `docs/archive/2026-02-auth-module-refactoring.md` | [docs/proposals/completed/2026-02-22-auth-module-refactoring.md](../../proposals/completed/2026-02-22-auth-module-refactoring.md) |
| `docs/archive/2026-02-dashboard-refactoring-feature.md` | [docs/proposals/completed/2026-02-22-dashboard-refactoring-feature.md](../../proposals/completed/2026-02-22-dashboard-refactoring-feature.md) |
| `docs/archive/2026-02-pr-summary-feature.md` | [docs/proposals/completed/2026-02-22-pr-summary-feature.md](../../proposals/completed/2026-02-22-pr-summary-feature.md) |
| `docs/archive/2026-02-pro-upgrade-disable-feature.md` | [docs/proposals/completed/2026-02-17-pro-upgrade-disable-feature.md](../../proposals/completed/2026-02-17-pro-upgrade-disable-feature.md) |
| `docs/archive/2026-02-remove-rag-from-summary.md` | [docs/proposals/completed/2026-02-22-remove-rag-from-summary.md](../../proposals/completed/2026-02-22-remove-rag-from-summary.md) |
| `docs/archive/2026-02-review-language-feature.md` | [docs/proposals/completed/2026-02-22-review-language-feature.md](../../proposals/completed/2026-02-22-review-language-feature.md) |
| `docs/archive/2026-02-settings-module-refactoring.md` | [docs/proposals/completed/2026-02-16-settings-module-refactoring.md](../../proposals/completed/2026-02-16-settings-module-refactoring.md) |
| `docs/archive/2026-02-settings-repository-list-loading-state-update.md` | [docs/proposals/completed/2026-02-17-settings-repository-list-loading-state-update.md](../../proposals/completed/2026-02-17-settings-repository-list-loading-state-update.md) |
| `docs/archive/2026-02-vercel-deployment-runbook.md` | [docs/architecture/2026-02-vercel-deployment-runbook.md](../../architecture/2026-02-vercel-deployment-runbook.md) |
| `docs/archive/2026-04-encoding-suggestion-false-positive-guard-feature.md` | [docs/proposals/completed/2026-04-encoding-suggestion-false-positive-guard-feature.md](../../proposals/completed/2026-04-encoding-suggestion-false-positive-guard-feature.md) |
| `docs/archive/2026-07-growth-archive-repeat-mistake-detection-feature.md` | [docs/proposals/active/2026-07-growth-archive-repeat-mistake-detection-feature.md](../../proposals/active/2026-07-growth-archive-repeat-mistake-detection-feature.md) |
| `docs/archive/2026-07-second-reviewer-verification-feature.md` | [docs/proposals/completed/2026-07-second-reviewer-verification-feature.md](../../proposals/completed/2026-07-second-reviewer-verification-feature.md) |
| `docs/archive/2026-07-verification-index-alignment-soft-assert.md` | [docs/proposals/completed/2026-07-21-verification-index-alignment-soft-assert.md](../../proposals/completed/2026-07-21-verification-index-alignment-soft-assert.md) |
| `docs/archive/2026-08-remove-codebase-rag-and-build-deterministic-pr-context.md` | [docs/proposals/active/2026-08-remove-codebase-rag-and-build-deterministic-pr-context.md](../../proposals/active/2026-08-remove-codebase-rag-and-build-deterministic-pr-context.md) |
| `docs/archive/2026-08-review-body-verdict-first.md` | [docs/proposals/completed/2026-08-16-review-body-verdict-first.md](../../proposals/completed/2026-08-16-review-body-verdict-first.md) |
| `docs/archive/2026-08-verification-card-excluded-only.md` | [docs/proposals/completed/2026-08-verification-card-excluded-only.md](../../proposals/completed/2026-08-verification-card-excluded-only.md) |
| `docs/archive/ai-module-refactoring.md` | [docs/proposals/active/ai-module-refactoring.md](../../proposals/active/ai-module-refactoring.md) |
| `docs/archive/auth-module-minor-refactoring.md` | [docs/proposals/active/auth-module-minor-refactoring.md](../../proposals/active/auth-module-minor-refactoring.md) |
| `docs/archive/cross-module-dependency-cleanup.md` | [docs/proposals/active/cross-module-dependency-cleanup.md](../../proposals/active/cross-module-dependency-cleanup.md) |
| `docs/archive/dashboard-module-refactoring.md` | [docs/proposals/active/dashboard-module-refactoring.md](../../proposals/active/dashboard-module-refactoring.md) |
| `docs/archive/dead-code-analysis.md` | [docs/proposals/active/dead-code-analysis.md](../../proposals/active/dead-code-analysis.md) |
| `docs/archive/explain-feature.md` | [docs/proposals/active/explain-feature.md](../../proposals/active/explain-feature.md) |
| `docs/archive/feature-roadmap.md` | [docs/proposals/active/feature-roadmap.md](../../proposals/active/feature-roadmap.md) |
| `docs/archive/github-native-suggestion-reconciliation-feature.md` | [docs/proposals/active/github-native-suggestion-reconciliation-feature.md](../../proposals/active/github-native-suggestion-reconciliation-feature.md) |
| `docs/archive/merge-adjacent-suggestions.md` | [docs/proposals/active/merge-adjacent-suggestions.md](../../proposals/active/merge-adjacent-suggestions.md) |
| `docs/archive/one-click-fix-feature.md` | [docs/proposals/completed/one-click-fix-feature.md](../../proposals/completed/one-click-fix-feature.md) |
| `docs/archive/refactoring-analysis.md` | [docs/investigations/completed/2026-04-06-refactoring-analysis.md](../../investigations/completed/2026-04-06-refactoring-analysis.md) |
| `docs/archive/repository-module-refactor-2026-02-18.md` | [docs/proposals/completed/2026-02-18-repository-module-refactor.md](../../proposals/completed/2026-02-18-repository-module-refactor.md) |
| `docs/archive/repository-module-refactoring.md` | [docs/proposals/active/repository-module-refactoring.md](../../proposals/active/repository-module-refactoring.md) |
| `docs/archive/review-encoding-false-positive-hardening-feature.md` | [docs/proposals/active/review-encoding-false-positive-hardening-feature.md](../../proposals/active/review-encoding-false-positive-hardening-feature.md) |
| `docs/archive/review-issue-description-structuring.md` | [docs/proposals/active/review-issue-description-structuring.md](../../proposals/active/review-issue-description-structuring.md) |
| `docs/archive/review-module-refactoring.md` | [docs/proposals/active/review-module-refactoring.md](../../proposals/active/review-module-refactoring.md) |
| `docs/archive/review-output-reliability-feature.md` | [docs/proposals/active/review-output-reliability-feature.md](../../proposals/active/review-output-reliability-feature.md) |
| `docs/archive/review-output-ux-improvement.md` | [docs/proposals/active/review-output-ux-improvement.md](../../proposals/active/review-output-ux-improvement.md) |
| `docs/archive/review-summary-walkthrough-improvement-feature.md` | [docs/proposals/active/review-summary-walkthrough-improvement-feature.md](../../proposals/active/review-summary-walkthrough-improvement-feature.md) |
| `docs/archive/settings-module-refactoring.md` | [docs/proposals/active/settings-module-refactoring.md](../../proposals/active/settings-module-refactoring.md) |
| `docs/archive/suggestion-module-refactoring.md` | [docs/proposals/active/suggestion-module-refactoring.md](../../proposals/active/suggestion-module-refactoring.md) |
| `docs/archive/suggestion-table-emoji-linebreak-fix.md` | [docs/proposals/active/suggestion-table-emoji-linebreak-fix.md](../../proposals/active/suggestion-table-emoji-linebreak-fix.md) |
| `docs/archive/suggestion-table-quality-improvement.md` | [docs/proposals/active/suggestion-table-quality-improvement.md](../../proposals/active/suggestion-table-quality-improvement.md) |
| `docs/archive/suggestion-ui-improvement-feature.md` | [docs/proposals/completed/suggestion-ui-improvement-feature.md](../../proposals/completed/suggestion-ui-improvement-feature.md) |
| `docs/archive/suspense-error-boundary-migration.md` | [docs/proposals/active/suspense-error-boundary-migration.md](../../proposals/active/suspense-error-boundary-migration.md) |
| `docs/archive/walkthrough-table-encoding-fix.md` | [docs/proposals/active/walkthrough-table-encoding-fix.md](../../proposals/active/walkthrough-table-encoding-fix.md) |
| `docs/conventions/settings-module-refactoring-feature.md` | [docs/proposals/active/settings-module-refactoring-feature.md](../../proposals/active/settings-module-refactoring-feature.md) |
| `docs/evaluations/p0-personal-review-coach-release-receipt.md` | [docs/test-reports/completed/2026-09-06-p0-personal-review-coach-release-receipt.md](2026-09-06-p0-personal-review-coach-release-receipt.md) |
| `docs/evaluations/p0-provider-binding.local.md` | `docs/test-reports/p0-provider-binding.local.md` (로컬 전용) |
| `docs/evaluations/remove-codebase-rag-context-evaluation.md` | [docs/test-reports/completed/2026-09-06-remove-codebase-rag-context-evaluation.md](2026-09-06-remove-codebase-rag-context-evaluation.md) |
| `docs/proposals/code-simplification-implementation-plan.md` | [docs/proposals/active/code-simplification-implementation-plan.md](../../proposals/active/code-simplification-implementation-plan.md) |
| `docs/proposals/hreviewer-personal-review-coach-p0-implementation-plan.md` | [docs/proposals/completed/2026-09-06-hreviewer-personal-review-coach-p0-implementation-plan.md](../../proposals/completed/2026-09-06-hreviewer-personal-review-coach-p0-implementation-plan.md) |
| `docs/proposals/hreviewer-personal-review-coach-roadmap.md` | [docs/proposals/active/hreviewer-personal-review-coach-roadmap.md](../../proposals/active/hreviewer-personal-review-coach-roadmap.md) |
| `docs/proposals/unused-code-cleanup-implementation-plan.md` | [docs/proposals/active/unused-code-cleanup-implementation-plan.md](../../proposals/active/unused-code-cleanup-implementation-plan.md) |

## Conclusion

D01–D04의 문서 이관 검증을 완료했다. 앱 실행·빌드·외부 release gate의 신규 통과를 의미하지 않는다.

## Review Checklist

- [x] 원본 보존과 경로 충돌을 확인했다.
- [x] 문서 위치·상태·실제 테스트 판정을 분리했다.
- [x] 상대 링크와 agent 안내를 새 구조에 맞췄다.
- [x] private 자료의 비추적·내용 보존과 작업 잔여물을 확인했다.
