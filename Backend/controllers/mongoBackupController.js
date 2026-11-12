const Settings = require('../models/Settings');
const {
    resolveBackupFolderPath,
    createBackup,
    restoreBackup,
    getBackupsList,
    getBackupInfo,
    deleteBackup,
    cleanOldBackups,
    compressBackupToZip,
    deleteZipBackup,
    extractZipArchive,
    cleanupTempDirectory
} = require('../utils/backupUtils');
const megaCloudService = require('../services/megaCloudService');
// Safely import cronService
let cronService;
try {
    cronService = require('../services/cronService');
} catch (err) {
    console.warn('cronService not found, automated backups will not run.');
}

/**
 * MongoDB Backup Controller
 * Handles mongodump and mongorestore operations
 */

/**
 * @desc    Create manual MongoDB backup using mongodump
 * @route   POST /api/v1/mongodb-backup/manual
 * @access  Private/Admin
 */
exports.manualBackup = async (req, res) => {
    try {
        // Get settings
        const settings = await Settings.findOne({});

        if (!settings) {
            return res.status(400).json({
                success: false,
                message: 'Settings not found. Please configure backup settings first.'
            });
        }

        // Prepare backup configuration
        const mongodbUri = process.env.MONGO_URI || settings.mongodbUri || 'mongodb://127.0.0.1:27017/BAS-SOFTWARE';
        const backupFolderPath = settings.backupFolderPath || './backups';
        const mongoToolsPath = settings.mongoToolsPath || '';

        console.log(`\n📦 [BACKUP] Starting manual backup from: ${mongodbUri.replace(/\/\/.*@/, '//****@')}`);
        console.log(`📂 [BACKUP] Target Folder: ${backupFolderPath}`);

        const backupConfig = {
            mongodbUri,
            backupFolderPath,
            mongoToolsPath,
            type: 'manual'
        };

        // ── RESPOND IMMEDIATELY so Cloudflare doesn't 524 ──────────────────
        const backupEventService = require('../services/backupEventService');
        backupEventService.onBackupStart('manual');

        res.status(200).json({
            success: true,
            message: 'Manual backup started in background. Saving local copy and syncing with Mega...',
            data: { status: 'in_progress' }
        });

        // ── RUN BACKUP IN BACKGROUND ────────────────────────────────────────
        setImmediate(async () => {
            try {
                const result = await createBackup(backupConfig);

                settings.lastBackupDate = result.timestamp;
                if (mongodbUri !== settings.mongodbUri) {
                    settings.mongodbUri = mongodbUri;
                }
                await settings.save();

                console.log(`✅ [BACKUP] Success: ${result.backupFolder}`);
                backupEventService.onBackupComplete(result.backupFolder, result.backupSize || '0 B');

                // AUTO-UPLOAD TO MEGA if enabled (1 local copy + 1 Mega ZIP upload)
                const freshSettings = await Settings.findOne({}) || settings;
                const isMegaActive = (freshSettings.megaEnabled || freshSettings.megaUploadEnabled) && freshSettings.megaEmail && freshSettings.megaPassword;
                if (isMegaActive) {
                    try {
                        console.log(`[MANUAL-BACKUP] ☁️ Triggering automated Mega upload for: ${result.backupFolder}`);
                        const cron = require('../services/cronService');
                        await cron.uploadBackupFolderToMega(result.backupFolder, backupFolderPath, freshSettings);
                    } catch (megaErr) {
                        console.error('[MANUAL-BACKUP] ❌ Mega upload failed:', megaErr.message);
                    }
                } else {
                    console.log('[MANUAL-BACKUP] Mega cloud sync not enabled or credentials not configured. Local backup saved.');
                }
            } catch (bgErr) {
                console.error('[MANUAL-BACKUP] ❌ Background backup failed:', bgErr.message);
                backupEventService.onError('Manual backup failed: ' + bgErr.message, bgErr);
            }
        });

    } catch (error) {
        console.error('Manual backup error:', error);
        // Only send error if response not already sent
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: error.message || 'Backup failed' });
        }
    }
};

/**
 * @desc    Restore from MongoDB backup using mongorestore
 * @route   POST /api/v1/mongodb-backup/restore
 * @access  Private/Admin
 */
