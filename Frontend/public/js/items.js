// Items Management JavaScript - Desktop UI Version
document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    // Set user name
    setUserName();

    // Initialize items page
    initItemsPage();
});

// Set user name
function setUserName() {
    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.name || user.email;
    }
}

// Initialize items page
function initItemsPage() {
    // Load items
    loadItems();

    // Load all dropdowns
    loadCategories();
    loadCompanies();
    loadSuppliers();
    loadClasses();
    loadSubclasses();
    loadUnits();

    // Event listeners for global search
    document.getElementById('searchInput').addEventListener('input', DesktopUI.debounce(handleGlobalSearch, 300));

    // Event listeners for Cost % calculation
    document.getElementById('incentive').addEventListener('input', calculateCostPercent);
    document.getElementById('purchasePrice').addEventListener('input', calculateCostPercent);

    // Setup Autocomplete for Search By Name
    setupNameAutocomplete();


}

// Setup Autocomplete
function setupNameAutocomplete() {
    const input = document.getElementById('searchByName');

    // Create dropdown wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'position-relative';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const list = document.createElement('div');
    list.className = 'autocomplete-list list-group position-absolute w-100 shadow';
    list.style.zIndex = '1000';
    list.style.display = 'none';
    list.style.maxHeight = '200px';
    list.style.overflowY = 'auto';
    wrapper.appendChild(list);

    let currentFocus = -1;
    let debounceTimer; // Fix: Define debounceTimer

    input.addEventListener('keydown', function (e) {
        const items = list.getElementsByTagName('a');
        if (e.key === 'ArrowDown') {
            currentFocus++;
            addActive(items);
        } else if (e.key === 'ArrowUp') {
            currentFocus--;
            addActive(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1) {
                if (items[currentFocus]) items[currentFocus].click();
            } else if (items.length > 0) {
                // If no specific item selected but list exists, select first
                items[0].click();
            }
        }
    });

    function addActive(items) {
        if (!items || items.length === 0) return false; // Fix: Check for empty items
        removeActive(items);
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (items.length - 1);
        items[currentFocus].classList.add('active');
        items[currentFocus].scrollIntoView({ block: 'nearest' });
    }

    function removeActive(items) {
        for (let i = 0; i < items.length; i++) {
            items[i].classList.remove('active');
        }
    }

    input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        const term = this.value.trim();
        currentFocus = -1;

        if (term.length < 2) {
            list.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`/api/v1/items?search=${term}&limit=10`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    const items = data.data;

                    list.innerHTML = '';
                    if (items.length > 0) {
                        items.forEach(item => {
                            const itemEl = document.createElement('a');
                            itemEl.href = '#';
                            itemEl.className = 'list-group-item list-group-item-action py-2';
                            itemEl.innerHTML = `
                                <div class="d-flex justify-content-between align-items-center">
                                    <strong>${item.name}</strong>
                                    <small class="text-muted">${item.sku || ''}</small>
                                </div>
                            `;
                            itemEl.onclick = (e) => {
                                e.preventDefault();
                                editItem(item._id);
                                input.value = ''; // Clear search
                                list.style.display = 'none';
                            };
                            list.appendChild(itemEl);
                        });
                        list.style.display = 'block';
                    } else {
                        list.style.display = 'none';
                    }
                }
            } catch (err) {
                console.error(err);
            }
        }, 300);
    });

    // Close on click outside
    document.addEventListener('click', function (e) {
        if (e.target !== input && e.target !== list) {
            list.style.display = 'none';
        }
    });
}

