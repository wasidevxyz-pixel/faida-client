// Cash Counter Report JavaScript (Daily Summary - Cash/Bank)

let departmentsMap = {};

document.addEventListener('DOMContentLoaded', async function () {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login';
        return;
    }

    // Set default dates (current date)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    document.getElementById('filterFromDate').value = todayStr;
    document.getElementById('filterToDate').value = todayStr;

    // Initial Load
    await loadBranches();
    await loadDepartments();

    document.getElementById('filterBranch').addEventListener('change', loadDepartments);
});

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            const select = document.getElementById('filterBranch');
            select.innerHTML = '<option value="">All Branches</option>';

            const stores = data.data || [];
            if (stores.length > 0) {
                stores.forEach(store => {
                    const opt = document.createElement('option');
                    opt.value = store.name;
                    opt.textContent = store.name;
                    select.appendChild(opt);
                });
                if (stores.length >= 1) select.value = stores[0].name;
            }
        }
    } catch (e) { console.error(e); }
}

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            const counterSelect = document.getElementById('filterCounter');
            counterSelect.innerHTML = '<option value="">All Departments</option>';

            const branch = document.getElementById('filterBranch').value;

            (data.data || []).forEach(d => {
                // Filter by Branch (if selected) AND combineDepSales
                const branchMatch = !branch || d.branch === branch;

                if (d.isActive && d.combineDepSales && branchMatch) {
                    const opt = document.createElement('option');
                    opt.value = d.name; // Use Name!
                    opt.textContent = d.name;
                    counterSelect.appendChild(opt);
                }
            });
        }
    } catch (e) { console.error(e); }
}

