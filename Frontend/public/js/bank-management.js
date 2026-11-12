document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Fields - Default Cheque Dates to today, others empty for "yyyy-mm-dd"
    const today = new Date().toISOString().split('T')[0];
    const dateFields = document.querySelectorAll('input[type="date"]');
    dateFields.forEach(field => {
        const id = field.id;
        if (id === 'bp-chq-from' || id === 'bp-chq-to' || id === 'bd-from-date' || id === 'bd-to-date' || id === 'bs-from-date' || id === 'bs-to-date' || id === 'btb-date' || id === 'btb-filter-from' || id === 'btb-filter-to') {
            field.value = today;
        } else if (id.includes('from') || id.includes('to') || id.includes('search')) {
            field.value = '';
        } else {
            field.value = today;
        }
    });

    function syncBankDeleteHeaderAndButtons() {
        const canDelete = !!window._bdCanDelete;

        const bdDeleteBtn = document.getElementById('bd-delete-btn');
        if (bdDeleteBtn) bdDeleteBtn.style.display = canDelete ? '' : 'none';

        const theadTr = document.querySelector('#bankDetailsTable thead tr');
        if (!theadTr) return;

        // Find any delete header by ID, title, or trash content
        const deleteHdrs = theadTr.querySelectorAll('#bd-delete-col-header, th[title*="delete" i], th[title*="Delete"]');

        if (canDelete) {
            let hdr = document.getElementById('bd-delete-col-header');
            if (!hdr) {
                hdr = document.createElement('th');
                hdr.id = 'bd-delete-col-header';
                hdr.className = 'text-center no-print';
                hdr.style.color = '#dc3545';
                hdr.style.width = '45px';
                hdr.title = 'Tick to delete';
                hdr.textContent = '🗑';
                theadTr.appendChild(hdr);
            } else {
                hdr.style.display = '';
            }
        } else {
            // If rights are OFF, completely remove all delete headers from DOM so columns match body rows perfectly
            deleteHdrs.forEach(h => h.remove());
            Array.from(theadTr.children).forEach(th => {
                if (th.textContent.includes('🗑') || (th.title && th.title.toLowerCase().includes('delete'))) {
                    th.remove();
                }
            });
        }
    }
    window.syncBankDeleteHeaderAndButtons = syncBankDeleteHeaderAndButtons;

    // ── Permission Check: Bank Detail Delete (button + column header + per-row checkboxes) ──
    async function syncBankDeletePermission() {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const meRes = await fetch('/api/v1/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (meRes.ok) {
                    const meData = await meRes.json();
                    if (meData && meData.rights) {
                        localStorage.setItem('user', JSON.stringify(meData));
                    }
                }
            } catch (e) {
                console.warn('Could not refresh user rights:', e);
            }
        }

        const _bdUser = JSON.parse(localStorage.getItem('user') || '{}');
        const _bdRights = _bdUser.rights || {};

        const hasDetailDelete = _bdRights['bank_detail_delete'] === true || _bdRights['bank_detail_delete'] === 'true';
        const hasPaymentDelete = _bdRights['bank_payment_delete'] === true || _bdRights['bank_payment_delete'] === 'true';

        // Show delete button and tick checkboxes only if EITHER right is checked.
        // If BOTH rights are unchecked, HIDE them completely.
        const _bdCanDelete = hasDetailDelete || hasPaymentDelete;
        window._bdCanDelete = _bdCanDelete;

        syncBankDeleteHeaderAndButtons();
        return _bdCanDelete;
    }

    try { await syncBankDeletePermission(); } catch (e) { console.error('Error checking bank permissions:', e); }

    // Initial Load - Wrapped in try-catch to prevent failure from breaking UI
    try { await loadAllBanks(); } catch (e) { console.error('Error loading banks', e); }
    try { await loadBranches(); } catch (e) { console.error('Error loading branches', e); }
    try { await populateBDBank(); } catch (e) { console.error('Error populating BD banks', e); }

    // Set default tab based on URL hash or first tab
    const hash = window.location.hash || '#bank-detail';
    const tabTrigger = document.querySelector(`button[data-bs-target="${hash}"]`);
    if (tabTrigger) tabTrigger.click();

    // Radio button listeners for Bank Deduction vs Bank Payment
    const deductionOpt = document.getElementById('deductionOption');
    const paymentOpt = document.getElementById('paymentOption');
    const bdDateFilterType = document.getElementById('bd-date-filter-type');

    if (paymentOpt) {
        paymentOpt.addEventListener('change', () => {
            if (paymentOpt.checked) {
                if (bdDateFilterType) bdDateFilterType.value = 'cheque';
            }
        });
    }

    if (deductionOpt) {
        deductionOpt.addEventListener('change', () => {
            if (deductionOpt.checked) {
                if (bdDateFilterType) bdDateFilterType.value = 'entry';
            }
        });
    }

    // Event Listeners for Filters
    document.querySelectorAll('.branch-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const scope = e.target.closest('.tab-pane');
            if (scope) {
                console.log(`Branch changed in ${scope.id}, reloading departments/banks`);
                loadDepartments(scope);

                // Update Bank Detail grouped dropdown on branch change
                if (scope.id === 'bank-detail') {
                    populateBDBank(e.target.value);
                }

                // Special handling for Bank Payments tab
                if (scope.id === 'bank-payments') {
                    if (window.populateBPFilterFromReference) window.populateBPFilterFromReference();
                    if (window.loadBankPayments) window.loadBankPayments();
                }
            }
        });
    });

    // Specific listener for Pending Chq filters to reload grid data
    const pcBranch = document.getElementById('pc-branch');
    const pcBank = document.getElementById('pc-bank');
    if (pcBranch) pcBranch.addEventListener('change', () => loadPendingChqData());
    if (pcBank) pcBank.addEventListener('change', () => loadPendingChqData());

    const pcDate = document.getElementById('pc-bank-date');
    if (pcDate) pcDate.addEventListener('change', () => loadPendingChqData());

    const pcSaveBtn = document.getElementById('pc-save-btn');
    if (pcSaveBtn) {
        pcSaveBtn.addEventListener('click', () => {
            const branch = document.getElementById('pc-branch').value;
            const bankSelect = document.getElementById('pc-bank');
            const bank = bankSelect.value;
            const bankName = bankSelect.options[bankSelect.selectedIndex]?.text || bank;
            const date = document.getElementById('pc-bank-date').value;
            const stmtDate = document.getElementById('pc-stmt-date').value;
            const ledger = document.getElementById('pc-bank-amount').value;
            const pending = document.getElementById('pc-pending-chq').value;
            const statement = document.getElementById('pc-statement').value;
            const diff = document.getElementById('pc-diff').value;

            if (!branch || !bank || !date) {
                alert('Please select Branch, Bank and Date');
                return;
            }

            const record = {
                id: Date.now().toString(),
                dated: new Date().toISOString().split('T')[0],
                sysDate: new Date().toLocaleTimeString(),
                branch,
                bank: bankName, // Save Name instead of ID
                bankId: bank,   // Save ID separately if needed
                bankDate: date,
                stmtDate: stmtDate,
                ledger: parseFloat(ledger),
                pending: parseFloat(pending),
                statement: parseFloat(statement),
                diff: parseFloat(diff)
            };

            const history = JSON.parse(localStorage.getItem('pending_chq_history') || '[]');
            history.unshift(record);
            localStorage.setItem('pending_chq_history', JSON.stringify(history));

            alert('Data saved successfully.');
            loadPendingChqData();

            // Clear Statement field for next entry
            document.getElementById('pc-statement').value = '';
            // Recalculate diff (will likely go back to Bank + Pending)
            calculateDiff();
        });
    }

    document.querySelectorAll('.dept-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const scope = e.target.closest('.tab-pane');
            filterBanks(scope);
        });
    });

    // Listen for global data updates
    window.addEventListener('bank-data-updated', () => {
        console.log('Bank data updated, refreshing active tab...');
        const activeTab = document.querySelector('.tab-pane.active');
        if (activeTab) {
            refreshTab(activeTab.id);
        }
    });

    // Tab Activation Listeners
    document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', (e) => {
            const target = e.target.getAttribute('data-bs-target'); // e.g. #bank-detail
            const id = target.replace('#', '');
            refreshTab(id);
        });
    });

    function refreshTab(id) {
        if (id === 'bank-to-bank') {
            if (window.loadBTBTransfers) window.loadBTBTransfers();
        } else if (id === 'bank-detail') {
            // Bank Detail loads only when the user clicks Search.
        } else if (id === 'bank-summary') {
            const from = document.getElementById('pro-from-date').value;
            const to = document.getElementById('pro-to-date').value;
            if (from && to && window.fetchProReport) {
                window.fetchProReport();
            }
        } else if (id === 'bank-payments') {
            if (window.loadBankPayments) window.loadBankPayments();
        } else if (id === 'pending-chq') {
            if (window.loadPendingChqData) window.loadPendingChqData();
        }
    }

    // "View & Verify All" link on Pending Chq screen — switches to Bank Detail with all-time range
    const viewUnverifiedLink = document.getElementById('view-unverified-link');
    if (viewUnverifiedLink) {
        viewUnverifiedLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Set Bank Detail date range to all-time
            const fromInput = document.getElementById('bd-from-date');
            const toInput = document.getElementById('bd-to-date');
            if (fromInput) fromInput.value = '2000-01-01';
            if (toInput) toInput.value = new Date().toISOString().split('T')[0];

            // Copy branch from Pending Chq to Bank Detail
            const pcBranch = document.getElementById('new-branch');
            const bdBranch = document.getElementById('bd-branch');
            if (pcBranch && bdBranch && pcBranch.value) bdBranch.value = pcBranch.value;

            // Switch to Bank Detail tab
            const bankDetailTab = document.querySelector('button[data-bs-target="#bank-detail"]');
            if (bankDetailTab) bankDetailTab.click();
        });
    }

    // Select All functionality for Bank Detail tab
    const selectAllDetails = document.getElementById('selectAllBatches');
    if (selectAllDetails) {
        selectAllDetails.addEventListener('change', (e) => {
            const isChecked = e.target.checked;

            if (isChecked && !document.getElementById('deductionOption')?.checked) {
                e.target.checked = false;
                return;
            }

            if (isChecked && !confirm('This will select every visible Bank Deduction entry for clearing. You must press Update to save the changes. Do you want to continue?')) {
                e.target.checked = false;
                return;
            }

            const fromDate = document.getElementById('bd-from-date')?.value || '';
            const toDate = document.getElementById('bd-to-date')?.value || '';
            const rows = document.querySelectorAll('#bankDetailsBody tr');
            rows.forEach(row => {
                // Select only entries currently visible in the filtered grid.
                // The API already applies the selected From/To range, but keep
                // the range check here so stale rows cannot be selected.
                const rowDate = row.dataset.dateStr || '';
                const isInDateRange = (!fromDate || (rowDate && rowDate >= fromDate))
                    && (!toDate || (rowDate && rowDate <= toDate));
                const isVisible = row.style.display !== 'none'
                    && getComputedStyle(row).display !== 'none';
                if (!isVisible || !isInDateRange) return;

                const checkbox = row.querySelector('.batch-checkbox');
                if (checkbox) {
                    checkbox.checked = isChecked;
                }
            });
            // REMOVED: calculateGridTotals();
            // Totals should only update AFTER "Update" is clicked and saved.
        });
    }

    // Show / hide "Select All" checkbox based on bank dropdown change
    const bdBankSel = document.getElementById('bd-bank-select');
    if (bdBankSel) {
        bdBankSel.addEventListener('change', () => {
            const selectAllControl = document.getElementById('selectAllBatchesControl');
            const selectAllDetails = document.getElementById('selectAllBatches');
            const isDeduction = document.getElementById('deductionOption')?.checked;
            const isEasypaisa = bdBankSel.value === 'GROUP_EP';
            if (selectAllControl) selectAllControl.classList.toggle('d-none', !(isDeduction && isEasypaisa));
            // Uncheck when hidden
            if (selectAllDetails && !(isDeduction && isEasypaisa)) selectAllDetails.checked = false;
        });
    }

    // Prevent Dropdown from closing when clicking inside (for Multi-Select)
    document.querySelectorAll('.dropdown-menu.stop-propagation').forEach(menu => {
        menu.addEventListener('click', function (e) {
            e.stopPropagation();
        });
    });
});

let allBranches = [];
let allDepartments = [];
let allBanksReference = []; // To store all banks and filter locally

// Shared Data Loaders
async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');
        let user = null;
        if (userStr) {
            try { user = JSON.parse(userStr); } catch (e) { console.error('Error parsing user', e); }
        }

        const response = await fetch('/api/v1/stores', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) {
            allBranches = data.data;

            // Permission Filter
            // If user is not admin, filter branches
            if (user && user.role !== 'admin' && user.branch && Array.isArray(user.branch) && user.branch.length > 0) {
                // user.branch is likely an array of IDs or Names
                allBranches = allBranches.filter(b => user.branch.includes(b._id) || user.branch.includes(b.name));
            } else if (user && user.role !== 'admin' && user.branch && typeof user.branch === 'string') {
                // Handle legacy single branch case
                allBranches = allBranches.filter(b => b._id === user.branch || b.name === user.branch);
            }

            const selects = document.querySelectorAll('.branch-select');
            selects.forEach(sel => {
                const currentVal = sel.value;
                sel.innerHTML = '<option value="">Select Branch</option>'; // Or PWD-1 as default if needed
                allBranches.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.name;
                    opt.textContent = b.name;
                    sel.appendChild(opt);
                });

                // Default to first if only one available
                // IMPORTANT: If we filtered down to 1 (restricted user), auto-select it.
                if (allBranches.length === 1) {
                    sel.value = allBranches[0].name;
                    sel.dispatchEvent(new Event('change'));
                }
            });
            // Trigger department load for all scopes
            document.querySelectorAll('.tab-pane').forEach(scope => loadDepartments(scope));
        }
    } catch (e) { console.error(e); }
}

