import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

type DatabaseEnvironment = {
  [key: string]: string | undefined;
  TEST_DATABASE_URL?: string;
  DATABASE_URL?: string;
  DIRECT_URL?: string;
};

export type TestDatabaseConfiguration = {
  connectionString: string;
  databaseName: string;
  schema: "public";
};

function parseDatabaseUrl(value: string, variableName: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${variableName} must use the PostgreSQL protocol.`);
  }

  return url;
}

function getDatabaseName(url: URL, variableName: string): string {
  const encodedName = url.pathname.replace(/^\/+/, "");

  if (!encodedName || encodedName.includes("/")) {
    throw new Error(`${variableName} must identify exactly one database.`);
  }

  try {
    return decodeURIComponent(encodedName);
  } catch {
    throw new Error(`${variableName} contains an invalid database name.`);
  }
}

function getDatabaseTarget(url: URL, variableName: string): string {
  const protocol = url.protocol === "postgres:" ? "postgresql:" : url.protocol;
  const port = url.port || "5432";
  const databaseName = getDatabaseName(url, variableName);

  return `${protocol}//${url.hostname.toLowerCase()}:${port}/${databaseName}`;
}

function assertDifferentDatabaseTarget(
  testUrl: URL,
  environmentUrl: string | undefined,
  variableName: "DATABASE_URL" | "DIRECT_URL",
): void {
  if (!environmentUrl) {
    return;
  }

  const parsedEnvironmentUrl = parseDatabaseUrl(environmentUrl, variableName);

  if (
    getDatabaseTarget(testUrl, "TEST_DATABASE_URL") ===
    getDatabaseTarget(parsedEnvironmentUrl, variableName)
  ) {
    throw new Error(`TEST_DATABASE_URL must not target the same database as ${variableName}.`);
  }
}

export function getTestDatabaseConfiguration(
  environment: DatabaseEnvironment = process.env,
): TestDatabaseConfiguration {
  const value = environment.TEST_DATABASE_URL;

  if (!value?.trim()) {
    throw new Error("TEST_DATABASE_URL is required for database integration tests.");
  }

  const url = parseDatabaseUrl(value, "TEST_DATABASE_URL");
  const databaseName = getDatabaseName(url, "TEST_DATABASE_URL");

  if (!databaseName.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL database name must end with _test.");
  }

  const requestedSchema = url.searchParams.get("schema");

  if (requestedSchema !== null && requestedSchema.trim() !== "" && requestedSchema !== "public") {
    throw new Error("TEST_DATABASE_URL schema must be public when specified.");
  }

  assertDifferentDatabaseTarget(url, environment.DATABASE_URL, "DATABASE_URL");
  assertDifferentDatabaseTarget(url, environment.DIRECT_URL, "DIRECT_URL");

  url.searchParams.set("schema", "public");

  return {
    connectionString: url.toString(),
    databaseName,
    schema: "public",
  };
}

export function createTestPrismaClient(
  environment: DatabaseEnvironment = process.env,
): PrismaClient {
  const configuration = getTestDatabaseConfiguration(environment);
  const adapter = new PrismaPg(
    { connectionString: configuration.connectionString },
    { schema: configuration.schema },
  );

  return new PrismaClient({ adapter });
}
