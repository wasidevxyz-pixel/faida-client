// Map Frontend IDs to Backend Schema Fields
const FIELD_MAPPING = {
    // Earnings
    overTimeAmount: 'overTime',
    rotiAmount: 'rent',
    rotiDays: 'rotiDays',
    nashtaAmount: 'teaAllowance',
    nashtaDays: 'nashtaDays',
    monthlyComm: 'monthlyComm',
    fixAllowance: 'natin',
    stLessAllow: 'stLateAllow',
    otherAllow: 'otherAllow',

    // Deductions
    tsw: 'ttw',
    tfc: 'fund',
    foodDeduction: 'ugrm',
    securityDeposit: 'securityDeposit',
    penalty: 'penalty',
    totalAbsents: 'totalAbsents',
    allowedLeaves: 'allowedLeaves',

    // Net Calc
    grossTotal: 'grossTotal',
    netTotal: 'netTotal',
    bankAmt: 'bankAmt',
    wht: 'wht',
    bankPaid: 'bankPaid',
    cashPaid: 'cashPaid',
    balance: 'rebate',
    remarks: 'remarks',
    branchBank: 'branchBank',

    // Header Flags
    payAdvSalary: 'payAdvSalary',
    thirtyWorkingDays: 'thirtyWorkingDays',
    payFullSalaryThroughBank: 'payFullSalaryThroughBank'
};

let currentPayrollId = null;
let currentListPayrolls = [];
let pendingDeleteId = null;
let selectedPayrollIds = new Set();
let departmentNameMap = new Map();
let departmentLookupPromise = null;
let departmentLookupBranchKey = '';

document.addEventListener('DOMContentLoaded', () => {
    initializeHeaderUser();
    setDefaultDate();
    loadBranches();
    // loadEmployees(); // STOP loading all employees on load

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Alt + S for Save
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            savePayroll();
        }
        // Alt + L for List (Toggle)
        if (e.altKey && (e.key === 'l' || e.key === 'L')) {
            e.preventDefault();
            const modalEl = document.getElementById('payrollListModal');
            let modal = bootstrap.Modal.getInstance(modalEl);
            if (modal && modalEl.classList.contains('show')) {
                modal.hide();
            } else {
                showList();
            }
        }
    });

    // Handle Manual Code Input for Search
    document.getElementById('code').addEventListener('change', async (e) => {
        const code = e.target.value.trim();
        if (code) {
            findEmployeeByCode(code);
        }
    });

    // Handle Enter Key on Code Field
    document.getElementById('code').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const code = e.target.value.trim();
            if (code) findEmployeeByCode(code);
        }
    });

    // Add Event Listeners for Calculation
    const calcFields = [
        'overTimeAmount', 'overTimeHrs', 'rotiAmount', 'nashtaAmount', 'monthlyComm',
        'fixAllowance', 'stLessAllow', 'otherAllow',
        'shortTimeAmount', 'shortTimeHrs', 'tsw', 'tfc', 'foodDeduction', 'ebDeduction',
        'umrahDeduction', 'otherDeduction', 'securityDeposit', 'penalty',
        'pAAdv', 'cmAdv', 'totalAdv', 'bankPaid', 'cashPaid', 'checkShortWeek', 'shortWeekDays',
        'payAdvSalary', 'wkDays30', 'salThrBank', 'wht'
    ];

    calcFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', calculateTotals);
            el.addEventListener('change', calculateTotals);
        }
    });

    // Special handler for 30 Working Days checkbox - force recalculation from backend
    document.getElementById('wkDays30').addEventListener('change', async () => {
        const employeeId = document.getElementById('employee').value;
        const monthYear = document.getElementById('monthYear').value;
        const branch = document.getElementById('branch').value;

        if (employeeId && monthYear) {
            await forceRecalculate(employeeId, monthYear, branch);
        }
    });

    // Special handler for Sal Thr Bank checkbox - recalculate locally to update bank/cash split
    document.getElementById('salThrBank').addEventListener('change', () => {
        calculateTotals();
    });

    // Handle Employee Selection
    document.getElementById('employee').addEventListener('change', async (e) => {
        const employeeId = e.target.value;
        const monthYear = document.getElementById('monthYear').value;
        const branch = document.getElementById('branch').value;

        if (employeeId && monthYear) {
            await loadOrCalculate(employeeId, monthYear, branch);
        }
    });

    // Handle Month Change
    document.getElementById('monthYear').addEventListener('input', async (e) => {
        const employeeId = document.getElementById('employee').value;
        const monthYear = e.target.value;
        const branch = document.getElementById('branch').value;

        if (employeeId && monthYear) {
            await loadOrCalculate(employeeId, monthYear, branch);
        }
    });

    // Handle Branch Change
    document.getElementById('branch').addEventListener('change', async (e) => {
        const branch = e.target.value;

        // Clear existing employee search selection and all form fields if branch changes
        resetForm();
        
        document.getElementById('employeeSearchResults').style.display = 'none';

        // Load Banks for the selected branch
        await loadBranchBanks(branch);

        // BULK LOAD employees for this branch only
        if (branch) {
            await loadEmployees(branch);
        } else {
            allEmployees = [];
        }

        await loadDepartments(branch);

        // Update Present Count
        GetTotalPresentEmployee();
    });

    // Handle List Search Text
    const listSearchText = document.getElementById('listSearchText');
    if (listSearchText) {
        listSearchText.addEventListener('input', () => {
            renderPayrollTable(currentListPayrolls);
        });
    }

    // Select All Functionality
    const selectAllCheck = document.getElementById('selectAllPayrolls');
    if (selectAllCheck) {
        selectAllCheck.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.payroll-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                if (e.target.checked) {
                    selectedPayrollIds.add(cb.value);
                } else {
                    selectedPayrollIds.delete(cb.value);
                }
            });
        });
    }

    // Individual Checkbox Event Delegation for Payroll Table
    const payrollTableBody = document.getElementById('payrollTableBody');
    if (payrollTableBody) {
        payrollTableBody.addEventListener('change', (e) => {
            if (e.target.classList.contains('payroll-checkbox')) {
                if (e.target.checked) {
                    selectedPayrollIds.add(e.target.value);
                } else {
                    selectedPayrollIds.delete(e.target.value);
                    // Also uncheck select all if one item is unchecked
                    const selectAllCheck = document.getElementById('selectAllPayrolls');
                    if (selectAllCheck) selectAllCheck.checked = false;
                }
            }
        });
    }

    // Enter key for Auth Modal
    document.getElementById('authPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmDelete();
        }
    });

    const myModal = document.getElementById('payrollListModal');
    if (myModal) {
        myModal.addEventListener('shown.bs.modal', function () {
            loadPayrollList();
        });
    }

    // Add event listeners for filter changes in payroll list modal
    const listBranchSelect = document.getElementById('listBranch');
    const listDeptSelect = document.getElementById('listDepartment');
    const listEmployeeTypeSelect = document.getElementById('listEmployeeType');
    
    if (listBranchSelect) {
        listBranchSelect.addEventListener('change', () => {
            console.log('[Payroll List] Branch changed, reloading payroll list');
            loadPayrollList();
        });
    }
    
    if (listDeptSelect) {
        listDeptSelect.addEventListener('change', () => {
            console.log('[Payroll List] Department changed, reloading payroll list');
            loadPayrollList();
        });
    }
    
    if (listEmployeeTypeSelect) {
        listEmployeeTypeSelect.addEventListener('change', () => {
            console.log('[Payroll List] Employee type changed, reloading payroll list');
            loadPayrollList();
        });
    }

});

async function refreshCurrentCalculation() {
    const employeeId = document.getElementById('employee').value;
    const monthYear = document.getElementById('monthYear').value;
    const branch = document.getElementById('branch').value;

    if (!employeeId || !monthYear) {
        alert('Please select an employee and month first');
        return;
    }

    if (confirm('This will recalculate all values from the backend (Advances, Penalties, Attendance). Any unsaved manual changes might be overwritten. Proceed?')) {
        await forceRecalculate(employeeId, monthYear, branch);
        alert('Data recalculated successfully');
    }
}



