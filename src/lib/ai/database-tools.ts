import { db } from '../db';
import { sql } from 'drizzle-orm';
import { resources } from '../db/schema/resources';
import { embeddings } from '../db/schema/embeddings';

/**
 * Executes a SQL query against the database
 * IMPORTANT: This should only be used with predetermined safe queries
 * to avoid SQL injection risks
 */
export async function executeSafeQuery(queryType: 'list_resources' | 'resource_details' | 'episode_summary' | 'search_embeddings' | 'list_guests' | 'episode_content', params?: Record<string, any>) {
  try {
    switch (queryType) {
      case 'list_resources':
        // List all podcast episodes
        return await db
          .select({
            id: resources.id,
            title: resources.title,
            episodeNumber: resources.episodeNumber,
            pubDate: resources.pubDate,
            guests: resources.guests
          })
          .from(resources)
          .orderBy(resources.pubDate);
      
      case 'resource_details':
        // Get details for a specific episode
        if (!params?.id) throw new Error('Episode ID is required');
        return await db
          .select()
          .from(resources)
          .where(sql`${resources.id} = ${params.id}`)
          .limit(1);
      
      case 'episode_summary':
        // Get summary for a specific episode number
        if (!params?.episodeNumber) throw new Error('Episode number is required');
        return await db
          .select({
            id: resources.id,
            title: resources.title,
            summary: resources.summary,
            guests: resources.guests
          })
          .from(resources)
          .where(sql`${resources.episodeNumber} = ${params.episodeNumber}`)
          .limit(1);
      
      case 'search_embeddings':
        // Search for content across all episodes (limited to prevent abuse)
        if (!params?.keyword) throw new Error('Search keyword is required');
        return await db
          .select({
            id: embeddings.id,
            content: embeddings.content,
            resourceId: embeddings.resourceId
          })
          .from(embeddings)
          .where(sql`${embeddings.content} ILIKE ${'%' + params.keyword + '%'}`)
          .limit(10);
          
      case 'list_guests':
        // Get all unique guests from the podcast
        const allEpisodes = await db
          .select({
            guests: resources.guests,
            title: resources.title,
            episodeNumber: resources.episodeNumber
          })
          .from(resources)
          .where(sql`${resources.guests} IS NOT NULL`);
        
        // Extract and process all guests
        const guestMap = new Map();
        
        for (const episode of allEpisodes) {
          try {
            // Parse guest JSON if it's a string
            const guestList = typeof episode.guests === 'string' 
              ? JSON.parse(episode.guests) 
              : episode.guests;
              
            if (Array.isArray(guestList)) {
              for (const guest of guestList) {
                if (guest && typeof guest === 'string' && guest.trim() !== '') {
                  if (!guestMap.has(guest)) {
                    guestMap.set(guest, []);
                  }
                  guestMap.get(guest).push({
                    episodeNumber: episode.episodeNumber,
                    title: episode.title
                  });
                }
              }
            }
          } catch (e) {
            console.error(`Error parsing guests for episode ${episode.episodeNumber}:`, e);
          }
        }
        
        // Convert to array of guest objects with appearances
        const uniqueGuests = Array.from(guestMap.entries()).map(([name, episodes]) => ({
          name,
          episodeCount: episodes.length,
          episodes
        }));
        
        return {
          guests: uniqueGuests,
          totalGuests: uniqueGuests.length
        };
          
      case 'episode_content':
        // Get all content chunks for a specific episode
        let episodeId;
        
        // First, find the episode by guest name, episode number, or title
        if (params?.guestName) {
          const episodes = await db
            .select({
              id: resources.id,
              title: resources.title,
              episodeNumber: resources.episodeNumber,
              guests: resources.guests
            })
            .from(resources)
            .where(sql`${resources.guests} LIKE ${'%' + params.guestName + '%'}`);
          
          if (episodes.length > 0) {
            episodeId = episodes[0].id;
          }
        } else if (params?.episodeNumber) {
          const episodes = await db
            .select({
              id: resources.id,
              title: resources.title,
              episodeNumber: resources.episodeNumber
            })
            .from(resources)
            .where(sql`${resources.episodeNumber} = ${params.episodeNumber}`);
          
          if (episodes.length > 0) {
            episodeId = episodes[0].id;
          }
        } else if (params?.episodeTitle) {
          const episodes = await db
            .select({
              id: resources.id,
              title: resources.title,
              episodeNumber: resources.episodeNumber
            })
            .from(resources)
            .where(sql`${resources.title} ILIKE ${'%' + params.episodeTitle + '%'}`);
          
          if (episodes.length > 0) {
            episodeId = episodes[0].id;
          }
        } else if (params?.id) {
          episodeId = params.id;
        } else {
          throw new Error('At least one episode identifier is required');
        }
        
        if (!episodeId) {
          return { 
            success: false, 
            message: "No matching episode found with the provided criteria." 
          };
        }
        
        // Get episode details
        const episodeDetails = await db
          .select()
          .from(resources)
          .where(sql`${resources.id} = ${episodeId}`)
          .limit(1);
          
        if (episodeDetails.length === 0) {
          return { 
            success: false, 
            message: "Episode details not found." 
          };
        }
        
        // Get all content chunks for this episode
        const contentChunks = await db
          .select({
            id: embeddings.id,
            content: embeddings.content
          })
          .from(embeddings)
          .where(sql`${embeddings.resourceId} = ${episodeId}`);
          
        return {
          success: true,
          episode: episodeDetails[0],
          contentChunks: contentChunks.map(chunk => chunk.content),
          totalChunks: contentChunks.length
        };
          
      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }
  } catch (error) {
    console.error('Error executing database query:', error);
    throw error;
  }
}

/**
 * Get episode statistics from the database
 */
export async function getResourceStats() {
  try {
    // Get total episodes count
    const episodeCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(resources);
    
    // Get total embeddings count
    const embeddingCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(embeddings);
    
    // Get most recent episode
    const latestEpisode = await db
      .select({
        title: resources.title,
        episodeNumber: resources.episodeNumber,
        pubDate: resources.pubDate
      })
      .from(resources)
      .orderBy(sql`${resources.pubDate} DESC`)
      .limit(1);
    
    return {
      totalEpisodes: episodeCountResult[0].count,
      totalEmbeddings: embeddingCountResult[0].count,
      latestEpisode: latestEpisode[0] || null,
    };
  } catch (error) {
    console.error('Error getting resource stats:', error);
    throw error;
  }
} 