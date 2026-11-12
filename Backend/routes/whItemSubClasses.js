const express = require('express');
const router = express.Router();
const {
    getSubClasses,
    createSubClass,
    updateSubClass,
    deleteSubClass
} = require('../controllers/whItemSubClassController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getSubClasses)
    .post(createSubClass);

router.route('/:id')
    .put(updateSubClass)
    .delete(deleteSubClass);

module.exports = router;
