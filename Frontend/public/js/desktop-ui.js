/**
 * Desktop UI - Common Functions
 * Professional desktop application UI helpers
 */

// ============================================
// GLOBAL NUMBER SPINNER FIX
// ============================================
(function injectGlobalNumberFix() {
    if (document.getElementById('global-number-spinner-fix-ui')) return;
    const style = document.createElement('style');
    style.id = 'global-number-spinner-fix-ui';
    style.textContent = `
        input[type="number"] {
            -moz-appearance: textfield !important;
            appearance: textfield !important;
        }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
        }
        input[type="number"]::-moz-number-spin-box,
        input[type="number"]::-moz-number-spin-inner,
        input[type="number"]::-moz-number-spin-up-button,
        input[type="number"]::-moz-number-spin-down-button {
            display: none !important;
            -moz-appearance: none !important;
        }
    `;
    document.head.appendChild(style);

    const applyFix = () => {
        document.querySelectorAll('input[type="number"]').forEach(el => {
            if (el.style.mozAppearance !== 'textfield') {
                el.style.setProperty('-moz-appearance', 'textfield', 'important');
                el.style.setProperty('appearance', 'textfield', 'important');
            }
        });
    };
    applyFix();
    // Use MutationObserver to catch dynamically added inputs instead of polling every second
    if (window.MutationObserver) {
        const observer = new MutationObserver(() => applyFix());
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();

// ============================================
// Quick Add Dialog Functions
// ============================================

/**
 * Show quick add dialog for dropdown items
 * @param {string} type - Type of item to add (category, company, supplier, unit, etc.)
 * @param {function} callback - Callback function after successful add/select to refresh dropdown
 */
function showQuickAddDialog(type, callback) {
    // Store callback reference globally for access in handleQuickAdd
    window._quickAddCallback = callback;

    const dialogHTML = `
        <div class="modal fade" id="quickAddModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content quick-add-modal">
                    <div class="modal-header quick-add-header">
                        <h6 class="modal-title">
                            <i class="fas fa-plus-circle me-2"></i>Add / Select ${capitalize(type)}
                        </h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body quick-add-body">
                        <div class="row">
                            <div class="col-md-5 border-end">
                                <h6 class="border-bottom pb-2 mb-3">Add New ${capitalize(type)}</h6>
                                <form id="quickAddForm">
                                    <div class="mb-3">
                                        <label for="quickAddName" class="form-label">Name <span class="text-danger">*</span></label>
                                        <input type="text" class="form-control form-control-sm" id="quickAddName" required autofocus>
                                    </div>
                                    <div class="mb-3">
                                        <label for="quickAddCode" class="form-label">Code / Description</label>
                                        <input type="text" class="form-control form-control-sm" id="quickAddCode">
                                    </div>
                                    ${getQuickAddFields(type)}
                                    <div class="d-grid mt-4">
                                         <button type="button" class="btn btn-add-new btn-sm" onclick="handleQuickAdd('${type}')">
                                            <i class="fas fa-save me-1"></i>Save & Select
                                        </button>
                                    </div>
                                </form>
                            </div>
                            <div class="col-md-7 ps-4">
                                <h6 class="border-bottom pb-2 mb-3">Existing ${capitalize(type)}s</h6>
                                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                                    <table class="table table-sm table-hover table-striped">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Name</th>
                                                <th>Code</th>
                                                <th width="120" class="text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody id="quickAddListBody">
                                            <tr><td colspan="4" class="text-center">Loading...</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <style>
            .quick-add-modal {
                border: 2px solid #FD7E14;
                border-radius: 8px;
                overflow: hidden;
            }
            .quick-add-header {
                background: linear-gradient(135deg, #FD7E14, #FF9A3C);
                color: white;
                padding: 10px 15px;
            }
            .quick-add-header .btn-close {
                filter: brightness(0) invert(1);
            }
            .quick-add-body {
                background: #F5F5DC;
                padding: 15px;
            }
            .quick-add-body .form-control {
                border: 1px solid #ccc;
                background: white;
            }
            .quick-add-body .form-label {
                font-size: 12px;
                font-weight: 600;
                color: #333;
                margin-bottom: 4px;
            }
            .btn-add-new {
                background: linear-gradient(135deg, #FD7E14, #FF9A3C);
                border: none;
                color: white;
            }
            .btn-add-new:hover {
                background: linear-gradient(135deg, #E86F00, #FD7E14);
                color: white;
            }
        </style>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('quickAddModal');
    if (existing) existing.remove();

    // Add to body
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('quickAddModal'));
    modal.show();

    // Load list
    loadQuickAddList(type);

    // Focus on name field
    document.getElementById('quickAddModal').addEventListener('shown.bs.modal', function () {
        document.getElementById('quickAddName').focus();
    });
}

/**
 * Get additional fields based on type
 */
function getQuickAddFields(type) {
    switch (type) {
        case 'unit':
            return `
                <div class="mb-3">
                    <label for="quickAddSymbol" class="form-label">Symbol</label>
                    <input type="text" class="form-control form-control-sm" id="quickAddSymbol" placeholder="e.g., kg, pcs">
                </div>
            `;
        case 'supplier':
        case 'customer':
            return `
                <div class="mb-3">
                    <label for="quickAddPhone" class="form-label">Phone</label>
                    <input type="text" class="form-control form-control-sm" id="quickAddPhone">
                </div>
                <div class="mb-3">
                    <label for="quickAddCity" class="form-label">City</label>
                    <input type="text" class="form-control form-control-sm" id="quickAddCity">
                </div>
            `;
        case 'subclass':
            // Can be expanded to show parent class dropdown
            return '';
        default:
            return '';
    }
}

/**
 * Load existing items for quick add list
 */
async function loadQuickAddList(type) {
    const tbody = document.getElementById('quickAddListBody');
    if (!tbody) return;

    // Store type globally for edit/delete functions
    window._quickAddCurrentType = type;

    try {
        const token = localStorage.getItem('token');
        const endpoint = getQuickAddEndpoint(type, true); // true = GET list

        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (response.ok) {
            const data = await response.json();
            // Handle various API return formats
            // Standard: { success: true, data: [...] }
            // Some might be array directly (legacy)
            const items = Array.isArray(data) ? data : (data.data || []);

            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center">No records found</td></tr>';
                return;
            }

            tbody.innerHTML = items.map(item => {
                // Determine name and value based on item structure
                const name = item.name || item; // if item is string
                const id = item._id || item;
                const code = item.code || item.description || item.symbol || '-';

                // Escape quotes for onclick params
                const safeName = typeof name === 'string' ? name.replace(/'/g, "\\'") : name;
                const safeId = typeof id === 'string' ? id.replace(/'/g, "\\'") : id;
                const safeCode = typeof code === 'string' ? code.replace(/'/g, "\\'") : code;

                return `
                    <tr data-id="${id}">
                        <td>${name}</td>
                        <td>${code}</td>
                        <td class="text-center" style="white-space: nowrap;">
                            <button class="btn btn-sm btn-success py-0 px-1 me-1" onclick="selectQuickAddItem('${type}', '${safeId}', '${safeName}')" title="Select">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-sm btn-warning py-0 px-1 me-1" onclick="editQuickAddItem('${type}', '${safeId}', '${safeName}', '${safeCode}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger py-0 px-1" onclick="deleteQuickAddItem('${type}', '${safeId}', '${safeName}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load data</td></tr>';
        }
    } catch (error) {
        console.error('Error loading list:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading data</td></tr>';
    }
}

/**
 * Handle quick add form submission (Create New)
 */
async function handleQuickAdd(type) {
    const name = document.getElementById('quickAddName').value.trim();
    const code = document.getElementById('quickAddCode').value.trim();

    if (!name) {
        showError('Name is required');
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const endpoint = getQuickAddEndpoint(type, false); // false = POST

        // Build Payload
        let payload = { name };
        if (code) payload.code = code;
        if (code && !payload.description) payload.description = code; // Map code to description for some

        // Specific fields
        if (type === 'unit') {
            const symbol = document.getElementById('quickAddSymbol').value.trim();
            payload.shortName = symbol || name.substring(0, 3).toUpperCase();
        } else if (type === 'supplier' || type === 'customer') {
            payload.partyType = type;
            payload.phone = document.getElementById('quickAddPhone').value.trim();
            payload.city = document.getElementById('quickAddCity').value.trim();
            payload.address = { city: payload.city }; // Ensure structure
        } else if (type === 'category') {
            payload.isActive = true;
            // Determine categoryType based on context
            // If partyType dropdown exists (Parties page), use it
            // Otherwise, default to 'item' (Items page)
            const partyTypeSelect = document.getElementById('partyType');
            if (partyTypeSelect && partyTypeSelect.value) {
                payload.categoryType = partyTypeSelect.value; // 'customer' or 'supplier'
            } else {
                payload.categoryType = 'item'; // Default to item category (for Items page)
            }
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (response.ok) {
            const data = await response.json();
            const newItem = data.data;

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('quickAddModal'));
            modal.hide();

            showSuccess(`${capitalize(type)} added successfully`);

            // Trigger callback to refresh main page dropdown
            if (window._quickAddCallback) {
                await window._quickAddCallback();
            }

            // Also try to auto-select the new item in the dropdown
            const selectId = window._quickAddTargetSelectId || type;
            const select = document.getElementById(selectId);
            if (select && newItem) {
                // If the callback didn't select it, we try to find it
                // Note: The callback usually reloads the whole dropdown, so we might need to select it after a delay
                // or the callback implementation needs to handle selection.
                // For now, we trust the callback reloads the list.
                // We'll set the value explicitly if we can match it.
                setTimeout(() => {
                    const optionToSelect = Array.from(select.options).find(opt => opt.value === newItem._id || opt.text === newItem.name);
                    if (optionToSelect) {
                        select.value = optionToSelect.value;
                    } else if (type === 'category' || type === 'unit') {
                        // Fallback for string-based or name-based
                        select.value = newItem.name;
                    }
                }, 500);
            }

        } else {
            const error = await response.json();
            showError(error.message || `Failed to add ${type}`);
        }
    } catch (error) {
        console.error(`Error adding ${type}:`, error);
        showError(`Failed to add ${type}`);
    } finally {
        hideLoading();
    }
}

/**
 * Select item from list (existing item)
 */
function selectQuickAddItem(type, id, name) {
    const targetId = window._quickAddTargetSelectId || type;
    const select = document.getElementById(targetId);
    if (select) {
        // Try to match by ID first, then by Text
        let matched = false;

        // If ID matches
        if (select.querySelector(`option[value="${id}"]`)) {
            select.value = id;
            matched = true;
        }
        // If Name matches (for string-based categories etc)
        else if (select.querySelector(`option[value="${name}"]`)) {
            select.value = name;
            matched = true;
        }
        // If text content matches
        else {
            const option = Array.from(select.options).find(opt => opt.text === name);
            if (option) {
                select.value = option.value;
                matched = true;
            }
        }

        if (!matched) {
            // Force create option if allowed/needed (rare)
            // Or just alert user
            const option = document.createElement('option');
            option.value = id; // or name
            option.text = name;
            option.selected = true;
            select.appendChild(option);
        }

        const modal = bootstrap.Modal.getInstance(document.getElementById('quickAddModal'));
        modal.hide();
        showSuccess('Selected');
    }
}

/**
 * Edit item from quick add list
 */
function editQuickAddItem(type, id, name, code) {
    // Populate the form with the existing values
    document.getElementById('quickAddName').value = name;
    document.getElementById('quickAddCode').value = code !== '-' ? code : '';

    // Store the ID for update
    window._quickAddEditId = id;

    // Change the button text to "Update"
    const saveBtn = document.querySelector('#quickAddForm button[onclick*="handleQuickAdd"]');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Update';
        saveBtn.setAttribute('onclick', `handleQuickAddUpdate('${type}')`);
    }

    // Focus on name field
    document.getElementById('quickAddName').focus();

    showSuccess('Editing: ' + name);
}

/**
 * Handle quick add update (Edit mode)
 */
async function handleQuickAddUpdate(type) {
    const id = window._quickAddEditId;
    if (!id) {
        showError('No item selected for editing');
        return;
    }

    const name = document.getElementById('quickAddName').value.trim();
    const code = document.getElementById('quickAddCode').value.trim();

    if (!name) {
        showError('Name is required');
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const endpoint = getQuickAddEndpoint(type, false); // Get base endpoint
        const updateUrl = endpoint.split('?')[0] + '/' + id; // Remove query params and add ID

        // Build Payload
        let payload = { name };
        if (code) payload.code = code;
        if (code) payload.description = code;

        const response = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (response.ok) {
            showSuccess(`${capitalize(type)} updated successfully`);

            // Clear edit mode
            window._quickAddEditId = null;
            document.getElementById('quickAddName').value = '';
            document.getElementById('quickAddCode').value = '';

            // Reset button back to "Save & Select"
            const saveBtn = document.querySelector('#quickAddForm button[onclick*="handleQuickAdd"]');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save & Select';
                saveBtn.setAttribute('onclick', `handleQuickAdd('${type}')`);
            }

            // Refresh the list
            loadQuickAddList(type);

            // Trigger callback to refresh main page dropdown
            if (window._quickAddCallback) {
                await window._quickAddCallback();
            }
        } else {
            const error = await response.json();
            showError(error.message || `Failed to update ${type}`);
        }
    } catch (error) {
        console.error(`Error updating ${type}:`, error);
        showError(`Failed to update ${type}`);
    } finally {
        hideLoading();
    }
}

/**
 * Delete item from quick add list
 */
async function deleteQuickAddItem(type, id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
        return;
    }

    try {
        showLoading();

        const token = localStorage.getItem('token');
        const endpoint = getQuickAddEndpoint(type, false); // Get base endpoint
        const deleteUrl = endpoint.split('?')[0] + '/' + id; // Remove query params and add ID

        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (response.ok) {
            showSuccess(`${capitalize(type)} deleted successfully`);

            // Refresh the list
            loadQuickAddList(type);

            // Trigger callback to refresh main page dropdown
            if (window._quickAddCallback) {
                await window._quickAddCallback();
            }
        } else {
            const error = await response.json();
            showError(error.message || `Failed to delete ${type}`);
        }
    } catch (error) {
        console.error(`Error deleting ${type}:`, error);
        showError(`Failed to delete ${type}`);
    } finally {
        hideLoading();
    }
}

