import { describe, expect, it } from "vitest";
import { extractPatchOldSideTouchedLines } from "./diff-parser";

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
