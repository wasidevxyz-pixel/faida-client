// Expenses Management JavaScript - Desktop Design
let currentPage = 1;
let currentLimit = 50;
let expenseHeads = [];
let subHeads = {};
let cashInHand = 0;

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
async function initExpensesPage() {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    const expenseDateEl = document.getElementById('expenseDate');
    const filterFromDateEl = document.getElementById('filterFromDate');
    const filterToDateEl = document.getElementById('filterToDate');

    if (expenseDateEl) expenseDateEl.value = today;
    if (filterFromDateEl) filterFromDateEl.value = today;
    if (filterToDateEl) filterToDateEl.value = today;

    // Load data
    await loadBranches(); // Wait for branches to load first
    loadExpenseHeads();
    loadCashInHand();
    loadExpenses();

    // Event listeners
    setupEventListeners();
}

// Setup event listeners
function setupEventListeners() {
    // Pay type change - update labels and reset related fields
    const payTypeEl = document.getElementById('payType');
    if (payTypeEl) {
        payTypeEl.addEventListener('change', handlePayTypeChange);
    }

    // Head change - load sub heads
    const headEl = document.getElementById('head');
    if (headEl) {
        headEl.addEventListener('change', function () {
            loadSubHeads(this.value);
        });
    }

    // Amount input - real-time calculation
    const amountEl = document.getElementById('amount');
    if (amountEl) {
        amountEl.addEventListener('input', updateCashDisplay);
    }

    // Branch change - reload heads
    const branchEl = document.getElementById('branch');
    if (branchEl) {
        branchEl.addEventListener('change', function () {
            loadExpenseHeads(document.getElementById('payType').value);
            loadExpenses(); // Reload list for selected branch
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
        // Ctrl+S to save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveExpense();
        }
        // Escape to clear
        if (e.key === 'Escape') {
            clearForm();
        }
    });
}

// Handle Pay Type Change (Expense vs Receipt)
function handlePayTypeChange() {
    const payType = document.getElementById('payType').value;
    const isReceipt = payType === 'receipt';

    // Update UI labels based on mode
    const headLabel = document.querySelector('label[for="head"]') || document.querySelector('.form-group:has(#head) label');

    // Change colors or styling if needed
    const formPanel = document.querySelector('.form-panel');
    if (formPanel) {
        if (isReceipt) {
            formPanel.style.borderColor = '#28a745'; // Green for receipt
        } else {
            formPanel.style.borderColor = '#dc3545'; // Red for expense
        }
    }

    // Reload heads based on type
    loadExpenseHeads(payType);

    // Clear sub head
    const subHeadEl = document.getElementById('subHead');
    if (subHeadEl) {
        subHeadEl.innerHTML = '<option value="">-- Select Sub Head --</option>';
    }

    // Reload expenses list filtered by type
    loadExpenses();
}

