document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('date').valueAsDate = new Date();

    // Set User
    const user = JSON.parse(localStorage.getItem('user')) || { name: 'Unknown' };
    document.getElementById('userName').textContent = user.name;

    await loadBranches();
    loadDepartments();

    document.getElementById('branch').addEventListener('change', () => {
        loadDepartments();
        if (document.getElementById('mode').value === 'Bank') loadBankList();
    });

    document.getElementById('mode').addEventListener('change', toggleMode);
    document.getElementById('department').addEventListener('change', () => {
        if (document.getElementById('mode').value === 'Bank') loadBankList();
    });
    document.getElementById('bankSelect').addEventListener('change', onBankSelect);

    // Initialize first row
    addRow();
});

function toggleMode() {
    const mode = document.getElementById('mode').value;
    const isBank = mode === 'Bank';

    document.getElementById('bankContainer').style.display = isBank ? 'block' : 'none';

    // User requested changes for Bank Mode:
    // 1. Hide Cash Counter Dropdown
    const ccContainer = document.getElementById('cashCounterContainer');
    if (ccContainer) ccContainer.style.display = isBank ? 'none' : 'block';

    // 2. Hide Deducted Amount (User said "DONT SHOW ... DEDUCTED AMOUNT")
    // Previously it was shown for Bank. Now hiding it.
    document.getElementById('deductionFields').style.display = 'none';

    // 3. Hide Invoice No Field/Column
    const invHeader = document.getElementById('invoiceHeader');
    if (invHeader) invHeader.style.display = isBank ? 'none' : 'table-cell';

    // Toggle Invoice Cells
    const invCells = document.querySelectorAll('.invoice-cell');
    invCells.forEach(cell => {
        cell.style.display = isBank ? 'none' : 'table-cell';
    });

    if (isBank) loadBankList();
}


let currentValidBranches = [];

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');
        let user = null;
        if (userStr) {
            try { user = JSON.parse(userStr); } catch (e) { console.error(e); }
        }

        const response = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            const select = document.getElementById('branch');

            // Filter stores based on user permissions
            currentValidBranches = data.data;

            if (user && user.role !== 'admin' && user.branch && Array.isArray(user.branch) && user.branch.length > 0) {
                currentValidBranches = currentValidBranches.filter(b => user.branch.includes(b._id) || user.branch.includes(b.name));
            } else if (user && user.role !== 'admin' && user.branch && typeof user.branch === 'string') {
                currentValidBranches = currentValidBranches.filter(b => b._id === user.branch || b.name === user.branch);
            }

            // Clear and Populate
            select.innerHTML = '';

            // Logic: If multiple branches => Show "Select Branch". If Single => Don't.
            if (currentValidBranches.length > 1) {
                select.innerHTML = '<option value="">Select Branch</option>';
            }

            currentValidBranches.forEach(store => {
                const option = document.createElement('option');
                option.value = store.name;
                option.textContent = store.name;
                select.appendChild(option);
            });

            // Auto-select if only 1
            if (currentValidBranches.length === 1) {
                select.value = currentValidBranches[0].name;
                // Trigger loadDepartments explicitly if needed, though main flow calls it
                // We should trigger change to ensure departments load
                select.dispatchEvent(new Event('change'));
            } else if (currentValidBranches.length === 0) {
                // Handle case where user has no access?
                select.innerHTML = '<option value="">No Access</option>';
            }
        }
    } catch (e) {
        console.error('Error loading branches:', e);
    }
}

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const branch = document.getElementById('branch').value;
        const response = await fetch('/api/v1/departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const selectDept = document.getElementById('department');
        selectDept.innerHTML = '<option value="">Select Department</option>';

        const selectCounter = document.getElementById('cashCounter');
        selectCounter.innerHTML = '<option value="">Select Cash Counter</option>';

        if (data.success) {
            // 1. Populate Department Dropdown (Combine Dept Only)
            const combineDepts = data.data.filter(d => d.branch === branch && d.isActive && d.combineDepSales);
            combineDepts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.text = d.name;
                selectDept.appendChild(opt);
            });

            // 2. Populate Cash Counter Dropdown (isCashCounter Departments Only)
            const cashCounterDepts = data.data.filter(d => d.branch === branch && d.isActive && d.isCashCounter);
            cashCounterDepts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                opt.text = d.name;
                selectCounter.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }
}

