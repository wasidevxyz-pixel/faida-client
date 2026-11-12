const { Storage } = require('megajs');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Mega Cloud Service
 * Handles authentication, uploads, and folder management with Mega
 */

const ENCRYPTION_KEY = process.env.MEGA_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

class MegaCloudService {
    constructor() {
        this.mega = null;
        this.isAuthenticated = false;
        this.lastAuthError = null;
    }

    /**
     * Encrypt sensitive data
     * @param {string} text - Text to encrypt
     * @returns {string} Encrypted text
     */
    static encrypt(text) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(
                ENCRYPTION_ALGORITHM,
                crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32),
                iv
            );
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            console.error('[MEGA] Encryption error:', error.message);
            throw error;
        }
    }

    /**
     * Decrypt sensitive data
     * @param {string} text - Encrypted text
     * @returns {string} Decrypted text
     */
    static decrypt(text) {
        try {
            const parts = text.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            const decipher = crypto.createDecipheriv(
                ENCRYPTION_ALGORITHM,
                crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32),
                iv
            );
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error('[MEGA] Decryption error:', error.message);
            throw error;
        }
    }

    /**
     * Authenticate with Mega
     * @param {string} email - Mega email
     * @param {string} password - Mega password
     * @returns {Promise<boolean>} Authentication status
     */
    async authenticate(email, password) {
        try {
            console.log(`[MEGA] Attempting authentication for ${email}...`);

            // Create new Storage instance
            const storage = new Storage({
                email,
                password
            });

            // Prevent unhandled promise rejections on storage.ready
            storage.ready.catch(() => {});
            this.mega = storage;

            // Wait for authentication or timeout (20s)
            await Promise.race([
                storage.ready,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Authentication timeout after 20s')), 20000))
            ]);

            console.log(`[MEGA] ✓ Authentication successful for ${email}`);
            this.isAuthenticated = true;
            this.lastAuthError = null;

            return true;
        } catch (error) {
            console.error('[MEGA] ✗ Authentication failed:', error.message);
            this.isAuthenticated = false;
            this.lastAuthError = error.message;
            this.mega = null;

            return false;
        }
    }

    /**
     * Check if currently authenticated
     * @returns {boolean}
     */
    isConnected() {
        return this.isAuthenticated && this.mega !== null;
    }

    /**
     * Get or create a folder in Mega
     * @param {string} folderName - Name of folder to create/get
     * @param {Object} parent - Parent folder (optional, defaults to root)
     * @returns {Promise<Object>} Folder object
     */
    async getOrCreateFolder(folderName, parent = null) {
        try {
            if (!this.isConnected()) {
                throw new Error('Not authenticated with Mega');
            }

            console.log(`[MEGA] Looking for folder: ${folderName}`);

            // Get root storage if no parent specified
            if (!parent) {
                parent = this.mega.root;
            }

            if (!parent) {
                throw new Error('Root folder not available');
            }

            // Get children of parent
            const children = await parent.children;

            if (!children || children.length === 0) {
                console.log(`[MEGA] No children in parent, creating new folder: ${folderName}`);
                const newFolder = await parent.mkdir(folderName);
                console.log(`[MEGA] ✓ Created folder: ${folderName}`);
                return newFolder;
            }

            // Find existing folder
            const existingFolder = children.find(
                child => child.name === folderName && child.directory
            );

            if (existingFolder) {
                console.log(`[MEGA] ✓ Found existing folder: ${folderName}`);
                return existingFolder;
            }

            // Create new folder if not found
            console.log(`[MEGA] Creating new folder: ${folderName}`);
            const newFolder = await parent.mkdir(folderName);

            console.log(`[MEGA] ✓ Created folder: ${folderName}`);
            return newFolder;
        } catch (error) {
            console.error('[MEGA] Error getting/creating folder:', error.message);
            throw error;
        }
    }

    /**
     * Upload a file to Mega
     * @param {string} filePath - Local file path
     * @param {Object} targetFolder - Target folder in Mega
     * @param {Function} progressCallback - Progress callback (optional)
     * @returns {Promise<Object>} Upload result
     */
    async uploadFile(filePath, targetFolder, progressCallback = null) {
        try {
            if (!this.isConnected()) {
                throw new Error('Not authenticated with Mega');
            }

            const fileName = path.basename(filePath);
            console.log(`[MEGA] Starting upload: ${fileName}`);

            const stats = await fs.stat(filePath);
            const fileSize = stats.size;

            console.log(`[MEGA] File size: ${this.formatBytes(fileSize)}`);

            const startTime = Date.now();
            let file;

            // Attempt streaming upload first to conserve RAM for large backups
            try {
                const readStream = fsSync.createReadStream(filePath);
                const uploadStream = targetFolder.upload({
                    name: fileName,
                    size: fileSize
                }, readStream);
                file = await uploadStream.complete;
            } catch (streamErr) {
                console.warn(`[MEGA] Stream upload fallback to buffer: ${streamErr.message}`);
                const fileBuffer = await fs.readFile(filePath);
                file = await targetFolder.upload({
                    name: fileName,
                    size: fileSize,
                    data: fileBuffer
                }).complete;
            }

            const uploadTime = ((Date.now() - startTime) / 1000).toFixed(2);
            const speed = uploadTime > 0 ? (fileSize / 1024 / 1024 / uploadTime).toFixed(2) : '0.00';

            console.log(`[MEGA] ✓ Upload complete: ${fileName}`);
            console.log(`[MEGA] Time: ${uploadTime}s | Speed: ${speed} MB/s`);

            if (progressCallback) {
                progressCallback({
                    status: 'complete',
                    fileName,
                    fileSize,
                    uploadTime: uploadTime,
                    speed: speed
                });
            }

            return {
                success: true,
                fileName,
                fileSize,
                uploadTime,
                speed,
                message: 'File uploaded successfully'
            };
        } catch (error) {
            console.error('[MEGA] Upload error:', error.message);

            if (progressCallback) {
                progressCallback({
                    status: 'error',
                    error: error.message
                });
            }

            throw error;
        }
    }

    /**
     * Upload backup ZIP file to Mega
     * @param {string} zipFilePath - Path to ZIP backup file
     * @param {string} megaFolderName - Target folder in Mega (default: "BAS_Backups")
     * @param {Function} progressCallback - Progress callback (optional)
     * @returns {Promise<Object>} Upload result
     */
    async uploadBackup(zipFilePath, megaFolderName = 'BAS_Backups', progressCallback = null) {
        try {
            if (!this.isConnected()) {
                throw new Error('Not authenticated with Mega');
            }

            console.log(`[MEGA-BACKUP] Starting backup upload to: ${megaFolderName}`);

            // Get or create backup folder
            const backupFolder = await this.getOrCreateFolder(megaFolderName);

            // Upload the ZIP file
            const result = await this.uploadFile(zipFilePath, backupFolder, progressCallback);

            console.log(`[MEGA-BACKUP] ✓ Backup uploaded: ${result.fileName}`);

            return {
                ...result,
                megaFolder: megaFolderName,
                zipFile: path.basename(zipFilePath)
            };
        } catch (error) {
            console.error('[MEGA-BACKUP] Upload failed:', error.message);
            throw error;
        }
    }

    /**
     * Download backup ZIP file from Mega directly to local destination path
     * @param {string} fileName - File name to download (e.g. backup-2026-09-04T13-56-50-158Z.zip)
     * @param {string} destinationPath - Full file path where ZIP should be saved
     * @param {string} megaFolderName - Folder in Mega (default: "BAS_Backups")
     * @param {Function} progressCallback - Progress callback (optional)
     * @returns {Promise<Object>} Download result
     */
    async downloadBackup(fileName, destinationPath, megaFolderName = 'BAS_Backups', progressCallback = null) {
        try {
            if (!this.isConnected()) {
                throw new Error('Not authenticated with Mega');
            }

            console.log(`[MEGA-DOWNLOAD] Fetching "${fileName}" from folder "${megaFolderName}"...`);

            const backupFolder = await this.getOrCreateFolder(megaFolderName);
            const children = await backupFolder.children;
            const file = children.find(f => f.name === fileName);

            if (!file) {
                throw new Error(`File "${fileName}" not found in Mega folder "${megaFolderName}"`);
            }

            const startTime = Date.now();
            const totalSize = file.size;

            // Ensure target directory exists
            await fs.mkdir(path.dirname(destinationPath), { recursive: true });

            await new Promise((resolve, reject) => {
                const writeStream = fsSync.createWriteStream(destinationPath);
                let downloadedBytes = 0;

                const downloadStream = file.download();

                downloadStream.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (progressCallback && totalSize > 0) {
                        const percent = Math.min(100, Math.round((downloadedBytes / totalSize) * 100));
                        progressCallback({
                            status: 'downloading',
                            fileName,
                            downloadedBytes,
                            totalSize,
                            percent
                        });
                    }
                });

                downloadStream.on('error', (err) => {
                    writeStream.close();
                    reject(err);
                });

                writeStream.on('error', (err) => {
                    reject(err);
                });

                writeStream.on('finish', () => {
                    resolve();
                });

                downloadStream.pipe(writeStream);
            });

            const downloadTime = ((Date.now() - startTime) / 1000).toFixed(2);
            const speed = downloadTime > 0 ? (totalSize / 1024 / 1024 / downloadTime).toFixed(2) : '0.00';

            console.log(`[MEGA-DOWNLOAD] ✓ Downloaded "${fileName}" in ${downloadTime}s (${speed} MB/s)`);

            return {
                success: true,
                fileName,
                fileSize: totalSize,
                destinationPath,
                downloadTime,
                speed
            };
        } catch (error) {
            console.error('[MEGA-DOWNLOAD] Download failed:', error.message);
            throw error;
        }
    }

    /**
     * List files in a Mega folder
     * @param {string} folderName - Folder name
     * @returns {Promise<Array>} List of files
     */
    async listFiles(folderName = 'BAS_Backups') {
        try {
            if (!this.isConnected()) {
                throw new Error('Not authenticated with Mega');
            }

            console.log(`[MEGA] Listing files in: ${folderName}`);

            // Get folder
            const folder = await this.getOrCreateFolder(folderName);
            const children = await folder.children;

            if (!children || children.length === 0) {
                console.log(`[MEGA] No files in folder: ${folderName}`);
                return [];
            }

            const files = children
                .filter(child => !child.directory) // Only files, not folders
                .map(file => ({
                    name: file.name,
                    size: file.size,
                    sizeFormatted: this.formatBytes(file.size),
                    created: file.timestamp ? new Date(file.timestamp * 1000) : null,
                    downloadUrl: file.downloadUrl
                }))
                .sort((a, b) => {
                    // Safely compare dates
                    const dateA = a.created ? new Date(a.created).getTime() : 0;
                    const dateB = b.created ? new Date(b.created).getTime() : 0;
                    return dateB - dateA;
                }); // Newest first

            console.log(`[MEGA] Found ${files.length} files in ${folderName}`);

            return files;
        } catch (error) {
            console.error('[MEGA] Error listing files:', error.message);
            return [];
        }
    }

    /**
     * Get file size in human-readable format
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Disconnect from Mega
     */
    disconnect() {
        try {
            if (this.mega) {
                this.mega = null;
                this.isAuthenticated = false;
                console.log('[MEGA] Disconnected');
            }
        } catch (error) {
            console.error('[MEGA] Disconnect error:', error.message);
        }
    }

    /**
     * Get real account details and storage quota from Mega
     * @param {string} folderName - Target folder name to inspect
     * @returns {Promise<Object>} Live account and storage quota metrics
     */
    async getAccountDetails(folderName = 'BAS_Backups') {
        try {
            if (!this.isConnected()) {
                throw new Error('Not authenticated with Mega');
            }

            let spaceUsed = 0;
            let spaceTotal = 0;

            if (typeof this.mega.getAccountInfo === 'function') {
                const info = await this.mega.getAccountInfo();
                spaceUsed = info.spaceUsed || 0;
                spaceTotal = info.spaceTotal || 0;
            }

            const spaceFree = Math.max(0, spaceTotal - spaceUsed);
            const percentUsed = spaceTotal > 0 ? ((spaceUsed / spaceTotal) * 100).toFixed(1) : '0.0';

            const files = await this.listFiles(folderName);
            let totalBackupSize = 0;
            for (const f of files) {
                totalBackupSize += f.size || 0;
            }

            return {
                email: this.mega.email || '',
                spaceUsed: spaceUsed,
                spaceTotal: spaceTotal,
                spaceFree: spaceFree,
                spaceUsedFormatted: this.formatBytes(spaceUsed),
                spaceTotalFormatted: this.formatBytes(spaceTotal),
                spaceFreeFormatted: this.formatBytes(spaceFree),
                percentUsed: percentUsed,
                cloudFilesCount: files.length,
                cloudFilesTotalSize: totalBackupSize,
                cloudFilesTotalSizeFormatted: this.formatBytes(totalBackupSize),
                cloudFiles: files
            };
        } catch (error) {
            console.error('[MEGA] Error getting account details:', error.message);
            throw error;
        }
    }

    /**
     * Get authentication status
     * @returns {Object} Status info
     */
    getStatus() {
        return {
            isAuthenticated: this.isAuthenticated,
            isConnected: this.isConnected(),
            lastAuthError: this.lastAuthError
        };
    }
}

// Create singleton instance
const megaService = new MegaCloudService();

module.exports = megaService;
module.exports.MegaCloudService = MegaCloudService;
