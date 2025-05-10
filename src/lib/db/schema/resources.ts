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
  guid: varchar('guid', { length: 191 }).unique(),
  title: text('title'),
  link: text('link'),
  pubDate: timestamp('pub_date'),
  description: text('description'),
  enclosureUrl: text('enclosure_url'),
  author: text('author'),
  duration: text('duration'),
  episodeNumber: varchar('episode_number', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Resource = typeof resources.$inferSelect;
export type NewResourceParams = Pick<
  Resource, 
  'guid' | 'title' | 'link' | 'pubDate' | 'description' | 
  'enclosureUrl' | 'author' | 'duration' | 'episodeNumber'
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