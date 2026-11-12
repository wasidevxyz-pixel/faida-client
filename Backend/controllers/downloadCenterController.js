const asyncHandler = require('../middleware/async');
const DownloadCenterFile = require('../models/DownloadCenterFile');
const Notification = require('../models/Notification');
const User = require('../models/User');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '../uploads/download-center');
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.rtf', '.ppt', '.pptx'];
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.sh', '.cmd', '.msi', '.com', '.vbs', '.js', '.py', '.ps1', '.jar'];

const getNextCleanupTime = () => {
    const cleanupService = require('../services/downloadCenterCleanupService');
    return cleanupService.getNextCleanupTime();
};

// Ensure upload directory exists
const ensureUploadDir = async () => {
    try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
    } catch (err) {
        // Directory already exists or other non-fatal error
    }
};

/**
 * Helper: Validate file before upload
 */
const validateFile = (file) => {
    const errors = [];
    const ext = path.extname(file.name).toLowerCase();

    if (file.size > MAX_FILE_SIZE) {
        errors.push(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 30MB limit`);
    }

    if (BLOCKED_EXTENSIONS.includes(ext)) {
        errors.push(`File type "${ext}" is not allowed for security reasons`);
    }

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        errors.push(`File type "${ext}" is not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
    }

    return errors;
};

/**
 * Send notifications to targeted branch users or all active users
 */
const sendNotifications = async (fileDoc, uploadedByUser) => {
    try {
        const uploaderId = uploadedByUser?._id || uploadedByUser;
        const uploaderName = uploadedByUser?.name || 'Boss / Admin';

        let recipientQuery = {
            isActive: { $ne: false }
        };

        const targetBranches = Array.isArray(fileDoc.targetBranches)
            ? fileDoc.targetBranches.filter(Boolean).map(b => b.trim())
            : (fileDoc.targetBranches ? [String(fileDoc.targetBranches).trim()] : []);

        if (targetBranches.length > 0) {
            // Target users belonging to any of the target branches, OR administrators
            recipientQuery.$or = [
                { branch: { $in: targetBranches } },
                { role: { $in: ['admin', 'administrator', 'superadmin'] } }
            ];
        }

        const targetUsers = await User.find(recipientQuery).select('_id name branch email role').lean();
        if (!targetUsers || targetUsers.length === 0) return;

        const branchLabel = targetBranches.length > 0
            ? targetBranches.join(', ')
            : 'All Branches';

        const notifications = targetUsers.map(u => ({
            recipient: u._id,
            type: 'download_center',
            title: `New Document from Boss side (${branchLabel})`,
            message: `${uploaderName} sent "${fileDoc.title}" to ${branchLabel}`,
            link: '/download-center',
            relatedFile: fileDoc._id,
            createdBy: uploaderId
        }));

        await Notification.insertMany(notifications, { ordered: false });
    } catch (error) {
        console.warn('[DOWNLOAD-CENTER] Notification send error:', error.message);
    }
};

// @desc    Get all files in download center
// @route   GET /api/v1/download-center
// @access  Private
exports.getFiles = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    let query = { isActive: true, expiresAt: { $gt: new Date() } };

    const userBranches = Array.isArray(req.user.branch)
        ? req.user.branch.filter(Boolean).map(b => b.trim())
        : (req.user.branch ? [String(req.user.branch).trim()] : []);

    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin';

    // Strict branch filter:
    // Non-admin can only see files targeting their branch, files shared with all branches, or their own files
    if (!isAdmin) {
        query.$or = [
            { targetBranches: { $exists: true, $size: 0 } }, // Files shared with all branches
            { targetBranches: { $in: userBranches } },       // Files targeting user's branch
            { uploadedBy: req.user._id }                     // User's own files
        ];
    } else {
        // Admin: can see all, or filter by specific branch if query provided
        if (req.query.branch && req.query.branch !== 'all') {
            query.$or = [
                { targetBranches: { $in: [req.query.branch] } },
                { branch: req.query.branch }
            ];
        }
    }

    // Search filter
    if (req.query.search) {
        const searchRegex = { $regex: req.query.search, $options: 'i' };
        query.$and = query.$and || [];
        query.$and.push({
            $or: [
                { title: searchRegex },
                { originalFilename: searchRegex },
                { description: searchRegex },
                { sourceReport: searchRegex }
            ]
        });
    }

    // Category filter
    if (req.query.category && req.query.category !== 'all') {
        query.category = req.query.category;
    }

    const total = await DownloadCenterFile.countDocuments(query);
    const files = await DownloadCenterFile.find(query)
        .populate('uploadedBy', 'name email branch')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    // Get next cleanup time
    const cleanupService = require('../services/downloadCenterCleanupService');
    const nextCleanup = cleanupService.getNextCleanupTime();

    res.status(200).json({
        success: true,
        count: files.length,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        nextCleanup: nextCleanup.toISOString(),
        data: files
    });
});

