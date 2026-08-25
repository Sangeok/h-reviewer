import { describe, expect, it } from "vitest";

import { parseCommand } from "./command-parser";

describe("parseCommand", () => {
  it.each([
    ["@hreviewer review", { type: "review" }],
    ["/hreviewer summary", { type: "summary" }],
    ["  @HReviewer\tSUMMARY  ", { type: "summary" }],
  ])("parses a supported command from %j", (comment, expected) => {
    expect(parseCommand(comment)).toEqual(expected);
  });

  it.each([
    "Looks good to me",
    "@hreviewer-helper review",
    "please @hreviewer review",
  ])("returns null for a non-command comment: %j", (comment) => {
    expect(parseCommand(comment)).toBeNull();
  });

  it.each([
    "@hreviewer",
    "/hreviewer rerun",
    "@hreviewer review full",
    "@hreviewer summary now",
  ])("marks a recognized but unsupported command explicitly: %j", (comment) => {
    expect(parseCommand(comment)).toEqual({ type: "unsupported" });
  });
});
