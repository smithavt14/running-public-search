import { encode } from 'gpt-tokenizer';
import { basename } from 'path';
import { CHUNK_SIZE, OVERLAP_SIZE } from './config.js';

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

/**
 * Group transcript files by episode to combine chunks
 * @param transcriptFiles Array of transcript files with their content
 * @returns Map of episode IDs to combined content
 */
export function groupTranscriptsByEpisode(transcriptFiles: Array<{ text: string, fileName: string }>): Map<string, EpisodeTranscript> {
  const episodeMap = new Map<string, EpisodeTranscript>();
  
  for (const file of transcriptFiles) {
    const episodeInfo = extractEpisodeInfo(file.fileName);
    const episodeId = `e${episodeInfo.episodeNumber}`;
    
    if (!episodeMap.has(episodeId)) {
      episodeMap.set(episodeId, {
        content: file.text,
        episodeInfo
      });
    } else {
      // Append this chunk's content to the existing episode content
      const existingEpisode = episodeMap.get(episodeId)!;
      existingEpisode.content += ' ' + file.text;
    }
  }
  
  return episodeMap;
}

/**
 * Create overlapping chunks from a complete transcript
 * @param text Full transcript text
 * @param chunkSize Size of each chunk in tokens
 * @param overlapSize Size of overlap between chunks in tokens
 * @returns Array of text chunks with overlap
 */
export function createOverlappingChunks(
  text: string, 
  chunkSize: number = CHUNK_SIZE, 
  overlapSize: number = OVERLAP_SIZE
): string[] {
  // If using GPT tokenizer, we need to split by sentences first to better preserve meaning
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  
  // If the text is short enough, return it as a single chunk
  const totalTokens = encode(text).length;
  if (totalTokens <= chunkSize) {
    return [text];
  }
  
  let currentChunk = "";
  let currentTokens = 0;
  let lastChunkEndTokens = 0;
  
  for (const sentence of sentences) {
    const sentenceTokens = encode(sentence).length;
    
    // If adding this sentence would exceed chunk size
    if (currentTokens + sentenceTokens > chunkSize) {
      // Save the current chunk if it's not empty
      if (currentTokens > 0) {
        chunks.push(currentChunk.trim());
        
        // Start new chunk with overlap from the end of the previous chunk
        // Try to find a sentence boundary for overlap 
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(Math.max(0, words.length - overlapSize));
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
        lastChunkEndTokens = currentTokens;
        currentTokens = encode(currentChunk).length;
      } else {
        // If a single sentence is longer than chunk size, we still add it
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      }
    } else {
      // Add the sentence to the current chunk
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentTokens += sentenceTokens;
    }
  }
  
  // Add the final chunk if it's not empty and hasn't been added
  if (currentChunk && currentTokens > 0 && currentTokens !== lastChunkEndTokens) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Break text into chunks of approximately specified token size
 * @param text Text to chunk
 * @param chunkSize Size of chunks in tokens
 * @returns Array of text chunks
 */
export function chunkText(text: string, chunkSize: number = 1000): string[] {
  const tokens = encode(text);
  const chunks: string[] = [];
  
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    const decodedChunk = chunk.join(' ').replace(/ +/g, ' ');
    chunks.push(decodedChunk);
  }
  
  return chunks;
}

/**
 * Parse an audio transcript from OpenAI Whisper/GPT-4o format
 * @param transcriptData Raw transcript data from OpenAI
 * @param chunkSize Size of chunks in tokens
 * @returns Array of text chunks
 */
export function parseAudioTranscript(transcriptData: string, chunkSize: number = 1000): string[] {
  let transcriptText: string;
  
  try {
    const parsedData = JSON.parse(transcriptData);
    
    // Extract text based on format
    if (typeof parsedData === 'string') {
      transcriptText = parsedData;
    } else if (parsedData.transcript) {
      transcriptText = parsedData.transcript;
    } else if (parsedData.text) {
      transcriptText = parsedData.text;
    } else {
      throw new Error('Unknown transcript format');
    }
  } catch (err) {
    // If parsing fails, assume it's already a text string
    transcriptText = transcriptData;
  }
  
  return chunkText(transcriptText, chunkSize);
}

/**
 * Parse a transcript from YouTube format
 * @param transcript YouTube transcript segments
 * @param maxTokens Maximum tokens per chunk
 * @returns Array of processed transcript chunks
 */
export function parseYouTubeTranscript(transcript: Transcript, maxTokens: number = 7000): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let currentChunk: TranscriptSegment[] = [];
  let currentSpeaker = '';
  let chunkStartTime = 0;
  let lastKnownSpeaker = 'Unknown';
  let currentTokenCount = 0;
    
  // Function to finalize and add a chunk
  const finalizeChunk = () => {
    if (currentChunk.length === 0) return;
    
    const lastSegment = currentChunk[currentChunk.length - 1];
      
    // Combine all text in the chunk without speaker prefixes
    const contentText = currentChunk.map(seg => {
      const spkMatch = seg.text.match(/^([^:]+):/);
      const txt = spkMatch ? seg.text.slice(spkMatch[0].length).trim() : seg.text.trim();
      return txt;
    }).join(' ');
      
    chunks.push({
      content: contentText,
      start_time: chunkStartTime.toString(),
      end_time: (lastSegment.start + lastSegment.duration).toString(),
      speaker: currentSpeaker
    });
      
    // Reset for next chunk
    currentChunk = [];
    currentTokenCount = 0;
  };

  for (let i = 0; i < transcript.length; i++) {
    const segment = transcript[i];
    
    // Extract speaker from text if present (format: "Speaker: text")
    const speakerMatch = segment.text.match(/^([^:]+):/);
    
    let speaker;
    let text;
    
    if (speakerMatch) {
      // This segment has a speaker prefix
      speaker = speakerMatch[1].trim();
      text = segment.text.slice(speakerMatch[0].length).trim();
      lastKnownSpeaker = speaker; // Update last known speaker
    } else {
      // No speaker prefix, assume it's the same as last known speaker
      speaker = lastKnownSpeaker;
      text = segment.text.trim();
    }
    
    // Count tokens in this segment
    const segmentTokens = encode(text).length;
    
    // If this would be the first segment in a chunk, always add it
    if (currentChunk.length === 0) {
      currentChunk.push(segment);
      chunkStartTime = segment.start;
      currentSpeaker = speaker;
      currentTokenCount = segmentTokens;
      continue;
    }
    
    // If adding this segment would exceed token limit, finalize the current chunk
    if (currentTokenCount + segmentTokens > maxTokens) {
      finalizeChunk();
      
      // Start a new chunk with this segment
      currentChunk = [segment];
      chunkStartTime = segment.start;
      currentSpeaker = speaker;
      currentTokenCount = segmentTokens;
      continue;
    }
    
    // If speaker changed, finalize current chunk and start a new one
    if (speaker !== currentSpeaker && currentChunk.length > 0) {
      finalizeChunk();
      
      // Start a new chunk with this segment
      currentChunk = [segment];
      chunkStartTime = segment.start;
      currentSpeaker = speaker;
      currentTokenCount = segmentTokens;
      continue;
    }
    
    // Otherwise, add to the current chunk
    currentChunk.push(segment);
    currentTokenCount += segmentTokens;
  }
  
  // Finalize the last chunk if there's anything left
  if (currentChunk.length > 0) {
    finalizeChunk();
  }
  
  return chunks;
} 