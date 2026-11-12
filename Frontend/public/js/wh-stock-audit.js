document.addEventListener('DOMContentLoaded', () => {
    initializePage();
    setupEventListeners();
});

// Global Items Cache
let itemsList = [];
let auditItems = [];
let isEditing = false;
let currentAuditId = null;
let currentAuditStatus = null;

function initializePage() {
    // Set default date
    document.getElementById('auditDate').valueAsDate = new Date();

    // Load Items immediately
    loadItems();

    // Render initial grid (for empty input row)
    renderGrid();

    // Focus on new input row barcode
    const newCode = document.getElementById('newCode');
    if (newCode) newCode.focus();

    // Load categories for filter
    loadCategories();
}

async function loadItems() {
    try {
        const input = document.getElementById('newCode');
        if (input) input.placeholder = 'Loading items...';

        const response = await fetch('/api/v1/wh-items', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        if (data.success) {
            // Filter active items
            let items = data.data.filter(item => item.isActive !== false);
            // Filter by allowed categories
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) {
                const allowed = user.allowedWHItemCategories;
                items = items.filter(it => {
                    const catId = typeof it.category === 'object' ? it.category?._id : it.category;
                    return allowed.includes(catId);
                });
            }
            itemsList = items;
            if (input) input.placeholder = 'Scan...';
        } else {
            console.error('Failed to load items:', data.message);
            if (input) input.placeholder = 'Error loading items';
        }
    } catch (error) {
        console.error('Error loading items:', error);
        const input = document.getElementById('newCode');
        if (input) input.placeholder = 'Error loading items';
    }
}

function setupEventListeners() {
    // Search filter enter key
    document.getElementById('itemSearchFilter').addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = e.target.value.trim();
            if (query) {
                await findAndAddItem(query);
                e.target.value = '';
            }
        }
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Alt+S: Save Draft
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveAudit('draft');
        }
        // Ctrl+Q: Post
        if (e.ctrlKey && e.key.toLowerCase() === 'q') {
            e.preventDefault();
            saveAudit('posted');
        }
    });
}

// Tab Switching - moved to bottom or consolidate here if prefer.
// But since we have a definition at the bottom (lines 405+), we can just remove this block and dependent dead code.

// Search filter logic

