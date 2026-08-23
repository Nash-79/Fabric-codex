import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type SoftAuthResult = { userId: string; approved: boolean } | null;

/**
 * Non-throwing counterpart to requireSupabaseAuth (auth-middleware.ts) for routes that must stay
 * usable anonymously — verifies a bearer token if one is present, but returns null on any failure
 * instead of throwing. Never blocks the request; callers use the result only to raise or lower
 * limits (see chat-rate-limit.server.ts's tier gate).
 */
export async function trySoftAuth(request: Request): Promise<SoftAuthResult> {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length);
    if (!token) return null;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || !userId) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", userId)
      .maybeSingle();

    return { userId, approved: profile?.status === "approved" };
  } catch {
    // Any failure (malformed token, network hiccup) degrades to anonymous — never blocks the request.
    return null;
  }
}
