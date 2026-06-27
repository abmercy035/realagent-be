/**
 * services/notificationJob.service.js
 *
 * Implements the atomic "claim a job" pattern. Prevents two overlapping cron
 * invocations from sending the same email/push twice.
 *
 * Migrated from frontend: app/modules/notifications/notificationJob.service.ts
 */

const NotificationJob = require('../models/NotificationJob');

const MAX_ATTEMPTS = 5;
/** If a job has been "processing" longer than this, assume the invocation that
 *  claimed it crashed/timed out, and make it eligible to be re-claimed. */
const STUCK_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Atomically claims ONE due job, flipping it from pending -> processing.
 * Uses findOneAndUpdate (a single atomic MongoDB operation) so concurrent
 * cron invocations cannot both claim the same document.
 */
async function claimNextPendingJob() {
  const now = new Date();
  const stuckCutoff = new Date(now.getTime() - STUCK_JOB_TIMEOUT_MS);

  const job = await NotificationJob.findOneAndUpdate(
    {
      scheduledFor: { $lte: now },
      $or: [
        { status: 'pending' },
        // Reclaim jobs stuck in "processing" past the timeout.
        { status: 'processing', processingStartedAt: { $lte: stuckCutoff } },
      ],
      attempts: { $lt: MAX_ATTEMPTS },
    },
    {
      $set: { status: 'processing', processingStartedAt: now },
      $inc: { attempts: 1 },
    },
    { sort: { scheduledFor: 1 }, returnDocument: 'after' },
  );

  return job;
}

async function markJobSent(jobId) {
  await NotificationJob.updateOne(
    { _id: jobId },
    { $set: { status: 'sent', sentAt: new Date() } },
  );
}

async function markJobFailed(jobId, error) {
  await NotificationJob.updateOne(
    { _id: jobId },
    { $set: { status: 'failed', lastError: error } },
  );
}

/**
 * Enqueues a job. Route handlers call this and return immediately — actual
 * sending happens later, out of the request-response cycle.
 */
async function enqueueNotification(input) {
  return NotificationJob.create({
    type: input.type,
    channels: input.channels,
    payload: input.payload,
    scheduledFor: input.scheduledFor || new Date(),
    status: 'pending',
  });
}

module.exports = {
  claimNextPendingJob,
  markJobSent,
  markJobFailed,
  enqueueNotification,
};
