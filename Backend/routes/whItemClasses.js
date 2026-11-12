const express = require('express');
const router = express.Router();
const {
    getClasses,
    createClass,
    updateClass,
    deleteClass
} = require('../controllers/whItemClassController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getClasses)
    .post(createClass);

router.route('/:id')
    .put(updateClass)
    .delete(deleteClass);

module.exports = router;
