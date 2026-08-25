import fs from "node:fs";
import { createHash } from "node:crypto";
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
const NOW = new Date("2026-08-25T00:00:00.000Z");
const TRANSPORT_BINDING = {
  kind: "GITHUB_WEBHOOK",
  deliveryRowId: "delivery-row-1",
  leaseToken: "delivery-lease-1",
} as const;

function createDependencies(
  overrides: Partial<GithubWebhookHandlerDependencies> = {},
): GithubWebhookHandlerDependencies {
  return {
    verifySignature: vi.fn(() => true),
    acquireDelivery: vi.fn<
      GithubWebhookHandlerDependencies["acquireDelivery"]
    >(async () => ({
      kind: "acquired",
      deliveryRowId: TRANSPORT_BINDING.deliveryRowId,
      leaseToken: TRANSPORT_BINDING.leaseToken,
      attempt: 1,
      requestKey: null,
    })),
    completeDelivery: vi.fn(async () => undefined),
    failDelivery: vi.fn(async () => undefined),
    queueReview: vi.fn<GithubWebhookHandlerDependencies["queueReview"]>(
      async () => ({
        success: true,
        message: "Review Queued",
        reviewId: "review-1",
        requestKey: "review-request-1",
        status: "PENDING",
      }),
    ),
    queueSummary: vi.fn<GithubWebhookHandlerDependencies["queueSummary"]>(
      async () => ({
        success: true,
        message: "Summary Queued",
        reviewId: "summary-1",
        requestKey: "summary-request-1",
        status: "PENDING",
      }),
    ),
    resumeRequest: vi.fn<
      GithubWebhookHandlerDependencies["resumeRequest"]
    >(async (requestKey) => ({
      kind: "existing",
      reviewId: "review-1",
      requestKey,
      status: "PENDING",
    })),
    handleSynchronize: vi.fn<
      GithubWebhookHandlerDependencies["handleSynchronize"]
    >(async () => ({ type: "continue" })),
    finalizeMergedPullRequest: vi.fn(async () => undefined),
    now: vi.fn(() => NOW),
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
      { ...PULL_REQUEST_IDENTITY, transportBinding: TRANSPORT_BINDING },
    );
    expect(dependencies.acquireDelivery).toHaveBeenCalledWith({
      deliveryId: "delivery-1",
      payloadSha256: createHash("sha256")
        .update(JSON.stringify(createPullRequestPayload("opened")))
        .digest("hex"),
      event: "pull_request",
      action: "opened",
      now: NOW,
    });
    expect(dependencies.completeDelivery).toHaveBeenCalledWith({
      deliveryRowId: TRANSPORT_BINDING.deliveryRowId,
      leaseToken: TRANSPORT_BINDING.leaseToken,
      requestKey: "review-request-1",
      now: NOW,
    });
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
      { ...PULL_REQUEST_IDENTITY, transportBinding: TRANSPORT_BINDING },
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
    expect(dependencies.acquireDelivery).not.toHaveBeenCalled();
    expect(dependencies.queueReview).not.toHaveBeenCalled();
    expect(dependencies.queueSummary).not.toHaveBeenCalled();
    expect(dependencies.handleSynchronize).not.toHaveBeenCalled();
    expect(dependencies.finalizeMergedPullRequest).not.toHaveBeenCalled();
  });

  it("treats factual review rejection as processed instead of an operational retry", async () => {
    const dependencies = createDependencies({
      queueReview: vi.fn<GithubWebhookHandlerDependencies["queueReview"]>(
        async () => ({
          success: false,
          message: "The pull request is closed",
          reason: "pr_not_reviewable",
        }),
      ),
    });
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput("pull_request", createPullRequestPayload("opened")),
    );

    expect(response).toEqual({
      status: 200,
      body: { message: "The pull request is closed" },
    });
    expect(dependencies.completeDelivery).toHaveBeenCalledOnce();
    expect(dependencies.failDelivery).not.toHaveBeenCalled();
  });

  it("checks the delivery header only after a valid signature", async () => {
    const dependencies = createDependencies();
    const handler = createGithubWebhookHandler(dependencies);
    const input = createInput(
      "pull_request",
      createPullRequestPayload("opened"),
    );
    input.deliveryId = null;

    const response = await handler(input);

    expect(response).toEqual({
      status: 400,
      body: { error: "Missing x-github-delivery header" },
    });
    expect(dependencies.verifySignature).toHaveBeenCalledOnce();
    expect(dependencies.acquireDelivery).not.toHaveBeenCalled();
  });

  it("does not acquire a delivery before a signed payload parses", async () => {
    const dependencies = createDependencies();
    const handler = createGithubWebhookHandler(dependencies);
    const input = createInput("pull_request", {});
    input.rawBody = "{";

    const response = await handler(input);

    expect(response).toEqual({
      status: 500,
      body: { error: "Error processing webhook" },
    });
    expect(dependencies.acquireDelivery).not.toHaveBeenCalled();
    expect(dependencies.queueReview).not.toHaveBeenCalled();
  });

  it("returns processed for a completed duplicate without replaying side effects", async () => {
    const dependencies = createDependencies({
      acquireDelivery: vi.fn<
        GithubWebhookHandlerDependencies["acquireDelivery"]
      >(async () => ({ kind: "processed" })),
    });
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput("pull_request", createPullRequestPayload("synchronize")),
    );

    expect(response).toEqual({
      status: 200,
      body: { message: "Event already processed" },
    });
    expect(dependencies.queueReview).not.toHaveBeenCalled();
    expect(dependencies.handleSynchronize).not.toHaveBeenCalled();
    expect(dependencies.completeDelivery).not.toHaveBeenCalled();
  });

  it("returns accepted for an actively processing duplicate", async () => {
    const dependencies = createDependencies({
      acquireDelivery: vi.fn<
        GithubWebhookHandlerDependencies["acquireDelivery"]
      >(async () => ({ kind: "processing" })),
    });
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput("pull_request", createPullRequestPayload("opened")),
    );

    expect(response).toEqual({
      status: 202,
      body: { message: "Event processing" },
    });
    expect(dependencies.queueReview).not.toHaveBeenCalled();
  });

  it("fails a delivery with the bound request key after confirmed dispatch failure", async () => {
    const dependencies = createDependencies({
      queueReview: vi.fn<GithubWebhookHandlerDependencies["queueReview"]>(
        async () => ({
          success: false,
          message: "The review request could not be dispatched.",
          reason: "internal_error",
          reviewId: "review-1",
          requestKey: "review-request-1",
          status: "FAILED",
          failureStage: "QUEUE",
        }),
      ),
    });
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput("pull_request", createPullRequestPayload("opened")),
    );

    expect(response.status).toBe(500);
    expect(dependencies.failDelivery).toHaveBeenCalledWith({
      deliveryRowId: TRANSPORT_BINDING.deliveryRowId,
      leaseToken: TRANSPORT_BINDING.leaseToken,
      requestKey: "review-request-1",
      errorCode: "REQUEST_DISPATCH_FAILED",
      errorMessage: "The review request could not be dispatched.",
    });
    expect(dependencies.completeDelivery).not.toHaveBeenCalled();
  });

  it("resumes an already bound request without re-running event handlers", async () => {
    const dependencies = createDependencies({
      acquireDelivery: vi.fn<
        GithubWebhookHandlerDependencies["acquireDelivery"]
      >(async () => ({
          kind: "acquired",
          deliveryRowId: TRANSPORT_BINDING.deliveryRowId,
          leaseToken: TRANSPORT_BINDING.leaseToken,
          attempt: 2,
          requestKey: "review-request-1",
        })),
    });
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput("pull_request", createPullRequestPayload("synchronize")),
    );

    expect(response).toEqual({
      status: 200,
      body: { message: "Event Processed" },
    });
    expect(dependencies.resumeRequest).toHaveBeenCalledWith(
      "review-request-1",
    );
    expect(dependencies.queueReview).not.toHaveBeenCalled();
    expect(dependencies.handleSynchronize).not.toHaveBeenCalled();
    expect(dependencies.completeDelivery).toHaveBeenCalledWith({
      deliveryRowId: TRANSPORT_BINDING.deliveryRowId,
      leaseToken: TRANSPORT_BINDING.leaseToken,
      requestKey: "review-request-1",
      now: NOW,
    });
  });

  it("fails safely when a bound delivery no longer has its review", async () => {
    const dependencies = createDependencies({
      acquireDelivery: vi.fn<
        GithubWebhookHandlerDependencies["acquireDelivery"]
      >(async () => ({
        kind: "acquired",
        deliveryRowId: TRANSPORT_BINDING.deliveryRowId,
        leaseToken: TRANSPORT_BINDING.leaseToken,
        attempt: 2,
        requestKey: "missing-request",
      })),
      resumeRequest: vi.fn(async () => {
        throw { code: "DELIVERY_REQUEST_NOT_FOUND" };
      }),
    });
    const handler = createGithubWebhookHandler(dependencies);

    const response = await handler(
      createInput("pull_request", createPullRequestPayload("opened")),
    );

    expect(response).toEqual({
      status: 500,
      body: {
        error: "The review request bound to this delivery was not found.",
      },
    });
    expect(dependencies.failDelivery).toHaveBeenCalledWith({
      deliveryRowId: TRANSPORT_BINDING.deliveryRowId,
      leaseToken: TRANSPORT_BINDING.leaseToken,
      requestKey: "missing-request",
      errorCode: "DELIVERY_REQUEST_NOT_FOUND",
      errorMessage: "The review request bound to this delivery was not found.",
    });
    expect(dependencies.queueReview).not.toHaveBeenCalled();
  });

  it("marks ping and ignored events processed after acquiring their delivery", async () => {
    const dependencies = createDependencies();
    const handler = createGithubWebhookHandler(dependencies);

    await expect(handler(createInput("ping", {}))).resolves.toEqual({
      status: 200,
      body: { message: "Pong" },
    });
    await expect(handler(createInput("unknown", {}))).resolves.toEqual({
      status: 200,
      body: { message: "Ignored" },
    });
    expect(dependencies.completeDelivery).toHaveBeenCalledTimes(2);
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
