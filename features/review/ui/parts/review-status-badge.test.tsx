import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import type { ReviewStatus } from "@/lib/generated/prisma/enums";

import { ReviewStatusBadge } from "./review-status-badge";

describe("ReviewStatusBadge", () => {
  it.each<{ status: ReviewStatus; label: string }>([
    { status: "PENDING", label: "Pending" },
    { status: "RUNNING", label: "Running" },
    { status: "POSTING", label: "Posting" },
    { status: "COMPLETED", label: "Completed" },
    { status: "FAILED", label: "Failed" },
    { status: "SUPERSEDED", label: "Superseded" },
  ])("renders the $status review status", ({ status, label }) => {
    const markup = renderToStaticMarkup(
      <ReviewStatusBadge status={status} />,
    );

    expect(markup).toContain(label);
  });
});
