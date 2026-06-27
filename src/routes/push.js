/**
 * routes/push.js
 *
 * POST /api/push/subscribe — persist a Web Push subscription.
 * Migrated from: app/api/push/susbcribe/route.ts
 */

const express = require('express');
const router = express.Router();
const PushSubscription = require('../models/PushSubscription');
const { authNew } = require('../middleware/auth');
const { rateLimit } = require('express-rate-limit');

const pushSubscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// ---------------------------------------------------------------------------
// POST /api/push/subscribe
// ---------------------------------------------------------------------------
router.post('/subscribe', pushSubscribeLimiter, authNew, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid subscription payload.' });
    }
    if (!keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ success: false, message: 'Invalid subscription payload.' });
    }

    // Upsert by endpoint — same device re-subscribing updates existing record.
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId: req.user._id, endpoint, keys },
      { upsert: true },
    );

    res.status(201).json({ success: true, message: 'Push subscription saved.' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ success: false, message: 'Failed to save subscription.' });
  }
});

module.exports = router;
