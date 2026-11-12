// Purchase Returns Management JavaScript - Desktop Design
let currentPage = 1;
let currentLimit = 10;
let returnItems = [];
let availableItems = [];
let suppliers = [];
let purchases = [];

document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    // Set user name
    setUserName();

    // Initialize returns page
    initReturnsPage();
});

// Set user name in header
function setUserName() {
    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.name || user.email;
    }
}

// Initialize returns page
function initReturnsPage() {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('returnDate').value = today;
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;

    // Load data
    loadSuppliers();
    loadItems();
    // Don't load returns on init - only when List button is clicked
    generateReturnNumber();

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('startDate').addEventListener('change', loadReturns);
    document.getElementById('endDate').addEventListener('change', loadReturns);
    document.getElementById('statusFilter').addEventListener('change', loadReturns);

    // Supplier change event
    document.getElementById('supplier').addEventListener('change', function () {
        const selectedSupplier = suppliers.find(s => s._id === this.value);
        if (selectedSupplier) {
            document.getElementById('preBalance').value = selectedSupplier.currentBalance || 0;
            loadSupplierPurchases(this.value);
            calculateTotals();
        }
    });

    // Purchase Invoice change event
    document.getElementById('purchaseInvoice').addEventListener('change', function () {
        loadPurchaseDetails(this.value);
    });

    // Item selection event
    document.getElementById('itemSelect').addEventListener('change', function () {
        const selectedItem = availableItems.find(item => item._id === this.value);
        if (selectedItem) {
            document.getElementById('itemCode').value = selectedItem.sku || '';
            document.getElementById('costPrice').value = selectedItem.purchasePrice || 0;
            document.getElementById('stock').value = selectedItem.stockQty || 0;
            document.getElementById('taxPercent').value = selectedItem.taxPercent || 0;
            calculateItemTotal();
        }
    });

    // Calculation events
    document.getElementById('quantity').addEventListener('input', calculateItemTotal);
    document.getElementById('costPrice').addEventListener('input', calculateItemTotal);
    document.getElementById('taxPercent').addEventListener('input', calculateItemTotal);
    document.getElementById('paid').addEventListener('input', calculateTotals);

    // Prevent page jumping when using Tab to navigate inputs inside the item entry section.
    let tabScrollPos = null;
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') {
            tabScrollPos = { x: window.scrollX, y: window.scrollY };
        }
    });

    document.addEventListener('focusin', function (e) {
        if (!tabScrollPos) return;
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

    // Item name autocomplete
    const itemNameInput = document.getElementById('itemName');
    const suggestionsBox = document.getElementById('itemSuggestions');
    let allItemsForDropdown = [];

    window.escapeHtml = function (text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    };

    if (itemNameInput) {
        itemNameInput.addEventListener('focus', async function (e) {
            if (allItemsForDropdown.length > 0) {
                showAllSuggestions();
                return;
            }
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

        itemNameInput.addEventListener('input', function (e) {
            const q = this.value.trim();
            if (!q) {
                showAllSuggestions();
                return;
            }
            const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(esc, 'i');
            const filtered = allItemsForDropdown.filter(it => {
                return regex.test(it.name || '') || regex.test(it.sku || '') || regex.test(it.barcode || '');
            });

            if (filtered.length === 0) {
                suggestionsBox.style.display = 'none';
                suggestionsBox.innerHTML = '';
                return;
            }

            suggestionsBox.innerHTML = filtered.map(it => `
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-cost="${it.purchasePrice || 0}" data-tax="${it.taxPercent || 0}">
                    <strong>${window.escapeHtml(it.name)}</strong> <span style="color:#666">(${window.escapeHtml(it.sku || '')})</span>
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
        });

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
            const cost = el.getAttribute('data-cost');
            const tax = el.getAttribute('data-tax');

            const itemSelect = document.getElementById('itemSelect');
            if (itemSelect) itemSelect.value = id;
            itemNameInput.value = name || '';
            document.getElementById('itemCode').value = sku || '';
            document.getElementById('costPrice').value = cost || 0;
            document.getElementById('stock').value = stock || 0;
            document.getElementById('taxPercent').value = tax || 0;
            calculateItemTotal();

            suggestionsBox.style.display = 'none';
            suggestionsBox.innerHTML = '';
            activeSuggestionIndex = -1;

            // Move focus to Quantity field for quick entry
            const quantityInput = document.getElementById('quantity');
            if (quantityInput) {
                quantityInput.focus();
                quantityInput.select();
            }
        }

        function showAllSuggestions() {
            if (allItemsForDropdown.length === 0) {
                suggestionsBox.style.display = 'none';
                return;
            }
            suggestionsBox.innerHTML = allItemsForDropdown.map(it => `
                <div tabindex="0" class="suggestion-item" data-id="${it._id}" data-name="${window.escapeHtml(it.name)}" data-sku="${it.sku || ''}" data-stock="${it.stockQty || 0}" data-cost="${it.purchasePrice || 0}" data-tax="${it.taxPercent || 0}">
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

        suggestionsBox.addEventListener('click', function (ev) {
            const el = ev.target.closest('.suggestion-item');
            if (!el) return;
            ev.preventDefault();
            selectItemFromSuggestion(el);
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

        // Hide suggestions on blur
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

    // Barcode scanning
    const itemCodeInput = document.getElementById('itemCode');
    let lastLookedUpCode = '';

    if (itemCodeInput) {
        itemCodeInput.addEventListener('keydown', async function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const code = this.value.trim();
                if (!code) return;
                await handleBarcodeLookup(code);
                lastLookedUpCode = code;
            }
        });

        itemCodeInput.addEventListener('blur', async function () {
            const code = this.value.trim();
            if (!code) return;
            if (code === lastLookedUpCode) return;
            await handleBarcodeLookup(code);
            lastLookedUpCode = code;
        });
    }

    document.getElementById('taxPercent').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addItemToReturn();
            setTimeout(() => {
                const itemNameInput = document.getElementById('itemName');
                if (itemNameInput) itemNameInput.focus();
            }, 100);
        }
    });

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

    // Load supplier purchases
    async function loadSupplierPurchases(supplierId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/v1/purchases?supplier=${supplierId}&limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                purchases = data.data || [];
                const purchaseSelect = document.getElementById('purchaseInvoice');
                purchaseSelect.innerHTML = '<option value="">-- Select Invoice --</option>';

                purchases.forEach(purchase => {
                    purchaseSelect.innerHTML += `<option value="${purchase._id}">${purchase.invoiceNo} - ${formatDate(purchase.date)}</option>`;
                });
            }
        } catch (error) {
            console.error('Error loading purchases:', error);
        }
    }

    // Load purchase details and populate return items
    async function loadPurchaseDetails(purchaseId) {
        try {
            if (!purchaseId) return;

            showLoading();
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/v1/purchases/${purchaseId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const purchase = data.data;

                if (purchase && purchase.items) {
                    returnItems = [];

                    purchase.items.forEach(item => {
                        const quantity = item.quantity;
                        const costPrice = item.costPrice;
                        const subtotal = quantity * costPrice;
                        const taxPercent = item.taxPercent || 0;
                        const taxAmount = (subtotal * taxPercent) / 100;
                        const total = subtotal + taxAmount;

                        returnItems.push({
                            id: item.item._id || item.item,
                            code: item.item.sku || '', // If populated
                            name: item.name,
                            quantity: quantity,
                            costPrice: costPrice,
                            subtotal: subtotal,
                            taxPercent: taxPercent,
                            taxAmount: taxAmount,
                            total: total
                        });
                    });

                    updateItemsTable();
                    calculateTotals();
                    showSuccess('Items loaded from purchase invoice');
                }
            } else {
                showError('Failed to load purchase details');
            }
        } catch (error) {
            console.error('Error loading purchase details:', error);
            showError('Error loading purchase details');
        } finally {
            hideLoading();
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

    // Generate return number
    async function generateReturnNumber() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/v1/purchase-returns?limit=1&sort=-createdAt', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const lastReturn = data.data[0];
                let newReturnNo = 'PRET-001';

                // Check for returnInvoiceNo (backend) or returnNo (legacy/frontend)
                const lastNo = lastReturn ? (lastReturn.returnInvoiceNo || lastReturn.returnNo) : null;

                if (lastNo) {
                    // Extract number part: PRET-001 -> 1
                    const parts = lastNo.split('-');
                    if (parts.length > 1) {
                        const lastNumber = parseInt(parts[1]) || 0;
                        newReturnNo = `PRET-${String(lastNumber + 1).padStart(3, '0')}`;
                    }
                }

                document.getElementById('returnNo').value = newReturnNo;
            }
        } catch (error) {
            console.error('Error generating return number:', error);
            document.getElementById('returnNo').value = 'PRET-001';
        }
    }

    // Calculate item total
    function calculateItemTotal() {
        const quantity = parseFloat(document.getElementById('quantity').value) || 0;
        const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
        const taxPercent = parseFloat(document.getElementById('taxPercent').value) || 0;

        const subtotal = quantity * costPrice;
        const taxAmount = (subtotal * taxPercent) / 100;
        const total = subtotal + taxAmount;

        document.getElementById('taxRs').value = taxAmount.toFixed(2);
        document.getElementById('itemTotal').value = total.toFixed(2);
    }

    // Add item to return
    function addItemToReturn() {
        const itemId = document.getElementById('itemSelect').value;
        const itemCode = document.getElementById('itemCode').value;
        const quantity = parseFloat(document.getElementById('quantity').value) || 0;
        const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
        const taxPercent = parseFloat(document.getElementById('taxPercent').value) || 0;

        if (!itemId || quantity <= 0) {
            showError('Please select an item and enter quantity');
            return;
        }

        const selectedItem = availableItems.find(item => item._id === itemId);
        if (!selectedItem) {
            showError('Item not found');
            return;
        }

        const subtotal = quantity * costPrice;
        const taxAmount = (subtotal * taxPercent) / 100;
        const total = subtotal + taxAmount;

        const item = {
            id: itemId,
            code: itemCode,
            name: selectedItem.name,
            quantity: quantity,
            costPrice: costPrice,
            subtotal: subtotal,
            taxPercent: taxPercent,
            taxAmount: taxAmount,
            total: total
        };

        returnItems.push(item);
        updateItemsTable();
        clearItemFields();
        calculateTotals();
    }

    // Update items table
    function updateItemsTable() {
        const tbody = document.getElementById('returnItemsBody');
        tbody.innerHTML = '';

        returnItems.forEach((item, index) => {
            const row = tbody.insertRow();
            row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.code}</td>
            <td>${item.name}</td>
            <td class="text-right">${item.quantity}</td>
            <td class="text-right">${item.costPrice.toFixed(2)}</td>
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
        const totalSub = returnItems.reduce((sum, item) => sum + item.subtotal, 0);
        const totalTaxRs = returnItems.reduce((sum, item) => sum + item.taxAmount, 0);
        const totalAmount = returnItems.reduce((sum, item) => sum + item.total, 0);

        document.getElementById('footerSub').textContent = totalSub.toFixed(2);
        document.getElementById('footerTaxRs').textContent = totalTaxRs.toFixed(2);
        document.getElementById('footerTotal').textContent = totalAmount.toFixed(2);
    }

    // Remove item from return
    function removeItem(index) {
        returnItems.splice(index, 1);
        updateItemsTable();
        calculateTotals();
    }

    // Clear item fields
    function clearItemFields() {
        document.getElementById('itemSelect').value = '';
        const itemNameInput = document.getElementById('itemName');
        if (itemNameInput) itemNameInput.value = '';
        document.getElementById('itemCode').value = '';
        document.getElementById('quantity').value = 1;
        document.getElementById('costPrice').value = '';
        document.getElementById('stock').value = '';
        document.getElementById('taxPercent').value = 0;
        document.getElementById('taxRs').value = '';
        document.getElementById('itemTotal').value = '';

        // Clear suggestions box
        const suggestionsBox = document.getElementById('itemSuggestions');
        if (suggestionsBox) {
            suggestionsBox.style.display = 'none';
            suggestionsBox.innerHTML = '';
        }
    }

    // Calculate totals
    function calculateTotals() {
        const itemsTotal = returnItems.reduce((sum, item) => sum + item.total, 0);
        const itemsTax = returnItems.reduce((sum, item) => sum + item.taxAmount, 0);
        const itemsSubtotal = returnItems.reduce((sum, item) => sum + item.subtotal, 0);
        const paid = parseFloat(document.getElementById('paid').value) || 0;
        const preBalance = parseFloat(document.getElementById('preBalance').value) || 0;

        // Calculate balances (returns reduce supplier balance)
        const balance = itemsTotal - paid;
        const newBalance = preBalance - itemsTotal + paid;

        // Update fields
        document.getElementById('subTotal').value = itemsSubtotal.toFixed(2);
        document.getElementById('totalTaxRs').value = itemsTax.toFixed(2);
        document.getElementById('grandTotal').value = itemsTotal.toFixed(2);
        document.getElementById('balance').value = balance.toFixed(2);
        document.getElementById('newBalance').value = newBalance.toFixed(2);
    }

    // Save return
    async function saveReturn(status = 'completed') {
        try {
            if (returnItems.length === 0) {
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
            const returnId = document.getElementById('returnId').value;

            // Calculate totals
            const itemsTotal = returnItems.reduce((sum, item) => sum + item.total, 0);
            const itemsTax = returnItems.reduce((sum, item) => sum + item.taxAmount, 0);
            const itemsSubtotal = returnItems.reduce((sum, item) => sum + item.subtotal, 0);
            const paid = parseFloat(document.getElementById('paid').value) || 0;

            const formData = {
                returnNo: document.getElementById('returnNo').value,
                date: document.getElementById('returnDate').value,
                supplier: supplierId,
                purchaseInvoice: document.getElementById('purchaseInvoice').value || null,
                items: returnItems.map(item => ({
                    item: item.id,
                    name: item.name,
                    quantity: item.quantity,
                    unit: 'pcs',
                    purchasePrice: item.costPrice,
                    costPrice: item.costPrice,
                    taxPercent: item.taxPercent,
                    total: item.total
                })),
                subTotal: itemsSubtotal,
                taxAmount: itemsTax,
                grandTotal: itemsTotal,
                netTotal: itemsTotal,
                paidAmount: paid,
                paymentMode: document.getElementById('paymentMode').value,
                notes: document.getElementById('remarks').value,
                status: status
            };

            const url = returnId ? `/api/v1/purchase-returns/${returnId}` : '/api/v1/purchase-returns';
            const method = returnId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                clearForm();
                loadReturns(currentPage, currentLimit);
                showSuccess('Purchase return saved successfully');
            } else {
                const error = await response.json();
                showError(error.message || 'Failed to save purchase return');
            }
        } catch (error) {
            console.error('Error saving return:', error);
            showError('Failed to save purchase return');
        } finally {
            hideLoading();
        }
    }

    // Load returns
    async function loadReturns(page = 1, limit = 10) {
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

            const response = await fetch(`/api/v1/purchase-returns${queryParams}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                displayReturns(data.data);
                updatePagination(data.pagination);
            } else {
                throw new Error('Failed to load returns');
            }
        } catch (error) {
            console.error('Error loading returns:', error);
            showError('Failed to load purchase returns');
        } finally {
            hideLoading();
        }
    }

    // Display returns
    function displayReturns(returns) {
        const tbody = document.getElementById('returnsTableBody');

        if (!returns || returns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center">No purchase returns found</td></tr>';
            return;
        }

        tbody.innerHTML = returns.map(returnItem => `
        <tr>
            <td class="text-center">
                <button class="icon-btn" onclick="editReturn('${returnItem._id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="icon-btn text-secondary" onclick="window.open('/print-invoice?type=purchase-return&id=${returnItem._id}', '_blank')" title="Print">
                    <i class="fas fa-print"></i>
                </button>
            </td>
            <td>${returnItem.returnInvoiceNo || returnItem.returnNo}</td>
            <td>${formatDate(returnItem.date)}</td>
            <td>${returnItem.supplier?.name || returnItem.supplierId?.name || '-'}</td>
            <td>${returnItem.purchaseInvoice?.invoiceNo || returnItem.purchaseId?.invoiceNo || '-'}</td>
            <td>${returnItem.items?.length || 0} items</td>
            <td class="text-right">${(returnItem.totalReturnAmount || returnItem.grandTotal || 0).toFixed(2)}</td>
            <td class="text-center"><span class="badge badge-info">${returnItem.returnMode || returnItem.paymentMode || 'Cash'}</span></td>
            <td class="text-center">${getReturnStatusBadge(returnItem.status)}</td>
            <td class="text-center">
                <button class="icon-btn danger" onclick="deleteReturnById('${returnItem._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
    }

    // Get return status badge
    function getReturnStatusBadge(status) {
        const badges = {
            draft: '<span class="badge badge-warning">Draft</span>',
            completed: '<span class="badge badge-success">Completed</span>',
            cancelled: '<span class="badge badge-danger">Cancelled</span>'
        };
        return badges[status] || badges.draft;
    }

    // Edit return
    async function editReturn(returnId) {
        try {
            showLoading();

            const token = localStorage.getItem('token');
            const response = await fetch(`/api/v1/purchase-returns/${returnId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const responseData = await response.json();
                const returnData = responseData.data || responseData;

                // Populate form
                document.getElementById('returnId').value = returnData._id;
                document.getElementById('returnNo').value = returnData.returnNo || returnData.returnInvoiceNo;
                document.getElementById('returnDate').value = returnData.date ? returnData.date.split('T')[0] : '';

                // Handle supplier/supplierId populate mismatch
                const sId = returnData.supplier?._id || returnData.supplier || returnData.supplierId?._id || returnData.supplierId;
                document.getElementById('supplier').value = sId;

                // Handle purchaseInvoice/purchaseId populate mismatch
                const pId = returnData.purchaseInvoice?._id || returnData.purchaseInvoice || returnData.purchaseId?._id || returnData.purchaseId;
                document.getElementById('purchaseInvoice').value = pId || '';
                document.getElementById('remarks').value = returnData.notes || '';
                document.getElementById('paymentMode').value = returnData.paymentMode || 'cash';
                document.getElementById('paid').value = returnData.paidAmount || 0;

                // Load items
                // Load items
                returnItems = returnData.items.map(item => {
                    // Handle different field names from backend vs frontend structure
                    const itemObj = item.itemId || item.item;
                    const qty = item.returnQty || item.quantity || 0;
                    const cost = item.cost || item.purchasePrice || item.costPrice || 0;
                    const tax = item.taxPercent || 0;
                    const total = item.returnAmount || item.total || 0;

                    // Calculate derived values if needed
                    const subtotal = qty * cost;
                    const taxAmt = (subtotal * tax) / 100;

                    return {
                        id: itemObj?._id || itemObj,
                        code: itemObj?.sku || '',
                        name: itemObj?.name || item.name || '',
                        quantity: qty,
                        costPrice: cost,
                        subtotal: subtotal,
                        taxPercent: tax,
                        taxAmount: taxAmt,
                        total: total || (subtotal + taxAmt)
                    };
                });

                updateItemsTable();
                calculateTotals();

                // Close the list modal
                hideList();

                // Scroll to top
                window.scrollTo({ top: 0, behavior: 'smooth' });

                showSuccess('Return loaded for editing');
            } else {
                showError('Failed to load return data');
            }
        } catch (error) {
            console.error('Error loading return data:', error);
            showError('Failed to load return data');
        } finally {
            hideLoading();
        }
    }

    // Delete return by ID
    async function deleteReturnById(returnId) {
        if (!confirm('Are you sure you want to delete this purchase return?')) {
            return;
        }

        try {
            showLoading();

            const token = localStorage.getItem('token');
            const response = await fetch(`/api/v1/purchase-returns/${returnId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                loadReturns(currentPage, currentLimit);
                showSuccess('Purchase return deleted successfully');
            } else {
                showError('Failed to delete purchase return');
            }
        } catch (error) {
            console.error('Error deleting return:', error);
            showError('Failed to delete purchase return');
        } finally {
            hideLoading();
        }
    }

    // Clear form
    function clearForm() {
        document.getElementById('returnForm').reset();
        document.getElementById('returnId').value = '';
        document.getElementById('returnDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('paymentMode').value = 'cash';
        returnItems = [];
        updateItemsTable();
        clearItemFields();
        calculateTotals();
        generateReturnNumber();
    }

    // Show returns list
    function showReturnsList() {
        const listModal = document.getElementById('listModal');
        const listModalOverlay = document.getElementById('listModalOverlay');

        if (listModal && listModalOverlay) {
            listModal.classList.add('active');
            listModalOverlay.classList.add('active');

            // Load returns data
            loadReturns(currentPage, currentLimit);
        }
    }

    // Hide returns list
    function hideList() {
        const listModal = document.getElementById('listModal');
        const listModalOverlay = document.getElementById('listModalOverlay');

        if (listModal && listModalOverlay) {
            listModal.classList.remove('active');
            listModalOverlay.classList.remove('active');
        }
    }

    // Handle search
    function handleSearch() {
        loadReturns(1, currentLimit);
    }

    // Reset filters
    function resetFilters() {
        document.getElementById('searchInput').value = '';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('startDate').value = today;
        document.getElementById('endDate').value = today;
        document.getElementById('statusFilter').value = '';
        loadReturns(1, currentLimit);
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
            html += `<button class="btn btn-sm btn-secondary" onclick="loadReturns(${pagination.prev.page}, ${currentLimit})">
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
            html += `<button class="btn btn-sm btn-secondary" onclick="loadReturns(${pagination.next.page}, ${currentLimit})">
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

    // Helper functions
    function showSupplierList() {
        window.location.href = '/parties';
    }

    function showItemList() {
        window.location.href = '/items';
    }

    // Handle barcode lookup
    async function handleBarcodeLookup(code) {
        try {
            const token = localStorage.getItem('token');
            const resp = await fetch(`/api/v1/items/barcode/${encodeURIComponent(code)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) {
                const resp2 = await fetch(`/api/v1/items/barcode?code=${encodeURIComponent(code)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!resp2.ok) { showError(`Item not found for code: ${code}`); return; }
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

    // Populate item from lookup
    function populateItemFromLookup(item) {
        if (!item) return;

        const itemSelect = document.getElementById('itemSelect');
        if (itemSelect) itemSelect.value = item._id;

        const itemNameInput = document.getElementById('itemName');
        if (itemNameInput) itemNameInput.value = item.name;

        document.getElementById('itemCode').value = item.sku || item.barcode || '';
        document.getElementById('costPrice').value = item.purchasePrice || 0;
        document.getElementById('stock').value = item.stockQty || 0;
        document.getElementById('taxPercent').value = item.taxPercent || 0;

        calculateItemTotal();

        // Focus on quantity or next field
        setTimeout(() => document.getElementById('quantity').focus(), 100);
    }
}

