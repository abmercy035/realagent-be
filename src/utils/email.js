/**
	* Email Service using Courier
	* Handles all email sending functionality
	*/

const { CourierClient } = require('@trycourier/courier');
require('dotenv').config();

const courier = new CourierClient({
	authorizationToken: process.env.COURIER_MAIL_TOKEN
});

/**
	* Email content templates
	*/
const mail_content_type = {
	welcome: {
		title: 'Welcome to RealAgent, {{name}}!',
		body: `Dear {{name}},

Welcome aboard! We are thrilled to have you join RealAgent.

We are excited to have you onboard and help you find the perfect property or connect with students looking for accommodation.

Best regards,
RealAgent Team
${process.env.FRONTEND_URL }`
	},

	verification: {
		title: 'Verify your email - RealAgent',
		body: `Hi {{name}},

Thank you for registering with RealAgent!

Please verify your email by clicking the link below:
{{verificationLink}}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

Best regards,
RealAgent Team`
	},

	otp: {
		title: 'RealAgent verification code for {{name}}',
		body: `Hi {{name}},

Please use the verification code below to sign in.

{{otp}}

This OTP will expire after 5 minutes.

If you didn't request this, you can ignore this email.

Best regards,
RealAgent Team`
	},

	reset: {
		title: 'Reset your password - RealAgent',
		body: `Hi {{email}},

There was a request to change your password!

Click the link below to reset your password:
{{resetLink}}

This link will expire in 1 hour.

If you did not make this request then please ignore this email.

Best regards,
RealAgent Team`
	},

	verificationApproved: {
		title: '🎉 Your agent verification has been approved!',
		body: `Hi {{name}},

🎊 Congratulations! Your agent verification has been approved.

✅ VERIFIED AGENT STATUS ACTIVATED

You now have access to all verified agent features:
✓ List unlimited properties
✓ Access premium tools and analytics
✓ Get the verified badge on your profile
✓ Connect with more clients

{{#if remarks}}
Admin Remarks: {{remarks}}
{{/if}}

Get started now: {{dashboardLink}}

Thank you for being part of RealAgent!

Best regards,
RealAgent Team`
	},

	verificationRejected: {
		title: '⚠️ Update required on your agent verification',
		body: `Hi {{name}},

Thank you for submitting your agent verification request. Unfortunately, we were unable to approve it at this time.

📋 REASON FOR REJECTION:
{{reason}}

⚠️ WHAT'S NEXT?
Don't worry! You can resubmit your verification with the necessary corrections.

To resubmit your verification:
1. Review the rejection reason carefully
2. Prepare the required documents
3. Submit a new verification request

Resubmit here: {{verificationLink}}

If you have any questions or need assistance, please contact our support team.

Best regards,
RealAgent Team`
	},

	verificationSubmitted: {
		title: '📋 Verification request received - Under review',
		body: `Hi {{name}},

✅ We have successfully received your agent verification request!

ℹ️ WHAT HAPPENS NEXT?
Our team will review your documents within 2-3 business days. You will receive an email notification once the review is complete.

📄 DOCUMENTS UNDER REVIEW:
✓ ID Document
✓ Proof of Address
✓ Business Registration (if applicable)

You can check the status of your verification anytime from your dashboard:
{{dashboardLink}}

Thank you for your patience!

Best regards,
RealAgent Team`
	},

	contactForm: {
		title: '📨 New Contact Form Submission - {{subject}}',
		body: `New contact form submission received:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CONTACT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name: {{name}}
Email: {{email}}
Subject: {{subject}}
Submitted: {{submittedAt}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 MESSAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{message}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reply to: {{email}}

RealAgent Admin Panel`
	},

	contactConfirmation: {
		title: 'We received your message - RealAgent',
		body: `Hi {{name}},

Thank you for contacting RealAgent!

✅ We have received your message and our team will review it shortly.

📧 WHAT'S NEXT?
We typically respond within 24-48 hours during business days. If your inquiry is urgent, please call us at +234 (702) 6889-068.

In the meantime, you might find these resources helpful:
• FAQ: ${process.env.FRONTEND_URL}/faq
• Help Center: ${process.env.FRONTEND_URL}/support

Thank you for your patience!

Best regards,
RealAgent Support Team`
	},

	// Viewing request notifications
	viewingRequestCreatedAgent: {
		title: 'Action Required: New Inspection Request for {{propertyTitle}}',
		body: `Dear {{recipientName}},

This notification confirms that a request for a property inspection has been submitted and is awaiting your review and approval.

### 🗓️ Request Summary

| Detail        | Information       |
| :-----| :-----|
| **Property**  | {{propertyTitle}} |
| **Requester** | {{requesterName}} |
| **Date**      | {{requestedDate}} |
| **Time**      | {{requestedTime}} |

**Requester's Note:**

> {{message}}

---

### 🔑 Manage Your Request

Please log in to your dashboard to review the details and take the necessary action (Approve, Decline, or Suggest New Time).

**Go to Dashboard:** {{dashboardLink}}

Your prompt attention to this request is appreciated.

Best regards,
RealAgent Team
`
	},
	// Viewing request notifications
	viewingRequestCreatedUser: {
		title: '✅ Your Inspection Request for {{propertyTitle}} Has Been Sent',
		body: `Subject: 

Hi {{requesterName}},

Thank you for requesting an inspection for the property: **{{propertyTitle}}**.

Your request has been successfully submitted and sent to the property manager for review.

### 🗓️ Requested Details

We have recorded your preferred inspection time as:

* **Date:** {{requestedDate}}
* **Time:** {{requestedTime}}

**Your Message:**
> {{message}}

---

### 🔑 What Happens Next?

The **RealAgent Team** will review this request and either **confirm** the appointment or **propose an alternative time**.

You will receive another email notification soon with an update.

In the meantime, you can track the status of your request on your dashboard:

**View Status:** {{dashboardLink}}

Best regards,
RealAgent Team
`
	},

	viewingRequestStatusUpdate: {
		title: 'Viewing request {{status}} - {{propertyTitle}}',
		body: `Hi {{recipientName}},

The viewing request for the property "{{propertyTitle}}" has been updated.

Status: {{status}}
Date: {{requestedDate}}
Time: {{requestedTime}}

You can view the request here: {{dashboardLink}}

Best regards,
RealAgent Team`
	},

	fraudReport: {
		title: '🚨 NEW FRAUD REPORT [{{severity}}] - {{fraudType}}',
		body: `⚠️ A new fraud report has been submitted and requires immediate attention.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 REPORT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Report ID: {{reportId}}
Fraud Type: {{fraudType}}
Severity: {{severity}}
Target User: {{targetUserEmail}}
Evidence Files: {{evidenceCount}}
Reported By: {{reporterEmail}}
Submitted: {{submittedAt}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 DESCRIPTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{description}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 REVIEW THIS REPORT:
{{reviewLink}}

⏰ ACTION REQUIRED:
Please review this report within 24 hours and take appropriate action.

RealAgent Admin System`
	},

// 	fraudReportConfirmation: {
// 		title: 'Fraud Report Received - RealAgent Security',
// 		body: `Thank you for reporting suspicious activity.

// ✅ YOUR REPORT HAS BEEN RECEIVED

// Report ID: {{reportId}}
// Type: {{fraudType}}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 📋 WHAT HAPPENS NEXT?
// • Our security team will review your report within 24 hours
// • We will investigate the matter thoroughly
// • If necessary, we will take action against the reported user
// • Your report helps keep RealAgent safe for everyone

// 🔍 CHECK REPORT STATUS:
// {{statusLink}}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ⚠️ IMPORTANT:
// All reports are confidential. We do not disclose reporter identities to the reported parties.

// If you have additional information to add to this report, please reply to this email with your Report ID.

// Thank you for helping us maintain a safe platform!

// Best regards,
// RealAgent Security Team`
// 	}
	fraudReportConfirmation: {
		title: 'Fraud Report Received - RealAgent Security',
		body: `Thank you for reporting suspicious activity.

✅ YOUR REPORT HAS BEEN RECEIVED

Report ID: {{reportId}}
Type: {{fraudType}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 WHAT HAPPENS NEXT?
• Our security team will review your report within 24 hours
• We will investigate the matter thoroughly
• If necessary, we will take action against the reported user
• Your report helps keep RealAgent safe for everyone

━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ IMPORTANT:
All reports are confidential. We do not disclose reporter identities to the reported parties.

If you have additional information to add to this report, please reply to this email with your Report ID.

Thank you for helping us maintain a safe platform!

Best regards,
RealAgent Security Team`
	}
};

