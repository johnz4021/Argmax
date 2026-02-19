/**
 * Cache generated trace generators to avoid regenerating them.
 * In-memory Map for now; could be backed by Redis or a database in production.
 */
const cache = new Map();

export function getCachedGenerator(algorithmId) {
  return cache.get(algorithmId) || null;
}

export function cacheGenerator(algorithmId, { code, renderer, verifiedAt }) {
  cache.set(algorithmId, { code, renderer, verifiedAt, hitCount: 0 });
}

export function incrementHitCount(algorithmId) {
  const entry = cache.get(algorithmId);
  if (entry) entry.hitCount++;
}

export function getCacheStats() {
  const stats = {};
  for (const [id, entry] of cache) {
    stats[id] = { renderer: entry.renderer, hitCount: entry.hitCount, verifiedAt: entry.verifiedAt };
  }
  return stats;
}
