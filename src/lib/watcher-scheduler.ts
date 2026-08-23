/**
 * Watcher Scheduler with EWMA Adaptive Cadence and Deterministic FNV-1a Jitter.
 *
 * Implements adaptive polling intervals:
 * 1. Derives intervals from published activity using Exponential Weighted Moving Average (EWMA).
 * 2. Deterministic FNV-1a hash jitter spreads load across time slots without random drift across restarts.
 * 3. Bounded between MIN_INTERVAL_MS (15 minutes) and MAX_INTERVAL_MS (7 days).
 */

export const MIN_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
export const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const MAX_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_EWMA_ALPHA = 0.3; // Weight for recent publishing interval

/**
 * 32-bit FNV-1a hash algorithm for deterministic string hashing.
 */
export function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiply by 32-bit FNV prime 0x01000193
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Computes deterministic jitter in milliseconds for a given feed identifier.
 * Returns a value in [-jitterRangeMs/2, +jitterRangeMs/2] so expected interval is preserved.
 */
export function computeDeterministicJitter(
  feedId: string,
  jitterRangeMs: number = 10 * 60 * 1000,
): number {
  if (!feedId || jitterRangeMs <= 0) return 0;
  const hash = fnv1a32(feedId);
  const normalized = (hash % 10000) / 10000; // 0.0 to 0.9999
  return Math.floor((normalized - 0.5) * jitterRangeMs);
}

/**
 * Updates EWMA interval estimate given observed interval between publications.
 */
export function calculateNextEwmaInterval(
  previousEwmaMs: number | null | undefined,
  observedIntervalMs: number,
  alpha: number = DEFAULT_EWMA_ALPHA,
): number {
  const boundedObserved = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, observedIntervalMs));
  if (previousEwmaMs == null || previousEwmaMs <= 0) {
    return boundedObserved;
  }
  const next = alpha * boundedObserved + (1 - alpha) * previousEwmaMs;
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(next)));
}

export type ScheduleOptions = {
  feedId: string;
  lastSuccessAt?: Date | string | null;
  lastModifiedAt?: Date | string | null;
  currentEwmaMs?: number | null;
  backoffCount?: number;
  minIntervalMs?: number;
  maxIntervalMs?: number;
  now?: Date;
};

export type ScheduleResult = {
  nextFetchAt: Date;
  intervalMs: number;
  jitterMs: number;
  ewmaMs: number;
  backoffApplied: boolean;
};

/**
 * Computes nextFetchAt combining EWMA cadence, exponential backoff for consecutive failures,
 * and deterministic FNV-1a jitter.
 */
export function calculateNextFetch(options: ScheduleOptions): ScheduleResult {
  const now = options.now ? new Date(options.now) : new Date();
  const minInterval = options.minIntervalMs ?? MIN_INTERVAL_MS;
  const maxInterval = options.maxIntervalMs ?? MAX_INTERVAL_MS;
  const backoff = Math.max(0, options.backoffCount ?? 0);

  let baseIntervalMs = options.currentEwmaMs ?? DEFAULT_INTERVAL_MS;

  // If we have publication timestamps, adapt EWMA
  if (options.lastModifiedAt && options.lastSuccessAt) {
    const lastMod = new Date(options.lastModifiedAt).getTime();
    const lastSucc = new Date(options.lastSuccessAt).getTime();
    if (lastMod > 0 && lastSucc > lastMod) {
      const observed = lastSucc - lastMod;
      baseIntervalMs = calculateNextEwmaInterval(options.currentEwmaMs, observed);
    }
  }

  // Apply exponential backoff if consecutive errors occurred
  let effectiveIntervalMs = baseIntervalMs;
  let backoffApplied = false;
  if (backoff > 0) {
    const multiplier = Math.pow(1.5, Math.min(backoff, 6));
    effectiveIntervalMs = Math.round(baseIntervalMs * multiplier);
    backoffApplied = true;
  }

  effectiveIntervalMs = Math.max(minInterval, Math.min(maxInterval, effectiveIntervalMs));

  // Compute deterministic jitter (capped to 15% of interval or 15 mins)
  const jitterRangeMs = Math.min(15 * 60 * 1000, effectiveIntervalMs * 0.15);
  const jitterMs = computeDeterministicJitter(options.feedId, jitterRangeMs);

  const finalDelayMs = Math.max(minInterval, effectiveIntervalMs + jitterMs);
  const nextFetchAt = new Date(now.getTime() + finalDelayMs);

  return {
    nextFetchAt,
    intervalMs: finalDelayMs,
    jitterMs,
    ewmaMs: baseIntervalMs,
    backoffApplied,
  };
}
