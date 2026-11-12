// Sales Management JavaScript - Desktop Design
let currentPage = 1;
let currentLimit = 10;
let saleItems = [];
let availableItems = [];
let customers = [];

document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    // Set user name
    setUserName();

    // Initialize sales page
    initSalesPage();
});

// Set user name in header
function setUserName() {
    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.name || user.email;
    }
}

// Initialize sale returns page
function initSalesPage() {
    // Set date range (First day of month to Today)
    const todayDate = new Date();
    const firstDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);

    // Format to YYYY-MM-DD
    const formatDateInput = (date) => date.toISOString().split('T')[0];

    // Use returnDate for sale returns page (not saleDate)
    const returnDateEl = document.getElementById('returnDate');
    if (returnDateEl) returnDateEl.value = formatDateInput(todayDate);

    const startDateEl = document.getElementById('startDate');
    if (startDateEl) startDateEl.value = formatDateInput(firstDay);

    const endDateEl = document.getElementById('endDate');
    if (endDateEl) endDateEl.value = formatDateInput(todayDate);

    // Load data
    loadCustomers();
    loadItems();
    // Don't load on init - only when List button is clicked
    generateReturnNumber();

    // Event listeners with null checks
    document.getElementById('searchInput')?.addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('startDate')?.addEventListener('change', loadReturns);
    document.getElementById('endDate')?.addEventListener('change', loadReturns);
    document.getElementById('statusFilter')?.addEventListener('change', loadReturns);

    // Customer change event
    document.getElementById('customer')?.addEventListener('change', function () {
        const selectedCustomer = customers.find(c => c._id === this.value);
        if (selectedCustomer) {
            const preBalanceEl = document.getElementById('preBalance');
            if (preBalanceEl) preBalanceEl.value = selectedCustomer.currentBalance || 0;
            loadCustomerSales(this.value);
            calculateTotals();
        }
    });

    // Item selection event (hidden select used for storing item ID)
    document.getElementById('itemSelect')?.addEventListener('change', function () {
        const selectedItem = availableItems.find(item => item._id === this.value);
        if (selectedItem) {
            const itemCodeEl = document.getElementById('itemCode');
            const salePriceEl = document.getElementById('salePrice');
            const stockEl = document.getElementById('stock');
            const taxPercentEl = document.getElementById('taxPercent');

            if (itemCodeEl) itemCodeEl.value = selectedItem.sku || '';
            if (salePriceEl) salePriceEl.value = selectedItem.salePrice || 0;
            if (stockEl) stockEl.value = selectedItem.stockQty || 0;
            if (taxPercentEl) taxPercentEl.value = selectedItem.taxPercent || 0;
            calculateItemTotal();
        }
    });

    // Calculation events with null checks
    document.getElementById('quantity')?.addEventListener('input', calculateItemTotal);
    document.getElementById('salePrice')?.addEventListener('input', calculateItemTotal);
    document.getElementById('taxPercent')?.addEventListener('input', calculateItemTotal);
    document.getElementById('refunded')?.addEventListener('input', calculateTotals);
}


