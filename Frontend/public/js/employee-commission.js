
// Employee Commission Management

let state = {
    currentTab: 'dep_item_wise',
    monthYear: new Date().toISOString().slice(0, 7),
    branch: '',
    department: '', // Initialized from selector
    subBranch: '',
    data: [], // Current table data
    masterData: [], // Items or Employees
    items: [],
    employees: [],
    employeeBranch: '',
    currentViewData: [],
    editingId: null,
    lockedEmployees: [],
    attendanceCounts: {}, // { empId: count }
    currentStoreRottiPrice: 0, // Store rotti price
    masterDataLoaded: false // Flag to avoid redundant master data fetches
};

document.addEventListener('DOMContentLoaded', async function () {
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    await setupGlobalFilters();
    await loadBranches();
    // Sync state.branch with whatever was selected (auto-selected or placeholder)
    state.branch = document.getElementById('mainBranch')?.value || '';

    await loadCategories();
    await loadMasterData(state.currentTab, state.branch);

    // NUCLEAR RESET: Force everything to empty string
    const resetSelectors = () => {
        ['whItemCategory', 'commissionItemCategory', 'globalSearch'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        state.branch = document.getElementById('mainBranch')?.value || '';
        state.editingId = null;
        state.data = mergeWithMaster(state.items, [], 'item');
        state.currentTab = 'dep_item_wise';
        applyLocalFilter(); // Respect category hidden rule
    };

    // Multiple sweeps to catch browser auto-fill/restoration
    resetSelectors();
    setTimeout(resetSelectors, 100);
    setTimeout(resetSelectors, 500);
    setTimeout(resetSelectors, 1000);

    // Keyboard Shortcuts
    document.addEventListener('keydown', function (e) {
        // Alt + S to Save
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveCurrentTab();
        }

        // Modal Shortcuts (only if modal is visible)
        const modal = document.getElementById('commissionListModal');
        if (modal && modal.classList.contains('show')) {
            // Ctrl to focus Search
            if (e.key === 'Control') {
                e.preventDefault();
                document.getElementById('modalListSearch')?.focus();
            }
            // Alt + B to focus Search as well (per user requirement)
            if (e.altKey && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                document.getElementById('modalListSearch')?.focus();
            }
        }
    });
});

async function setupGlobalFilters(isReset = false) {
    const today = new Date();
    document.getElementById('mainMonthYear').value = today.toISOString().slice(0, 7);

    // Default Dates for Rotti Perks - Set to full month
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

    if (document.getElementById('perksFromDate')) {
        document.getElementById('perksFromDate').value = firstDayOfMonth;
        document.getElementById('perksFromDate').addEventListener('change', () => loadCurrentTab());
    }
    if (document.getElementById('perksToDate')) {
        document.getElementById('perksToDate').value = lastDayOfMonth;
        document.getElementById('perksToDate').addEventListener('change', () => loadCurrentTab());
    }

    // Set default user
    if (localStorage.getItem('user')) {
        const user = JSON.parse(localStorage.getItem('user'));
        document.getElementById('userName').textContent = user.name || 'User';
    }
}

async function loadCategories(isReset = false) {
    try {
        const token = localStorage.getItem('token');

        // Load WH Item Categories
        const resWh = await fetch('/api/v1/wh-item-categories', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resWh.ok) {
            const json = await resWh.json();
            const categories = json.data || [];
            const sel = document.getElementById('whItemCategory');
            if (sel) {
                sel.innerHTML = '<option value="">Select WH Category</option>';
                categories.forEach(c => {
                    sel.innerHTML += `<option value="${c.name}">${c.name}</option>`;
                });
                if (isReset) sel.value = "";
            }
        }

        // Load Commission Item Categories
        const resComm = await fetch('/api/v1/commission-categories', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resComm.ok) {
            const json = await resComm.json();
            const categories = json.data || [];
            const sel = document.getElementById('commissionItemCategory');
            if (sel) {
                sel.innerHTML = '<option value="">Select Comm. Category</option>';
                categories.forEach(c => {
                    sel.innerHTML += `<option value="${c.name}">${c.name}</option>`;
                });
                if (isReset) sel.value = "";
            }
        }

        // Load Employee Departments for Global Filter
        const deptJson = await (window.cachedFetch ? window.cachedFetch('/api/v1/employee-departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        }) : fetch('/api/v1/employee-departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()));
        if (deptJson && deptJson.success) {
            const depts = deptJson.data || [];
            const sel = document.getElementById('globalDepartment');
            if (sel) {
                sel.innerHTML = '<option value="">All Departments</option>';
                depts.forEach(d => {
                    sel.innerHTML += `<option value="${d.name}">${d.name}</option>`;
                });
                if (isReset) sel.value = "";
            }
        }
    } catch (e) {
        console.error('Error loading categories:', e);
    }
}

// Auto-update when branch changes
document.getElementById('mainBranch')?.addEventListener('change', async () => {
    state.editingId = null; // Reset editing mode when branch changes
    state.branch = document.getElementById('mainBranch')?.value || '';
    // Only reload employees for the selected branch, NOT all master data (items don't change by branch)
    if (isEmployeeTab(state.currentTab)) {
        await loadBranchEmployees(state.branch, true); // Force refresh employees for new branch
    }
    loadCurrentTab();
});

// Auto-update when month changes
document.getElementById('mainMonthYear')?.addEventListener('change', () => {
    state.editingId = null;
    loadCurrentTab();
});

// Auto-update when department changes
document.getElementById('globalDepartment')?.addEventListener('change', () => {
    state.editingId = null;
    loadCurrentTab();
});

async function loadBranches(isReset = false) {
    const selects = ['mainBranch'];
    for (const id of selects) {
        await window.populateBranchSelect(id, {
            placeholder: 'Select Branch',
            triggerChange: id === 'mainBranch' 
        });
    }
}