/**
 * Get API endpoint for quick add
 */
function getQuickAddEndpoint(type, isGet) {
    // Base endpoints
    const endpoints = {
        'category': '/api/v1/categories',
        'customer-category': '/api/v1/customer-categories',
        'supplier-category': '/api/v1/supplier-categories',
        'company': '/api/v1/companies',
        'supplier': '/api/v1/parties?partyType=supplier', // For GET
        'customer': '/api/v1/parties?partyType=customer', // For GET
        'class': '/api/v1/classes',
        'subclass': '/api/v1/subclasses',
        'unit': '/api/v1/units'
    };

    let url = endpoints[type];

    // Handle generic category type - use dedicated endpoints based on partyType context
    if (type === 'category') {
        const partyTypeSelect = document.getElementById('partyType');
        if (partyTypeSelect && partyTypeSelect.value === 'customer') {
            url = '/api/v1/customer-categories';
        } else if (partyTypeSelect && partyTypeSelect.value === 'supplier') {
            url = '/api/v1/supplier-categories';
        } else {
            url = '/api/v1/item-categories'; // Default to item categories
        }
    }

    // Adjust for POST (create) vs GET (list)
    if (!isGet) {
        if (type === 'supplier' || type === 'customer') {
            url = '/api/v1/parties'; // POST creates party
        }
    }

    return url || '/api/v1/' + type + 's';
}

