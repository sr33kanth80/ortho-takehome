/**
 * Tiny cache abstraction used to (a) avoid re-charging for identical Orthogonal
 * `run` calls within a short window and (b) memoise stable `details`/`search`
 * lookups.
 *
 * `CacheStore` is an interface so it can be backed by an in-process Map (default,
 * good enough for a single warm serverless instance) or by Postgres (durable
 * across instances). The Postgres-backed implementation lives in the db layer.
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

/** Process-local LRU-ish TTL cache. Bounded to avoid unbounded memory growth. */
export class MemoryCache implements CacheStore {
  private map = new Map<string, Entry>();
  constructor(private maxEntries = 500) {}

  async get<T>(key: string): Promise<T | undefined> {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // touch for recency
    this.map.delete(key);
    this.map.set(key, e);
    return e.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

/** Stable string key from an object (sorted keys) for cache lookups. */
export function stableKey(prefix: string, obj: unknown): string {
  return `${prefix}:${stableStringify(obj)}`;
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

/** Shared process-wide default cache. */
export const memoryCache = new MemoryCache();
