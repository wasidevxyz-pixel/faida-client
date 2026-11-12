document.addEventListener('DOMContentLoaded', () => {
    // Initialize Sidebar
    new SidebarNavigation();

    // Set Default Dates (Current Month)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    document.getElementById('pro-from-date').valueAsDate = firstDay;
    document.getElementById('pro-to-date').valueAsDate = lastDay;

    // Load Dropdowns
    loadBranches();
    loadDepartments();
    loadBanks(); // Initial load of all banks

    // Initial Fetch (Optional, or wait for user?)
    // fetchProReport();
});

// Helper: Format Currency
function formatCurrency(amount) {
    if (amount === undefined || amount === null) return '0';
    return new Intl.NumberFormat('en-US').format(amount);
}

// Helper: Format Date
// Helper: Format Date
function formatDate(dateStr) {
    if (!dateStr) return '-';
    // If it's a full ISO string (e.g. 2026-01-08T00:00:00.000Z), treating it as local might shift the day.
    // Backend sends date objects, which are UTC.
    // If the time is 00:00:00 UTC, converting to 'en-GB' in a timezone < UTC (like US) pushes it back a day.
    // Pakistan is UTC+5, so it *adds* time, keeping the day or moving to next if late.
    // BUT we want to display the DATE part exactly as stored in DB irrespective of timezone.
    let d = new Date(dateStr);

    // Fallback/Check: If we can construct from string slice directly, safer for "YYYY-MM-DD"
    if (typeof dateStr === 'string' && dateStr.includes('T')) {
        d = new Date(dateStr);
        // If we trust the server sent the correct date-point.
    }

    // Robust approach: Use UTC methods or slice if string
    // Given most dates are stored as 00:00:00 UTC for "dates", let's use UTC parts.
    // Actually, simple ISO slice is Safest for pure dates.
    try {
        if (typeof dateStr === 'string') {
            return dateStr.split('T')[0].split('-').reverse().join('/'); // DD/MM/YYYY
        }
        return new Date(dateStr).toISOString().split('T')[0].split('-').reverse().join('/');
    } catch (e) {
        return new Date(dateStr).toLocaleDateString('en-GB');
    }
}

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        // USER REQUEST: Load branches from '/api/v1/stores'
        const res = await fetch('/api/v1/stores', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('pro-branch');
            // Clear existing options except first
            select.innerHTML = '<option value="">All Branches</option>';

            data.data.forEach(store => {
                const opt = document.createElement('option');
                // Use Store Name as Branch Value 
                opt.value = store.name;
                opt.textContent = store.name;
                select.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading branches', e); }
}

async function loadBanks() {
    try {
        const branchName = document.getElementById('pro-branch').value; // Value is Name
        const token = localStorage.getItem('token');

        let url = '/api/v1/banks';

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();

        if (data.success) {
            const container = document.getElementById('pro-bank-list');
            if (!container) return;
            container.innerHTML = '';

            // Filter
            const filtered = data.data.filter(b => {
                if (!branchName) return true;
                return b.branch === branchName;
            });

            filtered.forEach(b => {
                const div = document.createElement('div');
                div.className = 'form-check';
                div.innerHTML = `
                    <input class="form-check-input bank-checkbox" type="checkbox" value="${b._id}" id="bank-${b._id}" onchange="updateBankButtonLabel()">
                    <label class="form-check-label" for="bank-${b._id}">${b.bankName}</label>
                `;
                container.appendChild(div);
            });

            // Reset
            if (document.getElementById('checkAllBanks')) document.getElementById('checkAllBanks').checked = false;
            updateBankButtonLabel();
        }
    } catch (e) { console.error('Error loading banks', e); }
}

function toggleAllBanks(source) {
    const checkboxes = document.querySelectorAll('.bank-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
    updateBankButtonLabel();
}

function updateBankButtonLabel() {
    const checked = document.querySelectorAll('.bank-checkbox:checked');
    const total = document.querySelectorAll('.bank-checkbox');
    const btn = document.getElementById('bankDropdownBtn');

    if (!btn) return;

    if (checked.length === 0) {
        btn.innerText = 'Select Banks (All)';
    } else if (checked.length === total.length && total.length > 0) {
        btn.innerText = 'All Banks';
    } else {
        btn.innerText = `${checked.length} Selected`;
    }
}

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/departments', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('pro-dept');
            select.innerHTML = '<option value="">All Departments</option>';
            data.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                select.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading departments', e); }
}

async function fetchProReport() {
    const fromDate = document.getElementById('pro-from-date').value;
    const toDate = document.getElementById('pro-to-date').value;
    const branch = document.getElementById('pro-branch').value;
    const dept = document.getElementById('pro-dept').value;
    const type = document.getElementById('pro-type').value;

    const selectedBanks = Array.from(document.querySelectorAll('.bank-checkbox:checked')).map(cb => cb.value);

    if (!fromDate || !toDate) {
        alert('Please select a date range');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        let url = `/api/v1/reports/bank-ledger/pro-summary?startDate=${fromDate}&endDate=${toDate}`;
        if (branch) url += `&branch=${encodeURIComponent(branch)}`;
        if (selectedBanks.length > 0) url += `&bankIds=${selectedBanks.join(',')}`;
        if (dept) url += `&department=${dept}`;
        if (type) url += `&type=${encodeURIComponent(type)}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            renderKPIs(data.data);
            renderTable(data.data.transactions, data.data.openingBalance);
        } else {
            alert(data.message || 'Error fetching report');
        }
    } catch (e) {
        console.error(e);
        alert('Error fetching report');
    }
}

function renderKPIs(data) {
    const totalDeposit = data.transactions.reduce((sum, t) => sum + (t.deposit || 0), 0);
    const totalWithdrawal = data.transactions.reduce((sum, t) => sum + (t.withdrawal || 0), 0);

    document.getElementById('kpi-opening').innerText = formatCurrency(data.openingBalance);
    document.getElementById('kpi-deposit').innerText = formatCurrency(totalDeposit);
    document.getElementById('kpi-withdrawal').innerText = formatCurrency(totalWithdrawal);
    document.getElementById('kpi-closing').innerText = formatCurrency(data.closingBalance);
}

function renderTable(transactions, openingBalance) {
    const tbody = document.getElementById('proTableBody');
    tbody.innerHTML = '';

    // Add Opening Balance Row
    const openRow = document.createElement('tr');
    openRow.classList.add('table-light', 'fw-bold');
    openRow.innerHTML = `
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>Opening Balance</td>
        <td>-</td>
        <td>Opening Balance Brought Forward</td>
        <td class="text-end">-</td>
        <td class="text-end">-</td>
        <td class="text-end">${formatCurrency(openingBalance)}</td>
        <td>-</td>
    `;
    tbody.appendChild(openRow);

    transactions.forEach(t => {
        const tr = document.createElement('tr');

        // Color Coding
        if (t.type === 'Deposit') tr.classList.add('row-deposit');
        else if (t.type === 'Withdrawal') tr.classList.add('row-withdrawal');
        else if (t.type === 'Bank Transfer') tr.classList.add('row-transfer');
        else if (t.type === 'Batch Transfer') tr.classList.add('row-deposit'); // Treat as deposit visually

        tr.innerHTML = `
            <td>${formatDate(t.date)}</td>
            <td>${formatDate(t.effectiveDate)}</td>
            <td>${t.bankName || '-'}</td>
            <td>${t.type}</td>
            <td>${t.ref}</td>
            <td>${t.description}</td>
            <td class="text-end text-success fw-bold">${t.deposit ? formatCurrency(t.deposit) : '-'}</td>
            <td class="text-end text-danger fw-bold">${t.withdrawal ? formatCurrency(t.withdrawal) : '-'}</td>
            <td class="text-end fw-bold">${formatCurrency(t.balance)}</td>
            <td><span class="badge ${t.status === 'Verified' ? 'bg-success' : 'bg-warning text-dark'}">${t.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function filterProTable() {
    const input = document.getElementById('pro-search');
    const filter = input.value.toLowerCase();
    const rows = document.getElementById('proTableBody').getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        // Always show Opening Balance Row (first row usually, or check content)
        if (rows[i].cells[3] && rows[i].cells[3].innerText === 'Opening Balance') {
            rows[i].style.display = "";
            continue;
        }

        const text = rows[i].textContent.toLowerCase();
        if (text.includes(filter)) {
            rows[i].style.display = "";
        } else {
            rows[i].style.display = "none";
        }
    }
}

window.fetchProReport = fetchProReport;

