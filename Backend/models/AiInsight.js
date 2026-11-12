'use strict';
const mongoose = require('mongoose');

// Stores auto-generated business insights and anomaly alerts
const aiInsightSchema = new mongoose.Schema({
  type:      { type: String, enum: ['anomaly', 'trend', 'alert', 'summary', 'prediction'], required: true },
  severity:  { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  title:     { type: String, required: true, maxlength: 200 },
  message:   { type: String, required: true, maxlength: 2000 },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} }, // Raw numbers behind the insight
  branch:    { type: String, default: null },
  category:  { type: String, default: null },
  date:      { type: String, default: null },  // YYYY-MM-DD
  seen:      { type: Boolean, default: false },
  seenBy:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } // 7 days
}, {
  timestamps: true,
  collection: 'ai_insights'
});

aiInsightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
aiInsightSchema.index({ type: 1, date: 1, branch: 1 });

module.exports = mongoose.model('AiInsight', aiInsightSchema);
