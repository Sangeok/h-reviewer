import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  acquireGithubWebhookDelivery,
  bindGithubWebhookDeliveryRequest,
  completeGithubWebhookDelivery,
  failGithubWebhookDelivery,
  GithubWebhookDeliveryError,
  type GithubWebhookDeliveryClient,
} from "./github-webhook-delivery";

const NOW = new Date("2026-08-25T00:00:00.000Z");
const PAYLOAD_SHA = "a".repeat(64);

type DeliveryRow = {
  id: string;
  deliveryId: string;
  payloadSha256: string;
  event: string;
  action: string | null;
  requestKey: string | null;
  status: "PROCESSING" | "PROCESSED" | "FAILED";
  attemptCount: number;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  processedAt: Date | null;
};

function createDeliveryHarness(): {
  client: GithubWebhookDeliveryClient;
  rows: DeliveryRow[];
} {
  const rows: DeliveryRow[] = [];
  const delegate = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const deliveryId = String(data.deliveryId);
      if (rows.some((row) => row.deliveryId === deliveryId)) {
        throw { code: "P2002", meta: { target: ["deliveryId"] } };
      }

      const row: DeliveryRow = {
        id: `delivery-row-${rows.length + 1}`,
        deliveryId,
        payloadSha256: String(data.payloadSha256),
        event: String(data.event),
        action: data.action === null ? null : String(data.action),
        requestKey: null,
        status: "PROCESSING",
        attemptCount: Number(data.attemptCount),
        leaseToken: String(data.leaseToken),
        leaseExpiresAt: data.leaseExpiresAt as Date,
        lastErrorCode: null,
        lastErrorMessage: null,
        processedAt: null,
      };
      rows.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { deliveryId?: string } }) =>
      rows.find((row) => row.deliveryId === where.deliveryId) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row || !matchesWhere(row, where)) return { count: 0 };

      applyData(row, data);
      return { count: 1 };
    },
  };

  return {
    client: {
      githubWebhookDelivery:
        delegate as unknown as GithubWebhookDeliveryClient["githubWebhookDelivery"],
    },
    rows,
  };
}

function matchesWhere(
  row: DeliveryRow,
  where: Record<string, unknown>,
): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (
    where.payloadSha256 !== undefined &&
    row.payloadSha256 !== where.payloadSha256
  ) {
    return false;
  }
  if (where.status !== undefined && row.status !== where.status) return false;
  if (
    where.leaseToken !== undefined &&
    row.leaseToken !== where.leaseToken
  ) {
    return false;
  }
  if (
    where.requestKey !== undefined &&
    row.requestKey !== where.requestKey
  ) {
    return false;
  }
  if (
    typeof where.leaseExpiresAt === "object" &&
    where.leaseExpiresAt !== null &&
    "lte" in where.leaseExpiresAt
  ) {
    if (
      row.leaseExpiresAt === null ||
      row.leaseExpiresAt > (where.leaseExpiresAt.lte as Date)
    ) {
      return false;
    }
  }
  if ("leaseExpiresAt" in where && where.leaseExpiresAt === null) {
    if (row.leaseExpiresAt !== null) return false;
  }

  const alternatives = where.OR;
  return !Array.isArray(alternatives) ||
    alternatives.some((alternative) =>
      matchesWhere(row, alternative as Record<string, unknown>),
    );
}

function applyData(row: DeliveryRow, data: Record<string, unknown>): void {
  if (typeof data.status === "string") {
    row.status = data.status as DeliveryRow["status"];
  }
  if (typeof data.attemptCount === "object" && data.attemptCount !== null) {
    const increment = "increment" in data.attemptCount
      ? Number(data.attemptCount.increment)
      : 0;
    row.attemptCount += increment;
  }

  for (const field of [
    "requestKey",
    "leaseToken",
    "leaseExpiresAt",
    "lastErrorCode",
    "lastErrorMessage",
    "processedAt",
  ] as const) {
    if (field in data) {
      row[field] = data[field] as never;
    }
  }
}

function createAcquireInput(
  overrides: Partial<Parameters<typeof acquireGithubWebhookDelivery>[0]> = {},
) {
  return {
    deliveryId: "github-delivery-1",
    payloadSha256: PAYLOAD_SHA,
    event: "pull_request",
    action: "opened",
    now: NOW,
    ...overrides,
  };
}

