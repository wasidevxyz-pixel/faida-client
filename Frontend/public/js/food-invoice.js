/* ═══════════════════════════════════════════════════════════
   FOOD INVOICE SYSTEM - food-invoice.js
   Full logic: Data Entry, Records, Invoice Generation, QR, PDF
═══════════════════════════════════════════════════════════ */

// ── CATEGORIES ──
const CATEGORIES = [
    { key: 'senior', label: 'SENIOR FOOD', priceKey: 'priceSenior', defaultCalcType: 'MEAL_DIV3' },
    { key: 'junior', label: 'JUNIOR FOOD', priceKey: 'priceJunior', defaultCalcType: 'MEAL_DIV3' },
    { key: 'labour', label: 'LABOUR FOOD', priceKey: 'priceLabour', defaultCalcType: 'MEAL_DIV3' },
    { key: 'filpino', label: 'FILIPINO FOOD', priceKey: 'priceFilpino', defaultCalcType: 'MEAL_DIV3' },
    { key: 'arabic', label: 'ARABIC FOOD', priceKey: 'priceArabic', defaultCalcType: 'MAX_PER_DAY' },
];

// ── CALC TYPE HELPERS ──
function getCalcTypes() {
    try { return JSON.parse(localStorage.getItem('fi_calcTypes') || '{}'); } catch { return {}; }
}
function saveCalcTypes(ct) {
    localStorage.setItem('fi_calcTypes', JSON.stringify(ct));
}
function getCatCalcType(catKey) {
    const saved = getCalcTypes();
    const cat = CATEGORIES.find(c => c.key === catKey);
    return saved[catKey] || (cat ? cat.defaultCalcType : 'MEAL_DIV3');
}
function getCalcTypeLabel(type) {
    return { MEAL_DIV3: 'Meals ÷ 3', MAX_PER_DAY: 'Max/Day' }[type] || type;
}
function getCalcTypeBadgeStyle(type) {
    return {
        MEAL_DIV3: 'background:#065f46;color:#fff;',
        MAX_PER_DAY: 'background:#7c3d12;color:#fff;',
    }[type] || 'background:#555;color:#fff;';
}
const MEALS = ['bf', 'lu', 'di'];
const MEAL_LABELS = { bf: 'Breakfast', lu: 'Lunch', di: 'Dinner' };
let currentEditingId = null;
let currentRecords = [];
let generatedInvoicesList = [];

// ── SETTINGS ──
function getSettings() {
    const defaults = {
        sellerName: 'AnumHasanat Company',
        sellerNameAr: 'شركة أنعم حسنات للمطاعم والتموين والخدمات العامة',
        sellerAddress: 'Al Usaytah Dist. Makkah 24423 Saudi Arabia',
        sellerCity: 'Makkah', sellerCountry: 'Saudi Arabia', sellerZIP: '24423',
        sellerVAT: '314431541300003', sellerOtherID: '7052686040',
        sellerMobile: '0595618343', sellerEmail: 'anumhasanat@gmail.com',
        priceSenior: 19.75, priceFilpino: 19.75, priceArabic: 19.75,
        priceJunior: 17.96, priceLabour: 16.85, vatRate: 15,
        bankBeneficiary: 'AnumHasanat Company (شركة أنو محسنات) Bank',
        bankName: 'Al Rajhi Bank', bankAC: '608018033252',
        bankIBAN: 'SA82 8000 0311 6080 1803 3252',
        sellerLogo: '',
        defaultPO: 'RP-10337',
        buyerName: 'RAPCO for Contracting & Industrial Services company',
        buyerAddress: 'RasTanurah Industrial Area, Zaafran Street, 3',
        buyerCity: 'RASTANURAH', buyerCountry: 'Saudi Arabia', buyerZIP: '31941',
        buyerVAT: '300408391900003', buyerOtherID: '2066001774'
    };
    try {
        const saved = JSON.parse(localStorage.getItem('fi_settings') || '{}');
        return { ...defaults, ...saved };
    } catch { return defaults; }
}

function saveSettings() {
    const s = {};
    ['sellerName', 'sellerNameAr', 'sellerAddress', 'sellerCity', 'sellerCountry', 'sellerZIP',
        'sellerVAT', 'sellerOtherID', 'sellerMobile', 'sellerEmail',
        'priceSenior', 'priceFilpino', 'priceArabic', 'priceJunior', 'priceLabour', 'vatRate',
        'bankBeneficiary', 'bankName', 'bankAC', 'bankIBAN'].forEach(k => {
            const el = document.getElementById(k);
            if (el) s[k] = isNaN(el.value) ? el.value : parseFloat(el.value) || el.value;
        });

    // Save Logo DataURL from preview src
    const preview = document.getElementById('sellerLogoPreview');
    if (preview && preview.src && preview.src.startsWith('data:image')) {
        s.sellerLogo = preview.src;
    }

    // Map special setting IDs
    const extra = {
        defaultPO: 'settingDefaultPO',
        buyerName: 'settingBuyerName',
        buyerAddress: 'settingBuyerAddress',
        buyerCity: 'settingBuyerCity',
        buyerVAT: 'settingBuyerVAT',
        buyerOtherID: 'settingBuyerOtherID'
    };
    Object.keys(extra).forEach(k => {
        const el = document.getElementById(extra[k]);
        if (el) s[k] = el.value;
    });

    localStorage.setItem('fi_settings', JSON.stringify(s));
    showToast('Settings saved!', 'success');
}

function loadSettingsUI() {
    const s = getSettings();
    Object.keys(s).forEach(k => {
        const el = document.getElementById(k);
        if (el) el.value = s[k];
    });

    // Special IDs for buyer/PO
    const extra = {
        defaultPO: 'settingDefaultPO',
        buyerName: 'settingBuyerName',
        buyerAddress: 'settingBuyerAddress',
        buyerCity: 'settingBuyerCity',
        buyerVAT: 'settingBuyerVAT',
        buyerOtherID: 'settingBuyerOtherID'
    };
    Object.keys(extra).forEach(k => {
        const el = document.getElementById(extra[k]);
        if (el) el.value = s[k] || '';
    });

    // Handle Logo Preview
    const preview = document.getElementById('sellerLogoPreview');
    const pl = document.getElementById('logoPlaceholder');
    if (preview && s.sellerLogo) {
        preview.src = s.sellerLogo;
        preview.style.display = 'block';
        if (pl) pl.style.display = 'none';
    } else {
        if (preview) preview.style.display = 'none';
        if (pl) pl.style.display = 'block';
    }
}

function handleLogoUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('sellerLogoPreview');
            const pl = document.getElementById('logoPlaceholder');
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
                if (pl) pl.style.display = 'none';
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// ── TABS ──
function switchTab(tab) {
    document.querySelectorAll('.fi-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.fi-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');
    if (tab === 'records') loadRecords();
    if (tab === 'invoice') {
        currentInvoiceData = {};
        renderCalcTypeSelectors();
        loadInvoiceQty();
        fetchNextInvoiceNumber();
    }
    if (tab === 'genList') loadGeneratedInvoices();
    if (tab === 'settings') loadSettingsUI();
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const monthStr = todayStr.slice(0, 7);

    document.getElementById('entryDate').value = todayStr;
    document.getElementById('periodMonth').value = monthStr;
    document.getElementById('filterMonth').value = monthStr;
    document.getElementById('invoiceDataMonth').value = monthStr;

    // Invoice defaults
    document.getElementById('invIssueDate').value = todayStr;
    const due = new Date(today); due.setDate(due.getDate() + 30);
    document.getElementById('invDueDate').value = due.toISOString().split('T')[0];

    calcLivePreview();
    loadSettingsUI();
    updateCurrentDateDisplay();

    // ── HOTKEYS ──
    document.addEventListener('keydown', (e) => {
        // Alt + S = Save Day Entry
        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveEntry();
        }
    });
});

function updateCurrentDateDisplay() {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', opts);
    // Update page title area if needed
}

// ── ENTRY FORM ──
function getVal(id) { return parseInt(document.getElementById(id).value) || 0; }