// Load Categories for filter dropdown
async function loadCategories() {
    try {
        const response = await fetch('/api/v1/wh-item-categories', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            const select = document.getElementById('whCategoryFilter');
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            const allowed = (user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) ? user.allowedWHItemCategories : null;

            // Keep "All Categories"
            select.innerHTML = '<option value="">All Categories</option>';
            data.data.forEach(cat => {
                if (!allowed || allowed.includes(cat._id)) {
                    const option = document.createElement('option');
                    option.value = cat._id;
                    option.textContent = cat.name;
                    select.appendChild(option);
                }
            });
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}
async function findAndAddItem(query) {
    try {
        const response = await fetch(`/api/v1/wh-items?search=${encodeURIComponent(query)}&limit=1`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            addItemToGrid(data.data[0]);
        } else {
            alert('Item not found');
        }
    } catch (error) {
        console.error('Error finding item:', error);
    }
}

// Add Item to Grid
window.addItemToGrid = async function (item, isBulk = false) {
    // Check for duplicates
    if (auditItems.find(x => x.item === item._id)) {
        if (!isBulk) alert('Item already in list');
        return;
    }

    // Get system quantity from WHItem stock array
    let systemQty = 0;
    if (item.stock && Array.isArray(item.stock) && item.stock.length > 0) {
        systemQty = item.stock[0].quantity || 0;
    }

    const row = {
        item: item._id,
        code: item.code || item.itemsCode || '',
        name: item.name || '',
        store: 'Shop',
        systemQty: systemQty, // Pre-Pack (current system stock)
        physicalQty: systemQty, // New-Pack, default to system
        costPrice: item.costPrice || 0,
        salePrice: item.salePrice || 0,
        remarks: ''
    };

    // Fetch latest stock to be sure
    try {
        const res = await fetch(`/api/v1/wh-items/${item._id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const d = await res.json();
        if (d.success && d.data.stock && d.data.stock.length > 0) {
            row.systemQty = d.data.stock[0].quantity || 0;
            row.physicalQty = row.systemQty; // reset default physical to latest system
        }
    } catch (e) { console.error("Live stock check failed", e); }

    auditItems.push(row);
    if (!isBulk) renderGrid();
};

function renderGrid() {
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = '';

    // Render existing items
    auditItems.forEach((row, index) => {
        const tr = document.createElement('tr');
        const diff = (parseFloat(row.physicalQty) || 0) - (parseFloat(row.systemQty) || 0);

        let diffColor = '';
        if (diff < 0) diffColor = 'text-danger';
        else if (diff > 0) diffColor = 'text-success';

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${row.code || ''}</td>
            <td>${row.name || ''}</td>
            <td>
                <!-- Store read-only usually, or simplified -->
                Shop
            </td>
            <td class="text-end">${row.systemQty || 0}</td>
            <td class="p-1">
                 <input type="number" class="form-control form-control-sm text-end border-0 bg-transparent" 
                        value="${row.physicalQty}" 
                        onfocus="this.select()"
                        onchange="updateRow(${index}, 'physicalQty', this.value)"
                        onkeydown="handleGridKeydown(event, ${index})">
            </td>
            <td class="text-end fw-bold ${diffColor}">${diff || 0}</td>
            <td class="p-1">
                 <input type="number" class="form-control form-control-sm text-end border-0 bg-transparent" 
                        value="${row.costPrice}" 
                        onfocus="this.select()"
                        onchange="updateRow(${index}, 'costPrice', this.value)">
            </td>
            <td class="text-end">${row.salePrice || 0}</td>
            <td class="p-1">
                <input type="text" class="form-control form-control-sm border-0 bg-transparent" 
                       value="${row.remarks || ''}" 
                       onchange="updateRow(${index}, 'remarks', this.value)">
            </td>
            <td class="text-center">
                <i class="fas fa-trash text-danger" style="cursor:pointer" onclick="removeRow(${index})"></i>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Append Empty Input Row (Like Purchase)
    renderInputRow(tbody, auditItems.length);
}

function renderInputRow(tbody, index) {
    const tr = document.createElement('tr');
    tr.id = 'new-item-row';
    tr.className = 'table-active'; // Highlight slightly to indicate entry row
    tr.innerHTML = `
        <td>${index + 1}</td>
        <td class="p-1">
            <input type="text" id="newCode" class="form-control form-control-sm" placeholder="Scan..." 
                onkeydown="handleInputRowBarcode(event)">
        </td>
        <td class="p-1 position-relative">
            <input type="text" id="newName" class="form-control form-control-sm" placeholder="Search Item..." 
                oninput="handleInputRowSearch(this)" 
                onkeydown="handleInputRowSearchKeydown(event)">
            <div class="list-group position-absolute" id="inputRowSuggestions" 
                style="z-index: 1050; display:none; max-height: 200px; overflow-y: auto; width: 300px; top:100%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            </div>
        </td>
        <td>Shop</td>
        <td class="text-end" id="newSystemQty">-</td>
        <td class="p-1">
            <input type="number" id="newQty" class="form-control form-control-sm text-end" disabled placeholder="Qty"
                onkeydown="handleInputRowQtyKeydown(event)">
        </td>
        <td class="text-end">-</td>
        <td class="text-end">-</td>
        <td class="text-end">-</td>
        <td class="p-1">
            <input type="text" id="newRemarks" class="form-control form-control-sm" disabled placeholder="Remarks"
                onkeydown="handleInputRowRemarksKeydown(event)">
        </td>
        <td class="text-center">
            <i class="fas fa-plus text-success" style="cursor:pointer" onclick="commitInputRow()"></i>
        </td>
    `;
    tbody.appendChild(tr);
}

// Input Row Logic
window.handleInputRowBarcode = function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const code = event.target.value.trim().toLowerCase();
        if (!code) return;

        // Normalize function to strip leading zeros for comparison
        const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
        const normQuery = normalize(code);

        // Client-side search
        const match = itemsList.find(item =>
            (item.barcode && normalize(item.barcode) === normQuery) ||
            (item.itemsCode && normalize(item.itemsCode) === normQuery) ||
            (item.code && normalize(item.code) === normQuery)
        );

        if (match) {
            setInputRowItem(match);
        } else {
            alert('Item not found');
            event.target.select();
        }
    }
};

// Track selection index
let searchSuggestionIndex = -1;
let searchDebounce;

window.handleInputRowSearch = function (input) {
    clearTimeout(searchDebounce);
    const query = input.value.toLowerCase().trim();
    const div = document.getElementById('inputRowSuggestions');

    if (query.length < 1) {
        div.style.display = 'none';
        searchSuggestionIndex = -1;
        return;
    }

    searchDebounce = setTimeout(() => {
        // Client-side filter
        const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
        const normQuery = normalize(query);

        const matches = itemsList.filter(item =>
            (item.name && item.name.toLowerCase().includes(query)) ||
            (item.barcode && normalize(item.barcode).includes(normQuery)) ||
            (item.itemsCode && normalize(item.itemsCode).includes(normQuery))
        ).slice(0, 10);

        div.innerHTML = '';
        searchSuggestionIndex = -1; // Reset on new search

        if (matches.length > 0) {
            // Attach matches to div for easy access in keydown
            div.matchedItems = matches;

            matches.forEach((item, idx) => {
                const a = document.createElement('a');
                a.className = 'list-group-item list-group-item-action p-1';
                a.href = '#';
                a.setAttribute('data-index', idx);
                const codeDisplay = item.barcode || item.itemsCode || item.code || 'N/A';
                a.innerHTML = `<strong>${item.name}</strong> <small class="text-muted">(${codeDisplay})</small>`;
                a.onclick = (e) => {
                    e.preventDefault();
                    setInputRowItem(item);
                    div.style.display = 'none';
                };
                div.appendChild(a);
            });
            div.style.display = 'block';
        } else {
            div.style.display = 'none';
        }
    }, 200);
};

window.handleInputRowSearchKeydown = function (event) {
    const div = document.getElementById('inputRowSuggestions');
    if (div.style.display === 'none') return;

    const items = div.querySelectorAll('a.list-group-item');
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        searchSuggestionIndex++;
        if (searchSuggestionIndex >= items.length) searchSuggestionIndex = 0; // Loop to top
        updateSelection(items, searchSuggestionIndex);

    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        searchSuggestionIndex--;
        if (searchSuggestionIndex < 0) searchSuggestionIndex = items.length - 1; // Loop to bottom
        updateSelection(items, searchSuggestionIndex);

    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (searchSuggestionIndex >= 0 && div.matchedItems && div.matchedItems[searchSuggestionIndex]) {
            setInputRowItem(div.matchedItems[searchSuggestionIndex]);
            div.style.display = 'none';
            searchSuggestionIndex = -1;
        }
    } else if (event.key === 'Escape') {
        div.style.display = 'none';
        searchSuggestionIndex = -1;
    }
}

function updateSelection(items, index) {
    items.forEach(item => item.classList.remove('active'));
    if (items[index]) {
        items[index].classList.add('active');
        items[index].scrollIntoView({ block: 'nearest' });
    }
}

let tempInputItem = null; // Store item temporarily until added

async function setInputRowItem(item) {
    tempInputItem = item;
    // Show barcode or itemsCode in the Code field
    document.getElementById('newCode').value = item.barcode || item.itemsCode || item.code || '';
    document.getElementById('newName').value = item.name || '';

    // Set System Qty (Pre-Pack)
    let systemQty = 0;
    if (item.stock && Array.isArray(item.stock) && item.stock.length > 0) {
        systemQty = item.stock[0].quantity || 0;
    }

    // Attempt live fetch for input row too
    try {
        const res = await fetch(`/api/v1/wh-items/${item._id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const d = await res.json();
        if (d.success && d.data.stock && d.data.stock.length > 0) {
            systemQty = d.data.stock[0].quantity || 0;
        }
    } catch (e) { }

    document.getElementById('newSystemQty').textContent = systemQty;
    tempInputItem.systemQty = systemQty; // store it in temp item for commit

    // Enable other fields
    const qtyInput = document.getElementById('newQty');
    qtyInput.disabled = false;
    qtyInput.value = ''; // User will enter physical quantity

    document.getElementById('newRemarks').disabled = false;

    qtyInput.focus();

    // Hide suggestions
    document.getElementById('inputRowSuggestions').style.display = 'none';
}

window.handleInputRowQtyKeydown = function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        commitInputRow();
    }
};

window.handleInputRowRemarksKeydown = function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        commitInputRow();
    }
};

