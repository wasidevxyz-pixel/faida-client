// Employee Short Week (TSW) Deduction Report Controller
let currentReportData = null;
let rawTableRows = [];

// Helper: Format Numbers with commas
function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return Number(num).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

// Helper: Get Current Month YYYY-MM
function getCurrentMonthStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Set default month
    const defaultMonth = getCurrentMonthStr();
    const monthInput = document.getElementById('monthYearFilter');
    if (monthInput) {
        monthInput.value = defaultMonth;
    }

    // 2. Start Live Clock
    const timeEl = document.getElementById('currentTime');
    if (timeEl) {
        timeEl.textContent = new Date().toLocaleString();
        setInterval(() => {
            timeEl.textContent = new Date().toLocaleString();
        }, 1000);
    }

    // 3. Load Filters & Autocomplete
    await loadFilters();
    setupEmployeeSearch();

    // 4. Initial Report Generation
    await generateReport();
});

// ─── Filter Dropdowns Loading ────────────────────────────────────────────────
async function loadFilters() {
    try {
        const fetchFn = window.pageAccess ? window.pageAccess.authenticatedFetch : fetch;
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // 1. Load Branches
        let branchData = null;
        if (typeof window.getGlobalBranches === 'function') {
            const branches = await window.getGlobalBranches();
            if (branches && branches.length > 0) {
                const branchSelect = document.getElementById('branchFilter');
                branchSelect.innerHTML = '<option value="All">Select Branch</option>';
                branches.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    branchSelect.appendChild(opt);
                });
            }
        } else {
            let res = await fetchFn('/api/v1/stores', { headers });
            if (!res.ok) res = await fetchFn('/api/v1/sub-branches', { headers });
            const data = await res.json();
            if (data.success && data.data) {
                const branchSelect = document.getElementById('branchFilter');
                branchSelect.innerHTML = '<option value="All">Select Branch</option>';
                const rawNames = data.data.map(item => (item.name || item.branchName || '').trim());
                const uniqueBranches = [...new Set(rawNames)].filter(n => n !== '').sort();
                uniqueBranches.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    branchSelect.appendChild(opt);
                });
            }
        }

        // 2. Load Departments
        const deptRes = await fetchFn('/api/v1/employee-departments', { headers });
        const deptData = await deptRes.json();
        if (deptData.success && deptData.data) {
            const deptSelect = document.getElementById('departmentFilter');
            deptSelect.innerHTML = '<option value="All">Select Department</option>';
            deptData.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name || d._id;
                opt.textContent = d.name;
                deptSelect.appendChild(opt);
            });
        }

        // 3. Load Designations
        const desigRes = await fetchFn('/api/v1/designations', { headers });
        const desigData = await desigRes.json();
        if (desigData.success && desigData.data) {
            const desigSelect = document.getElementById('designationFilter');
            desigSelect.innerHTML = '<option value="All">Select Designation</option>';
            desigData.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name || d._id;
                opt.textContent = d.name;
                desigSelect.appendChild(opt);
            });
        }

    } catch (err) {
        console.error('Error loading filters:', err);
    }
}

