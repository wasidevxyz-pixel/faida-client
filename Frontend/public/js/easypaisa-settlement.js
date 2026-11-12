/**
 * EasyPaisa Executive Settlement & Reconciliation Controller
 * D.Watson Group of Pharmacies — ERP Platform
 */

const state = {
    startDate: '',
    endDate: '',
    branch: 'All Branches',
    department: 'All Departments',
    status: 'all', // 'all', 'pending', 'cleared', 'discrepancy'
    search: '',
    currentView: 'summary', // 'summary', 'department', 'detail'
    summaryData: [],
    deptData: [],
    detailData: [],
    kpis: {},
    branches: [],
    departments: [],
    easypaisaDepartments: [],
    branchDepartmentMap: {},
    historyBatches: []
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initUserSession();
    initDefaultDates();
    setupEventListeners();
    fetchSettlementData();
});

// Setup User Profile
function initUserSession() {
    try {
        const rawUser = localStorage.getItem('user');
        if (rawUser) {
            const user = JSON.parse(rawUser);
            const userEl = document.getElementById('userName');
            if (userEl) userEl.textContent = user.name || user.email || 'User';
        }
    } catch (e) {
        console.error('Session load error', e);
    }
}

// Format Currency as PKR
function formatPKR(val) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return 'Rs. ' + Math.round(Number(val)).toLocaleString('en-PK');
}

// Format Display Date (DD/MM/YYYY)
function formatDisplayDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const parts = String(dateStr).split('T')[0].split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return new Date(dateStr).toLocaleDateString('en-GB');
    } catch {
        return dateStr;
    }
}

// Handle Auth Token Expiration
function handleAuthError(res) {
    if (res && res.status === 401) {
        localStorage.removeItem('token');
        alert('Session expired. Please log in again.');
        window.location.href = '/login';
        return true;
    }
    return false;
}

// Initialize Default Date Range (1st of current month to Today)
function initDefaultDates() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    state.startDate = firstDay.toISOString().split('T')[0];
    state.endDate = today.toISOString().split('T')[0];

    document.getElementById('filterStartDate').value = state.startDate;
    document.getElementById('filterEndDate').value = state.endDate;

    const modalStart = document.getElementById('modalClearStartDate');
    const modalEnd = document.getElementById('modalClearEndDate');
    if (modalStart) modalStart.value = state.startDate;
    if (modalEnd) modalEnd.value = state.endDate;
}

// Setup Event Listeners
function setupEventListeners() {
    // Preset Buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            applyPreset(e.target.dataset.preset);
        });
    });

    // Filter Buttons
    document.getElementById('btnApplyFilter')?.addEventListener('click', () => {
        state.startDate = document.getElementById('filterStartDate').value;
        state.endDate = document.getElementById('filterEndDate').value;
        state.branch = document.getElementById('filterBranch').value;
        state.department = document.getElementById('filterDepartment').value;
        state.status = document.getElementById('filterStatus').value;
        fetchSettlementData();
    });

    // Auto-fetch when changing Branch filter dropdown
    document.getElementById('filterBranch')?.addEventListener('change', (e) => {
        state.branch = e.target.value;
        fetchSettlementData();
    });

    // Auto-fetch when changing Department filter dropdown
    document.getElementById('filterDepartment')?.addEventListener('change', (e) => {
        state.department = e.target.value;
        fetchSettlementData();
    });

    // Auto-fetch when changing Status filter dropdown
    document.getElementById('filterStatus')?.addEventListener('change', (e) => {
        state.status = e.target.value;
        fetchSettlementData();
    });

    document.getElementById('btnResetFilter')?.addEventListener('click', () => {
        initDefaultDates();
        document.getElementById('filterBranch').value = 'All Branches';
        document.getElementById('filterDepartment').value = 'All Departments';
        document.getElementById('filterStatus').value = 'all';
        document.getElementById('filterSearch').value = '';
        state.branch = 'All Branches';
        state.department = 'All Departments';
        state.status = 'all';
        state.search = '';
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.preset-btn[data-preset="thisMonth"]')?.classList.add('active');
        fetchSettlementData();
    });

    // Quick Live Search
    document.getElementById('filterSearch')?.addEventListener('input', (e) => {
        state.search = e.target.value.toLowerCase().trim();
        filterTableDataLocally();
    });

    // Top Action Buttons
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        fetchSettlementData();
    });

    document.getElementById('btnPrintReport')?.addEventListener('click', () => {
        printReport();
    });

    document.getElementById('btnExportPDF')?.addEventListener('click', () => {
        exportPDF();
    });

    document.getElementById('btnExportExcel')?.addEventListener('click', () => {
        exportExcel();
    });

    // Boss Clear Modal Triggers
    document.getElementById('btnOpenClearModal')?.addEventListener('click', () => {
        openClearModal();
    });

    // Unclear Range Modal Triggers
    document.getElementById('btnOpenUnclearModal')?.addEventListener('click', () => {
        openUnclearModal();
    });

    // History Modal Trigger
    document.getElementById('btnViewHistory')?.addEventListener('click', () => {
        openHistoryModal();
    });

    // Clear Form Submission
    document.getElementById('clearForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitBossClearance();
    });

    // Unclear Form Submission
    document.getElementById('unclearForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitUnclearRange();
    });

    // Sign Out
    document.getElementById('btnLogout')?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    });
}

// Preset Handlers
function applyPreset(preset) {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (preset === 'today') {
        // start and end are today
    } else if (preset === 'yesterday') {
        start.setDate(today.getDate() - 1);
        end.setDate(today.getDate() - 1);
    } else if (preset === 'last7') {
        start.setDate(today.getDate() - 6);
    } else if (preset === 'thisMonth') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (preset === 'lastMonth') {
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
    }

    state.startDate = start.toISOString().split('T')[0];
    state.endDate = end.toISOString().split('T')[0];

    document.getElementById('filterStartDate').value = state.startDate;
    document.getElementById('filterEndDate').value = state.endDate;
    fetchSettlementData();
}

// Quick Status Switcher (from Banner)
function setQuickStatus(status) {
    state.status = status;
    const sel = document.getElementById('filterStatus');
    if (sel) sel.value = status;
    fetchSettlementData();
}