async function loadDepartments(scopeElement) {
    if (!scopeElement) return;
    const branchSel = scopeElement.querySelector('.branch-select');
    const deptSel = scopeElement.querySelector('.dept-select');

    // BTB and Pending Chq screens don't have dept select, they filter banks by branch directly
    if (!branchSel) return;
    if (scopeElement.id === 'bank-to-bank' || scopeElement.id === 'pending-chq') {
        filterBanks(scopeElement);
        return;
    }
    if (!deptSel) return;

    const branch = branchSel.value;
    deptSel.innerHTML = '<option value="">Select Department</option>';

    if (!branch) return;

    try {
        const token = localStorage.getItem('token');
        // We could cache this but fetching for freshness is safer for now
        const response = await fetch('/api/v1/departments', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) {
            // Filter departments: Must be active, match branch, AND have at least one bank
            // Sort departments first
            const sorted = data.data.sort((a, b) => {
                const codeA = parseInt(a.code) || 999999;
                const codeB = parseInt(b.code) || 999999;
                return codeA - codeB || a.name.localeCompare(b.name);
            });

            // Filter departments: Must be active, match branch, AND have at least one bank
            const filtered = sorted.filter(d => {
                const isActiveAndBranch = d.branch === branch && d.isActive;
                if (!isActiveAndBranch) return false;

                // Filter: Hide specialized internal departments
                if (d.name === 'PERCENTAGE CASH' || d.name === 'CASH REC FROM COUNTER') return false;

                // Filter: Hide if only 'Closing_2_Comp_Sale' is set
                if (d.closing2CompSale && !d.closing2DeptDropDown) return false;

                // Check if any bank belongs to this department
                // Bank department field can be ID string or object
                const hasBank = allBanksReference.some(b => {
                    const bankDeptId = (b.department && b.department._id) ? b.department._id : b.department;
                    return bankDeptId === d._id;
                });
                return hasBank;
            });

            if (filtered.length === 0) {
                const opt = document.createElement('option');
                opt.textContent = "No Departments with Banks";
                opt.disabled = true;
                opt.selected = true;
                deptSel.appendChild(opt);
            } else {
                filtered.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d._id;
                    opt.textContent = d.name;
                    deptSel.appendChild(opt);
                });
            }
            // Trigger bank filter
            filterBanks(scopeElement);
        }
    } catch (e) { console.error(e); }
}

async function loadAllBanks() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/banks', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) {
            allBanksReference = data.data;
            // Initial filter for active tabs
            document.querySelectorAll('.tab-pane').forEach(scope => filterBanks(scope));
        }
    } catch (e) { console.error(e); }
}

function filterBanks(scopeElement) {
    if (!scopeElement) return;
    // Custom Multi-Select Logic for Bank Summary Tab only (Bank Detail uses grouped dropdown)
    if (scopeElement.id === 'bank-summary') {
        populateBankMultiSelect(scopeElement);
    }

    // Bank Detail tab uses grouped dropdown populated branch-wise
    if (scopeElement.id === 'bank-detail') {
        const branchVal = scopeElement.querySelector('.branch-select')?.value || '';
        populateBDBank(branchVal);
        return;
    }

    // Standard Select Logic for other tabs
    const bankSelects = scopeElement.querySelectorAll('.bank-select');
    if (bankSelects.length === 0) return;

    const branchSel = scopeElement.querySelector('.branch-select');
    const branchVal = branchSel ? branchSel.value : null;
    const deptVal = scopeElement.querySelector('.dept-select')?.value;

    console.log(`Filtering banks for ${scopeElement.id}. Branch: ${branchVal}, Dept: ${deptVal}`);

    bankSelects.forEach(bankSel => {
        const currentVal = bankSel.value;
        bankSel.innerHTML = '<option value="">Select Bank</option>';

        const filtered = allBanksReference.filter(b => {
            // Match Branch: handle object (name/id) or direct string
            if (branchVal) {
                const bBranchName = (b.branch && typeof b.branch === 'object') ? b.branch.name : b.branch;
                const bBranchId = (b.branch && typeof b.branch === 'object') ? b.branch._id : b.branch;

                // Try matching by name or ID
                if (bBranchName !== branchVal && bBranchId !== branchVal) return false;
            }

            // Match Department
            if (deptVal) {
                const bDeptId = (b.department && typeof b.department === 'object') ? b.department._id : b.department;
                if (bDeptId && bDeptId !== deptVal) return false;
            }

            // Rule: 'Branch Bank' type is specific to Pending Chq tab
            if (scopeElement.id === 'pending-chq') {
                // Pending Chq: Show ONLY Branch Banks
                if (b.bankType !== 'Branch Bank') return false;
            } else {
                // Other Tabs: Hide Branch Banks
                if (b.bankType === 'Branch Bank') return false;
            }

            return true;
        });

        filtered.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b._id;
            opt.textContent = b.bankName;
            bankSel.appendChild(opt);
        });

        // If the previous selection is still valid in the new list, keep it
        if (currentVal && filtered.some(b => b._id === currentVal)) {
            bankSel.value = currentVal;
        } else if (filtered.length > 0 && scopeElement.id === 'pending-chq') {
            // Auto-select first bank for Pending Chq screen if nothing selected
            // bankSel.selectedIndex = 1; 
        }
    });
}

// Expose functions for other logic files
window.loadDepartments = loadDepartments;
window.filterBanks = filterBanks;
window.loadBranches = loadBranches;
window.loadAllBanks = loadAllBanks;
window.updateBankRowsStatus = updateBankRowsStatus;
window.allBanksReference = allBanksReference;
window.populateBankMultiSelect = populateBankMultiSelect;
window.toggleAllBanks = toggleAllBanks;
window.filterBankDropdownItems = filterBankDropdownItems;
window.updateBankButtonText = updateBankButtonText;

