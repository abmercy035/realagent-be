const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    amount: { type: Number, required: true }, // stored in smallest currency unit (kobo)
    currency: { type: String, default: 'ngn' },
    provider: { type: String },
    providerReference: { type: String, index: true },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    type: {
      type: String,
      enum: ['subscription', 'agent_service', 'one_time_fee', 'other'],
      default: 'other',
    },
    metadata: { type: Object },
    providerData: { type: Object },
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
