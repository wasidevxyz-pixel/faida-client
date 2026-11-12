// Commission Item Registration JavaScript
let items = [];
let categories = [];
let suppliers = [];

// Modals
let categoryModal, supplierModal, itemListModal;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    // Initialize modals
    categoryModal = new bootstrap.Modal(document.getElementById('categoryModal'));

    const supModalEl = document.getElementById('supplierModal');
    if (supModalEl) {
        supplierModal = new bootstrap.Modal(supModalEl);
    }

    itemListModal = new bootstrap.Modal(document.getElementById('itemListModal'));

    await Promise.all([
        loadCategories(),
        loadSuppliers(),
        getNextSeqId(),
        loadItemsForSearch()
    ]);

    // Setup Top Search Bar Listeners
    setupSearchListeners();

    // Global Shortcuts
    document.addEventListener('keydown', (e) => {
        // Alt + S: Save
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveItem();
        }
        // Alt + C: Open Category Modal
        if (e.altKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            showCategoryModal();
        }
        // Alt + H: Open Supplier Modal
        if (e.altKey && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            showSupplierModal();
        }
        // Alt + B: Open List
        if (e.altKey && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            showList();
        }
    });

    // setUserName() removed as it is handled by sidebar.js
});

function showAlert(message, type = 'danger') {
    // If window.showError/showSuccess are available from pageAccess.js, use them
    if (type === 'danger' && window.showError) {
        window.showError(message);
        return;
    }
    if (type === 'success' && window.showSuccess) {
        window.showSuccess(message);
        return;
    }

    // Fallback implementation
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}

// Load Categories
async function loadCategories() {
    try {
        const response = await fetch('/api/v1/commission-categories', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            categories = data.data;
            const select = document.getElementById('category');
            if (select) {
                select.innerHTML = '<option value="">Select Category</option>';
                categories.forEach(c => {
                    if (c.isActive) {
                        select.innerHTML += `<option value="${c._id}">${c.name}</option>`;
                    }
                });
            }
        }
    } catch (error) { console.error('Error loading categories:', error); }
}

// Load Suppliers
async function loadSuppliers() {
    try {
        const response = await fetch('/api/v1/commission-suppliers', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            suppliers = data.data;
            const select = document.getElementById('supplier');
            if (select) {
                select.innerHTML = '<option value="">Select Supplier</option>';
                suppliers.forEach(s => {
                    if (s.isActive) {
                        select.innerHTML += `<option value="${s._id}">${s.name}</option>`;
                    }
                });
            }
        }
    } catch (error) { console.error('Error loading suppliers:', error); }
}

async function loadItemsForSearch() {
    try {
        const response = await fetch('/api/v1/commission-items', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            allItems = data.data || [];
            console.log(`Loaded ${allItems.length} items for search`);
        }
    } catch (error) {
        console.error('Error loading search items:', error);
    }
}

function setupSearchListeners() {
    // Barcode Search (Enter Key)
    const barInput = document.getElementById('searchBarcode');
    if (barInput) {
        barInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const code = e.target.value.trim();
                if (!code) return;

                // Prioritize Given Pcs Barcode over default Item Code
                let item = allItems.find(i => i.barcode === code);
                if (!item) {
                    item = allItems.find(i => i.itemsCode === code);
                }

                if (item) {
                    selectItem(item._id);
                } else {
                    showAlert('Item not found for this Barcode/Item Code', 'warning');
                }
            }
        });
    }
}

// Name search with suggestions
let nameSearchIndex = -1;

