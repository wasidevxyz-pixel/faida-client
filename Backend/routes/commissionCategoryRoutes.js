const express = require('express');
const { getCategories, createCategory, updateCategory, deleteCategory } = require('../controllers/commissionCategoryController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getCategories)
    .post(createCategory);

router.route('/:id')
    .put(updateCategory)
    .delete(deleteCategory);

module.exports = router;
