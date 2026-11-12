
// Computer / Terminal Identification
function getClientComputerName() {
    let name = localStorage.getItem('bas_terminal_name') || localStorage.getItem('bas_computer_name');
    if (!name) {
        const userAgent = navigator.userAgent || '';
        let platformName = 'PC';
        if (userAgent.includes('Windows NT 10.0')) platformName = 'Win10-PC';
        else if (userAgent.includes('Windows NT 11.0') || (userAgent.includes('Windows') && navigator.userAgentData?.platform === 'Windows')) platformName = 'Win11-PC';
        else if (userAgent.includes('Windows')) platformName = 'Win-PC';
        else if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS')) platformName = 'Mac-Station';
        else if (userAgent.includes('Linux')) platformName = 'Linux-POS';
        else if (userAgent.includes('Android')) platformName = 'Android-POS';

        const randomNum = Math.floor(1000 + Math.random() * 9000);
        name = `${platformName}-${randomNum}`;
        localStorage.setItem('bas_terminal_name', name);
        localStorage.setItem('bas_computer_name', name);
    }
    return name;
}

window.getClientComputerName = getClientComputerName;
window.setComputerName = function(customName) {
    if (!customName) {
        const current = getClientComputerName();
        customName = prompt('Enter a name for this computer/terminal (e.g. Counter-01, Accounts-PC):', current);
    }
    if (customName && customName.trim()) {
        const clean = customName.trim();
        localStorage.setItem('bas_terminal_name', clean);
        localStorage.setItem('bas_computer_name', clean);
        alert(`Terminal / Computer name set to: ${clean}`);
    }
};

