# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Viraler**: a web app for making vertical short-form videos (TikTok / YouTube Shorts / Reels), 1080×1920.

Core loop: **script → AI voiceover → timed captions → visuals per scene → ranking/title overlays → MP4 export.**

Features:
- Script editor (max 5000 chars, word count + estimated spoken duration)
- Voiceover: AI TTS (Kokoro, multiple voices), record in browser, or upload a file
- Captions: word-level timing from the voiceover (faster-whisper), styled and burned in
- Media library: uploads, stock footage (Pexels), AI images (FLUX schnell — later phase)
- Timeline: clips on a track, split, delete, reorder, "fit to voiceover", per-clip mute
- Ranking mode: Top-N countdown labels on clips + persistent title
- Hook title: optional text over the first seconds
- Canvas: fill (crop to 9:16) or fit (letterbox) + background color
- Export: MP4 rendered **in the browser** (no server render cost)
- Auth + saved projects

Goal: **$0 running cost.** Only free tiers and open-source models. Do not add paid APIs.

## Tech stack (decided — do not swap without asking)

| Layer | Choice |
|---|---|
| Web app (UI + API) | Next.js (App Router) + TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| Editor state | Zustand |
| Timeline & preview | HTML Canvas (custom) |
| Video export | WebCodecs + mp4-muxer (ffmpeg.wasm only as fallback) |
| Validation | Zod (TS), Pydantic (Python) |
| DB / Auth / Storage | Supabase (Postgres, Auth, Storage); Supabase CLI for local dev |
| AI worker | Python 3.11 + FastAPI, managed with `uv` |
| TTS | Kokoro |
| Captions | faster-whisper (`word_timestamps=True`) |
| Stock media | Pexels API |
| Job queue | Postgres `jobs` table, claimed with `FOR UPDATE SKIP LOCKED` |
| Automation (later) | n8n calling the web app API |
| Deploy | Docker Compose |
| Package manager | pnpm (JS), uv (Python) |

## Architecture

Modular monolith + one Python worker. **Not microservices.**

- `apps/web` handles everything light: UI, auth, project CRUD, creating jobs, serving job status.
- `services/worker` handles everything heavy: TTS, transcription, image generation, stock search, (later) server-side render.
- They communicate **only through Postgres** (the `jobs` table) and Supabase Storage. The web app never calls the worker directly.

Job flow:
1. Web app inserts a row in `jobs` with `status='queued'` and returns immediately.
2. Worker polls, claims one job with `SELECT ... FOR UPDATE SKIP LOCKED`, sets `status='running'`.
3. Worker does the work, uploads output files to Storage, writes `output` JSON, sets `status='done'` (or `failed` + `error`).
4. Browser polls job status (or uses Supabase Realtime) and updates the editor.

`jobs` table: `id uuid`, `user_id`, `project_id`, `type` (`tts` | `transcribe` | `stock_search` | `image` | `render`), `status` (`queued` | `running` | `done` | `failed`), `input jsonb`, `output jsonb`, `error text`, `attempts int`, `created_at`, `updated_at`.

### Project file = single source of truth

A video is a **JSON project document** stored in Postgres (`projects.data jsonb`). The browser renders it for preview/export; later the worker renders the same JSON with ffmpeg for n8n automation. Never put render-relevant state anywhere except this document.

Shape (defined with Zod in `packages/shared`, mirrored as Pydantic models in the worker; keep them in sync):

```ts
Project {
  version: 1
  canvas: { width: 1080, height: 1920, fit: 'fill' | 'fit', background: string }
  script: string
  voiceover?: { src: string, durationMs: number, source: 'tts' | 'recorded' | 'uploaded', voice?: string, volume: number }
  captions: { enabled: boolean, words: { text: string, startMs: number, endMs: number }[], style: CaptionStyle }
  hookTitle: { enabled: boolean, text: string, durationMs: number, style: TextStyle }
  ranking: { enabled: boolean, title: string, order: 'descending' | 'ascending' }
  clips: { id: string, mediaId: string, startMs: number, durationMs: number, trimInMs: number, muted: boolean, rank?: number, label?: string }[]
  media: { id: string, kind: 'video' | 'image' | 'audio', src: string, durationMs?: number, origin: 'upload' | 'stock' | 'ai' }[]
}
```

