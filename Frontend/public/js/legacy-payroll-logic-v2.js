document.addEventListener('DOMContentLoaded', () => {
    // Default From/To month to current month
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-05"
    const fromEl = document.getElementById('filterFrom');
    const toEl   = document.getElementById('filterTo');
    if (fromEl && !fromEl.value) fromEl.value = currentMonth;
    if (toEl   && !toEl.value)   toEl.value   = currentMonth;

    loadSearchSuggestions();
    loadRecords(1);
});

let currentState = { records: [], total: 0, page: 1, pages: 1 };
let searchData   = { codes: [], names: [], branches: [], departments: [], designations: [], empMap: {} };

// ── Load all suggestions from DB ─────────────────────────────────────────────
async function loadSearchSuggestions() {
    const token = localStorage.getItem('token');
    try {
        const res  = await fetch('/api/v1/legacy-payroll/suggestions', { headers: { 'Authorization': `Bearer ${token}` } });
        const json = await res.json();
        if (!json.success) return;

        searchData = {
            codes:        json.codes        || [],
            names:        json.names        || [],
            branches:     json.branches     || [],
            departments:  json.departments  || [],
            designations: json.designations || [],
            empMap:       json.empMap       || {}
        };

        // Populate Branch dropdown
        const branchSel = document.getElementById('filterBranch');
        if (branchSel) {
            branchSel.innerHTML = '<option value="">Select Branch</option><option value="">All Branches</option>';
            searchData.branches
                .filter(b => b && b.length > 1 && !/^\d+$/.test(b))
                .sort()
                .forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = opt.textContent = b;
                    branchSel.appendChild(opt);
                });
        }

        // Populate Department dropdown
        const deptSel = document.getElementById('filterDept');
        if (deptSel) {
            deptSel.innerHTML = '<option value="">All Departments</option>';
            searchData.departments.filter(d => d && d.length > 1).sort()
                .forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = opt.textContent = d;
                    deptSel.appendChild(opt);
                });
        }

        // Populate Designation dropdown
        const desgSel = document.getElementById('filterDesignation'); // Check if ID matches HTML
        const desgSelReal = document.getElementById('filterDesg') || desgSel;
        if (desgSelReal) {
            desgSelReal.innerHTML = '<option value="">All Designations</option>';
            searchData.designations.filter(d => d && d.length > 1).sort()
                .forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = opt.textContent = d;
                    desgSelReal.appendChild(opt);
                });
        }
    } catch (err) { console.error('Suggestions failed:', err); }
}

// ── Keyboard-navigable autocomplete helper ────────────────────────────────────
function makeAutocomplete({ inputId, containerId, getMatches, onSelect }) {
    const input     = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    if (!input || !container) return;
    
    let activeIdx   = -1;

    function setActive(items, idx) {
        items.forEach(el => el.classList.remove('search-item-active'));
        if (idx >= 0 && idx < items.length) {
            items[idx].classList.add('search-item-active');
            items[idx].scrollIntoView({ block: 'nearest' });
        }
        activeIdx = idx;
    }

    input.addEventListener('input', () => {
        activeIdx = -1;
        container.innerHTML = '';
        const val = input.value.toLowerCase();
        if (val.length < 1) { container.style.display = 'none'; return; }

        const matches = getMatches(val);
        if (!matches.length) { container.style.display = 'none'; return; }

        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = m.html;
            div.addEventListener('mousedown', (e) => { 
                e.preventDefault(); 
                onSelect(m); 
                container.style.display = 'none'; 
            });
            container.appendChild(div);
        });
        container.style.display = 'block';
    });

    input.addEventListener('keydown', (e) => {
        const items = [...container.querySelectorAll('.search-item')];
        if (!items.length) return;

        if (e.key === 'ArrowDown' || e.key === 'Down') {
            e.preventDefault();
            const nextIdx = (activeIdx + 1) % items.length;
            setActive(items, nextIdx);
        } else if (e.key === 'ArrowUp' || e.key === 'Up') {
            e.preventDefault();
            const prevIdx = (activeIdx - 1 + items.length) % items.length;
            setActive(items, prevIdx);
        } else if (e.key === 'Enter') {
            if (activeIdx >= 0 && activeIdx < items.length) {
                e.preventDefault();
                items[activeIdx].dispatchEvent(new Event('mousedown'));
                container.style.display = 'none';
            }
        } else if (e.key === 'Escape') {
            container.style.display = 'none';
            activeIdx = -1;
        }
    });
}

