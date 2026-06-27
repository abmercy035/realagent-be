/**
 * models/PushSubscription.js
 *
 * Stores browser Push API subscriptions (endpoint + encryption keys).
 * Migrated from frontend: app/modules/notifications/pushSubscription.model.ts
 *
 * One document per subscribed device/browser — a user can have several
 * (phone + laptop), so this is its own collection referencing userId.
 */

const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
      unique: true,
    },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