function commitInputRow() {
    if (!tempInputItem) {
        // Try to commit by code if item not selected explicitly but code entered?
        // For now req user to select/scan valid item
        return;
    }

    const qty = parseFloat(document.getElementById('newQty').value) || 0;
    const remarks = document.getElementById('newRemarks').value;

    // Add to grid logic
    // Check if exists?
    const existingIndex = auditItems.findIndex(x => x.item === tempInputItem._id);
    if (existingIndex >= 0) {
        // If exists, maybe update qty? Or alert?
        // Purchase usually adds new row. Stock Audit usually sums or warns.
        // Let's warn.
        if (confirm("Item already in audit. Update quantity?")) {
            auditItems[existingIndex].physicalQty = qty; // Or += qty? usually overwrite in audit
            auditItems[existingIndex].remarks = remarks || auditItems[existingIndex].remarks;
            renderGrid();
        } else {
            // Do nothing/Clear
        }
    } else {
        // Use the systemQty we potentially fetched during selection
        let systemQty = tempInputItem.systemQty !== undefined ? tempInputItem.systemQty : 0;
        if (tempInputItem.systemQty === undefined && tempInputItem.stock && Array.isArray(tempInputItem.stock) && tempInputItem.stock.length > 0) {
            systemQty = tempInputItem.stock[0].quantity || 0;
        }

        auditItems.push({
            item: tempInputItem._id,
            code: tempInputItem.barcode || tempInputItem.itemsCode || tempInputItem.code || '',
            name: tempInputItem.name,
            store: 'Shop',
            systemQty: systemQty,
            physicalQty: qty,
            costPrice: tempInputItem.costPrice || 0,
            salePrice: tempInputItem.salePrice || 0,
            remarks: remarks
        });
        renderGrid();
    }

    // Reset temp
    tempInputItem = null;

    // Focus back on new code input after render
    setTimeout(() => {
        const newCode = document.getElementById('newCode');
        if (newCode) newCode.focus();
    }, 50);
}