/**
	* Send email using Courier
	* @param {string} email - Recipient email address
	* @param {object} data - Template data (name, otp, links, etc.)
	* @param {string} type - Email type (welcome, verification, otp, reset, etc.)
	* @returns {Promise<string>} Request ID from Courier
	*/
const sendMail = async (email, data = {}, type) => {
	try {
		if (!mail_content_type[type]) {
			throw new Error(`Invalid email type: ${type}`);
		}

		const { requestId } = await courier.send(
			{
				message: {
					to: { email },
					content: mail_content_type[type],
					data,
					routing: {
						method: 'single',
						channels: ['email'],
					},
				},
			},
			{
				timeoutInSeconds: 45,
			}
		);

		console.log(`Email sent successfully to ${email} (${type}) - Request ID: ${requestId}`);
		return requestId;
	} catch (error) {
		console.error('Courier send email error:', error);
		throw new Error(`Failed to send email: ${error.message}`);
	}
};

/**
	* Send welcome email
	*/
const sendWelcomeEmail = async (email, name) => {
	return await sendMail(email, { name }, 'welcome');
};

/**
	* Send email verification
	*/
const sendVerificationEmail = async (email, name, verificationToken) => {
	const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
	return await sendMail(email, { name, verificationLink }, 'verification');
};

