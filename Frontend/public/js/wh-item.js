// WH Item Registration JavaScript
let items = [];
let companies = [];
let categories = [];
let classes = [];
let subClasses = [];
let suppliers = [];
let stores = [];
let itemStockList = [];

// Modals
let companyModal, categoryModal, classModal, subClassModal, itemListModal;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    // Initialize modals
    companyModal = new bootstrap.Modal(document.getElementById('companyModal'));
    categoryModal = new bootstrap.Modal(document.getElementById('categoryModal'));
    classModal = new bootstrap.Modal(document.getElementById('classModal'));
    subClassModal = new bootstrap.Modal(document.getElementById('subClassModal'));
    itemListModal = new bootstrap.Modal(document.getElementById('itemListModal'));

    await Promise.all([
        loadCompanies(),
        loadCategories(),
        loadClasses(),
        loadSubClasses(),
        loadSuppliers(),
        loadStores(),
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
    });

    setUserName();
});

// Load Companies
async function loadCompanies() {
    try {
        const response = await fetch('/api/v1/wh-item-companies', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            companies = data.data;
            const select = document.getElementById('company');
            if (select) {
                select.innerHTML = '<option value="">Select Company</option>';
                companies.forEach(c => {
                    if (c.isActive) {
                        select.innerHTML += `<option value="${c._id}">${c.name}</option>`;
                    }
                });
            }
        }
    } catch (error) { console.error('Error loading companies:', error); }
}

// Load Categories
async function loadCategories() {
    try {
        const response = await fetch('/api/v1/wh-item-categories', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            categories = data.data;
            const select = document.getElementById('category');
            if (select) {
                const userStr = localStorage.getItem('user');
                const user = userStr ? JSON.parse(userStr) : null;
                const allowed = (user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) ? user.allowedWHItemCategories : null;

                select.innerHTML = '<option value="">Select Category</option>';
                categories.forEach(c => {
                    if (c.isActive) {
                        if (!allowed || allowed.includes(c._id)) {
                            select.innerHTML += `<option value="${c._id}">${c.name}</option>`;
                        }
                    }
                });
            }
        }
    } catch (error) { console.error('Error loading categories:', error); }
}

// Load Classes
async function loadClasses() {
    try {
        const response = await fetch('/api/v1/wh-item-classes', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            classes = data.data;
            const select = document.getElementById('itemClass');
            if (select) {
                select.innerHTML = '<option value="">Select Class</option>';
                classes.forEach(c => {
                    if (c.isActive) {
                        select.innerHTML += `<option value="${c._id}">${c.name}</option>`;
                    }
                });
            }
        }
    } catch (error) { console.error('Error loading classes:', error); }
}

// Load SubClasses
async function loadSubClasses() {
    try {
        const response = await fetch('/api/v1/wh-item-subclasses', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            subClasses = data.data;
            const select = document.getElementById('subClass');
            if (select) {
                select.innerHTML = '<option value="">Select SubClass</option>';
                subClasses.forEach(c => {
                    if (c.isActive) {
                        select.innerHTML += `<option value="${c._id}">${c.name}</option>`;
                    }
                });
            }
        }
    } catch (error) { console.error('Error loading subclasses:', error); }
}

