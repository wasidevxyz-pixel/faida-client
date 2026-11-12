// Units Management JavaScript
document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    // Set user name in navbar
    setUserName();

    // Initialize units page
    initUnitsPage();
});

// Set user name in navbar
function setUserName() {
    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.name || user.email;
    }
}

// Initialize units page
function initUnitsPage() {
    // Load units
    loadUnits();

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('statusFilter').addEventListener('change', handleFilterChange);

    // Reset modal when hidden
    const unitModal = document.getElementById('unitModal');
    unitModal.addEventListener('hidden.bs.modal', function () {
        resetUnitForm();
    });
}

// Load units
async function loadUnits(page = 1) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const search = document.getElementById('searchInput').value;
        const status = document.getElementById('statusFilter').value;

        let url = `/api/v1/units?page=${page}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status) url += `&status=${status}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayUnits(data.data);
            updatePagination(data.pagination);
        } else {
            throw new Error('Failed to load units');
        }
    } catch (error) {
        console.error('Error loading units:', error);
        showError('Failed to load units');
    } finally {
        hideLoading();
    }
}

// Display units
function displayUnits(units) {
    const tbody = document.getElementById('unitsTableBody');

    if (!units || units.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No units found</td></tr>';
        return;
    }

    tbody.innerHTML = units.map(unit => `
        <tr>
            <td>${unit.name}</td>
            <td><span class="badge bg-secondary">${unit.shortCode}</span></td>
            <td>${unit.description || '-'}</td>
            <td>
                <span class="badge bg-${unit.isActive ? 'success' : 'danger'}">
                    ${unit.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${formatDate(unit.createdAt)}</td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-primary" onclick="editUnit('${unit._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-warning" onclick="toggleUnitStatus('${unit._id}', ${!unit.isActive})" title="${unit.isActive ? 'Deactivate' : 'Activate'}">
                        <i class="fas fa-${unit.isActive ? 'ban' : 'check'}"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteUnit('${unit._id}')" title="Delete">
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
            <a class="page-link" href="#" onclick="loadUnits(${pagination.prev})">&laquo;</a>
        </li>`;
    }

    // Page numbers
    pagination.pages.forEach(page => {
        const activeClass = page === pagination.current ? 'active' : '';
        html += `<li class="page-item ${activeClass}">
            <a class="page-link" href="#" onclick="loadUnits(${page})">${page}</a>
        </li>`;
    });

    // Next button
    if (pagination.next) {
        html += `<li class="page-item">
            <a class="page-link" href="#" onclick="loadUnits(${pagination.next})">&raquo;</a>
        </li>`;
    }

    paginationDiv.innerHTML = html;
}

// Save unit
async function saveUnit() {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const unitId = document.getElementById('unitId').value;
        const formData = {
            name: document.getElementById('unitName').value,
            shortCode: document.getElementById('unitShortCode').value,
            description: document.getElementById('unitDescription').value,
            isActive: document.getElementById('unitActive').checked
        };

        const url = unitId ? `/api/v1/units/${unitId}` : '/api/v1/units';
        const method = unitId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('unitModal'));
            modal.hide();
            loadUnits();
            showSuccess(unitId ? 'Unit updated successfully' : 'Unit created successfully');
        } else {
            const error = await response.json();
            showError(error.message || 'Failed to save unit');
        }
    } catch (error) {
        console.error('Error saving unit:', error);
        showError('Failed to save unit');
    } finally {
        hideLoading();
    }
}

// Edit unit
async function editUnit(unitId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/units/${unitId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const unit = await response.json();

            // Populate form
            document.getElementById('unitModalTitle').textContent = 'Edit Unit';
            document.getElementById('unitId').value = unit._id;
            document.getElementById('unitName').value = unit.name;
            document.getElementById('unitShortCode').value = unit.shortCode;
            document.getElementById('unitDescription').value = unit.description || '';
            document.getElementById('unitActive').checked = unit.isActive;

            const modal = new bootstrap.Modal(document.getElementById('unitModal'));
            modal.show();
        } else {
            showError('Failed to load unit data');
        }
    } catch (error) {
        console.error('Error editing unit:', error);
        showError('Failed to load unit data');
    } finally {
        hideLoading();
    }
}

// Toggle unit status
async function toggleUnitStatus(unitId, isActive) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/units/${unitId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ isActive })
        });

        if (response.ok) {
            loadUnits();
            showSuccess(`Unit ${isActive ? 'activated' : 'deactivated'} successfully`);
        } else {
            showError('Failed to update unit status');
        }
    } catch (error) {
        console.error('Error updating unit status:', error);
        showError('Failed to update unit status');
    } finally {
        hideLoading();
    }
}

// Delete unit
async function deleteUnit(unitId) {
    if (!confirm('Are you sure you want to delete this unit?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/units/${unitId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            loadUnits();
            showSuccess('Unit deleted successfully');
        } else {
            showError('Failed to delete unit');
        }
    } catch (error) {
        console.error('Error deleting unit:', error);
        showError('Failed to delete unit');
    } finally {
        hideLoading();
    }
}

// Reset unit form
function resetUnitForm() {
    document.getElementById('unitForm').reset();
    document.getElementById('unitId').value = '';
    document.getElementById('unitModalTitle').textContent = 'Add Unit';
}

// Handle search
function handleSearch() {
    loadUnits(1);
}

// Handle filter change
function handleFilterChange() {
    loadUnits(1);
}

// Reset filters
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    loadUnits();
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