let suppliers = [];
let categories = [];
let branches = [];
let cashAccounts = [];
let loadedVouchers = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(input => {
        input.value = today;
    });

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    const isAdmin = user.role === 'admin' || (user.group && user.group.isAdmin) || (user.groupId && user.groupId.isAdmin);

    const currentPath = window.location.pathname.toLowerCase();
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');

    // Determine screen context
    const isCategoryContext = currentPath.includes('category') || tabParam === 'category';
    const isSupplierContext = currentPath.includes('supplier') || tabParam === 'supplier' || (!isCategoryContext);

    const canSupplier = (isAdmin || rights.pv_supplier || (currentPath.includes('list') && (rights.pv_supplier_list || rights.pv_supplier))) && !isCategoryContext;
    const canCategory = (isAdmin || rights.pv_category || (currentPath.includes('list') && (rights.pv_category_list || rights.pv_category))) && isCategoryContext;

    // Update page title if isolated
    const titleEl = document.querySelector('.page-title');
    if (titleEl && (currentPath.includes('category') || currentPath.includes('supplier') || tabParam)) {
        if (currentPath.includes('list')) {
            titleEl.innerHTML = isCategoryContext
                ? '<i class="fas fa-tags text-success me-2"></i> Category Voucher List'
                : '<i class="fas fa-truck text-primary me-2"></i> Supplier Voucher List';
        }
    }

    // Hiding Tabs (Entry Page if legacy tabs exist)
    if (!canSupplier && document.getElementById('tab-li-supplier')) {
        document.getElementById('tab-li-supplier').style.display = 'none';
        document.getElementById('supplier-content')?.classList.remove('active', 'show');
    }
    if (!canCategory && document.getElementById('tab-li-category')) {
        document.getElementById('tab-li-category').style.display = 'none';
        document.getElementById('category-content')?.classList.remove('active', 'show');
        if (canSupplier && document.getElementById('supplier-tab')) {
            const supTab = new bootstrap.Tab(document.getElementById('supplier-tab'));
            supTab.show();
        }
    }

    // Hiding Tabs (List Page if legacy tabs exist)
    if (!canSupplier && document.getElementById('list-tab-li-supplier')) {
        document.getElementById('list-tab-li-supplier').style.display = 'none';
    }
    if (!canCategory && document.getElementById('list-tab-li-category')) {
        document.getElementById('list-tab-li-category').style.display = 'none';
        if (canSupplier && document.getElementById('list-supplier-tab')) {
            const supTab = new bootstrap.Tab(document.getElementById('list-supplier-tab'));
            supTab.show();
        }
    }

    // Default activation logic if current active tab is hidden
    if (!canSupplier && canCategory) {
        const catTabEl = document.getElementById('category-tab') || document.getElementById('list-category-tab');
        if (catTabEl) {
            const catTab = new bootstrap.Tab(catTabEl);
            catTab.show();
        }
    }

    // Fix for tabs displaying below each other (stacking issue)
    const voucherTabs = document.querySelectorAll('#paymentTabs button[data-bs-toggle="tab"]');
    voucherTabs.forEach(tab => {
        tab.addEventListener('shown.bs.tab', function (e) {
            const targetId = e.target.getAttribute('data-bs-target');
            document.querySelectorAll('#paymentTabsContent .tab-pane').forEach(pane => {
                if ('#' + pane.id !== targetId) {
                    pane.classList.remove('show', 'active');
                }
            });
        });
    });


    await loadInitialData();
    // Use then/catch to ensure it doesn't block if something goes wrong, 
    // though we await it to try to fill form before user sees it.
    try {
        await checkForEditMode();
    } catch (e) {
        console.error('Error checking edit mode:', e);
    }

    // Navigation and tab handling - only if tabs exist in DOM
    const isListPage = currentPath.includes('list');

    if (isCategoryContext) {
        const catTabEl = isListPage
            ? document.getElementById('list-category-tab')
            : (document.getElementById('category-tab') || document.getElementById('list-category-tab'));
        if (catTabEl) {
            const tab = new bootstrap.Tab(catTabEl);
            tab.show();
        }
    } else {
        const supTabEl = isListPage
            ? document.getElementById('list-supplier-tab')
            : (document.getElementById('supplier-tab') || document.getElementById('list-supplier-tab'));
        if (supTabEl) {
            const tab = new bootstrap.Tab(supTabEl);
            tab.show();
        }
    }

    // Update filter visibility based on active tab (for list page)
    updateFilterVisibility();

    await fetchVoucherList();
    await generateNextVoucherNo();

    // Form Submissions
    const supForm = document.getElementById('supplierVoucherForm');
    const catForm = document.getElementById('categoryVoucherForm');
    if (supForm) supForm.addEventListener('submit', handleSupplierVoucherSave);
    if (catForm) catForm.addEventListener('submit', handleCategoryVoucherSave);

    // Link Buttons on Entry Page
    document.querySelectorAll('.btn-view-list').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const container = e.target.closest('.tab-pane');
            const context = container && container.id.includes('category') ? 'category' : 'supplier';
            window.location.href = `/payment-vouchers-list?tab=${context}`;
        });
    });

    // Branch-wise Category Filtering
    document.getElementById('catBranchSelect')?.addEventListener('change', async (e) => {
        const branchId = e.target.value;
        await loadCategories(branchId);
    });

    // Branch-wise Supplier Filtering
    document.getElementById('branchSelect')?.addEventListener('change', async (e) => {
        const branchName = e.target.options[e.target.selectedIndex].text;
        const selectedBranch = e.target.value === "" ? "" : branchName;
        await loadSuppliers(selectedBranch);
    });

    document.getElementById('listBranchFilter')?.addEventListener('change', async (e) => {
        const branchName = e.target.options[e.target.selectedIndex].text;
        const selectedBranch = e.target.value === "" ? "" : branchName;
        await loadSuppliers(selectedBranch);
    });

    // Shortcut Key: Alt + S for Save
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            // Determine active tab
            const supplierTab = document.getElementById('supplier-content');
            const categoryTab = document.getElementById('category-content');

            if (supplierTab && supplierTab.classList.contains('active')) {
                const form = document.getElementById('supplierVoucherForm');
                if (form) form.requestSubmit();
            } else if (categoryTab && categoryTab.classList.contains('active')) {
                const form = document.getElementById('categoryVoucherForm');
                if (form) form.requestSubmit();
            }
        }
    });

    // Real-time Amount to Words Conversion
    document.getElementById('voucherAmount')?.addEventListener('input', (e) => {
        const amount = parseFloat(e.target.value) || 0;
        const wordsEl = document.getElementById('voucherAmountWords');
        if (wordsEl) wordsEl.value = amount > 0 ? numberToWords(amount) + ' ONLY' : '';
    });

    document.getElementById('catVoucherAmount')?.addEventListener('input', (e) => {
        const amount = parseFloat(e.target.value) || 0;
        const wordsEl = document.getElementById('catVoucherAmountWords');
        if (wordsEl) wordsEl.value = amount > 0 ? numberToWords(amount) + ' ONLY' : '';
    });
});