// --- Multi-Select Helpers ---
function populateBankMultiSelect(scopeElement) {
    if (!scopeElement) return;
    const isSummary = scopeElement.id === 'bank-summary';
    const prefix = isSummary ? 'bs' : 'bd';

    const listContainer = document.getElementById(`${prefix}BankList`);
    const branchSel = scopeElement.querySelector('.branch-select');
    const deptSel = scopeElement.querySelector('.dept-select');

    const branch = branchSel ? branchSel.value : '';
    const dept = deptSel ? deptSel.value : '';

    if (!listContainer) return;

    listContainer.innerHTML = '';

    // Reset Select All
    const checkAll = document.getElementById(isSummary ? 'checkAllBanksSummary' : 'checkAllBanks');
    if (checkAll) checkAll.checked = false;

    // Filter banks based on Branch and Dept
    const filtered = allBanksReference.filter(b => {
        if (branch) {
            const bBranchName = (b.branch && typeof b.branch === 'object') ? b.branch.name : b.branch;
            const bBranchId = (b.branch && typeof b.branch === 'object') ? b.branch._id : b.branch;
            // Name or ID match
            if (bBranchName !== branch && bBranchId !== branch) return false;
        }
        if (dept) {
            const bDeptId = (b.department && typeof b.department === 'object') ? b.department._id : b.department;
            if (bDeptId && bDeptId !== dept) return false;
        }
        // Multi-select tabs usually hide Branch Banks (keep consistent with previous logic)
        if (b.bankType === 'Branch Bank') return false;

        return true;
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = '<div class="text-muted p-2 small">No banks found</div>';
    } else {
        filtered.forEach(b => {
            const div = document.createElement('div');
            div.className = 'form-check mb-1 dropdown-item-text';
            div.innerHTML = `
                <input class="form-check-input bank-checkbox" type="checkbox" value="${b._id}" id="chk_${prefix}_${b._id}" onchange="updateBankButtonText('${scopeElement.id}')">
                <label class="form-check-label small" for="chk_${prefix}_${b._id}" style="cursor:pointer; width: 100%;">${b.bankName}</label>
             `;
            listContainer.appendChild(div);
        });
    }
    updateBankButtonText(scopeElement.id);
}

function toggleAllBanks(source, scopeId) {
    const prefix = scopeId === 'bank-summary' ? 'bs' : 'bd';
    const checkboxes = document.querySelectorAll(`#${prefix}BankList .bank-checkbox`);
    checkboxes.forEach(cb => {
        // Only toggle visible ones (if filtered)
        if (cb.closest('div').style.display !== 'none') {
            cb.checked = source.checked;
        }
    });
    updateBankButtonText(scopeId);
}

function filterBankDropdownItems(input, scopeId) {
    const prefix = scopeId === 'bank-summary' ? 'bs' : 'bd';
    const filter = input.value.toLowerCase();
    const items = document.querySelectorAll(`#${prefix}BankList .form-check`);
    items.forEach(item => {
        const text = item.innerText.toLowerCase();
        item.style.display = text.includes(filter) ? '' : 'none';
    });
}

function updateBankButtonText(scopeId = 'bank-detail') {
    const isSummary = scopeId === 'bank-summary';
    const prefix = isSummary ? 'bs' : 'bd';
    const checked = document.querySelectorAll(`#${prefix}BankList .bank-checkbox:checked`);
    const btnId = isSummary ? 'bsBankDropdownBtn' : 'bdBankDropdownBtn';
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const span = btn.querySelector('span');

    if (checked.length === 0) {
        span.textContent = 'Select Banks';
    } else if (checked.length === 1) {
        // Find label
        const id = checked[0].id;
        const label = document.querySelector(`label[for="${id}"]`).textContent;
        span.textContent = label;
    } else {
        span.textContent = `${checked.length} Banks Selected`;
    }
}

// --- Tab 1: Bank Detail Functions ---
async function searchBankDetails() {
    const fromDate = document.getElementById('bd-from-date').value;
    const toDate = document.getElementById('bd-to-date').value;
    const branch = document.getElementById('bd-branch').value;
    const dept = document.getElementById('bd-dept').value;
    const dateFilterType = document.getElementById('bd-date-filter-type') ? document.getElementById('bd-date-filter-type').value : 'entry';
    // Get selected bank group and extract IDs from data-ids attribute
    let selectedBanks = [];
    const bankSelect = document.getElementById('bd-bank-select');
    if (bankSelect && bankSelect.value) {
        const selectedOpt = bankSelect.options[bankSelect.selectedIndex];
        if (selectedOpt && selectedOpt.dataset.ids) {
            // Grouped bank selected (Easypaisa or Branch Bank)
            selectedBanks = selectedOpt.dataset.ids.split(',');
        }
    }

    // const bank = document.getElementById('bd-bank').value; // OLD SINGLE SELECT

    const isDeduction = document.getElementById('deductionOption').checked; // If true, filter for batches/deductions

    if (!fromDate || !toDate) {
        alert('Please select a date range');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        let url;

        if (isDeduction) {
            // Bank Deduction (Daily Cash)
            url = `/api/v1/daily-cash?startDate=${fromDate}&endDate=${toDate}&dateFilterType=${dateFilterType}&hasBank=true&limit=0&_t=${Date.now()}`;
            if (branch) url += `&branch=${branch}`;
        } else {
            // Bank Payment (Bank Transactions)
            if (dateFilterType === 'cheque') {
                url = `/api/v1/bank-transactions?startChqDate=${fromDate}&endChqDate=${toDate}&useEffectiveDate=true&dateFilterType=cheque&excludeRefType=bank_transfer&limit=0&_t=${Date.now()}`;
            } else {
                url = `/api/v1/bank-transactions?startDate=${fromDate}&endDate=${toDate}&dateFilterType=${dateFilterType}&excludeRefType=bank_transfer&limit=0&_t=${Date.now()}`;
            }
            if (branch) url += `&branch=${branch}`;
        }

        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();

        if (data.success) {
            let filtered = data.data;

            // Strict Client-side Date Filter Safeguard: Ensure displayed data strictly matches From/To dates
            if (fromDate && toDate) {
                filtered = filtered.filter(item => {
                    let itemDateStr = '';
                    if (isDeduction) {
                        itemDateStr = item.date ? new Date(item.date).toISOString().split('T')[0] : '';
                    } else {
                        if (dateFilterType === 'entry') {
                            itemDateStr = item.date ? new Date(item.date).toISOString().split('T')[0] : '';
                        } else if (dateFilterType === 'clearance') {
                            itemDateStr = item.clearedAt ? new Date(item.clearedAt).toISOString().split('T')[0] : '';
                        } else if (dateFilterType === 'batch_transfer') {
                            itemDateStr = item.verifiedDate ? new Date(item.verifiedDate).toISOString().split('T')[0] : '';
                        } else {
                            // Default / 'cheque' filter: prioritize chequeDate
                            const d = item.chequeDate || item.date;
                            itemDateStr = d ? new Date(d).toISOString().split('T')[0] : '';
                        }
                    }
                    if (!itemDateStr) return false;
                    return itemDateStr >= fromDate && itemDateStr <= toDate;
                });
            }

            // Client-side Refined Filtering
            if (isDeduction) {
                // EXTREMELY STRICT: If there is no bank object, it is "Cash data" and must NOT show here.
                filtered = filtered.filter(item => item.bank && (item.bank.bankName || typeof item.bank === 'string'));
            }

            if (dept) filtered = filtered.filter(item => item.department && (item.department._id === dept || item.department === dept));

            if (selectedBanks.length > 0) {
                filtered = filtered.filter(item => {
                    if (isDeduction) {
                        // For Bank Deduction (Daily Cash), check bank object or ID
                        const itemBankId = (item.bank && item.bank._id) ? item.bank._id : item.bank;
                        // Check if itemBankId matches ANY of the selected banks
                        return selectedBanks.includes(itemBankId);
                    } else {
                        // For Bank Payment (Bank Transactions), check bankName
                        // We must match the item's bank name to one of the SELECTED banks' names
                        // 1. Get names of selected banks
                        const selectedBankNames = allBanksReference
                            .filter(b => selectedBanks.includes(b._id))
                            .map(b => b.bankName);

                        const itemBankName = item.bankName || (item.bank && item.bank.bankName) || item.bank;
                        return selectedBankNames.includes(itemBankName);
                    }
                });
            }

            // CRITICAL: Additional client-side filter for Bank Payment mode
            // Exclude Bank Transfer entries (in case refType field is missing in old records)
            if (!isDeduction) {
                filtered = filtered.filter(item => {
                    const narration = (item.narration || item.remarks || '').toLowerCase();
                    // Exclude if narration contains "bank transfer"
                    if (narration.includes('bank transfer')) return false;

                    // Exclude "Received" type entries (deposits) - only show "Paid" (withdrawals)
                    const transType = (item.transactionType || item.type || '').toLowerCase();
                    if (transType === 'deposit' || transType === 'received') return false;

                    return true;
                });
            }

            // Map Data to Common Format
            const mappedData = filtered.map(item => {
                let mapped = {
                    date: item.date,
                    bank: item.bank,
                    remarks: item.remarks || item.details || item.description || '',
                    batchNo: item.batchNo || '-',
                    _id: item._id,
                    // Ensure strict boolean
                    isVerified: (item.isVerified === true || item.isVerified === 'true' || item.isVerified === 1),
                    verifiedDate: item.verifiedDate, // Map new field
                    department: item.department ? (item.department.name || item.department) : '-'
                };

                if (isDeduction) {
                    const ratePerc = item.deductedAmount || 0;
                    // Fix: totalAmount acts as the Gross Amount. Do not add ratePerc.
                    const grossBase = parseFloat(item.totalAmount) || 0;

                    mapped.ratePercent = ratePerc;
                    mapped.amount = grossBase;
                    // Round deduction to whole number (Round)
                    const rawDeduction = (grossBase * ratePerc) / 100;
                    mapped.deduction = Math.round(rawDeduction);
                    mapped.total = Math.round(grossBase - mapped.deduction);

                    mapped.department = item.department ? (item.department.name || item.department) : '-';
                    mapped.bank = item.bank && item.bank.bankName ? item.bank.bankName : (item.bankName || item.bank || '-');
                    mapped.remarks = item.remarks || item.description || '';
                    mapped.batchNo = item.batchID || item.batchNo || '-';
                } else {
                    // Bank Payment Logic (BankTransaction model)
                    mapped.amount = item.amount || 0;
                    mapped.deduction = 0;
                    mapped.total = item.amount || 0;

                    // Map correct fields from BankTransaction
                    mapped.bank = item.bankName || (item.bank && item.bank.bankName) || item.bank || '-';
                    mapped.remarks = item.narration || item.remarks || '-';
                    mapped.batchNo = item.invoiceNo || '-';
                    mapped.department = item.department ? (item.department.name || item.department) : '-';
                    mapped.date = item.chequeDate || item.date;
                    mapped.postDate = item.date;
                    mapped.chequeDate = item.chequeDate;
                }
                return mapped;
            });

            // Sort: Unverified (Red) on top, Verified (Green) at bottom. Both sorted by Date Ascending.
            mappedData.sort((a, b) => {
                const vA = a.isVerified ? 1 : 0;
                const vB = b.isVerified ? 1 : 0;

                // 1. Primary Sort: Verification Status
                // 0 (Unverified) comes before 1 (Verified)
                if (vA !== vB) {
                    return vA - vB;
                }

                // 2. Secondary Sort: Date Ascending
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                return dateA - dateB;
            });

            renderBankDetailGrid(mappedData, isDeduction);
        } else {
            console.error(data.message);
            alert('Failed to fetch data');
        }
    } catch (e) {
        console.error(e);
        alert('Error fetching data');
    }
}

function renderBankDetailGrid(data, isDeduction) {
    const tbody = document.getElementById('bankDetailsBody');
    const selectAllControl = document.getElementById('selectAllBatchesControl');
    const selectAllDetails = document.getElementById('selectAllBatches');
    tbody.innerHTML = '';

    if (selectAllControl) {
        const bankSel = document.getElementById('bd-bank-select');
        const isEasypaisa = bankSel && bankSel.value === 'GROUP_EP';
        selectAllControl.classList.toggle('d-none', !(isDeduction && isEasypaisa));
    }
    if (selectAllDetails) selectAllDetails.checked = false;

    const todayStr = new Date().toISOString().split('T')[0];

    // Toggle Headers Visibility
    const headers = document.querySelectorAll('#bankDetailsTable thead th');
    if (headers.length > 0) {
        if (headers[0]) headers[0].textContent = isDeduction ? 'Date' : 'Cheque Date';
        // Indices: 2 (Batch Transfer Date), 6 (Rate), 7 (Deduction), 8 (Total)
        const displayStyle = isDeduction ? '' : 'none';
        if (headers[2]) headers[2].style.display = displayStyle;
        if (headers[6]) headers[6].style.display = displayStyle;
        if (headers[7]) headers[7].style.display = displayStyle;
        if (headers[8]) headers[8].style.display = displayStyle;
    }

    // Sync Delete Column Header dynamically
    if (typeof syncBankDeleteHeaderAndButtons === 'function') {
        syncBankDeleteHeaderAndButtons();
    } else if (typeof window.syncBankDeleteHeaderAndButtons === 'function') {
        window.syncBankDeleteHeaderAndButtons();
    }

    let greenTotal = 0;
    let redTotal = 0;

    data.forEach(item => {
        const deduction = item.deduction || 0;
        const total = item.total || 0;
        const amount = item.amount || 0;
        const rate = item.ratePercent || 0;

        if (item.isVerified) {
            greenTotal += total;
        } else {
            redTotal += total;
        }

        const bankName = item.bank ? (item.bank.bankName || item.bank) : '-';
        const dateObj = new Date(item.date);
        const dateStr = dateObj.toISOString().split('T')[0]; // yyyy-mm-dd for Input

        // Format Display Date as dd-mm-yyyy
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const displayDate = `${day}-${month}-${year}`;

        // Default Input Date: If verified use verifiedDate, else ALWAYS Today's Date
        let inputDateValue = todayStr;
        if (item.isVerified) {
            if (item.verifiedDate) {
                inputDateValue = new Date(item.verifiedDate).toISOString().split('T')[0];
            } else {
                // If marked verified but no verifiedDate (legacy), use dateStr
                inputDateValue = dateStr;
            }
        }

        const tr = document.createElement('tr');
        tr.dataset.id = item._id; // Store ID for persistence
        tr.dataset.total = total || 0;
        tr.dataset.remarks = item.remarks || '';
        tr.dataset.dateStr = dateStr;
        tr.dataset.initialVerified = item.isVerified ? 'true' : 'false';
        tr.dataset.initialVerifiedDate = inputDateValue;
        // Store the normalized bank ID for row-level actions.
        const itemBankId = item.bank && typeof item.bank === 'object'
            ? item.bank._id
            : item.bank;
        tr.dataset.bankId = itemBankId ? String(itemBankId) : '';

        // Cache searchable text to avoid expensive innerText reflow on every keystroke
        const searchParts = [
            displayDate,
            bankName,
            item.department || '',
            String(amount),
            item.remarks || '',
            item.batchNo || ''
        ];
        if (isDeduction) {
            searchParts.push(String(rate), String(deduction), String(total));
        }
        tr.dataset.searchText = searchParts.join(' ').toLowerCase();

        let html = `
            <td>${displayDate}</td>
            <td class="text-center"><input type="checkbox" class="batch-checkbox" value="${item._id}" ${item.isVerified ? 'checked' : ''}></td>
        `;

        if (isDeduction) {
            html += `<td><input type="date" class="form-control form-control-sm border-0 bg-transparent batch-date-input" value="${inputDateValue}"></td>`;
        } else {
            html += `<td style="display:none"></td>`;
        }

        html += `<td>${bankName}</td>
                 <td>${item.department || '-'}</td>
                 <td>${amount.toLocaleString()}</td>`;

        if (isDeduction) {
            html += `<td>${rate}%</td>
                      <td>${deduction.toLocaleString()}</td>`;
        } else {
            html += `<td style="display:none"></td>
                      <td style="display:none"></td>`;
        }

        html += `<td class="${isDeduction ? '' : 'd-none'} fw-bold">${total.toLocaleString()}</td>
                 <td>${item.remarks || ''}</td>
                 <td>${item.batchNo || ''}</td>`;

        if (window._bdCanDelete) {
            html += `<td class="text-center no-print">
                        <input type="checkbox" class="delete-checkbox" value="${item._id}" style="accent-color:#dc3545;width:16px;height:16px;cursor:pointer;">
                     </td>`;
        }

        tr.innerHTML = html;
        applyRowColor(tr, item.isVerified);
        tbody.appendChild(tr);
    });

    // Update KPI Displays
    const greenDisplay = document.getElementById('bd-green-total');
    if (greenDisplay) {
        greenDisplay.textContent = Math.round(greenTotal).toLocaleString();
    }

    const redDisplay = document.getElementById('bd-red-total');
    if (redDisplay) {
        redDisplay.textContent = Math.round(redTotal).toLocaleString();
    }
}

// Delete selected (checked) bank transaction rows
async function deleteSelectedBankEntries() {
    // Permission guard
    if (!window._bdCanDelete) {
        alert('You do not have permission to delete bank entries.');
        return;
    }

    const tbody = document.getElementById('bankDetailsBody');
    const checked = tbody.querySelectorAll('.delete-checkbox:checked');

    if (checked.length === 0) {
        alert('Please tick the entries you want to delete first.');
        return;
    }

    // Determine correct API based on current mode
    const isDeduction = document.getElementById('deductionOption')?.checked;
    const apiBase = isDeduction ? '/api/v1/daily-cash' : '/api/v1/bank-transactions';

    if (!confirm(`Delete ${checked.length} selected entr${checked.length === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;

    const token = localStorage.getItem('token');
    let deleted = 0, failed = 0;

    for (const cb of checked) {
        const id = cb.value;
        const row = cb.closest('tr');
        try {
            const res = await fetch(`${apiBase}/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) { row.remove(); deleted++; }
            else { console.error('Delete failed:', data.message); failed++; }
        } catch (e) { console.error('Delete error:', e); failed++; }
    }

    calculateGridTotals();
    if (failed > 0) alert(`Done. ${deleted} deleted, ${failed} failed.`);
    else alert(`✓ ${deleted} entr${deleted === 1 ? 'y' : 'ies'} deleted successfully.`);
}

// Helper to apply Green/Red styling based on verification status
function applyRowColor(row, isVerified) {
    const cells = row.querySelectorAll('td');
    row.classList.remove('row-unverified', 'row-verified', 'bg-danger', 'bg-success', 'row-red', 'row-green');
    row.classList.add(isVerified ? 'row-verified' : 'row-unverified', isVerified ? 'bg-success' : 'bg-danger');

    if (isVerified) {
        // Verified: Green Background, White Text
        row.style.setProperty('background-color', '#28a745', 'important');
        row.style.setProperty('color', '#fff', 'important');
        row.style.fontWeight = 'normal';

        cells.forEach(cell => {
            cell.classList.remove('bg-danger', 'row-unverified', 'row-red');
            cell.classList.add('bg-success', 'row-verified');
            cell.style.setProperty('background-color', '#28a745', 'important');
            cell.style.setProperty('color', '#fff', 'important');
            cell.style.fontWeight = 'normal';
        });
    } else {
        // Unverified: Red Background, White Text
        row.style.setProperty('background-color', '#dc3545', 'important');
        row.style.setProperty('color', '#fff', 'important');
        row.style.fontWeight = 'normal';

        cells.forEach(cell => {
            cell.classList.remove('bg-success', 'row-verified', 'row-green');
            cell.classList.add('bg-danger', 'row-unverified');
            cell.style.setProperty('background-color', '#dc3545', 'important');
            cell.style.setProperty('color', '#fff', 'important');
            cell.style.fontWeight = 'normal';
        });
    }

    // Force white color and normal font on inputs
    const inputs = row.querySelectorAll('input');
    inputs.forEach(input => {
        if (input.type !== 'checkbox') {
            input.style.setProperty('background-color', 'transparent', 'important');
            input.style.setProperty('color', '#fff', 'important');
            input.style.fontWeight = 'normal';
            input.style.fontSize = '0.9rem';
        }
    });
}

