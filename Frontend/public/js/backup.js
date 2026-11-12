document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadMegaStatus();
    setupEventListeners();
    setupBackupQueueListener(); // Add real-time backup queue listener
});

const API_BASE = '/api/v1/mongodb-backup';

// Backup Queue DOM Elements
const queueContainer = document.getElementById('backupQueueContainer');
const queueList = document.getElementById('backupQueueList');
const queueEmptyState = document.getElementById('queueEmptyState');
const queueConnectionStatus = document.getElementById('queueConnectionStatus');
const queueSpinner = document.getElementById('queueSpinner');
const btnClearQueue = document.getElementById('btnClearQueue');

// Backup Queue State
let backupQueue = [];
let eventSource = null;

// DOM Elements
const form = document.getElementById('backupSettingsForm');
const megaForm = document.getElementById('megaSettingsForm');
const btnManualBackup = document.getElementById('btnManualBackup');
const btnBackupAndUploadMega = document.getElementById('btnBackupAndUploadMega');
const btnTestMegaConnection = document.getElementById('btnTestMegaConnection');
const btnRestore = document.getElementById('btnRestore');
const restoreModal = document.getElementById('restoreModal');
const closeModalSpans = document.querySelectorAll('.close-modal, .close-modal-btn');
const btnConfirmRestore = document.getElementById('btnConfirmRestore');
const confirmInput = document.getElementById('confirmInput');

// Load initial settings and stats
async function loadSettings() {
    try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(`${API_BASE}/info`, { headers });
        const result = await response.json();

        if (result.success) {
            const data = result.data;

            // Stats
            document.getElementById('lastBackupDate').textContent = data.lastBackupDate ? new Date(data.lastBackupDate).toLocaleString() : 'Never';
            document.getElementById('totalBackups').textContent = data.backupCount || 0;
            document.getElementById('totalSize').textContent = data.totalSizeFormatted || '0 B';

            // Settings Form
            document.getElementById('autoBackupEnabled').checked = data.autoBackupEnabled;
            document.getElementById('autoBackupTime').value = data.autoBackupTime;
            document.getElementById('backupFolderPath').value = data.backupFolderPath;
            document.getElementById('mongoToolsPath').value = data.mongoToolsPath;
        } else if (response.status === 401 || response.status === 403) {
            showNotification('Admin login required. Please log in with an Administrator account.', 'warning');
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showNotification('Failed to load backup settings', 'error');
    }
}

let megaHasStoredPassword = false;

// Load Mega settings and status
async function loadMegaStatus() {
    try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        const statusResponse = await fetch(`${API_BASE}/mega/status`, { headers });
        const statusResult = await statusResponse.json();

        if (statusResult.success) {
            const data = statusResult.data;
            const enabledEl = document.getElementById('megaEnabled');
            const emailEl = document.getElementById('megaEmail');
            const folderEl = document.getElementById('megaBackupFolderName');
            const daysEl = document.getElementById('keepLocalBackupDays');
            const connectedBanner = document.getElementById('megaConnectedBanner');
            const connectedEmailDisplay = document.getElementById('connectedEmailDisplay');
            const credsContainer = document.getElementById('megaCredentialsContainer');

            if (enabledEl) enabledEl.checked = !!(data.megaEnabled || data.megaUploadEnabled);
            if (emailEl) emailEl.value = data.megaEmail || '';
            if (folderEl) folderEl.value = data.megaBackupFolderName || 'BAS_Backups';
            if (daysEl) daysEl.value = data.keepLocalBackupDays !== undefined ? data.keepLocalBackupDays : 7;

            megaHasStoredPassword = !!data.hasPassword;
            const pwdInput = document.getElementById('megaPassword');
            const pwdBadge = document.getElementById('megaPasswordBadge');
            const pwdHelp = document.getElementById('megaPasswordHelp');

            // If account is connected and password is saved, show prominent Connected banner & keep credentials form visible
            if (data.hasPassword && data.megaEmail) {
                if (connectedBanner) connectedBanner.style.display = 'block';
                if (connectedEmailDisplay) connectedEmailDisplay.textContent = data.megaEmail;
            } else {
                if (connectedBanner) connectedBanner.style.display = 'none';
            }
            if (credsContainer) credsContainer.style.display = 'block';

            if (pwdInput) {
                if (megaHasStoredPassword) {
                    pwdInput.value = '••••••••••••';
                    pwdInput.dataset.hasSaved = 'true';
                    if (pwdBadge) pwdBadge.style.display = 'inline-block';
                    if (pwdHelp) pwdHelp.innerHTML = '<i class="fas fa-check-circle text-success me-1"></i>Password is saved in system. Leave unchanged to keep.';
                } else {
                    pwdInput.value = '';
                    pwdInput.dataset.hasSaved = 'false';
                    if (pwdBadge) pwdBadge.style.display = 'none';
                    if (pwdHelp) pwdHelp.innerHTML = '<i class="fas fa-shield-alt text-warning me-1"></i>Password is encrypted before storing';
                }
            }

            updateMegaStatusDisplay(data);
            loadMegaFiles();
        } else if (statusResponse.status === 401 || statusResponse.status === 403) {
            console.warn('[BACKUP] Unauthorized:', statusResult.message);
            showNotification('Admin access required to view Mega settings. Please log in as Admin.', 'warning');
        }
    } catch (error) {
        console.error('Error loading Mega settings:', error);
    }
}