exports.restoreFromBackup = async (req, res) => {
    console.log('\n' + '='.repeat(70));
    console.log('🔄 RESTORE REQUEST RECEIVED');
    console.log('='.repeat(70));

    try {
        console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));

        const { backupFolder } = req.body;

        if (!backupFolder) {
            console.log('❌ ERROR: No backup folder provided');
            return res.status(400).json({
                success: false,
                message: 'Backup folder name is required'
            });
        }

        console.log('✓ Backup folder:', backupFolder);

        // Get settings
        console.log('📋 Fetching settings from database...');
        const settings = await Settings.findOne({});

        if (!settings) {
            console.log('❌ ERROR: Settings not found in database');
            return res.status(400).json({
                success: false,
                message: 'Settings not found. Please configure backup settings first.'
            });
        }

        // ─────────────────────────────────────────────────────────────────
        // CRITICAL: ALWAYS restore INTO the current environment's local DB.
        // NEVER use the URI stored in the backup's Settings document —
        // that URI points to PRODUCTION and would overwrite the wrong database.
        // Priority: process.env.MONGO_URI (local .env) > fallback
        // ─────────────────────────────────────────────────────────────────
        const currentEnvUri = process.env.MONGO_URI;
        const settingsUri = settings.mongodbUri; // This is the PRODUCTION uri from the backup — DO NOT USE for target
        
        // Always use current environment URI for the restore target
        const mongodbUri = currentEnvUri || 'mongodb://127.0.0.1:27017/BAS-SOFTWARE';

        // Prepare restore configuration
        const restoreConfig = {
            mongodbUri: mongodbUri,
            backupFolderPath: settings.backupFolderPath || './backups',
            mongoToolsPath: settings.mongoToolsPath || '',
            backupFolder: backupFolder
        };

        // Diagnostic Logging
        console.log('\n📝 RESTORE DIAGNOSTICS:');
        console.log(`   - Environment URI (RESTORE TARGET): ${currentEnvUri ? currentEnvUri.replace(/\/\/.*@/, '//****@') : 'NOT SET - using fallback'}`);
        console.log(`   - Settings URI (from backup, NOT used as target): ${settingsUri ? settingsUri.replace(/\/\/.*@/, '//****@') : 'NOT SET'}`);
        console.log(`   - Final Restore URI: ${mongodbUri.replace(/\/\/.*@/, '//****@')}`);
        console.log(`   - Backup Path: ${restoreConfig.backupFolderPath}`);
        
        if (settingsUri && currentEnvUri && currentEnvUri !== settingsUri) {
            console.log('ℹ️ INFO: Different URIs detected (production vs local). Correctly restoring into local environment URI.');
        }

        console.log('\n🚀 Starting restore process...');

        // 1. SAVE CURRENT ADMIN user before restore (Safety Mechanism)
        // This ensures the user doesn't get locked out if the backup is missing the admin account
        const User = require('../models/User');
        let currentAdmin = null;
        try {
            // Get the user triggering the request (or admin@dwatson.pk as fallback)
            const userId = req.user ? req.user.id : null;
            if (userId) {
                currentAdmin = await User.findById(userId).lean();
                console.log(`[SAFETY] Preserving current admin user: ${currentAdmin ? currentAdmin.email : 'Not found'}`);
            }
        } catch (err) {
            console.warn('[SAFETY] Failed to backup current admin user:', err.message);
        }

        // 2. Perform Restore
        const result = await restoreBackup(restoreConfig);

        // 3. RESTORE ADMIN if missing (Safety Mechanism)
        if (currentAdmin) {
            try {
                const checkUser = await User.findOne({ email: currentAdmin.email });
                if (!checkUser) {
                    console.log(`[SAFETY] Admin user ${currentAdmin.email} was lost during restore. Recreating it...`);
                    // Remove _id to let Mongo generate a new one, or keep it if you want strict restoration
                    // We keep the hashed password so they can still log in!
                    const { _id, ...userData } = currentAdmin;
                    await User.create(userData);
                    console.log('[SAFETY] Admin user restored successfully.');
                } else {
                    console.log('[SAFETY] Admin user exists in backup. No action needed.');
                }
            } catch (err) {
                console.error('[SAFETY] Error restoring admin user:', err.message);
            }
        }

        console.log('\n✅ RESTORE SUCCESSFUL!');
        console.log('   - Backup:', result.backupFolder);
        console.log('   - Message:', result.message);
        console.log('='.repeat(70) + '\n');

        res.status(200).json({
            success: true,
            message: result.message,
            data: {
                backupFolder: result.backupFolder,
                timestamp: result.timestamp
            }
        });

    } catch (error) {
        console.log('\n❌ RESTORE FAILED!');
        console.error('Error Type:', error.name);
        console.error('Error Message:', error.message);
        console.error('Stack Trace:', error.stack);
        console.log('='.repeat(70) + '\n');

        res.status(500).json({
            success: false,
            message: error.message || 'Restore failed'
        });
    }
};

