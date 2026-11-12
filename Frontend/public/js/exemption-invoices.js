document.addEventListener('DOMContentLoaded', async () => {
    // Set default dates
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    document.getElementById('filterDate').value = today;
    document.getElementById('entryDate').value = today;

    await loadBranches();
    await loadSuppliers();
    await loadCategories();

    // Default selection
    const branchSelect = document.getElementById('branchSelect');
    if (branchSelect.options.length === 2) {
        branchSelect.selectedIndex = 1;
    } else {
        branchSelect.selectedIndex = 0;
    }

    setupAddButton();
    setupShortcuts();
    await loadSavedData();
});

function setupShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            document.getElementById('saveBtn').click();
        }
    });
}

// --- Data Loading ---
let branchesMap = {};
let suppliersMap = {};
let categoriesMap = {};

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('branchSelect');
            branchesMap = {};
            data.data.forEach(store => {
                const opt = document.createElement('option');
                opt.value = store._id;
                opt.textContent = `${store.name}`;
                select.appendChild(opt);
                branchesMap[store._id] = store.name;
            });
        }
    } catch (err) { console.error(err); }
}

async function loadSuppliers() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/suppliers?limit=10000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            const list = data.data;
            suppliersMap = {};

            list.forEach(sup => {
                const branchId = sup.branch?._id || sup.branch;
                let branchName = sup.branch?.name || '';

                if (!branchName && branchId && branchesMap[branchId]) {
                    branchName = branchesMap[branchId];
                }

                suppliersMap[sup._id] = {
                    name: sup.name,
                    ntn: sup.ntn || '',
                    subCategory: sup.subCategory || '',
                    categoryId: sup.category?._id || sup.category || '',
                    categoryName: sup.category ? sup.category.name : '',
                    branchId: branchId,
                    branchName: branchName
                };
            });

            setupSearch();
            window.debugSuppliers = suppliersMap; // Expose for debugging
        }
    } catch (err) { console.error('Error loading suppliers:', err); }
}

function setupSearch() {
    const searchInput = document.getElementById('entrySupplierSearch');
    const resultsDiv = document.getElementById('supplierSearchResults');
    let currentFocus = -1;

    searchInput.addEventListener('input', function () {
        const rawVal = this.value;
        let val = rawVal.toLowerCase().trim();

        const branchSelect = document.getElementById('branchSelect');
        const selectedBranchId = branchSelect.value;
        const selectedOption = branchSelect.options[branchSelect.selectedIndex];
        const selectedBranchName = selectedOption ? selectedOption.text : '';

        const categorySelect = document.getElementById('categorySelect');
        const selectedCategoryId = categorySelect.value;

        currentFocus = -1;

        if (!val) {
            resultsDiv.style.display = 'none';
            return;
        }

        const tokens = val.split(/\s+/).filter(t => t.length > 0);

        const rankedMatches = Object.keys(suppliersMap)
            .map(id => {
                const s = suppliersMap[id];

                // Category Filtering: If a category is selected, only show suppliers from that category
                if (selectedCategoryId && String(s.categoryId) !== String(selectedCategoryId)) {
                    return null;
                }

                // Branch Filtering logic: 
                // 1. If supplier has a branchId, it MUST match the selected branch.
                // 2. If supplier has NO branchId, it is a global supplier and should show for all branches.
                if (selectedBranchId && s.branchId) {
                    const idMatch = String(s.branchId) === String(selectedBranchId);
                    if (!idMatch) return null;
                }

                const nameLower = String(s.name || '').toLowerCase().trim();
                const subLower = String(s.subCategory || '').toLowerCase().trim();
                const combinedText = nameLower + ' ' + subLower;

                const allTokensMatch = tokens.every(token => combinedText.includes(token));
                if (!allTokensMatch) return null;

                let score = 0;
                if (nameLower.startsWith(val)) score += 2000;
                else if (nameLower.includes(val)) score += 100;
                if (subLower.includes(val)) score += 50;

                return { id, s, score, nameLower };
            })
            .filter(item => item !== null);

        rankedMatches.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.nameLower.localeCompare(b.nameLower);
        });

        const finalResults = rankedMatches.slice(0, 500);

        if (finalResults.length > 0) {
            resultsDiv.innerHTML = finalResults.map((item) => {
                const { id, s } = item;
                let subCatDisplay = '';
                const rawSub = String(s.subCategory || '').trim();
                if (rawSub) {
                    subCatDisplay = rawSub.startsWith('(') ? rawSub : `(${rawSub})`;
                }
                return `
                <div class="search-result-item" onclick="selectSupplier('${id}')" style="cursor: pointer; padding: 8px 12px; border-bottom: 1px solid #f8f9fa;">
                    <div class="fw-bold" style="font-size: 0.9rem;">
                        ${s.name} <span class="text-muted fw-normal small">${subCatDisplay}</span>
                    </div>
                </div>
            `;
            }).join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.style.display = 'none';
        }
    });

    searchInput.addEventListener('keydown', function (e) {
        let x = resultsDiv.getElementsByClassName("search-result-item");
        if (e.key === 'ArrowDown') {
            currentFocus++; addActive(x);
        } else if (e.key === 'ArrowUp') {
            currentFocus--; addActive(x);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1) {
                if (x && x[currentFocus]) x[currentFocus].click();
            } else if (x.length > 0) {
                x[0].click();
            }
        }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].style.backgroundColor = "#e9ecef";
        x[currentFocus].scrollIntoView({ block: "nearest" });
    }

    function removeActive(x) {
        for (let i = 0; i < x.length; i++) x[i].style.backgroundColor = "";
    }

    document.addEventListener('click', function (e) {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });
}

