document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

let itemsList = []; // Cache items for search
let rowCount = 0;

async function initializePage() {
    // Set default date
    document.getElementById('invoiceDate').valueAsDate = new Date();

    // Set default filter dates (default to last 30 days for better visibility)
    const today = new Date();
    if (document.getElementById('listFromDate')) {
        const defaultFrom = new Date();
        defaultFrom.setDate(defaultFrom.getDate() - 30);
        document.getElementById('listFromDate').value = defaultFrom.toISOString().split('T')[0];
        document.getElementById('listToDate').value = today.toISOString().split('T')[0];
    }

    await Promise.all([
        loadSuppliers(),
        loadWHCategories(),
        loadItems(),
        loadNextInvoiceNumber()
    ]);

    // Initial empty row
    addNewRow();

    // Event listeners
    const quickSearch = document.getElementById('quickItemSearch');
    quickSearch.addEventListener('keydown', handleSearchKeydown);

    document.getElementById('purchaseTableBody').addEventListener('focusin', (e) => {
        const row = e.target.closest('tr');
        if (row) {
            const itemIdInput = row.querySelector('input[name="itemId"]');
            if (itemIdInput && itemIdInput.value) {
                updateCurrentStockDisplay(itemIdInput.value);
            } else {
                updateCurrentStockDisplay(null);
            }
        }
    });

    // Default focus to quick search box
    quickSearch.focus();

    // Global Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            e.preventDefault();
            document.getElementById('quickItemSearch').focus();
        }

        // Alt + S: Save Draft
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            savePurchase('Draft');
        }

        // Ctrl + Q: Post
        if (e.ctrlKey && e.key.toLowerCase() === 'q') {
            e.preventDefault();
            savePurchase('Posted');
        }
    });

    // Form submission prevent default
    document.getElementById('purchaseForm').addEventListener('submit', (e) => e.preventDefault());

    // Global click listener to hide suggestions
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.position-relative')) {
            const boxes = document.querySelectorAll('.list-group.position-absolute');
            boxes.forEach(box => box.style.display = 'none');
        }
    });

    // Auto Search for List View
    let searchDebounce;
    if (document.getElementById('listSearch')) {
        document.getElementById('listSearch').addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(loadPurchaseList, 300);
        });
    }
}

async function loadSuppliers() {
    try {
        const response = await fetch('/api/v1/wh-suppliers', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();

        if (result.success) {
            const select = document.getElementById('supplierSelect');
            select.innerHTML = '<option value="">Select Supplier</option>';
            result.data.forEach(supplier => {
                // Check isActive based on WHSupplier model
                if (supplier.isActive !== false) {
                    const option = document.createElement('option');
                    option.value = supplier._id;
                    option.textContent = supplier.supplierName; // Correct field name
                    select.appendChild(option);
                }
            });
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}



async function loadWHCategories() {
    try {
        const response = await fetch('/api/v1/wh-item-categories', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            const select = document.getElementById('whCategoryFilter');
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            const allowed = (user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) ? user.allowedWHItemCategories : null;

            select.innerHTML = '<option value="">Select Category</option>';
            result.data.forEach(item => {
                if (!allowed || allowed.includes(item._id)) {
                    const option = document.createElement('option');
                    option.value = item._id;
                    option.textContent = item.name;
                    select.appendChild(option);
                }
            });
        }
    } catch (error) { console.error(error); }
}

async function loadItems() {
    try {
        // Fetch WH Items
        const response = await fetch('/api/v1/wh-items', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }); // Assuming this endpoint exists and returns list
        const result = await response.json();

        if (result.success) {
            let data = result.data.filter(item => item.isActive !== false);

            // Filter by allowed categories
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) {
                const allowed = user.allowedWHItemCategories;
                data = data.filter(item => {
                    const catId = typeof item.category === 'object' ? item.category?._id : item.category;
                    return allowed.includes(catId);
                });
            }
            itemsList = data;
        }
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

function refreshSuppliers() {
    loadSuppliers();
}

async function syncData() {
    const syncBtn = document.getElementById('syncBtn');
    const originalContent = syncBtn.innerHTML;

    syncBtn.disabled = true;
    syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Syncing...';

    try {
        await Promise.all([
            loadItems(),
            loadSuppliers(),
            loadWHCategories()
        ]);
        alert('Data synchronized successfully!');
    } catch (error) {
        console.error('Sync error:', error);
        alert('Failed to synchronize some data.');
    } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = originalContent;
    }
}

function getFilteredItems() {
    const categoryId = document.getElementById('whCategoryFilter').value;
    if (!categoryId) return itemsList;
    return itemsList.filter(item => {
        const itemCatId = (item.category && item.category._id) ? item.category._id : item.category;
        return itemCatId === categoryId;
    });
}

function handleSearchKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value.trim().toLowerCase();
        if (!query) return;

        const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
        const normQuery = normalize(query);

        // Search by barcode, itemsCode, or name (within category if selected)
        const searchableItems = getFilteredItems();
        const match = searchableItems.find(item =>
            (item.barcode && normalize(item.barcode) === normQuery) ||
            (item.itemsCode && normalize(item.itemsCode) === normQuery) ||
            (item.name && item.name.toLowerCase().includes(query))
        );

        if (match) {
            addNewRow(match);
            e.target.value = '';
            document.getElementById('quickSearchSuggestions').style.display = 'none';
        } else {
            alert('Item not found!');
        }
    }
}

function handleRowEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const row = e.target.closest('tr');
        const itemId = row.querySelector('input[name="itemId"]').value;

        if (itemId) {
            addNewRow(); // Add new empty row
        } else {
            alert('Please select an item first');
        }
    }
}

function addNewRow(itemData = null) {
    // Check if an empty row already exists to reuse it
    if (itemData) {
        const rows = document.querySelectorAll('#purchaseTableBody tr');
        let emptyRowId = null;

        for (const row of rows) {
            const existingId = row.querySelector('input[name="itemId"]').value;
            const barcodeVal = row.querySelector('input[name="barcode"]').value;
            const nameVal = row.querySelector('.item-search').value;

            // Check if this item already exists
            if (existingId === itemData._id) {
                const rowNum = row.querySelector('td:first-child').textContent;
                if (confirm(`This item already exists in row number ${rowNum}.\nDo you want to edit that row?`)) {
                    row.querySelector('input[name="quantity"]').select();
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                } else {
                    return;
                }
            }

            // Find first empty row
            if (!existingId && !barcodeVal && !nameVal && emptyRowId === null) {
                emptyRowId = row.id.split('-')[1];
            }
        }

        // Reuse empty row if found
        if (emptyRowId !== null) {
            selectItemForRow(itemData, emptyRowId);
            return;
        }
    }

    rowCount++;
    const tbody = document.getElementById('purchaseTableBody');
    const tr = document.createElement('tr');
    tr.id = `row-${rowCount}`;

    // Default values
    const itemId = itemData ? itemData._id : '';
    const itemName = itemData ? itemData.name : '';
    const costPrice = itemData ? itemData.costPrice || 0 : 0;
    const retailPrice = itemData ? itemData.retailPrice || 0 : 0;
    const itemBarcode = itemData ? (itemData.barcode || itemData.itemsCode || '') : '';

    tr.innerHTML = `
        <td class="text-center"> ${rowCount}</td>
        <td>
            <input type="text" class="form-control form-control-sm text-start" name="barcode" 
                   value="${itemBarcode}" placeholder="Scan..." onkeydown="handleRowBarcode(event, ${rowCount})">
        </td>
        <td class="position-relative">
            <input type="hidden" name="itemId" value="${itemId}">
            <input type="text" class="item-search form-control form-control-sm border-0 bg-transparent text-start" 
                   value="${itemName}" placeholder="Search Name..." 
                   onfocus="updateCurrentStockDisplay(this.previousElementSibling.value)"
                   oninput="filterRowItem(this, ${rowCount})" 
                   onkeydown="handleRowItemKeydown(event, ${rowCount})">
            <div class="list-group position-absolute" id="suggestions-${rowCount}" style="z-index: 1000; display:none; max-height: 200px; overflow-y: auto; width: 250px;"></div>
        </td>
        <td class="d-none"><input type="text" class="form-control form-control-sm" name="batch" onkeydown="handleRowEnter(event)"></td>
        <td><input type="date" class="form-control form-control-sm" name="expiry" value="${new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString().split('T')[0]}" onkeydown="handleRowEnter(event)"></td>
        <td><input type="number" class="form-control form-control-sm calc-input" name="quantity" value="" min="0" step="0.01" oninput="calculateRow(${rowCount})" onkeydown="handleRowEnter(event)" placeholder="Qty"></td>
        <td><input type="number" class="form-control form-control-sm" name="bonus" value="0" min="0" step="0.01" onkeydown="handleRowEnter(event)"></td>
        <td><input type="number" class="form-control form-control-sm calc-input" name="costPrice" value="${costPrice}" step="0.01" oninput="calculateRow(${rowCount})" onkeydown="handleRowEnter(event)"></td>
        <td><input type="number" class="form-control form-control-sm calc-input" name="discPercent" value="0" step="0.01" oninput="calculateRow(${rowCount})" onkeydown="handleRowEnter(event)"></td>
        <td><input type="number" class="form-control form-control-sm calc-input" name="discVal" value="0" step="0.01" readonly></td>
        <td><input type="number" class="form-control form-control-sm calc-input" name="taxPercent" value="0" step="0.01" oninput="calculateRow(${rowCount})" onkeydown="handleRowEnter(event)"></td>
        <td><input type="number" class="form-control form-control-sm calc-input" name="taxVal" value="0" step="0.01" readonly></td>
        <td><input type="number" class="form-control form-control-sm fw-bold border-0 bg-light" name="netTotal" value="0" readonly></td>
        <td><input type="number" class="form-control form-control-sm" name="retailPrice" value="${retailPrice}" step="0.01" onkeydown="handleRowEnter(event)"></td>
        <td class="text-center">
            <button type="button" class="btn btn-danger btn-sm p-0 px-1" onclick="removeRow(${rowCount})"><i class="fas fa-trash"></i></button>
        </td>
    `;

    tbody.appendChild(tr);
    tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    calculateRow(rowCount);

    // Focus logic
    if (!itemData) {
        tr.querySelector('input[name="barcode"]').focus();
    } else {
        tr.querySelector('input[name="quantity"]').select();
    }
}

