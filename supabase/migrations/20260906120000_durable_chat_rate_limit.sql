-- Durable rate limiting for the anonymous /api/chat endpoint.
--
-- The existing limiter is an in-process Map. On Cloudflare Workers that is per-isolate: isolates
-- are short-lived and there are many of them concurrently, so the effective cap is
-- (configured limit x number of live isolates) -- i.e. no real cap at all. That mattered little
-- against a metered provider with its own billing ceiling, but the provider chain now puts a
-- FINITE free allowance (10k Workers AI neurons/day) at the top, which a single abusive client
-- could drain for everyone.
--
-- This table is the shared counter. It is deliberately tiny and self-expiring.

create table if not exists public.chat_rate_limits (
  -- "user:<uuid>" or "ip:<hash>" -- never a raw IP, see the server module.
  bucket_key text primary key,
  -- Start of the current fixed window. Rolling the window is a write, so it happens inside the
  -- same atomic function below rather than on a schedule.
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.chat_rate_limits is
  'Shared request counters for the chat endpoint. Rows are ephemeral; prune_chat_rate_limits() clears expired ones.';

-- Expiry lookups only; the primary key already covers point reads.
create index if not exists chat_rate_limits_window_start_idx
  on public.chat_rate_limits (window_start);

alter table public.chat_rate_limits enable row level security;

-- No policies: this table is service-role only. Exposing per-key request counts to anon would
-- leak which users/IPs are active, and nothing client-side needs to read it.
revoke all on public.chat_rate_limits from anon, authenticated;

/**
 * Atomically consume one request from a bucket.
 *
 * Returns the post-increment count and whether the caller is within the limit. The whole
 * read-modify-write happens in one statement so two concurrent Workers isolates cannot both read
 * "count = limit - 1" and both proceed -- the exact race the in-process Map loses.
 */
create or replace function public.consume_chat_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_max_requests integer
)
returns table (allowed boolean, request_count integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  insert into public.chat_rate_limits as crl (bucket_key, window_start, request_count, updated_at)
  values (p_bucket_key, v_now, 1, v_now)
  on conflict (bucket_key) do update
    set
      -- Window expired: start a fresh one. Otherwise keep counting in the current window.
      window_start = case
        when crl.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
        else crl.window_start
      end,
      request_count = case
        when crl.window_start < v_now - make_interval(secs => p_window_seconds) then 1
        else crl.request_count + 1
      end,
      updated_at = v_now
  returning crl.window_start, crl.request_count into v_window_start, v_count;

  return query
  select
    v_count <= p_max_requests,
    v_count,
    greatest(
      0,
      ceil(
        extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now))
      )::integer
    );
end;
$$;

comment on function public.consume_chat_rate_limit is
  'Atomically increments a rate-limit bucket and reports whether the request is allowed.';

revoke all on function public.consume_chat_rate_limit(text, integer, integer) from public, anon, authenticated;

/**
 * Drop rows whose window closed long ago. Safe to call at any time; the limiter calls it
 * opportunistically so no scheduled job is required.
 */
create or replace function public.prune_chat_rate_limits(p_older_than_seconds integer default 3600)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.chat_rate_limits
  where window_start < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_chat_rate_limits(integer) from public, anon, authenticated;
