class MemoryCache {
    constructor() {
        this.cache = new Map();
    }

    set(key, value, ttlMs = 300000) { // Default 5 minutes
        const entry = {
            value,
            expiry: Date.now() + ttlMs
        };
        this.cache.set(key, entry);
        return value;
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }

    clear() {
        this.cache.clear();
    }

    delete(key) {
        this.cache.delete(key);
    }
}

const employeeCache = new MemoryCache();
const attendanceCache = new MemoryCache();
const branchStatusCache = new MemoryCache();
// Dedicated cache for dropdown data: branches, departments, employee lists
// TTL is set per-call (default 5 min). Cleared when employees are created/updated.
const dropdownCache = new MemoryCache();

module.exports = { employeeCache, attendanceCache, branchStatusCache, dropdownCache };

