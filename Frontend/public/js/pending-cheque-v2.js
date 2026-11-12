// Run initialize immediately if the DOM is already ready
console.log("Pending Cheque V2 Script Loading...");

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProPendingCheque);
} else {
    initProPendingCheque();
}

let currentBranchBanks = new Set();

async function initProPendingCheque() {
    console.log("Pending Cheque V2 Initializing...");
    try {
        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        const bankDateEl = document.getElementById('new-bank-date');
        const stmtDateEl = document.getElementById('new-stmt-date');

        if (bankDateEl) bankDateEl.value = today;
        if (stmtDateEl) stmtDateEl.value = today;

        // Attach listeners safely
        const branchEl = document.getElementById('new-branch');
        if (branchEl) {
            branchEl.addEventListener('change', handleProBranchChange);
            console.log("Branch listener attached");
        }

        if (bankDateEl) bankDateEl.addEventListener('change', calculateProAll);

        const stmtInput = document.getElementById('new-statement');
        if (stmtInput) {
            stmtInput.addEventListener('input', calculateProDiff);
            stmtInput.addEventListener('keyup', calculateProDiff);
            stmtInput.addEventListener('change', calculateProDiff);
        }

        const refreshBtn = document.getElementById('btn-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', calculateProAll);

        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) saveBtn.addEventListener('click', saveProPendingChqRecord);

        // Initial Load - Wrapped in sub-tries to prevent total failure
        try { await loadProBranches(); } catch(e) { console.error("Error in loadProBranches", e); }
        try { await loadProHistory(); } catch(e) { console.error("Error in loadProHistory", e); }
        
    } catch (err) {
        console.error("Critical error in initProPendingCheque", err);
    }
}

