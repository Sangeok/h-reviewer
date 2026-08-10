import { describe, expect, it } from "vitest";
import { buildReviewNotice } from "./review-formatter";

describe("buildReviewNotice", () => {
  it("returns null when the review is not degraded", () => {
    expect(
      buildReviewNotice({ excludedFiles: [], limitedReview: false, langCode: "ko" }),
    ).toBeNull();
  });

  it("reports excluded files", () => {
    const notice = buildReviewNotice({
      excludedFiles: ["package-lock.json"],
      limitedReview: false,
      langCode: "ko",
    });

    expect(notice).toContain("생성 파일 제외:");
    expect(notice).toContain("`package-lock.json`");
    expect(notice?.startsWith(">")).toBe(true);
  });

  it("reports a limited (fallback) review", () => {
    const notice = buildReviewNotice({
      excludedFiles: [],
      limitedReview: true,
      langCode: "ko",
    });

    expect(notice).toContain("인라인 제안");
    expect(notice).toContain("⚠️");
  });

  it("reports both, with the limitation first", () => {
    const notice = buildReviewNotice({
      excludedFiles: ["yarn.lock"],
      limitedReview: true,
      langCode: "ko",
    });

    const limitedAt = notice!.indexOf("⚠️");
    const skippedAt = notice!.indexOf("ℹ️");
    expect(limitedAt).toBeGreaterThanOrEqual(0);
    expect(skippedAt).toBeGreaterThan(limitedAt);
  });

  it("caps the file list at 6 and counts the remainder", () => {
    const files = Array.from({ length: 10 }, (_, i) => `pkg${i}/package-lock.json`);
    const notice = buildReviewNotice({
      excludedFiles: files,
      limitedReview: false,
      langCode: "ko",
    });

    expect(notice).toContain("`pkg5/package-lock.json`");
    expect(notice).not.toContain("`pkg6/package-lock.json`");
    expect(notice).toContain("+4");
  });

  it("keeps every line inside the blockquote", () => {
    const notice = buildReviewNotice({
      excludedFiles: ["a.lock"],
      limitedReview: true,
      langCode: "en",
    });

    // 한 줄이라도 "> "로 시작하지 않으면 GitHub에서 인용이 끊긴다
    for (const line of notice!.split("\n")) {
      expect(line.startsWith(">"), line).toBe(true);
    }
  });

  it("localizes to English", () => {
    const notice = buildReviewNotice({
      excludedFiles: ["package-lock.json"],
      limitedReview: true,
      langCode: "en",
    });

    expect(notice).toContain("Skipped generated files:");
    expect(notice).toContain("too large for a full structured review");
  });
});