function setDefaultDate() {
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    document.getElementById('monthYear').value = `${year}-${month}`;
}

function initializeHeaderUser() {
    const user = window.getCurrentUser();
    if (user) {
        const nameEl = document.getElementById('headerUserName');
        if (nameEl) nameEl.textContent = user.name || 'User';
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        window.logout();
    }
}

async function loadBranches() {
    try {
        const uniqueBranches = await window.getGlobalBranches();
        if (uniqueBranches.length > 0) {
            const branchSelect = document.getElementById('branch');
            branchSelect.innerHTML = '<option value="">Select Branch</option>';

            uniqueBranches.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                branchSelect.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

async function loadBranchBanks(branchName, selectedValue = null) {
    const field = document.getElementById('branchBank');
    if (!field) return;

    if (!branchName) {
        field.value = '';
        return;
    }

    // If we already have a selectedValue (from a saved payroll record), just set it
    if (selectedValue) {
        field.value = selectedValue;
        return;
    }

    // Don't overwrite if user already has a value manually entered
    // (only auto-populate when field is empty)
    if (field.value) return;

    try {
        const token = localStorage.getItem('token');

        // STEP 1: Try to find the designated payroll bank (isPayrollBank = true)
        const payrollBankRes = await fetch(`/api/v1/banks/payroll-bank?branch=${encodeURIComponent(branchName)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const payrollBankData = await payrollBankRes.json();

        if (payrollBankData.success && payrollBankData.data) {
            // Found a designated payroll bank — use it
            field.value = payrollBankData.data.bankName;
            return;
        }

        // STEP 2: Fallback — use first active Branch Bank for this branch
        const allBanksRes = await fetch('/api/v1/banks', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const allBanksData = await allBanksRes.json();

        if (allBanksData.success) {
            const branchBanks = allBanksData.data.filter(b =>
                b.branch === branchName && b.isActive && b.bankType === 'Branch Bank'
            );
            if (branchBanks.length > 0) {
                field.value = branchBanks[0].bankName;
            }
        }
    } catch (error) {
        console.error('Error loading branch banks:', error);
    }
}


async function loadDepartments(branchName = '') {
    // Prefer fetching canonical departments from server so we always show names
    try {
        const branchKey = normalizeBranchKey(branchName);

        if (departmentLookupPromise && departmentLookupBranchKey === branchKey) {
            await departmentLookupPromise;
            renderDepartmentSelect();
            return;
        }

        const token = localStorage.getItem('token');
        departmentLookupBranchKey = branchKey;
        departmentLookupPromise = (async () => {
            const url = branchKey
                ? `/api/v1/employee-departments?branch=${encodeURIComponent(branchKey)}`
                : '/api/v1/employee-departments';
            const data = await (window.cachedFetch
                ? window.cachedFetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
                : fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()));

            departmentNameMap = new Map();
            if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
                data.data.forEach(d => {
                    const id = d._id || d.id || d.name;
                    const name = d.name || d.title || String(id || '');
                    if (id) departmentNameMap.set(String(id), name);
                    if (name) departmentNameMap.set(String(name), name);
                });
            }

            // Fallback for any departments already loaded in employee data
            allEmployees.forEach(emp => {
                if (!emp.department) return;
                if (typeof emp.department === 'object') {
                    const id = emp.department._id || emp.department.id || emp.department.name;
                    const name = emp.department.name || String(id || '');
                    if (id) departmentNameMap.set(String(id), name);
                    if (name) departmentNameMap.set(String(name), name);
                } else {
                    const dept = String(emp.department);
                    if (dept) departmentNameMap.set(dept, departmentNameMap.get(dept) || dept);
                }
            });
        })();

        await departmentLookupPromise;
        renderDepartmentSelect();
    } catch (err) {
        console.error('Error loading departments, falling back to local names:', err);
        departmentNameMap = new Map();
        allEmployees.forEach(emp => {
            if (!emp.department) return;
            const deptName = typeof emp.department === 'object' ? emp.department.name : emp.department;
            if (deptName) departmentNameMap.set(String(deptName), String(deptName));
        });
        renderDepartmentSelect();
    }
}

function normalizeBranchKey(branchName) {
    const normalized = String(branchName || '').trim();
    if (!normalized) return '';
    const lower = normalized.toLowerCase();
    return ['all', 'select branch', 'null', 'undefined'].includes(lower) ? '' : normalized;
}

function renderDepartmentSelect() {
    const deptSelect = document.getElementById('listDepartment');
    if (!deptSelect) return;

    const deptList = Array.from(departmentNameMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    console.log(`[Departments] Rendering ${deptList.length} departments:`, deptList.map(d => d.name));

    deptSelect.innerHTML = '<option value="">Select Department</option>';
    deptList.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.name || d.id;
        opt.textContent = d.name;
        deptSelect.appendChild(opt);
    });
}

function getDepartmentDisplayName(department, employee) {
    // First check if employee has department object populated
    if (employee && employee.department) {
        if (typeof employee.department === 'object') {
            return employee.department.name || employee.department._id || 'N/A';
        }
        return String(employee.department).trim() || 'N/A';
    }
    
    // Fallback to direct department field (stored as string in Payroll model)
    if (!department) return 'N/A';
    
    if (typeof department === 'object') {
        return department.name || department.title || department._id || department.id || 'N/A';
    }

    const raw = String(department).trim();
    return raw || 'N/A';
}

let allEmployees = [];
let filteredEmployees = [];
let selectedSearchIndex = -1;

function GetTotalPresentEmployee() {
    const monthYear = $("#monthYear").val();
    const branch = $("#branch").val();

    if (!monthYear || !branch) {
        $("#totalPresentEmployees").text('0');
        return;
    }

    $.ajax({
        type: "get",
        dataType: "json",
        url: "/api/v1/payrolls",
        data: {
            monthYear: monthYear,
            branch: branch
        },
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        success: function (response) {
            if (response.success) {
                // Showing total man-days present for the branch/month
                $("#totalPresentEmployees").text(response.totalAttendance || 0);
            } else {
                $("#totalPresentEmployees").text('0');
            }
        },
        error: function (err) {
            console.error('Error fetching present employees:', err);
            $("#totalPresentEmployees").text('0');
        }
    });
}


async function loadEmployees(branch = null) {
    try {
        const token = localStorage.getItem('token');
        let url = '/api/v1/employees?isActive=true&light=true';
        if (branch) {
            url += `&branch=${encodeURIComponent(branch)}`;
        }

        if (window.showLoading) showLoading();

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            allEmployees = data.data;
            console.log(`Employees loaded for branch [${branch || 'All'}]:`, allEmployees.length);
            initEmployeeSearch();
            await loadDepartments(branch);
        } else {
            console.error('Failed to load employees:', data.message);
        }
    } catch (error) {
        console.error('Error loading employees:', error);
    } finally {
        if (window.hideLoading) hideLoading();
    }
}

function initEmployeeSearch() {
    const searchInput = document.getElementById('employeeSearch');
    const resultsDiv = document.getElementById('employeeSearchResults');

    searchInput.addEventListener('input', () => {
        const term = searchInput.value.toLowerCase();
        if (!term) {
            resultsDiv.style.display = 'none';
            filteredEmployees = [];
            selectedSearchIndex = -1;
            return;
        }

        const selectedBranch = document.getElementById('branch').value;
        const terms = term.split(/\s+/).filter(t => t.length > 0);
        
        filteredEmployees = allEmployees.filter(emp => {
            const name = emp.name.toLowerCase();
            const code = String(emp.code || '').toLowerCase();
            
            // Fuzzy match: every term must match somewhere in name or code
            const matchesTerm = terms.every(t => name.includes(t) || code.includes(t));
            
            const matchesBranch = !selectedBranch || emp.branch === selectedBranch;
            return matchesTerm && matchesBranch;
        });

        if (filteredEmployees.length === 0) {
            resultsDiv.innerHTML = '<div class="p-2 text-danger small">No matching active employee found in this branch.</div>';
            resultsDiv.style.display = 'block';
        } else {
            selectedSearchIndex = -1;
            renderSearchResults(filteredEmployees);
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        if (resultsDiv.style.display === 'none' || filteredEmployees.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSearchIndex = (selectedSearchIndex + 1) % filteredEmployees.length;
            updateActiveSearchItem();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSearchIndex = (selectedSearchIndex - 1 + filteredEmployees.length) % filteredEmployees.length;
            updateActiveSearchItem();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedSearchIndex >= 0) {
                selectEmployee(filteredEmployees[selectedSearchIndex]);
            } else if (filteredEmployees.length > 0) {
                // If user hits Enter without arrowing down, select the first result
                selectEmployee(filteredEmployees[0]);
            }
        }
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value) {
            const term = searchInput.value.toLowerCase();
            const selectedBranch = document.getElementById('branch').value;
            const terms = term.split(/\s+/).filter(t => t.length > 0);
            
            filteredEmployees = allEmployees.filter(emp => {
                const name = emp.name.toLowerCase();
                const code = String(emp.code || '').toLowerCase();
                const matchesTerm = terms.every(t => name.includes(t) || code.includes(t));
                const matchesBranch = !selectedBranch || emp.branch === selectedBranch;
                return matchesTerm && matchesBranch;
            });
            
            if (filteredEmployees.length === 0) {
                resultsDiv.innerHTML = '<div class="p-2 text-danger small">No matching active employee found.</div>';
                resultsDiv.style.display = 'block';
            } else {
                selectedSearchIndex = -1;
                renderSearchResults(filteredEmployees);
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            resultsDiv.style.display = 'none';
        }
    });
}

function updateActiveSearchItem() {
    const items = document.querySelectorAll('.search-item');
    items.forEach((item, index) => {
        if (index === selectedSearchIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}

function renderSearchResults(employees) {
    const resultsDiv = document.getElementById('employeeSearchResults');
    resultsDiv.innerHTML = '';

    if (employees.length === 0) {
        resultsDiv.style.display = 'none';
        return;
    }

    employees.forEach(emp => {
        const item = document.createElement('div');
        item.className = 'search-item';
        item.innerHTML = `<b>${emp.code || 'N/A'}</b> - ${emp.name}`;
        item.onclick = () => selectEmployee(emp);
        resultsDiv.appendChild(item);
    });

    resultsDiv.style.display = 'block';
}

async function selectEmployee(emp) {
    console.log('Selecting Employee:', emp);
    const searchInput = document.getElementById('employeeSearch');
    const resultsDiv = document.getElementById('employeeSearchResults');
    const hiddenInput = document.getElementById('employee');
    document.getElementById('wkDays30').checked = false; // Reset on selection

    if (!emp) {
        console.error('selectEmployee called with null employee');
        return;
    }

    searchInput.value = emp.name;
    hiddenInput.value = emp._id;
    resultsDiv.style.display = 'none';
    document.getElementById('code').value = emp.code || '';
    
    // Initial Count Load
    GetTotalPresentEmployee();

    const monthYear = document.getElementById('monthYear').value;
    const branch = document.getElementById('branch').value;
    console.log('Triggering loadOrCalculate for:', { id: emp._id, monthYear, branch });
    if (monthYear) {
        await loadOrCalculate(emp._id, monthYear, branch);
    }
}

async function findEmployeeByCode(code) {
    const selectedBranch = document.getElementById('branch').value;
    
    // Check local cache first — avoids server round-trip entirely
    const localMatch = allEmployees.find(e =>
        String(e.code || '').toLowerCase() === String(code).toLowerCase() &&
        (!selectedBranch || e.branch === selectedBranch)
    );
    if (localMatch) {
        selectEmployee(localMatch);
        return;
    }

    // Not in local cache — fetch from server (e.g. first load or fresh data needed)
    try {
        if (window.showLoading) showLoading();
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employees?code=${encodeURIComponent(code)}&isActive=true&branch=${encodeURIComponent(selectedBranch)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success && data.data && data.data.length > 0) {
            const employee = data.data[0];
            
            // Update local allEmployees cache with this fresh version
            const idx = allEmployees.findIndex(e => e._id === employee._id);
            if (idx !== -1) {
                allEmployees[idx] = employee;
            } else {
                allEmployees.push(employee);
            }
            
            selectEmployee(employee);
        } else {
            alert(selectedBranch ? `Employee with code ${code} not found in ${selectedBranch}.` : `Employee with code ${code} not found.`);
        }
    } catch (err) {
        console.error('Error finding employee by code:', err);
        alert('Error fetching employee data.');
    } finally {
        if (window.hideLoading) hideLoading();
    }
}

async function loadOrCalculate(employeeId, monthYear, branch) {
    console.log('loadOrCalculate started:', { employeeId, monthYear, branch });
    try {
        currentPayrollId = null;

        const token = localStorage.getItem('token');
        const thirtyWorkingDays = document.getElementById('wkDays30').checked;

        // Fire ALL 4 operations in parallel — banks, departments, calculate, and check saved payroll
        const deptPromise = departmentLookupPromise
            ? departmentLookupPromise.catch(() => {})
            : loadDepartments(branch);

        const [calcRes, checkRes] = await Promise.all([
            loadBranchBanks(branch),
            deptPromise,
            fetch('/api/v1/payrolls/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ employeeId, monthYear, branch, thirtyWorkingDays })
            }),
            fetch(`/api/v1/payrolls?employee=${employeeId}&monthYear=${monthYear}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]).then(results => [results[2], results[3]]);

        const [calcData, checkData] = await Promise.all([calcRes.json(), checkRes.json()]);
        console.log('calcData response:', JSON.stringify(calcData).substring(0, 200));

        if (checkData.success && checkData.count > 0) {
            const savedPayroll = checkData.data[0];
            currentPayrollId = savedPayroll._id;

            // Load saved record first (preserves manually entered deductions/advances)
            populateForm(savedPayroll);

            // OVERRIDE attendance-derived fields and salary with fresh calculation from employee profile
            if (calcData.success) {
                const fresh = calcData.data;
                setValue('department', getDepartmentDisplayName(fresh.department));
                setValue('designation', fresh.designation || 'N/A');
                setValue('bankName', fresh.bank || 'N/A');
                setValue('offDay', fresh.offDay || 'N/A');
                setValue('basicSalary', fresh.perMonth);
                setValue('totalPerDay', parseFloat(fresh.totalPerDay || 0).toFixed(2));
                setValue('totalPerHr', parseFloat(fresh.totalPerHr || 0).toFixed(2));
                setValue('totalDays', fresh.totalDays);
                setValue('totalWdsPerMonth', fresh.totalWdsPerMonth);
                setValue('totalHrsPerMonth', decimalToTime(fresh.totalHrsPerMonth || 0));
                setValue('totalHrsPerDay', fresh.totalHrsPerDay || 8);
                setValue('workedDays', fresh.workedDays);
                setValue('totalAbsents', fresh.totalAbsents != null ? fresh.totalAbsents : 0);
                setValue('allowedLeaves', fresh.allowedLeaves != null ? fresh.allowedLeaves : 0);
                setValue('workedHrs', decimalToTime(fresh.workedHrs || 0));
                setValue('overTimeHrs', decimalToTime(fresh.overTimeHrs || 0));
                setValue('overTimeAmount', parseFloat(fresh.overTime || 0).toFixed(2));
                setValue('shortTimeHrs', decimalToTime(fresh.shortTimeHrs || 0));
                setValue('shortTimeAmount', parseFloat(fresh.shortTimeAmount || 0).toFixed(2));
                setValue('tsw', parseFloat(fresh.shortWeek || 0).toFixed(2));
                setValue('shortWeekDays', fresh.shortWeekDays || 0);
                window.baseShortHrs = parseFloat(fresh.shortTimeHrs || 0);

                // Sync advance balances and installment deductions from fresh backend calculation
                if (fresh.pAAdv !== undefined) setValue('pmAdv', fresh.pAAdv);
                if (fresh.csMale !== undefined) setValue('cmAdv', fresh.csMale);
                if (fresh.pmAdvRec !== undefined) setValue('pmAdvRec', fresh.pmAdvRec);
                if (fresh.cmAdvRec !== undefined) setValue('cmAdvRec', fresh.cmAdvRec);
            } else {
                console.error('Fresh calc failed for saved record:', calcData.message);
            }

            if (branch && savedPayroll.branch !== branch) {
                alert(`Note: Payroll for this month exists in branch "${savedPayroll.branch}". Loaded that record.`);
                const branchDropdown = document.getElementById('branch');
                if (branchDropdown) branchDropdown.value = savedPayroll.branch;
            }
        } else {
            // No saved record — use fresh calculation
            if (calcData.success) {
                populateForm(calcData.data);
            } else {
                console.error('Calculation failed:', calcData.message);
                alert('Calculation failed: ' + (calcData.message || 'Unknown error'));
            }
        }
        calculateTotals();
    } catch (error) {
        console.error('Error processing payroll:', error);
        alert('An error occurred while loading payroll data. Please check connection and try again.');
    }
}

// Helper to format Decimal (81.7) to HH:MM (81:42)
function decimalToTime(decimal) {
    if (!decimal || isNaN(decimal)) return '0:00';
    const hrs = Math.floor(decimal);
    const mins = Math.round((decimal - hrs) * 60);
    return `${hrs}:${mins.toString().padStart(2, '0')}`;
}

// Helper to format HH:MM or "HH:MM (Decimal)" to Decimal
function timeToDecimal(str) {
    if (!str) return 0;
    // Strip anything in brackets for calculation
    const s = String(str).split('(')[0].trim();
    if (s.includes(':')) {
        const [h, m] = s.split(':').map(Number);
        return (h || 0) + ((m || 0) / 60);
    }
    return parseFloat(s) || 0;
}

async function forceRecalculate(employeeId, monthYear, branch) {
    try {
        const token = localStorage.getItem('token');

        // Get checkbox states from UI
        const thirtyWorkingDays = document.getElementById('wkDays30').checked;

        const calcRes = await fetch('/api/v1/payrolls/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ employeeId, monthYear, branch, thirtyWorkingDays })
        });

        const calcData = await calcRes.json();
        if (calcData.success) {
            populateForm(calcData.data);
            calculateTotals();
        }
    } catch (error) {
        console.error('Error recalculating payroll:', error);
    }
}

function populateForm(data) {
    console.log('populateForm received:', data);
    try {
        setValue('code', data.code);
        setValue('department', getDepartmentDisplayName(data.department));
        setValue('designation', data.designation?.name || data.designation || 'N/A');
        setValue('bankName', data.bank || 'N/A');
        setValue('offDay', data.offDay || 'N/A');

        setValue('basicSalary', data.perMonth);
        setValue('totalDays', data.totalDays);
        setValue('totalWdsPerMonth', data.totalWdsPerMonth);
        setValue('totalHrsPerMonth', decimalToTime(data.totalHrsPerMonth || 0));
        setValue('totalHrsReqMonth', data.totalHrsPerMonth || 0);
        setValue('workedDays', data.workedDays);
        setValue('totalAbsents', data.totalAbsents || 0);
        setValue('allowedLeaves', data.allowedLeaves || 0);

        // Header Checkboxes
        document.getElementById('salThrBank').checked = data.payFullSalaryThroughBank || false;
        document.getElementById('payAdvSalary').checked = data.payAdvSalary || false;
        window.isOTST_ThirtyWorkingDays = data.otst30WorkingDays || false;
        window.fullStLessAllow = data.fullStLessAllow || 0;

        setValue('workedHrs', decimalToTime(data.workedHrs || 0));
        setValue('workedAmount', Math.round(data.workedAmount || 0));
        setValue('totalPerDay', parseFloat(data.totalPerDay || 0).toFixed(2));
        setValue('totalPerHr', parseFloat(data.totalPerHr || 0).toFixed(2));
        setValue('totalHrsPerDay', data.totalHrsPerDay || 8);
        // setValue('perMonth', data.perMonth); // Removed conflict with salary field

        window.baseShortHrs = parseFloat(data.shortTimeHrs || 0);
        setValue('overTimeHrs', decimalToTime(data.overTimeHrs || 0));
        setValue('overTimeAmount', parseFloat(data.overTime || 0).toFixed(2));
        setValue('shortTimeHrs', decimalToTime(window.baseShortHrs));
        setValue('shortTimeAmount', parseFloat(data.shortTimeAmount || 0).toFixed(2));
        setValue('tsw', parseFloat(data.shortWeek || 0).toFixed(2));
        if (document.getElementById('shortWeekDays')) {
            setValue('shortWeekDays', data.shortWeekDays || 0);
        }
        setValue('nashtaAmount', data.teaAllowance);
        setValue('nashtaDays', data.nashtaDays || 0);
        setValue('monthlyComm', data.monthlyComm);
        setValue('ugComm', data.ugComm || 0);
        setValue('warehouseComm', data.warehouseComm);
        setValue('fixAllowance', data.natin);
        setValue('stLessAllow', data.stLateAllow);
        setValue('otherAllow', data.otherAllow);
        setValue('rotiAmount', data.rent);
        setValue('rotiDays', data.rotiDays || 0);

        setValue('tfc', data.fund);
        setValue('foodDeduction', data.food || 0); // Food Rate
        setValue('securityDeposit', data.securityDeposit);
        setValue('penalty', data.penalty);

        setValue('ebDeduction', data.ebDeduction || 0); // Total EB Deduction
        setValue('umrahDeduction', data.umrahDeduction || 0);
        setValue('otherDeduction', data.otherDeduction || 0);

        setValue('pmAdv', data.pAAdv);
        setValue('pmAdvRec', data.pmAdvRec || 0);
        setValue('cmAdv', data.csMale);
        setValue('cmAdvRec', data.cmAdvRec || 0);

        setValue('bankAmt', data.bankAmt);
        setValue('wht', data.wht);
        setValue('bankPaid', data.bankPaid || 0);
        setValue('cashPaid', data.cashPaid || 0);
        setValue('remarks', data.remarks);

        // Restore branchBank: if the saved record has a value, use it exactly.
        // If no saved value, let loadBranchBanks() auto-detect from isPayrollBank flag.
        if (data.branchBank) {
            setValue('branchBank', data.branchBank);
        }
        console.log('populateForm completed successfully');
    } catch (err) {
        console.error('Error in populateForm:', err);
    }
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (!el) return;

    if (val === undefined || val === null) {
        el.value = (el.type === 'number' || el.getAttribute('inputmode') === 'numeric') ? 0 : '';
    } else {
        el.value = val;
    }
}

function getValue(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    if (el.type === 'checkbox') return el.checked;

    const val = el.value || '';
    // If it's an hour based field, parse HH:MM
    const hourFields = ['workedHrs', 'overTimeHrs', 'shortTimeHrs', 'totalHrsPerMonth'];
    if (hourFields.includes(id)) {
        return timeToDecimal(val);
    }
    return (parseFloat(val) || 0);
}

function calculateTotals() {
    const basicInfo = getValue('basicSalary');
    const dutyHrs = getValue('totalHrsPerDay') || 8;
    const baseShortHrs = window.baseShortHrs || 0;
    const activeEl = document.activeElement ? document.activeElement.id : '';

    // Stamps Logic
    const payAdvSalary = document.getElementById('payAdvSalary').checked;
    const salThrBank = document.getElementById('salThrBank').checked;
    const wkDays30 = document.getElementById('wkDays30').checked;

    const stampContainer = document.getElementById('stampContainer');
    const bankStamp = document.getElementById('bankStamp');
    const paidStamp = document.getElementById('paidStamp');

    if (stampContainer && bankStamp && paidStamp) {
        if (payAdvSalary || salThrBank) {
            stampContainer.style.display = 'block';
            bankStamp.style.display = salThrBank ? 'block' : 'none';
            paidStamp.style.display = payAdvSalary ? 'block' : 'none';
        } else {
            stampContainer.style.display = 'none';
        }
    }

    // Formula: Salary Per Day = Basic / Total Working Days
    const wdsPerMonth = getValue('totalWdsPerMonth') || 30;
    const perDayAmt = basicInfo / wdsPerMonth;
    setValue('totalPerDay', perDayAmt.toFixed(2));

    // Formula: Salary Per Hour = Salary Per Day / Duty Hours
    const hourlyRate = perDayAmt / (dutyHrs || 8);
    setValue('totalPerHr', hourlyRate.toFixed(2));

    let workedHrs = getValue('workedHrs');
    const totalHrsReq = getValue('totalHrsReqMonth') || (wdsPerMonth * dutyHrs);
    let otHrs = getValue('overTimeHrs');

    // NOTE: workedHrs is the total hours from attendance register.
    // OT hours are already calculated by backend. Do NOT re-split here to avoid double-counting.

    // Formula: Salary Per Hour for OT and ST = Basic / 30 / Duty Hours (Fixed 30 as per user screenshot)
    const otstHourlyRate = basicInfo / 30 / (dutyHrs || 8);

    const otAmt = Math.round(otHrs * otstHourlyRate); // Rounded
    setValue('overTimeAmount', otAmt);

    // Dynamic ST.LessAllow calculation
    const fullSTAllow = window.fullStLessAllow || 0;
    const stDeduction = (fullSTAllow / 30 / (dutyHrs || 8)) * getValue('shortTimeHrs');
    const stAllow = Math.max(0, fullSTAllow - stDeduction);
    setValue('stLessAllow', Math.round(stAllow));

    const updatedEarnings = Math.round(
        otAmt +
        getValue('rotiAmount') +
        getValue('nashtaAmount') +
        getValue('monthlyComm') +
        getValue('ugComm') +
        getValue('warehouseComm') +
        getValue('fixAllowance') +
        getValue('stLessAllow') +
        getValue('otherAllow')
    );
    document.getElementById('earningsTotal').value = updatedEarnings;

    // Short Week Calculation: TSW = 4 - (TotalWorkedHrs / TotalHrsPerDay / 7)
    // IMPORTANT: use the original (possibly capped) workedHrs for consistency
    const weeksWorked = workedHrs / (dutyHrs || 8) / 7;
    const calculatedShortWeeks = Math.max(0, 4 - weeksWorked);

    const isShortWeek = getValue('checkShortWeek');
    let shortWeeks = getValue('shortWeekDays');
    let totalShortHrs = baseShortHrs;

    if (activeEl === 'shortWeekDays') {
        // User manually entered short week days
        totalShortHrs = baseShortHrs + (shortWeeks * dutyHrs);
        setValue('shortTimeHrs', decimalToTime(totalShortHrs));
    } else if (activeEl === 'shortTimeHrs') {
        // User manually entered short time hours
        totalShortHrs = getValue('shortTimeHrs');
        shortWeeks = (totalShortHrs - baseShortHrs) / (dutyHrs || 8);
        setValue('shortWeekDays', Math.round(shortWeeks));
    } else {
        if (isShortWeek) {
            // Auto-calculate using the formula
            shortWeeks = Math.round(calculatedShortWeeks);
            setValue('shortWeekDays', shortWeeks);
            totalShortHrs = baseShortHrs + (shortWeeks * dutyHrs);
            setValue('shortTimeHrs', decimalToTime(totalShortHrs));
        } else {
            totalShortHrs = baseShortHrs;
            setValue('shortTimeHrs', decimalToTime(totalShortHrs));
            setValue('shortWeekDays', 0);
        }
    }

    const shortAmt = Math.round(totalShortHrs * otstHourlyRate); // Rounded using standard 30-day rate
    setValue('shortTimeAmount', shortAmt);

    const foodRate = getValue('foodDeduction');
    const workedDaysForcalc = getValue('workedDays');
    const ebDeduction = Math.round(foodRate * workedDaysForcalc);
    setValue('ebDeduction', ebDeduction);

    const deductions = Math.round(
        shortAmt +
        getValue('tfc') +
        getValue('ebDeduction') + // Use EB deduction as the actual food cost
        getValue('umrahDeduction') +
        getValue('otherDeduction') +
        getValue('securityDeposit') +
        getValue('penalty')
    );

    document.getElementById('deductionsTotal').value = deductions;

    // Formula: Worked Rs = Basic Salary - Short Time Amount (MATCHING .NET FORMULA)
    const workedAmount = Math.round(basicInfo - shortAmt);
    setValue('workedAmount', workedAmount);

    // Gross Total = Basic Salary + Earnings Total - Deductions Total
    const grossTotal = Math.round(basicInfo + updatedEarnings - deductions);
    document.getElementById('grossTotal').value = grossTotal;

    const advancesRec = Math.round(getValue('cmAdvRec') + getValue('pmAdvRec'));
    const totalAdvanceBalance = Math.round(getValue('cmAdv') + Math.max(0, getValue('pmAdv')));
    document.getElementById('totalAdv').value = totalAdvanceBalance;
    const totalAdvRecEl = document.getElementById('totalAdvRec');
    if (totalAdvRecEl) totalAdvRecEl.value = advancesRec;

    // Net Total (Pre-Tax) = Gross Total - Advances Recovered (deductions already subtracted in Gross)
    const preTaxNet = Math.round(grossTotal - advancesRec);

    // --- WHT (Income Tax) Calculation 2025-2026 ---
    let wht = 0;
    if (salThrBank) {
        const annualSalary = preTaxNet * 12;
        let annualTax = 0;

        if (annualSalary <= 600000) {
            annualTax = 0;
        } else if (annualSalary <= 1200000) {
            annualTax = (annualSalary - 600000) * 0.01;
        } else if (annualSalary <= 2200000) {
            annualTax = 6000 + (annualSalary - 1200000) * 0.11;
        } else if (annualSalary <= 3200000) {
            annualTax = 116000 + (annualSalary - 2200000) * 0.23;
        } else if (annualSalary <= 4100000) {
            annualTax = 346000 + (annualSalary - 3200000) * 0.30;
        } else {
            annualTax = 616000 + (annualSalary - 4100000) * 0.35;
        }

        // Apply 9% surcharge if annual taxable income exceeds 10 Million
        if (annualSalary > 10000000) {
            annualTax += (annualTax * 0.09);
        }

        wht = Math.round(annualTax / 12);
    }

    setValue('wht', wht);
    
    // Net Total = Gross Total - Advance Recovery (before WHT)
    document.getElementById('netTotal').value = preTaxNet;

    const afterWhtNet = Math.round(preTaxNet - wht);

    if (salThrBank) {
        setValue('bankAmt', preTaxNet);
        setValue('bankPaid', afterWhtNet);
        setValue('cashPaid', 0);
        console.log('Bank Payment: NetTotal', preTaxNet, 'BankPaid after WHT', afterWhtNet);
    } else {
        setValue('bankAmt', 0);
        setValue('cashPaid', preTaxNet);
        setValue('bankPaid', 0);
        console.log('Cash Payment Selected: Net Total', preTaxNet);
    }

    const totalPaid = getValue('bankPaid') + getValue('cashPaid');
    const balance = Math.round(preTaxNet - wht - totalPaid); 
    document.getElementById('balance').value = balance;
}




async function savePayroll() {
    if (currentPayrollId) {
        alert("Payroll already exists for this employee and month. To update or make changes, please delete the existing record from the list first and then save again.");
        return;
    }

    const data = {
        employee: document.getElementById('employee').value,
        monthYear: document.getElementById('monthYear').value,
        branch: document.getElementById('branch').value,
        code: document.getElementById('code').value,
        bank: document.getElementById('bankName').value,
        department: document.getElementById('department').value,
        designation: document.getElementById('designation').value,
        totalDays: getValue('totalDays'),
        totalWdsPerMonth: getValue('totalWdsPerMonth'),
        totalAbsents: getValue('totalAbsents'),
        allowedLeaves: getValue('allowedLeaves'),
        totalWdsPerMonthHrs: getValue('totalHrsPerMonth'),
        totalHrsPerMonth: getValue('totalHrsPerMonth'),
        totalHrsPerDay: getValue('totalHrsPerDay'),
        perMonth: getValue('basicSalary'),
        offDay: getValue('offDay'),
        totalPerDay: getValue('totalPerDay'),
        totalPerHr: getValue('totalPerHr'),
        salaryPer: getValue('salaryPer'),
        workedHrs: timeToDecimal(document.getElementById('workedHrs').value),
        workedDays: getValue('workedDays'),
        overTime: getValue('overTimeAmount'),
        rent: getValue('rotiAmount'),
        natin: getValue('fixAllowance'),
        monthlyComm: getValue('monthlyComm'),
        ugComm: getValue('ugComm'),
        warehouseComm: getValue('warehouseComm'),
        teaAllowance: getValue('nashtaAmount'),
        nashtaDays: getValue('nashtaDays'),
        stLateAllow: getValue('stLessAllow'),
        otherAllow: getValue('otherAllow'),
        rotiDays: getValue('rotiDays'),
        earningsTotal: getValue('earningsTotal'),
        overTimeHrs: timeToDecimal(document.getElementById('overTimeHrs').value),
        shortWeek: getValue('shortTimeAmount'),
        shortTimeAmount: getValue('shortTimeAmount'),
        shortWeekDays: getValue('shortWeekDays') || getValue('tsw') || 0,
        isShortWeek: document.getElementById('checkShortWeek')?.checked || false,
        ttw: getValue('shortWeekDays') || getValue('tsw') || 0,
        fund: getValue('tfc'),
        food: getValue('foodDeduction'), // Rate
        ebDeduction: getValue('ebDeduction'), // Total
        ugrm: 0, // Legacy field
        securityDeposit: getValue('securityDeposit'),
        penalty: getValue('penalty'),
        otherDeduction: getValue('otherDeduction'),
        umrahDeduction: getValue('umrahDeduction'),
        deductionsTotal: getValue('deductionsTotal'),
        grossTotal: getValue('grossTotal'),
        csMale: getValue('cmAdv'),
        pAAdv: getValue('pmAdv'),
        pmAdvRec: getValue('pmAdvRec'),
        cmAdvRec: getValue('cmAdvRec'),
        totalAdv: getValue('totalAdvRec'), // Advance deduction / recovery
        totalAdvRec: getValue('totalAdvRec'), // Total advance recovery
        netTotal: getValue('netTotal'),
        bankAmt: getValue('bankAmt'),
        wht: getValue('wht'),
        bankPaid: getValue('bankPaid'),
        cashPaid: getValue('cashPaid'),
        rebate: getValue('balance'),
        remarks: document.getElementById('remarks').value,
        branchBank: document.getElementById('branchBank').value,

        // Add back decimal values for hours
        shortTimeHrs: timeToDecimal(document.getElementById('shortTimeHrs').value),

        // Flags
        payAdvSalary: document.getElementById('payAdvSalary').checked,
        thirtyWorkingDays: document.getElementById('wkDays30').checked,
        payFullSalaryThroughBank: document.getElementById('salThrBank').checked
    };

    // Validation: Basic Salary and Worked Hours must be > 0
    if (!data.perMonth || data.perMonth <= 0) {
        alert("Employee Basic Salary cannot be zero.");
        return;
    }
    if (!data.workedHrs || data.workedHrs <= 0) {
        alert("Employee Worked(Hrs) cannot be zero.");
        return;
    }

    // Trim values for comparison
    const empBank = data.bank ? data.bank.trim() : '';
    const brBank = data.branchBank ? data.branchBank.trim() : '';

    // Validation: Only enforce bank consistency for bank-paid employees
    if (data.payFullSalaryThroughBank) {
        if (!brBank) {
            alert("Please select a Branch Bank to proceed with bank payment.");
            return;
        }

        // Bank Mismatch Check: Only show if employee has an actual personal bank (not N/A)
        if (empBank && empBank !== 'N/A' && brBank !== empBank) {
            const confirmMsg = `Employee Bank (${empBank}) and Branch Bank (${brBank}) are different.\nDo you want to continue?`;
            if (!confirm(confirmMsg)) {
                return;
            }
        }
    }


    try {
        const token = localStorage.getItem('token');
        const url = currentPayrollId ? `/api/v1/payrolls/${currentPayrollId}` : '/api/v1/payrolls';
        const method = currentPayrollId ? 'PUT' : 'POST';

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
            alert(currentPayrollId ? 'Payroll updated successfully!' : 'Payroll saved successfully!');
            resetForm();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        console.error('Error saving payroll:', error);
        alert('Error saving payroll');
    }
}

function resetForm() {
    currentPayrollId = null;
    window.baseShortHrs = 0;

    // Clear Search Inputs
    document.getElementById('employeeSearch').value = '';
    document.getElementById('employee').value = '';
    document.getElementById('code').value = '';

    // Clear all numeric and text fields using a list of IDs
    const fieldsToClear = [
        'department', 'designation', 'bankName', 'offDay', 'basicSalary',
        'totalDays', 'totalWdsPerMonth', 'totalAbsents', 'allowedLeaves', 'totalHrsPerMonth', 'workedDays',
        'workedHrs', 'totalPerDay', 'totalPerHr', 'totalHrsPerDay', 'perMonth',
        'overTimeHrs', 'overTimeAmount', 'shortTimeHrs', 'shortTimeAmount',
        'tsw', 'shortWeekDays', 'nashtaAmount', 'monthlyComm', 'ugComm', 'warehouseComm', 'fixAllowance',
        'stLessAllow', 'otherAllow', 'rotiAmount', 'tfc', 'foodDeduction',
        'securityDeposit', 'penalty', 'ebDeduction', 'umrahDeduction',
        'otherDeduction', 'pmAdv', 'pmAdvRec', 'cmAdv', 'cmAdvRec',
        'bankAmt', 'wht', 'bankPaid', 'cashPaid', 'remarks', 'branchBank',
        'earningsTotal', 'deductionsTotal', 'grossTotal', 'netTotal', 'totalAdv', 'balance'
    ];

    fieldsToClear.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'SELECT') el.selectedIndex = 0;
            else el.value = '';
        }
    });

    const checkShortWeek = document.getElementById('checkShortWeek');
    if (checkShortWeek) checkShortWeek.checked = false;

    document.getElementById('payAdvSalary').checked = false;
    document.getElementById('wkDays30').checked = false;
    document.getElementById('salThrBank').checked = false;

    const stampContainer = document.getElementById('stampContainer');
    if (stampContainer) stampContainer.style.display = 'none';

    // Focus back on code for next entry
    document.getElementById('code').focus();
}

