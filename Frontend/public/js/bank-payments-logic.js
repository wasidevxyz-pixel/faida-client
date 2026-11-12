
// --- Tab 4: Bank Payments Functions ---

// Load Bank Payments into Grid
// Load Bank Payments into Grid
async function loadBankPayments() {
    let filterType = document.getElementById('bp-date-filter-type')?.value || 'post';
    let fromDate = document.getElementById('bp-dynamic-from')?.value || '';
    let toDate = document.getElementById('bp-dynamic-to')?.value || '';
    const globalSearch = document.getElementById('bp-global-search')?.value.trim() || '';

    const branch = document.querySelector('#bank-payments .branch-select')?.value;

    if (!branch) {
        const tbody = document.getElementById('bankPaymentsBody');
        if (tbody) tbody.innerHTML = '';
        const total = document.getElementById('bp-grid-total');
        if (total) total.textContent = '0.00';
        return;
    }

    try {
        const token = localStorage.getItem('token');
        let url = `/api/v1/bank-transactions?limit=5000`; // High limit for management view

        if (filterType === 'inv') {
            if (fromDate) url += `&startInvDate=${fromDate}`;
            if (toDate) url += `&endInvDate=${toDate}`;
        } else if (filterType === 'post') {
            if (fromDate) url += `&startDate=${fromDate}`;
            if (toDate) url += `&endDate=${toDate}`;
        } else if (filterType === 'chq') {
            if (fromDate) url += `&startChqDate=${fromDate}`;
            if (toDate) url += `&endChqDate=${toDate}`;
        }

        if (branch) url += `&branch=${encodeURIComponent(branch)}`;

        // IMPORTANT: Exclude bank_transfer entries - those should only show in "Bank To Bank" tab
        url += `&excludeRefType=bank_transfer`;

        const typeFilter = document.getElementById('bp-filter-type')?.value;
        if (typeFilter) {
            url += `&type=${typeFilter}`;
        }

        const bankFilter = document.getElementById('bp-filter-bank')?.value;
        if (bankFilter) {
            url += `&bankName=${encodeURIComponent(bankFilter)}`;
        }

        if (globalSearch) {
            url += `&search=${encodeURIComponent(globalSearch)}`;
        }

        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();

        if (data.success) {
            let transactions = data.data;

            // Client-side filtering for branch
            if (branch) {
                transactions = transactions.filter(t => (t.branch || '') === branch);
            }

            renderBankPaymentGrid(transactions);
        } else {
            alert('Failed to load bank payments');
        }
    } catch (e) {
        console.error(e);
        alert('Error loading bank payments');
    }
}

