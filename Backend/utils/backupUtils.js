const { exec } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);
const archiver = require('archiver');

/**
 * Backup Utilities Module
 * Handles MongoDB backup and restore operations using mongodump and mongorestore
 */

function resolveBackupFolderPath(configuredPath) {
    if (!configuredPath) {
        return path.join(process.cwd(), 'backup');
    }
    // If running on non-Windows (Mac/Linux) but configuredPath is a Windows path (e.g. D:\... or C:\... or contains backslashes)
    if (process.platform !== 'win32' && (/^[a-zA-Z]:/i.test(configuredPath) || configuredPath.includes('\\'))) {
        return path.join(process.cwd(), 'backup');
    }
    return configuredPath;
}

async function resolveMongoToolPath(toolName, explicitPath) {
    const extensions = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
    const searchPaths = [];

    // 1. Check explicit path if provided and matching platform format
    if (explicitPath) {
        const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(explicitPath);
        if (process.platform === 'win32' || !isWindowsPath) {
            searchPaths.push(explicitPath);
            searchPaths.push(path.join(explicitPath, 'bin'));
        }
    }

    // 2. Add standard Unix/macOS locations
    if (process.platform === 'darwin' || process.platform === 'linux') {
        searchPaths.push('/usr/local/bin');
        searchPaths.push('/usr/local/opt/mongodb-database-tools/bin');
        searchPaths.push('/opt/homebrew/bin');
        searchPaths.push('/opt/homebrew/opt/mongodb-database-tools/bin');
        searchPaths.push('/usr/bin');
    }

    for (const searchPath of searchPaths) {
        for (const ext of extensions) {
            const fullPath = path.join(searchPath, toolName + ext);
            try {
                await fs.access(fullPath);
                return fullPath;
            } catch (e) {
                // Continue searching
            }
        }
    }

    // Fall back to system PATH
    return toolName;
}

/**
 * Get formatted date string (YYYY-MM-DD)
 * More robust than toLocaleDateString which depends on system locale
 * @returns {string} Formatted date string
 */
function getFormattedDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Create a backup of the MongoDB database
 * @param {Object} config - Backup configuration
 * @param {string} config.mongodbUri - MongoDB connection URI
 * @param {string} config.backupFolderPath - Base path for backups
 * @param {string} config.mongoToolsPath - Path to MongoDB tools (optional)
 * @param {string} config.type - Type of backup ('auto' or 'manual')
 * @returns {Promise<Object>} Backup result with folder name and timestamp
 */
