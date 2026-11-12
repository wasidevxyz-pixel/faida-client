const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const xlsx = require('xlsx');
const { PDFDocument } = require('pdf-lib');
const LegacyPayroll = require('../models/LegacyPayroll');
const { applyBranchFilter } = require('../middleware/auth');

// Helper: extract a single page from the master PDF, cropped to one half using MediaBox
// NOTE: We use setMediaBox (not setCropBox) because Chrome's PDF viewer ignores CropBox
//       but always respects MediaBox, which physically reduces the rendered page size.
async function streamPdfPage(pageNum, res, cropHalf = null) {
    const fileName = 'Employee_MonthlyPayRoll_Slip ALL.pdf';
    const pdfPath  = path.join(__dirname, '../../EXPORT', fileName);
    if (!fs.existsSync(pdfPath)) return res.status(404).json({ success: false, message: 'Master PDF not found' });

    const dataBuffer = fs.readFileSync(pdfPath);
    const srcDoc = await PDFDocument.load(dataBuffer);
    const newDoc = await PDFDocument.create();
    const [copiedPage] = await newDoc.copyPages(srcDoc, [pageNum - 1]);
    newDoc.addPage(copiedPage);

    if (cropHalf === 'top' || cropHalf === 'bottom') {
        const { width, height } = copiedPage.getSize();
        const halfH = height / 2;

        if (cropHalf === 'top') {
            // Top half: MediaBox starts at y=halfH, spans halfH upward
            // This tells the viewer the page is only the upper portion
            copiedPage.setMediaBox(0, halfH, width, halfH);
            copiedPage.setCropBox(0, halfH, width, halfH);
            copiedPage.setBleedBox(0, halfH, width, halfH);
            copiedPage.setTrimBox(0, halfH, width, halfH);
        } else {
            // Bottom half: MediaBox starts at y=0, spans halfH upward
            copiedPage.setMediaBox(0, 0, width, halfH);
            copiedPage.setCropBox(0, 0, width, halfH);
            copiedPage.setBleedBox(0, 0, width, halfH);
            copiedPage.setTrimBox(0, 0, width, halfH);
        }
    }

    const pdfBytes = await newDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Slip_Page_${pageNum}.pdf"`);
    res.send(Buffer.from(pdfBytes));
}

// @desc    Get a single page from the master PDF by raw page number
// Now SMART: looks up the employee owning this page and crops to their half automatically.
// This works even with old cached JS that calls /view-page/:page without code/monthYear.
exports.getSinglePagePDF = async (req, res) => {
    try {
        const pageNum = parseInt(req.params.page);
        if (isNaN(pageNum) || pageNum < 1) {
            return res.status(400).json({ success: false, message: 'Invalid page number' });
        }

        // Smart lookup: find the employee whose slip is on this page number
        // If we find exactly 1 match with a stored slipHalf → use it
        // If we find a match but no slipHalf → run runtime detection
        let cropHalf = null;
        try {
            const record = await LegacyPayroll.findOne({ pageNumber: pageNum });
            if (record) {
                if (record.slipHalf) {
                    cropHalf = record.slipHalf;
                    console.log(`[view-page] Found stored slipHalf=${cropHalf} for page ${pageNum}`);
                } else {
                    console.log(`[view-page] No slipHalf stored, running runtime detection for page ${pageNum}...`);
                    cropHalf = await detectSlipHalf(pageNum, record.employeeName, record.employeeCode);
                    console.log(`[view-page] Detected: ${cropHalf}`);
                }
            }
        } catch (lookupErr) {
            console.warn('[view-page] DB lookup failed, showing full page:', lookupErr.message);
        }

        await streamPdfPage(pageNum, res, cropHalf);
    } catch (error) {
        console.error('PDF Split Error:', error);
        res.status(500).json({ success: false, message: 'Failed to extract page' });
    }
};

/**
 * Runtime detection: scan a single extracted page to find which half has this employee's slip.
 * Uses emp code as the primary anchor (it's a unique short token, most reliable).
 * Falls back to matching individual words from the employee name.
 * Only scans ONE page from the PDF so it's fast (~50-100ms).
 */
