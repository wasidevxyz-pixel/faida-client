// Actions Tracker Logic
let allLogs = []; // Store logs for local filtering
let currentSusFilter = 'critical';

function checkSuspicious(log) {
    let susTypes = [];
    if (log.entity === 'employee' && log.action === 'update' && log.changes?.basicSalary) {
        susTypes.push('salary');
    }
    if (log.entity === 'attendance' && log.action === 'update') {
        const timeFields = ['checkIn', 'checkOut', 'fDutyTime', 'tDutyTime'];
        const hasTimeChange = Object.keys(log.changes || {}).some(k => timeFields.includes(k));
        if (hasTimeChange) susTypes.push('attendance');
    }
    if (log.entity === 'advance' && (log.action === 'update' || log.action === 'delete')) {
        susTypes.push('advance');
    }
    return susTypes;
}

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    document.getElementById('fromDate').value = todayStr;
    document.getElementById('toDate').value = todayStr;

    loadBranches();
    loadUsers();
    setTimeout(loadLogs, 500);
});

async function loadBranches() {
    try {
        const token = localStorage.getItem('token');
        let response = await fetch('/api/v1/stores?&t=' + Date.now(), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            response = await fetch('/api/v1/sub-branches', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        const data = await response.json();
        if (data.success && data.data) {
            const rawNames = data.data.map(item => (item.name || item.branchName || '').trim());
            const uniqueBranches = [...new Set(rawNames)].filter(n => n !== '' && n !== 'Select Branch').sort();

            const select = document.getElementById('branchSelect');
            uniqueBranches.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });

            // Add listener to auto-filter when branch changes
            select.addEventListener('change', () => applyFilters());
        }
    } catch (err) {
        console.error('Error loading branches:', err);
    }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/v1/users', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            const select = document.getElementById('userSelect');
            data.data.forEach(user => {
                const opt = document.createElement('option');
                opt.value = user._id;
                opt.textContent = `${user.name} (${user.role})`;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Error loading users', err);
    }
}

async function loadLogs() {
    const container = document.getElementById('logsContainer');
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted fw-bold">Analyzing audit data...</p></div>';

    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;
    const user = document.getElementById('userSelect').value;
    const entity = document.getElementById('entitySelect').value;

    let url = `/api/v1/audit-logs?startDate=${from}&endDate=${to}`;
    if (user) url += `&performedBy=${user}`;
    if (entity) url += `&entity=${entity}`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await res.json();

        if (result.success) {
            allLogs = result.data;
            calculateStats(allLogs);
            applyFilters();
        } else {
            container.innerHTML = `<div class="alert alert-danger">Error: ${result.message}</div>`;
        }
    } catch (err) {
        console.error('Error loading logs', err);
        container.innerHTML = `<div class="alert alert-danger">Failed to connect to server</div>`;
    }
}

function calculateStats(logs) {
    const targetEntities = ['employee', 'advance', 'attendance'];
    const filteredLogs = logs.filter(log => targetEntities.includes(log.entity));

    const total = filteredLogs.length;
    let criticalCount = 0;
    const userCounts = {};
    const entityCounts = {};

    filteredLogs.forEach(log => {
        // Top User
        const userName = log.performedBy?.name || 'Unknown';
        userCounts[userName] = (userCounts[userName] || 0) + 1;

        // Top Entity
        const entity = log.entity || 'Other';
        entityCounts[entity] = (entityCounts[entity] || 0) + 1;

        // Critical Check based on suspicious changes
        const sus = checkSuspicious(log);
        if (sus.length > 0) criticalCount++;
    });

    const topUser = Object.keys(userCounts).length ? Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0][0] : '-';
    const topEntity = Object.keys(entityCounts).length ? Object.entries(entityCounts).sort((a, b) => b[1] - a[1])[0][0] : '-';

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statTopUser').textContent = topUser;
    document.getElementById('statCritical').textContent = criticalCount;
    document.getElementById('statTopEntity').textContent = topEntity.replace('_', ' ').toUpperCase();
}

function filterSuspicious(type) {
    currentSusFilter = type;
    applyFilters();
}

function filterRenderedLogs(term) {
    applyFilters();
}