function numberToWords(number) {
    if (number === 0) return 'ZERO';

    const units = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    const scales = ['', 'THOUSAND', 'MILLION', 'BILLION'];

    function convertChunk(num) {
        let words = [];
        if (num >= 100) {
            words.push(units[Math.floor(num / 100)], 'HUNDRED');
            num %= 100;
        }
        if (num >= 20) {
            words.push(tens[Math.floor(num / 10)]);
            num %= 10;
        }
        if (num > 0) {
            words.push(units[num]);
        }
        return words.join(' ');
    }

    let mainNumber = Math.floor(number);
    let decimals = Math.round((number - mainNumber) * 100);

    let finalWords = [];
    let scaleIndex = 0;

    while (mainNumber > 0) {
        let chunk = mainNumber % 1000;
        if (chunk > 0) {
            let chunkText = convertChunk(chunk);
            if (scales[scaleIndex]) {
                chunkText += ' ' + scales[scaleIndex];
            }
            finalWords.unshift(chunkText);
        }
        mainNumber = Math.floor(mainNumber / 1000);
        scaleIndex++;
    }

    let result = finalWords.join(' ').trim() + ' RUPEES';
    if (decimals > 0) {
        result += ' AND ' + convertChunk(decimals) + ' PAISA';
    }
    console.log('[DEBUG] Result:', result);
    return result;
}

async function loadCategories(branchId = '') {
    try {
        const token = localStorage.getItem('token');
        // If your backend supports branch filtering for categories, use it here
        // For now, we fetch all customer categories
        const res = await fetch('/api/v1/customer-categories?limit=500', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('catCustomerCategory');
            if (!select) return;
            select.innerHTML = '<option value="">Select Category</option>';
            data.data.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.name;
                opt.textContent = c.name;
                select.appendChild(opt);
            });
        }
    } catch (err) { console.error(err); }
}

async function loadSuppliers(branchName = '') {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/parties?partyType=supplier&limit=1000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            // Filter suppliers by branch if branch is selected
            let filteredSuppliers = data.data;
            if (branchName) {
                filteredSuppliers = data.data.filter(s => s.branch === branchName);
            }

            // Deduplicate by name to prevent multiple entries (e.g. same supplier in multiple branches if global view)
            const uniqueSuppliers = [];
            const seenNames = new Set();
            filteredSuppliers.forEach(s => {
                if (!seenNames.has(s.name)) {
                    seenNames.add(s.name);
                    uniqueSuppliers.push(s);
                }
            });

            suppliers = uniqueSuppliers;
            const selects = ['supplierSelect', 'listSupplierFilter'];
            selects.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.innerHTML = `<option value="">${id.includes('list') ? 'All Suppliers' : 'Select Supplier'}</option>`;
                uniqueSuppliers.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.name;
                    opt.textContent = s.name;
                    el.appendChild(opt);
                });
            });
        }
    } catch (err) { console.error(err); }
}

async function loadInitialData() {
    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        // Check admin logic: role 'admin', or group.isAdmin, or groupId.isAdmin
        // Note: checking nested properties safely
        const isAdmin = user.role === 'admin' ||
            (user.group && user.group.isAdmin) ||
            (user.groupId && (user.groupId.isAdmin || user.groupId.rights?.isAdmin));

        // Ensure userBranch is an array
        let userBranches = user.branch || [];
        if (!Array.isArray(userBranches)) {
            userBranches = [userBranches].filter(Boolean);
        }

        // 1. Load Branches
        const branchRes = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const branchData = await branchRes.json();
        if (branchData.success) {
            branches = branchData.data;
            const selects = ['branchSelect', 'catBranchSelect', 'listBranchFilter'];

            selects.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;

                // For restricted users, clear "All Branches" option if it exists (mainly for filters)
                if (!isAdmin && userBranches.length > 0) {
                    // Only for filter dropdowns that might have "All"
                    if (id === 'listBranchFilter') {
                        el.innerHTML = '';
                    }
                }

                let hasSelected = false;

                branches.forEach(b => {
                    // Filter: if not admin and user has branches, strictly match by NAME (check inclusion)
                    if (!isAdmin && userBranches.length > 0 && !userBranches.includes(b.name)) {
                        return;
                    }

                    const opt = document.createElement('option');
                    opt.value = b._id;
                    opt.textContent = b.name;
                    el.appendChild(opt);

                    // Auto-select the first valid branch if none selected yet
                    if (!isAdmin && userBranches.includes(b.name) && !hasSelected) {
                        opt.selected = true;
                        hasSelected = true;
                    }
                });

                // Trigger change event to update dependent lists (like suppliers)
                // MODIFIED: Do NOT dispatch event for branchSelect here to avoid race condition with the explicit load below.
                if (!isAdmin && userBranches.length > 0 && el.options.length > 0) {
                    if (id !== 'branchSelect') {
                        el.dispatchEvent(new Event('change'));
                    }
                }
            });
        }

        // 2. Load Suppliers
        // FIX: Pass the currently selected branch name to ensure correct filtering on load
        const branchSelect = document.getElementById('branchSelect');
        let initialBranch = '';
        if (branchSelect && branchSelect.selectedIndex >= 0) {
            initialBranch = branchSelect.options[branchSelect.selectedIndex].text;
            // If Text is "Select Branch" or similar dummy, ignore it?
            if (branchSelect.value === '') initialBranch = '';
        }
        await loadSuppliers(initialBranch);

        // 3. Load Customer Categories
        const catRes = await fetch('/api/v1/customer-categories?limit=500', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const catData = await catRes.json();
        if (catData.success) {
            categories = catData.data;
            // Populate both entry dropdown and list filter dropdown
            const catSelects = ['catCustomerCategory', 'listCategoryFilter'];
            catSelects.forEach(id => {
                const select = document.getElementById(id);
                if (!select) return;
                categories.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    opt.textContent = c.name;
                    select.appendChild(opt);
                });
            });
        }

        // 4. Load Cash/Bank Accounts (for payment method context)
        // In this system, we usually have a few standard cash accounts
        // or we can fetch them from ledger accounts
        const accRes = await fetch('/api/v1/accounts/ledger', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const accData = await accRes.json();
        if (accData.success) {
            cashAccounts = accData.data.filter(a =>
                a.name.toLowerCase().includes('cash') ||
                a.name.toLowerCase().includes('bank')
            );
        }

    } catch (err) {
        console.error('Error loading initial data:', err);
    }
}

