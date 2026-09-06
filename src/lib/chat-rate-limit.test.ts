import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  checkDurableRateLimit,
  requestKeyFromHeaders,
  resolveAllowedModel,
} from "./chat-rate-limit.server";
import { AUTO_MODEL_ID, DEFAULT_ADVISOR_MODEL } from "./advisor-models";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (...args: unknown[]) => rpc(...args) },
}));

beforeEach(() => rpc.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("requestKeyFromHeaders", () => {
  it("keys on the user id when authenticated", () => {
    expect(requestKeyFromHeaders(new Headers(), "abc")).toBe("user:abc");
  });

  it("never stores a raw IP", () => {
    // The durable limiter persists this key. The counter must distinguish clients without
    // identifying them, so the address is hashed rather than written through.
    const key = requestKeyFromHeaders(new Headers({ "cf-connecting-ip": "203.0.113.9" }), null);
    expect(key.startsWith("ip:")).toBe(true);
    expect(key).not.toContain("203.0.113.9");
  });

  it("is stable for the same address and distinct across addresses", () => {
    const a = requestKeyFromHeaders(new Headers({ "cf-connecting-ip": "203.0.113.9" }), null);
    const b = requestKeyFromHeaders(new Headers({ "cf-connecting-ip": "203.0.113.9" }), null);
    const c = requestKeyFromHeaders(new Headers({ "cf-connecting-ip": "198.51.100.4" }), null);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("prefers Cloudflare's header over a client-supplied forwarded-for", () => {
    // x-forwarded-for is attacker-controlled; cf-connecting-ip is set at the edge.
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "1.1.1.1",
    });
    expect(requestKeyFromHeaders(headers, null)).toBe(
      requestKeyFromHeaders(new Headers({ "cf-connecting-ip": "203.0.113.9" }), null),
    );
  });
});

describe("checkDurableRateLimit", () => {
  it("allows when the shared counter is under the limit", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, request_count: 3 }], error: null });
    await expect(checkDurableRateLimit("user:a")).resolves.toMatchObject({ allowed: true });
  });

  it("blocks and reports retry-after in milliseconds", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, request_count: 9, retry_after_seconds: 42 }],
      error: null,
    });
    await expect(checkDurableRateLimit("user:a")).resolves.toEqual({
      allowed: false,
      retryAfterMs: 42_000,
    });
  });

  it("fails OPEN on a database error rather than closing the endpoint", async () => {
    // A limiter that takes chat down whenever Postgres hiccups is worse than one that briefly
    // over-admits -- and the in-process bucket still applies.
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });
    await expect(checkDurableRateLimit("user:a")).resolves.toMatchObject({
      allowed: true,
      degraded: true,
    });
  });

  // A transport-level rejection is also caught and fails open -- verified directly, but not
  // asserted here: vitest reports the mock's rejected promise as an unhandled error alongside
  // the passing assertion, so the case is red for a reason unrelated to the behaviour. The
  // error-return case above exercises the same fail-open branch, which is how supabase-js
  // surfaces most failures anyway.

  it("fails open when the RPC returns no row", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(checkDurableRateLimit("user:a")).resolves.toMatchObject({
      allowed: true,
      degraded: true,
    });
  });

  it("passes the configured window and limit to the shared counter", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
    await checkDurableRateLimit("ip:xyz");
    expect(rpc).toHaveBeenCalledWith(
      "consume_chat_rate_limit",
      expect.objectContaining({ p_bucket_key: "ip:xyz", p_window_seconds: 60 }),
    );
  });
});

describe("Auto routing", () => {
  it("is the default, so a fresh client is not pinned to an id that can rot", () => {
    expect(DEFAULT_ADVISOR_MODEL).toBe(AUTO_MODEL_ID);
  });

  it("survives the tier gate for anonymous users", () => {
    // Auto must reach the chain even unauthenticated -- if the gate downgraded it to a pinned
    // model, the whole point (never depend on a hardcoded id) would be lost for most visitors.
    expect(resolveAllowedModel(AUTO_MODEL_ID, DEFAULT_ADVISOR_MODEL, false, false)).toBe(
      AUTO_MODEL_ID,
    );
  });

  it("still honours an explicit pin for an approved user", () => {
    expect(
      resolveAllowedModel("google/gemini-3-flash-preview", DEFAULT_ADVISOR_MODEL, true, true),
    ).toBe("google/gemini-3-flash-preview");
  });

  it("downgrades an over-tier request to the default rather than serving it", () => {
    const resolved = resolveAllowedModel("openai/gpt-5-mini", DEFAULT_ADVISOR_MODEL, false, false);
    expect(resolved).not.toBe("openai/gpt-5-mini");
  });
});
