import { beforeEach, describe, expect, it, vi } from "vitest";

const octokitMocks = vi.hoisted(() => ({
  pullsGet: vi.fn(),
  reposGetCommit: vi.fn(),
  reposGetContent: vi.fn(),
  gitGetTree: vi.fn(),
}));

vi.mock("octokit", () => ({
  Octokit: class MockOctokit {
    rest = {
      pulls: { get: octokitMocks.pullsGet },
      repos: {
        getCommit: octokitMocks.reposGetCommit,
        getContent: octokitMocks.reposGetContent,
      },
      git: { getTree: octokitMocks.gitGetTree },
    };
  },
}));

vi.mock("@/lib/server-utils", () => ({
  requireAuthSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    account: { findFirst: vi.fn() },
  },
}));

import {
  getFileContent,
  getPullRequestDiff,
  getRepositoryFileTree,
} from "./github";

type PullRequestOverrides = {
  headSha?: string;
  baseSha?: string;
  updatedAt?: string;
  headRepository?: { owner: string; repo: string } | null;
};

function createPullRequest(overrides: PullRequestOverrides = {}) {
  const headRepository = overrides.headRepository === undefined
    ? { owner: "head-owner", repo: "head-repo" }
    : overrides.headRepository;

  return {
    title: "Stable PR",
    body: "Description",
    additions: 4,
    deletions: 2,
    changed_files: 1,
    updated_at: overrides.updatedAt ?? "2026-08-04T00:00:00Z",
    base: { sha: overrides.baseSha ?? "base-sha" },
    head: {
      sha: overrides.headSha ?? "head-sha",
      ref: "feature-branch",
      repo: headRepository
        ? {
            name: headRepository.repo,
            owner: { login: headRepository.owner },
          }
        : null,
    },
    state: "open",
    merged: false,
  };
}

function queuePullRequestAttempt(
  before: ReturnType<typeof createPullRequest>,
  after: ReturnType<typeof createPullRequest>,
  diff = "diff body",
): void {
  octokitMocks.pullsGet
    .mockResolvedValueOnce({ data: before })
    .mockResolvedValueOnce({ data: diff })
    .mockResolvedValueOnce({ data: after });
}

describe("getPullRequestDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns metadata from the after read when the first snapshot is stable", async () => {
    const pullRequest = createPullRequest();
    queuePullRequestAttempt(pullRequest, pullRequest);

    const result = await getPullRequestDiff({
      token: "token",
      owner: "base-owner",
      repo: "base-repo",
      prNumber: 7,
    });

    expect(result).toMatchObject({
      diff: "diff body",
      baseSha: "base-sha",
      headSha: "head-sha",
      headRepository: { owner: "head-owner", repo: "head-repo" },
    });
    expect(octokitMocks.pullsGet).toHaveBeenCalledTimes(3);
    expect(octokitMocks.pullsGet.mock.calls[1][0]).toMatchObject({
      mediaType: { format: "diff" },
    });
    expect(octokitMocks.pullsGet.mock.calls[0][0]).not.toHaveProperty("mediaType");
    expect(octokitMocks.pullsGet.mock.calls[2][0]).not.toHaveProperty("mediaType");
  });

  it.each([
    ["head SHA", { headSha: "changed-head" }],
    ["base SHA", { baseSha: "changed-base" }],
    ["updated_at", { updatedAt: "2026-08-04T00:00:01Z" }],
  ] as const)(
    "discards a snapshot when only %s changes and returns the stable retry",
    async (_field, changedAfterOverrides) => {
      queuePullRequestAttempt(
        createPullRequest(),
        createPullRequest(changedAfterOverrides),
        "stale diff",
      );
      const stableRetry = createPullRequest({
        headSha: "retry-head",
        baseSha: "retry-base",
        updatedAt: "2026-08-04T00:01:00Z",
      });
      queuePullRequestAttempt(stableRetry, stableRetry, "stable diff");

      const result = await getPullRequestDiff({
        token: "token",
        owner: "base-owner",
        repo: "base-repo",
        prNumber: 7,
      });

      expect(result).toMatchObject({
        diff: "stable diff",
        headSha: "retry-head",
        baseSha: "retry-base",
      });
      expect(octokitMocks.pullsGet).toHaveBeenCalledTimes(6);
    },
  );

  it("rejects with a generic error when both snapshots are unstable", async () => {
    queuePullRequestAttempt(
      createPullRequest(),
      createPullRequest({ headSha: "changed-head-1" }),
    );
    queuePullRequestAttempt(
      createPullRequest({ headSha: "changed-head-1" }),
      createPullRequest({ headSha: "changed-head-2" }),
    );

    await expect(getPullRequestDiff({
      token: "token",
      owner: "base-owner",
      repo: "base-repo",
      prNumber: 7,
    })).rejects.toThrow(
      "Pull request changed while fetching a stable diff snapshot",
    );
  });

  it("returns a null head repository for a deleted fork without base fallback", async () => {
    const pullRequest = createPullRequest({ headRepository: null });
    queuePullRequestAttempt(pullRequest, pullRequest);

    const result = await getPullRequestDiff({
      token: "token",
      owner: "base-owner",
      repo: "base-repo",
      prNumber: 7,
    });

    expect(result.headRepository).toBeNull();
  });
});

