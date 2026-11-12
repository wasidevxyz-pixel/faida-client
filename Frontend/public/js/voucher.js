document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

let voucherEntries = [];
let accounts = [];

async function initializePage() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('voucherDate').value = today;
    document.getElementById('listFromDate').value = today;
    document.getElementById('listToDate').value = today;

    await loadAccounts();

    // Populate Cash dropdown with Cash/Bank accounts
    const cashSelect = document.getElementById('cashAccount');
    if (cashSelect) {
        cashSelect.innerHTML = '<option value="">Select Account</option>';

        // 1. Hardcoded defaults (often used if not in DB)
        const defaults = ['Cash in Hand', 'Cash', 'Bank', 'Cash in Hand (Shop)'];

        // 2. Accounts from DB
        const dbAccounts = allLedgerAccounts.filter(acc => {
            const name = (acc.name || '').toLowerCase();
            const className = (acc.class || '').toLowerCase();
            return name.includes('cash') || name.includes('bank') ||
                className.includes('cash') || className.includes('bank');
        }).map(acc => acc.name);

        const allPossible = [...new Set([...defaults, ...dbAccounts])];

        allPossible.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            cashSelect.appendChild(opt);
        });

        // Set default selection
        const priority = ['Cash in Hand', 'Cash', 'Bank'];
        for (const p of priority) {
            if (allPossible.includes(p)) {
                cashSelect.value = p;
                break;
            }
        }
    }

    // Check for edit mode from URL
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    if (editId) {
        await editVoucher(editId);
    } else {
        await fetchNextVoucherNo();
    }

    await fetchVoucherList();

    // Set Sr Number
    const countResponse = await pageAccess.authenticatedFetch('/api/v1/vouchers?limit=1');
    const countData = await countResponse.json();
    document.getElementById('voucherSr').value = (countData.pagination.total + 1) || 1;

    // Listen for type changes
    document.getElementById('voucherType').addEventListener('change', () => {
        fetchNextVoucherNo();
        updateInputLocks();
    });

    // Add Enter key listener for Debit and Credit inputs
    const handleEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addEntry();
        }
    };
    document.getElementById('lineDebit').addEventListener('keypress', handleEnter);
    document.getElementById('lineCredit').addEventListener('keypress', handleEnter);

    updateInputLocks();
}

function updateInputLocks() {
    const type = document.getElementById('voucherType').value;
    const debitInput = document.getElementById('lineDebit');
    const creditInput = document.getElementById('lineCredit');

    // Reset
    debitInput.disabled = false;
    creditInput.disabled = false;
    debitInput.style.backgroundColor = '';
    creditInput.style.backgroundColor = '';
    debitInput.value = 0;
    creditInput.value = 0;

    if (type === 'CPV' || type === 'BPV') {
        creditInput.disabled = true;
        creditInput.style.backgroundColor = '#f8d7da'; // Light Red
        creditInput.value = 0;
        debitInput.focus();
    } else if (type === 'CRV' || type === 'BRV') {
        debitInput.disabled = true;
        debitInput.style.backgroundColor = '#f8d7da'; // Light Red
        debitInput.value = 0;
        creditInput.focus();
    }
}

async function fetchNextVoucherNo() {
    const type = document.getElementById('voucherType').value;
    try {
        const res = await pageAccess.authenticatedFetch(`/api/v1/vouchers/next-number/${type}`);
        const data = await res.json();
        if (data.success) {
            document.getElementById('voucherNo').value = data.data;
        }
    } catch (e) { console.error(e); }
}

let allLedgerAccounts = [];
let allParties = [];
let allCategories = [];

