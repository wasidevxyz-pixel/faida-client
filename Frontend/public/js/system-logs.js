let currentPage = 1;
let totalLogs = 0;
let logsData = [];

const ERROR_SOLUTIONS = {
    'CastError': 'The record ID provided is invalid. This usually happens if a link is broken or a record was recently deleted.',
    'ValidationError': 'Some required data is missing or in the wrong format. Please check the form inputs.',
    'MongoServerError: E11000': 'Duplicate entry detected. This record already exists in the database.',
    'JsonWebTokenError': 'The user session has expired or is invalid. The user needs to log out and log back in.',
    'TokenExpiredError': 'Session expired. Please refresh the page or re-login.',
    'ENOTFOUND': 'The server could not connect to an external service (database or API). Check network connection.',
    'ETIMEDOUT': 'The request took too long. Check if the server or database is under heavy load.',
    'Forbidden': 'The user tried to access a section they do not have permission for. Check Group Rights.',
    'SyntaxError': 'There is a bug in the code syntax. This needs developer attention to fix the logic.',
    'default': 'Internal server error. Try restarting the service or checking the database connectivity.'
};

document.addEventListener('DOMContentLoaded', () => {
    // Check access first
    if (typeof checkPageAccess === 'function') {
        checkPageAccess('system_logs');
    }

    initFilters();
    loadLogs();
    loadStats();

    // Auto-refresh every 30 seconds
    setInterval(loadStats, 30000);
});

function initFilters() {
    const filters = ['filterLevel', 'filterType', 'checkOnlyErrors'];
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                currentPage = 1;
                loadLogs();
            });
        }
    });

    const searchInput = document.getElementById('searchLog');
    let searchTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentPage = 1;
            loadLogs();
        }, 500);
    });
}

function getSuggestedSolution(log) {
    if (log.level !== 'error') return null;

    const message = log.message || '';
    const stack = log.meta?.stack || '';

    for (const [key, solution] of Object.entries(ERROR_SOLUTIONS)) {
        if (message.includes(key) || stack.includes(key)) {
            return solution;
        }
    }

    if (message.includes('403') || message.includes('401')) return ERROR_SOLUTIONS['Forbidden'];

    return ERROR_SOLUTIONS['default'];
}

async function loadLogs() {
    const tableBody = document.getElementById('logsTableBody');
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-primary"></div></td></tr>';

    let level = document.getElementById('filterLevel').value;
    const type = document.getElementById('filterType').value;
    const search = document.getElementById('searchLog').value;
    const limit = 50;

    // Support for specialized "Screen Usage" filter
    let finalSearch = search;
    let finalType = type;
    if (type === 'screen_usage') {
        finalType = 'request';
        finalSearch = '';
    }

    if (document.getElementById('checkOnlyErrors').checked) {
        level = 'error';
    }

    try {
        const query = new URLSearchParams({
            page: currentPage,
            limit: limit,
            level,
            type: finalType,
            search: finalSearch
        });

        const response = await fetch(`/api/v1/system-logs?${query}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        const result = await response.json();

        if (result.success) {
            logsData = result.data;
            totalLogs = result.total;
            renderLogs(result.data);
            renderPagination(result.pages);
            document.getElementById('paginationInfo').innerText = `Displaying ${result.data.length} of ${result.total} total events`;
        } else {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-5">Error: ${result.message}</td></tr>`;
        }
    } catch (error) {
        console.error('Failed to load logs:', error);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-5">Connection Failed</td></tr>';
    }
}

function renderLogs(logs) {
    const tableBody = document.getElementById('logsTableBody');
    if (logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">No activity match your current filters</td></tr>';
        return;
    }

    tableBody.innerHTML = logs.map((log, index) => {
        const time = moment(log.timestamp).format('HH:mm:ss');
        const date = moment(log.timestamp).format('DD/MM/YY');
        const isError = log.level === 'error';

        return `
            <tr onclick="showLogDetail(${index})" class="${isError ? 'table-danger' : ''}">
                <td>
                    <div class="fw-bold">${time}</div>
                    <div class="text-muted small" style="font-size: 0.65rem;">${date}</div>
                </td>
                <td>
                    <span class="log-level level-${log.level}">${log.level}</span>
                </td>
                <td class="text-uppercase small fw-bold text-muted" style="font-size: 0.7rem;">
                    ${log.type || 'system'}
                </td>
                <td>
                    <div class="fw-bold text-truncate" style="max-width: 400px;" title="${log.message}">${log.message}</div>
                    <div class="text-muted font-monospace small" style="font-size: 0.7rem;">${log.meta?.url || '---'}</div>
                </td>
                <td>
                    <div class="fw-bold">${log.meta?.userName || 'System'}</div>
                    <div class="small text-muted" style="font-size: 0.7rem;">${log.meta?.userId?.role || '-'}</div>
                </td>
                <td class="font-monospace small">${log.meta?.ip || '-'}</td>
            </tr>
        `;
    }).join('');
}

