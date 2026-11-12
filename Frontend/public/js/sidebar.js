// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL FONT PREFERENCE (0% Performance Impact)
// ═══════════════════════════════════════════════════════════════════════════════
window.applyUserPreferences = function() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.preferences && user.preferences.fontFamily) {
            const fontMap = {
                'times-new-roman': "'Times New Roman', Times, serif",
                'georgia': "Georgia, 'Times New Roman', serif",
                'segoe-ui': "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                'arial': "Arial, Helvetica, sans-serif",
                'inter': "'Inter', sans-serif",
                'roboto': "'Roboto', sans-serif",
                'open-sans': "'Open Sans', sans-serif",
                'lato': "'Lato', sans-serif",
                'montserrat': "'Montserrat', sans-serif",
                'poppins': "'Poppins', sans-serif",
                'noto-sans': "'Noto Sans', sans-serif",
                'ubuntu': "'Ubuntu', sans-serif",
                'outfit': "'Outfit', sans-serif",
                'plus-jakarta-sans': "'Plus Jakarta Sans', sans-serif",
                'nunito': "'Nunito', sans-serif",
                'playfair-display': "'Playfair Display', serif"
            };
            const font = fontMap[user.preferences.fontFamily];
            if (font) {
                document.documentElement.style.setProperty('--app-font-family', font);
                let style = document.getElementById('bas-global-font');
                if (!style) {
                    style = document.createElement('style');
                    style.id = 'bas-global-font';
                    document.head.appendChild(style);
                }
                // Import Google Fonts dynamically if one of the custom ones is selected
                let importCss = '';
                if (!['times-new-roman', 'georgia', 'segoe-ui', 'arial'].includes(user.preferences.fontFamily)) {
                    importCss = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Lato:wght@300;400;700&family=Montserrat:wght@300;400;500;600;700&family=Noto+Sans:wght@300;400;500;600;700&family=Nunito:wght@300;400;500;600;700&family=Open+Sans:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Poppins:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=Ubuntu:wght@300;400;500;700&display=swap');\n`;
                }
                style.textContent = `${importCss}body, html, input, button, select, textarea, .table, .btn, .nav-link, span, div, h1, h2, h3, h4, h5, h6 { font-family: ${font} !important; }`;
            }
        }
    } catch (e) { console.error("Error applying font:", e); }
};

// Apply on initial load
window.applyUserPreferences();

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// ERP THEME ENGINE: Isolate Dashboard / Login themes from operational ERP forms
// ═══════════════════════════════════════════════════════════════════════════════
(function() {
    // Only /main and /login are allowed to have dark themes.
    // ALL operational forms (payment vouchers, closing sheet, sales, reports, ledger)
    // MUST ALWAYS remain in pure, original light desktop mode to prevent print bleed.
    const path = window.location.pathname.toLowerCase();
    const isMainOrLogin = path === '/main' || path === '/login' || path === '/';

    function enforceTheme() {
        if (!isMainOrLogin) {
            try {
                localStorage.removeItem('bas_dashboard_theme');
                document.documentElement.classList.remove('bas-theme-dark', 'theme-dark', 'bas-dash-theme-dark');
                document.documentElement.classList.add('bas-theme-light');
                if (document.body) {
                    document.body.classList.remove('theme-dark', 'bas-dash-theme-dark', 'bas-theme-dark');
                    document.body.classList.add('theme-light', 'bas-dash-theme-light');
                }
            } catch(e) {}
        }
    }

    enforceTheme();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enforceTheme);
    }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL RESPONSIVE ENGINE: Auto-load responsive stylesheet & touch table support
// ═══════════════════════════════════════════════════════════════════════════════
(function initGlobalResponsiveEngine() {
    // 1. Ensure viewport meta tag exists
    try {
        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0';
            document.head.appendChild(meta);
        }
    } catch (e) {}

    // 2. Ensure responsive-global.css is injected into <head> as cascade priority
    try {
        const hasResponsiveCss = document.querySelector('link[href*="responsive-global.css"]');
        if (!hasResponsiveCss && document.head) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/css/responsive-global.css?v=20261022_v1';
            link.id = 'bas-global-responsive-css';
            document.head.appendChild(link);
        }
    } catch (e) {}

    // 3. Auto-wrap uncontained ERP data tables for smooth horizontal touch scrolling
    function applyResponsiveTables() {
        try {
            const tables = document.querySelectorAll('table:not(.no-responsive):not(.print-table)');
            tables.forEach(table => {
                // Skip print templates
                if (table.closest('.print-container, .format-a4, .format-thermal, .printable-area, .wh-barcode-container')) return;
                
                const parent = table.parentElement;
                if (!parent) return;

                const isAlreadyResponsive = parent.classList.contains('table-responsive') || 
                                           parent.classList.contains('table-container') || 
                                           parent.classList.contains('data-table-container') ||
                                           parent.classList.contains('closing-table-container') ||
                                           parent.classList.contains('report-table-wrapper') ||
                                           parent.classList.contains('bas-auto-responsive-table');
                                           
                if (!isAlreadyResponsive) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'table-responsive bas-auto-responsive-table';
                    wrapper.style.overflowX = 'auto';
                    wrapper.style.webkitOverflowScrolling = 'touch';
                    wrapper.style.maxWidth = '100%';
                    wrapper.style.marginBottom = '12px';
                    parent.insertBefore(wrapper, table);
                    wrapper.appendChild(table);
                }
            });

            // Adjust body bottom padding if fixed action bar is detected
            const actionBar = document.querySelector('.action-bar, .bottom-action-bar, .erp-action-bar');
            if (actionBar && window.innerWidth <= 768) {
                document.body.style.paddingBottom = '85px';
            }
        } catch (err) {}
    }

    // 4. Universal Tab Bar Normalizer (Guarantees NO tab is hidden across ALL screens)
    function normalizeAllTabBars() {
        try {
            const tabLists = document.querySelectorAll('.nav-tabs, .hr-tabs .nav-tabs, [role="tablist"], .ep-nav-tabs, .nav-tabs-custom');
            tabLists.forEach(list => {
                list.style.setProperty('display', 'flex', 'important');
                list.style.setProperty('flex-direction', 'row', 'important');
                list.style.setProperty('flex-wrap', 'nowrap', 'important');
                list.style.setProperty('overflow-x', 'auto', 'important');
                list.style.setProperty('overflow-y', 'hidden', 'important');
                list.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
                list.style.setProperty('width', '100%', 'important');
                list.style.setProperty('max-width', '100%', 'important');

                const items = list.querySelectorAll('.nav-item');
                items.forEach(item => {
                    item.style.setProperty('flex', '0 0 auto', 'important');
                    item.style.setProperty('width', 'auto', 'important');
                    item.style.setProperty('max-width', 'none', 'important');
                    item.style.setProperty('display', 'inline-flex', 'important');
                });

                const links = list.querySelectorAll('.nav-link');
                links.forEach(link => {
                    link.style.setProperty('white-space', 'nowrap', 'important');
                    link.style.setProperty('display', 'inline-flex', 'important');
                    link.style.setProperty('width', 'auto', 'important');
                });
            });
        } catch (e) {}
    }

    // Instantly remove any legacy/extra screen control strip everywhere
    function cleanupExtraStrips() {
        try {
            document.querySelectorAll('#basScreenControlStrip, .bas-screen-control-strip').forEach(el => el.remove());
        } catch (e) {}
    }

    // Run immediate cleanup
    cleanupExtraStrips();

    function initResponsiveEnhancements() {
        cleanupExtraStrips();
        applyResponsiveTables();
        normalizeAllTabBars();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initResponsiveEnhancements);
    } else {
        initResponsiveEnhancements();
    }
    setTimeout(initResponsiveEnhancements, 300);
    setTimeout(initResponsiveEnhancements, 1000);
    setTimeout(initResponsiveEnhancements, 2500);
    window.addEventListener('resize', initResponsiveEnhancements);
    setInterval(cleanupExtraStrips, 1000);
})();


// ═══════════════════════════════════════════════════════════════════════════════
// USER SCREEN USAGE TRACKER (Personalized Recent Screens Per User)
// ═══════════════════════════════════════════════════════════════════════════════
(function trackUserScreenActivity() {
    try {
        const path = window.location.pathname.toLowerCase();
        if (!path || path === '/' || path === '/main' || path === '/login' || path.startsWith('/api/')) return;

        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userKey = (user.username || user._id || user.name || 'default').toLowerCase().replace(/\s+/g, '_');
        const storageKey = `bas_recent_screens_${userKey}`;

        const SCREEN_MAP = {
            '/wh-sale': { title: 'Whole Sale Entry', icon: 'fas fa-boxes-packing', category: 'Sales & Invoicing' },
            '/wh-stock-audit': { title: 'WH Stock Audit', icon: 'fas fa-clipboard-check', category: 'Inventory Audit' },
            '/payment-vouchers': { title: 'Payment Vouchers', icon: 'fas fa-file-invoice-dollar', category: 'Accounts & Ledger' },
            '/supplier-voucher': { title: 'Supplier Voucher', icon: 'fas fa-truck', category: 'Accounts & Ledger' },
            '/supplier-voucher-list': { title: 'Supplier Voucher List', icon: 'fas fa-list', category: 'Accounts & Ledger' },
            '/category-voucher': { title: 'Category Voucher', icon: 'fas fa-tags', category: 'Accounts & Ledger' },
            '/category-voucher-list': { title: 'Category Voucher List', icon: 'fas fa-list', category: 'Accounts & Ledger' },
            '/closing-sheet': { title: 'Closing Sheet', icon: 'fas fa-cash-register', category: 'Daily Reconciliation' },
            '/sales': { title: 'Retail POS Counter', icon: 'fas fa-shopping-cart', category: 'Point of Sale' },
            '/purchase': { title: 'Purchase Entry', icon: 'fas fa-truck-loading', category: 'Procurement' },
            '/items': { title: 'Items Registration', icon: 'fas fa-box-open', category: 'Stock Catalog' },
            '/users': { title: 'User Permissions', icon: 'fas fa-users-cog', category: 'System Security' },
            '/attendance': { title: 'Biometric Attendance', icon: 'fas fa-fingerprint', category: 'HR & Clock-In' },
            '/reports': { title: 'Financial Reports', icon: 'fas fa-chart-line', category: 'Business Analytics' },
            '/customer-receipts': { title: 'Customer Receipts', icon: 'fas fa-receipt', category: 'Accounts Receivable' },
            '/bank-details': { title: 'Bank Accounts', icon: 'fas fa-university', category: 'Banking & Cash' },
            '/stock-report': { title: 'Stock Ledger Report', icon: 'fas fa-warehouse', category: 'Inventory Reports' }
        };

        let info = SCREEN_MAP[path];
        if (!info) {
            let pageTitle = (document.title || 'Screen').replace(/\s*-\s*.*$/, '').trim();
            if (!pageTitle || pageTitle.length > 25) pageTitle = 'Active Screen';
            info = { title: pageTitle, icon: 'fas fa-window-maximize', category: 'Operations' };
        }

        let history = [];
        try { history = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) { history = []; }
        if (!Array.isArray(history)) history = [];

        // Remove existing item with same path
        history = history.filter(item => item && item.path !== path);

        // Add to front
        history.unshift({
            path: path,
            title: info.title,
            icon: info.icon,
            category: info.category,
            lastVisited: Date.now()
        });

        // Retain top 10
        if (history.length > 10) history = history.slice(0, 10);
        localStorage.setItem(storageKey, JSON.stringify(history));
    } catch(e) {}
})();


// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL EXECUTIVE POPUP & TOAST NOTIFICATION ENGINE (Available on ALL pages)
// ═══════════════════════════════════════════════════════════════════════════════
(function() {
    // Preserve native alert if ever needed
    if (!window.nativeAlert) {
        window.nativeAlert = window.alert.bind(window);
    }

    // Ensure Toast Container exists in DOM
    function getToastContainer() {
        let container = document.getElementById('basGlobalToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'basGlobalToastContainer';
            container.style.cssText = 'position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;max-width:92vw;width:480px;';
            document.body ? document.body.appendChild(container) : document.documentElement.appendChild(container);
        }
        return container;
    }

    /**
     * Universal Notification Popup / Toast
     * @param {string} message - Message to display
     * @param {'success'|'error'|'warning'|'info'} type - Type of toast
     * @param {number} duration - Auto-dismiss timeout in ms (default 3800)
     */
    window.showToast = function(message, type = 'info', duration = 3800) {
        if (!message) return;
        const msgStr = typeof message === 'object' ? (message.message || JSON.stringify(message)) : String(message);

        // Auto-detect type if generic
        const lower = msgStr.toLowerCase();
        if (type === 'info' || !type) {
            if (lower.includes('success') || lower.includes('saved') || lower.includes('updated') || lower.includes('completed')) {
                type = 'success';
            } else if (lower.includes('error') || lower.includes('failed') || lower.includes('invalid') || lower.includes('cannot')) {
                type = 'error';
            } else if (lower.includes('warning') || lower.includes('please') || lower.includes('missing') || lower.includes('fill') || lower.includes('mandatory')) {
                type = 'warning';
            }
        }

        const container = getToastContainer();

        // Theme palette
        const styles = {
            success: {
                bg: 'linear-gradient(135deg, #071f1a 0%, #064e3b 50%, #047857 100%)',
                border: '#10b981',
                color: '#ecfdf5',
                icon: 'fas fa-check-circle',
                iconColor: '#34d399',
                glow: '0 8px 24px rgba(16, 185, 129, 0.4), 0 0 12px rgba(16, 185, 129, 0.25)'
            },
            error: {
                bg: 'linear-gradient(135deg, #2b0b0e 0%, #7f1d1d 50%, #991b1b 100%)',
                border: '#ef4444',
                color: '#fef2f2',
                icon: 'fas fa-times-circle',
                iconColor: '#f87171',
                glow: '0 8px 24px rgba(239, 68, 68, 0.4), 0 0 12px rgba(239, 68, 68, 0.25)'
            },
            warning: {
                bg: 'linear-gradient(135deg, #2e1a05 0%, #78350f 50%, #b45309 100%)',
                border: '#f59e0b',
                color: '#fffbeb',
                icon: 'fas fa-exclamation-triangle',
                iconColor: '#fbbf24',
                glow: '0 8px 24px rgba(245, 158, 11, 0.4), 0 0 12px rgba(245, 158, 11, 0.25)'
            },
            info: {
                bg: 'linear-gradient(135deg, #07132b 0%, #0d2149 50%, #1e40af 100%)',
                border: '#00d4ff',
                color: '#f0f9ff',
                icon: 'fas fa-info-circle',
                iconColor: '#38bdf8',
                glow: '0 8px 24px rgba(0, 212, 255, 0.35), 0 0 12px rgba(0, 102, 255, 0.25)'
            }
        };

        const currentStyle = styles[type] || styles.info;

        const toast = document.createElement('div');
        toast.className = 'bas-executive-toast';
        toast.style.cssText = `
            pointer-events: auto;
            background: ${currentStyle.bg};
            border: 1.5px solid ${currentStyle.border};
            box-shadow: ${currentStyle.glow};
            color: ${currentStyle.color};
            border-radius: 12px;
            padding: 12px 18px;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            font-size: 0.90rem;
            font-weight: 600;
            line-height: 1.4;
            max-width: 100%;
            width: fit-content;
            min-width: 280px;
            opacity: 0;
            transform: translateY(-20px) scale(0.96);
            transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        toast.innerHTML = `
            <i class="${currentStyle.icon}" style="font-size: 1.35rem; color: ${currentStyle.iconColor}; flex-shrink: 0;"></i>
            <span style="flex: 1; word-break: break-word;">${msgStr}</span>
            <button type="button" style="background: none; border: none; color: ${currentStyle.color}; opacity: 0.7; font-size: 1.25rem; line-height: 1; cursor: pointer; padding: 0 4px; margin-left: 8px; flex-shrink: 0; transition: opacity 0.2s;" title="Dismiss">&times;</button>
        `;

        const closeBtn = toast.querySelector('button');
        const dismissToast = () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-16px) scale(0.94)';
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
        };

        closeBtn.addEventListener('click', dismissToast);
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.7');

        container.appendChild(toast);

        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0) scale(1)';
        });

        // Auto dismiss
        if (duration > 0) {
            setTimeout(dismissToast, duration);
        }
    };

    // Override global alert to use executive popup so Chrome suppression NEVER silences saving/alerts
    window.alert = function(msg) {
        window.showToast(msg, 'info', 4200);
    };

    // Alias helper for custom popup calls
    window.showPopup = function(title, message, type = 'info') {
        const fullMsg = title ? `<strong>${title}:</strong> ${message}` : message;
        window.showToast(fullMsg, type, 4500);
    };
})();
/**
 * fetchWithRetry
 * Retries a failed fetch up to `retries` times (default 3) with a `delayMs`
 * delay between attempts. Silently handles ERR_NETWORK_CHANGED / Failed to Fetch
 * that happen when Pakistan ISP routes switch mid-request.
 */
if (typeof window.fetchWithRetry === 'undefined') {
    window.fetchWithRetry = async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 1000) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fetch(url, options);
            } catch (err) {
                if (attempt === retries) throw err;
                console.warn(`[NET] Attempt ${attempt} failed for ${url}. Retrying in ${delayMs}ms…`, err.message);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
    };
}

/**
 * cachedFetch
 * Wraps fetchWithRetry with a sessionStorage cache (default TTL: 5 minutes).
 * Use for STABLE, read-only data that rarely changes within a session:
 *   - /api/v1/employees
 *   - /api/v1/stores  (branches)
 *   - /api/v1/sub-branches
 *   - /api/v1/employee-departments
 * 
 * Usage:  const data = await cachedFetch('/api/v1/stores', { headers: { Authorization: `Bearer ${token}` } });
 * Force refresh: cachedFetch(url, options, { ttl: 0 })  — clears and re-fetches
 */
if (typeof window.cachedFetch === 'undefined') {
    window._cachedFetchPromises = {}; // Promise registry to handle concurrent identical requests

    window.cachedFetch = async function cachedFetch(url, fetchOptions = {}, cacheOptions = {}) {
        const ttl = (cacheOptions.ttl !== undefined) ? cacheOptions.ttl : 5 * 60 * 1000; // 5 min default
        const cacheKey = 'cf_' + url;

        // 1. Check if we already have a PENDING request for this URL
        if (window._cachedFetchPromises[url]) {

            return window._cachedFetchPromises[url];
        }

        // 2. Return cached data from sessionStorage if still fresh
        if (ttl > 0) {
            try {
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    const { ts, data } = JSON.parse(cached);
                    if (Date.now() - ts < ttl) {
                        return data; // 🚀 Cache hit — return immediately
                    }
                }
            } catch (_) { /* ignore parse errors */ }
        }

        // 3. Cache miss or forced refresh — create a promise for this fetch
        window._cachedFetchPromises[url] = (async () => {
            try {
                const res = await window.fetchWithRetry(url, fetchOptions);
                const data = await res.json();

                // Store in sessionStorage if successful
                if (data && data.success) {
                    try {
                        sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
                    } catch (_) { /* ignore storage full errors */ }
                }

                return data;
            } finally {
                // Remove promise from registry once complete (success or failure)
                delete window._cachedFetchPromises[url];
            }
        })();

        return window._cachedFetchPromises[url];
    };
}

/**
 * getGlobalBranches
 * Standardized global helper to fetch and normalize branches from stores or sub-branches.
 * Use this instead of re-implementing loadBranches on every screen.
 */
window.getGlobalBranches = async function getGlobalBranches() {
    const token = localStorage.getItem('token');
    if (!token) return [];

    try {
        // 1. GET RAW DATA (From Memory Cache or Fresh Fetch)
        let rawData = null;
        if (window._globalBranchesRawCache && (Date.now() - window._globalBranchesRawCache.ts < 5 * 60 * 1000)) {
            rawData = window._globalBranchesRawCache.data;
        } else {
            let res = await window.cachedFetch('/api/v1/stores', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res || !res.success || !res.data || res.data.length === 0) {
                res = await window.cachedFetch('/api/v1/sub-branches', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }

            if (res && res.success && res.data) {
                rawData = res.data;
                window._globalBranchesRawCache = { ts: Date.now(), data: rawData };
            }
        }

        // 2. APPLY SECURITY FILTER
        const userData = JSON.parse(localStorage.getItem('user')) || {};
        const userRole = (userData.role || '').toLowerCase();
        const userBranchRaw = (userData.branch || '').toString().trim();



        let filteredData = rawData;

        // Check for Admin/Administrator roles (case-insensitive)
        const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin';

        if (!isAdmin) {
            // Normalize user branches to a lowercase array for reliable matching
            let userBranches = [];
            if (Array.isArray(userData.branch)) {
                userBranches = userData.branch.map(b => b.trim().toLowerCase());
            } else if (typeof userData.branch === 'string') {
                userBranches = userData.branch.split(',').map(b => b.trim().toLowerCase());
            }
            


            // Only filter if they don't have "all branches" permission
            if (!userBranches.includes('all branches')) {
                filteredData = rawData.filter(item => {
                    const bName = (item.name || item.branchName || '').trim().toLowerCase();
                    if (!bName) return false;

                    // Clean name (remove parentheses) for more flexible matching
                    const bNameClean = bName.replace(/[()]/g, '').trim();
                    
                    // Check if any of the user's allowed branches match this item
                    const match = userBranches.some(ub => ub === bName || ub === bNameClean || bName.includes(ub) || bNameClean.includes(ub));
                    return match;
                });
            }
        }

        // 3. Normalize: Trim, Deduplicate, Sort
        const rawNames = filteredData.map(item => (item.name || item.branchName || '').trim());
        const uniqueBranches = [...new Set(rawNames)].filter(n => n !== '').sort();


        return uniqueBranches;

    } catch (err) {
        console.error('[CORE] Global branch fetch/filter failed:', err);
        return [];
    }
};

/**
 * populateBranchSelect
 * Global helper to populate a <select> with branches and handle auto-selection.
 * If exactly 1 branch is available, it auto-selects it and hides the "Select Branch" placeholder.
 */
window.populateBranchSelect = async function populateBranchSelect(selectId, options = {}) {
    const select = document.getElementById(selectId);
    if (!select) {
        console.warn(`[CORE] Element #${selectId} not found, skipping branch population.`);
        return;
    }

    try {

        const uniqueBranches = await window.getGlobalBranches();

        const placeholder = options.placeholder || 'Select Branch';
        
        // Logical check: If user has many branches, we ALWAYS show "Select Branch" as first/default
        // even if "All Branches" is enabled.
        const isSingle = uniqueBranches.length === 1;
        const showPlaceholder = !isSingle; 
        const showAll = !isSingle && options.includeAll;

        // Clear and populate
        select.innerHTML = '';
        
        if (showPlaceholder) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = placeholder;
            opt.disabled = options.placeholderDisabled !== false;
            opt.selected = true;
            select.appendChild(opt);
        }

        if (showAll) {
            const opt = document.createElement('option');
            opt.value = options.allValue || 'all';
            opt.textContent = options.allText || 'ALL BRANCHES';
            select.appendChild(opt);
        }

        uniqueBranches.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });

        // Handle Auto-Selection
        if (isSingle) {
            select.value = uniqueBranches[0];
            if (options.triggerChange !== false) {
                select.dispatchEvent(new Event('change'));
            }
        } else if (options.defaultValue) {
            select.value = options.defaultValue;
        }

        return uniqueBranches;
    } catch (err) {
        console.error('[CORE] Failed to populate branch select:', selectId, err);
        return [];
    }
};

