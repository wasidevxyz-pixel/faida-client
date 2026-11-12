let employees = [];
let pendingAction = null;
let pendingId = null;

document.addEventListener('DOMContentLoaded', () => {
    loadBranches();
    loadEmployees();
    document.getElementById('date').valueAsDate = new Date();
    loadPenalties();

    document.getElementById('employee').addEventListener('change', autoFillEmployeeDetails);
    document.getElementById('date').addEventListener('change', loadPenalties);

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            savePenalty();
        }
    });
});

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        let response = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            response = await fetch('/api/v1/sub-branches', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }

        const data = await response.json();
        if (data.success && data.data) {
            const branchSelect = document.getElementById('branch');
            branchSelect.innerHTML = '<option value="">Select Branch</option>';

            const rawNames = data.data.map(item => (item.name || item.branchName || '').trim());
            const uniqueBranches = [...new Set(rawNames)].filter(n => n !== '').sort();

            uniqueBranches.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                branchSelect.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

async function loadEmployees() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/employees', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            window.allEmployees = data.data; // Cache for details
            const select = document.getElementById('employee');
            data.data.forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp._id;
                opt.textContent = emp.name;
                select.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Error loading employees', error);
    }
}

function autoFillEmployeeDetails() {
    const id = document.getElementById('employee').value;
    const emp = window.allEmployees.find(e => e._id === id);
    if (emp) {
        document.getElementById('code').value = emp.code || '';
        document.getElementById('department').value = emp.department?.name || emp.department || '';
        document.getElementById('designation').value = emp.designation?.name || emp.designation || '';
    } else {
        document.getElementById('code').value = '';
        document.getElementById('department').value = '';
        document.getElementById('designation').value = '';
    }
}

async function savePenalty() {
    const id = document.getElementById('penaltyId').value;
    const data = {
        date: document.getElementById('date').value,
        branch: document.getElementById('branch').value,
        employee: document.getElementById('employee').value,
        designation: document.getElementById('designation').value,
        penaltyAmount: document.getElementById('penaltyAmount').value
    };

    if (!data.employee || !data.penaltyAmount) {
        alert("Please fill required fields");
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const url = id ? `/api/v1/employee-penalties/${id}` : '/api/v1/employee-penalties';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            alert(id ? 'Penalty updated!' : 'Penalty saved!');
            clearForm();
            loadPenalties();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        console.error('Error saving penalty:', error);
    }
}

async function loadPenalties() {
    try {
        const dateVal = document.getElementById('date').value;
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/employee-penalties?date=${dateVal}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const list = document.getElementById('penaltyList');
        list.innerHTML = '';

        if (data.success) {
            window.allPenalties = data.data; // Cache for editing

            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const rights = user.rights || {};
            const permissions = user.permissions || [];
            // Strictly check mod_13 (Allow Employee Penalty Modification) even for admins
            const canModify = rights['mod_13'] || permissions.includes('mod_13');

            data.data.forEach(p => {
                const tr = document.createElement('tr');
                if (p.isPosted) {
                    tr.style.backgroundColor = '#e8f5e9'; // Light green highlight
                    tr.title = "This penalty is included in a saved payroll and cannot be modified.";
                }

                tr.innerHTML = `
                    <td>${new Date(p.date).toLocaleDateString()}</td>
                    <td>${p.employee?.code || 'N/A'}</td>
                    <td>${p.employee?.name || 'N/A'}</td>
                    <td>${p.department?.name || p.department || '-'}</td>
                    <td>${p.designation || '-'}</td>
                    <td>${p.penaltyAmount}</td>
                    <td>
                        ${canModify ? `
                        <button class="btn btn-warning btn-sm" onclick="initiateEdit('${p._id}')" ${p.isPosted ? 'disabled' : ''}>
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="initiateDelete('${p._id}')" ${p.isPosted ? 'disabled' : ''}>
                            <i class="fas fa-trash"></i>
                        </button>
                        ` : ''}
                    </td>
                `;
                list.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error loading penalties', error);
    }
}

function editPenalty(id) {
    const penalty = window.allPenalties.find(p => p._id === id);
    if (penalty) {
        document.getElementById('penaltyId').value = penalty._id;
        document.getElementById('date').value = penalty.date.split('T')[0];
        document.getElementById('branch').value = penalty.branch;
        document.getElementById('employee').value = penalty.employee?._id || penalty.employee;

        // Trigger autofill for code, dept, desig
        autoFillEmployeeDetails();

        document.getElementById('penaltyAmount').value = penalty.penaltyAmount;
    }
}

function clearForm() {
    document.getElementById('penaltyId').value = '';
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('branch').value = '';
    document.getElementById('employee').value = '';
    document.getElementById('code').value = '';
    document.getElementById('department').value = '';
    document.getElementById('designation').value = '';
    document.getElementById('penaltyAmount').value = '';
}

async function deletePenalty(id) {
    if (!confirm('Are you sure?')) return;
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/employee-penalties/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) loadPenalties();
    } catch (err) { console.error(err); }
}

function searchPenalties() {
    const filter = document.getElementById('search').value.toUpperCase();
    const rows = document.getElementById('penaltyList').getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const text = rows[i].textContent || rows[i].innerText;
        if (text.toUpperCase().indexOf(filter) > -1) {
            rows[i].style.display = "";
        } else {
            rows[i].style.display = "none";
        }
    }
}

// Security & Password Verification
function initiateEdit(id) {
    pendingAction = 'edit';
    pendingId = id;
    document.getElementById('authPassword').value = '';
    new bootstrap.Modal(document.getElementById('authModal')).show();
    setTimeout(() => document.getElementById('authPassword').focus(), 500);
}

function initiateDelete(id) {
    pendingAction = 'delete';
    pendingId = id;
    document.getElementById('authPassword').value = '';
    new bootstrap.Modal(document.getElementById('authModal')).show();
    setTimeout(() => document.getElementById('authPassword').focus(), 500);
}

async function confirmModification() {
    const password = document.getElementById('authPassword').value;
    if (!password) {
        alert('Please enter password');
        return;
    }

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    try {
        const verifyRes = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: password })
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.token) {
            alert('Invalid Password');
            return;
        }

        const currentUser = verifyData.user || user;
        const currentRights = currentUser.rights || {};
        const currentPerms = currentUser.permissions || [];
        const hasRight = currentRights['mod_13'] || currentPerms.includes('mod_13');

        if (!hasRight) {
            alert('Access Denied: You do not have Employee Penalty Modification rights.');
            return;
        }

        const modalEl = document.getElementById('authModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        if (pendingAction === 'edit') {
            executeEdit(pendingId);
        } else if (pendingAction === 'delete') {
            if (confirm('Are you sure you want to delete this penalty?')) {
                executeDelete(pendingId);
            }
        }
    } catch (e) {
        console.error('Password verification error:', e);
        alert('Error verifying permissions');
    }
}

function executeEdit(id) {
    const penalty = window.allPenalties.find(p => p._id === id);
    if (penalty) {
        document.getElementById('penaltyId').value = penalty._id;
        document.getElementById('date').value = penalty.date.split('T')[0];
        document.getElementById('branch').value = penalty.branch;
        document.getElementById('employee').value = penalty.employee?._id || penalty.employee;
        autoFillEmployeeDetails();
        document.getElementById('penaltyAmount').value = penalty.penaltyAmount;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

async function executeDelete(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/employee-penalties/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            alert('Penalty deleted successfully');
            loadPenalties();
        } else {
            const data = await response.json();
            alert('Error: ' + data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to delete penalty');
    }
}

