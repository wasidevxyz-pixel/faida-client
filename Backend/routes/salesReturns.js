const express = require('express');
const router = express.Router();
const {
  getSalesReturns,
  getSalesReturn,
  createSalesReturn,
  updateSalesReturn,
  deleteSalesReturn
} = require('../controllers/salesReturnController');
const { protect, salesAccess, adminAccess, managerAccess } = require('../middleware/auth');

router
  .route('/')
  .get(protect, salesAccess, getSalesReturns)
  .post(protect, salesAccess, createSalesReturn);

router
  .route('/:id')
  .get(protect, salesAccess, getSalesReturn)
  .put(protect, managerAccess, updateSalesReturn)
  .delete(protect, adminAccess, deleteSalesReturn);

module.exports = router;
