import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid, pgVector } from './resources';
import { resources } from './resources';

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