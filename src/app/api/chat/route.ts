import { streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { findRelevantContent } from '@/lib/ai/embedding.js';
import { executeSafeQuery, getResourceStats } from '@/lib/ai/database-tools';
import { CHAT_SYSTEM_PROMPT } from '@/lib/prompts/chat-system';
import { SUMMARY_MODEL } from '@/lib/ai/config';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai(SUMMARY_MODEL),
    system: CHAT_SYSTEM_PROMPT,
    messages,
    tools: {
      getRelevantContent: tool({
        description: 'Retrieve relevant podcast content based on the user query using semantic search and keyword matching',
        parameters: z.object({
          query: z.string().describe('The user query to search for'),
          exactMatch: z.boolean().optional().describe('If true, will prioritize exact keyword matching')
        }),
        execute: async ({ query, exactMatch = false }) => {
          // If exact match is requested, use keyword search first
          if (exactMatch) {
            const keywordResults = await executeSafeQuery('search_embeddings', { keyword: query });
            if (Array.isArray(keywordResults) && keywordResults.length > 0) {
              return keywordResults;
            }
          }
          
          // Otherwise (or as fallback) use semantic search
          const semanticResults = await findRelevantContent(query);
          
          // If we didn't find semantic results and haven't tried keyword search yet
          if (typeof semanticResults === 'object' && 'content' in semanticResults && 
              semanticResults.content === "No relevant content found" && !exactMatch) {
            const keywordResults = await executeSafeQuery('search_embeddings', { keyword: query });
            if (Array.isArray(keywordResults) && keywordResults.length > 0) {
              return keywordResults;
            }
          }
          
          return semanticResults;
        }
      }),
      
      listPodcastEpisodes: tool({
        description: 'List all podcast episodes with basic information',
        parameters: z.object({}),
        execute: async () => {
          return await executeSafeQuery('list_resources');
        }
      }),
      
      getEpisodeDetails: tool({
        description: 'Get detailed information about a specific episode',
        parameters: z.object({
          id: z.string().describe('The ID of the episode')
        }),
        execute: async ({ id }) => {
          return await executeSafeQuery('resource_details', { id });
        }
      }), 
      
      getPodcastStats: tool({
        description: 'Get statistics about the podcast episodes and content',
        parameters: z.object({}),
        execute: async () => {
          return await getResourceStats();
        }
      }),
      
      listPodcastGuests: tool({
        description: 'Get a list of all guests who have appeared on the podcast',
        parameters: z.object({}),
        execute: async () => {
          return await executeSafeQuery('list_guests');
        }
      }),
      
      getEpisodeContent: tool({
        description: 'Retrieve full episode content to provide detailed information about a specific episode',
        parameters: z.object({
          guestName: z.string().optional().describe('Name of the guest who appeared on the episode'),
          episodeNumber: z.string().optional().describe('The episode number'),
          episodeTitle: z.string().optional().describe('Words from the episode title'),
          id: z.string().optional().describe('The episode ID')
        }),
        execute: async (params) => {
          return await executeSafeQuery('episode_content', params);
        }
      }),
    }
  });

  return result.toDataStreamResponse();
} 