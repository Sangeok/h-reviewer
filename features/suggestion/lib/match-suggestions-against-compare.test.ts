import { describe, expect, it } from "vitest";

import {
  matchSuggestionsAgainstCompare,
  type CompareFileInput,
  type MatchInput,
  type PendingSuggestion,
} from "./match-suggestions-against-compare";

function makeFile(overrides: Partial<CompareFileInput> = {}): CompareFileInput {
  return {
    path: "src/a.ts",
    status: "modified",
    beforeContent: "a\nb\n",
    afterContent: "x\nb\n",
    ...overrides,
  };
}

function makeSuggestion(
  overrides: Partial<PendingSuggestion> = {},
): PendingSuggestion {
  return {
    id: "suggestion-a",
    filePath: "src/a.ts",
    lineNumber: 1,
    beforeCode: "a",
    afterCode: "x",
    ...overrides,
  };
}

describe("matchSuggestionsAgainstCompare", () => {
  it("keeps the no-changed-files early return", () => {
    expect(
      matchSuggestionsAgainstCompare({
        compareFiles: [],
        pendingSuggestions: [makeSuggestion()],
      }),
    ).toStrictEqual({
      matchedSuggestionIds: [],
      matchedFilePaths: [],
      unaccountedFilePaths: [],
      ambiguousFilePaths: [],
      skipReview: false,
      reason: "no_changed_files",
    });
  });

  it("keeps the no-pending-suggestions early return and path order", () => {
    expect(
      matchSuggestionsAgainstCompare({
        compareFiles: [
          makeFile({ path: "src/b.ts" }),
          makeFile({ path: "src/a.ts" }),
        ],
        pendingSuggestions: [],
      }),
    ).toStrictEqual({
      matchedSuggestionIds: [],
      matchedFilePaths: [],
      unaccountedFilePaths: ["src/b.ts", "src/a.ts"],
      ambiguousFilePaths: [],
      skipReview: false,
      reason: "no_pending_suggestions",
    });
  });

  it("skips review for one exact suggestion match", () => {
    expect(
      matchSuggestionsAgainstCompare({
        compareFiles: [makeFile()],
        pendingSuggestions: [makeSuggestion()],
      }),
    ).toStrictEqual({
      matchedSuggestionIds: ["suggestion-a"],
      matchedFilePaths: ["src/a.ts"],
      unaccountedFilePaths: [],
      ambiguousFilePaths: [],
      skipReview: true,
      reason: "exact_match_all_files",
    });
  });

  it("applies multiple suggestions through Stage A without changing input order", () => {
    const input: MatchInput = {
      compareFiles: [
        makeFile({
          beforeContent: "const a = 1;\nconst b = 2;\n",
          afterContent: "const a = 10;\nconst b = 20;\n",
        }),
      ],
      pendingSuggestions: [
        makeSuggestion({
          id: "first",
          lineNumber: 1,
          beforeCode: "const a = 1;",
          afterCode: "const a = 10;",
        }),
        makeSuggestion({
          id: "second",
          lineNumber: 2,
          beforeCode: "const b = 2;",
          afterCode: "const b = 20;",
        }),
      ],
    };
    const original = structuredClone(input);

    expect(matchSuggestionsAgainstCompare(input)).toMatchObject({
      matchedSuggestionIds: ["first", "second"],
      matchedFilePaths: ["src/a.ts"],
      skipReview: true,
      reason: "exact_match_all_files",
    });
    expect(input).toStrictEqual(original);
  });

  it("uses the only Stage B match when applying every suggestion does not match", () => {
    expect(
      matchSuggestionsAgainstCompare({
        compareFiles: [makeFile()],
        pendingSuggestions: [
          makeSuggestion({ id: "matching" }),
          makeSuggestion({
            id: "unrelated",
            lineNumber: 2,
            beforeCode: "b",
            afterCode: "y",
          }),
        ],
      }),
    ).toMatchObject({
      matchedSuggestionIds: ["matching"],
      matchedFilePaths: ["src/a.ts"],
      ambiguousFilePaths: [],
      unaccountedFilePaths: [],
      skipReview: true,
      reason: "exact_match_all_files",
    });
  });

  it("classifies duplicate Stage B matches as ambiguous", () => {
    expect(
      matchSuggestionsAgainstCompare({
        compareFiles: [makeFile()],
        pendingSuggestions: [
          makeSuggestion({ id: "duplicate-1" }),
          makeSuggestion({ id: "duplicate-2" }),
        ],
      }),
    ).toStrictEqual({
      matchedSuggestionIds: [],
      matchedFilePaths: [],
      unaccountedFilePaths: [],
      ambiguousFilePaths: ["src/a.ts"],
      skipReview: false,
      reason: "ambiguous_match",
    });
  });

  it("gives ambiguity priority when other files are matched or unaccounted", () => {
    const result = matchSuggestionsAgainstCompare({
      compareFiles: [
        makeFile(),
        makeFile({
          path: "src/b.ts",
          beforeContent: "a\nb\n",
          afterContent: "x\nb\n",
        }),
        makeFile({
          path: "src/c.ts",
          beforeContent: "old",
          afterContent: "unknown",
        }),
      ],
      pendingSuggestions: [
        makeSuggestion(),
        makeSuggestion({ id: "duplicate-b-1", filePath: "src/b.ts" }),
        makeSuggestion({ id: "duplicate-b-2", filePath: "src/b.ts" }),
      ],
    });

    expect(result).toStrictEqual({
      matchedSuggestionIds: ["suggestion-a"],
      matchedFilePaths: ["src/a.ts"],
      unaccountedFilePaths: ["src/c.ts"],
      ambiguousFilePaths: ["src/b.ts"],
      skipReview: false,
      reason: "ambiguous_match",
    });
  });

  it("keeps removed, renamed, and missing-content files unaccounted", () => {
    const compareFiles = [
      makeFile({ path: "removed.ts", status: "removed" }),
      makeFile({ path: "renamed.ts", status: "renamed" }),
      makeFile({ path: "before-null.ts", beforeContent: null }),
      makeFile({ path: "after-null.ts", afterContent: null }),
    ];

    expect(
      matchSuggestionsAgainstCompare({
        compareFiles,
        pendingSuggestions: [makeSuggestion()],
      }),
    ).toStrictEqual({
      matchedSuggestionIds: [],
      matchedFilePaths: [],
      unaccountedFilePaths: [
        "removed.ts",
        "renamed.ts",
        "before-null.ts",
        "after-null.ts",
      ],
      ambiguousFilePaths: [],
      skipReview: false,
      reason: "partial_match",
    });
  });

  it("normalizes CRLF before matching", () => {
    expect(
      matchSuggestionsAgainstCompare({
        compareFiles: [
          makeFile({
            beforeContent: "a\r\nb\r\n",
            afterContent: "x\r\nb\r\n",
          }),
        ],
        pendingSuggestions: [makeSuggestion()],
      }),
    ).toMatchObject({
      matchedSuggestionIds: ["suggestion-a"],
      matchedFilePaths: ["src/a.ts"],
      skipReview: true,
      reason: "exact_match_all_files",
    });
  });
});