async function loadAccounts() {
    try {
        // Fetch Ledger Accounts
        const accResp = await pageAccess.authenticatedFetch('/api/v1/accounts/ledger');
        const accData = await accResp.json();
        allLedgerAccounts = accData.success ? accData.data : [];

        // Fetch Parties (Customers/Suppliers)
        const partyResp = await pageAccess.authenticatedFetch('/api/v1/parties?limit=1000');
        const partyData = await partyResp.json();
        allParties = partyData.success ? partyData.data : [];

        // Fetch Categories
        const catResp = await pageAccess.authenticatedFetch('/api/v1/categories?limit=500');
        const catData = await catResp.json();
        allCategories = catData.success ? catData.data : [];

        // Initial population
        filterAccountDropdown('all');
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

window.filterAccountDropdown = function (type) {
    const select = document.getElementById('accountSelect');
    select.innerHTML = '<option value="">Select Account</option>';
    const addedAccounts = new Set();

    // Helper to add to select
    const addOption = (name, label) => {
        if (!addedAccounts.has(name)) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = label;
            select.appendChild(option);
            addedAccounts.add(name);
        }
    };

    // 1. Static/Default Accounts
    if (type === 'all' || type === 'ledger') {
        ['Cash', 'Bank', 'Cash in Hand (Shop)'].forEach(acc => addOption(acc, acc));
    }

    // 2. Ledger Accounts
    if (type === 'all' || type === 'ledger') {
        allLedgerAccounts.forEach(acc => addOption(acc.name, `${acc.name} (${acc.class})`));
    }

    // 3. Categories (Cust-Cat / Supp-Cat)
    if (type === 'cust_cat' || type === 'all') {
        allCategories.filter(c => c.categoryType === 'customer').forEach(cat => addOption(cat.name, `${cat.name} (Customer Category)`));
    }
    if (type === 'supp_cat' || type === 'all') {
        allCategories.filter(c => c.categoryType === 'supplier').forEach(cat => addOption(cat.name, `${cat.name} (Supplier Category)`));
    }

    // 4. Parties
    allParties.forEach(party => {
        if (type === 'all') {
            addOption(party.name, `${party.name} (${party.partyType})`);
        } else if (type === 'customer' && (party.partyType === 'customer' || party.partyType === 'both')) {
            addOption(party.name, party.name);
        } else if (type === 'supplier' && (party.partyType === 'supplier' || party.partyType === 'both')) {
            addOption(party.name, party.name);
        }
    });
};

function addEntry() {
    const account = document.getElementById('accountSelect').value;
    const detail = document.getElementById('lineDetail').value;
    const debit = parseFloat(document.getElementById('lineDebit').value || 0);
    const credit = parseFloat(document.getElementById('lineCredit').value || 0);

    if (!account) {
        alert('Select account');
        return;
    }

    if (debit === 0 && credit === 0) {
        alert('Enter Debit or Credit amount');
        return;
    }

    if (debit > 0 && credit > 0) {
        alert('Cannot have both Debit and Credit in same line (normally)');
        // Allowing it if user insists, but usually one is zero.
    }

    voucherEntries.push({
        account,
        detail, // map to something? Schema doesn't have line detail in `entries`.
        // Wait, Schema `entries` has `account`, `debit`, `credit`. No detail?
        // Let's check Schema.
        debit,
        credit
    });

    // Clear line inputs
    document.getElementById('accountSelect').value = '';
    document.getElementById('lineDetail').value = '';
    document.getElementById('lineDebit').value = 0;
    document.getElementById('lineCredit').value = 0;

    renderGrid();
}

function renderGrid() {
    const tbody = document.getElementById('voucherEntriesBody');
    tbody.innerHTML = '';

    let queryTotalDebit = 0;
    let queryTotalCredit = 0;

    voucherEntries.forEach((entry, index) => {
        queryTotalDebit += entry.debit;
        queryTotalCredit += entry.credit;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${entry.account}</td>
            <td>${entry.detail || ''}</td>
            <td class="text-end">${entry.debit.toFixed(2)}</td>
            <td class="text-end">${entry.credit.toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-danger py-0" onclick="removeEntry(${index})">&times;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('totalDebit').textContent = queryTotalDebit.toFixed(2);
    document.getElementById('totalCredit').textContent = queryTotalCredit.toFixed(2);
}

window.removeEntry = function (index) {
    voucherEntries.splice(index, 1);
    renderGrid();
};


window.showList = function () {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('listFromDate').value = today;
    document.getElementById('listToDate').value = today;

    const modal = new bootstrap.Modal(document.getElementById('listModal'));
    modal.show();
    fetchVoucherList();
};

window.fetchVoucherList = async function () {
    const fromDate = document.getElementById('listFromDate').value;
    const toDate = document.getElementById('listToDate').value;
    const type = document.getElementById('listType').value;

    try {
        let url = `/api/v1/vouchers?limit=100&sort=-date`;
        if (fromDate) url += `&startDate=${fromDate}`;
        if (toDate) url += `&endDate=${toDate}`;
        if (type) url += `&voucherType=${type}`;

        const response = await pageAccess.authenticatedFetch(url);
        const data = await response.json();

        const tbody = document.getElementById('voucherListBody');
        tbody.innerHTML = '';

        if (data.success && data.data) {
            data.data.forEach(voucher => {
                const accountsInfo = (voucher.entries || [])
                    .filter(e => !(e.detail && e.detail.includes('Auto-balanced')))
                    .map(e => `${e.account}${e.detail ? ' - ' + e.detail : ''}`)
                    .join(' | ');

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="text-center">
                        <div class="btn-group">
                            <button class="btn btn-xs btn-outline-primary" title="Print" onclick="printVoucherRecord('${voucher._id}')"><i class="fas fa-print"></i></button>
                            <button class="btn btn-xs btn-outline-info" title="Edit" onclick="editVoucher('${voucher._id}')"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-xs btn-outline-danger" title="Delete" onclick="deleteVoucher('${voucher._id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                    <td>${new Date(voucher.date).toLocaleDateString()}</td>
                    <td class="fw-bold">${voucher.voucherNo || '-'}</td>
                    <td class="text-uppercase fw-bold small">${voucher.voucherType}</td>
                    <td>${voucher.branch || '-'}</td>
                    <td class="text-center text-truncate fw-bold text-primary" style="max-width: 400px;" title="${accountsInfo}">${accountsInfo || '-'}</td>
                    <td class="text-end text-success fw-bold">${(voucher.totalDebit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td class="text-end text-danger fw-bold">${(voucher.totalCredit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error loading vouchers:', error);
    }
};

window.editVoucher = async function (id) {
    // Hide modal if open
    const modalEl = document.getElementById('listModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }

    try {
        const response = await pageAccess.authenticatedFetch(`/api/v1/vouchers/${id}`);
        const data = await response.json();

        if (data.success) {
            const voucher = data.data;
            document.getElementById('voucherDate').value = voucher.date.split('T')[0];
            document.getElementById('voucherType').value = voucher.voucherType;
            document.getElementById('voucherNo').value = voucher.voucherNo;
            document.getElementById('branch').value = voucher.branch || 'Shop';
            document.getElementById('narration').value = voucher.narration || '';

            // Set Cash Account if it's a single-sided voucher
            if (voucher.voucherType !== 'JV') {
                // Look for an entry that matches a Cash/Bank account
                const cashLine = voucher.entries.find(e =>
                    e.detail && e.detail.includes('Auto-balanced')
                );
                if (cashLine) {
                    document.getElementById('cashAccount').value = cashLine.account;
                }
            }

            document.getElementById('voucherDate').dataset.editId = id;

            // Populate grid (filter out auto-balanced lines for editing)
            voucherEntries = voucher.entries
                .filter(e => !(e.detail && e.detail.includes('Auto-balanced')))
                .map(entry => ({
                    account: entry.account,
                    detail: entry.detail || '',
                    debit: entry.debit || 0,
                    credit: entry.credit || 0
                }));

            updateInputLocks();
            renderGrid();
        }
    } catch (error) {
        console.error('Error loading voucher:', error);
        alert('Failed to load voucher details');
    }
};

window.deleteVoucher = async function (id) {
    if (!confirm('Are you sure you want to delete this voucher?')) return;

    try {
        const response = await pageAccess.authenticatedFetch(`/api/v1/vouchers/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            alert('Voucher deleted successfully');
            // Redirect to list after delete? Or clear form.
            clearForm();
            fetchNextVoucherNo();
        } else {
            alert('Error deleting voucher: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting voucher:', error);
        alert('Failed to delete voucher');
    }
};

window.saveVoucher = async function () {
    const totalDebit = parseFloat(document.getElementById('totalDebit').textContent);
    const totalCredit = parseFloat(document.getElementById('totalCredit').textContent);
    const editId = document.getElementById('voucherDate').dataset.editId;
    const type = document.getElementById('voucherType').value;
    const cashAcc = document.getElementById('cashAccount').value;

    if (voucherEntries.length === 0) {
        alert('Please add at least one entry');
        return;
    }

    // Filter out any existing balancing line to prevent duplicates
    let finalEntries = voucherEntries.filter(e => !(e.detail && e.detail.includes('Auto-balanced')));

    // For CPV/CRV/BPV/BRV, add fresh balancing entry from the "Cash" dropdown
    if (type !== 'JV') {
        if (!cashAcc) {
            alert('Please select a Cash/Bank account');
            return;
        }

        const currentTotalDebit = finalEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
        const currentTotalCredit = finalEntries.reduce((sum, e) => sum + (e.credit || 0), 0);

        if (type === 'CPV' || type === 'BPV') {
            finalEntries.push({
                account: cashAcc,
                debit: 0,
                credit: currentTotalDebit,
                detail: 'Auto-balanced from ' + type
            });
        } else if (type === 'CRV' || type === 'BRV') {
            finalEntries.push({
                account: cashAcc,
                debit: currentTotalCredit,
                credit: 0,
                detail: 'Auto-balanced from ' + type
            });
        }
    }

    const finalTotalDebit = finalEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
    const finalTotalCredit = finalEntries.reduce((sum, e) => sum + (e.credit || 0), 0);

    if (Math.abs(finalTotalDebit - finalTotalCredit) > 0.01) {
        alert(`Voucher not balanced! Difference: ${(finalTotalDebit - finalTotalCredit).toFixed(2)}`);
        return;
    }

    const payload = {
        voucherType: type,
        date: document.getElementById('voucherDate').value,
        branch: document.getElementById('branch').value,
        narration: document.getElementById('narration').value,
        entries: finalEntries,
        voucherNo: document.getElementById('voucherNo').value,
        cashAccount: (type !== 'JV' && cashAcc) ? cashAcc : undefined // Store cash account if used for auto-balancing
    };

    try {
        const url = editId ? `/api/v1/vouchers/${editId}` : '/api/v1/vouchers';
        const method = editId ? 'PUT' : 'POST';

        const response = await pageAccess.authenticatedFetch(url, {
            method: method,
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
            alert('Voucher Saved Successfully');
            if (!editId && confirm('Do you want to print this voucher?')) {
                printVoucherRecord(data.data._id);
            }
            clearForm();
            await fetchNextVoucherNo();
            await fetchVoucherList();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error(error);
        alert('Error saving voucher');
    }
};

window.clearForm = function () {
    voucherEntries = [];
    document.getElementById('narration').value = '';
    document.getElementById('lineDetail').value = '';
    document.getElementById('voucherNo').value = '';
    delete document.getElementById('voucherDate').dataset.editId;
    renderGrid();
};

window.printVoucherRecord = function (id) {
    const url = `/voucher-print?id=${id}`;
    window.open(url, '_blank', 'width=1000,height=800');
};

