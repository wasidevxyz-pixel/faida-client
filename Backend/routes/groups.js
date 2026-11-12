const express = require('express');
const {
    getGroups,
    getGroup,
    createGroup,
    updateGroup,
    deleteGroup
} = require('../controllers/groupController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin', 'groups')); // Allow admin role OR anyone with 'groups' permission

router
    .route('/')
    .get(getGroups)
    .post(createGroup);

router
    .route('/:id')
    .get(getGroup)
    .put(updateGroup)
    .delete(deleteGroup);

module.exports = router;
