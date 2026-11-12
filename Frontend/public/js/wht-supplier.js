
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    await loadBranches();
    await loadCategories();
    await loadSuppliers();
    handleSearch(); // Initial filter

    // Branch filter auto-load
    document.getElementById('branch').addEventListener('change', handleSearch);

    // Form submission
    document.getElementById('supplierForm').addEventListener('submit', handleFormSubmit);

    // Search functionality
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));

    // Check for editParam
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('editId');
    if (editId) {
        // Wait a tick to ensure UI is ready? No, logic is synchronous after await.
        // We need to make sure allSuppliers handles searching.
        // The editSupplier function is attached to window, so we can call it.
        // But we need to make sure the row might be filtered out? 
        // editSupplier uses allSuppliers, so it's fine.

        // If on mobile, switch to form view?
        if (window.innerWidth <= 768) {
            const formPanel = document.getElementById('formPanelWrapper');
            const listPanel = document.getElementById('listPanelWrapper');
            // Default is form visible usually, but let's be safe
            if (formPanel && formPanel.style.display === 'none') {
                formPanel.style.display = 'block';
                listPanel.style.display = 'none';
            }
        }

        // Call edit
        if (typeof window.editSupplier === 'function') {
            window.editSupplier(editId);
        }
    }
});

let allSuppliers = [];

// --- API Calls ---

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('branch');
            const displayInput = document.getElementById('branchDisplay');

            // If user has only one branch, show it as text instead of dropdown
            if (data.data.length === 1) {
                // Hide dropdown, show text input
                select.style.display = 'none';
                displayInput.style.display = 'block';
                displayInput.value = data.data[0].name;

                // Set the hidden select value for form submission
                select.innerHTML = '';
                const option = document.createElement('option');
                option.value = data.data[0]._id;
                option.textContent = data.data[0].name;
                option.selected = true;
                select.appendChild(option);
            } else {
                // Show dropdown, hide text input
                select.style.display = 'block';
                displayInput.style.display = 'none';

                select.innerHTML = '<option value="">Select Branch</option>';
                data.data.forEach(store => {
                    const option = document.createElement('option');
                    option.value = store._id;
                    option.textContent = store.name;
                    select.appendChild(option);
                });
            }
        }
    } catch (err) {
        console.error('Error loading branches:', err);
    }
}

let allCategories = [];

async function loadCategories() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/supplier-categories?type=wht_supplier', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            allCategories = data.data;
            const select = document.getElementById('category');
            select.innerHTML = '<option value="">Select Supplier Category</option>';

            const seenNames = new Set();
            allCategories.forEach(cat => {
                // Skip if duplicate name
                if (seenNames.has(cat.name.trim())) return;
                seenNames.add(cat.name.trim());

                const opt = document.createElement('option');
                opt.value = cat._id;
                opt.textContent = cat.name;
                select.appendChild(opt);
            });

            renderCategoryModalList();
        }
    } catch (err) {
        console.error('Error loading categories:', err);
    }
}

async function loadSuppliers() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/suppliers?limit=10000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            allSuppliers = data.data;
            renderSupplierTable(allSuppliers);
            handleSearch(); // Ensure totals and filtering are applied
        }
    } catch (err) {
        console.error('Error loading suppliers:', err);
    }
}

// --- Logic ---

