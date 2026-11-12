// Settings Management JavaScript
document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    // Set user name in navbar
    setUserName();

    // Initialize settings page
    initSettingsPage();

    // Setup permission-based tab visibility (must run before tab parameter handling)
    setupTabPermissions();

    // Handle tab parameter (e.g., ?tab=company, ?tab=invoice, ?tab=tax, ?tab=backup)
    // This runs AFTER permissions to ensure proper tab visibility
    handleTabParameter();
});

// Set user name in navbar
function setUserName() {
    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.name || user.email;
    }
}

// Setup permission-based tab visibility
function setupTabPermissions() {
    const user = getCurrentUser();
    if (!user) return;

    // Admin bypass removed to enforce granular controls for all users
    // Let rights evaluate normally.

    // Get user rights
    let rights = user.rights || {};
    if (Object.keys(rights).length === 0) {
        if (user.group && user.group.rights) {
            rights = user.group.rights;
        } else if (user.groupId && user.groupId.rights) {
            rights = user.groupId.rights;
        }
    }

    console.log('User rights:', rights); // Debug log

    // Hide tabs based on permissions
    const tabItems = document.querySelectorAll('#settingsTabs .nav-item[data-permission]');
    let firstVisibleTab = null;
    let visibleCount = 0;

    tabItems.forEach(tabItem => {
        const permission = tabItem.getAttribute('data-permission');
        const isGranted = rights[permission] === true || rights[permission] === 'true';
        console.log('Checking permission:', permission, 'Has access:', isGranted); // Debug log

        if (permission && !isGranted) {
            // Hide the tab - user doesn't have this specific permission
            tabItem.style.setProperty('display', 'none', 'important');
        } else {
            // Show the tab
            tabItem.style.setProperty('display', '', 'important');
            visibleCount++;
            if (!firstVisibleTab) {
                // Track first visible tab
                firstVisibleTab = tabItem.querySelector('button');
            }
        }
    });

    console.log('Visible tabs count:', visibleCount); // Debug log

    // If no tabs are visible, hide the entire settings page or show a message
    if (visibleCount === 0) {
        const container = document.querySelector('.container-fluid.mt-4');
        if (container) {
            container.innerHTML = '<div class="alert alert-warning mt-4"><i class="fas fa-exclamation-triangle me-2"></i>You do not have permission to access any settings tabs. Please contact your administrator.</div>';
        }
        return;
    }

    // If the default active tab is hidden, activate the first visible tab
    const activeTab = document.querySelector('#settingsTabs .nav-link.active');
    const activeTabParent = activeTab ? activeTab.closest('.nav-item') : null;

    if (activeTabParent && activeTabParent.style.display === 'none' && firstVisibleTab) {
        // Remove active class from hidden tab
        activeTab.classList.remove('active');

        // Activate first visible tab
        firstVisibleTab.classList.add('active');

        // Show corresponding tab pane
        const targetId = firstVisibleTab.getAttribute('data-bs-target');
        if (targetId) {
            // Hide all tab panes
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
            });

            // Show target pane
            const targetPane = document.querySelector(targetId);
            if (targetPane) {
                targetPane.classList.add('show', 'active');
            }
        }
    }
}

// Handle tab parameter to show only selected tab
function handleTabParameter() {
    // Get the 'tab' query parameter from URL
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');

    if (!tabParam) {
        // No tab parameter - show all tabs (default behavior)
        return;
    }

    // Map tab parameter to tab IDs and content IDs
    const tabMap = {
        'company': { tabId: 'company-tab', contentId: 'company' },
        'invoice': { tabId: 'invoice-tab', contentId: 'invoice' },
        'tax': { tabId: 'tax-tab', contentId: 'tax' },
        'backup': { tabId: 'backup-tab', contentId: 'backup' },
        'apiKey': { tabId: 'apiKey-tab', contentId: 'apiKey' }
    };

    const tabInfo = tabMap[tabParam];
    if (tabInfo) {
        const tabButton = document.getElementById(tabInfo.tabId);
        const tabParent = tabButton ? tabButton.closest('.nav-item') : null;

        if (tabButton && tabParent) {
            // Remove the initial hiding style
            const hideStyle = document.getElementById('tab-hide-style');
            if (hideStyle) {
                hideStyle.remove();
            }

            // Hide ALL tab content panes
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
                pane.style.setProperty('display', 'none', 'important');
            });

            // Check if the tab was hidden by setupTabPermissions
            if (tabParent.style.display !== 'none') {
                // Hide the entire tab navigation bar to make it feel like a separate screen
                const tabsContainer = document.getElementById('settingsTabs').closest('.row');
                if (tabsContainer) {
                    tabsContainer.style.setProperty('display', 'none', 'important');
                }

                // Update the header title if possible
                const headerTitle = document.getElementById('globalHeaderTitle');
                if (headerTitle) {
                    const displayNames = {
                        'company': 'Company Settings',
                        'invoice': 'Invoice Settings',
                        'tax': 'Tax Settings',
                        'backup': 'Backup & Restore',
                        'apiKey': 'API Key Configuration'
                    };
                    headerTitle.textContent = displayNames[tabParam] || 'Settings';
                }

                // Show ONLY the selected tab content
                const selectedContent = document.getElementById(tabInfo.contentId);
                if (selectedContent) {
                    selectedContent.style.setProperty('display', 'block', 'important');
                    selectedContent.classList.add('show', 'active');
                }

                // Activate the tab using Bootstrap's tab API
                const tab = new bootstrap.Tab(tabButton);
                tab.show();
            }

            // Load backup configuration if backup tab is selected
            if (tabParam === 'backup') {
                // Use setTimeout to ensure DOM is ready
                setTimeout(() => {
                    if (typeof loadBackupInfo === 'function') loadBackupInfo();
                    if (typeof loadAvailableBackups === 'function') loadAvailableBackups();
                    if (typeof loadBackupConfiguration === 'function') loadBackupConfiguration();
                    if (typeof loadMegaConfiguration === 'function') loadMegaConfiguration();
                }, 100);
            }

            console.log('Showing only tab:', tabParam, 'Content:', tabInfo.contentId); // Debug log
        }
    }
}

