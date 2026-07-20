import { pineconeIndex } from "@/lib/pinecone";
import { DEFAULT_TOP_K } from "../constants";
import { generateEmbedding } from "./generate-embedding";

export async function retrieveContext(query: string, repoId: string, topK: number = DEFAULT_TOP_K) {
  const embedding = await generateEmbedding(query, "RETRIEVAL_QUERY");

  const results = await pineconeIndex.query({
    vector: embedding,
    topK,
    includeMetadata: true,
    filter: {
      repoId,
    },
  });

  return results.matches
    .map((match) => match.metadata?.content)
    .filter((content): content is string => typeof content === "string" && content.length > 0);
}
