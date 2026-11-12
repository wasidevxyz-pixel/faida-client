function getMonthStartAndEndDates() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    
    // First day of current month: YYYY-MM-01
    const firstDayStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    
    // Last day of current month:
    const lastDayObj = new Date(year, month + 1, 0);
    const lastDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
    
    return { from: firstDayStr, to: lastDayStr };
}

function countSundaysInRange(fromDateStr, toDateStr) {
    if (!fromDateStr || !toDateStr) return 4;
    let curr = new Date(fromDateStr + 'T00:00:00Z');
    const end = new Date(toDateStr + 'T00:00:00Z');
    let count = 0;
    while (curr <= end) {
        if (curr.getUTCDay() === 0) count++; // Sunday
        curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return count;
}

function updateHolidaysDefault() {
    const from = document.getElementById('filterFrom')?.value;
    const to   = document.getElementById('filterTo')?.value;
    const holInput = document.getElementById('filterHolidays');
    if (holInput && from && to) {
        holInput.value = countSundaysInRange(from, to);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Set default dates to first and last day of current month (local calendar dates)
    const { from, to } = getMonthStartAndEndDates();

    const fromInput = document.getElementById('filterFrom');
    const toInput   = document.getElementById('filterTo');
    if (fromInput) fromInput.value = from;
    if (toInput)   toInput.value   = to;

    updateHolidaysDefault();

    if (fromInput) fromInput.addEventListener('change', updateHolidaysDefault);
    if (toInput)   toInput.addEventListener('change', updateHolidaysDefault);

    // Load Dropdowns in parallel
    await Promise.all([loadBranches(), loadDepartments()]);

    // Initialize Select2 for Employee
    $('#filterEmployee').select2({
        theme: "bootstrap-5",
        placeholder: "All Employees (Search by Name or Code)",
        allowClear: true,
        width: '100%'
    });

    // Initial load employees
    await loadEmployees();

    document.getElementById('filterBranch').addEventListener('change', () => loadEmployees());
    document.getElementById('filterDept').addEventListener('change', () => loadEmployees());
});

// ─── Dropdown Data Loading ──────────────────────────────────────────────────
const _dropdownCache = {};
const cachedFetch = async (url, options) => {
    if (_dropdownCache[url]) return _dropdownCache[url];
    const res = await fetch(url, options);
    const data = await res.json();
    if (data.success) _dropdownCache[url] = data;
    return data;
};

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        let data = await cachedFetch('/api/v1/stores', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!data.success || !data.data) {
            data = await cachedFetch('/api/v1/sub-branches', { headers: { 'Authorization': `Bearer ${token}` } });
        }
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
    } catch (e) {
        console.error('Error loading branches', e);
    }
}

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const data = await cachedFetch('/api/v1/employee-departments', { headers: { 'Authorization': `Bearer ${token}` } });
        if (data.success) {
            const sel = document.getElementById('filterDept');
            sel.innerHTML = '<option value="">All Departments</option>';
            data.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                sel.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error loading departments', e);
    }
}

async function loadEmployees() {
    const branch = document.getElementById('filterBranch').value;
    const dept   = document.getElementById('filterDept').value;
    try {
        const token = localStorage.getItem('token');
        let url = '/api/v1/employees?isActive=true&light=true&limit=2000';
        if (branch) url += `&branch=${encodeURIComponent(branch)}`;
        if (dept)   url += `&department=${dept}`;
        const data = await cachedFetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const sel = $('#filterEmployee');
        sel.empty().append('<option value="">All Employees (Search by Name or Code)</option>');
        if (data.success && data.data) {
            data.data.forEach(e => {
                const opt = new Option(`${e.name} (${e.code})`, e._id, false, false);
                sel.append(opt);
            });
        }
    } catch (e) {
        console.error('Error loading employees', e);
    }
}

// ─── Global State ─────────────────────────────────────────────────────────────
let currentCriteria = 'OverTime';
let currentViewMode = 'summary';
let currentReportData = null;

// ─── View Mode Switcher ───────────────────────────────────────────────────────
window.setViewMode = function(mode) {
    currentViewMode = mode;
    document.getElementById('btnModeSummary').classList.toggle('active', mode === 'summary');
    document.getElementById('btnModeDetail').classList.toggle('active', mode === 'detail');

    if (currentReportData) {
        renderActiveView(currentReportData);
    } else {
        window.generateReport();
    }
};

window.applyCriteria = function(criteria) {
    currentCriteria = criteria;
    window.generateReport();
};

