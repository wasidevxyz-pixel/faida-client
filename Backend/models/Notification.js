const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Notification recipient is required']
    },
    type: {
        type: String,
        enum: ['download_center', 'system', 'alert'],
        default: 'download_center'
    },
    title: {
        type: String,
        required: [true, 'Notification title is required'],
        trim: true,
        maxlength: [200, 'Title cannot be more than 200 characters']
    },
    message: {
        type: String,
        trim: true,
        maxlength: [500, 'Message cannot be more than 500 characters']
    },
    link: {
        type: String,
        default: '/download-center'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    relatedFile: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DownloadCenterFile'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 }); // User's unread notifications
notificationSchema.index({ createdAt: 1 }); // Cleanup old notifications

module.exports = mongoose.model('Notification', notificationSchema);