function showList() {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('payrollListModal'));
    modal.show();

    // Sync Month-Year
    const monthYear = document.getElementById('monthYear').value;
    document.getElementById('listMonthYear').value = monthYear;

    // Sync Branch and load filters
    loadListFilters();
    const mainBranchValue = document.getElementById('branch').value;
    const listBranch = document.getElementById('listBranch');

    // Ensure the branch value exists in the copied options
    if (mainBranchValue) {
        listBranch.value = mainBranchValue;
    }

    // Ensure departments are loaded for the active branch (or all if none)
    loadDepartments(mainBranchValue || '');
    
    loadPayrollList();
}


function loadListFilters() {
    const listBranch = document.getElementById('listBranch');
    const mainBranch = document.getElementById('branch').innerHTML;
    listBranch.innerHTML = mainBranch; // Already has Select Branch

    // Departments are loaded on demand for the active branch.
}

async function loadPayrollList() {
    selectedPayrollIds.clear(); // Clear selection on refresh/search
    const selectAllCheck = document.getElementById('selectAllPayrolls');
    if (selectAllCheck) selectAllCheck.checked = false;
    
    const searchBox = document.getElementById('listSearchText');
    if (searchBox) searchBox.value = '';
    
    try {
        const token = localStorage.getItem('token');
        const monthYear = document.getElementById('listMonthYear').value;
        const branchSelect = document.getElementById('listBranch');
        const branch = branchSelect?.value || '';
        const dept = document.getElementById('listDepartment').value;
        const empType = document.getElementById('listEmployeeType').value;

        console.log('═══════════════════════════════════════');
        console.log(`[Payroll List] STARTING LOAD`);
        console.log(`[Payroll List] Selected Values:`);
        console.log(`  - Month-Year: "${monthYear}"`);
        console.log(`  - Branch: "${branch}" (from element, trimmed: "${branch.trim()}")`);
        console.log(`  - Department: "${dept}"`);
        console.log(`  - Employee Type: "${empType}"`);
        console.log('═══════════════════════════════════════');

        let query = `?monthYear=${encodeURIComponent(monthYear)}`;
        // Add branch to backend query if selected
        if (branch && branch !== 'Select Branch' && branch !== '') {
            query += `&branch=${encodeURIComponent(branch)}`;
            console.log(`[Payroll List] Branch will be sent to API: "${branch}"`);
            await loadDepartments(branch);
        } else {
            console.log(`[Payroll List] NO branch sent to API (branch="${branch}")`);
            await loadDepartments('');
        }

        console.log(`[Payroll List] API Query: /api/v1/payrolls${query}`);

        const response = await fetch(`/api/v1/payrolls${query}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        console.log(`[Payroll List] API Response: success=${data.success}, count=${data.data?.length || 0}`);
        if (data.data?.length > 0) {
            console.log(`[Payroll List] Sample branch values from API:`, 
                data.data.slice(0, 3).map(p => `"${p.branch}"`).join(', '));
        }
        
        if (data.success) {
            let payrolls = data.data;
            console.log(`[Payroll List] Starting with ${payrolls.length} payrolls from API`);

            // Filter by Branch (client-side enforcement)
            if (branch && branch !== 'Select Branch' && branch !== '') {
                const normalizedBranch = branch.trim().toLowerCase();
                const beforeFilter = payrolls.length;
                payrolls = payrolls.filter(p => {
                    const payrollBranch = (p.branch || 'N/A').toString().trim().toLowerCase();
                    return payrollBranch === normalizedBranch;
                });
                console.log(`[Payroll List] ✓ Branch filter: ${beforeFilter} → ${payrolls.length} (looking for "${normalizedBranch}")`);
            } else {
                console.log(`[Payroll List] ✗ NO branch filter applied`);
            }

            // Filter by Department
            if (dept) {
                const normalizedDept = dept.trim().toLowerCase();
                const beforeFilter = payrolls.length;
                payrolls = payrolls.filter(p => {
                    const payrollDept = getDepartmentDisplayName(p.department, p.employee);
                    return payrollDept && payrollDept.toString().trim().toLowerCase() === normalizedDept;
                });
                console.log(`[Payroll List] ✓ Department filter: ${beforeFilter} → ${payrolls.length} (looking for "${normalizedDept}")`);
            }

            // Filter by Emp Type
            if (empType !== 'all') {
                const beforeFilter = payrolls.length;
                payrolls = payrolls.filter(p => {
                    if (empType === 'payAdvance') return (p.pAAdv > 0 || p.csMale > 0);
                    if (empType === 'commission') return (p.monthlyComm > 0);
                    if (empType === 'bank') return (p.bankPaid > 0);
                    if (empType === 'cashPaid') return (p.cashPaid > 0);
                    return true;
                });
                console.log(`[Payroll List] ✓ Employee Type filter: ${beforeFilter} → ${payrolls.length}`);
            }

            console.log(`[Payroll List] ✓ FINAL: ${payrolls.length} payrolls to display`);
            console.log('═══════════════════════════════════════');
            currentListPayrolls = payrolls;
            renderPayrollTable(payrolls);
        } else {
            console.error('[Payroll List] ✗ API returned success=false:', data.message);
        }
    } catch (error) {
        console.error('[Payroll List] ✗ Error loading payroll list:', error);
    }
}

function renderPayrollTable(payrolls) {
    const searchText = document.getElementById('listSearchText').value.toLowerCase();
    const tbody = document.getElementById('payrollTableBody');
    tbody.innerHTML = '';

    const filtered = payrolls.filter(p =>
        (p.employee?.name || '').toLowerCase().includes(searchText) ||
        (p.code || '').toLowerCase().includes(searchText)
    );

    // Reset Select All checkbox? No, check if all currently filtered items are in selectedPayrollIds
    const selectAllCheck = document.getElementById('selectAllPayrolls');
    if (selectAllCheck) {
        const allFilteredSelected = filtered.length > 0 && filtered.every(p => selectedPayrollIds.has(p._id));
        selectAllCheck.checked = allFilteredSelected;
    }

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    const permissions = user.permissions || [];
    // Strictly link deletion to "Allow PayRoll Delete" (mod_11)
    const canDelete = rights['mod_11'] || permissions.includes('mod_11');

    filtered.forEach((p, index) => {
        const row = document.createElement('tr');
        let rowClass = '';
        if (p.payAdvSalary) {
            rowClass = 'row-advance';
        } else if (p.bankPaid > 0 || p.cashPaid > 0) {
            rowClass = 'row-paid';
        }
        row.className = rowClass;
        const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'N/A';
        const allowances = (p.rent || 0) + (p.teaAllowance || 0) + (p.natin || 0) + (p.stLateAllow || 0) + (p.otherAllow || 0) + (p.monthlyComm || 0) + (p.ugComm || 0) + (p.warehouseComm || 0);
        const gross = (p.perMonth || 0) + (p.overTime || 0) + allowances;
        const deductions = (p.shortWeek || 0) + (p.ttw || 0) + (p.fund || 0) + (p.ugrm || 0) + (p.penalty || 0) + (p.securityDeposit || 0) + (p.totalAdv || 0) + (p.wht || 0) + (p.ebDeduction || p.food || 0) + (p.otherDeduction || 0) + (p.umrahDeduction || 0);
        const netSalary = gross - deductions;

        row.innerHTML = `
            <td><input type="checkbox" class="payroll-checkbox" value="${p._id}" ${selectedPayrollIds.has(p._id) ? 'checked' : ''}></td>
            <td class="text-center" style="white-space: nowrap;">
                <button class="btn btn-sm btn-primary py-0 px-1" onclick="printPayroll('${p._id}')">Print</button>
                <button class="btn btn-sm btn-info py-0 px-1 text-white" onclick="sendSinglePayrollToDownloadCenter('${p._id}', '${(p.employee?.name || 'Employee').replace(/'/g, "\\'")}')" title="Send original salary slip to Download Center"><i class="fas fa-cloud-upload-alt"></i> DC</button>
                ${canDelete ? `<button class="btn btn-sm btn-danger py-0 px-1" onclick="deletePayroll('${p._id}')">Delete</button>` : ''}
            </td>
            <td>${p._id.substring(p._id.length - 5)}</td>
            <td>${p.code || ''}</td>
            <td>${date}</td>
            <td>${p.employee?.name || 'N/A'}</td>
            <td>${getDepartmentDisplayName(p.department, p.employee)}</td>
            <td>${p.designation || ''}</td>
            <td>${p.branch || ''}</td>
            <td>${(p.perMonth || 0).toLocaleString()}</td>
            <td>${(p.overTime || 0).toLocaleString()}</td>
            <td>${allowances.toLocaleString()}</td>
            <td>${gross.toLocaleString()}</td>
            <td>${(deductions - (p.totalAdv || 0) - (p.wht || 0)).toLocaleString()}</td>
            <td>${(p.totalAdv || 0).toLocaleString()}</td>
            <td>${(p.wht || 0).toLocaleString()}</td>
            <td>${netSalary.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });
}

