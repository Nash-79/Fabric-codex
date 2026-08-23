import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Small reusable version of the getSession + onAuthStateChange pattern SiteHeader.tsx already
// uses inline. Extracted here because use-progress-sync.ts needs the same "am I signed in, and
// with which user id" signal to decide anonymous-localStorage vs server-progress mode.
export function useAuthSession() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined); // undefined = not yet resolved

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUserId(session?.user.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { userId, isSignedIn: !!userId, isResolved: userId !== undefined };
}
