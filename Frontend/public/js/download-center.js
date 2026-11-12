// ═══════════════════════════════════════════════════════════════════════════════
// DOWNLOAD CENTER — Client-Side Logic
// ═══════════════════════════════════════════════════════════════════════════════

// --- State ---
let dcCurrentPage = 1;
let dcTotalPages = 1;
let dcNextCleanupTime = null;
let dcCountdownInterval = null;
let dcSelectedFileObj = null;
let dcSelectedFiles = [];

const DC_ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.rtf', '.ppt', '.pptx'];
const DC_MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

// --- Initialization ---
document.addEventListener('DOMContentLoaded', function () {
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }
    setUserName();
    setupManagementControls();
    initDropzone();
    loadStats();
    loadFiles();
    loadNotifications();
    loadBranchOptions();
    startCountdown();

    // Mark all notifications read
    const markAllBtn = document.getElementById('dcMarkAllReadBtn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', markAllNotificationsRead);
    }

    // Search debounce
    let searchTimer;
    document.getElementById('dcSearchInput').addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            dcCurrentPage = 1;
            loadFiles();
        }, 400);
    });

    // Category filter
    document.getElementById('dcCategoryFilter').addEventListener('change', function () {
        dcCurrentPage = 1;
        loadFiles();
    });

    // Branch filter
    document.getElementById('dcBranchFilter').addEventListener('change', function () {
        dcCurrentPage = 1;
        loadFiles();
    });
});

// --- Auth Helpers ---
function isAuthenticated() {
    return !!localStorage.getItem('token');
}

function setUserName() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const el = document.getElementById('userName');
        if (el && user.name) el.textContent = user.name;
    } catch (e) { /* ignore */ }
}

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return { 'Authorization': `Bearer ${token}` };
}

function canManageDownloadCenter() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    return user.role === 'admin' || rights.admin === true || rights.administration === true || rights.download_center === true;
}

function setupManagementControls() {
    if (!canManageDownloadCenter()) {
        const uploadButton = document.getElementById('dcUploadBtn');
        if (uploadButton) uploadButton.style.display = 'none';
    }
}

// --- Load Stats ---
async function loadStats() {
    try {
        const res = await fetch('/api/v1/download-center/stats', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            document.getElementById('statTotalFiles').textContent = data.data.totalFiles || 0;
            const sizeMB = ((data.data.totalSize || 0) / (1024 * 1024)).toFixed(1);
            document.getElementById('statTotalSize').textContent = `${sizeMB} MB`;
            document.getElementById('statRecentUploads').textContent = data.data.recentUploads || 0;

            if (data.data.nextCleanup) {
                dcNextCleanupTime = new Date(data.data.nextCleanup);
                updateCountdownDisplay();
                const time = dcNextCleanupTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                document.getElementById('statNextCleanup').textContent = time;
            }
        }
    } catch (err) {
        console.error('[DC] Stats load error:', err);
    }
}

// --- Load Files ---
async function loadFiles() {
    try {
        const search = document.getElementById('dcSearchInput').value;
        const category = document.getElementById('dcCategoryFilter').value;
        const branch = document.getElementById('dcBranchFilter').value;

        let url = `/api/v1/download-center?page=${dcCurrentPage}&limit=12`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (category && category !== 'all') url += `&category=${category}`;
        if (branch) url += `&branch=${encodeURIComponent(branch)}`;

        const res = await fetch(url, { headers: getAuthHeaders() });
        const data = await res.json();

        if (data.success) {
            dcTotalPages = data.totalPages || 1;

            if (data.nextCleanup) {
                dcNextCleanupTime = new Date(data.nextCleanup);
            }

            renderFiles(data.data || []);
            renderPagination(data);
        }
    } catch (err) {
        console.error('[DC] Files load error:', err);
    }
}

