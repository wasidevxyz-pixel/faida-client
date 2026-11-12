let advances = [];
let employees = [];
let currentBranchEmployees = [];
const branchEmployeesCache = new Map();
let isBranchEmployeesLoading = false;
let latestBranchLoadToken = 0;
const MIN_EMPLOYEE_LOADING_MS = 300;
let currentInstallmentData = {
    preMonthInstallment: { preBal: 0, installment: 0, balance: 0 },
    currentMonthInstallment: { preBal: 0, installment: 0, balance: 0 },
    isManuallySet: false
};
let currentEmployeeSearchIndex = -1;
let pendingAction = null; // 'edit' or 'delete'
let pendingId = null;

// ─── Network Retry Helper ─────────────────────────────────────────────────────
// Silently retries up to `retries` times with a 1-second delay between attempts.
// Prevents ERR_NETWORK_CHANGED / brief-blip alerts from reaching the user.
async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, options);
            return res;
        } catch (err) {
            if (attempt === retries) throw err;
            console.warn(`[fetchWithRetry] Attempt ${attempt} failed for ${url}. Retrying in ${delayMs}ms…`, err.message);
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
}

function setEmployeeSearchLoading(loading, message = 'Loading employees...') {
    isBranchEmployeesLoading = loading;
    const resultsBox = document.getElementById('employeeSearchResults');
    if (!resultsBox) return;

    if (loading) {
        resultsBox.dataset.state = 'loading';
        resultsBox.innerHTML = `
            <div class="list-group-item p-2 small text-muted d-flex align-items-center gap-2">
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                <span>${message}</span>
            </div>
        `;
        resultsBox.style.display = 'block';
        return;
    }

    if (resultsBox.dataset.state === 'loading') {
        resultsBox.innerHTML = '';
        resultsBox.style.display = 'none';
    }
    delete resultsBox.dataset.state;
}

document.addEventListener('DOMContentLoaded', async () => {
    setDefaultDate();

    // Auth Modal Enter Key Listener
    document.getElementById('authPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') confirmModification();
    });
    // Fast boot: do not block screen on full employee list.
    // Employees are loaded per-branch on demand.
    Promise.all([
        loadBranches(),
        loadDepartments()
    ]).then(async () => {
        const selectedBranch = document.getElementById('branch')?.value || '';
        if (selectedBranch) {
            await loadEmployeesByBranch(selectedBranch);
        }
    }).finally(() => {
        loadAdvances();
    });

    document.getElementById('date')?.addEventListener('change', () => loadEmployeeBalance());

    // BRANCH CHANGE: Sync employee pool AND reload advance list for selected branch
    document.getElementById('branch')?.addEventListener('change', async () => {
        const selectedBranch = document.getElementById('branch')?.value || '';
        const resultsBox = document.getElementById('employeeSearchResults');
        const empInput = document.getElementById('employeeInput');
        if (resultsBox) { resultsBox.innerHTML = ''; resultsBox.style.display = 'none'; }
        if (empInput) empInput.value = '';
        await loadEmployeesByBranch(selectedBranch);
        // Recalculate employee pool for selected branch
        filterEmployees();
        // Reload the advance records table for the selected branch
        loadAdvances();
    });

    // Search functionality for the advance list
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const selectedBranch = document.getElementById('branch').value;
        const fromDate = document.getElementById('searchFromDate').value;
        const toDate = document.getElementById('searchToDate').value;

        const filtered = advances.filter(adv => {
            // Text Match
            const matchesSearch = adv.employee?.name?.toLowerCase().includes(searchTerm) ||
                adv.branch?.toLowerCase().includes(searchTerm);

            // Branch Match
            const matchesBranch = !selectedBranch || adv.branch === selectedBranch;

            // Date Match
            const advDateStr = adv.date ? new Date(adv.date).toISOString().split('T')[0] : '';
            const matchesDate = (fromDate && toDate) ? (advDateStr >= fromDate && advDateStr <= toDate) : true;

            return matchesSearch && matchesBranch && matchesDate;
        });
        renderTable(filtered);
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            const modal = document.getElementById('installmentModal');
            if (modal && modal.classList.contains('show')) {
                saveInstallment();
            } else {
                saveAdvance();
            }
        }
    });
});

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const data = await window.cachedFetch('/api/v1/employee-departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (data.success) {
            const select = document.getElementById('department');
            select.innerHTML = '<option value="">Select Department</option>';
            data.data.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept._id;
                option.textContent = dept.name;
                select.appendChild(option);
            });
        } else {
            console.warn('Failed to load advance departments:', data?.message || data);
        }
    } catch (e) {
        console.error('Error loading departments:', e);
    }
}

function setDefaultDate() {
    // Use Local Date instead of UTC ISO string to avoid midnight shifts
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localToday = `${year}-${month}-${day}`;

    // Main Form Date
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.value = localToday;

    // Search Filters: default from first of month to today so no advances are hidden
    const fromDate = document.getElementById('searchFromDate');
    const toDate = document.getElementById('searchToDate');
    const firstOfMonth = `${year}-${month}-01`;
    if (fromDate) fromDate.value = firstOfMonth;
    if (toDate) toDate.value = localToday;

}

