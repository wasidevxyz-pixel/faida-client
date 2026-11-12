document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

let selectedCustomer = null;

async function initializePage() {
    document.getElementById('paymentDate').valueAsDate = new Date();
    document.getElementById('filterFromDate').valueAsDate = new Date();
    document.getElementById('filterToDate').valueAsDate = new Date();

    await loadCustomers();
    await loadCashInHand();
    await loadPayments();

    document.getElementById('customer').addEventListener('change', handleCustomerChange);
    document.getElementById('amount').addEventListener('input', calculateBalance);
    document.getElementById('discountPercent').addEventListener('input', calculateBalance);
}

async function loadCustomers() {
    try {
        const response = await fetch('/api/v1/parties?type=customer&limit=1000');
        const data = await response.json();

        const select = document.getElementById('customer');
        select.innerHTML = '<option value="">Select Customer</option>';

        if (data.success && data.data) {
            data.data.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer._id;
                option.textContent = customer.name;
                option.dataset.balance = customer.balance || 0;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}

function handleCustomerChange(e) {
    const select = e.target;
    const option = select.options[select.selectedIndex];

    if (option.value) {
        selectedCustomer = {
            id: option.value,
            name: option.textContent,
            balance: parseFloat(option.dataset.balance || 0)
        };
        document.getElementById('preBalance').value = selectedCustomer.balance;
        calculateBalance();
    } else {
        selectedCustomer = null;
        document.getElementById('preBalance').value = 0;
        calculateBalance();
    }
}

function calculateBalance() {
    const preBalance = parseFloat(document.getElementById('preBalance').value || 0);
    const amount = parseFloat(document.getElementById('amount').value || 0);
    const discountPercent = parseFloat(document.getElementById('discountPercent').value || 0);

    let discountAmount = 0;
    if (amount > 0 && discountPercent > 0) {
        discountAmount = (amount * discountPercent) / 100;
        document.getElementById('discountRs').value = discountAmount.toFixed(2);
    } else {
        document.getElementById('discountRs').value = '0.00';
    }

    // Customer Payment: They PAY us.
    // If Customer Balance is 1000 (Debit/Receivable).
    // They pay 500. New Balance 500.
    // Discount 10% (50). They pay 500 but we credit 550?
    // Usually Discount is separate credit.

    const totalCredit = amount + discountAmount;
    const newBalance = preBalance - totalCredit;

    document.getElementById('balance').value = newBalance.toFixed(2);
}

async function loadCashInHand() {
    try {
        const response = await fetch('/api/v1/cash-transactions/summary');
        const data = await response.json();

        if (data.success && data.data) {
            document.getElementById('cashInHandDisplay').textContent = data.data.currentBalance.toLocaleString();
        }
    } catch (error) {
        console.error('Error loading cash in hand:', error);
    }
}


window.editPayment = async function (id) {
    try {
        const response = await fetch(`/api/v1/customer-payments/${id}`);
        const data = await response.json();

        if (data.success) {
            const payment = data.data;
            document.getElementById('paymentDate').value = payment.date.split('T')[0];
            document.getElementById('branch').value = payment.branch || 'Shop';
            document.getElementById('customer').value = payment.customer._id || payment.customer;

            document.getElementById('amount').value = payment.amount;
            document.getElementById('discountPercent').value = payment.discountPercent || 0;
            // discountRs is calculated automatically but we might want to set it?
            // trigger calculateBalance

            document.getElementById('payMode').value = payment.paymentMode || 'cash';
            document.getElementById('remarks').value = payment.remarks || '';

            document.getElementById('paymentDate').dataset.editId = id;

            // Recalculate balance for display
            handleCustomerChange({ target: document.getElementById('customer') });
            // set logic to trigger balance calc?
            // manually set discount amount if possible or let calc handle it
        }
    } catch (error) {
        console.error('Error loading payment:', error);
    }
};

async function savePayment() {
    const customerId = document.getElementById('customer').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const editId = document.getElementById('paymentDate').dataset.editId;

    if (!customerId) {
        alert('Please select a customer');
        return;
    }

    if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }

    const payload = {
        customer: customerId,
        date: document.getElementById('paymentDate').value,
        branch: document.getElementById('branch').value,
        amount: amount,
        discountPercent: parseFloat(document.getElementById('discountPercent').value || 0),
        discountAmount: parseFloat(document.getElementById('discountRs').value || 0),
        paymentMode: document.getElementById('payMode').value,
        remarks: document.getElementById('remarks').value
    };

    try {
        const url = editId ? `/api/v1/customer-payments/${editId}` : '/api/v1/customer-payments';
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            alert('Payment saved successfully');
            clearForm();
            loadPayments();
            loadCashInHand();
            loadCustomers(); // Refresh balances
        } else {
            alert('Error creating payment: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving payment:', error);
        alert('Error communicating with server');
    }
}

async function loadPayments() {
    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;

    let url = `/api/v1/customer-payments?limit=50&sort=-date`;
    if (fromDate) url += `&startDate=${fromDate}`;
    if (toDate) url += `&endDate=${toDate}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        const tbody = document.getElementById('paymentsTableBody');
        tbody.innerHTML = '';

        if (data.success && data.data) {
            data.data.forEach(payment => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${payment.receiptNo || 'N/A'}</td>
                    <td>${new Date(payment.date).toLocaleDateString()}</td>
                    <td>${payment.customer ? payment.customer.name : 'Unknown'}</td>
                    <td>Received</td>
                    <td>${payment.previousBalance?.toFixed(2) || '0.00'}</td>
                    <td>${payment.amount?.toFixed(2) || '0.00'}</td>
                    <td>${payment.discountAmount?.toFixed(2) || '0.00'}</td>
                    <td>${payment.balance?.toFixed(2) || '0.00'}</td>
                    <td>${payment.paymentMode}</td>
                    <td>${payment.bankName || '-'}</td>
                    <td>${payment.remarks || ''}</td>
                    <td>
                         <button class="btn btn-sm btn-primary py-0 me-1" onclick="printPaymentRecord('${payment._id}')"><i class="fas fa-print"></i></button>
                         <button class="btn btn-sm btn-info py-0 me-1" onclick="editPayment('${payment._id}')"><i class="fas fa-edit"></i></button>
                         <button class="btn btn-sm btn-danger" onclick="deletePayment('${payment._id}')"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error loading payments:', error);
    }
}

async function deletePayment(id) {
    if (!confirm('Delete this payment?')) return;
    try {
        const response = await fetch(`/api/v1/customer-payments/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            loadPayments();
            loadCustomers();
            loadCashInHand();
        } else {
            alert(data.message);
        }
    } catch (e) { console.error(e); }
}

function clearForm() {
    document.getElementById('customer').value = '';
    document.getElementById('preBalance').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('discountPercent').value = '';
    document.getElementById('discountRs').value = '';
    document.getElementById('balance').value = '';
    document.getElementById('remarks').value = '';
    selectedCustomer = null;
    delete document.getElementById('paymentDate').dataset.editId;
}

function refreshCustomers() { loadCustomers(); }
function openCustomerModal() { alert('Use Party module to add customers'); }
function viewLedger() {
    if (selectedCustomer) window.location.href = `/ledger?partyId=${selectedCustomer.id}`;
    else window.location.href = '/ledger';
}

function printPayment() {
    alert('Please select a payment from the list to print, or Save first.');
}

window.printPaymentRecord = function (id) {
    const url = `/print-invoice?type=customer-payment&id=${id}`;
    window.open(url, '_blank', 'width=1000,height=800');
};

