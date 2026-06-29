/**
 * routes/marketReviews.js
 *
 * GET  /api/market/:id/reviews — list reviews for a market listing (public)
 * POST /api/market/:id/reviews — create a review (authenticated)
 *
 * Migrated from: app/api/market/[id]/reviews/route.ts
 */

const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access :id from parent
const Review = require('../models/Review');
const MarketItem = require('../models/MarketItem');
const User = require('../models/User');
const { authNew, authNewOptional } = require('../middleware/auth');
const { rateLimit } = require('express-rate-limit');

const reviewCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// ---------------------------------------------------------------------------
// GET /api/market/:id/reviews — list reviews for a listing (public)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const skip = (page - 1) * limit;

    const listing = await MarketItem.findOne({ _id: id, status: 'active' }).select('_id').lean();
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }

    const mongoose = require('mongoose');
    const [reviews, total, stats] = await Promise.all([
      Review.find({ marketListingId: id })
        .populate('authorId', 'fullName avatarUrl name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments({ marketListingId: id }),
      Review.aggregate([
        { $match: { marketListingId: new mongoose.Types.ObjectId(id) } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ])
    ]);

    const averageRating = stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;
    const pages = Math.ceil(total / limit) || 1;

    const flattened = reviews.map((r) => {
      const author = r.authorId || {};
      return {
        _id: r._id,
        rating: r.rating,
        message: r.message,
        createdAt: r.createdAt,
        author: {
          fullName: author.fullName || author.name || 'Anonymous',
          avatarUrl: author.avatarUrl || author.avatar || null,
        },
      };
    });

    res.status(200).json({
      success: true,
      message: 'Reviews fetched.',
      data: {
        reviews: flattened,
        total,
        averageRating,
        pagination: { page, limit, total, pages }
      },
    });
  } catch (error) {
    console.error('Get market reviews error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/market/:id/reviews — create a review (authenticated)
// ---------------------------------------------------------------------------
router.post('/', reviewCreateLimiter, authNew, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, message } = req.body;

    // Validate input
    if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5.' });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 2 || message.trim().length > 1000) {
      return res.status(400).json({ success: false, message: 'Message must be between 2 and 1000 characters.' });
    }

    const listing = await MarketItem.findOne({ _id: id, status: 'active' }).select('_id sellerId').lean();
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }

    // Prevent reviewing your own listing
    if (listing.sellerId && listing.sellerId.toString() === req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You cannot review your own listing.' });
    }

    try {
      const review = await Review.create({
        marketListingId: id,
        authorId: req.user._id,
        rating,
        message: message.trim(),
      });

      const populated = await Review.findById(review._id)
        .populate('authorId', 'fullName avatarUrl name avatar')
        .lean();

      const author = populated.authorId || {};

      res.status(201).json({
        success: true,
        message: 'Review created.',
        data: {
          review: {
            _id: populated._id,
            rating: populated.rating,
            message: populated.message,
            createdAt: populated.createdAt,
            author: {
              fullName: author.fullName || author.name || 'Anonymous',
              avatarUrl: author.avatarUrl || author.avatar || null,
            },
          },
        },
      });
    } catch (err) {
      // Duplicate key error — user already reviewed this listing
      if (err.code === 11000) {
        return res.status(409).json({ success: false, message: 'You have already reviewed this listing.' });
      }
      throw err;
    }
  } catch (error) {
    console.error('Create market review error:', error);
    res.status(500).json({ success: false, message: 'Failed to create review.' });
  }
});

module.exports = router;
