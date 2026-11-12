// DOM Elements
const sidebarLinks = document.querySelectorAll('.nav-menu a');
const sections = document.querySelectorAll('.section');
const userInfo = document.querySelector('.user-info');
const dropdownMenu = document.querySelector('.dropdown-menu');

// Toggle active section
function setActiveSection(sectionId) {
    // Hide all sections
    sections.forEach(section => {
        section.style.display = 'none';
    });

    // Show the selected section
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.style.display = 'block';
    }

    // Update active link in sidebar
    sidebarLinks.forEach(link => {
        link.parentElement.classList.remove('active');
        if (link.getAttribute('data-section') === sectionId) {
            link.parentElement.classList.add('active');
        }
    });
}

// Sidebar navigation
sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = link.getAttribute('data-section');
        setActiveSection(sectionId);
    });
});

// Toggle dropdown menu
if (userInfo && dropdownMenu) {
    userInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.style.display = dropdownMenu.style.display === 'block' ? 'none' : 'block';
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (dropdownMenu && !userInfo.contains(e.target)) {
            dropdownMenu.style.display = 'none';
        }
    });
}

// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.querySelector('.sidebar');

if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Show dashboard by default if user is logged in
    const token = localStorage.getItem('token');
    if (token) {
        setActiveSection('dashboard');
    }
});

// Handle window resize for responsive design
window.addEventListener('resize', () => {
    if (window.innerWidth > 992) {
        sidebar.classList.remove('active');
    }
});

// Form validation helper
function validateForm(fields) {
    let isValid = true;
    const errors = [];

    fields.forEach(field => {
        const element = document.getElementById(field.id);
        if (!element) return;

        if (field.required && !element.value.trim()) {
            errors.push(`${field.label} is required`);
            element.classList.add('error');
            isValid = false;
        } else if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(element.value)) {
            errors.push('Please enter a valid email address');
            element.classList.add('error');
            isValid = false;
        } else if (field.type === 'number' && isNaN(element.value)) {
            errors.push(`${field.label} must be a number`);
            element.classList.add('error');
            isValid = false;
        } else {
            element.classList.remove('error');
        }
    });

    return { isValid, errors };
}

// Format currency (PKR)
function formatCurrency(amount) {
    const number = parseFloat(amount || 0);
    return `${number.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

// Format date
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// Show loading state
function showLoading(show = true) {
    const loadingOverlay = document.getElementById('loading-overlay') || createLoadingOverlay();
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// Create loading overlay if it doesn't exist
function createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    `;

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.cssText = `
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;

    document.head.appendChild(style);
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);

    return overlay;
}

// Export functions to be used in other modules
window.App = {
    formatCurrency,
    formatDate,
    showLoading,
    validateForm,
    setActiveSection
};

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // Alt + S to Save
    if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();

        // Strategy: Find the most relevant "Save" button

        // 0. Check for data-action="save" (New Standard)
        const actionBtn = document.querySelector('[data-action="save"]');
        if (actionBtn && actionBtn.offsetParent !== null && !actionBtn.disabled) {
            actionBtn.click();
            return;
        }

        // 1. Check for buttons with specific IDs used in the app
        const specificIds = ['saveBtn', 'btnSave', 'submitBtn'];
        for (const id of specificIds) {
            const btn = document.getElementById(id);
            if (btn && btn.offsetParent !== null && !btn.disabled) {
                btn.click();
                return;
            }
        }

        // 2. Fallback: Find any visible button with "Save" in text
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const visibleSave = buttons.find(b =>
            (b.textContent.toLowerCase().includes('save') || b.value.toLowerCase().includes('save')) &&
            b.offsetParent !== null &&
            !b.disabled
        );

        if (visibleSave) {
            visibleSave.click();
        }
    }
});