function removeRow(id) {
    if (document.querySelectorAll('#purchaseTableBody tr').length > 1) {
        document.getElementById(`row-${id}`).remove();
        reindexRows();
        updateFooter();
    } else {
        // Clear last remaining row instead of removing
        const row = document.getElementById(`row-${id}`);
        const inputs = row.querySelectorAll('input');
        inputs.forEach(input => {
            if (input.type === 'number') input.value = 0;
            else if (input.type === 'date') input.valueAsDate = new Date();
            else input.value = '';
        });
        calculateRow(id);
    }
}

function reindexRows() {
    const rows = document.querySelectorAll('#purchaseTableBody tr');
    rows.forEach((row, index) => {
        row.querySelector('td:first-child').textContent = index + 1;
    });
}

let currentSuggestionIndex = {}; // Track selected index per row

function filterRowItem(input, id) {
    const query = input.value.toLowerCase();
    const suggestionsBox = document.getElementById(`suggestions-${id}`);

    if (query.length < 1) {
        suggestionsBox.style.display = 'none';
        currentSuggestionIndex[id] = -1;
        return;
    }

    const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
    const normTerm = normalize(query);

    const searchableItems = getFilteredItems();

    const matches = searchableItems.filter(item =>
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.barcode && normalize(item.barcode).includes(normTerm))
    ).slice(0, 10);

    if (matches.length > 0) {
        suggestionsBox.innerHTML = '';
        currentSuggestionIndex[id] = -1; // Reset selection

        matches.forEach((item, index) => {
            const el = document.createElement('a');
            el.className = 'list-group-item list-group-item-action p-1 small';
            el.href = '#';
            el.setAttribute('data-index', index);
            el.innerHTML = `<b>${item.name}</b> <small class="text-muted">(${item.barcode || item.itemsCode || 'No Code'})</small>`;
            el.onclick = (e) => {
                e.preventDefault();
                selectItemForRow(item, id);
                suggestionsBox.style.display = 'none';
            };
            suggestionsBox.appendChild(el);
        });

        // Store matches for keyboard navigation
        suggestionsBox.matchedItems = matches;
        suggestionsBox.style.display = 'block';
    } else {
        suggestionsBox.style.display = 'none';
    }
}

function handleRowItemKeydown(e, id) {
    const suggestionsBox = document.getElementById(`suggestions-${id}`);

    if (suggestionsBox.style.display === 'none') return;

    const items = suggestionsBox.querySelectorAll('.list-group-item');
    if (items.length === 0) return;

    // Fix: 0 is falsy, so checking against undefined
    const currentIndex = (currentSuggestionIndex[id] !== undefined) ? currentSuggestionIndex[id] : -1;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        // Go down: -1 -> 0, 0 -> 1... Stop at last.
        const newIndex = currentIndex === -1 ? 0 : (currentIndex < items.length - 1 ? currentIndex + 1 : currentIndex);
        updateSuggestionSelection(id, newIndex, items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // Go up: 1 -> 0. Stop at 0. Ignore if -1.
        if (currentIndex > 0) {
            updateSuggestionSelection(id, currentIndex - 1, items);
        }
    } else if (e.key === 'Enter' && currentIndex >= 0) {
        e.preventDefault();
        const selectedItem = suggestionsBox.matchedItems[currentIndex];
        if (selectedItem) {
            selectItemForRow(selectedItem, id);
            suggestionsBox.style.display = 'none';
        }
    } else if (e.key === 'Escape') {
        suggestionsBox.style.display = 'none';
        currentSuggestionIndex[id] = -1;
    }
}

