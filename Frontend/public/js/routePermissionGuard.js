/**
 * ROUTE PERMISSION GUARD - Frontend Authorization Check
 * 
 * This guard runs IMMEDIATELY on page load (BEFORE DOM renders) and checks 
 * if the user has permission to access the current page.
 * If not, redirects to /main with error message.
 * 
 * CRITICAL: Must run SYNCHRONOUSLY before any page rendering!
 */

(async function() {
    'use strict';

    // Mark the guard as loaded so duplicate injection is avoided
    window.__routePermissionGuardLoaded = true;

    // Run async check
    await checkRoutePermissionAsync();

    async function checkRoutePermissionAsync() {
        const path = window.location.pathname.toLowerCase();
        
        const skipPaths = ['/', '/login', '/main'];
        if (skipPaths.includes(path)) return;

        const userStr = localStorage.getItem('user');
        const token = localStorage.getItem('token');

        if (!userStr || !token) return;

        try {
            const user = JSON.parse(userStr);

            if (user.role === 'admin' || user.role === 'administrator' || user.role === 'superadmin') return;

            const requiredPermission = getPermissionForPath(path);
            if (!requiredPermission) return;

            const requiredPerms = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
            let userRights = user.rights || {};
            let hasPermission = requiredPerms.some(perm => userRights[perm] === true || userRights[perm] === 'true');

            if (!hasPermission) {
                // Local permissions missing. Let's do an async check to the server just in case
                // permissions were recently updated by an admin.
                console.log('[GUARD] Local permissions missing. Checking with server asynchronously...');
                
                // Hide body during async check to prevent flashing unauthorized content
                const originalDisplay = document.body ? document.body.style.display : '';
                if (document.body) document.body.style.display = 'none';
                
                try {
                    const response = await fetch('/api/v1/auth/me', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data && data.rights) {
                            localStorage.setItem('user', JSON.stringify(data));
                            userRights = data.rights;
                            hasPermission = requiredPerms.some(perm => userRights[perm] === true || userRights[perm] === 'true');
                            console.log('[GUARD] Async server check completed. Has permission:', hasPermission);
                        }
                    }
                } catch (err) {
                    console.warn('[GUARD] Async fetch failed:', err);
                }

                if (!hasPermission) {
                    console.error(`[GUARD BLOCKED] User "${user.email}" DENIED access to ${path}`);
                    sessionStorage.setItem('errorMessage', `You don't have permission to access this page. Required: ${requiredPerms.join(' OR ')}`);
                    window.location.href = '/main';
                } else {
                    // Restore body visibility if permission was granted
                    if (document.body) document.body.style.display = originalDisplay;
                }
            }
        } catch (e) {
            console.error('[GUARD] Error in permission check:', e);
        }
    }

    function getPermissionForPath(path) {
        if (window.getRequiredPermissionsForPath) return window.getRequiredPermissionsForPath(path);

        if (window.routePermissionMap && typeof window.routePermissionMap === 'object') {
            const normalizedPath = path.toLowerCase();
            for (const [pathPattern, permission] of Object.entries(window.routePermissionMap)) {
                if (normalizedPath === pathPattern || normalizedPath.startsWith(pathPattern + '/')) {
                    return permission;
                }
            }
        }
        return null;
    }
})();