/**
 * @desc    Get MongoDB backup information
 * @route   GET /api/v1/mongodb-backup/info
 * @access  Private/Admin
 */
exports.getBackupInformation = async (req, res) => {
    try {
        // Get settings
        const settings = await Settings.findOne({});

        const currentEnvUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/BAS-SOFTWARE';
        const settingsUri = settings?.mongodbUri || currentEnvUri;
        const backupFolderPath = settings?.backupFolderPath || './backups';
        const lastBackupDate = settings?.lastBackupDate || null;

        // Get backup info
        const info = await getBackupInfo(backupFolderPath, lastBackupDate);

        res.status(200).json({
            success: true,
            data: {
                lastBackupDate: info.lastBackupDate,
                backupCount: info.backupCount,
                totalSize: info.totalSize,
                totalSizeFormatted: info.totalSizeFormatted,
                autoBackupEnabled: settings?.autoBackupEnabled || false,
                autoBackupTime: settings?.autoBackupTime || '02:00',
                backupFolderPath: backupFolderPath,
                mongoToolsPath: settings?.mongoToolsPath || '',
                // Diagnostic fields
                activeDatabaseUri: currentEnvUri.replace(/\/\/.*@/, '//****@'),
                settingsDatabaseUri: settingsUri.replace(/\/\/.*@/, '//****@'),
                uriMismatch: currentEnvUri !== settingsUri
            }
        });

    } catch (error) {
        console.error('Get backup info error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get backup information'
        });
    }
};

/**
 * @desc    Get list of available MongoDB backups
 * @route   GET /api/v1/mongodb-backup/list
 * @access  Private/Admin
 */
exports.getAvailableBackups = async (req, res) => {
    try {
        // Get settings
        const settings = await Settings.findOne({});

        const backupFolderPath = settings?.backupFolderPath || './backups';
        const autoBackupTime = settings?.autoBackupTime; // e.g. "03:00"

        // Get backups list
        const backups = await getBackupsList(backupFolderPath, autoBackupTime);

        res.status(200).json({
            success: true,
            data: backups
        });

    } catch (error) {
        console.error('Get backups list error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get backups list'
        });
    }
};

/**
 * @desc    Delete a MongoDB backup
 * @route   DELETE /api/v1/mongodb-backup/:foldername
 * @access  Private/Admin
 */
exports.deleteBackupFolder = async (req, res) => {
    try {
        const { foldername } = req.params;

        if (!foldername) {
            return res.status(400).json({
                success: false,
                message: 'Backup folder name is required'
            });
        }

        // Get settings
        const settings = await Settings.findOne({});

        const backupFolderPath = settings?.backupFolderPath || './backups';

        // Delete backup
        const result = await deleteBackup(backupFolderPath, foldername);

        res.status(200).json({
            success: true,
            message: result.message
        });

    } catch (error) {
        console.error('Delete backup error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete backup'
        });
    }
};

/**
 * @desc    Update MongoDB backup settings
 * @route   PUT /api/v1/mongodb-backup/settings
 * @access  Private/Admin
 */