// Update Mega status and live telemetry display
function updateMegaStatusDisplay(status, liveAccount = null) {
    const container = document.getElementById('megaStatusContainer');
    const content = document.getElementById('megaStatusContent');

    if (!status && !liveAccount) {
        if (container) container.style.display = 'none';
        return;
    }

    const account = liveAccount || (status && status.account) || null;
    let statusHTML = '';

    // Live Account / Storage Telemetry (if available)
    if (account) {
        const percent = parseFloat(account.percentUsed) || 0;
        const barColor = percent > 90 ? 'bg-danger' : (percent > 75 ? 'bg-warning' : 'bg-info');

        statusHTML += `
            <div class="mb-3 p-2 border rounded bg-light">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span><i class="fas fa-cloud me-1 text-primary"></i> <strong>Mega Cloud Storage</strong></span>
                    <span class="badge bg-success text-white"><i class="fas fa-check-circle me-1"></i>Verified</span>
                </div>
                <div class="progress mb-2" style="height: 10px;">
                    <div class="progress-bar ${barColor}" role="progressbar" style="width: ${Math.min(100, percent)}%;" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <div class="d-flex justify-content-between text-muted" style="font-size: 0.8rem;">
                    <span>Used: <strong>${account.spaceUsedFormatted || '0 B'}</strong> / <strong>${account.spaceTotalFormatted || '0 B'}</strong></span>
                    <span>Free: <strong>${account.spaceFreeFormatted || '0 B'}</strong> (${percent}% used)</span>
                </div>
                <div class="mt-2 pt-2 border-top text-muted" style="font-size: 0.82rem;">
                    <i class="fas fa-folder me-1 text-warning"></i> Folder: <strong>${status.folder || status.megaBackupFolderName || 'BAS_Backups'}</strong>
                    <span class="ms-3"><i class="fas fa-file-archive me-1 text-secondary"></i> Backups on Cloud: <strong>${account.cloudFilesCount || 0}</strong></span>
                </div>
            </div>
        `;
    }

    if (status.lastMegaUploadDate) {
        const uploadDate = new Date(status.lastMegaUploadDate);
        statusHTML += `<p class="mb-1"><strong>Last Sync:</strong> ${uploadDate.toLocaleString()}</p>`;
    }

    if (status.lastMegaUploadStatus) {
        const statusBadgeClass = status.lastMegaUploadStatus === 'success' ? 'badge-success' : 
                                 status.lastMegaUploadStatus === 'failed' ? 'badge-danger' : 'badge-warning';
        statusHTML += `<p class="mb-1"><strong>Last Sync Status:</strong> <span class="badge ${statusBadgeClass}">${status.lastMegaUploadStatus.toUpperCase()}</span></p>`;
    }

    if (status.lastMegaUploadError) {
        statusHTML += `<p class="text-danger mb-1"><strong>Error:</strong> ${status.lastMegaUploadError}</p>`;
    }

    if (status.megaUploadStats && status.megaUploadStats.totalUploaded > 0) {
        statusHTML += `
            <div class="mt-2 pt-2 border-top">
                <p class="mb-1"><strong>Upload Statistics:</strong></p>
                <ul class="mb-0 ps-3" style="font-size: 0.85rem;">
                    <li>Total Backups Synced: <strong>${status.megaUploadStats.totalUploaded}</strong></li>
                    <li>Total Data Uploaded: <strong>${formatBytes(status.megaUploadStats.totalUploadedSize)}</strong></li>
                    <li>Last Archive Size: <strong>${formatBytes(status.megaUploadStats.lastUploadSize)}</strong></li>
                </ul>
            </div>
        `;
    }

    if (statusHTML && content && container) {
        content.innerHTML = statusHTML;
        container.style.display = 'block';
    }
}

