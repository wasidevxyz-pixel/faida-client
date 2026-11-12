// Expenses Management JavaScript
document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = 'login';
        return;
    }

    // Initialize expenses page
    initExpensesPage();
});

// Initialize expenses page
function initExpensesPage() {
    // Load expenses
    loadExpenses();

    // Event listeners
    document.getElementById('addExpenseBtn').addEventListener('click', showAddExpenseModal);
    document.getElementById('closeModal').addEventListener('click', hideExpenseModal);
    document.getElementById('cancelBtn').addEventListener('click', hideExpenseModal);
    document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    document.getElementById('startDate').addEventListener('change', loadExpenses);
    document.getElementById('endDate').addEventListener('change', loadExpenses);
    document.getElementById('categoryFilter').addEventListener('change', loadExpenses);
    document.getElementById('statusFilter').addEventListener('change', loadExpenses);
    document.getElementById('selectAll').addEventListener('change', handleSelectAll);
    document.getElementById('attachment').addEventListener('change', handleAttachmentPreview);

    // Set today's date as default
    document.getElementById('expenseDate').valueAsDate = new Date();
}

// Load expenses from API
async function loadExpenses(page = 1, limit = 10) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const search = document.getElementById('searchInput').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const category = document.getElementById('categoryFilter').value;
        const status = document.getElementById('statusFilter').value;

        // Build query parameters
        let queryParams = `?page=${page}&limit=${limit}`;
        if (search) queryParams += `&search=${search}`;
        if (startDate) queryParams += `&startDate=${startDate}`;
        if (endDate) queryParams += `&endDate=${endDate}`;
        if (category) queryParams += `&category=${category}`;
        if (status) queryParams += `&status=${status}`;

        const response = await fetch(`/api/v1/expenses${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayExpenses(data.data);
            updatePagination(data.pagination);
        } else {
            throw new Error('Failed to load expenses');
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
        showError('Failed to load expenses');
    } finally {
        hideLoading();
    }
}

// Display expenses in table
function displayExpenses(expenses) {
    const tbody = document.getElementById('expensesTableBody');

    if (!expenses || expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">No expenses found</td></tr>';
        return;
    }

    tbody.innerHTML = expenses.map(expense => `
        <tr>
            <td><input type="checkbox" class="expense-checkbox" data-id="${expense._id}"></td>
            <td>${expense.expenseNo}</td>
            <td>${formatDate(expense.date)}</td>
            <td><span class="badge">${expense.category}</span></td>
            <td>${expense.description}</td>
            <td><span class="badge">${expense.paymentMode}</span></td>
            <td>${formatCurrency(expense.amount)}</td>
            <td><span class="badge badge-${expense.status}">${expense.status}</span></td>
            <td>
                ${expense.attachment ? `
                <a href="${expense.attachment}" target="_blank" class="btn btn-sm btn-info">
                    <i class="fas fa-paperclip"></i>
                </a>
                ` : '-'}
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="viewExpense('${expense._id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="printExpense('${expense._id}')">
                        <i class="fas fa-print"></i>
                    </button>
                    ${expense.status === 'pending' ? `
                    <button class="btn btn-sm btn-warning" onclick="editExpense('${expense._id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteExpense('${expense._id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn btn-sm btn-success" onclick="approveExpense('${expense._id}')">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// Show add expense modal
function showAddExpenseModal() {
    document.getElementById('modalTitle').textContent = 'New Expense';
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = '';
    document.getElementById('expenseDate').valueAsDate = new Date();
    document.getElementById('attachmentPreview').innerHTML = '';

    document.getElementById('expenseModal').style.display = 'block';
}

// Hide expense modal
function hideExpenseModal() {
    document.getElementById('expenseModal').style.display = 'none';
}

// Handle attachment preview
function handleAttachmentPreview(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('attachmentPreview');

    if (file) {
        // Check file size (5MB limit)
        if (file.size > 5 * 1024 * 1024) {
            showError('File size must be less than 5MB');
            e.target.value = '';
            preview.innerHTML = '';
            return;
        }

        // Show file info
        preview.innerHTML = `
            <div class="attachment-info">
                <i class="fas fa-file"></i>
                <span>${file.name}</span>
                <span>(${(file.size / 1024).toFixed(2)} KB)</span>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeAttachment()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    } else {
        preview.innerHTML = '';
    }
}

// Remove attachment
function removeAttachment() {
    document.getElementById('attachment').value = '';
    document.getElementById('attachmentPreview').innerHTML = '';
}

