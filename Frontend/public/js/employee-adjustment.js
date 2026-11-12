document.addEventListener('DOMContentLoaded', () => {
    loadBranches();
    loadEmployees();
    setDefaults();
    loadAdjustments();

    // Replaced standard input handler with robust SearchController logic
    const empInput = document.getElementById('employeeInput');
    const resultsBox = document.getElementById('employeeSearchResults');
    let currentFocus = -1;

    if (empInput) {
        // Input Event
        empInput.addEventListener('input', function () {
            const term = this.value.toLowerCase();
            const branch = document.getElementById('branch').value;
            resultsBox.innerHTML = '';
            resultsBox.style.display = 'none';
            currentFocus = -1; // Reset focus on new input

            if (term.length >= 1) {
                let filtered = window.allEmployees || [];
                if (branch) filtered = filtered.filter(e => e.branch === branch);

                const matches = filtered.filter(emp =>
                    emp.name.toLowerCase().includes(term) ||
                    emp.code.toString().includes(term)
                ).slice(0, 20);

                if (matches.length > 0) {
                    matches.forEach((emp, index) => {
                        const el = document.createElement('a');
                        el.className = 'list-group-item list-group-item-action p-2 small';
                        el.href = '#';
                        el.innerHTML = `<b>${emp.code}</b> - ${emp.name}`;
                        el.dataset.index = index; // Store index for keyboard nav

                        // Click Handler
                        el.addEventListener('click', (e) => {
                            e.preventDefault();
                            selectEmployee(emp);
                        });

                        resultsBox.appendChild(el);
                    });
                    resultsBox.style.display = 'block';
                }
            }
        });

        // Keyboard Navigation (Arrow Keys)
        empInput.addEventListener('keydown', function (e) {
            const items = resultsBox.getElementsByTagName('a');
            if (e.key === 'ArrowDown') {
                currentFocus++;
                addActive(items);
            } else if (e.key === 'ArrowUp') {
                currentFocus--;
                addActive(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus > -1) {
                    if (items[currentFocus]) items[currentFocus].click();
                } else if (items.length === 1) {
                    // If only one item, select it on Enter even if not highlighted
                    items[0].click();
                }
            }
        });

        function addActive(items) {
            if (!items) return false;
            removeActive(items);
            if (currentFocus >= items.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = (items.length - 1);

            items[currentFocus].classList.add('active'); // Bootstrap active class
            items[currentFocus].scrollIntoView({ block: 'nearest' });
        }

        function removeActive(items) {
            for (let i = 0; i < items.length; i++) {
                items[i].classList.remove('active');
            }
        }

        // Hide search results on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.position-relative')) {
                resultsBox.style.display = 'none';
            }
        });
    }

    document.getElementById('adjType').addEventListener('change', calculateBalance);
});

function selectEmployee(emp) {
    const empInput = document.getElementById('employeeInput');
    const resultsBox = document.getElementById('employeeSearchResults');
    empInput.value = `${emp.code} - ${emp.name}`;
    empInput.dataset.id = emp._id;
    resultsBox.style.display = 'none';

    document.getElementById('code').value = emp.code || '';
    autoFillDetails(emp._id);
}

function setDefaults() {
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('searchFrom').valueAsDate = new Date();
    document.getElementById('searchTo').valueAsDate = new Date();
}

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        let res = await fetch('/api/v1/stores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            res = await fetch('/api/v1/sub-branches', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }

        const json = await res.json();
        if (json.success && json.data) {
            const branchSelect = document.getElementById('branch');
            branchSelect.innerHTML = '<option value="">Select Branch</option>';

            const rawNames = json.data.map(item => (item.name || item.branchName || '').trim());
            const uniqueBranches = [...new Set(rawNames)].filter(n => n !== '').sort();

            uniqueBranches.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                branchSelect.appendChild(opt);
            });
        }
    } catch (err) { console.error('Error loading branches:', err); }
}

async function loadEmployees() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/employees', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            window.allEmployees = data.data;
        }
    } catch (error) {
        console.error('Error loading employees', error);
    }
}

