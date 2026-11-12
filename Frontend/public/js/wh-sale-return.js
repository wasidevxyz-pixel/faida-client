document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

let itemsList = [];
let customersList = [];
let categoriesList = [];
let returnItems = [];
let editingId = null;
let itemListModal, customerListModal;
let searchIndex = -1;
let customerSearchIndex = -1;

async function initializePage() {
    document.getElementById('returnDate').valueAsDate = new Date();

    // Set default filter dates
    const today = new Date();
    if (document.getElementById('listFromDate')) {
        document.getElementById('listFromDate').valueAsDate = today;
        document.getElementById('listToDate').valueAsDate = today;
    }

    await Promise.all([
        loadCustomers(),
        loadCategories(),
        loadItems(),
        loadReturnList(),
        loadNextReturnNumber()
    ]);

    setupEventListeners();

    // Initialize modals
    itemListModal = new bootstrap.Modal(document.getElementById('itemListModal'));
    customerListModal = new bootstrap.Modal(document.getElementById('customerListModal'));

    // Set user name safely
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userEl = document.getElementById('userName');
    if (user.name && userEl) userEl.textContent = user.name;
}

function setupEventListeners() {
    // Row Input calculations
    const rowInputs = ['itemPack', 'itemPrice', 'itemTaxPercent', 'itemIncentive', 'itemDiscPercent'];
    rowInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', calculateRowInput);
    });

    // Summary calculations
    const summaryInputs = ['summaryDiscPercent', 'summaryDiscRs', 'summaryTaxPercent', 'summaryTaxRs', 'summaryMisc', 'summaryFreight', 'summaryPaid'];
    summaryInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', updateGrandTotals);
    });
    // Item Selection
    // document.getElementById('itemSelect').addEventListener('change', handleItemSelect);

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.position-relative')) {
            document.getElementById('itemSuggestions').style.display = 'none';
            document.getElementById('customerSuggestions').style.display = 'none';
        }
    });
    document.getElementById('itemCode').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = e.target.value.trim();
            if (!query) return;

            // Normalize function to strip leading zeros for comparison
            const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
            const normalizedSearch = normalize(query);

            const item = itemsList.find(i =>
                (i.barcode && normalize(i.barcode) === normalizedSearch) ||
                (i.itemsCode && normalize(i.itemsCode) === normalizedSearch)
            );
            if (item) {
                selectItem(item);
            } else {
                alert('Item not found');
                e.target.select();
            }
        }
    });

    // Item Pack Enter handling
    document.getElementById('itemPack').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addItemToTable();
        }
    });

    // Customer Search

    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 'x') {
            e.preventDefault();
            openInvoiceSearch();
        }
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveReturn('Posted');
        }
    });

    // Lookup search listeners with category filter
    document.getElementById('itemLookupSearch').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const categoryId = document.getElementById('categorySelect').value;
        const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
        const normTerm = normalize(term);

        const filtered = itemsList.filter(i => {
            const matchesTerm = (i.name && i.name.toLowerCase().includes(term)) ||
                (i.barcode && normalize(i.barcode).includes(normTerm)) ||
                (i.itemsCode && normalize(i.itemsCode).includes(normTerm));

            let matchesCategory = true;
            if (categoryId) {
                matchesCategory = i.category && (
                    (i.category._id && i.category._id === categoryId) ||
                    i.category === categoryId
                );
            }
            return matchesTerm && matchesCategory;
        });
        renderLookupItemList(filtered);
    });

    document.getElementById('customerLookupSearch').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = customersList.filter(c =>
            (c.customerName && c.customerName.toLowerCase().includes(term)) ||
            (c.mobile && c.mobile.toLowerCase().includes(term)) ||
            (c.phone && c.phone.toLowerCase().includes(term)) ||
            (c.code && c.code.toLowerCase().includes(term))
        );
        renderLookupCustomerList(filtered);
    });

    // Auto Search for List View
    let searchDebounce;
    if (document.getElementById('listSearch')) {
        document.getElementById('listSearch').addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(loadReturnList, 300);
        });
    }
}

async function loadCustomers() {
    try {
        const res = await fetch('/api/v1/wh-customers', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            let customers = data.data;
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user && user.allowedWHCustomerCategories && user.allowedWHCustomerCategories.length > 0) {
                const allowed = user.allowedWHCustomerCategories;
                customers = customers.filter(c => {
                    const catId = typeof c.customerCategory === 'object' ? c.customerCategory?._id : c.customerCategory;
                    return allowed.includes(catId);
                });
            }
            customersList = customers;
        }
    } catch (err) { console.error(err); }
}

