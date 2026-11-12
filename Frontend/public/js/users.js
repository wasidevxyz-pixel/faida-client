// User Management Logic - New Desktop Layout
let allUsers = [];
let allGroups = [];
let filteredUsers = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Show loading state if needed
    await fetchGroups();
    await fetchStores(); // Load stores as branches
    await fetchWHCategories();
    await fetchUsers();

    // Setup sidebar toggle as per new header
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar.classList.contains('full')) {
                sidebar.classList.remove('full');
                sidebar.classList.add('mini');
            } else {
                sidebar.classList.remove('mini');
                sidebar.classList.add('full');
            }
        });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            saveUser();
        }
    });

    // Close dropdowns on outside click
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.multi-select-dropdown')) {
            document.querySelectorAll('.multi-select-content').forEach(list => {
                list.classList.remove('show');
            });
        }
    });
});

function toggleGenericDropdown(id) {
    document.getElementById(id).classList.toggle('show');
}

function toggleBranchDropdown(e) {
    e.stopPropagation();
    document.getElementById('branchList').classList.toggle('show');
}

function updateSelectedBranchesText() {
    const checked = Array.from(document.querySelectorAll('.branch-cb:checked'))
        .map(cb => cb.parentElement.querySelector('label').innerText);

    const text = checked.length > 0 ? checked.join(', ') : 'Select Branches';
    document.getElementById('selectedBranchesText').innerText = text;
}

async function fetchGroups() {
    try {
        const response = await fetch('/api/v1/groups', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            allGroups = result.data;
            populateGroupDropdown();
            // Re-render table if users were already loaded
            if (allUsers.length > 0) renderUsersTable();
        }
    } catch (error) {
        console.error('Error fetching groups:', error);
    }
}

async function fetchStores() {
    try {
        // We explicitly tell the server to ignore individual branch filters on THIS screen
        // because we need to see ALL branches to assign them to users.
        const response = await fetch('/api/v1/stores?ignorePermissions=true', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            const stores = result.data;
            populateBranchDropdown(stores);
        }
    } catch (error) {
        console.error('Error fetching stores:', error);
    }
}

function populateBranchDropdown(stores) {
    const list = document.getElementById('branchList');
    if (list) {
        list.innerHTML = stores.map(store => `
            <div class="multi-select-item" onclick="event.stopPropagation()">
                <input class="branch-cb" type="checkbox" value="${store.name}" id="br_${store._id}" onchange="updateSelectedBranchesText()">
                <label for="br_${store._id}">${store.name}</label>
            </div>
        `).join('') || '<div class="p-2 text-muted">No branches found</div>';
    }
}

function populateGroupDropdown() {
    const select = document.getElementById('userGroup');
    select.innerHTML = '<option value="">Select Group</option>' +
        allGroups.map(group => `<option value="${group._id}">${group.name}</option>`).join('');
}

