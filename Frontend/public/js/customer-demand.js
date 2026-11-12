document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('date').valueAsDate = new Date();
    loadCustomers();
    loadItems();
    setupAutocomplete();

    // Add enter key support for itemCode (Scanner support)
    const itemCodeInput = document.getElementById('itemCode');
    if (itemCodeInput) {
        itemCodeInput.focus(); // Focus on load for scanner
        itemCodeInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const code = e.target.value.trim();
                if (code) handleBarcodeLookup(code);
            }
        });
    }

    // Global shortcuts
    document.addEventListener('keydown', (e) => {
        // Alt+S to Save
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveDemand();
        }
    });
});

let items = []; // Cache items
let cart = []; // Cart items
let activeSuggestionIndex = -1;

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

async function loadCustomers() {
    try {
        const response = await fetch('/api/v1/parties?partyType=customer&limit=1000', {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        const select = document.getElementById('customer');
        select.innerHTML = '<option value="">Select Customer</option>';
        if (response.ok) {
            const customers = data.data || [];
            customers.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c._id;
                opt.text = c.name;
                select.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }
}

async function loadItems() {
    try {
        const response = await fetch('/api/v1/items?limit=1000', {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok) {
            items = data.data || [];
        }
    } catch (e) { console.error(e); }
}

// Autocomplete and Search Logic
function setupAutocomplete() {
    const input = document.getElementById('itemName');
    const box = document.getElementById('itemSuggestions');

    if (!input || !box) return;

    input.addEventListener('input', function () {
        const val = this.value.toLowerCase();
        if (!val) {
            box.style.display = 'none';
            return;
        }

        const matches = items.filter(i =>
            (i.name && i.name.toLowerCase().includes(val)) ||
            (i.code && i.code.toLowerCase().includes(val))
        ).slice(0, 20);

        if (matches.length > 0) {
            box.innerHTML = matches.map((i, idx) => `
                <a href="#" class="list-group-item list-group-item-action suggestion-item ${idx === 0 ? 'active' : ''}" 
                   data-id="${i._id}" onclick="selectItemFromSuggestion('${i._id}'); return false;">
                    <div class="d-flex w-100 justify-content-between">
                        <strong class="mb-1">${escapeHtml(i.name)}</strong>
                    </div>
                    <small class="text-muted">Code: ${escapeHtml(i.code)} | Stock: ${i.stock || 0}</small>
                </a>
            `).join('');
            box.style.display = 'block';
            activeSuggestionIndex = 0;
        } else {
            box.style.display = 'none';
        }
    });

    input.addEventListener('keydown', function (e) {
        const box = document.getElementById('itemSuggestions');
        const visible = box.style.display === 'block';
        if (!visible) return;

        const suggestionItems = box.querySelectorAll('.suggestion-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIndex++;
            if (activeSuggestionIndex >= suggestionItems.length) activeSuggestionIndex = 0;
            updateActiveSuggestion(suggestionItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIndex--;
            if (activeSuggestionIndex < 0) activeSuggestionIndex = suggestionItems.length - 1;
            updateActiveSuggestion(suggestionItems);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeSuggestionIndex >= 0 && suggestionItems[activeSuggestionIndex]) {
                const id = suggestionItems[activeSuggestionIndex].getAttribute('data-id');
                selectItemFromSuggestion(id);
            }
        } else if (e.key === 'Escape') {
            box.style.display = 'none';
        }
    });

    // Hide on blur
    input.addEventListener('blur', () => {
        setTimeout(() => {
            box.style.display = 'none';
        }, 200);
    });
}

function updateActiveSuggestion(items) {
    items.forEach(i => i.classList.remove('active'));
    if (items[activeSuggestionIndex]) {
        items[activeSuggestionIndex].classList.add('active');
        items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
    }
}

function selectItemFromSuggestion(id) {
    const item = items.find(i => i._id === id);
    if (item) {
        populateItemFields(item);
        document.getElementById('itemSuggestions').style.display = 'none';
        addItem(); // Auto add
    }
}

async function handleBarcodeLookup(code) {
    // 1. Try local cache first
    let item = items.find(i => i.code === code || i.sku === code);

    // 2. Try API if not found
    if (!item) {
        try {
            const res = await fetch(`/api/v1/items/barcode/${encodeURIComponent(code)}`, {
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                const fetchedItem = data.data;
                // Add to cache if new
                if (fetchedItem) {
                    item = fetchedItem;
                    if (!items.find(i => i._id === item._id)) items.push(item);
                }
            } else {
                // Try query param fallback logic
                const res2 = await fetch(`/api/v1/items/barcode?code=${encodeURIComponent(code)}`, {
                    headers: getAuthHeaders()
                });
                if (res2.ok) {
                    const data2 = await res2.json();
                    const fetchedItem2 = data2.data;
                    if (fetchedItem2) {
                        item = fetchedItem2;
                        if (!items.find(i => i._id === item._id)) items.push(item);
                    }
                }
            }
        } catch (e) { console.error(e); }
    }

    if (item) {
        populateItemFields(item);
        addItem();
    } else {
        alert('Item not found');
        document.getElementById('itemCode').select();
    }
}

function populateItemFields(item) {
    document.getElementById('itemSelect').value = item._id;
    document.getElementById('itemCode').value = item.code || item.sku || '';
    document.getElementById('itemName').value = item.name || '';
    document.getElementById('currentStock').value = item.stock || 0; // Using stock or stockQty? Sales.js uses stockQty, demand uses stock. Usually mapped.
}

function addItem() {
    const id = document.getElementById('itemSelect').value;
    if (!id) {
        // Fallback: check code input again (e.g. valid code typed then Add clicked)
        const code = document.getElementById('itemCode').value;
        if (code) {
            const item = items.find(i => i.code === code || i.sku === code);
            if (item) {
                addItemToCart(item);
                return;
            }
        }
        return;
    }
    const item = items.find(i => i._id === id);
    if (item) addItemToCart(item);
}

function addItemToCart(item) {
    // Smart Add: Increment if exists
    const existingIndex = cart.findIndex(c => c.itemId === item._id);
    if (existingIndex > -1) {
        const existing = cart[existingIndex];
        existing.qty += 1;

        // Recalculate row
        const amount = existing.price * existing.qty;
        existing.discAmount = (amount * existing.discPercent) / 100;
        existing.total = amount - existing.discAmount;

        renderCart();
        calculateTotals();
        clearItemFields();
        return;
    }

    cart.push({
        itemId: item._id,
        code: item.code || item.sku,
        name: item.name,
        pack: item.piecesPerCotton || '-',
        price: item.salePrice || 0,
        qty: 1,
        discPercent: 0,
        discAmount: 0,
        stock: item.stock || item.stockQty || 0
    });
    renderCart();
    calculateTotals();
    clearItemFields();
}

function clearItemFields() {
    document.getElementById('itemSelect').value = '';
    document.getElementById('itemCode').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('currentStock').value = '';
    // Focus back to Item Code for next scan
    document.getElementById('itemCode').focus();
}

function renderCart() {
    const container = document.getElementById('itemsGrid');
    container.innerHTML = '';

    cart.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'row g-0 border-bottom p-1 align-items-center';

        const amount = item.price * item.qty;
        const discount = (amount * item.discPercent) / 100;
        const total = amount - discount;
        item.discAmount = discount;
        item.total = total;

        row.innerHTML = `
            <div class="col-1 small">${escapeHtml(item.code)}</div>
            <div class="col-4 small text-truncate" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="col-1 text-center small">${item.pack}</div>
            <div class="col-1"><input type="number" class="form-control form-control-sm p-1 text-end" value="${item.price}" onchange="updateItem(${index}, 'price', this.value)"></div>
            <div class="col-1"><input type="number" class="form-control form-control-sm p-1 text-center" value="${item.qty}" onchange="updateItem(${index}, 'qty', this.value)"></div>
            <div class="col-1"><input type="number" class="form-control form-control-sm p-1 text-center" value="${item.discPercent}" onchange="updateItem(${index}, 'discPercent', this.value)"></div>
            <div class="col-1 text-end small">${discount.toFixed(2)}</div>
            <div class="col-1 text-end small fw-bold">${total.toFixed(2)}</div>
            <div class="col-1 text-center"><button class="btn btn-xs btn-danger py-0" onclick="removeItem(${index})">&times;</button></div>
        `;
        container.appendChild(row);
    });
}

window.updateItem = function (index, field, value) {
    const val = parseFloat(value);
    if (field === 'qty' && val <= 0) {
        alert('Quantity must be > 0');
        renderCart();
        return;
    }

    cart[index][field] = val || 0;
    renderCart();
    calculateTotals();
};

window.removeItem = function (index) {
    cart.splice(index, 1);
    renderCart();
    calculateTotals();
};

function calculateTotals() {
    let gross = 0;
    cart.forEach(i => gross += (i.price * i.qty));

    const itemDiscounts = cart.reduce((sum, i) => sum + ((i.price * i.qty) * i.discPercent / 100), 0);
    const grossAfterLineDisc = gross - itemDiscounts;

    document.getElementById('grossTotal').value = grossAfterLineDisc.toFixed(2);

    const globalDiscPerc = parseFloat(document.getElementById('globalDiscPercent').value || 0);
    const globalDiscAmount = (grossAfterLineDisc * globalDiscPerc) / 100;
    document.getElementById('globalDiscAmount').value = globalDiscAmount.toFixed(2);

    const taxPerc = parseFloat(document.getElementById('taxPercent').value || 0);
    const taxAmount = ((grossAfterLineDisc - globalDiscAmount) * taxPerc) / 100;
    document.getElementById('taxAmount').value = taxAmount.toFixed(2);

    const freight = parseFloat(document.getElementById('freight').value || 0);

    const net = grossAfterLineDisc - globalDiscAmount + taxAmount + freight;
    document.getElementById('netTotal').value = Math.round(net).toFixed(2);
}

window.saveDemand = async function () {
    const customer = document.getElementById('customer').value;
    if (!customer) { alert('Select Customer'); return; }
    if (cart.length === 0) { alert('Add items to list'); return; }

    const payload = {
        invNo: document.getElementById('invNo').value || undefined,
        date: document.getElementById('date').value,
        customer,
        remarks: document.getElementById('remarks').value,
        items: cart.map(i => ({
            item: i.itemId,
            quantity: i.qty,
            price: i.price,
            discountPercent: i.discPercent,
            discountAmount: i.discAmount,
            total: i.total
        })),
        totalAmount: parseFloat(document.getElementById('grossTotal').value),
        discountPercent: parseFloat(document.getElementById('globalDiscPercent').value),
        discountAmount: parseFloat(document.getElementById('globalDiscAmount').value),
        taxPercent: parseFloat(document.getElementById('taxPercent').value),
        taxAmount: parseFloat(document.getElementById('taxAmount').value),
        freightAmount: parseFloat(document.getElementById('freight').value),
        netTotal: parseFloat(document.getElementById('netTotal').value),
        paidAmount: parseFloat(document.getElementById('paidAmount').value)
    };

    try {
        const response = await fetch('/api/v1/customer-demands', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert('Saved successfully!');
            window.open(`/print-invoice?type=customer-demand&id=${data.data._id}`, '_blank', 'width=1000,height=800');
            clearForm();
        } else {
            alert('Error: ' + (data.message || 'Unknown error'));
        }
    } catch (e) {
        console.error(e);
        alert('Error saving demand');
    }
};

window.clearForm = function () {
    cart = [];
    document.getElementById('customer').value = '';
    document.getElementById('remarks').value = '';
    document.getElementById('invNo').value = '';

    document.getElementById('grossTotal').value = '0.00';
    document.getElementById('globalDiscPercent').value = '0';
    document.getElementById('globalDiscAmount').value = '0';
    document.getElementById('taxPercent').value = '0';
    document.getElementById('taxAmount').value = '0';
    document.getElementById('freight').value = '0';
    document.getElementById('netTotal').value = '0.00';
    document.getElementById('paidAmount').value = '0';

    renderCart();
    calculateTotals();
    clearItemFields();
};

window.loadDemandList = function () {
    alert('List view not yet implemented');
};

function escapeHtml(text) {
    if (!text) return '';
    return text.toString().replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

