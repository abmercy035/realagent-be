/**
	* Contact Controller
	* Handles contact form submissions and sends email notifications to admin
	*/

const { sendContactFormEmail, sendContactConfirmationEmail } = require('../utils/email');

/**
	* @route   POST /api/contact
	* @desc    Submit contact form
	* @access  Public
	*/
exports.submitContactForm = async (req, res) => {
	try {
		const { name, email, subject, message } = req.body;

		// Validation
		if (!name || !email || !subject || !message) {
			return res.status(400).json({
				status: 'error',
				message: 'Please provide all required fields',
			});
		}

		// Email validation
		const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
		if (!emailRegex.test(email)) {
			return res.status(400).json({
				status: 'error',
				message: 'Please provide a valid email address',
			});
		}

		// Send email notification to admin
		const adminEmail = process.env.ADMIN_EMAIL || 'therealagent.com@gmail.com';
		await sendContactFormEmail(adminEmail, { name, email, subject, message });

		// Send confirmation email to user
		await sendContactConfirmationEmail(email, name);

		res.status(200).json({
			status: 'success',
			message: 'Message sent successfully. We\'ll get back to you soon!',
		});
	} catch (error) {
		console.error('Contact form error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to send message. Please try again later.',
		});
	}
};
