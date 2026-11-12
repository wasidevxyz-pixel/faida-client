document.addEventListener('DOMContentLoaded', () => {
    loadGroups();
    loadCategories();
    document.getElementById('searchInput').addEventListener('input', filterCategories);
});

async function loadGroups() {
    try {
        const response = await pageAccess.authenticatedFetch('/api/v1/accounts/groups');
        const data = await response.json();

        const select = document.getElementById('groupSelect');
        select.innerHTML = '<option value="">Select Group</option>';

        if (data.success && data.data) {
            data.data.forEach(group => {
                const option = document.createElement('option');
                option.value = group._id;
                option.textContent = `${group.id} - ${group.name}`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

async function loadCategories() {
    try {
        const response = await pageAccess.authenticatedFetch('/api/v1/accounts/categories');
        const data = await response.json();

        if (data.success) {
            renderTable(data.data);
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

function renderTable(categories) {
    const tbody = document.getElementById('categoriesBody');
    tbody.innerHTML = '';

    categories.forEach(cat => {
        const tr = document.createElement('tr');
        const groupName = cat.group ? cat.group.name : 'N/A';
        tr.innerHTML = `
            <td>${cat.id}</td>
            <td>${groupName}</td>
            <td>${cat.name}</td>
            <td>
                <button class="btn btn-sm btn-info py-0" onclick="editCategory('${cat._id}', '${cat.id}', '${cat.name}', '${cat.group ? cat.group._id : ''}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger py-0" onclick="deleteCategory('${cat._id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveCategory() {
    const group = document.getElementById('groupSelect').value;
    const id = document.getElementById('catId').value;
    const name = document.getElementById('catName').value;
    const editId = document.getElementById('editId').value;

    if (!group || !id || !name) {
        alert('Please fill all fields');
        return;
    }

    const payload = {
        id: parseInt(id),
        name,
        group
    };

    try {
        const url = editId ? `/api/v1/accounts/categories/${editId}` : '/api/v1/accounts/categories';
        const method = editId ? 'PUT' : 'POST';

        const response = await pageAccess.authenticatedFetch(url, {
            method: method,
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            alert('Category saved successfully');
            clearForm();
            loadCategories();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving category:', error);
    }
}

function editCategory(uid, id, name, groupId) {
    document.getElementById('editId').value = uid;
    document.getElementById('catId').value = id;
    document.getElementById('catName').value = name;
    document.getElementById('groupSelect').value = groupId;
}

async function deleteCategory(id) {
    if (!confirm('Area you sure?')) return;

    try {
        const response = await pageAccess.authenticatedFetch(`/api/v1/accounts/categories/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) loadCategories();
        else alert(data.message);
    } catch (error) {
        console.error(error);
    }
}

function clearForm() {
    document.getElementById('editId').value = '';
    document.getElementById('catId').value = '';
    document.getElementById('catName').value = '';
    document.getElementById('groupSelect').value = '';
}

function filterCategories(e) {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#categoriesBody tr');

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

