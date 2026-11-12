document.addEventListener('DOMContentLoaded', async () => {
    await loadBranches();
    await loadDepartments();

    document.getElementById('branch').addEventListener('change', () => {
        renderTable(allDepartments);
    });

    // Handle Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Alt + S for Save
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveDepartment();
        }
    });
});

let allDepartments = [];

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
            select.innerHTML = '<option value="">Select Branch</option>';
            data.data.forEach(store => {
                const option = document.createElement('option');
                option.value = store.name;
                option.textContent = store.name;
                select.appendChild(option);
            });

            // Preserve selection if valid
            if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
                select.value = currentVal;
            } else if (data.data.length === 1) {
                // Default to first ONLY if single branch
                select.value = data.data[0].name;
            }
        }
    } catch (e) {
        console.error('Error loading branches:', e);
    }
}

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            allDepartments = data.data;
            console.log('Loaded departments:', allDepartments.length);
            renderTable(allDepartments);

        }
    } catch (e) {
        console.error(e);
    }
}



function renderTable(departments) {
    if (!departments) return;
    const tbody = document.getElementById('deptTableBody');
    tbody.innerHTML = '';

    const branch = document.getElementById('branch').value;
    console.log('Filtering for branch:', branch);

    const filtered = branch ? departments.filter(d => d.branch === branch) : [];

    // Sort by Code (seq)
    filtered.sort((a, b) => {
        const codeA = parseInt(a.code) || 999999;
        const codeB = parseInt(b.code) || 999999;
        return codeA - codeB;
    });

    console.log('Found:', filtered.length);

    filtered.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.branch}</td>
            <td>${d.code || '-'}</td>
            <td>${d.name}</td>
            <td>${d.deduction}</td>
             <td>${d.isActive ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>'}</td>
            <td>
                <button class="btn btn-sm btn-info py-0" onclick="editDepartment('${d._id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger py-0" onclick="deleteDepartment('${d._id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveDepartment() {
    const id = document.getElementById('deptId').value;
    const payload = {
        branch: document.getElementById('branch').value,
        name: document.getElementById('name').value,
        code: document.getElementById('code').value,
        deduction: parseFloat(document.getElementById('deduction').value) || 0,
        targetSale01: parseFloat(document.getElementById('targetSale01').value) || 0,
        commission01: parseFloat(document.getElementById('commission01').value) || 0,
        targetSale02: parseFloat(document.getElementById('targetSale02').value) || 0,
        commission02: parseFloat(document.getElementById('commission02').value) || 0,
        combineDepSales: document.getElementById('combineDepSales').checked,
        openingForward: document.getElementById('openingForward').checked,
        receivingForward: document.getElementById('receivingForward').checked,
        bigCashForward: document.getElementById('bigCashForward').checked,
        deductUgSale: document.getElementById('deductUgSale').checked,
        deductOptSale: document.getElementById('deductOptSale').checked,
        deductUgSaleFromAllDep: document.getElementById('deductUgSaleFromAllDep').checked,
        closing: document.getElementById('closing').checked,
        isCashCounter: document.getElementById('isCashCounter').checked,

        closing2CompSale: document.getElementById('closing2CompSale').checked,
        closing2DeptDropDown: document.getElementById('closing2DeptDropDown').checked,
        isActive: document.getElementById('isActive').checked
    };

    if (!payload.name) { alert('Name is required'); return; }

    try {
        const token = localStorage.getItem('token');
        const url = id ? `/api/v1/departments/${id}` : '/api/v1/departments';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
            alert('Saved successfully');
            clearForm();
            loadDepartments();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (e) { console.error(e); }
}

async function editDepartment(id) {
    console.log('Editing department with ID:', id);
    if (!id || id === 'undefined') {
        alert('Error: Invalid Department ID');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const url = `/api/v1/departments/${id}`;
        console.log('Fetching:', url);

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Server status: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.success) {
            const d = data.data;
            document.getElementById('deptId').value = d._id;
            document.getElementById('branch').value = d.branch;
            document.getElementById('name').value = d.name;
            document.getElementById('code').value = d.code || '';
            document.getElementById('deduction').value = d.deduction;
            document.getElementById('targetSale01').value = d.targetSale01;
            document.getElementById('commission01').value = d.commission01;
            document.getElementById('targetSale02').value = d.targetSale02;
            document.getElementById('commission02').value = d.commission02;

            document.getElementById('combineDepSales').checked = d.combineDepSales;
            document.getElementById('openingForward').checked = d.openingForward;
            document.getElementById('receivingForward').checked = d.receivingForward;
            document.getElementById('bigCashForward').checked = d.bigCashForward;
            document.getElementById('deductUgSale').checked = d.deductUgSale;
            document.getElementById('deductOptSale').checked = d.deductOptSale;
            document.getElementById('deductUgSaleFromAllDep').checked = d.deductUgSaleFromAllDep;
            document.getElementById('closing').checked = d.closing;
            document.getElementById('isCashCounter').checked = d.isCashCounter || false;

            document.getElementById('closing2CompSale').checked = d.closing2CompSale || false;
            document.getElementById('closing2DeptDropDown').checked = d.closing2DeptDropDown || false;
            document.getElementById('isActive').checked = d.isActive;
        } else {
            alert('Error: ' + data.message);
        }
    } catch (e) {
        console.error('Fetch error:', e);
        alert('Failed to load department details: ' + e.message);
    }
}

async function deleteDepartment(id) {
    if (!confirm('Are you sure?')) return;
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/departments/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) loadDepartments();
        else alert(data.message);
    } catch (e) { console.error(e); }
}

function clearForm() {
    document.getElementById('deptId').value = '';
    document.getElementById('name').value = '';
    document.getElementById('code').value = '';

    document.querySelectorAll('input[type=number]').forEach(i => i.value = '0');
    document.querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false);
    document.getElementById('isActive').checked = true;
}