document.addEventListener('DOMContentLoaded', function () {
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

    // Item name autocomplete (instant dropdown with all items)
    const itemNameInput = document.getElementById('itemName');
    const suggestionsBox = document.getElementById('itemSuggestions');
    // Using global availableItems for filtering

    // Helper to escape HTML
    window.escapeHtml = function (text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    };

    if (itemNameInput) {
        // Expose function for button click
        window.showItemList = function () {
            itemNameInput.focus();
        };

        // Show all items on focus (instant dropdown)
        itemNameInput.addEventListener('focus', async function (e) {
            // If we already loaded items, just show them
            if (availableItems.length > 0) {
                showAllSuggestions();
                return;
            }

            // Otherwise fetch all items
            await loadItems();
            showAllSuggestions();
        });

        // Filter items as user types
        itemNameInput.addEventListener('input', function (e) {
            const q = this.value.trim();
            if (!q) {
                showAllSuggestions();
                return;
            }

            // Filter items by substring anywhere in name, sku or barcode
            const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(esc, 'i');
            const filtered = availableItems.filter(it => {
                return regex.test(it.name || '') || regex.test(it.sku || '') || regex.test(it.barcode || '');
            });

            if (filtered.length === 0) {
                suggestionsBox.style.display = 'none';
                suggestionsBox.innerHTML = '';
                return;
            }

            // Render filtered suggestions
            suggestionsBox.innerHTML = filtered.map(it => `
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-sale="${it.salePrice || 0}" data-tax="${it.taxPercent || 0}">
                    <strong>${window.escapeHtml(it.name)}</strong> <span style="color:#666">(${window.escapeHtml(it.sku || '')})</span>
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
        });

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
            const sale = el.getAttribute('data-sale');
            const tax = el.getAttribute('data-tax');

            // Set values with null checks
            const itemSelect = document.getElementById('itemSelect');
            const itemCodeEl = document.getElementById('itemCode');
            const salePriceEl = document.getElementById('salePrice');
            const stockEl = document.getElementById('stock');
            const taxPercentEl = document.getElementById('taxPercent');

            if (itemSelect) itemSelect.value = id;
            if (itemNameInput) itemNameInput.value = name || '';
            if (itemCodeEl) itemCodeEl.value = sku || '';
            if (salePriceEl) salePriceEl.value = sale || 0;
            if (stockEl) stockEl.value = stock || 0;
            if (taxPercentEl) taxPercentEl.value = tax || 0;
            calculateItemTotal();

            // Hide suggestions
            suggestionsBox.style.display = 'none';
            suggestionsBox.innerHTML = '';
            activeSuggestionIndex = -1;

            // Focus on quantity field for quick entry
            const quantityInput = document.getElementById('quantity');
            if (quantityInput) {
                quantityInput.focus();
                quantityInput.select();
            }
        }

        function showAllSuggestions() {
            if (availableItems.length === 0) {
                suggestionsBox.style.display = 'none';
                return;
            }
            suggestionsBox.innerHTML = availableItems.map(it => `
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-sale="${it.salePrice || 0}" data-tax="${it.taxPercent || 0}">
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

    // Keyboard navigation: Enter on tax field adds item and focuses on next item's name field
    document.getElementById('taxPercent')?.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addItemToReturn();
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
}); // end of DOMContentLoaded




// Load customers
async function loadCustomers() {
    try {
        console.log('🔄 Loading customers...');
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/parties?partyType=customer&limit=1000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('📥 Response status:', response.status);

        if (response.ok) {
            const data = await response.json();
            customers = data.data || [];
            console.log('✅ Loaded customers:', customers.length);
            console.log('📋 Customers:', customers);

            const customerSelect = document.getElementById('customer');
            customerSelect.innerHTML = '<option value="">-- Select Customer --</option>';

            customers.forEach(customer => {
                console.log('Adding customer:', customer.name, customer._id);
                console.log('Customer object:', customer);

                // Create option element properly
                const option = document.createElement('option');
                option.value = customer._id;
                option.textContent = customer.name;
                customerSelect.appendChild(option);

                console.log('Option added - value:', option.value, 'text:', option.textContent);
            });

            console.log('✅ Customer dropdown populated');
            console.log('Total options:', customerSelect.options.length);
        } else {
            const error = await response.text();
            console.error('❌ Failed to load customers:', response.status, error);
        }
    } catch (error) {
        console.error('❌ Error loading customers:', error);
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
            // Items loaded for autocomplete
        }
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

// Generate return number
async function generateReturnNumber() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/sale-returns?limit=1&sort=-createdAt', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const lastReturn = data.data?.[0];
            let newReturnNo = 'SRT-001';

            const lastReturnNo = lastReturn?.returnNumber || lastReturn?.returnNo;

            if (lastReturnNo) {
                const parts = lastReturnNo.split('-');
                if (parts.length === 2) {
                    const lastNumber = parseInt(parts[1]) || 0;
                    newReturnNo = `SRT-${String(lastNumber + 1).padStart(3, '0')}`;
                }
            }

            const returnNoEl = document.getElementById('returnNo');
            if (returnNoEl) returnNoEl.value = newReturnNo;
        }
    } catch (error) {
        console.error('Error generating return number:', error);
        const returnNoEl = document.getElementById('returnNo');
        if (returnNoEl) returnNoEl.value = 'SRT-' + Date.now().toString().slice(-4);
    }
}

// Load customer's sales for selection
async function loadCustomerSales(customerId) {
    try {
        if (!customerId) return;

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/sales?party=${customerId}&limit=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const saleInvoiceSelect = document.getElementById('saleInvoice');
            if (saleInvoiceSelect) {
                saleInvoiceSelect.innerHTML = '<option value="">-- Select Invoice --</option>';

                (data.data || []).forEach(sale => {
                    const invoiceNo = sale.invoiceNumber || sale.invoiceNo;
                    const option = document.createElement('option');
                    option.value = sale._id;
                    option.textContent = `${invoiceNo} - ${new Date(sale.date).toLocaleDateString()}`;
                    saleInvoiceSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading customer sales:', error);
    }
}

// Load sale returns for list
async function loadReturns(page = 1, limit = 10) {
    try {
        showLoading();

        currentPage = page;
        currentLimit = limit;

        const token = localStorage.getItem('token');
        const search = document.getElementById('searchInput')?.value || '';
        const startDate = document.getElementById('startDate')?.value || '';
        const endDate = document.getElementById('endDate')?.value || '';
        const status = document.getElementById('statusFilter')?.value || '';

        let queryParams = `?page=${page}&limit=${limit}`;
        if (search) queryParams += `&search=${search}`;
        if (startDate) queryParams += `&startDate=${startDate}`;
        if (endDate) queryParams += `&endDate=${endDate}`;
        if (status) queryParams += `&status=${status}`;

        const response = await fetch(`/api/v1/sale-returns${queryParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            updateReturnsTable(data.data || []);
            updatePagination(data.pagination);
        }
    } catch (error) {
        console.error('Error loading returns:', error);
    } finally {
        hideLoading();
    }
}

// Update returns table in list modal
function updateReturnsTable(returns) {
    const tbody = document.getElementById('returnsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    returns.forEach(ret => {
        const row = tbody.insertRow();
        const returnNo = ret.returnNumber || ret.returnNo || '';
        const partyName = ret.party?.name || 'N/A';
        const saleInv = ret.saleInvoice?.invoiceNumber || ret.saleInvoice?.invoiceNo || 'N/A';

        row.innerHTML = `
            <td><button class="icon-btn" onclick="editReturn('${ret._id}')" title="Edit"><i class="fas fa-edit"></i></button></td>
            <td>${returnNo}</td>
            <td>${ret.date ? new Date(ret.date).toLocaleDateString() : ''}</td>
            <td>${partyName}</td>
            <td>${saleInv}</td>
            <td>${ret.items?.length || 0}</td>
            <td class="text-right">${(ret.totalAmount || 0).toFixed(2)}</td>
            <td class="text-center">${ret.paymentMode || 'cash'}</td>
            <td class="text-center"><span class="badge ${ret.status === 'completed' ? 'bg-success' : 'bg-warning'}">${ret.status || 'draft'}</span></td>
            <td class="text-center">
                <button class="icon-btn danger" onclick="deleteReturn('${ret._id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

// Load categories
async function loadCategories() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/categories', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const categorySelect = document.getElementById('category');
            categorySelect.innerHTML = '<option value="">-- Select --</option>';

            if (data.data) {
                data.data.forEach(cat => {
                    categorySelect.innerHTML += `<option value="${cat._id}">${cat.name}</option>`;
                });
            }
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Generate invoice number
async function generateInvoiceNumber() {
    try {
        console.log('🔄 Generating invoice number...');
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/sales?limit=1&sort=-createdAt', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const lastSale = data.data[0];
            let newInvoice = 'INV-001';

            // Check for both invoiceNumber (model) and invoiceNo (legacy)
            const lastInvoiceNo = lastSale ? (lastSale.invoiceNumber || lastSale.invoiceNo) : null;

            if (lastInvoiceNo) {
                const parts = lastInvoiceNo.split('-');
                if (parts.length === 2) {
                    const lastNumber = parseInt(parts[1]) || 0;
                    newInvoice = `INV-${String(lastNumber + 1).padStart(3, '0')}`;
                }
            }

            console.log('✅ Generated Invoice Number:', newInvoice);
            document.getElementById('invoiceNo').value = newInvoice;
        } else {
            console.error('❌ Failed to fetch last sale for invoice generation');
        }
    } catch (error) {
        console.error('❌ Error generating invoice number:', error);
        // Fallback
        document.getElementById('invoiceNo').value = 'INV-' + Date.now().toString().slice(-4);
    }
}

// Calculate item total
function calculateItemTotal() {
    const quantity = parseFloat(document.getElementById('quantity')?.value) || 0;
    const salePrice = parseFloat(document.getElementById('salePrice')?.value) || 0;
    const taxPercent = parseFloat(document.getElementById('taxPercent')?.value) || 0;

    const subtotal = quantity * salePrice;
    const taxAmount = (subtotal * taxPercent) / 100;
    const total = subtotal + taxAmount;

    const itemTotalEl = document.getElementById('itemTotal');
    const taxRsEl = document.getElementById('taxRs');

    if (itemTotalEl) itemTotalEl.value = total.toFixed(2);
    if (taxRsEl) taxRsEl.value = taxAmount.toFixed(2);
}

// Add item to return
function addItemToReturn() {
    const itemId = document.getElementById('itemSelect')?.value;
    const itemCode = document.getElementById('itemCode')?.value || '';
    const quantity = parseFloat(document.getElementById('quantity')?.value) || 0;
    const salePrice = parseFloat(document.getElementById('salePrice')?.value) || 0;
    const taxPercent = parseFloat(document.getElementById('taxPercent')?.value) || 0;

    if (!itemId || quantity <= 0) {
        showError('Please select an item and enter quantity');
        return;
    }

    const selectedItem = availableItems.find(item => item._id === itemId);
    if (!selectedItem) {
        showError('Item not found');
        return;
    }

    const subtotal = quantity * salePrice;
    const taxAmount = (subtotal * taxPercent) / 100;
    const total = subtotal + taxAmount;

    const item = {
        id: itemId,
        code: itemCode,
        name: selectedItem.name,
        quantity: quantity,
        salePrice: salePrice,
        subtotal: subtotal,
        taxPercent: taxPercent,
        taxAmount: taxAmount,
        total: total
    };

    saleItems.push(item);
    updateItemsTable();
    clearItemFields();
    calculateTotals();
}

// Update items table
function updateItemsTable() {
    const tbody = document.getElementById('returnItemsBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    saleItems.forEach((item, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.code}</td>
            <td>${item.name}</td>
            <td class="text-right">${item.quantity}</td>
            <td class="text-right">${item.salePrice.toFixed(2)}</td>
            <td class="text-right">${item.subtotal.toFixed(2)}</td>
            <td class="text-right">${item.taxPercent.toFixed(2)}</td>
            <td class="text-right">${item.taxAmount.toFixed(2)}</td>
            <td class="text-right">${item.total.toFixed(2)}</td>
            <td class="text-center">
                <button class="icon-btn danger" onclick="removeItem(${index})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    });

    // Update footer totals
    const totalSub = saleItems.reduce((sum, item) => sum + item.subtotal, 0);
    const totalTaxRs = saleItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const totalAmount = saleItems.reduce((sum, item) => sum + item.total, 0);

    const footerSubEl = document.getElementById('footerSub');
    const footerTaxRsEl = document.getElementById('footerTaxRs');
    const footerTotalEl = document.getElementById('footerTotal');

    if (footerSubEl) footerSubEl.textContent = totalSub.toFixed(2);
    if (footerTaxRsEl) footerTaxRsEl.textContent = totalTaxRs.toFixed(2);
    if (footerTotalEl) footerTotalEl.textContent = totalAmount.toFixed(2);
}

// Remove item from sale
function removeItem(index) {
    saleItems.splice(index, 1);
    updateItemsTable();
    calculateTotals();
}

// Clear item fields
function clearItemFields() {
    const itemSelectEl = document.getElementById('itemSelect');
    const itemNameInput = document.getElementById('itemName');
    const itemCodeEl = document.getElementById('itemCode');
    const quantityEl = document.getElementById('quantity');
    const salePriceEl = document.getElementById('salePrice');
    const stockEl = document.getElementById('stock');
    const taxPercentEl = document.getElementById('taxPercent');
    const taxRsEl = document.getElementById('taxRs');
    const itemTotalEl = document.getElementById('itemTotal');
    const suggestionsBox = document.getElementById('itemSuggestions');

    if (itemSelectEl) itemSelectEl.value = '';
    if (itemNameInput) itemNameInput.value = '';
    if (itemCodeEl) itemCodeEl.value = '';
    if (quantityEl) quantityEl.value = 1;
    if (salePriceEl) salePriceEl.value = '';
    if (stockEl) stockEl.value = '';
    if (taxPercentEl) taxPercentEl.value = 0;
    if (taxRsEl) taxRsEl.value = '';
    if (itemTotalEl) itemTotalEl.value = '';

    // Clear suggestions box
    if (suggestionsBox) {
        suggestionsBox.style.display = 'none';
        suggestionsBox.innerHTML = '';
    }
}

// Calculate totals
function calculateTotals() {
    const itemsTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
    const itemsSubtotal = saleItems.reduce((sum, item) => sum + item.subtotal, 0);
    const itemsTax = saleItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const refunded = parseFloat(document.getElementById('refunded')?.value) || 0;
    const preBalance = parseFloat(document.getElementById('preBalance')?.value) || 0;

    // Calculate balances
    const balance = itemsTotal - refunded;
    const newBalance = preBalance - itemsTotal + refunded;

    // Update fields
    const subTotalEl = document.getElementById('subTotal');
    const totalTaxRsEl = document.getElementById('totalTaxRs');
    const grandTotalEl = document.getElementById('grandTotal');
    const balanceEl = document.getElementById('balance');
    const newBalanceEl = document.getElementById('newBalance');

    if (subTotalEl) subTotalEl.value = itemsSubtotal.toFixed(2);
    if (totalTaxRsEl) totalTaxRsEl.value = itemsTax.toFixed(2);
    if (grandTotalEl) grandTotalEl.value = itemsTotal.toFixed(2);
    if (balanceEl) balanceEl.value = balance.toFixed(2);
    if (newBalanceEl) newBalanceEl.value = newBalance.toFixed(2);
}

// Save sale
async function saveReturn(status = 'final', printAfter = false) {
    try {
        if (saleItems.length === 0) {
            showError('Please add at least one item');
            return;
        }

        const customerId = document.getElementById('customer').value;

        // Debug: Show what we captured
        console.log('🔍 DEBUG: Customer ID captured:', customerId);
        console.log('🔍 DEBUG: Customer ID length:', customerId ? customerId.length : 0);
        console.log('🔍 DEBUG: Customer ID type:', typeof customerId);

        if (!customerId) {
            showError('Please select a customer');
            return;
        }

        console.log('Customer ID:', customerId);

        showLoading();

        const token = localStorage.getItem('token');
        const saleId = document.getElementById('saleId').value;

        // Calculate totals
        const itemsTotal = saleItems.reduce((sum, item) => sum + item.netTotal, 0);
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
            invoiceNumber: document.getElementById('invoiceNo').value,
            date: document.getElementById('saleDate').value,
            party: customerId,
            items: saleItems.map(item => ({
                item: item.id,
                quantity: item.pack,
                rate: item.price,
                amount: item.netTotal,
                taxAmount: (item.netTotal * item.taxPercent) / 100 || 0
            })),
            subtotal: subTotal,
            discountAmount: discountRs,
            taxAmount: taxAmount,
            totalAmount: netTotal,
            grandTotal: grandTotal,
            paidAmount: paid,
            balanceAmount: grandTotal - paid,
            paymentStatus: paid === 0 ? 'pending' : (paid >= grandTotal ? 'paid' : 'partial'),
            notes: document.getElementById('remarks').value,
            createdBy: null, // Will be set by backend from token
            status: status
        };

        console.log('Form Data to send:', formData);

        const url = saleId ? `/api/v1/sales/${saleId}` : '/api/v1/sales';
        const method = saleId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            const savedSale = await response.json();
            clearForm();
            loadSales(currentPage, currentLimit);
            showSuccess(status === 'draft' ? 'Sale saved as draft' : 'Sale saved successfully');

            if (printAfter) {
                printSale(savedSale._id || savedSale.data._id);
            }
        } else {
            const error = await response.json();
            showError(error.message || 'Failed to save sale');
        }
    } catch (error) {
        console.error('Error saving sale:', error);
        showError('Failed to save sale');
    } finally {
        hideLoading();
    }
}

// Load sales
async function loadSales(page = 1, limit = 10) {
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

        const response = await fetch(`/api/v1/sales${queryParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            displaySales(data.data);
            updatePagination(data.pagination);
        } else {
            throw new Error('Failed to load sales');
        }
    } catch (error) {
        console.error('Error loading sales:', error);
        showError('Failed to load sales');
    } finally {
        hideLoading();
    }
}

// Display sales
function displaySales(sales) {
    const tbody = document.getElementById('salesTableBody');

    if (!sales || sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">No sales found</td></tr>';
        return;
    }

    tbody.innerHTML = sales.map(sale => `
        <tr>
            <td class="text-center">
                <button class="icon-btn" onclick="editSale('${sale._id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="icon-btn text-secondary" onclick="window.open('/print-invoice?type=sale&id=${sale._id}', '_blank')" title="Print">
                    <i class="fas fa-print"></i>
                </button>
            </td>
            <td>${sale.invoiceNumber || sale.invoiceNo}</td>
            <td>${formatDate(sale.date)}</td>
            <td>${sale.party?.name || sale.customer?.name || '-'}</td>
            <td>${sale.items?.length || 0} items</td>
            <td class="text-right">${(parseFloat(sale.totalAmount || sale.grandTotal) || 0).toFixed(2)}</td>
            <td class="text-center"><span class="badge badge-info">${sale.paymentStatus || 'pending'}</span></td>
            <td class="text-center">${getSaleStatusBadge(sale.status)}</td>
            <td class="text-center">
                <button class="icon-btn danger" onclick="deleteSaleById('${sale._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Get sale status badge
function getSaleStatusBadge(status) {
    const badges = {
        draft: '<span class="badge badge-warning">Draft</span>',
        final: '<span class="badge badge-success">Final</span>',
        cancelled: '<span class="badge badge-danger">Cancelled</span>'
    };
    return badges[status] || badges.draft;
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
        found = item;
    }

    if (itemSelect) {
        itemSelect.value = item._id;
    }

    const itemCodeEl = document.getElementById('itemCode');
    const salePriceEl = document.getElementById('salePrice');
    const stockEl = document.getElementById('stock');
    const taxPercentEl = document.getElementById('taxPercent');
    const itemNameInput = document.getElementById('itemName');

    if (itemCodeEl) itemCodeEl.value = item.barcode || item.sku || '';
    if (salePriceEl) salePriceEl.value = item.salePrice || 0;
    if (stockEl) stockEl.value = item.stockQty || 0;
    if (taxPercentEl) taxPercentEl.value = item.taxPercent || 0;
    if (itemNameInput) itemNameInput.value = item.name || '';

    calculateItemTotal();

    // Move focus to Quantity field for quick entry
    const quantityInput = document.getElementById('quantity');
    if (quantityInput) {
        quantityInput.focus();
        quantityInput.select();
    }
}

// Edit sale
async function editSale(saleId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/sales/${saleId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const responseData = await response.json();
            const sale = responseData.data || responseData;

            // Populate form
            document.getElementById('saleId').value = sale._id;
            document.getElementById('invoiceNo').value = sale.invoiceNumber || sale.invoiceNo;
            document.getElementById('saleDate').value = sale.date ? sale.date.split('T')[0] : '';

            // Handle party/customer field
            const partyId = sale.party?._id || sale.party || sale.customer?._id || sale.customer;
            document.getElementById('customer').value = partyId;

            document.getElementById('remarks').value = sale.notes || '';
            // Payment mode might be in transaction, assume cash for now if missing
            document.getElementById('paymentMode').value = sale.paymentMode || 'cash';

            document.getElementById('discountRs').value = sale.discountAmount || sale.discount || 0;
            // taxPercent might not be directly on sale anymore, inferred from items or stored?
            // Assuming it might be stored or 0.
            document.getElementById('totalTaxPercent').value = 0;

            document.getElementById('misc').value = 0; // misc/freight might not be in new model, set 0
            document.getElementById('freight').value = 0;
            document.getElementById('paid').value = sale.paidAmount || 0;

            // Load items
            saleItems = sale.items.map(item => ({
                id: item.item._id || item.item,
                code: item.item.sku || '', // SKU might need population? Backend populates items.item
                name: item.item.name || item.name || '',
                pack: item.quantity,
                price: item.rate || item.salePrice || 0,
                subtotal: (item.quantity * (item.rate || item.salePrice || 0)),
                taxPercent: 0, // Item tax percent?
                taxAmount: item.taxAmount || 0,
                // Total amount for item
                total: item.amount || item.total || 0,
                discPercent: 0,
                discAmount: 0,
                netTotal: item.amount || item.total || 0,
                incentive: 0
            }));

            updateItemsTable();
            calculateTotals();

            // Close the list modal
            hideList();

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

            showSuccess('Sale loaded for editing');
        } else {
            showError('Failed to load sale data');
        }
    } catch (error) {
        console.error('Error loading sale data:', error);
        showError('Failed to load sale data');
    } finally {
        hideLoading();
    }
}

// Delete sale by ID
async function deleteSaleById(saleId) {
    if (!confirm('Are you sure you want to delete this sale?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/sales/${saleId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            loadSales(currentPage, currentLimit);
            showSuccess('Sale deleted successfully');
        } else {
            showError('Failed to delete sale');
        }
    } catch (error) {
        console.error('Error deleting sale:', error);
        showError('Failed to delete sale');
    } finally {
        hideLoading();
    }
}

// Delete current sale
function deleteSale() {
    const saleId = document.getElementById('saleId').value;
    if (saleId) {
        deleteSaleById(saleId);
    } else {
        showError('No sale selected to delete');
    }
}

// Clear form
function clearForm() {
    document.getElementById('saleForm').reset();
    document.getElementById('saleId').value = '';
    document.getElementById('saleDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('paymentMode').value = 'cash';
    saleItems = [];
    updateItemsTable();
    clearItemFields();
    calculateTotals();
    generateInvoiceNumber();
}

// Show sales list
function showReturnsList() {
    const listModal = document.getElementById('listModal');
    const listModalOverlay = document.getElementById('listModalOverlay');

    if (listModal && listModalOverlay) {
        listModal.classList.add('active');
        listModalOverlay.classList.add('active');

        // Load sales data
        loadSales(currentPage, currentLimit);
    }
}

// Hide sales list
function hideList() {
    const listModal = document.getElementById('listModal');
    const listModalOverlay = document.getElementById('listModalOverlay');

    if (listModal && listModalOverlay) {
        listModal.classList.remove('active');
        listModalOverlay.classList.remove('active');
    }
}

// Print sale
function printSale(saleId) {
    if (!saleId) {
        saleId = document.getElementById('saleId').value;
    }
    if (saleId) {
        window.print();
    } else {
        showError('No sale to print');
    }
}

// Search invoice
function searchInvoice() {
    const invoice = prompt('Enter invoice number:');
    if (invoice) {
        document.getElementById('searchInput').value = invoice;
        loadSales();
    }
}

// Handle search
function handleSearch() {
    loadSales(1, currentLimit);
}

// Reset filters
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('statusFilter').value = '';
    loadSales(1, currentLimit);
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
        html += `<button class="btn btn-sm btn-secondary" onclick="loadSales(${pagination.prev.page}, ${currentLimit})">
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
        html += `<button class="btn btn-sm btn-secondary" onclick="loadSales(${pagination.next.page}, ${currentLimit})">
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

// Format date
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// Modal functions (placeholders)
function openCustomerModal() {
    showInfo('Customer quick add will be implemented');
}

function openItemModal() {
    showInfo('Item quick add will be implemented');
}

function showCustomerList() {
    window.location.href = '/parties';
}

function showItemList() {
    window.location.href = '/items';
}

