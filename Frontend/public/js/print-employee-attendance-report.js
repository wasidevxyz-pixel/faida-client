document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const fromDate = params.get('from');
    const toDate = params.get('to');

    if (!fromDate || !toDate) {
        alert("Invalid Date Range");
        window.close();
        return;
    }

    const container = document.getElementById('reportContainer');
    container.innerHTML = '<div class="text-center p-5"><h3>Loading Report...</h3><div class="spinner-border"></div></div>';

    try {
        const token = localStorage.getItem('token');

        // 1. Fetch Employees — use direct ID endpoint when a single employee is selected
        let employees = [];

        if (params.get('employee')) {
            // Single employee mode: use GET /api/v1/employees/:id (always returns exactly 1)
            const singleRes = await fetch(`/api/v1/employees/${params.get('employee')}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const singleData = await singleRes.json();
            if (!singleData.success || !singleData.data) {
                container.innerHTML = '<div class="alert alert-warning text-center">No Employee Found. The selected employee may not exist or you may not have access.</div>';
                return;
            }
            employees = [singleData.data];

        } else {
            // Multi-employee mode: filter by branch / department / code
            const empParams = new URLSearchParams();
            empParams.append('isActive', 'true');
            empParams.append('limit', '1000');
            if (params.get('branch')) empParams.append('branch', params.get('branch'));
            if (params.get('department')) empParams.append('department', params.get('department'));
            if (params.get('code')) empParams.append('code', params.get('code'));

            const empRes = await fetch(`/api/v1/employees?${empParams.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const empData = await empRes.json();

            if (!empData.success || empData.data.length === 0) {
                container.innerHTML = '<div class="alert alert-warning text-center">No Employees Found matching criteria.</div>';
                return;
            }

            // Deduplicate
            const seenIds = new Set();
            empData.data.forEach(emp => {
                if (!seenIds.has(emp._id)) {
                    seenIds.add(emp._id);
                    employees.push(emp);
                }
            });
        }



        // 2. Fetch Attendance (Bulk for efficiency)
        const attParams = new URLSearchParams();
        attParams.append('from', fromDate);
        attParams.append('to', toDate);
        attParams.append('limit', '5000'); // Higher limit for attendance

        if (params.get('branch')) attParams.append('branch', params.get('branch'));
        if (params.get('employee')) attParams.append('employee', params.get('employee'));

        let attUrl = `/api/v1/attendance?${attParams.toString()}`;

        const attRes = await fetch(attUrl, { headers: { 'Authorization': `Bearer ${token}` } });
        const attData = await attRes.json();
        const allAttendance = attData.success ? attData.data : [];

        // 3. Process Each Employee
        container.innerHTML = '';

        // Sort employees by code or name? Default code.
        employees.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

        for (const emp of employees) {
            const empAtt = allAttendance.filter(a =>
                (a.employee?._id === emp._id) || (a.employee === emp._id) || (a.employee?.code === emp.code)
            );

            // Group dates by month to show 1 month per page
            const monthsInRange = getMonthsInRange(fromDate, toDate);
            for (const monthObj of monthsInRange) {
                const sheetHtml = generateEmployeeSheet(emp, empAtt, monthObj.start, monthObj.end);
                container.appendChild(sheetHtml);
            }
        }

        if (employees.length === 0) {
            container.innerHTML = '<div class="alert alert-info text-center">No data found to display.</div>';
        }

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="alert alert-danger text-center">Error generating report: ${e.message}</div>`;
    }
});

function getMonthsInRange(fromStr, toStr) {
    const start = new Date(fromStr);
    const end = new Date(toStr);
    const months = [];

    let current = new Date(start);
    while (current <= end) {
        const y = current.getFullYear();
        const m = current.getMonth();

        // Month Start (First day or the provided start date)
        let mStart = new Date(y, m, 1);
        if (mStart < start) mStart = new Date(start);

        // Month End (Last day or the provided end date)
        let mEnd = new Date(y, m + 1, 0); // last day
        if (mEnd > end) mEnd = new Date(end);

        // Standard YYYY-MM-DD for consistency
        const format = (d) => {
            const pad = num => String(num).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        };

        months.push({ start: format(mStart), end: format(mEnd) });

        // Move to first day of next month
        current = new Date(y, m + 1, 1);
    }
    return months;
}

function generateEmployeeSheet(emp, attendance, fromStr, toStr) {
    const div = document.createElement('div');
    div.className = 'sheet-container';

    // Header Metadata
    const branch = emp.branch || '-';
    const dept = emp.department ? (emp.department.name || emp.department) : '-';
    const desig = emp.designation ? (emp.designation.name || emp.designation) : '-';
    const dateRange = `${formatDateDisplay(fromStr)} to ${formatDateDisplay(toStr)}`;
    // Support multiple possible Urdu name keys without breaking layout
    const urduName = emp.name_urdu || emp.nameUrdu || emp.urduName || emp.nameLocal || emp.localName || '';

    // Generate Rows for every day in range
    const start = new Date(fromStr);
    const end = new Date(toStr);
    let rowsHtml = '';

    let tWorked = 0, tBreak = 0, tDiff = 0, tFinal = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dLocal = new Date(d);
        const dateKey = `${dLocal.getFullYear()}-${(dLocal.getMonth() + 1).toString().padStart(2, '0')}-${dLocal.getDate().toString().padStart(2, '0')}`;
        // Find record for this day
        const att = attendance.find(a => {
            const aDate = new Date(a.date);
            const aDateStr = `${aDate.getFullYear()}-${(aDate.getMonth() + 1).toString().padStart(2, '0')}-${aDate.getDate().toString().padStart(2, '0')}`;
            return aDateStr === dateKey;
        });

        const dateDisplay = formatDateDisplay(dateKey); // e.g. 01-Feb-26
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });

        if (att) {
            // Parse values
            const worked = parseTime(att.workedHrs);
            const brk = parseTime(att.breakHrs);
            const totalDiff = parseTime(att.totalDiffHrs); // check sign?
            // Correction: totalDiffHrs might be negative string?
            // The API usually stores as regular string "HH:MM", we need logic.
            // For simplicity, let's assume standard format.

            const final = att.totalHrs ? (Number(att.totalHrs) * 60) : worked;
            // Wait, totalHrs in API is often Decimal Hours (float)? Or "HH:MM"?
            // Let's use helper convert if needed. `parseTime` handles "HH:MM".

            tWorked += worked;
            tBreak += brk;
            // Diff logic: check mode.
            if (att.diffMode === '-') tDiff -= totalDiff;
            else tDiff += totalDiff;

            tFinal += final; // Use stored total if available, else calc

            // Status Code (P, A, L)
            const status = att.displayStatus ? att.displayStatus.charAt(0) : '';

            rowsHtml += `
            <tr>
                <td style="font-weight:bold;">${dateDisplay}</td>
                <td>${dayName}</td>
                <td>${formatTimeVal(att.checkIn)}</td>
                <td>${formatTimeVal(att.checkOut)}</td>
                <td style="font-weight:bold; background:#eee;">${att.workedHrs || ''}</td>
                <td>${formatTimeVal(att.breakOut)}</td>
                <td>${formatTimeVal(att.breakIn)}</td>
                <td style="font-weight:bold; background:#eee;">${att.breakHrs || ''}</td>
                <td>${formatTimeVal(att.timeDiffIn)}</td>
                <td>${formatTimeVal(att.timeDiffOut)}</td>
                <td style="font-weight:bold;">${att.totalDiffHrs || ''}</td>
                <td style="font-weight:bold;">${formatTotalHrs(att.totalHrs || att.workedHrs)}</td>
                <td style="font-weight:bold;">${status}</td>
            </tr>
           `;
        } else {
            rowsHtml += `
            <tr>
                <td style="font-weight:bold;">${dateDisplay}</td>
                <td>${dayName}</td>
                <td></td><td></td>
                <td style="background:#eee;"></td>
                <td></td><td></td>
                <td style="background:#eee;"></td>
                <td></td><td></td>
                <td></td><td></td>
                <td></td>
            </tr>
           `;
        }
    }

    div.innerHTML = `
        <div class="meta-grid">
            <div class="meta-box">
                <span class="meta-label">Code</span>
                <span style="font-weight:bold;">${emp.code || '-'}</span>
            </div>
            <div class="meta-box" style="flex:2;">
                <span class="meta-label">Employee</span>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <span style="font-weight:bold;">${emp.name}</span>
                    ${urduName ? `<span style="font-weight:bold; font-family: 'Noto Nastaliq Urdu', 'Times New Roman', serif; direction: rtl; text-align: right;">${urduName}</span>` : ''}
                </div>
            </div>
            <div class="meta-box" style="flex:2;">
                 <span class="meta-label">Branch</span>
                 <span style="font-weight:bold;">(${branch})</span>
            </div>
             <div class="meta-box" style="flex:3; border-right:1px solid black; display:flex; flex-direction:column; justify-content:center;">
                 <h1 style="margin:0; font-family:'Times New Roman'; font-size:1.5rem; font-weight:bold;">Dwatson</h1>
                 <div style="font-size:0.9rem; font-weight:bold; text-decoration:underline;">Employee Attendance Sheet</div>
            </div>
            <div class="meta-box" style="flex:2;">
                 <span class="meta-label">Department</span>
                 <span style="font-weight:bold;">${dept}</span>
            </div>
            <div class="meta-box" style="flex:2;">
                 <span class="meta-label">Designation</span>
                 <span style="font-weight:bold;">${desig}</span>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th class="col-date">Dated</th>
                    <th class="col-day">Day</th>
                    <th class="col-time">Check In</th>
                    <th class="col-time">Check Out</th>
                    <th class="col-hrs">Worked Hrs</th>
                    <th class="col-time">Break Out</th>
                    <th class="col-time">Break In</th>
                    <th class="col-hrs">Total Brk Hrs</th>
                    <th class="col-time">Time Diff In</th>
                    <th class="col-time">Time Diff Out</th>
                    <th class="col-hrs">Total Diff</th>
                    <th class="col-hrs">Total Hours</th>
                    <th class="col-status">Status</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="4" class="text-end">Total</td>
                    <td>${formatMinsToTime(tWorked)}</td>
                    <td colspan="2"></td>
                    <td>${formatMinsToTime(tBreak)}</td>
                    <td colspan="2"></td>
                    <td>${formatMinsToTime(tDiff)}</td>
                    <td>${formatMinsToTime(tFinal)}</td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    `;

    return div;
}

// Helpers
function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
}

function formatTimeVal(val) {
    if (!val) return '';
    // If it already has am/pm, just return it
    if (val.toLowerCase().includes('am') || val.toLowerCase().includes('pm')) return val;

    // Split hours and minutes
    const parts = val.split(':');
    if (parts.length < 2) return val;

    let h = parseInt(parts[0]);
    let m = parts[1].substring(0, 2);
    const ampm = h >= 12 ? 'pm' : 'am';

    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'

    return `${h}:${m} ${ampm}`;
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    // Simple 24h parse
    if (timeStr.includes('am') || timeStr.includes('pm')) {
        // Assuming standard parse if needed, but for addition we need mins
        // Simplified for speed: assume backend stores valid times
    }
    const parts = timeStr.split(':').map(Number);
    if (parts.length < 2) return 0;
    return (parts[0] * 60) + parts[1];
}

function formatMinsToTime(mins) {
    if (!mins && mins !== 0) return '0:00';
    let m = Math.round(mins);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${mm.toString().padStart(2, '0')}`;
}

function formatTotalHrs(val) {
    // If val is decimal from API (e.g. 8.5), convert. If string "8:30", keep.
    if (!val) return '';
    if (typeof val === 'number') {
        const h = Math.floor(val);
        const m = Math.round((val - h) * 60);
        return `${h}:${m.toString().padStart(2, '0')}`;
    }
    return val;
}

