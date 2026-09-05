/**
 * Which providers are currently out of free allowance, and until when.
 *
 * Without this the app rediscovers the same exhaustion on every request: it
 * calls the spent provider, waits for the 429, and only then moves on — a
 * wasted round trip each time, and a request counted against a quota that is
 * already gone. Remembering the refusal turns "fall back after failing" into
 * "skip what is spent", which is what makes the rotation invisible.
 *
 * The state lives in the student's browser and travels with each request.
 * There is no database, and a serverless instance is thrown away between
 * requests, so the browser is the only thing that remembers across them.
 */
export interface Cooldown {
  /** Epoch milliseconds. */
  until: number;
  /** Translation key describing why, for the settings screen. */
  reason: string;
}

export type Cooldowns = Record<string, Cooldown>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Google's free daily allowance resets at midnight Pacific. Rather than
 * track US daylight saving, wait for the later of the two possible resets
 * (08:00 UTC) — being an hour late costs nothing, being an hour early spends
 * a request to learn the quota is still gone.
 */
export function nextDailyReset(now = Date.now()): number {
  const reset = new Date(now);
  reset.setUTCHours(8, 0, 0, 0);
  if (reset.getTime() <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset.getTime();
}

export interface FailureShape {
  status?: number;
  message?: string;
  /** Seconds, from a Retry-After header. */
  retryAfter?: number;
}

/**
 * How long to leave a provider alone after a refusal, and why.
 *
 * Returns null when the failure says nothing about availability — a bad
 * request or a malformed answer is not a reason to stop using a provider.
 */
export function cooldownFor(failure: FailureShape, now = Date.now()): Cooldown | null {
  const { status } = failure;
  const message = failure.message ?? "";

  // The provider said exactly how long to wait; nothing beats that.
  if (failure.retryAfter && Number.isFinite(failure.retryAfter)) {
    return { until: now + failure.retryAfter * 1000, reason: "cool.rate" };
  }

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(message)) {
    // A daily allowance is gone for the day; a per-minute limit clears itself.
    const daily = /per day|daily|PerDay|RESOURCE_EXHAUSTED|quota/i.test(message);
    return daily
      ? { until: nextDailyReset(now), reason: "cool.daily" }
      : { until: now + MINUTE, reason: "cool.rate" };
  }

  // A rejected key will still be rejected in a minute; stop hammering it, but
  // recheck often enough that fixing the key does not mean waiting a day.
  if (status === 401 || status === 403 || /API[_ ]?KEY|UNAUTHENTICATED|PERMISSION_DENIED/i.test(message)) {
    return { until: now + HOUR, reason: "cool.key" };
  }

  if (status === 404 || /NOT_FOUND|no longer available|model/i.test(message)) {
    return { until: now + HOUR, reason: "cool.model" };
  }

  if ((status && status >= 500) || /overloaded|UNAVAILABLE|fetch failed/i.test(message)) {
    return { until: now + 5 * MINUTE, reason: "cool.busy" };
  }

  return null;
}

/** Drops entries that have expired, so the stored state cannot grow forever. */
export function prune(cooldowns: Cooldowns, now = Date.now()): Cooldowns {
  const out: Cooldowns = {};
  for (const [id, entry] of Object.entries(cooldowns ?? {})) {
    if (entry && typeof entry.until === "number" && entry.until > now) out[id] = entry;
  }
  return out;
}

export const isCooling = (cooldowns: Cooldowns, id: string, now = Date.now()): boolean =>
  (cooldowns?.[id]?.until ?? 0) > now;

/**
 * Orders candidates: everything usable now, in preference order, then the
 * ones that are cooling, soonest first. Nothing is ever dropped — if every
 * provider is spent, trying the one closest to reset still beats refusing.
 */
export function order<T extends { id: string }>(
  candidates: T[],
  cooldowns: Cooldowns,
  now = Date.now(),
): T[] {
  const ready = candidates.filter((c) => !isCooling(cooldowns, c.id, now));
  const cooling = candidates
    .filter((c) => isCooling(cooldowns, c.id, now))
    .sort((a, b) => cooldowns[a.id].until - cooldowns[b.id].until);
  return [...ready, ...cooling];
}
