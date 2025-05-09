import { join, basename, extname } from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { transcribeAudio } from './audio.js';
import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { db } from '../db/index.js';
import { resources } from '../db/schema/resources.js';
import { embeddings as embeddingsTable } from '../db/schema/embeddings.js';
import { 
  groupTranscriptsByEpisode, 
  EpisodeInfo
} from './utils.js';
import { createSemanticChunks } from './semantic-chunker.js';
import { encode } from 'gpt-tokenizer';
import { CHUNK_SIZE, OVERLAP_SIZE } from './config.js';

// Convert callback-based functions to Promise-based
const exec = promisify(execCallback);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// Constants
const AUDIO_FILES_DIR = join(process.cwd(), 'data', 'audio_files');
const CHUNKS_DIR = join(process.cwd(), 'data', 'audio_chunks');
const TRANSCRIPTS_DIR = join(process.cwd(), 'data', 'transcripts');
const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_DURATION_SECONDS = 1450; // Maximum duration in seconds (staying under the 1500s limit)

/**
 * Get the embedding model
 */
function getEmbeddingModel() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  
  return openai.embedding('text-embedding-3-small');
}

/**
 * Check if required tools (ffmpeg, ffprobe) are installed
 */
export async function checkDependencies(): Promise<boolean> {
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

/**
 * Ensure required directories exist
 */
export async function ensureDirectories(): Promise<void> {
  try {
    await mkdir(CHUNKS_DIR, { recursive: true });
    await mkdir(TRANSCRIPTS_DIR, { recursive: true });
    console.log('Directories verified/created.');
  } catch (error) {
    console.error('Error creating directories:', error);
    throw error;
  }
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size;
}

/**
 * Get audio duration in seconds using ffprobe
 */
export async function getAudioDuration(filePath: string): Promise<number> {
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

/**
 * Split audio file into chunks under MAX_SIZE_MB and MAX_DURATION_SECONDS
 */
export async function splitAudioFile(filePath: string): Promise<string[]> {
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

/**
 * Save transcript to file
 */
export async function saveTranscript(audioFilePath: string, transcript: string): Promise<string> {
  const fileName = basename(audioFilePath, extname(audioFilePath));
  const transcriptPath = join(TRANSCRIPTS_DIR, `${fileName}_transcript.json`);
  
  await writeFile(transcriptPath, transcript, 'utf-8');
  console.log(`Transcript saved to ${transcriptPath}`);
  
  return transcriptPath;
}

/**
 * Save combined transcript to file
 * @param episodeId The episode ID
 * @param episodeInfo Episode information
 * @param combinedTranscript The combined transcript text
 * @returns Path to the saved transcript file
 */
export async function saveCombinedTranscript(
  episodeId: string,
  episodeInfo: EpisodeInfo,
  combinedTranscript: string
): Promise<string> {
  // Create filename without chunk number
  const fileName = `${episodeId}_transcript.json`;
  const transcriptPath = join(TRANSCRIPTS_DIR, fileName);
  
  // Build a structured transcript
  const structuredTranscript = {
    episodeNumber: episodeInfo.episodeNumber,
    title: episodeInfo.title,
    transcript: combinedTranscript
  };
  
  await writeFile(transcriptPath, JSON.stringify(structuredTranscript, null, 2), 'utf-8');
  console.log(`Combined transcript saved to ${transcriptPath}`);
  
  return transcriptPath;
}

/**
 * Process a single audio file: split, transcribe, and save only the combined transcript
 */
export async function processAudioFile(audioFilePath: string): Promise<string[]> {
  console.log(`\nProcessing file: ${basename(audioFilePath)}`);
  
  // Extract episode info from filename
  const fileName = basename(audioFilePath);
  const fileNameWithoutExt = basename(fileName, extname(fileName));
  const match = fileNameWithoutExt.match(/e(\d+)_(.+)/);
  
  let episodeInfo: EpisodeInfo;
  let episodeId: string;
  
  if (match) {
    const episodeNumber = match[1];
    const name = match[2].replace(/_/g, ' ');
    const title = `${name.charAt(0).toUpperCase() + name.slice(1)}`;
    
    episodeInfo = {
      title,
      episodeNumber
    };
    
    episodeId = `e${episodeNumber}`;
  } else {
    // Default if pattern doesn't match
    episodeInfo = {
      title: fileNameWithoutExt,
      episodeNumber: 'unknown'
    };
    episodeId = fileNameWithoutExt;
  }
  
  // Step 1: Split into chunks if needed
  const chunks = await splitAudioFile(audioFilePath);
  console.log(`Split into ${chunks.length} chunk(s)`);
  
  // We'll store the transcripts directly in memory
  let allTranscriptText = '';
  
  // Step 2: Transcribe each chunk and build complete transcript
  for (const chunkPath of chunks) {
    // Log progress
    console.log(`Transcribing ${basename(chunkPath)}...`);
    
    // Transcribe the audio chunk
    const transcript = await transcribeAudio(chunkPath, {
      temperature: 0.2,
      responseFormat: 'json'
    });
    
    console.log(`Transcription completed for ${basename(chunkPath)}`);
    
    // Extract text from transcript JSON
    try {
      const parsedTranscript = JSON.parse(transcript);
      let transcriptText: string;
      
      if (typeof parsedTranscript === 'string') {
        transcriptText = parsedTranscript;
      } else if (parsedTranscript.transcript) {
        transcriptText = parsedTranscript.transcript;
      } else if (parsedTranscript.text) {
        transcriptText = parsedTranscript.text;
      } else {
        console.warn(`Couldn't extract text from transcript for ${chunkPath}`);
        continue;
      }
      
      // Append to combined transcript
      allTranscriptText += (allTranscriptText ? ' ' : '') + transcriptText;
    } catch (error) {
      console.error(`Error parsing transcript for ${chunkPath}:`, error);
    }
  }
  
  // Step 3: Save combined transcript only
  let savedPaths: string[] = [];
  
  if (allTranscriptText) {
    const combinedPath = await saveCombinedTranscript(episodeId, episodeInfo, allTranscriptText);
    savedPaths.push(combinedPath);
    console.log(`Created combined transcript at ${combinedPath}`);
  } else {
    console.error(`Failed to generate any valid transcript content for ${basename(audioFilePath)}`);
  }
  
  console.log(`Completed processing ${basename(audioFilePath)}`);
  return savedPaths;
}

/**
 * Load transcript files from the transcripts directory
 * @param prioritizeCombined Whether to prioritize combined transcript files over individual chunks
 */
export async function loadTranscriptFiles(prioritizeCombined: boolean = true): Promise<Array<{ text: string, fileName: string }>> {
  try {
    const files = await readdir(TRANSCRIPTS_DIR);
    const transcriptFiles: Array<{ text: string, fileName: string }> = [];
    
    // First, identify all transcript files
    const allTranscriptFiles = files.filter(file => file.endsWith('_transcript.json'));
    
    if (prioritizeCombined) {
      // Identify episode-level transcripts (without 'chunk' in the name)
      const combinedTranscripts = allTranscriptFiles.filter(file => !file.includes('_chunk'));
      
      // If we have combined transcripts, use those
      if (combinedTranscripts.length > 0) {
        console.log(`Found ${combinedTranscripts.length} combined transcript file(s).`);
        
        for (const file of combinedTranscripts) {
          const filePath = join(TRANSCRIPTS_DIR, file);
          try {
            const fileContent = await readFile(filePath, 'utf-8');
            transcriptFiles.push({
              text: fileContent,
              fileName: file
            });
          } catch (err) {
            console.error(`Error reading file ${file}:`, err);
          }
        }
        
        return transcriptFiles;
      }
    }
    
    // Otherwise, use all transcript files
    console.log(`Using ${allTranscriptFiles.length} transcript files.`);
    
    for (const file of allTranscriptFiles) {
      const filePath = join(TRANSCRIPTS_DIR, file);
      try {
        const fileContent = await readFile(filePath, 'utf-8');
        transcriptFiles.push({
          text: fileContent,
          fileName: file
        });
      } catch (err) {
        console.error(`Error reading file ${file}:`, err);
      }
    }
    
    return transcriptFiles;
  } catch (err) {
    console.error('Error reading transcripts directory:', err);
    return [];
  }
}

/**
 * Generate and store embeddings for transcript content
 * This function will process any existing transcripts in the transcripts directory
 */
export async function generateEmbeddingsForTranscripts(): Promise<void> {
  // Load transcript files, prioritizing combined transcripts
  const transcriptFiles = await loadTranscriptFiles(true);
  
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
    
    // Parse the episode content
    let episodeContent = episode.content;
    let episodeNumber = episode.episodeInfo.episodeNumber;
    let episodeTitle = episode.episodeInfo.title;
    
    // If content is JSON, try to extract the transcript property
    try {
      const jsonContent = JSON.parse(episodeContent);
      
      // If this is a structured combined transcript, use its data
      if (jsonContent.transcript) {
        episodeContent = jsonContent.transcript;
        console.log(`Extracted transcript from JSON structure.`);
        
        // Update episode info if available in the JSON
        if (jsonContent.episodeNumber) {
          episodeNumber = jsonContent.episodeNumber;
        }
        
        if (jsonContent.title) {
          episodeTitle = jsonContent.title;
        }
      }
    } catch (e) {
      // Not JSON or no transcript property, use as is
      console.log(`Using transcript content as-is (not JSON or no transcript property).`);
    }
    
    // Create resource for the episode
    const resourceDescription = `Episode ${episodeNumber}: ${episodeTitle} from The Running Public podcast`;
    
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
    
    // Create semantic chunks from the episode content using LangChain
    const chunks = await createSemanticChunks(episodeContent, CHUNK_SIZE, OVERLAP_SIZE);
    console.log(`Created ${chunks.length} semantic chunks for episode ${episodeId}`);
    
    try {
      console.log(`Generating embeddings for ${chunks.length} chunks...`);
      
      // Generate embeddings for all chunks at once
      const { embeddings: chunkEmbeddings } = await embedMany({
        model: getEmbeddingModel(),
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
          await db.insert(embeddingsTable).values({
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

/**
 * Check if transcripts exist for a given audio file
 * @param audioFileName The name of the audio file to check
 * @returns true if all transcript chunks exist, false otherwise
 */
export async function transcriptsExist(audioFileName: string): Promise<boolean> {
  try {
    const files = await readdir(TRANSCRIPTS_DIR);
    const fileNameWithoutExt = basename(audioFileName, extname(audioFileName));
    
    // Check if there's at least one transcript file for this audio file
    // This works for both chunked and non-chunked files
    const matchingFiles = files.filter(file => 
      file.startsWith(fileNameWithoutExt) && 
      file.endsWith('_transcript.json')
    );
    
    return matchingFiles.length > 0;
  } catch (error) {
    console.error(`Error checking for existing transcripts: ${error}`);
    return false;
  }
}

/**
 * Process all audio files in the audio files directory
 * @param skipTranscriptionIfExists If true, skip transcription for files that already have transcripts
 */
export async function processAllAudioFiles(skipTranscriptionIfExists: boolean = false): Promise<void> {
  try {
    // Check dependencies first
    const dependenciesAvailable = await checkDependencies();
    if (!dependenciesAvailable) {
      throw new Error('Missing required dependencies');
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
      // Check if we should skip transcription
      if (skipTranscriptionIfExists && await transcriptsExist(audioFile)) {
        console.log(`Skipping transcription for ${audioFile} as transcripts already exist.`);
        continue;
      }
      
      const audioFilePath = join(AUDIO_FILES_DIR, audioFile);
      await processAudioFile(audioFilePath);
    }
    
    console.log('\nAll audio files processed successfully.');
  } catch (error) {
    console.error('Error processing audio files:', error);
    throw error;
  }
} 