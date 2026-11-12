/**
 * INLINE PERMISSION GUARD - Must be loaded SYNCHRONOUSLY at top of every page
 * Add this BEFORE any other scripts in the HTML <head> tag
 * 
 * This runs immediately and blocks page load if user lacks permission
 */

(function() {
    'use strict';

    if (window.__routePermissionGuardLoaded) return;

    const head = document.head || document.getElementsByTagName('head')[0];

    const mapScript = document.createElement('script');
    mapScript.src = '/js/permissionMaps.js?v=' + Date.now();
    mapScript.async = false;
    mapScript.defer = false;
    head.appendChild(mapScript);

    const guardScript = document.createElement('script');
    guardScript.src = '/js/routePermissionGuard.js?v=' + Date.now();
    guardScript.async = false;
    guardScript.defer = false;
    head.appendChild(guardScript);
})();
