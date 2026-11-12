// Date-Wise Sale Report Logic

let allBranches = [];
let allDepartments = [];

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // Set Default Dates (Current Day)
    const today = new Date();

    document.getElementById('fromDate').valueAsDate = today;
    document.getElementById('toDate').valueAsDate = today;


    // Initialize Select2 with explicit width
    $('.select2-single').select2({
        width: '100%'
    });

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

            const user = JSON.parse(localStorage.getItem('user')) || {};
            const userBranch = user.branch;

            const validStores = allBranches.filter(store => {
                const uBranch = String(userBranch || '').trim().toLowerCase();
                if (!uBranch || uBranch.includes('all branches')) return true;
                const sName = (store.name || '').trim().toLowerCase();
                return uBranch.includes(sName);
            });

            validStores.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.name; // Filter by name
                opt.textContent = b.name;
                branchSelect.appendChild(opt);
            });

            if (validStores.length === 1) branchSelect.value = validStores[0].name;

            // Add listener
            branchSelect.addEventListener('change', updateDeptDropdown);
        }

        // Load Departments
        const deptRes = await fetch('/api/v1/departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const deptData = await deptRes.json();
        if (deptData.success) {
            // Filter by Active AND (closing2CompSale OR closing2DeptDropDown)
            allDepartments = deptData.data.filter(d =>
                d.isActive && (d.closing2CompSale || d.closing2DeptDropDown)
            );
            updateDeptDropdown();
        }

    } catch (err) {
        console.error('Error loading filters', err);
    }
}

function updateDeptDropdown() {
    const branchName = document.getElementById('branchSelect').value;
    const deptSelect = document.getElementById('deptSelect');
    deptSelect.innerHTML = '<option value="">All Departments</option>';

    let filtered = allDepartments;
    if (branchName) {
        filtered = allDepartments.filter(d => d.branch === branchName);
    }

    // Unique names and sort
    const uniqueNames = [...new Set(filtered.map(d => d.name.trim()))].sort();

    uniqueNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        deptSelect.appendChild(opt);
    });
}

