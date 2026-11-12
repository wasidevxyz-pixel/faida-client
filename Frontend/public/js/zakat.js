// Zakat Entry Page JavaScript

const API_URL = '/api/v1';
let allZakats = [];
let allBranches = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async function () {
    await initializePage();
});

async function initializePage() {
    try {
        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('zakatDate').value = today;
        document.getElementById('filterFromDate').value = today;
        document.getElementById('filterToDate').value = today;

        // Load branches
        await loadBranches();

        // Load initial data
        await searchZakats();
    } catch (error) {
        console.error('Error initializing page:', error);
        showAlert('Error initializing page', 'danger');
    }
}

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');

        // Fetch allowed branches for filter (respects permissions)
        const responseAllowed = await fetch(`${API_URL}/stores`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Fetch ALL branches for "From" dropdown (ignores permissions - allowed by backend update)
        const responseAll = await fetch(`${API_URL}/stores?ignorePermissions=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const fromBranchSelect = document.getElementById('fromBranch');
        const filterBranchSelect = document.getElementById('filterBranch');

        // Clear existing options
        fromBranchSelect.innerHTML = '<option value="">Select Branch</option>';
        filterBranchSelect.innerHTML = '<option value="all">All Branches</option>';

        // Populate Filter dropdown (Allowed branches only)
        if (responseAllowed.ok) {
            const data = await responseAllowed.json();
            const allowedBranches = data.data || [];

            allowedBranches.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.name;
                option.textContent = branch.name;
                filterBranchSelect.appendChild(option);
            });
        }

        // Populate From dropdown (All branches)
        if (responseAll.ok) {
            const data = await responseAll.json();
            allBranches = data.data || []; // Update global if needed

            allBranches.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.name;
                option.textContent = branch.name;
                fromBranchSelect.appendChild(option);
            });
        }

    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

// Handle type change - show/hide From branch field
function onTypeChange() {
    const type = document.getElementById('zakatType').value;
    const fromBranchRow = document.getElementById('fromBranchRow');

    if (type === 'Receive') {
        fromBranchRow.classList.add('show');
    } else {
        fromBranchRow.classList.remove('show');
        document.getElementById('fromBranch').value = '';
    }
}

async function saveZakat() {
    try {
        const type = document.getElementById('zakatType').value;
        const date = document.getElementById('zakatDate').value;
        const branch = document.getElementById('zakatBranch').value; // Fixed to F-6
        const fromBranch = document.getElementById('fromBranch').value;
        const amount = parseFloat(document.getElementById('zakatAmount').value) || 0;
        const remarks = document.getElementById('zakatRemarks').value.trim();
        const editingId = document.getElementById('editingZakatId').value;

        // Validation
        if (!type) {
            showAlert('Please select a type', 'warning');
            return;
        }
        if (!date) {
            showAlert('Please select a date', 'warning');
            return;
        }
        if (!amount || amount <= 0) {
            showAlert('Please enter a valid amount', 'warning');
            return;
        }
        if (type === 'Receive' && !fromBranch) {
            showAlert('Please select From branch', 'warning');
            return;
        }

        const token = localStorage.getItem('token');

        // Include fromBranch in remarks for Receive type
        let finalRemarks = remarks;
        if (type === 'Receive' && fromBranch) {
            finalRemarks = `From: ${fromBranch}${remarks ? ' | ' + remarks : ''}`;
        }

        const zakatData = {
            type,
            date,
            branch,
            fromBranch: type === 'Receive' ? fromBranch : '',
            amount,
            remarks: finalRemarks
        };

        let response;
        if (editingId) {
            // Update existing
            response = await fetch(`${API_URL}/zakats/${editingId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(zakatData)
            });
        } else {
            // Create new
            response = await fetch(`${API_URL}/zakats`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(zakatData)
            });
        }

        const data = await response.json();

        if (response.ok && data.success) {
            showAlert(editingId ? 'Zakat updated successfully' : 'Zakat saved successfully', 'success');
            clearForm();
            await searchZakats();
        } else {
            showAlert(data.message || 'Error saving zakat', 'danger');
        }
    } catch (error) {
        console.error('Error saving zakat:', error);
        showAlert('Error saving zakat: ' + error.message, 'danger');
    }
}

