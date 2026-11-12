// Taxes Management JavaScript
document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    // Set user name in navbar
    setUserName();

    // Initialize taxes page
    initTaxesPage();
});

// Set user name in navbar
function setUserName() {
    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.name || user.email;
    }
}

// Initialize taxes page
function initTaxesPage() {
    // Load taxes
    loadTaxes();

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('statusFilter').addEventListener('change', handleFilterChange);

    // Reset modal when hidden
    const taxModal = document.getElementById('taxModal');
    taxModal.addEventListener('hidden.bs.modal', function () {
        resetTaxForm();
    });
}

// Load taxes
async function loadTaxes(page = 1) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const search = document.getElementById('searchInput').value;
        const status = document.getElementById('statusFilter').value;

        let url = `/api/v1/taxes?page=${page}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status) url += `&status=${status}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayTaxes(data.data);
            updatePagination(data.pagination);
        } else {
            throw new Error('Failed to load taxes');
        }
    } catch (error) {
        console.error('Error loading taxes:', error);
        showError('Failed to load taxes');
    } finally {
        hideLoading();
    }
}

// Display taxes
function displayTaxes(taxes) {
    const tbody = document.getElementById('taxesTableBody');

    if (!taxes || taxes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No taxes found</td></tr>';
        return;
    }

    tbody.innerHTML = taxes.map(tax => `
        <tr>
            <td>${tax.name}</td>
            <td><span class="badge bg-info">${tax.rate}%</span></td>
            <td><span class="badge bg-secondary">${tax.type.toUpperCase()}</span></td>
            <td>${tax.description || '-'}</td>
            <td>
                <span class="badge bg-${tax.isActive ? 'success' : 'danger'}">
                    ${tax.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${formatDate(tax.createdAt)}</td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-primary" onclick="editTax('${tax._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-warning" onclick="toggleTaxStatus('${tax._id}', ${!tax.isActive})" title="${tax.isActive ? 'Deactivate' : 'Activate'}">
                        <i class="fas fa-${tax.isActive ? 'ban' : 'check'}"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteTax('${tax._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Update pagination
function updatePagination(pagination) {
    const paginationDiv = document.getElementById('pagination');

    if (!pagination) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    if (pagination.prev) {
        html += `<li class="page-item">
            <a class="page-link" href="#" onclick="loadTaxes(${pagination.prev})">&laquo;</a>
        </li>`;
    }

    // Page numbers
    pagination.pages.forEach(page => {
        const activeClass = page === pagination.current ? 'active' : '';
        html += `<li class="page-item ${activeClass}">
            <a class="page-link" href="#" onclick="loadTaxes(${page})">${page}</a>
        </li>`;
    });

    // Next button
    if (pagination.next) {
        html += `<li class="page-item">
            <a class="page-link" href="#" onclick="loadTaxes(${pagination.next})">&raquo;</a>
        </li>`;
    }

    paginationDiv.innerHTML = html;
}

// Save tax
async function saveTax() {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const taxId = document.getElementById('taxId').value;
        const formData = {
            name: document.getElementById('taxName').value,
            rate: parseFloat(document.getElementById('taxRate').value),
            type: document.getElementById('taxType').value,
            description: document.getElementById('taxDescription').value,
            isActive: document.getElementById('taxActive').checked
        };

        const url = taxId ? `/api/v1/taxes/${taxId}` : '/api/v1/taxes';
        const method = taxId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('taxModal'));
            modal.hide();
            loadTaxes();
            showSuccess(taxId ? 'Tax updated successfully' : 'Tax created successfully');
        } else {
            const error = await response.json();
            showError(error.message || 'Failed to save tax');
        }
    } catch (error) {
        console.error('Error saving tax:', error);
        showError('Failed to save tax');
    } finally {
        hideLoading();
    }
}

// Edit tax
async function editTax(taxId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/taxes/${taxId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const tax = await response.json();

            // Populate form
            document.getElementById('taxModalTitle').textContent = 'Edit Tax';
            document.getElementById('taxId').value = tax._id;
            document.getElementById('taxName').value = tax.name;
            document.getElementById('taxRate').value = tax.rate;
            document.getElementById('taxType').value = tax.type;
            document.getElementById('taxDescription').value = tax.description || '';
            document.getElementById('taxActive').checked = tax.isActive;

            const modal = new bootstrap.Modal(document.getElementById('taxModal'));
            modal.show();
        } else {
            showError('Failed to load tax data');
        }
    } catch (error) {
        console.error('Error editing tax:', error);
        showError('Failed to load tax data');
    } finally {
        hideLoading();
    }
}

// Toggle tax status
async function toggleTaxStatus(taxId, isActive) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/taxes/${taxId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ isActive })
        });

        if (response.ok) {
            loadTaxes();
            showSuccess(`Tax ${isActive ? 'activated' : 'deactivated'} successfully`);
        } else {
            showError('Failed to update tax status');
        }
    } catch (error) {
        console.error('Error updating tax status:', error);
        showError('Failed to update tax status');
    } finally {
        hideLoading();
    }
}

// Delete tax
async function deleteTax(taxId) {
    if (!confirm('Are you sure you want to delete this tax?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/taxes/${taxId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            loadTaxes();
            showSuccess('Tax deleted successfully');
        } else {
            showError('Failed to delete tax');
        }
    } catch (error) {
        console.error('Error deleting tax:', error);
        showError('Failed to delete tax');
    } finally {
        hideLoading();
    }
}

// Reset tax form
function resetTaxForm() {
    document.getElementById('taxForm').reset();
    document.getElementById('taxId').value = '';
    document.getElementById('taxModalTitle').textContent = 'Add Tax';
}

// Handle search
function handleSearch() {
    loadTaxes(1);
}

// Handle filter change
function handleFilterChange() {
    loadTaxes(1);
}

// Reset filters
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    loadTaxes();
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
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

