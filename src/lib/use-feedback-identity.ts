import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ANON_TOKEN_STORAGE_KEY = "fabric-atlas-feedback-token";

// A lightweight, NOT security-relevant client identity for anonymous feedback submission: it only
// exists so "did I already report this section" has something to key on. A cleared localStorage
// or a different browser is simply a "new" anonymous submitter — that's fine for this nicety, and
// this token is never treated as authentication anywhere server-side.
export function readOrCreateAnonToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(ANON_TOKEN_STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(ANON_TOKEN_STORAGE_KEY, created);
    return created;
  } catch {
    // Storage unavailable (private mode, disabled storage) — fall back to a per-mount token; the
    // reader can still submit feedback, they just won't get "already reported" continuity.
    return crypto.randomUUID();
  }
}

/** Whether the current browser has an authenticated Supabase session right now. */
export function useHasSession() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);
  return hasSession;
}
