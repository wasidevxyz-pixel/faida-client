// Parties Management JavaScript
console.log('Parties.js Version: 106 loaded');
let currentPage = 1;
let currentLimit = 10;

document.addEventListener('DOMContentLoaded', function () {
    console.log('Parties.js: DOMContentLoaded');
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    // Set user name
    setUserName();

    // Initialize parties page
    initPartiesPage();
});

// Load Branches
async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');
        let user = null;
        if (userStr) {
            try { user = JSON.parse(userStr); } catch (e) { console.error('Error parsing user', e); }
        }

        const response = await fetch('/api/v1/stores', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) {
            let allBranches = data.data; // Changed to `let` for reassignment

            // Permission Filter
            // If user is not admin, filter branches
            if (user && user.role !== 'admin' && user.branch && Array.isArray(user.branch) && user.branch.length > 0) {
                // user.branch is likely an array of IDs or Names
                allBranches = allBranches.filter(b => user.branch.includes(b._id) || user.branch.includes(b.name));
            } else if (user && user.role !== 'admin' && user.branch && typeof user.branch === 'string') {
                // Handle legacy single branch case
                allBranches = allBranches.filter(b => b._id === user.branch || b.name === user.branch);
            }

            // Populate form branch dropdown (assuming 'branch' is the ID for the form's branch select)
            const branchSelect = document.getElementById('branch');
            if (branchSelect) {
                const currentVal = branchSelect.value;
                branchSelect.innerHTML = '<option value="">Select Branch</option>';
                allBranches.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.name;
                    opt.textContent = b.name;
                    branchSelect.appendChild(opt);
                });
                if (allBranches.length === 1) {
                    branchSelect.value = allBranches[0].name;
                    branchSelect.dispatchEvent(new Event('change'));
                } else if (currentVal) {
                    branchSelect.value = currentVal;
                }
            }

            const selects = document.querySelectorAll('.branch-select');
            selects.forEach(sel => {
                const currentVal = sel.value;
                sel.innerHTML = '<option value="">Select Branch</option>'; // Or PWD-1 as default if needed
                allBranches.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.name;
                    opt.textContent = b.name;
                    sel.appendChild(opt);
                });

                // Default to first if only one available
                // IMPORTANT: If we filtered down to 1 (restricted user), auto-select it.
                if (allBranches.length === 1) {
                    sel.value = allBranches[0].name;
                    sel.dispatchEvent(new Event('change'));
                }
            });

            // Also populate branch filter dropdown
            const branchFilter = document.getElementById('branchFilter');
            if (branchFilter) {
                branchFilter.innerHTML = '<option value="">All Branches</option>';
                allBranches.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.name;
                    opt.textContent = b.name;
                    branchFilter.appendChild(opt);
                });
            }
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

// Set user name in header
function setUserName() {
    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.name || user.email;
    }
}

// Initialize parties page
function initPartiesPage() {
    console.log('Parties.js: initPartiesPage called');
    loadBranches(); // Load branches on init

    // Disable category dropdown initially (no type selected)
    initializeCategoryDropdown();

    // Load parties
    loadParties();

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('branchFilter').addEventListener('change', loadParties);
    document.getElementById('partyTypeFilter').addEventListener('change', loadParties);
    document.getElementById('balanceFilter').addEventListener('change', loadParties);

    // Event listener for party type change to reload categories AND generate code
    document.getElementById('partyType').addEventListener('change', function () {
        loadCategories(this.value);
        generatePartyCode(); // Rerun generation on type change
    });

    // Auto-generate party code
    generatePartyCode();
}

// Initialize category dropdown and + button as disabled
function initializeCategoryDropdown() {
    const categorySelect = document.getElementById('category');
    const addCategoryBtn = document.getElementById('addCategoryBtn');

    categorySelect.innerHTML = '<option value="">-- Select Type First --</option>';
    categorySelect.disabled = true;
    categorySelect.style.opacity = '0.6';
    categorySelect.style.cursor = 'not-allowed';

    // Also disable the + button
    if (addCategoryBtn) {
        addCategoryBtn.disabled = true;
        addCategoryBtn.style.opacity = '0.6';
        addCategoryBtn.style.cursor = 'not-allowed';
    }
}

