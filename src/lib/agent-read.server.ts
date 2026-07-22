import { createHash, timingSafeEqual } from "node:crypto";

function tokenDigest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function authorizeAgentRead(request: Request): boolean {
  const expected = process.env.FABRIC_ATLAS_AGENT_READ_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!expected || !supplied) return false;
  return timingSafeEqual(tokenDigest(expected), tokenDigest(supplied));
}

export async function getAgentSnapshot() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [
    { data: queue, error: queueError },
    { data: watchers, error: watcherError },
    { data: feedback, error: feedbackError },
  ] = await Promise.all([
    supabaseAdmin
      .from("queue_items")
      .select(
        "id,kind,url,title,tier,tags,notes,target_slug,scheduled_at,status,created_at,claimed_at",
      )
      .in("status", ["queued", "claimed", "failed"])
      .order("created_at"),
    supabaseAdmin
      .from("source_watchers")
      .select(
        "id,title,url,alternative_url,mode,detected_mode,detected_url,status,allowed_host,allowed_path_prefix,max_depth,max_pages,default_tier,default_tags,last_attempt_at,last_success_at,error_count,last_error_code,last_error,last_error_trigger,suggested_url,etag,last_modified",
      )
      .order("created_at"),
    supabaseAdmin
      .from("content_feedback")
      .select(
        "id,content_item_id,content_hash,category,body,section_id,section_title,status,created_at,content_items(kind,slug,title,content_hash)",
      )
      .eq("status", "new")
      .order("created_at"),
  ]);
  if (queueError) throw new Error(`Queue snapshot failed: ${queueError.message}`);
  if (watcherError) throw new Error(`Watcher snapshot failed: ${watcherError.message}`);
  if (feedbackError) throw new Error(`Feedback snapshot failed: ${feedbackError.message}`);

  const watcherIds = (watchers ?? []).map((watcher) => watcher.id);
  let seen: Array<{ watcher_id: string; canonical_url: string }> = [];
  if (watcherIds.length) {
    const { data, error } = await supabaseAdmin
      .from("source_watcher_items")
      .select("watcher_id,canonical_url")
      .in("watcher_id", watcherIds)
      .limit(10_000);
    if (error) throw new Error(`Watcher dedupe snapshot failed: ${error.message}`);
    seen = data ?? [];
  }

  return {
    generated_at: new Date().toISOString(),
    queue: queue ?? [],
    watchers: watchers ?? [],
    watcher_items: seen,
    // Raw feedback body text is unvetted user input — the RLS on content_feedback keeps it out
    // of any public/anon read; this token-gated snapshot is the only keyless path an agent has
    // to it, same trust boundary as the queue/watcher data above.
    feedback: feedback ?? [],
  };
}
