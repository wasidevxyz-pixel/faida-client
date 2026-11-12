(() => {
  const FONT_MAP = {
    'times-new-roman': "'Times New Roman', Times, serif",
    'georgia': "Georgia, 'Times New Roman', serif",
    'segoe-ui': "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    'arial': 'Arial, Helvetica, sans-serif'
  };

  const THEME_MAP = {
    light: {
      bg: '#f0f2f5',
      surface: '#ffffff',
      surfaceMuted: '#f8f9fa',
      text: '#333333',
      border: '#e1e4e8'
    },
    dark: {
      bg: '#0f172a',
      surface: '#111827',
      surfaceMuted: '#1f2937',
      text: '#e5e7eb',
      border: '#374151'
    }
  };

  const STYLE_ID = 'user-preferences-style';

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch (_) {
      return {};
    }
  }

  function normalizePreferences(preferences = {}) {
    const theme = preferences.theme === 'dark' ? 'dark' : 'light';
    const fontFamily = FONT_MAP[preferences.fontFamily] ? preferences.fontFamily : 'times-new-roman';
    return { theme, fontFamily };
  }

  function ensureStyleTag() {
    let style = document.getElementById(STYLE_ID);
    if (style) return style;

    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --app-font-family: 'Times New Roman', Times, serif;
        --app-bg-color: #f0f2f5;
        --app-surface-color: #ffffff;
        --app-surface-muted: #f8f9fa;
        --app-text-color: #333333;
        --app-border-color: #e1e4e8;
      }

      html,
      body,
      input,
      button,
      select,
      textarea {
        font-family: var(--app-font-family) !important;
      }

      body {
        background-color: var(--app-bg-color) !important;
        color: var(--app-text-color) !important;
      }

      body[data-ui-theme="dark"] {
        color-scheme: dark;
      }

      body[data-ui-theme="light"] {
        color-scheme: light;
      }

      body[data-ui-theme="dark"],
      body[data-ui-theme="dark"] .main-content,
      body[data-ui-theme="dark"] .content-wrapper,
      body[data-ui-theme="dark"] .card,
      body[data-ui-theme="dark"] .modal-content,
      body[data-ui-theme="dark"] .dropdown-menu,
      body[data-ui-theme="dark"] .login-container,
      body[data-ui-theme="dark"] .info-card,
      body[data-ui-theme="dark"] .stat-card,
      body[data-ui-theme="dark"] .health-card,
      body[data-ui-theme="dark"] .form-section,
      body[data-ui-theme="dark"] .table,
      body[data-ui-theme="dark"] .table-responsive,
      body[data-ui-theme="dark"] .list-group-item,
      body[data-ui-theme="dark"] .tree-container,
      body[data-ui-theme="dark"] .table-container,
      body[data-ui-theme="dark"] .top-form,
      body[data-ui-theme="dark"] .bas-container,
      body[data-ui-theme="dark"] .bas-header,
      body[data-ui-theme="dark"] .rights-header {
        --bs-body-bg: #0f172a;
        --bs-body-color: #e5e7eb;
        --bs-emphasis-color: #f8fafc;
        --bs-secondary-bg: #111827;
        --bs-tertiary-bg: #172033;
        --bs-border-color: #334155;
        --bs-link-color: #93c5fd;
        --bs-link-hover-color: #bfdbfe;
        --bs-table-bg: #111827;
        --bs-table-color: #e5e7eb;
        --bs-table-striped-bg: #0f172a;
        --bs-table-striped-color: #e5e7eb;
        --bs-card-bg: #111827;
        --bs-dropdown-bg: #111827;
        --bs-dropdown-color: #e5e7eb;
        --bs-modal-bg: #111827;
        --bs-modal-color: #e5e7eb;
      }

      body, .main-content, .content-wrapper, .card, .modal-content, .dropdown-menu, .login-container, .info-card, .stat-card, .health-card, .form-section, .table, .table-responsive, .list-group-item {
        background-color: var(--app-surface-color) !important;
        color: var(--app-text-color) !important;
        border-color: var(--app-border-color) !important;
      }

      body[data-ui-theme="dark"] {
        background: #0b1220 !important;
      }

      body[data-ui-theme="dark"] .main-content,
      body[data-ui-theme="dark"] .content-wrapper,
      body[data-ui-theme="dark"] .card,
      body[data-ui-theme="dark"] .modal-content,
      body[data-ui-theme="dark"] .dropdown-menu,
      body[data-ui-theme="dark"] .info-card,
      body[data-ui-theme="dark"] .stat-card,
      body[data-ui-theme="dark"] .health-card,
      body[data-ui-theme="dark"] .form-section,
      body[data-ui-theme="dark"] .table,
      body[data-ui-theme="dark"] .table-responsive,
      body[data-ui-theme="dark"] .list-group-item,
      body[data-ui-theme="dark"] .tree-container,
      body[data-ui-theme="dark"] .table-container,
      body[data-ui-theme="dark"] .top-form,
      body[data-ui-theme="dark"] .bas-container,
      body[data-ui-theme="dark"] .bas-header,
      body[data-ui-theme="dark"] .rights-header {
        box-shadow: none !important;
      }

      body[data-ui-theme="dark"] .page-header,
      body[data-ui-theme="dark"] .top-nav,
      body[data-ui-theme="dark"] .dropdown-menu,
      body[data-ui-theme="dark"] .modal-content,
      body[data-ui-theme="dark"] .sidebar-container,
      body[data-ui-theme="dark"] .bas-header,
      body[data-ui-theme="dark"] .rights-header,
      body[data-ui-theme="dark"] .btn-bas-save,
      body[data-ui-theme="dark"] .btn-bas-edit {
        background-color: #172033 !important;
        color: #e5e7eb !important;
        border-color: #334155 !important;
      }

      body[data-ui-theme="dark"] .main-content,
      body[data-ui-theme="dark"] .content-wrapper,
      body[data-ui-theme="dark"] .card,
      body[data-ui-theme="dark"] .modal-content,
      body[data-ui-theme="dark"] .info-card,
      body[data-ui-theme="dark"] .stat-card,
      body[data-ui-theme="dark"] .health-card,
      body[data-ui-theme="dark"] .form-section,
      body[data-ui-theme="dark"] .tree-container,
      body[data-ui-theme="dark"] .table-container,
      body[data-ui-theme="dark"] .top-form,
      body[data-ui-theme="dark"] .dropdown-menu,
      body[data-ui-theme="dark"] .list-group-item {
        background-color: #111827 !important;
        border-color: #374151 !important;
      }

      body[data-ui-theme="dark"] .main-content,
      body[data-ui-theme="dark"] .content-wrapper {
        background-color: #0f172a !important;
      }

      body[data-ui-theme="dark"] .bg-white,
      body[data-ui-theme="dark"] .table-responsive.bg-white,
      body[data-ui-theme="dark"] .border.bg-white,
      body[data-ui-theme="dark"] [style*="background: white"],
      body[data-ui-theme="dark"] [style*="background-color: white"],
      body[data-ui-theme="dark"] [style*="background: #fff"],
      body[data-ui-theme="dark"] [style*="background-color: #fff"],
      body[data-ui-theme="dark"] [style*="background: #ffffff"],
      body[data-ui-theme="dark"] [style*="background-color: #ffffff"] {
        background-color: #111827 !important;
        color: #e5e7eb !important;
      }

      body[data-ui-theme="dark"] .text-dark,
      body[data-ui-theme="dark"] .text-body,
      body[data-ui-theme="dark"] .text-black,
      body[data-ui-theme="dark"] .text-muted {
        color: #e5e7eb !important;
      }

      body[data-ui-theme="dark"] .bg-light,
      body[data-ui-theme="dark"] .border-light,
      body[data-ui-theme="dark"] .table-light,
      body[data-ui-theme="dark"] .alert-light,
      body[data-ui-theme="dark"] .list-group-item-light {
        background-color: #172033 !important;
        border-color: #334155 !important;
        color: #e5e7eb !important;
      }

      body[data-ui-theme="dark"] .table,
      body[data-ui-theme="dark"] .table > :not(caption) > * > *,
      body[data-ui-theme="dark"] .table-responsive,
      body[data-ui-theme="dark"] .table-container,
      body[data-ui-theme="dark"] .tree-container,
      body[data-ui-theme="dark"] .top-form,
      body[data-ui-theme="dark"] .bas-container {
        background-color: #111827 !important;
        border-color: #334155 !important;
      }

      body[data-ui-theme="dark"] .table thead th,
      body[data-ui-theme="dark"] .table-bas thead th,
      body[data-ui-theme="dark"] .data-table thead th {
        background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%) !important;
        color: #f8fafc !important;
        border-color: #334155 !important;
      }

      body[data-ui-theme="dark"] .table tbody td,
      body[data-ui-theme="dark"] .table-bas tbody td,
      body[data-ui-theme="dark"] .data-table tbody td,
      body[data-ui-theme="dark"] .tree-container,
      body[data-ui-theme="dark"] .table-container,
      body[data-ui-theme="dark"] .top-form,
      body[data-ui-theme="dark"] .bas-container {
        color: #e5e7eb !important;
      }

      body[data-ui-theme="dark"] .form-control,
      body[data-ui-theme="dark"] .form-select,
      body[data-ui-theme="dark"] .input-group-text,
      body[data-ui-theme="dark"] .custom-select,
      body[data-ui-theme="dark"] .form-check-input,
      body[data-ui-theme="dark"] .select2-container--bootstrap-5 .select2-selection,
      body[data-ui-theme="dark"] .select2-dropdown,
      body[data-ui-theme="dark"] .select2-search__field {
        background-color: #0f172a !important;
        color: #e5e7eb !important;
        border-color: #475569 !important;
      }

      body[data-ui-theme="dark"] .form-control::placeholder,
      body[data-ui-theme="dark"] .select2-search__field::placeholder {
        color: #94a3b8 !important;
      }

      body[data-ui-theme="dark"] .btn-light,
      body[data-ui-theme="dark"] .btn-outline-light,
      body[data-ui-theme="dark"] .dropdown-item,
      body[data-ui-theme="dark"] .nav-link,
      body[data-ui-theme="dark"] .checkbox-label,
      body[data-ui-theme="dark"] .form-label,
      body[data-ui-theme="dark"] .info-label,
      body[data-ui-theme="dark"] .server-info-label,
      body[data-ui-theme="dark"] .server-info-value,
      body[data-ui-theme="dark"] .text-muted,
      body[data-ui-theme="dark"] .small,
      body[data-ui-theme="dark"] .form-text {
        color: #cbd5e1 !important;
      }

      body[data-ui-theme="dark"] .dropdown-item:hover,
      body[data-ui-theme="dark"] .nav-link:hover,
      body[data-ui-theme="dark"] .list-group-item:hover {
        background-color: #1e293b !important;
        color: #ffffff !important;
      }

      body[data-ui-theme="dark"] .table-striped > tbody > tr:nth-of-type(odd) > * {
        --bs-table-accent-bg: rgba(255,255,255,0.02);
      }

      body[data-ui-theme="dark"] .btn-primary {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;
        border-color: #1d4ed8 !important;
      }

      body[data-ui-theme="dark"] .btn-secondary,
      body[data-ui-theme="dark"] .btn-outline-secondary {
        background-color: #334155 !important;
        color: #e5e7eb !important;
        border-color: #475569 !important;
      }
    `;
    document.head.appendChild(style);
    return style;
  }

  function applyPreferences(preferences = {}) {
    const resolved = normalizePreferences(preferences);
    const themeTokens = THEME_MAP[resolved.theme];
    const fontFamily = FONT_MAP[resolved.fontFamily];
    const root = document.documentElement;

    ensureStyleTag();

    root.dataset.uiTheme = resolved.theme;
    root.dataset.uiFontFamily = resolved.fontFamily;
    root.setAttribute('data-bs-theme', resolved.theme);
    root.classList.toggle('theme-dark', resolved.theme === 'dark');
    root.classList.toggle('theme-light', resolved.theme === 'light');
    root.style.setProperty('--app-font-family', fontFamily);
    root.style.setProperty('--app-bg-color', themeTokens.bg);
    root.style.setProperty('--app-surface-color', themeTokens.surface);
    root.style.setProperty('--app-surface-muted', themeTokens.surfaceMuted);
    root.style.setProperty('--app-text-color', themeTokens.text);
    root.style.setProperty('--app-border-color', themeTokens.border);

    if (document.body) {
      document.body.dataset.uiTheme = resolved.theme;
      document.body.dataset.uiFontFamily = resolved.fontFamily;
      document.body.setAttribute('data-bs-theme', resolved.theme);
    }

    return resolved;
  }

  function syncFromStoredUser() {
    const user = getCurrentUser();
    return applyPreferences(user.preferences || {});
  }

  window.applyUserPreferences = syncFromStoredUser;
  window.setUserPreferences = applyPreferences;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncFromStoredUser, { once: true });
  } else {
    syncFromStoredUser();
  }

  window.addEventListener('storage', event => {
    if (event.key === 'user') {
      syncFromStoredUser();
    }
  });
})();