/**
	* Send OTP email
	*/
const sendOTPEmail = async (email, name, otp) => {
	return await sendMail(email, { name, otp }, 'otp');
};

/**
	* Send password reset email
	*/
const sendPasswordResetEmail = async (email, resetToken) => {
	const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
	return await sendMail(email, { email, resetLink }, 'reset');
};

/**
	* Send agent verification approved email
	*/
const sendVerificationApprovedEmail = async (email, name, remarks = '') => {
	const dashboardLink = `${process.env.FRONTEND_URL}/dashboard/agent`;
	const data = { name, dashboardLink };
	if (remarks) {
		data.remarks = remarks;
	}
	return await sendMail(email, data, 'verificationApproved');
};

/**
	* Send agent verification rejected email
	*/
const sendVerificationRejectedEmail = async (email, name, reason = 'Documents require review') => {
	const verificationLink = `${process.env.FRONTEND_URL}/dashboard/agent/verification`;
	return await sendMail(email, { name, reason, verificationLink }, 'verificationRejected');
};

/**
	* Send agent verification submitted confirmation email
	*/
const sendVerificationSubmittedEmail = async (email, name) => {
	const dashboardLink = `${process.env.FRONTEND_URL}/dashboard/agent/verification`;
	return await sendMail(email, { name, dashboardLink }, 'verificationSubmitted');
};

/**
	* Send contact form email to admin
	*/
const sendContactFormEmail = async (adminEmail, { name, email, subject, message }) => {
	const submittedAt = new Date().toLocaleString();
	return await sendMail(adminEmail, { name, email, subject, message, submittedAt }, 'contactForm');
};

/**
	* Send contact form confirmation to user
	*/
const sendContactConfirmationEmail = async (email, name) => {
	return await sendMail(email, { name }, 'contactConfirmation');
};

/**
 * Send viewing request created notification (to agent or requester)
 * @param {string} email
 * @param {object} payload - { recipientName, requesterName, propertyTitle, requestedDate, requestedTime, message, dashboardLink }
 */
const sendViewingRequestCreatedEmail = async (email, payload = {}, type = "user") => {
	return type === "user" ?  await sendMail(email, payload, 'viewingRequestCreatedUser'):
	 await sendMail(email, payload, 'viewingRequestCreatedAgent');
};

/**
 * Send viewing request status update notification
 * @param {string} email
 * @param {object} payload - { recipientName, propertyTitle, requestedDate, requestedTime, status, dashboardLink }
 */
const sendViewingRequestStatusEmail = async (email, payload = {}) => {
	return await sendMail(email, payload, 'viewingRequestStatusUpdate');
};

/**
	* Send fraud report notification to admin
	*/
const sendFraudReportEmail = async (adminEmail, { reportId, fraudType, description, severity, targetUserEmail, evidenceCount, reporterEmail }) => {
	const reviewLink = `${process.env.FRONTEND_URL}/dashboard/admin/fraud/${reportId}`;
	const submittedAt = new Date().toLocaleString();
	return await sendMail(adminEmail, {
		reportId,
		fraudType,
		description,
		severity,
		targetUserEmail,
		evidenceCount,
		reporterEmail,
		submittedAt,
		reviewLink
	}, 'fraudReport');
};

/**
	* Send fraud report confirmation to reporter
	*/
const sendFraudReportConfirmationEmail = async (email, { reportId, fraudType }) => {
	const statusLink = `${process.env.FRONTEND_URL}/report/status/${reportId}`;
	return await sendMail(email, { reportId, fraudType, statusLink }, 'fraudReportConfirmation');
};

module.exports = {
	sendMail,
	sendWelcomeEmail,
	sendVerificationEmail,
	sendOTPEmail,
	sendPasswordResetEmail,
	sendVerificationApprovedEmail,
	sendVerificationRejectedEmail,
	sendVerificationSubmittedEmail,
	sendContactFormEmail,
	sendViewingRequestStatusEmail,
	sendViewingRequestCreatedEmail,
	sendContactConfirmationEmail,
	sendFraudReportEmail,
	sendFraudReportConfirmationEmail,
};