exports.updateBackupSettings = async (req, res) => {
    try {
        const {
            mongodbUri,
            backupFolderPath,
            mongoToolsPath,
            autoBackupEnabled,
            autoBackupTime
        } = req.body;

        // Get settings
        let settings = await Settings.findOne({});

        if (!settings) {
            return res.status(400).json({
                success: false,
                message: 'Settings not found'
            });
        }

        // Update backup settings
        if (mongodbUri !== undefined) settings.mongodbUri = mongodbUri;
        if (backupFolderPath !== undefined) settings.backupFolderPath = backupFolderPath;
        if (mongoToolsPath !== undefined) settings.mongoToolsPath = mongoToolsPath;
        if (autoBackupEnabled !== undefined) settings.autoBackupEnabled = autoBackupEnabled;
        if (autoBackupTime !== undefined) settings.autoBackupTime = autoBackupTime;

        await settings.save();

        await settings.save();

        // Update cron schedule
        if (cronService && cronService.updateSchedule) {
            await cronService.updateSchedule();
        }

        res.status(200).json({
            success: true,
            message: 'Backup settings updated successfully',
            data: {
                mongodbUri: settings.mongodbUri,
                backupFolderPath: settings.backupFolderPath,
                mongoToolsPath: settings.mongoToolsPath,
                autoBackupEnabled: settings.autoBackupEnabled,
                autoBackupTime: settings.autoBackupTime
            }
        });

    } catch (error) {
        console.error('Update backup settings error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update backup settings'
        });
    }
};

/**
 * @desc    Test Mega cloud connection
 * @route   POST /api/v1/mongodb-backup/mega/test
 * @access  Private/Admin
 */
exports.testMegaConnection = async (req, res) => {
    try {
        let { megaEmail, megaPassword, megaBackupFolderName } = req.body;

        let settings = await Settings.findOne({});
        if (!settings) {
            settings = new Settings();
        }

        // If email not provided, fall back to stored email
        if (!megaEmail && settings.megaEmail) {
            megaEmail = settings.megaEmail;
        }

        // If password not provided or is masked placeholder, fall back to stored password
        if ((!megaPassword || megaPassword === '••••••••••••' || megaPassword.trim() === '') && settings.megaPassword) {
            try {
                megaPassword = megaCloudService.constructor.decrypt(settings.megaPassword);
            } catch (e) {
                megaPassword = settings.megaPassword;
            }
        }

        if (!megaEmail || !megaPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mega email and password are required to test connection'
            });
        }

        const targetFolder = megaBackupFolderName || settings.megaBackupFolderName || 'BAS_Backups';

        console.log('[MEGA-TEST] Testing live connection with:', megaEmail);

        const isConnected = await megaCloudService.authenticate(megaEmail, megaPassword);

        if (!isConnected) {
            const rawError = megaCloudService.getStatus().lastAuthError || 'Invalid credentials';
            let userFriendlyMsg = 'Failed to authenticate with Mega';
            if (rawError.includes('ENOENT') || rawError.includes('-9') || rawError.includes('Object not found') || rawError.includes('Wrong password')) {
                if (megaEmail.includes('148')) {
                    userFriendlyMsg = 'Mega rejected this email (Object not found -9). Did you mean wasitech10@gmail.com?';
                } else {
                    userFriendlyMsg = 'Mega account not found or wrong password (-9). Please verify your email and password.';
                }
            }
            return res.status(401).json({
                success: false,
                message: userFriendlyMsg,
                error: rawError
            });
        }

        // Ensure folder exists and test access
        try {
            await megaCloudService.getOrCreateFolder(targetFolder);
        } catch (err) {
            megaCloudService.disconnect();
            throw new Error(`Cannot access Mega folder "${targetFolder}": ${err.message}`);
        }

        // Get live, authentic account telemetry and storage quota
        let accountDetails = {};
        try {
            accountDetails = await megaCloudService.getAccountDetails(targetFolder);
        } catch (detailErr) {
            console.warn('[MEGA-TEST] Could not fetch account details:', detailErr.message);
        }

        megaCloudService.disconnect();

        // Encrypt password before saving if a real new password was provided
        let encryptedPassword = settings.megaPassword;
        if (req.body.megaPassword && req.body.megaPassword !== '••••••••••••' && req.body.megaPassword.trim() !== '') {
            try {
                encryptedPassword = megaCloudService.constructor.encrypt(req.body.megaPassword);
            } catch (err) {
                console.warn('[MEGA-TEST] Encryption failed, storing as-is:', err.message);
                encryptedPassword = req.body.megaPassword;
            }
        }

        // Update settings with tested credentials and auto-enable
        settings.megaEmail = megaEmail;
        if (encryptedPassword) settings.megaPassword = encryptedPassword;
        settings.megaEnabled = true;
        settings.megaUploadEnabled = true;
        settings.megaBackupFolderName = targetFolder;
        
        await settings.save();

        console.log('[MEGA-TEST] ✓ Connection tested & settings synced for:', megaEmail);

        res.status(200).json({
            success: true,
            message: '✓ Mega connection verified & active!',
            data: {
                email: megaEmail,
                folder: targetFolder,
                status: 'connected',
                autoEnabled: true,
                nextBackup: settings.autoBackupTime,
                account: accountDetails
            }
        });

    } catch (error) {
        console.error('Mega test connection error:', error);
        megaCloudService.disconnect();
        res.status(500).json({
            success: false,
            message: error.message || 'Mega connection test failed'
        });
    }
};