async function loadEmployeesByBranch(branchName, force = false) {
    const cacheKey = String(branchName || '').trim();
    if (!cacheKey) {
        currentBranchEmployees = [];
        setEmployeeSearchLoading(false);
        return [];
    }

    if (!force && branchEmployeesCache.has(cacheKey)) {
        currentBranchEmployees = branchEmployeesCache.get(cacheKey) || [];
        setEmployeeSearchLoading(false);
        return currentBranchEmployees;
    }

    const loadToken = ++latestBranchLoadToken;
    const loadStart = Date.now();
    setEmployeeSearchLoading(true, `Loading employees for ${cacheKey}...`);

    try {
        const token = localStorage.getItem('token');
        const url = `/api/v1/employees?light=true&limit=2000&branch=${encodeURIComponent(cacheKey)}`;
        const data = await window.cachedFetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        }, { ttl: 120000 });

        if (data.success) {
            // Filter out 'Import' and 'Resign' status employees before adding them to the global selection list
            const fetchedEmployees = data.data.filter(emp => {
                const status = (emp.status || '').toLowerCase();
                return status !== 'import' && status !== 'resign';
            });

            if (loadToken !== latestBranchLoadToken) {
                return currentBranchEmployees;
            }

            branchEmployeesCache.set(cacheKey, fetchedEmployees);
            currentBranchEmployees = fetchedEmployees;

            fetchedEmployees.forEach(emp => {
                const existingIdx = employees.findIndex(e => e._id === emp._id);
                if (existingIdx === -1) {
                    employees.push(emp);
                } else {
                    employees[existingIdx] = emp;
                }
            });

            return fetchedEmployees;
        }
    } catch (error) {
        console.error('Error loading employees:', error);
    } finally {
        const elapsed = Date.now() - loadStart;
        const waitMs = Math.max(0, MIN_EMPLOYEE_LOADING_MS - elapsed);
        if (waitMs > 0) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
        if (loadToken === latestBranchLoadToken) {
            setEmployeeSearchLoading(false);
        }
    }

    currentBranchEmployees = [];
    return [];
}

// Helper: populate the employee Select2 with a given list
function populateEmployeeSelect(empList) {
    // No-op: we use text-input now, not Select2
}

// Duplicate function removed (defined correctly below)


function clearForm() {
    // CRITICAL: Preserve and Re-select auto-selected branch for restricted users
    const branchSelect = document.getElementById('branch');
    const prevValue = branchSelect ? branchSelect.value : '';

    document.getElementById('advanceId').value = '';
    setDefaultDate();

    // Clear fields
    document.getElementById('department').value = '';
    document.getElementById('transactionType').value = 'Pay';
    document.getElementById('code').value = '';
    document.getElementById('preMonthBal').value = '0';
    document.getElementById('currentMonthBal').value = '0';
    document.getElementById('total').value = '0';
    document.getElementById('salary').value = '0';
    document.getElementById('paid').value = '0';
    document.getElementById('balance').value = '0';
    document.getElementById('docMode').value = 'Cash';
    document.getElementById('remarks').value = '';

    // Restore branch if it was the ONLY available option (restricted user)
    if (branchSelect) {
        if (branchSelect.options.length <= 2 && prevValue) {
            branchSelect.value = prevValue;
        } else {
            branchSelect.value = '';
        }
    }

    // Clear employee text input
    const empInput = document.getElementById('employeeInput');
    if (empInput) empInput.value = '';
    const resultsBox = document.getElementById('employeeSearchResults');
    if (resultsBox) { resultsBox.innerHTML = ''; resultsBox.style.display = 'none'; }

    currentInstallmentData = {
        preMonthInstallment: { preBal: 0, installment: 0, balance: 0 },
        currentMonthInstallment: { preBal: 0, installment: 0, balance: 0 },
        isManuallySet: false
    };
}

async function loadBranches() {
    await window.populateBranchSelect('branch', {
        placeholder: 'Select Branch',
        triggerChange: true // We want to trigger filterEmployees if pre-selected
    });
}

// Duplicate function removed (defined correctly below)


function calculateTotals() {
    const preMonthBal = parseFloat(document.getElementById('preMonthBal').value) || 0;
    const currentMonthBal = parseFloat(document.getElementById('currentMonthBal').value) || 0;
    let amount = parseFloat(document.getElementById('paid').value) || 0;
    const salary = parseFloat(document.getElementById('salary').value) || 0;
    const type = document.getElementById('transactionType').value;

    // Permission Check: Allow Adv More Than Salary (right_01)
    if (type === 'Pay' && amount > salary && salary > 0) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const rights = user.rights || {};
        const permissions = user.permissions || [];
        // Strictly follow the checkbox even for admins
        const canExceed = rights['right_01'] || permissions.includes('right_01');

        if (!canExceed) {
            alert(`Accedd Denied: Advance amount (${amount.toLocaleString()}) cannot exceed basic salary (${salary.toLocaleString()}).`);
            amount = salary;
            document.getElementById('paid').value = salary;
        }
    }

    // Total = Liability Before This Transaction
    // Pre Month Bal + (Current Month Accumulated Changes)
    const total = preMonthBal + currentMonthBal;

    // Balance = Total +/- Amount
    let balance = 0;
    if (type === 'Received') {
        balance = total - amount; // Reducing liability
    } else {
        balance = total + amount; // Increasing liability (Advance)
    }

    document.getElementById('total').value = total;
    document.getElementById('balance').value = balance;
}

async function loadAdvances() {
    const selectedBranch = document.getElementById('branch')?.value || '';

    // Do not load if no branch is selected — show empty state instead
    if (!selectedBranch) {
        advances = [];
        const tbody = document.getElementById('advanceBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-4">Please select a branch to view advances.</td></tr>`;
        }
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const url = `/api/v1/employee-advances?branch=${encodeURIComponent(selectedBranch)}`;

        const response = await fetchWithRetry(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            advances = data.data;

            // Apply Filters (Date, Branch, Search Text)
            const fromDate = document.getElementById('searchFromDate').value;
            const toDate = document.getElementById('searchToDate').value;
            const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase() || '';

            let filtered = advances;

            // Filter by Date
            if (fromDate && toDate) {
                filtered = filtered.filter(adv => {
                    const advDateStr = adv.date ? new Date(adv.date).toISOString().split('T')[0] : '';
                    return advDateStr >= fromDate && advDateStr <= toDate;
                });
            }

            // Filter by Branch (extra safety)
            filtered = filtered.filter(adv => adv.branch === selectedBranch);

            // Filter by Search Text
            if (searchTerm) {
                filtered = filtered.filter(adv =>
                    adv.employee?.name?.toLowerCase().includes(searchTerm) ||
                    adv.branch?.toLowerCase().includes(searchTerm)
                );
            }

            // Filter by Type (Manual vs Payroll)
            const typeFilter = document.getElementById('typeFilter')?.value || 'all';
            if (typeFilter === 'manual') {
                filtered = filtered.filter(adv => !adv.payroll);
            } else if (typeFilter === 'payroll') {
                filtered = filtered.filter(adv => !!adv.payroll);
            }

            renderTable(filtered);
        }
    } catch (error) {
        console.error('Error loading advances:', error);
        alert('Error loading advances');
    }
}

