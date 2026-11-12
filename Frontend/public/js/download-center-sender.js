// ═══════════════════════════════════════════════════════════════════════════════
// DOWNLOAD CENTER VECTOR REPORT CLIENT — Global Utility
// ═══════════════════════════════════════════════════════════════════════════════
//
// Generates clean, 100% same-to-same vector PDF documents directly from the rendered
// on-screen report and sends them to Download Center or triggers direct download.
// ZERO recalculation errors / 100% pixel-perfect match with active monitor view.
//
(function () {
    'use strict';

    const DC_ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.rtf', '.ppt', '.pptx'];
    const DC_MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

    /**
     * Extract on-screen summary metric cards
     */
    function extractPageMetricCards() {
        const cards = [];
        try {
            const cardEls = document.querySelectorAll('.summary-cards .summary-card, .dc-stat-card, .stats-card, .metric-card');
            if (cardEls.length > 0) {
                cardEls.forEach(el => {
                    const label = el.querySelector('.label, .card-title, .title, small')?.innerText?.trim() || '';
                    const value = el.querySelector('.value, .card-value, h3, h4, strong')?.innerText?.trim() || '';
                    let color = 'blue';
                    if (/cost|loss|expense|debit/i.test(label) || el.classList.contains('teal') || el.classList.contains('red')) color = 'red';
                    else if (/paid|pending|warning/i.test(label) || el.classList.contains('orange') || el.classList.contains('yellow')) color = 'yellow';
                    else if (/balance|profit|net/i.test(label) || el.classList.contains('green')) color = 'green';

                    if (label && value) {
                        cards.push({ label, value, color });
                    }
                });
            } else {
                const salesVal = document.getElementById('totalSales')?.innerText?.trim();
                const costVal = document.getElementById('totalCost')?.innerText?.trim();
                const paidVal = document.getElementById('totalPaid')?.innerText?.trim();
                const balVal = document.getElementById('totalBalance')?.innerText?.trim();
                if (salesVal && costVal) {
                    cards.push({ label: 'Total Sales', value: salesVal, color: 'blue' });
                    cards.push({ label: 'Total Cost', value: costVal, color: 'red' });
                    cards.push({ label: 'Total Paid', value: paidVal || '0', color: 'yellow' });
                    cards.push({ label: 'Total Balance', value: balVal || '0', color: 'green' });
                }
            }
        } catch (e) {
            console.warn('[DC-METRICS] Could not extract metric cards:', e);
        }
        return cards;
    }

    /**
     * Locate the best printable container on the page
     */
    function findBestReportContainer() {
        // 1. Explicit printable areas
        const explicitSel = '#printableArea, #printArea, .printableArea, .print-container, #reportContainer, .report-container, .report-shell, .report-card, #reportCard';
        const explicitEl = document.querySelector(explicitSel);
        if (explicitEl && explicitEl.innerText.trim().length > 0) {
            return explicitEl;
        }

        // 2. Look for table(s)
        const tables = document.querySelectorAll('.data-table, .report-table, .table, table');
        if (tables.length > 0) {
            if (tables.length === 1) {
                return tables[0].closest('.data-panel, .report-card, .card-body, .card, .container-fluid, main') || tables[0].parentElement;
            }
            const main = document.querySelector('main, .main-content, .content-wrapper, .container-fluid, .container');
            if (main) return main;
            return tables[0].closest('.container-fluid, body') || document.body;
        }

        // 3. Fallback to main or body
        return document.querySelector('main, .main-content, .content-wrapper') || document.body;
    }

    /**
     * Detect orientation based on page CSS rules, column counts, or container width
     */
    function detectReportOrientation(container, options = {}) {
        if (options.orientation) return options.orientation;

        // 1. Check if page styles specify landscape
        try {
            const styles = Array.from(document.querySelectorAll('style'));
            for (const s of styles) {
                if (/size\s*:\s*[^;]*landscape/i.test(s.innerText)) {
                    return 'landscape';
                }
            }
        } catch (e) {}

        // 2. Count table columns
        const table = container.querySelector('table');
        if (table) {
            const headerThs = table.querySelectorAll('thead th, tr:first-child th, tr:first-child td');
            if (headerThs.length >= 6) {
                return 'landscape';
            }
        }

        // 3. Check width
        const w = container.offsetWidth || window.innerWidth || 0;
        if (w > 880) {
            return 'landscape';
        }

        return 'portrait';
    }

    /**
     * Build full rendered HTML package with all page stylesheets, fonts, and print optimizations
    /**
     * Intelligently detect report title while filtering out generic company names like "Dwatson"
     */
    function detectReportTitle(options = {}) {
        if (options.title && String(options.title).trim()) {
            return String(options.title).trim();
        }

        const isGeneric = (t) => {
            if (!t) return true;
            const cleaned = t.trim().toLowerCase();
            return /^(dwatson|d\.?\s*watson|dwatsons|bas|bas software|menu|dashboard|system|admin|all branches|logo)$/i.test(cleaned);
        };

        // 1. Explicit report title elements
        const specificSel = '.report-title, .report-name, #reportTitle, .page-title, .header-title-text';
        const specificEl = document.querySelector(specificSel);
        if (specificEl && specificEl.innerText.trim() && !isGeneric(specificEl.innerText.trim())) {
            return specificEl.innerText.trim();
        }

        // 2. Headings inside print headers (excluding company name)
        const printHeaders = document.querySelectorAll('.print-header, .watson-print-header');
        for (const ph of printHeaders) {
            const subs = ph.querySelectorAll('h2, h3, h4, .subtitle, p, span');
            for (const sub of subs) {
                const txt = sub.innerText?.trim();
                if (txt && !isGeneric(txt) && txt.length > 2) {
                    return txt;
                }
            }
        }

        // 3. Headings on the page (h2, h3, h1, etc.)
        const pageHeadings = document.querySelectorAll('.page-header h1, .page-header h2, .page-header h3, .page-header h4, .hero-header h2, h2, h3, h1');
        for (const h of pageHeadings) {
            const txt = h.innerText?.trim();
            if (txt && !isGeneric(txt) && txt.length > 3) {
                return txt;
            }
        }

        // 4. Page document title
        let docTitle = document.title || '';
        docTitle = docTitle.replace(/[-|]\s*(BAS\s*Software|BAS|Dwatson|ERP|D\.Watson).*$/i, '').trim();
        if (docTitle && !isGeneric(docTitle) && docTitle.length > 2) {
            return docTitle;
        }

        return 'Report';
    }

    /**
     * Interactive Branch Selection & Document Confirmation Dialog
     */
    async function promptBranchSelection(options = {}) {
        const defaultTitle = options.title || detectReportTitle(options) || 'Report';
        const defaultBranch = (options.defaultBranch || '').trim();

        // Load branches (Prefer main store branches over sub-branches)
        let branches = [];
        try {
            if (typeof window.getGlobalBranches === 'function') {
                branches = await window.getGlobalBranches();
            } else {
                const token = localStorage.getItem('token');
                let res = await fetch('/api/v1/stores', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                let data = await res.json();
                if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
                    branches = data.data.map(b => (b.name || b.storeName || b.branch || '').trim()).filter(Boolean);
                } else {
                    res = await fetch('/api/v1/sub-branches', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    data = await res.json();
                    if (data && data.success && Array.isArray(data.data)) {
                        branches = data.data.map(b => (b.name || b.branch || '').trim()).filter(Boolean);
                    }
                }
            }
        } catch (e) {
            console.warn('[DC-PROMPT] Could not load branches:', e);
        }

        branches = [...new Set(branches)].filter(Boolean).sort();

        const hasMatchedBranch = defaultBranch && branches.some(b => 
            b.toLowerCase() === defaultBranch.toLowerCase() || 
            b.replace(/[()]/g, '').trim().toLowerCase() === defaultBranch.replace(/[()]/g, '').trim().toLowerCase()
        );

        return new Promise((resolve) => {
            const existingModal = document.getElementById('dcBranchPromptModal');
            if (existingModal) existingModal.remove();

            const modalOverlay = document.createElement('div');
            modalOverlay.id = 'dcBranchPromptModal';
            modalOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.65);backdrop-filter:blur(3px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:15px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;';

            let branchOptionsHtml = '<option value="">-- Select Target Branch --</option>';
            branches.forEach(b => {
                const isSelected = hasMatchedBranch && (
                    b.toLowerCase() === defaultBranch.toLowerCase() || 
                    b.replace(/[()]/g, '').trim().toLowerCase() === defaultBranch.replace(/[()]/g, '').trim().toLowerCase()
                );
                branchOptionsHtml += `<option value="${b}" ${isSelected ? 'selected' : ''}>${b}</option>`;
            });

            modalOverlay.innerHTML = `
                <div style="background:#fff;border-radius:12px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.25),0 8px 10px -6px rgba(0,0,0,0.1);width:100%;max-width:480px;overflow:hidden;border:1px solid #cbd5e1;">
                    <div style="background:#1e3a5f;color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;">
                        <div style="display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.05rem;">
                            <i class="fas fa-cloud-upload-alt" style="color:#60a5fa;"></i>
                            <span>Send to Download Center</span>
                        </div>
                        <button type="button" id="dcModalCloseX" style="background:none;border:none;color:#cbd5e1;font-size:1.4rem;cursor:pointer;line-height:1;padding:0;">&times;</button>
                    </div>
                    <div style="padding:20px;">
                        <div style="margin-bottom:16px;">
                            <label style="display:block;font-size:0.85rem;font-weight:600;color:#334155;margin-bottom:6px;">Document / Report Name:</label>
                            <input type="text" id="dcModalDocTitleInput" value="${defaultTitle.replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;padding:8px 12px;font-size:0.92rem;border:1px solid #94a3b8;border-radius:6px;outline:none;" />
                            <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">Customize the document title before sending (avoids generic names).</div>
                        </div>

                        <div style="margin-bottom:16px;">
                            <label style="display:block;font-size:0.85rem;font-weight:600;color:#334155;margin-bottom:8px;">Who can view this document?</label>
                            
                            <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;margin-bottom:8px;background:#f8fafc;">
                                <input type="radio" name="dcAudienceChoice" id="dcAudienceChoiceAll" value="all" ${hasMatchedBranch ? '' : 'checked'} style="margin-top:3px;cursor:pointer;" />
                                <div>
                                    <div style="font-weight:600;color:#1e293b;font-size:0.9rem;">🌐 All Branches</div>
                                    <div style="font-size:0.78rem;color:#64748b;">Shared with all branches in the company.</div>
                                </div>
                            </label>

                            <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;background:#f8fafc;">
                                <input type="radio" name="dcAudienceChoice" id="dcAudienceChoiceSpecific" value="specific" ${hasMatchedBranch ? 'checked' : ''} style="margin-top:3px;cursor:pointer;" />
                                <div>
                                    <div style="font-weight:600;color:#1e293b;font-size:0.9rem;">🏢 Specific Branch</div>
                                    <div style="font-size:0.78rem;color:#64748b;">Only users attached to this branch can view and download.</div>
                                </div>
                            </label>

                            <div id="dcModalBranchDropdownWrap" style="display:${hasMatchedBranch ? 'block' : 'none'};margin-top:10px;padding-left:26px;">
                                <select id="dcModalBranchSelectEl" style="width:100%;box-sizing:border-box;padding:8px 12px;font-size:0.88rem;border:1px solid #3b82f6;border-radius:6px;background:#fff;outline:none;">
                                    ${branchOptionsHtml}
                                </select>
                            </div>
                        </div>

                        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 12px;font-size:0.8rem;color:#1e40af;display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-bell" style="color:#2563eb;font-size:0.95rem;"></i>
                            <span>Users of the selected branch will automatically receive an instant notification.</span>
                        </div>
                    </div>

                    <div style="background:#f1f5f9;padding:12px 20px;display:flex;align-items:center;justify-content:flex-end;gap:10px;border-top:1px solid #e2e8f0;">
                        <button type="button" id="dcModalCancelBtn" style="padding:7px 16px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:600;font-size:0.85rem;cursor:pointer;">Cancel</button>
                        <button type="button" id="dcModalConfirmBtn" style="padding:7px 18px;border-radius:6px;border:none;background:#1e4c8c;color:#fff;font-weight:600;font-size:0.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 4px rgba(30,76,140,0.3);">
                            <i class="fas fa-paper-plane"></i>
                            <span>Send Document</span>
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modalOverlay);

            const radioAll = modalOverlay.querySelector('#dcAudienceChoiceAll');
            const radioSpecific = modalOverlay.querySelector('#dcAudienceChoiceSpecific');
            const dropdownWrap = modalOverlay.querySelector('#dcModalBranchDropdownWrap');
            const branchSelect = modalOverlay.querySelector('#dcModalBranchSelectEl');
            const titleInput = modalOverlay.querySelector('#dcModalDocTitleInput');
            const confirmBtn = modalOverlay.querySelector('#dcModalConfirmBtn');
            const cancelBtn = modalOverlay.querySelector('#dcModalCancelBtn');
            const closeX = modalOverlay.querySelector('#dcModalCloseX');

            radioAll.addEventListener('change', () => { dropdownWrap.style.display = 'none'; });
            radioSpecific.addEventListener('change', () => {
                dropdownWrap.style.display = 'block';
                branchSelect.focus();
            });

            const cleanupAndClose = () => {
                modalOverlay.remove();
            };

            cancelBtn.addEventListener('click', () => {
                cleanupAndClose();
                resolve(null);
            });

            closeX.addEventListener('click', () => {
                cleanupAndClose();
                resolve(null);
            });

            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    cleanupAndClose();
                    resolve(null);
                }
            });

            confirmBtn.addEventListener('click', () => {
                const titleVal = titleInput.value.trim() || defaultTitle;
                let targetBranches = [];

                if (radioSpecific.checked) {
                    const selectedBranch = branchSelect.value;
                    if (!selectedBranch) {
                        alert('Please select a specific branch from the dropdown.');
                        branchSelect.focus();
                        return;
                    }
                    targetBranches = [selectedBranch];
                }

                cleanupAndClose();
                resolve({
                    title: titleVal,
                    targetBranches: targetBranches
                });
            });
        });
    }

    /**
     * Build full rendered HTML package with all page stylesheets, fonts, and print optimizations
     */
    function buildRenderedReportPackage(options = {}) {
        const container = options.container || findBestReportContainer();
        if (!container) return null;

        // 1. Determine title
        const reportTitle = options.title || detectReportTitle(options);

        // 2. Clone container so live DOM is untouched
        const clone = container.cloneNode(true);

        // Prepend external print-header if page has one outside container
        const pagePrintHeader = document.querySelector('.print-header, .watson-print-header');
        if (pagePrintHeader && !clone.querySelector('.print-header, .watson-print-header')) {
            const phClone = pagePrintHeader.cloneNode(true);
            phClone.style.display = 'block';
            phClone.style.visibility = 'visible';
            clone.insertBefore(phClone, clone.firstChild);
        }

        // Remove buttons, navigation, filters, inputs, modals, and toasts from clone
        const removeSelectors = [
            '.no-print',
            '.btn-no-print',
            '.btn-print-hide',
            '.sidebar',
            '#sidebarToggle',
            '#dc-sender-toast',
            '.toast',
            '.modal',
            'script',
            'noscript',
            'iframe',
            '.controls-card',
            '.filter-panel',
            '.quick-filters',
            '.page-header:not(.print-header)',
            'button',
            '.btn:not(.badge)',
            '.dataTables_filter',
            '.dataTables_length',
            '.dataTables_paginate',
            '.pagination',
            '#btnSendToDownloadCenter',
            '#printReportHeaderBtn'
        ];
        clone.querySelectorAll(removeSelectors.join(', ')).forEach(el => el.remove());

        // Replace canvas elements with images
        const originalCanvases = container.querySelectorAll('canvas');
        const clonedCanvases = clone.querySelectorAll('canvas');
        if (originalCanvases.length > 0 && originalCanvases.length === clonedCanvases.length) {
            for (let i = 0; i < originalCanvases.length; i++) {
                try {
                    const img = document.createElement('img');
                    img.src = originalCanvases[i].toDataURL('image/png');
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    clonedCanvases[i].replaceWith(img);
                } catch (e) {}
            }
        }

        // Convert image sources to absolute URLs
        clone.querySelectorAll('img').forEach(img => {
            if (img.src && !img.src.startsWith('data:') && !img.src.startsWith('http')) {
                try {
                    img.src = new URL(img.getAttribute('src'), window.location.origin).href;
                } catch (e) {}
            }
        });

        // Ensure form inputs display current text values
        const originalInputs = container.querySelectorAll('input, select, textarea');
        const clonedInputs = clone.querySelectorAll('input, select, textarea');
        if (originalInputs.length === clonedInputs.length) {
            for (let i = 0; i < originalInputs.length; i++) {
                const orig = originalInputs[i];
                const cl = clonedInputs[i];
                if (cl.tagName === 'INPUT' || cl.tagName === 'TEXTAREA') {
                    const span = document.createElement('span');
                    span.innerText = orig.value || '';
                    span.className = 'printed-input-val';
                    cl.replaceWith(span);
                } else if (cl.tagName === 'SELECT') {
                    const span = document.createElement('span');
                    span.innerText = orig.options[orig.selectedIndex]?.text || orig.value || '';
                    span.className = 'printed-select-val';
                    cl.replaceWith(span);
                }
            }
        }

        // 3. Collect stylesheets
        let stylesHtml = `<base href="${window.location.origin}/">\n`;

        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const href = link.href;
            if (href) {
                stylesHtml += `<link rel="stylesheet" href="${href}">\n`;
            }
        });

        document.querySelectorAll('style').forEach(style => {
            stylesHtml += `<style>${style.innerHTML}</style>\n`;
        });

        const orientation = detectReportOrientation(container, options);

        // Universal print normalization
        stylesHtml += `
        <style>
            @page {
                size: A4 ${orientation};
                margin: 6mm;
            }
            html, body {
                background: #ffffff !important;
                color: #000000 !important;
                margin: 0 !important;
                padding: 4mm !important;
                font-family: 'Times New Roman', Times, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, serif !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .no-print, .btn-no-print, .btn:not(.badge), button, .sidebar, #sidebarToggle,
            .controls-card, .filter-panel, .quick-filters, .page-header:not(.print-header),
            #dc-sender-toast, .pagination, .dataTables_paginate, .dataTables_filter {
                display: none !important;
            }
            .print-header, .watson-print-header {
                display: block !important;
                visibility: visible !important;
            }
            .table-wrap, .table-container, .table-responsive {
                overflow: visible !important;
                height: auto !important;
                max-height: none !important;
            }
            table {
                page-break-inside: auto;
                width: 100% !important;
                border-collapse: collapse !important;
            }
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
            thead {
                display: table-header-group !important;
            }
            tfoot {
                display: table-footer-group !important;
            }
        </style>
        `;

        const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${reportTitle}</title>
    ${stylesHtml}
</head>
<body class="printed-report-body">
    ${clone.outerHTML}
</body>
</html>`;

        return {
            htmlContent: fullHtml,
            title: reportTitle,
            orientation
        };
    }

    /**
     * Global Download Center Client
     */
    window.downloadCenterClient = {
        extractPageMetricCards,
        buildRenderedReportPackage,
        detectReportTitle,
        promptBranchSelection,

        /**
         * Capture the exact rendered report DOM and send to Download Center or download directly
         * Guarantees 100% visual match with the on-screen report
         */
        sendRenderedReport: async function (opts = {}) {
            const token = localStorage.getItem('token');
            if (!token) {
                _showDCSenderToast('Authentication error: Please log in.', 'error');
                return null;
            }

            // Direct download does not require branch routing
            if (opts.downloadDirect) {
                const pkg = buildRenderedReportPackage(opts);
                if (!pkg) {
                    _showDCSenderToast('No report content found on page', 'error');
                    return null;
                }
                _showDCSenderToast('Generating original report PDF...', 'info');
                try {
                    const response = await fetch('/api/v1/download-center/send-rendered-report', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            htmlContent: pkg.htmlContent,
                            title: pkg.title,
                            description: opts.description || `Original report: ${pkg.title}`,
                            orientation: pkg.orientation,
                            sourceReport: opts.sourceReport || 'report',
                            downloadDirect: true
                        })
                    });
                    if (!response.ok) {
                        const err = await response.json().catch(() => ({}));
                        throw new Error(err.message || 'Failed to download report PDF');
                    }
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${pkg.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                    _showDCSenderToast('✓ Original report PDF downloaded successfully', 'success');
                    return true;
                } catch (err) {
                    _showDCSenderToast('Failed to download report: ' + err.message, 'error');
                    return null;
                }
            }

            // Interactive prompt for Document Title & Target Branch(es) if not explicitly provided
            let finalTitle = opts.title;
            let targetBranches = opts.targetBranches;

            if (targetBranches === undefined && !opts.skipPrompt) {
                const promptResult = await promptBranchSelection({
                    title: opts.title || detectReportTitle(opts)
                });
                if (!promptResult) {
                    // User canceled the dialog
                    return null;
                }
                finalTitle = promptResult.title;
                targetBranches = promptResult.targetBranches;
            }

            const pkg = buildRenderedReportPackage(Object.assign({}, opts, { title: finalTitle }));
            if (!pkg) {
                _showDCSenderToast('No report content found on page', 'error');
                return null;
            }

            _showDCSenderToast('Sending original report to Download Center...', 'info');

            try {
                const response = await fetch('/api/v1/download-center/send-rendered-report', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        htmlContent: pkg.htmlContent,
                        title: pkg.title,
                        description: opts.description || `Original report: ${pkg.title}`,
                        orientation: pkg.orientation,
                        targetBranches: targetBranches || [],
                        sourceReport: opts.sourceReport || 'report',
                        downloadDirect: false
                    })
                });

                const data = await response.json();
                if (data.success) {
                    const branchInfo = targetBranches && targetBranches.length > 0 ? ` (${targetBranches.join(', ')})` : ' (All Branches)';
                    _showDCSenderToast(`✓ "${pkg.title}" sent to Download Center${branchInfo}`, 'success');
                    try {
                        window.dispatchEvent(new CustomEvent('downloadCenter:fileSent', { detail: data.data }));
                    } catch (e) {}
                    return data.data;
                } else {
                    throw new Error(data.message || 'Failed to send report');
                }
            } catch (error) {
                console.error('[DC-RENDERED-REPORT] Error:', error);
                _showDCSenderToast('Failed to send report: ' + error.message, 'error');
                return null;
            }
        },

        /**
         * Generate a backend vector PDF report (for payroll summary or backend routes)
         */
        generateVectorReport: async function (params = {}) {
            const token = localStorage.getItem('token');
            if (!token) {
                _showDCSenderToast('Authentication error: Please log in.', 'error');
                return null;
            }

            let {
                reportType,
                filters = {},
                payrollIds = [],
                title = '',
                description = '',
                defaultBranch = '',
                targetBranches,
                saveToDownloadCenter = true,
                tableData = null,
                skipPrompt = false
            } = params;

            // Prompt if saving to Download Center and targetBranches not pre-set
            if (saveToDownloadCenter && targetBranches === undefined && !skipPrompt) {
                const promptResult = await promptBranchSelection({
                    title: title || 'Vector Report',
                    defaultBranch: defaultBranch || (filters && filters.branch) || ''
                });
                if (!promptResult) {
                    return null;
                }
                title = promptResult.title;
                targetBranches = promptResult.targetBranches;
            }

            _showDCSenderToast('Generating vector report PDF...', 'info');

            try {
                const response = await fetch('/api/v1/download-center/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        reportType,
                        filters,
                        payrollIds,
                        title,
                        description,
                        targetBranches: targetBranches || [],
                        saveToDownloadCenter,
                        tableData
                    })
                });

                if (String(saveToDownloadCenter) === 'false') {
                    if (!response.ok) {
                        const err = await response.json().catch(() => ({}));
                        throw new Error(err.message || 'Failed to download report PDF');
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${(title || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                    _showDCSenderToast('✓ Vector PDF downloaded successfully', 'success');
                    return true;
                }

                const data = await response.json();
                if (data.success) {
                    _showDCSenderToast(`✓ Vector PDF "${title || 'Report'}" sent to Download Center`, 'success');
                    try {
                        window.dispatchEvent(new CustomEvent('downloadCenter:fileSent', { detail: data.data }));
                    } catch (e) {}
                    return data.data;
                } else {
                    throw new Error(data.message || 'Failed to generate vector report');
                }
            } catch (error) {
                console.error('[DOWNLOAD-CENTER-CLIENT] Error:', error);
                _showDCSenderToast(error.message || 'Could not generate report', 'error');
                return null;
            }
        },

        /**
         * Export table or report — defaults to 100% same-to-same rendered report capture
         */
        exportTableAsVectorPdf: async function (opts = {}) {
            if (opts.useLegacyVector) {
                const tableEl = typeof opts.table === 'string' ? document.querySelector(opts.table) : opts.table;
                if (!tableEl) {
                    _showDCSenderToast('Report table not found on page', 'error');
                    return null;
                }
                const headerCells = Array.from(tableEl.querySelectorAll('thead th, tr:first-child th'));
                const columns = headerCells.map(th => {
                    const headerText = th.innerText.trim();
                    const isNumeric = /amount|total|price|qty|stock|rate|debit|credit|balance|discount/i.test(headerText);
                    return {
                        header: headerText,
                        width: Math.max(1.5, Math.min(6, headerText.length * 0.4)),
                        align: isNumeric ? 'right' : 'left'
                    };
                });
                const rowEls = Array.from(tableEl.querySelectorAll('tbody tr'));
                const rows = [];
                let summaryRow = null;
                rowEls.forEach(tr => {
                    if (tr.classList.contains('no-print') || tr.style.display === 'none') return;
                    const cells = Array.from(tr.querySelectorAll('td, th'));
                    if (cells.length === 0) return;
                    const rowData = cells.map(td => td.innerText.trim().replace(/\s+/g, ' '));
                    const rowText = rowData.join(' ').toLowerCase();
                    if (tr.classList.contains('total-row') || tr.classList.contains('summary-row') || rowText.includes('total') || rowText.includes('grand total')) {
                        summaryRow = rowData;
                    } else {
                        rows.push(rowData);
                    }
                });
                return await this.generateVectorReport({
                    reportType: 'custom_table',
                    title: opts.title || document.title.replace(/\s*[-|].*$/, '').trim() || 'Report',
                    saveToDownloadCenter: opts.saveToDownloadCenter !== false,
                    tableData: {
                        title: opts.title || document.title.replace(/\s*[-|].*$/, '').trim() || 'Report',
                        subtitle: opts.subtitle || '',
                        dateRange: opts.dateRange || '',
                        orientation: opts.orientation || (columns.length > 6 ? 'landscape' : 'portrait'),
                        columns,
                        rows,
                        summaryRow
                    }
                });
            }

            // By default: use original rendered report capture for 100% same-to-same match
            return await this.sendRenderedReport(opts);
        }
    };

    /**
     * Backward-compatible window.sendToDownloadCenter() for direct file upload
     */
    window.sendToDownloadCenter = async function (fileBlob, reportName, options = {}) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                _showDCSenderToast('Authentication error: Please log in.', 'error');
                return false;
            }

            const filename = options.filename || `${reportName || 'Report'}.pdf`;
            const ext = '.' + filename.split('.').pop().toLowerCase();

            if (!DC_ALLOWED_EXTENSIONS.includes(ext)) {
                _showDCSenderToast(`File type "${ext}" is not allowed in Download Center`, 'error');
                return false;
            }

            if (fileBlob.size > DC_MAX_FILE_SIZE) {
                _showDCSenderToast(`File is too large (${(fileBlob.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 30 MB.`, 'error');
                return false;
            }

            const formData = new FormData();
            formData.append('file', fileBlob, filename);
            formData.append('reportName', reportName || 'Report');
            formData.append('title', reportName || 'Report');
            if (options.description) formData.append('description', options.description);
            if (options.targetBranches && options.targetBranches.length > 0) {
                formData.append('targetBranches', JSON.stringify(options.targetBranches));
            }

            const response = await fetch('/api/v1/download-center/send-report', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                _showDCSenderToast('✓ File sent to Download Center', 'success');
                try {
                    window.dispatchEvent(new CustomEvent('downloadCenter:fileSent', { detail: data.data }));
                } catch (e) {}
                return true;
            } else {
                const errorMsg = data.errors ? data.errors.join('. ') : (data.message || 'Failed to send file');
                _showDCSenderToast(errorMsg, 'error');
                return false;
            }
        } catch (error) {
            console.error('[DC-SENDER] Error:', error);
            _showDCSenderToast('Failed to send to Download Center: ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Standalone toast notification helper
     */
    function _showDCSenderToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }

        let toast = document.getElementById('dc-sender-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'dc-sender-toast';
            toast.style.cssText = `
                position: fixed; bottom: 30px; right: 30px;
                padding: 14px 22px; border-radius: 10px;
                color: #fff; font-size: 0.9rem; font-weight: 500;
                z-index: 99999; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                opacity: 0; transform: translateY(20px);
            `;
            document.body.appendChild(toast);
        }

        toast.style.background = type === 'success'
            ? 'linear-gradient(135deg, #2e7d32, #43a047)'
            : type === 'error'
                ? 'linear-gradient(135deg, #c62828, #e53935)'
                : 'linear-gradient(135deg, #1565c0, #1976d2)';

        toast.textContent = message;

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
        }, 4000);
    }

    /**
     * Automatic UI Button: Mounts a clean "Send to Download Center" button strictly on genuine report pages
     * NEVER disturbs or overlaps screen layouts, filter panels, or content cards.
     */
    function installHeaderExportButton() {
        if (document.getElementById('btnSendToDownloadCenter')) return;

        const path = (window.location.pathname || '').toLowerCase();

        // 1. STRICT BLACKLIST: Never inject on forms, master setups, POS, or core dashboards
        const blacklist = [
            '/employee-registration', '/employee-list', '/employee-advance', '/employee-clearance',
            '/employee-penalty', '/employee-commission', '/distribute-employee-commission',
            '/users', '/groups', '/settings', '/profile', '/stores', '/parties', '/items',
            '/wh-item', '/wh-customer', '/wh-supplier', '/wht-supplier', '/branch-departments',
            '/account-groups', '/account-categories', '/accounts', '/banks', '/taxes', '/units',
            '/commission-item', '/holy-days', '/check-rights', '/backup', '/system-logs',
            '/actions-tracker', '/ai-provider-settings', '/dashboard', '/hr-dashboard',
            '/main', '/login', '/download-center', '/print-payroll', '/payroll',
            '/pos', '/cash-sale', '/sales', '/purchases', '/wh-sale', '/wh-purchase',
            '/sale-returns', '/purchase-returns', '/wh-sale-return', '/wh-purchase-return',
            '/cash-counter', '/food-invoice', '/easypaisa-settlement', '/bank-management',
            '/exemption-invoices', '/payment-vouchers', '/payment-vouchers-list',
            '/voucher', '/receipts', '/payments', '/expenses'
        ];
        if (blacklist.some(b => path === b || path.startsWith(b + '/'))) {
            return;
        }

        // 2. STRICT WHITELIST: Only genuine reports, ledgers, statements, and summaries
        const isEligibleReport = path.includes('report') || 
                                path.includes('ledger') || 
                                path.includes('statement') || 
                                path.includes('summary') ||
                                path === '/closing-sheet' ||
                                path === '/daily-cash' ||
                                path === '/attendance-list' ||
                                path === '/zakat';
        if (!isEligibleReport) return;

        // 3. Create the Send to Download Center button
        const dcBtn = document.createElement('button');
        dcBtn.id = 'btnSendToDownloadCenter';
        dcBtn.type = 'button';
        dcBtn.title = 'Send rendered report to Download Center';
        dcBtn.setAttribute('aria-label', 'Send to Download Center');
        dcBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> <span class="d-none d-sm-inline">Send to Download Center</span>';

        dcBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                await window.downloadCenterClient.sendRenderedReport();
            } catch (err) {
                console.error('[DC-BTN] Error:', err);
                _showDCSenderToast('Failed to send report: ' + err.message, 'error');
            }
        });

        // 4. Mount into the top page-header if available
        const pageHeader = document.querySelector('.page-header, .header-container, header.page-header');
        if (pageHeader) {
            pageHeader.style.display = 'flex';
            pageHeader.style.justifyContent = 'space-between';
            pageHeader.style.alignItems = 'center';

            dcBtn.className = 'btn btn-dc-header btn-sm d-print-none';

            let actionZone = pageHeader.querySelector('#header-action-zone, .header-action-zone');
            if (!actionZone) {
                actionZone = document.createElement('div');
                actionZone.id = 'header-action-zone';
                actionZone.className = 'header-action-zone d-flex align-items-center gap-2 ms-auto d-print-none';
                pageHeader.appendChild(actionZone);
            }

            if (actionZone.firstChild) {
                actionZone.insertBefore(dcBtn, actionZone.firstChild);
            } else {
                actionZone.appendChild(dcBtn);
            }
            return;
        }

        // 5. Fallback: Mount as non-intrusive floating pill dock if no standard header exists
        dcBtn.className = 'dc-floating-btn';
        const dock = document.createElement('div');
        dock.id = 'dcFloatingDock';
        dock.className = 'dc-floating-dock d-print-none';
        dock.appendChild(dcBtn);
        document.body.appendChild(dock);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installHeaderExportButton);
    } else {
        installHeaderExportButton();
    }
})();