// Load Expense Heads from API (with fallback to hardcoded)
// Load Expense Heads from API (with fallback removed)
async function loadExpenseHeads(type = 'expense') {
    try {
        const headEl = document.getElementById('head');
        if (!headEl) return;

        const token = localStorage.getItem('token');
        const branch = document.getElementById('branch')?.value || 'Shop';

        const response = await fetch(`/api/v1/expense-heads?parentId=null&type=${type}&branch=${encodeURIComponent(branch)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            headEl.innerHTML = '<option value="">-- Select Head --</option>';

            if (data.data && data.data.length > 0) {
                // Filter actives only for dropdown
                const actives = data.data.filter(h => h.isActive !== false);
                actives.forEach(head => {
                    const option = document.createElement('option');
                    option.value = head.name;
                    option.setAttribute('data-id', head._id);
                    option.textContent = head.name;
                    headEl.appendChild(option);
                });
                expenseHeads = actives; // Store filtered list only
            } else {
                expenseHeads = [];
            }
        }
    } catch (error) {
        console.error('Error loading heads:', error);
    }
}

// Load Sub Heads based on selected Head (from API with fallback removed)
async function loadSubHeads(headName) {
    try {
        const subHeadEl = document.getElementById('subHead');
        if (!subHeadEl || !headName) {
            if (subHeadEl) subHeadEl.innerHTML = '<option value="">-- Select Sub Head --</option>';
            return;
        }

        const token = localStorage.getItem('token');

        // Try to find the head ID from expenseHeads array
        let headId = null;
        if (Array.isArray(expenseHeads) && expenseHeads.length > 0) {
            const headObj = expenseHeads.find(h => h.name === headName);
            if (headObj) headId = headObj._id;
        }

        if (headId) {
            const branch = document.getElementById('branch')?.value || 'Shop';
            const response = await fetch(`/api/v1/expense-heads?parentId=${headId}&branch=${encodeURIComponent(branch)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                subHeadEl.innerHTML = '<option value="">-- Select Sub Head --</option>';

                if (data.data && data.data.length > 0) {
                    // Filter actives only
                    const actives = data.data.filter(s => s.isActive !== false);
                    actives.forEach(sub => {
                        const option = document.createElement('option');
                        option.value = sub.name;
                        option.setAttribute('data-id', sub._id);
                        option.textContent = sub.name;
                        subHeadEl.appendChild(option);
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error loading sub heads:', error);
    }
}

// Load Cash In Hand
async function loadCashInHand() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/expenses/cash-in-hand', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            cashInHand = data.data?.amount || 0;
        } else {
            // Fallback - calculate from closing sheet or use default
            cashInHand = 0;
        }

        updateCashDisplay();
    } catch (error) {
        console.error('Error loading cash in hand:', error);
        cashInHand = 0;
        updateCashDisplay();
    }
}

// Load Branches
async function loadBranches() {
    try {
        const branchEl = document.getElementById('branch');
        if (!branchEl) return;

        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                // If only one branch, don't show "Select Branch" placeholder
                if (data.data.length === 1) {
                    branchEl.innerHTML = '';
                } else {
                    branchEl.innerHTML = '<option value="">Select Branch</option>';
                }

                data.data.forEach(store => {
                    const option = document.createElement('option');
                    option.value = store.name;
                    option.textContent = store.name;
                    branchEl.appendChild(option);
                });
                // Default to first branch if available (prevent showing "All" by default)
                if (data.data.length >= 1) {
                    branchEl.value = data.data[0].name;
                }
            }
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

// Update Cash Display
function updateCashDisplay() {
    const displayEl = document.getElementById('cashInHandDisplay');
    if (!displayEl) return;

    const payType = document.getElementById('payType')?.value || 'expense';
    const amount = parseFloat(document.getElementById('amount')?.value) || 0;

    let projectedCash = cashInHand;

    if (payType === 'expense') {
        projectedCash = cashInHand - amount;
    } else {
        projectedCash = cashInHand + amount;
    }

    displayEl.textContent = projectedCash.toLocaleString();

    // Change color based on value
    if (projectedCash < 0) {
        displayEl.style.color = '#ff4444';
    } else {
        displayEl.style.color = 'lime';
    }
}

// Load Expenses (filtered by type based on selected mode)
async function loadExpenses() {
    try {
        const token = localStorage.getItem('token');
        const fromDate = document.getElementById('filterFromDate')?.value || '';
        const toDate = document.getElementById('filterToDate')?.value || '';
        const payType = document.getElementById('payType')?.value || 'expense';

        let queryParams = `?page=${currentPage}&limit=${currentLimit}`;
        if (fromDate) queryParams += `&startDate=${fromDate}`;
        if (toDate) queryParams += `&endDate=${toDate}`;

        // Filter by type (expense or receipt) based on selected mode
        queryParams += `&type=${payType}`;

        // Filter by Branch if selected
        const branchVal = document.getElementById('branch')?.value;
        if (branchVal) queryParams += `&branch=${encodeURIComponent(branchVal)}`;

        const response = await fetch(`/api/v1/expenses${queryParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            displayExpenses(data.data || []);
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
    }
}

// Display Expenses in Table
function displayExpenses(expenses) {
    const tbody = document.getElementById('expensesTableBody');
    const totalAmountEl = document.getElementById('totalAmount');

    if (!tbody) return;

    if (!expenses || expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No entries found</td></tr>';
        if (totalAmountEl) totalAmountEl.textContent = '0';
        return;
    }

    let totalAmount = 0;

    tbody.innerHTML = expenses.map(expense => {
        const type = expense.type || (expense.amount > 0 ? 'expense' : 'receipt');
        const typeLabel = type === 'receipt' ? 'Received' : 'Paid';
        const typeClass = type === 'receipt' ? 'text-success' : 'text-danger';
        const amount = Math.abs(expense.amount || 0);

        totalAmount += expense.amount || 0;

        return `
            <tr>
                <td>${expense.date ? new Date(expense.date).toLocaleDateString() : ''}</td>
                <td><span class="${typeClass}">${typeLabel}</span></td>
                <td>${expense.head || ''}</td>
                <td>${expense.subHead || ''}</td>
                <td class="text-end ${typeClass}">${amount.toLocaleString()}</td>
                <td>${expense.notes || expense.description || ''}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="printExpenseRow('${expense._id}')" title="Print">
                        <i class="fas fa-print"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="editExpense('${expense._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteExpense('${expense._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (totalAmountEl) {
        totalAmountEl.textContent = totalAmount.toLocaleString();
        totalAmountEl.className = totalAmount >= 0 ? 'fw-bold text-danger text-end' : 'fw-bold text-success text-end';
    }
}

// Save Expense (Create or Update)
async function saveExpense() {
    try {
        const expenseId = document.getElementById('expenseId')?.value || '';
        const payType = document.getElementById('payType')?.value || 'expense';
        const date = document.getElementById('expenseDate')?.value;
        const branch = document.getElementById('branch')?.value || 'Shop';
        const head = document.getElementById('head')?.value;
        const subHead = document.getElementById('subHead')?.value || '';
        const amount = parseFloat(document.getElementById('amount')?.value) || 0;
        const payMode = document.getElementById('payMode')?.value || 'cash';
        const cashAccount = document.getElementById('cashAccount')?.value || 'Cash in Hand (Shop)';
        const remarks = document.getElementById('remarks')?.value || '';

        // Validation
        if (!head) {
            showError('Please select a Head');
            return;
        }
        if (!amount || amount <= 0) {
            showError('Please enter a valid amount');
            return;
        }
        if (!date) {
            showError('Please select a date');
            return;
        }

        showLoading();

        const token = localStorage.getItem('token');

        // Build form data matching the Expense model fields
        const formData = {
            type: payType,
            date: new Date(date).toISOString(),
            branch: branch,
            head: head,
            subHead: subHead,
            amount: amount,
            paymentMode: payMode,
            cashAccount: cashAccount,
            notes: remarks,
            description: remarks
        };

        console.log('Saving expense:', formData, 'ID:', expenseId);

        // Determine if this is an update or create
        const isUpdate = expenseId && expenseId.trim() !== '';
        const url = isUpdate ? `/api/v1/expenses/${expenseId}` : '/api/v1/expenses';
        const method = isUpdate ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        const responseData = await response.json();
        console.log('Response:', responseData);

        if (response.ok) {
            const action = isUpdate ? 'updated' : 'saved';
            showSuccess(payType === 'expense' ? `Expense ${action} successfully` : `Receipt ${action} successfully`);
            clearForm();
            loadExpenses();
            loadCashInHand();
        } else {
            showError(responseData.message || responseData.error || 'Failed to save');
        }
    } catch (error) {
        console.error('Error saving:', error);
        showError('Failed to save: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Edit Expense
// Edit Expense
async function editExpense(expenseId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/expenses/${expenseId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const expense = data.data;

            console.log('Editing expense:', expense);

            // Store ID
            const expenseIdEl = document.getElementById('expenseId');
            if (expenseIdEl) expenseIdEl.value = expenseId;

            // 1. Set Branch first (Crucial for filtering heads)
            document.getElementById('branch').value = expense.branch || 'Shop';

            // 2. Pay Type & UI Styling
            const payType = expense.type || 'expense';
            document.getElementById('payType').value = payType;

            const formPanel = document.querySelector('.form-panel');
            if (formPanel) {
                formPanel.style.borderColor = payType === 'receipt' ? '#28a745' : '#dc3545';
            }

            // 3. Load Heads (Await completion)
            await loadExpenseHeads(payType);

            // 4. Set Head
            document.getElementById('head').value = expense.head || '';

            // 5. Load SubHeads (Await completion)
            if (expense.head) {
                await loadSubHeads(expense.head);
                document.getElementById('subHead').value = expense.subHead || '';
            } else {
                document.getElementById('subHead').innerHTML = '<option value="">-- Select Sub Head --</option>';
            }

            // 6. Set other fields
            document.getElementById('expenseDate').value = expense.date ? expense.date.split('T')[0] : '';
            document.getElementById('amount').value = Math.abs(expense.amount || 0);
            document.getElementById('payMode').value = expense.paymentMode || 'cash';
            document.getElementById('cashAccount').value = expense.cashAccount || 'Cash in Hand (Shop)';
            document.getElementById('remarks').value = expense.notes || expense.description || '';

            // Update cash display
            updateCashDisplay();

            // Scroll to form
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Notification removed as per user request
            // showSuccess('Expense loaded for editing'); 

        } else {
            const errorData = await response.json();
            showError(errorData.message || 'Failed to load expense');
        }
    } catch (error) {
        console.error('Error loading expense:', error);
        showError('Failed to load expense: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Delete Expense
async function deleteExpense(expenseId) {
    if (!confirm('Are you sure you want to delete this entry?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/expenses/${expenseId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showSuccess('Entry deleted successfully');
            loadExpenses();
            loadCashInHand();
        } else {
            showError('Failed to delete entry');
        }
    } catch (error) {
        console.error('Error deleting:', error);
        showError('Failed to delete');
    } finally {
        hideLoading();
    }
}


// Add New Head - Opens Manage Heads Modal
function addHead() {
    openHeadsModal();
}

// Add New Sub Head - Opens Manage Heads Modal
function addSubHead() {
    openHeadsModal();
}

// Clear Form
function clearForm() {
    const today = new Date().toISOString().split('T')[0];

    // Clear the expense ID (important for switching from edit to new mode)
    const expenseIdEl = document.getElementById('expenseId');
    if (expenseIdEl) expenseIdEl.value = '';

    document.getElementById('payType').value = 'expense';
    document.getElementById('expenseDate').value = today;
    // document.getElementById('branch').value = 'Shop'; // Removed hardcoded default
    // Select first option in the branch dropdown
    const branchEl = document.getElementById('branch');
    if (branchEl && branchEl.options.length > 0) {
        branchEl.selectedIndex = 0;
    }
    document.getElementById('head').value = '';
    document.getElementById('subHead').innerHTML = '<option value="">-- Select Sub Head --</option>';
    document.getElementById('amount').value = '';
    document.getElementById('payMode').value = 'cash';
    document.getElementById('cashAccount').value = 'Cash in Hand (Shop)';
    document.getElementById('remarks').value = '';

    handlePayTypeChange();
    updateCashDisplay();
}


// Print Individual Expense Row
function printExpenseRow(expenseId) {
    window.open(`/voucher-print?type=expense&id=${expenseId}`, '_blank', 'width=1000,height=800');
}

// Print Expense Voucher (From Form)
function printExpense() {
    const expenseId = document.getElementById('expenseId').value;
    if (!expenseId) {
        showError('Please save the expense first before printing');
        return;
    }
    window.open(`/voucher-print?type=expense&id=${expenseId}`, '_blank', 'width=1000,height=800');
}

// Print List
function printList() {
    document.body.classList.add('print-mode-list');
    window.print();
    setTimeout(() => {
        document.body.classList.remove('print-mode-list');
    }, 500);
}

// Helper functions (if not defined in desktop-ui.js)
function showLoading() {
    // Show loading indicator
    document.body.style.cursor = 'wait';
}

function hideLoading() {
    document.body.style.cursor = 'default';
}

function showSuccess(message) {
    alert('✅ ' + message);
}

function showError(message) {
    alert('❌ ' + message);
}

// ============================================
// EXPENSE HEADS MANAGEMENT
// ============================================

let headsModal = null;
let headFormModal = null;

// Open Heads Management Modal
function openHeadsModal() {
    if (!headsModal) {
        headsModal = new bootstrap.Modal(document.getElementById('headsModal'));
    }
    const branch = document.getElementById('branch').value || 'Shop';
    document.getElementById('headsModalLabel').innerHTML = `<i class="fas fa-list"></i> Manage Expense Heads <span class="badge bg-warning text-dark ms-2">${branch}</span>`;

    headsModal.show();
    loadHeadsList();
    loadParentHeadDropdown();
}

// Load Heads List for Modal
async function loadHeadsList() {
    try {
        const tbody = document.getElementById('headsTableBody');
        if (!tbody) return;

        const token = localStorage.getItem('token');
        const branch = document.getElementById('branch')?.value || 'Shop';

        // Show branch info in modal title or somewhere if possible, for now just use it
        console.log('Loading heads for branch:', branch);

        const response = await fetch(`/api/v1/expense-heads/hierarchy?branch=${encodeURIComponent(branch)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const heads = data.data || [];

            if (heads.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No heads found. Click "Load Defaults" to add default heads.</td></tr>';
                return;
            }

            // Determine user role for delete permission
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const isAdmin = user.role === 'admin';

            tbody.innerHTML = heads.map(head => {
                const subHeadsHtml = (head.subHeads || []).map(sub => {
                    const isActiveSub = sub.isActive !== false;
                    const subStyle = isActiveSub ? '' : 'text-decoration: line-through; opacity: 0.7;';

                    return `<span class="badge bg-secondary me-1" style="${subStyle}">${sub.name} 
                        <i class="fas fa-edit ms-2 me-1" style="cursor:pointer" onclick="editHead('${sub._id}')" title="Edit"></i>
                        ${isAdmin ? `<i class="fas fa-trash" style="cursor:pointer" onclick="deleteHead('${sub._id}', '${sub.name}')" title="Delete"></i>` : ''}
                    </span>`;
                }).join('');

                const typeLabel = head.type === 'both' ? 'Both' : (head.type === 'expense' ? 'Expense' : 'Receipt');
                const typeClass = head.type === 'both' ? 'bg-info' : (head.type === 'expense' ? 'bg-danger' : 'bg-success');
                const isActiveHead = head.isActive !== false;
                const headStyle = isActiveHead ? '' : 'text-decoration: line-through; color: #999;';

                return `
                    <tr>
                        <td style="${headStyle}"><strong>${head.name}</strong> ${!isActiveHead ? '(Inactive)' : ''}</td>
                        <td><span class="badge ${typeClass}">${typeLabel}</span></td>
                        <td>
                            ${subHeadsHtml || '<em class="text-muted">No sub-heads</em>'}
                            <button class="btn btn-outline-success btn-sm ms-2" onclick="addNewSubHead('${head._id}', '${head.name}')" title="Add Sub Head">
                                <i class="fas fa-plus"></i>
                            </button>
                        </td>
                        <td>
                            <button class="btn btn-warning btn-sm" onclick="editHead('${head._id}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${isAdmin ? `
                            <button class="btn btn-danger btn-sm" onclick="deleteHead('${head._id}', '${head.name}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load heads</td></tr>';
        }
    } catch (error) {
        console.error('Error loading heads:', error);
        document.getElementById('headsTableBody').innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading heads</td></tr>';
    }
}

// Add New Main Head
function addNewHead() {
    document.getElementById('editHeadId').value = '';
    document.getElementById('editParentId').value = '';
    document.getElementById('headNameInput').value = '';
    document.getElementById('headTypeSelect').value = 'both';
    document.getElementById('headActiveCheck').checked = true;
    document.getElementById('parentHeadGroup').style.display = 'none';

    const branch = document.getElementById('branch').value || 'Shop';
    document.getElementById('headFormModalLabel').innerHTML = `<i class="fas fa-plus"></i> Add New Head <span class="badge bg-light text-dark ms-2">${branch}</span>`;

    if (!headFormModal) {
        headFormModal = new bootstrap.Modal(document.getElementById('headFormModal'));
    }
    headFormModal.show();
}

// Add New Sub Head
function addNewSubHead(parentId, parentName) {
    document.getElementById('editHeadId').value = '';
    document.getElementById('editParentId').value = parentId;
    document.getElementById('headNameInput').value = '';
    document.getElementById('headTypeSelect').value = 'both';
    document.getElementById('headActiveCheck').checked = true;
    document.getElementById('parentHeadGroup').style.display = 'block';
    document.getElementById('parentHeadName').value = parentName;

    const branch = document.getElementById('branch').value || 'Shop';
    document.getElementById('headFormModalLabel').innerHTML = `<i class="fas fa-plus"></i> Add Sub Head <span class="badge bg-light text-dark ms-2">${branch}</span>`;

    if (!headFormModal) {
        headFormModal = new bootstrap.Modal(document.getElementById('headFormModal'));
    }
    headFormModal.show();
}

// Edit Head
async function editHead(headId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/expense-heads/${headId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const head = data.data;

            document.getElementById('editHeadId').value = head._id;
            document.getElementById('editParentId').value = head.parentId || '';
            document.getElementById('headNameInput').value = head.name;
            document.getElementById('headTypeSelect').value = head.type || 'both';
            document.getElementById('headActiveCheck').checked = head.isActive !== false;

            if (head.parentId) {
                document.getElementById('parentHeadGroup').style.display = 'block';
                document.getElementById('parentHeadName').value = 'Sub Head';
            } else {
                document.getElementById('parentHeadGroup').style.display = 'none';
            }

            document.getElementById('headFormModalLabel').innerHTML = '<i class="fas fa-edit"></i> Edit Head';

            if (!headFormModal) {
                headFormModal = new bootstrap.Modal(document.getElementById('headFormModal'));
            }
            headFormModal.show();
        }
    } catch (error) {
        console.error('Error loading head:', error);
        showError('Failed to load head');
    }
}

// Save Head (Create or Update)
async function saveHead() {
    try {
        const headId = document.getElementById('editHeadId').value;
        const parentId = document.getElementById('editParentId').value;
        const name = document.getElementById('headNameInput').value.trim();
        const type = document.getElementById('headTypeSelect').value;
        const isActive = document.getElementById('headActiveCheck').checked;

        if (!name) {
            showError('Please enter a name');
            return;
        }

        const token = localStorage.getItem('token');
        const branch = document.getElementById('branch')?.value || 'Shop';

        const formData = {
            name: name,
            type: type,
            parentId: parentId || null,
            branch: branch,
            isActive: isActive
        };

        const isUpdate = headId && headId.trim() !== '';
        const url = isUpdate ? `/api/v1/expense-heads/${headId}` : '/api/v1/expense-heads';
        const method = isUpdate ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        const responseData = await response.json();

        if (response.ok) {
            showSuccess(isUpdate ? 'Head updated successfully' : 'Head added successfully');
            headFormModal.hide();
            loadHeadsList();
            loadExpenseHeads(document.getElementById('payType').value); // Refresh main dropdown
        } else {
            showError(responseData.message || 'Failed to save head');
        }
    } catch (error) {
        console.error('Error saving head:', error);
        showError('Failed to save head');
    }
}

// Delete Head
async function deleteHead(headId, headName) {
    if (!confirm(`Are you sure you want to delete "${headName}"?`)) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/expense-heads/${headId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showSuccess('Head deleted successfully');
            loadHeadsList();
            loadExpenseHeads(document.getElementById('payType').value); // Refresh main dropdown
        } else {
            const data = await response.json();
            showError(data.message || 'Failed to delete head');
        }
    } catch (error) {
        console.error('Error deleting head:', error);
        showError('Failed to delete head');
    }
}

// Seed Default Heads
async function seedDefaultHeads() {
    if (!confirm('This will add default expense and receipt heads. Continue?')) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/expense-heads/seed', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess(data.message || 'Default heads loaded successfully');
            loadHeadsList();
            loadParentHeadDropdown();
            loadExpenseHeads(document.getElementById('payType').value);
        } else {
            showError(data.message || 'Failed to load defaults');
        }
    } catch (error) {
        console.error('Error seeding heads:', error);
        showError('Failed to load defaults');
    }
}

// Load Parent Head Dropdown for Sub-Head Creation
async function loadParentHeadDropdown() {
    try {
        const selectEl = document.getElementById('parentHeadSelect');
        if (!selectEl) return;

        const token = localStorage.getItem('token');
        const branch = document.getElementById('branch')?.value || 'Shop';

        const response = await fetch(`/api/v1/expense-heads?parentId=null&branch=${encodeURIComponent(branch)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const heads = data.data || [];

            selectEl.innerHTML = '<option value="">-- Select Head --</option>';
            heads.forEach(head => {
                const option = document.createElement('option');
                option.value = head._id;
                option.textContent = head.name;
                selectEl.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading parent heads:', error);
    }
}

// Quick Add Head (from inline input)
async function quickAddHead() {
    const nameInput = document.getElementById('newHeadName');
    const name = nameInput?.value?.trim();

    if (!name) {
        showError('Please enter a head name');
        nameInput?.focus();
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const branch = document.getElementById('branch')?.value || 'Shop';

        const response = await fetch('/api/v1/expense-heads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: name,
                type: 'both',
                parentId: null,
                branch: branch
            })
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess(`Head "${name}" added successfully`);
            nameInput.value = '';
            loadHeadsList();
            loadParentHeadDropdown();
            loadExpenseHeads(document.getElementById('payType').value);
        } else {
            showError(data.message || 'Failed to add head');
        }
    } catch (error) {
        console.error('Error adding head:', error);
        showError('Failed to add head');
    }
}

// Quick Add Sub-Head (from inline input with parent selection)
async function quickAddSubHead() {
    const parentSelect = document.getElementById('parentHeadSelect');
    const nameInput = document.getElementById('newSubHeadName');

    const parentId = parentSelect?.value;
    const name = nameInput?.value?.trim();

    if (!parentId) {
        showError('Please select a parent head first');
        parentSelect?.focus();
        return;
    }

    if (!name) {
        showError('Please enter a sub-head name');
        nameInput?.focus();
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const branch = document.getElementById('branch')?.value || 'Shop';

        const response = await fetch('/api/v1/expense-heads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: name,
                type: 'both',
                parentId: parentId,
                branch: branch
            })
        });

        const data = await response.json();

        if (response.ok) {
            const parentName = parentSelect.options[parentSelect.selectedIndex].text;
            showSuccess(`Sub-head "${name}" added under "${parentName}"`);
            nameInput.value = '';
            loadHeadsList();
        } else {
            showError(data.message || 'Failed to add sub-head');
        }
    } catch (error) {
        console.error('Error adding sub-head:', error);
        showError('Failed to add sub-head');
    }
}

// ============================================
// EXPENSE REPORT FUNCTIONALITY
// ============================================

let reportModal = null;

// Open Report Modal
function openReportModal() {
    if (!reportModal) {
        reportModal = new bootstrap.Modal(document.getElementById('reportModal'));
    }

    // Set default dates (current month)
    setReportDateRange('month');

    // Load filters
    loadReportFilters();

    reportModal.show();
}

// Load Report Filters (Branches, Heads, Sub Heads)
async function loadReportFilters() {
    const token = localStorage.getItem('token');

    // Load Branches
    try {
        const branchSelect = document.getElementById('reportBranch');
        const response = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            branchSelect.innerHTML = '<option value="">All Branches</option>';
            (data.data || []).forEach(store => {
                branchSelect.innerHTML += `<option value="${store.name}">${store.name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }

    // Load Heads
    try {
        const headSelect = document.getElementById('reportHead');
        const response = await fetch('/api/v1/expense-heads?parentId=null', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            headSelect.innerHTML = '<option value="">All Heads</option>';
            (data.data || []).forEach(head => {
                headSelect.innerHTML += `<option value="${head.name}" data-id="${head._id}">${head.name}</option>`;
            });

            // Add change listener to load sub-heads
            headSelect.onchange = async function () {
                const subHeadSelect = document.getElementById('reportSubHead');
                subHeadSelect.innerHTML = '<option value="">All Sub Heads</option>';

                if (this.value) {
                    const selectedOption = this.options[this.selectedIndex];
                    const headId = selectedOption.getAttribute('data-id');

                    if (headId) {
                        const subResponse = await fetch(`/api/v1/expense-heads?parentId=${headId}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        if (subResponse.ok) {
                            const subData = await subResponse.json();
                            (subData.data || []).forEach(sub => {
                                subHeadSelect.innerHTML += `<option value="${sub.name}">${sub.name}</option>`;
                            });
                        }
                    }
                }
            };
        }
    } catch (error) {
        console.error('Error loading heads:', error);
    }
}

// Set Report Date Range
function setReportDateRange(range) {
    const today = new Date();
    const fromDateEl = document.getElementById('reportFromDate');
    const toDateEl = document.getElementById('reportToDate');

    let fromDate = new Date();
    let toDate = new Date();

    switch (range) {
        case 'today':
            fromDate = today;
            toDate = today;
            break;
        case 'week':
            const dayOfWeek = today.getDay();
            fromDate = new Date(today);
            fromDate.setDate(today.getDate() - dayOfWeek);
            toDate = new Date(today);
            toDate.setDate(fromDate.getDate() + 6);
            break;
        case 'month':
            fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
            toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case 'lastMonth':
            fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            toDate = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'year':
            fromDate = new Date(today.getFullYear(), 0, 1);
            toDate = new Date(today.getFullYear(), 11, 31);
            break;
    }

    fromDateEl.value = fromDate.toISOString().split('T')[0];
    toDateEl.value = toDate.toISOString().split('T')[0];
}

// Preview Report (in current page)
async function previewReport() {
    const params = buildReportParams();

    // Load data and show in current table
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/expenses?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            displayExpenses(data.data || []);

            // Close modal
            if (reportModal) reportModal.hide();

            showSuccess(`Found ${(data.data || []).length} records`);
        } else {
            showError('Failed to load report data');
        }
    } catch (error) {
        console.error('Error loading report:', error);
        showError('Error loading report');
    }
}

// Generate Report (open print page)
function generateReport() {
    const params = buildReportParams();

    // Open print page with parameters
    window.open(`/print-expense-report?${params}`, '_blank');
}

// Build Report URL Parameters
function buildReportParams() {
    const startDate = document.getElementById('reportFromDate').value;
    const endDate = document.getElementById('reportToDate').value;
    const branch = document.getElementById('reportBranch').value;
    const type = document.getElementById('reportType').value;
    const head = document.getElementById('reportHead').value;
    const subHead = document.getElementById('reportSubHead').value;
    const groupBy = document.getElementById('reportGroupBy').value;
    const search = document.getElementById('reportSearch').value;

    let params = [];
    if (startDate) params.push(`startDate=${startDate}`);
    if (endDate) params.push(`endDate=${endDate}`);
    if (branch) params.push(`branch=${encodeURIComponent(branch)}`);
    if (type) params.push(`type=${type}`);
    if (head) params.push(`head=${encodeURIComponent(head)}`);
    if (subHead) params.push(`subHead=${encodeURIComponent(subHead)}`);
    if (groupBy) params.push(`groupBy=${groupBy}`);
    if (search) params.push(`search=${encodeURIComponent(search)}`);

    return params.join('&');
}

// Check URL params to auto-open report modal (from sidebar link)
function checkAutoOpenReport() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openReport') === 'true') {
        setTimeout(() => {
            openReportModal();
        }, 500);
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', function () {
    checkAutoOpenReport();
});