async function generateReport() {
    const btn = document.querySelector('.btn-generate');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Generating...';

    const branch = document.getElementById('branchSelect').value;
    const dept = document.getElementById('deptSelect').value;
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;

    try {
        const token = localStorage.getItem('token');
        let url = `/api/v1/closing-sheets/date-wise-sale-report?startDate=${fromDate}&endDate=${toDate}`;
        if (branch) url += `&branch=${encodeURIComponent(branch)}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const result = await response.json();
        let rawData = result.data || [];

        // Apply local department filter if selected
        if (dept) {
            const selectedDept = dept.trim().toLowerCase();
            rawData = rawData.filter(item => (item.dept || '').trim().toLowerCase() === selectedDept);
        }

        // AGGREGATE DUPLICATES (Same Date, Branch, Dept)
        const aggregatedMap = new Map();
        rawData.forEach(item => {
            const dateStr = new Date(item.date).toISOString().split('T')[0];
            const key = `${dateStr}_${item.branch}_${item.dept}`;

            if (aggregatedMap.has(key)) {
                const existing = aggregatedMap.get(key);
                existing.sale += (item.sale || 0);
                existing.discount += (item.discount || 0);
                existing.cost += (item.cost || 0);
            } else {
                aggregatedMap.set(key, { ...item });
            }
        });

        const data = Array.from(aggregatedMap.values());

        // Update Print Header
        document.getElementById('printFromDate').textContent = fromDate ? new Date(fromDate).toLocaleDateString('en-GB') : 'All';
        document.getElementById('printToDate').textContent = toDate ? new Date(toDate).toLocaleDateString('en-GB') : 'All';
        document.getElementById('printGeneratedAt').textContent = new Date().toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        renderReport(data);
        updateSummary(data);



    } catch (err) {
        console.error('Report Error', err);
        document.getElementById('reportTableBody').innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Error: ${err.message}</td></tr>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function updateSummary(data) {
    let tSale = 0, tDisc = 0, tNet = 0;
    data.forEach(d => {
        const net = d.sale - d.discount;
        tSale += d.sale;
        tDisc += d.discount;
        tNet += net;
    });

    document.getElementById('netSale').textContent = formatCurrency(tSale);
    document.getElementById('totalDiscount').textContent = formatCurrency(tDisc);
    document.getElementById('totalNet').textContent = formatCurrency(tNet);
}

function renderReport(data) {
    const container = document.getElementById('reportContainer');
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = `
            <div class="data-panel shadow-sm">
                <div class="text-center py-5 text-muted">
                    <i class="fas fa-search fa-3x mb-3 opacity-25"></i>
                    <p>No records found.</p>
                </div>
            </div>
        `;
        return;
    }

    // Grouping
    const grouped = {};
    let gSale = 0, gDisc = 0, gNet = 0, gCost = 0;

    data.forEach(item => {
        if (!grouped[item.branch]) grouped[item.branch] = {};
        if (!grouped[item.branch][item.dept]) grouped[item.branch][item.dept] = [];
        grouped[item.branch][item.dept].push(item);

        const net = item.sale - item.discount;
        gSale += item.sale;
        gDisc += item.discount;
        gNet += net;
        gCost += item.cost;
    });

    let mainHtml = '';

    for (const [branch, depts] of Object.entries(grouped)) {
        mainHtml += `
            <div class="branch-section mb-4">
                <div class="branch-group-header shadow-sm mb-0">
                    <span class="branch-name">${branch}</span>
                </div>
                <div class="data-panel shadow-sm">
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th style="width: 15%;">Date</th>
                                    <th style="width: 30%;">Branch</th>
                                    <th style="width: 25%;">Department</th>
                                    <th style="width: 15%;" class="text-end">Sale</th>
                                    <th style="width: 15%;" class="text-end">Cost</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        for (const [dept, items] of Object.entries(depts)) {
            let dSale = 0, dDisc = 0, dNet = 0, dCost = 0;

            mainHtml += `
                <tr>
                    <td colspan="5" class="dept-group-header">
                        <span class="dept-name"><i class="fas fa-layer-group me-2"></i>${dept}</span>
                    </td>
                </tr>
            `;

            items.sort((a, b) => new Date(a.date) - new Date(b.date));

            items.forEach(item => {
                const net = item.sale - item.discount;
                dSale += item.sale;
                dDisc += item.discount;
                dNet += net;
                dCost += item.cost;

                const dateStr = new Date(item.date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });

                mainHtml += `
                    <tr>
                        <td class="text-center"><i class="far fa-calendar-alt me-2 text-muted"></i>${dateStr}</td>
                        <td class="text-center text-muted">${item.branch}</td>
                        <td class="text-center">${item.dept}</td>
                        <td class="text-end amount-col">${formatCurrency(item.sale)}</td>
                        <td class="text-end amount-col text-danger">${formatCurrency(item.cost)}</td>
                    </tr>
                `;
            });

            // Dept Subtotal
            mainHtml += `
                <tr class="dept-total-row fw-bold">
                    <td colspan="3" class="text-center text-uppercase">Subtotal (${dept}):</td>
                    <td class="text-end amount-col">${formatCurrency(dSale)}</td>
                    <td class="text-end amount-col">${formatCurrency(dCost)}</td>
                </tr>
            `;
        }

        mainHtml += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // Grand Totals at the bottom - Only show if more than 1 department is present
    const uniqueDepts = new Set(data.map(item => item.dept));
    if (uniqueDepts.size > 1) {
        mainHtml += `
            <div class="data-panel shadow-sm mt-3" style="border-radius: 0;">
                <div class="table-responsive">
                    <table class="data-table">
                        <tfoot style="display: table-footer-group;">
                            <tr class="grand-total-row">
                                <td colspan="3" style="width: 70%;" class="text-center text-uppercase">Grand Total:</td>
                                <td style="width: 15%;" class="text-end amount-col">${formatCurrency(gSale)}</td>
                                <td style="width: 15%;" class="text-end amount-col">${formatCurrency(gCost)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    }

    container.innerHTML = mainHtml;

    // Update Summary Cards
    document.getElementById('netSale').textContent = formatCurrency(gSale);
    document.getElementById('totalDiscount').textContent = formatCurrency(gDisc);
    document.getElementById('totalNet').textContent = formatCurrency(gNet);
}




function formatCurrency(num) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}
