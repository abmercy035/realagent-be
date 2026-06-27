/**
 * routes/cloudinarySignature.js
 *
 * POST /api/uploads/cloudinary-signature — generates a signed-upload
 * signature for direct browser-to-Cloudinary uploads.
 *
 * Migrated from: app/api/uploads/cloudinary-signature/route.ts
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authNew } = require('../middleware/auth');
const { rateLimit } = require('express-rate-limit');

const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

const ALLOWED_UPLOAD_CONTEXTS = ['market-listings', 'property-listings', 'agent-verification'];

const signatureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// ---------------------------------------------------------------------------
// POST /api/uploads/cloudinary-signature
// ---------------------------------------------------------------------------
router.post('/cloudinary-signature', signatureLimiter, authNew, async (req, res) => {
  try {
    if (!CLOUDINARY_API_SECRET || !CLOUDINARY_API_KEY || !CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ success: false, message: 'Upload service not configured.' });
    }

    const { context } = req.body;

    if (!context || !ALLOWED_UPLOAD_CONTEXTS.includes(context)) {
      return res.status(400).json({ success: false, message: 'Invalid upload context.' });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `${context}/${req.user._id}`;

    // Cloudinary's signature algorithm: sort params alphabetically,
    // join as "key=value" pairs with "&", append API secret, SHA-1 hash.
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign + CLOUDINARY_API_SECRET)
      .digest('hex');

    res.status(200).json({
      success: true,
      message: 'Signature generated.',
      data: {
        signature,
        timestamp,
        apiKey: CLOUDINARY_API_KEY,
        cloudName: CLOUDINARY_CLOUD_NAME,
        folder,
      },
    });
  } catch (error) {
    console.error('Cloudinary signature error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate signature.' });
  }
});

module.exports = router;
