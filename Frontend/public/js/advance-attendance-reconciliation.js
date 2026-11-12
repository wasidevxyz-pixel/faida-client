// Advance vs Actual Attendance Reconciliation - Client Controller
let reconciliationData = [];
let currentPeriod = { from: '', to: '', totalDays: 0 };
let currentSummary = null;
let activeModalEmployee = null;

document.addEventListener('DOMContentLoaded', async () => {
    initDefaultDates();
    await loadBranches();
    await loadDepartments();
    bindEvents();

    // Always start with clean branch selection prompt (no auto-load on page load)
    renderBranchPrompt();
});

function initDefaultDates() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Default: 24th of current month to last day of current month
    const from = new Date(year, month, 24);
    const to = new Date(year, month + 1, 0); // Last day of month

    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    document.getElementById('filterFromDate').value = fmt(from);
    document.getElementById('filterToDate').value = fmt(to);
}

function setQuick24ToEnd() {
    initDefaultDates();
    const branch = document.getElementById('filterBranch').value;
    if (branch) {
        loadReconciliation();
    } else {
        alert('Dates set to 24-End. Please select a branch to load records.');
        document.getElementById('filterBranch').focus();
    }
}

async function loadBranches() {
    try {
        const branchSelect = document.getElementById('filterBranch');
        branchSelect.innerHTML = '<option value="" selected>-- Select Branch --</option>';

        let list = [];
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/v1/stores', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                list = data.data.map(s => s.name).filter(Boolean);
            }
        } catch (e) {
            console.warn('Direct stores fetch failed, trying getGlobalBranches fallback:', e);
        }

        if (list.length === 0 && typeof window.getGlobalBranches === 'function') {
            list = await window.getGlobalBranches();
        }

        // Apply strict user rights filtering:
        // According to user rights, which branch is allowed ONLY that branch will show in dropdown!
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userRole = (user.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin';

        let userBranches = [];
        if (Array.isArray(user.branch)) {
            userBranches = user.branch.map(b => String(b).trim()).filter(Boolean);
        } else if (typeof user.branch === 'string' && user.branch.trim()) {
            userBranches = user.branch.split(',').map(b => b.trim()).filter(Boolean);
        }

        const clean = s => String(s || '').replace(/[()]/g, '').trim().toLowerCase();
        const userBranchesClean = userBranches.map(clean);
        const userBranchesRaw = userBranches.map(b => b.toLowerCase());
        const hasAllBranches = userBranchesClean.includes('all') || userBranchesClean.includes('all branches');

        // If user does not have unrestricted/all branches access, filter down strictly to their allowed branches
        if (!hasAllBranches) {
            if (userBranches.length > 0) {
                list = list.filter(b => {
                    const bRaw = String(b).trim().toLowerCase();
                    const bClean = clean(b);
                    return userBranchesRaw.includes(bRaw) || userBranchesClean.includes(bClean);
                });
            } else if (!isAdmin) {
                // Non-admin without assigned branches sees none
                list = [];
            }
        }

        // Deduplicate and sort alphabetically
        const uniqueList = [...new Set(list)].filter(Boolean).sort();

        uniqueList.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            branchSelect.appendChild(opt);
        });

        // CRITICAL: NEVER pre-select any branch automatically!
        // Dropdown must ALWAYS remain on "-- Select Branch --" so user chooses their branch.
        branchSelect.value = '';
    } catch (err) {
        console.error('Error loading branches:', err);
    }
}

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const deptSelect = document.getElementById('filterDept');
        const res = await fetch('/api/v1/employee-departments', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            data.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                deptSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Error loading departments:', err);
    }
}

function bindEvents() {
    document.getElementById('btnLoadData').addEventListener('click', () => loadReconciliation());
    document.getElementById('btnSet24ToEnd').addEventListener('click', setQuick24ToEnd);
    document.getElementById('btnSaveRecon').addEventListener('click', saveAllReconciliation);
    document.getElementById('btnPrintSummary').addEventListener('click', () => openPrintView('summary'));
    document.getElementById('btnPrintDetails').addEventListener('click', () => openPrintView('details'));

    document.getElementById('filterBranch').addEventListener('change', () => {
        const branch = document.getElementById('filterBranch').value;
        if (branch) {
            loadReconciliation();
        } else {
            renderBranchPrompt();
        }
    });

    // Top Header Search Box: Filters both Summary View and Daily Sheet
    document.getElementById('filterSearch').addEventListener('input', (e) => {
        filterSummaryTable(e.target.value);
        const dailySearch = document.getElementById('dailyEmployeeSearch');
        if (dailySearch) dailySearch.value = e.target.value;
        renderMatrixTable(document.getElementById('matrixEmployeeFilter').value, e.target.value);
    });

    // Daily Sheet Search Box: Instant Filter on Daily Sheet
    const dailySearchInput = document.getElementById('dailyEmployeeSearch');
    if (dailySearchInput) {
        dailySearchInput.addEventListener('input', (e) => {
            const selVal = (window.jQuery ? $('#matrixEmployeeFilter').val() : document.getElementById('matrixEmployeeFilter')?.value) || 'all';
            renderMatrixTable(selVal, e.target.value);
        });
    }

    // Daily Sheet Dropdown Filter (Select2 and Native)
    if (window.jQuery) {
        $('#matrixEmployeeFilter').on('select2:select change', function () {
            const val = $(this).val();
            const dailySearch = document.getElementById('dailyEmployeeSearch');
            const query = dailySearch ? dailySearch.value : '';
            renderMatrixTable(val, query);
        });
    } else {
        const matrixEmpFilter = document.getElementById('matrixEmployeeFilter');
        if (matrixEmpFilter) {
            matrixEmpFilter.addEventListener('change', (e) => {
                const dailySearch = document.getElementById('dailyEmployeeSearch');
                const query = dailySearch ? dailySearch.value : '';
                renderMatrixTable(e.target.value, query);
            });
        }
    }

    // Reset button for Daily Sheet Filter
    const btnReset = document.getElementById('btnClearMatrixFilter');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (window.jQuery && $.fn.select2) {
                $('#matrixEmployeeFilter').val('all').trigger('change');
            } else {
                const sel = document.getElementById('matrixEmployeeFilter');
                if (sel) {
                    sel.value = 'all';
                    sel.dispatchEvent(new Event('change'));
                }
            }
            const dailySearch = document.getElementById('dailyEmployeeSearch');
            if (dailySearch) dailySearch.value = '';
            renderMatrixTable('all', '');
        });
    }

    document.getElementById('btnCopyAllAdvance').addEventListener('click', copyAllAdvanceToActual);
    document.getElementById('btnModalCopyAdv').addEventListener('click', copyModalAdvanceToActual);
    document.getElementById('btnModalSave').addEventListener('click', saveModalChanges);
    document.getElementById('btnModalPrintSlip').addEventListener('click', printActiveModalSlip);

    const btnDailyPrint = document.getElementById('btnDailyPrintSlip');
    if (btnDailyPrint) {
        btnDailyPrint.addEventListener('click', printFocusedEmployeeSlip);
    }
}

function renderBranchPrompt() {
    reconciliationData = [];
    const tbody = document.getElementById('summaryTableBody');
    tbody.innerHTML = `<tr>
        <td colspan="12" class="text-center py-5 text-muted">
            <i class="fas fa-store-alt fa-3x text-primary mb-3 d-block opacity-75"></i>
            <h6 class="fw-bold text-dark">Please Select a Branch</h6>
            <p class="small text-muted mb-0">Select a specific branch from the dropdown above to quickly load attendance records without delay.</p>
        </td>
    </tr>`;
    document.getElementById('summaryTableFoot').style.display = 'none';
    document.getElementById('matrixTableBody').innerHTML = `<tr><td colspan="15" class="text-center py-4 text-muted">Please select a branch first to view daily attendance matrix.</td></tr>`;
    updateTopKPIs();
}