function updateSuggestionSelection(id, newIndex, items) {
    // Remove previous selection
    items.forEach(item => item.classList.remove('active'));

    // Add new selection
    if (newIndex >= 0 && newIndex < items.length) {
        items[newIndex].classList.add('active');
        items[newIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    currentSuggestionIndex[id] = newIndex;
}

let quickSearchIndex = -1; // Track selection for quick search

function filterQuickSearch(input) {
    const query = input.value.toLowerCase();
    const suggestionsBox = document.getElementById('quickSearchSuggestions');

    if (query.length < 1) {
        suggestionsBox.style.display = 'none';
        quickSearchIndex = -1;
        return;
    }

    const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
    const normTerm = normalize(query);

    const searchableItems = getFilteredItems();

    const matches = searchableItems.filter(item =>
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.barcode && normalize(item.barcode).includes(normTerm)) ||
        (item.itemsCode && normalize(item.itemsCode).includes(normTerm))
    ).slice(0, 10);

    if (matches.length > 0) {
        suggestionsBox.innerHTML = '';
        quickSearchIndex = -1; // Reset selection

        matches.forEach((item, index) => {
            const el = document.createElement('a');
            el.className = 'list-group-item list-group-item-action p-2 small';
            el.href = '#';
            el.setAttribute('data-index', index);
            el.innerHTML = `<b>${item.name}</b> <small class="text-muted">(${item.barcode || item.itemsCode || 'No Code'})</small>`;
            el.onclick = (e) => {
                e.preventDefault();
                addNewRow(item);
                input.value = '';
                suggestionsBox.style.display = 'none';
            };
            suggestionsBox.appendChild(el);
        });

        // Store matches for keyboard navigation
        suggestionsBox.matchedItems = matches;
        suggestionsBox.style.display = 'block';
    } else {
        suggestionsBox.style.display = 'none';
    }
}

function handleQuickSearchKeydown(e) {
    const suggestionsBox = document.getElementById('quickSearchSuggestions');

    if (suggestionsBox.style.display === 'none') return;

    const items = suggestionsBox.querySelectorAll('.list-group-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        // Down: -1 -> 0. Stop at last. No loop.
        const newIndex = quickSearchIndex === -1 ? 0 : (quickSearchIndex < items.length - 1 ? quickSearchIndex + 1 : quickSearchIndex);
        updateQuickSearchSelection(newIndex, items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // Up: 1 -> 0. Stop at 0. Ignore if -1.
        // For dropup, traditionally Up from Input enters list at bottom.
        // But to keep consistency with user request (No weird jumps), let's make Up from Input enter at Bottom, but NO LOOP from Top.
        if (quickSearchIndex === -1) {
            // Enter from bottom (visually closest)
            updateQuickSearchSelection(items.length - 1, items);
        } else if (quickSearchIndex > 0) {
            updateQuickSearchSelection(quickSearchIndex - 1, items);
        }
    } else if (e.key === 'Enter' && quickSearchIndex >= 0) {
        e.preventDefault();
        const selectedItem = suggestionsBox.matchedItems[quickSearchIndex];
        if (selectedItem) {
            addNewRow(selectedItem);
            e.target.value = '';
            suggestionsBox.style.display = 'none';
        }
    } else if (e.key === 'Escape') {
        suggestionsBox.style.display = 'none';
        quickSearchIndex = -1;
    }
}

function updateQuickSearchSelection(newIndex, items) {
    // Remove previous selection
    items.forEach(item => item.classList.remove('active'));

    // Add new selection
    if (newIndex >= 0 && newIndex < items.length) {
        items[newIndex].classList.add('active');
        items[newIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    quickSearchIndex = newIndex;
}

// Handle Row Barcode Scan
function handleRowBarcode(e, id) {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (!query) return;

        const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
        const normQuery = normalize(query);

        // Search by barcode (Given Pcs) FIRST, then by itemsCode (within category if selected)
        const searchableItems = getFilteredItems();
        let match = searchableItems.find(item => item.barcode && normalize(item.barcode) === normQuery);

        if (!match) {
            match = searchableItems.find(item =>
                (item.itemsCode && normalize(item.itemsCode) === normQuery)
            );
        }

        if (match) {
            selectItemForRow(match, id);
        } else {
            alert('Item not found by code: ' + query);
            e.target.value = ''; // Clear invalid barcode
        }
    }
}

function selectItemForRow(item, id) {
    // Check duplicates
    const rows = document.querySelectorAll('#purchaseTableBody tr');
    for (const row of rows) {
        const rowIdAttr = row.id.replace('row-', '');
        if (rowIdAttr == id) continue; // Skip current row

        const existingId = row.querySelector('input[name="itemId"]').value;
        if (existingId === item._id) {
            const rowNum = row.querySelector('td:first-child').textContent;
            if (confirm(`Item already exists in row ${rowNum}.\nDo you want to edit it?`)) {
                row.querySelector('input[name="quantity"]').select();
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Clear current row
                const currentRow = document.getElementById(`row-${id}`);
                currentRow.querySelector('input[name="barcode"]').value = '';
                currentRow.querySelector('.item-search').value = '';
                currentRow.querySelector('input[name="itemId"]').value = '';
                return;
            } else {
                return;
            }
        }
    }

    const row = document.getElementById(`row-${id}`);
    row.querySelector('input[name="itemId"]').value = item._id;
    // Prefer showing the actual matched code (barcode or itemsCode) or just the item's barcode if available
    row.querySelector('input[name="barcode"]').value = item.barcode || item.itemsCode || '';
    row.querySelector('.item-search').value = item.name;
    row.querySelector('input[name="costPrice"]').value = item.costPrice || 0;
    row.querySelector('input[name="retailPrice"]').value = item.retailPrice || item.salePrice || 0;

    // Default quantity empty - user will enter
    row.querySelector('input[name="quantity"]').value = '';
    calculateRow(id);
    // Focus quantity and select content
    row.querySelector('input[name="quantity"]').focus();
    row.querySelector('input[name="quantity"]').select();

    updateCurrentStockDisplay(item._id);
}

function calculateRow(id) {
    const row = document.getElementById(`row-${id}`);

    const qty = parseFloat(row.querySelector('input[name="quantity"]').value) || 0;
    const cost = parseFloat(row.querySelector('input[name="costPrice"]').value) || 0;
    const discPer = parseFloat(row.querySelector('input[name="discPercent"]').value) || 0;
    const taxPer = parseFloat(row.querySelector('input[name="taxPercent"]').value) || 0;

    const grossTotal = qty * cost;

    const discVal = (grossTotal * discPer) / 100;
    row.querySelector('input[name="discVal"]').value = discVal.toFixed(2);

    const taxableAmount = grossTotal - discVal;

    const taxVal = (taxableAmount * taxPer) / 100;
    row.querySelector('input[name="taxVal"]').value = taxVal.toFixed(2);

    const netTotal = taxableAmount + taxVal;
    row.querySelector('input[name="netTotal"]').value = netTotal.toFixed(2);

    updateFooter();
}

function updateFooter() {
    let totalQty = 0;
    let subTotal = 0; // Sum of Net Totals
    let totalDiscount = 0;
    let totalTax = 0;
    let grandTotal = 0;

    document.querySelectorAll('#purchaseTableBody tr').forEach(row => {
        const qty = parseFloat(row.querySelector('input[name="quantity"]').value) || 0;
        const net = parseFloat(row.querySelector('input[name="netTotal"]').value) || 0;
        const disc = parseFloat(row.querySelector('input[name="discVal"]').value) || 0;
        const tax = parseFloat(row.querySelector('input[name="taxVal"]').value) || 0;

        totalQty += qty;
        subTotal += (qty * (parseFloat(row.querySelector('input[name="costPrice"]').value) || 0)); // Base Cost
        totalDiscount += disc;
        totalTax += tax;
        grandTotal += net;
    });

    document.getElementById('totalQty').textContent = totalQty.toFixed(2);
    document.getElementById('subTotal').textContent = subTotal.toFixed(2);
    document.getElementById('totalDiscount').textContent = totalDiscount.toFixed(2);
    document.getElementById('totalTax').textContent = totalTax.toFixed(2);
    document.getElementById('grandTotal').textContent = grandTotal.toFixed(2);
}

function handleRowEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        // Focus back to quick search box for next item
        document.getElementById('quickItemSearch').focus();
    }
}


async function loadPurchaseList() {
    try {
        const fromDate = document.getElementById('listFromDate')?.value || '';
        const toDate = document.getElementById('listToDate')?.value || '';
        const search = (document.getElementById('listSearch')?.value || '').trim();

        let params = [];
        if (fromDate) params.push(`startDate=${fromDate}`);
        if (toDate) params.push(`endDate=${toDate}`);
        if (search) params.push(`search=${encodeURIComponent(search)}`);
        const url = `/api/v1/wh-purchases${params.length ? '?' + params.join('&') : ''}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        const tbody = document.getElementById('purchaseListBody');
        if (response.status === 401) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-3 text-danger"><i class="fas fa-exclamation-triangle me-1"></i> Session expired. Please <a href="/login" class="fw-bold">login again</a>.</td></tr>`;
            return;
        }

        if (result.success) {
            let purchases = result.data || [];
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;

            let rights = (user && user.rights) ? { ...user.rights } : {};
            if (Object.keys(rights).length === 0 && user) {
                if (user.group && user.group.rights) {
                    rights = { ...user.group.rights };
                } else if (user.groupId && user.groupId.rights) {
                    rights = { ...user.groupId.rights };
                }
            }

            // Admin override
            const isAdmin = user && (user.role === 'admin' || (user.group && user.group.isAdmin) || (user.groupId && user.groupId.isAdmin) || (rights && rights['admin']));

            // Filter by allowed categories only for non-admin users with configured categories
            if (!isAdmin && user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) {
                const allowed = user.allowedWHItemCategories.map(c => String(c?._id || c));
                purchases = purchases.filter(p => {
                    // Filter based on whCategory of the purchase
                    const catId = typeof p.whCategory === 'object' ? p.whCategory?._id : p.whCategory;
                    return !catId || allowed.includes(String(catId));
                });
            }

            const canEdit = isAdmin || rights['wh_purchase_edit'];
            const canDelete = isAdmin || rights['wh_purchase_delete'];
            const canEditPosted = isAdmin || rights['wh_purchase_edit_posted'];

            if (purchases.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-center py-4 text-muted">
                            <i class="fas fa-inbox fa-2x mb-2 d-block text-secondary"></i>
                            No warehouse purchases found for the selected criteria.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = purchases.map(p => `
                <tr>
                    <td class="fw-bold">${p.invoiceNo || '-'}</td>
                    <td>${p.postingNumber ? String(p.postingNumber).padStart(2, '0') : '-'}</td>
                    <td>${p.invoiceDate ? new Date(p.invoiceDate).toLocaleDateString() : '-'}</td>
                    <td>${p.supplier ? (p.supplier.supplierName || p.supplier.name) : 'N/A'}</td>
                    <td>${p.remarks || ''}</td>
                    <td class="text-center">${p.totalQuantity || 0}</td>
                    <td class="text-end fw-bold">${(Number(p.grandTotal) || 0).toFixed(2)}</td>
                    <td class="text-center"><span class="badge ${p.status === 'Posted' ? 'bg-success' : 'bg-warning'}">${p.status || 'Draft'}</span></td>
                    <td>${p.createdBy ? p.createdBy.name : 'Unknown'}</td>
                    <td class="text-center text-nowrap">
                        <button class="btn btn-sm btn-secondary" onclick="printInvoice('${p._id}')" title="Print">
                            <i class="fas fa-print"></i>
                        </button>
                        ${(canEdit || (p.status === 'Posted' && canEditPosted)) ?
                    `<button class="btn btn-sm btn-primary ms-1" onclick="editPurchase('${p._id}', '${p.status}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>` : ''}
                        
                        ${canDelete ?
                    `<button class="btn btn-sm btn-danger ms-1" onclick="deletePurchase('${p._id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-3 text-danger">Error: ${result.error || 'Failed to load list'}</td></tr>`;
        }
    } catch (error) {
        console.error('loadPurchaseList error:', error);
        const tbody = document.getElementById('purchaseListBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center py-3 text-danger">Error loading list: ${error.message}</td></tr>`;
    }
}

async function deletePurchase(id) {
    if (!confirm('Are you sure you want to delete this purchase?')) return;

    try {
        const response = await fetch(`/api/v1/wh-purchases/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            alert('Purchase Deleted');
            loadPurchaseList();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) { console.error(err); }
}

async function editPurchase(id, status = 'Draft') {
    try {
        const response = await fetch(`/api/v1/wh-purchases/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();

        if (result.success) {
            const p = result.data;

            // Switch to detail view
            switchToDetail();

            // Populate Header
            document.getElementById('purchaseId').value = p._id;
            document.getElementById('invoiceNo').value = p.invoiceNo;
            document.getElementById('invoiceDate').valueAsDate = new Date(p.invoiceDate);
            document.getElementById('supplierSelect').value = p.supplier ? p.supplier._id : '';
            document.getElementById('remarks').value = p.remarks || '';
            document.getElementById('whCategoryFilter').value = p.whCategory || '';
            document.getElementById('statusBadge').textContent = p.status;
            document.getElementById('statusBadge').className = `badge ${p.status === 'Posted' ? 'bg-success' : 'bg-warning'} text-white`;

            // Populate Items
            const tbody = document.getElementById('purchaseTableBody');
            tbody.innerHTML = '';
            rowCount = 0;

            p.items.forEach(item => {
                const itemDoc = item.item || {};
                const itemData = {
                    _id: itemDoc._id || item.item,
                    name: itemDoc.name || 'N/A',
                    barcode: item.barcode || itemDoc.barcode || itemDoc.itemsCode || '',
                    costPrice: item.costPrice,
                    retailPrice: item.retailPrice || itemDoc.retailPrice || itemDoc.salePrice || 0
                };
                addNewRow(itemData);

                // Fill specific row data
                const row = document.getElementById(`row-${rowCount}`);
                row.querySelector('input[name="batch"]').value = item.batch || '';
                if (item.expiry) row.querySelector('input[name="expiry"]').valueAsDate = new Date(item.expiry);
                row.querySelector('input[name="quantity"]').value = item.quantity;
                row.querySelector('input[name="bonus"]').value = item.bonus;
                row.querySelector('input[name="discPercent"]').value = item.discountPercent;
                row.querySelector('input[name="taxPercent"]').value = item.taxPercent;

                calculateRow(rowCount);
            });

            // Handle Posted State Logic
            const user = JSON.parse(localStorage.getItem('user') || '{}');

            // Extract rights similar to sidebar.js logic
            let rights = user.rights || {};
            if (Object.keys(rights).length === 0) {
                if (user.group && user.group.rights) {
                    rights = user.group.rights;
                } else if (user.groupId && user.groupId.rights) {
                    rights = user.groupId.rights;
                }
            }

            const isAdmin = user.role === 'admin' || (user.group && user.group.isAdmin) || (rights && rights['admin']);
            const canEditPosted = isAdmin || rights['wh_purchase_edit_posted'];

            if (p.status === 'Posted') {
                if (canEditPosted) {
                    disableForm(false); // Can edit because of permission
                } else {
                    disableForm(true); // Locked
                }
            } else {
                disableForm(false);
            }
        }
    } catch (error) {
        console.error('Error loading purchase:', error);
    }
}

function disableForm(disabled) {
    const form = document.getElementById('purchaseForm');
    const elements = form.querySelectorAll('input, select, button');
    elements.forEach(el => el.disabled = disabled);

    // Always enable "New" button in header if it exists outside form, 
    // but here buttons are inside/outside.
    // Re-enable header buttons carefully
    document.getElementById('btnSaveDraft').style.display = disabled ? 'none' : 'inline-block';
    document.getElementById('btnPost').style.display = disabled ? 'none' : 'inline-block';

    // New button should always be enabled
    document.getElementById('btnNew').disabled = false;
}

function resetForm() {
    document.getElementById('purchaseForm').reset();
    document.getElementById('purchaseId').value = '';
    loadNextInvoiceNumber();
    document.getElementById('purchaseTableBody').innerHTML = '';
    document.getElementById('statusBadge').textContent = 'DRAFT';
    document.getElementById('statusBadge').className = 'badge bg-secondary text-white';
    document.getElementById('invoiceDate').valueAsDate = new Date();

    disableForm(false);
    rowCount = 0;
    addNewRow();
    switchToDetail();
    if (window.updateCurrentStockDisplay) updateCurrentStockDisplay(null);
}


let pendingSaveStatus = '';

async function savePurchase(status = 'Draft') {
    const invoiceNo = document.getElementById('invoiceNo').value;
    const supplier = document.getElementById('supplierSelect').value;
    const invoiceDate = document.getElementById('invoiceDate').value;

    if (!invoiceNo || !supplier || !invoiceDate) {
        alert('Please fill all required header fields (Invoice No, Date, Supplier)');
        return;
    }

    const items = [];
    document.querySelectorAll('#purchaseTableBody tr').forEach(row => {
        const itemId = row.querySelector('input[name="itemId"]').value;
        if (itemId) {
            items.push(true); // Just checking existence for validation
        }
    });

    if (items.length === 0) {
        alert('Please add at least one valid item');
        return;
    }

    // Open Authorization Modal
    pendingSaveStatus = status;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('authUser').value = user.name || 'Unknown';
    document.getElementById('authPassword').value = '';

    const authModal = new bootstrap.Modal(document.getElementById('authModal'));
    authModal.show();

    // Focus password after modal opens
    document.getElementById('authModal').addEventListener('shown.bs.modal', () => {
        const passField = document.getElementById('authPassword');
        passField.focus();

        // Remove previous listener to avoid stacking
        const newPassField = passField.cloneNode(true);
        passField.parentNode.replaceChild(newPassField, passField);

        newPassField.focus();
        newPassField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmAndSave();
            }
        });
    });
}

async function confirmAndSave() {
    const password = document.getElementById('authPassword').value;
    if (!password) {
        alert('Please enter your password');
        return;
    }

    try {
        // Verify Password
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const verifyResponse = await fetch('/api/v1/auth/login', { // Re-using login for verification
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: password })
        });

        const verifyResult = await verifyResponse.json();

        if (!verifyResult.success && !verifyResult.token) { // Depending on how login returns
            alert('Invalid Password');
            return;
        }

        // If verified, proceed to save
        const clickButton = document.querySelector('#authModal .btn-primary');
        const originalText = clickButton.innerHTML;
        clickButton.disabled = true;
        clickButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        await executeSave(pendingSaveStatus);

        const authModal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
        authModal.hide();
        clickButton.disabled = false;
        clickButton.innerHTML = originalText;

    } catch (error) {
        console.error('Auth Error:', error);
        alert('Authentication failed');
    }
}

