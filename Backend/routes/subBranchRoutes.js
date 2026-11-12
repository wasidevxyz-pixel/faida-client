const express = require('express');
const router = express.Router();
const {
    getSubBranches,
    createSubBranch,
    updateSubBranch,
    deleteSubBranch
} = require('../controllers/subBranchController');
const { protect } = require('../middleware/auth');
const stableCache = require('../middleware/stableCache');

router.use(protect);

router.route('/')
    .get(stableCache, getSubBranches)
    .post(createSubBranch);

router.route('/:id')
    .put(updateSubBranch)
    .delete(deleteSubBranch);

module.exports = router;
