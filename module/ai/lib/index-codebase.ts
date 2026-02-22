import { pineconeIndex } from "@/lib/pinecone";
import { EMBEDDING_CONTENT_MAX_LENGTH, PINECONE_BATCH_SIZE } from "../constants";
import { generateEmbedding } from "./generate-embedding";

interface RepositoryFile {
  path: string;
  content: string;
}

export async function indexCodebase(repoId: string, files: RepositoryFile[]) {
  const vectors = [];

  for (const file of files) {
    const content = `File : ${file.path}\n\n${file.content}`;
    const truncatedContent = content.substring(0, EMBEDDING_CONTENT_MAX_LENGTH);

    try {
      const embedding = await generateEmbedding(truncatedContent, "RETRIEVAL_DOCUMENT");

      vectors.push({
        id: `${repoId}-${file.path.replace(/\//g, "_")}`,
        values: embedding,
        metadata: {
          repoId,
          path: file.path,
          content: truncatedContent,
        },
      });
    } catch (error) {
      console.error(`Error generating embedding for file ${file.path}`, error);
    }
  }

  for (let i = 0; i < vectors.length; i += PINECONE_BATCH_SIZE) {
    const batch = vectors.slice(i, i + PINECONE_BATCH_SIZE);
    await pineconeIndex.upsert(batch);
  }

  console.log("indexing complete");
}