// ── Employee Code Autocomplete ────────────────────────────────────────────────
makeAutocomplete({
    inputId:     'filterEmpCode',
    containerId: 'codeResults',
    getMatches: (val) => {
        const branch = document.getElementById('filterBranch').value;
        return searchData.codes
            .filter(c => {
                const emp = searchData.empMap[c];
                const matchesCode = c.toLowerCase().includes(val);
                const matchesBranch = !branch || (emp && emp.branch === branch);
                return matchesCode && matchesBranch;
            })
            .slice(0, 10)
            .map(c => {
                const emp = searchData.empMap[c];
                const isNew = emp && emp.source === 'payroll';
                const badge = isNew
                    ? `<span style="background:#e0f2fe;color:#0284c7;font-size:0.6rem;padding:1px 4px;border-radius:3px;font-weight:600;">NEW</span>`
                    : `<span style="background:#f3f4f6;color:#6b7280;font-size:0.6rem;padding:1px 4px;border-radius:3px;">LEGACY</span>`;
                const sub = emp ? `${emp.branch || ''} &bull; ${emp.department || ''} / ${emp.designation || ''}` : '';
                return {
                    html: `<b>${c}</b> ${badge} <span class="text-muted small">${emp ? emp.name : ''}</span><br><span style="font-size:0.7rem;color:#888;">${sub}</span>`,
                    code: c
                };
            });
    },
    onSelect: (m) => {
        document.getElementById('filterEmpCode').value = m.code;
        autoFillEmployee(m.code);
        loadRecords(1);
    }
});

// ── Employee Name Autocomplete ────────────────────────────────────────────────
makeAutocomplete({
    inputId:     'filterEmpName',
    containerId: 'nameResults',
    getMatches: (val) => {
        const branch = (document.getElementById('filterBranch').value || '').replace(/[()]/g, '').trim().toLowerCase();
        return Object.entries(searchData.empMap)
            .filter(([code, emp]) => {
                const matchesName = emp.name.toLowerCase().includes(val);
                const empBranch = (emp.branch || '').replace(/[()]/g, '').trim().toLowerCase();
                const matchesBranch = !branch || empBranch === branch;
                return matchesName && matchesBranch;
            })
            .slice(0, 20)
            .map(([code, emp]) => {
                const isNew = emp.source === 'payroll';
                const badge = isNew
                    ? `<span style="background:#e0f2fe;color:#0284c7;font-size:0.6rem;padding:1px 4px;border-radius:3px;font-weight:600;">NEW</span>`
                    : `<span style="background:#f3f4f6;color:#6b7280;font-size:0.6rem;padding:1px 4px;border-radius:3px;">LEGACY</span>`;
                const sub = `${code} &bull; ${emp.branch || ''} &bull; ${emp.department || ''} / ${emp.designation || ''}`;
                return {
                    html:  `<b>${emp.name}</b> ${badge}<br><span style="font-size:0.7rem;color:#888;">${sub}</span>`,
                    code,
                    name:  emp.name
                };
            });
    },
    onSelect: (m) => {
        document.getElementById('filterEmpName').value = m.name;
        // Do NOT fill code — search by name only so BOTH legacy and new payroll records appear
        document.getElementById('filterEmpCode').value = '';
        loadRecords(1);
    }
});

