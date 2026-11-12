
document.addEventListener('DOMContentLoaded', async () => {
    // Set default dates (Start of month to today)
    const now = new Date();
    document.getElementById('filterFrom').valueAsDate = now;
    document.getElementById('filterTo').valueAsDate = now;

    // Initialize Select2
    $('#filterEmployee').select2({
        placeholder: "Select Employee",
        allowClear: true
    });

    await loadStores();
    await loadAllActiveEmployees();
});

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

            // Reload employees on branch change
            sel.addEventListener('change', (e) => {
                loadAllActiveEmployees(e.target.value);
            });
        }
    } catch (e) { console.error('Error loading stores:', e); }
}

async function loadAllActiveEmployees(branchName = '') {
    try {
        const token = localStorage.getItem('token');
        let url = '/api/v1/employees?isActive=true';
        if (branchName) {
            url += `&branch=${encodeURIComponent(branchName)}`;
        }

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const sel = $('#filterEmployee');
            sel.empty().append('<option value="">Select Employee</option>');
            data.data.forEach(e => {
                const opt = new Option(`${e.name} (${e.code})`, e._id, false, false);
                sel.append(opt);
            });
        }
    } catch (e) { console.error('Error loading employees:', e); }
}

async function generateReport() {
    const startDate = document.getElementById('filterFrom').value;
    const endDate = document.getElementById('filterTo').value;
    const branchEl = document.getElementById('filterBranch');
    const branch = branchEl.value;
    const branchText = branch ? branch : "All Branches";
    const employee = $('#filterEmployee').val();
    const code = document.getElementById('filterCode').value;

    if (!startDate || !endDate) {
        alert("Please select Start and End dates.");
        return;
    }

    // Update active filters display
    const activeFilters = document.getElementById('activeFilters');
    const displayBranch = branch || "All Branches";
    activeFilters.innerHTML = `<h5 class="fw-bold text-uppercase text-primary">Branch: ${displayBranch}</h5>`;

    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-5"><div class="spinner-border text-primary"></div></td></tr>';

    try {
        const params = new URLSearchParams();
        params.append('startDate', startDate);
        params.append('endDate', endDate);
        if (branch) params.append('branch', branch);
        if (employee) params.append('employee', employee);
        if (code) params.append('code', code);

        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employee-advances/activity-report?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            renderTable(data.data);
        } else {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-5 text-danger">Error: ${data.message}</td></tr>`;
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-5 text-danger">Error fetching report</td></tr>`;
    }
}

function renderTable(data) {
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-5 text-muted">No records found for selected criteria</td></tr>';
        resetTotals();
        return;
    }

    let tBasic = 0, tOpen = 0, tCurr = 0, tTotal = 0, tDed = 0, tBal = 0;
    let sr = 1;

    data.forEach(row => {
        tBasic += row.basicSalary || 0;
        tOpen += row.openingBalance || 0;
        tCurr += row.currentAdvance || 0;
        tTotal += row.totalAdvance || 0;
        tDed += row.dedFromSalary || 0;
        tBal += row.balance || 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center">${sr++}</td>
            <td class="text-center">${row.code || '-'}</td>
            <td>${row.name}</td>
            <td class="text-end">${formatNum(row.basicSalary)}</td>
            <td class="text-end">${formatNum(row.openingBalance)}</td>
            <td class="text-end">${formatNum(row.currentAdvance)}</td>
            <td class="text-end">${formatNum(row.totalAdvance)}</td>
            <td class="text-end">${formatNum(row.dedFromSalary)}</td>
            <td class="text-end fw-bold">${formatNum(row.balance)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('tBasic').textContent = formatNum(tBasic);
    document.getElementById('tOpen').textContent = formatNum(tOpen);
    document.getElementById('tCurr').textContent = formatNum(tCurr);
    document.getElementById('tTotal').textContent = formatNum(tTotal);
    document.getElementById('tDed').textContent = formatNum(tDed);
    document.getElementById('tBal').textContent = formatNum(tBal);
}

function resetTotals() {
    ['tBasic', 'tOpen', 'tCurr', 'tTotal', 'tDed', 'tBal'].forEach(id => {
        document.getElementById(id).textContent = '0';
    });
}

function formatNum(num) {
    return (num || 0).toLocaleString('en-US');
}

function printReport() {
    const startDate = document.getElementById('filterFrom').value;
    const endDate = document.getElementById('filterTo').value;
    const branch = document.getElementById('filterBranch').value;
    const employee = $('#filterEmployee').val();
    const code = document.getElementById('filterCode').value;

    if (!startDate || !endDate) {
        alert("Please select Start and End dates.");
        return;
    }

    const params = new URLSearchParams();
    params.append('startDate', startDate);
    params.append('endDate', endDate);
    if (branch) params.append('branch', branch);
    if (employee) params.append('employee', employee);
    if (code) params.append('code', code);

    window.open(`/print-employee-advance-activity?${params.toString()}`, '_blank');
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

