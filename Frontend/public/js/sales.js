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

// Initialize sales page
function initSalesPage() {
    // Set date range (First day of month to Today)
    const todayDate = new Date();
    const firstDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);

    // Format to YYYY-MM-DD
    const formatDateInput = (date) => date.toISOString().split('T')[0];

    document.getElementById('saleDate').value = formatDateInput(todayDate);
    document.getElementById('startDate').value = formatDateInput(firstDay);
    document.getElementById('endDate').value = formatDateInput(todayDate);

    // Load data
    loadCustomers();
    loadItems();
    loadCategories();
    // Don't load sales on init - only when List button is clicked
    generateInvoiceNumber();

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('startDate').addEventListener('change', loadSales);
    document.getElementById('endDate').addEventListener('change', loadSales);
    document.getElementById('statusFilter').addEventListener('change', loadSales);

    // Customer change event
    document.getElementById('customer').addEventListener('change', function () {
        const selectedCustomer = customers.find(c => c._id === this.value);
        if (selectedCustomer) {
            const contactEl = document.getElementById('customerContact');
            const preBalanceEl = document.getElementById('preBalance');
            if (contactEl) contactEl.value = selectedCustomer.phone || selectedCustomer.mobile || '';
            if (preBalanceEl) preBalanceEl.value = selectedCustomer.currentBalance || 0;
            calculateTotals();
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
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-sale="${it.salePrice || 0}">
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
            const sale = el.getAttribute('data-sale');

            const safeSetVal = (elId, val) => {
                const elem = document.getElementById(elId);
                if (elem) elem.value = val;
            };

            // Set values
            safeSetVal('itemSelect', id);
            itemNameInput.value = name || '';
            safeSetVal('itemCode', sku || '');
            safeSetVal('salePrice', sale || 0);
            safeSetVal('stock', stock || 0);
            safeSetVal('taxPercent', 0);
            calculateItemTotal();

            // Focus on pack/quantity field
            const packInput = document.getElementById('pack');
            if (packInput) {
                packInput.focus();
                packInput.select();
            }

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
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-sale="${it.salePrice || 0}">
                    <strong>${window.escapeHtml(it.name)}</strong> <span style="color:#666">(${window.escapeHtml(it.sku || '')})</span>
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
            activeSuggestionIndex = -1;
        }

        // Selection via mousedown (fires before input blur)
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

    // Calculation events - use safe event binding
    const safeAddListener = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
    };
    safeAddListener('pack', 'input', calculateItemTotal);
    safeAddListener('quantity', 'input', calculateItemTotal);
    safeAddListener('salePrice', 'input', calculateItemTotal);
    safeAddListener('taxPercent', 'input', calculateItemTotal);
    safeAddListener('discountPercent', 'input', calculateTotals);
    safeAddListener('discountRs', 'input', calculateTotals);
    safeAddListener('totalTaxPercent', 'input', calculateTotals);
    safeAddListener('misc', 'input', calculateTotals);
    safeAddListener('freight', 'input', calculateTotals);
    safeAddListener('paid', 'input', calculateTotals);

    // Setup item entry navigation
    setupItemEntryNavigation();
}

// Setup navigation for item entry fields
function setupItemEntryNavigation() {
    const fields = [
        { id: 'quantity', action: 'add' }, // Enter adds item
        { id: 'taxPercent', next: 'salePrice' },
        { id: 'salePrice', action: 'add' } // Enter adds item
    ];

    fields.forEach(field => {
        const el = document.getElementById(field.id);
        if (el) {
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (field.action === 'add') {
                        addItemToSale();
                    } else if (field.next) {
                        const nextEl = document.getElementById(field.next);
                        if (nextEl) {
                            nextEl.focus();
                            if (nextEl.select) nextEl.select();
                        }
                    }
                }
            });
        }
    });
}

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

// Load categories from items
async function loadCategories() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/categories', {
            headers: { 'Authorization': `Bearer ${token}` }
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

// Generate invoice number
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
    const pack = parseFloat(document.getElementById('pack')?.value) || 1;
    const qty = parseFloat(document.getElementById('quantity')?.value) || 1;
    const price = parseFloat(document.getElementById('salePrice')?.value) || 0;
    const taxPercent = parseFloat(document.getElementById('taxPercent')?.value) || 0;

    const totalUnits = pack * qty;
    const subtotal = totalUnits * price;
    const taxAmount = (subtotal * taxPercent) / 100;
    const total = subtotal + taxAmount;

    const itemTotalEl = document.getElementById('itemTotal');
    const taxRsEl = document.getElementById('taxRs');
    if (itemTotalEl) itemTotalEl.value = total.toFixed(2);
    if (taxRsEl) taxRsEl.value = taxAmount.toFixed(2);
}

