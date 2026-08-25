import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getTestDatabaseConfiguration } from "@/lib/test/create-test-prisma-client";

const TARGET_MIGRATION_SUFFIX = "_add_review_execution_state";
const OWNED_SCHEMA_PATTERN = /^p0_t02_[a-f0-9]{32}$/;

type DatabaseError = Error & {
  code?: string;
};

type MigrationFiles = {
  previousMigrationSql: string[];
  targetMigrationSql: string;
};

let client: Client | null = null;
let ownedSchema: string | null = null;
let migrations: MigrationFiles;

function quoteOwnedSchema(schema: string): string {
  if (!OWNED_SCHEMA_PATTERN.test(schema)) {
    throw new Error("Refusing to use an unrecognized integration-test schema name.");
  }

  return `"${schema}"`;
}

async function readMigrationFiles(): Promise<MigrationFiles> {
  const migrationsRoot = path.join(process.cwd(), "prisma", "migrations");
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const targetIndex = migrationNames.findIndex((name) => name.endsWith(TARGET_MIGRATION_SUFFIX));

  if (targetIndex === -1) {
    throw new Error("The T02 review execution migration was not found.");
  }

  if (
    migrationNames.filter((name) => name.endsWith(TARGET_MIGRATION_SUFFIX)).length !== 1
  ) {
    throw new Error("Expected exactly one T02 review execution migration.");
  }

  const readMigration = (name: string): Promise<string> =>
    readFile(path.join(migrationsRoot, name, "migration.sql"), "utf8");

  return {
    previousMigrationSql: await Promise.all(
      migrationNames.slice(0, targetIndex).map(readMigration),
    ),
    targetMigrationSql: await readMigration(migrationNames[targetIndex]),
  };
}

async function replayPreviousMigrations(databaseClient: Client): Promise<void> {
  for (const migrationSql of migrations.previousMigrationSql) {
    await databaseClient.query(migrationSql);
  }
}

async function insertRequiredLegacyParents(databaseClient: Client): Promise<void> {
  const now = new Date("2026-08-25T00:00:00.000Z");

  await databaseClient.query(
    `INSERT INTO "user"
      ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $5)`,
    ["migration-user", "Migration User", "migration@example.com", true, now],
  );
  await databaseClient.query(
    `INSERT INTO "repository"
      ("id", "githubId", "name", "owner", "fullName", "url", "userId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [
      "migration-repository",
      "420001",
      "sample",
      "octo",
      "octo/sample",
      "https://github.com/octo/sample",
      "migration-user",
      now,
    ],
  );
  await databaseClient.query(
    `INSERT INTO "user_usage"
      ("id", "userId", "repositoryCount", "reviewCounts", "createdAt", "updatedAt")
     VALUES ($1, $2, 1, '{}'::jsonb, $3, $3)`,
    ["migration-usage", "migration-user", now],
  );
}

async function insertLegacyReview(
  databaseClient: Client,
  id: string,
  prNumber: number,
  status: string,
): Promise<void> {
  const now = new Date("2026-08-25T00:00:00.000Z");

  await databaseClient.query(
    `INSERT INTO "review"
      ("id", "repositoryId", "prNumber", "prTitle", "prUrl", "review", "status", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      "migration-repository",
      prNumber,
      `Legacy review ${prNumber}`,
      `https://github.com/octo/sample/pull/${prNumber}`,
      `Legacy body ${prNumber}`,
      status,
      now,
    ],
  );
}

