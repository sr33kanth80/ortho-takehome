import { env, requireOrthogonalKey } from "@/lib/env";
import { memoryCache, stableKey, type CacheStore } from "@/lib/cache";
import { OrthogonalError, classify } from "./errors";
import type {
  DetailsResponse,
  ListEndpointsResponse,
  OrthogonalErrorBody,
  RunResponse,
  SearchResponse,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;

// TTLs tuned to the stability of each resource.
const TTL = {
  search: 5 * 60_000, // catalog membership changes rarely
  details: 60 * 60_000, // endpoint schemas are effectively static
  list: 10 * 60_000,
  run: 10 * 60_000, // dedupe identical paid calls within a turn/session
} as const;

export interface RunArgs {
  api: string;
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

export interface OrthogonalClientOptions {
  cache?: CacheStore;
  timeoutMs?: number;
}

/**
 * Thin, typed, resilient client over the four Orthogonal primitives.
 *
 * Design choices:
 *  - Normalises every failure into `OrthogonalError` with a stable `code`.
 *  - Caches stable reads (details/search/list) and, importantly, dedupes
 *    identical `run` calls for a short window so the agent can't double-charge
 *    the user by calling the same paid endpoint twice in one turn.
 *  - No ret/backoff loop here; retry policy is a caller/agent concern.
 */
export class OrthogonalClient {
  private readonly cache: CacheStore;
  private readonly timeoutMs: number;

  constructor(opts: OrthogonalClientOptions = {}) {
    this.cache = opts.cache ?? memoryCache;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async search(prompt: string, limit = 8): Promise<SearchResponse> {
    const key = stableKey("orth:search", { prompt, limit });
    const cached = await this.cache.get<SearchResponse>(key);
    if (cached) return cached;
    const res = await this.request<SearchResponse>("POST", "/v1/search", {
      body: { prompt, limit },
    });
    await this.cache.set(key, res, TTL.search);
    return res;
  }

  async listEndpoints(limit = 100, offset = 0): Promise<ListEndpointsResponse> {
    const key = stableKey("orth:list", { limit, offset });
    const cached = await this.cache.get<ListEndpointsResponse>(key);
    if (cached) return cached;
    const res = await this.request<ListEndpointsResponse>("GET", "/v1/list-endpoints", {
      query: { limit, offset },
    });
    await this.cache.set(key, res, TTL.list);
    return res;
  }

  async details(api: string, path: string, fresh = false): Promise<DetailsResponse> {
    const key = stableKey("orth:details", { api, path });
    if (!fresh) {
      const cached = await this.cache.get<DetailsResponse>(key);
      if (cached) return cached;
    }
    const res = await this.request<DetailsResponse>("POST", "/v1/details", {
      body: { api, path },
    });
    await this.cache.set(key, res, TTL.details);
    return res;
  }

  /**
   * Execute a catalog endpoint. THIS COSTS MONEY.
   * Identical calls are de-duplicated for a short window via the cache.
   */
  async run<T = unknown>(args: RunArgs, options: { dedupe?: boolean } = {}): Promise<RunResponse<T>> {
    const key = stableKey("orth:run", args);
    if (options.dedupe !== false) {
      const cached = await this.cache.get<RunResponse<T>>(key);
      if (cached) return { ...cached, requestId: cached.requestId } as RunResponse<T>;
    }
    const res = await this.request<RunResponse<T>>("POST", "/v1/run", { body: args });
    // Only cache successful, priced responses.
    if (res.success && options.dedupe !== false) await this.cache.set(key, res, TTL.run);
    return res;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: { body?: unknown; query?: Record<string, unknown> } = {},
  ): Promise<T> {
    const apiKey = requireOrthogonalKey();
    const url = new URL(path, env.orthogonal.baseUrl);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new OrthogonalError({
          code: "TIMEOUT",
          message: `Request to ${path} timed out after ${this.timeoutMs}ms`,
          retryable: true,
        });
      }
      throw new OrthogonalError({
        code: "NETWORK",
        message: `Network error calling ${path}: ${(err as Error).message}`,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new OrthogonalError({
        code: "UPSTREAM",
        message: `Non-JSON response from ${path} (status ${res.status})`,
        status: res.status,
        retryable: res.status >= 500,
      });
    }

    if (!res.ok || (json as { success?: boolean }).success === false) {
      const errBody = json as OrthogonalErrorBody;
      const { code, retryable } = classify(res.status, errBody.code);
      throw new OrthogonalError({
        code,
        message: errBody.error || errBody.message || `Request to ${path} failed`,
        status: res.status,
        requestId: errBody.requestId,
        retryable,
      });
    }

    return json as T;
  }
}

/** Lazily-constructed singleton for the app to share (and its warm cache). */
let _client: OrthogonalClient | null = null;
export function getOrthogonalClient(): OrthogonalClient {
  if (!_client) _client = new OrthogonalClient();
  return _client;
}
