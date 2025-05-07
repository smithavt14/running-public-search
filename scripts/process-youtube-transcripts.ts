import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(dirname(__dirname), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { readFileSync } from 'fs';
import { encode } from 'gpt-tokenizer';

// Types
interface Video {
  id: string;
  title: string;
  description: string;
  published_at: string;
}

interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
}

type Transcript = TranscriptSegment[];

interface Chunk {
  content: string;
  start_time: string;
  end_time: string;
  speaker: string;
}

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Load video list
function loadVideoList(): Video[] {
  const videoListPath = join(process.cwd(), 'data', 'video_list.json');
  const videoListContent = readFileSync(videoListPath, 'utf-8');
  return JSON.parse(videoListContent);
}

// Load transcript
function loadTranscript(videoId: string): Transcript | null {
  try {
    const transcriptPath = join(process.cwd(), 'data', 'transcripts', `${videoId}.json`);
    const transcriptContent = readFileSync(transcriptPath, 'utf-8');
    const transcript = JSON.parse(transcriptContent);
    return transcript;
  } catch (err) {
    console.log(`No transcript found for video ${videoId}`);
    return null;
  }
}

// Chunk transcript
function chunkTranscript(transcript: Transcript, maxTokens: number = 7000): Chunk[] {
  const chunks: Chunk[] = [];
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
    
    // If speaker changed, finalize current chunk and start a new one (if we have enough segments)
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
  
  // Debug information
  console.log(`Created ${chunks.length} chunks. Token counts:`);
  for (let i = 0; i < chunks.length; i++) {
    const tokenCount = encode(chunks[i].content).length;
    console.log(`Chunk ${i+1}: ${tokenCount} tokens, Speaker: ${chunks[i].speaker}`);
  }
  
  return chunks;
}

// Get embedding
async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  
  return response.data[0].embedding;
}

// Main function
async function processAndStoreTranscripts() {
  try {
    console.log('Starting transcript processing...');
    
    // Load video list
    const videos = loadVideoList();
    console.log(`Found ${videos.length} videos to process`);
    
    // Only process the first video for debugging
    const firstVideo = videos[0];
    if (!firstVideo) {
      console.log('No videos found to process');
      process.exit(0);
    }
    
    console.log(`Processing single video for debugging: ${firstVideo.title}`);
    console.log('Video ID:', firstVideo.id);
    
    // Load transcript
    const transcript = loadTranscript(firstVideo.id);
    if (!transcript) {
      console.log('No transcript found for the first video');
      process.exit(0);
    }
    
    // Chunk transcript
    const chunks = chunkTranscript(transcript);
    console.log(`Created ${chunks.length} chunks for video ${firstVideo.id}`);
    
    // Process each chunk
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
        
        // Generate embedding
        const embedding = await getEmbedding(chunk.content);
        
        // Prepare data for Supabase
        const data = {
          content: chunk.content,
          video_id: firstVideo.id,
          video_title: firstVideo.title,
          start_time: Math.floor(parseFloat(chunk.start_time)),
          end_time: Math.floor(parseFloat(chunk.end_time)),
          speaker: chunk.speaker,
          embedding: embedding
        };
        
        // Store in Supabase
        const { error } = await supabase
          .from('transcript_chunks')
          .insert(data);
        
        if (error) {
          console.error(`Error storing chunk ${i + 1}:`, error.message);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`Error processing chunk ${i + 1}:`, err instanceof Error ? err.message : 'Unknown error');
        errorCount++;
      }
    }
    
    console.log('\nProcessing complete!');
    console.log(`Successfully processed: ${successCount} chunks`);
    console.log(`Failed to process: ${errorCount} chunks`);
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  }
}

// Run the script
processAndStoreTranscripts(); 