async function loadProBranches() {
    const select = document.getElementById('new-branch');
    if (!select) return;

    try {
        const token = localStorage.getItem('token');
        // Add cache buster to branch fetch
        const res = await fetch(`/api/v1/stores?_t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success && data.data && data.data.length > 0) {
            if (data.data.length > 1) {
                select.innerHTML = '<option value="">Select Branch...</option>';
            } else {
                select.innerHTML = '';
            }

            data.data.forEach(store => {
                const opt = document.createElement('option');
                opt.value = store.name;
                opt.textContent = store.name;
                select.appendChild(opt);
            });

            if (data.data.length === 1) {
                select.value = data.data[0].name;
                select.dispatchEvent(new Event('change'));
            }
        }
    } catch (e) {
        console.error("Error loading branches", e);
    }
}
// Removed fallback logic to strictly use database
function useFallbackBranches(select) {
    // Deprecated
}

function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function toggleBreakdown() {
    const el = document.getElementById('breakdown-panel');
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

async function handleProBranchChange() {
    const branch = document.getElementById('new-branch').value;

    // Load Banks for dropdown (visual only, calc uses all)
    // Even if empty branch, we might want to clear or similar
    if (branch) {
        await loadBanks(branch);
        await calculateProAll();
    }

    loadProHistory();
}

// Calculate Diff = Bank Amount + Pending Chq - Statement
// Calculate Diff = Bank Amount + Pending Chq - Statement
function calculateProDiff() {
    const bankAmtVal = document.getElementById('new-bank-amount').value || '0';
    const pendingAmtVal = document.getElementById('new-pending-chq').value || '0';
    const stmtAmtVal = document.getElementById('new-statement').value || '0';

    // Remove any commas or spaces
    const cleanNum = (str) => {
        if (!str) return 0;
        return parseFloat(String(str).replace(/,/g, '').replace(/\s/g, '')) || 0;
    };

    const bankAmt = cleanNum(bankAmtVal);
    const pendingAmt = cleanNum(pendingAmtVal);
    const stmtAmt = cleanNum(stmtAmtVal);

    console.log(`[CalcProDiff] Bank: ${bankAmt}, Pending: ${pendingAmt}, Stmt: ${stmtAmt}`);

    // Formula: Bank Amount + Pending Cheque - Statement Amount
    const diff = (bankAmt + pendingAmt) - stmtAmt;
    console.log(`[CalcProDiff] Result: ${diff}`);

    // UI Updates
    const diffEl = document.getElementById('new-diff');
    if (diffEl) {
        diffEl.value = diff.toFixed(2);

        if (Math.abs(diff) < 0.1) {
            diffEl.className = 'form-control amount-input bg-amount-green';
        } else {
            diffEl.className = 'form-control amount-input bg-amount-red';
        }
    }
}

async function loadBanks(branch) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/banks?branch=${encodeURIComponent(branch)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        const select = document.getElementById('new-bank');
        select.innerHTML = '<option value="">All Banks</option>';
        currentBranchBanks.clear();

        if (data.success && data.data) {
            // Client-side Double Check Filter
            const filtered = data.data.filter(b => !b.branch || b.branch === branch);

            // If backend filter works, filtered count should match data.data count.
            // If strict client side needed:
            const listToUse = filtered.length > 0 ? filtered : data.data;

            listToUse.forEach(bank => {
                const opt = document.createElement('option');
                opt.value = bank._id;
                opt.textContent = bank.bankName + (bank.accountNumber ? ` (${bank.accountNumber})` : '');
                select.appendChild(opt);
                currentBranchBanks.add(bank._id);
            });
            console.log(`Loaded ${listToUse.length} banks for branch ${branch}`);
        }

        // LOCK the dropdown as requested by user
        select.disabled = true;

    } catch (e) {
        console.error("Error loading banks", e);
    }
}

async function calculateProAll() {
    const branch = document.getElementById('new-branch').value;
    const date = document.getElementById('new-bank-date').value;
    const btnRefresh = document.getElementById('btn-refresh');

    if (!branch || !date) return;

    if (btnRefresh) {
        btnRefresh.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Refreshing...';
        btnRefresh.disabled = true;
    }

    try {
        const token = localStorage.getItem('token');

        const isEP = (name) => {
            const n = (name || '').toLowerCase();
            return n.includes('easypaisa') || n.includes('easy paisa');
        };

        // 1. BANK AMOUNT — use the same backend formula as Bank Ledger Report
        // GET /api/v1/reports/bank-ledger/branch-balance?branch=...&date=...
        const balRes = await fetch(
            `/api/v1/reports/bank-ledger/branch-balance?branch=${encodeURIComponent(branch)}&date=${date}&_t=${Date.now()}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const balData = await balRes.json();
        const grandBankAmount = balData.success ? (balData.totalBalance || 0) : 0;
        document.getElementById('new-bank-amount').value = grandBankAmount.toFixed(2);

        // 2. CALCULATE PENDING CHEQUE (All Unverified Payments — no date filter)
        const bankSelectEl = document.getElementById('new-bank');
        const selectedBankId = bankSelectEl && bankSelectEl.value ? bankSelectEl.value : null;

        const pendingUrl = `/api/v1/bank-transactions?branch=${encodeURIComponent(branch)}&excludeRefType=bank_transfer&limit=0&_t=${Date.now()}`;
        const pRes = await fetch(pendingUrl, { headers: { 'Authorization': `Bearer ${token}` } });
        const pData = await pRes.json();

        let pendingTotal = 0;
        if (pData.success) {
            pendingTotal = pData.data
                .filter(t => {
                    const isVerified = (t.isVerified === true || t.isVerified === 'true' || t.isVerified === 1);
                    if (isVerified) return false;

                    const type = (t.type || '').toLowerCase();
                    const transType = (t.transactionType || '').toLowerCase();
                    const isDeposit = type === 'deposit' || type === 'received' || transType === 'deposit' || transType === 'received';
                    if (isDeposit) return false;

                    const desc = (t.narration || t.remarks || '').toLowerCase();
                    if (desc.includes('bank transfer') || desc.startsWith('transfer from') || desc.startsWith('transfer to')) return false;

                    const bName = (t.bankName || t.bank?.bankName || '');
                    if (isEP(bName)) return false;

                    if (selectedBankId) {
                        const bId = t.bank?._id || t.bank;
                        if (bId !== selectedBankId) return false;
                    }

                    return true;
                })
                .reduce((sum, t) => sum + (t.amount || 0), 0);
        }

        document.getElementById('new-pending-chq').value = pendingTotal.toFixed(2);

        // 3. FINAL REFRESH
        calculateProDiff();

        // Update Breakdown UI (simplified — backend does the aggregation now)
        const valTotal = document.getElementById('val-total');
        if (valTotal) valTotal.textContent = grandBankAmount.toLocaleString();

    } catch (e) {
        console.error("Calculation Error", e);
        alert("Error calculating values. Check console.");
    } finally {
        if (btnRefresh) {
            btnRefresh.innerHTML = '<i class="fas fa-sync-alt me-2"></i> Refresh Data';
            btnRefresh.disabled = false;
        }
    }
}

// Keep stubs for compatibility but logic moved to calculateProAll
async function calculateBankAmount() { /* logic combined */ }
async function calculatePendingChq() { /* logic combined */ }

// Add global exposure for debugging
window.calculateProDiff = calculateProDiff;
window.toggleBreakdown = toggleBreakdown;
window.initProPendingCheque = initProPendingCheque;
window.loadProBranches = loadProBranches;

// --- History / Save Logic ---

// Global variable to track editing
let editingRecordId = null;

async function saveProPendingChqRecord() {
    const branch = document.getElementById('new-branch').value;
    const bankDate = document.getElementById('new-bank-date').value;
    const stmtDate = document.getElementById('new-stmt-date').value;
    const token = localStorage.getItem('token');

    if (!branch || !bankDate) {
        alert("Please select a branch and date.");
        return;
    }

    const currentDiff = document.getElementById('new-diff').value;
    const bankAmount = document.getElementById('new-bank-amount').value;
    const pendingChq = document.getElementById('new-pending-chq').value;
    const statement = document.getElementById('new-statement').value;

    const payload = {
        branch,
        bankDate,
        statementDate: stmtDate,
        bankAmount,
        pendingChq,
        statement,
        diff: currentDiff
    };

    const saveBtn = document.getElementById('btn-save');
    const originalBtnContent = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Saving...';

    try {
        let url = '/api/v1/pending-cheques';
        let method = 'POST';

        if (editingRecordId) {
            url += `/${editingRecordId}`;
            method = 'PUT';
        }

        const res = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            alert("Record Saved Successfully to Database!");
            editingRecordId = null;
            document.getElementById('btn-save').innerHTML = '<i class="fas fa-save me-2"></i> Save Record';

            // Clear inputs (Optional, or keep for rapid entry?)
            // document.getElementById('new-statement').value = '';

            loadProHistory();
        } else {
            alert("Error saving record: " + (data.error || 'Unknown Error'));
        }
    } catch (e) {
        console.error("Save Error", e);
        alert("Failed to save to database.");
    } finally {
        saveBtn.disabled = false;
        if (!editingRecordId) saveBtn.innerHTML = '<i class="fas fa-save me-2"></i> Save Record';
        else saveBtn.innerHTML = '<i class="fas fa-edit me-2"></i> Update Record';
    }
}

