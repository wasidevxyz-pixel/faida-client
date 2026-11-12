const mongoose = require('mongoose');

const aiProviderSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, lowercase: true },
  displayName: { type: String, required: true, trim: true },
  apiKey: { type: String, trim: true, select: false, default: '' },
  baseUrl: { type: String, trim: true, default: '' },
  model: { type: String, trim: true, default: '' },
  timeoutMs: { type: Number, min: 1000, max: 120000, default: 30000 },
  priority: { type: Number, min: 1, required: true, index: true },
  enabled: { type: Boolean, default: false, index: true },
  healthStatus: { type: String, enum: ['unknown', 'online', 'offline', 'disabled'], default: 'unknown' },
  lastError: { type: String, default: '', maxlength: 1000 },
  retryCount: { type: Number, min: 0, default: 0 },
  lastHealthCheckAt: Date,
  averageResponseTimeMs: { type: Number, default: 0 },
  totalRequests: { type: Number, default: 0 },
  totalFailures: { type: Number, default: 0 }
}, { timestamps: true, collection: 'ai_providers' });

aiProviderSchema.index({ enabled: 1, priority: 1 });
module.exports = mongoose.model('AiProvider', aiProviderSchema);
