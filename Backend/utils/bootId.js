/**
 * Server Boot ID
 * Generated once when server starts. Any token issued before this boot
 * will have a different bootId and will be rejected → user auto-logged out.
 */
const crypto = require('crypto');

const SERVER_BOOT_ID = crypto.randomBytes(16).toString('hex');

console.log(`[BOOT] Server Boot ID: ${SERVER_BOOT_ID}`);

module.exports = { SERVER_BOOT_ID };
