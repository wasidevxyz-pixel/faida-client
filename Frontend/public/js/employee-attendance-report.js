document.addEventListener('DOMContentLoaded', async () => {
    // Set default dates (Today)
    const now = new Date();
    document.getElementById('filterFrom').valueAsDate = now;
    document.getElementById('filterTo').valueAsDate = now;

    // Load Dropdowns
    await loadBranches();
    await loadDepartments();

    // Initialize Select2 for Employee
    $('#filterEmployee').select2({
        theme: "bootstrap-5",
        placeholder: "Select Employee",
        allowClear: true
    });

    // Initial load of all active employees
    await loadEmployees();

    // Reload employees when branch changes
    document.getElementById('filterBranch').addEventListener('change', () => loadEmployees());
    document.getElementById('filterDept').addEventListener('change', () => loadEmployees());
});

async function loadBranches() {
    try {
        const uniqueBranches = await window.getGlobalBranches();
        if (uniqueBranches.length > 0) {
            const sel = document.getElementById('filterBranch');
            sel.innerHTML = '<option value="">Select Branch</option>';
            uniqueBranches.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading branches', e); }
}

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const data = await window.cachedFetch('/api/v1/employee-departments', { headers: { 'Authorization': `Bearer ${token}` } });
        if (data.success) {
            const sel = document.getElementById('filterDept');
            sel.innerHTML = '<option value="">Select Department</option>';
            data.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading departments', e); }
}

async function loadEmployees() {
    const branch = document.getElementById('filterBranch').value;
    const dept = document.getElementById('filterDept').value;

    try {
        const token = localStorage.getItem('token');
        let url = '/api/v1/employees?isActive=true';
        if (branch) url += `&branch=${encodeURIComponent(branch)}`;
        if (dept) url += `&department=${dept}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();

        const sel = $('#filterEmployee');
        sel.empty().append('<option value="">Select Employee</option>'); // Clear existing

        if (data.success) {
            data.data.forEach(e => {
                const opt = new Option(`${e.name} (${e.code})`, e._id, false, false);
                sel.append(opt);
            });
        }
    } catch (e) { console.error('Error loading employees', e); }
}

function generateReport() {
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    const branch = document.getElementById('filterBranch').value;
    const dept = document.getElementById('filterDept').value;
    const code = document.getElementById('filterCode').value;
    const employee = $('#filterEmployee').val();
    const orderByCheckIn = document.getElementById('checkOrder').checked;

    if (!from || !to) {
        alert("Please select valid From and To dates. Make sure the dates are correctly formatted and exist.");
        return;
    }

    const params = new URLSearchParams();
    params.append('from', from);
    params.append('to', to);
    if (branch) params.append('branch', branch);
    if (dept) params.append('department', dept);
    if (code) params.append('code', code);
    if (employee) params.append('employee', employee);
    if (orderByCheckIn) params.append('orderByCheckIn', 'true');

    window.open(`/print-employee-attendance-report?${params.toString()}`, '_blank');
}