// @desc    Get single file details
// @route   GET /api/v1/download-center/:id
// @access  Private
exports.getFile = asyncHandler(async (req, res) => {
    const file = await DownloadCenterFile.findById(req.params.id)
        .populate('uploadedBy', 'name email branch');

    if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (!file.isActive || file.expiresAt <= new Date()) {
        return res.status(410).json({ success: false, message: 'This file has expired and been removed' });
    }

    // Branch authorization check for non-admin users
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin';
    if (!isAdmin) {
        const userBranches = Array.isArray(req.user.branch)
            ? req.user.branch.filter(Boolean).map(b => b.trim())
            : (req.user.branch ? [String(req.user.branch).trim()] : []);
        const uploaderId = file.uploadedBy && (file.uploadedBy._id || file.uploadedBy).toString();
        const isUploader = uploaderId === req.user._id.toString();
        const isPublic = !file.targetBranches || file.targetBranches.length === 0;
        const isTargeted = file.targetBranches && file.targetBranches.some(b => userBranches.includes(b));

        if (!isUploader && !isPublic && !isTargeted) {
            return res.status(403).json({ success: false, message: 'You do not have permission to view documents for this branch' });
        }
    }

    res.status(200).json({ success: true, data: file });
});

// @desc    Download a file
// @route   GET /api/v1/download-center/:id/download
// @access  Private
exports.downloadFile = asyncHandler(async (req, res) => {
    const file = await DownloadCenterFile.findById(req.params.id);

    if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (!file.isActive || file.expiresAt <= new Date()) {
        return res.status(410).json({ success: false, message: 'This file has expired and been removed' });
    }

    // Branch authorization check for non-admin users
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin';
    if (!isAdmin) {
        const userBranches = Array.isArray(req.user.branch)
            ? req.user.branch.filter(Boolean).map(b => b.trim())
            : (req.user.branch ? [String(req.user.branch).trim()] : []);
        const uploaderId = file.uploadedBy && file.uploadedBy.toString();
        const isUploader = uploaderId === req.user._id.toString();
        const isPublic = !file.targetBranches || file.targetBranches.length === 0;
        const isTargeted = file.targetBranches && file.targetBranches.some(b => userBranches.includes(b));

        if (!isUploader && !isPublic && !isTargeted) {
            return res.status(403).json({ success: false, message: 'You do not have permission to download documents for this branch' });
        }
    }

    // Check file exists on disk
    try {
        await fs.access(file.filePath);
    } catch {
        return res.status(404).json({ success: false, message: 'File no longer exists on server' });
    }

    // Increment download count
    file.downloadCount = (file.downloadCount || 0) + 1;
    await file.save();

    // Stream the file
    res.download(file.filePath, file.originalFilename);
});

