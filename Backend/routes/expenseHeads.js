const express = require('express');
const router = express.Router();
const {
    getExpenseHeads,
    getExpenseHead,
    createExpenseHead,
    updateExpenseHead,
    deleteExpenseHead,
    getHeadsHierarchy,
    seedDefaultHeads
} = require('../controllers/expenseHeadController');
const { protect } = require('../middleware/auth');

// Static routes first
router.route('/hierarchy').get(protect, getHeadsHierarchy);
router.route('/seed').post(protect, seedDefaultHeads);

// Main CRUD routes
router
    .route('/')
    .get(protect, getExpenseHeads)
    .post(protect, createExpenseHead);

router
    .route('/:id')
    .get(protect, getExpenseHead)
    .put(protect, updateExpenseHead)
    .delete(protect, deleteExpenseHead);

module.exports = router;
