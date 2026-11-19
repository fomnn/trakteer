/**
 * TTL cache used by the Trakteer utils.
 *
 * `@epic-web/cachified` handles TTL, single-flight for concurrent misses and
 * value validation; `@zap-studio/cache` provides the bounded LRU storage.
 *
 * Entries are process-wide. When a cached call accepts a custom `fetch` (e.g. an
 * egress proxy), the transport that populated the entry keeps serving reads
 * until the entry expires or `invalidate()` is called.
 */

import { cachified, type Cache, type CacheEntry } from "@epic-web/cachified";
import { createCache } from "@zap-studio/cache";

/** Upper bound on retained entries; least recently used entries are evicted. */
const MAX_ENTRIES = 500;

const store = createCache<string, CacheEntry<unknown>>(MAX_ENTRIES);

const cache: Cache<unknown> = {
  name: "trakteer",
  get: (key) => store.get(key),
  set: (key, value) => store.set(key, value),
  delete: (key) => store.delete(key),
};

/** Drops a cached entry, e.g. a CSRF token that the server rejected. */
export function invalidate(key: string): void {
  cache.delete(key);
}

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  return cachified<T>({
    cache,
    key,
    ttl: ttlMs,
    // Prices and CSRF tokens must never be served after their TTL.
    staleWhileRevalidate: 0,
    getFreshValue: load,
  });
}