// Initialize settings page
function initSettingsPage() {
    // Load all settings at once
    loadAllSettings();
    loadAllSettings();


    // Event listeners
    document.getElementById('companyForm').addEventListener('submit', handleCompanySubmit);
    document.getElementById('invoiceForm').addEventListener('submit', handleInvoiceSubmit);
    document.getElementById('taxForm').addEventListener('submit', handleTaxSubmit);

    // Logo preview
    document.getElementById('companyLogo').addEventListener('change', handleLogoChange);

    // Add scroll-to-view functionality for all tabs
    setupTabScrolling();
}

// Setup automatic scrolling when tabs are clicked
function setupTabScrolling() {
    const tabButtons = document.querySelectorAll('#settingsTabs button[data-bs-toggle="tab"]');

    tabButtons.forEach(button => {
        button.addEventListener('shown.bs.tab', function (event) {
            // Get the target tab pane ID from the button's data-bs-target attribute
            const targetId = event.target.getAttribute('data-bs-target');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                // Scroll to the tab content with smooth animation
                // Add a small delay to ensure the tab content is fully rendered
                setTimeout(() => {
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }, 100);
            }
        });
    });
}

// Load all settings at once (optimization)
async function loadAllSettings() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/settings', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            // Populate all tabs with the same data
            populateCompanySettings(data);
            populateInvoiceSettings(data);
            populateTaxSettings(data);
            populateApiKeySettings(data);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Populate company settings form
function populateCompanySettings(data) {
    const settings = data.data || data;
    document.getElementById('companyName').value = settings.companyName || '';
    document.getElementById('companyEmail').value = settings.email || '';
    document.getElementById('companyPhone').value = settings.phone || '';
    document.getElementById('companyWebsite').value = settings.website || '';
    document.getElementById('companyAddress').value = settings.address || '';
    document.getElementById('companyCity').value = settings.city || '';
    document.getElementById('companyState').value = settings.state || '';
    document.getElementById('companyPostalCode').value = settings.postalCode || '';
    document.getElementById('companyGSTIN').value = settings.taxNumber || '';
    document.getElementById('companyPAN').value = settings.pan || '';

    if (settings.logo) {
        document.getElementById('logoPreview').src = settings.logo;
        document.getElementById('logoPreview').style.display = 'block';
    }
}

// Populate invoice settings form
function populateInvoiceSettings(data) {
    const settings = data.data || data;
    document.getElementById('invoicePrefix').value = settings.invoicePrefix || '';
    document.getElementById('invoiceStartNumber').value = settings.invoiceStartNumber || 1;
    document.getElementById('billPrefix').value = settings.billPrefix || '';
    document.getElementById('billStartNumber').value = settings.billStartNumber || 1;
    document.getElementById('quotationPrefix').value = settings.quotationPrefix || '';
    document.getElementById('quotationStartNumber').value = settings.quotationStartNumber || 1;
    document.getElementById('invoiceTerms').value = settings.terms || '';
    document.getElementById('includeTaxInInvoice').checked = settings.includeTax || false;
    document.getElementById('includeLogoInInvoice').checked = settings.includeLogo || false;
}

// Populate tax settings form
function populateTaxSettings(data) {
    const settings = data.data || data;
    document.getElementById('defaultTaxRate').value = settings.defaultTaxPercent || 0;
    document.getElementById('cgstRate').value = settings.cgstRate || 0;
    document.getElementById('sgstRate').value = settings.sgstRate || 0;
    document.getElementById('igstRate').value = settings.igstRate || 0;
    document.getElementById('cessRate').value = settings.cessRate || 0;
    document.getElementById('enableReverseCharge').checked = settings.enableReverseCharge || false;
}

// Load company settings
async function loadCompanySettings() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/settings', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const settings = data.data;

            // Fill company form
            document.getElementById('companyName').value = settings.companyName || '';
            document.getElementById('companyEmail').value = settings.email || '';
            document.getElementById('companyPhone').value = settings.phone || '';
            document.getElementById('companyWebsite').value = settings.website || '';
            document.getElementById('companyAddress').value = settings.address || '';
            document.getElementById('companyCity').value = settings.city || '';
            document.getElementById('companyState').value = settings.state || '';
            document.getElementById('companyPostalCode').value = settings.postalCode || '';
            document.getElementById('companyGSTIN').value = settings.taxNumber || '';
            document.getElementById('companyPAN').value = settings.pan || '';

            // Show logo if exists
            if (settings.logo) {
                document.getElementById('logoPreview').src = settings.logo;
                document.getElementById('logoPreview').style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error loading company settings:', error);
    }
}