window.selectSupplier = function (id) {
    const s = suppliersMap[id];
    if (!s) return;
    document.getElementById('entrySupplierSearch').value = s.name;
    document.getElementById('entrySupplier').value = id;
    document.getElementById('entryNTN').value = s.ntn;
    document.getElementById('entryCategory').value = s.categoryName || '';
    document.getElementById('entrySubCat').value = s.subCategory;

    const amtInput = document.getElementById('entryInvAmt');
    if (amtInput.value) {
        const event = new Event('input');
        amtInput.dispatchEvent(event);
    }

    document.getElementById('supplierSearchResults').style.display = 'none';
    document.getElementById('entryDate').focus();
}

async function loadCategories() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/supplier-categories?type=wht_supplier', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('categorySelect');
            const qsSelect = document.getElementById('qsCategory');
            categoriesMap = {};
            const options = '<option value="">Select Supplier Category</option>' +
                data.data.map(cat => {
                    categoriesMap[cat._id] = cat.name;
                    return `<option value="${cat._id}">${cat.name}</option>`;
                }).join('');
            select.innerHTML = options;
            if (qsSelect) qsSelect.innerHTML = options;
        }
    } catch (err) { console.error('Error loading categories:', err); }
}

let addedRows = [];
let editingTopRowId = null;

function setupAddButton() {
    document.getElementById('addItemBtn').addEventListener('click', () => {
        const supplierId = document.getElementById('entrySupplier').value;
        const ntn = document.getElementById('entryNTN').value;
        const date = document.getElementById('entryDate').value;
        const invNum = document.getElementById('entryInvNum').value;
        const invAmt = parseFloat(document.getElementById('entryInvAmt').value) || 0;

        if (!supplierId || !date || !invNum || invAmt <= 0) {
            alert('Please fill required fields (Supplier, Date, Invoice #, Amount)');
            return;
        }

        const subCat = document.getElementById('entrySubCat').value;
        const category = document.getElementById('entryCategory').value;
        const supplierName = suppliersMap[supplierId]?.name || 'Unknown';
        const rowData = {
            id: Date.now(),
            supplierId, supplierName, category, subCat, ntn, date, invNum, invAmt
        };

        if (editingTopRowId) {
            const idx = addedRows.findIndex(r => String(r.id) === String(editingTopRowId));
            if (idx !== -1) addedRows[idx] = { ...rowData, id: editingTopRowId };
            editingTopRowId = null;
            document.getElementById('addItemBtn').innerHTML = 'Add';
            document.getElementById('addItemBtn').classList.remove('btn-warning');
            document.getElementById('addItemBtn').classList.add('btn-success');
        } else {
            addedRows.push(rowData);
        }

        renderTableRows();
        clearEntryInputs();
    });

    document.getElementById('entryInvAmt').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('addItemBtn').click();
        }
    });
}

