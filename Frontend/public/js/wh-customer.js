// WH Customer Management
let customers = [];
let categories = [];
let cities = [];
let customerTypes = [];
let customerModal, categoryModal, cityModal, customerTypeModal;

document.addEventListener('DOMContentLoaded', function () {
    // Basic Auth Check
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login';
        return;
    }

    // Initialize Modals safely
    const customerModalElem = document.getElementById('customerModal');
    const categoryModalElem = document.getElementById('categoryModal');
    const cityModalElem = document.getElementById('cityModal');
    const customerTypeModalElem = document.getElementById('customerTypeModal');

    if (customerModalElem) customerModal = new bootstrap.Modal(customerModalElem);
    if (categoryModalElem) categoryModal = new bootstrap.Modal(categoryModalElem);
    if (cityModalElem) cityModal = new bootstrap.Modal(cityModalElem);
    if (customerTypeModalElem) customerTypeModal = new bootstrap.Modal(customerTypeModalElem);

    setUserName();
    loadCategories();
    loadCities();
    loadCustomerTypes();
    loadCustomers();

    // Global Shortcuts
    document.addEventListener('keydown', (e) => {
        // Alt + S: Save
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveCustomer();
        }
    });
});

// Set user name safely
function setUserName() {
    try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            const userNameElem = document.getElementById('userName');
            if (userNameElem && user && user.name) {
                userNameElem.textContent = user.name;
            }
        }
    } catch (e) {
        console.error('Error setting username:', e);
    }
}


// Load categories
async function loadCategories() {
    try {
        const response = await fetch('/api/v1/wh-customer-categories', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            categories = data.data;
            const select = document.getElementById('customerCategory');
            if (select) {
                const currentValue = select.value;
                const userStr = localStorage.getItem('user');
                const user = userStr ? JSON.parse(userStr) : null;
                const allowedWHCustomerCategories = (user && user.allowedWHCustomerCategories && user.allowedWHCustomerCategories.length > 0) ? user.allowedWHCustomerCategories : null;

                select.innerHTML = '<option value="">Select Category</option>';
                categories.forEach(cat => {
                    if (cat.isActive) {
                        if (!allowedWHCustomerCategories || allowedWHCustomerCategories.includes(cat._id)) {
                            select.innerHTML += `<option value="${cat._id}">${cat.name}</option>`;
                        }
                    }
                });
                if (currentValue) select.value = currentValue;
            }

            // Also update the list in the Category Modal
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
    } catch (error) { console.error('Error loading categories:', error); }
}

// Load cities
async function loadCities() {
    try {
        const response = await fetch('/api/v1/wh-cities', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            cities = data.data;
            const select = document.getElementById('city');
            if (select) {
                select.innerHTML = '<option value="">Select City</option>';
                cities.forEach(city => {
                    select.innerHTML += `<option value="${city._id}">${city.name}</option>`;
                });
            }
        }
    } catch (error) { console.error('Error loading cities:', error); }
}

// Load customer types
async function loadCustomerTypes() {
    try {
        const response = await fetch('/api/v1/wh-customer-types', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            customerTypes = data.data;
            const select = document.getElementById('customerType');
            if (select) {
                select.innerHTML = '<option value="">Select Type</option>';
                customerTypes.forEach(type => {
                    select.innerHTML += `<option value="${type._id}">${type.name}</option>`;
                });
            }
        }
    } catch (error) { console.error('Error loading types:', error); }
}

// Load customers
async function loadCustomers() {
    try {
        const url = '/api/v1/wh-customers';
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            customers = data.data;

            // Filter by allowed categories
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user && user.allowedWHCustomerCategories && user.allowedWHCustomerCategories.length > 0) {
                const allowed = user.allowedWHCustomerCategories;
                customers = customers.filter(c => {
                    const catId = typeof c.customerCategory === 'object' ? c.customerCategory?._id : c.customerCategory;
                    return allowed.includes(catId);
                });
            }

            renderTable();
        }
    } catch (error) {
        console.error('Error loading customers:', error);
        showAlert('Error loading customers', 'danger');
    }
}