// Load invoice settings
async function loadInvoiceSettings() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/settings', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const settings = data.data;

            // Fill invoice form
            document.getElementById('invoicePrefix').value = settings.invoicePrefix || 'INV';
            // These fields might not persist if not in schema, but we fill them if they exist in response
            document.getElementById('invoiceStartNumber').value = settings.invoiceStartNumber || 1;
            document.getElementById('billPrefix').value = settings.billPrefix || 'BILL';
            document.getElementById('billStartNumber').value = settings.billStartNumber || 1;
            document.getElementById('quotationPrefix').value = settings.quotationPrefix || 'QUOT';
            document.getElementById('quotationStartNumber').value = settings.quotationStartNumber || 1;
            document.getElementById('invoiceTerms').value = settings.terms || '';
            document.getElementById('includeTaxInInvoice').checked = settings.includeTax || false;
            document.getElementById('includeLogoInInvoice').checked = settings.includeLogo || false;
        }
    } catch (error) {
        console.error('Error loading invoice settings:', error);
    }
}

// Load tax settings
async function loadTaxSettings() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/settings', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const settings = data.data;

            // Fill tax form
            document.getElementById('defaultTaxRate').value = settings.defaultTaxPercent || 0;
            document.getElementById('taxCalculationMethod').value = settings.taxType || 'exclusive'; // Assuming taxType maps to calculation method or similar
            // These might not be in schema
            document.getElementById('cgstRate').value = settings.cgstRate || 0;
            document.getElementById('sgstRate').value = settings.sgstRate || 0;
            document.getElementById('igstRate').value = settings.igstRate || 0;
            document.getElementById('cessRate').value = settings.cessRate || 0;
            document.getElementById('enableReverseCharge').checked = settings.enableReverseCharge || false;
        }
    } catch (error) {
        console.error('Error loading tax settings:', error);
    }
}



// Handle company form submit
async function handleCompanySubmit(e) {
    e.preventDefault();

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const formData = {
            companyName: document.getElementById('companyName').value,
            email: document.getElementById('companyEmail').value,
            phone: document.getElementById('companyPhone').value,
            website: document.getElementById('companyWebsite').value,
            address: document.getElementById('companyAddress').value,
            city: document.getElementById('companyCity').value,
            state: document.getElementById('companyState').value,
            postalCode: document.getElementById('companyPostalCode').value,
            taxNumber: document.getElementById('companyGSTIN').value,
            pan: document.getElementById('companyPAN').value
        };

        // Handle logo upload
        const logoPreview = document.getElementById('logoPreview');
        if (logoPreview && logoPreview.src && logoPreview.style.display !== 'none' && logoPreview.src.startsWith('data:image')) {
            formData.logo = logoPreview.src;
        }

        const response = await fetch('/api/v1/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            showSuccess('Company settings updated successfully');
        } else {
            throw new Error('Failed to update settings');
        }
    } catch (error) {
        console.error('Error updating settings:', error);
        showError('Failed to update settings');
    } finally {
        hideLoading();
    }
}

// Handle invoice form submit
async function handleInvoiceSubmit(e) {
    e.preventDefault();

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const formData = {
            invoicePrefix: document.getElementById('invoicePrefix').value,
            // Sending all fields, backend model might filter unknown ones
            invoiceStartNumber: parseInt(document.getElementById('invoiceStartNumber').value),
            billPrefix: document.getElementById('billPrefix').value,
            billStartNumber: parseInt(document.getElementById('billStartNumber').value),
            quotationPrefix: document.getElementById('quotationPrefix').value,
            quotationStartNumber: parseInt(document.getElementById('quotationStartNumber').value),
            terms: document.getElementById('invoiceTerms').value,
            includeTax: document.getElementById('includeTaxInInvoice').checked,
            includeLogo: document.getElementById('includeLogoInInvoice').checked
        };

        const response = await fetch('/api/v1/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            showSuccess('Invoice settings updated successfully');
        } else {
            throw new Error('Failed to update settings');
        }
    } catch (error) {
        console.error('Error updating settings:', error);
        showError('Failed to update settings');
    } finally {
        hideLoading();
    }
}

// Handle tax form submit
async function handleTaxSubmit(e) {
    e.preventDefault();

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const formData = {
            defaultTaxPercent: parseFloat(document.getElementById('defaultTaxRate').value) || 0,
            // Don't send taxType - it doesn't match the form field
            // taxType: document.getElementById('taxCalculationMethod').value,
            cgstRate: parseFloat(document.getElementById('cgstRate').value) || 0,
            sgstRate: parseFloat(document.getElementById('sgstRate').value) || 0,
            igstRate: parseFloat(document.getElementById('igstRate').value) || 0,
            cessRate: parseFloat(document.getElementById('cessRate').value) || 0,
            enableReverseCharge: document.getElementById('enableReverseCharge').checked
        };

        const response = await fetch('/api/v1/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            showSuccess('Tax settings updated successfully');
        } else {
            throw new Error('Failed to update settings');
        }
    } catch (error) {
        console.error('Error updating settings:', error);
        showError('Failed to update settings');
    } finally {
        hideLoading();
    }
}

