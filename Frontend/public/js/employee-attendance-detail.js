let currentEmployeeId = null;
let currentEmployeeData = null;
let attendanceRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentEmployeeId = urlParams.get('id');
    const paramDate = urlParams.get('date');

    if (!currentEmployeeId) {
        alert('Employee ID is missing');
        window.history.back();
        return;
    }

    setDefaultDates(paramDate);
    await loadEmployeeInfo();
    await loadEmployeeMonthData();
});

function setDefaultDates(paramDate) {
    let baseDate = paramDate ? new Date(paramDate) : new Date();

    // Set to start and end of month
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const formatDate = (date) => `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;

    document.getElementById('fromDate').value = formatDate(firstDay);
    document.getElementById('toDate').value = formatDate(lastDay);
}

async function loadEmployeeInfo() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employees/${currentEmployeeId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            currentEmployeeData = data.data;

            // Load Branch Employees Dropdown
            loadBranchEmployees();

            // Populate Screen Header
            if (document.getElementById('dispEmpName')) document.getElementById('dispEmpName').textContent = currentEmployeeData.name;
            if (document.getElementById('dispEmpCode')) document.getElementById('dispEmpCode').textContent = currentEmployeeData.code;
            if (document.getElementById('dispDutyHrs')) document.getElementById('dispDutyHrs').textContent = getDutyHoursDisplay(currentEmployeeData);
            if (document.getElementById('filterBranchOption')) document.getElementById('filterBranchOption').textContent = currentEmployeeData.branch || '-';

            // Populate Print Grid directly (since screen grid is removed)
            if (document.getElementById('pNameGrid')) document.getElementById('pNameGrid').textContent = currentEmployeeData.name;
            if (document.getElementById('pCodeGrid')) document.getElementById('pCodeGrid').textContent = currentEmployeeData.code;
            if (document.getElementById('pBranchGrid')) document.getElementById('pBranchGrid').textContent = currentEmployeeData.branch;
            if (document.getElementById('pBranchHeader')) document.getElementById('pBranchHeader').textContent = `Branch: ${currentEmployeeData.branch || '-'}`;
            if (document.getElementById('pDeptGrid')) document.getElementById('pDeptGrid').textContent = currentEmployeeData.department?.name || '-';
            if (document.getElementById('pDesigGrid')) document.getElementById('pDesigGrid').textContent = currentEmployeeData.designation?.name || '-';
        }
    } catch (err) { console.error(err); }
}

async function loadEmployeeMonthData() {
    const tbody = document.getElementById('detailRecordsBody');
    tbody.innerHTML = '<tr><td colspan="17" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const token = localStorage.getItem('token');
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;

        // Update Screen Header Date Range
        if (document.getElementById('dispDateRange')) {
            document.getElementById('dispDateRange').textContent = `${fromDate} to ${toDate}`;
        }

        const res = await fetch(`/api/v1/attendance?employee=${currentEmployeeId}&from=${fromDate}&to=${toDate}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            const recorded = data.data;

            // Generate full range of dates
            const start = new Date(fromDate);
            const end = new Date(toDate);
            const fullRange = [];
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

                // For comparison, handle cases where DB date is string or date object
                const record = recorded.find(r => {
                    const rDate = new Date(r.date);
                    const rDateStr = `${rDate.getFullYear()}-${(rDate.getMonth() + 1).toString().padStart(2, '0')}-${rDate.getDate().toString().padStart(2, '0')}`;
                    return rDateStr === dateStr;
                });

                if (record) {
                    fullRange.push(record);
                } else {
                    fullRange.push({
                        _id: `new_${currentEmployeeId}_${dateStr}`,
                        employee: currentEmployeeData,
                        date: dateStr,
                        branch: currentEmployeeData.branch,
                        displayStatus: 'Present',
                        checkIn: '',
                        checkOut: '',
                        workedHrs: '',
                        isNew: true
                    });
                }
            }

            attendanceRecords = fullRange;
            renderDetailTable();
        }
    } catch (err) { console.error(err); }
}

