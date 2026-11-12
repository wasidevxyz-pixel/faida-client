
// Employee Sale Commission (UG) - Behavioral Logic

let state = {
    monthYear: new Date().toISOString().slice(0, 7),
    branch: '',
    commissionBranch: '',
    employees: [],
    branches: [],
    subBranches: [],
    commissionBranches: [],
    tableData: [], // Array of row objects
    editingId: null, // For existing commission record
    editingBranch: null, // Commission branch ID corresponding to editingId
    editingBranchId: null, // For commission branch modal
    editingSubBranchId: null // For sub branch modal
};

const standardizeBranchName = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');

document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('token')) {
        window.location.href = '/login';
        return;
    }

    // Set default month
    document.getElementById('monthYear').value = state.monthYear;

    await loadInitialData();
    setupEventListeners();
});

async function loadInitialData() {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
        // 1. Load Main Branches (Stores)
        let resStores = await fetch('/api/v1/stores', { headers });
        if (!resStores.ok) {
            resStores = await fetch('/api/v1/sub-branches?all=true', { headers });
        }

        const jsonStores = await resStores.json();
        if (jsonStores.success && jsonStores.data) {
            const rawNames = jsonStores.data.map(item => (item.name || item.branchName || '').trim());
            const uniqueBranches = [...new Set(rawNames)].filter(n => n !== '').sort();

            state.branches = uniqueBranches.map(name => ({ name }));

            const sel = document.getElementById('mainBranch');

            if (sel) {
                sel.innerHTML = '<option value="">Select Branch</option>';
                uniqueBranches.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    sel.appendChild(opt);
                });
            }
        }

        // 2. Load Commission Branches
        await refreshCommissionBranches();

        // 3. Load Sub Branches
        await refreshSubBranches();

        // 4. Load Employees
        const resEmp = await fetch('/api/v1/employees?limit=1000', { headers });
        if (resEmp.ok) {
            const json = await resEmp.json();
            state.employees = json.data;
            populateEmployees(); // Default population
        }

        // 5. Load Employee Departments
        const deptJson = await (window.cachedFetch ? window.cachedFetch('/api/v1/employee-departments', { headers }) : fetch('/api/v1/employee-departments', { headers }).then(r => r.json()));
        if (deptJson && deptJson.success) {
            const depts = deptJson.data;
            const sel = document.getElementById('department');
            if (sel) {
                sel.innerHTML = '<option value="">Select Department</option>';
                depts.forEach(d => {
                    sel.innerHTML += `<option value="${d.name}">${d.name}</option>`;
                });
            }
        }

        // Show current user name
        const user = JSON.parse(localStorage.getItem('user'));
        if (user && document.getElementById('userName')) {
            document.getElementById('userName').innerText = user.name;
        }

    } catch (error) {
        console.error('Error loading initial data:', error);
    }
}

function setupEventListeners() {
    // Branch change -> update sub-branches & employees
    document.getElementById('mainBranch').addEventListener('change', (e) => {
        state.branch = e.target.value;
        state.editingId = null; // Important: Switch to New Entry mode when branch changes
        state.editingBranch = null;
        filterSubBranches();
        // Reset department when branch changes to show all employees of the new branch
        const deptSel = document.getElementById('department');
        if (deptSel) deptSel.value = '';
        populateEmployees('');
    });

    // Month change -> clear editing ID
    document.getElementById('monthYear').addEventListener('change', (e) => {
        state.editingId = null;
        state.editingBranch = null;
    });

    // Commission Branch change -> clear editing ID
    document.getElementById('commissionBranch').addEventListener('change', (e) => {
        state.editingId = null;
        state.editingBranch = null;
    });

    // Department change -> filter employees
    document.getElementById('department').addEventListener('change', (e) => {
        populateEmployees(e.target.value);
    });

    // Employee Selection -> Auto-select Department & Branch (only if not already chosen)
    $('#employee').on('change', (e) => {
        const empId = e.target.value;
        if (!empId) return;

        const emp = state.employees.find(item => item._id === empId);
        if (emp) {
            // 1. Auto-select Department
            if (emp.department) {
                const deptName = typeof emp.department === 'object' ? emp.department.name : emp.department;
                const deptSel = document.getElementById('department');
                if (deptSel && deptName && !deptSel.value) {
                    deptSel.value = deptName;
                }
            }

            // 2. Auto-select Branch (only if mainBranch has NOT already been selected by user)
            const empBranch = typeof emp.branch === 'object' ? (emp.branch.name || '') : (emp.branch || '');
            const branchSel = document.getElementById('mainBranch');
            if (empBranch && branchSel && !branchSel.value) {
                for (let i = 0; i < branchSel.options.length; i++) {
                    if (branchSel.options[i].value.toLowerCase() === empBranch.toLowerCase()) {
                        branchSel.selectedIndex = i;
                        state.branch = branchSel.options[i].value;
                        state.editingId = null;
                        state.editingBranch = null;
                        filterSubBranches();
                        break;
                    }
                }
            }
        }
    });

    // Add input listeners for all calculation fields
    ['saleInput', 'percentage', 'itemWiseCommission', 'dailyTarget', 'monthlyTarget'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', calculateRowCom);
    });

    document.getElementById('targetAchieved')?.addEventListener('input', renderTable);

    // Enter key navigation or adding row
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveData();
        }

        // Enter key in target fields to Add Row
        if (e.key === 'Enter') {
            const activeId = document.activeElement.id;
            if (activeId === 'dailyTarget' || activeId === 'monthlyTarget' || activeId === 'paidCommission') {
                e.preventDefault();
                addRow();
            }
        }
    });
}