// ============================================
// Real-time Calculation Functions
// ============================================

/**
 * Calculate line total (quantity * price)
 */
function calculateLineTotal(quantity, price, taxPercent = 0, discountPercent = 0) {
    const subtotal = parseFloat(quantity || 0) * parseFloat(price || 0);
    const discount = subtotal * (parseFloat(discountPercent || 0) / 100);
    const afterDiscount = subtotal - discount;
    const tax = afterDiscount * (parseFloat(taxPercent || 0) / 100);
    const total = afterDiscount + tax;

    return {
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2)
    };
}

/**
 * Calculate grand total from items array
 */
function calculateGrandTotal(items, additionalCharges = {}) {
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    items.forEach(item => {
        const calc = calculateLineTotal(
            item.quantity,
            item.price,
            item.taxPercent,
            item.discountPercent
        );
        subtotal += parseFloat(calc.subtotal);
        totalTax += parseFloat(calc.tax);
        totalDiscount += parseFloat(calc.discount);
    });

    const freight = parseFloat(additionalCharges.freight || 0);
    const misc = parseFloat(additionalCharges.misc || 0);
    const grandTotal = subtotal - totalDiscount + totalTax + freight + misc;

    return {
        subtotal: subtotal.toFixed(2),
        totalDiscount: totalDiscount.toFixed(2),
        totalTax: totalTax.toFixed(2),
        freight: freight.toFixed(2),
        misc: misc.toFixed(2),
        grandTotal: grandTotal.toFixed(2)
    };
}