// Global search - searches by barcode OR name
async function handleGlobalSearch() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) {
        loadItems();
        return;
    }

    try {
        // showLoading(); // Don't show loading for debounce typing
        const token = localStorage.getItem('token');

        // Search by both barcode and name
        const response = await fetch(`/api/v1/items?search=${searchTerm}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            displayItems(data.data);
            updatePagination(data.pagination);
        }
    } catch (error) {
        console.error('Error searching items:', error);
        // showError('Failed to search items');
    } finally {
        // hideLoading();
    }
}

// Search by barcode (in form)
async function searchByBarcode() {
    const barcode = document.getElementById('searchBarcode').value.trim();
    if (!barcode) return;

    try {
        showLoading();
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/items?barcode=${barcode}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                editItem(data.data[0]._id);
                document.getElementById('searchBarcode').value = '';
            } else {
                showError('Item not found with this barcode');
            }
        }
    } catch (error) {
        console.error('Error searching by barcode:', error);
        showError('Failed to search by barcode');
    } finally {
        hideLoading();
    }
}

// Search by name (in form)
async function searchByName() {
    const name = document.getElementById('searchByName').value.trim();
    if (!name) return;

    try {
        showLoading();
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/items?search=${name}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                editItem(data.data[0]._id);
                document.getElementById('searchByName').value = '';
            } else {
                showError('Item not found with this name');
            }
        }
    } catch (error) {
        console.error('Error searching by name:', error);
        showError('Failed to search by name');
    } finally {
        hideLoading();
    }
}

// Load items from API
async function loadItems(page = 1, limit = 10) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const search = document.getElementById('searchInput').value;

        // Build query parameters
        let queryParams = `?page=${page}&limit=${limit}`;
        if (search) queryParams += `&search=${search}`;

        const response = await fetch(`/api/v1/items${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayItems(data.data);
            updatePagination(data.pagination);
        } else {
            throw new Error('Failed to load items');
        }
    } catch (error) {
        console.error('Error loading items:', error);
        showError('Failed to load items');
    } finally {
        hideLoading();
    }
}