function printSelected() {
    const ids = Array.from(selectedPayrollIds);
    if (ids.length === 0) {
        alert('Please select at least one payroll to print.');
        return;
    }
    window.open(`/print-payroll?ids=${ids.join(',')}&v=20260617-7`, '_blank');

    // Clear selection and search after printing
    selectedPayrollIds.clear();
    const selectAllCheck = document.getElementById('selectAllPayrolls');
    if (selectAllCheck) selectAllCheck.checked = false;
    
    const searchBox = document.getElementById('listSearchText');
    if (searchBox) searchBox.value = '';

    renderPayrollTable(currentListPayrolls);
}

function printAll() {
    if (currentListPayrolls.length === 0) {
        alert('No payrolls in the current list to print.');
        return;
    }
    const ids = currentListPayrolls.map(p => p._id);
    window.open(`/print-payroll?ids=${ids.join(',')}&v=20260617-7`, '_blank');
}

async function sendSinglePayrollToDownloadCenter(id, empName) {
    if (!window.downloadCenterClient) {
        alert('Download Center client is not available. Please refresh the page.');
        return;
    }

    const reportMonth = document.getElementById('listMonthYear')?.value || 'Payroll';
    try {
        const result = await window.downloadCenterClient.generateVectorReport({
            reportType: 'payroll',
            payrollIds: [id],
            title: `Salary Slip - ${empName} (${reportMonth})`,
            description: `Original salary slip for ${empName} (${reportMonth})`,
            saveToDownloadCenter: true
        });

        if (result) {
            alert(`✓ Original Salary Slip for ${empName} sent to Download Center.`);
        }
    } catch (error) {
        console.error('[PAYROLL] Download Center single slip error:', error);
        alert(`Could not send slip to Download Center: ${error.message}`);
    }
}