// --- Render Files ---
function renderFiles(files) {
    const grid = document.getElementById('dcFileGrid');
    const empty = document.getElementById('dcEmptyState');

    if (files.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    grid.innerHTML = files.map(file => {
        const iconClass = getFileIconClass(file.fileExtension);
        const iconFA = getFileIcon(file.fileExtension);
        const sizeStr = formatFileSize(file.fileSize);
        const dateStr = new Date(file.createdAt).toLocaleString();
        const uploaderName = file.uploadedBy ? file.uploadedBy.name : 'Unknown';
        const expiryBadge = getExpiryBadge(file.expiresAt);
        const autoBadge = file.isAutoSent ? '<span class="dc-auto-badge"><i class="fas fa-robot"></i> Auto-sent</span>' : '';
        const branchTags = file.targetBranches && file.targetBranches.length > 0
            ? `<div class="dc-branch-tags">${file.targetBranches.map(b => `<span class="dc-branch-tag">${b}</span>`).join('')}</div>`
            : '<div class="dc-branch-tags"><span class="dc-branch-tag">All Branches</span></div>';

        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const canDelete = canManageDownloadCenter() &&
            (currentUser._id === (file.uploadedBy && file.uploadedBy._id) || currentUser.role === 'admin');
        const deleteBtn = canDelete
            ? `<button class="dc-file-btn dc-file-btn-delete" onclick="deleteFile('${file._id}')"><i class="fas fa-trash"></i> Delete</button>`
            : '';
        const renameBtn = canDelete
            ? `<button class="dc-file-btn dc-file-btn-rename" onclick="renameFile('${file._id}')" title="Rename file title"><i class="fas fa-edit"></i> Rename</button>`
            : '';

        return `
            <div class="dc-file-card" data-id="${file._id}">
                <div class="dc-file-header">
                    <div class="dc-file-icon ${iconClass}"><i class="fas ${iconFA}"></i></div>
                    <div style="flex:1; min-width: 0;">
                        <div class="dc-file-title">${escapeHtml(file.title)}</div>
                        ${file.description ? `<div class="dc-file-desc">${escapeHtml(file.description)}</div>` : ''}
                    </div>
                    ${expiryBadge}
                </div>
                <div class="dc-file-meta">
                    <span class="dc-file-meta-item"><i class="fas fa-user"></i> ${escapeHtml(uploaderName)}</span>
                    <span class="dc-file-meta-item"><i class="fas fa-clock"></i> ${dateStr}</span>
                    <span class="dc-file-meta-item"><i class="fas fa-weight-hanging"></i> ${sizeStr}</span>
                    <span class="dc-file-meta-item"><i class="fas fa-download"></i> ${file.downloadCount || 0} downloads</span>
                    ${autoBadge}
                </div>
                ${branchTags}
                <div class="dc-file-actions">
                    <button class="dc-file-btn dc-file-btn-download" onclick="downloadFile('${file._id}', '${escapeHtml(file.originalFilename)}')">
                        <i class="fas fa-download"></i> Download
                    </button>
                    ${renameBtn}
                    ${deleteBtn}
                </div>
            </div>
        `;
    }).join('');
}

// --- Render Pagination ---
function renderPagination(data) {
    const pag = document.getElementById('dcPagination');
    if (data.totalPages <= 1) {
        pag.style.display = 'none';
        return;
    }
    pag.style.display = 'flex';
    document.getElementById('dcPrevPage').disabled = dcCurrentPage <= 1;
    document.getElementById('dcNextPage').disabled = dcCurrentPage >= data.totalPages;
    document.getElementById('dcPaginationInfo').textContent = `Page ${dcCurrentPage} of ${data.totalPages} (${data.total} files)`;
}

function changePage(delta) {
    dcCurrentPage += delta;
    if (dcCurrentPage < 1) dcCurrentPage = 1;
    if (dcCurrentPage > dcTotalPages) dcCurrentPage = dcTotalPages;
    loadFiles();
}

// --- Countdown Timer ---
function startCountdown() {
    if (dcCountdownInterval) clearInterval(dcCountdownInterval);
    dcCountdownInterval = setInterval(updateCountdownDisplay, 1000);
}

function updateCountdownDisplay() {
    if (!dcNextCleanupTime) return;
    const now = new Date();
    const diff = dcNextCleanupTime.getTime() - now.getTime();

    if (diff <= 0) {
        document.getElementById('dcCountdownTimer').textContent = 'Cleanup in progress...';
        // Refresh data after a short delay
        setTimeout(() => {
            loadStats();
            loadFiles();
        }, 5000);
        return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const h = String(hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    const s = String(seconds).padStart(2, '0');

    document.getElementById('dcCountdownTimer').textContent = `${h}h ${m}m ${s}s`;
}

// --- Expiry Badge ---
function getExpiryBadge(expiresAt) {
    if (!expiresAt) return '';
    const now = new Date();
    const exp = new Date(expiresAt);
    const diff = exp.getTime() - now.getTime();
    const hoursLeft = diff / (1000 * 60 * 60);

    let colorClass, timeStr;
    if (hoursLeft > 6) {
        colorClass = 'green';
    } else if (hoursLeft > 2) {
        colorClass = 'yellow';
    } else {
        colorClass = 'red';
    }

    if (hoursLeft <= 0) {
        timeStr = 'Expired';
    } else if (hoursLeft < 1) {
        timeStr = `${Math.ceil(hoursLeft * 60)}m left`;
    } else {
        timeStr = `${Math.floor(hoursLeft)}h ${Math.ceil((hoursLeft % 1) * 60)}m left`;
    }

    return `<span class="dc-expiry-badge ${colorClass}"><i class="fas fa-clock"></i> ${timeStr}</span>`;
}

// --- File Helpers ---
function getFileIconClass(ext) {
    if (!ext) return 'other';
    ext = ext.toLowerCase().replace('.', '');
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'doc';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xls';
    if (['ppt', 'pptx'].includes(ext)) return 'ppt';
    return 'other';
}

function getFileIcon(ext) {
    if (!ext) return 'fa-file';
    ext = ext.toLowerCase().replace('.', '');
    if (ext === 'pdf') return 'fa-file-pdf';
    if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fa-file-excel';
    if (['ppt', 'pptx'].includes(ext)) return 'fa-file-powerpoint';
    if (ext === 'txt') return 'fa-file-alt';
    return 'fa-file';
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Download File ---
function downloadFile(id, filename) {
    const token = localStorage.getItem('token');
    const link = document.createElement('a');
    link.href = `/api/v1/download-center/${id}/download?token=${token}`;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Download started!', 'success');

    // Refresh after download to update counter
    setTimeout(loadFiles, 1000);
}

// --- Delete File ---
async function deleteFile(id) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
        const res = await fetch(`/api/v1/download-center/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            showToast('File deleted successfully', 'success');
            loadFiles();
            loadStats();
        } else {
            showToast(data.message || 'Delete failed', 'error');
        }
    } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
}

// --- Rename File ---
async function renameFile(id) {
    const card = document.querySelector(`.dc-file-card[data-id="${id}"]`);
    const currentTitleEl = card ? card.querySelector('.dc-file-title') : null;
    const currentTitle = currentTitleEl ? currentTitleEl.textContent.trim() : '';

    const newTitle = prompt('Enter new document name:', currentTitle);
    if (!newTitle || newTitle.trim() === '' || newTitle.trim() === currentTitle) return;

    try {
        const res = await fetch(`/api/v1/download-center/${id}`, {
            method: 'PUT',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: newTitle.trim() })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Document renamed successfully', 'success');
            loadFiles();
        } else {
            showToast(data.message || 'Failed to rename document', 'error');
        }
    } catch (err) {
        showToast('Error renaming file: ' + err.message, 'error');
    }
}

// --- Upload Modal ---
function openUploadModal() {
    document.getElementById('dcUploadModal').classList.add('active');
    resetUploadForm();
}

function closeUploadModal() {
    document.getElementById('dcUploadModal').classList.remove('active');
    resetUploadForm();
}

function toggleUploadBranchSelect() {
    const isSpecific = document.getElementById('dcUploadAudienceSpecific')?.checked;
    const wrap = document.getElementById('dcUploadBranchDropdownWrap');
    if (wrap) {
        wrap.style.display = isSpecific ? 'block' : 'none';
    }
}

function resetUploadForm() {
    dcSelectedFiles = [];
    dcSelectedFileObj = null;
    const fileInput = document.getElementById('dcFileInput');
    if (fileInput) fileInput.value = '';
    const titleInput = document.getElementById('dcFileTitle');
    if (titleInput) titleInput.value = '';
    const descInput = document.getElementById('dcFileDesc');
    if (descInput) descInput.value = '';

    const audAll = document.getElementById('dcUploadAudienceAll');
    if (audAll) audAll.checked = true;
    toggleUploadBranchSelect();

    const branchSelect = document.getElementById('dcUploadBranchSelect');
    if (branchSelect) branchSelect.value = '';

    renderSelectedFilesList();

    const progressWrap = document.getElementById('dcProgressWrap');
    if (progressWrap) progressWrap.classList.remove('active');
    const progressFill = document.getElementById('dcProgressFill');
    if (progressFill) progressFill.style.width = '0%';
    const submitBtn = document.getElementById('dcSubmitUpload');
    if (submitBtn) submitBtn.disabled = false;
}

// --- Dropzone & Multi-file Selection ---
function initDropzone() {
    const dropzone = document.getElementById('dcDropzone');
    const fileInput = document.getElementById('dcFileInput');

    // Click to browse
    dropzone.addEventListener('click', () => fileInput.click());

    // File selected via input
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleSelectedFiles(e.target.files);
        }
    });

    // Drag events
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleSelectedFiles(e.dataTransfer.files);
        }
    });

    // Close modal on overlay click
    document.getElementById('dcUploadModal').addEventListener('click', (e) => {
        if (e.target.id === 'dcUploadModal') closeUploadModal();
    });
}

function handleSelectedFiles(files) {
    if (!files || files.length === 0) return;

    let rejectedErrors = [];
    Array.from(files).forEach(file => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!DC_ALLOWED_EXTENSIONS.includes(ext)) {
            rejectedErrors.push(`"${file.name}": unsupported type`);
            return;
        }
        if (file.size > DC_MAX_FILE_SIZE) {
            rejectedErrors.push(`"${file.name}": exceeds 30MB`);
            return;
        }
        // Avoid adding duplicate file
        if (!dcSelectedFiles.some(f => f.name === file.name && f.size === file.size)) {
            dcSelectedFiles.push(file);
        }
    });

    if (rejectedErrors.length > 0) {
        showToast(rejectedErrors.join(', '), 'error');
    }

    renderSelectedFilesList();
}

function renderSelectedFilesList() {
    const container = document.getElementById('dcSelectedFilesContainer');
    const list = document.getElementById('dcSelectedFilesList');
    const countEl = document.getElementById('dcSelectedFilesCount');
    const dropzone = document.getElementById('dcDropzone');
    if (!container || !list || !countEl || !dropzone) return;

    if (dcSelectedFiles.length === 0) {
        container.style.display = 'none';
        list.innerHTML = '';
        dropzone.classList.remove('has-file');
        dropzone.querySelector('p').textContent = 'Drag & drop files here, or click to browse';
        return;
    }

    container.style.display = 'block';
    dropzone.classList.add('has-file');
    dropzone.querySelector('p').textContent = `${dcSelectedFiles.length} file(s) selected`;
    countEl.textContent = `${dcSelectedFiles.length} File${dcSelectedFiles.length > 1 ? 's' : ''} Selected`;

    list.innerHTML = dcSelectedFiles.map((file, idx) => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        let icon = 'fa-file';
        let color = '#64748b';
        if (ext === '.pdf') { icon = 'fa-file-pdf'; color = '#ef4444'; }
        else if (['.xls', '.xlsx', '.csv'].includes(ext)) { icon = 'fa-file-excel'; color = '#10b981'; }
        else if (['.doc', '.docx', '.txt', '.rtf'].includes(ext)) { icon = 'fa-file-word'; color = '#2563eb'; }
        else if (['.ppt', '.pptx'].includes(ext)) { icon = 'fa-file-powerpoint'; color = '#f97316'; }

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; background: #fff; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 0.82rem;">
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                    <i class="fas ${icon}" style="color: ${color}; font-size: 1rem; flex-shrink: 0;"></i>
                    <span style="font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                    <span style="color: #64748b; font-size: 0.75rem; flex-shrink: 0;">(${formatFileSize(file.size)})</span>
                </div>
                <button type="button" onclick="removeSelectedFile(${idx})" style="border: none; background: none; color: #94a3b8; font-size: 1.1rem; cursor: pointer; padding: 0 4px; line-height: 1;" title="Remove file">&times;</button>
            </div>
        `;
    }).join('');

    // If only 1 file and title is empty, set title
    const titleInput = document.getElementById('dcFileTitle');
    if (titleInput && !titleInput.value && dcSelectedFiles.length === 1) {
        titleInput.value = dcSelectedFiles[0].name.replace(/\.[^.]+$/, '');
    }
}

function removeSelectedFile(index) {
    if (index >= 0 && index < dcSelectedFiles.length) {
        dcSelectedFiles.splice(index, 1);
        renderSelectedFilesList();
    }
}

function clearAllSelectedFiles() {
    dcSelectedFiles = [];
    const fileInput = document.getElementById('dcFileInput');
    if (fileInput) fileInput.value = '';
    renderSelectedFilesList();
}

// --- Submit Upload ---
async function submitUpload() {
    if (!dcSelectedFiles || dcSelectedFiles.length === 0) {
        showToast('Please select at least one file to upload', 'error');
        return;
    }

    const isSpecific = document.getElementById('dcUploadAudienceSpecific')?.checked;
    let targetBranches = [];
    if (isSpecific) {
        const branchSelect = document.getElementById('dcUploadBranchSelect');
        const selectedBranch = branchSelect ? branchSelect.value.trim() : '';
        if (!selectedBranch) {
            showToast('Please select a target branch', 'error');
            return;
        }
        targetBranches = [selectedBranch];
    }

    const title = document.getElementById('dcFileTitle')?.value.trim() || '';
    const description = document.getElementById('dcFileDesc')?.value.trim() || '';

    const submitBtn = document.getElementById('dcSubmitUpload');
    submitBtn.disabled = true;

    const progressWrap = document.getElementById('dcProgressWrap');
    progressWrap.classList.add('active');

    const formData = new FormData();
    dcSelectedFiles.forEach(file => {
        formData.append('files', file);
    });
    if (title) formData.append('title', title);
    if (description) formData.append('description', description);
    if (targetBranches.length > 0) {
        formData.append('targetBranches', JSON.stringify(targetBranches));
    }

    try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/v1/download-center/upload');
        xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);

        // Progress tracking
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                document.getElementById('dcProgressFill').style.width = pct + '%';
                document.getElementById('dcProgressText').textContent = `Uploading ${dcSelectedFiles.length} file(s)... ${pct}%`;
            }
        };

        xhr.onload = () => {
            try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300 && data.success) {
                    const branchInfo = targetBranches.length > 0 ? ` to ${targetBranches.join(', ')}` : ' (All Branches)';
                    showToast(`✓ ${dcSelectedFiles.length} file(s) uploaded successfully${branchInfo}!`, 'success');
                    closeUploadModal();
                    loadFiles();
                    loadStats();
                    loadNotifications();
                    sessionStorage.removeItem('last_seen_boss_doc_id');

                    // Immediately trigger boss document check and broadcast event
                    try {
                        window.dispatchEvent(new CustomEvent('downloadCenter:fileSent', { detail: data.data }));
                    } catch (e) {}
                    if (window.sidebarNavInstance && typeof window.sidebarNavInstance.checkBossDocuments === 'function') {
                        setTimeout(() => window.sidebarNavInstance.checkBossDocuments(false), 300);
                    }
                } else {
                    const errors = data.errors ? data.errors.join('. ') : (data.message || 'Upload failed');
                    showToast(errors, 'error');
                    submitBtn.disabled = false;
                    progressWrap.classList.remove('active');
                }
            } catch (e) {
                showToast('Upload failed: Invalid server response', 'error');
                submitBtn.disabled = false;
                progressWrap.classList.remove('active');
            }
        };

        xhr.onerror = () => {
            showToast('Upload failed: Network error', 'error');
            submitBtn.disabled = false;
            progressWrap.classList.remove('active');
        };

        xhr.send(formData);
    } catch (err) {
        showToast('Upload failed: ' + err.message, 'error');
        submitBtn.disabled = false;
        progressWrap.classList.remove('active');
    }
}