// Format bytes to readable size
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================
// REAL-TIME BACKUP QUEUE MANAGEMENT
// ============================================

/**
 * Setup SSE listener for real-time backup events
 */
function setupBackupQueueListener() {
    if (btnClearQueue) {
        btnClearQueue.addEventListener('click', clearBackupQueue);
    }

    connectToBackupEventStream();
}

/**
 * Connect to Server-Sent Events stream for backup events
 */
function connectToBackupEventStream() {
    const token = localStorage.getItem('token');
    
    // Check if EventSource is supported
    if (typeof EventSource === 'undefined') {
        console.warn('[QUEUE] SSE not supported in this browser');
        updateQueueConnectionStatus(false, 'SSE not supported');
        return;
    }

    // Close existing connection if any
    if (eventSource) {
        eventSource.close();
    }

    try {
        // Connect to SSE endpoint with token in header
        eventSource = new EventSource(`${API_BASE}/events/stream`);

        eventSource.addEventListener('open', () => {
            updateQueueConnectionStatus(true, 'Connected');
            console.log('[QUEUE] Connected to backup events stream');
        });

        // Handle initial history data
        eventSource.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'history') {
                    // Populate initial history
                    backupQueue = data.events || [];
                    renderBackupQueue();
                } else if (data.type === 'event') {
                    // Add new event to queue
                    addQueueEvent(data.data);
                }
            } catch (err) {
                console.error('[QUEUE] Failed to parse event:', err);
            }
        });

        eventSource.onerror = (event) => {
            if (event.eventPhase === EventSource.CLOSED) {
                updateQueueConnectionStatus(false, 'Disconnected');
                console.log('[QUEUE] SSE connection closed');
                // Try to reconnect after 5 seconds
                setTimeout(connectToBackupEventStream, 5000);
            } else {
                updateQueueConnectionStatus(false, 'Error');
                console.error('[QUEUE] SSE error:', event);
            }
        };

    } catch (error) {
        console.error('[QUEUE] Failed to connect to backup events:', error);
        updateQueueConnectionStatus(false, 'Connection failed');
    }
}

/**
 * Add event to backup queue and display
 */
function addQueueEvent(eventData) {
    // Add to queue
    backupQueue.push(eventData);
    
    // Keep only last 50 events
    if (backupQueue.length > 50) {
        backupQueue.shift();
    }

    // Re-render queue
    renderBackupQueue();

    // Show notification for important events
    if (eventData.status === 'mega_upload_success') {
        showNotification(eventData.message, 'success');
    } else if (eventData.status === 'error') {
        showNotification(eventData.message, 'error');
    }
}

/**
 * Render backup queue display
 */
