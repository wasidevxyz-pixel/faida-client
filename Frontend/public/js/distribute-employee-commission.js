// Distribute Employee All Commission - Dedicated Controller

let state = {
    monthYear: new Date().toISOString().slice(0, 7),
    branch: '',
    department: 'All',
    branches: [],
    departments: [],
    employees: [],
    employeeBranch: '',
    data: [],
    lockedEmployees: [],
    isBranchPayrollLocked: false,
    editingId: null
};

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // Set default month-year
    const monthInput = document.getElementById('mainMonthYear');
    if (monthInput) monthInput.value = state.monthYear;

    // Load user display
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userEl = document.getElementById('userName');
        if (userEl && user.name) userEl.textContent = user.name;
    } catch (e) { }

    // Setup keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            saveDistributeData();
        }
    });

    // Initialize Branches & Departments
    await Promise.all([
        loadBranches(),
        loadEmployeeDepartments()
    ]);

    // Event Listeners for top filters: Auto-load when branch or month changes
    document.getElementById('mainBranch')?.addEventListener('change', async (e) => {
        state.branch = e.target.value;
        state.editingId = null;
        if (state.branch) {
            await loadBranchEmployees(state.branch);
            await loadDistributeData();
        } else {
            state.data = [];
            updateDepartmentDropdown();
            renderTable();
            renderStatusBanner();
        }
    });

    document.getElementById('mainMonthYear')?.addEventListener('change', async (e) => {
        state.monthYear = e.target.value;
        state.editingId = null;
        if (state.branch) {
            await loadDistributeData();
        }
    });

    document.getElementById('globalDepartment')?.addEventListener('change', (e) => {
        state.department = e.target.value;
        filterByDepartment();
    });

    // Logout
    document.querySelector('.logout-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    });
});

function handleAuthError(res) {
    if (res && res.status === 401) {
        localStorage.removeItem('token');
        alert('Your session has expired (server was updated). Please log in again.');
        window.location.href = '/login';
        return true;
    }
    return false;
}

