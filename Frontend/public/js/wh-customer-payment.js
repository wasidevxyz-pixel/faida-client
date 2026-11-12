document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

let selectedCustomer = null;
let currentEditId = null;
const token = localStorage.getItem('token');
let allCustomers = []; // Store customers for search
let currentFocus = -1; // For autocomplete navigation

async function initializePage() {
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const lastDec31 = new Date(new Date().getFullYear() - 1, 11, 31).toISOString().split('T')[0];
    document.getElementById('date').value = today;
    document.getElementById('filterFrom').value = today;
    document.getElementById('filterTo').value = today;

    // Load initial data
    await loadCustomers();
    await loadPayments();
    await loadCashInHand();

    // Event listeners
    document.getElementById('customer').addEventListener('change', handleCustomerChange);
    document.getElementById('amount').addEventListener('input', calculateBalance);
    document.getElementById('discountPercent').addEventListener('input', calculateBalance);
    document.getElementById('discountAmount').addEventListener('input', calculateBalance);
    document.getElementById('paymentMode').addEventListener('change', handlePaymentModeChange);
    document.getElementById('paymentType').addEventListener('change', calculateBalance);

    document.getElementById('paymentForm').addEventListener('submit', handleSave);

    // Filter listener
    document.getElementById('filterSearch').addEventListener('input', debounce(loadPayments, 500));

    // Autocomplete Listeners
    const searchInput = document.getElementById('customerSearch');
    if (searchInput) {
        searchInput.addEventListener('input', handleCustomerSearch);
        searchInput.addEventListener('keydown', handleCustomerSearchKeydown);
    }

    // Close suggestions on click outside
    document.addEventListener('click', (e) => {
        const suggs = document.getElementById('customerSuggestions');
        if (suggs && !e.target.closest('#customerSearch') && !e.target.closest('#customerSuggestions')) {
            suggs.style.display = 'none';
        }
    });

    // Shortcut Key: Alt + S for Save
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            document.getElementById('paymentForm').requestSubmit();
        }
    });

    // Cycle Tab from Remarks to Customer Search
    const remarksInput = document.getElementById('remarks');
    if (remarksInput) {
        remarksInput.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                const searchInput = document.getElementById('customerSearch');
                if (searchInput) searchInput.focus();
            }
        });
    }
}