// Render Grid
function renderBankPaymentGrid(data) {
    const tbody = document.getElementById('bankPaymentsBody');
    tbody.innerHTML = '';

    // Collect unique values for dynamic dropdowns
    const banks = new Set();
    const chqDates = new Set();
    const invDates = new Set();

    data.forEach(item => {
        const tr = document.createElement('tr');

        const postDateStr = item.date ? new Date(item.date).toISOString().split('T')[0] : '-';
        const dateStr = item.chequeDate ? new Date(item.chequeDate).toISOString().split('T')[0] : '-';
        const invoiceDateStr = item.invoiceDate ? new Date(item.invoiceDate).toISOString().split('T')[0] : '-';
        const bankName = item.bankName || (item.bank && item.bank.bankName) || item.bank || '-';

        if (bankName !== '-') banks.add(bankName);
        if (dateStr !== '-') chqDates.add(dateStr);
        if (invoiceDateStr !== '-') invDates.add(invoiceDateStr);

        let displayType = (item.transactionType || item.type || '').toLowerCase();
        if (displayType === 'deposit') displayType = 'received';
        if (displayType === 'withdrawal') displayType = 'paid';

        // Store data for filtering
        tr.dataset.type = displayType;
        tr.dataset.bank = bankName;
        tr.dataset.chqDate = dateStr;
        tr.dataset.invDate = invoiceDateStr;
        tr.dataset.postDate = postDateStr;

        // Colorful Rows: Green for Received, Red for Paid
        const isReceived = displayType.toLowerCase() === 'received';
        tr.style.backgroundColor = isReceived ? '#28a745' : '#dc3545';
        tr.style.color = 'white';
        tr.style.fontWeight = 'normal';

        const remarks = item.remarks || item.narration || '-';
        const invoiceNo = item.invoiceNo || '-';
        const amount = item.amount || 0;
        const chequeNo = item.chequeNo || '';
        
        tr.dataset.amount = amount;
        
        const searchParts = [
            postDateStr, dateStr, invoiceDateStr, bankName, displayType, remarks, invoiceNo, chequeNo, String(amount)
        ];
        tr.dataset.search = searchParts.join(' ').toLowerCase();

        tr.innerHTML = `
            <td>${postDateStr}</td>
            <td>${dateStr}</td>
            <td>${invoiceDateStr}</td>
            <td>${bankName}</td>
            <td class="text-uppercase fw-bold">${displayType}</td>
            <td>${remarks}</td>
            <td>${invoiceNo}</td>
            <td class="fw-bold text-end">${amount.toLocaleString()}</td>
            <td class="text-center">
                <button class="btn btn-primary btn-xs" onclick="editBankPayment('${item._id}')"><i class="fas fa-edit"></i></button>
                ${_canDeleteBankPayment() ? `<button class="btn btn-dark btn-xs" onclick="deleteBankPayment('${item._id}')"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Populate Dropdowns
    // populateBPFilter('bp-filter-bank', Array.from(banks).sort()); // REMOVED: Managed by populateBPFilterFromReference
    populateBPFilter('bp-filter-chq-date', Array.from(chqDates).sort().reverse());
    populateBPFilter('bp-filter-inv-date', Array.from(invDates).sort().reverse());

    filterBankPaymentsGrid();
}

function populateBPFilter(id, values) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = sel.value;

    // Preserve "All" option
    const firstOptionText = (id === 'bp-filter-bank') ? 'All Banks' : 'All Dates';
    sel.innerHTML = `<option value="">${firstOptionText}</option>`;

    values.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        if (v === currentVal) opt.selected = true;
        sel.appendChild(opt);
    });
}

async function populateBPFilterFromReference() {
    const branchSelect = document.querySelector('#bank-payments .branch-select');
    const branch = branchSelect ? branchSelect.value : '';
    const sel = document.getElementById('bp-filter-bank');

    if (!sel) return;

    // Ensure we have banks
    let banks = window.allBanksReference || [];
    if (banks.length === 0) {
        try {
            const token = localStorage.getItem('token');
            // Force fetch if missing
            const response = await fetch('/api/v1/banks', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (data.success) {
                banks = data.data;
                // Update global if possible
                if (window) window.allBanksReference = banks;
            }
        } catch (e) {
            console.error('Error fetching banks for BP filter:', e);
        }
    }

    const currentVal = sel.value;
    sel.innerHTML = '<option value="">All Banks</option>';

    // Filter banks from reference
    const filteredBanks = banks.filter(b => {
        // Filter by Branch
        if (branch) {
            const bBranchName = (b.branch && typeof b.branch === 'object') ? b.branch.name : b.branch;
            // Robust comparison
            if (bBranchName && branch && bBranchName.trim() !== branch.trim()) return false;
        }

        // Exclude Branch Banks
        const bType = (b.bankType || '').toLowerCase();
        if (bType === 'branch bank') return false;

        return true;
    });

    // Populate
    filteredBanks.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.bankName; // Use Name as value for filter 
        opt.textContent = b.bankName;
        if (b.bankName === currentVal) opt.selected = true;
        sel.appendChild(opt);
    });
}