// Handle backup settings submit
async function handleBackupSettingsSubmit(e) {
    e.preventDefault();

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const formData = {
            backupEnabled: document.getElementById('enableAutoBackup').checked,
            backupFrequency: document.getElementById('backupFrequency').value,
            backupRetentionDays: parseInt(document.getElementById('backupRetentionDays').value),
            // backupPath not in schema, ignoring
            // backupPath: document.getElementById('backupPath').value
        };

        const response = await fetch('/api/v1/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            showSuccess('Backup settings updated successfully');
        } else {
            throw new Error('Failed to update settings');
        }
    } catch (error) {
        console.error('Error updating backup settings:', error);
        showError('Failed to update settings');
    } finally {
        hideLoading();
    }
}

// Handle logo change
function handleLogoChange(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('logoPreview').src = e.target.result;
            document.getElementById('logoPreview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}



// Create backup
async function createBackup() {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/backup/export', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showSuccess('Backup created successfully');
        } else {
            showError('Failed to create backup');
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        showError('Failed to create backup');
    } finally {
        hideLoading();
    }
}

// Restore backup
async function restoreBackup() {
    const fileInput = document.getElementById('backupFile');
    const file = fileInput.files[0];

    if (!file) {
        showError('Please select a backup file');
        return;
    }

    if (!confirm('Restoring from backup will overwrite all current data. Are you sure?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('backup', file);

        const response = await fetch('/api/v1/backup/import', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (response.ok) {
            showSuccess('Backup restored successfully');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showError('Failed to restore backup');
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
        showError('Failed to restore backup');
    } finally {
        hideLoading();
    }
}

// ============================================
// MongoDB Backup & Restore Functions
// ============================================

// Load backup information on page load
document.addEventListener('DOMContentLoaded', function () {
    // Load backup info when backup tab is shown
    const backupTab = document.getElementById('backup-tab');
    if (backupTab) {
        backupTab.addEventListener('shown.bs.tab', function () {
            loadBackupInfo();
            loadAvailableBackups();
            loadBackupConfiguration();
            loadMegaConfiguration();
        });
    }

    // Setup backup config form
    const backupConfigForm = document.getElementById('backupConfigForm');
    if (backupConfigForm) {
        backupConfigForm.addEventListener('submit', saveBackupConfiguration);
    }

    // Setup Mega config form
    const megaConfigForm = document.getElementById('megaConfigForm');
    if (megaConfigForm) {
        megaConfigForm.addEventListener('submit', saveMegaConfiguration);
    }

    // Setup Mega test connection button
    const testMegaBtn = document.getElementById('testMegaConnectionSettings');
    if (testMegaBtn) {
        testMegaBtn.addEventListener('click', testMegaConnection);
    }

    // Setup Mega toggle edit view button
    const btnToggleMegaEditSettings = document.getElementById('btnToggleMegaEditSettings');
    const megaCredentialsContainerSettings = document.getElementById('megaCredentialsContainerSettings');
    if (btnToggleMegaEditSettings && megaCredentialsContainerSettings) {
        btnToggleMegaEditSettings.addEventListener('click', () => {
            const isHidden = megaCredentialsContainerSettings.style.display === 'none';
            megaCredentialsContainerSettings.style.display = isHidden ? 'block' : 'none';
            btnToggleMegaEditSettings.innerHTML = isHidden ? '<i class="fas fa-times me-1"></i>Close' : '<i class="fas fa-edit me-1"></i>Change Account';
        });
    }

    // Setup restore modal checkbox
    const confirmRestore = document.getElementById('confirmRestore');
    if (confirmRestore) {
        confirmRestore.addEventListener('change', function () {
            document.getElementById('confirmRestoreBtn').disabled = !this.checked;
        });
    }

    // Setup Mega restore modal checkbox
    const confirmMegaRestoreCheckbox = document.getElementById('confirmMegaRestoreCheckbox');
    if (confirmMegaRestoreCheckbox) {
        confirmMegaRestoreCheckbox.addEventListener('change', function () {
            const btn = document.getElementById('btnConfirmMegaRestore');
            if (btn) btn.disabled = !this.checked;
        });
    }
});

/**
 * Load backup information (last backup date, count, size)
 */
async function loadBackupInfo() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/mongodb-backup/info', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const info = data.data;

            // Update UI
            document.getElementById('lastBackupDate').textContent =
                info.lastBackupDate ? new Date(info.lastBackupDate).toLocaleString() : 'Never';
            document.getElementById('backupCount').textContent = info.backupCount || '0';
            document.getElementById('totalBackupSize').textContent = info.totalSizeFormatted || '0 B';
        } else {
            console.error('Failed to load backup info');
        }
    } catch (error) {
        console.error('Error loading backup info:', error);
    }
}

/**
 * Perform manual backup
 */
async function performManualBackup() {
    const btn = document.getElementById('manualBackupBtn');
    const originalText = btn.innerHTML;

    try {
        // Show loading state
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Creating Backup...';

        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/mongodb-backup/manual', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (response.ok) {
            // Backup runs in background — show progress message and poll for completion
            showBackupAlert('info', '⏳ Backup started in background. The backup list will refresh automatically in 30 seconds...');

            // Reload backup list after 30s to show the new backup
            setTimeout(() => {
                loadBackupInfo();
                loadAvailableBackups();
                loadMegaConfiguration();
                showBackupAlert('success', '✓ Backup process complete. Check the list below.');
            }, 30000);
        } else {
            showBackupAlert('danger', `✗ Backup failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        showBackupAlert('danger', '✗ Backup failed: ' + error.message);
    } finally {
        // Restore button state
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

/**
 * Load available backups list
 */
async function loadAvailableBackups() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/mongodb-backup/list', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const backups = data.data;

            const tbody = document.getElementById('backupsTableBody');

            if (backups.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center text-muted">
                            <i class="fas fa-folder-open me-2"></i>No backups available
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = backups.map(backup => `
                <tr>
                    <td>
                        <i class="fas fa-folder text-warning me-2"></i>
                        <code>${backup.name}</code>
                    </td>
                    <td>${new Date(backup.createdAt).toLocaleString()}</td>
                    <td>
                        <span class="badge ${backup.type === 'Auto' ? 'bg-info' : 'bg-secondary'}">
                            ${backup.type || 'Manual'}
                        </span>
                    </td>
                    <td>${backup.sizeFormatted}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-info text-white me-1" onclick="uploadBackupFromListToMega('${backup.name}')" title="Upload to Mega Cloud">
                            <i class="fas fa-cloud-upload-alt"></i>
                        </button>
                        <button class="btn btn-sm btn-warning me-1" onclick="restoreBackupFromList('${backup.name}')" title="Restore">
                            <i class="fas fa-upload"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteBackupFromList('${backup.name}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');

            // Also update restore modal dropdown
            updateRestoreDropdown(backups);
        } else {
            console.error('Failed to load backups list');
        }
    } catch (error) {
        console.error('Error loading backups:', error);
    }
}

/**
 * Update restore modal dropdown with available backups
 */
function updateRestoreDropdown(backups) {
    const select = document.getElementById('restoreBackupSelect');
    if (!select) return;

    if (backups.length === 0) {
        select.innerHTML = '<option value="">No backups available</option>';
        return;
    }

    select.innerHTML = '<option value="">Select a backup...</option>' +
        backups.map(backup =>
            `<option value="${backup.name}">${backup.name} (${new Date(backup.createdAt).toLocaleString()})</option>`
        ).join('');
}

/**
 * Show restore modal
 */
function showRestoreModal() {
    // Load backups first
    loadAvailableBackups();

    // Reset modal state
    document.getElementById('confirmRestore').checked = false;
    document.getElementById('confirmRestoreBtn').disabled = true;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('restoreModal'));
    modal.show();
}

