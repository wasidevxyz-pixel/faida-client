// Receipts Management JavaScript
document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    // Initialize receipts page
    initReceiptsPage();
});

// Initialize receipts page
function initReceiptsPage() {
    // Load receipts
    loadReceipts();

    // Event listeners
    document.getElementById('addReceiptBtn').addEventListener('click', showAddReceiptModal);
    document.getElementById('closeModal').addEventListener('click', hideReceiptModal);
    document.getElementById('cancelBtn').addEventListener('click', hideReceiptModal);
    document.getElementById('receiptForm').addEventListener('submit', handleReceiptSubmit);
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('startDate').addEventListener('change', loadReceipts);
    document.getElementById('endDate').addEventListener('change', loadReceipts);
    document.getElementById('statusFilter').addEventListener('change', loadReceipts);
    document.getElementById('selectAll').addEventListener('change', handleSelectAll);
    document.getElementById('amount').addEventListener('input', updateNetAmount);
    document.getElementById('discount').addEventListener('input', updateNetAmount);

    // Set today's date as default
    document.getElementById('receiptDate').valueAsDate = new Date();
}

// Load receipts from API
async function loadReceipts(page = 1, limit = 10) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const search = document.getElementById('searchInput').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const status = document.getElementById('statusFilter').value;

        // Build query parameters
        let queryParams = `?page=${page}&limit=${limit}`;
        if (search) queryParams += `&search=${search}`;
        if (startDate) queryParams += `&startDate=${startDate}`;
        if (endDate) queryParams += `&endDate=${endDate}`;
        if (status) queryParams += `&status=${status}`;

        const response = await fetch(`/api/v1/receipts${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayReceipts(data.data);
            updatePagination(data.pagination);
        } else {
            throw new Error('Failed to load receipts');
        }
    } catch (error) {
        console.error('Error loading receipts:', error);
        showError('Failed to load receipts');
    } finally {
        hideLoading();
    }
}

// Display receipts in table
function displayReceipts(receipts) {
    const tbody = document.getElementById('receiptsTableBody');

    if (!receipts || receipts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">No receipts found</td></tr>';
        return;
    }

    tbody.innerHTML = receipts.map(receipt => `
        <tr>
            <td><input type="checkbox" class="receipt-checkbox" data-id="${receipt._id}"></td>
            <td>${receipt.receiptNumber}</td>
            <td>${formatDate(receipt.date)}</td>
            <td>${receipt.customer?.name || '-'}</td>
            <td><span class="badge">${receipt.paymentMode}</span></td>
            <td>${receipt.referenceNumber || '-'}</td>
            <td>${formatCurrency(receipt.amount)}</td>
            <td>${formatCurrency(receipt.discount || 0)}</td>
            <td>${formatCurrency(receipt.netAmount)}</td>
            <td><span class="badge badge-${receipt.status}">${receipt.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="viewReceipt('${receipt._id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="printReceipt('${receipt._id}')">
                        <i class="fas fa-print"></i>
                    </button>
                    ${receipt.status === 'draft' ? `
                    <button class="btn btn-sm btn-warning" onclick="editReceipt('${receipt._id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteReceipt('${receipt._id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// Show add receipt modal
async function showAddReceiptModal() {
    document.getElementById('modalTitle').textContent = 'New Receipt';
    document.getElementById('receiptForm').reset();
    document.getElementById('receiptId').value = '';
    document.getElementById('receiptDate').valueAsDate = new Date();
    document.getElementById('discount').value = '0';
    updateNetAmount();

    // Load customers
    await loadCustomers();

    document.getElementById('receiptModal').style.display = 'block';
}

// Hide receipt modal
function hideReceiptModal() {
    document.getElementById('receiptModal').style.display = 'none';
}

// Load customers for dropdown
async function loadCustomers() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/parties?partyType=customer', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const customerSelect = document.getElementById('customer');
            customerSelect.innerHTML = '<option value="">Select Customer</option>';

            data.data.forEach(customer => {
                customerSelect.innerHTML += `<option value="${customer._id}">${customer.name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}

// Update net amount
function updateNetAmount() {
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const discount = parseFloat(document.getElementById('discount').value) || 0;
    const netAmount = Math.max(0, amount - discount);

    // You could display this somewhere if needed
    // For now, it will be calculated on the backend
}

// Handle receipt form submit
async function handleReceiptSubmit(e) {
    e.preventDefault();

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const receiptId = document.getElementById('receiptId').value;
        const formData = {
            customer: document.getElementById('customer').value,
            date: document.getElementById('receiptDate').value,
            paymentMode: document.getElementById('paymentMode').value,
            referenceNumber: document.getElementById('referenceNumber').value,
            amount: parseFloat(document.getElementById('amount').value),
            discount: parseFloat(document.getElementById('discount').value) || 0,
            paymentDetails: document.getElementById('paymentDetails').value,
            notes: document.getElementById('notes').value
        };

        const url = receiptId ? `/api/v1/receipts/${receiptId}` : '/api/v1/receipts';
        const method = receiptId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            hideReceiptModal();
            loadReceipts();
            showSuccess(receiptId ? 'Receipt updated successfully' : 'Receipt created successfully');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save receipt');
        }
    } catch (error) {
        console.error('Error saving receipt:', error);
        showError(error.message || 'Failed to save receipt');
    } finally {
        hideLoading();
    }
}

// View receipt details
async function viewReceipt(receiptId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/receipts/${receiptId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const receipt = await response.json();
            // Display receipt details in a modal or redirect to details page
            console.log('Receipt details:', receipt.data);
            // TODO: Implement view receipt modal
        } else {
            throw new Error('Failed to load receipt');
        }
    } catch (error) {
        console.error('Error loading receipt:', error);
        showError('Failed to load receipt');
    } finally {
        hideLoading();
    }
}

