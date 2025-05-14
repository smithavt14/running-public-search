import { join } from "path";

// Chunking parameters
export const CHUNK_SIZE = 300;
export const OVERLAP_SIZE = 50;

// Embedding model configuration
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

// AI model configuration
export const SUMMARY_MODEL = "gpt-4o-mini";
export const MAX_SUMMARY_TOKENS = 15000;

// Podcast processing configuration
export const MAX_EPISODES = 50; // Limiting to 10 episodes for quick testing
export const EPISODES_OFFSET = 10; // Default offset for podcast episodes
export const PODCAST_FEED_URL =
  "https://feed.podbean.com/therunningpublic/feed.xml";
export const MAX_TRANSCRIPTION_WORKERS = 10; // Maximum parallel workers for audio transcription

// Audio File Constants
export const AUDIO_FILES_DIR = join(process.cwd(), "data", "audio_files");
export const CHUNKS_DIR = join(process.cwd(), "data", "audio_chunks");
export const TRANSCRIPTS_DIR = join(process.cwd(), "data", "transcripts");
export const MAX_SIZE_MB = 5;
export const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
export const MAX_DURATION_SECONDS = 600; // Maximum duration in seconds (staying under the 1500s limit)

export const INITIAL_QUERIES = [
  "What are Kirk and Brakken's thoughts on marathon training for beginners?",
  "Tell me about the best workouts for improving 5K speed",
  "How do the hosts approach recovery after hard training?",
  "What nutrition advice do they share for race day?",
  "What have they said about preventing common running injuries?",
  "Tell me about their favorite episodes on mental training",
  "What gear recommendations have been mentioned for trail running?",
  "How do they structure base building phases?",
  "What's their approach to interval training?",
  "Who are some notable guests they've had on obstacle course racing?",
  "What have they discussed about balancing running with strength training?",
  "How do they approach training for hilly races?",
  "What are their thoughts on running form and technique?",
  "Tell me about their personal training philosophies",
  "What have they said about fueling for long runs?",
];
