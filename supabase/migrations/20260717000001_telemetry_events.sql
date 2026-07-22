-- Anonymous/opt-out product telemetry. Desktop app inserts directly with the
-- anon key, so this table is insert-only from the client: no select, update,
-- or delete policy is granted to anon/authenticated, which prevents any
-- client from reading back events (their own or anyone else's). Only the
-- service role (dashboards / exports) can read.
create table if not exists public.telemetry_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  anon_id text not null,
  user_id uuid,
  event text not null,
  properties jsonb not null default '{}'::jsonb,
  app_version text,
  platform text,
  constraint telemetry_events_event_length check (char_length(event) <= 100)
);

alter table public.telemetry_events enable row level security;

create index if not exists telemetry_events_created_at_idx on public.telemetry_events (created_at);
create index if not exists telemetry_events_event_idx on public.telemetry_events (event);

create policy "anyone can insert telemetry events"
  on public.telemetry_events
  for insert
  to anon, authenticated
  with check (true);
