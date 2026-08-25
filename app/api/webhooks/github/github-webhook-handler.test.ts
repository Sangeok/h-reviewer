import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createGithubWebhookHandler,
  handleGithubWebhook,
  type GithubWebhookHandlerDependencies,
  type GithubWebhookInput,
} from "./github-webhook-handler";

const PULL_REQUEST_IDENTITY = {
  owner: "octo",
  repo: "sample",
  prNumber: 42,
} as const;

function createDependencies(
  overrides: Partial<GithubWebhookHandlerDependencies> = {},
): GithubWebhookHandlerDependencies {
  return {
    verifySignature: vi.fn(() => true),
    queueReview: vi.fn<GithubWebhookHandlerDependencies["queueReview"]>(
      async () => ({ success: true, message: "Review Queued" }),
    ),
    queueSummary: vi.fn<GithubWebhookHandlerDependencies["queueSummary"]>(
      async () => ({ success: true, message: "Summary Queued" }),
    ),
    handleSynchronize: vi.fn<
      GithubWebhookHandlerDependencies["handleSynchronize"]
    >(async () => ({ type: "continue" })),
    finalizeMergedPullRequest: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createInput(
  event: string,
  body: Record<string, unknown>,
): GithubWebhookInput {
  return {
    event,
    deliveryId: "delivery-1",
    signature: "sha256=fixture",
    rawBody: JSON.stringify(body),
    secret: "secret",
  };
}

function createPullRequestPayload(
  action: string,
  pullRequest: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    action,
    number: PULL_REQUEST_IDENTITY.prNumber,
    repository: { full_name: "octo/sample" },
    pull_request: pullRequest,
  };
}

describe("createGithubWebhookHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues one review when a pull request is opened", async () => {
    const dependencies = createDependencies();
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput("pull_request", createPullRequestPayload("opened")),
    );

    expect(response).toEqual({
      status: 200,
      body: { message: "Event Processed" },
    });
    expect(dependencies.queueReview).toHaveBeenCalledOnce();
    expect(dependencies.queueReview).toHaveBeenCalledWith(
      PULL_REQUEST_IDENTITY,
    );
    expect(dependencies.handleSynchronize).not.toHaveBeenCalled();
  });

  it("reconciles and queues a review for a normal synchronize event", async () => {
    const dependencies = createDependencies();
    const handler = createGithubWebhookHandler(dependencies);
    const payload = {
      ...createPullRequestPayload("synchronize", {
        head: {
          repo: { name: "sample-fork", owner: { login: "contributor" } },
        },
      }),
      before: "before-sha",
      after: "after-sha",
    };

    const response = await handler(createInput("pull_request", payload));

    expect(response.status).toBe(200);
    expect(dependencies.handleSynchronize).toHaveBeenCalledWith({
      ...PULL_REQUEST_IDENTITY,
      fullName: "octo/sample",
      beforeSha: "before-sha",
      afterSha: "after-sha",
      headOwner: "contributor",
      headRepoName: "sample-fork",
    });
    expect(dependencies.queueReview).toHaveBeenCalledOnce();
  });

  it("skips queueing when synchronize is an HReviewer commit", async () => {
    const dependencies = createDependencies({
      handleSynchronize: vi.fn<
        GithubWebhookHandlerDependencies["handleSynchronize"]
      >(async () => ({
          type: "skip",
          message: "Skipped: HReviewer commit",
        })),
    });
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput(
        "pull_request",
        createPullRequestPayload("synchronize"),
      ),
    );

    expect(response).toEqual({
      status: 200,
      body: { message: "Skipped: HReviewer commit" },
    });
    expect(dependencies.queueReview).not.toHaveBeenCalled();
  });

  it("skips queueing when synchronize applies a native suggestion", async () => {
    const dependencies = createDependencies({
      handleSynchronize: vi.fn<
        GithubWebhookHandlerDependencies["handleSynchronize"]
      >(async () => ({
          type: "skip",
          message: "Skipped: native suggestion commit",
        })),
    });
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput(
        "pull_request",
        createPullRequestPayload("synchronize"),
      ),
    );

    expect(response).toEqual({
      status: 200,
      body: { message: "Skipped: native suggestion commit" },
    });
    expect(dependencies.queueReview).not.toHaveBeenCalled();
  });

  it("finalizes pending issues when a pull request is closed as merged", async () => {
    const dependencies = createDependencies();
    const handler = createGithubWebhookHandler(dependencies);

    await handler(
      createInput(
        "pull_request",
        createPullRequestPayload("closed", { merged: true }),
      ),
    );

    expect(dependencies.finalizeMergedPullRequest).toHaveBeenCalledOnce();
    expect(dependencies.finalizeMergedPullRequest).toHaveBeenCalledWith(
      PULL_REQUEST_IDENTITY,
    );
  });

  it("does not finalize issues when a closed pull request was not merged", async () => {
    const dependencies = createDependencies();
    const handler = createGithubWebhookHandler(dependencies);

    await handler(
      createInput(
        "pull_request",
        createPullRequestPayload("closed", { merged: false }),
      ),
    );

    expect(dependencies.finalizeMergedPullRequest).not.toHaveBeenCalled();
  });

  it("dispatches summary but preserves the current ignored review command", async () => {
    const dependencies = createDependencies();
    const handler = createGithubWebhookHandler(dependencies);
    const payload = (command: string) => ({
      action: "created",
      repository: { full_name: "octo/sample" },
      issue: { number: 42, pull_request: { url: "fixture" } },
      comment: { body: command },
    });

    await handler(createInput("issue_comment", payload("@hreviewer summary")));
    await handler(createInput("issue_comment", payload("@hreviewer review")));

    expect(dependencies.queueSummary).toHaveBeenCalledOnce();
    expect(dependencies.queueSummary).toHaveBeenCalledWith(
      PULL_REQUEST_IDENTITY,
    );
    expect(dependencies.queueReview).not.toHaveBeenCalled();
  });

  it("verifies an invalid signature once and performs no side effects", async () => {
    const dependencies = createDependencies({
      verifySignature: vi.fn(() => false),
    });
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput("pull_request", createPullRequestPayload("opened")),
    );

    expect(response).toEqual({
      status: 401,
      body: { error: "Invalid signature" },
    });
    expect(dependencies.verifySignature).toHaveBeenCalledOnce();
    expect(dependencies.queueReview).not.toHaveBeenCalled();
    expect(dependencies.queueSummary).not.toHaveBeenCalled();
    expect(dependencies.handleSynchronize).not.toHaveBeenCalled();
    expect(dependencies.finalizeMergedPullRequest).not.toHaveBeenCalled();
  });
});

describe("default GitHub webhook composition", () => {
  it("loads with an explicit server-only mock and preserves the production guard", () => {
    const databaseSource = fs.readFileSync(
      path.resolve(process.cwd(), "lib/db.ts"),
      "utf8",
    );

    expect(handleGithubWebhook).toBeTypeOf("function");
    expect(databaseSource).toContain('import "server-only"');
  });
});
