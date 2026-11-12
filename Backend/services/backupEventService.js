/**
 * Backup Event Service
 * Manages real-time notifications for backup queue status
 */

const EventEmitter = require('events');

class BackupEventEmitter extends EventEmitter {
    constructor() {
        super();
        this.maxListeners = 50;
        this.queue = [];
        this.currentStatus = null;
    }

    // Add event to queue and broadcast to all listeners
    addEvent(event) {
        const timestamp = new Date().toISOString();
        const eventData = {
            timestamp,
            ...event,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };

        this.queue.push(eventData);
        
        // Keep only last 100 events
        if (this.queue.length > 100) {
            this.queue.shift();
        }

        // Emit to all SSE clients
        this.emit('backup-event', eventData);
        
        console.log(`[BACKUP-EVENT] ${event.status}: ${event.message}`);
        
        return eventData;
    }

    // Backup started
    onBackupStart(backupType = 'auto') {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return this.addEvent({
            status: 'backup_started',
            type: backupType,
            message: `🔄 ${backupType.toUpperCase()} backup started at ${timeStr}`,
            icon: '⏳'
        });
    }

    // Backup progress
    onBackupProgress(message, progress = null) {
        return this.addEvent({
            status: 'backup_progress',
            message: `📊 ${message}`,
            progress,
            icon: '📈'
        });
    }

    // Backup completed
    onBackupComplete(backupFolder, sizeFormatted) {
        return this.addEvent({
            status: 'backup_completed',
            message: `✅ Backup completed: ${backupFolder} (${sizeFormatted})`,
            backupFolder,
            size: sizeFormatted,
            icon: '✓'
        });
    }

    // MEGA upload started
    onMegaUploadStart() {
        return this.addEvent({
            status: 'mega_upload_started',
            message: '🌐 Uploading to MEGA...',
            icon: '⏳'
        });
    }

    // MEGA upload progress
    onMegaUploadProgress(fileName, progress) {
        return this.addEvent({
            status: 'mega_upload_progress',
            message: `📤 Uploading: ${fileName}`,
            progress,
            icon: '📤'
        });
    }

    // MEGA upload completed
    onMegaUploadSuccess(fileName, sizeFormatted) {
        return this.addEvent({
            status: 'mega_upload_success',
            message: `✅ Uploaded successfully to MEGA: ${fileName} (${sizeFormatted})`,
            fileName,
            size: sizeFormatted,
            icon: '☁️'
        });
    }

    // Error occurred
    onError(message, error = null) {
        return this.addEvent({
            status: 'error',
            message: `❌ Error: ${message}`,
            error: error ? error.message : null,
            icon: '❌'
        });
    }

    // Get recent events
    getRecentEvents(limit = 20) {
        return this.queue.slice(-limit).reverse();
    }

    // Clear queue
    clearQueue() {
        this.queue = [];
    }
}

// Export singleton instance
module.exports = new BackupEventEmitter();
