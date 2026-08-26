import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { generateReview } from "@/inngest/functions/review";
import { scheduleAutomaticReview } from "@/inngest/functions/schedule-automatic-review";
import { generateSummary } from "@/inngest/functions/summary";
import { reconcileStaleReviewExecutions } from "@/inngest/functions/reconcile-stale-review-executions";

export const maxDuration = 300;

export const inngestFunctions = [
  generateReview,
  generateSummary,
  scheduleAutomaticReview,
  reconcileStaleReviewExecutions,
];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