async function createBackup(config) {

    try {
        const rawBackupFolderPath = config.backupFolderPath;
        const backupFolderPath = resolveBackupFolderPath(rawBackupFolderPath);
        const { mongodbUri, mongoToolsPath, type = 'manual' } = config;

        let backupFolder;

        if (type === 'auto') {
            // For auto backups, use a date-based name to prevent duplicates (One per day)
            const datePart = getFormattedDate();
            backupFolder = `backup-auto-${datePart}`;

            // Check if this daily backup already exists
            const checkPath = path.join(backupFolderPath, backupFolder);
            try {
                await fs.access(checkPath);
                // If we get here, directory exists.
                // Check if it's a "successful" backup (has info file)
                try {
                    await fs.access(path.join(checkPath, 'backup-info.json'));
                    console.log(`[BACKUP] Auto backup for today (${backupFolder}) already exists. Skipping.`);
                    return {
                        success: true,
                        backupFolder,
                        fullPath: checkPath,
                        timestamp: new Date(),
                        message: 'Daily backup already exists'
                    };
                } catch (e) {
                    // Directory exists but no info file? might be partial/failed. 
                    console.log(`[BACKUP] Found partial auto backup folders, overwriting...`);
                }
            } catch (err) {
                // Directory does not exist, proceed.
            }
        } else {
            // Manual: Keep precise timestamp with milliseconds
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
            backupFolder = `backup-${timestamp}`;
        }

        const fullBackupPath = path.join(backupFolderPath, backupFolder);

        // Ensure backup directory exists
        await fs.mkdir(backupFolderPath, { recursive: true });

        // Build mongodump command with resolved path
        const mongodumpCmd = await resolveMongoToolPath('mongodump', mongoToolsPath);

        const command = `"${mongodumpCmd}" --uri="${mongodbUri}" --out="${fullBackupPath}"`;

        console.log(`[BACKUP] Starting ${type} backup: ${backupFolder}`);

        // Execute mongodump with massive 1GB buffer to prevent log truncation and handle large datasets
        const { stdout, stderr } = await execPromise(command, {
            maxBuffer: 1024 * 1024 * 1024 // 1024MB (1GB) buffer
        });

        if (stderr && !stderr.includes('done dumping')) {
            console.error(`[BACKUP] Warning: ${stderr}`);
        }

        // Save metadata
        const metadata = {
            type,
            timestamp: new Date(),
            folder: backupFolder
        };
        await fs.writeFile(path.join(fullBackupPath, 'backup-info.json'), JSON.stringify(metadata, null, 2));

        console.log(`[BACKUP] Success: ${backupFolder}`);


        return {
            success: true,
            backupFolder,
            fullPath: fullBackupPath,
            timestamp: new Date(),
            message: 'Backup created successfully'
        };

    } catch (error) {
        console.error('[BACKUP] Error:', error.message);
        throw new Error(`Backup failed: ${error.message}`);
    }
}

/**
 * Restore database from a backup folder
 * @param {Object} config - Restore configuration
 * @param {string} config.mongodbUri - MongoDB connection URI
 * @param {string} config.backupFolderPath - Base path for backups
 * @param {string} config.mongoToolsPath - Path to MongoDB tools (optional)
 * @param {string} config.backupFolder - Name of backup folder to restore
 * @returns {Promise<Object>} Restore result
 */