function renderDetailTable() {
    const tbody = document.getElementById('detailRecordsBody');
    tbody.innerHTML = '';

    attendanceRecords.forEach((att, index) => {
        const tr = document.createElement('tr');
        // Initial color based on strict rules
        tr.className = '';
        const workedMins = parseTime(att.workedHrs);
        if (workedMins >= 1020) {
            tr.className = 'row-overtime';
        } else if (workedMins > 0 && workedMins <= 60) {
            tr.className = 'row-warning';
        } else if (att.checkIn && att.checkOut) {
            tr.className = 'row-completed';
        } else if (att.checkIn) {
            tr.className = 'row-partial';
        } else if (att.displayStatus === 'Absent') {
            tr.className = 'row-absent';
        } else if (att.displayStatus === 'Leave') {
            tr.className = 'row-leave';
        }

        const date = new Date(att.date);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[date.getDay()];
        const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        tr.innerHTML = `
            <td class="text-center col-del"><button class="btn btn-danger btn-delete" onclick="deleteRecord('${att._id}')"><i class="fas fa-times"></i></button></td>
            <td class="text-center">${index + 1}</td>
            <td class="text-center col-date fw-bold">${dateStr}</td>
            <td class="text-center fw-bold">${dayName}</td>
            <td class="px-1 col-checkin">
                <input type="time" class="form-control form-control-xs text-center fw-bold" value="${convertTo24Hour(att.checkIn)}" oninput="updateRowCalc(this)">
                <span class="print-value">${convertTo12Hour(att.checkIn) || ''}</span>
            </td>
            <td class="px-1 col-checkout">
                <input type="time" class="form-control form-control-xs text-center fw-bold" value="${convertTo24Hour(att.checkOut)}" oninput="updateRowCalc(this)">
                <span class="print-value">${convertTo12Hour(att.checkOut) || ''}</span>
            </td>
            <td class="text-center fw-bold col-worked">${att.workedHrs || ''}</td>
            <td class="px-1 col-breakout">
                <input type="time" class="form-control form-control-xs text-center" value="${convertTo24Hour(att.breakOut)}" oninput="updateRowCalc(this)">
                <span class="print-value">${convertTo12Hour(att.breakOut) || ''}</span>
            </td>
            <td class="px-1 col-breakin">
                <input type="time" class="form-control form-control-xs text-center" value="${convertTo24Hour(att.breakIn)}" oninput="updateRowCalc(this)">
                <span class="print-value">${convertTo12Hour(att.breakIn) || ''}</span>
            </td>
            <td class="text-center col-breakhrs">${att.breakHrs || ''}</td>
            <td class="px-0 col-diff-btns">
                <div class="diff-btns" data-mode="${att.diffMode || '+'}">
                    <button class="btn btn-diff btn-success ${(!att.diffMode || att.diffMode === '+') ? '' : 'opacity-50'}" onclick="setDiffMode(this, '+')">+</button>
                    <button class="btn btn-diff btn-danger ${att.diffMode === '-' ? '' : 'opacity-50'}" onclick="setDiffMode(this, '-')">-</button>
                </div>
            </td>
            <td class="px-1 col-diffin"><input type="time" class="input-diff-box" value="${convertTo24Hour(att.timeDiffIn)}" oninput="updateRowCalc(this)"></td>
            <td class="px-1 col-diffout"><input type="time" class="input-diff-box" value="${convertTo24Hour(att.timeDiffOut)}" oninput="updateRowCalc(this)"></td>
            <td class="text-center fw-bold col-totaldiff ${att.diffMode === '-' ? 'bg-minus' : ''}">${att.totalDiffHrs || ''}</td>
            <td class="text-center fw-bold col-totalhrs">${att.workedHrs || ''}</td>
            <td class="px-1 text-center col-status">
                <select class="form-select form-select-xs" onchange="updateRowCalc(this)">
                    <option value="Present" ${att.displayStatus === 'Present' ? 'selected' : ''}>Present</option>
                    <option value="Absent" ${att.displayStatus === 'Absent' ? 'selected' : ''}>Absent</option>
                </select>
                <span class="print-value">${att.displayStatus ? att.displayStatus.charAt(0) : ''}</span>
            </td>
            <td class="px-1 col-remarks"><input type="text" class="form-control form-control-xs" value="${att.remarks || ''}"></td>
        `;
        tbody.appendChild(tr);
        updateRowCalc(tr.querySelector('input[type="time"]'), true); // Initial calc for each row
    });
    calculateTotals();
}

