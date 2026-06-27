/**
	* User Model
	* Handles user authentication and profile data for all roles
	* Roles: user (regular tenant/buyer), agent (property lister), admin (platform manager)
	*
	* MIGRATION NOTE (2026-06-26): Frontend (Next.js) API routes are being migrated
	* to this Express backend. New fields added below mirror the frontend User model
	* while keeping ALL existing fields intact for backward compatibility.
	* Field aliases (fullName→name, avatarUrl→avatar, globalRole→role) are handled
	* in a pre-save hook so both old and new code work seamlessly.
	*/

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Embedded sub-schemas (mirrors frontend User model's agentProfile structure)
// ---------------------------------------------------------------------------

const ProfessionalAgentProofSchema = new mongoose.Schema(
	{
		govIdType: { type: String, enum: ['nin', 'drivers_license', 'passport'] },
		govIdNumber: { type: String },
		govIdDocumentUrl: { type: String },
		cacNumber: { type: String },
		cacDocumentUrl: { type: String },
		proofOfAddressUrl: { type: String },
	},
	{ _id: false },
);

const StudentAgentProofSchema = new mongoose.Schema(
	{
		studentEmail: { type: String, lowercase: true, trim: true },
		studentEmailVerifiedAt: { type: Date },
		studentIdCardUrl: { type: String },
	},
	{ _id: false },
);

const AgentVerificationSubSchema = new mongoose.Schema(
	{
		status: {
			type: String,
			enum: ['unverified', 'pending', 'verified', 'rejected'],
			default: 'unverified',
		},
		submittedAt: { type: Date },
		reviewedAt: { type: Date },
		reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		rejectionReason: { type: String },
		professionalProof: { type: ProfessionalAgentProofSchema },
		studentProof: { type: StudentAgentProofSchema },
	},
	{ _id: false },
);

const PropertySubscriptionStateSubSchema = new mongoose.Schema(
	{
		plan: { type: String, enum: ['free', 'basic', 'pro', 'premium'], default: 'free' },
		status: {
			type: String,
			enum: ['trialing', 'in_grace_period', 'active', 'payment_issue', 'expired', 'canceled'],
			default: 'trialing',
		},
		trialStartedAt: { type: Date },
		trialEndsAt: { type: Date },
		gracePeriodEndsAt: { type: Date },
		currentPeriodStart: { type: Date },
		currentPeriodEnd: { type: Date },
		listingsUsedThisPeriod: { type: Number, default: 0, min: 0 },
		paystackSubscriptionCode: { type: String },
		paystackCustomerCode: { type: String },
		lastPaymentReference: { type: String },
	},
	{ _id: false },
);

const AgentProfileSubSchema = new mongoose.Schema(
	{
		subtype: { type: String, enum: ['professional', 'student'] },
		verification: { type: AgentVerificationSubSchema, default: () => ({}) },
		subscription: { type: PropertySubscriptionStateSubSchema },
		createdAt: { type: Date, default: () => new Date() },
	},
	{ _id: false },
);

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
		// Alias for `name` — used by migrated frontend code.
		// Pre-save hook copies fullName → name if name is empty.
		fullName: {
			type: String,
			trim: true,
			maxlength: [100, 'Full name cannot exceed 100 characters'],
		},
		username: {
			type: String,
			trim: true,
			lowercase: true,
			unique: true,
			sparse: true,
			maxlength: [50, 'Username cannot exceed 50 characters'],
			match: [/^[a-z0-9\-_.]+$/i, 'Username can only contain letters, numbers, hyphens, underscores and dots'],
			// index defined below via schema.index({ username: 1 }, { unique: true, sparse: true })
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
			// index defined below via schema.index({ email: 1 })
		},
		password: {
			type: String,
			// No longer `required: true` — Google OAuth users have no password.
			// Application-layer validation (Zod in routes) enforces this for email/password registrations.
			minlength: [6, 'Password must be at least 6 characters'],
			select: false,
		},
		passwordHash: {
			type: String,
			select: false,
		},
		avatar: {
			type: String,
			default: null,
		},
		// Alias for `avatar` — used by migrated frontend code.
		// Pre-save hook copies avatarUrl → avatar if avatar is empty.
		avatarUrl: {
			type: String,
		},

		// ===========================
		// GOOGLE OAUTH (migrated from frontend)
		// ===========================
		googleId: {
			type: String,
			sparse: true,
			unique: true,
			// index defined below via schema.index({ googleId: 1 }, { unique: true, sparse: true })
		},

		// ===========================
		// EMAIL VERIFICATION (migrated from frontend — Date instead of Boolean)
		// ===========================
		emailVerifiedAt: {
			type: Date,
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
		socialMedia: {
			whatsapp: {
				type: String
			},
			facebook: {
				type: String
			},
			instagram: {
				type: String
			},
			twitter: {
				type: String
			}
		},

		// Student-specific email for student agents (optional secondary email)
		studentEmail: {
			type: String,
			trim: true,
			lowercase: true,
		},
		yearsOfExperience: {
			type: String,
		},
		languages: {
			type: String,
		},
		specializations: {
			type: [String],
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
		adminRole: {
			type: String,
			enum: {
				values: ['basic', 'mid', 'super'],
				message: 'Admin role must be either basic, mid, or super',
			},
			default: null,
			// Only applicable when role is 'admin'
		},

		// Alias for `role` — used by migrated frontend code.
		// Pre-save hook copies globalRole → role if role is 'user' (default).
		// Frontend uses 'user'|'admin'; backend uses 'user'|'agent'|'admin'.
		globalRole: {
			type: String,
			enum: ['user', 'admin'],
			default: 'user',
		},

		// ===========================
		// AGENT PROFILE (migrated from frontend — embedded, not separate collection)
		// ===========================
		agentProfile: {
			type: AgentProfileSubSchema,
			default: undefined,
		},

		// ===========================
		// TOKEN VERSION (migrated from frontend — "log out everywhere" support)
		// ===========================
		refreshTokenVersion: {
			type: Number,
			default: 0,
			min: 0,
		},

		// ===========================
		// CAMPUS MARKET (migrated from frontend)
		// ===========================
		marketCreditBalance: {
			type: Number,
			default: 200, // MARKET_FREE_SIGNUP_CREDITS
			min: [0, 'Market credit balance cannot be negative'],
		},
		marketSellerTier: {
			type: String,
			enum: ['free', 'paid_basic'],
			default: 'free',
		},


		// ===========================
		// CREDITS SYSTEM
		// ===========================
		credits: {
			type: Number,
			default: 10, // Initial credits on registration
			min: [0, 'Credits cannot be negative'],
			// index defined below via schema.index({ credits: 1 })
		},
		totalCreditsEarned: {
			type: Number,
			default: 10, // Track total credits ever acquired (purchases + bonuses + initial)
			min: [0, 'Total credits earned cannot be negative'],
		},
		totalCreditsSpent: {
			type: Number,
			default: 0, // Track total credits spent on listings
			min: [0, 'Total credits spent cannot be negative'],
		},

		// ===========================
		// VERIFICATION & STATUS
		// ===========================

		// Email verification (for all users)
		emailVerified: {
			type: Boolean,
			default: false,
		},
		verificationToken: {
			type: String,
			select: false,
		},
		verificationTokenExpires: {
			type: Date,
			select: false,
		},
		otpCode: {
			type: String,
			select: false,
		},
		otpExpires: {
			type: Date,
			select: false,
		},

		// Agent verification (for agents only - after document submission)
		verified: {
			type: Boolean,
			default: false,
			// index defined below via schema.index({ verified: 1 })
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'suspended', 'banned'],
				message: 'Status must be either active, suspended, or banned',
			},
			default: 'active',
			// index defined below via schema.index({ status: 1 })
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
userSchema.index({ globalRole: 1 });
userSchema.index({ status: 1 });
userSchema.index({ verified: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ credits: 1 });
userSchema.index({ marketCreditBalance: 1 });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ username: 1 }, { unique: true, sparse: true });
userSchema.index({ 'agentProfile.subscription.trialEndsAt': 1 }, { sparse: true });
userSchema.index({ 'agentProfile.subscription.gracePeriodEndsAt': 1 }, { sparse: true });
userSchema.index({ 'agentProfile.verification.status': 1 }, { sparse: true });

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
	*
	* Also handles field-name aliases for migrated frontend code:
	*   fullName → name (if name is empty)
	*   avatarUrl → avatar (if avatar is empty)
	*   globalRole → role (if role is 'user' and globalRole is 'admin')
	*/
