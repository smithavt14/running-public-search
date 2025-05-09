import { OpenAI } from 'openai';
import { createReadStream } from 'fs';
import { basename } from 'path';

// Types
export interface AudioTranscriptionOptions {
  temperature?: number;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
}

/**
 * Get an initialized OpenAI client
 */
function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Transcribe audio file using OpenAI API
 * @param audioFilePath Path to the audio file
 * @param options Transcription options
 * @returns Transcription result as a string
 */
export async function transcribeAudio(
  audioFilePath: string, 
  options: AudioTranscriptionOptions = {}
): Promise<string> {
  try {
    console.log(`Transcribing ${basename(audioFilePath)}...`);
    
    // Create a read stream of the audio file
    const audioFile = createReadStream(audioFilePath);
    
    // Default options
    const defaultOptions = {
      temperature: 0.2,
      responseFormat: 'json'
    };
    
    // Merge options
    const mergedOptions = { ...defaultOptions, ...options };
    
    // Initialize OpenAI client
    const openai = getOpenAIClient();
    
    // Call OpenAI API for transcription
    try {
      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "gpt-4o-mini-transcribe", // This will use the GPT4o Mini Transcribe model
        response_format: mergedOptions.responseFormat as any,
        temperature: mergedOptions.temperature,
      });
      
      console.log(`Transcription completed for ${basename(audioFilePath)}`);
      return JSON.stringify(response, null, 2);
    } catch (apiError: any) {
      // If the model isn't available or there's an issue with the new model, fall back to whisper
      console.warn(`Error with gpt-4o-mini-transcribe: ${apiError.message || String(apiError)}`);
      console.warn('Falling back to whisper-1 model...');
      
      // Reset the stream since it might have been consumed
      const fallbackAudioFile = createReadStream(audioFilePath);
      
      const fallbackResponse = await openai.audio.transcriptions.create({
        file: fallbackAudioFile,
        model: "whisper-1", // Fallback to the whisper model
        response_format: mergedOptions.responseFormat as any,
        temperature: mergedOptions.temperature,
      });
      
      console.log(`Fallback transcription completed for ${basename(audioFilePath)}`);
      return JSON.stringify(fallbackResponse, null, 2);
    }
  } catch (error) {
    console.error(`Error transcribing ${basename(audioFilePath)}:`, error);
    throw error;
  }
} 