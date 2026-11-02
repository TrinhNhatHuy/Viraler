-- Phase 2: optimistic concurrency for project saves + size cap on the document.
--
-- `revision` increases only when `data` changes, so a title-only rename doesn't
-- conflict with an editor that's open in another tab. Clients can't set it.

alter table public.projects
  add column revision bigint not null default 1,
  add constraint projects_data_size check (octet_length(data::text) <= 1048576);

create function public.bump_project_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.data is distinct from old.data then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end;
$$;

create trigger projects_bump_revision
  before update on public.projects
  for each row execute function public.bump_project_revision();

-- Clients can't choose the starting revision either.
create function public.init_project_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := 1;
  return new;
end;
$$;

create trigger projects_init_revision
  before insert on public.projects
  for each row execute function public.init_project_revision();
