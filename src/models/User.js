/**
	* User Model
	* Handles user authentication and profile data for all roles
	* Roles: user (regular tenant/buyer), agent (property lister), admin (platform manager)
	*/

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
	{
		// ===========================
		// BASIC INFORMATION
		// ===========================
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
			minlength: [2, 'Name must be at least 2 characters'],
			maxlength: [100, 'Name cannot exceed 100 characters'],
		},
		email: {
			type: String,
			required: [true, 'Email is required'],
			unique: true,
			lowercase: true,
			trim: true,
			match: [
				/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
				'Please provide a valid email address',
			],
		},
		password: {
			type: String,
			required: [true, 'Password is required'],
			minlength: [6, 'Password must be at least 6 characters'],
			select: false,
		},
		bio: {
			type: String,
			maxlength: [500, 'Bio must be at most 3000 characters'],
		},
		phone: {
			type: String,
			trim: true,
			match: [/^[0-9]{10,15}$/, 'Please provide a valid phone number'],
		},
		school: {
			type: String,
			trim: true,
			maxlength: [100, 'School name cannot exceed 100 characters'],
		},
		location: {
			country: {
				type: String
			},
			state: {
				type: String
			},
			city: {
				type: String
			},
			landmark: {
				type: String
			}
		},
		yearsOfExperience: {
			type: String,
		},
		languages: {
			type: String,
		},

		// ===========================
		// ROLE & PERMISSIONS
		// ===========================
		role: {
			type: String,
			enum: {
				values: ['user', 'agent', 'admin'],
				message: 'Role must be either user, agent, or admin',
			},
			default: 'user',
		},

		// ===========================
		// VERIFICATION & STATUS
		// ===========================
		verified: {
			type: Boolean,
			default: false,
			index: true,
		},
		verificationToken: {
			type: String,
			select: false,
		},
		verificationTokenExpires: {
			type: Date,
			select: false,
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'suspended', 'banned'],
				message: 'Status must be either active, suspended, or banned',
			},
			default: 'active',
			index: true,
		},
		suspensionReason: {
			type: String,
			maxlength: [500, 'Suspension reason cannot exceed 500 characters'],
		},

		// ===========================
		// PASSWORD RESET
		// ===========================
		resetPasswordToken: {
			type: String,
			select: false,
		},
		resetPasswordExpires: {
			type: Date,
			select: false,
		},

		// ===========================
		// USER INTERACTIONS
		// ===========================
		bookmarks: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Property',
			},
		],

		// ===========================
		// RATING & REVIEWS (for agents)
		// ===========================
		agentIdNumber: {
			type: String,
			unique: true,
			sparse: true,
			trim: true,
		},
		rating: {
			type: Number,
			default: 0,
			min: [0, 'Rating cannot be less than 0'],
			max: [5, 'Rating cannot be more than 5'],
		},
		totalReviews: {
			type: Number,
			default: 0,
			min: [0, 'Review count cannot be negative'],
		},		// ===========================
		// METADATA
		// ===========================
		lastLogin: {
			type: Date,
		},
	},
	{
		timestamps: true, // Adds createdAt and updatedAt
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

// ===========================
// INDEXES for performance optimization
// ===========================
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ verified: 1 });
userSchema.index({ createdAt: -1 });

// ===========================
// VIRTUAL PROPERTIES
// ===========================

/**
	* Check if user account is active
	*/
userSchema.virtual('isActive').get(function () {
	return this.status === 'active';
});

/**
	* Check if user is verified
	*/
userSchema.virtual('isVerified').get(function () {
	return this.verified === true;
});

// ===========================
// MIDDLEWARE (Pre/Post Hooks)
// ===========================

/**
	* Hash password before saving to database
	* Only runs if password is modified
	*/
