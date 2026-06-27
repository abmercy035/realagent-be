/**
 * routes/cron.js
 *
 * Cron job routes — invoked by external scheduler (Vercel Cron, Render Cron, etc.)
 * Secured by CRON_SECRET Bearer token.
 *
 * Migrated from:
 *   app/api/cron/process-notifications/route.ts
 *   app/api/cron/trial-expiry/route.ts
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { claimNextPendingJob, markJobSent, markJobFailed } = require('../services/notificationJob.service');
const { sendNotificationEmail } = require('../services/emailSender');
const { sendNotificationPush } = require('../services/pushSender');

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_JOBS_PER_RUN = 25;

// ---------------------------------------------------------------------------
// Auth guard for all cron routes
// ---------------------------------------------------------------------------
function requireCronSecret(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// POST /api/cron/process-notifications
// ---------------------------------------------------------------------------
async function processOneJob() {
  const job = await claimNextPendingJob();
  if (!job) return 'empty';

  const payload = (job.payload && typeof job.payload === 'object') ? job.payload : {};
  const recipientUserId = String(payload.recipientUserId ?? '');
  const errors = [];

  const recipient = recipientUserId
    ? await User.findById(recipientUserId).select('email').lean()
    : null;

  for (const channel of job.channels) {
    if (channel === 'in_app') {
      continue;
    }

    if (channel === 'email') {
      if (!recipient?.email) {
        errors.push('No recipient email found.');
        continue;
      }
      try {
        const result = await sendNotificationEmail({
          recipientEmail: recipient.email,
          type: job.type,
          payload,
        });
        if (!result.sent && result.reason) {
          console.log(`Email skipped for job ${job._id}: ${result.reason}`);
        }
      } catch (error) {
        errors.push(`Email send failed: ${error.message}`);
      }
    }

    if (channel === 'push') {
      if (!recipientUserId) {
        errors.push('No recipient userId for push.');
        continue;
      }
      try {
        await sendNotificationPush({ userId: recipientUserId, type: job.type, payload });
      } catch (error) {
        errors.push(`Push send failed: ${error.message}`);
      }
    }
  }

  if (errors.length > 0) {
    await markJobFailed(job._id.toString(), errors.join(' | '));
  } else {
    await markJobSent(job._id.toString());
  }

  return 'processed';
}

router.all('/process-notifications', requireCronSecret, async (req, res) => {
  try {
    let processedCount = 0;
    for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
      const result = await processOneJob();
      if (result === 'empty') break;
      processedCount += 1;
    }
    res.status(200).json({ success: true, message: 'Notification queue processed.', data: { processedCount } });
  } catch (error) {
    console.error('Cron process-notifications error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/cron/trial-expiry
// ---------------------------------------------------------------------------
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

router.all('/trial-expiry', requireCronSecret, async (req, res) => {
  try {
    const now = new Date();
    let movedToGracePeriod = 0;
    let listingsDeletedForAgents = 0;

    // Stage 1: trialing -> in_grace_period
    const trialsToExpire = await User.find({
      'agentProfile.subscription.status': 'trialing',
      'agentProfile.subscription.trialEndsAt': { $lte: now },
    })
      .select('agentProfile.subscription.trialEndsAt')
      .lean();

    for (const user of trialsToExpire) {
      const trialEndsAt = user.agentProfile?.subscription?.trialEndsAt;
      if (!trialEndsAt) continue;
      const gracePeriodEndsAt = new Date(new Date(trialEndsAt).getTime() + GRACE_PERIOD_MS);

      await User.updateOne(
        { _id: user._id, 'agentProfile.subscription.status': 'trialing' },
        {
          $set: {
            'agentProfile.subscription.status': 'in_grace_period',
            'agentProfile.subscription.gracePeriodEndsAt': gracePeriodEndsAt,
          },
        },
      );
      movedToGracePeriod += 1;
    }

    // Stage 2: in_grace_period -> listings deleted
    const graceExpired = await User.find({
      'agentProfile.subscription.status': 'in_grace_period',
      'agentProfile.subscription.gracePeriodEndsAt': { $lte: now },
    })
      .select('_id')
      .lean();

    const Property = require('../models/Property');
    for (const user of graceExpired) {
      await Property.updateMany(
        { agentId: user._id, status: { $ne: 'deleted' } },
        { $set: { status: 'deleted' } },
      );
      await User.updateOne(
        { _id: user._id },
        { $set: { 'agentProfile.subscription.status': 'expired' } },
      );
      listingsDeletedForAgents += 1;
    }

    res.status(200).json({
      success: true,
      message: 'Trial expiry sweep complete.',
      data: { movedToGracePeriod, listingsDeletedForAgents },
    });
  } catch (error) {
    console.error('Cron trial-expiry error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
