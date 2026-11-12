/**
 * BW Software Agency - Modern 3D Animated Login Controller
 * Fully isolated within an IIFE; preserves existing authentication endpoints and sessions.
 */
(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const rootEl = document.getElementById('basModernLoginRoot');
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const alertBox = document.getElementById('alertBox');
    const submitBtn = document.getElementById('submitBtn');
    const themeDarkBtn = document.getElementById('themeDarkBtn');
    const themeLightBtn = document.getElementById('themeLightBtn');
    const cursorGlow = document.getElementById('basCursorGlow');
    const scene3d = document.getElementById('bas3dScene');

    // =========================================================================
    // 1. Theme Management (Dark & Light) - Scoped to Login Root Only
    // =========================================================================
    const THEME_STORAGE_KEY = 'bas_login_theme';

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
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (e) {
        /* ignore storage quota / disabled errors */
      }
    }

    // Initialize Theme
    let savedTheme = 'dark';
    try {
      savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    } catch (e) {
      savedTheme = 'dark';
    }
    applyTheme(savedTheme);

    if (themeDarkBtn) {
      themeDarkBtn.addEventListener('click', () => applyTheme('dark'));
    }
    if (themeLightBtn) {
      themeLightBtn.addEventListener('click', () => applyTheme('light'));
    }

    // =========================================================================
    // 2. Remember Me Pre-fill
    // =========================================================================
    const SAVED_LOGIN_KEY = 'bas_saved_login_id';
    try {
      const savedLoginId = localStorage.getItem(SAVED_LOGIN_KEY);
      if (savedLoginId && emailInput) {
        emailInput.value = savedLoginId;
        if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        // Auto-focus password if username is already filled
        if (passwordInput) {
          setTimeout(() => passwordInput.focus(), 200);
        }
      }
    } catch (e) {
      /* ignore */
    }

    // =========================================================================
    // 3. Password Show / Hide Toggle
    // =========================================================================
    if (togglePasswordBtn && passwordInput) {
      togglePasswordBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        
        const icon = togglePasswordBtn.querySelector('i');
        if (icon) {
          if (isPassword) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
            togglePasswordBtn.setAttribute('aria-label', 'Hide password');
          } else {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
            togglePasswordBtn.setAttribute('aria-label', 'Show password');
          }
        }
      });
    }

    // =========================================================================
    // 4. Alert Box Helper
    // =========================================================================
    function showAlert(message, type = 'danger') {
      if (!alertBox) return;
      alertBox.className = 'bas-login-alert show ' + type;
      let icon = '<i class="fas fa-exclamation-circle"></i>';
      if (type === 'info') icon = '<i class="fas fa-info-circle"></i>';
      if (type === 'warning') icon = '<i class="fas fa-exclamation-triangle"></i>';

      alertBox.innerHTML = `${icon} <span>${message}</span>`;
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideAlert() {
      if (!alertBox) return;
      alertBox.className = 'bas-login-alert';
      alertBox.innerHTML = '';
    }

    // =========================================================================
    // 5. URL Query Message (e.g. Server Restart Notification)
    // =========================================================================
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('reason') === 'server_restart') {
        showAlert('System was restarted. Please sign in again to continue.', 'warning');
        // Clean URL without reload
        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    } catch (e) {
      /* ignore */
    }

    // =========================================================================
    // 6. Forgot Password Action
    // =========================================================================
    if (forgotPasswordLink) {
      forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        showAlert('Please contact your BW SOFTWARE AGENCY system administrator to reset credentials.', 'info');
      });
    }

    // =========================================================================
    // 7. Login Submission & Authentication
    // =========================================================================
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();

        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (!email) {
          showAlert('Please enter your Login ID or Username.');
          if (emailInput) emailInput.focus();
          return;
        }

        if (!password) {
          showAlert('Please enter your password.');
          if (passwordInput) passwordInput.focus();
          return;
        }

        // Set Loading State
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="bas-spinner"></span> <span>Signing in...</span>';
        }

        try {
          const res = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
          });

          let data;
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            data = await res.json();
          } else {
            const rawText = await res.text();
            data = { message: rawText || 'Server response error.' };
          }

          if (res.ok && data.token) {
            // Save Token & User Session exactly as existing application expects
            localStorage.setItem('token', data.token);
            if (data.user) {
              localStorage.setItem('user', JSON.stringify(data.user));
            }
            // Clear temporary AI assistant chat state if any
            localStorage.removeItem('dw_ai_chat');
            localStorage.removeItem('dw_ai_conversation_id');
            // Reset idle timer to prevent instant session expiry
            localStorage.setItem('lastActivity', Date.now());

            // Handle Remember Me option
            if (rememberMeCheckbox && rememberMeCheckbox.checked) {
              localStorage.setItem(SAVED_LOGIN_KEY, email);
            } else {
              localStorage.removeItem(SAVED_LOGIN_KEY);
            }

            // Redirect smoothly to ERP Main Dashboard
            window.location.href = '/main';
          } else {
            // Handle error messages from express-validator or auth controller
            let errorMsg = 'Invalid credentials. Please verify your login details.';
            if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
              errorMsg = data.errors[0].msg || data.errors[0].message || errorMsg;
            } else if (data.message || data.msg) {
              errorMsg = data.message || data.msg;
            }
            throw new Error(errorMsg);
          }
        } catch (err) {
          showAlert(err.message || 'Unable to connect to the server. Please check your network.');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Sign In</span> <i class="fas fa-arrow-right bas-btn-arrow"></i>';
          }
        }
      });
    }

    // =========================================================================
    // 8. Interactive 3D Parallax & Ambient Lighting Engine
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

      // Track cursor position with passive listener for maximum responsiveness
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
        const deltaX = targetRotX - currentRotX;
        const deltaY = targetRotY - currentRotY;

        if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) {
          currentRotX = targetRotX;
          currentRotY = targetRotY;
          scene3d.style.transform = `rotateX(${currentRotX.toFixed(2)}deg) rotateY(${currentRotY.toFixed(2)}deg)`;
          isAnimating = false;
          return; // Idle when mouse is resting
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
