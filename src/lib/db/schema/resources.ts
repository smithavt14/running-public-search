import { pgTable, text, timestamp, varchar, customType, index } from 'drizzle-orm/pg-core';

// Helper function to generate nanoid
export const nanoid = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

// Define a custom vector type for pgvector
export const pgVector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    // Convert JavaScript array to PostgreSQL vector format
    return JSON.stringify(value);
  },
});

export const resources = pgTable(
  'resources', 
  {
    id: varchar('id', { length: 191 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    guid: varchar('guid', { length: 191 }).unique(),
    title: text('title'),
    link: text('link'),
    pubDate: timestamp('pub_date'),
    description: text('description'),
    enclosureUrl: text('enclosure_url'),
    author: text('author'),
    duration: text('duration'),
    episodeNumber: varchar('episode_number', { length: 20 }),
    summary: text('summary'),
    guests: text('guests'),
    summaryEmbedding: pgVector('summary_embedding'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    summaryEmbeddingIndex: index('summary_embedding_idx').using(
      'ivfflat',
      table.summaryEmbedding.op('vector_cosine_ops'),
    ),
  }),
);

export type Resource = typeof resources.$inferSelect;
export type NewResourceParams = Pick<
  Resource, 
  'guid' | 'title' | 'link' | 'pubDate' | 'description' | 
  'enclosureUrl' | 'author' | 'duration' | 'episodeNumber' | 'summary' | 'guests'
>;

// Schema for inserting a resource - can be used to validate API requests
export const insertResourceSchema = {
  parse: (input: NewResourceParams) => {
    if (!input.guid || input.guid.trim() === '') {
      throw new Error('GUID is required');
    }
    return input;
  }
}; 