function clearEntryInputs() {
    document.getElementById('entrySupplierSearch').value = '';
    document.getElementById('entrySupplier').value = '';
    document.getElementById('entryCategory').value = '';
    document.getElementById('entrySubCat').value = '';
    document.getElementById('entryNTN').value = '';
    document.getElementById('entryInvNum').value = '';
    document.getElementById('entryInvAmt').value = '';
    document.getElementById('entrySupplierSearch').focus();
}

function renderTableRows() {
    const tbody = document.querySelector('#exemptionTable tbody');
    const rows = Array.from(tbody.children);
    for (let i = 1; i < rows.length; i++) rows[i].remove();

    let totalAmt = 0;
    addedRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.supplierName}</td>
            <td>${row.subCat}</td>
            <td>${row.category || '-'}</td>
            <td>${row.ntn}</td>
            <td>${row.date}</td>
            <td>${row.invNum}</td>
            <td class="text-end">${row.invAmt.toFixed(2)}</td>
            <td>
                <div class="d-flex gap-1 justify-content-center">
                    <button class="btn btn-sm btn-outline-primary px-2 py-0" onclick="editTopRow('${row.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger px-2 py-0" onclick="removeRow('${row.id}')"><i class="fas fa-times"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
        totalAmt += row.invAmt;
    });

    document.getElementById('totalInvAmt').textContent = totalAmt.toFixed(2);
    renderGrandSummary(loadedRecords); // Pass full list for accurate summary
}

window.removeRow = function (id) {
    addedRows = addedRows.filter(r => String(r.id) !== String(id));
    if (String(editingTopRowId) === String(id)) {
        editingTopRowId = null;
        document.getElementById('addItemBtn').innerHTML = 'Add';
        document.getElementById('addItemBtn').classList.remove('btn-warning');
        document.getElementById('addItemBtn').classList.add('btn-success');
        clearEntryInputs();
    }
    renderTableRows();
}

window.editTopRow = function (id) {
    const row = addedRows.find(r => String(r.id) === String(id));
    if (!row) return;
    editingTopRowId = id;

    document.getElementById('entrySupplierSearch').value = row.supplierName;
    document.getElementById('entrySupplier').value = row.supplierId;
    document.getElementById('entryNTN').value = row.ntn;
    document.getElementById('entryCategory').value = row.category || '';
    document.getElementById('entrySubCat').value = row.subCat;
    document.getElementById('entryDate').value = row.date;
    document.getElementById('entryInvNum').value = row.invNum;
    document.getElementById('entryInvAmt').value = row.invAmt;

    const btn = document.getElementById('addItemBtn');
    btn.innerHTML = '<i class="fas fa-check"></i> Update Row';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-warning');

    document.getElementById('entryInvAmt').focus();
}

// --- Save & List Logic ---
let currentEditId = null;
let loadedRecords = [];

document.getElementById('saveBtn').addEventListener('click', saveData);
document.getElementById('listBtn').addEventListener('click', () => {
    const table = document.getElementById('savedRecordsBody').closest('table');
    if (table) table.scrollIntoView({ behavior: 'smooth' });
    loadSavedData();
});
document.getElementById('searchFilterBtn').addEventListener('click', loadSavedData);
document.getElementById('filterDate').addEventListener('change', loadSavedData);
document.getElementById('categorySelect').addEventListener('change', () => {
    // Re-trigger search when category changes
    const searchInput = document.getElementById('entrySupplierSearch');
    if (searchInput.value) {
        searchInput.dispatchEvent(new Event('input'));
    }
    loadSavedData();
});
document.getElementById('branchSelect').addEventListener('change', loadSavedData);

document.getElementById('listSearch').addEventListener('input', function (e) {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#savedRecordsBody tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
});

