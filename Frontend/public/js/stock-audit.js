document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

let auditItems = [];

function initializePage() {
    document.getElementById('auditDate').valueAsDate = new Date();
    // Load existing items if editing?
    // For new audit, empty grid.
    setupItemSearch();
}

function setupItemSearch() {
    // Implement autocomplete or similar
    const searchInput = document.getElementById('itemSearch');
    searchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value;
            if (query) {
                await findAndAddItem(query);
                searchInput.value = '';
            }
        }
    });
}

async function findAndAddItem(query) {
    try {
        const response = await fetch(`/api/v1/items?search=${query}&limit=5`);
        const data = await response.json();

        if (data.success && data.data && data.data.length > 0) {
            // If one exact match, add it. If multiple, show modal (simplified: add first for now)
            const item = data.data[0];
            addItemToGrid(item);
        } else {
            alert('Item not found');
        }
    } catch (error) {
        console.error('Error searching item:', error);
    }
}

function addItemToGrid(item) {
    // Check if duplicate
    if (auditItems.find(x => x.item === item._id)) {
        alert('Item already in list');
        return;
    }

    const row = {
        item: item._id,
        code: item.code,
        name: item.name,
        store: 'Shop',
        systemQty: item.stock || 0,
        physicalQty: item.stock || 0, // Default to system qty
        costPrice: item.costPrice || 0,
        salePrice: item.salePrice || 0,
        remarks: ''
    };

    auditItems.push(row);
    renderGrid();
}