async function sendSelectedPayrollsToDownloadCenter() {
    const ids = Array.from(selectedPayrollIds);
    if (ids.length === 0) {
        alert('Please select at least one payroll to send.');
        return;
    }

    if (!window.downloadCenterClient) {
        alert('Download Center client is not available. Please refresh the page.');
        return;
    }

    const reportMonth = document.getElementById('listMonthYear')?.value || 'Payroll';
    let slipTitle = `Employee Payroll Slips (${ids.length}) - ${reportMonth}`;
    if (ids.length === 1) {
        const match = currentListPayrolls.find(p => p._id === ids[0]);
        if (match && match.employee?.name) {
            slipTitle = `Salary Slip - ${match.employee.name} (${reportMonth})`;
        }
    }

    try {
        const selectedBranch = document.getElementById('branch')?.value || '';
        const result = await window.downloadCenterClient.generateVectorReport({
            reportType: 'payroll',
            payrollIds: ids,
            title: slipTitle,
            defaultBranch: selectedBranch,
            description: `Original vector payroll salary slips for ${ids.length} employee(s) (${reportMonth})`,
            saveToDownloadCenter: true
        });

        if (result) {
            alert(`✓ Original Salary Slip(s) generated and sent to Download Center (${ids.length} slip${ids.length > 1 ? 's' : ''}).`);
        }
    } catch (error) {
        console.error('[PAYROLL] Download Center PDF error:', error);
        alert(`Could not send payroll PDF: ${error.message}`);
    }
}


