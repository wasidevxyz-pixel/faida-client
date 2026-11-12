let departments = [];
let designations = [];
let currentEmployeeId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadStores();
    await loadDepartments();
    await loadDesignations();
    await fetchNextCode();
    setDefaultDates();
    checkEmployeeListPermission();
    checkAccessParaPermission();

    // Check for ID in URL if redirected from list
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if (id) {
        await editEmployee(id);
    } else {
        calculateTotalHours();
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            saveEmployee();
        }
    });
});

async function loadStores() {
    await window.populateBranchSelect('branch', {
        placeholder: 'Select Branch',
        placeholderDisabled: true
    });
}

async function fetchNextCode() {
    if (currentEmployeeId) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetchWithRetry(`/api/v1/employees/next-code?t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const codeInput = document.getElementById('code');
            codeInput.value = data.data;
        }
    } catch (err) { console.error('Fetch code error:', err); }
}

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('joiningDate').value = today;
    document.getElementById('issueDate').value = today;
    document.getElementById('incrDate').value = today;
    document.getElementById('expiryDate').value = today;

    document.getElementById('fDutyTime').addEventListener('change', calculateTotalHours);
    document.getElementById('tDutyTime').addEventListener('change', calculateTotalHours);

    document.getElementById('payFullSalaryThroughBank').addEventListener('change', (e) => {
        document.getElementById('selectBank').style.border = '';
        ['bank_hbl', 'bank_alf', 'bank_bop', 'bank_bip', 'bank_bahl'].forEach(id => {
            document.getElementById(id).style.border = '';
        });
    });
    document.getElementById('selectBank').addEventListener('change', (e) => {
        e.target.style.border = '';
        syncAccNo();
    });
    ['bank_hbl', 'bank_alf', 'bank_bop', 'bank_bip', 'bank_bahl'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', (e) => {
            e.target.style.border = '';
            syncAccNo();
        });
    });

    document.getElementById('basicSalary').addEventListener('input', () => {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('incrDate').value = today;
    });
}

function syncAccNo() {
    const selectedBank = document.getElementById('selectBank').value;
    const acNoInput = document.getElementById('acNo');
    if (!selectedBank) { acNoInput.value = ''; return; }
    const bankInputId = `bank_${selectedBank.toLowerCase()}`;
    const bankVal = document.getElementById(bankInputId).value;
    acNoInput.value = bankVal;
}

function toTimeInputValue(timeStr) {
    if (!timeStr || timeStr === '--:--' || timeStr === '--:-- --') return '';

    const raw = String(timeStr).trim();
    if (/^\d{2}:\d{2}$/.test(raw)) return raw;

    // HH:MM:SS -> HH:MM
    const hmsMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hmsMatch && !/am|pm/i.test(raw)) {
        return `${String(Number(hmsMatch[1])).padStart(2, '0')}:${hmsMatch[2]}`;
    }

    // 12-hour format e.g. "09:00 AM", "9:00 PM"
    const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (ampmMatch) {
        let hours = Number(ampmMatch[1]);
        const minutes = ampmMatch[2];
        const ampm = (ampmMatch[3] || '').toUpperCase();
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    return '';
}

function calculateTotalHours() {
    const fromTime = document.getElementById('fDutyTime').value;
    const toTime = document.getElementById('tDutyTime').value;
    const totalHrsInput = document.getElementById('totalHrs');
    if (!fromTime || !toTime) { totalHrsInput.value = ''; return; }
    const [fromH, fromM] = fromTime.split(':').map(Number);
    const [toH, toM] = toTime.split(':').map(Number);
    let diffMin = (toH * 60 + toM) - (fromH * 60 + fromM);
    if (diffMin < 0) diffMin += 24 * 60;

    // Only display the calculated hours — validation happens on save, not here
    const hours = Math.floor(diffMin / 60);
    const minutes = diffMin % 60;
    totalHrsInput.value = `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`.trim();
}

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const data = await cachedFetch('/api/v1/employee-departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (data && data.success) {
            departments = data.data;
            const select = document.getElementById('department');
            const savedVal = select.value;
            select.innerHTML = '<option value="">Select Department</option>';
            departments.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                select.appendChild(opt);
            });
            if (savedVal) select.value = savedVal;
            renderDeptList();
        } else {
            console.warn('Failed to load employee departments:', data?.message || data);
        }
    } catch (err) { console.error('Error loading departments:', err); }
}

async function loadDesignations() {
    try {
        const token = localStorage.getItem('token');
        const data = await cachedFetch('/api/v1/designations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (data && data.success) {
            designations = data.data;
            const select = document.getElementById('designation');
            const savedVal = select.value;
            select.innerHTML = '<option value="">Select Designation</option>';
            designations.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                select.appendChild(opt);
            });
            if (savedVal) select.value = savedVal;
            renderDesignationList();
        } else {
            console.warn('Failed to load designations:', data?.message || data);
        }
    } catch (err) { console.error('Error loading designations:', err); }
}

function openDeptModal() {
    const nameInput = document.getElementById('newDeptName');
    delete nameInput.dataset.id;
    nameInput.value = '';
    document.getElementById('saveDeptBtn').textContent = 'Save';
    new bootstrap.Modal(document.getElementById('deptModal')).show();
    renderDeptList();
}

function openDeptList() { openDeptModal(); }

function renderDeptList() {
    const container = document.getElementById('deptListContainer');
    if (!container) return;

    // Check if current user is admin
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = user.role === 'admin';

    container.innerHTML = departments.map(d => `
        <div class="list-group-item d-flex justify-content-between align-items-center py-2">
            <div>
                <span class="fw-bold d-block" style="font-size:0.85rem;">${d.name}</span>
                <span class="text-muted small">Max Checkout: ${d.maxCheckoutTime || '03:00'}</span>
            </div>
            <div>
                <button type="button" class="btn btn-sm btn-outline-primary p-1 py-0 me-1" onclick="editDept('${d._id}', '${d.name}', '${d.maxCheckoutTime || '03:00'}')"><i class="fas fa-edit"></i></button>
                ${isAdmin ? `<button type="button" class="btn btn-sm btn-outline-danger p-1 py-0" onclick="deleteDept('${d._id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </div>
    `).join('') || '<div class="p-3 text-center text-muted small">No departments found</div>';
}

async function saveNewDepartment() {
    const nameInput = document.getElementById('newDeptName');
    const maxCheckoutInput = document.getElementById('deptMaxCheckout');
    const name = nameInput.value;
    const maxCheckoutTime = maxCheckoutInput.value;
    const id = nameInput.dataset.id;
    if (!name) return;
    try {
        const token = localStorage.getItem('token');
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/v1/employee-departments/${id}` : '/api/v1/employee-departments';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, maxCheckoutTime })
        });
        if (res.ok) {
            nameInput.value = '';
            delete nameInput.dataset.id;
            document.getElementById('saveDeptBtn').textContent = 'Save';
            await loadDepartments();
        }
    } catch (err) { console.error(err); }
}

function editDept(id, name, maxTime) {
    const nameInput = document.getElementById('newDeptName');
    const maxInput = document.getElementById('deptMaxCheckout');
    nameInput.value = name;
    maxInput.value = maxTime || '03:00';
    nameInput.dataset.id = id;
    document.getElementById('saveDeptBtn').textContent = 'Update';
}

async function deleteDept(id) {
    if (!confirm('Delete department?')) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employee-departments/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) { await loadDepartments(); }
    } catch (err) { console.error(err); }
}

function openDesigModal() {
    const input = document.getElementById('newDesigName');
    delete input.dataset.id;
    input.value = '';
    document.getElementById('saveDesigBtn').textContent = 'Save';
    new bootstrap.Modal(document.getElementById('desigModal')).show();
    renderDesignationList();
}

function openDesigList() { openDesigModal(); }

function renderDesignationList() {
    const container = document.getElementById('desigListContainer');
    if (!container) return;

    // Check if current user is admin
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = user.role === 'admin';

    container.innerHTML = designations.map(d => `
        <div class="list-group-item d-flex justify-content-between align-items-center py-2">
            <span class="fw-bold" style="font-size:0.85rem;">${d.name}</span>
            <div>
                <button type="button" class="btn btn-sm btn-outline-primary p-1 py-0 me-1" onclick="editDesig('${d._id}', '${d.name}')"><i class="fas fa-edit"></i></button>
                ${isAdmin ? `<button type="button" class="btn btn-sm btn-outline-danger p-1 py-0" onclick="deleteDesig('${d._id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </div>
    `).join('') || '<div class="p-3 text-center text-muted small">No designations found</div>';
}

async function saveNewDesignation() {
    const input = document.getElementById('newDesigName');
    const name = input.value;
    const id = input.dataset.id;
    if (!name) return;
    try {
        const token = localStorage.getItem('token');
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/v1/designations/${id}` : '/api/v1/designations';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            input.value = '';
            delete input.dataset.id;
            document.getElementById('saveDesigBtn').textContent = 'Save';
            await loadDesignations();
        }
    } catch (err) { console.error(err); }
}

function editDesig(id, name) {
    const input = document.getElementById('newDesigName');
    input.value = name;
    input.dataset.id = id;
    document.getElementById('saveDesigBtn').textContent = 'Update';
}

async function deleteDesig(id) {
    if (!confirm('Delete designation?')) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/designations/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) { await loadDesignations(); }
    } catch (err) { console.error(err); }
}

async function saveEmployee() {
    console.log('--- Save Employee Triggered (Validation v4.2) ---');

    // 1. Bank Payment Validation (Priority Check)
    const payBank = document.getElementById('payFullSalaryThroughBank').checked;
    const selectedBank = document.getElementById('selectBank').value;

    if (payBank) {
        if (!selectedBank || selectedBank === '') {
            alert('⚠️ BANK PAYMENT ERROR: "Pay Full Salary Through Bank" is active, but NO BANK is selected in the Profile section. Please select a bank to continue.');
            document.getElementById('selectBank').focus();
            document.getElementById('selectBank').style.border = '2px solid red';
            return;
        }

        const bankInputId = `bank_${selectedBank.toLowerCase()}`;
        const bankInput = document.getElementById(bankInputId);
        const bankAccNo = bankInput ? bankInput.value.trim() : '';

        if (!bankAccNo) {
            alert(`⚠️ ACCOUNT NUMBER MISSING: Please enter the Account Number for ${selectedBank} in the Bank Details section.`);
            if (bankInput) {
                bankInput.focus();
                bankInput.style.border = '2px solid red';
            }
            return;
        }
    }

    // 2. Standard Required Fields
    const requiredFields = {
        'name': 'Employee Name',
        'branch': 'Branch',
        'department': 'Department',
        'designation': 'Designation',
        'incrDate': 'Increment Date',
        'joiningDate': 'Joining Date',
        'gender': 'Gender',
        'religion': 'Religion',
        'maritalStatus': 'Marital Status',
        'fDutyTime': 'From Duty Time',
        'tDutyTime': 'To Duty Time'
    };

    for (const [id, label] of Object.entries(requiredFields)) {
        const val = document.getElementById(id).value;
        if (!val || val === 'Select Branch' || val === '') {
            alert(`Please fill mandatory field: ${label}`);
            document.getElementById(id).focus();
            return;
        }
    }

    // 3. Duty Hours Validation (Must not exceed 12 hours)
    const fromTimeVal = document.getElementById('fDutyTime').value;
    const toTimeVal = document.getElementById('tDutyTime').value;
    if (fromTimeVal && toTimeVal) {
        const [fromH, fromM] = fromTimeVal.split(':').map(Number);
        const [toH, toM] = toTimeVal.split(':').map(Number);
        let diffMin = (toH * 60 + toM) - (fromH * 60 + fromM);
        if (diffMin < 0) diffMin += 24 * 60;
        if (diffMin > 720) {
            alert('⚠️ DUTY HOURS ERROR: Duty hours cannot be greater than 12 hours. Please adjust From Duty Time and To Duty Time.');
            document.getElementById('tDutyTime').focus();
            return;
        }
    }

    const employeeData = {
        code: document.getElementById('code').value,
        name: document.getElementById('name').value,
        name_urdu: document.getElementById('name_urdu') ? document.getElementById('name_urdu').value : '',
        fatherName: document.getElementById('fatherName').value,
        cnic: document.getElementById('cnic').value,
        branch: document.getElementById('branch').value,
        department: document.getElementById('department').value,
        designation: document.getElementById('designation').value,
        address: document.getElementById('address').value,
        acNo: document.getElementById('acNo').value,
        selectBank: document.getElementById('selectBank').value,
        mobileNo: document.getElementById('mobileNo').value,
        dateOfBirth: document.getElementById('dateOfBirth').value,
        issueDate: document.getElementById('issueDate').value,
        joiningDate: document.getElementById('joiningDate').value,
        incrDate: document.getElementById('incrDate').value,
        expiryDate: document.getElementById('expiryDate').value,
        gender: document.getElementById('gender').value,
        religion: document.getElementById('religion').value,
        maritalStatus: document.getElementById('maritalStatus').value,
        isActive: document.getElementById('isActive').checked,
        commEmp: document.getElementById('isSalesman').checked,
        photo: (function () {
            const img = document.getElementById('photoPreview').querySelector('img');
            return img ? img.src : '';
        })(),
        idCardFront: (function () {
            const preview = document.getElementById('frontPreview');
            const img = preview.querySelector('img');
            // If it's a PDF, we'll store the object/data in a data attribute
            return img ? img.src : (preview.dataset.fileData || '');
        })(),
        idCardBack: (function () {
            const preview = document.getElementById('backPreview');
            const img = preview.querySelector('img');
            return img ? img.src : (preview.dataset.fileData || '');
        })(),

        opening: parseFloat(document.getElementById('opening').value) || 0,
        basicSalary: parseFloat(document.getElementById('basicSalary').value) || 0,
        salaryType: document.getElementById('salaryType').value,
        stLoss: parseFloat(document.getElementById('stLoss').value) || 0,
        fixAllowance: parseFloat(document.getElementById('fixAllowance').value) || 0,
        otherAllowance: parseFloat(document.getElementById('otherAllowance').value) || 0,
        allowFood: document.getElementById('allowFood').value || 'No Food',
        foodAllowanceRs: parseFloat(document.getElementById('foodAllowanceRs').value) || 0,
        bankCash: document.getElementById('bankCash').value,
        deduction: parseFloat(document.getElementById('deduction').value) || 0,
        securityDeposit: parseFloat(document.getElementById('securityDeposit').value) || 0,
        fDutyTime: document.getElementById('fDutyTime').value,
        tDutyTime: document.getElementById('tDutyTime').value,
        offDay: document.getElementById('offDay').value,
        totalHrs: document.getElementById('totalHrs').value,

        allowOvertime: document.getElementById('allowOvertime').checked,
        otst30WorkingDays: document.getElementById('otst30WorkingDays').checked,
        eobi: document.getElementById('eobi').checked,
        payFullSalaryThroughBank: document.getElementById('payFullSalaryThroughBank').checked,
        electricityBill: document.getElementById('electricityBill').checked,
        thirtyWorkingDays: document.getElementById('thirtyWorkingDays').checked,
        allowEmployeeAdvance: document.getElementById('allowEmployeeAdvance').checked,
        allowRottiPerks: document.getElementById('allowRottiPerks').checked,
        dontAllowRottiPerks: document.getElementById('dontAllowRottiPerks').checked,
        allowNashtaPerks: document.getElementById('allowNashtaPerks').checked,
        dontAllowNashtaPerks: document.getElementById('dontAllowNashtaPerks').checked,

        bankDetails: {
            hbl: document.getElementById('bank_hbl').value,
            alf: document.getElementById('bank_alf').value,
            bop: document.getElementById('bank_bop').value,
            bip: document.getElementById('bank_bip').value,
            bahl: document.getElementById('bank_bahl').value
        }
    };

    try {
        const token = localStorage.getItem('token');
        const method = currentEmployeeId ? 'PUT' : 'POST';
        const url = currentEmployeeId ? `/api/v1/employees/${currentEmployeeId}` : '/api/v1/employees';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(employeeData)
        });
        const result = await res.json();
        if (result.success) {
            window.clearCachedFetch('/api/v1/employees');
            // Store the saved employee ID so the ID card button works
            if (!currentEmployeeId && result.data && result.data._id) {
                currentEmployeeId = result.data._id;
            }
            const savedId = currentEmployeeId;
            alert(currentEmployeeId ? 'Employee Updated!' : 'Employee Saved!');
            clearForm();
            // Restore ID and show button after clearForm resets it
            currentEmployeeId = savedId;
            const btnCard = document.getElementById('btnIdCard');
            if (btnCard && savedId) btnCard.style.display = 'block';
        } else { alert('Error: ' + result.message); }
    } catch (err) { console.error('Save error:', err); alert('Failed to save'); }
}

async function editEmployee(id) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetchWithRetry(`/api/v1/employees/${id}?t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data && data.success) {
            const emp = data.data;
            currentEmployeeId = emp._id;
            document.getElementById('code').value = emp.code || '';
            document.getElementById('name').value = emp.name || '';
            if (document.getElementById('name_urdu')) document.getElementById('name_urdu').value = emp.name_urdu || '';
            document.getElementById('fatherName').value = emp.fatherName || '';
            document.getElementById('cnic').value = emp.cnic || '';
            document.getElementById('branch').value = emp.branch || '';
            document.getElementById('department').value = emp.department?._id || '';
            document.getElementById('designation').value = emp.designation?._id || '';
            document.getElementById('address').value = emp.address || '';
            document.getElementById('acNo').value = emp.acNo || '';
            document.getElementById('selectBank').value = emp.selectBank || '';
            document.getElementById('mobileNo').value = emp.mobileNo || '';
            document.getElementById('dateOfBirth').value = emp.dateOfBirth ? emp.dateOfBirth.split('T')[0] : '';
            document.getElementById('issueDate').value = emp.issueDate ? emp.issueDate.split('T')[0] : '';
            document.getElementById('joiningDate').value = emp.joiningDate ? emp.joiningDate.split('T')[0] : '';
            document.getElementById('incrDate').value = emp.incrDate ? emp.incrDate.split('T')[0] : '';
            document.getElementById('expiryDate').value = emp.expiryDate ? emp.expiryDate.split('T')[0] : '';
            document.getElementById('gender').value = emp.gender || 'Male';
            document.getElementById('religion').value = emp.religion || 'Islam';
            document.getElementById('maritalStatus').value = emp.maritalStatus || 'Single';
            document.getElementById('isActive').checked = emp.isActive !== false;
            document.getElementById('isSalesman').checked = emp.commEmp || false;

            document.getElementById('opening').value = emp.opening || 0;
            document.getElementById('basicSalary').value = emp.basicSalary || 0;
            document.getElementById('salaryType').value = emp.salaryType || 'Per Month';
            document.getElementById('stLoss').value = emp.stLoss || 0;
            document.getElementById('fixAllowance').value = emp.fixAllowance || 0;
            document.getElementById('otherAllowance').value = emp.otherAllowance || 0;
            document.getElementById('allowFood').value = emp.allowFood || 'No Food';
            document.getElementById('bankCash').value = emp.bankCash || 'Cash';

            // Set Photo Preview
            const photoPreview = document.getElementById('photoPreview');
            if (emp.photo) {
                let photoSrc = emp.photo;
                // If it's not a data URL and not an absolute link, try prepending ServerUrl
                if (!photoSrc.startsWith('data:') && !photoSrc.startsWith('http')) {
                    const serverUrl = typeof _config !== 'undefined' && _config?.ServerUrl ? _config.ServerUrl : '';
                    photoSrc = serverUrl + photoSrc;
                }
                photoPreview.innerHTML = `<img src="${photoSrc}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">
                                          <div class="remove-photo-btn" style="display: flex;" onclick="event.stopPropagation(); removePhoto()"><i class="fas fa-times"></i></div>`;
            } else {
                photoPreview.innerHTML = `<div class="photo-placeholder"><i class="fas fa-camera"></i></div>
                                          <div class="remove-photo-btn" onclick="event.stopPropagation(); removePhoto()"><i class="fas fa-times"></i></div>`;
            }

            document.getElementById('deduction').value = emp.deduction || 0;
            document.getElementById('securityDeposit').value = emp.securityDeposit || 0;
            document.getElementById('fDutyTime').value = toTimeInputValue(emp.fDutyTime) || '09:00';
            document.getElementById('tDutyTime').value = toTimeInputValue(emp.tDutyTime) || '21:00';
            document.getElementById('offDay').value = emp.offDay || 'Sunday';
            calculateTotalHours();

            document.getElementById('allowOvertime').checked = emp.allowOvertime || false;
            document.getElementById('otst30WorkingDays').checked = emp.otst30WorkingDays || false;
            document.getElementById('eobi').checked = emp.eobi || false;
            document.getElementById('payFullSalaryThroughBank').checked = emp.payFullSalaryThroughBank || false;
            document.getElementById('electricityBill').checked = emp.electricityBill || false;
            document.getElementById('thirtyWorkingDays').checked = emp.thirtyWorkingDays || false;
            document.getElementById('allowEmployeeAdvance').checked = emp.allowEmployeeAdvance || false;
            document.getElementById('allowRottiPerks').checked = emp.allowRottiPerks || false;
            document.getElementById('dontAllowRottiPerks').checked = emp.dontAllowRottiPerks || false;
            document.getElementById('allowNashtaPerks').checked = emp.allowNashtaPerks || false;
            document.getElementById('dontAllowNashtaPerks').checked = emp.dontAllowNashtaPerks || false;

            if (emp.bankDetails) {
                document.getElementById('bank_hbl').value = emp.bankDetails.hbl || '';
                document.getElementById('bank_alf').value = emp.bankDetails.alf || '';
                document.getElementById('bank_bop').value = emp.bankDetails.bop || '';
                document.getElementById('bank_bip').value = emp.bankDetails.bip || '';
                document.getElementById('bank_bahl').value = emp.bankDetails.bahl || '';
            }

            // Set ID Card Documents
            if (emp.idCardFront) {
                updateDocumentPreview('front', emp.idCardFront);
            } else {
                resetDocumentPreview('front');
            }
            if (emp.idCardBack) {
                updateDocumentPreview('back', emp.idCardBack);
            } else {
                resetDocumentPreview('back');
            }

            // Apply access control after data is loaded
            checkAccessParaPermission();

            // Show ID card button for existing employees
            const btnCard = document.getElementById('btnIdCard');
            if (btnCard) btnCard.style.display = 'block';
        }
    } catch (err) { console.error('Edit error:', err); }
}

function clearForm() {
    currentEmployeeId = null;
    document.getElementById('employeeForm').reset();
    // Hide ID card button when form is cleared
    const btnCard = document.getElementById('btnIdCard');
    if (btnCard) btnCard.style.display = 'none';

    // Clear URL to prevent re-loading on refresh
    window.history.pushState({}, document.title, window.location.pathname);

    // Reset Photo
    document.getElementById('photoPreview').innerHTML = `<div class="photo-placeholder"><i class="fas fa-camera"></i></div>
                                                         <div class="remove-photo-btn" onclick="event.stopPropagation(); removePhoto()"><i class="fas fa-times"></i></div>`;
    document.getElementById('photoInput').value = '';
    const removeBtns = document.querySelectorAll('.remove-photo-btn');
    removeBtns.forEach(btn => btn.style.display = 'none');


    setDefaultDates();
    fetchNextCode();

    // Set Access Control Defaults
    document.getElementById('allowOvertime').checked = true;
    document.getElementById('otst30WorkingDays').checked = true;
    document.getElementById('allowEmployeeAdvance').checked = true;

    // Set Profile Defaults
    document.getElementById('gender').value = 'Male';
    document.getElementById('religion').value = 'Islam';
    document.getElementById('maritalStatus').value = 'Single';

    resetDocumentPreview('front');
    resetDocumentPreview('back');

    calculateTotalHours();

    // Apply access control for New Employee mode
    checkAccessParaPermission();
}

function previewDocument(input, type) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.type === 'application/pdf') {
            const reader = new FileReader();
            reader.onload = function (e) {
                updateDocumentPreview(type, e.target.result, file.type);
            }
            reader.readAsDataURL(file);
        } else {
            // ID Cards need a bit more detail, so we use 1000px width
            compressImage(file, (compressedData) => {
                updateDocumentPreview(type, compressedData, file.type);
            }, 1000, 0.7);
        }
    }
}