// Function to recalculate green/red totals from the current screen state
function calculateGridTotals() {
    const rows = document.querySelectorAll('#bankDetailsBody tr');
    let greenTotal = 0;
    let redTotal = 0;

    rows.forEach(row => {
        // ONLY count rows that are visible (not hidden by search)
        if (row.style.display !== 'none') {
            const checkbox = row.querySelector('.batch-checkbox');
            const cells = row.querySelectorAll('td');
            // Column 8 is the "Total" column
            if (cells[8]) {
                const val = parseFloat(cells[8].textContent.replace(/,/g, '')) || 0;
                if (checkbox && checkbox.checked) {
                    greenTotal += val;
                } else {
                    redTotal += val;
                }
            }
        }
    });

    // Update Badges with rounded whole numbers
    const greenDisplay = document.getElementById('bd-green-total');
    if (greenDisplay) greenDisplay.textContent = Math.round(greenTotal).toLocaleString();

    const redDisplay = document.getElementById('bd-red-total');
    if (redDisplay) redDisplay.textContent = Math.round(redTotal).toLocaleString();
}

// Debounce timer for search
let _searchDebounceTimer = null;

// Global real-time search filter - debounced for performance
function filterBankGrid() {
    clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(_doFilterBankGrid, 200);
}

function _doFilterBankGrid() {
    const input = document.getElementById('globalSearchInput');
    if (!input) return;
    const filter = input.value.toLowerCase();
    const cleanFilter = filter.replace(/,/g, '');
    const rows = document.querySelectorAll('#bankDetailsBody tr');

    rows.forEach(row => {
        // Use cached text (set during render) to avoid repeated innerText reflow
        const cached = row.dataset.searchText || '';
        const cleanCached = cached.replace(/,/g, '');

        // Also check batch-date-input value (not in innerText)
        const dateInput = row.querySelector('.batch-date-input');
        const dateVal = dateInput ? dateInput.value.toLowerCase() : '';

        if (!filter || cached.includes(filter) || cleanCached.includes(cleanFilter) || dateVal.includes(filter)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });

    // Update totals based on search results
    calculateGridTotals();
}

// Function to handle "Update" button click - Visual Feedback & Persistence
async function updateBankRowsStatus() {
    const isDeduction = document.getElementById('deductionOption').checked;
    const tbody = document.getElementById('bankDetailsBody');
    const rows = tbody.querySelectorAll('tr');
    const updates = [];
    const changedRows = [];

    rows.forEach(row => {
        const checkbox = row.querySelector('.batch-checkbox');
        const id = row.dataset.id;
        const currentVerified = checkbox ? checkbox.checked : false;
        const initialVerified = row.dataset.initialVerified === 'true';
        const dateInput = row.querySelector('.batch-date-input');
        const dateChanged = currentVerified && dateInput && dateInput.value !== row.dataset.initialVerifiedDate;
        if (checkbox && id && (currentVerified !== initialVerified || dateChanged)) {
            updates.push({
                id: id,
                isVerified: currentVerified,
                verifiedDate: dateInput ? dateInput.value : null
            });
            changedRows.push({ row, currentVerified });
        }
    });

    if (updates.length === 0) return;

    try {
        const token = localStorage.getItem('token');
        const endpoint = isDeduction ? '/api/v1/daily-cash/bulk-verify-status' : '/api/v1/bank-transactions/bulk-verify-status';

        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ updates })
        });

        const result = await response.json();
        if (result.success) {
            changedRows.forEach(({ row, currentVerified }) => {
                row.dataset.initialVerified = currentVerified ? 'true' : 'false';
                const dateInput = row.querySelector('.batch-date-input');
                if (dateInput) row.dataset.initialVerifiedDate = dateInput.value;
                applyRowColor(row, currentVerified);
            });
            calculateGridTotals();
            console.log('Verification status saved successfully');
            // Refresh the old pending chq tab amount after verification
            const pcBranch = document.getElementById('pc-branch');
            if (pcBranch && pcBranch.value) {
                await calculatePendingChqAmount(pcBranch.value);
            }
        } else {
            alert('Failed to save status: ' + result.message);
        }
    } catch (err) {
        console.error('Error saving verification status:', err);
        alert('Error saving status. Please try again.');
    }
}

// --- Tab 2: Pending Cheques ---
async function loadPendingChqData() {
    const branchInput = document.getElementById('pc-branch');
    if (!branchInput) return; // Exit if old UI elements are missing

    const branch = branchInput.value;
    const bank = document.getElementById('pc-bank').value;

    console.log(`Loading pending chq data for Branch: ${branch}, Bank: ${bank}`);

    // Calculate total bank balance for the selected branch (Uses Final Client-Side Aggregation)
    await calculateBranchBalanceFinal(branch);

    // Calculate pending cheque amount (unverified payment entries)
    await calculatePendingChqAmount(branch);

    // Calculate difference
    calculateDiff();

    // Load history from localStorage
    const history = JSON.parse(localStorage.getItem('pending_chq_history') || '[]');
    // Filter by selected branch (and bank if selected). Check bankId first, fallback to bank (name/id legacy)
    const filteredHistory = history.filter(h => h.branch === branch && (!bank || h.bankId === bank || h.bank === bank));

    renderPendingChqGrid(filteredHistory);
}

// Calculate Diff = Bank Amount + Pending Chq - Statement
function calculateDiff() {
    const bankAmountInput = document.getElementById('pc-bank-amount');
    const pendingChqInput = document.getElementById('pc-pending-chq');
    const statementInput = document.getElementById('pc-statement');
    const diffInput = document.getElementById('pc-diff');

    if (!bankAmountInput || !pendingChqInput || !statementInput || !diffInput) {
        return;
    }

    const bankAmount = parseFloat(bankAmountInput.value) || 0;
    const pendingChq = parseFloat(pendingChqInput.value) || 0;
    const statement = parseFloat(statementInput.value) || 0;

    const diff = bankAmount + pendingChq - statement;

    diffInput.value = diff.toFixed(2);
}