async function generateNextVoucherNo() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/vouchers/next-number/CPV', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const vInput = document.getElementById('voucherNo');
            if (vInput) vInput.value = data.data;

            const catInput = document.getElementById('catVoucherNo');
            if (catInput) catInput.value = data.data;
        }
    } catch (err) {
        console.error(err);
    }
}

async function handleSupplierVoucherSave(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('voucherAmount').value);
    if (!amount || amount <= 0) return alert('Please enter valid amount');

    const supplier = document.getElementById('supplierSelect').value;
    if (!supplier) return alert('Please select supplier');

    const paymentMethod = document.getElementById('paymentMethod').value;
    let contraAccount = 'Cash in Hand'; // Default
    // Both Bank and Cheque should be treated as Bank payments
    if (paymentMethod === 'Bank' || paymentMethod === 'Cheque') contraAccount = 'Bank';

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const compName = getClientComputerName();

    const payload = {
        voucherType: (paymentMethod === 'Bank' || paymentMethod === 'Cheque') ? 'BPV' : 'CPV',
        date: document.getElementById('voucherDate').value,
        branch: document.getElementById('branchSelect').options[document.getElementById('branchSelect').selectedIndex].text,
        narration: document.getElementById('voucherDescription').value,
        voucherNo: document.getElementById('voucherNo').value,
        computerName: compName,
        createdByName: user.name || user.username || 'User',
        entries: [
            { account: supplier, debit: amount, credit: 0, detail: 'Supplier Payment' },
            { account: contraAccount, debit: 0, credit: amount, detail: 'Auto-balanced Payment' }
        ]
    };

    await saveVoucher(payload);
}

async function handleCategoryVoucherSave(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('catVoucherAmount').value);
    if (!amount || amount <= 0) return alert('Please enter valid amount');

    const category = document.getElementById('catCustomerCategory').value;
    if (!category) return alert('Please select category');

    const paymentMethod = document.getElementById('catPaymentMethod').value;
    let contraAccount = 'Cash in Hand';
    if (paymentMethod === 'Bank' || paymentMethod === 'Cheque') contraAccount = 'Bank';

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const compName = getClientComputerName();

    const payload = {
        voucherType: (paymentMethod === 'Bank' || paymentMethod === 'Cheque') ? 'BPV' : 'CPV',
        date: document.getElementById('catVoucherDate').value,
        branch: document.getElementById('catBranchSelect').options[document.getElementById('catBranchSelect').selectedIndex].text,
        narration: document.getElementById('catVoucherDescription').value,
        voucherNo: document.getElementById('catVoucherNo').value,
        computerName: compName,
        createdByName: user.name || user.username || 'User',
        entries: [
            { account: category, debit: amount, credit: 0, detail: 'Category Wise Payment' },
            { account: contraAccount, debit: 0, credit: amount, detail: 'Auto-balanced Payment' }
        ]
    };

    await saveVoucher(payload);
}

// Global state for edit mode
window.currentEditVoucherId = null;

// Call check at end of init
// We will insert this call in DOMContentLoaded via a separate replace

async function checkForEditMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    if (editId) {
        await loadVoucherForEdit(editId);
    }
}

