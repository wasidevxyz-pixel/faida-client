const rateLimit = require('express-rate-limit');

const AI_ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin']);

exports.requireAiAccess = (req, res, next) => {
  const isAdmin = AI_ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase());
  if (isAdmin || req.user?.aiEnabled === true) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'AI access is not enabled for this user.' });
};

// Model calls are comparatively expensive. This is intentionally much stricter
// than the ERP's general API limiter, while still allowing normal interactive use.
exports.aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => String(req.user?._id || req.ip),
  message: { success: false, message: 'Too many AI requests. Please wait a minute and try again.' }
});
