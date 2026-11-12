// Payments Management JavaScript - Desktop Design
let currentPage = 1;
let currentLimit = 10;
let currentTab = 'supplier';
let parties = [];
let cashInHand = 0;

document.addEventListener('DOMContentLoaded', function () {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    // Set user name
    setUserName();

    // Initialize payments page
    initPaymentsPage();
});

// Set user name in header
function setUserName() {
    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.name || user.email;
    }
}

// Initialize payments page
function initPaymentsPage() {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('paymentDate').value = today;
    document.getElementById('filterStartDate').value = today;
    document.getElementById('filterEndDate').value = today;

    // Load data
    loadParties();
    loadCashInHand();
    loadTransactions();
    generateVoucherNumber();

    // Event listeners
    document.getElementById('party').addEventListener('change', function () {
        const selectedParty = parties.find(p => p._id === this.value);
        if (selectedParty) {
            document.getElementById('preBalance').textContent = (selectedParty.currentBalance || 0).toFixed(2);
            calculateNewBalance();
        }
    });

    document.getElementById('amount').addEventListener('input', calculateNewBalance);

    document.getElementById('paymentMode').addEventListener('change', function () {
        const bankDetails = document.getElementById('bankDetails');
        if (this.value === 'bank' || this.value === 'cheque') {
            bankDetails.style.display = 'block';
        } else {
            bankDetails.style.display = 'none';
        }
    });
}

