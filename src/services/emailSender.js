/**
 * services/emailSender.js
 *
 * Per-event-type email templates for notification delivery.
 * Migrated from frontend: app/modules/notifications/emailSender.ts
 *
 * SMTP transporter is created once per process (not per-send).
 */

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || process.env.EMAIL_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;
const SMTP_FROM_ADDRESS = process.env.SMTP_FROM_ADDRESS || process.env.EMAIL_FROM || 'no-reply@campusagent.app';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables must all be set.');
    }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Builds the subject/body for a given event type from its payload.
 * Payload fields are read defensively since the payload is stored as
 * Mongoose Mixed type and isn't strictly typed.
 */
function buildEmailContent(type, payload) {
  const propertyTitle = String(payload.propertyTitle ?? 'a property');
  const slotStartsAt = payload.slotStartsAt ? new Date(payload.slotStartsAt) : null;
  const slotTimeText = slotStartsAt
    ? slotStartsAt.toLocaleString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'the scheduled time';

  switch (type) {
    case 'visitation_requested':
      return {
        subject: `New visitation request — ${propertyTitle}`,
        text: `A tenant has requested a visitation for "${propertyTitle}" on ${slotTimeText}. Log in to your CampusAgent dashboard to confirm or decline.`,
      };
    case 'visitation_confirmed':
      return {
        subject: `Visitation confirmed — ${propertyTitle}`,
        text: `Your visitation for "${propertyTitle}" is confirmed for ${slotTimeText}. The agent has been notified.`,
      };
    case 'visitation_declined': {
      const reason = payload.declineReason ? ` Reason given: ${String(payload.declineReason)}` : '';
      return {
        subject: `Visitation declined — ${propertyTitle}`,
        text: `Your visitation request for "${propertyTitle}" (${slotTimeText}) was declined.${reason}`,
      };
    }
    case 'agent_verification_approved':
      return {
        subject: 'Your agent verification was approved',
        text: 'Congratulations — your CampusAgent verification has been approved. Your listings now show a verified badge to tenants.',
      };
    case 'agent_verification_rejected': {
      const reason = payload.rejectionReason ? String(payload.rejectionReason) : 'No reason was provided.';
      return {
        subject: 'Your agent verification application',
        text: `Your CampusAgent verification application was not approved. Reason: ${reason}`,
      };
    }
    default:
      return null;
  }
}

async function sendNotificationEmail({ recipientEmail, type, payload }) {
  const content = buildEmailContent(type, payload);
  if (!content) {
    return { sent: false, reason: `No email template for event type "${type}".` };
  }

  await getTransporter().sendMail({
    from: `"CampusAgent" <${SMTP_FROM_ADDRESS}>`,
    to: recipientEmail,
    subject: content.subject,
    text: content.text,
  });

  return { sent: true };
}

module.exports = { sendNotificationEmail };
