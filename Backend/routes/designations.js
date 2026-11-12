const express = require('express');
const {
    getDesignations,
    getDesignation,
    createDesignation,
    updateDesignation,
    deleteDesignation
} = require('../controllers/designationController');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const stableCache = require('../middleware/stableCache');

router.route('/')
    .get(protect, stableCache, getDesignations)
    .post(protect, authorize('admin', 'manager', 'employee_registration', 'employees'), createDesignation);

router.route('/:id')
    .get(protect, stableCache, getDesignation)
    .put(protect, authorize('admin', 'manager', 'employee_registration', 'employees'), updateDesignation)
    .delete(protect, authorize('admin'), deleteDesignation);

module.exports = router;