// Load Suppliers
async function loadSuppliers() {
    try {
        console.log('Fetching WH Suppliers...');
        const response = await fetch('/api/v1/wh-suppliers', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        console.log('WH Suppliers Response:', data);

        if (data.success && data.data) {
            suppliers = data.data;
            const select = document.getElementById('supplier');
            if (select) {
                select.innerHTML = '<option value="">Select Supplier</option>';
                suppliers.forEach(s => {
                    if (s.isActive !== false) {
                        const name = s.supplierName || s.name || 'Unknown Supplier';
                        select.innerHTML += `<option value="${s._id}">${name}</option>`;
                    }
                });
                console.log(`Loaded ${suppliers.length} suppliers into dropdown.`);
            }
        } else {
            console.error('Failed to load suppliers:', data);
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
        if (typeof showAlert === 'function') showAlert('Error loading suppliers', 'danger');
    }
}

// Load Stores
async function loadStores() {
    try {
        const response = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            stores = data.data;
            const select = document.getElementById('stockStoreSelect');
            if (select) {
                select.innerHTML = '<option value="">Choose Store...</option>';
                stores.forEach(s => {
                    if (s.isActive !== false) { // Assuming stores have isActive
                        select.innerHTML += `<option value="${s._id}">${s.name}</option>`;
                    }
                });
            }
        }
    } catch (error) { console.error('Error loading stores:', error); }
}
async function loadItemsForSearch() {
    try {
        const response = await fetch('/api/v1/wh-items?showInactive=true', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            allItems = data.data || [];

            // Filter by allowed categories
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) {
                const allowed = user.allowedWHItemCategories;
                allItems = allItems.filter(item => {
                    const catId = typeof item.category === 'object' ? item.category?._id : item.category;
                    return allowed.includes(catId);
                });
            }

            console.log(`Loaded ${allItems.length} items for search after filtering`);
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

                // Normalize function to strip leading zeros for comparison
                const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
                const normalizedSearch = normalize(code);

                // Prioritize Given Pcs Barcode over default Item Code
                let item = allItems.find(i => normalize(i.barcode) === normalizedSearch);
                if (!item) {
                     item = allItems.find(i => normalize(i.itemsCode) === normalizedSearch);
                }

                if (item) {
                    selectItem(item._id);
                    e.target.value = ''; // Clear search bar after success
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

    // Normalize for zero-insensitive comparison
    const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
    const normQuery = normalize(query);

    const matches = allItems.filter(item =>
        (item.name && item.name.toLowerCase().includes(query.toLowerCase())) ||
        (item.barcode && normalize(item.barcode).includes(normQuery)) ||
        (item.itemsCode && normalize(item.itemsCode).includes(normQuery))
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
// Add Stock Row
function addStockRow() {
    const storeId = document.getElementById('stockStoreSelect').value;
    const opening = parseFloat(document.getElementById('stockOpeningInput').value) || 0;

    if (!storeId) return showAlert('Please select a store', 'warning');

    const store = stores.find(s => s._id === storeId);
    if (!store) return;

    // Check availability
    const existing = itemStockList.find(i => i.store === storeId);
    if (existing) {
        existing.opening = opening; // Update existing
    } else {
        itemStockList.push({
            store: storeId,
            storeName: store.name,
            quantity: 0,
            opening: opening
        });
    }

    renderStockTable();
    // Reset inputs
    document.getElementById('stockStoreSelect').value = '';
    document.getElementById('stockOpeningInput').value = '0';
}

// Delete Stock Row
function deleteStockRow(storeId) {
    itemStockList = itemStockList.filter(i => i.store !== storeId);
    renderStockTable();
}

// Render Stock Table
function renderStockTable() {
    const tbody = document.getElementById('stockTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    itemStockList.forEach((item, index) => {
        tbody.innerHTML += `
            <tr>
                <td>${item.storeName}</td>
                <td>${item.quantity}</td>
                <td>${item.opening}</td>
                <td>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteStockRow('${item.store}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

// Get Next Seq ID
async function getNextSeqId() {
    try {
        const response = await fetch('/api/v1/wh-items/next-seq', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            // Backend now returns { seqId, itemCode }
            document.getElementById('seqId').value = data.data.seqId;
            document.getElementById('itemCode').value = data.data.itemCode;
            document.getElementById('searchBarcode').value = '';
        }
    } catch (error) { console.error('Error getting next ID:', error); }
}

// Save Item
async function saveItem() {
    const id = document.getElementById('itemId').value;

    // Prepare Stock
    const stockData = itemStockList.map(s => ({
        store: s.store,
        quantity: s.quantity,
        opening: s.opening
    }));

    const formData = {
        seqId: parseInt(document.getElementById('seqId').value),
        itemsCode: document.getElementById('itemCode').value,
        barcode: document.getElementById('grossPerBarCode').value,
        name: document.getElementById('itemName').value,
        costPrice: parseFloat(document.getElementById('costPrice').value) || 0,
        retailPrice: parseFloat(document.getElementById('retailPrice').value) || 0,
        incentive: parseFloat(document.getElementById('incentive').value) || 0,
        company: document.getElementById('company').value || null,
        category: document.getElementById('category').value || null,
        itemClass: document.getElementById('itemClass').value || null,
        subClass: document.getElementById('subClass').value || null,
        supplier: document.getElementById('supplier').value || null,
        stock: stockData,
        isActive: document.getElementById('isActive').checked
    };

    if (!formData.name) return showAlert('Please enter item name', 'warning');
    if (!formData.company) return showAlert('Please select a company', 'warning');
    if (!formData.category) return showAlert('Please select a category', 'warning');
    if (!formData.itemClass) return showAlert('Please select a class', 'warning');
    if (!formData.subClass) return showAlert('Please select a subclass', 'warning');
    if (!formData.supplier) return showAlert('Please select a supplier', 'warning');
    if (!formData.costPrice || formData.costPrice <= 0) return showAlert('Please enter a valid cost price', 'warning');
    if (!formData.retailPrice || formData.retailPrice <= 0) return showAlert('Please enter a valid retail price', 'warning');

    try {
        const url = id ? `/api/v1/wh-items/${id}` : '/api/v1/wh-items';
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

            // Update local cache
            const savedItem = result.data;
            if (id) {
                const idx = allItems.findIndex(i => i._id === id);
                if (idx !== -1) {
                    allItems[idx] = savedItem;
                }
            } else {
                // If it's a new item, add to the beginning
                allItems.unshift(savedItem);
            }

            // Keep company, category, class, subclass, supplier after creating a new item
            clearForm(!id);
            // Refresh list if open
            if (document.getElementById('itemListModal').classList.contains('show')) {
                // Since we updated allItems, showList/renderItemList will use the new data
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
        const response = await fetch(`/api/v1/wh-items/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            showAlert('Item deleted successfully', 'success');
            showList(); // Refresh list
        } else {
            showAlert('Delete failed: ' + (data.message || 'Unknown error'), 'danger');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showAlert('Error deleting item', 'danger');
    }
}

// Clear Form
function clearForm(keepSelections = false) {
    const savedCompany = keepSelections ? document.getElementById('company').value : '';
    const savedCategory = keepSelections ? document.getElementById('category').value : '';
    const savedItemClass = keepSelections ? document.getElementById('itemClass').value : '';
    const savedSubClass = keepSelections ? document.getElementById('subClass').value : '';
    const savedSupplier = keepSelections ? document.getElementById('supplier').value : '';

    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('isActive').checked = true;
    document.getElementById('searchBarcode').value = '';
    document.getElementById('searchName').value = '';

    // Restore persistent classification selections for fast sequential item entry
    if (keepSelections) {
        if (savedCompany) document.getElementById('company').value = savedCompany;
        if (savedCategory) document.getElementById('category').value = savedCategory;
        if (savedItemClass) document.getElementById('itemClass').value = savedItemClass;
        if (savedSubClass) document.getElementById('subClass').value = savedSubClass;
        if (savedSupplier) document.getElementById('supplier').value = savedSupplier;
    }

    itemStockList = []; // Clear stock list
    renderStockTable();
    getNextSeqId();

    // Focus on item name input for instant next item entry
    setTimeout(() => {
        const nameInput = document.getElementById('itemName');
        if (nameInput) nameInput.focus();
    }, 100);
}

// List Functions
let allItems = [];

async function showList() {
    try {
        console.log('List Button Triggered');

        // Initialize if not already done
        if (!itemListModal) {
            const el = document.getElementById('itemListModal');
            if (el) {
                itemListModal = new bootstrap.Modal(el, { backdrop: 'static' });
                console.log('itemListModal initialized');
            }
        }

        // If allItems is empty, fetch it (otherwise loadItemsForSearch might have already filled it)
        if (allItems.length === 0) {
            const response = await fetch('/api/v1/wh-items?showInactive=true', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await response.json();
            if (data.success) {
                let items = data.data || [];

                // Filter by allowed categories
                const userStr = localStorage.getItem('user');
                const user = userStr ? JSON.parse(userStr) : null;
                if (user && user.allowedWHItemCategories && user.allowedWHItemCategories.length > 0) {
                    const allowed = user.allowedWHItemCategories;
                    items = items.filter(item => {
                        const catId = typeof item.category === 'object' ? item.category?._id : item.category;
                        return allowed.includes(catId);
                    });
                }
                allItems = items;
            }
        }

        renderItemList(allItems);

        if (itemListModal) {
            itemListModal.show();
            // Ensure focus on search after slight delay
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

    // Check rights
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    const isAdmin = user.role === 'admin' || (user.group && user.group.isAdmin) || (user.groupId && user.groupId.isAdmin);
    const canDelete = isAdmin || rights.wh_delete_item;

    const htmlRows = items.map(item => {
        const totalStock = (item.stock || []).reduce((acc, s) => acc + (s.quantity || 0), 0);

        const bgBlue = 'background-color: #e3f2fd;';
        const bgGreen = 'background-color: #d1e7dd;';
        const bgRed = 'background-color: #f8d7da;';
        const bgPink = 'background-color: #f1aeb5;';
        const bgYellow = 'background-color: #fff3cd;';
        const bgPurple = 'background-color: #e2d9f3;';
        const bgPurpleLight = 'background-color: #f3e5f5;';
        const bgCyan = 'background-color: #caf0f8;';
        const bgOrange = 'background-color: #ffe6cc;';

        const rowStyle = item.isActive === false ? 'opacity: 0.6; background-color: #f8d7da;' : '';
        const statusBadge = item.isActive === false ? '<span class="badge bg-danger ms-1">INACTIVE</span>' : '';

        return `
            <tr style="${rowStyle}">
                <td class="p-1">
                    <div class="d-flex gap-1">
                        <button class="btn btn-primary btn-sm flex-grow-1" onclick="selectItem('${item._id}')" style="font-size: 0.7rem; padding: 2px 4px;">
                            <i class="fas fa-edit"></i> Select
                        </button>
                        ${canDelete ? `
                        <button class="btn btn-danger btn-sm" onclick="deleteItem('${item._id}')" style="font-size: 0.7rem; padding: 2px 4px;">
                            <i class="fas fa-trash"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
                <td style="${bgBlue}">${item.barcode || item.itemsCode || ''}</td>
                <td style="${bgBlue} text-align: left; padding-left: 10px;">${item.name || ''} ${statusBadge}</td>
                <td style="${bgGreen}">${item.costPrice || 0}</td>
                <td style="${bgRed}">${item.retailPrice || 0}</td>
                <td style="${bgOrange}">${item.incentive || 0}</td>
                <td style="${bgPink}">${totalStock}</td>
                <td style="${bgYellow}">${getCompanyName(item.company)}</td>
                <td style="${bgPurple}">${getCategoryName(item.category)}</td>
                <td style="${bgPurpleLight}">${getClassName(item.itemClass)}</td>
                <td style="${bgBlue}">${getSubClassName(item.subClass)}</td>
                <td style="${bgCyan}">${getSupplierName(item.supplier)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = htmlRows.length > 0 ? htmlRows.join('') : '<tr><td colspan="11" class="p-4 text-muted">No items found</td></tr>';
}

// Helpers to resolve Name from ID or Object
function getCompanyName(val) {
    if (val && typeof val === 'object') return val.name || '';
    if (!val) return '';
    const found = companies.find(c => c._id === val);
    return found ? found.name : '';
}
function getCategoryName(val) {
    if (val && typeof val === 'object') return val.name || '';
    if (!val) return '';
    const found = categories.find(c => c._id === val);
    return found ? found.name : '';
}
function getClassName(val) {
    if (val && typeof val === 'object') return val.name || '';
    if (!val) return '';
    const found = classes.find(c => c._id === val);
    return found ? found.name : '';
}
function getSubClassName(val) {
    if (val && typeof val === 'object') return val.name || '';
    if (!val) return '';
    const found = subClasses.find(c => c._id === val);
    return found ? found.name : '';
}
function getSupplierName(val) {
    if (val && typeof val === 'object') return val.supplierName || '';
    if (!val) return '';
    const found = suppliers.find(s => s._id === val);
    return found ? found.supplierName : '';
}

// Search filtering logic
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('itemListSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const normalize = (val) => String(val || '').trim().replace(/^0+/, '');
            const normTerm = normalize(term);

            const filtered = allItems.filter(i =>
                (i.name && i.name.toLowerCase().includes(term)) ||
                (i.barcode && normalize(i.barcode).includes(normTerm)) ||
                (i.itemsCode && normalize(i.itemsCode).includes(normTerm))
            );
            renderItemList(filtered);
        });
    }
});

async function selectItem(id) {
    try {
        const response = await fetch(`/api/v1/wh-items/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            const item = data.data;

            // Populate Form
            document.getElementById('itemId').value = item._id;
            document.getElementById('seqId').value = item.seqId;
            document.getElementById('grossPerBarCode').value = item.barcode || '';
            document.getElementById('searchBarcode').value = ''; // Clear search bar
            const nameSearch = document.getElementById('searchName');
            if (nameSearch) nameSearch.value = ''; // Clear name search field

            document.getElementById('itemName').value = item.name;
            document.getElementById('itemCode').value = item.itemsCode || '';
            document.getElementById('costPrice').value = item.costPrice;
            document.getElementById('retailPrice').value = item.retailPrice;
            document.getElementById('incentive').value = item.incentive;
            document.getElementById('isActive').checked = item.isActive;

            // Set Dropdowns
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el && val) el.value = (typeof val === 'object') ? val._id : val;
            };
            setVal('company', item.company);
            setVal('category', item.category);
            setVal('itemClass', item.itemClass);
            setVal('subClass', item.subClass);
            setVal('supplier', item.supplier);

            // Populate Stock
            itemStockList = (item.stock || []).map(s => {
                const storeId = (typeof s.store === 'object') ? s.store._id : s.store;
                const storeObj = stores.find(st => st._id === storeId);
                return {
                    store: storeId,
                    storeName: storeObj ? storeObj.name : 'Unknown Store',
                    quantity: s.quantity || 0,
                    opening: s.opening || 0
                };
            });
            renderStockTable();

            if (itemListModal) itemListModal.hide();
            showAlert('Item loaded successfully', 'success');
        }
    } catch (error) {
        console.error('Error selecting item:', error);
        showAlert('Error loading item details', 'danger');
    }
}

// Modal Functions
// ==========================================
// COMPANY MANAGMENT
function showCompanyModal() {
    resetCompanyForm();
    renderCompanyTable();
    companyModal.show();
}

function resetCompanyForm() {
    document.getElementById('companyId').value = '';
    document.getElementById('modalCompanyName').value = '';
    document.getElementById('modalCompanyActive').checked = true;
}

function renderCompanyTable() {
    const tbody = document.getElementById('companyTableBody');
    if (!tbody) return;
    tbody.innerHTML = companies.map(c => `
        <tr>
            <td>${c.name}</td>
            <td><span class="badge bg-${c.isActive ? 'success' : 'danger'}">${c.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editCompany('${c._id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteCompany('${c._id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function editCompany(id) {
    const company = companies.find(c => c._id === id);
    if (company) {
        document.getElementById('companyId').value = company._id;
        document.getElementById('modalCompanyName').value = company.name;
        document.getElementById('modalCompanyActive').checked = company.isActive;
    }
}

async function saveCompany() {
    const id = document.getElementById('companyId').value;
    const name = document.getElementById('modalCompanyName').value;
    const isActive = document.getElementById('modalCompanyActive').checked;
    if (!name) return showAlert('Please enter company name', 'warning');

    try {
        const url = id ? `/api/v1/wh-item-companies/${id}` : '/api/v1/wh-item-companies';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ name, isActive })
        });
        const result = await response.json();
        if (result.success) {
            showAlert(`Company ${id ? 'updated' : 'added'} successfully`, 'success');
            resetCompanyForm();
            await loadCompanies();
            renderCompanyTable();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) { showAlert('Error saving company', 'danger'); }
}

async function deleteCompany(id) {
    if (!confirm('Are you sure you want to delete this company?')) return;
    try {
        const response = await fetch(`/api/v1/wh-item-companies/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            showAlert('Company deleted successfully', 'success');
            await loadCompanies();
            renderCompanyTable();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) { showAlert('Error deleting company', 'danger'); }
}

// ==========================================
// CATEGORY MANAGMENT
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
                <button class="btn btn-sm btn-danger" onclick="deleteCategory('${c._id}')"><i class="fas fa-trash"></i></button>
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
        const url = id ? `/api/v1/wh-item-categories/${id}` : '/api/v1/wh-item-categories';
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
            renderCategoryTable();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) { showAlert('Error saving category', 'danger'); }
}

async function deleteCategory(id) {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
        const response = await fetch(`/api/v1/wh-item-categories/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            showAlert('Category deleted successfully', 'success');
            await loadCategories();
            renderCategoryTable();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) { showAlert('Error deleting category', 'danger'); }
}

// ==========================================
// CLASS MANAGMENT
function showClassModal() {
    resetClassForm();
    renderClassTable();
    classModal.show();
}

function resetClassForm() {
    document.getElementById('classId').value = '';
    document.getElementById('modalClassName').value = '';
    document.getElementById('modalClassActive').checked = true;
}

function renderClassTable() {
    const tbody = document.getElementById('classTableBody');
    if (!tbody) return;
    tbody.innerHTML = classes.map(c => `
        <tr>
            <td>${c.name}</td>
            <td><span class="badge bg-${c.isActive ? 'success' : 'danger'}">${c.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editClass('${c._id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteClass('${c._id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function editClass(id) {
    const cls = classes.find(c => c._id === id);
    if (cls) {
        document.getElementById('classId').value = cls._id;
        document.getElementById('modalClassName').value = cls.name;
        document.getElementById('modalClassActive').checked = cls.isActive;
    }
}

async function saveClass() {
    const id = document.getElementById('classId').value;
    const name = document.getElementById('modalClassName').value;
    const isActive = document.getElementById('modalClassActive').checked;
    if (!name) return showAlert('Please enter class name', 'warning');

    try {
        const url = id ? `/api/v1/wh-item-classes/${id}` : '/api/v1/wh-item-classes';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ name, isActive })
        });
        const result = await response.json();
        if (result.success) {
            showAlert(`Class ${id ? 'updated' : 'added'} successfully`, 'success');
            resetClassForm();
            await loadClasses();
            renderClassTable();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) { showAlert('Error saving class', 'danger'); }
}

async function deleteClass(id) {
    if (!confirm('Are you sure you want to delete this class?')) return;
    try {
        const response = await fetch(`/api/v1/wh-item-classes/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            showAlert('Class deleted successfully', 'success');
            await loadClasses();
            renderClassTable();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) { showAlert('Error deleting class', 'danger'); }
}

// ==========================================
// SUBCLASS MANAGMENT
function showSubClassModal() {
    resetSubClassForm();
    renderSubClassTable();
    subClassModal.show();
}

function resetSubClassForm() {
    document.getElementById('subClassId').value = '';
    document.getElementById('modalSubClassName').value = '';
    document.getElementById('modalSubClassActive').checked = true;
}

function renderSubClassTable() {
    const tbody = document.getElementById('subClassTableBody');
    if (!tbody) return;
    tbody.innerHTML = subClasses.map(c => `
        <tr>
            <td>${c.name}</td>
            <td><span class="badge bg-${c.isActive ? 'success' : 'danger'}">${c.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editSubClass('${c._id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteSubClass('${c._id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function editSubClass(id) {
    const sub = subClasses.find(c => c._id === id);
    if (sub) {
        document.getElementById('subClassId').value = sub._id;
        document.getElementById('modalSubClassName').value = sub.name;
        document.getElementById('modalSubClassActive').checked = sub.isActive;
    }
}

async function saveSubClass() {
    const id = document.getElementById('subClassId').value;
    const name = document.getElementById('modalSubClassName').value;
    const isActive = document.getElementById('modalSubClassActive').checked;
    if (!name) return showAlert('Please enter subclass name', 'warning');

    try {
        const url = id ? `/api/v1/wh-item-subclasses/${id}` : '/api/v1/wh-item-subclasses';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ name, isActive })
        });
        const result = await response.json();
        if (result.success) {
            showAlert(`SubClass ${id ? 'updated' : 'added'} successfully`, 'success');
            resetSubClassForm();
            await loadSubClasses();
            renderSubClassTable();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) { showAlert('Error saving subclass', 'danger'); }
}

async function deleteSubClass(id) {
    if (!confirm('Are you sure you want to delete this subclass?')) return;
    try {
        const response = await fetch(`/api/v1/wh-item-subclasses/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            showAlert('SubClass deleted successfully', 'success');
            await loadSubClasses();
            renderSubClassTable();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) { showAlert('Error deleting subclass', 'danger'); }
}

function showSupplierModal() {
    if (confirm('Redirect to Add Supplier page?')) {
        window.open('/wh-supplier', '_blank');
    }
}

// Alert Function
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 3000);
}

// Set User Name
function setUserName() {
    const userNameElem = document.getElementById('userName');
    if (userNameElem) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        userNameElem.textContent = user.name || 'User';
    }
}
// Handle Stock Import
async function handleStockImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            // Use raw: false to preserve leading zeros from Excel
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });

            if (jsonData.length === 0) {
                showAlert('Excel file is empty', 'warning');
                return;
            }

            if (!confirm(`Are you sure you want to import opening stock for ${jsonData.length} items? This will update their current stock and opening stock.`)) {
                event.target.value = '';
                return;
            }

            // Show loading message
            showAlert(`Importing stock for ${jsonData.length} items... please wait`, 'info');

            const response = await fetch('/api/v1/wh-items/import-stock', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ stockData: jsonData })
            });

            const result = await response.json();
            if (result.success) {
                showAlert(result.message, 'success');
                // Reload items for search and refresh list if visible
                await loadItemsForSearch();
                if (document.getElementById('itemListModal').classList.contains('show')) {
                    renderItemList(allItems);
                }
            } else {
                showAlert(result.message || 'Import failed', 'danger');
            }
            event.target.value = '';

        } catch (error) {
            console.error('Stock import processing error:', error);
            showAlert('Error processing Excel file', 'danger');
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

// Global showAlert fallback if not already present
if (typeof showAlert !== 'function') {
    window.showAlert = function (message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
        alertDiv.style.zIndex = '9999';
        alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        document.body.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 4000);
    };
}

