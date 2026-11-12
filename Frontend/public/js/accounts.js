document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
    loadAccounts();
    document.getElementById('searchInput').addEventListener('input', filterAccounts);
});

async function loadCategories() {
    try {
        const response = await pageAccess.authenticatedFetch('/api/v1/accounts/categories');
        const data = await response.json();
        const select = document.getElementById('accountCategory');

        select.innerHTML = '<option value="">Select Category</option>';
        if (data.success && data.data) {
            data.data.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat._id;
                option.textContent = `${cat.name} (${cat.group.name})`;
                select.appendChild(option);
            });
        }
    } catch (e) { console.error(e); }
}

async function loadAccounts() {
    try {
        const response = await pageAccess.authenticatedFetch('/api/v1/accounts/ledger');
        const data = await response.json();

        if (data.success) {
            renderTable(data.data);
        }
    } catch (e) { console.error(e); }
}

function renderTable(accounts) {
    const tbody = document.getElementById('accountsBody');
    tbody.innerHTML = '';

    accounts.forEach(acc => {
        const tr = document.createElement('tr');
        const catName = acc.category ? acc.category.name : '';
        tr.innerHTML = `
            <td>${acc.accountId}</td>
            <td>${acc.name}</td>
            <td>${acc.class}</td>
            <td>${catName}</td>
            <td>${acc.branch}</td>
            <td>
                <button class="btn btn-sm btn-info py-0" onclick="editAccount('${acc._id}', '${acc.accountId}', '${acc.name}', '${acc.class}', '${acc.category?._id}', '${acc.branch}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger py-0" onclick="deleteAccount('${acc._id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveAccount() {
    const editUid = document.getElementById('editUid').value;
    const accountId = document.getElementById('accountId').value;
    const name = document.getElementById('accountName').value;
    const cls = document.getElementById('accountClass').value;
    const category = document.getElementById('accountCategory').value;
    const branch = document.getElementById('branch').value;

    if (!accountId || !name || !cls || !category) {
        alert('Please fill all required fields');
        return;
    }

    const payload = { accountId, name, class: cls, category, branch };

    try {
        const url = editUid ? `/api/v1/accounts/ledger/${editUid}` : '/api/v1/accounts/ledger';
        const method = editUid ? 'PUT' : 'POST';

        const response = await pageAccess.authenticatedFetch(url, {
            method,
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
            alert('Account saved');
            clearForm();
            loadAccounts();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (e) { console.error(e); }
}

function editAccount(uid, id, name, cls, cat, br) {
    document.getElementById('editUid').value = uid;
    document.getElementById('accountId').value = id;
    document.getElementById('accountName').value = name;
    document.getElementById('accountClass').value = cls;
    document.getElementById('accountCategory').value = cat;
    document.getElementById('branch').value = br;
}

async function deleteAccount(id) {
    if (!confirm('Are you sure?')) return;
    try {
        const response = await pageAccess.authenticatedFetch(`/api/v1/accounts/ledger/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) loadAccounts();
        else alert(data.message);
    } catch (e) { console.error(e); }
}

function clearForm() {
    document.getElementById('editUid').value = '';
    document.getElementById('accountId').value = '';
    document.getElementById('accountName').value = '';
    document.getElementById('accountClass').value = '';
    document.getElementById('accountCategory').value = '';
}

function filterAccounts(e) {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#accountsBody tr');
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
    });
}

