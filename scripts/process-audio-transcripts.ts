import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, basename, extname } from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { transcribeAudio } from '../src/lib/ai/transcripts.js';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(dirname(__dirname), '.env.local') });

// Convert callback-based functions to Promise-based
const exec = promisify(execCallback);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Constants
const AUDIO_FILES_DIR = join(process.cwd(), 'data', 'audio_files');
const CHUNKS_DIR = join(process.cwd(), 'data', 'audio_chunks');
const TRANSCRIPTS_DIR = join(process.cwd(), 'data', 'transcripts');
const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_DURATION_SECONDS = 1450; // Maximum duration in seconds (staying under the 1500s limit)

// Check if required tools are installed
async function checkDependencies() {
  try {
    // Check for ffmpeg
    await exec('ffmpeg -version');
    console.log('✅ ffmpeg is installed');
    
    // Check for ffprobe
    await exec('ffprobe -version');
    console.log('✅ ffprobe is installed');
    
    return true;
  } catch (error) {
    console.error('❌ Required dependencies are missing:');
    console.error('Please install ffmpeg and ffprobe to use this script.');
    console.error('Installation instructions: https://ffmpeg.org/download.html');
    return false;
  }
}

// Ensure directories exist
async function ensureDirectories() {
  try {
    await mkdir(CHUNKS_DIR, { recursive: true });
    await mkdir(TRANSCRIPTS_DIR, { recursive: true });
    console.log('Directories verified/created.');
  } catch (error) {
    console.error('Error creating directories:', error);
    throw error;
  }
}

// Get file size in bytes
async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size;
}

// Get audio duration in seconds using ffprobe
async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error(`Error getting duration for ${filePath}:`, error);
    throw error;
  }
}

// Split audio file into chunks under MAX_SIZE_MB and MAX_DURATION_SECONDS
async function splitAudioFile(filePath: string): Promise<string[]> {
  const fileSize = await getFileSize(filePath);
  const duration = await getAudioDuration(filePath);
  
  // Check if file is already under limits
  if (fileSize <= MAX_SIZE_BYTES && duration <= MAX_DURATION_SECONDS) {
    console.log(`File ${basename(filePath)} is already under ${MAX_SIZE_MB}MB and ${MAX_DURATION_SECONDS}s, no need to split.`);
    
    // Still copy to chunks dir for consistent processing
    const outputPath = join(CHUNKS_DIR, basename(filePath));
    await fs.promises.copyFile(filePath, outputPath);
    return [outputPath];
  }
  
  console.log(`Splitting ${basename(filePath)} (${(fileSize / (1024 * 1024)).toFixed(2)}MB, ${duration.toFixed(2)}s)...`);
  
  const fileExt = extname(filePath);
  const fileName = basename(filePath, fileExt);
  
  // Calculate number of chunks needed based on both size and duration constraints
  const numChunksBySize = Math.ceil(fileSize / MAX_SIZE_BYTES);
  const numChunksByDuration = Math.ceil(duration / MAX_DURATION_SECONDS);
  const numChunks = Math.max(numChunksBySize, numChunksByDuration);
  
  // Duration of each chunk
  const chunkDuration = Math.min(duration / numChunks, MAX_DURATION_SECONDS);
  
  console.log(`File duration: ${duration.toFixed(2)}s, dividing into ${numChunks} chunks of ~${chunkDuration.toFixed(2)}s each`);
  
  const chunkPaths: string[] = [];
  
  // Create each chunk
  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDuration;
    const outputPath = join(CHUNKS_DIR, `${fileName}_chunk${i + 1}${fileExt}`);
    
    // Use ffmpeg to split the audio
    const ffmpegCmd = `ffmpeg -y -i "${filePath}" -ss ${startTime} -t ${chunkDuration} -c copy "${outputPath}"`;
    
    console.log(`Creating chunk ${i + 1}/${numChunks}...`);
    await exec(ffmpegCmd);
    
    // Verify the chunk size and duration
    const chunkSize = await getFileSize(outputPath);
    const chunkActualDuration = await getAudioDuration(outputPath);
    console.log(`Chunk ${i + 1} size: ${(chunkSize / (1024 * 1024)).toFixed(2)}MB, duration: ${chunkActualDuration.toFixed(2)}s`);
    
    chunkPaths.push(outputPath);
  }
  
  return chunkPaths;
}

// Save transcript to file
async function saveTranscript(audioFilePath: string, transcript: string): Promise<string> {
  const fileName = basename(audioFilePath, extname(audioFilePath));
  const transcriptPath = join(TRANSCRIPTS_DIR, `${fileName}_transcript.json`);
  
  await fs.promises.writeFile(transcriptPath, transcript, 'utf-8');
  console.log(`Transcript saved to ${transcriptPath}`);
  
  return transcriptPath;
}

// Process all audio files in the directory
async function processAudioFiles() {
  try {
    // Check dependencies first
    const dependenciesAvailable = await checkDependencies();
    if (!dependenciesAvailable) {
      process.exit(1);
    }
    
    // Ensure necessary directories exist
    await ensureDirectories();
    
    // Get all audio files
    const files = await readdir(AUDIO_FILES_DIR);
    const audioFiles = files.filter(file => {
      const ext = extname(file).toLowerCase();
      return ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg'].includes(ext);
    });
    
    if (audioFiles.length === 0) {
      console.log('No audio files found in the directory.');
      return;
    }
    
    console.log(`Found ${audioFiles.length} audio file(s) to process.`);
    
    // Process each audio file
    for (const audioFile of audioFiles) {
      const audioFilePath = join(AUDIO_FILES_DIR, audioFile);
      console.log(`\nProcessing file: ${audioFile}`);
      
      // Step 1: Split into chunks if needed
      const chunks = await splitAudioFile(audioFilePath);
      console.log(`Split into ${chunks.length} chunk(s)`);
      
      // Step 2: Transcribe each chunk
      for (const chunkPath of chunks) {
        const transcript = await transcribeAudio(chunkPath, {
          temperature: 0.2,
          responseFormat: 'json'
        });
        await saveTranscript(chunkPath, transcript);
      }
      
      console.log(`Completed processing ${audioFile}`);
    }
    
    console.log('\nAll audio files processed successfully.');
  } catch (error) {
    console.error('Error processing audio files:', error);
    process.exit(1);
  }
}

// Run the main function
processAudioFiles().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
