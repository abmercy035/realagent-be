/**
 * routes/webhooks.js
 *
 * Paystack webhook handlers for:
 *   1. Credit recharge (charge.success → credits wallet)
 *   2. Property subscription (charge.success / invoice.payment_failed / subscription.disable)
 *
 * Migrated from:
 *   app/api/webhooks/paystack/credit-recharge/route.ts
 *   app/api/webhooks/paystack/property-subscription/route.ts
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const CreditRecharge = require('../models/CreditRecharge');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!PAYSTACK_SECRET_KEY) {
  console.warn('[webhooks] PAYSTACK_SECRET_KEY not set — Paystack webhooks will fail signature verification.');
}

// ---------------------------------------------------------------------------
// Paystack HMAC-SHA512 signature verification
// ---------------------------------------------------------------------------
function verifyPaystackSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !PAYSTACK_SECRET_KEY) return false;
  const computedHash = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison
  const computedBuffer = Buffer.from(computedHash, 'utf-8');
  const receivedBuffer = Buffer.from(signatureHeader, 'utf-8');
  if (computedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(computedBuffer, receivedBuffer);
}

// ---------------------------------------------------------------------------
// CRITICAL: Raw body is captured at the app level (see src/app.js).
// express.raw() middleware runs BEFORE express.json() for /api/webhooks/*,
// storing the raw body in req.rawBody. The signature verification below
// uses req.rawBody directly — no route-level capture needed.
// ---------------------------------------------------------------------------

// ===========================================================================
// POST /api/webhooks/paystack/credit-recharge
// ===========================================================================
router.post('/paystack/credit-recharge', async (req, res) => {
  try {
    const signatureHeader = req.headers['x-paystack-signature'];

    if (!verifyPaystackSignature(req.rawBody, signatureHeader)) {
      return res.status(401).json({ success: false, message: 'Invalid signature.' });
    }

    const event = req.body;

    // Only handle charge.success for credit recharges
    if (event.event !== 'charge.success') {
      return res.status(200).json({ success: true, message: 'Event acknowledged, no action taken.' });
    }

    const recharge = await CreditRecharge.findOne({ paystackReference: event.data.reference });
    if (!recharge) {
      console.error(`Paystack webhook: unknown reference ${event.data.reference}`);
      return res.status(200).json({ success: true, message: 'Acknowledged.' });
    }

    // IDEMPOTENCY: atomically transition pending -> success
    const claimed = await CreditRecharge.findOneAndUpdate(
      { _id: recharge._id, status: 'pending' },
      { $set: { status: 'success', webhookReceivedAt: new Date() } },
      { returnDocument: 'after' },
    );

    if (!claimed) {
      // Already processed — acknowledged without re-crediting
      return res.status(200).json({ success: true, message: 'Already processed.' });
    }

    // Sanity check: amount must match what we recorded at initiation
    if (event.data.amount !== claimed.amountNgn * 100) {
      await CreditRecharge.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', failureReason: 'Webhook amount did not match initiation amount.' } },
      );
      console.error(`Paystack webhook: amount mismatch for reference ${event.data.reference}`);
      return res.status(200).json({ success: true, message: 'Acknowledged.' });
    }

    // Credit the user's market wallet
    await User.updateOne(
      { _id: claimed.sellerId },
      { $inc: { marketCreditBalance: claimed.creditsToGrant } },
    );

    return res.status(200).json({ success: true, message: 'Credits granted.' });
  } catch (error) {
    console.error('Paystack credit-recharge webhook error:', error);
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ===========================================================================
// POST /api/webhooks/paystack/property-subscription
// ===========================================================================
router.post('/paystack/property-subscription', async (req, res) => {
  try {
    const signatureHeader = req.headers['x-paystack-signature'];

    if (!verifyPaystackSignature(req.rawBody, signatureHeader)) {
      return res.status(401).json({ success: false, message: 'Invalid signature.' });
    }

    const event = req.body;

    if (event.event === 'charge.success') {
      const ref = event.data.reference;
      // Find user by lastPaymentReference (set during subscription initiation)
      const user = await User.findOne({ 'agentProfile.subscription.lastPaymentReference': ref });
      if (!user) {
        console.error(`Paystack webhook: unknown subscription reference ${ref}`);
        return res.status(200).json({ success: true, message: 'Acknowledged.' });
      }

      // Idempotency: only process if reference hasn't changed
      if (user.agentProfile?.subscription?.lastPaymentReference !== ref) {
        return res.status(200).json({ success: true, message: 'Already processed.' });
      }

      const plan = user.agentProfile.subscription.plan || 'basic';
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await User.updateOne(
        { _id: user._id, 'agentProfile.subscription.lastPaymentReference': ref },
        {
          $set: {
            'agentProfile.subscription.status': 'active',
            'agentProfile.subscription.plan': plan,
            'agentProfile.subscription.currentPeriodStart': now,
            'agentProfile.subscription.currentPeriodEnd': periodEnd,
            'agentProfile.subscription.listingsUsedThisPeriod': 0,
            'agentProfile.subscription.paystackSubscriptionCode': event.data.subscription?.subscription_code,
            'agentProfile.subscription.paystackCustomerCode': event.data.customer?.customer_code,
          },
        },
      );

      return res.status(200).json({ success: true, message: 'Subscription activated.' });
    }

    if (event.event === 'invoice.payment_failed') {
      const subscriptionCode = event.data.subscription?.subscription_code;
      if (subscriptionCode) {
        await User.updateOne(
          { 'agentProfile.subscription.paystackSubscriptionCode': subscriptionCode },
          { $set: { 'agentProfile.subscription.status': 'payment_issue' } },
        );
      }
      return res.status(200).json({ success: true, message: 'Payment issue noted.' });
    }

    if (event.event === 'subscription.disable') {
      const subscriptionCode = event.data.subscription?.subscription_code;
      if (subscriptionCode) {
        await User.updateOne(
          { 'agentProfile.subscription.paystackSubscriptionCode': subscriptionCode },
          { $set: { 'agentProfile.subscription.status': 'canceled' } },
        );
      }
      return res.status(200).json({ success: true, message: 'Subscription canceled.' });
    }

    // Unknown event type — acknowledge without action
    return res.status(200).json({ success: true, message: 'Event acknowledged, no action taken.' });
  } catch (error) {
    console.error('Paystack property-subscription webhook error:', error);
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

module.exports = router;
