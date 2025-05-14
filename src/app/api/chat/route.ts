import { streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { findRelevantContent } from '@/lib/ai/embedding.js';
import { executeSafeQuery, getResourceStats } from '@/lib/ai/database-tools';
import { analyzeEpisodeContent } from '@/lib/ai/database-explorer';
import { CHAT_SYSTEM_PROMPT } from '@/lib/prompts/chat-system';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: CHAT_SYSTEM_PROMPT,
    messages,
    tools: {
      getRelevantContent: tool({
        description: 'Retrieve relevant podcast content based on the user query',
        parameters: z.object({
          query: z.string().describe('The user query to search for')
        }),
        execute: async ({ query }) => {
          return await findRelevantContent(query);
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
      
      getEpisodeSummary: tool({
        description: 'Get summary information about a specific episode by number',
        parameters: z.object({
          episodeNumber: z.string().describe('The episode number')
        }),
        execute: async ({ episodeNumber }) => {
          return await executeSafeQuery('episode_summary', { episodeNumber });
        }
      }),
      
      searchEpisodeContent: tool({
        description: 'Search for specific keywords in episode content',
        parameters: z.object({
          keyword: z.string().describe('The keyword to search for')
        }),
        execute: async ({ keyword }) => {
          return await executeSafeQuery('search_embeddings', { keyword });
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
      
      analyzeEpisodeContent: tool({
        description: 'Perform deep analysis of podcast content for specific topics or episodes',
        parameters: z.object({
          episodeNumber: z.string().optional().describe('Specific episode number to analyze'),
          topicKeyword: z.string().optional().describe('Topic keyword to focus on'),
          guestName: z.string().optional().describe('Filter by guest name'),
          analysisType: z.enum(['training_plan', 'race_strategy', 'injury_advice', 'gear_review', 'general_topic'])
            .describe('Type of analysis to perform')
        }),
        execute: async (params) => {
          return await analyzeEpisodeContent(params);
        }
      })
    }
  });

  return result.toDataStreamResponse();
} 