// Fetch Main Settlement Data
async function fetchSettlementData() {
    const token = localStorage.getItem('token');
    const query = new URLSearchParams({
        startDate: state.startDate,
        endDate: state.endDate,
        branch: state.branch,
        department: state.department,
        status: state.status,
        t: Date.now()
    });

    showLoadingState();

    try {
        const res = await fetch(`/api/v1/easypaisa-settlement/data?${query}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (handleAuthError(res)) return;

        const json = await res.json();
        if (json.success && json.data) {
            state.summaryData = json.data.summary || [];
            state.deptData = json.data.departmentSummary || [];
            state.detailData = json.data.details || [];
            state.kpis = json.data.kpis || {};
            state.branches = json.data.branches || [];
            state.departments = json.data.departments || [];
            state.easypaisaDepartments = json.data.easypaisaDepartments || [];
            state.branchDepartmentMap = json.data.branchDepartmentMap || {};

            updateBranchDropdown(state.branches);
            updateDeptDropdown(state.departments);
            renderKPIs(state.kpis);
            renderSummaryTable(state.summaryData);
            renderDeptTable(state.deptData);
            renderDetailTable(state.detailData);
            renderDashboardCharts(state.summaryData, state.deptData);
            updatePrintHeaders();
        } else {
            alert(json.message || 'Error loading settlement data');
        }
    } catch (e) {
        console.error('Failed to fetch settlement data', e);
        alert('Server connection error while loading EasyPaisa data.');
    }
}

// Populate Branch Select Dropdown
function updateBranchDropdown(branches) {
    const sel = document.getElementById('filterBranch');
    const modalSel = document.getElementById('modalClearBranch');
    if (!sel) return;

    const currentVal = sel.value || state.branch;
    sel.innerHTML = '<option value="All Branches">🌐 All Branches</option>';

    const unclearModalSel = document.getElementById('modalUnclearBranch');
    if (modalSel) modalSel.innerHTML = '<option value="All Branches">🌐 All Branches</option>';
    if (unclearModalSel) unclearModalSel.innerHTML = '<option value="All Branches">🌐 All Branches</option>';

    branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = `📍 ${b}`;
        if (b === currentVal) opt.selected = true;
        sel.appendChild(opt);

        if (modalSel) {
            const mOpt = document.createElement('option');
            mOpt.value = b;
            mOpt.textContent = `📍 ${b}`;
            modalSel.appendChild(mOpt);
        }

        if (unclearModalSel) {
            const uOpt = document.createElement('option');
            uOpt.value = b;
            uOpt.textContent = `📍 ${b}`;
            unclearModalSel.appendChild(uOpt);
        }
    });

    if (currentVal && branches.includes(currentVal)) {
        sel.value = currentVal;
    }
}

// Populate Department Select Dropdown
function updateDeptDropdown(departments) {
    const sel = document.getElementById('filterDepartment');
    const modalSel = document.getElementById('modalClearDept');
    if (!sel) return;

    const currentVal = sel.value || state.department;
    sel.innerHTML = '<option value="All Departments">🏬 All Departments</option>';

    if (modalSel) modalSel.innerHTML = '<option value="All Departments">🏬 All Departments</option>';

    departments.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        if (d === currentVal) opt.selected = true;
        sel.appendChild(opt);

        if (modalSel) {
            const mOpt = document.createElement('option');
            mOpt.value = d;
            mOpt.textContent = d;
            modalSel.appendChild(mOpt);
        }
    });

    if (currentVal && departments.includes(currentVal)) {
        sel.value = currentVal;
    }
}

// Render Top KPI Cards & Status Banner
function renderKPIs(kpis) {
    const gross = kpis.totalSystemGross || 0;
    document.getElementById('kpiSystemGross').textContent = formatPKR(gross);
    const trxEl = document.getElementById('kpiTrxCountText');
    if (trxEl) trxEl.textContent = `${kpis.totalTrxCount || 0} counter receipts`;

    // Salman Sb Amount: Only show total if at least 1 row entered, else 0
    document.getElementById('kpiSalmanTotal').textContent = formatPKR(kpis.totalSalmanAmount);
    const salmanSubText = document.getElementById('kpiSalmanSubText');
    if (salmanSubText) {
        salmanSubText.textContent = kpis.talliedRowsCount > 0 
            ? `${kpis.talliedRowsCount} dates verified` 
            : 'Manual tally pending';
    }

    // Variance / Difference Dynamic Styling
    const cardDiff = document.getElementById('cardDiff');
    const iconDiffBadge = document.getElementById('iconDiffBadge');
    const iconDiff = document.getElementById('iconDiff');
    const varianceEl = document.getElementById('kpiVariance');
    const varianceSub = document.getElementById('kpiVarianceSub');
    const diff = kpis.totalDiscrepancy || 0;

    if (kpis.talliedRowsCount === 0) {
        varianceEl.textContent = '—';
        varianceEl.className = 'kpi-value text-muted';
        if (cardDiff) cardDiff.className = 'kpi-card kpi-diff';
        if (iconDiffBadge) iconDiffBadge.className = 'kpi-icon-badge kpi-icon-diff';
        if (iconDiff) iconDiff.className = 'fas fa-scale-balanced';
        if (varianceSub) varianceSub.innerHTML = '<span class="kpi-sub-pill pill-diff-awaiting"><i class="fas fa-hourglass-start me-1"></i>Awaiting Salman Sb Entry</span>';
    } else if (diff === 0) {
        varianceEl.textContent = 'Rs. 0';
        varianceEl.className = 'kpi-value text-success';
        if (cardDiff) cardDiff.className = 'kpi-card kpi-diff';
        if (iconDiffBadge) iconDiffBadge.className = 'kpi-icon-badge kpi-icon-diff';
        if (iconDiff) iconDiff.className = 'fas fa-circle-check text-success';
        if (varianceSub) varianceSub.innerHTML = '<span class="kpi-sub-pill pill-diff-balanced"><i class="fas fa-circle-check me-1"></i>100% Balanced</span>';
    } else if (diff < 0) {
        varianceEl.textContent = formatPKR(diff);
        varianceEl.className = 'kpi-value text-danger';
        if (cardDiff) cardDiff.className = 'kpi-card kpi-diff kpi-diff-deficit';
        if (iconDiffBadge) iconDiffBadge.className = 'kpi-icon-badge kpi-icon-diff-deficit';
        if (iconDiff) iconDiff.className = 'fas fa-triangle-exclamation';
        if (varianceSub) varianceSub.innerHTML = '<span class="kpi-sub-pill pill-diff-deficit"><i class="fas fa-arrow-trend-down me-1"></i>Deficit to Collect</span>';
    } else {
        varianceEl.textContent = `+${formatPKR(diff)}`;
        varianceEl.className = 'kpi-value text-primary';
        if (cardDiff) cardDiff.className = 'kpi-card kpi-diff';
        if (iconDiffBadge) iconDiffBadge.className = 'kpi-icon-badge kpi-icon-salman';
        if (iconDiff) iconDiff.className = 'fas fa-arrow-trend-up';
        if (varianceSub) varianceSub.innerHTML = '<span class="kpi-sub-pill pill-salman"><i class="fas fa-plus-circle me-1"></i>Excess Cash / Tally</span>';
    }

    // Cleared & Pending KPIs with Micro Progress Bar
    const clearedTotal = kpis.totalClearedAmount || 0;
    const pendingTotal = kpis.totalPendingAmount || 0;
    const clearedPct = gross > 0 ? Math.min(100, Math.max(0, (clearedTotal / gross) * 100)).toFixed(1) : 0;
    const pendingPct = gross > 0 ? Math.min(100, Math.max(0, (pendingTotal / gross) * 100)).toFixed(1) : 0;

    document.getElementById('kpiClearedTotal').textContent = formatPKR(clearedTotal);
    const clearedSubText = document.getElementById('kpiClearedSubText');
    if (clearedSubText) clearedSubText.textContent = `${kpis.clearedDatesCount || 0} dates settled / paid (${clearedPct}%)`;
    const clearedProg = document.getElementById('kpiClearedProgress');
    if (clearedProg) clearedProg.style.width = `${clearedPct}%`;

    document.getElementById('kpiPendingTotal').textContent = formatPKR(pendingTotal);
    const pendingSubText = document.getElementById('kpiPendingSubText');
    if (pendingSubText) pendingSubText.textContent = `${kpis.pendingDatesCount || 0} dates awaiting payment (${pendingPct}%)`;
    const pendingProg = document.getElementById('kpiPendingProgress');
    if (pendingProg) pendingProg.style.width = `${pendingPct}%`;

    // Header & Banner Status Highlights
    const headerPill = document.getElementById('headerPendingPill');
    if (headerPill) {
        headerPill.innerHTML = `<i class="fas fa-clock me-1"></i>${kpis.pendingDatesCount || 0} Pending (${formatPKR(kpis.totalPendingAmount)})`;
    }

    const lastClearedText = document.getElementById('lastClearedText');
    if (lastClearedText) {
        lastClearedText.textContent = kpis.lastClearedDate !== 'None yet'
            ? `Settled up to ${formatDisplayDate(kpis.lastClearedDate)}`
            : 'No clearances recorded yet in this range.';
    }

    const pendingAmountSub = document.getElementById('pendingAmountSub');
    if (pendingAmountSub) {
        pendingAmountSub.innerHTML = `<strong>Current Pending:</strong> <span class="text-danger fw-bold">${kpis.pendingDatesCount || 0} Dates</span> totalling <span class="text-dark fw-bold">${formatPKR(kpis.totalPendingAmount)}</span> awaiting Boss settlement.`;
    }

    // Counts Badges on Tabs
    const sumBadge = document.getElementById('summaryCountBadge');
    if (sumBadge) sumBadge.textContent = state.summaryData.length;

    const deptBadge = document.getElementById('deptCountBadge');
    if (deptBadge) deptBadge.textContent = state.deptData.length;

    const detBadge = document.getElementById('detailCountBadge');
    if (detBadge) detBadge.textContent = state.detailData.length;
}

// Helper: Normalize branch string for robust comparison
function normalizeBranch(b) {
    if (!b) return '';
    return String(b).replace(/[()]/g, '').trim().toLowerCase();
}

// Helper: Get active EasyPaisa departments for column generation strictly based on selected branch
function getActiveEasypaisaDepartments(branchName) {
    const activeBranch = branchName || state.branch;
    if (activeBranch && activeBranch !== 'All Branches' && state.branchDepartmentMap) {
        const nb = normalizeBranch(activeBranch);
        const branchDepts = state.branchDepartmentMap[nb] || state.branchDepartmentMap[activeBranch];
        if (branchDepts && branchDepts.length > 0) {
            return branchDepts;
        }
    }
    if (state.easypaisaDepartments && state.easypaisaDepartments.length > 0) {
        return state.easypaisaDepartments;
    }
    return ['Pharmacy', 'Cosmetics', 'Grocery'];
}

// Render Summary Table Rows (Matrix View with Department-Wise Manual Columns + Salman Sb Sum + Diff)
function renderSummaryTable(data) {
    const tbody = document.getElementById('summaryTableBody');
    if (!tbody) return;

    const activeBranchFilter = state.branch && state.branch !== 'All Branches' ? state.branch : null;
    const depts = getActiveEasypaisaDepartments(activeBranchFilter);

    // 1. Build Dynamic Table Header (preserving exact system columns, adding department-wise columns)
    const theadRow = document.getElementById('summaryTableHeadRow');
    if (theadRow) {
        let thHtml = `
            <th class="col-date">Date</th>
            <th class="col-branch">Branch</th>
            <th class="col-trx text-center">Trx</th>
            <th class="col-gross text-end">System Gross</th>
            <th class="col-ded text-end">Deduction</th>
            <th class="col-net text-end">System Net</th>
        `;
        depts.forEach(d => {
            thHtml += `
                <th class="col-dept-th text-end" style="background: #0f395f; color: #67e8f9; min-width: 110px;">
                    <i class="fas fa-store me-1 text-info no-print"></i>${d}
                </th>
            `;
        });
        thHtml += `
            <th class="col-salman text-end" style="background: #0c2d48; min-width: 125px;">
                <i class="fas fa-calculator me-1 text-info no-print"></i>Salman Sb (Sum)
            </th>
            <th class="col-diff text-center" style="background: #231942; min-width: 120px;">
                Difference (Diff)
            </th>
            <th class="col-status text-center">Settlem.</th>
            <th class="col-action text-center no-print">Action</th>
        `;
        theadRow.innerHTML = thHtml;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${6 + depts.length + 4}" class="text-center py-5 text-muted">
                    <i class="fas fa-folder-open fa-2x mb-2 d-block text-secondary"></i>
                    No EasyPaisa records found for the selected dates and filters.
                </td>
            </tr>
        `;
        updateSummaryFooter(0, 0, 0, 0, 0, 0, 0, 0, {});
        return;
    }

    let html = '';
    let totalTrx = 0;
    let totalGross = 0;
    let totalDed = 0;
    let totalNet = 0;
    let totalSalman = 0;
    let totalDiff = 0;
    let clearedCount = 0;
    let talliedCount = 0;
    const deptTotals = {};
    depts.forEach(d => { deptTotals[d] = 0; });

    data.forEach(item => {
        totalTrx += item.trxCount;
        totalGross += item.systemGross;
        totalDed += item.systemDeduction;
        totalNet += item.systemNet;

        const deptAmounts = item.departmentAmounts || {};
        let rowDeptSum = 0;
        let hasEnteredAnyDept = false;

        depts.forEach(d => {
            const val = deptAmounts[d];
            if (val !== undefined && val !== null && val !== '') {
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    rowDeptSum += num;
                    hasEnteredAnyDept = true;
                    deptTotals[d] = (deptTotals[d] || 0) + num;
                }
            }
        });

        // Fallback to legacy single salmanAmount if no department amounts were entered
        if (!hasEnteredAnyDept && item.salmanAmount !== null && item.salmanAmount !== undefined) {
            rowDeptSum = item.salmanAmount;
            hasEnteredAnyDept = true;
        }

        const hasEnteredSalman = hasEnteredAnyDept;
        const effectiveSalman = hasEnteredSalman ? rowDeptSum : null;
        const effectiveDiff = hasEnteredSalman ? Math.round(rowDeptSum - item.systemGross) : null;

        if (hasEnteredSalman) {
            totalSalman += rowDeptSum;
            totalDiff += effectiveDiff;
            talliedCount += 1;
        }

        if (item.status === 'cleared') clearedCount += 1;

        // Difference Badge
        let diffBadge = '';
        if (!hasEnteredSalman) {
            diffBadge = `<span class="badge bg-light text-muted border px-2 py-1"><i class="fas fa-hourglass-start me-1"></i>Awaiting Entry</span>`;
        } else if (effectiveDiff === 0) {
            diffBadge = `<span class="badge-diff-zero"><i class="fas fa-check-circle"></i> Matched</span>`;
        } else if (effectiveDiff < 0) {
            diffBadge = `<span class="badge-diff-neg"><i class="fas fa-arrow-down"></i> ${formatPKR(effectiveDiff)}</span>`;
        } else {
            diffBadge = `<span class="badge-diff-pos"><i class="fas fa-arrow-up"></i> +${formatPKR(effectiveDiff)}</span>`;
        }

        // Status Badge
        const statusBadge = item.status === 'cleared' 
            ? `<span class="badge-status-cleared" title="Cleared by ${item.clearedBy || 'Boss'} on ${formatDisplayDate(item.clearedAt)}"><i class="fas fa-check-double"></i> Cleared</span>`
            : `<span class="badge-status-pending"><i class="fas fa-clock"></i> Pending</span>`;

        // Action Buttons
        const actionBtn = item.status === 'cleared'
            ? `<button class="btn btn-warning btn-sm py-0 px-2 fs-7 fw-bold text-dark shadow-sm" onclick="reopenSettlementDate('${item.date}', '${item.branch}')" title="Undo / Unclear back to Pending">
                <i class="fas fa-undo me-1"></i>Unclear
               </button>`
            : `<button class="btn btn-outline-success btn-sm py-0 px-2 fs-7 fw-bold" onclick="quickClearSingleRow('${item.date}', '${item.branch}')" title="Mark this day Cleared">
                <i class="fas fa-check me-1"></i>Clear
               </button>`;

        // Formatted Values for Print and Screen
        const sumPrintVal = effectiveSalman !== null ? formatPKR(effectiveSalman) : '';
        let diffPrintVal = '';
        if (effectiveSalman !== null) {
            diffPrintVal = effectiveDiff === 0 ? '0' : formatPKR(effectiveDiff);
        }
        const statusPrintVal = item.status === 'cleared' ? 'CLEARED' : 'PENDING';

        // Department-wise input cells
        let deptCellsHtml = '';
        const itemNb = normalizeBranch(item.branch);
        const itemAllowedDepts = state.branchDepartmentMap ? (state.branchDepartmentMap[itemNb] || state.branchDepartmentMap[item.branch]) : null;

        depts.forEach(d => {
            const isDeptAllowed = !itemAllowedDepts || itemAllowedDepts.length === 0 || itemAllowedDepts.includes(d);

            if (!isDeptAllowed) {
                deptCellsHtml += `
                    <td class="col-dept-input text-center text-muted" data-dept="${d}">
                        <span class="text-muted small" title="Department not configured for ${item.branch}">—</span>
                        <span class="print-val fw-bold" style="display: none;">—</span>
                    </td>
                `;
                return;
            }

            const dVal = (deptAmounts[d] !== undefined && deptAmounts[d] !== null) ? deptAmounts[d] : '';
            const dPrintVal = (dVal !== '' && !isNaN(dVal)) ? formatPKR(dVal) : '';
            deptCellsHtml += `
                <td class="col-dept-input text-end" data-dept="${d}">
                    <div class="d-flex align-items-center justify-content-end gap-1 no-print">
                        <input type="number" 
                               class="dept-salman-input" 
                               value="${dVal}" 
                               placeholder="0"
                               data-date="${item.date}" 
                               data-branch="${item.branch}"
                               data-dept="${d}"
                               data-system="${item.systemGross}"
                               oninput="handleDeptLiveInput(this)"
                               onblur="handleDeptBlurSave(this)"
                               onkeydown="if(event.key==='Enter') { this.blur(); }">
                    </div>
                    <span class="print-val fw-bold" style="display: none;">${dPrintVal}</span>
                </td>
            `;
        });

        html += `
            <tr id="row_${item.date}_${item.branch}" class="${item.status === 'cleared' ? 'row-cleared' : 'row-pending'}">
                <td class="col-date fw-bold text-dark">${formatDisplayDate(item.date)}</td>
                <td class="col-branch"><span class="badge bg-light text-dark border px-2 py-1"><i class="fas fa-store me-1 text-muted"></i>${item.branch}</span></td>
                <td class="col-trx text-center"><span class="badge ${item.trxCount > 0 ? 'bg-secondary-subtle text-dark' : 'bg-light text-muted'} border rounded-pill">${item.trxCount}</span></td>
                <td class="col-gross text-end fw-bold" style="color: ${item.systemGross > 0 ? '#059669' : '#6b7280'};">${formatPKR(item.systemGross)}</td>
                <td class="col-ded text-end text-muted small">${formatPKR(item.systemDeduction)}</td>
                <td class="col-net text-end fw-bold" style="color: ${item.systemNet > 0 ? '#2563eb' : '#6b7280'};">${formatPKR(item.systemNet)}</td>
                ${deptCellsHtml}
                <td class="col-salman col-salman-sum text-end" id="sum_${item.date}_${item.branch}">
                    <div class="d-flex align-items-center justify-content-end gap-1 no-print">
                        <span class="row-sum-val fw-bold" style="color: ${effectiveSalman !== null ? '#1d4ed8' : '#94a3b8'};">
                            ${effectiveSalman !== null ? formatPKR(effectiveSalman) : '—'}
                        </span>
                        <i class="fas fa-check text-success d-none save-check" id="check_${item.date}_${item.branch}"></i>
                    </div>
                    <span class="print-val fw-bold" style="display: none;">${sumPrintVal}</span>
                </td>
                <td class="col-diff text-center" id="diff_${item.date}_${item.branch}">
                    <span class="no-print">${diffBadge}</span>
                    <span class="print-val fw-bold" style="display: none;">${diffPrintVal}</span>
                </td>
                <td class="col-status text-center">
                    <span class="no-print">${statusBadge}</span>
                    <span class="print-val fw-bold" style="display: none;">${statusPrintVal}</span>
                </td>
                <td class="col-action text-center no-print">${actionBtn}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    updateSummaryFooter(totalTrx, totalGross, totalDed, totalNet, totalSalman, totalDiff, clearedCount, data.length, deptTotals);
}

// Update Summary Table Footer Totals
function updateSummaryFooter(trx, gross, ded, net, salman, diff, cleared, totalRows, deptTotals = {}) {
    const depts = getActiveEasypaisaDepartments();
    const tfootRow = document.getElementById('summaryTableFootRow');
    if (!tfootRow) return;

    let diffBadgeHtml = '';
    if (diff === 0 && salman > 0) {
        diffBadgeHtml = `<span class="badge-diff-zero">Rs. 0</span>`;
    } else if (diff < 0) {
        diffBadgeHtml = `<span class="badge-diff-neg">${formatPKR(diff)}</span>`;
    } else if (diff > 0) {
        diffBadgeHtml = `<span class="badge-diff-pos">+${formatPKR(diff)}</span>`;
    } else {
        diffBadgeHtml = `<span class="text-muted small">—</span>`;
    }

    let deptFootCellsHtml = '';
    depts.forEach(d => {
        const dTot = deptTotals[d] || 0;
        deptFootCellsHtml += `
            <td class="text-end fw-bold col-dept-total" data-dept="${d}" style="color: #0369a1; font-family: 'JetBrains Mono', monospace;">
                ${dTot > 0 ? formatPKR(dTot) : 'Rs. 0'}
            </td>
        `;
    });

    tfootRow.innerHTML = `
        <td colspan="2" class="text-uppercase text-dark fw-bold col-date">Grand Total</td>
        <td class="text-center col-trx" id="footTrxCount">${trx}</td>
        <td class="text-end fw-bold col-gross" id="footSystemGross" style="color: #059669;">${formatPKR(gross)}</td>
        <td class="text-end text-muted col-ded" id="footSystemDed">${formatPKR(ded)}</td>
        <td class="text-end fw-bold text-primary col-net" id="footSystemNet">${formatPKR(net)}</td>
        ${deptFootCellsHtml}
        <td class="text-end fw-bold text-primary col-salman" id="footSalmanTotal" style="font-family: 'JetBrains Mono', monospace;">${formatPKR(salman)}</td>
        <td class="text-center col-diff" id="footDiffTotal">${diffBadgeHtml}</td>
        <td class="text-center col-status" id="footClearedCount">
            <span class="badge ${cleared === totalRows && totalRows > 0 ? 'bg-success' : 'bg-secondary'}">
                ${cleared} / ${totalRows} Cleared
            </span>
        </td>
        <td class="col-action no-print"></td>
    `;
}

// Render Department Breakdown (Summary Cards + Table + Grouped Slips)
function renderDeptTable(deptList) {
    const tbody = document.getElementById('deptTableBody');
    const cardsContainer = document.getElementById('deptCardsContainer');
    const accordionGroup = document.getElementById('deptAccordionGroup');

    if (!deptList || deptList.length === 0) {
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4 text-muted">
                        No department breakdown available for current filters.
                    </td>
                </tr>
            `;
        }
        if (cardsContainer) cardsContainer.innerHTML = '<div class="col-12 text-muted small p-2">No departments found.</div>';
        return;
    }

    let totalTrx = 0;
    let totalGross = 0;
    let totalDed = 0;
    let totalNet = 0;

    deptList.forEach(d => {
        totalTrx += d.trxCount;
        totalGross += d.grossAmount;
        totalDed += d.deductionAmount;
        totalNet += d.netAmount;
    });

    // 1. Department Summary Cards Ribbon
    const deptIcons = {
        'Pharmacy': { icon: 'fa-capsules', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
        'Grocery': { icon: 'fa-shopping-basket', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
        'Cosmetics': { icon: 'fa-gem', color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' },
        'General': { icon: 'fa-boxes-stacked', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' }
    };

    if (cardsContainer) {
        let cardsHtml = '';
        deptList.forEach(d => {
            const cfg = deptIcons[d.department] || { icon: 'fa-store', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
            const share = totalGross > 0 ? Math.round((d.grossAmount / totalGross) * 100) : 0;

            cardsHtml += `
                <div class="col-xl-3 col-md-6">
                    <div class="card border shadow-sm p-3 h-100" style="border-radius: 12px; border-color: ${cfg.border} !important; background: #ffffff; cursor: pointer;" onclick="filterByDeptCard('${d.department}')">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="badge" style="background: ${cfg.bg}; color: ${cfg.color}; font-weight: 800; font-size: 0.78rem; border: 1px solid ${cfg.border};">
                                <i class="fas ${cfg.icon} me-1"></i>${d.department}
                            </span>
                            <span class="badge bg-secondary-subtle text-dark small">${d.trxCount} slips</span>
                        </div>
                        <div class="fs-5 fw-bold" style="color: ${cfg.color}; font-family: 'JetBrains Mono', monospace;">
                            ${formatPKR(d.grossAmount)}
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top border-secondary-subtle" style="font-size: 0.75rem;">
                            <span class="text-muted">Net: <strong class="text-dark">${formatPKR(d.netAmount)}</strong></span>
                            <span class="fw-bold" style="color: ${cfg.color};">${share}% share</span>
                        </div>
                        <div class="progress mt-2" style="height: 5px;">
                            <div class="progress-bar" style="width: ${share}%; background-color: ${cfg.color};"></div>
                        </div>
                    </div>
                </div>
            `;
        });
        cardsContainer.innerHTML = cardsHtml;
    }

    // 2. Department Summary Table Body
    if (tbody) {
        let tableHtml = '';
        deptList.forEach(d => {
            const cfg = deptIcons[d.department] || { icon: 'fa-store', color: '#059669' };
            const share = totalGross > 0 ? Math.round((d.grossAmount / totalGross) * 100) : 0;
            tableHtml += `
                <tr>
                    <td class="fw-bold text-dark">
                        <i class="fas ${cfg.icon} me-2" style="color: ${cfg.color};"></i>${d.department}
                    </td>
                    <td class="text-center"><span class="badge bg-secondary-subtle text-dark border rounded-pill">${d.trxCount}</span></td>
                    <td class="text-end fw-bold text-success">${formatPKR(d.grossAmount)}</td>
                    <td class="text-end text-muted small">${formatPKR(d.deductionAmount)}</td>
                    <td class="text-end fw-bold text-primary">${formatPKR(d.netAmount)}</td>
                    <td class="text-center">
                        <div class="d-flex align-items-center justify-content-center gap-2">
                            <div class="progress flex-grow-1" style="height: 6px; max-width: 80px;">
                                <div class="progress-bar" style="width: ${share}%; background-color: ${cfg.color};"></div>
                            </div>
                            <span class="small text-muted fw-bold">${share}%</span>
                        </div>
                    </td>
                    <td class="text-center no-print">
                        <button class="btn btn-sm btn-outline-primary py-0 px-2 fs-7" onclick="filterByDeptCard('${d.department}')">
                            <i class="fas fa-filter me-1"></i>Filter
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = tableHtml;
    }

    // 3. Department Grouped Detail Accordion
    if (accordionGroup) {
        let accHtml = '';
        deptList.forEach((d, idx) => {
            const deptSlips = state.detailData.filter(s => s.department === d.department);
            const cfg = deptIcons[d.department] || { icon: 'fa-store', color: '#059669' };

            let slipsHtml = '';
            if (deptSlips.length === 0) {
                slipsHtml = '<tr><td colspan="7" class="text-center text-muted py-3">No individual slips in this range.</td></tr>';
            } else {
                deptSlips.forEach(s => {
                    slipsHtml += `
                        <tr class="${s.status === 'cleared' ? 'row-cleared' : 'row-pending'}">
                            <td>${formatDisplayDate(s.date)}</td>
                            <td><span class="badge bg-light text-dark border">${s.branch}</span></td>
                            <td class="fw-bold text-primary">${s.slipNo}</td>
                            <td>${s.cashierUser}</td>
                            <td class="text-end fw-bold text-success">${formatPKR(s.grossAmount)}</td>
                            <td class="text-center">${s.status === 'cleared' ? '<span class="badge-status-cleared">Cleared</span>' : '<span class="badge-status-pending">Pending</span>'}</td>
                            <td class="small text-muted">${s.remarks || '—'}</td>
                        </tr>
                    `;
                });
            }

            accHtml += `
                <div class="card border mb-2 shadow-sm" style="border-radius: 10px; overflow: hidden;">
                    <div class="card-header bg-white py-2 px-3 d-flex justify-content-between align-items-center" style="cursor: pointer;" data-bs-toggle="collapse" data-bs-target="#collapseDept_${idx}">
                        <div class="d-flex align-items-center gap-2">
                            <i class="fas ${cfg.icon}" style="color: ${cfg.color};"></i>
                            <strong class="text-dark">${d.department}</strong>
                            <span class="badge bg-secondary-subtle text-dark border ms-1">${d.trxCount} slips</span>
                        </div>
                        <div class="d-flex align-items-center gap-3">
                            <span class="fw-bold" style="color: ${cfg.color}; font-family: 'JetBrains Mono', monospace;">${formatPKR(d.grossAmount)}</span>
                            <i class="fas fa-chevron-down text-muted"></i>
                        </div>
                    </div>
                    <div id="collapseDept_${idx}" class="collapse ${idx === 0 ? 'show' : ''}">
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="ep-table mb-0">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Branch</th>
                                            <th>Slip #</th>
                                            <th>Cashier</th>
                                            <th style="text-align: right;">Gross Amount</th>
                                            <th style="text-align: center;">Status</th>
                                            <th>Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${slipsHtml}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        accordionGroup.innerHTML = accHtml;
    }

    // Footer Totals
    const footTrx = document.getElementById('footDeptTrx');
    const footGross = document.getElementById('footDeptGross');
    const footDed = document.getElementById('footDeptDed');
    const footNet = document.getElementById('footDeptNet');
    if (footTrx) footTrx.textContent = totalTrx;
    if (footGross) footGross.textContent = formatPKR(totalGross);
    if (footDed) footDed.textContent = formatPKR(totalDed);
    if (footNet) footNet.textContent = formatPKR(totalNet);
}

// Filter directly by clicking a Department card
function filterByDeptCard(deptName) {
    const sel = document.getElementById('filterDepartment');
    if (sel) {
        sel.value = deptName;
        state.department = deptName;
        fetchSettlementData();
    }
}

// Toggle Sub-view inside Department View (Summary Table vs Detailed Accordion)
function toggleDeptSubView(mode) {
    const sumContainer = document.getElementById('deptSummaryContainer');
    const detContainer = document.getElementById('deptDetailContainer');
    const btnSum = document.getElementById('btnDeptSummaryMode');
    const btnDet = document.getElementById('btnDeptDetailMode');

    if (mode === 'summary') {
        if (sumContainer) sumContainer.style.display = 'block';
        if (detContainer) detContainer.style.display = 'none';
        btnSum?.classList.add('active');
        btnDet?.classList.remove('active');
    } else {
        if (sumContainer) sumContainer.style.display = 'none';
        if (detContainer) detContainer.style.display = 'block';
        btnDet?.classList.add('active');
        btnSum?.classList.remove('active');
    }
}

// Render Detailed Receipts & Slips (View 3)
function renderDetailTable(data) {
    const tbody = document.getElementById('detailTableBody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center py-5 text-muted">
                    No counter receipts or detailed slips loaded.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    let totalGross = 0;
    let totalDed = 0;
    let totalNet = 0;

    data.forEach(item => {
        totalGross += item.grossAmount;
        totalDed += item.deductionAmount;
        totalNet += item.netAmount;

        const statusBadge = item.status === 'cleared'
            ? `<span class="badge-status-cleared"><i class="fas fa-check"></i> Cleared</span>`
            : `<span class="badge-status-pending"><i class="fas fa-clock"></i> Pending</span>`;

        html += `
            <tr class="${item.status === 'cleared' ? 'row-cleared' : 'row-pending'}">
                <td>${formatDisplayDate(item.date)}</td>
                <td><span class="badge bg-light text-dark border">${item.branch}</span></td>
                <td class="fw-bold text-primary">${item.slipNo}</td>
                <td><i class="fas fa-user-circle text-muted me-1"></i>${item.cashierUser}</td>
                <td><span class="badge bg-secondary-subtle text-dark border">${item.department}</span></td>
                <td>${item.bankName}</td>
                <td class="text-end fw-bold text-success">${formatPKR(item.grossAmount)}</td>
                <td class="text-end text-muted small">${formatPKR(item.deductionAmount)}</td>
                <td class="text-end fw-bold text-primary">${formatPKR(item.netAmount)}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="small text-muted">${item.remarks || '—'}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // Detailed Footer
    document.getElementById('footDetailGross').textContent = formatPKR(totalGross);
    document.getElementById('footDetailDed').textContent = formatPKR(totalDed);
    document.getElementById('footDetailNet').textContent = formatPKR(totalNet);
}

// ─── EXECUTIVE DASHBOARD INTERACTIVE CHARTS ───
let dailyTrendChartInstance = null;
let deptDonutChartInstance = null;

function renderDashboardCharts(summaryData, deptData) {
    if (typeof Chart === 'undefined') return;

    // 1. Daily Collection & Reconciliation Trend Chart (Combo Bar + Line)
    const trendCanvas = document.getElementById('dailyTrendChart');
    if (trendCanvas && summaryData && summaryData.length > 0) {
        const trendCtx = trendCanvas.getContext('2d');
        if (dailyTrendChartInstance) {
            dailyTrendChartInstance.destroy();
        }

        // Sort chronological (oldest to newest)
        const sortedData = [...summaryData].sort((a, b) => new Date(a.date) - new Date(b.date));
        const chartData = sortedData.slice(-25); // Show latest 25 days for maximum readability

        const labels = chartData.map(d => {
            const parts = d.date.split('-');
            return `${parts[2]}/${parts[1]}`;
        });
        const systemGross = chartData.map(d => d.systemGross || 0);
        const salmanAmounts = chartData.map(d => (d.salmanAmount !== null && d.salmanAmount !== undefined) ? d.salmanAmount : null);

        const dateRangeEl = document.getElementById('chartDateRangeLabel');
        if (dateRangeEl && chartData.length > 0) {
            dateRangeEl.textContent = `${labels[0]} — ${labels[labels.length - 1]} (${chartData.length} Days)`;
        }

        dailyTrendChartInstance = new Chart(trendCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'System EasyPaisa Gross',
                        data: systemGross,
                        backgroundColor: 'rgba(5, 150, 105, 0.75)',
                        borderColor: '#059669',
                        borderWidth: 1,
                        borderRadius: 4,
                        barPercentage: 0.65
                    },
                    {
                        type: 'line',
                        label: 'Salman Sb Verified Tally',
                        data: salmanAmounts,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.08)',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#2563eb',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        tension: 0.3,
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { family: 'Plus Jakarta Sans', size: 11, weight: '700' },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = context.parsed.y;
                                if (val === null || val === undefined) return `${context.dataset.label}: Awaiting Entry`;
                                return `${context.dataset.label}: Rs. ${Math.round(val).toLocaleString('en-PK')}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, weight: '600' } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            font: { size: 10, weight: '600' },
                            callback: function(value) {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                                return value;
                            }
                        }
                    }
                }
            }
        });
    }

    // 2. Department Share Donut Chart
    const donutCanvas = document.getElementById('deptDonutChart');
    if (donutCanvas && deptData && deptData.length > 0) {
        const donutCtx = donutCanvas.getContext('2d');
        if (deptDonutChartInstance) {
            deptDonutChartInstance.destroy();
        }

        const deptLabels = deptData.map(d => d.department);
        const deptGross = deptData.map(d => d.grossAmount);
        const colors = [
            '#059669', // Emerald (Pharmacy)
            '#2563eb', // Blue (Grocery)
            '#e11d48', // Pink/Rose (Cosmetics)
            '#7c3aed', // Purple (General)
            '#d97706', // Amber
            '#0891b2'  // Cyan
        ];

        const totalGross = deptGross.reduce((a, b) => a + b, 0);

        deptDonutChartInstance = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: deptLabels,
                datasets: [{
                    data: deptGross,
                    backgroundColor: colors.slice(0, deptLabels.length),
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = context.parsed;
                                const pct = totalGross > 0 ? ((val / totalGross) * 100).toFixed(1) : 0;
                                return `${context.label}: Rs. ${Math.round(val).toLocaleString('en-PK')} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });

        // Custom Donut Legend with badges
        const legendContainer = document.getElementById('deptDonutLegend');
        if (legendContainer) {
            legendContainer.innerHTML = deptData.map((d, i) => {
                const color = colors[i % colors.length];
                const pct = totalGross > 0 ? Math.round((d.grossAmount / totalGross) * 100) : 0;
                return `
                    <span class="badge border bg-white text-dark shadow-sm px-2 py-1" style="font-weight: 600; cursor: pointer;" onclick="filterByDeptCard('${d.department}')">
                        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; margin-right:4px;"></span>
                        ${d.department}: <strong style="color:${color}">${pct}%</strong>
                    </span>
                `;
            }).join('');
        }
    }
}

// Toggle Analytics Charts Ribbon
function toggleCharts() {
    const section = document.getElementById('analyticsChartsSection');
    const btnText = document.getElementById('toggleChartsText');
    if (!section) return;

    if (section.style.display === 'none') {
        section.style.display = 'flex';
        if (btnText) btnText.textContent = 'Hide Analytics Charts';
    } else {
        section.style.display = 'none';
        if (btnText) btnText.textContent = 'Show Analytics Charts';
    }
}

// View Tabs Switcher (Summary vs Department vs Detail)
function switchView(viewName) {
    state.currentView = viewName;

    document.getElementById('viewSummary').style.display = viewName === 'summary' ? 'block' : 'none';
    document.getElementById('viewDepartment').style.display = viewName === 'department' ? 'block' : 'none';
    document.getElementById('viewDetail').style.display = viewName === 'detail' ? 'block' : 'none';

    document.getElementById('tabSummaryBtn')?.classList.toggle('active', viewName === 'summary');
    document.getElementById('tabDeptBtn')?.classList.toggle('active', viewName === 'department');
    document.getElementById('tabDetailBtn')?.classList.toggle('active', viewName === 'detail');
}

// Live Salman Sb Input Reaction
// Live reaction when user enters/edits a department amount
function handleDeptLiveInput(inputEl) {
    const row = inputEl.closest('tr');
    if (!row) return;

    const date = inputEl.dataset.date;
    const branch = inputEl.dataset.branch;
    const systemGross = parseFloat(inputEl.dataset.system) || 0;

    const sumCell = document.getElementById(`sum_${date}_${branch}`);
    const diffCell = document.getElementById(`diff_${date}_${branch}`);
    if (!sumCell || !diffCell) return;

    // Calculate sum of all department inputs in this row
    const deptInputs = row.querySelectorAll('.dept-salman-input');
    let rowSum = 0;
    let hasAnyValue = false;

    deptInputs.forEach(inp => {
        const val = inp.value.trim();
        if (val !== '' && !isNaN(val)) {
            rowSum += parseFloat(val);
            hasAnyValue = true;
        }
        // Update department cell's print span
        const printSpan = inp.closest('td')?.querySelector('.print-val');
        if (printSpan) {
            printSpan.textContent = (val !== '' && !isNaN(val)) ? formatPKR(val) : '';
        }
    });

    const sumValSpan = sumCell.querySelector('.row-sum-val');
    const sumPrintSpan = sumCell.querySelector('.print-val');
    const diffBadgeSpan = diffCell.querySelector('.no-print');
    const diffPrintSpan = diffCell.querySelector('.print-val');

    if (!hasAnyValue) {
        if (sumValSpan) {
            sumValSpan.textContent = '—';
            sumValSpan.style.color = '#94a3b8';
        }
        if (sumPrintSpan) sumPrintSpan.textContent = '';
        if (diffBadgeSpan) diffBadgeSpan.innerHTML = `<span class="badge bg-light text-muted border px-2 py-1"><i class="fas fa-hourglass-start me-1"></i>Awaiting Entry</span>`;
        if (diffPrintSpan) diffPrintSpan.textContent = '';
        recalcTableFooterLive();
        return;
    }

    const diff = Math.round(rowSum - systemGross);

    if (sumValSpan) {
        sumValSpan.textContent = formatPKR(rowSum);
        sumValSpan.style.color = '#1d4ed8';
    }
    if (sumPrintSpan) sumPrintSpan.textContent = formatPKR(rowSum);
    if (diffPrintSpan) diffPrintSpan.textContent = diff === 0 ? '0' : formatPKR(diff);

    let diffBadge = '';
    if (diff === 0) {
        diffBadge = `<span class="badge-diff-zero"><i class="fas fa-check-circle"></i> Matched</span>`;
    } else if (diff < 0) {
        diffBadge = `<span class="badge-diff-neg"><i class="fas fa-arrow-down"></i> ${formatPKR(diff)}</span>`;
    } else {
        diffBadge = `<span class="badge-diff-pos"><i class="fas fa-arrow-up"></i> +${formatPKR(diff)}</span>`;
    }

    if (diffBadgeSpan) diffBadgeSpan.innerHTML = diffBadge;

    recalcTableFooterLive();
}

// Save department-wise tally to backend on blur or Enter
async function handleDeptBlurSave(inputEl) {
    const row = inputEl.closest('tr');
    if (!row) return;

    const date = inputEl.dataset.date;
    const branch = inputEl.dataset.branch;
    const checkEl = document.getElementById(`check_${date}_${branch}`);
    const token = localStorage.getItem('token');

    // Collect all department amounts for this row
    const deptInputs = row.querySelectorAll('.dept-salman-input');
    const deptAmounts = {};
    let rowSum = 0;
    let hasAnyValue = false;

    deptInputs.forEach(inp => {
        const dName = inp.dataset.dept;
        const val = inp.value.trim();
        if (val !== '' && !isNaN(val)) {
            const num = parseFloat(val);
            deptAmounts[dName] = num;
            rowSum += num;
            hasAnyValue = true;
        }
    });

    const finalSalman = hasAnyValue ? rowSum : null;

    try {
        const res = await fetch('/api/v1/easypaisa-settlement/save-tally', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                date,
                branch,
                departmentAmounts: deptAmounts,
                salmanAmount: finalSalman
            })
        });

        if (res.ok) {
            // Flash input with emerald outline
            inputEl.classList.add('saved-flash');
            if (checkEl) {
                checkEl.classList.remove('d-none');
                setTimeout(() => checkEl.classList.add('d-none'), 2000);
            }
            setTimeout(() => inputEl.classList.remove('saved-flash'), 1200);

            // Update in-memory state
            const target = state.summaryData.find(s => s.date === date && s.branch === branch);
            if (target) {
                target.departmentAmounts = deptAmounts;
                target.salmanAmount = finalSalman;
                target.isTallied = hasAnyValue;
                target.difference = target.salmanAmount !== null ? Math.round(target.salmanAmount - target.systemGross) : null;
            }

            // Recalculate KPIs from local state
            recalcKPIsFromState();
        }
    } catch (e) {
        console.error('Failed to save department-wise tally', e);
    }
}

// Live calculation of table footer totals from DOM inputs
function recalcTableFooterLive() {
    const depts = getActiveEasypaisaDepartments();
    const rows = document.querySelectorAll('#summaryTableBody tr');
    let totalSalman = 0;
    let totalDiff = 0;
    const deptTotals = {};
    depts.forEach(d => { deptTotals[d] = 0; });

    rows.forEach(row => {
        const deptInputs = row.querySelectorAll('.dept-salman-input');
        if (deptInputs.length === 0) return;

        let rowSum = 0;
        let hasAnyValue = false;
        deptInputs.forEach(inp => {
            const dName = inp.dataset.dept;
            const val = inp.value.trim();
            if (val !== '' && !isNaN(val)) {
                const num = parseFloat(val);
                rowSum += num;
                hasAnyValue = true;
                if (deptTotals[dName] !== undefined) {
                    deptTotals[dName] += num;
                }
            }
        });

        if (hasAnyValue) {
            const sysGross = parseFloat(deptInputs[0].dataset.system) || 0;
            totalSalman += rowSum;
            totalDiff += Math.round(rowSum - sysGross);
        }
    });

    // Update department footer totals
    depts.forEach(d => {
        const el = document.querySelector(`.col-dept-total[data-dept="${d}"]`);
        if (el) {
            const amt = deptTotals[d] || 0;
            el.textContent = amt > 0 ? formatPKR(amt) : 'Rs. 0';
        }
    });

    // Update Salman sum footer
    const footSalman = document.getElementById('footSalmanTotal');
    if (footSalman) footSalman.textContent = formatPKR(totalSalman);

    // Update Difference footer
    const diffEl = document.getElementById('footDiffTotal');
    if (diffEl) {
        if (totalDiff === 0 && totalSalman > 0) {
            diffEl.innerHTML = `<span class="badge-diff-zero">Rs. 0</span>`;
        } else if (totalDiff < 0) {
            diffEl.innerHTML = `<span class="badge-diff-neg">${formatPKR(totalDiff)}</span>`;
        } else if (totalDiff > 0) {
            diffEl.innerHTML = `<span class="badge-diff-pos">+${formatPKR(totalDiff)}</span>`;
        } else {
            diffEl.innerHTML = `<span class="text-muted small">—</span>`;
        }
    }
}

// Recalculate Summary Footer and KPIs in real-time
function recalcKPIsFromState() {
    let totalGross = 0;
    let totalSalman = 0;
    let totalDiff = 0;
    let talliedCount = 0;

    state.summaryData.forEach(item => {
        totalGross += item.systemGross;
        if (item.isTallied && item.salmanAmount !== null) {
            totalSalman += item.salmanAmount;
            totalDiff += item.difference;
            talliedCount += 1;
        }
    });

    state.kpis.totalSalmanAmount = totalSalman;
    state.kpis.totalDiscrepancy = totalDiff;
    state.kpis.talliedRowsCount = talliedCount;

    document.getElementById('kpiSalmanTotal').textContent = formatPKR(totalSalman);
    const varianceEl = document.getElementById('kpiVariance');
    if (talliedCount === 0) {
        varianceEl.textContent = '—';
    } else if (totalDiff === 0) {
        varianceEl.textContent = 'Rs. 0';
        varianceEl.className = 'kpi-value text-success';
    } else if (totalDiff < 0) {
        varianceEl.textContent = formatPKR(totalDiff);
        varianceEl.className = 'kpi-value text-danger';
    } else {
        varianceEl.textContent = `+${formatPKR(totalDiff)}`;
        varianceEl.className = 'kpi-value text-primary';
    }

    const depts = getActiveEasypaisaDepartments();
    const deptTotals = {};
    depts.forEach(d => { deptTotals[d] = 0; });
    state.summaryData.forEach(item => {
        const da = item.departmentAmounts || {};
        depts.forEach(d => {
            const v = da[d];
            if (v !== undefined && v !== null && v !== '') {
                deptTotals[d] = (deptTotals[d] || 0) + (parseFloat(v) || 0);
            }
        });
    });

    // Update table footer
    updateSummaryFooter(
        state.kpis.totalTrxCount || 0,
        totalGross,
        state.kpis.totalSystemGross ? (state.kpis.totalSystemGross - state.kpis.totalSystemNet) : 0,
        state.kpis.totalSystemNet || 0,
        totalSalman,
        totalDiff,
        state.kpis.clearedDatesCount || 0,
        state.summaryData.length,
        deptTotals
    );

    // Refresh charts
    renderDashboardCharts(state.summaryData, state.deptData);
}

// Open Settle Date Range Modal
function openClearModal() {
    document.getElementById('modalClearStartDate').value = state.startDate;
    document.getElementById('modalClearEndDate').value = state.endDate;

    const modalBranch = document.getElementById('modalClearBranch');
    if (modalBranch) modalBranch.value = state.branch;

    const modalDept = document.getElementById('modalClearDept');
    if (modalDept) modalDept.value = state.department;

    fetchClearancePreview();

    const modal = new bootstrap.Modal(document.getElementById('settlementModal'));
    modal.show();
}

// Live Clearance Summary Preview in Modal
async function fetchClearancePreview() {
    const fromDate = document.getElementById('modalClearStartDate').value;
    const toDate = document.getElementById('modalClearEndDate').value;
    const branch = document.getElementById('modalClearBranch').value;
    const department = document.getElementById('modalClearDept').value;
    const token = localStorage.getItem('token');

    const badge = document.getElementById('previewReadyBadge');
    if (badge) {
        badge.className = 'badge bg-secondary';
        badge.textContent = 'Calculating...';
    }

    try {
        const query = new URLSearchParams({ fromDate, toDate, branch, department });
        const res = await fetch(`/api/v1/easypaisa-settlement/clearance-preview?${query}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const json = await res.json();
            const d = json.data;

            document.getElementById('prevDatesCount').textContent = `${d.uniqueDatesCount} Days (${d.totalSlipsCount} Slips)`;
            document.getElementById('prevSystemGross').textContent = formatPKR(d.totalSystemGross);
            document.getElementById('prevSalmanAmount').textContent = formatPKR(d.totalSalmanAmount);

            const diffEl = document.getElementById('prevDiff');
            if (d.totalDifference === 0 && d.totalSalmanAmount > 0) {
                diffEl.textContent = 'Rs. 0 (Balanced)';
                diffEl.className = 'fw-bold text-success fs-6';
            } else if (d.totalDifference < 0) {
                diffEl.textContent = formatPKR(d.totalDifference);
                diffEl.className = 'fw-bold text-danger fs-6';
            } else {
                diffEl.textContent = `+${formatPKR(d.totalDifference)}`;
                diffEl.className = 'fw-bold text-primary fs-6';
            }

            const warnEl = document.getElementById('prevWarningMsg');
            if (d.untalliedDatesCount > 0) {
                if (badge) {
                    badge.className = 'badge bg-warning text-dark';
                    badge.textContent = `${d.untalliedDatesCount} Untallied Dates`;
                }
                warnEl.innerHTML = `<span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-1"></i>Note: ${d.untalliedDatesCount} dates in this range have NOT had Salman Sb amounts entered yet.</span> They will remain untallied but marked as Paid.`;
            } else {
                if (badge) {
                    badge.className = 'badge bg-success';
                    badge.textContent = 'Ready to Clear';
                }
                warnEl.innerHTML = `<span class="text-success fw-bold"><i class="fas fa-check-circle me-1"></i>All dates in this range have been verified and ready to settle.</span>`;
            }
        }
    } catch (e) {
        console.error('Clearance preview error', e);
    }
}

// Submit Boss Clearance for Date Range
async function submitBossClearance() {
    const fromDate = document.getElementById('modalClearStartDate').value;
    const toDate = document.getElementById('modalClearEndDate').value;
    const branch = document.getElementById('modalClearBranch').value;
    const department = document.getElementById('modalClearDept').value;
    const transferRef = document.getElementById('modalTransferRef').value.trim();
    const remarks = document.getElementById('modalClearRemarks').value.trim();
    const token = localStorage.getItem('token');

    const btn = document.getElementById('btnConfirmClear');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Clearing Settlement...';

    try {
        const res = await fetch('/api/v1/easypaisa-settlement/clear-range', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fromDate,
                toDate,
                branch,
                department,
                transferRef,
                remarks
            })
        });

        const json = await res.json();
        if (json.success) {
            // Close modal
            const modalEl = document.getElementById('settlementModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            alert(json.message || 'Settlement cleared successfully!');
            fetchSettlementData();
        } else {
            alert(json.message || 'Failed to clear settlement');
        }
    } catch (e) {
        console.error('Clearance error', e);
        alert('Error processing settlement clearance');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Open Unclear / Reopen Date Range Modal
function openUnclearModal() {
    const startInput = document.getElementById('modalUnclearStartDate');
    const endInput = document.getElementById('modalUnclearEndDate');
    if (startInput) startInput.value = state.startDate;
    if (endInput) endInput.value = state.endDate;

    const select = document.getElementById('modalUnclearBranch');
    const filterBranch = document.getElementById('filterBranch');
    if (select && filterBranch && filterBranch.options.length > 1) {
        select.innerHTML = filterBranch.innerHTML;
        select.value = state.branch || 'All Branches';
    } else if (select) {
        select.value = state.branch || 'All Branches';
    }

    const modalEl = document.getElementById('unclearModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
}

// Submit Unclear / Reopen Date Range
async function submitUnclearRange() {
    const fromDate = document.getElementById('modalUnclearStartDate').value;
    const toDate = document.getElementById('modalUnclearEndDate').value;
    const branch = document.getElementById('modalUnclearBranch').value;
    const remarks = document.getElementById('modalUnclearRemarks').value.trim();

    if (!confirm(`Are you sure you want to UNCLEAR / REOPEN all records from ${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)} (${branch}) back to Pending?`)) {
        return;
    }

    const btn = document.getElementById('btnConfirmUnclear');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Reopening...';

    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/v1/easypaisa-settlement/unclear-range', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ fromDate, toDate, branch, remarks })
        });
        const json = await res.json();

        if (res.ok && json.success) {
            alert(`✅ ${json.message || 'Records successfully reopened to Pending!'}`);
            const modalEl = document.getElementById('unclearModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            fetchSettlementData();
        } else {
            alert(`❌ Error: ${json.message || 'Failed to unclear records'}`);
        }
    } catch (e) {
        console.error('Failed to unclear range', e);
        alert('Network or server error while un-clearing records.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}


// Open Settlement History Modal
async function openHistoryModal() {
    const modal = new bootstrap.Modal(document.getElementById('historyModal'));
    modal.show();
    await fetchSettlementHistory();
}

// Fetch Settlement History Audit Batches
async function fetchSettlementHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Loading clearance history...</td></tr>`;
    const token = localStorage.getItem('token');

    try {
        const res = await fetch('/api/v1/easypaisa-settlement/history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const json = await res.json();
            const batches = json.data || [];

            if (batches.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-muted">No clearance history records found.</td></tr>`;
                return;
            }

            let html = '';
            batches.forEach(b => {
                const statusBadge = b.status === 'active'
                    ? `<span class="badge bg-success">Active / Cleared</span>`
                    : `<span class="badge bg-secondary">Reopened</span>`;

                const reopenBtn = b.status === 'active'
                    ? `<button class="btn btn-outline-danger btn-sm py-0 px-2 fs-7" onclick="reopenSettlementBatch('${b.batchNo}')">
                        <i class="fas fa-undo me-1"></i>Reopen
                       </button>`
                    : `<span class="text-muted small">—</span>`;

                html += `
                    <tr>
                        <td class="fw-bold font-monospace text-primary">${b.batchNo}</td>
                        <td>${formatDisplayDate(b.clearedAt)}</td>
                        <td><i class="fas fa-user-shield text-muted me-1"></i>${b.clearedBy}</td>
                        <td class="fw-bold">${formatDisplayDate(b.fromDate)} to ${formatDisplayDate(b.toDate)}</td>
                        <td><span class="badge bg-light text-dark border">${b.branch}</span></td>
                        <td><span class="badge bg-light text-dark border">${b.department}</span></td>
                        <td class="text-end fw-bold text-success">${formatPKR(b.totalSystemGross)}</td>
                        <td class="small font-monospace text-muted">${b.transferRef || '—'}</td>
                        <td class="small text-muted">${b.remarks || '—'}</td>
                        <td class="text-center">${statusBadge}</td>
                        <td class="text-center">${reopenBtn}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
        }
    } catch (e) {
        console.error('History fetch error', e);
        tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-danger">Failed to load history log.</td></tr>`;
    }
}

// Reopen an Entire Settlement Batch
async function reopenSettlementBatch(batchNo) {
    if (!confirm(`Are you sure you want to reopen Batch ${batchNo}? All transactions in this batch will be returned to Pending status.`)) {
        return;
    }

    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/v1/easypaisa-settlement/reopen-batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ batchNo })
        });

        const json = await res.json();
        if (json.success) {
            alert(json.message);
            fetchSettlementHistory();
            fetchSettlementData();
        } else {
            alert(json.message || 'Failed to reopen batch');
        }
    } catch (e) {
        console.error('Reopen batch error', e);
    }
}

