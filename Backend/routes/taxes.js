const express = require('express');
const router = express.Router();
const {
  getTaxes,
  getActiveTaxes,
  getDefaultTax,
  getApplicableTaxes,
  getTax,
  createTax,
  updateTax,
  deleteTax,
  toggleTaxStatus,
  setDefaultTax,
  calculateTax
} = require('../controllers/taxController');
const { protect, adminAccess, managerAccess } = require('../middleware/auth');

router
  .route('/')
  .get(protect, getTaxes)
  .post(protect, managerAccess, createTax);

router
  .route('/active')
  .get(protect, getActiveTaxes);

router
  .route('/default')
  .get(protect, getDefaultTax);

router
  .route('/applicable')
  .get(protect, getApplicableTaxes);

router
  .route('/calculate')
  .post(protect, calculateTax);

router
  .route('/:id')
  .get(protect, getTax)
  .put(protect, managerAccess, updateTax)
  .delete(protect, adminAccess, deleteTax);

router
  .route('/:id/toggle-status')
  .patch(protect, managerAccess, toggleTaxStatus);

router
  .route('/:id/set-default')
  .patch(protect, managerAccess, setDefaultTax);

module.exports = router;
