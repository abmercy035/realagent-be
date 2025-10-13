/**
	* FraudFlag Model
	* Tracks suspicious activities and fraud reports
	* Enables admin to take action on flagged agents/users
	*/

const mongoose = require('mongoose');

const fraudFlagSchema = new mongoose.Schema(
	{
		// ===========================
		// FLAGGED USER/AGENT
		// ===========================
		flaggedUserId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'Flagged user ID is required'],
			index: true,
		},

		// ===========================
		// REPORTER INFORMATION
		// ===========================
		reportedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			index: true,
		},
		reporterType: {
			type: String,
			enum: {
				values: ['user', 'system', 'admin'],
				message: 'Reporter type must be user, system, or admin',
			},
			default: 'user',
		},

		// ===========================
		// FRAUD DETAILS
		// ===========================
		fraudType: {
			type: String,
			enum: {
				values: [
					'fake_listing',
					'duplicate_account',
					'fake_identity',
					'scam_attempt',
					'inappropriate_content',
					'payment_fraud',
					'spam',
					'other',
				],
				message: 'Invalid fraud type',
			},
			required: [true, 'Fraud type is required'],
			index: true,
		},
		reason: {
			type: String,
			required: [true, 'Reason is required'],
			trim: true,
			minlength: [10, 'Reason must be at least 10 characters'],
			maxlength: [1000, 'Reason cannot exceed 1000 characters'],
		},
		description: {
			type: String,
			trim: true,
			maxlength: [2000, 'Description cannot exceed 2000 characters'],
		},

		// ===========================
		// EVIDENCE
		// ===========================
		evidence: [
			{
				type: {
					type: String,
					enum: ['screenshot', 'document', 'link', 'text'],
				},
				url: String,
				publicId: String, // Cloudinary ID
				description: String,
			},
		],
		relatedPropertyId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Property',
		},

		// ===========================
		// SEVERITY & PRIORITY
		// ===========================
		severity: {
			type: String,
			enum: {
				values: ['low', 'medium', 'high', 'critical'],
				message: 'Severity must be low, medium, high, or critical',
			},
			default: 'medium',
			index: true,
		},
		priority: {
			type: Number,
			default: 0,
			min: 0,
			max: 10,
		},

		// ===========================
		// STATUS & RESOLUTION
		// ===========================
		status: {
			type: String,
			enum: {
				values: ['pending', 'under_review', 'resolved', 'dismissed'],
				message: 'Status must be pending, under_review, resolved, or dismissed',
			},
			default: 'pending',
			index: true,
		},
		actionTaken: {
			type: String,
			enum: {
				values: ['none', 'warning', 'suspended', 'banned', 'account_deleted'],
				message: 'Invalid action type',
			},
			default: 'none',
		},
		actionDetails: {
			type: String,
			trim: true,
			maxlength: [1000, 'Action details cannot exceed 1000 characters'],
		},

		// ===========================
		// ADMIN REVIEW
		// ===========================
		reviewedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
		},
		reviewedAt: {
			type: Date,
		},
		adminNotes: {
			type: String,
			trim: true,
			maxlength: [2000, 'Admin notes cannot exceed 2000 characters'],
		},

		// ===========================
		// SYSTEM DETECTION
		// ===========================
		systemFlags: {
			duplicateEmail: { type: Boolean, default: false },
			duplicatePhone: { type: Boolean, default: false },
			duplicateIP: { type: Boolean, default: false },
			suspiciousActivity: { type: Boolean, default: false },
			multipleAccounts: { type: Boolean, default: false },
		},
		detectionMetadata: {
			ipAddresses: [String],
			deviceFingerprints: [String],
			suspiciousPatterns: [String],
		},

		// ===========================
		// RESOLUTION TRACKING
		// ===========================
		resolvedAt: {
			type: Date,
		},
		resolutionNotes: {
			type: String,
			trim: true,
			maxlength: [1000, 'Resolution notes cannot exceed 1000 characters'],
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

// ===========================
// INDEXES for performance
// ===========================
fraudFlagSchema.index({ flaggedUserId: 1, status: 1 });
fraudFlagSchema.index({ reportedBy: 1 });
fraudFlagSchema.index({ status: 1, severity: -1, createdAt: -1 });
fraudFlagSchema.index({ fraudType: 1 });

// ===========================
// VIRTUAL PROPERTIES
// ===========================

/**
	* Check if flag is pending
	*/
fraudFlagSchema.virtual('isPending').get(function () {
	return this.status === 'pending';
});

/**
	* Check if flag is resolved
	*/
fraudFlagSchema.virtual('isResolved').get(function () {
	return this.status === 'resolved';
});

/**
	* Check if action was taken
	*/
fraudFlagSchema.virtual('hasActionTaken').get(function () {
	return this.actionTaken !== 'none';
});

/**
	* Check if system detected
	*/
fraudFlagSchema.virtual('isSystemDetected').get(function () {
	return this.reporterType === 'system';
});

// ===========================
// INSTANCE METHODS
// ===========================

/**
	* Mark flag as under review
	* @param {ObjectId} adminId - Admin reviewing
	* @returns {Promise<FraudFlag>} Updated document
	*/
fraudFlagSchema.methods.startReview = async function (adminId) {
	this.status = 'under_review';
	this.reviewedBy = adminId;
	this.reviewedAt = new Date();
	return await this.save();
};

/**
	* Resolve flag with action
	* @param {ObjectId} adminId - Admin resolving
	* @param {string} action - Action taken
	* @param {string} notes - Resolution notes
	* @returns {Promise<FraudFlag>} Updated document
	*/
fraudFlagSchema.methods.resolve = async function (adminId, action, notes = '') {
	this.status = 'resolved';
	this.actionTaken = action;
	this.reviewedBy = adminId;
	this.reviewedAt = new Date();
	this.resolvedAt = new Date();
	this.resolutionNotes = notes;
	return await this.save();
};

/**
	* Dismiss flag
	* @param {ObjectId} adminId - Admin dismissing
	* @param {string} reason - Dismissal reason
	* @returns {Promise<FraudFlag>} Updated document
	*/
fraudFlagSchema.methods.dismiss = async function (adminId, reason) {
	this.status = 'dismissed';
	this.reviewedBy = adminId;
	this.reviewedAt = new Date();
	this.resolvedAt = new Date();
	this.adminNotes = reason;
	return await this.save();
};

/**
	* Get public flag data (for user who reported)
	* @returns {Object} Safe flag data
	*/
fraudFlagSchema.methods.toPublicData = function () {
	return {
		id: this._id,
		fraudType: this.fraudType,
		status: this.status,
		severity: this.severity,
		createdAt: this.createdAt,
		resolvedAt: this.resolvedAt,
	};
};

/**
	* Get admin flag data (complete info)
	* @returns {Object} Complete flag data
	*/
fraudFlagSchema.methods.toAdminData = function () {
	return {
		id: this._id,
		flaggedUserId: this.flaggedUserId,
		reportedBy: this.reportedBy,
		reporterType: this.reporterType,
		fraudType: this.fraudType,
		reason: this.reason,
		description: this.description,
		evidence: this.evidence,
		severity: this.severity,
		status: this.status,
		actionTaken: this.actionTaken,
		actionDetails: this.actionDetails,
		systemFlags: this.systemFlags,
		detectionMetadata: this.detectionMetadata,
		reviewedBy: this.reviewedBy,
		reviewedAt: this.reviewedAt,
		adminNotes: this.adminNotes,
		resolvedAt: this.resolvedAt,
		resolutionNotes: this.resolutionNotes,
		createdAt: this.createdAt,
	};
};

// ===========================
// STATIC METHODS
// ===========================

/**
	* Get pending fraud flags for admin review
	* @param {number} limit - Maximum results
	* @returns {Promise<Array>} Pending flags
	*/
fraudFlagSchema.statics.getPending = function (limit = 50) {
	return this.find({ status: 'pending' })
		.populate('flaggedUserId', 'name email role')
		.populate('reportedBy', 'name email')
		.sort({ severity: -1, createdAt: 1 })
		.limit(limit);
};

/**
	* Get all flags for a specific user
	* @param {ObjectId} userId - User ID
	* @returns {Promise<Array>} User's fraud flags
	*/
fraudFlagSchema.statics.getByUser = function (userId) {
	return this.find({ flaggedUserId: userId })
		.sort({ createdAt: -1 });
};

/**
	* Check if user has active flags
	* @param {ObjectId} userId - User ID
	* @returns {Promise<boolean>} True if has active flags
	*/
fraudFlagSchema.statics.hasActiveFlags = async function (userId) {
	const count = await this.countDocuments({
		flaggedUserId: userId,
		status: { $in: ['pending', 'under_review'] },
	});
	return count > 0;
};

/**
	* Get fraud statistics
	* @returns {Promise<Object>} Statistics
	*/
fraudFlagSchema.statics.getStats = async function () {
	const [statusStats, typeStats, actionStats] = await Promise.all([
		this.aggregate([
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
				},
			},
		]),
		this.aggregate([
			{
				$group: {
					_id: '$fraudType',
					count: { $sum: 1 },
				},
			},
		]),
		this.aggregate([
			{
				$group: {
					_id: '$actionTaken',
					count: { $sum: 1 },
				},
			},
		]),
	]);

	return {
		byStatus: statusStats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
		byType: typeStats.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
		byAction: actionStats.reduce((acc, a) => ({ ...acc, [a._id]: a.count }), {}),
	};
};

// ===========================
// MODEL EXPORT
// ===========================
const FraudFlag = mongoose.model('FraudFlag', fraudFlagSchema);

module.exports = FraudFlag;