// Print receipt
function printReceipt(receiptId) {
    window.open(`/api/v1/receipts/${receiptId}/print`, '_blank');
}

// Edit receipt
async function editReceipt(receiptId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/receipts/${receiptId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const receipt = await response.json();

            // Fill form with receipt data
            document.getElementById('modalTitle').textContent = 'Edit Receipt';
            document.getElementById('receiptId').value = receipt.data._id;
            document.getElementById('customer').value = receipt.data.customer._id;
            document.getElementById('receiptDate').value = receipt.data.date.split('T')[0];
            document.getElementById('paymentMode').value = receipt.data.paymentMode;
            document.getElementById('referenceNumber').value = receipt.data.referenceNumber || '';
            document.getElementById('amount').value = receipt.data.amount;
            document.getElementById('discount').value = receipt.data.discount || 0;
            document.getElementById('paymentDetails').value = receipt.data.paymentDetails || '';
            document.getElementById('notes').value = receipt.data.notes || '';

            document.getElementById('receiptModal').style.display = 'block';
        } else {
            throw new Error('Failed to load receipt');
        }
    } catch (error) {
        console.error('Error loading receipt:', error);
        showError('Failed to load receipt');
    } finally {
        hideLoading();
    }
}

// Delete receipt
async function deleteReceipt(receiptId) {
    if (!confirm('Are you sure you want to delete this receipt?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/receipts/${receiptId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            loadReceipts();
            showSuccess('Receipt deleted successfully');
        } else {
            throw new Error('Failed to delete receipt');
        }
    } catch (error) {
        console.error('Error deleting receipt:', error);
        showError('Failed to delete receipt');
    } finally {
        hideLoading();
    }
}

// Handle search
function handleSearch() {
    loadReceipts(1);
}

// Handle select all
function handleSelectAll(e) {
    const checkboxes = document.querySelectorAll('.receipt-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked;
    });
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
        html += `<button class="btn btn-sm" onclick="loadReceipts(${pagination.prev.page})">Previous</button>`;
    }

    // Page numbers
    const total = pagination.total || 0;
    const limit = pagination.limit || 10;
    const currentPage = pagination.page || 1;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    for (let i = 1; i <= totalPages; i++) {
        const active = i === currentPage ? 'active' : '';
        html += `<button class="btn btn-sm ${active}" onclick="loadReceipts(${i})">${i}</button>`;
    }

    // Next button
    if (pagination.next) {
        html += `<button class="btn btn-sm" onclick="loadReceipts(${pagination.next.page})">Next</button>`;
    }

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

