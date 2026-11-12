// Purchases Management JavaScript - Desktop Design
let currentPage = 1;
let currentLimit = 10;
let purchaseItems = [];
let availableItems = [];
let suppliers = [];

document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    // Set user name
    setUserName();

    // Initialize purchases page
    initPurchasesPage();
});

// Set user name in header
function setUserName() {
    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.name || user.email;
    }
}

// Initialize purchases page
function initPurchasesPage() {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('purchaseDate').value = today;
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';

    // Load data
    loadSuppliers();
    loadItems();
    loadCategories();
    // Don't load purchases on init - only when List button is clicked
    generateInvoiceNumber();

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('startDate').addEventListener('change', loadPurchases);
    document.getElementById('endDate').addEventListener('change', loadPurchases);
    document.getElementById('statusFilter').addEventListener('change', loadPurchases);

    // Prevent page jumping when using Tab to navigate inputs inside the item entry section.
    // Capture Tab key scroll position and restore it on focusin inside the item-entry-section.
    let tabScrollPos = null;
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') {
            tabScrollPos = { x: window.scrollX, y: window.scrollY };
        }
    });

    document.addEventListener('focusin', function (e) {
        if (!tabScrollPos) return;
        // Only restore when focusing inside item-entry-section
        if (e.target && e.target.closest && e.target.closest('.item-entry-section')) {
            const pos = tabScrollPos;
            setTimeout(() => {
                try { window.scrollTo(pos.x, pos.y); } catch (err) { /* ignore */ }
                tabScrollPos = null;
            }, 0);
        } else {
            tabScrollPos = null;
        }
    });

    // Supplier change event
    document.getElementById('supplier').addEventListener('change', function () {
        const selectedSupplier = suppliers.find(s => s._id === this.value);
        if (selectedSupplier) {
            document.getElementById('preBalance').value = selectedSupplier.currentBalance || 0;
            calculateTotals();
        }
    });

    // Item selection event
    document.getElementById('itemSelect').addEventListener('change', function () {
        const selectedItem = availableItems.find(item => item._id === this.value);
        if (selectedItem) {
            document.getElementById('itemCode').value = selectedItem.sku || '';
            document.getElementById('costPrice').value = selectedItem.purchasePrice || 0;
            document.getElementById('salePrice').value = selectedItem.salePrice || 0;
            document.getElementById('stock').value = selectedItem.stockQty || 0;
            document.getElementById('taxPercent').value = selectedItem.taxPercent || 0;
            calculateItemTotal();
        }
    });

    // Item name autocomplete (instant dropdown with all items)
    const itemNameInput = document.getElementById('itemName');
    const suggestionsBox = document.getElementById('itemSuggestions');
    let allItemsForDropdown = []; // Cache all items for quick filtering

    // Helper to escape HTML
    window.escapeHtml = function (text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    };

    if (itemNameInput) {
        // Show all items on focus (instant dropdown)
        itemNameInput.addEventListener('focus', async function (e) {
            // If we already loaded items, just show them
            if (allItemsForDropdown.length > 0) {
                showAllSuggestions();
                return;
            }

            // Otherwise fetch all items
            try {
                const token = localStorage.getItem('token');
                const resp = await fetch(`/api/v1/items?limit=1000`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                if (!resp.ok) {
                    suggestionsBox.style.display = 'none';
                    return;
                }

                const data = await resp.json();
                allItemsForDropdown = data.data || [];
                showAllSuggestions();
            } catch (err) {
                console.error('Error loading items:', err);
                suggestionsBox.style.display = 'none';
            }
        });

        // Filter items as user types
        itemNameInput.addEventListener('input', function (e) {
            const q = this.value.trim();
            const categoryFilter = document.getElementById('categoryFilter');
            const selectedCategory = categoryFilter ? categoryFilter.value : '';

            if (!q) {
                showAllSuggestions();
                return;
            }

            // Filter items by substring anywhere in name, sku or barcode
            const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(esc, 'i');
            const filtered = allItemsForDropdown.filter(it => {
                const matchesCategory = !selectedCategory || it.category === selectedCategory;
                const matchesSearch = regex.test(it.name || '') || regex.test(it.sku || '') || regex.test(it.barcode || '');
                return matchesCategory && matchesSearch;
            });

            if (filtered.length === 0) {
                suggestionsBox.style.display = 'none';
                suggestionsBox.innerHTML = '';
                return;
            }

            // Render filtered suggestions
            suggestionsBox.innerHTML = filtered.map(it => `
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-purchase="${it.purchasePrice || 0}" data-sale="${it.salePrice || 0}">
                    <strong>${window.escapeHtml(it.name)}</strong> <span style="color:#666">(${window.escapeHtml(it.sku || '')})</span>
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
        });

        // Add category filter change listener
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', function () {
                // If search box is focused or has value, trigger search/suggestion update
                if (document.activeElement === itemNameInput || itemNameInput.value.trim()) {
                    itemNameInput.dispatchEvent(new Event('input'));
                } else if (document.activeElement === itemNameInput) {
                    showAllSuggestions();
                }
            });
        }

        // Helper function to show all items
        let activeSuggestionIndex = -1;

        function setActiveSuggestion(index) {
            const items = suggestionsBox.querySelectorAll('.suggestion-item');
            items.forEach((el, i) => el.classList.toggle('active', i === index));
            activeSuggestionIndex = index;
            if (index >= 0 && items[index]) {
                items[index].scrollIntoView({ block: 'nearest' });
            }
        }

        // Helper function to select item from suggestion
        function selectItemFromSuggestion(el) {
            const id = el.getAttribute('data-id');
            const name = el.getAttribute('data-name');
            const sku = el.getAttribute('data-sku');
            const stock = el.getAttribute('data-stock');
            const purchase = el.getAttribute('data-purchase');
            const sale = el.getAttribute('data-sale');

            // Set values
            const itemSelect = document.getElementById('itemSelect');
            if (itemSelect) itemSelect.value = id;
            itemNameInput.value = name || '';
            document.getElementById('itemCode').value = sku || '';
            document.getElementById('costPrice').value = purchase || 0;
            document.getElementById('salePrice').value = sale || 0;
            document.getElementById('stock').value = stock || 0;
            document.getElementById('taxPercent').value = 0;
            calculateItemTotal();

            // Hide suggestions
            suggestionsBox.style.display = 'none';
            suggestionsBox.innerHTML = '';
            activeSuggestionIndex = -1;
        }

        function showAllSuggestions() {
            const categoryFilter = document.getElementById('categoryFilter');
            const selectedCategory = categoryFilter ? categoryFilter.value : '';

            let items = allItemsForDropdown;
            if (selectedCategory) {
                items = items.filter(it => it.category === selectedCategory);
            }

            if (items.length === 0) {
                suggestionsBox.style.display = 'none';
                return;
            }
            suggestionsBox.innerHTML = items.map(it => `
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-purchase="${it.purchasePrice || 0}" data-sale="${it.salePrice || 0}">
                    <strong>${window.escapeHtml(it.name)}</strong> <span style="color:#666">(${window.escapeHtml(it.sku || '')})</span>
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
            activeSuggestionIndex = -1;
        }

        // Selection via mousedown (fires before input blur) — more reliable for mouse
        suggestionsBox.addEventListener('mousedown', function (ev) {
            const el = ev.target.closest('.suggestion-item');
            if (!el) return;
            ev.preventDefault();
            selectItemFromSuggestion(el);
        });

        // Update active suggestion on mouseover
        suggestionsBox.addEventListener('mousemove', function (ev) {
            const el = ev.target.closest('.suggestion-item');
            if (!el) return;
            const items = suggestionsBox.querySelectorAll('.suggestion-item');
            const idx = Array.prototype.indexOf.call(items, el);
            if (idx >= 0) setActiveSuggestion(idx);
        });

        // Direct click on suggestion item
        suggestionsBox.addEventListener('click', function (ev) {
            const el = ev.target.closest('.suggestion-item');
            if (!el) return;
            ev.preventDefault();
            selectItemFromSuggestion(el);
        });

        // Keyboard navigation: up/down + Enter to select
        itemNameInput.addEventListener('keydown', function (e) {
            const visible = suggestionsBox.style.display === 'block' || suggestionsBox.innerHTML.trim() !== '';
            if (!visible) return;
            const items = suggestionsBox.querySelectorAll('.suggestion-item');
            if (!items || items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = activeSuggestionIndex < items.length - 1 ? activeSuggestionIndex + 1 : 0;
                setActiveSuggestion(next);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = activeSuggestionIndex > 0 ? activeSuggestionIndex - 1 : items.length - 1;
                setActiveSuggestion(prev);
            } else if (e.key === 'Enter') {
                if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
                    e.preventDefault();
                    selectItemFromSuggestion(items[activeSuggestionIndex]);
                }
            }
        });

        // Also handle Enter when suggestions or document have focus
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            const visible = suggestionsBox.style.display === 'block' || suggestionsBox.innerHTML.trim() !== '';
            if (!visible) return;
            const focused = document.activeElement;
            const focusedSuggestion = focused && focused.classList && focused.classList.contains('suggestion-item');
            if (focusedSuggestion) {
                e.preventDefault();
                selectItemFromSuggestion(focused);
                return;
            }
            const items = suggestionsBox.querySelectorAll('.suggestion-item');
            if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
                e.preventDefault();
                selectItemFromSuggestion(items[activeSuggestionIndex]);
            }
        });

        // Allow keyboard Enter when a suggestion has focus inside the suggestions box
        suggestionsBox.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                const el = document.activeElement;
                if (el && el.classList && el.classList.contains('suggestion-item')) {
                    e.preventDefault();
                    selectItemFromSuggestion(el);
                }
            }
        });

        // Hide suggestions on blur after small delay to allow click
        let suggestionsBlurTimeout = null;
        itemNameInput.addEventListener('blur', function () {
            suggestionsBlurTimeout = setTimeout(() => {
                suggestionsBox.style.display = 'none';
            }, 200);
        });

        // If user presses inside suggestions, clear the blur timeout so selection works
        suggestionsBox.addEventListener('mousedown', function () {
            if (suggestionsBlurTimeout) {
                clearTimeout(suggestionsBlurTimeout);
                suggestionsBlurTimeout = null;
            }
        });
    }

    // Barcode scanning / manual entry on itemCode
    const itemCodeInput = document.getElementById('itemCode');
    let lastLookedUpCode = '';

    if (itemCodeInput) {
        // Trigger lookup on Enter (barcode scanners usually send Enter)
        itemCodeInput.addEventListener('keydown', async function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const code = this.value.trim();
                if (!code) return;

                // Always lookup on Enter, even if same code (maybe they want to reset)
                await handleBarcodeLookup(code);
                lastLookedUpCode = code;
            }
        });

        // Lookup when focus leaves the field (for manual typing + Tab)
        itemCodeInput.addEventListener('blur', async function () {
            const code = this.value.trim();
            if (!code) return;

            // Avoid double lookup if we just did it via Enter
            if (code === lastLookedUpCode) return;

            await handleBarcodeLookup(code);
            lastLookedUpCode = code;
        });
    }


    // Handle barcode lookup and populate item fields
    async function handleBarcodeLookup(code) {
        try {
            const token = localStorage.getItem('token');
            const resp = await fetch(`/api/v1/items/barcode/${encodeURIComponent(code)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!resp.ok) {
                // Try query-based endpoint fallback
                const resp2 = await fetch(`/api/v1/items/barcode?code=${encodeURIComponent(code)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!resp2.ok) {
                    showError(`Item not found for code: ${code}`);
                    // Optional: Clear fields if not found?
                    // clearItemFields(); 
                    // But keep the code so they can correct it
                    return;
                }
                const data2 = await resp2.json();
                populateItemFromLookup(data2.data);
                return;
            }

            const data = await resp.json();
            populateItemFromLookup(data.data);
        } catch (err) {
            console.error('Barcode lookup error:', err);
            showError('Error looking up barcode');
        }
    }

    function populateItemFromLookup(item) {
        if (!item) return;

        // Ensure item is in availableItems and dropdown
        const itemSelect = document.getElementById('itemSelect');
        let found = availableItems.find(i => i._id === item._id);

        if (!found) {
            // Add to local list
            availableItems.push(item);
            // Add option to dropdown
            if (itemSelect) {
                const option = document.createElement('option');
                option.value = item._id;
                option.textContent = `${item.name} (Stock: ${item.stockQty || 0})`;
                itemSelect.appendChild(option);
            }
            found = item;
        }

        if (itemSelect) {
            itemSelect.value = item._id;
        }

        document.getElementById('itemCode').value = item.barcode || item.sku || '';
        document.getElementById('costPrice').value = item.purchasePrice || 0;
        document.getElementById('salePrice').value = item.salePrice || 0;
        document.getElementById('stock').value = item.stockQty || 0;
        document.getElementById('taxPercent').value = item.taxPercent || 0;
        const itemNameInput = document.getElementById('itemName');
        if (itemNameInput) itemNameInput.value = item.name || '';

        calculateItemTotal();

        // Move focus to Pack (Quantity) field for quick entry
        const packInput = document.getElementById('pack');
        if (packInput) {
            packInput.focus();
            packInput.select();
        }
    }
    // Calculation events
    document.getElementById('pack').addEventListener('input', calculateItemTotal);
    document.getElementById('costPrice').addEventListener('input', calculateItemTotal);
    document.getElementById('taxPercent').addEventListener('input', calculateItemTotal);
    document.getElementById('discPercent').addEventListener('input', calculateItemTotal);
    document.getElementById('discountPercent').addEventListener('input', calculateTotals);
    document.getElementById('discountRs').addEventListener('input', calculateTotals);
    document.getElementById('totalTaxPercent').addEventListener('input', calculateTotals);
    document.getElementById('misc').addEventListener('input', calculateTotals);
    document.getElementById('freight').addEventListener('input', calculateTotals);
    document.getElementById('paid').addEventListener('input', calculateTotals);

    // Keyboard navigation: Enter on discount field adds item and focuses on next item's name field
    document.getElementById('discPercent').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addItemToPurchase();
            // Focus on itemName field for next item
            setTimeout(() => {
                const itemNameInput = document.getElementById('itemName');
                if (itemNameInput) {
                    try {
                        itemNameInput.focus({ preventScroll: true });
                    } catch (err) {
                        // Older browsers may not support preventScroll
                        itemNameInput.focus();
                    }
                }
            }, 100);
        }
    });
}

