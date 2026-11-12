const SystemLog = require('../models/SystemLog');

/**
 * Professional Request Logger Middleware
 * Captures all incoming requests and their responses
 */
const requestLogger = async (req, res, next) => {
    const start = Date.now();

    // Skip certain paths like static files, health checks, or browser noise (.well-known)
    const skipPaths = ['/js/', '/css/', '/img/', '/favicon.ico', '/api/v1/system-logs', '/.well-known'];
    if (skipPaths.some(path => req.url.startsWith(path))) {
        return next();
    }

    // Capture the original end function to calculate duration
    const originalEnd = res.end;
    res.end = function (...args) {
        const duration = Date.now() - start;

        // Finalize log on response finish
        const logData = {
            method: req.method,
            url: req.originalUrl || req.url,
            status: res.statusCode,
            ip: req.ip || req.connection.remoteAddress,
            userId: req.user ? req.user.id : null,
            userName: req.user ? req.user.name : 'Guest',
            userAgent: req.get('user-agent'),
            duration: duration
        };

        // Determine log level based on status
        let level = 'info';
        if (res.statusCode >= 500) level = 'error';
        else if (res.statusCode >= 400) level = 'warn';

        const message = `${req.method} ${logData.url} ${res.statusCode} (${duration}ms)`;

        // Save to DB asynchronously (don't block the response)
        SystemLog.log(level, message, 'request', logData).catch(err => {
            console.error('Logger Middleware Error:', err.message);
        });

        return originalEnd.apply(this, args);
    };

    next();
};

/**
 * Capture Client-Side Errors
 */
const logClientError = async (req, res) => {
    try {
        const { message, stack, url, line, col, userAgent } = req.body;

        await SystemLog.log('error', `Client Error: ${message}`, 'client', {
            url,
            stack,
            line,
            col,
            userAgent,
            userId: req.user ? req.user.id : null,
            userName: req.user ? req.user.name : 'Guest',
            ip: req.ip
        });

        res.status(204).send();
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    requestLogger,
    logClientError
};
