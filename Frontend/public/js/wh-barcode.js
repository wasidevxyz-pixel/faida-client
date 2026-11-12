/**
 * Warehouse Barcode Printing Logic
 */

let printItems = [];

document.addEventListener('DOMContentLoaded', () => {
    // Permission Check
    if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    const isAdmin = user.role === 'admin' || (user.group && user.group.isAdmin) || (user.groupId && user.groupId.isAdmin);

    if (!isAdmin && !rights.wh_barcode_print) {
        alert('You do not have permission to access Barcode Printing');
        window.location.href = '/main';
        return;
    }

    setupItemSearch();

    // Alt + P shortcut
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            printBarcodes();
        }
    });

    // Check if there is an invoice in URL (optional)
    const urlParams = new URLSearchParams(window.location.search);
    const invNo = urlParams.get('invoice');
    if (invNo) {
        document.getElementById('purchaseSearch').value = invNo;
        loadPurchase();
    }
});

/**
 * Setup Alpha-numeric item search
 */
function setupItemSearch() {
    const input = document.getElementById('itemSearch');
    const resultsDiv = document.getElementById('itemResults');

    input.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            resultsDiv.style.display = 'none';
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/v1/wh-items?search=${encodeURIComponent(query)}&limit=10`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            const items = json.data || [];

            if (items.length > 0) {
                resultsDiv.innerHTML = items.map(item => `
                    <div class="result-item" onclick="addItemFromSearch('${item._id}')">
                        <div class="fw-bold">${item.name}</div>
                        <div class="small text-muted">Code: ${item.itemsCode} | Barcode: ${item.barcode || 'N/A'}</div>
                    </div>
                `).join('');
                resultsDiv.style.display = 'block';
            } else {
                resultsDiv.style.display = 'none';
            }
        } catch (err) {
            console.error('Search error:', err);
        }
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });
}

async function addItemFromSearch(id) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/wh-items/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        const item = json.data;

        if (item) {
            addItemToList({
                _id: item._id,
                name: item.name,
                itemsCode: item.itemsCode,
                barcode: item.barcode || item.itemsCode,
                retailPrice: item.retailPrice || 0,
                qty: 1
            });
            document.getElementById('itemSearch').value = '';
            document.getElementById('itemResults').style.display = 'none';
        }
    } catch (err) {
        console.error('Error fetching item:', err);
    }
}

/**
 * Modals and Data Browsing
 */
let allWHItems = [];
let allWHPurchases = [];
let purchaseModal, itemModal;

function initModals() {
    purchaseModal = new bootstrap.Modal(document.getElementById('purchaseModal'));
    itemModal = new bootstrap.Modal(document.getElementById('itemModal'));

    // Search listeners for modals
    document.getElementById('modalPurchaseSearch').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allWHPurchases.filter(p =>
            p.invoiceNo.toLowerCase().includes(query) ||
            (p.supplier && (p.supplier.supplierName || p.supplier.name || '').toLowerCase().includes(query))
        );
        renderPurchaseModalList(filtered);
    });

    document.getElementById('modalItemSearch').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allWHItems.filter(i =>
            i.name.toLowerCase().includes(query) ||
            i.itemsCode.toLowerCase().includes(query) ||
            (i.barcode && i.barcode.toLowerCase().includes(query))
        );
        renderItemModalList(filtered);
    });
}

async function showPurchaseList() {
    if (!purchaseModal) initModals();

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/wh-purchases?limit=50&sort=-invoiceDate', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        allWHPurchases = json.data || [];
        renderPurchaseModalList(allWHPurchases);
        purchaseModal.show();
    } catch (err) {
        console.error('Error loading purchases:', err);
    }
}

function renderPurchaseModalList(list) {
    const tbody = document.getElementById('purchaseListBody');
    tbody.innerHTML = list.map(p => {
        const supplierName = p.supplier ? (p.supplier.supplierName || p.supplier.name || 'N/A') : 'N/A';
        return `
        <tr>
            <td>${new Date(p.invoiceDate).toLocaleDateString()}</td>
            <td><b>${p.invoiceNo}</b></td>
            <td>${supplierName}</td>
            <td>${p.items ? p.items.length : 0} Items</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="selectPurchaseFromModal('${p._id}')">Select</button>
            </td>
        </tr>
    `;
    }).join('');
}

async function selectPurchaseFromModal(id) {
    const purchase = allWHPurchases.find(p => p._id === id);
    if (purchase) {
        document.getElementById('purchaseSearch').value = purchase.invoiceNo;
    } else {
        document.getElementById('purchaseSearch').value = id;
    }
    await loadPurchase(id);
    purchaseModal.hide();
}

async function showItemList() {
    if (!itemModal) initModals();

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/wh-items?limit=100', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        allWHItems = json.data || [];
        renderItemModalList(allWHItems);
        itemModal.show();
    } catch (err) {
        console.error('Error loading items:', err);
    }
}

function renderItemModalList(list) {
    const tbody = document.getElementById('itemListBody');
    tbody.innerHTML = list.map(i => `
        <tr>
            <td>
                <div><b>${i.itemsCode}</b></div>
                <div class="small text-muted">${i.barcode || ''}</div>
            </td>
            <td>${i.name}</td>
            <td>${i.costPrice}</td>
            <td>${i.retailPrice}</td>
            <td>${(i.stock || []).reduce((acc, s) => acc + (s.quantity || 0), 0)}</td>
            <td>
                <button class="btn btn-sm btn-success" onclick="selectItemFromModal('${i._id}')">Add</button>
            </td>
        </tr>
    `).join('');
}

function selectItemFromModal(id) {
    addItemFromSearch(id);
    // Keep modal open for multiple selections? User might want to add many
    // Let's show a small toast or change button color
    const btn = event.target;
    btn.innerHTML = '<i class="fas fa-check"></i> Added';
    btn.className = 'btn btn-sm btn-outline-success';
    setTimeout(() => {
        btn.innerHTML = 'Add';
        btn.className = 'btn btn-sm btn-success';
    }, 1000);
}

// Update loadPurchase to handle direct ID or query
async function loadPurchase(forcedId = null) {
    const query = forcedId || document.getElementById('purchaseSearch').value.trim();
    if (!query) return alert('Please enter Invoice No or Posting No');

    try {
        const btn = document.querySelector('button[onclick="loadPurchase()"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

        const token = localStorage.getItem('token');

        let targetId = forcedId;

        if (!targetId) {
            const searchRes = await fetch(`/api/v1/wh-purchases?search=${query}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const searchJson = await searchRes.json();
            const purchases = searchJson.data || [];
            if (purchases.length === 0) {
                alert('No purchase found');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-download me-1"></i> Load';
                return;
            }
            targetId = purchases[0]._id;
        }

        const res = await fetch(`/api/v1/wh-purchases/${targetId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        const purchase = json.data;

        if (purchase && purchase.items) {
            purchase.items.forEach(line => {
                const item = line.item;
                if (!item) return;

                addItemToList({
                    _id: item._id,
                    name: item.name,
                    itemsCode: item.itemsCode,
                    barcode: item.barcode || item.itemsCode,
                    retailPrice: item.retailPrice || 0,
                    qty: line.quantity || 1
                });
            });
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-download me-1"></i> Load';
    } catch (err) {
        console.error('Purchase load error:', err);
        alert('Error loading purchase');
    }
}

function addItemToList(item) {
    // Check if item already exists in list
    const existing = printItems.find(i => i._id === item._id);
    if (existing) {
        existing.qty += item.qty;
    } else {
        printItems.push(item);
    }
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('barcodeTableBody');
    tbody.innerHTML = printItems.map((item, index) => `
        <tr>
            <td>
                <div class="fw-bold">${item.itemsCode}</div>
                <div class="small text-muted">${item.barcode}</div>
            </td>
            <td class="small">${item.name}</td>
            <td>
                <input type="number" class="form-control form-control-sm" value="${item.retailPrice}" 
                    onchange="updateItem(${index}, 'retailPrice', this.value)" placeholder="Retail Price">
            </td>
            <td>
                <input type="number" class="form-control form-control-sm" value="${item.qty}" 
                    onchange="updateItem(${index}, 'qty', this.value)">
            </td>
            <td>
                <button class="btn btn-sm btn-link text-danger" onclick="removeItem(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function updateItem(index, field, value) {
    if (field === 'qty' || field === 'retailPrice') {
        printItems[index][field] = parseFloat(value) || 0;
    }
}

