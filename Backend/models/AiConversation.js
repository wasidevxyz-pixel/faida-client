'use strict';
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role:    { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true, maxlength: 20000 }
}, { _id: false });

const aiConversationSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  conversationId: { type: String, required: true, default: 'default', maxlength: 100 },
  messages:       { type: [messageSchema], default: [] },
  summary:        { type: String, default: '', maxlength: 5000 }, // Compressed older context
  messageCount:   { type: Number, default: 0 },
  lastActiveAt:   { type: Date, default: Date.now },
  // User preferences learned over time
  preferences: {
    preferredLanguage: { type: String, default: 'roman_urdu' }, // roman_urdu | english | urdu
    preferredReportFormat: { type: String, default: 'branch_category' },
    frequentBranches:  { type: [String], default: [] },
    frequentQueries:   { type: [String], default: [] }
  }
}, {
  timestamps: true,
  collection: 'ai_conversations'
});

aiConversationSchema.index({ user: 1, conversationId: 1 }, { unique: true });
// Auto-expire conversations after 30 days of inactivity
aiConversationSchema.index({ lastActiveAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('AiConversation', aiConversationSchema);