/**
 * Update calculation fields in real-time
 */
function updateCalculationFields(fieldId, value) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.value = value;
        // Trigger change event for any listeners
        field.dispatchEvent(new Event('change'));
    }
}

// ============================================
// Form Validation
// ============================================

/**
 * Validate required fields
 */
function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;

    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    let firstInvalidField = null;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.classList.add('is-invalid');
            isValid = false;
            if (!firstInvalidField) firstInvalidField = field;
        } else {
            field.classList.remove('is-invalid');
        }
    });

    if (!isValid && firstInvalidField) {
        firstInvalidField.focus();
        showError('Please fill in all required fields');
    }

    return isValid;
}

/**
 * Clear form validation errors
 */
function clearValidationErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const invalidFields = form.querySelectorAll('.is-invalid');
    invalidFields.forEach(field => field.classList.remove('is-invalid'));
}

// ============================================
// Table Helpers
// ============================================

/**
 * Add row to data table
 */
function addTableRow(tableId, rowData, rowIndex) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    const row = tbody.insertRow(rowIndex !== undefined ? rowIndex : -1);
    row.innerHTML = rowData;

    // Add hover effect
    row.addEventListener('mouseenter', function () {
        this.style.background = '#E9ECEF';
    });
    row.addEventListener('mouseleave', function () {
        this.style.background = '';
    });

    return row;
}

