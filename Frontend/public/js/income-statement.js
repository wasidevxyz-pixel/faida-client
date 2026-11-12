// Income Statement JavaScript
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

async function initializePage() {
    // Set user name
    const user = JSON.parse(localStorage.getItem('user')) || { name: 'Unknown' };
    document.getElementById('userName').textContent = user.name;

    // Load branches
    await loadBranches();

    // Set default dates (1st of current month to today)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    // Format dates as YYYY-MM-DD for input fields
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    document.getElementById('startDateFilter').value = formatDate(firstDay);
    document.getElementById('endDateFilter').value = formatDate(now);

    // Setup logout
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.pageAccess && window.pageAccess.logout) {
                window.pageAccess.logout();
            } else {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        });
    });
}

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('branchFilter');
            const user = JSON.parse(localStorage.getItem('user')) || {};
            const userBranch = user.branch;

            // Filter stores based on user branch
            const validStores = data.data.filter(store => {
                const uBranch = String(userBranch || '').trim().toLowerCase();
                if (!uBranch || uBranch.includes('all branches')) return true;
                const sName = (store.name || '').trim().toLowerCase();
                return uBranch.includes(sName);
            });

            validStores.forEach(store => {
                const option = document.createElement('option');
                option.value = store.name;
                option.textContent = store.name;
                select.appendChild(option);
            });

            // Auto-select if only one branch
            if (validStores.length === 1) {
                select.value = validStores[0].name;
            } else if (userBranch) {
                const uBranch = String(userBranch).trim().toLowerCase();
                const match = validStores.find(s => (s.name || '').trim().toLowerCase() === uBranch);
                if (match) select.value = match.name;
            }
        }
    } catch (error) {
        console.error('Error loading branches:', error);
        showError('Failed to load branches');
    }
}

async function loadIncomeStatement() {
    const branch = document.getElementById('branchFilter').value;
    const startDate = document.getElementById('startDateFilter').value;
    const endDate = document.getElementById('endDateFilter').value;

    console.log('Loading Income Statement:', { branch, startDate, endDate });

    if (!branch) {
        showError('Please select a branch');
        return;
    }

    if (!startDate || !endDate) {
        showError('Please select start and end dates');
        return;
    }

    // Show loading
    document.getElementById('loadingSection').style.display = 'block';
    document.getElementById('reportContent').style.display = 'none';
    document.getElementById('noDataSection').style.display = 'none';

    try {
        const token = localStorage.getItem('token');
        const url = `/api/v1/income-statement?branch=${encodeURIComponent(branch)}&startDate=${startDate}&endDate=${endDate}`;
        console.log('Fetching:', url);

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        console.log('API Response:', data);

        if (data.success && data.data) {
            console.log('Categories found:', data.data.categories?.length || 0);
            renderIncomeStatement(data.data);
        } else {
            console.error('API returned error:', data.message);
            showNoData();
            showError(data.message || 'Failed to load income statement');
        }
    } catch (error) {
        console.error('Error loading income statement:', error);
        showNoData();
        showError('Failed to load income statement: ' + error.message);
    } finally {
        document.getElementById('loadingSection').style.display = 'none';
    }
}