async function loadStats() {
    try {
        const response = await fetch('/api/v1/system-logs/stats', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();

        if (result.success) {
            const levels = result.data.levels;
            let total = 0;
            let errors = 0;
            let warnings = 0;
            let info = 0;

            levels.forEach(l => {
                total += l.count;
                if (l._id === 'error') errors = l.count;
                else if (l._id === 'warn') warnings = l.count;
                else info += l.count;
            });

            document.getElementById('statTotal').innerText = total.toLocaleString();
            document.getElementById('statErrors').innerText = errors.toLocaleString();
            document.getElementById('statWarnings').innerText = warnings.toLocaleString();
            document.getElementById('statInfo').innerText = info.toLocaleString();
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

function showLogDetail(index) {
    const log = logsData[index];
    if (!log) return;

    document.getElementById('v-timestamp').innerText = moment(log.timestamp).format('DD MMMM YYYY, HH:mm:ss.SSS');
    document.getElementById('v-level').innerHTML = `<span class="log-level level-${log.level}">${log.level}</span>`;
    document.getElementById('v-type').innerText = log.type || 'system';
    document.getElementById('v-url').innerText = log.meta?.url || 'INTERNAL_ACTION';
    document.getElementById('v-message').innerText = log.message;
    document.getElementById('v-user').innerText = log.meta?.userName ? `${log.meta.userName} (${log.meta.userId?.role || 'user'})` : 'System (Auto)';
    document.getElementById('v-ip').innerText = log.meta?.ip || '-';

    // Solution Logic
    const solution = getSuggestedSolution(log);
    const solutionBox = document.getElementById('solutionBox');

    // Always show the box so the AI button is visible, but handle the text
    solutionBox.style.display = 'block';
    if (solution) {
        document.getElementById('v-solution').innerText = solution;
        document.getElementById('v-solution').parentElement.parentElement.style.display = 'flex';
    } else {
        document.getElementById('v-solution').innerText = '';
        // Hide the standard solution part but keep the button
        document.getElementById('v-solution').parentElement.parentElement.style.display = 'none';
        // Note: The button is outside the d-flex of the icon/text so it remains visible
    }

    // Reset AI Advisor state
    document.getElementById('aiAdvisorBox').style.display = 'none';
    document.getElementById('aiContent').style.display = 'none';
    document.getElementById('aiLoading').style.display = 'none';
    document.getElementById('diagnoseBtn').disabled = false;
    document.getElementById('diagnoseBtn').innerHTML = '<i class="fas fa-robot me-1"></i> Diagnose with AI';

    if (log.meta?.stack) {
        document.getElementById('stack-section').style.display = 'block';
        document.getElementById('v-stack').innerText = log.meta.stack;
    } else {
        document.getElementById('stack-section').style.display = 'none';
    }

    const fullMeta = { ...log.meta };
    delete fullMeta.stack;
    document.getElementById('v-json').innerText = JSON.stringify(fullMeta, null, 4);

    const modal = new bootstrap.Modal(document.getElementById('logDetailModal'));
    modal.show();
}

function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';

    // Prev
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">
            <i class="fas fa-chevron-left me-1"></i> Prev
        </a>
    </li>`;

    // Simple range
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);

    for (let i = start; i <= end; i++) {
        html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
            <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
        </li>`;
    }

    // Next
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">
            Next <i class="fas fa-chevron-right ms-1"></i>
        </a>
    </li>`;

    pagination.innerHTML = html;
}

function changePage(page) {
    if (page < 1) return;
    currentPage = page;
    loadLogs();
}

function refreshLogs() {
    loadLogs();
    loadStats();

    // Add temporary rotation animation to sync icon
    const icon = document.querySelector('.fa-sync-alt');
    icon.classList.add('fa-spin');
    setTimeout(() => icon.classList.remove('fa-spin'), 1000);
}

async function showClearLogsModal() {
    if (confirm('Are you absolutely sure you want to clear system logs? This action cannot be undone.')) {
        try {
            const response = await fetch('/api/v1/system-logs', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success) {
                alert(result.message);
                refreshLogs();
            } else {
                alert('Clear failed: ' + result.message);
            }
        } catch (error) {
            alert('Error clearing logs');
        }
    }
}

async function diagnoseLog() {
    const timestamp = document.getElementById('v-timestamp').innerText;

    // Find the log in current logsData matching this detail
    const log = logsData.find(l => moment(l.timestamp).format('DD MMMM YYYY, HH:mm:ss.SSS') === timestamp);
    if (!log) return;

    const id = log._id;
    const btn = document.getElementById('diagnoseBtn');
    const advisorBox = document.getElementById('aiAdvisorBox');
    const loading = document.getElementById('aiLoading');
    const content = document.getElementById('aiContent');

    // UI state
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Analyzing...';
    advisorBox.style.display = 'block';
    loading.style.display = 'block';
    content.style.display = 'none';

    try {
        const response = await fetch(`/api/v1/system-logs/${id}/diagnose`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();

        if (result.success) {
            const diag = result.data.diagnostic;

            document.getElementById('aiAnalysis').innerText = diag.analysis;
            document.getElementById('aiRootCause').innerText = diag.rootCause;

            const stepsList = document.getElementById('aiSteps');
            stepsList.innerHTML = diag.suggestedResolution.map(step => `<li>${step}</li>`).join('');

            loading.style.display = 'none';
            content.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-check-circle me-1"></i> Diagnosis Ready';
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Diagnosis failed:', error);
        loading.innerHTML = `<div class="text-danger small px-3 py-2"><i class="fas fa-exclamation-triangle me-1"></i> Analysis Failed: ${error.message}</div>`;
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-robot me-1"></i> Try Again';
    }
}

