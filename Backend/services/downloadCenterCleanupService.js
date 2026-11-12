const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '../uploads/download-center');
const BATCH_SIZE = 50; // Delete files in batches to avoid I/O spikes

let cleanupTask = null;

/**
 * Initialize the Download Center cleanup cron job.
 * Runs every 12 hours (at 12:00 AM and 12:00 PM).
 * Also performs a catch-up cleanup on startup for any expired files.
 */
exports.init = async () => {
    try {
        console.log('[DOWNLOAD-CENTER] Initializing cleanup scheduler...');

        // 1. Catch-up cleanup on startup (in case server was down during scheduled run)
        await exports.runCleanup();

        // Align files created by older versions to the next shared cleanup boundary.
        const DownloadCenterFile = require('../models/DownloadCenterFile');
        await DownloadCenterFile.updateMany(
            { isActive: true },
            { $set: { expiresAt: exports.getNextCleanupTime() } }
        );

        // 2. Schedule recurring cleanup every 12 hours
        cleanupTask = cron.schedule('0 */12 * * *', async () => {
            console.log('[DOWNLOAD-CENTER-CLEANUP] Scheduled 12-hour cleanup triggered.');
            await exports.runCleanup({ clearAll: true });
        }, { scheduled: true });

        console.log('[DOWNLOAD-CENTER] Cleanup scheduler initialized. Next run at the next 12h mark.');
    } catch (error) {
        console.error('[DOWNLOAD-CENTER] Cleanup scheduler init error:', error.message);
    }
};

/**
 * Run the actual cleanup process.
 * 1. Find expired DB records
 * 2. Delete physical files from disk (batched)
 * 3. Remove DB records
 * 4. Clear old notifications
 */
exports.runCleanup = async ({ clearAll = false } = {}) => {
    const startTime = Date.now();
    let filesDeleted = 0;
    let bytesFreed = 0;
    let dbRecordsRemoved = 0;
    let notificationsCleared = 0;

    try {
        // Lazy-load models to avoid circular dependency issues at startup
        const DownloadCenterFile = require('../models/DownloadCenterFile');
        const Notification = require('../models/Notification');

        const now = new Date();

        // --- Step 1: Find all expired file records ---
        const cleanupQuery = clearAll
            ? { isActive: true }
            : { expiresAt: { $lte: now } };
        const expiredFiles = await DownloadCenterFile.find(cleanupQuery)
            .select('filePath storedFilename fileSize')
            .lean();

        if (expiredFiles.length === 0) {
            // Also check for orphaned files on disk that have no DB record
            await exports.cleanOrphanedFiles();
            console.log('[DOWNLOAD-CENTER-CLEANUP] No expired files found. Cleanup skipped.');
            return;
        }

        console.log(`[DOWNLOAD-CENTER-CLEANUP] Found ${expiredFiles.length} expired files. Starting cleanup...`);

        // --- Step 2: Delete physical files from disk (batched) ---
        for (let i = 0; i < expiredFiles.length; i += BATCH_SIZE) {
            const batch = expiredFiles.slice(i, i + BATCH_SIZE);
            const deleteResults = await Promise.allSettled(
                batch.map(async (file) => {
                    try {
                        await fs.unlink(file.filePath);
                        filesDeleted++;
                        bytesFreed += file.fileSize || 0;
                    } catch (err) {
                        if (err.code === 'ENOENT') {
                            // File already gone from disk — that's fine
                            filesDeleted++;
                        } else {
                            console.warn(`[DOWNLOAD-CENTER-CLEANUP] Failed to delete file: ${file.storedFilename}`, err.message);
                        }
                    }
                })
            );
        }

        // --- Step 3: Remove expired DB records (single atomic operation) ---
        const dbResult = await DownloadCenterFile.deleteMany(cleanupQuery);
        dbRecordsRemoved = dbResult.deletedCount || 0;

        // --- Step 4: Clear old notifications (older than 24 hours) ---
        const notifCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const notifResult = await Notification.deleteMany({
            type: 'download_center',
            createdAt: { $lte: notifCutoff }
        });
        notificationsCleared = notifResult.deletedCount || 0;

        // --- Step 5: Clean orphaned files ---
        await exports.cleanOrphanedFiles();

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        const mbFreed = (bytesFreed / (1024 * 1024)).toFixed(2);

        console.log(`[DOWNLOAD-CENTER-CLEANUP] ✅ Cleanup complete in ${elapsed}s`);
        console.log(`[DOWNLOAD-CENTER-CLEANUP]    Files deleted: ${filesDeleted}`);
        console.log(`[DOWNLOAD-CENTER-CLEANUP]    DB records removed: ${dbRecordsRemoved}`);
        console.log(`[DOWNLOAD-CENTER-CLEANUP]    Notifications cleared: ${notificationsCleared}`);
        console.log(`[DOWNLOAD-CENTER-CLEANUP]    Disk space freed: ${mbFreed} MB`);
    } catch (error) {
        console.error('[DOWNLOAD-CENTER-CLEANUP] ❌ Cleanup error (non-fatal):', error.message);
        // Never crash — just log and continue
    }
};

/**
 * Clean orphaned files on disk that have no corresponding DB record.
 * This handles edge cases where DB delete succeeded but file delete failed previously.
 */
exports.cleanOrphanedFiles = async () => {
    try {
        // Ensure the upload directory exists
        try {
            await fs.access(UPLOAD_DIR);
        } catch {
            // Directory doesn't exist yet — nothing to clean
            return;
        }

        const DownloadCenterFile = require('../models/DownloadCenterFile');
        const filesOnDisk = await fs.readdir(UPLOAD_DIR);

        if (filesOnDisk.length === 0) return;

        // Get all stored filenames from DB
        const dbFiles = await DownloadCenterFile.find({}).select('storedFilename').lean();
        const dbFilenameSet = new Set(dbFiles.map(f => f.storedFilename));

        let orphansRemoved = 0;
        for (const filename of filesOnDisk) {
            if (!dbFilenameSet.has(filename)) {
                try {
                    await fs.unlink(path.join(UPLOAD_DIR, filename));
                    orphansRemoved++;
                } catch (err) {
                    // Skip if can't delete
                }
            }
        }

        if (orphansRemoved > 0) {
            console.log(`[DOWNLOAD-CENTER-CLEANUP] Removed ${orphansRemoved} orphaned files from disk.`);
        }
    } catch (error) {
        // Non-fatal — just log
        console.warn('[DOWNLOAD-CENTER-CLEANUP] Orphan cleanup warning:', error.message);
    }
};

/**
 * Get the next scheduled cleanup time (for frontend countdown timer).
 */
exports.getNextCleanupTime = () => {
    const now = new Date();
    const hours = now.getHours();
    const nextHour = hours < 12 ? 12 : 24; // Next 12:00 or 00:00
    const next = new Date(now);
    next.setHours(nextHour, 0, 0, 0);
    if (nextHour === 24) {
        next.setDate(next.getDate() + 1);
        next.setHours(0, 0, 0, 0);
    }
    return next;
};

/**
 * Stop the cleanup cron (for graceful shutdown).
 */
exports.stop = () => {
    if (cleanupTask) {
        cleanupTask.stop();
        cleanupTask = null;
        console.log('[DOWNLOAD-CENTER] Cleanup scheduler stopped.');
    }
};