function renderIncomeStatement(data) {
    // Store for saving
    window.currentReportData = data;

    const { groups, totals, summary, period } = data;

    // Show report
    document.getElementById('reportContent').style.display = 'block';
    document.getElementById('noDataSection').style.display = 'none';

    // Update date range and branch
    const startDate = new Date(period.startDate).toLocaleDateString('en-GB');
    const endDate = new Date(period.endDate).toLocaleDateString('en-GB');

    const branchSelect = document.getElementById('branchFilter');
    const branchName = branchSelect.options[branchSelect.selectedIndex]?.text || '';
    window.currentBranchName = branchName;

    document.getElementById('dateRange').innerHTML = `<h5 class="fw-bold mb-1">${branchName}</h5>${startDate} to ${endDate}`;

    // Calculate days for Average Sale
    const startObj = new Date(period.startDate);
    const endObj = new Date(period.endDate);
    const diffTime = Math.abs(endObj - startObj);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

    // Render grouped departments
    const tbody = document.getElementById('incomeTableBody');
    tbody.innerHTML = '';

    if (groups && groups.length > 0) {
        groups.forEach(group => {
            // Add parent department header row (Dark Green)
            const headerRow = document.createElement('tr');
            headerRow.style.fontWeight = 'bold';
            headerRow.innerHTML = `
                <td colspan="10" style="padding: 10px; background-color: #145a32; color: white;">
                    <i class="fas fa-folder-open me-2"></i>${group.parentName}
                </td>
            `;
            tbody.appendChild(headerRow);

            // Add sub-departments
            group.subDepartments.forEach((dept, index) => {
                const tr = document.createElement('tr');

                let discountCell = '';
                let deductionCell = '';
                if (index === 0) {
                    const rowspan = group.subDepartments.length;
                    // Discount Cell
                    const groupPercent = calculateDiscountPercent(group.totals.discount, group.totals.sales);
                    discountCell = `<td class="text-center align-middle" rowspan="${rowspan}" style="vertical-align: middle;">${groupPercent}</td>`;
                    // Deduction Cell (Merged) - Using parent department deduction from setup
                    deductionCell = `<td class="text-center align-middle fw-bold text-danger" rowspan="${rowspan}" style="vertical-align: middle;">${group.parentDed || 0}%</td>`;
                }

                tr.innerHTML = `
                    <td style="padding-left: 30px;">${dept.department}</td>
                    <td class="number">${formatNumber(dept.sales)}</td>
                    <td class="number print-only">${formatNumber(dept.sales / diffDays)}</td>
                    <td class="number print-hide">${formatNumber(dept.cost)}</td>
                    <td></td>
                    <td class="print-hide"></td> <!-- Empty Expense for Sub-Dept -->
                    <td class="number">${formatNumber(dept.grossProfit)}</td>
                    ${discountCell}
                    <td class="number">${calculateGpRate(dept.grossProfit, dept.sales)}</td>
                    ${deductionCell}
                `;
                tbody.appendChild(tr);
            });

            // Add subtotal row (same style as total)
            const subtotalRow = document.createElement('tr');
            subtotalRow.className = 'total-row';
            // We use data attributes to store the base values for recalculation
            const baseGp = group.totals.grossProfit;
            const sales = group.totals.sales;
            const groupId = group.parentId || 'g' + Math.random().toString(36).substr(2, 9);

            subtotalRow.innerHTML = `
                <td style="padding-left: 30px;">SUB-TOTAL:</td>
                <td class="number">${formatNumber(group.totals.sales)}</td>
                <td class="number print-only">${formatNumber(group.totals.sales / diffDays)}</td>
                <td class="number print-hide">${formatNumber(group.totals.cost)}</td>
                <td class="number">${formatNumber(group.totals.bankDeduction)}</td>
                <td style="padding: 2px;" class="print-hide">
                    <input type="number" class="form-control form-control-sm text-end" 
                           placeholder="0" value="" 
                           oninput="updateSubTotal(this, ${baseGp}, ${sales}, '${groupId}')"
                           style="border: 1px solid #ccc; background-color: #fff; width: 100%; padding: 2px 5px;">
                </td>
                <td class="number" id="gp-${groupId}">${formatNumber(baseGp)}</td>
                <td class="text-center">${formatNumber(group.totals.discount)}</td>
                <td class="number" id="rate-${groupId}">${calculateGpRate(baseGp, sales)}</td>
                <td></td> <!-- Dept Ded % Placeholder -->
            `;
            tbody.appendChild(subtotalRow);
        });

        // Add grand total row
        const totalRow = document.createElement('tr');
        totalRow.className = 'grand-total-row';
        totalRow.innerHTML = `
            <td>TOTAL</td>
            <td class="number">${formatNumber(totals.sales)}</td>
            <td class="number print-only">${formatNumber(totals.sales / diffDays)}</td>
            <td class="number print-hide">${formatNumber(totals.cost)}</td>
            <td class="number">${formatNumber(totals.bankDeduction)}</td>
            <td class="text-end print-hide"></td> <!-- Total Expense Placeholder -->
            <td class="number">${formatNumber(totals.grossProfit)}</td>
            <td class="text-center">${formatNumber(totals.discount)}</td>
            <td class="number">${calculateGpRate(totals.grossProfit, totals.sales)}</td>
            <td></td> <!-- Dept Ded % Placeholder -->
        `;
        tbody.appendChild(totalRow);
    } else {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No data available</td></tr>';
    }

    // Update summary section
    // document.getElementById('summaryTotalSale').textContent = formatNumber(summary.totalSale); // Removed
    // document.getElementById('summaryTotalReturns').textContent = formatNumber(summary.totalSaleReturns); // Removed
    document.getElementById('summaryNetSales').textContent = formatNumber(summary.netSales);
    document.getElementById('summaryCost').textContent = formatNumber(summary.cost);
    document.getElementById('summaryGrossProfit').textContent = formatNumber(summary.grossProfit);

    // Set expenses to empty for manual entry
    document.getElementById('summaryExpenses').value = '';

    document.getElementById('summaryShortCash').textContent = formatNumber(summary.shortCash);

    // Initial Calc
    recalculateNetProfit();

    // Store current data for saving
    window.currentReportData = data;
    window.currentBranchName = branchName; // Store branch name text
}

