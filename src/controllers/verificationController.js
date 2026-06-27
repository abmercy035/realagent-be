/**
	* Verification Controller
	* Handles agent verification submission, review, and approval
	*/

const AgentVerification = require('../models/AgentVerification');
const User = require('../models/User');
const mongoose = require('mongoose');
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
			subtype,
			professionalProof,
			studentProof,
			idName,
			idDocumentUrl: flatIdDocUrl,
			proofOfAddressUrl: flatProofOfAddressUrl,
			businessRegistrationUrl: flatCacUrl,
			businessName: flatBusinessName,
			businessRegNo: flatBusinessRegNo,
			businessAddress: flatBusinessAddress,
		} = req.body;

		// Adapt to support both nested (frontend Next.js) and flat (legacy backend) formats
		let finalSubtype = subtype || 'professional';
		let finalIdDocUrl = flatIdDocUrl;
		let finalProofOfAddressUrl = flatProofOfAddressUrl;
		let finalCacUrl = flatCacUrl;
		let finalBusinessName = flatBusinessName;
		let finalBusinessRegNo = flatBusinessRegNo;
		let finalBusinessAddress = flatBusinessAddress;
		let finalStudentEmail = null;

		if (professionalProof) {
			finalSubtype = 'professional';
			finalIdDocUrl = professionalProof.govIdDocumentUrl || professionalProof.cacDocumentUrl || finalIdDocUrl;
			finalProofOfAddressUrl = professionalProof.proofOfAddressUrl || finalProofOfAddressUrl;
			finalCacUrl = professionalProof.cacDocumentUrl || finalCacUrl;
			finalBusinessName = professionalProof.businessName || finalBusinessName;
			finalBusinessRegNo = professionalProof.cacNumber || professionalProof.businessRegNo || finalBusinessRegNo;
			finalBusinessAddress = professionalProof.businessAddress || finalBusinessAddress;
		} else if (studentProof) {
			finalSubtype = 'student';
			finalIdDocUrl = studentProof.studentIdCardUrl || finalIdDocUrl;
			finalStudentEmail = studentProof.studentEmail;
		}

		// Validate required fields
		if (!finalIdDocUrl) {
			return res.status(400).json({
				status: 'error',
				message: 'Verification document is required',
			});
		}

		// Allow both users and agents to submit verification
		if (req.user.role !== 'agent' && req.user.role !== 'user') {
			return res.status(403).json({
				status: 'error',
				message: 'Only regular users and agents can submit verification',
			});
		}

		// Update user profile to reflect agent status and embed agentProfile subdocument
		const user = await User.findById(req.user._id);
		if (!user) {
			return res.status(404).json({
				status: 'error',
				message: 'User account not found',
			});
		}

		const now = new Date();
		const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

		user.role = 'agent';
		user.agentProfile = {
			subtype: finalSubtype,
			verification: {
				status: 'pending',
				submittedAt: now,
				professionalProof: finalSubtype === 'professional' ? {
					govIdType: professionalProof?.govIdType || 'nin',
					govIdNumber: professionalProof?.govIdNumber || '',
					govIdDocumentUrl: professionalProof?.govIdDocumentUrl || finalIdDocUrl || '',
					cacNumber: professionalProof?.cacNumber || finalBusinessRegNo || '',
					cacDocumentUrl: professionalProof?.cacDocumentUrl || finalCacUrl || '',
					proofOfAddressUrl: finalProofOfAddressUrl || '',
				} : undefined,
				studentProof: finalSubtype === 'student' ? {
					studentEmail: finalStudentEmail || '',
					studentIdCardUrl: finalIdDocUrl || '',
				} : undefined,
			},
			subscription: {
				plan: 'free',
				status: 'trialing',
				trialStartedAt: now,
				trialEndsAt,
				currentPeriodStart: now,
				currentPeriodEnd: trialEndsAt,
				listingsUsedThisPeriod: 0,
			},
			createdAt: now,
		};

		await user.save();

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
				url: finalIdDocUrl,
				uploadedAt: new Date(),
			};
			existingVerification.proofOfAddress = finalProofOfAddressUrl ? {
				url: finalProofOfAddressUrl,
				uploadedAt: new Date(),
			} : undefined;
			if (finalCacUrl) {
				existingVerification.businessRegistration = {
					url: finalCacUrl,
					uploadedAt: new Date(),
				};
			}
			existingVerification.businessName = finalBusinessName;
			existingVerification.businessRegNo = finalBusinessRegNo;
			existingVerification.businessAddress = finalBusinessAddress;
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
					url: finalIdDocUrl,
					uploadedAt: new Date(),
				},
				proofOfAddress: finalProofOfAddressUrl
					? {
						url: finalProofOfAddressUrl,
						uploadedAt: new Date(),
					}
					: undefined,
				businessRegistration: finalCacUrl
					? {
						url: finalCacUrl,
						uploadedAt: new Date(),
					}
					: undefined,
				businessName: finalBusinessName,
				businessRegNo: finalBusinessRegNo,
				businessAddress: finalBusinessAddress,
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

		// Load agent user profile
		const agentProfile = await User.findById(verification.agentId._id);

		// Generate a unique agentIdNumber (RA-######). Try DB check to avoid collisions.
		const generateUniqueAgentIdNumber = async () => {
			const maxAttempts = 10;
			for (let i = 0; i < maxAttempts; i++) {
				const candidate = `RA-${Math.floor(100000 + Math.random() * 900000)}`;
				// Check both AgentVerification and User collections for existing value
				const existsInVerification = await AgentVerification.exists({ agentIdNumber: candidate });
				const existsInUser = await User.exists({ agentIdNumber: candidate });
				if (!existsInVerification && !existsInUser) return candidate;
			}
			// Fallback: use timestamp-based id to ensure uniqueness
			return `RA-${Date.now().toString().slice(-8)}`;
		};

		// Persist on both verification document and user profile.
		// Prefer a transaction to ensure both docs are updated atomically where supported.
		// Fall back to a save-with-retry approach if transactions are not available.
		const maxSaveAttempts = 5;
		let saved = false;
		let lastError;

		for (let attempt = 1; attempt <= maxSaveAttempts && !saved; attempt++) {
			const candidate = await generateUniqueAgentIdNumber();
			try {
				// assign candidate
				verification.agentIdNumber = candidate;
				if (agentProfile) {
					agentProfile.agentIdNumber = candidate;
					agentProfile.verified = true;
				}

				// Try to use a transaction (requires replica set); if unavailable we'll catch and fallback
				let session;
				try {
					session = await mongoose.startSession();
					session.startTransaction();

					await verification.save({ session });
					if (agentProfile) await agentProfile.save({ session });

					await session.commitTransaction();
					session.endSession();

					saved = true;
					break;
				} catch (txErr) {
					// Ensure session is cleaned up
					if (session) {
						try { await session.abortTransaction(); } catch (e) { }
						session.endSession();
					}

					lastError = txErr;

					// Duplicate key from transaction commit or save -> retry with new candidate
					if (txErr && txErr.code && (txErr.code === 11000 || txErr.code === 11001)) {
						console.warn(`Duplicate agentIdNumber detected in transaction on attempt ${attempt}, retrying...`);
						continue;
					}

					// If transactions are not supported (e.g., standalone), fall back to session-less save with retry
					const txNotSupported = txErr && (txErr.message && (txErr.message.includes('transactions are not supported') || txErr.message.includes('Transaction numbers are only allowed on a replica set')));
					if (txNotSupported) {
						try {
							await verification.save();
							if (agentProfile) await agentProfile.save();
							saved = true;
							break;
						} catch (saveErr) {
							lastError = saveErr;
							if (saveErr && saveErr.code && (saveErr.code === 11000 || saveErr.code === 11001)) {
								console.warn(`Duplicate agentIdNumber detected on standalone save attempt ${attempt}, retrying...`);
								continue;
							}
							console.error('Failed to save verification/user during approve (standalone save):', saveErr);
							break;
						}
					}

					// For other transaction-related errors, propagate
					console.error('Transaction error while saving verification/user:', txErr);
					break;
				}
			} catch (outerErr) {
				lastError = outerErr;
				if (outerErr && outerErr.code && (outerErr.code === 11000 || outerErr.code === 11001)) {
					console.warn(`Duplicate agentIdNumber detected on attempt ${attempt}, retrying...`);
					continue;
				}
				console.error('Failed to persist agentIdNumber during approval:', outerErr);
				break;
			}
		}

		if (!saved) {
			// If saving repeatedly failed, surface error
			console.error('Failed to persist agentIdNumber after retries', lastError);
			return res.status(500).json({ status: 'error', message: 'Failed to finalize verification due to duplicate ID collision. Please try again.' });
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