// Load suppliers
async function loadSuppliers() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/parties?partyType=supplier&limit=1000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            suppliers = data.data || [];
            const supplierSelect = document.getElementById('supplier');
            supplierSelect.innerHTML = '<option value="">-- Select Supplier --</option>';

            suppliers.forEach(supplier => {
                supplierSelect.innerHTML += `<option value="${supplier._id}">${supplier.name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

// Load items
async function loadItems() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/items?limit=1000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            availableItems = data.data || [];
            const itemSelect = document.getElementById('itemSelect');
            itemSelect.innerHTML = '<option value="">-- Select Item --</option>';

            availableItems.forEach(item => {
                itemSelect.innerHTML += `<option value="${item._id}">${item.name} (Stock: ${item.stockQty || 0})</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

// Generate invoice number
async function generateInvoiceNumber() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/purchases?limit=1&sort=-createdAt', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const lastPurchase = data.data[0];
            let newInvoice = 'PUR-001';

            if (lastPurchase && lastPurchase.invoiceNo) {
                const lastNumber = parseInt(lastPurchase.invoiceNo.split('-')[1]) || 0;
                newInvoice = `PUR-${String(lastNumber + 1).padStart(3, '0')}`;
            }

            document.getElementById('invoiceNo').value = newInvoice;
        }
    } catch (error) {
        console.error('Error generating invoice number:', error);
    }
}