function updateSubTotal(input, baseGp, sales, groupId) {
    const expense = parseFloat(input.value) || 0;
    const newGp = baseGp - expense;

    // Update Gross Profit Cell
    const gpCell = document.getElementById(`gp-${groupId}`);
    if (gpCell) gpCell.textContent = formatNumber(newGp);

    // Update GP Rate Cell
    const rateCell = document.getElementById(`rate-${groupId}`);
    if (rateCell) rateCell.textContent = calculateGpRate(newGp, sales);
}

function calculateDiscountPercent(discount, sales) {
    const discVal = parseFloat(discount) || 0;
    const salesVal = parseFloat(sales) || 0;
    const grossVal = salesVal + discVal;

    if (grossVal === 0) return '0.00%';

    const rate = (discVal / grossVal) * 100;
    return rate.toFixed(2) + '%';
}

function recalculateNetProfit() {
    const grossProfit = parseFormattedNumber(document.getElementById('summaryGrossProfit').textContent);
    const expenses = parseFloat(document.getElementById('summaryExpenses').value) || 0;
    const shortCash = parseFormattedNumber(document.getElementById('summaryShortCash').textContent);

    const netProfit = grossProfit - expenses - shortCash;
    document.getElementById('summaryNetProfit').textContent = formatNumber(netProfit);
}

function parseFormattedNumber(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/,/g, '')) || 0;
}

// --- Save & History Functionality (Database) ---

async function saveIncomeStatement() {
    if (!window.currentReportData) {
        alert("No report generated to save.");
        return;
    }

    const expenses = document.getElementById('summaryExpenses').value;
    const token = localStorage.getItem('token');

    const payload = {
        branch: window.currentBranchName || 'Unknown',
        period: document.getElementById('dateRange').textContent.replace(window.currentBranchName, '').trim(),
        periodStart: window.currentReportData.period?.startDate,
        data: window.currentReportData,
        summary: {
            netSales: document.getElementById('summaryNetSales').textContent,
            cost: document.getElementById('summaryCost').textContent,
            grossProfit: document.getElementById('summaryGrossProfit').textContent,
            expenses: expenses,
            netProfit: document.getElementById('summaryNetProfit').textContent
        },
        expenses: expenses
    };

    try {
        const response = await fetch('/api/v1/income-statement/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            alert("Report saved successfully to database!");
        } else {
            alert("Failed to save report: " + result.message);
        }
    } catch (error) {
        console.error('Save error:', error);
        alert("Error saving report: " + error.message);
    }
}

let allSavedReports = []; // Cache for filtering

async function showSavedReports() {
    await refreshSavedReportsList();
    const modalEl = document.getElementById('savedReportsModal');
    // Check if check if already open, don't re-instantiate if so (though bootstrap usually handles single instance, 
    // repeatedly calling new Modal() on same element can be problematic if not disposed).
    // Safest is getOrCreateInstance
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function refreshSavedReportsList() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch('/api/v1/income-statement/saved', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            allSavedReports = result.data;

            // Populate Branch Filter (only if empty to avoid resetting user selection? actually fine to reset on full refresh)
            const branches = [...new Set(allSavedReports.map(r => r.branch))].sort();
            const branchSelect = document.getElementById('historyFilterBranch');
            const currentSelection = branchSelect.value;

            branchSelect.innerHTML = '<option value="">All Branches</option>';
            branches.forEach(b => {
                branchSelect.innerHTML += `<option value="${b}">${b}</option>`;
            });
            branchSelect.value = currentSelection; // Restore selection if valid

            renderSavedReportsList(allSavedReports);
        } else {
            alert("Failed to load history: " + result.message);
        }
    } catch (error) {
        alert("Error loading history: " + error.message);
    }
}

