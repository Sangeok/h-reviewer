import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { generateReview } from "@/inngest/functions/review";
import { generateSummary } from "@/inngest/functions/summary";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateReview, generateSummary],
});
