
let payrolls = [];
let employees = [];
let departments = [];
let stores = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Set default month to current month
    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7); // YYYY-MM
    document.getElementById('filterFrom').value = monthStr;
    document.getElementById('filterTo').value = monthStr;

    // Initialize Select2
    $('#filterEmployee').select2({
        placeholder: "Select Employee",
        allowClear: true
    });

    await Promise.all([
        loadStores(),
        loadDepartments(),
        loadAllActiveEmployees()
    ]);

    // Consolidate filter listeners for Employee dropdown sync
    const syncFilters = () => {
        const b = document.getElementById('filterBranch').value;
        const d = document.getElementById('filterDepartment').value;
        const s = document.getElementById('filterStatus').value;
        loadAllActiveEmployees(b, d, s);
    };

    document.getElementById('filterBranch').addEventListener('change', async () => {
        const b = document.getElementById('filterBranch').value;
        document.getElementById('filterDepartment').value = '';
        await loadDepartments(b);
        syncFilters();
    });
    document.getElementById('filterDepartment').addEventListener('change', syncFilters);
    document.getElementById('filterStatus').addEventListener('change', syncFilters);

    // Initial load
    loadPayrolls();
});

// Load Dropdown Data
async function loadStores() {
    try {
        const token = localStorage.getItem('token');
        let res = await fetch('/api/v1/stores?', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) {
            res = await fetch('/api/v1/sub-branches', { headers: { 'Authorization': `Bearer ${token}` } });
        }

        const data = await res.json();
        if (data.success && data.data) {
            const sel = document.getElementById('filterBranch');
            sel.innerHTML = '<option value="">All Branches</option>';

            const rawNames = data.data.map(item => (item.name || item.branchName || '').trim());
            const uniqueBranches = [...new Set(rawNames)].filter(n => n !== '').sort();

            uniqueBranches.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading stores:', e); }
}

async function loadDepartments(branchName = '') {
    try {
        const token = localStorage.getItem('token');
        const branch = String(branchName || '').trim();
        const branchKey = branch && !['all', 'select branch', 'null', 'undefined'].includes(branch.toLowerCase()) ? branch : '';
        const url = branchKey ? `/api/v1/employee-departments?branch=${encodeURIComponent(branchKey)}` : '/api/v1/employee-departments';
        const data = await (window.cachedFetch ? window.cachedFetch(url, { headers: { 'Authorization': `Bearer ${token}` } }) : fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()));
        if (data.success) {
            departments = data.data;
            const sel = document.getElementById('filterDepartment');
            sel.innerHTML = '<option value="">All Departments</option>';
            data.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                opt.textContent = d.name;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading departments:', e); }
}

async function loadAllActiveEmployees(branchName = '', deptName = '', status = '') {
    try {
        const token = localStorage.getItem('token');
        
        let isActive = 'true';
        if (status === 'inactive') isActive = 'false';
        else if (status === '') isActive = 'all';

        // includeImportOnly=true allows seeing auto-created employees in the dropdown on this screen
        // limit=50000 ensures we see all names even in large databases (21k+)
        let url = `/api/v1/employees?isActive=${isActive}&includeImportOnly=true&limit=50000`;
        if (branchName) url += `&branch=${encodeURIComponent(branchName)}`;
        if (deptName)   url += `&department=${encodeURIComponent(deptName)}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            employees = data.data;
            const sel = $('#filterEmployee');
            sel.empty().append('<option value="">Select Employee</option>');
            data.data.forEach(e => {
                const b = e.branch || '-';
                const d = e.department ? (e.department.name || '-') : '-';
                // Label shows Name (Code) | Branch | Department
                const label = `${e.name} (${e.code}) | ${b} | ${d}`;
                const opt = new Option(label, e._id, false, false);
                sel.append(opt);
            });
            // Notify Select2 to refresh its list
            sel.trigger('change');
        }
    } catch (e) { console.error('Error loading employees:', e); }
}

// Main Load Function
async function loadPayrolls() {
    try {
        const token = localStorage.getItem('token');

        const branch     = document.getElementById('filterBranch').value;
        const fromMonth  = document.getElementById('filterFrom').value;
        const toMonth    = document.getElementById('filterTo').value;
        const department = document.getElementById('filterDepartment').value;
        const employeeId = $('#filterEmployee').val();
        const code       = document.getElementById('filterCode').value;

        const params = new URLSearchParams();
        if (branch)     params.append('branch', branch);
        if (fromMonth)  params.append('fromMonth', fromMonth);
        if (toMonth)    params.append('toMonth', toMonth);
        if (department) params.append('department', department);
        if (employeeId) params.append('employee', employeeId);
        if (code)       params.append('code', code);

        const res  = await fetch(`/api/v1/payrolls?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            payrolls = data.data;
            renderTable(payrolls);

            // Update record count on Search button
            const searchBtn = document.getElementById('searchBtn');
            if (searchBtn) {
                let badge = document.getElementById('recordCountBadge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.id = 'recordCountBadge';
                    badge.className = 'badge bg-white text-dark ms-2';
                    badge.style.fontSize = '0.75rem';
                    badge.style.verticalAlign = 'middle';
                    searchBtn.appendChild(badge);
                }
                badge.textContent = `${payrolls.length.toLocaleString()} records`;
            }
        } else {
            alert('Failed to load payrolls: ' + data.message);
        }

    } catch (e) {
        console.error('Error loading payrolls:', e);
        alert('Error loading payrolls');
    }
}

function renderTable(data) {
    const tbody = document.getElementById('payrollTableBody');
    tbody.innerHTML = '';

    data.forEach(p => {
        const isAdvance = !!p.payAdvSalary;
        const rowClass  = isAdvance ? 'row-advance' : 'row-regular';

        const pID    = p._id.slice(-5).toUpperCase();
        const dept   = p.department  || (p.employee ? p.employee.department  : '-');
        const desig  = p.designation || (p.employee ? p.employee.designation : '-');
        const empName = p.employee ? p.employee.name : 'Unknown';

        // Format monthYear for display (e.g. 2024-02 => Feb 2024)
        let displayMonth = p.monthYear || '';
        if (displayMonth && displayMonth.includes('-')) {
            const parts = displayMonth.split('-');
            const d = new Date(parts[0], parts[1]-1, 1);
            displayMonth = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }

        const valBasic  = p.perMonth      || p.basicSalary || 0;
        const valOT     = p.overTime      || 0;
        const valComm   = p.monthlyComm   || 0;
        const valWhComm = p.warehouseComm || 0;
        const valNatin  = p.natin         || 0;
        const valOther  = p.otherAllow    || 0;
        const valRent   = p.rent          || 0;
        const valTea    = p.teaAllowance  || 0;
        const valSTAllow= p.stLateAllow   || 0;
        const calculatedGross = valBasic + valOT + valComm + valWhComm + valNatin + valOther + valRent + valTea + valSTAllow;

        const valShortTime = p.shortWeek || 0;
        const valAdvDed   = p.totalAdv  || 0;
        const valPenalty  = p.penalty   || 0;
        const valWHT      = p.wht       || 0;
        const valSecurity = p.securityDeposit || 0;
        const valFund     = p.fund      || 0;
        const valFood     = p.ebDeduction || p.food || 0;
        const valOtherDed = p.otherDeduction || 0;
        const valUmrah    = p.umrahDeduction || 0;
        const valTTW      = p.ttw       || 0;
        const valUGRM     = p.ugrm      || 0;

        const calculatedDeductions = valShortTime + valAdvDed + valPenalty + valWHT + valSecurity + valFund + valFood + valOtherDed + valUmrah + valTTW + valUGRM;
        const displayNetTotal = calculatedGross - calculatedDeductions;

        const row = `
            <tr class="${rowClass}">
                <td class="text-center">
                    <button class="btn btn-sm btn-primary" onclick="printPayroll('${p._id}')">
                        <i class="fas fa-print"></i>
                    </button>
                </td>
                <td>${p.payrollId || pID}</td>
                <td>${displayMonth}</td>
                <td>${p.employee?.name || empName}</td>
                <td>${p.department?.name || dept}</td>
                <td>${p.branch || '-'}</td>
                <td>${p.designation || desig}</td>
                <td class="text-end">${valBasic.toLocaleString()}</td>
                <td class="text-end">${valOT.toLocaleString()}</td>
                <td class="text-end">${valComm.toLocaleString()}</td>
                <td class="text-end">${valNatin.toLocaleString()}</td>
                <td class="text-end">${valOther.toLocaleString()}</td>
                <td class="text-end">${valSTAllow.toLocaleString()}</td>
                <td class="text-end fw-bold">${calculatedGross.toLocaleString()}</td>
                <td class="text-end">${valShortTime.toLocaleString()}</td>
                <td class="text-end">${(p.pAAdv || 0).toLocaleString()}</td>
                <td class="text-end">${(p.csMale || 0).toLocaleString()}</td>
                <td class="text-end">${valAdvDed.toLocaleString()}</td>
                <td class="text-end">${((p.pAAdv || 0) + (p.csMale || 0) - valAdvDed).toLocaleString()}</td>
                <td class="text-end">${valSecurity.toLocaleString()}</td>
                <td class="text-end">${valWHT.toLocaleString()}</td>
                <td class="text-end fw-bold">${displayNetTotal.toLocaleString()}</td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

function formatNum(n) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function searchTable() {
    const input  = document.getElementById('tableSearch');
    const filter = input.value.toUpperCase();
    const table  = document.querySelector('.table');
    const tr     = table.getElementsByTagName('tr');

    for (let i = 1; i < tr.length; i++) {
        if (tr[i].getElementsByTagName('td').length > 0) {
            const txtValue = tr[i].textContent || tr[i].innerText;
            tr[i].style.display = txtValue.toUpperCase().indexOf(filter) > -1 ? '' : 'none';
        }
    }
}

function printPayroll(id) {
    window.open(`/print-payroll?id=${id}`, '_blank');
}

// ─── IMPORT PAYROLL FROM EXCEL ────────────────────────────────────────────────
// NOTE: Auto-created employees (payrollImportOnly=true) are INVISIBLE on all
// other screens (Employee Registration, List, Attendance, Advance, Commission).
// They only appear in Employee Payroll List because the Payroll model stores
// the employee reference + all data directly.

function openImportModal() {
    document.getElementById('importProgress').style.display     = 'none';
    document.getElementById('importResults').style.display      = 'none';
    document.getElementById('importErrorBox').style.display     = 'none';
    const summaryMsg = document.getElementById('importSummaryMsg');
    if (summaryMsg) {
        summaryMsg.style.display = 'none';
        summaryMsg.textContent = '';
    }
    // Reset counters
    ['resultImported', 'resultDuplicates', 'resultAutoCreated', 'resultInvalid'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
    document.getElementById('startImportBtn').style.display     = '';
    document.getElementById('refreshAfterImport').style.display = 'none';
    document.getElementById('importFileInput').value            = '';
    const modal = new bootstrap.Modal(document.getElementById('importModal'));
    modal.show();
}

async function startImport() {
    const fileInput = document.getElementById('importFileInput');
    const file = fileInput.files[0];

    if (!file) { alert('Please select an Excel file first.'); return; }

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xls', 'xlsx'].includes(ext)) { alert('Only .xls or .xlsx files are supported.'); return; }

    // Show progress
    document.getElementById('startImportBtn').style.display    = 'none';
    document.getElementById('importProgress').style.display    = '';
    document.getElementById('importResults').style.display     = 'none';
    document.getElementById('importProgressText').textContent  = `Uploading "${file.name}"...`;

    const token    = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res  = await fetch('/api/v1/payrolls/import', {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body:    formData
        });
        const data = await res.json();

        document.getElementById('importProgress').style.display = 'none';
        document.getElementById('importResults').style.display  = '';

        if (data.success) {
            document.getElementById('resultImported').textContent    = data.imported    || 0;
            document.getElementById('resultDuplicates').textContent  = data.duplicates  || 0;
            document.getElementById('resultAutoCreated').textContent = data.autoCreated || 0;
            document.getElementById('resultInvalid').textContent     = data.invalid     || 0;

            // Clear summary message
            const msgEl = document.getElementById('importSummaryMsg');
            msgEl.style.display = '';
            if ((data.duplicates || 0) > 0) {
                msgEl.innerHTML = `<strong>\u2139\ufe0f Note:</strong> The <strong>${data.duplicates || 0} "Already in DB"</strong> records were imported in a previous run — they are safely stored in your database. Only new records are added this time.`;
            } else {
                msgEl.textContent = data.message || 'Import complete.';
            }

            if (data.errors && data.errors.length > 0) {
                document.getElementById('importErrorBox').style.display = '';
                document.getElementById('importErrorList').value = data.errors.join('\n');
            }
            document.getElementById('refreshAfterImport').style.display = '';

        } else {
            document.getElementById('resultImported').textContent    = 0;
            document.getElementById('resultDuplicates').textContent  = 0;
            document.getElementById('resultAutoCreated').textContent = 0;
            document.getElementById('resultInvalid').textContent     = 0;
            document.getElementById('importSummaryMsg').style.display = 'none';
            document.getElementById('importErrorBox').style.display  = '';
            document.getElementById('importErrorList').value         = `Import Failed:\n${data.message}`;
            document.getElementById('startImportBtn').style.display  = '';
        }

    } catch (err) {
        document.getElementById('importProgress').style.display   = 'none';
        document.getElementById('importResults').style.display    = '';
        document.getElementById('importErrorBox').style.display   = '';
        document.getElementById('importErrorList').value          = `Network Error:\n${err.message}`;
        document.getElementById('startImportBtn').style.display   = '';
    }
}

function refreshAfterImport() {
    const modalEl = document.getElementById('importModal');
    const modal   = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    loadPayrolls();
}
function exportToExcel() {
    const fromMonth = document.getElementById('filterFrom').value;
    const toMonth = document.getElementById('filterTo').value;
    const branch = document.getElementById('filterBranch').value;
    const dept = document.getElementById('filterDepartment').value;
    
    if (!fromMonth || !toMonth) return alert('Select date range');

    const token = localStorage.getItem('token');
    
    // Use the backend export endpoint
    let url = `/api/v1/payrolls/export?fromMonth=${fromMonth}&toMonth=${toMonth}&branch=${encodeURIComponent(branch)}&department=${encodeURIComponent(dept)}&token=${token}`;
    window.open(url, '_blank');
}
