document.addEventListener('DOMContentLoaded', () => {
    loadBranches();
    loadEmployees();
    setDefaults();

    // Search functionality matching Advance screen
    const empInput = document.getElementById('employeeInput');
    const resultsBox = document.getElementById('employeeSearchResults');

    let currentEmployeeSearchIndex = -1;

    if (empInput) {
        empInput.addEventListener('input', function () {
            const term = this.value.toLowerCase();
            const branch = document.getElementById('branch').value;
            resultsBox.innerHTML = '';
            resultsBox.style.display = 'none';
            currentEmployeeSearchIndex = -1;

            if (term.length >= 1) {
                let filtered = window.allEmployees || [];
                if (branch) filtered = filtered.filter(e => e.branch === branch);

                const matches = filtered.filter(emp =>
                    emp.name.toLowerCase().includes(term) ||
                    emp.code.toString().includes(term)
                ).slice(0, 20);

                if (matches.length > 0) {
                    matches.forEach(emp => {
                        const el = document.createElement('a');
                        el.className = 'list-group-item list-group-item-action p-2 small';
                        el.href = '#';
                        el.innerHTML = `<b>${emp.code}</b> - ${emp.name}`;
                        el.onclick = (e) => {
                            e.preventDefault();
                            selectEmployee(emp);
                        };
                        resultsBox.appendChild(el);
                    });
                    resultsBox.style.display = 'block';
                    resultsBox.matchedEmployees = matches; // Store for arrow key access
                }
            }
        });

        // Add Keyboard Navigation
        // Add Keyboard Navigation
        empInput.addEventListener('keydown', (e) => {
            if (resultsBox.style.display === 'none') return;
            const items = resultsBox.querySelectorAll('.list-group-item');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentEmployeeSearchIndex++;
                if (currentEmployeeSearchIndex >= items.length) {
                    currentEmployeeSearchIndex = 0; // Loop to top
                }
                updateEmployeeSearchSelection(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentEmployeeSearchIndex--;
                if (currentEmployeeSearchIndex < 0) {
                    currentEmployeeSearchIndex = items.length - 1; // Loop to bottom
                }
                updateEmployeeSearchSelection(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                // Select highlighted, or default to first item if none highlighted
                const indexToSelect = (currentEmployeeSearchIndex >= 0) ? currentEmployeeSearchIndex : 0;
                if (resultsBox.matchedEmployees && resultsBox.matchedEmployees[indexToSelect]) {
                    selectEmployee(resultsBox.matchedEmployees[indexToSelect]);
                }
            } else if (e.key === 'Escape') {
                resultsBox.style.display = 'none';
                currentEmployeeSearchIndex = -1;
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.position-relative')) {
                resultsBox.style.display = 'none';
            }
        });
    }
});

function updateEmployeeSearchSelection(items) {
    items.forEach(item => item.classList.remove('active'));
    if (currentEmployeeSearchIndex >= 0 && currentEmployeeSearchIndex < items.length) {
        items[currentEmployeeSearchIndex].classList.add('active');
        items[currentEmployeeSearchIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function selectEmployee(emp) {
    const empInput = document.getElementById('employeeInput');
    const resultsBox = document.getElementById('employeeSearchResults');
    empInput.value = `${emp.code} - ${emp.name}`;
    empInput.dataset.id = emp._id;
    resultsBox.style.display = 'none';

    loadEmployeeDetails(emp._id);
}

function setDefaults() {
    document.getElementById('date').valueAsDate = new Date();
}

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        let res = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            res = await fetch('/api/v1/sub-branches', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }

        const json = await res.json();
        if (json.success && json.data) {
            const branchSelect = document.getElementById('branch');
            branchSelect.innerHTML = '<option value="">Select Branch</option>';

            const rawNames = json.data.map(item => (item.name || item.branchName || '').trim());
            const uniqueBranches = [...new Set(rawNames)].filter(n => n !== '').sort();

            uniqueBranches.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                branchSelect.appendChild(opt);
            });
        }
    } catch (err) { console.error('Error loading branches:', err); }
}

