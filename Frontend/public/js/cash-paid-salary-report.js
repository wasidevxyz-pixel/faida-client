// Cash Paid Salary Report Logic
document.addEventListener('DOMContentLoaded', () => {
    // Set Default Month
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    document.getElementById('monthFilter').value = `${year}-${month}`;

    loadFilters();
    setupSearch();
    setupMultiSelect();
    updateUserHeader();
});

function updateUserHeader() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.name) {
        document.getElementById('userNameHeader').textContent = user.name;
    }
}

async function loadFilters() {
    try {
        // Load Branches
        let branchRes = await window.pageAccess.authenticatedFetch('/api/v1/stores');
        if (!branchRes.ok) branchRes = await window.pageAccess.authenticatedFetch('/api/v1/sub-branches');
        const branchData = await branchRes.json();

        const branchCheckboxList = document.getElementById('branchCheckboxList');
        const branchTitleSelect = document.getElementById('branchTitleFilter');

        if (branchData.success && branchData.data) {
            const rawNames = branchData.data.map(item => (item.name || item.branchName || '').trim());
            const uniqueBranches = [...new Set(rawNames)].filter(n => n !== '').sort();

            uniqueBranches.forEach(name => {
                // Populate Multi-select Checkboxes
                const item = document.createElement('div');
                item.className = 'multi-select-item';
                item.innerHTML = `
                    <input type="checkbox" value="${name}" id="branch_${name.replace(/\s+/g, '_')}">
                    <label for="branch_${name.replace(/\s+/g, '_')}" style="margin:0; font-weight:normal; cursor:pointer;">(${name})</label>
                `;
                branchCheckboxList.appendChild(item);

                // Populate Branch Title Select
                const opt = document.createElement('option');
                opt.value = `(${name})`;
                opt.textContent = `(${name})`;
                branchTitleSelect.appendChild(opt);

                // Add event listener to checkbox
                item.querySelector('input').addEventListener('change', updateSelectedBranches);
            });
        }

        // Load Departments
        const deptRes = await window.pageAccess.authenticatedFetch('/api/v1/employee-departments');
        const deptData = await deptRes.json();
        const deptSelect = document.getElementById('deptFilter');
        if (deptData.success && deptData.data) {
            deptData.data.sort((a, b) => a.name.localeCompare(b.name)).forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                deptSelect.appendChild(opt);
            });
        }

        // Load Designations
        const desigRes = await window.pageAccess.authenticatedFetch('/api/v1/designations');
        const desigData = await desigRes.json();
        const desigSelect = document.getElementById('desigFilter');
        if (desigData.success && desigData.data) {
            desigData.data.sort((a, b) => a.name.localeCompare(b.name)).forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                desigSelect.appendChild(opt);
            });
        }

        // Load Employees for search (Include Inactive for historical reporting)
        const empRes = await window.pageAccess.authenticatedFetch('/api/v1/employees?limit=3000&isActive=all');
        const empData = await empRes.json();
        if (empData.success && empData.data) {
            window.allEmployees = empData.data;
        }

    } catch (err) { console.error('Error loading filters:', err); }
}

function setupMultiSelect() {
    const btn = document.getElementById('branchMultiSelectBtn');
    const dropdown = document.getElementById('branchMultiSelectDropdown');
    const searchInput = document.getElementById('searchBranch');
    const selectAll = document.getElementById('selectAllBranch');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btn) {
            dropdown.style.display = 'none';
        }
    });

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.multi-select-item');
        items.forEach(item => {
            const text = item.innerText.toLowerCase();
            item.style.display = text.includes(val) ? 'flex' : 'none';
        });
    });

    selectAll.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#branchCheckboxList input');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        updateSelectedBranches();
    });
}

function updateSelectedBranches() {
    const checkboxes = document.querySelectorAll('#branchCheckboxList input:checked');
    const selected = Array.from(checkboxes).map(cb => cb.value);
    const hiddenInput = document.getElementById('selectedBranches');
    const btnText = document.getElementById('selectedBranchesText');

    if (selected.length === 0) {
        hiddenInput.value = 'All Branches';
        btnText.textContent = 'All Branches';
    } else if (selected.length === document.querySelectorAll('#branchCheckboxList input').length) {
        hiddenInput.value = 'All Branches';
        btnText.textContent = 'All Branches';
    } else {
        hiddenInput.value = selected.join(',');
        btnText.textContent = selected.length === 1 ? `(${selected[0]})` : `${selected.length} Branches Selected`;
    }
}

