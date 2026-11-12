const express = require('express');
const router = express.Router();
const {
  getPurchaseReturns,
  getPurchaseReturn,
  createPurchaseReturn,
  updatePurchaseReturn,
  deletePurchaseReturn
} = require('../controllers/purchaseReturnController');
const { protect, adminAccess, managerAccess } = require('../middleware/auth');

router
  .route('/')
  .get(protect, managerAccess, getPurchaseReturns)
  .post(protect, managerAccess, createPurchaseReturn);

router
  .route('/:id')
  .get(protect, managerAccess, getPurchaseReturn)
  .put(protect, adminAccess, updatePurchaseReturn)
  .delete(protect, adminAccess, deletePurchaseReturn);

module.exports = router;