// Add item to sale
function addItemToSale() {
    const itemId = document.getElementById('itemSelect')?.value;
    const itemCode = document.getElementById('itemCode')?.value || '';
    const pack = parseFloat(document.getElementById('pack')?.value) || 1;
    const qty = parseFloat(document.getElementById('quantity')?.value) || 1;
    const price = parseFloat(document.getElementById('salePrice')?.value) || 0;
    const taxPercent = parseFloat(document.getElementById('taxPercent')?.value) || 0;

    if (!itemId || (pack * qty) <= 0) {
        showError('Please select an item and enter quantity');
        return;
    }

    const selectedItem = availableItems.find(item => item._id === itemId);
    if (!selectedItem) {
        showError('Item not found');
        return;
    }

    const totalUnits = pack * qty;
    const subtotal = totalUnits * price;
    const taxAmount = (subtotal * taxPercent) / 100;
    const total = subtotal + taxAmount;

    const item = {
        id: itemId,
        code: itemCode,
        name: selectedItem.name,
        pack: pack,
        qty: qty,
        price: price,
        subtotal: subtotal,
        taxPercent: taxPercent,
        taxAmount: taxAmount,
        total: total,
        netTotal: total
    };

    saleItems.push(item);
    updateItemsTable();
    clearItemFields();
    calculateTotals();

    // Focus back to item search for next entry
    const itemNameInput = document.getElementById('itemName');
    if (itemNameInput) {
        itemNameInput.focus();
    }
}