async function loadEmployees() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/employees', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            window.allEmployees = data.data;
        }
    } catch (error) {
        console.error('Error loading employees', error);
    }
}

async function loadEmployeeDetails(empId) {
    const id = empId || document.getElementById('employeeInput').dataset.id;
    if (!id) {
        clearForm(false);
        return;
    }

    const emp = window.allEmployees.find(e => e._id === id);
    if (emp) {
        document.getElementById('code').value = emp.code || '';
        document.getElementById('contact').value = emp.phone || emp.mobileNo || '';
        document.getElementById('department').value = emp.department?.name || emp.department || '';
        document.getElementById('designation').value = emp.designation?.name || emp.designation || '';
        document.getElementById('basicSalary').value = emp.basicSalary || emp.salary || 0;

        const token = localStorage.getItem('token');

        try {
            // Updated to fetch REAL-TIME Ledger Balance
            const ledgerRes = await fetch(`/api/v1/employee-ledger/balance/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const ledgerJson = await ledgerRes.json();
            if (ledgerJson.success) {
                document.getElementById('advance').value = ledgerJson.balance || 0;
            } else {
                document.getElementById('advance').value = 0;
            }
            document.getElementById('preBalance').value = 0; // Reset as not applicable in ledger view

        } catch (e) { console.error(e); }

        await findLatestPayroll(id);
    }
}

async function findLatestPayroll(employeeId) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/payrolls?employee=${employeeId}&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        const tbody = document.getElementById('payrollDetails');
        tbody.innerHTML = '';

        if (json.success && json.data.length > 0) {
            const p = json.data[0];
            const tr = document.createElement('tr');
            tr.dataset.payrollId = p._id;
            // Use grossTotal for Gross Column, not just earnings
            tr.innerHTML = `
                <td>${p._id.slice(-6)}</td>
                <td>${p.monthYear.split('-')[1]}</td>
                <td>${p.monthYear.split('-')[0]}</td>
                <td><input type="number" class="form-control form-control-sm row-gross" value="${p.grossTotal || 0}" readonly></td>
                <td><input type="number" class="form-control form-control-sm row-paid" value="${p.netTotal || 0}" readonly></td>
                <td><input type="number" class="form-control form-control-sm row-deduct" value="${p.deductionsTotal || 0}" readonly></td>
                <td><input type="text" class="form-control form-control-sm" value="Last Payroll"></td>
            `;
            tbody.appendChild(tr);

            document.getElementById('totalGross').value = p.grossTotal || 0;
            document.getElementById('totalPaid').value = p.netTotal || 0;
            document.getElementById('totalDeduction').value = p.deductionsTotal || 0;
        } else {
            // ... (keep existing else block)
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>N/A</td>
                <td>--</td>
                <td>--</td>
                <td><input type="number" class="form-control form-control-sm row-gross" id="rowGross" value="0"></td>
                <td><input type="number" class="form-control form-control-sm row-paid" id="rowPaid" value="0"></td>
                <td><input type="number" class="form-control form-control-sm row-deduct" id="rowDeduct" value="0"></td>
                <td><input type="text" class="form-control form-control-sm" value="No Payroll Found"></td>
            `;
            tbody.appendChild(tr);

            ['rowGross', 'rowPaid', 'rowDeduct'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', updateTotals);
            });
            updateTotals();
        }
    } catch (e) { console.error(e); }
}

// ... updateTotals ...

// Refactored Print Logic
// Refactored Print Logic
function printClearance() {
    const empName = document.getElementById('employeeInput').value;
    if (!empName) { alert("Please select an employee first."); return; }

    const gross = parseFloat(document.getElementById('totalGross').value) || 0;
    const net = parseFloat(document.getElementById('totalPaid').value) || 0; // Use System Net
    const advance = parseFloat(document.getElementById('advance').value) || 0;

    // Derive effective deduction for visual consistency on paper
    // This handles any discrepancies like double-counting ShortTime in Gross/Deductions
    const effectiveDeduction = gross - net;

    const data = {
        empName: empName.split('-')[1] || empName,
        code: document.getElementById('code').value,
        designation: document.getElementById('designation').value,
        department: document.getElementById('department').value,
        contact: document.getElementById('contact').value,
        date: document.getElementById('date').value,
        remarks: document.getElementById('remarks').value,
        advance: advance,
        gross: gross,
        deduction: effectiveDeduction,
        net: net
    };
    generatePrintWindow(data);
}


