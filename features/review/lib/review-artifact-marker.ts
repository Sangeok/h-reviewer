export type ReviewArtifactPart =
  | "main"
  | "verification"
  | "summary"
  | { kind: "issue"; id: string }
  | { kind: "suggestion"; id: string };

function getArtifactPartValue(part: ReviewArtifactPart): string {
  if (typeof part === "string") {
    return part;
  }

  const id = part.id.trim();
  if (id.length === 0 || id.includes(":")) {
    throw new Error("Review artifact part IDs must be non-empty DB identifiers");
  }

  return `${part.kind}:${id}`;
}

export function buildReviewArtifactMarker(
  reviewId: string,
  part: ReviewArtifactPart,
): string {
  const normalizedReviewId = reviewId.trim();
  if (normalizedReviewId.length === 0 || normalizedReviewId.includes(":")) {
    throw new Error("Review artifact markers require a non-empty review ID");
  }

  return `<!-- hreviewer:review:${normalizedReviewId}:${getArtifactPartValue(part)} -->`;
}