async function loadBranches() {
    if (typeof window.populateBranchSelect === 'function') {
        await window.populateBranchSelect('mainBranch', {
            placeholder: 'Select Branch',
            triggerChange: false
        });
    } else {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('/api/v1/sub-branches', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const branches = data.data || [];
                const mainBranchSel = document.getElementById('mainBranch');

                if (mainBranchSel) {
                    mainBranchSel.innerHTML = '<option value="">Select Branch</option>';
                    branches.forEach(b => {
                        const name = b.name || b.branchName;
                        if (name) mainBranchSel.innerHTML += `<option value="${name}">${name}</option>`;
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load branches', e);
        }
    }
}

async function loadEmployeeDepartments() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/v1/employee-departments?t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (handleAuthError(res)) return;
        if (res.ok) {
            const json = await res.json();
            const list = json.data || [];
            state.departments = list
                .map(d => (typeof d === 'string' ? d : (d?.name || '')))
                .filter(Boolean);
            updateDepartmentDropdown();
        }
    } catch (e) {
        console.error('Failed to load employee departments', e);
    }
}

function updateDepartmentDropdown() {
    const sel = document.getElementById('globalDepartment');
    if (!sel) return;

    const currentVal = sel.value || state.department || 'All';
    const deptSet = new Set(state.departments || []);

    // Also collect all department names from currently loaded branch employees
    if (Array.isArray(state.data)) {
        state.data.forEach(emp => {
            const d = (emp.department || '').trim();
            if (d) deptSet.add(d);
        });
    }

    const sortedDepts = Array.from(deptSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    let html = '<option value="All">All Departments</option>';
    sortedDepts.forEach(d => {
        const isSelected = (d.toLowerCase() === currentVal.toLowerCase()) ? 'selected' : '';
        html += `<option value="${d}" ${isSelected}>${d}</option>`;
    });

    const hasUnassigned = Array.isArray(state.data) && state.data.some(emp => !emp.department || !emp.department.trim());
    if (hasUnassigned) {
        const isSelected = (currentVal === 'Unassigned') ? 'selected' : '';
        html += `<option value="Unassigned" ${isSelected}>⚠️ Unassigned / No Dept</option>`;
    }

    sel.innerHTML = html;

    // Check if the previously selected value is in the new options
    const matchedOption = Array.from(sel.options).find(o => o.value.toLowerCase() === currentVal.toLowerCase());
    if (matchedOption) {
        sel.value = matchedOption.value;
    } else {
        sel.value = 'All';
    }
    state.department = sel.value;
}

async function loadBranchEmployees(branch, force = false) {
    if (!branch) {
        state.employees = [];
        state.employeeBranch = '';
        return;
    }

    if (!force && state.employeeBranch === branch && state.employees.length) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const encodedBranch = encodeURIComponent(branch);
        const resEmp = await fetch(`/api/v1/employees?branch=${encodedBranch}&limit=5000&t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (handleAuthError(resEmp)) return;

        if (resEmp.ok) {
            const json = await resEmp.json();
            state.employees = json.data || [];
            state.employeeBranch = branch;
            return;
        }

        const resParties = await fetch(`/api/v1/parties?partyType=employee&branch=${encodedBranch}&limit=5000&t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (handleAuthError(resParties)) return;
        if (resParties.ok) {
            const json = await resParties.json();
            state.employees = json.data || [];
            state.employeeBranch = branch;
        }
    } catch (e) {
        console.error('Failed to load branch employees', e);
    }
}

async function loadDistributeData() {
    const token = localStorage.getItem('token');
    state.monthYear = document.getElementById('mainMonthYear').value;
    state.branch = document.getElementById('mainBranch').value;
    state.department = document.getElementById('globalDepartment')?.value || 'All';

    if (!state.branch || !state.monthYear) {
        alert('Please select Branch and Month-Year');
        return;
    }

    // Ensure branch employees are loaded
    if (state.employeeBranch !== state.branch || !state.employees.length) {
        await loadBranchEmployees(state.branch);
    }

    // 1. Check if payroll is already created for this month & branch
    state.lockedEmployees = [];
    state.isBranchPayrollLocked = false;
    try {
        const payrollRes = await fetch(`/api/v1/payrolls?monthYear=${state.monthYear}&branch=${state.branch}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (handleAuthError(payrollRes)) return;
        const payrollJson = await payrollRes.json();
        if (payrollJson.success && Array.isArray(payrollJson.data)) {
            state.lockedEmployees = payrollJson.data.map(p => (p.employee?._id || p.employee).toString());
        }
    } catch (e) {
        console.error('Error checking locked payrolls:', e);
    }

    // 2. Fetch saved distribute commission record for this branch & month
    const query = new URLSearchParams({
        branch: state.branch,
        monthYear: state.monthYear,
        type: 'distribute'
    });

    try {
        const res = await fetch(`/api/v1/employee-commissions?${query}&t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (handleAuthError(res)) return;
        const json = await res.json();
        const savedDoc = json.data;
        const savedRows = savedDoc ? (savedDoc.data || []) : [];
        const transferredCommissions = json.transferredCommissions || [];

        if (savedDoc && savedDoc._id) {
            state.editingId = savedDoc._id;
            const remarksInput = document.getElementById('commissionRemarks');
            if (remarksInput && savedDoc.remarks) remarksInput.value = savedDoc.remarks;
        } else {
            state.editingId = null;
            const remarksInput = document.getElementById('commissionRemarks');
            if (remarksInput) remarksInput.value = '';
        }

        // Merge master employees with saved commission rows
        const mergedList = state.employees.map(m => {
            const mId = (m._id || m.id || '').toString();
            const saved = savedRows.find(s => (s.id || '').toString() === mId);
            // If not saved in this branch yet, check if commission was previously saved under another branch for this month!
            const transferred = !saved ? transferredCommissions.find(t => (t.id || '').toString() === mId) : null;
            const activeRecord = saved || transferred;

            const dept = (m.department && typeof m.department === 'object') ? m.department.name : (m.department || '');
            const br = (m.branch && typeof m.branch === 'object') ? m.branch.name : (m.branch || '');

            const otherComm = activeRecord ? (parseFloat(activeRecord.otherCommission) || 0) : 0;
            const ugComm = activeRecord ? (parseFloat(activeRecord.ugCommission) || 0) : 0;
            const whComm = activeRecord ? (parseFloat(activeRecord.warehouseCommission) || 0) : 0;
            const tot = otherComm + ugComm + whComm;

            return {
                id: mId,
                name: m.name,
                code: m.code || '',
                department: dept,
                branch: br,
                otherCommission: otherComm,
                ugCommission: ugComm,
                warehouseCommission: whComm,
                total: tot,
                isSaved: !!(activeRecord && tot > 0),
                transferredFrom: transferred ? (transferred.fromBranch || 'Other Branch') : null,
                isTransferred: false
            };
        });

        // Retain any employee previously saved in this sheet who has since transferred to another branch (if not already adopted)
        savedRows.forEach(s => {
            const sId = (s.id || '').toString();
            if (sId && !mergedList.some(m => m.id === sId)) {
                const otherComm = parseFloat(s.otherCommission) || 0;
                const ugComm = parseFloat(s.ugCommission) || 0;
                const whComm = parseFloat(s.warehouseCommission) || 0;
                const tot = otherComm + ugComm + whComm;
                if (tot > 0) {
                    const newBranch = s.currentBranch || 'New Branch';
                    mergedList.push({
                        id: sId,
                        name: s.name,
                        code: s.code || '',
                        department: s.department || '',
                        branch: state.branch,
                        currentBranch: newBranch,
                        otherCommission: otherComm,
                        ugCommission: ugComm,
                        warehouseCommission: whComm,
                        total: tot,
                        isSaved: true,
                        isTransferredAway: true // Transferred away from old branch -> remove edit rights!
                    });
                }
            }
        });

        state.data = mergedList.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        updateDepartmentDropdown();
        renderStatusBanner();
        filterByDepartment();
    } catch (e) {
        console.error('Failed to load distribute commission data', e);
        alert('Error loading commission data');
    }
}

function renderStatusBanner() {
    const container = document.getElementById('payrollStatusContainer');
    const saveBtn = document.getElementById('btnSaveCommission');
    const mobileSaveBtn = document.getElementById('mobileSaveBtn');
    const label = document.getElementById('sheetStatusLabel');
    if (!container) return;

    if (!state.branch) {
        container.innerHTML = '';
        if (label) label.innerText = 'Select Branch & Month to View';
        return;
    }

    const activeStaffCount = state.employees.length;
    const lockedCount = state.employees.filter(e => state.lockedEmployees.includes((e._id || e.id || '').toString())).length;
    const allLocked = activeStaffCount > 0 && lockedCount >= activeStaffCount;
    state.isBranchPayrollLocked = allLocked;

    if (allLocked) {
        // Entire branch is locked
        container.innerHTML = `
            <div class="alert alert-danger py-2 px-3 mb-2 d-flex align-items-center justify-content-between shadow-sm">
                <div class="d-flex align-items-center">
                    <i class="fas fa-lock me-2 fs-5 text-danger"></i>
                    <div>
                        <strong class="text-danger">PAYROLL LOCKED:</strong> Monthly payroll has already been generated for all employees in <strong>${state.branch}</strong> (${state.monthYear}). Commission values are <strong>locked and cannot be modified</strong>.
                    </div>
                </div>
                <span class="badge bg-danger fs-7 px-3 py-1"><i class="fas fa-lock me-1"></i>All Locked</span>
            </div>
        `;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.className = 'btn btn-secondary btn-sm px-3 disabled';
            saveBtn.innerHTML = '<i class="fas fa-lock me-1"></i>Locked (Payroll Done)';
        }
        if (mobileSaveBtn) mobileSaveBtn.disabled = true;
        if (label) label.innerHTML = `<span class="badge bg-danger"><i class="fas fa-lock me-1"></i>Payroll Closed</span>`;
    } else if (lockedCount > 0) {
        // PARTIAL LOCK: Only some employees have payroll
        container.innerHTML = `
            <div class="alert alert-warning py-2 px-3 mb-2 d-flex align-items-center justify-content-between shadow-sm">
                <div class="d-flex align-items-center">
                    <i class="fas fa-exclamation-triangle me-2 fs-5 text-warning"></i>
                    <div>
                        <strong>PARTIAL PAYROLL (${lockedCount} / ${activeStaffCount} Locked):</strong> Payroll is created for ${lockedCount} employee(s) (highlighted in red). <strong>All other employees are editable and can be saved</strong>.
                    </div>
                </div>
                <span class="badge bg-warning text-dark fs-7 px-3 py-1"><i class="fas fa-edit me-1"></i>Partially Editable</span>
            </div>
        `;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.className = 'btn btn-success btn-sm px-3';
            saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save (Alt+S)';
        }
        if (mobileSaveBtn) mobileSaveBtn.disabled = false;
        if (label) label.innerHTML = `<span class="badge bg-warning text-dark"><i class="fas fa-edit me-1"></i>Partially Editable</span>`;
    } else if (state.editingId) {
        // Saved sheet found, payroll NOT created
        container.innerHTML = `
            <div class="alert alert-success py-2 px-3 mb-2 d-flex align-items-center justify-content-between shadow-sm">
                <div class="d-flex align-items-center">
                    <i class="fas fa-check-circle me-2 fs-5 text-success"></i>
                    <div>
                        <strong>SAVED COMMISSION LOADED:</strong> Showing saved sheet for <strong>${state.branch}</strong> (${state.monthYear}). Payroll is <strong>NOT created</strong> for this branch yet. You can modify amounts below, then click <strong>Save (Alt+S)</strong> to update.
                    </div>
                </div>
                <span class="badge bg-success fs-7 px-3 py-1"><i class="fas fa-edit me-1"></i>Editable</span>
            </div>
        `;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.className = 'btn btn-success btn-sm px-3';
            saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save (Alt+S)';
        }
        if (mobileSaveBtn) mobileSaveBtn.disabled = false;
        if (label) label.innerHTML = `<span class="badge bg-success"><i class="fas fa-check me-1"></i>Saved Sheet Loaded</span>`;
    } else {
        // New sheet
        container.innerHTML = `
            <div class="alert alert-info py-2 px-3 mb-2 d-flex align-items-center justify-content-between shadow-sm">
                <div class="d-flex align-items-center">
                    <i class="fas fa-file-signature me-2 fs-5 text-info"></i>
                    <div>
                        <strong>NEW COMMISSION ENTRY:</strong> No commission has been saved yet for <strong>${state.branch}</strong> (${state.monthYear}). Enter values below and click <strong>Save (Alt+S)</strong>.
                    </div>
                </div>
                <span class="badge bg-primary fs-7 px-3 py-1"><i class="fas fa-plus me-1"></i>New Entry</span>
            </div>
        `;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.className = 'btn btn-success btn-sm px-3';
            saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save (Alt+S)';
        }
        if (mobileSaveBtn) mobileSaveBtn.disabled = false;
        if (label) label.innerHTML = `<span class="badge bg-primary"><i class="fas fa-file me-1"></i>New Sheet</span>`;
    }
}