async function loadVoucherForEdit(id) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/vouchers/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (!data.success) {
            alert('Error loading voucher details');
            return;
        }

        const voucher = data.data;
        window.currentEditVoucherId = id;

        // Identify type: Find entry that is NOT "Auto-balanced" and NOT null detail
        let mainEntry = voucher.entries.find(e => !e.detail || !e.detail.includes('Auto-balanced'));

        // Fallback: if detailed logic failed, assume the Debit entry is the main one (for Payments)
        if (!mainEntry) {
            mainEntry = voucher.entries.find(e => e.debit > 0);
        }

        if (!mainEntry) {
            console.error('Could not identify main entry for voucher', voucher);
            return alert('Critical Error: Vourcher data is malformed (No main entry found).');
        }

        const isCategory = mainEntry.detail === 'Category Wise Payment';
        const currentPath = window.location.pathname.toLowerCase();

        if (isCategory) {
            // If on dedicated supplier page, redirect to category page
            if (currentPath.includes('supplier-voucher')) {
                window.location.replace(`/category-voucher?edit=${id}`);
                return;
            }

            // Switch to Category Tab if present
            const catTab = document.getElementById('category-tab');
            if (catTab) {
                const tab = new bootstrap.Tab(catTab);
                tab.show();
            }

            if (document.getElementById('catVoucherNo')) document.getElementById('catVoucherNo').value = voucher.voucherNo;
            if (document.getElementById('catVoucherDate')) document.getElementById('catVoucherDate').value = voucher.date ? voucher.date.split('T')[0] : '';

            // Branch
            const branchSelect = document.getElementById('catBranchSelect');
            if (branchSelect) {
                let branchOpt = Array.from(branchSelect.options).find(o => o.text === voucher.branch);
                if (branchOpt) branchSelect.value = branchOpt.value;
            }

            // Category Selection
            const catSelect = document.getElementById('catCustomerCategory');
            if (catSelect) {
                let exists = Array.from(catSelect.options).some(o => o.value === mainEntry.account);
                if (!exists) {
                    const opt = document.createElement('option');
                    opt.value = mainEntry.account;
                    opt.textContent = mainEntry.account + ' (Archived/Hidden)';
                    catSelect.appendChild(opt);
                }
                catSelect.value = mainEntry.account;
            }

            const pmSelect = document.getElementById('catPaymentMethod');
            if (pmSelect) {
                if (voucher.voucherType === 'BPV' || voucher.voucherType === 'Bank') {
                    pmSelect.value = 'Bank';
                } else if (voucher.voucherType === 'Cheque') {
                    pmSelect.value = 'Cheque';
                } else {
                    pmSelect.value = 'Cash';
                }
            }

            if (document.getElementById('catVoucherAmount')) {
                document.getElementById('catVoucherAmount').value = mainEntry.debit;
                if (document.getElementById('catVoucherAmountWords')) {
                    document.getElementById('catVoucherAmountWords').value = mainEntry.debit > 0 ? numberToWords(mainEntry.debit) + ' ONLY' : '';
                }
            }
            if (document.getElementById('catVoucherDescription')) document.getElementById('catVoucherDescription').value = voucher.narration || '';

            // Change Button Text
            const btn = document.querySelector('#categoryVoucherForm button[type="submit"]');
            if (btn) btn.innerHTML = '<i class="fas fa-save me-2"></i> Update Voucher';

        } else {
            // If on dedicated category page, redirect to supplier page
            if (currentPath.includes('category-voucher')) {
                window.location.replace(`/supplier-voucher?edit=${id}`);
                return;
            }

            // Switch to Supplier Tab if present
            const supTab = document.getElementById('supplier-tab');
            if (supTab) {
                const tab = new bootstrap.Tab(supTab);
                tab.show();
            }

            if (document.getElementById('voucherNo')) document.getElementById('voucherNo').value = voucher.voucherNo;
            if (document.getElementById('voucherDate')) document.getElementById('voucherDate').value = voucher.date ? voucher.date.split('T')[0] : '';

            // Branch & Load Suppliers
            const branchSelect = document.getElementById('branchSelect');
            if (branchSelect) {
                let branchOpt = Array.from(branchSelect.options).find(o => o.text === voucher.branch);
                if (branchOpt) {
                    branchSelect.value = branchOpt.value;
                    // We MUST reload suppliers for this branch to ensure the supplier is in the list
                    // Warning: safeWait to let it load? loadSuppliers is async.
                    await loadSuppliers(voucher.branch);
                }
            }

            // Supplier Selection
            const supSelect = document.getElementById('supplierSelect');
            if (supSelect) {
                // Determine if option exists
                let exists = Array.from(supSelect.options).some(o => o.value === mainEntry.account);
                if (!exists) {
                    // Create temp option
                    const opt = document.createElement('option');
                    opt.value = mainEntry.account;
                    opt.textContent = mainEntry.account + ' (Missing from Filter)';
                    supSelect.appendChild(opt);
                }
                supSelect.value = mainEntry.account;
            }

            const pmSelect = document.getElementById('paymentMethod');
            if (pmSelect) {
                if (voucher.voucherType === 'BPV' || voucher.voucherType === 'Bank') {
                    pmSelect.value = 'Bank';
                } else if (voucher.voucherType === 'Cheque') {
                    pmSelect.value = 'Cheque';
                } else {
                    pmSelect.value = 'Cash';
                }
            }

            if (document.getElementById('voucherAmount')) {
                document.getElementById('voucherAmount').value = mainEntry.debit;
                // Update Words
                if (document.getElementById('voucherAmountWords')) {
                    document.getElementById('voucherAmountWords').value = mainEntry.debit > 0 ? numberToWords(mainEntry.debit) + ' ONLY' : '';
                }
            }
            if (document.getElementById('voucherDescription')) document.getElementById('voucherDescription').value = voucher.narration || '';

            // Change Button Text
            const btn = document.querySelector('#supplierVoucherForm button[type="submit"]');
            if (btn) btn.innerHTML = '<i class="fas fa-save me-2"></i> Update Voucher';
        }

    } catch (err) { console.error('Error loading edit voucher:', err); }
}

