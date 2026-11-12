// Pending Cheque Details JS Controller

const API_URL = '/api/v1/pending-cheque-details';
let loadedRecords = [];
window.activeTab = 'cheque';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Authentication check
    if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    // 2. Set user details
    setUserNameDisplay();

    // 3. Set default dates to today
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('entryDate').value = todayStr;
    document.getElementById('reportFilterDate').value = todayStr;

    // 4. Form date sync (when entry date changes, set filter date so report updates or viewer stays aligned)
    document.getElementById('entryDate').addEventListener('change', (e) => {
        document.getElementById('reportFilterDate').value = e.target.value;
        loadRecords();
    });

    // 5. Populate Branch Dropdown securely
    if (typeof window.populateBranchSelect === 'function') {
        await window.populateBranchSelect('entryBranch', {
            placeholder: 'Select Branch...',
            includeAll: false
        });
    }

    // 6. Initial retrieval
    loadRecords();
});

// Sync Header Profile Info
function setUserNameDisplay() {
    try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            const name = user.name || user.email || 'User';
            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.textContent = name;
        }
    } catch (e) {
        console.error('Error reading user info:', e);
    }
}

// Convert Date string into "DD-MMM-YYYY" format
function formatDateToHeaderStr(dateStr) {
    if (!dateStr) return 'N/A';
    const months = ['JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'];
    const dateObj = new Date(dateStr + 'T00:00:00'); // Prevent UTC conversion shifts
    
    const day = String(dateObj.getDate()).padStart(2, '0');
    // Get month name safely
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = monthNames[dateObj.getMonth()];
    const year = dateObj.getFullYear();
    
    return `${day}-${month}-${year}`;
}

// Add Dynamic Input Row
function addInputRow(containerId, inputClass, placeholder) {
    const container = document.getElementById(containerId);
    const idSuffix = Date.now();
    const newRow = document.createElement('div');
    newRow.className = 'd-flex mb-2 input-group-row';
    newRow.id = `row-${idSuffix}`;
    newRow.innerHTML = `
        <input type="text" class="form-control form-control-sm ${inputClass}" placeholder="${placeholder}">
        <button type="button" class="btn btn-sm btn-outline-danger ms-2" onclick="removeInputRow('row-${idSuffix}')"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(newRow);
}

// Remove Dynamic Input Row
function removeInputRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
}

// Get Combined Values from Dynamic Inputs
function getCombinedValues(containerId, inputClass) {
    const inputs = document.querySelectorAll(`#${containerId} .${inputClass}`);
    return Array.from(inputs).map(inp => inp.value.trim()).filter(val => val !== '').join('\n');
}

// Switch Tab logic
function switchTab(tabName) {
    window.activeTab = tabName;
    const isCheque = tabName === 'cheque';
    
    // Toggle Inputs Data Entry
    document.getElementById('chequeInputs').style.display = isCheque ? 'block' : 'none';
    document.getElementById('cashInputs').style.display = isCheque ? 'none' : 'block';
    
    // Titles
    document.getElementById('entryTitle').innerHTML = isCheque ? '<i class="fas fa-edit me-2"></i>Cheque Entry' : '<i class="fas fa-money-bill-wave me-2"></i>Cash Activity Entry';
    document.getElementById('reportTitlePlaceholder').innerText = isCheque ? 'PENDING CHEQUES' : 'CASH ACTIVITY';

    // Thead
    const thead = document.getElementById('reportTableHead');
    if (isCheque) {
        thead.innerHTML = `
            <tr>
                <th style="width: 8%">SN</th>
                <th style="width: 25%">SHOP</th>
                <th style="width: 32%">PENDING CHEQUES</th>
                <th style="width: 20%">UNCHECKED CHEQUES</th>
                <th style="width: 15%" class="action-cell">ACTIONS</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th style="width: 8%">SN</th>
                <th style="width: 25%">SHOP</th>
                <th style="width: 32%">UNCHECKED CASH ACTIVITY DAYS</th>
                <th style="width: 20%">DATE</th>
                <th style="width: 15%" class="action-cell">ACTIONS</th>
            </tr>
        `;
    }
    
    clearForm();
    loadRecords(); // Re-fetch from server with the correct type for this tab
}