function setupSearch() {
    const searchInput = document.getElementById('empSearch');
    const suggestionsBox = document.getElementById('suggestionsBox');

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (!val || !window.allEmployees) {
            suggestionsBox.style.display = 'none';
            document.getElementById('selectedEmpId').value = '';
            return;
        }

        const filtered = window.allEmployees.filter(emp =>
            emp.name.toLowerCase().includes(val) ||
            emp.code.toLowerCase().includes(val)
        ).slice(0, 10);

        if (filtered.length > 0) {
            suggestionsBox.innerHTML = filtered.map(emp => `
                <div class="suggestion-item" onclick="selectEmployee('${emp._id}', '${emp.code} - ${emp.name}')">
                    <strong>${emp.code}</strong> - ${emp.name}
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target)) suggestionsBox.style.display = 'none';
    });
}

function selectEmployee(id, text) {
    document.getElementById('empSearch').value = text.split(' - ')[1];
    document.getElementById('selectedEmpId').value = id;
    document.getElementById('suggestionsBox').style.display = 'none';
}

async function generateReport() {
    const area = document.getElementById('reportArea');
    area.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Fetching report data...</p></div>';

    try {
        const params = new URLSearchParams({
            month: document.getElementById('monthFilter').value,
            branches: document.getElementById('selectedBranches').value,
            code: document.getElementById('codeSearch').value,
            employeeId: document.getElementById('selectedEmpId').value,
            department: document.getElementById('deptFilter').value,
            designation: document.getElementById('desigFilter').value,
            paidStatus: document.getElementById('paidStatusFilter').value
        });

        const res = await window.pageAccess.authenticatedFetch(`/api/v1/salary-reports/cash-paid?${params}`);
        const data = await res.json();

        if (!data.success || !data.data || data.data.length === 0) {
            area.innerHTML = '<div class="alert alert-info m-4">No payroll data found for selected criteria.</div>';
            return;
        }

        renderReport(data.data);
    } catch (err) {
        console.error(err);
        area.innerHTML = '<div class="alert alert-danger m-4">Error generating report: ' + err.message + '</div>';
    }
}

function renderReport(data) {
    const area = document.getElementById('reportArea');
    const today = new Date();
    const branchTitle = document.getElementById('branchTitleFilter').value || '(All Branches)';

    const advancePaidData = data.filter(item => item.payAdvSalary === true);
    const regularCashPaidData = data.filter(item => item.payAdvSalary !== true);

    let html = `
        <div class="print-header text-center mb-4 d-none d-print-block">
            <h2 class="fw-bold mb-1">Dwatsons</h2>
            <h4 class="mb-1">Cash Paid Salary Details</h4>
            <p class="mb-0 text-muted">Report Date: ${today.toLocaleDateString('en-GB')}</p>
            <div class="mt-2 fw-bold">${branchTitle}</div>
        </div>
    `;

    const createTable = (tableData, title) => {
        if (tableData.length === 0) return '';
        
        let tableHtml = `
            <div class="table-container mb-5">
                <h5 class="fw-bold px-3 py-2 bg-light border-start border-4 border-primary mb-0">${title}</h5>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 50px;">Sr #</th>
                            <th>Employee_Name</th>
                            <th>Department_Name</th>
                            <th>Designation</th>
                            <th>Salary Status</th>
                            <th class="amount-col">Cash_Paid</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let totalAmount = 0;
        tableData.forEach((item, idx) => {
            totalAmount += item.cashPaid;
            tableHtml += `
                <tr>
                    <td class="text-center">${idx + 1}</td>
                    <td class="fw-medium">${item.name}</td>
                    <td>${item.department}</td>
                    <td>${item.designation}</td>
                    <td class="text-center">${item.salaryStatus}</td>
                    <td class="amount-col fw-bold">${item.cashPaid.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                    <tfoot>
                        <tr class="sub-total-row">
                            <td colspan="5" class="text-end">Sub Total</td>
                            <td class="amount-col">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        return { html: tableHtml, total: totalAmount };
    };

    const cashTable = createTable(regularCashPaidData, 'CASH PAID EMPLOYEES');
    const advanceTable = createTable(advancePaidData, 'ADVANCE PAID EMPLOYEES');

    html += cashTable.html;
    html += advanceTable.html;

    const grandTotal = (cashTable.total || 0) + (advanceTable.total || 0);

    html += `
        <div class="mt-4 px-3">
            <table class="data-table">
                <tfoot>
                    <tr class="grand-total-row">
                        <td colspan="5" class="text-end" style="width: 80%;">Grand Total (Cash + Advance)</td>
                        <td class="amount-col">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    html += `
        <!-- Signature Section -->
        <div class="d-none d-print-block mt-5 pt-4">
            <div class="row" style="margin-top: 50px;">
                <div class="col-4">
                    <div style="border-top: 1px solid black; padding-top: 5px; text-align: center;">
                        <strong>Prepared By</strong>
                    </div>
                </div>
                <div class="col-4">
                    <div style="border-top: 1px solid black; padding-top: 5px; text-align: center;">
                        <strong>Checked By</strong>
                    </div>
                </div>
                <div class="col-4">
                    <div style="border-top: 1px solid black; padding-top: 5px; text-align: center;">
                        <strong>Authorized Signatory</strong>
                    </div>
                </div>
            </div>
        </div>
    `;

    area.innerHTML = html;

    // Handle CSV Export if checked
    if (document.getElementById('exportCsv').checked) {
        exportToCSV(data);
    }
}

function exportToCSV(data) {
    if (!data || data.length === 0) return;

    const headers = ['Sr #', 'Employee Name', 'Department', 'Designation', 'Salary Status', 'Cash Paid'];
    const rows = data.map((item, idx) => [
        idx + 1,
        `"${item.name}"`,
        `"${item.department}"`,
        `"${item.designation}"`,
        `"${item.salaryStatus}"`,
        item.cashPaid
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const month = document.getElementById('monthFilter').value;
    link.setAttribute('href', url);
    link.setAttribute('download', `Cash_Paid_Salary_${month}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function printReport() {
    window.print();
}