function filterByDepartment() {
    state.department = document.getElementById('globalDepartment')?.value || 'All';
    applyGlobalSearch();
}

function getFilteredList() {
    const search = (document.getElementById('globalSearch')?.value || '').toLowerCase().trim();
    let list = state.data || [];

    const currentDept = state.department || document.getElementById('globalDepartment')?.value || 'All';

    if (currentDept && currentDept !== 'All') {
        if (currentDept === 'Unassigned') {
            list = list.filter(emp => !emp.department || !emp.department.trim());
        } else {
            list = list.filter(emp => (emp.department || '').toLowerCase() === currentDept.toLowerCase());
        }
    }

    if (search) {
        list = list.filter(item => {
            return (item.name || '').toLowerCase().includes(search) ||
                   (item.code || '').toLowerCase().includes(search);
        });
    }

    return list;
}

function renderTable(dataToRender = null) {
    const list = dataToRender !== null ? dataToRender : getFilteredList();
    const tbody = document.getElementById('distributeBody');
    const badge = document.getElementById('recordsBadge');

    if (badge) badge.innerText = `${list.length} Employees`;

    if (!list || list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-muted">
                    <i class="fas fa-users-slash fa-2x mb-2 d-block opacity-25"></i>
                    No employees found for ${state.branch || 'selected branch'}.
                </td>
            </tr>
        `;
        calculateTotals(list);
        return;
    }

    let t1 = 0, t2 = 0, t3 = 0, t4 = 0;

    tbody.innerHTML = list.map((emp) => {
        const isPayrollLocked = state.lockedEmployees.includes(emp.id.toString());
        const isTransferredAway = !!emp.isTransferredAway;
        const isLocked = isPayrollLocked || isTransferredAway;
        const isSaved = emp.isSaved;

        let statusBadge = '';
        if (isTransferredAway) {
            statusBadge = `<span class="locked-badge" style="background-color: #6c757d;" title="Transferred to ${emp.currentBranch || 'new branch'}. Edit rights removed from old branch."><i class="fas fa-lock me-1"></i>TRANSFERRED TO ${(emp.currentBranch || 'NEW BRANCH').toUpperCase()} (LOCKED)</span>`;
        } else if (isPayrollLocked) {
            statusBadge = '<span class="locked-badge"><i class="fas fa-lock me-1"></i>PAYROLL LOCKED</span>';
        } else if (isSaved) {
            statusBadge = '<span class="saved-badge">SAVED</span>';
        } else {
            statusBadge = '<span class="unpaid-badge">UNPAID</span>';
        }

        let transferBadge = '';
        if (emp.transferredFrom) {
            transferBadge = `<span class="badge bg-info text-dark ms-1" style="font-size: 0.65rem;" title="Commission auto-transferred from ${emp.transferredFrom}"><i class="fas fa-arrow-circle-right me-1"></i>From ${emp.transferredFrom}</span>`;
        }

        const o = parseFloat(emp.otherCommission) || 0;
        const u = parseFloat(emp.ugCommission) || 0;
        const w = parseFloat(emp.warehouseCommission) || 0;
        const tot = o + u + w;

        t1 += o;
        t2 += u;
        t3 += w;
        t4 += tot;

        const cellClass = isLocked ? 'cell-locked' : '';
        const lockTitle = isTransferredAway 
            ? `Transferred to ${emp.currentBranch || 'new branch'}. Edit rights removed from old branch.` 
            : 'Locked: Payroll has been generated for this employee';
        const readonlyAttr = isLocked ? `disabled readonly title="${lockTitle}"` : '';

        return `
            <tr data-id="${emp.id}" class="${isLocked ? 'row-locked' : (isSaved ? 'row-saved' : '')}">
                <td class="fw-semibold text-secondary">${emp.code || '—'}</td>
                <td class="name-cell text-start ps-3 fw-medium">
                    ${emp.name} ${statusBadge} ${transferBadge}
                    ${emp.department ? `<small class="text-muted ms-1">(${emp.department})</small>` : ''}
                </td>
                <td>
                    <input type="number" step="any" class="form-control form-control-sm text-center ${cellClass}" 
                           value="${o || ''}" placeholder="0" ${readonlyAttr}
                           oninput="updateRow('${emp.id}', 'otherCommission', this.value)">
                </td>
                <td>
                    <input type="number" step="any" class="form-control form-control-sm text-center ${cellClass}" 
                           value="${u || ''}" placeholder="0" ${readonlyAttr}
                           oninput="updateRow('${emp.id}', 'ugCommission', this.value)">
                </td>
                <td>
                    <input type="number" step="any" class="form-control form-control-sm text-center ${cellClass}" 
                           value="${w || ''}" placeholder="0" ${readonlyAttr}
                           oninput="updateRow('${emp.id}', 'warehouseCommission', this.value)">
                </td>
                <td class="fw-bold row-total text-end pe-3 ${tot > 0 ? 'text-success' : 'text-muted'}">
                    ${tot.toFixed(2)}
                </td>
            </tr>
        `;
    }).join('');

    calculateTotals(list);
}

function updateRow(id, field, value) {
    const item = state.data.find(d => (d.id || '').toString() === id.toString());
    if (!item || item.isTransferredAway) return;

    item[field] = parseFloat(value) || 0;
    const tot = (parseFloat(item.otherCommission) || 0) + (parseFloat(item.ugCommission) || 0) + (parseFloat(item.warehouseCommission) || 0);
    item.total = tot;

    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (row) {
        const totEl = row.querySelector('.row-total');
        if (totEl) {
            totEl.innerText = tot.toFixed(2);
            totEl.className = `fw-bold row-total text-end pe-3 ${tot > 0 ? 'text-success' : 'text-muted'}`;
        }
    }

    calculateTotals();
}

function calculateTotals(dataList = null) {
    const list = dataList !== null ? dataList : getFilteredList();
    let t1 = 0, t2 = 0, t3 = 0, t4 = 0;
    list.forEach(e => {
        const o = parseFloat(e.otherCommission) || 0;
        const u = parseFloat(e.ugCommission) || 0;
        const w = parseFloat(e.warehouseCommission) || 0;
        t1 += o;
        t2 += u;
        t3 += w;
        t4 += (o + u + w);
    });

    const el1 = document.getElementById('distOtherTotal');
    const el2 = document.getElementById('distUgTotal');
    const el3 = document.getElementById('distWarehouseTotal');
    const el4 = document.getElementById('distGrandTotal');
    if (el1) el1.innerText = t1.toFixed(2);
    if (el2) el2.innerText = t2.toFixed(2);
    if (el3) el3.innerText = t3.toFixed(2);
    if (el4) el4.innerText = t4.toFixed(2);

    const totalLabel = document.getElementById('distTotalLabel') || document.querySelector('.data-table tfoot td[colspan="2"]');
    if (totalLabel) {
        const currentDept = state.department || document.getElementById('globalDepartment')?.value || 'All';
        if (currentDept && currentDept !== 'All') {
            totalLabel.innerText = `TOTAL (${currentDept}):`;
        } else {
            totalLabel.innerText = `GRAND TOTAL:`;
        }
    }
}

function applyGlobalSearch() {
    const list = getFilteredList();
    renderTable(list);
}

function resetForm() {
    if (state.data.length > 0 && !confirm('Clear all entered amounts and start a new entry?')) return;
    state.editingId = null;
    const remarks = document.getElementById('commissionRemarks');
    if (remarks) remarks.value = '';
    const search = document.getElementById('globalSearch');
    if (search) search.value = '';
    const deptSel = document.getElementById('globalDepartment');
    if (deptSel) deptSel.value = 'All';
    state.department = 'All';

    state.data.forEach(e => {
        e.otherCommission = 0;
        e.ugCommission = 0;
        e.warehouseCommission = 0;
        e.total = 0;
        e.isSaved = false;
    });

    renderStatusBanner();
    filterByDepartment();
}

async function saveDistributeData() {
    const token = localStorage.getItem('token');
    state.monthYear = document.getElementById('mainMonthYear').value;
    state.branch = document.getElementById('mainBranch').value;
    state.department = document.getElementById('globalDepartment')?.value || 'All';

    if (!state.branch || !state.monthYear) {
        alert('Please select Branch and Month-Year first');
        return;
    }

    if (state.isBranchPayrollLocked) {
        alert('Cannot save: Monthly payroll has already been generated for this branch & period. Commission is permanently locked.');
        return;
    }

    const dataToSave = state.data.filter(item => {
        const tot = (parseFloat(item.otherCommission) || 0) + 
                    (parseFloat(item.ugCommission) || 0) + 
                    (parseFloat(item.warehouseCommission) || 0);
        return tot > 0;
    }).map(item => ({
        id: item.id,
        name: item.name,
        code: item.code,
        department: item.department,
        branch: item.branch,
        otherCommission: parseFloat(item.otherCommission) || 0,
        ugCommission: parseFloat(item.ugCommission) || 0,
        warehouseCommission: parseFloat(item.warehouseCommission) || 0,
        total: (parseFloat(item.otherCommission) || 0) + 
               (parseFloat(item.ugCommission) || 0) + 
               (parseFloat(item.warehouseCommission) || 0)
    }));

    if (dataToSave.length === 0) {
        alert('No commission data found to save (Amounts > 0 required)');
        return;
    }

    const payload = {
        id: state.editingId,
        monthYear: state.monthYear,
        branch: state.branch,
        department: state.department,
        type: 'distribute',
        remarks: document.getElementById('commissionRemarks')?.value || '',
        data: dataToSave
    };

    try {
        const res = await fetch('/api/v1/employee-commissions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (handleAuthError(res)) return;

        const json = await res.json();
        if (json.success) {
            if (json.data && json.data._id) {
                state.editingId = json.data._id;
            }
            alert('Distribute Commission Saved Successfully!');

            // Refresh table to reflect saved badges
            await loadDistributeData();
        } else {
            alert(json.message || 'Error saving data');
        }
    } catch (e) {
        console.error('Save error', e);
        alert('Server connection error while saving');
    }
}

// ================= PRINT REPORT =================
function printCommission() {
    if (!state.data || state.data.length === 0) {
        alert('No data to print. Please search and load a sheet first.');
        return;
    }

    const currentList = getFilteredList();
    const activeRows = currentList.filter(e => (parseFloat(e.total) || 0) > 0);
    if (activeRows.length === 0) {
        alert('No employee commission amounts found to print.');
        return;
    }

    const printDoc = {
        branch: state.branch,
        monthYear: state.monthYear,
        department: state.department || 'All',
        remarks: document.getElementById('commissionRemarks')?.value || '',
        data: activeRows
    };

    generatePrintReport(printDoc);
}

function generatePrintReport(doc) {
    const rows = doc.data || [];
    let t1 = 0, t2 = 0, t3 = 0, t4 = 0;

    const rowsHtml = rows.map((r, idx) => {
        const o = parseFloat(r.otherCommission) || 0;
        const u = parseFloat(r.ugCommission) || 0;
        const w = parseFloat(r.warehouseCommission) || 0;
        const tot = o + u + w;
        t1 += o; t2 += u; t3 += w; t4 += tot;

        return `
            <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td style="text-align: center;">${r.code || '—'}</td>
                <td style="text-align: left; padding-left: 10px;">${r.name || 'Unknown'}</td>
                <td style="text-align: center; color: #555;">${r.department || '—'}</td>
                <td style="text-align: right; padding-right: 8px;">${o > 0 ? o.toFixed(2) : '—'}</td>
                <td style="text-align: right; padding-right: 8px;">${u > 0 ? u.toFixed(2) : '—'}</td>
                <td style="text-align: right; padding-right: 8px;">${w > 0 ? w.toFixed(2) : '—'}</td>
                <td style="text-align: right; padding-right: 8px; font-weight: bold;">${tot.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        alert('Please allow popups for this site to open the print report.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Distribute Employee Commission - ${doc.branch} (${doc.monthYear})</title>
            <style>
                @page { size: A4 portrait; margin: 12mm; }
                body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; color: #111; }
                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
                .header h2 { margin: 0; font-size: 18px; text-transform: uppercase; }
                .header h4 { margin: 4px 0 0 0; font-size: 13px; font-weight: normal; }
                .meta-table { width: 100%; margin-bottom: 12px; border-collapse: collapse; }
                .meta-table td { padding: 3px 0; font-size: 11px; }
                .report-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .report-table th, .report-table td { border: 1px solid #333; padding: 4px 6px; font-size: 10.5px; }
                .report-table th { background: #f0f0f0; text-transform: uppercase; font-size: 10px; }
                .report-table tfoot td { font-weight: bold; background: #fafafa; border-top: 2px solid #000; }
                .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding: 0 20px; }
                .sig-box { text-align: center; width: 150px; border-top: 1px solid #000; padding-top: 5px; font-size: 10px; font-weight: bold; }
                @media print {
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom: 15px; text-align: right;">
                <button onclick="window.print()" style="padding: 6px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Print Now</button>
            </div>
            <div class="header">
                <h2>D.Watson Group of Pharmacies</h2>
                <h4>Distribute Employee All Commission Sheet</h4>
            </div>
            <table class="meta-table">
                <tr>
                    <td style="width: 35%;"><strong>Branch:</strong> ${doc.branch || 'All'}</td>
                    <td style="width: 35%;"><strong>Period (Month-Year):</strong> ${doc.monthYear || '—'}</td>
                    <td style="width: 30%; text-align: right;"><strong>Department:</strong> ${doc.department || 'All'}</td>
                </tr>
                ${doc.remarks ? `<tr><td colspan="3"><strong>Remarks:</strong> ${doc.remarks}</td></tr>` : ''}
            </table>
            <table class="report-table">
                <thead>
                    <tr>
                        <th style="width: 35px; text-align: center;">S#</th>
                        <th style="width: 55px; text-align: center;">Code</th>
                        <th style="text-align: left; padding-left: 10px;">Employee Name</th>
                        <th style="width: 90px; text-align: center;">Dept</th>
                        <th style="width: 95px; text-align: right;">Other Comm</th>
                        <th style="width: 95px; text-align: right;">UG Comm</th>
                        <th style="width: 95px; text-align: right;">Warehouse Comm</th>
                        <th style="width: 105px; text-align: right;">Total Comm</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right; padding-right: 10px;">GRAND TOTAL:</td>
                        <td style="text-align: right; padding-right: 8px;">${t1.toFixed(2)}</td>
                        <td style="text-align: right; padding-right: 8px;">${t2.toFixed(2)}</td>
                        <td style="text-align: right; padding-right: 8px;">${t3.toFixed(2)}</td>
                        <td style="text-align: right; padding-right: 8px;">${t4.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
            <div class="signatures">
                <div class="sig-box">Prepared By</div>
                <div class="sig-box">Checked By</div>
                <div class="sig-box">Branch Manager</div>
                <div class="sig-box">Accounts Approval</div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}
