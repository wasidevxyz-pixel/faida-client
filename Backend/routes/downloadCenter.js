const express = require('express');
const {
    getFiles,
    getFile,
    downloadFile,
    uploadFile,
    sendReport,
    generateReport,
    sendRenderedSlip,
    sendRenderedReport,
    updateFile,
    deleteFile,
    getStats
} = require('../controllers/downloadCenterController');

const router = express.Router({ mergeParams: true });

const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Read access is available to every authenticated user.
router.get('/stats', getStats);

// Vector PDF report generator (direct download or save to Download Center)
router.post('/generate', generateReport);

// Direct original rendered slip from browser
router.post('/send-rendered-slip', sendRenderedSlip);

// Direct original rendered report from any report page
router.post('/send-rendered-report', sendRenderedReport);

// Send report endpoint (from report pages)
router.post('/send-report', sendReport);

// Upload endpoint
router.post('/upload', authorize('admin', 'download_center'), uploadFile);

// List and CRUD
router
    .route('/')
    .get(getFiles);

router
    .route('/:id')
    .get(getFile)
    .put(authorize('admin', 'download_center'), updateFile)
    .delete(authorize('admin', 'download_center'), deleteFile);

// Download endpoint
router.get('/:id/download', downloadFile);

module.exports = router;