function calcLivePreview() {
    const tbody = document.getElementById('previewTbody');
    let rows = '';
    let grandBF = 0, grandLU = 0, grandDI = 0, grandTotal = 0;

    CATEGORIES.forEach((cat, i) => {
        const bf = getVal(`bf_${cat.key}`);
        const lu = getVal(`lu_${cat.key}`);
        const di = getVal(`di_${cat.key}`);
        const total = bf + lu + di;
        grandBF += bf; grandLU += lu; grandDI += di; grandTotal += total;
        rows += `<tr>
            <td>${i + 1}</td>
            <td class="cat-col">${cat.label}</td>
            <td>${bf || ''}</td>
            <td>${lu || ''}</td>
            <td>${di || ''}</td>
            <td class="total-col">${total || ''}</td>
        </tr>`;
    });

    // Grand Total row
    const labelStyle = 'padding:8px 10px;background:#1e4c8c;color:#fff;font-weight:700;font-size:0.82rem;letter-spacing:1px;text-align:right;border-color:#2c5ba9;';
    const bfStyle = 'padding:8px 10px;background:#7c3d12;color:#fff;font-weight:700;border-color:#7c3d12;';
    const luStyle = 'padding:8px 10px;background:#065f46;color:#fff;font-weight:700;border-color:#065f46;';
    const diStyle = 'padding:8px 10px;background:#3b0764;color:#fff;font-weight:700;border-color:#3b0764;';
    const gtStyle = 'padding:8px 10px;background:#8B0000;color:#ffd700;font-weight:800;font-size:1.1rem;border-color:#8B0000;';

    rows += `<tr>
        <td colspan="2" style="${labelStyle}">GRAND TOTAL</td>
        <td style="${bfStyle}">${grandBF || '0'}</td>
        <td style="${luStyle}">${grandLU || '0'}</td>
        <td style="${diStyle}">${grandDI || '0'}</td>
        <td style="${gtStyle}">${grandTotal || '0'}</td>
    </tr>`;

    tbody.innerHTML = rows;
}

function clearEntryForm() {
    CATEGORIES.forEach(cat => {
        MEALS.forEach(m => {
            const el = document.getElementById(`${m}_${cat.key}`);
            if (el) el.value = '';
        });
    });
    currentEditingId = null;
    calcLivePreview();
}

async function saveEntry() {
    const date = document.getElementById('entryDate').value;
    if (!date) { showToast('Please select a date', 'error'); return; }

    const data = { date, meals: {} };
    CATEGORIES.forEach(cat => {
        data.meals[cat.key] = {};
        MEALS.forEach(m => { data.meals[cat.key][m] = getVal(`${m}_${cat.key}`); });
    });

    // Check if any data entered
    let hasData = false;
    CATEGORIES.forEach(cat => MEALS.forEach(m => { if (data.meals[cat.key][m] > 0) hasData = true; }));
    if (!hasData) { showToast('Please enter at least one meal count', 'error'); return; }

    // Duplicate Check: If not editing this specific record, check if date exists
    const existing = currentRecords.find(r => {
        const d1 = new Date(r.date).toISOString().split('T')[0];
        return d1 === date;
    });
    if (existing && currentEditingId !== existing._id) {
        showToast('Data is already saved for this date!', 'error');
        // Optional: Switch to records tab to show it
        // switchTab('records'); 
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/food-invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok) {
            showToast(`Day entry saved for ${formatDate(date)}!`, 'success');
            clearEntryForm();
        } else {
            showToast(result.message || 'Failed to save', 'error');
        }
    } catch (e) {
        showToast('Network error. Please try again.', 'error');
        console.error(e);
    }
}

// ── RECORDS ──
async function loadRecords() {
    const month = document.getElementById('filterMonth').value;
    const tbody = document.getElementById('recordsTbody');
    const tfoot = document.getElementById('recordsTfoot');
    const chips = document.getElementById('recordsSummaryChips');

    // 21 data cols + 1 action = 22 total cols
    tbody.innerHTML = '<tr><td colspan="22" class="text-center text-muted py-3"><i class="fas fa-spinner fa-spin me-2"></i>Loading...</td></tr>';

    try {
        const token = localStorage.getItem('token');
        const url = month ? `/api/v1/food-invoices?month=${month}` : '/api/v1/food-invoices';
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await res.json();

        if (!res.ok || !result.data) {
            tbody.innerHTML = '<tr><td colspan="22" class="text-center text-muted">No records found</td></tr>';
            currentRecords = [];
            return;
        }

        const records = result.data;
        currentRecords = records;
        if (!records.length) {
            tbody.innerHTML = '<tr><td colspan="22" class="text-center text-muted py-3">No records for selected period</td></tr>';
            tfoot.innerHTML = ''; chips.innerHTML = '';
            return;
        }

        // totals[meal][catKey] — meal = bf/lu/di, catKey = senior/junior/labour/filpino/arabic
        const totals = {};
        MEALS.forEach(m => {
            totals[m] = {};
            CATEGORIES.forEach(cat => { totals[m][cat.key] = 0; });
        });
        let overallGrand = 0;

        let html = '';
        records.sort((a, b) => new Date(a.date) - new Date(b.date));

        records.forEach(rec => {
            let rowGrand = 0;
            html += `<tr>
                <td style="font-weight:600;color:#1e4c8c;white-space:nowrap;">${formatDate(rec.date)}</td>`;

            // Each meal section: BF → LU → DI
            MEALS.forEach(meal => {
                let mealSub = 0;
                CATEGORIES.forEach(cat => {
                    const meals = rec.meals && rec.meals[cat.key] ? rec.meals[cat.key] : {};
                    const val = Number(meals[meal]) || 0;
                    totals[meal][cat.key] += val;
                    mealSub += val;
                    html += `<td>${val ? val : '<span style="color:#000;font-style:italic;font-size:0.72rem;font-weight:700;">NIL</span>'}</td>`;
                });
                rowGrand += mealSub;
                html += `<td style="background:#dbeafe;font-weight:700;color:#1e3a8a;">${mealSub || ''}</td>`;
            });

            overallGrand += rowGrand;
            html += `<td style="font-weight:700;color:#8B0000;background:#fee2e2;">${rowGrand}</td>`;
            html += `<td>
                <div class="d-flex gap-1 justify-content-center">
                    <button class="btn btn-sm btn-bas" style="padding:1px 6px;font-size:0.75rem;" onclick="editRecord('${rec._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" style="padding:1px 6px;font-size:0.75rem;" onclick="deleteRecord('${rec._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td></tr>`;
        });
        tbody.innerHTML = html;

        // ── FOOTER TOTALS ROW ──
        let footHtml = `<tr>
            <td style="font-weight:700;font-size:0.78rem;color:#1e4c8c;white-space:nowrap;">TOTAL</td>`;
        let footGrand = 0;
        MEALS.forEach(meal => {
            let mealFootSub = 0;
            CATEGORIES.forEach(cat => {
                const v = totals[meal][cat.key];
                mealFootSub += v;
                footHtml += `<td>${v || ''}</td>`;
            });
            footGrand += mealFootSub;
            footHtml += `<td style="background:#dbeafe;font-weight:700;color:#1e3a8a;">${mealFootSub || ''}</td>`;
        });
        footHtml += `<td style="background:#fee2e2;font-weight:700;color:#8B0000;">${footGrand}</td>
            <td></td></tr>`;
        tfoot.innerHTML = footHtml;

        // ── SUMMARY CHIPS ──
        const s = getSettings();
        let totalAmt = 0;
        CATEGORIES.forEach(cat => {
            const qty = MEALS.reduce((sum, m) => sum + (totals[m][cat.key] || 0), 0);
            totalAmt += qty * (parseFloat(s[cat.priceKey]) || 0);
        });
        const vat = totalAmt * (parseFloat(s.vatRate) || 15) / 100;

        chips.innerHTML = `
            <div class="summary-chip"><div class="sc-label">Total Days</div><div class="sc-value">${records.length}</div></div>
            <div class="summary-chip"><div class="sc-label">Total Meals</div><div class="sc-value">${overallGrand.toLocaleString()}</div></div>
            <div class="summary-chip"><div class="sc-label">Sub Total</div><div class="sc-value">SAR ${totalAmt.toFixed(2)}</div></div>
            <div class="summary-chip"><div class="sc-label">VAT (${s.vatRate}%)</div><div class="sc-value">SAR ${vat.toFixed(2)}</div></div>
            <div class="summary-chip"><div class="sc-label">Grand Total</div><div class="sc-value" style="color:#8B0000;">SAR ${(totalAmt + vat).toFixed(2)}</div></div>
        `;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="22" class="text-center text-danger">Error loading records</td></tr>';
        console.error(e);
    }
}

