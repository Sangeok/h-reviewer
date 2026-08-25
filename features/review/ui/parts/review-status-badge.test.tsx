import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { ReviewStatusBadge } from "./review-status-badge";

describe("ReviewStatusBadge", () => {
  it("renders the completed status in a TSX test discovered under node", () => {
    const markup = renderToStaticMarkup(
      <ReviewStatusBadge status="completed" />,
    );

    expect(markup).toContain("Completed");
  });
});
