import type { PRCommand } from "../types";

export function parseCommand(comment: string): PRCommand | null {
  const normalizedComment = comment.trim().toLowerCase();
  const tokens = normalizedComment.split(/\s+/);
  const commandPrefix = tokens[0];

  if (commandPrefix !== "@hreviewer" && commandPrefix !== "/hreviewer") {
    return null;
  }

  if (tokens.length !== 2) {
    return { type: "unsupported" };
  }

  const type = tokens[1];

  if (type !== "summary" && type !== "review") {
    return { type: "unsupported" };
  }

  return { type };
}
