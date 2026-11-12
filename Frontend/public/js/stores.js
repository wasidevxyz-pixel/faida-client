let stores = [];

document.addEventListener('DOMContentLoaded', () => {
    loadStores();

    // Search functionality
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = stores.filter(store =>
            store.name?.toLowerCase().includes(searchTerm) ||
            store.address?.toLowerCase().includes(searchTerm) ||
            store.contactNo?.toLowerCase().includes(searchTerm)
        );
        renderTable(filtered);
    });

    // Keyboard Shortcut: Alt+S to Save
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            saveStore();
        }
    });
});

async function loadStores() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            stores = data.data;
            renderTable(stores);
        }
    } catch (error) {
        console.error('Error loading stores:', error);
        alert('Error loading stores');
    }
}

function renderTable(data) {
    const tbody = document.getElementById('storesBody');
    tbody.innerHTML = '';

    data.forEach((store, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${store.name}</td>
            <td>${store.address || '-'}</td>
            <td>${store.contactNo || '-'}</td>
            <td>${store.isActive ? 'Yes' : 'No'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editStore('${store._id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteStore('${store._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveStore() {
    const storeId = document.getElementById('storeId').value;
    const storeData = {
        name: document.getElementById('name').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        address: document.getElementById('address').value,
        ntn: document.getElementById('ntn').value,
        strn: document.getElementById('strn').value,
        contactNo: document.getElementById('contactNo').value,
        employeeSalary: document.getElementById('employeeSalary').value,
        kamla: document.getElementById('kamla').value,
        targetSale: document.getElementById('targetSale').value,
        simpleNadraCard: document.getElementById('simpleNadraCard').value,
        foodExpPerTime: parseFloat(document.getElementById('foodExpPerTime').value) || 0,
        rotiPrice: parseFloat(document.getElementById('rotiPrice').value) || 0,
        isActive: document.getElementById('isActive').checked,
        showOnDashboard: document.getElementById('showOnDashboard').checked
    };

    if (!storeData.name) {
        alert('Please enter store name');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const url = storeId ? `/api/v1/stores/${storeId}` : '/api/v1/stores';
        const method = storeId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(storeData)
        });

        const data = await response.json();

        if (data.success) {
            alert(storeId ? 'Store updated successfully' : 'Store created successfully');
            clearForm();
            loadStores();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving store:', error);
        alert('Error saving store');
    }
}

async function editStore(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/stores/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const store = data.data;
            document.getElementById('storeId').value = store._id;
            document.getElementById('name').value = store.name;
            document.getElementById('phone').value = store.phone || '';
            document.getElementById('email').value = store.email || '';
            document.getElementById('address').value = store.address || '';
            document.getElementById('ntn').value = store.ntn || '';
            document.getElementById('strn').value = store.strn || '';
            document.getElementById('contactNo').value = store.contactNo || '';
            document.getElementById('employeeSalary').value = store.employeeSalary || '';
            document.getElementById('kamla').value = store.kamla || '';
            document.getElementById('targetSale').value = store.targetSale || '';
            document.getElementById('simpleNadraCard').value = store.simpleNadraCard || '';
            document.getElementById('foodExpPerTime').value = store.foodExpPerTime || 0;
            document.getElementById('rotiPrice').value = store.rotiPrice || 0;
            document.getElementById('isActive').checked = store.isActive;
            document.getElementById('showOnDashboard').checked = store.showOnDashboard || false;
        }
    } catch (error) {
        console.error('Error loading store:', error);
        alert('Error loading store');
    }
}

async function deleteStore(id) {
    if (!confirm('Are you sure you want to delete this store?')) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/stores/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success) {
            alert('Store deleted successfully');
            loadStores();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting store:', error);
        alert('Error deleting store');
    }
}

function clearForm() {
    document.getElementById('storeId').value = '';
    document.getElementById('name').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('email').value = '';
    document.getElementById('address').value = '';
    document.getElementById('ntn').value = '';
    document.getElementById('strn').value = '';
    document.getElementById('contactNo').value = '';
    document.getElementById('employeeSalary').value = '';
    document.getElementById('kamla').value = '';
    document.getElementById('targetSale').value = '';
    document.getElementById('simpleNadraCard').value = '';
    document.getElementById('foodExpPerTime').value = '';
    document.getElementById('rotiPrice').value = '';
    document.getElementById('isActive').checked = true;
    document.getElementById('showOnDashboard').checked = false;
}

