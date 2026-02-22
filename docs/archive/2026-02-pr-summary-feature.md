# PR Summary Feature Specification (Completed)

## Document Status

- Status: `COMPLETED` (2026-02-22)
- Original location: `docs/specs/pr-summary-feature.md`
- Archive location: `docs/archive/2026-02-pr-summary-feature.md`

---

## Goal

When a user comments `/hreviewer summary` (or `@hreviewer summary`) on a GitHub PR, HReviewer generates a concise AI summary and posts it back to the PR.

---

## Implemented Flow

```text
PR comment (/hreviewer summary or @hreviewer summary)
  -> GitHub webhook (issue_comment)
  -> /api/webhooks/github
  -> parseCommand()
  -> generatePRSummary()
  -> Inngest event: pr.summary.requested
  -> inngest/functions/summary.ts
      1) fetch PR data
      2) generate summary (Gemini)
      3) post PR comment
      4) save review row (reviewType = SUMMARY)
```

---

## Source of Truth (Current Code)

| Area | File |
| --- | --- |
| command parsing | `module/ai/utils/command-parser.ts` |
| webhook handling | `app/api/webhooks/github/route.ts` |
| summary queue action | `module/ai/actions/index.ts` |
| summary worker | `inngest/functions/summary.ts` |
| inngest registration | `app/api/inngest/route.ts` |
| webhook events registration | `module/github/lib/github.ts` |
| review type schema | `prisma/schema.prisma` |
| review type migration | `prisma/migrations/20260101162249_add_review_type/migration.sql` |
| full review type save | `inngest/functions/review.ts` |

---

## Behavior Notes (Updated from Older Draft)

1. Summary path does **not** use RAG anymore.
2. Summary action lives in `module/ai/actions/index.ts` (not a separate `module/ai/actions/summary.ts` file).
3. Webhook route now includes signature verification and stronger payload guards.
4. Summary output generation currently targets concise markdown up to 300 words.

---

## Database Status

Implemented:
- `ReviewType` enum: `SUMMARY | FULL_REVIEW`
- `Review.reviewType` with default `FULL_REVIEW`
- Summary saves `reviewType: "SUMMARY"`
- Full review saves `reviewType: "FULL_REVIEW"`

Current schema note:
- `Review` currently has `@@index([repositoryId])`.
- Earlier draft text mentioned compound indexes (`[repositoryId, reviewType]`, `[repositoryId, prNumber]`), but they are not present in current schema.
- This is not a functional blocker for PR Summary, but may be added later if query optimization is needed.

---

## Operational Checklist

1. GitHub webhook must include `issue_comment` events.
2. `GITHUB_WEBHOOK_SECRET` must be configured.
3. Inngest must register `generate-summary`.
4. Prisma migrations must be applied in deployment environments.

---

## Version History

| Version | Date | Change |
| --- | --- | --- |
| 1.5 | 2026-02-22 | Finalized as implemented record and archived from `docs/specs/` |
| 1.4 | 2026-01-04 | Summary RAG removed (performance and cost optimization) |
| 1.3 | 2026-01-01 | `ReviewType` and `reviewType` schema changes added |
| 1.2 | 2026-01-01 | Summary flow with RAG (historical) |
| 1.1 | 2025-12-31 | Initial spec draft |
