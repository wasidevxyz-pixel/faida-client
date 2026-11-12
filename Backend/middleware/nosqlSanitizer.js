/**
 * Custom NoSQL Sanitizer for Express 5
 * Recursively removes any keys starting with '$' from req.body, req.query, and req.params
 */
const sanitize = (obj) => {
    if (obj instanceof Object) {
        for (const key in obj) {
            if (key.startsWith('$')) {
                delete obj[key];
            } else {
                sanitize(obj[key]);
            }
        }
    }
    return obj;
};

const nosqlSanitizer = (req, res, next) => {
    if (req.body) sanitize(req.body);
    if (req.params) sanitize(req.params);

    // For Express 5 req.query is tricky. We sanitize a copy and then overwrite if possible,
    // or just handle the most common query injection vectors.
    if (req.query) {
        const sanitizedQuery = JSON.parse(JSON.stringify(req.query));
        sanitize(sanitizedQuery);

        // In Express 5, re-assigning to req.query is sometimes restricted.
        // However, most standard setups allow it.
        try {
            req.query = sanitizedQuery;
        } catch (e) {
            // Fallback: manually clean the keys if re-assignment is blocked
            for (const key in req.query) {
                if (key.startsWith('$')) delete req.query[key];
            }
        }
    }

    next();
};

module.exports = nosqlSanitizer;
