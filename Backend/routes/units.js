const express = require('express');
const router = express.Router();
const {
  getUnits,
  getActiveUnits,
  getUnit,
  createUnit,
  updateUnit,
  deleteUnit,
  toggleUnitStatus,
  getUnitConversion
} = require('../controllers/unitController');
const { protect, adminAccess, managerAccess } = require('../middleware/auth');

router
  .route('/')
  .get(protect, getUnits)
  .post(protect, managerAccess, createUnit);

router
  .route('/active')
  .get(protect, getActiveUnits);

router
  .route('/:id')
  .get(protect, getUnit)
  .put(protect, managerAccess, updateUnit)
  .delete(protect, adminAccess, deleteUnit);

router
  .route('/:id/toggle-status')
  .patch(protect, managerAccess, toggleUnitStatus);

router
  .route('/:id/conversion')
  .get(protect, getUnitConversion);

module.exports = router;
