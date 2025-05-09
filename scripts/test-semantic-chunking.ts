import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { encode } from 'gpt-tokenizer';
import { createSemanticChunks } from '../src/lib/ai/semantic-chunker.js';
import { createOverlappingChunks } from '../src/lib/ai/utils.js';
import { CHUNK_SIZE, OVERLAP_SIZE } from '../src/lib/ai/config.js';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(dirname(__dirname), '.env.local') });

// Constants
const TRANSCRIPTS_DIR = join(process.cwd(), 'data', 'transcripts');
const OUTPUT_DIR = join(process.cwd(), 'data', 'chunk_comparison');

// Helper function to load a transcript file
function loadTranscriptFile(fileName: string): string {
  try {
    const filePath = join(TRANSCRIPTS_DIR, fileName);
    const fileContent = readFileSync(filePath, 'utf-8');
    
    try {
      // Try to parse JSON
      const jsonContent = JSON.parse(fileContent);
      
      if (typeof jsonContent === 'string') {
        return jsonContent;
      } else if (jsonContent.transcript) {
        return jsonContent.transcript;
      } else if (jsonContent.text) {
        return jsonContent.text;
      } else {
        return fileContent; // Use as-is if no transcript property
      }
    } catch (e) {
      // Not JSON, use as-is
      return fileContent;
    }
  } catch (err) {
    console.error(`Error reading file ${fileName}:`, err);
    return '';
  }
}

// Format chunk for display
function formatChunk(chunk: string, index: number, tokenCount: number): string {
  return `\n---------- CHUNK ${index + 1} (${tokenCount} tokens) ----------\n${chunk}\n`;
}

// Save comparison results
function saveComparisonResults(fileName: string, originalChunks: string[], semanticChunks: string[]): void {
  const originalFormatted = originalChunks.map((chunk, i) => 
    formatChunk(chunk, i, encode(chunk).length)
  ).join('\n');
  
  const semanticFormatted = semanticChunks.map((chunk, i) => 
    formatChunk(chunk, i, encode(chunk).length)
  ).join('\n');
  
  const comparisonText = `
=============================================
ORIGINAL CHUNKING (${originalChunks.length} chunks)
=============================================
${originalFormatted}

=============================================
SEMANTIC CHUNKING (${semanticChunks.length} chunks)
=============================================
${semanticFormatted}

=============================================
SUMMARY
=============================================
Original chunking: ${originalChunks.length} chunks
Semantic chunking: ${semanticChunks.length} chunks

Original chunking token counts: ${originalChunks.map(c => encode(c).length).join(', ')}
Semantic chunking token counts: ${semanticChunks.map(c => encode(c).length).join(', ')}
`;

  // Create output directory if it doesn't exist
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Save to file
  const outputPath = join(OUTPUT_DIR, `${fileName.replace('.json', '')}_comparison.txt`);
  writeFileSync(outputPath, comparisonText, 'utf-8');
  
  console.log(`Comparison saved to ${outputPath}`);
}

// Main function
async function main() {
  try {
    console.log('Testing semantic chunking vs original chunking...');
    
    // Get the list of transcript files
    const files = readdirSync(TRANSCRIPTS_DIR);
    const transcriptFiles = files.filter((file: string) => file.endsWith('_transcript.json'));
    
    if (transcriptFiles.length === 0) {
      console.log('No transcript files found to process');
      return;
    }
    
    console.log(`Found ${transcriptFiles.length} transcript files...`);
    
    // Process a limited number of files for comparison
    const MAX_FILES_TO_PROCESS = 2;
    const filesToProcess = transcriptFiles.slice(0, MAX_FILES_TO_PROCESS);
    
    for (const fileName of filesToProcess) {
      console.log(`\nProcessing ${fileName}...`);
      
      // Load transcript content
      const transcriptContent = loadTranscriptFile(fileName);
      if (!transcriptContent) {
        console.log(`Skipping ${fileName} - no content found`);
        continue;
      }
      
      // Generate chunks with both methods
      console.log(`Creating chunks with original method...`);
      const originalChunks = createOverlappingChunks(transcriptContent, CHUNK_SIZE, OVERLAP_SIZE);
      
      console.log(`Creating chunks with semantic method...`);
      const semanticChunks = await createSemanticChunks(transcriptContent, CHUNK_SIZE, OVERLAP_SIZE);
      
      // Log summary
      console.log(`\nChunking comparison for ${fileName}:`);
      console.log(`- Original chunking: ${originalChunks.length} chunks`);
      console.log(`- Semantic chunking: ${semanticChunks.length} chunks`);
      
      // Save detailed comparison
      saveComparisonResults(fileName, originalChunks, semanticChunks);
    }
    
    console.log('\nChunking comparison complete!');
    console.log(`Results saved to ${OUTPUT_DIR}`);
    
  } catch (err) {
    console.error('Error during chunking test:', err);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 