async function deletePayroll(id) {
    pendingDeleteId = id;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('authUser').value = user.name || 'User';
    document.getElementById('authPassword').value = '';

    const modal = new bootstrap.Modal(document.getElementById('authModal'));
    modal.show();

    // Focus password field
    document.getElementById('authModal').addEventListener('shown.bs.modal', () => {
        document.getElementById('authPassword').focus();
    }, { once: true });
}

async function confirmDelete() {
    // Check if this is a bulk delete
    if (pendingDeleteId === 'BULK_DELETE') {
        await confirmDeleteSelected();
        return;
    }

    // Single delete logic
    const password = document.getElementById('authPassword').value;
    if (!password) {
        alert('Please enter your password');
        return;
    }

    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const token = localStorage.getItem('token');

        // Verify Password via Login API
        const verifyRes = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: password })
        });

        const verifyData = await verifyRes.json();

        // Check for token or ok status since the login API doesn't return a 'success' flag
        if (!verifyRes.ok || !verifyData.token) {
            alert('Invalid Password');
            return;
        }

        // Final permission check after verify password
        const currentUser = verifyData.user || user;
        const currentRights = currentUser.rights || {};
        const currentPerms = currentUser.permissions || [];
        // Strictly use "Allow PayRoll Delete" (mod_11)
        const hasRight = currentRights['mod_11'] || currentPerms.includes('mod_11');

        if (!hasRight) {
            alert('Access Denied: You do not have PayRoll Delete rights.');
            return;
        }

        // Proceed with deletion
        const response = await fetch(`/api/v1/payrolls/${pendingDeleteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            // Hide modal
            const modalEl = document.getElementById('authModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            alert('Payroll deleted successfully');

            // If we deleted the payroll that is currently loaded, reset the form
            if (pendingDeleteId === currentPayrollId) {
                resetForm();
            }

            // Remove from selected Set if present
            selectedPayrollIds.delete(pendingDeleteId);

            loadPayrollList();
            GetTotalPresentEmployee(); // Update count
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        console.error('Error deleting payroll:', error);
        alert('An error occurred during deletion');
    }
}

function deleteSelected() {
    if (selectedPayrollIds.size === 0) {
        alert('Please select at least one payroll record to delete');
        return;
    }

    // Check permission before showing modal
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const rights = user.rights || {};
    const permissions = user.permissions || [];
    const canDelete = rights['mod_11'] || permissions.includes('mod_11');

    if (!canDelete) {
        alert('Access Denied: You do not have PayRoll Delete rights.');
        return;
    }

    // Set flag to indicate this is a bulk delete
    pendingDeleteId = 'BULK_DELETE';
    
    document.getElementById('authUser').value = user.name || 'User';
    document.getElementById('authPassword').value = '';

    const modal = new bootstrap.Modal(document.getElementById('authModal'));
    modal.show();

    // Focus password field
    document.getElementById('authModal').addEventListener('shown.bs.modal', () => {
        document.getElementById('authPassword').focus();
    }, { once: true });
}

async function confirmDeleteSelected() {
    const password = document.getElementById('authPassword').value;
    if (!password) {
        alert('Please enter your password');
        return;
    }

    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const token = localStorage.getItem('token');

        // Verify Password via Login API
        const verifyRes = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: password })
        });

        const verifyData = await verifyRes.json();

        // Check for token or ok status
        if (!verifyRes.ok || !verifyData.token) {
            alert('Invalid Password');
            return;
        }

        // Final permission check after verify password
        const currentUser = verifyData.user || user;
        const currentRights = currentUser.rights || {};
        const currentPerms = currentUser.permissions || [];
        const hasRight = currentRights['mod_11'] || currentPerms.includes('mod_11');

        if (!hasRight) {
            alert('Access Denied: You do not have PayRoll Delete rights.');
            return;
        }

        // Delete all selected payrolls
        let successCount = 0;
        let failCount = 0;

        for (const payrollId of selectedPayrollIds) {
            try {
                const response = await fetch(`/api/v1/payrolls/${payrollId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await response.json();

                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                failCount++;
            }
        }

        // Hide modal
        const modalEl = document.getElementById('authModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        // Show result message
        alert(`Deleted: ${successCount} record(s). Failed: ${failCount} record(s).`);

        // Clear selection
        selectedPayrollIds.clear();
        const selectAllCheck = document.getElementById('selectAllPayrolls');
        if (selectAllCheck) selectAllCheck.checked = false;

        // Reload the list
        loadPayrollList();
        GetTotalPresentEmployee();
    } catch (error) {
        console.error('Error deleting selected payrolls:', error);
        alert('An error occurred during deletion');
    }
}

function printPayroll(id) {
    window.open(`/print-payroll?id=${id}&v=20260617-7`, '_blank');

    // Clear selection and search after printing individual slip
    selectedPayrollIds.clear();
    const selectAllCheck = document.getElementById('selectAllPayrolls');
    if (selectAllCheck) selectAllCheck.checked = false;

    const searchBox = document.getElementById('listSearchText');
    if (searchBox) searchBox.value = '';

    renderPayrollTable(currentListPayrolls);
}

