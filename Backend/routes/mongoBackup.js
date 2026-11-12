const express = require('express');
const router = express.Router();
const {
    manualBackup,
    restoreFromBackup,
    getBackupInformation,
    getAvailableBackups,
    deleteBackupFolder,
    updateBackupSettings,
    testMegaConnection,
    updateMegaSettings,
    getMegaStatus,
    listMegaFiles,
    uploadBackupToMega,
    restoreFromMega,
    streamBackupEvents,
    getBackupQueue
} = require('../controllers/mongoBackupController');
const { protect, adminAccess } = require('../middleware/auth');
const { verifyApiKey } = require('../middleware/apiAuth');

/**
 * MongoDB Backup Routes
 * All routes require authentication and admin access
 * Supports standard JWT session as well as system API secret key (bas-secret-key)
 */
router.use(verifyApiKey);

// Manual backup creation
router.post('/manual', protect, adminAccess, manualBackup);

// Restore from backup
router.post('/restore', protect, adminAccess, restoreFromBackup);

// Get backup information
router.get('/info', protect, adminAccess, getBackupInformation);

// Get list of available backups
router.get('/list', protect, adminAccess, getAvailableBackups);

// Delete specific backup
router.delete('/:foldername', protect, adminAccess, deleteBackupFolder);

// Update backup settings
router.put('/settings', protect, adminAccess, updateBackupSettings);

/**
 * Mega Cloud Backup Routes
 */

// Test Mega connection
router.post('/mega/test', protect, adminAccess, testMegaConnection);

// Get Mega settings / status
router.get('/mega/settings', protect, adminAccess, getMegaStatus);

// Update Mega settings
router.put('/mega/settings', protect, adminAccess, updateMegaSettings);

// Get Mega status
router.get('/mega/status', protect, adminAccess, getMegaStatus);

// List files in Mega
router.get('/mega/files', protect, adminAccess, listMegaFiles);

// Manually upload backup to Mega
router.post('/mega/upload/:backupFolder', protect, adminAccess, uploadBackupToMega);

// Restore backup directly from Mega Cloud
router.post('/mega/restore', protect, adminAccess, restoreFromMega);

/**
 * Backup Events (Real-time notifications)
 */

// Stream backup events via SSE
router.get('/events/stream', protect, adminAccess, streamBackupEvents);

// Get backup queue history
router.get('/events/queue', protect, adminAccess, getBackupQueue);

module.exports = router;