function updateRowColor(element) {
    const tr = element.closest('tr');
    // Use named selectors instead of raw indices for safety
    const statusSelect = tr.querySelector('.col-status select');
    const status = statusSelect ? statusSelect.value : 'Present';

    // Check if check-in/out are filled
    const checkInInput = tr.querySelector('.col-checkin input');
    const checkOutInput = tr.querySelector('.col-checkout input');
    const checkIn = checkInInput ? checkInInput.value : '';
    const checkOut = checkOutInput ? checkOutInput.value : '';

    const totalHrsText = tr.querySelector('.col-totalhrs').textContent;
    const mins = parseTime(totalHrsText);

    tr.className = '';

    // If user is currently editing this row, keep it white until save
    if (tr.dataset.isDirty === 'true') {
        tr.className = 'row-editing';
        return;
    }

    // Priority 1: Absent/Leave strictly color by status
    if (status === 'Absent') {
        tr.className = 'row-absent';
    } else if (status === 'Leave') {
        tr.className = 'row-leave';
    }
    // Priority 2: If Present, color by hours/completion
    else if (mins >= 1020) {
        tr.className = 'row-overtime';
    } else if (mins > 0 && mins <= 60) {
        tr.className = 'row-warning';
    } else if (checkIn && checkOut) {
        tr.className = 'row-completed';
    } else if (checkIn) {
        tr.className = 'row-partial';
    }
}

function setDiffMode(btn, mode) {
    const parent = btn.closest('.diff-btns');
    parent.dataset.mode = mode;
    parent.querySelectorAll('.btn-diff').forEach(b => b.classList.add('opacity-50'));
    btn.classList.remove('opacity-50');
    updateRowCalc(btn);
}

function updateRowCalc(element, isInitial = false) {
    if (!element) return;
    const tr = element.closest('tr');

    // Mark as dirty if this is a user-triggered calculation
    if (!isInitial) {
        tr.dataset.isDirty = 'true';
    }

    const checkIn = tr.querySelector('.col-checkin input').value;
    const checkOut = tr.querySelector('.col-checkout input').value;
    const breakOut = tr.querySelector('.col-breakout input').value;
    const breakIn = tr.querySelector('.col-breakin input').value;
    const diffIn = tr.querySelector('.col-diffin input').value;
    const diffOut = tr.querySelector('.col-diffout input').value;
    const mode = tr.querySelector('.diff-btns').dataset.mode || '+';
    const status = tr.querySelector('.col-status select').value;

    // IF ABSENT OR LEAVE -> FORCE 0 HOURS AND CLEAR INPUTS
    if (status === 'Absent' || status === 'Leave') {
        tr.querySelector('.col-checkin input').value = '';
        tr.querySelector('.col-checkout input').value = '';
        tr.querySelector('.col-breakout input').value = '';
        tr.querySelector('.col-breakin input').value = '';
        tr.querySelector('.col-diffin input').value = '';
        tr.querySelector('.col-diffout input').value = '';

        tr.querySelector('.col-breakhrs').textContent = '';
        tr.querySelector('.col-totaldiff').textContent = '';
        tr.querySelector('.col-worked').textContent = '0:00';
        tr.querySelector('.col-totalhrs').textContent = '0:00';
        updateRowColor(tr);
        calculateTotals();
        return;
    }

    let bMin = 0;
    if (breakOut && breakIn) {
        const inParts = breakIn.split(':').map(Number);
        const outParts = breakOut.split(':').map(Number);
        bMin = (inParts[0] * 60 + inParts[1]) - (outParts[0] * 60 + outParts[1]);
        if (bMin < 0) bMin += 1440;
        tr.querySelector('.col-breakhrs').textContent = `${Math.floor(bMin / 60)}:${(bMin % 60).toString().padStart(2, '0')}`;
    } else {
        tr.querySelector('.col-breakhrs').textContent = '';
    }

    const totalDiffCell = tr.querySelector('.col-totaldiff');
    let totalDiffMin = 0;
    if (diffIn && diffOut) {
        const inParts = diffIn.split(':').map(Number);
        const outParts = diffOut.split(':').map(Number);
        totalDiffMin = (outParts[0] * 60 + outParts[1]) - (inParts[0] * 60 + inParts[1]);
        if (totalDiffMin < 0) totalDiffMin += 1440;
        totalDiffCell.textContent = `${Math.floor(totalDiffMin / 60)}:${(totalDiffMin % 60).toString().padStart(2, '0')}`;
        
        // Apply background colors based on mode (+/-)
        if (mode === '-') {
            totalDiffCell.classList.add('bg-minus');
        } else {
            totalDiffCell.classList.remove('bg-minus');
        }
    } else {
        totalDiffCell.textContent = '';
        totalDiffCell.classList.remove('bg-minus', 'bg-plus');
    }

    if (checkIn && checkOut) {
        const cin = checkIn.split(':').map(Number);
        const cout = checkOut.split(':').map(Number);
        let wMin = (cout[0] * 60 + cout[1]) - (cin[0] * 60 + cin[1]);
        if (wMin < 0) wMin += 1440;

        // Display Gross Worked in Column 6
        tr.querySelector('.col-worked').textContent = formatTime(wMin);

        let netMin = wMin - bMin;
        if (netMin < 0) netMin = 0;

        let finalMin = netMin;
        if (mode === '+') finalMin += totalDiffMin;
        else finalMin -= totalDiffMin;
        if (finalMin < 0) finalMin = 0;

        // Display Final Net (after breaks and diffs) in Column 14
        tr.querySelector('.col-totalhrs').textContent = formatTime(finalMin);
    } else {
        tr.querySelector('.col-worked').textContent = '';
        tr.querySelector('.col-totalhrs').textContent = '';
    }
    updateRowColor(tr);
    calculateTotals();
}

