// Global variable to store all banks for filtering
let allBanksData = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadBranches();

    document.getElementById('bankType').addEventListener('change', toggleDeptFields);
    document.getElementById('branch').addEventListener('change', onBranchChange);
    document.getElementById('searchInput').addEventListener('input', filterBanks);

    loadBanks();

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Alt + S for Save
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            saveBank();
        }
    });
});

// Handle branch change - filter bank list and load departments
function onBranchChange() {
    loadDepartments();
    filterBanksByBranch();
}

// Filter banks by selected branch
function filterBanksByBranch() {
    const selectedBranch = document.getElementById('branch').value;

    let visibleBanks;

    // If a branch is selected, show ALL banks for that branch (including Branch Bank type)
    if (selectedBranch) {
        visibleBanks = allBanksData.filter(b => b.branch === selectedBranch);
    } else {
        // When no branch selected, hide 'Branch Bank' type from general list
        visibleBanks = allBanksData.filter(b => b.bankType !== 'Branch Bank');
    }

    renderTable(visibleBanks);
}

function toggleDeptFields() {
    const type = document.getElementById('bankType').value;
    const div = document.getElementById('deptBankFields');
    if (type === 'Department Bank') {
        div.style.display = 'block';
        loadDepartments();
    } else {
        div.style.display = 'none';
        document.getElementById('department').value = '';
        document.getElementById('deduction').value = '';
    }
}

async function loadDepartments() {
    const type = document.getElementById('bankType').value;
    if (type !== 'Department Bank') return;

    try {
        const token = localStorage.getItem('token');
        const branch = document.getElementById('branch').value;
        if (!branch) return;

        const response = await fetch('/api/v1/departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const select = document.getElementById('department');
        // Save current selection if re-loading
        const currentVal = select.value;
        const currentText = select.options[select.selectedIndex]?.text;

        select.innerHTML = '<option value="">Select Department</option>';

        if (data.success) {
            const filtered = data.data
                .filter(d => d.branch === branch && d.isActive)
                .sort((a, b) => {
                    const codeA = parseInt(a.code) || 999999;
                    const codeB = parseInt(b.code) || 999999;
                    return codeA - codeB || a.name.localeCompare(b.name);
                });

            filtered.forEach(d => {
                // Filter: Hide specialized internal departments
                if (d.name === 'PERCENTAGE CASH' || d.name === 'CASH REC FROM COUNTER') return;

                // Filter: Hide if only 'Closing_2_Comp_Sale' is set
                if (d.closing2CompSale && !d.closing2DeptDropDown) return;

                const opt = document.createElement('option');
                opt.value = d._id;
                opt.text = d.name;
                select.appendChild(opt);
            });

            // Restore selection if possible, or matches
            if (currentVal && Array.from(select.options).some(o => o.value == currentVal)) {
                select.value = currentVal;
            }
        }
    } catch (e) { console.error(e); }
}

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            const select = document.getElementById('branch');
            const currentVal = select.value;
            select.innerHTML = '<option value="">Select Branch</option>'; // Clear default options
            data.data.forEach(store => {
                const option = document.createElement('option');
                option.value = store.name;
                option.textContent = store.name;
                select.appendChild(option);
            });
            // Auto Select if single branch
            if (data.data.length === 1) {
                select.value = data.data[0].name;
            }
        }
    } catch (e) {
        console.error('Error loading branches:', e);
    }
}

async function loadBanks() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/banks', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            // Store all banks globally for filtering
            allBanksData = data.data;

            // Apply branch filter
            filterBanksByBranch();
        }
    } catch (error) {
        console.error('Error loading banks:', error);
    }
}

function renderTable(banks) {
    const tbody = document.getElementById('banksBody');
    tbody.innerHTML = '';

    banks.forEach(bank => {
        const payrollBadge = bank.isPayrollBank
            ? `<span class="badge" style="background:#f59e0b; color:#fff; font-size:0.8rem;"><i class="fas fa-star me-1"></i>Payroll Bank</span>`
            : `<span class="text-muted small">-</span>`;

        const tr = document.createElement('tr');
        if (bank.isPayrollBank) tr.style.background = '#fffbf0';
        tr.innerHTML = `
            <td>${bank.branch}</td>
            <td>${bank.bankName}</td>
            <td>${bank.accountTitle}</td>
            <td>${bank.accountNo}</td>
            <td>${bank.phoneNo || '-'}</td>
            <td>${bank.isActive ? 'Active' : 'Inactive'}</td>
            <td class="text-center">${payrollBadge}</td>
            <td>
                <button class="btn btn-sm btn-info py-0" onclick="editBank('${bank._id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger py-0" onclick="deleteBank('${bank._id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.editBank = async function (id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/banks/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const bank = data.data;
            document.getElementById('bankId').value = bank._id;
            document.getElementById('bankType').value = bank.bankType;
            document.getElementById('bankName').value = bank.bankName;
            document.getElementById('accountTitle').value = bank.accountTitle;
            document.getElementById('accountNo').value = bank.accountNo;
            document.getElementById('phoneNo').value = bank.phoneNo || '';
            document.getElementById('mobileNo').value = bank.mobileNo || '';
            document.getElementById('branch').value = bank.branch || 'Shop';
            document.getElementById('isActive').checked = bank.isActive;
            document.getElementById('isPayrollBank').checked = bank.isPayrollBank || false;

            toggleDeptFields();
            if (bank.bankType === 'Department Bank') {
                await loadDepartments();
                document.getElementById('department').value = bank.department || '';
                document.getElementById('deduction').value = bank.deduction || '';
            }
        }
    } catch (error) {
        console.error('Error fetching bank:', error);
    }
};

async function saveBank() {
    const payload = {
        bankType: document.getElementById('bankType').value,
        bankName: document.getElementById('bankName').value,
        accountTitle: document.getElementById('accountTitle').value,
        accountNo: document.getElementById('accountNo').value,
        phoneNo: document.getElementById('phoneNo').value,
        mobileNo: document.getElementById('mobileNo').value,
        branch: document.getElementById('branch').value,
        department: document.getElementById('department').value || null,
        deduction: parseFloat(document.getElementById('deduction').value) || 0,
        isActive: document.getElementById('isActive').checked,
        isPayrollBank: document.getElementById('isPayrollBank').checked
    };

    const id = document.getElementById('bankId').value;

    if (!payload.bankName || !payload.accountNo) {
        alert('Bank Name and Account No are required');
        return;
    }

    try {
        const url = id ? `/api/v1/banks/${id}` : '/api/v1/banks';
        const method = id ? 'PUT' : 'POST';

        const token = localStorage.getItem('token');
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            alert('Bank saved successfully');
            clearForm();
            loadBanks();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving bank:', error);
    }
}

async function deleteBank(id) {
    if (!confirm('Are you sure?')) return;
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/banks/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) loadBanks();
        else alert(data.message);
    } catch (error) { console.error(error); }
}

function clearForm() {
    document.getElementById('bankId').value = '';
    document.getElementById('bankName').value = '';
    document.getElementById('accountTitle').value = '';
    document.getElementById('accountNo').value = '';
    document.getElementById('phoneNo').value = '';
    document.getElementById('mobileNo').value = '';
    document.getElementById('department').value = '';
    document.getElementById('deduction').value = '';
    document.getElementById('isPayrollBank').checked = false;
    document.getElementById('bankType').selectedIndex = 0;
    toggleDeptFields();
}

function filterBanks(e) {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#banksBody tr');
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
    });
}

