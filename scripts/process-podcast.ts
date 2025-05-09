import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { 
  processAllAudioFiles, 
  generateEmbeddingsForTranscripts 
} from '../src/lib/ai/processors.js';

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
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const skipTranscription = args.includes('--skip-transcription') || args.includes('-st');
const onlyEmbeddings = args.includes('--only-embeddings') || args.includes('-oe');
const showHelp = args.includes('--help') || args.includes('-h');

// Show help message
if (showHelp) {
  console.log(`
Running Public Podcast Processing Script

Options:
  --skip-transcription, -st  Skip transcription if transcripts already exist
  --only-embeddings, -oe     Only generate embeddings (skip transcription entirely)
  --help, -h                 Show this help message

Examples:
  pnpm process-podcast                  # Process everything
  pnpm process-podcast --skip-transcription    # Skip transcription if transcripts exist
  pnpm process-podcast --only-embeddings       # Only generate embeddings
  `);
  process.exit(0);
}

/**
 * Main function to process podcast audio and generate embeddings
 */
async function processPodcast() {
  try {
    console.log('=== Running Public Podcast Processing Pipeline ===');
    
    // Step 1: Process audio files (if not skipped)
    if (!onlyEmbeddings) {
      console.log('Step 1: Processing audio files (splitting & transcribing)...');
      await processAllAudioFiles(skipTranscription);
    } else {
      console.log('Step 1: Skipping audio processing (--only-embeddings flag used)');
    }
    
    // Step 2: Generate embeddings
    console.log('\nStep 2: Generating embeddings from transcripts...');
    await generateEmbeddingsForTranscripts();
    
    console.log('\n✅ Podcast processing completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error in podcast processing pipeline:', error);
    process.exit(1);
  }
}

// Run the main function
processPodcast().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 