async function saveVoucher(payload) {
    let attempts = 0;
    const maxAttempts = 3;
    const isEdit = window.currentEditVoucherId != null;
    const url = isEdit ? `/api/v1/vouchers/${window.currentEditVoucherId}` : '/api/v1/vouchers';
    const method = isEdit ? 'PUT' : 'POST';

    while (attempts < maxAttempts) {
        try {
            attempts++;
            const token = localStorage.getItem('token');
            const res = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-computer-name': getClientComputerName()
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                alert(isEdit ? 'Voucher Updated Successfully!' : 'Voucher Saved Successfully!');

                // Clear Edit Mode
                window.currentEditVoucherId = null;
                const btns = document.querySelectorAll('button[type="submit"]');
                btns.forEach(b => b.innerHTML = '<i class="fas fa-save me-2"></i> Save Voucher');

                if (document.getElementById('supplierVoucherForm')) {
                    await window.resetForm('supplierVoucherForm');
                }
                if (document.getElementById('categoryVoucherForm')) {
                    await window.resetForm('categoryVoucherForm');
                }

                // Remove edit param from URL if present without reloading
                if (window.history.pushState) {
                    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                    window.history.pushState({ path: newUrl }, '', newUrl);
                }

                if (!isEdit && confirm('Do you want to print this voucher?')) {
                    printSingle(data.data._id);
                }

                // If we were editing, redirect back to list
                if (isEdit) {
                    if (window.location.pathname.includes('category')) {
                        window.location.href = '/category-voucher-list';
                    } else {
                        window.location.href = '/supplier-voucher-list';
                    }
                }

                return; // Success, exit function
            }

            // Check for duplicate key error (E11000) ONLY FOR NEW RECORDS
            if (!isEdit && data.message && (data.message.includes('E11000') || data.message.includes('duplicate'))) {
                console.warn(`Duplicate voucher number ${payload.voucherNo} detected. Retrying with new number (Attempt ${attempts})...`);

                // Generate a fresh number for the current voucher type (CPV or BPV)
                let newNo = await generateVoucherNumber(payload.voucherType);

                // Guard against stale backend logic returning same number
                if (newNo === payload.voucherNo) {
                    const parts = newNo.split('-');
                    if (parts.length > 1) {
                        const num = parseInt(parts[parts.length - 1]);
                        if (!isNaN(num)) {
                            // Force increment
                            const prefix = parts[0]; // simplistic assumption, but works for CPV-01
                            newNo = `${parts.slice(0, -1).join('-')}-${String(num + 1).padStart(2, '0')}`;
                        }
                    }
                }

                if (newNo) {
                    // Update Payload
                    payload.voucherNo = newNo;

                    // Update UI to reflect the change (so user knows number changed)
                    if (document.getElementById('voucherNo')) document.getElementById('voucherNo').value = newNo;
                    if (document.getElementById('catVoucherNo')) document.getElementById('catVoucherNo').value = newNo;

                    // Continue loop to retry
                    continue;
                } else {
                    alert('Failed to generate a new voucher number. Please try again.');
                    return;
                }
            }

            // Other errors
            alert('Error: ' + data.message);
            return;

        } catch (err) {
            console.error(err);
            alert('Failed to save voucher during network request');
            return;
        }
    }

    alert('Failed to save voucher after multiple attempts due to high traffic. Please try again.');
}

