const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const User = require('../models/User');
const WHItem = require('../models/WHItem');
const CashSale = require('../models/CashSale');

/**
 * Colors palette for professional ERP documents
 */
const COLORS = {
    primary: rgb(0.118, 0.298, 0.549),   // BAS Navy Blue #1e4c8c
    primaryDark: rgb(0.08, 0.20, 0.38), // Dark Navy
    secondary: rgb(0.18, 0.44, 0.75),   // Slate Blue
    headerBg: rgb(0.118, 0.298, 0.549),  // Navy Table Header #1e4c8c
    headerText: rgb(1, 1, 1),            // Crisp White Text
    headerBorder: rgb(1, 1, 1),          // White column dividers
    rowAlt: rgb(0.985, 0.990, 0.995),    // Very light zebra
    border: rgb(0.86, 0.89, 0.93),      // Soft Gray Border #dee2e6
    textDark: rgb(0.12, 0.15, 0.20),    // Main Body Text
    textMuted: rgb(0.40, 0.45, 0.52),   // Metadata & subtitles
    categoryBg: rgb(0.945, 0.961, 0.976), // Category banner #f1f5f9
    categoryAccent: rgb(0.118, 0.298, 0.549), // 4px Blue Left Bar
    subtotalBg: rgb(0.96, 0.975, 0.99), // Subtotal background
    grandTotalBg: rgb(0.90, 0.935, 0.98) // Grand Total Highlight
};

function resolveBrowserExecutable() {
    const possiblePaths = [
        process.env.CHROME_PATH,
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ].filter(Boolean);

    return possiblePaths.find(browserPath => fs.existsSync(browserPath)) || null;
}

/**
 * Core Reusable Vector Table PDF Builder
 * Generates selectable, searchable, beautifully paginated vector PDF reports
 * styled identically to BAS ERP screens and print stylesheets.
 */
