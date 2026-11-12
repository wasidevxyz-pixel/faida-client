const cron = require('node-cron');
const Settings = require('../models/Settings');
const { createBackup, cleanOldBackups, compressBackupToZip, deleteZipBackup } = require('../utils/backupUtils');
const megaCloudService = require('./megaCloudService');
const backupEventService = require('./backupEventService');
const fs = require('fs').promises;
const path = require('path');

let backupTask = null;

/**
 * Initialize cron jobs
 * NOTE: Must use exports.xxx() not this.xxx() — arrow functions have no 'this' context
 */
exports.init = async () => {
    try {
        console.log('[CRON] Initializing cron services...');
        
        // 1. Check for missed backup (Catch-up)
        // If the server was down at the scheduled time, run it now
        await exports.checkAndRunMissedBackup();

        // 2. Start scheduled job
        await exports.startBackupJob();
    } catch (error) {
        console.error('[CRON] Cron service init error:', error);
    }
};

/**
 * Upload a backup folder to Mega as a ZIP file, updating Settings and cleaning up
 * @param {string} backupFolder - Name of the backup folder (e.g., backup-auto-2026-09-04)
 * @param {string} backupFolderPath - Base path of the backups directory
 * @param {Object} currentSettings - Current Settings mongoose document
 * @returns {Promise<Object>} Upload result
 */
exports.uploadBackupFolderToMega = async (backupFolder, backupFolderPath, currentSettings) => {
    const isMegaConfigured = (currentSettings.megaEnabled || currentSettings.megaUploadEnabled) && currentSettings.megaEmail && currentSettings.megaPassword;
    if (!isMegaConfigured) {
        console.log('[MEGA-UPLOAD] Mega upload not enabled or credentials missing. Skipping.');
        return { skipped: true };
    }

    console.log(`[MEGA-UPLOAD] 🌐 Starting Mega upload for: ${backupFolder}`);
    backupEventService.onMegaUploadStart();

    let compressionResult = null;
    try {
        // 1. Compress backup to ZIP
        compressionResult = await compressBackupToZip(backupFolderPath, backupFolder);
        console.log(`[MEGA-UPLOAD] 📦 Compression complete: ${compressionResult.compressedSizeFormatted}`);

        // 2. Decrypt Mega credentials
        let megaPassword;
        try {
            megaPassword = megaCloudService.constructor.decrypt(currentSettings.megaPassword);
        } catch (e) {
            megaPassword = currentSettings.megaPassword;
        }

        // 3. Authenticate with Mega
        const megaAuth = await megaCloudService.authenticate(
            currentSettings.megaEmail,
            megaPassword
        );

        if (!megaAuth) {
            throw new Error('Failed to authenticate with Mega: ' + (megaCloudService.getStatus().lastAuthError || 'Invalid credentials'));
        }

        // 4. Upload ZIP to Mega
        const uploadResult = await megaCloudService.uploadBackup(
            compressionResult.zipPath,
            currentSettings.megaBackupFolderName || 'BAS_Backups'
        );

        console.log(`[MEGA-UPLOAD] ✅ Upload to Mega successful: ${uploadResult.fileName}`);

        // EMIT: MEGA upload success event
        backupEventService.onMegaUploadSuccess(
            uploadResult.fileName,
            uploadResult.fileSizeFormatted || uploadResult.fileSize
        );

        // Update Mega stats in DB
        currentSettings.lastMegaUploadDate = new Date();
        currentSettings.lastMegaUploadStatus = 'success';
        currentSettings.lastMegaUploadError = null;
        currentSettings.megaUploadStats = {
            totalUploaded: (currentSettings.megaUploadStats?.totalUploaded || 0) + 1,
            totalUploadedSize: (currentSettings.megaUploadStats?.totalUploadedSize || 0) + uploadResult.fileSize,
            lastUploadSize: uploadResult.fileSize
        };
        await currentSettings.save();

        // Disconnect from Mega
        megaCloudService.disconnect();

        // 5. Delete temporary ZIP file
        try {
            await deleteZipBackup(compressionResult.zipPath);
            console.log('[MEGA-UPLOAD] 🗑️ Cleaned up temporary ZIP file');
        } catch (err) {
            console.warn('[MEGA-UPLOAD] Warning: Could not delete temporary ZIP:', err.message);
        }

        // 6. Clean up old local backups based on retention days
        if (currentSettings.keepLocalBackupDays >= 0) {
            const localCleanup = await cleanOldBackups(
                backupFolderPath,
                currentSettings.keepLocalBackupDays
            );
            console.log(`[MEGA-UPLOAD] 🧹 Retention: ${localCleanup.message}`);
        }

        return { success: true, fileName: uploadResult.fileName, fileSize: uploadResult.fileSize };

    } catch (megaErr) {
        console.error('[MEGA-UPLOAD] ❌ Mega upload failed:', megaErr.message);

        backupEventService.onError('MEGA upload failed: ' + megaErr.message, megaErr);

        currentSettings.lastMegaUploadStatus = 'failed';
        currentSettings.lastMegaUploadError = megaErr.message;
        currentSettings.lastMegaUploadDate = new Date();
        await currentSettings.save();

        megaCloudService.disconnect();

        // Clean up temp zip if it exists
        if (compressionResult && compressionResult.zipPath) {
            try {
                await deleteZipBackup(compressionResult.zipPath);
            } catch (ignore) {}
        }

        throw megaErr;
    }
};

