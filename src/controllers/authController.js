/**
	* Authentication Controller
	* Handles user registration, login, and authentication operations
	*/

const { isInValiData, isNotValidata } = require('validata-jsts');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { validateRegistration, validateLogin, sanitizeInput, isValidPhone } = require('../utils/validators');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

/**
	* @route   POST /api/auth/register
	* @desc    Register a new user
	* @access  Public
	*/
const register = async (req, res) => {
	try {
		const { school, name, email, password, phone, role, location, studentEmail, agentType } = req.body;

		const validationErr = isInValiData(['school-string-max40', 'name-string-min3',
			"email-email", "password-pwd", "phone-string-min9"], req.body)
		if (validationErr) {
			return res.status(400).json({
				status: 'error',
				message: validationErr,
				errors: validationErr,
			});
		}

		const existingUser = await User.findOne({ email: email.toLowerCase() });
		if (existingUser) {
			return res.status(409).json({
				status: 'error',
				message: 'User with this email already exists',
			});
		}

		// Sanitize inputs
		const sanitizedName = sanitizeInput(name);

		// Create new user
		const user = new User({
			school,
			name: sanitizedName,
			email: email.toLowerCase(),
			password,
			phone: phone || '0000000000',
			role: role || 'user',
			location,
		});

		// If registering as student agent, record studentEmail and send student verification
		let studentToken = null;
		if (role === 'agent' && agentType === 'student' && studentEmail) {
			user.studentEmail = studentEmail.toLowerCase();
			studentToken = user.generateStudentVerificationToken();
		}

		// Generate account verification token
		const verificationToken = user.generateVerificationToken();

		// Save user
		await user.save();

		// Send verification emails
		try {
			await sendVerificationEmail(user.email, user.name, verificationToken);
		} catch (emailError) {
			console.error('Failed to send verification email:', emailError);
		}

		if (studentToken) {
			try {
				await sendVerificationEmail(user.studentEmail, user.name, studentToken);
			} catch (emailError) {
				console.error('Failed to send student verification email:', emailError);
			}
		}

		// Generate JWT token
		const token = generateToken(user);

		// Return response without password
		res.status(201).json({
			status: 'success',
			message: 'Registration successful. Please verify your email.',
			data: {
				user: user.toPublicProfile(),
				token,
			},
		});
	} catch (error) {
		console.error('Registration error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Registration failed | Please check your network and try again',
			error: error.message,
		});
	}
};

/**
	* @route   POST /api/auth/login
	* @desc    Login user and return JWT token
	* @access  Public
	*/
const login = async (req, res) => {
	try {
		const { email, password } = req.body;

		// Validate input
		const validationErr = isNotValidata(["email-email", "password-pwd"], { email, password });
		if (validationErr) {
			return res.status(400).json({
				status: 'error',
				message: 'Validation failed',
				errors: validationErr,
			});
		}


		// Find user with password field
		const user = await User.findByEmail(email.toLowerCase());
		console.log(user)
		if (!user) {
			return res.status(401).json({
				status: 'error',
				message: 'Invalid email or password',
			});
		}

		console.log(user)

		// Check if account is active
		if (user.status !== 'active') {
			return res.status(403).json({
				status: 'error',
				message: `Account is ${user.status}. Please contact support.`,
			});
		}

		// Compare password
		const isPasswordValid = await user.comparePassword(password);
		console.log(isPasswordValid)
		if (!isPasswordValid) {
			return res.status(401).json({
				status: 'error',
				message: 'Invalid email or password',
			});
		}

		// Update last login
		user.lastLogin = new Date();
		await user.save();

		// Generate JWT token
		const token = generateToken(user);

		// Return response
		res.status(200).json({
			status: 'success',
			message: 'Login successful',
			data: {
				user: user.toPublicProfile(),
				token,
			},
		});
	} catch (error) {
		console.error('Login error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Login failed',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/auth/me
	* @desc    Get current user profile
	* @access  Private
	*/
const getMe = async (req, res) => {
	try {
		// req.user is set by auth middleware
		const user = await User.findById(req.user._id);

		if (!user) {
			return res.status(404).json({
				status: 'error',
				message: 'User not found',
			});
		}

		res.status(200).json({
			status: 'success',
			data: {
				user: user.toPublicProfile(),
			},
		});
	} catch (error) {
		console.error('Get me error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch user data',
			error: error.message,
		});
	}
};

/**
	* @route   GET /api/auth/users/:id
	* @desc    Get user by ID
	* @access  Public
	*/
const getUserById = async (req, res) => {
	try {
		const user = await User.findById(req.params.id).select('-password');

		if (!user) {
			return res.status(404).json({ status: 'error', message: 'User not found' });
		}
		res.json({ status: 'success', data: user.toPublicProfile() });
	} catch (err) {
		res.status(500).json({ status: 'error', message: 'Failed to fetch user', error: err.message });
	}
};

/**
	* @route   PUT /api/auth/me
	* @desc    Update current user's profile (name, phone, school, location)
	* @access  Private
	*/
const updateProfile = async (req, res) => {
	try {
		const userId = req.user && req.user._id;
		if (!userId) {
			return res.status(401).json({ status: 'error', message: 'Unauthorized' });
		}

		const allowedFields = ['name', 'phone', 'school', 'location', 'languages', 'socialMedia'];
		const updates = {};

		console.log(req.body)
		// Pick only allowed fields and sanitize
		for (const key of allowedFields) {
			if (Object.prototype.hasOwnProperty.call(req.body, key)) {
				const val = req.body[key];
				updates[key] = typeof val === 'string' ? sanitizeInput(val) : val;
			}
		}

		// Basic validation
		if (updates.name) {
			if (updates.name.length < 2) {
				return res.status(400).json({ status: 'error', message: 'Name must be at least 2 characters' });
			}
			if (updates.name.length > 100) {
				return res.status(400).json({ status: 'error', message: 'Name cannot exceed 100 characters' });
			}
		}

		if (updates.phone && !isValidPhone(updates.phone)) {
			return res.status(400).json({ status: 'error', message: 'Invalid phone number format' });
		}

		if (updates.school && updates.school.length > 100) {
			return res.status(400).json({ status: 'error', message: 'School name cannot exceed 100 characters' });
		}

		// Prevent changing email, role or password via this route
		// Apply updates
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ status: 'error', message: 'User not found' });
		}

		for (const [k, v] of Object.entries(updates)) {
			user[k] = v;
			console.log(user[k])
		}

		console.log({ updates })
		console.log(user)

		await user.save();

		console.log(user.toPublicProfile())

		res.status(200).json({ status: 'success', message: 'Profile updated', data: { user: user.toPublicProfile() } });
	} catch (error) {
		console.error('Update profile error:', error);
		res.status(500).json({ status: 'error', message: 'Failed to update profile', error: error.message });
	}
};

