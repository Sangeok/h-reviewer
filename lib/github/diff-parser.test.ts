import { describe, expect, it } from "vitest";
import {
  extractDiffAddedLinesMap,
  extractDiffFileSet,
  extractDiffPathAliases,
  extractPatchOldSideTouchedLines,
  isRangeFullyAdded,
  parseDiffFiles,
  parseDiffToChangedFiles,
  unescapeGitPath,
} from "./diff-parser";

const ADDED_FILE_DIFF = [
  "diff --git a/src/new.ts b/src/new.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/new.ts",
  "@@ -0,0 +1,2 @@",
  "+export const first = 1;",
  "+export const second = 2;",
].join("\n");

const MODIFIED_FILE_DIFF = [
  "diff --git a/src/value.ts b/src/value.ts",
  "--- a/src/value.ts",
  "+++ b/src/value.ts",
  "@@ -1,2 +1,2 @@",
  "-export const value = 1;",
  "+export const value = 2;",
  " export const stable = true;",
].join("\n");

const PURE_DELETION_DIFF = [
  "diff --git a/src/value.ts b/src/value.ts",
  "--- a/src/value.ts",
  "+++ b/src/value.ts",
  "@@ -1,2 +1 @@",
  "-export const removed = true;",
  " export const stable = true;",
].join("\n");

const DELETED_FILE_DIFF = [
  "diff --git a/src/deleted.ts b/src/deleted.ts",
  "deleted file mode 100644",
  "--- a/src/deleted.ts",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-export const removed = true;",
].join("\n");

const RENAMED_FILE_DIFF = [
  "diff --git a/src/old.ts b/src/current.ts",
  "similarity index 50%",
  "rename from src/old.ts",
  "rename to src/current.ts",
  "--- a/src/old.ts",
  "+++ b/src/current.ts",
  "@@ -1 +1 @@",
  "-export const oldName = true;",
  "+export const currentName = true;",
].join("\n");

describe("diff file parsing", () => {
  it.each([
    ["added", "src/new.ts", ADDED_FILE_DIFF],
    ["modified", "src/value.ts", MODIFIED_FILE_DIFF],
    ["modified", "src/value.ts", PURE_DELETION_DIFF],
    ["deleted", "src/deleted.ts", DELETED_FILE_DIFF],
  ] as const)(
    "classifies a %s file and keeps its canonical path",
    (changeType, filePath, diff) => {
      const [file] = parseDiffFiles(diff);

      expect(file).toMatchObject({ filePath, changeType });
    },
  );

  it("keeps rename provenance and added lines on the current path", () => {
    const [file] = parseDiffFiles(RENAMED_FILE_DIFF);

    expect(file).toEqual({
      filePath: "src/current.ts",
      originalPath: "src/old.ts",
      changeType: "renamed",
      addedLines: [1],
    });
    expect(parseDiffToChangedFiles(RENAMED_FILE_DIFF)).toContain(
      "src/current.ts (renamed from src/old.ts): added lines [1]",
    );
  });

  it("does not label a pure-deletion modification as a deleted file", () => {
    expect(parseDiffToChangedFiles(PURE_DELETION_DIFF)).toBe(
      "- src/value.ts: added lines [none]",
    );
  });

  it("unescapes quoted UTF-8 git paths", () => {
    expect(unescapeGitPath('"src/\\353\\263\\200\\352\\262\\275.ts"')).toBe(
      "src/변경.ts",
    );
  });

  it("keeps only current paths and exposes rename aliases separately", () => {
    const diffFiles = extractDiffFileSet(RENAMED_FILE_DIFF);
    const aliases = extractDiffPathAliases(RENAMED_FILE_DIFF);
    const addedLines = extractDiffAddedLinesMap(RENAMED_FILE_DIFF);

    expect([...diffFiles]).toEqual(["src/current.ts"]);
    expect([...aliases]).toEqual([["src/old.ts", "src/current.ts"]]);
    expect([...addedLines.keys()]).toEqual(["src/current.ts"]);
  });
});

describe("isRangeFullyAdded", () => {
  const addedLines = new Map([["src/new.ts", new Set([3, 4, 5])]]);

  it.each([
    [3, 1, true],
    [3, 3, true],
    [4, 2, true],
    [2, 2, false],
    [5, 2, false],
    [1, 1, false],
  ])("validates start %s and count %s as %s", (startLine, lineCount, expected) => {
    expect(isRangeFullyAdded(addedLines, "src/new.ts", startLine, lineCount)).toBe(
      expected,
    );
  });

  it.each([
    [0, 1],
    [-1, 1],
    [1.5, 1],
    [1, 0],
    [1, -1],
    [1, 1.5],
  ])("rejects invalid ranges", (startLine, lineCount) => {
    expect(isRangeFullyAdded(addedLines, "src/new.ts", startLine, lineCount)).toBe(
      false,
    );
  });

  it("rejects deleted, pure-deletion, and missing paths", () => {
    expect(isRangeFullyAdded(new Map(), "src/deleted.ts", 1, 1)).toBe(false);
    expect(
      isRangeFullyAdded(extractDiffAddedLinesMap(PURE_DELETION_DIFF), "src/value.ts", 1, 1),
    ).toBe(false);
    expect(isRangeFullyAdded(addedLines, "src/missing.ts", 3, 1)).toBe(false);
  });
});

describe("extractPatchOldSideTouchedLines", () => {
  it("returns an empty set for an addition-only patch", () => {
    const patch = [
      "@@ -10,2 +10,3 @@",
      " const a = 1;",
      "+const inserted = 2;",
      " const b = 3;",
    ].join("\n");
    // no-computation: '-' 라인이 없으면 touched는 계약상 빈 집합이다
    expect(extractPatchOldSideTouchedLines(patch).size).toBe(0);
  });

  it("keeps every touched line within the hunk's old-side range", () => {
    const patch = [
      "@@ -5,4 +5,4 @@",
      " ctx();",
      "-removed();",
      "+added();",
      " ctx2();",
      " ctx3();",
    ].join("\n");
    const touched = extractPatchOldSideTouchedLines(patch);
    expect(touched.size).toBeGreaterThan(0);
    for (const line of touched) {
      expect(line).toBeGreaterThanOrEqual(5); // hunk old start (@@ -5,4)
      expect(line).toBeLessThan(5 + 4); // old start + old count 범위 불변식
    }
  });
});