describe("GitHub webhook delivery lease", () => {
  it("acquires a new delivery and keeps an active duplicate processing", async () => {
    const { client, rows } = createDeliveryHarness();

    const first = await acquireGithubWebhookDelivery(
      createAcquireInput(),
      client,
    );
    const duplicate = await acquireGithubWebhookDelivery(
      createAcquireInput({ now: new Date(NOW.getTime() + 60_000) }),
      client,
    );

    expect(first).toMatchObject({ kind: "acquired", attempt: 1 });
    expect(duplicate).toEqual({ kind: "processing" });
    expect(rows).toHaveLength(1);
  });

  it("returns processed for every later duplicate without a retention window", async () => {
    const { client, rows } = createDeliveryHarness();
    const acquired = await acquireGithubWebhookDelivery(
      createAcquireInput(),
      client,
    );
    if (acquired.kind !== "acquired") throw new Error("Expected acquisition");

    await completeGithubWebhookDelivery(
      {
        deliveryRowId: acquired.deliveryRowId,
        leaseToken: acquired.leaseToken,
        now: NOW,
      },
      client,
    );

    await expect(
      acquireGithubWebhookDelivery(
        createAcquireInput({
          now: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        }),
        client,
      ),
    ).resolves.toEqual({ kind: "processed" });
    expect(rows).toHaveLength(1);
  });

  it.each(["FAILED", "EXPIRED"] as const)(
    "allows one takeover of a %s delivery",
    async (state) => {
      const { client, rows } = createDeliveryHarness();
      const first = await acquireGithubWebhookDelivery(
        createAcquireInput(),
        client,
      );
      if (first.kind !== "acquired") throw new Error("Expected acquisition");

      if (state === "FAILED") {
        await failGithubWebhookDelivery(
          {
            deliveryRowId: first.deliveryRowId,
            leaseToken: first.leaseToken,
            errorCode: "QUEUE_FAILED",
            errorMessage: "Queue unavailable",
          },
          client,
        );
      } else {
        rows[0]!.leaseExpiresAt = new Date(NOW.getTime() - 1);
      }

      const [left, right] = await Promise.all([
        acquireGithubWebhookDelivery(createAcquireInput(), client),
        acquireGithubWebhookDelivery(createAcquireInput(), client),
      ]);

      expect([left.kind, right.kind].sort()).toEqual([
        "acquired",
        "processing",
      ]);
      expect(rows[0]).toMatchObject({ status: "PROCESSING", attemptCount: 2 });
    },
  );

  it("rejects reuse of a delivery ID with a different payload", async () => {
    const { client } = createDeliveryHarness();
    await acquireGithubWebhookDelivery(createAcquireInput(), client);

    await expect(
      acquireGithubWebhookDelivery(
        createAcquireInput({ payloadSha256: "b".repeat(64) }),
        client,
      ),
    ).rejects.toMatchObject({
      code: "DELIVERY_PAYLOAD_MISMATCH",
    } satisfies Partial<GithubWebhookDeliveryError>);
  });

  it("binds only the current lease and never overwrites another request key", async () => {
    const { client, rows } = createDeliveryHarness();
    const acquired = await acquireGithubWebhookDelivery(
      createAcquireInput(),
      client,
    );
    if (acquired.kind !== "acquired") throw new Error("Expected acquisition");

    await bindGithubWebhookDeliveryRequest(
      {
        deliveryRowId: acquired.deliveryRowId,
        leaseToken: acquired.leaseToken,
        requestKey: "request-1",
      },
      client,
    );
    await expect(
      bindGithubWebhookDeliveryRequest(
        {
          deliveryRowId: acquired.deliveryRowId,
          leaseToken: acquired.leaseToken,
          requestKey: "request-2",
        },
        client,
      ),
    ).rejects.toMatchObject({ code: "DELIVERY_BINDING_CONFLICT" });
    await expect(
      completeGithubWebhookDelivery(
        {
          deliveryRowId: acquired.deliveryRowId,
          leaseToken: acquired.leaseToken,
          requestKey: "request-2",
          now: NOW,
        },
        client,
      ),
    ).rejects.toMatchObject({ code: "DELIVERY_LEASE_LOST" });
    expect(rows[0]?.requestKey).toBe("request-1");
    expect(rows[0]?.status).toBe("PROCESSING");
  });

  it("prevents an old lease owner from completing or failing a takeover", async () => {
    const { client, rows } = createDeliveryHarness();
    const first = await acquireGithubWebhookDelivery(
      createAcquireInput(),
      client,
    );
    if (first.kind !== "acquired") throw new Error("Expected acquisition");
    rows[0]!.leaseExpiresAt = new Date(NOW.getTime() - 1);
    const takeover = await acquireGithubWebhookDelivery(
      createAcquireInput(),
      client,
    );
    if (takeover.kind !== "acquired") throw new Error("Expected takeover");

    await expect(
      completeGithubWebhookDelivery(
        {
          deliveryRowId: first.deliveryRowId,
          leaseToken: first.leaseToken,
          now: NOW,
        },
        client,
      ),
    ).rejects.toMatchObject({ code: "DELIVERY_LEASE_LOST" });
    await expect(
      failGithubWebhookDelivery(
        {
          deliveryRowId: first.deliveryRowId,
          leaseToken: first.leaseToken,
          errorCode: "OLD_OWNER",
          errorMessage: "Old owner",
        },
        client,
      ),
    ).rejects.toMatchObject({ code: "DELIVERY_LEASE_LOST" });
    expect(rows[0]).toMatchObject({
      status: "PROCESSING",
      leaseToken: takeover.leaseToken,
    });
  });
});