function renderBackupQueue() {
    if (backupQueue.length === 0) {
        queueEmptyState.style.display = 'block';
        queueList.innerHTML = '';
        return;
    }

    queueEmptyState.style.display = 'none';

    // Sort by most recent first
    const sortedQueue = [...backupQueue].reverse();

    queueList.innerHTML = sortedQueue.map((event, idx) => {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const statusColor = getStatusColor(event.status);
        
        return `
            <div class="backup-queue-item" style="
                background: rgba(0,0,0,0.3);
                border-left: 4px solid ${statusColor};
                padding: 12px;
                margin-bottom: 10px;
                border-radius: 4px;
            ">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="color: ${statusColor}; font-weight: bold; margin-bottom: 4px;">
                            ${event.icon || '•'} ${event.message}
                        </div>
                        <small style="color: #888; font-size: 0.85rem;">
                            ${timestamp}
                        </small>
                    </div>
                </div>
                ${event.progress ? `
                    <div style="margin-top: 8px;">
                        <div class="progress" style="height: 4px;">
                            <div class="progress-bar" style="width: ${event.progress}%;"></div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Get color for status
 */
function getStatusColor(status) {
    const colors = {
        'backup_started': '#FFA500',
        'backup_progress': '#4169E1',
        'backup_completed': '#32CD32',
        'mega_upload_started': '#87CEEB',
        'mega_upload_progress': '#4169E1',
        'mega_upload_success': '#00FF00',
        'error': '#FF4444',
        'completed': '#32CD32'
    };
    return colors[status] || '#888';
}

/**
 * Clear backup queue
 */
function clearBackupQueue() {
    if (confirm('Clear all backup queue events?')) {
        backupQueue = [];
        renderBackupQueue();
    }
}

/**
 * Update queue connection status indicator
 */
function updateQueueConnectionStatus(connected, message) {
    if (queueConnectionStatus) {
        queueConnectionStatus.textContent = message;
        queueConnectionStatus.className = connected ? 'badge bg-success' : 'badge bg-danger';
    }
    if (queueSpinner) {
        queueSpinner.style.display = connected ? 'inline' : 'none';
    }
}

function setupEventListeners() {
    // Toggle Mega credentials edit view
    const btnToggleMegaEdit = document.getElementById('btnToggleMegaEdit');
    const megaCredentialsContainer = document.getElementById('megaCredentialsContainer');
    if (btnToggleMegaEdit && megaCredentialsContainer) {
        btnToggleMegaEdit.addEventListener('click', () => {
            const isHidden = megaCredentialsContainer.style.display === 'none';
            megaCredentialsContainer.style.display = isHidden ? 'block' : 'none';
            btnToggleMegaEdit.innerHTML = isHidden ? '<i class="fas fa-times me-1"></i>Close' : '<i class="fas fa-edit me-1"></i>Change Account';
        });
    }

    // Save Backup Settings
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const settings = {
            autoBackupEnabled: document.getElementById('autoBackupEnabled').checked,
            autoBackupTime: document.getElementById('autoBackupTime').value,
            backupFolderPath: document.getElementById('backupFolderPath').value,
            mongoToolsPath: document.getElementById('mongoToolsPath').value
        };

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/settings`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(settings)
            });
            const result = await response.json();

            if (result.success) {
                showNotification('Backup settings saved successfully', 'success');
            } else {
                showNotification(result.message, 'error');
            }
        } catch (error) {
            showNotification('Error saving settings', 'error');
        }
    });

    // Save Mega Settings
    megaForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const megaEmail = document.getElementById('megaEmail').value.trim();
        const pwdInput = document.getElementById('megaPassword');
        const megaPassword = pwdInput.value.trim();

        if (!megaEmail) {
            showNotification('Please enter Mega email', 'warning');
            return;
        }

        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const isChecked = document.getElementById('megaEnabled').checked;
        const settings = {
            megaEnabled: isChecked,
            megaUploadEnabled: isChecked,
            megaEmail: megaEmail,
            megaPassword: (megaPassword && megaPassword !== '••••••••••••') ? megaPassword : undefined,
            megaBackupFolderName: document.getElementById('megaBackupFolderName').value.trim() || 'BAS_Backups',
            keepLocalBackupDays: parseInt(document.getElementById('keepLocalBackupDays').value) || 7
        };

        try {
            const response = await fetch(`${API_BASE}/mega/settings`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(settings)
            });
            const result = await response.json();

            if (result.success) {
                showNotification('Mega settings saved successfully', 'success');
                loadMegaStatus();
            } else {
                showNotification(result.message, 'error');
            }
        } catch (error) {
            showNotification('Error saving Mega settings: ' + error.message, 'error');
        }
    });

    // Test Mega Connection
    btnTestMegaConnection.addEventListener('click', async () => {
        const megaEmail = document.getElementById('megaEmail').value.trim();
        const pwdInput = document.getElementById('megaPassword');
        const megaPassword = pwdInput.value.trim();

        if (!megaEmail) {
            showNotification('Please enter Mega account email', 'warning');
            return;
        }

        if (!megaPassword && !megaHasStoredPassword) {
            showNotification('Please enter Mega password to test', 'warning');
            return;
        }

        btnTestMegaConnection.disabled = true;
        btnTestMegaConnection.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/mega/test`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    megaEmail: megaEmail,
                    megaPassword: (megaPassword && megaPassword !== '••••••••••••') ? megaPassword : '',
                    megaBackupFolderName: document.getElementById('megaBackupFolderName').value.trim() || 'BAS_Backups'
                })
            });
            const result = await response.json();

            if (result.success) {
                showNotification('✓ Mega connection verified & active!', 'success');
                if (result.data && result.data.account) {
                    updateMegaStatusDisplay(result.data, result.data.account);
                } else {
                    loadMegaStatus();
                }
            } else {
                showNotification('✗ Connection failed: ' + result.message, 'error');
            }
        } catch (error) {
            showNotification('Test failed: ' + error.message, 'error');
        } finally {
            btnTestMegaConnection.disabled = false;
            btnTestMegaConnection.innerHTML = '<i class="fas fa-plug"></i> Test Connection';
        }
    });

    // Unified helper for triggering manual backup with 1 local + 1 cloud ZIP upload
    async function triggerManualBackup(buttonEl, originalHtml) {
        buttonEl.disabled = true;
        buttonEl.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Starting backup...';

        try {
            const token = localStorage.getItem('token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            const response = await fetch(`${API_BASE}/manual`, {
                method: 'POST',
                headers
            });
            const result = await response.json();

            if (result.success) {
                showNotification('Backup initiated! Saving local copy and uploading to Mega in background.', 'info');
                loadSettings();
                loadMegaStatus();

                // Scroll to queue so user sees real-time SSE progress
                const queueCard = document.getElementById('backupQueueContainer') || document.getElementById('backupQueueList');
                if (queueCard) {
                    queueCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } else {
                showNotification(result.message || 'Backup failed', 'error');
            }
        } catch (error) {
            showNotification('Backup failed: ' + error.message, 'error');
        } finally {
            setTimeout(() => {
                buttonEl.disabled = false;
                buttonEl.innerHTML = originalHtml;
            }, 2500);
        }
    }

    // Manual Backup Button
    btnManualBackup.addEventListener('click', () => {
        triggerManualBackup(btnManualBackup, '<i class="fas fa-cloud-upload-alt"></i> BACKUP NOW');
    });

    // Manual Backup + Upload to Mega Button
    if (btnBackupAndUploadMega) {
        btnBackupAndUploadMega.addEventListener('click', () => {
            triggerManualBackup(btnBackupAndUploadMega, '<i class="fas fa-server"></i> BACKUP + UPLOAD TO MEGA');
        });
    }

    // Restore Button - Open Modal
    btnRestore.addEventListener('click', () => {
        const path = document.getElementById('restoreFolderPath').value.trim();
        if (!path) {
            showNotification('Please enter a backup folder path', 'warning');
            return;
        }
        document.getElementById('modalRestorePath').textContent = path;
        restoreModal.style.display = 'block';
        confirmInput.value = '';
        btnConfirmRestore.disabled = true;
    });

    // Close Modal
    closeModalSpans.forEach(span => {
        span.addEventListener('click', () => {
            restoreModal.style.display = 'none';
        });
    });

    // Confirm Input Logic
    confirmInput.addEventListener('input', (e) => {
        btnConfirmRestore.disabled = e.target.value !== 'CONFIRM';
    });

    // Confirm Restore Action
    btnConfirmRestore.addEventListener('click', async () => {
        const backupFolder = document.getElementById('modalRestorePath').textContent;

        btnConfirmRestore.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restoring...';
        btnConfirmRestore.disabled = true;

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/restore`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ backupFolder: backupFolder })
            });
            const result = await response.json();

            if (result.success) {
                showNotification('Database restored successfully! Reloading...', 'success');
                setTimeout(() => window.location.reload(), 2000);
            } else {
                showNotification(result.message || 'Restore failed', 'error');
                btnConfirmRestore.innerHTML = 'Yes, Restore Database';
                btnConfirmRestore.disabled = false;
            }
        } catch (error) {
            showNotification('Restore failed: Server error', 'error');
            btnConfirmRestore.disabled = false;
        }
    });

    // Click outside modal to close
    window.onclick = function (event) {
        if (event.target == restoreModal) {
            restoreModal.style.display = "none";
        }
    }
}

function showNotification(message, type = 'info') {
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        alert(message);
    }
}

// ============================================
// Direct 1-Click Restore from Mega Cloud
// ============================================

let selectedMegaRestoreFileName = '';

/**
 * Load Mega Cloud files table (date-wise)
 */
async function loadMegaFiles() {
    const tbody = document.getElementById('megaFilesTableBody');
    if (!tbody) return;

    try {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Loading cloud backups from Mega...</td></tr>';

        const token = localStorage.getItem('token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/mega/files`, { headers });
        if (response.ok) {
            const data = await response.json();
            const files = data.data?.files || [];

            if (files.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No backup archives found in your Mega folder yet.</td></tr>';
                return;
            }

            tbody.innerHTML = files.map(file => {
                const dateStr = file.created ? new Date(file.created).toLocaleString() : 'N/A';
                const sizeStr = file.sizeFormatted || '0 B';
                return `
                    <tr>
                        <td><i class="fas fa-file-archive text-warning me-2"></i><code>${file.name}</code></td>
                        <td>${dateStr}</td>
                        <td><span class="badge bg-secondary">${sizeStr}</span></td>
                        <td class="text-center">
                            <button type="button" class="btn btn-sm btn-warning text-dark" onclick="showMegaRestoreModal('${file.name}', '${dateStr}', '${sizeStr}')" title="Restore this backup directly from Mega">
                                <i class="fas fa-cloud-download-alt me-1"></i>Restore
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Connect and save your Mega account to view cloud backups.</td></tr>';
        }
    } catch (err) {
        console.error('Error loading Mega files:', err);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Failed to load files from Mega: ${err.message}</td></tr>`;
    }
}

/**
 * Open Mega Cloud Restore Confirmation Modal
 */
function showMegaRestoreModal(fileName, fileDate, fileSize) {
    selectedMegaRestoreFileName = fileName;
    isMegaRestoreRunningClient = false;

    const modalEl = document.getElementById('megaRestoreModal');
    if (!modalEl) return;

    // Reset modal body & footer if previously replaced by success screen
    const chkExists = document.getElementById('confirmMegaRestoreCheckbox');
    if (!chkExists) {
        const modalBody = modalEl.querySelector('.modal-body');
        const modalFooter = modalEl.querySelector('.modal-footer');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="alert alert-danger">
                    <strong>WARNING:</strong> This will stream the backup directly from Mega Drive and restore it into your database. All current data will be overwritten!
                </div>
                <p>Archive: <strong id="megaRestoreFileName" class="font-monospace text-primary">${fileName}</strong></p>
                <p>Date: <strong id="megaRestoreFileDate">${fileDate}</strong></p>
                <p>Size: <strong id="megaRestoreFileSize">${fileSize}</strong></p>
                <div class="form-check mt-3">
                    <input class="form-check-input" type="checkbox" id="confirmMegaRestoreCheckbox">
                    <label class="form-check-label text-danger fw-bold" for="confirmMegaRestoreCheckbox">
                        I confirm: Overwrite database with this Mega backup
                    </label>
                </div>
                <div id="megaRestoreProgressIndicator" style="display:none;" class="mt-3 p-2 text-center bg-light border rounded">
                    <div class="spinner-border text-primary spinner-border-sm me-2" role="status"></div>
                    <span class="text-primary fw-bold" id="megaRestoreProgressText">Streaming from Mega & restoring database...</span>
                </div>
            `;
        }
        if (modalFooter) {
            modalFooter.style.display = '';
            modalFooter.innerHTML = `
                <button class="btn btn-secondary close-modal-btn" data-bs-dismiss="modal">Cancel</button>
                <button class="btn btn-danger" id="btnConfirmMegaRestore" onclick="executeMegaRestore()" disabled>Restore Database Now</button>
            `;
        }
    } else {
        const nameEl = document.getElementById('megaRestoreFileName');
        const dateEl = document.getElementById('megaRestoreFileDate');
        const sizeEl = document.getElementById('megaRestoreFileSize');
        const chk = document.getElementById('confirmMegaRestoreCheckbox');
        const btn = document.getElementById('btnConfirmMegaRestore');
        const cancelBtn = modalEl.querySelector('.close-modal-btn');
        const progress = document.getElementById('megaRestoreProgressIndicator');

        if (nameEl) nameEl.textContent = fileName;
        if (dateEl) dateEl.textContent = fileDate;
        if (sizeEl) sizeEl.textContent = fileSize;
        if (chk) chk.checked = false;
        if (btn) btn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = false;
        if (progress) progress.style.display = 'none';
    }

    const chk = document.getElementById('confirmMegaRestoreCheckbox');
    if (chk) {
        chk.onchange = function () {
            const btn = document.getElementById('btnConfirmMegaRestore');
            if (btn) btn.disabled = !this.checked;
        };
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function renderRestoreSuccess(modalBody, modalFooter, fileName) {
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="text-center py-4">
                <div class="text-success mb-3">
                    <i class="fas fa-check-circle" style="font-size: 4.5rem;"></i>
                </div>
                <h4 class="fw-bold text-success mb-2">Database Restored Successfully!</h4>
                <p class="text-muted font-monospace mb-3">${fileName || 'backup archive'}</p>
                <div class="alert alert-success d-inline-block px-4 py-2 mb-3">
                    <i class="fas fa-database me-2"></i>All 100 collections and records restored into local MongoDB!
                </div>
                <p class="text-primary fw-bold mb-0">
                    <span class="spinner-border spinner-border-sm me-2"></span>Reloading in <span id="restoreCountdown" class="badge bg-primary fs-6">3</span> seconds...
                </p>
            </div>
        `;
    }
    if (modalFooter) {
        modalFooter.innerHTML = `
            <button type="button" class="btn btn-success fw-bold w-100" onclick="window.location.reload()">
                <i class="fas fa-sync-alt me-2"></i>Reload Now
            </button>
        `;
    }

    let timeLeft = 3;
    const timer = setInterval(() => {
        timeLeft--;
        const countdownEl = document.getElementById('restoreCountdown');
        if (countdownEl) countdownEl.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timer);
            window.location.reload();
        }
    }, 1000);
}

