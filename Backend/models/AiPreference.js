const mongoose = require('mongoose');

// Preferences are intentionally limited to presentation and conversation choices.
// Model/provider configuration stays server-admin controlled via environment variables.
const aiPreferenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  voiceReplies: { type: Boolean, default: false },
  theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
  language: { type: String, trim: true, maxlength: 20, default: 'en-US' }
}, { timestamps: true });

module.exports = mongoose.model('AiPreference', aiPreferenceSchema);
