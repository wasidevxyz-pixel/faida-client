/**
 * HR Commander - Advanced HR Dashboard
 * Author: Antigravity Team
 */

// Global Helper Functions (Defined first for reliable event handling)
window.printPayroll = function (payrollId) {
    if (!payrollId) return alert('Invalid Payroll ID');
    // Using the dedicated print-payroll HTML view
    const url = `/print-payroll?id=${payrollId}`;
    window.open(url, '_blank');
};

window.viewIncrement = function (empId) {
    if (!empId) return;
    console.log('Viewing increment for:', empId);
};

// These are called by inline onclick handlers in HTML
function refreshDashboard() {
    console.log('?? Refresh Dashboard button clicked');
    if (window.hrCommander) hrCommander.refreshDashboard();
}
function applyFilters() {
    console.log('?? Global Apply Filters clicked');
    if (window.hrCommander) hrCommander.applyFilters();
}

// Zoom functionality for employee list photos
window.openLargePhoto = function (src, name) {
    if (!src || src.includes('default-avatar.png')) return;
    const modal = new bootstrap.Modal(document.getElementById('photoPreviewModal'));
    document.getElementById('largePhotoPreview').src = src;
    document.getElementById('previewEmployeeName').innerText = name || 'Employee Preview';
    modal.show();
};

class HRDashboard {
    constructor() {
        window.hrCommander = this; // Attach for global access immediately
        window.hrDashboard = this; 
        
        this.apiBase = '/api/v1/hr-dashboard';
        this.dashboardData = null;
        this.init();
    }

    async init() {
        console.log('?? HR Dashboard Initializing...');
        
        // 1. Set Initial Dates FIRST (before anything else)
        try { this.setInitialDates(); } catch (e) { console.error('setInitialDates failed:', e); }

        // 2. Clear stale branch cache & load dropdowns
        try {
            sessionStorage.removeItem('cf_/api/v1/stores');
            sessionStorage.removeItem('cf_/api/v1/sub-branches');
            window._globalBranchesRawCache = null;

            await Promise.all([
                this.loadBranches().catch(e => console.error('Branches failed:', e)),
                this.loadFormOptions().catch(e => console.error('Form options failed:', e)),
                this.loadLegacyFilterEmployees().catch(e => console.error('Legacy emp failed:', e))
            ]);
        } catch (e) { console.error('Dropdown load failed:', e); }

        // 3. Setup event listeners
        try { this.setupEventListeners(); } catch (e) { console.error('Listeners failed:', e); }

        // 4. Trigger initial data refresh
        try {
            $('#dateFilter').trigger('change');
            const activeTab = $('#hrTabList .nav-link.active').attr('data-bs-target') || '#tab-dashboard';
            this.refreshActiveTab(activeTab, true);
        } catch (e) { console.error('Initial load failed:', e); }

        setInterval(() => this.autoRefresh(), 60000);
    }

    setInitialDates() {
        const today = moment().format('YYYY-MM-DD');
        const currentMonth = moment().format('YYYY-MM');
        
        // Force set values to ensure they are never empty on load
        $('#dateFilter').val(today);
        $('#fromMonth').val(currentMonth);
        $('#toMonth').val(currentMonth);
        $('#legacyFrom').val(currentMonth);
        $('#legacyTo').val(currentMonth);
        $('#fromDate').val(today);
        $('#toDate').val(today);
    }

    async autoRefresh() {
        // Prevent overlapping concurrent refreshes
        if (this._isRefreshing) return;
        // Only refresh if explicitly on dashboard or attendance tab
        const activeTabBtn = $('#hrTabList .nav-link.active');
        if (activeTabBtn.length) {
            const target = activeTabBtn.attr('data-bs-target');
            if (target === '#tab-dashboard' || target === '#tab-attendance') {
                console.log('Auto-refreshing live data...');
                await this.refreshActiveTab(target, true);
            }
        }
    }

    setupEventListeners() {
        console.log('?? Setting up Dashboard event listeners...');

        // Unified refresh trigger for all filters
        const triggerRefresh = () => {
            console.log('? Filter change detected, refreshing...');
            this.applyFilters();
        };

        $('#branchFilter').on('change', triggerRefresh);

        $('#dateFilter').on('change', () => {
            const val = $('#dateFilter').val();
            if (val) {
                const m = moment(val);
                // Sync Month filters
                $('#fromMonth').val(m.format('YYYY-MM'));
                $('#toMonth').val(m.format('YYYY-MM'));
                // Sync Date filters
                $('#fromDate').val(m.startOf('month').format('YYYY-MM-DD'));
                $('#toDate').val(m.endOf('month').format('YYYY-MM-DD'));
            }
        });

        // Refresh employee dropdown if branch changes
        $('#branchFilter').on('change', () => {
            const activeTab = $('#hrTabList .nav-link.active').attr('data-bs-target');
            if (activeTab === '#tab-salary-list' || activeTab === '#tab-ot-st') {
                this.loadFilterEmployees();
            }
            if (activeTab === '#tab-legacy-archive') {
                this.loadLegacyFilterEmployees();
            }
            this.refreshActiveTab(); 
        });

        // Secondary Filters
        $('#deptFilter, #desigFilter, #statusFilter, #reportTypeFilter, #employeeFilter').off('change').on('change', triggerRefresh);

        // Global Search with debounce
        $('#globalSearch').off('input').on('input', this.debounce(() => {
            const activeTab = $('#hrTabList .nav-link.active').attr('data-bs-target');
            const value = $('#globalSearch').val().toLowerCase();

            if (['#tab-attendance', '#tab-advances', '#tab-employees', '#tab-performance'].includes(activeTab)) {
                let targetTable = '';
                if (activeTab === '#tab-attendance') targetTable = '#attendanceTable';
                else if (activeTab === '#tab-advances') targetTable = '#advancesTable';
                else if (activeTab === '#tab-employees') targetTable = '#employeesTable';
                else if (activeTab === '#tab-performance') targetTable = '#performanceTable';

                $(`${targetTable} tbody tr`).filter(function () {
                    $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
                });
            } else {
                this.applyFilters();
            }
        }, 300));

        $('#globalSearch').on('keypress', (e) => {
            if (e.which === 13) this.applyFilters();
        });

        // Legacy Specific Filters
        $('#legacyFrom, #legacyTo').on('change', triggerRefresh);
        $('#legacyEmployeeSelect').on('change', () => {
            triggerRefresh();
        });
        $('#legacySearch').on('input', this.debounce(() => {
            if ($('#legacySearch').val().trim()) {
                if ($('#legacyEmployeeSelect').val()) {
                    $('#legacyEmployeeSelect').val('').trigger('change.select2');
                }
            }
            triggerRefresh();
        }, 300));
        $('#legacySearch').on('keypress', (e) => {
            if (e.which === 13) this.applyFilters();
        });

        // Tab switching logic
        $('button[data-bs-toggle="tab"]').on('shown.bs.tab', (e) => {
            const target = $(e.target).attr('data-bs-target');
            $('#globalSearch, #legacySearch').val('');
            this.updateFilterVisibility(target);
            this.refreshActiveTab(target);
        });
    }

    applyFilters() {
        console.log('?? Class applyFilters() called');
        this.refreshActiveTab();
    }

    updateFilterVisibility(target) {
        // First, hide all secondary filters
        $('.filter-dept, .filter-desig, .filter-search, .filter-status, .filter-advance, .filter-otst, .filter-employee, .filter-date-range, .filter-month-range').hide();
        $('.filter-row').show();

        // Common Filters (Dept, Desig, Search) - Keep these on most report tabs
        const commonFilterTabs = ['#tab-attendance', '#tab-hours', '#tab-salary-list',
            '#tab-salary-detail', '#tab-branch-record', '#tab-branch-chart',
            '#tab-ot-st', '#tab-increments', '#tab-advances', '#tab-performance'];

        if (commonFilterTabs.includes(target)) {
            $('.filter-dept, .filter-desig, .filter-search').show();
        }

        // Hide entire row for Dashboard only
        if (target === '#tab-dashboard') {
            $('.filter-row').hide();
        }

        // Show month range for Salary List and Legacy Archive
        if (target === '#tab-legacy-archive') {
            $('.filter-row').hide(); // Hide global row entirely for legacy
            this.loadLegacyFilterEmployees();
            return;
        }

        if (target === '#tab-salary-list') {
            $('.filter-month-range, .filter-search').show();
            $('.filter-date, .filter-dept, .filter-desig').hide();
        } else {
            $('.filter-month-range').hide();
        }

        // Attendance specific status filter
        if (target === '#tab-attendance') {
            $('.filter-status').show();
        }

        if (target === '#tab-advances') {
            $('.filter-advance, .filter-date-range').show();
            // Set default date range to TODAY as requested
            const today = moment().format('YYYY-MM-DD');
            if (!$('#fromDate').val()) {
                $('#fromDate').val(today);
            }
            if (!$('#toDate').val()) {
                $('#toDate').val(today);
            }
        }

        // OT/ST specific filters
        if (target === '#tab-ot-st') {
            $('.filter-employee, .filter-otst').show();
            this.loadFilterEmployees();
        }

        // Salary List and Legacy Archive specific
        if (target === '#tab-salary-list' || target === '#tab-legacy-archive') {
            if (target === '#tab-salary-list') {
                $('.filter-employee').show();
                this.loadFilterEmployees();
            }
        }

        // Completely hide outer filter-row for Employees tab (it has own search row)
        if (target === '#tab-employees') {
            $('.filter-row').hide();
        }
    }

    // Helper to refresh data based on which tab is currently selected
    async refreshActiveTab(forcedTarget = null, silent = false) {
        // Prevent concurrent refreshes from stacking up
        if (this._isRefreshing && !silent) return;
        this._isRefreshing = true;

        try {
            const target = forcedTarget || $('.nav-link.active').attr('data-bs-target');
            console.log(`?? Refreshing Tab: ${target}`);

            // ENSURE MONTHS ARE SET FOR LEGACY/SALARY LIST
            if (target === '#tab-legacy-archive' || target === '#tab-salary-list') {
                const mainDateVal = $('#dateFilter').val();
                const mainDate = mainDateVal ? moment(mainDateVal) : moment();
                const monthVal = mainDate.format('YYYY-MM');
                
                if (!$('#fromMonth').val()) $('#fromMonth').val(monthVal);
                if (!$('#toMonth').val()) $('#toMonth').val(monthVal);
                console.log(`?? Month Sync: from=${$('#fromMonth').val()}, to=${$('#toMonth').val()}`);
            }

            // Scope the search to #hrTabList to avoid conflicts with global nav-links (like sidebar)
            let activeTab = forcedTarget || $('#hrTabList .nav-link.active').attr('data-bs-target');

            if (!activeTab) {
                // Fallback: check the active tab-pane itself
                const activePane = $('.tab-content .tab-pane.active');
                if (activePane.length) {
                    activeTab = '#' + activePane.attr('id');
                }
            }

            if (!activeTab) activeTab = '#tab-dashboard';

            const branch = $('#branchFilter').val();

            // If no branch is selected (and not selecting All Branches), don't show data
            // Note: Empty value "" means 'Select Branch' placeholder
            if (branch === "" || branch === null || branch === undefined) {
                console.log('No branch selected, showing selection prompt for:', activeTab);
                this.showSelectBranchMessage(activeTab);
                return;
            }


            // --- CLEANUP: Branch is selected, remove any existing prompts and show containers ---
            $('.select-branch-prompt').remove();
            $('#salaryDetailContainer, #performanceContainer, #branchSalaryChart').show();

            console.log('?? Branch selected:', branch, 'Refreshing active tab:', activeTab);

            switch (activeTab) {
                case '#tab-dashboard':
                case '#tab-attendance':
                    await this.refreshDashboard(silent);
                    break;
                case '#tab-advances':
                    await this.loadAdvanceSummary();
                    break;
                case '#tab-salary-list':
                    await this.loadSalaryList();
                    break;
                case '#tab-salary-detail':
                    await this.loadSalaryDetail();
                    break;
                case '#tab-employees':
                    await this.loadEmployeesList();
                    break;
                case '#tab-hours':
                    await this.loadHoursTracking();
                    break;
                case '#tab-ot-st':
                    await this.loadOvertimeShorttime();
                    break;
                case '#tab-increments':
                    await this.loadIncrements();
                    break;
                case '#tab-performance':
                    await this.loadPerformance();
                    break;
                case '#tab-branch-record':
                case '#tab-branch-chart':
                    await this.loadBranchSalaryStats();
                    break;
                case '#tab-legacy-archive':
                    await this.loadLegacyArchive(1);
                    break;
            }
        } catch (error) {
            console.error('Error in refreshActiveTab:', error);
        } finally {
            this._isRefreshing = false;
        }
    }


