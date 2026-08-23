import { describe, expect, it } from "vitest";
import {
  fnv1a32,
  computeDeterministicJitter,
  calculateNextEwmaInterval,
  calculateNextFetch,
  MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
  DEFAULT_INTERVAL_MS,
} from "./watcher-scheduler";

describe("watcher-scheduler", () => {
  it("computes deterministic FNV-1a hash", () => {
    const hash1 = fnv1a32("fabric-blog-main");
    const hash2 = fnv1a32("fabric-blog-main");
    const hash3 = fnv1a32("other-feed");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(typeof hash1).toBe("number");
    expect(hash1).toBeGreaterThan(0);
  });

  it("computes reproducible deterministic jitter across runs", () => {
    const jitter1 = computeDeterministicJitter("feed-123", 600000);
    const jitter2 = computeDeterministicJitter("feed-123", 600000);

    expect(jitter1).toBe(jitter2);
    expect(Math.abs(jitter1)).toBeLessThanOrEqual(300000);
  });

  it("adapts EWMA interval within bounds", () => {
    // Initial interval from empty
    const initial = calculateNextEwmaInterval(null, 4 * 60 * 60 * 1000);
    expect(initial).toBe(4 * 60 * 60 * 1000);

    // Update with slower publishing (8 hours)
    const updated = calculateNextEwmaInterval(initial, 8 * 60 * 60 * 1000, 0.5);
    expect(updated).toBe(6 * 60 * 60 * 1000);

    // Clamps to min/max bounds
    const belowMin = calculateNextEwmaInterval(null, 1000);
    expect(belowMin).toBe(MIN_INTERVAL_MS);

    const aboveMax = calculateNextEwmaInterval(null, 100 * 24 * 60 * 60 * 1000);
    expect(aboveMax).toBe(MAX_INTERVAL_MS);
  });

  it("calculates next fetch with backoff on failure", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    const normal = calculateNextFetch({
      feedId: "test-feed",
      currentEwmaMs: DEFAULT_INTERVAL_MS,
      backoffCount: 0,
      now,
    });

    const backedOff = calculateNextFetch({
      feedId: "test-feed",
      currentEwmaMs: DEFAULT_INTERVAL_MS,
      backoffCount: 3,
      now,
    });

    expect(normal.backoffApplied).toBe(false);
    expect(backedOff.backoffApplied).toBe(true);
    expect(backedOff.intervalMs).toBeGreaterThan(normal.intervalMs);
    expect(backedOff.nextFetchAt.getTime()).toBeGreaterThan(normal.nextFetchAt.getTime());
  });
});
