# Viraler

Web app for making vertical short-form videos (1080×1920): script → AI voiceover → captions → visuals → MP4.
See `CLAUDE.md` for architecture and conventions.

## Local development

Requirements: Node 26, pnpm 12, Docker, [uv](https://docs.astral.sh/uv/).

```bash
pnpm install
pnpm supabase start                 # local Supabase (Docker)
cp .env.example .env                # then fill in values from:
pnpm supabase status -o env         #   API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL
pnpm dev                            # http://localhost:3000

cd services/worker && uv sync && uv run python -m app.main   # worker (separate terminal)
```

The worker needs the Kokoro TTS model files (~350 MB). It downloads and verifies them on first
start; to do it ahead of time, run `cd services/worker && uv run python -m app.model_files`.
In Docker they're kept in the `worker-models` volume.

Local URLs:

- App: http://localhost:3000
- Supabase Studio: http://127.0.0.1:54323
- Mailpit (catches all auth emails, e.g. password reset): http://127.0.0.1:54324

Local sign-up doesn't require email confirmation. After changing `supabase/config.toml` or
`supabase/templates/*`, restart Supabase (`pnpm supabase stop && pnpm supabase start`).

## Production notes

- **Auth email templates:** copy `supabase/templates/confirmation.html` ("Confirm signup") and
  `supabase/templates/recovery.html` ("Reset password") into the Supabase dashboard
  (Authentication → Email Templates). They link to `/auth/confirm?token_hash=…`, which works
  even when the link is opened on another device.
- Set the dashboard **Site URL** to the app's public URL; the templates use `{{ .SiteURL }}`.