// Render Table
function renderTable(data = customers) {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center">No customers found</td></tr>';
        return;
    }

    tbody.innerHTML = data.map((customer) => `
        <tr>
            <td class="text-center">${customer.code || '-'}</td>
            <td class="text-start">${customer.customerName}</td>
            <td class="text-center">${customer.customerCategory?.name || '-'}</td>
            <td class="text-center">${customer.city?.name || '-'}</td>
            <td class="text-center">${customer.mobile || customer.phone || '-'}</td>
            <td class="text-end fw-bold">${(customer.openingBalance || 0).toLocaleString()}</td>
            <td class="text-end fw-bold text-primary">${(customer.currentBalance || 0).toLocaleString()}</td>
            <td class="text-center">${customer.customerNTN || '-'}</td>
            <td class="text-center">${customer.whtPercentage}%</td>
            <td class="text-center">${customer.advTaxPercentage}%</td>
            <td class="text-center"><span class="badge ${customer.isActive ? 'bg-success' : 'bg-danger'}">${customer.isActive ? 'Active' : 'Inactive'}</span></td>
            <td class="text-center">
                <button class="btn btn-sm btn-primary" onclick="editCustomer('${customer._id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteCustomer('${customer._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Global Filter Table
function filterTable() {
    const query = document.getElementById('searchCustomer').value.toLowerCase().trim();
    if (!query) {
        renderTable(customers);
        return;
    }

    const filtered = customers.filter(c =>
        (c.customerName && c.customerName.toLowerCase().includes(query)) ||
        (c.code && c.code.toString().toLowerCase().includes(query)) ||
        (c.mobile && c.mobile.toString().toLowerCase().includes(query)) ||
        (c.phone && c.phone.toString().toLowerCase().includes(query)) ||
        (c.customerNTN && c.customerNTN.toString().toLowerCase().includes(query))
    );

    renderTable(filtered);
}

// Show Add Modal
async function showAddModal() {
    document.getElementById('modalTitle').textContent = 'Add WH Customer';
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';

    // Auto generate code
    try {
        const response = await fetch('/api/v1/wh-customers/next-code', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById('code').value = data.data;
        }
    } catch (e) { console.error('Error fetching next code:', e); }

    customerModal.show();
}

// Edit Customer
async function editCustomer(id) {
    try {
        const response = await fetch(`/api/v1/wh-customers/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success) {
            const customer = data.data;
            document.getElementById('modalTitle').textContent = 'Edit WH Customer';
            document.getElementById('customerId').value = customer._id;
            document.getElementById('code').value = customer.code || '';
            document.getElementById('customerName').value = customer.customerName;
            document.getElementById('customerNTN').value = customer.customerNTN;
            document.getElementById('strn').value = customer.strn || '';
            document.getElementById('cnic').value = customer.cnic || '';
            document.getElementById('mobile').value = customer.mobile || '';
            document.getElementById('phone').value = customer.phone || '';
            document.getElementById('address').value = customer.address || '';
            document.getElementById('customerCategory').value = customer.customerCategory?._id || customer.customerCategory || '';
            document.getElementById('city').value = customer.city?._id || customer.city || '';
            document.getElementById('customerType').value = customer.customerType?._id || customer.customerType || '';
            document.getElementById('province').value = customer.province || '';
            document.getElementById('iTax').value = customer.iTax || '';
            document.getElementById('sTax').value = customer.sTax || '';
            document.getElementById('openingBalance').value = customer.openingBalance || 0;
            document.getElementById('creditLimit').value = customer.creditLimit || 0;
            document.getElementById('whtPercentage').value = customer.whtPercentage || 0;
            document.getElementById('advTaxPercentage').value = customer.advTaxPercentage || 0;
            document.getElementById('isActive').checked = customer.isActive;
            document.getElementById('isCash').checked = customer.isCash || false;
            customerModal.show();
        }
    } catch (error) { console.error('Error fetching customer:', error); }
}

// Save Customer
async function saveCustomer() {
    const id = document.getElementById('customerId').value;
    const formData = {
        code: document.getElementById('code').value,
        customerName: document.getElementById('customerName').value,
        customerNTN: document.getElementById('customerNTN').value,
        strn: document.getElementById('strn').value,
        cnic: document.getElementById('cnic').value,
        mobile: document.getElementById('mobile').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value,
        customerCategory: document.getElementById('customerCategory').value || null,
        city: document.getElementById('city').value || null,
        customerType: document.getElementById('customerType').value || null,
        province: document.getElementById('province').value,
        iTax: document.getElementById('iTax').value,
        sTax: document.getElementById('sTax').value,
        openingBalance: parseFloat(document.getElementById('openingBalance').value) || 0,
        creditLimit: parseFloat(document.getElementById('creditLimit').value) || 0,
        whtPercentage: parseFloat(document.getElementById('whtPercentage').value) || 0,
        advTaxPercentage: parseFloat(document.getElementById('advTaxPercentage').value) || 0,
        isActive: document.getElementById('isActive').checked,
        isCash: document.getElementById('isCash').checked
    };

    if (!formData.customerName || !formData.customerNTN) {
        return showAlert('Please fill all required fields', 'warning');
    }

    try {
        const url = id ? `/api/v1/wh-customers/${id}` : '/api/v1/wh-customers';
        const method = id ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify(formData)
        });
        const result = await response.json();
        if (result.success) {
            showAlert(`Customer ${id ? 'updated' : 'added'} successfully`, 'success');
            customerModal.hide();
            await loadCustomers();
        } else {
            showAlert(result.message || result.error || 'Error saving customer', 'danger');
        }
    } catch (error) { showAlert('Error saving customer', 'danger'); }
}

