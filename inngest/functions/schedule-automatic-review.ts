import { inngest } from "../client";
import type { HReviewerEvents } from "../events";

type AutomaticReviewEventData =
  HReviewerEvents["pr.review.auto-requested"]["data"];

type ScheduleAutomaticReviewStep = {
  sendEvent(
    id: string,
    event: {
      id: string;
      name: "pr.review.requested";
      data: AutomaticReviewEventData;
    },
  ): Promise<unknown>;
};

export type ScheduleAutomaticReviewHandlerInput = {
  event: { data: AutomaticReviewEventData };
  step: ScheduleAutomaticReviewStep;
};

export async function scheduleAutomaticReviewHandler(
  input: ScheduleAutomaticReviewHandlerInput,
): Promise<void> {
  const { event, step } = input;

  await step.sendEvent("dispatch-review", {
    id: `hreviewer:review-run:${event.data.reviewId}:${event.data.attempt}`,
    name: "pr.review.requested",
    data: event.data,
  });
}

export const scheduleAutomaticReview = inngest.createFunction(
  {
    id: "schedule-automatic-review",
    debounce: {
      key: "event.data.debounceKey",
      period: "15s",
    },
  },
  { event: "pr.review.auto-requested" },
  scheduleAutomaticReviewHandler,
);