async function executeSave(status) {
    const purchaseId = document.getElementById('purchaseId').value;
    const invoiceNo = document.getElementById('invoiceNo').value;
    const supplier = document.getElementById('supplierSelect').value;
    const invoiceDate = document.getElementById('invoiceDate').value;

    const items = [];
    document.querySelectorAll('#purchaseTableBody tr').forEach(row => {
        const itemId = row.querySelector('input[name="itemId"]').value;
        if (itemId) {
            items.push({
                item: itemId,
                barcode: row.querySelector('input[name="barcode"]').value,
                batch: row.querySelector('input[name="batch"]').value,
                expiry: row.querySelector('input[name="expiry"]').value || null,
                quantity: parseFloat(row.querySelector('input[name="quantity"]').value) || 0,
                bonus: parseFloat(row.querySelector('input[name="bonus"]').value) || 0,
                costPrice: parseFloat(row.querySelector('input[name="costPrice"]').value) || 0,
                // salePrice: parseFloat(row.querySelector('input[name="salePrice"]').value) || 0, // Removed as field does not exist
                retailPrice: parseFloat(row.querySelector('input[name="retailPrice"]').value) || 0,
                discountPercent: parseFloat(row.querySelector('input[name="discPercent"]').value) || 0,
                discountAmount: parseFloat(row.querySelector('input[name="discVal"]').value) || 0,
                taxPercent: parseFloat(row.querySelector('input[name="taxPercent"]').value) || 0,
                taxAmount: parseFloat(row.querySelector('input[name="taxVal"]').value) || 0,
                totalAmount: parseFloat(row.querySelector('input[name="netTotal"]').value) || 0
            });
        }
    });

    const purchaseData = {
        invoiceNo,
        invoiceDate,
        supplier,
        whCategory: document.getElementById('whCategoryFilter').value || null,
        remarks: document.getElementById('remarks').value,
        items,
        totalQuantity: parseFloat(document.getElementById('totalQty').textContent),
        subTotal: parseFloat(document.getElementById('subTotal').textContent),
        totalDiscount: parseFloat(document.getElementById('totalDiscount').textContent),
        totalTax: parseFloat(document.getElementById('totalTax').textContent),
        grandTotal: parseFloat(document.getElementById('grandTotal').textContent),
        status: status
    };

    try {
        const url = purchaseId ? `/api/v1/wh-purchases/${purchaseId}` : '/api/v1/wh-purchases';
        const method = purchaseId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(purchaseData)
        });

        const result = await response.json();

        if (result.success) {
            const savedId = result.data._id;
            if (status === 'Posted' && result.data && result.data.postingNumber) {
                alert(`Purchase Posted Successfully!\n\nPosting Number: ${String(result.data.postingNumber).padStart(2, '0')}`);
            } else {
                alert(`Purchase ${status === 'Posted' ? 'Posted' : 'Saved'} Successfully!`);
            }
            // Always reset form after successful save/post to provide empty screen
            resetForm();
            return savedId;
        } else {
            alert('Error saving purchase: ' + (result.error || 'Unknown error'));
            return null;
        }
    } catch (error) {
        console.error('Error saving purchase:', error);
        alert('System Error during save');
        return null;
    }
}