/**
	* @route   POST /api/auth/logout
	* @desc    Logout user (client-side token removal)
	* @access  Private
	*/
const logout = async (req, res) => {
	try {
		// In a stateless JWT system, logout is handled client-side
		// Here we can log the action or invalidate refresh tokens if implemented

		res.status(200).json({
			status: 'success',
			message: 'Logged out successfully',
		});
	} catch (error) {
		console.error('Logout error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Logout failed',
			error: error.message,
		});
	}
};

/**
	* @route   POST /api/auth/verify-email
	* @desc    Verify user email with token
	* @access  Public
	*/
const verifyEmail = async (req, res) => {
	try {
		const { token } = req.body;

		if (!token) {
			return res.status(400).json({
				status: 'error',
				message: 'Verification token is required',
			});
		}

		// Hash the token to compare with stored hash
		const crypto = require('crypto');
		const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

		// Try to find account verification token first
		let user = await User.findOne({
			verificationToken: hashedToken,
			verificationTokenExpires: { $gt: Date.now() },
		}).select('+verificationToken +verificationTokenExpires');

		if (user) {
			user.verified = true;
			user.verificationToken = undefined;
			user.verificationTokenExpires = undefined;
			await user.save();

			return res.status(200).json({ status: 'success', message: 'Email verified successfully' });
		}

		// Otherwise check for student email verification
		user = await User.findOne({
			studentVerificationToken: hashedToken,
			studentVerificationTokenExpires: { $gt: Date.now() },
		}).select('+studentVerificationToken +studentVerificationTokenExpires');

		if (!user) {
			return res.status(400).json({ status: 'error', message: 'Invalid or expired verification token' });
		}

		user.studentEmailVerified = true;
		user.studentVerificationToken = undefined;
		user.studentVerificationTokenExpires = undefined;
		await user.save();

		res.status(200).json({ status: 'success', message: 'Student email verified successfully' });
	} catch (error) {
		console.error('Email verification error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Email verification failed',
			error: error.message,
		});
	}
};

/**
	* @route   POST /api/auth/request-reset
	* @desc    Request password reset token
	* @access  Public
	*/
const requestPasswordReset = async (req, res) => {
	try {
		const { email } = req.body;

		if (!email) {
			return res.status(400).json({
				status: 'error',
				message: 'Email is required',
			});
		}

		const user = await User.findOne({ email: email.toLowerCase() });

		// Always return success to prevent email enumeration
		if (!user) {
			return res.status(200).json({
				status: 'success',
				message: 'If the email exists, a reset link has been sent',
			});
		}

		// Generate reset token
		const resetToken = user.generateResetToken();
		await user.save();

		// TODO: Send reset email
		await sendPasswordResetEmail(user.email, resetToken);

		res.status(200).json({
			status: 'success',
			message: 'If the email exists, a reset link has been sent',
		});
	} catch (error) {
		console.error('Password reset request error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to process password reset request',
			error: error.message,
		});
	}
};

/**
	* @route   POST /api/auth/reset-password
	* @desc    Reset password with token
	* @access  Public
	*/
const resetPassword = async (req, res) => {
	try {
		const { token, newPassword } = req.body;

		if (!token || !newPassword) {
			return res.status(400).json({
				status: 'error',
				message: 'Token and new password are required',
			});
		}

		// Validate password
		const { validatePassword } = require('../utils/validators');
		const passwordCheck = validatePassword(newPassword);
		if (!passwordCheck.isValid) {
			return res.status(400).json({
				status: 'error',
				message: passwordCheck.message,
			});
		}

		// Hash token to compare
		const crypto = require('crypto');
		const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

		// Find user with matching token that hasn't expired
		const user = await User.findOne({
			resetPasswordToken: hashedToken,
			resetPasswordExpires: { $gt: Date.now() },
		}).select('+resetPasswordToken +resetPasswordExpires');

		if (!user) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid or expired reset token',
			});
		}

		// Update password
		user.password = newPassword; // Will be hashed by pre-save hook
		user.resetPasswordToken = undefined;
		user.resetPasswordExpires = undefined;
		await user.save();

		res.status(200).json({
			status: 'success',
			message: 'Password reset successfully',
		});
	} catch (error) {
		console.error('Password reset error:', error);
		res.status(500).json({
			status: 'error',
			message: 'Password reset failed',
			error: error.message,
		});
	}
};

module.exports = {
	register,
	login,
	getMe,
	logout,
	verifyEmail,
	getUserById,
	requestPasswordReset,
	resetPassword,
	updateProfile,
};
