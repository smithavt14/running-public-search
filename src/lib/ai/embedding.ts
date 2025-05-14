import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { db } from '../db/index.js';
import { embeddings } from '../db/schema/embeddings.js';
import { resources } from '../db/schema/resources.js';
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';

// Initialize embedding model
const embeddingModel = openai.embedding('text-embedding-3-small');

// Function to break text into chunks
export const generateChunks = (input: string): string[] => {
  // Split by sentences and filter out empty chunks
  return input
    .trim()
    .split('.')
    .filter(i => i.trim() !== '')
    .map(i => i.trim() + '.');
};

// Function to generate embeddings for a given text
export async function generateEmbeddings(text: string) {
  // Break the text into smaller chunks
  const chunks = generateChunks(text);
  
  // Generate embeddings for each chunk using AI SDK
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });
  
  return chunks.map((chunk, index) => ({
    content: chunk,
    embedding: embeddings[index],
  }));
}

// Function to generate a single embedding for a query
export async function generateQueryEmbedding(query: string) {
  const input = query.replaceAll('\\n', ' ');
  
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  
  return embedding;
}

// Function to find relevant content based on a user query
export async function findRelevantContent(userQuery: string, matchThreshold: number = 0.1, matchCount: number = 4) {
  try {
    // Generate embedding for the user query
    const queryEmbedding = await generateQueryEmbedding(userQuery);
    
    // Calculate similarity using cosine distance
    const similarity = sql<number>`1 - (${cosineDistance(
      embeddings.embedding,
      queryEmbedding,
    )})`;
    
    // Find similar content using Drizzle ORM
    const matches = await db
      .select({ 
        id: embeddings.id,
        content: embeddings.content,
        resourceId: embeddings.resourceId,
        similarity 
      })
      .from(embeddings)
      .where(gt(similarity, matchThreshold))
      .orderBy(desc(similarity))
      .limit(matchCount);
    
    if (!matches || matches.length === 0) {
      return { content: "No relevant content found" };
    }
    
    // Return the matches directly
    return matches;
  } catch (error) {
    console.error('Error finding relevant content:', error);
    return { content: "Error retrieving content" };
  }
}

// Function to find podcast episodes by summary similarity
export async function findEpisodesBySummary(query: string, matchThreshold: number = 0.1, matchCount: number = 5) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(query);
    
    // Calculate similarity using cosine distance against summary embeddings
    const similarity = sql<number>`1 - (${cosineDistance(
      resources.summaryEmbedding,
      queryEmbedding,
    )})`;
    
    // Find similar episodes using Drizzle ORM
    const matches = await db
      .select({ 
        id: resources.id,
        title: resources.title,
        episodeNumber: resources.episodeNumber,
        summary: resources.summary,
        guests: resources.guests,
        similarity 
      })
      .from(resources)
      .where(gt(similarity, matchThreshold))
      .orderBy(desc(similarity))
      .limit(matchCount);
    
    if (!matches || matches.length === 0) {
      return { episodes: [] };
    }
    
    // Parse guests from JSON string
    const episodesWithParsedGuests = matches.map(match => ({
      ...match,
      guests: match.guests ? JSON.parse(match.guests) : []
    }));
    
    return { episodes: episodesWithParsedGuests };
  } catch (error) {
    console.error('Error finding episodes by summary:', error);
    return { episodes: [], error: "Error retrieving episodes" };
  }
} 