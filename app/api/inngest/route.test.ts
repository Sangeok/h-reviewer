import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const nextMocks = vi.hoisted(() => ({
  serve: vi.fn(() => ({
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
  })),
}));

vi.mock("inngest/next", () => ({ serve: nextMocks.serve }));

import { inngest } from "@/inngest/client";
import { generateReview } from "@/inngest/functions/review";
import { scheduleAutomaticReview } from "@/inngest/functions/schedule-automatic-review";
import { generateSummary } from "@/inngest/functions/summary";
import { reconcileStaleReviewExecutions } from "@/inngest/functions/reconcile-stale-review-executions";

import { inngestFunctions } from "./route";

const EXACT_CANCEL_PREDICATE =
  "async.data.reviewId == event.data.reviewId && " +
  "async.data.attempt == event.data.attempt";

describe("Inngest route registry", () => {
  it("registers and serves exactly the four T07 functions", () => {
    expect(inngestFunctions).toEqual([
      generateReview,
      generateSummary,
      scheduleAutomaticReview,
      reconcileStaleReviewExecutions,
    ]);
    expect(new Set(inngestFunctions)).toHaveLength(4);
    expect(nextMocks.serve).toHaveBeenCalledWith({
      client: inngest,
      functions: inngestFunctions,
    });
  });

  it("pins the stale reconciliation schedule", () => {
    expect(reconcileStaleReviewExecutions.opts).toMatchObject({
      id: "reconcile-stale-review-executions",
    });
  });

  it("pins the T06 scheduler and worker flow-control options", () => {
    expect(scheduleAutomaticReview.opts).toMatchObject({
      id: "schedule-automatic-review",
      debounce: {
        key: "event.data.debounceKey",
        period: "15s",
      },
    });
    expect(generateReview.opts).toMatchObject({
      id: "generate-review",
      onFailure: expect.any(Function),
      concurrency: {
        key: "event.data.debounceKey",
        limit: 1,
      },
      cancelOn: [
        {
          event: "pr.review.superseded",
          if: EXACT_CANCEL_PREDICATE,
        },
      ],
    });
    expect(generateSummary.opts).toMatchObject({
      id: "generate-summary",
      onFailure: expect.any(Function),
      cancelOn: [
        {
          event: "pr.review.superseded",
          if: EXACT_CANCEL_PREDICATE,
        },
      ],
    });
    expect(generateSummary.opts).not.toHaveProperty("concurrency");
  });
});