function filterCustomers(input) {
    const term = input.value.toLowerCase().trim();
    const suggestions = document.getElementById('customerSuggestions');

    if (!term) {
        suggestions.style.display = 'none';
        return;
    }

    const filtered = customersList.filter(c =>
        (c.customerName && c.customerName.toLowerCase().includes(term)) ||
        (c.mobile && c.mobile.includes(term)) ||
        (c.phone && c.phone.includes(term)) ||
        (c.code && c.code.toLowerCase().includes(term))
    ).slice(0, 15);

    if (filtered.length > 0) {
        suggestions.innerHTML = filtered.map((c, idx) => `
            <a href="javascript:void(0)" class="list-group-item list-group-item-action py-1 px-2 small" onclick="selectCustomerById('${c._id}')">
                <div class="d-flex justify-content-between">
                    <span>${c.customerName}</span>
                    <span class="text-muted small">${c.mobile || c.phone || ''}</span>
                </div>
            </a>
        `).join('');
        suggestions.style.display = 'block';
        customerSearchIndex = -1;
        suggestions.matchedItems = filtered;
    } else {
        suggestions.style.display = 'none';
    }
}

function handleCustomerSearchKeydown(e) {
    const suggestionsBox = document.getElementById('customerSuggestions');
    const items = suggestionsBox.querySelectorAll('.list-group-item');

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        customerSearchIndex = (customerSearchIndex + 1) % items.length;
        updateCustomerSelection(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        customerSearchIndex = (customerSearchIndex - 1 + items.length) % items.length;
        updateCustomerSelection(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (customerSearchIndex > -1) {
            const selected = suggestionsBox.matchedItems[customerSearchIndex];
            selectCustomer(selected);
        } else if (items.length > 0) {
            selectCustomer(suggestionsBox.matchedItems[0]);
        }
        suggestionsBox.style.display = 'none';
    } else if (e.key === 'Escape') {
        suggestionsBox.style.display = 'none';
    }
}

function updateCustomerSelection(items) {
    items.forEach(it => it.classList.remove('active'));
    if (customerSearchIndex > -1) {
        items[customerSearchIndex].classList.add('active');
        items[customerSearchIndex].scrollIntoView({ block: 'nearest' });
    }
}

function selectCustomerById(id) {
    const cust = customersList.find(c => c._id === id);
    if (cust) selectCustomer(cust);
}

function selectCustomer(cust) {
    document.getElementById('customerSelect').value = cust._id;
    document.getElementById('customerSearch').value = cust.customerName;
    document.getElementById('customerPhone').value = cust.mobile || cust.phone || '';
    document.getElementById('summaryPreBalance').value = (cust.openingBalance || 0).toFixed(2);
    document.getElementById('customerSuggestions').style.display = 'none';
    customerSearchIndex = -1;
    updateGrandTotals();
    document.getElementById('itemCode').focus();
}

async function loadCategories() {
    try {
        const res = await fetch('/api/v1/wh-item-categories', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            const allowed = (user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) ? user.allowedWHItemCategories : null;

            categoriesList = data.data;
            const select = document.getElementById('categorySelect');
            select.innerHTML = '<option value="">Select Category</option>';
            categoriesList.forEach(c => {
                if (!allowed || allowed.includes(c._id)) {
                    const opt = document.createElement('option');
                    opt.value = c._id;
                    opt.textContent = c.name;
                    select.appendChild(opt);
                }
            });
        }
    } catch (err) { console.error(err); }
}

async function loadItems() {
    try {
        const res = await fetch('/api/v1/wh-items', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            let items = data.data;
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
        }
    } catch (err) { console.error(err); }
}

function filterItems(input) {
    const term = input.value.toLowerCase().trim();
    const suggestions = document.getElementById('itemSuggestions');
    const categoryId = document.getElementById('categorySelect').value;

    if (!term) {
        suggestions.style.display = 'none';
        return;
    }

    const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
    const normTerm = normalize(term);

    const filtered = itemsList.filter(it => {
        const matchesTerm = (it.name && it.name.toLowerCase().includes(term)) ||
            (it.barcode && normalize(it.barcode).includes(normTerm)) ||
            (it.itemsCode && normalize(it.itemsCode).includes(normTerm));

        let matchesCategory = true;
        if (categoryId) {
            matchesCategory = it.category && (
                (it.category._id && it.category._id === categoryId) ||
                it.category === categoryId
            );
        }

        return matchesTerm && matchesCategory;
    }).slice(0, 15);

    if (filtered.length > 0) {
        suggestions.innerHTML = filtered.map((it, idx) => `
            <a href="javascript:void(0)" class="list-group-item list-group-item-action py-1 px-2 small" data-id="${it._id}" onclick="selectItemById('${it._id}')">
                <div class="d-flex justify-content-between">
                    <span>${it.name}</span>
                    <span class="text-muted">${it.barcode || it.itemsCode || ''}</span>
                </div>
            </a>
        `).join('');
        suggestions.style.display = 'block';
        searchIndex = -1;
        suggestions.matchedItems = filtered;
    } else {
        suggestions.style.display = 'none';
    }
}

function handleItemSearchKeydown(e) {
    const suggestionsBox = document.getElementById('itemSuggestions');
    const items = suggestionsBox.querySelectorAll('.list-group-item');

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchIndex = (searchIndex + 1) % items.length;
        updateSelection(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchIndex = (searchIndex - 1 + items.length) % items.length;
        updateSelection(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchIndex > -1) {
            const selectedItem = suggestionsBox.matchedItems[searchIndex];
            selectItem(selectedItem);
        } else if (items.length > 0) {
            selectItem(suggestionsBox.matchedItems[0]);
        }
        suggestionsBox.style.display = 'none';
    } else if (e.key === 'Escape') {
        suggestionsBox.style.display = 'none';
    }
}

function updateSelection(items) {
    items.forEach(it => it.classList.remove('active'));
    if (searchIndex > -1) {
        items[searchIndex].classList.add('active');
        items[searchIndex].scrollIntoView({ block: 'nearest' });
    }
}

function selectItemById(id) {
    const item = itemsList.find(it => it._id === id);
    if (item) selectItem(item);
}

function selectItem(item) {
    document.getElementById('itemSelect').value = item._id;
    document.getElementById('itemSearch').value = item.name;
    document.getElementById('itemCode').value = item.barcode || item.itemsCode || '';
    document.getElementById('itemSuggestions').style.display = 'none';
    searchIndex = -1;

    handleItemSelect(item);
    document.getElementById('itemPack').focus();
    document.getElementById('itemPack').select();
}

function handleCustomerSelect() {
    // Handled by selectCustomer
}

let currentReturnItemToken = 0;
let returnItemAbortController = null;

async function handleItemSelect(localItem) {
    const itemId = localItem ? localItem._id : document.getElementById('itemSelect').value;
    if (!itemId) return;
    const item = localItem || itemsList.find(i => i._id === itemId);
    if (!item) return;

    const currentToken = ++currentReturnItemToken;
    if (returnItemAbortController) {
        returnItemAbortController.abort();
    }
    returnItemAbortController = new AbortController();

    // Initial instant population from cached list
    document.getElementById('itemCode').value = item.barcode || item.itemsCode || '';
    document.getElementById('itemPrice').value = item.costPrice || 0;
    document.getElementById('itemRetailPrice').value = item.retailPrice || item.salePrice || 0;
    document.getElementById('itemIncentive').value = item.incentive || 0;
    const cachedStock = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : 0;
    document.getElementById('itemStock').value = cachedStock;
    if (document.getElementById('footerCurrentStock')) document.getElementById('footerCurrentStock').textContent = cachedStock;
    calculateRowInput();

    // Load LATEST data from API safely
    try {
        const res = await fetch(`/api/v1/wh-items/${item._id || itemId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            signal: returnItemAbortController.signal
        });
        const data = await res.json();

        // Discard stale response if item changed
        if (currentToken !== currentReturnItemToken) return;
        const currentSelectedId = document.getElementById('itemSelect').value;
        if (currentSelectedId !== (item._id || itemId)) return;

        if (data.success && data.data) {
            const it = data.data;
            const stock = (it.stock && it.stock.length > 0) ? it.stock[0].quantity : 0;
            document.getElementById('itemStock').value = stock;
            if (document.getElementById('footerCurrentStock')) document.getElementById('footerCurrentStock').textContent = stock;

            if (it.costPrice !== undefined) document.getElementById('itemPrice').value = it.costPrice;
            if (it.retailPrice !== undefined || it.salePrice !== undefined) {
                document.getElementById('itemRetailPrice').value = it.retailPrice || it.salePrice || 0;
            }
            if (it.incentive !== undefined) document.getElementById('itemIncentive').value = it.incentive;
            if (it.barcode || it.itemsCode) document.getElementById('itemCode').value = it.barcode || it.itemsCode;
            calculateRowInput();
        }
    } catch (err) {
        if (err.name !== 'AbortError') console.error('Error fetching latest item data:', err);
    }
}

function calculateRowInput(e) {
    const pack = parseFloat(document.getElementById('itemPack').value) || 0;
    const price = parseFloat(document.getElementById('itemPrice').value) || 0;
    const taxPer = parseFloat(document.getElementById('itemTaxPercent').value) || 0;
    let incentive = parseFloat(document.getElementById('itemIncentive').value) || 0;
    let discPer = parseFloat(document.getElementById('itemDiscPercent').value) || 0;

    const subTotal = pack * price;
    document.getElementById('itemRowTotal').value = subTotal.toFixed(2);

    const taxRs = (subTotal * taxPer) / 100;
    document.getElementById('itemTaxRs').value = taxRs.toFixed(2);

    const totalWithTax = subTotal + taxRs;
    document.getElementById('itemTotalWithTax').value = totalWithTax.toFixed(2);

    // Incentive/Disc logic from wh-sale.js
    if (!e || e.target.id === 'itemIncentive' || e.target.id === 'itemPack' || e.target.id === 'itemPrice') {
        if (totalWithTax > 0) {
            discPer = ((incentive * pack) / totalWithTax) * 100;
            document.getElementById('itemDiscPercent').value = discPer.toFixed(2);
        }
    }

    const discRs = (totalWithTax * discPer) / 100;
    document.getElementById('itemDiscRs').value = discRs.toFixed(2);

    const netTotal = totalWithTax - discRs;
    document.getElementById('itemNetTotal').value = netTotal.toFixed(2);
}

function addItemToTable() {
    const itemId = document.getElementById('itemSelect').value;
    if (!itemId) return alert('Please select an item');

    const item = itemsList.find(i => i._id === itemId);

    // Edit Check
    const existingIndex = returnItems.findIndex(it => it.item === itemId);
    if (existingIndex > -1) {
        if (confirm(`Item "${item.name}" already exists. Do you want to edit it?`)) {
            returnItems.splice(existingIndex, 1);
            renderTable();
            document.getElementById('itemPack').focus();
            document.getElementById('itemPack').select();
            return;
        } else {
            resetRowInput();
            return;
        }
    }

    const pack = parseFloat(document.getElementById('itemPack').value) || 0;
    if (pack <= 0) return alert('Quantity must be greater than 0');

    const returnItem = {
        item: item._id,
        name: item.name,
        barcode: item.barcode || item.itemsCode || '',
        store: document.getElementById('itemStore').value,
        quantity: pack,
        pcsPrice: parseFloat(document.getElementById('itemPrice').value) || 0,
        retailPrice: parseFloat(document.getElementById('itemRetailPrice').value) || 0,
        subTotal: parseFloat(document.getElementById('itemRowTotal').value) || 0,
        taxPercent: parseFloat(document.getElementById('itemTaxPercent').value) || 0,
        taxAmount: parseFloat(document.getElementById('itemTaxRs').value) || 0,
        totalBeforeIncentive: parseFloat(document.getElementById('itemTotalWithTax').value) || 0, // was totalBeforeDiscount
        incentive: parseFloat(document.getElementById('itemIncentive').value) || 0,
        discountPercent: parseFloat(document.getElementById('itemDiscPercent').value) || 0,
        discountAmount: parseFloat(document.getElementById('itemDiscRs').value) || 0,
        netTotal: parseFloat(document.getElementById('itemNetTotal').value) || 0
    };

    returnItems.push(returnItem);
    renderTable();
    resetRowInput();
    updateGrandTotals();
}

function renderTable() {
    const tbody = document.getElementById('returnTableBody');
    tbody.innerHTML = '';

    let totalPacks = 0, totalSub = 0, totalTax = 0, totalGross = 0, totalIncentive = 0, totalDisc = 0, totalNet = 0;

    returnItems.forEach((it, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center">${index + 1}</td>
            <td>${it.barcode || ''}</td>
            <td>${it.name || ''}</td>
            <td class="text-end">${it.quantity || 0}</td>
            <td class="text-end">${(it.pcsPrice || 0).toFixed(2)}</td>
            <td class="text-end">${(it.retailPrice || 0).toFixed(2)}</td>
            <td class="text-end">${(it.subTotal || 0).toFixed(2)}</td>
            <td class="text-end">${it.taxPercent || 0}%</td>
            <td class="text-end">${(it.taxAmount || 0).toFixed(2)}</td>
            <td class="text-end">${(it.totalBeforeIncentive || 0).toFixed(2)}</td>
            <td class="text-end">${(it.incentive || 0).toFixed(2)}</td>
            <td class="text-end">${(parseFloat(it.discountPercent || 0)).toFixed(2)}%</td>
            <td class="text-end">${(it.discountAmount || 0).toFixed(2)}</td>
            <td class="text-end fw-bold">${(it.netTotal || 0).toFixed(2)}</td>
            <td class="text-center">${it.store || ''}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-primary p-0 px-1 me-1" onclick="editItem(${index})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger p-0 px-1" style="background-color: red !important; border-color: red !important;" onclick="removeItem(${index})"><i class="fas fa-times"></i></button>
            </td>
        `;
        tbody.appendChild(tr);

        // Scroll last added item into view
        if (index === returnItems.length - 1) {
            tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        totalPacks += (it.quantity || 0);
        totalSub += (it.subTotal || 0);
        totalTax += (it.taxAmount || 0);
        totalGross += (it.totalBeforeIncentive || 0);
        totalIncentive += (it.incentive || 0);
        totalDisc += (it.discountAmount || 0);
        totalNet += (it.netTotal || 0);
    });

    document.getElementById('footerTotalPack').textContent = totalPacks.toFixed(2);
    document.getElementById('footerTotalSub').textContent = totalSub.toFixed(2);
    document.getElementById('footerTotalTax').textContent = totalTax.toFixed(2);
    document.getElementById('footerTotal').textContent = totalGross.toFixed(2);
    document.getElementById('footerTotalIncentive').textContent = totalIncentive.toFixed(2);
    document.getElementById('footerTotalDisc').textContent = totalDisc.toFixed(2);
    document.getElementById('footerTotalNet').textContent = totalNet.toFixed(2);

    document.getElementById('summaryTotal').value = totalNet.toFixed(2);
    updateGrandTotals();
}

function removeItem(index) {
    returnItems.splice(index, 1);
    renderTable();
    updateGrandTotals(); // ensure totals update
}

async function editItem(index) {
    const item = returnItems[index];

    // Remove from array and update table
    returnItems.splice(index, 1);
    renderTable();
    updateGrandTotals();

    // Set item selection
    document.getElementById('itemSelect').value = item.item;
    document.getElementById('itemSearch').value = item.name;

    // Trigger Item Select Logic
    await handleItemSelect();

    // Restore User Values
    document.getElementById('itemPack').value = item.quantity;
    document.getElementById('itemPrice').value = item.pcsPrice;
    document.getElementById('itemRetailPrice').value = item.retailPrice;
    document.getElementById('itemTaxPercent').value = item.taxPercent;
    document.getElementById('itemIncentive').value = item.incentive;
    document.getElementById('itemDiscPercent').value = item.discountPercent;
    if (item.store) document.getElementById('itemStore').value = item.store;

    // Recalculate totals based on restored values
    calculateRowInput();

    // Focus for editing
    document.getElementById('itemPack').focus();
    document.getElementById('itemPack').select();
}

function resetRowInput() {
    currentReturnItemToken++;
    if (returnItemAbortController) {
        returnItemAbortController.abort();
        returnItemAbortController = null;
    }

    document.getElementById('itemSelect').value = '';
    document.getElementById('itemSearch').value = '';
    document.getElementById('itemCode').value = '';
    document.getElementById('itemPack').value = '1';
    document.getElementById('itemPrice').value = '0';
    document.getElementById('itemRetailPrice').value = '0';
    document.getElementById('itemIncentive').value = '0';
    document.getElementById('itemTaxPercent').value = '0';
    document.getElementById('itemRowTotal').value = '0';
    document.getElementById('itemTaxRs').value = '0';
    document.getElementById('itemTotalWithTax').value = '0';
    document.getElementById('itemDiscPercent').value = '0';
    document.getElementById('itemDiscRs').value = '0';
    document.getElementById('itemNetTotal').value = '0';
    document.getElementById('itemStock').value = '0';
    if (document.getElementById('footerCurrentStock')) document.getElementById('footerCurrentStock').textContent = '0';

    const suggestions = document.getElementById('itemSuggestions');
    suggestions.innerHTML = '';
    suggestions.style.display = 'none';
    searchIndex = -1;

    document.getElementById('itemSearch').focus();
}

function updateGrandTotals() {
    const totalLines = parseFloat(document.getElementById('summaryTotal').value) || 0;

    let discPer = parseFloat(document.getElementById('summaryDiscPercent').value) || 0;
    let discRs = parseFloat(document.getElementById('summaryDiscRs').value) || 0;
    let taxPer = parseFloat(document.getElementById('summaryTaxPercent').value) || 0;
    let taxRs = parseFloat(document.getElementById('summaryTaxRs').value) || 0;
    const misc = parseFloat(document.getElementById('summaryMisc').value) || 0;
    const freight = parseFloat(document.getElementById('summaryFreight').value) || 0;
    const paid = parseFloat(document.getElementById('summaryPaid').value) || 0;
    const preBal = parseFloat(document.getElementById('summaryPreBalance').value) || 0;

    const activeId = document.activeElement ? document.activeElement.id : '';

    if (activeId === 'summaryDiscRs') {
        if (totalLines > 0) {
            discPer = (discRs / totalLines) * 100;
            document.getElementById('summaryDiscPercent').value = discPer.toFixed(2);
        }
    } else {
        discRs = (totalLines * discPer) / 100;
        document.getElementById('summaryDiscRs').value = discRs.toFixed(2);
    }

    const afterDisc = totalLines - discRs;

    if (activeId === 'summaryTaxRs') {
        if (afterDisc > 0) {
            taxPer = (taxRs / afterDisc) * 100;
            document.getElementById('summaryTaxPercent').value = taxPer.toFixed(2);
        }
    } else {
        taxRs = (afterDisc * taxPer) / 100;
        document.getElementById('summaryTaxRs').value = taxRs.toFixed(2);
    }

    const netTotal = afterDisc + taxRs + misc + freight;
    document.getElementById('summaryNetTotal').value = netTotal.toFixed(2);

    const invBal = netTotal - paid;
    document.getElementById('summaryInvBalance').value = invBal.toFixed(2);

    // Return logic: Balance usually DECREASES for customer if they return item (Credit Note).
    // Or if we pay them cash, it balances out.
    // If it's a "Credit" return, we owe them money, reducing their debt (PreBal - InvBal).
    // Let's assume Credit Return: New Balance = Pre Balance - Inv Balance (Total Return Value)
    const newBal = preBal - invBal;
    document.getElementById('summaryNewBalance').value = newBal.toFixed(2);
}

async function saveReturn(status = 'Posted') {
    const customer = document.getElementById('customerSelect').value;
    if (!customer) return alert('Please select a customer');
    if (returnItems.length === 0) return alert('Please add at least one item');

    const returnData = {
        returnNo: document.getElementById('returnNo').value || 'AUTO',
        returnDate: document.getElementById('returnDate').value,
        customer: customer,
        whCategory: document.getElementById('categorySelect').value || null,
        dcNo: document.getElementById('dcNo').value,
        biltyNo: document.getElementById('biltyNo').value,
        transporter: document.getElementById('transporterSelect').value,
        remarks: document.getElementById('remarks').value,
        items: returnItems,
        totalQuantity: parseFloat(document.getElementById('footerTotalPack').textContent),
        totalAmount: parseFloat(document.getElementById('footerTotalNet').textContent), // Note: footerTotalNet is summation of line net totals
        globalDiscountPercent: parseFloat(document.getElementById('summaryDiscPercent').value) || 0,
        globalDiscountAmount: parseFloat(document.getElementById('summaryDiscRs').value) || 0,
        globalTaxPercent: parseFloat(document.getElementById('summaryTaxPercent').value) || 0,
        globalTaxAmount: parseFloat(document.getElementById('summaryTaxRs').value) || 0,
        miscCharges: parseFloat(document.getElementById('summaryMisc').value) || 0,
        freightCharges: parseFloat(document.getElementById('summaryFreight').value) || 0,
        netTotal: parseFloat(document.getElementById('summaryNetTotal').value) || 0,
        paidAmount: parseFloat(document.getElementById('summaryPaid').value) || 0,
        returnBalance: parseFloat(document.getElementById('summaryInvBalance').value) || 0,
        previousBalance: parseFloat(document.getElementById('summaryPreBalance').value) || 0,
        newBalance: parseFloat(document.getElementById('summaryNewBalance').value) || 0,
        payMode: document.getElementById('payMode').value,
        printSize: document.getElementById('printSize').value,
        status: status
    };

    try {
        const url = editingId ? `/api/v1/wh-sale-returns/${editingId}` : '/api/v1/wh-sale-returns';
        const method = editingId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(returnData)
        });

        const result = await res.json();
        if (result.success) {
            const isPendingApproval = result.data.status === 'Pending Approval';
            alert(isPendingApproval
                ? 'Return submitted for admin approval. Inventory will be updated after approval.'
                : 'Return saved successfully!');
            const savedReturn = result.data;
            resetForm();
            loadReturnList();
            return savedReturn;
        } else {
            alert('Error: ' + result.error);
            return null;
        }
    } catch (err) {
        console.error(err);
        return null;
    }
}