async function saveData() {
    if (addedRows.length === 0) { alert('No entries to save'); return; }
    const branch = document.getElementById('branchSelect').value;
    const date = document.getElementById('filterDate').value;
    if (!branch || !date) { alert('Please select Branch and Date'); return; }

    const totalAmt = addedRows.reduce((acc, r) => acc + r.invAmt, 0);

    const payload = {
        branch,
        date,
        entries: addedRows.map(r => ({
            supplier: r.supplierId,
            supplierName: r.supplierName,
            subCategory: r.subCat,
            categoryName: r.category,
            ntn: r.ntn,
            invoiceDate: r.date,
            invoiceNumber: r.invNum,
            invoiceAmount: r.invAmt
        })),
        totalAmount: totalAmt
    };

    try {
        const token = localStorage.getItem('token');
        const method = currentEditId ? 'PUT' : 'POST';
        const url = currentEditId ? `/api/v1/exemption-invoices/${currentEditId}` : '/api/v1/exemption-invoices';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            alert(currentEditId ? 'Data Updated Successfully!' : 'Data Saved Successfully!');
            addedRows = [];
            currentEditId = null;
            renderTableRows();
            const btn = document.getElementById('saveBtn');
            btn.innerHTML = '<i class="fas fa-save"></i> Save';
            btn.classList.remove('btn-warning');
            btn.classList.add('btn-success');
            loadSavedData();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (err) { alert('Network Error: ' + err.message); }
}

async function loadSavedData() {
    const branch = document.getElementById('branchSelect').value;
    const date = document.getElementById('filterDate').value;

    let url = '/api/v1/exemption-invoices?limit=1000';
    if (branch) url += `&branch=${branch}`;
    if (date) url += `&date=${date}`;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            loadedRecords = data.data;
            renderSavedTable(data.data);
            const sumCont = document.getElementById('summaryContainer');
            if (sumCont) sumCont.style.display = 'none';
        }
    } catch (err) { console.error(err); }
}

function renderSavedTableFromLoaded() {
    renderSavedTable(loadedRecords);
    renderGrandSummary(loadedRecords);
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-GB', { month: 'short' });
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
}