// @desc    Upload a file to download center
// @route   POST /api/v1/download-center/upload
// @access  Private
exports.uploadFile = asyncHandler(async (req, res) => {
    if (!req.files) {
        return res.status(400).json({ success: false, message: 'Please upload at least one file' });
    }

    // Collect all uploaded files (handles req.files.files, req.files.file, or individual file fields)
    let filesToProcess = [];
    if (req.files.files) {
        filesToProcess = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
    } else if (req.files.file) {
        filesToProcess = Array.isArray(req.files.file) ? req.files.file : [req.files.file];
    } else {
        for (const key of Object.keys(req.files)) {
            const item = req.files[key];
            if (Array.isArray(item)) filesToProcess.push(...item);
            else filesToProcess.push(item);
        }
    }

    if (filesToProcess.length === 0) {
        return res.status(400).json({ success: false, message: 'Please upload at least one file' });
    }

    // Validate each file
    const allErrors = [];
    filesToProcess.forEach(f => {
        const errs = validateFile(f);
        if (errs.length > 0) {
            allErrors.push(`${f.name}: ${errs.join(', ')}`);
        }
    });

    if (allErrors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed for some files',
            errors: allErrors
        });
    }

    // Ensure upload directory exists
    await ensureUploadDir();

    // Parse target branches
    let targetBranches = [];
    if (req.body.targetBranches) {
        try {
            targetBranches = typeof req.body.targetBranches === 'string'
                ? JSON.parse(req.body.targetBranches)
                : req.body.targetBranches;
        } catch {
            targetBranches = [req.body.targetBranches];
        }
    }
    if (!Array.isArray(targetBranches)) targetBranches = [targetBranches];
    targetBranches = targetBranches.filter(Boolean).map(b => String(b).trim());

    const createdDocs = [];
    const baseTitle = (req.body.title || '').trim();

    for (let i = 0; i < filesToProcess.length; i++) {
        const uploadedFile = filesToProcess[i];
        const ext = path.extname(uploadedFile.name).toLowerCase();
        const uniqueId = crypto.randomBytes(16).toString('hex');
        const storedFilename = `dc-${Date.now()}-${uniqueId}${ext}`;
        const filePath = path.join(UPLOAD_DIR, storedFilename);

        // Move file to upload directory
        await uploadedFile.mv(filePath);

        // Format document title
        let fileTitle = uploadedFile.name.replace(ext, '');
        if (baseTitle) {
            if (filesToProcess.length === 1) {
                fileTitle = baseTitle;
            } else {
                fileTitle = `${baseTitle} - ${uploadedFile.name.replace(ext, '')}`;
            }
        }

        const fileDoc = await DownloadCenterFile.create({
            title: fileTitle,
            description: req.body.description || '',
            originalFilename: uploadedFile.name,
            storedFilename,
            filePath,
            fileSize: uploadedFile.size,
            fileExtension: ext,
            mimeType: uploadedFile.mimetype,
            uploadedBy: req.user._id,
            branch: req.user.branch && req.user.branch.length > 0 ? req.user.branch[0] : '',
            targetBranches,
            isAutoSent: false,
            sourceReport: req.body.sourceReport || '',
            expiresAt: getNextCleanupTime()
        });

        await fileDoc.populate('uploadedBy', 'name email branch');

        // Send notification for each uploaded document to target branches
        await sendNotifications(fileDoc, req.user);

        createdDocs.push(fileDoc);
    }

    res.status(201).json({
        success: true,
        message: `${createdDocs.length} file(s) uploaded successfully`,
        data: createdDocs.length === 1 ? createdDocs[0] : createdDocs
    });
});

// @desc    Send a report to download center (from report pages)
// @route   POST /api/v1/download-center/send-report
// @access  Private
exports.sendReport = asyncHandler(async (req, res) => {
    if (!req.files || !req.files.file) {
        return res.status(400).json({ success: false, message: 'Please provide a report file' });
    }

    const uploadedFile = req.files.file;

    // Validate file
    const validationErrors = validateFile(uploadedFile);
    if (validationErrors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'File validation failed',
            errors: validationErrors
        });
    }

    // Ensure upload directory exists
    await ensureUploadDir();

    // Generate unique filename
    const ext = path.extname(uploadedFile.name).toLowerCase() || '.pdf';
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const storedFilename = `rpt-${Date.now()}-${uniqueId}${ext}`;
    const filePath = path.join(UPLOAD_DIR, storedFilename);

    // Move file to upload directory
    await uploadedFile.mv(filePath);

    // Parse target branches
    let targetBranches = [];
    if (req.body.targetBranches) {
        try {
            targetBranches = typeof req.body.targetBranches === 'string'
                ? JSON.parse(req.body.targetBranches)
                : req.body.targetBranches;
        } catch {
            targetBranches = [req.body.targetBranches];
        }
    }

    // Create DB record
    const fileDoc = await DownloadCenterFile.create({
        title: req.body.title || req.body.reportName || 'Report',
        description: req.body.description || `Auto-sent from ${req.body.reportName || 'report page'}`,
        originalFilename: uploadedFile.name || `${req.body.reportName || 'report'}${ext}`,
        storedFilename,
        filePath,
        fileSize: uploadedFile.size,
        fileExtension: ext,
        mimeType: uploadedFile.mimetype || 'application/pdf',
        uploadedBy: req.user._id,
        branch: req.user.branch && req.user.branch.length > 0 ? req.user.branch[0] : '',
        targetBranches,
        isAutoSent: true,
        sourceReport: req.body.reportName || '',
        expiresAt: getNextCleanupTime()
    });

    // Send notifications to branch recipients
    await sendNotifications(fileDoc, req.user);

    res.status(201).json({
        success: true,
        message: 'Report sent to Download Center',
        data: { _id: fileDoc._id, title: fileDoc.title }
    });
});

