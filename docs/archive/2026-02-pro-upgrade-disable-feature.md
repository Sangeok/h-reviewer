# Runbook: Pro Upgrade Disable + Free Review Block

## Status
- Implemented date: 2026-02-17
- Purpose: this document must be enough to execute rollback manually without `git revert`

## Current State Snapshot (2026-02-17)
- Pro checkout open/close is controlled by `PRO_UPGRADE_ENABLED`.
- Free review creation is blocked (`reviewsPerRepo: 0`).
- `reviewPullRequest` returns `reason: "plan_restricted"` when review is blocked by plan.
- GitHub webhook returns `200` for `plan_restricted`.
- Subscription UI shows Free as `0 per repo` and `Free tier cannot create reviews`.

---

## Rollback Profiles

### Profile A (Free review rollback only)
Use this when you want:
- Free users can create reviews again (limit 5 per repository)
- Pro upgrade blocking logic stays as-is

### Profile B (Pro upgrade rollback only)
Use this when you want:
- Re-open Pro upgrade checkout
- Keep Free review block as-is

### Profile C (Full rollback)
Apply `Profile A` + `Profile B`.

---

## Profile A: Exact Steps (Free Review Block Rollback)

### Step 1) Restore Free review limit value
File: `module/payment/lib/subscription.ts`

Replace:
```ts
FREE: {
  repositories: 5,
  reviewsPerRepo: 0,
},
```

With:
```ts
FREE: {
  repositories: 5,
  reviewsPerRepo: 5,
},
```

### Step 2) Restore review action behavior to limit-based failure flow
File: `module/ai/actions/index.ts`

1. Delete the `ReviewPullRequestResult` type block:
```ts
type ReviewPullRequestResult =
  | {
      success: true;
      message: "Review Queued";
    }
  | {
      success: false;
      message: string;
      reason: "plan_restricted" | "internal_error";
    };
```

2. Replace the whole `reviewPullRequest` function with this exact version:
```ts
export async function reviewPullRequest(owner: string, repo: string, prNumber: number) {
  try {
    const repository = await prisma.repository.findFirst({
      where: {
        owner,
        name: repo,
      },
      include: {
        user: {
          include: {
            accounts: {
              where: {
                providerId: "github",
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const canReview = await canCreateReview(repository.user.id, repository.id);

    if (!canReview) {
      throw new Error("You have reached the maximum number of reviews for this repository");
    }

    const githubAccount = repository.user.accounts[0];

    if (!githubAccount?.accessToken) {
      throw new Error("Github access token not found");
    }

    const accessToken = githubAccount.accessToken;

    const { title } = await getPullRequestDiff(accessToken, owner, repo, prNumber);

    const preferredLanguage = await getUserLanguageByUserId(repository.user.id);

    await inngest.send({
      name: "pr.review.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
        preferredLanguage,
      },
    });

    await incrementReviewCount(repository.user.id, repository.id);

    return {
      success: true,
      message: "Review Queued",
    };
  } catch (error) {
    try {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (repository) {
        await prisma.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: "Failed to fetch PR",
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review: `Error : ${error instanceof Error ? error.message : "Unknown error"}`,
            status: "failed",
          },
        });
      }
      return {
        success: false,
        message: "Error Reviewing Pull Request",
      };
    } catch (error) {
      console.error("Error reviewing pull request:", error);
      return {
        success: false,
        message: "Error Reviewing Pull Request",
      };
    }
  }
}
```

### Step 3) Remove webhook `plan_restricted` branch
File: `app/api/webhooks/github/route.ts`

In `if (!reviewResult.success) { ... }`, remove this block:
```ts
if (reviewResult.reason === "plan_restricted") {
  console.info(`Review skipped for ${repoInfo.fullName} #${prNumber}: ${reviewResult.message}`);
  return NextResponse.json({ message: reviewResult.message }, { status: 200 });
}
```

After rollback, the block should be:
```ts
if (!reviewResult.success) {
  console.error(`Review queueing failed for ${repoInfo.fullName} #${prNumber}: ${reviewResult.message}`);
  return NextResponse.json({ error: reviewResult.message }, { status: 500 });
}
```

### Step 4) Restore Free plan text/copy
File: `app/dashboard/subscription/page.tsx`

A. In `PLAN_FEATURES.free`, replace:
```ts
{ name: "No AI reviews (Pro only)", included: false },
{ name: "Basic code review", included: false },
```
With:
```ts
{ name: "Up to 5 reviews per repository", included: true },
{ name: "Basic code review", included: true },
```

B. In usage badge/text, replace:
```tsx
<Badge variant="outline">{isPro ? "Unlimited" : "0 per repo"}</Badge>
```
With:
```tsx
<Badge variant="outline">{isPro ? "Unlimited" : "5 per repo"}</Badge>
```

Replace:
```tsx
{isPro ? "No limits on reviews" : "Free tier cannot create reviews"}
```
With:
```tsx
{isPro ? "No limits on reviews" : "Free tier allows 5 reviews per repository"}
```

Important:
- Do not touch `PLAN_FEATURES.pro.map(...)` in Pro card (this was a separate bug fix and should stay).

### Step 5) Validate
Run:
```bash
npx tsc --noEmit
npx eslint module/payment/lib/subscription.ts module/ai/actions/index.ts app/api/webhooks/github/route.ts app/dashboard/subscription/page.tsx
```

Expected:
- Type errors: 0
- Lint errors: 0 (warnings may exist)

### Step 6) Smoke test
1. Free account + connected repo + new PR webhook
2. Create reviews 1~5: should queue successfully
3. 6th review: should fail by limit behavior
4. Pro account review: should still queue successfully

---

## Profile B: Exact Steps (Pro Upgrade Rollback Only)

1. Set env:
```env
PRO_UPGRADE_ENABLED=true
```
2. Redeploy.
3. Verify subscription page upgrade button is enabled and checkout opens.

---

## Profile C: Full Rollback
1. Execute all of `Profile A`.
2. Execute all of `Profile B`.

---

## Deterministic Completion Checklist
- `module/payment/lib/subscription.ts` has `reviewsPerRepo: 5`
- `module/ai/actions/index.ts` no longer contains `reason: "plan_restricted"`
- `app/api/webhooks/github/route.ts` no longer contains `reviewResult.reason === "plan_restricted"`
- `app/dashboard/subscription/page.tsx` contains:
  - `Up to 5 reviews per repository`
  - `5 per repo`
  - `Free tier allows 5 reviews per repository`
- Build/type/lint checks pass
