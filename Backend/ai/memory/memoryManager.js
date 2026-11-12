const config = require('../config');

class MemoryManager {
  constructor() { this.store = new Map(); }
  key(userId, conversationId) { return `${userId}:${conversationId || 'default'}`; }
  recall(userId, conversationId) {
    const memory = this.store.get(this.key(userId, conversationId));
    return memory ? [...memory.messages] : [];
  }
  remember(userId, conversationId, userText, answer) {
    const key = this.key(userId, conversationId);
    const previous = this.store.get(key)?.messages || [];
    // Bounded rolling summary: retain only the latest useful exchange, never raw tool output.
    const messages = [...previous, { role: 'user', content: userText }, { role: 'assistant', content: answer }]
      .slice(-(config.historyTurns * 2));
    this.store.set(key, { messages, updatedAt: Date.now() });
  }
  clearUser(userId) {
    const prefix = `${userId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}
module.exports = new MemoryManager();