let allBanks = [];

async function ensureBanksLoaded() {
    if (allBanks.length === 0) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/v1/banks', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (data.success) allBanks = data.data;
        } catch (e) { console.error('Error fetching banks:', e); }
    }
}

async function loadBankList() {
    try {
        await ensureBanksLoaded();

        const branch = document.getElementById('branch').value;
        const deptId = document.getElementById('department').value;
        const select = document.getElementById('bankSelect');
        const current = select.value;

        select.innerHTML = '<option value="">Select Bank</option>';

        const filtered = allBanks.filter(b => {
            // Basic Filter: Branch must match
            if (b.branch !== branch) return false;
            // If bank is specific to department, check deptId
            if (b.department && b.department !== deptId) return false;

            // Filter: Hide banks of type 'Branch Bank' (only for Pending Chq)
            if (b.bankType === 'Branch Bank') return false;

            return true;
        });

        filtered.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b._id;
            opt.textContent = b.bankName;
            opt.dataset.deduction = b.deduction || 0;
            select.appendChild(opt);
        });
        if (current) select.value = current;

    } catch (e) { console.error(e); }
}

function onBankSelect() {
    const sel = document.getElementById('bankSelect');
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.dataset.deduction) {
        document.getElementById('deductedAmount').value = opt.dataset.deduction;
    }
}

// Multi-Row Logic
function addRow() {
    const tbody = document.getElementById('salesTableBody');
    const tr = document.createElement('tr');

    const mode = document.getElementById('mode').value;
    const isBank = mode === 'Bank';

    tr.innerHTML = `
        <td class="invoice-cell" style="display: ${isBank ? 'none' : 'table-cell'}"><input type="text" class="form-control form-control-sm invoice-input" placeholder="Invoice No"></td>
        <td><input type="number" class="form-control form-control-sm sales-input" placeholder="0" oninput="updateTotal()"></td>
        <td class="text-center">
            <button class="btn btn-danger btn-sm py-0 remove-btn" tabindex="-1"><i class="fas fa-times"></i></button>
        </td>
    `;

    tbody.appendChild(tr);

    // Event Listeners for new row - ENTER Key logic
    const salesInput = tr.querySelector('.sales-input');
    salesInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();

            // Check if current row has data before adding new one? 
            // Better UX: Just add row.

            addRow();

            // Focus new row invoice input
            setTimeout(() => {
                const rows = tbody.querySelectorAll('tr');
                if (rows.length > 0) {
                    const lastRow = rows[rows.length - 1];
                    const input = lastRow.querySelector('.invoice-input');
                    if (input) input.focus();
                }
            }, 10);
        }
    });

    const removeBtn = tr.querySelector('.remove-btn');
    removeBtn.onclick = function () {
        if (tbody.querySelectorAll('tr').length > 1) {
            tr.remove();
            updateTotal();
        } else {
            // If only one row, just clear inputs
            tr.querySelector('.invoice-input').value = '';
            tr.querySelector('.sales-input').value = '';
            updateTotal();
        }
    };
}

function updateTotal() {
    let total = 0;
    const inputs = document.querySelectorAll('.sales-input');
    inputs.forEach(input => {
        total += parseFloat(input.value) || 0;
    });
    document.getElementById('totalAmount').value = total.toFixed(2);
}

// Duplicate saveSale removed

function clearForm() {
    document.getElementById('salesTableBody').innerHTML = '';
    addRow(); // Reset to one empty row
    updateTotal();

    document.getElementById('department').value = '';
    // document.getElementById('invoiceNo').value = ''; // No longer exists fixed
    // document.getElementById('sales').value = ''; // No longer exists fixed
    document.getElementById('totalAmount').value = '0.00';
    document.getElementById('cashCounter').selectedIndex = 0;

    // Reset Bank fields
    document.getElementById('bankSelect').value = '';
    document.getElementById('deductedAmount').value = '0';
    document.getElementById('deductionCheck').checked = true;

    if (document.getElementById('mode').value === 'Bank') {
        loadBankList();
    }
}