// Quick Reopen Single Row
async function reopenSettlementDate(date, branch) {
    if (!confirm(`Reopen EasyPaisa settlement for ${date} (${branch}) back to Pending?`)) return;

    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/v1/easypaisa-settlement/reopen-date', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ date, branch })
        });

        if (res.ok) {
            fetchSettlementData();
        }
    } catch (e) {
        console.error('Failed to reopen date', e);
    }
}

// Quick Clear Single Row
async function quickClearSingleRow(date, branch) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/v1/easypaisa-settlement/clear-range', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fromDate: date,
                toDate: date,
                branch: branch,
                department: state.department,
                remarks: 'Quick cleared by user'
            })
        });

        if (res.ok) {
            fetchSettlementData();
        }
    } catch (e) {
        console.error('Failed to quick clear row', e);
    }
}

// Local Search Filter
function filterTableDataLocally() {
    if (!state.search) {
        renderSummaryTable(state.summaryData);
        renderDeptTable(state.deptData);
        renderDetailTable(state.detailData);
        return;
    }

    const q = state.search;
    const filteredSummary = state.summaryData.filter(s =>
        s.date.includes(q) ||
        s.branch.toLowerCase().includes(q) ||
        (s.remarks && s.remarks.toLowerCase().includes(q))
    );

    const filteredDetail = state.detailData.filter(d =>
        d.date.includes(q) ||
        d.branch.toLowerCase().includes(q) ||
        d.slipNo.toLowerCase().includes(q) ||
        d.cashierUser.toLowerCase().includes(q) ||
        d.department.toLowerCase().includes(q)
    );

    renderSummaryTable(filteredSummary);
    renderDetailTable(filteredDetail);
}

