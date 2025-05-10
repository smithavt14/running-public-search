import { config } from "dotenv";
import path from "path";
import {
  checkDependencies,
  ensureDirectories,
  createResources,
  createTranscripts,
  generateEmbeddingsForEpisodes,
} from "../src/lib/ai/processors";
import { downloadPodcastEpisodes, fetchPodcastFeed } from "../src/lib/ai/podcast-feed";

// Load environment variables from .env.local
config({ path: path.join(__dirname, "..", ".env.local") });

// Check for required environment variables
const requiredEnvVars = ["DATABASE_URL", "OPENAI_API_KEY"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
  console.error(
    "\nPlease add these to your .env.local file. See .env.example for reference."
  );
  process.exit(1);
}

async function processPodcast() {
  try {
    console.log("=== Running Public Podcast Processing Pipeline ===");

    // Step 1: Check Dependencies
    console.log("\nStep 1: Checking dependencies...");
    const dependenciesAvailable = await checkDependencies();
    if (!dependenciesAvailable) {
      throw new Error("Required dependencies (ffmpeg, ffprobe) are missing");
    }

    // Step 2: Ensure necessary directories exist
    console.log("\nStep 2: Ensuring necessary directories exist...");
    await ensureDirectories();

    // Step 3: Extract Podcast Episodes from XML Feed
    console.log("\nStep 3: Extracting podcast information from XML feed...");
    let episodes = await fetchPodcastFeed();
    
    // Step 4: Download Podcast Episodes
    console.log("\nStep 4: Downloading podcast episodes...");
    episodes = await downloadPodcastEpisodes(episodes);

    // Step 5: Create resource for each downloaded episode
    console.log("\nStep 5: Creating a resource for each episode...");
    await createResources(episodes);

    // Step 6: Create transcripts for each downloaded episode
    console.log("\nStep 6: Creating a transcript for each episode...");
    episodes = await createTranscripts(episodes);

    // Step 7: Generate embeddings for each episode
    console.log("\nStep 7: Generating embeddings for each episode...");
    await generateEmbeddingsForEpisodes(episodes);

    console.log("\n✅ Podcast processing completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error in podcast processing pipeline:", error);
    process.exit(1);
  }
}

// Run the main function
processPodcast().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