async function loadReport() {
    const token = localStorage.getItem('token');
    const container = document.getElementById('reportContainer');
    const startDate = document.getElementById('filterFromDate').value;
    const endDate = document.getElementById('filterToDate').value;
    const branch = document.getElementById('filterBranch').value;
    const selectedCounterName = document.getElementById('filterCounter').value;

    // Update print header
    const titleEl = document.querySelector('.print-header h4');
    document.getElementById('pPrintTime').textContent = new Date().toLocaleString();
    document.getElementById('printBranchName').textContent = branch ? `${branch}` : 'All Branches';

    // Format Date Range like image: "14-Dec-2025"
    // Image shows: From : 14-Dec-2025  To : 18-Dec-2025
    const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ /g, '-');
    document.getElementById('printDateRange').textContent = `From :  ${fmt(startDate)}      To :  ${fmt(endDate)}`;

    container.innerHTML = `<div class="p-5 text-center"><div class="spinner-border text-primary"></div><div class="mt-2 text-muted">Loading Data...</div></div>`;
    document.getElementById('summaryCards').style.display = 'none';

    try {
        let url = `/api/v1/cash-sales?startDate=${startDate}&endDate=${endDate}`;
        if (branch) url += `&branch=${branch}`;

        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Failed to fetch report data');

        const result = await response.json();
        let transactions = result.data || [];

        if (selectedCounterName) {
            // Check Department Name match
            transactions = transactions.filter(t => {
                const dName = t.department ? (t.department.name || t.department) : '';
                return dName === selectedCounterName;
            });
        }

        if (transactions.length === 0) {
            container.innerHTML = `<div class="no-data"><i class="fas fa-search fa-3x mb-3"></i><p>No transactions found.</p></div>`;
            return;
        }

        renderReport(transactions, selectedCounterName);

    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="no-data text-danger"><i class="fas fa-exclamation-triangle fa-3x mb-3"></i><p>Error: ${error.message}</p></div>`;
    }
}

function renderReport(transactions, selectedCounterName) {
    const container = document.getElementById('reportContainer');
    container.innerHTML = '';

    // 1. Group Data: Counter -> Date -> Values
    const groups = {};

    transactions.forEach(t => {
        // Use Department Name instead of Cash Counter
        let deptName = 'Unknown';
        if (t.department) {
            deptName = t.department.name || t.department; // Handle object or string/ID if not populated (though usually populated)
            if (typeof deptName === 'object') deptName = 'Unknown'; // Fallback if still object
        }

        const counter = deptName;

        if (selectedCounterName && counter !== selectedCounterName) return; // Filter here if not filtered earlier (though safe to filter explicitly)

        if (!groups[counter]) groups[counter] = {};

        // Date key (YYYY-MM-DD) for sorting
        const dateKey = t.date.split('T')[0];
        if (!groups[counter][dateKey]) {
            groups[counter][dateKey] = { cash: 0, bank: 0 };
        }

        const sale = parseFloat(t.sales || 0);
        if (t.mode === 'Cash') groups[counter][dateKey].cash += sale;
        else if (t.mode === 'Bank') groups[counter][dateKey].bank += sale;
    });

    const sortedCounters = Object.keys(groups).sort();
    let globalCash = 0;
    let globalBank = 0;

    // Render Tables
    sortedCounters.forEach(counter => {
        const datesObj = groups[counter];
        const dateKeys = Object.keys(datesObj).sort();

        // Section Setup
        const section = document.createElement('div');
        section.className = 'mb-5 report-section'; // mb-5 provides space in print potentially

        // Table with custom-table class
        let tableHtml = `
        <table class="custom-table border-dark table-sm mb-4">
            <thead>
                <tr class="group-header">
                    <th colspan="4" class="text-center fw-bold py-2">${counter}</th>
                </tr>
                <tr>
                    <th style="width: 35%;">Dated</th>
                    <th style="width: 25%;" class="text-end">Cash Sale</th>
                    <th style="width: 20%;" class="text-end">Bank Sale</th>
                    <th style="width: 20%;" class="text-end">Total</th>
                </tr>
            </thead>
            <tbody>`;

        let counterCash = 0;
        let counterBank = 0;

        dateKeys.forEach(dateKey => {
            const dData = datesObj[dateKey];
            const total = dData.cash + dData.bank;
            counterCash += dData.cash;
            counterBank += dData.bank;

            // Format Date: "14-December-2025"
            // Using hyphen separator as per screenshot
            const d = new Date(dateKey);
            const dStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ /g, '-');

            tableHtml += `
            <tr class="dept-row">
                <td class="ps-3">${dStr}</td>
                <td class="text-end fw-semibold">${formatCurrency(dData.cash)}</td>
                <td class="text-end text-primary">${dData.bank > 0 ? formatCurrency(dData.bank) : '—'}</td>
                <td class="text-end fw-bold">${formatCurrency(total)}</td>
            </tr>`;
        });

        // Subtotal Row
        const counterTotal = counterCash + counterBank;
        tableHtml += `
            <tr class="subtotal-row">
                <td class="text-center fw-bold">TOTAL (${counter})</td>
                <td class="text-end fw-bold">${formatCurrency(counterCash)}</td>
                <td class="text-end fw-bold">${counterBank > 0 ? formatCurrency(counterBank) : '—'}</td>
                <td class="text-end fw-bold" style="background: #e3f2fd !important;">${formatCurrency(counterTotal)}</td>
            </tr>
        </tbody></table>`;

        section.innerHTML = tableHtml;
        container.appendChild(section);

        globalCash += counterCash;
        globalBank += counterBank;
    });

    // Grand Total (Only if multiple counters to verify totals, or always as per image?)
    // Image shows "Total" row. It seems to be the Counter total.
    // If there is another row at bottom...
    // The image has TWO bold rows at bottom.
    // One seems to be the sum, and another repeated? Or maybe one is Total and one is Grand Total?
    // The image shows:
    // ...
    // | | 337,200.00 | | 337,200.00 | (Row 1)
    // | | 337,200.00 | | 337,200.00 | (Row 2 ??)
    // It's possible "Row 1" is the sum of the column, and "Row 2" is the footer of the section.
    // I will add a Grand Total section at the end if we have multiple counters.
    // If only one, the bottom row is it.

    // Update top summary cards and metadata
    document.getElementById('recordCount').textContent = `${transactions.length} records`;
    document.getElementById('cardTotalCash').textContent = formatCurrency(globalCash);
    document.getElementById('cardTotalBank').textContent = formatCurrency(globalBank);
    document.getElementById('summaryCards').style.display = sortedCounters.length > 0 ? 'block' : 'none';

    if (sortedCounters.length > 1) {
        const grandTotalHtml = `
        <div class="grand-total-section">
            <table class="custom-table mb-0">
             <tbody>
                <tr class="grand-total-row">
                    <td style="width: 35%;" class="text-center fw-bold text-uppercase">Report Grand Total</td>
                    <td style="width: 25%;" class="text-end fw-bold">${formatCurrency(globalCash)}</td>
                    <td style="width: 20%;" class="text-end fw-bold">${formatCurrency(globalBank)}</td>
                    <td style="width: 20%;" class="text-end fw-bold">${formatCurrency(globalCash + globalBank)}</td>
                </tr>
             </tbody>
            </table>
        </div>`;
        container.insertAdjacentHTML('beforeend', grandTotalHtml);
    }
}

function formatCurrency(amount) {
    if (!amount) return '0.00';
    return new Intl.NumberFormat('en-PK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

