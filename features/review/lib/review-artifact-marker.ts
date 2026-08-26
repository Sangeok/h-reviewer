export type ReviewArtifactPart =
  | "main"
  | "verification"
  | "summary"
  | { kind: "issue"; id: string }
  | { kind: "suggestion"; id: string };

const MARKER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertMarkerId(value: string, label: string): void {
  if (!MARKER_ID_PATTERN.test(value)) {
    throw new Error(`${label} must be a non-empty database identifier`);
  }
}

export function buildReviewArtifactMarker(
  reviewId: string,
  part: ReviewArtifactPart,
): string {
  assertMarkerId(reviewId, "Review ID");

  if (typeof part === "string") {
    return `<!-- hreviewer:review:${reviewId}:${part} -->`;
  }

  assertMarkerId(part.id, "Artifact ID");
  return `<!-- hreviewer:review:${reviewId}:${part.kind}:${part.id} -->`;
}
