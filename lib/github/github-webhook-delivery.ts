import { randomUUID } from "node:crypto";

import prisma from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

const GITHUB_WEBHOOK_DELIVERY_LEASE_MS = 5 * 60 * 1000;

const DELIVERY_SELECT = {
  id: true,
  payloadSha256: true,
  status: true,
  attemptCount: true,
  leaseExpiresAt: true,
  requestKey: true,
} as const;

type GithubWebhookDeliveryRecord = {
  id: string;
  payloadSha256: string;
  status: "PROCESSING" | "PROCESSED" | "FAILED";
  attemptCount: number;
  leaseExpiresAt: Date | null;
  requestKey: string | null;
};

export type GithubWebhookTransportBinding = {
  kind: "GITHUB_WEBHOOK";
  deliveryRowId: string;
  leaseToken: string;
};

export type AcquireGithubWebhookDeliveryResult =
  | {
      kind: "acquired";
      deliveryRowId: string;
      leaseToken: string;
      attempt: number;
      requestKey: string | null;
    }
  | { kind: "processed" }
  | { kind: "processing" };

export type GithubWebhookDeliveryClient = {
  githubWebhookDelivery: {
    create: Prisma.TransactionClient["githubWebhookDelivery"]["create"];
    findUnique: Prisma.TransactionClient["githubWebhookDelivery"]["findUnique"];
    updateMany: Prisma.TransactionClient["githubWebhookDelivery"]["updateMany"];
  };
};

export type GithubWebhookDeliveryTransactionClient =
  GithubWebhookDeliveryClient;

export type GithubWebhookDeliveryErrorCode =
  | "DELIVERY_PAYLOAD_MISMATCH"
  | "DELIVERY_LEASE_LOST"
  | "DELIVERY_BINDING_CONFLICT";

export class GithubWebhookDeliveryError extends Error {
  constructor(
    readonly code: GithubWebhookDeliveryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GithubWebhookDeliveryError";
  }
}

function getLeaseExpiration(now: Date): Date {
  return new Date(now.getTime() + GITHUB_WEBHOOK_DELIVERY_LEASE_MS);
}

function isUniqueConflictForField(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  if (error.code !== "P2002" || !("meta" in error)) {
    return false;
  }

  const meta = error.meta;
  if (typeof meta !== "object" || meta === null) {
    return false;
  }

  const target = "target" in meta ? meta.target : null;
  const directTargetMatches = Array.isArray(target)
    ? target.some((value) => typeof value === "string" && value.includes(field))
    : typeof target === "string" && target.includes(field);

  if (directTargetMatches) {
    return true;
  }

  const driverAdapterError =
    "driverAdapterError" in meta ? meta.driverAdapterError : null;
  const cause =
    typeof driverAdapterError === "object" &&
    driverAdapterError !== null &&
    "cause" in driverAdapterError
      ? driverAdapterError.cause
      : null;
  const constraint =
    typeof cause === "object" && cause !== null && "constraint" in cause
      ? cause.constraint
      : null;
  const fields =
    typeof constraint === "object" &&
    constraint !== null &&
    "fields" in constraint
      ? constraint.fields
      : null;

  return (
    Array.isArray(fields) &&
    fields.some((value) => typeof value === "string" && value.includes(field))
  );
}

function assertMatchingPayload(
  delivery: GithubWebhookDeliveryRecord,
  payloadSha256: string,
): void {
  if (delivery.payloadSha256 !== payloadSha256) {
    throw new GithubWebhookDeliveryError(
      "DELIVERY_PAYLOAD_MISMATCH",
      "The GitHub delivery ID was already used with a different payload.",
    );
  }
}

function toAcquiredResult(
  delivery: GithubWebhookDeliveryRecord,
  leaseToken: string,
): AcquireGithubWebhookDeliveryResult {
  return {
    kind: "acquired",
    deliveryRowId: delivery.id,
    leaseToken,
    attempt: delivery.attemptCount,
    requestKey: delivery.requestKey,
  };
}

async function classifyLatestDelivery(input: {
  deliveryId: string;
  payloadSha256: string;
  now: Date;
  client: GithubWebhookDeliveryClient;
}): Promise<
  | GithubWebhookDeliveryRecord
  | Extract<AcquireGithubWebhookDeliveryResult, { kind: "processed" | "processing" }>
> {
  const delivery = await input.client.githubWebhookDelivery.findUnique({
    where: { deliveryId: input.deliveryId },
    select: DELIVERY_SELECT,
  });

  if (!delivery) {
    throw new GithubWebhookDeliveryError(
      "DELIVERY_LEASE_LOST",
      "The GitHub delivery row could not be loaded.",
    );
  }

  assertMatchingPayload(delivery, input.payloadSha256);

  if (delivery.status === "PROCESSED") {
    return { kind: "processed" };
  }

  if (
    delivery.status === "PROCESSING" &&
    delivery.leaseExpiresAt !== null &&
    delivery.leaseExpiresAt > input.now
  ) {
    return { kind: "processing" };
  }

  return delivery;
}

