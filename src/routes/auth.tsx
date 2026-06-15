import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FabricMark } from "@/components/FabricMark";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Fabric Atlas" },
      { name: "description", content: "Sign in to Fabric Atlas to save patterns and tailor your view." },
    ],
  }),
  component: AuthPage,
});

const Schema = z.object({ email: z.string().email(), password: z.string().min(8) });

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/atlas" });
    });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error("Enter a valid email and 8+ character password.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Welcome to Fabric Atlas.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: "/atlas" });
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/atlas" });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    nav({ to: "/atlas" });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#070b16] px-6 py-16 text-white">
      <Link to="/" className="absolute left-6 top-6 inline-flex items-center gap-2 text-sm font-semibold">
        <FabricMark className="h-6 w-6" /> Fabric Atlas
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-white/55">
          {mode === "signin" ? "Sign in to bookmark patterns and tune your atlas." : "Save patterns, mark favorites and shape your view."}
        </p>

        <Button onClick={google} disabled={loading} variant="outline" className="mt-6 w-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
          <GoogleG className="mr-2 h-4 w-4" /> Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/40">
          <div className="h-px flex-1 bg-white/10" /> or <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-white/70">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 border-white/10 bg-white/[0.04] text-white" />
          </div>
          <div>
            <Label htmlFor="password" className="text-white/70">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="mt-1 border-white/10 bg-white/[0.04] text-white" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-teal-400 to-sky-500 text-slate-950 hover:opacity-90">
            {loading ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-white/55">
          {mode === "signin" ? "Need an account? " : "Have an account? "}
          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="font-medium text-teal-300 hover:underline">
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.4 14.7 2.5 12 2.5 6.7 2.5 2.5 6.8 2.5 12s4.2 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