async function fetchWHCategories() {
    try {
        const [custRes, itemRes, normItemRes] = await Promise.all([
            fetch('/api/v1/wh-customer-categories', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
            fetch('/api/v1/wh-item-categories', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
            fetch('/api/v1/item-categories', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
        ]);

        const custData = await custRes.json();
        const itemData = await itemRes.json();
        const normItemData = await normItemRes.json();

        if (custData.success) populateDropdown('whCustomerCatList', custData.data, 'cust-cat-cb', 'updateWHCustomerCatsText');
        if (itemData.success) populateDropdown('whItemCatList', itemData.data, 'item-cat-cb', 'updateWHItemCatsText');
        if (normItemData.success) populateDropdown('itemCatList', normItemData.data, 'norm-item-cat-cb', 'updateItemCatsText');
    } catch (error) {
        console.error('Error fetching WH categories:', error);
    }
}

function populateDropdown(listId, data, cbClass, updateFnName) {
    const list = document.getElementById(listId);
    if (list) {
        list.innerHTML = data.map(item => `
            <div class="multi-select-item" onclick="event.stopPropagation()">
                <input class="${cbClass}" type="checkbox" value="${item._id}" id="${cbClass}_${item._id}" onchange="${updateFnName}()">
                <label for="${cbClass}_${item._id}">${item.name}</label>
            </div>
        `).join('') || '<div class="p-2 text-muted">None found</div>';
    }
}

function populateStringDropdown(listId, data, cbClass, updateFnName) {
    const list = document.getElementById(listId);
    if (list) {
        list.innerHTML = data.map(str => `
            <div class="multi-select-item" onclick="event.stopPropagation()">
                <input class="${cbClass}" type="checkbox" value="${str}" id="${cbClass}_${str.replace(/\s+/g, '_')}" onchange="${updateFnName}()">
                <label for="${cbClass}_${str.replace(/\s+/g, '_')}">${str}</label>
            </div>
        `).join('') || '<div class="p-2 text-muted">None found</div>';
    }
}

function updateWHCustomerCatsText() {
    const checked = Array.from(document.querySelectorAll('.cust-cat-cb:checked'))
        .map(cb => cb.parentElement.querySelector('label').innerText);
    document.getElementById('selectedWHCustomerCatsText').innerText = checked.length > 0 ? (checked.length > 2 ? `${checked.length} Selected` : checked.join(', ')) : 'All Allowed';
}

function updateWHItemCatsText() {
    const checked = Array.from(document.querySelectorAll('.item-cat-cb:checked'))
        .map(cb => cb.parentElement.querySelector('label').innerText);
    document.getElementById('selectedWHItemCatsText').innerText = checked.length > 0 ? (checked.length > 2 ? `${checked.length} Selected` : checked.join(', ')) : 'All Allowed';
}

function updateItemCatsText() {
    const checked = Array.from(document.querySelectorAll('.norm-item-cat-cb:checked'))
        .map(cb => cb.parentElement.querySelector('label').innerText);
    document.getElementById('selectedItemCatsText').innerText = checked.length > 0 ? (checked.length > 2 ? `${checked.length} Selected` : checked.join(', ')) : 'All Allowed';
}

async function fetchUsers() {
    try {
        const response = await fetch('/api/v1/users', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        if (result.success) {
            allUsers = result.data;
            filteredUsers = [...allUsers];
            renderUsersTable();
        }
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = filteredUsers.map(user => {
        // Find group name
        const group = allGroups.find(g => g._id === (typeof user.groupId === 'string' ? user.groupId : user.groupId?._id));
        const groupName = group ? group.name : 'Unknown';

        return `
            <tr onclick="selectUser('${user._id}')" style="cursor:pointer">
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${groupName}</td>
                <td>${user.permissions?.includes('right_03') ? 'true' : 'false'}</td>
                <td>${user.isActive ? 'true' : 'false'}</td>
                <td>
                    <button class="btn btn-sm btn-primary py-0 px-2" onclick="editUser(event, '${user._id}')">
                        <i class="fas fa-edit me-1"></i>Edit
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterUsers() {
    const query = document.getElementById('userSearch').value.toLowerCase();
    filteredUsers = allUsers.filter(user =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
    );
    renderUsersTable();
}

function selectUser(id) {
    const user = allUsers.find(u => u._id === id);
    if (!user) return;

    // Fill form
    document.getElementById('userId').value = user._id;
    document.getElementById('userFullName').value = user.name;
    document.getElementById('userEmail').value = user.email;
    document.getElementById('userPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('userActive').checked = user.isActive;
    document.getElementById('userAiEnabled').checked = user.aiEnabled || false;
    document.getElementById('userGroup').value = typeof user.groupId === 'string' ? user.groupId : user.groupId?._id || '';

    // Set multiple branches
    const userBranches = Array.isArray(user.branch) ? user.branch : (user.branch ? [user.branch] : []);
    document.querySelectorAll('.branch-cb').forEach(cb => {
        cb.checked = userBranches.includes(cb.value);
    });
    updateSelectedBranchesText();

    document.getElementById('userDepartment').value = user.department || '';
    document.getElementById('userType').value = user.userType || '';
    document.getElementById('userSaleDeleteLimit').value = user.saleDeleteLimit || '';

    // Set allowed categories
    const allowedCustCats = user.allowedWHCustomerCategories || [];
    document.querySelectorAll('.cust-cat-cb').forEach(cb => cb.checked = allowedCustCats.includes(cb.value));
    updateWHCustomerCatsText();

    const allowedItemCats = user.allowedWHItemCategories || [];
    document.querySelectorAll('.item-cat-cb').forEach(cb => cb.checked = allowedItemCats.includes(cb.value));
    updateWHItemCatsText();



    // Clear and set checkboxes
    clearCheckboxes();
    if (user.permissions) {
        user.permissions.forEach(p => {
            const cb = document.getElementById(p);
            if (cb) cb.checked = true;
        });
    }
}

function editUser(event, id) {
    event.stopPropagation();
    selectUser(id);
}

function clearCheckboxes() {
    document.querySelectorAll('.rights-grid input[type="checkbox"]').forEach(cb => cb.checked = false);
}

function resetForm() {
    document.getElementById('userId').value = '';
    document.getElementById('userForm').reset();
    document.querySelectorAll('.branch-cb, .cust-cat-cb, .item-cat-cb').forEach(cb => cb.checked = false);
    updateSelectedBranchesText();
    updateWHCustomerCatsText();
    updateWHItemCatsText();
    clearCheckboxes();
}

async function saveUser() {
    const saveBtn = document.querySelector('button[onclick="saveUser()"]');
    const originalText = saveBtn.innerText;

    const id = document.getElementById('userId').value;
    const name = document.getElementById('userFullName').value;
    const email = document.getElementById('userEmail').value;
    const groupId = document.getElementById('userGroup').value;
    const isActive = document.getElementById('userActive').checked;
    const aiEnabled = document.getElementById('userAiEnabled').checked;
    const password = document.getElementById('userPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Collect selected branches
    const branches = [];
    document.querySelectorAll('.branch-cb:checked').forEach(cb => branches.push(cb.value));

    const department = document.getElementById('userDepartment').value;
    const zakat = document.getElementById('userZakat')?.value || '';
    const userType = document.getElementById('userType')?.value || '';
    const saleDeleteLimit = document.getElementById('userSaleDeleteLimit')?.value || '';

    // Collect allowed categories
    const allowedWHCustomerCategories = [];
    document.querySelectorAll('.cust-cat-cb:checked').forEach(cb => allowedWHCustomerCategories.push(cb.value));

    const allowedWHItemCategories = [];
    document.querySelectorAll('.item-cat-cb:checked').forEach(cb => allowedWHItemCategories.push(cb.value));


    if (!name || !email || !groupId) {
        alert('Please fill at least Name, Email (Login Id), and Group');
        return;
    }

    // Password is required for new users
    if (!id && !password) {
        alert('Password is required for new users');
        return;
    }

    if (password && password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    // Set loading state
    saveBtn.disabled = true;
    saveBtn.innerText = 'Saving...';

    // Collect permissions (checkboxes)
    const permissions = [];
    document.querySelectorAll('.rights-grid input[type="checkbox"]').forEach(cb => {
        if (cb.checked) permissions.push(cb.id);
    });

    const data = {
        name,
        email,
        groupId,
        isActive,
        aiEnabled,
        permissions,
        branch: branches, // Now an array
        department,
        zakat,
        userType,
        saleDeleteLimit,
        allowedWHCustomerCategories,
        allowedWHItemCategories
    };

    if (password) data.password = password;

    try {
        const url = id ? `/api/v1/users/${id}` : '/api/v1/users';
        const method = id ? 'PUT' : 'POST';

        console.log('Sending user data:', data);

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        console.log('Server response:', result);

        if (result.success) {
            alert('User saved successfully');

            // PROFESSIONAL FIX: Update local session if editing self
            const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
            if (id === currentUser.id || id === currentUser._id) {
                console.log('Updating local session for current user...');
                // Rebuild rights from the new permissions list to ensure unchecked ones are removed
                const newRights = {};
                if (data.permissions) {
                    data.permissions.forEach(p => newRights[p] = true);
                }
                
                const updatedUser = { 
                    ...currentUser, 
                    ...data,
                    rights: newRights 
                };
                localStorage.setItem('user', JSON.stringify(updatedUser));
            }

            resetForm();
            fetchUsers();
        } else {
            alert(result.error || 'Failed to save user');
        }
    } catch (error) {
        console.error('Error saving user:', error);
        alert('An error occurred while saving.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = originalText;
    }
}