/**
 * Remove row from table
 */
function removeTableRow(rowElement) {
    if (confirm('Are you sure you want to remove this item?')) {
        rowElement.remove();
        return true;
    }
    return false;
}

/**
 * Clear table body
 */
function clearTable(tableId) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (tbody) {
        tbody.innerHTML = '';
    }
}

/**
 * Update table row
 */
function updateTableRow(rowElement, rowData) {
    if (rowElement) {
        rowElement.innerHTML = rowData;
    }
}

// ============================================
// Dropdown Helpers
// ============================================

/**
 * Populate dropdown from API data
 */
function populateDropdown(selectId, data, valueField = '_id', textField = 'name', includeEmpty = true) {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Store current value
    const currentValue = select.value;

    // Clear existing options
    select.innerHTML = '';

    // Add empty option
    if (includeEmpty) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Select --';
        select.appendChild(emptyOption);
    }

    // Add data options
    data.forEach(item => {
        const option = document.createElement('option');
        // Handle if item is string
        if (typeof item === 'string') {
            option.value = item;
            option.textContent = item;
        } else {
            option.value = item[valueField];
            option.textContent = item[textField];
        }
        select.appendChild(option);
    });

    // Restore previous value if it exists
    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
    }
}

/**
 * Add option to dropdown
 */