// Generate party code
// Generate party code based on TYPE
async function generatePartyCode() {
    try {
        const token = localStorage.getItem('token');
        const partyType = document.getElementById('partyType').value || 'customer'; // Default to customer if not set
        const prefix = partyType === 'supplier' ? 'SUPP' : 'CUST';

        // Fetch latest party of THIS specific type
        const response = await fetch(`/api/v1/parties?partyType=${partyType}&limit=1&sort=-createdAt`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let newCode = `${prefix}-001`;

        if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                const lastParty = data.data[0];
                // Check if lastParty code matches our expected prefix format
                if (lastParty.code && lastParty.code.startsWith(prefix)) {
                    const parts = lastParty.code.split('-');
                    if (parts.length > 1) {
                        const lastNumber = parseInt(parts[1], 10);
                        if (!isNaN(lastNumber)) {
                            newCode = `${prefix}-${String(lastNumber + 1).padStart(3, '0')}`;
                        }
                    }
                }
            }
        }
        document.getElementById('partyCode').value = newCode;
    } catch (error) {
        console.error('Error generating party code:', error);
    }
}

// Open add category dialog based on selected party type
function openAddCategoryDialog() {
    const partyType = document.getElementById('partyType').value;

    if (!partyType) {
        showError('Please select a Type first');
        return;
    }

    // Determine which category type to use based on party type
    let categoryType = '';
    if (partyType === 'customer') {
        categoryType = 'customer-category';
    } else if (partyType === 'supplier') {
        categoryType = 'supplier-category';
    }

    // Show the quick add dialog for the appropriate category type
    DesktopUI.showQuickAddDialog(categoryType, () => loadCategories(partyType));
}