// ── BUILD RECORDS PRINT HTML (Landscape A4) ──
function buildRecordsPrintHTML() {
    const s = getSettings();
    const month = document.getElementById('filterMonth').value;
    const buyerName = document.getElementById('buyerName') ? document.getElementById('buyerName').value : '';
    const po = document.getElementById('invPO') ? document.getElementById('invPO').value : '';
    const invNum = document.getElementById('invNumber') ? document.getElementById('invNumber').value : '';

    // Get current rendered table rows from DOM
    const tbodyEl = document.getElementById('recordsTbody');
    const tfootEl = document.getElementById('recordsTfoot');

    // Build row HTML - strip delete buttons, keep data
    let rowsHtml = '';
    if (tbodyEl) {
        Array.from(tbodyEl.querySelectorAll('tr')).forEach(tr => {
            rowsHtml += '<tr>';
            Array.from(tr.querySelectorAll('td')).forEach((td, idx) => {
                const lastIdx = tr.querySelectorAll('td').length - 1;
                if (idx === lastIdx) return; // skip action column
                const style = td.getAttribute('style') || '';
                rowsHtml += `<td style="${style}">${td.innerHTML.replace(/<button[\s\S]*?<\/button>/gi, '')}</td>`;
            });
            rowsHtml += '</tr>';
        });
    }

    let footHtml = '';
    if (tfootEl) {
        Array.from(tfootEl.querySelectorAll('tr')).forEach(tr => {
            footHtml += '<tr>';
            Array.from(tr.querySelectorAll('td')).forEach((td, idx) => {
                const lastIdx = tr.querySelectorAll('td').length - 1;
                if (idx === lastIdx) return;
                const style = td.getAttribute('style') || '';
                footHtml += `<td style="${style}">${td.innerHTML}</td>`;
            });
            footHtml += '</tr>';
        });
    }

    let monthLabel = month;
    if (month) {
        const [y, m] = month.split('-').map(Number);
        const mn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        monthLabel = `${mn[m - 1]} ${y}`;
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Food Records - ${monthLabel}</title>
<style>
@page { size: A4 landscape; margin: 7mm; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:Arial,sans-serif; font-size:7.5px; color:#000; background:#fff; }
.print-header { display:flex; align-items:center; gap:10px; border-bottom:3px solid #8B0000; padding-bottom:5px; margin-bottom:5px; }
.print-logo { width:44px; height:44px; background:#8B0000; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; }
.print-company-en { font-size:10.5px; font-weight:700; color:#8B0000; font-style:italic; text-decoration:underline; }
.print-company-ar { font-size:9px; font-weight:700; color:#333; direction:rtl; }
.print-title-box { border:2px solid #1e4c8c; text-align:center; padding:3px 8px; margin-bottom:5px; }
.print-title-box .t1 { font-size:10px; font-weight:700; color:#1e4c8c; letter-spacing:0.8px; }
.print-title-box .t2 { font-size:8px; color:#555; margin-top:1px; }
table { width:100%; border-collapse:collapse; }
th, td { border:1px solid #999; padding:2px 2.5px; text-align:center; white-space:nowrap; }
th { font-weight:700; font-size:7px; }
td { font-size:7.5px; }
.th-bf  { background:#7c3d12 !important; color:#fff !important; }
.th-lu  { background:#065f46 !important; color:#fff !important; }
.th-di  { background:#3b0764 !important; color:#fff !important; }
.th-gt  { background:#8B0000 !important; color:#fff !important; }
.th-sub { background:#2563eb !important; color:#fff !important; }
.th-hd  { background:#1e4c8c !important; color:#fff !important; }
tbody tr:nth-child(even) td { background:#f9f9f9; }
tfoot td { background:#e8f0fe; font-weight:700; color:#1e4c8c; border-top:2px solid #1e4c8c; }
.print-footer { margin-top:5px; border-top:2px solid #8B0000; padding-top:3px; text-align:center; font-size:7px; color:#555; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
<div class="print-header">
    <div class="print-logo">🍽️</div>
    <div>
        <div class="print-company-en">AnumHasanat Restaurant - Catering &amp; Servicing Company</div>
        <div class="print-company-ar">شركة أنعم حسنات للمطاعم والتموين والخدمات العامة</div>
    </div>
</div>
<div class="print-title-box">
    <div class="t1">${buyerName ? buyerName.toUpperCase() + ' — ' : ''}FOOD DETAILS</div>
    <div class="t2">${invNum ? 'ATTACHMENT # ' + invNum + ' | ' : ''}PERIOD: ${monthLabel}${po ? ' | P.O.: ' + po : ''}</div>
</div>
<table>
    <thead>
        <tr>
            <th rowspan="2" class="th-hd" style="min-width:55px;">Date</th>
            <th colspan="6" class="th-bf">🌅 BREAKFAST</th>
            <th colspan="6" class="th-lu">☀️ LUNCH</th>
            <th colspan="6" class="th-di">🌙 DINNER</th>
            <th rowspan="2" class="th-gt">Grand<br>Total</th>
        </tr>
        <tr>
            <th class="th-hd">Senior</th><th class="th-hd">Junior</th><th class="th-hd">Labour</th><th class="th-hd">Filipino</th><th class="th-hd">Arabic</th><th class="th-sub">Sub</th>
            <th class="th-hd">Senior</th><th class="th-hd">Junior</th><th class="th-hd">Labour</th><th class="th-hd">Filipino</th><th class="th-hd">Arabic</th><th class="th-sub">Sub</th>
            <th class="th-hd">Senior</th><th class="th-hd">Junior</th><th class="th-hd">Labour</th><th class="th-hd">Filipino</th><th class="th-hd">Arabic</th><th class="th-sub">Sub</th>
        </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>${footHtml}</tfoot>
</table>
<div class="print-footer">
    AnumHasanat Restaurant-Catering &amp; Servicing Company | 7731 Al-Usaylah Dist, Makkah 24423, Saudi Arabia | Mobile: ${s.sellerMobile} | Email: ${s.sellerEmail}
</div>
</body>
</html>`;
}

function printRecords() {
    const html = buildRecordsPrintHTML();
    const win = window.open('', '_blank', 'width=1200,height=850');
    if (!win) { showToast('Please allow popups for printing', 'error'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 700);
}

function downloadRecordsPDF() {
    const s = getSettings();
    const month = document.getElementById('filterMonth').value || 'records';

    // Build a temp container
    const html = buildRecordsPrintHTML();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const container = document.createElement('div');
    container.style.cssText = 'width:277mm;position:fixed;left:-9999px;top:0;background:#fff;padding:7mm;';
    container.innerHTML = doc.body.innerHTML;

    // Inject print styles
    const styleEl = document.createElement('style');
    styleEl.textContent = doc.querySelector('style').textContent;
    document.head.appendChild(styleEl);
    document.body.appendChild(container);

    const opt = {
        margin: 0,
        filename: `food-records-${month}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    showToast('Generating PDF...', 'info');
    html2pdf().from(container).set(opt).save()
        .then(() => {
            showToast('PDF downloaded!', 'success');
            document.body.removeChild(container);
            document.head.removeChild(styleEl);
        })
        .catch(err => {
            showToast('PDF failed — use Print instead (Ctrl+P → Save as PDF)', 'error');
            console.error(err);
            try { document.body.removeChild(container); document.head.removeChild(styleEl); } catch (_) { }
        });
}
function editRecord(id) {
    const rec = currentRecords.find(r => r._id === id);
    if (!rec) return;

    currentEditingId = id;

    // Fill date
    let rawDate = rec.date;
    if (typeof rawDate === 'string' && rawDate.length > 10) rawDate = rawDate.slice(0, 10);
    document.getElementById('entryDate').value = rawDate;

    // Fill inputs
    CATEGORIES.forEach(cat => {
        const mData = rec.meals && rec.meals[cat.key] ? rec.meals[cat.key] : {};
        MEALS.forEach(m => {
            const val = mData[m] || 0;
            const el = document.getElementById(`${m}_${cat.key}`);
            if (el) el.value = val || '';
        });
    });

    calcLivePreview();
    switchTab('dataEntry');
    showToast(`Loaded data for ${formatDate(rec.date)} for editing`, 'info');
}

async function deleteRecord(id) {

    if (!confirm('Delete this day entry?')) return;
    try {
        const token = localStorage.getItem('token');
        await fetch(`/api/v1/food-invoices/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        showToast('Record deleted', 'success');
        loadRecords();
    } catch (e) { showToast('Delete failed', 'error'); }
}

// ── INVOICE DATA ──
let currentInvoiceData = {};
let currentModalType = 'tax';

async function loadInvoiceQty() {
    const month = document.getElementById('invoiceDataMonth').value;
    const from = document.getElementById('invDataFrom').value;
    const to = document.getElementById('invDataTo').value;

    // Build query: month takes priority over custom range
    let url = '/api/v1/food-invoices';
    const params = [];
    if (month) {
        params.push(`month=${month}`);
    } else {
        if (from) params.push(`from=${from}`);
        if (to) params.push(`to=${to}`);
    }
    if (params.length) url += '?' + params.join('&');

    const table = document.getElementById('qtyPreviewTable');
    table.innerHTML = '<tr><td colspan="2" style="color:#888;font-size:0.75rem;padding:3px 6px;">Loading...</td></tr>';

    try {
        const s = getSettings();
        document.getElementById('invPO').value = s.defaultPO;
        document.getElementById('buyerName').value = s.buyerName;
        document.getElementById('buyerAddress').value = s.buyerAddress;
        document.getElementById('buyerCity').value = s.buyerCity;
        document.getElementById('buyerCountry').value = s.buyerCountry;
        document.getElementById('buyerZIP').value = s.buyerZIP;
        document.getElementById('buyerVAT').value = s.buyerVAT;
        document.getElementById('buyerOtherID').value = s.buyerOtherID;

        const token = localStorage.getItem('token');
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await res.json();
        const records = result.data || [];

        // ── Raw meal totals (BF+LU+DI per category across all days)
        const rawTotals = {};
        CATEGORIES.forEach(cat => { rawTotals[cat.key] = 0; });

        records.forEach(rec => {
            CATEGORIES.forEach(cat => {
                const mealCat = rec.meals ? rec.meals[cat.key] : null;
                // Always add (NIL/null → 0)
                rawTotals[cat.key] += (Number(mealCat?.bf) || 0) + (Number(mealCat?.lu) || 0) + (Number(mealCat?.di) || 0);
            });
        });

        // ── Arabic MAX_PER_DAY debug data ──
        // Formula: all null → 0; any meal exists → replace null with 1, take max
        const arabicDebug = [];
        let arabicQty = 0;
        records.forEach(rec => {
            const m = rec.meals ? rec.meals['arabic'] : null;
            const bfRaw = m?.bf ?? null;
            const luRaw = m?.lu ?? null;
            const diRaw = m?.di ?? null;
            const meals = [bfRaw, luRaw, diRaw];
            let dayMax;
            if (meals.every(v => v === null || v === undefined)) {
                // Fully blank day → 0
                dayMax = 0;
            } else {
                // Partially or fully filled → replace null/undefined with 1, then max
                const filled = meals.map(v => (v === null || v === undefined) ? 1 : (Number(v) || 0));
                dayMax = Math.max(...filled);
            }
            arabicQty += dayMax;
            arabicDebug.push({
                date: new Date(rec.date).toISOString().split('T')[0],
                bf: bfRaw !== null && bfRaw !== undefined ? (Number(bfRaw) || 0) : (dayMax > 0 ? '1*' : 'NIL'),
                lu: luRaw !== null && luRaw !== undefined ? (Number(luRaw) || 0) : (dayMax > 0 ? '1*' : 'NIL'),
                di: diRaw !== null && diRaw !== undefined ? (Number(diRaw) || 0) : (dayMax > 0 ? '1*' : 'NIL'),
                dayMax
            });
        });
        arabicDebug.sort((a, b) => a.date.localeCompare(b.date));



        // ── Expected days in period (for missing days warning) ──
        let expectedDays = null;
        if (month) {
            const [y, mo] = month.split('-').map(Number);
            expectedDays = new Date(y, mo, 0).getDate(); // days in month
        } else if (from && to) {
            const d1 = new Date(from), d2 = new Date(to);
            expectedDays = Math.round((d2 - d1) / 86400000) + 1;
        }
        const missingDays = expectedDays !== null ? expectedDays - records.length : 0;

        // ── Compute qty per calc type ──
        function computeQty(cat) {
            const type = getCatCalcType(cat.key);
            if (type === 'MEAL_DIV3') {
                return rawTotals[cat.key] / 3;
            }
            if (type === 'MAX_PER_DAY') {
                return arabicQty; // pre-computed above with proper NIL handling
            }
            return 0;
        }

        // ── Build debug table HTML for Arabic ──
        function buildArabicDebugHTML() {
            let html = `
            <tr id="arabicDebugRow" style="display:none;">
                <td colspan="2" style="padding:4px 6px;">
                    <div style="font-size:0.65rem;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;">
                        <div style="background:#7c3d12;color:#fff;padding:3px 6px;font-weight:700;font-size:0.65rem;display:flex;justify-content:space-between;">
                            <span>🔍 Arabic Food — Daily Max Breakdown (${arabicDebug.length} days)</span>
                            ${missingDays > 0 ? `<span style="color:#ffd700;">⚠️ ${missingDays} day(s) missing!</span>` : '<span style="color:#86efac;">✔ All days present</span>'}
                        </div>
                        <table style="width:100%;border-collapse:collapse;">
                            <tr style="background:#fef3c7;font-size:0.62rem;font-weight:700;">
                                <th style="padding:2px 4px;border:1px solid #e5e7eb;">Date</th>
                                <th style="padding:2px 4px;border:1px solid #e5e7eb;">BF</th>
                                <th style="padding:2px 4px;border:1px solid #e5e7eb;">LN</th>
                                <th style="padding:2px 4px;border:1px solid #e5e7eb;">DN</th>
                                <th style="padding:2px 4px;border:1px solid #e5e7eb;background:#7c3d12;color:#fff;">Max</th>
                            </tr>`;
            arabicDebug.forEach(d => {
                html += `<tr style="font-size:0.62rem;">
                    <td style="padding:2px 4px;border:1px solid #e5e7eb;">${d.date}</td>
                    <td style="padding:2px 4px;border:1px solid #e5e7eb;text-align:center;">${d.bf || '-'}</td>
                    <td style="padding:2px 4px;border:1px solid #e5e7eb;text-align:center;">${d.lu || '-'}</td>
                    <td style="padding:2px 4px;border:1px solid #e5e7eb;text-align:center;">${d.di || '-'}</td>
                    <td style="padding:2px 4px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:#7c3d12;">${d.dayMax}</td>
                </tr>`;
            });
            html += `<tr style="background:#fef3c7;font-size:0.63rem;font-weight:700;">
                    <td style="padding:2px 4px;border:1px solid #e5e7eb;">TOTAL</td>
                    <td colspan="3" style="padding:2px 4px;border:1px solid #e5e7eb;"></td>
                    <td style="padding:2px 4px;border:1px solid #e5e7eb;text-align:center;color:#7c3d12;">${arabicQty}</td>
                </tr>
                </table></div></td></tr>`;
            return html;
        }

        let grandQty = 0;
        let rows = '';
        CATEGORIES.forEach((cat, i) => {
            const type = getCatCalcType(cat.key);
            const badge = `<span style="font-size:0.6rem;padding:1px 5px;border-radius:10px;${getCalcTypeBadgeStyle(type)}">${getCalcTypeLabel(type)}</span>`;
            const qty = computeQty(cat);
            grandQty += qty;
            // MAX_PER_DAY → whole number; MEAL_DIV3 → 1 decimal
            const qtyDisplay = type === 'MAX_PER_DAY'
                ? Math.round(qty).toString()
                : parseFloat(qty.toFixed(1)).toString();

            // Arabic row has debug toggle button
            const debugBtn = type === 'MAX_PER_DAY'
                ? `<button onclick="toggleArabicDebug()" title="Show/hide daily breakdown"
                    style="font-size:0.58rem;padding:1px 5px;border:1px solid #7c3d12;background:#fff;color:#7c3d12;border-radius:3px;cursor:pointer;margin-left:4px;">🔍</button>`
                : '';

            // Missing days warning on Arabic row
            const warnIcon = (type === 'MAX_PER_DAY' && missingDays > 0)
                ? `<span style="color:#dc2626;font-size:0.62rem;margin-left:4px;" title="${missingDays} day(s) missing from records!">⚠️${missingDays} missing</span>`
                : '';

            rows += `<tr>
                <td style="padding:3px 6px;font-size:0.74rem;">${i + 1}. ${cat.label}<br>${badge}${warnIcon}</td>
                <td style="padding:3px 6px;text-align:right;font-weight:700;color:#1e4c8c;">${qtyDisplay}${debugBtn}</td>
            </tr>`;

            // Insert debug rows after Arabic
            if (type === 'MAX_PER_DAY') {
                rows += buildArabicDebugHTML();
            }
        });
        const grandDisplay = parseFloat(grandQty.toFixed(1)).toString();
        rows += `<tr style="border-top:2px solid #1e4c8c;">
            <td style="padding:4px 6px;font-size:0.75rem;font-weight:700;color:#8B0000;">GRAND TOTAL</td>
            <td style="padding:4px 6px;font-size:0.78rem;font-weight:700;color:#8B0000;text-align:right;" id="grandQtyCell">${grandDisplay}</td>
        </tr>`;

        table.innerHTML = rows || '<tr><td colspan="2" style="color:#888;">No data</td></tr>';
        currentInvoiceData = { rawTotals, arabicDebug, arabicQty, records, s };
    } catch (e) {
        console.error('loadInvoiceQty error:', e);
        table.innerHTML = '<tr><td colspan="2" style="color:#e00;">Error loading data</td></tr>';
    }
}

function toggleArabicDebug() {
    const row = document.getElementById('arabicDebugRow');
    if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}


// ── REFRESH QTY PREVIEW ──
function refreshQtyPreview() {
    let grand = 0;
    const { rawTotals } = currentInvoiceData;
    if (rawTotals) {
        CATEGORIES.forEach(cat => { grand += (rawTotals[cat.key] || 0) / 3; });
    }
    const gc = document.getElementById('grandQtyCell');
    if (gc) gc.textContent = parseFloat(grand.toFixed(1)).toString();
}

// ── RENDER CALC TYPE SELECTORS ──
function renderCalcTypeSelectors() {
    const container = document.getElementById('calcTypeSelectors');
    if (!container) return;

    const typeOptions = [
        { value: 'MEAL_DIV3', label: 'Meals ÷ 3' },
        { value: 'MAX_PER_DAY', label: 'Max/Day' },
    ];

    let html = '';
    CATEGORIES.forEach(cat => {
        const current = getCatCalcType(cat.key);
        const opts = typeOptions.map(o =>
            `<option value="${o.value}"${current === o.value ? ' selected' : ''}>${o.label}</option>`
        ).join('');
        html += `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
            <span style="font-size:0.72rem;min-width:90px;color:#374151;font-weight:600;">${cat.label}</span>
            <select onchange="changeCalcType('${cat.key}', this.value)"
                style="font-size:0.7rem;padding:1px 4px;border-radius:4px;border:1px solid #c3d9ff;background:#fff;color:#1e4c8c;flex:1;">
                ${opts}
            </select>
        </div>`;
    });
    container.innerHTML = html;
}

// ── CHANGE CALC TYPE ──
function changeCalcType(catKey, newType) {
    const ct = getCalcTypes();
    ct[catKey] = newType;
    saveCalcTypes(ct);
    renderCalcTypeSelectors(); // re-render to show/hide headcount input
    loadInvoiceQty();
}

// ── INVOICE MODAL ──
function openInvoiceModal(type) {
    currentModalType = type;
    if (Object.keys(currentInvoiceData).length === 0) { loadInvoiceQty().then(() => _showModal(type)); }
    else { _showModal(type); }
}

function _showModal(type) {
    const modal = document.getElementById('invoiceModal');
    const content = document.getElementById('modalContent');
    if (type === 'tax') { content.innerHTML = buildTaxInvoiceHTML(); }
    else { content.innerHTML = buildSummaryHTML(); }
    modal.style.display = 'flex';
    // Generate QR after render
    setTimeout(() => generateQR(), 300);
}

function switchModalType(type) {
    currentModalType = type;
    const content = document.getElementById('modalContent');
    if (type === 'tax') { content.innerHTML = buildTaxInvoiceHTML(); }
    else { content.innerHTML = buildSummaryHTML(); }
    setTimeout(() => generateQR(), 300);
}

function closeModal() {
    document.getElementById('invoiceModal').style.display = 'none';
}

function printModal() {
    const content = document.getElementById('modalContent').innerHTML;
    // Get all style tags to keep formatting
    let styles = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(s => {
        styles += s.outerHTML;
    });

    const win = window.open('', '_blank', 'width=1000,height=900');
    if (!win) { showToast('Please allow popups', 'error'); return; }

    win.document.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <title>Print Invoice</title>
                ${styles}
                <style>
                    body { background: white !important; margin: 0; padding: 20px; }
                    .fi-modal-box { border:none !important; box-shadow:none !important; width:100% !important; margin:0 !important; }
                    @page { size: A4 portrait; margin: 10mm; }
                    /* Force hide any scrollbars */
                    ::-webkit-scrollbar { display: none; }
                </style>
            </head>
            <body>
                <div class="fi-modal-box">${content}</div>
                <script>
                    window.onload = function() {
                        setTimeout(() => { window.print(); window.close(); }, 800);
                    };
                </script>
            </body>
        </html>
    `);
    win.document.close();
}

function downloadPDF() {
    const content = document.getElementById('modalContent');
    const invNum = document.getElementById('invNumber').value || 'invoice';
    const opt = {
        margin: 8,
        filename: `${invNum.replace(/\//g, '-')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    showToast('Generating PDF...', 'info');
    html2pdf().from(content).set(opt).save()
        .then(() => showToast('PDF downloaded!', 'success'))
        .catch(() => showToast('PDF generation failed', 'error'));
}

// ── QR CODE (ZATCA COMPLIANT FOR TAX INVOICE) ──
function generateQR() {
    const qrContainer = document.getElementById('qrCodeContainer');
    if (!qrContainer) return;
    qrContainer.innerHTML = '';
    const s = getSettings();
    const totals = calcTotals();

    let qrText = '';
    if (currentModalType === 'tax') {
        const name = s.sellerName || 'Seller';
        const vatNo = s.sellerVAT || '';
        const date = document.getElementById('invIssueDate').value || new Date().toISOString().split('T')[0];
        const time = new Date().toTimeString().split(' ')[0];
        const timestamp = date + 'T' + time + 'Z';
        const totalAmount = totals.grandTotal.toFixed(2);
        const vatAmount = totals.vat.toFixed(2);

        // ZATCA TLV Encoding
        const tlv = (tag, val) => {
            const encoder = new TextEncoder();
            const vBuf = encoder.encode(val);
            const buf = new Uint8Array(2 + vBuf.length);
            buf[0] = tag; buf[1] = vBuf.length;
            buf.set(vBuf, 2);
            return Array.from(buf);
        };

        const tags = [
            ...tlv(1, name),
            ...tlv(2, vatNo),
            ...tlv(3, timestamp),
            ...tlv(4, totalAmount),
            ...tlv(5, vatAmount)
        ];

        // Convert array to binary string then Base64
        const binary = String.fromCharCode.apply(null, tags);
        qrText = btoa(binary);
    } else {
        // Simple JSON for summary
        qrText = JSON.stringify({
            seller: s.sellerName,
            invoice: document.getElementById('invNumber').value,
            total: totals.grandTotal.toFixed(2)
        });
    }

    try {
        new QRCode(qrContainer, {
            text: qrText,
            width: 110,
            height: 110,
            colorDark: '#000',
            colorLight: '#fff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } catch (e) {
        console.error('QR Error:', e);
        qrContainer.innerHTML = '<div style="font-size:8px;color:#999;">QR Error</div>';
    }
}

function verifyZatcaQR() {
    const code = document.getElementById('qrVerifyInput').value.trim();
    const resultDiv = document.getElementById('qrVerifyResult');
    if (!code) return;

    try {
        const binary = atob(code);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        let pos = 0;
        const labels = ['Seller Name', 'VAT Number', 'Timestamp', 'Invoice Total', 'VAT Total'];
        const values = [];

        while (pos < bytes.length) {
            const tag = bytes[pos++];
            const len = bytes[pos++];
            const val = new TextDecoder().decode(bytes.slice(pos, pos + len));
            pos += len;
            if (tag >= 1 && tag <= 5) values[tag - 1] = val;
        }

        let html = '<div style="font-weight:700;color:#1e4c8c;margin-bottom:4px;border-bottom:1px solid #d0e4ff;">Decoded Info:</div>';
        labels.forEach((lbl, i) => {
            if (values[i] !== undefined) {
                html += `<div><span style="color:#666;">${lbl}:</span> <b style="color:#000;">${values[i]}</b></div>`;
            }
        });
        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';
    } catch (e) {
        console.error('Verify error:', e);
        resultDiv.innerHTML = '<div style="color:#ef4444;font-weight:700;">Invalid QR Data!</div>';
        resultDiv.style.display = 'block';
    }
}

// ── CALCULATIONS ──
function calcQtyForCategory(cat) {
    const { rawTotals, records, arabicQty } = currentInvoiceData;
    if (!rawTotals) return 0;
    const type = getCatCalcType(cat.key);
    if (type === 'MEAL_DIV3') {
        return (rawTotals[cat.key] || 0) / 3;
    }
    if (type === 'MAX_PER_DAY') {
        // Use pre-computed arabicQty if available (already correct)
        if (arabicQty !== undefined) return arabicQty;
        // Fallback: all null → 0; any exists → replace null with 1, then max
        let sum = 0;
        (records || []).forEach(rec => {
            const m = rec.meals ? rec.meals[cat.key] : null;
            const meals = [m?.bf ?? null, m?.lu ?? null, m?.di ?? null];
            if (meals.every(v => v === null || v === undefined)) {
                sum += 0;
            } else {
                const filled = meals.map(v => (v === null || v === undefined) ? 1 : (Number(v) || 0));
                sum += Math.max(...filled);
            }
        });
        return sum;
    }
    return 0;
}

function calcTotals() {
    const s = getSettings();
    // If we're reprinting a saved invoice, rawTotals won't exist but items/totals will.
    if (!currentInvoiceData.rawTotals && currentInvoiceData.items) {
        return {
            items: currentInvoiceData.items,
            subTotal: currentInvoiceData.subTotal || 0,
            vat: currentInvoiceData.vat || 0,
            grandTotal: currentInvoiceData.grandTotal || 0
        };
    }
    if (!currentInvoiceData.rawTotals) return { items: [], subTotal: 0, vat: 0, grandTotal: 0 };

    const vatRate = parseFloat(s.vatRate) / 100;
    let subTotal = 0;
    const items = CATEGORIES.map((cat, i) => {
        const rawQty = calcQtyForCategory(cat);
        // MAX_PER_DAY → whole number; MEAL_DIV3 → 1 decimal
        const type = getCatCalcType(cat.key);
        const qty = type === 'MAX_PER_DAY'
            ? Math.round(rawQty)
            : parseFloat(rawQty.toFixed(1));
        const price = parseFloat(s[cat.priceKey]) || 0;
        const taxable = parseFloat((qty * price).toFixed(2));
        const tax = parseFloat((taxable * vatRate).toFixed(2));
        const subtotalIncVAT = parseFloat((taxable + tax).toFixed(2));
        subTotal += taxable;
        return { num: i + 1, label: cat.label, price, qty, taxable, tax, subtotalIncVAT };
    }).filter(it => it.qty > 0);

    subTotal = parseFloat(subTotal.toFixed(2));
    const vat = parseFloat((subTotal * vatRate).toFixed(2));
    const grandTotal = parseFloat((subTotal + vat).toFixed(2));
    return { items, subTotal, vat, grandTotal };
}

function getLogoHTML(s) {
    if (s.sellerLogo) {
        return `<img src="${s.sellerLogo}" style="width:54px;height:54px;object-fit:contain;border-radius:50%;background:#fff;padding:2px;">`;
    }
    return `<div class="inv-ribbon-logo">🍽️</div>`;
}

// ── NUMBER TO WORDS ──
function numberToWords(num) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function conv(n) {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + conv(n % 100) : '');
        if (n < 1000000) return conv(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + conv(n % 1000) : '');
        return conv(Math.floor(n / 1000000)) + ' Million' + (n % 1000000 ? ' ' + conv(n % 1000000) : '');
    }
    const halalas = Math.round((num % 1) * 100);
    return (conv(Math.floor(num)) || 'Zero') + ' Saudi Riyals and ' + (halalas ? conv(halalas) + ' Halalas' : 'Zero Halalas') + ' Only';
}

function getInvoiceState() {
    // Always compute items/totals via calcTotals() (which uses currentInvoiceData.totals internally)
    const { items, subTotal, vat, grandTotal } = calcTotals();
    return {
        items, subTotal, vat, grandTotal,
        invNumber: document.getElementById('invNumber').value || 'INV-001',
        issueDate: formatDate(document.getElementById('invIssueDate').value),
        dueDate: formatDate(document.getElementById('invDueDate').value),
        terms: document.getElementById('invTerms').value,
        poNumber: document.getElementById('invPO').value,
        transType: document.getElementById('invTransType').value,
        periodFrom: formatDate(document.getElementById('invPeriodFrom').value),
        periodTo: formatDate(document.getElementById('invPeriodTo').value),
        buyerName: document.getElementById('buyerName').value,
        buyerAddress: document.getElementById('buyerAddress').value,
        buyerCity: document.getElementById('buyerCity').value,
        buyerCountry: document.getElementById('buyerCountry').value,
        buyerZIP: document.getElementById('buyerZIP').value,
        buyerVAT: document.getElementById('buyerVAT').value,
        buyerOtherID: document.getElementById('buyerOtherID').value,
    };
}

// ── BUILD TAX INVOICE ──
function buildTaxInvoiceHTML() {
    const s = getSettings();
    const d = getInvoiceState();
    const vatRate = parseFloat(s.vatRate) || 15;

    let itemsHtml = '';
    d.items.forEach(it => {
        itemsHtml += `
        <tr>
            <td>${it.num}</td>
            <td class="desc-cell">Food Service<br><strong>${it.label}</strong></td>
            <td>${it.price.toFixed(2)}</td>
            <td>${it.qty}</td>
            <td>${it.taxable.toFixed(3)}</td>
            <td>
                <div>${it.tax.toFixed(3)}</div>
                <div class="tax-box">${vatRate}.00%</div>
            </td>
            <td>${it.subtotalIncVAT.toFixed(2)} SAR</td>
        </tr>`;
    });
    if (!d.items.length) {
        itemsHtml = '<tr><td colspan="7" style="text-align:center;color:#999;padding:12px;">No data available for selected period</td></tr>';
    }

    return `
    <div class="inv-doc">
        <!-- Centered Logo -->
        <div style="text-align:center; margin-bottom:5px;">
            ${s.sellerLogo ?
            `<img src="${s.sellerLogo}" style="width:110px; height:110px; object-fit:contain;">` :
            `<div style="font-size:50px;">🍽️</div>`
        }
        </div>

        <!-- Title -->
        <div class="inv-title-section">
            <div class="inv-title">Tax Invoice</div>
        </div>

        <!-- Info + QR -->
        <div class="inv-info-qr">
            <table class="inv-info-table">
                <tr><td>Invoice #:</td><td><strong>${d.invNumber}</strong></td></tr>
                <tr><td>Invoice Issue Date:</td><td>${d.issueDate}</td></tr>
                <tr><td>Due Date:</td><td>${d.dueDate}</td></tr>
                <tr><td>Terms:</td><td>${d.terms}</td></tr>
                <tr><td>P.O.#:</td><td>${d.poNumber}</td></tr>
                <tr><td>Transaction Type:</td><td>${d.transType}</td></tr>
            </table>
            <div id="qrCodeContainer" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                <div style="width:110px;height:110px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999;">QR Loading...</div>
            </div>
        </div>

        <!-- Period of Service -->
        ${d.periodFrom && d.periodTo ? `
        <table class="inv-period-table">
            <tr>
                <td>Period of Service</td>
                <td><strong>${d.periodFrom} to ${d.periodTo}</strong></td>
            </tr>
        </table>` : ''}

        <!-- Seller / Buyer -->
        <table class="inv-parties">
            <tr>
                <th colspan="2">Seller</th>
                <th colspan="2">Buyer</th>
            </tr>
            <tr>
                <td class="lbl">Name</td>
                <td>${s.sellerName}</td>
                <td class="lbl">Name</td>
                <td>${d.buyerName}</td>
            </tr>
            <tr>
                <td class="lbl">Address</td>
                <td>${s.sellerAddress}</td>
                <td class="lbl">Address</td>
                <td>${d.buyerAddress}</td>
            </tr>
            <tr>
                <td class="lbl">City</td>
                <td>${s.sellerCity}</td>
                <td class="lbl">City</td>
                <td>${d.buyerCity}</td>
            </tr>
            <tr>
                <td class="lbl">Country</td>
                <td>${s.sellerCountry}</td>
                <td class="lbl">Country</td>
                <td>${d.buyerCountry}</td>
            </tr>
            <tr>
                <td class="lbl">ZIP/Postal Code</td>
                <td>${s.sellerZIP}</td>
                <td class="lbl">ZIP/Postal Code</td>
                <td>${d.buyerZIP}</td>
            </tr>
            <tr>
                <td class="lbl">VAT Number</td>
                <td>${s.sellerVAT}</td>
                <td class="lbl">VAT Number</td>
                <td>${d.buyerVAT}</td>
            </tr>
            <tr>
                <td class="lbl">Other Seller ID</td>
                <td>${s.sellerOtherID}</td>
                <td class="lbl">Other Seller ID</td>
                <td>${d.buyerOtherID}</td>
            </tr>
        </table>

        <!-- Subject -->
        <div class="inv-subject">SUBJECT: FOOD SERVICE INVOICE</div>

        <!-- Line Items -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
            <tr><td colspan="7" class="inv-items-header">Line Items</td></tr>
        </table>
        <table class="inv-items-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Nature of Goods/Services</th>
                    <th>Unit Price</th>
                    <th>Quantity</th>
                    <th>Taxable Amount</th>
                    <th>Tax</th>
                    <th>Item Subtotal<br>(Including VAT)</th>
                </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
        </table>

        <!-- Total Amount -->
        <table class="inv-amts">
            <tr><td colspan="2" class="hdr">TOTAL AMOUNT</td></tr>
            <tr><td class="lbl">Total Taxable Amount Excluding VAT</td><td class="val">${d.subTotal.toFixed(2)} SAR</td></tr>
            <tr><td class="lbl">Total VAT</td><td class="val">${d.vat.toFixed(2)} SAR</td></tr>
            <tr><td class="lbl">Total Amount Due</td><td class="val">${d.grandTotal.toFixed(2)} SAR</td></tr>
            <tr><td class="lbl">Balance Due</td><td class="val">${d.grandTotal.toFixed(2)} SAR</td></tr>
            <tr>
                <td class="lbl" style="font-size:9px;font-style:italic;">${numberToWords(d.grandTotal)}</td>
                <td class="val" style="font-family:'Noto Naskh Arabic',serif;direction:rtl;font-size:10px;">
                    ${numberToWordsAr(d.grandTotal)}
                </td>
            </tr>
        </table>

        <!-- Tax Summary -->
        <table class="inv-tax-summary">
            <tr><td colspan="3" class="tbl-hdr-title">Tax Summary</td></tr>
            <tr><th>Tax Details</th><th>Taxable Amount (SAR)</th><th>Tax Amount (SAR)</th></tr>
            <tr>
                <td>Standard Rate (${vatRate}%)</td>
                <td>${d.subTotal.toFixed(3)} SAR</td>
                <td>${d.vat.toFixed(2)} SAR</td>
            </tr>
            <tr class="total-row">
                <td><strong>Total</strong></td>
                <td><strong>${d.subTotal.toFixed(3)} SAR</strong></td>
                <td><strong>${d.vat.toFixed(2)} SAR</strong></td>
            </tr>
        </table>

        <!-- Note -->
        <p class="inv-note">*This is electronically generated Document; and hence no physical seal or signature is mandatory*</p>

        <!-- Bank Details -->
        <div class="inv-bank">
            <div><strong>Our Bank Account Details:-</strong></div>
            <div>Beneficiary Name: ${s.bankBeneficiary}</div>
            <div>Name: ${s.bankName}</div>
            <div>A/C NO: ${s.bankAC}</div>
            <div>IBAN NO: ${s.bankIBAN}</div>
        </div>

        <!-- Terms Signatures -->
        <div style="margin-bottom:10px;font-size:10px;font-weight:700;">Terms &amp; Conditions</div>
        <div class="inv-sig-row">
            <span>Prepared by:-</span><span class="inv-sig-line"></span>
            <span style="margin-left:20px;">Checked and approved By</span><span class="inv-sig-line"></span>
        </div>
        <div style="height:20px;"></div>
        <div class="inv-sig-row">
            <span>Invoice Received By:-</span><span class="inv-sig-line" style="width:120px;"></span>
            <span style="margin-left:12px;">Signature</span><span class="inv-sig-line" style="width:120px;"></span>
            <span style="margin-left:12px;">Date</span><span class="inv-sig-line" style="width:100px;"></span>
        </div>
    </div>`;
}

// ── BUILD SUMMARY ──
function buildSummaryHTML() {
    const s = getSettings();
    const d = getInvoiceState();
    const vatRate = parseFloat(s.vatRate) || 15;

    return `
    <div class="sum-doc">
        <div class="sum-ribbon-top"></div>
        <div class="sum-header" style="border-bottom: 3px solid #8B0000; padding-bottom: 12px; align-items: center;">
            <!-- Large Left Logo -->
            <div style="width:140px; height:110px;">
                ${s.sellerLogo ?
            `<img src="${s.sellerLogo}" style="width:100%; height:100%; object-fit:contain;">` :
            `<div style="font-size:60px;">🍽️</div>`
        }
            </div>
            
            <!-- Right Aligned Company Info -->
            <div style="flex:1; text-align:center; display:flex; flex-direction:column; align-items:center;">
                <div style="background:#ffc107; color:#fff; width:100%; padding:8px; font-weight:800; font-size:14px; text-decoration:underline; font-style:italic; margin-bottom:8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    ${s.sellerName}
                </div>
                <div style="font-family:'Noto Naskh Arabic', serif; font-size:15px; font-weight:800; color:#333; direction:rtl; padding-right:15px;">
                    ${s.sellerNameAr}
                </div>
            </div>
        </div>

        <div class="sum-title-box">${d.buyerName.split(' ')[0]} FOOD SUMMARY - ATTACHED=${d.invNumber}</div>

        <table class="sum-table">
            <thead>
                <tr>
                    <th style="width:40px;">Qty</th>
                    <th colspan="2">Description</th>
                    <th>Unit rate</th>
                    <th>Quantity</th>
                    <th>Total</th>
                    <th style="width:80px;">PO</th>
                </tr>
            </thead>
            <tbody>
                ${d.items.map((it, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td style="text-align:left;font-weight:600;">${it.label}</td>
                    <td>Daily Food</td>
                    <td>${it.price.toFixed(2)}</td>
                    <td>${it.qty}</td>
                    <td>${it.taxable.toFixed(2)}</td>
                    <td style="text-align:left;font-size:9px;white-space:nowrap;">${d.poNumber}</td>
                </tr>`).join('')}
            </tbody>
        </table>

        <div class="sum-totals-wrap">
            <table class="sum-totals-table">
                <tr><td class="lbl">Sub Total SAR</td><td class="val">${d.subTotal.toFixed(2)}</td></tr>
                <tr><td class="lbl" style="color:#1a73e8;font-weight:700;">VAT ${vatRate}%</td><td class="vat-val">${d.vat.toFixed(2)}</td></tr>
                <tr class="total-row"><td class="lbl">Total SAR</td><td class="val">${d.grandTotal.toFixed(2)}</td></tr>
            </table>
        </div>

        <div class="sum-sigs">
            <div class="sum-sig">PREPARED BY<div class="sum-sig-line"></div></div>
            <div class="sum-sig">MANAGER<div class="sum-sig-line"></div></div>
            <div class="sum-sig">NOTED BY<div class="sum-sig-line"></div></div>
        </div>

        <div class="sum-footer">
            <div style="font-weight:700; color:#8B0000; margin-bottom:2px;">${s.sellerName}, ${s.sellerAddress}</div>
            <div style="margin-bottom:2px;">Saudi Arabia Mobile: ${s.sellerMobile} | E. Mail: ${s.sellerEmail}</div>
            <div style="font-family:'Noto Naskh Arabic', serif; direction:rtl; font-size:10px; color:#1e4c8c; font-weight:700;">
                ${s.sellerNameAr}، 7731 حي العصيتة، مكة 24423، المملكة العربية السعودية
            </div>
        </div>
    </div>`;
}

// ── ARABIC AMOUNT IN WORDS (simplified) ──
function numberToWordsAr(num) {
    // Simplified Arabic amount text
    return `${num.toFixed(2)} ريال سعودي`;
}

// ── HELPERS ──
function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        // Handle both ISO strings (from MongoDB) and plain YYYY-MM-DD strings
        // Extract YYYY-MM-DD portion safely to avoid timezone shift
        let ymd;
        if (typeof dateStr === 'string' && dateStr.includes('T')) {
            // ISO 8601 from MongoDB e.g. "2026-02-01T00:00:00.000Z"
            ymd = dateStr.substring(0, 10); // "2026-02-01"
        } else {
            ymd = dateStr; // already "YYYY-MM-DD"
        }
        // Parse parts directly - no Date constructor to avoid UTC->local shift
        const [year, month, day] = ymd.split('-').map(Number);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const yr2 = String(year).slice(-2);
        return `${String(day).padStart(2, '0')}-${monthNames[month - 1]}-${yr2}`;
    } catch { return dateStr; }
}

function showToast(msg, type = 'info') {
    const t = document.getElementById('fi-toast');
    t.textContent = msg;
    t.style.background = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#1e4c8c';
    t.style.transform = 'translateY(0)';
    t.style.opacity = '1';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { t.style.transform = 'translateY(80px)'; t.style.opacity = '0'; }, 3000);
}

// ── SAVED GENERATIONS ──
async function fetchNextInvoiceNumber() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/food-invoices/next-number', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('invNumber').value = data.data;
            return data.data;
        }
    } catch (err) { console.error('Error fetching next number:', err); }
    return '';
}

async function saveAndPreviewInvoice(type) {
    let invNum = document.getElementById('invNumber').value;

    // If empty, try to fetch it now
    if (!invNum) {
        invNum = await fetchNextInvoiceNumber();
    }

    if (!invNum) {
        return showToast('Could not generate invoice number. Please type one manually.', 'error');
    }

    const { items, subTotal, vat, grandTotal } = calcTotals();
    const invoiceData = {
        invoiceNumber: invNum,
        issueDate: document.getElementById('invIssueDate').value,
        dueDate: document.getElementById('invDueDate').value,
        poNumber: document.getElementById('invPO').value,
        periodFrom: document.getElementById('invPeriodFrom').value,
        periodTo: document.getElementById('invPeriodTo').value,
        buyerName: document.getElementById('buyerName').value,
        buyerAddress: document.getElementById('buyerAddress').value,
        buyerCity: document.getElementById('buyerCity').value,
        buyerVAT: document.getElementById('buyerVAT').value,
        buyerOtherID: document.getElementById('buyerOtherID').value,
        totals: { subTotal, vat, grandTotal, items }
    };

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/food-invoices/generated', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(invoiceData)
        });
        const result = await res.json();
        if (result.success) {
            showToast('Invoice saved successfully!', 'success');
            openInvoiceModal(type);
        } else {
            showToast(result.message || 'Error saving invoice', 'error');
        }
    } catch (err) {
        showToast('System Error saving invoice', 'error');
    }
}

async function loadGeneratedInvoices() {
    const list = document.getElementById('generatedListBody');
    if (!list) return;
    list.innerHTML = '<tr><td colspan="7" class="text-center">Loading history...</td></tr>';

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/food-invoices/generated', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            generatedInvoicesList = data.data;
            list.innerHTML = data.data.map(inv => `
                <tr>
                    <td><b>${inv.invoiceNumber}</b></td>
                    <td>${formatDate(inv.issueDate)}</td>
                    <td>${inv.poNumber}</td>
                    <td>${formatDate(inv.periodFrom)} to ${formatDate(inv.periodTo)}</td>
                    <td>${inv.buyerName}</td>
                    <td class="text-end fw-bold">${inv.totals.grandTotal.toFixed(2)}</td>
                    <td class="text-center">
                         <button class="btn btn-sm btn-outline-primary me-1" onclick="reprintInvoice('${inv._id}')" title="Print/Preview">
                            <i class="fas fa-print"></i>
                         </button>
                         <button class="btn btn-sm btn-outline-danger" onclick="deleteGeneratedInvoice('${inv._id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                         </button>
                    </td>
                </tr>
            `).join('');
            if (data.data.length === 0) {
                list.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No generated invoices found.</td></tr>';
            }
        }
    } catch (err) {
        list.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load history.</td></tr>';
    }
}

async function deleteGeneratedInvoice(id) {
    if (!confirm('Are you sure you want to delete this recorded invoice?')) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/food-invoices/generated/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            showToast('Invoice record removed', 'success');
            loadGeneratedInvoices();
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Error deleting invoice record', 'error');
    }
}

function reprintInvoice(id) {
    const inv = generatedInvoicesList.find(x => x._id === id);
    if (!inv) return showToast('Invoice data not found', 'error');

    // Restore data for the modal
    currentInvoiceData = {
        ...inv.totals,
        invNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        poNumber: inv.poNumber,
        periodFrom: inv.periodFrom,
        periodTo: inv.periodTo,
        buyerName: inv.buyerName,
        buyerAddress: inv.buyerAddress,
        buyerCity: inv.buyerCity,
        buyerVAT: inv.buyerVAT,
        buyerOtherID: inv.buyerOtherID
    };

    // Switch to settings/logo defaults if they aren't in the record (metadata)
    // but the builder already pulls from getSettings() for seller info.

    _showModal('tax');
}
