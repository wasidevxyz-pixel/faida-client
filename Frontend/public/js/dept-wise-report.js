// Department-Wise Report Logic

let allBranches = [];
let allDepartments = [];

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
            branchSelect.innerHTML = '<option value="">All Branches</option>'; // Clear default options

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
    deptSelect.innerHTML = '<option value="">All Departments</option>';

    try {
        const token = localStorage.getItem('token');

        // Fetch all departments (API doesn't support branch filtering)
        const response = await fetch('/api/v1/departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const result = await response.json();
            let allDepts = result.data || [];
            console.log('Total departments fetched:', allDepts.length);

            // Get selected branch name for filtering
            let branchName = '';
            if (branchId) {
                const selectedOption = branchSelect.options[branchSelect.selectedIndex];
                branchName = selectedOption.getAttribute('data-name');
                console.log('Selected branch:', branchName);
            } else {
                console.log('No branch selected (All Branches)');
            }

            // Filter departments based on branch selection
            let filteredDepts = allDepts;
            if (branchName) {
                // Filter by branch AND active status AND closing2DeptDropDown flag
                filteredDepts = allDepts.filter(d =>
                    d.branch === branchName &&
                    d.isActive &&
                    d.closing2DeptDropDown
                );
                console.log(`Departments for branch "${branchName}":`, filteredDepts.length);
            } else {
                // If "All Branches" selected, show all active departments with closing2DeptDropDown
                filteredDepts = allDepts.filter(d =>
                    d.isActive &&
                    d.closing2DeptDropDown
                );
                console.log('Departments for all branches:', filteredDepts.length);
            }

            console.log('Filtered departments:', filteredDepts.map(d => `${d.name} (${d.branch})`));

            // Get unique department names (in case multiple branches have same dept name)
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

            console.log('Unique departments to show:', uniqueDepts.map(d => d.name));

            // Populate dropdown
            uniqueDepts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name; // Filter by name for reports
                opt.textContent = d.name;
                deptSelect.appendChild(opt);
            });

            console.log('Department dropdown populated with', uniqueDepts.length, 'options');
        } else {
            console.error('Failed to fetch departments, status:', response.status);
        }
    } catch (e) {
        console.error("Error fetching departments", e);
    }
}