// @desc    Update file metadata
// @route   PUT /api/v1/download-center/:id
// @access  Private (uploader or admin only)
exports.updateFile = asyncHandler(async (req, res) => {
    let file = await DownloadCenterFile.findById(req.params.id);

    if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Only the uploader or admin can update
    if (file.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized to update this file' });
    }

    // Only allow updating title, description, targetBranches
    const updateFields = {};
    if (req.body.title) {
        updateFields.title = req.body.title.trim();
        const ext = file.fileExtension || '.pdf';
        const safeBase = req.body.title.trim().replace(/[^a-zA-Z0-9_\-\.\s]/g, '_');
        updateFields.originalFilename = safeBase.toLowerCase().endsWith(ext.toLowerCase()) ? safeBase : `${safeBase}${ext}`;
    }
    if (req.body.description !== undefined) updateFields.description = req.body.description;
    if (req.body.targetBranches) {
        try {
            updateFields.targetBranches = typeof req.body.targetBranches === 'string'
                ? JSON.parse(req.body.targetBranches)
                : req.body.targetBranches;
        } catch {
            updateFields.targetBranches = [req.body.targetBranches];
        }
    }

    file = await DownloadCenterFile.findByIdAndUpdate(req.params.id, updateFields, {
        new: true,
        runValidators: true
    }).populate('uploadedBy', 'name email branch');

    res.status(200).json({ success: true, data: file });
});

// @desc    Delete a file (soft-delete)
// @route   DELETE /api/v1/download-center/:id
// @access  Private (uploader or admin only)
exports.deleteFile = asyncHandler(async (req, res) => {
    const file = await DownloadCenterFile.findById(req.params.id);

    if (!file) {
        return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Only the uploader or admin can delete
    if (file.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized to delete this file' });
    }

    // Delete physical file from disk
    try {
        await fs.unlink(file.filePath);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn('[DOWNLOAD-CENTER] File delete warning:', err.message);
        }
    }

    // Hard delete from DB (no point soft-deleting temp files)
    await DownloadCenterFile.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'File deleted successfully' });
});

// @desc    Get download center stats
// @route   GET /api/v1/download-center/stats
// @access  Private
exports.getStats = asyncHandler(async (req, res) => {
    const now = new Date();
    const activeQuery = { isActive: true, expiresAt: { $gt: now } };

    const [totalFiles, totalSizeResult, recentCount] = await Promise.all([
        DownloadCenterFile.countDocuments(activeQuery),
        DownloadCenterFile.aggregate([
            { $match: activeQuery },
            { $group: { _id: null, totalSize: { $sum: '$fileSize' } } }
        ]),
        DownloadCenterFile.countDocuments({
            ...activeQuery,
            createdAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) } // Last 1 hour
        })
    ]);

    const cleanupService = require('../services/downloadCenterCleanupService');
    const nextCleanup = cleanupService.getNextCleanupTime();

    res.status(200).json({
        success: true,
        data: {
            totalFiles,
            totalSize: totalSizeResult.length > 0 ? totalSizeResult[0].totalSize : 0,
            recentUploads: recentCount,
            nextCleanup: nextCleanup.toISOString()
        }
    });
});

