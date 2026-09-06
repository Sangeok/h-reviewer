import { describe, expect, it, vi } from "vitest";

import {
  scheduleAutomaticReview,
  scheduleAutomaticReviewHandler,
  type ScheduleAutomaticReviewHandlerInput,
} from "./schedule-automatic-review";

describe("scheduleAutomaticReview", () => {
  it("debounces by pull request for 15 seconds", () => {
    expect(scheduleAutomaticReview.opts).toMatchObject({
      id: "schedule-automatic-review",
      debounce: {
        key: "event.data.debounceKey",
        period: "15s",
      },
    });
  });

  it("forwards only the latest debounced head event with a stable run ID", async () => {
    const sendEvent = vi.fn(async () => ({ ids: ["event-b"] }));
    const input: ScheduleAutomaticReviewHandlerInput = {
      event: {
        data: {
          reviewId: "review-b",
          attempt: 1,
          debounceKey: "repository-1:42",
        },
      },
      step: { sendEvent },
    };

    await scheduleAutomaticReviewHandler(input);

    expect(sendEvent).toHaveBeenCalledOnce();
    expect(sendEvent).toHaveBeenCalledWith("dispatch-review", {
      id: "hreviewer:review-run:review-b:1",
      name: "pr.review.requested",
      data: input.event.data,
    });
  });
});