// Calculate Pending Chq amount - total of ALL unverified (red) payment entries
// NOTE: No date filter — post-dated cheques are still "pending" regardless of date.
// This matches the Bank Detail tab logic which uses a wide date range to catch all entries.
async function calculatePendingChqAmount(branch) {
    const pendingChqInput = document.getElementById('pc-pending-chq');

    if (!branch || !pendingChqInput) {
        if (pendingChqInput) pendingChqInput.value = '0';
        return;
    }

    try {
        const token = localStorage.getItem('token');

        // FIX: Remove type=withdrawal and filter client-side to match Bank Detail tab exactly
        // CRITICAL FIX: Restored limit=0 to fetch ALL records
        const response = await fetch(`/api/v1/bank-transactions?branch=${encodeURIComponent(branch)}&excludeRefType=bank_transfer&limit=0&_t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success) {
            // Sum up only unverified (isVerified = false) entries
            const pendingTotal = data.data
                .filter(t => {
                    // FIX: Robust verification check (handles string "true", 1, etc.)
                    const isVerified = (t.isVerified === true || t.isVerified === 'true' || t.isVerified === 1);
                    return !isVerified;
                })
                .filter(t => {
                    // EXCLUDE Deposits (matching Bank Detail tab Paid mode)
                    const type = (t.type || '').toLowerCase();
                    const transType = (t.transactionType || '').toLowerCase();
                    const isDeposit = type === 'deposit' || type === 'received' || transType === 'deposit' || transType === 'received';
                    if (isDeposit) return false;

                    const desc = (t.narration || t.remarks || '').toLowerCase();
                    if (desc.includes('bank transfer') || desc.startsWith('transfer from') || desc.startsWith('transfer to')) {
                        return false;
                    }
                    const bankName = (t.bankName || t.bank?.bankName || '').toUpperCase();
                    // FIX: More robust EASYPAISA exclusion
                    if (bankName.includes('EASYPAISA') || bankName.includes('EASY PAISA')) {
                        return false;
                    }
                    return true;
                })
                .reduce((sum, t) => sum + (t.amount || 0), 0);

            pendingChqInput.value = pendingTotal.toFixed(2);
            console.log('Pending CHQ Amount (Sync):', pendingTotal, 'Branch:', branch);
        } else {
            pendingChqInput.value = '0';
        }
    } catch (e) {
        console.error('Error calculating pending chq amount:', e);
        pendingChqInput.value = '0';
    }
}

// Calculate total balance of all banks in the selected branch as of the Bank Date
// Uses 3-API aggregation: Opening Bal + DailyCash + BankTransactions + BankTransfers
// NOTE: dailyCashController _t=${Date.now()} fix ensures ALL records are returned (no 1000 cap).
async function calculateBranchBalanceFinal(branch) {
    const bankAmountInput = document.getElementById('pc-bank-amount');
    const bankDateInput = document.getElementById('pc-bank-date');

    if (!branch || !bankAmountInput) {
        if (bankAmountInput) bankAmountInput.value = '0.00';
        return;
    }

    const bankDate = bankDateInput ? bankDateInput.value : null;

    if (!bankDate) {
        bankAmountInput.value = '0.00';
        return;
    }

    bankAmountInput.value = 'Calculating...';

    try {
        const token = localStorage.getItem('token');
        const startDate = '2000-01-01';
        const endDate = new Date(bankDate);
        endDate.setHours(23, 59, 59, 999);
        const endStr = endDate.toISOString();

        // Helper for Easypaisa exclusion
        const isEP = (name) => {
            const n = (name || '').toUpperCase();
            return n.includes('EASYPAISA') || n.includes('EASY PAISA');
        };

        // 0. Get All Banks (client-side filter for branch)
        const bankRes = await fetch(`/api/v1/banks`, { headers: { 'Authorization': `Bearer ${token}` } });
        const bankData = await bankRes.json();
        const branchBankIds = new Set();
        const branchBankNames = new Set(); 
        let openingBalanceTotal = 0;

        if (bankData.success && bankData.data) {
            // Find Store ID for the selected branch name
            const storeRes = await fetch('/api/v1/stores', { headers: { 'Authorization': `Bearer ${token}` } });
            const storeData = await storeRes.json();
            let storeId = null;
            if (storeData.success && storeData.data) {
                const store = storeData.data.find(s => s.name === branch);
                if (store) storeId = store._id;
            }

            // Match branch by Name OR ID OR fallback to global 'Shop'
            bankData.data.forEach(b => {
                const bBranch = b.branch;
                const bName = (b.bankName || '');
                const branchMatch = (bBranch === branch || bBranch === storeId || bBranch === 'Shop');

                if (branchMatch && !isEP(bName)) {
                    branchBankIds.add(b._id);
                    branchBankNames.add(bName.trim().toLowerCase());
                    // FIX: Include Opening Balance from Bank Model
                    openingBalanceTotal += (parseFloat(b.openingBalance) || 0);
                }
            });
        }

        // 1. Fetch ALL Daily Cash (Bank mode)
        const dcRes = await fetch(`/api/v1/daily-cash?startDate=${startDate}&endDate=${endStr}&mode=Bank&hasBank=true&branch=${encodeURIComponent(branch)}&_t=${Date.now()}&_t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const dcData = await dcRes.json();
        let dcTotal = 0;
        if (dcData.success && dcData.data) {
            dcTotal = dcData.data
                .filter(item => {
                    // FIX: Strictly include only verified Daily Cash (matches Ledger)
                    if (!item.isVerified) return false;

                    const bId = item.bank?._id || item.bank;
                    const bName = (item.bank?.bankName || item.bankName || '').toLowerCase().trim();
                    if (isEP(bName)) return false;
                    return branchBankIds.has(bId) || branchBankNames.has(bName);
                })
                .reduce((sum, item) => {
                    let amount = parseFloat(item.totalAmount) || 0;
                    const deductionRate = parseFloat(item.deductedAmount) || 0;
                    if (item.isDeduction === true || item.isDeduction === 'true' || deductionRate > 0) {
                        const deductionVal = (amount * deductionRate) / 100;
                        amount = Math.round(amount - deductionVal);
                    }
                    return sum + amount;
                }, 0);
        }

        // 2. Fetch ALL Bank Transactions (deposits add, withdrawals subtract)
        const btRes = await fetch(`/api/v1/bank-transactions?startDate=${startDate}&endDate=${endStr}&branch=${encodeURIComponent(branch)}&excludeRefType=bank_transfer&_t=${Date.now()}&_t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const btData = await btRes.json();
        let btTotal = 0;
        if (btData.success && btData.data) {
            btTotal = btData.data
                .filter(item => {
                    const bId = item.bank?._id || item.bank;
                    const bName = (item.bankName || item.bank?.bankName || '').toLowerCase().trim();
                    if (isEP(bName)) return false;
                    return branchBankIds.has(bId) || branchBankNames.has(bName);
                })
                .reduce((sum, item) => {
                    const type = (item.type || '').toLowerCase();
                    const transType = (item.transactionType || '').toLowerCase();
                    const isDeposit = type === 'deposit' || type === 'received' || transType === 'deposit' || transType === 'received';
                    return isDeposit ? sum + (item.amount || 0) : sum - (item.amount || 0);
                }, 0);
        }

        // 3. Fetch ALL Bank Transfers
        const transRes = await fetch(`/api/v1/bank-transfers?startDate=${startDate}&endDate=${endStr}&_t=${Date.now()}&_t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const transData = await transRes.json();
        let transTotal = 0;
        if (transData.success && transData.data) {
            transData.data.forEach(t => {
                const fromId = t.fromBank?._id || t.fromBank;
                const toId = t.toBank?._id || t.toBank;
                if (branchBankIds.has(toId)) transTotal += (t.amount || 0);
                if (branchBankIds.has(fromId)) transTotal -= (t.amount || 0);
            });
        }

        const totalBalance = openingBalanceTotal + dcTotal + btTotal + transTotal;
        console.log('Branch Balance Final Summary:', { branch, opening: openingBalanceTotal, dcTotal, btTotal, transTotal, totalBalance });
        bankAmountInput.value = totalBalance.toFixed(2);

        if (window.calculateDiff) window.calculateDiff();

    } catch (e) {
        console.error('Error fetching branch balance:', e);
        bankAmountInput.value = '0.00';
    }
}

function renderPendingChqGrid(data) {
    const tbody = document.getElementById('pendingChqBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="12" class="text-center text-muted">No pending cheque data available</td>`;
        tbody.appendChild(tr);
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'table-light';

        const formatVal = (val) => parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

        tr.innerHTML = `
            <td>${row.id}</td>
            <td>${row.dated}</td>
            <td>${row.sysDate}</td>
            <td>${row.branch}</td>
            <td>${row.bank}</td>
            <td>${row.bankDate}</td>
            <td>${row.stmtDate || '-'}</td>
            <td class="text-end">${formatVal(row.ledger)}</td>
            <td class="text-end">${formatVal(row.pending)}</td>
            <td class="text-end">${formatVal(row.statement)}</td>
            <td class="text-end">${formatVal(row.diff)}</td>
            <td class="text-center">
                <button class="btn btn-primary btn-xs" onclick="editPendingChq('${row.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-xs" onclick="deletePendingChq('${row.id}')"><i class="fas fa-trash"></i></button>
            </td>
         `;
        tbody.appendChild(tr);
    });
}

// Edit Pending Chq
window.editPendingChq = async function (id) {
    const history = JSON.parse(localStorage.getItem('pending_chq_history') || '[]');
    const record = history.find(h => h.id === id);
    if (!record) return;

    const branchSelect = document.getElementById('pc-branch');

    // Load into form
    if (branchSelect) {
        if (branchSelect.value !== record.branch) {
            branchSelect.value = record.branch;
            // Trigger change to populate banks
            branchSelect.dispatchEvent(new Event('change'));
            // Wait a moment for banks to load/populate
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // For bank, set value by ID. If saved record has no ID, try matching text or value
    if (document.getElementById('pc-bank')) {
        document.getElementById('pc-bank').value = record.bankId || record.bank;
    }

    document.getElementById('pc-bank-date').value = record.bankDate;
    if (document.getElementById('pc-stmt-date')) document.getElementById('pc-stmt-date').value = record.stmtDate || '';

    document.getElementById('pc-bank-amount').value = record.ledger;
    document.getElementById('pc-pending-chq').value = record.pending;
    document.getElementById('pc-statement').value = record.statement;
    document.getElementById('pc-diff').value = record.diff || 0;

    // Delete old record effectively "moving" it to edit state
    // Don't confirm, just do it.
    deletePendingChq(id, false);
}

// Delete Pending Chq
window.deletePendingChq = function (id, confirmDelete = true) {
    if (confirmDelete && !confirm('Are you sure you want to delete this entry?')) return;

    let history = JSON.parse(localStorage.getItem('pending_chq_history') || '[]');
    history = history.filter(h => h.id !== id);
    localStorage.setItem('pending_chq_history', JSON.stringify(history));

    loadPendingChqData(); // Reload grid from updated storage
}


// --- Tab 3: Bank Summary Functions ---
async function searchBankSummary() {
    const fromDate = document.getElementById('bs-from-date').value;
    const toDate = document.getElementById('bs-to-date').value;
    const branch = document.getElementById('bs-branch').value;
    const dept = document.getElementById('bs-dept').value;
    const typeFilter = document.getElementById('bs-type').value; // Get Type Filter

    // Multi-Select: Get all checked values
    const selectedBanks = Array.from(document.querySelectorAll('#bsBankList .bank-checkbox:checked')).map(cb => cb.value);

    if (!fromDate || !toDate) {
        alert('Please select a date range');
        return;
    }

    try {
        const token = localStorage.getItem('token');

        // Fetch Opening Balance from API
        let openingBalanceUrl = `/api/v1/reports/bank-ledger/summary-opening-balance?startDate=${fromDate}`;
        if (branch) openingBalanceUrl += `&branch=${encodeURIComponent(branch)}`;
        if (selectedBanks.length > 0) openingBalanceUrl += `&bankIds=${selectedBanks.join(',')}`;

        console.log('Opening Balance URL:', openingBalanceUrl);

        const openingBalanceResp = await fetch(openingBalanceUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const openingBalanceData = await openingBalanceResp.json();
        console.log('Opening Balance Response:', openingBalanceData);
        const openingBalance = openingBalanceData.success ? (openingBalanceData.openingBalance || 0) : 0;
        console.log('Opening Balance:', openingBalance);

        // 1. Fetch Daily Cash (Batch Transfers)
        let dcUrl = `/api/v1/daily-cash?startDate=${fromDate}&endDate=${toDate}&mode=Bank&hasBank=true&limit=0&_t=${Date.now()}`;
        if (branch) dcUrl += `&branch=${branch}`;

        // 2. Fetch Bank Transactions (Deposits/Withdrawals) check
        // Use filtered date query if available, but for now stick to main date range
        // IMPORTANT: We use Date range for query, but prefer ChequeDate for display.
        // To catch all possible effective dates, we might need a wider query or specific cheque parameters.
        // Using startChqDate/endChqDate ensures we get items effectively in this range.
        let btUrl = `/api/v1/bank-transactions?startChqDate=${fromDate}&endChqDate=${toDate}&limit=0&_t=${Date.now()}&useEffectiveDate=true`;
        if (branch) btUrl += `&branch=${branch}`;

        const [dcResp, btResp] = await Promise.all([
            fetch(dcUrl, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(btUrl, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        const dcData = await dcResp.json();
        const btData = await btResp.json();

        if (dcData.success && btData.success) {
            let combinedData = [];

            // Process Daily Cash (Batch Transfers)
            // Filter: Only process if type is 'All' or 'Batch Transfer'
            if (typeFilter === 'all' || typeFilter === 'Batch Transfer') {
                dcData.data.forEach(item => {
                    // Filtering
                    if (dept && item.department && (item.department._id !== dept && item.department !== dept)) return;
                    const itemBankId = (item.bank && item.bank._id) ? item.bank._id : item.bank;
                    if (selectedBanks.length > 0 && !selectedBanks.includes(itemBankId)) return;

                    combinedData.push({
                        date: item.date,
                        batchTransferDate: item.date,
                        type: 'Batch Transfer',
                        ref: item.batchNo || '-',
                        description: `Batch Transfer - ${item.branch ? (item.branch.name || item.branch) : ''}`,
                        btbWithdraw: 0,
                        btbDeposit: 0,
                        withdraw: 0,
                        batchTransfer: item.totalAmount || 0,
                        deposit: 0,
                        batchNo: item.batchNo || '-',
                        sortDate: new Date(item.date).getTime()
                    });
                });
            }

            // Process Bank Transactions
            btData.data.forEach(item => {
                // Filtering
                if (dept && item.department && (item.department._id !== dept && item.department !== dept)) return;
                const itemBankId = (item.bank && item.bank._id) ? item.bank._id : item.bank;

                if (selectedBanks.length > 0) {
                    const selectedBankNames = allBanksReference
                        .filter(b => selectedBanks.includes(b._id))
                        .map(b => b.bankName);

                    const itemBankName = item.bankName || (item.bank && item.bank.bankName) || item.bank;

                    // Fix: Check ID OR Name (Case Insensitive if needed, but strict here)
                    // If ID matches OR Name matches, we include it.
                    const idMatch = selectedBanks.includes(itemBankId);
                    const nameMatch = selectedBankNames.includes(itemBankName);

                    if (!idMatch && !nameMatch) return;
                }

                const rawType = (item.transactionType || item.type || '').toLowerCase();
                const isDeposit = rawType === 'deposit' || rawType === 'received';
                const narration = (item.narration || item.remarks || '').toLowerCase();
                const isBTB = item.refType === 'bank_transfer' || narration.includes('bank transfer');

                // Determine Type String
                let typeStr = isBTB ? 'Bank Transfer' : (isDeposit ? 'Deposit' : 'Withdrawal');

                // Apply Type Filter
                if (typeFilter !== 'all' && typeFilter !== typeStr) return;

                combinedData.push({
                    date: item.chequeDate || item.date,
                    batchTransferDate: '-',
                    type: typeStr,
                    ref: item.invoiceNo || '-',
                    description: item.narration || item.remarks || '-',
                    btbWithdraw: (isBTB && !isDeposit) ? (item.amount || 0) : 0,
                    btbDeposit: (isBTB && isDeposit) ? (item.amount || 0) : 0,
                    withdraw: (!isBTB && !isDeposit) ? (item.amount || 0) : 0,
                    batchTransfer: 0,
                    deposit: (!isBTB && isDeposit) ? (item.amount || 0) : 0,
                    batchNo: '-',
                    sortDate: new Date(item.chequeDate || item.date).getTime()
                });
            });

            // Sort by Date Ascending
            combinedData.sort((a, b) => a.sortDate - b.sortDate);

            renderBankSummary(combinedData, openingBalance);
        } else {
            alert('Failed to fetch summary data');
        }
    } catch (e) {
        console.error(e);
        alert('Error fetching summary data');
    }
}

function renderBankSummary(data, openingBalance = 0) {
    const tbody = document.getElementById('bankSummaryBody');
    tbody.innerHTML = '';

    let totalBTBWithdraw = 0;
    let totalBTBDeposit = 0;
    let totalWithdraw = 0;
    let totalBatchTransfer = 0;
    let totalDeposit = 0;

    // Start with Opening Balance
    let runningBalance = openingBalance;

    // Add Opening Balance row at the top
    const openingRow = document.createElement('tr');
    openingRow.className = 'table-secondary fw-bold';
    openingRow.innerHTML = `
        <td colspan="5">Opening Balance</td>
        <td class="text-end">-</td>
        <td class="text-end">-</td>
        <td class="text-end">-</td>
        <td class="text-end">-</td>
        <td class="text-end">-</td>
        <td class="text-end fw-bold">${openingBalance.toLocaleString()}</td>
        <td>-</td>
    `;
    tbody.appendChild(openingRow);

    data.forEach(item => {
        totalBTBWithdraw += item.btbWithdraw;
        totalBTBDeposit += item.btbDeposit;
        totalWithdraw += item.withdraw;
        totalBatchTransfer += item.batchTransfer;
        totalDeposit += item.deposit;

        runningBalance += (item.deposit + item.batchTransfer + item.btbDeposit) - (item.withdraw + item.btbWithdraw);

        const tr = document.createElement('tr');
        // Add specific class for colors if needed
        if (item.type === 'Batch Transfer') tr.className = 'table-success';
        else if (item.type === 'Withdrawal') tr.className = 'table-danger';
        else if (item.type === 'Deposit') tr.className = 'table-info';
        else if (item.type === 'Bank Transfer') tr.className = 'table-warning'; // Light orange/yellow for BTB

        const dateStr = new Date(item.date).toLocaleDateString();
        const btDateStr = item.batchTransferDate !== '-' ? new Date(item.batchTransferDate).toLocaleDateString() : '-';

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${btDateStr}</td>
            <td>${item.type}</td>
            <td>${item.ref}</td>
            <td>${item.description}</td>
            <td class="text-end">${item.btbWithdraw.toLocaleString()}</td>
            <td class="text-end">${item.btbDeposit.toLocaleString()}</td>
            <td class="text-end">${item.withdraw > 0 ? '-' + item.withdraw.toLocaleString() : '0'}</td>
            <td class="text-end">${item.batchTransfer.toLocaleString()}</td>
            <td class="text-end">${item.deposit.toLocaleString()}</td>
            <td class="text-end fw-bold">${runningBalance.toLocaleString()}</td>
            <td>${item.batchNo}</td>
        `;
        tbody.appendChild(tr);
    });

    // Update Footers
    document.getElementById('bs-btb-withdraw-total').textContent = totalBTBWithdraw.toLocaleString();
    document.getElementById('bs-btb-deposit-total').textContent = totalBTBDeposit.toLocaleString();
    document.getElementById('bs-withdraw-total').textContent = totalWithdraw.toLocaleString();
    document.getElementById('bs-batch-transfer-total').textContent = totalBatchTransfer.toLocaleString();
    document.getElementById('bs-deposit-total').textContent = totalDeposit.toLocaleString();
    document.getElementById('bs-final-balance').textContent = runningBalance.toLocaleString();

    // Update KPIs with Opening Balance
    document.getElementById('bs-opening-balance').textContent = openingBalance.toLocaleString();
    document.getElementById('bs-deposits').textContent = totalDeposit.toLocaleString();
    document.getElementById('bs-batch-received').textContent = totalBatchTransfer.toLocaleString();
    document.getElementById('bs-withdrawal').textContent = totalWithdraw.toLocaleString();
    document.getElementById('bs-btb-withdraw-kpi').textContent = totalBTBWithdraw.toLocaleString();
    document.getElementById('bs-btb-deposit-kpi').textContent = totalBTBDeposit.toLocaleString();
    document.getElementById('bs-closing-balance').textContent = runningBalance.toLocaleString();
}

function filterSummaryGrid() {
    const input = document.getElementById('bs-global-search');
    const filter = input.value.toLowerCase();
    const cleanFilter = filter.replace(/,/g, '');
    const rows = document.querySelectorAll('#bankSummaryBody tr');

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        const cleanText = text.replace(/,/g, '');

        if (text.includes(filter) || cleanText.includes(cleanFilter)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function printBankSummary() {
    window.print();
}

// --- Tab 5: Bank To Bank Functions ---
async function updateBTBBalances() {
    const fromBankId = document.getElementById('btb-from-bank').value;
    const toBankId = document.getElementById('btb-to-bank').value;
    const branch = document.getElementById('btb-branch').value;
    const amount = parseFloat(document.getElementById('btb-amount').value) || 0;

    const fromPreEl = document.getElementById('btb-from-pre');
    const fromNewEl = document.getElementById('btb-from-new');
    const toPreEl = document.getElementById('btb-to-pre');
    const toNewEl = document.getElementById('btb-to-new');

    try {
        const token = localStorage.getItem('token');
        let url = '/api/v1/bank-transactions/summary';
        if (branch) url += `?branch=${encodeURIComponent(branch)}`;

        const resp = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await resp.json();

        if (data.success) {
            // Need to get bank names from IDs
            const fromBankName = document.getElementById('btb-from-bank').options[document.getElementById('btb-from-bank').selectedIndex]?.text;
            const toBankName = document.getElementById('btb-to-bank').options[document.getElementById('btb-to-bank').selectedIndex]?.text;

            // Calculate balance from summary (Deposit - Withdrawal)
            // summary format: "BankName_deposit": { totalAmount: ... }
            const getBalance = (bankName) => {
                if (!bankName) return 0;
                const depositKey = `${bankName}_deposit`;
                const withdrawKey = `${bankName}_withdrawal`;
                const deposits = data.data.summary[depositKey]?.totalAmount || 0;
                const withdrawals = data.data.summary[withdrawKey]?.totalAmount || 0;
                return deposits - withdrawals;
            };

            const fromPre = getBalance(fromBankName);
            const toPre = getBalance(toBankName);

            fromPreEl.textContent = fromPre.toLocaleString();
            fromNewEl.textContent = (fromPre - amount).toLocaleString();

            toPreEl.textContent = toPre.toLocaleString();
            toNewEl.textContent = (toPre + amount).toLocaleString();
        }
    } catch (e) {
        console.error('Error updating BTB balances:', e);
    }
}

async function saveBankTransfer() {
    const payload = {
        date: document.getElementById('btb-date').value,
        branch: document.getElementById('btb-branch').value,
        fromBank: document.getElementById('btb-from-bank').value,
        toBank: document.getElementById('btb-to-bank').value,
        amount: parseFloat(document.getElementById('btb-amount').value),
        remarks: document.getElementById('btb-remarks').value
    };

    if (!payload.date || !payload.fromBank || !payload.toBank || !payload.amount) {
        alert('Please fill all required fields');
        return;
    }

    if (payload.fromBank === payload.toBank) {
        alert('From and To banks must be different');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const resp = await fetch('/api/v1/bank-transfers', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (data.success) {
            alert('Transfer saved successfully');
            clearBTBForm();
            loadBTBTransfers();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (e) {
        console.error(e);
        alert('Failed to save transfer');
    }
}

async function loadBTBTransfers() {
    const from = document.getElementById('btb-filter-from').value;
    const to = document.getElementById('btb-filter-to').value;

    try {
        const token = localStorage.getItem('token');
        let url = '/api/v1/bank-transfers';
        if (from && to) url += `?startDate=${from}&endDate=${to}`;

        const resp = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await resp.json();

        if (data.success) {
            renderBTBGrid(data.data);
        }
    } catch (e) {
        console.error(e);
    }
}

function renderBTBGrid(data) {
    const tbody = document.getElementById('btbGridBody');
    tbody.innerHTML = '';
    let total = 0;

    data.forEach(item => {
        total += item.amount;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(item.date).toLocaleDateString()}</td>
            <td>${item.fromBank?.bankName || 'N/A'}</td>
            <td>${item.toBank?.bankName || 'N/A'}</td>
            <td class="text-end">${item.amount.toLocaleString()}</td>
            <td>${item.remarks || ''}</td>
            <td class="text-center">
                <button class="btn btn-danger btn-sm" onclick="deleteBankTransfer('${item._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('btb-total-amount').textContent = total.toLocaleString();
}

async function deleteBankTransfer(id) {
    if (!confirm('Are you sure you want to delete this transfer? balances will be reversed.')) return;

    try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`/api/v1/bank-transfers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await resp.json();
        if (data.success) {
            alert('Deleted successfully');
            loadBTBTransfers();
        } else {
            alert(data.message);
        }
    } catch (e) {
        console.error(e);
    }
}

function clearBTBForm() {
    document.getElementById('btb-from-bank').value = '';
    document.getElementById('btb-to-bank').value = '';
    document.getElementById('btb-amount').value = '';
    document.getElementById('btb-remarks').value = '';
    document.getElementById('btb-from-pre').textContent = '0';
    document.getElementById('btb-from-new').textContent = '0';
    document.getElementById('btb-to-pre').textContent = '0';
    document.getElementById('btb-to-new').textContent = '0';
}

function filterBTBGrid() {
    const input = document.getElementById('btb-search');
    const filter = input.value.toLowerCase();
    const cleanFilter = filter.replace(/,/g, '');
    const rows = document.querySelectorAll('#btbGridBody tr');

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        const cleanText = text.replace(/,/g, '');
        row.style.display = (text.includes(filter) || cleanText.includes(cleanFilter)) ? '' : 'none';
    });
}

// --- Helper Utils ---
function getSearchParams(scope) {
    return {
        fromDate: scope.querySelector('.from-date')?.value,
        toDate: scope.querySelector('.to-date')?.value,
        branch: scope.querySelector('.branch-select')?.value,
        dept: scope.querySelector('.dept-select')?.value,
        bank: scope.querySelector('.bank-select')?.value
    };
}

function formatDateForInput(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    return '';
}

// --- Exported functions for global access ---
window.searchBankDetails = searchBankDetails;
window.loadPendingChqData = loadPendingChqData;
window.editPendingChq = editPendingChq;
window.deletePendingChq = deletePendingChq;
window.calculateDiff = calculateDiff;
window.updateBankRowsStatus = updateBankRowsStatus;
window.calculateGridTotals = calculateGridTotals;
window.deleteSelectedBankEntries = deleteSelectedBankEntries;
window.filterBankGrid = filterBankGrid;
window.applyRowColor = applyRowColor;
window.searchBankSummary = searchBankSummary;
window.filterSummaryGrid = filterSummaryGrid;
window.printBankSummary = printBankSummary;
window.updateBTBBalances = updateBTBBalances;
window.saveBankTransfer = saveBankTransfer;
window.loadBTBTransfers = loadBTBTransfers;
window.deleteBankTransfer = deleteBankTransfer;
window.clearBTBForm = clearBTBForm;
window.filterBTBGrid = filterBTBGrid;

// Print Bank Ledger Function
// Print Bank Ledger Function
function printBankLedger() {
    // Populate Print Header
    const branch = document.getElementById('bd-branch').value || 'All Branches';
    const from = document.getElementById('bd-from-date').value;
    const to = document.getElementById('bd-to-date').value;

    const pBranch = document.getElementById('print-branch');
    const pFrom = document.getElementById('print-from');
    const pTo = document.getElementById('print-to');

    if (pBranch) pBranch.textContent = branch;
    if (pFrom) pFrom.textContent = from;
    if (pTo) pTo.textContent = to;

    // Populate Print Totals (Grand Totals Breakdown)
    let totalAmount = 0;
    let totalDeduction = 0;
    let totalNet = 0;

    const rows = document.querySelectorAll('#bankDetailsBody tr');
    rows.forEach(row => {
        if (row.style.display !== 'none') {
            const cells = row.querySelectorAll('td');
            // Indices: 5=Amount, 7=Deduction, 8=Total(Net)
            // Adjust indices based on hidden columns in print CSS?
            // Better to access by content logic or specific classes if changed, but standard index works here.
            // Screen indices: 0=Date, 1=Checkbox, 2=BatchDate, 3=Bank, 4=Dept, 5=Amount, 6=Rate, 7=Ded, 8=Total

            if (cells[5]) totalAmount += parseFloat(cells[5].textContent.replace(/,/g, '')) || 0;
            if (cells[7]) totalDeduction += parseFloat(cells[7].textContent.replace(/,/g, '')) || 0;
            if (cells[8]) totalNet += parseFloat(cells[8].textContent.replace(/,/g, '')) || 0;
        }
    });

    const pAmount = document.getElementById('print-total-amount');
    const pDeduction = document.getElementById('print-total-deduction');
    const pNet = document.getElementById('print-total-net');

    if (pAmount) pAmount.textContent = Math.round(totalAmount).toLocaleString();
    if (pDeduction) pDeduction.textContent = Math.round(totalDeduction).toLocaleString();
    if (pNet) pNet.textContent = Math.round(totalNet).toLocaleString();

    window.print();
}

window.printBankLedger = printBankLedger;

// Filter Bank Summary Grid based on single global search and column dropdown
function filterSummaryGrid() {
    const input = document.getElementById('bs-global-search');
    const colSelect = document.getElementById('bs-search-col');
    const filter = input ? input.value.toLowerCase() : '';
    const colIndex = colSelect ? colSelect.value : 'all';

    const tbody = document.getElementById('bankSummaryBody');
    const rows = tbody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        // Skip filtering the "Opening Balance" row
        if (rows[i].classList.contains('table-secondary') || rows[i].cells[0].innerText.includes('Opening Balance')) {
            continue;
        }

        let textContent = '';
        if (colIndex === 'all') {
            textContent = rows[i].textContent.toLowerCase();
        } else {
            // Target specific cell
            const cell = rows[i].getElementsByTagName('td')[parseInt(colIndex)];
            if (cell) {
                textContent = cell.textContent.toLowerCase();
            }
        }

        if (textContent.includes(filter)) {
            rows[i].style.display = "";
        } else {
            rows[i].style.display = "none";
        }
    }
}
window.filterSummaryGrid = filterSummaryGrid;


// --- Tab 3: Bank Summary (Professional) Logic ---

// Variable to store filtered banks for Pro View
let allBanksPro = [];

async function loadProBanks() {
    try {
        const branchSelect = document.getElementById('pro-branch');
        const branchingVal = branchSelect ? branchSelect.value : '';
        const token = localStorage.getItem('token');

        let url = '/api/v1/banks';
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();

        if (data.success) {
            allBanksPro = data.data;
            renderProBankList(branchingVal);

            const branchBanks = allBanksPro.filter(b => {
                if (!branchingVal) return true;
                if (b.branch && typeof b.branch === 'object') return b.branch.name === branchingVal;
                return b.branch === branchingVal;
            });

            const uniqueDeptIds = new Set();
            branchBanks.forEach(b => {
                if (b.department) {
                    // Safe string conversion for ObjectId or String
                    const idStr = (typeof b.department === 'object' && b.department._id) ? String(b.department._id) : String(b.department);
                    uniqueDeptIds.add(idStr);
                }
            });

            // Now populate departments filtering by these IDs
            populateProDepartments(Array.from(uniqueDeptIds));
        }
    } catch (e) { console.error('Error loading pro banks', e); }
}

function renderProBankList(branchName) {
    const select = document.getElementById('pro-bank-select');
    if (!select) return;

    select.innerHTML = '<option value="">All Banks</option>';

    const norm = (s) => String(s || '').replace(/[()]/g, '').trim().toLowerCase();
    const cleanBranch = norm(branchName);

    // Filter
    const filtered = allBanksPro.filter(b => {
        if (!cleanBranch) return true;
        const bBranch = norm((b.branch && typeof b.branch === 'object') ? b.branch.name : b.branch);
        return bBranch === cleanBranch;
    });

    const epIds = [];
    const jcIds = [];
    const bbIds = [];
    const specialBanks = [];

    filtered.forEach(b => {
        const name = (b.bankName || '').toUpperCase();
        if (name.includes('MED-HS') || name.includes('HS')) {
            const bBranch = norm((b.branch && typeof b.branch === 'object') ? b.branch.name : b.branch);
            if (cleanBranch && bBranch === cleanBranch) {
                specialBanks.push(b);
            }
        } else if (name.includes('EASYPAISA')) {
            epIds.push(b._id);
        } else if (name.includes('JAZZ CASH') || name.includes('JAZZCASH')) {
            jcIds.push(b._id);
        } else {
            bbIds.push(b._id);
        }
    });

    if (epIds.length > 0) {
        const opt = document.createElement('option');
        opt.value = 'GROUP_EP';
        opt.textContent = 'Easypaisa';
        opt.dataset.ids = epIds.join(',');
        select.appendChild(opt);
    }

    if (jcIds.length > 0) {
        const opt = document.createElement('option');
        opt.value = 'GROUP_JC';
        opt.textContent = 'Jazz Cash';
        opt.dataset.ids = jcIds.join(',');
        select.appendChild(opt);
    }

    if (bbIds.length > 0) {
        const opt = document.createElement('option');
        opt.value = 'GROUP_BB';
        opt.textContent = 'Branch Bank';
        opt.dataset.ids = bbIds.join(',');
        select.appendChild(opt);
    }

    specialBanks.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b._id;
        opt.textContent = `${b.bankName}`;
        opt.dataset.ids = b._id;
        select.appendChild(opt);
    });
}

// Populate Bank Detail Bank Dropdown with Grouped Banks (Branch-Aware)
async function populateBDBank(selectedBranch) {
    try {
        const select = document.getElementById('bd-bank-select');
        if (!select) return;

        const branchSelect = document.getElementById('bd-branch');
        const branchVal = selectedBranch !== undefined ? selectedBranch : (branchSelect ? branchSelect.value : '');

        let banksList = allBanksReference;
        if (!banksList || banksList.length === 0) {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/v1/banks', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (data.success) {
                banksList = data.data;
                allBanksReference = data.data;
            } else {
                banksList = [];
            }
        }

        const norm = (s) => String(s || '').replace(/[()]/g, '').trim().toLowerCase();
        const cleanBranch = norm(branchVal);

        // Filter banks by branch
        const filtered = banksList.filter(b => {
            if (!cleanBranch) return true;
            const bBranch = norm((b.branch && typeof b.branch === 'object') ? b.branch.name : b.branch);
            return bBranch === cleanBranch;
        });

        const currentVal = select.value;
        select.innerHTML = '<option value="">All Banks</option>';

        const epIds = [];
        const jcIds = [];
        const bbIds = [];
        const specialBanks = [];

        filtered.forEach(b => {
            const name = (b.bankName || '').toUpperCase();
            if (name.includes('MED-HS') || name.includes('HS')) {
                // Special bank linked to its branch (e.g. G15 Markaz)
                // Only show if branch is selected and matches this bank's branch!
                const bBranch = norm((b.branch && typeof b.branch === 'object') ? b.branch.name : b.branch);
                if (cleanBranch && bBranch === cleanBranch) {
                    specialBanks.push(b);
                }
            } else if (name.includes('EASYPAISA')) {
                epIds.push(b._id);
            } else if (name.includes('JAZZ CASH') || name.includes('JAZZCASH')) {
                jcIds.push(b._id);
            } else {
                bbIds.push(b._id);
            }
        });

        if (epIds.length > 0) {
            const opt = document.createElement('option');
            opt.value = 'GROUP_EP';
            opt.textContent = 'Easypaisa';
            opt.dataset.ids = epIds.join(',');
            select.appendChild(opt);
        }

        if (jcIds.length > 0) {
            const opt = document.createElement('option');
            opt.value = 'GROUP_JC';
            opt.textContent = 'Jazz Cash';
            opt.dataset.ids = jcIds.join(',');
            select.appendChild(opt);
        }

        if (bbIds.length > 0) {
            const opt = document.createElement('option');
            opt.value = 'GROUP_BB';
            opt.textContent = 'Branch Bank';
            opt.dataset.ids = bbIds.join(',');
            select.appendChild(opt);
        }

        specialBanks.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b._id;
            opt.textContent = `${b.bankName}`;
            opt.dataset.ids = b._id;
            select.appendChild(opt);
        });

        // Restore previous selection if still exists in options
        if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
            select.value = currentVal;
        } else {
            select.value = '';
        }
    } catch (e) {
        console.error('Error loading BD banks', e);
    }
}