// --- Load Branch Options ---
async function loadBranchOptions() {
    try {
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        const userRole = (userData.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin';
        const userBranches = Array.isArray(userData.branch)
            ? userData.branch.filter(Boolean)
            : (userData.branch ? [userData.branch] : []);

        const res = await fetch('/api/v1/stores', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.data) {
            const allBranches = data.data.map(s => s.name || s.branch).filter(Boolean);
            const filterSelect = document.getElementById('dcBranchFilter');
            const uploadBranchSelect = document.getElementById('dcUploadBranchSelect');

            if (filterSelect) {
                if (!isAdmin && userBranches.length > 0) {
                    // Non-admin user can only filter by their branch
                    filterSelect.innerHTML = `<option value="">My Branch (${userBranches[0]}) & All Branches</option>`;
                    userBranches.forEach(b => {
                        filterSelect.innerHTML += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
                    });
                } else {
                    allBranches.forEach(branch => {
                        filterSelect.innerHTML += `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`;
                    });
                }
            }

            if (uploadBranchSelect) {
                uploadBranchSelect.innerHTML = '<option value="">-- Select Target Branch --</option>';
                allBranches.forEach(branch => {
                    uploadBranchSelect.innerHTML += `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`;
                });
            }
        }
    } catch (err) {
        console.warn('[DC] Branch load warning:', err.message);
    }
}

// --- Load Notifications ---
async function loadNotifications() {
    try {
        const box = document.getElementById('dcNotificationsBox');
        const list = document.getElementById('dcNotificationsList');
        const countBadge = document.getElementById('dcNotificationCountBadge');
        if (!box || !list) return;

        const res = await fetch('/api/v1/notifications?isRead=false&limit=10', {
            headers: getAuthHeaders()
        });
        const data = await res.json();

        if (data.success && data.data && data.data.length > 0) {
            box.style.display = 'block';
            if (countBadge) countBadge.textContent = data.unreadCount || data.data.length;

            list.innerHTML = data.data.map(n => `
                <div class="dc-notification" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f8fafc;border-left:4px solid #1e4c8c;border-radius:6px;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:36px;height:36px;border-radius:50%;background:#e0f2fe;display:flex;align-items:center;justify-content:center;color:#0284c7;font-size:1rem;">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div>
                            <strong style="color:#0f172a;font-size:0.92rem;display:block;">${escapeHtml(n.title)}</strong>
                            <span style="color:#475569;font-size:0.83rem;display:block;">${escapeHtml(n.message)}</span>
                            <small style="color:#94a3b8;font-size:0.75rem;">${new Date(n.createdAt).toLocaleString()}</small>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        ${n.relatedFile ? `<a href="/api/v1/download-center/${n.relatedFile._id || n.relatedFile}/download" class="btn btn-sm btn-primary py-1 px-2" style="font-size:0.8rem;" target="_blank"><i class="fas fa-download me-1"></i> Download</a>` : ''}
                        <button type="button" class="btn btn-sm btn-outline-secondary py-1 px-2" style="font-size:0.8rem;" onclick="markSingleNotificationRead('${n._id}')"><i class="fas fa-check"></i></button>
                    </div>
                </div>
            `).join('');
        } else {
            box.style.display = 'none';
        }
    } catch (err) {
        console.warn('[DC] Notifications load warning:', err.message);
    }
}

// --- Mark Single Notification Read ---
async function markSingleNotificationRead(id) {
    try {
        await fetch(`/api/v1/notifications/${id}/read`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        loadNotifications();
    } catch (e) {
        console.warn('Could not mark notification read:', e);
    }
}

// --- Mark All Notifications Read ---
async function markAllNotificationsRead() {
    try {
        const res = await fetch('/api/v1/notifications/read-all', {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            const box = document.getElementById('dcNotificationsBox');
            if (box) box.style.display = 'none';
            showToast('✓ All notifications marked as read', 'success');
        }
    } catch (e) {
        showToast('Failed to mark notifications read: ' + e.message, 'error');
    }
}


// --- Toast ---
function showToast(message, type = 'info') {
    const toast = document.getElementById('dcToast');
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    toast.className = `dc-toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${escapeHtml(message)}`;

    // Force reflow to restart animation
    toast.offsetHeight;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}
