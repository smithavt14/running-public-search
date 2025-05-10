import { join, basename, extname } from "path";
import fs from "fs";
import { promisify } from "util";
import { exec as execCallback } from "child_process";
import { transcribeAudio } from "./audio";
import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { db } from "../db/index";
import { resources } from "../db/schema/resources";
import { embeddings as embeddingsTable } from "../db/schema/embeddings";
import { createSemanticChunks } from "./semantic-chunker";
import {
  CHUNK_SIZE,
  CHUNKS_DIR,
  MAX_DURATION_SECONDS,
  MAX_SIZE_BYTES,
  MAX_SIZE_MB,
  OVERLAP_SIZE,
  TRANSCRIPTS_DIR,
} from "./config";
import {
  PodcastEpisode,
} from "./podcast-feed";
import { eq, and } from "drizzle-orm";

// Convert callback-based functions to Promise-based
const exec = promisify(execCallback);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

function getEmbeddingModel() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  return openai.embedding("text-embedding-3-small");
}

export async function checkDependencies(): Promise<boolean> {
  try {
    // Check for ffmpeg
    await exec("ffmpeg -version");
    console.log("✅ ffmpeg is installed");

    // Check for ffprobe
    await exec("ffprobe -version");
    console.log("✅ ffprobe is installed");

    return true;
  } catch (error) {
    console.error("❌ Required dependencies are missing:");
    console.error("Please install ffmpeg and ffprobe to use this script.");
    console.error(
      "Installation instructions: https://ffmpeg.org/download.html"
    );
    return false;
  }
}

export async function ensureDirectories(): Promise<void> {
  try {
    await mkdir(CHUNKS_DIR, { recursive: true });
    await mkdir(TRANSCRIPTS_DIR, { recursive: true });
    console.log("Directories verified/created.");
  } catch (error) {
    console.error("Error creating directories:", error);
    throw error;
  }
}

export async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size;
}

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

export async function splitAudioFile(filePath: string): Promise<string[]> {
  const fileSize = await getFileSize(filePath);
  const duration = await getAudioDuration(filePath);

  // Check if file is already under limits
  if (fileSize <= MAX_SIZE_BYTES && duration <= MAX_DURATION_SECONDS) {
    console.log(
      `File ${basename(
        filePath
      )} is already under ${MAX_SIZE_MB}MB and ${MAX_DURATION_SECONDS}s, no need to split.`
    );

    // Still copy to chunks dir for consistent processing
    const outputPath = join(CHUNKS_DIR, basename(filePath));
    await fs.promises.copyFile(filePath, outputPath);
    return [outputPath];
  }

  console.log(
    `Splitting ${basename(filePath)} (${(fileSize / (1024 * 1024)).toFixed(
      2
    )}MB, ${duration.toFixed(2)}s)...`
  );

  const fileExt = extname(filePath);
  const fileName = basename(filePath, fileExt);

  // Calculate number of chunks needed based on both size and duration constraints
  const numChunksBySize = Math.ceil(fileSize / MAX_SIZE_BYTES);
  const numChunksByDuration = Math.ceil(duration / MAX_DURATION_SECONDS);
  const numChunks = Math.max(numChunksBySize, numChunksByDuration);

  // Duration of each chunk
  const chunkDuration = Math.min(duration / numChunks, MAX_DURATION_SECONDS);

  console.log(
    `File duration: ${duration.toFixed(
      2
    )}s, dividing into ${numChunks} chunks of ~${chunkDuration.toFixed(
      2
    )}s each`
  );

  const chunkPaths: string[] = [];

  // Create each chunk
  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDuration;
    const outputPath = join(CHUNKS_DIR, `${fileName}_chunk${i + 1}${fileExt}`);

    // Use ffmpeg to split the audio
    const ffmpegCmd = `ffmpeg -y -i "${filePath}" -ss ${startTime} -t ${chunkDuration} -reset_timestamps 1 -c copy "${outputPath}"`;

    await exec(ffmpegCmd);

    // Verify the chunk size and duration
    const chunkSize = await getFileSize(outputPath);
    const chunkActualDuration = await getAudioDuration(outputPath);
    console.log(
      `Chunk ${i + 1} size: ${(chunkSize / (1024 * 1024)).toFixed(
        2
      )}MB, duration: ${chunkActualDuration.toFixed(2)}s`
    );

    chunkPaths.push(outputPath);
  }

  return chunkPaths;
}

export async function saveCombinedTranscript(
  episode: PodcastEpisode,
  combinedTranscript: string
): Promise<string> {
  // Create filename without chunk number
  const fileName = `e${episode.episodeNumber}_transcript.json`;
  const transcriptPath = join(TRANSCRIPTS_DIR, fileName);

  // Build a structured transcript
  const structuredTranscript = {
    guid: episode.guid,
    title: episode.title,
    transcript: combinedTranscript,
  };

  await writeFile(
    transcriptPath,
    JSON.stringify(structuredTranscript, null, 2),
    "utf-8"
  );
  console.log(`Combined transcript saved to ${transcriptPath}`);

  return transcriptPath;
}

