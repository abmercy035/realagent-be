/**
 * CreditTransaction Model
 * Tracks all credit purchases, deductions, and balance changes
 */

const mongoose = require('mongoose');

const creditTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['purchase', 'deduction', 'refund', 'bonus', 'initial'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    // For purchases
    package: {
      id: String,
      name: String,
      price: Number,
      currency: String,
    },
    // Payment details (for purchases)
    payment: {
      provider: String, // e.g., 'paystack', 'flutterwave', 'stripe'
      reference: String,
      status: String,
      paidAt: Date,
    },
    // For deductions
    relatedTo: {
      type: String,
      enum: ['property', 'item'],
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedTo',
    },
    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
creditTransactionSchema.index({ user: 1, createdAt: -1 });
creditTransactionSchema.index({ type: 1, createdAt: -1 });
creditTransactionSchema.index({ 'payment.reference': 1 }, { sparse: true });

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);
