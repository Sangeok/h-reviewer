export interface GitHubRepositoryOwnerDto {
  login: string;
}

export interface GitHubRepositoryDto {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  owner: GitHubRepositoryOwnerDto;
}

export interface Repository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  stargazersCount: number;
  language: string | null;
  topics: string[];
  ownerLogin: string;
  isConnected: boolean;
}

export interface ConnectRepositoryParams {
  owner: string;
  repo: string;
  githubId: number;
}

export type ConnectRepositoryResult =
  | { status: "connected" }
  | { status: "already_connected" }
  | { status: "error"; error: "ALREADY_CONNECTED_BY_OTHER" | "QUOTA_EXCEEDED" };
