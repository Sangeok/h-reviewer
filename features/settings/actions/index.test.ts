import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
  disconnectRepository: vi.fn(),
  disconnectAllRepositoriesInternal: vi.fn(),
}));

vi.mock("@/lib/server-utils", () => ({
  requireAuthSession: mocks.requireAuthSession,
}));
vi.mock("@/lib/db", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    repository: { findMany: vi.fn() },
  },
}));
vi.mock("@/features/repository", () => ({
  disconnectRepository: mocks.disconnectRepository,
  disconnectAllRepositoriesInternal: mocks.disconnectAllRepositoriesInternal,
}));

import { RepositoryDisconnectError } from "@/features/repository/lib/repository-disconnect";

import {
  disconnectAllRepositories,
  disconnectRepository,
} from "./index";

describe("settings repository disconnect actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthSession.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("passes the authenticated owner to the single disconnect use case", async () => {
    mocks.disconnectRepository.mockResolvedValue(undefined);

    await expect(disconnectRepository("repository-1")).resolves.toBeUndefined();

    expect(mocks.disconnectRepository).toHaveBeenCalledWith(
      "repository-1",
      "user-1",
    );
  });

  it.each(["ACTIVE_REVIEW", "RECOVERY_REQUIRED"] as const)(
    "preserves the safe %s domain error without logging raw details",
    async (code) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const error = new RepositoryDisconnectError(code);
      mocks.disconnectRepository.mockRejectedValue(error);

      await expect(disconnectRepository("repository-1")).rejects.toBe(error);

      expect(consoleError).toHaveBeenCalledWith(
        "Repository disconnect rejected",
        { code },
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("token");
      consoleError.mockRestore();
    },
  );

  it("uses the same safe use case for disconnect-all", async () => {
    mocks.disconnectAllRepositoriesInternal.mockResolvedValue(undefined);

    await expect(disconnectAllRepositories()).resolves.toBeUndefined();

    expect(mocks.disconnectAllRepositoriesInternal).toHaveBeenCalledWith("user-1");
  });
});