// Calculate item total
function calculateItemTotal() {
    const pack = parseFloat(document.getElementById('pack').value) || 0;
    const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
    const taxPercent = parseFloat(document.getElementById('taxPercent').value) || 0;
    const discPercent = parseFloat(document.getElementById('discPercent').value) || 0;

    const subtotal = pack * costPrice;
    const taxAmount = (subtotal * taxPercent) / 100;
    const total = subtotal + taxAmount;
    const discAmount = (total * discPercent) / 100;
    const netTotal = total - discAmount;

    document.getElementById('itemTotal').value = total.toFixed(2);
    document.getElementById('taxRs').value = taxAmount.toFixed(2);
    document.getElementById('discRs').value = discAmount.toFixed(2);
    document.getElementById('itemNetTotal').value = netTotal.toFixed(2);
}

// Add item to purchase
function addItemToPurchase() {
    const itemId = document.getElementById('itemSelect').value;
    const itemCode = document.getElementById('itemCode').value;
    const pack = parseFloat(document.getElementById('pack').value) || 0;
    const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
    const salePrice = parseFloat(document.getElementById('salePrice').value) || 0;
    const taxPercent = parseFloat(document.getElementById('taxPercent').value) || 0;
    const discPercent = parseFloat(document.getElementById('discPercent').value) || 0;

    if (!itemId || pack <= 0) {
        showError('Please select an item and enter quantity');
        return;
    }

    const selectedItem = availableItems.find(item => item._id === itemId);
    if (!selectedItem) {
        showError('Item not found');
        return;
    }

    const subtotal = pack * costPrice;
    const taxAmount = (subtotal * taxPercent) / 100;
    const total = subtotal + taxAmount;
    const discAmount = (total * discPercent) / 100;
    const netTotal = total - discAmount;

    const item = {
        id: itemId,
        code: itemCode,
        name: selectedItem.name,
        pack: pack,
        costPrice: costPrice,
        salePrice: salePrice,
        subtotal: subtotal,
        taxPercent: taxPercent,
        taxAmount: taxAmount,
        total: total,
        discPercent: discPercent,
        discAmount: discAmount,
        netTotal: netTotal
    };

    purchaseItems.push(item);
    updateItemsTable();
    clearItemFields();
    calculateTotals();
}