function renderSavedTable(records) {
    const tbody = document.getElementById('savedRecordsBody');
    const filterCatId = document.getElementById('categorySelect').value;
    tbody.innerHTML = '';
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No records found</td></tr>';
        return;
    }
    let flatRows = [];
    records.forEach(rec => {
        const sheetDate = formatDateDisplay(rec.date);
        const branchName = rec.branch?.name || 'Unknown';
        rec.entries?.forEach(entry => {
            let catName = '-';
            let entryCatId = null;
            if (entry.supplier) {
                let c = entry.supplier.category;
                if (c && typeof c === 'object') {
                    catName = c.name || '-';
                    entryCatId = c._id;
                } else if (c) {
                    catName = categoriesMap[c] || '-';
                    entryCatId = c;
                }
            }
            flatRows.push({ parentId: rec._id, sheetDate, branchName, categoryName: catName, ...entry });
        });
    });

    flatRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.sheetDate}</td>
            <td>${row.branchName}</td>
            <td class="fw-bold">${row.supplierName || '-'}</td>
            <td>${row.subCategory || '-'}</td>
            <td>${row.categoryName || '-'}</td>
            <td>${row.ntn || '-'}</td>
            <td>${row.invoiceNumber || '-'}</td>
            <td>${formatDateDisplay(row.invoiceDate)}</td>
            <td class="text-end">${(row.invoiceAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td>
                <div class="d-flex justify-content-center gap-1">
                    <button class="btn btn-sm btn-outline-primary" onclick="editRecord('${row.parentId}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteEntry('${row.parentId}', '${row._id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderGrandSummary(records) {
    const summaryBody = document.getElementById('summaryBody');
    const summaryFoot = document.getElementById('summaryFoot');
    const container = document.getElementById('summaryContainer');
    const filterCatId = document.getElementById('categorySelect').value;

    if (!records || records.length === 0) { container.style.display = 'none'; return; }

    let summary = {};
    let grandAmt = 0;

    records.forEach(rec => {
        rec.entries?.forEach(entry => {
            let catName = 'Uncategorized';
            let entryCatId = null;
            if (entry.supplier) {
                let c = entry.supplier.category;
                if (c && typeof c === 'object') {
                    catName = c.name || 'Uncategorized';
                    entryCatId = c._id;
                } else if (c) {
                    catName = categoriesMap[c] || 'Uncategorized';
                    entryCatId = c;
                }
            }
            if (!summary[catName]) summary[catName] = { amount: 0 };
            const invAmt = entry.invoiceAmount || 0;
            summary[catName].amount += invAmt;
            grandAmt += invAmt;
        });
    });

    const sortedCats = Object.keys(summary).sort();
    if (sortedCats.length === 0) { container.style.display = 'none'; return; }

    summaryBody.innerHTML = sortedCats.map(cat => `
        <tr>
            <td style="border: 1px solid #000; text-align: left;">${cat}</td>
            <td class="text-end" style="border: 1px solid #000;">${Math.round(summary[cat].amount).toLocaleString()}</td>
        </tr>
    `).join('');

    summaryFoot.innerHTML = `
        <tr style="background-color: #cccccc; border: 1px solid #000; font-weight: bold; font-size: 1.1em;">
            <td style="border: 1px solid #000; text-align: left;">TOTAL</td>
            <td class="text-end" style="border: 1px solid #000;">${Math.round(grandAmt).toLocaleString()}</td>
        </tr>
    `;
    container.style.display = 'block';
}

window.editRecord = function (id) {
    const record = loadedRecords.find(r => r._id === id);
    if (!record) return;
    currentEditId = id;
    document.getElementById('branchSelect').value = record.branch?._id || record.branch || '';
    document.getElementById('filterDate').value = record.date ? new Date(record.date).toISOString().split('T')[0] : '';
    addedRows = record.entries.map(e => ({
        id: e._id || Date.now() + Math.random(),
        supplierId: e.supplier?._id || e.supplier,
        supplierName: e.supplierName,
        subCat: e.subCategory,
        category: e.categoryName,
        ntn: e.ntn,
        date: e.invoiceDate ? new Date(e.invoiceDate).toISOString().split('T')[0] : '',
        invNum: e.invoiceNumber,
        invAmt: e.invoiceAmount
    }));
    renderTableRows();
    const btn = document.getElementById('saveBtn');
    btn.innerHTML = '<i class="fas fa-edit"></i> Update';
    btn.classList.replace('btn-success', 'btn-warning');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.deleteEntry = async function (parentId, entryId) {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/exemption-invoices/${parentId}/entries/${entryId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            alert('Deleted successfully');
            loadSavedData();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (err) { alert('Network Error'); }
}

window.openQuickSupplierModal = function () {
    const modal = new bootstrap.Modal(document.getElementById('quickSupplierModal'));
    modal.show();
};

window.saveQuickSupplier = async function () {
    const name = document.getElementById('qsName').value;
    const category = document.getElementById('qsCategory').value;
    const ntn = document.getElementById('qsNTN').value;
    const subCategory = document.getElementById('qsSubCat').value;
    const branch = document.getElementById('branchSelect').value;

    if (!name || !category) { alert('Name and Category are required'); return; }

    const payload = { name, category, ntn, subCategory, branch };
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            alert('Supplier added!');
            bootstrap.Modal.getInstance(document.getElementById('quickSupplierModal')).hide();
            await loadSuppliers();
            const newSupId = data.data._id;
            suppliersMap[newSupId] = {
                name: name,
                ntn: ntn,
                subCategory: subCategory,
                categoryName: categoriesMap[category] || '',
                branchId: branch
            };
            selectSupplier(newSupId);
        } else {
            alert('Error: ' + data.message);
        }
    } catch (err) { alert('Error adding supplier'); }
};

window.exportToExcel = function () {
    if (!loadedRecords || loadedRecords.length === 0) {
        alert('No data to export');
        return;
    }

    const filterDate = document.getElementById('filterDate').value;
    const branchSelect = document.getElementById('branchSelect');
    const branchName = branchSelect.options[branchSelect.selectedIndex]?.text || 'All Branches';

    const formatDateStr = (d) => {
        if (!d) return '-';
        const date = new Date(d);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${date.getDate().toString().padStart(2, '0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
    };

    // Grouping for Detail
    let catGrouped = {};
    let grandSummary = {};
    let totalGrandAmt = 0;

    loadedRecords.forEach(rec => {
        rec.entries?.forEach(entry => {
            let catName = 'Uncategorized';
            if (entry.supplier) {
                let c = entry.supplier.category;
                if (c && typeof c === 'object') catName = c.name || 'Uncategorized';
                else if (c) catName = categoriesMap[c] || 'Uncategorized';
            }

            if (!catGrouped[catName]) catGrouped[catName] = [];
            catGrouped[catName].push({
                supplierName: entry.supplierName,
                subCategory: entry.subCategory || '-',
                ntn: entry.ntn || '-',
                invoiceDate: entry.invoiceDate,
                invoiceNumber: entry.invoiceNumber || '-',
                invoiceAmount: entry.invoiceAmount || 0
            });

            if (!grandSummary[catName]) grandSummary[catName] = 0;
            grandSummary[catName] += (entry.invoiceAmount || 0);
            totalGrandAmt += (entry.invoiceAmount || 0);
        });
    });

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
                .category-header { background-color: #3498db; color: white; font-weight: bold; text-align: center; font-size: 12pt; border: 0.5pt solid black; }
                thead th { background-color: #2c3e50; color: white; font-weight: bold; border: 0.5pt solid black; }
                .total-row { background-color: #000000; color: #ffffff; font-weight: bold; }
                .text-end { text-align: right; }
                .text-center { text-align: center; }
            </style>
        </head>
        <body>
            <div class="report-title">EXEMPTION INVOICES REPORT</div>
            <div class="report-branch">(${branchName})</div>
            <div class="report-subtitle">INVOICE EXEMPTION DETAIL</div>
            <div class="report-date">Date: ${formatDateStr(filterDate)}</div>
            <br>
    `;

    Object.keys(catGrouped).sort().forEach(catName => {
        let catAmt = 0;
        let srNo = 1;

        html += `
            <table>
                <thead>
                    <tr><th colspan="7" class="category-header">${catName}</th></tr>
                    <tr>
                        <th style="width: 50px;">Sr.</th>
                        <th>Supplier Name</th>
                        <th style="width: 120px;">Sub Category</th>
                        <th style="width: 120px;">NTN</th>
                        <th>Inv Date</th>
                        <th>Inv No.</th>
                        <th class="text-end" style="width: 120px;">Inv Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        catGrouped[catName].sort((a, b) => a.supplierName.localeCompare(b.supplierName)).forEach(item => {
            catAmt += item.invoiceAmount;
            html += `
                <tr>
                    <td class="text-center">${srNo++}</td>
                    <td>${item.supplierName}</td>
                    <td class="text-center">${item.subCategory}</td>
                    <td class="text-center">${item.ntn}</td>
                    <td class="text-center">${formatDateStr(item.invoiceDate)}</td>
                    <td class="text-center">${item.invoiceNumber}</td>
                    <td class="text-end">${Math.round(item.invoiceAmount).toLocaleString()}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="6" style="text-align: center; background-color: #000; color: #fff;">Total for ${catName}</td>
                        <td class="text-end" style="background-color: #000; color: #fff;">${Math.round(catAmt).toLocaleString()}</td>
                    </tr>
                </tfoot>
            </table>
        `;
    });

    // Add Grand Summary
    html += `
        <div style="margin-top: 30px; text-align: center;">
            <h4 style="font-weight: bold;">Summary</h4>
            <table style="width: 400px; margin: 10px auto; border: 0.5pt solid black;">
                <thead style="background-color: #2c3e50; color: #ffffff;">
                    <tr><th>Category</th><th class="text-end">Amount</th></tr>
                </thead>
                <tbody>
    `;

    Object.keys(grandSummary).sort().forEach(cat => {
        html += `<tr><td>${cat}</td><td class="text-end">${Math.round(grandSummary[cat]).toLocaleString()}</td></tr>`;
    });

    html += `
                </tbody>
                <tfoot style="background-color: #000000; color: #ffffff; font-weight: bold;">
                    <tr><td style="background-color: #000000; color: #ffffff;">TOTAL</td><td class="text-end" style="background-color: #000000; color: #ffffff;">${Math.round(totalGrandAmt).toLocaleString()}</td></tr>
                </tfoot>
            </table>
        </div>
    `;

    html += `</body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Exemption_Report_${filterDate}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};