export async function acquireGithubWebhookDelivery(
  input: {
    deliveryId: string;
    payloadSha256: string;
    event: string;
    action: string | null;
    now: Date;
  },
  client: GithubWebhookDeliveryClient = prisma,
): Promise<AcquireGithubWebhookDeliveryResult> {
  const initialLeaseToken = randomUUID();

  try {
    const created = await client.githubWebhookDelivery.create({
      data: {
        deliveryId: input.deliveryId,
        payloadSha256: input.payloadSha256,
        event: input.event,
        action: input.action,
        status: "PROCESSING",
        attemptCount: 1,
        leaseToken: initialLeaseToken,
        leaseExpiresAt: getLeaseExpiration(input.now),
      },
      select: DELIVERY_SELECT,
    });

    return toAcquiredResult(created, initialLeaseToken);
  } catch (error) {
    if (!isUniqueConflictForField(error, "deliveryId")) {
      throw error;
    }
  }

  const classified = await classifyLatestDelivery({
    deliveryId: input.deliveryId,
    payloadSha256: input.payloadSha256,
    now: input.now,
    client,
  });

  if ("kind" in classified) {
    return classified;
  }

  const takeoverLeaseToken = randomUUID();
  const takeover = await client.githubWebhookDelivery.updateMany({
    where: {
      id: classified.id,
      payloadSha256: input.payloadSha256,
      OR: [
        { status: "FAILED" },
        {
          status: "PROCESSING",
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: input.now } },
          ],
        },
      ],
    },
    data: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
      leaseToken: takeoverLeaseToken,
      leaseExpiresAt: getLeaseExpiration(input.now),
      lastErrorCode: null,
      lastErrorMessage: null,
      processedAt: null,
    },
  });

  if (takeover.count === 1) {
    return {
      kind: "acquired",
      deliveryRowId: classified.id,
      leaseToken: takeoverLeaseToken,
      attempt: classified.attemptCount + 1,
      requestKey: classified.requestKey,
    };
  }

  const latest = await classifyLatestDelivery({
    deliveryId: input.deliveryId,
    payloadSha256: input.payloadSha256,
    now: input.now,
    client,
  });

  if ("kind" in latest) {
    return latest;
  }

  throw new GithubWebhookDeliveryError(
    "DELIVERY_LEASE_LOST",
    "The GitHub delivery lease could not be acquired.",
  );
}

export async function completeGithubWebhookDelivery(
  input: {
    deliveryRowId: string;
    leaseToken: string;
    requestKey?: string;
    now: Date;
  },
  client: GithubWebhookDeliveryClient = prisma,
): Promise<void> {
  const result = await client.githubWebhookDelivery.updateMany({
    where: {
      id: input.deliveryRowId,
      status: "PROCESSING",
      leaseToken: input.leaseToken,
      ...(input.requestKey === undefined ? {} : { requestKey: input.requestKey }),
    },
    data: {
      status: "PROCESSED",
      leaseToken: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      processedAt: input.now,
    },
  });

  if (result.count !== 1) {
    throw new GithubWebhookDeliveryError(
      "DELIVERY_LEASE_LOST",
      "The GitHub delivery completion lease was lost.",
    );
  }
}

export async function failGithubWebhookDelivery(
  input: {
    deliveryRowId: string;
    leaseToken: string;
    requestKey?: string;
    errorCode: string;
    errorMessage: string;
  },
  client: GithubWebhookDeliveryClient = prisma,
): Promise<void> {
  const result = await client.githubWebhookDelivery.updateMany({
    where: {
      id: input.deliveryRowId,
      status: "PROCESSING",
      leaseToken: input.leaseToken,
      ...(input.requestKey === undefined
        ? {}
        : { OR: [{ requestKey: null }, { requestKey: input.requestKey }] }),
    },
    data: {
      status: "FAILED",
      ...(input.requestKey === undefined ? {} : { requestKey: input.requestKey }),
      leaseToken: null,
      leaseExpiresAt: null,
      lastErrorCode: input.errorCode.slice(0, 64),
      lastErrorMessage: input.errorMessage.slice(0, 1_000),
      processedAt: null,
    },
  });

  if (result.count !== 1) {
    throw new GithubWebhookDeliveryError(
      "DELIVERY_LEASE_LOST",
      "The GitHub delivery failure lease was lost.",
    );
  }
}

export async function bindGithubWebhookDeliveryRequest(
  input: {
    deliveryRowId: string;
    leaseToken: string;
    requestKey: string;
  },
  client: GithubWebhookDeliveryTransactionClient,
): Promise<void> {
  const result = await client.githubWebhookDelivery.updateMany({
    where: {
      id: input.deliveryRowId,
      status: "PROCESSING",
      leaseToken: input.leaseToken,
      OR: [{ requestKey: null }, { requestKey: input.requestKey }],
    },
    data: { requestKey: input.requestKey },
  });

  if (result.count !== 1) {
    throw new GithubWebhookDeliveryError(
      "DELIVERY_BINDING_CONFLICT",
      "The GitHub delivery could not be bound to the review request.",
    );
  }
}
