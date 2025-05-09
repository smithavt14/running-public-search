# Running Public AI

An AI-powered chatbot for The Running Public podcast that allows users to search and chat about running content.

## Project Structure

The project has been restructured to more closely follow the Vercel AI SDK RAG (Retrieval Augmented Generation) pattern:

- `/src/lib/db` - Database configuration and schema
- `/src/lib/ai` - AI-related functionality (embedding generation)
- `/src/lib/actions` - Server actions for resource management
- `/src/app` - Next.js App Router structure
  - `page.tsx` - Main chat interface with resource creation
  - `/api/chat` - API route for AI chat

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in the required environment variables:

```
DATABASE_URL="your-supabase-postgres-connection-string"
OPENAI_API_KEY="your-openai-api-key"
NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

3. Install dependencies:

```bash
pnpm install
```

4. Set up the database (creates tables and extensions):

```bash
pnpm db:setup
```

5. Run the development server:

```bash
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- **Resource Creation**: Add knowledge to the database through the UI
- **Embeddings Generation**: Automatically generates embeddings for added content
- **AI Chat**: Chat interface that retrieves relevant context from the database

## Development Workflow

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm db:generate` - Generate migration files based on schema changes
- `pnpm db:migrate` - Apply migrations to the database
- `pnpm process-youtube-transcripts` - Process YouTube transcripts
- `pnpm process-audio-transcripts` - Process audio transcripts
- `pnpm process-embeddings` - Generate and store embeddings for existing content

---

## Overview

This project is designed to create a searchable, AI-powered chatbot that leverages the entire archive of **The Running Public** podcast. The goal is to help runners, coaches, and enthusiasts query the vast training knowledge shared by the podcast hosts using natural language.

The chatbot will use a combination of semantic search (via vector embeddings) and keyword search to retrieve relevant segments from podcast episodes. It is optimized for personalized use — allowing users to ask training-related questions and get context-rich answers directly drawn from past podcast content.

## Why This Project Exists

The Running Public podcast contains hundreds of hours of expert interviews, coaching tips, workout ideas, and training philosophy. However, this content is difficult to navigate without listening to full episodes or scrolling through show notes.

This project solves that by:
- Transcribing all podcast episodes.
- Creating a vector-based semantic index of the content.
- Combining that with keyword-based search.
- Offering a clean chat interface to ask training questions and receive answers grounded in the podcast material.

## Features

- ✅ Automatic transcription of all episodes (using existing transcripts if available).
- ✅ Semantic and keyword-based search over all podcast content.
- ✅ Vector embeddings stored with PostgreSQL and PGVector via Supabase.
- ✅ Chatbot powered by GPT-4o or similar models.
- ✅ Frontend chat UI built with Next.js.
- ✅ Deployed with Vercel.

---

## Tech Stack

| Area                  | Technology                      |
|-----------------------|----------------------------------|
| Transcription         | OpenAI Whisper API (or best available) |
| Embedding Model       | OpenAI `text-embedding-3-small` or `text-embedding-3-large` |
| Vector DB             | Supabase + PGVector              |
| Search                | Combined semantic + keyword search |
| LLM Backend           | OpenAI GPT-4o / GPT-4o-mini       |
| Frontend              | Next.js + shadcn/ui (chat UI)    |
| Deployment            | Vercel                           |

---

## Setup & Implementation Plan

### 1. Podcast Data Collection
- Crawl or download all available episodes from [The Running Public](https://therunningpublic.podbean.com/).
- Check for existing transcripts in the episode metadata or external sources.

### 2. Transcription Pipeline
- For episodes without transcripts, generate them using the latest **OpenAI Whisper** model or another top-tier transcription service.
- Store transcripts in a structured format (`.json`, `.txt`, or database records).

### 3. Transcript Preprocessing
- Clean transcripts: remove filler words, correct speaker labels if needed.
- Chunk transcripts into coherent segments (e.g. 300–500 tokens per chunk) with overlap to maintain context.

### 4. Embedding & Vector Storage
- Generate embeddings for each chunk using OpenAI's `text-embedding-3-small` (or similar).
- Store embeddings and metadata (episode, timestamp, chunk text) in **Supabase** using **PGVector**.

### 5. Chat Application
- Build a frontend in **Next.js** using `next.ai` or a custom implementation.
- Allow user input → embed user query → run vector similarity search against Supabase.
- Also perform a parallel keyword search (e.g. Postgres `tsvector`).
- Merge and rerank results, then pass to GPT-4o or 4o-mini for summarization and natural response.

### 6. Hosting & Deployment
- Deploy the frontend and backend (if needed) on **Vercel**.
- Secure API keys and rate limits for OpenAI and Supabase access.

---

## Development Setup

This project uses [Next.js](https://nextjs.org) for the frontend. To get started with development:

1. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

2. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

3. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a custom font family for Vercel.

---

## Future Improvements

- Add source citations and timestamps in responses.
- Enable audio playback starting at the relevant timestamp.
- Save favorite questions/answers for training logs.
- Fine-tune prompt engineering for user-specific fitness advice.

---

## Example Use Cases

- "What do the Running Public guys say about base training in the off-season?"
- "Give me workouts to improve aerobic capacity from Brakken's episodes."
- "Has anyone discussed hamstring injuries and recovery?"
- "Summarize their views on polarized vs threshold training."

---

## License

This is a personal project and not affiliated with The Running Public. Please use for educational and non-commercial purposes only.

---

## Author

Built by Alex Smith. See more projects at [alex.cn.com](https://alex.cn.com).