function updateDocumentPreview(type, data, mimeType = '') {
    const previewId = type === 'front' ? 'frontPreview' : 'backPreview';
    const preview = document.getElementById(previewId);

    // Check if it's a PDF (either by mimeType or by data content)
    const isPDF = mimeType === 'application/pdf' || data.startsWith('data:application/pdf');

    if (isPDF) {
        preview.innerHTML = `<div class="text-danger"><i class="fas fa-file-pdf fa-2x"></i><br><span class="small">PDF Document</span></div>
                             <div class="remove-photo-btn" style="display: flex;" onclick="event.stopPropagation(); resetDocumentPreview('${type}')"><i class="fas fa-times"></i></div>`;
        preview.dataset.fileData = data;
    } else {
        preview.innerHTML = `<img src="${data}" style="width:100%; height:100%; object-fit:cover;">
                             <div class="remove-photo-btn" style="display: flex;" onclick="event.stopPropagation(); resetDocumentPreview('${type}')"><i class="fas fa-times"></i></div>`;
        delete preview.dataset.fileData; // Use img.src
    }

}

function resetDocumentPreview(type) {
    const previewId = type === 'front' ? 'frontPreview' : 'backPreview';
    const preview = document.getElementById(previewId);
    preview.innerHTML = `<span class="text-muted small"><i class="fas fa-plus"></i> Upload</span>
                         <div class="remove-photo-btn" onclick="event.stopPropagation(); resetDocumentPreview('${type}')"><i class="fas fa-times"></i></div>`;
    delete preview.dataset.fileData;

    const inputId = type === 'front' ? 'idFrontInput' : 'idBackInput';
    document.getElementById(inputId).value = '';
}

