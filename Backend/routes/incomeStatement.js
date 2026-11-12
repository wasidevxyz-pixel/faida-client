const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const incomeStatementController = require('../controllers/incomeStatementController');

// @route   GET /api/v1/income-statement
// @desc    Get Income Statement Report
// @access  Private
router.get('/', protect, incomeStatementController.getIncomeStatement);

router.post('/save', protect, incomeStatementController.saveIncomeStatement);
router.get('/saved', protect, incomeStatementController.getSavedReports);
router.delete('/saved/:id', protect, incomeStatementController.deleteSavedReport);

module.exports = router;