async function loadCustomers() {
    try {
        const response = await fetch('/api/v1/wh-customers', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const select = document.getElementById('customer');
        const currentValue = select.value;

        select.innerHTML = '<option value="">Select Customer</option>';
        if (data.success) {
            let customers = data.data;

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

            allCustomers = customers; // Store for search

            customers.forEach(cust => {
                const option = document.createElement('option');
                option.value = cust._id;
                option.textContent = `${cust.customerName} (${cust.code})`;
                option.dataset.balance = cust.currentBalance || 0;
                select.appendChild(option);
            });
            if (currentValue) {
                select.value = currentValue;
                // Sync Search Input
                const found = allCustomers.find(c => c._id === currentValue);
                if (found) {
                    const si = document.getElementById('customerSearch');
                    if (si) si.value = `${found.customerName} (${found.code})`;
                }
                handleCustomerChange({ target: select });
            }
        }
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}

function handleCustomerChange(e) {
    const select = document.getElementById('customer');
    const option = select.options[select.selectedIndex];
    if (option && option.value) {
        const balance = parseFloat(option.dataset.balance || 0);
        document.getElementById('previousBalance').value = balance;
        calculateBalance();
    } else {
        document.getElementById('previousBalance').value = 0;
        document.getElementById('balance').value = 0;
    }
}

function calculateBalance() {
    const preBalance = parseFloat(document.getElementById('previousBalance').value || 0);
    const amount = parseFloat(document.getElementById('amount').value || 0);
    const discPercent = parseFloat(document.getElementById('discountPercent').value || 0);
    const paymentType = document.getElementById('paymentType').value;

    let discAmount = parseFloat(document.getElementById('discountAmount').value || 0);

    if (discPercent > 0) {
        discAmount = (amount * discPercent) / 100;
        document.getElementById('discountAmount').value = discAmount.toFixed(2);
    }

    let newBalance = preBalance;
    if (paymentType === 'Received') {
        newBalance = preBalance - (amount + discAmount);
    } else {
        newBalance = preBalance + (amount + discAmount);
    }

    document.getElementById('balance').value = newBalance.toFixed(2);
}

function handlePaymentModeChange(e) {
    const mode = e.target.value;
    const bankInfo = document.getElementById('bankInfo');
    if (mode !== 'Cash') {
        bankInfo.classList.remove('d-none');
    } else {
        bankInfo.classList.add('d-none');
    }
}

async function handleSave(e) {
    e.preventDefault();
    const formData = {
        paymentType: document.getElementById('paymentType').value,
        date: document.getElementById('date').value,
        customer: document.getElementById('customer').value,
        previousBalance: parseFloat(document.getElementById('previousBalance').value),
        amount: parseFloat(document.getElementById('amount').value),
        discountPercent: parseFloat(document.getElementById('discountPercent').value || 0),
        discountAmount: parseFloat(document.getElementById('discountAmount').value || 0),
        paymentMode: document.getElementById('paymentMode').value,
        bankName: document.getElementById('bankName').value,
        remarks: document.getElementById('remarks').value
    };

    try {
        const url = currentEditId ? `/api/v1/wh-customer-payments/${currentEditId}` : '/api/v1/wh-customer-payments';
        const method = currentEditId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        if (data.success) {
            alert('Payment voucher saved successfully!');
            resetForm();
            loadPayments();
            loadCustomers();
            loadCashInHand();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error saving payment:', error);
        alert('Failed to save payment');
    }
}

async function loadPayments() {
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    const search = document.getElementById('filterSearch').value;

    try {
        const response = await fetch(`/api/v1/wh-customer-payments?from=${from}&to=${to}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const tbody = document.getElementById('paymentsBody');
        tbody.innerHTML = '';

        let totalAmount = 0;
        let totalDisc = 0;

        if (data.success) {
            let filteredData = data.data;

            // Filter by allowed categories
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user && user.allowedWHCustomerCategories && user.allowedWHCustomerCategories.length > 0) {
                const allowed = user.allowedWHCustomerCategories;
                filteredData = filteredData.filter(p => {
                    if (!p.customer) return false;
                    const catId = typeof p.customer.customerCategory === 'object' ? p.customer.customerCategory?._id : p.customer.customerCategory;
                    return allowed.includes(catId);
                });
            }

            if (search) {
                const s = search.toLowerCase();
                filteredData = filteredData.filter(p =>
                    (p.customer && p.customer.customerName.toLowerCase().includes(s)) ||
                    (p.receiptNo && p.receiptNo.toLowerCase().includes(s))
                );
            }

            filteredData.forEach(p => {
                totalAmount += p.amount || 0;
                totalDisc += p.discountAmount || 0;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.receiptNo}</td>
                    <td>${new Date(p.date).toLocaleDateString()}</td>
                    <td>${p.customer ? p.customer.customerName : 'N/A'}</td>
                    <td><span class="badge ${p.paymentType === 'Received' ? 'bg-success' : 'bg-danger'}">${p.paymentType}</span></td>
                    <td class="text-end">${p.previousBalance.toFixed(2)}</td>
                    <td class="text-end fw-bold text-primary">${p.amount.toFixed(2)}</td>
                    <td class="text-end text-danger">${p.discountAmount.toFixed(2)}</td>
                    <td class="text-end fw-bold">${p.balance.toFixed(2)}</td>
                    <td>${p.paymentMode}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="editPayment('${p._id}')"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-outline-info" onclick="printVoucher('${p._id}')"><i class="fas fa-print"></i></button>
                            <button class="btn btn-outline-danger" onclick="deletePayment('${p._id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            document.getElementById('totalAmountSum').textContent = totalAmount.toFixed(2);
            document.getElementById('totalDiscountSum').textContent = totalDisc.toFixed(2);
        }
    } catch (error) {
        console.error('Error loading payments:', error);
    }
}

async function editPayment(id) {
    try {
        const response = await fetch(`/api/v1/wh-customer-payments/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            const p = data.data;
            currentEditId = id;
            document.getElementById('paymentType').value = p.paymentType;
            document.getElementById('date').value = p.date.split('T')[0];
            document.getElementById('customer').value = p.customer._id || p.customer;
            document.getElementById('previousBalance').value = p.previousBalance;
            document.getElementById('amount').value = p.amount;
            document.getElementById('discountPercent').value = p.discountPercent;
            document.getElementById('discountAmount').value = p.discountAmount;
            document.getElementById('balance').value = p.balance;
            document.getElementById('paymentMode').value = p.paymentMode;
            document.getElementById('bankName').value = p.bankName || '';
            document.getElementById('remarks').value = p.remarks || '';

            const custId = p.customer._id || p.customer;
            const found = allCustomers.find(c => c._id === custId);
            if (found) {
                const si = document.getElementById('customerSearch');
                if (si) si.value = `${found.customerName} (${found.code})`;
            }
            handlePaymentModeChange({ target: { value: p.paymentMode } });
            document.getElementById('btnSave').innerHTML = '<i class="fas fa-check me-1"></i>UPDATE';
        }
    } catch (error) {
        console.error('Error editing payment:', error);
    }
}

async function deletePayment(id) {
    if (!confirm('Are you sure?')) return;
    try {
        const response = await fetch(`/api/v1/wh-customer-payments/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            alert('Voucher deleted');
            loadPayments(); loadCustomers(); loadCashInHand();
        }
    } catch (error) {
        console.error('Error deleting payment:', error);
    }
}

async function loadCashInHand() {
    try {
        const response = await fetch('/api/v1/cash-transactions/summary', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById('cashInHand').textContent = data.data.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        }
    } catch (error) {
        console.error('Error loading cash in hand:', error);
    }
}

function resetForm() {
    currentEditId = null;
    document.getElementById('paymentForm').reset();
    const si = document.getElementById('customerSearch');
    if (si) si.value = '';
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    document.getElementById('btnSave').innerHTML = '<i class="fas fa-save me-1"></i>SAVE';
    document.getElementById('bankInfo').classList.add('d-none');
    document.getElementById('previousBalance').value = 0;
    document.getElementById('balance').value = 0;

    // Focus back on customer search
    if (si) si.focus();
}

function printVoucher(id) {
    const vid = id || currentEditId;
    if (!vid) return alert('Select voucher');
    window.open(`/print-invoice?type=wh-customer-payment&id=${vid}`, '_blank');
}

async function syncBalance() {
    const cid = document.getElementById('customer').value;
    if (!cid) return alert('Select customer');
    const btn = event.currentTarget;
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    try {
        const res = await fetch(`/api/v1/wh-customers/${cid}/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) { alert('Synced'); await loadCustomers(); }
        else { alert(data.message || 'Error'); }
    } catch (err) { console.error(err); } finally { btn.innerHTML = old; btn.disabled = false; }
}

function viewLedger() {
    const cid = document.getElementById('customer').value;
    if (!cid) return alert('Select customer');
    window.location.href = `/wh-customer-ledger-report?id=${cid}`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function handleCustomerSearch(e) {
    const val = e.target.value;
    const list = document.getElementById('customerSuggestions');
    if (!list) return;
    list.innerHTML = '';
    currentFocus = -1;
    if (!val) { list.style.display = 'none'; document.getElementById('customer').value = ''; return; }
    const matches = allCustomers.filter(c =>
        (c.customerName || '').toLowerCase().includes(val.toLowerCase()) ||
        (c.code || '').toLowerCase().includes(val.toLowerCase())
    );
    if (matches.length === 0) { list.style.display = 'none'; return; }
    matches.forEach(c => {
        const div = document.createElement('div');
        div.className = 'list-group-item list-group-item-action suggestion-item';
        div.innerHTML = `<div class="d-flex justify-content-between align-items-center"><span>${highlightMatch(c.customerName, val)}</span><small class="text-muted">${c.code || ''}</small></div>`;
        div.onclick = function () { selectCustomerFromSearch(c); };
        list.appendChild(div);
    });
    list.style.display = 'block';
}

function handleCustomerSearchKeydown(e) {
    let list = document.getElementById('customerSuggestions');
    if (!list) return;
    let items = list.getElementsByClassName('suggestion-item');
    if (e.key === 'ArrowDown') { currentFocus++; addActive(items); }
    else if (e.key === 'ArrowUp') { currentFocus--; addActive(items); }
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentFocus > -1 && items[currentFocus]) items[currentFocus].click();
        else if (items.length > 0) items[0].click();
    }
}

function addActive(items) {
    if (!items) return; removeActive(items);
    if (currentFocus >= items.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = items.length - 1;
    items[currentFocus].classList.add('active');
    items[currentFocus].scrollIntoView({ block: 'nearest' });
}

function removeActive(items) {
    for (let i = 0; i < items.length; i++) items[i].classList.remove('active');
}

function selectCustomerFromSearch(c) {
    const si = document.getElementById('customerSearch');
    if (si) si.value = `${c.customerName} (${c.code})`;
    const list = document.getElementById('customerSuggestions');
    if (list) list.style.display = 'none';
    const select = document.getElementById('customer');
    select.value = c._id;
    handleCustomerChange({ target: select });

    // Move focus to amount field
    const amountInput = document.getElementById('amount');
    if (amountInput) {
        amountInput.focus();
        amountInput.select(); // Optional: select existing value for easier entry
    }
}

function highlightMatch(text, search) {
    if (!text) return '';
    if (!search) return text;
    return text.replace(new RegExp(`(${search})`, 'gi'), '<b>$1</b>');
}