// @desc    Generate vector PDF report and optionally save to download center
// @route   POST /api/v1/download-center/generate
// @access  Private
exports.generateReport = asyncHandler(async (req, res) => {
    const reportPdfService = require('../services/reportPdfService');
    const {
        reportType,
        filters = {},
        payrollIds = [],
        title,
        description,
        targetBranches = [],
        saveToDownloadCenter = true,
        tableData = null
    } = req.body;

    let pdfBytes;
    let resolvedTitle = title || 'ERP Report';
    let sourceReport = reportType || 'custom';

    if (reportType === 'payroll') {
        const ids = Array.isArray(payrollIds) && payrollIds.length > 0 
            ? payrollIds 
            : (filters.payrollIds || []);
        if (ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Please select at least one payroll record.' });
        }
        resolvedTitle = title || `Employee Payroll Slips (${ids.length})`;
        sourceReport = 'payroll';
        pdfBytes = await reportPdfService.generatePayrollSlipsPdf(ids);
    } else if (reportType === 'stock') {
        resolvedTitle = title || 'Warehouse Stock Position';
        sourceReport = 'stock_report';
        pdfBytes = await reportPdfService.generateStockReportPdf(filters, req.user);
    } else if (reportType === 'sales') {
        resolvedTitle = title || 'Sales Summary Report';
        sourceReport = 'sales_report';
        pdfBytes = await reportPdfService.generateSalesReportPdf(filters, req.user);
    } else if (reportType === 'custom_table' && tableData) {
        resolvedTitle = title || tableData.title || 'Report';
        sourceReport = tableData.sourceReport || 'custom_table';
        pdfBytes = await reportPdfService.buildVectorTablePdf({
            title: resolvedTitle,
            subtitle: tableData.subtitle || '',
            branch: tableData.branch || (req.user.branch && req.user.branch[0]) || '',
            dateRange: tableData.dateRange || '',
            generatedBy: req.user.name || '',
            metricCards: tableData.metricCards || [],
            columns: tableData.columns || [],
            rows: tableData.rows || [],
            summaryRow: tableData.summaryRow || null,
            orientation: tableData.orientation || 'portrait'
        });
    } else {
        return res.status(400).json({ success: false, message: `Unsupported or incomplete reportType: "${reportType}"` });
    }

    const safeFilename = `${resolvedTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    if (String(saveToDownloadCenter) === 'false') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        return res.send(Buffer.from(pdfBytes));
    }

    // Save directly to Download Center
    await ensureUploadDir();
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const storedFilename = `rpt-${Date.now()}-${uniqueId}.pdf`;
    const filePath = path.join(UPLOAD_DIR, storedFilename);

    await fs.writeFile(filePath, Buffer.from(pdfBytes));

    let branches = [];
    if (targetBranches) {
        try {
            branches = typeof targetBranches === 'string' ? JSON.parse(targetBranches) : targetBranches;
        } catch {
            branches = [targetBranches];
        }
    }

    const fileDoc = await DownloadCenterFile.create({
        title: resolvedTitle,
        description: description || `Generated vector report for ${resolvedTitle}`,
        originalFilename: safeFilename,
        storedFilename,
        filePath,
        fileSize: pdfBytes.length,
        fileExtension: '.pdf',
        mimeType: 'application/pdf',
        uploadedBy: req.user._id,
        branch: req.user.branch && req.user.branch.length > 0 ? req.user.branch[0] : '',
        targetBranches: branches,
        isAutoSent: true,
        sourceReport,
        expiresAt: getNextCleanupTime()
    });

    await fileDoc.populate('uploadedBy', 'name email branch');

    // Send notifications to branch recipients
    await sendNotifications(fileDoc, req.user);

    res.status(201).json({
        success: true,
        message: 'Vector report generated and saved to Download Center',
        data: fileDoc
    });
});

// @desc    Send the exact rendered original slip HTML from the browser to Download Center as a vector PDF
// @route   POST /api/v1/download-center/send-rendered-slip
// @access  Private
exports.sendRenderedSlip = asyncHandler(async (req, res) => {
    const { htmlContent, title, description, targetBranches = [], downloadDirect = false } = req.body;
    if (!htmlContent) {
        return res.status(400).json({ success: false, message: 'No slip HTML content provided' });
    }

    const reportPdfService = require('../services/reportPdfService');
    const pdfBytes = await reportPdfService.renderHtmlToPdf(htmlContent);

    const resolvedTitle = title || 'Salary Slip';
    const safeFilename = `${resolvedTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    if (downloadDirect) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        return res.send(Buffer.from(pdfBytes));
    }

    await ensureUploadDir();
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const storedFilename = `slip-${Date.now()}-${uniqueId}.pdf`;
    const filePath = path.join(UPLOAD_DIR, storedFilename);

    await fs.writeFile(filePath, Buffer.from(pdfBytes));

    let branches = [];
    if (targetBranches) {
        try {
            branches = typeof targetBranches === 'string' ? JSON.parse(targetBranches) : targetBranches;
        } catch {
            branches = [targetBranches];
        }
    }
    if (!Array.isArray(branches)) branches = [branches];

    const fileDoc = await DownloadCenterFile.create({
        title: resolvedTitle,
        description: description || `Original Salary Slip for ${resolvedTitle}`,
        originalFilename: safeFilename,
        storedFilename,
        filePath,
        fileSize: pdfBytes.length,
        fileExtension: '.pdf',
        mimeType: 'application/pdf',
        uploadedBy: req.user._id,
        branch: req.user.branch && req.user.branch.length > 0 ? req.user.branch[0] : '',
        targetBranches: branches,
        isAutoSent: true,
        sourceReport: 'payroll',
        expiresAt: getNextCleanupTime()
    });

    await fileDoc.populate('uploadedBy', 'name email branch');

    // Send notifications to branch recipients
    await sendNotifications(fileDoc, req.user);

    res.status(201).json({
        success: true,
        message: 'Original salary slip sent directly to Download Center',
        data: fileDoc
    });
});

