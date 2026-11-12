'use strict';

/**
 * Persistent Memory Manager — Level 1 Intelligence
 *
 * Stores conversation history in MongoDB so memory survives server restarts.
 * Keeps last 20 messages in full, then compresses older context into a summary.
 * Also tracks user preferences (language, frequent branches, common queries).
 */

const AiConversation = require('../../models/AiConversation');

const MAX_FULL_MESSAGES  = 20;  // Keep last 20 messages verbatim
const MAX_SUMMARY_LENGTH = 2000; // Max chars for compressed older context

/**
 * Load conversation history for a user+session.
 * Returns array of {role, content} messages ready to prepend to LLM call.
 */
async function recall(userId, conversationId = 'default') {
  try {
    const doc = await AiConversation.findOne({ user: userId, conversationId }).lean();
    if (!doc) return [];
    const messages = doc.messages || [];
    // If there is a compressed summary of older context, prepend it as a system message
    if (doc.summary && doc.summary.trim()) {
      return [
        { role: 'system', content: `Previous conversation summary: ${doc.summary}` },
        ...messages
      ];
    }
    return messages;
  } catch {
    return []; // Never crash the main flow due to memory errors
  }
}

/**
 * Save a user+assistant exchange to persistent memory.
 * Automatically compresses older messages into a summary when limit is reached.
 */
async function remember(userId, conversationId = 'default', userText, assistantAnswer) {
  try {
    const doc = await AiConversation.findOne({ user: userId, conversationId });
    const existing = doc ? (doc.messages || []) : [];

    const newMessages = [
      ...existing,
      { role: 'user',      content: String(userText).slice(0, 5000) },
      { role: 'assistant', content: String(assistantAnswer).slice(0, 5000) }
    ];

    let summary = doc ? (doc.summary || '') : '';
    let trimmed = newMessages;

    // When messages exceed limit, compress oldest half into summary
    if (newMessages.length > MAX_FULL_MESSAGES) {
      const toCompress = newMessages.slice(0, newMessages.length - MAX_FULL_MESSAGES);
      const compressedText = toCompress
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'user' ? 'User' : 'Amey'}: ${m.content}`)
        .join('\n');
      // Append to existing summary, keeping within limit
      summary = (summary + '\n' + compressedText).slice(-MAX_SUMMARY_LENGTH).trim();
      trimmed = newMessages.slice(-MAX_FULL_MESSAGES);
    }

    // Track frequent branches and queries for personalization
    const branches = extractBranches(userText);
    const queryType = detectQueryType(userText);

    await AiConversation.findOneAndUpdate(
      { user: userId, conversationId },
      {
        $set: {
          messages:     trimmed,
          summary,
          lastActiveAt: new Date()
        },
        $inc: { messageCount: 1 },
        $addToSet: {
          'preferences.frequentBranches': { $each: branches.slice(0, 3) }
        },
        $setOnInsert: {
          user: userId,
          conversationId,
          'preferences.preferredLanguage':    'roman_urdu',
          'preferences.preferredReportFormat': 'branch_category',
          'preferences.frequentQueries':       []
        }
      },
      { upsert: true, new: true }
    );

    // Also update preferred language based on message content
    if (isRomanUrdu(userText)) {
      await AiConversation.updateOne(
        { user: userId, conversationId },
        { $set: { 'preferences.preferredLanguage': 'roman_urdu' } }
      );
    }

    if (queryType) {
      await AiConversation.updateOne(
        { user: userId, conversationId },
        { $addToSet: { 'preferences.frequentQueries': queryType } }
      );
    }
  } catch {
    // Never crash main flow
  }
}

/**
 * Get learned preferences for a user (for personalizing responses).
 */
async function getPreferences(userId) {
  try {
    const docs = await AiConversation.find({ user: userId })
      .sort({ lastActiveAt: -1 })
      .limit(1)
      .select('preferences')
      .lean();
    return docs[0]?.preferences || null;
  } catch {
    return null;
  }
}

/**
 * Clear all memory for a user (e.g. on logout or user request).
 */
async function clearUser(userId) {
  try {
    await AiConversation.deleteMany({ user: userId });
  } catch { /* ignore */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractBranches(text) {
  const matches = String(text).match(/\b[A-Z]{2,8}-\d+\b/g) || [];
  return [...new Set(matches)];
}

function isRomanUrdu(text) {
  return /\b(kal|aaj|sale|tankhwa|hazri|batao|dikao|bata|dena|karo|kya|hai|hain|mujhe|ap|aap|ki|ka|ke|ko)\b/i.test(text);
}

function detectQueryType(text) {
  const t = text.toLowerCase();
  if (/sale|sales|bikri/.test(t)) return 'sales';
  if (/payment|payment report/.test(t)) return 'payment';
  if (/attendance|hazri|check.?in/.test(t)) return 'attendance';
  if (/salary|tankhwa|payroll/.test(t)) return 'salary';
  if (/stock|inventory|maal/.test(t)) return 'stock';
  if (/customer|balance/.test(t)) return 'customer';
  return null;
}

module.exports = { recall, remember, getPreferences, clearUser };