async function saveClearance() {
    const tbody = document.getElementById('payrollDetails');
    const firstRow = tbody.querySelector('tr');

    const data = {
        branch: document.getElementById('branch').value,
        employee: document.getElementById('employeeInput').dataset.id,
        date: document.getElementById('date').value,
        remarks: document.getElementById('remarks').value,
        payrollId: firstRow?.dataset?.payrollId || null,

        grossSalary: parseFloat(document.getElementById('totalGross').value) || 0,
        paid: parseFloat(document.getElementById('totalPaid').value) || 0,
        deduction: parseFloat(document.getElementById('totalDeduction').value) || 0,
        advance: parseFloat(document.getElementById('advance').value) || 0,
        preBalance: parseFloat(document.getElementById('preBalance').value) || 0
    };

    if (!data.employee || !data.branch) { alert("Select Branch and Employee"); return; }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/employee-clearances', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            alert("Clearance Saved");
            clearForm();
        } else {
            alert("Error: " + result.message);
        }
    } catch (err) {
        console.error(err);
    }
}

function clearForm(resetEmployee = true) {
    if (resetEmployee) {
        const empInput = document.getElementById('employeeInput');
        empInput.value = '';
        delete empInput.dataset.id;
        document.querySelectorAll('input').forEach(i => i.value = '');
        document.getElementById('payrollDetails').innerHTML = '';
    }
    setDefaults();
}

async function showList() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/employee-clearances', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        const tbody = document.getElementById('clearanceListBody');
        tbody.innerHTML = '';

        window.currentClearanceList = json.data;

        if (json.success) {
            json.data.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(c.date).toLocaleDateString()}</td>
                    <td>(${c.employee?.code || ''}) ${c.employee?.name || '--'}</td>
                    <td>${c.grossSalary}</td>
                    <td>${c.remarks || ''}</td>
                    <td>
                        <button class="btn btn-primary btn-sm me-1" onclick="printClearanceFromList('${c._id}')" title="Print"><i class="fas fa-print"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="deleteClearance('${c._id}')" title="Delete"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            const modal = new bootstrap.Modal(document.getElementById('clearanceListModal'));
            modal.show();
        }
    } catch (e) { console.error(e); }
}

async function deleteClearance(id) {
    if (!confirm("Delete this clearance?")) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employee-clearances/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('clearanceListModal')).hide();
            showList();
        }
    } catch (e) { console.error(e); }
}

function printClearanceFromList(id) {
    const c = window.currentClearanceList?.find(x => x._id === id);
    if (!c) return;

    const empFull = window.allEmployees?.find(e => e._id === (c.employee?._id || c.employee));

    // Ensure we use the Saved Net (paid) if available
    const gross = c.grossSalary || 0;
    const net = c.paid || 0;
    // If paid (Net) is less than Gross, the difference is the effective deduction
    // If paid is 0 (old data?), we might fall back to c.deduction, but that causes the negative number issue.
    // Ideally, c.paid should be correct.
    const effectiveDeduction = gross - net;

    const data = {
        empName: c.employee?.name || (empFull?.name || '--'),
        code: c.employee?.code || (empFull?.code || '--'),
        designation: empFull?.designation?.name || empFull?.designation || '--',
        department: empFull?.department?.name || empFull?.department || '--',
        contact: empFull?.phone || empFull?.mobileNo || '--',
        date: c.date,
        remarks: c.remarks,
        advance: c.advance || 0,
        gross: gross,
        deduction: effectiveDeduction,
        net: net
    };
    generatePrintWindow(data);
}

