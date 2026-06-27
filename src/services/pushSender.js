/**
 * services/pushSender.js
 *
 * Sends Web Push notifications to all subscribed devices for a user.
 * Migrated from frontend: app/modules/notifications/pushSender.ts
 */

const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:no-reply@campusagent.app';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[pushSender] VAPID keys not configured — push notifications disabled.');
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

/**
 * Sends a push notification to ALL subscribed devices for a user.
 * Individual delivery failures (expired endpoints, etc.) are caught
 * per-device so one bad subscription doesn't block the rest.
 */
async function sendNotificationPush({ userId, type, payload }) {
  if (!ensureVapid()) return;

  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (subscriptions.length === 0) return;

  const messagePayload = JSON.stringify({
    title: getNotificationTitle(type, payload),
    body: getNotificationBody(type, payload),
    data: { type, ...payload },
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        messagePayload,
      ).catch(async (err) => {
        // If the endpoint is gone (410 Gone / 404), clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        }
        throw err;
      }),
    ),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[pushSender] ${failed}/${subscriptions.length} push deliveries failed for user ${userId}`);
  }
}

function getNotificationTitle(type, payload) {
  switch (type) {
    case 'visitation_requested': return 'New Visitation Request';
    case 'visitation_confirmed': return 'Visitation Confirmed';
    case 'visitation_declined': return 'Visitation Declined';
    case 'agent_verification_approved': return 'Verification Approved';
    case 'agent_verification_rejected': return 'Verification Update';
    default: return 'CampusAgent';
  }
}

function getNotificationBody(type, payload) {
  const propertyTitle = String(payload.propertyTitle ?? 'a property');
  switch (type) {
    case 'visitation_requested': return `Someone wants to view "${propertyTitle}".`;
    case 'visitation_confirmed': return `Your visitation for "${propertyTitle}" is confirmed.`;
    case 'visitation_declined': return `Your visitation request for "${propertyTitle}" was declined.`;
    case 'agent_verification_approved': return 'Your agent verification has been approved!';
    case 'agent_verification_rejected': return 'Your verification application needs attention.';
    default: return 'You have a new notification.';
  }
}

module.exports = { sendNotificationPush };
