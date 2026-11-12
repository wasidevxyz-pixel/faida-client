// Load route permission guard early (prevents unauthorized page access)
// CRITICAL: Must load SYNCHRONOUSLY (not async) to block page access BEFORE rendering
const PERM_GUARD_BUILD_VERSION = '20261024_v1';

function loadPermissionMap() {
    if (window.getRequiredPermissionsForPath) {
        return;
    }

    const script = document.createElement('script');
    script.src = '/js/permissionMaps.js?v=' + PERM_GUARD_BUILD_VERSION;
    script.async = false;
    script.defer = false;
    document.head.appendChild(script);
}

function loadPermissionGuard() {
    if (window.__routePermissionGuardLoaded) {
        return;
    }

    loadPermissionMap();

    const script = document.createElement('script');
    script.src = '/js/routePermissionGuard.js?v=' + PERM_GUARD_BUILD_VERSION;
    script.async = false;  // CRITICAL: Set to false for synchronous blocking
    script.defer = false;
    document.head.appendChild(script);
}

// Show any permission denial errors from route guard
function showPermissionError() {
    const errorMsg = sessionStorage.getItem('errorMessage');
    if (errorMsg) {
        setTimeout(() => {
            showError(errorMsg);
            sessionStorage.removeItem('errorMessage');
        }, 500);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    // Load permission guard FIRST (before other checks)
    loadPermissionGuard();

    // Show any permission denial errors
    showPermissionError();

    // Check authentication on page load
    checkAuthentication();

    // Setup Idle Timer (30 minutes)
    setupIdleTimer();

    // Set up periodic token validation
    setInterval(checkTokenValidity, 60000); // Check every minute

    // Defer validation — login already provided fresh user + rights data.
    // Run after 30 seconds to catch any permission changes without blocking page load.
    setTimeout(validateTokenWithServer, 30000);
});

/**
 * Setup Idle Timer for 30 minutes
 */
function setupIdleTimer() {
    const IDLE_TIMEOUT = 60 * 60 * 1000; // 60 minutes in ms
    let idleTimer;

    const resetTimer = () => {
        clearTimeout(idleTimer);
        localStorage.setItem('lastActivity', Date.now());
        idleTimer = setTimeout(autoLogout, IDLE_TIMEOUT);
    };

    const autoLogout = () => {
        const path = window.location.pathname;
        if (path === '/' || path === '/login' || path.includes('login')) return;

        // Skip auto logout on mobile devices (using touch as a proxy or screen width)
        const isMobile = ('ontouchstart' in window) || (window.innerWidth <= 768);
        if (isMobile) {
            console.log('Mobile device detected. Skipping auto logout.');
            resetTimer(); // Refresh timer to prevent stacking
            return;
        }

        console.log('User inactive for 60 minutes. Logging out...');
        window.pageAccess.logout();
    };

    // Check last activity on load to catch browser restarts/long tabs
    const lastActivity = localStorage.getItem('lastActivity');
    if (lastActivity && (Date.now() - parseInt(lastActivity)) > IDLE_TIMEOUT) {
        // Prevent immediate logout if already on login page
        const path = window.location.pathname;
        if (!(path === '/' || path === '/login' || path.includes('login'))) {
            setTimeout(autoLogout, 100);
            return;
        }
    }

    // List of events to track activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(name => {
        document.addEventListener(name, resetTimer, true);
    });

    // Initial start
    resetTimer();
}

// Check if user is authenticated
function checkAuthentication() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    const path = window.location.pathname;

    // Check if we are on the login page
    if (path === '/' || path === '/login' || path.includes('login')) {
        // If already logged in, redirect to main page
        if (token && user) {
            window.location.href = '/main';
        }
        return true;
    }

    if (!token || !user) {
        redirectWithMessage('Please login to access this page');
        return false;
    }

    // Check if token is expired
    if (isTokenExpired()) {
        redirectWithMessage('Session expired. Please login again');
        return false;
    }

    return true;
}

