const express = require('express');
const router = express.Router();
const { getSalaryDetailReport } = require('../controllers/employeeSalaryDetailController');

router.get('/report', getSalaryDetailReport);

module.exports = router;
