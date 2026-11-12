document.addEventListener('DOMContentLoaded', () => {
    loadBranches();
    loadSearchSuggestions();
    loadRecords(1);
});

let currentState = {
    records: [],
    total: 0,
    page: 1,
    pages: 1
};

async function loadBranches() {
    const branches = await window.getGlobalBranches();
    const select = document.getElementById('filterBranch');
    if (!select) return;
    branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        select.appendChild(opt);
    });
}

let searchData = { codes: [], names: [] };

async function loadSearchSuggestions() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/v1/legacy-payroll/suggestions', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
            searchData = { codes: json.codes, names: json.names };
        }
    } catch (err) {
        console.error('Suggestions failed:', err);
    }
}

// Handle custom search dropdowns
document.getElementById('filterEmpCode').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const container = document.getElementById('codeResults');
    if (!container) return;
    container.innerHTML = '';
    
    if (val.length < 1) {
        container.style.display = 'none';
        return;
    }
    
    const matches = searchData.codes.filter(c => c.toLowerCase().includes(val)).slice(0, 10);
    
    if (matches.length > 0) {
        matches.forEach(c => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `<b>${c}</b>`;
            div.onclick = () => {
                e.target.value = c;
                container.style.display = 'none';
                loadRecords(1);
            };
            container.appendChild(div);
        });
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
});

document.getElementById('filterEmpName').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const container = document.getElementById('nameResults');
    if (!container) return;
    container.innerHTML = '';
    
    if (val.length < 2) {
        container.style.display = 'none';
        return;
    }
    
    const matches = searchData.names.filter(n => n.toLowerCase().includes(val)).slice(0, 15);
    
    if (matches.length > 0) {
        matches.forEach(n => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `${n}`;
            div.onclick = () => {
                e.target.value = n;
                container.style.display = 'none';
                loadRecords(1);
            };
            container.appendChild(div);
        });
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
});

// Close results on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.position-relative')) {
        const c = document.getElementById('codeResults');
        const n = document.getElementById('nameResults');
        if (c) c.style.display = 'none';
        if (n) n.style.display = 'none';
    }
});

async function loadRecords(page = 1) {
    const token = localStorage.getItem('token');
    const branch = document.getElementById('filterBranch').value;
    const empCode = document.getElementById('filterEmpCode').value;
    const empName = document.getElementById('filterEmpName').value;
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;

    const url = `/api/v1/legacy-payroll?page=${page}&branch=${branch}&employeeCode=${empCode}&employeeName=${encodeURIComponent(empName)}&fromMonth=${from}&toMonth=${to}`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();

        if (json.success) {
            currentState = json;
            renderRecords();
            renderPagination();
        }
    } catch (err) {
        console.error('Failed to load records:', err);
    }
}

