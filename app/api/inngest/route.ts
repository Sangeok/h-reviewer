import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { generateReview } from "@/inngest/functions/review";
import { scheduleAutomaticReview } from "@/inngest/functions/schedule-automatic-review";
import { generateSummary } from "@/inngest/functions/summary";

export const maxDuration = 300;

export const inngestFunctions = [
  generateReview,
  generateSummary,
  scheduleAutomaticReview,
];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