// ── Auto-fill dept/designation/branch when employee selected ──────────────────
function autoFillEmployee(code) {
    const emp = searchData.empMap[code];
    if (!emp) return;
    const deptSel   = document.getElementById('filterDept');
    const desgSel   = document.getElementById('filterDesg');
    const branchSel = document.getElementById('filterBranch');
    if (deptSel   && emp.department)  deptSel.value   = emp.department;
    if (desgSel   && emp.designation) desgSel.value   = emp.designation;
    if (branchSel && emp.branch)      branchSel.value = emp.branch;
}

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.position-relative')) {
        const c1 = document.getElementById('codeResults');
        const c2 = document.getElementById('nameResults');
        if (c1) c1.style.display = 'none';
        if (c2) c2.style.display = 'none';
    }
});

// ── Load Records ──────────────────────────────────────────────────────────────
async function loadRecords(page = 1) {
    const token   = localStorage.getItem('token');
    const params  = new URLSearchParams({ page, limit: 50 });
    const branch  = document.getElementById('filterBranch').value;
    const empCode = document.getElementById('filterEmpCode').value.trim();
    const empName = document.getElementById('filterEmpName').value.trim();
    const dept    = document.getElementById('filterDept').value;
    const desg    = document.getElementById('filterDesg').value;
    const from    = document.getElementById('filterFrom').value;
    const to      = document.getElementById('filterTo').value;

    if (branch)  params.set('branch',       branch);
    if (empCode) params.set('employeeCode', empCode);
    if (empName) params.set('employeeName', empName);
    if (dept)    params.set('department',   dept);
    if (desg)    params.set('designation',  desg);
    if (from)    params.set('fromMonth',    from);
    if (to)      params.set('toMonth',      to);

    try {
        const res  = await fetch(`/api/v1/legacy-payroll?${params}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const json = await res.json();
        if (json.success) {
            currentState = { records: json.data || [], total: json.total || 0, page: json.page || 1, pages: json.pages || 1 };
            renderRecords();
            renderPagination();
        }
    } catch (err) { console.error('loadRecords failed:', err); }
}

// ── Render Table ──────────────────────────────────────────────────────────────
function renderRecords() {
    const body = document.getElementById('recordsBody');
    if (!body) return;

    if (!currentState.records.length) {
        body.innerHTML = `<tr><td colspan="23" class="text-center py-5 text-muted"><i class="fas fa-inbox fa-2x mb-2 d-block"></i>No records found.</td></tr>`;
        updateInfo(0, 0, 0);
        return;
    }

    body.innerHTML = currentState.records.map(r => {
        const bankAmt = r.bankPaid || 0;
        const cashAmt = r.cashPaid || 0;
        let paidVia = bankAmt > 0
            ? `<span class="badge badge-bank">BANK: ${fc(bankAmt)}</span>`
            : `<span class="badge badge-cash">CASH: ${fc(cashAmt)}</span>`;

        // Distinguish new payroll slips (Apr 2026+) from old legacy Excel records
        const isNew = r.source === 'payroll';
        const sourceBadge = isNew
            ? `<span style="background:#e0f2fe;color:#0284c7;font-size:0.6rem;padding:1px 5px;border-radius:3px;font-weight:600;">NEW</span>`
            : `<span style="background:#f3f4f6;color:#6b7280;font-size:0.6rem;padding:1px 5px;border-radius:3px;">LEGACY</span>`;

        // New payroll records print via /print-payroll?id=; legacy via the PDF slip
        const printBtn = isNew
            ? `<button class="btn-action btn btn-outline-success btn-sm ms-1" onclick="window.open('/print-payroll?id=${r.payrollId}','_blank')" title="Print Payroll Slip"><i class="fas fa-file-invoice"></i></button>`
            : `<button class="btn-action btn btn-outline-secondary btn-sm ms-1" onclick="printSlip('${r.employeeCode}','${(r.monthYear||'').replace(/'/g,"\\'")}')" title="PDF Slip"><i class="fas fa-file-pdf"></i></button>`;

        return `<tr class="${isNew ? 'table-light' : ''}">
            <td class="text-center">
                <button class="btn-action btn btn-outline-primary btn-sm" onclick="viewHistory('${r.employeeCode}','${(r.employeeName||'').replace(/'/g,"\\'")}')"><i class="fas fa-history"></i></button>
                ${printBtn}
            </td>
            <td>
                <div class="emp-name">${r.employeeName||'Unknown'} ${sourceBadge}</div>
                <div class="emp-code">${r.employeeCode||''} &bull; ${r.branch||''}</div>
                <div class="emp-code text-info">${r.department||''} / ${r.designation||''}</div>
            </td>
            <td class="text-nowrap fw-bold">${r.monthYear||'---'}</td>
            <!-- EARNINGS (8) -->
            <td class="text-end font-mono">${fc(r.basicSalary)}</td>
            <td class="text-end font-mono text-primary">${fc(r.overTime)}</td>
            <td class="text-end font-mono text-info">${fc(r.stLessAllowance)}</td>
            <td class="text-end font-mono">${fc(r.fixAllowance)}</td>
            <td class="text-end font-mono">${fc(r.monthlyCommission)}</td>
            <td class="text-end font-mono">${fc(r.warehouseComm)}</td>
            <td class="text-end font-mono">${fc(r.otherEarning || r.otherAllowance)}</td>
            <td class="text-end font-mono">${fc(r.breakfastRoti)}</td>
            <!-- DEDUCTIONS (9) -->
            <td class="text-end font-mono text-danger">${fc(r.shortTime)}</td>
            <td class="text-end font-mono">${fc(r.mess)}</td>
            <td class="text-end font-mono">${fc(r.preMonthBalance)}</td>
            <td class="text-end font-mono text-info">${fc(r.currentAdvance)}</td>
            <td class="text-end font-mono text-danger">${fc(r.advanceDeduction)}</td>
            <td class="text-end font-mono">${fc(r.balance)}</td>
            <td class="text-end font-mono text-danger">${fc(r.otherDeductionPenalty)}</td>
            <td class="text-end font-mono">${fc(r.salaryWHT)}</td>
            <td class="text-end font-mono">${fc(r.securityDeposit)}</td>
            <!-- TOTALS -->
            <td class="text-end fw-bold">${fc(r.grossSalary)}</td>
            <td class="text-end fw-bold text-danger">${fc(r.totalDeduction)}</td>
            <td class="text-end net-total-cell fw-bold">${fc(r.netSalary)}</td>
            <td>${paidVia}</td>
        </tr>`;
    }).join('');

    const statsBar = document.getElementById('statsBar');
    if (statsBar) statsBar.classList.remove('d-none');
    const statTotal = document.getElementById('statTotal');
    if (statTotal) statTotal.textContent = currentState.total.toLocaleString();

    const start = (currentState.page - 1) * 50 + 1;
    const end   = Math.min(start + currentState.records.length - 1, currentState.total);
    updateInfo(start, end, currentState.total);
}

