const express = require('express');
const router = express.Router();
const {
    getCommissionBranches,
    createCommissionBranch,
    updateCommissionBranch,
    deleteCommissionBranch
} = require('../controllers/commissionBranchController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
    .get(getCommissionBranches)
    .post(createCommissionBranch);

router.route('/:id')
    .put(updateCommissionBranch)
    .delete(deleteCommissionBranch);

module.exports = router;