// Delete Customer
async function deleteCustomer(id) {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    try {
        const response = await fetch(`/api/v1/wh-customers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            showAlert('Customer deleted', 'success');
            await loadCustomers();
        }
    } catch (error) { showAlert('Error deleting customer', 'danger'); }
}

async function syncAllBalances() {
    if (!confirm('This will recalculate all customer balances from their ledgers. Continue?')) return;

    try {
        const response = await fetch('/api/v1/wh-customers/sync-all', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            showAlert(result.message, 'success');
            await loadCustomers();
        }
    } catch (e) { showAlert('Error syncing balances', 'danger'); }
}

// Handle Category/City/Type Modals
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

async function saveCategory() {
    const name = document.getElementById('categoryName').value;
    const isActive = document.getElementById('categoryActive').checked;
    const editId = document.getElementById('editCategoryId').value;

    if (!name) return showAlert('Enter name', 'warning');

    try {
        const url = editId ? `/api/v1/wh-customer-categories/${editId}` : '/api/v1/wh-customer-categories';
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ name, isActive })
        });
        if ((await response.json()).success) {
            showAlert(`Category ${editId ? 'updated' : 'saved'} successfully`, 'success');
            resetCategoryForm();
            await loadCategories();
        }
    } catch (e) { showAlert('Error saving category', 'danger'); }
}

async function deleteCategory(id) {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
        const response = await fetch(`/api/v1/wh-customer-categories/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if ((await response.json()).success) {
            showAlert('Category deleted successfully', 'success');
            await loadCategories();
        }
    } catch (e) { showAlert('Error deleting category', 'danger'); }
}

function showCityModal() { cityModal.show(); }
async function saveCity() {
    const name = document.getElementById('cityName').value;
    if (!name) return showAlert('Enter name', 'warning');
    try {
        const response = await fetch('/api/v1/wh-cities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ name })
        });
        if ((await response.json()).success) {
            cityModal.hide();
            await loadCities();
        }
    } catch (e) { showAlert('Error', 'danger'); }
}

function showCustomerTypeModal() { customerTypeModal.show(); }
async function saveCustomerType() {
    const name = document.getElementById('typeName').value;
    if (!name) return showAlert('Enter name', 'warning');
    try {
        const response = await fetch('/api/v1/wh-customer-types', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ name })
        });
        if ((await response.json()).success) {
            customerTypeModal.hide();
            await loadCustomerTypes();
        }
    } catch (e) { showAlert('Error', 'danger'); }
}

// Helpers
function showAlert(message, type) {
    const div = document.createElement('div');
    div.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    div.style.zIndex = '9999';
    div.innerHTML = `${message} <button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function printTable() {
    const win = window.open('', '', 'height=600,width=800');
    win.document.write('<html><head><title>Print</title></head><body>');
    win.document.write(document.getElementById('customersTable').outerHTML);
    win.document.write('</body></html>');
    win.document.close(); win.print();
}

function exportToExcel() {
    const wb = XLSX.utils.table_to_book(document.getElementById('customersTable'));
    XLSX.writeFile(wb, 'Customers.xlsx');
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

            if (!confirm(`Are you sure you want to import ${jsonData.length} customers?`)) {
                event.target.value = '';
                return;
            }

            let importCount = 0;
            let errorCount = 0;

            for (const row of jsonData) {
                // Mapping based on the headers in "WH CUSTOMER.xlsx"
                const customerData = {
                    code: row['Code'] || '',
                    customerName: row['WH Customer Name'] || row['Customer Name'] || '',
                    phone: row['Phone No'] || '',
                    mobile: row['Mobile No'] || '',
                    address: row['Address'] || '',
                    customerNTN: row['NTN'] || row['CNIC'] || 'N/A', // NTN is required
                    strn: row['STRN'] || '',
                    cnic: row['CNIC'] || '',
                    province: row['Province'] || '',
                    iTax: row['I_Tax'] || '',
                    sTax: row['S_Tax'] || '',
                    openingBalance: parseFloat(row['Opening']) || 0,
                    creditLimit: parseFloat(row['CLimit']) || 0,
                    isActive: row['Active'] !== undefined ? (row['Active'] === true || row['Active'] === 'true' || row['Active'] === 1) : true,
                    isCash: false
                };

                // Match Category
                const catName = row['WH Customer Category'] || row['Category'];
                if (catName) {
                    const matchedCat = categories.find(c => c.name.toLowerCase() === catName.toString().toLowerCase());
                    if (matchedCat) {
                        customerData.customerCategory = matchedCat._id;
                    }
                }

                // Match City
                const cityName = row['City'];
                if (cityName) {
                    const matchedCity = cities.find(c => c.name.toLowerCase() === cityName.toString().toLowerCase());
                    if (matchedCity) {
                        customerData.city = matchedCity._id;
                    }
                }

                if (!customerData.customerName) {
                    console.warn('Skipping row due to missing name:', row);
                    continue;
                }

                try {
                    const response = await fetch('/api/v1/wh-customers', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        },
                        body: JSON.stringify(customerData)
                    });
                    const result = await response.json();
                    if (result.success) importCount++;
                    else {
                        console.error('Failed to import row:', customerData.customerName, result.error || result.message);
                        errorCount++;
                    }
                } catch (err) {
                    console.error('Error importing row:', err);
                    errorCount++;
                }
            }

            showAlert(`Import completed: ${importCount} success, ${errorCount} errors`, importCount > 0 ? 'success' : 'danger');
            loadCustomers();
            event.target.value = '';

        } catch (error) {
            console.error('Excel processing error:', error);
            showAlert('Error processing Excel file', 'danger');
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

