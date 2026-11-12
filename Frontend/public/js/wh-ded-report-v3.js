document.addEventListener('DOMContentLoaded', async () => {
    setDefaultMonths();
    await initFilters();
    document.getElementById('branchSelect')?.addEventListener('change', syncLatestMonthForBranch);
    await syncLatestMonthForBranch();
});

function setDefaultMonths() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const fromMonth = document.getElementById('fromMonth');
    const toMonth = document.getElementById('toMonth');
    if (fromMonth && !fromMonth.value) fromMonth.value = currentMonth;
    if (toMonth && !toMonth.value) toMonth.value = currentMonth;
}

async function syncLatestMonthForBranch() {
    const branch = document.getElementById('branchSelect')?.value;
    if (!branch) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(
            `/api/v1/employees/reports/wh-ded-report?branch=${encodeURIComponent(branch)}&metaOnly=true`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const result = await res.json();
        if (result.success && result.monthYear) {
            const fromMonth = document.getElementById('fromMonth');
            const toMonth = document.getElementById('toMonth');
            if (fromMonth) fromMonth.value = result.monthYear;
            if (toMonth) toMonth.value = result.monthYear;
        }
    } catch (error) {
        console.error('Error syncing latest month:', error);
    }
}

async function initFilters() {
    try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        await window.populateBranchSelect('branchSelect', { placeholder: 'Select Branch' });

        const deptRes = await fetch('/api/v1/employee-departments', { headers });
        const deptData = await deptRes.json();
        const deptSelect = document.getElementById('deptSelect');
        if (deptData.success) {
            deptData.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                deptSelect.appendChild(opt);
            });
        }

        const desigRes = await fetch('/api/v1/designations', { headers });
        const desigData = await desigRes.json();
        const desigSelect = document.getElementById('desigSelect');
        if (desigData.success) {
            desigData.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                desigSelect.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Error initializing filters:', error);
    }
}

async function loadReport() {
    const tableBody = document.getElementById('reportTableBody');
    const tableFoot = document.getElementById('reportTableFoot');

    const branch = document.getElementById('branchSelect').value;
    if (!branch) {
        alert('Please select a branch first.');
        return;
    }

    const fromMonthEl = document.getElementById('fromMonth');
    const toMonthEl = document.getElementById('toMonth');
    if (!fromMonthEl?.value || !toMonthEl?.value) {
        setDefaultMonths();
    }

    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Generating report...</p></td></tr>';
    tableFoot.innerHTML = '';

    try {
        const department = document.getElementById('deptSelect').value;
        const designation = document.getElementById('desigSelect').value;
        const isActive = document.getElementById('activeOnlyCheck').checked;
        const hasDeduction = document.getElementById('hasDeductionCheck').checked;
        const fromMonth = fromMonthEl ? fromMonthEl.value : '';
        const toMonth = toMonthEl ? toMonthEl.value : '';

        const token = localStorage.getItem('token');
        let url = `/api/v1/employees/reports/wh-ded-report?branch=${encodeURIComponent(branch)}`;
        if (department) url += `&department=${department}`;
        if (designation) url += `&designation=${designation}`;
        if (isActive) url += `&isActive=true`;
        if (hasDeduction) url += `&hasDeduction=true`;
        if (fromMonth) url += `&fromMonth=${fromMonth}`;
        if (toMonth) url += `&toMonth=${toMonth}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();

        if (result.success && result.data.length > 0) {
            let html = '';
            let totalNet = 0;
            let totalWHT = 0;
            let totalBankPaid = 0;

            result.data.forEach((emp, index) => {
                const netTotal = emp.netTotal || 0;
                const wht = emp.whtDeduction || 0;
                const bankPaid = emp.bankPaid || 0;

                totalNet += netTotal;
                totalWHT += wht;
                totalBankPaid += bankPaid;

                html += `
                    <tr>
                        <td class="text-center">${index + 1}</td>
                        <td class="fw-bold">${emp.name || '-'}</td>
                        <td>${emp.cnic || '-'}</td>
                        <td class="text-center">${netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td class="text-center text-danger">${wht.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td class="text-center fw-bold text-primary">${bankPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                `;
            });

            tableBody.innerHTML = html;
            tableFoot.innerHTML = `
                <tr class="table-dark fw-bold">
                    <td colspan="3" class="text-end pe-3">TOTALS:</td>
                    <td class="text-center">${totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td class="text-center text-danger">${totalWHT.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td class="text-center text-warning">${totalBankPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No employees found matching these filters.</td></tr>';
        }
    } catch (error) {
        console.error('Error loading report:', error);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Error loading report data. Please try again.</td></tr>';
    }
}