// Cache for current data
let currentHistoryData = [];

function getDataById(id) {
    return currentHistoryData.find(h => h._id === id) || {};
}

function editProRecord(id) {
    // ID coming from HTML onclick might be string, ensure type match
    const record = getDataById(String(id));
    if (!record || !record._id) {
        console.error("Record not found for edit", id);
        return;
    }

    // Populate Fields
    document.getElementById('new-branch').value = record.branch;

    // Format Date for Input (YYYY-MM-DD)
    const formatDateForInput = (d) => {
        if (!d) return '';
        return new Date(d).toISOString().split('T')[0];
    };

    document.getElementById('new-bank-date').value = formatDateForInput(record.bankDate);
    document.getElementById('new-stmt-date').value = formatDateForInput(record.statementDate);

    document.getElementById('new-bank-amount').value = record.bankAmount;
    document.getElementById('new-pending-chq').value = record.pendingChq;
    document.getElementById('new-statement').value = record.statement;
    document.getElementById('new-diff').value = record.diff;

    // Set Edit Mode
    editingRecordId = record._id;
    document.getElementById('btn-save').innerHTML = '<i class="fas fa-edit me-2"></i> Update Record';

    // Scroll to top
    document.getElementById('pending-chq').scrollIntoView({ behavior: 'smooth' });

    // Recalculate Diff visual state just in case
    calculateProDiff();
}

async function loadProHistory() {
    try {
        const token = localStorage.getItem('token');
        const branch = document.getElementById('new-branch').value;

        // Filter by branch if selected
        let url = '/api/v1/pending-cheques';
        if (branch) {
            url += `?branch=${encodeURIComponent(branch)}`;
        }

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            currentHistoryData = data.data;
            renderProGrid(currentHistoryData);
        } else {
            console.error("Failed to load history", data.error);
        }
    } catch (e) {
        console.error("Error loading history", e);
    }
}

function renderProGrid(data) {
    const tbody = document.getElementById('grid-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No data available in Database</td></tr>';
        return;
    }

    data.forEach(item => {
        // Format System Date (Local)
        const sysDate = new Date(item.createdAt || item.date).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

        // Helper to format short date
        const shortDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="small">${sysDate}</td>
            <td>${shortDate(item.statementDate)}</td>
            <td>${item.branch}</td>
            <td class="text-end fw-bold text-success">${formatCurrency(item.bankAmount)}</td>
            <td class="text-end text-primary">${formatCurrency(item.pendingChq)}</td>
            <td class="text-end">${formatCurrency(item.statement)}</td>
            <td class="text-end fw-bold text-danger">${formatCurrency(item.diff)}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editProRecord('${item._id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteProRecord('${item._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function formatCurrency(val) {
    return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function deleteProRecord(id) {
    if (!confirm("Are you sure you want to delete this record from the database?")) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/pending-cheques/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            loadProHistory();
        } else {
            alert("Error deleting: " + data.error);
        }
    } catch (e) {
        alert("Delete failed.");
    }
};

window.calculateProDiff = calculateProDiff;
window.toggleBreakdown = toggleBreakdown;
window.initProPendingCheque = initProPendingCheque;
window.loadProBranches = loadProBranches;
window.saveProPendingChqRecord = saveProPendingChqRecord;
window.deleteProRecord = deleteProRecord;
window.editProRecord = editProRecord;

