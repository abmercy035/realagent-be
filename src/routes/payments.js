const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Public endpoint to create payment intent (client will then confirm)
router.post('/create-intent', paymentController.createPaymentIntent);

// Webhook endpoint for payment provider callbacks
router.post('/webhook', express.raw({ type: '*/*' }), paymentController.webhook);

// Debug/status endpoint (GET /api/payments/status)
// router.get('/status', paymentController.paystackStatus);

// Check payment by reference (GET /api/payments/check?reference=...)
router.get('/check', paymentController.checkPayment);

module.exports = router;
