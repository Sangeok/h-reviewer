import crypto from "node:crypto";

import {
  generatePRSummary,
  parseCommand,
  reviewPullRequest,
  type GeneratePRSummaryResult,
  type ReviewPullRequestResult,
} from "@/features/ai";
import { reconcileIssueResolutions } from "@/features/review/lib/reconcile-issue-resolutions";
import {
  resumeReviewRequest,
  type CreateReviewRequestResult,
} from "@/features/review/lib/review-request";
import { reconcileNativeSuggestions } from "@/features/suggestion/lib/reconcile-native-suggestions";
import prisma from "@/lib/db";
import {
  acquireGithubWebhookDelivery,
  completeGithubWebhookDelivery,
  failGithubWebhookDelivery,
  GithubWebhookDeliveryError,
  type GithubWebhookTransportBinding,
} from "@/lib/github/github-webhook-delivery";

export type GithubWebhookInput = {
  event: string | null;
  deliveryId: string | null;
  signature: string | null;
  rawBody: string;
  secret: string | undefined;
};

export type GithubWebhookResponse = {
  status: number;
  body: { message?: string; error?: string };
};

export type PullRequestIdentity = {
  owner: string;
  repo: string;
  prNumber: number;
};

export type SynchronizeInput = PullRequestIdentity & {
  fullName: string;
  beforeSha: string | undefined;
  afterSha: string | undefined;
  headOwner: string | undefined;
  headRepoName: string | undefined;
};

export type SynchronizeResult =
  | { type: "continue" }
  | {
      type: "skip";
      message: "Skipped: HReviewer commit" | "Skipped: native suggestion commit";
    };

export type GithubWebhookHandlerDependencies = {
  verifySignature(input: {
    rawBody: string;
    signature: string | null;
    secret: string;
  }): boolean;
  acquireDelivery: typeof acquireGithubWebhookDelivery;
  completeDelivery: typeof completeGithubWebhookDelivery;
  failDelivery: typeof failGithubWebhookDelivery;
  queueReview(
    input: PullRequestIdentity & {
      transportBinding: GithubWebhookTransportBinding;
    },
  ): Promise<ReviewPullRequestResult>;
  queueSummary(
    input: PullRequestIdentity & {
      transportBinding: GithubWebhookTransportBinding;
    },
  ): Promise<GeneratePRSummaryResult>;
  resumeRequest(requestKey: string): Promise<CreateReviewRequestResult>;
  handleSynchronize(input: SynchronizeInput): Promise<SynchronizeResult>;
  finalizeMergedPullRequest(input: PullRequestIdentity): Promise<void>;
  now(): Date;
};

