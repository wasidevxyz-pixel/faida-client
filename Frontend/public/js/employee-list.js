let stores = [];
 
// Global Zoom Function
window.openLargePhoto = async function(id, name) {
    if (!id) return;
    const modalEl = document.getElementById('photoPreviewModal');
    // Don't create new modal instance if it already exists to avoid backdrop issues
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    
    const imgEl = document.getElementById('largePhotoPreview');
    // Set a loading placeholder
    imgEl.src = '/img/default-avatar.png'; 
    document.getElementById('previewEmployeeName').innerText = (name || 'Employee Preview') + ' (Loading Photo...)';
    modal.show();

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employees/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data && data.data.photo) {
            imgEl.src = data.data.photo;
            document.getElementById('previewEmployeeName').innerText = name || 'Employee Preview';
        } else {
            document.getElementById('previewEmployeeName').innerText = (name || 'Employee Preview') + ' - No Photo';
        }
    } catch (err) {
        console.error(err);
        document.getElementById('previewEmployeeName').innerText = (name || 'Employee Preview') + ' - Error Loading';
    }
};

async function loadStores() {
    await window.populateBranchSelect('filterBranch', {
        placeholder: 'SELECT BRANCH',
        includeAll: true
    });
    
    // Refresh the global stores array for row-level dropdowns
    const uniqueBranches = await window.getGlobalBranches();
    stores = uniqueBranches.map(name => ({ name }));
}

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadStores(),
        loadDepartments(),
        loadDesignations()
    ]);
    await loadEmployees();
});

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/employee-departments?t=' + Date.now(), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            departments = data.data;
            const filter = document.getElementById('filterDept');
            filter.innerHTML = '<option value="">All Departments</option>';
            departments.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                filter.appendChild(opt);
            });
        } else {
            console.warn('Failed to load departments:', data?.message || data);
        }
    } catch (err) { console.error(err); }
}

async function loadDesignations() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/designations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            designations = data.data;
            const filter = document.getElementById('filterDesig');
            filter.innerHTML = '<option value="">All Designations</option>';
            designations.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                filter.appendChild(opt);
            });
        } else {
            console.warn('Failed to load designations:', data?.message || data);
        }
    } catch (err) { console.error(err); }
}

