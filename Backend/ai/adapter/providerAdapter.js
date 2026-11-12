// Compatibility boundary for the existing AI Brain. Provider selection lives in
// the MongoDB-backed manager; callers keep the same OpenAI-compatible interface.
module.exports = require('../provider/providerManager');
