// Connection Monitor - Detects when server is down OR restarted
(function () {
    let checkInterval;
    let failedAttempts = 0;
    const MAX_FAILED_ATTEMPTS = 3;
    const CHECK_INTERVAL = 30000; // Check every 30 seconds (was 5s — reduced to cut API load)

    function checkServerConnection() {
        const token = localStorage.getItem('token');
        // If not logged in, we might typically skip this, but monitoring server health is good anyway.
        // However, forcing logout on restart only makes sense if we are logged in.

        // Wait, if we are on login page, we don't need to force logout on restart.
        if (window.location.pathname.includes('login')) {
            return;
        }

        fetch('/api/v1/health', {
            method: 'GET',
            cache: 'no-cache'
        })
            .then(response => {
                if (response.ok) {
                    failedAttempts = 0;
                    return response.json();
                } else {
                    handleConnectionLost();
                    throw new Error('Connection lost');
                }
            })
            .then(data => {
                // Logic for Server Restart Detection
                if (data && data.server && data.server.startTime) {
                    const currentStartTime = String(data.server.startTime);
                    const storedStartTime = sessionStorage.getItem('server_start_time');

                    if (!storedStartTime) {
                        // First run in this session, store it
                        sessionStorage.setItem('server_start_time', currentStartTime);
                    } else if (storedStartTime !== currentStartTime) {
                        // Server instance changed!
                        console.warn('Server restart detected. Stored:', storedStartTime, 'Current:', currentStartTime);
                        handleServerRestart();
                    }
                }
            })
            .catch((err) => {
                if (err.message !== 'Connection lost') {
                    handleConnectionLost();
                }
            });
    }

    function handleServerRestart() {
        // Stop monitoring
        clearInterval(checkInterval);

        // 1. Clear Auth Data immediately
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.clear();

        // 2. Show Overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            color: white;
            font-family: 'Segoe UI', sans-serif;
            backdrop-filter: blur(5px);
        `;

        overlay.innerHTML = `
            <div style="text-align: center; padding: 40px; max-width: 500px; animation: fadeIn 0.5s ease-out;">
                <div style="
                    width: 80px; height: 80px; 
                    background: rgba(231, 76, 60, 0.2); 
                    border: 2px solid #e74c3c;
                    border-radius: 50%; 
                    display: flex; align-items: center; justify-content: center; 
                    margin: 0 auto 30px;
                    box-shadow: 0 0 20px rgba(231, 76, 60, 0.3);
                ">
                    <i class="fas fa-sync-alt fa-spin" style="font-size: 32px; color: #e74c3c;"></i>
                </div>
                <h2 style="margin-bottom: 15px; font-weight: 600;">System Restarted</h2>
                <p style="margin-bottom: 30px; color: #ccc; font-size: 1.1rem;">
                    The backend server has been restarted.<br>
                    Please sign in again to continue.
                </p>
                
                <div style="
                    background: rgba(255,255,255,0.1); 
                    padding: 4px; 
                    border-radius: 20px; 
                    margin-bottom: 20px;
                    width: 100%;
                    max-width: 300px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    <div class="progress-bar" style="
                        width: 0%; 
                        height: 6px; 
                        background: #3498db; 
                        border-radius: 10px;
                        transition: width 2.5s linear;
                    "></div>
                </div>

                <div style="color: #888; font-size: 0.9rem; margin-top: 10px;">
                    Redirecting to login...
                </div>
            </div>
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
            </style>
        `;

        document.body.appendChild(overlay);

        // Start progress bar
        setTimeout(() => {
            const bar = overlay.querySelector('.progress-bar');
            if (bar) bar.style.width = '100%';
        }, 100);

        // 3. Redirect
        setTimeout(() => {
            window.location.href = '/login?reason=server_restart';
        }, 2800);
    }

    function handleConnectionLost() {
        failedAttempts++;

        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
            // Server is down - show message and close/redirect
            clearInterval(checkInterval);

            // Create overlay
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                color: white;
                font-family: Arial, sans-serif;
            `;

            overlay.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 64px; color: #ff6b6b; margin-bottom: 20px;"></i>
                    <h2 style="margin-bottom: 20px;">Server Connection Lost</h2>
                    <p style="margin-bottom: 30px; color: #ccc;">The server has been stopped or is not responding.</p>
                    <button onclick="window.close()" style="
                        background: #667eea;
                        color: white;
                        border: none;
                        padding: 12px 30px;
                        border-radius: 6px;
                        font-size: 16px;
                        cursor: pointer;
                        margin-right: 10px;
                    ">Close Window</button>
                    <button onclick="location.reload()" style="
                        background: #51cf66;
                        color: white;
                        border: none;
                        padding: 12px 30px;
                        border-radius: 6px;
                        font-size: 16px;
                        cursor: pointer;
                    ">Retry Connection</button>
                </div>
            `;

            document.body.appendChild(overlay);

            // Try to close the window (may not work in all browsers)
            setTimeout(() => {
                window.close();
            }, 10000); // Auto-close after 10 seconds if possible
        }
    }

    // Start monitoring when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Delay first health check by 15 seconds to avoid competing with page load
        setTimeout(() => {
            checkInterval = setInterval(checkServerConnection, CHECK_INTERVAL);
        }, 15000);
        });
    } else {
        // Delay first health check by 15 seconds to avoid competing with page load
        setTimeout(() => {
            checkInterval = setInterval(checkServerConnection, CHECK_INTERVAL);
        }, 15000);
    }
})();