// Handle expense form submit
async function handleExpenseSubmit(e) {
    e.preventDefault();

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const expenseId = document.getElementById('expenseId').value;

        // Create form data for file upload
        const formData = new FormData();
        formData.append('date', document.getElementById('expenseDate').value);
        formData.append('category', document.getElementById('category').value);
        formData.append('description', document.getElementById('description').value);
        formData.append('amount', document.getElementById('amount').value);
        formData.append('paymentMode', document.getElementById('paymentMode').value);
        formData.append('notes', document.getElementById('notes').value);

        // Add attachment if exists
        const attachmentFile = document.getElementById('attachment').files[0];
        if (attachmentFile) {
            formData.append('attachment', attachmentFile);
        }

        const url = expenseId ? `/api/v1/expenses/${expenseId}` : '/api/v1/expenses';
        const method = expenseId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            hideExpenseModal();
            loadExpenses();
            showSuccess(expenseId ? 'Expense updated successfully' : 'Expense created successfully');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save expense');
        }
    } catch (error) {
        console.error('Error saving expense:', error);
        showError(error.message || 'Failed to save expense');
    } finally {
        hideLoading();
    }
}

// View expense details
async function viewExpense(expenseId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/expenses/${expenseId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const expense = await response.json();
            // Display expense details in a modal or redirect to details page
            console.log('Expense details:', expense.data);
            // TODO: Implement view expense modal
        } else {
            throw new Error('Failed to load expense');
        }
    } catch (error) {
        console.error('Error loading expense:', error);
        showError('Failed to load expense');
    } finally {
        hideLoading();
    }
}

// Print expense
function printExpense(expenseId) {
    window.open(`/voucher-print?type=expense&id=${expenseId}`, '_blank', 'width=1000,height=800');
}

// Edit expense
async function editExpense(expenseId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/expenses/${expenseId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const expense = await response.json();

            // Fill form with expense data
            document.getElementById('modalTitle').textContent = 'Edit Expense';
            document.getElementById('expenseId').value = expense.data._id;
            document.getElementById('expenseDate').value = expense.data.date.split('T')[0];
            document.getElementById('category').value = expense.data.category;
            document.getElementById('description').value = expense.data.description;
            document.getElementById('amount').value = expense.data.amount;
            document.getElementById('paymentMode').value = expense.data.paymentMode;
            document.getElementById('notes').value = expense.data.notes || '';

            // Show attachment if exists
            if (expense.data.attachment) {
                document.getElementById('attachmentPreview').innerHTML = `
                    <div class="attachment-info">
                        <i class="fas fa-file"></i>
                        <span>Current attachment</span>
                        <a href="${expense.data.attachment}" target="_blank" class="btn btn-sm btn-info">
                            <i class="fas fa-eye"></i> View
                        </a>
                    </div>
                `;
            }

            document.getElementById('expenseModal').style.display = 'block';
        } else {
            throw new Error('Failed to load expense');
        }
    } catch (error) {
        console.error('Error loading expense:', error);
        showError('Failed to load expense');
    } finally {
        hideLoading();
    }
}

// Delete expense
async function deleteExpense(expenseId) {
    if (!confirm('Are you sure you want to delete this expense?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/expenses/${expenseId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            loadExpenses();
            showSuccess('Expense deleted successfully');
        } else {
            throw new Error('Failed to delete expense');
        }
    } catch (error) {
        console.error('Error deleting expense:', error);
        showError('Failed to delete expense');
    } finally {
        hideLoading();
    }
}

// Approve expense
async function approveExpense(expenseId) {
    if (!confirm('Are you sure you want to approve this expense?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/expenses/${expenseId}/approve`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            loadExpenses();
            showSuccess('Expense approved successfully');
        } else {
            throw new Error('Failed to approve expense');
        }
    } catch (error) {
        console.error('Error approving expense:', error);
        showError('Failed to approve expense');
    } finally {
        hideLoading();
    }
}

// Handle search
function handleSearch() {
    loadExpenses(1);
}

// Handle select all
function handleSelectAll(e) {
    const checkboxes = document.querySelectorAll('.expense-checkbox');
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
        html += `<button class="btn btn-sm" onclick="loadExpenses(${pagination.prev.page})">Previous</button>`;
    }

    // Page numbers
    const total = pagination.total || 0;
    const limit = pagination.limit || 10;
    const currentPage = pagination.page || 1;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    for (let i = 1; i <= totalPages; i++) {
        const active = i === currentPage ? 'active' : '';
        html += `<button class="btn btn-sm ${active}" onclick="loadExpenses(${i})">${i}</button>`;
    }

    // Next button
    if (pagination.next) {
        html += `<button class="btn btn-sm" onclick="loadExpenses(${pagination.next.page})">Next</button>`;
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