function removeItem(index) {
    printItems.splice(index, 1);
    renderTable();
}

function clearAll() {
    if (confirm('Clear all items?')) {
        printItems = [];
        renderTable();
    }
}

/**
 * Print Barcodes
 */
function printBarcodes() {
    if (printItems.length === 0) return alert('No items to print');

    const zone = document.getElementById('printZone');
    zone.innerHTML = '';

    const settings = {
        width: document.getElementById('labelWidth').value,
        height: document.getElementById('labelHeight').value,
        fontSize: document.getElementById('fontSize').value,
        scale: document.getElementById('barcodeScale').value,
        showPrice: document.getElementById('showPrice').checked,
        showName: document.getElementById('showName').checked,
        showCompany: document.getElementById('showCompany').checked,
        companyName: document.getElementById('companyName').value || '',
        topOffset: document.getElementById('topOffset').value || 0,
        orientation: document.getElementById('printOrientation').value
    };

    const timestamp = Date.now();
    const labelHeightPixels = settings.height * 96;
    const barcodeHeight = Math.floor(labelHeightPixels * 0.35); // Adjust for company name
    const safetyHeight = settings.height - 0.05; // CRITICAL: Stop the "1 empty sticker" bug

    // Labels per Row settings
    const cols = parseInt(document.getElementById('labelsPerRow').value) || 1;
    const gap = parseFloat(document.getElementById('labelGap').value) || 0;
    const pageWidth = (settings.width * cols) + (gap * (cols - 1));

    // Flat list of all labels to generate
    let allLabels = [];
    printItems.forEach((item, itemIdx) => {
        const qty = parseInt(item.qty) || 0;
        for (let i = 0; i < qty; i++) {
            allLabels.push({ item, itemIdx, subIdx: i });
        }
    });

    // Group labels into rows
    for (let r = 0; r < allLabels.length; r += cols) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'print-row';
        rowDiv.style.width = pageWidth + 'in';
        rowDiv.style.height = safetyHeight + 'in';
        rowDiv.style.display = 'flex';
        rowDiv.style.gap = gap + 'in';
        rowDiv.style.paddingTop = settings.topOffset + 'px';

        for (let c = 0; c < cols; c++) {
            const labelData = allLabels[r + c];
            const label = document.createElement('div');
            label.className = 'barcode-label';
            label.style.width = settings.width + 'in';
            label.style.height = safetyHeight + 'in';

            if (!labelData) {
                label.style.visibility = 'hidden';
                rowDiv.appendChild(label);
                continue;
            }

            const { item, itemIdx, subIdx } = labelData;
            const uniqueId = `bc-${timestamp}-${itemIdx}-${subIdx}`;

            let labelHtml = '';

            if (settings.showCompany && settings.companyName) {
                labelHtml += `<div class="company-name" style="font-size: ${parseInt(settings.fontSize) - 1}px">${settings.companyName}</div>`;
            }

            if (settings.showName) {
                labelHtml += `<div class="item-name" style="font-size: ${settings.fontSize}px">${item.name}</div>`;
            }

            labelHtml += `<svg class="barcode-svg" id="${uniqueId}"></svg>`;

            if (settings.showPrice) {
                labelHtml += `<div class="item-price" style="font-size: ${settings.fontSize}px">Rs: ${item.retailPrice.toLocaleString()}</div>`;
            }

            label.innerHTML = labelHtml;
            rowDiv.appendChild(label);
        }
        zone.appendChild(rowDiv);
    }

    // Initialize Barcodes after they are in the DOM to ensure text shows up
    allLabels.forEach((labelData) => {
        const { item, itemIdx, subIdx } = labelData;
        const uniqueId = `bc-${timestamp}-${itemIdx}-${subIdx}`;
        JsBarcode(`#${uniqueId}`, item.barcode, {
            format: "CODE128",
            width: 1.2 * settings.scale,
            height: barcodeHeight * settings.scale,
            displayValue: true,
            fontSize: parseInt(settings.fontSize) + 2,
            textMargin: 1,
            margin: 0
        });
    });

    // Dynamic Style
    let styleTag = document.getElementById('dynamic-print-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-print-style';
        document.head.appendChild(styleTag);
    }

    styleTag.innerHTML = `
        @media print {
            @page { 
                size: ${pageWidth}in ${settings.height}in ${settings.orientation} !important; 
                margin: 0 !important;
            }
            html, body {
                width: ${pageWidth}in !important;
                height: ${settings.height}in !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
            }
            body > *:not(#printZone) {
                display: none !important;
            }
            #printZone {
                display: block !important;
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            .print-row {
                display: flex !important;
                width: 100% !important;
                height: ${safetyHeight}in !important;
                padding-top: ${settings.topOffset}px !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                overflow: hidden !important;
            }
            .print-row:last-child {
                page-break-after: avoid !important;
            }
            .barcode-label {
                width: ${settings.width}in !important;
                height: ${safetyHeight}in !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
            }
        }
    `;

    setTimeout(() => {
        window.print();
    }, 1500);
}

// Add company checkbox listener
document.getElementById('showCompany').addEventListener('change', (e) => {
    document.getElementById('companyInputField').style.display = e.target.checked ? 'block' : 'none';
});