    // New helper to show a message when no branch is selected
    showSelectBranchMessage(activeTab) {
        const messageHtml = `
            <tr class="select-branch-prompt">
                <td colspan="30" class="text-center py-5">
                    <div class="py-4">
                        <i class="fas fa-map-marker-alt fa-3x text-muted mb-3"></i>
                        <h5 class="text-muted">Please Select a Branch</h5>
                        <p class="text-secondary small">Data will be displayed once you choose a branch location from the top dropdown.</p>
                    </div>
                </td>
            </tr>
        `;

        const containerMessageHtml = (id) => `
            <div id="${id}-prompt" class="select-branch-prompt text-center py-5">
                <i class="fas fa-map-marker-alt fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">Please Select a Branch</h5>
                <p class="text-secondary small">Select a branch to view detailed record.</p>
            </div>
        `;

        // Clear existing prompts first
        $('.select-branch-prompt').remove();

        switch (activeTab) {
            case '#tab-dashboard':
            case '#tab-attendance':
                $('#attendanceTable tbody').html(messageHtml);
                if (activeTab === '#tab-dashboard') {
                    $('.stats-card h3').text('0');
                    $('#topPresentList, #topLateList, #topAbsentList').html('<li class="list-group-item text-center text-muted py-3">Select Branch</li>');
                }
                break;
            case '#tab-hours':
                $('#hoursTable tbody').html(messageHtml);
                break;
            case '#tab-employees':
                $('#employeesTable tbody').html(messageHtml);
                break;
            case '#tab-advances':
                $('#advanceTable tbody').html(messageHtml);
                break;
            case '#tab-salary-list':
                $('#salaryListTable tbody').html(messageHtml);
                break;
            case '#tab-salary-detail':
                // Instead of clearing the DIV, prepend the message and hide the actual table/content
                if ($('#salaryDetailContainer-prompt').length === 0) {
                    $('#salaryDetailContainer').hide();
                    $('#salaryDetailContainer').parent().append(containerMessageHtml('salaryDetailContainer'));
                }
                break;
            case '#tab-ot-st':
                $('#otstTable tbody').html(messageHtml);
                break;
            case '#tab-increments':
                $('#incrementsTable tbody').html(messageHtml);
                break;
            case '#tab-performance':
                if ($('#performanceContainer-prompt').length === 0) {
                    $('#performanceContainer').hide();
                    $('#performanceContainer').parent().append(containerMessageHtml('performanceContainer'));
                }
                break;
            case '#tab-branch-record':
            case '#tab-branch-chart':
                $('#branchStatsTable tbody').html(messageHtml);
                // For charts, hide the canvas parent and show prompt
                if ($('#branchSalaryChart-prompt').length === 0) {
                    $('#branchSalaryChart').hide();
                    $('#branchSalaryChart').parent().append(containerMessageHtml('branchSalaryChart'));
                }
                break;
            case '#tab-legacy-archive':
                $('#legacyRecordsBody').html(messageHtml);
                $('#legacyMobileCards').html('<div class="text-center py-5 text-muted">Please select a branch first</div>');
                break;
        }
    }

    applyFilters() {
        console.log('?? Class applyFilters() called');
        this.refreshActiveTab();
    }

    debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    setInitialDates() {
        const today = moment().format('YYYY-MM-DD');
        $('#dateFilter').val(today);
    }

