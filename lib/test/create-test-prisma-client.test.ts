import { describe, expect, it } from "vitest";

import { getTestDatabaseConfiguration } from "./create-test-prisma-client";

const TEST_DATABASE_URL =
  "postgresql://test-user:test-password@localhost:5432/hreviewer_test";

describe("getTestDatabaseConfiguration", () => {
  it("normalizes an omitted schema to public", () => {
    const configuration = getTestDatabaseConfiguration({
      TEST_DATABASE_URL,
      DATABASE_URL: "postgresql://app-user:app-password@localhost:5432/hreviewer",
    });

    expect(configuration.databaseName).toBe("hreviewer_test");
    expect(configuration.schema).toBe("public");
    expect(new URL(configuration.connectionString).searchParams.get("schema")).toBe(
      "public",
    );
  });

  it("rejects a missing dedicated test database URL", () => {
    expect(() => getTestDatabaseConfiguration({})).toThrow(
      "TEST_DATABASE_URL is required",
    );
  });

  it("rejects a database without the _test suffix", () => {
    expect(() =>
      getTestDatabaseConfiguration({
        TEST_DATABASE_URL:
          "postgresql://test-user:test-password@localhost:5432/hreviewer",
      }),
    ).toThrow("must end with _test");
  });

  it("rejects a non-public schema", () => {
    expect(() =>
      getTestDatabaseConfiguration({
        TEST_DATABASE_URL: `${TEST_DATABASE_URL}?schema=isolated`,
      }),
    ).toThrow("schema must be public");
  });

  it.each(["DATABASE_URL", "DIRECT_URL"] as const)(
    "rejects the same database target as %s despite different credentials",
    (variableName) => {
      expect(() =>
        getTestDatabaseConfiguration({
          TEST_DATABASE_URL,
          [variableName]:
            "postgres://production-user:production-password@localhost/hreviewer_test?schema=private",
        }),
      ).toThrow(`same database as ${variableName}`);
    },
  );
});
