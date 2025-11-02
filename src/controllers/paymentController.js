const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
const Payment = require('../models/Payment');

const PAYSTACK_INIT_URL = 'https://api.paystack.co/transaction/initialize';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';

/**
 * Create a payment intent (provider-agnostic stub)
 * If STRIPE_SECRET is provided and stripe package installed, this can be extended to call Stripe.
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { amount = 0, currency = 'ngn', email, metadata = {}, callback_url } = req.body || {};

    // Paystack expects amount in kobo (NGN) -> multiply by 100
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid amount' });
    }

    if (!email && !metadata?.email) {
      return res.status(400).json({ status: 'error', message: 'Customer email is required for Paystack' });
    }

    const amountKobo = Math.round(amt * 100);

    const payload = {
      email: email || metadata.email,
      amount: amountKobo,
      metadata: metadata || {},
    };

    if (callback_url) payload.callback_url = callback_url;

    if (!PAYSTACK_SECRET) return res.status(500).json({ status: 'error', message: 'Paystack is not configured on server' });

    const resp = await axios.post(PAYSTACK_INIT_URL, payload, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    });
    if (resp.data && resp.data.status) {
      // return Paystack response (authorization_url, reference, access_code)
      return res.json({ status: 'success', data: resp.data.data });
    }

    return res.status(502).json({ status: 'error', message: 'Failed to initialize Paystack transaction' });
  } catch (error) {
    console.error('createPaymentIntent (Paystack) error:', error?.response?.data || error.message || error);
    return res.status(500).json({ status: 'error', message: 'Failed to create payment intent' });
  }
};

// Check payment by provider reference or local id
exports.checkPayment = async (req, res) => {
  try {
    const reference = req.query.reference || req.query.ref || req.query.id;
    if (!reference) return res.status(400).json({ status: 'error', message: 'reference query parameter required' });

    // Try to find by providerReference
    let payment = await Payment.findOne({ providerReference: reference }).lean();
    if (!payment) {
      // Try by _id (ObjectId)
      if (/^[0-9a-fA-F]{24}$/.test(reference)) {
        payment = await Payment.findById(reference).lean();
      }
    }
    if (!payment) {
      // Try by metadata.localPaymentId
      payment = await Payment.findOne({ 'metadata.localPaymentId': reference }).lean();
    }

    if (!payment) return res.status(404).json({ status: 'error', message: 'Payment not found' });

    // Optionally include user subscription state
    let userSubscription = null;
    try {
      if (payment.user) {
        const u = await User.findById(payment.user).lean();
        if (u) userSubscription = u.subscription || null;
      } else if (payment.metadata && payment.metadata.userId) {
        const u = await User.findById(payment.metadata.userId).lean();
        if (u) userSubscription = u.subscription || null;
      }
    } catch (e) {
      console.warn('checkPayment user lookup failed', e && e.message ? e.message : e);
    }

    return res.json({ status: 'success', data: { payment, userSubscription } });
  } catch (err) {
    console.error('checkPayment error', err && err.message ? err.message : err);
    return res.status(500).json({ status: 'error', message: 'Failed to check payment' });
  }
}

/**
 * Generic webhook endpoint for payment provider callbacks
 * Note: verify signatures for production (stripe webhook signing)
 */
exports.webhook = async (req, res) => {
  try {
    // Paystack sends raw body and signs it with HMAC-SHA512 using secret key
    const signature = req.headers['x-paystack-signature'];
    const raw = req.body; // express.raw middleware used in route

    if (!PAYSTACK_SECRET) {
      console.warn('Paystack secret not configured, rejecting webhook');
      return res.status(500).json({ status: 'error', message: 'Paystack not configured' });
    }

    const expected = crypto.createHmac('sha512', PAYSTACK_SECRET).update(raw).digest('hex');
				
    if (signature !== expected) {
      console.warn('Invalid Paystack signature');
      return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    }

    const body = JSON.parse(raw.toString());
    console.log('Paystack webhook event:', body.event);

    // Handle successful charge events
    if (body.event === 'charge.success' && body.data && body.data.status === 'success') {
      const metadata = body.data.metadata || {};
      const reference = body.data.reference;
      const customerEmail = body.data.customer?.email || metadata.email;

      // If metadata contains userId, update that user's subscription
      if (metadata.userId) {
        try {
          const user = await User.findById(metadata.userId);
          if (user) {
            const now = new Date();
            const plan = metadata.plan || user.subscription?.plan || 'basic';
            user.subscription = user.subscription || {};
            user.subscription.plan = plan;
            user.subscription.status = 'active';
            user.subscription.provider = 'paystack';
            user.subscription.subscriptionId = reference;
            user.subscription.startedAt = user.subscription.startedAt || now;

            // Prefer explicit period end from metadata, otherwise grant 30 days
            if (metadata.currentPeriodEnd) {
              user.subscription.currentPeriodEnd = new Date(metadata.currentPeriodEnd);
            } else {
              user.subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            }

            await user.save();
            console.log(`Updated subscription for user ${user._id} via Paystack webhook`);
          }
        } catch (uErr) {
          console.error('Error updating user subscription from Paystack webhook:', uErr);
        }
      } else if (customerEmail) {
        // Fallback: find user by email
        try {
          const user = await User.findOne({ email: customerEmail });
          if (user) {
            const now = new Date();
            const plan = (body.data.metadata && body.data.metadata.plan) || user.subscription?.plan || 'basic';
            user.subscription = user.subscription || {};
            user.subscription.plan = plan;
            user.subscription.status = 'active';
            user.subscription.provider = 'paystack';
            user.subscription.subscriptionId = reference;
            user.subscription.startedAt = user.subscription.startedAt || now;
            user.subscription.currentPeriodEnd = body.data.metadata?.currentPeriodEnd ? new Date(body.data.metadata.currentPeriodEnd) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await user.save();
            console.log(`Updated subscription for user ${user._id} via Paystack webhook (email match)`);
          }
        } catch (uErr) {
          console.error('Error updating user subscription (email) from Paystack webhook:', uErr);
        }
      }
    }

    // Acknowledge
    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Paystack webhook processing error:', error);
    return res.status(500).json({ status: 'error' });
  }
};