function renderTable(data) {
    const tbody = document.getElementById('advanceBody');
    tbody.innerHTML = '';

    let totalAmount = 0;

    data.forEach(adv => {
        const amount = parseFloat(adv.paid) || 0;
        if (Math.abs(amount) < 0.01) return;

        // Ledger sum: Subtract Received, Add Paid
        if (adv.transactionType === 'Received') {
            totalAmount -= amount;
        } else {
            totalAmount += amount;
        }
        // Date display: Use raw date part to avoid +1 day shifts at midnight
        const ds = adv.date ? new Date(adv.date).toISOString().split('T')[0] : '';
        const dateStr = ds ? ds.split('-').reverse().join('/') : '-';
        const timeStr = adv.createdAt ? new Date(adv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '-';

        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const rights = user.rights || {};
        const permissions = user.permissions || [];
        // Strictly follow mod_12 even for admins
        const canModify = rights['mod_12'] || permissions.includes('mod_12');

        const updateDate = adv.updatedAt ? new Date(adv.updatedAt).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('/') : '-';
        const updateTime = adv.updatedAt ? new Date(adv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '-';
        const modifiedBy = adv.updatedBy?.name || '-';

        const tr = document.createElement('tr');
        if (adv.transactionType === 'Received') {
            tr.style.backgroundColor = '#d4edda'; // Light Green
        } else {
            tr.style.backgroundColor = '#f8d7da'; // Light Red/Pink
        }

        tr.innerHTML = `
            <td style="background-color: inherit !important;">${dateStr}</td>
            <td style="background-color: inherit !important;">${timeStr}</td>
            <td style="background-color: inherit !important;">${adv.employee?.name || '-'}</td>
            <td style="background-color: inherit !important;">${adv.transactionType === 'Received' ? 'Received' : 'Paid'}</td> <!-- Type -->
            <td style="background-color: inherit !important;">${amount}</td>
            <td style="background-color: inherit !important;">${adv.docMode || 'Cash'}</td>
            <td style="background-color: inherit !important;">${adv.docMode === 'Bank' ? (adv.bankName || '-') : '-'}</td> <!-- Bank Name -->
            <td style="background-color: inherit !important;">${adv.createdBy?.name || '-'}</td> <!-- User Name -->
            <td style="background-color: inherit !important;">${modifiedBy}</td>
            <td style="background-color: inherit !important;">${modifiedBy !== '-' ? `${updateDate} ${updateTime}` : '-'}</td>
            <td style="background-color: inherit !important;">${adv.remarks || '-'}</td>
            <td style="background-color: inherit !important;">
                <div class="d-flex">
                    <button class="btn-action-sm btn-action-view" onclick="printSlip('${adv._id}')" title="Print Slip"><i class="fas fa-print"></i></button>
                    ${canModify ? `<button class="btn-action-sm btn-action-edit" onclick="editAdvance('${adv._id}')" title="Edit"><i class="fas fa-edit"></i></button>` : ''}
                    ${canModify ? `<button class="btn-action-sm btn-action-delete" onclick="deleteAdvance('${adv._id}')" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add Total Row
    if (data.length > 0) {
        const totalTr = document.createElement('tr');
        totalTr.style.backgroundColor = '#2c5ba9'; // BAS Blue
        totalTr.style.color = 'white';
        totalTr.style.fontWeight = 'bold';

        totalTr.innerHTML = `
            <td colspan="4" class="text-end" style="background-color: #2c5ba9 !important; color: white !important;">Total</td>
            <td style="background-color: #2c5ba9 !important; color: white !important;">${totalAmount.toLocaleString()}</td>
            <td colspan="7" style="background-color: #2c5ba9 !important;"></td>
        `;
        tbody.appendChild(totalTr);
    }
}

async function printSlip(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/employee-advances/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const adv = data.data;
            const empName = adv.employee ? `${adv.employee.name}` : '-';
            const deptName = adv.department ? adv.department.name : (adv.employee?.department?.name || '-');
            const desigName = adv.employee?.designation?.name || '-';
            const dateStr = adv.date ? new Date(adv.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

            // Amount
            const amount = adv.paid || 0;
            const preBal = adv.total || 0; // Assuming 'total' was the balance before this transaction as per calculation logic

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Advance Payment Slip</title>
                    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&family=Dancing+Script:wght@700&family=Mrs+Saint+Delafield&display=swap" rel="stylesheet">
                    <style>
                        body { font-family: 'Times New Roman', serif; padding: 20px; }
                        .container { width: 800px; margin: 0 auto; border: 1px solid #000; padding: 20px; }
                        .header { text-align: center; margin-bottom: 20px; }
                        .title { font-size: 24px; font-weight: bold; margin: 5px 0; }
                        .subtitle { font-size: 14px; }
                        .slip-title { font-size: 18px; font-weight: bold; text-decoration: underline; margin-top: 10px; }
                        
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        td { border: 1px solid #000; padding: 8px; vertical-align: middle; }
                        .label-col { width: 30%; font-weight: bold; }
                        .value-col { width: 70%; font-weight: bold; }
                        
                        .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
                        .sig-box { text-align: center; width: 30%; position: relative; }
                        .sig-line { border-top: 1px solid #000; margin-top: 2px; margin-bottom: 5px; }
                        .signature-font { 
                            font-family: 'Mrs+Saint+Delafield', 'Mrs Saint Delafield', cursive; 
                            font-size: 2.8rem; 
                            color: #1a237e;
                            line-height: 1;
                            margin-bottom: -18px;
                            display: block;
                            letter-spacing: 0px;
                        }
                        .sig-label { font-size: 12px; font-weight: bold; margin-top: 2px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="title">Dwatson</div>
                            <div class="subtitle">Islamabad</div>
                            <div class="subtitle">051-5895662, 1234567</div>
                            <div class="slip-title">Advance Payment Slip</div>
                        </div>
                        
                        <table>
                            <tr>
                                <td class="label-col">Dated</td>
                                <td class="value-col">${dateStr}</td>
                            </tr>
                            <tr>
                                <td class="label-col">Employee</td>
                                <td class="value-col">${empName}</td>
                            </tr>
                            <tr>
                                <td class="label-col">Pre Balance</td>
                                <td class="value-col">${preBal.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td class="label-col">Current Advance Paid</td>
                                <td class="value-col">${amount.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td class="label-col">Department</td>
                                <td class="value-col">${deptName}</td>
                            </tr>
                            <tr>
                                <td class="label-col">Designation</td>
                                <td class="value-col">${desigName}</td>
                            </tr>
                            <tr>
                                <td class="label-col">Remarks</td>
                                <td class="value-col">${adv.remarks || ''}</td>
                            </tr>
                        </table>
                        
                        <div class="signatures">
                            <div class="sig-box">
                                <span class="signature-font">${adv.createdBy?.name || ''}</span>
                                <div class="sig-line"></div>
                                <div class="sig-label">Prepared By Signature</div>
                            </div>
                            <div class="sig-box">
                                <div style="height: 40px;"></div>
                                <div class="sig-line"></div>
                                <div class="sig-label">Received By Signature</div>
                            </div>
                            <div class="sig-box">
                                <div style="height: 40px;"></div>
                                <div class="sig-line"></div>
                                <div class="sig-label">Approved By Signature</div>
                            </div>
                        </div>
                    </div>
                    <script>
                        document.fonts.ready.then(function () {
                            window.print();
                        });
                        window.onafterprint = function() { window.close(); }
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }
    } catch (e) {
        console.error('Error printing slip:', e);
        alert('Error generating print slip');
    }
}

async function saveAdvance(customSuccessMsg = null) {
    const advanceId = document.getElementById('advanceId').value;

    // Resolve employee from the text input
    const empCode = document.getElementById('code').value;
    const selectedEmp = employees.find(e => e.code == empCode);
    const empId = selectedEmp ? selectedEmp._id : '';

    const deptValue = document.getElementById('department').value;
    const cPreBal1 = parseFloat(document.getElementById('preMonthBal').value) || 0;
    const cCurrMonthBal = parseFloat(document.getElementById('currentMonthBal').value) || 0;
    const cPaid = parseFloat(document.getElementById('paid').value) || 0;
    const cType = document.getElementById('transactionType').value;
    const cPreBal2 = cCurrMonthBal + (cType === 'Pay' ? cPaid : -cPaid);

    const advanceData = {
        employee: empId,
        date: document.getElementById('date').value,
        branch: document.getElementById('branch').value,
        department: deptValue || null,
        transactionType: cType,
        code: document.getElementById('code').value,
        preMonthBal: cPreBal1,
        currentMonthBal: cCurrMonthBal,
        total: parseFloat(document.getElementById('total').value) || 0,
        salary: parseFloat(document.getElementById('salary').value) || 0,
        paid: cPaid,
        balance: parseFloat(document.getElementById('balance').value) || 0,
        docMode: document.getElementById('docMode').value,
        remarks: document.getElementById('remarks').value
    };

    if (!advanceData.employee || !advanceData.date) {
        alert('Please select employee and date');
        return;
    }

    // Extra safety check before saving
    if (advanceData.transactionType === 'Pay' && advanceData.paid > advanceData.salary && advanceData.salary > 0) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const rights = user.rights || {};
        const permissions = user.permissions || [];
        // Strictly follow the checkbox even for admins
        const canExceed = rights['right_01'] || permissions.includes('right_01');

        if (!canExceed) {
            alert(`Access Denied: Advance amount cannot exceed basic salary (${advanceData.salary.toLocaleString()}).`);
            return;
        }
    }

    try {
        const token = localStorage.getItem('token');
        const url = advanceId ? `/api/v1/employee-advances/${advanceId}` : '/api/v1/employee-advances';
        const method = advanceId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(advanceData)
        });

        const data = await response.json();

        if (data.success) {
            alert(customSuccessMsg || (advanceId ? 'Advance updated successfully' : 'Advance created successfully'));

            if (customSuccessMsg) {
                // Save from Installment Modal: Refresh summaries without clearing employee
                await loadAdvances();
                const selectedEmpCode = document.getElementById('code').value;
                const selectedEmp = employees.find(e => String(e.code) === String(selectedEmpCode));
                if (selectedEmp) await selectEmployee(selectedEmp);
            } else {
                // Regular Save: clear the form and refresh the advance list.
                clearForm();
                await loadAdvances();
            }
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving advance:', error);
        alert('Error saving advance');
    }
}

// ... (Search Listeners will be removed/updated in next chunk or implicitly replaced by this file content)

// ...

async function saveInstallment() {
    await saveInstallmentPlanFromModal('Installment Plan Updated Successfully');
}

// Search Listeners & Logic (text input based)
document.addEventListener('DOMContentLoaded', () => {
    // Code Manual Entry
    document.getElementById('code').addEventListener('change', function () {
        const code = this.value.trim();
        if (!code) return;

        const pool = currentBranchEmployees.length ? currentBranchEmployees : employees;
        const emp = pool.find(e => e.code == code) || employees.find(e => e.code == code);
        if (emp) {
            const empInput = document.getElementById('employeeInput');
            empInput.value = `${emp.code} - ${emp.name}`;
            selectEmployee(emp);
        } else {
            alert('Employee with Code ' + code + ' not found.');
        }
    });

    // Employee text input - live search
    const empInput = document.getElementById('employeeInput');
    const resultsBox = document.getElementById('employeeSearchResults');

    if (empInput) {
        empInput.addEventListener('input', function () {
            const term = this.value.toLowerCase().trim();
            resultsBox.innerHTML = '';
            resultsBox.style.display = 'none';
            currentEmployeeSearchIndex = -1;

            if (isBranchEmployeesLoading) {
                if (term.length >= 1) {
                    setEmployeeSearchLoading(true);
                }
                return;
            }

            if (term.length >= 1) {
                // Use already-filtered pool (DO NOT call filterEmployees here - it clears the input!)
                const pool = currentBranchEmployees;
                const matches = pool.filter(emp =>
                    emp.name.toLowerCase().includes(term) ||
                    (emp.code && emp.code.toString().includes(term))
                ).slice(0, 20);

                if (matches.length > 0) {
                    matches.forEach(emp => {
                        const el = document.createElement('a');
                        el.className = 'list-group-item list-group-item-action p-2 small';
                        el.href = '#';
                        el.innerHTML = `<b>${emp.code}</b> - ${emp.name}`;
                        el.onclick = (e) => {
                            e.preventDefault();
                            empInput.value = `${emp.code} - ${emp.name}`;
                            resultsBox.innerHTML = '';
                            resultsBox.style.display = 'none';
                            selectEmployee(emp);
                        };
                        resultsBox.appendChild(el);
                    });
                    resultsBox.style.display = 'block';
                    resultsBox.matchedEmployees = matches;
                }
            }

            if (!this.value) {
                document.getElementById('code').value = '';
            }
        });

        empInput.addEventListener('keydown', (e) => {
            if (isBranchEmployeesLoading) return;
            if (resultsBox.style.display === 'none') return;
            const items = resultsBox.querySelectorAll('.list-group-item');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentEmployeeSearchIndex = Math.min(currentEmployeeSearchIndex + 1, items.length - 1);
                updateEmployeeSearchSelection(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentEmployeeSearchIndex = Math.max(currentEmployeeSearchIndex - 1, 0);
                updateEmployeeSearchSelection(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentEmployeeSearchIndex >= 0) {
                    const selectedEmp = resultsBox.matchedEmployees?.[currentEmployeeSearchIndex];
                    if (selectedEmp) {
                        empInput.value = `${selectedEmp.code} - ${selectedEmp.name}`;
                        resultsBox.innerHTML = '';
                        resultsBox.style.display = 'none';
                        selectEmployee(selectedEmp);
                    }
                } else {
                    const term = this.value.trim();
                    if (term) {
                        const pool = currentBranchEmployees.length ? currentBranchEmployees : employees;
                        const emp = pool.find(emp => {
                            const codeName = `${emp.code} - ${emp.name}`.toLowerCase();
                            return codeName === term.toLowerCase() || String(emp.code).toLowerCase() === term.toLowerCase();
                        });
                        if (emp) {
                            empInput.value = `${emp.code} - ${emp.name}`;
                            resultsBox.innerHTML = '';
                            resultsBox.style.display = 'none';
                            selectEmployee(emp);
                        }
                    }
                }
            } else if (e.key === 'Escape') {
                resultsBox.innerHTML = '';
                resultsBox.style.display = 'none';
            }
        });
    }

    // Global click to hide suggestions
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.position-relative')) {
            if (resultsBox) { resultsBox.innerHTML = ''; resultsBox.style.display = 'none'; }
        }
    });
});

function updateEmployeeSearchSelection(items) {
    items.forEach(item => item.classList.remove('active'));
    if (currentEmployeeSearchIndex >= 0 && currentEmployeeSearchIndex < items.length) {
        items[currentEmployeeSearchIndex].classList.add('active');
        items[currentEmployeeSearchIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function clearBasicEmployeeFields() {
    document.getElementById('code').value = '';
    document.getElementById('salary').value = 0;
    document.getElementById('preMonthBal').value = 0;
    document.getElementById('currentMonthBal').value = 0;
    document.getElementById('total').value = 0;
    document.getElementById('balance').value = 0;
}


function selectEmployee(emp) {
    // CRITICAL: Clear record ID so we start a NEW transaction
    document.getElementById('advanceId').value = '';
    document.getElementById('paid').value = 0;
    document.getElementById('remarks').value = '';
    document.getElementById('code').value = emp.code || '';

    loadEmployeeBalance(emp);

    // Move cursor to Paid
    const paidInput = document.getElementById('paid');
    if (paidInput) {
        setTimeout(() => { paidInput.focus(); paidInput.select(); }, 150);
    }
}

function filterEmployees() {
    const branchSelect = document.getElementById('branch');
    const selectedBranch = branchSelect.value;
    const empInput = document.getElementById('employeeInput');
    const resultsBox = document.getElementById('employeeSearchResults');

    // NOTE: Do NOT clear empInput here. Clearing is handled by the branch 'change' event listener only.

    if (!selectedBranch) {
        // PROFESSIONAL LOCKDOWN: Never show everyone by default. 
        // If no branch is picked, the search pool MUST be empty.
        currentBranchEmployees = [];
        return;
    }

    const normalizeBranch = (value) => String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[()]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const exactCache = branchEmployeesCache.get(selectedBranch);
    if (Array.isArray(exactCache)) {
        currentBranchEmployees = exactCache;
    }

    if (!currentBranchEmployees.length) {
    const target = normalizeBranch(selectedBranch);

    // Professional Matcher with High-Verbosity Logging
    const filtered = employees.filter(emp => {
        let branchVal = emp.branch;
        if (!branchVal) return false;

        let branches = Array.isArray(branchVal) ? branchVal : [String(branchVal)];
        
        const isMatch = branches.some(b => {
            const bNorm = normalizeBranch(b);
            return bNorm === target;
        });

        if (isMatch) {
            console.log(`[MATCH] "${emp.name}" (Branch: ${JSON.stringify(emp.branch)}) matches target "${selectedBranch}"`);
        }
        return isMatch;
    });

    console.log(`[FILTER DONE] Target="${selectedBranch}" | Total Matches: ${filtered.length}`);
    currentBranchEmployees = filtered;
    }

    // Filter the advance list by Branch, Date, and Search Text
    const fromDate = document.getElementById('searchFromDate').value;
    const toDate = document.getElementById('searchToDate').value;
    const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase() || '';

    const filteredAdvances = advances.filter(adv => {
        const matchesBranch = !selectedBranch || adv.branch === selectedBranch;

        const advDateStr = adv.date ? new Date(adv.date).toISOString().split('T')[0] : '';
        const matchesDate = (fromDate && toDate) ? (advDateStr >= fromDate && advDateStr <= toDate) : true;

        const matchesSearch = !searchTerm ||
            (adv.employee?.name?.toLowerCase().includes(searchTerm) ||
                adv.branch?.toLowerCase().includes(searchTerm));

        return matchesBranch && matchesDate && matchesSearch;
    });
    renderTable(filteredAdvances);
}

function hasPositivePreMonthInstallmentPlan(adv) {
    return (parseFloat(adv?.preMonthInstallment?.installment) || 0) > 0;
}

function isRealPreMonthInstallmentPlan(adv) {
    const installment = parseFloat(adv?.preMonthInstallment?.installment) || 0;
    const originalPreBal = parseFloat(adv?.preMonthInstallment?.preBal) || 0;
    if (installment <= 0) return false;
    return originalPreBal > 0 && installment < originalPreBal;
}

function capInstallment(installment, balance) {
    const safeBalance = Math.max(0, parseFloat(balance) || 0);
    const safeInstallment = Math.max(0, parseFloat(installment) || 0);
    return Math.min(safeInstallment, safeBalance);
}

function buildInstallmentData(preMonthPlanSource, currentMonthPlanSource, preBal, accumulatedChange) {
    const preInstallment = preMonthPlanSource
        ? capInstallment(preMonthPlanSource.preMonthInstallment?.installment, preBal)
        : 0;
    const currentInstallment = currentMonthPlanSource
        ? capInstallment(currentMonthPlanSource.currentMonthInstallment?.installment, accumulatedChange)
        : Math.max(0, accumulatedChange);
    return {
        preMonthInstallment: {
            preBal,
            installment: preInstallment,
            balance: Math.max(0, preBal - preInstallment)
        },
        currentMonthInstallment: {
            preBal: accumulatedChange,
            installment: currentInstallment,
            balance: Math.max(0, accumulatedChange - currentInstallment)
        },
        isFromHistory: true,
        hasPreMonthPlan: !!preMonthPlanSource,
        hasCurrentMonthPlan: !!currentMonthPlanSource
    };
}

function sameAmount(a, b) {
    return Math.abs((parseFloat(a) || 0) - (parseFloat(b) || 0)) < 0.01;
}

async function fetchInstallmentPlan(employeeId, dateValue) {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/v1/employee-advances/installment-plan?employee=${encodeURIComponent(employeeId)}&date=${encodeURIComponent(dateValue)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (!data.success) {
        throw new Error(data.message || 'Failed to load installment plan');
    }
    return data.data || {};
}

async function persistInstallmentPlan(employeeId, planData) {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/v1/employee-advances/installment-plan', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(planData)
    });
    const data = await response.json();
    if (!data.success) {
        throw new Error(data.message || 'Failed to save installment plan');
    }
    return data.data;
}

async function saveInstallmentPlanFromModal(successMessage) {
    const empCode = document.getElementById('code').value;
    const selectedEmp = employees.find(e => e.code == empCode);
    if (!selectedEmp) {
        alert('Please select an employee first');
        return;
    }

    const inst1 = parseFloat(document.getElementById('modalInstallment1').value) || 0;
    const inst2 = parseFloat(document.getElementById('modalInstallment2').value) || 0;
    const bal1 = parseFloat(document.getElementById('modalBalance1').value) || 0;
    const bal2 = parseFloat(document.getElementById('modalBalance2').value) || 0;

    if (bal1 < 0 || bal2 < 0) {
        alert('Negative Balance is not allowed. Please check Installment Amount.');
        return;
    }

    currentInstallmentData.preMonthInstallment = {
        preBal: parseFloat(document.getElementById('modalPreBal1').value) || 0,
        installment: inst1,
        balance: bal1
    };
    currentInstallmentData.currentMonthInstallment = {
        preBal: parseFloat(document.getElementById('modalPreBal2').value) || 0,
        installment: inst2,
        balance: bal2
    };
    currentInstallmentData.isManuallySet = true;
    currentInstallmentData.hasPreMonthPlan = inst1 > 0;
    currentInstallmentData.hasCurrentMonthPlan = inst2 > 0;

    const modalEl = document.getElementById('installmentModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    try {
        await persistInstallmentPlan(selectedEmp._id, {
            employee: selectedEmp._id,
            date: document.getElementById('date').value,
            branch: document.getElementById('branch').value,
            preMonthInstallment: currentInstallmentData.preMonthInstallment,
            currentMonthInstallment: currentInstallmentData.currentMonthInstallment
        });
        alert(successMessage);
        await loadAdvances();
        await loadEmployeeBalance(selectedEmp);
    } catch (error) {
        console.error('Error saving installment plan:', error);
        alert(error.message || 'Error saving installment plan');
    }
}

async function loadEmployeeBalance(selectedEmp) {
    // Support being called with no arg (e.g. from date change)
    if (!selectedEmp) {
        const empInputEl = document.getElementById('employeeInput');
        const codeInputEl = document.getElementById('code');
        const empInputVal = (empInputEl?.value || '').trim();
        const codeInputVal = (codeInputEl?.value || '').trim();

        // Prefer the visible search input, but fall back to the code field when needed.
        let lookupValue = empInputVal || codeInputVal;
        if (!lookupValue) { clearBasicEmployeeFields(); return; }

        // Robust Lookup: check for 'code - name' format first
        let codeOnly = lookupValue;
        if (lookupValue.includes(' - ')) {
            codeOnly = lookupValue.split(' - ')[0].trim();
        }

        selectedEmp = employees.find(e => String(e.code).trim() === codeOnly.trim())
            || employees.find(e => (String(e.code).trim() + ' - ' + String(e.name).trim()).toLowerCase() === lookupValue.toLowerCase())
            || employees.find(e => String(e.name).trim().toLowerCase() === lookupValue.toLowerCase());

        if (!selectedEmp) { clearBasicEmployeeFields(); return; }
    }

    // Reset installment data fully
    currentInstallmentData = {
        preMonthInstallment: { preBal: 0, installment: 0, balance: 0 },
        currentMonthInstallment: { preBal: 0, installment: 0, balance: 0 },
        isFromHistory: false,
        isManuallySet: false
    };

    if (selectedEmp) {
        document.getElementById('code').value = selectedEmp.code || '';
        document.getElementById('salary').value = selectedEmp.basicSalary || 0;

        // Auto-populate department from employee record
        if (selectedEmp.department) {
            const deptId = typeof selectedEmp.department === 'object' ? selectedEmp.department._id : selectedEmp.department;
            document.getElementById('department').value = deptId;
        }

        try {
            // Guard: ensure we have a valid employee ID before fetching
            if (!selectedEmp._id) {
                clearBasicEmployeeFields();
                return;
            }
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/v1/employee-advances?employee=${selectedEmp._id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.success) {
                const advs = data.data;
                // STABLE SORT: Absolute temporal order
                advs.sort((a, b) => {
                    const t1 = new Date(a.date).getTime();
                    const t2 = new Date(b.date).getTime();
                    if (t1 !== t2) return t1 - t2;
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                });

                const dateVal = document.getElementById('date').value;
                const selectedDate = dateVal ? new Date(dateVal) : new Date();
                const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                // --- DYNAMIC BALANCE CALCULATION (Running Total Logic) ---
                const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59);
                const advanceId = document.getElementById('advanceId').value;

                // Reset specific fields for a new entry if we are NOT in edit mode
                if (!advanceId) {
                    document.getElementById('paid').value = 0;
                    document.getElementById('remarks').value = '';
                }

                // Calculate Starting Balance for this Month (Closing balance of last month)
                const sYear = selectedDate.getFullYear();
                const sMonth = selectedDate.getMonth() + 1;
                const selMonthPrefix = `${sYear}-${sMonth.toString().padStart(2, '0')}`;

                const prevMonthAdvs = advs.filter(a => {
                    const d = new Date(a.date);
                    const aYear = d.getFullYear();
                    const aMonth = d.getMonth() + 1;
                    const aMonthPrefix = `${aYear}-${aMonth.toString().padStart(2, '0')}`;
                    return aMonthPrefix < selMonthPrefix;
                });
                // Dynamically recalculate preBal from all previous-month transactions
                // (Do NOT rely on stored balance field which may be stale after optimizations)
                let preBal = 0;
                prevMonthAdvs.forEach(a => {
                    const amt = parseFloat(a.paid) || 0;
                    if (a.transactionType === 'Received') {
                        preBal -= amt;
                    } else {
                        preBal += amt;
                    }
                });

                // Calculate Net Change in Current Month (History)
                const currentMonthHistory = advs.filter(a => {
                    const d = new Date(a.date);
                    const aYear = d.getFullYear();
                    const aMonth = d.getMonth() + 1;
                    const aMonthPrefix = `${aYear}-${aMonth.toString().padStart(2, '0')}`;

                    const isSameMonth = aMonthPrefix === selMonthPrefix;
                    const isOtherRecord = advanceId ? (a._id !== advanceId) : true;
                    return isSameMonth && isOtherRecord;
                });

                let accumulatedChange = 0;
                currentMonthHistory.forEach(a => {
                    const amt = a.paid || 0;
                    if (a.transactionType === 'Received') {
                        accumulatedChange -= amt;
                    } else {
                        accumulatedChange += amt;
                    }
                });

                document.getElementById('preMonthBal').value = preBal;
                document.getElementById('currentMonthBal').value = Number(accumulatedChange.toFixed(2));

                const installmentPlan = await fetchInstallmentPlan(selectedEmp._id, dateVal);
                const preMonthPlanSource = installmentPlan.preMonthInstallment
                    ? { preMonthInstallment: installmentPlan.preMonthInstallment }
                    : null;
                const currentMonthPlanSource = installmentPlan.currentMonthInstallment &&
                    sameAmount(installmentPlan.currentMonthInstallment.preBal, accumulatedChange)
                    ? { currentMonthInstallment: installmentPlan.currentMonthInstallment }
                    : null;

                if (preMonthPlanSource || currentMonthPlanSource) {
                    currentInstallmentData = buildInstallmentData(preMonthPlanSource, currentMonthPlanSource, preBal, accumulatedChange);
                } else {
                    // Fallback: Default to full balance if no history record found
                    currentInstallmentData = {
                        preMonthInstallment: { preBal: preBal, installment: preBal, balance: 0 },
                        currentMonthInstallment: { preBal: accumulatedChange, installment: accumulatedChange, balance: 0 },
                        isFromHistory: false
                    };
                }
                // --- END DYNAMIC CALCULATION ---
            } else {
                document.getElementById('preMonthBal').value = 0;
                document.getElementById('currentMonthBal').value = 0;
            }

            calculateTotals();
        } catch (error) {
            console.error('Error loading balance:', error);
            document.getElementById('preMonthBal').value = 0;
            document.getElementById('currentMonthBal').value = 0;
        }
    }
}

async function editAdvance(id) {
    pendingId = id;
    pendingAction = 'edit';

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('authUsername').value = user.name || 'User';
    document.getElementById('authPassword').value = '';

    const authModal = new bootstrap.Modal(document.getElementById('authModal'));
    authModal.show();
}

async function executeEdit(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/employee-advances/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const adv = data.data;
            document.getElementById('advanceId').value = adv._id;

            // Set Branch and trigger filter FIRST (since it clears search input)
            document.getElementById('branch').value = adv.branch || '';
            filterEmployees();

            // Set Employee Info correctly
            const emp = adv.employee;
            if (emp && typeof emp === 'object') {
                // Ensure this employee is in our local cache (needed for saveAdvance and loadEmployeeBalance)
                if (!employees.find(e => e._id === emp._id)) {
                    employees.push(emp);
                }
            }

            if (emp) {
                const empName = typeof emp === 'object' ? emp.name : '';
                const empCode = typeof emp === 'object' ? emp.code : (adv.code || '');
                document.getElementById('employeeInput').value = empCode ? `${empCode} - ${empName}` : empName;
                document.getElementById('code').value = empCode;
            } else {
                document.getElementById('code').value = adv.code || '';
            }

            document.getElementById('date').value = adv.date ? adv.date.split('T')[0] : '';
            document.getElementById('department').value = adv.department || '';
            document.getElementById('transactionType').value = adv.transactionType || 'Pay';

            document.getElementById('preMonthBal').value = adv.preMonthBal || 0;
            document.getElementById('currentMonthBal').value = adv.currentMonthBal || 0;
            document.getElementById('total').value = adv.total || 0;
            document.getElementById('salary').value = adv.salary || 0;
            document.getElementById('paid').value = adv.paid || 0;
            document.getElementById('balance').value = adv.balance || 0;
            document.getElementById('docMode').value = adv.docMode || 'Cash';
            document.getElementById('remarks').value = adv.remarks || '';

            // Load installment data
            currentInstallmentData = {
                preMonthInstallment: adv.preMonthInstallment || { preBal: 0, installment: 0, balance: 0 },
                currentMonthInstallment: adv.currentMonthInstallment || { preBal: 0, installment: 0, balance: 0 },
                isFromHistory: !!adv.preMonthInstallment,
                isManuallySet: true
            };

            calculateTotals();
        }
    } catch (error) {
        console.error('Error loading advance:', error);
        alert('Error loading advance');
    }
}

async function deleteAdvance(id) {
    pendingId = id;
    pendingAction = 'delete';

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('authUsername').value = user.name || 'User';
    document.getElementById('authPassword').value = '';

    const authModal = new bootstrap.Modal(document.getElementById('authModal'));
    authModal.show();
}

async function executeDelete(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/employee-advances/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success) {
            alert('Advance deleted successfully');
            loadAdvances();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting advance:', error);
        alert('Error deleting advance');
    }
}

async function confirmModification() {
    const password = document.getElementById('authPassword').value;
    if (!password) {
        alert('Please enter password');
        return;
    }

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    try {
        // Verify Password via Login API
        const verifyRes = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: password })
        });

        const verifyData = await verifyRes.json();

        if (!verifyRes.ok || !verifyData.token) {
            alert('Invalid Password');
            return;
        }

        // Final permission check
        const currentUser = verifyData.user || user;
        const currentRights = currentUser.rights || {};
        const currentPerms = currentUser.permissions || [];
        // Strictly follow mod_12 even for admins
        const hasRight = currentRights['mod_12'] || currentPerms.includes('mod_12');

        if (!hasRight) {
            alert('Access Denied: You do not have Employee Advance Modification rights.');
            return;
        }

        // Close Modal
        const modalEl = document.getElementById('authModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        // Proceed with pending action
        if (pendingAction === 'edit') {
            await executeEdit(pendingId);
        } else if (pendingAction === 'delete') {
            if (confirm('Are you sure you want to delete this advance?')) {
                await executeDelete(pendingId);
            }
        }

    } catch (e) {
        console.error('Modification verification error:', e);
        alert('Error verifying permissions');
    }
}
// clearForm and loadBranches are already defined above