window.editVoucher = function (id) {
    const currentPath = window.location.pathname.toLowerCase();
    const voucher = loadedVouchers.find(v => v._id === id);
    let isCategory = false;
    if (voucher) {
        const mainEntry = voucher.entries.find(e => !e.detail || !e.detail.includes('Auto-balanced'));
        isCategory = mainEntry && mainEntry.detail === 'Category Wise Payment';
    } else {
        isCategory = currentPath.includes('category');
    }

    // If on list page, redirect to dedicated entry page with edit param
    if (currentPath.includes('list')) {
        const targetUrl = isCategory ? `/category-voucher?edit=${id}` : `/supplier-voucher?edit=${id}`;
        window.location.href = targetUrl;
        return;
    }

    // If on entry page (or shared JS usage), enter edit mode directly
    loadVoucherForEdit(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function fetchVoucherList() {
    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const isAdmin = user.role === 'admin' ||
            (user.group && user.group.isAdmin) ||
            (user.groupId && (user.groupId.isAdmin || user.groupId.rights?.isAdmin));

        const fromDate = document.getElementById('listFromDate')?.value || '';
        const toDate = document.getElementById('listToDate')?.value || '';

        // Fix: Filter by Branch Name (Text) not ID (Value) because DB stores Name
        const branchEl = document.getElementById('listBranchFilter');
        let branch = '';
        if (branchEl && branchEl.value) {
            branch = branchEl.options[branchEl.selectedIndex].text;
        }

        // SECURITY FIX: if restricted user and no branch selected, FORCE their branch
        if (!isAdmin && !branch && user.branch) {
            const userBranches = Array.isArray(user.branch) ? user.branch : [user.branch];
            if (userBranches.length > 0) {
                branch = userBranches[0];
            }
        }

        const supplier = document.getElementById('listSupplierFilter')?.value || '';
        const category = document.getElementById('listCategoryFilter')?.value || '';
        const searchText = document.getElementById('listSearch')?.value || '';

        let url = `/api/v1/vouchers?limit=100&sort=-date&startDate=${fromDate}&endDate=${toDate}`;

        if (branch) {
            url += `&branch=${encodeURIComponent(branch)}`;
        }

        // Apply supplier or category filter based on active screen context
        const currentPath = window.location.pathname.toLowerCase();
        const activeTabId = document.querySelector('.nav-tabs-custom .nav-link.active')?.id;
        const isCatView = currentPath.includes('category') || activeTabId === 'list-category-tab';

        if (!isCatView && supplier) {
            url += `&supplier=${encodeURIComponent(supplier)}`;
        }

        if (isCatView && category) {
            url += `&category=${encodeURIComponent(category)}`;
        }

        if (searchText) {
            url += `&search=${encodeURIComponent(searchText)}`;
        }

        console.log('Fetching vouchers URL:', url);

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            loadedVouchers = data.data;
            renderVoucherTable();
        }
    } catch (err) {
        console.error(err);
    }
}