// Fetch and render records
async function loadRecords() {
    const filterDate = document.getElementById('reportFilterDate').value;
    if (!filterDate) return;

    // Sync header formatted date display
    const formattedDate = formatDateToHeaderStr(filterDate);
    document.getElementById('displayReportDate').textContent = `DATE: ${formattedDate}`;

    try {
        const token = localStorage.getItem('token');
        // Pass type so backend returns only this tab's documents (cheque or cash)
        const recordType = window.activeTab === 'cash' ? 'cash' : 'cheque';
        const response = await fetch(`${API_URL}?date=${filterDate}&type=${recordType}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch records');
        
        const result = await response.json();
        loadedRecords = result.data || [];
        
        renderTable(loadedRecords);
    } catch (err) {
        console.error('Error fetching pending cheque details:', err);
        showActionAlert('Failed to load records. Please try again.', 'danger');
    }
}

// Render records into output table HTML
function renderTable(records) {
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';

    const userStr = localStorage.getItem('user');
    let currentUser = null;
    try {
        if (userStr) currentUser = JSON.parse(userStr);
    } catch (e) {}

    let filteredRecords = records;

    // Apply Client-Side Branch Filter (ensure user only sees their allowed branch data if restricted)
    if (currentUser && !['admin', 'administrator', 'superadmin'].includes(currentUser.role?.toLowerCase())) {
        let allowedBranches = [];
        if (currentUser.branch) {
            allowedBranches = Array.isArray(currentUser.branch) ? currentUser.branch : [String(currentUser.branch)];
            allowedBranches = allowedBranches.map(b => b.trim().toLowerCase());
        }
        
        // Exclude 'administration' or 'management' group permissions if they are strict branch-restricted
        // But for safety, if allowedBranches has items, we filter to match only those.
        if (allowedBranches.length > 0) {
            filteredRecords = filteredRecords.filter(r => 
                allowedBranches.includes(r.branch.trim().toLowerCase())
            );
        }
    }

    // Backend already returns only the correct type (cheque/cash).
    // Just confirm by type field — no content-based filtering needed.
    const expectedType = window.activeTab === 'cash' ? 'cash' : 'cheque';
    filteredRecords = filteredRecords.filter(r => !r.type || r.type === expectedType);

    if (filteredRecords.length === 0) {
        const itemType = window.activeTab === 'cheque' ? 'pending cheques' : 'cash activity';
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4 text-muted">No ${itemType} found for this date.</td>
            </tr>
        `;
        return;
    }

    filteredRecords.forEach((record, index) => {
        const tr = document.createElement('tr');
        tr.id = `row-${record._id}`;
        
        // Escape quotes to safely put variables in onclick
        const escapedBranch = record.branch.replace(/'/g, "\\'");
        const escapedDate = record.date.split('T')[0];
        const escapedPending = (record.pendingCheques || '').replace(/'/g, "\\'");
        const escapedUnchecked = (record.uncheckedCheques || '').replace(/'/g, "\\'");
        const escapedCashDays = (record.uncheckedCashActivityDays || '').replace(/'/g, "\\'");
        const escapedCashDate = (record.cashActivityDateRange || '').replace(/'/g, "\\'");

        if (window.activeTab === 'cheque') {
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td class="fw-bold">${record.branch}</td>
                <td style="white-space: pre-wrap;">${record.pendingCheques || '-'}</td>
                <td style="white-space: pre-wrap;">${record.uncheckedCheques || '-'}</td>
                <td class="action-cell">
                    <button class="btn btn-sm btn-outline-primary me-2" onclick="editRecord('${record._id}', '${escapedBranch}', '${escapedDate}', '${escapedPending}', '${escapedUnchecked}', '${escapedCashDays}', '${escapedCashDate}')" title="Edit Entry">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteRecord('${record._id}')" title="Delete Entry">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
        } else {
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td class="fw-bold">${record.branch}</td>
                <td style="white-space: pre-wrap;">${record.uncheckedCashActivityDays || '-'}</td>
                <td style="white-space: pre-wrap;">${record.cashActivityDateRange || '-'}</td>
                <td class="action-cell">
                    <button class="btn btn-sm btn-outline-primary me-2" onclick="editRecord('${record._id}', '${escapedBranch}', '${escapedDate}', '${escapedPending}', '${escapedUnchecked}', '${escapedCashDays}', '${escapedCashDate}')" title="Edit Entry">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteRecord('${record._id}')" title="Delete Entry">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
        }
        tbody.appendChild(tr);
    });
}

// Save Entry (Create / Update)
async function saveRecord() {
    const date = document.getElementById('entryDate').value;
    const branch = document.getElementById('entryBranch').value;
    const pendingCheques = getCombinedValues('pendingChequesContainer', 'pending-cheque-input');
    const uncheckedCheques = getCombinedValues('uncheckedChequesContainer', 'unchecked-cheque-input');
    const uncheckedCashActivityDays = getCombinedValues('cashActivityDaysContainer', 'cash-activity-days-input');
    const cashActivityDateRange = getCombinedValues('cashActivityDateContainer', 'cash-activity-date-input');

    if (!date) {
        showActionAlert('Please select a date', 'warning');
        return;
    }
    if (!branch) {
        showActionAlert('Please select a branch', 'warning');
        return;
    }

    const payload = {
        date,
        branch,
        pendingCheques,
        uncheckedCheques,
        uncheckedCashActivityDays,
        cashActivityDateRange,
        activeTab: window.activeTab  // Tell backend which tab is saving so it only updates relevant fields
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (response.ok && result.success) {
            showActionAlert('Record successfully saved', 'success');
            clearForm();
            loadRecords(); // Refresh table view to reflect update
        } else {
            showActionAlert(result.error || 'Failed to save entry', 'danger');
        }
    } catch (err) {
        console.error('Error saving pending cheque details:', err);
        showActionAlert('Network or server error. Could not save record.', 'danger');
    }
}

function setContainerValues(containerId, inputClass, placeholder, valuesString) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const valuesArray = valuesString ? valuesString.split('\n') : [''];
    
    valuesArray.forEach((val, i) => {
        const idSuffix = Date.now() + i;
        const newRow = document.createElement('div');
        newRow.className = 'd-flex mb-2 input-group-row';
        if (i === 0) {
            newRow.innerHTML = `<input type="text" class="form-control form-control-sm ${inputClass}" placeholder="${placeholder}" value="${val}">`;
        } else {
            newRow.id = `row-${idSuffix}`;
            newRow.innerHTML = `
                <input type="text" class="form-control form-control-sm ${inputClass}" placeholder="${placeholder}" value="${val}">
                <button type="button" class="btn btn-sm btn-outline-danger ms-2" onclick="removeInputRow('row-${idSuffix}')"><i class="fas fa-trash"></i></button>
            `;
        }
        container.appendChild(newRow);
    });
}

// Populate Edit Mode
function editRecord(id, branch, date, pendingCheques, uncheckedCheques, uncheckedCashActivityDays, cashActivityDateRange) {
    document.getElementById('editingRecordId').value = id;
    document.getElementById('entryDate').value = date;
    document.getElementById('entryBranch').value = branch;
    
    setContainerValues('pendingChequesContainer', 'pending-cheque-input', 'e.g. 22 + 2 New Books', pendingCheques);
    setContainerValues('uncheckedChequesContainer', 'unchecked-cheque-input', 'e.g. 29', uncheckedCheques);
    setContainerValues('cashActivityDaysContainer', 'cash-activity-days-input', 'e.g. 4', uncheckedCashActivityDays);
    setContainerValues('cashActivityDateContainer', 'cash-activity-date-input', 'e.g. 07-JUL-26 TO 10-JUL-26', cashActivityDateRange);

    // Smooth scroll to entry panel on mobile
    document.getElementById('entryPanelWrapper').scrollIntoView({ behavior: 'smooth' });

    // Change Save Button UI status
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = 'Update Entry';
    saveBtn.className = 'btn btn-primary btn-bas-save';
    
    // Toggle Mobile panel view if active
    const entryPanel = document.getElementById('entryPanelWrapper');
    const reportPanel = document.getElementById('reportPanelWrapper');
    if (window.innerWidth <= 768 && entryPanel.style.display === 'none') {
        toggleMobileView();
    }
}

// Delete Record
async function deleteRecord(id) {
    if (!confirm('Are you sure you want to delete this cheque entry?')) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();
        if (response.ok && result.success) {
            showActionAlert('Record successfully deleted', 'success');
            loadRecords();
        } else {
            showActionAlert(result.error || 'Failed to delete record', 'danger');
        }
    } catch (err) {
        console.error('Error deleting record:', err);
        showActionAlert('Network or server error. Could not delete record.', 'danger');
    }
}

// Reset data entry panel inputs
function clearForm() {
    // Keep date input intact, but clear the others
    document.getElementById('editingRecordId').value = '';
    
    setContainerValues('pendingChequesContainer', 'pending-cheque-input', 'e.g. 22 + 2 New Books', '');
    setContainerValues('uncheckedChequesContainer', 'unchecked-cheque-input', 'e.g. 29', '');
    setContainerValues('cashActivityDaysContainer', 'cash-activity-days-input', 'e.g. 4', '');
    setContainerValues('cashActivityDateContainer', 'cash-activity-date-input', 'e.g. 07-JUL-26 TO 10-JUL-26', '');

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = 'Save Entry';
    saveBtn.className = 'btn btn-bas-save';
}

// Print Handler
function printReport() {
    window.print();
}

// Export Report to Excel using SheetJS
function exportToExcel() {
    if (loadedRecords.length === 0) {
        showActionAlert('No records available to export', 'warning');
        return;
    }

    const userStr = localStorage.getItem('user');
    let currentUser = null;
    try { if (userStr) currentUser = JSON.parse(userStr); } catch (e) {}

    let filteredRecords = loadedRecords;

    if (currentUser && !['admin', 'administrator', 'superadmin'].includes(currentUser.role?.toLowerCase())) {
        let allowedBranches = [];
        if (currentUser.branch) {
            allowedBranches = Array.isArray(currentUser.branch) ? currentUser.branch : [String(currentUser.branch)];
            allowedBranches = allowedBranches.map(b => b.trim().toLowerCase());
        }
        if (allowedBranches.length > 0) {
            filteredRecords = filteredRecords.filter(r => 
                allowedBranches.includes(r.branch.trim().toLowerCase())
            );
        }
    }

    const isCheque = window.activeTab === 'cheque';
    const mainTitle = isCheque ? 'PENDING CHEQUES' : 'CASH ACTIVITY';

    // Backend already returns only the correct type — filter by type field only
    const expectedType = isCheque ? 'cheque' : 'cash';
    filteredRecords = filteredRecords.filter(r => !r.type || r.type === expectedType);

    if (filteredRecords.length === 0) {
        showActionAlert(`No ${mainTitle.toLowerCase()} data available to export`, 'warning');
        return;
    }

    const filterDate = document.getElementById('reportFilterDate').value;
    const formattedDate = formatDateToHeaderStr(filterDate);

    // Build worksheet data arrays manually to enforce precise layout match requested:
    // PENDING CHEQUES / CASH ACTIVITY
    // DATE: DD-MMM-YYYY
    const wbData = [
        [mainTitle],
        [`DATE: ${formattedDate}`],
        [], // Empty spacing row
        isCheque ? ['SN', 'SHOP', 'PENDING CHEQUES', 'UNCHECKED CHEQUES'] : ['SN', 'SHOP', 'UNCHECKED CASH ACTIVITY DAYS', 'DATE']
    ];

    filteredRecords.forEach((record, index) => {
        if (isCheque) {
            wbData.push([
                index + 1,
                record.branch,
                record.pendingCheques || '',
                record.uncheckedCheques || ''
            ]);
        } else {
            wbData.push([
                index + 1,
                record.branch,
                record.uncheckedCashActivityDays || '',
                record.cashActivityDateRange || ''
            ]);
        }
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wbData);

    // Merge titles across columns for clean aesthetics
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // Merge Main Title across 4 columns
        { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }  // Merge DATE across 4 columns
    ];

    XLSX.utils.book_append_sheet(wb, ws, mainTitle);
    
    // Save report
    const filename = isCheque ? `PENDING-CHEQUE-DETAILS-${formattedDate.toUpperCase()}.xlsx` : `CASH-ACTIVITY-${formattedDate.toUpperCase()}.xlsx`;
    XLSX.writeFile(wb, filename);
}

// Toggle view layout in mobile screens
function toggleMobileView() {
    const entryPanel = document.getElementById('entryPanelWrapper');
    const reportPanel = document.getElementById('reportPanelWrapper');
    const toggleText = document.getElementById('toggleText');
    const toggleIcon = document.querySelector('#mobileToggleBtn i');

    if (entryPanel.style.display !== 'none') {
        entryPanel.style.setProperty('display', 'none', 'important');
        reportPanel.style.setProperty('display', 'block', 'important');
        toggleText.innerText = 'View Entry';
        toggleIcon.className = 'fas fa-edit';
    } else {
        entryPanel.style.setProperty('display', 'block', 'important');
        reportPanel.style.setProperty('display', 'none', 'important');
        toggleText.innerText = 'View Report';
        toggleIcon.className = 'fas fa-list';
    }
}

// Simple floating notification alert
function showActionAlert(message, type = 'info') {
    // Check if an existing alert is present on DOM, remove it
    const existing = document.getElementById('floating-bas-alert');
    if (existing) existing.remove();

    const alertDiv = document.createElement('div');
    alertDiv.id = 'floating-bas-alert';
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 250px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-radius: 6px;
    `;
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        <span>${message}</span>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" style="padding: 1rem 1rem;"></button>
    `;

    document.body.appendChild(alertDiv);

    // Auto dismiss after 4 seconds
    setTimeout(() => {
        if (alertDiv) {
            const bsAlert = bootstrap.Alert.getInstance(alertDiv) || new bootstrap.Alert(alertDiv);
            bsAlert.close();
        }
    }, 4500);
}