// Make functions globally accessible
window.loadProBanks = loadProBanks;
window.toggleAllBanksPro = function (source) {
    const checkboxes = document.querySelectorAll('.bank-checkbox-pro');
    checkboxes.forEach(cb => cb.checked = source.checked);
    updateProBankButtonLabel();
}
window.updateProBankButtonLabel = updateProBankButtonLabel; // Assign function

function updateProBankButtonLabel() {
    const checked = document.querySelectorAll('.bank-checkbox-pro:checked');
    const total = document.querySelectorAll('.bank-checkbox-pro');
    const btn = document.getElementById('bankDropdownBtn');

    if (!btn) return;

    if (checked.length === 0) {
        btn.innerText = 'Select Banks (All)';
    } else if (checked.length === total.length && total.length > 0) {
        btn.innerText = 'All Banks';
    } else {
        btn.innerText = `${checked.length} Selected`;
    }
}

// Pro Report Fetcher
window.fetchProReport = async function () {
    const fromDate = document.getElementById('pro-from-date').value;
    const toDate = document.getElementById('pro-to-date').value;
    const branch = document.getElementById('pro-branch').value;
    const dept = document.getElementById('pro-dept').value;
    const type = document.getElementById('pro-type').value;

    // Logic to collect IDs from Select Dropdown
    let selectedBankIds = [];
    const bankSelect = document.getElementById('pro-bank-select');
    if (bankSelect && bankSelect.value) {
        // If a group is selected, get IDs from dataset
        const selectedOpt = bankSelect.options[bankSelect.selectedIndex];
        if (selectedOpt && selectedOpt.dataset.ids) {
            selectedBankIds = selectedOpt.dataset.ids.split(',');
        }
    }

    if (!fromDate || !toDate) {
        alert('Please select a date range');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        let url = `/api/v1/reports/bank-ledger/pro-summary?startDate=${fromDate}&endDate=${toDate}`;
        if (branch) url += `&branch=${encodeURIComponent(branch)}`;
        if (selectedBankIds.length > 0) url += `&bankIds=${selectedBankIds.join(',')}`;
        if (dept) url += `&department=${dept}`;
        if (type) url += `&type=${encodeURIComponent(type)}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            renderProKPIs(data.data);
            renderProTable(data.data.transactions, data.data.openingBalance);
            // Grouped summary removed
        } else {
            alert(data.message || 'Error fetching report');
        }
    } catch (e) {
        console.error(e);
        alert('Error fetching report');
    }
}

function renderProKPIs(data) {
    const totalDeposit = data.transactions.reduce((sum, t) => sum + (t.deposit || 0), 0);
    const totalWithdrawal = data.transactions.reduce((sum, t) => sum + (t.withdrawal || 0), 0);

    const kpiOpen = document.getElementById('kpi-opening');
    if (kpiOpen) kpiOpen.innerText = formatCurrencyPro(data.openingBalance);

    const kpiDep = document.getElementById('kpi-deposit');
    if (kpiDep) kpiDep.innerText = formatCurrencyPro(totalDeposit);

    const kpiWith = document.getElementById('kpi-withdrawal');
    if (kpiWith) kpiWith.innerText = formatCurrencyPro(totalWithdrawal);

    const kpiClose = document.getElementById('kpi-closing');
    if (kpiClose) kpiClose.innerText = formatCurrencyPro(data.closingBalance);
}

function renderProTable(transactions, openingBalance) {
    const tbody = document.getElementById('proTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Add Opening Balance Row
    const openRow = document.createElement('tr');
    openRow.classList.add('table-light', 'fw-bold');
    openRow.innerHTML = `
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>Opening Balance</td>
        <td>-</td>
        <td>Opening Balance Brought Forward</td>
        <td class="text-end">-</td>
        <td class="text-end">-</td>
        <td class="text-end">${formatCurrencyPro(openingBalance)}</td>
        <td>-</td>
    `;
    tbody.appendChild(openRow);

    transactions.forEach(t => {
        const tr = document.createElement('tr');

        // Color Coding
        if (t.type === 'Deposit') tr.classList.add('row-deposit');
        else if (t.type === 'Withdrawal') tr.classList.add('row-withdrawal');
        else if (t.type === 'Bank Transfer') tr.classList.add('row-transfer');
        else if (t.type === 'Batch Transfer') tr.classList.add('row-deposit');

        tr.innerHTML = `
            <td>${formatDatePro(t.date)}</td>
            <td>${formatDatePro(t.effectiveDate)}</td>
            <td>${t.bankName || '-'}</td>
            <td>${t.type}</td>
            <td>${t.ref}</td>
            <td>${t.description}</td>
            <td class="text-end text-success fw-bold">${t.deposit ? formatCurrencyPro(t.deposit) : '-'}</td>
            <td class="text-end text-danger fw-bold">${t.withdrawal ? formatCurrencyPro(t.withdrawal) : '-'}</td>
            <td class="text-end fw-bold">${formatCurrencyPro(t.balance)}</td>
            <td><span class="badge ${t.status === 'Verified' ? 'bg-success' : 'bg-warning text-dark'}">${t.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

window.filterProTable = function () {
    const input = document.getElementById('pro-search');
    const filter = input.value.toLowerCase();
    const rows = document.getElementById('proTableBody').getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        // Always show Opening Balance Row
        if (rows[i].cells[3] && rows[i].cells[3].innerText === 'Opening Balance') {
            rows[i].style.display = "";
            continue;
        }

        const text = rows[i].textContent.toLowerCase();
        if (text.includes(filter)) {
            rows[i].style.display = "";
        } else {
            rows[i].style.display = "none";
        }
    }
}

// Helpers
function formatCurrencyPro(amount) {
    if (amount === undefined || amount === null) return '0';
    return new Intl.NumberFormat('en-US').format(amount);
}
function formatDatePro(dateStr) {
    if (!dateStr) return '-';
    // Stick to basic string manipulation for ISO dates or use utility
    return new Date(dateStr).toLocaleDateString('en-GB');
}

// Initializer for Pro Tab (called when Tab is shown or page loaded if this is active tab)
function initProSummary() {
    // Populate Pro View specific dropdowns
    // Branches - reuse existing logic but fill #pro-branch
    populateProBranches();

    // Departments
    populateProDepartments();

    // Banks
    loadProBanks();

    // Dates
    const todayT = new Date();

    const f = document.getElementById('pro-from-date');
    const t = document.getElementById('pro-to-date');
    if (f && !f.value) f.valueAsDate = todayT;
    if (t && !t.value) t.valueAsDate = todayT;
}

async function populateProBranches() {
    try {
        const token = localStorage.getItem('token');
        // Fetch Stores (Branches)
        const res = await fetch('/api/v1/stores', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('pro-branch');
            if (!select) return;

            // Only show "All Branches" if multiple branches exist
            if (data.data.length > 1) {
                select.innerHTML = '<option value="">All Branches</option>';
            } else {
                select.innerHTML = '';
            }

            data.data.forEach(store => {
                const opt = document.createElement('option');
                opt.value = store.name;
                opt.textContent = store.name; // Use Name
                select.appendChild(opt);
            });

            // Auto-select if only one branch available
            if (data.data.length === 1) {
                select.value = data.data[0].name;
                select.dispatchEvent(new Event('change'));
            }
        }
    } catch (e) { console.error(e); }
}

async function populateProDepartments(allowedDeptIds = null) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/departments', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('pro-dept');
            if (!select) return;
            select.innerHTML = '<option value="">All Departments</option>';
            data.data.forEach(d => {
                let shouldShow = true;

                if (allowedDeptIds !== null && Array.isArray(allowedDeptIds)) {
                    if (!allowedDeptIds.includes(d._id)) {
                        shouldShow = false;
                    }
                }

                if (shouldShow) {
                    const opt = document.createElement('option');
                    opt.value = d._id;
                    opt.textContent = d.name;
                    select.appendChild(opt);
                }
            });
        }
    } catch (e) { console.error(e); }
}

