/**
 * routes/creditRecharge.js
 *
 * Market credit recharge via Paystack — migrated from the Next.js frontend.
 *
 * Migrated from:
 *   app/api/market/credits/recharge/route.ts
 *   app/api/market/credits/recharge/status/route.ts
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const CreditRecharge = require('../models/CreditRecharge');
const { initiateRecharge, RECHARGE_RATE } = require('../services/paystackRecharge.service');
const { authNew } = require('../middleware/auth');
const { rateLimit } = require('express-rate-limit');

const rechargeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// ---------------------------------------------------------------------------
// POST /api/market/credits/recharge — initiate a Paystack credit pack purchase
// ---------------------------------------------------------------------------
router.post('/recharge', rechargeLimiter, authNew, async (req, res) => {
  try {
    const { amountNgn } = req.body;

    if (!amountNgn || typeof amountNgn !== 'number' || amountNgn <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid recharge amount.' });
    }

    const user = await User.findById(req.user._id).select('email marketSellerTier').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const tier = user.marketSellerTier || 'free';
    const rate = RECHARGE_RATE[tier];

    // Validate the amount is a multiple of the pack price for this tier
    if (amountNgn % rate.ngn !== 0) {
      return res.status(400).json({
        success: false,
        message: `Recharge amount must be a multiple of ₦${rate.ngn} for your tier.`,
      });
    }

    const result = await initiateRecharge({
      userId: req.user._id.toString(),
      userEmail: user.email,
      amountNgn,
      sellerTier: tier,
    });

    res.status(200).json({
      success: true,
      message: 'Recharge initiated. Redirect to Paystack to complete payment.',
      data: {
        authorizationUrl: result.authorizationUrl,
        reference: result.reference,
      },
    });
  } catch (error) {
    console.error('Credit recharge error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to initiate recharge.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/market/credits/recharge/status?reference=...
// ---------------------------------------------------------------------------
router.get('/recharge/status', authNew, async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'Reference is required.' });
    }

    const recharge = await CreditRecharge.findOne({
      paystackReference: reference,
      sellerId: req.user._id,
    }).select('status creditsToGrant amountNgn').lean();

    if (!recharge) {
      return res.status(404).json({ success: false, message: 'Recharge not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Recharge status fetched.',
      data: {
        status: recharge.status,
        creditsToGrant: recharge.creditsToGrant,
        amountNgn: recharge.amountNgn,
      },
    });
  } catch (error) {
    console.error('Recharge status error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recharge status.' });
  }
});

module.exports = router;
