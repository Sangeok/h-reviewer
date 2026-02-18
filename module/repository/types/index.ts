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

export interface ConnectRepositoryResult {
  status: "connected" | "already_connected";
}
