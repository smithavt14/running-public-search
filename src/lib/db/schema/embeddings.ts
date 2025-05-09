import { customType, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from './resources.js';
import { resources } from './resources.js';

// Define a custom vector type for pgvector
const pgVector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    // Convert JavaScript array to PostgreSQL vector format
    return JSON.stringify(value);
  },
});

export const embeddings = pgTable(
  'embeddings',
  {
    id: varchar('id', { length: 191 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    resourceId: varchar('resource_id', { length: 191 }).references(
      () => resources.id,
      { onDelete: 'cascade' },
    ),
    content: text('content').notNull(),
    embedding: pgVector('embedding').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    embeddingIndex: index('embedding_idx').using(
      'ivfflat',
      table.embedding.op('vector_cosine_ops'),
    ),
  }),
);

export type Embedding = typeof embeddings.$inferSelect;
export type NewEmbedding = typeof embeddings.$inferInsert; 