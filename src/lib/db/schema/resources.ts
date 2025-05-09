import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// Helper function to generate nanoid
export const nanoid = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

export const resources = pgTable('resources', {
  id: varchar('id', { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Resource = typeof resources.$inferSelect;
export type NewResourceParams = Pick<Resource, 'content'>;

// Schema for inserting a resource - can be used to validate API requests
export const insertResourceSchema = {
  parse: (input: NewResourceParams) => {
    if (!input.content || input.content.trim() === '') {
      throw new Error('Content is required');
    }
    return input;
  }
}; 