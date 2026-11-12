// Sub-Department-Wise Report Logic

let allBranches = [];
let allDepartments = [];
let validKeys = new Set(); // Stores "Branch-DeptName" for all valid sub-departments

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // Set Default Dates (Current Month)
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    // Format to YYYY-MM-DD for input type="date"
    const formatDate = (d) => {
        let month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear();
        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;
        return [year, month, day].join('-');
    };

    document.getElementById('fromDate').value = formatDate(firstDay);
    document.getElementById('toDate').value = formatDate(lastDay);

    loadFilters();
});

async function loadFilters() {
    try {
        const token = localStorage.getItem('token');

        // Load Branches
        const branchRes = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const branchData = await branchRes.json();
        if (branchData.success) {
            allBranches = branchData.data;
            const branchSelect = document.getElementById('branchSelect');
            branchSelect.innerHTML = '<option value="">All Branches</option>';

            // Get Logged In User
            const user = JSON.parse(localStorage.getItem('user')) || {};
            const userBranch = user.branch;

            // Filter stores based on user's branch access
            const validStores = allBranches.filter(store => {
                const uBranch = String(userBranch || '').trim().toLowerCase();
                if (!uBranch || uBranch.includes('all branches')) return true;

                const sName = (store.name || '').trim().toLowerCase();
                return uBranch.includes(sName);
            });

            validStores.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b._id;
                opt.textContent = b.name;
                opt.setAttribute('data-name', b.name);
                branchSelect.appendChild(opt);
            });

            // Auto-select if user has only one branch
            if (validStores.length === 1) {
                branchSelect.value = validStores[0]._id;
            } else if (userBranch) {
                const uBranch = String(userBranch).trim().toLowerCase();
                const match = validStores.find(s => (s.name || '').trim().toLowerCase() === uBranch);
                if (match) branchSelect.value = match._id;
            }
        }

        // Setup branch change listener to reload departments when branch changes
        document.getElementById('branchSelect').addEventListener('change', loadDepartmentsForBranch);

        // Initial load of departments for selected/default branch
        loadDepartmentsForBranch();

    } catch (err) {
        console.error('Error loading filters', err);
    }
}

async function loadDepartmentsForBranch() {
    const branchSelect = document.getElementById('branchSelect');
    const branchId = branchSelect.value;
    const deptSelect = document.getElementById('deptSelect');

    // Clear current options except "All"
    deptSelect.innerHTML = '<option value="">All Sub-Departments</option>';

    try {
        const token = localStorage.getItem('token');

        // Fetch all departments only once (Simple Caching)
        if (allDepartments.length === 0) {
            const response = await fetch('/api/v1/departments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const result = await response.json();
                allDepartments = result.data || [];
            } else {
                console.error('Failed to fetch departments');
                return;
            }
        }

        // Get selected branch name for filtering
        let branchName = '';
        if (branchId) {
            const selectedOption = branchSelect.options[branchSelect.selectedIndex];
            branchName = selectedOption.getAttribute('data-name');
        }

        // Filter departments based on branch selection AND closing2CompSale flag
        let filteredDepts = [];

        if (branchName) {
            // Filter by branch AND active status AND closing2CompSale flag
            filteredDepts = allDepartments.filter(d =>
                d.branch === branchName &&
                d.isActive &&
                d.closing2CompSale === true  // Only load departments with this flag
            );
        } else {
            // If "All Branches" selected, show all active departments with closing2CompSale
            filteredDepts = allDepartments.filter(d =>
                d.isActive &&
                d.closing2CompSale === true
            );
        }

        // Populate global whitelist of valid keys (Branch-DeptName)
        validKeys.clear();
        filteredDepts.forEach(d => {
            validKeys.add(`${d.branch}-${d.name}`);
        });

        // Get unique department names for dropdown
        const uniqueDepts = [];
        const seen = new Set();
        filteredDepts.forEach(d => {
            if (!seen.has(d.name)) {
                seen.add(d.name);
                uniqueDepts.push(d);
            }
        });

        // Sort by name
        uniqueDepts.sort((a, b) => a.name.localeCompare(b.name));

        // Populate dropdown
        uniqueDepts.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.name;
            opt.textContent = d.name;
            deptSelect.appendChild(opt);
        });

    } catch (e) {
        console.error("Error fetching departments", e);
    }
}