function renderVoucherTable() {
    const tbody = document.getElementById('voucherListBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const currentPath = window.location.pathname.toLowerCase();
    const activeTabId = document.querySelector('.nav-tabs-custom .nav-link.active')?.id;
    const isCatView = currentPath.includes('category') || activeTabId === 'list-category-tab';

    loadedVouchers.forEach(v => {
        // Find the "Main" entry (the debit side that isn't auto-balanced)
        const mainEntry = v.entries.find(e => !e.detail || !e.detail.includes('Auto-balanced'));
        const partyName = mainEntry ? mainEntry.account : 'N/A';

        // Detect if it's a category voucher (based on detail marker we set during save)
        const isCategory = mainEntry && mainEntry.detail === 'Category Wise Payment';

        // Filter based on context
        if (isCatView && !isCategory) return;
        if (!isCatView && isCategory) return;

        const badgeClass = isCategory ? 'badge-category' : 'badge-supplier';
        const badgeLabel = isCategory ? 'Category' : 'Supplier';

        // Created by and Computer / IP info
        const createdUser = v.createdByName || (v.createdBy && (v.createdBy.name || v.createdBy.username)) || 'Admin';
        const compName = v.computerName || 'Main Server';
        const compIp = v.ipAddress || '127.0.0.1';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="voucher-check" value="${v._id}"></td>
            <td class="fw-bold">${v.voucherNo}</td>
            <td>${new Date(v.date).toLocaleDateString()}</td>
            <td><span class="${badgeClass}">${badgeLabel}</span> ${partyName}</td>
            <td>${v.branch || 'Shop'}</td>
            <td class="fw-bold">PKR ${(v.totalDebit || 0).toLocaleString()}</td>
            <td>${v.voucherType === 'CPV' ? 'Cash' : 'Bank'}</td>
            <td>
                <span class="badge-created-by" title="Created by user ${createdUser}">
                    <i class="fas fa-user-circle me-1"></i>${createdUser}
                </span>
            </td>
            <td>
                <div class="system-meta-cell" title="System: ${compName} | IP: ${compIp}">
                    <span class="comp-name"><i class="fas fa-desktop me-1"></i>${compName}</span>
                    <span class="comp-ip"><i class="fas fa-network-wired me-1"></i>${compIp}</span>
                </div>
            </td>
            <td class="text-truncate" style="max-width: 140px;">${v.narration || '-'}</td>
            <td class="text-center action-btns">
                <button class="btn btn-sm btn-info text-white" onclick="printSingle('${v._id}')"><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm btn-warning text-white" onclick="editVoucher('${v._id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteVoucher('${v._id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Add tab listener for list page if tabs exist
if (document.getElementById('listTabs')) {
    document.getElementById('listTabs').addEventListener('shown.bs.tab', () => {
        renderVoucherTable();
        updateFilterVisibility();
    });
}

// Update filter section visibility based on active context
function updateFilterVisibility() {
    const currentPath = window.location.pathname.toLowerCase();
    const activeTabId = document.querySelector('#listTabs .nav-link.active')?.id;
    const isCatView = currentPath.includes('category') || activeTabId === 'list-category-tab';

    const supplierFilterDiv = document.getElementById('listSupplierFilter')?.closest('.col-md-2');
    const categoryFilterDiv = document.getElementById('listCategoryFilter')?.closest('.col-md-2');

    if (isCatView) {
        if (supplierFilterDiv) supplierFilterDiv.style.display = 'none';
        if (categoryFilterDiv) categoryFilterDiv.style.display = '';
    } else {
        if (supplierFilterDiv) supplierFilterDiv.style.display = '';
        if (categoryFilterDiv) categoryFilterDiv.style.display = 'none';
    }
}

window.resetForm = function (id) {
    const form = document.getElementById(id);
    if (form) form.reset();
    const today = new Date().toISOString().split('T')[0];
    const vDate = document.getElementById('voucherDate');
    if (vDate) vDate.value = today;
    const catDate = document.getElementById('catVoucherDate');
    if (catDate) catDate.value = today;
    generateNextVoucherNo();
}

window.applyFilters = fetchVoucherList;

window.toggleSelectAll = function () {
    const main = document.getElementById('selectAllVouchers');
    document.querySelectorAll('.voucher-check').forEach(c => c.checked = main.checked);
}

window.printSingle = function (id) {
    const win = window.open(`/payment-voucher-print?id=${id}`, '_blank');
}

window.printFullList = function () {
    const ids = loadedVouchers.map(v => v._id).join(',');
    window.open(`/payment-voucher-print?ids=${ids}`, '_blank');
}

window.printSelected = function () {
    const selected = Array.from(document.querySelectorAll('.voucher-check:checked')).map(c => c.value);
    if (selected.length === 0) return alert('Please select at least one voucher');
    window.open(`/payment-voucher-print?ids=${selected.join(',')}`, '_blank');
}

window.deleteVoucher = async function (id) {
    if (!confirm('Are you sure you want to delete this voucher?')) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/vouchers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            alert('Voucher Deleted');
            fetchVoucherList();
        }
    } catch (err) { alert('Error deleting voucher'); }
}

window.openQuickAddCategory = function () {
    // We specify 'customer-category' as the type
    // After success, we reload the categories in the dropdown
    showQuickAddDialog('customer-category', async () => {
        const branchId = document.getElementById('catBranchSelect').value;
        await loadInitialData(); // This reloads categories for all relevant dropdowns
    });

    // The desktop-ui logic expects a select with id matching the type
    // In our case, the select is 'catCustomerCategory'. We'll adjust the logic 
    // to search for the correct select after a small delay.
    setTimeout(() => {
        const select = document.getElementById('catCustomerCategory');
        window._quickAddTargetSelectId = 'catCustomerCategory';
    }, 100);
};

// Helper function to generate a fresh voucher number (CPV/BPV)
// Explicitly needed for the retry mechanism in saveVoucher
async function generateVoucherNumber(type) {
    try {
        const token = localStorage.getItem('token');
        // Type should be CPV, BPV, etc.
        const res = await fetch(`/api/v1/vouchers/next-number/${type}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            return data.data;
        }
        return null;
    } catch (err) {
        console.error('Error in generateVoucherNumber:', err);
        return null;
    }
}

