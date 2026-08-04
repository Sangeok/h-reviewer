import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const githubMocks = vi.hoisted(() => ({
  getFileContent: vi.fn(),
  getRepositoryFileTree: vi.fn(),
}));

vi.mock("@/lib/github/github", () => githubMocks);

import {
  buildChangedFileSelection,
  buildDeterministicPrContext,
  buildRelatedTestCandidates,
  createEmptyDeterministicPrContext,
  createManifestIdentitySha256,
  extractRelativeModuleSpecifiers,
  formatWithinBudget,
  isSupportedContextPath,
  resolveRelativeModuleCandidates,
} from "./build-deterministic-pr-context";
import { getDeterministicContextBudget } from "./review-size-policy";

function createAddedFileDiff(filePath = "src/foo.ts"): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${filePath}`,
    "@@ -0,0 +1,2 @@",
    "+export const first = 1;",
    "+export const second = 2;",
  ].join("\n");
}

function createDeletedFileDiff(filePath = "src/deleted.ts"): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    "deleted file mode 100644",
    `--- a/${filePath}`,
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-export const removed = true;",
  ].join("\n");
}

describe("deterministic context path and relationship helpers", () => {
  it.each([
    ["src/file.ts", true],
    ["types/global.d.ts", true],
    ["Dockerfile", true],
    ["package-lock.json", false],
    ["dist/file.ts", false],
    ["src/file.min.js", false],
    ["src/file.js.map", false],
    ["public/image.png", false],
  ])("classifies %s as supported=%s", (filePath, expected) => {
    expect(isSupportedContextPath(filePath)).toBe(expected);
  });

  it("builds related test candidates in location, extension, then marker order", () => {
    const candidates = buildRelatedTestCandidates("src/foo.ts");

    expect(candidates.slice(0, 4)).toEqual([
      "src/foo.test.ts",
      "src/foo.spec.ts",
      "src/foo.test.tsx",
      "src/foo.spec.tsx",
    ]);
    expect(candidates).toContain("src/__tests__/foo.test.ts");
    expect(buildRelatedTestCandidates("src/foo.test.ts")).toEqual([]);
    expect(buildRelatedTestCandidates("src/foo.d.ts")).toEqual([]);
  });

  it("extracts supported relative imports in source order and deduplicates them", () => {
    const source = [
      'import { alias } from "@/alias";',
      'import { first } from "./first";',
      'export { second } from "../second";',
      'import "./side-effect";',
      'const lazy = import("./lazy");',
      'const legacy = require("./legacy");',
      'import { firstAgain } from "./first";',
      'import { z } from "zod";',
    ].join("\n");

    expect(extractRelativeModuleSpecifiers(source)).toEqual([
      "./first",
      "../second",
      "./side-effect",
      "./lazy",
      "./legacy",
    ]);
  });

  it("resolves extensionless imports without NodeNext js-to-ts guessing", () => {
    expect(resolveRelativeModuleCandidates({
      importerPath: "src/routes/foo.ts",
      specifier: "../shared/value",
    })).toEqual([
      "src/shared/value",
      "src/shared/value.ts",
      "src/shared/value.tsx",
      "src/shared/value.d.ts",
      "src/shared/value.js",
      "src/shared/value.jsx",
      "src/shared/value.mjs",
      "src/shared/value.cjs",
      "src/shared/value.json",
      "src/shared/value/index.ts",
      "src/shared/value/index.tsx",
      "src/shared/value/index.d.ts",
      "src/shared/value/index.js",
      "src/shared/value/index.jsx",
      "src/shared/value/index.mjs",
      "src/shared/value/index.cjs",
    ]);
    expect(resolveRelativeModuleCandidates({
      importerPath: "src/foo.ts",
      specifier: "./module.js",
    })).toEqual(["src/module.js"]);
    expect(resolveRelativeModuleCandidates({
      importerPath: "src/foo.ts",
      specifier: "../../outside",
    })).toEqual([]);
  });
});

describe("changed-file selection", () => {
  it("uses full content when the rendered section fits", () => {
    const selection = buildChangedFileSelection({
      file: {
        change: {
          filePath: "src/foo.ts",
          changeType: "modified",
          addedLines: [1],
        },
        content: "export const value = 1;",
      },
      maxSectionCharacters: 1_000,
      changedLineRadius: 20,
    });

    expect(selection).toMatchObject({
      path: "src/foo.ts",
      source: "changed",
      selection: "full",
      truncated: false,
    });
  });

  it("prioritizes every added region before surrounding lines", () => {
    const sourceLines = Array.from(
      { length: 100 },
      (_, index) => `line ${index + 1}`,
    );
    const selection = buildChangedFileSelection({
      file: {
        change: {
          filePath: "src/large.ts",
          changeType: "modified",
          addedLines: [10, 90],
        },
        content: sourceLines.join("\n"),
      },
      maxSectionCharacters: 180,
      changedLineRadius: 20,
    });

    expect(selection?.selection).toBe("changed-line-window");
    expect(selection?.body).toContain("line 10");
    expect(selection?.body).toContain("line 90");
    expect(selection?.body.startsWith("line 1")).toBe(false);
  });

  it("omits an oversized pure-deletion modification instead of taking a prefix", () => {
    const selection = buildChangedFileSelection({
      file: {
        change: {
          filePath: "src/large.ts",
          changeType: "modified",
          addedLines: [],
        },
        content: "x".repeat(2_000),
      },
      maxSectionCharacters: 200,
      changedLineRadius: 20,
    });

    expect(selection).toBeNull();
  });
});

describe("buildDeterministicPrContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses exact fork coordinates, head ref, and one shared signal for every request", async () => {
    const controller = new AbortController();
    const contents = new Map([
      [
        "src/foo.ts",
        'import { dependency } from "./dependency";\nexport const foo = dependency;',
      ],
      ["src/foo.test.ts", "expect(foo).toBe(dependency);"],
      ["src/dependency.ts", "export const dependency = 1;"],
    ]);
    githubMocks.getFileContent.mockImplementation(
      async (params: { path: string }) => {
        const content = contents.get(params.path);
        return content ? { content, sha: `${params.path}-sha` } : null;
      },
    );
    githubMocks.getRepositoryFileTree.mockResolvedValue({
      files: [...contents.entries()].map(([filePath, content]) => ({
        path: filePath,
        size: content.length,
      })),
      truncated: false,
    });

    const result = await buildDeterministicPrContext({
      token: "token",
      owner: "fork-owner",
      repo: "fork-repo",
      headSha: "head-sha",
      diff: createAddedFileDiff(),
      sizeMode: "small",
      signal: controller.signal,
    });

    expect(result.manifest.map(({ path, source }) => ({ path, source }))).toEqual([
      { path: "src/foo.ts", source: "changed" },
      { path: "src/foo.test.ts", source: "related-test" },
      { path: "src/dependency.ts", source: "direct-import" },
    ]);
    expect(result.treeStatus).toBe("complete");
    for (const [params] of githubMocks.getFileContent.mock.calls) {
      expect(params).toMatchObject({
        owner: "fork-owner",
        repo: "fork-repo",
        ref: "head-sha",
        signal: controller.signal,
      });
    }
    expect(githubMocks.getRepositoryFileTree).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "fork-owner",
        repo: "fork-repo",
        commitSha: "head-sha",
        signal: controller.signal,
      }),
    );
  });

  it("does not fetch deleted files and returns a truly empty context", async () => {
    const result = await buildDeterministicPrContext({
      token: "token",
      owner: "owner",
      repo: "repo",
      headSha: "head-sha",
      diff: createDeletedFileDiff(),
      sizeMode: "normal",
    });

    expect(githubMocks.getFileContent).not.toHaveBeenCalled();
    expect(githubMocks.getRepositoryFileTree).not.toHaveBeenCalled();
    expect(result).toEqual(createEmptyDeterministicPrContext("head-sha"));
  });

  it("keeps changed context when tree lookup fails", async () => {
    githubMocks.getFileContent.mockResolvedValue({
      content: "export const first = 1;",
      sha: "file-sha",
    });
    githubMocks.getRepositoryFileTree.mockRejectedValue(new Error("tree failed"));

    const result = await buildDeterministicPrContext({
      token: "token",
      owner: "owner",
      repo: "repo",
      headSha: "head-sha",
      diff: createAddedFileDiff(),
      sizeMode: "small",
    });

    expect(result.manifest).toHaveLength(1);
    expect(result.manifest[0].source).toBe("changed");
    expect(result.treeStatus).toBe("failed");
  });

  it("records a changed-file failure without failing the overall builder", async () => {
    githubMocks.getFileContent.mockRejectedValue(new Error("aborted"));

    const result = await buildDeterministicPrContext({
      token: "token",
      owner: "owner",
      repo: "repo",
      headSha: "head-sha",
      diff: createAddedFileDiff(),
      sizeMode: "small",
    });

    expect(result.content).toBe("");
    expect(result.failedFileCount).toBe(1);
    expect(result.treeStatus).toBe("not-requested");
  });

  it("returns partial context when the shared deadline aborts later helpers", async () => {
    const diff = [
      createAddedFileDiff("src/foo.ts"),
      createAddedFileDiff("src/bar.ts"),
    ].join("\n");
    const abortError = Object.assign(new Error("deadline"), {
      name: "AbortError",
    });
    githubMocks.getFileContent.mockImplementation(
      async (params: { path: string }) => {
        if (params.path === "src/foo.ts") {
          return {
            content: "export const foo = true;",
            sha: "foo-sha",
          };
        }
        throw abortError;
      },
    );
    githubMocks.getRepositoryFileTree.mockRejectedValue(abortError);

    const result = await buildDeterministicPrContext({
      token: "token",
      owner: "owner",
      repo: "repo",
      headSha: "head-sha",
      diff,
      sizeMode: "small",
      signal: AbortSignal.abort(abortError),
    });

    expect(result.manifest.map((entry) => entry.path)).toEqual(["src/foo.ts"]);
    expect(result.failedFileCount).toBe(1);
    expect(result.treeStatus).toBe("failed");
  });

  it("does not request a tree when the size mode has no related-file budget", async () => {
    githubMocks.getFileContent.mockResolvedValue({
      content: 'import "./dependency";\nexport const foo = true;',
      sha: "foo-sha",
    });

    const result = await buildDeterministicPrContext({
      token: "token",
      owner: "owner",
      repo: "repo",
      headSha: "head-sha",
      diff: createAddedFileDiff(),
      sizeMode: "tiny",
    });

    expect(githubMocks.getRepositoryFileTree).not.toHaveBeenCalled();
    expect(result.treeStatus).toBe("not-requested");
  });

  it("does not retry a failed changed path as direct-import context", async () => {
    const diff = [
      createAddedFileDiff("src/foo.ts"),
      createAddedFileDiff("src/dependency.ts"),
    ].join("\n");
    githubMocks.getFileContent.mockImplementation(
      async (params: { path: string }) => {
        if (params.path === "src/foo.ts") {
          return {
            content: 'import "./dependency";\nexport const foo = true;',
            sha: "foo-sha",
          };
        }
        return null;
      },
    );
    githubMocks.getRepositoryFileTree.mockResolvedValue({
      files: [
        { path: "src/foo.ts", size: 50 },
        { path: "src/dependency.ts", size: 50 },
      ],
      truncated: false,
    });

    const result = await buildDeterministicPrContext({
      token: "token",
      owner: "owner",
      repo: "repo",
      headSha: "head-sha",
      diff,
      sizeMode: "small",
    });

    expect(githubMocks.getFileContent).toHaveBeenCalledTimes(2);
    expect(result.manifest.map((entry) => entry.path)).toEqual(["src/foo.ts"]);
    expect(result.failedFileCount).toBe(1);
  });

  it("prefilters oversized related files before Contents API calls", async () => {
    githubMocks.getFileContent.mockImplementation(
      async (params: { path: string }) => {
        if (params.path === "src/foo.ts") {
          return {
            content: 'import "./dependency";\nexport const foo = true;',
            sha: "foo-sha",
          };
        }
        return { content: "unreachable", sha: "related-sha" };
      },
    );
    githubMocks.getRepositoryFileTree.mockResolvedValue({
      files: [
        { path: "src/foo.ts", size: 50 },
        { path: "src/dependency.ts", size: 6_001 },
      ],
      truncated: true,
    });

    const result = await buildDeterministicPrContext({
      token: "token",
      owner: "owner",
      repo: "repo",
      headSha: "head-sha",
      diff: createAddedFileDiff(),
      sizeMode: "small",
    });

    expect(githubMocks.getFileContent).toHaveBeenCalledTimes(1);
    expect(result.omittedByBudgetCount).toBe(1);
    expect(result.treeStatus).toBe("truncated");
  });

  it("omits a related file whose unknown tree size decodes above the full-file cap", async () => {
    githubMocks.getFileContent.mockImplementation(
      async (params: { path: string }) => {
        if (params.path === "src/foo.ts") {
          return {
            content: 'import "./dependency";\nexport const foo = true;',
            sha: "foo-sha",
          };
        }
        return { content: "x".repeat(6_001), sha: "dependency-sha" };
      },
    );
    githubMocks.getRepositoryFileTree.mockResolvedValue({
      files: [
        { path: "src/foo.ts", size: 50 },
        { path: "src/dependency.ts", size: null },
      ],
      truncated: false,
    });

    const result = await buildDeterministicPrContext({
      token: "token",
      owner: "owner",
      repo: "repo",
      headSha: "head-sha",
      diff: createAddedFileDiff(),
      sizeMode: "small",
    });

    expect(githubMocks.getFileContent).toHaveBeenCalledTimes(2);
    expect(result.manifest.map((entry) => entry.path)).toEqual(["src/foo.ts"]);
    expect(result.omittedByBudgetCount).toBe(1);
    expect(result.failedFileCount).toBe(0);
  });
});

describe("context formatting and identity", () => {
  it("escapes marker collisions, aligns the manifest, and stays within budget", () => {
    const budget = getDeterministicContextBudget("tiny");
    const result = formatWithinBudget({
      headSha: "head-sha",
      changedFiles: [{
        change: {
          filePath: "src/<<<HREVIEWER_CONTEXT_FILE>>>.ts",
          changeType: "modified",
          addedLines: [1],
        },
        content: "<<<HREVIEWER_CONTEXT_FILE_END>>>\nexport const value = 1;",
      }],
      relatedResults: [],
      treeStatus: "not-requested",
      budget,
      initialOmittedByBudgetCount: 0,
      initialFailedFileCount: 0,
    });

    expect(result.content.length).toBeLessThanOrEqual(budget.totalCharacters);
    expect(result.content).toContain("[escaped HREVIEWER context start marker]");
    expect(result.content).toContain("[escaped HREVIEWER context end marker]");
    expect(result.manifest).toHaveLength(1);
    expect(result.manifest[0].characters).toBe(
      "[escaped HREVIEWER context end marker]\nexport const value = 1;".length,
    );
  });

  it("creates the canonical ordered manifest SHA-256 and returns null when empty", () => {
    const manifest = [
      {
        path: "src/foo.ts",
        source: "changed" as const,
        selection: "full" as const,
        characters: 10,
        truncated: false,
      },
      {
        path: "src/foo.test.ts",
        source: "related-test" as const,
        selection: "full" as const,
        characters: 20,
        truncated: false,
      },
    ];
    const canonical = manifest.map(({ path, source, selection }) =>
      JSON.stringify({ path, source, selection }),
    ).join("\n");
    const expected = createHash("sha256").update(canonical, "utf8").digest("hex");

    expect(createManifestIdentitySha256(manifest)).toBe(expected);
    expect(createManifestIdentitySha256(manifest)).toBe(expected);
    expect(createManifestIdentitySha256([])).toBeNull();
  });

  it.each(["tiny", "small", "normal", "large"] as const)(
    "keeps %s context within its mode budget",
    (sizeMode) => {
      const budget = getDeterministicContextBudget(sizeMode);
      const sourceLines = Array.from(
        { length: 2_000 },
        (_, index) => `export const value${index + 1} = ${index + 1};`,
      );
      const result = formatWithinBudget({
        headSha: "head-sha",
        changedFiles: [{
          change: {
            filePath: "src/large.ts",
            changeType: "modified",
            addedLines: [1, 1_000, 2_000],
          },
          content: sourceLines.join("\n"),
        }],
        relatedResults: [],
        treeStatus: "not-requested",
        budget,
        initialOmittedByBudgetCount: 0,
        initialFailedFileCount: 0,
      });

      expect(result.content.length).toBeLessThanOrEqual(
        budget.totalCharacters,
      );
    },
  );

  it("keeps omission and fetch-failure counters separate and exact", () => {
    const baseBudget = {
      ...getDeterministicContextBudget("small"),
      perChangedFileCharacters: 500,
      totalCharacters: 2_000,
    };
    const changedFiles = [
      {
        change: {
          filePath: "src/included.ts",
          changeType: "modified" as const,
          addedLines: [1],
        },
        content: "export const included = true;",
      },
      {
        change: {
          filePath: "src/oversized-no-additions.ts",
          changeType: "modified" as const,
          addedLines: [],
        },
        content: "x".repeat(2_000),
      },
    ];
    const baseResult = formatWithinBudget({
      headSha: "head-sha",
      changedFiles,
      relatedResults: [],
      treeStatus: "complete",
      budget: baseBudget,
      initialOmittedByBudgetCount: 0,
      initialFailedFileCount: 0,
    });
    const result = formatWithinBudget({
      headSha: "head-sha",
      changedFiles,
      relatedResults: [
        { status: "rejected", reason: new Error("request failed") },
        {
          status: "fulfilled",
          value: {
            candidate: {
              path: "src/missing.ts",
              source: "direct-import",
              size: null,
            },
            file: null,
          },
        },
        {
          status: "fulfilled",
          value: {
            candidate: {
              path: "src/too-large.ts",
              source: "direct-import",
              size: null,
            },
            file: { content: "x".repeat(6_001), sha: "large-sha" },
          },
        },
        {
          status: "fulfilled",
          value: {
            candidate: {
              path: "src/no-space.ts",
              source: "direct-import",
              size: 20,
            },
            file: { content: "export const related = true;", sha: "related-sha" },
          },
        },
      ],
      treeStatus: "complete",
      budget: {
        ...baseBudget,
        totalCharacters: baseResult.content.length,
      },
      initialOmittedByBudgetCount: 2,
      initialFailedFileCount: 1,
    });

    expect(result.manifest.map((entry) => entry.path)).toEqual([
      "src/included.ts",
    ]);
    expect(result.omittedByBudgetCount).toBe(5);
    expect(result.failedFileCount).toBe(3);
  });

  it("produces stable content and manifest order for identical input", () => {
    const params = {
      headSha: "head-sha",
      changedFiles: [{
        change: {
          filePath: "src/foo.ts",
          changeType: "modified" as const,
          addedLines: [1],
        },
        content: "export const foo = true;",
      }],
      relatedResults: [],
      treeStatus: "complete" as const,
      budget: getDeterministicContextBudget("small"),
      initialOmittedByBudgetCount: 0,
      initialFailedFileCount: 0,
    };

    expect(formatWithinBudget(params)).toEqual(formatWithinBudget(params));
  });
});
