let allBanks = [];
let allDepartments = [];
let allBranches = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;

    // Load data
    await loadInitialData();
    await loadCompanyInfo();

    // User info
    const user = JSON.parse(localStorage.getItem('user')) || { name: 'User' };
    const userNameEl = document.getElementById('userName'); // Fixed ID
    if (userNameEl) userNameEl.textContent = user.name;
    // document.getElementById('userInitial').textContent = user.name.charAt(0).toUpperCase(); // Optional if ID exists
});

async function loadInitialData() {
    try {
        const token = localStorage.getItem('token');

        // 1. Load Stores (Branches)
        try {
            const storesResp = await fetch('/api/v1/stores', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const storesData = await storesResp.json();

            if (storesData.success) {
                const branchSelect = document.getElementById('branchSelect');

                // Only show "All Branches" if multiple branches exist
                if (storesData.data.length > 1) {
                    branchSelect.innerHTML = '<option value="">All Branches</option>';
                } else {
                    branchSelect.innerHTML = '';
                }

                storesData.data.forEach(store => {
                    const opt = document.createElement('option');
                    opt.value = store.name;
                    opt.textContent = store.name;
                    branchSelect.appendChild(opt);
                });

                // Save to global variable
                allBranches = storesData.data;

                // Auto-select if only one branch available
                if (storesData.data.length === 1) {
                    branchSelect.value = storesData.data[0].name;
                    // handleBranchChange(); // Deferred to end of function
                }
            }
        } catch (err) {
            console.error('Error loading stores:', err);
        }

        // 2. Load Banks
        const banksResp = await fetch('/api/v1/banks', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const banksData = await banksResp.json();

        if (banksData.success) {
            allBanks = banksData.data;
            // Do NOT populate all banks here. Wait for final filterBanks call.
        }

        // 3. Load Departments
        const deptResp = await fetch('/api/v1/departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const deptData = await deptResp.json();

        if (deptData.success) {
            allDepartments = deptData.data;
            populateDepartments(); // Initial population
        }

        // Final Filter Update to ensure correct state based on defaults/auto-selects
        handleBranchChange();

    } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load initial data');
    }
}

function populateDepartments() {
    const selectedBranch = document.getElementById('branchSelect').value;
    const deptSelect = document.getElementById('departmentSelect');
    const currentVal = deptSelect.value;

    deptSelect.innerHTML = '<option value="">All Departments</option>';

    let filteredDepts = allDepartments;

    if (selectedBranch) {
        // Filter by Branch
        filteredDepts = filteredDepts.filter(d => d.branch === selectedBranch);

        // Filter: Must have at least one bank associated with this department AND branch
        filteredDepts = filteredDepts.filter(dept => {
            return allBanks.some(bank => {
                // Handle bank.department being ID string or object
                const bankDeptId = (bank.department && bank.department._id) ? bank.department._id : bank.department;
                return bankDeptId === dept._id && bank.branch === selectedBranch;
            });
        });
    }

    filteredDepts.forEach(dept => {
        const opt = document.createElement('option');
        opt.value = dept._id;
        opt.textContent = dept.name;
        deptSelect.appendChild(opt);
    });

    // Restore selection if valid
    if (currentVal && Array.from(deptSelect.options).some(o => o.value === currentVal)) {
        deptSelect.value = currentVal;
    }
}

function handleBranchChange() {
    populateDepartments();
    filterBanks();
}

function filterBanks() {
    const selectedBranch = document.getElementById('branchSelect').value;
    const selectedDeptId = document.getElementById('departmentSelect').value;

    let filteredBanks = allBanks;

    // Filter by Branch (Store Name)
    if (selectedBranch) {
        // Find the Branch Object to get its ID
        const branchObj = allBranches.find(br => br.name === selectedBranch);
        const branchId = branchObj ? String(branchObj._id) : null;

        console.log('Filtering for Branch:', selectedBranch, 'ID:', branchId);

        filteredBanks = filteredBanks.filter(b => {
            const bBranchName = (b.branch && typeof b.branch === 'object') ? b.branch.name : b.branch;
            const bBranchId = (b.branch && typeof b.branch === 'object') ? b.branch._id : b.branch;

            // Convert to string for safe comparison
            const safeName = String(bBranchName);
            const safeId = String(bBranchId);

            // Match Name OR ID
            const match = safeName === selectedBranch || (branchId && safeId === branchId);
            return match;
        });
    }

    // Filter by Department
    if (selectedDeptId) {
        filteredBanks = filteredBanks.filter(b => {
            const bDeptId = (b.department && typeof b.department === 'object') ? b.department._id : b.department;
            return String(bDeptId) === selectedDeptId;
        });
    }

    // Exclude 'Branch Bank' type as per User Request
    filteredBanks = filteredBanks.filter(b => b.bankType !== 'Branch Bank');

    // Filter: User Requested "Only 2 bank" - REVERTING based on user feedback "show branch bank like old".
    // We will now show ALL banks that match the Branch/Department filters.
    /*
    filteredBanks = filteredBanks.filter(b => {
        const isBranchBank = b.bankType === 'Branch Bank';
        const isEasypaisa = b.bankName && b.bankName.toUpperCase().includes('EASYPAISA');
        
        // Also allow if it matches the selected Branch Name EXACTLY (often main bank is named same as branch)
        // or contains "Main"
        const isMain = b.bankName && (b.bankName === selectedBranch || b.bankName.toUpperCase().includes('MAIN'));

        return isBranchBank || isEasypaisa || isMain;
    });
    */

    populateBanks(filteredBanks);
}

function populateBanks(banks) {
    const bankSelect = document.getElementById('bankSelect');
    bankSelect.innerHTML = '<option value="">Choose Bank...</option>';

    banks.sort((a, b) => a.bankName.localeCompare(b.bankName)).forEach(bank => {
        const opt = document.createElement('option');
        opt.value = bank._id;
        opt.textContent = bank.bankName;
        bankSelect.appendChild(opt);
    });
}

async function generateReport() {
    const bankId = document.getElementById('bankSelect').value;
    const branch = document.getElementById('branchSelect').value;
    const departmentId = document.getElementById('departmentSelect').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const startInvDate = document.getElementById('startInvDate').value;
    const endInvDate = document.getElementById('endInvDate').value;

    if (!bankId) {
        alert('Please select a bank');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        let url = `/api/v1/reports/bank-ledger?bankId=${bankId}&startDate=${startDate}&endDate=${endDate}`;
        if (branch) url += `&branch=${encodeURIComponent(branch)}`;
        if (departmentId) url += `&departmentId=${departmentId}`;
        if (startInvDate) url += `&startInvDate=${startInvDate}`;
        if (endInvDate) url += `&endInvDate=${endInvDate}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            renderReport(data.data, startDate, endDate);
        } else {
            alert(data.message || 'Failed to generate report');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while generating the report');
    }
}

function renderReport(data, startDate, endDate) {
    // Show report area
    const reportArea = document.getElementById('reportArea');
    const emptyState = document.getElementById('emptyState');
    if (reportArea) reportArea.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    // Header - support both old and new IDs to prevent cache-related crashes
    const bankNameEl = document.getElementById('reportBankName') || document.getElementById('bankName');
    if (bankNameEl) bankNameEl.textContent = data.bankName;

    const branchNameEl = document.getElementById('branchName');
    if (branchNameEl) branchNameEl.textContent = data.branch || 'All Branches';

    const dateRangeEl = document.getElementById('dateRange');
    if (dateRangeEl) dateRangeEl.textContent = `${startDate} to ${endDate}`;

    const openingBalanceEl = document.getElementById('openingBalance');
    if (openingBalanceEl) openingBalanceEl.textContent = formatCurrency(data.openingBalance);

    // Update Print Header
    const printBranchName = document.getElementById('printBranchName');
    if (printBranchName) printBranchName.textContent = data.branch || 'All Branches';

    const printDateRange = document.getElementById('printDateRange');
    if (printDateRange) printDateRange.textContent = `${startDate} to ${endDate}`;

    const printReportTitle = document.getElementById('printReportTitle');
    if (printReportTitle) printReportTitle.textContent = `Bank Ledger - ${data.bankName}`;

    // Stats
    const totalDebit = document.getElementById('totalDebit');
    if (totalDebit) totalDebit.textContent = formatCurrency(data.totalDebit);

    const totalCredit = document.getElementById('totalCredit');
    if (totalCredit) totalCredit.textContent = formatCurrency(data.totalCredit);

    const closingBalance = document.getElementById('closingBalance');
    if (closingBalance) closingBalance.textContent = formatCurrency(data.closingBalance);

    // Table
    const tbody = document.getElementById('ledgerBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Opening balance row
    const openingRow = document.createElement('tr');
    openingRow.className = 'table-light fw-bold';
    openingRow.innerHTML = `
        <td>${startDate}</td>
        <td colspan="5">Opening Balance</td>
        <td class="text-end">-</td>
        <td class="text-end">-</td>
        <td class="text-end">${formatCurrency(data.openingBalance)}</td>
    `;
    tbody.appendChild(openingRow);

    // Transaction rows
    data.transactions.forEach(tx => {
        const row = document.createElement('tr');
        const date = new Date(tx.date).toISOString().split('T')[0];
        const invDate = tx.invoiceDate ? new Date(tx.invoiceDate).toISOString().split('T')[0] : '-';

        let typeBadge = '';
        if (tx.type === 'Daily Cash') typeBadge = '<span class="badge bg-info badge-type">Daily Cash</span>';
        else if (tx.type === 'Bank Receipt') typeBadge = '<span class="badge bg-success badge-type">Receipt</span>';
        else if (tx.type === 'Bank Payment') typeBadge = '<span class="badge bg-danger badge-type">Payment</span>';
        else if (tx.type === 'Bank Transfer') typeBadge = '<span class="badge bg-warning badge-type">Transfer</span>';

        let remarksHtml = '';
        if (tx.remarks === 'Batch Transfered') {
            remarksHtml = `<div class="fw-bold text-success mt-1" style="font-size: 0.9rem;">${tx.remarks}</div>`;
        } else if (tx.remarks) {
            // If Daily Cash and NOT 'Batch Transfered', hide remarks as per request
            if (tx.type === 'Daily Cash') {
                remarksHtml = '';
            } else {
                remarksHtml = `<small class="text-muted d-block mt-1">${tx.remarks}</small>`;
            }
        }

        row.innerHTML = `
            <td>${date}</td>
            <td>
                <div class="fw-bold">${tx.narration}</div>
                ${remarksHtml}
            </td>
            <td>${typeBadge}</td>
            <td>${tx.batchNo}</td>
            <td>${invDate}</td>
            <td>${tx.department}</td>
            <td class="text-end amount-debit">${tx.debit > 0 ? formatCurrency(tx.debit) : '-'}</td>
            <td class="text-end amount-credit">${tx.credit > 0 ? formatCurrency(tx.credit) : '-'}</td>
            <td class="text-end fw-bold">${formatCurrency(tx.balance)}</td>
        `;
        tbody.appendChild(row);
    });

    // Footer
    const footerDebit = document.getElementById('footerDebit');
    if (footerDebit) footerDebit.textContent = formatCurrency(data.totalDebit);
    
    const footerCredit = document.getElementById('footerCredit');
    if (footerCredit) footerCredit.textContent = formatCurrency(data.totalCredit);
    
    const footerBalance = document.getElementById('footerBalance');
    if (footerBalance) footerBalance.textContent = formatCurrency(data.closingBalance);
}

function formatCurrency(amount) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Load Company Info for Print Header
async function loadCompanyInfo() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch('/api/v1/settings/company-info', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const company = data.data || {};

            if (company.companyName) {
                const nameEl = document.getElementById('companyName');
                if (nameEl) nameEl.textContent = company.companyName;
            }
            if (company.address) {
                const addrEl = document.getElementById('companyAddress');
                if (addrEl) addrEl.textContent = company.address;
            }
            if (company.logo) {
                const logoImg = document.getElementById('companyLogo');
                if (logoImg) {
                    logoImg.src = company.logo;
                    logoImg.style.display = 'block';
                }
            }
        }

        // Add Generated Date
        const today = new Date();
        const genDate = document.getElementById('printGenerated');
        if (genDate) {
            genDate.textContent = `Generated: ${today.toLocaleDateString('en-GB')} ${today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
        }
    } catch (error) {
        console.error('Error loading company info:', error);
    }
}

