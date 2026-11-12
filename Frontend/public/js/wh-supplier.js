// WH Supplier Management
let suppliers = [];
let categories = [];
let supplierModal, categoryModal;

document.addEventListener('DOMContentLoaded', function () {
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    setUserName();
    supplierModal = new bootstrap.Modal(document.getElementById('supplierModal'));
    categoryModal = new bootstrap.Modal(document.getElementById('categoryModal'));

    loadCategories();
    loadSuppliers();

    // Global Shortcuts
    document.addEventListener('keydown', (e) => {
        // Alt + S: Save
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveSupplier();
        }
    });
});


// Load supplier categories
async function loadCategories() {
    try {
        const response = await fetch('/api/v1/wh-supplier-categories', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        if (data.success) {
            categories = data.data;
            const categorySelect = document.getElementById('supplierCategory');
            if (categorySelect) {
                const currentValue = categorySelect.value;
                categorySelect.innerHTML = '<option value="">Select Supplier Category</option>';
                categories.forEach(cat => {
                    if (cat.isActive) {
                        categorySelect.innerHTML += `<option value="${cat._id}">${cat.name}</option>`;
                    }
                });
                if (currentValue) categorySelect.value = currentValue;
            }

            // Update modal list
            const listBody = document.getElementById('categoryListBody');
            if (listBody) {
                listBody.innerHTML = '';
                categories.forEach(cat => {
                    listBody.innerHTML += `
                        <tr>
                            <td>${cat.name}</td>
                            <td><span class="badge ${cat.isActive ? 'bg-success' : 'bg-danger'}">${cat.isActive ? 'Active' : 'Inactive'}</span></td>
                            <td>
                                <button class="btn btn-sm btn-info py-0" onclick="editCategory('${cat._id}')"><i class="fas fa-edit fa-xs"></i></button>
                                <button class="btn btn-sm btn-danger py-0" onclick="deleteCategory('${cat._id}')"><i class="fas fa-trash fa-xs"></i></button>
                            </td>
                        </tr>
                    `;
                });
            }
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Load suppliers
async function loadSuppliers() {
    try {
        let url = '/api/v1/wh-suppliers';

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();

        if (data.success) {
            suppliers = data.data;
            renderTable();
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
        showAlert('Error loading suppliers', 'danger');
    }
}

// Render table
function renderTable() {
    const tbody = document.getElementById('suppliersTableBody');

    if (suppliers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">No suppliers found</td></tr>';
        return;
    }

    tbody.innerHTML = suppliers.map((supplier, index) => `
        <tr>
            <td class="text-center">${index + 1}</td>
            <td class="text-start">${supplier.supplierName}</td>
            <td class="text-center">${supplier.supplierCategory?.name || '-'}</td>
            <td class="text-center">${supplier.city || '-'}</td>
            <td class="text-center">${supplier.mobile || supplier.phone || '-'}</td>
            <td class="text-center">${supplier.supplierNTN || '-'}</td>
            <td class="text-center">${supplier.whtPercentage}%</td>
            <td class="text-center">${supplier.advTaxPercentage}%</td>
            <td class="text-center"><span class="badge ${supplier.isActive ? 'bg-success' : 'bg-danger'}">${supplier.isActive ? 'Active' : 'Inactive'}</span></td>
            <td class="text-center">
                <button class="btn btn-sm btn-primary" onclick="editSupplier('${supplier._id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteSupplier('${supplier._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Show add modal
async function showAddModal() {
    document.getElementById('modalTitle').textContent = 'Add WH Supplier';
    document.getElementById('supplierForm').reset();
    document.getElementById('supplierId').value = '';
    document.getElementById('isActive').checked = true;

    // Auto generate code
    try {
        const response = await fetch('/api/v1/wh-suppliers/next-code', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById('code').value = data.data;
        }
    } catch (e) { console.error('Error fetching next code:', e); }

    supplierModal.show();
}

// Edit supplier
function editSupplier(id) {
    const supplier = suppliers.find(s => s._id === id);
    if (!supplier) return;

    document.getElementById('modalTitle').textContent = 'Edit WH Supplier';
    document.getElementById('supplierId').value = supplier._id;

    // Core fields
    document.getElementById('code').value = supplier.code || '';
    document.getElementById('supplierName').value = supplier.supplierName;
    document.getElementById('supplierNTN').value = supplier.supplierNTN;
    document.getElementById('isActive').checked = supplier.isActive;

    // New fields
    document.getElementById('address').value = supplier.address || '';
    document.getElementById('city').value = supplier.city || '';
    document.getElementById('phone').value = supplier.phone || '';
    document.getElementById('mobile').value = supplier.mobile || '';
    document.getElementById('email').value = supplier.email || '';
    document.getElementById('strn').value = supplier.strn || '';
    document.getElementById('openingBalance').value = supplier.openingBalance || 0;
    document.getElementById('supplierCategory').value = supplier.supplierCategory?._id || '';

    // Tax fields
    document.getElementById('whtPercentage').value = supplier.whtPercentage;
    document.getElementById('advTaxPercentage').value = supplier.advTaxPercentage;

    supplierModal.show();
}

// Save supplier
async function saveSupplier() {
    const id = document.getElementById('supplierId').value;
    const data = {
        code: document.getElementById('code').value,
        supplierName: document.getElementById('supplierName').value,
        supplierNTN: document.getElementById('supplierNTN').value,
        isActive: document.getElementById('isActive').checked,

        // Optional string fields
        address: document.getElementById('address').value,
        city: document.getElementById('city').value,
        phone: document.getElementById('phone').value,
        mobile: document.getElementById('mobile').value,
        email: document.getElementById('email').value,
        strn: document.getElementById('strn').value,
        supplierCategory: document.getElementById('supplierCategory').value || null,

        // Numeric fields
        openingBalance: parseFloat(document.getElementById('openingBalance').value) || 0,
        whtPercentage: parseFloat(document.getElementById('whtPercentage').value) || 0,
        advTaxPercentage: parseFloat(document.getElementById('advTaxPercentage').value) || 0
    };

    console.log('Sending supplier data:', data);

    try {
        const url = id ? `/api/v1/wh-suppliers/${id}` : '/api/v1/wh-suppliers';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showAlert(result.message, 'success');
            supplierModal.hide();
            loadSuppliers();
        } else {
            console.error('Server error:', result);
            showAlert(result.error || result.message, 'danger');
        }
    } catch (error) {
        console.error('Error saving supplier:', error);
        showAlert('Error saving supplier', 'danger');
    }
}

// Delete supplier
async function deleteSupplier(id) {
    if (!confirm('Are you sure you want to delete this supplier?')) return;

    try {
        const response = await fetch(`/api/v1/wh-suppliers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        const result = await response.json();

        if (result.success) {
            showAlert(result.message, 'success');
            loadSuppliers();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) {
        console.error('Error deleting supplier:', error);
        showAlert('Error deleting supplier', 'danger');
    }
}

// Category Management
function showCategoryModal() {
    resetCategoryForm();
    categoryModal.show();
}

function resetCategoryForm() {
    document.getElementById('categoryForm').reset();
    document.getElementById('editCategoryId').value = '';
    document.getElementById('categoryModalTitle').textContent = 'Add/Manage Categories';
}

async function editCategory(id) {
    const cat = categories.find(c => c._id === id);
    if (cat) {
        document.getElementById('categoryName').value = cat.name;
        document.getElementById('categoryActive').checked = cat.isActive;
        document.getElementById('editCategoryId').value = cat._id;
        document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    }
}

// Save category
async function saveCategory() {
    const name = document.getElementById('categoryName').value.trim();
    const isActive = document.getElementById('categoryActive').checked;
    const editId = document.getElementById('editCategoryId').value;

    if (!name) {
        showAlert('Please enter category name', 'warning');
        return;
    }

    try {
        const url = editId ? `/api/v1/wh-supplier-categories/${editId}` : '/api/v1/wh-supplier-categories';
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ name, isActive })
        });

        const result = await response.json();

        if (result.success) {
            showAlert(`Category ${editId ? 'updated' : 'saved'} successfully`, 'success');
            resetCategoryForm();
            loadCategories();
        } else {
            showAlert(result.message, 'danger');
        }
    } catch (error) {
        console.error('Error saving category:', error);
        showAlert('Error saving category', 'danger');
    }
}

async function deleteCategory(id) {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
        const response = await fetch(`/api/v1/wh-supplier-categories/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if ((await response.json()).success) {
            showAlert('Category deleted successfully', 'success');
            await loadCategories();
        }
    } catch (e) { showAlert('Error deleting category', 'danger'); }
}

// Print table
function printTable() {
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>WH Suppliers</title>');
    printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #000;padding:8px;text-align:left;}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write('<h2>WH Suppliers</h2>');
    printWindow.document.write(document.getElementById('suppliersTable').outerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// Export to Excel
function exportToExcel() {
    const table = document.getElementById('suppliersTable');
    const wb = XLSX.utils.table_to_book(table);
    XLSX.writeFile(wb, 'WH_Suppliers.xlsx');
}

// Handle Excel Import
async function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                showAlert('Excel file is empty', 'warning');
                return;
            }

            if (!confirm(`Are you sure you want to import ${jsonData.length} suppliers?`)) {
                event.target.value = '';
                return;
            }

            let importCount = 0;
            let errorCount = 0;

            for (const row of jsonData) {
                // Mapping based on the headers found in "WH CUSTOMER.xlsx"
                const supplierData = {
                    code: row['Code'] || '',
                    supplierName: row['WH Customer Name'] || row['Supplier Name'] || '',
                    phone: row['Phone No'] || '',
                    mobile: row['Mobile No'] || '',
                    address: row['Address'] || '',
                    supplierNTN: row['NTN'] || row['CNIC'] || 'N/A', // NTN is required, fallback to CNIC or N/A
                    strn: row['STRN'] || '',
                    city: row['City'] || '',
                    whtPercentage: parseFloat(row['I_Tax']) || 0,
                    advTaxPercentage: parseFloat(row['S_Tax']) || 0,
                    isActive: row['Active'] !== undefined ? (row['Active'] === true || row['Active'] === 'true' || row['Active'] === 1) : true,
                    openingBalance: parseFloat(row['Opening']) || 0
                };

                // Match Category
                const catName = row['WH Customer Category'] || row['Category'];
                if (catName) {
                    const matchedCat = categories.find(c => c.name.toLowerCase() === catName.toString().toLowerCase());
                    if (matchedCat) {
                        supplierData.supplierCategory = matchedCat._id;
                    }
                }

                if (!supplierData.supplierName) {
                    console.warn('Skipping row due to missing name:', row);
                    continue;
                }

                try {
                    const response = await fetch('/api/v1/wh-suppliers', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        },
                        body: JSON.stringify(supplierData)
                    });
                    const result = await response.json();
                    if (result.success) importCount++;
                    else {
                        console.error('Failed to import row:', supplierData.supplierName, result.error);
                        errorCount++;
                    }
                } catch (err) {
                    console.error('Error importing row:', err);
                    errorCount++;
                }
            }

            showAlert(`Import completed: ${importCount} success, ${errorCount} errors`, importCount > 0 ? 'success' : 'danger');
            loadSuppliers();
            event.target.value = '';

        } catch (error) {
            console.error('Excel processing error:', error);
            showAlert('Error processing Excel file', 'danger');
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

// Show alert
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 3000);
}

// Set user name in navbar
function setUserName() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userName').textContent = user.name;
    }
}

