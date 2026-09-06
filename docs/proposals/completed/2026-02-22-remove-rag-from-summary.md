---
status: "completed"
stage: null
proposal-size: "standard"
created-at: null
completed-at: "2026-02-22"
owners: []
related: []
approved-by: null
approved-at: null
approval-scope: null
verification-summary: "원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다."
closed-at: null
closed-by: null
closed-reason: null
legacy-record: true
migrated-at: "2026-09-06"
migrated-from: "docs/archive/2026-02-remove-rag-from-summary.md"
migration-note: "원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다."
---

> 이관 메모 (2026-09-06): 원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다. 경로·메타데이터 변경 전의 hash와 검토 영수증은 당시 기록이며 새 검증 결과가 아니다.

# Remove RAG From Summary (Completed)

## Document Status

- Status: `COMPLETED` (2026-02-22)
- Original location: `docs/specs/remove-rag-from-summary.md`
- Archive location: `docs/proposals/completed/2026-02-22-remove-rag-from-summary.md`

---

## Goal

Remove unnecessary RAG usage from PR summary generation to reduce latency and cost while preserving summary quality.

---

## What Was Implemented

1. Removed RAG dependency from summary flow in `inngest/functions/summary.ts`.
2. Summary prompt now relies only on PR title, description, and diff.
3. Summary output still uses sanitization (`stripFencedCodeBlocks`) and DB save with `reviewType: "SUMMARY"`.
4. Full review flow remains unchanged and continues to use RAG (`retrieveContext`) in `inngest/functions/review.ts`.

---

## Source of Truth (Current Code)

| Area | File |
| --- | --- |
| summary worker (no RAG) | `inngest/functions/summary.ts` |
| full review worker (RAG kept) | `inngest/functions/review.ts` |
| summary queue event | `module/ai/actions/index.ts` |
| summary feature record | `docs/proposals/completed/2026-02-22-pr-summary-feature.md` |

---

## Validation Summary

- `inngest/functions/summary.ts` has no `searchSimilarCode`, no `SearchResult`, no `contextSection` usage.
- `inngest/functions/review.ts` still calls `retrieveContext(...)`.
- Summary DB persistence remains active with `reviewType: "SUMMARY"`.
- Summary language support remains active via `preferredLanguage`.

---

## Expected Impact

- Lower request cost by removing embedding + Pinecone calls from summary path.
- Faster summary completion by removing RAG overhead.
- No intended quality regression because summary prompt already constrains output to PR-provided context.

---

## Version History

| Version | Date | Change |
| --- | --- | --- |
| 1.1 | 2026-02-22 | Marked implemented and archived from `docs/specs/` |
| 1.0 | 2026-01-04 | Initial implementation plan |