// Helper: Invalidate a specific cached endpoint (call after save/edit operations)
window.clearCachedFetch = function clearCachedFetch(url) {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('cf_' + url)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
    
    if (url.includes('stores') || url.includes('sub-branches')) {
        window._globalBranchesCache = null;
        window._globalBranchesRawCache = null;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════

if (typeof SidebarNavigation === 'undefined') {
    window.SidebarNavigation = class SidebarNavigation {
        constructor() {
            if (window.hasSidebarNavigation) return;
            window.hasSidebarNavigation = true;

            this.currentPage = this.getCurrentPage();
            this.userRole = this.getUserRole();
            // Default to mini mode on ALL pages as per user request
            this.mode = 'mini';
            window.sidebarNavInstance = this;

            this.init();
        }

        init() {
            this.injectGlobalNumberFix();
            this.injectStyles();
            this.createSidebar();
            this.applyBodyClass();
            this.highlightCurrentPage();
            this.buildStandardHeader(); // Brand new global header standard
            this.injectReportsBackButton(); // Add back button only to reports
            this.setupEventListeners();
            this.setupRoleBasedAccess();
            // Defer permission refresh — login already populated localStorage with fresh data.
            // Check after 30 seconds for any server-side permission changes.
            setTimeout(() => this.refreshPermissions(), 30000);
            this.setupHeader();
            this.initDownloadCenterAlerts();

            // Defer branch pre-fetch — only needed when user opens a page with branch dropdown.
            // Pre-fetch after 15 seconds so data is warm when needed.
            setTimeout(() => {
                window.getGlobalBranches().catch(e => console.warn('Sidebar: Branch pre-fetch failed', e));
            }, 15000);
        }

        buildStandardHeader() {
            // This function forces a consistent look across ALL pages:
            // Left: Menu + Back | Center: Title | Right: Action Buttons + Profile
            setTimeout(() => {
                const pageHeader = document.querySelector('.page-header');
                if (!pageHeader) return;

                // 1. Capture existing buttons before we wipe the header
                const existingButtons = Array.from(pageHeader.querySelectorAll('button, .btn:not(.btn-header-light):not(.btn-header-info)'));
                const originalTitle = document.title.split('-')[0].trim();
                const h4 = pageHeader.querySelector('h1, h2, h3, h4, h5, h6, .header-title-text, .page-title');
                const titleText = h4 ? (h4.innerText || h4.textContent) : originalTitle;

                // 2. Setup clean zones matching /main header layout (Left: Toggle + Title, Right: Actions + Profile)
                const currentPath = (window.location.pathname || '').toLowerCase();
                const showGlobalThemeToggle = currentPath === '/login';

                const user = this.getCurrentUser() || {};
                const userName = user.name || 'Bilal Shah';
                const userRole = user.role || 'Admin';
                const initialLetter = userName.charAt(0).toUpperCase();

                pageHeader.className = "page-header d-flex align-items-center justify-content-between px-3 shadow-sm";
                pageHeader.style.cssText = 'height: 54px !important; border: none !important; z-index: 1045; padding: 0 12px !important; margin: 0 !important; width: 100% !important; border-radius: 0 !important;';

                if (pageHeader.parentElement) {
                    pageHeader.parentElement.style.paddingTop = '0px';
                    pageHeader.parentElement.style.marginTop = '0px';
                }

                pageHeader.innerHTML = `
                <div class="bas-header-left" id="header-left-zone" style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
                    <button type="button" class="bas-menu-trigger-btn" id="sidebarToggleBtnHeader" title="Toggle Navigation Menu">
                        <i class="fas fa-bars"></i>
                    </button>
                    <div class="bas-header-title-group" style="display: flex; flex-direction: column; min-width: 0;">
                        <h1 class="bas-header-title" id="globalHeaderTitle">
                            ${titleText}
                        </h1>
                    </div>
                </div>
                <div class="bas-header-right" id="header-right-zone" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-shrink: 0;">
                    <div id="header-action-zone" style="display: flex; align-items: center; gap: 6px;">
                        <!-- Original buttons will be moved here -->
                    </div>
                    <!-- Universal Theme Toggle (Dark & Light) - ONLY for /main & /login -->
                    <div class="bas-dash-theme-toggle" id="globalThemeToggle" role="group" aria-label="Theme selection" style="display: ${showGlobalThemeToggle ? 'inline-flex' : 'none !important'}; align-items: center; background: rgba(0, 0, 0, 0.25); border-radius: 20px; padding: 2px; border: 1px solid rgba(255, 255, 255, 0.25); margin-right: 4px;">
                        <button type="button" class="bas-dash-theme-btn" id="globalThemeDarkBtn" title="Dark Mode" style="border: none; background: transparent; color: #ffffff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.8rem; transition: all 0.2s;">
                            <i class="fas fa-moon"></i>
                        </button>
                        <button type="button" class="bas-dash-theme-btn" id="globalThemeLightBtn" title="Light Mode" style="border: none; background: transparent; color: #ffffff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.8rem; transition: all 0.2s;">
                            <i class="fas fa-sun"></i>
                        </button>
                    </div>
                    <div class="dropdown">
                        <div class="bas-user-profile-badge" data-bs-toggle="dropdown" aria-expanded="false" role="button">
                            <div class="bas-user-avatar" id="standardUserAvatarInitial">${initialLetter}</div>
                            <div class="bas-user-info">
                                <span class="bas-user-name" id="standardUserName">${userName}</span>
                                <span class="bas-user-role" id="standardUserRoleDisplay">${userRole}</span>
                            </div>
                            <i class="fas fa-chevron-down ms-1" style="font-size: 0.65rem; color: #ffffff !important; opacity: 0.85;"></i>
                        </div>
                        <ul class="dropdown-menu dropdown-menu-end border-0 shadow-lg mt-2" style="border-radius: 12px; min-width: 200px; padding: 10px;">
                            <li class="px-3 py-2 border-bottom mb-2">
                                <div id="standardUserNameFull" style="font-weight: 700; color: #0066ff; font-size: 0.9rem;">${userName}</div>
                                <div style="font-size: 0.75rem; color: #64748b; text-transform: capitalize;">${userRole}</div>
                            </li>
                            <li><a class="dropdown-item py-2 rounded" href="/main"><i class="fas fa-home me-2 text-muted"></i>Dashboard Home</a></li>
                            <li><a class="dropdown-item py-2 rounded" href="/profile"><i class="fas fa-user-circle me-2 text-muted"></i>My Profile</a></li>
                            <li><a class="dropdown-item py-2 rounded" href="/settings"><i class="fas fa-cog me-2 text-muted"></i>Settings</a></li>
                            <li><hr class="dropdown-divider my-2"></li>
                            <li><a class="dropdown-item py-2 rounded text-danger logout-btn" href="#"><i class="fas fa-sign-out-alt me-2"></i>Sign Out</a></li>
                        </ul>
                    </div>
                </div>
            `;

                // 3. Re-inject the captured buttons into the action zone
                const actionZone = pageHeader.querySelector('#header-action-zone');
                existingButtons.forEach(btn => {
                    // Style cleanup for the new header
                    btn.classList.add('btn-sm');
                    btn.style.margin = '0';
                    btn.style.whiteSpace = 'nowrap';
                    actionZone.appendChild(btn);
                });

                // Attach toggle event specifically to the new header button
                const headerToggleBtn = pageHeader.querySelector('#sidebarToggleBtnHeader');
                if (headerToggleBtn) {
                    headerToggleBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.toggleSidebarMode();
                    });
                }

                // Sync user data
                this.setupHeader();

                // Hook up universal theme toggle buttons
                if (!window.applyGlobalTheme) {
                    window.applyGlobalTheme = function (theme) {
                        try {
                            localStorage.setItem('bas_dashboard_theme', theme);
                            document.documentElement.setAttribute('data-theme', theme);
                            if (theme === 'dark') {
                                document.body.classList.add('dark-theme');
                                document.body.classList.remove('light-theme');
                            } else {
                                document.body.classList.add('light-theme');
                                document.body.classList.remove('dark-theme');
                            }
                        } catch (e) {
                            console.warn('applyGlobalTheme warning:', e);
                        }
                    };
                }

                const darkBtn = pageHeader.querySelector('#globalThemeDarkBtn');
                const lightBtn = pageHeader.querySelector('#globalThemeLightBtn');
                if (darkBtn) {
                    darkBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (typeof window.applyGlobalTheme === 'function') {
                            window.applyGlobalTheme('dark');
                        }
                    });
                }
                if (lightBtn) {
                    lightBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (typeof window.applyGlobalTheme === 'function') {
                            window.applyGlobalTheme('light');
                        }
                    });
                }

                // Initial theme button state (Default: light)
                const currentTheme = localStorage.getItem('bas_dashboard_theme') || 'light';
                if (typeof window.applyGlobalTheme === 'function') {
                    window.applyGlobalTheme(currentTheme);
                }
                this.injectReportsButtons();
            }, 150);
        }

        injectReportsButtons() {
            // Global handler for all report screens to trigger their print workflow
            if (!window.triggerReportPrint) {
                window.triggerReportPrint = function () {
                    if (typeof window.printReport === 'function') {
                        try { window.printReport(); return; } catch (e) { console.warn('printReport error:', e); }
                    }
                    if (typeof window.prepareAndPrint === 'function') {
                        try { window.prepareAndPrint(); return; } catch (e) { console.warn('prepareAndPrint error:', e); }
                    }
                    if (typeof window.printCurrentReport === 'function') {
                        try { window.printCurrentReport(); return; } catch (e) { console.warn('printCurrentReport error:', e); }
                    }
                    if (typeof window.printTable === 'function') {
                        try { window.printTable(); return; } catch (e) { console.warn('printTable error:', e); }
                    }
                    const inlinePrint = document.querySelector('button[onclick*="print"]:not(.reports-print-btn), a[onclick*="print"]:not(.reports-print-btn), .btn-print:not(.reports-print-btn)');
                    if (inlinePrint && typeof inlinePrint.click === 'function') {
                        try { inlinePrint.click(); return; } catch (e) {}
                    }
                    window.print();
                };
            }

            // Detect if we are on a true report page (from Reports Hub)
            const rawPath = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '');

            // 1. Never show on hub itself, main dashboard, login, or home
            if (!rawPath || rawPath === '/reports' || rawPath === '/main' || rawPath === '/login' || rawPath === '') {
                this.removeReportButtons();
                return;
            }

            // 2. Never show on print preview layouts
            if (rawPath.includes('print-') || rawPath.includes('/print')) {
                this.removeReportButtons();
                return;
            }

            // 3. Strict operational, transaction, and setup screens (MUST NEVER HAVE REPORT BUTTONS)
            const nonReportScreens = [
                // Payroll & HR operational/transaction screens
                '/payroll',
                '/legacy-payroll',
                '/employee-registration',
                '/employee-list',
                '/attendance-list',
                '/employee-advance',
                '/holy-days',
                '/employee-penalty',
                '/employee-commission',
                '/distribute-employee-commission',
                '/employee-sale-commission',
                '/employee-clearance',
                '/employee-adjustment',
                '/import-attendance',
                // Financial & Cash operational screens
                '/closing-sheet',
                '/daily-cash',
                '/bank-management',
                '/easypaisa-settlement',
                '/payment-vouchers',
                '/payment-vouchers-list',
                '/supplier-voucher',
                '/supplier-voucher-list',
                '/category-voucher',
                '/category-voucher-list',
                '/payments',
                '/receipts',
                '/voucher',
                '/accounts',
                '/account-categories',
                '/account-groups',
                '/banks',
                '/taxes',
                '/zakat',
                // Sales, Purchases & Warehousing operational screens
                '/sales',
                '/purchases',
                '/sale-returns',
                '/purchase-returns',
                '/expenses',
                '/food-invoice',
                '/customer-demand',
                '/customer-payments',
                '/supplier-payments',
                '/supplier-wh-tax',
                '/wht-supplier',
                '/stock',
                '/stock-audit',
                '/wh-stock-audit',
                '/wh-barcode',
                '/wh-item',
                '/wh-customer',
                '/wh-supplier',
                '/wh-customer-payment',
                '/wh-purchase',
                '/wh-sale',
                '/wh-purchase-return',
                '/wh-sale-return',
                '/items',
                '/parties',
                '/stores',
                '/units',
                '/branch-departments',
                '/cash-counter',
                '/commission-item',
                // System tools & Admin screens
                '/profile',
                '/settings',
                '/backup',
                '/download-center',
                '/actions-tracker',
                '/system-logs',
                '/check-rights',
                '/hr-dashboard',
                '/dashboard',
                '/pending-cheque-v2',
                '/exemption-invoices'
            ];

            const isExcluded = nonReportScreens.some(screen => rawPath === screen || rawPath.startsWith(screen + '/'));
            if (isExcluded) {
                this.removeReportButtons();
                return;
            }

            // 4. Dedicated report screens that might not have '-report' in their URL name
            const dedicatedReportPages = [
                '/bank-ledger',
                '/income-statement',
                '/employee-payroll-status',
                '/employee-payroll-list',
                '/employee-advance-activity',
                '/pending-chq-details',
                '/supplier-tax-certificate',
                '/bank-summary-pro',
                '/employee-attendance-detail',
                '/payment-reports'
            ];

            const isDedicatedReport = dedicatedReportPages.some(r => rawPath === r || rawPath.startsWith(r + '/'));
            const isReportPage = isDedicatedReport || rawPath.includes('report');

            if (!isReportPage) {
                this.removeReportButtons();
                return;
            }

            const attach = () => {
                // 1. Back to Reports Button (Positioned before the title)
                const leftZone = document.getElementById('header-left-zone');
                if (leftZone && !leftZone.querySelector('.reports-hub-btn')) {
                    const btn = document.createElement('a');
                    btn.href = '/reports';
                    btn.className = 'btn btn-sm btn-light reports-hub-btn';
                    btn.innerHTML = '<i class="fas fa-arrow-left"></i>';
                    btn.title = 'Back to Reports Hub';
                    btn.setAttribute('aria-label', btn.title);

                    const titleGroup = leftZone.querySelector('.bas-header-title-group');
                    if (titleGroup) {
                        leftZone.insertBefore(btn, titleGroup);
                    } else {
                        leftZone.appendChild(btn);
                    }
                }

                // 2. Universal Print Report Button
                const actionZone = document.getElementById('header-action-zone');
                if (actionZone) {
                    let printBtn = actionZone.querySelector('.reports-print-btn, button[onclick*="print"], .btn-print');
                    if (!printBtn) {
                        printBtn = document.createElement('button');
                        printBtn.type = 'button';
                        printBtn.className = 'btn btn-sm btn-success reports-print-btn';
                        printBtn.title = 'Print Report';
                        printBtn.setAttribute('aria-label', 'Print Report');
                        printBtn.innerHTML = '<i class="fas fa-print me-1"></i><span class="reports-print-text">Print Report</span>';
                        printBtn.onclick = function (e) {
                            e.preventDefault();
                            window.triggerReportPrint();
                        };
                        actionZone.insertBefore(printBtn, actionZone.firstChild);
                    } else {
                        printBtn.classList.add('reports-print-btn');
                        if (!printBtn.querySelector('.reports-print-text') && printBtn.textContent.trim().length > 0) {
                            const icon = printBtn.querySelector('i');
                            const iconHtml = icon ? icon.outerHTML : '<i class="fas fa-print me-1"></i>';
                            const text = printBtn.textContent.trim();
                            printBtn.innerHTML = `${iconHtml} <span class="reports-print-text">${text}</span>`;
                        }
                    }
                }
            };

            setTimeout(attach, 250);
            setTimeout(attach, 800);
        }

        removeReportButtons() {
            const existingBack = document.querySelector('.reports-hub-btn');
            if (existingBack) existingBack.remove();
            const existingPrint = document.querySelector('.reports-print-btn');
            if (existingPrint) existingPrint.remove();
        }

        injectReportsBackButton() {
            this.injectReportsButtons();
        }

        async refreshPermissions() {
            const token = localStorage.getItem('token');
            if (!token) return;

            try {
                const response = await fetch('/api/v1/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const updatedUser = await response.json();
                    // Update local storage with fresh data
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    // Re-run permission check with new data
                    this.setupRoleBasedAccess();
                    this.setupHeader(); // Update avatar/name if changed
                }
            } catch (error) {
                console.error('Sidebar: Failed to refresh permissions', error);
            }
        }

        injectGlobalNumberFix() {
            if (document.getElementById('global-number-spinner-fix')) return;
            const style = document.createElement('style');
            style.id = 'global-number-spinner-fix';
            style.textContent = `
                /* GLOBAL FIREFOX & CHROME SPINNER REMOVAL */
                input[type="number"] {
                    -moz-appearance: textfield !important;
                    appearance: textfield !important;
                }
                input[type="number"]::-webkit-outer-spin-button,
                input[type="number"]::-webkit-inner-spin-button {
                    -webkit-appearance: none !important;
                    margin: 0 !important;
                }
                /* Extra precision for Firefox internal elements */
                input[type="number"]::-moz-number-spin-box,
                input[type="number"]::-moz-number-spin-inner,
                input[type="number"]::-moz-number-spin-up-button,
                input[type="number"]::-moz-number-spin-down-button {
                    display: none !important;
                    -moz-appearance: none !important;
                }
            `;
            document.head.appendChild(style);

            // --- THE ULTIMATE FIX FOR FIREFOX ---
            // Since Firefox sometimes ignores the CSS block, we force it via inline style
            const applyFix = () => {
                document.querySelectorAll('input[type="number"]').forEach(el => {
                    if (el.style.mozAppearance !== 'textfield') {
                        el.style.setProperty('-moz-appearance', 'textfield', 'important');
                        el.style.setProperty('appearance', 'textfield', 'important');
                    }
                });
            };

            // Run immediately, then use MutationObserver to catch dynamic elements
            applyFix();
            if (window.MutationObserver) {
                const observer = new MutationObserver(() => applyFix());
                observer.observe(document.body, { childList: true, subtree: true });
            }


        }

        injectStyles() {
            if (document.getElementById('sidebar-styles')) return;
            const style = document.createElement('style');
            style.id = 'sidebar-styles';
            style.innerHTML = `
            .auth-hidden { display: none !important; }
            .active-parent { background-color: rgba(255,255,255,0.05) !important; color: white !important; }
            
            /* FORCE SIDEBAR STYLE - Matching inside pages dark executive theme */
            .sidebar-container { background: linear-gradient(180deg, #07132b 0%, #071022 100%) !important; background-color: #071022 !important; border-right: 1px solid rgba(0, 212, 255, 0.15) !important; }
            .sidebar-header { background-color: #050b18 !important; border-bottom: 1px solid rgba(0, 212, 255, 0.12) !important; }
            
            /* GLOBAL HEADER NORMALIZATION AND PURGE */
            /* Hide legacy manual sidebar toggles in the header */
            #sidebarToggle, #sidebarToggleBtn {
                display: none !important;
            }
            #sidebarToggleBtnHeader .fa-bars,
            .bas-menu-trigger-btn .fa-bars {
                display: inline-block !important;
                color: #ffffff !important;
            }

            .page-header div {
                background: transparent !important; /* Remove manual background on inner divs */
            }

            .user-avatar-small i {
                font-size: 0.8rem;
            }

            .profile-trigger:hover {
                background: rgba(255,255,255,0.25) !important;
            }

            @media (max-width: 768px) {
                .header-title-text {
                    font-size: 0.9rem !important;
                }
            }

            /* Desktop Hover Effects */
            .reports-hub-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.15);
            }
        `;
            document.head.appendChild(style);
        }

        getCurrentPage() {
            const path = window.location.pathname;
            if (path === '/' || path.includes('index')) return 'main';
            const page = path.split('/').pop();
            return page || 'main';
        }

        getUserRole() {
            const user = this.getCurrentUser();
            return user ? user.role : 'guest';
        }

        getCurrentUser() {
            try {
                const userStr = localStorage.getItem('user');
                if (userStr) return JSON.parse(userStr);
            } catch (error) { console.error(error); }
            return null;
        }

        applyBodyClass() {
            document.body.classList.remove('sidebar-full', 'sidebar-mini');
            document.body.classList.add(this.mode === 'full' ? 'sidebar-full' : 'sidebar-mini');
        }

        createSidebar() {
            const sidebar = document.createElement('nav');
            sidebar.id = 'sidebar';
            sidebar.className = `sidebar-container ${this.mode}`;
            // FORCE BACKGROUND COLOR INLINE - Dark Executive Theme
            sidebar.style.backgroundColor = '#071022';

            // Attempt to load company logo
            // (Moved loadCompanyLogo call to end of function to ensure DOM elements exist)

            const menuItems = [
                {
                    id: 'main', icon: 'fa-home', label: 'Home & Overview', permission: 'dashboard',
                    children: [
                        { label: 'Home Page', link: '/main', permission: 'dashboard' },
                        { label: 'Dashboard', link: '/dashboard', permission: 'dashboard' },
                        { label: 'HR Dashboard', link: '/hr-dashboard', permission: 'hr_dashboard' },
                        { label: 'Food Service Invoice', link: '/food-invoice', permission: 'food_invoice' }
                    ]
                },
                { id: 'download-center', icon: 'fa-cloud-download-alt', label: 'Download Center', link: '/download-center', permission: '' },
                {
                    id: 'admin', icon: 'fa-cogs', label: 'Administration', permission: 'administration',
                    children: [
                        { label: 'User Management', link: '/users', permission: 'users' },
                        { label: 'Group Rights', link: '/groups', permission: 'groups' },
                        { label: 'Actions Tracker', link: '/actions-tracker', permission: 'actions_tracker_link' },
                        { label: 'Stores', link: '/stores', permission: 'stores' },
                        { label: 'Parties', link: '/parties', permission: 'parties' },
                        { label: 'Commission Item', link: '/commission-item', permission: 'commission_item' },
                        { label: 'WHT Supplier', link: '/wht-supplier', permission: 'wht_supplier_link' }
                    ]
                },
                {
                    id: 'accounts', icon: 'fa-calculator', label: 'Accounts', permission: 'accounts',
                    children: [
                        { label: 'Supplier Voucher', link: '/supplier-voucher', permission: 'pv_supplier' },
                        { label: 'Supplier Voucher List', link: '/supplier-voucher-list', permission: 'pv_supplier_list' },
                        { label: 'Category Voucher', link: '/category-voucher', permission: 'pv_category' },
                        { label: 'Category Voucher List', link: '/category-voucher-list', permission: 'pv_category_list' },
                        { label: 'Vouchers', link: '/voucher', permission: 'vouchers' },
                        { label: 'Expenses', link: '/expenses', permission: 'expenses' },
                        { label: 'Account Register', link: '/accounts', permission: 'account_register' },
                        { label: 'Account Groups', link: '/account-groups', permission: 'account_groups' },
                        { label: 'Account Categories', link: '/account-categories', permission: 'account_categories' },
                        { label: 'EasyPaisa Settlement', link: '/easypaisa-settlement', permission: 'easypaisa_settlement' },
                        {
                            id: 'closing-sub',
                            label: 'Closing',
                            icon: 'fa-file-invoice-dollar',
                            permission: 'closing',
                            submenu: [
                                { label: 'Branch Departments', link: '/branch-departments', permission: 'branch_departments' },
                                { label: 'Daily Cash', link: '/daily-cash', permission: 'daily_cash' },
                                { label: 'Cash Counter', link: '/cash-counter', permission: 'cash_counter' },
                                { label: 'Closing Sheet', link: '/closing-sheet', permission: 'closing_sheet' },
                                { label: 'Zakat Entry', link: '/zakat', permission: 'zakat_entry' }
                            ]
                        }
                    ]
                },
                {
                    id: 'warehouse', icon: 'fa-warehouse', label: 'Warehouse', permission: 'warehouse',
                    children: [
                        { label: 'WH Supplier', link: '/wh-supplier', permission: 'wh_supplier' },
                        { label: 'WH Customer', link: '/wh-customer', permission: 'wh_customer' },
                        { label: 'Item Registration', link: '/wh-item', permission: 'wh_item' },
                        { label: 'WH Purchase', link: '/wh-purchase', permission: 'wh_purchase' },
                        { label: 'WH Purchase Return', link: '/wh-purchase-return', permission: 'wh_purchase_return' },
                        { label: 'WH Sale Entry', link: '/wh-sale', permission: 'wh_sale' },
                        { label: 'WH Sale Entry Return', link: '/wh-sale-return', permission: 'wh_sale_return' },
                        { label: 'WH Customer Payment', link: '/wh-customer-payment', permission: 'wh_customer_payment' },
                        { label: 'Barcode Printing', link: '/wh-barcode', permission: 'wh_barcode_print' },
                        { label: 'WH Stock Audit', link: '/wh-stock-audit', permission: 'wh_stock_audit' }
                    ]
                },
                {
                    id: 'payroll', icon: 'fa-users', label: 'Payroll', permission: 'payroll',
                    children: [
                        { label: 'Salaries List Record', link: '/legacy-payroll', permission: 'legacy_payroll_archive', forceShow: true },
                        { label: 'Employee Registration', link: '/employee-registration', permission: 'employee_registration' },
                        { label: 'Attendance', link: '/attendance-list', permission: 'attendance' },
                        { label: 'Adv. Timing Reconciliation', link: '/advance-attendance-reconciliation', permission: 'adv_attendance_reconciliation' },
                        { label: 'Employee Advance', link: '/employee-advance', permission: 'employee_advance' },
                        { label: 'Monthly Payroll', link: '/payroll', permission: 'monthly_payroll' },
                        { label: 'Holy Days', link: '/holy-days', permission: 'holy_days' },
                        { label: 'Employee Penalty', link: '/employee-penalty', permission: 'employee_penalty' },
                        { label: 'Emp. Commission', link: '/employee-commission', permission: 'emp_commission' },
                        { label: 'Distribute Emp. Commission', link: '/distribute-employee-commission', permission: 'distribute_emp_commission' },
                        { label: 'UG Emp. Commission', link: '/employee-sale-commission', permission: 'ug_emp_commission' },
                        { label: 'Emp. Clearance', link: '/employee-clearance', permission: 'emp_clearance' },
                        { label: 'Emp. Adjustment', link: '/employee-adjustment', permission: 'emp_adjustment' },
                        { label: 'EMPLOYES INFO', link: '/employees-info-report', permission: 'employees_info_report_link' },
                        { label: 'WHT Ded Detail', link: '/wh-ded-report', permission: 'wh_ded_report_link' }
                    ]
                },
                {
                    id: 'bank-mgmt', icon: 'fa-university', label: 'Bank Management', permission: 'bank_mgmt',
                    children: [
                        { label: 'Banks', link: '/banks', permission: 'banks' },
                        { label: 'Bank Management', link: '/bank-management', permission: 'bank_management' },
                    ]
                },
                { id: 'reports', icon: 'fa-chart-bar', label: 'Reports', link: '/reports', permission: 'reports' },
                {
                    id: 'sales', icon: 'fa-shopping-cart', label: 'Sales', permission: 'sales',
                    children: [
                        { label: 'Customer Demand', link: '/customer-demand', permission: 'customer_demand' },
                        { label: 'New Sale', link: '/sales', permission: 'new_sale' },
                        { label: 'Sales Return', link: '/sale-returns', permission: 'sale_returns' },
                        { label: 'Customer Receipt', link: '/customer-payments', permission: 'customer_receipt' }
                    ]
                },
                {
                    id: 'purchases', icon: 'fa-shopping-bag', label: 'Purchase', permission: 'purchase',
                    children: [
                        { label: 'New Purchase', link: '/purchases', permission: 'new_purchase' },
                        { label: 'Purchase Return', link: '/purchase-returns', permission: 'purchase_returns' },
                        { label: 'Supplier Payment', link: '/supplier-payments', permission: 'supplier_payment' },
                        { label: 'Supplier WH Tax', link: '/supplier-wh-tax', permission: 'supplier_wh_tax_link' },
                        { label: 'Exemption Invoices', link: '/exemption-invoices', permission: 'exemption_invoices_link' }
                    ]
                },
                {
                    id: 'stock', icon: 'fa-warehouse', label: 'Stock', permission: 'stock',
                    children: [
                        { label: 'Stock Adjustments', link: '/stock-adjustments', permission: 'stock_adjustments' }
                    ]
                },
                {
                    id: 'settings', icon: 'fa-cog', label: 'Settings', permission: 'settings',
                    children: [
                        { label: 'Company Settings', link: '/settings?tab=company', permission: 'settings_company' },
                        { label: 'Invoice Settings', link: '/settings?tab=invoice', permission: 'settings_invoice' },
                        { label: 'Tax Settings', link: '/settings?tab=tax', permission: 'settings_tax' },
                        { label: 'Backup Settings', link: '/settings?tab=backup', permission: 'settings_backup' },
                        { label: 'API Key Settings', link: '/settings?tab=apiKey', permission: 'settings_apiKey' }
                    ]
                }
            ];

            let html = `
            <div class="sidebar-header">
                <i class="fas fa-bars text-white" style="cursor:pointer; font-size: 1.5rem;" id="sidebarToggleBtn"></i>
                <div class="logo-container ms-2">
                    <div class="logo-text d-none d-md-block">BAS</div>
                </div>
                <!-- Download Center notification popup disabled. -->
            </div>
            
            <div class="user-info-mini">
                <div class="user-avatar-circle" id="sidebarAvatarContainer">
                    <!-- Default User Icon (fallback) -->
                    <i class="fas fa-user" id="defaultUserIcon"></i>
                    <!-- Logo will be injected here via JS -->
                    <img id="sidebarCompanyLogo" src="" alt="Logo" style="display:none; width: 80%; height: 80%; object-fit: contain;">
                </div>
            </div>

            <div class="sidebar-menu">
                <ul class="list-unstyled">
        `;

            menuItems.forEach(item => {
                html += `<li class="nav-item" data-permission="${item.permission}">`;

                if (item.children) {
                    // 1. Accordion Trigger (For Full Mode)
                    html += `
                    <div class="nav-link collapsed" data-bs-toggle="collapse" href="#submenu-${item.id}" data-bs-target="#submenu-${item.id}" role="button" aria-expanded="false">
                        <i class="fas ${item.icon}"></i>
                        <span>${item.label}</span>
                        <i class="fas fa-chevron-right ms-auto arrow arrow-icon" style="font-size: 0.8rem; opacity: 0.7;"></i>
                    </div>
                `;

                    // 2. Accordion Content (For Full Mode)
                    html += `
                    <ul class="collapse list-unstyled ps-3 submenu-inline" id="submenu-${item.id}">
                `;
                    item.children.forEach(child => {
                        if (child.submenu) {
                            // Nested Submenu Logic - with chevron arrows centered
                            html += `
                            <li><a href="javascript:void(0)" class="nav-link small-link" data-permission="${child.permission}" data-target="submenu-${child.id}" onclick="document.getElementById('submenu-${child.id}').classList.toggle('show')" style="font-weight: normal !important; display: flex !important; align-items: center !important; justify-content: space-between !important; padding-left: 25px !important; padding-right: 15px !important;">
                                <span><i class="fas fa-circle bullet text-danger" style="font-size:0.5rem; margin-right:8px;"></i>${child.label}</span>
                                <i class="fas fa-chevron-right" style="font-size:0.7rem;"></i>
                            </a></li>
                            <ul class="collapse list-unstyled submenu-inline" id="submenu-${child.id}" style="margin-left: 25px !important; padding-left: 0 !important;">
                        `;
                            child.submenu.forEach(subItem => {
                                const permAttr = subItem.permission ? `data-permission="${subItem.permission}"` : '';
                                html += `<li><a href="${subItem.link}" class="nav-link small-link" ${permAttr} style="padding-right: 15px;"><i class="fas fa-circle bullet text-danger" style="font-size:0.5rem; margin-right:8px;"></i>${subItem.label}</a></li>`;
                            });
                            html += `</ul>`;
                        } else if (child.header) {
                            html += `<li class="sidebar-sub-header text-white text-uppercase fw-bold" style="font-size:0.7rem; padding: 5px 15px; margin-top:5px; opacity: 0.7;">${child.label}</li>`;
                        } else {
                            html += `<li><a href="${child.link}" class="nav-link small-link" data-permission="${child.permission}"><i class="fas fa-circle bullet text-danger" style="font-size:0.5rem; margin-right:8px;"></i>${child.label}</a></li>`;
                        }
                    });
                    html += `</ul>`;

                    // 3. Popover Content (For Mini Mode)
                    html += `<div class="popover-menu">
                    <div class="popover-header">
                        ${item.label}
                    </div>
                    <div class="popover-content">
                `;
                    item.children.forEach(child => {
                        if (child.submenu) {
                            // Collapsible Submenu for Popover - styled like regular items
                            html += `
                            <div class="popover-submenu-toggle" data-permission="${child.permission}" data-target="popover-sub-${child.id}" style="cursor:pointer; padding: 8px 20px; color:#b8c7ce; display:flex; align-items:center; transition: color 0.2s;">
                                <i class="fas fa-circle bullet" style="font-size:0.5rem; margin-right:10px; color:#e74c3c;"></i>
                                <span style="font-size:0.9rem;">${child.label}</span>
                                <i class="fas fa-chevron-right arrow" style="font-size:0.7rem; margin-left: auto; transition: transform 0.2s;"></i>
                            </div>
                            <div id="popover-sub-${child.id}" class="popover-submenu-content">
                        `;
                            child.submenu.forEach(subItem => {
                                const permAttr = subItem.permission ? `data-permission="${subItem.permission}"` : '';
                                if (subItem.submenu) {
                                    // Nested Submenu in Popover
                                    const subId = subItem.id || `sub-${Math.random().toString(36).substr(2, 9)}`;
                                    html += `
                                    <div class="popover-submenu-toggle" ${permAttr} data-target="popover-sub-${subId}" style="cursor:pointer; padding: 6px 30px; color:#b8c7ce; display:flex; align-items:center;">
                                        <i class="fas fa-circle bullet" style="font-size:0.4rem; margin-right:10px; color:#e67e22;"></i>
                                        <span style="font-size:0.85rem;">${subItem.label}</span>
                                        <i class="fas fa-chevron-right arrow" style="font-size:0.6rem; margin-left: auto;"></i>
                                    </div>
                                    <div id="popover-sub-${subId}" class="popover-submenu-content">
                                `;
                                    subItem.submenu.forEach(deepItem => {
                                        const dPerm = deepItem.permission ? `data-permission="${deepItem.permission}"` : '';
                                        html += `<a href="${deepItem.link}" class="popover-item" ${dPerm} style="padding-left: 45px;"><i class="fas fa-circle bullet" style="font-size:0.35rem; margin-right:8px; color:#f1c40f;"></i> ${deepItem.label}</a>`;
                                    });
                                    html += `</div>`;
                                } else {
                                    html += `
                                    <a href="${subItem.link}" class="popover-item" ${permAttr} style="padding-left: 30px;">
                                        <i class="fas fa-circle bullet" style="font-size:0.4rem; margin-right:10px; color:#e74c3c;"></i> ${subItem.label}
                                    </a>
                                `;
                                }
                            });
                            html += `</div>`;
                        } else if (child.header) {
                            html += `<div class="popover-sub-header text-white text-uppercase fw-bold" style="font-size:0.7rem; padding: 5px 15px; margin-top:5px; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">${child.label}</div>`;
                        } else {
                            html += `
                            <a href="${child.link}" class="popover-item" data-permission="${child.permission}">
                                <i class="fas fa-circle bullet" style="font-size:0.5rem; margin-right:10px; color:#e74c3c;"></i> ${child.label}
                            </a>
                        `;
                        }
                    });
                    html += `</div></div>`;

                } else {
                    html += `
                    <a href="${item.link}" class="nav-link" data-page="${item.id}" data-permission="${item.permission}" style="display:flex;align-items:center;">
                        <i class="fas ${item.icon}"></i>
                        <span>${item.label}</span>
                        ${item.id === 'download-center' ? '<span class="badge bg-danger rounded-pill ms-auto dc-sidebar-badge" style="display:none;font-size:0.68rem;padding:2px 7px;">0</span>' : ''}
                    </a>
                `;
                }
                html += `</li>`;
            });

            html += `   </ul>
                </div>
        `;

            sidebar.innerHTML = html;
            document.body.prepend(sidebar);

            // Load logo NOW that the elements are in the DOM
            this.loadCompanyLogo();

            // Add Backdrop for mobile
            const backdrop = document.createElement('div');
            backdrop.id = 'sidebarBackdrop';
            backdrop.className = 'sidebar-backdrop';
            document.body.appendChild(backdrop);
            backdrop.addEventListener('click', () => this.toggleSidebarMode());
        }

        setupEventListeners() {
            // Broad delegation for toggle buttons
            document.addEventListener('click', (e) => {
                if (e.target.closest('#sidebarToggle') || e.target.closest('#sidebarToggleBtn')) {
                    e.preventDefault();
                    this.toggleSidebarMode();
                }
            });

            // Popover Submenu Toggle (Delegated)
            document.addEventListener('click', (e) => {
                const toggle = e.target.closest('.popover-submenu-toggle');
                if (toggle) {
                    e.preventDefault();
                    e.stopPropagation();
                    const targetId = toggle.getAttribute('data-target');
                    const targetEl = document.getElementById(targetId);
                    const icon = toggle.querySelector('.arrow');

                    if (targetEl) {
                        const isShown = targetEl.classList.contains('show');
                        // Close other submenus at the SAME level if desired, but for now just toggle
                        targetEl.classList.toggle('show');
                        if (icon) {
                            icon.style.transform = !isShown ? 'rotate(90deg)' : 'rotate(0deg)';
                        }
                    }
                }
            });

            // Close sidebar on mobile when link is clicked
            document.addEventListener('click', (e) => {
                const isMobile = window.innerWidth <= 768;
                if (!isMobile) return;

                const navLink = e.target.closest('.nav-link:not([data-bs-toggle])');
                const popoverItem = e.target.closest('.popover-item');

                // Prevent closing if it's a submenu toggle (href="javascript:void(0)" or "#")
                if (navLink) {
                    const href = navLink.getAttribute('href');
                    if (href === 'javascript:void(0)' || href === '#') return;
                }

                if (navLink || popoverItem) {
                    const sidebar = document.getElementById('sidebar');
                    const backdrop = document.getElementById('sidebarBackdrop');
                    if (sidebar) sidebar.classList.remove('show-mobile');
                    if (backdrop) backdrop.classList.remove('show');

                    // Add specific logic to reset menus when navigating
                    this.collapseAllMenus();
                }
            });

            // Mobile Fix: Force expand accordion on click for mobile
            document.addEventListener('click', (e) => {
                const isMobile = window.innerWidth <= 768;
                if (!isMobile) return;

                const toggle = e.target.closest('[data-bs-toggle="collapse"]');
                if (toggle) {
                    // If it's a sidebar toggle, we might need to verify if the mini mode is interfering
                    const targetId = toggle.getAttribute('href') || toggle.getAttribute('data-bs-target');
                    if (targetId) {
                        const targetEl = document.querySelector(targetId);
                        // Bootstrap might lag or conflict with our 'mini' class logic. 
                        // Let's ensure the class 'show' is toggled.
                        // However, bootstrap js should handle this. 
                        // The issue is likely CSS hiding it despite 'show' class.
                        // We fixed CSS, but let's double check if we need to force anything here.

                        // Actually, if we are in Mini mode, the click might not be triggering bootstrap collapse 
                        // because the element might be visually different or hidden?

                        // If we need to force open specifically for mobile:
                        if (targetEl && targetEl.classList.contains('submenu-inline')) {
                            setTimeout(() => {
                                if (!targetEl.classList.contains('show')) {
                                    // Ideally bootstrap opens it. If not, we force display block via style
                                }
                            }, 50);
                        }
                    }
                }
            });
        }

        toggleSidebarMode() {
            const isMobile = window.innerWidth <= 768;
            const sidebar = document.getElementById('sidebar');
            const backdrop = document.getElementById('sidebarBackdrop');

            if (isMobile) {
                sidebar.classList.toggle('show-mobile');
                const isOpen = sidebar.classList.contains('show-mobile');

                if (backdrop) backdrop.classList.toggle('show');

                // If we just CLOSED it, or if toggling generally, ensure we reset if closing
                if (!isOpen) {
                    this.collapseAllMenus();
                }
                return;
            }

            if (this.mode === 'full') {
                this.mode = 'mini';
                sidebar.classList.remove('full');
                sidebar.classList.add('mini');

                // Collapse all menus when minimizing so they are closed when re-opened
                this.collapseAllMenus();
            } else {
                this.mode = 'full';
                sidebar.classList.remove('mini');
                sidebar.classList.add('full');
            }
            this.applyBodyClass();
        }

        highlightCurrentPage() {
            let path = window.location.pathname;
            if (path === '/') path = '/main';

            // Normalize for comparison (remove leading slash if inconsistent)
            const normalize = (p) => p.startsWith('/') ? p : '/' + p;
            const currentPath = normalize(path);

            // Clean highlight
            document.querySelectorAll('#sidebar .nav-link').forEach(l => {
                l.classList.remove('active');
                // If it's a parent trigger, ensure it's collapsed visually if not active
                if (l.hasAttribute('data-bs-toggle')) {
                    l.classList.add('collapsed');
                    l.setAttribute('aria-expanded', 'false');
                }
            });
            document.querySelectorAll('.submenu-inline').forEach(ul => ul.classList.remove('show'));

            const allLinks = document.querySelectorAll('a');
            let matched = false;

            allLinks.forEach(a => {
                const linkHref = a.getAttribute('href');
                if (!linkHref || linkHref === 'javascript:void(0)' || linkHref === '#') return;

                // Robust Match: Exact or EndsWith
                if (normalize(linkHref) === currentPath) {
                    matched = true;
                    a.classList.add('active');

                    // Highlight and Expand Parent Accordion
                    const parentUl = a.closest('.submenu-inline');
                    if (parentUl) {
                        // Mobile Behavior: Do NOT auto-expand. Keep it collapsed by default.
                        // Desktop Behavior: Auto-expand to show context.
                        if (window.innerWidth > 768) {
                            parentUl.classList.add('show'); // Expand accordion

                            // Find trigger for this UL
                            const trigger = document.querySelector(`[data-bs-target="#${parentUl.id}"], [href="#${parentUl.id}"]`);
                            if (trigger) {
                                trigger.classList.add('active-parent'); // Custom highlight style
                                trigger.classList.remove('collapsed'); // Rotate arrow
                                trigger.setAttribute('aria-expanded', 'true'); // A11y
                            }

                            // Handle Nested Parents (Grandparents)
                            const grandParentUl = parentUl.parentElement.closest('.submenu-inline');
                            if (grandParentUl) {
                                grandParentUl.classList.add('show');
                                const gpTrigger = document.querySelector(`[data-bs-target="#${grandParentUl.id}"], [href="#${grandParentUl.id}"]`);
                                if (gpTrigger) {
                                    gpTrigger.classList.add('active-parent');
                                    gpTrigger.classList.remove('collapsed');
                                    gpTrigger.setAttribute('aria-expanded', 'true');
                                }
                            }
                        } else {
                            // On Mobile: just ensure the trigger knows it has an active child (optional, for styling)
                            // formatting only, no expansion
                            const trigger = document.querySelector(`[data-bs-target="#${parentUl.id}"], [href="#${parentUl.id}"]`);
                            if (trigger) {
                                trigger.classList.add('active-parent');
                            }
                        }
                    }
                }
            });
        }

        setupRoleBasedAccess() {

            const user = this.getCurrentUser();
            if (!user) {
                console.warn('Sidebar: No user found in LocalStorage.');
                return;
            }

            // 1. Resolve Rights - Aggressive merging
            let rights = {};
            // STRICT MODE: Do not auto-promote admin role
            // if (user.role === 'admin') rights.admin = true;
            if (user.rights) Object.assign(rights, user.rights);

            // Removed redundant merging of raw group rights to prevent overwriting processed rights from controller
            // if (user.group && user.group.rights) Object.assign(rights, user.group.rights);
            // if (user.groupId && typeof user.groupId === 'object' && user.groupId.rights) Object.assign(rights, user.groupId.rights);

            // Check for Group Admin flag (LOG ONLY, DO NOT BYPASS)
            const groupName = (user.group && user.group.name) || (user.groupId && typeof user.groupId === 'object' && user.groupId.name) || '';
            const isGroupAdmin = (user.group && user.group.isAdmin) || (user.groupId && typeof user.groupId === 'object' && user.groupId.isAdmin) || groupName.toLowerCase().includes('admin');
            


            // DISABLED BYPASS to enforce granular controls
            /*
            if (user.role === 'admin' || isGroupAdmin || rights.admin === true) {

                return;
            }
            */


            /*
            if (Object.keys(rights).length === 0) {
                console.warn('Sidebar: No rights found. Keeping sidebar visible to avoid blackout.');
                return;
            }
            */

            // 2. Hide items NOT explicitly authorized (Strict Mode)
            // alert('Sidebar V19 Loaded - Checking Permissions'); // Debug Alert
            const allPermissions = document.querySelectorAll('[data-permission]');
            allPermissions.forEach(el => {
                const perm = el.getAttribute('data-permission');
                let isGranted = rights[perm] === true || rights[perm] === 'true';
                if (!isGranted && perm === 'pv_supplier_list' && (rights['pv_supplier'] === true || rights['pv_supplier'] === 'true') && rights['pv_supplier_list'] === undefined) {
                    isGranted = true;
                }
                if (!isGranted && perm === 'pv_category_list' && (rights['pv_category'] === true || rights['pv_category'] === 'true') && rights['pv_category_list'] === undefined) {
                    isGranted = true;
                }
                
                if (perm === 'legacy_payroll_archive') {

                }

                if (perm && !isGranted) {
                    el.classList.add('auth-hidden');
                    el.style.setProperty('display', 'none', 'important');

                    // Also hide the LI container if it's a submenu item
                    const li = el.closest('li');
                    if (li && !li.classList.contains('nav-item')) {
                        li.classList.add('auth-hidden');
                        li.style.setProperty('display', 'none', 'important');
                    }
                }
            });

            // 3. FORCE SHOW explicitly authorized items (Rights = True)
            // This overrides any accidental hiding from previous logic
            allPermissions.forEach(el => {
                const perm = el.getAttribute('data-permission');

                if (perm === 'legacy_payroll_archive') {

                }

                // Only show if explicitly granted — no admin bypass
                if (perm && (rights[perm] === true || rights[perm] === 'true')) {
                    el.classList.remove('auth-hidden');
                    el.style.setProperty('display', '', 'important');

                    const li = el.closest('li');
                    if (li) {
                        li.classList.remove('auth-hidden');
                        li.style.setProperty('display', '', 'important');
                    }
                }
            });

            // 4. Hierarchical Cleanup & UPWARD PROPAGATION
            // If a child is authorized, the parent MUST show. We run multiple times to propagate up levels.

            // Define helpers
            const isVisible = (el) => {
                return el && !el.classList.contains('auth-hidden') && el.style.display !== 'none';
            };

            const hasVisibleChildren = (container) => {
                // Look for direct links or submenu toggles that are visible
                // We need to look deeper than just immediate children for nested structures
                const links = container.querySelectorAll('a, .popover-item, .popover-submenu-toggle');
                for (let link of links) {
                    if (isVisible(link)) return true;
                }
                return false;
            };

            for (let i = 0; i < 6; i++) {
                const containers = document.querySelectorAll('.sidebar-container .nav-item, .sidebar-container .submenu-inline, .sidebar-container .popover-menu, .sidebar-container .popover-submenu-content');
                containers.forEach(container => {
                    if (hasVisibleChildren(container)) {
                        // Category has active children! Show it.
                        container.classList.remove('auth-hidden');
                        container.style.display = '';

                        // Also ensure the trigger (the link that opens this container) is shown
                        const id = container.id;
                        if (id) {
                            document.querySelectorAll(`[href="#${id}"], [data-target="${id}"], [data-bs-target="#${id}"]`).forEach(t => {
                                t.classList.remove('auth-hidden');
                                t.style.display = '';
                                // And the LI wrapping that trigger
                                const li = t.closest('li');
                                if (li) { li.classList.remove('auth-hidden'); li.style.display = ''; }
                            });
                        }
                    } else {
                        // Container empty - Hide it UNLESS the section itself is expressly authorized
                        const perm = container.getAttribute('data-permission');
                        // Only hide if NOT authorized AND no children
                        if (perm && (rights[perm] === true || rights[perm] === 'true')) {
                            // Keep it visible
                        } else {
                            // If it determines visibility solely by children (like a pure folder), and no children -> hide
                            // Or if explicit permission is false/undefined -> hide

                            // BUT: We must check if we already processed it as visible in a previous loop?
                            // Actually, if hasVisibleChildren is false, we can safely hide it IF it relies on children.
                            // Ideally, we shouldn't hide something that was explicitly true.
                            if (!perm || !rights[perm]) {
                                container.classList.add('auth-hidden');
                                container.style.display = 'none';

                                const id = container.id;
                                if (id) {
                                    document.querySelectorAll(`[href="#${id}"], [data-target="${id}"], [data-bs-target="#${id}"]`).forEach(t => {
                                        t.classList.add('auth-hidden');
                                        t.style.display = 'none';
                                        const li = t.closest('li');
                                        if (li) { li.classList.add('auth-hidden'); li.style.display = 'none'; }
                                    });
                                }
                            }
                        }
                    }
                });
            }


            // 5. FAILSAFE: explicitly unhide items that are definitely allowed
            // This handles cases where parent/child logic might have been too aggressive
            Object.keys(rights).forEach(key => {
                if (rights[key] === true || rights[key] === 'true') {
                    const els = document.querySelectorAll(`[data-permission="${key}"]`);
                    els.forEach(el => {
                        el.classList.remove('auth-hidden');
                        el.style.display = '';
                        // Also ensure its parent container is visible if it's a submenu item
                        const parent = el.closest('.submenu-inline, .popover-submenu-content');
                        if (parent) {
                            parent.classList.remove('auth-hidden');
                            parent.style.display = '';
                            // And the trigger for that parent
                            const parentId = parent.id;
                            if (parentId) {
                                const trigger = document.querySelector(`[data-target="${parentId}"], [href="#${parentId}"]`);
                                if (trigger) {
                                    trigger.classList.remove('auth-hidden');
                                    trigger.style.display = '';
                                    const li = trigger.closest('li');
                                    if (li) { li.classList.remove('auth-hidden'); li.style.display = ''; }
                                }
                            }
                        }
                    });
                }
            });


        }

        collapseAllMenus() {
            // Collapse all open submenus
            document.querySelectorAll('.submenu-inline.show').forEach(ul => {
                ul.classList.remove('show');
                // Reset trigger
                const id = ul.id;
                const trigger = document.querySelector(`[href="#${id}"], [data-bs-target="#${id}"]`);
                if (trigger) {
                    trigger.classList.add('collapsed');
                    trigger.setAttribute('aria-expanded', 'false');
                }
            });
        }

        setupHeader() {
            const user = this.getCurrentUser();
            if (!user) return;

            // Update all user name displays including dashboard and header elements
            const nameElements = ['userName', 'userNameHeader', 'headerUserName', 'standardUserName', 'standardUserNameFull', 'dashUserName', 'dashTerminalUserName'];
            nameElements.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = user.name;
            });

            // Update Account Info in dropdown
            const roleEl = document.getElementById('standardUserRoleDisplay');
            const emailEl = document.getElementById('standardUserEmailDisplay');
            if (roleEl) roleEl.innerText = user.role || 'User';
            if (emailEl) emailEl.innerText = user.email || 'Connected';

            const initialEl = document.getElementById('standardUserAvatarInitial');
            if (initialEl && user.name) {
                initialEl.innerText = user.name.charAt(0).toUpperCase();
            }

            // Built-in Avatar SVGs (same as in profile.html)
            const AVATARS = [
                // Avatar 1 - Blue Professional Male
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#3498db"/><circle cx="50" cy="40" r="20" fill="#f5d0c5"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#2980b9"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 45 47 Q 50 52 55 47" stroke="#333" stroke-width="2" fill="none"/><path d="M 30 25 Q 50 5 70 25 Q 70 35 50 30 Q 30 35 30 25" fill="#4a3728"/></svg>`,
                // Avatar 2 - Pink Professional Female
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#e91e63"/><circle cx="50" cy="40" r="20" fill="#f5d0c5"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#c2185b"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 45 47 Q 50 52 55 47" stroke="#c0392b" stroke-width="2" fill="none"/><path d="M 25 35 Q 25 10 50 15 Q 75 10 75 35 Q 70 45 50 55 Q 30 45 25 35" fill="#5d4037"/></svg>`,
                // Avatar 3 - Green Tech Guy
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#27ae60"/><circle cx="50" cy="40" r="20" fill="#fce4d6"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#1e8449"/><rect x="36" y="32" width="10" height="8" rx="2" fill="#333"/><rect x="54" y="32" width="10" height="8" rx="2" fill="#333"/><path d="M 45 48 Q 50 51 55 48" stroke="#333" stroke-width="2" fill="none"/><path d="M 30 28 Q 50 20 70 28 L 65 35 Q 50 30 35 35 Z" fill="#2c3e50"/></svg>`,
                // Avatar 4 - Purple Creative Female
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#9b59b6"/><circle cx="50" cy="40" r="20" fill="#f5d0c5"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#8e44ad"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 43 47 Q 50 53 57 47" stroke="#e74c3c" stroke-width="2" fill="none"/><path d="M 20 40 Q 25 10 50 15 Q 75 10 80 40 Q 75 50 50 60 Q 25 50 20 40" fill="#6c3483"/></svg>`,
                // Avatar 5 - Orange Business Male
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#e67e22"/><circle cx="50" cy="40" r="20" fill="#fce4d6"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#d35400"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 45 47 Q 50 50 55 47" stroke="#333" stroke-width="2" fill="none"/><path d="M 32 30 Q 50 22 68 30 L 65 25 Q 50 18 35 25 Z" fill="#1a1a1a"/><rect x="47" y="60" width="6" height="10" fill="#2c3e50"/></svg>`,
                // Avatar 6 - Teal Doctor/Medical
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#1abc9c"/><circle cx="50" cy="40" r="20" fill="#f5d0c5"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#fff"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 45 47 Q 50 51 55 47" stroke="#333" stroke-width="2" fill="none"/><path d="M 30 25 Q 50 10 70 25 Q 65 30 50 28 Q 35 30 30 25" fill="#2c3e50"/><circle cx="35" cy="70" r="5" fill="#e74c3c"/><rect x="33" y="68" width="4" height="4" fill="#fff"/><rect x="34" y="67" width="2" height="6" fill="#fff"/></svg>`,
                // Avatar 7 - Red Bold Male
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#e74c3c"/><circle cx="50" cy="40" r="20" fill="#fce4d6"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#c0392b"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 44 47 Q 50 52 56 47" stroke="#333" stroke-width="2" fill="none"/><ellipse cx="50" cy="22" rx="22" ry="12" fill="#2c3e50"/></svg>`,
                // Avatar 8 - Indigo Professional Female
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#3f51b5"/><circle cx="50" cy="40" r="20" fill="#f5d0c5"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#303f9f"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 45 47 Q 50 52 55 47" stroke="#e74c3c" stroke-width="2" fill="none"/><path d="M 22 38 Q 28 8 50 12 Q 72 8 78 38 Q 72 48 50 50 Q 28 48 22 38" fill="#1a1a1a"/><circle cx="43" cy="33" r="5" fill="none" stroke="#333" stroke-width="1"/><circle cx="57" cy="33" r="5" fill="none" stroke="#333" stroke-width="1"/></svg>`,
                // Avatar 9 - Cyan Modern Male
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#00bcd4"/><circle cx="50" cy="40" r="20" fill="#fce4d6"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#0097a7"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 45 48 Q 50 52 55 48" stroke="#333" stroke-width="2" fill="none"/><path d="M 30 32 Q 35 15 50 18 Q 65 15 70 32 L 65 28 Q 50 22 35 28 Z" fill="#5d4037"/><rect x="28" y="45" width="6" height="4" rx="1" fill="#ffc107"/></svg>`,
                // Avatar 10 - Amber Casual Female
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#ffc107"/><circle cx="50" cy="40" r="20" fill="#f5d0c5"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#ffa000"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 44 47 Q 50 53 56 47" stroke="#e74c3c" stroke-width="2" fill="none"/><path d="M 25 30 Q 30 5 50 10 Q 70 5 75 30" fill="#ff9800" stroke="none"/><path d="M 25 30 Q 25 45 35 55 L 30 60 Q 20 50 25 30" fill="#ff9800"/><path d="M 75 30 Q 75 45 65 55 L 70 60 Q 80 50 75 30" fill="#ff9800"/></svg>`,
                // Avatar 11 - Navy Executive
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#34495e"/><circle cx="50" cy="40" r="20" fill="#fce4d6"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#2c3e50"/><circle cx="43" cy="37" r="3" fill="#333"/><circle cx="57" cy="37" r="3" fill="#333"/><path d="M 45 47 Q 50 50 55 47" stroke="#333" stroke-width="2" fill="none"/><path d="M 32 28 Q 50 18 68 28 L 66 22 Q 50 14 34 22 Z" fill="#566573"/><path d="M 40 60 L 50 70 L 60 60" fill="#e74c3c"/><rect x="47" y="60" width="6" height="8" fill="#fff"/></svg>`,
                // Avatar 12 - Lime Friendly
                `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#8bc34a"/><circle cx="50" cy="40" r="20" fill="#f5d0c5"/><ellipse cx="50" cy="85" rx="30" ry="25" fill="#689f38"/><circle cx="43" cy="37" r="4" fill="#333"/><circle cx="57" cy="37" r="4" fill="#333"/><circle cx="44" cy="36" r="1.5" fill="#fff"/><circle cx="58" cy="36" r="1.5" fill="#fff"/><path d="M 42 47 Q 50 55 58 47" stroke="#333" stroke-width="2" fill="none"/><path d="M 28 30 Q 35 10 50 12 Q 65 10 72 30 Q 68 35 50 32 Q 32 35 28 30" fill="#5d4037"/></svg>`
            ];

            // Check for saved avatar in localStorage
            const savedAvatarIndex = localStorage.getItem('userAvatar');

            if (savedAvatarIndex !== null && AVATARS[parseInt(savedAvatarIndex)]) {
                const avatarSvg = AVATARS[parseInt(savedAvatarIndex)];

                // Update all user-avatar divs with the selected avatar
                document.querySelectorAll('.user-avatar').forEach(div => {
                    div.innerHTML = avatarSvg;
                    div.style.background = 'transparent';
                    div.classList.remove('bg-primary');
                });

                // Also update headerAvatarDisplay if it exists
                const headerAvatarDisplay = document.getElementById('headerAvatarDisplay');
                if (headerAvatarDisplay) {
                    headerAvatarDisplay.innerHTML = avatarSvg;
                    headerAvatarDisplay.style.background = 'transparent';
                    headerAvatarDisplay.classList.remove('bg-primary');
                }
            } else if (user.profilePicture) {
                // Fallback to profile picture if no built-in avatar selected
                document.querySelectorAll('.user-avatar-img, .header-avatar').forEach(img => {
                    img.src = user.profilePicture;
                });

                document.querySelectorAll('.user-avatar').forEach(div => {
                    div.innerHTML = `<img src="${user.profilePicture}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    div.classList.remove('bg-primary');
                    div.classList.add('bg-white');
                });
            }

            // Setup Logout buttons
            document.querySelectorAll('.logout-btn, #logoutBtn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (window.pageAccess && window.pageAccess.logout) {
                        sessionStorage.clear();
                        window.pageAccess.logout();
                    } else {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        sessionStorage.clear();
                        window.location.href = '/login';
                    }
                });
            });
        }

        async loadCompanyLogo() {
            try {
                const img = document.getElementById('sidebarCompanyLogo');
                const defaultIcon = document.getElementById('defaultUserIcon');
                if (!img) return;

                // 1. Try to load from LocalStorage Cache first (Instant Load)
                const cachedLogo = localStorage.getItem('companyLogo_cache');
                if (cachedLogo) {
                    img.src = cachedLogo;
                    img.style.display = 'block';
                    if (defaultIcon) defaultIcon.style.display = 'none';
                }

                // 2. Fetch from API to ensure it's up to date (Background Update)
                const token = localStorage.getItem('token');
                if (!token) return;

                // Defer API verification — cached logo is already displayed instantly above.
                // Wait 10 seconds before checking for updates to avoid competing with page load.
                await new Promise(r => setTimeout(r, 10000));

                const response = await fetch('/api/v1/settings', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    const settings = data.data || data;
                    if (settings.logo) {
                        // Update cache if new
                        if (settings.logo !== cachedLogo) {
                            localStorage.setItem('companyLogo_cache', settings.logo);
                            img.src = settings.logo;
                            // On load handled by browser cache usually, but explicit sets help
                            img.onload = () => {
                                img.style.display = 'block';
                                if (defaultIcon) defaultIcon.style.display = 'none';
                            };
                        } else {
                            // Even if cached, ensure visibility just in case
                            if (img.style.display === 'none') {
                                img.style.display = 'block';
                                if (defaultIcon) defaultIcon.style.display = 'none';
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to load sidebar logo', e);
            }
        }

        initDownloadCenterAlerts() {
            // Check immediately on load/login
            setTimeout(() => this.checkBossDocuments(true), 1200);

            // Poll every 15 seconds while user is active on page
            setInterval(() => this.checkBossDocuments(false), 15000);

            // Immediate reaction when any file is dispatched to Download Center
            window.addEventListener('downloadCenter:fileSent', () => {
                setTimeout(() => this.checkBossDocuments(false), 300);
            });
        }

        async checkBossDocuments(isInitialLoad = false) {
            const token = localStorage.getItem('token');
            if (!token) return;

            try {
                const res = await fetch('/api/v1/notifications?type=download_center&isRead=false&limit=5', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) return;
                const data = await res.json();
                if (!data || !data.success) return;

                const unreadCount = data.unreadCount !== undefined ? data.unreadCount : (data.data ? data.data.length : 0);
                const badges = document.querySelectorAll('.dc-sidebar-badge');
                badges.forEach(badge => {
                    if (unreadCount > 0) {
                        badge.textContent = unreadCount;
                        badge.style.display = 'inline-block';
                    } else {
                        badge.style.display = 'none';
                    }
                });

                if (data.data && data.data.length > 0) {
                    const latest = data.data[0];
                    const lastSeenId = sessionStorage.getItem('last_seen_boss_doc_id');

                    // If it is a new unread document that hasn't been shown in popup this session:
                    if (latest._id !== lastSeenId) {
                        sessionStorage.setItem('last_seen_boss_doc_id', latest._id);
                        this.showBossDocumentPopup(latest, unreadCount);
                    }
                }
            } catch (err) {
                // Non-blocking background check
            }
        }

        showBossDocumentPopup(notification, unreadCount) {
            const existing = document.getElementById('bossDocAlertModal');
            if (existing) existing.remove();

            const safeEscape = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const isAlreadyOnDownloadCenter = window.location.pathname.includes('download-center');

            // Play a soft notification audio chime
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    const audioCtx = new AudioCtx();
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
                    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
                    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.45);
                }
            } catch (e) {}

            const modal = document.createElement('div');
            modal.id = 'bossDocAlertModal';
            modal.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;max-width:420px;width:calc(100vw - 48px);';

            const title = notification.relatedFile?.title || notification.title || 'New Document';
            const msg = notification.message || 'You received a document from Boss side';

            modal.innerHTML = `
                <div style="background:#fff;border-radius:12px;box-shadow:0 15px 35px rgba(0,0,0,0.25),0 0 0 1px rgba(30,58,95,0.15);overflow:hidden;border-left:5px solid #2563eb;font-family:system-ui,-apple-system,sans-serif;">
                    <div style="background:#1e3a5f;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
                        <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.95rem;">
                            <i class="fas fa-bell" style="color:#fbbf24;"></i>
                            <span>New Document from Boss Side</span>
                        </div>
                        <button type="button" id="bossDocCloseBtn" style="background:none;border:none;color:#cbd5e1;font-size:1.3rem;line-height:1;cursor:pointer;padding:0;">&times;</button>
                    </div>
                    <div style="padding:16px;">
                        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;">
                            <div style="width:42px;height:42px;border-radius:8px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">
                                <i class="fas fa-file-pdf"></i>
                            </div>
                            <div style="flex:1;">
                                <div style="font-weight:700;color:#0f172a;font-size:0.95rem;margin-bottom:4px;">${safeEscape(title)}</div>
                                <div style="color:#475569;font-size:0.83rem;line-height:1.4;">${safeEscape(msg)}</div>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid #f1f5f9;">
                            <span style="font-size:0.75rem;color:#94a3b8;"><i class="fas fa-clock me-1"></i>Just now</span>
                            <div style="display:flex;gap:8px;">
                                <button type="button" id="bossDocDismissBtn" style="padding:6px 12px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;font-size:0.8rem;color:#475569;font-weight:600;cursor:pointer;">Dismiss</button>
                                <a href="/download-center" id="bossDocViewBtn" style="padding:6px 14px;background:#1e4c8c;border-radius:6px;font-size:0.8rem;color:#fff;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 4px rgba(30,76,140,0.3);cursor:pointer;">
                                    <i class="fas fa-cloud-download-alt"></i> ${isAlreadyOnDownloadCenter ? 'View & Refresh' : 'View in Download Center'}
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const close = () => { if (modal) modal.remove(); };
            const closeBtn = modal.querySelector('#bossDocCloseBtn');
            const dismissBtn = modal.querySelector('#bossDocDismissBtn');
            const viewBtn = modal.querySelector('#bossDocViewBtn');

            if (closeBtn) closeBtn.addEventListener('click', close);
            if (dismissBtn) dismissBtn.addEventListener('click', close);
            if (viewBtn) {
                viewBtn.addEventListener('click', (e) => {
                    const token = localStorage.getItem('token');
                    if (token && notification._id) {
                        fetch(`/api/v1/notifications/${notification._id}/read`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${token}` }
                        }).catch(() => {});
                    }
                    if (isAlreadyOnDownloadCenter) {
                        e.preventDefault();
                        close();
                        if (typeof window.loadFiles === 'function') window.loadFiles();
                        if (typeof window.loadNotifications === 'function') window.loadNotifications();
                    }
                });
            }
        }
    };

    function startSidebar() {
        if (!window.location.pathname.includes('login') && window.SidebarNavigation) {
            if (!window.sidebarNavInstance) {
                window.sidebarNavInstance = new window.SidebarNavigation();
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startSidebar);
    } else {
        startSidebar();
    }
}

