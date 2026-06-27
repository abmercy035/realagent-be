/**
 * services/paystackRecharge.service.js
 *
 * Wraps Paystack's Initialize Transaction endpoint for market credit recharge.
 * Migrated from frontend: app/modules/market/paystackRecharge.service.ts
 */

const { randomUUID } = require('crypto');
const CreditRecharge = require('../models/CreditRecharge');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Recharge rate: how many credits each pack buys, per tier.
// Matches frontend shared/constants.ts MARKET_RECHARGE_RATE_NGN_TO_CREDITS
const RECHARGE_RATE = {
  free: { ngn: 200, credits: 100 },
  paid_basic: { ngn: 100, credits: 150 },
};

/**
 * Converts a Naira recharge amount into the number of credits it buys,
 * based on the seller's CURRENT tier at the moment of purchase.
 * Fixed-pack-size only: amount must be a multiple of the pack price.
 */
function calculateCreditsForRecharge(amountNgn, tier) {
  const rate = RECHARGE_RATE[tier];
  if (!rate) throw new Error(`Unknown seller tier: ${tier}`);
  if (amountNgn <= 0 || amountNgn % rate.ngn !== 0) {
    throw new Error(`Recharge amount must be a positive multiple of ₦${rate.ngn} for tier "${tier}" (got ₦${amountNgn}).`);
  }
  const packs = amountNgn / rate.ngn;
  return packs * rate.credits;
}

async function initiateRecharge({ userId, userEmail, amountNgn, sellerTier }) {
  const reference = `recharge_${randomUUID()}`;
  const creditsToGrant = calculateCreditsForRecharge(amountNgn, sellerTier);

  // Create the pending record BEFORE calling Paystack — if the Paystack call
  // fails, we have an orphaned 'pending' row, which is harmless.
  await CreditRecharge.create({
    sellerId: userId,
    paystackReference: reference,
    amountNgn,
    creditsToGrant,
    tierAtInitiation: sellerTier,
    status: 'pending',
  });

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: userEmail,
      amount: Math.round(amountNgn * 100), // Paystack expects kobo
      reference,
      metadata: { userId, purpose: 'market_credit_recharge' },
    }),
  });

  const result = await response.json();

  if (!result.status || !result.data) {
    await CreditRecharge.updateOne(
      { paystackReference: reference },
      { $set: { status: 'failed', failureReason: result.message } },
    );
    throw new Error(`Paystack initialization failed: ${result.message}`);
  }

  return { authorizationUrl: result.data.authorization_url, reference };
}

module.exports = { initiateRecharge, calculateCreditsForRecharge, RECHARGE_RATE };