export async function createTranscripts(
  episodes: PodcastEpisode[]
): Promise<PodcastEpisode[]> {
  for (const episode of episodes) {
    if (!episode.localFilePath) {
      console.warn(
        `No local file path for episode: ${episode.episodeNumber}, skipping.`
      );
      continue;
    }
    
    console.log(`\nProcessing episode: ${episode.episodeNumber}`);

    // Step 1: Split into chunks if needed
    const chunks = await splitAudioFile(episode.localFilePath);
    console.log(`Split into ${chunks.length} chunk(s)`);

    // We'll store the transcripts directly in memory
    let allTranscriptText = "";

    // Step 2: Transcribe each chunk and build complete transcript
    for (const chunkPath of chunks) {
      // Transcribe the audio chunk
      const transcript = await transcribeAudio(chunkPath, {
        temperature: 0.2,
        responseFormat: "json",
      });

      // Extract text from transcript JSON
      try {
        const parsedTranscript = JSON.parse(transcript);
        let transcriptText: string;

        if (typeof parsedTranscript === "string") {
          transcriptText = parsedTranscript;
        } else if (parsedTranscript.transcript) {
          transcriptText = parsedTranscript.transcript;
        } else if (parsedTranscript.text) {
          transcriptText = parsedTranscript.text;
        } else {
          console.warn(
            `Couldn't extract text from transcript for ${chunkPath}`
          );
          continue;
        }

        // Append to combined transcript
        allTranscriptText += (allTranscriptText ? " " : "") + transcriptText;
      } catch (error) {
        console.error(`Error parsing transcript for ${chunkPath}:`, error);
      }
    }

    // Step 3: Save combined transcript only
    if (allTranscriptText) {
      episode.transcriptPath = await saveCombinedTranscript(
        episode,
        allTranscriptText
      );
    } else {
      console.error(
        `Failed to generate any valid transcript content for ${episode.title}`
      );
    }

    console.log(`Completed processing ${episode.title}`);
  }
  return episodes;
}

// This function creates resources for each episode
export async function createResources(
  episodes: PodcastEpisode[]
): Promise<void> {
  if (episodes && episodes.length > 0) {
    for (const episode of episodes) {
      // Check if resource already exists using guid
      const existingResources = await db
        .select()
        .from(resources)
        .where(and(eq(resources.guid, episode.guid)))
        .limit(1);

      if (existingResources.length === 0) {
        // Insert resource with comprehensive metadata
        await db.insert(resources).values({
          guid: episode.guid,
          title: episode.title,
          link: episode.link,
          pubDate: episode.pubDate,
          description: episode.description,
          enclosureUrl: episode.enclosureUrl,
          author: episode.author,
          duration: episode.duration,
          episodeNumber: episode.episodeNumber,
        });

        console.log(`Added resource for: ${episode.title}`);
      } else {
        console.log(`Resource already exists for: ${episode.title}`);
      }
    }
  }
}

/**
 * Generates embeddings for all transcripts
 * @param downloadedEpisodes Optional array of downloaded episodes with metadata
 */
export async function generateEmbeddingsForEpisodes(
  episodes: PodcastEpisode[]
): Promise<void> {
  try {
    const embeddingModel = getEmbeddingModel();

    // Process each episode
    for (const episode of episodes) {
      console.log(`Processing episode: ${episode.episodeNumber}`);

      // Look up existing resource by guid
      const existingResources = await db
        .select()
        .from(resources)
        .where(eq(resources.guid, episode.guid))
        .limit(1);

      let resourceResult;
      if (existingResources.length > 0) {
        resourceResult = existingResources[0];
        console.log(`Using existing resource: ${resourceResult.id} for episode ${episode.episodeNumber}`);
      } else {
        console.error(`No existing resource found for episode ${episode.title}`);
        continue;
      }

      // Create semantic chunks from the episode transcript
      let chunks: string[] = [];
      if (episode.transcriptPath) {
        const transcriptJson = await readFile(episode.transcriptPath, "utf-8");
        const transcriptText = JSON.parse(transcriptJson).transcript;
        
        chunks = await createSemanticChunks(
          transcriptText,
          CHUNK_SIZE,
          OVERLAP_SIZE
        );
      } else {
        console.error(`No transcript found for episode ${episode.episodeNumber}`);
        continue;
      }

      try {
        console.log(`Generating embeddings for ${chunks.length} chunks for episode ${episode.episodeNumber}`);

        // Generate embeddings for all chunks at once
        const { embeddings: chunkEmbeddings } = await embedMany({
          model: embeddingModel,
          values: chunks,
        });

        console.log(
          `Successfully generated ${chunkEmbeddings.length} embeddings for episode ${episode.episodeNumber}`
        );

        // Insert embeddings into database
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          try {

            // Insert embedding into database
            await db.insert(embeddingsTable).values({
              resourceId: resourceResult.id,
              content: chunk,
              embedding: chunkEmbeddings[i],
            });
            console.log(`Successfully stored chunk ${i + 1} for episode ${episode.episodeNumber}`);
            successCount++;
          } catch (err) {
            console.error(`Error storing chunk ${i + 1} for episode ${episode.episodeNumber}:`, err);
            errorCount++;
          }
        }

        console.log(
          `Episode ${episode.episodeNumber} processing complete. Successful: ${successCount}, Errors: ${errorCount}`
        );
      } catch (err) {
        console.error(
          `Error generating embeddings for episode ${episode.episodeNumber}:`,
          err
        );
      }
    }
  } catch (error) {
    console.error("Error generating embeddings:", error);
    throw error;
  }
}

/**
 * Check if transcripts exist for a given audio file
 * @param audioFileName The name of the audio file to check
 * @returns true if all transcript chunks exist, false otherwise
 */
export async function transcriptsExist(
  audioFileName: string
): Promise<boolean> {
  try {
    const files = await readdir(TRANSCRIPTS_DIR);
    const fileNameWithoutExt = basename(audioFileName, extname(audioFileName));

    // Check if there's at least one transcript file for this audio file
    // This works for both chunked and non-chunked files
    const matchingFiles = files.filter(
      (file) =>
        file.startsWith(fileNameWithoutExt) && file.endsWith("_transcript.json")
    );

    return matchingFiles.length > 0;
  } catch (error) {
    console.error(`Error checking for existing transcripts: ${error}`);
    return false;
  }
}