function switchToList() {
    document.getElementById('detailView').style.display = 'none';
    document.getElementById('listView').style.display = 'block';
    document.getElementById('listBtn').style.display = 'none';
    loadPurchaseList();
}

function switchToDetail() {
    document.getElementById('detailView').style.display = 'block';
    document.getElementById('listView').style.display = 'none';
    const listBtn = document.getElementById('listBtn');
    if (listBtn && window.innerWidth > 768) listBtn.style.display = 'inline-block';
}

window.updateCurrentStockDisplay = async function (itemId) {
    const display = document.getElementById('currentStockDisplay');
    if (!display) return;

    if (!itemId) {
        display.textContent = '0';
        return;
    }

    try {
        const response = await fetch(`/api/v1/wh-items/${itemId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success && result.data.stock && result.data.stock.length > 0) {
            display.textContent = result.data.stock[0].quantity || 0;
        } else {
            display.textContent = '0';
        }
    } catch (e) {
        console.error('Stock fetch error:', e);
        const item = (typeof itemsList !== 'undefined') ? itemsList.find(i => i._id === itemId) : null;
        if (item && item.stock && item.stock.length > 0) {
            display.textContent = item.stock[0].quantity || 0;
        } else {
            display.textContent = '0';
        }
    }
};
function printInvoice(id) {
    const finalId = id || document.getElementById('purchaseId').value;
    if (!finalId) return alert('No purchase selected to print');
    window.open(`/wh-print?type=purchase&id=${finalId}`, '_blank');
}

// Ensure ID is globally available for header button
window.currentPurchaseId = null;
// Proxy to watch purchaseId input
const originalPid = document.getElementById('purchaseId');
if (originalPid) {
    Object.defineProperty(window, 'currentPurchaseId', {
        get: () => originalPid.value
    });
}

async function loadNextInvoiceNumber() {
    try {
        const res = await fetch('/api/v1/wh-purchases/next-number', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('invoiceNo').value = result.data;
        }
    } catch (error) {
        console.error('Error loading next Purchase number:', error);
    }
}