All times are integer milliseconds.

## Repository layout

```
apps/web/            Next.js app
  app/               routes (App Router)
  components/        UI components (editor/, timeline/, ui/ for shadcn)
  lib/               supabase client, render engine, utils
  stores/            Zustand stores
packages/shared/     Zod schemas + shared TS types (Project, Job)
services/worker/     FastAPI + job runner
  app/jobs/          one module per job type (tts.py, transcribe.py, ...)
  app/models.py      Pydantic mirrors of shared schemas
supabase/migrations/ SQL migrations (only way to change the DB)
docker-compose.yml
.env.example
```

## Commands

```bash
pnpm install                         # install JS deps (Node 26, pnpm 12)
pnpm dev                             # run web app (http://localhost:3000)
pnpm lint                            # lint all workspaces (web: eslint, shared: prettier --check)
pnpm typecheck                       # tsc --noEmit, all workspaces
pnpm test                            # Vitest, all workspaces (web + packages/shared)
pnpm format                          # prettier --write (md files ignored)

pnpm supabase start                  # local Supabase (needs Docker); CLI is a root devDependency
pnpm supabase status -o env          # print local URLs/keys for .env
pnpm supabase db reset               # re-apply migrations + seed locally
pnpm supabase migration new <name>   # create migration
pnpm db:types                        # regenerate apps/web/lib/supabase/database.types.ts after a migration

cd services/worker && uv sync        # install Python deps (Python 3.11)
cd services/worker && uv run python -m app.main   # worker: /health on :8000 + job loop
cd services/worker && uv run ruff check . && uv run ruff format --check .
cd services/worker && uv run pytest  # worker tests (DB tests skip if local Supabase isn't running)

docker compose up --build            # web + worker (run `pnpm supabase start` first)
```

## Environment variables

Never commit real values. Keep `.env.example` updated whenever a variable is added.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server/worker only, never in client code
DATABASE_URL=                   # worker's direct Postgres connection
PEXELS_API_KEY=
```

## Coding rules

- TypeScript strict mode. No `any` unless commented why.
- Server-only code (service role key, DB writes for jobs) stays in route handlers / server actions. Never import it into client components.
- Validate every API input with Zod; every job `input` with Pydantic.
- Row Level Security on every user-owned table. Users only see their own projects, media and jobs.
- Each worker job type is idempotent and safe to retry. Max 3 attempts.
- Keep heavy work out of the web app. If something takes more than ~1s of CPU, it is a job.
- Small, focused components. Editor rendering logic lives in `lib/render/`, not inside React components.
- Prefer existing deps. **Ask before adding a new dependency.**
- Write tests for: schema validation, timeline math (split, fit-to-voiceover, caption timing), job claiming.

## How to work with me (Huy)

- Explain the logic/plan briefly **before** writing code.
- Minimal, targeted changes when fixing bugs. Don't refactor unrelated code.
- Concise responses. Copy-paste-ready code.
- One phase at a time. At the end of each task: run lint + typecheck + tests, then summarize what changed and what to test manually.
- Don't mark something done if it hasn't been run.
- If a requirement is unclear or conflicts with this file, ask instead of guessing.

## Build order

Work through these in order. Don't start a phase until the previous one runs end-to-end.

1. **Scaffold**: monorepo (pnpm workspaces), Next.js + Tailwind + shadcn, `packages/shared` with Project schema, FastAPI worker skeleton, Supabase local + first migration (`projects`, `media`, `jobs` + RLS), docker-compose, `.env.example`.
2. **Auth + projects**: Supabase Auth (email), project list, create/open/save project.
3. **Script + voiceover**: script editor, TTS job (Kokoro) end-to-end, record/upload voice, audio playback.
4. **Captions**: transcribe job (faster-whisper word timestamps), caption track in project JSON, caption preview.
5. **Media + timeline**: uploads to Storage, Pexels search, media library, canvas timeline (add, reorder, split, delete, fit to voiceover).
6. **Preview + export**: canvas renderer (clips, captions, hook title, ranking overlays, fill/fit), WebCodecs MP4 export with voiceover audio.
7. **Ranking mode + styling polish.**
8. **Later**: AI images (FLUX schnell), server-side ffmpeg render of project JSON, n8n API endpoint for batch generation.
