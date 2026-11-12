// Stock Management JavaScript
document.addEventListener('DOMContentLoaded', function () {
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }
    initStockPage();
});

function initStockPage() {
    loadStockData();
    loadStockOverview();

    document.getElementById('addAdjustmentBtn').addEventListener('click', showAddAdjustmentModal);
    document.getElementById('closeModal').addEventListener('click', hideAdjustmentModal);
    document.getElementById('cancelBtn').addEventListener('click', hideAdjustmentModal);
    document.getElementById('adjustmentForm').addEventListener('submit', handleAdjustmentSubmit);
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('categoryFilter').addEventListener('change', loadStockData);
    document.getElementById('stockFilter').addEventListener('change', loadStockData);
    document.getElementById('selectAll').addEventListener('change', handleSelectAll);

    document.getElementById('addItemBtn').addEventListener('click', showAddItemModal);
    document.getElementById('closeItemModal').addEventListener('click', hideAddItemModal);
    document.getElementById('cancelItemBtn').addEventListener('click', hideAddItemModal);
    document.getElementById('addItemForm').addEventListener('submit', handleAddItemSubmit);
    document.getElementById('itemSelect').addEventListener('change', updateItemInfo);
    document.getElementById('adjustmentQty').addEventListener('input', updateNewStock);

    document.getElementById('adjustmentDate').valueAsDate = new Date();
}

let adjustmentItems = [];
let selectedAdjustmentId = null;

async function loadStockOverview() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/dashboard/stock-overview', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            updateStockOverview(data.data);
        }
    } catch (error) {
        console.error('Error loading stock overview:', error);
    }
}

function updateStockOverview(data) {
    document.getElementById('totalItems').textContent = data.totalItems || 0;
    document.getElementById('lowStockItems').textContent = data.lowStockItems || 0;
    document.getElementById('outOfStockItems').textContent = data.outOfStockItems || 0;
    document.getElementById('stockValue').textContent = formatCurrency(data.stockValue || 0);
}

