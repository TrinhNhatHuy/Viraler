-- Phase 1: projects, media, jobs + RLS, media storage bucket.

-- ---------------------------------------------------------------------------
-- Shared: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- projects: one row per video; `data` is the Project JSON document
-- ---------------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Untitled' check (char_length(title) between 1 and 200),
  data        jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- lets jobs reference (project_id, user_id) so a job can't point at someone else's project
  unique (id, user_id)
);

create index projects_user_updated_idx on public.projects (user_id, updated_at desc);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- media: the user's library; projects reference items by id inside data.media
-- ---------------------------------------------------------------------------
create table public.media (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('video', 'image', 'audio')),
  origin        text not null check (origin in ('upload', 'stock', 'ai')),
  storage_path  text,          -- object key in the `media` bucket: {user_id}/...
  external_url  text,          -- e.g. Pexels source URL
  mime_type     text,
  size_bytes    bigint check (size_bytes >= 0),
  duration_ms   integer check (duration_ms >= 0),
  width         integer check (width > 0),
  height        integer check (height > 0),
  metadata      jsonb not null default '{}'::jsonb,  -- e.g. Pexels attribution
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);

create index media_user_created_idx on public.media (user_id, created_at desc);

create trigger media_set_updated_at
  before update on public.media
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- jobs: work queue for the Python worker (claimed with FOR UPDATE SKIP LOCKED)
-- ---------------------------------------------------------------------------
create table public.jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid,
  type        text not null check (type in ('tts', 'transcribe', 'stock_search', 'image', 'render')),
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  input       jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  output      jsonb,
  error       text,
  attempts    integer not null default 0 check (attempts between 0 and 3),
  locked_at   timestamptz,     -- set when claimed; lets a reaper requeue stuck jobs later
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

-- claim path: oldest queued job first
create index jobs_queued_idx on public.jobs (created_at) where status = 'queued';
create index jobs_user_created_idx on public.jobs (user_id, created_at desc);
create index jobs_project_idx on public.jobs (project_id);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.media    enable row level security;
alter table public.jobs     enable row level security;

-- projects: owner has full CRUD
create policy "projects_select_own" on public.projects
  for select to authenticated using (user_id = (select auth.uid()));
create policy "projects_insert_own" on public.projects
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "projects_update_own" on public.projects
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "projects_delete_own" on public.projects
  for delete to authenticated using (user_id = (select auth.uid()));

-- media: owner has full CRUD
create policy "media_select_own" on public.media
  for select to authenticated using (user_id = (select auth.uid()));
create policy "media_insert_own" on public.media
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "media_update_own" on public.media
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "media_delete_own" on public.media
  for delete to authenticated using (user_id = (select auth.uid()));

-- jobs: owner can only READ. Inserts happen in route handlers with the service
-- role (after Zod validation); the worker writes via DATABASE_URL.
create policy "jobs_select_own" on public.jobs
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.jobs from anon, authenticated;

-- Realtime: browser can subscribe to its own job updates (RLS applies)
alter publication supabase_realtime add table public.jobs;

-- ---------------------------------------------------------------------------
-- Storage: private `media` bucket, objects live under {user_id}/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('media', 'media', false, array['video/*', 'image/*', 'audio/*'])
on conflict (id) do nothing;

create policy "media_objects_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media_objects_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media_objects_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media_objects_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