// ─── Employee Search Autocomplete ────────────────────────────────────────────
function setupEmployeeSearch() {
    const input = document.getElementById('empSearch');
    const box = document.getElementById('suggestionsBox');
    if (!input || !box) return;

    input.addEventListener('input', async (e) => {
        const val = e.target.value.trim();
        if (val.length < 1) {
            box.style.display = 'none';
            document.getElementById('selectedEmpId').value = '';
            return;
        }

        try {
            const fetchFn = window.pageAccess ? window.pageAccess.authenticatedFetch : fetch;
            const token = localStorage.getItem('token');
            const res = await fetchFn(`/api/v1/employees?search=${encodeURIComponent(val)}&limit=15`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (data.success && data.data && data.data.length > 0) {
                box.innerHTML = '';
                data.data.forEach(emp => {
                    if (emp.code && emp.code.toUpperCase().startsWith('IMP-')) return;
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerHTML = `<strong>${emp.code || 'N/A'}</strong> - ${emp.name} <small class="text-muted">(${emp.branch || 'No Branch'})</small>`;
                    div.onclick = () => {
                        input.value = `${emp.code ? emp.code + ' - ' : ''}${emp.name}`;
                        document.getElementById('selectedEmpId').value = emp._id;
                        document.getElementById('codeFilter').value = emp.code || '';
                        box.style.display = 'none';
                    };
                    box.appendChild(div);
                });
                box.style.display = 'block';
            } else {
                box.style.display = 'none';
            }
        } catch (err) {
            console.error('Autocomplete search error:', err);
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target !== input && !box.contains(e.target)) {
            box.style.display = 'none';
        }
    });
}

// ─── Generate Short Week Report ──────────────────────────────────────────────
async function generateReport() {
    const tableBody = document.getElementById('reportTableBody');
    const tableFoot = document.getElementById('reportTableFoot');

    const monthYear = document.getElementById('monthYearFilter')?.value || '';
    const branch = document.getElementById('branchFilter')?.value || 'All';
    const department = document.getElementById('departmentFilter')?.value || 'All';
    const designation = document.getElementById('designationFilter')?.value || 'All';
    const tswFilter = document.getElementById('tswFilter')?.value || 'only_short_week';
    const groupBy = document.getElementById('groupByFilter')?.value || 'none';
    const code = document.getElementById('codeFilter')?.value.trim() || '';
    const employeeId = document.getElementById('selectedEmpId')?.value || '';

    tableBody.innerHTML = `<tr>
        <td colspan="20" class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
            <div class="mt-2 text-muted fw-bold">Analyzing payroll records and short week calculations...</div>
        </td>
    </tr>`;
    if (tableFoot) tableFoot.style.display = 'none';

    try {
        const fetchFn = window.pageAccess ? window.pageAccess.authenticatedFetch : fetch;
        const token = localStorage.getItem('token');
        const params = new URLSearchParams();

        if (monthYear) params.append('monthYear', monthYear);
        if (branch && branch !== 'All') params.append('branch', branch);
        if (department && department !== 'All') params.append('department', department);
        if (designation && designation !== 'All') params.append('designation', designation);
        if (code) params.append('code', code);
        if (employeeId) params.append('employee', employeeId);
        params.append('tswFilter', tswFilter);
        params.append('onlyShortWeek', tswFilter === 'all' ? 'false' : 'true');
        params.append('groupBy', groupBy);

        const res = await fetchFn(`/api/v1/reports/short-week?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
            tableBody.innerHTML = `<tr><td colspan="20" class="text-center py-5 text-danger fw-bold"><i class="fas fa-exclamation-triangle me-2"></i>Error: ${result.message}</td></tr>`;
            return;
        }

        currentReportData = result;
        rawTableRows = result.data || [];
        renderReport(result);

    } catch (err) {
        console.error('Error generating short week report:', err);
        tableBody.innerHTML = `<tr><td colspan="20" class="text-center py-5 text-danger fw-bold"><i class="fas fa-wifi me-2"></i>Network error: ${err.message}</td></tr>`;
    }
}

// ─── Render Report UI ────────────────────────────────────────────────────────
function renderReport(result) {
    const totals = result.totals || {};
    const rows = result.data || [];
    const groupBy = result.groupBy || 'none';
    const groupedData = result.groupedData;
    const tableBody = document.getElementById('reportTableBody');
    const tableFoot = document.getElementById('reportTableFoot');
    const recordsBadge = document.getElementById('recordsCountBadge');
    const groupBadge = document.getElementById('groupByBadge');

    if (recordsBadge) recordsBadge.textContent = `${rows.length} Records`;

    if (groupBadge) {
        if (groupBy !== 'none') {
            groupBadge.style.display = 'inline-block';
            groupBadge.textContent = `Grouped: ${groupBy.toUpperCase()}`;
        } else {
            groupBadge.style.display = 'none';
        }
    }

    // 1. Update KPI Metric Cards
    document.getElementById('kpiEmployees').textContent = formatNumber(totals.totalEmployeesWithShortWeek || 0);
    document.getElementById('kpiTSWDays').textContent = `${formatNumber(totals.totalShortWeekDays || 0)} Days`;
    document.getElementById('kpiExtraHrs').textContent = totals.totalExtraShortHrsStr || '0:00';
    const kpiAllowed = document.getElementById('kpiAllowedHolidays');
    if (kpiAllowed) kpiAllowed.textContent = `${formatNumber(totals.totalAllowedHolidays || totals.totalHolidays || 0)} Days`;
    const kpiAbsEl = document.getElementById('kpiAbsents');
    if (kpiAbsEl) kpiAbsEl.textContent = `${formatNumber(totals.totalAbsents || 0)} Days`;
    document.getElementById('kpiExtraDeduction').textContent = `Rs. ${formatNumber(totals.totalExtraShortDeduction || 0)}`;
    document.getElementById('kpiGrandShortDed').textContent = `Rs. ${formatNumber(totals.grandTotalShortDeduction || 0)}`;

    if (rows.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="21" class="text-center py-5 text-muted fw-semibold"><i class="fas fa-folder-open fa-2x mb-2 d-block opacity-25"></i>No records found matching current filter criteria.</td></tr>`;
        if (tableFoot) tableFoot.style.display = 'none';
        return;
    }

    let tbodyHtml = '';
    let sumBasicSalary = 0;
    let sumAllowedHolidays = 0;
    let sumAbsents = 0;
    let sumReqHrs = 0;
    let sumWorkedHrs = 0;
    let sumBaseShortHrs = 0;
    let sumTSWDays = 0;
    let sumExtraShortHrs = 0;
    let sumActualShortHrs = 0;
    let sumExtraDeduction = 0;
    let sumTotalDeduction = 0;
    let sumNetSalary = 0;

    const renderRowHtml = (r, idx) => {
        const tswBadge = (r.shortWeekDays > 0)
            ? `<span class="badge-tsw" title="${r.shortWeekDays} Day(s) added into short time formula">+${r.shortWeekDays} Day${r.shortWeekDays > 1 ? 's' : ''}</span>`
            : `<span class="badge-tsw-zero">0 Days</span>`;

        const allowedCount = (r.allowedHolidays !== undefined) ? r.allowedHolidays : (r.holidays || 0);
        const allowedBadge = `<span class="badge-allowed-holiday" title="${allowedCount} Monthly Allowed Holidays">${allowedCount}</span>`;

        const absentsCount = (r.absents !== undefined) ? r.absents : (r.totalAbsents || 0);
        const absentBadge = (absentsCount > 0)
            ? `<span class="badge-absent" title="${absentsCount} Absent Day(s) this month">${absentsCount}</span>`
            : `<span class="badge-absent-zero">0</span>`;

        return `
            <tr data-search="${(r.code + ' ' + r.employeeName + ' ' + r.branch + ' ' + r.department + ' ' + r.designation).toLowerCase()}">
                <td class="text-center text-muted fw-semibold">${idx}</td>
                <td class="text-center"><span class="badge bg-light text-dark border">${r.monthYear || '-'}</span></td>
                <td class="text-center fw-bold text-primary">${r.code || '-'}</td>
                <td class="name-cell text-start">${r.employeeName || '-'}</td>
                <td class="text-start"><span class="badge-branch">${r.branch || '-'}</span></td>
                <td class="text-start text-muted">${r.department || '-'}</td>
                <td class="text-start text-muted">${r.designation || '-'}</td>
                <td class="text-end fw-semibold">${formatNumber(r.basicSalary)}</td>
                <td class="text-center">${r.dutyHrs || 8}h</td>
                <td class="text-center">${allowedBadge}</td>
                <td class="text-center">${absentBadge}</td>
                <td class="text-center">${tswBadge}</td>
                <td class="text-center text-secondary">${r.requiredHrsStr || '0:00'}</td>
                <td class="text-center fw-bold text-success">${r.workedHrsStr || '0:00'}</td>
                <td class="text-center text-warning-dark fw-semibold">${r.baseShortHrsStr || '0:00'}</td>
                <td class="text-center text-danger fw-bold">${r.extraShortHrsStr || '0:00'}</td>
                <td class="text-center text-danger fw-bold">${r.actualShortHrsStr || '0:00'}</td>
                <td class="text-end text-muted">${formatNumber(r.hourlyRate, 2)}</td>
                <td class="text-end text-extra-ded">${formatNumber(r.extraShortDeduction)}</td>
                <td class="text-end text-total-ded">${formatNumber(r.totalShortDeduction)}</td>
                <td class="text-end fw-bold text-dark">${formatNumber(r.netTotal)}</td>
            </tr>
        `;
    };

    if (groupBy && groupBy !== 'none' && groupedData) {
        // Grouped Hierarchy View
        let overallIdx = 1;
        Object.keys(groupedData).sort().forEach(groupKey => {
            const groupObj = groupedData[groupKey];
            const gTotals = groupObj.groupTotals || {};

            tbodyHtml += `
                <tr class="branch-group-header">
                    <td colspan="21">
                        <i class="fas fa-layer-group me-2"></i> ${groupKey.toUpperCase()} 
                        <span class="badge bg-primary ms-2">${groupObj.items.length} Employees</span>
                        <span class="badge bg-warning text-dark ms-1">${gTotals.totalAllowedHolidays || 0} Allowed Holidays</span>
                        <span class="badge bg-danger ms-1">${gTotals.totalAbsents || 0} Absents</span>
                        <span class="badge bg-secondary ms-1">${gTotals.totalTSWDays || 0} TSW Days</span>
                        <span class="badge bg-dark ms-1">Extra Ded: Rs. ${formatNumber(gTotals.totalExtraDeduction)}</span>
                    </td>
                </tr>
            `;

            groupObj.items.forEach(r => {
                sumBasicSalary += (r.basicSalary || 0);
                sumAllowedHolidays += ((r.allowedHolidays !== undefined) ? r.allowedHolidays : (r.holidays || 0));
                sumAbsents += ((r.absents !== undefined) ? r.absents : (r.totalAbsents || 0));
                sumReqHrs += (r.requiredHrs || 0);
                sumWorkedHrs += (r.workedHrs || 0);
                sumBaseShortHrs += (r.baseShortHrs || 0);
                sumTSWDays += (r.shortWeekDays || 0);
                sumExtraShortHrs += (r.extraShortHrs || 0);
                sumActualShortHrs += (r.actualShortHrs || 0);
                sumExtraDeduction += (r.extraShortDeduction || 0);
                sumTotalDeduction += (r.totalShortDeduction || 0);
                sumNetSalary += (r.netTotal || 0);

                tbodyHtml += renderRowHtml(r, overallIdx++);
            });

            // Group Subtotal Row
            tbodyHtml += `
                <tr class="group-subtotal-row">
                    <td colspan="7" class="text-end fw-bold">Subtotal [${groupKey}]:</td>
                    <td class="text-end fw-bold">${formatNumber(gTotals.totalBasic)}</td>
                    <td>-</td>
                    <td class="text-center fw-bold">${formatNumber(gTotals.totalAllowedHolidays || 0)}</td>
                    <td class="text-center fw-bold text-danger">${formatNumber(gTotals.totalAbsents || 0)}</td>
                    <td class="text-center fw-bold text-danger">${formatNumber(gTotals.totalTSWDays)} Days</td>
                    <td colspan="3">-</td>
                    <td class="text-center fw-bold text-danger">${formatNumber(gTotals.totalExtraShortHrs, 1)}h</td>
                    <td>-</td>
                    <td>-</td>
                    <td class="text-end fw-bold text-danger">${formatNumber(gTotals.totalExtraDeduction)}</td>
                    <td class="text-end fw-bold">${formatNumber(gTotals.totalShortDeduction)}</td>
                    <td class="text-end fw-bold">${formatNumber(gTotals.totalNet)}</td>
                </tr>
            `;
        });
    } else {
        // Flat List View
        rows.forEach((r, idx) => {
            sumBasicSalary += (r.basicSalary || 0);
            sumAllowedHolidays += ((r.allowedHolidays !== undefined) ? r.allowedHolidays : (r.holidays || 0));
            sumAbsents += ((r.absents !== undefined) ? r.absents : (r.totalAbsents || 0));
            sumReqHrs += (r.requiredHrs || 0);
            sumWorkedHrs += (r.workedHrs || 0);
            sumBaseShortHrs += (r.baseShortHrs || 0);
            sumTSWDays += (r.shortWeekDays || 0);
            sumExtraShortHrs += (r.extraShortHrs || 0);
            sumActualShortHrs += (r.actualShortHrs || 0);
            sumExtraDeduction += (r.extraShortDeduction || 0);
            sumTotalDeduction += (r.totalShortDeduction || 0);
            sumNetSalary += (r.netTotal || 0);

            tbodyHtml += renderRowHtml(r, idx + 1);
        });
    }

    tableBody.innerHTML = tbodyHtml;

    // 3. Update Footer Grand Totals
    if (tableFoot) {
        tableFoot.style.display = 'table-footer-group';
        document.getElementById('footBasicSalary').textContent = formatNumber(sumBasicSalary);
        const footAllowedEl = document.getElementById('footAllowedHolidays');
        if (footAllowedEl) footAllowedEl.textContent = formatNumber(sumAllowedHolidays);
        const footAbsEl = document.getElementById('footAbsents');
        if (footAbsEl) footAbsEl.textContent = formatNumber(sumAbsents);
        document.getElementById('footReqHrs').textContent = `${formatNumber(sumReqHrs, 1)}h`;
        document.getElementById('footWorkedHrs').textContent = `${formatNumber(sumWorkedHrs, 1)}h`;
        document.getElementById('footBaseShortHrs').textContent = `${formatNumber(sumBaseShortHrs, 1)}h`;
        document.getElementById('footTSWDays').textContent = `${formatNumber(sumTSWDays)} Days`;
        document.getElementById('footExtraShortHrs').textContent = `${formatNumber(sumExtraShortHrs, 1)}h`;
        document.getElementById('footActualShortHrs').textContent = `${formatNumber(sumActualShortHrs, 1)}h`;
        document.getElementById('footExtraDeduction').textContent = formatNumber(sumExtraDeduction);
        document.getElementById('footTotalDeduction').textContent = formatNumber(sumTotalDeduction);
        document.getElementById('footNetSalary').textContent = formatNumber(sumNetSalary);
    }
}

// ─── Local Fast Search Filter ────────────────────────────────────────────────
function filterTableLocally() {
    const term = (document.getElementById('quickSearchInput')?.value || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#reportTableBody tr[data-search]');
    let visible = 0;

    rows.forEach(tr => {
        const searchAttr = tr.getAttribute('data-search') || '';
        if (!term || searchAttr.includes(term)) {
            tr.style.display = '';
            visible++;
        } else {
            tr.style.display = 'none';
        }
    });

    const badge = document.getElementById('recordsCountBadge');
    if (badge) badge.textContent = `${visible} Records`;
}

// ─── Export to Excel ─────────────────────────────────────────────────────────
function exportToExcel() {
    const monthYear = document.getElementById('monthYearFilter')?.value || '';
    const branch = document.getElementById('branchFilter')?.value || 'All';
    const department = document.getElementById('departmentFilter')?.value || 'All';
    const designation = document.getElementById('designationFilter')?.value || 'All';
    const tswFilter = document.getElementById('tswFilter')?.value || 'only_short_week';
    const groupBy = document.getElementById('groupByFilter')?.value || 'none';
    const code = document.getElementById('codeFilter')?.value.trim() || '';
    const employeeId = document.getElementById('selectedEmpId')?.value || '';

    const params = new URLSearchParams();
    if (monthYear) params.append('monthYear', monthYear);
    if (branch && branch !== 'All') params.append('branch', branch);
    if (department && department !== 'All') params.append('department', department);
    if (designation && designation !== 'All') params.append('designation', designation);
    if (code) params.append('code', code);
    if (employeeId) params.append('employee', employeeId);
    params.append('tswFilter', tswFilter);
    params.append('onlyShortWeek', tswFilter === 'all' ? 'false' : 'true');
    params.append('groupBy', groupBy);

    const token = localStorage.getItem('token');
    window.location.href = `/api/v1/reports/short-week/export?${params.toString()}&token=${token}`;
}

// ─── Print Report ────────────────────────────────────────────────────────────
function printReport() {
    const monthYear = document.getElementById('monthYearFilter')?.value || '';
    const branch = document.getElementById('branchFilter')?.value || 'All';
    const department = document.getElementById('departmentFilter')?.value || 'All';
    const designation = document.getElementById('designationFilter')?.value || 'All';
    const tswFilter = document.getElementById('tswFilter')?.value || 'only_short_week';
    const groupBy = document.getElementById('groupByFilter')?.value || 'none';
    const code = document.getElementById('codeFilter')?.value.trim() || '';
    const employeeId = document.getElementById('selectedEmpId')?.value || '';

    const params = new URLSearchParams();
    if (monthYear) params.append('monthYear', monthYear);
    if (branch && branch !== 'All') params.append('branch', branch);
    if (department && department !== 'All') params.append('department', department);
    if (designation && designation !== 'All') params.append('designation', designation);
    if (code) params.append('code', code);
    if (employeeId) params.append('employee', employeeId);
    params.append('tswFilter', tswFilter);
    params.append('onlyShortWeek', tswFilter === 'all' ? 'false' : 'true');
    params.append('groupBy', groupBy);

    window.open(`/print-employee-short-week-report?${params.toString()}`, '_blank');
}

// ─── Reset Filters ───────────────────────────────────────────────────────────
function resetFilters() {
    const defaultMonth = getCurrentMonthStr();
    document.getElementById('monthYearFilter').value = defaultMonth;
    document.getElementById('branchFilter').value = 'All';
    document.getElementById('departmentFilter').value = 'All';
    document.getElementById('designationFilter').value = 'All';
    document.getElementById('tswFilter').value = 'only_short_week';
    document.getElementById('groupByFilter').value = 'none';
    document.getElementById('codeFilter').value = '';
    document.getElementById('empSearch').value = '';
    document.getElementById('selectedEmpId').value = '';
    document.getElementById('quickSearchInput').value = '';
    generateReport();
}
