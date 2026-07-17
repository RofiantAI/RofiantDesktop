-- Per-user rate limiting for the groq-proxy / groq-transcribe-proxy edge
-- functions. Without this, one authenticated user can hammer the Groq API
-- key held server-side and run up unbounded cost, or starve other users.
--
-- This table is only ever touched by edge functions using the service-role
-- key, so RLS stays fully locked down for normal (anon/authenticated) roles.
create table if not exists public.rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, window_start)
);

alter table public.rate_limits enable row level security;
-- No policies are added on purpose: only the service role (which bypasses
-- RLS) should ever read or write this table.

-- Cheap cleanup so the table doesn't grow forever; call periodically (e.g.
-- via pg_cron) or let it accumulate — rows are tiny and keyed per minute.
create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

-- Atomically increments the request counter for the current minute window
-- and returns whether the caller is still under the given limits. Runs as
-- SECURITY DEFINER so the service-role edge function can call it without
-- separately granting table access.
create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_per_minute_limit integer,
  p_per_day_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute timestamptz := date_trunc('minute', now());
  v_day timestamptz := date_trunc('day', now());
  v_minute_count integer;
  v_day_count integer;
begin
  insert into public.rate_limits (user_id, window_start, request_count)
  values (p_user_id, v_minute, 1)
  on conflict (user_id, window_start)
  do update set request_count = rate_limits.request_count + 1
  returning request_count into v_minute_count;

  if v_minute_count > p_per_minute_limit then
    return false;
  end if;

  select coalesce(sum(request_count), 0) into v_day_count
  from public.rate_limits
  where user_id = p_user_id and window_start >= v_day;

  return v_day_count <= p_per_day_limit;
end;
$$;

revoke all on function public.check_rate_limit(uuid, integer, integer) from public;
grant execute on function public.check_rate_limit(uuid, integer, integer) to service_role;