function generatePrintWindow(data) {
    const netSalary = data.net !== undefined ? data.net : (data.gross - data.deduction);
    const netPayable = netSalary - data.advance;
    const settlementLabel = netPayable >= 0 ? "Net Payable to Employee" : "Recoverable from Employee";
    const settlementAmount = Math.abs(netPayable);

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Clearance Certificate</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; }
                .container { width: 100%; max-width: 900px; margin: 0 auto; border: 2px solid #333; padding: 30px; position: relative; }
                .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { margin: 0; font-size: 32px; color: #2c5ba9; text-transform: uppercase; letter-spacing: 2px; }
                .header p { margin: 5px 0; color: #555; }
                .doc-title { text-align: center; font-size: 24px; font-weight: bold; text-decoration: underline; margin-bottom: 30px; }
                
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                .info-item { display: flex; border-bottom: 1px solid #ccc; padding: 5px 0; }
                .label { font-weight: bold; width: 140px; color: #333; }
                .value { font-weight: 500; color: #000; flex: 1; }

                .financials { margin-bottom: 40px; border: 1px solid #000; }
                .financials th { background: #f0f0f0; padding: 10px; border-bottom: 1px solid #000; text-align: left; }
                .financials td { padding: 10px; border-bottom: 1px solid #eee; }
                .total-row { background: #eee; font-weight: bold; font-size: 18px; }

                .signatures { display: flex; justify-content: space-between; margin-top: 100px; }
                .sig-box { text-align: center; width: 22%; }
                .sig-line { border-top: 1px solid #000; margin-bottom: 5px; }

                .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #777; }
                
                @media print {
                    .container { border: none; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Dwatson</h1>
                    <p>Islamabad | 051-5895662</p>
                    <p>Employee Clearance & Settlement Slip</p>
                </div>

                <div class="doc-title">Final Settlement Certificate</div>

                <div class="info-grid">
                    <div class="info-item"><span class="label">Employee Name:</span> <span class="value">${data.empName}</span></div>
                    <div class="info-item"><span class="label">Date:</span> <span class="value">${new Date(data.date).toLocaleDateString('en-GB')}</span></div>
                    <div class="info-item"><span class="label">Employee Code:</span> <span class="value">${data.code}</span></div>
                    <div class="info-item"><span class="label">Department:</span> <span class="value">${data.department}</span></div>
                    <div class="info-item"><span class="label">Designation:</span> <span class="value">${data.designation}</span></div>
                    <div class="info-item"><span class="label">Contact:</span> <span class="value">${data.contact}</span></div>
                </div>

                <table class="financials" width="100%" cellspacing="0">
                    <tr>
                        <th colspan="2">Financial Settlement Details</th>
                    </tr>
                    <tr>
                        <td>Last Month Gross Salary</td>
                        <td align="right">${data.gross.toLocaleString()} Rs</td>
                    </tr>
                    <tr>
                        <td>Less: Deductions</td>
                        <td align="right">(${data.deduction.toLocaleString()}) Rs</td>
                    </tr>
                    <tr style="background-color: #f9f9f9; font-weight: bold;">
                        <td>Net Salary Payable (A)</td>
                        <td align="right">${netSalary.toLocaleString()} Rs</td>
                    </tr>
                    <tr>
                        <td>Less: Outstanding Advance / Loan (B)</td>
                        <td align="right" style="color: red;">(${data.advance.toLocaleString()}) Rs</td>
                    </tr>
                    <tr class="total-row">
                        <td>${settlementLabel} (A - B)</td>
                        <td align="right">${settlementAmount.toLocaleString()} Rs</td>
                    </tr>
                </table>
                
                <div style="margin-bottom: 20px;">
                    <strong>Remarks:</strong> ${data.remarks || 'N/A'}
                </div>

                <div class="signatures">
                    <div class="sig-box"><div class="sig-line"></div><div>Employee Signature</div><div style="font-size:10px;">I accept this as full & final settlement</div></div>
                    <div class="sig-box"><div class="sig-line"></div><div>HR Manager</div></div>
                    <div class="sig-box"><div class="sig-line"></div><div>Accounts/Audit</div></div>
                    <div class="sig-box"><div class="sig-line"></div><div>CEO / Approval</div></div>
                </div>

                <div class="footer">
                    Printed on: ${new Date().toLocaleString()} | Generated by BAS Software
                </div>
            </div>
            <script>window.print();</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