userSchema.pre('save', async function (next) {
	// Skip if password hasn't been modified
	if (!this.isModified('password')) {
		return next();
	}

	try {
		const salt = await bcrypt.genSalt(10);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (error) {
		next(error);
	}
});

// ===========================
// INSTANCE METHODS
// ===========================

/**
	* Compare candidate password with hashed password in database
	* @param {string} candidatePassword - Plain text password to compare
	* @returns {Promise<boolean>} True if passwords match
	*/
userSchema.methods.comparePassword = async function (candidatePassword) {
	try {
		return await bcrypt.compare(candidatePassword, this.password);
	} catch (error) {
		throw new Error('Password comparison failed');
	}
};

/**
	* Generate email verification token
	* Token is hashed before storing in database
	* @returns {string} Unhashed token to send via email
	*/
userSchema.methods.generateVerificationToken = function () {
	const token = crypto.randomBytes(32).toString('hex');

	// Hash token before storing
	this.verificationToken = crypto
		.createHash('sha256')
		.update(token)
		.digest('hex');

	// Token expires in 24 hours
	this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;

	return token; // Return unhashed token to send via email
};

/**
	* Generate password reset token
	* Token is hashed before storing in database
	* @returns {string} Unhashed token to send via email
	*/
userSchema.methods.generateResetToken = function () {
	const token = crypto.randomBytes(32).toString('hex');

	// Hash token before storing
	this.resetPasswordToken = crypto
		.createHash('sha256')
		.update(token)
		.digest('hex');

	// Token expires in 1 hour
	this.resetPasswordExpires = Date.now() + 1 * 60 * 60 * 1000;

	return token; // Return unhashed token to send via email
};

/**
	* Get public profile data (excludes sensitive fields)
	* @returns {Object} Safe user data for public display
	*/
userSchema.methods.toPublicProfile = function () {
	const expYears = Number(this.yearsOfExperience) || 0;

	let accountYears = 0;
	if (this.createdAt instanceof Date && !Number.isNaN(this.createdAt.getTime())) {
		const now = new Date();
		accountYears = now.getFullYear() - this.createdAt.getFullYear();
		const monthDiff = now.getMonth() - this.createdAt.getMonth();
		if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < this.createdAt.getDate())) {
			accountYears -= 1;
		}
		if (accountYears < 0) accountYears = 0;
	}

	const yearsOfExperience = Math.max(expYears, accountYears);

	return {
		id: this._id,
		name: this.name,
		email: this.email,
		bio: this.bio,
		phone: this.phone,
		school: this.school,
		location: this.location,
		role: this.role,
		verified: this.verified,
		status: this.status,
		rating: this.rating,
		reviewCount: this.reviewCount,
		languages: this.languages,
		yearsOfExperience,
		createdAt: this.createdAt,
		lastLogin: this.lastLogin,
	};
};

/**
	* Update last login timestamp
	* @returns {Promise<User>} Updated user document
	*/
userSchema.methods.updateLastLogin = async function () {
	this.lastLogin = new Date();
	return await this.save({ validateBeforeSave: false });
};

// ===========================
// STATIC METHODS
// ===========================

/**
	* Find user by email and include password field
	* @param {string} email - User email address
	* @returns {Promise<User>} User document with password
	*/
userSchema.statics.findByEmail = function (email) {
	return this.findOne({ email }).select('+password');
};

/**
	* Find all active users by role
	* @param {string} role - User role (user, agent, admin)
	* @returns {Promise<Array>} Array of active users
	*/
userSchema.statics.findActiveByRole = function (role) {
	return this.find({ role, status: 'active' });
};

/**
	* Get user statistics
	* @returns {Promise<Object>} User statistics by role and status
	*/
userSchema.statics.getStats = async function () {
	const stats = await this.aggregate([
		{
			$group: {
				_id: { role: '$role', status: '$status' },
				count: { $sum: 1 },
			},
		},
	]);

	return stats;
};

// ===========================
// MODEL EXPORT
// ===========================
const User = mongoose.model('User', userSchema);

module.exports = User;
