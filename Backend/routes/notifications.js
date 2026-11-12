const express = require('express');
const {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification
} = require('../controllers/notificationController');

const router = express.Router({ mergeParams: true });

const { protect } = require('../middleware/auth');

// All routes require authentication (no specific permission — users see their own notifications)
router.use(protect);

// Unread count (must be before /:id to avoid route conflict)
router.get('/unread-count', getUnreadCount);

// Mark all as read
router.put('/read-all', markAllAsRead);

// List notifications
router
    .route('/')
    .get(getNotifications);

// Single notification actions
router
    .route('/:id')
    .delete(deleteNotification);

router.put('/:id/read', markAsRead);

module.exports = router;
