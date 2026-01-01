import { PRCommand } from "../types";

export function parseCommand(comment: string): PRCommand | null {
  const normalizedComment = comment.trim().toLowerCase();
  const commandPattern = /^[/@]hreviewer\s+(summary|review)\b/;
  const match = normalizedComment.match(commandPattern);

  if (!match) {
    return null;
  }

  const type = match[1];

  if (type !== "summary" && type !== "review") {
    return null;
  }

  return { type };
}