function openInstallmentModal() {
    const empCode = document.getElementById('code').value;
    if (!empCode) {
        alert('Please select an employee first');
        return;
    }

    const selectedEmp = employees.find(e => e.code == empCode);
    if (!selectedEmp) {
        alert('Employee not found. Please select an employee.');
        return;
    }

    // Set Header Info
    document.getElementById('modalEmpName').textContent = selectedEmp.name;
    document.getElementById('modalEmpCode').value = selectedEmp.code;

    // Load Data into Modal Inputs
    const preBal1 = parseFloat(document.getElementById('preMonthBal').value) || 0;
    document.getElementById('modalPreBal1').value = preBal1;

    // --- CURRENT MONTH BALANCE SECTION ---
    const currMonthBal = parseFloat(document.getElementById('currentMonthBal').value) || 0;
    const paid = parseFloat(document.getElementById('paid').value) || 0;
    const type = document.getElementById('transactionType').value;
    const preBal2 = currMonthBal + (type === 'Pay' ? paid : -paid);
    document.getElementById('modalPreBal2').value = preBal2;

    let inst1 = currentInstallmentData.preMonthInstallment?.installment;
    let inst2 = currentInstallmentData.currentMonthInstallment?.installment;

    // AUTO-SYNC LOGIC:
    // Pre Month and Current Month are independent. Current month advances must never
    // make the pre-month installment default to full balance.
    if (!currentInstallmentData.hasPreMonthPlan &&
        !currentInstallmentData.hasCurrentMonthPlan &&
        !currentInstallmentData.isFromHistory &&
        !currentInstallmentData.isManuallySet) {
        inst1 = preBal1;
        inst2 = preBal2;
    } else if (!currentInstallmentData.hasCurrentMonthPlan && !currentInstallmentData.isManuallySet) {
        inst2 = preBal2;
    }

    // Default fallbacks for safety
    if (inst1 === undefined || inst1 === null) inst1 = preBal1;
    if (inst2 === undefined || inst2 === null) inst2 = preBal2;

    // Cap at current balances to prevent negative balance results
    inst1 = Math.min(inst1, preBal1);
    inst2 = Math.min(inst2, preBal2);

    document.getElementById('modalInstallment1').value = inst1;
    document.getElementById('modalInstallment2').value = inst2;

    calculateModalTotals();

    // Add Live Calculation Listeners
    document.getElementById('modalInstallment1').oninput = calculateModalTotals;
    document.getElementById('modalInstallment2').oninput = calculateModalTotals;

    const myModal = new bootstrap.Modal(document.getElementById('installmentModal'));
    myModal.show();

    // Track modal state for keyboard shortcut
    document.getElementById('installmentModal').dataset.isOpen = 'true';
    document.getElementById('installmentModal').addEventListener('hidden.bs.modal', function () {
        this.dataset.isOpen = 'false';
    });
}

function calculateModalTotals() {
    // Pre Month - cap installment to preBal so balance never goes negative
    const preBal1 = parseFloat(document.getElementById('modalPreBal1').value) || 0;
    let installment1 = parseFloat(document.getElementById('modalInstallment1').value) || 0;
    if (installment1 > preBal1) {
        installment1 = preBal1;
        document.getElementById('modalInstallment1').value = installment1;
    }
    document.getElementById('modalBalance1').value = preBal1 - installment1;

    // Current Month - cap installment to preBal2 so balance never goes negative
    const preBal2 = parseFloat(document.getElementById('modalPreBal2').value) || 0;
    let installment2 = parseFloat(document.getElementById('modalInstallment2').value) || 0;
    if (installment2 > preBal2) {
        installment2 = preBal2;
        document.getElementById('modalInstallment2').value = installment2;
    }
    document.getElementById('modalBalance2').value = preBal2 - installment2;
}

async function saveInstallment() {
    await saveInstallmentPlanFromModal('Installment Plan Saved Successfully');
}