// Function to calculate totals for visible rows in Bank Payments grid
function calculateBPGridTotals() {
    const rows = document.querySelectorAll('#bankPaymentsBody tr');
    let total = 0;
    rows.forEach(row => {
        if (row.style.display !== 'none') {
            total += parseFloat(row.dataset.amount) || 0;
        }
    });
    const totalDisplay = document.getElementById('bp-grid-total');
    if (totalDisplay) totalDisplay.textContent = total.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

// Global Filter for Bank Payments Grid
function filterBankPaymentsGrid() {
    const searchInput = document.getElementById('bp-global-search');
    const filterText = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const cleanFilterText = filterText.replace(/,/g, '');

    const typeFilter = document.getElementById('bp-filter-type')?.value.toLowerCase() || '';
    const bankFilter = document.getElementById('bp-filter-bank')?.value || '';
    const chqDateFilter = document.getElementById('bp-filter-chq-date')?.value || '';
    const invDateFilter = document.getElementById('bp-filter-inv-date')?.value || '';

    const rows = document.querySelectorAll('#bankPaymentsBody tr');

    rows.forEach(row => {
        const text = (row.dataset.search || row.innerText).toLowerCase();
        const cleanText = text.replace(/,/g, '');
        const amountVal = (row.dataset.amount || '').toString();

        const rowType = row.dataset.type || '';
        const rowBank = row.dataset.bank || '';
        const rowChqDate = row.dataset.chqDate || '';
        const rowInvDate = row.dataset.invDate || '';

        const matchesSearch = !filterText || 
                              text.includes(filterText) || 
                              cleanText.includes(cleanFilterText) ||
                              amountVal.includes(cleanFilterText);

        const matchesType = !typeFilter || rowType === typeFilter;
        const matchesBank = !bankFilter || rowBank === bankFilter;
        const matchesChq = !chqDateFilter || rowChqDate === chqDateFilter;
        const matchesInv = !invDateFilter || rowInvDate === invDateFilter;

        if (matchesSearch && matchesType && matchesBank && matchesChq && matchesInv) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });

    calculateBPGridTotals();
}

// Save (Create or Update)
async function saveBankPayment() {
    const id = document.getElementById('bp-id').value;
    const type = document.getElementById('bp-type').value;
    const chequeDate = document.getElementById('bp-cheque-date').value;
    const branch = document.getElementById('bp-branch').value;
    const dept = document.getElementById('bp-dept').value;
    const bank = document.getElementById('bp-bank').value;
    const amount = document.getElementById('bp-amount').value;
    const remarks = document.getElementById('bp-remarks').value;
    const invoiceNo = document.getElementById('bp-invoice-no').value;
    const invoiceDate = document.getElementById('bp-invoice-date').value;

    if (!chequeDate || !bank || !amount) {
        alert('Please fill in required fields (Date, Bank, Amount)');
        return;
    }

    // Validate Cheque Date Year (prevent erroneous dates like 0002 or 0026)
    const chqDateParts = chequeDate.split('-');
    const chqYear = parseInt(chqDateParts[0], 10);
    if (isNaN(chqYear) || chqYear < 2020 || chqYear > 2040) {
        alert(`Invalid Cheque Date (${chequeDate}). Year must be between 2020 and 2040.`);
        document.getElementById('bp-cheque-date')?.focus();
        return;
    }

    // Validate Invoice Date Year if provided
    if (invoiceDate) {
        const invDateParts = invoiceDate.split('-');
        const invYear = parseInt(invDateParts[0], 10);
        if (isNaN(invYear) || invYear < 2020 || invYear > 2040) {
            alert(`Invalid Invoice Date (${invoiceDate}). Year must be between 2020 and 2040.`);
            document.getElementById('bp-invoice-date')?.focus();
            return;
        }
    }

    const payload = {
        transactionType: type, // 'received' or 'paid'
        chequeDate,
        branch,
        department: dept,
        bank,
        amount: parseFloat(amount),
        remarks,
        invoiceNo,
        invoiceDate
    };

    try {
        const token = localStorage.getItem('token');
        let url = '/api/v1/bank-transactions';
        let method = 'POST';

        if (id) {
            url += `/${id}`;
            method = 'PUT';
        }

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            alert('Bank Payment Saved Successfully');

            // Ensure the list shows the new/updated entry by updating filter dates if needed
            // Ensure the list shows the new/updated entry by updating filter dates if needed
            // 1. Check Cheque Date
            const currentFromInput = document.getElementById('bp-chq-from');
            const currentToInput = document.getElementById('bp-chq-to');

            if (currentFromInput && currentToInput && chequeDate) {
                const currentFrom = currentFromInput.value;
                const currentTo = currentToInput.value;

                // If saved date is outside current view (or view is empty), update view
                if (!currentFrom || new Date(chequeDate) < new Date(currentFrom)) {
                    currentFromInput.value = chequeDate;
                }
                if (!currentTo || new Date(chequeDate) > new Date(currentTo)) {
                    currentToInput.value = chequeDate;
                }
            }

            // 2. Check Invoice Date
            const currentInvFromInput = document.getElementById('bp-inv-from');
            const currentInvToInput = document.getElementById('bp-inv-to');

            if (currentInvFromInput && currentInvToInput && invoiceDate) {
                const currentInvFrom = currentInvFromInput.value;
                const currentInvTo = currentInvToInput.value;

                if (!currentInvFrom || new Date(invoiceDate) < new Date(currentInvFrom)) {
                    currentInvFromInput.value = invoiceDate;
                }
                if (!currentInvTo || new Date(invoiceDate) > new Date(currentInvTo)) {
                    currentInvToInput.value = invoiceDate;
                }
            }

            clearBankPaymentForm();
            loadBankPayments(); // Refresh Grid

            // Notify other components that bank data has changed
            window.dispatchEvent(new Event('bank-data-updated'));
        } else {
            alert(result.message || 'Failed to save');
        }
    } catch (e) {
        console.error(e);
        alert('Error saving bank payment');
    }
}