// ─── Time Formatting & Conversion Helpers (Exact Attendance Register Format) ───

function convertTo24Hour(timeStr) {
    if (!timeStr) return '';
    const cleanStr = String(timeStr).trim().toUpperCase();
    if (['-', '--:--', ''].includes(cleanStr)) return '';
    if (['00:00', '0:00'].includes(cleanStr)) return '00:00';

    // Check for AM/PM format
    if (cleanStr.includes('AM') || cleanStr.includes('PM')) {
        const isPM = cleanStr.includes('PM');
        const parts = cleanStr.replace(/[A-Z\s]/g, '').split(':');
        let hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        if (hours === 12) hours = 0;
        if (isPM) hours += 12;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Handle 24h format (HH:mm)
    const parts = cleanStr.split(':');
    if (parts.length >= 2) {
        let hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    return '';
}

function formatTimeAMPM(timeStr) {
    if (!timeStr) return '-';
    const str = String(timeStr).trim();
    if (['-', '--:--', ''].includes(str)) return '-';
    if (str.toUpperCase().includes('AM') || str.toUpperCase().includes('PM')) return str;
    const parts = str.split(':');
    if (parts.length < 2) return str;
    let hours = parseInt(parts[0], 10);
    const minutes = String(parts[1]).padStart(2, '0');
    if (isNaN(hours)) return str;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
}

function parseTimeToMins(str, isMidnightAllowed = false) {
    if (!str || typeof str !== 'string') return 0;
    const clean = str.trim().toUpperCase();
    if (['-', '--:--', ''].includes(clean)) return 0;

    const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (ampmMatch) {
        let h = parseInt(ampmMatch[1], 10);
        const m = parseInt(ampmMatch[2], 10);
        const meridiem = ampmMatch[3];
        if (meridiem) {
            if (meridiem.toUpperCase() === 'PM' && h < 12) h += 12;
            if (meridiem.toUpperCase() === 'AM' && h === 12) h = 0;
        }
        let tot = (h * 60) + m;
        if (tot === 0 && isMidnightAllowed) return 1440;
        return tot;
    }

    if (clean.includes(':')) {
        const parts = clean.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        let tot = (h * 60) + m;
        if (tot === 0 && isMidnightAllowed) return 1440;
        return tot;
    }
    return 0;
}

function minsToHHMM(mins) {
    const abs = Math.abs(Math.round(mins || 0));
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
}

function calcWorkedMins(inStr, outStr) {
    const inM = parseTimeToMins(inStr, false);
    const outM = parseTimeToMins(outStr, true);
    if (inM <= 0 || outM <= 0) return 0;
    if (outM >= inM) return outM - inM;
    return (1440 - inM) + outM; // Crossing midnight
}

// ─── Fetch & Load Data ───

async function loadReconciliation() {
    const from = document.getElementById('filterFromDate').value;
    const to = document.getElementById('filterToDate').value;
    const branch = document.getElementById('filterBranch').value;
    const dept = document.getElementById('filterDept').value;

    if (!from || !to) {
        alert('Please select both From Date and To Date');
        return;
    }

    if (!branch) {
        alert('Please select a Branch to load attendance records.');
        document.getElementById('filterBranch').focus();
        renderBranchPrompt();
        return;
    }

    const loadBtn = document.getElementById('btnLoadData');
    const oldHtml = loadBtn.innerHTML;
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Loading...';

    const tbody = document.getElementById('summaryTableBody');
    tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-primary mb-2"></i><div>Loading ${branch} Attendance Data...</div></td></tr>`;

    try {
        const token = localStorage.getItem('token');
        let url = `/api/v1/attendance-reconciliation?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&branch=${encodeURIComponent(branch)}`;
        if (dept) url += `&department=${encodeURIComponent(dept)}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const json = await res.json();

        if (json.success) {
            reconciliationData = json.data || [];
            currentPeriod = json.period || { from, to, totalDays: 0 };
            currentSummary = json.summary || {};

            renderSummaryTable();
            populateMatrixFilter();
            renderMatrixTable('all');
            updateTopKPIs();
        } else {
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-danger"><i class="fas fa-exclamation-triangle me-1"></i> ${json.message || 'Failed to load records'}</td></tr>`;
        }
    } catch (err) {
        console.error('Error loading reconciliation:', err);
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-danger"><i class="fas fa-times-circle me-1"></i> Network error loading records</td></tr>`;
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = oldHtml;
    }
}

// ─── Render Summary View (Tab 1) ───

function renderSummaryTable() {
    const tbody = document.getElementById('summaryTableBody');
    const tfoot = document.getElementById('summaryTableFoot');

    if (!reconciliationData || reconciliationData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center py-4 text-muted"><i class="fas fa-info-circle me-1"></i> No employee records found for this branch in the selected date range.</td></tr>`;
        tfoot.style.display = 'none';
        return;
    }

    let html = '';
    let totAdvMins = 0;
    let totActMins = 0;
    let totAdjAmt = 0;

    reconciliationData.forEach((emp, idx) => {
        totAdvMins += emp.totalAdvanceMinutes || 0;
        totActMins += emp.totalActualMinutes || 0;
        totAdjAmt += emp.estimatedAdjustmentAmount || 0;

        const diffClass = emp.netDiffMinutes < 0 ? 'badge-diff-minus' : (emp.netDiffMinutes > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
        const diffSign = emp.netDiffMinutes < 0 ? '-' : (emp.netDiffMinutes > 0 ? '+' : '');
        const diffIcon = emp.netDiffMinutes < 0 ? '<i class="fas fa-arrow-down me-1"></i>' : (emp.netDiffMinutes > 0 ? '<i class="fas fa-arrow-up me-1"></i>' : '');

        const statusBadge = emp.allDaysSaved
            ? '<span class="badge bg-success" style="font-size:0.75rem;"><i class="fas fa-check me-1"></i>Saved</span>'
            : '<span class="badge bg-warning text-dark" style="font-size:0.75rem;">Pending</span>';

        html += `
        <tr data-emp-id="${emp.employeeId}" data-code="${emp.code.toLowerCase()}" data-name="${emp.name.toLowerCase()}">
            <td class="text-center fw-bold text-muted sticky-col-sr">${idx + 1}</td>
            <td class="text-center fw-bold text-primary font-monospace sticky-col-emp">${emp.code}</td>
            <td class="fw-bold">${emp.name}</td>
            <td class="text-center">${emp.branch}</td>
            <td class="text-center small">${emp.department}</td>
            <td class="text-end font-monospace">${emp.basicSalary ? emp.basicSalary.toLocaleString() : '0'}</td>
            <td class="text-center font-monospace fw-bold text-secondary">${emp.dutyHrs || emp.totalHrs || 12}h</td>
            <td class="cell-adv font-monospace">${emp.totalAdvanceHoursFormatted}</td>
            <td class="cell-act font-monospace fw-bold" id="sumActHrs_${emp.employeeId}">${emp.totalActualHoursFormatted}</td>
            <td class="cell-diff" id="sumDiffCol_${emp.employeeId}">
                <span class="${diffClass}">${diffIcon}${diffSign}${minsToHHMM(Math.abs(emp.netDiffMinutes))}</span>
            </td>
            <td class="text-end fw-bold ${emp.estimatedAdjustmentAmount < 0 ? 'text-danger' : (emp.estimatedAdjustmentAmount > 0 ? 'text-success' : 'text-muted')}" id="sumAdjAmt_${emp.employeeId}">
                ${emp.estimatedAdjustmentAmount ? emp.estimatedAdjustmentAmount.toLocaleString() : '0'}
            </td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-center">
                <button class="btn btn-xs btn-primary py-0 px-2" onclick="openEmployeeDetailModal('${emp.employeeId}')" title="Edit in Modal Dialog">
                    <i class="fas fa-edit me-1"></i> Edit
                </button>
                <button class="btn btn-xs btn-outline-primary py-0 px-2 ms-1" onclick="focusEmployeeInMatrix('${emp.employeeId}')" title="Jump to Daily Sheet for this employee">
                    <i class="fas fa-calendar-alt me-1"></i> Sheet
                </button>
                <button class="btn btn-xs btn-outline-dark py-0 px-2 ms-1" onclick="printSingleSlip('${emp.employeeId}')" title="Print Employee Audit Slip">
                    <i class="fas fa-print"></i>
                </button>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
    tfoot.style.display = '';

    const netOverallMins = totActMins - totAdvMins;
    const netSign = netOverallMins < 0 ? '-' : (netOverallMins > 0 ? '+' : '');

    document.getElementById('footAdvHrs').textContent = minsToHHMM(totAdvMins);
    document.getElementById('footActHrs').textContent = minsToHHMM(totActMins);
    document.getElementById('footDiffHrs').innerHTML = `<span class="${netOverallMins < 0 ? 'badge-diff-minus' : 'badge-diff-plus'}">${netSign}${minsToHHMM(Math.abs(netOverallMins))}</span>`;
    document.getElementById('footAdjAmt').textContent = totAdjAmt.toLocaleString();
}

// Switch to Daily Sheet and Focus on Specific Employee
function focusEmployeeInMatrix(empId) {
    const tabBtn = document.getElementById('tab-matrix-btn');
    if (tabBtn) {
        bootstrap.Tab.getOrCreateInstance(tabBtn).show();
    }

    if (window.jQuery && $.fn.select2) {
        $('#matrixEmployeeFilter').val(empId).trigger('change');
    } else {
        const sel = document.getElementById('matrixEmployeeFilter');
        if (sel) {
            sel.value = empId;
            sel.dispatchEvent(new Event('change'));
        }
    }

    const dailySearch = document.getElementById('dailyEmployeeSearch');
    if (dailySearch) dailySearch.value = '';

    renderMatrixTable(empId, '');
}

// Filter Summary Table Live
function filterSummaryTable(searchVal) {
    const q = (searchVal || '').trim().toLowerCase();
    const rows = document.querySelectorAll('#summaryTableBody tr[data-emp-id]');
    rows.forEach(r => {
        const code = r.getAttribute('data-code') || '';
        const name = r.getAttribute('data-name') || '';
        if (code.includes(q) || name.includes(q)) {
            r.style.display = '';
        } else {
            r.style.display = 'none';
        }
    });
}

// Populate Matrix Dropdown Filter with Select2 Search
function populateMatrixFilter() {
    const $sel = $('#matrixEmployeeFilter');
    if (!$sel.length) return;

    $sel.empty();
    $sel.append(new Option('-- All Employees (Continuous Sheet) --', 'all', true, true));

    reconciliationData.forEach(e => {
        const deptStr = e.department && e.department !== '-' ? ` - ${e.department}` : '';
        const optText = `${e.name} (${e.code})${deptStr} [${e.dutyHrs || e.totalHrs || 12}h Duty]`;
        $sel.append(new Option(optText, e.employeeId));
    });

    if (window.jQuery && $.fn.select2) {
        $sel.select2({
            theme: 'bootstrap-5',
            placeholder: 'Search employee name or code...',
            width: '100%',
            dropdownParent: $('body')
        });
    }
}

// ─── Render Daily Matrix Sheet (Tab 2) With Employee Subtotals & Search ───

function renderMatrixTable(focusEmpId = 'all', textQuery = '') {
    const tbody = document.getElementById('matrixTableBody');

    if (!reconciliationData || reconciliationData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-muted">No attendance records loaded yet. Please select a branch and click Load Records.</td></tr>`;
        return;
    }

    const q = (textQuery || '').trim().toLowerCase();
    let filteredEmps = reconciliationData;

    if (focusEmpId && focusEmpId !== 'all') {
        filteredEmps = filteredEmps.filter(e => e.employeeId === focusEmpId);
    }

    if (q) {
        filteredEmps = filteredEmps.filter(e =>
            e.code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
        );
    }

    if (filteredEmps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-muted"><i class="fas fa-search me-1"></i> No matching employees found for "${textQuery}".</td></tr>`;
        return;
    }

    let html = '';
    let globalRowIndex = 1;

    filteredEmps.forEach(emp => {
        emp.days.forEach((day, dIdx) => {
            const rowKey = `${emp.employeeId}_${day.date}`;
            const diffClass = day.diffMinutes < 0 ? 'badge-diff-minus' : (day.diffMinutes > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
            const diffSign = day.diffMinutes < 0 ? '-' : (day.diffMinutes > 0 ? '+' : '');

            html += `
            <tr data-emp="${emp.employeeId}" data-date="${day.date}" id="row_${rowKey}">
                <td class="text-center text-muted small sticky-col-sr">${globalRowIndex++}</td>
                <td class="fw-bold small sticky-col-emp text-truncate" style="width: 220px; min-width: 200px; max-width: 240px;" title="${emp.name} (${emp.code}) - ${emp.dutyHrs || emp.totalHrs || 12}h Duty">
                    <span class="d-inline-block text-truncate align-middle" style="max-width: 130px;">${emp.name}</span>
                    <span class="badge bg-light text-primary border border-primary-subtle font-monospace align-middle ms-1">${emp.code}</span>
                    <span class="badge bg-secondary-subtle text-dark border font-monospace align-middle ms-1" style="font-size:0.7rem;" title="Configured Duty Hours">${emp.dutyHrs || emp.totalHrs || 12}h</span>
                </td>
                <td class="text-center font-monospace">${day.date.substring(5)}</td>
                <td class="text-center fw-bold small ${day.dayName === 'Sun' ? 'text-danger' : 'text-secondary'}">${day.dayName}</td>
                
                <!-- Advance Columns (Light Blue Tint) -->
                <td class="cell-adv font-monospace">${formatTimeAMPM(day.advanceCheckIn)}</td>
                <td class="cell-adv font-monospace">${formatTimeAMPM(day.advanceCheckOut)}</td>
                <td class="cell-adv font-monospace">${day.advanceHoursFormatted}</td>
                <td class="cell-adv"><span class="badge ${day.advanceStatus === 'Present' ? 'bg-primary' : 'bg-secondary'}" style="font-size:0.7rem;">${day.advanceStatus}</span></td>
                
                <!-- Actual Columns (Attendance Register Style time inputs) -->
                <td class="cell-act px-1">
                    <input type="time" class="form-control form-control-xs text-center fw-bold" 
                           value="${convertTo24Hour(day.actualCheckIn)}" 
                           oninput="onMatrixTimeChange('${emp.employeeId}', '${day.date}', 'in', this.value)"
                           onchange="onMatrixTimeChange('${emp.employeeId}', '${day.date}', 'in', this.value)">
                </td>
                <td class="cell-act px-1">
                    <input type="time" class="form-control form-control-xs text-center fw-bold" 
                           value="${convertTo24Hour(day.actualCheckOut)}" 
                           oninput="onMatrixTimeChange('${emp.employeeId}', '${day.date}', 'out', this.value)"
                           onchange="onMatrixTimeChange('${emp.employeeId}', '${day.date}', 'out', this.value)">
                </td>
                <td class="cell-act font-monospace fw-bold" id="actHrs_${rowKey}">${day.actualHoursFormatted}</td>
                <td class="cell-act px-1">
                    <select class="form-select form-select-xs fw-bold" onchange="onMatrixStatusChange('${emp.employeeId}', '${day.date}', this.value)">
                        <option value="Present" ${day.actualStatus === 'Present' ? 'selected' : ''}>Present</option>
                        <option value="Absent" ${day.actualStatus === 'Absent' ? 'selected' : ''}>Absent</option>
                        <option value="Leave" ${day.actualStatus === 'Leave' ? 'selected' : ''}>Leave</option>
                        <option value="Half Day" ${day.actualStatus === 'Half Day' ? 'selected' : ''}>Half Day</option>
                    </select>
                </td>

                <!-- Difference & Remarks -->
                <td class="cell-diff" id="diffCell_${rowKey}">
                    <span class="${diffClass}">${diffSign}${minsToHHMM(Math.abs(day.diffMinutes))}</span>
                </td>
                <td style="width: 85px; max-width: 90px; padding: 2px 3px;">
                    <input type="text" class="form-control form-control-xs px-1 text-muted" value="${day.remarks || ''}" 
                           placeholder="Notes..." 
                           onchange="onMatrixRemarksChange('${emp.employeeId}', '${day.date}', this.value)" style="height:26px; font-size:0.75rem; width:100%;">
                </td>
                <td class="text-center" style="width: 200px; min-width: 195px;">
                    <div class="d-inline-flex align-items-center justify-content-center gap-1">
                        <button type="button" class="btn-row-quick btn-quick-absent" title="Mark Absent" onclick="markDayAbsent('${emp.employeeId}', '${day.date}')">
                            <i class="fas fa-user-times"></i>
                        </button>
                        <button type="button" class="btn-row-quick btn-quick-adv" title="Copy Advance to Actual" onclick="copyDayAdvance('${emp.employeeId}', '${day.date}')">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button type="button" class="btn-row-quick btn-quick-batch" title="Copy this timing to ALL days of ${emp.name}" onclick="applyDayToAllDays('${emp.employeeId}', '${day.date}')">
                            <i class="fas fa-layer-group"></i>
                        </button>
                    </div>
                </td>
            </tr>
            `;
        });

        // ─── Subtotal Row Per Employee ("and total") ───
        const diffClass = emp.netDiffMinutes < 0 ? 'badge-diff-minus' : (emp.netDiffMinutes > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
        const diffSign = emp.netDiffMinutes < 0 ? '-' : (emp.netDiffMinutes > 0 ? '+' : '');
        const diffIcon = emp.netDiffMinutes < 0 ? '<i class="fas fa-arrow-down me-1"></i>' : (emp.netDiffMinutes > 0 ? '<i class="fas fa-arrow-up me-1"></i>' : '');
        const adjClass = emp.estimatedAdjustmentAmount < 0 ? 'badge-diff-minus' : (emp.estimatedAdjustmentAmount > 0 ? 'badge-diff-plus' : 'badge-diff-zero');

        html += `
        <tr class="recon-subtotal-row" id="subtotal_${emp.employeeId}">
            <td colspan="4" class="subtotal-label text-end pe-2 small">
                <i class="fas fa-calculator text-warning me-1"></i>TOTAL FOR ${emp.name} (${emp.code}) <span class="badge bg-light text-dark border ms-1" style="font-size:0.7rem;">Duty: ${emp.dutyHrs || emp.totalHrs || 12}h</span>:
            </td>
            <!-- Advance Total (Cols 5-8) -->
            <td class="subtotal-adv" colspan="2"></td>
            <td class="subtotal-adv-val font-monospace" id="subAdvHrs_${emp.employeeId}">${emp.totalAdvanceHoursFormatted}</td>
            <td class="subtotal-adv"></td>
            
            <!-- Actual Total (Cols 9-12) -->
            <td class="subtotal-act" colspan="2"></td>
            <td class="subtotal-act-val font-monospace" id="subActHrs_${emp.employeeId}">${emp.totalActualHoursFormatted}</td>
            <td class="subtotal-act"></td>
            
            <!-- Diff Total (Col 13) -->
            <td class="subtotal-diff" id="subDiffCell_${emp.employeeId}">
                <span class="${diffClass}">${diffIcon}${diffSign}${minsToHHMM(Math.abs(emp.netDiffMinutes))}</span>
            </td>
            
            <!-- Estimated Adjustment (Col 14) -->
            <td class="subtotal-adj py-1 small">
                <span class="badge ${adjClass} py-1 px-2" id="subAdjAmt_${emp.employeeId}">PKR ${emp.estimatedAdjustmentAmount ? emp.estimatedAdjustmentAmount.toLocaleString() : '0'}</span>
            </td>
            
            <!-- Action / Buttons (Col 15) -->
            <td class="subtotal-action py-1" style="width: 200px; min-width: 195px; white-space: nowrap;">
                <div class="subtotal-actions-wrap">
                    <button type="button" class="btn-sub-action btn-sub-slip" onclick="printSingleSlip('${emp.employeeId}')" title="Print date-wise audit slip for ${emp.name}">
                        <i class="fas fa-print me-1 text-info"></i> Slip
                    </button>
                    <button type="button" class="btn-sub-action btn-sub-adv" onclick="copyEmployeeAdvance('${emp.employeeId}')" title="Fill advance timings to actual for ${emp.name}">
                        <i class="fas fa-clone me-1 text-warning"></i> Fill Adv
                    </button>
                    <button type="button" class="btn-sub-action btn-sub-clear" onclick="clearEmployeeActual('${emp.employeeId}')" title="Clear actual times to empty (--:--) for ${emp.name}">
                        <i class="fas fa-eraser me-1"></i> Clear
                    </button>
                    <button type="button" class="btn-sub-action btn-sub-save" onclick="saveSingleEmployee('${emp.employeeId}')" title="Save this employee's records to database">
                        <i class="fas fa-save me-1 text-white"></i> Save
                    </button>
                </div>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Live calculation handlers for Daily Matrix
function onMatrixTimeChange(empId, dateStr, field, value) {
    const emp = reconciliationData.find(e => e.employeeId === empId);
    if (!emp) return;
    const day = emp.days.find(d => d.date === dateStr);
    if (!day) return;

    if (field === 'in') day.actualCheckIn = value ? formatTimeAMPM(value) : '';
    if (field === 'out') day.actualCheckOut = value ? formatTimeAMPM(value) : '';

    // CRITICAL FIX: If actual times are entered, auto-switch status to Present!
    if (day.actualCheckIn || day.actualCheckOut) {
        if (day.actualStatus === 'Absent') {
            day.actualStatus = 'Present';
            const row = document.getElementById(`row_${empId}_${dateStr}`);
            if (row) {
                const sel = row.querySelector('.form-select-xs') || row.querySelector('select');
                if (sel) sel.value = 'Present';
            }
        }
    }

    recalculateDay(day);
    recalculateEmployeeSummary(emp);
    updateRowUI(empId, day);
    updateSummaryTableRow(emp);
    updateSubtotalRow(emp);
    updateTopKPIs();
    showUnsavedIndicator();
}

function onMatrixStatusChange(empId, dateStr, statusVal) {
    const emp = reconciliationData.find(e => e.employeeId === empId);
    if (!emp) return;
    const day = emp.days.find(d => d.date === dateStr);
    if (!day) return;

    day.actualStatus = statusVal;
    if (statusVal === 'Absent') {
        day.actualCheckIn = '';
        day.actualCheckOut = '';
        const row = document.getElementById(`row_${empId}_${dateStr}`);
        if (row) {
            row.querySelectorAll('input[type="time"]').forEach(inp => inp.value = '');
        }
    }

    recalculateDay(day);
    recalculateEmployeeSummary(emp);
    updateRowUI(empId, day);
    updateSummaryTableRow(emp);
    updateSubtotalRow(emp);
    updateTopKPIs();
    showUnsavedIndicator();
}

function onMatrixRemarksChange(empId, dateStr, remarksVal) {
    const emp = reconciliationData.find(e => e.employeeId === empId);
    if (!emp) return;
    const day = emp.days.find(d => d.date === dateStr);
    if (day) {
        day.remarks = remarksVal.trim();
        showUnsavedIndicator();
    }
}

function markDayAbsent(empId, dateStr) {
    onMatrixStatusChange(empId, dateStr, 'Absent');
    const row = document.getElementById(`row_${empId}_${dateStr}`);
    if (row) {
        const timeInputs = row.querySelectorAll('input[type="time"]');
        timeInputs.forEach(inp => inp.value = '');
        const sel = row.querySelector('.form-select-xs') || row.querySelector('select');
        if (sel) sel.value = 'Absent';
    }
}

function copyDayAdvance(empId, dateStr) {
    const emp = reconciliationData.find(e => e.employeeId === empId);
    if (!emp) return;
    const day = emp.days.find(d => d.date === dateStr);
    if (!day) return;

    day.actualCheckIn = day.advanceCheckIn;
    day.actualCheckOut = day.advanceCheckOut;
    day.actualStatus = day.advanceStatus;

    recalculateDay(day);
    recalculateEmployeeSummary(emp);
    updateRowUI(empId, day);
    updateSummaryTableRow(emp);
    updateSubtotalRow(emp);
    updateTopKPIs();
    showUnsavedIndicator();

    const row = document.getElementById(`row_${empId}_${dateStr}`);
    if (row) {
        const timeInputs = row.querySelectorAll('input[type="time"]');
        if (timeInputs[0]) timeInputs[0].value = convertTo24Hour(day.actualCheckIn);
        if (timeInputs[1]) timeInputs[1].value = convertTo24Hour(day.actualCheckOut);
        const sel = row.querySelector('.form-select-xs') || row.querySelector('select');
        if (sel) sel.value = day.actualStatus;
    }
}

function recalculateDay(day) {
    // If times are set, cannot remain Absent
    if (day.actualCheckIn && day.actualCheckOut && day.actualStatus === 'Absent') {
        day.actualStatus = 'Present';
    }

    if (day.actualStatus === 'Absent') {
        day.actualMinutes = 0;
    } else {
        day.actualMinutes = calcWorkedMins(day.actualCheckIn, day.actualCheckOut);
    }
    day.actualHours = +(day.actualMinutes / 60).toFixed(2);
    day.actualHoursFormatted = minsToHHMM(day.actualMinutes);

    day.diffMinutes = day.actualMinutes - day.advanceMinutes;
    day.diffMode = day.diffMinutes >= 0 ? '+' : '-';
    day.diffHoursFormatted = (day.diffMinutes === 0 ? '0:00' : `${day.diffMode}${minsToHHMM(Math.abs(day.diffMinutes))}`);
}

function recalculateEmployeeSummary(emp) {
    let actMins = 0;
    emp.days.forEach(d => {
        actMins += d.actualMinutes || 0;
    });

    emp.totalActualMinutes = actMins;
    emp.totalActualHours = +(actMins / 60).toFixed(2);
    emp.totalActualHoursFormatted = minsToHHMM(actMins);

    emp.netDiffMinutes = actMins - emp.totalAdvanceMinutes;
    emp.netDiffMode = emp.netDiffMinutes >= 0 ? '+' : '-';
    emp.netDiffHoursFormatted = (emp.netDiffMinutes === 0 ? '0:00' : `${emp.netDiffMode}${minsToHHMM(Math.abs(emp.netDiffMinutes))}`);

    if (emp.hourlyRate) {
        emp.estimatedAdjustmentAmount = Math.round((emp.netDiffMinutes / 60) * emp.hourlyRate);
    }
}

function updateRowUI(empId, day) {
    const rowKey = `${empId}_${day.date}`;
    const actHrsTd = document.getElementById(`actHrs_${rowKey}`);
    const diffCellTd = document.getElementById(`diffCell_${rowKey}`);

    if (actHrsTd) actHrsTd.textContent = day.actualHoursFormatted;
    if (diffCellTd) {
        const diffClass = day.diffMinutes < 0 ? 'badge-diff-minus' : (day.diffMinutes > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
        const diffSign = day.diffMinutes < 0 ? '-' : (day.diffMinutes > 0 ? '+' : '');
        diffCellTd.innerHTML = `<span class="${diffClass}">${diffSign}${minsToHHMM(Math.abs(day.diffMinutes))}</span>`;
    }
}

function updateSubtotalRow(emp) {
    const subActTd = document.getElementById(`subActHrs_${emp.employeeId}`);
    const subDiffTd = document.getElementById(`subDiffCell_${emp.employeeId}`);
    const subAdjTd = document.getElementById(`subAdjAmt_${emp.employeeId}`);

    if (subActTd) subActTd.textContent = emp.totalActualHoursFormatted;
    if (subDiffTd) {
        const diffClass = emp.netDiffMinutes < 0 ? 'badge-diff-minus' : (emp.netDiffMinutes > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
        const diffSign = emp.netDiffMinutes < 0 ? '-' : (emp.netDiffMinutes > 0 ? '+' : '');
        const diffIcon = emp.netDiffMinutes < 0 ? '<i class="fas fa-arrow-down me-1"></i>' : (emp.netDiffMinutes > 0 ? '<i class="fas fa-arrow-up me-1"></i>' : '');
        subDiffTd.innerHTML = `<span class="${diffClass}">${diffIcon}${diffSign}${minsToHHMM(Math.abs(emp.netDiffMinutes))}</span>`;
    }
    if (subAdjTd) {
        subAdjTd.textContent = `PKR ${emp.estimatedAdjustmentAmount ? emp.estimatedAdjustmentAmount.toLocaleString() : '0'}`;
        const adjClass = emp.estimatedAdjustmentAmount < 0 ? 'badge-diff-minus' : (emp.estimatedAdjustmentAmount > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
        subAdjTd.className = `badge ${adjClass} py-1 px-2`;
    }
}

function updateSummaryTableRow(emp) {
    const actHrsTd = document.getElementById(`sumActHrs_${emp.employeeId}`);
    const diffColTd = document.getElementById(`sumDiffCol_${emp.employeeId}`);
    const adjAmtTd = document.getElementById(`sumAdjAmt_${emp.employeeId}`);

    if (actHrsTd) actHrsTd.textContent = emp.totalActualHoursFormatted;
    if (diffColTd) {
        const diffClass = emp.netDiffMinutes < 0 ? 'badge-diff-minus' : (emp.netDiffMinutes > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
        const diffSign = emp.netDiffMinutes < 0 ? '-' : (emp.netDiffMinutes > 0 ? '+' : '');
        const diffIcon = emp.netDiffMinutes < 0 ? '<i class="fas fa-arrow-down me-1"></i>' : (emp.netDiffMinutes > 0 ? '<i class="fas fa-arrow-up me-1"></i>' : '');
        diffColTd.innerHTML = `<span class="${diffClass}">${diffIcon}${diffSign}${minsToHHMM(Math.abs(emp.netDiffMinutes))}</span>`;
    }
    if (adjAmtTd) {
        adjAmtTd.textContent = emp.estimatedAdjustmentAmount ? emp.estimatedAdjustmentAmount.toLocaleString() : '0';
        adjAmtTd.className = `text-end fw-bold ${emp.estimatedAdjustmentAmount < 0 ? 'text-danger' : (emp.estimatedAdjustmentAmount > 0 ? 'text-success' : 'text-muted')}`;
    }
}

function updateTopKPIs() {
    let totAdvMins = 0;
    let totActMins = 0;
    let totShortMins = 0;
    let totOtMins = 0;
    let totAdjAmt = 0;

    reconciliationData.forEach(e => {
        totAdvMins += e.totalAdvanceMinutes || 0;
        totActMins += e.totalActualMinutes || 0;
        totAdjAmt += e.estimatedAdjustmentAmount || 0;
        if (e.netDiffMinutes < 0) totShortMins += Math.abs(e.netDiffMinutes);
        if (e.netDiffMinutes > 0) totOtMins += e.netDiffMinutes;
    });

    const netOverall = totActMins - totAdvMins;
    const netSign = netOverall < 0 ? '-' : (netOverall > 0 ? '+' : '');

    document.getElementById('kpiTotalEmp').textContent = reconciliationData.length;
    document.getElementById('kpiAdvHrs').textContent = minsToHHMM(totAdvMins);
    document.getElementById('kpiActHrs').textContent = minsToHHMM(totActMins);

    const kpiNetDiff = document.getElementById('kpiNetDiff');
    kpiNetDiff.textContent = `${netSign}${minsToHHMM(Math.abs(netOverall))}`;
    kpiNetDiff.style.color = netOverall < 0 ? '#dc2626' : (netOverall > 0 ? '#16a34a' : '#475569');

    // Keep summary table footer in sync
    const footAct = document.getElementById('footActHrs');
    const footDiff = document.getElementById('footDiffHrs');
    const footAdj = document.getElementById('footAdjAmt');
    if (footAct) footAct.textContent = minsToHHMM(totActMins);
    if (footDiff) footDiff.innerHTML = `<span class="${netOverall < 0 ? 'badge-diff-minus' : 'badge-diff-plus'}">${netSign}${minsToHHMM(Math.abs(netOverall))}</span>`;
    if (footAdj) footAdj.textContent = totAdjAmt.toLocaleString();
}

// Copy this specific day's timing to all days of this employee
function applyDayToAllDays(empId, dateStr) {
    const emp = reconciliationData.find(e => e.employeeId === empId);
    if (!emp) return;
    const sourceDay = emp.days.find(d => d.date === dateStr);
    if (!sourceDay) return;

    const timeLabel = (sourceDay.actualCheckIn && sourceDay.actualCheckOut)
        ? `${sourceDay.actualCheckIn} - ${sourceDay.actualCheckOut}`
        : (sourceDay.actualStatus === 'Absent' ? 'ABSENT' : 'cleared timing');

    if (!confirm(`Apply [${timeLabel}] from ${sourceDay.date} to ALL ${emp.days.length} days of ${emp.name}?`)) {
        return;
    }

    emp.days.forEach(d => {
        d.actualCheckIn = sourceDay.actualCheckIn;
        d.actualCheckOut = sourceDay.actualCheckOut;
        d.actualStatus = sourceDay.actualStatus;
        d.remarks = sourceDay.remarks;
        recalculateDay(d);
    });

    recalculateEmployeeSummary(emp);
    updateSummaryTableRow(emp);
    updateSubtotalRow(emp);

    const currentFilter = (window.jQuery ? $('#matrixEmployeeFilter').val() : document.getElementById('matrixEmployeeFilter')?.value) || 'all';
    const currentQuery = document.getElementById('dailyEmployeeSearch')?.value || '';
    renderMatrixTable(currentFilter, currentQuery);

    updateTopKPIs();
    showUnsavedIndicator();
    showToast(`Copied [${timeLabel}] to all days for ${emp.name} (${emp.code})!`);
}

// Copy all advance timings to actual for a single employee
function copyEmployeeAdvance(empId) {
    const emp = reconciliationData.find(e => e.employeeId === empId);
    if (!emp) return;

    if (!confirm(`Pre-fill advance timings to actual for ${emp.name} (${emp.code}) across all days?`)) {
        return;
    }

    emp.days.forEach(d => {
        d.actualCheckIn = d.advanceCheckIn;
        d.actualCheckOut = d.advanceCheckOut;
        d.actualStatus = d.advanceStatus;
        recalculateDay(d);
    });

    recalculateEmployeeSummary(emp);
    updateSummaryTableRow(emp);
    updateSubtotalRow(emp);

    const currentFilter = (window.jQuery ? $('#matrixEmployeeFilter').val() : document.getElementById('matrixEmployeeFilter')?.value) || 'all';
    const currentQuery = document.getElementById('dailyEmployeeSearch')?.value || '';
    renderMatrixTable(currentFilter, currentQuery);

    updateTopKPIs();
    showUnsavedIndicator();
    showToast(`Advance timings copied for ${emp.name} (${emp.code})!`);
}

// Copy All Advance to Actual (1-click helper)
function copyAllAdvanceToActual() {
    if (!confirm('Are you sure you want to pre-fill ALL employees with their advance timings? You can then modify only the changed days.')) return;

    reconciliationData.forEach(emp => {
        emp.days.forEach(day => {
            day.actualCheckIn = day.advanceCheckIn;
            day.actualCheckOut = day.advanceCheckOut;
            day.actualStatus = day.advanceStatus;
            recalculateDay(day);
        });
        recalculateEmployeeSummary(emp);
    });

    renderSummaryTable();
    const dailySearch = document.getElementById('dailyEmployeeSearch');
    const query = dailySearch ? dailySearch.value : '';
    renderMatrixTable(document.getElementById('matrixEmployeeFilter').value, query);
    updateTopKPIs();
    showUnsavedIndicator();
}

// Clear All Actual Times to Empty (--:--) across all employees
async function clearAllActual() {
    if (!confirm('Are you sure you want to CLEAR all actual times to empty (--:--) for all employees?')) return;

    const branch = document.getElementById('filterBranch').value;
    const from = document.getElementById('filterFromDate').value;
    const to = document.getElementById('filterToDate').value;

    reconciliationData.forEach(emp => {
        emp.days.forEach(day => {
            day.actualCheckIn = '';
            day.actualCheckOut = '';
            day.actualStatus = 'Absent';
            day.remarks = '';
            recalculateDay(day);
        });
        recalculateEmployeeSummary(emp);
    });

    renderSummaryTable();
    const currentFilter = (window.jQuery ? $('#matrixEmployeeFilter').val() : document.getElementById('matrixEmployeeFilter')?.value) || 'all';
    const currentQuery = document.getElementById('dailyEmployeeSearch')?.value || '';
    renderMatrixTable(currentFilter, currentQuery);
    updateTopKPIs();
    showUnsavedIndicator();

    // Also clear from database if previously saved
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/attendance-reconciliation/clear', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ from, to, branch })
        });
        const json = await res.json();
        if (json.success && json.deletedCount > 0) {
            showToast(`Reset complete: cleared ${json.deletedCount} saved records from database!`);
        } else {
            showToast('All actual times cleared to empty (--:--)! Click "Save Changes" to save.');
        }
    } catch (e) {
        showToast('All actual times cleared to empty (--:--)! Click "Save Changes" to save.');
    }
}

// Clear a Single Employee's Actual Times to Empty (--:--)
function clearEmployeeActual(empId) {
    const emp = reconciliationData.find(e => e.employeeId === empId);
    if (!emp) return;

    emp.days.forEach(day => {
        day.actualCheckIn = '';
        day.actualCheckOut = '';
        day.actualStatus = 'Absent';
        day.remarks = '';
        recalculateDay(day);
    });

    recalculateEmployeeSummary(emp);
    updateSummaryTableRow(emp);
    updateSubtotalRow(emp);

    const currentFilter = (window.jQuery ? $('#matrixEmployeeFilter').val() : document.getElementById('matrixEmployeeFilter')?.value) || 'all';
    const currentQuery = document.getElementById('dailyEmployeeSearch')?.value || '';
    renderMatrixTable(currentFilter, currentQuery);
    updateTopKPIs();
    showUnsavedIndicator();
    showToast(`Actual times cleared for ${emp.name} (${emp.code})!`);
}

// ─── Modal Single Employee Editor ───

function openEmployeeDetailModal(empId) {
    const emp = reconciliationData.find(e => e.employeeId === empId);
    if (!emp) return;
    activeModalEmployee = emp;

    document.getElementById('mEmpName').textContent = `${emp.name} (${emp.code})`;
    document.getElementById('mEmpMeta').textContent = `Branch: ${emp.branch} | Dept: ${emp.department} | Basic: PKR ${emp.basicSalary.toLocaleString()}`;
    document.getElementById('mEmpDuty').textContent = `Duty: ${emp.dutyHrs || emp.totalHrs || 12} Hrs`;

    renderModalTable();

    const modal = new bootstrap.Modal(document.getElementById('empDetailModal'));
    modal.show();
}

function renderModalTable() {
    if (!activeModalEmployee) return;
    const tbody = document.getElementById('modalTableBody');
    let html = '';

    activeModalEmployee.days.forEach((day, idx) => {
        const diffClass = day.diffMinutes < 0 ? 'badge-diff-minus' : (day.diffMinutes > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
        const diffSign = day.diffMinutes < 0 ? '-' : (day.diffMinutes > 0 ? '+' : '');

        html += `
        <tr data-m-date="${day.date}">
            <td class="text-center font-monospace">${day.date}</td>
            <td class="text-center fw-bold small ${day.dayName === 'Sun' ? 'text-danger' : 'text-secondary'}">${day.dayName}</td>
            <td class="cell-adv font-monospace">${formatTimeAMPM(day.advanceCheckIn)}</td>
            <td class="cell-adv font-monospace">${formatTimeAMPM(day.advanceCheckOut)}</td>
            <td class="cell-adv font-monospace">${day.advanceHoursFormatted}</td>
            <td class="cell-adv"><span class="badge bg-secondary">${day.advanceStatus}</span></td>
            
            <td class="cell-act px-1">
                <input type="time" class="form-control form-control-xs text-center fw-bold" 
                       value="${convertTo24Hour(day.actualCheckIn)}" 
                       oninput="onModalTimeChange('${day.date}', 'in', this.value)">
            </td>
            <td class="cell-act px-1">
                <input type="time" class="form-control form-control-xs text-center fw-bold" 
                       value="${convertTo24Hour(day.actualCheckOut)}" 
                       oninput="onModalTimeChange('${day.date}', 'out', this.value)">
            </td>
            <td class="cell-act font-monospace fw-bold" id="mActHrs_${day.date}">${day.actualHoursFormatted}</td>
            <td class="cell-act px-1">
                <select class="form-select form-select-xs fw-bold" onchange="onModalStatusChange('${day.date}', this.value)">
                    <option value="Present" ${day.actualStatus === 'Present' ? 'selected' : ''}>Present</option>
                    <option value="Absent" ${day.actualStatus === 'Absent' ? 'selected' : ''}>Absent</option>
                    <option value="Leave" ${day.actualStatus === 'Leave' ? 'selected' : ''}>Leave</option>
                    <option value="Half Day" ${day.actualStatus === 'Half Day' ? 'selected' : ''}>Half Day</option>
                </select>
            </td>

            <td class="cell-diff" id="mDiffCell_${day.date}">
                <span class="${diffClass}">${diffSign}${minsToHHMM(Math.abs(day.diffMinutes))}</span>
            </td>
            <td>
                <input type="text" class="form-control form-control-xs" value="${day.remarks || ''}" 
                       onchange="onModalRemarksChange('${day.date}', this.value)" style="height:28px; font-size:0.8rem;">
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
    updateModalFooterSummary();
}

function onModalTimeChange(dateStr, field, value) {
    if (!activeModalEmployee) return;
    const day = activeModalEmployee.days.find(d => d.date === dateStr);
    if (!day) return;

    if (field === 'in') day.actualCheckIn = value ? formatTimeAMPM(value) : '';
    if (field === 'out') day.actualCheckOut = value ? formatTimeAMPM(value) : '';

    if (day.actualCheckIn || day.actualCheckOut) {
        if (day.actualStatus === 'Absent') {
            day.actualStatus = 'Present';
            const row = document.querySelector(`tr[data-m-date="${dateStr}"]`);
            if (row) {
                const sel = row.querySelector('.form-select-xs') || row.querySelector('select');
                if (sel) sel.value = 'Present';
            }
        }
    }

    recalculateDay(day);
    recalculateEmployeeSummary(activeModalEmployee);

    const actHrsTd = document.getElementById(`mActHrs_${day.date}`);
    const diffTd = document.getElementById(`mDiffCell_${day.date}`);
    if (actHrsTd) actHrsTd.textContent = day.actualHoursFormatted;
    if (diffTd) {
        const diffClass = day.diffMinutes < 0 ? 'badge-diff-minus' : (day.diffMinutes > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
        const diffSign = day.diffMinutes < 0 ? '-' : (day.diffMinutes > 0 ? '+' : '');
        diffTd.innerHTML = `<span class="${diffClass}">${diffSign}${minsToHHMM(Math.abs(day.diffMinutes))}</span>`;
    }
    updateModalFooterSummary();
    showUnsavedIndicator();
}

function onModalStatusChange(dateStr, statusVal) {
    if (!activeModalEmployee) return;
    const day = activeModalEmployee.days.find(d => d.date === dateStr);
    if (!day) return;

    day.actualStatus = statusVal;
    if (statusVal === 'Absent') {
        day.actualCheckIn = '';
        day.actualCheckOut = '';
    }

    recalculateDay(day);
    recalculateEmployeeSummary(activeModalEmployee);
    renderModalTable();
    showUnsavedIndicator();
}

function onModalRemarksChange(dateStr, val) {
    if (!activeModalEmployee) return;
    const day = activeModalEmployee.days.find(d => d.date === dateStr);
    if (day) {
        day.remarks = val.trim();
        showUnsavedIndicator();
    }
}

function updateModalFooterSummary() {
    if (!activeModalEmployee) return;
    const netMins = activeModalEmployee.netDiffMinutes;
    const netSign = netMins < 0 ? '-' : (netMins > 0 ? '+' : '');
    const badge = document.getElementById('mEmpNetDiff');
    badge.className = netMins < 0 ? 'badge-diff-minus' : (netMins > 0 ? 'badge-diff-plus' : 'badge-diff-zero');
    badge.textContent = `${netSign}${minsToHHMM(Math.abs(netMins))}`;
}

function copyModalAdvanceToActual() {
    if (!activeModalEmployee) return;
    activeModalEmployee.days.forEach(day => {
        day.actualCheckIn = day.advanceCheckIn;
        day.actualCheckOut = day.advanceCheckOut;
        day.actualStatus = day.advanceStatus;
        recalculateDay(day);
    });
    recalculateEmployeeSummary(activeModalEmployee);
    renderModalTable();
    showUnsavedIndicator();
}

function saveModalChanges() {
    if (!activeModalEmployee) return;
    updateSummaryTableRow(activeModalEmployee);
    updateRowUI(activeModalEmployee.employeeId, activeModalEmployee.days[0]);
    updateSubtotalRow(activeModalEmployee);
    const dailySearch = document.getElementById('dailyEmployeeSearch');
    const query = dailySearch ? dailySearch.value : '';
    renderMatrixTable(document.getElementById('matrixEmployeeFilter').value, query);
    updateTopKPIs();

    bootstrap.Modal.getInstance(document.getElementById('empDetailModal')).hide();
    saveSingleEmployee(activeModalEmployee.employeeId);
}

// ─── SAVE HANDLERS ("how i save ?") ───

function showUnsavedIndicator() {
    const badge = document.getElementById('unsavedBadge');
    if (badge) {
        badge.style.display = 'inline-block';
        badge.className = 'badge bg-warning text-dark ms-1';
        badge.textContent = 'Unsaved Changes';
    }
}

function showToast(message) {
    const toastEl = document.getElementById('saveToast');
    const toastBody = document.getElementById('toastMessage');
    if (toastEl && toastBody) {
        toastBody.innerHTML = `<i class="fas fa-check-circle text-success me-2"></i> ${message}`;
        const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
        toast.show();
    }
    const badge = document.getElementById('unsavedBadge');
    if (badge) {
        badge.style.display = 'inline-block';
        badge.className = 'badge bg-success text-white ms-1';
        badge.textContent = 'All Saved ✓';
        setTimeout(() => { badge.style.display = 'none'; }, 4000);
    }
}

// Save a Single Employee directly
async function saveSingleEmployee(empId) {
    const branch = document.getElementById('filterBranch').value;
    if (!branch) {
        alert('Please select a Branch first.');
        return;
    }
    const emp = reconciliationData.find(e => e.employeeId === empId);
    if (!emp) return;

    const recordsToSave = emp.days.map(d => ({
        employeeId: emp.employeeId,
        branch: emp.branch,
        date: d.date,
        advanceCheckIn: d.advanceCheckIn,
        advanceCheckOut: d.advanceCheckOut,
        advanceMinutes: d.advanceMinutes,
        advanceStatus: d.advanceStatus,
        actualCheckIn: d.actualCheckIn,
        actualCheckOut: d.actualCheckOut,
        actualMinutes: d.actualMinutes,
        actualStatus: d.actualStatus,
        remarks: d.remarks
    }));

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/attendance-reconciliation/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                periodFrom: currentPeriod.from,
                periodTo: currentPeriod.to,
                records: recordsToSave
            })
        });

        const json = await res.json();
        if (json.success) {
            emp.allDaysSaved = true;
            renderSummaryTable();
            showToast(`Saved records for ${emp.name} (${emp.code}) successfully!`);
        } else {
            alert('Save failed: ' + (json.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error saving single employee:', err);
        alert('Network error while saving employee records.');
    }
}

// Bulk Save All Changes
async function saveAllReconciliation() {
    const branch = document.getElementById('filterBranch').value;
    if (!branch) {
        alert('Please select a Branch first.');
        return;
    }

    const saveBtn = document.getElementById('btnSaveRecon');
    const oldHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Saving...';
    }

    // Flatten all daily records across all employees
    const recordsToSave = [];
    reconciliationData.forEach(emp => {
        emp.days.forEach(d => {
            recordsToSave.push({
                employeeId: emp.employeeId,
                branch: emp.branch,
                date: d.date,
                advanceCheckIn: d.advanceCheckIn,
                advanceCheckOut: d.advanceCheckOut,
                advanceMinutes: d.advanceMinutes,
                advanceStatus: d.advanceStatus,
                actualCheckIn: d.actualCheckIn,
                actualCheckOut: d.actualCheckOut,
                actualMinutes: d.actualMinutes,
                actualStatus: d.actualStatus,
                remarks: d.remarks
            });
        });
    });

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/attendance-reconciliation/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                periodFrom: currentPeriod.from,
                periodTo: currentPeriod.to,
                records: recordsToSave
            })
        });

        const json = await res.json();
        if (json.success) {
            reconciliationData.forEach(e => e.allDaysSaved = true);
            renderSummaryTable();
            showToast(`Attendance reconciliation saved successfully! (${recordsToSave.length} entries saved)`);
        } else {
            alert('Save failed: ' + (json.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error saving:', err);
        alert('Network error while saving reconciliation.');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = oldHtml;
        }
    }
}

// Print Handlers
function openPrintView(mode) {
    const from = document.getElementById('filterFromDate').value;
    const to = document.getElementById('filterToDate').value;
    const branch = document.getElementById('filterBranch').value;
    const dept = document.getElementById('filterDept').value;

    if (!branch) {
        alert('Please select a Branch first to print the report.');
        document.getElementById('filterBranch').focus();
        return;
    }

    let url = `/print-advance-attendance-reconciliation?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&mode=${mode}&branch=${encodeURIComponent(branch)}`;
    if (dept) url += `&department=${encodeURIComponent(dept)}`;

    window.open(url, '_blank');
}

function printSingleSlip(empId) {
    const from = document.getElementById('filterFromDate').value;
    const to = document.getElementById('filterToDate').value;
    const branch = document.getElementById('filterBranch').value;

    let url = `/print-advance-attendance-reconciliation?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&employee=${encodeURIComponent(empId)}&mode=single`;
    if (branch) url += `&branch=${encodeURIComponent(branch)}`;
    window.open(url, '_blank');
}

function printFocusedEmployeeSlip() {
    const selVal = (window.jQuery ? $('#matrixEmployeeFilter').val() : document.getElementById('matrixEmployeeFilter')?.value) || 'all';
    if (!selVal || selVal === 'all') {
        alert('Please select a specific employee from the "Search Employee" dropdown first, or click the "Slip" button on any employee\'s subtotal row below.');
        return;
    }
    printSingleSlip(selVal);
}

function printActiveModalSlip() {
    if (activeModalEmployee) {
        printSingleSlip(activeModalEmployee.employeeId);
    }
}

// ─── Explicit Global Window Exports for HTML inline attributes ───
window.printFocusedEmployeeSlip = printFocusedEmployeeSlip;
window.printSingleSlip = printSingleSlip;
window.printActiveModalSlip = printActiveModalSlip;
window.saveSingleEmployee = saveSingleEmployee;
window.copyEmployeeAdvance = copyEmployeeAdvance;
window.markDayAbsent = markDayAbsent;
window.copyDayAdvance = copyDayAdvance;
window.applyDayToAllDays = applyDayToAllDays;
window.onMatrixTimeChange = onMatrixTimeChange;
window.onMatrixStatusChange = onMatrixStatusChange;
window.onMatrixRemarksChange = onMatrixRemarksChange;
window.focusEmployeeInMatrix = focusEmployeeInMatrix;
window.openEmployeeDetailModal = openEmployeeDetailModal;
window.saveAllReconciliation = saveAllReconciliation;
window.clearAllActual = clearAllActual;
window.clearEmployeeActual = clearEmployeeActual;