function printDocument(type) {
    const previewId = type === 'front' ? 'frontPreview' : 'backPreview';
    const preview = document.getElementById(previewId);
    const img = preview.querySelector('img');
    const fileData = img ? img.src : preview.dataset.fileData;

    if (!fileData) {
        alert('No document uploaded to print');
        return;
    }

    if (fileData.startsWith('data:application/pdf')) {
        const newTab = window.open();
        newTab.document.write(`<iframe src="${fileData}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
    } else {
        const newTab = window.open();
        newTab.document.write(`
            <html>
                <head>
                    <title>Print ID Card - ${type.toUpperCase()}</title>
                    <style>
                        body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
                        img { max-width: 100%; max-height: 100%; object-fit: contain; }
                        @media print {
                            .no-print { display: none; }
                            body { margin: 0; }
                            img { max-width: 100%; max-height: 100%; }
                        }
                    </style>
                </head>
                <body onload="window.print(); window.close();">
                    <img src="${fileData}">
                </body>
            </html>
        `);
    }
}

function previewPhoto(input) {
    if (input.files && input.files[0]) {
        // Profile photos are small, 400px width is plenty
        compressImage(input.files[0], (compressedData) => {
            const preview = document.getElementById('photoPreview');
            preview.innerHTML = `<img src="${compressedData}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">
                                 <div class="remove-photo-btn" style="display: flex;" onclick="event.stopPropagation(); removePhoto()"><i class="fas fa-times"></i></div>`;
        }, 400, 0.7);
    }
}

function removePhoto() {
    const preview = document.getElementById('photoPreview');
    preview.innerHTML = `<div class="photo-placeholder"><i class="fas fa-camera"></i></div>
                         <div class="remove-photo-btn" onclick="event.stopPropagation(); removePhoto()"><i class="fas fa-times"></i></div>`;
    document.getElementById('photoInput').value = '';
    preview.querySelector('.remove-photo-btn').style.display = 'none';
}


function compressImage(file, callback, maxWidth, quality) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function checkEmployeeListPermission() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    const permissions = user.permissions || [];

    // Strictly check for right_23 (Allow Employee List) even for admins
    const hasPermission = rights['right_23'] || permissions.includes('right_23');

    const listBtn = document.getElementById('btnEmployeeList');
    if (listBtn) {
        if (hasPermission) {
            listBtn.style.display = 'block'; // Or however you want to show it
        } else {
            listBtn.style.display = 'none';
        }
    }
}

function checkAccessParaPermission() {
    try {
        const userStr = localStorage.getItem('user');
        const user = JSON.parse(userStr || '{}');
        const rights = user.rights || {};
        const permissions = user.permissions || [];

        // Determine permission status
        // Check for right_02 in both rights object and permissions array
        const hasPermission = (rights['right_02'] === true || rights['right_02'] === 'true' || permissions.includes('right_02'));
        const isExistingEmployee = !!currentEmployeeId;
        const shouldLock = isExistingEmployee && !hasPermission;

        // --- DEBUG PANEL (Temporary for the user to see what's happening) ---
        let debugPanel = document.getElementById('para-debug-panel');
        if (!debugPanel) {
            debugPanel = document.createElement('div');
            debugPanel.id = 'para-debug-panel';
            debugPanel.style.cssText = 'position:fixed; bottom:10px; right:10px; background:rgba(0,0,0,0.8); color:white; padding:10px; border-radius:5px; z-index:10000; font-family:monospace; font-size:10px; pointer-events:none;';
            document.body.appendChild(debugPanel);
        }
        debugPanel.innerHTML = `
            USER: ${user.name || 'Unknown'}<br>
            PARA RIGHT: ${hasPermission ? 'ACTIVE' : 'INACTIVE'}<br>
            EXISTING: ${isExistingEmployee ? 'YES' : 'NO'}<br>
            RESULT: ${shouldLock ? 'LOCKED' : 'OPEN'}
        `;

        const form = document.getElementById('employeeForm');
        if (!form) return;

        // 1. Handle all standard inputs
        const inputs = form.querySelectorAll('input, select, textarea, button');
        inputs.forEach(input => {
            if (input.id === 'code' || input.id === 'btnEmployeeList' || (input.innerText && input.innerText.includes('Clear'))) return;

            // Apply Lock (Exclude isActive and any Save button)
            const isSaveButton = input.tagName === 'BUTTON' && (input.getAttribute('onclick')?.includes('save') || input.innerText.includes('Save'));

            if (shouldLock) {
                if (input.id === 'isActive' || isSaveButton) {
                    input.removeAttribute('disabled');
                    input.disabled = false;
                    input.style.backgroundColor = '';
                    input.style.color = '';
                    input.style.cursor = '';
                    return;
                }

                input.setAttribute('disabled', 'disabled');
                input.disabled = true;
                input.style.backgroundColor = '#f0f0f0';
                input.style.color = '#999';
                input.style.cursor = 'not-allowed';
            } else {
                input.removeAttribute('disabled');
                input.disabled = false;
                input.style.backgroundColor = '';
                input.style.color = '';
                input.style.cursor = '';
            }
        });

        // 2. Handle Plus/List buttons specifically
        const actionButtons = form.querySelectorAll('.plus-btn, .list-btn');
        actionButtons.forEach(btn => {
            if (shouldLock) {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'inline-block';
            }
        });

        // 3. Warning Badge
        let lockBadge = document.getElementById('lock-status-badge');
        if (shouldLock) {
            if (!lockBadge) {
                lockBadge = document.createElement('div');
                lockBadge.id = 'lock-status-badge';
                lockBadge.className = 'alert alert-danger py-2 mb-3 text-center fw-bold';
                lockBadge.innerHTML = '<i class="fas fa-lock me-2"></i> SECURITY LOCK: Modification Restricted for existing records.';
                form.prepend(lockBadge);
            }
        } else if (lockBadge) {
            lockBadge.remove();
        }

        console.log('[Lock Check Executed]', { hasPermission, shouldLock });

    } catch (error) {
        console.error('Error in checkAccessParaPermission:', error);
    }
}

// Re-enforce every 2 seconds to prevent bypass
setInterval(checkAccessParaPermission, 2000);


// ── ID Card Download ──────────────────────────────────────────────────────────
async function downloadIdCard() {
    if (!currentEmployeeId) {
        alert('Please save the employee first, then download the ID card.');
        return;
    }
    const btn = document.getElementById('btnIdCard');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Generating...';

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employees/${currentEmployeeId}/id-card`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to generate ID card.' }));
            alert('Error: ' + err.message);
            return;
        }

        // Trigger browser download
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `IDCard_${currentEmployeeId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error('ID card error:', err);
        alert('Failed to generate ID card. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}