async function restoreBackup(config) {
    try {
        const { mongodbUri, mongoToolsPath } = config;
        const backupFolder = config.backupFolder || (config.fullPath ? path.basename(config.fullPath) : '');
        const fullBackupPath = config.fullPath
            ? path.resolve(config.fullPath)
            : path.join(resolveBackupFolderPath(config.backupFolderPath), backupFolder);

        console.log(`\n🔄 [RESTORE] Starting restore operation from: ${backupFolder}`);
        console.log(`📂 [RESTORE] Full Path: ${fullBackupPath}`);

        // Verify backup folder exists
        try {
            await fs.access(fullBackupPath);
        } catch (error) {
            console.error(`❌ [RESTORE] Backup folder not found: ${fullBackupPath}`);
            throw new Error(`Backup folder not found: ${backupFolder}`);
        }

        // Extract target database name from URI
        const parsedUri = new URL(mongodbUri.startsWith('mongodb') ? mongodbUri : `mongodb://${mongodbUri}`);
        const targetDbName = parsedUri.pathname.substring(1).split('?')[0] || 'BAS-SOFTWARE';

        console.log(`🎯 [RESTORE] Target Database: ${targetDbName}`);

        // Helper function to recursively find the directory containing .bson files
        async function findBsonDirectory(startPath, targetName) {
            try {
                const entries = await fs.readdir(startPath, { withFileTypes: true });
                // Check if this folder directly contains .bson files
                const hasBson = entries.some(e => e.isFile() && e.name.endsWith('.bson'));
                if (hasBson) {
                    return { bsonPath: startPath, sourceDbName: path.basename(startPath) };
                }

                const dirs = entries.filter(e => e.isDirectory() && !['admin', 'config', 'local', 'test'].includes(e.name.toLowerCase()));

                // Priority 1: Subdirectory that matches targetDbName case-insensitively
                const matchedDir = dirs.find(d => d.name.toLowerCase() === targetName.toLowerCase());
                if (matchedDir) {
                    const subPath = path.join(startPath, matchedDir.name);
                    const found = await findBsonDirectory(subPath, targetName);
                    if (found) return found;
                }

                // Priority 2: Any non-system subdirectory containing BSONs
                for (const d of dirs) {
                    const subPath = path.join(startPath, d.name);
                    const found = await findBsonDirectory(subPath, targetName);
                    if (found) return found;
                }
            } catch (err) {
                console.warn(`[RESTORE] Warning reading folder "${startPath}":`, err.message);
            }
            return null;
        }

        // Locate BSON directory
        const bsonLocation = await findBsonDirectory(fullBackupPath, targetDbName);
        if (!bsonLocation) {
            console.error(`❌ [RESTORE] No .bson database files found in: ${fullBackupPath}`);
            throw new Error(`No MongoDB collections (.bson files) found in backup path: ${backupFolder}`);
        }

        const pathToRestore = bsonLocation.bsonPath;
        const sourceDbName = bsonLocation.sourceDbName;
        console.log(`📂 [RESTORE] Located BSON folder: ${pathToRestore} (Source DB name: "${sourceDbName}")`);

        // Build mongorestore command with resolved path
        const mongorestoreCmd = await resolveMongoToolPath('mongorestore', mongoToolsPath);

        console.log(`[RESTORE] ✓ Restoring database from folder "${sourceDbName}" directly into "${targetDbName}"`);
        const command = `"${mongorestoreCmd}" --uri="${mongodbUri}" --drop -d "${targetDbName}" "${pathToRestore}"`;

        console.log(`[RESTORE] Executing command: ${command.replace(mongodbUri, 'HIDDEN_URI')}`);

        // Execute mongorestore with massive 1GB buffer
        const { stdout, stderr } = await execPromise(command, {
            maxBuffer: 1024 * 1024 * 1024 // 1GB
        });

        if (stderr) {
            console.log(`[RESTORE] Command Output: ${stderr.substring(0, 1000)}${stderr.length > 1000 ? '...' : ''}`);
        }

        // Direct database verification
        try {
            const { MongoClient } = require('mongodb');
            const verifyClient = new MongoClient(mongodbUri);
            await verifyClient.connect();
            const verifyDb = verifyClient.db(targetDbName);
            const collections = await verifyDb.listCollections().toArray();
            await verifyClient.close();

            console.log(`[RESTORE] ✓ Verification: Database "${targetDbName}" contains ${collections.length} collections.`);
            if (collections.length === 0) {
                throw new Error(`mongorestore executed but database "${targetDbName}" has 0 collections.`);
            }
        } catch (verifyErr) {
            console.warn('[RESTORE] Database verification warning:', verifyErr.message);
        }

        console.log(`✅ [RESTORE] Success! Restore completed for database: ${targetDbName}`);

        return {
            success: true,
            backupFolder,
            timestamp: new Date(),
            message: `Database restored successfully to ${targetDbName}`
        };

    } catch (error) {
        console.error('❌ [RESTORE] Fatal Error:', error.message);
        throw new Error(`Restore failed: ${error.message}`);
    }
}


/**
 * Get list of available backup folders
 * @param {string} backupFolderPath - Base path for backups
 * @param {string} autoBackupTime - Optional configured auto backup time (HH:mm) to infer type for legacy backups
 * @returns {Promise<Array>} List of backup folders with metadata
 */
