function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PK', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

let categoriesMap = {};

document.addEventListener('DOMContentLoaded', async function () {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login'; return; }

    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    const todayStr = `${year}-${month}-${day}`;
    const firstDayStr = `${year}-${month}-01`;

    document.getElementById('filterFromDate').value = firstDayStr;
    document.getElementById('filterToDate').value = todayStr;

    await loadBranches();
    await loadSuppliers();
    await loadCategories();
});

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/stores', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const sel = document.getElementById('filterBranch');
            const uniqueBranches = [...new Set(data.data.map(item => item.name || item.branchName))].filter(n => n).sort();

            if (uniqueBranches.length === 1) {
                sel.innerHTML = '';
            } else {
                sel.innerHTML = '<option value="">All Branches</option>';
            }

            uniqueBranches.forEach(name => {
                const bObj = data.data.find(b => (b.name || b.branchName) === name);
                sel.innerHTML += `<option value="${bObj._id}">${name}</option>`;
            });

            if (uniqueBranches.length === 1) {
                const bObj = data.data.find(b => (b.name || b.branchName) === uniqueBranches[0]);
                sel.value = bObj._id;
            }
        }
    } catch (e) { console.error(e); }
}

async function loadSuppliers() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/suppliers?limit=5000', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const sel = document.getElementById('filterSupplier');
            if (data.data && Array.isArray(data.data)) {
                data.data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                data.data.forEach(s => {
                    let label = s.name;
                    if (s.subCategory) label += ` (${s.subCategory})`;
                    sel.innerHTML += `<option value="${s._id}">${label}</option>`;
                });
            }
        }
    } catch (e) { console.error(e); }
}

async function loadCategories() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/supplier-categories', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            data.data.forEach(c => categoriesMap[c._id] = c.name);
        }
    } catch (e) { console.error(e); }
}