/**
 * @desc    Update Mega cloud settings
 * @route   PUT /api/v1/mongodb-backup/mega/settings
 * @access  Private/Admin
 */
exports.updateMegaSettings = async (req, res) => {
    try {
        const {
            megaEnabled,
            megaEmail,
            megaPassword,
            megaBackupFolderName,
            keepLocalBackupDays,
            megaUploadEnabled
        } = req.body;

        let settings = await Settings.findOne({});

        if (!settings) {
            return res.status(400).json({
                success: false,
                message: 'Settings not found'
            });
        }

        // Update Mega settings - keep megaEnabled and megaUploadEnabled in lockstep
        if (megaEnabled !== undefined) {
            settings.megaEnabled = !!megaEnabled;
            settings.megaUploadEnabled = !!megaEnabled;
        }
        if (megaUploadEnabled !== undefined) {
            settings.megaUploadEnabled = !!megaUploadEnabled;
            if (megaUploadEnabled) settings.megaEnabled = true;
        }
        if (megaEmail !== undefined) settings.megaEmail = megaEmail;
        
        // Encrypt password only if a real new password was submitted (not blank or placeholder)
        if (megaPassword && megaPassword !== '••••••••••••' && megaPassword.trim() !== '') {
            try {
                settings.megaPassword = megaCloudService.constructor.encrypt(megaPassword);
            } catch (err) {
                console.warn('[MEGA] Encryption failed, storing as-is:', err.message);
                settings.megaPassword = megaPassword;
            }
        }
        
        if (megaBackupFolderName !== undefined) settings.megaBackupFolderName = megaBackupFolderName;
        if (keepLocalBackupDays !== undefined) settings.keepLocalBackupDays = keepLocalBackupDays;

        await settings.save();

        res.status(200).json({
            success: true,
            message: 'Mega settings updated successfully',
            data: {
                megaEnabled: settings.megaEnabled,
                megaEmail: settings.megaEmail,
                hasPassword: !!settings.megaPassword,
                megaBackupFolderName: settings.megaBackupFolderName,
                keepLocalBackupDays: settings.keepLocalBackupDays,
                megaUploadEnabled: settings.megaUploadEnabled
            }
        });

    } catch (error) {
        console.error('Update Mega settings error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update Mega settings'
        });
    }
};

/**
 * @desc    Get Mega cloud status and upload history
 * @route   GET /api/v1/mongodb-backup/mega/status
 * @access  Private/Admin
 */
exports.getMegaStatus = async (req, res) => {
    try {
        const settings = await Settings.findOne({});

        if (!settings) {
            return res.status(400).json({
                success: false,
                message: 'Settings not found'
            });
        }

        let liveAccount = null;
        const isMegaActive = (settings.megaEnabled || settings.megaUploadEnabled) && settings.megaPassword;
        if (isMegaActive && megaCloudService.isConnected()) {
            try {
                liveAccount = await megaCloudService.getAccountDetails(settings.megaBackupFolderName || 'BAS_Backups');
            } catch (err) {
                // Non-fatal
            }
        }

        res.status(200).json({
            success: true,
            data: {
                megaEnabled: settings.megaEnabled,
                megaEmail: settings.megaEmail,
                hasPassword: !!settings.megaPassword,
                megaBackupFolderName: settings.megaBackupFolderName,
                keepLocalBackupDays: settings.keepLocalBackupDays,
                megaUploadEnabled: settings.megaUploadEnabled,
                lastMegaUploadDate: settings.lastMegaUploadDate,
                lastMegaUploadStatus: settings.lastMegaUploadStatus,
                lastMegaUploadError: settings.lastMegaUploadError,
                account: liveAccount,
                megaUploadStats: settings.megaUploadStats || {
                    totalUploaded: 0,
                    totalUploadedSize: 0,
                    lastUploadSize: 0
                },
                isRestoreRunning: isRestoreRunning()
            }
        });

    } catch (error) {
        console.error('Get Mega status error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get Mega status'
        });
    }
};

