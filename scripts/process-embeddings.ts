import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { OpenAI } from 'openai';
import { readFileSync, readdirSync } from 'fs';
import { encode } from 'gpt-tokenizer';
import fs from 'fs';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(dirname(__dirname), '.env.local') });

// Check for required environment variables
const requiredEnvVars = ['DATABASE_URL', 'OPENAI_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(envVar => console.error(`   - ${envVar}`));
  console.error('\nPlease add these to your .env.local file. See .env.example for reference.');
  
  // Check if .env.local exists
  const envLocalPath = join(dirname(__dirname), '.env.local');
  if (!fs.existsSync(envLocalPath)) {
    console.error('\n.env.local file not found. Please create it by copying .env.example:');
    console.error('cp .env.example .env.local');
  }
  
  process.exit(1);
}

// Import DB and schema after environment variables are loaded
import { db } from '../src/lib/db/index.js';
import { resources } from '../src/lib/db/schema/resources.js';
import { embeddings } from '../src/lib/db/schema/embeddings.js';
import { 
  extractEpisodeInfo, 
  groupTranscriptsByEpisode, 
  createOverlappingChunks 
} from '../src/lib/ai/transcripts.js';

// Initialize OpenAI client for regular API calls
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize embedding model for AI SDK
const embeddingModel = openai.embedding('text-embedding-3-small');

// Types
interface TranscriptFile {
  text: string;
  fileName: string;
}

interface ProcessedChunk {
  content: string;
  episodeTitle: string;
  episodeNumber: string;
  tokens: number;
}

// Constants
const CHUNK_SIZE = 1000; // Size of each chunk in tokens
const OVERLAP_SIZE = 200; // Size of overlap between chunks in tokens

// Main function
async function main() {
  try {
    console.log('Starting transcript processing...');
    
    // Process transcripts
    await processTranscripts();
    
    console.log('All done!');
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

// Load transcript files from the data/transcripts directory
function loadTranscriptFiles(): TranscriptFile[] {
  const transcriptsDir = join(process.cwd(), 'data', 'transcripts');
  
  try {
    const files = readdirSync(transcriptsDir);
    const transcriptFiles: TranscriptFile[] = [];
    
    for (const file of files) {
      if (file.endsWith('_transcript.json')) {
        const filePath = join(transcriptsDir, file);
        try {
          const fileContent = readFileSync(filePath, 'utf-8');
          const transcriptData = JSON.parse(fileContent);
          
          // Extract text based on format
          let transcriptText: string;
          
          if (typeof transcriptData === 'string') {
            transcriptText = transcriptData;
          } else if (transcriptData.transcript) {
            transcriptText = transcriptData.transcript;
          } else if (transcriptData.text) {
            transcriptText = transcriptData.text;
          } else {
            console.warn(`Skipping file ${file}: Unknown format`);
            continue;
          }
          
          transcriptFiles.push({
            text: transcriptText,
            fileName: file
          });
        } catch (err) {
          console.error(`Error reading file ${file}:`, err);
        }
      }
    }
    
    return transcriptFiles;
  } catch (err) {
    console.error('Error reading transcripts directory:', err);
    return [];
  }
}

// Function to process transcript files
async function processTranscripts() {
  const transcriptFiles = loadTranscriptFiles();
  
  if (transcriptFiles.length === 0) {
    console.log('No transcript files found to process');
    return;
  }
  
  console.log(`Found ${transcriptFiles.length} transcript files...`);
  
  // Group transcript files by episode
  const episodeMap = groupTranscriptsByEpisode(transcriptFiles);
  console.log(`Grouped into ${episodeMap.size} episodes`);
  
  // Process each episode
  for (const [episodeId, episode] of episodeMap.entries()) {
    console.log(`\nProcessing episode: ${episodeId} - ${episode.episodeInfo.title}`);
    
    // Create resource for the episode
    const resourceDescription = `Episode ${episode.episodeInfo.episodeNumber}: ${episode.episodeInfo.title} from The Running Public podcast`;
    
    console.log(`Creating resource: ${resourceDescription}`);
    
    // Insert resource into database
    const [resourceResult] = await db.insert(resources)
      .values({
        content: resourceDescription
      })
      .returning();
    
    if (!resourceResult) {
      console.error(`Failed to create resource for episode ${episodeId}`);
      continue;
    }
    
    console.log(`Resource created with ID: ${resourceResult.id}`);
    
    // Create overlapping chunks from the episode content
    const chunks = createOverlappingChunks(episode.content, CHUNK_SIZE, OVERLAP_SIZE);
    console.log(`Created ${chunks.length} overlapping chunks for episode ${episodeId}`);
    
    try {
      console.log(`Generating embeddings for ${chunks.length} chunks...`);
      
      // Generate embeddings for all chunks at once
      const { embeddings: chunkEmbeddings } = await embedMany({
        model: embeddingModel,
        values: chunks,
      });
      
      console.log(`Successfully generated ${chunkEmbeddings.length} embeddings`);
      
      // Insert embeddings into database
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          // Calculate token count for logging purposes only
          const tokenCount = encode(chunk).length;
          console.log(`Storing chunk ${i + 1}/${chunks.length} (${tokenCount} tokens)...`);
          
          // Insert embedding into database
          await db.insert(embeddings).values({
            resourceId: resourceResult.id,
            content: chunk,
            embedding: chunkEmbeddings[i],
          });
          
          console.log(`Successfully stored chunk ${i + 1}`);
          successCount++;
        } catch (err) {
          console.error(`Error storing chunk ${i + 1}:`, err);
          errorCount++;
        }
      }
      
      console.log(`Episode ${episodeId} processing complete. Successful: ${successCount}, Errors: ${errorCount}`);
    } catch (err) {
      console.error(`Error generating embeddings for episode ${episodeId}:`, err);
    }
  }
  
  console.log('\nAll episodes processed successfully.');
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