// Tab Switching
window.switchTab = function (tabName) {
    if (tabName === 'detail') {
        setTimeout(() => {
            const el = document.getElementById('newCode');
            if (el) el.focus();
        }, 300);
    }
}

// Add All Items (Bulk)
window.addNewRow = async function () { // This button says "Store/Add All" in old UI? No, "Add Row" is usually single.
    // Wait, the "Add All Checks" button in header calls addNewItemRow
    // The "Add Row" button in footer calls addNewRow

    // Implementation for "Add Row" (Empty row? Or focus search?)
    document.getElementById('newCode').focus();
};

window.addNewItemRow = async function () { // "Add All Checks" / "Add All Items"
    if (!confirm("Load all items into audit? This might take a moment.")) return;

    const categoryId = document.getElementById('whCategoryFilter').value;
    let url = '/api/v1/wh-items?limit=2000'; // Increase limit
    if (categoryId) {
        url += `&category=${categoryId}`;
    }

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        if (data.success) {
            data.data.forEach(item => {
                addItemToGrid(item, true);
            });
            renderGrid();
        }
    } catch (e) {
        console.error(e);
        alert('Error loading items');
    }
};

window.updateRow = function (index, field, value) {
    if (field === 'physicalQty' || field === 'costPrice') {
        value = parseFloat(value);
        if (isNaN(value)) value = 0;
    }
    auditItems[index][field] = value;
    // Debounce re-render or just update DOM to avoid losing focus?
    // Re-rendering loses focus.
    // Better to update DOM directly for calculations.

    // Recalculate diff for this row
    const row = document.querySelectorAll('#auditTableBody tr')[index];
    if (row && field === 'physicalQty') {
        const sys = auditItems[index].systemQty || 0;
        const diff = value - sys;
        const diffCell = row.cells[6]; // Index 6 is difference
        diffCell.textContent = diff;
        diffCell.className = `text-end fw-bold ${diff < 0 ? 'text-danger' : (diff > 0 ? 'text-success' : '')}`;
    }
};