type RepoFullNameParts = {
  owner: string;
  repo: string;
  fullName: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRepoFullName(value: unknown): RepoFullNameParts | null {
  if (typeof value !== "string") return null;

  const fullName = value.trim();
  const parts = fullName.split("/");
  if (parts.length !== 2) return null;

  const [owner, repo] = parts;
  if (!owner || !repo) return null;

  return { owner, repo, fullName };
}

function parsePrNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function parseHeadRepository(body: Record<string, unknown>): {
  headOwner: string | undefined;
  headRepoName: string | undefined;
} {
  const pullRequest = body["pull_request"];
  const head = isRecord(pullRequest) ? pullRequest["head"] : undefined;
  const headRepository = isRecord(head) ? head["repo"] : undefined;
  const headRepositoryOwner = isRecord(headRepository)
    ? headRepository["owner"]
    : undefined;

  return {
    headOwner:
      isRecord(headRepositoryOwner) &&
      typeof headRepositoryOwner["login"] === "string"
        ? headRepositoryOwner["login"]
        : undefined,
    headRepoName:
      isRecord(headRepository) && typeof headRepository["name"] === "string"
        ? headRepository["name"]
        : undefined,
  };
}

function getPullRequestIdentity(
  body: Record<string, unknown>,
): (PullRequestIdentity & { fullName: string }) | null {
  const repository = body["repository"];
  const repoInfo = parseRepoFullName(
    isRecord(repository) ? repository["full_name"] : undefined,
  );
  const prNumber = parsePrNumber(body["number"]);

  if (!repoInfo || prNumber === null) return null;

  return {
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    prNumber,
    fullName: repoInfo.fullName,
  };
}

function verifyGithubSignature(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
}): boolean {
  const { rawBody, signature, secret } = input;
  if (!signature || !signature.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (received.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(received, expectedBuffer);
}

async function handleSynchronize(
  input: SynchronizeInput,
): Promise<SynchronizeResult> {
  const {
    owner,
    repo,
    prNumber,
    fullName,
    beforeSha,
    afterSha,
    headOwner,
    headRepoName,
  } = input;

  if (!afterSha) return { type: "continue" };

  const baseRepository = await prisma.repository.findFirst({
    where: { owner, name: repo },
  });
  if (!baseRepository) return { type: "continue" };

  const appliedSuggestion = await prisma.suggestion.findFirst({
    where: {
      appliedCommitSha: afterSha,
      review: { repositoryId: baseRepository.id, prNumber },
    },
  });

  if (appliedSuggestion) {
    console.info(
      `Skipping review for ${fullName} #${prNumber}: commit ${afterSha} is from HReviewer apply fix`,
    );
    return { type: "skip", message: "Skipped: HReviewer commit" };
  }

  if (!beforeSha || !headOwner || !headRepoName) {
    return { type: "continue" };
  }

  const account = await prisma.account.findFirst({
    where: { userId: baseRepository.userId, providerId: "github" },
    select: { accessToken: true },
  });
  if (!account?.accessToken) return { type: "continue" };

  const reconcileResult = await reconcileNativeSuggestions({
    token: account.accessToken,
    headOwner,
    headRepoName,
    baseRepositoryId: baseRepository.id,
    prNumber,
    beforeSha,
    afterSha,
  });

  if (reconcileResult.matchedSuggestionIds.length > 0) {
    await prisma.suggestion.updateMany({
      where: {
        id: { in: reconcileResult.matchedSuggestionIds },
        status: "PENDING",
      },
      data: {
        status: "APPLIED",
        appliedAt: new Date(),
        appliedCommitSha: afterSha,
        appliedSource: "GITHUB_NATIVE",
      },
    });
  }

  try {
    await reconcileIssueResolutions({
      token: account.accessToken,
      headOwner,
      headRepoName,
      baseRepositoryId: baseRepository.id,
      prNumber,
      beforeSha,
      afterSha,
    });
  } catch (error) {
    console.warn(
      `reconcileIssueResolutions failed for ${fullName} #${prNumber}:`,
      error,
    );
  }

  if (reconcileResult.skipReview) {
    console.info(
      `Skipping review for ${fullName} #${prNumber}: native suggestion commit`,
    );
    return { type: "skip", message: "Skipped: native suggestion commit" };
  }

  return { type: "continue" };
}

async function finalizeMergedPullRequest(
  input: PullRequestIdentity,
): Promise<void> {
  const { owner, repo, prNumber } = input;
  const baseRepository = await prisma.repository.findFirst({
    where: { owner, name: repo },
  });
  if (!baseRepository) return;

  const reviews = await prisma.review.findMany({
    where: { repositoryId: baseRepository.id, prNumber },
    select: { id: true },
  });
  if (reviews.length === 0) return;

  const { count } = await prisma.reviewIssue.updateMany({
    where: {
      reviewId: { in: reviews.map((review) => review.id) },
      resolutionStatus: "PENDING",
    },
    data: { resolutionStatus: "IGNORED", resolvedAt: new Date() },
  });

  console.info(
    `Finalized ${count} pending issues as IGNORED for ${owner}/${repo} #${prNumber}`,
  );
}

function createDefaultDependencies(): GithubWebhookHandlerDependencies {
  return {
    verifySignature: verifyGithubSignature,
    acquireDelivery: acquireGithubWebhookDelivery,
    completeDelivery: completeGithubWebhookDelivery,
    failDelivery: failGithubWebhookDelivery,
    queueReview: (input) => reviewPullRequest(input),
    queueSummary: (input) => generatePRSummary(input),
    resumeRequest: (requestKey) => resumeReviewRequest(requestKey),
    handleSynchronize,
    finalizeMergedPullRequest,
    now: () => new Date(),
  };
}

type EventProcessingResult = {
  response: GithubWebhookResponse;
  requestKey?: string;
  operationalFailure?: {
    code: string;
    message: string;
  };
};

function getResultRequestKey(result: {
  requestKey?: string;
}): string | undefined {
  return typeof result.requestKey === "string" ? result.requestKey : undefined;
}

function createOperationalFailureResult(
  response: GithubWebhookResponse,
  requestKey?: string,
): EventProcessingResult {
  return {
    response,
    ...(requestKey === undefined ? {} : { requestKey }),
    operationalFailure: {
      code: "REQUEST_DISPATCH_FAILED",
      message: "The review request could not be dispatched.",
    },
  };
}

async function processGithubEvent(input: {
  event: string;
  body: unknown;
  transportBinding: GithubWebhookTransportBinding;
  dependencies: GithubWebhookHandlerDependencies;
}): Promise<EventProcessingResult> {
  const { event, body, transportBinding, dependencies } = input;

  if (event === "ping") {
    return { response: { status: 200, body: { message: "Pong" } } };
  }

  if (!isRecord(body)) {
    return {
      response: {
        status: 200,
        body: { message: "Ignored: invalid payload" },
      },
    };
  }

  if (event === "pull_request") {
    const action = body["action"];
    const identity = getPullRequestIdentity(body);

    if (typeof action !== "string" || !identity) {
      return {
        response: {
          status: 200,
          body: { message: "Ignored: malformed pull_request payload" },
        },
      };
    }

    const { fullName, ...pullRequestIdentity } = identity;

    if (action === "opened" || action === "synchronize") {
      if (action === "synchronize") {
        const { headOwner, headRepoName } = parseHeadRepository(body);
        const synchronizeResult = await dependencies.handleSynchronize({
          ...pullRequestIdentity,
          fullName,
          beforeSha:
            typeof body["before"] === "string" ? body["before"] : undefined,
          afterSha:
            typeof body["after"] === "string" ? body["after"] : undefined,
          headOwner,
          headRepoName,
        });

        if (synchronizeResult.type === "skip") {
          return {
            response: {
              status: 200,
              body: { message: synchronizeResult.message },
            },
          };
        }
      }

      const reviewResult = await dependencies.queueReview({
        ...pullRequestIdentity,
        transportBinding,
      });
      const requestKey = getResultRequestKey(reviewResult);

      if (!reviewResult.success) {
        if (reviewResult.reason !== "internal_error") {
          console.info(
            `Review skipped for ${fullName} #${identity.prNumber}: ${reviewResult.message}`,
          );
          return {
            response: {
              status: 200,
              body: { message: reviewResult.message },
            },
            ...(requestKey === undefined ? {} : { requestKey }),
          };
        }

        console.error(
          `Review queueing failed for ${fullName} #${identity.prNumber}`,
        );
        return createOperationalFailureResult(
          { status: 500, body: { error: reviewResult.message } },
          requestKey,
        );
      }

      console.log(`Review queued for ${fullName} #${identity.prNumber}`);
      return {
        response: { status: 200, body: { message: "Event Processed" } },
        requestKey: reviewResult.requestKey,
      };
    }

    if (action === "closed") {
      const pullRequest = body["pull_request"];
      const isMerged =
        isRecord(pullRequest) && pullRequest["merged"] === true;

      if (isMerged) {
        await dependencies.finalizeMergedPullRequest(pullRequestIdentity);
      }
    }

    return {
      response: { status: 200, body: { message: "Event Processed" } },
    };
  }

  if (event === "issue_comment") {
    if (body["action"] !== "created") {
      return { response: { status: 200, body: { message: "Ignored" } } };
    }

    const issue = body["issue"];
    const comment = body["comment"];
    const repository = body["repository"];
    const isPullRequest = isRecord(issue) && issue["pull_request"] != null;

    if (!isPullRequest) {
      return {
        response: { status: 200, body: { message: "Not a PR comment" } },
      };
    }

    const commentBody = isRecord(comment) ? comment["body"] : undefined;
    const repoInfo = parseRepoFullName(
      isRecord(repository) ? repository["full_name"] : undefined,
    );
    const prNumber = parsePrNumber(
      isRecord(issue) ? issue["number"] : undefined,
    );

    if (typeof commentBody !== "string" || !repoInfo || prNumber === null) {
      return {
        response: {
          status: 200,
          body: { message: "Ignored: malformed issue_comment payload" },
        },
      };
    }

    const command = parseCommand(commentBody);

    if (command?.type === "summary") {
      const summaryResult = await dependencies.queueSummary({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        prNumber,
        transportBinding,
      });
      const requestKey = getResultRequestKey(summaryResult);

      if (!summaryResult.success) {
        if (summaryResult.reason !== "internal_error") {
          console.info(
            `Summary skipped for ${repoInfo.fullName} #${prNumber}: ${summaryResult.message}`,
          );
          return {
            response: {
              status: 200,
              body: { message: summaryResult.message },
            },
            ...(requestKey === undefined ? {} : { requestKey }),
          };
        }

        console.error(
          `Summary queueing failed for ${repoInfo.fullName} #${prNumber}`,
        );
        return createOperationalFailureResult(
          { status: 500, body: { error: summaryResult.message } },
          requestKey,
        );
      }

      console.log(`Summary queued for ${repoInfo.fullName} #${prNumber}`);
      return {
        response: { status: 200, body: { message: "Event Processed" } },
        requestKey: summaryResult.requestKey,
      };
    }

    return {
      response: { status: 200, body: { message: "Event Processed" } },
    };
  }

  return { response: { status: 200, body: { message: "Ignored" } } };
}

function getSafeFailure(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof GithubWebhookDeliveryError) {
    return { code: error.code, message: error.message };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "DELIVERY_REQUEST_NOT_FOUND"
  ) {
    return {
      code: "DELIVERY_REQUEST_NOT_FOUND",
      message: "The review request bound to this delivery was not found.",
    };
  }

  return {
    code: "WEBHOOK_PROCESSING_FAILED",
    message: "Error processing webhook",
  };
}

export function createGithubWebhookHandler(
  dependencies: GithubWebhookHandlerDependencies,
): (input: GithubWebhookInput) => Promise<GithubWebhookResponse> {
  return async (input) => {
    let acquiredDelivery:
      | Extract<
          Awaited<ReturnType<typeof acquireGithubWebhookDelivery>>,
          { kind: "acquired" }
        >
      | undefined;
    let requestKey: string | undefined;

    try {
      if (!input.event) {
        return {
          status: 400,
          body: { error: "Missing x-github-event header" },
        };
      }

      if (
        !input.secret ||
        !dependencies.verifySignature({
          rawBody: input.rawBody,
          signature: input.signature,
          secret: input.secret,
        })
      ) {
        return { status: 401, body: { error: "Invalid signature" } };
      }

      if (!input.deliveryId) {
        return {
          status: 400,
          body: { error: "Missing x-github-delivery header" },
        };
      }

      const body: unknown = JSON.parse(input.rawBody);
      const action =
        isRecord(body) && typeof body["action"] === "string"
          ? body["action"]
          : null;
      const payloadSha256 = crypto
        .createHash("sha256")
        .update(input.rawBody)
        .digest("hex");
      const acquireResult = await dependencies.acquireDelivery({
        deliveryId: input.deliveryId,
        payloadSha256,
        event: input.event,
        action,
        now: dependencies.now(),
      });

      if (acquireResult.kind === "processed") {
        return { status: 200, body: { message: "Event already processed" } };
      }

      if (acquireResult.kind === "processing") {
        return { status: 202, body: { message: "Event processing" } };
      }

      acquiredDelivery = acquireResult;
      requestKey = acquireResult.requestKey ?? undefined;

      if (requestKey) {
        const resumeResult = await dependencies.resumeRequest(requestKey);

        if (resumeResult.kind === "dispatch-failed") {
          await dependencies.failDelivery({
            deliveryRowId: acquiredDelivery.deliveryRowId,
            leaseToken: acquiredDelivery.leaseToken,
            requestKey,
            errorCode: "REQUEST_DISPATCH_FAILED",
            errorMessage: resumeResult.message,
          });
          return { status: 500, body: { error: resumeResult.message } };
        }

        await dependencies.completeDelivery({
          deliveryRowId: acquiredDelivery.deliveryRowId,
          leaseToken: acquiredDelivery.leaseToken,
          requestKey,
          now: dependencies.now(),
        });
        return { status: 200, body: { message: "Event Processed" } };
      }

      const eventResult = await processGithubEvent({
        event: input.event,
        body,
        transportBinding: {
          kind: "GITHUB_WEBHOOK",
          deliveryRowId: acquiredDelivery.deliveryRowId,
          leaseToken: acquiredDelivery.leaseToken,
        },
        dependencies,
      });
      requestKey = eventResult.requestKey;

      if (eventResult.operationalFailure) {
        await dependencies.failDelivery({
          deliveryRowId: acquiredDelivery.deliveryRowId,
          leaseToken: acquiredDelivery.leaseToken,
          ...(requestKey === undefined ? {} : { requestKey }),
          errorCode: eventResult.operationalFailure.code,
          errorMessage: eventResult.operationalFailure.message,
        });
        return eventResult.response;
      }

      await dependencies.completeDelivery({
        deliveryRowId: acquiredDelivery.deliveryRowId,
        leaseToken: acquiredDelivery.leaseToken,
        ...(requestKey === undefined ? {} : { requestKey }),
        now: dependencies.now(),
      });
      return eventResult.response;
    } catch (error) {
      const safeFailure = getSafeFailure(error);

      if (acquiredDelivery) {
        try {
          await dependencies.failDelivery({
            deliveryRowId: acquiredDelivery.deliveryRowId,
            leaseToken: acquiredDelivery.leaseToken,
            ...(requestKey === undefined ? {} : { requestKey }),
            errorCode: safeFailure.code,
            errorMessage: safeFailure.message,
          });
        } catch {
          console.error("GitHub webhook failure lease was already lost");
        }
      }

      console.error(`Error processing webhook: ${safeFailure.code}`);
      return { status: 500, body: { error: safeFailure.message } };
    }
  };
}

export const handleGithubWebhook = createGithubWebhookHandler(
  createDefaultDependencies(),
);