async function generateReport() {
    const btn = document.querySelector('.btn-search');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Generating...';

    const branchId = document.getElementById('branchSelect').value;
    const branchName = branchId ? document.getElementById('branchSelect').options[document.getElementById('branchSelect').selectedIndex].getAttribute('data-name') : '';
    const deptName = document.getElementById('deptSelect').value;
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;

    const container = document.getElementById('reportContainer');
    const summaryCards = document.getElementById('summaryCards');
    const pPrintTime = document.getElementById('pPrintTime');
    const printBranchName = document.getElementById('printBranchName');
    const printDateRange = document.getElementById('printDateRange');

    // Update Print Header safely
    if (pPrintTime) pPrintTime.textContent = new Date().toLocaleString();
    if (printBranchName) printBranchName.textContent = branchName || 'All Branches';

    const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
    if (printDateRange) printDateRange.textContent = `From : ${fmt(fromDate)}  To : ${fmt(toDate)}`;

    if (container) container.innerHTML = `<div class="p-5 text-center"><div class="spinner-border text-primary"></div><div class="mt-2 text-muted fw-bold">Compiling Report Data...</div></div>`;
    if (summaryCards) summaryCards.style.display = 'none';

    try {
        const token = localStorage.getItem('token');
        let url = `/api/v1/closing-sheets/department-wise-report?startDate=${fromDate}&endDate=${toDate}`;

        if (branchId && branchName) {
            url += `&branch=${encodeURIComponent(branchName)}`;
        } else {
            url += `&branch=all`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const result = await response.json();
        const rawData = result.data || [];

        // Apply Department Filter if set
        let reportItems = rawData;
        if (deptName) {
            reportItems = rawData.filter(item => item.dept === deptName);
        }

        const transformedItems = reportItems.map(item => ({
            key: `${item.branch}-${item.dept}`,
            branch: item.branch,
            dept: item.dept,
            discount: item.discountValue || 0,
            discountPer: item.discountPer || 0,
            net: item.totalSaleComputer || 0,
            dailyAverage: item.dailyAverage || 0
        }));

        renderReport(transformedItems);
        updateSummary(transformedItems);

    } catch (err) {
        console.error('Report Generation Error', err);
        container.innerHTML = `<div class="alert alert-danger mx-4 mt-4">Error: ${err.message}</div>`;
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

    const elDisc = document.getElementById('totalDiscount');
    const elNet = document.getElementById('netSale');
    const elBranchName = document.getElementById('summaryBranchName');
    const elSummaryCards = document.getElementById('summaryCards');
    const branchSelect = document.getElementById('branchSelect');

    if (elDisc) elDisc.textContent = formatCurrency(tDisc);
    if (elNet) elNet.textContent = formatCurrency(tNet);

    if (elBranchName && branchSelect) {
        const selectedOption = branchSelect.options[branchSelect.selectedIndex];
        elBranchName.textContent = (selectedOption && selectedOption.value) ? selectedOption.text : 'All Branches';
    }

    if (elSummaryCards) elSummaryCards.style.display = data.length > 0 ? 'block' : 'none';
}

function renderReport(data) {
    const container = document.getElementById('reportContainer');

    if (data.length === 0) {
        container.innerHTML = `<div class="text-center py-5 text-muted"><h4>No records found</h4><p>Try adjusting your filters.</p></div>`;
        return;
    }

    // Sort by Branch then Dept
    data.sort((a, b) => {
        if (a.branch === b.branch) return a.dept.localeCompare(b.dept);
        return a.branch.localeCompare(b.branch);
    });

    // Group by Branch
    const groups = {};
    data.forEach(item => {
        if (!groups[item.branch]) groups[item.branch] = [];
        groups[item.branch].push(item);
    });

    let mainHtml = `<table class="custom-table">`;

    let globalDisc = 0, globalNet = 0, globalDaily = 0;

    Object.keys(groups).forEach(branchName => {
        const items = groups[branchName];

        // Branch Heading + Repeated Header
        mainHtml += `
        <tbody>
            <tr class="group-header">
                <td colspan="6" class="text-center" style="background: transparent !important; color: var(--primary-blue) !important; font-weight: 800 !important; border-top: 1px solid #dee2e6 !important; border-bottom: 2px solid var(--primary-blue) !important; padding: 12px !important; text-transform: uppercase;">${branchName}</td>
            </tr>
            <tr style="background: var(--primary-blue) !important; color: white !important;">
                <th style="width: 15%; border-left: 1px solid rgba(255,255,255,0.3) !important; padding: 12px; font-size: 0.75rem; text-align: center;">BRANCH</th>
                <th style="width: 18%; border-left: 1px solid rgba(255,255,255,0.3) !important; padding: 12px; font-size: 0.75rem; text-align: center;">DEPARTMENT</th>
                <th style="width: 15%; border-left: 1px solid rgba(255,255,255,0.3) !important; padding: 12px; font-size: 0.75rem; text-align: center;">DISCOUNT</th>
                <th style="width: 10%; border-left: 1px solid rgba(255,255,255,0.3) !important; padding: 12px; font-size: 0.75rem; text-align: center;">DISC %</th>
                <th style="width: 20%; border-left: 1px solid rgba(255,255,255,0.3) !important; padding: 12px; font-size: 0.75rem; text-align: center;">NET SALE</th>
                <th style="width: 22%; border-left: 1px solid rgba(255,255,255,0.3) !important; padding: 12px; font-size: 0.75rem; text-align: center;">DAILY AVG</th>
            </tr>`;

        let bDisc = 0, bNet = 0, bDaily = 0;

        items.forEach(item => {
            bDisc += item.discount;
            bNet += item.net;
            bDaily += item.dailyAverage;

            mainHtml += `
            <tr class="dept-row">
                <td style="background: #fdfdfd; font-weight: 500; font-size: 0.85rem;">${branchName}</td>
                <td class="fw-bold fw-semibold" style="color: var(--secondary-blue);">${item.dept}</td>
                <td class="text-end">${formatCurrency(item.discount)}</td>
                <td class="text-center"><span class="badge bg-light text-dark border">${item.discountPer.toFixed(2)}%</span></td>
                <td class="text-end fw-bold">${formatCurrency(item.net)}</td>
                <td class="text-end text-primary" style="font-weight:700;">${formatCurrency(item.dailyAverage)}</td>
            </tr>`;
        });

        globalDisc += bDisc;
        globalNet += bNet;
        globalDaily += bDaily;

        const bGross = bNet + bDisc;
        const bDiscP = bGross > 0 ? (bDisc / bGross) * 100 : 0;

        // Branch Subtotal
        mainHtml += `
            <tr class="subtotal-row" style="border-top: 1px solid #dee2e6 !important;">
                <td colspan="2" class="text-end fw-bold" style="border: 1px solid #dee2e6 !important;">TOTAL ${branchName}:</td>
                <td class="text-end" style="border: 1px solid #dee2e6 !important;">${formatCurrency(bDisc)}</td>
                <td class="text-center" style="border: 1px solid #dee2e6 !important;"><span class="badge bg-dark">${bDiscP.toFixed(2)}%</span></td>
                <td class="text-end text-success" style="border: 1px solid #dee2e6 !important;">${formatCurrency(bNet)}</td>
                <td class="text-end" style="border: 1px solid #dee2e6 !important;">${formatCurrency(bDaily)}</td>
            </tr>
        </tbody>`;
    });

    mainHtml += `</table>`;

    // Global Grand Total
    const grandGross = globalNet + globalDisc;
    const grandDiscP = grandGross > 0 ? (globalDisc / grandGross) * 100 : 0;

    mainHtml += `
    <div class="grand-total-section">
        <table class="custom-table mb-0">
            <tbody>
                <tr class="grand-total-row">
                    <td style="width: 33%; border-right: 1.5px solid white !important;" class="text-center fw-bold">REPORT GRAND TOTAL</td>
                    <td style="width: 15%; border-right: 1.5px solid white !important;" class="text-end">${formatCurrency(globalDisc)}</td>
                    <td style="width: 10%; border-right: 1.5px solid white !important;" class="text-center"><span class="badge bg-secondary">${grandDiscP.toFixed(2)}%</span></td>
                    <td style="width: 20%; border-right: 1.5px solid white !important;" class="text-end">${formatCurrency(globalNet)}</td>
                    <td style="width: 22%;" class="text-end">${formatCurrency(globalDaily)}</td>
                </tr>
            </tbody>
        </table>
    </div>`;

    container.innerHTML = mainHtml;
}

function formatCurrency(num) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}