/**
 * @desc    List files in Mega backup folder
 * @route   GET /api/v1/mongodb-backup/mega/files
 * @access  Private/Admin
 */
exports.listMegaFiles = async (req, res) => {
    try {
        const settings = await Settings.findOne({});

        const isMegaConfigured = (settings.megaEnabled || settings.megaUploadEnabled) && settings.megaEmail && settings.megaPassword;
        if (!settings || !isMegaConfigured) {
            return res.status(400).json({
                success: false,
                message: 'Mega not configured'
            });
        }

        // Decrypt password
        let megaPassword;
        try {
            megaPassword = megaCloudService.constructor.decrypt(settings.megaPassword);
        } catch (e) {
            megaPassword = settings.megaPassword;
        }

        // Authenticate
        const isConnected = await megaCloudService.authenticate(settings.megaEmail, megaPassword);

        if (!isConnected) {
            return res.status(401).json({
                success: false,
                message: 'Failed to authenticate with Mega'
            });
        }

        // List files
        const files = await megaCloudService.listFiles(settings.megaBackupFolderName || 'BAS_Backups');

        megaCloudService.disconnect();

        res.status(200).json({
            success: true,
            data: {
                folderName: settings.megaBackupFolderName || 'BAS_Backups',
                fileCount: files.length,
                files: files
            }
        });

    } catch (error) {
        console.error('List Mega files error:', error);
        megaCloudService.disconnect();
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to list Mega files'
        });
    }
};

/**
 * @desc    Manually upload a backup to Mega
 * @route   POST /api/v1/mongodb-backup/mega/upload/:backupFolder
 * @access  Private/Admin
 */
exports.uploadBackupToMega = async (req, res) => {
    try {
        const { backupFolder } = req.params;

        if (!backupFolder) {
            return res.status(400).json({
                success: false,
                message: 'Backup folder name is required'
            });
        }

        const settings = await Settings.findOne({});

        if (!settings) {
            return res.status(400).json({
                success: false,
                message: 'Settings not found'
            });
        }

        const isMegaConfigured = (settings.megaEnabled || settings.megaUploadEnabled) && settings.megaEmail && settings.megaPassword;
        if (!isMegaConfigured) {
            return res.status(400).json({
                success: false,
                message: 'Mega is not configured'
            });
        }

        const backupFolderPath = settings.backupFolderPath || './backups';

        console.log(`[MANUAL-UPLOAD] Starting manual Mega upload for: ${backupFolder}`);

        // 1. Compress backup
        const compressionResult = await compressBackupToZip(backupFolderPath, backupFolder);
        console.log(`[MANUAL-UPLOAD] Compressed to: ${compressionResult.compressedSizeFormatted}`);

        // 2. Decrypt password
        let megaPassword;
        try {
            megaPassword = megaCloudService.constructor.decrypt(settings.megaPassword);
        } catch (e) {
            megaPassword = settings.megaPassword;
        }

        // 3. Authenticate
        const isConnected = await megaCloudService.authenticate(settings.megaEmail, megaPassword);

        if (!isConnected) {
            throw new Error('Failed to authenticate with Mega');
        }

        // 4. Upload
        const uploadResult = await megaCloudService.uploadBackup(
            compressionResult.zipPath,
            settings.megaBackupFolderName || 'BAS_Backups'
        );

        // 5. Update stats
        settings.lastMegaUploadDate = new Date();
        settings.lastMegaUploadStatus = 'success';
        settings.lastMegaUploadError = null;
        settings.megaUploadStats = {
            totalUploaded: (settings.megaUploadStats?.totalUploaded || 0) + 1,
            totalUploadedSize: (settings.megaUploadStats?.totalUploadedSize || 0) + uploadResult.fileSize,
            lastUploadSize: uploadResult.fileSize
        };

        await settings.save();

        // 6. Cleanup
        megaCloudService.disconnect();
        await deleteZipBackup(compressionResult.zipPath);

        res.status(200).json({
            success: true,
            message: 'Backup uploaded to Mega successfully',
            data: {
                fileName: uploadResult.fileName,
                fileSize: uploadResult.fileSize,
                uploadTime: uploadResult.uploadTime,
                speed: uploadResult.speed
            }
        });

    } catch (error) {
        console.error('Manual Mega upload error:', error);
        megaCloudService.disconnect();
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload backup to Mega'
        });
    }
};