async function generateReport() {
    const btn = document.querySelector('.btn-generate');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Generating...';

    const branchId = document.getElementById('branchSelect').value;
    const branchName = branchId ? document.getElementById('branchSelect').options[document.getElementById('branchSelect').selectedIndex].getAttribute('data-name') : '';

    const deptName = document.getElementById('deptSelect').value;
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;

    try {
        const token = localStorage.getItem('token');
        let url = `/api/v1/closing-sheets/department-wise-report?startDate=${fromDate}&endDate=${toDate}&breakdown=true`;

        if (branchId && branchName) {
            url += `&branch=${encodeURIComponent(branchName)}`;
        } else {
            url += `&branch=all`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        let reportItems = result.data || [];

        // Apply Department Name Filter
        if (deptName) {
            const search = deptName.trim().toUpperCase();
            reportItems = reportItems.filter(item =>
                (item.dept || '').trim().toUpperCase() === search
            );
        }

        // Transform data
        const transformedItems = reportItems.map(item => ({
            branch: item.branch,
            dept: item.dept,
            parentDept: item.parentDept || 'OTHER',
            discount: item.discountValue || 0,
            discountPer: item.discountPer || 0,
            net: item.totalSaleComputer || 0,
            cost: item.cost || 0,
            dailyAverage: item.dailyAverage || 0
        }));

        renderReport(transformedItems);
        updateSummary(transformedItems);

    } catch (err) {
        console.error('Report Generation Error', err);
        document.getElementById('reportTableBody').innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Error generating report: ${err.message}</td></tr>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function updateSummary(data) {
    let tDisc = 0, tNet = 0;
    data.forEach(d => {
        tDisc += d.discount;
        tNet += d.net;
    });
    document.getElementById('totalDiscount').textContent = formatCurrency(tDisc);
    document.getElementById('netSale').textContent = formatCurrency(tNet);
}

function renderReport(data) {
    const table = document.querySelector('.custom-table');
    const tfoot = document.getElementById('reportTableFoot');

    // Clear existing bodies
    const oldBodies = table.querySelectorAll('tbody');
    oldBodies.forEach(b => b.remove());

    if (data.length === 0) {
        const tbody = document.createElement('tbody');
        tbody.id = 'reportTableBody';
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted">No records found for the selected criteria.</td></tr>';
        table.insertBefore(tbody, tfoot);
        tfoot.style.display = 'none';
        return;
    }

    // Sort: Branch -> ParentDept -> Dept
    data.sort((a, b) => {
        if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
        if (a.parentDept !== b.parentDept) return a.parentDept.localeCompare(b.parentDept);
        return a.dept.localeCompare(b.dept);
    });

    // Grouping structure: Branch -> Dept Group
    const branchGroups = {};
    data.forEach(item => {
        if (!branchGroups[item.branch]) branchGroups[item.branch] = {};
        if (!branchGroups[item.branch][item.parentDept]) branchGroups[item.branch][item.parentDept] = [];
        branchGroups[item.branch][item.parentDept].push(item);
    });

    let tDisc = 0, tNet = 0, tDaily = 0, tCost = 0;

    Object.keys(branchGroups).forEach(branchName => {
        const tbody = document.createElement('tbody');
        tbody.className = 'branch-group';

        // 1. BRANCH NAME (Adjusted for better screen balance)
        let groupHtml = `
            <tr class="branch-header" style="background: transparent !important; color: #1e4c8c !important; border-bottom: 3px solid #1e4c8c !important;">
                <td colspan="7" class="fw-800 text-uppercase py-3 text-center" style="font-size: 1.5rem; letter-spacing: 2px;">
                    <i class="fas fa-store me-3"></i> ${branchName}
                </td>
            </tr>
            <tr class="text-white text-uppercase fw-bold text-center" style="background: #1e4c8c !important;">
                <th class="ps-3 text-start" style="background: #1e4c8c !important; border-right: 2px solid white !important; border-bottom: 2px solid white !important; padding: 12px 10px; font-size: 0.9rem;">Branch</th>
                <th class="text-start" style="background: #1e4c8c !important; border-right: 2px solid white !important; border-bottom: 2px solid white !important; padding: 12px 10px; font-size: 0.9rem;">Sub-Department</th>
                <th class="text-end" style="background: #1e4c8c !important; border-right: 2px solid white !important; border-bottom: 2px solid white !important; padding: 12px 10px; font-size: 0.9rem;">DISC VALUE</th>
                <th class="text-end" style="background: #1e4c8c !important; border-right: 2px solid white !important; border-bottom: 2px solid white !important; padding: 12px 10px; font-size: 0.9rem;">Disc %</th>
                <th class="text-end" style="background: #1e4c8c !important; border-right: 2px solid white !important; border-bottom: 2px solid white !important; padding: 12px 10px; font-size: 0.9rem;">Net Sale</th>
                <th class="text-end" style="background: #1e4c8c !important; border-right: 2px solid white !important; border-bottom: 2px solid white !important; padding: 12px 10px; font-size: 0.9rem;">Cost</th>
                <th class="text-end" style="background: #1e4c8c !important; border-right: none !important; border-bottom: 2px solid white !important; padding: 12px 10px; font-size: 0.9rem;">Daily Average</th>
            </tr>
        `;

        const pDepts = branchGroups[branchName];
        Object.keys(pDepts).forEach(pDeptName => {
            const items = pDepts[pDeptName];

            // 2. DEPARTMENT NAME
            groupHtml += `
                <tr class="group-header">
                    <td colspan="7" class="fw-bold text-uppercase py-2 ps-4">
                        <i class="fas fa-folder-open me-2"></i> ${pDeptName}
                    </td>
                </tr>
            `;

            let subDisc = 0, subNet = 0, subDaily = 0, subCost = 0;

            items.forEach(item => {
                tDisc += item.discount;
                tNet += item.net;
                tDaily += item.dailyAverage;
                tCost += item.cost;

                subDisc += item.discount;
                subNet += item.net;
                subDaily += item.dailyAverage;
                subCost += item.cost;

                groupHtml += `
                <tr class="dept-row">
                    <td class="ps-3 text-dark fw-bold border-1">${item.branch}</td>
                    <td class="border-1">
                        <div class="d-flex align-items-center">
                            <span class="badge bg-light text-dark border-secondary dept-badge">${item.dept}</span>
                            <button class="btn btn-sm btn-outline-primary ms-auto py-0 px-2 d-print-none" onclick="showDetails('${item.branch}', '${item.dept}')" title="View Details" style="font-size: 0.8rem;">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </td>
                    <td class="text-end disc-value border-1">${formatCurrency(item.discount)}</td>
                    <td class="text-end border-1"><span class="badge disc-perc-badge">${item.discountPer.toFixed(2)}%</span></td>
                    <td class="text-end fw-bold border-1">${formatCurrency(item.net)}</td>
                    <td class="text-end text-danger fw-bold border-1">${formatCurrency(item.cost)}</td>
                    <td class="text-end text-primary fw-bold daily-avg-cell">${formatCurrency(item.dailyAverage)}</td>
                </tr>
                `;
            });

            // Subtotal row
            const totalGross = subNet + subDisc;
            const avgDiscPer = totalGross !== 0 ? (subDisc / totalGross) * 100 : 0;

            groupHtml += `
                <tr class="subtotal-row">
                    <td colspan="2" class="text-end fw-bold">SUB-TOTAL (${pDeptName}):</td>
                    <td class="text-end fw-bold">${formatCurrency(subDisc)}</td>
                    <td class="text-end"><span class="badge bg-secondary subtotal-badge">${avgDiscPer.toFixed(2)}%</span></td>
                    <td class="text-end fw-bold">${formatCurrency(subNet)}</td>
                    <td class="text-end fw-bold">${formatCurrency(subCost)}</td>
                    <td class="text-end text-primary fw-bold">${formatCurrency(subDaily)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = groupHtml;
        table.insertBefore(tbody, tfoot);
    });

    // Grand Totals
    const tGross = tNet + tDisc;
    const tAvgDiscPer = tGross !== 0 ? (tDisc / tGross) * 100 : 0;

    document.getElementById('tblDisc').textContent = formatCurrency(tDisc);
    document.getElementById('tblAvgDisc').textContent = tAvgDiscPer.toFixed(2) + '%';
    document.getElementById('tblNet').textContent = formatCurrency(tNet);
    document.getElementById('tblDaily').textContent = formatCurrency(tDaily);
    document.getElementById('tblCost').textContent = formatCurrency(tCost);

    tfoot.style.display = 'table-footer-group';
}

async function showDetails(branch, dept) {
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;

    const modalHtml = `
        <div class="modal fade" id="detailsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-info-circle me-2"></i>
                            ${dept} Details - ${branch}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-center py-5">
                            <i class="fas fa-spinner fa-spin fa-3x text-primary"></i>
                            <p class="mt-3">Loading details...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('detailsModal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = new bootstrap.Modal(document.getElementById('detailsModal'));
    modal.show();

    try {
        const token = localStorage.getItem('token');
        const url = `/api/v1/closing-sheets/department-details?startDate=${fromDate}&endDate=${toDate}&branch=${encodeURIComponent(branch)}&dept=${encodeURIComponent(dept)}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load details');
        const result = await response.json();
        const details = result.data || [];

        let detailsHtml = `
            <div class="table-responsive">
                <table class="table table-sm table-bordered">
                    <thead class="table-dark">
                        <tr>
                            <th>Date</th>
                            <th class="text-end">Discount</th>
                            <th class="text-end">Disc %</th>
                            <th class="text-end">Net Sale</th>
                            <th class="text-end">Cost</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (details.length === 0) {
            detailsHtml += '<tr><td colspan="5" class="text-center text-muted">No data available</td></tr>';
        } else {
            details.forEach(item => {
                const itemCost = item.costSale || item.cost || 0;
                detailsHtml += `
                    <tr>
                        <td>${new Date(item.date).toLocaleDateString()}</td>
                        <td class="text-end">${formatCurrency(item.discountValue || 0)}</td>
                        <td class="text-end"><span class="badge bg-info">${(item.discountPer || 0).toFixed(2)}%</span></td>
                        <td class="text-end fw-bold">${formatCurrency(item.totalSaleComputer || 0)}</td>
                         <td class="text-end text-danger">${formatCurrency(itemCost)}</td>
                    </tr>
                `;
            });
        }

        detailsHtml += `
                    </tbody>
                </table>
            </div>
        `;
        document.querySelector('#detailsModal .modal-body').innerHTML = detailsHtml;

    } catch (err) {
        console.error('Error loading details:', err);
        document.querySelector('#detailsModal .modal-body').innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
    }
}

function formatCurrency(num) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}
