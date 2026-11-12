const express = require('express');
const router = express.Router();
const {
    getLegacyPayrolls,
    uploadLegacyPDF,
    processLegacyPDF,
    getEmployeeHistory,
    getSuggestions,
    deleteLegacyRecord,
    getSinglePagePDF,
    getSlipByRecord,
    processLegacyExcel
} = require('../controllers/legacyPayrollController');
const { protect } = require('../middleware/auth');

router.use(protect);

// 5-minute timeout specifically for the heavy PDF/Excel processing route
const heavyTimeout = (req, res, next) => {
    res.setTimeout(5 * 60 * 1000, () => {
        if (!res.headersSent) {
            res.status(504).json({ success: false, message: 'Processing timed out (>5 min). Try again or check server logs.' });
        }
    });
    next();
};

router.get('/',                  getLegacyPayrolls);
router.get('/suggestions',       getSuggestions);
router.get('/view-slip',         getSlipByRecord);   // branch-safe: lookup by code+monthYear
router.post('/upload',           uploadLegacyPDF);
router.post('/process',          heavyTimeout, processLegacyPDF);
router.post('/process-excel',    heavyTimeout, processLegacyExcel);
router.get('/history/:code',     getEmployeeHistory);
router.get('/view-page/:page',    getSinglePagePDF);
router.delete('/:id',            deleteLegacyRecord);

module.exports = router;
