const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
    level: {
        type: String,
        enum: ['info', 'warn', 'error', 'debug', 'security'],
        default: 'info',
        required: true
    },
    type: {
        type: String,
        enum: ['request', 'api', 'system', 'client', 'db', 'auth', 'security'],
        default: 'api'
    },
    message: {
        type: String,
        required: true
    },
    meta: {
        method: String,
        url: String,
        status: Number,
        ip: String,
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        userName: String,
        stack: String, // For errors
        userAgent: String,
        duration: Number, // Response time in ms
        payload: mongoose.Schema.Types.Mixed,
        response: mongoose.Schema.Types.Mixed
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Indexes for common queries
systemLogSchema.index({ level: 1, timestamp: -1 });
systemLogSchema.index({ type: 1, timestamp: -1 });
systemLogSchema.index({ 'meta.url': 1 });
systemLogSchema.index({ 'meta.userId': 1 });

// Static method to log easily
systemLogSchema.statics.log = async function (level, message, type = 'api', meta = {}) {
    try {
        const log = new this({
            level,
            message,
            type,
            meta
        });
        await log.save();
        return log;
    } catch (err) {
        console.error('CRITICAL: Failed to save system log to DB:', err.message);
        // Fallback to console if DB fails
        console.log(`[FALLBACK-${level.toUpperCase()}] ${message}`, meta);
    }
};

module.exports = mongoose.model('SystemLog', systemLogSchema);