// Sync print-val spans before printing or PDF export (empty if nill, NO dash)
// Sync print-val spans before printing or PDF export (empty if nill, NO dash)
function syncPrintValues() {
    const element = document.getElementById('captureArea');
    if (!element) return;
    element.querySelectorAll('#summaryTableBody tr').forEach(row => {
        // Sync department inputs
        row.querySelectorAll('.dept-salman-input').forEach(input => {
            const printSpan = input.closest('td')?.querySelector('.print-val');
            if (printSpan) {
                const val = input.value.trim();
                printSpan.textContent = (val !== '' && !isNaN(val)) ? formatPKR(val) : '';
            }
        });

        // Sync Salman Sb (Sum)
        const sumCell = row.querySelector('.col-salman');
        const sumVal = sumCell?.querySelector('.row-sum-val')?.textContent?.trim();
        const sumPrintSpan = sumCell?.querySelector('.print-val');
        if (sumPrintSpan) {
            sumPrintSpan.textContent = (sumVal && sumVal !== '—') ? sumVal : '';
        }

        // Sync difference
        const diffCell = row.querySelector('.col-diff');
        const diffPrintSpan = diffCell?.querySelector('.print-val');
        // diffPrintSpan is maintained live
    });
}

// Print Handler (A4 Portrait)
function printReport() {
    updatePrintHeaders();
    syncPrintValues();
    const element = document.getElementById('captureArea');
    if (element) {
        element.querySelectorAll('input').forEach(input => {
            input.setAttribute('value', input.value);
        });
    }
    window.print();
}