/**
 * Restore backup from list (quick restore)
 */
function restoreBackupFromList(backupName) {
    // Set the backup in dropdown
    document.getElementById('restoreBackupSelect').value = backupName;

    // Show modal
    showRestoreModal();
}

/**
 * Perform restore operation
 */
async function performRestore() {
    const backupFolder = document.getElementById('restoreBackupSelect').value;

    if (!backupFolder) {
        showBackupAlert('warning', 'Please select a backup to restore');
        return;
    }

    const btn = document.getElementById('confirmRestoreBtn');
    const originalText = btn.innerHTML;

    try {
        // Show loading state
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Restoring...';

        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/mongodb-backup/restore', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ backupFolder })
        });

        const result = await response.json();

        if (response.ok) {
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('restoreModal')).hide();

            showBackupAlert('success', '✓ Database restored successfully! Page will reload in 3 seconds...');

            // Reload page after 3 seconds
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            showBackupAlert('danger', `✗ Restore failed: ${result.message}`);
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
        showBackupAlert('danger', '✗ Restore failed: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

/**
 * Delete backup from list
 */
async function deleteBackupFromList(backupName) {
    if (!confirm(`Are you sure you want to delete backup: ${backupName}?`)) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/mongodb-backup/${encodeURIComponent(backupName)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();

        if (response.ok) {
            showBackupAlert('success', '✓ Backup deleted successfully');
            loadBackupInfo();
            loadAvailableBackups();
        } else {
            showBackupAlert('danger', `✗ Delete failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Error deleting backup:', error);
        showBackupAlert('danger', '✗ Delete failed: ' + error.message);
    }
}

/**
 * Upload specific backup from list to Mega Cloud
 */
async function uploadBackupFromListToMega(backupName) {
    if (!confirm(`Upload "${backupName}" to your Mega Cloud Drive?`)) {
        return;
    }

    try {
        showBackupAlert('info', `⏳ Compressing and uploading "${backupName}" to Mega Cloud Drive... Please wait.`);
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/mongodb-backup/mega/upload/${encodeURIComponent(backupName)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        if (response.ok && result.success) {
            const fileName = result.data?.fileName || backupName;
            const speed = result.data?.speed ? ` (${result.data.speed} MB/s)` : '';
            showBackupAlert('success', `✓ Successfully uploaded to Mega Drive: ${fileName}${speed}!`);
            loadMegaConfiguration();
        } else {
            showBackupAlert('danger', `✗ Mega upload failed: ${result.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error uploading to Mega:', error);
        showBackupAlert('danger', `✗ Mega upload error: ${error.message}`);
    }
}

/**
 * Load backup configuration
 */
async function loadBackupConfiguration() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/mongodb-backup/info', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const info = data.data;

            // Populate form
            document.getElementById('backupFolderPath').value = info.backupFolderPath || './backups';
            document.getElementById('mongoToolsPath').value = info.mongoToolsPath || '';
            document.getElementById('autoBackupEnabled').checked = info.autoBackupEnabled || false;
            document.getElementById('autoBackupTime').value = info.autoBackupTime || '02:00';
        }
    } catch (error) {
        console.error('Error loading backup configuration:', error);
    }
}

/**
 * Save backup configuration
 */
async function saveBackupConfiguration(e) {
    e.preventDefault();

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const formData = {
            backupFolderPath: document.getElementById('backupFolderPath').value,
            mongoToolsPath: document.getElementById('mongoToolsPath').value,
            autoBackupEnabled: document.getElementById('autoBackupEnabled').checked,
            autoBackupTime: document.getElementById('autoBackupTime').value
        };

        const response = await fetch('/api/v1/mongodb-backup/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            showBackupAlert('success', '✓ Backup configuration saved successfully');
        } else {
            showBackupAlert('danger', `✗ Save failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Error saving backup configuration:', error);
        showBackupAlert('danger', '✗ Save failed: ' + error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Show backup alert message
 */
function showBackupAlert(type, message) {
    const container = document.getElementById('backupAlertContainer');
    if (!container) return;

    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.role = 'alert';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    container.innerHTML = '';
    container.appendChild(alert);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 150);
    }, 5000);
}

// ============================================
// Mega Cloud Backup Functions
// ============================================

let settingsMegaHasStoredPassword = false;

/**
 * Load Mega configuration
 */
async function loadMegaConfiguration() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/mongodb-backup/mega/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const settings = data.data;

            // Populate form
            document.getElementById('megaEnabledSettings').checked = !!(settings.megaEnabled || settings.megaUploadEnabled);
            document.getElementById('megaEmailSettings').value = settings.megaEmail || '';
            document.getElementById('megaBackupFolderSettings').value = settings.megaBackupFolderName || 'BAS_Backups';
            document.getElementById('keepLocalBackupDaysSettings').value = settings.keepLocalBackupDays || 7;

            settingsMegaHasStoredPassword = !!settings.hasPassword;
            const pwdInput = document.getElementById('megaPasswordSettings');
            if (pwdInput) {
                if (settingsMegaHasStoredPassword) {
                    pwdInput.value = '••••••••••••';
                } else {
                    pwdInput.value = '';
                }
            }

            // If account is connected and password saved, show connected banner and ensure credentials form is visible
            const connectedBanner = document.getElementById('megaConnectedBannerSettings');
            const connectedEmailDisplay = document.getElementById('connectedEmailDisplaySettings');
            const credsContainer = document.getElementById('megaCredentialsContainerSettings');

            if (settings.hasPassword && settings.megaEmail) {
                if (connectedBanner) connectedBanner.style.display = 'block';
                if (connectedEmailDisplay) connectedEmailDisplay.textContent = settings.megaEmail;
            } else {
                if (connectedBanner) connectedBanner.style.display = 'none';
            }
            if (credsContainer) credsContainer.style.display = 'block';

            // Update status display
            updateMegaStatusDisplay(settings);

            // Load Mega Drive files list
            loadMegaFilesTable();
        }
    } catch (error) {
        console.error('Error loading Mega configuration:', error);
    }
}

/**
 * Update Mega status display
 */
function updateMegaStatusDisplay(status, liveAccount = null) {
    const container = document.getElementById('megaStatusContainerSettings');
    const content = document.getElementById('megaStatusContentSettings');

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
        statusHTML += `<p class="mb-1"><strong>Status:</strong> <span class="badge ${statusBadgeClass}">${status.lastMegaUploadStatus.toUpperCase()}</span></p>`;
    }

    if (status.lastMegaUploadError) {
        statusHTML += `<p class="text-danger mb-1"><strong>Error:</strong> ${status.lastMegaUploadError}</p>`;
    }

    if (status.megaUploadStats && status.megaUploadStats.totalUploaded > 0) {
        const totalSize = status.megaUploadStats.totalUploadedSize;
        const sizeFormatted = formatBytesForSettings(totalSize);
        const lastSize = formatBytesForSettings(status.megaUploadStats.lastUploadSize);
        
        statusHTML += `
            <div class="mt-2 pt-2 border-top">
                <p class="mb-1"><strong>Upload Statistics:</strong></p>
                <ul class="mb-0 ps-3" style="font-size: 0.85rem;">
                    <li>Total Backups Synced: <strong>${status.megaUploadStats.totalUploaded}</strong></li>
                    <li>Total Size: <strong>${sizeFormatted}</strong></li>
                    <li>Last Archive Size: <strong>${lastSize}</strong></li>
                </ul>
            </div>
        `;
    }

    if (statusHTML && content && container) {
        content.innerHTML = statusHTML;
        container.style.display = 'block';
    } else if (container) {
        container.style.display = 'none';
    }
}

/**
 * Format bytes to readable size
 */
function formatBytesForSettings(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Save Mega configuration
 */
async function saveMegaConfiguration(e) {
    e.preventDefault();

    const megaEmail = document.getElementById('megaEmailSettings').value.trim();
    const pwdInput = document.getElementById('megaPasswordSettings');
    const megaPassword = pwdInput.value.trim();

    if (document.getElementById('megaEnabledSettings').checked && !megaEmail) {
        showMegaAlert('warning', 'Please enter Mega email');
        return;
    }

    try {
        showLoading();
        const token = localStorage.getItem('token');
        const isChecked = document.getElementById('megaEnabledSettings').checked;
        const formData = {
            megaEnabled: isChecked,
            megaUploadEnabled: isChecked,
            megaEmail: megaEmail,
            megaPassword: (megaPassword && megaPassword !== '••••••••••••') ? megaPassword : undefined,
            megaBackupFolderName: document.getElementById('megaBackupFolderSettings').value.trim() || 'BAS_Backups',
            keepLocalBackupDays: parseInt(document.getElementById('keepLocalBackupDaysSettings').value) || 7
        };

        const response = await fetch('/api/v1/mongodb-backup/mega/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            showMegaAlert('success', '✓ Mega settings saved successfully');
            loadMegaConfiguration();
        } else {
            showMegaAlert('danger', `✗ Save failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Error saving Mega configuration:', error);
        showMegaAlert('danger', '✗ Save failed: ' + error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Test Mega connection
 */
async function testMegaConnection() {
    const megaEmail = document.getElementById('megaEmailSettings').value.trim();
    const pwdInput = document.getElementById('megaPasswordSettings');
    const megaPassword = pwdInput.value.trim();

    if (!megaEmail) {
        showMegaAlert('warning', 'Please enter Mega account email');
        return;
    }

    if (!megaPassword && !settingsMegaHasStoredPassword) {
        showMegaAlert('warning', 'Please enter Mega password to test');
        return;
    }

    const btn = document.getElementById('testMegaConnectionSettings');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Verifying...';

        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/mongodb-backup/mega/test', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                megaEmail: megaEmail,
                megaPassword: (megaPassword && megaPassword !== '••••••••••••') ? megaPassword : '',
                megaBackupFolderName: document.getElementById('megaBackupFolderSettings').value.trim() || 'BAS_Backups'
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showMegaAlert('success', '✓ Mega connection verified & active!');
            if (result.data && result.data.account) {
                updateMegaStatusDisplay(result.data, result.data.account);
            } else {
                loadMegaConfiguration();
            }
        } else {
            showMegaAlert('danger', `✗ Connection failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Error testing Mega connection:', error);
        showMegaAlert('danger', '✗ Test failed: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

/**
 * Show Mega alert message
 */
function showMegaAlert(type, message) {
    const container = document.getElementById('backupAlertContainer');
    if (!container) return;

    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.role = 'alert';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    container.innerHTML = '';
    container.appendChild(alert);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 150);
    }, 5000);
}

// Format date
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// ============================================
// API Key Functions
// ============================================

// Populate API Key settings
function populateApiKeySettings(data) {
    const settings = data.data || data;
    const apiKeyInput = document.getElementById('displayApiKey');
    const apiSecretInput = document.getElementById('displayApiSecret');

    if (apiKeyInput) apiKeyInput.value = settings.apiKey || '';
    if (apiSecretInput) apiSecretInput.value = settings.apiSecret || '';
}

// Generate/Regenerate API Key
async function generateApiKey() {
    if (!confirm('WARNING: Regenerating the API Key will INVALIDATE the existing key. Any external applications using the old key will stop working immediately. Are you sure you want to proceed?')) {
        return;
    }

    try {
        showLoading();
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/settings/api-key', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            const data = result.data;
            document.getElementById('displayApiKey').value = data.apiKey;
            document.getElementById('displayApiSecret').value = data.apiSecret;
            showSuccess('API Key generated successfully');
        } else {
            const err = await response.json();
            throw new Error(err.message || 'Failed to generate API Key');
        }
    } catch (error) {
        console.error('Error generating API Key:', error);
        showError('Failed to generate API Key: ' + error.message);
    } finally {
        hideLoading();
    }
}

function toggleSecretVisibility() {
    const input = document.getElementById('displayApiSecret');
    const icon = document.getElementById('toggleSecretIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function copyToClipboard(elementId) {
    const copyText = document.getElementById(elementId);
    if (!copyText || !copyText.value) return;

    // Select the text field
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices

    // Copy the text inside the text field
    navigator.clipboard.writeText(copyText.value).then(() => {
        showSuccess('Copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// ============================================
// Direct 1-Click Restore from Mega Cloud
// ============================================

let selectedMegaRestoreFileName = '';

/**
 * Load Mega Cloud files table (date-wise)
 */
async function loadMegaFilesTable() {
    const tbody = document.getElementById('megaFilesTableBodySettings');
    const badge = document.getElementById('megaFilesCountBadge');
    if (!tbody) return;

    try {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted">
                    <i class="fas fa-spinner fa-spin me-2"></i>Loading cloud backups from Mega...
                </td>
            </tr>
        `;

        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/mongodb-backup/mega/files', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const files = data.data?.files || [];

            if (badge) {
                badge.textContent = `${files.length} archive${files.length === 1 ? '' : 's'}`;
            }

            if (files.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center text-muted py-3">
                            <i class="fas fa-cloud-upload-alt fa-2x mb-2 d-block"></i>
                            No backup archives found in your Mega folder yet.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = files.map(file => {
                const dateStr = file.created ? new Date(file.created).toLocaleString() : 'N/A';
                const sizeStr = file.sizeFormatted || '0 B';
                return `
                    <tr>
                        <td>
                            <i class="fas fa-file-archive text-warning me-2"></i>
                            <code class="fw-bold">${file.name}</code>
                        </td>
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
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted py-3">
                        <i class="fas fa-exclamation-circle text-warning me-2"></i>Connect and save your Mega account to view cloud backups.
                    </td>
                </tr>
            `;
        }
    } catch (err) {
        console.error('Error loading Mega files table:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger py-3">
                        <i class="fas fa-exclamation-triangle me-2"></i>Failed to load files from Mega: ${err.message}
                    </td>
                </tr>
            `;
        }
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
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Warning:</strong> This will stream the backup directly from Mega Drive and restore it into your active MongoDB. <strong>All current data will be overwritten with this snapshot!</strong>
                </div>
                <div class="mb-3 p-3 bg-light rounded border">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="text-muted">Backup File:</span>
                        <strong id="megaRestoreFileName" class="text-primary font-monospace">${fileName}</strong>
                    </div>
                    <div class="d-flex justify-content-between mb-2">
                        <span class="text-muted">Backup Date:</span>
                        <strong id="megaRestoreFileDate">${fileDate}</strong>
                    </div>
                    <div class="d-flex justify-content-between">
                        <span class="text-muted">Cloud Size:</span>
                        <strong id="megaRestoreFileSize">${fileSize}</strong>
                    </div>
                </div>
                <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" id="confirmMegaRestoreCheckbox">
                    <label class="form-check-label text-danger fw-bold" for="confirmMegaRestoreCheckbox">
                        I confirm: Overwrite database with this Mega backup
                    </label>
                </div>
                <div id="megaRestoreProgressIndicator" style="display:none;" class="mt-3 p-3 text-center bg-light border rounded">
                    <div class="spinner-border text-primary spinner-border-sm me-2" role="status"></div>
                    <span class="text-primary fw-bold" id="megaRestoreProgressText">Streaming from Mega & restoring database... Please wait.</span>
                </div>
            `;
        }
        if (modalFooter) {
            modalFooter.style.display = '';
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="btnCancelMegaRestore">Cancel</button>
                <button type="button" class="btn btn-warning" id="btnConfirmMegaRestore" onclick="executeMegaRestore()" disabled>
                    <i class="fas fa-cloud-download-alt me-2"></i>Restore Database Now
                </button>
            `;
        }
    } else {
        const nameEl = document.getElementById('megaRestoreFileName');
        const dateEl = document.getElementById('megaRestoreFileDate');
        const sizeEl = document.getElementById('megaRestoreFileSize');
        const chk = document.getElementById('confirmMegaRestoreCheckbox');
        const btn = document.getElementById('btnConfirmMegaRestore');
        const cancelBtn = document.getElementById('btnCancelMegaRestore');
        const progress = document.getElementById('megaRestoreProgressIndicator');

        if (nameEl) nameEl.textContent = fileName;
        if (dateEl) dateEl.textContent = fileDate;
        if (sizeEl) sizeEl.textContent = fileSize;
        if (chk) chk.checked = false;
        if (btn) btn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = false;
        if (progress) progress.style.display = 'none';
    }

    // Attach checkbox listener
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
                    <span class="spinner-border spinner-border-sm me-2"></span>Reloading application in <span id="restoreCountdown" class="badge bg-primary fs-6">3</span> seconds...
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
        showBackupAlert('warning', 'No backup file selected');
        return;
    }

    const modal = document.getElementById('megaRestoreModal');
    const modalBody = modal ? modal.querySelector('.modal-body') : null;
    const modalFooter = modal ? modal.querySelector('.modal-footer') : null;
    const btn = document.getElementById('btnConfirmMegaRestore');
    const cancelBtn = document.getElementById('btnCancelMegaRestore');
    const progress = document.getElementById('megaRestoreProgressIndicator');
    const progressText = document.getElementById('megaRestoreProgressText');

    isMegaRestoreRunningClient = true;

    // Live progress timer
    let secondsElapsed = 0;
    const progressTimer = setInterval(() => {
        secondsElapsed++;
        if (!progressText) return;
        if (secondsElapsed < 30) {
            progressText.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span><strong>Step 1/3:</strong> Streaming backup from Mega Cloud... (${secondsElapsed}s)<br><small class="text-muted">Downloading 58 MB archive. Please wait.</small>`;
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
            progressText.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span><strong>Step 1/3:</strong> Connecting to Mega Cloud & streaming archive...<br><small class="text-muted">Streaming 58+ MB archive. This takes 30-50 seconds. Please do not refresh.</small>`;
        }

        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/mongodb-backup/mega/restore', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
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
            // Poll for completion every 2.5 seconds
            const pollTimer = setInterval(async () => {
                try {
                    const pollToken = localStorage.getItem('token');
                    const pollRes = await fetch('/api/v1/mongodb-backup/mega/status', {
                        headers: { 'Authorization': `Bearer ${pollToken}` }
                    });
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
                        <h5 class="fw-bold text-dark">Database Restored — Session Reset</h5>
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
            showBackupAlert('danger', `✗ Mega Restore: ${result.message || 'Unknown error'}`);
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
        showBackupAlert('danger', `✗ Mega Restore Failed: ${err.message}`);
        if (progressText) {
            progressText.innerHTML = `<span class="text-danger fw-bold"><i class="fas fa-times-circle me-1"></i>${err.message}</span>`;
        }
    }
}