userSchema.pre('save', async function (next) {
	// --- Field-name aliases for migrated frontend code ---
	if (!this.name && this.fullName) {
		this.name = this.fullName;
	}
	if (!this.avatar && this.avatarUrl) {
		this.avatar = this.avatarUrl;
	}
	if (this.globalRole === 'admin' && this.role === 'user') {
		this.role = 'admin';
	}
	// Sync fullName/avatarUrl back from name/avatar so both fields stay consistent
	if (this.name && !this.fullName) {
		this.fullName = this.name;
	}
	if (this.avatar && !this.avatarUrl) {
		this.avatarUrl = this.avatar;
	}

	// Ensure username exists for public agent profiles
	try {
		if (!this.username && this.name) {
			const slugify = (s) =>
				s
					.toString()
					.toLowerCase()
					.trim()
					.replace(/[\s\_]+/g, '-')
					.replace(/[^a-z0-9\-\.\_]/g, '');

			let base = slugify(this.name).slice(0, 40) || `user-${Math.floor(Math.random() * 10000)}`;
			let candidate = base;
			// Ensure uniqueness (append random suffix on collision)
			let exists = await mongoose.models.User.findOne({ username: candidate }).exec();
			let attempts = 0;
			while (exists && attempts < 5) {
				candidate = `${base}-${Math.floor(Math.random() * 9000) + 1000}`;
				exists = await mongoose.models.User.findOne({ username: candidate }).exec();
				attempts++;
			}
			// If still exists after attempts, append timestamp
			if (exists) candidate = `${base}-${Date.now().toString().slice(-5)}`;
			this.username = candidate;
		}
	} catch (err) {
		// Non-fatal: continue to password hashing; username uniqueness will be enforced by DB index
		console.warn('Username generation error:', err && err.message);
	}

	// Hash password if it's been modified
	if (this.isModified('password')) {
		try {
			const salt = await bcrypt.genSalt(10);
			this.password = await bcrypt.hash(this.password, salt);
			this.passwordHash = this.password; // Sync the hashed password to passwordHash
			next();
		} catch (error) {
			next(error);
		}
	} else if (this.isModified('passwordHash')) {
		// If passwordHash was set directly, keep password in sync
		this.password = this.passwordHash;
		next();
	} else {
		// Sync fields if one is set but not the other
		if (this.password && !this.passwordHash) this.passwordHash = this.password;
		if (this.passwordHash && !this.password) this.password = this.passwordHash;
		next();
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
		const hash = this.password || this.passwordHash;
		if (!hash) return false;
		return await bcrypt.compare(candidatePassword, hash);
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
 * Generate 6-digit OTP code for email verification
 * @returns {string} Unhashed 6-digit OTP code to send via email
 */
userSchema.methods.generateOTP = function () {
	// Generate 6-digit random numeric string
	const otp = Math.floor(100000 + Math.random() * 900000).toString();

	// Hash OTP before storing
	this.otpCode = crypto
		.createHash('sha256')
		.update(otp)
		.digest('hex');

	// OTP expires in 10 minutes
	this.otpExpires = Date.now() + 10 * 60 * 1000;

	return otp;
};

/**
	* Generate student email verification token (for student agents)
	* @returns {string} unhashed token to send via email
	*/
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
		fullName: this.fullName || this.name,
		avatar: this.avatar,
		avatarUrl: this.avatarUrl || this.avatar,
		profile: this.avatar,
		profile_pics: this.avatar,
		profile_picture: this.avatar,
		username: this.username,
		agentIdNumber: this.agentIdNumber,
		email: this.email,
		emailVerified: this.emailVerified,
		emailVerifiedAt: this.emailVerifiedAt,
		bio: this.bio,
		phone: this.phone,
		school: this.school,
		location: this.location,
		role: this.role,
		globalRole: this.globalRole || (this.role === 'admin' ? 'admin' : 'user'),
		adminRole: this.adminRole,
		verified: this.verified,
		status: this.status,
		rating: this.rating,
		reviewCount: this.totalReviews,
		languages: this.languages,
		socialMedia: this.socialMedia,
		specializations: this.specializations,
		yearsOfExperience,
		credits: this.credits,
		marketCreditBalance: this.marketCreditBalance,
		marketSellerTier: this.marketSellerTier,
		agentProfile: this.agentProfile,
		googleId: this.googleId,
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

/**
 * Deduct credits from user account
 * @param {number} amount - Credits to deduct
 * @param {string} description - Transaction description
 * @param {Object} metadata - Additional transaction data
 * @returns {Promise<Object>} Transaction result
 */
userSchema.methods.deductCredits = async function (amount, description, metadata = {}) {
	if (this.credits < amount) {
		throw new Error('Insufficient credits');
	}

	const balanceBefore = this.credits;
	this.credits -= amount;
	this.totalCreditsSpent += amount;
	const balanceAfter = this.credits;

	await this.save();

	// Create transaction record
	const CreditTransaction = require('./CreditTransaction');
	const transaction = await CreditTransaction.create({
		user: this._id,
		type: 'deduction',
		amount: -amount,
		balanceBefore,
		balanceAfter,
		description,
		...metadata,
	});

	return { success: true, balance: balanceAfter, transaction };
};

/**
 * Add credits to user account
 * @param {number} amount - Credits to add
 * @param {string} type - Transaction type (purchase, bonus, refund)
 * @param {string} description - Transaction description
 * @param {Object} metadata - Additional transaction data
 * @returns {Promise<Object>} Transaction result
 */
userSchema.methods.addCredits = async function (amount, type = 'purchase', description, metadata = {}) {
	const balanceBefore = this.credits;
	this.credits += amount;
	if (type === 'purchase' || type === 'bonus') {
		this.totalCreditsEarned += amount;
	}
	const balanceAfter = this.credits;

	await this.save();

	// Create transaction record
	const CreditTransaction = require('./CreditTransaction');
	const transaction = await CreditTransaction.create({
		user: this._id,
		type,
		amount,
		balanceBefore,
		balanceAfter,
		description,
		...metadata,
	});

	return { success: true, balance: balanceAfter, transaction };
};// ===========================
// STATIC METHODS
// ===========================

/**
	* Find user by email and include password field
	* @param {string} email - User email address
	* @returns {Promise<User>} User document with password
	*/
userSchema.statics.findByEmail = function (email) {
	return this.findOne({ email }).select('+password +passwordHash');
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
	* Check if user has sufficient credits
	* @param {number} requiredCredits - Credits needed
	* @returns {boolean} True if user has enough credits
	*/
userSchema.methods.hasCredits = function (requiredCredits) {
	return this.credits >= requiredCredits;
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
