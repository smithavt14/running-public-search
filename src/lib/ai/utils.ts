import { encode } from 'gpt-tokenizer';
import { basename } from 'path';
import { CHUNK_SIZE, OVERLAP_SIZE } from './config';

// Types
export interface TranscriptFile {
  text: string;
  fileName: string;
}

export interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
}

export type Transcript = TranscriptSegment[];

export interface TranscriptChunk {
  content: string;
  start_time: string;
  end_time: string;
  speaker: string;
}

export interface EpisodeInfo {
  title: string;
  episodeNumber: string;
}

export interface EpisodeTranscript {
  content: string;
  episodeInfo: EpisodeInfo;
}

/**
 * Extract episode info from filename
 * @param fileName Filename to parse
 * @returns Episode title and number
 */
export function extractEpisodeInfo(fileName: string): EpisodeInfo {
  // Check for combined transcript format first: e[NUMBER]_transcript.json
  const combinedMatch = fileName.match(/e(\d+)_transcript\.json/);
  if (combinedMatch) {
    const episodeNumber = combinedMatch[1];
    
    return {
      title: `Episode ${episodeNumber}`,
      episodeNumber
    };
  }
  
  // Then check for chunked format: e[NUMBER]_[NAME]_chunk[NUMBER]_transcript.json
  const chunkMatch = fileName.match(/e(\d+)_(.+?)(_chunk\d+)?_transcript\.json/);
  
  if (chunkMatch) {
    const episodeNumber = chunkMatch[1];
    const name = chunkMatch[2].replace(/_/g, ' ');
    const title = `${name.charAt(0).toUpperCase() + name.slice(1)}`;
    
    return {
      title,
      episodeNumber
    };
  }
  
  return {
    title: basename(fileName),
    episodeNumber: 'Unknown'
  };
}

