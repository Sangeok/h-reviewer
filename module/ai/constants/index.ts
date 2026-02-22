export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_OUTPUT_DIMENSION = 768;
export const EMBEDDING_CONTENT_MAX_LENGTH = 8000;
export const PINECONE_BATCH_SIZE = 100;
export const DEFAULT_TOP_K = 5;
export const GITHUB_PROVIDER_ID = "github";

export function buildPRUrl(owner: string, repo: string, prNumber: number): string {
  return `https://github.com/${owner}/${repo}/pull/${prNumber}`;
}