// Load categories based on party type
async function loadCategories(partyType = '') {
    const categorySelect = document.getElementById('category');
    const addCategoryBtn = document.getElementById('addCategoryBtn');

    // If no type selected, disable category dropdown and + button
    if (!partyType) {
        categorySelect.innerHTML = '<option value="">-- Select Type First --</option>';
        categorySelect.disabled = true;
        categorySelect.style.opacity = '0.6';
        categorySelect.style.cursor = 'not-allowed';

        // Also disable the + button
        if (addCategoryBtn) {
            addCategoryBtn.disabled = true;
            addCategoryBtn.style.opacity = '0.6';
            addCategoryBtn.style.cursor = 'not-allowed';
        }
        return;
    }

    try {
        const token = localStorage.getItem('token');

        // Use dedicated category endpoints based on party type
        let url = '/api/v1/categories'; // fallback to all categories
        if (partyType === 'customer') {
            url = '/api/v1/customer-categories';
        } else if (partyType === 'supplier') {
            url = '/api/v1/supplier-categories';
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();

            // Store currently selected value
            const currentValue = categorySelect.value;

            // Build options HTML string
            let optionsHTML = '<option value="">-- Select Category --</option>';

            if (data.data) {
                data.data.forEach(cat => {
                    optionsHTML += `<option value="${cat._id}">${cat.name}</option>`;
                });
            }

            // Set innerHTML once to avoid duplicates
            categorySelect.innerHTML = optionsHTML;

            // Enable the category dropdown
            categorySelect.disabled = false;
            categorySelect.style.opacity = '1';
            categorySelect.style.cursor = 'pointer';

            // Also enable the + button
            if (addCategoryBtn) {
                addCategoryBtn.disabled = false;
                addCategoryBtn.style.opacity = '1';
                addCategoryBtn.style.cursor = 'pointer';
            }

            // Restore selected value if it still exists in the new options
            if (currentValue) {
                categorySelect.value = currentValue;
            }
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Load parties from API
async function loadParties(page = 1, limit = 10) {
    console.log('Parties.js: loadParties called', page, limit);
    try {
        showLoading();

        currentPage = page;
        currentLimit = limit;

        const token = localStorage.getItem('token');
        const search = document.getElementById('searchInput').value;
        const branch = document.getElementById('branchFilter').value;
        const type = document.getElementById('partyTypeFilter').value;
        const balanceFilter = document.getElementById('balanceFilter').value;

        // Build query parameters
        let queryParams = `?page=${page}&limit=${limit}`;
        if (search) queryParams += `&search=${search}`;
        if (branch) queryParams += `&branch=${branch}`;
        if (type) queryParams += `&partyType=${type}`;
        if (balanceFilter === 'positive') queryParams += `&currentBalance[gt]=0`;
        if (balanceFilter === 'negative') queryParams += `&currentBalance[lt]=0`;
        if (balanceFilter === 'zero') queryParams += `&currentBalance=0`;

        const response = await fetch(`/api/v1/parties${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayParties(data.data);
            updatePagination(data.pagination);

            // Update sidebar statistics
            updateStatistics(branch); // Pass current branch filter
        } else {
            throw new Error('Failed to load parties');
        }
    } catch (error) {
        console.error('Error loading parties:', error);
        showError('Failed to load parties');
    } finally {
        hideLoading();
    }
}

// Display parties in table
function displayParties(parties) {
    const tbody = document.getElementById('partiesTableBody');

    if (!parties || parties.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">No parties found</td></tr>';
        return;
    }

    tbody.innerHTML = parties.map(party => `
        <tr>
            <td class="text-center">
                <button class="icon-btn" onclick="editParty('${party._id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
            <td>${party.code || '-'}</td>
            <td>${party.branch || '-'}</td>
            <td>${party.name}</td>
            <td><span class="badge badge-${party.partyType === 'customer' ? 'success' : 'info'}">${party.partyType}</span></td>
            <td>${party.phone || '-'}</td>
            <td>${party.mobile || '-'}</td>
            <td>${party.address?.street || '-'}</td>
            <td>${party.taxNumber || '-'}</td>
            <td class="text-right ${party.currentBalance < 0 ? 'text-danger' : 'text-success'}">
                ${Math.abs(party.currentBalance || 0).toFixed(2)}
            </td>
            <td class="text-center">
                <span class="badge badge-${party.isActive ? 'success' : 'danger'}">
                    ${party.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td class="text-center">
                <button class="icon-btn danger" onclick="deleteParty('${party._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Edit party
async function editParty(partyId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/parties/${partyId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const responseData = await response.json();
            const party = responseData.data;

            // Populate form
            document.getElementById('partyId').value = party._id;
            document.getElementById('partyCode').value = party.code || '';
            document.getElementById('branch').value = party.branch || ''; // Set Branch
            document.getElementById('name').value = party.name || '';
            document.getElementById('partyType').value = party.partyType || '';

            // Load categories based on party type, then set the category value
            await loadCategories(party.partyType || '');
            const categoryId = (party.category && party.category._id) ? party.category._id : (party.category || '');
            document.getElementById('category').value = categoryId;

            document.getElementById('phone').value = party.phone || '';
            document.getElementById('mobile').value = party.mobile || '';
            document.getElementById('gstNumber').value = party.taxNumber || '';
            document.getElementById('panNumber').value = party.panNumber || '';
            document.getElementById('address').value = party.address?.street || '';
            document.getElementById('city').value = party.address?.city || '';
            document.getElementById('state').value = party.address?.state || '';
            document.getElementById('pincode').value = party.address?.postalCode || '';
            document.getElementById('country').value = party.address?.country || 'Pakistan';
            document.getElementById('notes').value = party.notes || '';
            document.getElementById('openingBalance').value = party.openingBalance || 0;
            document.getElementById('isActive').checked = party.isActive !== false;

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

            showSuccess('Party loaded for editing');
        } else {
            showError('Failed to load party data');
        }
    } catch (error) {
        console.error('Error loading party data:', error);
        showError('Failed to load party data');
    } finally {
        hideLoading();
    }
}

// Save party
async function saveParty() {
    try {
        // Validate form
        const name = document.getElementById('name').value.trim();
        const partyType = document.getElementById('partyType').value;

        if (!name) {
            showError('Please enter party name');
            return;
        }

        if (!partyType) {
            showError('Please select party type');
            return;
        }

        showLoading();

        const token = localStorage.getItem('token');
        const partyId = document.getElementById('partyId').value;

        const formData = {
            code: document.getElementById('partyCode').value,
            branch: document.getElementById('branch').value,
            name: name,
            partyType: partyType,
            phone: document.getElementById('phone').value,
            mobile: document.getElementById('mobile').value,
            email: document.getElementById('email').value,
            taxNumber: document.getElementById('gstNumber').value,
            panNumber: document.getElementById('panNumber').value,
            address: {
                street: document.getElementById('address').value,
                city: document.getElementById('city').value,
                state: document.getElementById('state').value,
                postalCode: document.getElementById('pincode').value,
                country: document.getElementById('country').value || 'Pakistan'
            },
            notes: document.getElementById('notes').value,
            openingBalance: parseFloat(document.getElementById('openingBalance').value) || 0,
            category: document.getElementById('category').value,
            isActive: document.getElementById('isActive').checked
        };

        const url = partyId ? `/api/v1/parties/${partyId}` : '/api/v1/parties';
        const method = partyId ? 'PUT' : 'POST';

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
            loadParties(currentPage, currentLimit);
            showSuccess(partyId ? 'Party updated successfully' : 'Party created successfully');
        } else {
            const error = await response.json();
            showError(error.message || 'Failed to save party');
        }
    } catch (error) {
        console.error('Error saving party:', error);
        showError('Failed to save party');
    } finally {
        hideLoading();
    }
}

// Delete party
async function deleteParty(partyId) {
    if (!confirm('Are you sure you want to delete this party?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/parties/${partyId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            loadParties(currentPage, currentLimit);
            showSuccess('Party deleted successfully');
        } else {
            showError('Failed to delete party');
        }
    } catch (error) {
        console.error('Error deleting party:', error);
        showError('Failed to delete party');
    } finally {
        hideLoading();
    }
}

// Clear form
function clearForm() {
    document.getElementById('partyForm').reset();
    document.getElementById('partyId').value = '';
    document.getElementById('country').value = 'Pakistan';
    document.getElementById('isActive').checked = true;
    document.getElementById('openingBalance').value = 0;
    generatePartyCode();
    // Reset category dropdown to disabled state (no type selected)
    initializeCategoryDropdown();
}

// Handle search
function handleSearch() {
    loadParties(1, currentLimit);
}

// Reset filters
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('branchFilter').value = '';
    document.getElementById('partyTypeFilter').value = '';
    document.getElementById('balanceFilter').value = '';
    loadParties(1, currentLimit);
}

// Show parties list (scroll to table)
function showPartiesList() {
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

// Print parties
function printParties() {
    window.print();
}

// Update pagination
function updatePagination(pagination) {
    const paginationDiv = document.getElementById('pagination');

    if (!pagination) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '<div class="d-flex justify-content-center gap-2">';

    // Previous button
    if (pagination.prev) {
        html += `<button class="btn btn-sm btn-secondary" onclick="loadParties(${pagination.prev.page}, ${currentLimit})">
            <i class="fas fa-chevron-left"></i> Previous
        </button>`;
    }

    // Page info
    const currentPage = pagination.page || 1;
    const total = pagination.total || 0;
    const limit = pagination.limit || 10;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    html += `<button class="btn btn-sm btn-primary" disabled>
        Page ${currentPage} of ${totalPages}
    </button>`;

    // Next button
    if (pagination.next) {
        html += `<button class="btn btn-sm btn-secondary" onclick="loadParties(${pagination.next.page}, ${currentLimit})">
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

// Placeholder for loadPartyTypes (for quick add dialog)
function loadPartyTypes() {
    // This would be implemented if party types are dynamic
    console.log('Load party types');
}

// Helpers are provided by pageAccess.js

