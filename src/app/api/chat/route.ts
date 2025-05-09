import { streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { findRelevantContent } from '@/lib/ai/embedding.js';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    system: `You are an AI assistant for The Running Public Podcast, a podcast about running hosted by professional runners. 
    
    Answer questions based on the information retrieved from the knowledge base.
    
    If no relevant information is found in the knowledge base, let the user know you don't have that specific information but can offer general running advice. 
    
    Keep your answers concise, accurate, and focused on the podcast content.`,
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
      })
    }
  });

  return result.toDataStreamResponse();
} 