/**
 * stableCache middleware
 * Sets Cloudflare-friendly cache headers for stable, read-only GET data.
 *
 * - s-maxage=300   → Cloudflare edge caches the response for 5 minutes.
 *                   Users in Pakistan connect to Cloudflare's Karachi/Islamabad
 *                   edge — they get the data from there, not the origin server.
 * - max-age=60     → Browser caches for 1 minute (secondary benefit).
 * - stale-while-revalidate=60 → Serve stale while refreshing in background.
 *
 * Only applied to GET requests. POST/PUT/DELETE still bypass this.
 */
const stableCache = (req, res, next) => {
    if (req.method === 'GET') {
        // Override the global no-cache header set in server.js for /api/ routes
        res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60');
        // Remove no-cache headers set by the global middleware
        res.removeHeader('Pragma');
        res.removeHeader('Expires');
    }
    next();
};

module.exports = stableCache;
