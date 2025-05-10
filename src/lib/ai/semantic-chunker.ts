import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { encode } from 'gpt-tokenizer';
import { CHUNK_SIZE, OVERLAP_SIZE } from './config';

/**
 * Create semantic chunks from a complete transcript
 * @param text Full transcript text
 * @param chunkSize Size of each chunk in tokens
 * @param overlapSize Size of overlap between chunks in tokens
 * @returns Array of text chunks with semantic boundaries
 */
export async function createSemanticChunks(
  text: string, 
  chunkSize: number = CHUNK_SIZE, 
  overlapSize: number = OVERLAP_SIZE
): Promise<string[]> {
  // Create a text splitter that better respects semantic boundaries
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: chunkSize,
    chunkOverlap: overlapSize,
    // Prioritize splitting on these separators in order
    separators: ["\n\n", "\n", ".", "!", "?"],
    // Use the same tokenizer as the rest of the application
    lengthFunction: (text) => encode(text).length,
  });
  
  // Create chunks based on semantic boundaries
  const chunks = await textSplitter.splitText(text);
  
  // Clean up artifacts in chunks (e.g., chunks starting with ". " or lone punctuation)
  const cleanedChunks = chunks.map(chunk => {
    // Trim whitespace
    let cleaned = chunk.trim();
    
    // Remove leading punctuation with spaces (common artifacts from splitting)
    cleaned = cleaned.replace(/^([.!?,;:]\s+)+/, '');
    
    // Remove lone punctuation at start (without spaces)
    cleaned = cleaned.replace(/^([.!?,;:])+/, '');
    
    return cleaned;
  });
  
  return cleanedChunks;
} 