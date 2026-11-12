const express = require('express');
const router = express.Router();
const {
    getSubClasses,
    getSubClass,
    createSubClass,
    updateSubClass,
    deleteSubClass
} = require('../controllers/subclassController');
const { protect, authorize } = require('../middleware/auth');

router
    .route('/')
    .get(protect, getSubClasses)
    .post(protect, authorize('admin', 'manager'), createSubClass);

router
    .route('/:id')
    .get(protect, getSubClass)
    .put(protect, authorize('admin', 'manager'), updateSubClass)
    .delete(protect, authorize('admin', 'manager'), deleteSubClass);

module.exports = router;
