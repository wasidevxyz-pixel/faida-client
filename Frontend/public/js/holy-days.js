document.addEventListener('DOMContentLoaded', () => {
    loadHolyDays();

    // Set default date to today
    document.getElementById('date').valueAsDate = new Date();

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveHolyDay();
        }
    });
});

async function loadHolyDays() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/holy-days', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const list = document.getElementById('holyDaysList');
            list.innerHTML = '';

            data.data.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(item.date).toLocaleDateString()}</td>
                    <td>${item.religion}</td>
                    <td>${item.description}</td>
                    <td>
                        <button class="btn btn-warning btn-sm" onclick="editHolyDay('${item._id}')">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteHolyDay('${item._id}')">Delete</button>
                    </td>
                `;
                list.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error loading holy days:', error);
    }
}

async function saveHolyDay() {
    const id = document.getElementById('holyDayId').value;
    const data = {
        date: document.getElementById('date').value,
        religion: document.getElementById('religion').value,
        description: document.getElementById('description').value,
        isActive: document.getElementById('isActive').checked
    };

    try {
        const token = localStorage.getItem('token');
        const url = id ? `/api/v1/holy-days/${id}` : '/api/v1/holy-days';
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
            alert('Saved successfully!');
            clearForm();
            loadHolyDays();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        console.error('Error saving holy day:', error);
        alert('Error saving data');
    }
}

async function editHolyDay(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/holy-days', { // We only have get all, so finding from list technically or fetch all and filter
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const item = data.data.find(d => d._id === id);
            if (item) {
                document.getElementById('holyDayId').value = item._id;
                document.getElementById('date').value = item.date.split('T')[0];
                document.getElementById('religion').value = item.religion;
                document.getElementById('description').value = item.description;
                document.getElementById('isActive').checked = item.isActive;
            }
        }
    } catch (error) {
        console.error('Error editing:', error);
    }
}

async function deleteHolyDay(id) {
    if (!confirm('Are you sure?')) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/holy-days/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();
        if (result.success) {
            loadHolyDays();
        } else {
            alert('Error deleting');
        }
    } catch (error) {
        console.error('Error deleting:', error);
    }
}

function clearForm() {
    document.getElementById('holyDayId').value = '';
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('religion').value = 'Islam';
    document.getElementById('description').value = '';
    document.getElementById('isActive').checked = true;
}