// --- Commission Branch CRUD ---

async function refreshCommissionBranches() {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/v1/commission-branches', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
        const json = await res.json();
        state.commissionBranches = json.data;

        // Update main dropdown & List Filter dropdown
        const sel = document.getElementById('commissionBranch');
        const selList = document.getElementById('listCommissionBranchFilter');

        const activeBranches = state.commissionBranches.filter(b => b.active);

        if (sel) {
            const val = sel.value;
            sel.innerHTML = '<option value="">Select Commission Branch</option>';
            activeBranches.forEach(b => {
                sel.innerHTML += `<option value="${b._id}">${b.name}</option>`;
            });
            sel.value = val;
        }

        if (selList) {
            selList.innerHTML = '<option value="">Select Comm Branch</option>';
            activeBranches.forEach(b => {
                selList.innerHTML += `<option value="${b._id}">${b.name}</option>`;
            });
        }
        renderBranchTable();
    }
}

function renderBranchTable() {
    const search = document.getElementById('modalBranchSearch').value.toLowerCase();
    const tbody = document.getElementById('modalBranchTableBody');
    const filtered = state.commissionBranches.filter(b =>
        b.name.toLowerCase().includes(search)
    );

    tbody.innerHTML = filtered.map((b, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${b.name}</td>
            <td><i class="fas ${b.active ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i></td>
            <td>
                <button class="btn btn-sm btn-primary py-0" onclick="editBranch('${b._id}')">Edit</button>
            </td>
        </tr>
    `).join('');
}

function showBranchModal() {
    state.editingBranchId = null;
    document.getElementById('modalBranchName').value = '';
    document.getElementById('modalBranchActive').checked = true;
    document.getElementById('modalBranchTarget').value = '';
    document.getElementById('modalBranchTargetComm').value = '';
    new bootstrap.Modal(document.getElementById('branchModal')).show();
}

function editBranch(id) {
    const branch = state.commissionBranches.find(b => b._id === id);
    if (!branch) return;
    state.editingBranchId = id;
    document.getElementById('modalBranchName').value = branch.name;
    document.getElementById('modalBranchActive').checked = branch.active;
    document.getElementById('modalBranchTarget').value = branch.branchTarget || 0;
    document.getElementById('modalBranchTargetComm').value = branch.targetCommission || 0;
}

async function saveBranch() {
    const name = document.getElementById('modalBranchName').value;
    const active = document.getElementById('modalBranchActive').checked;
    const branchTarget = document.getElementById('modalBranchTarget').value;
    const targetCommission = document.getElementById('modalBranchTargetComm').value;

    if (!name) return alert('Name is required');

    const data = { name, active, branchTarget, targetCommission };
    const token = localStorage.getItem('token');
    const method = state.editingBranchId ? 'PUT' : 'POST';
    const url = state.editingBranchId ? `/api/v1/commission-branches/${state.editingBranchId}` : '/api/v1/commission-branches';

    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            await refreshCommissionBranches();
            state.editingBranchId = null;
            document.getElementById('modalBranchName').value = '';
            document.getElementById('modalBranchTarget').value = '';
            document.getElementById('modalBranchTargetComm').value = '';
        }
    } catch (e) { console.error(e); }
}

// --- Sub Branch CRUD ---

async function refreshSubBranches() {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/v1/sub-branches?all=true', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
        const json = await res.json();
        state.subBranches = json.data;
        filterSubBranches();
        renderSubBranchTable();
    }
}

function filterSubBranches() {
    const sel = document.getElementById('saleBranch');
    if (!sel) return;

    sel.innerHTML = '<option value="">Select Sub Branch</option>';
    state.subBranches.filter(b => b.active).forEach(b => {
        sel.innerHTML += `<option value="${b.name}">${b.name}</option>`;
    });
}

function renderSubBranchTable() {
    const search = document.getElementById('modalSubBranchSearch').value.toLowerCase();
    const tbody = document.getElementById('modalSubBranchTableBody');
    const filtered = state.subBranches.filter(b =>
        b.name.toLowerCase().includes(search) || b.branch.toLowerCase().includes(search)
    );

    tbody.innerHTML = filtered.map(b => `
        <tr>
            <td>${b.name}</td>
            <td><i class="fas ${b.active ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i></td>
            <td>
                <button class="btn btn-sm btn-primary py-0" onclick="editSubBranch('${b._id}')">Edit</button>
            </td>
        </tr>
    `).join('');
}

function showSubBranchModal() {
    state.editingSubBranchId = null;
    document.getElementById('modalSubBranchName').value = '';
    document.getElementById('modalSubBranchActive').checked = true;
    new bootstrap.Modal(document.getElementById('subBranchModal')).show();
}

function editSubBranch(id) {
    const sb = state.subBranches.find(b => b._id === id);
    if (!sb) return;
    state.editingSubBranchId = id;
    document.getElementById('modalSubBranchName').value = sb.name;
    document.getElementById('modalSubBranchActive').checked = sb.active;
}

async function saveSubBranch() {
    const name = document.getElementById('modalSubBranchName').value;
    const active = document.getElementById('modalSubBranchActive').checked;

    if (!name) return alert('Name is required');

    const data = { name, active };
    const token = localStorage.getItem('token');
    const method = state.editingSubBranchId ? 'PUT' : 'POST';
    const url = state.editingSubBranchId ? `/api/v1/sub-branches/${state.editingSubBranchId}` : '/api/v1/sub-branches';

    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            await refreshSubBranches();
            state.editingSubBranchId = null;
            document.getElementById('modalSubBranchName').value = '';
        }
    } catch (e) { console.error(e); }
}

// --- Calculation Logic ---

function loadTargetDetails() {
    // Always default to 0 as requested
    document.getElementById('targetAchieved').value = 0;

    // Trigger calculation for all rows
    renderTable();
}

function calculateRowCom() {
    const sale = parseFloat(document.getElementById('saleInput').value) || 0;
    const per = parseFloat(document.getElementById('percentage').value) || 0;
    const comm = (sale * per) / 100;
    document.getElementById('commission').value = comm.toFixed(2);

    const itemWise = parseFloat(document.getElementById('itemWiseCommission').value) || 0;
    const dailyTarget = parseFloat(document.getElementById('dailyTarget').value) || 0;
    const monthlyTarget = parseFloat(document.getElementById('monthlyTarget').value) || 0;

    // Projected Target Commission for this row
    const saleBranch = document.getElementById('saleBranch').value;
    const commBranchId = document.getElementById('commissionBranch').value;
    const commBranchObj = state.commissionBranches.find(b => b._id === commBranchId);
    const commBranchStd = standardizeBranchName(commBranchObj ? commBranchObj.name : '');

    let projectedTmTarget = 0;
    if (standardizeBranchName(saleBranch) === commBranchStd) {
        const targetAmt = parseFloat(document.getElementById('targetAchieved').value) || 0;
        const matchingSaleInTable = state.tableData
            .filter(r => standardizeBranchName(r.saleBranch) === commBranchStd)
            .reduce((acc, r) => acc + r.saleAmount, 0);

        const projectedTotalMatching = matchingSaleInTable + sale;
        const mts = projectedTotalMatching > 0 ? (targetAmt / projectedTotalMatching) : 0;
        projectedTmTarget = mts * sale;
    }

    // Total Commission should include all bonuses/incentives
    const total = comm + itemWise + dailyTarget + monthlyTarget + projectedTmTarget;
    document.getElementById('totalCommission').value = total.toFixed(2);
}

// Auto calculate total whenever itemWise changes
// Event listeners handled in setupEventListeners now
document.getElementById('paidCommission').addEventListener('input', () => {
    // Just a placeholder for now
});

function addRow() {
    const empId = document.getElementById('employee').value;
    if (!empId) return alert('Select Employee');

    const saleBranch = document.getElementById('saleBranch').value;
    const sale = parseFloat(document.getElementById('saleInput').value) || 0;
    const per = parseFloat(document.getElementById('percentage').value) || 0;
    const comm = parseFloat(document.getElementById('commission').value) || 0;
    const itemWise = parseFloat(document.getElementById('itemWiseCommission').value) || 0;
    const dailyTarget = parseFloat(document.getElementById('dailyTarget').value) || 0;
    const monthlyTarget = parseFloat(document.getElementById('monthlyTarget').value) || 0;
    const paidComm = parseFloat(document.getElementById('paidCommission').value) || 0;

    const totalComm = parseFloat(document.getElementById('totalCommission').value) || 0;

    const emp = state.employees.find(e => e._id === empId);
    if (!emp) return alert('Employee data not found. Please refresh and try again.');

    const totalSale = parseFloat(document.getElementById('totalSale').value) || 0;
    const targetAmt = parseFloat(document.getElementById('targetAchieved').value) || 0;
    const mts = totalSale > 0 ? (targetAmt / totalSale) : 0;
    const tmTarget = mts * sale;

    const rowData = {
        id: empId,
        name: emp.name,
        saleBranch,
        saleAmount: sale,
        percentage: per,
        commission: comm,
        itemWiseCommission: itemWise,
        dailyTarget,
        monthlyTarget,
        mts: mts,
        tmTarget: tmTarget,
        totalCommission: totalComm + tmTarget,
        paidCommission: paidComm,
        balanceCommission: (totalComm + tmTarget) - paidComm
    };

    state.tableData.push(rowData);
    renderTable();
    clearInputs();
}

function resetForm() {
    if (state.tableData.length > 0 && !confirm('Clear current data and start a new entry?')) return;
    state.tableData = [];
    state.editingId = null;
    state.editingBranch = null;
    clearInputs();
    renderTable();
}

function clearInputs() {
    $('#employee').val('').trigger('change');
    document.getElementById('saleBranch').value = '';
    document.getElementById('saleInput').value = '';
    document.getElementById('percentage').value = '';
    document.getElementById('commission').value = '';
    document.getElementById('itemWiseCommission').value = '';
    document.getElementById('dailyTarget').value = '';
    document.getElementById('monthlyTarget').value = '';
    document.getElementById('totalCommission').value = '';
    document.getElementById('paidCommission').value = '';
    document.getElementById('targetAchieved').value = 0;
}

function removeRow(index) {
    state.tableData.splice(index, 1);
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('entryTableBody');
    tbody.innerHTML = '';

    const targetAmt = parseFloat(document.getElementById('targetAchieved').value) || 0;

    const commBranchId = document.getElementById('commissionBranch').value;
    const commBranchObj = state.commissionBranches.find(b => b._id === commBranchId);
    const commBranchStd = standardizeBranchName(commBranchObj ? commBranchObj.name : '');

    const totalMatchingSale = state.tableData
        .filter(r => standardizeBranchName(r.saleBranch) === commBranchStd)
        .reduce((acc, r) => acc + r.saleAmount, 0);

    const globalMts = totalMatchingSale > 0 ? (targetAmt / totalMatchingSale) : 0;

    let totalSale = 0, totalComm = 0, totalItemWise = 0, totalGrand = 0, totalPaid = 0, totalBal = 0;
    let totalDaily = 0, totalMonthly = 0, totalTmTarget = 0;

    state.tableData.forEach((row, index) => {
        // Recalculate based on current targetAmt and branch matching
        if (standardizeBranchName(row.saleBranch) === commBranchStd) {
            row.mts = globalMts;
            row.tmTarget = globalMts * row.saleAmount;
        } else {
            row.mts = 0;
            row.tmTarget = 0;
        }

        row.totalCommission = row.commission + row.itemWiseCommission + row.dailyTarget + row.monthlyTarget + row.tmTarget;
        row.balanceCommission = row.totalCommission - row.paidCommission;

        totalSale += row.saleAmount;
        totalComm += row.commission;
        totalItemWise += row.itemWiseCommission;
        totalDaily += row.dailyTarget;
        totalMonthly += row.monthlyTarget;
        totalTmTarget += row.tmTarget;
        totalGrand += row.totalCommission;
        totalPaid += row.paidCommission;
        totalBal += row.balanceCommission;

        tbody.innerHTML += `
            <tr>
                <td><i class="fas fa-times text-danger" style="cursor:pointer" onclick="removeRow(${index})"></i></td>
                <td>${row.name || row.employeeName || 'N/A'}</td>
                <td>${row.saleBranch || ''}</td>
                <td>${row.saleAmount.toFixed(2)}</td>
                <td>${row.percentage.toFixed(2)}</td>
                <td>${row.commission.toFixed(2)}</td>
                <td>${row.itemWiseCommission.toFixed(2)}</td>
                <td>${row.dailyTarget.toFixed(2)}</td>
                <td>${row.monthlyTarget.toFixed(2)}</td>
                <td>${row.mts.toFixed(4)}</td>
                <td>${row.tmTarget.toFixed(2)}</td>
                <td>${row.totalCommission.toFixed(2)}</td>
                <td>${row.paidCommission.toFixed(2)}</td>
                <td>${row.balanceCommission.toFixed(2)}</td>
            </tr>
        `;
    });

    document.getElementById('footerSale').innerText = totalSale.toFixed(2);
    document.getElementById('footerComm').innerText = totalComm.toFixed(2);
    document.getElementById('footerItemWise').innerText = totalItemWise.toFixed(2);
    document.getElementById('footerDailyTarget').innerText = totalDaily.toFixed(2);
    document.getElementById('footerMonthlyTarget').innerText = totalMonthly.toFixed(2);
    document.getElementById('footerTmTarget').innerText = totalTmTarget.toFixed(2);
    document.getElementById('footerTotalComm').innerText = totalGrand.toFixed(2);
    document.getElementById('footerPaidComm').innerText = totalPaid.toFixed(2);
    document.getElementById('footerBalComm').innerText = totalBal.toFixed(2);

    // Top headers update
    document.getElementById('totalSale').value = totalSale.toFixed(0);

    renderSummary();
}

function renderSummary() {
    const summary = {}; // { name: { count, total } }
    let totalCount = 0;
    let grandSum = 0;

    state.tableData.forEach(row => {
        const name = row.name || row.employeeName || 'N/A';
        if (!summary[name]) {
            summary[name] = { count: 0, total: 0 };
        }
        summary[name].count++;
        summary[name].total += row.totalCommission;

        totalCount++;
        grandSum += row.totalCommission;
    });

    const tbody = document.getElementById('summaryTableBody');
    tbody.innerHTML = Object.keys(summary).map(name => `
        <tr>
            <td>${name}</td>
            <td>${summary[name].count}</td>
            <td>${summary[name].total.toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('summaryTotalCount').innerText = totalCount;
    document.getElementById('summaryGrandTotal').innerText = grandSum.toFixed(2);
}

// --- Save/Load Logic ---

async function saveData(silent = false) {
    const monthYear = document.getElementById('monthYear').value;
    const branch = document.getElementById('mainBranch').value;
    const department = document.getElementById('department').value;
    const commBranch = document.getElementById('commissionBranch').value;

    if (!monthYear || !branch || !commBranch) {
        alert('Please fill Month-Year, Main Branch, and Commission Branch');
        return false;
    }

    if (state.tableData.length === 0) {
        alert('Add at least one row');
        return false;
    }

    // Map internal state to model expected structure
    const mappedData = state.tableData.map(r => ({
        id: r.id,
        name: r.name,
        saleBranch: r.saleBranch,
        saleAmount: r.saleAmount,
        percentage: r.percentage,
        commission: r.commission,
        itemWiseCommission: r.itemWiseCommission,
        dailyTarget: r.dailyTarget,
        monthlyTarget: r.monthlyTarget,
        paidCommission: r.paidCommission,
        balanceCommission: r.balanceCommission,
        mts: r.mts,
        tmTarget: r.tmTarget,
        totalData: r.totalCommission // Using totalData field for aggregate
    }));

    const payload = {
        monthYear,
        branch,
        department,
        commissionBranch: commBranch,
        type: 'sale_commission',
        data: mappedData
    };

    // Safety check: Only attach editingId if saving the exact same commission branch
    if (state.editingId) {
        const currentEditBranch = state.editingBranch;
        if (currentEditBranch && String(currentEditBranch) !== String(commBranch)) {
            // User switched commission branch - clear old ID to avoid overwriting another branch
            state.editingId = null;
            state.editingBranch = null;
        } else {
            payload.id = state.editingId;
        }
    }

    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/v1/employee-commissions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            // Update editing ID so subsequent saves/prints update this record
            if (result.data && result.data._id) {
                state.editingId = result.data._id;
                state.editingBranch = commBranch;
            }

            if (!silent) {
                alert('Saved Successfully');
                // Refresh Data: Clear table and editing ID for new entry
                state.tableData = [];
                state.editingId = null;
                state.editingBranch = null;
                clearInputs();
                renderTable();
            }
            return true;
        } else {
            alert(result.message || 'Error saving data');
            return false;
        }
    } catch (e) {
        console.error(e);
        return false;
    }
}

function showListModal() {
    new bootstrap.Modal(document.getElementById('listModal')).show();
    // Ensure filter is populated with commission branches
    const selList = document.getElementById('listCommissionBranchFilter');
    if (selList) {
        const activeBranches = state.commissionBranches.filter(b => b.active);
        selList.innerHTML = '<option value="">All Comm Branches</option>';
        activeBranches.forEach(b => {
            selList.innerHTML += `<option value="${b._id}">${b.name}</option>`;
        });
    }
    // Default search to the active screen monthYear so the records just worked on are immediately visible!
    const activeMonth = document.getElementById('monthYear').value || new Date().toISOString().slice(0, 7);
    const parts = activeMonth.split('-');
    const yr = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10);
    const lastDay = new Date(yr, mo, 0).getDate();
    document.getElementById('listFromDate').value = `${activeMonth}-01`;
    document.getElementById('listToDate').value = `${activeMonth}-${String(lastDay).padStart(2, '0')}`;
    fetchList(); // Load automatically
}