async function buildVectorTablePdf({
    title = 'REPORT',
    subtitle = '',
    branch = '',
    dateRange = '',
    generatedBy = '',
    metricCards = [],
    columns = [],
    rows = [],
    summaryRow = null,
    orientation = 'portrait'
}) {
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const isLandscape = orientation === 'landscape';
    const pageWidth = isLandscape ? 841.89 : 595.28;
    const pageHeight = isLandscape ? 595.28 : 841.89;

    const margin = 28;
    const contentWidth = pageWidth - (margin * 2);
    const footerHeight = 22;
    const rowHeight = 15;
    const thHeight = 18;

    let pages = [];
    let currentPage = null;
    let y = 0;

    const totalDefinedWidth = columns.reduce((acc, col) => acc + (col.width || 1), 0);
    const resolvedColumns = columns.map(col => ({
        header: col.header || '',
        width: ((col.width || 1) / totalDefinedWidth) * contentWidth,
        align: col.align || 'left'
    }));

    const drawText = (page, text, x, yPos, size, font = regular, color = COLORS.textDark) => {
        if (text === null || text === undefined) return;
        page.drawText(String(text), { x, y: yPos, size, font, color });
    };

    const drawHeader = (page, isFirstPage) => {
        // Company Brand Title
        drawText(page, 'BILAL ACCOUNTING SOFTWARE', margin, pageHeight - margin - 11, 13, bold, COLORS.primary);
        
        // Report Title & Branch
        const titleText = branch ? `${title} — (${branch})` : title;
        drawText(page, titleText, margin, pageHeight - margin - 26, 11, bold, COLORS.primary);

        // Subtitle / Filters
        if (subtitle || dateRange) {
            const subStr = [subtitle, dateRange ? `Date Range: ${dateRange}` : ''].filter(Boolean).join(' | ');
            drawText(page, subStr, margin, pageHeight - margin - 39, 8, regular, COLORS.textMuted);
        }

        // Timestamp & User Info (Top Right)
        const timeStr = `Generated: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`;
        const userStr = generatedBy ? `By: ${generatedBy}` : '';
        const metaStr = [timeStr, userStr].filter(Boolean).join('  ');
        const metaWidth = regular.widthOfTextAtSize(metaStr, 7.5);
        drawText(page, metaStr, pageWidth - margin - metaWidth, pageHeight - margin - 11, 7.5, regular, COLORS.textMuted);

        // Top Divider Line
        page.drawLine({
            start: { x: margin, y: pageHeight - margin - 46 },
            end: { x: pageWidth - margin, y: pageHeight - margin - 46 },
            thickness: 1.5,
            color: COLORS.primary
        });

        let headerBottomY = pageHeight - margin - 48;

        // Render Metric Cards ONLY on Page 1 if available
        if (isFirstPage && metricCards && metricCards.length > 0) {
            const cardGap = 8;
            const cardW = (contentWidth - (cardGap * (metricCards.length - 1))) / metricCards.length;
            const cardH = 28;
            const cardY = headerBottomY - cardH - 6;

            const CARD_THEMES = {
                blue: { bg: rgb(0.937, 0.965, 1.0), border: rgb(0.859, 0.918, 0.996), text: rgb(0.118, 0.298, 0.549) },
                red: { bg: rgb(1.0, 0.945, 0.949), border: rgb(1.0, 0.894, 0.902), text: rgb(0.745, 0.071, 0.235) },
                yellow: { bg: rgb(1.0, 0.984, 0.922), border: rgb(0.996, 0.953, 0.780), text: rgb(0.706, 0.325, 0.035) },
                green: { bg: rgb(0.941, 0.992, 0.957), border: rgb(0.863, 0.988, 0.906), text: rgb(0.082, 0.502, 0.239) }
            };

            metricCards.forEach((c, cIdx) => {
                const theme = CARD_THEMES[c.color] || CARD_THEMES.blue;
                const cX = margin + cIdx * (cardW + cardGap);

                // Card background & border
                page.drawRectangle({
                    x: cX,
                    y: cardY,
                    width: cardW,
                    height: cardH,
                    color: theme.bg,
                    borderColor: theme.border,
                    borderWidth: 1
                });

                // Card Label
                const lbl = String(c.label || '').toUpperCase();
                const lblW = bold.widthOfTextAtSize(lbl, 6.5);
                drawText(page, lbl, cX + (cardW - lblW) / 2, cardY + cardH - 10, 6.5, bold, theme.text);

                // Card Value
                const val = String(c.value || '0');
                const valW = bold.widthOfTextAtSize(val, 9.5);
                drawText(page, val, cX + (cardW - valW) / 2, cardY + 5, 9.5, bold, theme.text);
            });

            headerBottomY = cardY - 6;
        }

        return headerBottomY;
    };

    const drawTableHead = (page, startY) => {
        page.drawRectangle({
            x: margin,
            y: startY - thHeight,
            width: contentWidth,
            height: thHeight,
            color: COLORS.headerBg
        });

        let currentX = margin;
        resolvedColumns.forEach((col, idx) => {
            let textX = currentX + 5;
            const textWidth = bold.widthOfTextAtSize(col.header, 8);
            if (col.align === 'right') {
                textX = currentX + col.width - textWidth - 5;
            } else if (col.align === 'center') {
                textX = currentX + (col.width - textWidth) / 2;
            }

            drawText(page, col.header, textX, startY - thHeight + 5.5, 8, bold, COLORS.headerText);

            // Column vertical white divider
            if (idx > 0) {
                page.drawLine({
                    start: { x: currentX, y: startY },
                    end: { x: currentX, y: startY - thHeight },
                    thickness: 0.8,
                    color: COLORS.headerBorder
                });
            }

            currentX += col.width;
        });

        return startY - thHeight;
    };

    const addPage = (isFirst = false) => {
        currentPage = doc.addPage([pageWidth, pageHeight]);
        pages.push(currentPage);
        const headerBottomY = drawHeader(currentPage, isFirst);
        const nextY = drawTableHead(currentPage, headerBottomY - 4);
        y = nextY;
    };

    // Initialize Page 1
    addPage(true);

    // Render Data Rows
    rows.forEach((row, rowIndex) => {
        const firstCell = String(row[0] || '').trim();
        const isCategoryBanner = firstCell.startsWith('---') && firstCell.endsWith('---');
        const isSubtotal = firstCell.toLowerCase() === 'subtotal';
        const currentItemHeight = isCategoryBanner ? 20 : (isSubtotal ? 17 : rowHeight);

        if (y - currentItemHeight < margin + footerHeight) {
            addPage(false);
        }

        if (isCategoryBanner) {
            // Category Section Header Banner
            const catTitle = firstCell.replace(/^---\s*|\s*---$/g, '').trim();
            pageHeight;
            currentPage.drawRectangle({
                x: margin,
                y: y - 18,
                width: contentWidth,
                height: 18,
                color: COLORS.categoryBg
            });
            // 4px Accent Blue Bar on Left
            currentPage.drawRectangle({
                x: margin,
                y: y - 18,
                width: 4,
                height: 18,
                color: COLORS.categoryAccent
            });

            drawText(currentPage, catTitle, margin + 10, y - 13, 8.5, bold, COLORS.primary);
            y -= 20;
            return;
        }

        if (isSubtotal) {
            // Subtotal Row
            currentPage.drawRectangle({
                x: margin,
                y: y - 16,
                width: contentWidth,
                height: 16,
                color: COLORS.subtotalBg
            });

            // Top and bottom border for subtotal
            currentPage.drawLine({
                start: { x: margin, y: y },
                end: { x: pageWidth - margin, y: y },
                thickness: 0.8,
                color: COLORS.primary
            });
            currentPage.drawLine({
                start: { x: margin, y: y - 16 },
                end: { x: pageWidth - margin, y: y - 16 },
                thickness: 0.8,
                color: COLORS.primary
            });

            let currentX = margin;
            resolvedColumns.forEach((col, colIndex) => {
                const cellVal = row[colIndex] !== undefined && row[colIndex] !== null ? String(row[colIndex]) : '';
                const textWidth = bold.widthOfTextAtSize(cellVal, 7.5);
                let textX = currentX + 5;
                if (col.align === 'right') {
                    textX = currentX + col.width - textWidth - 5;
                } else if (col.align === 'center') {
                    textX = currentX + (col.width - textWidth) / 2;
                }
                drawText(currentPage, cellVal, textX, y - 16 + 4.5, 7.5, bold, COLORS.primary);
                currentX += col.width;
            });

            y -= 18;
            return;
        }

        // Standard Data Row
        if (rowIndex % 2 === 1) {
            currentPage.drawRectangle({
                x: margin,
                y: y - rowHeight,
                width: contentWidth,
                height: rowHeight,
                color: COLORS.rowAlt
            });
        }

        let currentX = margin;
        resolvedColumns.forEach((col, colIndex) => {
            const cellVal = row[colIndex] !== undefined && row[colIndex] !== null ? String(row[colIndex]) : '';
            const textSize = 7.5;
            const textWidth = regular.widthOfTextAtSize(cellVal, textSize);
            
            let textX = currentX + 5;
            if (col.align === 'right') {
                textX = currentX + col.width - textWidth - 5;
            } else if (col.align === 'center') {
                textX = currentX + (col.width - textWidth) / 2;
            }

            let safeText = cellVal;
            if (textWidth > col.width - 10) {
                while (safeText.length > 3 && regular.widthOfTextAtSize(safeText + '..', textSize) > col.width - 10) {
                    safeText = safeText.slice(0, -1);
                }
                safeText += '..';
            }

            drawText(currentPage, safeText, textX, y - rowHeight + 4.5, textSize, regular, COLORS.textDark);

            // Vertical column grid line
            if (colIndex > 0) {
                currentPage.drawLine({
                    start: { x: currentX, y: y },
                    end: { x: currentX, y: y - rowHeight },
                    thickness: 0.5,
                    color: COLORS.border
                });
            }

            currentX += col.width;
        });

        // Horizontal row bottom line
        currentPage.drawLine({
            start: { x: margin, y: y - rowHeight },
            end: { x: pageWidth - margin, y: y - rowHeight },
            thickness: 0.5,
            color: COLORS.border
        });

        y -= rowHeight;
    });

    // Grand Total Row
    if (summaryRow && Array.isArray(summaryRow)) {
        if (y - 20 < margin + footerHeight) {
            addPage(false);
        }

        currentPage.drawRectangle({
            x: margin,
            y: y - 18,
            width: contentWidth,
            height: 18,
            color: COLORS.grandTotalBg
        });

        // Double border for grand total
        currentPage.drawLine({
            start: { x: margin, y: y },
            end: { x: pageWidth - margin, y: y },
            thickness: 1,
            color: COLORS.primary
        });
        currentPage.drawLine({
            start: { x: margin, y: y - 18 },
            end: { x: pageWidth - margin, y: y - 18 },
            thickness: 1.5,
            color: COLORS.primary
        });

        let currentX = margin;
        resolvedColumns.forEach((col, colIndex) => {
            const cellVal = summaryRow[colIndex] !== undefined && summaryRow[colIndex] !== null ? String(summaryRow[colIndex]) : '';
            const textWidth = bold.widthOfTextAtSize(cellVal, 8);
            let textX = currentX + 5;
            if (col.align === 'right') {
                textX = currentX + col.width - textWidth - 5;
            } else if (col.align === 'center') {
                textX = currentX + (col.width - textWidth) / 2;
            }

            drawText(currentPage, cellVal, textX, y - 18 + 5, 8, bold, COLORS.primary);

            if (colIndex > 0) {
                currentPage.drawLine({
                    start: { x: currentX, y: y },
                    end: { x: currentX, y: y - 18 },
                    thickness: 0.5,
                    color: COLORS.border
                });
            }

            currentX += col.width;
        });

        y -= 22;
    }

    // Footers
    const totalPages = pages.length;
    pages.forEach((p, idx) => {
        const pageNum = idx + 1;
        const pageStr = `Page ${pageNum} of ${totalPages}`;
        const pageStrWidth = regular.widthOfTextAtSize(pageStr, 7.5);

        p.drawLine({
            start: { x: margin, y: margin + 12 },
            end: { x: pageWidth - margin, y: margin + 12 },
            thickness: 0.5,
            color: COLORS.border
        });

        drawText(p, 'CONFIDENTIAL — BILAL ACCOUNTING SOFTWARE ENTERPRISE REPORTING', margin, margin + 3, 6.5, regular, COLORS.textMuted);
        drawText(p, pageStr, pageWidth - margin - pageStrWidth, margin + 3, 7.5, bold, COLORS.primary);
    });

    return await doc.save();
}


