import { db } from '../db';
import { resources } from '../db/schema/resources';
import { embeddings } from '../db/schema/embeddings';
import { openai } from '@ai-sdk/openai';
import { eq, sql, desc, asc, and, or, like } from 'drizzle-orm';

/**
 * Extract structured data from podcast content 
 * This performs complex analysis by combining database queries with AI processing
 */
export async function analyzeEpisodeContent(options: {
  episodeNumber?: string;
  topicKeyword?: string;
  guestName?: string;
  analysisType: 'training_plan' | 'race_strategy' | 'injury_advice' | 'gear_review' | 'general_topic';
}) {
  try {
    const { episodeNumber, topicKeyword, guestName, analysisType } = options;
    
    // Build the query based on provided filters
    let query = db
      .select({
        id: resources.id,
        title: resources.title,
        episodeNumber: resources.episodeNumber,
        summary: resources.summary,
        guests: resources.guests
      })
      .from(resources);
    
    // Apply filters
    const conditions = [];
    if (episodeNumber) {
      conditions.push(eq(resources.episodeNumber, episodeNumber));
    }
    if (guestName) {
      conditions.push(sql`${resources.guests} LIKE ${'%' + guestName + '%'}`);
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    
    // Execute the query to find matching episodes
    const matchingEpisodes = await query;
    if (matchingEpisodes.length === 0) {
      return { 
        success: false, 
        message: "No matching episodes found with the provided criteria." 
      };
    }
    
    // For each matching episode, get relevant content chunks
    const episodeContentPromises = matchingEpisodes.map(async (episode) => {
      const contentChunks = await db
        .select({
          content: embeddings.content
        })
        .from(embeddings)
        .where(eq(embeddings.resourceId, episode.id));
      
      // Filter chunks for relevant content if topicKeyword provided
      let relevantChunks = contentChunks;
      if (topicKeyword) {
        relevantChunks = contentChunks.filter(chunk => 
          chunk.content.toLowerCase().includes(topicKeyword.toLowerCase())
        );
      }
      
      return {
        episodeInfo: episode,
        contentChunks: relevantChunks.map(c => c.content)
      };
    });
    
    const episodeDetails = await Promise.all(episodeContentPromises);
    
    // Initialize OpenAI to process and analyze these results
    // This helps create a structured response based on the data
    const analysisPrompt = createAnalysisPrompt(episodeDetails, analysisType, topicKeyword);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that analyzes podcast content and extracts structured information.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });
    
    const analysisResult = await response.json();
    return {
      success: true,
      episodes: matchingEpisodes,
      analysis: JSON.parse(analysisResult.choices[0].message.content)
    };
    
  } catch (error) {
    console.error('Error in episode content analysis:', error);
    return {
      success: false,
      message: `Error analyzing episode content: ${(error as Error).message}`
    };
  }
}

/**
 * Create a prompt for analyzing podcast content based on analysis type
 */
function createAnalysisPrompt(
  episodeDetails: Array<{
    episodeInfo: any;
    contentChunks: string[];
  }>,
  analysisType: string,
  topicKeyword?: string
): string {
  // Combine all content chunks into one text, limited to avoid token limits
  const combinedContent = episodeDetails
    .map(ep => {
      const chunks = ep.contentChunks.slice(0, 5).join("\n\n"); // Limit to 5 chunks per episode
      return `Episode ${ep.episodeInfo.episodeNumber}: ${ep.episodeInfo.title}\n${chunks}`;
    })
    .join("\n\n---------------\n\n")
    .slice(0, 12000); // Limit total content to avoid token limits
    
  // Create different prompts based on analysis type
  switch (analysisType) {
    case 'training_plan':
      return `Analyze the following podcast content and extract any training plan advice or workouts discussed:
      
${combinedContent}

Return a JSON object with the following structure:
{
  "key_workouts": [array of specific workouts mentioned],
  "training_principles": [key training principles discussed],
  "sample_week": {structured representation of a sample training week if available, or null},
  "context": {episode references and timestamps or context}
}`;

    case 'race_strategy':
      return `Analyze the following podcast content and extract any race strategy advice:
      
${combinedContent}

Return a JSON object with the following structure:
{
  "pre_race": [preparation strategies mentioned],
  "during_race": [execution strategies discussed],
  "pacing_advice": [specific pacing recommendations],
  "nutrition_strategy": [race nutrition recommendations],
  "context": {episode references and timestamps or context}
}`;

    default:
      return `Analyze the following podcast content ${topicKeyword ? `related to ${topicKeyword}` : ''}:
      
${combinedContent}

Return a JSON object with the following structure:
{
  "key_points": [array of main points discussed],
  "expert_advice": [specific advice from hosts or guests],
  "recommendations": [product, training, or other recommendations],
  "context": {episode references and timestamps or context}
}`;
  }
} 