async function fetchList() {
    const token = localStorage.getItem('token');
    const fromDate = document.getElementById('listFromDate').value;
    const toDate = document.getElementById('listToDate').value;
    const filterEl = document.getElementById('listCommissionBranchFilter');
    const branchFilter = filterEl ? filterEl.value : '';

    console.log('Fetching list with filters:', { fromDate, toDate, branchFilter });

    try {
        const res = await fetch('/api/v1/employee-commissions/list', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const json = await res.json();
            let filtered = (json.data || []).filter(c => c.type === 'sale_commission');

            // Apply branch filter (handles populated object and raw ID string)
            if (branchFilter) {
                filtered = filtered.filter(c => {
                    const cBranchId = (c.commissionBranch && typeof c.commissionBranch === 'object')
                        ? (c.commissionBranch._id || c.commissionBranch.id)
                        : c.commissionBranch;
                    return String(cBranchId) === String(branchFilter);
                });
            }

            // MonthYear filtering (inclusive range)
            if (fromDate && toDate) {
                const startMonth = fromDate.slice(0, 7);
                const endMonth = toDate.slice(0, 7);
                filtered = filtered.filter(c => c.monthYear >= startMonth && c.monthYear <= endMonth);
            }

            console.log('Filtered commissions:', filtered.length);

            const tbody = document.getElementById('listTableBody');
            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-muted">No commission records found for selected period and branch.</td></tr>`;
                return;
            }

            tbody.innerHTML = filtered.map(c => {
                const sale = (c.data || []).reduce((acc, curr) => acc + (curr.saleAmount || 0), 0);
                const itemWise = (c.data || []).reduce((acc, curr) => acc + (curr.itemWiseCommission || 0), 0);
                const dt = (c.data || []).reduce((acc, curr) => acc + (curr.dailyTarget || 0), 0);
                const mt = (c.data || []).reduce((acc, curr) => acc + (curr.monthlyTarget || 0), 0);
                const tc = (c.data || []).reduce((acc, curr) => acc + (curr.totalData || 0), 0);
                const pc = (c.data || []).reduce((acc, curr) => acc + (curr.paidCommission || 0), 0);

                const cBranchId = (c.commissionBranch && typeof c.commissionBranch === 'object')
                    ? (c.commissionBranch._id || c.commissionBranch.id)
                    : c.commissionBranch;
                const populatedName = (c.commissionBranch && typeof c.commissionBranch === 'object')
                    ? c.commissionBranch.name
                    : null;
                const cb = state.commissionBranches.find(b => String(b._id) === String(cBranchId));
                const branchDisplayName = populatedName || (cb ? cb.name : (c.commissionBranchName || 'N/A'));

                return `
                    <tr>
                        <td>
                            <div class="d-flex gap-2 justify-content-center">
                                <button class="list-action-btn list-btn-edit" onclick="loadRecord('${c._id}')" title="Edit"><i class="fas fa-edit"></i></button>
                                <button class="list-action-btn list-btn-print" onclick="printRecord('${c._id}')" title="Print"><i class="fas fa-print"></i></button>
                                <button class="list-action-btn list-btn-delete" onclick="deleteRecord('${c._id}')" title="Delete"><i class="fas fa-trash"></i></button>
                            </div>
                        </td>
                        <td class="small">${c._id.slice(-5)}</td>
                        <td>${c.monthYear}</td>
                        <td class="text-start ps-2 fw-semibold text-primary">${branchDisplayName}</td>
                        <td>${sale.toFixed(0)}</td>
                        <td>${itemWise.toFixed(0)}</td>
                        <td>${dt.toFixed(0)}</td>
                        <td>${mt.toFixed(0)}</td>
                        <td>${tc.toFixed(0)}</td>
                        <td>${pc.toFixed(0)}</td>
                    </tr>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Fetch List Error:', error);
    }
}

async function loadRecord(id) {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/v1/employee-commissions/detail/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
        const json = await res.json();
        const rec = json.data;
        const cBranchId = (rec.commissionBranch && typeof rec.commissionBranch === 'object')
            ? (rec.commissionBranch._id || rec.commissionBranch.id)
            : rec.commissionBranch;

        state.editingId = rec._id;
        state.editingBranch = cBranchId;
        document.getElementById('monthYear').value = rec.monthYear;
        document.getElementById('mainBranch').value = rec.branch;
        const dept = rec.department || '';
        document.getElementById('department').value = dept;
        populateEmployees(dept);
        document.getElementById('commissionBranch').value = cBranchId || '';
        loadTargetDetails();

        state.tableData = rec.data.map(d => {
            // Unify old and new formats
            const finalId = d.id || d.employeeId;
            let finalName = d.name || d.employeeName;

            // If name is still missing or invalid, try to find it in loaded employees
            if (!finalName || finalName === 'undefined' || finalName === 'null') {
                const emp = state.employees.find(e => e._id.toString() === (finalId || '').toString());
                finalName = emp ? emp.name : 'Unknown';
            }

            return {
                id: finalId,
                name: finalName,
                saleBranch: d.saleBranch,
                saleAmount: d.saleAmount,
                percentage: d.percentage,
                commission: d.commission,
                itemWiseCommission: d.itemWiseCommission,
                dailyTarget: d.dailyTarget,
                monthlyTarget: d.monthlyTarget,
                mts: d.mts,
                tmTarget: d.tmTarget,
                totalCommission: d.totalData || d.totalCommission,
                paidCommission: d.paidCommission,
                balanceCommission: d.balanceCommission
            };
        });

        renderTable();
        bootstrap.Modal.getInstance(document.getElementById('listModal')).hide();
    }
}

async function deleteRecord(id) {
    if (!confirm('Are you sure you want to delete this commission record?')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/v1/employee-commissions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
        fetchList();
    }
}

async function ensureEmployeesLoaded() {
    if (state.employees && state.employees.length > 0) return;
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    const resEmp = await fetch('/api/v1/employees?limit=1000', { headers });
    if (resEmp.ok) {
        const json = await resEmp.json();
        state.employees = json.data;
    }
}

// Misc
async function refreshEmployees() {
    await loadInitialData();
}

async function printCommission() {
    // Save data first
    const saved = await saveData(true);
    if (!saved) return;

    await ensureEmployeesLoaded();
    const data = {
        branch: document.getElementById('mainBranch').value,
        monthYear: document.getElementById('monthYear').value,
        commissionBranch: document.getElementById('commissionBranch'),
        data: state.tableData
    };

    const cbId = data.commissionBranch.value;
    const cb = state.commissionBranches.find(b => b._id === cbId);
    const cbName = data.commissionBranch.options[data.commissionBranch.selectedIndex]?.text || 'N/A';

    const targetAchieved = parseFloat(document.getElementById('targetAchieved').value) || 0;

    generatePremiumReport({
        branch: data.branch,
        monthYear: data.monthYear,
        commissionBranchName: cbName,
        data: data.data,
        branchTarget: cb ? cb.branchTarget : 0,
        targetCommission: targetAchieved
    });

    // Clear screen after printing/saving
    state.tableData = [];
    state.editingId = null;
    clearInputs();
    renderTable();
    alert('Data Saved and Report Generated!');
}

function populateEmployees(departmentName = '') {
    const $sel = $('#employee');
    if ($sel.length === 0) return;

    $sel.empty();
    $sel.append('<option value="">Select Employee</option>');

    const selectedBranch = document.getElementById('mainBranch').value;

    // Filter by BOTH branch and department
    let filtered = state.employees;

    if (selectedBranch) {
        filtered = filtered.filter(e => {
            const empBranch = typeof e.branch === 'object' ? e.branch.name : e.branch;
            return (empBranch || '').toString().toLowerCase() === selectedBranch.toLowerCase();
        });
    }

    if (departmentName) {
        filtered = filtered.filter(e => {
            if (!e.department) return false;
            const empDept = typeof e.department === 'object' ? (e.department.name || '') : e.department;
            return empDept.trim().toLowerCase() === departmentName.trim().toLowerCase();
        });
    }

    filtered.forEach(e => {
        $sel.append(`<option value="${e._id}">${e.name} (${e.code || 'N/A'})</option>`);
    });

    // Initialize/Refresh Select2
    if ($sel.hasClass('select2-hidden-accessible')) {
        $sel.select2('destroy');
    }
    $sel.select2({
        placeholder: "Search Employee...",
        allowClear: true,
        width: '100%'
    });
}

async function printRecord(id) {
    await ensureEmployeesLoaded();
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/v1/employee-commissions/detail/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
        const json = await res.json();
        const rec = json.data;

        // Find commission branch name
        const cb = state.commissionBranches.find(b => b._id === rec.commissionBranch);
        const cbName = cb ? cb.name : (rec.commissionBranchName || 'N/A');

        generatePremiumReport({
            branch: rec.branch,
            monthYear: rec.monthYear,
            commissionBranchName: cbName,
            data: rec.data,
            branchTarget: cb ? cb.branchTarget : 0,
            targetCommission: cb ? cb.targetCommission : 0
        });
    }
}

function generatePremiumReport(reportData) {
    const { branch, monthYear, commissionBranchName, data, branchTarget = 0, targetCommission = 0 } = reportData;

    // Group data by employee and calculate branch-wise sales
    const groups = {};
    const branchSales = {}; // { branchName: amount }

    data.forEach(row => {
        // Ultra-robust resolution for print
        let empId = row.id || row.employeeId;
        let empName = row.name || row.employeeName;

        if (empName === 'undefined' || empName === 'null') empName = null;

        if (!empName || empName.trim() === '') {
            const empObj = state.employees.find(e => e._id.toString() === (empId || '').toString());
            empName = empObj ? empObj.name : (empId ? `ID: ${empId}` : 'Unknown Employee');
        }

        if (!groups[empName]) groups[empName] = [];
        groups[empName].push(row);

        // Branch-wise sale calculation
        const bName = (row.saleBranch || 'Unknown').trim();
        branchSales[bName] = (branchSales[bName] || 0) + (row.saleAmount || 0);
    });

    let mainBranchSaleAmount = 0;
    const otherBranchesList = [];

    // Standardize for comparison (remove spaces, hyphens, brackets etc)
    const std = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mainStd = std(commissionBranchName);

    for (const [bName, amount] of Object.entries(branchSales)) {
        const currentStd = std(bName);
        if (currentStd === mainStd || mainStd.includes(currentStd) || currentStd.includes(mainStd)) {
            mainBranchSaleAmount += amount;
        } else {
            otherBranchesList.push({ name: bName, amount: amount });
        }
    }

    let htmlContent = '';
    let grandTotalSale = 0, grandTotalComm = 0, grandTotalItemWise = 0, grandTotalNet = 0;

    let srNo = 1;
    for (const [empName, rows] of Object.entries(groups)) {
        let empSale = 0, empComm = 0, empItemWise = 0, empNet = 0;

        const rowItems = rows.map((row, idx) => {
            const s = row.saleAmount || 0;
            const c = row.commission || 0;
            const iw = row.itemWiseCommission || 0;
            const dt = row.dailyTarget || 0;
            const mt = row.monthlyTarget || 0;
            const tm = row.tmTarget || 0;
            const mts = row.mts || 0;
            const net = row.totalData || row.totalCommission || (c + iw + dt + mt + tm);

            empSale += s;
            empComm += c;
            empItemWise += iw;
            empNet += net;

            return `
                <tr>
                    ${idx === 0 ? `<td rowspan="${rows.length + 1}">${srNo++}</td>` : ''}
                    <td class="text-start ps-2">${row.saleBranch || ''}</td>
                    <td>${iw > 0 ? iw.toFixed(0) : '0'}</td>
                    <td>${dt.toFixed(0)}</td>
                    <td>${mt.toFixed(0)}</td>
                    <td>${tm.toFixed(0)}</td> 
                    <td>${s.toFixed(0)}</td>
                    <td>${(row.percentage || 0).toFixed(1)}</td>
                    <td>${c.toFixed(0)}</td>
                    <td>${net.toFixed(0)}</td>
                </tr>
            `;
        }).join('');

        grandTotalSale += empSale;
        grandTotalComm += empComm;
        grandTotalItemWise += empItemWise;
        grandTotalNet += empNet;

        htmlContent += `
            <tr class="emp-group-header">
                <td colspan="10" class="text-center font-bold" style="padding: 3px; font-size: 11px;">${empName.toUpperCase()}</td>
            </tr>
            ${rowItems}
            <tr class="emp-total-row" style="background: #fdfdfd;">
                <td class="font-bold">Total</td>
                <td class="font-bold">${empItemWise.toFixed(0)}</td>
                <td>${rows.reduce((acc, r) => acc + (r.dailyTarget || 0), 0).toFixed(0)}</td>
                <td>${rows.reduce((acc, r) => acc + (r.monthlyTarget || 0), 0).toFixed(0)}</td>
                <td>${rows.reduce((acc, r) => acc + (r.tmTarget || 0), 0).toFixed(0)}</td>
                <td class="font-bold highlight-cell">${empSale.toFixed(0)}</td>
                <td>-</td>
                <td class="font-bold">${empComm.toFixed(0)}</td>
                <td class="font-bold highlight-cell">${empNet.toFixed(0)}</td>
            </tr>
        `;
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>UG Commission Report</title>
            <style>
                @media print { 
                    @page { margin: 8mm; } 
                    .black-bg { -webkit-print-color-adjust: exact; background-color: #000 !important; color: #fff !important; }
                    .grand-total-row { -webkit-print-color-adjust: exact; background-color: #000 !important; color: #fff !important; }
                    .highlight-cell { -webkit-print-color-adjust: exact; background-color: #eee !important; }
                    .no-print { display: none !important; }
                }
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; margin: 0; padding: 5px; font-size: 10px; }
                .report-wrapper { max-width: 900px; margin: auto; border: 1px solid #000; padding: 12px; }
                
                .no-print-header { 
                    max-width: 900px; 
                    margin: 10px auto; 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center;
                    background: #f8f9fa;
                    padding: 10px 15px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }

                .print-btn {
                    padding: 8px 25px;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 14px;
                    border: 1px solid #218838;
                }
                .print-btn:hover { background: #218838; }

                .top-header { border: 1px solid #000; text-align: center; padding: 6px; margin-bottom: 12px; }
                .top-header h1 { margin: 0; font-size: 18px; text-transform: uppercase; font-weight: bold; }
                .top-header h2 { margin: 2px 0; font-size: 12px; font-weight: bold; }
                .top-header h3 { margin: 0; font-size: 10px; font-weight: normal; }
                
                table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                th, td { border: 1px solid #444; padding: 4px; text-align: center; }
                th { background: #fff; font-size: 9px; font-weight: bold; height: 30px; }
                
                /* Specific black headers from ref image */
                .black-bg { background-color: #000 !important; color: #fff !important; }
                .highlight-cell { background-color: #eee !important; }
                
                .font-bold { font-weight: bold; }
                .text-start { text-align: left; }
                
                .summary-container { margin-top: 20px; display: flex; justify-content: flex-start; gap: 20px; align-items: flex-start; }
                .summary-box { border: 1px solid #000; min-width: 220px; }
                .summary-box h4 { background: #000; color: #fff; border-bottom: 1px solid #000; margin: 0; padding: 5px; font-size: 10px; text-align: center; font-weight: bold; text-transform: uppercase; -webkit-print-color-adjust: exact; }
                .summary-box table { margin-top: 0; border: none; width: 100%; border-collapse: collapse; }
                .summary-box td { border: none; padding: 4px 8px; text-align: left; font-size: 10px; height: 25px; }
                .summary-box .val { text-align: center; font-weight: bold; border-left: 1px solid #000; width: 80px; }
                .grid-row td { border-bottom: 1px solid #000; }
                .grid-row:last-child td { border-bottom: none; }
                .summary-box tr.border-top td { border-top: 1px solid #000; }
                
                .footer-signs { margin-top: 60px; display: flex; justify-content: space-between; padding: 0 40px; }
                .sign-line { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 5px; font-weight: bold; font-size: 12px; }
                
                .grand-total-row { background: #000 !important; color: #fff !important; font-weight: bold; -webkit-print-color-adjust: exact; }
                .grand-total-row td { border-color: #444; }
                
                .emp-group-header td { background: #fff !important; color: #000 !important; font-size: 12px !important; }
            </style>
        </head>
        <body>
            <div class="report-wrapper">
                <div class="no-print-header no-print">
                    <span style="font-size: 14px; font-weight: bold; color: #333;">Print Preview - Check your data before printing</span>
                    <button class="print-btn" onclick="window.print()">Print Report</button>
                </div>
                <div class="top-header">
                    <h1>UG COMMISSION</h1>
                    <h2>${commissionBranchName}</h2>
                    <h3>${monthYear}</h3>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 30px;">SR. NO.</th>
                            <th style="width: 140px;">SALE BRANCH NAME</th>
                            <th>ITEM WISE COMMISSION</th>
                            <th>DAILY TARGET MONTHLY</th>
                            <th>TARGET MONTHLY</th>
                            <th>TARGET/SALE</th>
                            <th class="black-bg">SALE</th>
                            <th class="black-bg">SALE_PER</th>
                            <th class="black-bg">COMMISSION</th>
                            <th class="black-bg">TOTAL COMMISSION</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${htmlContent}
                        <tr class="grand-total-row">
                            <td colspan="2">GRAND TOTAL</td>
                            <td>${grandTotalItemWise.toFixed(0)}</td>
                            <td>${data.reduce((acc, r) => acc + (r.dailyTarget || 0), 0).toFixed(0)}</td>
                            <td>${data.reduce((acc, r) => acc + (r.monthlyTarget || 0), 0).toFixed(0)}</td>
                            <td>${data.reduce((acc, r) => acc + (r.tmTarget || 0), 0).toFixed(0)}</td>
                            <td style="background:#555 !important;">${grandTotalSale.toFixed(0)}</td>
                            <td>-</td>
                            <td>${grandTotalComm.toFixed(0)}</td>
                            <td style="background:#555 !important;">${grandTotalNet.toFixed(0)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="summary-container">
                    <div class="summary-box">
                        <h4>SALE SUMMARY</h4>
                        <table>
                            <tr class="grid-row"><td>${commissionBranchName.toUpperCase()} SALE</td><td class="val">${mainBranchSaleAmount.toFixed(0)}</td></tr>
                        </table>
                    </div>
                    <div class="summary-box">
                        <h4>OTHER BRANCHES SALE</h4>
                        <table>
                            ${otherBranchesList.length > 0
            ? otherBranchesList.map(b => `<tr class="grid-row"><td>${b.name}</td><td class="val">${b.amount.toFixed(0)}</td></tr>`).join('')
            : '<tr class="grid-row"><td>&nbsp;</td><td class="val">&nbsp;</td></tr>'
        }
                        </table>
                    </div>
                     <div class="summary-box">
                        <h4>BRANCH TARGET DETAIL</h4>
                        <table>
                            <tr class="grid-row"><td>BRANCH TARGET AMOUNT</td><td class="val">${branchTarget}</td></tr>
                            <tr class="grid-row border-top"><td>TARGET ACHIEVE AMOUNT</td><td class="val">${targetCommission}</td></tr>
                        </table>
                    </div>
                </div>

                <div class="footer-signs">
                    <div class="sign-line">Prepared By</div>
                    <div class="sign-line">Authorized By</div>
                </div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

