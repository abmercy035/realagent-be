/**
	* Verification Controller
	* Handles agent verification submission, review, and approval
	*/

const AgentVerification = require('../models/AgentVerification');
const User = require('../models/User');
const { uploadToCloudinary, uploadAgentDocument, deleteFromCloudinary } = require('../config/cloudinary');
const {
	sendVerificationApprovedEmail,
	sendVerificationRejectedEmail,
	sendVerificationSubmittedEmail
} = require('../utils/email');

/**
	* @route   POST /api/agents/verify
	* @desc    Submit agent verification documents
	* @access  Private (Agent only)
	*/
const submitVerification = async (req, res) => {
	try {
		const {
			idName,
			idDocumentUrl,
			proofOfAddressUrl,
			businessRegistrationUrl,
			businessName,
			businessRegNo,
			businessAddress,
		} = req.body;

		// Validate required fields
		if (!idDocumentUrl && !proofOfAddressUrl) {
			return res.status(400).json({
				status: 'error',
				message: 'ID document and proof of address are required',
			});
		}

		// Check if user is an agent
		if (req.user.role !== 'agent') {
			return res.status(403).json({
				status: 'error',
				message: 'Only agents can submit verification',
			});
		}

		// Check for existing verification
		const existingVerification = await AgentVerification.findOne({
			agentId: req.user._id,
		}).sort({ createdAt: -1 });

		let verification;

		// If rejected, allow resubmission
		if (existingVerification?.status === 'rejected') {
			// Store previous submission in history
			existingVerification.previousSubmissions.push({
				submittedAt: existingVerification.createdAt,
				status: 'rejected',
				remarks: existingVerification.rejectionReason,
			});

			// Update with new documents
			existingVerification.idDocument = {
				name: idName || "student id",
				url: idDocumentUrl,
				uploadedAt: new Date(),
			};
			existingVerification.proofOfAddress = {
				url: proofOfAddressUrl,
				uploadedAt: new Date(),
			};
			if (businessRegistrationUrl) {
				existingVerification.businessRegistration = {
					url: businessRegistrationUrl,
					uploadedAt: new Date(),
				};
			}
			existingVerification.businessName = businessName;
			existingVerification.businessRegNo = businessRegNo;
			existingVerification.businessAddress = businessAddress;
			existingVerification.status = 'pending';
			existingVerification.submissionCount += 1;
			existingVerification.rejectionReason = undefined;
			existingVerification.remarks = undefined;
			existingVerification.reviewedBy = undefined;
			existingVerification.reviewedAt = undefined;

			verification = await existingVerification.save();
		} else if (existingVerification?.status === 'pending') {
			return res.status(400).json({
				status: 'error',
				message: 'Verification request already pending',
				code: 'PENDING_VERIFICATION',
			});
		} else if (existingVerification?.status === 'approved') {
			return res.status(400).json({
				status: 'error',
				message: 'Agent already verified',
				code: 'ALREADY_VERIFIED',
			});
		} else {
			// Create new verification
			verification = new AgentVerification({
				agentId: req.user._id,
				idDocument: {
					url: idDocumentUrl,
					uploadedAt: new Date(),
				},
				proofOfAddress: {
					url: proofOfAddressUrl,
					uploadedAt: new Date(),
				},
				businessRegistration: businessRegistrationUrl
					? {
						url: businessRegistrationUrl,
						uploadedAt: new Date(),
					}
					: undefined,
				businessName,
				businessRegNo,
				businessAddress,
			});

			await verification.save();
		}

		// Send confirmation email to agent
		try {
			await sendVerificationSubmittedEmail(req.user.email, req.user.name);
		} catch (emailError) {
			console.error('Failed to send submission confirmation email:', emailError);
			// Continue even if email fails
		}

		res.status(201).json({
			status: 'success',
			message: 'Verification submitted successfully. Awaiting admin review.',
			data: {
				verification: verification.toPublicData(),
			},
		});
	} catch (error) {
		console.error('Verification submission error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to submit verification',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/agents/verify/status
	* @desc    Get agent's verification status
	* @access  Private (Agent only)
	*/
const getVerificationStatus = async (req, res) => {
	try {
		const verification = await AgentVerification.findOne({
			agentId: req.user._id,
		}).sort({ createdAt: -1 });

		if (!verification) {
			return res.status(200).json({
				status: 'success',
				data: {
					verified: false,
					hasSubmission: false,
				},
			});
		}

		res.status(200).json({
			status: 'success',
			data: {
				verified: verification.status === 'approved',
				verification: verification.toPublicData(),
			},
		});
	} catch (error) {
		console.error('Get verification status error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch verification status',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/admin/verifications
	* @desc    Get all pending verifications for admin review
	* @access  Private (Admin only)
	*/
const getPendingVerifications = async (req, res) => {
	try {
		const { status = 'pending', limit = 50, page = 1 } = req.query;

		const query = {};
		if (status && status !== 'all') {
			query.status = status;
		}

		const skip = (parseInt(page) - 1) * parseInt(limit);

		const [verifications, total] = await Promise.all([
			AgentVerification.find(query)
				.populate('agentId', 'name email phone school createdAt')
				.populate('reviewedBy', 'name email')
				.sort({ createdAt: 1 })
				.skip(skip)
				.limit(parseInt(limit)),
			AgentVerification.countDocuments(query),
		]);

		res.status(200).json({
			status: 'success',
			data: {
				verifications: verifications.map((v) => v.toAdminData()),
				pagination: {
					total,
					page: parseInt(page),
					limit: parseInt(limit),
					pages: Math.ceil(total / parseInt(limit)),
				},
			},
		});
	} catch (error) {
		console.error('Get pending verifications error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch verifications',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/admin/verifications/:id
	* @desc    Get specific verification details
	* @access  Private (Admin only)
	*/
const getVerificationById = async (req, res) => {
	try {
		const { id } = req.params;

		const verification = await AgentVerification.findById(id)
			.populate('agentId', 'name email phone school createdAt role')
			.populate('reviewedBy', 'name email');

		if (!verification) {
			return res.status(404).json({
				status: 'error',
				message: 'Verification not found',
			});
		}

		res.status(200).json({
			status: 'success',
			data: {
				verification: verification.toAdminData(),
			},
		});
	} catch (error) {
		console.error('Get verification by ID error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch verification',
			error: error.message,
		});
	}
};

/**
	* @route   PATCH /api/admin/verifications/:id/approve
	* @desc    Approve agent verification
	* @access  Private (Admin only)
	*/
const approveVerification = async (req, res) => {
	try {
		const { id } = req.params;
		const { remarks } = req.body;

		const verification = await AgentVerification.findById(id).populate(
			'agentId',
			'name email'
		);

		if (!verification) {
			return res.status(404).json({
				status: 'error',
				message: 'Verification not found',
			});
		}

		if (verification.status !== 'pending') {
			return res.status(400).json({
				status: 'error',
				message: `Cannot approve verification with status: ${verification.status}`,
			});
		}

		// Approve verification
		await verification.approve(req.user._id, remarks);

		// Send approval email to agent
		try {
			await sendVerificationApprovedEmail(
				verification.agentId.email,
				verification.agentId.name,
				remarks
			);
		} catch (emailError) {
			console.error('Failed to send approval email:', emailError);
			// Continue even if email fails
		}

		res.status(200).json({
			status: 'success',
			message: 'Verification approved successfully',
			data: {
				verification: verification.toPublicData(),
			},
		});
	} catch (error) {
		console.error('Approve verification error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to approve verification',
			error: error.message,
		});
	}
};

/**
	* @route   PATCH /api/admin/verifications/:id/reject
	* @desc    Reject agent verification
	* @access  Private (Admin only)
	*/
const rejectVerification = async (req, res) => {
	try {
		const { id } = req.params;
		const { rejectionReason, reason, remarks } = req.body;

		// Support both rejectionReason and reason field names
		const finalReason = rejectionReason || reason;

		if (!finalReason) {
			return res.status(400).json({
				status: 'error',
				message: 'Rejection reason is required',
			});
		}

		const verification = await AgentVerification.findById(id).populate(
			'agentId',
			'name email'
		);

		if (!verification) {
			return res.status(404).json({
				status: 'error',
				message: 'Verification not found',
			});
		}

		if (verification.status !== 'pending') {
			return res.status(400).json({
				status: 'error',
				message: `Cannot reject verification with status: ${verification.status}`,
			});
		}

		// Reject verification
		await verification.reject(req.user._id, finalReason, remarks);

		// Send rejection email to agent with reason
		try {
			await sendVerificationRejectedEmail(
				verification.agentId.email,
				verification.agentId.name,
				finalReason
			);
		} catch (emailError) {
			console.error('Failed to send rejection email:', emailError);
			// Continue even if email fails
		}

		res.status(200).json({
			status: 'success',
			message: 'Verification rejected',
			data: {
				verification: verification.toPublicData(),
			},
		});
	} catch (error) {
		console.error('Reject verification error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to reject verification',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/admin/verifications/stats
	* @desc    Get verification statistics
	* @access  Private (Admin only)
	*/
const getVerificationStats = async (req, res) => {
	try {
		const stats = await AgentVerification.getStats();

		res.status(200).json({
			status: 'success',
			data: {
				stats,
			},
		});
	} catch (error) {
		console.error('Get verification stats error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch statistics',
			error: error.message,
		});
	}
};

/**
	* @route   POST /api/agents/verify/upload
	* @desc    Upload verification document to Cloudinary
	* @access  Private (Agent only)
	*/
const uploadVerificationDocument = async (req, res) => {
	try {
		const { documentType, fileData } = req.body;

		if (!fileData || !documentType) {
			return res.status(400).json({
				status: 'error',
				message: 'File data and document type are required',
			});
		}

		const existingVerification = await AgentVerification.findOne({
			agentId: req.user._id,
		}).sort({ createdAt: -1 });

		if (existingVerification?.status === 'pending') {
			return res.status(400).json({
				status: 'error',
				message: 'Verification request already pending',
				code: 'PENDING_VERIFICATION',
			});
		}
		// Pass the agent ID (user ID) to the upload function
		const result = await uploadAgentDocument(fileData, req.user._id);

		res.status(200).json({
			status: 'success',
			message: 'Document uploaded successfully',
			data: {
				url: result.url,
				publicId: result.publicId,
				documentType,
			},
		});
	} catch (error) {
		console.error('Upload verification document error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to upload document',
			error: error.message,
		});
	}
};

module.exports = {
	submitVerification,
	getVerificationStatus,
	getPendingVerifications,
	getVerificationById,
	approveVerification,
	rejectVerification,
	getVerificationStats,
	uploadVerificationDocument,
};