function resetForm() {
    editingId = null;
    document.getElementById('returnNo').value = '';
    loadNextReturnNumber();
    document.getElementById('returnDate').valueAsDate = new Date();
    document.getElementById('customerSelect').value = '';
    document.getElementById('customerSearch').value = ''; // Clear customer search input
    document.getElementById('customerPhone').value = ''; // Clear customer phone input
    document.getElementById('categorySelect').value = '';
    document.getElementById('remarks').value = '';
    document.getElementById('dcNo').value = '';
    document.getElementById('biltyNo').value = '';
    document.getElementById('transporterSelect').value = '';
    returnItems = [];
    renderTable();
    resetRowInput();

    ['summaryDiscPercent', 'summaryDiscRs', 'summaryTaxPercent', 'summaryTaxRs', 'summaryMisc', 'summaryFreight', 'summaryPaid', 'summaryInvBalance', 'summaryPreBalance', 'summaryNewBalance'].forEach(id => {
        document.getElementById(id).value = '0';
    });
    document.getElementById('summaryNetTotal').value = '0';
}

async function loadReturnList() {
    try {
        const fromDate = document.getElementById('listFromDate') ? document.getElementById('listFromDate').value : '';
        const toDate = document.getElementById('listToDate') ? document.getElementById('listToDate').value : '';
        const search = document.getElementById('listSearch') ? document.getElementById('listSearch').value : '';

        let url = `/api/v1/wh-sale-returns?startDate=${fromDate}&endDate=${toDate}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            let returns = data.data;

            // Filter by allowed categories
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user && user.allowedWHCustomerCategories && user.allowedWHCustomerCategories.length > 0) {
                const allowed = user.allowedWHCustomerCategories;
                returns = returns.filter(r => {
                    if (!r.customer) return false;
                    const catId = typeof r.customer.customerCategory === 'object' ? r.customer.customerCategory?._id : r.customer.customerCategory;
                    return allowed.includes(catId);
                });
            }

            let rights = user.rights || {};
            if (Object.keys(rights).length === 0) {
                if (user.group && user.group.rights) rights = user.group.rights;
                else if (user.groupId && user.groupId.rights) rights = user.groupId.rights;
            }
            const isAdmin = user.role === 'admin' || (user.group && user.group.isAdmin) || (user.groupId && user.groupId.isAdmin);

            const canEdit = isAdmin || rights['wh_sale_return_edit'];
            const canDelete = isAdmin || rights['wh_sale_return_delete'];
            const canEditPosted = isAdmin || rights['wh_sale_return_edit_posted'];

            const tbody = document.getElementById('returnListBody');
            tbody.innerHTML = returns.map(r => {
                const showEdit = canEdit || (r.status === 'Posted' && canEditPosted);
                return `
                <tr>
                    <td>${r.returnNo}</td>
                    <td>${new Date(r.returnDate).toLocaleDateString()}</td>
                    <td>${r.customer ? r.customer.customerName : 'N/A'}</td>
                    <td>${r.netTotal.toFixed(2)}</td>
                    <td><span class="badge ${r.status === 'Posted' ? 'bg-success' : 'bg-warning'}">${r.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="printInvoice('${r._id}')"><i class="fas fa-print"></i></button>
                        ${showEdit ? `<button class="btn btn-sm btn-primary ms-1" onclick="editReturn('${r._id}')"><i class="fas fa-edit"></i></button>` : ''}
                        ${canDelete ? `<button class="btn btn-sm btn-danger ms-1" onclick="deleteReturn('${r._id}')"><i class="fas fa-trash"></i></button>` : ''}
                    </td>
                </tr>
            `}).join('');
        }
    } catch (err) { console.error(err); }
}

async function editReturn(id) {
    try {
        const res = await fetch(`/api/v1/wh-sale-returns/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            const r = data.data;
            editingId = r._id;
            switchToDetail();

            document.getElementById('returnNo').value = r.returnNo;
            document.getElementById('returnDate').valueAsDate = new Date(r.returnDate);

            if (r.customer) {
                selectCustomerById(r.customer._id);
            }

            document.getElementById('categorySelect').value = r.whCategory ? r.whCategory._id : '';
            document.getElementById('remarks').value = r.remarks || '';
            document.getElementById('dcNo').value = r.dcNo || '';
            document.getElementById('biltyNo').value = r.biltyNo || '';
            document.getElementById('transporterSelect').value = r.transporter || '';

            returnItems = r.items.map(it => {
                const itemDoc = it.item || {};
                return {
                    ...it,
                    item: itemDoc._id || it.item,
                    name: itemDoc.name || 'N/A',
                    retailPrice: it.retailPrice || itemDoc.retailPrice || itemDoc.salePrice || 0
                };
            });

            renderTable();

            document.getElementById('summaryDiscPercent').value = r.globalDiscountPercent;
            document.getElementById('summaryTaxPercent').value = r.globalTaxPercent;
            document.getElementById('summaryMisc').value = r.miscCharges;
            document.getElementById('summaryFreight').value = r.freightCharges;
            document.getElementById('summaryPaid').value = r.paidAmount;

            updateGrandTotals();
        }
    } catch (err) { console.error(err); }
}

