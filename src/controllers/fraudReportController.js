/**
	* Fraud Report Controller
	* Handles fraud reporting submissions from users
	*/

const FraudFlag = require('../models/FraudFlag');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const { sendFraudReportEmail, sendFraudReportConfirmationEmail } = require('../utils/email');

/**
	* Submit a fraud report
	* @route POST /api/reports/fraud
	* @access Public
	*/
exports.submitFraudReport = async (req, res) => {
	try {
		const { fraudType, description, targetUserId, targetUserEmail, contactEmail, contactPhone } = req.body;

		// Validation
		if (!fraudType || !description || !contactEmail) {
			return res.status(400).json({
				success: false,
				error: 'Fraud type, description, and contact email are required',
			});
		}

		if (description.length < 20) {
			return res.status(400).json({
				success: false,
				error: 'Description must be at least 20 characters',
			});
		}

		// Validate email format
		const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
		if (!emailRegex.test(contactEmail)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid email format',
			});
		}

		// Find flagged user if provided
		let flaggedUser = null;
		if (targetUserId) {
			flaggedUser = await User.findById(targetUserId);
		} else if (targetUserEmail) {
			flaggedUser = await User.findOne({ email: targetUserEmail.toLowerCase() });
		}

		// Handle evidence file uploads
		const evidence = [];
		if (req.files && req.files.length > 0) {
			for (const file of req.files) {
				try {
					const result = await cloudinary.uploadToCloudinary(file.path, {
						folder: 'campusagent/fraud-evidence',
						resource_type: 'auto',
					});

console.log(result)

					evidence.push({
						type: file.mimetype.startsWith('image/') ? 'screenshot' : 'document',
						url: result.url,
						publicId: result.publicId,
						description: file.originalname,
					});
				} catch (uploadError) {
					console.error('File upload error:', uploadError);
					// Continue even if one file fails
				}
			}
		}

		// Determine severity based on fraud type
		const criticalTypes = ['payment_fraud', 'fake_identity', 'scam_attempt'];
		const highTypes = ['fake_listing', 'duplicate_account'];
		let severity = 'medium';
		if (criticalTypes.includes(fraudType)) {
			severity = 'critical';
		} else if (highTypes.includes(fraudType)) {
			severity = 'high';
		}

		// Create fraud flag
		const fraudFlag = new FraudFlag({
			flaggedUserId: flaggedUser ? flaggedUser._id : null,
			reporterType: 'user',
			fraudType,
			reason: description,
			description,
			evidence,
			severity,
			status: 'pending',
			reporterContactInfo: {
				email: contactEmail,
				phone: contactPhone || null,
			},
		});

		await fraudFlag.save();

		// Send email notifications
		const adminEmail = process.env.ADMIN_EMAIL || 'campusagent.app@gmail.com';

		try {
			// Send notification to admin
			await sendFraudReportEmail(adminEmail, {
				reportId: fraudFlag._id,
				fraudType,
				description,
				severity,
				targetUserEmail: flaggedUser ? flaggedUser.email : targetUserEmail || 'Unknown',
				evidenceCount: evidence.length,
				reporterEmail: contactEmail,
			});

			// Send confirmation to reporter
			await sendFraudReportConfirmationEmail(contactEmail, {
				reportId: fraudFlag._id,
				fraudType,
			});
		} catch (emailError) {
			console.error('Email notification error:', emailError);
			// Don't fail the request if email fails
		}

		res.status(201).json({
			success: true,
			message: 'Fraud report submitted successfully. Our team will review it within 24 hours.',
			data: {
				reportId: fraudFlag._id,
				status: fraudFlag.status,
				severity: fraudFlag.severity,
			},
		});
	} catch (error) {
		console.error('Fraud report submission error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to submit fraud report. Please try again.',
		});
	}
};

/**
	* Get fraud report status (for users to check their report)
	* @route GET /api/reports/fraud/:reportId
	* @access Public (with report ID)
	*/
exports.getFraudReportStatus = async (req, res) => {
	try {
		const { reportId } = req.params;

		const fraudFlag = await FraudFlag.findById(reportId).select(
			'fraudType status severity createdAt actionTaken resolvedAt'
		);

		if (!fraudFlag) {
			return res.status(404).json({
				success: false,
				error: 'Report not found',
			});
		}

		res.status(200).json({
			success: true,
			data: fraudFlag,
		});
	} catch (error) {
		console.error('Get fraud report status error:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to retrieve report status',
		});
	}
};