async function loadReport() {
    const token = localStorage.getItem('token');
    const container = document.getElementById('reportContainer');
    const startDate = document.getElementById('filterFromDate').value;
    const endDate = document.getElementById('filterToDate').value;
    const branch = document.getElementById('filterBranch').value;
    const supplier = document.getElementById('filterSupplier').value;
    const type = document.getElementById('reportType').value;

    const invStartDate = document.getElementById('filterInvFromDate').value;
    const invEndDate = document.getElementById('filterInvToDate').value;

    const branchName = branch ? document.querySelector(`#filterBranch option[value="${branch}"]`).text : 'All Branches';
    document.getElementById('printBranchName').textContent = `(${branchName})`;

    const titleEl = document.getElementById('printReportTitle');
    const subTitleEl = document.getElementById('printSubtitle');

    if (type === 'summary') {
        titleEl.textContent = 'Exemption Invoices Summary Report';
        if (subTitleEl) subTitleEl.textContent = 'Invoice Exemption Summary';
    } else {
        titleEl.textContent = 'Exemption Invoices Report';
        if (subTitleEl) subTitleEl.textContent = 'Invoice Exemption Detail';
    }

    let dateStr = `From: ${formatDate(startDate)}   To: ${formatDate(endDate)}`;
    if (invStartDate || invEndDate) {
        dateStr += `    |    Inv Date: ${invStartDate ? formatDate(invStartDate) : '...'} To ${invEndDate ? formatDate(invEndDate) : '...'}`;
    }
    document.getElementById('printDateRange').textContent = dateStr;

    container.innerHTML = `<div class="d-flex justify-content-center p-5"><div class="spinner-border text-primary"></div></div>`;

    try {
        let url = `/api/v1/exemption-invoices?startDate=${startDate}&endDate=${endDate}&limit=5000`;
        if (branch) url += `&branch=${branch}`;

        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
            container.innerHTML = `<div class="no-data p-5 text-center"><p class="text-muted">No data found.</p></div>`;
            return;
        }

        if (type === 'summary') {
            renderSummaryReport(result.data, supplier, invStartDate, invEndDate);
        } else {
            renderReport(result.data, supplier, invStartDate, invEndDate);
        }

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="text-danger p-5 text-center">Error: ${e.message}</div>`;
    }
}

function renderReport(records, selectedSupplierId, invStart, invEnd) {
    const container = document.getElementById('reportContainer');
    const HEADER_BG = '#2980b9';
    const TABLE_HEAD_BG = '#2c3e50';

    let allEntries = [];
    records.forEach(rec => {
        rec.entries?.forEach(ent => {
            let s = ent.supplier || {};
            let sId = s._id || s;
            if (selectedSupplierId && sId !== selectedSupplierId) return;

            if (invStart && ent.invoiceDate) {
                if (new Date(ent.invoiceDate).toISOString().split('T')[0] < invStart) return;
            }
            if (invEnd && ent.invoiceDate) {
                if (new Date(ent.invoiceDate).toISOString().split('T')[0] > invEnd) return;
            }

            let catName = 'Uncategorized';
            let catObj = s.category;
            if (catObj && catObj.name) catName = catObj.name;
            else if (catObj && typeof catObj === 'string' && categoriesMap[catObj]) catName = categoriesMap[catObj];

            allEntries.push({
                ...ent,
                categoryName: catName,
                supplierName: ent.supplierName || s.name || 'Unknown',
                subCat: ent.subCategory || ''
            });
        });
    });

    if (allEntries.length === 0) {
        container.innerHTML = `<div class="no-data p-5 text-center"><p class="text-muted">No matching entries found.</p></div>`;
        return;
    }

    let grouped = {};
    allEntries.forEach(e => {
        if (!grouped[e.categoryName]) grouped[e.categoryName] = [];
        grouped[e.categoryName].push(e);
    });

    let html = '';
    let srNo = 1;

    Object.keys(grouped).sort().forEach(catName => {
        const entries = grouped[catName];
        entries.sort((a, b) => a.supplierName.localeCompare(b.supplierName) || new Date(a.invoiceDate) - new Date(b.invoiceDate));

        html += `
             <div class="category-section mb-4">
                 <div class="category-header text-center fw-bold text-uppercase p-2 mb-0" 
                      style="background-color: ${HEADER_BG}; border: 1px solid black; font-size: 1.1rem; color: white !important;">
                     ${catName}
                 </div>
                 <table class="table table-bordered mb-0">
                     <thead class="text-white" style="background-color: ${TABLE_HEAD_BG};">
                         <tr>
                             <th style="width: 50px;">Sr.</th>
                             <th>Supplier Name</th>
                             <th>Sub Category</th>
                             <th>NTN</th>
                             <th>Inv Date</th>
                             <th>Inv No.</th>
                             <th class="text-end">Inv Amount</th>
                         </tr>
                     </thead>
                     <tbody>
         `;

        let catAmt = 0;
        entries.forEach(item => {
            catAmt += item.invoiceAmount;
            html += `
                <tr>
                    <td class="text-center">${srNo++}</td>
                    <td>${item.supplierName}</td>
                    <td class="text-center">${item.subCat || '-'}</td>
                    <td class="text-center">${item.ntn || '-'}</td>
                    <td class="text-center">${formatDate(item.invoiceDate)}</td>
                    <td class="text-center">${item.invoiceNumber || '-'}</td>
                    <td class="text-end">${formatCurrency(item.invoiceAmount)}</td>
                </tr>
            `;
        });

        html += `
                     </tbody>
                     <tfoot>
                        <tr class="fw-bold">
                            <td colspan="6" class="text-center" style="background: black !important; color: white !important;">Total for ${catName}</td>
                            <td class="text-end" style="background: black !important; color: white !important;">${formatCurrency(catAmt)}</td>
                        </tr>
                     </tfoot>
                 </table>
             </div>
         `;
    });

    container.innerHTML = html;
    renderCategorySummary(container, allEntries);
}

function renderCategorySummary(container, entries) {
    let summary = {};
    let grandAmt = 0;

    entries.forEach(e => {
        if (!summary[e.categoryName]) summary[e.categoryName] = 0;
        summary[e.categoryName] += e.invoiceAmount;
        grandAmt += e.invoiceAmount;
    });

    let rowsHtml = Object.keys(summary).sort().map(cat => `
        <tr>
            <td style="border: 1px solid #000; text-align: left;">${cat}</td>
            <td class="text-end" style="border: 1px solid #000;">${Math.round(summary[cat]).toLocaleString()}</td>
        </tr>
    `).join('');

    const sumDiv = document.createElement('div');
    sumDiv.className = 'mt-5 text-center';
    sumDiv.innerHTML = `
        <h4 class="fw-bold mb-3">Summary</h4>
        <div class="table-responsive d-inline-block">
            <table class="table table-bordered mb-0" style="min-width: 400px; border: 1px solid #000;">
                <thead style="background: #008080; color: white;">
                    <tr><th>Category</th><th class="text-end">Amount</th></tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot style="background: #ccc; font-weight: bold;">
                    <tr><td>TOTAL</td><td class="text-end">${Math.round(grandAmt).toLocaleString()}</td></tr>
                </tfoot>
            </table>
        </div>
    `;
    container.appendChild(sumDiv);
}

function renderSummaryReport(records, selectedSupplierId, invStart, invEnd) {
    const container = document.getElementById('reportContainer');
    let allEntries = [];
    records.forEach(rec => {
        rec.entries?.forEach(ent => {
            let s = ent.supplier || {};
            let sId = s._id || s;
            if (selectedSupplierId && sId !== selectedSupplierId) return;
            if (invStart && ent.invoiceDate && new Date(ent.invoiceDate).toISOString().split('T')[0] < invStart) return;
            if (invEnd && ent.invoiceDate && new Date(ent.invoiceDate).toISOString().split('T')[0] > invEnd) return;

            let catName = 'Uncategorized';
            let catObj = s.category;
            if (catObj && catObj.name) catName = catObj.name;
            else if (catObj && typeof catObj === 'string' && categoriesMap[catObj]) catName = categoriesMap[catObj];

            allEntries.push({
                invoiceAmount: ent.invoiceAmount || 0,
                categoryName: catName,
                supplierName: ent.supplierName || s.name || 'Unknown',
                subCat: ent.subCategory || ''
            });
        });
    });

    if (allEntries.length === 0) {
        container.innerHTML = `<div class="no-data p-5 text-center"><p class="text-muted">No matching entries found.</p></div>`;
        return;
    }

    let grouped = {};
    allEntries.forEach(e => {
        const key = `${e.categoryName}||${e.supplierName}||${e.subCat}`;
        if (!grouped[key]) grouped[key] = { cat: e.categoryName, name: e.supplierName, sub: e.subCat, amt: 0 };
        grouped[key].amt += e.invoiceAmount;
    });

    let catGrouped = {};
    Object.values(grouped).forEach(item => {
        if (!catGrouped[item.cat]) catGrouped[item.cat] = [];
        catGrouped[item.cat].push(item);
    });

    let html = '';
    Object.keys(catGrouped).sort().forEach(catName => {
        let catAmt = 0;
        let srNo = 1;
        html += `
            <div class="category-section mb-4">
                <div class="category-header text-center fw-bold p-2" style="background:#2980b9; color:white; border:1px solid black;">${catName}</div>
                <table class="table table-bordered">
                    <thead style="background:#2c3e50; color:white;">
                        <tr><th style="width:50px;">Sr.</th><th>Supplier</th><th>Sub Category</th><th class="text-end">Total Amount</th></tr>
                    </thead>
                    <tbody>
        `;
        catGrouped[catName].sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            catAmt += item.amt;
            html += `<tr><td>${srNo++}</td><td>${item.name}</td><td>${item.sub || '-'}</td><td class="text-end">${formatCurrency(item.amt)}</td></tr>`;
        });
        html += `</tbody><tfoot style="background:black; color:white; font-weight:bold;"><tr><td colspan="3" class="text-center">Total</td><td class="text-end">${formatCurrency(catAmt)}</td></tr></tfoot></table></div>`;
    });

    container.innerHTML = html;
}

window.exportToExcel = function () {
    const container = document.getElementById('reportContainer');
    if (!container || !container.querySelector('table')) {
        alert('No data to export');
        return;
    }

    const reportType = document.getElementById('reportType').value;
    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;
    const branchSelect = document.getElementById('filterBranch');
    const branchName = branchSelect.options[branchSelect.selectedIndex].text;

    let title = reportType === 'detailed' ? 'EXEMPTION INVOICES REPORT' : 'EXEMPTION INVOICES SUMMARY REPORT';
    let subtitle = reportType === 'detailed' ? 'INVOICE EXEMPTION DETAIL' : 'INVOICE EXEMPTION SUMMARY';

    const formatDateStr = (d) => {
        if (!d) return '-';
        const date = new Date(d);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${date.getDate().toString().padStart(2, '0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
    };

    let dateRange = `From: ${formatDateStr(fromDate)} To: ${formatDateStr(toDate)}`;

    let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <style>
                table { border-collapse: collapse; margin-top: 10px; width: 100%; border: 0.5pt solid black; }
                th, td { border: 0.5pt solid black; padding: 5px; font-family: Calibri, Arial, sans-serif; font-size: 10pt; }
                .report-title { text-align: center; font-size: 16pt; font-weight: bold; text-decoration: underline; }
                .report-branch { text-align: center; font-size: 14pt; font-weight: bold; }
                .report-subtitle { text-align: center; font-size: 12pt; font-weight: bold; text-transform: uppercase; }
                .report-date { text-align: center; font-size: 10pt; font-weight: bold; }
                .text-end { text-align: right; }
                .text-center { text-align: center; }
            </style>
        </head>
        <body>
            <div class="report-title">${title}</div>
            <div class="report-branch">(${branchName})</div>
            <div class="report-subtitle">${subtitle}</div>
            <div class="report-date">${dateRange}</div>
            <br>
    `;

    const clone = container.cloneNode(true);

    // Process styling for export
    clone.querySelectorAll('.category-header').forEach(el => {
        el.style.backgroundColor = '#3498db';
        el.style.color = '#ffffff';
        el.style.fontWeight = 'bold';
        el.style.textAlign = 'center';
        el.style.fontSize = '12pt';
        el.style.border = '0.5pt solid black';
        el.style.padding = '8px';
    });

    clone.querySelectorAll('.category-section').forEach(sec => {
        const table = sec.querySelector('table');
        if (table) {
            table.style.border = '0.5pt solid black';
            table.querySelectorAll('thead tr').forEach(tr => {
                tr.style.backgroundColor = '#2c3e50';
                tr.style.color = '#ffffff';
                tr.querySelectorAll('th').forEach(th => {
                    th.style.backgroundColor = '#2c3e50';
                    th.style.color = '#ffffff';
                    th.style.border = '0.5pt solid black';
                });
            });
            table.querySelectorAll('tbody tr').forEach(tr => {
                tr.querySelectorAll('td').forEach(td => {
                    td.style.border = '0.5pt solid black';
                    if (td.classList.contains('text-end')) td.style.textAlign = 'right';
                    if (td.classList.contains('text-center')) td.style.textAlign = 'center';
                });
            });
            table.querySelectorAll('tfoot tr').forEach(tr => {
                tr.style.backgroundColor = '#000000';
                tr.style.color = '#ffffff';
                tr.style.fontWeight = 'bold';
                tr.querySelectorAll('td').forEach(td => {
                    td.style.backgroundColor = '#000000';
                    td.style.color = '#ffffff';
                    td.style.border = '0.5pt solid black';
                    if (td.classList.contains('text-end')) td.style.textAlign = 'right';
                    if (td.classList.contains('text-center')) td.style.textAlign = 'center';
                });
            });
        }
    });

    const summaryDiv = clone.querySelector('.mt-5');
    if (summaryDiv) {
        summaryDiv.style.marginTop = '30px';
        const h4 = summaryDiv.querySelector('h4');
        if (h4) {
            h4.style.textAlign = 'center';
            h4.style.fontWeight = 'bold';
            h4.style.fontSize = '14pt';
        }
        const summaryTable = summaryDiv.querySelector('table');
        if (summaryTable) {
            summaryTable.style.border = '0.5pt solid black';
            summaryTable.style.margin = '10px auto';
            summaryTable.querySelectorAll('thead tr').forEach(tr => {
                tr.style.backgroundColor = '#2c3e50';
                tr.style.color = '#ffffff';
                tr.querySelectorAll('th').forEach(th => {
                    th.style.backgroundColor = '#2c3e50';
                    th.style.color = '#ffffff';
                    th.style.border = '0.5pt solid black';
                });
            });
            summaryTable.querySelectorAll('tfoot tr').forEach(tr => {
                tr.style.backgroundColor = '#000000';
                tr.style.color = '#ffffff';
                tr.style.fontWeight = 'bold';
                tr.querySelectorAll('td').forEach(td => {
                    td.style.backgroundColor = '#000000';
                    td.style.color = '#ffffff';
                    td.style.border = '0.5pt solid black';
                });
            });
        }
    }

    html += clone.innerHTML;
    html += `</body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

