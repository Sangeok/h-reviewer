/**
 * GitHub Repository interface used across the application.
 * This represents the repository data fetched from GitHub API.
 */
export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  isConnected?: boolean;
}
