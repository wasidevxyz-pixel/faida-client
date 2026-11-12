const express = require('express');
const router = express.Router();
const {
  getParties,
  getParty,
  createParty,
  updateParty,
  deleteParty,
  getPartiesByType,
  getPartiesWithOutstandingBalance
} = require('../controllers/partyController');
const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Party = require('../models/Party');

// Re-route into other resource routers
// router.use('/:partyId/transactions', transactionRoutes);

router
  .route('/')
  .get(advancedResults(Party), getParties)
  .post(protect, authorize('admin', 'manager'), createParty);

router
  .route('/:id')
  .get(getParty)
  .put(protect, authorize('admin', 'manager'), updateParty)
  .delete(protect, authorize('admin', 'manager'), deleteParty);

router
  .route('/type/:type')
  .get(protect, getPartiesByType);

router
  .route('/outstanding/balance')
  .get(protect, getPartiesWithOutstandingBalance);

module.exports = router;