function applyFilters() {
    const term = document.getElementById('localSearch').value.toLowerCase().trim();
    const branchFilter = document.getElementById('branchSelect').value;
    let filtered = allLogs;

    // Apply branch filter
    if (branchFilter) {
        filtered = filtered.filter(log => {
            const branch = log.details?.branch || '';
            return branch === branchFilter;
        });
    }

    // Apply suspicious filter
    if (currentSusFilter !== 'all') {
        filtered = filtered.filter(log => {
            const sus = checkSuspicious(log);
            if (currentSusFilter === 'critical') return sus.length > 0;
            return sus.includes(currentSusFilter);
        });
    }

    // Apply text filter
    if (term) {
        filtered = filtered.filter(log => {
            const user = (log.performedBy?.name || '').toLowerCase();
            const ip = (log.ipAddress || '').toLowerCase();
            const entity = (log.entity || '').toLowerCase();
            const details = JSON.stringify(log.details || '').toLowerCase();
            const changes = JSON.stringify(log.changes || '').toLowerCase();

            return user.includes(term) || ip.includes(term) || entity.includes(term) || details.includes(term) || changes.includes(term);
        });
    }

    renderLogs(filtered);

    // update button states
    document.querySelectorAll('.threat-filters .btn').forEach(btn => {
        btn.classList.remove('active', 'shadow');
    });
    if (document.getElementById(`btn-filter-${currentSusFilter}`)) {
        document.getElementById(`btn-filter-${currentSusFilter}`).classList.add('active', 'shadow');
    }
}