// Update items table
function updateItemsTable() {
    const tbody = document.getElementById('purchaseItemsBody');
    tbody.innerHTML = '';

    purchaseItems.forEach((item, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.code}</td>
            <td>${item.name}</td>
            <td class="text-right">${item.pack}</td>
            <td class="text-right">${item.costPrice.toFixed(2)}</td>
            <td class="text-right">${item.subtotal.toFixed(2)}</td>
            <td class="text-right">${item.taxPercent.toFixed(2)}</td>
            <td class="text-right">${item.taxAmount.toFixed(2)}</td>
            <td class="text-right">${item.total.toFixed(2)}</td>
            <td class="text-right">${item.discPercent.toFixed(2)}</td>
            <td class="text-right">${item.discAmount.toFixed(2)}</td>
            <td class="text-right">${item.netTotal.toFixed(2)}</td>
            <td class="text-center">
                <button class="icon-btn danger" onclick="removeItem(${index})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    });

    // Update footer totals
    const totalSub = purchaseItems.reduce((sum, item) => sum + item.subtotal, 0);
    const totalTaxRs = purchaseItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const totalAmount = purchaseItems.reduce((sum, item) => sum + item.total, 0);
    const totalDiscRs = purchaseItems.reduce((sum, item) => sum + item.discAmount, 0);
    const totalNet = purchaseItems.reduce((sum, item) => sum + item.netTotal, 0);

    document.getElementById('footerSub').textContent = totalSub.toFixed(2);
    document.getElementById('footerTaxRs').textContent = totalTaxRs.toFixed(2);
    document.getElementById('footerTotal').textContent = totalAmount.toFixed(2);
    document.getElementById('footerDiscRs').textContent = totalDiscRs.toFixed(2);
    document.getElementById('footerNetTotal').textContent = totalNet.toFixed(2);
}

// Remove item from purchase
function removeItem(index) {
    purchaseItems.splice(index, 1);
    updateItemsTable();
    calculateTotals();
}

// Clear item fields
function clearItemFields() {
    document.getElementById('itemSelect').value = '';
    document.getElementById('itemCode').value = '';
    document.getElementById('pack').value = 1;
    document.getElementById('costPrice').value = '';
    document.getElementById('salePrice').value = '';
    document.getElementById('stock').value = '';
    document.getElementById('taxPercent').value = 0;
    document.getElementById('taxRs').value = '';
    document.getElementById('discPercent').value = 0;
    document.getElementById('discRs').value = '';
    document.getElementById('itemTotal').value = '';
    document.getElementById('itemNetTotal').value = '';
    const itemNameInput = document.getElementById('itemName');
    if (itemNameInput) itemNameInput.value = '';
    const suggestionsBox = document.getElementById('itemSuggestions');
    if (suggestionsBox) { suggestionsBox.style.display = 'none'; suggestionsBox.innerHTML = ''; }
}

// Calculate totals
function calculateTotals() {
    const itemsTotal = purchaseItems.reduce((sum, item) => sum + item.netTotal, 0);
    const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
    const discountRs = parseFloat(document.getElementById('discountRs').value) || 0;
    const totalTaxPercent = parseFloat(document.getElementById('totalTaxPercent').value) || 0;
    const misc = parseFloat(document.getElementById('misc').value) || 0;
    const freight = parseFloat(document.getElementById('freight').value) || 0;
    const paid = parseFloat(document.getElementById('paid').value) || 0;
    const preBalance = parseFloat(document.getElementById('preBalance').value) || 0;

    // Calculate discount
    let totalDiscount = discountRs;
    if (discountPercent > 0) {
        totalDiscount = (itemsTotal * discountPercent) / 100;
        document.getElementById('discountRs').value = totalDiscount.toFixed(2);
    }

    // Calculate after discount
    const afterDiscount = itemsTotal - totalDiscount;

    // Calculate tax
    const taxAmount = (afterDiscount * totalTaxPercent) / 100;

    // Calculate net total
    const netTotal = afterDiscount + taxAmount + misc + freight;

    // Calculate balances
    const invBalance = netTotal - paid;
    const newBalance = preBalance + invBalance;

    // Update fields
    document.getElementById('totalAmount').value = itemsTotal.toFixed(2);
    document.getElementById('totalTaxRs').value = taxAmount.toFixed(2);
    document.getElementById('netTotal').value = netTotal.toFixed(2);
    document.getElementById('invBalance').value = invBalance.toFixed(2);
    document.getElementById('newBalance').value = newBalance.toFixed(2);
}

// Save purchase
async function savePurchase(status = 'received', printAfter = false) {
    try {
        if (purchaseItems.length === 0) {
            showError('Please add at least one item');
            return;
        }

        const supplierId = document.getElementById('supplier').value;
        if (!supplierId) {
            showError('Please select a supplier');
            return;
        }

        showLoading();

        const token = localStorage.getItem('token');
        const purchaseId = document.getElementById('purchaseId').value;

        // Calculate totals
        const itemsTotal = purchaseItems.reduce((sum, item) => sum + item.netTotal, 0);
        const discountRs = parseFloat(document.getElementById('discountRs').value) || 0;
        const totalTaxPercent = parseFloat(document.getElementById('totalTaxPercent').value) || 0;
        const misc = parseFloat(document.getElementById('misc').value) || 0;
        const freight = parseFloat(document.getElementById('freight').value) || 0;
        const paid = parseFloat(document.getElementById('paid').value) || 0;

        // Calculate after discount
        const afterDiscount = itemsTotal - discountRs;

        // Calculate tax
        const taxAmount = (afterDiscount * totalTaxPercent) / 100;

        // Calculate final totals
        const subTotal = itemsTotal;
        const netTotal = afterDiscount + taxAmount + misc + freight;
        const grandTotal = netTotal;

        const formData = {
            invoiceNo: document.getElementById('invoiceNo').value,
            billNo: document.getElementById('billNo').value,
            date: document.getElementById('purchaseDate').value,
            supplier: supplierId,
            items: purchaseItems.map(item => ({
                item: item.id,
                name: item.name,
                quantity: item.pack,
                unit: 'pcs',
                purchasePrice: item.costPrice,
                costPrice: item.costPrice,
                salePrice: item.salePrice,
                taxPercent: item.taxPercent,
                discountPercent: item.discPercent,
                total: item.netTotal
            })),
            subTotal: subTotal,
            discount: discountRs,
            taxPercent: totalTaxPercent,
            taxAmount: taxAmount,
            misc: misc,
            freight: freight,
            netTotal: netTotal,
            grandTotal: grandTotal,
            paidAmount: paid,
            paymentMode: document.getElementById('paymentMode').value,
            notes: document.getElementById('remarks').value,
            status: status
        };

        const url = purchaseId ? `/api/v1/purchases/${purchaseId}` : '/api/v1/purchases';
        const method = purchaseId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            const savedPurchase = await response.json();
            clearForm();
            loadPurchases(currentPage, currentLimit);
            showSuccess(status === 'draft' ? 'Purchase saved as draft' : 'Purchase saved successfully');

            if (printAfter) {
                printPurchase(savedPurchase._id || savedPurchase.data._id);
            }
        } else {
            const error = await response.json();
            showError(error.message || 'Failed to save purchase');
        }
    } catch (error) {
        console.error('Error saving purchase:', error);
        showError('Failed to save purchase');
    } finally {
        hideLoading();
    }
}