function renderGrid() {
    const tbody = document.getElementById('auditItemsBody');
    tbody.innerHTML = '';

    auditItems.forEach((row, index) => {
        const tr = document.createElement('tr');
        const diff = row.physicalQty - row.systemQty;
        const diffClass = diff < 0 ? 'text-danger' : (diff > 0 ? 'text-success' : '');

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${row.code || ''}</td>
            <td>${row.name || ''}</td>
            <td>
                <select class="form-select form-select-sm" onchange="updateRow(${index}, 'store', this.value)">
                    <option value="Shop" ${row.store === 'Shop' ? 'selected' : ''}>Shop</option>
                    <option value="Warehouse" ${row.store === 'Warehouse' ? 'selected' : ''}>Warehouse</option>
                </select>
            </td>
            <td class="text-end">${row.systemQty}</td>
            <td>
                <input type="number" class="grid-input text-end" value="${row.physicalQty}" 
                    onchange="updateRow(${index}, 'physicalQty', this.value)">
            </td>
            <td class="text-end ${diffClass}">${diff}</td>
            <td class="text-end">${row.costPrice}</td>
            <td class="text-end">${row.salePrice}</td>
            <td>
                <input type="text" class="grid-input" value="${row.remarks || ''}" 
                    onchange="updateRow(${index}, 'remarks', this.value)">
            </td>
            <td>
                <button class="btn btn-sm btn-danger py-0" onclick="removeRow(${index})">&times;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.updateRow = function (index, field, value) {
    if (field === 'physicalQty') {
        value = parseFloat(value) || 0;
    }
    auditItems[index][field] = value;
    renderGrid(); // Re-render to update difference
};

window.removeRow = function (index) {
    auditItems.splice(index, 1);
    renderGrid();
};

window.addNewItemRow = async function () {
    // For now, load 50 random items just to simulate "Add All"
    // In production, asking "Load all items?" is better.
    if (!confirm("Load all items into audit? This might take a moment.")) return;

    try {
        const response = await fetch('/api/v1/items?limit=1000'); // Cap at 1000
        const data = await response.json();

        if (data.success) {
            data.data.forEach(item => {
                if (!auditItems.find(x => x.item === item._id)) {
                    auditItems.push({
                        item: item._id,
                        code: item.code,
                        name: item.name,
                        store: 'Shop',
                        systemQty: item.stock || 0,
                        physicalQty: item.stock || 0,
                        costPrice: item.costPrice || 0,
                        salePrice: item.salePrice || 0,
                        remarks: ''
                    });
                }
            });
            renderGrid();
        }
    } catch (e) {
        console.error(e);
    }
};

window.saveAudit = async function (type) {
    if (auditItems.length === 0) {
        alert('No items to audit');
        return;
    }

    const payload = {
        date: document.getElementById('auditDate').value,
        remarks: document.getElementById('remarks').value,
        items: auditItems,
        status: type === 'post' ? 'posted' : 'draft'
    };

    let url = '/api/v1/stock-audits';
    // If updating existing, we need ID. But here assumes new for simplicity or handling later.

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
            if (type === 'post') {
                // Trigger post action if separate, or if POST / includes logic
                if (data.data.status !== 'posted') {
                    // Call post endpoint
                    await fetch(`/api/v1/stock-audits/${data.data._id}/post`, { method: 'POST' });
                }
                alert('Stock Audit Posted Successfully');
            } else {
                alert('Stock Audit Draft Saved');
            }
            clearForm();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error(error);
        alert('Error saving audit');
    }
};

window.clearForm = function () {
    auditItems = [];
    document.getElementById('remarks').value = '';
    renderGrid();
};


window.unAuditItemList = function () {
    // Placeholder for un-audit functionality
    alert('Un-Audit Item List feature is coming soon.');
};

window.postStockAuditItemList = function () {
    // Placeholder for post stock audit list functionality
    alert('Post Stock Audit Item List feature is coming soon.');
};

window.loadAuditList = async function () {
    // Create and show a list modal dynamically
    let modal = document.getElementById('auditListModal');
    if (!modal) {
        const modalHtml = `
        <div class="modal fade" id="auditListModal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Stock Audit List</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="table-responsive">
                            <table class="table table-bordered table-striped">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Audit No</th>
                                        <th>Remarks</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody id="auditListBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('auditListModal');
    }

    // Load data
    try {
        const response = await fetch('/api/v1/stock-audits?limit=50&sort=-date');
        const data = await response.json();

        const tbody = document.getElementById('auditListBody');
        tbody.innerHTML = '';

        if (data.success && data.data) {
            data.data.forEach(audit => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(audit.date).toLocaleDateString()}</td>
                    <td>${audit.auditNo || '-'}</td>
                    <td>${audit.remarks || ''}</td>
                    <td>${audit.status}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="editAudit('${audit._id}')" data-bs-dismiss="modal">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteAudit('${audit._id}')">Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
    } catch (error) {
        console.error('Error loading audit list:', error);
        alert('Failed to load audit list');
    }
};

window.editAudit = async function (id) {
    try {
        const response = await fetch(`/api/v1/stock-audits/${id}`);
        const data = await response.json();

        if (data.success) {
            const audit = data.data;
            document.getElementById('auditDate').value = audit.date.split('T')[0];
            document.getElementById('remarks').value = audit.remarks || '';
            document.getElementById('auditNo').value = audit.auditNo || '';

            // Populate grid
            auditItems = audit.items.map(item => ({
                item: item.item._id || item.item,
                code: item.item.code || '',
                name: item.item.name || '',
                store: item.store || 'Shop',
                systemQty: item.systemQty,
                physicalQty: item.physicalQty,
                costPrice: item.costPrice || 0,
                salePrice: item.salePrice || 0,
                remarks: item.remarks || ''
            }));

            renderGrid();
        }
    } catch (error) {
        console.error('Error loading audit:', error);
        alert('Failed to load audit details');
    }
};

window.deleteAudit = async function (id) {
    if (!confirm('Are you sure you want to delete this audit?')) return;

    try {
        const response = await fetch(`/api/v1/stock-audits/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            alert('Audit deleted successfully');
            // Reload list by closing and reopening? Or just refresh current modal view?
            // For now, close modal and reload list
            const modalEl = document.getElementById('auditListModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            loadAuditList();
        } else {
            alert('Error deleting audit: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting audit:', error);
        alert('Failed to delete audit');
    }
};