// @desc    Send any original rendered report HTML directly from the browser to Download Center
// @route   POST /api/v1/download-center/send-rendered-report
// @access  Private
exports.sendRenderedReport = asyncHandler(async (req, res) => {
    const { htmlContent, title, description, orientation = 'portrait', targetBranches = [], sourceReport = 'report', downloadDirect = false } = req.body;
    if (!htmlContent) {
        return res.status(400).json({ success: false, message: 'No report HTML content provided' });
    }

    const reportPdfService = require('../services/reportPdfService');
    const pdfBytes = await reportPdfService.renderCustomHtmlToPdf(htmlContent, {
        orientation,
        title: title || 'Report'
    });

    const resolvedTitle = title || 'Report';
    const safeFilename = `${resolvedTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    if (downloadDirect) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        return res.send(Buffer.from(pdfBytes));
    }

    await ensureUploadDir();
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const storedFilename = `rpt-${Date.now()}-${uniqueId}.pdf`;
    const filePath = path.join(UPLOAD_DIR, storedFilename);

    await fs.writeFile(filePath, Buffer.from(pdfBytes));

    let branches = [];
    if (targetBranches) {
        try {
            branches = typeof targetBranches === 'string' ? JSON.parse(targetBranches) : targetBranches;
        } catch {
            branches = [targetBranches];
        }
    }
    if (!Array.isArray(branches)) branches = [branches];

    const fileDoc = await DownloadCenterFile.create({
        title: resolvedTitle,
        description: description || `Original rendered report for ${resolvedTitle}`,
        originalFilename: safeFilename,
        storedFilename,
        filePath,
        fileSize: pdfBytes.length,
        fileExtension: '.pdf',
        mimeType: 'application/pdf',
        uploadedBy: req.user._id,
        branch: req.user.branch && req.user.branch.length > 0 ? req.user.branch[0] : '',
        targetBranches: branches,
        isAutoSent: true,
        sourceReport,
        expiresAt: getNextCleanupTime()
    });

    await fileDoc.populate('uploadedBy', 'name email branch');

    // Send notifications to branch recipients
    await sendNotifications(fileDoc, req.user);

    res.status(201).json({
        success: true,
        message: 'Original report sent directly to Download Center',
        data: fileDoc
    });
});