function renderLogs(logs) {
    const container = document.getElementById('logsContainer');
    if (logs.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-history fa-4x text-light-emphasis mb-4" style="opacity: 0.3"></i>
                <h5 class="text-muted fw-bold">No Activities Found</h5>
                <p class="text-secondary">Try adjusting your filters or search term.</p>
            </div>`;
        return;
    }

    let lastDate = '';
    let html = '';

    logs.forEach(log => {
        const logDate = new Date(log.createdAt);
        const dateStr = logDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = logDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        // Date Grouping
        if (dateStr !== lastDate) {
            html += `<div class="date-divider"><span class="date-label">${dateStr}</span></div>`;
            lastDate = dateStr;
        }

        const badgeClass = `badge-${log.action}`;

        // Critical Alert Logic
        let isCritical = false;
        let alertMsg = '';

        const sus = checkSuspicious(log);
        if (sus.includes('salary')) {
            isCritical = true;
            alertMsg += `<span class="alert-flag border-0" style="background:#ef4444;color:white;"><i class="fas fa-bullhorn"></i> Suspicious Salary Modification</span> `;
        }
        if (sus.includes('attendance')) {
            isCritical = true;
            alertMsg += `<span class="alert-flag border-0" style="background:#eab308;color:white;"><i class="fas fa-clock"></i> Suspicious Time Alteration</span> `;
        }
        if (sus.includes('advance')) {
            isCritical = true;
            alertMsg += `<span class="alert-flag border-0" style="background:#0ea5e9;color:white;"><i class="fas fa-exclamation-triangle"></i> Advance Tampering</span> `;
        }

        let jumpLink = '';
        if (log._id) {
            jumpLink = `<a href="javascript:void(0)" onclick="showRecordDetails('${log._id}')" class="jump-link ms-auto mt-2"><i class="fas fa-eye me-1"></i> View Record</a>`;
        }

        const dateOutput = new Date(log.createdAt).toLocaleDateString();
        const timeOutput = formatTime12Hour(new Date(log.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        const dateTimeStr = `<strong>Date:</strong> ${dateOutput} ${timeOutput}`;

        let entityDetails = '';
        if (log.details) {
            const branchText = log.details.branch ? ` | <strong>Branch:</strong> ${log.details.branch}` : '';
            if (log.entity === 'attendance') {
                const attDate = new Date(log.details.attendanceDate).toLocaleDateString();
                entityDetails = `<div class="entity-info mb-2 text-dark" style="font-size: 0.85rem;"><strong>Employee:</strong> ${log.details.employeeName} (${log.details.employeeCode})${branchText} | <strong>Target Date:</strong> ${attDate} | ${dateTimeStr}</div>`;
            } else if (log.entity === 'employee') {
                entityDetails = `<div class="entity-info mb-2 text-dark" style="font-size: 0.85rem;"><strong>Employee:</strong> ${log.details.employeeName} (${log.details.employeeCode})${branchText} | ${dateTimeStr}</div>`;
            } else if (log.entity === 'advance') {
                entityDetails = `<div class="entity-info mb-2 text-dark" style="font-size: 0.85rem;"><strong>Employee:</strong> ${log.details.employeeName} (${log.details.employeeCode})${branchText} | <strong>Amount:</strong> ${log.details.amount || 0} | ${dateTimeStr}</div>`;
            } else {
                entityDetails = `<div class="entity-info mb-2 text-dark" style="font-size: 0.85rem;">${dateTimeStr}</div>`;
            }
        }

        let changesHtml = '';
        if (log.action === 'update' && log.changes) {
            changesHtml = '<div class="mt-3"><div class="change-row mb-1 opacity-75"><span class="change-label">Field</span><span class="change-label">Previous</span><span class="change-label">New</span><span class="change-label text-center">Diff</span></div>';
            Object.keys(log.changes).forEach(key => {
                const c = log.changes[key];
                const diff = calculateModificationDiff(key, c.old, c.new);
                const displayLabels = { 'basicSalary': 'SALARY', 'mobileNo': 'MOBILE', 'fDutyTime': 'FROM DUTY', 'tDutyTime': 'TO DUTY', 'salaryType': 'SALARY TYPE', 'joiningDate': 'JOINING DATE', 'incrDate': 'INCREMENT DATE', 'isActive': 'STATUS' };

                const timeFields = ['checkIn', 'checkOut', 'breakIn', 'breakOut', 'fDutyTime', 'tDutyTime'];
                let oldDisplay = c.old || '-';
                let newDisplay = c.new || '-';

                if (timeFields.includes(key)) {
                    oldDisplay = formatTime12Hour(c.old);
                    newDisplay = formatTime12Hour(c.new);
                } else if (key.toLowerCase().includes('date')) {
                    const oD = new Date(c.old);
                    const nD = new Date(c.new);
                    if (!isNaN(oD)) oldDisplay = oD.toLocaleDateString('en-GB');
                    if (!isNaN(nD)) newDisplay = nD.toLocaleDateString('en-GB');
                }

                changesHtml += `<div class="change-row"><span class="change-label">${displayLabels[key] || key.toUpperCase()}</span><span class="old-val">${oldDisplay}</span><span class="new-val">${newDisplay}</span><span class="diff-val ${diff?.startsWith('+') ? 'diff-plus' : (diff === null || diff === '-' ? 'diff-none' : 'diff-minus')}">${diff || '-'}</span></div>`;
            });
            changesHtml += '</div>';
        } else if (log.action === 'create' && log.changes) {
            changesHtml = `<div class="mt-2 border-top pt-2"><span class="badge badge-action badge-create mb-2">System Entry</span><div class="small text-muted">Summary: ${JSON.stringify(log.changes).substring(0, 100)}...</div></div>`;
        }

        html += `
            <div class="log-card ${isCritical ? 'critical-alert' : ''}">
                <div class="log-header">
                    <div class="user-info">
                        <div class="user-avatar">${(log.performedBy?.name || 'U').charAt(0)}</div>
                        <div class="user-details"><h6 class="name">${log.performedBy?.name || 'Unknown'}</h6><p class="time">${timeStr} | IP: ${log.ipAddress || '127.0.0.1'}</p></div>
                    </div>
                    <span class="badge-action ${badgeClass}">${log.action}</span>
                </div>
                <div class="log-body">
                    ${alertMsg}
                    <div class="mb-2 fw-bold text-uppercase opacity-75" style="font-size: 0.65rem; color: #1e4c8c;">Module: ${log.entity.replace('_', ' ')}</div>
                    ${entityDetails}
                    ${changesHtml}
                    ${jumpLink}
                </div>
            </div>`;
    });

    container.innerHTML = html;
}

function calculateModificationDiff(field, oldVal, newVal) {
    if (!oldVal || !newVal) return null;

    // Only calculate for time fields
    const timeFields = ['checkIn', 'checkOut', 'breakIn', 'breakOut', 'timeDiffIn', 'timeDiffOut', 'fDutyTime', 'tDutyTime'];
    if (timeFields.includes(field)) {
        try {
            const oldMins = parseTimeToMinutes(oldVal);
            const newMins = parseTimeToMinutes(newVal);

            const diffMins = newMins - oldMins;
            if (diffMins === 0) return null;

            const absDiff = Math.abs(diffMins);
            const h = Math.floor(absDiff / 60);
            const m = absDiff % 60;

            const prefix = diffMins > 0 ? '+' : '-';
            let result = prefix;
            if (h > 0) result += `${h}h `;
            if (m > 0 || h === 0) result += `${m}m`;

            return result.trim();
        } catch (e) {
            return null;
        }
    }
    const numericFields = ['basicSalary', 'paid', 'amount', 'advanceAmount'];
    if (numericFields.includes(field)) {
        const numOld = parseFloat(oldVal) || 0;
        const numNew = parseFloat(newVal) || 0;
        const diff = numNew - numOld;
        return diff === 0 ? null : (diff > 0 ? '+' : '') + diff;
    }
    return null;
}

function formatTime12Hour(timeStr) {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return timeStr || '-';
    try {
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        let h = parseInt(parts[0], 10);
        const m = parts[1];
        if (isNaN(h)) return timeStr;
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; // the hour '0' should be '12'
        const hStr = h < 10 ? '0' + h : h;
        return `${hStr}:${m} ${ampm}`;
    } catch (e) {
        return timeStr;
    }
}

function parseTimeToMinutes(t) {
    if (!t) return 0;
    const parts = t.split(':').map(Number);
    return (parts[0] * 60) + (parts[1] || 0);
}

window.showRecordDetails = function (logId) {
    const log = allLogs.find(l => l._id === logId);
    if (!log) return;

    let bodyHtml = `
        <div class="row mb-4">
            <div class="col-md-6 mb-3">
                <h6 class="fw-bold text-muted text-uppercase" style="font-size: 0.75rem;">Action Performed By</h6>
                <div class="d-flex align-items-center gap-2 mt-2">
                    <div class="user-avatar" style="width: 30px; height: 30px; font-size: 0.8rem;">${(log.performedBy?.name || 'U').charAt(0)}</div>
                    <div>
                        <div class="fw-bold">${log.performedBy?.name || 'Unknown'}</div>
                        <div class="text-secondary" style="font-size: 0.75rem;">IP: ${log.ipAddress || 'Unknown'}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-6 mb-3">
                <h6 class="fw-bold text-muted text-uppercase" style="font-size: 0.75rem;">Timestamp</h6>
                <div class="fw-bold mt-2" style="font-size: 0.9rem;">${new Date(log.createdAt).toLocaleString('en-GB')}</div>
            </div>
            <div class="col-md-6 mb-3">
                <h6 class="fw-bold text-muted text-uppercase" style="font-size: 0.75rem;">Module / Entity</h6>
                <div class="fw-bold text-primary text-uppercase mt-2">${log.entity.replace('_', ' ')}</div>
            </div>
            <div class="col-md-6 mb-3">
                <h6 class="fw-bold text-muted text-uppercase" style="font-size: 0.75rem;">Action Type</h6>
                <div class="badge badge-action badge-${log.action} mt-2" style="font-size: 0.75rem;">${log.action}</div>
            </div>
        </div>
    `;

    const sus = checkSuspicious(log);
    if (sus.length > 0) {
        bodyHtml += `
        <div class="alert alert-danger border-start border-4 border-danger py-2 mb-4">
            <h6 class="fw-bold text-danger mb-2"><i class="fas fa-exclamation-triangle me-1"></i> Critical Activities Detected</h6>
            <ul class="mb-0 ps-3" style="font-size: 0.85rem;">`;
        if (sus.includes('salary')) bodyHtml += `<li><strong>Suspicious Salary Modification</strong> detected in Employee record.</li>`;
        if (sus.includes('attendance')) bodyHtml += `<li><strong>Suspicious Time Alteration</strong> detected in Attendance tracker.</li>`;
        if (sus.includes('advance')) bodyHtml += `<li><strong>Advance Tampering</strong> detected.</li>`;
        bodyHtml += `</ul></div>`;
    }

    if (log.action === 'update' && log.changes) {
        bodyHtml += `
        <div class="mb-1">
            <h6 class="fw-bold text-muted text-uppercase mb-3" style="font-size: 0.75rem;">Modification Details</h6>
            <div class="table-responsive">
                <table class="table table-bordered table-hover align-middle" style="font-size: 0.85rem;">
                    <thead class="table-light text-muted">
                        <tr>
                            <th class="text-uppercase" style="letter-spacing: 0.5px; font-weight: 600;">Field</th>
                            <th class="text-uppercase" style="letter-spacing: 0.5px; font-weight: 600;">Previous Value</th>
                            <th class="text-uppercase" style="letter-spacing: 0.5px; font-weight: 600;">New Value</th>
                            <th class="text-center text-uppercase" style="letter-spacing: 0.5px; font-weight: 600;">Difference</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        Object.keys(log.changes).forEach(key => {
            const c = log.changes[key];
            const diff = calculateModificationDiff(key, c.old, c.new);
            const displayLabels = { 'basicSalary': 'SALARY', 'mobileNo': 'MOBILE', 'fDutyTime': 'FROM DUTY', 'tDutyTime': 'TO DUTY', 'salaryType': 'SALARY TYPE', 'joiningDate': 'JOINING DATE', 'incrDate': 'INCREMENT DATE', 'isActive': 'STATUS' };

            const timeFields = ['checkIn', 'checkOut', 'breakIn', 'breakOut', 'fDutyTime', 'tDutyTime'];
            let oldDisplay = c.old || '-';
            let newDisplay = c.new || '-';

            if (timeFields.includes(key)) {
                oldDisplay = formatTime12Hour(c.old);
                newDisplay = formatTime12Hour(c.new);
            } else if (key.toLowerCase().includes('date') && c.old && c.new) {
                const oD = new Date(c.old);
                const nD = new Date(c.new);
                if (!isNaN(oD) && oldDisplay !== '-') oldDisplay = oD.toLocaleDateString('en-GB');
                if (!isNaN(nD) && newDisplay !== '-') newDisplay = nD.toLocaleDateString('en-GB');
            }

            const isPositive = diff && diff.startsWith('+');
            const isNeutral = diff === null || diff === '-';

            let badgeBg = 'bg-secondary';
            if (!isNeutral) {
                badgeBg = isPositive ? 'bg-success' : 'bg-danger';
            }

            bodyHtml += `
                <tr>
                    <td class="fw-bold text-secondary">${displayLabels[key] || key.toUpperCase()}</td>
                    <td class="text-danger text-decoration-line-through font-monospace">${oldDisplay}</td>
                    <td class="text-success fw-bold font-monospace">${newDisplay}</td>
                    <td class="text-center"><span class="badge ${badgeBg} px-2 py-1">${diff || '-'}</span></td>
                </tr>
            `;
        });
        bodyHtml += `</tbody></table></div></div>`;
    } else if (log.action === 'create' && log.changes) {
        bodyHtml += `
        <div class="mb-3">
            <h6 class="fw-bold text-muted text-uppercase mb-2" style="font-size: 0.75rem;">Creation Details</h6>
            <div class="p-3 bg-light rounded font-monospace small border border-light" style="white-space: pre-wrap; overflow-wrap: break-word;">${JSON.stringify(log.changes, null, 2)}</div>
        </div>`;
    }

    document.getElementById('recordModalBody').innerHTML = bodyHtml;

    const modalJumpLink = document.getElementById('modalJumpLink');
    if (log.entity === 'employee' || log.entity === 'attendance') {
        const url = log.entity === 'employee' ? `/employee-registration?id=${log.entityId}` : `/attendance-list?entityId=${log.entityId}`;
        modalJumpLink.href = url;
        modalJumpLink.style.display = 'inline-flex';
    } else {
        modalJumpLink.style.display = 'none';
        modalJumpLink.href = '#';
    }

    const modal = new bootstrap.Modal(document.getElementById('recordModal'));
    modal.show();
};
