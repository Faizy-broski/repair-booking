/**
 * Tiny in-process TTL + LRU cache.
 *
 * Per server instance only (not shared across serverless instances, cleared on
 * deploy) — use it for things that are cheap to recompute but slow to fetch or
 * render, where a miss is always safe. Map preserves insertion order, so the
 * first key is the least recently used one.
 */
export class MemoryCache<V> {
  private store = new Map<string, { value: V; expires: number }>()

  constructor(private maxEntries: number, private ttlMs: number) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key)
    if (!hit) return undefined
    if (hit.expires <= Date.now()) {
      this.store.delete(key)
      return undefined
    }
    // Refresh recency
    this.store.delete(key)
    this.store.set(key, hit)
    return hit.value
  }

  set(key: string, value: V): void {
    this.store.delete(key)
    this.store.set(key, { value, expires: Date.now() + this.ttlMs })
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value
      if (oldest === undefined) break
      this.store.delete(oldest)
    }
  }
}
