/**
 * Prompts related to podcast episode summarization
 */

/**
 * Prompt for generating episode summaries and extracting guest information
 */
export const PODCAST_SUMMARY_PROMPT = `
You are a helpful assistant that creates podcast summaries and identifies guests.

I need a summary and guest list for this podcast episode titled "{{EPISODE_TITLE}}".

Please provide:
1. A concise 1-2 paragraph summary of the key topics discussed.
2. A list of all guests who appear in the episode (not including the hosts Kirk DeWindt and Brakken Kraker).

Format your response as JSON with two fields:
- "summary": String containing the 1-2 paragraph summary
- "guests": Array of strings containing guest names

Here's the transcript:
{{TRANSCRIPT}}
`;

/**
 * Creates a formatted prompt with episode title and transcript
 * @param episodeTitle The title of the episode
 * @param transcript The transcript text
 * @param maxTranscriptLength Maximum length of transcript to include
 * @returns Formatted prompt
 */
export function createSummaryPrompt(
  episodeTitle: string,
  transcript: string,
  maxTranscriptLength: number = 15000
): string {
  return PODCAST_SUMMARY_PROMPT
    .replace('{{EPISODE_TITLE}}', episodeTitle)
    .replace('{{TRANSCRIPT}}', transcript.substring(0, maxTranscriptLength));
} 