function convertTo24Hour(timeStr) {
    if (!timeStr) return '';
    if (timeStr.includes(':') && (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm'))) {
        let [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':');
        if (hours === '12') hours = '00';
        if (modifier.toLowerCase() === 'pm') hours = parseInt(hours, 10) + 12;
        return `${hours.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    }
    return timeStr;
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
        timeStr = convertTo24Hour(timeStr);
    }
    const parts = timeStr.split(':').map(Number);
    if (parts.length < 2) return 0;
    return parts[0] * 60 + parts[1];
}

function formatTime(totalMinutes) {
    if (!totalMinutes || totalMinutes === 0) return '';
    if (totalMinutes < 0) totalMinutes = 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

function convertTo12Hour(timeStr) {
    if (!timeStr) return '';
    
    // Handle time in format HH:MM or HH
    let hours, minutes = '00';
    
    if (timeStr.includes(':')) {
        const parts = timeStr.split(':');
        hours = parseInt(parts[0], 10);
        minutes = parts[1] || '00';
    } else {
        hours = parseInt(timeStr, 10);
    }
    
    if (isNaN(hours)) return timeStr;
    
    const suffix = hours >= 12 ? 'PM' : 'AM';
    let displayHours = hours > 12 ? hours - 12 : hours;
    if (displayHours === 0) displayHours = 12;
    
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${suffix}`;
}

function calculateTotals() {
    let tWorked = 0, tBreak = 0, tDiff = 0, tFinal = 0;
    const rows = document.querySelectorAll('#detailRecordsBody tr');

    rows.forEach(row => {
        const workedStr = row.querySelector('.col-worked').textContent; // Use selector
        const breakStr = row.querySelector('.col-breakhrs').textContent;
        const diffStr = row.querySelector('.col-totaldiff').textContent;
        const finalStr = row.querySelector('.col-totalhrs').textContent;

        if (workedStr && workedStr !== '0:00') tWorked += parseTime(workedStr);
        if (breakStr) tBreak += parseTime(breakStr);
        if (diffStr) tDiff += parseTime(diffStr);
        if (finalStr && finalStr !== '0:00') tFinal += parseTime(finalStr);
    });

    if (document.getElementById('tWorkedHrs')) document.getElementById('tWorkedHrs').textContent = formatTime(tWorked);
    if (document.getElementById('tBreakHrs')) document.getElementById('tBreakHrs').textContent = formatTime(tBreak);
    if (document.getElementById('tDiffHrs')) document.getElementById('tDiffHrs').textContent = formatTime(tDiff);
    if (document.getElementById('tFinalHrs')) document.getElementById('tFinalHrs').textContent = formatTime(tFinal);
}

async function saveAllVisible() {
    const rows = document.querySelectorAll('#detailRecordsBody tr');
    const token = localStorage.getItem('token');
    const bulkPayloads = [];

    for (let i = 0; i < rows.length; i++) {
        const tr = rows[i];
        const dateStr = attendanceRecords[i].date;
        const isNew = String(attendanceRecords[i]._id).startsWith('new_');

        const payload = {
            employee: currentEmployeeId,
            date: dateStr,
            branch: currentEmployeeData.branch,
            checkIn: tr.cells[4].querySelector('input').value,
            checkOut: tr.cells[5].querySelector('input').value,
            workedHrs: tr.cells[6].textContent,
            breakOut: tr.cells[7].querySelector('input').value,
            breakIn: tr.cells[8].querySelector('input').value,
            breakHrs: tr.cells[9].textContent,
            diffMode: tr.cells[10].querySelector('.diff-btns').dataset.mode,
            timeDiffIn: tr.cells[11].querySelector('input').value,
            timeDiffOut: tr.cells[12].querySelector('input').value,
            totalDiffHrs: tr.cells[13].textContent,
            totalHrs: (() => {
                const str = tr.cells[14].textContent;
                if (!str || !str.includes(':')) return 0;
                const [h, m] = str.split(':').map(Number);
                return (h || 0) + ((m || 0) / 60);
            })(),
            displayStatus: tr.cells[15].querySelector('select').value,
            remarks: tr.cells[16].querySelector('input').value,
            isPresent: tr.cells[15].querySelector('select').value === 'Present'
        };

        // Skip empty new present rows (nothing to save)
        if (isNew && !payload.checkIn && !payload.checkOut && payload.displayStatus === 'Present') continue;

        // Validate — no negative hours
        if (payload.workedHrs && payload.workedHrs.startsWith('-')) {
            alert(`Negative Worked Hours at row ${i + 1} (${dateStr}). Please correct.`);
            return;
        }
        if (payload.breakHrs && payload.breakHrs.startsWith('-')) {
            alert(`Negative Break Hours at row ${i + 1} (${dateStr}). Please correct.`);
            return;
        }
        if (payload.totalDiffHrs && payload.totalDiffHrs.startsWith('-')) {
            alert(`Negative Total Difference at row ${i + 1} (${dateStr}). Please correct.`);
            return;
        }

        bulkPayloads.push(payload);
    }

    if (bulkPayloads.length === 0) {
        alert('No records to save.');
        return;
    }

    try {
        // ONE bulk request instead of 30 sequential ones — ~10x faster on slow networks
        const res = await fetch(`${window.location.origin}/api/v1/attendance/bulk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ attendanceRecords: bulkPayloads })
        });

        if (res.ok) {
            const data = await res.json();
            alert(`Saved ${data.data ? data.data.length : bulkPayloads.length} records successfully`);
            loadEmployeeMonthData();
        } else {
            const err = await res.json();
            alert('Save failed: ' + (err.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Bulk save error:', err);
        alert('Network error while saving. Please check connection and try again.');
    }
}

async function deleteRecord(id) {
    if (id.startsWith('new_')) return;
    if (!confirm('Delete this record?')) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/attendance/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            loadEmployeeMonthData();
        }
    } catch (err) { console.error(err); }
}
function handlePrint() {
    // Data is already populated in loadEmployeeInfo directly into key print fields
    // Just need to update the date range
    document.getElementById('pDateRangeGrid').textContent = `${document.getElementById('fromDate').value} to ${document.getElementById('toDate').value}`;
    window.print();
}

// Shortcut keys
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAllVisible();
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
    if (!confirm('Are you sure you want to Bulk Save/Fix ALL records for ALL employees for current and previous month? This will recalculate all worked hours based on check-in/out.')) {
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
            location.reload();
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

async function loadBranchEmployees() {
    if (!currentEmployeeData || !currentEmployeeData.branch) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/employees?branch=${encodeURIComponent(currentEmployeeData.branch)}&light=true&isActive=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('branchEmpDropdown');
            if (!select) return;
            select.innerHTML = '<option value="">Select Employee...</option>';
            data.data.forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp._id;
                opt.textContent = `${emp.code} - ${emp.name}`;
                if (emp._id === currentEmployeeId) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });

            // Initialize Select2 if available
            if (window.jQuery && $.fn.select2) {
                $('#branchEmpDropdown').select2({
                    placeholder: "Select Employee...",
                    width: '100%',
                    theme: 'default'
                }).on('select2:select', function(e) {
                    // Trigger our custom handler when an option is selected via Select2
                    changeBranchEmployee(e.params.data.id);
                });
            }
        }
    } catch (err) {
        console.error('Error loading branch employees:', err);
    }
}

function changeBranchEmployee(empId) {
    if (!empId || empId === currentEmployeeId) return;
    
    // Check if there are unsaved changes
    const unsaved = document.querySelector('#detailRecordsBody tr[data-is-dirty="true"]');
    if (unsaved && !confirm('You have unsaved changes. Are you sure you want to switch employees without saving?')) {
        // Revert dropdown to current employee
        document.getElementById('branchEmpDropdown').value = currentEmployeeId;
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('id', empId);
    window.location.search = urlParams.toString();
}