// Wire up Tab Shown event to Init (Add to DOMContentLoaded or Global)
document.addEventListener('DOMContentLoaded', () => {
    const tabEl = document.querySelector('button[data-bs-target="#bank-summary"]');
    if (tabEl) {
        tabEl.addEventListener('shown.bs.tab', function (event) {
            initProSummary();
        });
    }
    // Also if it's the default active tab
    if (document.querySelector('#bank-summary').classList.contains('active')) {
        initProSummary();
    }
});

// ==========================================
// AI Match Finder (Subset Sum)
// ==========================================

let aiMatchModalInstance = null;
let currentBestAIMatch = [];

function openAIMatchModal() {
    if (!aiMatchModalInstance) {
        const modalEl = document.getElementById('aiMatchModal');
        if (modalEl) {
            aiMatchModalInstance = new bootstrap.Modal(modalEl);
        }
    }
    if (aiMatchModalInstance) {
        // Pre-fill dates from main screen if empty
        const mainFrom = document.getElementById('bd-from-date');
        const mainTo = document.getElementById('bd-to-date');
        const aiFrom = document.getElementById('aiDateFrom');
        const aiTo = document.getElementById('aiDateTo');
        if (mainFrom && aiFrom && !aiFrom.value) aiFrom.value = mainFrom.value;
        if (mainTo && aiTo && !aiTo.value) aiTo.value = mainTo.value;

        document.getElementById('aiMatchResults').style.display = 'none';
        aiMatchModalInstance.show();
    }
}

