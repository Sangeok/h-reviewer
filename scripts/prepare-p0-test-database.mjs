import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import pg from "pg";

const { Client } = pg;
const require = createRequire(import.meta.url);

const REQUIRED_TABLES = [
  "_prisma_migrations",
  "github_webhook_delivery",
  "repository",
  "review",
  "user",
  "user_usage",
];

function parseDatabaseUrl(value, variableName) {
  let url;

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

function getDatabaseName(url, variableName) {
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

function getDatabaseTarget(url, variableName) {
  const protocol = url.protocol === "postgres:" ? "postgresql:" : url.protocol;
  const port = url.port || "5432";
  const databaseName = getDatabaseName(url, variableName);

  return `${protocol}//${url.hostname.toLowerCase()}:${port}/${databaseName}`;
}

function assertDifferentDatabaseTarget(testUrl, environmentUrl, variableName) {
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

export function getP0TestDatabaseConfiguration(environment = process.env) {
  const value = environment.TEST_DATABASE_URL;

  if (!value?.trim()) {
    throw new Error("TEST_DATABASE_URL is required for the P0 database gate.");
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

async function verifyPreparedDatabase(connectionString) {
  const client = new Client({ connectionString });

  await client.connect();

  try {
    await client.query("SET search_path TO public");

    const schemaResult = await client.query("SELECT current_schema() AS schema");
    if (schemaResult.rows[0]?.schema !== "public") {
      throw new Error("Prepared test database did not select the public schema.");
    }

    const tableResult = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES],
    );
    const existingTables = new Set(tableResult.rows.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((table) => !existingTables.has(table));

    if (missingTables.length > 0) {
      throw new Error(`Prepared test database is missing required tables: ${missingTables.join(", ")}.`);
    }
  } finally {
    await client.end();
  }
}

export async function prepareP0TestDatabase(environment = process.env) {
  const configuration = getP0TestDatabaseConfiguration(environment);
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const migrationResult = spawnSync(
    process.execPath,
    [prismaCliPath, "migrate", "deploy"],
    {
      cwd: repositoryRoot,
      env: {
        ...environment,
        DATABASE_URL: configuration.connectionString,
        DIRECT_URL: configuration.connectionString,
      },
      shell: false,
      stdio: "inherit",
    },
  );

  if (migrationResult.error || migrationResult.status !== 0) {
    throw new Error("Prisma migration deployment failed for the P0 test database.");
  }

  await verifyPreparedDatabase(configuration.connectionString);
  console.info("P0 test database is migrated and verified in the public schema.");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (invokedPath === import.meta.url) {
  prepareP0TestDatabase().catch((error) => {
    const message = error instanceof Error ? error.message : "P0 test database preparation failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