let editingId = null;
let currentList = [];
let pendingDeleteId = null;

function showList() {
    // Populate defaults
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('listFromDate').value = today;
    document.getElementById('listToDate').value = today;

    // Populate Branch Filter from Valid Branches
    const listBranch = document.getElementById('listBranch');
    if (listBranch) {
        listBranch.innerHTML = '';

        // Show "All Branches" only if user has access to multiple
        if (currentValidBranches.length > 1) {
            listBranch.innerHTML = '<option value="">All Branches</option>';
        }

        currentValidBranches.forEach(store => {
            const opt = document.createElement('option');
            opt.value = store.name;
            opt.textContent = store.name;
            listBranch.appendChild(opt);
        });

        // Auto-select if only 1
        if (currentValidBranches.length === 1) {
            listBranch.value = currentValidBranches[0].name;
        }
    }

    const modalEl = document.getElementById('listModal');
    if (window.bootstrap) {
        const listModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        listModal.show();
    } else {
        const listModal = new bootstrap.Modal(modalEl);
        listModal.show();
    }
    fetchCashSalesList();
}

async function fetchCashSalesList() {
    try {
        await ensureBanksLoaded();

        const token = localStorage.getItem('token');
        const fromDate = document.getElementById('listFromDate').value;
        const toDate = document.getElementById('listToDate').value;
        const branch = document.getElementById('listBranch').value;

        // Ensure date range parameters match backend expectation
        let url = `/api/v1/cash-sales?startDate=${fromDate}&endDate=${toDate}`;
        if (branch && branch !== 'All Branches') url += `&branch=${branch}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const tbody = document.getElementById('listBody');
        tbody.innerHTML = '';

        if (data.success && data.data) {
            let records = data.data;

            // Frontend Security: Filter records to only show allowed branches
            if (typeof currentValidBranches !== 'undefined' && currentValidBranches.length > 0) {
                const allowedNames = currentValidBranches.map(b => b.name);
                records = records.filter(item => allowedNames.includes(item.branch));
            }

            currentList = records; // Store for editing
            records.forEach(item => {
                const tr = document.createElement('tr');

                // 1. Action Column
                const actionTd = document.createElement('td');
                const actionDiv = document.createElement('div');
                actionDiv.className = 'd-flex gap-1 justify-content-center';

                // Edit Button
                const btnEdit = document.createElement('button');
                btnEdit.className = 'btn btn-success btn-sm btn-square-sm';
                btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
                btnEdit.title = 'Edit';
                btnEdit.onclick = () => handleEdit(item._id);

                // Print Button
                const btnPrint = document.createElement('button');
                btnPrint.className = 'btn btn-primary btn-sm btn-square-sm';
                btnPrint.innerHTML = '<i class="fas fa-print"></i>';
                btnPrint.title = 'Print';
                btnPrint.onclick = () => handlePrint(item._id);

                // Delete Button
                const btnDelete = document.createElement('button');
                btnDelete.className = 'btn btn-danger btn-sm btn-square-sm';
                btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
                btnDelete.title = 'Delete';
                btnDelete.onclick = () => handleDelete(item._id);

                actionDiv.appendChild(btnEdit);
                actionDiv.appendChild(btnPrint);
                actionDiv.appendChild(btnDelete);
                actionTd.appendChild(actionDiv);
                tr.appendChild(actionTd);

                // 2. Data Columns
                const dateStr = new Date(item.date).toLocaleDateString();
                const branchName = item.branch || '-';
                const deptName = (item.department && item.department.name) ? item.department.name : '-';
                const counter = item.cashCounter || '-';
                const mode = item.mode || '-';

                let bankName = '-';
                if (item.bank) {
                    if (typeof item.bank === 'object' && item.bank.bankName) {
                        bankName = item.bank.bankName;
                    } else if (typeof item.bank === 'string') {
                        // Lookup from allBanks
                        const found = allBanks.find(b => b._id === item.bank);
                        bankName = found ? found.bankName : 'ID: ' + item.bank.substring(0, 5) + '...';
                    } else if (typeof item.bank === 'object') {
                        bankName = item.bank.bankName || JSON.stringify(item.bank); // Debug helper
                    }
                }

                const invoiceNo = item.invoiceNo || '-';
                const salesAmt = item.sales ? item.sales.toFixed(2) : '0.00';
                const totalAmt = item.totalAmount ? item.totalAmount.toFixed(2) : '0.00';

                tr.insertAdjacentHTML('beforeend', `
                    <td>${dateStr}</td>
                    <td>${invoiceNo}</td>
                    <td>${branchName}</td>
                    <td>${deptName}</td>
                    <td>${counter}</td>
                    <td>${mode}</td>
                    <td>${bankName}</td>
                    <td>${salesAmt}</td>
                    <td>${totalAmt}</td>
                `);

                tbody.appendChild(tr);
            });
        }
    } catch (e) { console.error('Error fetching list:', e); }
}

async function handleEdit(id) {
    const item = currentList.find(r => r._id === id);
    if (!item) return;

    // Hide Modal
    const modalEl = document.getElementById('listModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    editingId = id;
    const saveBtn = document.querySelector('button[onclick="saveSale()"]');
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update';

    // Populate Fields
    document.getElementById('branch').value = item.branch;
    document.getElementById('date').valueAsDate = new Date(item.date);
    document.getElementById('mode').value = item.mode;

    // Trigger mode change to show/hide fields
    toggleMode();

    if (item.department) {
        // We need to wait for departments to load? 
        // Or just set value. Since we usually load on page load/branch change.
        // Let's reload departments for the selected branch just in case
        await loadDepartments();
        document.getElementById('department').value = item.department._id;

        // Trigger generic department change logic if needed
        if (item.mode === 'Bank') loadBankList();
    }

    document.getElementById('cashCounter').value = item.cashCounter;

    // Bank Details
    if (item.mode === 'Bank') {
        await loadBankList();
        if (item.bank) document.getElementById('bankSelect').value = item.bank._id;
        document.getElementById('deductedAmount').value = item.deductedAmount || 0;
        document.getElementById('deductionCheck').checked = item.isDeduction;
    }

    // Populate Table (Single Row)
    const tbody = document.getElementById('salesTableBody');
    tbody.innerHTML = ''; // Clear existing

    const isBank = item.mode === 'Bank';

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="invoice-cell" style="display: ${isBank ? 'none' : 'table-cell'}"><input type="text" class="form-control form-control-sm invoice-input" value="${item.invoiceNo || ''}" placeholder="Invoice No"></td>
        <td><input type="number" class="form-control form-control-sm sales-input" value="${item.sales || 0}" placeholder="0" oninput="updateTotal()"></td>
        <td class="text-center">
            <button class="btn btn-danger btn-sm py-0 remove-btn" tabindex="-1"><i class="fas fa-times"></i></button>
        </td>
    `;
    tbody.appendChild(tr);

    // Attach listeners
    tr.querySelector('.sales-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            // In edit mode for single ID, maybe don't add new row? 
            // Or if we do, it implies we are converting to bulk? 
            // Let's allow addRow for now, but save logic needs to handle it.
            addRow();
        }
    });
    tr.querySelector('.remove-btn').onclick = function () {
        if (tbody.querySelectorAll('tr').length > 1) {
            tr.remove();
            updateTotal();
        } else {
            tr.querySelector('.invoice-input').value = '';
            tr.querySelector('.sales-input').value = '';
            updateTotal();
        }
    };

    updateTotal();
}