async function loadEmployees() {
    try {
        const token = localStorage.getItem('token');
        const branch = document.getElementById('filterBranch').value;

        const tbody = document.getElementById('employeeTableBody');
        if (!branch) {
            tbody.innerHTML = '<tr><td colspan="22" class="text-center text-secondary py-3"><i class="fas fa-info-circle me-1"></i>Please select a branch to load employees.</td></tr>';
            return;
        }

        const apiBranch = branch === 'all' ? '' : branch;

        const code = document.getElementById('filterCode').value;
        const name = document.getElementById('filterName').value;
        const dept = document.getElementById('filterDept').value;
        const desig = document.getElementById('filterDesig').value;
        const type = document.getElementById('filterType').value;
        const religion = document.getElementById('filterReligion').value;
        const marital = ''; // Removed filter from UI
        const active = document.getElementById('filterStatus').value;

        tbody.innerHTML = '<tr><td colspan="22" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

        let url = `/api/v1/employees?branch=${apiBranch}&code=${code}&name=${name}&department=${dept}&designation=${desig}&type=${type}&religion=${religion}&maritalStatus=${marital}&isActive=${active}&t=${Date.now()}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            employees = data.data;
            renderTable();
        }
    } catch (err) {
        console.error('Error loading employees:', err);
    }
}

function handleGlobalSearch(value) {
    const filter = value.trim().toUpperCase();
    const rows = document.getElementById('employeeTableBody').getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        let rowMatch = false;

        // 1. Check all text nodes in the row (for SrNo, Code, etc.)
        const simpleText = rows[i].innerText || rows[i].textContent;
        if (simpleText.toUpperCase().indexOf(filter) > -1) {
            rowMatch = true;
        }

        // 2. Check all input values (for Name, CNIC, Acc No, Salary, etc.)
        if (!rowMatch) {
            const inputs = rows[i].querySelectorAll('input');
            for (let input of inputs) {
                if (input.value.toUpperCase().indexOf(filter) > -1) {
                    rowMatch = true;
                    break;
                }
            }
        }

        // 3. Check all select selected options (for Branch, Designation, Department, etc.)
        if (!rowMatch) {
            const selects = rows[i].querySelectorAll('select');
            for (let select of selects) {
                const selectedText = select.options[select.selectedIndex]?.text || "";
                if (selectedText.toUpperCase().indexOf(filter) > -1) {
                    rowMatch = true;
                    break;
                }
            }
        }

        rows[i].style.display = rowMatch ? "" : "none";
    }
}

function renderTable() {
    const tbody = document.getElementById('employeeTableBody');
    tbody.innerHTML = '';

    const fragment = document.createDocumentFragment();

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    const permissions = user.permissions || [];
    // Strictly check for right_02 (Allow Access Employee Para) even for admins
    const canEditParas = rights['right_02'] || permissions.includes('right_02');
    const canDelete = rights['delete_employee_reg'];

    let currentBranch = '';
    let filteredEmployees = employees;
    let branchIndex = 0;

    // 1. Sort by isActive (True/Active first), 2. Then by Branch
    filteredEmployees.sort((a, b) => {
        const activeA = a.isActive !== false;
        const activeB = b.isActive !== false;
        if (activeA !== activeB) return activeA ? -1 : 1;
        return (a.branch || '').localeCompare(b.branch || '');
    });

    filteredEmployees.forEach((emp, index) => {
        // Only show Branch Headers and SrNo for Active employees in Print
        // (Inactive will be hidden via CSS)
        const isActive = emp.isActive !== false;

        // Add Branch Heading and repeated Header for Print if branch changes (Only for active ones)
        if (isActive && emp.branch !== currentBranch) {
            currentBranch = emp.branch;
            branchIndex = 0;

            // 1. Centered Branch Heading (Print Only)
            const headingTr = document.createElement('tr');
            headingTr.className = 'branch-heading-row-print';
            headingTr.innerHTML = `<td colspan="20">${currentBranch || 'UNASSIGNED BRANCH'}</td>`;
            fragment.appendChild(headingTr);

            // 2. Repeated Table Header (Print Only)
            const subHeaderTr = document.createElement('tr');
            subHeaderTr.className = 'print-sub-header';
            subHeaderTr.innerHTML = `
                <th class="col-sr">Sr</th>
                <th class="col-code">Code</th>
                <th class="col-name">Employee Name</th>
                <th class="col-cnic">CNIC</th>
                <th class="col-desig">Designation</th>
                <th class="col-acNo">Account No</th>
                <th class="col-duty">Hrs</th>
                <th class="col-date">Increment Date</th>
                <th class="col-salary">Salary</th>
                <th class="col-other-allow">Other</th>
                <th class="col-fix-allow">Fix</th>
                <th class="col-st">ST.L</th>
            `;
            fragment.appendChild(subHeaderTr);
        }

        const tr = document.createElement('tr');
        tr.dataset.id = emp._id;

        if (!isActive) {
            tr.classList.add('row-inactive');
        } else {
            branchIndex++;
        }

        tr.innerHTML = `
            <td class="text-center col-sr">${isActive ? branchIndex : '-'}</td>
            <td class="text-center col-photo">
                <img src="/img/default-avatar.png" 
                     class="rounded-circle employee-photo-clickable" 
                     width="32" height="32" 
                     style="cursor: zoom-in; object-fit: cover; border: 1px solid #dee2e6;"
                     data-id="${emp._id}"
                     data-name="${(emp.name || '').replace(/"/g, '&quot;')}"
                     onclick="openLargePhoto(this.getAttribute('data-id'), this.getAttribute('data-name'))">
            </td>
            <td class="text-center col-code">
                <span class="code-link" onclick="gotoEdit('${emp._id}')">${emp.code || '-'}</span>
            </td>
            <td class="text-center col-action">
                <div class="d-flex gap-1 justify-content-center">
                    <button class="btn btn-success btn-xs" onclick="quickSave('${emp._id}', this)">Save</button>
                    <button class="btn btn-info btn-xs" onclick="downloadEmployeeCard('${emp._id}')" title="Download ID Card"><i class="fas fa-id-card"></i></button>
                    ${canDelete ? `<button class="btn btn-danger btn-xs" onclick="deleteEmployee('${emp._id}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </td>
            <td class="col-branch">
                <select class="form-control form-control-xs" ${!canEditParas ? 'disabled' : ''}>
                    <option value="">Select Branch</option>
                    ${stores.map(s => `<option value="${s.name}" ${emp.branch === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                </select>
            </td>
            <td class="col-name"><input type="text" class="form-control form-control-xs text-start" value="${emp.name || ''}" ${!canEditParas ? 'readonly' : ''}></td>
            <td class="text-center col-cnic"><input type="text" class="form-control form-control-xs text-center" value="${emp.cnic || ''}" ${!canEditParas ? 'readonly' : ''}></td>
            <td class="text-center col-mobile"><input type="text" class="form-control form-control-xs text-center" value="${emp.mobileNo || ''}" ${!canEditParas ? 'readonly' : ''}></td>
            <td class="text-center col-marital">
                <select class="form-control form-control-xs" ${!canEditParas ? 'disabled' : ''}>
                    <option value="Single" ${emp.maritalStatus === 'Single' ? 'selected' : ''}>Single</option>
                    <option value="Married" ${emp.maritalStatus === 'Married' ? 'selected' : ''}>Married</option>
                </select>
            </td>
            <td class="text-center col-dept">
                <select class="form-control form-control-xs text-center" ${!canEditParas ? 'disabled' : ''}>
                    <option value="">Select Department</option>
                    ${departments.map(d => `<option value="${d._id}" ${emp.department?._id === d._id ? 'selected' : ''}>${d.name}</option>`).join('')}
                </select>
            </td>
            <td class="text-center col-desig">
                <select class="form-control form-control-xs text-center" ${!canEditParas ? 'disabled' : ''}>
                    <option value="">Select Designation</option>
                    ${designations.map(d => `<option value="${d._id}" ${emp.designation?._id === d._id ? 'selected' : ''}>${d.name}</option>`).join('')}
                </select>
            </td>
            <td class="text-center col-acNo"><input type="text" class="form-control form-control-xs text-center" value="${emp.acNo || ''}" ${!canEditParas ? 'readonly' : ''}></td>
            <td class="text-center col-bank">
                <select class="form-control form-control-xs text-center" ${!canEditParas ? 'disabled' : ''}>
                    <option value="" ${!emp.selectBank ? 'selected' : ''}>Select Bank</option>
                    <option value="HBL" ${emp.selectBank === 'HBL' ? 'selected' : ''}>HBL</option>
                    <option value="ALF" ${emp.selectBank === 'ALF' ? 'selected' : ''}>ALF</option>
                    <option value="BOP" ${emp.selectBank === 'BOP' ? 'selected' : ''}>BOP</option>
                </select>
            </td>
            <td class="text-center col-duty"><input type="text" class="form-control form-control-xs text-center" value="${getDutyHours(emp)}" readonly></td>
            <td class="text-center col-date"><input type="date" class="form-control form-control-xs text-center" value="${emp.incrDate ? emp.incrDate.split('T')[0] : ''}" ${!canEditParas ? 'readonly' : ''}></td>
            <td class="col-salary"><input type="number" class="form-control form-control-xs border-0 text-end w-100" value="${emp.basicSalary || 0}" ${!canEditParas ? 'readonly' : ''} oninput="updateRowIncrDate(this)"></td>
            <td class="col-other-allow"><input type="number" class="form-control form-control-xs border-0 text-end w-100" value="${emp.otherAllowance || 0}" ${!canEditParas ? 'readonly' : ''}></td>
            <td class="col-fix-allow"><input type="number" class="form-control form-control-xs border-0 text-end w-100" value="${emp.fixAllowance || 0}" ${!canEditParas ? 'readonly' : ''}></td>
            <td class="col-st"><input type="number" class="form-control form-control-xs border-0 text-end w-100" value="${emp.stLoss || 0}" ${!canEditParas ? 'readonly' : ''}></td>
            <td class="text-center col-bool"><input type="checkbox" class="col-active" ${emp.isActive !== false ? 'checked' : ''}></td>
        `;
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    // Re-apply global search filter if active
    const globalSearchInput = document.getElementById('globalSearch');
    if (globalSearchInput && globalSearchInput.value) {
        handleGlobalSearch(globalSearchInput.value);
    }
}

function updateRowIncrDate(salaryInput) {
    const tr = salaryInput.closest('tr');
    const dateInput = tr.querySelector('.col-date input');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
}

async function quickSave(id, btn) {
    const tr = btn.closest('tr');

    // Get values from inputs/selects nested inside class-named cells
    const branch = tr.querySelector('.col-branch select, .col-branch input')?.value || '';

    if (!branch || branch === "") {
        alert('Mandatory Field: Please select a Branch before saving.');
        tr.querySelector('.col-branch select, .col-branch input')?.focus();
        return;
    }

    const updatedData = {
        branch: branch,
        name: tr.querySelector('.col-name select, .col-name input')?.value || '',
        cnic: tr.querySelector('.col-cnic select, .col-cnic input')?.value || '',
        maritalStatus: tr.querySelector('.col-marital select, .col-marital input')?.value || '',
        designation: tr.querySelector('.col-desig select, .col-desig input')?.value || null,
        department: tr.querySelector('.col-dept select, .col-dept input')?.value || null,
        acNo: tr.querySelector('.col-acNo select, .col-acNo input')?.value || '',
        selectBank: tr.querySelector('.col-bank select, .col-bank input')?.value || '',
        basicSalary: parseFloat(tr.querySelector('.col-salary select, .col-salary input')?.value) || 0,
        otherAllowance: parseFloat(tr.querySelector('.col-other-allow select, .col-other-allow input')?.value) || 0,
        fixAllowance: parseFloat(tr.querySelector('.col-fix-allow select, .col-fix-allow input')?.value) || 0,
        stLoss: parseFloat(tr.querySelector('.col-st select, .col-st input')?.value) || 0,
        isActive: tr.querySelector('.col-active')?.checked,
        payFullSalaryThroughBank: tr.querySelector('.col-pfstb')?.checked,
        eobi: tr.querySelector('.col-eobi')?.checked,
        incrDate: tr.querySelector('.col-date select, .col-date input')?.value || null
    };

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employees/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updatedData)
        });

        const data = await res.json();
        if (data.success) {
            window.clearCachedFetch('/api/v1/employees');
            btn.textContent = 'Saved!';
            btn.classList.replace('btn-success', 'btn-primary');
            setTimeout(() => {
                location.reload(); // Force reload to show updated data from server
            }, 1000);
        } else {
            alert('Error: ' + data.message);
        }
    } catch (err) {
        console.error('Quick save error:', err);
        alert('Failed to update employee');
    }
}

function gotoEdit(id) {
    location.href = `employee-registration?id=${id}`;
}

async function downloadEmployeeCard(id) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employees/${id}/id-card`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(errorBody || 'Unable to download ID card');
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `IDCard_${id}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Download ID card error:', err);
        alert('Failed to download ID card. Please open the employee registration page or try again.');
    }
}

async function deleteEmployee(id) {
    if (!confirm('Are you sure you want to delete this employee? This action cannot be undone.')) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employees/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (data.success) {
            window.clearCachedFetch('/api/v1/employees');
            alert('Employee deleted successfully');
            loadEmployees(); // Reload the list
        } else {
            alert('Error: ' + data.message);
        }
    } catch (err) {
        console.error('Delete error:', err);
        alert('Failed to delete employee');
    }
}

function getDutyHours(emp) {
    if (!emp) return '';
    if (emp.totalHrs && emp.totalHrs !== '0h') return emp.totalHrs;
    if (emp.fDutyTime && emp.tDutyTime) {
        try {
            const [fH, fM] = emp.fDutyTime.split(':').map(Number);
            const [tH, tM] = emp.tDutyTime.split(':').map(Number);
            let diff = (tH * 60 + tM) - (fH * 60 + fM);
            if (diff < 0) diff += 1440;
            const h = Math.floor(diff / 60);
            const m = diff % 60;
            return `${h}h${m > 0 ? ' ' + m + 'm' : ''}`;
        } catch (e) {
            return '';
        }
    }
    return emp.totalHrs || '';
}

function printEmployeeList() {
    const branchFilter = document.getElementById('filterBranch');
    const selectedBranch = branchFilter ? branchFilter.options[branchFilter.selectedIndex].text : 'ALL BRANCHES';

    const printBranchName = document.getElementById('printBranchName');
    const printDate = document.getElementById('printDate');

    if (printBranchName) printBranchName.innerText = selectedBranch;
    if (printDate) printDate.innerText = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    window.print();
}

