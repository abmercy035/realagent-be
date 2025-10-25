// Prefer existing Courier-based email utils
const emailUtils = require('./email');

async function sendEmail({ to, subject, text, html, from }) {
	try {
		// For now use the existing Courier helper. Use 'contactConfirmation' as a basic template.
		if (emailUtils && typeof emailUtils.sendMail === 'function') {
			await emailUtils.sendMail(to, { subject, text, html }, 'contactConfirmation');
			return;
		}

		console.info('[notifications] No email util available; skipping email to', to);
	} catch (err) {
		console.error('[notifications] Error sending email (courier):', err);
		// Keep notifications best-effort
	}
}

module.exports = {
	sendEmail,
};