async function getBackupsList(rawBackupFolderPath, autoBackupTime) {
    try {
        const backupFolderPath = resolveBackupFolderPath(rawBackupFolderPath);
        // Ensure backup directory exists
        await fs.mkdir(backupFolderPath, { recursive: true });

        const files = await fs.readdir(backupFolderPath);

        const backups = [];

        for (const file of files) {
            if (file.startsWith('backup-')) {
                const fullPath = path.join(backupFolderPath, file);
                const stats = await fs.stat(fullPath);

                if (stats.isDirectory()) {
                    // Calculate folder size
                    const size = await getFolderSize(fullPath);

                    // Determine Type
                    // 1. Try reading metadata file (New System)
                    let type = null;
                    try {
                        const metaPath = path.join(fullPath, 'backup-info.json');
                        const metaContent = await fs.readFile(metaPath, 'utf8');
                        const meta = JSON.parse(metaContent);
                        if (meta.type) type = meta.type.charAt(0).toUpperCase() + meta.type.slice(1);
                    } catch (err) {
                        // Metadata missing -> Legacy Backup
                    }

                    // 2. If no metadata, infer from time (Legacy Support)
                    if (!type) {
                        const createdAt = stats.birthtime || stats.mtime;
                        // Format created time to HH:mm
                        const createdHours = createdAt.getHours().toString().padStart(2, '0');
                        const createdMinutes = createdAt.getMinutes().toString().padStart(2, '0');
                        const createdTime = `${createdHours}:${createdMinutes}`;

                        // Check if it matches autoBackupTime (allowing 1 min variance for execution delay)
                        if (autoBackupTime) {
                            const [autoH, autoM] = autoBackupTime.split(':');

                            // Simple check: Exact match
                            if (createdTime === autoBackupTime) {
                                type = 'Auto';
                            }
                            // Fuzzy check: allow being 1 minute late (e.g. scheduled 03:00, ran 03:00:01 or 03:01)
                            else if (autoH === createdHours && Math.abs(parseInt(createdMinutes) - parseInt(autoM)) <= 1) {
                                type = 'Auto';
                            }
                        }

                        // Default to Manual if inference failed
                        if (!type) type = 'Manual';
                    }

                    backups.push({
                        name: file,
                        path: fullPath,
                        createdAt: stats.birthtime || stats.mtime,
                        size: size,
                        sizeFormatted: formatBytes(size),
                        type: type
                    });
                }
            }
        }

        // Sort by creation date (newest first)
        backups.sort((a, b) => b.createdAt - a.createdAt);

        return backups;

    } catch (error) {
        console.error('[BACKUP LIST] Error:', error.message);
        return [];
    }
}

/**
 * Get backup information (last backup date and count)
 * @param {string} backupFolderPath - Base path for backups
 * @param {Date} lastBackupDate - Last backup date from settings
 * @returns {Promise<Object>} Backup information
 */
async function getBackupInfo(backupFolderPath, lastBackupDate) {
    try {
        const backups = await getBackupsList(backupFolderPath);

        return {
            lastBackupDate: lastBackupDate || (backups.length > 0 ? backups[0].createdAt : null),
            backupCount: backups.length,
            totalSize: backups.reduce((sum, b) => sum + b.size, 0),
            totalSizeFormatted: formatBytes(backups.reduce((sum, b) => sum + b.size, 0))
        };

    } catch (error) {
        console.error('[BACKUP INFO] Error:', error.message);
        return {
            lastBackupDate: null,
            backupCount: 0,
            totalSize: 0,
            totalSizeFormatted: '0 B'
        };
    }
}

/**
 * Delete a specific backup folder
 * @param {string} backupFolderPath - Base path for backups
 * @param {string} backupFolder - Name of backup folder to delete
 * @returns {Promise<Object>} Delete result
 */
async function deleteBackup(rawBackupFolderPath, backupFolder) {
    try {
        const backupFolderPath = resolveBackupFolderPath(rawBackupFolderPath);
        const fullPath = path.join(backupFolderPath, backupFolder);

        // Verify it's a backup folder
        if (!backupFolder.startsWith('backup-')) {
            throw new Error('Invalid backup folder name');
        }

        // Delete the folder recursively
        await fs.rm(fullPath, { recursive: true, force: true });

        console.log(`[DELETE] Backup deleted: ${backupFolder}`);

        return {
            success: true,
            message: 'Backup deleted successfully'
        };

    } catch (error) {
        console.error('[DELETE] Error:', error.message);
        throw new Error(`Delete failed: ${error.message}`);
    }
}