window.removeRow = function (index) {
    auditItems.splice(index, 1);
    renderGrid();
};

window.handleGridKeydown = function (event, index) {
    if (event.key === 'Enter') {
        // Move to next row's physicalQty or NEW row input
        const inputs = document.querySelectorAll('#auditTableBody input[type="number"]');
        // inputs includes the existing rows AND the new row input (if enabled)
        // new row input id is 'newQty'

        if (index < auditItems.length - 1) {
            // Focus next existing row
            // We need to find the specific input for the next row
            // Simplified: re-render handles focus? No.
            // Let's just focus New Code input if at end
        } else {
            document.getElementById('newCode').focus();
        }
    }
};

// Reset Form
window.resetForm = function () {
    auditItems = [];
    document.getElementById('auditId').value = '';
    document.getElementById('auditNo').value = '';
    document.getElementById('auditDate').valueAsDate = new Date();
    document.getElementById('remarks').value = '';
    document.getElementById('statusBadge').className = 'badge bg-white text-primary';
    document.getElementById('statusBadge').textContent = 'DRAFT';
    renderGrid();
    isEditing = false;
    currentAuditId = null;
    currentAuditStatus = null;

    // Enable inputs
    const postBtn = document.getElementById('btnPost');
    const draftBtn = document.getElementById('btnSaveDraft');
    if (postBtn) postBtn.disabled = false;
    if (draftBtn) draftBtn.disabled = false;
};

// Save Audit
window.saveAudit = async function (statusArg) {
    const status = (statusArg || 'draft').toLowerCase();
    if (auditItems.length === 0) {
        alert('Please add items to audit.');
        return;
    }

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        alert('You are not logged in. Please login again.');
        window.location.href = '/login';
        return;
    }

    const payload = {
        date: document.getElementById('auditDate').value,
        remarks: document.getElementById('remarks').value,
        items: auditItems.map(item => ({
            item: item.item,
            code: item.code || item.itemsCode || item.barcode || '',
            name: item.name || item.itemName || '',
            systemQty: item.systemQty,
            physicalQty: item.physicalQty,
            costPrice: item.costPrice,
            salePrice: item.salePrice,
            remarks: item.remarks || ''
        })),
        status: 'draft' // Always save as draft first so the /post endpoint can handle the transition and stock update
    };

    // If editing, check if we can update
    const id = document.getElementById('auditId').value || currentAuditId;
    let url = '/api/v1/wh-stock-audits';
    let method = 'POST';

    if (id) {
        url = `/api/v1/wh-stock-audits/${id}`;
        method = 'PUT';
    }

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
            const auditId = data.data._id || id;
            if (status === 'posted' && currentAuditStatus !== 'posted') {
                const postResponse = await fetch(`/api/v1/wh-stock-audits/${auditId}/post`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const postData = await postResponse.json();

                if (postData.success) {
                    alert('Stock Audit Posted Successfully');
                } else {
                    alert('Error posting audit: ' + postData.message);
                }
            } else if (currentAuditStatus === 'posted') {
                alert('Stock Audit Changes Updated Successfully');
            } else {
                alert('Stock Audit Saved as Draft');
            }
            resetForm();
            return auditId;
        } else {
            alert('Error: ' + data.message);
            return null;
        }
    } catch (error) {
        console.error('Error saving audit:', error);
        alert('Failed to save audit: ' + error.message);
        return null;
    }
};