window.resetFilters = function() {
    location.reload();
};

// ─── Generate Report ──────────────────────────────────────────────────────────
window.generateReport = async function() {
    const from     = document.getElementById('filterFrom').value;
    const to       = document.getElementById('filterTo').value;
    const branch   = document.getElementById('filterBranch').value;
    const dept     = document.getElementById('filterDept').value;
    const employee = $('#filterEmployee').val();
    const holidays = document.getElementById('filterHolidays')?.value || '4';

    if (!from || !to) {
        alert("Please select valid From and To dates.");
        return;
    }

    const resultDiv    = document.getElementById('reportResult');
    const placeholder  = document.getElementById('noDataPlaceholder');
    const kpiContainer = document.getElementById('kpiContainer');
    const tableBody    = document.getElementById('tableBody');
    const reportTitle  = document.getElementById('reportTitle');

    const criteriaLabel = currentCriteria === 'OverTime' ? 'Overtime Only' : (currentCriteria === 'ShortTime' ? 'Short Time Only' : 'Both (Overtime & Short Time)');
    const modeLabel     = currentViewMode === 'summary' ? 'Summary Format' : 'Detailed Daily Format';

    reportTitle.textContent = `${criteriaLabel} - ${modeLabel}`;
    resultDiv.style.display   = 'block';
    placeholder.style.display = 'none';
    kpiContainer.style.display = 'none';

    tableBody.innerHTML = `<tr><td colspan="15" class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <div class="mt-2 text-muted fw-semibold">Calculating exact attendance hours and rates...</div>
    </td></tr>`;

    try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams();
        params.append('from',        from);
        params.append('to',          to);
        params.append('criteria',    currentCriteria);
        params.append('viewMode',    currentViewMode);
        params.append('holidays',    holidays);
        if (branch)   params.append('branch',     branch);
        if (dept)     params.append('department', dept);
        if (employee) params.append('employee',   employee);

        const res  = await fetch(`/api/v1/reports/overtime-shorttime?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (!data.success) {
            tableBody.innerHTML = `<tr><td colspan="15" class="text-center py-5 text-danger fw-bold">Error: ${data.message}</td></tr>`;
            return;
        }

        currentReportData = data;
        renderActiveView(data);

    } catch (e) {
        console.error(e);
        tableBody.innerHTML = `<tr><td colspan="15" class="text-center py-5 text-danger">Error fetching report data: ${e.message}</td></tr>`;
    }
};

// ─── Render Active View (Summary or Detail) ──────────────────────────────────
function renderActiveView(data) {
    const totals = data.totals || {};
    const criteria = currentCriteria;
    const viewMode = currentViewMode;

    // 1. Update Info Bar
    const infoBar = document.getElementById('reportInfoBar');
    if (infoBar) {
        infoBar.innerHTML = `
            <span class="badge bg-primary me-2">Total Days: <strong>${data.totalDays || 0}</strong></span>
            <span class="badge bg-warning text-dark me-2">Holidays: <strong>${data.holidays || 0}</strong></span>
            <span class="badge bg-success me-2">Working Days: <strong>${data.workingDays || 0}</strong></span>
            <span class="badge bg-secondary">Mode: <strong>${viewMode.toUpperCase()}</strong></span>
        `;
    }

    // 2. Update KPI Metric Cards
    const kpiContainer = document.getElementById('kpiContainer');
    kpiContainer.style.display = 'grid';

    document.getElementById('kpiEmployees').textContent = (totals.totalEmployees || 0).toLocaleString();
    document.getElementById('kpiWorkedHrs').textContent = totals.totalWorkedHrs || '0:00';
    document.getElementById('kpiOTHrs').textContent     = totals.totalOTHrs || '0:00';
    document.getElementById('kpiOTAmt').textContent     = Number(totals.totalOTAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('kpiSTHrs').textContent     = totals.totalSTHrs || '0:00';
    document.getElementById('kpiSTAmt').textContent     = Number(totals.totalSTAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const netAmt = parseFloat(totals.netAmount || 0);
    const kpiNetEl = document.getElementById('kpiNetAmt');
    if (kpiNetEl) {
        kpiNetEl.textContent = `Rs. ${Math.abs(netAmt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${netAmt >= 0 ? '(Payable)' : '(Deductible)'}`;
        kpiNetEl.style.color = netAmt >= 0 ? '#059669' : '#dc2626';
    }

    // KPI Card visibility based on criteria
    const kpiCardOT  = document.getElementById('kpiCardOT');
    const kpiCardST  = document.getElementById('kpiCardST');
    const kpiCardNet = document.getElementById('kpiCardNet');

    if (criteria === 'OverTime') {
        if (kpiCardOT)  kpiCardOT.style.display = 'flex';
        if (kpiCardST)  kpiCardST.style.display = 'none';
        if (kpiCardNet) kpiCardNet.style.display = 'none';
    } else if (criteria === 'ShortTime') {
        if (kpiCardOT)  kpiCardOT.style.display = 'none';
        if (kpiCardST)  kpiCardST.style.display = 'flex';
        if (kpiCardNet) kpiCardNet.style.display = 'none';
    } else {
        if (kpiCardOT)  kpiCardOT.style.display = 'flex';
        if (kpiCardST)  kpiCardST.style.display = 'flex';
        if (kpiCardNet) kpiCardNet.style.display = 'flex';
    }

    // 3. Render Table
    if (viewMode === 'summary') {
        renderSummaryTable(data.summaryData || [], totals, criteria);
    } else {
        renderDetailTable(data.detailData || [], totals, criteria);
    }
}

// ─── Summary Table Renderer ───────────────────────────────────────────────────
function renderSummaryTable(rows, totals, criteria) {
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const table = document.getElementById('mainDataTable');

    const showOT = (criteria === 'OverTime' || criteria === 'Both');
    const showST = (criteria === 'ShortTime' || criteria === 'Both');
    const isBoth = (criteria === 'Both');

    // Build Table Header
    let th = `<tr>
        <th style="width: 35px;">#</th>
        <th style="width: 65px;">Code</th>
        <th>Employee Name</th>
        <th>Branch</th>
        <th>Department</th>
        <th style="width: 65px;" title="Daily Duty Hours">Duty (H)</th>
        <th style="width: 55px;" title="Working Days in Month/Period">W.Days</th>
        <th style="width: 55px;" title="Days Present">Present</th>
        <th style="width: 75px;" title="Monthly Required Hours (Working Days × Duty)">Req. (H)</th>
        <th style="width: 85px;" title="Total Hours Worked in Period">Worked (H:M)</th>
        <th style="width: 85px;" title="Monthly Difference (Worked - Required)">Month Diff</th>`;

    if (showOT) {
        th += `<th style="width: 90px; background: #065f46 !important;" title="Overtime Hours">OT (H:M)</th>`;
    }
    if (showST) {
        th += `<th style="width: 90px; background: #991b1b !important;" title="Short Time Hours">ST (H:M)</th>`;
    }

    th += `<th style="width: 75px;">Rate/Hr</th>`;

    if (showOT) {
        th += `<th style="width: 95px; background: #065f46 !important;">OT Amount</th>`;
    }
    if (showST) {
        th += `<th style="width: 95px; background: #991b1b !important;">ST Amount</th>`;
    }
    if (isBoth) {
        th += `<th style="width: 105px; background: #3730a3 !important;">Net Amount</th>`;
    }

    th += `</tr>`;
    tableHead.innerHTML = th;

    if (!rows || rows.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="17" class="text-center py-5 text-muted fw-semibold">No summary records found for this period.</td></tr>`;
        removeFooter();
        return;
    }

    let tbodyHtml = '';
    rows.forEach((r, idx) => {
        const diffMins = r.monthlyDiffMins || 0;
        const diffColor = diffMins > 0 ? 'text-success fw-bold' : (diffMins < 0 ? 'text-danger fw-bold' : 'text-muted');

        tbodyHtml += `<tr>
            <td>${idx + 1}</td>
            <td class="fw-bold">${r.code}</td>
            <td class="text-start fw-semibold">${r.name}</td>
            <td>${r.branch}</td>
            <td>${r.department}</td>
            <td>${r.dutyHrs}</td>
            <td>${r.workingDays || r.cmDays || '-'}</td>
            <td>${r.presentDays}</td>
            <td class="text-muted fw-semibold">${r.reqHrs || '-'}</td>
            <td class="fw-bold">${r.totalWorkedHrs}</td>
            <td class="${diffColor}">${r.monthlyDiffHrs || '0:00'}</td>`;

        if (showOT) {
            tbodyHtml += `<td class="${r.totalOTMins > 0 ? 'text-ot fw-bold' : 'text-muted'}">${r.totalOTHrs}</td>`;
        }
        if (showST) {
            tbodyHtml += `<td class="${r.totalSTMins > 0 ? 'text-st fw-bold' : 'text-muted'}">${r.totalSTHrs}</td>`;
        }

        tbodyHtml += `<td>${r.perHourSalary}</td>`;

        if (showOT) {
            tbodyHtml += `<td class="text-ot text-end">${formatCurrency(r.totalOTAmount)}</td>`;
        }
        if (showST) {
            tbodyHtml += `<td class="text-st text-end">${formatCurrency(r.totalSTAmount)}</td>`;
        }
        if (isBoth) {
            const net = parseFloat(r.netAmount);
            tbodyHtml += `<td class="text-end fw-bold ${net >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(r.netAmount)}</td>`;
        }

        tbodyHtml += `</tr>`;
    });

    tableBody.innerHTML = tbodyHtml;

    // Render Grand Total Footer
    let tfoot = table.querySelector('tfoot');
    if (!tfoot) {
        tfoot = document.createElement('tfoot');
        table.appendChild(tfoot);
    }

    let footHtml = `<tr>
        <td colspan="9" class="text-end fw-bold">GRAND TOTAL (${rows.length} Employees)</td>
        <td class="text-center fw-bold">${totals.totalWorkedHrs || '0:00'}</td>
        <td></td>`;

    if (showOT) {
        footHtml += `<td class="text-center text-ot fw-bold">${totals.totalOTHrs || '0:00'}</td>`;
    }
    if (showST) {
        footHtml += `<td class="text-center text-st fw-bold">${totals.totalSTHrs || '0:00'}</td>`;
    }

    footHtml += `<td></td>`;

    if (showOT) {
        footHtml += `<td class="text-end text-ot fw-bold">${formatCurrency(totals.totalOTAmount)}</td>`;
    }
    if (showST) {
        footHtml += `<td class="text-end text-st fw-bold">${formatCurrency(totals.totalSTAmount)}</td>`;
    }
    if (isBoth) {
        const grandNet = parseFloat(totals.netAmount || 0);
        footHtml += `<td class="text-end fw-bold ${grandNet >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(totals.netAmount)}</td>`;
    }

    footHtml += `</tr>`;
    tfoot.innerHTML = footHtml;
}

// ─── Detail Table Renderer ────────────────────────────────────────────────────
function renderDetailTable(rows, totals, criteria) {
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const table = document.getElementById('mainDataTable');

    const showOT = (criteria === 'OverTime' || criteria === 'Both');
    const showST = (criteria === 'ShortTime' || criteria === 'Both');
    const isBoth = (criteria === 'Both');

    // Build Table Header
    let th = `<tr>
        <th style="width: 40px;">#</th>
        <th style="width: 70px;">Code</th>
        <th>Employee Name</th>
        <th style="width: 90px;">Date</th>
        <th style="width: 60px;">Status</th>
        <th style="width: 75px;">Check In</th>
        <th style="width: 75px;">Check Out</th>
        <th style="width: 65px;">Duty (H)</th>
        <th style="width: 80px;">Worked (H)</th>`;

    if (showOT) {
        th += `<th style="width: 90px; background: #065f46 !important;">Overtime (H:M)</th>`;
    }
    if (showST) {
        th += `<th style="width: 90px; background: #991b1b !important;">Short Time (H:M)</th>`;
    }

    th += `<th style="width: 75px;">Rate/Hr</th>`;

    if (showOT) {
        th += `<th style="width: 95px; background: #065f46 !important;">OT Amount</th>`;
    }
    if (showST) {
        th += `<th style="width: 95px; background: #991b1b !important;">ST Amount</th>`;
    }
    if (isBoth) {
        th += `<th style="width: 100px; background: #3730a3 !important;">Net Amount</th>`;
    }

    th += `</tr>`;
    tableHead.innerHTML = th;

    if (!rows || rows.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="15" class="text-center py-5 text-muted fw-semibold">No detailed logs found for this criteria and period.</td></tr>`;
        removeFooter();
        return;
    }

    let tbodyHtml = '';
    rows.forEach((r, idx) => {
        tbodyHtml += `<tr>
            <td>${idx + 1}</td>
            <td class="fw-bold">${r.code}</td>
            <td class="text-start fw-semibold">${r.name}</td>
            <td>${formatDate(r.date)}</td>
            <td><span class="badge ${r.status === 'Absent' ? 'bg-danger' : 'bg-success'}">${r.status}</span></td>
            <td>${formatTime(r.checkIn)}</td>
            <td>${formatTime(r.checkOut)}</td>
            <td>${r.dutyHrs}</td>
            <td class="fw-bold">${r.workedHrs}</td>`;

        if (showOT) {
            tbodyHtml += `<td class="${r.overtimeMins > 0 ? 'text-ot fw-bold' : 'text-muted'}">${r.overtimeHrs}</td>`;
        }
        if (showST) {
            tbodyHtml += `<td class="${r.shorttimeMins > 0 ? 'text-st fw-bold' : 'text-muted'}">${r.shorttimeHrs}</td>`;
        }

        tbodyHtml += `<td>${r.perHourSalary}</td>`;

        if (showOT) {
            tbodyHtml += `<td class="text-ot text-end">${formatCurrency(r.otAmount)}</td>`;
        }
        if (showST) {
            tbodyHtml += `<td class="text-st text-end">${formatCurrency(r.stAmount)}</td>`;
        }
        if (isBoth) {
            const net = parseFloat(r.otAmount) - parseFloat(r.stAmount);
            tbodyHtml += `<td class="text-end fw-bold ${net >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(net)}</td>`;
        }

        tbodyHtml += `</tr>`;
    });

    tableBody.innerHTML = tbodyHtml;

    // Render Grand Total Footer
    let tfoot = table.querySelector('tfoot');
    if (!tfoot) {
        tfoot = document.createElement('tfoot');
        table.appendChild(tfoot);
    }

    let footHtml = `<tr>
        <td colspan="8" class="text-end fw-bold">GRAND TOTAL (${rows.length} Entries)</td>
        <td class="text-center fw-bold">${totals.totalWorkedHrs || '0:00'}</td>`;

    if (showOT) {
        footHtml += `<td class="text-center text-ot fw-bold">${totals.totalOTHrs || '0:00'}</td>`;
    }
    if (showST) {
        footHtml += `<td class="text-center text-st fw-bold">${totals.totalSTHrs || '0:00'}</td>`;
    }

    footHtml += `<td></td>`;

    if (showOT) {
        footHtml += `<td class="text-end text-ot fw-bold">${formatCurrency(totals.totalOTAmount)}</td>`;
    }
    if (showST) {
        footHtml += `<td class="text-end text-st fw-bold">${formatCurrency(totals.totalSTAmount)}</td>`;
    }
    if (isBoth) {
        const grandNet = parseFloat(totals.netAmount || 0);
        footHtml += `<td class="text-end fw-bold ${grandNet >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(totals.netAmount)}</td>`;
    }

    footHtml += `</tr>`;
    tfoot.innerHTML = footHtml;
}

