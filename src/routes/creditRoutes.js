/**
	* Credit Routes
	* Routes for credit management, purchases, and transactions
	*/

const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');
const { auth } = require('../middleware/auth');

// Public routes
router.get('/packages', creditController.getPackages);
router.get('/costs', creditController.getCosts);

// Protected routes (require authentication)
router.use(auth);

router.get('/balance', creditController.getBalance);
router.get('/transactions', creditController.getTransactions);
router.post('/purchase/initialize', creditController.initializePurchase);
router.post('/purchase/verify', creditController.verifyPurchase);

module.exports = router;
