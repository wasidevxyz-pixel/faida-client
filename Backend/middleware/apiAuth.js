const Settings = require('../models/Settings');
const User = require('../models/User');

/**
 * @desc    Verify API Key and Secret for external access
 * @header  x-api-key
 * @header  x-api-secret
 */
exports.verifyApiKey = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    const basSecret = req.headers['bas-secret-key'] || req.query.basSecret;

    // If no API headers, just move to next (standard auth will pick it up)
    if (!apiKey && !apiSecret && !basSecret) {
        return next();
    }

    try {
        let isAuthorized = false;

        // Handle bas-secret-key (Biometric app simple secret)
        if (basSecret) {
            const MASTER_SECRET = process.env.BIOMETRIC_SECRET || 'BAS_SECURE_TOKEN_XYZ';
            const settings = await Settings.findOne({});
            if (basSecret === MASTER_SECRET || (settings && settings.apiSecret === basSecret)) {
                isAuthorized = true;
            }
        }

        // Handle standard API Key/Secret
        if (!isAuthorized && apiKey && apiSecret) {
            const settings = await Settings.findOne({ apiKey, apiSecret });
            if (settings) isAuthorized = true;
        }

        if (!isAuthorized) {
            return res.status(401).json({
                success: false,
                message: 'Invalid API Key or Secret'
            });
        }

        // Set a "System API" user in req.user to bypass standard auth
        // We fetch a real admin user or create a virtual one
        // Using an admin user ensures it passes all 'authorize' and 'adminAccess' checks
        // Cache admin user 5 min — avoids DB round-trip on every biometric request
        let adminUser = global._cachedApiAdminUser;
        if (!adminUser || Date.now() > (global._cachedApiAdminUserExpiry || 0)) {
            adminUser = await User.findOne({ role: 'admin', isActive: true });
            global._cachedApiAdminUser = adminUser;
            global._cachedApiAdminUserExpiry = Date.now() + (5 * 60 * 1000);
        }

        if (adminUser) {
            req.user = adminUser;
        } else {
            // Fallback to virtual user if no real admin exists (unlikely)
            const settings = await Settings.findOne({});
            req.user = {
                _id: settings ? settings.createdBy : '000000000000000000000000',
                role: 'admin',
                isActive: true,
                isApiAccess: true,
                branch: [] // Empty array for admin means "All Branches"
            };
        }

        next();
    } catch (err) {
        console.error('API Verification Error:', err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