function updateInfo(s, e, t) {
    const el = document.getElementById('paginationInfo');
    if (el) el.textContent = `Showing ${s} to ${e} of ${t} entries`;
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination() {
    const ctrl = document.getElementById('paginationControls');
    if (!ctrl) return;
    ctrl.innerHTML = '';
    if (currentState.pages <= 1) return;

    ctrl.innerHTML += `<li class="page-item ${currentState.page===1?'disabled':''}"><a class="page-link" href="#" onclick="loadRecords(${currentState.page-1});return false;">Previous</a></li>`;
    let ps = Math.max(1, currentState.page-2), pe = Math.min(currentState.pages, ps+4);
    if (pe === currentState.pages) ps = Math.max(1, pe-4);
    for (let i = ps; i <= pe; i++) ctrl.innerHTML += `<li class="page-item ${currentState.page===i?'active':''}"><a class="page-link" href="#" onclick="loadRecords(${i});return false;">${i}</a></li>`;
    ctrl.innerHTML += `<li class="page-item ${currentState.page===currentState.pages?'disabled':''}"><a class="page-link" href="#" onclick="loadRecords(${currentState.page+1});return false;">Next</a></li>`;
}

// ── Process PDF ───────────────────────────────────────────────────────────────
async function processExistingPDF() {
    if (!confirm('Re-index the PDF from EXPORT folder? This takes 1-2 minutes.')) return;
    const overlay = document.getElementById('loadingOverlay');
    const txt     = document.getElementById('loadingText');
    if (overlay) overlay.style.display = 'flex';
    if (txt)     txt.textContent = 'Processing PDF... please wait.';

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
        const res  = await fetch('/api/v1/legacy-payroll/process', { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }, signal: controller.signal });
        clearTimeout(timeoutId);
        const json = await res.json();
        if (overlay) overlay.style.display = 'none';
        if (json.success) { alert(`✅ ${json.message}`); await loadSearchSuggestions(); loadRecords(1); }
        else alert('❌ ' + json.message);
    } catch (err) {
        clearTimeout(timeoutId);
        if (overlay) overlay.style.display = 'none';
        if (err.name === 'AbortError') alert('⏱️ Timeout. Refresh in a minute to check results.');
        else alert('❌ Failed. Check server logs.');
    }
}

