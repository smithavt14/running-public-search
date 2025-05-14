import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { MAX_EPISODES, PODCAST_FEED_URL } from './config';

// Convert fs functions to Promise-based
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const writeFile = promisify(fs.writeFile);

// Interface for podcast episode metadata
export interface PodcastEpisode {
  guid: string;
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  enclosureUrl: string;
  author: string;
  duration: string;
  episodeNumber: string;
  localFilePath?: string;
  transcriptPath?: string;
  summary?: string;
  guests?: string[];
}

/**
 * Fetches and parses the podcast RSS feed
 * @param maxEpisodes Maximum number of episodes to return (defaults to MAX_EPISODES from config)
 * @param offset Number of episodes to skip (defaults to 0)
 * @returns Array of podcast episodes
 */
export async function fetchPodcastFeed(maxEpisodes = MAX_EPISODES, offset = 0): Promise<PodcastEpisode[]> {
  try {
    const response = await axios.get(PODCAST_FEED_URL);
    
    // Create parser with XML options
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true
    });
    
    const result = parser.parse(response.data);
    
    // Extract episodes from the feed
    const items = Array.isArray(result.rss.channel.item) 
      ? result.rss.channel.item 
      : [result.rss.channel.item];
      
    const episodes = items.map((item: any) => {
      // Clean description, removing HTML tags
      let description = '';
      if (item.description) {
        description = item.description.replace(/<[^>]*>/g, '').trim();
      } else if (item['itunes:summary']) {
        description = item['itunes:summary'].replace(/<[^>]*>/g, '').trim();
      }
      
      // Get episode number from itunes:episode tag if available
      let episodeNumber = item['itunes:episode'] || '';
      
      // Extract enclosure URL for the audio file
      let enclosureUrl = '';
      if (item.enclosure && item.enclosure['@_url']) {
        enclosureUrl = item.enclosure['@_url'];
      }

      // Extract guid 
      let guid = '';
      // Handle the object form with #text property (the common case from XML parser)
      if (item.guid && typeof item.guid === 'object' && item.guid['#text']) {
        guid = item.guid['#text'];
      } 
      // Handle string form
      else if (typeof item.guid === 'string') {
        guid = item.guid;
      }
      // Fallback to string conversion
      else if (item.guid) {
        guid = String(item.guid);
      }
      
      // Extract just the UUID part after podbean.com/
      if (guid && guid.includes('podbean.com/')) {
        guid = guid.split('podbean.com/')[1];
      }
      
      return {
        guid,
        title: item.title,
        link: item.link,
        pubDate: new Date(item.pubDate),
        description,
        enclosureUrl,
        author: item['itunes:author'] || 'Kirk Dewindt & Brakken Kraker',
        duration: item['itunes:duration'] || '',
        episodeNumber
      };
    });
    
    // Sort by most recent, apply offset and limit to maxEpisodes
    console.log(`Found ${episodes.length} episodes in the feed`);
    return episodes
      .sort((a: any, b: any) => b.pubDate.getTime() - a.pubDate.getTime())
      .slice(offset, offset + maxEpisodes);
  } catch (error) {
    console.error('Error fetching podcast feed:', error);
    throw error;
  }
}

/**
 * Downloads podcast audio files from the feed
 * @param episodes Array of podcast episodes
 * @returns Array of episodes with localFilePath added
 */
export async function downloadPodcastEpisodes(episodes: PodcastEpisode[]): Promise<PodcastEpisode[]> {
  const audioDir = path.join(process.cwd(), 'data', 'audio_files');
  
  // Ensure audio directory exists
  await mkdir(audioDir, { recursive: true });
  
  const updatedEpisodes: PodcastEpisode[] = [];
  
  for (let i = 0; i < episodes.length; i++) {
    const episode = episodes[i];
    if (!episode.enclosureUrl) {
      console.warn(`Episode ${episode.title} has no audio URL, skipping...`);
      continue;
    }
    
    try {
      console.log(`Downloading episode ${i+1}/${episodes.length}: ${episode.episodeNumber}`);
      
      // Generate filename from episode number
      const filename = `e${episode.episodeNumber}.mp3`
      const filePath = path.join(audioDir, filename);
      
      // Check if file already exists
      try {
        await access(filePath);
        console.log(`File already exists: ${filename}, skipping download`);
      } catch {
        
        const response = await axios({
          method: 'get',
          url: episode.enclosureUrl,
          responseType: 'arraybuffer'
        });
        
        await writeFile(filePath, response.data);
        console.log(`Downloaded ${filename}`);
      }
      
      // Add local file path to episode
      updatedEpisodes.push({
        ...episode,
        localFilePath: filePath
      });
    } catch (error) {
      console.error(`Error downloading episode ${episode.episodeNumber}:`, error);
    }
  }
  
  return updatedEpisodes;
} 