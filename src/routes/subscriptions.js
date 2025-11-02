const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { auth } = require('../middleware/auth');

// Get current user's subscription
router.get('/', auth, subscriptionController.getSubscription);

// Create or update subscription (called after payment/checkout)
router.post('/subscribe', auth, subscriptionController.subscribe);

// Cancel subscription (immediate or at period end)
router.post('/cancel', auth, subscriptionController.cancel);

module.exports = router;