// Switch between supplier and customer tabs
function switchTab(type) {
    currentTab = type;
    document.getElementById('paymentType').value = type;

    // Update active tab
    const tabs = document.querySelectorAll('.payment-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    event.target.closest('.payment-tab').classList.add('active');

    // Update labels
    if (type === 'supplier') {
        document.getElementById('pageTitle').textContent = 'Supplier Payments';
        document.getElementById('partyLabel').textContent = 'Supplier';
        document.querySelector('#party option:first-child').textContent = '-- Select Supplier --';
        document.getElementById('balanceLabel').textContent = 'Pre Balance:';
        document.getElementById('newBalanceLabel').textContent = 'New Balance:';
    } else {
        document.getElementById('pageTitle').textContent = 'Customer Payments';
        document.getElementById('partyLabel').textContent = 'Customer';
        document.querySelector('#party option:first-child').textContent = '-- Select Customer --';
        document.getElementById('balanceLabel').textContent = 'Received:';
        document.getElementById('newBalanceLabel').textContent = 'New Balance:';
    }

    // Reload parties and transactions
    loadParties();
    loadTransactions();
    clearForm();
}

// Load parties (suppliers or customers)
async function loadParties() {
    try {
        const token = localStorage.getItem('token');
        const partyType = currentTab === 'supplier' ? 'supplier' : 'customer';
        const response = await fetch(`/api/v1/parties?partyType=${partyType}&limit=1000`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            parties = data.data || [];
            const partySelect = document.getElementById('party');
            const placeholder = currentTab === 'supplier' ? '-- Select Supplier --' : '-- Select Customer --';
            partySelect.innerHTML = `<option value="">${placeholder}</option>`;

            parties.forEach(party => {
                partySelect.innerHTML += `<option value="${party._id}">${party.name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading parties:', error);
    }
}

// Load cash in hand
async function loadCashInHand() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/cash-balance', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            cashInHand = data.balance || 0;
            document.getElementById('cashInHand').textContent = cashInHand.toFixed(2);
        } else {
            // If endpoint doesn't exist, show default
            document.getElementById('cashInHand').textContent = '0.00';
        }
    } catch (error) {
        console.error('Error loading cash in hand:', error);
        document.getElementById('cashInHand').textContent = '0.00';
    }
}

// Generate voucher number
async function generateVoucherNumber() {
    try {
        const token = localStorage.getItem('token');
        const type = currentTab === 'supplier' ? 'supplier-payment' : 'customer-payment';
        const response = await fetch(`/api/v1/payments?type=${type}&limit=1&sort=-createdAt`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const lastPayment = data.data[0];
            let newVoucher = currentTab === 'supplier' ? 'SPV-001' : 'CPV-001';

            if (lastPayment && lastPayment.voucherNo) {
                const prefix = currentTab === 'supplier' ? 'SPV' : 'CPV';
                newVoucher = `${prefix}-${String(lastNumber + 1).padStart(3, '0')}`;
            }

            document.getElementById('voucherNo').value = newVoucher;
        }
    } catch (error) {
        console.error('Error generating voucher number:', error);
        document.getElementById('voucherNo').value = currentTab === 'supplier' ? 'SPV-001' : 'CPV-001';
    }
}

// Calculate new balance
function calculateNewBalance() {
    const preBalance = parseFloat(document.getElementById('preBalance').textContent) || 0;
    const amount = parseFloat(document.getElementById('amount').value) || 0;

    let newBalance;
    if (currentTab === 'supplier') {
        // For suppliers, payment reduces balance (negative balance means we owe them)
        newBalance = preBalance - amount;
    } else {
        // For customers, payment increases balance (positive balance means they owe us)
        newBalance = preBalance + amount;
    }

    document.getElementById('newBalance').textContent = newBalance.toFixed(2);
}

// Save payment
async function savePayment() {
    try {
        const partyId = document.getElementById('party').value;
        const amount = parseFloat(document.getElementById('amount').value);

        if (!partyId) {
            showError(`Please select a ${currentTab}`);
            return;
        }

        if (!amount || amount <= 0) {
            showError('Please enter a valid amount');
            return;
        }

        showLoading();

        const token = localStorage.getItem('token');
        const paymentId = document.getElementById('paymentId').value;

        const formData = {
            voucherNo: document.getElementById('voucherNo').value,
            date: document.getElementById('paymentDate').value,
            party: partyId,
            partyType: currentTab,
            amount: amount,
            paymentMode: document.getElementById('paymentMode').value,
            bankName: document.getElementById('bankName').value,
            referenceNo: document.getElementById('referenceNo').value,
            remarks: document.getElementById('remarks').value,
            type: currentTab === 'supplier' ? 'supplier-payment' : 'customer-payment'
        };

        const url = paymentId ? `/api/v1/payments/${paymentId}` : '/api/v1/payments';
        const method = paymentId ? 'PUT' : 'POST';

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
            loadTransactions();
            loadCashInHand();
            showSuccess('Payment saved successfully');
        } else {
            const error = await response.json();
            showError(error.message || 'Failed to save payment');
        }
    } catch (error) {
        console.error('Error saving payment:', error);
        showError('Failed to save payment');
    } finally {
        hideLoading();
    }
}

// Load transactions
async function loadTransactions(page = 1, limit = 10) {
    try {
        showLoading();

        currentPage = page;
        currentLimit = limit;

        const token = localStorage.getItem('token');
        const startDate = document.getElementById('filterStartDate').value;
        const endDate = document.getElementById('filterEndDate').value;
        const type = currentTab === 'supplier' ? 'supplier-payment' : 'customer-payment';

        let queryParams = `?page=${page}&limit=${limit}&type=${type}`;
        if (startDate) queryParams += `&startDate=${startDate}`;
        if (endDate) queryParams += `&endDate=${endDate}`;

        const response = await fetch(`/api/v1/payments${queryParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            displayTransactions(data.data);
            updatePagination(data.pagination);
        } else {
            throw new Error('Failed to load transactions');
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        document.getElementById('transactionsBody').innerHTML =
            '<tr><td colspan="6" class="text-center">No transactions found</td></tr>';
    } finally {
        hideLoading();
    }
}

// Display transactions
function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionsBody');

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No transactions found</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(payment => `
        <tr>
            <td>${formatDate(payment.date)}</td>
            <td>${payment.voucherNo}</td>
            <td>${payment.party?.name || '-'}</td>
            <td class="text-right">${(payment.amount || 0).toFixed(2)}</td>
            <td><span class="badge badge-info">${payment.paymentMode}</span></td>
            <td class="text-center">
                <button class="icon-btn" onclick="editPayment('${payment._id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="icon-btn danger" onclick="deletePayment('${payment._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Edit payment
async function editPayment(paymentId) {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/payments/${paymentId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const payment = await response.json();

            // Populate form
            document.getElementById('paymentId').value = payment._id;
            document.getElementById('voucherNo').value = payment.voucherNo;
            document.getElementById('paymentDate').value = payment.date.split('T')[0];
            document.getElementById('party').value = payment.party._id || payment.party;
            document.getElementById('amount').value = payment.amount;
            document.getElementById('paymentMode').value = payment.paymentMode || 'cash';
            document.getElementById('bankName').value = payment.bankName || '';
            document.getElementById('referenceNo').value = payment.referenceNo || '';
            document.getElementById('remarks').value = payment.remarks || '';

            // Trigger party change to update balance
            document.getElementById('party').dispatchEvent(new Event('change'));

            // Show bank details if needed
            if (payment.paymentMode === 'bank' || payment.paymentMode === 'cheque') {
                document.getElementById('bankDetails').style.display = 'block';
            }

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

            showSuccess('Payment loaded for editing');
        } else {
            showError('Failed to load payment data');
        }
    } catch (error) {
        console.error('Error loading payment data:', error);
        showError('Failed to load payment data');
    } finally {
        hideLoading();
    }
}

// Delete payment
async function deletePayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment?')) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/payments/${paymentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            loadTransactions(currentPage, currentLimit);
            loadCashInHand();
            showSuccess('Payment deleted successfully');
        } else {
            showError('Failed to delete payment');
        }
    } catch (error) {
        console.error('Error deleting payment:', error);
        showError('Failed to delete payment');
    } finally {
        hideLoading();
    }
}

// Filter transactions
function filterTransactions() {
    loadTransactions(1, currentLimit);
}

// Clear form
function clearForm() {
    document.getElementById('paymentForm').reset();
    document.getElementById('paymentId').value = '';
    document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('paymentMode').value = 'cash';
    document.getElementById('bankDetails').style.display = 'none';
    document.getElementById('preBalance').textContent = '0.00';
    document.getElementById('newBalance').textContent = '0.00';
    generateVoucherNumber();
}

// Print voucher
function printVoucher() {
    const paymentId = document.getElementById('paymentId').value;
    if (paymentId) {
        window.print();
    } else {
        showError('No payment to print');
    }
}

// Update pagination
function updatePagination(pagination) {
    const paginationDiv = document.getElementById('pagination');

    if (!pagination) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '<div class="d-flex justify-content-center gap-2">';

    if (pagination.prev) {
        html += `<button class="btn btn-sm btn-secondary" onclick="loadTransactions(${pagination.prev.page}, ${currentLimit})">
                    <i class="fas fa-chevron-left"></i> Previous
        </button>`;
    }

    const currentPage = pagination.page || 1;
    const total = pagination.total || 0;
    const limit = pagination.limit || 10;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    html += `<button class="btn btn-sm btn-primary" disabled>
                    Page ${currentPage} of ${totalPages}
    </button>`;

    if (pagination.next) {
        html += `<button class="btn btn-sm btn-secondary" onclick="loadTransactions(${pagination.next.page}, ${currentLimit})">
                    Next <i class="fas fa-chevron-right"></i>
        </button>`;
    }

    html += '</div>';
    paginationDiv.innerHTML = html;
}

// Format date
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// Helper functions
function showPartyList() {
    window.location.href = '/parties';
}