function filterItemsByName(query) {
    const suggestionsBox = document.getElementById('nameSuggestions');

    if (query.length < 1) {
        suggestionsBox.style.display = 'none';
        nameSearchIndex = -1;
        return;
    }

    const matches = allItems.filter(item =>
        (item.name && item.name.toLowerCase().includes(query.toLowerCase())) ||
        (item.barcode && item.barcode.toLowerCase().includes(query.toLowerCase())) ||
        (item.itemsCode && String(item.itemsCode).toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 15);

    if (matches.length > 0) {
        suggestionsBox.innerHTML = '';
        nameSearchIndex = -1;

        matches.forEach((item, index) => {
            const el = document.createElement('a');
            el.className = 'list-group-item list-group-item-action p-2';
            el.href = '#';
            el.setAttribute('data-index', index);
            el.innerHTML = `<b>${item.name}</b> <small class="text-muted">(${item.barcode || item.itemsCode || 'No Code'})</small>`;
            el.onclick = (e) => {
                e.preventDefault();
                selectItem(item._id);
                document.getElementById('searchName').value = '';
                suggestionsBox.style.display = 'none';
            };
            suggestionsBox.appendChild(el);
        });

        suggestionsBox.matchedItems = matches;
        suggestionsBox.style.display = 'block';
    } else {
        suggestionsBox.style.display = 'none';
    }
}

function handleNameSearchKeydown(e) {
    const suggestionsBox = document.getElementById('nameSuggestions');
    const items = suggestionsBox.querySelectorAll('.list-group-item');

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        nameSearchIndex = Math.min(nameSearchIndex + 1, items.length - 1);
        updateNameSearchSelection(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        nameSearchIndex = Math.max(nameSearchIndex - 1, -1);
        updateNameSearchSelection(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (nameSearchIndex >= 0 && suggestionsBox.matchedItems) {
            const selectedItem = suggestionsBox.matchedItems[nameSearchIndex];
            if (selectedItem) {
                selectItem(selectedItem._id);
                document.getElementById('searchName').value = '';
                suggestionsBox.style.display = 'none';
            }
        }
    } else if (e.key === 'Escape') {
        suggestionsBox.style.display = 'none';
        nameSearchIndex = -1;
    }
}

function updateNameSearchSelection(items) {
    items.forEach((item, index) => {
        if (index === nameSearchIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}

// Get Next Seq ID
async function getNextSeqId() {
    try {
        const response = await fetch('/api/v1/commission-items/next-seq', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById('seqId').value = data.data.seqId;
            document.getElementById('itemCode').value = data.data.itemCode;
            document.getElementById('searchBarcode').value = '';
        }
    } catch (error) { console.error('Error getting next ID:', error); }
}

// Save Item
async function saveItem() {
    const id = document.getElementById('itemId').value;

    const formData = {
        seqId: parseInt(document.getElementById('seqId').value),
        itemsCode: document.getElementById('itemCode').value,
        barcode: document.getElementById('grossPerBarCode').value,
        name: document.getElementById('itemName').value,
        costPrice: parseFloat(document.getElementById('costPrice').value) || 0,
        retailPrice: parseFloat(document.getElementById('retailPrice').value) || 0,
        incentive: parseFloat(document.getElementById('incentive').value) || 0,
        category: document.getElementById('category').value || null,
        supplier: document.getElementById('supplier').value || null,
        isActive: document.getElementById('isActive').checked
    };

    if (!formData.name) return showAlert('Please enter item name', 'warning');
    if (!formData.category) return showAlert('Please select a category', 'warning');
    if (!formData.supplier) return showAlert('Please select a supplier', 'warning');

    try {
        const url = id ? `/api/v1/commission-items/${id}` : '/api/v1/commission-items';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        if (result.success) {
            showAlert(`Item ${id ? 'updated' : 'saved'} successfully`, 'success');

            const savedItem = result.data;
            if (id) {
                const idx = allItems.findIndex(i => i._id === id);
                if (idx !== -1) {
                    allItems[idx] = savedItem;
                }
            } else {
                allItems.unshift(savedItem);
            }

            clearForm();
            // Refresh list if open
            if (document.getElementById('itemListModal').classList.contains('show')) {
                renderItemList(allItems);
            }
        } else {
            showAlert(result.message || result.error || 'Error saving item', 'danger');
        }
    } catch (error) {
        console.error('Error saving item:', error);
        showAlert('Error saving item', 'danger');
    }
}

// Delete Item
async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
        const response = await fetch(`/api/v1/commission-items/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            showAlert('Item deleted successfully', 'success');
            // If in list mode
            if (document.getElementById('itemListModal').classList.contains('show')) {
                // Remove from allItems
                allItems = allItems.filter(i => i._id !== id);
                renderItemList(allItems);
            } else {
                // If editing the item being deleted (rare but possible)
                clearForm();
            }
        } else {
            showAlert('Delete failed: ' + (data.message || 'Unknown error'), 'danger');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showAlert('Error deleting item', 'danger');
    }
}

// Clear Form
function clearForm() {
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('isActive').checked = true;
    document.getElementById('searchBarcode').value = '';
    document.getElementById('searchName').value = '';
    getNextSeqId();
}

// List Functions
let allItems = [];

async function showList() {
    try {
        if (!itemListModal) {
            const el = document.getElementById('itemListModal');
            if (el) {
                itemListModal = new bootstrap.Modal(el, { backdrop: 'static' });
            }
        }

        if (allItems.length === 0) {
            await loadItemsForSearch();
        }

        renderItemList(allItems);

        if (itemListModal) {
            itemListModal.show();
            setTimeout(() => {
                const searchBox = document.getElementById('itemListSearch');
                if (searchBox) {
                    searchBox.value = '';
                    searchBox.focus();
                }
            }, 300);
        }
    } catch (error) {
        console.error('showList error:', error);
        showAlert('Network or rendering error', 'danger');
    }
}

function renderItemList(items) {
    const tbody = document.getElementById('itemListTableBody');
    if (!tbody) return;

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    const isAdmin = user.role === 'admin' || (user.group && user.group.isAdmin) || (user.groupId && user.groupId.isAdmin);
    const canDelete = isAdmin || rights.commission_delete_item;

    const htmlRows = items.map(item => {
        const bgBlue = 'background-color: #e3f2fd;';
        const bgGreen = 'background-color: #d1e7dd;';
        const bgRed = 'background-color: #f8d7da;';
        const bgPurple = 'background-color: #e2d9f3;';
        const bgCyan = 'background-color: #caf0f8;';

        return `
            <tr>
                <td class="p-1">
                    <div class="d-flex gap-1 justify-content-center">
                        <button class="btn btn-primary btn-sm" onclick="selectItem('${item._id}')" style="font-size: 0.7rem; padding: 2px 4px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${canDelete ? `
                        <button class="btn btn-danger btn-sm" onclick="deleteItem('${item._id}')" style="font-size: 0.7rem; padding: 2px 4px;">
                            <i class="fas fa-trash"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
                <td style="${bgBlue}">${item.barcode || item.itemsCode || ''}</td>
                <td style="${bgBlue} text-align: left; padding-left: 10px;">${item.name || ''}</td>
                 <td style="${bgGreen}">${item.costPrice || 0}</td>
                <td style="${bgRed}">${item.retailPrice || 0}</td>
                <td style="${bgRed}">${item.incentive || 0}</td>
                <td style="${bgPurple}">${getCategoryName(item.category)}</td>
                <td style="${bgCyan}">${getSupplierName(item.supplier)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = htmlRows.length > 0 ? htmlRows.join('') : '<tr><td colspan="7" class="p-4 text-muted">No items found</td></tr>';
}

function getCategoryName(val) {
    if (val && typeof val === 'object') return val.name || '';
    if (!val) return '';
    const found = categories.find(c => c._id === val);
    return found ? found.name : '';
}
function getSupplierName(val) {
    if (val && typeof val === 'object') return val.name || '';
    if (!val) return '';
    const found = suppliers.find(s => s._id === val);
    return found ? found.name : '';
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('itemListSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allItems.filter(i =>
                (i.name && i.name.toLowerCase().includes(term)) ||
                (i.barcode && i.barcode.toLowerCase().includes(term)) ||
                (i.itemsCode && i.itemsCode.toLowerCase().includes(term))
            );
            renderItemList(filtered);
        });
    }
});

async function selectItem(id) {
    try {
        const response = await fetch(`/api/v1/commission-items/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            const item = data.data;

            document.getElementById('itemId').value = item._id;
            document.getElementById('seqId').value = item.seqId;
            document.getElementById('grossPerBarCode').value = item.barcode || '';
            document.getElementById('searchBarcode').value = '';
            document.getElementById('itemName').value = item.name;
            document.getElementById('itemCode').value = item.itemsCode || '';
            document.getElementById('costPrice').value = item.costPrice;
            document.getElementById('retailPrice').value = item.retailPrice;
            document.getElementById('incentive').value = item.incentive || 0;
            document.getElementById('isActive').checked = item.isActive;

            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el && val) el.value = (typeof val === 'object') ? val._id : val;
            };
            setVal('category', item.category);
            setVal('supplier', item.supplier);

            if (itemListModal) itemListModal.hide();
            showAlert('Item loaded successfully', 'success');
        }
    } catch (error) {
        console.error('Error selecting item:', error);
        showAlert('Error loading item details', 'danger');
    }
}

// ==========================================
// CATEGORY MODAL LOGIC
// ==========================================
function showCategoryModal() {
    resetCategoryForm();
    renderCategoryTable();
    categoryModal.show();
}

function resetCategoryForm() {
    document.getElementById('categoryId').value = '';
    document.getElementById('modalCategoryName').value = '';
    document.getElementById('modalCategoryActive').checked = true;
}

function renderCategoryTable() {
    const tbody = document.getElementById('categoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = categories.map(c => `
        <tr>
            <td>${c.name}</td>
            <td><span class="badge bg-${c.isActive ? 'success' : 'danger'}">${c.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editCategory('${c._id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteCategoryModule('${c._id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function editCategory(id) {
    const category = categories.find(c => c._id === id);
    if (category) {
        document.getElementById('categoryId').value = category._id;
        document.getElementById('modalCategoryName').value = category.name;
        document.getElementById('modalCategoryActive').checked = category.isActive;
    }
}

async function saveCategory() {
    const id = document.getElementById('categoryId').value;
    const name = document.getElementById('modalCategoryName').value;
    const isActive = document.getElementById('modalCategoryActive').checked;
    if (!name) return showAlert('Please enter category name', 'warning');

    try {
        const url = id ? `/api/v1/commission-categories/${id}` : '/api/v1/commission-categories';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ name, isActive })
        });
        const result = await response.json();
        if (result.success) {
            showAlert(`Category ${id ? 'updated' : 'added'} successfully`, 'success');
            resetCategoryForm();
            await loadCategories();
            renderCategoryTable(); // Refresh modal table
        } else {
            showAlert(result.message || 'Error saving category', 'danger');
        }
    } catch (error) { console.error(error); showAlert('Error saving category', 'danger'); }
}

async function deleteCategoryModule(id) {
    if (!confirm('Delete this category?')) return;
    try {
        const response = await fetch(`/api/v1/commission-categories/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (response.ok) {
            showAlert('Category deleted', 'success');
            await loadCategories();
            renderCategoryTable();
        } else {
            showAlert('Failed to delete category', 'danger');
        }
    } catch (error) { console.error(error); showAlert('Error deleting category', 'danger'); }
}

// ==========================================
// SUPPLIER MODAL LOGIC
// ==========================================
function showSupplierModal() {
    if (supplierModal) {
        resetSupplierForm();
        renderSupplierTable();
        supplierModal.show();
    } else {
        showAlert('Supplier modal not initialized. Please refresh.', 'danger');
    }
}

function resetSupplierForm() {
    document.getElementById('supplierId').value = '';
    document.getElementById('modalSupplierName').value = '';
    document.getElementById('modalSupplierActive').checked = true;
}

function renderSupplierTable() {
    const tbody = document.getElementById('supplierTableBody');
    if (!tbody) return;
    tbody.innerHTML = suppliers.map(s => `
        <tr>
            <td>${s.name}</td>
            <td><span class="badge bg-${s.isActive ? 'success' : 'danger'}">${s.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editSupplier('${s._id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteSupplierModule('${s._id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function editSupplier(id) {
    const supplier = suppliers.find(s => s._id === id);
    if (supplier) {
        document.getElementById('supplierId').value = supplier._id;
        document.getElementById('modalSupplierName').value = supplier.name;
        document.getElementById('modalSupplierActive').checked = supplier.isActive;
    }
}

async function saveSupplier() {
    const id = document.getElementById('supplierId').value;
    const name = document.getElementById('modalSupplierName').value;
    const isActive = document.getElementById('modalSupplierActive').checked;
    if (!name) return showAlert('Please enter supplier name', 'warning');

    try {
        const url = id ? `/api/v1/commission-suppliers/${id}` : '/api/v1/commission-suppliers';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ name, isActive })
        });
        const result = await response.json();
        if (result.success) {
            showAlert(`Supplier ${id ? 'updated' : 'added'} successfully`, 'success');
            resetSupplierForm();
            await loadSuppliers();
            renderSupplierTable();
        } else {
            showAlert(result.message || 'Error saving supplier', 'danger');
        }
    } catch (error) { console.error(error); showAlert('Error saving supplier', 'danger'); }
}

async function deleteSupplierModule(id) {
    if (!confirm('Delete this supplier?')) return;
    try {
        const response = await fetch(`/api/v1/commission-suppliers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (response.ok) {
            showAlert('Supplier deleted', 'success');
            await loadSuppliers();
            renderSupplierTable();
        } else {
            showAlert('Failed to delete supplier', 'danger');
        }
    } catch (error) { console.error(error); showAlert('Error deleting supplier', 'danger'); }
}

