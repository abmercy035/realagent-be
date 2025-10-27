/**
	* AgentVerification Model
	* Handles agent identity verification and document submission
	* Tracks verification status and admin review process
	*/

const mongoose = require('mongoose');

const agentVerificationSchema = new mongoose.Schema(
	{
		// ===========================
		// AGENT REFERENCE
		// ===========================
		agentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'Agent ID is required'],
			index: true,
		},
		agentIdNumber: {
			type: String,
			unique: true,
			sparse: true,
		},

		// ===========================
		// VERIFICATION DOCUMENTS
		// ===========================

		idDocument: {
			name: {
				type: String,
				default: "student id"
			},
			url: {
				type: String,
				required: [true, 'ID document is required'],
			},
			publicId: {
				type: String, // Cloudinary public ID for deletion
			},
			uploadedAt: {
				type: Date,
				default: Date.now,
			},
		},
		proofOfAddress: {
			name: {
				type: String,
				default: "proof of address"
			},
			url: {
				type: String,
			},
			publicId: {
				type: String,
			},
			uploadedAt: {
				type: Date,
				default: Date.now,
			},
		},
		businessRegistration: {
			url: {
				type: String,
			},
			publicId: {
				type: String,
			},
			uploadedAt: {
				type: Date,
				default: Date.now,
			},
		},

		// ===========================
		// BUSINESS INFORMATION
		// ===========================
		businessName: {
			type: String,
			trim: true,
			maxlength: [200, 'Business name cannot exceed 200 characters'],
		},
		businessRegNo: {
			type: String,
			trim: true,
			maxlength: [100, 'Business registration number cannot exceed 100 characters'],
		},
		businessAddress: {
			type: String,
			trim: true,
			maxlength: [500, 'Business address cannot exceed 500 characters'],
		},

		// ===========================
		// VERIFICATION STATUS
		// ===========================
		status: {
			type: String,
			enum: {
				values: ['pending', 'approved', 'rejected'],
				message: 'Status must be pending, approved, or rejected',
			},
			default: 'pending',
			index: true,
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
		remarks: {
			type: String,
			trim: true,
			maxlength: [1000, 'Remarks cannot exceed 1000 characters'],
		},
		rejectionReason: {
			type: String,
			trim: true,
			maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
		},

		// ===========================
		// RESUBMISSION TRACKING
		// ===========================
		submissionCount: {
			type: Number,
			default: 1,
			min: [1, 'Submission count must be at least 1'],
		},
		previousSubmissions: [
			{
				submittedAt: Date,
				status: String,
				remarks: String,
			},
		],
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
agentVerificationSchema.index({ agentId: 1, status: 1 });
agentVerificationSchema.index({ status: 1, createdAt: -1 });
agentVerificationSchema.index({ reviewedBy: 1 });

// ===========================
// VIRTUAL PROPERTIES
// ===========================

/**
	* Check if verification is pending
	*/
agentVerificationSchema.virtual('isPending').get(function () {
	return this.status === 'pending';
});

/**
	* Check if verification is approved
	*/
agentVerificationSchema.virtual('isApproved').get(function () {
	return this.status === 'approved';
});

/**
	* Check if verification is rejected
	*/
agentVerificationSchema.virtual('isRejected').get(function () {
	return this.status === 'rejected';
});

/**
	* Check if this is a resubmission
	*/
agentVerificationSchema.virtual('isResubmission').get(function () {
	return this.submissionCount > 1;
});

// ===========================
// INSTANCE METHODS
// ===========================

/**
	* Approve verification
	* @param {ObjectId} adminId - Admin who approved
	* @param {string} remarks - Optional approval remarks
	* @returns {Promise<AgentVerification>} Updated document
	*/
agentVerificationSchema.methods.approve = async function (adminId, remarks = '') {
	this.status = 'approved';
	this.reviewedBy = adminId;
	this.reviewedAt = new Date();
	this.remarks = remarks;
	return await this.save();
};

/**
	* Reject verification
	* @param {ObjectId} adminId - Admin who rejected
	* @param {string} reason - Reason for rejection
	* @param {string} remarks - Additional remarks
	* @returns {Promise<AgentVerification>} Updated document
	*/
agentVerificationSchema.methods.reject = async function (adminId, reason, remarks = '') {
	// Store in history
	this.previousSubmissions.push({
		submittedAt: this.createdAt,
		status: 'rejected',
		remarks: reason,
	});

	this.status = 'rejected';
	this.reviewedBy = adminId;
	this.reviewedAt = new Date();
	this.rejectionReason = reason;
	this.remarks = remarks;
	return await this.save();
};

/**
	* Get public verification data (safe for display)
	* @returns {Object} Safe verification data
	*/
agentVerificationSchema.methods.toPublicData = function () {
	return {
		id: this._id,
		status: this.status,
		businessName: this.businessName,
		submittedAt: this.createdAt,
		reviewedAt: this.reviewedAt,
		remarks: this.remarks,
		isResubmission: this.isResubmission,
		submissionCount: this.submissionCount,
	};
};

/**
	* Get admin review data (includes documents)
	* @returns {Object} Complete verification data for admin
	*/
agentVerificationSchema.methods.toAdminData = function () {
	return {
		id: this._id,
		agentId: this.agentId,
		status: this.status,
		idDocument: this.idDocument,
		proofOfAddress: this.proofOfAddress,
		businessRegistration: this.businessRegistration,
		businessName: this.businessName,
		businessRegNo: this.businessRegNo,
		businessAddress: this.businessAddress,
		submittedAt: this.createdAt,
		reviewedBy: this.reviewedBy,
		reviewedAt: this.reviewedAt,
		remarks: this.remarks,
		rejectionReason: this.rejectionReason,
		submissionCount: this.submissionCount,
		previousSubmissions: this.previousSubmissions,
	};
};

// ===========================
// STATIC METHODS
// ===========================

/**
	* Get pending verifications for admin review
	* @param {number} limit - Maximum number of results
	* @returns {Promise<Array>} Pending verifications
	*/
agentVerificationSchema.statics.getPending = function (limit = 50) {
	return this.find({ status: 'pending' })
		.populate('agentId', 'name email phone school')
		.sort({ createdAt: 1 }) // Oldest first (FIFO)
		.limit(limit);
};

/**
	* Get verification by agent ID
	* @param {ObjectId} agentId - Agent's user ID
	* @returns {Promise<AgentVerification>} Latest verification
	*/
agentVerificationSchema.statics.getByAgentId = function (agentId) {
	return this.findOne({ agentId }).sort({ createdAt: -1 });
};

/**
	* Check if agent is verified
	* @param {ObjectId} agentId - Agent's user ID
	* @returns {Promise<boolean>} True if verified
	*/
agentVerificationSchema.statics.isAgentVerified = async function (agentId) {
	const verification = await this.findOne({
		agentId,
		status: 'approved'
	});
	return !!verification;
};

/**
	* Get verification statistics
	* @returns {Promise<Object>} Statistics
	*/
agentVerificationSchema.statics.getStats = async function () {
	const stats = await this.aggregate([
		{
			$group: {
				_id: '$status',
				count: { $sum: 1 },
			},
		},
	]);

	const result = {
		pending: 0,
		approved: 0,
		rejected: 0,
		total: 0,
	};

	stats.forEach((stat) => {
		result[stat._id] = stat.count;
		result.total += stat.count;
	});

	return result;
};

// ===========================
// MODEL EXPORT
// ===========================
const AgentVerification = mongoose.model('AgentVerification', agentVerificationSchema);

module.exports = AgentVerification;