async function loadStockData(page = 1, limit = 10) {
    try {
        showLoading();
        const token = localStorage.getItem('token');
        const search = document.getElementById('searchInput').value;
        const category = document.getElementById('categoryFilter').value;
        const stockFilter = document.getElementById('stockFilter').value;

        let queryParams = `?page=${page}&limit=${limit}`;
        if (search) queryParams += `&search=${search}`;
        if (category) queryParams += `&category=${category}`;
        if (stockFilter === 'low') queryParams += `&stockQty[lte]=10`;
        if (stockFilter === 'out') queryParams += `&stockQty=0`;
        if (stockFilter === 'normal') queryParams += `&stockQty[gt]=10`;

        const response = await fetch(`/api/v1/items${queryParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            displayStockData(data.data);
            updatePagination(data.pagination);
        } else {
            throw new Error('Failed to load stock data');
        }
    } catch (error) {
        console.error('Error loading stock data:', error);
        showError('Failed to load stock data');
    } finally {
        hideLoading();
    }
}

function displayStockData(items) {
    const tbody = document.getElementById('stockTableBody');

    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">No items found</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => {
        const stockValue = item.stockQty * item.purchasePrice;
        const stockStatus = getStockStatus(item.stockQty, item.minStock);

        return `
            <tr>
                <td><input type="checkbox" class="stock-checkbox" data-id="${item._id}"></td>
                <td>${item.sku || '-'}</td>
                <td>${item.name}</td>
                <td><span class="badge">${item.category}</span></td>
                <td><span class="stock-badge ${stockStatus}">${item.stockQty}</span></td>
                <td>${item.unit}</td>
                <td>${formatCurrency(item.purchasePrice)}</td>
                <td>${formatCurrency(item.salePrice)}</td>
                <td>${formatCurrency(stockValue)}</td>
                <td>${getStockStatusBadge(item.stockQty, item.minStock)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary" onclick="quickAdjust('${item._id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-info" onclick="viewHistory('${item._id}')">
                            <i class="fas fa-history"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getStockStatus(stockQty, minStock) {
    if (stockQty === 0) return 'out';
    if (stockQty <= (minStock || 10)) return 'low';
    return 'normal';
}

function getStockStatusBadge(stockQty, minStock) {
    const status = getStockStatus(stockQty, minStock);
    const badges = {
        normal: '<span class="badge badge-success">In Stock</span>',
        low: '<span class="badge badge-warning">Low Stock</span>',
        out: '<span class="badge badge-danger">Out of Stock</span>'
    };
    return badges[status] || badges.normal;
}

async function showAddAdjustmentModal() {
    document.getElementById('modalTitle').textContent = 'New Stock Adjustment';
    document.getElementById('adjustmentForm').reset();
    document.getElementById('adjustmentId').value = '';
    document.getElementById('adjustmentDate').valueAsDate = new Date();
    adjustmentItems = [];
    updateAdjustmentItemsTable();
    updateTotals();

    await loadItems();
    document.getElementById('adjustmentModal').style.display = 'block';
}

function hideAdjustmentModal() {
    document.getElementById('adjustmentModal').style.display = 'none';
}

async function loadItems() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/items', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const itemSelect = document.getElementById('itemSelect');
            itemSelect.innerHTML = '<option value="">Select Item</option>';

            data.data.forEach(item => {
                itemSelect.innerHTML += `<option value="${item._id}" data-stock="${item.stockQty}" data-price="${item.purchasePrice}">${item.name} (Current: ${item.stockQty})</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

function showAddItemModal() {
    document.getElementById('addItemForm').reset();
    document.getElementById('itemModal').style.display = 'block';
}

function hideAddItemModal() {
    document.getElementById('itemModal').style.display = 'none';
}

function updateItemInfo() {
    const itemSelect = document.getElementById('itemSelect');
    const selectedOption = itemSelect.options[itemSelect.selectedIndex];
    const currentStock = selectedOption.getAttribute('data-stock');
    const price = selectedOption.getAttribute('data-price');

    document.getElementById('currentStock').value = currentStock || 0;
    document.getElementById('adjustmentQty').value = '';
    document.getElementById('newStock').value = currentStock || 0;
}

function updateNewStock() {
    const currentStock = parseInt(document.getElementById('currentStock').value) || 0;
    const adjustmentQty = parseInt(document.getElementById('adjustmentQty').value) || 0;
    const adjustmentType = document.getElementById('adjustmentType').value;

    let newStock;
    if (adjustmentType === 'in' || adjustmentType === 'return') {
        newStock = currentStock + adjustmentQty;
    } else {
        newStock = Math.max(0, currentStock - adjustmentQty);
    }

    document.getElementById('newStock').value = newStock;
}

function handleAddItemSubmit(e) {
    e.preventDefault();

    const itemId = document.getElementById('itemSelect').value;
    const itemSelect = document.getElementById('itemSelect');
    const selectedOption = itemSelect.options[itemSelect.selectedIndex];

    if (!itemId) {
        showError('Please select an item');
        return;
    }

    const item = {
        item: itemId,
        name: selectedOption.text.split(' (Current:')[0],
        currentStock: parseInt(document.getElementById('currentStock').value),
        adjustmentQty: parseInt(document.getElementById('adjustmentQty').value),
        newStock: parseInt(document.getElementById('newStock').value),
        unitValue: parseFloat(selectedOption.getAttribute('data-price'))
    };

    item.totalValue = Math.abs(item.adjustmentQty) * item.unitValue;

    const existingIndex = adjustmentItems.findIndex(i => i.item === itemId);
    if (existingIndex > -1) {
        adjustmentItems[existingIndex] = item;
    } else {
        adjustmentItems.push(item);
    }

    updateAdjustmentItemsTable();
    updateTotals();
    hideAddItemModal();
}

function updateAdjustmentItemsTable() {
    const tbody = document.getElementById('adjustmentItemsBody');

    if (adjustmentItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No items added</td></tr>';
        return;
    }

    tbody.innerHTML = adjustmentItems.map((item, index) => `
        <tr>
            <td>${item.name}</td>
            <td>${item.currentStock}</td>
            <td>${item.adjustmentQty}</td>
            <td>${item.newStock}</td>
            <td>${formatCurrency(item.unitValue)}</td>
            <td>${formatCurrency(item.totalValue)}</td>
            <td>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeItem(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function removeItem(index) {
    adjustmentItems.splice(index, 1);
    updateAdjustmentItemsTable();
    updateTotals();
}

function updateTotals() {
    const totalItems = adjustmentItems.length;
    const totalValue = adjustmentItems.reduce((sum, item) => sum + item.totalValue, 0);

    document.getElementById('totalItemsCount').textContent = totalItems;
    document.getElementById('totalAdjustmentValue').textContent = formatCurrency(totalValue);
}

async function handleAdjustmentSubmit(e) {
    e.preventDefault();

    if (adjustmentItems.length === 0) {
        showError('Please add at least one item');
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const adjustmentId = document.getElementById('adjustmentId').value;
        const formData = {
            date: document.getElementById('adjustmentDate').value,
            type: document.getElementById('adjustmentType').value,
            reason: document.getElementById('reason').value,
            items: adjustmentItems,
            notes: document.getElementById('notes').value
        };

        const url = adjustmentId ? `/api/v1/stock-adjustments/${adjustmentId}` : '/api/v1/stock-adjustments';
        const method = adjustmentId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            hideAdjustmentModal();
            loadStockData();
            loadStockOverview();
            showSuccess(adjustmentId ? 'Adjustment updated successfully' : 'Adjustment created successfully');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save adjustment');
        }
    } catch (error) {
        console.error('Error saving adjustment:', error);
        showError(error.message || 'Failed to save adjustment');
    } finally {
        hideLoading();
    }
}

function quickAdjust(itemId) {
    showAddAdjustmentModal();
    // Pre-select the item
    setTimeout(() => {
        document.getElementById('itemSelect').value = itemId;
        updateItemInfo();
    }, 100);
}

function viewHistory(itemId) {
    // TODO: Implement view history functionality
    console.log('View history for item:', itemId);
}

function handleSearch() {
    loadStockData(1);
}

function handleSelectAll(e) {
    const checkboxes = document.querySelectorAll('.stock-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked;
    });
}

function updatePagination(pagination) {
    const paginationDiv = document.getElementById('pagination');

    if (!pagination) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '';

    if (pagination.prev) {
        html += `<button class="btn btn-sm" onclick="loadStockData(${pagination.prev.page})">Previous</button>`;
    }

    const total = pagination.total || 0;
    const limit = pagination.limit || 10;
    const currentPage = pagination.page || 1;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    for (let i = 1; i <= totalPages; i++) {
        const active = i === currentPage ? 'active' : '';
        html += `<button class="btn btn-sm ${active}" onclick="loadStockData(${i})">${i}</button>`;
    }

    if (pagination.next) {
        html += `<button class="btn btn-sm" onclick="loadStockData(${pagination.next.page})">Next</button>`;
    }

    paginationDiv.innerHTML = html;
}

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