// Load purchases
async function loadPurchases(page = 1, limit = 10) {
    try {
        showLoading();

        currentPage = page;
        currentLimit = limit;

        const token = localStorage.getItem('token');
        const search = document.getElementById('searchInput').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const status = document.getElementById('statusFilter').value;

        let queryParams = `?page=${page}&limit=${limit}`;
        if (search) queryParams += `&search=${search}`;
        if (startDate) queryParams += `&startDate=${startDate}`;
        if (endDate) queryParams += `&endDate=${endDate}`;
        if (status) queryParams += `&status=${status}`;

        const response = await fetch(`/api/v1/purchases${queryParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Purchase data received:', data); // Debug log
            if (data && data.data) {
                displayPurchases(data.data);
                updatePagination(data.pagination);
            } else {
                console.error('Invalid response structure:', data);
                showError('Invalid response from server');
            }
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Failed to load purchases' }));
            throw new Error(errorData.message || 'Failed to load purchases');
        }
    } catch (error) {
        console.error('Error loading purchases:', error);
        showError('Failed to load purchases');
    } finally {
        hideLoading();
    }
}

// Display purchases
function displayPurchases(purchases) {
    const tbody = document.getElementById('purchasesTableBody');

    if (!purchases || purchases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">No purchases found</td></tr>';
        return;
    }

    tbody.innerHTML = purchases.map(purchase => `
        <tr>
            <td class="text-center">
                <button class="icon-btn" onclick="editPurchase('${purchase._id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="icon-btn text-secondary" onclick="window.open('/print-invoice?type=purchase&id=${purchase._id}', '_blank')" title="Print">
                    <i class="fas fa-print"></i>
                </button>
            </td>
            <td>${purchase.invoiceNo}</td>
            <td>${purchase.billNo || '-'}</td>
            <td>${formatDate(purchase.date)}</td>
            <td>${purchase.supplier?.name || '-'}</td>
            <td>${purchase.items?.length || 0} items</td>
            <td class="text-right">${(parseFloat(purchase.grandTotal) || 0).toFixed(2)}</td>
            <td class="text-center"><span class="badge badge-info">${purchase.paymentMode}</span></td>
            <td class="text-center">${getPurchaseStatusBadge(purchase.status)}</td>
            <td class="text-center">
                <button class="icon-btn danger" onclick="deletePurchaseById('${purchase._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Get purchase status badge
function getPurchaseStatusBadge(status) {
    const badges = {
        draft: '<span class="badge badge-warning">Draft</span>',
        received: '<span class="badge badge-success">Received</span>',
        pending: '<span class="badge badge-info">Pending</span>',
        cancelled: '<span class="badge badge-danger">Cancelled</span>'
    };
    return badges[status] || badges.draft;
}

// Edit purchase
async function editPurchase(purchaseId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/purchases/${purchaseId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const responseData = await response.json();
            const purchase = responseData.data || responseData; // Handle both response formats

            // Populate form
            document.getElementById('purchaseId').value = purchase._id;
            document.getElementById('invoiceNo').value = purchase.invoiceNo;
            document.getElementById('billNo').value = purchase.billNo || '';
            document.getElementById('purchaseDate').value = purchase.date ? purchase.date.split('T')[0] : '';
            document.getElementById('supplier').value = purchase.supplier._id || purchase.supplier;
            document.getElementById('remarks').value = purchase.notes || '';
            document.getElementById('paymentMode').value = purchase.paymentMode || 'cash';
            document.getElementById('discountRs').value = purchase.discountTotal || purchase.discount || 0;
            document.getElementById('totalTaxPercent').value = purchase.taxPercent || 0;
            document.getElementById('misc').value = purchase.otherCharges || purchase.misc || 0;
            document.getElementById('freight').value = purchase.shippingCharges || purchase.freight || 0;
            document.getElementById('paid').value = purchase.paidAmount || 0;

            // Load items
            purchaseItems = purchase.items.map(item => ({
                id: item.item._id || item.item,
                code: item.item.sku || '',
                name: item.item.name || item.name,
                pack: item.quantity,
                costPrice: item.costPrice || item.purchasePrice || 0,
                salePrice: item.salePrice || 0,
                subtotal: item.quantity * (item.costPrice || item.purchasePrice || 0),
                taxPercent: item.taxPercent || 0,
                taxAmount: ((item.quantity * (item.costPrice || item.purchasePrice || 0)) * (item.taxPercent || 0)) / 100,
                total: item.quantity * (item.costPrice || item.purchasePrice || 0),
                discPercent: item.discountPercent || 0,
                discAmount: 0,
                netTotal: item.total || (item.quantity * (item.costPrice || item.purchasePrice || 0))
            }));

            updateItemsTable();
            calculateTotals();

            // Close the list modal
            hideList();

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

            showSuccess('Purchase loaded for editing');
        } else {
            showError('Failed to load purchase data');
        }
    } catch (error) {
        console.error('Error loading purchase data:', error);
        showError('Failed to load purchase data');
    } finally {
        hideLoading();
    }
}

// Delete purchase by ID
async function deletePurchaseById(purchaseId) {
    if (!confirm('Are you sure you want to delete this purchase?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/purchases/${purchaseId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            loadPurchases(currentPage, currentLimit);
            showSuccess('Purchase deleted successfully');
        } else {
            showError('Failed to delete purchase');
        }
    } catch (error) {
        console.error('Error deleting purchase:', error);
        showError('Failed to delete purchase');
    } finally {
        hideLoading();
    }
}

// Clear form
function clearForm() {
    document.getElementById('purchaseForm').reset();
    document.getElementById('purchaseId').value = '';
    document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('paymentMode').value = 'cash';
    purchaseItems = [];
    updateItemsTable();
    clearItemFields();
    calculateTotals();
    generateInvoiceNumber();
}

// Show purchases list
function showPurchasesList() {
    const listModal = document.getElementById('listModal');
    const listModalOverlay = document.getElementById('listModalOverlay');

    if (listModal && listModalOverlay) {
        listModal.classList.add('active');
        listModalOverlay.classList.add('active');

        // Load purchases data
        loadPurchases(currentPage, currentLimit);
    }
}

// Hide purchases list
function hideList() {
    const listModal = document.getElementById('listModal');
    const listModalOverlay = document.getElementById('listModalOverlay');

    if (listModal && listModalOverlay) {
        listModal.classList.remove('active');
        listModalOverlay.classList.remove('active');
    }
}

// Print purchase
function printPurchase(purchaseId) {
    if (!purchaseId) {
        purchaseId = document.getElementById('purchaseId').value;
    }
    if (purchaseId) {
        window.print();
    } else {
        showError('No purchase to print');
    }
}

// Search invoice
function searchInvoice() {
    const invoice = prompt('Enter invoice number:');
    if (invoice) {
        document.getElementById('searchInput').value = invoice;
        loadPurchases();
    }
}

// Hold invoice
function holdInvoice() {
    savePurchase('draft');
}

// Show unposted list
function showUnpostedList() {
    document.getElementById('statusFilter').value = 'draft';
    loadPurchases();
}

// Apply discount
function applyDiscount() {
    const discount = prompt('Enter discount percentage:');
    if (discount && !isNaN(discount)) {
        document.getElementById('discountPercent').value = discount;
        calculateTotals();
    }
}

// Handle search
function handleSearch() {
    loadPurchases(1, currentLimit);
}

// Reset filters
function resetFilters() {
    document.getElementById('searchInput').value = '';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('statusFilter').value = '';
    loadPurchases(1, currentLimit);
}

// Update pagination
function updatePagination(pagination) {
    const paginationDiv = document.getElementById('pagination');

    if (!pagination) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '<div class="d-flex justify-content-center gap-2">';

    if (pagination.prev) {
        html += `<button class="btn btn-sm btn-secondary" onclick="loadPurchases(${pagination.prev.page}, ${currentLimit})">
            <i class="fas fa-chevron-left"></i> Previous
        </button>`;
    }

    const currentPage = pagination.page || 1;
    const total = pagination.total || 0;
    const limit = pagination.limit || 10;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    html += `<button class="btn btn-sm btn-primary" disabled>
        Page ${currentPage} of ${totalPages}
    </button>`;

    if (pagination.next) {
        html += `<button class="btn btn-sm btn-secondary" onclick="loadPurchases(${pagination.next.page}, ${currentLimit})">
            Next <i class="fas fa-chevron-right"></i>
        </button>`;
    }

    html += '</div>';
    paginationDiv.innerHTML = html;
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Simple HTML escape to avoid injecting HTML into suggestions
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Format date
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// Modal functions (placeholders)
function openSupplierModal() {
    showInfo('Supplier quick add will be implemented');
}

function openItemModal() {
    showInfo('Item quick add will be implemented');
}

function showSupplierList() {
    window.location.href = '/parties';
}

function showItemList() {
    window.location.href = '/items';
}

// Load categories from items
async function loadCategories() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/categories', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (response.ok) {
            const data = await response.json();
            const categorySelect = document.getElementById('categoryFilter');
            if (categorySelect) {
                categorySelect.innerHTML = '<option value="">All Categories</option>';

                if (data.data) {
                    data.data.forEach(cat => {
                        categorySelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

