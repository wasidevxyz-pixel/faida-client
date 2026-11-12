let attendanceRecords = [];
let branches = [];
let departments = [];
let designations = [];
let autoRefreshInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    setDefaultDates();
    
    // 1. Load branches FIRST and wait for them to populate the select
    await loadBranches();
    
    // 2. Load other filters in background
    Promise.all([
        loadDepartments(),
        loadDesignations(),
    ]).catch(err => console.error('Error loading filters:', err));

    // 3. Initial load
    await loadAttendanceList();

    // Start auto-refresh by default
    startAutoRefresh();
});

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => loadAttendanceList(true), 5000); // 5 seconds for "live" feel
    const timerBtn = document.getElementById('timerBtn');
    if (timerBtn) {
        timerBtn.innerHTML = '<i class="fas fa-sync fa-spin me-1"></i> Live Mode ON';
        timerBtn.classList.replace('btn-warning', 'btn-danger');
        timerBtn.title = "Click to stop auto-refresh";
    }
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    const timerBtn = document.getElementById('timerBtn');
    if (timerBtn) {
        timerBtn.innerHTML = '<i class="fas fa-play me-1"></i> Start Timer';
        timerBtn.classList.replace('btn-danger', 'btn-warning');
        timerBtn.title = "Click to start auto-refresh every 5s";
    }
}

function toggleAutoRefresh() {
    if (autoRefreshInterval) stopAutoRefresh();
    else startAutoRefresh();
}

function setDefaultDates() {
    const now = new Date();
    const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    document.getElementById('fromDate').value = today;
    document.getElementById('toDate').value = today;
}

async function loadBranches() {
    await window.populateBranchSelect('filterBranch', { 
        placeholder: 'Select Branch'
    });
}

async function loadDepartments() {
    try {
        const token = localStorage.getItem('token');
        const data = await cachedFetch('/api/v1/employee-departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (data && data.success) {
            const select = document.getElementById('filterDept');
            select.innerHTML = '<option value="">Select Department</option>';
            data.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                select.appendChild(opt);
            });
        }
    } catch (err) { console.error(err); }
}

async function loadDesignations() {
    try {
        const token = localStorage.getItem('token');
        const data = await cachedFetch('/api/v1/designations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (data && data.success) {
            const select = document.getElementById('filterDesig');
            select.innerHTML = '<option value="">Select Designation</option>';
            data.data.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d._id;
                opt.textContent = d.name;
                select.appendChild(opt);
            });
        }
    } catch (err) { console.error(err); }
}