async function detectSlipHalf(pageNum, employeeName, employeeCode) {
    try {
        const pdfPath = path.join(__dirname, '../../EXPORT', 'Employee_MonthlyPayRoll_Slip ALL.pdf');
        if (!fs.existsSync(pdfPath)) return null;

        // Extract just the single page to a buffer — avoids scanning the entire PDF
        const srcBuffer = fs.readFileSync(pdfPath);
        const srcDoc    = await PDFDocument.load(srcBuffer);
        const miniDoc   = await PDFDocument.create();
        const [pg]      = await miniDoc.copyPages(srcDoc, [pageNum - 1]);
        miniDoc.addPage(pg);
        const singlePageBuffer = Buffer.from(await miniDoc.save());

        let slipHalf = null;
        const searchCode  = String(employeeCode).trim();
        const searchName  = (employeeName || '').toUpperCase().trim();
        // Split into words >=3 chars for word-by-word matching fallback
        const nameWords   = searchName.split(/\s+/).filter(w => w.length >= 3);

        await pdf(singlePageBuffer, {
            pagerender: function (pageData) {
                return pageData.getTextContent().then(function (textContent) {
                    // Build items list with y-coordinates
                    let maxY = 0;
                    const items = textContent.items.map(item => {
                        const y = (item.transform && item.transform[5]) ? item.transform[5] : 0;
                        if (y > maxY) maxY = y;
                        return { str: (item.str || '').trim(), y };
                    }).filter(it => it.str.length > 0);

                    if (maxY === 0 || items.length === 0) return '';
                    const midY = maxY / 2;

                    // --- Priority 1: Match by emp code (most unique & reliable token) ---
                    for (const it of items) {
                        if (it.str === searchCode) {
                            slipHalf = it.y > midY ? 'top' : 'bottom';
                            console.log(`[SlipHalf] Code match "${searchCode}" y=${it.y} midY=${midY} -> ${slipHalf}`);
                            return '';
                        }
                    }

                    // --- Priority 2: Full name in a single item ---
                    for (const it of items) {
                        if (searchName && it.str.toUpperCase() === searchName) {
                            slipHalf = it.y > midY ? 'top' : 'bottom';
                            console.log(`[SlipHalf] Full name match y=${it.y} -> ${slipHalf}`);
                            return '';
                        }
                    }

                    // --- Priority 3: All name words present near the same y-level ---
                    const bands = {};
                    for (const it of items) {
                        const band = Math.round(it.y / 5) * 5;
                        if (!bands[band]) bands[band] = [];
                        bands[band].push(it.str.toUpperCase());
                    }
                    for (const [band, words] of Object.entries(bands)) {
                        const lineStr = words.join(' ');
                        if (nameWords.every(w => lineStr.includes(w))) {
                            slipHalf = parseInt(band) > midY ? 'top' : 'bottom';
                            console.log(`[SlipHalf] Band match band=${band} midY=${midY} -> ${slipHalf}`);
                            return '';
                        }
                    }

                    // --- Priority 4: Any single name word match ---
                    for (const it of items) {
                        if (nameWords.some(w => it.str.toUpperCase() === w)) {
                            slipHalf = it.y > midY ? 'top' : 'bottom';
                            console.log(`[SlipHalf] Word match "${it.str}" y=${it.y} -> ${slipHalf}`);
                            return '';
                        }
                    }

                    return '';
                });
            }
        });

        return slipHalf;
    } catch (e) {
        console.warn('[SlipHalf] Runtime detection failed:', e.message);
        return null;
    }
}

// @desc    Get the correct salary slip by employeeCode + monthYear (branch-safe, single-slip crop)
// @route   GET /api/v1/legacy-payroll/view-slip?code=1014&monthYear=March+2026
exports.getSlipByRecord = async (req, res) => {
    try {
        const { code, monthYear } = req.query;
        if (!code || !monthYear) {
            return res.status(400).json({ success: false, message: 'code and monthYear query params are required' });
        }

        // employeeCode + monthYear is the unique key — no name ambiguity possible
        let record = await LegacyPayroll.findOne({
            employeeCode: String(code),
            monthYear: String(monthYear)
        });

        if (!record) {
            const recordQuery = await applyBranchFilter(req, {
                employeeCode: String(code),
                monthYear: String(monthYear)
            }, LegacyPayroll);
            record = await LegacyPayroll.findOne(recordQuery);
        }

        if (!record) {
            return res.status(404).json({
                success: false,
                message: `No record found for code=${code}, month=${monthYear}. Please re-sync the Excel.`
            });
        }

        if (!record.pageNumber || record.pageNumber < 1) {
            return res.status(404).json({
                success: false,
                message: 'No PDF page linked for this record. Please re-sync the PDF/Excel to fix the link.'
            });
        }

        // Use stored slipHalf from DB (set during Excel sync).
        // If not yet set (old records before re-sync), detect it at runtime from the PDF page.
        let cropHalf = record.slipHalf || null;
        if (!cropHalf) {
            console.log(`[SlipHalf] Not stored for ${code}/${monthYear}, running runtime detection...`);
            cropHalf = await detectSlipHalf(record.pageNumber, record.employeeName, record.employeeCode);
            console.log(`[SlipHalf] Detected: ${cropHalf}`);
        }

        await streamPdfPage(record.pageNumber, res, cropHalf);
    } catch (error) {
        console.error('Slip Lookup Error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve salary slip' });
    }
};

