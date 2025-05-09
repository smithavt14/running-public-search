'use server';

import {
  NewResourceParams,
  insertResourceSchema,
  resources,
} from '../db/schema/resources.js';
import { db } from '../db/index.js';
import { generateEmbeddings } from '../ai/embedding.js';
import { embeddings as embeddingsTable } from '../db/schema/embeddings.js';

export const createResource = async (input: NewResourceParams) => {
  try {
    const { content } = insertResourceSchema.parse(input);

    // Insert the resource
    const [resource] = await db
      .insert(resources)
      .values({ content })
      .returning();

    // Generate embeddings for the content
    const embeddings = await generateEmbeddings(content);
    
    // Insert embeddings with reference to the resource
    await db.insert(embeddingsTable).values(
      embeddings.map(embedding => ({
        resourceId: resource.id,
        ...embedding,
      })),
    );

    return { success: true, message: 'Resource successfully created and embedded.' };
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error && error.message.length > 0
        ? error.message
        : 'Error, please try again.'
    };
  }
};

export const getResources = async () => {
  try {
    const allResources = await db.select().from(resources);
    return { success: true, data: allResources };
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error && error.message.length > 0
        ? error.message
        : 'Error fetching resources.'
    };
  }
}; 