async function loadAttendanceList(isBackground = false) {
    // Skip background refresh if user is focused on any input in the table (likely editing)
    if (isBackground && document.activeElement &&
        document.activeElement.tagName === 'INPUT' &&
        document.activeElement.closest('#attendanceRecordsBody')) {
        return;
    }

    // Skip background refresh if there is an active search query
    const searchInput = document.getElementById('globalSearch');
    if (isBackground && searchInput && searchInput.value.trim() !== '') {
        return;
    }

    const tbody = document.getElementById('attendanceRecordsBody');
    if (!isBackground) {
        tbody.innerHTML = '<tr><td colspan="19" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    }

    try {
        const token = localStorage.getItem('token');
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;
        const branch = document.getElementById('filterBranch').value;

        if (!branch) {
            if (!isBackground) {
                tbody.innerHTML = '<tr><td colspan="19" class="text-center text-secondary py-3"><i class="fas fa-info-circle me-1"></i>Please select a branch to load records.</td></tr>';
            }
            return;
        }

        const apiBranch = branch === 'all' ? '' : branch;

        const dept = document.getElementById('filterDept').value;
        const desig = document.getElementById('filterDesig').value;
        const status = document.getElementById('filterStatus').value;

        // Update Screen Grid Header
        if (document.getElementById('dispDateRange')) {
            document.getElementById('dispDateRange').textContent = `${fromDate} to ${toDate}`;
        }
        if (document.getElementById('dispDept')) {
            const deptText = document.getElementById('filterDept').options[document.getElementById('filterDept').selectedIndex].text;
            document.getElementById('dispDept').textContent = dept ? deptText : 'All Departments';
        }

        // 1 & 2. Fetch Employees (Cached) & Attendance (Fresh) in parallel
        // Employees rarely change, so we use cachedFetch to avoid fetching 10,000 records every 5 seconds.
        // Attendance uses _t to bust cache for live updates.
        const timestamp = Date.now();
        let empUrl = `/api/v1/employees?branch=${apiBranch}&department=${dept}&designation=${desig}&limit=10000&light=true`;
        let attUrl = `/api/v1/attendance?from=${fromDate}&to=${toDate}&branch=${apiBranch}&department=${dept}&designation=${desig}&limit=10000&_t=${timestamp}`;

        // Try to fetch employees from cache (5 minute TTL by default in cachedFetch)
        const [empData, attRes] = await Promise.all([
            window.cachedFetch ? window.cachedFetch(empUrl, { headers: { 'Authorization': `Bearer ${token}` } }) : fetch(empUrl, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
            fetchWithRetry(attUrl, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        const attData = await attRes.json();

        if (empData && empData.success && attData && attData.success) {
            // Apply strict local filtering as a safety layer
            const allEmployees = empData.data.filter(e => {
                const status = (e.status || '').toLowerCase();
                const isActive = e.isActive;
                const notImport = status !== 'import' && status !== 'resign';
                
                // Local branch safety check
                let branchMatch = true;
                if (apiBranch) {
                    const eBranch = (e.branch || '').replace(/[()]/g, '').trim().toLowerCase();
                    const targetBranch = apiBranch.replace(/[()]/g, '').trim().toLowerCase();
                    branchMatch = (eBranch === targetBranch);
                }
                
                return isActive && notImport && branchMatch;
            });
            const recordedAttendance = attData.data;

            // 1. Build list of dates in range (descending)
            const dateList = [];
            let curr = new Date(fromDate);
            const stop = new Date(toDate);
            while (curr <= stop) {
                const d = new Date(curr);
                const dStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
                dateList.push(dStr);
                curr.setDate(curr.getDate() + 1);
                if (dateList.length > 32) break; // Limit to 1 month for safety
            }
            dateList.sort((a, b) => b.localeCompare(a));

            // 2. Index recorded attendance for O(1) lookup
            const attMap = {};
            recordedAttendance.forEach(a => {
                const d = new Date(a.date);
                const dStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
                const empId = a.employee?._id || a.employee;
                attMap[`${empId}_${dStr}`] = a;

                // Cross-branch Check-in Fix:
                // If this employee checked in at this branch but belongs to a different home branch,
                // they won't be in `allEmployees`. We must add them so their record is rendered.
                if (a.employee && a.employee._id && !allEmployees.some(e => e._id === a.employee._id)) {
                    // Check if they match department and designation filters (if active)
                    let matchesFilters = true;
                    if (dept) {
                        const empDeptId = a.employee.department?._id || a.employee.department;
                        if (empDeptId !== dept) matchesFilters = false;
                    }
                    if (desig) {
                        const empDesigId = a.employee.designation?._id || a.employee.designation;
                        if (empDesigId !== desig) matchesFilters = false;
                    }
                    if (matchesFilters) {
                        allEmployees.push(a.employee);
                    }
                }
            });

            // 3. Merge: For each date, for each employee
            attendanceRecords = [];
            dateList.forEach(dStr => {
                allEmployees.forEach(emp => {
                    const record = attMap[`${emp._id}_${dStr}`];
                    if (record) {
                        attendanceRecords.push(record);
                    } else {
                        // Return a "virtual" record if none exists for this day
                        attendanceRecords.push({
                            _id: `new_${emp._id}_${dStr}`,
                            employee: emp,
                            date: dStr,
                            branch: emp.branch,
                            displayStatus: 'Present',
                            checkIn: '',
                            checkOut: '',
                            workedHrs: '',
                            isNew: true
                        });
                    }
                });
            });

            // Status filter (client-side for merged data)
            if (status) {
                const isTimeEmpty = (val) => {
                    if (!val) return true;
                    const v = val.toString().trim();
                    return v === '' || v === '--:--' || v === '-' || v === '---';
                };

                if (status === 'less_1hr') {
                    attendanceRecords = attendanceRecords.filter(r => {
                        const mins = parseTime(r.workedHrs);
                        return mins > 0 && mins < 60;
                    });
                } else if (status === 'greater_17hr') {
                    attendanceRecords = attendanceRecords.filter(r => {
                        const mins = parseTime(r.workedHrs);
                        return mins > 1020; // 17 * 60
                    });
                } else if (status === 'no_checkinout') {
                    // Only show 'Present' employees who are missing BOTH check in and check out
                    attendanceRecords = attendanceRecords.filter(r => 
                        isTimeEmpty(r.checkIn) && isTimeEmpty(r.checkOut) && r.displayStatus === 'Present'
                    );
                } else if (status === 'checkin_no_out') {
                    // Only show 'Present' employees who have check-in but missing check-out
                    attendanceRecords = attendanceRecords.filter(r => 
                        !isTimeEmpty(r.checkIn) && isTimeEmpty(r.checkOut) && r.displayStatus === 'Present'
                    );
                } else if (status === 'Present') {
                    // Only show those explicitly marked Present and have some time data
                    // (prevents virtual records from bloating the 'Only Present' view)
                    attendanceRecords = attendanceRecords.filter(r => 
                        r.displayStatus === 'Present' && (!isTimeEmpty(r.checkIn) || !isTimeEmpty(r.checkOut))
                    );
                } else {
                    attendanceRecords = attendanceRecords.filter(r => r.displayStatus === status);
                }
            }

            // Preserve scroll position during refresh
            const tableContainer = document.querySelector('.table-container');
            const scrollTop = tableContainer ? tableContainer.scrollTop : 0;
            const scrollLeft = tableContainer ? tableContainer.scrollLeft : 0;

            renderAttendanceTable();

            // Update timestamp
            const now = new Date();
            const timeStr = now.toLocaleTimeString();
            const timerBtn = document.getElementById('timerBtn');
            if (timerBtn && isBackground) {
                timerBtn.innerHTML = `<i class="fas fa-sync fa-spin me-1"></i> Live Mode ON <span style="font-size: 0.65rem; opacity: 0.8;">- Last Sync: ${timeStr}</span>`;
            }

            if (isBackground && tableContainer) {
                tableContainer.scrollTop = scrollTop;
                tableContainer.scrollLeft = scrollLeft;
            }
        }
    } catch (error) {
        console.error('Error loading attendance:', error);
        tbody.innerHTML = '<tr><td colspan="19" class="text-center text-danger">Error loading data</td></tr>';
    }
}

function renderAttendanceTable() {
    const tbody = document.getElementById('attendanceRecordsBody');
    tbody.innerHTML = '';

    // Use DocumentFragment to prevent layout thrashing on mass-insert
    const fragment = document.createDocumentFragment();

    attendanceRecords.forEach((att, index) => {
        const tr = document.createElement('tr');

        // Calculate mins for initial coloring
        const mins = att.totalHrs ? (att.totalHrs * 60) : parseTime(att.workedHrs);

        // Initial color based on activity
        tr.className = '';
        if (att.displayStatus === 'Absent') {
            tr.className = 'row-absent';
        } else if (att.displayStatus === 'Leave') {
            tr.className = 'row-leave';
        } else if (att.checkIn === '--:--' || (att.checkIn === '' && att.checkOut && att.checkOut !== '')) {
            tr.className = 'row-missed-in'; // Priority: Missed Check-IN
        } else if (att.checkIn && !att.checkOut) {
            tr.className = 'row-partial';
        } else if (mins >= 1020) {
            tr.className = 'row-overtime'; // Priority 2: Overtime (Purple)
        } else if (mins > 0 && mins <= 60) {
            tr.className = 'row-warning';
        } else if (att.checkIn && att.checkOut && mins > 60) {
            tr.className = 'row-completed'; // Green
        }

        tr.dataset.id = att._id;

        const date = new Date(att.date);
        const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        const finalHrsStr = att.totalHrs
            ? (Math.floor(att.totalHrs) + ':' + Math.round((att.totalHrs % 1) * 60).toString().padStart(2, '0'))
            : (att.workedHrs || '');

        tr.innerHTML = `
            <td class="text-center col-sr">${index + 1}</td>
            <td class="text-center col-date" style="font-weight: 600;">${dateStr}</td>
            <td class="text-center col-code">
                <div class="d-flex align-items-center justify-content-center gap-1 no-print">
                    <a href="/employee-attendance-detail?id=${att.employee?._id || ''}&date=${att.date}" class="code-link-box">
                        ${att.employee?.code || '-'}
                    </a>
                    <button class="btn btn-primary btn-xs py-0 px-1" style="font-size: 0.65rem;" onclick="quickSaveAttendance('${att._id}', this)">Save</button>
                </div>
                <span class="print-value">${att.employee?.code || '-'}</span>
            </td>
            <td class="ps-2 fw-bold text-uppercase col-name">
                <span class="no-print">
                    ${att.employee?.name || '-'}
                    ${(() => {
                        const isFace = (att.verificationMethod === 'FACE_AI' || (att.remarks && att.remarks.includes('[Face AI]')));
                        const isBio = (att.verificationMethod === 'FINGERPRINT' || (att.remarks && att.remarks.includes('[Biometric]')));
                        if (isFace) {
                            return `<span class="badge bg-info text-dark ms-1 px-1 py-0 fw-bold" style="font-size: 0.65rem;" title="${att.remarks || 'Verified via Face AI'}">📸 Face AI</span>`;
                        } else if (isBio) {
                            return `<span class="badge bg-secondary text-white ms-1 px-1 py-0 fw-bold" style="font-size: 0.65rem;" title="${att.remarks || 'Verified via Fingerprint'}">🖐️ Bio</span>`;
                        }
                        return '';
                    })()}
                    <span class="badge rounded-circle ms-1 px-2 py-1 no-print ${att.displayStatus === 'Absent' ? 'bg-danger text-white' : 'bg-white text-danger border border-danger'}" 
                          style="font-size: 0.7rem; cursor: pointer;" 
                          onclick="toggleAbsent(this)">A</span>
                </span>
                
                <!-- Print-only: show English + Urdu name in same column (Urdu right side) -->
                ${(() => {
                    const e = att.employee || {};
                    const ur = e.name_urdu || e.nameUrdu || e.urduName || e.nameLocal || e.localName || '';
                    // Escape any template-unfriendly characters
                    const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    if (!ur) return '';
                    return `<span class="print-value" style="display:block; width:100%; text-align:left;">` +
                        `<div style="font-weight:700; margin-bottom:4px;">${esc(e.name || '-')}</div>` +
                        `<div style=\"font-weight:700; font-family: 'Noto Nastaliq Urdu', 'Times New Roman', serif; direction: rtl;\">${esc(ur)}</div>` +
                        `</span>`;
                })()}
            </td>
            <td class="text-center col-dept">${att.employee?.department?.name || '-'}</td>
            <td class="text-center col-desig">${att.employee?.designation?.name || '-'}</td>
            <td class="text-center col-duty" style="font-weight: 600;">${getDutyHoursDisplay(att.employee)}</td>
            <td class="px-1 col-checkin">
                <input type="time" class="form-control form-control-xs text-center fw-bold" value="${convertTo24Hour(att.checkIn)}" oninput="updateWorkedHrs(this)">
                <span class="print-value">${formatTimeAMPM(att.checkIn)}</span>
            </td>
            <td class="px-1 col-checkout">
                <input type="time" class="form-control form-control-xs text-center fw-bold" value="${convertTo24Hour(att.checkOut)}" oninput="updateWorkedHrs(this)">
                <span class="print-value">${formatTimeAMPM(att.checkOut)}</span>
            </td>
            <td class="text-center fw-bold col-worked">
                <span class="val">${att.workedHrs || ''}</span>
                <span class="print-value">${att.workedHrs || ''}</span>
            </td>
            <td class="px-1 col-breakout">
                <input type="time" class="form-control form-control-xs text-center fw-bold" value="${convertTo24Hour(att.breakOut)}" oninput="updateWorkedHrs(this)">
                <span class="print-value">${formatTimeAMPM(att.breakOut)}</span>
            </td>
            <td class="px-1 col-breakin">
                <input type="time" class="form-control form-control-xs text-center fw-bold" value="${convertTo24Hour(att.breakIn)}" oninput="updateWorkedHrs(this)">
                <span class="print-value">${formatTimeAMPM(att.breakIn)}</span>
            </td>
            <td class="text-center fw-bold col-breakhrs">
                <span class="val">${att.breakHrs || ''}</span>
                <span class="print-value">${att.breakHrs || ''}</span>
            </td>
            <td class="px-1 col-diffin">
                <input type="time" class="form-control form-control-xs text-center fw-bold" value="${convertTo24Hour(att.timeDiffIn)}" oninput="updateWorkedHrs(this)">
                <span class="print-value">${formatTimeAMPM(att.timeDiffIn)}</span>
            </td>
            <td class="px-1 col-diffout">
                <input type="time" class="form-control form-control-xs text-center fw-bold" value="${convertTo24Hour(att.timeDiffOut)}" oninput="updateWorkedHrs(this)">
                <span class="print-value">${formatTimeAMPM(att.timeDiffOut)}</span>
            </td>
            <td class="text-center fw-bold col-totaldiff ${att.diffMode === '-' ? 'bg-minus' : ''}">
                <span class="val">${att.totalDiffHrs || ''}</span>
                <span class="print-value">${att.totalDiffHrs || ''}</span>
            </td>
            <td class="text-center fw-bold col-totalhrs">
                <span class="val">${finalHrsStr}</span>
                <span class="print-value">${finalHrsStr}</span>
            </td>
            <td class="px-1 text-center col-status">
                <select class="form-select form-select-xs fw-bold no-print" onchange="updateRowColor(this)">
                    <option value="Present" ${att.displayStatus === 'Present' ? 'selected' : ''}>Present</option>
                    <option value="Absent" ${att.displayStatus === 'Absent' ? 'selected' : ''}>Absent</option>
                </select>
                <span class="print-value">${att.displayStatus === 'Absent' ? 'A' : 'P'}</span>
            </td>
        `;

        fragment.appendChild(tr);

        // Trigger calculation BEFORE appending to DOM to avoid severe layout thrashing (Reflow)
        const checkInInput = tr.querySelector('.col-checkin input');
        if (checkInInput) updateWorkedHrs(checkInInput);
    });

    // Append all rows at once
    tbody.appendChild(fragment);
}

function updateRowColor(element) {
    const tr = element.closest('tr');
    const statusSelect = tr.querySelector('.col-status select');
    const checkInInput = tr.querySelector('.col-checkin input');
    const checkOutInput = tr.querySelector('.col-checkout input');
    const totalHrsText = tr.querySelector('.col-totalhrs').textContent;

    if (!statusSelect || !checkInInput) return;

    const status = statusSelect.value;
    const checkIn = checkInInput.value;
    const checkOut = checkOutInput ? checkOutInput.value : '';
    const mins = parseTime(totalHrsText);

    if (status === 'Absent' || status === 'Leave') {
        const inputs = tr.querySelectorAll('input[type="time"]');
        inputs.forEach(input => {
            input.value = '';
            const span = input.nextElementSibling;
            if (span && span.classList.contains('print-value')) {
                span.textContent = '';
            }
        });

        ['col-worked', 'col-breakhrs', 'col-totaldiff', 'col-totalhrs'].forEach(cls => {
            const cell = tr.querySelector(`.${cls}`);
            if (cell) {
                const valSpan = cell.querySelector('.val');
                const printSpan = cell.querySelector('.print-value');
                if (valSpan) valSpan.textContent = '';
                if (printSpan) printSpan.textContent = '';
            }
        });
    }

    tr.className = '';
    // Use val span specifically to avoid double-text issue (18:0018:00)
    const valSpan = tr.querySelector('.col-totalhrs .val');
    const actualMins = valSpan ? parseTime(valSpan.textContent) : mins;

    if (status === 'Absent') {
        tr.className = 'row-absent';
    } else if (status === 'Leave') {
        tr.className = 'row-leave';
    } else if (checkIn === '--:--' || (checkIn === '' && checkOut && checkOut !== '')) {
        tr.className = 'row-missed-in';
    } else if (checkIn && !checkOut) {
        tr.className = 'row-partial';
    } else if (actualMins >= 1020) {
        tr.className = 'row-overtime'; // Prioritize purple for 17+ hours
    } else if (actualMins > 0 && actualMins <= 60) {
        tr.className = 'row-warning';
    } else if (checkIn && checkOut && actualMins > 60) {
        tr.className = 'row-completed';
    }

    // Dynamic Name Badge Update
    const nameCell = tr.querySelector('.col-name');
    if (nameCell) {
        let badge = nameCell.querySelector('.badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'badge rounded-circle ms-1 px-2 py-1';
            badge.style.fontSize = '0.7rem';
            badge.style.cursor = 'pointer';
            badge.textContent = 'A';
            badge.onclick = function () { toggleAbsent(this); };
            badge.title = "Toggle Absent/Present";
            nameCell.appendChild(badge);
        }

        if (status === 'Absent') {
            badge.className = 'badge rounded-circle ms-1 px-2 py-1 bg-danger text-white';
        } else {
            badge.className = 'badge rounded-circle ms-1 px-2 py-1 bg-white text-danger border border-danger';
        }
    }
}

function toggleAbsent(badge) {
    const tr = badge.closest('tr');
    const statusSelect = tr.querySelector('.col-status select');
    if (!statusSelect) return;

    if (statusSelect.value === 'Absent') {
        statusSelect.value = 'Present'; // Toggle back to Present
    } else {
        // ASK FOR CONFIRMATION BEFORE MARKING ABSENT
        const employeeName = tr.querySelector('.col-name').childNodes[0].textContent.trim();
        if (!confirm(`ARE YOU SURE YOU WANT TO MARK "${employeeName}" AS ABSENT?`)) {
            return; // Abort if user clicks No/Cancel
        }
        statusSelect.value = 'Absent'; // Set to Absent
    }

    // Trigger update logic
    updateRowColor(statusSelect);

    // AUTO SAVE
    const saveBtn = tr.querySelector('.btn-primary, .btn-success');
    if (saveBtn) {
        const id = tr.dataset.id;
        quickSaveAttendance(id, saveBtn);
    }
}

function setDiffMode(btn, mode) {
    const parent = btn.closest('.diff-btns');
    parent.dataset.mode = mode;
    parent.querySelectorAll('.btn-diff').forEach(b => b.classList.add('opacity-50'));
    btn.classList.remove('opacity-50');
    updateWorkedHrs(btn);
}

function handleGlobalSearch(value) {
    const filter = value.toUpperCase();
    const rows = document.getElementById('attendanceRecordsBody').getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const text = rows[i].textContent || rows[i].innerText;
        if (text.toUpperCase().indexOf(filter) > -1) {
            rows[i].style.display = "";
        } else {
            rows[i].style.display = "none";
        }
    }

    // Pause auto-refresh while searching so the user can click on a record without it refreshing
    if (value.trim() !== '') {
        // Only stop if it's currently running (don't touch manual stop)
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
            // Show paused indicator on the button
            const timerBtn = document.getElementById('timerBtn');
            if (timerBtn) {
                timerBtn.innerHTML = '<i class="fas fa-pause me-1"></i> Live Mode PAUSED <span style="font-size: 0.65rem; opacity: 0.8;">- Searching...</span>';
            }
        }
    } else {
        // Search cleared — resume live refresh automatically
        if (!autoRefreshInterval) {
            startAutoRefresh();
        }
    }
}

function updateWorkedHrs(input) {
    const tr = input.closest('tr');
    const localRecord = attendanceRecords.find(r => r._id === tr.dataset.id);
    const checkIn = tr.querySelector('.col-checkin input').value;
    const checkOut = tr.querySelector('.col-checkout input').value;
    const breakOut = tr.querySelector('.col-breakout input').value;
    const breakIn = tr.querySelector('.col-breakin input').value;
    const diffIn = tr.querySelector('.col-diffin input')?.value || '';
    const diffOut = tr.querySelector('.col-diffout input')?.value || '';
    const mode = localRecord?.diffMode || '+';

    // Update Print Values for Inputs with AM/PM
    tr.querySelectorAll('input').forEach(inp => {
        const span = inp.nextElementSibling;
        if (span && span.classList.contains('print-value')) {
            span.textContent = formatTimeAMPM(inp.value);
        }
    });

    // Update Print Values for Selects
    tr.querySelectorAll('select').forEach(sel => {
        const span = sel.nextElementSibling;
        if (span && span.classList.contains('print-value')) {
            span.textContent = sel.value === 'Absent' ? 'A' : 'P';
        }
    });

    // Helper to update val and print-value for calculated cells
    const updateCalculatedCell = (className, value) => {
        const cell = tr.querySelector(`.${className}`);
        if (!cell) return;
        const valSpan = cell.querySelector('.val');
        const printSpan = cell.querySelector('.print-value');
        if (valSpan) valSpan.textContent = value;
        if (printSpan) printSpan.textContent = value;
        if (!valSpan && !printSpan) cell.textContent = value;
    };

    // 1. Calculate Break Hrs
    let bMin = 0;
    if (breakOut && breakIn) {
        const outParts = breakOut.split(':').map(Number);
        const inParts = breakIn.split(':').map(Number);
        bMin = (inParts[0] * 60 + inParts[1]) - (outParts[0] * 60 + outParts[1]);
        if (bMin < 0) bMin += 1440; // overnight

        const bHrsStr = `${Math.floor(bMin / 60)}:${(bMin % 60).toString().padStart(2, '0')}`;
        updateCalculatedCell('col-breakhrs', bHrsStr);
    } else {
        updateCalculatedCell('col-breakhrs', '');
    }

    // 2. Calculate Total Diffs
    let totalDiffMin = 0;
    if (diffIn && diffOut) {
        const inParts = diffIn.split(':').map(Number);
        const outParts = diffOut.split(':').map(Number);
        totalDiffMin = (outParts[0] * 60 + outParts[1]) - (inParts[0] * 60 + inParts[1]);
        if (totalDiffMin < 0) totalDiffMin += 1440;

        const totalDiffStr = `${Math.floor(totalDiffMin / 60)}:${(totalDiffMin % 60).toString().padStart(2, '0')}`;
        updateCalculatedCell('col-totaldiff', totalDiffStr);
        
        // Dynamic color update
        const diffCell = tr.querySelector('.col-totaldiff');
        if (diffCell) {
            if (mode === '-') {
                diffCell.classList.add('bg-minus');
            } else {
                diffCell.classList.remove('bg-minus');
            }
        }
    } else {
        updateCalculatedCell('col-totaldiff', '');
        tr.querySelector('.col-totaldiff')?.classList.remove('bg-minus', 'bg-plus');
    }

    // 3. Gross Worked
    if (checkIn && checkOut) {
        const cin = checkIn.split(':').map(Number);
        const cout = checkOut.split(':').map(Number);
        let wMin = (cout[0] * 60 + cout[1]) - (cin[0] * 60 + cin[1]);
        if (wMin < 0) wMin += 1440;

        const grossHrsStr = `${Math.floor(wMin / 60)}:${(wMin % 60).toString().padStart(2, '0')}`;
        updateCalculatedCell('col-worked', grossHrsStr);

        // 4. Net Worked
        let netMin = wMin - (bMin || 0);
        if (netMin < 0) netMin = 0;

        // 5. Final Total
        let finalMin = netMin;
        if (mode === '+') finalMin += (totalDiffMin || 0);
        else finalMin -= (totalDiffMin || 0);
        if (finalMin < 0) finalMin = 0;

        const h = Math.floor(finalMin / 60);
        const m = finalMin % 60;
        const finalStr = `${h}:${m.toString().padStart(2, '0')}`;
        updateCalculatedCell('col-totalhrs', finalStr);

        // Auto-set status if both times filled
        const statusSelect = tr.querySelector('.col-status select');
        if (statusSelect.value === 'Absent' || statusSelect.value === '') {
            statusSelect.value = 'Present';
            // Also update print value for status
            const span = statusSelect.nextElementSibling;
            if (span && span.classList.contains('print-value')) span.textContent = 'P';
            updateRowColor(statusSelect);
        }
    } else {
        // Only show Worked Hrs if BOTH CheckIn and CheckOut are present
        updateCalculatedCell('col-worked', '');
        updateCalculatedCell('col-totalhrs', '');
    }
    updateRowColor(input);
}

async function quickSaveAttendance(id, btn) {
    const tr = btn.closest('tr');
    const isNew = id.startsWith('new_');
    const parts = id.split('_');
    const realEmpId = isNew ? parts[1] : null;

    const localRecord = attendanceRecords.find(r => r._id === id);

    if (!localRecord) {
        console.error('Record not found in local state:', id);
        alert('Record not found. Please refresh the page.');
        btn.disabled = false;
        return;
    }

    const updatedData = {
        employee: realEmpId || (localRecord.employee?._id || localRecord.employee),
        date: localRecord.date,
        branch: localRecord.branch || document.getElementById('filterBranch').value || '',
        checkIn: tr.querySelector('.col-checkin input').value,
        checkOut: tr.querySelector('.col-checkout input').value,
        workedHrs: tr.querySelector('.col-worked .val')?.textContent?.trim() || '',
        breakOut: tr.querySelector('.col-breakout input').value,
        breakIn: tr.querySelector('.col-breakin input').value,
        breakHrs: tr.querySelector('.col-breakhrs .val')?.textContent?.trim() || '',
        diffMode: localRecord?.diffMode || '+',
        timeDiffIn: tr.querySelector('.col-diffin input')?.value || '',
        timeDiffOut: tr.querySelector('.col-diffout input')?.value || '',
        totalDiffHrs: tr.querySelector('.col-totaldiff .val')?.textContent?.trim() || '',
        totalHrs: (() => {
            const str = tr.querySelector('.col-totalhrs .val')?.textContent?.trim() || '';
            if (!str || !str.includes(':')) return 0;
            const [h, m] = str.split(':').map(Number);
            return (h || 0) + ((m || 0) / 60);
        })(),
        displayStatus: tr.querySelector('.col-status select').value,
        isPresent: tr.querySelector('.col-status select').value === 'Present'
    };

    // Prevent saving if hours are negative (common mistake)
    if (updatedData.workedHrs && updatedData.workedHrs.startsWith('-')) {
        alert('Negative Worked Hours are not allowed. Please check IN/OUT times.');
        return;
    }
    if (updatedData.breakHrs && updatedData.breakHrs.startsWith('-')) {
        alert('Negative Break Hours are not allowed. Please check Break OUT/IN times.');
        return;
    }
    if (updatedData.totalDiffHrs && updatedData.totalDiffHrs.startsWith('-')) {
        alert('Negative Total Difference is not allowed. Please check Diff times.');
        return;
    }

    if (btn.disabled) return;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';

    // Pause auto-refresh briefly so the user doesn't see a "flicker" of old data
    const wasRefreshing = !!autoRefreshInterval;
    if (wasRefreshing) stopAutoRefresh();

    try {
        const token = localStorage.getItem('token');
        const method = isNew ? 'POST' : 'PUT';
        const url = isNew ? '/api/v1/attendance' : `/api/v1/attendance/${id}`;

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updatedData)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `Server responded with ${res.status}`);
        }

        const data = await res.json();
        if (data.success) {
            btn.textContent = 'Saved!';
            btn.classList.replace('btn-primary', 'btn-success');

            if (isNew) {
                try {
                    await loadAttendanceList();
                } catch (err) {
                    console.error('Failed to reload after save:', err);
                    const savedRecord = attendanceRecords.find(r => r._id === id);
                    if (savedRecord) savedRecord.isNew = false;
                    location.reload();
                }
            } else {
                updateRowColor(tr);
            }

            setTimeout(() => {
                btn.textContent = 'Save';
                btn.classList.replace('btn-success', 'btn-primary');
                btn.disabled = false;
            }, 2000);
        } else {
            alert('Error: ' + data.message);
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        console.error('Save failed:', err);
        alert('Failed to update attendance: ' + err.message);
        btn.textContent = originalText;
        btn.disabled = false;
    } finally {
        // Resume auto-refresh if it was running
        if (wasRefreshing && !autoRefreshInterval) startAutoRefresh();
    }
}
function handlePrint() {
    const fromDateVal = document.getElementById('fromDate').value;
    const toDateVal = document.getElementById('toDate').value;
    const branchText = document.getElementById('filterBranch').options[document.getElementById('filterBranch').selectedIndex]?.text || '-';
    const printRoot = document.getElementById('print-only-root');

    if (!printRoot) return;

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/ /g, '-');
    };

    const dateRangeStr = fromDateVal === toDateVal
        ? formatDate(fromDateVal)
        : `${formatDate(fromDateVal)} to ${formatDate(toDateVal)}`;

    // 1. Build Header
    let html = `
        <div class="print-header">
            <h1>Dwatson</h1>
            <h2>Branch: ${branchText}</h2>
            <h3>Employee Attendance Sheet</h3>
            <p style="font-size: 10pt; font-weight: bold; margin-top: 5px;">${dateRangeStr}</p>
        </div>
    `;

    // 2. Build Table
    html += `
        <table class="print-table">
            <thead>
                <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th class="black-col">Worked Hrs</th>
                    <th>Break Out</th>
                    <th>Break In</th>
                    <th class="black-col">Total Brk Hrs</th>
                    <th>Time Diff In</th>
                    <th>Time Diff Out</th>
                    <th class="black-col">Total Diff Hrs</th>
                    <th class="black-col">Total Hrs</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    // 3. Grab Rows from Screen
    const rows = document.querySelectorAll('#attendanceRecordsBody tr');
    rows.forEach(row => {
        const code = row.querySelector('.col-code .print-value')?.textContent || '-';

        // Correctly get name without the "A" badge text
        const nameCell = row.querySelector('.col-name');
        let name = '-';
        const recordId = row.dataset.id;
        const att = attendanceRecords.find(r => r._id === recordId);
        if (att) {
            const emp = att.employee || {};
            const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const engName = esc(emp.name || '-');
            const urduName = esc(emp.name_urdu || emp.nameUrdu || emp.urduName || emp.nameLocal || emp.localName || '');
            if (urduName) {
                name = `<div style="font-weight:700; margin-bottom:4px;">${engName}</div>` +
                       `<div style="font-weight:700; font-family: 'Noto Nastaliq Urdu', 'Times New Roman', serif; direction: rtl;">${urduName}</div>`;
            } else {
                name = engName;
            }
        } else if (nameCell) {
            const printVal = nameCell.querySelector('.print-value');
            if (printVal) {
                // If there's an Urdu name, use the print-value innerHTML to preserve both English and Urdu formatting
                name = printVal.innerHTML;
            } else {
                // Fallback to standard no-print text (without the badge)
                const noPrintSpan = nameCell.querySelector('.no-print');
                if (noPrintSpan) {
                    const clone = noPrintSpan.cloneNode(true);
                    const badge = clone.querySelector('.badge');
                    if (badge) badge.remove();
                    name = clone.textContent.trim();
                } else {
                    const clone = nameCell.cloneNode(true);
                    const badge = clone.querySelector('.badge');
                    if (badge) badge.remove();
                    name = clone.textContent.trim();
                }
            }
        }

        // Use the print-value spans for times
        const checkIn = row.querySelector('.col-checkin .print-value')?.textContent || '';
        const checkOut = row.querySelector('.col-checkout .print-value')?.textContent || '';
        const worked = row.querySelector('.col-worked .print-value')?.textContent || '';

        const breakOut = row.querySelector('.col-breakout .print-value')?.textContent || '';
        const breakIn = row.querySelector('.col-breakin .print-value')?.textContent || '';
        const totalBrk = row.querySelector('.col-breakhrs .print-value')?.textContent || '';

        const diffIn = row.querySelector('.col-diffin .print-value')?.textContent || '';
        const diffOut = row.querySelector('.col-diffout .print-value')?.textContent || '';
        const totalDiff = row.querySelector('.col-totaldiff .print-value')?.textContent || '';

        const totalHrs = row.querySelector('.col-totalhrs .print-value')?.textContent || '';
        const status = row.querySelector('.col-status .print-value')?.textContent || 'P';

        html += `
            <tr>
                <td>${code}</td>
                <td class="name-cell">${name}</td>
                <td>${checkIn}</td>
                <td>${checkOut}</td>
                <td style="font-weight: bold;">${worked}</td>
                <td>${breakOut}</td>
                <td>${breakIn}</td>
                <td>${totalBrk}</td>
                <td>${diffIn}</td>
                <td>${diffOut}</td>
                <td>${totalDiff}</td>
                <td style="font-weight: bold;">${totalHrs}</td>
                <td style="font-weight: bold;">${status}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;

    printRoot.innerHTML = html;
    window.print();
}


function formatTimeAMPM(timeStr) {
    if (!timeStr) return '';
    if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) return timeStr;
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
}
function convertTo24Hour(timeStr) {
    if (!timeStr) return '';
    const cleanStr = timeStr.trim().toUpperCase();

    // Check for AM/PM format (with or without space)
    if (cleanStr.includes('AM') || cleanStr.includes('PM')) {
        const isPM = cleanStr.includes('PM');
        // Extract numbers using regex (HH:mm:ss or HH:mm)
        const parts = cleanStr.replace(/[A-Z\s]/g, '').split(':');
        let hours = parseInt(parts[0], 10) || 0;
        let minutes = parseInt(parts[1], 10) || 0;

        if (hours === 12) hours = 0;
        if (isPM) hours += 12;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Handle 24h format (HH:mm or HH:mm:ss)
    const parts = cleanStr.split(':');
    if (parts.length >= 2) {
        const h = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        return `${h}:${m}`;
    }

    return timeStr;
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const time24 = convertTo24Hour(timeStr);
    const parts = time24.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0])) return 0;
    return (parts[0] * 60) + (parts[1] || 0);
}

// Shortcut keys
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        loadAttendanceList();
    }
});

function getDutyHoursDisplay(emp) {
    if (!emp) return '0h';
    if (emp.totalHrs && emp.totalHrs !== '0h') return emp.totalHrs;

    // Fallback: calculate from duty times
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
            return '0h';
        }
    }
    return emp.totalHrs || '0h';
}


async function bulkSaveAll() {
    if (!confirm('Are you sure you want to Bulk Save/Fix ALL records for ALL employees for current and previous month? This will recalculate all worked hours based on check-in/out and update the Payroll.')) {
        return;
    }

    const btn = document.getElementById('btnBulkSave');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/attendance/bulk-fix', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();

        if (data.success) {
            alert(`Success! Updated ${data.fixedCount} records. You can now check the Payroll.`);
            if (typeof loadAttendanceList === 'function') {
                loadAttendanceList();
            } else {
                location.reload();
            }
        } else {
            alert('Error: ' + data.message);
        }
    } catch (err) {
        console.error(err);
        alert('An error occurred during bulk save.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}