async function expectConstraintViolation(
  databaseClient: Client,
  sql: string,
  parameters: unknown[],
  expectedCode: string,
): Promise<void> {
  await databaseClient.query("BEGIN");

  try {
    await databaseClient.query(sql, parameters);
    throw new Error(`Expected PostgreSQL error ${expectedCode}.`);
  } catch (error) {
    expect((error as DatabaseError).code).toBe(expectedCode);
  } finally {
    await databaseClient.query("ROLLBACK");
  }
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "review execution migration",
  () => {
    beforeEach(async () => {
      const configuration = getTestDatabaseConfiguration();
      migrations = await readMigrationFiles();
      const schema = `p0_t02_${randomUUID().replaceAll("-", "")}`;
      client = new Client({ connectionString: configuration.connectionString });

      await client.connect();
      await client.query(`CREATE SCHEMA ${quoteOwnedSchema(schema)}`);
      ownedSchema = schema;
      await client.query(`SET search_path TO ${quoteOwnedSchema(schema)}`);
      await replayPreviousMigrations(client);
      await insertRequiredLegacyParents(client);
    });

    afterEach(async () => {
      if (!client) {
        return;
      }

      try {
        if (ownedSchema) {
          await client.query("SET search_path TO public");
          await client.query(`DROP SCHEMA ${quoteOwnedSchema(ownedSchema)} CASCADE`);
        }
      } finally {
        await client.end();
        client = null;
        ownedSchema = null;
      }
    });

    it("casts legacy statuses and adds the required constraints", async () => {
      if (!client) {
        throw new Error("Integration test client was not initialized.");
      }

      await insertLegacyReview(client, "pending-review", 1, "pending");
      await insertLegacyReview(client, "completed-review", 2, "completed");
      await insertLegacyReview(client, "failed-review", 3, "failed");

      await client.query("BEGIN");
      await client.query(migrations.targetMigrationSql);
      await client.query("COMMIT");

      const reviews = await client.query(
        `SELECT
           "id",
           "status"::text AS "status",
           "requestKey",
           "requestSource"::text AS "requestSource",
           "reviewMode"::text AS "reviewMode",
           "failureStage"::text AS "failureStage",
           "failureMessage",
           "attemptCount",
           "trialCreditState"::text AS "trialCreditState",
           "executionLeaseExpiresAt",
           "executionLeaseToken",
           "executionLeaseOwner",
           "githubMainReviewId",
           "githubMainPostedAt",
           "githubAuthorId",
           "artifactLookupMissedAt"
         FROM "review"
         ORDER BY "id"`,
      );

      expect(reviews.rows).toEqual([
        expect.objectContaining({
          id: "completed-review",
          status: "COMPLETED",
          requestKey: "legacy:completed-review",
          requestSource: "LEGACY",
          reviewMode: "FULL",
          failureStage: null,
          failureMessage: null,
          attemptCount: 1,
          trialCreditState: "NOT_APPLICABLE",
        }),
        expect.objectContaining({
          id: "failed-review",
          status: "FAILED",
          requestKey: "legacy:failed-review",
          requestSource: "LEGACY",
          reviewMode: "FULL",
          failureStage: "LEGACY",
          failureMessage: "Legacy review execution failed.",
          attemptCount: 1,
          trialCreditState: "NOT_APPLICABLE",
        }),
        expect.objectContaining({
          id: "pending-review",
          status: "PENDING",
          requestKey: "legacy:pending-review",
          requestSource: "LEGACY",
          reviewMode: "FULL",
          failureStage: null,
          failureMessage: null,
          attemptCount: 1,
          trialCreditState: "NOT_APPLICABLE",
        }),
      ]);
      expect(new Set(reviews.rows.map((review) => review.requestKey)).size).toBe(3);
      expect(
        reviews.rows.every(
          (review) =>
            review.executionLeaseExpiresAt === null &&
            review.executionLeaseToken === null &&
            review.executionLeaseOwner === null &&
            review.githubMainReviewId === null &&
            review.githubMainPostedAt === null &&
            review.githubAuthorId === null &&
            review.artifactLookupMissedAt === null,
        ),
      ).toBe(true);

      const usage = await client.query(
        `SELECT "trialReviewCreditsUsed" FROM "user_usage" WHERE "id" = $1`,
        ["migration-usage"],
      );
      expect(usage.rows[0]?.trialReviewCreditsUsed).toBe(0);

      const deliveryTable = await client.query(
        `SELECT to_regclass('github_webhook_delivery')::text AS "tableName"`,
      );
      expect(deliveryTable.rows[0]?.tableName).toBe("github_webhook_delivery");

      await expectConstraintViolation(
        client,
        `UPDATE "review" SET "requestKey" = NULL WHERE "id" = $1`,
        ["pending-review"],
        "23502",
      );
      await expectConstraintViolation(
        client,
        `UPDATE "review" SET "requestKey" = $1 WHERE "id" = $2`,
        ["legacy:pending-review", "completed-review"],
        "23505",
      );
    });

    it("rejects an unknown legacy status before changing the schema", async () => {
      if (!client || !ownedSchema) {
        throw new Error("Integration test client was not initialized.");
      }

      await insertLegacyReview(client, "unknown-review", 4, "queued");
      await client.query("BEGIN");

      try {
        await client.query(migrations.targetMigrationSql);
        throw new Error("Expected the legacy status guard to reject the migration.");
      } catch (error) {
        expect((error as DatabaseError).code).toBe("P0001");
      } finally {
        await client.query("ROLLBACK");
      }

      const status = await client.query(
        `SELECT "status" FROM "review" WHERE "id" = $1`,
        ["unknown-review"],
      );
      expect(status.rows[0]?.status).toBe("queued");

      const requestKeyColumn = await client.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'review'
           AND column_name = 'requestKey'`,
        [ownedSchema],
      );
      expect(requestKeyColumn.rowCount).toBe(0);

      const reviewStatusType = await client.query(
        `SELECT 1
         FROM pg_type AS type
         JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
         WHERE namespace.nspname = $1
           AND type.typname = 'ReviewStatus'`,
        [ownedSchema],
      );
      expect(reviewStatusType.rowCount).toBe(0);
    });
  },
);
