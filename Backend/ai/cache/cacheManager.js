class CacheManager {
  constructor() { this.values = new Map(); }
  get(key) {
    const item = this.values.get(key);
    if (!item || item.expiresAt <= Date.now()) { this.values.delete(key); return undefined; }
    return item.value;
  }
  set(key, value, ttlMs) { this.values.set(key, { value, expiresAt: Date.now() + ttlMs }); return value; }
  getOrSet(key, factory, ttlMs) {
    const existing = this.get(key);
    if (existing !== undefined) return existing;
    return this.set(key, factory(), ttlMs);
  }
}
module.exports = new CacheManager();
