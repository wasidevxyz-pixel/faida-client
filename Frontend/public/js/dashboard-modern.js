/**
 * BW Software Agency - Modern 3D Animated Dashboard Controller
 * Pure 3D Showcase Experience (No operational data tables, No transaction links)
 * Mouse Parallax, Ambient Cursor Glow, Theme Engine, Live Clock, Sidebar Sync.
 * Designed for Bilal Shah.
 */
(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const rootEl = document.getElementById('basModernDashboardRoot');
    const themeDarkBtn = document.getElementById('dashThemeDarkBtn');
    const themeLightBtn = document.getElementById('dashThemeLightBtn');
    const liveClockEl = document.getElementById('dashLiveClock');
    const userNameEl = document.getElementById('dashUserName');
    const userRoleEl = document.getElementById('dashUserRole');
    const userAvatarEl = document.getElementById('dashUserAvatar');
    const branchNameEl = document.getElementById('dashBranchName');
    const menuToggleBtn = document.getElementById('dashMenuToggleBtn');
    const searchInput = document.getElementById('dashSearchInput');
    const scene3d = document.getElementById('basMain3dScene');
    const cursorGlow = document.getElementById('basDashCursorGlow');

    // =========================================================================
    // 1. Theme Management (Dark & Light) with Sidebar Sync
    // =========================================================================
    const THEME_KEY = 'bas_dashboard_theme_v2';

    function applyTheme(theme) {
      if (!rootEl) return;
      if (theme === 'light') {
        rootEl.classList.remove('theme-dark');
        rootEl.classList.add('theme-light');
        if (themeLightBtn) themeLightBtn.classList.add('active');
        if (themeDarkBtn) themeDarkBtn.classList.remove('active');
      } else {
        rootEl.classList.remove('theme-light');
        rootEl.classList.add('theme-dark');
        if (themeDarkBtn) themeDarkBtn.classList.add('active');
        if (themeLightBtn) themeLightBtn.classList.remove('active');
      }

      // Ensure sidebar always retains the executive dark theme on /main
      const sidebarEl = document.getElementById('sidebar');
      if (sidebarEl) {
        sidebarEl.style.backgroundColor = '#071022';
      }

      try {
        localStorage.setItem(THEME_KEY, theme);
        // Clean up legacy global key so other pages never get affected
        localStorage.removeItem('bas_dashboard_theme');
      } catch (e) { /* ignore */ }
    }

    let savedTheme = 'dark';
    try {
      savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    } catch (e) {
      savedTheme = 'dark';
    }
    applyTheme(savedTheme);

    if (themeDarkBtn) themeDarkBtn.addEventListener('click', () => applyTheme('dark'));
    if (themeLightBtn) themeLightBtn.addEventListener('click', () => applyTheme('light'));

    // =========================================================================
    // 2. Real-Time Live Clock Ticker
    // =========================================================================
    function updateClock() {
      if (!liveClockEl) return;
      const now = new Date();
      const optionsDate = { month: 'short', day: 'numeric', year: 'numeric' };
      const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: true };
      
      const dateStr = now.toLocaleDateString('en-US', optionsDate);
      const timeStr = now.toLocaleTimeString('en-US', optionsTime);

      liveClockEl.innerHTML = `<i class="fas fa-calendar-alt" style="color: #ffffff !important;"></i> <span style="color: #ffffff !important; font-weight: 700;">${dateStr}</span> <span class="mx-1" style="color: rgba(255,255,255,0.5) !important;">|</span> <i class="far fa-clock ms-1" style="color: #ffffff !important;"></i> <span style="color: #ffffff !important; font-weight: 700;">${timeStr}</span>`;
    }
    updateClock();
    setInterval(updateClock, 1000);

    // =========================================================================
    // 3. User Profile & Dynamic Recent Screens Renderer
    // =========================================================================
    let currentUser = {};
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        currentUser = JSON.parse(userStr);
      }
    } catch (e) {
      currentUser = {};
    }

    const userName = currentUser.name || 'Bilal Shah';
    if (userNameEl) {
      userNameEl.textContent = userName;
      userNameEl.style.setProperty('color', '#ffffff', 'important');
    }

    const terminalUserNameEl = document.getElementById('dashTerminalUserName');
    if (terminalUserNameEl) {
      terminalUserNameEl.textContent = userName;
    }

    if (userRoleEl) {
      userRoleEl.textContent = currentUser.role || 'Administrator';
      userRoleEl.style.setProperty('color', '#00d4ff', 'important');
    }
    if (userAvatarEl && userName) {
      userAvatarEl.textContent = userName.charAt(0).toUpperCase();
    }
    
    // Hide branch name indicator per user request
    if (branchNameEl) {
      branchNameEl.style.setProperty('display', 'none', 'important');
    }

    // Render Recent User Activity Screens inside 3D Terminal
    function renderRecentScreens(user) {
      const container = document.getElementById('dashRecentScreensList');
      if (!container) return;

      const userKey = (user && (user.username || user._id || user.name) || 'default').toLowerCase().replace(/\s+/g, '_');
      const storageKey = `bas_recent_screens_${userKey}`;
      
      let screens = [];
      try {
        screens = JSON.parse(localStorage.getItem(storageKey) || '[]');
      } catch(e) { screens = []; }

      // Default smart screens for Bilal Shah / Admin if no history yet
      const defaultScreens = [
        { path: '/wh-sale', title: 'Whole Sale Entry', icon: 'fas fa-boxes-packing', category: 'Sales & Invoicing' },
        { path: '/payment-vouchers', title: 'Payment Vouchers', icon: 'fas fa-file-invoice-dollar', category: 'Accounts & Ledger' },
        { path: '/wh-stock-audit', title: 'WH Stock Audit', icon: 'fas fa-clipboard-check', category: 'Inventory Audit' },
        { path: '/closing-sheet', title: 'Closing Sheet', icon: 'fas fa-cash-register', category: 'Daily Reconciliation' }
      ];

      // Merge defaults if user has fewer than 4 recent visits
      const mergedScreens = Array.isArray(screens) && screens.length > 0 ? screens : [];
      defaultScreens.forEach(def => {
        if (mergedScreens.length < 4 && !mergedScreens.some(s => s.path === def.path)) {
          mergedScreens.push(def);
        }
      });

      const displayList = mergedScreens.slice(0, 4);

      container.innerHTML = displayList.map(s => `
        <a href="${s.path}" class="bas-recent-screen-card" title="Open ${s.title}">
          <div class="bas-recent-card-icon">
            <i class="${s.icon || 'fas fa-window-maximize'}"></i>
          </div>
          <div class="bas-recent-card-meta">
            <span class="bas-recent-card-title">${s.title}</span>
            <span class="bas-recent-card-sub">${s.category || 'Quick Launch'}</span>
          </div>
          <i class="fas fa-arrow-up-right-from-square bas-recent-card-arrow"></i>
        </a>
      `).join('');
    }

    renderRecentScreens(currentUser);


    // =========================================================================
    // 4. Sidebar Toggle Integration
    // =========================================================================
    if (menuToggleBtn) {
      menuToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.sidebarNavInstance && typeof window.sidebarNavInstance.toggleSidebarMode === 'function') {
          window.sidebarNavInstance.toggleSidebarMode();
        } else {
          document.body.classList.toggle('sidebar-full');
          document.body.classList.toggle('sidebar-mini');
        }
      });
    }

    // =========================================================================
    // 5. Permission-Guarded Fast Spotlight Search
    // =========================================================================
    const searchDropdown = document.getElementById('dashSearchDropdown');
    const searchClearBtn = document.getElementById('dashSearchClearBtn');
    const searchKbdHint = document.getElementById('dashSearchKbdHint');
    let searchActiveIndex = -1;
    let searchDebounceTimer = null;

    // Helper to escape HTML and prevent XSS
    function escapeHtml(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Comprehensive catalog of ERP screens with permission keys & keywords
    const DASHBOARD_SCREENS_CATALOG = [
      // Warehouse & Inventory
      { title: 'Whole Sale Entry', path: '/wh-sale', category: 'Warehouse & Sales', icon: 'fas fa-boxes-packing', permission: 'wh_sale', keywords: 'wholesale sale invoice billing dispatch b2b order' },
      { title: 'WH Sale Return', path: '/wh-sale-return', category: 'Warehouse & Sales', icon: 'fas fa-rotate-left', permission: 'wh_sale_return', keywords: 'wholesale sale return credit note item return b2b' },
      { title: 'WH Purchase', path: '/wh-purchase', category: 'Warehouse & Procurement', icon: 'fas fa-truck-ramp-box', permission: 'wh_purchase', keywords: 'purchase bill supplier stock in goods procurement' },
      { title: 'WH Purchase Return', path: '/wh-purchase-return', category: 'Warehouse & Procurement', icon: 'fas fa-reply', permission: 'wh_purchase_return', keywords: 'purchase return debit note supplier vendor return' },
      { title: 'WH Item Registration', path: '/wh-item', category: 'Warehouse & Items', icon: 'fas fa-tags', permission: 'wh_item', keywords: 'new item create product barcode rate wh item master' },
      { title: 'WH Item Ledger', path: '/wh-item-ledger-report', category: 'Warehouse Reports', icon: 'fas fa-list-alt', permission: 'wh_item_ledger_rpt', keywords: 'item ledger history card stock in out balance movements' },
      { title: 'WH Stock In Hand', path: '/wh-stock-in-hand-report', category: 'Warehouse Reports', icon: 'fas fa-warehouse', permission: 'wh_item', keywords: 'current stock quantity available warehouse inventory in hand' },
      { title: 'WH Stock Audit', path: '/wh-stock-audit', category: 'Warehouse Audit', icon: 'fas fa-clipboard-check', permission: 'wh_stock_audit', keywords: 'audit stock count physical adjust set stock discrepancy' },
      { title: 'WH Customer Registration', path: '/wh-customer', category: 'Warehouse Parties', icon: 'fas fa-user-tag', permission: 'wh_customer', keywords: 'customer client party credit khata buyers' },
      { title: 'WH Customer Payment', path: '/wh-customer-payment', category: 'Warehouse Payments', icon: 'fas fa-money-bill-transfer', permission: 'wh_customer_payment', keywords: 'customer payment cash receipt khata recovery' },
      { title: 'WH Supplier Registration', path: '/wh-supplier', category: 'Warehouse Parties', icon: 'fas fa-people-carry-box', permission: 'wh_supplier', keywords: 'supplier vendor distributor company dealers' },
      { title: 'WH Customer Ledger', path: '/wh-customer-ledger-report', category: 'Warehouse Reports', icon: 'fas fa-file-invoice-dollar', permission: 'wh_customer_ledger_rpt', keywords: 'customer ledger balance statement payment khata receivables' },
      { title: 'WH Supplier Ledger', path: '/wh-supplier-ledger-report', category: 'Warehouse Reports', icon: 'fas fa-receipt', permission: 'wh_supplier_ledger_rpt', keywords: 'supplier ledger balance statement payable vendor' },
      { title: 'Barcode Printing', path: '/wh-barcode', category: 'Warehouse Tools', icon: 'fas fa-barcode', permission: 'wh_barcode_print', keywords: 'barcode sticker print label thermal a4 tags' },

      // Retail POS & Sales
      { title: 'POS Sale', path: '/pos-sale', category: 'Warehouse & Sales', icon: 'fas fa-cash-register', permission: 'wh_pos_sale', keywords: 'pos billing counter retail sale cash slip walk-in barcode scanner' },
      { title: 'Retail Items', path: '/items', category: 'Retail Inventory', icon: 'fas fa-box', permission: 'items', keywords: 'retail items pharmacy products medicine price' },
      { title: 'New Sale', path: '/sales', category: 'Retail Operations', icon: 'fas fa-cart-shopping', permission: 'new_sale', keywords: 'new sale retail invoice counter bill' },
      { title: 'Sales Return', path: '/sale-returns', category: 'Retail Operations', icon: 'fas fa-arrow-rotate-left', permission: 'sale_returns', keywords: 'sales return retail refund item back' },
      { title: 'Sales Report', path: '/sales-report', category: 'Sales Reports', icon: 'fas fa-chart-line', permission: 'sales_report', keywords: 'daily sales summary report profit revenue' },
      { title: 'Customer Demand', path: '/customer-demand', category: 'Sales & Orders', icon: 'fas fa-clipboard-list', permission: 'customer_demand', keywords: 'customer demand order booking requirement' },

      // Accounts & Finance
      { title: 'Payment Vouchers', path: '/payment-vouchers', category: 'Accounts & Finance', icon: 'fas fa-money-bill-wave', permission: 'pv_supplier', keywords: 'payment voucher supplier category pay expense vouchers' },
      { title: 'Expenses Entry', path: '/expenses', category: 'Accounts & Finance', icon: 'fas fa-receipt', permission: 'expenses', keywords: 'expense utility bills office petty cash expenditure costs' },
      { title: 'Account Register', path: '/accounts', category: 'Accounts & Ledgers', icon: 'fas fa-book-journal-whills', permission: 'account_register', keywords: 'chart of accounts general ledger trial balance chart banking' },
      { title: 'Bank Management', path: '/bank-management', category: 'Banking', icon: 'fas fa-building-columns', permission: 'bank_management', keywords: 'bank accounts deposit withdrawal cheque clearing' },
      { title: 'Bank Ledger', path: '/bank-ledger', category: 'Banking', icon: 'fas fa-book', permission: ['banks', 'bank_management', 'bank_ledger_link'], keywords: 'bank ledger statement transaction passbook' },
      { title: 'Daily Cash Book', path: '/daily-cash', category: 'Cash & Banking', icon: 'fas fa-vault', permission: 'daily_cash', keywords: 'daily cash register closing drawer cash in hand register' },
      { title: 'Cash Counter', path: '/cash-counter', category: 'Cash & Banking', icon: 'fas fa-money-bill-1', permission: 'cash_counter', keywords: 'cash counter register drawer' },
      { title: 'Closing Sheet', path: '/closing-sheet', category: 'Reconciliation', icon: 'fas fa-calculator', permission: 'closing_sheet', keywords: 'day end closing cash shift counter reconciliation' },
      { title: 'Profit & Loss Report', path: '/profit-loss-report', category: 'Financial Reports', icon: 'fas fa-scale-balanced', permission: 'profit_loss_report', keywords: 'pnl profit loss financial statement net revenue balance sheet' },

      // HR, Biometric & Attendance
      { title: 'Attendance Register', path: '/attendance-list', category: 'HR & Attendance', icon: 'fas fa-clipboard-user', permission: 'attendance', keywords: 'attendance attendace attandance attandence register attendance-list registered list employee attendance punch log daily check in out sheet present absent' },
      { title: 'Biometric Attendance Report', path: '/employee-attendance-report', category: 'HR Reports', icon: 'fas fa-fingerprint', permission: ['attendance', 'emp_attendance_rpt_link', 'attendance_report'], keywords: 'attendance attendace attandance report employee biometric attendance sheet punch monthly attendance late absent' },
      { title: 'Employee Schedule & Timings', path: '/employee-schedule-report', category: 'HR Reports', icon: 'fas fa-business-time', permission: ['attendance', 'emp_schedule_report_link'], keywords: 'employee schedule attendance attendace duty roster timings timings report shift check in' },
      { title: 'Import Attendance', path: '/import-attendance', category: 'HR Tools', icon: 'fas fa-file-import', permission: 'attendance', keywords: 'import attendance attendace excel upload device biometric punch csv file' },
      { title: 'HR Dashboard', path: '/hr-dashboard', category: 'Human Resources', icon: 'fas fa-id-badge', permission: 'hr_dashboard', keywords: 'hr employee staff biometric overview attendance summary analytics' },
      { title: 'Employee Registration', path: '/employee-registration', category: 'HR & Staff', icon: 'fas fa-user-plus', permission: 'employee_registration', keywords: 'employee registration staff add hire new worker' },
      { title: 'Employee Directory', path: '/employee-list', category: 'HR & Staff', icon: 'fas fa-users', permission: 'employee_registration', keywords: 'employee list staff directory employees active staff' },
      { title: 'Employee Advance', path: '/employee-advance', category: 'HR & Staff', icon: 'fas fa-hand-holding-dollar', permission: 'employee_advance', keywords: 'employee advance loan salary advance payment' },
      { title: 'Monthly Payroll', path: '/payroll', category: 'HR & Payroll', icon: 'fas fa-money-check-dollar', permission: ['payroll', 'monthly_payroll'], keywords: 'salaries payslip payroll disbursement wage monthly pay' },
      { title: 'Salaries List Record', path: '/legacy-payroll', category: 'HR & Payroll', icon: 'fas fa-receipt', permission: 'legacy_payroll_archive', keywords: 'salaries list record legacy payroll archive salary register history' },

      // Administration & System Security (STRICT PERMISSIONS)
      { title: 'User Management', path: '/users', category: 'System Administration', icon: 'fas fa-users-cog', permission: 'users', keywords: 'users add user password roles create user security' },
      { title: 'Group Rights & Permissions', path: '/groups', category: 'System Security', icon: 'fas fa-shield-halved', permission: 'groups', keywords: 'permissions rights access control security group role roles privilege' },
      { title: 'Actions Tracker & Audit Log', path: '/actions-tracker', category: 'Audit Trail', icon: 'fas fa-user-clock', permission: 'actions_tracker_link', keywords: 'audit log action tracker user activity history logs delete audit' },
      { title: 'Stores & Branches', path: '/stores', category: 'System Setup', icon: 'fas fa-store', permission: 'stores', keywords: 'stores warehouse locations branch setup shop outlets' },
      { title: 'Download Center', path: '/download-center', category: 'Tools & Utilities', icon: 'fas fa-cloud-arrow-down', permission: '', keywords: 'download center exports reports zip files' }
    ];

    // STRICT PERMISSION CHECK: Only show screens explicitly granted to currentUser
    function hasScreenAccess(perm, user) {
      if (!perm) return true;
      if (!user) return false;
      const role = String(user.role || '').toLowerCase();
      if (role === 'admin' || role === 'administrator' || role === 'superadmin' || user.isAdmin === true) return true;
      const rights = user.rights || {};
      if (Array.isArray(perm)) {
        return perm.some(p => rights[p] === true || rights[p] === 'true');
      }
      return rights[perm] === true || rights[perm] === 'true';
    }

    // Check if user has permission to search live items
    function canAccessItems(user) {
      if (!user) return false;
      const role = String(user.role || '').toLowerCase();
      if (role === 'admin' || role === 'administrator' || role === 'superadmin' || user.isAdmin === true) return true;
      const itemPerms = ['wh_item', 'wh_sale', 'wh_purchase', 'items', 'wh_item_ledger_rpt'];
      return itemPerms.some(p => hasScreenAccess(p, user));
    }

    // Check if user has permission to search live customers
    function canAccessCustomers(user) {
      if (!user) return false;
      const role = String(user.role || '').toLowerCase();
      if (role === 'admin' || role === 'administrator' || role === 'superadmin' || user.isAdmin === true) return true;
      const custPerms = ['wh_customer', 'wh_sale', 'wh_customer_ledger_rpt'];
      return custPerms.some(p => hasScreenAccess(p, user));
    }

    function renderSearchResults({ screens = [], items = [], customers = [], isQuickLaunch = false }) {
      if (!searchDropdown) return;
      let html = '';
      let itemCounter = 0;

      if (isQuickLaunch) {
        html += `<div class="bas-dash-search-section-header"><span><i class="fas fa-bolt text-warning me-1"></i> Quick Launch</span></div>`;
      } else if (screens.length > 0) {
        html += `<div class="bas-dash-search-section-header"><span><i class="fas fa-compass text-primary me-1"></i> System Screens (${screens.length})</span></div>`;
      }

      screens.forEach(s => {
        html += `
          <a href="${s.path}" class="bas-dash-search-item" data-index="${itemCounter++}">
            <div class="item-icon">
              <i class="${s.icon}"></i>
            </div>
            <div class="item-info">
              <span class="item-title">${escapeHtml(s.title)}</span>
              <span class="item-sub">${escapeHtml(s.category)}</span>
            </div>
            <i class="fas fa-arrow-right item-arrow"></i>
          </a>
        `;
      });

      if (items && items.length > 0) {
        html += `<div class="bas-dash-search-section-header"><span><i class="fas fa-box text-success me-1"></i> Live Products / Inventory (${items.length})</span></div>`;
        items.forEach(it => {
          const code = it.itemsCode || it.code || it.barcode || '';
          const stock = it.stock !== undefined ? it.stock : (it.availableStock ?? 0);
          const rate = it.salePrice || it.retailPrice || 0;
          let targetPath = `/wh-item-ledger-report?itemId=${it._id}`;
          if (!hasScreenAccess('wh_item_ledger_rpt', currentUser) && hasScreenAccess('wh_sale', currentUser)) {
            targetPath = `/wh-sale`;
          }
          html += `
            <a href="${targetPath}" class="bas-dash-search-item" data-index="${itemCounter++}">
              <div class="item-icon" style="background: #ecfdf5; color: #059669;">
                <i class="fas fa-box-open"></i>
              </div>
              <div class="item-info">
                <span class="item-title">${escapeHtml(it.name || 'Unnamed Item')}</span>
                <span class="item-sub">Code: ${escapeHtml(code)} &bull; Rate: Rs. ${rate}</span>
              </div>
              <span class="bas-dash-search-badge badge-stock">Stock: ${stock}</span>
              <i class="fas fa-arrow-right item-arrow ms-2"></i>
            </a>
          `;
        });
      }

      if (customers && customers.length > 0) {
        html += `<div class="bas-dash-search-section-header"><span><i class="fas fa-users text-info me-1"></i> Customers (${customers.length})</span></div>`;
        customers.forEach(c => {
          const targetPath = `/wh-customer-ledger-report?customerId=${c._id}`;
          html += `
            <a href="${targetPath}" class="bas-dash-search-item" data-index="${itemCounter++}">
              <div class="item-icon" style="background: #eff6ff; color: #2563eb;">
                <i class="fas fa-user-check"></i>
              </div>
              <div class="item-info">
                <span class="item-title">${escapeHtml(c.name || 'Unnamed Customer')}</span>
                <span class="item-sub">Code: ${escapeHtml(c.code || '')} &bull; ${escapeHtml(c.phone || c.city || 'Wholesale Khata')}</span>
              </div>
              <span class="bas-dash-search-badge">Account</span>
              <i class="fas fa-arrow-right item-arrow ms-2"></i>
            </a>
          `;
        });
      }

      if (itemCounter === 0) {
        html = `
          <div class="p-3 text-center text-muted" style="font-size: 0.85rem;">
            <i class="fas fa-search me-1 opacity-50"></i> No accessible records found
          </div>
        `;
      } else {
        html += `
          <div class="bas-dash-search-footer">
            <span><kbd>&uarr;&darr;</kbd> Navigate</span>
            <span><kbd>&crarr; Enter</kbd> Open</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
        `;
      }

      searchDropdown.innerHTML = html;
      searchDropdown.style.display = 'block';
      searchActiveIndex = -1;
    }

    function showQuickLaunch() {
      if (!searchDropdown) return;
      const allowed = DASHBOARD_SCREENS_CATALOG.filter(s => hasScreenAccess(s.permission, currentUser));
      const quickScreens = allowed.slice(0, 6);
      renderSearchResults({
        screens: quickScreens,
        items: [],
        customers: [],
        isQuickLaunch: true
      });
    }

    function performSearch(query) {
      const trimmed = (query || '').trim();
      if (!trimmed) {
        showQuickLaunch();
        return;
      }

      const q = trimmed.toLowerCase();
      // Filter screens strictly with permissions
      const matchedScreens = DASHBOARD_SCREENS_CATALOG.filter(s => {
        if (!hasScreenAccess(s.permission, currentUser)) return false;
        return s.title.toLowerCase().includes(q) ||
               s.category.toLowerCase().includes(q) ||
               (s.keywords && s.keywords.toLowerCase().includes(q));
      }).slice(0, 10); // Show up to 10 matching screens

      // Render initial matching screens immediately
      renderSearchResults({
        screens: matchedScreens,
        items: [],
        customers: [],
        isQuickLaunch: false
      });

      // If query is >= 2 chars, debounced live lookup for items and customers (STRICT PERMISSIONS)
      clearTimeout(searchDebounceTimer);
      if (trimmed.length >= 2 && (canAccessItems(currentUser) || canAccessCustomers(currentUser))) {
        searchDebounceTimer = setTimeout(async () => {
          if (!searchInput || searchInput.value.trim() !== trimmed) return;

          let fetchedItems = [];
          let fetchedCustomers = [];

          try {
            const fetchPromises = [];
            if (canAccessItems(currentUser)) {
              fetchPromises.push(
                fetch(`/api/v1/wh-items?search=${encodeURIComponent(trimmed)}&limit=3`)
                  .then(r => r.ok ? r.json() : { success: false, data: [] })
                  .then(res => {
                    if (res.success && Array.isArray(res.data)) fetchedItems = res.data;
                  })
                  .catch(() => {})
              );
            }
            if (canAccessCustomers(currentUser)) {
              fetchPromises.push(
                fetch(`/api/v1/wh-customers?search=${encodeURIComponent(trimmed)}&limit=2`)
                  .then(r => r.ok ? r.json() : { success: false, data: [] })
                  .then(res => {
                    if (res.success && Array.isArray(res.data)) fetchedCustomers = res.data;
                  })
                  .catch(() => {})
              );
            }

            await Promise.all(fetchPromises);

            if (!searchInput || searchInput.value.trim() !== trimmed) return;

            renderSearchResults({
              screens: matchedScreens,
              items: fetchedItems,
              customers: fetchedCustomers,
              isQuickLaunch: false
            });
          } catch (err) {
            console.error('Search lookup error:', err);
          }
        }, 250);
      }
    }

    if (searchInput) {
      // Focus event: if empty, show Quick Launch
      searchInput.addEventListener('focus', () => {
        if (!searchInput.value.trim()) {
          showQuickLaunch();
        } else {
          performSearch(searchInput.value);
        }
      });

      searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (searchClearBtn && searchKbdHint) {
          if (val.length > 0) {
            searchClearBtn.style.display = 'flex';
            searchKbdHint.style.display = 'none';
          } else {
            searchClearBtn.style.display = 'none';
            searchKbdHint.style.display = 'block';
          }
        }
        performSearch(val);

        // Also sync with sidebar if open
        const sidebarLinks = document.querySelectorAll('#sidebar .nav-item, .sidebar-container .nav-item');
        if (sidebarLinks.length) {
          if (!val.trim()) {
            sidebarLinks.forEach(item => item.style.removeProperty('display'));
          } else {
            const q = val.trim().toLowerCase();
            sidebarLinks.forEach(item => {
              const text = item.textContent.toLowerCase();
              if (text.includes(q)) item.style.removeProperty('display');
              else item.style.setProperty('display', 'none', 'important');
            });
          }
        }
      });

      if (searchClearBtn) {
        searchClearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          searchInput.value = '';
          searchClearBtn.style.display = 'none';
          if (searchKbdHint) searchKbdHint.style.display = 'block';
          searchInput.focus();
          showQuickLaunch();
        });
      }

      // Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
      searchInput.addEventListener('keydown', (e) => {
        if (!searchDropdown || searchDropdown.style.display === 'none') return;
        const items = searchDropdown.querySelectorAll('.bas-dash-search-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          searchActiveIndex = Math.min(searchActiveIndex + 1, items.length - 1);
          updateDropdownFocus(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          searchActiveIndex = Math.max(searchActiveIndex - 1, 0);
          updateDropdownFocus(items);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (searchActiveIndex > -1 && items[searchActiveIndex]) {
            items[searchActiveIndex].click();
          } else if (items.length > 0) {
            items[0].click();
          }
        } else if (e.key === 'Escape') {
          searchDropdown.style.display = 'none';
          searchInput.blur();
        }
      });

      // Global hotkey: Pressing "/" or "Ctrl+K" focuses the search bar from anywhere on dashboard
      window.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement;
        const isEditing = activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable
        );

        if ((e.key === '/' && !isEditing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
          if (!searchInput.value.trim()) {
            showQuickLaunch();
          } else {
            performSearch(searchInput.value);
          }
        }
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.bas-header-search-wrap')) {
          if (searchDropdown) searchDropdown.style.display = 'none';
        }
      });
    }

    function updateDropdownFocus(items) {
      items.forEach((item, idx) => {
        if (idx === searchActiveIndex) {
          item.classList.add('active');
          item.scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('active');
        }
      });
    }

    // =========================================================================
    // 6. Interactive 3D Parallax & Ambient Lighting Engine
    // =========================================================================
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (!prefersReducedMotion && !isTouchDevice && scene3d) {
      let targetRotX = 0;
      let targetRotY = 0;
      let currentRotX = 0;
      let currentRotY = 0;
      let isAnimating = false;

      function startAnimation() {
        if (!isAnimating) {
          isAnimating = true;
          requestAnimationFrame(animateParallax);
        }
      }

      // Track cursor position for 3D tilt with passive listener for max responsiveness
      window.addEventListener('mousemove', (e) => {
        const { innerWidth, innerHeight } = window;
        const normX = (e.clientX / innerWidth) * 2 - 1; // -1 to +1
        const normY = (e.clientY / innerHeight) * 2 - 1; // -1 to +1

        targetRotY = normX * 14; // max 14 deg rotateY
        targetRotX = -normY * 10; // max 10 deg rotateX

        // Position dynamic cursor glow
        if (cursorGlow) {
          cursorGlow.style.left = e.clientX + 'px';
          cursorGlow.style.top = e.clientY + 'px';
          cursorGlow.style.opacity = '1';
        }

        startAnimation();
      }, { passive: true });

      window.addEventListener('mouseleave', () => {
        targetRotX = 0;
        targetRotY = 0;
        if (cursorGlow) {
          cursorGlow.style.opacity = '0';
        }
        startAnimation();
      });

      // Smooth 60fps lerping loop with idle detection
      function animateParallax() {
        if (window.innerWidth <= 768) {
          scene3d.style.transform = 'none';
          isAnimating = false;
          return;
        }

        const deltaX = targetRotX - currentRotX;
        const deltaY = targetRotY - currentRotY;

        if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) {
          currentRotX = targetRotX;
          currentRotY = targetRotY;
          scene3d.style.transform = `rotateX(${currentRotX.toFixed(2)}deg) rotateY(${currentRotY.toFixed(2)}deg)`;
          isAnimating = false;
          return; // Idle when not moving - 0% CPU/GPU overhead
        }

        currentRotX += deltaX * 0.08;
        currentRotY += deltaY * 0.08;

        scene3d.style.transform = `rotateX(${currentRotX.toFixed(2)}deg) rotateY(${currentRotY.toFixed(2)}deg)`;
        requestAnimationFrame(animateParallax);
      }

      startAnimation();
    }
  });
})();
