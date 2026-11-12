const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    getPendingChequeDetails,
    savePendingChequeDetail,
    deletePendingChequeDetail
} = require('../controllers/pendingChequeDetailController');

router.route('/')
    .get(protect, getPendingChequeDetails)
    .post(protect, savePendingChequeDetail);

router.route('/:id')
    .delete(protect, deletePendingChequeDetail);

module.exports = router;
