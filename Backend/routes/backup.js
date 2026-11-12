const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportBackup, importBackup } = require('../controllers/backupController');

router.use(protect);
router.use(authorize('admin'));

router.get('/export', exportBackup);
router.post('/import', importBackup);

module.exports = router;
