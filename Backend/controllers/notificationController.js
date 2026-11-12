const asyncHandler = require('../middleware/async');
const Notification = require('../models/Notification');

// @desc    Get current user's notifications
// @route   GET /api/v1/notifications
// @access  Private
exports.getNotifications = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const query = { recipient: req.user._id };

    // Filter by read status
    if (req.query.isRead !== undefined) {
        query.isRead = req.query.isRead === 'true';
    }

    // Filter by type
    if (req.query.type) {
        query.type = req.query.type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(query)
            .populate('createdBy', 'name')
            .populate('relatedFile', 'title originalFilename expiresAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Notification.countDocuments(query),
        Notification.countDocuments({ recipient: req.user._id, isRead: false })
    ]);

    res.status(200).json({
        success: true,
        count: notifications.length,
        total,
        unreadCount,
        page,
        totalPages: Math.ceil(total / limit),
        data: notifications
    });
});

// @desc    Get unread notification count
// @route   GET /api/v1/notifications/unread-count
// @access  Private
exports.getUnreadCount = asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({
        recipient: req.user._id,
        isRead: false
    });

    res.status(200).json({ success: true, count });
});

// @desc    Mark a notification as read
// @route   PUT /api/v1/notifications/:id/read
// @access  Private
exports.markAsRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findOne({
        _id: req.params.id,
        recipient: req.user._id
    });

    if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({ success: true, data: notification });
});

// @desc    Mark all notifications as read
// @route   PUT /api/v1/notifications/read-all
// @access  Private
exports.markAllAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { recipient: req.user._id, isRead: false },
        { $set: { isRead: true } }
    );

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
});

// @desc    Delete a notification
// @route   DELETE /api/v1/notifications/:id
// @access  Private
exports.deleteNotification = asyncHandler(async (req, res) => {
    const notification = await Notification.findOne({
        _id: req.params.id,
        recipient: req.user._id
    });

    if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await Notification.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'Notification deleted' });
});