function handleDelete(id) {
    pendingDeleteId = id;
    const modalEl = document.getElementById('deleteModal');
    if (window.bootstrap) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    } else {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

// Confirm Delete Listener
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/cash-sales/${pendingDeleteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        const modalEl = document.getElementById('deleteModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        if (data.success) {
            fetchCashSalesList(); // Refresh list
        } else {
            alert('Error deleting: ' + data.message);
        }
    } catch (e) { console.error(e); }
});

function handlePrint(id) {
    window.open(`/print-invoice?type=cash-sale&id=${id}`, '_blank');
}

function printSale() {
    // Print current form state?
    // Maybe save first then print? 
    // Usually print buttons on form print the LAST saved or Draft.
    // For now, alert or simple logic.
    alert('Please select a record from the List to print, or Save first.');
}

// Updated Save Function
// Updated Save Function
async function saveSale() {
    const saveBtn = document.querySelector('button[onclick="saveSale()"]');
    if (saveBtn && saveBtn.disabled) return; // Prevent multiple clicks

    const rows = document.querySelectorAll('#salesTableBody tr');
    if (rows.length === 0) return;

    const date = document.getElementById('date').value;
    const branch = document.getElementById('branch').value;
    const mode = document.getElementById('mode').value;
    const department = document.getElementById('department').value;
    const cashCounter = document.getElementById('cashCounter').value;
    const isBank = mode === 'Bank';

    if (!department) { alert('Select Department'); return; }

    const payloadArray = [];
    let bankDetails = {};
    if (isBank) {
        bankDetails.bank = document.getElementById('bankSelect').value;
        bankDetails.deductedAmount = parseFloat(document.getElementById('deductedAmount').value) || 0;
        bankDetails.isDeduction = document.getElementById('deductionCheck').checked;
        if (!bankDetails.bank) { alert('Select Bank'); return; }
    } else {
        bankDetails = { bank: null, deductedAmount: 0, isDeduction: false };
    }

    // Gather Data & Aggregate
    let totalSales = 0;
    let accumulatedInvoiceNos = [];
    let validRowsCount = 0;

    rows.forEach(tr => {
        const invoiceInput = tr.querySelector('.invoice-input');
        const invoiceNo = invoiceInput ? invoiceInput.value.trim() : '';
        const sales = parseFloat(tr.querySelector('.sales-input').value) || 0;

        const isValid = isBank ? (sales > 0) : (invoiceNo && sales > 0);

        if (isValid) {
            totalSales += sales;
            if (!isBank) {
                accumulatedInvoiceNos.push(invoiceNo);
            }
            validRowsCount++;
        }
    });

    if (validRowsCount === 0 || totalSales <= 0) {
        alert('Please enter at least one valid sale.');
        return;
    }

    // Construct Single Aggregated Item
    const finalInvoiceNo = isBank ? 'Bank Deposit' : accumulatedInvoiceNos.join(', ');

    const aggregatedItem = {
        date,
        branch,
        mode,
        department,
        cashCounter: isBank ? 'Bank' : cashCounter,
        invoiceNo: finalInvoiceNo,
        sales: totalSales,
        totalAmount: totalSales,
        ...bankDetails
    };

    payloadArray.push(aggregatedItem);

    // Lock Button
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    try {
        const token = localStorage.getItem('token');
        let success = false;
        let message = '';

        if (editingId) {
            // Update Mode
            const payload = payloadArray[0];
            const response = await fetch(`/api/v1/cash-sales/${editingId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            success = data.success;
            message = success ? 'Updated successfully' : data.message;
        } else {
            // Create Mode
            const response = await fetch('/api/v1/cash-sales', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payloadArray)
            });
            const data = await response.json();
            success = data.success;
            message = success ? ('Saved successfully: ' + (data.count || 1) + ' records.') : data.message;
        }

        if (success) {
            alert(message);
            clearForm();
        } else {
            alert('Error: ' + message);
        }
    } catch (e) {
        console.error(e);
        alert('An error occurred while saving. Please try again.');
    } finally {
        // Unlock Button
        if (saveBtn) {
            saveBtn.disabled = false;
            // Restore text based on state (editingId is null if cleared, so defaults to Save)
            saveBtn.innerHTML = editingId ? '<i class="fas fa-save"></i> Update' : '<i class="fas fa-save"></i> Save';
        }
    }
}

// Override clearForm to reset editing state
const originalClearForm = clearForm;
clearForm = function () { // Re-defining clearForm
    editingId = null;
    const saveBtn = document.querySelector('button[onclick="saveSale()"]');
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';

    document.getElementById('salesTableBody').innerHTML = '';
    addRow();
    updateTotal();

    // Reset fields
    document.getElementById('department').value = '';
    document.getElementById('totalAmount').value = '0.00';
    document.getElementById('cashCounter').selectedIndex = 0;

    // Bank
    document.getElementById('bankSelect').value = '';
    document.getElementById('deductedAmount').value = '0';
    document.getElementById('deductionCheck').checked = true;

    // Re-load list if mode changed? No need.
    // Reset date to today? Maybe keep selected.
}