/**
 * Check if the backup for today was missed and run it if necessary
 */
exports.checkAndRunMissedBackup = async () => {
    try {
        const settings = await Settings.findOne({});
        if (!settings || !settings.autoBackupEnabled || !settings.autoBackupTime) return;

        console.log('[CRON] Checking for missed backups on startup...');

        const parts = settings.autoBackupTime.split(':');
        const scheduledHours = parseInt(parts[0], 10);
        const scheduledMinutes = parseInt(parts[1], 10);

        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();

        // Check if we are past the scheduled time today
        const isPastScheduledTime = (currentHours > scheduledHours) || (currentHours === scheduledHours && currentMinutes >= scheduledMinutes);

        if (isPastScheduledTime) {
            console.log(`[CRON] Past scheduled time (${settings.autoBackupTime}). Checking if today's backup exists...`);
            const backupConfig = {
                mongodbUri: process.env.MONGO_URI || settings.mongodbUri || 'mongodb://127.0.0.1:27017/BAS-SOFTWARE',
                backupFolderPath: settings.backupFolderPath || './backups',
                mongoToolsPath: settings.mongoToolsPath || '',
                type: 'auto'
            };

            // createBackup checks for existence
            const result = await createBackup(backupConfig);
            
            if (result.message !== 'Daily backup already exists') {
                console.log(`[CRON] Catch-up backup executed: ${result.backupFolder}`);
                
                settings.lastBackupDate = result.timestamp || new Date();
                await settings.save();

                // EMIT: Backup completed event
                backupEventService.onBackupComplete(result.backupFolder, result.backupSize || '0 B');

                // AUTO-UPLOAD TO MEGA if enabled
                const isMegaCatchupActive = (settings.megaEnabled || settings.megaUploadEnabled) && settings.megaEmail && settings.megaPassword;
                if (isMegaCatchupActive) {
                    try {
                        console.log('[CRON] Auto-uploading catch-up backup to Mega...');
                        await exports.uploadBackupFolderToMega(result.backupFolder, backupConfig.backupFolderPath, settings);
                    } catch (uploadErr) {
                        console.error('[CRON] Mega catch-up upload error:', uploadErr.message);
                    }
                }
            } else {
                console.log('[CRON] ✓ Today\'s backup already exists.');

                // Check if Mega upload was missed for today's backup
                const isUploadedToday = settings.lastMegaUploadDate &&
                    new Date(settings.lastMegaUploadDate).toDateString() === new Date().toDateString() &&
                    settings.lastMegaUploadStatus === 'success';

                const isMegaPendingActive = (settings.megaEnabled || settings.megaUploadEnabled) && settings.megaEmail && settings.megaPassword;
                if (isMegaPendingActive && !isUploadedToday) {
                    console.log(`[CRON] Today's backup exists locally but pending Mega cloud sync. Starting upload...`);
                    try {
                        await exports.uploadBackupFolderToMega(result.backupFolder, backupConfig.backupFolderPath, settings);
                    } catch (uploadErr) {
                        console.error('[CRON] Pending Mega sync error:', uploadErr.message);
                    }
                }
            }
        } else {
            console.log(`[CRON] Scheduled backup will run at ${settings.autoBackupTime}.`);
        }
    } catch (error) {
        console.error('[CRON] Missed backup check failed:', error);
    }
};

/**
 * Start or restart the backup job based on settings
 * Runs EVERY day (Mon–Sun) at the configured time — 7 days a week
 */