    async loadBranches() {
        try {
            // Use the proven global helper that fetches from /api/v1/stores
            await window.populateBranchSelect('branchFilter', {
                includeAll: true,
                allValue: 'All Branches',
                placeholder: 'Select Branch',
                placeholderDisabled: false
            });
            console.log('? Branch filter populated successfully');
        } catch (error) {
            console.error('Failed to load branches:', error);
            // Fallback: manually fetch branches
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/v1/stores', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success && data.data && data.data.length > 0) {
                    const select = $('#branchFilter');
                    select.empty().append('<option value="">Select Branch</option>');
                    select.append('<option value="All Branches">All Branches</option>');
                    const names = [...new Set(data.data.map(s => (s.name || '').trim()))].filter(Boolean).sort();
                    names.forEach(name => select.append(`<option value="${name}">${name}</option>`));
                }
            } catch (e2) { console.error('Fallback branch load failed:', e2); }
        }
    }

    async loadFilterEmployees() {
        try {
            const activeTab = $('#hrTabList .nav-link.active').attr('data-bs-target');
            const branch = $('#branchFilter').val();
            let url = '/api/v1/employees?limit=2000';
            // When on salary list tab, do not restrict by branch so transferred employees from any branch can be selected
            if (activeTab !== '#tab-salary-list' && branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all' && branch.toLowerCase() !== 'select branch') {
                url += `&branch=${encodeURIComponent(branch)}`;
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (result.success && result.data) {
                const select = $('#employeeFilter');
                const currentVal = select.val();
                select.empty().append('<option value="">All Employees</option>');
                result.data.forEach(emp => {
                    const branchTag = emp.branch ? ` (${emp.branch})` : '';
                    select.append(`<option value="${emp._id}">${emp.code} - ${emp.name}${branchTag}</option>`);
                });
                if (currentVal) select.val(currentVal);

                // Initialize/Refresh Select2 for searchable dropdown
                if (select.hasClass('select2-hidden-accessible')) {
                    select.select2('destroy');
                }
                select.select2({
                    placeholder: "Search Employee...",
                    allowClear: true,
                    width: '100%'
                });
            }
        } catch (error) {
            console.error('Error loading filter employees:', error);
        }
    }

    async loadFormOptions() {
        try {
            // Load Departments from employee-departments API
            let deptData;
            if (window.cachedFetch) {
                deptData = await window.cachedFetch('/api/v1/employee-departments', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
            } else {
                const res = await fetch('/api/v1/employee-departments', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                deptData = await res.json();
            }

            if (deptData && deptData.success && deptData.data) {
                // Populate both top filter and employee tab search filter
                const selectIds = ['#deptFilter', '#empSearchDept'];

                // Trim, deduplicate (case-insensitive), and sort
                const names = deptData.data.map(d => (d.name || '').trim());
                const uniqueDepts = [...new Set(names.map(n => n.toUpperCase()))]
                    .filter(n => n !== '')
                    .map(upper => names.find(n => n.toUpperCase() === upper)) // keep original case
                    .sort();

                selectIds.forEach(id => {
                    const select = $(id);
                    if (select.length) {
                        select.empty().append(`<option value="">${id === '#deptFilter' ? 'Select Department' : 'All Depts'}</option>`);
                        uniqueDepts.forEach(name => {
                            select.append(`<option value="${name}">${name}</option>`);
                        });
                    }
                });
            }

            // Load Designations (populate both top filter and Employee tab search filter)
            let desigData;
            if (window.cachedFetch) {
                desigData = await window.cachedFetch('/api/v1/designations', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
            } else {
                const res = await fetch('/api/v1/designations', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                desigData = await res.json();
            }

            if (desigData && desigData.success && desigData.data) {
                const names = desigData.data.map(d => (d.name || '').trim());
                const uniqueDesigs = [...new Set(names.map(n => n.toUpperCase()))]
                    .filter(n => n !== '')
                    .map(upper => names.find(n => n.toUpperCase() === upper))
                    .sort();

                // Top bar designation filter
                const topSelect = $('#desigFilter');
                if (topSelect.length) {
                    topSelect.empty().append('<option value="">Select Designation</option>');
                    uniqueDesigs.forEach(name => topSelect.append(`<option value="${name}">${name}</option>`));
                }

                // Employee tab designation filter
                const empDesigSelect = $('#empSearchDesig');
                if (empDesigSelect.length) {
                    empDesigSelect.empty().append('<option value="">All Designations</option>');
                    uniqueDesigs.forEach(name => empDesigSelect.append(`<option value="${name}">${name}</option>`));
                }
            }

            // Update Status Filter Options
            const statusSelect = $('#statusFilter');
            if (statusSelect.length) {
                statusSelect.html(`
                    <option value="">All Status</option>
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Poor">Poor</option>
                    <option value="Leave">Leave</option>
                `);
            }

        } catch (error) {
            console.error('Error loading form options', error);
        }
    }

    formatTime12h(timeStr) {
        if (!timeStr || timeStr === '-' || timeStr === '-:-') return '-';
        try {
            // Moment can parse various formats, but we'll try to be safe
            return moment(timeStr, ['HH:mm', 'h:mm A', 'H:mm']).format('hh:mm A');
        } catch (e) {
            return timeStr;
        }
    }

    getDutyHours(emp) {
        if (!emp) return '-';
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
                return '-';
            }
        }
        return emp.totalHrs || '-';
    }

    async refreshDashboard(silent = false) {
        const date = $('#dateFilter').val();
        const branch = $('#branchFilter').val();
        const dept = $('#deptFilter').val();
        const desig = $('#desigFilter').val();
        const status = $('#statusFilter').val();
        const search = $('#globalSearch').val();

        // Show generic loader or table loader
        if (!silent) {
            $('#attendanceTable tbody').html('<tr><td colspan="18" class="text-center"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Loading...</td></tr>');
        }

        try {
            // Load Attendance Data (Summary also returns attendance list)
            let summaryUrl = `${this.apiBase}/summary?date=${date}`;
            if (branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all' && branch.toLowerCase() !== 'select branch') summaryUrl += `&branch=${encodeURIComponent(branch)}`;
            if (dept) summaryUrl += `&department=${encodeURIComponent(dept)}`;
            if (desig) summaryUrl += `&designation=${encodeURIComponent(desig)}`;
            if (status) summaryUrl += `&status=${encodeURIComponent(status)}`;
            if (search) summaryUrl += `&search=${encodeURIComponent(search)}`;

            const response = await fetch(summaryUrl, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();

            if (result.success) {
                this.dashboardData = result.data;
                this.renderDashboardStats(result.data); // Update top cards and lists
                this.renderAttendanceTable(result.data.attendance);

                // For some tabs, we might want to trigger THEIR specific refresh if they aren't summary-based
                // but currently refreshDashboard handles Attendance tab too.
            }
        } catch (error) {
            console.error('Refresh Error:', error);
            $('#attendanceTable tbody').html('<tr><td colspan="18" class="text-center text-danger">Error loading data</td></tr>');
        }
    }

    async loadAttendance() {
        await this.refreshDashboard();
    }

    renderDashboardStats(data) {
        // 1. Update Counts
        $('#dashTotalEmp').text(data.totalEmployees || 0);
        $('#dashPresent').text(data.presentCount || 0);
        $('#dashLate').text(data.lateCount || 0);
        $('#dashAbsent').text(data.absentCount || 0);
        // Correct mappings if backend is different
        $('#dashNotMarked').text(data.notMarkedCount || data.notMarkedList?.length || 0);
        $('#dashAvgPerf').text((data.performanceAvg || 0) + '%');

        // 2. Populate Lists
        const createListItem = (name, timeHtml = '', subText = '', iconColor = 'primary') => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center">
                    <div class="rounded-circle bg-${iconColor}-light d-flex align-items-center justify-content-center me-3" style="width: 32px; height: 32px;">
                        <i class="fas fa-user" style="font-size: 0.8rem;"></i>
                    </div>
                    <div>
                        <h6 class="mb-0 fw-bold text-uppercase" style="font-size: 11px;">${name}</h6>
                        <small class="text-muted" style="font-size:10px;">${subText}</small>
                    </div>
                </div>
                <div class="text-end">
                    ${timeHtml}
                </div>
            </li>
        `;

        // Present List
        const presentList = $('#listPresent').empty();
        const presentRecs = (data.attendance || []).filter(r => (r.displayStatus === 'Present' || r.displayStatus === 'Late'));

        presentRecs.forEach(r => {
            const empName = r.employee ? r.employee.name : 'Unknown';
            const deptName = r.employee?.department?.name || 'General';
            const badgeClass = r.isLate ? 'bg-warning-light text-warning' : 'bg-success-light text-success';
            const timeHtml = `<span class="badge ${badgeClass} status-badge-modern">${this.formatTime12h(r.checkIn)}</span>`;
            presentList.append(createListItem(empName, timeHtml, deptName, r.isLate ? 'warning' : 'success'));
        });

        // Late List
        const lateList = $('#listLate').empty();
        const lateRecs = (data.attendance || []).filter(r => r.isLate);

        lateRecs.forEach(r => {
            const empName = r.employee ? r.employee.name : 'Unknown';
            const deptName = r.employee?.department?.name || 'General';
            const timeHtml = `<span class="badge bg-warning-light text-warning status-badge-modern">${this.formatTime12h(r.checkIn)}</span>`;
            lateList.append(createListItem(empName, timeHtml, deptName, 'warning'));
        });

        // Absent List
        const absentListContainer = $('#listAbsent').empty();
        const absentRecs = (data.attendance || []).filter(r => r.displayStatus === 'Absent');

        if (absentRecs.length === 0) {
            absentListContainer.html('<div class="p-4 text-center text-muted small"><i class="fas fa-check-circle d-block mb-2 fa-2x opacity-25"></i>No absences today</div>');
        } else {
            const ul = $('<ul class="list-group list-group-flush"></ul>');
            absentRecs.forEach(r => {
                const empName = r.employee ? r.employee.name : 'Unknown';
                const deptName = r.employee?.department?.name || 'Unknown Dept';
                const absentHtml = `<span class="badge bg-danger-light text-danger status-badge-modern">ABSENT</span>`;
                ul.append(createListItem(empName, absentHtml, deptName, 'danger'));
            });
            absentListContainer.append(ul);
        }

        // Not Marked List
        const notMarkedList = $('#listNotMarked').empty();
        if (data.notMarkedList && data.notMarkedList.length > 0) {
            data.notMarkedList.forEach(emp => {
                const pendingHtml = `<span class="badge bg-light text-muted status-badge-modern">PENDING</span>`;
                notMarkedList.append(createListItem(emp.name, pendingHtml, emp.designation?.name || 'No Record', 'indigo'));
            });
        } else {
            notMarkedList.append('<li class="list-group-item text-center text-muted small py-4">All marked</li>');
        }
    }


    renderAttendanceTable(list) {
        const body = $('#attendanceTable tbody');
        body.empty();

        if (!list || list.length === 0) {
            body.append('<tr><td colspan="18" class="text-center py-4">No records found</td></tr>');
            return;
        }

        list.forEach((item, index) => {
            const emp = item.employee || { name: 'Unknown', code: 'N/A' };
            const branch = emp.branch || item.branch || 'Main';
            const dept = emp.department ? emp.department.name : '-';
            const desig = emp.designation ? emp.designation.name : '-';
            const dateStr = moment(item.date).format('YYYY-MM-DD');
            const dayStr = moment(item.date).format('dddd');

            // Status Icon
            let statusIcon = '';
            const dispStatus = item.calculatedStatus || item.displayStatus;

            if (dispStatus === 'Present') statusIcon = '<span class="status-badge status-present" title="Present">Present</span>';
            else if (dispStatus === 'Absent') statusIcon = '<span class="status-badge status-absent" title="Absent">Absent</span>';
            else if (dispStatus === 'Leave') statusIcon = '<span class="status-badge status-leave" title="Leave">Leave</span>';
            else if (dispStatus === 'Poor') statusIcon = '<span class="badge bg-warning text-dark px-2" style="font-size: 10px;">PRESENT (POOR)</span>';
            else statusIcon = '<span class="badge bg-secondary">' + dispStatus + '</span>';

            const totalHrsRaw = item.totalHrs || '0:00';
            const formattedTotalHrs = (typeof totalHrsRaw === 'number') ? totalHrsRaw.toFixed(2) :
                (!isNaN(parseFloat(totalHrsRaw)) && !String(totalHrsRaw).includes(':')) ?
                    parseFloat(totalHrsRaw).toFixed(2) : totalHrsRaw;

            body.append(`
                <tr>
                    <td>${index + 1}</td>
                    <td>${branch}</td>
                    <td class="text-start ps-3 fw-bold">${emp.name}</td>
                    <td>${dept}</td>
                    <td>${desig}</td>
                    <td>${dateStr}</td>
                    <td class="small">${dayStr}</td>
                    <td class="text-secondary fw-bold">${this.getDutyHours(emp)}</td>
                    <td class="fw-bold text-primary">${this.formatTime12h(item.checkIn)}</td>
                    <td class="fw-bold text-danger">${this.formatTime12h(item.checkOut)}</td>
                    <td>${item.workedHrs || '0:00'}</td>
                    <td>${item.breakHrs || '0:00'}</td>
                    <td>${item.totalDiffHrs || '0:00'}</td>
                    <td>${formattedTotalHrs}</td>
                    <td class="text-center">${statusIcon}</td>
                    <td>${item.remarks || '-'}</td>
                    <td class="fw-bold ${(!item.totalDiffHrs || item.totalDiffHrs === '0:00' || item.totalDiffHrs === '0') ? '' : (item.diffMode === '-' ? 'text-danger' : 'text-success')}">
                        ${(!item.totalDiffHrs || item.totalDiffHrs === '0:00' || item.totalDiffHrs === '0') ? '-' : (item.diffMode === '-' ? 'Minus' : 'Plus')}
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary py-0 px-2"
                            onclick="showEmpMonthlyAttendance('${emp.code}', '${dateStr}')"
                            title="View Monthly Attendance">
                            <i class="fas fa-eye me-1"></i>View
                        </button>
                    </td>
                </tr>
            `);
        });

        // Re-apply local search filter if any exists
        const searchValue = $('#attendanceSearch').val();
        if (searchValue) {
            const value = searchValue.toLowerCase();
            $("#attendanceTable tbody tr").filter(function () {
                $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
            });
        }
    }

    // Other tab loaders
    async loadHoursTracking() {
        const tbody = $('#hoursTable tbody');
        if (tbody.length === 0) return;

        tbody.html('<tr><td colspan="15" class="text-center"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Loading Hours Tracking...</td></tr>');

        try {
            const date = $('#dateFilter').val() || moment().format('YYYY-MM-DD');
            const branch = $('#branchFilter').val();
            const dept = $('#deptFilter').val();
            const desig = $('#desigFilter').val();
            const status = $('#statusFilter').val();
            const search = $('#globalSearch').val();

            // Build query
            let url = `${this.apiBase}/hours-tracking`;
            const params = new URLSearchParams();
            if (date) params.append('date', date);
            if (branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all') params.append('branch', branch);
            if (dept) params.append('department', dept);
            if (desig) params.append('designation', desig);
            if (status) params.append('status', status);
            if (search) params.append('search', search);

            url += `?${params.toString()}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();

            tbody.empty();

            if (result.success && result.data && result.data.length > 0) {
                result.data.forEach((item, index) => {
                    const statusBadge = item.status === 'Present' ? 'bg-success' : (item.status === 'Absent' ? 'bg-danger' : 'bg-warning text-dark');
                    const progressBadge = (item.progress === 'GOOD' || item.progress === 'EXCELLENT') ? 'bg-success' : (item.progress === 'AVG' ? 'bg-warning' : 'bg-danger');

                    const progressHtml = `
                        <div class="d-flex align-items-center" style="width: 120px;">
                            <div class="progress flex-grow-1" style="height: 6px;">
                                <div class="progress-bar ${progressBadge}" role="progressbar" style="width: ${Math.min(item.completion, 100)}%"></div>
                            </div>
                            <span class="ms-2 small fw-bold">${item.completion}%</span>
                        </div>
                    `;

                    tbody.append(`
                        <tr>
                            <td>${index + 1}</td>
                            <td>${item.employeeId || '-'}</td>
                            <td class="text-start ps-3 fw-bold">${item.name}</td>
                            <td>${item.department}</td>
                            <td>${item.designation}</td>
                            <td class="fw-bold text-primary">${item.requiredHours}</td>
                            <td class="fw-bold">${item.workedHours}</td>
                            <td>${item.workingDays}</td>
                            <td>${item.dutyHours}</td>
                            <td class="text-success fw-bold">${item.overtime}</td>
                            <td class="text-danger fw-bold">${item.shortHours}</td>
                            <td>${progressHtml}</td>
                            <td><span class="badge ${statusBadge}">${item.status}</span></td>
                            <td><span class="badge ${progressBadge}">${item.progress}</span></td>
                            <td>
                                <button class="btn btn-sm btn-light border" title="View Details" onclick='hrCommander.showHoursDetail(${JSON.stringify(item)}, ${index + 1})'>
                                    <i class="fas fa-eye text-primary"></i>
                                </button>
                            </td>
                        </tr>
                    `);
                });
            } else {
                tbody.html('<tr><td colspan="15" class="text-center text-muted py-4">No records found for the selected criteria</td></tr>');
            }
        } catch (error) {
            console.error('Error loading hours tracking:', error);
            tbody.html('<tr><td colspan="15" class="text-center text-danger">Error loading data. Please try again later.</td></tr>');
        }
    }

    async loadEmployeesList() {
        const branch = $('#branchFilter').val();
        const dept = $('#empSearchDept').val() || $('#deptFilter').val();
        const desig = $('#empSearchDesig').val() || $('#desigFilter').val();
        const code = $('#empSearchCode').val();
        const name = $('#empSearchName').val();

        const tbody = $('#employeesTable tbody');
        tbody.html('<tr><td colspan="15" class="text-center">Loading employees...</td></tr>');

        try {
            let url = `/api/v1/employees?isActive=true&limit=2000`;
            if (branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all') url += `&branch=${encodeURIComponent(branch)}`;
            if (dept) url += `&department=${encodeURIComponent(dept)}`;
            if (desig) url += `&designation=${encodeURIComponent(desig)}`;
            if (code) url += `&code=${encodeURIComponent(code)}`;
            if (name) url += `&name=${encodeURIComponent(name)}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await response.json();

            if (data.success && data.data.length > 0) {
                let rowsHtml = '';
                data.data.forEach((emp, index) => {
                    const deptName = emp.department?.name || '-';
                    const desigName = emp.designation?.name || '-';
                    const salary = emp.basicSalary || 0;
                    const otherAllow = emp.otherAllowance || 0;
                    const fixAllow = emp.fixAllowance || 0;
                    const stLoss = emp.stLoss || 0;
                    const netSalary = salary + otherAllow + fixAllow + stLoss;

                    rowsHtml += `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${emp.code}</td>
                            <td>${emp.branch}</td>
                            <td>
                                <div class="d-flex align-items-center">
                                    <img src="${emp.photo || '/img/default-avatar.png'}" 
                                         class="rounded-circle me-2 employee-photo-clickable" 
                                         width="24" height="24" 
                                         onerror="this.src='/img/default-avatar.png'"
                                         style="cursor: zoom-in; transition: transform 0.2s;"
                                         data-name="${(emp.name || '').replace(/"/g, '&quot;')}"
                                         onclick="openLargePhoto(this.src, this.getAttribute('data-name'))">
                                    ${emp.name}
                                </div>
                            </td>
                            <td>${deptName}</td>
                            <td>${desigName}</td>
                            <td>${emp.cnic || '-'}</td>
                            <td>${emp.mobileNo || emp.mobileNumber || '-'}</td>
                            <td>${emp.acNo || emp.bankAccountNo || '-'}</td>
                            <td>${emp.selectBank || emp.bankCash || '-'}</td>
                            <td>${emp.totalHrs || '-'}</td>
                            <td>${emp.incrDate ? moment(emp.incrDate).format('YYYY-MM-DD') : '-'}</td>
                            <td>${salary.toLocaleString()}</td>
                            <td class="text-info fw-bold">${otherAllow.toLocaleString()}</td>
                            <td class="text-primary fw-bold">${fixAllow.toLocaleString()}</td>
                            <td class="text-danger fw-bold">${stLoss.toLocaleString()}</td>
                            <td class="text-success fw-bold">${netSalary.toLocaleString()}</td>
                            <td><span class="badge ${emp.isActive ? 'bg-success' : 'bg-danger'}">${emp.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
                        </tr>
                    `;
                });
                tbody.html(rowsHtml);
            } else {
                tbody.html('<tr><td colspan="17" class="text-center">No employees found</td></tr>');
            }
        } catch (error) {
            console.error('Error loading employees:', error);
            tbody.html('<tr><td colspan="17" class="text-center text-danger">Error loading data</td></tr>');
        }
    }

    async loadAdvanceSummary() {
        const body = $('#advancesTable tbody');
        body.html('<tr><td colspan="14" class="text-center"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Loading Advances...</td></tr>');

        try {
            const date = $('#dateFilter').val();
            const fromDate = $('#fromDate').val();
            const toDate = $('#toDate').val();
            const branch = $('#branchFilter').val();
            const dept = $('#deptFilter').val();
            const desig = $('#desigFilter').val();
            const reportType = $('#reportTypeFilter').val();
            const searchText = $('#globalSearch').val();

            let url = `${this.apiBase}/advance-summary?date=${date}`;
            if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
            if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;
            if (branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all' && branch.toLowerCase() !== 'select branch') url += `&branch=${encodeURIComponent(branch)}`;
            if (dept) url += `&department=${encodeURIComponent(dept)}`;
            if (desig && desig !== 'Select Designation') url += `&designation=${encodeURIComponent(desig)}`;
            if (reportType) url += `&reportType=${encodeURIComponent(reportType)}`;
            if (searchText) url += `&search=${encodeURIComponent(searchText)}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();

            if (result.success && result.data) {
                // Update Summary Cards
                $('#advTotalSum').text(`PKR ${(result.data.totalAdvance || 0).toLocaleString()}`);
                $('#advTotalOpen').text(`PKR ${(result.data.totalOpening || 0).toLocaleString()}`);
                $('#advTotalCurr').text(`PKR ${(result.data.totalCurrent || 0).toLocaleString()}`);
                $('#advTotalEmp').text(result.data.totalRecords || 0);

                body.empty();
                if (result.data.list && result.data.list.length > 0) {
                    result.data.list.forEach((item, index) => {
                        body.append(`
                            <tr>
                                <td>${index + 1}</td>
                                <td>${item.code}</td>
                                <td class="fw-bold">${item.name}</td>
                                <td>${item.branch}</td>
                                <td>${item.department}</td>
                                <td>${item.designation}</td>
                                <td>${item.month}</td>
                                <td>${(item.basicSalary || 0).toLocaleString()}</td>
                                <td class="text-primary fw-bold">${(item.openingBalance || 0).toLocaleString()}</td>
                                <td class="text-info fw-bold">${(item.currentAdvance || 0).toLocaleString()}</td>
                                <td class="text-dark fw-bold">${(item.totalAdvance || 0).toLocaleString()}</td>
                                <td class="text-danger fw-bold">${(item.dedFromSalary || 0).toLocaleString()}</td>
                                <td class="text-success fw-bold bg-light">${(item.balance || 0).toLocaleString()}</td>
                                <td>
                                    <button class="btn btn-sm btn-outline-primary py-0 px-2"
                                        onclick="showAdvanceLedger('${item.code}', '${item.name}')"
                                        title="View Advance Ledger">
                                        <i class="fas fa-eye me-1"></i>View
                                    </button>
                                </td>
                            </tr>
                        `);
                    });
                } else {
                    body.html('<tr><td colspan="14" class="text-center text-muted py-4">No Advance Records Found for the selected criteria</td></tr>');
                }
            }
        } catch (error) {
            console.error('Error loading advances:', error);
            body.html('<tr><td colspan="14" class="text-center text-danger">Error loading data</td></tr>');
        }
    }

    async loadSalaryList() {
        const body = $('#salaryListTable tbody');
        body.html('<tr><td colspan="18" class="text-center"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Loading Salaries...</td></tr>');

        try {
            const date = $('#dateFilter').val();
            const branch = $('#branchFilter').val();
            const dept = $('#deptFilter').val();
            const desig = $('#desigFilter').val();
            const search = $('#globalSearch').val();
            const employee = $('#employeeFilter').val();
            const fromMonth = $('#fromMonth').val();
            const toMonth = $('#toMonth').val();

            let url = `${this.apiBase}/salary-list?date=${date}`;
            if (fromMonth) url += `&fromDate=${fromMonth}`;
            if (toMonth) url += `&toDate=${toMonth}`;
            // If employee is selected, don't restrict by branch so all branches' salary slips for this employee are returned
            if (!employee && branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all' && branch.toLowerCase() !== 'select branch') url += `&branch=${encodeURIComponent(branch)}`;
            if (!employee && dept && dept !== 'All Depts' && dept !== 'Select Department') url += `&department=${encodeURIComponent(dept)}`;
            if (!employee && desig && desig !== 'Select Designation') url += `&designation=${encodeURIComponent(desig)}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            if (employee) url += `&employee=${encodeURIComponent(employee)}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();

            body.empty();
            if (result.success && result.data && result.data.length > 0) {
                result.data.forEach((item, index) => {
                    const emp = item.employee || { name: 'Unknown', code: 'N/A' };

                    // Logical Earnings (All additions as per print-payroll.html)
                    const basic = item.perMonth || 0;
                    const ot = item.overTime || 0;
                    const mComm = item.monthlyComm || 0;
                    const whComm = item.warehouseComm || 0;
                    const fixAllow = item.natin || 0;
                    const otherAllow = item.otherAllow || 0;
                    const rotiNashta = (item.rent || 0) + (item.teaAllowance || 0);
                    const stAllow = item.stLateAllow || 0;

                    const calculatedGross = basic + ot + mComm + whComm + fixAllow + otherAllow + rotiNashta + stAllow;

                    // Deductions
                    const shortTime = item.shortWeek || 0;
                    const mess = item.ebDeduction || 0;
                    const otherDed = item.penalty || 0;
                    const preMonthBal = item.pmAdvRec || 0;
                    const currAdv = item.cmAdvRec || 0;
                    const advDed = item.totalAdv || 0;
                    const totalAdvRec = item.totalAdvRec || (preMonthBal + currAdv);
                    const advBalance = totalAdvRec - advDed;
                    const wht = item.wht || 0;
                    const security = item.securityDeposit || 0;

                    // Hidden/Other deductions included in net total calculation
                    const ttw = item.ttw || 0;
                    const fund = item.fund || 0;
                    const ugrm = item.ugrm || 0;

                    const totalDeductions = shortTime + mess + otherDed + advDed + wht + security + ttw + fund + ugrm;
                    const calculatedNet = calculatedGross - totalDeductions;

                    const bankPaid = item.bankPaid || 0;
                    const cashPaid = item.cashPaid || 0;

                    // Display the Payroll Month
                    const payrollMonth = item.monthYear || moment(item.createdAt).format('YYYY-MM');
                    const displayMonth = moment(payrollMonth, 'YYYY-MM').format('MMM-YYYY');
                    const branchName = item.branch || '';

                    body.append(`
                        <tr class="align-middle">
                            <td class="text-center">
                                <button class="btn btn-sm btn-primary py-0 px-2" style="font-size:10px;" onclick="window.printPayroll('${item._id}')" title="Print Salary Slip">
                                    <i class="fas fa-print"></i>
                                </button>
                            </td>
                            <td class="text-start">
                                <div class="fw-bold text-success" style="font-size: 0.8rem; line-height: 1.2;">${emp.name}</div>
                                <div class="text-muted" style="font-size: 0.65rem;">${emp.code}</div>
                            </td>
                            <td>
                                <span class="badge bg-secondary-subtle text-secondary border fw-bold" style="font-size: 0.72rem;">${branchName || 'N/A'}</span>
                            </td>
                            <td style="font-size: 0.75rem;" class="fw-semibold">${displayMonth}</td>
                            <td class="fw-bold">${basic.toLocaleString()}</td>
                            
                            <!-- OT & Comm Group -->
                            <td>
                                <div class="fw-bold">${(ot + mComm + whComm).toLocaleString()}</div>
                                <div class="text-muted" style="font-size: 0.65rem;">
                                    OT:${ot} | C:${mComm + whComm}
                                </div>
                            </td>

                            <!-- Allowances Group -->
                            <td>
                                <div class="fw-bold">${(fixAllow + otherAllow + rotiNashta + stAllow).toLocaleString()}</div>
                                <div class="text-muted" style="font-size: 0.65rem;">
                                    Fix:${fixAllow} | O:${otherAllow + rotiNashta + stAllow}
                                </div>
                            </td>

                            <td class="fw-bold table-primary">${calculatedGross.toLocaleString()}</td>
                            
                            <!-- Time & Mess Group -->
                            <td>
                                <div class="fw-bold text-danger">${(shortTime + mess).toLocaleString()}</div>
                                <div class="text-muted" style="font-size: 0.65rem;">
                                    ST:${shortTime} | M:${mess}
                                </div>
                            </td>

                            <!-- Advance Group -->
                            <td>
                                <div class="fw-bold text-warning">${advDed.toLocaleString()}</div>
                                <div class="text-muted" style="font-size: 0.65rem;">
                                    Bal: ${advBalance.toLocaleString()}
                                </div>
                            </td>

                            <!-- Other Deds Group -->
                            <td>
                                <div class="fw-bold text-secondary">${(otherDed + wht + security).toLocaleString()}</div>
                                <div class="text-muted" style="font-size: 0.65rem;">
                                    WHT:${wht} | P:${otherDed}
                                </div>
                            </td>

                            <td class="fw-bold text-dark table-success">${calculatedNet.toLocaleString()}</td>
                            
                            <!-- Payment Mode Group -->
                            <td style="font-size: 0.75rem;">
                                ${bankPaid > 0 ? `<div><span class="badge bg-primary-light text-primary" style="font-size: 0.6rem;">BANK: ${bankPaid.toLocaleString()}</span></div>` : ''}
                                ${cashPaid > 0 ? `<div><span class="badge bg-success-light text-success" style="font-size: 0.6rem;">CASH: ${cashPaid.toLocaleString()}</span></div>` : ''}
                                ${bankPaid === 0 && cashPaid === 0 ? '<span class="text-muted">-</span>' : ''}
                            </td>
                        </tr>
                    `);
                });
            } else {
                body.html('<tr><td colspan="18" class="text-center text-muted py-5">No Salary Records Found for this month</td></tr>');
            }
        } catch (error) {
            console.error('Error loading salary list:', error);
            body.html('<tr><td colspan="18" class="text-center text-danger">Error loading data</td></tr>');
        }
    }

    async loadSalaryDetail() {
        console.log('?? loadSalaryDetail() started');
        const container = $('#salaryDetailContainer');
        container.html('<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Loading Salary Details...</div></div>');

        try {
            const branch = $('#branchFilter').val();
            const dept = $('#deptFilter').val();
            const desig = $('#desigFilter').val();
            const search = $('#globalSearch').val();
            console.log('?? loadSalaryDetail() filters:', { branch, dept, desig, search });

            let url = `${this.apiBase}/salary-detail?`;
            const branchLower = branch ? branch.toLowerCase().trim() : '';
            if (branch && branchLower !== 'all branches' && branchLower !== 'all' && branchLower !== 'select branch') url += `&branch=${encodeURIComponent(branch)}`;
            if (dept) url += `&department=${encodeURIComponent(dept)}`;
            if (desig) url += `&designation=${encodeURIComponent(desig)}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            console.log('?? loadSalaryDetail() fetching URL:', url);

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            console.log('?? loadSalaryDetail() API response received:', result);

            if (result.success && result.data && result.data.length > 0) {
                console.log(`?? loadSalaryDetail() processing ${result.data.length} records`);
                // Group by Branch then Department
                const grouped = result.data.reduce((acc, emp) => {
                    const b = emp.branch || 'Unknown Branch';
                    const d = emp.department?.name || 'General';
                    if (!acc[b]) acc[b] = {};
                    if (!acc[b][d]) acc[b][d] = [];
                    acc[b][d].push(emp);
                    return acc;
                }, {});

                let html = '';
                let grandTotalBasic = 0, grandTotalFix = 0, grandTotalSt = 0, grandTotalOther = 0, grandTotalNet = 0;

                Object.keys(grouped).sort().forEach(branchName => {
                    let branchBasic = 0, branchFix = 0, branchSt = 0, branchOther = 0, branchNet = 0;

                    html += `
                        <div class="branch-section mb-4 shadow-sm rounded-3 overflow-hidden border">
                            <div class="text-dark py-2 px-3 fw-bold text-center bg-light border-bottom" style="font-size: 0.85rem; letter-spacing: 2px; border-radius: 10px 10px 0 0;">
                                ${branchName.toUpperCase()}
                            </div>
                            <div class="table-responsive">
                                <table class="table-custom mb-0" style="table-layout: fixed; width: 100%;">
                                    <thead>
                                        <tr style="background: #1e4c8c !important; color: white !important;">
                                            <th style="width: 6%; background: #1e4c8c !important; color: white !important; font-size: 0.75rem;">Code</th>
                                            <th style="width: 28%; background: #1e4c8c !important; color: white !important; font-size: 0.75rem;">Employee Name</th>
                                            <th class="date-col" style="width: 11%; background: #1e4c8c !important; color: white !important; font-size: 0.75rem;">Incr. Date</th>
                                            <th class="text-end" style="width: 11%; background: #1e4c8c !important; color: white !important; font-size: 0.75rem;">Basic Salary</th>
                                            <th class="text-end" style="width: 11%; background: #1e4c8c !important; color: white !important; font-size: 0.75rem;">Fix Allowance</th>
                                            <th class="text-end" style="width: 11%; background: #1e4c8c !important; color: white !important; font-size: 0.75rem;">ST Less Allow</th>
                                            <th class="text-end" style="width: 11%; background: #1e4c8c !important; color: white !important; font-size: 0.75rem;">Other Allow</th>
                                            <th class="text-end" style="width: 11%; background: #1e4c8c !important; color: white !important; font-size: 0.75rem;">Net Salary</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                    `;

                    Object.keys(grouped[branchName]).sort().forEach(deptName => {
                        let deptBasic = 0, deptFix = 0, deptSt = 0, deptOther = 0, deptNet = 0;

                        html += `
                            <tr class="fw-bold" style="background-color: #f0f7ff !important;">
                                <td colspan="8" class="ps-3 py-2" style="background-color: #f0f7ff !important; color: #1e4c8c !important; font-size: 0.85rem;">
                                     <i class="fas fa-folder-open me-2"></i>${deptName.toUpperCase()}
                                </td>
                            </tr>
                        `;

                        grouped[branchName][deptName].forEach(emp => {
                            const dateStr = emp.incrDate ? moment(emp.incrDate).format('DD/MM/YYYY') : '-';
                            const basic = emp.basicSalary || 0;
                            const fix = emp.fixAllowance || 0;
                            const stLoss = emp.stLoss || 0;
                            const other = emp.otherAllowance || 0;
                            const net = basic + fix + stLoss + other;

                            branchBasic += basic; branchFix += fix; branchSt += stLoss; branchOther += other; branchNet += net;
                            deptBasic += basic; deptFix += fix; deptSt += stLoss; deptOther += other; deptNet += net;

                            html += `
                                <tr class="align-middle">
                                    <td class="text-center">${emp.code}</td>
                                    <td class="text-start ps-4 fw-medium text-truncate">${emp.name}</td>
                                    <td class="date-col">${dateStr}</td>
                                    <td class="text-end fw-bold">${basic.toLocaleString()}</td>
                                    <td class="text-end">${fix.toLocaleString()}</td>
                                    <td class="text-end">${stLoss.toLocaleString()}</td>
                                    <td class="text-end">${other.toLocaleString()}</td>
                                    <td class="text-end fw-bold text-primary">${net.toLocaleString()}</td>
                                </tr>
                            `;
                        });

                        // Department Subtotal Row
                        html += `
                            <tr class="fw-bold" style="background-color: #e2e8f1 !important;">
                                <td colspan="3" class="text-end pe-4" style="background-color: #e2e8f1 !important; color: #1e4c8c !important; font-size: 0.9rem; text-transform: uppercase; font-weight: 800 !important;">SUBTOTAL (${deptName})</td>
                                <td class="text-end" style="background-color: #e2e8f1 !important; color: #1e4c8c !important; font-weight: 800 !important;">${deptBasic.toLocaleString()}</td>
                                <td class="text-end" style="background-color: #e2e8f1 !important; color: #1e4c8c !important; font-weight: 800 !important;">${deptFix.toLocaleString()}</td>
                                <td class="text-end" style="background-color: #e2e8f1 !important; color: #1e4c8c !important; font-weight: 800 !important;">${deptSt.toLocaleString()}</td>
                                <td class="text-end" style="background-color: #e2e8f1 !important; color: #1e4c8c !important; font-weight: 800 !important;">${deptOther.toLocaleString()}</td>
                                <td class="text-end fw-bold" style="background-color: #e2e8f1 !important; color: #1e4c8c !important; font-weight: 800 !important;">${deptNet.toLocaleString()}</td>
                            </tr>
                        `;
                    });

                    html += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;

                    grandTotalBasic += branchBasic; grandTotalFix += branchFix; grandTotalSt += branchSt; grandTotalOther += branchOther; grandTotalNet += branchNet;
                });

                // Grand Total Bar - Balanced & Aligned
                html += `
                    <div class="table-responsive mt-1 shadow-sm rounded">
                        <table class="table-custom mb-0" style="table-layout: fixed; width: 100%;">
                            <tbody>
                                <tr class="fw-bold text-white text-uppercase" style="background: #1e4c8c !important;">
                                    <td colspan="3" class="text-end pe-4 py-3" style="width: 45%; background: #1e4c8c !important; color: white !important; border:none; border-right: 1px solid rgba(255,255,255,0.2) !important; letter-spacing: 1px;">GRAND TOTAL</td>
                                    <td class="text-end py-3" style="width: 11%; background: #1e4c8c !important; color: white !important; border:none; border-right: 1px solid rgba(255,255,255,0.2) !important;">${grandTotalBasic.toLocaleString()}</td>
                                    <td class="text-end py-3" style="width: 11%; background: #1e4c8c !important; color: white !important; border:none; border-right: 1px solid rgba(255,255,255,0.2) !important;">${grandTotalFix.toLocaleString()}</td>
                                    <td class="text-end py-3" style="width: 11%; background: #1e4c8c !important; color: white !important; border:none; border-right: 1px solid rgba(255,255,255,0.2) !important;">${grandTotalSt.toLocaleString()}</td>
                                    <td class="text-end py-3" style="width: 11%; background: #1e4c8c !important; color: white !important; border:none; border-right: 1px solid rgba(255,255,255,0.2) !important;">${grandTotalOther.toLocaleString()}</td>
                                    <td class="text-end py-3" style="width: 11%; background: #1e4c8c !important; color: #ffca28 !important; border:none;">${grandTotalNet.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                `;

                container.html(html);

            } else {
                console.warn('?? loadSalaryDetail() returned no records or failed: success =', result.success);
                container.html('<div class="text-center p-5 text-muted"><i class="fas fa-search fa-3x mb-3 opacity-25"></i><br>No records found for the selected criteria.</div>');
            }
        } catch (error) {
            console.error('?? loadSalaryDetail() CRITICAL ERROR:', error);
            container.html('<div class="text-center p-5 text-danger"><i class="fas fa-exclamation-triangle fa-3x mb-3"></i><br>Error loading data. Check console for details.</div>');
        }
    }


    async loadOvertimeShorttime() {
        const body = $('#otstTable tbody');
        body.html('<tr><td colspan="15" class="text-center"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Loading OT/ST Data...</td></tr>');

        try {
            const date = $('#dateFilter').val();
            const branch = $('#branchFilter').val();
            const dept = $('#deptFilter').val();
            const employee = $('#employeeFilter').val();
            const desig = $('#desigFilter').val();
            const search = $('#globalSearch').val();
            const otstType = $('#otstTypeFilter').val();

            let url = `${this.apiBase}/ot-st?date=${date}`;
            if (branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all' && branch.toLowerCase() !== 'select branch') url += `&branch=${encodeURIComponent(branch)}`;
            if (dept) url += `&department=${encodeURIComponent(dept)}`;
            if (desig) url += `&designation=${encodeURIComponent(desig)}`;
            if (employee) url += `&employee=${encodeURIComponent(employee)}`;
            if (otstType) url += `&otstType=${encodeURIComponent(otstType)}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();

            body.empty();
            if (result.success && result.data && result.data.length > 0) {
                result.data.forEach((row, index) => {
                    body.append(`
                        <tr class="align-middle">
                            <td>${row.date}</td>
                            <td>${row.branch}</td>
                            <td>${row.code}</td>
                            <td class="text-start ps-3 fw-bold">${row.name}</td>
                            <td>${row.department}</td>
                            <td>${row.designation}</td>
                            <td>${row.reqHrs}</td>
                            <td>${row.workedHrs}</td>
                            <td>${row.dutyHrs}</td>
                            <td>${row.cmDays}</td>
                            <td class="bg-success-light fw-bold">${row.otHrs}</td>
                            <td class="text-success">${(row.otRs || 0).toLocaleString()}</td>
                            <td class="bg-danger-light fw-bold">${row.stHrs}</td>
                            <td class="text-danger">${(row.stRs || 0).toLocaleString()}</td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary py-0" title="View Detail" onclick="showEmpMonthlyAttendance('${row.code}', '${row.date}')">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </td>
                        </tr>
                    `);
                });
            } else {
                body.html('<tr><td colspan="15" class="text-center text-muted py-5">No Overtime/Short-time records found for this period.</td></tr>');
            }
        } catch (error) {
            console.error('Error loading OT/ST:', error);
            body.html('<tr><td colspan="15" class="text-center text-danger">Error loading data. Please try again.</td></tr>');
        }
    }

    async loadIncrements() {
        const container = $('#tab-increments');
        container.html('<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Generating Increment Report...</div></div>');

        try {
            const desig = $('#desigFilter').val();
            const search = $('#globalSearch').val();
            const date = $('#dateFilter').val();
            const branch = $('#branchFilter').val();
            const dept = $('#deptFilter').val();

            let url = `${this.apiBase}/increments?`;
            if (branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all' && branch.toLowerCase() !== 'select branch') url += `&branch=${encodeURIComponent(branch)}`;
            if (dept) url += `&department=${encodeURIComponent(dept)}`;
            if (desig) url += `&designation=${encodeURIComponent(desig)}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            if (date) url += `&date=${date}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();

            if (result.success && result.data && result.data.length > 0) {
                const reportMonth = date ? moment(date).format('MMMM YYYY') : moment().format('MMMM YYYY');
                const selectedBranch = branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all' && branch.toLowerCase() !== 'select branch' ? branch : null;

                // Group by Branch
                const grouped = result.data.reduce((acc, emp) => {
                    const b = emp.branch || 'Unknown Branch';
                    if (!acc[b]) acc[b] = [];
                    acc[b].push(emp);
                    return acc;
                }, {});

                let grandTotalBasic = 0;
                let grandTotalAllow = 0;
                let grandTotalNet = 0;

                let tbodyHtml = '';

                Object.keys(grouped).sort().forEach(branchName => {
                    let branchBasic = 0, branchAllow = 0, branchNet = 0;

                    // Branch name row (full-width, dark navy)
                    tbodyHtml += `
                        <tr>
                            <td colspan="10" class="text-center fw-bold"
                                style="background-color:#1a3c5e !important; color:#fff !important;
                                       letter-spacing:1px; padding:8px !important;">
                                <i class="fas fa-code-branch me-2"></i>${branchName.toUpperCase()}
                            </td>
                        </tr>`;

                    grouped[branchName].forEach(emp => {
                        const basic = emp.basicSalary || 0;
                        const allow = (emp.fixAllowance || 0) + (emp.otherAllowance || 0);
                        const net = basic + allow;
                        branchBasic += basic;
                        branchAllow += allow;
                        branchNet += net;

                        let serviceTime = '-';
                        if (emp.joiningDate) {
                            const dur = moment.duration(moment().diff(moment(emp.joiningDate)));
                            serviceTime = `${dur.years()} Years ${dur.months()} Month ${dur.days()} Days`;
                        }

                        const lastInc = emp.incrDate ? moment(emp.incrDate).format('DD-MM-YYYY') : '-';
                        const nextInc = emp.incrDate ? moment(emp.incrDate).add(1, 'year').format('DD-MM-YYYY') : '-';

                        tbodyHtml += `
                            <tr class="align-middle">
                                <td>${emp.code}</td>
                                <td class="text-start ps-3 fw-bold">${emp.name}</td>
                                <td>${emp.department?.name || '-'}</td>
                                <td>${emp.designation?.name || '-'}</td>
                                <td class="small">${serviceTime}</td>
                                <td class="fw-bold">${basic.toLocaleString()}</td>
                                <td>${allow.toLocaleString()}</td>
                                <td class="fw-bold text-primary">${net.toLocaleString()}</td>
                                <td>${lastInc}</td>
                                <td class="fw-bold text-success">${nextInc}</td>
                            </tr>`;
                    });

                    // Subtotal row
                    tbodyHtml += `
                        <tr>
                            <td colspan="5" class="text-end pe-4 fw-bold"
                                style="background-color:#e3f2fd !important;">SUBTOTAL (${branchName})</td>
                            <td class="fw-bold" style="background-color:#e3f2fd !important;">${branchBasic.toLocaleString()}</td>
                            <td class="fw-bold" style="background-color:#e3f2fd !important;">${branchAllow.toLocaleString()}</td>
                            <td class="fw-bold text-primary" style="background-color:#e3f2fd !important;">${branchNet.toLocaleString()}</td>
                            <td colspan="2" style="background-color:#e3f2fd !important;"></td>
                        </tr>`;

                    grandTotalBasic += branchBasic;
                    grandTotalAllow += branchAllow;
                    grandTotalNet += branchNet;
                });

                // Grand Total row — same table, columns perfectly aligned
                tbodyHtml += `
                    <tr>
                        <td colspan="5" class="text-end pe-4 fw-bold"
                            style="background-color:#1a1a2e !important; color:#fff !important;">GRAND TOTAL</td>
                        <td class="fw-bold" style="background-color:#1a1a2e !important; color:#fff !important;">${grandTotalBasic.toLocaleString()}</td>
                        <td class="fw-bold" style="background-color:#1a1a2e !important; color:#fff !important;">${grandTotalAllow.toLocaleString()}</td>
                        <td class="fw-bold" style="background-color:#1a1a2e !important; color:#ffd700 !important;">${grandTotalNet.toLocaleString()}</td>
                        <td colspan="2" style="background-color:#1a1a2e !important;"></td>
                    </tr>`;

                const html = `
                <div class="text-center mb-3">
                    <h5 class="fw-bold text-uppercase" style="letter-spacing:1px;">INCREMENTS DUE IN: ${reportMonth.toUpperCase()}</h5>
                    <h6 class="text-muted">(( ${selectedBranch || 'ALL BRANCHES'} ))</h6>
                </div>
                <div class="table-responsive">
                    <table class="table-custom text-nowrap">
                        <thead class="bg-primary text-white">
                            <tr>
                                <th>CODE</th>
                                <th>NAME</th>
                                <th>DEPARTMENT</th>
                                <th>DESIGNATION</th>
                                <th>SERVICE TIME</th>
                                <th>BASIC SALARY</th>
                                <th>ALLOWANCE</th>
                                <th>NET SALARY</th>
                                <th>LAST INC DATE</th>
                                <th>NEXT INC DATE</th>
                            </tr>
                        </thead>
                        <tbody>${tbodyHtml}</tbody>
                    </table>
                </div>`;

                container.html(html);
            } else {
                container.html('<div class="text-center p-5 text-muted"><i class="fas fa-check-circle fa-3x mb-3 text-success"></i><br>No Increments Due in ' + (date ? moment(date).format('MMMM YYYY') : moment().format('MMMM YYYY')) + '</div>');
            }
        } catch (error) {
            console.error('Error loading increments:', error);
            container.html('<div class="text-danger text-center p-5">Error fetching data. Check console for details.</div>');
        }
    }


    async loadBranchSalaryStats() {
        const body = $('#branchRecordTable tbody');
        if (body.length === 0) return; // Tab not active or table missing

        body.html('<tr><td colspan="9" class="text-center"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Loading Branch Salary Stats...</td></tr>');

        try {
            const date = $('#dateFilter').val() || moment().format('YYYY-MM-DD');
            const response = await fetch(`${this.apiBase}/branch-salary?date=${date}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();

            body.empty();
            if (result.success && result.data && result.data.length > 0) {
                const chartLabels = [];
                const chartData = [];

                result.data.forEach((item, index) => {
                    const basic = item.totalBasicSalary || 0;
                    const allow = item.totalAllowances || 0;
                    const ot = item.totalOvertime || 0;
                    const dedu = item.totalDeductions || 0;
                    const net = item.totalNetSalary || (basic + allow + ot - dedu);

                    const avg = item.employeeCount > 0 ? (net / item.employeeCount) : 0;

                    chartLabels.push(item._id);
                    chartData.push(Math.round(net));

                    body.append(`
                        <tr class="align-middle">
                            <td>${index + 1}</td>
                            <td class="fw-bold text-dark">${item._id}</td>
                            <td><span class="badge bg-light text-dark border">${item.employeeCount}</span></td>
                            <td class="fw-bold">${basic.toLocaleString()}</td>
                            <td class="text-info">${allow.toLocaleString()}</td>
                            <td class="text-success">${ot.toLocaleString()}</td>
                            <td class="text-danger">${dedu.toLocaleString()}</td>
                            <td class="table-success fw-bold text-dark" style="background-color: #d1e7dd !important;">${net.toLocaleString()}</td>
                            <td>${Math.round(avg).toLocaleString()}</td>
                        </tr>
                    `);
                });

                // Render Chart
                this.renderBranchChart(chartLabels, chartData, result.source === 'payroll');
            } else {
                body.html('<tr><td colspan="9" class="text-center py-5 text-muted">No Salary Records Found</td></tr>');
            }
        } catch (error) {
            console.error('Error loading branch stats:', error);
            if (body.length > 0) body.html('<tr><td colspan="9" class="text-center text-danger">Error loading data</td></tr>');
        }
    }

    async loadPerformance() {
        const tbody = $('#performanceTable tbody');
        if (tbody.length === 0) return;

        tbody.html('<tr><td colspan="9" class="text-center"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Analyzing Performance Data...</td></tr>');

        try {
            const date = $('#dateFilter').val();
            const branch = $('#branchFilter').val();
            const dept = $('#deptFilter').val();
            const desig = $('#desigFilter').val();
            const search = $('#globalSearch').val();

            let url = `${this.apiBase}/performance?date=${date}`;
            if (branch && branch.toLowerCase() !== 'all branches' && branch.toLowerCase() !== 'all' && branch.toLowerCase() !== 'select branch') url += `&branch=${encodeURIComponent(branch)}`;
            if (dept) url += `&department=${encodeURIComponent(dept)}`;
            if (desig) url += `&designation=${encodeURIComponent(desig)}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();

            tbody.empty();
            if (result.success && result.data && result.data.length > 0) {
                $('#performanceMonthDisplay').text(result.month || '');

                let rowsHtml = '';
                result.data.forEach(item => {
                    const stats = item.stats;
                    const ratings = item.ratings;

                    let gradeClass = 'bg-danger';
                    if (item.grade === 'A+') gradeClass = 'bg-success';
                    else if (item.grade === 'A') gradeClass = 'bg-success';
                    else if (item.grade === 'B') gradeClass = 'bg-info';
                    else if (item.grade === 'C') gradeClass = 'bg-warning text-dark';
                    else if (item.grade === 'D') gradeClass = 'bg-warning text-dark';

                    const scoreColor = parseFloat(ratings.overall) >= 80 ? 'text-success' : (parseFloat(ratings.overall) >= 60 ? 'text-primary' : 'text-danger');

                    rowsHtml += `
                        <tr>
                            <td class="text-start">
                                <div class="d-flex align-items-center">
                                    <img src="${item.photo || '/img/default-avatar.png'}" class="rounded-circle me-3" width="32" height="32" onerror="this.src='/img/default-avatar.png'">
                                    <div>
                                        <div class="fw-bold text-dark text-uppercase" style="font-size:12px;">${item.name}</div>
                                        <div class="text-muted small" style="font-size:10px;">${item.code} | ${item.designation}</div>
                                    </div>
                                </div>
                            </td>
                            <td><span class="badge bg-light text-dark border" style="font-size:10px;">${item.department}</span></td>
                            <td>
                                <div class="fw-bold">${ratings.attendance}%</div>
                                <div class="progress mt-1" style="height: 4px; width: 60px; margin: 0 auto;">
                                    <div class="progress-bar bg-success" role="progressbar" style="width: ${ratings.attendance}%"></div>
                                </div>
                            </td>
                            <td>
                                <div class="fw-bold">${ratings.punctuality}%</div>
                                <div class="progress mt-1" style="height: 4px; width: 60px; margin: 0 auto;">
                                    <div class="progress-bar bg-info" role="progressbar" style="width: ${ratings.punctuality}%"></div>
                                </div>
                            </td>
                            <td>
                                <div class="fw-bold">${ratings.completion}%</div>
                                <div class="progress mt-1" style="height: 4px; width: 60px; margin: 0 auto;">
                                    <div class="progress-bar bg-primary" role="progressbar" style="width: ${Math.min(ratings.completion, 100)}%"></div>
                                </div>
                            </td>
                            <td><h5 class="mb-0 fw-bold ${scoreColor}" style="font-size: 1.1rem;">${ratings.overall}</h5></td>
                            <td><span class="badge ${gradeClass} px-3 py-2" style="min-width: 45px; font-size: 12px; font-weight: 800;">${item.grade}</span></td>
                            <td class="text-start" style="font-size: 11px; white-space: nowrap;">
                                <div><i class="fas fa-check-circle text-success me-1" style="width: 14px;"></i>Pres: ${stats.daysPresent}</div>
                                <div><i class="fas fa-clock text-warning me-1" style="width: 14px;"></i>Late: ${stats.lates}</div>
                                <div><i class="fas fa-times-circle text-danger me-1" style="width: 14px;"></i>Abs: ${stats.daysAbsent}</div>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="showEmpMonthlyAttendance('${item.code}', '${date}')" title="View Month Log">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                });
                tbody.html(rowsHtml);
            } else {
                tbody.html('<tr><td colspan="9" class="text-center py-5 text-muted">No performance data found for the selected period</td></tr>');
            }
        } catch (error) {
            console.error('Performance Error:', error);
            tbody.html('<tr><td colspan="9" class="text-center text-danger">Error analyzing performance data</td></tr>');
        }
    }

    showHoursDetail(item, srNo) {
        const modal = $('#hoursDetailModal');
        $('#hd_detail_code').text(item.employeeId);

        const fields = [
            { label: 'Sr.No', value: srNo, icon: 'list-ol' },
            { label: 'Employee ID', value: item.employeeId, icon: 'id-card' },
            { label: 'Name', value: item.name, icon: 'user', color: 'primary' },
            { label: 'Department', value: item.department, icon: 'building' },
            { label: 'Designation', value: item.designation, icon: 'briefcase' },
            { label: 'Required Hours', value: item.requiredHours, icon: 'clock', color: 'info' },
            { label: 'Worked Hours', value: item.workedHours, icon: 'walking', color: 'primary' },
            { label: 'Working Days', value: item.workingDays, icon: 'calendar-check' },
            { label: 'Duty Hours', value: item.dutyHours, icon: 'business-time' },
            { label: 'Overtime', value: item.overtime, icon: 'plus-circle', color: parseFloat(item.overtime) > 0 ? 'success' : '' },
            { label: 'Short Hours', value: item.shortHours, icon: 'minus-circle', color: parseFloat(item.shortHours) > 0 ? 'danger' : '' },
            { label: 'Completion %', value: item.completion + '%', icon: 'chart-pie', color: parseFloat(item.completion) >= 90 ? 'success' : (parseFloat(item.completion) >= 50 ? 'warning' : 'danger') },
            { label: 'Status', value: item.status, icon: 'info-circle', color: item.status === 'Present' ? 'success' : (item.status === 'Absent' ? 'danger' : 'warning') },
            { label: 'Progress', value: item.progress || '-', icon: 'tasks', color: (item.progress === 'GOOD' || item.progress === 'EXCELLENT') ? 'success' : (item.progress === 'AVG' ? 'warning' : 'danger') }
        ];

        let html = '';
        fields.forEach(f => {
            const colorClass = f.color ? `text-${f.color} fw-bold` : 'text-dark';
            const bgClass = f.color ? `bg-${f.color}-light` : '';

            html += `
                <div class="col-md-4">
                    <div class="detail-item-card ${bgClass}" style="border-left: 4px solid var(--bs-${f.color || 'secondary'});">
                        <div>
                            <span class="detail-label text-uppercase d-block small"><i class="fas fa-${f.icon} me-1"></i> ${f.label}</span>
                            <span class="detail-value ${colorClass} fs-5">${f.value}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        $('#hoursDetailContent').html(html);
        new bootstrap.Modal(modal[0]).show();
    }

    renderBranchChart(labels, data, isPayroll = false) {
        const chartEl = document.querySelector("#branchSalaryChart");
        if (!chartEl) return;

        const options = {
            series: [{
                name: isPayroll ? 'Total Net Salary' : 'Estimated Basic Salary',
                data: data
            }],
            chart: {
                type: 'bar',
                height: 350,
                toolbar: { show: true }
            },
            plotOptions: {
                bar: {
                    borderRadius: 4,
                    horizontal: false,
                }
            },
            dataLabels: {
                enabled: false
            },
            xaxis: {
                categories: labels,
            },
            colors: ['#1e4c8c']
        };

        chartEl.innerHTML = '';
        const chart = new ApexCharts(chartEl, options);
        chart.render();
    }

    // --- Legacy Archive Implementation ---
    async loadLegacyFilterEmployees() {
        try {
            const select = $('#legacyEmployeeSelect');
            if (!select.length) return;

            const branch = $('#branchFilter').val();
            let url = '/api/v1/employees?limit=3000';
            const branchLower = (branch || '').toLowerCase().trim();
            if (branch && branchLower !== 'all branches' && branchLower !== 'select branch' && branchLower !== 'all') {
                url += `&branch=${encodeURIComponent(branch)}`;
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();

            const currentVal = select.val();
            select.empty().append('<option value="">All Employees / Choose Employee...</option>');

            if (result.success && result.data && result.data.length > 0) {
                const sorted = result.data.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                sorted.forEach(emp => {
                    const branchTag = emp.branch ? ` (${emp.branch})` : '';
                    select.append(`<option value="${emp.code || emp._id}" data-id="${emp._id}" data-code="${emp.code || ''}" data-name="${(emp.name || '').replace(/"/g, '&quot;')}" data-branch="${emp.branch || ''}">${emp.code ? emp.code + ' - ' : ''}${emp.name}${branchTag}</option>`);
                });

                if (currentVal) select.val(currentVal);
            }

            if ($.fn.select2) {
                if (select.hasClass('select2-hidden-accessible')) {
                    select.select2('destroy');
                }
                select.select2({
                    placeholder: "Select Employee...",
                    allowClear: true,
                    width: '100%'
                });
            }
        } catch (error) {
            console.error('Error loading legacy filter employees:', error);
        }
    }

    async loadLegacyArchive(page = 1) {
        const branch = $('#branchFilter').val();
        const selectedEmpVal = $('#legacyEmployeeSelect').val();
        const selectedEmpOpt = $('#legacyEmployeeSelect option:selected');
        const empCode = selectedEmpOpt.data('code') || (/^\d+$/.test(selectedEmpVal) ? selectedEmpVal : '');
        const empId = selectedEmpOpt.data('id');
        const hasSelectedEmp = !!(selectedEmpVal && String(selectedEmpVal).trim());
        const search = $('#legacySearch').val()?.trim() || '';
        let from = $('#legacyFrom').val();
        let to = $('#legacyTo').val();
        const token = localStorage.getItem('token');

        // Force month filters if empty
        if (!from || !to) {
            const dateVal = $('#dateFilter').val();
            const m = dateVal ? moment(dateVal).format('YYYY-MM') : moment().format('YYYY-MM');
            if (!from) { from = m; $('#legacyFrom').val(m); }
            if (!to) { to = m; $('#legacyTo').val(m); }
        }

        const tbody = $('#legacyRecordsBody');
        const mobileContainer = $('#legacyMobileCards');

        if (!tbody.length) return;

        tbody.html('<tr><td colspan="10" class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm me-2"></div>Loading archive...</td></tr>');
        mobileContainer.html('<div class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm"></div></div>');

        try {
            // When specific employee is selected, fetch all their historical records across all months requested (limit 200)
            const limit = hasSelectedEmp ? 200 : 20;
            const params = new URLSearchParams({ 
                page, 
                limit,
                fromMonth: from,
                toMonth: to
            });

            // When searching a specific employee, DO NOT restrict by branch so previous branch records (e.g. Chandni Chowk) show!
            if (hasSelectedEmp) {
                if (empCode) params.append('employeeCode', empCode);
                if (empId) params.append('employeeId', empId);
            } else {
                // Only send branch filter if a specific branch is chosen and no specific employee is selected
                const branchLower = (branch || '').toLowerCase().trim();
                if (branch && branchLower !== 'all branches' && branchLower !== 'select branch' && branchLower !== 'all') {
                    params.append('branch', branch);
                }
                
                if (search) {
                    if (/^\d+$/.test(search)) {
                        params.append('employeeCode', search);
                    } else {
                        params.append('employeeName', search);
                    }
                }
            }

            const res = await fetch(`/api/v1/legacy-payroll?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();

            if (result.success) {
                this.renderLegacyRecords(result.data || []);
                this.renderLegacyPagination(result.page, result.pages, result.total);
                $('#legacyStats').text(`Showing ${result.data.length} of ${result.total} records`);
            }
        } catch (err) {
            console.error('Legacy archive error:', err);
            tbody.html('<tr><td colspan="10" class="text-center text-danger">Failed to load archive</td></tr>');
        }
    }

    renderLegacyRecords(records) {
        const tbody = $('#legacyRecordsBody');
        const mobileContainer = $('#legacyMobileCards');
        tbody.empty();
        mobileContainer.empty();

        if (records.length === 0) {
            const noData = '<div class="text-center py-5 text-muted">No records found matching filters</div>';
            tbody.html(`<tr><td colspan="10" class="text-center py-5 text-muted">${noData}</td></tr>`);
            mobileContainer.html(noData);
            return;
        }

        const fc = (n) => (n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        records.forEach(r => {
            const bankAmt = r.bankPaid || 0;
            const cashAmt = r.cashPaid || 0;
            const paidVia = bankAmt > 0 ? `<span class="badge bg-primary-light text-primary">BANK: ${fc(bankAmt)}</span>` : `<span class="badge bg-success-light text-success">CASH: ${fc(cashAmt)}</span>`;

            // Determine print button: legacy PDF vs new payroll slip
            const isNewPayroll = r.source === 'payroll';
            const printBtn = isNewPayroll
                ? `<button class="btn btn-sm btn-outline-success p-1" onclick="window.open('/print-payroll?id=${r.payrollId}','_blank')" title="Print Payroll Slip"><i class="fas fa-file-invoice"></i></button>`
                : `<button class="btn btn-sm btn-outline-secondary p-1" onclick="window.hrCommander.printLegacySlip('${r.employeeCode}', '${r.monthYear}')" title="PDF Slip"><i class="fas fa-file-pdf"></i></button>`;

            // Source badge to distinguish old vs new records
            const sourceBadge = isNewPayroll
                ? `<span class="badge" style="background:#e0f2fe;color:#0284c7;font-size:0.6rem;">NEW</span>`
                : `<span class="badge" style="background:#f3f4f6;color:#6b7280;font-size:0.6rem;">LEGACY</span>`;

            // Desktop Row
            tbody.append(`
                <tr class="align-middle ${isNewPayroll ? 'table-light' : ''}">
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-primary p-1" onclick="window.hrCommander.viewLegacyHistory('${r.employeeCode}', '${(r.employeeName || '').replace(/'/g, "\\'")}')" title="History"><i class="fas fa-history"></i></button>
                            ${printBtn}
                        </div>
                    </td>
                    <td>
                        <div class="fw-bold text-dark" style="font-size: 0.8rem;">${r.employeeName} ${sourceBadge}</div>
                        <div class="text-muted" style="font-size: 0.7rem;">${r.employeeCode} &bull; ${r.branch || ''}</div>
                    </td>
                    <td class="fw-bold" style="font-size: 0.8rem;">${r.monthYear}</td>
                    <td class="text-end fw-bold">${fc(r.basicSalary)}</td>
                    <td class="text-end">${fc((r.overTime || 0) + (r.monthlyCommission || 0) + (r.warehouseComm || 0))}</td>
                    <td class="text-end">${fc((r.stLessAllowance || 0) + (r.fixAllowance || 0) + (r.otherEarning || r.otherAllowance || 0) + (r.breakfastRoti || 0))}</td>
                    <td class="text-end fw-bold text-dark">${fc(r.grossSalary)}</td>
                    <td class="text-end text-danger">${fc(r.totalDeduction)}</td>
                    <td class="text-end fw-bold text-success" style="background: rgba(16, 185, 129, 0.05);">${fc(r.netSalary)}</td>
                    <td>${paidVia}</td>
                </tr>
            `);

            // Mobile Card
            mobileContainer.append(`
                <div class="card-premium p-3 mb-2 border-0 shadow-sm" style="border-left: 4px solid var(--hr-primary) !important;">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <div class="fw-bold text-dark">${r.employeeName}</div>
                            <div class="text-muted small">${r.employeeCode} &bull; ${r.monthYear}</div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-light border" onclick="window.hrCommander.viewLegacyHistory('${r.employeeCode}', '${r.employeeName.replace(/'/g, "\\'")}')"><i class="fas fa-history"></i></button>
                            <button class="btn btn-sm btn-light border" onclick="window.hrCommander.printLegacySlip('${r.employeeCode}', '${r.monthYear}')"><i class="fas fa-file-pdf"></i></button>
                        </div>
                    </div>
                    <div class="row g-2 mb-2 text-center" style="font-size: 0.75rem;">
                        <div class="col-4 border-end">
                            <div class="text-muted">Gross</div>
                            <div class="fw-bold">${fc(r.grossSalary)}</div>
                        </div>
                        <div class="col-4 border-end">
                            <div class="text-muted text-danger">Ded.</div>
                            <div class="fw-bold text-danger">${fc(r.totalDeduction)}</div>
                        </div>
                        <div class="col-4">
                            <div class="text-muted text-success">NET</div>
                            <div class="fw-bold text-success">${fc(r.netSalary)}</div>
                        </div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-2">
                        <small class="text-muted">${r.branch}</small>
                        ${paidVia}
                    </div>
                </div>
            `);
        });
    }

    renderLegacyPagination(current, total, totalRecords) {
        const container = $('#legacyPagination');
        const info = $('#legacyPaginationInfo');
        container.empty();

        if (total <= 1) {
            info.text(`Showing all ${totalRecords} records`);
            return;
        }

        info.text(`Page ${current} of ${total} (${totalRecords} total records)`);

        const addPage = (p, label, active = false, disabled = false) => {
            container.append(`
                <li class="page-item ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}">
                    <a class="page-link" href="#" onclick="window.hrCommander.loadLegacyArchive(${p}); return false;">${label}</a>
                </li>
            `);
        };

        addPage(current - 1, '<i class="fas fa-chevron-left"></i>', false, current === 1);

        let start = Math.max(1, current - 2);
        let end = Math.min(total, start + 4);
        if (end === total) start = Math.max(1, end - 4);

        for (let i = start; i <= end; i++) {
            addPage(i, i, i === current);
        }

        addPage(current + 1, '<i class="fas fa-chevron-right"></i>', false, current === total);
    }

    async syncLegacyExcel() {
        if (!confirm('Sync data from the latest Excel file? This takes 1-2 minutes.')) return;
        try {
            const res = await fetch('/api/v1/legacy-payroll/process-excel', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const json = await res.json();
            alert(json.success ? '✅ ' + json.message : '❌ ' + json.message);
            if (json.success) this.loadLegacyArchive(1);
        } catch (err) {
            alert('❌ Failed to sync. Check console.');
        }
    }

    exportLegacyArchive() {
        alert('Exporting to Excel... Please wait.');
        // Implementation for export
    }

    async viewLegacyHistory(code, name) {
        const token = localStorage.getItem('token');
        $('#legacyHistoryEmpName').text(`${name} (${code})`);
        const tbody = $('#legacyHistoryBody').html('<tr><td colspan="6" class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm"></div></td></tr>');

        const modal = new bootstrap.Modal(document.getElementById('legacyHistoryModal'));
        modal.show();

        try {
            const res = await fetch(`/api/v1/legacy-payroll/history/${code}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                tbody.empty();
                const fc = (n) => (n || 0).toLocaleString('en-PK');
                json.data.forEach(r => {
                    const isNew   = r.source === 'payroll';
                    const badge   = isNew
                        ? `<span style="background:#e0f2fe;color:#0284c7;font-size:0.6rem;padding:1px 4px;border-radius:3px;font-weight:600;">NEW</span>`
                        : `<span style="background:#f3f4f6;color:#6b7280;font-size:0.6rem;padding:1px 4px;border-radius:3px;">LEGACY</span>`;
                    const printBtn = isNew
                        ? `<button class="btn btn-sm btn-outline-success border" onclick="window.open('/print-payroll?id=${r.payrollId}','_blank')"><i class="fas fa-file-invoice"></i></button>`
                        : `<button class="btn btn-sm btn-light border" onclick="window.hrCommander.printLegacySlip('${r.employeeCode}', '${r.monthYear}')"><i class="fas fa-file-pdf"></i></button>`;
                    tbody.append(`
                        <tr class="align-middle">
                            <td>${r.monthYear} ${badge}</td>
                            <td>${r.branch}</td>
                            <td class="text-end">${fc(r.basicSalary)}</td>
                            <td class="text-end">${fc(r.grossSalary)}</td>
                            <td class="text-end fw-bold text-success">${fc(r.netSalary)}</td>
                            <td class="text-center">${printBtn}</td>
                        </tr>
                    `);
                });
            }
        } catch (err) {
            tbody.html('<tr><td colspan="6" class="text-center text-danger">Failed to load history</td></tr>');
        }
    }

    // Branch-safe: look up the exact record by unique key (employeeCode + monthYear)
    printLegacySlip(code, monthYear) {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({ code, monthYear });
        window.open(`/api/v1/legacy-payroll/view-slip?${params}&token=${token}`, '_blank');
    }
}

$(document).ready(() => { new HRDashboard(); });

// --- Employee Monthly Attendance Modal ---------------------------------------
async function showEmpMonthlyAttendance(empCode, dateStr) {
    const token = localStorage.getItem('token');
    const modal = new bootstrap.Modal(document.getElementById('empMonthlyModal'));
    const modalTitle = document.getElementById('empMonthlyModalTitle');
    const modalBody = document.getElementById('empMonthlyModalBody');

    modalTitle.textContent = 'Loading...';
    modalBody.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Fetching attendance...</p></div>`;
    modal.show();

    try {
        const res = await fetch(`/api/v1/hr-dashboard/employee-monthly?employeeId=${encodeURIComponent(empCode)}&date=${encodeURIComponent(dateStr)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
            modalBody.innerHTML = `<div class="alert alert-danger">Error: ${result.message || 'Failed to load'}</div>`;
            return;
        }

        const emp = result.employee;
        const month = result.month;
        const rows = result.data;

        modalTitle.innerHTML = `<i class="fas fa-calendar-alt me-2 text-primary"></i>${emp.name} (${emp.code}) — ${month}`;

        const parseToHrs = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            if (typeof val === 'number') return val;
            const str = String(val).trim();
            if (str.includes(':')) {
                const [h, m] = str.split(':').map(Number);
                return (h || 0) + ((m || 0) / 60);
            }
            return parseFloat(str) || 0;
        };

        const getRecordHrs = (r) => {
            if (!r) return 0;
            let hrs = parseToHrs(r.totalHrs || r.workedHrs);
            if (hrs <= 0 && r.checkIn && r.checkOut && r.checkOut !== '-' && r.checkOut !== '0:00') {
                try {
                    const start = moment(r.checkIn, ['h:mm A', 'H:mm', 'HH:mm']);
                    let end = moment(r.checkOut, ['h:mm A', 'H:mm', 'HH:mm']);
                    if (end.isBefore(start)) end.add(1, 'day');
                    hrs = end.diff(start, 'hours', true);
                } catch (e) { return 0; }
            }
            return hrs || 0;
        };

        const fmt12 = (t) => {
            if (!t) return '-';
            try {
                return moment(t, ['H:mm', 'HH:mm', 'h:mm A']).format('hh:mm A');
            } catch { return t; }
        };

        // Summary counts
        let present = 0, absent = 0, leave = 0, totalWorked = 0;
        rows.forEach(r => {
            const st = (r.displayStatus || r.status || '').toLowerCase();
            if (st === 'present' || st === 'late' || st === 'half day') {
                present++;
                totalWorked += getRecordHrs(r); // Use getRecordHrs here
            }
            else if (st === 'absent') absent++;
            else if (st === 'leave') leave++;
        });

        const statusBadge = (s) => {
            if (s === 'Present') return '<span class="badge bg-success">Present</span>';
            if (s === 'Absent') return '<span class="badge bg-danger">Absent</span>';
            if (s === 'Leave') return '<span class="badge bg-warning text-dark">Leave</span>';
            return `<span class="badge bg-secondary">${s || '-'}</span>`;
        };

        let tableRows = '';
        if (rows.length === 0) {
            tableRows = `<tr><td colspan="12" class="text-center text-muted py-4">No attendance records for this month</td></tr>`;
        } else {
            rows.forEach((r, i) => {
                const d = r.date ? moment(r.date).format('DD/MM/YYYY') : '-';
                const day = r.day || (r.date ? moment(r.date).format('dddd') : '-');
                const isSun = day === 'Sunday';
                const st = r.displayStatus || r.status || '-';

                tableRows += `
                    <tr class="${isSun ? 'table-secondary text-muted' : ''}">
                        <td>${i + 1}</td>
                        <td>${d}</td>
                        <td>${day}</td>
                        <td class="text-muted">${r.dutyHrs || '-'}</td>
                        <td class="fw-bold text-primary">${fmt12(r.checkIn)}</td>
                        <td class="fw-bold text-danger">${fmt12(r.checkOut)}</td>
                        <td>${(r.totalHrs || 0).toFixed(2)}</td>
                        <td class="text-success">${r.otHrs || '0.00'}</td>
                        <td class="fw-bold text-success">${(r.otRs || 0).toLocaleString()}</td>
                        <td class="text-danger">${r.stHrs || '0.00'}</td>
                        <td class="fw-bold text-danger">${(r.stRs || 0).toLocaleString()}</td>
                        <td>${statusBadge(st)}</td>
                    </tr>`;
            });
        }

        modalBody.innerHTML = `
            <!-- Employee Info -->
            <div class="d-flex align-items-center mb-3 p-3 bg-light rounded">
                <img src="${emp.photo || '/img/default-avatar.png'}" class="rounded-circle me-3" width="52" height="52"
                    onerror="this.src='/img/default-avatar.png'" style="object-fit:cover;border:2px solid #dee2e6;">
                <div>
                    <h6 class="mb-0 fw-bold">${emp.name}</h6>
                    <small class="text-muted">${emp.designation} | ${emp.department} | ${emp.branch}</small>
                </div>
                <div class="ms-auto d-flex gap-2">
                    <span class="badge bg-success fs-6 px-3">? ${present} Present</span>
                    <span class="badge bg-danger fs-6 px-3">? ${absent} Absent</span>
                    <span class="badge bg-warning text-dark fs-6 px-3">? ${leave} Leave</span>
                </div>
            </div>
            <!-- Table -->
            <div class="table-responsive" style="max-height:420px;overflow-y:auto;">
                <table class="table table-sm table-bordered table-hover align-middle mb-0" style="font-size:13px;">
                    <thead class="table-dark sticky-top">
                        <tr>
                            <th>#</th>
                            <th>Date</th>
                            <th>Day</th>
                            <th>Duty Hrs</th>
                            <th>Check In</th>
                            <th>Check Out</th>
                            <th>Total Hrs</th>
                            <th>OT Hrs</th>
                            <th>OT Rs</th>
                            <th>ST Hrs</th>
                            <th>ST Rs</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            <div class="mt-2 text-end text-muted small">
                Total Days: <strong>${rows.length}</strong> &nbsp;|&nbsp;
                Total Worked Hours: <strong>${totalWorked.toFixed(2)} hrs</strong>
            </div>`;
    } catch (err) {
        console.error('Monthly attendance error:', err);
        modalBody.innerHTML = `<div class="alert alert-danger">Failed to load attendance data. Please try again.</div>`;
    }
}
// --- Employee Advance Ledger Modal -------------------------------------------
function showAdvanceLedger(empCode, empName) {
    // Set employee info and reset dates to current month
    const today = new Date();
    const firstDay = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-01';
    const lastDay = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    document.getElementById('advLedgerEmpCode').value = empCode;
    document.getElementById('advLedgerEmpName').textContent = empName;
    document.getElementById('advLedgerFrom').value = firstDay;
    document.getElementById('advLedgerTo').value = lastDay;
    document.getElementById('advLedgerBody').innerHTML = '<div class="text-center py-4 text-muted">Set date range and click <strong>Load Ledger</strong></div>';

    const modal = new bootstrap.Modal(document.getElementById('advanceLedgerModal'));
    modal.show();
}

async function loadAdvanceLedger() {
    const empCode = document.getElementById('advLedgerEmpCode').value;
    const fromDate = document.getElementById('advLedgerFrom').value;
    const toDate = document.getElementById('advLedgerTo').value;
    const token = localStorage.getItem('token');
    const body = document.getElementById('advLedgerBody');

    if (!fromDate || !toDate) { alert('Please select both From and To dates.'); return; }

    body.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Loading ledger...</p></div>';

    try {
        const res = await fetch(`/api/v1/hr-dashboard/advance-ledger?employeeCode=${encodeURIComponent(empCode)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
            body.innerHTML = `<div class="alert alert-danger">${result.message || 'Failed to load ledger'}</div>`;
            return;
        }

        const emp = result.employee;
        const sum = result.summary;
        const rows = result.data;

        let tableRows = '';
        if (rows.length === 0) {
            tableRows = `<tr><td colspan="6" class="text-center text-muted py-4">No advance transactions found in this date range</td></tr>`;
        } else {
            // Opening row
            tableRows += `<tr class="table-light fw-bold">
                <td colspan="2">Opening Balance</td>
                <td></td><td></td><td></td>
                <td class="text-primary fw-bold">${(emp.openingBalance || 0).toLocaleString()}</td>
            </tr>`;
            rows.forEach((r, i) => {
                const typeColor = r.type === 'Pay' ? 'text-danger' : 'text-success';
                const typeLabel = r.type === 'Pay' ? 'Advance Pay' : 'Advance Received';
                tableRows += `<tr>
                    <td>${i + 1}</td>
                    <td>${r.date}</td>
                    <td><span class="badge ${r.type === 'Pay' ? 'bg-danger' : 'bg-success'}">${typeLabel}</span></td>
                    <td class="text-danger fw-bold">${r.debit > 0 ? r.debit.toLocaleString() : '-'}</td>
                    <td class="text-success fw-bold">${r.credit > 0 ? r.credit.toLocaleString() : '-'}</td>
                    <td class="fw-bold ${r.balance > 0 ? 'text-danger' : 'text-success'}">${r.balance.toLocaleString()}</td>
                </tr>`;
            });
        }

        body.innerHTML = `
            <div class="d-flex align-items-center mb-3 p-3 bg-light rounded">
                <img src="${emp.photo || '/img/default-avatar.png'}" class="rounded-circle me-3" width="48" height="48"
                    onerror="this.src='/img/default-avatar.png'" style="object-fit:cover;border:2px solid #dee2e6;">
                <div>
                    <h6 class="mb-0 fw-bold">${emp.name} <span class="text-muted fw-normal">(${emp.code})</span></h6>
                    <small class="text-muted">${emp.designation} | ${emp.department} | ${emp.branch}</small>
                </div>
                <div class="ms-auto d-flex gap-2 flex-wrap text-end">
                    <div class="border rounded px-3 py-1">
                        <small class="text-muted d-block">Total Advance Pay</small>
                        <span class="fw-bold text-danger">${sum.totalPay.toLocaleString()}</span>
                    </div>
                    <div class="border rounded px-3 py-1">
                        <small class="text-muted d-block">Total Received</small>
                        <span class="fw-bold text-success">${sum.totalReceived.toLocaleString()}</span>
                    </div>
                    <div class="border rounded px-3 py-1 bg-primary text-white">
                        <small class="d-block" style="opacity:.8">Closing Balance</small>
                        <span class="fw-bold">${sum.closingBalance.toLocaleString()}</span>
                    </div>
                </div>
            </div>
            <div class="table-responsive" style="max-height:380px;overflow-y:auto;">
                <table class="table table-sm table-bordered table-hover align-middle mb-0" style="font-size:13px;">
                    <thead class="table-dark sticky-top">
                        <tr>
                            <th>#</th>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Debit (Pay)</th>
                            <th>Credit (Received)</th>
                            <th>Balance</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                    <tfoot class="table-secondary fw-bold">
                        <tr>
                            <td colspan="3" class="text-end">Totals:</td>
                            <td class="text-danger">${sum.totalPay.toLocaleString()}</td>
                            <td class="text-success">${sum.totalReceived.toLocaleString()}</td>
                            <td class="${sum.closingBalance > 0 ? 'text-danger' : 'text-success'}">${sum.closingBalance.toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
    } catch (err) {
        console.error('Advance ledger error:', err);
        body.innerHTML = `<div class="alert alert-danger">Failed to load advance ledger. Please try again.</div>`;
    }
}