function renderSupplierTable(suppliers) {
    const tbody = document.getElementById('supplierTableBody');
    tbody.innerHTML = '';

    // Update count in heading
    const title = document.querySelector('.list-container h6');
    if (title) {
        title.innerHTML = `Supplier List <span class="badge bg-primary ms-2">${suppliers.length} Records</span>`;
    }

    suppliers.forEach((sup, index) => {
        const tr = document.createElement('tr');
        if (sup.isActive) tr.classList.add('active-row');

        // Check rights for row-level delete button
        const user = getCurrentUser();
        const canDelete = user?.role === 'admin' || user?.rights?.delete_wht_supplier;

        tr.innerHTML = `
            <td class="text-center">${index + 1}</td>
            <td class="text-start fw-bold">${sup.name}</td>
            <td class="text-center">${sup.category ? sup.category.name : '-'}</td>
            <td class="text-center">${sup.subCategory || '-'}</td>
            <td class="text-center">${sup.phoneNo || '-'}</td>
            <td class="text-center">${sup.mobileNo || '-'}</td>
            <td class="text-center">${sup.ntn || '-'}</td>
            <td class="text-center">${sup.strn || '-'}</td>
            <td class="text-center">${sup.whtType || '-'}</td>
            <td class="text-end">${sup.whtPer || 0}%</td>
            <td class="text-end">${sup.advTaxPer || 0}%</td>
            <td class="text-center ${sup.isActive ? 'text-success fw-bold' : 'text-danger'}">${sup.isActive ? 'Active' : 'In-Active'}</td>
            <td class="text-center">${sup.city || '-'}</td>
            <td class="text-center">${sup.branch ? sup.branch.name : '-'}</td>
            <td class="text-center">No</td>
            <td>
                <div class="d-flex gap-1 justify-content-center">
                    <button class="btn btn-edit btn-sm" onclick="editSupplier('${sup._id}')">Edit</button>
                    ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteSupplier('${sup._id}')">Delete</button>` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('supplierId').value;
    const formData = {
        branch: document.getElementById('branch').value,
        name: document.getElementById('name').value,
        city: document.getElementById('city').value,
        email: document.getElementById('email').value,
        mobileNo: document.getElementById('mobileNo').value,
        ntn: document.getElementById('ntn').value,
        strn: document.getElementById('strn').value,
        category: document.getElementById('category').value || undefined,
        subCategory: document.getElementById('subCategory').value,
        address: document.getElementById('address').value,
        whtType: document.getElementById('whtType').value,
        whtPer: parseFloat(document.getElementById('whtPer').value) || 0,
        advTaxPer: parseFloat(document.getElementById('advTaxPer').value) || 0,
        opening: parseFloat(document.getElementById('opening').value) || 0,
        isActive: document.getElementById('isActive').checked
    };

    try {
        const token = localStorage.getItem('token');
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/v1/suppliers/${id}` : '/api/v1/suppliers';

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        const data = await res.json();
        if (data.success) {
            alert(id ? 'Supplier Updated successfully!' : 'Supplier Saved successfully!');
            clearForm();
            loadSuppliers();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (err) {
        console.error('Error saving supplier:', err);
    }
}

window.editSupplier = function (id) {
    const sup = allSuppliers.find(s => s._id === id);
    if (!sup) return;

    document.getElementById('supplierId').value = sup._id;
    document.getElementById('branch').value = sup.branch?._id || sup.branch || ''; // Handle populated or not
    document.getElementById('name').value = sup.name || '';
    document.getElementById('city').value = sup.city || 'RWP';
    document.getElementById('email').value = sup.email || '';
    document.getElementById('mobileNo').value = sup.mobileNo || '';
    document.getElementById('ntn').value = sup.ntn || '';
    document.getElementById('strn').value = sup.strn || '';
    document.getElementById('category').value = sup.category?._id || sup.category || '';
    document.getElementById('subCategory').value = sup.subCategory || '';
    document.getElementById('address').value = sup.address || '';
    document.getElementById('whtType').value = sup.whtType || 'Monthly';
    document.getElementById('whtPer').value = sup.whtPer || 0;
    document.getElementById('advTaxPer').value = sup.advTaxPer || 0;
    document.getElementById('opening').value = sup.opening || 0;
    document.getElementById('isActive').checked = sup.isActive;

    document.getElementById('saveBtn').textContent = 'Update';

    // Check rights - Show delete button only if user has permission or is admin
    const user = getCurrentUser();
    const canDelete = user?.role === 'admin' || user?.rights?.delete_wht_supplier;

    if (canDelete) {
        document.getElementById('deleteBtn').style.display = 'inline-block';
    } else {
        document.getElementById('deleteBtn').style.display = 'none';
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.deleteSupplier = async function (id) {
    const targetId = id || document.getElementById('supplierId').value;
    if (!targetId || !confirm('Are you sure you want to delete this supplier?')) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/suppliers/${targetId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            alert('Supplier Deleted!');
            if (targetId === document.getElementById('supplierId').value) {
                clearForm();
            }
            loadSuppliers();
        }
    } catch (err) {
        console.error('Error deleting:', err);
    }
}

window.clearForm = function () {
    // Get the branch info BEFORE resetting
    const branchSelect = document.getElementById('branch');
    const branchDisplay = document.getElementById('branchDisplay');
    const isSingleBranch = branchDisplay && branchDisplay.style.display !== 'none';
    const savedBranchValue = branchSelect.value;
    const savedBranchText = branchDisplay ? branchDisplay.value : '';

    // Reset the form
    document.getElementById('supplierForm').reset();
    document.getElementById('supplierId').value = '';
    document.getElementById('saveBtn').textContent = 'Save';
    document.getElementById('deleteBtn').style.display = 'none';

    // If user has only one branch (text display is visible), restore the branch info
    if (isSingleBranch) {
        // Single branch user - restore the branch value and display
        branchSelect.value = savedBranchValue;
        branchDisplay.value = savedBranchText;
        branchDisplay.style.display = 'block';
        branchSelect.style.display = 'none';
        // Keep the branch filter active
        handleSearch();
    } else {
        // Multiple branch user - reset the branch filter to show all suppliers
        branchSelect.value = '';
        handleSearch();
    }
}

function handleSearch() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const branchId = document.getElementById('branch').value;

    const filtered = allSuppliers.filter(s => {
        // Match Search Term
        const matchesTerm = s.name.toLowerCase().includes(term) ||
            (s.ntn && s.ntn.toLowerCase().includes(term)) ||
            (s.category && s.category.name && s.category.name.toLowerCase().includes(term));

        // Match Branch
        const supBranchId = s.branch?._id || s.branch || '';
        const matchesBranch = !branchId || supBranchId === branchId;

        return matchesTerm && matchesBranch;
    });

    renderSupplierTable(filtered);
}

// --- Category Popup ---

function renderCategoryModalList() {
    const tbody = document.getElementById('categoryListBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    allCategories.forEach((cat, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center">${index + 1}</td>
            <td class="fw-bold">${cat.name}</td>
            <td>
                <div class="d-flex justify-content-center gap-1">
                    <button class="btn btn-warning btn-xs" title="Edit" onclick="editCategory('${cat._id}', '${cat.name}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-xs" title="Delete" onclick="deleteCategory('${cat._id}')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.editCategory = function (id, name) {
    document.getElementById('editCategoryId').value = id;
    document.getElementById('newCategoryName').value = name;
    document.getElementById('saveCatBtn').textContent = 'Update Category';
    document.getElementById('cancelCatEditBtn').style.display = 'block';
}

window.cancelCategoryEdit = function () {
    document.getElementById('editCategoryId').value = '';
    document.getElementById('newCategoryName').value = '';
    document.getElementById('saveCatBtn').textContent = 'Save Category';
    document.getElementById('cancelCatEditBtn').style.display = 'none';
}

window.deleteCategory = async function (id) {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/supplier-categories/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            alert('Category Deleted!');
            await loadCategories();
        }
    } catch (err) {
        console.error('Error deleting category:', err);
    }
}

window.openCategoryModal = function () {
    cancelCategoryEdit(); // Reset form
    const modal = new bootstrap.Modal(document.getElementById('categoryModal'));
    modal.show();
}

window.saveCategory = async function () {
    const id = document.getElementById('editCategoryId').value;
    const name = document.getElementById('newCategoryName').value;
    if (!name) return alert('Enter category name');

    try {
        const token = localStorage.getItem('token');
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/v1/supplier-categories/${id}` : '/api/v1/supplier-categories';

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, type: 'wht_supplier' })
        });
        const data = await res.json();
        if (data.success) {
            alert(id ? 'Category Updated!' : 'Category Added!');
            cancelCategoryEdit();
            await loadCategories();
        }
    } catch (err) {
        console.error('Error saving category:', err);
    }
}

// Helpers
function isAuthenticated() {
    return localStorage.getItem('token') !== null;
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