/**
 * Clean old backups based on retention days
 * @param {string} backupFolderPath - Base path for backups
 * @param {number} retentionDays - Number of days to keep backups
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanOldBackups(backupFolderPath, retentionDays) {
    try {
        const backups = await getBackupsList(backupFolderPath);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        let deletedCount = 0;

        for (const backup of backups) {
            if (backup.createdAt < cutoffDate) {
                await deleteBackup(backupFolderPath, backup.name);
                deletedCount++;
            }
        }

        console.log(`[CLEANUP] Deleted ${deletedCount} old backups`);

        return {
            success: true,
            deletedCount,
            message: `Cleaned up ${deletedCount} old backups`
        };

    } catch (error) {
        console.error('[CLEANUP] Error:', error.message);
        return {
            success: false,
            deletedCount: 0,
            message: `Cleanup failed: ${error.message}`
        };
    }
}

/**
 * Calculate folder size recursively
 * @param {string} folderPath - Path to folder
 * @returns {Promise<number>} Size in bytes
 */
async function getFolderSize(folderPath) {
    let totalSize = 0;

    try {
        const files = await fs.readdir(folderPath);

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stats = await fs.stat(filePath);

            if (stats.isDirectory()) {
                totalSize += await getFolderSize(filePath);
            } else {
                totalSize += stats.size;
            }
        }
    } catch (error) {
        console.error(`Error calculating folder size: ${error.message}`);
    }

    return totalSize;
}

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Compress a backup folder to ZIP file
 * @param {string} rawBackupFolderPath - Path to the backup folder
 * @param {string} backupFolderName - Name of backup folder (e.g., backup-auto-2026-05-29)
 * @param {string} outputDirectory - Where to save the ZIP file (optional, defaults to parent of backup)
 * @returns {Promise<Object>} Compression result with ZIP file path and size
 */
async function compressBackupToZip(rawBackupFolderPath, backupFolderName, outputDirectory = null) {
    try {
        const backupFolderPath = resolveBackupFolderPath(rawBackupFolderPath);
        // Determine output directory - use backupFolderPath by default, not its parent
        if (!outputDirectory) {
            outputDirectory = backupFolderPath;
        }

        const fullBackupPath = path.join(backupFolderPath, backupFolderName);
        const zipFileName = `${backupFolderName}.zip`;
        const zipFilePath = path.join(outputDirectory, zipFileName);

        console.log(`[COMPRESS] Starting compression of: ${backupFolderName}`);
        console.log(`[COMPRESS] Source: ${fullBackupPath}`);
        console.log(`[COMPRESS] Target: ${zipFilePath}`);

        // Verify backup folder exists
        try {
            await fs.access(fullBackupPath);
        } catch (error) {
            throw new Error(`Backup folder not found: ${fullBackupPath}`);
        }

        // Create output directory if needed
        try {
            await fs.mkdir(outputDirectory, { recursive: true });
        } catch (mkdirError) {
            console.error(`[COMPRESS] Failed to create output directory: ${outputDirectory}`, mkdirError);
            throw new Error(`Cannot create output directory: ${mkdirError.message}`);
        }

        return new Promise((resolve, reject) => {
            const output = fsSync.createWriteStream(zipFilePath);
            const archive = new archiver.ZipArchive({
                zlib: { level: 6 } // Compression level (0-9), 6 is balanced
            });

            let compressedSize = 0;

            // Track compression progress
            archive.on('data', (data) => {
                compressedSize += data.length;
            });

            output.on('close', async () => {
                const stats = await fs.stat(zipFilePath);
                const originalSize = await getFolderSize(fullBackupPath);
                const compressionRatio = ((1 - stats.size / originalSize) * 100).toFixed(2);

                console.log(`[COMPRESS] ✓ Compression complete: ${zipFileName}`);
                console.log(`[COMPRESS] Original: ${formatBytes(originalSize)} → Compressed: ${formatBytes(stats.size)} (${compressionRatio}% reduction)`);

                resolve({
                    success: true,
                    zipFile: zipFileName,
                    zipPath: zipFilePath,
                    originalSize: originalSize,
                    compressedSize: stats.size,
                    originalSizeFormatted: formatBytes(originalSize),
                    compressedSizeFormatted: formatBytes(stats.size),
                    compressionRatio: compressionRatio,
                    timestamp: new Date(),
                    message: 'Backup compressed successfully'
                });
            });

            archive.on('error', (err) => {
                console.error('[COMPRESS] Error:', err.message);
                reject(new Error(`Compression failed: ${err.message}`));
            });

            output.on('error', (err) => {
                console.error('[COMPRESS] Write error:', err.message);
                reject(new Error(`Write error: ${err.message}`));
            });

            // Pipe archive data to file
            archive.pipe(output);

            // Append backup folder to archive
            archive.directory(fullBackupPath, backupFolderName);

            // Finalize archive
            archive.finalize();
        });

    } catch (error) {
        console.error('[COMPRESS] Fatal error:', error.message);
        throw new Error(`Backup compression failed: ${error.message}`);
    }
}