async function autoFillDetails(empId) {
    const id = empId || document.getElementById('employeeInput').dataset.id;
    if (!id) return;

    const emp = window.allEmployees.find(e => e._id === id);
    if (emp) {
        document.getElementById('code').value = emp.code || '';

        // Fetch current ledger balance
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/v1/employee-ledger/balance/${id}?_t=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            let balance = 0;

            if (json.success) {
                balance = json.balance;
            } else {
                // Fallback to opening if ledger fails (though API handles this)
                balance = emp.opening || 0;
            }
            document.getElementById('preBal').value = balance;
        } catch (e) {
            console.error('Error fetching balance', e);
            document.getElementById('preBal').value = 0;
        }
    } else {
        document.getElementById('code').value = '';
        document.getElementById('preBal').value = 0;
    }
    calculateBalance();
}

document.getElementById('paid').addEventListener('input', calculateBalance);

function calculateBalance() {
    const type = document.getElementById('adjType').value;
    const preBal = parseFloat(document.getElementById('preBal').value) || 0;
    const amount = parseFloat(document.getElementById('paid').value) || 0;

    if (type === 'Received') {
        // Received money FROM employee (Recovery) -> Balance Decreases
        document.getElementById('balance').value = preBal - amount;
    } else {
        // Paid money TO employee (Advance) -> Balance Increases
        document.getElementById('balance').value = preBal + amount;
    }
}

async function saveAdjustment() {
    const data = {
        type: document.getElementById('adjType').value,
        date: document.getElementById('date').value,
        branch: document.getElementById('branch').value,
        employee: document.getElementById('employeeInput').dataset.id,
        preBal: parseFloat(document.getElementById('preBal').value) || 0,
        amount: parseFloat(document.getElementById('paid').value) || 0,
        balance: parseFloat(document.getElementById('balance').value) || 0,
        remarks: document.getElementById('remarks').value
    };

    if (!data.employee || !data.amount || !data.branch) {
        alert("Please fill required fields (Branch, Employee, Paid)");
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/v1/employee-adjustments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            alert("Adjustment Saved");
            clearForm();
            loadAdjustments();
        } else {
            alert("Error: " + result.message);
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadAdjustments() {
    try {
        const token = localStorage.getItem('token');
        const from = document.getElementById('searchFrom').value;
        const to = document.getElementById('searchTo').value;

        let url = '/api/v1/employee-adjustments';
        if (from && to) {
            url += `?from=${from}&to=${to}`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const list = document.getElementById('adjustmentList');
        list.innerHTML = '';

        if (data.success) {
            data.data.forEach(adj => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(adj.date).toLocaleDateString()}</td>
                    <td>(${adj.employee?.code || ''}) ${adj.employee?.name || '--'}</td>
                    <td>${adj.type}</td>
                    <td class="text-end pe-3">${adj.amount}</td>
                    <td>${adj.remarks || ''}</td>
                    <td class="text-center"><button class="btn btn-danger btn-sm" onclick="deleteAdjustment('${adj._id}')"><i class="fas fa-trash"></i></button></td>
                `;
                list.appendChild(tr);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteAdjustment(id) {
    if (!confirm("Are you sure?")) return;
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/employee-adjustments/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) loadAdjustments();
    } catch (err) { console.error(err); }
}

function clearForm() {
    const empInput = document.getElementById('employeeInput');
    empInput.value = '';
    delete empInput.dataset.id;
    document.getElementById('code').value = '';
    document.getElementById('preBal').value = 0;
    document.getElementById('paid').value = '';
    document.getElementById('balance').value = 0;
    document.getElementById('remarks').value = '';
    setDefaults();
}

async function rebuildLedger() {
    if (!confirm('This will recalculate the ledger for all employees. It may take a moment. Continue?')) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/employee-ledger/rebuild', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({}) // Rebuild ALL
        });
        const result = await res.json();
        if (result.success) {
            alert(result.message);
            // Reload current employee details if selected
            const empId = document.getElementById('employeeInput').dataset.id;
            if (empId) autoFillDetails(empId);
        } else {
            alert('Error: ' + result.message);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to rebuild ledger.');
    }
}