/**
 * @desc    Stream real-time backup events via SSE
 * @route   GET /api/v1/mongodb-backup/events/stream
 * @access  Private/Admin
 */
exports.streamBackupEvents = async (req, res) => {
    const backupEventService = require('../services/backupEventService');

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial event with recent history
    const recentEvents = backupEventService.getRecentEvents(10);
    res.write(`:initial-data\n`);
    res.write(`data: ${JSON.stringify({ type: 'history', events: recentEvents })}\n\n`);

    // Keep connection alive with ping every 30 seconds
    const pingInterval = setInterval(() => {
        res.write(`:ping\n\n`);
    }, 30000);

    // Listen for backup events
    const onBackupEvent = (eventData) => {
        res.write(`data: ${JSON.stringify({ type: 'event', data: eventData })}\n\n`);
    };

    backupEventService.on('backup-event', onBackupEvent);

    // Cleanup on client disconnect
    req.on('close', () => {
        clearInterval(pingInterval);
        backupEventService.removeListener('backup-event', onBackupEvent);
        res.end();
        console.log('[SSE] Client disconnected from backup events stream');
    });

    console.log('[SSE] Client connected to backup events stream');
};

/**
 * @desc    Get recent backup queue events
 * @route   GET /api/v1/mongodb-backup/events/queue
 * @access  Private/Admin
 */
exports.getBackupQueue = async (req, res) => {
    const backupEventService = require('../services/backupEventService');
    const { limit = 20 } = req.query;

    const events = backupEventService.getRecentEvents(parseInt(limit));

    res.status(200).json({
        success: true,
        data: {
            total: events.length,
            events: events
        }
    });
};

let activeRestoreTimestamp = 0;
const RESTORE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes max

function isRestoreRunning() {
    if (!activeRestoreTimestamp) return false;
    if (Date.now() - activeRestoreTimestamp > RESTORE_TIMEOUT_MS) {
        console.warn('[MEGA-RESTORE] Warning: Previous restore lock timed out after 3 minutes. Clearing lock.');
        activeRestoreTimestamp = 0;
        return false;
    }
    return true;
}

/**
 * @desc    Restore database directly from a Mega cloud backup
 * @route   POST /api/v1/mongodb-backup/mega/restore
 * @access  Private/Admin
 */