// Update Print Headers with Current Filter State
function updatePrintHeaders() {
    const sub = document.getElementById('printSubtitle');
    if (sub) {
        sub.textContent = `Period: ${formatDisplayDate(state.startDate)} to ${formatDisplayDate(state.endDate)} | Branch: ${state.branch} | Dept: ${state.department}`;
    }
    const genTime = document.getElementById('printGeneratedTime');
    if (genTime) {
        genTime.textContent = `Generated: ${new Date().toLocaleString('en-GB')}`;
    }
}

// Save as PDF: Uses native browser print engine for 100% identical A4 Portrait vector PDF
function exportPDF() {
    printReport();
}

// Executive Excel (.xlsx) Export matching screen design
function exportExcel() {
    const filename = `EasyPaisa_Settlement_${state.currentView}_${state.startDate}_to_${state.endDate}.xlsx`;

    // 1. If SheetJS (XLSX) is loaded, generate professional multi-section .xlsx workbook
    if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();

        if (state.currentView === 'summary') {
            const rows = [];

            // Title Block (matching screen header)
            rows.push(['D.WATSON GROUP OF PHARMACIES']);
            rows.push(['EASYPAISA RECONCILIATION & SETTLEMENT STATEMENT']);
            rows.push([`Period: ${formatDisplayDate(state.startDate)} to ${formatDisplayDate(state.endDate)} | Branch: ${state.branch} | Department: ${state.department}`]);
            rows.push([`Generated On: ${new Date().toLocaleString()} | User: ${document.getElementById('userName')?.textContent || 'User'} | Status: Confidential Audit`]);
            rows.push([]);

            // Executive KPI Summary Grid (matching the 5 screen cards)
            rows.push(['EXECUTIVE KPI RECONCILIATION SUMMARY']);
            rows.push([
                'System Total (Gross)',
                'Salman Sb Verified',
                'Reconciliation Difference',
                'Paid / Cleared Amount',
                'Pending Clearance Total'
            ]);
            rows.push([
                state.kpis.totalSystemGross || 0,
                state.kpis.totalSalmanAmount || 0,
                state.kpis.totalDiscrepancy || 0,
                state.kpis.totalClearedAmount || 0,
                state.kpis.totalPendingAmount || 0
            ]);
            rows.push([
                `${state.kpis.totalTrxCount || 0} counter receipts recorded`,
                `${state.kpis.talliedRowsCount || 0} dates verified with Salman Sb`,
                (state.kpis.totalDiscrepancy || 0) < 0 ? 'Deficit to Collect' : ((state.kpis.totalDiscrepancy || 0) === 0 ? '100% Balanced' : 'Excess Cash / Surplus'),
                `${state.kpis.clearedDatesCount || 0} dates settled / paid`,
                `${state.kpis.pendingDatesCount || 0} dates awaiting payment`
            ]);
            rows.push([]);

            const depts = getActiveEasypaisaDepartments();

            // Summary Table Headers
            const headers = [
                'Date',
                'Branch',
                'Transactions',
                'System Gross (Rs.)',
                'Deduction (Rs.)',
                'System Net (Rs.)'
            ];
            depts.forEach(d => headers.push(`${d} Manual (Rs.)`));
            headers.push(
                'Salman Sb Sum (Rs.)',
                'Difference (Rs.)',
                'Settlement Status',
                'Remarks'
            );
            rows.push(headers);

            let totalTrx = 0;
            let totalGross = 0;
            let totalDed = 0;
            let totalNet = 0;
            let totalSalman = 0;
            let totalDiff = 0;
            let clearedCount = 0;
            const deptTotals = {};
            depts.forEach(d => { deptTotals[d] = 0; });

            state.summaryData.forEach(item => {
                const deptAmounts = item.departmentAmounts || {};
                let rowDeptSum = 0;
                let hasEnteredAnyDept = false;

                depts.forEach(d => {
                    const val = deptAmounts[d];
                    if (val !== undefined && val !== null && val !== '') {
                        const num = parseFloat(val);
                        if (!isNaN(num)) {
                            rowDeptSum += num;
                            hasEnteredAnyDept = true;
                            deptTotals[d] = (deptTotals[d] || 0) + num;
                        }
                    }
                });

                if (!hasEnteredAnyDept && item.salmanAmount !== null && item.salmanAmount !== undefined) {
                    rowDeptSum = item.salmanAmount;
                    hasEnteredAnyDept = true;
                }

                const effectiveSalman = hasEnteredAnyDept ? rowDeptSum : '';
                const effectiveDiff = hasEnteredAnyDept ? (rowDeptSum - item.systemGross) : '';
                const statusText = item.status === 'cleared' ? 'CLEARED / PAID' : 'PENDING PAYMENT';

                totalTrx += item.trxCount || 0;
                totalGross += item.systemGross || 0;
                totalDed += item.systemDeduction || 0;
                totalNet += item.systemNet || 0;
                if (hasEnteredAnyDept) {
                    totalSalman += rowDeptSum;
                    totalDiff += (rowDeptSum - item.systemGross);
                }
                if (item.status === 'cleared') clearedCount += 1;

                const rowData = [
                    item.date,
                    item.branch,
                    item.trxCount || 0,
                    item.systemGross || 0,
                    item.systemDeduction || 0,
                    item.systemNet || 0
                ];
                depts.forEach(d => {
                    const v = deptAmounts[d];
                    rowData.push((v !== undefined && v !== null && v !== '') ? parseFloat(v) : '');
                });
                rowData.push(
                    effectiveSalman,
                    effectiveDiff,
                    statusText,
                    item.remarks || ''
                );
                rows.push(rowData);
            });

            // Grand Total Row
            const footRow = [
                'GRAND TOTAL',
                'ALL BRANCHES',
                totalTrx,
                totalGross,
                totalDed,
                totalNet
            ];
            depts.forEach(d => footRow.push(deptTotals[d] || 0));
            footRow.push(
                totalSalman,
                totalDiff,
                `${clearedCount} / ${state.summaryData.length} Cleared`,
                ''
            );
            rows.push(footRow);

            const ws = XLSX.utils.aoa_to_sheet(rows);

            // Set generous column widths
            const colWidths = [
                { wch: 14 }, // Date
                { wch: 22 }, // Branch
                { wch: 14 }, // Trx
                { wch: 20 }, // System Gross
                { wch: 16 }, // Deduction
                { wch: 20 }  // System Net
            ];
            depts.forEach(() => colWidths.push({ wch: 18 }));
            colWidths.push(
                { wch: 22 }, // Salman Sb Sum
                { wch: 18 }, // Difference
                { wch: 20 }, // Settlement Status
                { wch: 30 }  // Remarks
            );
            ws['!cols'] = colWidths;

            XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation Summary');
        } else if (state.currentView === 'department') {
            const rows = [];
            rows.push(['D.WATSON GROUP OF PHARMACIES']);
            rows.push(['EASYPAISA DEPARTMENT BREAKDOWN']);
            rows.push([`Period: ${state.startDate} to ${state.endDate}`]);
            rows.push([]);
            rows.push(['Department', 'Transactions', 'Gross Amount (Rs.)', 'Deduction Amount (Rs.)', 'Net Amount (Rs.)']);
            state.deptData.forEach(d => {
                rows.push([d.department, d.trxCount, d.grossAmount, d.deductionAmount, d.netAmount]);
            });
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Department Breakdown');
        } else {
            const rows = [];
            rows.push(['D.WATSON GROUP OF PHARMACIES']);
            rows.push(['EASYPAISA COUNTER SLIPS AUDIT DETAIL']);
            rows.push([`Period: ${state.startDate} to ${state.endDate}`]);
            rows.push([]);
            rows.push(['Date', 'Branch', 'Slip No', 'Cashier User', 'Department', 'Bank/Account', 'Gross Amount (Rs.)', 'Deduction (Rs.)', 'Net Amount (Rs.)', 'Status', 'Remarks']);
            state.detailData.forEach(r => {
                rows.push([r.date, r.branch, r.slipNo, r.cashierUser, r.department, r.bankName, r.grossAmount, r.deductionAmount, r.netAmount, r.status, r.remarks || '']);
            });
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Counter Slips Detail');
        }

        XLSX.writeFile(wb, filename);
        return;
    }

    // 2. Fallback to CSV if XLSX library is unavailable
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (state.currentView === 'summary') {
        csvContent += 'Date,Branch,Transactions,System Gross,Deduction,System Net,Salman Sb Amount,Difference,Status,Remarks\r\n';
        state.summaryData.forEach(row => {
            const salman = row.salmanAmount !== null ? row.salmanAmount : '';
            const diff = row.difference !== null ? row.difference : '';
            csvContent += `"${row.date}","${row.branch}","${row.trxCount}","${row.systemGross}","${row.systemDeduction}","${row.systemNet}","${salman}","${diff}","${row.status}","${row.remarks || ''}"\r\n`;
        });
    } else if (state.currentView === 'department') {
        csvContent += 'Department,Transactions,System Gross,Deduction,System Net\r\n';
        state.deptData.forEach(row => {
            csvContent += `"${row.department}","${row.trxCount}","${row.grossAmount}","${row.deductionAmount}","${row.netAmount}"\r\n`;
        });
    } else {
        csvContent += 'Date,Branch,Slip No,Cashier User,Department,Bank/Account,Gross Amount,Deduction Amount,Net Amount,Status,Remarks\r\n';
        state.detailData.forEach(row => {
            csvContent += `"${row.date}","${row.branch}","${row.slipNo}","${row.cashierUser}","${row.department}","${row.bankName}","${row.grossAmount}","${row.deductionAmount}","${row.netAmount}","${row.status}","${row.remarks || ''}"\r\n`;
        });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename.replace('.xlsx', '.csv'));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Show Spinner Loading State
function showLoadingState() {
    const tbody = document.getElementById('summaryTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5 text-muted">
                    <i class="fas fa-spinner fa-spin fa-2x mb-2 d-block text-success"></i>
                    Loading live EasyPaisa settlement records...
                </td>
            </tr>
        `;
    }
}
