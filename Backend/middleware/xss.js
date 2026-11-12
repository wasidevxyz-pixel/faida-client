const xss = require('xss');

/**
 * Middleware to sanitize request body, query, and params
 * and prevent XSS attacks
 */
const xssClean = (req, res, next) => {
    if (req.body) {
        // Simple sanitization for body properties (shallow)
        // For deep sanitization we'd need recursion but let's keep it simple and safe for now
        // actually sanitize function handles recursion
        req.body = sanitize(req.body);
    }
    if (req.query) {
        // Express 5: req.query is read-only, must mutate properties
        for (const key in req.query) {
            req.query[key] = sanitize(req.query[key]);
        }
    }
    if (req.params) {
        // Express 5: req.params might be read-only too
        for (const key in req.params) {
            req.params[key] = sanitize(req.params[key]);
        }
    }
    next();
};

const sanitize = (obj) => {
    if (Array.isArray(obj)) {
        return obj.map((v) => sanitize(v));
    } else if (obj !== null && typeof obj === 'object') {
        return Object.keys(obj).reduce((result, key) => {
            if (key === 'htmlContent') {
                result[key] = obj[key]; // Preserve raw HTML for headless Chrome PDF rendering
            } else {
                result[key] = sanitize(obj[key]);
            }
            return result;
        }, {});
    } else if (typeof obj === 'string') {
        return xss(obj);
    } else {
        return obj;
    }
};

module.exports = xssClean;