/**
 * Generate Multi-Slip Payroll Slips Vector PDF
 * Fits 2 salary slips per A4 page with cutting divider, earnings, deductions, and breakdown.
 */
/**
 * Generate Multi-Slip Payroll Slips Vector PDF
 * 100% Exact 1:1 match to the company's official print-payroll.html layout:
 * - Exact same typography (Times New Roman, Roboto, Mrs Saint Delafield cursive signature)
 * - Exact same 3-column table (Earnings, Center Stamp/Logo, Deductions)
 * - Exact same calculations & badges
 * - Exact same footer & outer box padding
 * - Exact same 2 slips per A4 page with cutting divider (✂ Cut Here)
 */
async function generatePayrollSlipsPdf(payrollIds) {
    const payrollRecords = await Payroll.find({ _id: { $in: payrollIds } })
        .populate('employee', 'name fatherName code designation department phone cnic address joiningDate')
        .populate('department', 'name')
        .populate('createdBy', 'name')
        .lean();

    if (!payrollRecords || payrollRecords.length === 0) {
        throw new Error('No payroll records found for the requested IDs');
    }

    // Sort ascending by Employee Code (chota code pehle, phir barhta hua tarteeb se)
    payrollRecords.sort((a, b) => {
        const codeA = String(a.code || a.employee?.code || '');
        const codeB = String(b.code || b.employee?.code || '');
        return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Load stamps as base64 data URLs
    const stampBankPath = path.join(__dirname, '../../Frontend/public/img/payroll/stamp-bank.png');
    const stampCashPath = path.join(__dirname, '../../Frontend/public/img/payroll/stamp-cash.png');
    const stampAdvPath  = path.join(__dirname, '../../Frontend/public/img/payroll/stamp-advance.png');

    const stampBankBase64 = fs.existsSync(stampBankPath) ? `data:image/png;base64,${fs.readFileSync(stampBankPath).toString('base64')}` : '';
    const stampCashBase64 = fs.existsSync(stampCashPath) ? `data:image/jpeg;base64,${fs.readFileSync(stampCashPath).toString('base64')}` : '';
    const stampAdvBase64  = fs.existsSync(stampAdvPath)  ? `data:image/png;base64,${fs.readFileSync(stampAdvPath).toString('base64')}` : '';

    // Load fonts locally as base64 to ensure 100% offline rendering without network timeouts
    const fontDelafieldPath = path.join(__dirname, '../../Frontend/public/fonts/MrsSaintDelafield.ttf');
    const fontDelafieldBase64 = fs.existsSync(fontDelafieldPath) ? fs.readFileSync(fontDelafieldPath).toString('base64') : '';

    const fontRobotoPath = path.join(__dirname, '../../Frontend/public/fonts/Roboto-900.ttf');
    const fontRobotoBase64 = fs.existsSync(fontRobotoPath) ? fs.readFileSync(fontRobotoPath).toString('base64') : '';

    const monthNames = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];

    const fmt = v => (Number(v) || 0).toLocaleString();
    const num = v => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };

    function createSlipHtml(p) {
        const [year, month] = (p.monthYear || '2024-01').split('-');
        const displayDate   = `${monthNames[parseInt(month) - 1] || 'August'} ${year || '2026'}`;

        const earningsSub     = (p.overTime||0)+(p.monthlyComm||0)+(p.ugComm||0)+(p.warehouseComm||0)+(p.natin||0)
                              + (p.otherAllow||0)+(p.rent||0)+(p.teaAllowance||0)+(p.stLateAllow||0);
        let totalEarnings   = (p.perMonth||0) + earningsSub;
        const shortTimeAmt  = (p.shortWeek || p.shortTimeAmount || 0);
        let advanceDed = 0;
        if (p.pmAdvRec !== undefined || p.cmAdvRec !== undefined) {
            advanceDed = num(p.pmAdvRec) + num(p.cmAdvRec);
        } else if (p.totalAdv !== undefined) {
            advanceDed = num(p.totalAdv);
        } else if (p.advanceDed !== undefined) {
            advanceDed = num(p.advanceDed);
        } else {
            advanceDed = num(p.totalAdvRec);
        }
        const otherDed      = (p.penalty||0) + (p.otherDeduction||0) + (p.umrahDeduction||0) || (p.otherDedPenalty || 0);
        const totalDeductions = shortTimeAmt + advanceDed + otherDed + (p.wht||0)
                              + (p.securityDeposit||0) + (p.ttw||0) + (p.fund||0) + (p.ugrm||0)
                              + (p.ebDeduction||0);

        if (!totalEarnings && p.grossTotal) {
            totalEarnings = (p.grossTotal || 0) + shortTimeAmt + (p.ebDeduction||0) + otherDed
                          + (p.securityDeposit||0) + (p.ttw||0) + (p.fund||0) + (p.ugrm||0);
        }

        const computedNet       = Math.max(0, totalEarnings - totalDeductions);
        const bankPaidAmt       = num(p.bankPaid);
        const cashPaidAmt       = num(p.cashPaid);
        const storedNet         = num(p.netTotal);

        let netSalaryDisplay = 0;
        if (bankPaidAmt > 0) {
            netSalaryDisplay = 0;
        } else if (cashPaidAmt > 0) {
            netSalaryDisplay = cashPaidAmt;
        } else {
            netSalaryDisplay = storedNet || computedNet;
        }
        const balance       = (p.pAAdv||0) + (p.csMale||0) - advanceDed;

        let stampHtml = '';
        if (bankPaidAmt > 0 && stampBankBase64) {
            stampHtml = `<img class="stamp-img" src="${stampBankBase64}" alt="Bank Paid">`;
        } else if (p.advanceDed > 0 && cashPaidAmt === 0 && bankPaidAmt === 0 && stampAdvBase64) {
            stampHtml = `<img class="stamp-img" src="${stampAdvBase64}" alt="Advance Paid">`;
        } else if (cashPaidAmt > 0 && stampCashBase64) {
            stampHtml = `<img class="stamp-img" src="${stampCashBase64}" alt="Cash Paid">`;
        }

        return `
        <div class="slip-container">
            <!-- HEADER -->
            <div class="header-section">
                <div class="branch-title">${p.branch || '(Attock)'}</div>
                <div class="slip-title">Salary Slip</div>
            </div>

            <!-- INFO – 3-column mirrored layout -->
            <div class="info-section">
                <div class="info-col-left">
                    <div class="info-row">
                        <span class="info-label">Emp Code:</span>
                        <span class="info-value">${p.code || ''}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Date:</span>
                        <span class="info-value">${displayDate}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Employee:</span>
                        <span class="info-value">${p.employee?.name || 'N/A'}</span>
                    </div>
                </div>
                <div class="info-col-center"></div>
                <div class="info-col-right">
                    <div class="info-right-row">
                        <div class="info-right-main">
                            <span class="info-label">Department:</span>
                            <span class="info-value-plain">${p.department?.name || p.department || ''}</span>
                        </div>
                        <div class="duty-col"><strong>Duty Hrs</strong></div>
                    </div>
                    <div class="info-right-row">
                        <div class="info-right-main">
                            <span class="info-label">Designation:</span>
                            <span class="info-value-plain">${p.designation || ''}</span>
                        </div>
                        <div class="duty-col">${p.totalHrsPerDay || 8}</div>
                    </div>
                </div>
            </div>

            <!-- MAIN 3-COLUMN TABLE -->
            <div class="main-columns">
                <!-- LEFT: EARNINGS -->
                <div class="col-earnings">
                    <div class="col-header">Earnings</div>
                    <div class="row"><div class="label">Basic Salary</div><div class="value">${fmt(p.perMonth)}</div></div>
                    <div class="row row-light"><div class="label">Over Time</div><div class="value">${fmt(p.overTime)}</div></div>
                    <div class="row"><div class="label">Allowance</div><div class="value">0</div></div>
                    <div class="row"><div class="label">Fix Allowance</div><div class="value">${fmt(p.natin)}</div></div>
                    <div class="row"><div class="label">Monthly Commission</div><div class="value">${fmt(p.monthlyComm)}</div></div>
                    <div class="row"><div class="label">UG Commission</div><div class="value">${fmt(p.ugComm)}</div></div>
                    <div class="row"><div class="label">WareHouse Comm</div><div class="value">${fmt(p.warehouseComm)}</div></div>
                    <div class="row"><div class="label">Other Allowance</div><div class="value">${fmt(p.otherAllow)}</div></div>
                    <div class="row"><div class="label">Breakfast &amp; Roti</div><div class="value">${fmt((p.rent || 0) + (p.teaAllowance || 0))}</div></div>
                    <div class="row"><div class="label">ST.Less Allowance</div><div class="value">${fmt(p.stLateAllow)}</div></div>
                    <div class="row row-grey"><div class="label">Gross Salary</div><div class="value">${fmt(totalEarnings)}</div></div>
                    <div class="row ${bankPaidAmt > 0 ? 'row-paid' : ''}"><div class="label">Bank Paid</div><div class="value">${bankPaidAmt > 0 ? `<span class="paid-badge">${fmt(bankPaidAmt)}</span>` : fmt(bankPaidAmt)}</div></div>
                    <div class="net-earnings-cell">NET Salary</div>
                </div>

                <!-- CENTER: LOGO / STAMP -->
                <div class="col-center">
                    <div class="stamp-wrap">${stampHtml}</div>
                </div>

                <!-- RIGHT: DEDUCTIONS -->
                <div class="col-deductions">
                    <div class="col-header">Deductions</div>
                    <div class="row"><div class="label">Short Time</div><div class="value">${fmt(shortTimeAmt)}</div></div>
                    <div class="row"><div class="label">Mess</div><div class="value">${fmt(p.ebDeduction)}</div></div>
                    <div class="row"><div class="label">Pre_Month_Balance</div><div class="value">${fmt(p.pAAdv)}</div></div>
                    <div class="row"><div class="label">Current_Advance</div><div class="value">${fmt(p.csMale)}</div></div>
                    <div class="row"><div class="label">Advance Deduction</div><div class="value">${fmt(advanceDed)}</div></div>
                    <div class="row row-grey"><div class="label">Balance</div><div class="value">${balance.toLocaleString()}</div></div>
                    <div class="row"><div class="label">Other Deduction</div><div class="value">${fmt(p.otherDeduction || 0)}</div></div>
                    <div class="row"><div class="label">Penalty</div><div class="value">${fmt((p.penalty||0) + (p.umrahDeduction||0))}</div></div>
                    <div class="row"><div class="label">Salary WHT</div><div class="value">${fmt(p.wht)}</div></div>
                    <div class="row"><div class="label">Security Deposit</div><div class="value">${fmt(p.securityDeposit)}</div></div>
                    <div class="row row-grey"><div class="label">Total Deduction</div><div class="value">${fmt(totalDeductions)}</div></div>
                    <div class="row ${cashPaidAmt > 0 ? 'row-paid-cash' : ''}"><div class="label">Cash_Paid</div><div class="value">${cashPaidAmt > 0 ? `<span class="paid-badge">${fmt(cashPaidAmt)}</span>` : fmt(cashPaidAmt)}</div></div>
                    <div class="net-deductions-cell">${fmt(netSalaryDisplay)}</div>
                </div>
            </div>

            <!-- SIGNATURE -->
            <div class="signature-section">
                <div class="sig-box">
                    <div class="sig-name-area">
                        <span class="signature-font">${p.createdBy?.name || 'Bilal Sh'}</span>
                    </div>
                    <div class="sig-line"></div>
                    <div class="sig-label">Prepared By</div>
                </div>
                <div class="sig-box">
                    <div class="sig-name-area"></div>
                    <div class="sig-line"></div>
                    <div class="sig-label">Approved By</div>
                </div>
            </div>
        </div>`;
    }

    // Build pages with 2 slips per page wrapper
    let pagesHtml = '';
    for (let i = 0; i < payrollRecords.length; i += 2) {
        pagesHtml += `<div class="page-wrapper">`;
        pagesHtml += `<div class="slip-outer">${createSlipHtml(payrollRecords[i])}</div>`;

        if (i + 1 < payrollRecords.length) {
            pagesHtml += `<div class="cutting-line"></div>`;
            pagesHtml += `<div class="slip-outer">${createSlipHtml(payrollRecords[i + 1])}</div>`;
        }
        pagesHtml += `</div>`;
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Salary Slip</title>
<style>
    @font-face {
        font-family: 'Mrs Saint Delafield';
        font-style: normal;
        font-weight: 400;
        src: url('data:font/ttf;base64,${fontDelafieldBase64}') format('truetype');
    }
    @font-face {
        font-family: 'Roboto';
        font-style: normal;
        font-weight: 900;
        src: url('data:font/ttf;base64,${fontRobotoBase64}') format('truetype');
    }

    .signature-font {
        font-family: 'Mrs Saint Delafield', cursive;
        font-size: 1.5rem;
        font-weight: bold;
        color: #1a237e;
        display: block;
        line-height: 1;
    }

    body {
        font-family: 'Times New Roman', Times, serif;
        margin: 0; padding: 0;
        background-color: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    @page { 
        size: A4 portrait; 
        margin: 0; 
    }

    .page-wrapper {
        width: 210mm;
        height: 297mm;
        max-height: 297mm;
        margin: 0 auto;
        background: white;
        padding: 4mm 5mm;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
    }
    .page-wrapper:last-child {
        page-break-after: auto;
        break-after: auto;
    }

    .slip-outer {
        width: 100%;
        height: 140mm;
        max-height: 140mm;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-sizing: border-box;
    }

    .slip-container {
        width: 100%;
        height: 100%;
        border: 1.5px solid #000;
        padding: 3px 5px 2px 5px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        background: white;
        overflow: hidden;
    }

    .cutting-line {
        width: 100%;
        border-top: 1.2px dashed #000;
        margin: 1mm 0;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 4mm;
        flex-shrink: 0;
    }
    .cutting-line::after {
        content: "✂ Cut Here";
        position: absolute;
        background: white;
        padding: 0 10px;
        font-family: sans-serif;
        font-size: 10px;
        color: #000;
        text-transform: uppercase;
    }

    .header-section {
        text-align: center;
        margin-bottom: 3px;
        flex-shrink: 0;
    }
    .branch-title {
        font-size: 1.2rem;
        font-weight: 900;
        font-family: 'Roboto', sans-serif;
        color: #1a1a1a;
    }
    .slip-title {
        font-size: 0.92rem;
        font-weight: bold;
        text-decoration: underline;
        text-transform: uppercase;
        letter-spacing: 3px;
        color: #000;
    }

    .info-section {
        display: flex;
        margin-bottom: 3px;
        font-size: 0.78rem;
        flex-shrink: 0;
    }
    .info-col-left {
        flex: 0 0 40%;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .info-col-center {
        flex: 0 0 20%;
    }
    .info-col-right {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .info-right-row {
        display: flex;
        align-items: flex-end;
    }
    .info-right-main {
        display: flex;
        align-items: flex-end;
        flex: 1;
        gap: 3px;
    }
    .info-row {
        display: flex;
        align-items: flex-end;
        gap: 3px;
    }
    .info-label {
        font-weight: bold;
        color: #000;
        white-space: nowrap;
        min-width: 68px;
        flex-shrink: 0;
    }
    .info-value {
        border-bottom: 1px solid #000;
        padding-left: 3px;
        color: #000;
        font-weight: bold;
        flex: 1;
    }
    .info-value-plain {
        border-bottom: 1px solid #000;
        padding-left: 3px;
        margin-right: 8px;
        color: #000;
        font-weight: bold;
        flex: 1;
    }
    .duty-col {
        flex-shrink: 0;
        width: 52px;
        text-align: center;
        padding: 0 4px;
        font-weight: bold;
        font-size: 0.78rem;
        color: #000;
        border-bottom: 1px solid #000;
    }

    .main-columns {
        display: flex;
        border: 1.5px solid #000;
        flex: 1;
        overflow: hidden;
        min-height: 0;
    }

    .col-earnings {
        flex: 0 0 40%;
        display: flex;
        flex-direction: column;
        border-right: 1.5px solid #000;
        overflow: hidden;
        box-sizing: border-box;
    }

    .col-center {
        flex: 0 0 20%;
        display: flex;
        align-items: center;
        justify-content: center;
        border-right: 1.5px solid #000;
        box-sizing: border-box;
    }

    .col-deductions {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .col-header {
        background-color: #555;
        color: white;
        text-align: center;
        padding: 3px 2px;
        font-weight: bold;
        font-size: 0.78rem;
        border-bottom: 1.5px solid #000;
        flex-shrink: 0;
    }

    .row {
        display: grid;
        grid-template-columns: 1.9fr 1fr;
        border-bottom: 1px solid #000;
        font-size: 0.71rem;
        align-items: stretch;
        flex: 1;
        min-height: 0;
    }
    .row:last-child { border-bottom: none; }

    .label {
        padding: 0 5px;
        border-right: 1px solid #000;
        color: #000;
        display: flex;
        align-items: center;
    }
    .value {
        padding: 0 5px;
        text-align: right;
        font-weight: bold;
        color: #000;
        display: flex;
        align-items: center;
        justify-content: flex-end;
    }

    .row-grey  { background-color: #ccc; font-weight: bold; }
    .row-light { background-color: #e8e8e8; }
    .row-paid      { background-color: transparent; font-weight: bold; }
    .row-paid-cash { background-color: transparent; font-weight: bold; }
    .paid-badge {
        background-color: #d0d0d0;
        display: block;
        margin: 3px 4px;
        padding: 0 5px;
        text-align: right;
        font-weight: bold;
    }

    .net-earnings-cell {
        background: #000;
        color: white;
        font-size: 0.95rem;
        font-weight: 900;
        text-align: center;
        padding: 0 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        min-height: 26px;
    }
    .net-deductions-cell {
        background: #000;
        color: white;
        font-size: 0.95rem;
        font-weight: 900;
        text-align: right;
        padding: 0 8px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-shrink: 0;
        min-height: 26px;
    }

    .stamp-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }
    .stamp-img {
        width: 180px;
        height: 180px;
        object-fit: contain;
        opacity: 0.75;
    }

    .signature-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 4px 20px 2px 20px;
        flex-shrink: 0;
    }
    .sig-box {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .sig-name-area {
        height: 34px;
        display: flex;
        align-items: flex-end;
    }
    .sig-line {
        border-top: 1.5px solid #000;
        width: 155px;
        margin: 2px 0;
    }
    .sig-label {
        font-size: 0.75rem;
        font-weight: bold;
        color: #000;
    }
</style>
</head>
<body>
    ${pagesHtml}
</body>
</html>`;

    // Launch Chrome to render exact PDF
    const puppeteer = require('puppeteer-core');
    const executablePath = resolveBrowserExecutable();

    if (!executablePath) {
        throw new Error('Google Chrome executable not found for PDF rendering');
    }

    const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-first-run'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' });
        await page.evaluateHandle('document.fonts.ready');

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        return pdfBuffer;
    } finally {
        await browser.close().catch(() => {});
    }
}

/**
 * Report Handlers: Stock, Sales, Ledgers
 */
async function generateStockReportPdf(filters = {}, user = {}) {
    const query = { isActive: { $ne: false } };
    if (filters.category) query.category = filters.category;
    if (filters.search) {
        query.$or = [
            { name: { $regex: filters.search, $options: 'i' } },
            { barcode: { $regex: filters.search, $options: 'i' } },
            { itemsCode: { $regex: filters.search, $options: 'i' } }
        ];
    }

    const items = await WHItem.find(query)
        .populate('category', 'name')
        .sort({ name: 1 })
        .limit(2000)
        .lean();

    const columns = [
        { header: 'Code', width: 2.2, align: 'left' },
        { header: 'Item Name', width: 6.5, align: 'left' },
        { header: 'Category', width: 3.5, align: 'left' },
        { header: 'Cost (PKR)', width: 2.5, align: 'right' },
        { header: 'Stock Qty', width: 2.5, align: 'right' },
        { header: 'Total Value', width: 3.0, align: 'right' }
    ];

    let totalQty = 0;
    let totalVal = 0;

    const rows = items.map(item => {
        const qty = Array.isArray(item.stock) 
            ? item.stock.reduce((sum, s) => sum + Number(s.quantity || 0), 0)
            : Number(item.stock || 0);
        const cost = Number(item.costPrice || 0);
        const val = qty * cost;

        totalQty += qty;
        totalVal += val;

        return [
            item.barcode || item.itemsCode || '-',
            item.name || '-',
            item.category?.name || 'Uncategorized',
            cost.toLocaleString('en-PK', { minimumFractionDigits: 2 }),
            qty.toLocaleString(),
            val.toLocaleString('en-PK', { minimumFractionDigits: 2 })
        ];
    });

    const summaryRow = [
        'TOTALS',
        `Items Count: ${items.length}`,
        '',
        '',
        totalQty.toLocaleString(),
        `PKR ${totalVal.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`
    ];

    return await buildVectorTablePdf({
        title: 'WAREHOUSE STOCK POSITION REPORT',
        subtitle: filters.categoryName ? `Category: ${filters.categoryName}` : 'All Categories',
        branch: user.branch && user.branch.length > 0 ? user.branch[0] : '',
        generatedBy: user.name || '',
        columns,
        rows,
        summaryRow,
        orientation: 'portrait'
    });
}

async function generateSalesReportPdf(filters = {}, user = {}) {
    const query = {};
    if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }
    if (filters.branch) query.branch = filters.branch;

    const sales = await CashSale.find(query)
        .sort({ createdAt: -1 })
        .limit(2000)
        .lean();

    const columns = [
        { header: 'Invoice #', width: 2.5, align: 'left' },
        { header: 'Date', width: 3.0, align: 'left' },
        { header: 'Customer', width: 4.5, align: 'left' },
        { header: 'Branch', width: 2.5, align: 'left' },
        { header: 'Items', width: 1.8, align: 'center' },
        { header: 'Discount', width: 2.2, align: 'right' },
        { header: 'Net Total (PKR)', width: 3.2, align: 'right' }
    ];

    let totalAmount = 0;
    let totalDiscount = 0;

    const rows = sales.map(s => {
        const net = Number(s.netTotal || s.totalAmount || 0);
        const disc = Number(s.discount || 0);
        const itemCount = Array.isArray(s.items) ? s.items.length : 0;
        const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-PK') : '-';

        totalAmount += net;
        totalDiscount += disc;

        return [
            s.invoiceNo || s.invoiceNumber || '-',
            dateStr,
            s.customerName || 'Walking Customer',
            s.branch || '-',
            itemCount,
            disc.toLocaleString(),
            net.toLocaleString('en-PK', { minimumFractionDigits: 2 })
        ];
    });

    const summaryRow = [
        'TOTALS',
        `Sales Count: ${sales.length}`,
        '',
        '',
        '',
        totalDiscount.toLocaleString(),
        `PKR ${totalAmount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`
    ];

    return await buildVectorTablePdf({
        title: 'CASH SALES SUMMARY REPORT',
        dateRange: filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : 'All Time',
        branch: filters.branch || (user.branch && user.branch[0]) || '',
        generatedBy: user.name || '',
        columns,
        rows,
        summaryRow,
        orientation: 'landscape'
    });
}

async function renderHtmlToPdf(bodyHtml) {
    const fontDelafieldPath = path.join(__dirname, '../../Frontend/public/fonts/MrsSaintDelafield.ttf');
    const fontDelafieldBase64 = fs.existsSync(fontDelafieldPath) ? fs.readFileSync(fontDelafieldPath).toString('base64') : '';

    const fontRobotoPath = path.join(__dirname, '../../Frontend/public/fonts/Roboto-900.ttf');
    const fontRobotoBase64 = fs.existsSync(fontRobotoPath) ? fs.readFileSync(fontRobotoPath).toString('base64') : '';

    const stampBankPath = path.join(__dirname, '../../Frontend/public/img/payroll/stamp-bank.png');
    const stampCashPath = path.join(__dirname, '../../Frontend/public/img/payroll/stamp-cash.png');
    const stampAdvPath  = path.join(__dirname, '../../Frontend/public/img/payroll/stamp-advance.png');

    const stampBankBase64 = fs.existsSync(stampBankPath) ? `data:image/png;base64,${fs.readFileSync(stampBankPath).toString('base64')}` : '';
    const stampCashBase64 = fs.existsSync(stampCashPath) ? `data:image/jpeg;base64,${fs.readFileSync(stampCashPath).toString('base64')}` : '';
    const stampAdvBase64  = fs.existsSync(stampAdvPath)  ? `data:image/png;base64,${fs.readFileSync(stampAdvPath).toString('base64')}` : '';

    let processedHtml = bodyHtml || '';
    if (stampBankBase64) {
        processedHtml = processedHtml.replace(/\/img\/payroll\/stamp-bank\.png/g, stampBankBase64);
    }
    if (stampCashBase64) {
        processedHtml = processedHtml.replace(/\/img\/payroll\/stamp-cash\.png/g, stampCashBase64);
    }
    if (stampAdvBase64) {
        processedHtml = processedHtml.replace(/\/img\/payroll\/stamp-advance\.png/g, stampAdvBase64);
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Salary Slip</title>
<style>
    @font-face {
        font-family: 'Mrs Saint Delafield';
        font-style: normal;
        font-weight: 400;
        src: url('data:font/ttf;base64,${fontDelafieldBase64}') format('truetype');
    }
    @font-face {
        font-family: 'Roboto';
        font-style: normal;
        font-weight: 900;
        src: url('data:font/ttf;base64,${fontRobotoBase64}') format('truetype');
    }

    .signature-font {
        font-family: 'Mrs Saint Delafield', cursive;
        font-size: 1.5rem;
        font-weight: bold;
        color: #1a237e;
        display: block;
        line-height: 1;
    }

    body {
        font-family: 'Times New Roman', Times, serif;
        margin: 0; padding: 0;
        background-color: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    @page { 
        size: A4 portrait; 
        margin: 0; 
    }

    .page-wrapper {
        width: 210mm;
        height: 297mm;
        margin: 0 auto;
        background: white;
        padding: 6mm 5mm;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        page-break-after: always;
    }
    .page-wrapper:last-child {
        page-break-after: auto;
    }

    .slip-outer {
        width: 100%;
        height: 140mm;
        display: flex;
        flex-direction: column;
    }

    .slip-container {
        width: 100%;
        height: 138mm;
        border: 1.5px solid #000;
        padding: 3px 5px 2px 5px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        background: white;
    }

    .cutting-line {
        width: 100%;
        border-top: 1.2px dashed #000;
        margin: 1mm 0;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 5mm;
    }
    .cutting-line::after {
        content: "✂ Cut Here";
        position: absolute;
        background: white;
        padding: 0 10px;
        font-family: sans-serif;
        font-size: 10px;
        color: #000;
        text-transform: uppercase;
    }

    .header-section {
        text-align: center;
        margin-bottom: 3px;
        flex-shrink: 0;
    }
    .branch-title {
        font-size: 1.2rem;
        font-weight: 900;
        font-family: 'Roboto', sans-serif;
        color: #1a1a1a;
    }
    .slip-title {
        font-size: 0.92rem;
        font-weight: bold;
        text-decoration: underline;
        text-transform: uppercase;
        letter-spacing: 3px;
        color: #000;
    }

    .info-section {
        display: flex;
        margin-bottom: 3px;
        font-size: 0.78rem;
        flex-shrink: 0;
    }
    .info-col-left {
        flex: 0 0 40%;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .info-col-center {
        flex: 0 0 20%;
    }
    .info-col-right {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .info-right-row {
        display: flex;
        align-items: flex-end;
    }
    .info-right-main {
        display: flex;
        align-items: flex-end;
        flex: 1;
        gap: 3px;
    }
    .info-row {
        display: flex;
        align-items: flex-end;
        gap: 3px;
    }
    .info-label {
        font-weight: bold;
        color: #000;
        white-space: nowrap;
        min-width: 68px;
        flex-shrink: 0;
    }
    .info-value {
        border-bottom: 1px solid #000;
        padding-left: 3px;
        color: #000;
        font-weight: bold;
        flex: 1;
    }
    .info-value-plain {
        border-bottom: 1px solid #000;
        padding-left: 3px;
        margin-right: 8px;
        color: #000;
        font-weight: bold;
        flex: 1;
    }
    .duty-col {
        flex-shrink: 0;
        width: 52px;
        text-align: center;
        padding: 0 4px;
        font-weight: bold;
        font-size: 0.78rem;
        color: #000;
        border-bottom: 1px solid #000;
    }

    .main-columns {
        display: flex;
        border: 1.5px solid #000;
        flex: 1;
        overflow: hidden;
        min-height: 0;
    }

    .col-earnings {
        flex: 0 0 40%;
        display: flex;
        flex-direction: column;
        border-right: 1.5px solid #000;
        overflow: hidden;
        box-sizing: border-box;
    }

    .col-center {
        flex: 0 0 20%;
        display: flex;
        align-items: center;
        justify-content: center;
        border-right: 1.5px solid #000;
        box-sizing: border-box;
    }

    .col-deductions {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .col-header {
        background-color: #555;
        color: white;
        text-align: center;
        padding: 3px 2px;
        font-weight: bold;
        font-size: 0.78rem;
        border-bottom: 1.5px solid #000;
        flex-shrink: 0;
    }

    .row {
        display: grid;
        grid-template-columns: 1.9fr 1fr;
        border-bottom: 1px solid #000;
        font-size: 0.73rem;
        align-items: stretch;
        flex: 1;
        min-height: 0;
    }
    .row:last-child { border-bottom: none; }

    .label {
        padding: 0 5px;
        border-right: 1px solid #000;
        color: #000;
        display: flex;
        align-items: center;
    }
    .value {
        padding: 0 5px;
        text-align: right;
        font-weight: bold;
        color: #000;
        display: flex;
        align-items: center;
        justify-content: flex-end;
    }

    .row-grey  { background-color: #ccc; font-weight: bold; }
    .row-light { background-color: #e8e8e8; }
    .row-paid      { background-color: transparent; font-weight: bold; }
    .row-paid-cash { background-color: transparent; font-weight: bold; }
    .paid-badge {
        background-color: #d0d0d0;
        display: block;
        margin: 3px 4px;
        padding: 0 5px;
        text-align: right;
        font-weight: bold;
    }

    .net-earnings-cell {
        background: #000;
        color: white;
        font-size: 0.95rem;
        font-weight: 900;
        text-align: center;
        padding: 0 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        min-height: 26px;
    }
    .net-deductions-cell {
        background: #000;
        color: white;
        font-size: 0.95rem;
        font-weight: 900;
        text-align: right;
        padding: 0 8px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-shrink: 0;
        min-height: 26px;
    }

    .stamp-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }
    .stamp-img {
        width: 180px;
        height: 180px;
        object-fit: contain;
        opacity: 0.75;
    }

    .signature-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 4px 20px 2px 20px;
        flex-shrink: 0;
    }
    .sig-box {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .sig-name-area {
        height: 34px;
        display: flex;
        align-items: flex-end;
    }
    .sig-line {
        border-top: 1.5px solid #000;
        width: 155px;
        margin: 2px 0;
    }
    .sig-label {
        font-size: 0.75rem;
        font-weight: bold;
        color: #000;
    }
</style>
</head>
<body>
    ${processedHtml}
</body>
</html>`;

    const puppeteer = require('puppeteer-core');
    const executablePath = resolveBrowserExecutable();

    if (!executablePath) {
        throw new Error('Google Chrome executable not found for PDF rendering');
    }

    const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-first-run'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' });
        await page.evaluateHandle('document.fonts.ready');

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        return pdfBuffer;
    } finally {
        await browser.close().catch(() => {});
    }
}

async function renderCustomHtmlToPdf(fullHtml, options = {}) {
    const { orientation = 'portrait' } = options;
    const isLandscape = orientation === 'landscape';

    const puppeteer = require('puppeteer-core');
    const executablePath = resolveBrowserExecutable();

    if (!executablePath) {
        throw new Error('Google Chrome executable not found for PDF rendering');
    }

    const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-first-run'
        ]
    });

    try {
        let processedHtml = fullHtml;
        // Safety: decode HTML entities if <!DOCTYPE or <html were escaped anywhere along the line
        if (processedHtml.includes('&lt;!DOCTYPE') || processedHtml.includes('&lt;html') || processedHtml.includes('&lt;head')) {
            processedHtml = processedHtml
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
        }

        if (!processedHtml.includes('<base ') && processedHtml.includes('<head')) {
            const appUrl = process.env.APP_URL || `http://127.0.0.1:${process.env.PORT || 5000}/`;
            processedHtml = processedHtml.replace(/<head[^>]*>/i, `$&\n<base href="${appUrl}">`);
        }

        const page = await browser.newPage();
        await page.setViewport({
            width: isLandscape ? 1400 : 1000,
            height: isLandscape ? 900 : 1200
        });

        try {
            await page.setContent(processedHtml, { waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 8000 });
        } catch (e) {
            await page.setContent(processedHtml, { waitUntil: 'domcontentloaded' });
        }
        await page.evaluateHandle('document.fonts.ready').catch(() => {});

        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: isLandscape,
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '8mm', right: '6mm', bottom: '8mm', left: '6mm' }
        });

        return pdfBuffer;
    } finally {
        await browser.close().catch(() => {});
    }
}

module.exports = {
    buildVectorTablePdf,
    generatePayrollSlipsPdf,
    renderHtmlToPdf,
    renderCustomHtmlToPdf,
    generateStockReportPdf,
    generateSalesReportPdf
};