function renderRecords() {
    const body = document.getElementById('recordsBody');
    if (!body) return;
    body.innerHTML = '';

    if (!currentState.records || currentState.records.length === 0) {
        body.innerHTML = '<tr><td colspan="20" class="text-center py-5">No records found matching your filters.</td></tr>';
        return;
    }

    body.innerHTML = currentState.records.map(r => {
        const paidViaClass = r.bankPaid > 0 ? 'badge-bank' : 'badge-cash';
        const paidViaText = r.bankPaid > 0 ? `BANK:${formatCurrency(r.bankPaid)}` : `CASH:${formatCurrency(r.cashPaid || 0)}`;

        return `
            <tr>
                <td class="action-btns">
                    <button class="btn-action" title="View Details" onclick="viewRecord('${r._id}')">
                        <i class="fas fa-history"></i>
                    </button>
                    <button class="btn-action" title="Print Slip" onclick="printSlip('${r._id}')">
                        <i class="fas fa-print"></i>
                    </button>
                </td>
                <td>
                    <div class="emp-name text-success fw-bold">${r.employeeName || 'Unknown'}</div>
                    <div class="emp-code small text-muted">${r.employeeCode || 'N/A'}</div>
                </td>
                <td class="month-cell fw-bold">${r.monthYear || '---'}</td>
                
                <!-- Earnings -->
                <td class="text-end font-monospace">${formatCurrency(r.basicSalary)}</td>
                <td class="text-end font-monospace text-primary">${formatCurrency(r.overTime)}</td>
                <td class="text-end font-monospace">${formatCurrency((r.monthlyCommission || 0) + (r.warehouseComm || 0))}</td>
                <td class="text-end font-monospace">${formatCurrency(r.fixAllowance)}</td>
                <td class="text-end font-monospace">${formatCurrency(r.otherAllowance || 0)}</td>
                <td class="text-end font-monospace">${formatCurrency(r.breakfastRoti || 0)}</td>
                <td class="text-end font-monospace">${formatCurrency(r.homeAllowance || 0)}</td>

                <!-- Deductions -->
                <td class="text-end font-monospace text-danger">${formatCurrency(r.shortTime)}</td>
                <td class="text-end font-monospace">${formatCurrency(r.mess)}</td>
                <td class="text-end font-monospace">${formatCurrency(r.preMonthBalance)}</td>
                <td class="text-end font-monospace text-danger">${formatCurrency(r.advanceDeduction)}</td>
                <td class="text-end font-monospace">${formatCurrency(r.balance)}</td>
                <td class="text-end font-monospace">${formatCurrency(r.salaryWHT)}</td>
                <td class="text-end font-monospace">${formatCurrency(r.securityDeposit)}</td>

                <!-- Totals -->
                <td class="text-end fw-bold">${formatCurrency(r.grossSalary)}</td>
                <td class="text-end fw-bold text-danger">${formatCurrency(r.totalDeduction)}</td>
                <td class="text-end net-total-cell">${formatCurrency(r.netSalary)}</td>
                <td><span class="badge ${paidViaClass}">${paidViaText}</span></td>
            </tr>
        `;
    }).join('');

    const statsBar = document.getElementById('statsBar');
    if (statsBar) statsBar.classList.remove('d-none');
    
    const statTotal = document.getElementById('statTotal');
    if (statTotal) statTotal.textContent = currentState.total;
    
    const start = (currentState.page - 1) * 50 + 1;
    const end = Math.min(start + currentState.records.length - 1, currentState.total);
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${start} to ${end} of ${currentState.total} entries`;
    }
}

function renderPagination() {
    const ctrl = document.getElementById('paginationControls');
    ctrl.innerHTML = '';

    if (currentState.pages <= 1) return;

    // Previous
    ctrl.innerHTML += `<li class="page-item ${currentState.page === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="loadRecords(${currentState.page - 1})">Previous</a>
    </li>`;

    // Pages (Show max 5)
    let start = Math.max(1, currentState.page - 2);
    let end = Math.min(currentState.pages, start + 4);
    if (end === currentState.pages) start = Math.max(1, end - 4);

    for (let i = start; i <= end; i++) {
        ctrl.innerHTML += `<li class="page-item ${currentState.page === i ? 'active' : ''}">
            <a class="page-link" href="#" onclick="loadRecords(${i})">${i}</a>
        </li>`;
    }

    // Next
    ctrl.innerHTML += `<li class="page-item ${currentState.page === currentState.pages ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="loadRecords(${currentState.page + 1})">Next</a>
    </li>`;
}

async function processExistingPDF() {
    if (!confirm('This will read the PDF from EXPORT folder and index all 11,000+ slips. This might take a minute. Continue?')) return;

    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = 'flex';

    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/v1/legacy-payroll/process', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();

        overlay.style.display = 'none';
        if (json.success) {
            alert(json.message);
            loadRecords(1);
        } else {
            alert('Error: ' + json.message);
        }
    } catch (err) {
        overlay.style.display = 'none';
        alert('Failed to process PDF. Check server logs.');
    }
}

async function viewHistory(code, name) {
    const token = localStorage.getItem('token');
    document.getElementById('historyEmpName').textContent = `${name} (${code})`;
    
    try {
        const res = await fetch(`/api/v1/legacy-payroll/history/${code}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();

        if (json.success) {
            const body = document.getElementById('historyBody');
            body.innerHTML = '';
            json.data.forEach(r => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${r.monthYear}</td>
                    <td>${r.branch}</td>
                    <td class="text-end">${formatCurrency(r.basicSalary)}</td>
                    <td class="text-end">${formatCurrency(r.grossSalary)}</td>
                    <td class="text-end fw-bold text-success">${formatCurrency(r.netSalary)}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-link" onclick="printSlip(${r.pageNumber})">
                            <i class="fas fa-print"></i>
                        </button>
                    </td>
                `;
                body.appendChild(row);
            });
            new bootstrap.Modal(document.getElementById('historyModal')).show();
        }
    } catch (err) {
        console.error('History failed:', err);
    }
}

function printSlip(page) {
    // Open the PDF directly at the specific page in a new tab
    const pdfUrl = `/EXPORT/Employee_MonthlyPayRoll_Slip ALL.pdf#page=${page}`;
    window.open(pdfUrl, '_blank');
}

function resetFilters() {
    document.getElementById('filterForm').reset();
    loadRecords(1);
}

function formatCurrency(amount) {
    return (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function exportToExcel() {
    // Trigger download of current view
    alert('Exporting current view to Excel...');
}