// Load Audit List
window.loadAuditList = async function () {
    try {
        const response = await fetch('/api/v1/wh-stock-audits?sort=-date', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        const tbody = document.getElementById('auditListBody');
        tbody.innerHTML = '';

        if (data.success) {
            let audits = data.data;

            // Filter by allowed categories
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) {
                const allowed = user.allowedWHItemCategories;
                audits = audits.filter(audit => {
                    // Filter based on whCategory of the audit if it exists
                    const catId = typeof audit.whCategory === 'object' ? audit.whCategory?._id : audit.whCategory;
                    return !catId || allowed.includes(catId);
                });
            }

            audits.forEach(audit => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${audit.auditNo}</td>
                    <td>${new Date(audit.date).toLocaleDateString()}</td>
                    <td><span class="badge ${audit.status === 'posted' ? 'bg-success' : 'bg-warning text-dark'}">${audit.status.toUpperCase()}</span></td>
                    <td>${audit.remarks || ''}</td>
                    <td>${audit.createdBy ? audit.createdBy.name : 'Unknown'}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="printInvoice('${audit._id}')">
                            <i class="fas fa-print"></i>
                        </button>
                        <button class="btn btn-sm btn-primary ms-1" onclick="editAudit('${audit._id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-danger ms-1" onclick="deleteAudit('${audit._id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error loading List:', error);
    }
};

window.loadAuditDetails = async function (id) {
    try {
        const response = await fetch(`/api/v1/wh-stock-audits/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        if (data.success) {
            const audit = data.data;

            // Switch tab
            document.getElementById('detail-tab').click();

            document.getElementById('auditId').value = audit._id;
            currentAuditId = audit._id;
            document.getElementById('auditNo').value = audit.auditNo;
            document.getElementById('auditDate').value = audit.date.split('T')[0];
            document.getElementById('remarks').value = audit.remarks || '';
            document.getElementById('statusBadge').textContent = audit.status.toUpperCase();
            document.getElementById('statusBadge').className = audit.status === 'posted' ? 'badge bg-white text-success' : 'badge bg-white text-primary';

            auditItems = audit.items.map(item => ({
                item: item.item._id || item.item, // Handle population
                code: item.item.code || item.code, // Handle population
                name: item.item.name || item.name,
                store: item.store,
                systemQty: item.systemQty,
                physicalQty: item.physicalQty,
                costPrice: item.costPrice,
                salePrice: item.salePrice,
                remarks: item.remarks || ''
            }));

            renderGrid();
            isEditing = true;
            currentAuditStatus = audit.status;

            // Keeping buttons enabled for "rights" but updating badge
            const postBtn = document.getElementById('btnPost');
            const draftBtn = document.getElementById('btnSaveDraft');
            if (postBtn) postBtn.disabled = false;
            if (draftBtn) draftBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error loading details:', error);
    }
};

// Open Draft List Modal
window.openDraftList = async function () {
    try {
        const response = await fetch('/api/v1/wh-stock-audits?status=draft&sort=-date', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        const tbody = document.getElementById('draftListBody');
        tbody.innerHTML = '';

        if (data.success && data.data.length > 0) {
            data.data.forEach(audit => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${audit.auditNo}</td>
                    <td>${new Date(audit.date).toLocaleDateString()}</td>
                    <td><span class="badge bg-warning text-dark">${audit.status.toUpperCase()}</span></td>
                    <td>${audit.remarks || ''}</td>
                    <td>${audit.createdBy ? audit.createdBy.name : 'Unknown'}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="printInvoice('${audit._id}')">
                            <i class="fas fa-print"></i>
                        </button>
                        <button class="btn btn-sm btn-primary ms-1" onclick="editAudit('${audit._id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-danger ms-1" onclick="deleteAudit('${audit._id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No draft audits found</td></tr>';
        }

        const modal = new bootstrap.Modal(document.getElementById('draftListModal'));
        modal.show();
    } catch (error) {
        console.error('Error loading draft list:', error);
        alert('Failed to load draft list');
    }
};

// Open Posted List Modal
window.openPostedList = async function () {
    try {
        const response = await fetch('/api/v1/wh-stock-audits?status=posted&sort=-date', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        const tbody = document.getElementById('postedListBody');
        tbody.innerHTML = '';

        if (data.success && data.data.length > 0) {
            data.data.forEach(audit => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${audit.auditNo}</td>
                    <td>${new Date(audit.date).toLocaleDateString()}</td>
                    <td><span class="badge bg-success">${audit.status.toUpperCase()}</span></td>
                    <td>${audit.remarks || ''}</td>
                    <td>${audit.createdBy ? audit.createdBy.name : 'Unknown'}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="printInvoice('${audit._id}')">
                            <i class="fas fa-print"></i>
                        </button>
                        <button class="btn btn-sm btn-info text-white ms-1" onclick="viewAudit('${audit._id}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-sm btn-primary ms-1" onclick="editAudit('${audit._id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-danger ms-1" onclick="deleteAudit('${audit._id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No posted audits found</td></tr>';
        }

        const modal = new bootstrap.Modal(document.getElementById('postedListModal'));
        modal.show();
    } catch (error) {
        console.error('Error loading posted list:', error);
        alert('Failed to load posted list');
    }
};

// Edit Audit
window.editAudit = async function (id) {
    // Close modals
    const dModalEl = document.getElementById('draftListModal');
    const pModalEl = document.getElementById('postedListModal');

    if (dModalEl) {
        const m = bootstrap.Modal.getInstance(dModalEl);
        if (m) m.hide();
    }
    if (pModalEl) {
        const m = bootstrap.Modal.getInstance(pModalEl);
        if (m) m.hide();
    }

    // Load audit details
    await loadAuditDetails(id);
};

// View Audit (for posted)
window.viewAudit = async function (id) {
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('postedListModal'));
    if (modal) modal.hide();

    // Load audit details (read-only)
    await loadAuditDetails(id);
};

// Delete Audit
window.deleteAudit = async function (id) {
    if (!confirm('Are you sure you want to delete this audit?')) return;

    try {
        const response = await fetch(`/api/v1/wh-stock-audits/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        if (data.success) {
            alert('Audit deleted successfully');
            // Refresh whichever list modal is open
            if (document.getElementById('draftListModal').classList.contains('show')) {
                openDraftList();
            } else if (document.getElementById('postedListModal').classList.contains('show')) {
                openPostedList();
            } else {
                // Fallback for the hidden list tab
                loadAuditList();
            }
        } else {
            alert('Error deleting audit: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting audit:', error);
        alert('Failed to delete audit');
    }
};
function printInvoice(id) {
    const finalId = id || currentAuditId || document.getElementById('auditId').value;
    if (!finalId) return alert('No audit selected to print');
    window.open(`/wh-print?type=stock-audit&id=${finalId}`, '_blank');
}

async function saveAndPrint() {
    const savedId = await saveAudit('posted');
    if (savedId) {
        printInvoice(savedId);
    }
}