/**
 * Delete a ZIP backup file
 * @param {string} zipFilePath - Path to ZIP file
 * @returns {Promise<boolean>} Success status
 */
async function deleteZipBackup(zipFilePath) {
    try {
        await fs.unlink(zipFilePath);
        console.log(`[COMPRESS] Deleted ZIP file: ${zipFilePath}`);
        return true;
    } catch (error) {
        console.error('[COMPRESS] Error deleting ZIP:', error.message);
        throw error;
    }
}

/**
 * Extract a ZIP backup file cross-platform
 * @param {string} zipFilePath - Path to the ZIP file
 * @param {string} targetDir - Directory where contents should be extracted
 * @returns {Promise<string>} Path to the extracted directory
 */
async function extractZipArchive(zipFilePath, targetDir) {
    await fs.mkdir(targetDir, { recursive: true });

    return new Promise((resolve, reject) => {
        // First try native tar -xf (fastest, available on modern macOS, Linux, and Windows 10/11/Server)
        exec(`tar -xf "${zipFilePath}" -C "${targetDir}"`, (error, stdout, stderr) => {
            if (!error) {
                console.log(`[EXTRACT] Successfully extracted archive with tar to: ${targetDir}`);
                return resolve(targetDir);
            }

            console.warn(`[EXTRACT] tar failed, trying platform fallback: ${error.message}`);
            if (process.platform === 'win32') {
                // Windows PowerShell fallback
                const psCmd = `powershell -NoProfile -NonInteractive -Command "Expand-Archive -LiteralPath '${zipFilePath}' -DestinationPath '${targetDir}' -Force"`;
                exec(psCmd, (psErr, psStdout, psStderr) => {
                    if (psErr) {
                        return reject(new Error(`Extraction failed: ${psErr.message}`));
                    }
                    console.log(`[EXTRACT] Successfully extracted archive with PowerShell to: ${targetDir}`);
                    resolve(targetDir);
                });
            } else {
                // Unix unzip fallback
                exec(`unzip -o -q "${zipFilePath}" -d "${targetDir}"`, (unzipErr) => {
                    if (unzipErr) {
                        return reject(new Error(`Archive extraction failed: ${error.message} / ${unzipErr.message}`));
                    }
                    console.log(`[EXTRACT] Successfully extracted archive with unzip to: ${targetDir}`);
                    resolve(targetDir);
                });
            }
        });
    });
}

/**
 * Clean up a temporary directory recursively
 * @param {string} dirPath - Directory path to remove
 */
async function cleanupTempDirectory(dirPath) {
    try {
        if (dirPath && fs.rm) {
            await fs.rm(dirPath, { recursive: true, force: true });
            console.log(`[CLEANUP] Removed temporary directory: ${dirPath}`);
        }
    } catch (err) {
        console.warn(`[CLEANUP] Could not remove temporary directory: ${err.message}`);
    }
}

module.exports = {
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
};
