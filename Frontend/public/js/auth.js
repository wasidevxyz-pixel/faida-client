// Authentication JavaScript
document.addEventListener('DOMContentLoaded', function () {
    const token = localStorage.getItem('token');
    const expired = isTokenExpired();

    if (token && !expired) {
        window.location.href = '/dashboard';
        return;
    }

    if (expired) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('dw_ai_chat');
        localStorage.removeItem('dw_ai_conversation_id');
    }

    const loginMessage = sessionStorage.getItem('loginMessage');
    if (loginMessage) {
        showAlert(loginMessage, 'error');
        sessionStorage.removeItem('loginMessage');
    }

    initializeLoginForm();
});

// Initialize login form
function initializeLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const alertContainer = document.getElementById('alertContainer');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    const btnText = loginBtn.querySelector('.btn-text');
    const spinner = loginBtn.querySelector('.loading-spinner');
    const alertContainer = document.getElementById('alertContainer');

    // Show loading state
    loginBtn.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'inline-block';

    try {
        const response = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Store token and user data
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            // Reset idle timer to prevent immediate logout
            localStorage.setItem('lastActivity', Date.now());

            // Show success message
            showAlert('Login successful! Redirecting...', 'success');

            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        } else {
            showAlert(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Network error. Please try again.', 'error');
    } finally {
        // Reset loading state
        loginBtn.disabled = false;
        btnText.style.display = 'inline';
        spinner.style.display = 'none';
    }
}

// Show alert message
function showAlert(message, type = 'success') {
    const alertContainer = document.getElementById('alertContainer');

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'error' ? 'danger' : 'success'} alert-dismissible fade show`;
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

// Check if user is authenticated
function isAuthenticated() {
    const token = localStorage.getItem('token');
    if (!token) return false;
    return !isTokenExpired();
}

// Get current user
function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
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

// Logout user
async function logout() {
    try {
        // Call logout endpoint (optional, for server-side tracking)
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

    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('dw_ai_chat');
    localStorage.removeItem('dw_ai_conversation_id');

    // Redirect to login page
    window.location.href = '/login';
}

// Show loading spinner
function showLoading() {
    // Implementation for showing loading state
}

// Hide loading spinner
function hideLoading() {
    // Implementation for hiding loading state
}

// Show success message
function showSuccess(message) {
    showAlert(message, 'success');
}

// Show error message
function showError(message) {
    showAlert(message, 'error');
}

// Show warning message
function showWarning(message) {
    showAlert(message, 'warning');
}