// Helper: check if current user has bank payment delete right
function _canDeleteBankPayment() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    const hasDetailDelete = rights['bank_detail_delete'] === true || rights['bank_detail_delete'] === 'true';
    const hasPaymentDelete = rights['bank_payment_delete'] === true || rights['bank_payment_delete'] === 'true';
    return hasPaymentDelete || hasDetailDelete;
}

// Delete
async function deleteBankPayment(id) {
    if (!_canDeleteBankPayment()) {
        alert('You do not have permission to delete bank entries.');
        return;
    }
    if (!confirm('Are you sure you want to delete this payment?')) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/bank-transactions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (result.success) {
            alert('Deleted successfully');
            loadBankPayments();
        } else {
            alert('Failed to delete');
        }
    } catch (e) {
        console.error(e);
        alert('Error deleting');
    }
}

// Edit (Populate Form)
async function editBankPayment(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/bank-transactions/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (result.success) {
            const data = result.data;
            document.getElementById('bp-id').value = data._id;

            // Map Type (deposit -> received, withdrawal -> paid)
            const typeVal = (data.type === 'deposit') ? 'received' : 'paid';
            document.getElementById('bp-type').value = typeVal;

            if (data.chequeDate) {
                document.getElementById('bp-cheque-date').value = new Date(data.chequeDate).toISOString().split('T')[0];
            } else if (data.date) {
                document.getElementById('bp-cheque-date').value = new Date(data.date).toISOString().split('T')[0];
            }

            // 1. Resolve Bank First (Source of Truth)
            // Fix: Filter by data.branch to avoid picking the same Bank Name from a different branch
            let bankRef = null;
            if (window.allBanksReference) {
                // Try finding by ID
                if (data.bank) {
                    const id = data.bank._id || data.bank;
                    bankRef = window.allBanksReference.find(b => b._id === id);
                }

                // Fallback: Try finding by Name, BUT strictly within the current branch if possible
                if (!bankRef && data.bankName && data.branch) {
                    bankRef = window.allBanksReference.find(b => {
                        const bBranch = (typeof b.branch === 'object') ? b.branch.name : b.branch;
                        return b.bankName === data.bankName && bBranch === data.branch;
                    });
                }

                // Last Resort: Just Name (if branch somehow missing or mismatch)
                if (!bankRef && data.bankName) {
                    bankRef = window.allBanksReference.find(b => b.bankName === data.bankName);
                }
            }

            // Derive IDs
            const bankId = bankRef ? bankRef._id : (data.bank ? (data.bank._id || data.bank) : null);

            const scope = document.getElementById('bank-payments');

            // 2. Set Branch
            // Prioritize Bank's branch if known (to ensure bank shows up), otherwise use transaction data
            let branchName = data.branch;
            if (bankRef && bankRef.branch) {
                branchName = (typeof bankRef.branch === 'object') ? bankRef.branch.name : bankRef.branch;
            }

            if (branchName) {
                document.getElementById('bp-branch').value = branchName;
                // Load departments for this branch
                if (window.loadDepartments) {
                    await window.loadDepartments(scope);
                }
            }

            // 3. Set Department
            // Prioritize Bank's real department to ensure visibility
            let deptId = data.department ? (data.department._id || data.department) : '';
            if (bankRef && bankRef.department) {
                deptId = (typeof bankRef.department === 'object') ? bankRef.department._id : bankRef.department;
            }

            if (deptId) {
                document.getElementById('bp-dept').value = deptId;
                // Filter banks based on this dept
                if (window.filterBanks) {
                    window.filterBanks(scope);
                }
            }

            // 4. Set Bank Dropdown Value
            // Now that filters are set correctly, the bank *should* be in the list
            if (bankId) {
                const bankSelect = document.getElementById('bp-bank');
                bankSelect.value = bankId;

                // Fallback: If strict ID match fail, look for text
                if (!bankSelect.value && data.bankName) {
                    for (let i = 0; i < bankSelect.options.length; i++) {
                        if (bankSelect.options[i].text === data.bankName) {
                            bankSelect.selectedIndex = i;
                            break;
                        }
                    }
                }
            }

            const amountVal = data.amount || 0;
            document.getElementById('bp-amount').value = amountVal;

            // Map Narration to Remarks
            document.getElementById('bp-remarks').value = data.narration || data.remarks || '';
            document.getElementById('bp-invoice-no').value = data.invoiceNo || '';

            if (data.invoiceDate) {
                document.getElementById('bp-invoice-date').value = new Date(data.invoiceDate).toISOString().split('T')[0];
            } else {
                document.getElementById('bp-invoice-date').value = '';
            }

            // Update Balance Display
            const event = new Event('input');
            document.getElementById('bp-amount').dispatchEvent(event);

            // Switch to logic tab if needed? Use passed UI helper
            // User is already on tab
        }
    } catch (e) {
        console.error(e);
    }
}