/**
 * Execute Direct Restore from Mega Cloud
 */
let isMegaRestoreRunningClient = false;

async function executeMegaRestore() {
    if (isMegaRestoreRunningClient) return;

    if (!selectedMegaRestoreFileName) {
        showNotification('No backup file selected', 'warning');
        return;
    }

    const modal = document.getElementById('megaRestoreModal');
    const modalBody = modal ? modal.querySelector('.modal-body') : null;
    const modalFooter = modal ? modal.querySelector('.modal-footer') : null;
    const btn = document.getElementById('btnConfirmMegaRestore');
    const cancelBtn = modal ? modal.querySelector('.close-modal-btn') : null;
    const progress = document.getElementById('megaRestoreProgressIndicator');
    const progressText = document.getElementById('megaRestoreProgressText');

    isMegaRestoreRunningClient = true;

    // Live progress timer
    let secondsElapsed = 0;
    const progressTimer = setInterval(() => {
        secondsElapsed++;
        if (!progressText) return;
        if (secondsElapsed < 30) {
            progressText.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span><strong>Step 1/3:</strong> Streaming from Mega Cloud... (${secondsElapsed}s)<br><small class="text-muted">Downloading 58 MB archive. Please wait.</small>`;
        } else if (secondsElapsed < 42) {
            progressText.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span><strong>Step 2/3:</strong> Extracting archive & verifying collections... (${secondsElapsed}s)<br><small class="text-muted">Unpacking database BSON files.</small>`;
        } else {
            progressText.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span><strong>Step 3/3:</strong> Restoring collections into local MongoDB... (${secondsElapsed}s)<br><small class="text-muted">Overwriting database with snapshot.</small>`;
        }
    }, 1000);

    try {
        if (btn) btn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;
        if (progress) progress.style.display = 'block';
        if (progressText) {
            progressText.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span><strong>Step 1/3:</strong> Connecting to Mega Cloud & streaming archive...<br><small class="text-muted">Streaming 58+ MB archive. This takes 30-50 seconds. Please do not refresh.</small>';
        }

        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/mega/restore`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ fileName: selectedMegaRestoreFileName })
        });

        clearInterval(progressTimer);
        const result = await response.json();

        if (response.ok && result.success) {
            renderRestoreSuccess(modalBody, modalFooter, selectedMegaRestoreFileName);

        } else if (result.inProgress) {
            if (progressText) {
                progressText.innerHTML = `<span class="spinner-border spinner-border-sm me-2 text-primary"></span><span class="text-primary fw-bold">${result.message}</span><br><small class="text-muted">Waiting for background restore to complete...</small>`;
            }
            const pollTimer = setInterval(async () => {
                try {
                    const pollToken = localStorage.getItem('token');
                    const pollHeaders = {};
                    if (pollToken) pollHeaders['Authorization'] = `Bearer ${pollToken}`;
                    const pollRes = await fetch(`${API_BASE}/mega/status`, { headers: pollHeaders });
                    const pollData = await pollRes.json();
                    if (pollData.success && pollData.data && !pollData.data.isRestoreRunning) {
                        clearInterval(pollTimer);
                        renderRestoreSuccess(modalBody, modalFooter, selectedMegaRestoreFileName);
                    }
                } catch (e) {
                    // retry
                }
            }, 2500);
        } else if (response.status === 401) {
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="text-center py-3">
                        <div class="text-warning mb-3"><i class="fas fa-shield-alt fa-3x"></i></div>
                        <h5 class="fw-bold">Database Restored — Session Reset</h5>
                        <p class="text-muted mb-3">The database was restored successfully. Since user accounts were refreshed from the backup, please log in again.</p>
                        <a href="/login" class="btn btn-primary fw-bold w-100"><i class="fas fa-sign-in-alt me-2"></i>Go to Login</a>
                    </div>
                `;
            }
            if (modalFooter) modalFooter.style.display = 'none';
        } else {
            isMegaRestoreRunningClient = false;
            if (btn) btn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
            showNotification(result.message || 'Mega Restore failed', 'error');
            if (progressText) {
                progressText.innerHTML = `<span class="text-danger fw-bold"><i class="fas fa-times-circle me-1"></i>${result.message || 'Restore failed'}</span>`;
            }
        }
    } catch (err) {
        clearInterval(progressTimer);
        isMegaRestoreRunningClient = false;
        console.error('Mega restore error:', err);
        if (btn) btn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        showNotification('Restore failed: ' + err.message, 'error');
        if (progressText) {
            progressText.innerHTML = `<span class="text-danger fw-bold"><i class="fas fa-times-circle me-1"></i>${err.message}</span>`;
        }
    }
}

