const express = require('express');
const router = express.Router();
const {
  getDayBook,
  getDayBookSummary,
  exportDayBook
} = require('../controllers/dayBookController');
const { protect, accountsAccess } = require('../middleware/auth');

router
  .route('/')
  .get(protect, accountsAccess, getDayBook);

router
  .route('/summary')
  .get(protect, accountsAccess, getDayBookSummary);

router
  .route('/export')
  .get(protect, accountsAccess, exportDayBook);

module.exports = router;
