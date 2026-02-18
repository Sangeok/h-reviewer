import type { GitHubRepositoryDto, GitHubRepositoryOwnerDto, Repository } from "../types";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGitHubRepositoryOwnerDto(value: unknown): value is GitHubRepositoryOwnerDto {
  if (!isObjectRecord(value)) {
    return false;
  }

  return typeof value.login === "string";
}

export function isGitHubRepositoryDto(value: unknown): value is GitHubRepositoryDto {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "number" &&
    typeof value.name === "string" &&
    typeof value.full_name === "string" &&
    (typeof value.description === "string" || value.description === null) &&
    typeof value.html_url === "string" &&
    typeof value.stargazers_count === "number" &&
    (typeof value.language === "string" || value.language === null) &&
    (value.topics === undefined || isStringArray(value.topics)) &&
    isGitHubRepositoryOwnerDto(value.owner)
  );
}

export function mapGitHubRepositoryDtoToRepository(
  repository: GitHubRepositoryDto,
  connectedRepositoryIds: Set<bigint>
): Repository {
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description,
    htmlUrl: repository.html_url,
    stargazersCount: repository.stargazers_count,
    language: repository.language,
    topics: repository.topics ?? [],
    ownerLogin: repository.owner.login,
    isConnected: connectedRepositoryIds.has(BigInt(repository.id)),
  };
}
