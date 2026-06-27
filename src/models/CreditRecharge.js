/**
 * models/CreditRecharge.js
 *
 * Tracks every credit recharge attempt, regardless of outcome.
 * Migrated from frontend: app/modules/market/creditRecharge.model.ts
 *
 * Purpose:
 *   1. Idempotency — Paystack may retry webhook delivery; must not credit twice.
 *   2. Rate-locking — the credits-per-Naira rate is locked in at initiation time.
 */

const mongoose = require('mongoose');

const creditRechargeSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    paystackReference: {
      type: String,
      required: true,
      unique: true,
    },
    amountNgn: {
      type: Number,
      required: true,
      min: 1,
    },
    tierAtInitiation: {
      type: String,
      enum: ['free', 'paid_basic'],
      required: true,
    },
    creditsToGrant: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
      required: true,
      index: true,
    },
    webhookReceivedAt: {
      type: Date,
    },
    failureReason: {
      type: String,
    },
  },
  { timestamps: true },
);

creditRechargeSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model('CreditRecharge', creditRechargeSchema);