function renderSavedReportsList(reports) {
    const tbody = document.getElementById('savedReportsList');
    tbody.innerHTML = '';

    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No saved reports found</td></tr>';
        return;
    }

    reports.forEach(report => {
        // Extract Month
        let monthStr = '-';
        if (report.periodStart) {
            const d = new Date(report.periodStart);
            monthStr = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } else {
            const d = new Date(report.timestamp);
            monthStr = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        const row = document.createElement('tr');
        // Use _id from MongoDB
        const id = report._id;

        row.innerHTML = `
            <td>${formatDateTime(report.timestamp)}</td>
            <td>${monthStr}</td>
            <td>${report.branch}</td>
            <td>${report.period}</td>
            <td class="text-end fw-bold">${report.summary?.netProfit || report.netProfit || '0'}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-primary me-1" onclick="loadSavedReport('${id}')" title="Edit/View">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-secondary me-1" onclick="printSavedReport('${id}')" title="Print Professional">
                    <i class="fas fa-print"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteSavedReport('${id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterSavedReports() {
    const branch = document.getElementById('historyFilterBranch').value;
    const month = document.getElementById('historyFilterMonth').value; // YYYY-MM

    const filtered = allSavedReports.filter(r => {
        let matchBranch = true;
        let matchMonth = true;

        if (branch && r.branch !== branch) matchBranch = false;

        if (month) {
            // Check if report start date matches YYYY-MM
            let reportDate = r.periodStart ? new Date(r.periodStart) : new Date(r.timestamp);
            const reportMonth = reportDate.toISOString().slice(0, 7); // YYYY-MM
            if (reportMonth !== month) matchMonth = false;
        }

        return matchBranch && matchMonth;
    });

    renderSavedReportsList(filtered);
}

function loadSavedReport(id) {
    // Find in cached memory (DB data - use _id)
    const report = allSavedReports.find(r => r._id === id);

    if (report) {
        // Hide modal
        const modalEl = document.getElementById('savedReportsModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        // Restore Data
        renderIncomeStatement(report.data, report.branch);

        // Restore Expenses
        const expInput = document.getElementById('summaryExpenses');
        expInput.value = report.expenses || '';
        if (report.expenses) recalculateNetProfit();

        // Ensure Branch Name is set in header (already done in render but might need override if data structure changed)
        document.getElementById('dateRange').innerHTML = `<h5 class="fw-bold mb-1">${report.branch}</h5>${report.period}`;
        window.currentBranchName = report.branch;

        // Manual cleanup of backdrop just in case
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }
}

function printSavedReport(id) {
    // Load it first, then print
    loadSavedReport(id);
    // Wait for render to finish (synchronous mostly, but good to defer slightly)
    setTimeout(() => {
        window.print();
    }, 500);
}

async function deleteSavedReport(id) {
    if (confirm('Are you sure you want to delete this saved report?')) {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`/api/v1/income-statement/saved/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            if (result.success) {
                showSavedReports();
            } else {
                alert("Failed to delete: " + result.message);
            }
        } catch (error) {
            alert("Error deleting: " + error.message);
        }
    }
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function showNoData() {
    document.getElementById('reportContent').style.display = 'none';
    document.getElementById('noDataSection').style.display = 'block';
}

function showError(message) {
    console.error(message);
    alert(message);
}

function formatNumber(value) {
    if (value === null || value === undefined) return '0';
    return parseFloat(value).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function calculateGpRate(gp, sales) {
    // Formula: G.P * 100 / SALES
    if (!sales || parseFloat(sales) === 0) return '0.00%';
    const gpVal = parseFloat(gp) || 0;
    const salesVal = parseFloat(sales);
    const rate = (gpVal * 100) / salesVal;
    return rate.toFixed(2) + '%';
}

function printReport() {
    window.print();
}

function exportToExcel() {
    const branch = document.getElementById('branchFilter').value;
    const startDate = document.getElementById('startDateFilter').value;
    const endDate = document.getElementById('endDateFilter').value;

    const table = document.querySelector('.income-table');
    if (!table) {
        showError('No data to export');
        return;
    }

    // Prepare table for export (handle inputs)
    // We update the value attribute of original inputs so cloning captures current values
    const originalInputs = table.querySelectorAll('input');
    originalInputs.forEach(input => input.setAttribute('value', input.value));

    const tableClone = table.cloneNode(true);

    // Replace inputs in clone with text
    const cloneInputs = tableClone.querySelectorAll('input');
    cloneInputs.forEach(input => {
        const span = document.createElement('span');
        span.textContent = input.getAttribute('value') || '0';
        input.replaceWith(span);
    });

    const tableHtml = tableClone.outerHTML;

    // Build Summary HTML
    const netSales = document.getElementById('summaryNetSales').textContent;
    const cost = document.getElementById('summaryCost').textContent;
    const grossProfit = document.getElementById('summaryGrossProfit').textContent;
    const expenses = document.getElementById('summaryExpenses').value || '0';
    const shortCash = document.getElementById('summaryShortCash').textContent;
    const netProfit = document.getElementById('summaryNetProfit').textContent;

    const summaryHtml = `
        <br>
        <table style="width: 50%; margin-top: 20px; border-collapse: collapse;">
            <thead>
                <tr><th colspan="2" style="background-color: #333; color: white; text-align:left; padding:5px;">SUMMARY</th></tr>
            </thead>
            <tbody>
                <tr><td style="border:1px solid #ccc; padding:5px;">NET SALES</td><td style="border:1px solid #ccc; padding:5px; text-align:right;">${netSales}</td></tr>
                <tr><td style="border:1px solid #ccc; padding:5px;">COST</td><td style="border:1px solid #ccc; padding:5px; text-align:right;">${cost}</td></tr>
                <tr><td style="border:1px solid #ccc; padding:5px;">GROSS PROFIT</td><td style="border:1px solid #ccc; padding:5px; text-align:right;">${grossProfit}</td></tr>
                <tr><td style="border:1px solid #ccc; padding:5px;">EXPENSES</td><td style="border:1px solid #ccc; padding:5px; text-align:right;">${expenses}</td></tr>
                <tr><td style="border:1px solid #ccc; padding:5px;">SHORT CASH</td><td style="border:1px solid #ccc; padding:5px; text-align:right;">${shortCash}</td></tr>
                <tr style="font-weight:bold; background-color:#f8f9fa;"><td style="border:1px solid #ccc; padding:5px;">NET PROFIT</td><td style="border:1px solid #ccc; padding:5px; text-align:right;">${netProfit}</td></tr>
            </tbody>
        </table>
    `;

    // Construct full HTML for Excel
    const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <!--[if gte mso 9]>
            <xml>
                <x:ExcelWorkbook>
                    <x:ExcelWorksheets>
                        <x:ExcelWorksheet>
                            <x:Name>Income Statement</x:Name>
                            <x:WorksheetOptions>
                                <x:DisplayGridlines/>
                            </x:WorksheetOptions>
                        </x:ExcelWorksheet>
                    </x:ExcelWorksheets>
                </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            <style>
                body { font-family: Arial, sans-serif; }
                table { border-collapse: collapse; width: 100%; }
                th { background-color: #0d6efd; color: white; border: 1px solid #000; padding: 5px; text-align: center; }
                td { border: 1px solid #ccc; padding: 5px; vertical-align: middle; }
                .text-end { text-align: right; }
                .text-center { text-align: center; }
                .number { text-align: right; mso-number-format:"\\#\\,\\#\\#0"; }
                .total-row td { font-weight: bold; background-color: #e9ecef; border-top: 2px solid #333; }
                .grand-total-row td { font-weight: bold; background-color: #212529; color: white; font-size: 1.1em; }
            </style>
        </head>
        <body>
            <h2 style="text-align:center;">D WATSON PHARMACY & SUPER STORE</h2>
            <h3 style="text-align:center;">INCOME STATEMENT (${branch})</h3>
            <p style="text-align:center;">${startDate} to ${endDate}</p>
            <br>
            ${tableHtml}
            ${summaryHtml}
        </body>
        </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Income_Statement_${branch}_${startDate}_${endDate}.xls`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
}

