/**
 * models/NotificationJob.js
 *
 * This collection IS the notification queue. A cron job polls
 * WHERE status = 'pending' AND scheduledFor <= now, claims jobs atomically
 * via findOneAndUpdate (pending -> processing), then dispatches to the
 * right channel handler.
 *
 * Migrated from frontend: app/modules/notifications/notificationJob.model.ts
 */

const mongoose = require('mongoose');

const notificationJobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'visitation_requested',
        'visitation_confirmed',
        'visitation_declined',
        'trial_ending',
        'trial_listings_deleted',
        'payment_success',
        'payment_failure',
        'plan_expiring',
        'agent_verification_approved',
        'agent_verification_rejected',
        'market_listing_message',
      ],
      required: true,
      index: true,
    },
    channels: {
      type: [String],
      enum: ['in_app', 'email', 'push'],
      required: true,
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'A notification job must target at least one channel.',
      },
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    scheduledFor: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed'],
      default: 'pending',
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastError: {
      type: String,
    },
    processingStartedAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// THE critical index — the cron route queries by (status, scheduledFor).
notificationJobSchema.index({ status: 1, scheduledFor: 1 });

// Debug: "did this user get notified?"
notificationJobSchema.index({ 'payload.recipientUserId': 1, createdAt: -1 });

module.exports = mongoose.model('NotificationJob', notificationJobSchema);