// Display items in table
function displayItems(items) {
    const tbody = document.getElementById('itemsTableBody');

    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">No items found</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => {
        // Handle potential object or string for related fields
        const getVal = (field) => field ? (field.name || field) : '-';

        // Calculate Cost % = (incentive / purchasePrice) * 100
        let costPercent = 0;
        if (item.purchasePrice && item.purchasePrice > 0) {
            costPercent = ((item.incentive || 0) / item.purchasePrice) * 100;
        }

        return `
        <tr>
            <td>${item.sku || '-'}</td>
            <td>${item.name}</td>
            <td>${item.category || '-'}</td>
            <td>${getVal(item.class)}</td>
            <td>${getVal(item.subclass)}</td>
            <td>${getVal(item.supplier)}</td>
            <td class="text-right">${DesktopUI.formatNumber(item.salePrice || 0)}</td>
            <td class="text-right">${costPercent.toFixed(2)}%</td>
            <td class="text-center">${item.stockQty || 0}</td>
            <td class="text-center">${item.unit || 'PCS'}</td>
            <td class="text-center">
                <button class="icon-btn" onclick="editItem('${item._id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="icon-btn danger" onclick="deleteItem('${item._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

// Load categories (only item categories)
async function loadCategories() {
    try {
        const token = localStorage.getItem('token');
        // Use dedicated item-categories API endpoint
        const response = await fetch('/api/v1/item-categories', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            // Populate dropdown using Name as the value (since Item model uses String for category)
            DesktopUI.populateDropdown('category', data.data || [], 'name', 'name');
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Load companies
async function loadCompanies() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/companies', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            DesktopUI.populateDropdown('company', data.data || [], '_id', 'name');
        }
    } catch (error) {
        console.error('Error loading companies:', error);
    }
}

// Load suppliers
async function loadSuppliers() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/parties?partyType=supplier', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            DesktopUI.populateDropdown('supplier', data.data || [], '_id', 'name');
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

// Load classes
async function loadClasses() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/classes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            DesktopUI.populateDropdown('class', data.data || [], '_id', 'name');
        }
    } catch (error) {
        console.error('Error loading classes:', error);
    }
}

// Load subclasses
async function loadSubclasses() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/subclasses', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            DesktopUI.populateDropdown('subclass', data.data || [], '_id', 'name');
        }
    } catch (error) {
        console.error('Error loading subclasses:', error);
    }
}

// Load units
async function loadUnits() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/units/active', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            // Use ShortName (Symbol) as value if available, else Name
            const units = (data.data || []).map(u => ({
                ...u,
                _displayValue: u.shortName || u.name
            }));
            DesktopUI.populateDropdown('unit', units, '_displayValue', 'name');
        }
    } catch (error) {
        console.error('Error loading units:', error);
    }
}

// Capitalize first letter
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Calculate Cost % = (Incentive / Cost Price) * 100
function calculateCostPercent() {
    const incentive = parseFloat(document.getElementById('incentive').value) || 0;
    const costPrice = parseFloat(document.getElementById('purchasePrice').value) || 0;

    let costPercent = 0;
    if (costPrice > 0) {
        costPercent = (incentive / costPrice) * 100;
    }

    // Display the calculated Cost %
    const costPercentField = document.getElementById('costPercent');
    if (costPercentField) {
        costPercentField.value = costPercent.toFixed(2);
    }
}

// Save item
async function saveItem() {
    try {
        // Validate form
        if (!DesktopUI.validateForm('itemForm')) {
            return;
        }

        // Explicit validation for Category (since it's a critical required field)
        const category = document.getElementById('category').value;
        if (!category) {
            showError('Please select a category');
            document.getElementById('category').focus();
            return;
        }

        showLoading();

        const token = localStorage.getItem('token');
        const itemId = document.getElementById('itemId').value;

        const formData = {
            name: document.getElementById('name').value,
            sku: document.getElementById('sku').value,
            category: document.getElementById('category').value,
            barcode: document.getElementById('barcode').value,
            // Add new relations
            company: document.getElementById('company').value || null,
            class: document.getElementById('class').value || null,
            subclass: document.getElementById('subclass').value || null,
            supplier: document.getElementById('supplier').value || null,

            purchasePrice: parseFloat(document.getElementById('purchasePrice').value) || 0,
            salePrice: parseFloat(document.getElementById('salePrice').value) || 0,
            retailPrice: parseFloat(document.getElementById('retailPrice').value) || 0,
            incentive: parseFloat(document.getElementById('incentive').value) || 0,
            stockQty: parseInt(document.getElementById('stockQuantity').value) || 0,
            openingStock: parseInt(document.getElementById('openingStock').value) || 0, // Ensure this saved if schema has it
            minStockLevel: parseInt(document.getElementById('minStockLevel').value) || 10,
            unit: document.getElementById('unit').value,
            taxPercent: parseFloat(document.getElementById('taxPercent').value) || 0,
            description: document.getElementById('description').value,
            isActive: document.getElementById('isActive').checked
        };

        const url = itemId ? `/api/v1/items/${itemId}` : '/api/v1/items';
        const method = itemId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            // ...
            // Note: Reusing existing fetch block in original file via partial match if possible or replacing whole function
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            showSuccess(itemId ? 'Item updated successfully' : 'Item created successfully');
            // Keep classification selections when creating a new item
            clearForm(!itemId);
            loadItems();
        } else {
            let errMsg = 'Failed to save item';
            try {
                const err = await response.json();
                const detailed =
                    (typeof err.error === 'string' ? err.error : null) ||
                    (Array.isArray(err.error) ? err.error.join(', ') : null) ||
                    (err.message ? err.message : null) ||
                    (Array.isArray(err.errors) ? err.errors.map(e => e.message).join(', ') : null);
                if (detailed) errMsg = detailed;
                if (response.status === 400 && err && err.error === 'Duplicate field value entered') {
                    errMsg = 'Duplicate value. Please use a unique SKU or leave it blank to auto-generate.';
                }
                console.error('Item save failed:', { status: response.status, error: err, payload: formData });
            } catch (parseErr) {
                const text = await response.text();
                console.error('Item save failed:', { status: response.status, error: text, payload: formData });
            }
            showError(errMsg);
        }
    } catch (error) {
        console.error('Error saving item:', error);
        showError('Failed to save item');
    } finally {
        hideLoading();
    }
}

// Edit item
async function editItem(itemId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/items/${itemId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const item = data.data;

            // Populate form
            document.getElementById('itemId').value = item._id;
            document.getElementById('autoId').value = item._id.substring(0, 8);
            document.getElementById('name').value = item.name || '';
            document.getElementById('sku').value = item.sku || '';
            document.getElementById('category').value = item.category || '';
            // Populate relations (handle both object populates and direct IDs)
            document.getElementById('company').value = (item.company && item.company._id) ? item.company._id : (item.company || '');
            document.getElementById('class').value = (item.class && item.class._id) ? item.class._id : (item.class || '');
            document.getElementById('subclass').value = (item.subclass && item.subclass._id) ? item.subclass._id : (item.subclass || '');
            document.getElementById('supplier').value = (item.supplier && item.supplier._id) ? item.supplier._id : (item.supplier || '');

            document.getElementById('barcode').value = item.barcode || '';
            document.getElementById('purchasePrice').value = item.purchasePrice || 0;
            document.getElementById('salePrice').value = item.salePrice || 0;
            document.getElementById('retailPrice').value = item.retailPrice || 0;
            document.getElementById('incentive').value = item.incentive || 0;
            // Calculate and display Cost %
            calculateCostPercent();
            document.getElementById('stockQuantity').value = item.stockQty || 0;
            document.getElementById('openingStock').value = item.openingStock || 0;
            // Lock opening stock for existing items
            document.getElementById('openingStock').readOnly = true;

            document.getElementById('minStockLevel').value = item.minStockLevel || 10;
            document.getElementById('unit').value = item.unit || 'pcs';
            document.getElementById('taxPercent').value = item.taxPercent || 0;
            document.getElementById('description').value = item.description || '';
            document.getElementById('isActive').checked = item.isActive !== false;

            // Scroll to form
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Focus on name field
            document.getElementById('name').focus();
        } else {
            showError('Failed to load item data');
        }
    } catch (error) {
        console.error('Error loading item:', error);
        showError('Failed to load item data');
    } finally {
        hideLoading();
    }
}

// Delete item
async function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/items/${itemId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showSuccess('Item deleted successfully');
            loadItems();
        } else {
            showError('Failed to delete item');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        showError('Failed to delete item');
    } finally {
        hideLoading();
    }
}

// Clear form
function clearForm(keepSelections = false) {
    const savedCompany = keepSelections ? document.getElementById('company').value : '';
    const savedCategory = keepSelections ? document.getElementById('category').value : '';
    const savedClass = keepSelections ? document.getElementById('class').value : '';
    const savedSubclass = keepSelections ? document.getElementById('subclass').value : '';
    const savedSupplier = keepSelections ? document.getElementById('supplier').value : '';
    const savedUnit = keepSelections ? document.getElementById('unit').value : '';

    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('autoId').value = '';
    document.getElementById('isActive').checked = true;
    DesktopUI.clearValidationErrors('itemForm');

    // Restore persistent classification selections for fast item entry
    if (keepSelections) {
        if (savedCompany) document.getElementById('company').value = savedCompany;
        if (savedCategory) document.getElementById('category').value = savedCategory;
        if (savedClass) document.getElementById('class').value = savedClass;
        if (savedSubclass) document.getElementById('subclass').value = savedSubclass;
        if (savedSupplier) document.getElementById('supplier').value = savedSupplier;
        if (savedUnit) document.getElementById('unit').value = savedUnit;
    }

    // Focus on name field
    setTimeout(() => {
        const nameInput = document.getElementById('name');
        if (nameInput) nameInput.focus();
    }, 100);

    // Enable Opening Stock for new items
    document.getElementById('openingStock').readOnly = false;
}

// Reset filters
function resetFilters() {
    document.getElementById('searchInput').value = '';
    loadItems();
}

// Show items list (scroll to table)
function showItemsList() {
    const table = document.getElementById('itemsTable');
    if (table) {
        table.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Print items
function printItems() {
    DesktopUI.printElement('itemsTable');
}

// Update pagination
function updatePagination(pagination) {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer || !pagination) return;

    const { page, pages, total } = pagination;

    if (pages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '<nav><ul class="pagination justify-content-center">';

    // Previous button
    paginationHTML += `
        <li class="page-item ${page === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadItems(${page - 1}); return false;">Previous</a>
        </li>
    `;

    // Page numbers
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= page - 2 && i <= page + 2)) {
            paginationHTML += `
                <li class="page-item ${i === page ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="loadItems(${i}); return false;">${i}</a>
                </li>
            `;
        } else if (i === page - 3 || i === page + 3) {
            paginationHTML += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }

    // Next button
    paginationHTML += `
        <li class="page-item ${page === pages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadItems(${page + 1}); return false;">Next</a>
        </li>
    `;

    paginationHTML += '</ul></nav>';
    paginationContainer.innerHTML = paginationHTML;
}