function addDropdownOption(selectId, value, text, selected = false) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    if (selected) option.selected = true;

    select.appendChild(option);
}

// ============================================
// Keyboard Shortcuts
// ============================================

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
        // Alt+S: Save
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            // Find all save buttons
            const saveBtns = document.querySelectorAll('[data-action="save"]');
            // Click the first visible one
            for (const btn of saveBtns) {
                if (btn.offsetParent !== null) {
                    btn.click();
                    return; // Stop after clicking one
                }
            }
        }

        // Alt+X: Search/Clear
        if (e.altKey && e.key === 'x') {
            e.preventDefault();
            const searchInput = document.querySelector('.search-input');
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
        }

        // Alt+N: New/Add
        if (e.altKey && e.key === 'n') {
            e.preventDefault();
            const addBtn = document.querySelector('[data-action="add"]');
            if (addBtn) addBtn.click();
        }

        // Escape: Close modal/Clear form
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.show');
            if (activeModal) {
                const modal = bootstrap.Modal.getInstance(activeModal);
                if (modal) modal.hide();
            }
        }
    });
}

// ============================================
// Print Functions
// ============================================

/**
 * Print current page
 */
function printPage() {
    window.print();
}

/**
 * Print specific element
 */
function printElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Print</title>');
    printWindow.document.write('<link rel="stylesheet" href="/css/desktop-style.css">');
    printWindow.document.write('</head><body>');
    printWindow.document.write(element.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// ============================================
// Utility Functions
// ============================================

/**
 * Capitalize first letter
 */
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format number with commas
 */
function formatNumber(num, decimals = 2) {
    const number = parseFloat(num || 0);
    return number.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Format currency
 */
function formatCurrency(amount, currency = 'PKR') {
    const number = parseFloat(amount || 0);
    return `${currency} ${formatNumber(number, 2)}`;
}

/**
 * Parse formatted number
 */
function parseFormattedNumber(str) {
    if (typeof str === 'number') return str;
    return parseFloat(str.replace(/,/g, '') || 0);
}

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Generate unique ID
 */
function generateUniqueId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ============================================
// Initialize Desktop UI
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();

    // Auto-focus first input in forms
    const firstInput = document.querySelector('.form-section input:not([type="hidden"]):not([disabled])');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
    }

    // Add number formatting to currency fields
    document.querySelectorAll('input[type="number"].currency').forEach(input => {
        input.addEventListener('blur', function () {
            if (this.value) {
                this.value = parseFloat(this.value).toFixed(2);
            }
        });
    });

    // Prevent form submission on Enter (except in textareas)
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                // Move to next input
                const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
                const index = inputs.indexOf(e.target);
                if (index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            }
        });
    });
});

// Export functions to global scope
window.DesktopUI = {
    showQuickAddDialog,
    handleQuickAdd,
    handleQuickAddUpdate,
    getQuickAddFields,
    calculateLineTotal,
    calculateGrandTotal,
    updateCalculationFields,
    validateForm,
    clearValidationErrors,
    addTableRow,
    removeTableRow,
    clearTable,
    updateTableRow,
    populateDropdown,
    addDropdownOption,
    printPage,
    printElement,
    formatNumber,
    formatCurrency,
    parseFormattedNumber,
    debounce,
    generateUniqueId,
    // Expose select, edit, delete for onclick used in string template
    selectQuickAddItem,
    editQuickAddItem,
    deleteQuickAddItem
};


function updateStatistics() { console.log('Legacy updateStatistics suppressed'); }

