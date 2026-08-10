import { describe, expect, it } from "vitest";
import {
  filterNonReviewableFiles,
  isNonReviewablePath,
  extractDiffFileSet,
} from "./diff-parser";

function block(path: string, body = "@@ -1,1 +1,1 @@\n-old\n+new\n"): string {
  return `diff --git a/${path} b/${path}\nindex 111..222 100644\n--- a/${path}\n+++ b/${path}\n${body}`;
}

describe("isNonReviewablePath", () => {
  it("flags lock files at root and nested", () => {
    for (const p of [
      "package-lock.json",
      "apps/web/package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bun.lockb",
      "go.sum",
      "Cargo.lock",
    ]) {
      expect(isNonReviewablePath(p), p).toBe(true);
    }
  });

  it("flags generated prisma client and build artifacts", () => {
    expect(isNonReviewablePath("lib/generated/prisma/client.ts")).toBe(true);
    expect(isNonReviewablePath("public/vendor.min.js")).toBe(true);
    expect(isNonReviewablePath("app.js.map")).toBe(true);
    expect(isNonReviewablePath("__snapshots__/a.snap")).toBe(true);
  });

  it("does NOT flag human-authored files", () => {
    for (const p of [
      "package.json",
      "docs/specs/plan.md",
      "features/ai/lib/verify-review.ts",
      "lib/generated-helpers.ts", // generated/ 디렉토리가 아니다
      "src/lockfile-parser.ts",
      "prisma/schema.prisma",
    ]) {
      expect(isNonReviewablePath(p), p).toBe(false);
    }
  });
});

describe("filterNonReviewableFiles", () => {
  it("removes lock file blocks and reports them", () => {
    const diff = block("features/a.ts") + block("package-lock.json") + block("docs/b.md");
    const result = filterNonReviewableFiles(diff);

    expect(result.excludedFiles).toEqual(["package-lock.json"]);
    expect(result.diff).toContain("features/a.ts");
    expect(result.diff).toContain("docs/b.md");
    expect(result.diff).not.toContain("package-lock.json");
  });

  it("keeps the diff parseable after filtering", () => {
    const diff = block("package-lock.json") + block("features/a.ts") + block("lib/b.ts");
    const result = filterNonReviewableFiles(diff);

    // 재조립된 diff가 기존 파서로 그대로 읽혀야 한다
    expect(extractDiffFileSet(result.diff)).toEqual(
      new Set(["features/a.ts", "lib/b.ts"]),
    );
  });

  it("returns the original string when nothing is excluded", () => {
    const diff = block("features/a.ts") + block("package.json");
    const result = filterNonReviewableFiles(diff);

    expect(result.excludedFiles).toEqual([]);
    expect(result.diff).toBe(diff);
  });

  it("handles a diff consisting only of excluded files", () => {
    const diff = block("package-lock.json") + block("yarn.lock");
    const result = filterNonReviewableFiles(diff);

    expect(result.excludedFiles).toEqual(["package-lock.json", "yarn.lock"]);
    expect(extractDiffFileSet(result.diff).size).toBe(0);
  });

  it("handles empty and non-diff input without throwing", () => {
    expect(filterNonReviewableFiles("")).toEqual({ diff: "", excludedFiles: [] });
    expect(filterNonReviewableFiles("not a diff")).toEqual({
      diff: "not a diff",
      excludedFiles: [],
    });
  });

  it("resolves quoted (core.quotepath) paths", () => {
    // \353\263\200 = 변, \352\262\275 = 경
    const octal = "\\353\\263\\200\\352\\262\\275";
    const quoted = `diff --git "a/pkg/${octal}/package-lock.json" "b/pkg/${octal}/package-lock.json"\nindex 1..2 100644\n@@ -1 +1 @@\n-a\n+b\n`;
    const result = filterNonReviewableFiles(block("features/a.ts") + quoted);

    expect(result.excludedFiles).toEqual(["pkg/변경/package-lock.json"]);
    expect(result.diff).toContain("features/a.ts");
  });

  it("does not drop a renamed file whose new path is reviewable", () => {
    const renamed =
      `diff --git a/old/name.ts b/new/name.ts\nsimilarity index 90%\nrename from old/name.ts\nrename to new/name.ts\n@@ -1 +1 @@\n-a\n+b\n`;
    const result = filterNonReviewableFiles(renamed);

    expect(result.excludedFiles).toEqual([]);
    expect(result.diff).toBe(renamed);
  });
});