async function loadMasterData(currentTab = state.currentTab, branch = state.branch) {
    try {
        const token = localStorage.getItem('token');

        // OPTIMIZATION: Load commission & WH items only ONCE per session (they don't change)
        if (!state.masterDataLoaded) {
            // Load Commission Items
            const resComm = await fetch('/api/v1/commission-items?limit=2000', { headers: { 'Authorization': `Bearer ${token}` } });
            let commItems = [];
            if (resComm.ok) {
                const json = await resComm.json();
                commItems = (json.data || []).map(i => ({ ...i, itemType: 'commission' }));
            }

            // Load WH Items
            const resWh = await fetch('/api/v1/wh-items?limit=2000', { headers: { 'Authorization': `Bearer ${token}` } });
            let whItems = [];
            if (resWh.ok) {
                const json = await resWh.json();
                whItems = (json.data || []).map(i => ({ ...i, itemType: 'wh' }));
            }

            state.items = [...commItems, ...whItems];
            state.masterDataLoaded = true;
            console.log('[OPTIMIZATION] Master data (items) loaded once per session');
        }

        // Load employees for the selected branch (this DOES change per branch)
        if (isEmployeeTab(currentTab)) {
            await loadBranchEmployees(branch);
        }
    } catch (e) {
        console.error("Failed to load master data", e);
    }
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

        if (resEmp.ok) {
            const json = await resEmp.json();
            state.employees = json.data || [];
            state.employeeBranch = branch;
                // If user is currently on an employee tab, ensure the UI refreshes
                try {
                    if (isEmployeeTab(state.currentTab)) await loadCurrentTab();
                } catch (e) { /* silent */ }
                return;
        }

        const resParties = await fetch(`/api/v1/parties?partyType=employee&branch=${encodedBranch}&limit=5000&t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resParties.ok) {
            const json = await resParties.json();
            state.employees = json.data || [];
            state.employeeBranch = branch;
            // If user is currently on an employee tab, ensure the UI refreshes
            try {
                if (isEmployeeTab(state.currentTab)) await loadCurrentTab();
            } catch (e) { /* silent */ }
            return;
        }

        state.employees = [];
        state.employeeBranch = branch;
    } catch (e) {
        console.error('Failed to load branch employees', e);
        state.employees = [];
        state.employeeBranch = branch;
    }
}

function isEmployeeTab(tabName) {
    return ['employee_wise', 'rotti_nashta', 'rotti_perks'].includes(tabName);
}

async function setTab(tabName) {
    state.currentTab = tabName;
    state.branch = document.getElementById('mainBranch')?.value || '';
    if (isEmployeeTab(tabName)) {
        await loadMasterData(tabName, state.branch);
    }
    loadCurrentTab();
}

async function loadCurrentTab(forceLoad = false) {
    state.monthYear = document.getElementById('mainMonthYear').value;
    state.branch = document.getElementById('mainBranch').value;
    state.department = document.getElementById('globalDepartment').value;

    if (!state.branch) {
        // No branch selected? Show zeros (master data)
        state.data = mergeWithMaster(
            state.currentTab === 'dep_item_wise' ? state.items : state.employees,
            [],
            state.currentTab === 'dep_item_wise' ? 'item' : 'employee'
        );
        if (document.getElementById('itemWiseBody')) document.getElementById('itemWiseBody').innerHTML = '';
        if (document.getElementById('empWiseBody')) document.getElementById('empWiseBody').innerHTML = '';
        if (document.getElementById('rottiNashtaBody')) document.getElementById('rottiNashtaBody').innerHTML = '';
        if (document.getElementById('rottiPerksBody')) document.getElementById('rottiPerksBody').innerHTML = '';
        return;
    }

    let subBranchId = '';
    if (state.currentTab === 'employee_wise') subBranchId = 'empSubBranch';
    else if (state.currentTab === 'rotti_nashta') subBranchId = 'rottiSubBranch';
    else if (state.currentTab === 'rotti_perks') subBranchId = 'perksSubBranch';

    state.subBranch = subBranchId ? (document.getElementById(subBranchId)?.value || '') : '';

    // Get categories if on item wise tab
    let whCat = "";
    let commCat = "";
    if (state.currentTab === 'dep_item_wise') {
        whCat = document.getElementById('whItemCategory').value;
        commCat = document.getElementById('commissionItemCategory').value;
    }

    // STRICTOR ENTRY MODE: For Item-Wise, we NEVER auto-load saved data. 
    // EXCEPT when we are explicitly editing a record from the List (forceLoad).
    if (state.currentTab === 'dep_item_wise' && !forceLoad && !state.editingId) {
        state.data = mergeWithMaster(state.items, [], 'item');
        applyLocalFilter(); // Respect selected categories
        hideLoading();
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const query = new URLSearchParams({
            monthYear: state.monthYear,
            branch: state.branch,
            department: state.department,
            subBranch: state.subBranch,
            type: state.currentTab
        });

        if (state.currentTab === 'dep_item_wise') {
            query.append('whCategory', whCat);
            query.append('commissionCategory', commCat);
        }

        if (state.currentTab === 'rotti_perks' || state.currentTab === 'rotti_nashta') {
            // 1. Fetch Store Details for Rotti Price
            try {
                const storeRes = await fetch(`/api/v1/stores?active=true&t=${Date.now()}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const storeJson = await storeRes.json();
                if (storeJson.success) {
                    // Find current branch store - robust matching
                    const currentStore = storeJson.data.find(s => {
                        const sName = s.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                        const bName = state.branch.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                        return sName === bName;
                    });
                    state.currentStoreRottiPrice = currentStore ? (currentStore.rotiPrice || 0) : 0;
                }
            } catch (e) { console.error('Store fetch error', e); }

            // 2. Fetch Attendance for Worked Days
            let pFrom = '';
            let pTo = '';
            
            if (state.currentTab === 'rotti_perks') {
                pFrom = document.getElementById('perksFromDate')?.value;
                pTo = document.getElementById('perksToDate')?.value;
            } else {
                // For Rotti & Nashta tab, use the full month based on global Month-Year selector
                const [y, m] = state.monthYear.split('-');
                pFrom = `${y}-${m}-01`;
                pTo = new Date(y, m, 0).toISOString().slice(0, 10);
            }

            state.attendanceCounts = {};

            if (pFrom && pTo && state.branch) {
                try {
                    const attRes = await fetch(`/api/v1/attendance?from=${pFrom}&to=${pTo}&branch=${state.branch}&limit=20000&t=${Date.now()}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const attJson = await attRes.json();
                    if (attJson.success) {
                        attJson.data.forEach(att => {
                            const isPresent = att.isPresent === true || att.isPresent === 'true' || 
                                            (att.displayStatus && att.displayStatus.toLowerCase().startsWith('p'));
                            
                            if (isPresent) {
                                const empRef = att.employee?._id || att.employee;
                                if (empRef) {
                                    const eId = empRef.toString();
                                    state.attendanceCounts[eId] = (state.attendanceCounts[eId] || 0) + 1;
                                }
                            }
                        });
                        console.log('Attendance Counts:', state.attendanceCounts);
                    }
                } catch (e) { console.error('Attendance fetch error', e); }
            }
        }

        // Fetch created payrolls to lock rows
        state.lockedEmployees = [];
        try {
            const payrollRes = await fetch(`/api/v1/payrolls?monthYear=${state.monthYear}&branch=${state.branch}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const payrollJson = await payrollRes.json();
            if (payrollJson.success) {
                state.lockedEmployees = payrollJson.data.map(p => (p.employee?._id || p.employee).toString());
            }
        } catch (e) {
            console.error('Error checking locked payrolls:', e);
        }

        const res = await fetch(`/api/v1/employee-commissions?${query}&t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const json = await res.json();
        let savedData = json.data ? (json.data.data || []) : [];

        if (state.currentTab === 'dep_item_wise') {
            state.data = mergeWithMaster(state.items, savedData, 'item');
            applyLocalFilter(); // Respect selected categories
        } else {
            // Populate state.data for all employee-based tabs
            state.data = mergeWithMaster(state.employees, savedData, 'employee');

            if (state.currentTab === 'rotti_perks') {
                state.data = state.data.filter(emp => {
                    const salary = parseFloat(emp.originalBasicSalary || emp.basicSalary || 0);
                    const allow = emp.allowRottiPerks === true || emp.allowRottiPerks === 'true';
                    return salary <= 20000 || allow;
                });
            }
            renderTable();
        }

        if (state.currentTab === 'dep_item_wise') applyLocalFilter();

    } catch (e) {
        console.error(e);
        alert('Error loading data');
        renderTable();
    } finally {
        hideLoading();
    }
}

function filterItemWiseTable() {
    // Apply local filtering to show only items from selected category (all with zero qty)
    applyLocalFilter();
}

function applyLocalFilter() {
    if (state.currentTab !== 'dep_item_wise') return;

    const whCat = document.getElementById('whItemCategory').value;
    const commCat = document.getElementById('commissionItemCategory').value;
    const search = (document.getElementById('itemSearch')?.value || '').toLowerCase();

    let filtered = [];

    // Category filtering (already handled by loadCurrentTab fetching saved data, 
    // but we still need to filter the MASTER items displayed in the list if they weren't saved)

    if (!whCat && !commCat) {
        filtered = []; // Don't show items until a category is selected
    } else {
        if (whCat) {
            const whMatches = state.data.filter(i => i.originType === 'wh' && i.whCategoryName === whCat);
            filtered = [...filtered, ...whMatches];
        }
        if (commCat) {
            const commMatches = state.data.filter(i => i.originType === 'commission' && i.commissionCategoryName === commCat);
            filtered = [...filtered, ...commMatches];
        }
    }

    // Apply Text Search Filter
    if (search) {
        filtered = filtered.filter(item =>
            item.name.toLowerCase().includes(search) ||
            item.code.toLowerCase().includes(search)
        );
    }

    renderTable(filtered);
}

function applyGlobalSearch() {
    const search = (document.getElementById('globalSearch')?.value || '').toLowerCase();
    if (!search) {
        renderTable(state.data);
        return;
    }

    const filtered = state.data.filter(item => {
        return (item.name || '').toLowerCase().includes(search) ||
            (item.code || '').toLowerCase().includes(search);
    });

    renderTable(filtered);
}

function clearItemFilters() {
    const whCat = document.getElementById('whItemCategory');
    const commCat = document.getElementById('commissionItemCategory');
    const search = document.getElementById('itemSearch');

    if (whCat) whCat.value = '';
    if (commCat) commCat.value = '';
    if (search) search.value = '';

    applyLocalFilter();
}

function applyPerksFilter() {
    if (state.currentTab !== 'rotti_perks') return;
    const search = (document.getElementById('perksSearch')?.value || '').toLowerCase();

    let filtered = state.data;
    if (search) {
        filtered = filtered.filter(emp =>
            (emp.name && emp.name.toLowerCase().includes(search)) ||
            (emp.code && emp.code.toLowerCase().includes(search))
        );
    }
    renderTable(filtered);
}

function applyRottiFilter() {
    if (state.currentTab !== 'rotti_nashta') return;

    const search = (document.getElementById('rottiSearch')?.value || '').toLowerCase();

    // Start with all data in state
    let filtered = state.data;

    if (search) {
        filtered = filtered.filter(emp =>
            (emp.name && emp.name.toLowerCase().includes(search)) ||
            (emp.code && emp.code.toLowerCase().includes(search))
        );
    }

    renderTable(filtered);
}

function mergeWithMaster(masterList, savedList, type) {
    if (type === 'item') {
        return masterList.map(m => {
            const mId = m._id?.toString() || m.id?.toString();
            const saved = savedList.find(s => s.id === mId);
            const catName = (m.category && m.category.name) ? m.category.name : '';

            return {
                id: mId,
                name: m.name,
                code: m.code || m.itemsCode || m.barcode || '',
                originType: m.itemType, // 'wh' or 'commission'
                whCategoryName: (m.itemType === 'wh') ? catName : '',
                commissionCategoryName: (m.itemType === 'commission') ? catName : '',
                incentive: (saved && saved.incentive !== undefined) ? saved.incentive : (m.incentive || 0),
                qty: saved ? saved.qty : 0,
                total: saved ? saved.total : 0,
                isSaved: !!(saved && (parseFloat(saved.qty) || 0) > 0)
            };
        }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    return masterList.map(m => {
        const mId = (m._id || m.id || '').toString();
        const saved = savedList.find(s => (s.id || '').toString() === mId);

        // Sanitize Department and Branch - Extract name if it's an object
        const dept = (m.department && typeof m.department === 'object') ? m.department.name : m.department;
        const br = (m.branch && typeof m.branch === 'object') ? m.branch.name : m.branch;

        // Rotti Perks Logic
        let rRate = saved ? saved.rottiRate : 0;
        let rTimes = saved ? saved.rottiTimes : 4; // Default 4 times
        let wDays = saved ? saved.workedDays : 0;

        if (state.currentTab === 'rotti_perks') {
            // Recalculate live data if not locked by paid payroll
            if (!state.lockedEmployees.includes(mId)) {
                wDays = state.attendanceCounts[mId] || 0;
                rRate = state.currentStoreRottiPrice || 0;
            }
        }

        const nTotal = saved ? saved.nashtaTotal : 0;
        const rTotalCalc = wDays * rTimes * rRate;
        const grandTotal = saved ? saved.totalData : (nTotal + rTotalCalc);

        return {
            id: mId,
            name: m.name,
            code: m.code || '',
            department: dept || '',
            branch: br || '',
            commission: saved ? saved.commission : 0,
            otherCommission: saved ? saved.otherCommission : 0,
            ugCommission: saved ? saved.ugCommission : 0,
            warehouseCommission: saved ? saved.warehouseCommission : 0,
            nashtaDays: saved ? saved.nashtaDays : 0,
            nashtaRate: saved ? saved.nashtaRate : 0,
            nashtaTotal: nTotal,
            rottiDays: saved ? saved.rottiDays : wDays,
            rottiRate: rRate,
            rottiTotal: saved ? saved.rottiTotal : rTotalCalc,
            basicSalary: saved ? saved.basicSalary : (m.basicSalary || 0),
            workedDays: wDays,
            rottiTimes: rTimes,
            totalData: grandTotal,
            allowRottiPerks: m.allowRottiPerks || false,
            originalBasicSalary: m.basicSalary || 0,
            isSaved: !!(saved && (
                (parseFloat(saved.commission) || 0) > 0 ||
                (parseFloat(saved.otherCommission) || 0) > 0 ||
                (parseFloat(saved.ugCommission) || 0) > 0 ||
                (parseFloat(saved.warehouseCommission) || 0) > 0 ||
                (parseFloat(saved.nashtaDays) || 0) > 0 ||
                (parseFloat(saved.rottiDays) || 0) > 0 ||
                (parseFloat(saved.totalData) || 0) > 0
            ))
        };
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
function renderTable(dataToRender = null) {
    const tab = state.currentTab;
    let tbodyId = '';
    let html = '';
    let data = [...(dataToRender || state.data)];
    
    // Always sort alphabetically by name for all tabs
    data.sort((a, b) => (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' }));

    // Apply Department Filter from Global Header for Employee Tabs ONLY (case-insensitive)
    const selDept = (document.getElementById('globalDepartment')?.value || '').toString().toLowerCase().trim();
    if (tab !== 'dep_item_wise' && selDept) {
        data = data.filter(e => (e.department || '').toString().toLowerCase().trim() === selDept);
    }

    // Apply Main Branch Filter from Global Header for Employee Tabs
    const headerBranch = document.getElementById('mainBranch')?.value || state.branch;
    if (tab !== 'dep_item_wise' && headerBranch) {
        data = data.filter(e => {
            const empBranch = (e.branch || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '').trim();
            const targetBranch = headerBranch.toString().toLowerCase().replace(/[^a-z0-9]/g, '').trim();
            const match = empBranch === targetBranch;

            if (!match && (e.name.includes('BILAL') || e.name.includes('WASI'))) {
                console.log(`Branch Mismatch for ${e.name}: empBranch='${empBranch}', targetBranch='${targetBranch}'`);
            } else if (match && (e.name.includes('BILAL') || e.name.includes('WASI'))) {
                console.log(`Branch Match for ${e.name}: empBranch='${empBranch}', targetBranch='${targetBranch}'`);
            }
            return match;
        });
    }

    state.currentViewData = data;

    if (tab === 'dep_item_wise') {
        tbodyId = 'itemWiseBody';

        // Final safety net: Never render item-wise if no category selected
        const whCat = document.getElementById('whItemCategory')?.value || '';
        const commCat = document.getElementById('commissionItemCategory')?.value || '';
        if (!whCat && !commCat) {
            data = [];
        }

        html = data.map((item, i) => {
            const isPaid = state.lockedEmployees.includes((item.id || '').toString());
            const isSaved = item.isSaved;
            const badge = isPaid ? '<span class="locked-badge">PAID</span>' : (isSaved ? '<span class="saved-badge">SAVED</span>' : '<span class="unpaid-badge">UNPAID</span>');
            const isLocked = isPaid || (isSaved && !state.editingId);

            return `
            <tr data-id="${item.id}" class="${isPaid ? 'row-locked' : (isSaved ? 'row-saved' : '')}">
                <td>${item.code}</td>
                <td class="name-cell text-start ps-3">${item.name} ${badge}</td>
                <td><input type="number" class="form-control form-control-sm text-center bg-light" value="${item.incentive || 0}" readonly></td>
                <td><input type="number" class="form-control form-control-sm text-center" value="${item.qty}" ${isLocked ? 'readonly' : ''} oninput="updateRow('${item.id}', 'qty', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm text-center" value="${item.total || 0}" readonly></td>
            </tr>
        `;
        }).join('');
    }
    else if (tab === 'employee_wise') {
        tbodyId = 'empWiseBody';
        let total = 0;
        html = data.map((emp, i) => {
            const isPaid = state.lockedEmployees.includes(emp.id.toString());
            const isSaved = emp.isSaved;
            const badge = isPaid ? '<span class="locked-badge">PAID</span>' : (isSaved ? '<span class="saved-badge">SAVED</span>' : '<span class="unpaid-badge">UNPAID</span>');
            const isLocked = isPaid || (isSaved && !state.editingId);

            total += parseFloat(emp.commission || 0);
            return `
            <tr data-id="${emp.id}" class="${isPaid ? 'row-locked' : (isSaved ? 'row-saved' : '')}">
                <td>${emp.code}</td>
                <td class="name-cell">${emp.name} ${badge}</td>
                <td><input type="number" class="form-control form-control-sm text-center" value="${emp.commission}" ${isLocked ? 'readonly' : ''} oninput="updateRow('${emp.id}', 'commission', this.value)"></td>
                <td>
                    ${isLocked ? '<i class="fas fa-lock text-warning"></i>' : `<button class="btn btn-sm btn-info" onclick="saveCurrentTab()"><i class="fas fa-save"></i></button>`}
                </td>
            </tr>
        `}).join('');
        const totalEl = document.getElementById('empWiseTotal');
        if (totalEl) totalEl.textContent = total.toFixed(2);
    }
    else if (tab === 'rotti_nashta') {
        tbodyId = 'rottiNashtaBody';
        let total = 0;
        let totalNashta = 0;
        let totalRotti = 0;

        html = data.map((emp, i) => {
            const isPaid = state.lockedEmployees.includes(emp.id.toString());
            const isSaved = emp.isSaved;
            const badge = isPaid ? '<span class="locked-badge">PAID</span>' : (isSaved ? '<span class="saved-badge">SAVED</span>' : '<span class="unpaid-badge">UNPAID</span>');
            const isLocked = isPaid || (isSaved && !state.editingId);

            const nTotal = parseFloat(emp.nashtaTotal) || 0;
            const rTotal = parseFloat(emp.rottiTotal) || 0;
            const grand = nTotal + rTotal;

            total += grand;
            totalNashta += nTotal;
            totalRotti += rTotal;

            return `
            <tr data-id="${emp.id}" class="${isPaid ? 'row-locked' : (isSaved ? 'row-saved' : '')}">
                <td>${emp.code}</td>
                <td class="name-cell">${emp.name} ${badge}</td>
                <td><input type="number" class="form-control form-control-sm text-center" style="width:70px" value="${emp.nashtaDays}" ${isLocked ? 'readonly' : ''} oninput="updateRow('${emp.id}', 'nashtaDays', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm text-center row-n-total" style="width:100px" value="${nTotal}" ${isLocked ? 'readonly' : ''} oninput="updateRow('${emp.id}', 'nashtaTotal', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm text-center" style="width:70px" value="${emp.rottiDays}" ${isLocked ? 'readonly' : ''} oninput="updateRow('${emp.id}', 'rottiDays', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm text-center row-r-total" style="width:100px" value="${rTotal}" ${isLocked ? 'readonly' : ''} oninput="updateRow('${emp.id}', 'rottiTotal', this.value)"></td>
                <td class="fw-bold row-total">${grand.toFixed(2)}</td>
            </tr>
        `}).join('');

        const totalEl = document.getElementById('rottiNashtaTotal');
        if (totalEl) totalEl.innerText = total.toFixed(2);

        const totalNashtaEl = document.getElementById('rottiNashtaColumnTotal');
        if (totalNashtaEl) totalNashtaEl.innerText = totalNashta.toFixed(2);

        const totalRottiEl = document.getElementById('rottiColumnTotal');
        if (totalRottiEl) totalRottiEl.innerText = totalRotti.toFixed(2);
    }
    else if (tab === 'rotti_perks') {
        tbodyId = 'rottiPerksBody';
        let total = 0;
        html = data.map((emp, i) => {
            const isPaid = state.lockedEmployees.includes((emp.id || '').toString());
            const isSaved = emp.isSaved;
            const badge = isPaid ? '<span class="locked-badge">PAID</span>' : (isSaved ? '<span class="saved-badge">SAVED</span>' : '<span class="unpaid-badge">UNPAID</span>');
            const isLocked = isPaid || (isSaved && !state.editingId);

            const tot = parseFloat(emp.totalData) || 0;
            total += tot;
            return `
            <tr data-id="${emp.id}" class="${isPaid ? 'row-locked' : (isSaved ? 'row-saved' : '')}">
                <td>${i + 1}</td>
                <td>${emp.code}</td>
                <td class="name-cell">${emp.name} ${badge}</td>
                <td><input type="number" class="form-control form-control-sm text-center bg-light" value="${emp.basicSalary}" readonly></td>
                <td><input type="number" class="form-control form-control-sm text-center bg-light" value="${emp.workedDays}" readonly></td>
                <td><input type="number" class="form-control form-control-sm text-center bg-light" value="${emp.rottiRate}" placeholder="Rotti" readonly></td> 
                <td><input type="number" class="form-control form-control-sm text-center bg-light" value="${emp.rottiTimes}" readonly></td>
                <td><input type="number" class="form-control form-control-sm text-center" value="${emp.nashtaRate}" placeholder="Nashta" ${isLocked ? 'readonly' : ''} oninput="updateRow('${emp.id}', 'nashtaRate', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm text-center" value="${emp.nashtaTotal}" ${isLocked ? 'readonly' : ''} oninput="updateRow('${emp.id}', 'nashtaTotal', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm text-center bg-light" value="${emp.totalData}" readonly></td>
            </tr>
        `}).join('');
        const totalEl = document.getElementById('rottiPerksGrandTotal');
        if (totalEl) totalEl.innerText = total.toFixed(2);
    }

    const container = document.getElementById(tbodyId);
    if (container) container.innerHTML = html;
}

function updateRow(id, field, value) {
    if (state.lockedEmployees.includes(id.toString())) {
        console.warn('Row is locked by payroll');
        return;
    }
    const item = state.data.find(i => i.id === id);
    if (!item) return;

    item[field] = parseFloat(value) || 0;

    if (state.currentTab === 'dep_item_wise') {
        const incentive = item.incentive || 0;
        const qty = item.qty || 0;
        const total = incentive * qty;
        item.total = total;

        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            const totalInput = row.querySelector('td:nth-child(5) input');
            if (totalInput) totalInput.value = total;
        }
    }
    else if (state.currentTab === 'employee_wise') {
        const total = state.data.reduce((sum, e) => sum + (parseFloat(e.commission) || 0), 0);
        const totalEl = document.getElementById('empWiseTotal');
        if (totalEl) totalEl.textContent = total.toFixed(2);
    }
    else if (state.currentTab === 'rotti_nashta') {
        const grand = (parseFloat(item.nashtaTotal) || 0) + (parseFloat(item.rottiTotal) || 0);

        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            const ntEl = row.querySelector('.row-n-total');
            const rtEl = row.querySelector('.row-r-total');
            const gtEl = row.querySelector('.row-total');
            if (ntEl) ntEl.value = item.nashtaTotal || 0;
            if (rtEl) rtEl.value = item.rottiTotal || 0;
            if (gtEl) gtEl.innerText = grand.toFixed(2);
        }

        let total = 0, totalNashta = 0, totalRotti = 0;

        state.data.forEach(e => {
            const n = parseFloat(e.nashtaTotal) || 0;
            const r = parseFloat(e.rottiTotal) || 0;
            totalNashta += n;
            totalRotti += r;
            total += (n + r);
        });

        const totalEl = document.getElementById('rottiNashtaTotal');
        if (totalEl) totalEl.innerText = total.toFixed(2);

        const totalNashtaEl = document.getElementById('rottiNashtaColumnTotal');
        if (totalNashtaEl) totalNashtaEl.innerText = totalNashta.toFixed(2);

        const totalRottiEl = document.getElementById('rottiColumnTotal');
        if (totalRottiEl) totalRottiEl.innerText = totalRotti.toFixed(2);
    }
    else if (state.currentTab === 'rotti_perks') {
        // Recalculate Logic
        // Total = (WorkedDays * RottiTimes * RottiRate) + NashtaTotal
        const wDays = parseFloat(item.workedDays) || 0;
        const rTimes = parseFloat(item.rottiTimes) || 0;
        const rRate = parseFloat(item.rottiRate) || 0; // Rotti Price
        const nTotal = parseFloat(item.nashtaTotal) || 0;

        const rTotal = wDays * rTimes * rRate;
        const grand = rTotal + nTotal;

        item.totalData = grand;

        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            const finalTotalEl = row.querySelector('td:last-child input'); // It's an input in this table
            if (finalTotalEl) finalTotalEl.value = grand.toFixed(2);
        }

        const total = state.data.reduce((sum, e) => sum + (parseFloat(e.totalData) || 0), 0);
        const totalEl = document.getElementById('rottiPerksGrandTotal');
        if (totalEl) totalEl.innerText = total.toFixed(2);
    }
}

async function saveCurrentTab() {
    const token = localStorage.getItem('token');

    // Refresh state from header inputs
    state.monthYear = document.getElementById('mainMonthYear').value;
    state.branch = document.getElementById('mainBranch').value;
    state.department = document.getElementById('globalDepartment').value;

    if (!state.branch || !state.monthYear) {
        return alert('Please select Branch and Month-Year first');
    }

    let whCat = "";
    let commCat = "";
    if (state.currentTab === 'dep_item_wise') {
        whCat = document.getElementById('whItemCategory').value;
        commCat = document.getElementById('commissionItemCategory').value;
    }

    let dataToSave = state.data.filter(item => {
        if (state.currentTab === 'dep_item_wise') {
            const hasQty = (parseFloat(item.qty) || 0) > 0;
            if (!hasQty) return false;
            if (whCat && item.originType === 'wh' && item.whCategoryName === whCat) return true;
            if (commCat && item.originType === 'commission' && item.commissionCategoryName === commCat) return true;
            if (!whCat && !commCat) return true;
            return false;
        } else if (state.currentTab === 'employee_wise' || state.currentTab === 'sale_commission') {
            return (parseFloat(item.commission) || 0) > 0;
        } else if (state.currentTab === 'rotti_nashta') {
            return (parseFloat(item.nashtaDays) || 0) > 0 || (parseFloat(item.rottiDays) || 0) > 0;
        } else if (state.currentTab === 'rotti_perks') {
            return (parseFloat(item.totalData) || 0) > 0;
        }
        return false;
    });

    if (dataToSave.length === 0) {
        return alert('No commission data found to save (Values > 0 required)');
    }

    const payload = {
        id: state.editingId,
        monthYear: state.monthYear,
        branch: state.branch,
        department: state.department,
        subBranch: state.subBranch,
        type: state.currentTab,
        whCategory: whCat,
        commissionCategory: commCat,
        fromDate: document.getElementById('perksFromDate')?.value,
        toDate: document.getElementById('perksToDate')?.value,
        remarks: document.getElementById('commissionRemarks')?.value || '',
        data: dataToSave
    };

    showLoading();

    try {
        const res = await fetch('/api/v1/employee-commissions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (json.success) {
            alert('Saved Successfully!');
            state.editingId = null; // Lock again after save
            try {
                const modalEl = document.getElementById('commissionListModal');
                const modalVisible = modalEl && modalEl.classList.contains('show');
                if (modalVisible) {
                    // If the List modal is open, refresh its records so the user sees the new entry
                    await loadCommissionRecords();
                } else {
                    // Otherwise refresh the current tab view
                    await loadCurrentTab(true);
                }
            } catch (e) {
                // Fallback to refreshing the current tab
                await loadCurrentTab(true);
            }
        } else {
            alert('Error: ' + json.message);
        }

    } catch (e) {
        console.error(e);
        alert('Failed to save');
    } finally {
        hideLoading();
    }
}

async function showCommissionList() {
    const modal = new bootstrap.Modal(document.getElementById('commissionListModal'));
    modal.show();

    // Populate branch filter in modal securely
    await window.populateBranchSelect('modalBranchFilter', {
        includeAll: true,
        placeholder: 'All Branches'
    });

    const mainBranchSel = document.getElementById('mainBranch');
    const modalBranchSel = document.getElementById('modalBranchFilter');
    if (mainBranchSel && modalBranchSel && mainBranchSel.value) {
        modalBranchSel.value = mainBranchSel.value;
    }

    loadCommissionRecords();
}

async function loadCommissionRecords() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/employee-commissions/list', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (!json.success) return;

        state.allSavedRecords = json.data; // Store full list for local filter

        // Default to current month and branch from main page
        const monthFilter = document.getElementById('modalMonthFilter');
        if (monthFilter) monthFilter.value = document.getElementById('mainMonthYear')?.value || "";

        filterModalList(); // Use the filter function to respect default branch selection
    } catch (e) {
        console.error(e);
    }
}

function renderModalList(records) {
    const body = document.getElementById('commissionListBody');
    body.innerHTML = records.map(c => {
        const dataStr = encodeURIComponent(JSON.stringify(c));

        return `
            <tr>
                <td style="width: 100px;">
                    <button class="btn-select-custom mx-auto" onclick="viewCommission('${dataStr}')">
                        <i class="far fa-edit"></i> Select
                    </button>
                </td>
                <td class="cell-blue-light fw-bold">${c.monthYear}</td>
                <td class="cell-blue-medium fw-bold">${c.branch}</td>
                <td class="cell-teal fw-bold text-uppercase">${c.department || '-'}</td>
                <td class="cell-green fw-bold text-uppercase">${c.type.replace(/_/g, ' ')}</td>
                <td class="cell-pink text-start ps-3 fw-bold">${[c.whCategory, c.commissionCategory].filter(Boolean).join(' / ') || '-'}</td>
                <td class="cell-muted text-start ps-3" style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.remarks || '-'}</td>
                <td class="cell-purple fw-normal small">${new Date(c.createdAt).toLocaleString()}</td>
                <td class="cell-blue-medium">
                    <div class="d-flex gap-1 justify-content-center">
                        <button class="btn btn-warning btn-sm text-white shadow-sm" onclick="printFromList('${dataStr}')"><i class="fas fa-print"></i></button>
                        <button class="btn btn-danger btn-sm shadow-sm" onclick="deleteCommissionRecord('${c._id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterModalList() {
    const search = (document.getElementById('modalListSearch')?.value || '').toLowerCase();
    const branchFilter = document.getElementById('modalBranchFilter')?.value || "";
    const typeFilter = document.getElementById('modalTypeFilter')?.value || "";
    const monthFilter = document.getElementById('modalMonthFilter')?.value || "";

    if (!state.allSavedRecords) return;

    const filtered = state.allSavedRecords.filter(c => {
        const matchesSearch = !search || (
            c.monthYear.toLowerCase().includes(search) ||
            c.branch.toLowerCase().includes(search) ||
            (c.department && c.department.toLowerCase().includes(search)) ||
            c.type.toLowerCase().includes(search) ||
            (c.whCategory && c.whCategory.toLowerCase().includes(search)) ||
            (c.commissionCategory && c.commissionCategory.toLowerCase().includes(search)) ||
            (c.remarks && c.remarks.toLowerCase().includes(search))
        );

        const matchesBranch = !branchFilter || c.branch === branchFilter;
        const matchesType = !typeFilter || c.type === typeFilter;
        const matchesMonth = !monthFilter || c.monthYear === monthFilter;

        return matchesSearch && matchesBranch && matchesType && matchesMonth;
    });

    renderModalList(filtered);
}

async function viewCommission(dataStr) {
    const c = JSON.parse(decodeURIComponent(dataStr));

    // Set editing context
    state.editingId = c._id || c.id;
    state.monthYear = c.monthYear;
    state.branch = c.branch;
    state.department = c.department || '';
    state.subBranch = c.subBranch || '';
    state.currentTab = c.type;

    // Set parameters in UI
    document.getElementById('mainMonthYear').value = c.monthYear;
    document.getElementById('mainBranch').value = c.branch;
    document.getElementById('globalDepartment').value = c.department || '';

    // If sub-branch selectors exist, set them
    ['empSubBranch', 'distSubBranch', 'rottiSubBranch', 'perksSubBranch'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = c.subBranch || '';
    });

    // Switch Tab UI
    const tabEl = document.querySelector(`button[data-bs-target="#${c.type.replace(/_/g, '-')}"]`);
    if (tabEl) {
        const tab = new bootstrap.Tab(tabEl);
        tab.show();
        state.currentTab = c.type;
    }

    // Set editing context
    state.editingId = c._id || c.id;

    // Set Categories if applicable
    if (c.type === 'dep_item_wise') {
        document.getElementById('whItemCategory').value = c.whCategory || '';
        document.getElementById('commissionItemCategory').value = c.commissionCategory || '';
        document.getElementById('itemSearch').value = '';
    }

    document.getElementById('commissionRemarks').value = c.remarks || '';

    // Load branch employees before loading tab data for employee-based tabs
    if (isEmployeeTab(c.type)) {
        await loadBranchEmployees(c.branch, true);
    }

    // Load data forcing the database fetch
    loadCurrentTab(true);

    // Close modal
    const modalEl = document.getElementById('commissionListModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}

async function printFromList(dataStr) {
    const c = JSON.parse(decodeURIComponent(dataStr));
    try {
        const token = localStorage.getItem('token');
        const id = c._id || c.id;
        if (!id) throw new Error('Record ID missing');

        const res = await fetch(`/api/v1/employee-commissions/detail/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({ message: 'Server error' }));
            throw new Error(errJson.message || 'Fetch failed');
        }

        const json = await res.json();
        if (json.success && json.data) {
            // SYNC HEADERS (Important for correct print report headers)
            const mainMonth = document.getElementById('mainMonthYear');
            const mainBranch = document.getElementById('mainBranch');
            const globalDept = document.getElementById('globalDepartment');

            if (mainMonth) mainMonth.value = json.data.monthYear;
            if (mainBranch) mainBranch.value = json.data.branch;
            if (globalDept) globalDept.value = json.data.department || '';

            if (json.data.type === 'dep_item_wise') {
                const whCat = document.getElementById('whItemCategory');
                const commCat = document.getElementById('commissionItemCategory');
                if (whCat) whCat.value = json.data.whCategory || '';
                if (commCat) commCat.value = json.data.commissionCategory || '';
            }

            // Set temporary view data and print
            const oldType = state.currentTab;
            const oldViewData = state.currentViewData;

            state.currentTab = json.data.type;
            state.currentViewData = json.data.data || [];

            await printCommission();

            // Restore state
            state.currentTab = oldType;
            state.currentViewData = oldViewData;
        }
    } catch (e) {
        console.error('Print from list error:', e);
        alert('Error fetching data for print: ' + e.message);
    }
}

async function deleteCommissionRecord(id) {
    if (!confirm('Are you sure you want to delete this commission record?')) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employee-commissions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
            alert('Deleted successfully');
            loadCommissionRecords();
        }
    } catch (e) {
        alert('Delete failed');
    }
}

async function printCommission() {
    let data = state.currentViewData || [];

    // Filter data to only show rows with actual values (Qty > 0 or Total > 0)
    if (state.currentTab === 'dep_item_wise') {
        data = data.filter(item => (parseFloat(item.qty) || 0) > 0);
    } else if (state.currentTab === 'employee_wise') {
        data = data.filter(item => (parseFloat(item.commission) || 0) > 0);
    } else if (state.currentTab === 'rotti_nashta') {
        data = data.filter(item => {
            const tot = (parseFloat(item.nashtaTotal) || 0) + (parseFloat(item.rottiTotal) || 0);
            return tot > 0;
        });
    } else if (state.currentTab === 'rotti_perks') {
        data = data.filter(item => (parseFloat(item.totalData) || 0) > 0);
    }

    if (data.length === 0) return alert('No data to print (Rows with Qty/Total > 0 required)');

    // Get Company Info
    let company = { name: 'BAS SOFTWARE', address: '', phone: '', logo: '' };
    try {
        const token = localStorage.getItem('token');
        const resSet = await fetch('/api/v1/settings', { headers: { 'Authorization': `Bearer ${token}` } });
        const jsonSet = await resSet.json();
        if (jsonSet.success && jsonSet.data) {
            company = jsonSet.data;
        }
    } catch (e) { }

    const branch = document.getElementById('mainBranch').value || 'All Branches';
    const month = document.getElementById('mainMonthYear').value;
    const dept = document.getElementById('globalDepartment')?.value || '';
    const subBranch = state.subBranch ? ` (${state.subBranch})` : '';

    let catInfo = "";
    if (state.currentTab === 'dep_item_wise') {
        const whCat = document.getElementById('whItemCategory')?.value || '';
        const commCat = document.getElementById('commissionItemCategory')?.value || '';
        if (whCat) catInfo = `Category: ${whCat}`;
        if (commCat) catInfo = `Category: ${commCat}`;
    }

    const printWindow = window.open('', '_blank');

    let tableHtml = "";
    let headers = [];
    let rows = [];

    if (state.currentTab === 'dep_item_wise') {
        headers = ['Code', 'Product Name', 'Incentive', 'Qty', 'Total'];
        rows = data.map(item => {
            const master = state.items.find(mi => mi._id === item.id || mi.id === item.id);
            const code = item.code || master?.itemsCode || master?.barcode || master?.code || '';
            return [code, item.name || '', Math.round(item.incentive || 0), Math.round(item.qty || 0), Math.round(item.total || 0)];
        });
    } else if (state.currentTab === 'employee_wise' || state.currentTab === 'sale_commission') {
        headers = ['Code', 'Employee Name', 'Commission'];
        rows = data.map(item => {
            const master = state.employees.find(me => me._id === item.id || me.id === item.id);
            const code = item.code || master?.code || '';
            const commValue = item.totalData || item.totalCommission || item.commission || 0;
            return [code, item.name || '', Math.round(commValue)];
        });
    } else if (state.currentTab === 'rotti_nashta') {
        headers = ['Code', 'Employee', 'N. Days', 'N. Total', 'R. Days', 'R. Total', 'G. Total'];
        rows = data.map(item => {
            const master = state.employees.find(me => me._id === item.id || me.id === item.id);
            const code = item.code || master?.code || '';
            const gTotal = (parseFloat(item.nashtaTotal || 0) + parseFloat(item.rottiTotal || 0));
            return [
                code, item.name || '', Math.round(item.nashtaDays || 0), Math.round(item.nashtaTotal || 0),
                Math.round(item.rottiDays || 0), Math.round(item.rottiTotal || 0),
                Math.round(gTotal)
            ];
        });
    } else if (state.currentTab === 'rotti_perks') {
        headers = ['Sr.', 'Code', 'Employee Name', 'Basic', 'Worked Days', 'Rotti Total', 'Nashta Total', 'G. Total'];
        rows = data.map((item, idx) => {
            const master = state.employees.find(me => me._id === item.id || me.id === item.id);
            const code = item.code || master?.code || '';
            return [
                idx + 1, code, item.name || '', Math.round(item.basicSalary || 0), Math.round(item.workedDays || 0),
                Math.round(item.rottiTotal || 0), Math.round(item.nashtaTotal || 0), Math.round(item.totalData || 0)
            ];
        });
    } else {
        // Fallback or generic
        headers = ['Code', 'Name', 'Total'];
        rows = data.map(item => {
            const master = state.employees.find(me => me._id === item.id || me.id === item.id) ||
                state.items.find(mi => mi._id === item.id || mi.id === item.id);
            const code = item.code || master?.code || master?.itemsCode || '';
            const totalVal = item.total || item.totalData || item.totalCommission || 0;
            return [code, item.name || '', Math.round(totalVal)];
        });
    }

    const totalInList = rows.reduce((sum, row) => sum + (parseFloat(row[row.length - 1]) || 0), 0);
    const qtyTotal = (state.currentTab === 'dep_item_wise') ? rows.reduce((sum, row) => sum + (parseFloat(row[3]) || 0), 0) : 0;

    printWindow.document.write(`
        <html>
        <head>
            <title>Commission Report - ${branch}</title>
            <style>
                @page { size: A4; margin: 10mm; }
                body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #222; margin: 0; padding: 0; font-size: 11px; line-height: 1.4; }
                
                .print-container { width: 100%; max-width: 800px; margin: 0 auto; }
                
                .header-wrapper { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1a73e8; padding-bottom: 10px; margin-bottom: 20px; }
                .logo-section { display: flex; align-items: center; gap: 15px; }
                .logo-placeholder { width: 50px; height: 50px; background: #1a73e8; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 8px; font-size: 20px; }
                .company-info h1 { margin: 0; font-size: 20px; color: #1a73e8; letter-spacing: 0.5px; }
                .company-info p { margin: 0; font-size: 10px; color: #555; }
                
                .report-meta { text-align: right; }
                .report-meta h2 { margin: 0; font-size: 16px; color: #333; text-transform: uppercase; }
                .report-meta .badge { display: inline-block; background: #e8f0fe; color: #1a73e8; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-top: 5px; }

                .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; background: #f8f9fa; padding: 10px; border-radius: 6px; border: 1px solid #e0e0e0; }
                .info-item { display: flex; flex-direction: column; }
                .info-label { font-size: 9px; color: #777; text-transform: uppercase; font-weight: bold; }
                .info-value { font-size: 11px; color: #333; font-weight: 500; }

                table.data-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                table.data-table th { background: #f1f3f4; color: #202124; padding: 6px 4px; text-align: center; border: 1px solid #dadce0; font-size: 10px; text-transform: uppercase; }
                table.data-table td { padding: 5px 4px; border: 1px solid #dadce0; text-align: center; font-size: 10px; }
                table.data-table tr:nth-child(even) { background: #fafafa; }
                .text-start { text-align: left !important; padding-left: 8px !important; }
                .text-end { text-align: right !important; padding-right: 8px !important; }

                .totals-row { background: #eee !important; font-weight: bold; font-size: 11px; }
                .totals-row td { border-top: 2px solid #444 !important; }
                
                @media print {
                    .no-print { display: none !important; }
                    @page { margin: 10mm; }
                }

                .no-print-header { 
                    max-width: 800px; 
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

                .footer { margin-top: 40px; display: flex; justify-content: space-between; gap: 50px; }
                .sig-box { flex: 1; border-top: 1px solid #999; text-align: center; padding-top: 8px; font-size: 10px; color: #666; }
                
                .print-footer { margin-top: 20px; border-top: 1px solid #eee; padding-top: 5px; font-size: 8px; color: #aaa; text-align: center; }
            </style>
        </head>
        <body>
            <div class="print-container">
                <div class="no-print-header no-print">
                    <span style="font-size: 14px; font-weight: bold; color: #333;">Report Preview - Check your data before printing</span>
                    <button class="print-btn" onclick="window.print()">Print Report</button>
                </div>
                <div class="header-wrapper">
                    <div class="logo-section">
                        ${company.logo ? `<img src="${company.logo}" style="max-height: 50px; max-width: 150px;">` : `<div class="logo-placeholder">${company.companyName[0]}</div>`}
                        <div class="company-info">
                            <h1>${company.companyName}</h1>
                            <p>${company.address || ''}</p>
                            <p>Phone: ${company.phone || ''} ${company.email ? '| Email: ' + company.email : ''}</p>
                        </div>
                    </div>
                    <div class="report-meta">
                        <h2>Commission Details</h2>
                        <div class="badge">${state.currentTab.replace(/_/g, ' ').toUpperCase()}</div>
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Branch</span>
                        <span class="info-value">${branch}${subBranch}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Department</span>
                        <span class="info-value">${dept}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Period</span>
                        <span class="info-value">${month}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">${catInfo ? 'Category' : 'Generated At'}</span>
                        <span class="info-value">${catInfo ? catInfo.replace('Category: ', '') : new Date().toLocaleString()}</span>
                    </div>
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                ${row.map((cell, idx) => `
                                    <td class="${idx === 1 ? 'text-start' : (idx === row.length - 1 ? 'text-end fw-bold' : '')}">
                                        ${cell}
                                    </td>
                                `).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="totals-row">
                            ${state.currentTab === 'dep_item_wise' ? `
                                <td colspan="3" class="text-end">GRAND TOTAL</td>
                                <td style="text-align: center;">${Math.round(qtyTotal)}</td>
                                <td class="text-end">${Math.round(totalInList)}</td>
                            ` : `
                                <td colspan="${headers.length - 1}" class="text-end">GRAND TOTAL</td>
                                <td class="text-end">${Math.round(totalInList)}</td>
                            `}
                        </tr>
                    </tfoot>
                </table>

                <div class="footer">
                    <div class="sig-box">Prepared By</div>
                    <div class="sig-box">Store Manager</div>
                    <div class="sig-box">Authorized Signature</div>
                </div>

                <div class="print-footer">
                    Generated via BAS Software System | User: ${document.getElementById('userName')?.textContent || 'System'} | Date: ${new Date().toLocaleString()}
                </div>
            </div>

        </body>
        </html>
    `);
    printWindow.document.close();
}

function showLoading() { }
function hideLoading() { }
function isAuthenticated() {
    return !!localStorage.getItem('token');
}

function resetForm() {
    if (!confirm('This will clear the current screen and start a new entry. Continue?')) return;
    state.editingId = null;
    state.data = [];
    loadCurrentTab(true); // Force reload with master data
}