function runAIMatch() {
    const targetInput = document.getElementById('aiTargetAmount').value;
    const toleranceInput = document.getElementById('aiTolerance').value;
    const refInput = document.getElementById('aiReference').value.toLowerCase().trim();
    const dateFrom = document.getElementById('aiDateFrom').value;
    const dateTo = document.getElementById('aiDateTo').value;
    const statusFilter = document.getElementById('aiStatusFilter').value;

    const target = parseFloat(targetInput);
    if (isNaN(target) || target <= 0) {
        alert("Please enter a valid target amount.");
        return;
    }

    const tolerance = parseFloat(toleranceInput) || 0;

    // 1. Extract data from grid
    const availableRows = [];
    const rows = document.querySelectorAll('#bankDetailsBody tr');
    
    rows.forEach(row => {
        if (row.style.display === 'none') return;
        
        const val = parseFloat(row.dataset.total) || 0;
        const remarksText = (row.dataset.remarks || '').toLowerCase();
        
        if (val > 0) {
            // Filter by Reference if provided
            if (refInput && !remarksText.includes(refInput)) {
                return; // skip
            }

            // Filter by Status
            const cb = row.querySelector('.batch-checkbox');
            const isVerified = cb ? cb.checked : false;
            if (statusFilter === 'unverified' && isVerified) return;
            if (statusFilter === 'verified' && !isVerified) return;

            // Filter by Date
            if (dateFrom || dateTo) {
                const dateStr = row.dataset.dateStr || '';
                let rowDateObj = null;
                if (dateStr) {
                    rowDateObj = new Date(dateStr);
                }
                
                if (rowDateObj && !isNaN(rowDateObj.getTime())) {
                    rowDateObj.setHours(0,0,0,0);
                    if (dateFrom) {
                        const fromObj = new Date(dateFrom);
                        fromObj.setHours(0,0,0,0);
                        if (rowDateObj < fromObj) return;
                    }
                    if (dateTo) {
                        const toObj = new Date(dateTo);
                        toObj.setHours(0,0,0,0);
                        if (rowDateObj > toObj) return;
                    }
                }
            }
            
            availableRows.push({
                element: row,
                value: val,
                remarks: row.dataset.remarks || '',
                date: row.dataset.dateStr || ''
            });
        }
    });

    if (availableRows.length === 0) {
        showAIMatchResult("No rows found matching your criteria.", "danger", []);
        return;
    }

    // 2. Algorithm implementation (Advanced 2-Pass DFS for Subset Sum)
    document.getElementById('aiMatchStatus').className = "alert alert-warning py-2 small mb-2";
    document.getElementById('aiMatchStatus').innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Searching for combinations (Advanced Engine)...';
    document.getElementById('aiMatchResults').style.display = 'block';
    
    // Sort descending for faster pruning
    availableRows.sort((a, b) => b.value - a.value);
    
    const suffixSums = new Array(availableRows.length);
    let tempSum = 0;
    for (let i = availableRows.length - 1; i >= 0; i--) {
        tempSum += availableRows[i].value;
        suffixSums[i] = tempSum;
    }

    let bestDiff = Infinity;
    let bestSubset = [];
    let startTime = performance.now();
    let maxTimeMs = 1500;

    function dfs(index, currentSum, currentSubset, currentTolerance) {
        if (performance.now() - startTime > maxTimeMs) return;

        const diff = Math.abs(currentSum - target);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestSubset = [...currentSubset];
        }
        
        // Use 0.01 to handle floating point inaccuracies
        if (bestDiff < 0.01) return;
        
        if (currentSum > target + currentTolerance) return;
        if (index >= availableRows.length) return;
        if (currentSum + suffixSums[index] < target - currentTolerance) return;

        // Include element
        currentSubset.push(availableRows[index]);
        dfs(index + 1, currentSum + availableRows[index].value, currentSubset, currentTolerance);
        currentSubset.pop();
        
        if (bestDiff < 0.01) return;
        
        // Exclude element
        dfs(index + 1, currentSum, currentSubset, currentTolerance);
    }

    // Use setTimeout so the UI can update the "Searching..." status before locking the thread
    setTimeout(() => {
        // PASS 1: Search for EXACT MATCH ONLY (tolerance = 0). This prevents wrong tolerant matches from stopping the search.
        maxTimeMs = 1500;
        startTime = performance.now();
        dfs(0, 0, [], 0);
        
        // PASS 2: If no exact match found, use user's tolerance
        if (bestDiff >= 0.01 && tolerance > 0) {
            maxTimeMs = 2000; // Allow another 2 seconds for tolerant search
            startTime = performance.now();
            dfs(0, 0, [], tolerance);
        }
        
        if (bestDiff <= tolerance + 0.01) {
            let type = bestDiff < 0.01 ? "success" : "warning";
            let msg = bestDiff < 0.01 
                ? `Exact match found! (Sum: ${target.toLocaleString()})`
                : `Closest match found! Sum is ${(target + (bestSubset.reduce((a, b) => a + b.value, 0) - target)).toLocaleString()} (Difference: ${bestDiff.toLocaleString()})`;
            showAIMatchResult(msg, type, bestSubset);
        } else {
            showAIMatchResult(`No combination found within tolerance. Closest difference: ${bestDiff.toLocaleString()}`, "danger", []);
        }
    }, 100);
}

function showAIMatchResult(message, type, subset) {
    const statusEl = document.getElementById('aiMatchStatus');
    statusEl.className = `alert alert-${type} py-2 small mb-2`;
    statusEl.innerText = message;
    
    const listEl = document.getElementById('aiMatchList');
    listEl.innerHTML = '';
    
    currentBestAIMatch = subset;
    
    if (subset.length > 0) {
        subset.forEach(item => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center py-1';
            li.innerHTML = `
                <span class="small">${item.date} <br> <span class="text-muted" style="font-size:0.7rem;">${item.remarks}</span></span>
                <span class="fw-bold">${item.value.toLocaleString()}</span>
            `;
            listEl.appendChild(li);
        });
        document.getElementById('btnHighlightMatches').style.display = 'block';
    } else {
        document.getElementById('btnHighlightMatches').style.display = 'none';
    }
}

function highlightAIMatches() {
    if (currentBestAIMatch.length === 0) return;
    
    // Clear previous highlights
    document.querySelectorAll('#bankDetailsBody tr').forEach(tr => {
        tr.style.border = '';
        tr.style.boxShadow = '';
        tr.querySelectorAll('td').forEach(td => {
            td.style.removeProperty('background-color');
            td.style.removeProperty('color');
            td.classList.remove('fw-bold');
        });
    });
    
    // Highlight new ones
    let isFirst = true;
    currentBestAIMatch.forEach(item => {
        if (item.element) {
            // Very prominent highlight: Yellow background, black text, bold
            item.element.style.setProperty('border', '3px solid #000', 'important');
            item.element.querySelectorAll('td').forEach(td => {
                td.style.setProperty('background-color', '#ffeb3b', 'important');
                td.style.setProperty('color', '#000', 'important');
                td.classList.add('fw-bold');
                td.querySelectorAll('input').forEach(inp => {
                    inp.style.setProperty('color', '#000', 'important');
                    inp.style.setProperty('font-weight', 'bold', 'important');
                });
            });
            
            // Scroll the very first matched row into view
            if (isFirst) {
                item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                isFirst = false;
            }
            
            // Ensure the checkbox is checked if they want to update it
            const cb = item.element.querySelector('.batch-checkbox');
            if (cb) cb.checked = true;
        }
    });
    
    // Close modal
    if (aiMatchModalInstance) {
        aiMatchModalInstance.hide();
    }
}

// ==========================================
// Duplicate Cheque Finder
// ==========================================

let duplicateMatchModalInstance = null;
let currentDuplicateGroups = [];

function openDuplicateModal() {
    if (!duplicateMatchModalInstance) {
        const modalEl = document.getElementById('duplicateMatchModal');
        if (modalEl) {
            duplicateMatchModalInstance = new bootstrap.Modal(modalEl);
        }
    }
    if (duplicateMatchModalInstance) {
        document.getElementById('duplicateMatchResults').style.display = 'none';
        const statusEl = document.getElementById('duplicateMatchStatus');
        statusEl.className = 'd-none';
        duplicateMatchModalInstance.show();
    }
}

function findDuplicates() {
    const statusFilter = document.getElementById('dupStatusFilter').value;
    const matchCriteria = document.getElementById('dupMatchCriteria') ? document.getElementById('dupMatchCriteria').value : 'strict';
    
    // 1. Extract data from grid
    const rows = document.querySelectorAll('#bankDetailsBody tr');
    const groupMap = new Map();
    
    rows.forEach((row, index) => {
        if (row.style.display === 'none') return;
        
        const totalTd = row.querySelector('td:nth-child(9)');
        const remarksTd = row.querySelector('td:nth-child(10)');
        const dateTd = row.querySelector('td:nth-child(1)');
        
        if (totalTd && remarksTd) {
            const cb = row.querySelector('.batch-checkbox');
            const isVerified = cb ? cb.checked : false;
            if (statusFilter === 'unverified' && isVerified) return;
            if (statusFilter === 'verified' && !isVerified) return;

            const totalText = totalTd.textContent.replace(/,/g, '');
            const remarksText = remarksTd.textContent.trim();
            const val = parseFloat(totalText);
            
            if (isNaN(val) || val <= 0) return;
            
            let key = null;
            // Try to extract cheque number
            const chqMatch = remarksText.match(/CHQ\s*#?\s*(\d+)/i);
            if (chqMatch && chqMatch[1]) {
                if (matchCriteria === 'strict') {
                    key = `CHQ_${chqMatch[1]}_${val}`;
                } else {
                    key = `CHQ_${chqMatch[1]}`;
                }
            } else {
                // Fallback: Exact Amount + Exact Remarks
                key = `EXACT_${val}_${remarksText.toLowerCase()}`;
            }
            
            if (!groupMap.has(key)) {
                groupMap.set(key, []);
            }
            groupMap.get(key).push({
                element: row,
                value: val,
                remarks: remarksText,
                date: dateTd ? dateTd.innerText : '',
                index: index
            });
        }
    });

    currentDuplicateGroups = Array.from(groupMap.values()).filter(group => group.length > 1);
    
    const statusEl = document.getElementById('duplicateMatchStatus');
    statusEl.className = "alert alert-info py-2 small mt-3";
    
    if (currentDuplicateGroups.length === 0) {
        statusEl.className = "alert alert-success py-2 small mt-3";
        statusEl.innerHTML = '<i class="fas fa-check-circle me-1"></i> No duplicate cheques or entries found based on current filters.';
        document.getElementById('duplicateMatchResults').style.display = 'none';
        return;
    }
    
    statusEl.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i> Found ${currentDuplicateGroups.length} potential duplicate group(s).`;
    
    const listEl = document.getElementById('duplicateMatchList');
    listEl.innerHTML = '';
    
    currentDuplicateGroups.forEach((group, groupIdx) => {
        const accordionItem = document.createElement('div');
        accordionItem.className = 'accordion-item border-danger mb-2';
        
        // Sum total amount for group just for display
        const groupSum = group.reduce((acc, item) => acc + item.value, 0);
        
        let headerTitle = "Duplicate Entries";
        const chqMatch = group[0].remarks.match(/CHQ\s*#?\s*(\d+)/i);
        if (chqMatch && chqMatch[1]) {
            headerTitle = `Cheque #${chqMatch[1]}`;
        }
        
        const matchCriteria = document.getElementById('dupMatchCriteria') ? document.getElementById('dupMatchCriteria').value : 'strict';
        const eachText = matchCriteria === 'strict' ? `${group[0].value.toLocaleString()} each` : `Total: ${groupSum.toLocaleString()}`;
        
        accordionItem.innerHTML = `
            <h2 class="accordion-header" id="headingDup${groupIdx}">
                <button class="accordion-button collapsed py-2" type="button" data-bs-toggle="collapse" data-bs-target="#collapseDup${groupIdx}" aria-expanded="false" aria-controls="collapseDup${groupIdx}">
                    <strong>${headerTitle}</strong> &nbsp; <span class="badge bg-danger ms-2">${group.length} items</span> &nbsp; <span class="ms-auto me-3 fw-bold">${eachText}</span>
                </button>
            </h2>
            <div id="collapseDup${groupIdx}" class="accordion-collapse collapse" aria-labelledby="headingDup${groupIdx}" data-bs-parent="#duplicateMatchList">
                <div class="accordion-body p-2 bg-light">
                    <ul class="list-group mb-2">
                        ${group.map(item => `
                            <li class="list-group-item d-flex justify-content-between align-items-center py-1">
                                <span class="small">${item.date} <br> <span class="text-muted" style="font-size:0.7rem;">${item.remarks}</span></span>
                                <span class="fw-bold">${item.value.toLocaleString()}</span>
                            </li>
                        `).join('')}
                    </ul>
                    <button class="btn btn-sm btn-outline-danger w-100" onclick="highlightDuplicates(${groupIdx})">
                        <i class="fas fa-highlighter me-1"></i>Highlight these rows in grid
                    </button>
                </div>
            </div>
        `;
        listEl.appendChild(accordionItem);
    });
    
    document.getElementById('duplicateMatchResults').style.display = 'block';
}

function highlightDuplicates(groupIdx) {
    if (groupIdx < 0 || groupIdx >= currentDuplicateGroups.length) return;
    const group = currentDuplicateGroups[groupIdx];
    
    // Clear previous highlights
    document.querySelectorAll('#bankDetailsBody tr').forEach(tr => {
        tr.style.border = '';
        tr.style.boxShadow = '';
        tr.querySelectorAll('td').forEach(td => {
            td.style.removeProperty('background-color');
            td.style.removeProperty('color');
            td.classList.remove('fw-bold');
        });
    });
    
    // Highlight new ones
    let isFirst = true;
    group.forEach(item => {
        if (item.element) {
            // Very prominent highlight for duplicates: Orange background, black text, bold
            item.element.style.setProperty('border', '3px solid #000', 'important');
            item.element.querySelectorAll('td').forEach(td => {
                td.style.setProperty('background-color', '#fd7e14', 'important');
                td.style.setProperty('color', '#fff', 'important');
                td.classList.add('fw-bold');
            });
            
            // Scroll the very first duplicated row into view
            if (isFirst) {
                item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                isFirst = false;
            }
            
            const cb = item.element.querySelector('.batch-checkbox');
            if (cb) cb.checked = true; // check it to make deletion easy
        }
    });
    
    if (duplicateMatchModalInstance) {
        duplicateMatchModalInstance.hide();
    }
}