async function deleteReturn(id) {
    if (!confirm('Are you sure you want to delete this return?')) return;
    try {
        const res = await fetch(`/api/v1/wh-sale-returns/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await res.json();
        if (result.success) {
            alert('Return deleted and stock reversed');
            loadReturnList();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) { console.error(err); }
}

function switchToList() {
    document.querySelector('.container-fluid').style.display = 'none';
    document.getElementById('listViewContainer').style.display = 'block';
    loadReturnList();
}

function switchToDetail() {
    document.querySelector('.container-fluid').style.display = 'block';
    document.getElementById('listViewContainer').style.display = 'none';
}

async function syncData() {
    const syncBtn = document.getElementById('syncBtn');
    const originalContent = syncBtn.innerHTML;

    syncBtn.disabled = true;
    syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Syncing...';

    try {
        await Promise.all([
            loadItems(),
            loadCustomers(),
            loadCategories()
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

function refreshCustomers() {
    loadCustomers();
}

function refreshItems() {
    loadItems();
}

function refreshCategories() {
    loadCategories();
}

function openInvoiceSearch() {
    const inv = prompt("Enter Return Number to search:");
    if (inv) alert("Search for " + inv);
}

function printInvoice(id) {
    if (!id) return;
    window.open(`/wh-print?type=sale-return&id=${id}`, '_blank');
}

async function saveAndPrint() {
    const savedReturn = await saveReturn('Posted');
    if (savedReturn?.status === 'Posted') {
        printInvoice(savedReturn._id);
    }
}

// LOOKUP FUNCTIONS
function showItemLookup() {
    const categoryId = document.getElementById('categorySelect').value;
    let items = itemsList;
    if (categoryId) {
        items = itemsList.filter(it => it.category && (
            (it.category._id && it.category._id === categoryId) ||
            it.category === categoryId
        ));
    }
    renderLookupItemList(items);
    itemListModal.show();
    setTimeout(() => document.getElementById('itemLookupSearch').focus(), 500);
}

function renderLookupItemList(items) {
    const tbody = document.getElementById('itemLookupBody');
    tbody.innerHTML = items.map(it => `
        <tr>
            <td><button class="btn btn-sm btn-primary" onclick="selectLookupItem('${it._id}')">Select</button></td>
            <td>${it.barcode || it.itemsCode || ''}</td>
            <td>${it.name}</td>
            <td>${(it.retailPrice || 0).toFixed(2)}</td>
            <td>${(it.costPrice || 0).toFixed(2)}</td>
            <td>${(it.stock && it.stock.length > 0) ? it.stock[0].quantity : 0}</td>
            <td>${it.category ? it.category.name : ''}</td>
            <td>${it.supplier ? it.supplier.supplierName : ''}</td>
        </tr>
    `).join('');
}

function selectLookupItem(id) {
    const item = itemsList.find(it => it._id === id);
    if (item) selectItem(item);
    itemListModal.hide();
}

function showCustomerLookup() {
    renderLookupCustomerList(customersList);
    customerListModal.show();
    setTimeout(() => document.getElementById('customerLookupSearch').focus(), 500);
}

function renderLookupCustomerList(customers) {
    const tbody = document.getElementById('customerLookupBody');
    tbody.innerHTML = customers.map(c => `
        <tr>
            <td><button class="btn btn-sm btn-primary" onclick="selectLookupCustomer('${c._id}')">Select</button></td>
            <td>${c.code || ''}</td>
            <td>${c.customerName}</td>
            <td>${c.mobile || c.phone || ''}</td>
            <td>${(c.openingBalance || 0).toFixed(2)}</td>
            <td>${c.category ? c.category.name : ''}</td>
        </tr>
    `).join('');
}

function selectLookupCustomer(id) {
    selectCustomerById(id);
    customerListModal.hide();
}

async function loadNextReturnNumber() {
    if (editingId) return; // Don't overwrite when editing
    try {
        const res = await fetch('/api/v1/wh-sale-returns/next-number', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('returnNo').value = result.data;
        }
    } catch (error) {
        console.error('Error loading next return number:', error);
    }
}
