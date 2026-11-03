-- Phase 5: media library de-duplication + instant job wake-up.

-- ---------------------------------------------------------------------------
-- media: a user saves each stock item (e.g. one Pexels video) at most once
-- ---------------------------------------------------------------------------
create unique index media_user_stock_uniq
  on public.media (user_id, (metadata ->> 'provider'), (metadata ->> 'providerId'))
  where origin = 'stock';

-- ---------------------------------------------------------------------------
-- jobs: tell listening workers a job was queued, so they don't wait for the
-- next poll. The payload is the job type (workers only wake for their types).
-- ---------------------------------------------------------------------------
create or replace function public.notify_job_queued()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_notify('jobs_queued', new.type);
  return null;
end;
$$;

create trigger jobs_notify_queued
  after insert on public.jobs
  for each row
  when (new.status = 'queued')
  execute function public.notify_job_queued();
