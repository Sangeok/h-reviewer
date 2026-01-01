export interface PRCommand {
  type: "summary" | "review";
}

export interface SearchResult {
  metadata?: {
    file?: string;
    code?: string;
    path?: string;
    repoId?: string;
  };
  score?: number;
}

export interface SearchOptions {
  topK?: number;
  namespace?: string;
}
