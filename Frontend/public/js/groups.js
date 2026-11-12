// User Groups - Behavioral Logic
let allGroups = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchGroups();

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            saveGroup();
        }
    });
});

async function fetchGroups() {
    try {
        const response = await fetch('/api/v1/groups', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            allGroups = result.data;
            renderGroupsTable();
        }
    } catch (error) {
        console.error('Error fetching groups:', error);
    }
}

function renderGroupsTable() {
    const tbody = document.getElementById('groupsTableBody');
    tbody.innerHTML = allGroups.map(group => `
        <tr>
            <td>${group.name}</td>
            <td>${group.isActive !== false ? 'true' : 'false'}</td>
            <td>
                <button class="btn btn-bas-edit" onclick="editGroup('${group._id}')">
                    <i class="fas fa-edit me-1"></i>Edit
                </button>
            </td>
        </tr>
    `).join('');
}

function editGroup(id) {
    const group = allGroups.find(g => g._id === id);
    if (!group) return;

    document.getElementById('groupId').value = group._id;
    document.getElementById('groupName').value = group.name;
    document.getElementById('groupActive').checked = group.isActive !== false;

    // Reset all checkboxes first
    document.querySelectorAll('#permissionsTree input[type="checkbox"]').forEach(cb => cb.checked = false);

    // Apply rights
    if (group.rights) {
        Object.keys(group.rights).forEach(key => {
            const cb = document.getElementById(key);
            if (cb) cb.checked = group.rights[key];
        });
    }
}

async function saveGroup() {
    const saveBtn = document.querySelector('button[onclick="saveGroup()"]');
    const originalText = saveBtn.innerText;

    const id = document.getElementById('groupId').value;
    const name = document.getElementById('groupName').value;
    const isActive = document.getElementById('groupActive').checked;

    if (!name) {
        alert('Please enter group name');
        return;
    }

    // Set loading state
    saveBtn.disabled = true;
    saveBtn.innerText = 'Saving...';

    // Collect Rights
    const rights = {};
    document.querySelectorAll('#permissionsTree input[type="checkbox"]').forEach(cb => {
        // Only collect leaves or specifically named keys
        // Use checked OR indeterminate (for parents with partial selection)
        if (cb.checked) {
            rights[cb.id] = true;

            // Recursively ensure all parent levels are also marked as true
            let parent = cb.closest('ul')?.closest('li')?.querySelector('input[type="checkbox"]');
            while (parent && parent.id) {
                rights[parent.id] = true;
                parent = parent.closest('ul')?.closest('li')?.querySelector('input[type="checkbox"]');
            }
        }
    });

    const data = {
        name,
        isActive,
        rights,
        // If it's the admin category or has admin in name
        isAdmin: rights['admin'] || name.toLowerCase().includes('admin')
    };

    try {
        const url = id ? `/api/v1/groups/${id}` : '/api/v1/groups';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            alert('Group saved successfully');
            resetForm();
            fetchGroups();
        } else {
            alert(result.error || 'Failed to save group');
        }
    } catch (error) {
        console.error('Error saving group:', error);
        alert('An error occurred while saving.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = originalText;
    }
}

function resetForm() {
    document.getElementById('groupId').value = '';
    document.getElementById('groupName').value = '';
    document.getElementById('groupActive').checked = true;
    document.querySelectorAll('#permissionsTree input[type="checkbox"]').forEach(cb => cb.checked = false);
}

// Parent/Child Checkbox Logic
document.addEventListener('change', (e) => {
    if (e.target.matches('#permissionsTree input[type="checkbox"]')) {
        const isChecked = e.target.checked;
        const parentLi = e.target.closest('li');

        // Select all children
        const childCheckboxes = parentLi.querySelectorAll('ul input[type="checkbox"]');
        childCheckboxes.forEach(cb => cb.checked = isChecked);

        // Handle parent state (optional refinement)
        updateParentCheckboxes(e.target);
    }
});

function updateParentCheckboxes(checkbox) {
    let current = checkbox.closest('ul')?.closest('li')?.querySelector('input[type="checkbox"]');
    while (current) {
        const siblingUl = current.closest('li').querySelector('ul');
        const siblingCheckboxes = Array.from(siblingUl.querySelectorAll(':scope > li > input[type="checkbox"]'));

        const allChecked = siblingCheckboxes.every(cb => cb.checked);
        const someChecked = siblingCheckboxes.some(cb => cb.checked);

        // Change: Parent is checked if ANY child is checked (someChecked)
        // This prevents the parent from looking "disabled" when only sub-items are unchecked
        if (someChecked) {
            current.checked = true;
        }
        // Separated: Don't automatically uncheck parent when all children are unchecked
        // current.checked = someChecked; 
        current.indeterminate = false;

        current = current.closest('ul')?.closest('li')?.querySelector('input[type="checkbox"]');
    }
}

