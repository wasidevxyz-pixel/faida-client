const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    getPendingCheques,
    addPendingCheque,
    updatePendingCheque,
    deletePendingCheque
} = require('../controllers/pendingChequeController');

router.route('/')
    .get(protect, getPendingCheques)
    .post(protect, addPendingCheque);

router.route('/:id')
    .put(protect, updatePendingCheque)
    .delete(protect, deletePendingCheque);

module.exports = router;
