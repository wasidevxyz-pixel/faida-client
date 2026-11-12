const mongoose = require('mongoose');

const aiProviderLogSchema = new mongoose.Schema({
  provider: { type: String, required: true, index: true },
  model: { type: String, required: true },
  responseTimeMs: { type: Number, required: true },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  error: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now, index: true }
}, { collection: 'ai_provider_logs', versionKey: false });

aiProviderLogSchema.index({ provider: 1, timestamp: -1 });
module.exports = mongoose.model('AiProviderLog', aiProviderLogSchema);