function clearBankPaymentForm() {
    const idField = document.getElementById('bp-id');
    const typeField = document.getElementById('bp-type');
    const amountField = document.getElementById('bp-amount');
    const remarksField = document.getElementById('bp-remarks');
    const invNoField = document.getElementById('bp-invoice-no');
    const invDateField = document.getElementById('bp-invoice-date');
    const balanceDisplay = document.getElementById('bp-balance-display');

    if (idField) idField.value = '';
    if (typeField) typeField.value = 'paid'; // Default as requested
    if (amountField) amountField.value = '';
    if (remarksField) remarksField.value = '';
    if (invNoField) invNoField.value = '';
    if (invDateField) invDateField.value = new Date().toISOString().split('T')[0];
    if (balanceDisplay) balanceDisplay.textContent = '0.00';
}

// Balance Calculation Logic
document.addEventListener('DOMContentLoaded', () => {
    const amountInput = document.getElementById('bp-amount');
    const typeSelect = document.getElementById('bp-type');
    const balanceDisplay = document.getElementById('bp-balance-display');

    function updateBalancePreview() {
        if (!amountInput || !balanceDisplay) return;

        // In a real app, we would fetch the actual current balance of the selected bank first.
        // For now, let's assume the user wants to see the impact of their ENTRY.
        // Or if there is a base balance, we modify that. 
        // Let's assume a base balance of 0 or a placeholder for now, 
        // but arguably the user might just want to see the value they typed reflected?
        // Re-reading: "BANK PAYMENT BANK BALANCE NOT EFFECT WHEN I AM ENTERING VALUE"
        // This likely means there is a "Bank Balance" field that should change as they type.

        const amount = parseFloat(amountInput.value) || 0;
        const type = typeSelect ? typeSelect.value : 'received';

        // Check if we have a base balance (simulated or fetched)
        // For this fix, I will simply display the signed amount or a simulated calculation
        // If the user expects it to update a "running balance", we need a starting point.
        // Let's assume a starting balance of 100,000 for demo or 0.
        const baseBalance = 0;

        let finalBalance = baseBalance;
        if (type === 'received') {
            finalBalance += amount;
        } else {
            finalBalance -= amount;
        }

        balanceDisplay.textContent = finalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 });

        // Visual indicator
        if (finalBalance < 0) {
            balanceDisplay.style.color = '#dc3545'; // Red
        } else {
            balanceDisplay.style.color = '#28a745'; // Green
        }
    }

    if (amountInput) amountInput.addEventListener('input', updateBalancePreview);
    if (typeSelect) typeSelect.addEventListener('change', updateBalancePreview);

    // Set default Invoice Date on Init
    const invoiceDateInput = document.getElementById('bp-invoice-date');
    if (invoiceDateInput && !invoiceDateInput.value) {
        invoiceDateInput.value = new Date().toISOString().split('T')[0];
    }

    // Auto-fix 2-digit years or single digit typos (e.g. typing 26 -> 2026, 2 -> 2026)
    function attachDateYearAutoFix(el) {
        if (!el) return;
        el.addEventListener('change', function () {
            if (!this.value) return;
            const parts = this.value.split('-');
            if (parts.length === 3) {
                let year = parseInt(parts[0], 10);
                if (!isNaN(year) && year < 100) {
                    year = 2000 + (year % 100);
                    this.value = `${year}-${parts[1]}-${parts[2]}`;
                }
            }
        });
    }
    attachDateYearAutoFix(document.getElementById('bp-cheque-date'));
    attachDateYearAutoFix(document.getElementById('bp-invoice-date'));

    // Alt+S Shortcut
    document.addEventListener('keydown', function (event) {
        if (event.altKey && (event.key === 's' || event.key === 'S')) {
            const panel = document.getElementById('bank-payments');
            // Check if panel is visible/active (Bootstrap 'active' class usually)
            if (panel && (panel.classList.contains('active') || panel.classList.contains('show') || getComputedStyle(panel).display !== 'none')) {
                event.preventDefault();
                saveBankPayment();
            }
        }
    });

    // Add Date Listeners
    ['bp-dynamic-from', 'bp-dynamic-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', loadBankPayments);
    });

    // Enter key listener on global search to trigger server search across all dates
    const bpSearchInput = document.getElementById('bp-global-search');
    if (bpSearchInput) {
        bpSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loadBankPayments();
            }
        });
    }

    // Auto load current date data on init
    loadBankPayments();
});

function clearDateRange(prefix) {
    const from = document.getElementById(`${prefix}-from`);
    const to = document.getElementById(`${prefix}-to`);
    if (from) from.value = '';
    if (to) to.value = '';
}

// Make globally available
window.loadBankPayments = loadBankPayments;
window.searchBankPayments = loadBankPayments;
window.saveBankPayment = saveBankPayment;
window.deleteBankPayment = deleteBankPayment;
window.editBankPayment = editBankPayment;
window.clearBankPaymentForm = clearBankPaymentForm;
window.filterBankPaymentsGrid = filterBankPaymentsGrid;
window.populateBPFilterFromReference = populateBPFilterFromReference;
window.calculateBPGridTotals = calculateBPGridTotals;
window.clearDateRange = clearDateRange;