// Update items table
function updateItemsTable() {
    const tbody = document.getElementById('saleItemsBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    saleItems.forEach((item, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.code}</td>
            <td>${item.name}</td>
            <td class="text-right">${item.pack}</td>
            <td class="text-right">${item.price.toFixed(2)}</td>
            <td class="text-right">${item.qty}</td>
            <td class="text-right">${item.total.toFixed(2)}</td>
            <td class="text-center">
                <button class="icon-btn danger" onclick="removeItem(${index})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    });

    // Update footer total
    const totalAmount = saleItems.reduce((sum, item) => sum + item.total, 0);
    const footerTotal = document.getElementById('footerTotal');
    if (footerTotal) footerTotal.textContent = totalAmount.toFixed(2);
}

// Remove item from sale
function removeItem(index) {
    saleItems.splice(index, 1);
    updateItemsTable();
    calculateTotals();
}

// Clear item fields
function clearItemFields() {
    const safeSetValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    safeSetValue('itemSelect', '');
    safeSetValue('itemName', '');
    safeSetValue('itemCode', '');
    safeSetValue('pack', '1');
    safeSetValue('quantity', '1');
    safeSetValue('salePrice', '');
    safeSetValue('retailPrice', '');
    safeSetValue('stock', '');
    safeSetValue('taxPercent', '0');
    safeSetValue('taxRs', '');
    safeSetValue('itemTotal', '');
}

// Calculate totals
function calculateTotals() {
    const getVal = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    const itemsTotal = saleItems.reduce((sum, item) => sum + (item.netTotal || item.total || 0), 0);
    const discountPercent = getVal('discountPercent');
    const discountRs = getVal('discountRs');
    const totalTaxPercent = getVal('totalTaxPercent');
    const misc = getVal('misc');
    const freight = getVal('freight');
    const paid = getVal('paid');

    // Calculate discount
    let totalDiscount = discountRs;
    if (discountPercent > 0) {
        totalDiscount = (itemsTotal * discountPercent) / 100;
        setVal('discountRs', totalDiscount.toFixed(2));
    }

    // Calculate after discount
    const afterDiscount = itemsTotal - totalDiscount;

    // Calculate tax
    const taxAmount = (afterDiscount * totalTaxPercent) / 100;

    // Calculate net total
    const netTotal = afterDiscount + taxAmount + misc + freight;

    // Calculate balance
    const balance = netTotal - paid;

    // Update fields
    setVal('totalAmount', itemsTotal.toFixed(2));
    setVal('totalTaxRs', taxAmount.toFixed(2));
    setVal('netTotal', netTotal.toFixed(2));
    setVal('balance', balance.toFixed(2));
}

// Save sale
async function saveSale(status = 'final', printAfter = false) {
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
function showSalesList() {
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
    const itemNameInput = document.getElementById('itemName');
    if (itemNameInput) {
        itemNameInput.focus();
    }
}

// Autocomplete functionality
document.addEventListener('DOMContentLoaded', function () {
    const itemNameInput = document.getElementById('itemName');
    const suggestionsBox = document.getElementById('itemSuggestions');

    // Helper to escape HTML
    window.escapeHtml = function (text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text ? text.replace(/[&<>"']/g, m => map[m]) : '';
    };

    if (itemNameInput && suggestionsBox) {
        // Show all items on focus (instant dropdown)
        itemNameInput.addEventListener('focus', async function (e) {
            if (availableItems.length > 0) {
                showAllSuggestions();
                return;
            }
            await loadItems();
            showAllSuggestions();
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

            const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(esc, 'i');
            const filtered = availableItems.filter(it => {
                const matchesCategory = !selectedCategory || it.category === selectedCategory;
                const matchesSearch = regex.test(it.name || '') || regex.test(it.sku || '') || regex.test(it.barcode || '');
                return matchesCategory && matchesSearch;
            });

            if (filtered.length === 0) {
                suggestionsBox.style.display = 'none';
                suggestionsBox.innerHTML = '';
                return;
            }

            suggestionsBox.innerHTML = filtered.map(it => `
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-sale="${it.salePrice || 0}" data-tax="${it.taxPercent || 0}">
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

        function selectItemFromSuggestion(el) {
            const id = el.getAttribute('data-id');
            const name = el.getAttribute('data-name');
            const sku = el.getAttribute('data-sku');
            const stock = el.getAttribute('data-stock');
            const sale = el.getAttribute('data-sale');
            const tax = el.getAttribute('data-tax');

            const safeSetVal = (elId, val) => {
                const elem = document.getElementById(elId);
                if (elem) elem.value = val;
            };

            safeSetVal('itemSelect', id);
            itemNameInput.value = name || '';
            safeSetVal('itemCode', sku || '');
            safeSetVal('salePrice', sale || 0);
            safeSetVal('stock', stock || 0);
            safeSetVal('taxPercent', tax || 0);
            calculateItemTotal();

            suggestionsBox.style.display = 'none';
            suggestionsBox.innerHTML = '';
            activeSuggestionIndex = -1;

            // Move focus to Pack (Quantity) field
            const packInput = document.getElementById('pack');
            if (packInput) {
                packInput.focus();
                packInput.select();
            }
        }

        function showAllSuggestions() {
            const categoryFilter = document.getElementById('categoryFilter');
            const selectedCategory = categoryFilter ? categoryFilter.value : '';

            let items = availableItems;
            if (selectedCategory) {
                items = items.filter(it => it.category === selectedCategory);
            }

            if (items.length === 0) {
                suggestionsBox.style.display = 'none';
                return;
            }
            suggestionsBox.innerHTML = items.map(it => `
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-sale="${it.salePrice || 0}" data-tax="${it.taxPercent || 0}">
                    <strong>${window.escapeHtml(it.name)}</strong> <span style="color:#666">(${window.escapeHtml(it.sku || '')})</span>
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
            activeSuggestionIndex = -1;
        }

        suggestionsBox.addEventListener('mousedown', function (ev) {
            const el = ev.target.closest('.suggestion-item');
            if (!el) return;
            ev.preventDefault();
            selectItemFromSuggestion(el);
        });

        suggestionsBox.addEventListener('mousemove', function (ev) {
            const el = ev.target.closest('.suggestion-item');
            if (!el) return;
            const items = suggestionsBox.querySelectorAll('.suggestion-item');
            const idx = Array.prototype.indexOf.call(items, el);
            if (idx >= 0) setActiveSuggestion(idx);
        });

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

        // Hide on blur
        let suggestionsBlurTimeout = null;
        itemNameInput.addEventListener('blur', function () {
            suggestionsBlurTimeout = setTimeout(() => {
                suggestionsBox.style.display = 'none';
            }, 200);
        });

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
        // Trigger lookup on Enter
        itemCodeInput.addEventListener('keydown', async function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const code = this.value.trim();
                if (!code) return;

                await handleBarcodeLookup(code);
                lastLookedUpCode = code;
            }
        });

        // Lookup when focus leaves
        itemCodeInput.addEventListener('blur', async function () {
            const code = this.value.trim();
            if (!code) return;
            if (code === lastLookedUpCode) return;

            await handleBarcodeLookup(code);
            lastLookedUpCode = code;
        });
    }
});

// Handle barcode lookup
async function handleBarcodeLookup(code) {
    try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`/api/v1/items/barcode/${encodeURIComponent(code)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resp.ok) {
            const data = await resp.json();
            populateItemFromLookup(data.data);
            return;
        }

        // Fallback to query
        const resp2 = await fetch(`/api/v1/items/barcode?code=${encodeURIComponent(code)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resp2.ok) {
            const data2 = await resp2.json();
            populateItemFromLookup(data2.data);
        } else {
            showError(`Item not found for code: ${code}`);
        }
    } catch (err) {
        console.error('Barcode lookup error:', err);
    }
}

function populateItemFromLookup(item) {
    if (!item) return;

    const itemSelect = document.getElementById('itemSelect');
    let found = availableItems.find(i => i._id === item._id);

    if (!found) {
        availableItems.push(item);
        found = item;
    }

    if (itemSelect) {
        itemSelect.value = item._id;
    }

    const safeSetVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    safeSetVal('itemCode', item.sku || '');
    safeSetVal('salePrice', item.salePrice || 0);
    safeSetVal('stock', item.stockQty || 0);
    safeSetVal('taxPercent', item.taxPercent || 0);

    const itemNameInput = document.getElementById('itemName');
    if (itemNameInput) itemNameInput.value = item.name || '';

    calculateItemTotal();

    // Focus pack/quantity
    const packInput = document.getElementById('pack');
    if (packInput) {
        packInput.focus();
        packInput.select();
    }
}