async function searchZakats() {
    try {
        const fromDate = document.getElementById('filterFromDate').value;
        const toDate = document.getElementById('filterToDate').value;
        const branch = document.getElementById('filterBranch').value;

        if (!fromDate || !toDate) {
            showAlert('Please select date range', 'warning');
            return;
        }

        const token = localStorage.getItem('token');
        let url = `${API_URL}/zakats/date-range?startDate=${fromDate}&endDate=${toDate}`;

        if (branch && branch !== 'all') {
            url += `&branch=${encodeURIComponent(branch)}`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            allZakats = data.data || [];

            // Pass balance data to renderTable
            renderTable(allZakats, {
                openingBalance: data.openingBalance || 0,
                periodReceive: data.periodReceive || 0,
                periodPay: data.periodPay || 0,
                closingBalance: data.closingBalance || 0
            });
        } else {
            const errData = await response.json();
            showAlert(errData.message || 'Error fetching zakat data', 'danger');
        }
    } catch (error) {
        console.error('Error searching zakats:', error);
        showAlert('Error searching zakats: ' + error.message, 'danger');
    }
}

function renderTable(zakats, balanceData = {}) {
    const tbody = document.getElementById('zakatTableBody');

    const openingBalance = balanceData.openingBalance || 0;
    const periodReceive = balanceData.periodReceive || 0;
    const periodPay = balanceData.periodPay || 0;
    const closingBalance = balanceData.closingBalance || 0;

    let html = '';

    // Opening Balance Row at the TOP
    const openingClass = openingBalance >= 0 ? '' : 'text-danger';
    html += `
        <tr style="background-color: #6c757d !important; color: white; font-weight: bold;">
            <td colspan="2">Opening Balance</td>
            <td class="${openingClass}">${formatNumber(openingBalance)}</td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
    `;

    // Running balance tracking
    let runningBalance = openingBalance;

    zakats.forEach(zakat => {
        const date = new Date(zakat.date).toLocaleDateString('en-GB');
        const fromBranch = zakat.fromBranch || '-';
        const amount = zakat.amount || 0;

        // Update running balance
        if (zakat.type === 'Receive') {
            runningBalance += amount;
        } else {
            runningBalance -= amount;
        }

        // Color code the type
        const typeClass = zakat.type === 'Pay' ? 'text-danger' : 'text-success';

        html += `
            <tr data-id="${zakat._id}" onclick="selectRow(this)">
                <td>${date}</td>
                <td class="${typeClass} fw-bold">${zakat.type || 'Pay'}</td>
                <td>${formatNumber(amount)}</td>
                <td>${fromBranch}</td>
                <td>${zakat.remarks || ''}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editZakat('${zakat._id}'); event.stopPropagation();" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteZakat('${zakat._id}'); event.stopPropagation();" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    // Add summary rows at the bottom
    html += `
        <tr style="background-color: #dc3545 !important; color: white; font-weight: bold;">
            <td></td>
            <td>Total Pay (Expense)</td>
            <td id="totalPay">${formatNumber(periodPay)}</td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
        <tr style="background-color: #28a745 !important; color: white; font-weight: bold;">
            <td></td>
            <td>Total Receive (Income)</td>
            <td id="totalReceive">${formatNumber(periodReceive)}</td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
        <tr style="background-color: #17a2b8 !important; color: white; font-weight: bold;">
            <td colspan="2">Closing Balance</td>
            <td id="closingBalance">${formatNumber(closingBalance)}</td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
    `;

    tbody.innerHTML = html;
}


function updateTotal(total) {
    const totalEl = document.getElementById('totalAmount');
    if (totalEl) {
        totalEl.textContent = formatNumber(total);
    }
}

function selectRow(row) {
    // Remove selection from all rows
    document.querySelectorAll('#zakatTableBody tr').forEach(r => r.classList.remove('selected'));
    // Add selection to clicked row
    if (!row.classList.contains('total-row')) {
        row.classList.add('selected');
    }
}

function editZakat(id) {
    const zakat = allZakats.find(z => z._id === id);
    if (!zakat) return;

    document.getElementById('zakatType').value = zakat.type || 'Pay';
    document.getElementById('zakatDate').value = new Date(zakat.date).toISOString().split('T')[0];
    document.getElementById('zakatAmount').value = zakat.amount || '';

    // Handle fromBranch
    if (zakat.type === 'Receive' && zakat.fromBranch) {
        document.getElementById('fromBranch').value = zakat.fromBranch;
        document.getElementById('fromBranchRow').classList.add('show');
    } else {
        document.getElementById('fromBranch').value = '';
        document.getElementById('fromBranchRow').classList.remove('show');
    }

    // Parse remarks - remove the "From: X | " prefix if present
    let remarks = zakat.remarks || '';
    if (remarks.startsWith('From:')) {
        const pipeIndex = remarks.indexOf('|');
        if (pipeIndex > 0) {
            remarks = remarks.substring(pipeIndex + 1).trim();
        } else {
            remarks = '';
        }
    }
    document.getElementById('zakatRemarks').value = remarks;

    document.getElementById('editingZakatId').value = id;

    // Trigger type change to show/hide from field
    onTypeChange();

    // Change button text
    document.getElementById('saveBtn').textContent = 'Update';
}

async function deleteZakat(id) {
    if (!confirm('Are you sure you want to delete this zakat entry?')) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/zakats/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showAlert('Zakat deleted successfully', 'success');
            await searchZakats();
        } else {
            showAlert(data.message || 'Error deleting zakat', 'danger');
        }
    } catch (error) {
        console.error('Error deleting zakat:', error);
        showAlert('Error deleting zakat: ' + error.message, 'danger');
    }
}

function clearForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('zakatType').value = 'Pay';
    document.getElementById('zakatDate').value = today;
    document.getElementById('zakatAmount').value = '';
    document.getElementById('zakatRemarks').value = '';
    document.getElementById('fromBranch').value = '';
    document.getElementById('editingZakatId').value = '';
    document.getElementById('fromBranchRow').classList.remove('show');

    // Reset button text
    document.getElementById('saveBtn').textContent = 'Save';
}

function filterTable() {
    const searchText = document.getElementById('tableSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#zakatTableBody tr:not(.total-row)');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchText) ? '' : 'none';
    });
}

function viewReport() {
    // Open print-friendly report in new window
    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;
    const branch = document.getElementById('filterBranch').value;

    const url = `/print-zakat-report?fromDate=${fromDate}&toDate=${toDate}&branch=${branch}`;
    window.open(url, '_blank');
}

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return parseFloat(num).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function showAlert(message, type = 'info') {
    // Create alert container if it doesn't exist
    let alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alertContainer';
        alertContainer.style.cssText = 'position: fixed; top: 70px; right: 20px; z-index: 9999; max-width: 350px;';
        document.body.appendChild(alertContainer);
    }

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    alertContainer.appendChild(alertDiv);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 150);
    }, 3000);
}

// SMS Generation Function
async function generateZakatSMS() {
    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;
    const branch = document.getElementById('filterBranch').value;

    if (!fromDate || !toDate) {
        showAlert('Please select date range first', 'warning');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        let url = `${API_URL}/zakats/date-range?startDate=${fromDate}&endDate=${toDate}`;
        if (branch && branch !== 'all') {
            url += `&branch=${encodeURIComponent(branch)}`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            showAlert('Error fetching zakat data', 'danger');
            return;
        }

        const data = await response.json();
        const zakats = data.data || [];
        const openingBalance = data.openingBalance || 0;
        const closingBalance = data.closingBalance || 0;

        // Group receives by source (fromBranch)
        const receiveBySource = {};
        let totalReceive = 0;
        let totalPay = 0;

        zakats.forEach(z => {
            const amount = z.amount || 0;
            if (z.type === 'Receive') {
                totalReceive += amount;
                const source = z.fromBranch || 'Unknown';
                if (!receiveBySource[source]) {
                    receiveBySource[source] = 0;
                }
                receiveBySource[source] += amount;
            } else {
                totalPay += amount;
            }
        });

        // Format date for display
        const displayDate = new Date(fromDate).toLocaleDateString('en-GB').replace(/\//g, '/');

        // Build SMS text in the required format
        let text = `Date: ${displayDate}\n`;
        text += `Zakat Pay and Rec Detail\n`;
        text += `Opening Balance = ${formatNumber(openingBalance)}\n`;

        // List each source of received cash
        Object.keys(receiveBySource).forEach(source => {
            text += `Cash Rec From ((${source})) = ${formatNumber(receiveBySource[source])}\n`;
        });

        // Total Cash = Opening + Receives
        const totalCash = openingBalance + totalReceive;
        text += `Total Cash = ${formatNumber(totalCash)}\n`;
        text += `Total Payment= ${formatNumber(totalPay)}\n`;
        text += `Balance Cash= ${formatNumber(closingBalance)}\n`;

        // Copy to clipboard
        navigator.clipboard.writeText(text).then(() => {
            showAlert('Zakat SMS copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showAlert('Zakat SMS copied to clipboard!', 'success');
            } catch (e) {
                showAlert('Failed to copy SMS message', 'danger');
            }
            document.body.removeChild(textArea);
        });
    } catch (error) {
        console.error('Error generating SMS:', error);
        showAlert('Error generating SMS: ' + error.message, 'danger');
    }
}