exports.restoreFromMega = async (req, res) => {
    if (isRestoreRunning()) {
        return res.status(200).json({
            success: false,
            inProgress: true,
            message: 'A Mega cloud restore is already actively downloading and restoring. Please wait ~30 seconds for it to finish.'
        });
    }
    activeRestoreTimestamp = Date.now();

    console.log('\n' + '='.repeat(70));
    console.log('☁️ MEGA CLOUD RESTORE REQUEST RECEIVED');
    console.log('='.repeat(70));

    let tempDir = null;
    try {
        const { fileName } = req.body;

        if (!fileName) {
            return res.status(400).json({
                success: false,
                message: 'Mega backup archive file name is required'
            });
        }

        const settings = await Settings.findOne({});
        if (!settings) {
            return res.status(400).json({
                success: false,
                message: 'Settings not found'
            });
        }

        const isMegaActive = (settings.megaEnabled || settings.megaUploadEnabled) && settings.megaEmail && settings.megaPassword;
        if (!isMegaActive) {
            return res.status(400).json({
                success: false,
                message: 'Mega cloud storage is not configured or enabled'
            });
        }

        // Decrypt password
        let megaPassword;
        try {
            megaPassword = megaCloudService.constructor.decrypt(settings.megaPassword);
        } catch (e) {
            megaPassword = settings.megaPassword;
        }

        // Authenticate with Mega
        const isConnected = await megaCloudService.authenticate(settings.megaEmail, megaPassword);
        if (!isConnected) {
            return res.status(401).json({
                success: false,
                message: 'Failed to authenticate with Mega Cloud'
            });
        }

        // Create temporary scratch directory
        const path = require('path');
        const fs = require('fs').promises;
        const baseBackupDir = resolveBackupFolderPath(settings.backupFolderPath);
        await fs.mkdir(baseBackupDir, { recursive: true });
        const timestamp = Date.now();
        tempDir = path.join(baseBackupDir, `.temp_mega_restore_${timestamp}`);
        await fs.mkdir(tempDir, { recursive: true });
        const downloadZipPath = path.join(tempDir, fileName);
        const extractTargetDir = path.join(tempDir, 'extracted');

        console.log(`[MEGA-RESTORE] 📥 Streaming "${fileName}" from Mega to "${downloadZipPath}"...`);

        // 1. Download file from Mega
        await megaCloudService.downloadBackup(
            fileName,
            downloadZipPath,
            settings.megaBackupFolderName || 'BAS_Backups'
        );

        // 2. Extract archive
        console.log(`[MEGA-RESTORE] 📦 Extracting archive to "${extractTargetDir}"...`);
        await extractZipArchive(downloadZipPath, extractTargetDir);

        console.log(`[MEGA-RESTORE] 🎯 Restore source folder: ${extractTargetDir}`);

        // Target database URI: Priority to current environment
        const currentEnvUri = process.env.MONGO_URI;
        const mongodbUri = currentEnvUri || 'mongodb://127.0.0.1:27017/BAS-SOFTWARE';

        const restoreConfig = {
            mongodbUri,
            fullPath: extractTargetDir,
            backupFolderPath: extractTargetDir,
            mongoToolsPath: settings.mongoToolsPath || '',
            backupFolder: path.basename(fileName, path.extname(fileName))
        };

        // Preserve current admin user before restore
        const User = require('../models/User');
        let currentAdmin = null;
        try {
            const userId = req.user ? req.user.id : null;
            if (userId) {
                currentAdmin = await User.findById(userId).lean();
                console.log(`[MEGA-RESTORE] [SAFETY] Preserving current admin user: ${currentAdmin ? currentAdmin.email : 'Not found'}`);
            }
        } catch (err) {
            console.warn('[MEGA-RESTORE] [SAFETY] Failed to preserve current admin user:', err.message);
        }

        // 4. Run mongorestore
        console.log(`[MEGA-RESTORE] 🔄 Running mongorestore into ${mongodbUri.replace(/\/\/.*@/, '//****@')}...`);
        const restoreResult = await restoreBackup(restoreConfig);

        // Restore admin if missing after drop
        if (currentAdmin) {
            try {
                const checkUser = await User.findOne({ email: currentAdmin.email });
                if (!checkUser) {
                    console.log(`[MEGA-RESTORE] [SAFETY] Recreating admin user ${currentAdmin.email}...`);
                    const { _id, ...userData } = currentAdmin;
                    await User.create(userData);
                    console.log('[MEGA-RESTORE] [SAFETY] Admin user preserved successfully.');
                }
            } catch (err) {
                console.error('[MEGA-RESTORE] [SAFETY] Error recreating admin user:', err.message);
            }
        }

        // 5. Cleanup temporary files and disconnect
        megaCloudService.disconnect();
        await cleanupTempDirectory(tempDir);
        tempDir = null;

        console.log(`[MEGA-RESTORE] ✅ Database restored successfully from Mega backup: ${fileName}`);

        res.status(200).json({
            success: true,
            message: `✓ Database successfully restored from Mega backup: ${fileName}`,
            data: {
                fileName,
                details: restoreResult
            }
        });

    } catch (error) {
        console.error('[MEGA-RESTORE] ❌ Restore from Mega failed:', error);
        megaCloudService.disconnect();
        if (tempDir) {
            await cleanupTempDirectory(tempDir);
        }
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to restore database from Mega cloud backup'
        });
    } finally {
        activeRestoreTimestamp = 0;
    }
};