// Check if token is expired
function isTokenExpired() {
    const token = localStorage.getItem('token');
    if (!token) return true;

    try {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        return decoded.exp < Date.now() / 1000;
    } catch (e) {
        return true;
    }
}

// Redirect to login with message
function redirectWithMessage(message) {
    // Store message to show on login page
    sessionStorage.setItem('loginMessage', message);

    // Clear expired tokens
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('dw_ai_chat');
    localStorage.removeItem('dw_ai_conversation_id');

    // Redirect to login page
    window.location.href = '/login';
}

// Get current user
function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

// Get auth token for API calls
function getAuthToken() {
    return localStorage.getItem('token');
}

// Make authenticated API calls
async function authenticatedFetch(url, options = {}) {
    const token = getAuthToken();

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, finalOptions);

        // Handle 401 Unauthorized
        if (response.status === 401) {
            redirectWithMessage('Session expired. Please login again');
            return null;
        }

        // Handle 403 Forbidden
        if (response.status === 403) {
            const errorData = await response.json();
            showError(errorData.msg || 'You are not authorized to perform this action');
            return null;
        }

        return response;
    } catch (error) {
        console.error('API call error:', error);
        showError('Network error. Please check your connection.');
        return null;
    }
}

// Check token validity periodically
function checkTokenValidity() {
    if (!checkAuthentication()) {
        return;
    }

    // Optional: Validate token with server
    validateTokenWithServer();
}

// Validate token with server
async function validateTokenWithServer() {
    try {
        const response = await authenticatedFetch('/api/v1/auth/me');
        if (!response) {
            return;
        }

        const userData = await response.json();
        const currentUser = getCurrentUser();

        // Deep comparison of rights to trigger a UI refresh
        const currentRights = currentUser ? JSON.stringify(currentUser.rights || {}) : '';
        const newRights = userData ? JSON.stringify(userData.rights || {}) : '';

        // General Update
        if (JSON.stringify(currentUser) !== JSON.stringify(userData)) {
            localStorage.setItem('user', JSON.stringify(userData));

            // If RIGHTS changed, refresh sidebar in-place (no full page reload)
            if (currentRights !== newRights) {
                console.log('Permissions updated from server. Refreshing sidebar in-place...');
                if (window.hasSidebarNavigation) {
                    // Re-run permission checks on the existing sidebar DOM
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) {
                        const tempNav = Object.create(window.SidebarNavigation.prototype);
                        tempNav.getCurrentUser = function() {
                            try { return JSON.parse(localStorage.getItem('user')); } catch(e) { return null; }
                        };
                        tempNav.setupRoleBasedAccess();
                        tempNav.setupHeader();
                    }
                }
            }
        }
    } catch (error) {
        console.error('Token validation error:', error);
    }
}

// Show error message
function showError(message) {
    // Create or update error alert
    let alertContainer = document.getElementById('pageAlertContainer');

    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'pageAlertContainer';
        alertContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            max-width: 400px;
        `;
        document.body.appendChild(alertContainer);
    }

    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Show success message
function showSuccess(message) {
    let alertContainer = document.getElementById('pageAlertContainer');

    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'pageAlertContainer';
        alertContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            max-width: 400px;
        `;
        document.body.appendChild(alertContainer);
    }

    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success alert-dismissible fade show';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);

    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 3000);
}

// Show loading spinner
function showLoading() {
    let loader = document.getElementById('globalLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.7);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        loader.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
}

// Hide loading spinner
function hideLoading() {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// Export functions for global access
window.pageAccess = {
    checkAuthentication,
    getCurrentUser,
    getAuthToken,
    authenticatedFetch,
    showError,
    showSuccess,
    showLoading,
    hideLoading,
    logout: async function () {
        try {
            await fetch('/api/v1/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('dw_ai_chat');
        localStorage.removeItem('dw_ai_conversation_id');
        window.location.href = '/login';
    }
};

// Expose globally for convenience (as used in settings.js)
window.isAuthenticated = checkAuthentication;
window.getCurrentUser = getCurrentUser;
window.showError = showError;
window.showSuccess = showSuccess;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.logout = window.pageAccess.logout;

