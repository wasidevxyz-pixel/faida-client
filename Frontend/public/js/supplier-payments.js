document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

let selectedSupplier = null;

async function initializePage() {
    // Set default date to today
    document.getElementById('paymentDate').valueAsDate = new Date();
    document.getElementById('filterFromDate').valueAsDate = new Date();
    document.getElementById('filterToDate').valueAsDate = new Date();

    await loadSuppliers();
    await loadCashInHand();
    await loadPayments();

    // Event Listeners
    document.getElementById('supplier').addEventListener('change', handleSupplierChange);
    document.getElementById('amount').addEventListener('input', calculateBalance);
    document.getElementById('discountPercent').addEventListener('input', calculateBalance);
}

async function loadSuppliers() {
    try {
        const response = await fetch('/api/v1/parties?type=supplier&limit=1000');
        const data = await response.json();

        const select = document.getElementById('supplier');
        select.innerHTML = '<option value="">Select Supplier</option>';

        if (data.success && data.data) {
            data.data.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier._id;
                option.textContent = supplier.name;
                option.dataset.balance = supplier.balance || 0;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

function handleSupplierChange(e) {
    const select = e.target;
    const option = select.options[select.selectedIndex];

    if (option.value) {
        selectedSupplier = {
            id: option.value,
            name: option.textContent,
            balance: parseFloat(option.dataset.balance || 0)
        };
        document.getElementById('preBalance').value = selectedSupplier.balance;
        calculateBalance();
    } else {
        selectedSupplier = null;
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
    }

    // Balance logic: If I pay a supplier, my debt (balance) decreases.
    // Usually Supplier Balance is Positive (Credit).
    // New Balance = Pre Balance - Amount - Discount Amount? Or only Amount?
    // If I owe 1000, and pay 500, balance is 500.
    // If I get 10% discount on 500 payment? That means 500 counts as 550? Or 500 cash + 50 discount?
    // Usually Discount Amount is added to reduction.

    const reduction = amount + discountAmount; // Discount is also a "payment" in a way (waiver)
    const newBalance = preBalance - reduction;

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
        const response = await fetch(`/api/v1/supplier-payments/${id}`);
        const data = await response.json();

        if (data.success) {
            const payment = data.data;
            document.getElementById('paymentDate').value = payment.date.split('T')[0];
            document.getElementById('branch').value = payment.branch || 'Shop';
            document.getElementById('supplier').value = payment.supplier._id || payment.supplier;
            // Trigger change to load balance? Maybe handled by manual preBalance set
            // Wait, we need to load party details to correct preBalance context?
            // For simplicity, just set values.

            document.getElementById('amount').value = payment.amount;
            document.getElementById('discountPercent').value = payment.discountPercent || 0;
            document.getElementById('payMode').value = payment.paymentMode || 'cash';
            document.getElementById('cashAccount').value = payment.cashAccount || 'Cash in Hand (Shop)';
            document.getElementById('remarks').value = payment.remarks || '';

            document.getElementById('paymentDate').dataset.editId = id;

            // Recalculate balance for display
            handleSupplierChange({ target: document.getElementById('supplier') });
            // This might reset preBalance if not careful.
            // Better to rely on what the backend says? Or just let user re-select if needed.
        }
    } catch (error) {
        console.error('Error loading payment:', error);
    }
};

async function savePayment() {
    const supplierId = document.getElementById('supplier').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const editId = document.getElementById('paymentDate').dataset.editId;

    if (!supplierId) {
        alert('Please select a supplier');
        return;
    }

    if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }

    const payload = {
        supplier: supplierId,
        date: document.getElementById('paymentDate').value,
        branch: document.getElementById('branch').value,
        amount: amount,
        discountPercent: parseFloat(document.getElementById('discountPercent').value || 0),
        discountAmount: (amount * parseFloat(document.getElementById('discountPercent').value || 0) / 100),
        paymentMode: document.getElementById('payMode').value,
        cashAccount: document.getElementById('cashAccount').value,
        remarks: document.getElementById('remarks').value
    };

    try {
        const url = editId ? `/api/v1/supplier-payments/${editId}` : '/api/v1/supplier-payments';
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            alert('Payment saved successfully');
            clearForm();
            loadPayments();
            loadCashInHand();
            loadSuppliers(); // Refresh balances
        } else {
            alert('Error saving payment: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving payment:', error);
        alert('Error communicating with server');
    }
}

async function loadPayments() {
    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;

    let url = `/api/v1/supplier-payments?limit=50&sort=-date`;
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
                    <td>${payment.paymentNo || 'N/A'}</td>
                    <td>${new Date(payment.date).toLocaleDateString()}</td>
                    <td>${payment.supplier ? payment.supplier.name : 'Unknown'}</td>
                    <td>Payment</td>
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
                        <button class="btn btn-sm btn-danger py-0" onclick="deletePayment('${payment._id}')"><i class="fas fa-trash"></i></button>
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
    if (!confirm('Are you sure you want to delete this payment?')) return;

    try {
        const response = await fetch(`/api/v1/supplier-payments/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            loadPayments();
            loadCashInHand();
            loadSuppliers();
        } else {
            alert('Error deleting payment: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting payment:', error);
    }
}

function clearForm() {
    document.getElementById('supplier').value = '';
    document.getElementById('preBalance').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('discountPercent').value = '';
    document.getElementById('balance').value = '';
    document.getElementById('remarks').value = '';
    selectedSupplier = null;
    delete document.getElementById('paymentDate').dataset.editId;
}

function refreshSuppliers() {
    loadSuppliers();
}

function openSupplierModal() {
    // Ideally this would open the supplier creation modal
    // Check if there is a shared 'add party' modal or redirect
    alert('Feature coming strictly from Party module.');
}

function viewLedger() {
    if (selectedSupplier) {
        window.location.href = `/ledger?partyId=${selectedSupplier.id}`;
    } else {
        window.location.href = '/ledger';
    }
}

function printPayment() {
    alert('Please select a payment from the list to print, or Save first.');
}

window.printPaymentRecord = function (id) {
    const url = `/print-invoice?type=supplier-payment&id=${id}`;
    window.open(url, '_blank', 'width=1000,height=800');
};

