import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as resources from './schema/resources.js';
import * as embeddings from './schema/embeddings.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '..', '..', '.env.local');
dotenv.config({ path: envPath });

// Combine all schema modules
export const schema = {
  ...resources,
  ...embeddings
};

// Get database URL from environment variables
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL not found in environment variables. Please add it to your .env.local file.');
}

// Create a postgres connection with prepare: false for Supabase Transaction pooler mode
const client = postgres(databaseUrl, { 
  prepare: false, // Important for transaction pooler
});

// Create a Drizzle ORM instance
export const db = drizzle(client, { schema }); 