exports.startBackupJob = async () => {
    try {
        // Stop existing task before creating a new one
        if (backupTask) {
            backupTask.stop();
            backupTask = null;
            console.log('[CRON] Previous backup task stopped.');
        }

        const settings = await Settings.findOne({});

        if (!settings || !settings.autoBackupEnabled) {
            console.log('[CRON] Automated backup is disabled. No cron job started.');
            return;
        }

        if (!settings.autoBackupTime) {
            console.log('[CRON] No backup time configured. Skipping cron setup.');
            return;
        }

        // Parse time string (HH:mm format, e.g. "03:00")
        const parts = settings.autoBackupTime.split(':');
        const hours   = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);

        if (isNaN(hours) || isNaN(minutes)) {
            console.error(`[CRON] Invalid autoBackupTime format: "${settings.autoBackupTime}". Expected HH:mm`);
            return;
        }

        // Cron: "minute hour * * *" runs every single day (7 days/week)
        const schedule = `${minutes} ${hours} * * *`;

        console.log(`[CRON] ✓ Scheduled daily backup at ${settings.autoBackupTime} (7 days/week). Cron: "${schedule}"`);

        backupTask = cron.schedule(schedule, async () => {
            const now = new Date();
            console.log(`[AUTO-BACKUP] ⏰ Cron fired at ${now.toLocaleString()} — Starting backup...`);

            // EMIT: Backup started event
            backupEventService.onBackupStart('auto');

            try {
                // Re-fetch settings fresh on every run
                const currentSettings = await Settings.findOne({});

                if (!currentSettings || !currentSettings.autoBackupEnabled) {
                    console.log('[AUTO-BACKUP] Backup disabled in settings, skipping run.');
                    return;
                }

                // CRITICAL FIX: Ensure auto-backups use the same URI priority as manual backups
                const mongodbUri = process.env.MONGO_URI || currentSettings.mongodbUri || 'mongodb://127.0.0.1:27017/BAS-SOFTWARE';
                const backupFolderPath = currentSettings.backupFolderPath || './backups';

                console.log(`[AUTO-BACKUP] Creating daily dump from: ${mongodbUri.replace(/\/\/.*@/, '//****@')}`);

                const backupConfig = {
                    mongodbUri:       mongodbUri,
                    backupFolderPath: backupFolderPath,
                    mongoToolsPath:   currentSettings.mongoToolsPath   || '',
                    type: 'auto'
                };

                const result = await createBackup(backupConfig);

                // Update settings with last backup date
                currentSettings.lastBackupDate = result.timestamp || new Date();
                
                // Sync URI in settings if needed
                if (mongodbUri !== currentSettings.mongodbUri) {
                    currentSettings.mongodbUri = mongodbUri;
                }
                
                await currentSettings.save();

                // EMIT: Backup completed event
                const backupSize = result.backupSize || '0 B';
                backupEventService.onBackupComplete(result.backupFolder, backupSize);

                console.log(`[AUTO-BACKUP] ✅ Backup created: ${result.backupFolder}`);

                // ===== MEGA CLOUD UPLOAD =====
                const isMegaCronActive = (currentSettings.megaEnabled || currentSettings.megaUploadEnabled) && currentSettings.megaEmail && currentSettings.megaPassword;
                if (isMegaCronActive) {
                    try {
                        await exports.uploadBackupFolderToMega(
                            result.backupFolder,
                            backupFolderPath,
                            currentSettings
                        );
                    } catch (megaErr) {
                        console.error('[AUTO-BACKUP] Scheduled Mega upload error:', megaErr.message);
                        if (currentSettings.backupRetentionDays && currentSettings.backupRetentionDays > 0) {
                            const cleanup = await cleanOldBackups(backupConfig.backupFolderPath, currentSettings.backupRetentionDays);
                            console.log(`[AUTO-BACKUP] 🧹 Cleanup: ${cleanup.message}`);
                        }
                    }
                } else {
                    // Mega not enabled, just do local cleanup
                    if (currentSettings.backupRetentionDays && currentSettings.backupRetentionDays > 0) {
                        const cleanup = await cleanOldBackups(backupConfig.backupFolderPath, currentSettings.backupRetentionDays);
                        console.log(`[AUTO-BACKUP] 🧹 Cleanup: ${cleanup.message}`);
                    }
                }

                await currentSettings.save();

            } catch (err) {
                console.error('[AUTO-BACKUP] Scheduled backup failed:', err.message || err);
            }
        });

        backupTask.start();
        console.log('[CRON] ✓ Backup cron task is now active for 7 days/week.');

    } catch (error) {
        console.error('[CRON] Error starting backup job:', error);
    }
};

/**
 * Update the backup schedule (called when settings change via UI)
 */
exports.updateSchedule = async () => {
    console.log('[CRON] updateSchedule called — restarting backup job with new settings...');
    await exports.startBackupJob();
};
