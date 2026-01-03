export function stripFencedCodeBlocks(input: string): string {
  // Defensive post-processing: keep the summary concise and avoid leaking large code snippets.
  return input
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
