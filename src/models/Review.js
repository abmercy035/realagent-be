/**
 * models/Review.js
 *
 * Reviews/comments on Campus Market listings.
 * Migrated from frontend: app/modules/market/review.model.ts
 *
 * Design notes:
 * - One review per user per listing — enforced by a compound unique index.
 * - Rating is 1-5 stars, stored as a number for easy aggregation.
 * - Author name/avatar are populated at read time from the User collection.
 */

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    marketListingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MarketItem',
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 1000,
    },
  },
  { timestamps: true },
);

// One review per user per listing — prevents double-reviewing.
reviewSchema.index({ marketListingId: 1, authorId: 1 }, { unique: true });

// "All reviews for a listing, newest first" is the primary read pattern.
reviewSchema.index({ marketListingId: 1, createdAt: -1 });

// "My reviews" — for a user's own dashboard.
reviewSchema.index({ authorId: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
