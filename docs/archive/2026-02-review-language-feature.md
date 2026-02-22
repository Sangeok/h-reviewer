# Review Language Feature (Completed)

## Document Status

- Status: `COMPLETED` (2026-02-22)
- Original location: `docs/specs/review-language-feature.md`
- Archive location: `docs/archive/2026-02-review-language-feature.md`

---

## Goal

Users can select their preferred review language in Settings, and AI PR reviews are generated in that language.

Supported language codes:
- `en` (default)
- `ko`

---

## Implemented Scope

1. `User.preferredLanguage` field added and migrated.
2. Settings profile form exposes a language selector.
3. Profile update/get actions validate and normalize language code.
4. PR review queue event includes `preferredLanguage`.
5. Inngest review generation applies language instruction and localized section headers.

---

## Source of Truth (Current Code)

| Area | File |
| --- | --- |
| DB schema (`preferredLanguage`) | `prisma/schema.prisma` |
| DB migration | `prisma/migrations/20260104112118_add_user_preferred_language/migration.sql` |
| language constants/guards | `module/settings/constants/index.ts` |
| profile actions | `module/settings/actions/index.ts` |
| language selector UI | `module/settings/ui/parts/language-selector.tsx` |
| profile form UI | `module/settings/ui/parts/profile-form.tsx` |
| review queue action | `module/ai/actions/index.ts` |
| review worker | `inngest/functions/review.ts` |
| localized section headers | `shared/constants/index.ts` |

---

## Runtime Flow

```text
Settings -> ProfileForm -> preferredLanguage saved on User
  -> reviewPullRequest() reads preferredLanguage
  -> Inngest event pr.review.requested includes preferredLanguage
  -> generateReview() validates language and builds localized prompt
  -> review comment posted in selected language
```

---

## Notes vs Old Draft

1. `SECTION_HEADERS` is now sourced from `shared/constants/index.ts` (not `module/settings/constants/index.ts`).
2. Profile form path is `module/settings/ui/parts/profile-form.tsx`.
3. Language selector uses type guard (`isValidLanguageCode`) instead of `as` casting.
4. `components/ui/select.tsx` exists as shared UI component; no feature-local creation is needed now.

---

## Operational Checks

1. New users default to `en`.
2. Invalid language input is rejected by server action.
3. Existing users with unexpected values are normalized to default language.
4. Review output headers and body follow selected language policy.

---

## Version History

| Version | Date | Change |
| --- | --- | --- |
| 1.1 | 2026-02-22 | Finalized as implemented record and archived from `docs/specs/` |
| 1.0 | 2026-01-04 | Initial implementation draft |
