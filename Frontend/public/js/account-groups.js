document.addEventListener('DOMContentLoaded', () => {
    loadGroups();
    document.getElementById('searchInput').addEventListener('input', filterGroups);
});

async function loadGroups() {
    try {
        const response = await pageAccess.authenticatedFetch('/api/v1/accounts/groups');
        const data = await response.json();

        if (data.success) {
            renderTable(data.data);
        }
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

function renderTable(groups) {
    const tbody = document.getElementById('groupsBody');
    tbody.innerHTML = '';

    groups.forEach(group => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${group.id}</td>
            <td>${group.name}</td>
            <td>
                <button class="btn btn-sm btn-info py-0" onclick="editGroup('${group._id}', '${group.id}', '${group.name}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger py-0" onclick="deleteGroup('${group._id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveGroup() {
    const name = document.getElementById('groupName').value;
    const id = document.getElementById('groupCode').value;
    const editId = document.getElementById('groupId').value;

    if (!name || !id) {
        alert('Please enter Group Name and ID');
        return;
    }

    const payload = { id: parseInt(id), name };

    try {
        const url = editId ? `/api/v1/accounts/groups/${editId}` : '/api/v1/accounts/groups';
        const method = editId ? 'PUT' : 'POST';

        const response = await pageAccess.authenticatedFetch(url, {
            method: method,
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            alert('Group saved successfully');
            clearForm();
            loadGroups();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving group:', error);
    }
}

function editGroup(uid, id, name) {
    document.getElementById('groupId').value = uid;
    document.getElementById('groupCode').value = id;
    document.getElementById('groupName').value = name;
}

async function deleteGroup(id) {
    if (!confirm('Area you sure?')) return;

    try {
        const response = await pageAccess.authenticatedFetch(`/api/v1/accounts/groups/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) loadGroups();
        else alert(data.message);
    } catch (error) {
        console.error(error);
    }
}

function clearForm() {
    document.getElementById('groupId').value = '';
    document.getElementById('groupCode').value = '';
    document.getElementById('groupName').value = '';
}

function filterGroups(e) {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#groupsBody tr');

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