describe("getRepositoryFileTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitMocks.reposGetCommit.mockResolvedValue({
      data: { commit: { tree: { sha: "tree-sha" } } },
    });
    octokitMocks.gitGetTree.mockResolvedValue({
      data: {
        tree: [
          { type: "blob", path: "src/file.ts", size: 120 },
          { type: "blob", path: "src/unknown-size.ts" },
          { type: "tree", path: "src" },
          { type: "blob" },
        ],
        truncated: true,
      },
    });
  });

  it("maps exact-commit blob entries and preserves size and truncation", async () => {
    const result = await getRepositoryFileTree({
      token: "token",
      owner: "owner",
      repo: "repo",
      commitSha: "commit-sha",
    });

    expect(octokitMocks.reposGetCommit).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      ref: "commit-sha",
    });
    expect(octokitMocks.gitGetTree).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      tree_sha: "tree-sha",
      recursive: "true",
    });
    expect(result).toEqual({
      files: [
        { path: "src/file.ts", size: 120 },
        { path: "src/unknown-size.ts", size: null },
      ],
      truncated: true,
    });
  });

  it("passes one shared signal to both exact-commit requests", async () => {
    const controller = new AbortController();

    await getRepositoryFileTree({
      token: "token",
      owner: "owner",
      repo: "repo",
      commitSha: "commit-sha",
      signal: controller.signal,
    });

    expect(octokitMocks.reposGetCommit.mock.calls[0][0].request.signal).toBe(
      controller.signal,
    );
    expect(octokitMocks.gitGetTree.mock.calls[0][0].request.signal).toBe(
      controller.signal,
    );
  });
});

describe("getFileContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("decodes file content without adding a request object when signal is omitted", async () => {
    octokitMocks.reposGetContent.mockResolvedValue({
      data: {
        type: "file",
        content: Buffer.from("source text").toString("base64"),
        sha: "file-sha",
      },
    });

    const result = await getFileContent({
      token: "token",
      owner: "owner",
      repo: "repo",
      path: "src/file.ts",
      ref: "commit-sha",
    });

    expect(result).toEqual({ content: "source text", sha: "file-sha" });
    expect(octokitMocks.reposGetContent.mock.calls[0][0]).not.toHaveProperty("request");
  });

  it("passes the context deadline signal to the contents request", async () => {
    const controller = new AbortController();
    octokitMocks.reposGetContent.mockResolvedValue({
      data: {
        type: "file",
        content: Buffer.from("source text").toString("base64"),
        sha: "file-sha",
      },
    });

    await getFileContent({
      token: "token",
      owner: "owner",
      repo: "repo",
      path: "src/file.ts",
      ref: "commit-sha",
      signal: controller.signal,
    });

    expect(octokitMocks.reposGetContent.mock.calls[0][0].request.signal).toBe(
      controller.signal,
    );
  });

  it("returns null for a 404 response", async () => {
    octokitMocks.reposGetContent.mockRejectedValue(
      Object.assign(new Error("not found"), { status: 404 }),
    );

    await expect(getFileContent({
      token: "token",
      owner: "owner",
      repo: "repo",
      path: "src/missing.ts",
      ref: "commit-sha",
    })).resolves.toBeNull();
  });
});