// @desc    Get all legacy payroll records (combined: LegacyPayroll + new Payroll from Apr 2026+)
// Excel sync ONLY touches LegacyPayroll — the Payroll collection is NEVER affected by sync.
exports.getLegacyPayrolls = async (req, res) => {
    try {
        const Payroll = require('../models/Payroll');
        const { branch, employeeCode, employeeName, department, designation, fromMonth, toMonth, page = 1, limit = 50 } = req.query;

        // Check if a specific employee was requested (by code, by id, or by search)
        const hasSpecificEmployee = !!(employeeCode || req.query.employee || req.query.employeeId);

        let targetCodes = [];
        let targetEmpIds = [];
        if (employeeCode) targetCodes.push(String(employeeCode).trim());
        if (req.query.employee || req.query.employeeId) {
            const empId = req.query.employee || req.query.employeeId;
            try {
                const Employee = require('../models/Employee');
                const empDoc = await Employee.findById(empId).select('_id code name cnic').lean();
                if (empDoc) {
                    if (empDoc.code) targetCodes.push(empDoc.code);
                    targetEmpIds.push(empDoc._id);
                    const related = await Employee.find({
                        $or: [
                            { _id: empDoc._id },
                            ...(empDoc.code ? [{ code: empDoc.code }] : []),
                            ...(empDoc.cnic && empDoc.cnic.trim() ? [{ cnic: empDoc.cnic.trim() }] : [])
                        ]
                    }).select('_id code').lean();
                    related.forEach(r => {
                        targetEmpIds.push(r._id);
                        if (r.code) targetCodes.push(r.code);
                    });
                }
            } catch (e) {
                targetEmpIds.push(empId);
            }
        }
        targetCodes = [...new Set(targetCodes.filter(Boolean))];

        // ── 1. Query LegacyPayroll (old Excel-imported records) ──────────────────
        const legacyQuery = {};
        // When searching a specific employee, DO NOT restrict to branch so prior branch records (e.g. Chandni Chowk) show!
        if (!hasSpecificEmployee && branch) {
            legacyQuery.branch = { $regex: branch.replace(/[()]/g, ''), $options: 'i' };
        }
        if (targetCodes.length === 1) {
            legacyQuery.employeeCode = targetCodes[0];
        } else if (targetCodes.length > 1) {
            legacyQuery.employeeCode = { $in: targetCodes };
        }
        if (employeeName && !hasSpecificEmployee) legacyQuery.employeeName = { $regex: employeeName, $options: 'i' };
        if (department && !hasSpecificEmployee)   legacyQuery.department   = { $regex: department, $options: 'i' };
        if (designation && !hasSpecificEmployee)  legacyQuery.designation  = { $regex: designation, $options: 'i' };
        if (fromMonth || toMonth) {
            legacyQuery.salaryDate = {};
            if (fromMonth) legacyQuery.salaryDate.$gte = new Date(fromMonth);
            if (toMonth) {
                const p = toMonth.split('-');
                const end = new Date(p[0], p[1], 0);
                end.setHours(23, 59, 59, 999);
                legacyQuery.salaryDate.$lte = end;
            }
        }
        const legacyRecords = await LegacyPayroll.find(legacyQuery).sort({ salaryDate: -1, employeeCode: 1 }).lean();

        // ── 2. Query new Payroll records (Apr 2026 onwards) ──────────────────────
        // These are slips created via the Payroll screen — never touched by Excel sync.
        const NEW_PAYROLL_CUTOFF = '2026-04'; // First month new payroll was created
        const payrollQuery = {
            isImportOnly: { $ne: true },       // Exclude Excel-imported payroll rows
            code: { $not: /^IMP-/i }           // Exclude auto-generated import employees
        };

        // Month range for new payroll (use monthYear string comparison — works for YYYY-MM)
        const effectiveFrom = fromMonth && fromMonth >= NEW_PAYROLL_CUTOFF ? fromMonth : NEW_PAYROLL_CUTOFF;
        const effectiveTo   = toMonth || '9999-12';
        payrollQuery.monthYear = { $gte: effectiveFrom, $lte: effectiveTo };

        // Skip if date range is entirely before the cutoff
        if (!toMonth || toMonth >= NEW_PAYROLL_CUTOFF) {
            if (!hasSpecificEmployee && branch) {
                payrollQuery.branch = { $regex: branch.replace(/[()]/g, ''), $options: 'i' };
            }
            if (department && !hasSpecificEmployee)   payrollQuery.department = { $regex: department, $options: 'i' };
            if (designation && !hasSpecificEmployee)  payrollQuery.designation = { $regex: designation, $options: 'i' };
            if (targetCodes.length > 0 || targetEmpIds.length > 0) {
                payrollQuery.$or = [
                    ...(targetCodes.length > 0 ? [{ code: { $in: targetCodes } }] : []),
                    ...(targetEmpIds.length > 0 ? [{ employee: { $in: targetEmpIds } }] : [])
                ];
            } else if (employeeCode) {
                payrollQuery.code = { $regex: employeeCode, $options: 'i', $not: /^IMP-/i };
            }
        }

        let newPayrollRecords = [];
        // Only query if the date range overlaps with Apr 2026+
        const shouldQueryNewPayroll = !toMonth || toMonth >= NEW_PAYROLL_CUTOFF;
        if (shouldQueryNewPayroll) {
            const rawPayrolls = await Payroll.find(payrollQuery)
                .populate({ path: 'employee', select: 'name code' })
                .sort({ monthYear: -1, code: 1 })
                .lean();

            // Filter by name search (done in JS since Payroll uses employee ref, not embedded name)
            const filtered = employeeName
                ? rawPayrolls.filter(p => {
                    const name = p.employee?.name || '';
                    return name.toLowerCase().includes(employeeName.toLowerCase());
                })
                : rawPayrolls;

            // Map Payroll fields → unified LegacyPayroll-compatible format
            newPayrollRecords = filtered.map(p => ({
                source:           'payroll',          // marker: this is a new payroll slip
                payrollId:        p._id.toString(),   // for printing the real payroll slip
                employeeCode:     p.code || '',
                employeeName:     p.employee?.name || 'Unknown',
                branch:           p.branch || '',
                department:       p.department || '',
                designation:      p.designation || '',
                monthYear:        p.monthYear,
                salaryDate:       new Date(p.monthYear + '-01'),

                // Earnings
                basicSalary:      p.perMonth || 0,
                overTime:         p.overTime || 0,
                monthlyCommission: p.monthlyComm || 0,
                ugComm:           p.ugComm || 0,
                warehouseComm:    p.warehouseComm || 0,
                fixAllowance:     p.natin || 0,
                otherAllowance:   p.otherAllow || 0,
                stLessAllowance:  p.stLateAllow || 0,
                grossSalary:      p.grossTotal || 0,

                // Deductions
                shortTime:        p.shortTimeAmount || 0,
                mess:             p.ebDeduction || 0,
                preMonthBalance:  p.pAAdv || 0,
                currentAdvance:   p.csMale || 0,
                advanceDeduction: p.totalAdv || 0,
                otherDeductionPenalty: p.penalty || 0,
                salaryWHT:        p.wht || 0,
                securityDeposit:  p.securityDeposit || 0,
                totalDeduction:   p.deductionsTotal || (p.totalAdv + p.shortTimeAmount + p.wht + p.penalty + p.securityDeposit + p.ebDeduction) || 0,

                netSalary:        p.netTotal || 0,
                bankPaid:         p.bankPaid || 0,
                cashPaid:         p.cashPaid || 0,
            }));
        }

        // ── 3. Merge, sort, and paginate ─────────────────────────────────────────
        // Tag legacy records with source
        const taggedLegacy = legacyRecords.map(r => ({ ...r, source: 'legacy' }));

        const combined = [...taggedLegacy, ...newPayrollRecords]
            .sort((a, b) => {
                // Sort by salaryDate descending, then by name ascending
                const da = new Date(a.salaryDate || 0);
                const db = new Date(b.salaryDate || 0);
                if (db - da !== 0) return db - da;
                return (a.employeeName || '').localeCompare(b.employeeName || '');
            });

        const total    = combined.length;
        const pageInt  = parseInt(page);
        const limitInt = parseInt(limit);
        const paged    = combined.slice((pageInt - 1) * limitInt, pageInt * limitInt);

        res.status(200).json({
            success: true,
            total,
            page:  pageInt,
            pages: Math.ceil(total / limitInt),
            data:  paged
        });
    } catch (error) {
        console.error('getLegacyPayrolls Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Upload legacy PDF
exports.uploadLegacyPDF = async (req, res) => {
    try {
        if (!req.files || !req.files.pdf) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const file = req.files.pdf;
        const uploadPath = path.join(__dirname, '../../EXPORT', 'Employee_MonthlyPayRoll_Slip ALL.pdf');
        file.mv(uploadPath, (err) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.status(200).json({ success: true, message: 'File uploaded successfully' });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Process existing PDF in EXPORT folder
exports.processLegacyPDF = async (req, res) => {
    try {
        const fileName = 'Employee_MonthlyPayRoll_Slip ALL.pdf';
        const pdfPath  = path.join(__dirname, '../../EXPORT', fileName);
        if (!fs.existsSync(pdfPath)) return res.status(404).json({ success: false, message: 'PDF not found in EXPORT folder' });

        console.log('Processing PDF...');
        const dataBuffer = fs.readFileSync(pdfPath);
        await LegacyPayroll.deleteMany({});

        const data = await pdf(dataBuffer, {
            pagerender: function(pageData) {
                return pageData.getTextContent().then(function(textContent) {
                    let lastY, text = '';
                    for (let item of textContent.items) {
                        text += (lastY == item.transform[5] || !lastY) ? item.str : '\n' + item.str;
                        lastY = item.transform[5];
                    }
                    return text + `\n[[PAGE_INDEX:${pageData.pageIndex + 1}]]\n`;
                });
            }
        });

        const records = parsePDFText(data.text, fileName);
        console.log(`Parsed ${records.length} records.`);

        let insertedCount = 0;
        if (records.length > 0) {
            const bulkOps = records.map(r => ({
                updateOne: { filter: { employeeCode: r.employeeCode, monthYear: r.monthYear }, update: { $set: r }, upsert: true }
            }));
            try {
                const result = await LegacyPayroll.bulkWrite(bulkOps, { ordered: false });
                insertedCount = (result.upsertedCount || 0) + (result.modifiedCount || 0);
            } catch (e) {
                console.error('BulkWrite error:', e.message);
                insertedCount = e.result ? e.result.nUpserted + e.result.nModified : 0;
            }
        }

        res.status(200).json({ success: true, message: `Done. ${records.length} parsed, ${insertedCount} saved.`, totalParsed: records.length, inserted: insertedCount });
    } catch (error) {
        console.error('PDF Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Process Excel from EXPORT folder
exports.processLegacyExcel = async (req, res) => {
    try {
        const exportDir = path.join(__dirname, '../../EXPORT');
        if (!fs.existsSync(exportDir)) return res.status(404).json({ success: false, message: 'EXPORT folder not found' });
        
        const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.xls') || f.endsWith('.xlsx'));
        if (files.length === 0) return res.status(404).json({ success: false, message: 'No Excel files found in EXPORT folder' });

        // Get the latest file
        const latestFile = files.sort((a, b) => {
            const statA = fs.statSync(path.join(exportDir, a));
            const statB = fs.statSync(path.join(exportDir, b));
            return statB.mtime - statA.mtime;
        })[0];

        const filePath = path.join(exportDir, latestFile);
        console.log(`Processing Excel: ${latestFile}`);

        const workbook = xlsx.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        const headers = data[0].map(h => String(h || '').trim().toUpperCase().replace(/[._\s]/g, ''));
        const rows = data.slice(1);

        // --- STEP 1: Scan PDF to build a Page Map (Code+Month -> Page) ---
        const pdfPath = path.join(__dirname, '../../EXPORT', 'Employee_MonthlyPayRoll_Slip ALL.pdf');
        const pageMap = new Map();
        if (fs.existsSync(pdfPath)) {
            console.log('Building PDF Page Map with position data...');
            const pdfBuffer = fs.readFileSync(pdfPath);
            await pdf(pdfBuffer, {
                pagerender: function(pageData) {
                    return pageData.getTextContent().then(function(textContent) {
                        const pageNum = pageData.pageIndex + 1;

                        // Determine page height from the maximum y-coordinate found
                        let maxY = 0;
                        const namedItems = [];
                        const pageText = textContent.items.map(item => {
                            const y = item.transform ? item.transform[5] : 0;
                            if (y > maxY) maxY = y;
                            namedItems.push({ str: item.str, y });
                            return item.str;
                        }).join(' ');

                        const dateRegex = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})\b/gi;
                        let dates = [];
                        let match;
                        while ((match = dateRegex.exec(pageText)) !== null) {
                            dates.push(`${match[1]} ${match[2]}`);
                        }

                        dates.forEach(d => {
                            const key = d.toLowerCase();
                            if (!pageMap.has(key)) pageMap.set(key, []);
                            pageMap.get(key).push({
                                pageNum,
                                pageText: pageText.toUpperCase(),
                                items: namedItems,  // carries y-coords for slipHalf detection
                                pageHeight: maxY    // approximate page height from content
                            });
                        });
                        return '';
                    });
                }
            });
            console.log(`PDF Scan Complete: Indexed pages for ${pageMap.size} months.`);
        }

        // ⚠️ CLEAN WIPE
        await LegacyPayroll.deleteMany({});

        const bulkMap = new Map();
        for (const row of rows) {
            if (!row || row.length < 5) continue;
            const getV = (key) => {
                const idx = headers.indexOf(key.toUpperCase().replace(/[._\s]/g, ''));
                return (idx !== -1 && row[idx] !== undefined) ? row[idx] : null;
            };

            const name = String(getV('Employee') || '').trim();
            const rawDate = getV('Date');
            if (!name || !rawDate) continue;

            const date = parseExcelDate(rawDate);
            const mY = getMonthYear(date);
            let branch = String(getV('Branch') || '').trim().replace(/[()]/g, '').trim();
            const empCode = String(getV('EmpCode') || getV('EmployeeCode') || getV('PayRollID') || '');

            // 🔗 SMART LINKING: Match by Name + Branch within the correct Month's pages
            // This prevents two employees with the same name in different branches from
            // getting each other's slip page.
            const monthKey = mY.toLowerCase();
            const candidatePages = pageMap.get(monthKey) || [];
            let pageNumber = null;

            const searchName   = name.toUpperCase();
            // Normalize branch for search: strip parens, trim, uppercase
            const searchBranch = branch.replace(/[()]/g, '').trim().toUpperCase();

            // --- Pass 1: Match by Name AND Branch (most accurate) ---
            let matchedPage = null;
            if (searchBranch) {
                for (const p of candidatePages) {
                    if (p.pageText.includes(searchName) && p.pageText.includes(searchBranch)) {
                        matchedPage = p;
                        pageNumber = p.pageNum;
                        break;
                    }
                }
            }

            // --- Pass 2: Fallback — match by Name only (for records without branch on PDF) ---
            if (!matchedPage) {
                for (const p of candidatePages) {
                    if (p.pageText.includes(searchName)) {
                        matchedPage = p;
                        pageNumber = p.pageNum;
                        break;
                    }
                }
            }

            // --- Determine which half of the page this slip is on (top or bottom) ---
            // PDF y-coords: 0 = bottom, pageHeight = top. So y > half = upper half of page.
            let slipHalf = null;
            if (matchedPage && matchedPage.items && matchedPage.pageHeight > 0) {
                const midY = matchedPage.pageHeight / 2;
                // Find the y-coordinate of the first text item matching the employee name
                for (const item of matchedPage.items) {
                    if (item.str && item.str.toUpperCase().includes(searchName)) {
                        slipHalf = item.y > midY ? 'top' : 'bottom';
                        break;
                    }
                }
                // Fallback: split the name into words and try word-by-word
                if (!slipHalf) {
                    const nameParts = searchName.split(' ').filter(p => p.length > 2);
                    for (const item of matchedPage.items) {
                        if (item.str && nameParts.some(part => item.str.toUpperCase().includes(part))) {
                            slipHalf = item.y > midY ? 'top' : 'bottom';
                            break;
                        }
                    }
                }
            }

            const payload = {
                employeeName: name,
                salaryDate: date,
                monthYear: mY,
                branch: branch,
                employeeCode: empCode,
                pageNumber: pageNumber,
                slipHalf: slipHalf,   // 'top', 'bottom', or null (full page shown if unknown)
                department: String(getV('Department') || '').trim(),
                designation: String(getV('Designation') || '').trim(),
                basicSalary: parseFloat(getV('BasicSalary')) || 0,
                overTime: parseFloat(getV('OverTime')) || 0,
                stLessAllowance: parseFloat(getV('STLessAllowance')) || 0,
                fixAllowance: parseFloat(getV('FixAllowance')) || 0,
                monthlyCommission: parseFloat(getV('Commission')) || 0,
                warehouseComm: parseFloat(getV('WHCommission')) || 0,
                otherEarning: parseFloat(getV('OtherEarning')) || 0,
                breakfastRoti: parseFloat(getV('RottiNashta')) || 0,
                grossSalary: parseFloat(getV('GrossSalary')) || 0,
                shortTime: parseFloat(getV('ShortTime')) || 0,
                mess: parseFloat(getV('Mess')) || 0,
                preMonthBalance: parseFloat(getV('PreMonthBalance')) || 0,
                currentAdvance: parseFloat(getV('CurrentMonthBalance')) || 0,
                advanceDeduction: parseFloat(getV('AdvanceDeduction')) || 0,
                balance: parseFloat(getV('NetAdvances')) || 0,
                otherDeductionPenalty: parseFloat(getV('OtherDeduction')) || 0,
                salaryWHT: parseFloat(getV('WHT')) || 0,
                securityDeposit: parseFloat(getV('SecurityDeposit')) || 0,
                totalDeduction: parseFloat(getV('TotalDeduction')) || 0,
                netSalary: parseFloat(getV('NetTotal')) || 0,
                paidVia: String(getV('Status') || '')
            };

            // Payment Status Assignment
            const netAmt = payload.netSalary;
            const status = payload.paidVia.toLowerCase();
            if (status.includes('bank')) {
                payload.bankPaid = netAmt;
                payload.cashPaid = 0;
            } else {
                payload.cashPaid = netAmt;
                payload.bankPaid = 0;
            }

            // 🛡️ IN-MEMORY DEDUPLICATION: Use a Map to ensure only one record per Code+Month
            // This prevents "Duplicate Key" errors even if the Excel has accidental duplicates.
            const uniqueKey = `${empCode}_${mY}`.toLowerCase();
            bulkMap.set(uniqueKey, {
                updateOne: {
                    filter: { employeeCode: empCode, monthYear: mY },
                    update: { $set: payload },
                    upsert: true
                }
            });
        }

        const bulkOps = Array.from(bulkMap.values());

        if (bulkOps.length > 0) {
            const chunkSize = 1000;
            for (let i = 0; i < bulkOps.length; i += chunkSize) {
                await LegacyPayroll.bulkWrite(bulkOps.slice(i, i + chunkSize), { ordered: true });
            }
        }

        res.status(200).json({ success: true, message: `Processed ${latestFile}. Total records synced: ${bulkOps.length}` });
    } catch (error) {
        console.error('Excel Import Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const parseExcelDate = (val) => {
    if (!val) return new Date();
    
    // 1. If it's a serial number from Excel
    if (typeof val === 'number') {
        let d = new Date(Math.round((val - 25569) * 86400 * 1000));
        
        // 🛡️ SMART DATE CORRECTOR: Fix Swapped Month/Day
        // Some software exports March (03/11) as November (11/03).
        // If we get a November date from a number, we check if swapping month/day makes it March.
        if (d.getFullYear() === 2026 && d.getMonth() === 10) { // November
            // Swap 11 (Month) with 3 (Day)
            const day = d.getDate();
            if (day <= 12) {
                return new Date(2026, day - 1, 11);
            }
        }
        return d;
    }

    const s = String(val).trim();
    
    // 2. Strict DD/MM/YYYY Parsing
    const parts = s.split('/');
    if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        return new Date(y, m - 1, d);
    }

    return new Date(val);
};

const getMonthYear = (date) => {
    if (!date || isNaN(date.getTime())) return 'Unknown';
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

// @desc    Get autocomplete suggestions (merged: legacy + new payroll employees)
exports.getSuggestions = async (req, res) => {
    try {
        const Payroll = require('../models/Payroll');

        // ── 1. Legacy employees ──────────────────────────────────────────────
        const legacyEmps = await LegacyPayroll.aggregate([
            { $sort: { salaryDate: -1 } },
            { $group: {
                _id: "$employeeCode",
                name:        { $first: "$employeeName" },
                department:  { $first: "$department" },
                designation: { $first: "$designation" },
                branch:      { $first: "$branch" }
            }},
            { $project: { _id: 0, employeeCode: "$_id", name: 1, department: 1, designation: 1, branch: 1 } }
        ]);

        // ── 2. New payroll employees (Apr 2026+) ─────────────────────────────
        const newEmps = await Payroll.aggregate([
            { $match: {
                monthYear: { $gte: '2026-04' },
                code: { $exists: true, $ne: null, $not: { $regex: '^IMP-', $options: 'i' } }
            }},
            { $sort: { monthYear: -1 } },
            { $group: {
                _id: "$code",
                employeeId:  { $first: "$employee" },  // ObjectId
                department:  { $first: "$department" },
                designation: { $first: "$designation" },
                branch:      { $first: "$branch" }
            }}
        ]);

        // Populate employee names for new records (IMP- employees already excluded in $match above)
        const Employee = require('../models/Employee');
        const empIds = newEmps.map(e => e.employeeId).filter(Boolean);
        const empDocs = await Employee.find({ _id: { $in: empIds } }, 'name _id').lean();
        const empNameMap = {};
        empDocs.forEach(e => { empNameMap[e._id.toString()] = e.name; });

        // ── 3. Build unified empMap ──────────────────────────────────────────
        const empMap = {};

        // Tag legacy employees
        legacyEmps.forEach(e => {
            empMap[e.employeeCode] = {
                name:        e.name,
                department:  e.department  || '',
                designation: e.designation || '',
                branch:      e.branch      || '',
                source:      'legacy'
            };
        });

        // Tag new payroll employees (IMP- already excluded; only add codes not in legacy)
        newEmps.forEach(e => {
            const code = e._id;
            if (!code) return;
            const name = empNameMap[e.employeeId?.toString()] || '';
            if (!name) return; // skip if employee doc not found
            if (!empMap[code]) {
                empMap[code] = {
                    name,
                    department:  e.department  || '',
                    designation: e.designation || '',
                    branch:      e.branch      || '',
                    source:      'payroll'
                };
            }
        });

        const codes        = Object.keys(empMap);
        const names        = [...new Set(Object.values(empMap).map(e => e.name).filter(Boolean))];
        const departments  = [...new Set(Object.values(empMap).map(e => e.department).filter(Boolean))];
        const designations = [...new Set(Object.values(empMap).map(e => e.designation).filter(Boolean))];

        // Normalize branches: strip parentheses + trim, then deduplicate case-insensitively
        // Legacy stores "(Attock)", new payroll stores "Attock" — merge to clean "Attock"
        const branchNormMap = new Map(); // key = lowercase-clean, value = clean display name
        Object.values(empMap).forEach(e => {
            if (!e.branch) return;
            const clean = e.branch.replace(/[()]/g, '').trim();
            if (clean.length < 2) return;
            const key = clean.toLowerCase();
            if (!branchNormMap.has(key)) branchNormMap.set(key, clean);
        });
        const branches = [...branchNormMap.values()].sort();

        res.status(200).json({ success: true, codes, names, branches, departments, designations, empMap });
    } catch (error) {
        console.error('getSuggestions Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get employee history (merged: LegacyPayroll + new Payroll)
exports.getEmployeeHistory = async (req, res) => {
    try {
        const Payroll  = require('../models/Payroll');
        const code     = req.params.code;

        // Legacy records
        const legacyRecs = await LegacyPayroll.find({ employeeCode: code }).sort({ salaryDate: -1 }).lean();
        const taggedLegacy = legacyRecs.map(r => ({ ...r, source: 'legacy' }));

        // New payroll records
        const newRecs = await Payroll.find({ code, monthYear: { $gte: '2026-04' } })
            .populate({ path: 'employee', select: 'name' })
            .sort({ monthYear: -1 })
            .lean();

        const taggedNew = newRecs.map(p => ({
            source:       'payroll',
            payrollId:    p._id.toString(),
            employeeCode: p.code || code,
            employeeName: p.employee?.name || '',
            branch:       p.branch || '',
            monthYear:    p.monthYear,
            salaryDate:   new Date(p.monthYear + '-01'),
            basicSalary:  p.perMonth || 0,
            grossSalary:  p.grossTotal || 0,
            netSalary:    p.netTotal || 0,
        }));

        const combined = [...taggedLegacy, ...taggedNew].sort((a, b) =>
            new Date(b.salaryDate || 0) - new Date(a.salaryDate || 0)
        );

        res.status(200).json({ success: true, data: combined });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete record
exports.deleteLegacyRecord = async (req, res) => {
    try {
        await LegacyPayroll.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Record deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── PDF PARSING LOGIC ─────────────────────────────────────────────────────────
//
// VERIFIED STRUCTURE (from raw PDF text analysis of KHALID AYUB & SAMINA ASHRAF):
//
// Each page is split by "Basic Salary". After the split, each block = 1 employee.
// Inside the block (0-indexed after split), confirmed positions relative to fi (Fix Allowance):
//
//  fi+1  = Employee Name
//  fi+2  = Department
//  fi+3  = Designation
//  fi+4  = Basic Salary value
//  fi+5  = Bank Paid value
//  fi+6  = Advance Deduction value
//  fi+7  = Fix Allowance value
//  fi+8  = Allowance value (appears BEFORE the "Allowance" label)
//  myI+1 = Other Deduction/Penalty value (right after Month/Year line)
//  Value BEFORE "Short Time" label = Short Time
//  Value AFTER "Short Time" label  = Over Time (value sits between ST and OT labels)
//  brI+1 = Total Deduction, brI+2 = Mess, brI+3 = Gross Salary, brI+5 = WHT
//  Value BEFORE "Pre_Month_Balance" = Pre_Month_Balance
//  Value BEFORE "Current_Advance"   = Current_Advance
//  Last "Balance" label → value before it = Balance (exact match avoids Pre_Month_Balance)
//  Value BEFORE "Cash_Paid"         = Cash_Paid
//  ecl+2 = Monthly Commission, ecl+3 = Warehouse Comm
//
function parsePDFText(text, fileName) {
    const pages = text.split(/\[\[PAGE_INDEX:(\d+)\]\]/);
    const records = [];
    const monthMap = {
        'january':0, 'february':1, 'march':2, 'april':3, 'may':4, 'june':5,
        'july':6, 'august':7, 'september':8, 'october':9, 'november':10, 'december':11
    };

    for (let i = 0; i < pages.length; i += 2) {
        const content = pages[i];
        const pageNum = parseInt(pages[i + 1]);
        if (!content || isNaN(pageNum)) continue;

        const blocks = content.split('Basic Salary');
        blocks.forEach((block, idx) => {
            if (idx === 0) return;

            // Pre-process: split merged items like "0Security Deposit" into separate lines
            const rawLines = block.split('\n');
            const lines = [];
            for (const raw of rawLines) {
                const t = raw.trim();
                if (!t) continue;
                const merged = t.match(/^(-?[\d,]+(?:\.\d+)?)([A-Za-z_].*)$/);
                if (merged) {
                    lines.push(merged[1]);          // numeric part
                    lines.push(merged[2].trim());   // label part
                } else {
                    lines.push(t);
                }
            }

            try {
                // ── ANCHORS ─────────────────────────────────────────────────
                const fi  = lines.findIndex(l => l === 'Fix Allowance' || l === 'Fix_Allowance');
                const ecl = lines.findIndex(l => l === 'Emp Code:');
                const myI = lines.findIndex(l => /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/i.test(l));
                const brI = lines.findIndex(l => /^\([^)]+\)$/.test(l));

                if (fi === -1 || ecl === -1) return;

                const record = { sourceFile: fileName, pageNumber: pageNum };

                // ── METADATA ─────────────────────────────────────────────────
                record.employeeName = lines[fi + 1] || '';
                record.department   = lines[fi + 2] || '';
                record.designation  = lines[fi + 3] || '';
                record.employeeCode = lines[ecl + 1] || '';
                record.monthYear    = myI !== -1 ? lines[myI] : '';
                record.branch       = brI !== -1 ? lines[brI].replace(/[()]/g, '').trim() : 'Unknown';

                if (record.monthYear) {
                    const parts = record.monthYear.split(' ');
                    if (parts.length === 2) {
                        const m = monthMap[parts[0].toLowerCase()];
                        const y = parseInt(parts[1]);
                        if (m !== undefined && !isNaN(y)) record.salaryDate = new Date(y, m, 1);
                    }
                }

                // ── FIXED-OFFSET EARNINGS ────────────────────────────────────
                record.basicSalary      = pc(lines[fi + 4]);
                record.bankPaid         = pc(lines[fi + 5]);
                record.advanceDeduction = pc(lines[fi + 6]);
                record.fixAllowance     = pc(lines[fi + 7]);
                record.allowance        = pc(lines[fi + 8]); // value before "Allowance" label

                // ── COMMISSION (Emp Code offsets) ────────────────────────────
                record.monthlyCommission = pc(lines[ecl + 2]);
                record.warehouseComm     = pc(lines[ecl + 3]);

                // ── OTHER DEDUCTION / PENALTY (after month/year line) ────────
                record.otherDeductionPenalty = (myI !== -1) ? pc(lines[myI + 1]) : 0;

                // ── SHORT TIME & OVER TIME ────────────────────────────────────
                // ST label is in the block; value BEFORE it = Short Time amount
                // Value AFTER ST label (between ST and OT labels) = Over Time amount
                record.shortTime = 0;
                record.overTime  = 0;
                const stIdx = lines.findIndex(l => l === 'Short Time');
                if (stIdx > 0) {
                    record.shortTime = pc(lines[stIdx - 1]);
                    // Next line after ST label: if it's numeric, it's OT value
                    const afterST = lines[stIdx + 1] || '';
                    if (/^-?[\d,]+(\.\d+)?$/.test(afterST)) {
                        record.overTime = pc(afterST);
                    }
                }

                // ── OTHER ALLOWANCES ─────────────────────────────────────────────
                let otherAll = getValBefore(lines, 'Other Allowance');
                if (otherAll === 0) {
                    // Fallback for specific layouts (like Bilal's) where it's 2 lines before Salary WHT
                    const whtIdx = lines.findIndex(l => l === 'Salary WHT');
                    if (whtIdx > 1) {
                        const candidate = pc(lines[whtIdx - 2]);
                        if (candidate > 0) otherAll = candidate;
                    }
                }
                record.otherAllowance = otherAll;
                record.breakfastRoti  = 0;
                record.homeAllowance  = 0;

                // ── BRANCH-OFFSET TOTALS ─────────────────────────────────────
                // brI+1=Total Ded, brI+2=Mess, brI+3=Gross Salary, brI+5=WHT
                if (brI !== -1) {
                    const totalDed = pc(lines[brI + 1]);
                    const mVal     = pc(lines[brI + 2]);
                    const gVal     = pc(lines[brI + 3]);
                    
                    record.totalDeduction = totalDed;
                    record.grossSalary    = gVal;
                    
                    // Logic: If mVal matches gVal (like Sadia) OR matches (gVal - totalDed) (like Ameer), 
                    // it is a layout shift picking up Gross or Net Salary instead of Mess.
                    const expectedNet = gVal - totalDed;
                    if (mVal === gVal || mVal === expectedNet) {
                        record.mess = 0;
                    } else {
                        record.mess = mVal;
                    }
                    
                    record.salaryWHT = pc(lines[brI + 5]);
                }

                // ── LABEL-BEFORE DEDUCTIONS ──────────────────────────────────
                record.cashPaid        = getValBefore(lines, 'Cash_Paid');
                record.preMonthBalance = getValBefore(lines, 'Pre_Month_Balance');
                record.currentAdvance  = getValBefore(lines, 'Current_Advance');

                // Balance: use lastIndexOf for exact "Balance" match (not Pre_Month_Balance)
                const balIdx = lines.lastIndexOf('Balance');
                record.balance = (balIdx > 0) ? pc(lines[balIdx - 1]) : 0;

                // Security Deposit
                const sdIdx = lines.findIndex(l => l === 'Security Deposit');
                record.securityDeposit = (sdIdx > 0) ? pc(lines[sdIdx - 1]) : 0;

                // ── NET SALARY ───────────────────────────────────────────────
                record.netSalary = record.bankPaid > 0
                    ? record.bankPaid
                    : Math.max(0, (record.grossSalary || 0) - (record.totalDeduction || 0));

                if (record.employeeCode && record.employeeName && record.employeeName.length > 1) {
                    records.push(record);
                }
            } catch (err) {
                console.error(`Block ${idx} parse error:`, err.message);
            }
        });
    }
    return records;
}

/** Returns the value on the line immediately before the given exact label */
function getValBefore(lines, label) {
    const idx = lines.findIndex(l => l === label);
    return (idx > 0) ? pc(lines[idx - 1]) : 0;
}

function parseCurrency(val) {
    if (!val) return 0;
    return parseFloat(String(val).replace(/,/g, '').trim()) || 0;
}

function pc(line) {
    if (!line) return 0;
    const m = String(line).trim().match(/^-?[\d,.]+(\.\d+)?/);
    return m ? parseCurrency(m[0]) : 0;
}