function removeFooter() {
    const table = document.getElementById('mainDataTable');
    const tfoot = table.querySelector('tfoot');
    if (tfoot) tfoot.remove();
}

// ─── Fast Table Row Filter (Search by Name / Code) ───────────────────────────
window.filterTableRows = function() {
    const q = document.getElementById('tableSearchInput').value.trim().toLowerCase();
    const rows = document.querySelectorAll('#tableBody tr');
    rows.forEach(tr => {
        const text = tr.innerText.toLowerCase();
        tr.style.display = text.includes(q) ? '' : 'none';
    });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d) {
    if (!d) return '-';
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(t) {
    if (!t || t === '-') return '-';
    const parts = t.split(':');
    if (parts.length < 2) return t;
    let h = parseInt(parts[0]);
    let m = parts[1].substring(0, 2);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
}

function formatCurrency(val) {
    const num = parseFloat(val) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Print Launcher ───────────────────────────────────────────────────────────
window.printCurrentReport = function() {
    const from     = document.getElementById('filterFrom').value;
    const to       = document.getElementById('filterTo').value;
    const branch   = document.getElementById('filterBranch').value;
    const dept     = document.getElementById('filterDept').value;
    const employee = $('#filterEmployee').val();
    const holidays = document.getElementById('filterHolidays')?.value || '4';

    const params = new URLSearchParams();
    params.append('from',        from);
    params.append('to',          to);
    params.append('criteria',    currentCriteria);
    params.append('viewMode',    currentViewMode);
    params.append('holidays',    holidays);
    if (branch)   params.append('branch',     branch);
    if (dept)     params.append('department', dept);
    if (employee) params.append('employee',   employee);

    const url = `/print-overtime-shorttime-report?${params.toString()}`;

    let iframe = document.getElementById('print-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
    }
    iframe.src = url;
};