async function syncFromExcel() {
    if (!confirm('Sync data from the latest Excel file in EXPORT folder? This will update screen values to match Excel exactly.')) return;
    const overlay = document.getElementById('loadingOverlay');
    const txt     = document.getElementById('loadingText');
    if (overlay) overlay.style.display = 'flex';
    if (txt)     txt.textContent = 'Syncing from Excel...';

    try {
        const res  = await fetch('/api/v1/legacy-payroll/process-excel', { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const json = await res.json();
        if (overlay) overlay.style.display = 'none';
        if (json.success) { 
            alert(`✅ ${json.message}`); 
            await loadSearchSuggestions(); 
            loadRecords(1); 
        }
        else alert('❌ ' + json.message);
    } catch (err) {
        if (overlay) overlay.style.display = 'none';
        alert('❌ Failed to sync. Check console.');
    }
}

// ── History Modal ─────────────────────────────────────────────────────────────
async function viewHistory(code, name) {
    const token = localStorage.getItem('token');
    const nameEl = document.getElementById('historyEmpName');
    if (nameEl) nameEl.textContent = `${name} (${code})`;
    try {
        const res  = await fetch(`/api/v1/legacy-payroll/history/${code}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const json = await res.json();
        if (json.success) {
            const body = document.getElementById('historyBody');
            body.innerHTML = '';
            if (!json.data.length) { body.innerHTML = '<tr><td colspan="6" class="text-center py-3">No records.</td></tr>'; }
            else json.data.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${r.monthYear}</td><td>${r.branch}</td><td class="text-end">${fc(r.basicSalary)}</td><td class="text-end">${fc(r.grossSalary)}</td><td class="text-end fw-bold text-success">${fc(r.netSalary)}</td><td class="text-center"><button class="btn btn-sm btn-outline-secondary" onclick="printSlip('${r.employeeCode}','${r.monthYear}')"><i class="fas fa-file-pdf"></i></button></td>`;
                body.appendChild(tr);
            });
            new bootstrap.Modal(document.getElementById('historyModal')).show();
        }
    } catch (err) { console.error('History failed:', err); }
}

// Branch-safe: uses employeeCode + monthYear (the unique DB key) so the correct slip is
// always shown regardless of duplicate employee names across branches.
function printSlip(code, monthYear) {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams({ code, monthYear });
    window.open(`/api/v1/legacy-payroll/view-slip?${params}&token=${token}`, '_blank');
}
function resetFilters()  { document.getElementById('filterForm').reset(); loadRecords(1); }
function exportToExcel() { alert('Export coming soon.'); }
function fc(n) { return (n||0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function formatCurrency(n) { return fc(n); }
